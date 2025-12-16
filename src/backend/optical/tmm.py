"""
Método de Matriz de Transferencia (Transfer Matrix Method - TMM)
para cálculo de reflectancia y ángulos elipsométricos Psi y Delta
"""
import numpy as np
from .conversions import nk_to_epsilon, degrees_to_radians
from .dispersion_models import get_nk_from_model
from .emt import calculate_effective_medium


def transfer_matrix(n_complex, thickness, wavelength, angle, polarization='p'):
    """
    Calcula la matriz de transferencia para una capa
    
    Args:
        n_complex: Índice de refracción complejo (n + ik)
        thickness: Espesor de la capa en nm
        wavelength: Longitud de onda en nm
        angle: Ángulo de incidencia en el medio (radianes)
        polarization: 'p' (TM) o 's' (TE)
    
    Returns:
        M: Matriz de transferencia 2x2
    """
    # ⭐ CORRECCIÓN: Asegurar tipos correctos
    n_complex = complex(n_complex)
    thickness = float(thickness)
    wavelength = float(wavelength)
    angle = float(angle)
    
    # Componente perpendicular del vector de onda
    k_z = 2 * np.pi * n_complex * np.cos(angle) / wavelength
    
    # Fase
    delta = k_z * thickness
    
    # Impedancia óptica
    if polarization == 'p':
        eta = n_complex / np.cos(angle)
    else:  # polarization == 's'
        eta = n_complex * np.cos(angle)
    
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
    # ⭐ CORRECCIÓN: Convertir tipos
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
    
    Returns:
        r: Coeficiente de reflexión complejo
    """
    # ⭐ CORRECCIÓN: Asegurar tipos
    n_ambient = float(n_ambient)
    n_substrate = float(n_substrate)
    wavelength = float(wavelength)
    theta_0 = float(theta_0)
    
    # Índices complejos
    n_0 = complex(n_ambient, 0)
    n_s = complex(n_substrate, 0)
    
    # Producto de matrices de transferencia
    M_total = np.eye(2, dtype=complex)
    
    theta = theta_0  # Ángulo en el medio ambiente
    
    for n, k, d in zip(layers_n, layers_k, layers_thickness):
        # ⭐ CORRECCIÓN: Convertir a tipos correctos
        n = float(n)
        k = float(k)
        d = float(d)
        
        n_layer = complex(n, k)
        
        # Ley de Snell: n₀·sin(θ₀) = n·sin(θ)
        sin_theta = (n_0 / n_layer) * np.sin(theta_0)
        
        # Evitar valores > 1 por reflexión total interna
        if np.abs(sin_theta) > 1:
            cos_theta = 1j * np.sqrt(sin_theta**2 - 1)
        else:
            cos_theta = np.sqrt(1 - sin_theta**2)
        
        theta_layer = np.arcsin(sin_theta) if np.abs(sin_theta) <= 1 else np.pi/2
        
        # ⭐ CORRECCIÓN: Asegurar que theta_layer sea float real
        theta_layer = float(np.real(theta_layer))
        
        # Matriz de transferencia de esta capa
        M = transfer_matrix(n_layer, d, wavelength, theta_layer, polarization)
        M_total = M_total @ M
    
    # Impedancias ópticas
    # Ángulo en el sustrato
    sin_theta_s = (n_0 / n_s) * np.sin(theta_0)
    if np.abs(sin_theta_s) > 1:
        cos_theta_s = 1j * np.sqrt(sin_theta_s**2 - 1)
    else:
        cos_theta_s = np.sqrt(1 - sin_theta_s**2)
    
    if polarization == 'p':
        eta_0 = n_0 / np.cos(theta_0)
        eta_s = n_s / cos_theta_s
    else:  # 's'
        eta_0 = n_0 * np.cos(theta_0)
        eta_s = n_s * cos_theta_s
    
    # Coeficientes de Fresnel desde la matriz total
    M11, M12 = M_total[0, 0], M_total[0, 1]
    M21, M22 = M_total[1, 0], M_total[1, 1]
    
    # Coeficiente de reflexión
    r = (eta_0 * M11 + eta_0 * eta_s * M12 - M21 - eta_s * M22) / \
        (eta_0 * M11 + eta_0 * eta_s * M12 + M21 + eta_s * M22)
    
    return r


def calculate_psi_delta(r_p, r_s):
    """
    Calcula los ángulos elipsométricos Psi y Delta
    
    Psi y Delta están relacionados con el coeficiente de reflexión complejo:
    rho = r_p / r_s = tan(Psi) · exp(i·Delta)
    
    Args:
        r_p: Coeficiente de reflexión para polarización p (complejo)
        r_s: Coeficiente de reflexión para polarización s (complejo)
    
    Returns:
        psi_deg, delta_deg: Ángulos Psi y Delta en grados
    """
    # Relación de Fresnel compleja
    rho = r_p / r_s
    
    # Psi: magnitud de rho
    psi_rad = np.arctan(np.abs(rho))
    psi_deg = np.rad2deg(psi_rad)
    
    # Delta: fase de rho
    delta_rad = np.angle(rho)
    delta_deg = np.rad2deg(delta_rad)
    
    # Asegurar que Delta esté en [0, 360)
    delta_deg = np.mod(delta_deg, 360)
    
    return float(psi_deg), float(delta_deg)


def run_tmm_calculation(model_data):
    """
    Ejecuta el cálculo TMM completo para un modelo óptico
    
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
        
        # Calcular Psi y Delta
        psi, delta = calculate_psi_delta(r_p, r_s)
        
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