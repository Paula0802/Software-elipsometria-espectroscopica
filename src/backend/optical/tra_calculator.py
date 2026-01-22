"""
Cálculo de Transmitancia, Reflectancia y Absorbancia espectrales
a partir de resultados TMM

==========================================
VERSIÓN 3.0 - CON ABSORCIÓN POR CAPA
==========================================

FÍSICA IMPLEMENTADA:

1. REFLECTANCIA:
   Rs = |r_s|²
   Rp = |r_p|²

2. TRANSMITANCIA:
   Ts,p = (n_sub * cos(θ_sub)) / (n_inc * cos(θ_inc)) * |t_s,p|²

3. ABSORBANCIA TOTAL:
   A_total = 1 - R - T

4. ABSORCIÓN POR CAPA (NUEVO):
   - Constante de absorción: α_j(λ) = 4πk_j(λ)/λ
   - Campo eléctrico: E_j(z) = A_j * exp(i*kz_j*z) + B_j * exp(-i*kz_j*z)
   - Absorción de capa j: A_j(λ) = α_j(λ) * ∫|E_j(z)|² dz
   
5. VERIFICACIÓN:
   Σ A_j(λ) + R(λ) + T(λ) = 1

MANEJO DE POLARIZACIÓN:
- polarization = 's':    Solo polarización S (TE)
- polarization = 'p':    Solo polarización P (TM)
- polarization = 'both': Promedio de ambas (luz no polarizada)

NOTA: Las magnitudes Ψ y Δ del elipsómetro se calculan en otro módulo
y NO deben mezclarse con R, T y A.
"""

import numpy as np
import logging
from typing import Dict, Any, List, Tuple, Optional

logger = logging.getLogger(__name__)


# ==========================================
# FUNCIONES AUXILIARES TMM
# ==========================================

def _choose_physical_branch(kz: complex) -> complex:
    """
    Elige la rama física correcta de kz.
    La onda debe propagarse/decaer hacia +z.
    - En medios transparentes: Re(kz) > 0
    - En medios absorbentes: Im(kz) > 0
    """
    kz = complex(kz)
    
    if np.real(kz) < 0:
        kz = -kz
    elif np.real(kz) == 0 and np.imag(kz) < 0:
        kz = -kz
    
    return kz


def _interface_matrix(eta_i: complex, eta_j: complex) -> np.ndarray:
    """
    Matriz de interfaz entre dos medios.
    
    D_ij = (1/2) * [[1 + eta_j/eta_i,  1 - eta_j/eta_i],
                    [1 - eta_j/eta_i,  1 + eta_j/eta_i]]
    """
    if np.abs(eta_i) < 1e-15:
        eta_i = 1e-15
    
    ratio = eta_j / eta_i
    
    D = 0.5 * np.array([
        [1 + ratio, 1 - ratio],
        [1 - ratio, 1 + ratio]
    ], dtype=complex)
    
    return D


def _propagation_matrix(kz: complex, thickness: float) -> np.ndarray:
    """
    Matriz de propagación dentro de una capa.
    
    P = [[exp(i*kz*d),  0],
         [0,  exp(-i*kz*d)]]
    """
    phase = kz * thickness
    
    P = np.array([
        [np.exp(1j * phase), 0],
        [0, np.exp(-1j * phase)]
    ], dtype=complex)
    
    return P


def _get_eta(n_complex: complex, kz: complex, polarization: str) -> complex:
    """
    Calcula la impedancia óptica η según la polarización.
    
    Para polarización S (TE): η = kz
    Para polarización P (TM): η = n² / kz
    """
    if polarization == 's':
        return kz
    else:  # 'p'
        if np.abs(kz) < 1e-15:
            kz = 1e-15
        return (n_complex**2) / kz


# ==========================================
# CÁLCULO DE COEFICIENTES Y CAMPOS
# ==========================================

def calculate_tmm_fields(
    layers_n: List[float],
    layers_k: List[float],
    layers_thickness: List[float],
    n_ambient: float,
    k_ambient: float,
    n_substrate: float,
    k_substrate: float,
    wavelength: float,
    theta_inc: float,
    polarization: str
) -> Dict[str, Any]:
    """
    Calcula los coeficientes de campo (A_j, B_j) para cada capa usando TMM.
    
    Esta función implementa el TMM completo y retorna:
    - Coeficiente de reflexión r
    - Coeficiente de transmisión t
    - Coeficientes de campo A_j, B_j para cada capa
    - kz para cada capa
    
    El campo en cada capa es:
    E_j(z) = A_j * exp(i*kz_j*z) + B_j * exp(-i*kz_j*z)
    
    donde z es medido desde el inicio de cada capa.
    
    Args:
        layers_n: Lista de índices de refracción (parte real)
        layers_k: Lista de coeficientes de extinción
        layers_thickness: Lista de espesores en nm
        n_ambient, k_ambient: Propiedades del medio ambiente
        n_substrate, k_substrate: Propiedades del sustrato
        wavelength: Longitud de onda en nm
        theta_inc: Ángulo de incidencia en radianes
        polarization: 's' o 'p'
    
    Returns:
        Dict con r, t, field_coefficients, kz_values
    """
    # Índices complejos
    n_0 = complex(n_ambient, k_ambient)
    n_s = complex(n_substrate, k_substrate)
    
    # Vector de onda en vacío
    k0 = 2 * np.pi / wavelength
    
    # Componente paralela (conservada en todas las interfaces)
    k_parallel = k0 * n_0 * np.sin(theta_inc)
    
    # ==========================================
    # CALCULAR kz PARA TODOS LOS MEDIOS
    # ==========================================
    
    # kz en el ambiente
    kz_0_sq = (k0 * n_0)**2 - k_parallel**2
    kz_0 = _choose_physical_branch(np.sqrt(kz_0_sq))
    
    # kz en cada capa
    kz_layers = []
    n_layers_complex = []
    
    for n, k in zip(layers_n, layers_k):
        n_layer = complex(float(n), float(k))
        n_layers_complex.append(n_layer)
        
        kz_sq = (k0 * n_layer)**2 - k_parallel**2
        kz = _choose_physical_branch(np.sqrt(kz_sq))
        kz_layers.append(kz)
    
    # kz en el sustrato
    kz_s_sq = (k0 * n_s)**2 - k_parallel**2
    kz_s = _choose_physical_branch(np.sqrt(kz_s_sq))
    
    # ==========================================
    # CALCULAR IMPEDANCIAS ÓPTICAS
    # ==========================================
    eta_0 = _get_eta(n_0, kz_0, polarization)
    eta_s = _get_eta(n_s, kz_s, polarization)
    
    eta_layers = []
    for n_layer, kz in zip(n_layers_complex, kz_layers):
        eta = _get_eta(n_layer, kz, polarization)
        eta_layers.append(eta)
    
    # ==========================================
    # CONSTRUIR MATRIZ DE TRANSFERENCIA TOTAL
    # ==========================================
    num_layers = len(layers_thickness)
    
    if num_layers == 0:
        # Sin capas: solo interfaz ambiente-sustrato
        M_total = _interface_matrix(eta_0, eta_s)
    else:
        # Matriz de interfaz ambiente -> primera capa
        M_total = _interface_matrix(eta_0, eta_layers[0])
        
        for j in range(num_layers):
            # Propagación en capa j
            P_j = _propagation_matrix(kz_layers[j], layers_thickness[j])
            M_total = M_total @ P_j
            
            # Interfaz capa j -> siguiente (o sustrato)
            if j < num_layers - 1:
                D_j = _interface_matrix(eta_layers[j], eta_layers[j + 1])
            else:
                D_j = _interface_matrix(eta_layers[j], eta_s)
            
            M_total = M_total @ D_j
    
    # ==========================================
    # EXTRAER COEFICIENTES r y t
    # ==========================================
    M11, M12 = M_total[0, 0], M_total[0, 1]
    M21, M22 = M_total[1, 0], M_total[1, 1]
    
    # Coeficiente de reflexión
    if np.abs(M11) < 1e-15:
        r = 0
    else:
        r = M21 / M11
    
    # Coeficiente de transmisión
    if np.abs(M11) < 1e-15:
        t = 0
    else:
        t = 1 / M11
    
    # ==========================================
    # CALCULAR COEFICIENTES DE CAMPO A_j, B_j
    # ==========================================
    # Usamos el método de propagación hacia adelante
    # Empezando con la onda incidente normalizada a 1
    
    field_coefficients = []
    
    if num_layers == 0:
        # Sin capas
        pass
    else:
        # Vector de campo al inicio: [A_inc, B_inc] = [1, r]
        # donde A_inc es la onda que va hacia +z y B_inc la reflejada
        
        # Campo justo después de la primera interfaz
        D_0_1 = _interface_matrix(eta_0, eta_layers[0])
        
        # El campo incidente es [1, r] (normalizado)
        # Después de la primera interfaz:
        field_at_interface = np.array([1.0, r], dtype=complex)
        
        # Necesitamos propagar hacia adelante para obtener A_j, B_j en cada capa
        # Usaremos el método de matrices parciales
        
        # Calcular la matriz desde el ambiente hasta cada capa
        current_field = np.array([1.0, r], dtype=complex)
        
        # Primera interfaz
        D_inv = np.linalg.inv(_interface_matrix(eta_0, eta_layers[0]))
        field_after_first_interface = D_inv @ current_field
        
        # Campo al inicio de la primera capa
        A_1 = field_after_first_interface[0]
        B_1 = field_after_first_interface[1]
        field_coefficients.append({'A': A_1, 'B': B_1, 'kz': kz_layers[0]})
        
        # Propagar a través de las capas restantes
        current_A = A_1
        current_B = B_1
        
        for j in range(1, num_layers):
            # Propagar al final de la capa anterior
            P_prev = _propagation_matrix(kz_layers[j-1], layers_thickness[j-1])
            field_at_end = P_prev @ np.array([current_A, current_B])
            
            # Cruzar interfaz j-1 -> j
            D_inv = np.linalg.inv(_interface_matrix(eta_layers[j-1], eta_layers[j]))
            field_after_interface = D_inv @ field_at_end
            
            current_A = field_after_interface[0]
            current_B = field_after_interface[1]
            
            field_coefficients.append({
                'A': current_A, 
                'B': current_B, 
                'kz': kz_layers[j]
            })
    
    return {
        'r': r,
        't': t,
        'kz_0': kz_0,
        'kz_s': kz_s,
        'kz_layers': kz_layers,
        'eta_0': eta_0,
        'eta_s': eta_s,
        'field_coefficients': field_coefficients,
        'n_layers_complex': n_layers_complex,
        'n_0': n_0,
        'n_s': n_s
    }


def calculate_layer_absorption(
    A_j: complex,
    B_j: complex,
    kz_j: complex,
    k_j: float,
    thickness: float,
    wavelength: float,
    n_points: int = 100
) -> float:
    """
    Calcula la absorción en una capa específica.
    
    A_j(λ) = α_j(λ) * ∫₀^d |E_j(z)|² dz
    
    donde:
    - α_j = 4πk_j/λ es la constante de absorción
    - E_j(z) = A_j * exp(i*kz_j*z) + B_j * exp(-i*kz_j*z)
    
    Args:
        A_j, B_j: Coeficientes de campo (ondas hacia adelante y atrás)
        kz_j: Componente z del vector de onda en la capa
        k_j: Coeficiente de extinción de la capa
        thickness: Espesor de la capa en nm
        wavelength: Longitud de onda en nm
        n_points: Número de puntos para integración numérica
    
    Returns:
        Absorción de la capa (fracción 0-1)
    """
    if thickness <= 0 or k_j <= 0:
        return 0.0
    
    # Constante de absorción α = 4πk/λ (en nm⁻¹)
    alpha_j = 4 * np.pi * k_j / wavelength
    
    # Puntos para integración
    z_points = np.linspace(0, thickness, n_points)
    dz = thickness / (n_points - 1)
    
    # Calcular |E(z)|² en cada punto
    E_squared = np.zeros(n_points)
    
    for i, z in enumerate(z_points):
        # E_j(z) = A_j * exp(i*kz_j*z) + B_j * exp(-i*kz_j*z)
        E_forward = A_j * np.exp(1j * kz_j * z)
        E_backward = B_j * np.exp(-1j * kz_j * z)
        E_total = E_forward + E_backward
        E_squared[i] = np.abs(E_total)**2
    
    # Integrar usando regla del trapecio
    integral = np.trapz(E_squared, z_points)
    
    # Absorción de la capa
    absorption = alpha_j * integral
    
    return float(np.real(absorption))


def calculate_absorption_coefficient(k: float, wavelength: float) -> float:
    """
    Calcula la constante de absorción α.
    
    α = 4πk/λ
    
    Args:
        k: Coeficiente de extinción
        wavelength: Longitud de onda en nm
    
    Returns:
        α en nm⁻¹
    """
    return 4 * np.pi * k / wavelength


# ==========================================
# CÁLCULO DE R, T, A PARA UNA LONGITUD DE ONDA
# ==========================================

def calculate_RTA_single_wavelength(
    layers_n: List[float],
    layers_k: List[float],
    layers_thickness: List[float],
    n_ambient: float,
    k_ambient: float,
    n_substrate: float,
    k_substrate: float,
    wavelength: float,
    angle_deg: float,
    polarization: str = 'both',
    calculate_per_layer: bool = True
) -> Dict[str, Any]:
    """
    Calcula R, T, A total y absorción por capa para una longitud de onda.
    
    ==========================================
    FÍSICA IMPLEMENTADA
    ==========================================
    
    REFLECTANCIA:
        Rs = |r_s|²
        Rp = |r_p|²
    
    TRANSMITANCIA:
        T = (n_sub * cos(θ_sub)) / (n_inc * cos(θ_inc)) * |t|²
        Para sustratos opacos (k > 0.5): T = 0
    
    ABSORBANCIA TOTAL:
        A_total = 1 - R - T
    
    ABSORCIÓN POR CAPA:
        A_j = α_j * ∫|E_j(z)|² dz
        donde α_j = 4πk_j/λ
    
    VERIFICACIÓN:
        Σ A_j + A_substrate + R + T ≈ 1
    
    Args:
        layers_n, layers_k, layers_thickness: Propiedades de las capas
        n_ambient, k_ambient: Propiedades del medio ambiente
        n_substrate, k_substrate: Propiedades del sustrato
        wavelength: Longitud de onda en nm
        angle_deg: Ángulo de incidencia en grados
        polarization: 's', 'p', o 'both'
        calculate_per_layer: Si True, calcula absorción por capa
    
    Returns:
        Dict con R, T, A, absorción por capa, etc.
    """
    theta_inc = np.deg2rad(angle_deg)
    num_layers = len(layers_thickness)
    
    # ==========================================
    # CALCULAR PARA AMBAS POLARIZACIONES
    # ==========================================
    results_s = None
    results_p = None
    
    if polarization in ['s', 'both']:
        results_s = calculate_tmm_fields(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_inc, 's'
        )
    
    if polarization in ['p', 'both']:
        results_p = calculate_tmm_fields(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_inc, 'p'
        )
    
    # ==========================================
    # REFLECTANCIA
    # ==========================================
    if results_s is not None:
        Rs = np.abs(results_s['r'])**2
    else:
        Rs = 0
    
    if results_p is not None:
        Rp = np.abs(results_p['r'])**2
    else:
        Rp = 0
    
    # ==========================================
    # TRANSMITANCIA
    # ==========================================
    is_opaque = k_substrate > 0.5
    
    if is_opaque:
        Ts = 0.0
        Tp = 0.0
    else:
        # Calcular factor de transmisión
        n_0 = complex(n_ambient, k_ambient)
        n_s = complex(n_substrate, k_substrate)
        
        # Ángulo en el sustrato (Ley de Snell generalizada)
        sin_theta_sub = (n_0 / n_s) * np.sin(theta_inc)
        cos_theta_sub = np.sqrt(1 - sin_theta_sub**2)
        cos_theta_sub = _choose_physical_branch(cos_theta_sub)
        
        cos_theta_inc = np.cos(theta_inc)
        if np.abs(cos_theta_inc) < 1e-10:
            cos_theta_inc = 1e-10
        
        # Factor: (n_sub * cos(θ_sub)) / (n_inc * cos(θ_inc))
        transmission_factor = np.abs(np.real(n_s * cos_theta_sub) / np.real(n_0 * cos_theta_inc))
        
        if results_s is not None:
            Ts = transmission_factor * np.abs(results_s['t'])**2
        else:
            Ts = 0
        
        if results_p is not None:
            Tp = transmission_factor * np.abs(results_p['t'])**2
        else:
            Tp = 0
    
    # ==========================================
    # ABSORCIÓN POR CAPA
    # ==========================================
    layer_absorptions_s = []
    layer_absorptions_p = []
    
    if calculate_per_layer and num_layers > 0:
        for j in range(num_layers):
            k_layer = float(layers_k[j])
            thickness = float(layers_thickness[j])
            
            # Polarización S
            if results_s is not None and j < len(results_s['field_coefficients']):
                fc_s = results_s['field_coefficients'][j]
                A_j_s = calculate_layer_absorption(
                    fc_s['A'], fc_s['B'], fc_s['kz'],
                    k_layer, thickness, wavelength
                )
            else:
                A_j_s = 0.0
            
            # Polarización P
            if results_p is not None and j < len(results_p['field_coefficients']):
                fc_p = results_p['field_coefficients'][j]
                A_j_p = calculate_layer_absorption(
                    fc_p['A'], fc_p['B'], fc_p['kz'],
                    k_layer, thickness, wavelength
                )
            else:
                A_j_p = 0.0
            
            layer_absorptions_s.append(A_j_s)
            layer_absorptions_p.append(A_j_p)
    
    # ==========================================
    # ABSORBANCIA TOTAL (conservación de energía)
    # ==========================================
    As_total = 1.0 - Rs - Ts
    Ap_total = 1.0 - Rp - Tp
    
    # ==========================================
    # CLAMP A RANGO FÍSICO [0, 1]
    # ==========================================
    Rs = float(np.clip(np.real(Rs), 0.0, 1.0))
    Rp = float(np.clip(np.real(Rp), 0.0, 1.0))
    Ts = float(np.clip(np.real(Ts), 0.0, 1.0))
    Tp = float(np.clip(np.real(Tp), 0.0, 1.0))
    As_total = float(np.clip(np.real(As_total), 0.0, 1.0))
    Ap_total = float(np.clip(np.real(Ap_total), 0.0, 1.0))
    
    # Clamp absorción por capa
    layer_absorptions_s = [float(np.clip(a, 0.0, 1.0)) for a in layer_absorptions_s]
    layer_absorptions_p = [float(np.clip(a, 0.0, 1.0)) for a in layer_absorptions_p]
    
    # ==========================================
    # SELECCIÓN SEGÚN POLARIZACIÓN
    # ==========================================
    pol = polarization.lower() if isinstance(polarization, str) else 'both'
    
    if pol == 's':
        R = Rs
        T = Ts
        A_total = As_total
        layer_absorptions = layer_absorptions_s
    elif pol == 'p':
        R = Rp
        T = Tp
        A_total = Ap_total
        layer_absorptions = layer_absorptions_p
    else:  # 'both'
        R = (Rs + Rp) / 2.0
        T = (Ts + Tp) / 2.0
        A_total = (As_total + Ap_total) / 2.0
        # Promedio de absorción por capa
        layer_absorptions = [
            (a_s + a_p) / 2.0 
            for a_s, a_p in zip(layer_absorptions_s, layer_absorptions_p)
        ]
    
    # ==========================================
    # VERIFICACIÓN DE CONSERVACIÓN DE ENERGÍA
    # ==========================================
    sum_layer_abs = sum(layer_absorptions) if layer_absorptions else 0
    total_check = R + T + A_total
    
    if abs(total_check - 1.0) > 0.05:
        logger.warning(
            f"⚠️ Conservación de energía: R+T+A = {total_check:.4f} "
            f"(R={R:.4f}, T={T:.4f}, A={A_total:.4f})"
        )
    
    return {
        # Valores finales según polarización
        'R': R,
        'T': T,
        'A': A_total,
        'layer_absorptions': layer_absorptions,
        
        # Componentes por polarización
        'Rs': Rs,
        'Rp': Rp,
        'Ts': Ts,
        'Tp': Tp,
        'As': As_total,
        'Ap': Ap_total,
        'layer_absorptions_s': layer_absorptions_s,
        'layer_absorptions_p': layer_absorptions_p,
        
        # Verificación
        'energy_conservation': R + T + A_total,
        'sum_layer_absorptions': sum_layer_abs
    }


# ==========================================
# CÁLCULO ESPECTRAL COMPLETO
# ==========================================

def calculate_tra_spectra(
    tmm_result: Dict[str, Any],
    model_data: Dict[str, Any],
    calculate_per_layer: bool = True
) -> Dict[str, Any]:
    """
    Calcula espectros completos de R, T, A y absorción por capa.
    
    Esta es la función principal que debe llamarse desde el endpoint.
    
    Args:
        tmm_result: Resultado de run_tmm_calculation() con:
            - wavelength: array de longitudes de onda
            - r_p, r_s: coeficientes de reflexión
            - optical_constants: constantes ópticas por capa
        
        model_data: Modelo óptico con:
            - global: {angle, polarization, ...}
            - ambient: {n, k, ...}
            - substrate: {n, k, ...}
            - layers: [{thickness, name, ...}, ...]
        
        calculate_per_layer: Si True, calcula absorción por capa
    
    Returns:
        Dict con:
            - wavelength: array (nm)
            - R, T, A: arrays (0-1)
            - Rs, Rp, Ts, Tp, As, Ap: componentes por polarización
            - layer_absorptions: lista de arrays, uno por capa
            - layer_names: nombres de las capas
            - polarization: polarización usada
    """
    try:
        wavelengths = np.array(tmm_result['wavelength'])
        optical_constants = tmm_result.get('optical_constants', {})
        
        # Extraer parámetros del modelo
        angle_deg = model_data['global']['angle']
        polarization = model_data['global'].get('polarization', 'both')
        
        # ==========================================
        # PROPIEDADES DEL AMBIENTE
        # ==========================================
        ambient_data = model_data['ambient']
        if 'n' in ambient_data:
            n_ambient = float(ambient_data.get('n', 1.0))
            k_ambient = float(ambient_data.get('k', 0.0))
        else:
            n_ambient = optical_constants.get('ambient', {}).get('n', [1.0])[0]
            k_ambient = optical_constants.get('ambient', {}).get('k', [0.0])[0]
        
        # ==========================================
        # PROPIEDADES DEL SUSTRATO
        # ==========================================
        substrate_data = model_data['substrate']
        if 'n' in substrate_data:
            n_substrate = float(substrate_data.get('n', 1.52))
            k_substrate = float(substrate_data.get('k', 0.0))
        else:
            n_substrate = optical_constants.get('substrate', {}).get('n', [1.52])[0]
            k_substrate = optical_constants.get('substrate', {}).get('k', [0.0])[0]
        
        # ==========================================
        # PROPIEDADES DE LAS CAPAS
        # ==========================================
        layers = model_data.get('layers', [])
        num_layers = len(layers)
        layers_optical = optical_constants.get('layers', [])
        
        # Nombres de las capas
        layer_names = [
            layer.get('name', f'Capa {i+1}') 
            for i, layer in enumerate(layers)
        ]
        
        # ==========================================
        # ARRAYS PARA RESULTADOS
        # ==========================================
        R_array = []
        T_array = []
        A_array = []
        Rs_array = []
        Rp_array = []
        Ts_array = []
        Tp_array = []
        As_array = []
        Ap_array = []
        
        # Absorción por capa: lista de listas
        layer_absorptions_arrays = [[] for _ in range(num_layers)]
        layer_absorptions_s_arrays = [[] for _ in range(num_layers)]
        layer_absorptions_p_arrays = [[] for _ in range(num_layers)]
        
        logger.info(f"📊 Calculando R, T, A para {len(wavelengths)} longitudes de onda")
        logger.info(f"   Polarización: {polarization}")
        logger.info(f"   Ángulo: {angle_deg}°")
        logger.info(f"   Capas: {num_layers}")
        logger.info(f"   Calcular absorción por capa: {calculate_per_layer}")
        
        # ==========================================
        # CALCULAR PARA CADA LONGITUD DE ONDA
        # ==========================================
        for i, wl in enumerate(wavelengths):
            # Obtener n, k de las capas para esta λ
            layers_n = []
            layers_k = []
            layers_thickness = []
            
            for j, layer in enumerate(layers):
                thickness = float(layer['thickness'])
                layers_thickness.append(thickness)
                
                # Obtener n, k de optical_constants
                if j < len(layers_optical):
                    layer_opt = layers_optical[j]
                    n_vals = layer_opt.get('n', [1.5])
                    k_vals = layer_opt.get('k', [0.0])
                    
                    if isinstance(n_vals, list) and len(n_vals) > i:
                        layers_n.append(float(n_vals[i]))
                    else:
                        layers_n.append(float(n_vals[0]) if isinstance(n_vals, list) else float(n_vals))
                    
                    if isinstance(k_vals, list) and len(k_vals) > i:
                        layers_k.append(float(k_vals[i]))
                    else:
                        layers_k.append(float(k_vals[0]) if isinstance(k_vals, list) else float(k_vals))
                else:
                    layers_n.append(1.5)
                    layers_k.append(0.0)
            
            # Calcular R, T, A
            rta = calculate_RTA_single_wavelength(
                layers_n=layers_n,
                layers_k=layers_k,
                layers_thickness=layers_thickness,
                n_ambient=n_ambient,
                k_ambient=k_ambient,
                n_substrate=n_substrate,
                k_substrate=k_substrate,
                wavelength=wl,
                angle_deg=angle_deg,
                polarization=polarization,
                calculate_per_layer=calculate_per_layer
            )
            
            # Guardar resultados
            R_array.append(rta['R'])
            T_array.append(rta['T'])
            A_array.append(rta['A'])
            Rs_array.append(rta['Rs'])
            Rp_array.append(rta['Rp'])
            Ts_array.append(rta['Ts'])
            Tp_array.append(rta['Tp'])
            As_array.append(rta['As'])
            Ap_array.append(rta['Ap'])
            
            # Absorción por capa
            for j in range(num_layers):
                if j < len(rta['layer_absorptions']):
                    layer_absorptions_arrays[j].append(rta['layer_absorptions'][j])
                else:
                    layer_absorptions_arrays[j].append(0.0)
                
                if j < len(rta['layer_absorptions_s']):
                    layer_absorptions_s_arrays[j].append(rta['layer_absorptions_s'][j])
                else:
                    layer_absorptions_s_arrays[j].append(0.0)
                
                if j < len(rta['layer_absorptions_p']):
                    layer_absorptions_p_arrays[j].append(rta['layer_absorptions_p'][j])
                else:
                    layer_absorptions_p_arrays[j].append(0.0)
        
        # ==========================================
        # VERIFICACIÓN FINAL
        # ==========================================
        R_mean = np.mean(R_array)
        T_mean = np.mean(T_array)
        A_mean = np.mean(A_array)
        total_mean = R_mean + T_mean + A_mean
        
        logger.info(f"✅ Cálculo R, T, A completado")
        logger.info(f"   R promedio: {R_mean:.4f}")
        logger.info(f"   T promedio: {T_mean:.4f}")
        logger.info(f"   A promedio: {A_mean:.4f}")
        logger.info(f"   R+T+A promedio: {total_mean:.4f}")
        
        if calculate_per_layer:
            for j, name in enumerate(layer_names):
                A_layer_mean = np.mean(layer_absorptions_arrays[j])
                logger.info(f"   A_{name} promedio: {A_layer_mean:.4f}")
        
        # ==========================================
        # RETORNAR RESULTADOS
        # ==========================================
        return {
            'wavelength': wavelengths.tolist(),
            
            # Valores según polarización seleccionada
            'R': R_array,
            'T': T_array,
            'A': A_array,
            
            # Componentes por polarización
            'Rs': Rs_array,
            'Rp': Rp_array,
            'Ts': Ts_array,
            'Tp': Tp_array,
            'As': As_array,
            'Ap': Ap_array,
            
            # Absorción por capa
            'layer_absorptions': layer_absorptions_arrays,
            'layer_absorptions_s': layer_absorptions_s_arrays,
            'layer_absorptions_p': layer_absorptions_p_arrays,
            'layer_names': layer_names,
            
            # Metadata
            'polarization': polarization,
            'angle_deg': angle_deg,
            'num_layers': num_layers
        }
        
    except Exception as e:
        logger.error(f"❌ Error calculando espectros R, T, A: {str(e)}", exc_info=True)
        raise


# ==========================================
# FUNCIÓN LEGACY (compatibilidad)
# ==========================================

def calculate_tra_from_tmm(
    tmm_result: Dict[str, Any], 
    model_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Función de compatibilidad con código existente.
    """
    if model_data is not None:
        return calculate_tra_spectra(tmm_result, model_data, calculate_per_layer=True)
    
    # Método simplificado (legacy)
    logger.warning("⚠️ Usando método simplificado para R, T, A (sin model_data)")
    
    wavelengths = np.array(tmm_result['wavelength'])
    r_p = np.array(tmm_result['r_p'])
    r_s = np.array(tmm_result['r_s'])
    
    R_p = np.abs(r_p)**2
    R_s = np.abs(r_s)**2
    R = (R_p + R_s) / 2
    
    T = np.zeros_like(R)
    A = 1 - R - T
    A = np.maximum(A, 0)
    
    return {
        'wavelength': wavelengths.tolist(),
        'R': R.tolist(),
        'T': T.tolist(),
        'A': A.tolist(),
        'layer_absorptions': [],
        'layer_names': [],
        'polarization': 'both'
    }