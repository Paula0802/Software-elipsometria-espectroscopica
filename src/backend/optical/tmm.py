"""
Método de Matriz de Transferencia (Transfer Matrix Method - TMM)
para cálculo de reflectancia, transmitancia y ángulos elipsométricos Psi y Delta

==========================================
VERSIÓN 5.0 - ARQUITECTURA UNIFICADA
==========================================

ESTE MÓDULO ES LA ÚNICA FUENTE DE VERDAD PARA:
1. Cálculo de coeficientes de Fresnel r y t
2. Impedancias ópticas η_0 y η_s
3. Ángulos elipsométricos Psi y Delta

CORRECCIONES APLICADAS:
1. ✅ Elección robusta de rama de kz según criterio físico Re(kz) > 0
2. ✅ Normalización de Delta a [0°, 360°] (convención estándar)
3. ✅ Corrección de ambigüedad de Delta (~180°)
4. ✅ Validación de impedancias ópticas
5. ✅ Manejo mejorado de medios absorbentes
6. ✅ Soporte completo para archivos file_nk y file_epsilon
7. ✅ Conversión segura de datos experimentales a float64
8. ✅ NUEVO: Retorna coeficiente de transmisión t
9. ✅ NUEVO: Retorna impedancias η_0 y η_s para cálculo de T
"""

import numpy as np
import logging
from .conversions import nk_to_epsilon, degrees_to_radians
from .dispersion_models import get_nk_from_model
from .emt import calculate_effective_medium

# Configurar logger
logger = logging.getLogger(__name__)


# ==========================================
# FUNCIONES AUXILIARES
# ==========================================

def choose_physical_branch(kz):
    """
    Elige la rama física correcta de kz según el criterio:
    - La onda debe propagarse/decaer hacia +z
    - En medios transparentes: Re(kz) > 0
    - En medios absorbentes: Im(kz) > 0
    """
    kz = complex(kz)
    
    if np.real(kz) < 0:
        kz = -kz
    elif np.real(kz) == 0 and np.imag(kz) < 0:
        kz = -kz
    
    return kz


def get_eta(n_complex, kz, polarization):
    """
    Calcula la impedancia óptica η según la polarización.
    
    Para polarización S (TE): η = kz
    Para polarización P (TM): η = n² / kz
    
    Args:
        n_complex: Índice de refracción complejo
        kz: Componente z del vector de onda
        polarization: 's' o 'p'
    
    Returns:
        Impedancia óptica η
    """
    if polarization == 's':
        return kz
    else:  # 'p'
        if np.abs(kz) < 1e-15:
            kz = 1e-15 + 0j
        return (n_complex**2) / kz


def transfer_matrix(n_complex, thickness, wavelength, kz, polarization='p'):
    """
    Calcula la matriz de transferencia para una capa (Formalismo Abeles)
    
    M_j = [[cos(δ),      i·sin(δ)/η],
           [i·η·sin(δ),  cos(δ)     ]]
    
    donde δ = kz · d
    """
    n_complex = complex(n_complex)
    thickness = float(thickness)
    wavelength = float(wavelength)
    
    kz = choose_physical_branch(kz)
    delta = kz * thickness
    
    eta = get_eta(n_complex, kz, polarization)
    
    if np.abs(eta) < 1e-12:
        raise ValueError(f"Impedancia eta ≈ 0 detectada (polarización {polarization})")
    
    cos_d = np.cos(delta)
    sin_d = np.sin(delta)
    
    M = np.array([
        [cos_d, 1j * sin_d / eta],
        [1j * eta * sin_d, cos_d]
    ], dtype=complex)
    
    return M


# ==========================================
# CÁLCULO DE COEFICIENTES DE FRESNEL
# ==========================================

def _calculate_fresnel_coefficients(layers_n, layers_k, layers_thickness,
                                     n_ambient, k_ambient, n_substrate, k_substrate,
                                     wavelength, theta_0, polarization):
    """
    Calcula los coeficientes de Fresnel r y t para una polarización específica.
    
    ==========================================
    FORMALISMO ABELES
    ==========================================
    
    Coeficientes del sistema multicapa:
    r = (η₀·M₁₁ + η₀·η_s·M₁₂ - M₂₁ - η_s·M₂₂) / (η₀·M₁₁ + η₀·η_s·M₁₂ + M₂₁ + η_s·M₂₂)
    t = 2·η₀ / (η₀·M₁₁ + η₀·η_s·M₁₂ + M₂₁ + η_s·M₂₂)
    
    Args:
        layers_n, layers_k, layers_thickness: Propiedades de las capas
        n_ambient, k_ambient: Índice complejo del ambiente
        n_substrate, k_substrate: Índice complejo del sustrato
        wavelength: Longitud de onda en nm
        theta_0: Ángulo de incidencia en radianes
        polarization: 's' o 'p'
    
    Returns:
        Dict con r, t, eta_0, eta_s, kz_0, kz_s
    """
    n_ambient = float(n_ambient)
    k_ambient = float(k_ambient)
    n_substrate = float(n_substrate)
    k_substrate = float(k_substrate)
    wavelength = float(wavelength)
    theta_0 = float(theta_0)
    
    # Índices complejos
    n_0 = complex(n_ambient, k_ambient)
    n_s = complex(n_substrate, k_substrate)
    
    # Vector de onda en vacío
    k0 = 2 * np.pi / wavelength
    
    # Componente paralela (conservada por ley de Snell)
    k_parallel = k0 * n_0 * np.sin(theta_0)
    
    # kz en el ambiente
    kz_0_squared = (k0 * n_0)**2 - k_parallel**2
    kz_0 = np.sqrt(kz_0_squared)
    kz_0 = choose_physical_branch(kz_0)
    
    # Construir matriz de transferencia total
    M_total = np.eye(2, dtype=complex)
    
    for n, k, d in zip(layers_n, layers_k, layers_thickness):
        n = float(n)
        k = float(k)
        d = float(d)
        
        n_layer = complex(n, k)
        
        kz_squared = (k0 * n_layer)**2 - k_parallel**2
        kz = np.sqrt(kz_squared)
        kz = choose_physical_branch(kz)
        
        M = transfer_matrix(n_layer, d, wavelength, kz, polarization)
        M_total = M_total @ M
    
    # kz en el sustrato
    kz_s_squared = (k0 * n_s)**2 - k_parallel**2
    kz_s = np.sqrt(kz_s_squared)
    kz_s = choose_physical_branch(kz_s)
    
    # Impedancias ópticas
    eta_0 = get_eta(n_0, kz_0, polarization)
    eta_s = get_eta(n_s, kz_s, polarization)
    
    # Elementos de la matriz
    M11, M12 = M_total[0, 0], M_total[0, 1]
    M21, M22 = M_total[1, 0], M_total[1, 1]
    
    # Denominador común
    denom = eta_0 * M11 + eta_0 * eta_s * M12 + M21 + eta_s * M22
    
    if np.abs(denom) < 1e-15:
        r = 0j
        t = 0j
    else:
        # Coeficiente de reflexión
        numer_r = eta_0 * M11 + eta_0 * eta_s * M12 - M21 - eta_s * M22
        r = numer_r / denom
        
        # Coeficiente de transmisión
        t = 2 * eta_0 / denom
    
    return {
        'r': r,
        't': t,
        'eta_0': eta_0,
        'eta_s': eta_s,
        'kz_0': kz_0,
        'kz_s': kz_s,
        'n_0': n_0,
        'n_s': n_s
    }


def calculate_reflectance(layers_n, layers_k, layers_thickness, 
                          n_ambient, n_substrate, 
                          wavelength, angle_deg, polarization='both',
                          k_ambient=0.0, k_substrate=0.0):
    """
    Calcula la reflectancia usando TMM.
    
    Mantiene compatibilidad con la API anterior pero ahora usa
    _calculate_fresnel_coefficients internamente.
    
    Args:
        layers_n, layers_k, layers_thickness: Propiedades de las capas
        n_ambient, n_substrate: Índices de refracción (parte real)
        wavelength: Longitud de onda en nm
        angle_deg: Ángulo de incidencia en grados
        polarization: 's', 'p', o 'both'
        k_ambient, k_substrate: Coeficientes de extinción (opcional)
    
    Returns:
        Si polarization='both': (r_p, r_s)
        Si polarization='s': r_s
        Si polarization='p': r_p
    """
    wavelength = float(wavelength)
    angle_deg = float(angle_deg)
    n_ambient = float(n_ambient)
    n_substrate = float(n_substrate)
    
    theta_0 = degrees_to_radians(angle_deg)
    
    r_p = None
    r_s = None
    
    if polarization == 'both' or polarization == 'p':
        result_p = _calculate_fresnel_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_0, 'p'
        )
        r_p = result_p['r']
    
    if polarization == 'both' or polarization == 's':
        result_s = _calculate_fresnel_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_0, 's'
        )
        r_s = result_s['r']
    
    if polarization == 'both':
        return r_p, r_s
    elif polarization == 'p':
        return r_p
    else:
        return r_s


def calculate_fresnel_coefficients(layers_n, layers_k, layers_thickness,
                                   n_ambient, k_ambient, n_substrate, k_substrate,
                                   wavelength, angle_deg, polarization='both'):
    """
    Calcula los coeficientes de Fresnel completos (r, t, η) para ambas polarizaciones.
    
    Esta es la función principal que debe usar tra_calculator.py
    
    Args:
        layers_n, layers_k, layers_thickness: Propiedades de las capas
        n_ambient, k_ambient: Índice complejo del ambiente
        n_substrate, k_substrate: Índice complejo del sustrato
        wavelength: Longitud de onda en nm
        angle_deg: Ángulo de incidencia en grados
        polarization: 's', 'p', o 'both'
    
    Returns:
        Dict con:
            - r_s, t_s, eta_0_s, eta_s_s (si polarization in ['s', 'both'])
            - r_p, t_p, eta_0_p, eta_s_p (si polarization in ['p', 'both'])
    """
    theta_0 = degrees_to_radians(angle_deg)
    result = {}
    
    if polarization in ['s', 'both']:
        res_s = _calculate_fresnel_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_0, 's'
        )
        result['r_s'] = res_s['r']
        result['t_s'] = res_s['t']
        result['eta_0_s'] = res_s['eta_0']
        result['eta_s_s'] = res_s['eta_s']
    
    if polarization in ['p', 'both']:
        res_p = _calculate_fresnel_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_0, 'p'
        )
        result['r_p'] = res_p['r']
        result['t_p'] = res_p['t']
        result['eta_0_p'] = res_p['eta_0']
        result['eta_s_p'] = res_p['eta_s']
    
    return result


# ==========================================
# CORRECCIÓN DE AMBIGÜEDAD DE DELTA
# ==========================================

def detect_system_type(layers_n, layers_k):
    """
    Detecta si el sistema contiene capas metálicas
    """
    for n, k in zip(layers_n, layers_k):
        k_val = float(k) if isinstance(k, (int, float, np.number)) else float(k[0]) if hasattr(k, '__len__') else float(k)
        
        if k_val > 1.0:
            return 'metal'
    
    return 'dielectric'


def correct_delta_ambiguity(delta_raw, experimental_delta=None, expected_range='auto',
                            layers_n=None, layers_k=None):
    """
    Corrige la ambigüedad de fase en Delta (~180°)
    """
    candidates = [
        delta_raw,
        360 - delta_raw,
        180 - delta_raw,
        (180 + delta_raw) % 360,
        abs(180 - delta_raw),
    ]
    
    candidates = list(set([c % 360 for c in candidates]))
    
    if experimental_delta is not None:
        errors = [abs(c - experimental_delta) for c in candidates]
        best_idx = np.argmin(errors)
        return candidates[best_idx]
    
    if expected_range == 'auto':
        if layers_n is not None and layers_k is not None:
            system_type = detect_system_type(layers_n, layers_k)
            expected_range = system_type
        else:
            expected_range = 'metal'
    
    if expected_range == 'metal':
        min_expected, max_expected = 90, 180
    elif expected_range == 'dielectric':
        min_expected, max_expected = 0, 90
    elif isinstance(expected_range, tuple):
        min_expected, max_expected = expected_range
    else:
        return delta_raw
    
    in_range = [(c, abs(c - (min_expected + max_expected)/2)) 
                for c in candidates 
                if min_expected <= c <= max_expected]
    
    if in_range:
        return min(in_range, key=lambda x: x[1])[0]
    else:
        distances_to_range = []
        for c in candidates:
            if c < min_expected:
                dist = min_expected - c
            elif c > max_expected:
                dist = c - max_expected
            else:
                dist = 0
            distances_to_range.append((c, dist))
        
        return min(distances_to_range, key=lambda x: x[1])[0]


# ==========================================
# CÁLCULO DE PSI Y DELTA
# ==========================================

def calculate_psi_delta(r_p, r_s, correct_ambiguity=True, 
                       experimental_delta=None, expected_range='auto',
                       layers_n=None, layers_k=None):
    """
    Calcula los ángulos elipsométricos Psi y Delta
    
    ρ = r_p / r_s = tan(Ψ) · exp(i·Δ)
    """
    rho = r_p / r_s
    
    psi_rad = np.arctan(np.abs(rho))
    psi_deg = np.rad2deg(psi_rad)
    
    delta_rad = np.angle(rho)
    delta_deg = np.rad2deg(delta_rad)
    
    if delta_deg < 0:
        delta_deg += 360
    
    if correct_ambiguity:
        delta_deg = correct_delta_ambiguity(
            delta_deg,
            experimental_delta=experimental_delta,
            expected_range=expected_range,
            layers_n=layers_n,
            layers_k=layers_k
        )
    
    return float(psi_deg), float(delta_deg)


# ==========================================
# FUNCIÓN PRINCIPAL: run_tmm_calculation
# ==========================================

def run_tmm_calculation(model_data, correct_delta_ambiguity=True, 
                       experimental_data=None, expected_delta_range='auto'):
    """
    Ejecuta el cálculo TMM completo para un modelo óptico.
    
    ==========================================
    VERSIÓN 5.0 - UNIFICADA
    ==========================================
    
    Retorna:
    - Coeficientes r_p, r_s (para Psi/Delta)
    - Coeficientes t_p, t_s (para Transmitancia)
    - Impedancias eta_0, eta_s (para factor de corrección de T)
    - Constantes ópticas n, k por capa
    
    Args:
        model_data: Modelo óptico con global, ambient, substrate, layers
        correct_delta_ambiguity: Si True, corrige ambigüedad de Delta
        experimental_data: Datos experimentales para corrección
        expected_delta_range: Rango esperado de Delta ('auto', 'metal', 'dielectric')
    
    Returns:
        Dict con wavelength, psi_deg, delta_deg, r_p, r_s, t_p, t_s,
        eta_0_s, eta_s_s, eta_0_p, eta_s_p, optical_constants
    """
    # Extraer datos globales
    angle = model_data['global']['angle']
    polarization = model_data['global'].get('polarization', 'both')
    
    # Longitudes de onda
    if 'wavelengths' in model_data['global']:
        wavelengths = np.array(model_data['global']['wavelengths'])
    elif model_data['global']['wavelength_mode'] == 'range':
        wl_from = model_data['global']['wl_from']
        wl_to = model_data['global']['wl_to']
        wl_steps = model_data['global']['wl_steps']
        wavelengths = np.linspace(wl_from, wl_to, wl_steps)
    elif model_data['global']['wavelength_mode'] == 'single':
        wavelengths = np.array([model_data['global']['wl_single']])
    else:
        raise ValueError("No se especificaron longitudes de onda")
    
    # ========================================
    # AMBIENTE - CON SOPORTE EMT
    # ========================================
    ambient_data = model_data['ambient']
    
    if ambient_data.get('type') == 'emt':
        if 'n_effective' in ambient_data and 'k_effective' in ambient_data:
            logger.info("✅ Ambiente: Usando n,k efectivos pre-calculados")
            n_ambient_arr = np.interp(
                wavelengths, 
                ambient_data['wavelengths_effective'],
                ambient_data['n_effective']
            )
            k_ambient_arr = np.interp(
                wavelengths,
                ambient_data['wavelengths_effective'],
                ambient_data['k_effective']
            )
            n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
            k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
        else:
            logger.warning("⚠️ Ambiente EMT sin n,k efectivos pre-calculados, calculando...")
            n_ambient_arr, k_ambient_arr = calculate_effective_medium(ambient_data, wavelengths)
            n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
            k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
    elif ambient_data.get('type') == 'constant':
        n_ambient = ambient_data.get('n', 1.0)
        k_ambient = ambient_data.get('k', 0.0)
    elif ambient_data.get('type') in ['file_nk', 'file_epsilon']:
        if 'optical_data' not in ambient_data:
            raise ValueError(f"Ambiente con tipo '{ambient_data['type']}' no tiene 'optical_data'.")
        ambient_params = {'optical_data': ambient_data['optical_data']}
        n_ambient_arr, k_ambient_arr = get_nk_from_model(ambient_data['type'], wavelengths, ambient_params)
        n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
        k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
    else:
        n_ambient_arr, k_ambient_arr = get_nk_from_model(
            ambient_data['type'], wavelengths, ambient_data.get('params', {})
        )
        n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
        k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
    
    # ========================================
    # SUSTRATO - CON SOPORTE EMT
    # ========================================
    substrate_data = model_data['substrate']
    
    if substrate_data.get('type') == 'emt':
        if 'n_effective' in substrate_data and 'k_effective' in substrate_data:
            logger.info("✅ Sustrato: Usando n,k efectivos pre-calculados")
            n_substrate_arr = np.interp(
                wavelengths,
                substrate_data['wavelengths_effective'],
                substrate_data['n_effective']
            )
            k_substrate_arr = np.interp(
                wavelengths,
                substrate_data['wavelengths_effective'],
                substrate_data['k_effective']
            )
            n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
            k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
        else:
            logger.warning("⚠️ Sustrato EMT sin n,k efectivos pre-calculados, calculando...")
            n_substrate_arr, k_substrate_arr = calculate_effective_medium(substrate_data, wavelengths)
            n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
            k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
    elif substrate_data.get('type') in ['constant', 'glass']:
        n_substrate = substrate_data.get('n', 1.52)
        k_substrate = substrate_data.get('k', 0.0)
    elif substrate_data.get('type') in ['file_nk', 'file_epsilon']:
        if 'optical_data' not in substrate_data:
            raise ValueError(f"Sustrato con tipo '{substrate_data['type']}' no tiene 'optical_data'.")
        substrate_params = {'optical_data': substrate_data['optical_data']}
        n_substrate_arr, k_substrate_arr = get_nk_from_model(substrate_data['type'], wavelengths, substrate_params)
        n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
        k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
    else:
        n_substrate_arr, k_substrate_arr = get_nk_from_model(
            substrate_data['type'], wavelengths, substrate_data.get('params', {})
        )
        n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
        k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
    
    # ========================================
    # CAPAS
    # ========================================
    num_wavelengths = len(wavelengths)
    layers_n_array = []
    layers_k_array = []
    layers_thickness = []
    
    for layer in model_data['layers']:
        thickness = layer['thickness']
        layers_thickness.append(thickness)
        
        if layer.get('layer_type') == 'emt':
            if 'n_effective' in layer and 'k_effective' in layer:
                logger.info(f"✅ Capa '{layer.get('name', 'sin nombre')}': Usando n,k efectivos pre-calculados")
                n_eff = np.interp(wavelengths, layer['wavelengths_effective'], layer['n_effective'])
                k_eff = np.interp(wavelengths, layer['wavelengths_effective'], layer['k_effective'])
            else:
                logger.warning(f"⚠️ Capa '{layer.get('name', 'sin nombre')}' EMT sin n,k efectivos, calculando...")
                n_eff, k_eff = calculate_effective_medium(layer, wavelengths)
            layers_n_array.append(n_eff)
            layers_k_array.append(k_eff)
        else:
            if layer.get('model') in ['file_nk', 'file_epsilon']:
                if 'optical_data' not in layer:
                    raise ValueError(f"Capa '{layer.get('name', 'sin nombre')}' no tiene 'optical_data'.")
                layer_params = {'optical_data': layer['optical_data']}
                n_layer, k_layer = get_nk_from_model(layer['model'], wavelengths, layer_params)
            elif 'optical_data' in layer:
                n_layer = np.interp(wavelengths, layer['optical_data']['wavelength'], layer['optical_data']['n'])
                k_layer = np.interp(wavelengths, layer['optical_data']['wavelength'], layer['optical_data']['k'])
            else:
                n_layer, k_layer = get_nk_from_model(layer['model'], wavelengths, layer.get('params', {}))
            
            layers_n_array.append(n_layer)
            layers_k_array.append(k_layer)
    
    # ========================================
    # CALCULAR PARA CADA LONGITUD DE ONDA
    # ========================================
    psi_results = []
    delta_results = []
    r_p_results = []
    r_s_results = []
    t_p_results = []
    t_s_results = []
    eta_0_s_results = []
    eta_s_s_results = []
    eta_0_p_results = []
    eta_s_p_results = []
    
    theta_0 = degrees_to_radians(angle)
    
    for i, wl in enumerate(wavelengths):
        # Extraer n, k para esta longitud de onda
        layers_n = [n[i] if isinstance(n, np.ndarray) else n for n in layers_n_array]
        layers_k = [k[i] if isinstance(k, np.ndarray) else k for k in layers_k_array]
        
        # Calcular coeficientes para polarización S
        res_s = _calculate_fresnel_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wl, theta_0, 's'
        )
        
        # Calcular coeficientes para polarización P
        res_p = _calculate_fresnel_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wl, theta_0, 'p'
        )
        
        r_p = res_p['r']
        r_s = res_s['r']
        t_p = res_p['t']
        t_s = res_s['t']
        
        # Guardar coeficientes
        r_p_results.append(r_p)
        r_s_results.append(r_s)
        t_p_results.append(t_p)
        t_s_results.append(t_s)
        
        # Guardar impedancias
        eta_0_s_results.append(res_s['eta_0'])
        eta_s_s_results.append(res_s['eta_s'])
        eta_0_p_results.append(res_p['eta_0'])
        eta_s_p_results.append(res_p['eta_s'])
        
        # Extraer dato experimental si existe
        exp_delta_i = None
        if experimental_data is not None and 'delta' in experimental_data:
            exp_wavelengths = np.asarray(experimental_data['wavelength'], dtype=np.float64)
            exp_delta = np.asarray(experimental_data['delta'], dtype=np.float64)
            exp_delta_i = np.interp(wl, exp_wavelengths, exp_delta)
        
        # Calcular Psi y Delta
        psi, delta = calculate_psi_delta(
            r_p, r_s,
            correct_ambiguity=correct_delta_ambiguity,
            experimental_delta=exp_delta_i,
            expected_range=expected_delta_range,
            layers_n=layers_n,
            layers_k=layers_k
        )
        
        psi_results.append(psi)
        delta_results.append(delta)
    
    # ========================================
    # PREPARAR OPTICAL CONSTANTS
    # ========================================
    optical_constants = {
        'wavelength': wavelengths.tolist(),
        'ambient': {
            'name': 'Ambient',
            'n': [float(n_ambient)] * len(wavelengths) if not isinstance(n_ambient, np.ndarray) else n_ambient.tolist(),
            'k': [float(k_ambient)] * len(wavelengths) if not isinstance(k_ambient, np.ndarray) else k_ambient.tolist()
        },
        'layers': [],
        'substrate': {
            'name': 'Substrate',
            'n': [float(n_substrate)] * len(wavelengths) if not isinstance(n_substrate, np.ndarray) else n_substrate.tolist(),
            'k': [float(k_substrate)] * len(wavelengths) if not isinstance(k_substrate, np.ndarray) else k_substrate.tolist()
        }
    }
    
    for i, layer in enumerate(model_data['layers']):
        layer_name = layer.get('name', f'Layer {i+1}')
        n_array = layers_n_array[i]
        k_array = layers_k_array[i]
        
        if isinstance(n_array, np.ndarray):
            n_list = n_array.tolist()
        elif isinstance(n_array, (list, tuple)):
            n_list = list(n_array)
        else:
            n_list = [float(n_array)] * len(wavelengths)
        
        if isinstance(k_array, np.ndarray):
            k_list = k_array.tolist()
        elif isinstance(k_array, (list, tuple)):
            k_list = list(k_array)
        else:
            k_list = [float(k_array)] * len(wavelengths)
        
        optical_constants['layers'].append({
            'name': layer_name,
            'thickness': layer['thickness'],
            'n': n_list,
            'k': k_list
        })
    
    # ========================================
    # RETORNAR RESULTADO COMPLETO
    # ========================================
    return {
        'wavelength': wavelengths.tolist(),
        'psi_deg': psi_results,
        'delta_deg': delta_results,
        # Coeficientes de reflexión
        'r_p': [complex(r) for r in r_p_results],
        'r_s': [complex(r) for r in r_s_results],
        # Coeficientes de transmisión (NUEVO)
        't_p': [complex(t) for t in t_p_results],
        't_s': [complex(t) for t in t_s_results],
        # Impedancias para cálculo de T (NUEVO)
        'eta_0_s': [complex(e) for e in eta_0_s_results],
        'eta_s_s': [complex(e) for e in eta_s_s_results],
        'eta_0_p': [complex(e) for e in eta_0_p_results],
        'eta_s_p': [complex(e) for e in eta_s_p_results],
        # Constantes ópticas
        'optical_constants': optical_constants,
        # Metadata
        'angle_deg': angle,
        'n_ambient': float(n_ambient),
        'k_ambient': float(k_ambient),
        'n_substrate': float(n_substrate),
        'k_substrate': float(k_substrate)
    }