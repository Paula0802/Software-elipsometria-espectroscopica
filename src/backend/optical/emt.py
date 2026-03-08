"""
Teoría del Medio Efectivo (Effective Medium Theory - EMT)
Versión mejorada con Newton-Raphson robusto para Bruggeman y Maxwell-Garnett
"""
import numpy as np
import logging
import json 
from .conversions import nk_to_epsilon, epsilon_to_nk
from .dispersion_models import get_nk_from_model

logger = logging.getLogger(__name__)

def safe_array_conversion(data, field_name='data'):
    """
    Convierte datos a numpy array de float de forma ultra-robusta
    Maneja: listas, arrays, strings JSON, strings de números
    """
    if data is None:
        raise ValueError(f"{field_name} es None")
    
    # Caso 1: Ya es numpy array
    if isinstance(data, np.ndarray):
        if data.dtype.kind in ['U', 'S', 'O']:
            logger.warning(f"{field_name}: Convirtiendo array de strings a float")
            try:
                return np.array([float(x) for x in data])
            except (ValueError, TypeError) as e:
                raise ValueError(f"{field_name}: array de strings no convertible a float: {e}")
        else:
            return data.astype(float)
    
    # Caso 2: Es una lista
    if isinstance(data, list):
        if len(data) == 0:
            return np.array([], dtype=float)
        
        if isinstance(data[0], str):
            logger.warning(f"{field_name}: Convirtiendo lista de strings a float")
            try:
                return np.array([float(x) for x in data])
            except (ValueError, TypeError) as e:
                raise ValueError(f"{field_name}: lista de strings no convertible: {e}")
        else:
            return np.array(data, dtype=float)
    
    # Caso 3: Es un string (JSON)
    if isinstance(data, str):
        try:
            parsed = json.loads(data)
            return safe_array_conversion(parsed, field_name)
        except json.JSONDecodeError:
            raise ValueError(f"{field_name}: string no es JSON válido: '{data[:50]}'")
    
    # Caso 4: Cualquier otro iterable
    try:
        return np.array(list(data), dtype=float)
    except Exception as e:
        raise ValueError(f"{field_name}: tipo {type(data).__name__} no convertible: {e}")

# ==========================================
# CONFIGURACIÓN NEWTON-RAPHSON
# ==========================================

class EMTConfig:
    """Configuración para el solver Newton-Raphson"""
    TOLERANCE    = 1e-8   # |f(ε)| < TOLERANCE
    DELTA_CHANGE = 1e-8   # |ε_{n+1} - ε_n| < DELTA_CHANGE
    MAX_ITERATIONS = 50   # Límite de seguridad


def bruggeman_emt(components, wavelengths):
    """
    Aproximación de Bruggeman para medio efectivo usando Newton-Raphson
    """
    wavelengths = np.asarray(wavelengths, dtype=float)
    n_points = len(wavelengths)
    
    n_eff_array = np.zeros(n_points)
    k_eff_array = np.zeros(n_points)
    
    for i, wl in enumerate(wavelengths):
        try:
            result = _solve_bruggeman_newton(components, i)
            
            if result['success']:
                n_eff_array[i] = result['n_eff']
                k_eff_array[i] = result['k_eff']
            else:
                logger.warning(f"Newton-Raphson falló en λ={wl}nm: {result.get('error')}. Usando método iterativo.")
                epsilon_eff = _solve_bruggeman_iterative(components, i)
                eps_real = np.real(epsilon_eff)
                eps_imag = np.imag(epsilon_eff)
                n, k = epsilon_to_nk(eps_real, eps_imag)
                n_eff_array[i] = n
                k_eff_array[i] = k
                
        except Exception as e:
            logger.error(f"Error en EMT Bruggeman en λ={wl}nm: {e}")
            n_avg, k_avg = _weighted_average_fallback(components, i)
            n_eff_array[i] = n_avg
            k_eff_array[i] = k_avg
    
    return n_eff_array, k_eff_array


def _solve_bruggeman_newton(components, wl_index):
    """Resuelve la ecuación de Bruggeman usando Newton-Raphson"""
    total_fraction = sum(comp['fraction'] for comp in components)
    if abs(total_fraction - 1.0) > 0.01:
        return {
            'success': False,
            'error': f'Suma de fracciones = {total_fraction:.3f} ≠ 1.0',
            'iterations': 0
        }
    
    permittivities = []
    
    for comp in components:
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
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
    
    eps_init_real = sum(p['fraction'] * p['epsilon_real'] for p in permittivities)
    eps_init_imag = sum(p['fraction'] * p['epsilon_imag'] for p in permittivities)
    
    eps_real = eps_init_real
    eps_imag = eps_init_imag
    
    for iteration in range(EMTConfig.MAX_ITERATIONS):
        f_real  = 0.0
        f_imag  = 0.0
        df_real = 0.0
        df_imag = 0.0
        
        for p in permittivities:
            ei_r = p['epsilon_real']
            ei_i = p['epsilon_imag']
            f_i  = p['fraction']
            
            num_r = ei_r - eps_real
            num_i = ei_i - eps_imag
            
            den_r = ei_r + 2.0 * eps_real
            den_i = ei_i + 2.0 * eps_imag
            
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
            
            num2_r = -(2.0 * ei_r + eps_real)
            num2_i = -(2.0 * ei_i + eps_imag)
            
            den_sq_mag = den_mag_sq ** 2
            
            dterm_r = (num2_r * den_r + num2_i * den_i) / den_sq_mag
            dterm_i = (num2_i * den_r - num2_r * den_i) / den_sq_mag
            
            df_real += f_i * dterm_r
            df_imag += f_i * dterm_i
        
        f_magnitude = np.sqrt(f_real**2 + f_imag**2)
        
        if f_magnitude < EMTConfig.TOLERANCE:
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
        
        df_mag_sq = df_real**2 + df_imag**2
        
        if df_mag_sq < 1e-20:
            return {
                'success': False,
                'error': 'Derivada muy pequeña, no converge',
                'iterations': iteration + 1
            }
        
        delta_eps_r = -(f_real * df_real + f_imag * df_imag) / df_mag_sq
        delta_eps_i = -(f_imag * df_real - f_real * df_imag) / df_mag_sq
        
        eps_real += delta_eps_r
        eps_imag += delta_eps_i
        
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
    
    return {
        'success': False,
        'error': f'No convergió en {EMTConfig.MAX_ITERATIONS} iteraciones',
        'iterations': EMTConfig.MAX_ITERATIONS
    }


def _solve_bruggeman_iterative(components, wl_index):
    """Resuelve la ecuación de Bruggeman usando el método iterativo original"""
    epsilons  = []
    fractions = []
    
    for comp in components:
        n        = comp['n']
        k        = comp['k']
        fraction = comp['fraction']
        
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
    
    epsilon_eff = sum(f * eps for f, eps in zip(fractions, epsilons))
    
    max_iter  = 100
    tolerance = 1e-6
    
    for iteration in range(max_iter):
        numerator   = 0
        denominator = 0
        
        for f, eps in zip(fractions, epsilons):
            numerator   += f * eps * (1 + 2 * epsilon_eff)
            denominator += f * (1 + 2 * epsilon_eff) - f * (eps - epsilon_eff)
        
        epsilon_new = numerator / denominator if abs(denominator) > 1e-10 else epsilon_eff
        
        if abs(epsilon_new - epsilon_eff) < tolerance:
            break
        
        epsilon_eff = epsilon_new
    
    return epsilon_eff


def _weighted_average_fallback(components, wl_index):
    """Calcula promedio ponderado simple como último recurso"""
    n_avg = 0.0
    k_avg = 0.0
    
    for comp in components:
        n        = comp['n']
        k        = comp['k']
        fraction = comp['fraction']
        
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
    """Aproximación de Maxwell-Garnett para medio efectivo"""
    wavelengths = np.asarray(wavelengths, dtype=float)
    n_points    = len(wavelengths)
    
    n_eff_array = np.zeros(n_points)
    k_eff_array = np.zeros(n_points)
    
    for i, wl in enumerate(wavelengths):
        epsilon_eff = _solve_maxwell_garnett(components, i, host_index)
        
        epsilon_real = np.real(epsilon_eff)
        epsilon_imag = np.imag(epsilon_eff)
        
        n, k = epsilon_to_nk(epsilon_real, epsilon_imag)
        
        n_eff_array[i] = n
        k_eff_array[i] = k
    
    return n_eff_array, k_eff_array


def _solve_maxwell_garnett(components, wl_index, host_index):
    """Calcula permitividad efectiva usando Maxwell-Garnett"""
    host   = components[host_index]
    n_host = host['n']
    k_host = host['k']
    
    if isinstance(n_host, (list, np.ndarray)):
        n_host = float(n_host[wl_index])
        k_host = float(k_host[wl_index])
    else:
        n_host = float(n_host)
        k_host = float(k_host)
    
    eps_host_real, eps_host_imag = nk_to_epsilon(n_host, k_host)
    epsilon_host = eps_host_real + 1j * eps_host_imag
    
    total_inclusion_fraction = sum(
        comp['fraction'] for idx, comp in enumerate(components) if idx != host_index
    )
    
    if total_inclusion_fraction >= 1.0:
        logger.warning(
            f"Maxwell-Garnett: suma de fracciones de inclusiones = {total_inclusion_fraction:.3f} >= 1.0. "
            "El modelo requiere Σf_j < 1"
        )
    
    if total_inclusion_fraction > 0.4:
        logger.warning(
            f"Maxwell-Garnett: fracción total de inclusiones = {total_inclusion_fraction:.1%}. "
            "El modelo es más preciso para fracciones ≤ 30-40%"
        )
    
    S = 0.0 + 0.0j
    
    for idx, comp in enumerate(components):
        if idx == host_index:
            continue
        
        n        = comp['n']
        k        = comp['k']
        fraction = comp['fraction']
        
        if isinstance(n, (list, np.ndarray)):
            n = float(n[wl_index])
            k = float(k[wl_index])
        else:
            n = float(n)
            k = float(k)
        
        eps_real, eps_imag = nk_to_epsilon(n, k)
        epsilon_j = eps_real + 1j * eps_imag
        
        numerator   = epsilon_j - epsilon_host
        denominator = epsilon_j + 2.0 * epsilon_host
        
        if abs(denominator) < 1e-10:
            logger.warning(
                f"Maxwell-Garnett: denominador muy pequeño para inclusión {idx}. "
                f"ε_j ≈ -2*ε_host causa singularidad"
            )
            continue
        
        A_j = numerator / denominator
        S  += fraction * A_j
    
    numerator_eff   = 1.0 + 2.0 * S
    denominator_eff = 1.0 - S
    
    if abs(denominator_eff) < 1e-10:
        logger.error(
            "Maxwell-Garnett: denominador (1 - S) muy pequeño. "
            "Posible inestabilidad numérica con estas fracciones"
        )
        return epsilon_host
    
    epsilon_eff = epsilon_host * (numerator_eff / denominator_eff)
    
    return epsilon_eff


def _resolve_component_nk(comp, wavelengths):
    """
    Resuelve n, k para un componente de la capa heterogénea.

    Soporta las siguientes variantes de payload que puede enviar el frontend:
      1. model in ['file_nk', 'file_epsilon'] o 'optical_data' presente
      2. model == 'relative' con nk_data / dispersion_model
      3. Modelo analítico estándar: 'model' + ('params' o 'parameters')
      4. n, k directos

    Returns:
        (n_array, k_array)
    """
    name = comp.get('name', 'Unknown')

    # ------------------------------------------------------------------
    # CASO 1: Datos de archivo / optical_data
    # ------------------------------------------------------------------
    if comp.get('model') in ['file_nk', 'file_epsilon'] or 'optical_data' in comp:
        opt_data = (
            comp.get('optical_data')
            or comp.get('file_data')
            or comp.get('data')
        )
        if not opt_data:
            raise ValueError(f"Componente '{name}' sin datos ópticos")

        wavelength_data = safe_array_conversion(
            opt_data.get('wavelength') or opt_data.get('wavelengths'),
            f"{name}_wavelength"
        )
        n_data = safe_array_conversion(opt_data['n'], f"{name}_n")
        k_raw  = opt_data.get('k', [])
        k_data = safe_array_conversion(k_raw, f"{name}_k") if k_raw else np.zeros_like(n_data)

        wavelength_data    = np.asarray(wavelength_data, dtype=np.float64)
        n_data             = np.asarray(n_data,          dtype=np.float64)
        k_data             = np.asarray(k_data,          dtype=np.float64)
        wavelengths_interp = np.asarray(wavelengths,     dtype=np.float64)

        if not np.all(np.diff(wavelength_data) > 0):
            sort_idx        = np.argsort(wavelength_data)
            wavelength_data = wavelength_data[sort_idx]
            n_data          = n_data[sort_idx]
            k_data          = k_data[sort_idx]

        logger.info(f"  Componente '{name}': interpolando {len(wavelength_data)} puntos (file/optical_data)")
        return (
            np.interp(wavelengths_interp, wavelength_data, n_data),
            np.interp(wavelengths_interp, wavelength_data, k_data),
        )

    # ------------------------------------------------------------------
    # CASO 2: model == 'relative'
    # ------------------------------------------------------------------
    if comp.get('model') == 'relative':
        nk = comp.get('nk_data') or comp.get('resolved_data') or comp.get('data')

        if nk and 'n' in nk and 'k' in nk:
            wavelength_data    = safe_array_conversion(
                nk.get('wavelength') or nk.get('wavelengths'), f"{name}_wavelength"
            )
            n_data = safe_array_conversion(nk['n'], f"{name}_n")
            k_data = safe_array_conversion(nk['k'], f"{name}_k")

            wavelength_data    = np.asarray(wavelength_data, dtype=np.float64)
            n_data             = np.asarray(n_data,          dtype=np.float64)
            k_data             = np.asarray(k_data,          dtype=np.float64)
            wavelengths_interp = np.asarray(wavelengths,     dtype=np.float64)

            if not np.all(np.diff(wavelength_data) > 0):
                sort_idx        = np.argsort(wavelength_data)
                wavelength_data = wavelength_data[sort_idx]
                n_data          = n_data[sort_idx]
                k_data          = k_data[sort_idx]

            logger.info(f"  Componente '{name}': resuelto desde nk_data (relative)")
            return (
                np.interp(wavelengths_interp, wavelength_data, n_data),
                np.interp(wavelengths_interp, wavelength_data, k_data),
            )

        if 'dispersion_model' in comp and 'dispersion_params' in comp:
            logger.info(f"  Componente '{name}': resolviendo desde dispersion_model (relative)")
            return get_nk_from_model(comp['dispersion_model'], wavelengths, comp['dispersion_params'])

        raise ValueError(
            f"Componente '{name}': modelo 'relative' sin datos ópticos resueltos. "
            "El frontend debe incluir 'nk_data' o 'dispersion_model'+'dispersion_params'."
        )

    # ------------------------------------------------------------------
    # CASO 3: Modelo analítico estándar
    # FIX: aceptar 'params' o 'parameters' como clave de parámetros
    # ------------------------------------------------------------------
    model_key = comp.get('model') or comp.get('dispersion_model')
    # Intentar obtener parámetros desde cualquier clave posible
    params = (
        comp.get('params')
        or comp.get('parameters')
        or comp.get('dispersion_params')
        or {}
    )

    if model_key and params:
        logger.info(
            f"  Componente '{name}': modelo='{model_key}', "
            f"params keys={list(params.keys())}"
        )
        return get_nk_from_model(model_key, wavelengths, params)

    # Fallback: si hay model pero params vacío, intentar igualmente
    # (puede ser 'constant' sin parámetros explícitos)
    if model_key:
        logger.warning(
            f"  Componente '{name}': modelo='{model_key}' pero sin params. "
            f"Keys disponibles en comp: {list(comp.keys())}"
        )
        return get_nk_from_model(model_key, wavelengths, params)

    # ------------------------------------------------------------------
    # CASO 4: n, k directos
    # ------------------------------------------------------------------
    if 'n' in comp:
        logger.info(f"  Componente '{name}': usando n/k directos")
        return comp['n'], comp.get('k', 0)

    # ------------------------------------------------------------------
    # Sin datos válidos
    # ------------------------------------------------------------------
    raise ValueError(
        f"Componente '{name}' sin datos ópticos válidos. "
        f"Keys recibidas: {list(comp.keys())}. "
        f"Modelos soportados: cauchy, sellmeier, drude, lorentz, drude_lorentz, "
        f"custom, file_nk, file_epsilon, constant, relative"
    )


def calculate_effective_medium(layer_data, wavelengths):
    """
    Función principal para calcular medio efectivo según el modelo EMT
    """
    emt_model  = layer_data.get('emt_model', 'bruggeman')
    components = layer_data['components']

    # Log de diagnóstico: muestra exactamente qué llega para cada componente
    logger.info(f"=== EMT '{emt_model}' — {len(components)} componentes ===")
    for i, comp in enumerate(components):
        params_keys = list(
            (comp.get('params') or comp.get('parameters') or comp.get('dispersion_params') or {}).keys()
        )
        logger.info(
            f"  [{i}] '{comp.get('name')}' | "
            f"model='{comp.get('model')}' | "
            f"fraction={comp.get('fraction')} | "
            f"comp_keys={list(comp.keys())} | "
            f"params_keys={params_keys}"
        )

    prepared_components = []

    for comp in components:
        name = comp.get('name', 'Unknown')
        try:
            n, k = _resolve_component_nk(comp, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en componente '{name}': {e}")
            raise

        prepared_components.append({
            'fraction': comp['fraction'],
            'name':     name,
            'n':        n,
            'k':        k,
        })

    # Aplicar modelo EMT
    if emt_model == 'bruggeman':
        n_eff, k_eff = bruggeman_emt(prepared_components, wavelengths)
    elif emt_model in ('maxwell-garnett', 'maxwell_garnett'):
        host_index = layer_data.get('host_index', 0)
        n_eff, k_eff = maxwell_garnett_emt(prepared_components, wavelengths, host_index)
    else:
        raise ValueError(f"Modelo EMT no reconocido: {emt_model}")

    return n_eff, k_eff