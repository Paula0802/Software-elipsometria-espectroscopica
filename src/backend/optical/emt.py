"""
Teoría del Medio Efectivo (Effective Medium Theory - EMT)
Versión mejorada con Newton-Raphson robusto para Bruggeman y Maxwell-Garnett
"""
import numpy as np
import logging
from .conversions import nk_to_epsilon, epsilon_to_nk
from .dispersion_models import get_nk_from_model

logger = logging.getLogger(__name__)


# ==========================================
# CONFIGURACIÓN NEWTON-RAPHSON
# ==========================================

class EMTConfig:
    """Configuración para el solver Newton-Raphson"""
    TOLERANCE = 1e-8          # |f(ε)| < TOLERANCE
    DELTA_CHANGE = 1e-8       # |ε_{n+1} - ε_n| < DELTA_CHANGE
    MAX_ITERATIONS = 50       # Límite de seguridad


def bruggeman_emt(components, wavelengths):
    """
    Aproximación de Bruggeman para medio efectivo usando Newton-Raphson
    
    MODELO:
    - Mezcla simétrica de materiales (no existe host)
    - Inclusiones pequeñas respecto a λ
    - Material efectivo isótropo
    - Válido para altas fracciones volumétricas
    
    La ecuación de Bruggeman es:
    Σⱼ fⱼ · (εⱼ - ε_eff) / (εⱼ + 2·ε_eff) = 0
    
    Args:
        components: Lista de diccionarios con {fraction, n, k} para cada componente
        wavelengths: Array de longitudes de onda en nm
    
    Returns:
        n_eff, k_eff: Índice de refracción efectivo complejo
    """
    wavelengths = np.asarray(wavelengths, dtype=float)
    n_points = len(wavelengths)
    
    # Inicializar arrays para n_eff y k_eff
    n_eff_array = np.zeros(n_points)
    k_eff_array = np.zeros(n_points)
    
    # Para cada longitud de onda
    for i, wl in enumerate(wavelengths):
        try:
            # Resolver ecuación de Bruggeman con Newton-Raphson
            result = _solve_bruggeman_newton(components, i)
            
            if result['success']:
                n_eff_array[i] = result['n_eff']
                k_eff_array[i] = result['k_eff']
            else:
                # Fallback a método iterativo original si Newton-Raphson falla
                logger.warning(f"Newton-Raphson falló en λ={wl}nm: {result.get('error')}. Usando método iterativo.")
                epsilon_eff = _solve_bruggeman_iterative(components, i)
                eps_real = np.real(epsilon_eff)
                eps_imag = np.imag(epsilon_eff)
                n, k = epsilon_to_nk(eps_real, eps_imag)
                n_eff_array[i] = n
                k_eff_array[i] = k
                
        except Exception as e:
            logger.error(f"Error en EMT Bruggeman en λ={wl}nm: {e}")
            # Usar promedio ponderado como fallback
            n_avg, k_avg = _weighted_average_fallback(components, i)
            n_eff_array[i] = n_avg
            k_eff_array[i] = k_avg
    
    return n_eff_array, k_eff_array


def _solve_bruggeman_newton(components, wl_index):
    """
    Resuelve la ecuación de Bruggeman usando Newton-Raphson
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wl_index: Índice de la longitud de onda actual (int)
    
    Returns:
        Dict con: {
            'success': bool,
            'n_eff': float,
            'k_eff': float,
            'iterations': int,
            'error': str (opcional)
        }
    """
    # 1. Validar suma de fracciones
    total_fraction = sum(comp['fraction'] for comp in components)
    if abs(total_fraction - 1.0) > 0.01:
        return {
            'success': False,
            'error': f'Suma de fracciones = {total_fraction:.3f} ≠ 1.0',
            'iterations': 0
        }
    
    # 2. Obtener permitividades de cada componente
    permittivities = []
    
    for comp in components:
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        # Obtener valor en el índice correcto
        if isinstance(n, (list, np.ndarray)):
            n_val = float(n[wl_index])
            k_val = float(k[wl_index])
        else:
            n_val = float(n)
            k_val = float(k)
        
        eps_real, eps_imag = nk_to_epsilon(n_val, k_val)
        
        permittivities.append({
            'fraction': fraction,
            'epsilon_real': float(eps_real),
            'epsilon_imag': float(eps_imag)
        })
    
    # 3. Valor inicial: promedio ponderado
    eps_init_real = sum(p['fraction'] * p['epsilon_real'] for p in permittivities)
    eps_init_imag = sum(p['fraction'] * p['epsilon_imag'] for p in permittivities)
    
    eps_real = eps_init_real
    eps_imag = eps_init_imag
    
    # 4. Iterar Newton-Raphson
    for iteration in range(EMTConfig.MAX_ITERATIONS):
        f_real = 0.0
        f_imag = 0.0
        df_real = 0.0
        df_imag = 0.0
        
        # Calcular f(ε) y f'(ε)
        for p in permittivities:
            ei_r = p['epsilon_real']
            ei_i = p['epsilon_imag']
            f_i = p['fraction']
            
            # Numerador: εᵢ - ε
            num_r = ei_r - eps_real
            num_i = ei_i - eps_imag
            
            # Denominador: εᵢ + 2ε
            den_r = ei_r + 2.0 * eps_real
            den_i = ei_i + 2.0 * eps_imag
            
            # División compleja: (num_r + i*num_i) / (den_r + i*den_i)
            den_mag_sq = den_r**2 + den_i**2
            
            if den_mag_sq < 1e-20:
                return {
                    'success': False,
                    'error': 'Denominador muy pequeño en Bruggeman',
                    'iterations': iteration
                }
            
            term_r = (num_r * den_r + num_i * den_i) / den_mag_sq
            term_i = (num_i * den_r - num_r * den_i) / den_mag_sq
            
            f_real += f_i * term_r
            f_imag += f_i * term_i
            
            # Derivada: df/dε = -fᵢ · (2εᵢ + ε) / (εᵢ + 2ε)²
            num2_r = -(2.0 * ei_r + eps_real)
            num2_i = -(2.0 * ei_i + eps_imag)
            
            den_sq_mag = den_mag_sq ** 2
            
            dterm_r = (num2_r * den_r + num2_i * den_i) / den_sq_mag
            dterm_i = (num2_i * den_r - num2_r * den_i) / den_sq_mag
            
            df_real += f_i * dterm_r
            df_imag += f_i * dterm_i
        
        # Verificar convergencia
        f_magnitude = np.sqrt(f_real**2 + f_imag**2)
        
        if f_magnitude < EMTConfig.TOLERANCE:
            # Convertir ε → n, k
            eps_magnitude = np.sqrt(eps_real**2 + eps_imag**2)
            n_eff = np.sqrt((eps_magnitude + eps_real) / 2.0)
            k_eff = np.sqrt((eps_magnitude - eps_real) / 2.0)
            
            return {
                'success': True,
                'n_eff': float(n_eff),
                'k_eff': float(k_eff),
                'iterations': iteration + 1,
                'epsilon_eff': {'real': float(eps_real), 'imag': float(eps_imag)}
            }
        
        # Actualizar ε usando Newton: ε_new = ε_old - f / f'
        df_mag_sq = df_real**2 + df_imag**2
        
        if df_mag_sq < 1e-20:
            return {
                'success': False,
                'error': 'Derivada muy pequeña, no converge',
                'iterations': iteration + 1
            }
        
        # División compleja: -f / df
        delta_eps_r = -(f_real * df_real + f_imag * df_imag) / df_mag_sq
        delta_eps_i = -(f_imag * df_real - f_real * df_imag) / df_mag_sq
        
        eps_real += delta_eps_r
        eps_imag += delta_eps_i
        
        # Verificar cambio pequeño
        delta_magnitude = np.sqrt(delta_eps_r**2 + delta_eps_i**2)
        if delta_magnitude < EMTConfig.DELTA_CHANGE:
            eps_magnitude = np.sqrt(eps_real**2 + eps_imag**2)
            n_eff = np.sqrt((eps_magnitude + eps_real) / 2.0)
            k_eff = np.sqrt((eps_magnitude - eps_real) / 2.0)
            
            return {
                'success': True,
                'n_eff': float(n_eff),
                'k_eff': float(k_eff),
                'iterations': iteration + 1,
                'epsilon_eff': {'real': float(eps_real), 'imag': float(eps_imag)}
            }
    
    # No convergió
    return {
        'success': False,
        'error': f'No convergió en {EMTConfig.MAX_ITERATIONS} iteraciones',
        'iterations': EMTConfig.MAX_ITERATIONS
    }


def _solve_bruggeman_iterative(components, wl_index):
    """
    Resuelve la ecuación de Bruggeman usando el método iterativo original
    (Fallback cuando Newton-Raphson falla)
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wl_index: Índice de la longitud de onda actual (int)
    
    Returns:
        epsilon_eff: Permitividad efectiva (número complejo)
    """
    # Obtener permitividades de cada componente
    epsilons = []
    fractions = []
    
    for comp in components:
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        # Obtener valor en el índice correcto
        if isinstance(n, (list, np.ndarray)):
            n_val = float(n[wl_index])
            k_val = float(k[wl_index])
        else:
            n_val = float(n)
            k_val = float(k)
        
        eps_real, eps_imag = nk_to_epsilon(n_val, k_val)
        epsilon = eps_real + 1j * eps_imag
        
        epsilons.append(epsilon)
        fractions.append(fraction)
    
    # Estimación inicial: promedio ponderado
    epsilon_eff = sum(f * eps for f, eps in zip(fractions, epsilons))
    
    # Iteración de punto fijo
    max_iter = 100
    tolerance = 1e-6
    
    for iteration in range(max_iter):
        # Calcular nuevo ε_eff usando ecuación de Bruggeman
        numerator = 0
        denominator = 0
        
        for f, eps in zip(fractions, epsilons):
            numerator += f * eps * (1 + 2 * epsilon_eff)
            denominator += f * (1 + 2 * epsilon_eff) - f * (eps - epsilon_eff)
        
        epsilon_new = numerator / denominator if abs(denominator) > 1e-10 else epsilon_eff
        
        # Verificar convergencia
        if abs(epsilon_new - epsilon_eff) < tolerance:
            break
        
        epsilon_eff = epsilon_new
    
    return epsilon_eff


def _weighted_average_fallback(components, wl_index):
    """
    Calcula promedio ponderado simple como último recurso
    
    Args:
        components: Lista de componentes
        wl_index: Índice de la longitud de onda actual (int)
    
    Returns:
        n_avg, k_avg: Promedio ponderado de n y k
    """
    n_avg = 0.0
    k_avg = 0.0
    
    for comp in components:
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        # Obtener valor en el índice correcto
        if isinstance(n, (list, np.ndarray)):
            n_val = float(n[wl_index])
            k_val = float(k[wl_index])
        else:
            n_val = float(n)
            k_val = float(k)
        
        n_avg += fraction * n_val
        k_avg += fraction * k_val
    
    return n_avg, k_avg


def maxwell_garnett_emt(components, wavelengths, host_index=0):
    """
    Aproximación de Maxwell-Garnett para medio efectivo
    
    MODELO:
    - Material heterogéneo: matriz continua (host) + inclusiones esféricas
    - Inclusiones pequeñas respecto a λ, no interactúan entre sí
    - Fracción volumétrica de inclusiones baja (≤ 30%)
    - Medio efectivo isótropo
    
    ECUACIÓN:
    ε_eff = ε_host · (1 + 2S) / (1 - S)
    donde S = Σ_j f_j * A_j
    y A_j = (ε_j - ε_host) / (ε_j + 2*ε_host)
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wavelengths: Array de longitudes de onda
        host_index: Índice del componente que actúa como matriz (default: 0)
    
    Returns:
        n_eff, k_eff: Índice de refracción efectivo
    """
    wavelengths = np.asarray(wavelengths, dtype=float)
    n_points = len(wavelengths)
    
    n_eff_array = np.zeros(n_points)
    k_eff_array = np.zeros(n_points)
    
    # Para cada longitud de onda
    for i, wl in enumerate(wavelengths):
        epsilon_eff = _solve_maxwell_garnett(components, i, host_index)
        
        epsilon_real = np.real(epsilon_eff)
        epsilon_imag = np.imag(epsilon_eff)
        
        n, k = epsilon_to_nk(epsilon_real, epsilon_imag)
        
        n_eff_array[i] = n
        k_eff_array[i] = k
    
    return n_eff_array, k_eff_array


def _solve_maxwell_garnett(components, wl_index, host_index):
    """
    Calcula permitividad efectiva usando Maxwell-Garnett
    
    MODELO:
    - Material heterogéneo: matriz continua (host) + inclusiones esféricas
    - Inclusiones pequeñas respecto a λ, no interactúan entre sí
    - Fracción volumétrica de inclusiones baja (≤ 30%)
    
    ECUACIÓN:
    ε_eff = ε_host * (1 + 2S) / (1 - S)
    donde S = Σ_j f_j * A_j
    y A_j = (ε_j - ε_host) / (ε_j + 2*ε_host)
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wl_index: Índice de la longitud de onda actual (int)
        host_index: Índice del componente que actúa como matriz
    
    Returns:
        epsilon_eff: Permitividad efectiva compleja
    """
    # PASO 1: Obtener permitividad del host (matriz)
    host = components[host_index]
    n_host = host['n']
    k_host = host['k']
    
    # Obtener valor en el índice correcto
    if isinstance(n_host, (list, np.ndarray)):
        n_host = float(n_host[wl_index])
        k_host = float(k_host[wl_index])
    else:
        n_host = float(n_host)
        k_host = float(k_host)
    
    eps_host_real, eps_host_imag = nk_to_epsilon(n_host, k_host)
    epsilon_host = eps_host_real + 1j * eps_host_imag
    
    # PASO 2: Validar restricciones físicas
    total_inclusion_fraction = 0.0
    
    for idx, comp in enumerate(components):
        if idx != host_index:
            total_inclusion_fraction += comp['fraction']
    
    # Validación: suma de fracciones de inclusiones debe ser < 1
    if total_inclusion_fraction >= 1.0:
        logger.warning(
            f"Maxwell-Garnett: suma de fracciones de inclusiones = {total_inclusion_fraction:.3f} >= 1.0. "
            "El modelo requiere Σf_j < 1"
        )
    
    # Advertencia si fracciones son altas
    if total_inclusion_fraction > 0.4:
        logger.warning(
            f"Maxwell-Garnett: fracción total de inclusiones = {total_inclusion_fraction:.1%}. "
            "El modelo es más preciso para fracciones ≤ 30-40%"
        )
    
    # PASO 3-4: Calcular polarizabilidades A_j y suma S
    S = 0.0 + 0.0j  # Número complejo
    
    for idx, comp in enumerate(components):
        if idx == host_index:
            continue  # Saltar el host
        
        # Obtener n, k de la inclusión
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        # Obtener valor en el índice correcto
        if isinstance(n, (list, np.ndarray)):
            n = float(n[wl_index])
            k = float(k[wl_index])
        else:
            n = float(n)
            k = float(k)
        
        # Convertir a permitividad
        eps_real, eps_imag = nk_to_epsilon(n, k)
        epsilon_j = eps_real + 1j * eps_imag
        
        # PASO 3: Polarizabilidad A_j = (ε_j - ε_host) / (ε_j + 2*ε_host)
        numerator = epsilon_j - epsilon_host
        denominator = epsilon_j + 2.0 * epsilon_host
        
        if abs(denominator) < 1e-10:
            logger.warning(
                f"Maxwell-Garnett: denominador muy pequeño para inclusión {idx}. "
                f"ε_j ≈ -2*ε_host causa singularidad"
            )
            continue
        
        A_j = numerator / denominator
        
        # PASO 4: Acumular S = Σ f_j * A_j
        S += fraction * A_j
    
    # PASO 5: Permitividad efectiva ε_eff = ε_host * (1 + 2S) / (1 - S)
    numerator_eff = 1.0 + 2.0 * S
    denominator_eff = 1.0 - S
    
    if abs(denominator_eff) < 1e-10:
        logger.error(
            "Maxwell-Garnett: denominador (1 - S) muy pequeño. "
            "Posible inestabilidad numérica con estas fracciones"
        )
        # Fallback: retornar epsilon_host
        return epsilon_host
    
    epsilon_eff = epsilon_host * (numerator_eff / denominator_eff)
    
    return epsilon_eff


def calculate_effective_medium(layer_data, wavelengths):
    """
    Función principal para calcular medio efectivo según el modelo EMT
    
    Args:
        layer_data: Diccionario con información de la capa:
            {
                'emt_model': 'bruggeman' o 'maxwell-garnett',
                'components': [
                    {
                        'name': 'SiO2',
                        'fraction': 0.7,
                        'model': 'cauchy',
                        'params': {'A': 1.45, 'B': 0.003, 'C': 0},
                        'n': array or scalar,
                        'k': array or scalar
                    },
                    ...
                ],
                'host_index': 0  # Solo para Maxwell-Garnett (opcional, default=0)
            }
        wavelengths: Array de longitudes de onda en nm
    
    Returns:
        n_eff, k_eff: Índice de refracción efectivo para cada longitud de onda
    """
    emt_model = layer_data.get('emt_model', 'bruggeman')
    components = layer_data['components']
    
    # Preparar componentes: calcular n, k para cada λ si es necesario
    prepared_components = []
    
    for comp in components:
        comp_data = {
            'fraction': comp['fraction'],
            'name': comp.get('name', 'Unknown')
        }
        
        # ✅ CORRECCIÓN: Si es de archivo, interpolar
        if comp.get('model') in ['file_nk', 'file_epsilon']:
            if 'optical_data' not in comp:
                raise ValueError(f"Componente '{comp.get('name')}' sin optical_data")
            
            opt_data = comp['optical_data']
            
            # ⭐ CONVERSIÓN EXPLÍCITA A FLOAT
            wavelength_data = np.array(opt_data['wavelength'], dtype=float)
            n_data = np.array(opt_data['n'], dtype=float)
            k_data = np.array(opt_data['k'], dtype=float)
            
            comp_data['n'] = np.interp(
                wavelengths,
                wavelength_data,
                n_data
            )
            comp_data['k'] = np.interp(
                wavelengths,
                wavelength_data,
                k_data
            )
        
        # Si ya tiene n, k como datos de archivo (legacy)
        elif 'optical_data' in comp:
            opt_data = comp['optical_data']
            
            # ⭐ CONVERSIÓN EXPLÍCITA A FLOAT
            wavelength_data = np.array(opt_data['wavelength'], dtype=float)
            n_data = np.array(opt_data['n'], dtype=float)
            k_data = np.array(opt_data['k'], dtype=float)
            
            comp_data['n'] = np.interp(
                wavelengths,
                wavelength_data,
                n_data
            )
            comp_data['k'] = np.interp(
                wavelengths,
                wavelength_data,
                k_data
            )
        
        # Si tiene modelo de dispersión
        elif 'model' in comp and 'params' in comp:
            n, k = get_nk_from_model(
                comp['model'],
                wavelengths,
                comp['params']
            )
            comp_data['n'] = n
            comp_data['k'] = k
        
        # Si ya tiene n, k directos
        elif 'n' in comp:
            comp_data['n'] = comp['n']
            comp_data['k'] = comp.get('k', 0)
        
        else:
            raise ValueError(f"Componente {comp.get('name')} no tiene datos ópticos válidos")
        
        prepared_components.append(comp_data)
    
    # Aplicar modelo EMT
    if emt_model == 'bruggeman':
        n_eff, k_eff = bruggeman_emt(prepared_components, wavelengths)
        
    elif emt_model == 'maxwell-garnett':
        # Obtener índice del host (matriz)
        host_index = layer_data.get('host_index', 0)
        
        # VALIDACIÓN: verificar que host_index es válido
        if host_index >= len(prepared_components):
            raise ValueError(
                f"host_index={host_index} inválido. "
                f"Solo hay {len(prepared_components)} componentes (índices 0-{len(prepared_components)-1})"
            )
        
        if host_index < 0:
            raise ValueError(
                f"host_index={host_index} debe ser >= 0"
            )
        
        # Log informativo sobre qué componente es el host
        host_name = prepared_components[host_index]['name']
        logger.info(
            f"Maxwell-Garnett: usando '{host_name}' (índice {host_index}) como matriz (host)"
        )
        
        # Validar que hay al menos un componente adicional (inclusión)
        if len(prepared_components) < 2:
            raise ValueError(
                "Maxwell-Garnett requiere al menos 2 componentes: "
                "1 matriz (host) + 1 o más inclusiones"
            )
        
        # Calcular con Maxwell-Garnett
        n_eff, k_eff = maxwell_garnett_emt(
            prepared_components, 
            wavelengths, 
            host_index=host_index
        )
        
    else:
        raise ValueError(f"Modelo EMT no reconocido: {emt_model}")
    
    return n_eff, k_eff