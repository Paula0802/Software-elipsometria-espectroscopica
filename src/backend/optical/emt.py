"""
Teoría del Medio Efectivo (Effective Medium Theory - EMT)
Versión mejorada con Newton-Raphson robusto para Bruggeman y Maxwell-Garnett
"""
import numpy as np
import logging
from .conversions import nk_to_epsilon, epsilon_to_nk
from .dispersion_models import get_refractive_index

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
            result = _solve_bruggeman_newton(components, wl)
            
            if result['success']:
                n_eff_array[i] = result['n_eff']
                k_eff_array[i] = result['k_eff']
            else:
                # Fallback a método iterativo original si Newton-Raphson falla
                logger.warning(f"Newton-Raphson falló en λ={wl}nm: {result.get('error')}. Usando método iterativo.")
                epsilon_eff = _solve_bruggeman_iterative(components, wl)
                eps_real = np.real(epsilon_eff)
                eps_imag = np.imag(epsilon_eff)
                n, k = epsilon_to_nk(eps_real, eps_imag)
                n_eff_array[i] = n
                k_eff_array[i] = k
                
        except Exception as e:
            logger.error(f"Error en EMT Bruggeman en λ={wl}nm: {e}")
            # Usar promedio ponderado como fallback
            n_avg, k_avg = _weighted_average_fallback(components, wl)
            n_eff_array[i] = n_avg
            k_eff_array[i] = k_avg
    
    return n_eff_array, k_eff_array


def _solve_bruggeman_newton(components, wavelength):
    """
    Resuelve la ecuación de Bruggeman usando Newton-Raphson
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wavelength: Longitud de onda actual (escalar)
    
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
        
        # Interpolar si es array
        if isinstance(n, (list, np.ndarray)):
            n_val = n[0] if len(n) > 0 else 1.5
            k_val = k[0] if len(k) > 0 else 0.0
        else:
            n_val = n
            k_val = k
        
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


def _solve_bruggeman_iterative(components, wavelength):
    """
    Resuelve la ecuación de Bruggeman usando el método iterativo original
    (Fallback cuando Newton-Raphson falla)
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wavelength: Longitud de onda actual (escalar)
    
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
        
        # Interpolar n, k a esta longitud de onda si es necesario
        if isinstance(n, (list, np.ndarray)):
            n_val = n[0] if len(n) > 0 else 1.5
            k_val = k[0] if len(k) > 0 else 0.0
        else:
            n_val = n
            k_val = k
        
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


def _weighted_average_fallback(components, wavelength):
    """
    Calcula promedio ponderado simple como último recurso
    
    Args:
        components: Lista de componentes
        wavelength: Longitud de onda
    
    Returns:
        n_avg, k_avg: Promedio ponderado de n y k
    """
    n_avg = 0.0
    k_avg = 0.0
    
    for comp in components:
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        if isinstance(n, (list, np.ndarray)):
            n_val = n[0] if len(n) > 0 else 1.5
            k_val = k[0] if len(k) > 0 else 0.0
        else:
            n_val = n
            k_val = k
        
        n_avg += fraction * n_val
        k_avg += fraction * k_val
    
    return n_avg, k_avg


def maxwell_garnett_emt(components, wavelengths, host_index=0):
    """
    Aproximación de Maxwell-Garnett para medio efectivo
    
    Modelo: matriz (host) con inclusiones
    
    ε_eff = ε_host · [1 + Σⱼ (3·fⱼ·βⱼ) / (1 - fⱼ·βⱼ)]
    
    donde βⱼ = (εⱼ - ε_host) / (εⱼ + 2·ε_host)
    
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
        epsilon_eff = _solve_maxwell_garnett(components, wl, host_index)
        
        epsilon_real = np.real(epsilon_eff)
        epsilon_imag = np.imag(epsilon_eff)
        
        n, k = epsilon_to_nk(epsilon_real, epsilon_imag)
        
        n_eff_array[i] = n
        k_eff_array[i] = k
    
    return n_eff_array, k_eff_array


def _solve_maxwell_garnett(components, wavelength, host_index):
    """
    Calcula permitividad efectiva usando Maxwell-Garnett
    
    Args:
        components: Lista de componentes
        wavelength: Longitud de onda actual
        host_index: Índice del componente matriz
    
    Returns:
        epsilon_eff: Permitividad efectiva
    """
    # Obtener permitividad del host (matriz)
    host = components[host_index]
    n_host = host['n']
    k_host = host['k']
    
    if isinstance(n_host, (list, np.ndarray)):
        n_host = n_host[0] if len(n_host) > 0 else 1.5
        k_host = k_host[0] if len(k_host) > 0 else 0.0
    
    eps_host_real, eps_host_imag = nk_to_epsilon(n_host, k_host)
    epsilon_host = eps_host_real + 1j * eps_host_imag
    
    # Sumar contribuciones de inclusiones
    sum_beta = 0
    
    for idx, comp in enumerate(components):
        if idx == host_index:
            continue  # Saltar el host
        
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        if isinstance(n, (list, np.ndarray)):
            n = n[0] if len(n) > 0 else 1.5
            k = k[0] if len(k) > 0 else 0.0
        
        eps_real, eps_imag = nk_to_epsilon(n, k)
        epsilon = eps_real + 1j * eps_imag
        
        # Factor β = (ε - ε_host) / (ε + 2·ε_host)
        denominator = epsilon + 2 * epsilon_host
        if abs(denominator) > 1e-10:
            beta = (epsilon - epsilon_host) / denominator
            sum_beta += 3 * fraction * beta / (1 - fraction * beta + 1e-10)
    
    # Permitividad efectiva
    epsilon_eff = epsilon_host * (1 + sum_beta)
    
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
                ]
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
        
        # Si ya tiene n, k como datos
        if 'optical_data' in comp:
            comp_data['n'] = np.interp(
                wavelengths, 
                comp['optical_data']['wavelength'],
                comp['optical_data']['n']
            )
            comp_data['k'] = np.interp(
                wavelengths,
                comp['optical_data']['wavelength'],
                comp['optical_data']['k']
            )
        
        # Si tiene modelo de dispersión
        elif 'model' in comp and 'params' in comp:
            n, k = get_refractive_index(
                wavelengths,
                comp['model'],
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
        # Por defecto, el primer componente es la matriz
        n_eff, k_eff = maxwell_garnett_emt(prepared_components, wavelengths, host_index=0)
    else:
        raise ValueError(f"Modelo EMT no reconocido: {emt_model}")
    
    return n_eff, k_eff