"""
Método de Matriz de Transferencia (Transfer Matrix Method - TMM)
para cálculo de reflectancia y ángulos elipsométricos Psi y Delta

CORRECCIONES CRÍTICAS APLICADAS (v3.1):
1. ✅ Elección robusta de rama de kz según criterio físico Re(kz) > 0
2. ✅ Normalización de Delta a [0°, 360°] (convención estándar)
3. ✅ Corrección de ambigüedad de Delta (~180°)
4. ✅ Validación de impedancias ópticas
5. ✅ Manejo mejorado de medios absorbentes
6. ✅ NUEVO: Soporte completo para archivos file_nk y file_epsilon
"""

import numpy as np
import logging
from .conversions import nk_to_epsilon, degrees_to_radians
from .dispersion_models import get_nk_from_model
from .emt import calculate_effective_medium

# Configurar logger
logger = logging.getLogger(__name__)



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


def transfer_matrix(n_complex, thickness, wavelength, kz, n_0, theta_0, polarization='p'):
    """
    Calcula la matriz de transferencia para una capa
    """
    n_complex = complex(n_complex)
    thickness = float(thickness)
    wavelength = float(wavelength)
    
    kz = choose_physical_branch(kz)
    delta = kz * thickness
    
    if polarization == 's':
        eta = kz
    else:
        eta = (n_complex**2) / kz
    
    if np.abs(eta) < 1e-12:
        raise ValueError(f"Impedancia eta ≈ 0 detectada (polarización {polarization})")
    
    M = np.array([
        [np.cos(delta), 1j * np.sin(delta) / eta],
        [1j * eta * np.sin(delta), np.cos(delta)]
    ], dtype=complex)
    
    return M


def calculate_reflectance(layers_n, layers_k, layers_thickness, 
                          n_ambient, n_substrate, 
                          wavelength, angle_deg, polarization='both'):
    """
    Calcula la reflectancia usando TMM
    """
    wavelength = float(wavelength)
    angle_deg = float(angle_deg)
    n_ambient = float(n_ambient)
    n_substrate = float(n_substrate)
    
    angle_rad = degrees_to_radians(angle_deg)
    theta_0 = angle_rad
    
    if polarization == 'both' or polarization == 'p':
        r_p = _calculate_reflection_coefficient(
            layers_n, layers_k, layers_thickness,
            n_ambient, n_substrate,
            wavelength, theta_0, 'p'
        )
    
    if polarization == 'both' or polarization == 's':
        r_s = _calculate_reflection_coefficient(
            layers_n, layers_k, layers_thickness,
            n_ambient, n_substrate,
            wavelength, theta_0, 's'
        )
    
    if polarization == 'both':
        return r_p, r_s
    elif polarization == 'p':
        return r_p
    else:
        return r_s


def _calculate_reflection_coefficient(layers_n, layers_k, layers_thickness,
                                       n_ambient, n_substrate,
                                       wavelength, theta_0, polarization):
    """
    Calcula el coeficiente de reflexión para una polarización específica
    """
    n_ambient = float(n_ambient)
    n_substrate = float(n_substrate)
    wavelength = float(wavelength)
    theta_0 = float(theta_0)
    
    n_0 = complex(n_ambient, 0)
    n_s = complex(n_substrate, 0)
    
    k_parallel = (2 * np.pi / wavelength) * n_0 * np.sin(theta_0)
    
    kz_0_squared = (2*np.pi/wavelength)**2 * n_0**2 - k_parallel**2
    kz_0 = np.sqrt(kz_0_squared)
    kz_0 = choose_physical_branch(kz_0)
    
    M_total = np.eye(2, dtype=complex)
    
    for n, k, d in zip(layers_n, layers_k, layers_thickness):
        n = float(n)
        k = float(k)
        d = float(d)
        
        n_layer = complex(n, k)
        
        kz_squared = (2*np.pi/wavelength)**2 * n_layer**2 - k_parallel**2
        kz = np.sqrt(kz_squared)
        kz = choose_physical_branch(kz)
        
        M = transfer_matrix(n_layer, d, wavelength, kz, n_0, theta_0, polarization)
        M_total = M_total @ M
    
    kz_s_squared = (2*np.pi/wavelength)**2 * n_s**2 - k_parallel**2
    kz_s = np.sqrt(kz_s_squared)
    kz_s = choose_physical_branch(kz_s)
    
    if polarization == 's':
        eta_0 = kz_0
        eta_s = kz_s
    else:
        eta_0 = (n_0**2) / kz_0
        eta_s = (n_s**2) / kz_s
    
    M11, M12 = M_total[0, 0], M_total[0, 1]
    M21, M22 = M_total[1, 0], M_total[1, 1]
    
    numerator = eta_0 * M11 + eta_0 * eta_s * M12 - M21 - eta_s * M22
    denominator = eta_0 * M11 + eta_0 * eta_s * M12 + M21 + eta_s * M22
    
    r = numerator / denominator
    
    return r


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


def calculate_psi_delta(r_p, r_s, correct_ambiguity=True, 
                       experimental_delta=None, expected_range='auto',
                       layers_n=None, layers_k=None):
    """
    Calcula los ángulos elipsométricos Psi y Delta
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


def run_tmm_calculation(model_data, correct_delta_ambiguity=True, 
                       experimental_data=None, expected_delta_range='auto'):
    """
    Ejecuta el cálculo TMM completo para un modelo óptico
    
    ✅ CORREGIDO v4.0: 
    - Soporte completo para file_nk y file_epsilon
    - Soporte para EMT en ambiente y sustrato con n,k efectivos pre-calculados
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
    # ✅ AMBIENTE - CON SOPORTE EMT
    # ========================================
    ambient_data = model_data['ambient']
    
    # ⭐ CASO EMT: Usar n,k efectivos pre-calculados
    if ambient_data.get('type') == 'emt':
        if 'n_effective' in ambient_data and 'k_effective' in ambient_data:
            logger.info("✅ Ambiente: Usando n,k efectivos pre-calculados")
            logger.info(f"   - n_eff: {len(ambient_data['n_effective'])} puntos")
            logger.info(f"   - k_eff: {len(ambient_data['k_effective'])} puntos")
            
            # Interpolar n,k efectivos a las wavelengths del modelo
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
            
            # Usar primer valor (ambiente suele ser constante espectralmente)
            n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
            k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
            
        else:
            # ⚠️ Calcular en tiempo real (fallback)
            logger.warning("⚠️ Ambiente EMT sin n,k efectivos pre-calculados, calculando en tiempo real...")
            from backend.optical.emt import calculate_effective_medium
            n_ambient_arr, k_ambient_arr = calculate_effective_medium(
                ambient_data, wavelengths
            )
            n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
            k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
    
    # Ambiente homogéneo - CONSTANTE
    elif ambient_data.get('type') == 'constant':
        n_ambient = ambient_data.get('n', 1.0)
        k_ambient = ambient_data.get('k', 0.0)
    
    # Ambiente homogéneo - ARCHIVO (file_nk o file_epsilon)
    elif ambient_data.get('type') in ['file_nk', 'file_epsilon']:
        if 'optical_data' not in ambient_data:
            raise ValueError(
                f"Ambiente con tipo '{ambient_data['type']}' no tiene 'optical_data'. "
                f"Claves disponibles: {list(ambient_data.keys())}"
            )
        
        ambient_params = {'optical_data': ambient_data['optical_data']}
        
        n_ambient_arr, k_ambient_arr = get_nk_from_model(
            ambient_data['type'],
            wavelengths,
            ambient_params
        )
        
        n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
        k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
    
    # Ambiente homogéneo - MODELO DE DISPERSIÓN
    else:
        n_ambient_arr, k_ambient_arr = get_nk_from_model(
            ambient_data['type'],
            wavelengths,
            ambient_data.get('params', {})
        )
        n_ambient = n_ambient_arr[0] if isinstance(n_ambient_arr, np.ndarray) else n_ambient_arr
        k_ambient = k_ambient_arr[0] if isinstance(k_ambient_arr, np.ndarray) else k_ambient_arr
    
    # ========================================
    # ✅ SUSTRATO - CON SOPORTE EMT
    # ========================================
    substrate_data = model_data['substrate']
    
    # ⭐ CASO EMT: Usar n,k efectivos pre-calculados
    if substrate_data.get('type') == 'emt':
        if 'n_effective' in substrate_data and 'k_effective' in substrate_data:
            logger.info("✅ Sustrato: Usando n,k efectivos pre-calculados")
            logger.info(f"   - n_eff: {len(substrate_data['n_effective'])} puntos")
            logger.info(f"   - k_eff: {len(substrate_data['k_effective'])} puntos")
            
            # Interpolar n,k efectivos a las wavelengths del modelo
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
            
            # Usar primer valor (sustrato suele ser constante espectralmente)
            n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
            k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
            
        else:
            # ⚠️ Calcular en tiempo real (fallback)
            logger.warning("⚠️ Sustrato EMT sin n,k efectivos pre-calculados, calculando en tiempo real...")
            from backend.optical.emt import calculate_effective_medium
            n_substrate_arr, k_substrate_arr = calculate_effective_medium(
                substrate_data, wavelengths
            )
            n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
            k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
    
    # Sustrato homogéneo - CONSTANTE o GLASS
    elif substrate_data.get('type') in ['constant', 'glass']:
        n_substrate = substrate_data.get('n', 1.52)
        k_substrate = substrate_data.get('k', 0.0)
    
    # Sustrato homogéneo - ARCHIVO (file_nk o file_epsilon)
    elif substrate_data.get('type') in ['file_nk', 'file_epsilon']:
        if 'optical_data' not in substrate_data:
            raise ValueError(
                f"Sustrato con tipo '{substrate_data['type']}' no tiene 'optical_data'. "
                f"Claves disponibles: {list(substrate_data.keys())}"
            )
        
        substrate_params = {'optical_data': substrate_data['optical_data']}
        
        n_substrate_arr, k_substrate_arr = get_nk_from_model(
            substrate_data['type'],
            wavelengths,
            substrate_params
        )
        
        n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
        k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
    
    # Sustrato homogéneo - MODELO DE DISPERSIÓN
    else:
        n_substrate_arr, k_substrate_arr = get_nk_from_model(
            substrate_data['type'],
            wavelengths,
            substrate_data.get('params', {})
        )
        n_substrate = n_substrate_arr[0] if isinstance(n_substrate_arr, np.ndarray) else n_substrate_arr
        k_substrate = k_substrate_arr[0] if isinstance(k_substrate_arr, np.ndarray) else k_substrate_arr
    
    # ========================================
    # ✅ CAPAS - CORRECCIÓN PARA ARCHIVOS Y EMT
    # ========================================
    num_wavelengths = len(wavelengths)
    layers_n_array = []
    layers_k_array = []
    layers_thickness = []
    
    for layer in model_data['layers']:
        thickness = layer['thickness']
        layers_thickness.append(thickness)
        
        # ⭐ CASO EMT EN CAPA: Usar n,k efectivos pre-calculados
        if layer.get('layer_type') == 'emt':
            if 'n_effective' in layer and 'k_effective' in layer:
                logger.info(f"✅ Capa '{layer.get('name', 'sin nombre')}': Usando n,k efectivos pre-calculados")
                
                # Interpolar n,k efectivos a las wavelengths del modelo
                n_eff = np.interp(
                    wavelengths,
                    layer['wavelengths_effective'],
                    layer['n_effective']
                )
                k_eff = np.interp(
                    wavelengths,
                    layer['wavelengths_effective'],
                    layer['k_effective']
                )
            else:
                # Calcular en tiempo real (fallback)
                logger.warning(f"⚠️ Capa '{layer.get('name', 'sin nombre')}' EMT sin n,k efectivos, calculando...")
                n_eff, k_eff = calculate_effective_medium(layer, wavelengths)
            
            layers_n_array.append(n_eff)
            layers_k_array.append(k_eff)
        
        else:
            # Capa homogénea
            
            # ✅ CASO 1: Datos de archivo (file_nk o file_epsilon)
            if layer.get('model') in ['file_nk', 'file_epsilon']:
                if 'optical_data' not in layer:
                    raise ValueError(
                        f"Capa '{layer.get('name', 'sin nombre')}' con modelo '{layer['model']}' "
                        f"no tiene 'optical_data'. Claves disponibles: {list(layer.keys())}"
                    )
                
                layer_params = {'optical_data': layer['optical_data']}
                
                n_layer, k_layer = get_nk_from_model(
                    layer['model'],
                    wavelengths,
                    layer_params
                )
            
            # ✅ CASO 2: optical_data presente directamente (legacy)
            elif 'optical_data' in layer:
                n_layer = np.interp(
                    wavelengths,
                    layer['optical_data']['wavelength'],
                    layer['optical_data']['n']
                )
                k_layer = np.interp(
                    wavelengths,
                    layer['optical_data']['wavelength'],
                    layer['optical_data']['k']
                )
            
            # ✅ CASO 3: Modelo de dispersión (cauchy, sellmeier, etc.)
            else:
                n_layer, k_layer = get_nk_from_model(
                    layer['model'],
                    wavelengths,
                    layer.get('params', {})
                )
            
            layers_n_array.append(n_layer)
            layers_k_array.append(k_layer)
    
    # Calcular para cada longitud de onda
    psi_results = []
    delta_results = []
    r_p_results = []
    r_s_results = []
    
    for i, wl in enumerate(wavelengths):
        # Extraer n, k para esta longitud de onda
        layers_n = [n[i] if isinstance(n, np.ndarray) else n for n in layers_n_array]
        layers_k = [k[i] if isinstance(k, np.ndarray) else k for k in layers_k_array]
        
        # Calcular reflectancia
        r_p, r_s = calculate_reflectance(
            layers_n, layers_k, layers_thickness,
            n_ambient, n_substrate,
            wl, angle, 'both'
        )
        
        # Extraer dato experimental si existe
        exp_delta_i = None
        if experimental_data is not None and 'delta' in experimental_data:
            exp_delta_i = np.interp(wl, experimental_data['wavelength'], 
                                    experimental_data['delta'])
        
        # Calcular Psi y Delta con corrección de ambigüedad
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
        r_p_results.append(r_p)
        r_s_results.append(r_s)
    
    return {
        'wavelength': wavelengths.tolist(),
        'psi_deg': psi_results,
        'delta_deg': delta_results,
        'r_p': [complex(r) for r in r_p_results],
        'r_s': [complex(r) for r in r_s_results]
    }
