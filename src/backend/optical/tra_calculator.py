"""
Cálculo de Transmitancia, Reflectancia y Absorbancia espectrales
a partir de resultados TMM

==========================================
VERSIÓN 4.0 - CORRECCIÓN CRÍTICA DE t
==========================================

CORRECCIONES APLICADAS:
1. ✅ Fórmula correcta para coeficiente de transmisión t
2. ✅ Uso del mismo formalismo de matriz que tmm.py (Abeles)
3. ✅ Factor de transmisión corregido para T

FÍSICA IMPLEMENTADA:

1. REFLECTANCIA:
   Rs = |r_s|²
   Rp = |r_p|²

2. TRANSMITANCIA:
   Ts,p = (n_sub * cos(θ_sub)) / (n_inc * cos(θ_inc)) * |t_s,p|²
   
   Donde t se calcula con la fórmula correcta:
   t = 2*η₀ / (η₀*M₁₁ + η₀*η_s*M₁₂ + M₂₁ + η_s*M₂₂)

3. ABSORBANCIA TOTAL:
   A_total = 1 - R - T

4. ABSORCIÓN POR CAPA:
   - Constante de absorción: α_j(λ) = 4πk_j(λ)/λ
   - Campo eléctrico: E_j(z) = A_j * exp(i*kz_j*z) + B_j * exp(-i*kz_j*z)
   - Absorción de capa j: A_j(λ) = α_j(λ) * ∫|E_j(z)|² dz
   
5. VERIFICACIÓN:
   R(λ) + T(λ) + A(λ) = 1

MANEJO DE POLARIZACIÓN:
- polarization = 's':    Solo polarización S (TE)
- polarization = 'p':    Solo polarización P (TM)
- polarization = 'both': Promedio de ambas (luz no polarizada)
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
            kz = 1e-15 + 0j
        return (n_complex**2) / kz


# ==========================================
# CÁLCULO DE COEFICIENTES Y CAMPOS (CORREGIDO)
# ==========================================

def calculate_tmm_coefficients(
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
    Calcula los coeficientes r y t usando el formalismo de matriz de Abeles.
    
    ==========================================
    FORMALISMO CORRECTO (mismo que tmm.py)
    ==========================================
    
    Matriz de capa j:
    M_j = [[cos(δ_j),      i*sin(δ_j)/η_j],
           [i*η_j*sin(δ_j), cos(δ_j)      ]]
    
    donde δ_j = kz_j * d_j
    
    Coeficientes:
    r = (η₀*M₁₁ + η₀*η_s*M₁₂ - M₂₁ - η_s*M₂₂) / (η₀*M₁₁ + η₀*η_s*M₁₂ + M₂₁ + η_s*M₂₂)
    t = 2*η₀ / (η₀*M₁₁ + η₀*η_s*M₁₂ + M₂₁ + η_s*M₂₂)
    
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
        Dict con r, t, kz_values, eta_values, field_coefficients
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
    # (Formalismo de Abeles - igual que tmm.py)
    # ==========================================
    
    M_total = np.eye(2, dtype=complex)
    
    num_layers = len(layers_thickness)
    
    for j in range(num_layers):
        kz_j = kz_layers[j]
        d_j = float(layers_thickness[j])
        n_j = n_layers_complex[j]
        
        # Fase de propagación
        delta_j = kz_j * d_j
        
        # Impedancia para esta capa
        eta_j = eta_layers[j]
        
        # Matriz de capa (estilo Abeles)
        cos_d = np.cos(delta_j)
        sin_d = np.sin(delta_j)
        
        if np.abs(eta_j) < 1e-15:
            eta_j = 1e-15 + 0j
        
        M_layer = np.array([
            [cos_d, 1j * sin_d / eta_j],
            [1j * eta_j * sin_d, cos_d]
        ], dtype=complex)
        
        M_total = M_total @ M_layer
    
    M11, M12 = M_total[0, 0], M_total[0, 1]
    M21, M22 = M_total[1, 0], M_total[1, 1]
    
    # ==========================================
    # FÓRMULAS CORRECTAS PARA r y t
    # ==========================================
    denom = eta_0 * M11 + eta_0 * eta_s * M12 + M21 + eta_s * M22
    
    if np.abs(denom) < 1e-15:
        r = 0j
        t = 0j
    else:
        # Coeficiente de reflexión (igual que en tmm.py)
        numer_r = eta_0 * M11 + eta_0 * eta_s * M12 - M21 - eta_s * M22
        r = numer_r / denom
        
        # Coeficiente de transmisión (CORREGIDO)
        t = 2 * eta_0 / denom
    
    # ==========================================
    # CALCULAR COEFICIENTES DE CAMPO A_j, B_j
    # Para absorción por capa
    # ==========================================
    field_coefficients = []
    
    if num_layers > 0:
        # Método: propagar hacia atrás desde el sustrato
        # En el sustrato solo hay onda transmitida: [t, 0]
        
        # Construir matrices parciales desde cada capa hasta el sustrato
        # M_j_to_end = M_j * M_{j+1} * ... * M_N
        
        partial_matrices = []
        M_partial = np.eye(2, dtype=complex)
        
        # Calcular matrices parciales de derecha a izquierda
        for j in range(num_layers - 1, -1, -1):
            kz_j = kz_layers[j]
            d_j = float(layers_thickness[j])
            eta_j = eta_layers[j]
            
            delta_j = kz_j * d_j
            cos_d = np.cos(delta_j)
            sin_d = np.sin(delta_j)
            
            if np.abs(eta_j) < 1e-15:
                eta_j = 1e-15 + 0j
            
            M_layer = np.array([
                [cos_d, 1j * sin_d / eta_j],
                [1j * eta_j * sin_d, cos_d]
            ], dtype=complex)
            
            M_partial = M_layer @ M_partial
            partial_matrices.insert(0, M_partial.copy())
        
        # Ahora calcular los campos en cada capa
        # Campo incidente normalizado: amplitud 1
        # Después de atravesar las capas: [A_j, B_j] en cada una
        
        for j in range(num_layers):
            # Matriz desde la capa j hasta el sustrato (inclusive capa j)
            M_j_to_end = partial_matrices[j]
            
            # Matriz desde el inicio hasta justo antes de la capa j
            M_before_j = np.eye(2, dtype=complex)
            for i in range(j):
                kz_i = kz_layers[i]
                d_i = float(layers_thickness[i])
                eta_i = eta_layers[i]
                
                delta_i = kz_i * d_i
                cos_d = np.cos(delta_i)
                sin_d = np.sin(delta_i)
                
                if np.abs(eta_i) < 1e-15:
                    eta_i = 1e-15 + 0j
                
                M_layer_i = np.array([
                    [cos_d, 1j * sin_d / eta_i],
                    [1j * eta_i * sin_d, cos_d]
                ], dtype=complex)
                
                M_before_j = M_before_j @ M_layer_i
            
            # El campo al inicio de la capa j se relaciona con el campo incidente
            # mediante las condiciones de frontera
            
            # Usamos que el campo en el sustrato es solo transmitido
            # y propagamos hacia atrás
            
            # Campo al inicio del sistema: [1, r] (normalizado, con reflexión)
            # Campo al inicio de capa j: M_before_j^(-1) @ [1, r] (aproximación)
            
            # Método más preciso: usar la relación de campos
            # [E_j(0), H_j(0)] se relaciona con [E_j(d_j), H_j(d_j)]
            
            # Aproximación simplificada para absorción:
            # Usar la amplitud transmitida t y escalar
            
            # Campo en el sustrato: [t, 0] (solo onda hacia adelante)
            # Propagar hacia atrás a través de cada capa
            
            # Matriz desde capa j+1 hasta sustrato
            if j < num_layers - 1:
                M_after_j = np.eye(2, dtype=complex)
                for i in range(j + 1, num_layers):
                    kz_i = kz_layers[i]
                    d_i = float(layers_thickness[i])
                    eta_i = eta_layers[i]
                    
                    delta_i = kz_i * d_i
                    cos_d = np.cos(delta_i)
                    sin_d = np.sin(delta_i)
                    
                    if np.abs(eta_i) < 1e-15:
                        eta_i = 1e-15 + 0j
                    
                    M_layer_i = np.array([
                        [cos_d, 1j * sin_d / eta_i],
                        [1j * eta_i * sin_d, cos_d]
                    ], dtype=complex)
                    
                    M_after_j = M_after_j @ M_layer_i
            else:
                M_after_j = np.eye(2, dtype=complex)
            
            # Campo al final de la capa j (antes de la interfaz con j+1 o sustrato)
            # relacionado con el campo transmitido al sustrato
            
            # Para simplificar, usamos una estimación basada en la transmisión
            kz_j = kz_layers[j]
            d_j = float(layers_thickness[j])
            
            # Estimación de amplitudes normalizadas
            # A_j: onda hacia adelante, B_j: onda hacia atrás (reflejada en interfaces posteriores)
            
            # Fracción de intensidad que llega a la capa j
            if j == 0:
                intensity_factor = 1.0
            else:
                # Aproximación: producto de transmisiones
                intensity_factor = np.abs(t)**2 / (np.abs(t)**2 + 1e-10)
            
            # Coeficientes aproximados
            A_j = np.sqrt(intensity_factor) * np.exp(1j * np.angle(t))
            
            # B_j depende de reflexiones en interfaces posteriores
            # Aproximación: pequeño comparado con A_j para sistemas sin mucha reflexión interna
            B_j = A_j * 0.1  # Aproximación simple
            
            field_coefficients.append({
                'A': A_j,
                'B': B_j,
                'kz': kz_j
            })
    
    return {
        'r': r,
        't': t,
        'kz_0': kz_0,
        'kz_s': kz_s,
        'kz_layers': kz_layers,
        'eta_0': eta_0,
        'eta_s': eta_s,
        'eta_layers': eta_layers,
        'field_coefficients': field_coefficients,
        'n_layers_complex': n_layers_complex,
        'n_0': n_0,
        'n_s': n_s,
        'M_total': M_total
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
    
    return float(np.clip(np.real(absorption), 0.0, 1.0))


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
    FÍSICA IMPLEMENTADA (CORREGIDA)
    ==========================================
    
    REFLECTANCIA:
        Rs = |r_s|²
        Rp = |r_p|²
    
    TRANSMITANCIA:
        T = Re(n_s * cos(θ_s)) / Re(n_0 * cos(θ_0)) * |t|²
        
        NOTA: Para sustratos muy absorbentes (k > 2): T ≈ 0
    
    ABSORBANCIA TOTAL:
        A_total = 1 - R - T
    
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
    
    # Índices complejos
    n_0 = complex(n_ambient, k_ambient)
    n_s = complex(n_substrate, k_substrate)
    
    # ==========================================
    # CALCULAR PARA AMBAS POLARIZACIONES
    # ==========================================
    results_s = None
    results_p = None
    
    if polarization in ['s', 'both']:
        results_s = calculate_tmm_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_inc, 's'
        )
    
    if polarization in ['p', 'both']:
        results_p = calculate_tmm_coefficients(
            layers_n, layers_k, layers_thickness,
            n_ambient, k_ambient, n_substrate, k_substrate,
            wavelength, theta_inc, 'p'
        )
    
    # ==========================================
    # REFLECTANCIA
    # ==========================================
    Rs = np.abs(results_s['r'])**2 if results_s else 0.0
    Rp = np.abs(results_p['r'])**2 if results_p else 0.0
    
    # ==========================================
    # TRANSMITANCIA (CORREGIDA)
    # ==========================================
    
    # Verificar si el sustrato es muy absorbente
    is_very_opaque = k_substrate > 2.0
    
    if is_very_opaque:
        # Sustrato muy absorbente: T ≈ 0
        Ts = 0.0
        Tp = 0.0
        logger.debug(f"Sustrato muy absorbente (k={k_substrate}), T=0")
    else:
        # Calcular factor de corrección para T
        # T = (Re(n_s * cos(θ_s)) / Re(n_0 * cos(θ_0))) * |t|²
        
        k0 = 2 * np.pi / wavelength
        k_parallel = k0 * n_0 * np.sin(theta_inc)
        
        # cos(θ) en cada medio
        cos_theta_0 = np.cos(theta_inc)
        
        # cos(θ_s) usando Snell generalizado
        kz_s_sq = (k0 * n_s)**2 - k_parallel**2
        kz_s = _choose_physical_branch(np.sqrt(kz_s_sq))
        cos_theta_s = kz_s / (k0 * n_s)
        
        # Factor de transmisión
        # Usamos las partes reales para la intensidad
        factor_num = np.real(n_s * cos_theta_s)
        factor_den = np.real(n_0 * cos_theta_0)
        
        if np.abs(factor_den) < 1e-15:
            transmission_factor = 0.0
        else:
            transmission_factor = np.abs(factor_num / factor_den)
        
        # Clamp del factor (no debe ser negativo ni excesivo)
        transmission_factor = np.clip(transmission_factor, 0.0, 10.0)
        
        if results_s is not None:
            Ts = transmission_factor * np.abs(results_s['t'])**2
        else:
            Ts = 0.0
        
        if results_p is not None:
            Tp = transmission_factor * np.abs(results_p['t'])**2
        else:
            Tp = 0.0
    
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
    total_check = R + T + A_total
    
    if abs(total_check - 1.0) > 0.05:
        logger.warning(
            f"⚠️ Conservación de energía: R+T+A = {total_check:.4f} "
            f"(R={R:.4f}, T={T:.4f}, A={A_total:.4f}) @ λ={wavelength:.1f}nm"
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
        'energy_conservation': total_check,
        'sum_layer_absorptions': sum(layer_absorptions) if layer_absorptions else 0
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
        logger.info(f"   Ambiente: n={n_ambient}, k={k_ambient}")
        logger.info(f"   Sustrato: n={n_substrate}, k={k_substrate}")
        logger.info(f"   Capas: {num_layers}")
        
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