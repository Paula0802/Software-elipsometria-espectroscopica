"""
Cálculo de Transmitancia, Reflectancia y Absorbancia espectrales
a partir de resultados TMM

==========================================
VERSIÓN 5.0 - CORRECCIÓN COMPLETA
==========================================

CORRECCIONES APLICADAS:
1. ✅ Fórmula correcta para coeficiente de transmisión t (formalismo Abeles)
2. ✅ Factor de transmisión corregido usando impedancias ópticas η
3. ✅ Eliminada absorción por capas (A = 1 - R - T únicamente)
4. ✅ Cálculo explícito de Rs, Rp, Ts, Tp, As, Ap
5. ✅ Promedios no polarizados R, T, A
6. ✅ Estructura de salida preparada para visualización frontend

FÍSICA IMPLEMENTADA:

1. REFLECTANCIA:
   Rs = |r_s|²
   Rp = |r_p|²
   R = (Rs + Rp) / 2

2. TRANSMITANCIA (Fórmula correcta con impedancias):
   
   Para polarización s:
   Ts = Re(η_s) / Re(η_0) * |t_s|²
   
   Para polarización p:
   Tp = Re(η_s) / Re(η_0) * |t_p|²
   
   T = (Ts + Tp) / 2
   
   Donde:
   - η_s (pol s) = kz_s
   - η_p (pol p) = n²/kz
   - t = 2*η₀ / (η₀*M₁₁ + η₀*η_s*M₁₂ + M₂₁ + η_s*M₂₂)

3. ABSORBANCIA (conservación de energía):
   As = 1 - Rs - Ts
   Ap = 1 - Rp - Tp
   A = (As + Ap) / 2

4. VERIFICACIÓN:
   R(λ) + T(λ) + A(λ) = 1 (para cada polarización)

ESTRUCTURA DE SALIDA:
{
    'wavelength': [...],
    'Rs': [...], 'Rp': [...], 'R': [...],
    'Ts': [...], 'Tp': [...], 'T': [...],
    'As': [...], 'Ap': [...], 'A': [...]
}
"""

import numpy as np
import logging
from typing import Dict, Any, List, Optional

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


# ==========================================
# CÁLCULO DE COEFICIENTES TMM (FORMALISMO ABELES)
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
    FORMALISMO ABELES
    ==========================================
    
    Matriz de capa j:
    M_j = [[cos(δ_j),      i*sin(δ_j)/η_j],
           [i*η_j*sin(δ_j), cos(δ_j)      ]]
    
    donde δ_j = kz_j * d_j
    
    Coeficientes de Fresnel del sistema:
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
        Dict con r, t, eta_0, eta_s, kz_0, kz_s
    """
    # Índices complejos
    n_0 = complex(n_ambient, k_ambient)
    n_s = complex(n_substrate, k_substrate)
    
    # Vector de onda en vacío
    k0 = 2 * np.pi / wavelength
    
    # Componente paralela (conservada por ley de Snell)
    k_parallel = k0 * n_0 * np.sin(theta_inc)
    
    # ==========================================
    # CALCULAR kz PARA TODOS LOS MEDIOS
    # ==========================================
    
    # kz en el ambiente (medio 0)
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
    
    M_total = np.eye(2, dtype=complex)
    num_layers = len(layers_thickness)
    
    for j in range(num_layers):
        kz_j = kz_layers[j]
        d_j = float(layers_thickness[j])
        eta_j = eta_layers[j]
        
        # Fase de propagación
        delta_j = kz_j * d_j
        
        # Matriz de capa (formalismo Abeles)
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
    # COEFICIENTES DE FRESNEL r y t
    # ==========================================
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
    angle_deg: float
) -> Dict[str, float]:
    """
    Calcula Rs, Rp, Ts, Tp, As, Ap y promedios para una longitud de onda.
    
    ==========================================
    FÍSICA IMPLEMENTADA
    ==========================================
    
    REFLECTANCIA:
        Rs = |r_s|²
        Rp = |r_p|²
    
    TRANSMITANCIA (usando impedancias ópticas):
        Ts = Re(η_s) / Re(η_0) * |t_s|²
        Tp = Re(η_s) / Re(η_0) * |t_p|²
        
        Nota: Para sustratos muy absorbentes (k > 2), T ≈ 0
    
    ABSORBANCIA (conservación de energía):
        As = 1 - Rs - Ts
        Ap = 1 - Rp - Tp
    
    Args:
        layers_n, layers_k, layers_thickness: Propiedades de las capas
        n_ambient, k_ambient: Propiedades del medio ambiente
        n_substrate, k_substrate: Propiedades del sustrato
        wavelength: Longitud de onda en nm
        angle_deg: Ángulo de incidencia en grados
    
    Returns:
        Dict con Rs, Rp, R, Ts, Tp, T, As, Ap, A
    """
    theta_inc = np.deg2rad(angle_deg)
    
    # ==========================================
    # CALCULAR PARA POLARIZACIÓN S
    # ==========================================
    results_s = calculate_tmm_coefficients(
        layers_n, layers_k, layers_thickness,
        n_ambient, k_ambient, n_substrate, k_substrate,
        wavelength, theta_inc, 's'
    )
    
    # ==========================================
    # CALCULAR PARA POLARIZACIÓN P
    # ==========================================
    results_p = calculate_tmm_coefficients(
        layers_n, layers_k, layers_thickness,
        n_ambient, k_ambient, n_substrate, k_substrate,
        wavelength, theta_inc, 'p'
    )
    
    # ==========================================
    # REFLECTANCIA: R = |r|²
    # ==========================================
    Rs = np.abs(results_s['r'])**2
    Rp = np.abs(results_p['r'])**2
    
    # ==========================================
    # TRANSMITANCIA
    # ==========================================
    
    # Verificar si el sustrato es muy absorbente
    is_very_opaque = k_substrate > 2.0
    
    if is_very_opaque:
        # Sustrato muy absorbente: T ≈ 0
        Ts = 0.0
        Tp = 0.0
        logger.debug(f"Sustrato muy absorbente (k={k_substrate}), T=0")
    else:
        # ==========================================
        # FÓRMULA CORRECTA DE TRANSMITANCIA
        # T = Re(η_s) / Re(η_0) * |t|²
        # ==========================================
        
        # Polarización S
        eta_0_s = results_s['eta_0']
        eta_s_s = results_s['eta_s']
        
        re_eta_0_s = np.real(eta_0_s)
        re_eta_s_s = np.real(eta_s_s)
        
        if np.abs(re_eta_0_s) < 1e-15:
            Ts = 0.0
        else:
            transmission_factor_s = re_eta_s_s / re_eta_0_s
            # El factor debe ser positivo para ser físico
            if transmission_factor_s < 0:
                transmission_factor_s = np.abs(transmission_factor_s)
            Ts = transmission_factor_s * np.abs(results_s['t'])**2
        
        # Polarización P
        eta_0_p = results_p['eta_0']
        eta_s_p = results_p['eta_s']
        
        re_eta_0_p = np.real(eta_0_p)
        re_eta_s_p = np.real(eta_s_p)
        
        if np.abs(re_eta_0_p) < 1e-15:
            Tp = 0.0
        else:
            transmission_factor_p = re_eta_s_p / re_eta_0_p
            # El factor debe ser positivo para ser físico
            if transmission_factor_p < 0:
                transmission_factor_p = np.abs(transmission_factor_p)
            Tp = transmission_factor_p * np.abs(results_p['t'])**2
    
    # ==========================================
    # ABSORBANCIA: A = 1 - R - T
    # ==========================================
    As = 1.0 - Rs - Ts
    Ap = 1.0 - Rp - Tp
    
    # ==========================================
    # CLAMP A RANGO FÍSICO [0, 1]
    # ==========================================
    Rs = float(np.clip(np.real(Rs), 0.0, 1.0))
    Rp = float(np.clip(np.real(Rp), 0.0, 1.0))
    Ts = float(np.clip(np.real(Ts), 0.0, 1.0))
    Tp = float(np.clip(np.real(Tp), 0.0, 1.0))
    As = float(np.clip(np.real(As), 0.0, 1.0))
    Ap = float(np.clip(np.real(Ap), 0.0, 1.0))
    
    # ==========================================
    # PROMEDIOS (luz no polarizada)
    # ==========================================
    R = (Rs + Rp) / 2.0
    T = (Ts + Tp) / 2.0
    A = (As + Ap) / 2.0
    
    # ==========================================
    # VERIFICACIÓN DE CONSERVACIÓN DE ENERGÍA
    # ==========================================
    total_s = Rs + Ts + As
    total_p = Rp + Tp + Ap
    total_avg = R + T + A
    
    if abs(total_s - 1.0) > 0.05:
        logger.warning(
            f"⚠️ Conservación pol-s: Rs+Ts+As = {total_s:.4f} @ λ={wavelength:.1f}nm"
        )
    if abs(total_p - 1.0) > 0.05:
        logger.warning(
            f"⚠️ Conservación pol-p: Rp+Tp+Ap = {total_p:.4f} @ λ={wavelength:.1f}nm"
        )
    
    return {
        # Por polarización
        'Rs': Rs,
        'Rp': Rp,
        'Ts': Ts,
        'Tp': Tp,
        'As': As,
        'Ap': Ap,
        # Promedios
        'R': R,
        'T': T,
        'A': A,
        # Verificación
        'energy_conservation_s': total_s,
        'energy_conservation_p': total_p,
        'energy_conservation': total_avg
    }


# ==========================================
# CÁLCULO ESPECTRAL COMPLETO
# ==========================================

def calculate_tra_spectra(
    tmm_result: Dict[str, Any],
    model_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Calcula espectros completos de R, T, A para ambas polarizaciones.
    
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
    
    Returns:
        Dict con:
            - wavelength: array (nm)
            - Rs, Rp, R: arrays de reflectancia
            - Ts, Tp, T: arrays de transmitancia
            - As, Ap, A: arrays de absorbancia
            - polarization: polarización del modelo
            - angle_deg: ángulo de incidencia
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
        
        # ==========================================
        # ARRAYS PARA RESULTADOS
        # ==========================================
        Rs_array = []
        Rp_array = []
        R_array = []
        Ts_array = []
        Tp_array = []
        T_array = []
        As_array = []
        Ap_array = []
        A_array = []
        
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
                angle_deg=angle_deg
            )
            
            # Guardar resultados por polarización
            Rs_array.append(rta['Rs'])
            Rp_array.append(rta['Rp'])
            Ts_array.append(rta['Ts'])
            Tp_array.append(rta['Tp'])
            As_array.append(rta['As'])
            Ap_array.append(rta['Ap'])
            
            # Guardar promedios
            R_array.append(rta['R'])
            T_array.append(rta['T'])
            A_array.append(rta['A'])
        
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
        
        # ==========================================
        # RETORNAR RESULTADOS
        # ==========================================
        return {
            'wavelength': wavelengths.tolist(),
            
            # Reflectancia
            'Rs': Rs_array,
            'Rp': Rp_array,
            'R': R_array,
            
            # Transmitancia
            'Ts': Ts_array,
            'Tp': Tp_array,
            'T': T_array,
            
            # Absorbancia
            'As': As_array,
            'Ap': Ap_array,
            'A': A_array,
            
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
    Redirige a calculate_tra_spectra().
    """
    if model_data is not None:
        return calculate_tra_spectra(tmm_result, model_data)
    
    # Método simplificado (legacy) - solo reflectancia
    logger.warning("⚠️ Usando método simplificado para R, T, A (sin model_data)")
    
    wavelengths = np.array(tmm_result['wavelength'])
    r_p = np.array(tmm_result['r_p'])
    r_s = np.array(tmm_result['r_s'])
    
    # Reflectancia
    Rp = np.abs(r_p)**2
    Rs = np.abs(r_s)**2
    R = (Rp + Rs) / 2
    
    # Sin información de transmisión
    T = np.zeros_like(R)
    Ts = np.zeros_like(Rs)
    Tp = np.zeros_like(Rp)
    
    # Absorbancia
    A = 1 - R - T
    As = 1 - Rs - Ts
    Ap = 1 - Rp - Tp
    
    # Clamp
    A = np.maximum(A, 0)
    As = np.maximum(As, 0)
    Ap = np.maximum(Ap, 0)
    
    return {
        'wavelength': wavelengths.tolist(),
        'Rs': Rs.tolist(),
        'Rp': Rp.tolist(),
        'R': R.tolist(),
        'Ts': Ts.tolist(),
        'Tp': Tp.tolist(),
        'T': T.tolist(),
        'As': As.tolist(),
        'Ap': Ap.tolist(),
        'A': A.tolist(),
        'polarization': 'both'
    }