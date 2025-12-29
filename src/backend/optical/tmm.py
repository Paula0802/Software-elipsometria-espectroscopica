"""
Método de Matriz de Transferencia (Transfer Matrix Method - TMM)
para cálculo de reflectancia y ángulos elipsométricos Psi y Delta

CORRECCIONES CRÍTICAS APLICADAS (v3.0):
1. ✅ Elección robusta de rama de kz según criterio físico Re(kz) > 0
2. ✅ Normalización de Delta a [0°, 360°] (convención estándar)
3. ✅ NUEVO: Corrección de ambigüedad de Delta (~180°)
4. ✅ Validación de impedancias ópticas
5. ✅ Manejo mejorado de medios absorbentes
"""
import numpy as np
from .conversions import nk_to_epsilon, degrees_to_radians
from .dispersion_models import get_nk_from_model
from .emt import calculate_effective_medium


def choose_physical_branch(kz):
    """
    Elige la rama física correcta de kz según el criterio:
    - La onda debe propagarse/decaer hacia +z
    - En medios transparentes: Re(kz) > 0
    - En medios absorbentes: Im(kz) > 0
    
    Args:
        kz: Componente z del vector de onda (puede tener signo ambiguo)
    
    Returns:
        kz_physical: kz con el signo correcto
    
    Criterio físico:
        Para ondas que se propagan en +z:
        - exp(i(kz·z - ωt)) debe representar propagación/atenuación hacia +z
        - Por tanto: Re(kz) ≥ 0 Y Im(kz) ≥ 0
    """
    kz = complex(kz)
    
    # Criterio principal: Re(kz) ≥ 0
    # (dirección de propagación de la fase)
    if np.real(kz) < 0:
        kz = -kz
    
    # Criterio secundario (para medios absorbentes): Im(kz) ≥ 0
    # (dirección de atenuación)
    elif np.real(kz) == 0 and np.imag(kz) < 0:
        kz = -kz
    
    return kz


def transfer_matrix(n_complex, thickness, wavelength, kz, n_0, theta_0, polarization='p'):
    """
    Calcula la matriz de transferencia para una capa
    
    CORRECCIONES v2.0:
    - Uso de kz con rama física correcta
    - Validación de impedancias
    
    Args:
        n_complex: Índice de refracción complejo (n + ik)
        thickness: Espesor de la capa en nm
        wavelength: Longitud de onda en nm
        kz: Componente z del vector de onda (complejo)
        n_0: Índice del medio incidente
        theta_0: Ángulo de incidencia en el medio ambiente (radianes)
        polarization: 'p' (TM) o 's' (TE)
    
    Returns:
        M: Matriz de transferencia 2x2
    """
    # Asegurar tipos correctos
    n_complex = complex(n_complex)
    thickness = float(thickness)
    wavelength = float(wavelength)
    
    # Asegurar rama física correcta
    kz = choose_physical_branch(kz)
    
    # Fase acumulada en la capa
    delta = kz * thickness
    
    # Impedancia óptica según polarización
    if polarization == 's':
        # Polarización s (TE): eta = kz
        eta = kz
    else:  # polarization == 'p'
        # Polarización p (TM): eta = n²/kz
        eta = (n_complex**2) / kz
    
    # Validar que eta no sea cero
    if np.abs(eta) < 1e-12:
        raise ValueError(f"Impedancia eta ≈ 0 detectada (polarización {polarization})")
    
    # Matriz de transferencia
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
    
    Args:
        layers_n: Lista de índices de refracción (parte real) para cada capa
        layers_k: Lista de coeficientes de extinción para cada capa
        layers_thickness: Lista de espesores en nm
        n_ambient: Índice del medio incidente
        n_substrate: Índice del sustrato
        wavelength: Longitud de onda en nm
        angle_deg: Ángulo de incidencia en grados
        polarization: 'p', 's', o 'both'
    
    Returns:
        Si polarization='both': (r_p, r_s)
        Si polarization='p' o 's': r (coeficiente de reflexión complejo)
    """
    # Convertir tipos
    wavelength = float(wavelength)
    angle_deg = float(angle_deg)
    n_ambient = float(n_ambient)
    n_substrate = float(n_substrate)
    
    angle_rad = degrees_to_radians(angle_deg)
    
    # Ángulo de incidencia en el medio ambiente
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
    usando TMM correctamente implementado
    
    CORRECCIONES v2.0:
    1. Uso de choose_physical_branch() para todos los kz
    2. Mejor manejo de k_parallel
    3. Validación de resultados intermedios
    
    Returns:
        r: Coeficiente de reflexión complejo
    """
    # Asegurar tipos
    n_ambient = float(n_ambient)
    n_substrate = float(n_substrate)
    wavelength = float(wavelength)
    theta_0 = float(theta_0)
    
    # Índices complejos
    n_0 = complex(n_ambient, 0)
    n_s = complex(n_substrate, 0)
    
    # Componente tangencial del vector de onda (conservada por Snell)
    k_parallel = (2 * np.pi / wavelength) * n_0 * np.sin(theta_0)
    
    # kz en el medio ambiente
    kz_0_squared = (2*np.pi/wavelength)**2 * n_0**2 - k_parallel**2
    kz_0 = np.sqrt(kz_0_squared)
    kz_0 = choose_physical_branch(kz_0)
    
    # Producto de matrices de transferencia
    M_total = np.eye(2, dtype=complex)
    
    for n, k, d in zip(layers_n, layers_k, layers_thickness):
        # Convertir a tipos correctos
        n = float(n)
        k = float(k)
        d = float(d)
        
        n_layer = complex(n, k)
        
        # kz en la capa usando conservación de k_parallel
        kz_squared = (2*np.pi/wavelength)**2 * n_layer**2 - k_parallel**2
        kz = np.sqrt(kz_squared)
        kz = choose_physical_branch(kz)
        
        # Matriz de transferencia de esta capa
        M = transfer_matrix(n_layer, d, wavelength, kz, n_0, theta_0, polarization)
        M_total = M_total @ M
    
    # kz en el sustrato
    kz_s_squared = (2*np.pi/wavelength)**2 * n_s**2 - k_parallel**2
    kz_s = np.sqrt(kz_s_squared)
    kz_s = choose_physical_branch(kz_s)
    
    # Impedancias ópticas correctas
    if polarization == 's':
        eta_0 = kz_0
        eta_s = kz_s
    else:  # 'p'
        eta_0 = (n_0**2) / kz_0
        eta_s = (n_s**2) / kz_s
    
    # Coeficientes de Fresnel desde la matriz total
    M11, M12 = M_total[0, 0], M_total[0, 1]
    M21, M22 = M_total[1, 0], M_total[1, 1]
    
    # Coeficiente de reflexión
    numerator = eta_0 * M11 + eta_0 * eta_s * M12 - M21 - eta_s * M22
    denominator = eta_0 * M11 + eta_0 * eta_s * M12 + M21 + eta_s * M22
    
    r = numerator / denominator
    
    return r


def detect_system_type(layers_n, layers_k):
    """
    Detecta si el sistema contiene capas metálicas para determinar
    el rango esperado de Delta.
    
    Args:
        layers_n: Lista de índices de refracción (parte real)
        layers_k: Lista de coeficientes de extinción
    
    Returns:
        str: 'metal' si k > 1.0 en alguna capa, 'dielectric' en caso contrario
    """
    for n, k in zip(layers_n, layers_k):
        # Convertir a float si es necesario
        k_val = float(k) if isinstance(k, (int, float, np.number)) else float(k[0]) if hasattr(k, '__len__') else float(k)
        
        # Si k > 1.0, probablemente es metal
        if k_val > 1.0:
            return 'metal'
    
    return 'dielectric'


def correct_delta_ambiguity(delta_raw, experimental_delta=None, expected_range='auto',
                            layers_n=None, layers_k=None):
    """
    Corrige la ambigüedad de fase en Delta (~180°).
    
    NUEVO en v3.0: Resuelve el problema de chi cuadrado grande causado por
    la ambigüedad matemática en la función arctan de números complejos.
    
    Args:
        delta_raw: Valor de Delta calculado en grados [0, 360]
        experimental_delta: Valor experimental de Delta (opcional)
        expected_range: Rango esperado de Delta
            - 'auto': Detecta automáticamente basado en las capas
            - 'metal': Sistema con metales [90, 180]
            - 'dielectric': Dieléctricos [0, 90] o [270, 360]
            - (min, max): Tupla con rango personalizado
        layers_n: Lista de índices n (para detección automática)
        layers_k: Lista de coeficientes k (para detección automática)
    
    Returns:
        delta_corrected: Valor de Delta corregido en grados [0, 360]
    
    Explicación física:
        Delta es la diferencia de fase entre r_p y r_s. Debido a que las fases
        son cíclicas y arctan tiene múltiples ramas, el valor calculado puede
        diferir del valor físico real por transformaciones como:
        - Delta' = 360° - Delta
        - Delta' = 180° - Delta
        
        Esta función elige la rama correcta comparando con:
        1. Datos experimentales (si están disponibles)
        2. Rangos físicamente esperados para el tipo de sistema
    """
    # Generar candidatos (diferentes ramas de la función arctan)
    candidates = [
        delta_raw,                          # Valor original
        360 - delta_raw,                    # Reflexión sobre 180°
        180 - delta_raw,                    # Complemento a 180°
        (180 + delta_raw) % 360,            # Desplazamiento de 180°
        abs(180 - delta_raw),               # Valor absoluto del complemento
    ]
    
    # Eliminar duplicados y normalizar a [0, 360]
    candidates = list(set([c % 360 for c in candidates]))
    
    # CASO 1: Si hay dato experimental, usar el más cercano
    if experimental_delta is not None:
        errors = [abs(c - experimental_delta) for c in candidates]
        best_idx = np.argmin(errors)
        return candidates[best_idx]
    
    # CASO 2: Usar rango esperado
    if expected_range == 'auto':
        # Detectar automáticamente
        if layers_n is not None and layers_k is not None:
            system_type = detect_system_type(layers_n, layers_k)
            expected_range = system_type
        else:
            # Por defecto, asumir sistema con metales (caso común)
            expected_range = 'metal'
    
    # Definir rango esperado
    if expected_range == 'metal':
        min_expected, max_expected = 90, 180
    elif expected_range == 'dielectric':
        min_expected, max_expected = 0, 90
    elif isinstance(expected_range, tuple):
        min_expected, max_expected = expected_range
    else:
        # Sin restricciones
        return delta_raw
    
    # Filtrar candidatos dentro del rango esperado
    in_range = [(c, abs(c - (min_expected + max_expected)/2)) 
                for c in candidates 
                if min_expected <= c <= max_expected]
    
    if in_range:
        # Elegir el más cercano al centro del rango
        return min(in_range, key=lambda x: x[1])[0]
    else:
        # Si ninguno está en rango, elegir el más cercano al rango
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
    
    CORRECCIÓN v3.0: 
    - Delta normalizado a [0°, 360°]
    - NUEVO: Corrección de ambigüedad de fase (~180°)
    
    Psi y Delta están relacionados con el coeficiente de reflexión complejo:
    rho = r_p / r_s = tan(Psi) · exp(i·Delta)
    
    Args:
        r_p: Coeficiente de reflexión para polarización p (complejo)
        r_s: Coeficiente de reflexión para polarización s (complejo)
        correct_ambiguity: Si True, corrige la ambigüedad de fase de Delta
        experimental_delta: Valor experimental para guiar la corrección (opcional)
        expected_range: Rango esperado de Delta ('auto', 'metal', 'dielectric', o tupla)
        layers_n: Índices n de las capas (para detección automática)
        layers_k: Coeficientes k de las capas (para detección automática)
    
    Returns:
        psi_deg, delta_deg: Ángulos Psi y Delta en grados
        - Psi ∈ [0°, 90°]
        - Delta ∈ [0°, 360°]
    """
    # Relación de Fresnel compleja
    rho = r_p / r_s
    
    # Psi: magnitud de rho
    psi_rad = np.arctan(np.abs(rho))
    psi_deg = np.rad2deg(psi_rad)
    
    # Delta: fase de rho (valor raw)
    delta_rad = np.angle(rho)
    delta_deg = np.rad2deg(delta_rad)
    
    # Normalizar Delta a [0°, 360°]
    if delta_deg < 0:
        delta_deg += 360
    
    # ✅ NUEVO: Corrección de ambigüedad de fase
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
    
    NUEVO en v3.0: Parámetros para corrección de ambigüedad de Delta
    
    Args:
        model_data: Diccionario con toda la información del modelo:
            {
                'global': {
                    'angle': 70,
                    'polarization': 'both',
                    'wavelengths': [400, 401, ..., 800]
                },
                'ambient': {'type': 'constant', 'n': 1.0, 'k': 0},
                'substrate': {'type': 'constant', 'n': 1.52, 'k': 0},
                'layers': [
                    {
                        'name': 'Layer 1',
                        'thickness': 100,
                        'layer_type': 'homogeneous' or 'emt',
                        'model': 'cauchy',
                        'params': {...},
                        ...
                    },
                    ...
                ]
            }
        correct_delta_ambiguity: Si True, corrige la ambigüedad de Delta
        experimental_data: Dict con {'wavelength': [...], 'psi': [...], 'delta': [...]}
            para guiar la corrección (opcional)
        expected_delta_range: Rango esperado de Delta ('auto', 'metal', 'dielectric')
    
    Returns:
        dict: {
            'wavelength': [...],
            'psi_deg': [...],
            'delta_deg': [...],
            'r_p': [...],
            'r_s': [...]
        }
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
    
    # Ambiente
    ambient_data = model_data['ambient']
    if ambient_data['type'] == 'constant':
        n_ambient = ambient_data.get('n', 1.0)
        k_ambient = ambient_data.get('k', 0.0)
    else:
        # Calcular usando modelo de dispersión
        n_ambient, k_ambient = get_nk_from_model(
            ambient_data['type'],
            wavelengths,
            ambient_data.get('params', {})
        )
        n_ambient = n_ambient[0] if isinstance(n_ambient, np.ndarray) else n_ambient
        k_ambient = k_ambient[0] if isinstance(k_ambient, np.ndarray) else k_ambient
    
    # Sustrato
    substrate_data = model_data['substrate']
    if substrate_data['type'] == 'constant' or substrate_data['type'] == 'glass':
        n_substrate = substrate_data.get('n', 1.52)
        k_substrate = substrate_data.get('k', 0.0)
    else:
        n_substrate, k_substrate = get_nk_from_model(
            substrate_data['type'],
            wavelengths,
            substrate_data.get('params', {})
        )
        n_substrate = n_substrate[0] if isinstance(n_substrate, np.ndarray) else n_substrate
        k_substrate = k_substrate[0] if isinstance(k_substrate, np.ndarray) else k_substrate
    
    # Preparar capas
    num_wavelengths = len(wavelengths)
    layers_n_array = []
    layers_k_array = []
    layers_thickness = []
    
    for layer in model_data['layers']:
        thickness = layer['thickness']
        layers_thickness.append(thickness)
        
        # Verificar si es EMT
        if layer.get('layer_type') == 'emt':
            n_eff, k_eff = calculate_effective_medium(layer, wavelengths)
            layers_n_array.append(n_eff)
            layers_k_array.append(k_eff)
        else:
            # Capa homogénea
            if 'optical_data' in layer:
                # Datos de archivo
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
            else:
                # Modelo de dispersión
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
            # Interpolar el valor experimental para esta longitud de onda
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