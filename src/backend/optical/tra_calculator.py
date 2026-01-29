"""
Cálculo de Transmitancia, Reflectancia y Absorbancia espectrales
a partir de resultados TMM

==========================================
VERSIÓN 5.0 - ARQUITECTURA UNIFICADA
==========================================

ESTE MÓDULO USA tmm.py COMO ÚNICA FUENTE DE VERDAD PARA:
- Coeficientes de Fresnel r y t
- Impedancias ópticas η_0 y η_s

NO HAY CÓDIGO DUPLICADO DE TMM.

FÍSICA IMPLEMENTADA:

1. REFLECTANCIA:
   Rs = |r_s|²
   Rp = |r_p|²
   R = (Rs + Rp) / 2

2. TRANSMITANCIA (usando impedancias de tmm.py):
   Ts = Re(η_s) / Re(η_0) * |t_s|²
   Tp = Re(η_s) / Re(η_0) * |t_p|²
   T = (Ts + Tp) / 2

3. ABSORBANCIA (conservación de energía):
   As = 1 - Rs - Ts
   Ap = 1 - Rp - Tp
   A = (As + Ap) / 2

4. VERIFICACIÓN:
   R(λ) + T(λ) + A(λ) = 1

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
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


# ==========================================
# CÁLCULO DE R, T, A DESDE RESULTADOS TMM
# ==========================================

def calculate_RTA_from_fresnel(
    r_s: complex,
    r_p: complex,
    t_s: complex,
    t_p: complex,
    eta_0_s: complex,
    eta_s_s: complex,
    eta_0_p: complex,
    eta_s_p: complex,
    k_substrate: float = 0.0
) -> Dict[str, float]:
    """
    Calcula Rs, Rp, Ts, Tp, As, Ap a partir de coeficientes de Fresnel.
    
    Args:
        r_s, r_p: Coeficientes de reflexión
        t_s, t_p: Coeficientes de transmisión
        eta_0_s, eta_s_s: Impedancias para polarización s
        eta_0_p, eta_s_p: Impedancias para polarización p
        k_substrate: Coeficiente de extinción del sustrato
    
    Returns:
        Dict con Rs, Rp, R, Ts, Tp, T, As, Ap, A
    """
    # ==========================================
    # REFLECTANCIA: R = |r|²
    # ==========================================
    Rs = np.abs(r_s)**2
    Rp = np.abs(r_p)**2
    
    # ==========================================
    # TRANSMITANCIA
    # ==========================================
    
    # Verificar si el sustrato es muy absorbente
    is_very_opaque = k_substrate > 2.0
    
    if is_very_opaque:
        Ts = 0.0
        Tp = 0.0
    else:
        # Polarización S: T = Re(η_s) / Re(η_0) * |t|²
        re_eta_0_s = np.real(eta_0_s)
        re_eta_s_s = np.real(eta_s_s)
        
        if np.abs(re_eta_0_s) < 1e-15:
            Ts = 0.0
        else:
            factor_s = re_eta_s_s / re_eta_0_s
            if factor_s < 0:
                factor_s = np.abs(factor_s)
            Ts = factor_s * np.abs(t_s)**2
        
        # Polarización P: T = Re(η_s) / Re(η_0) * |t|²
        re_eta_0_p = np.real(eta_0_p)
        re_eta_s_p = np.real(eta_s_p)
        
        if np.abs(re_eta_0_p) < 1e-15:
            Tp = 0.0
        else:
            factor_p = re_eta_s_p / re_eta_0_p
            if factor_p < 0:
                factor_p = np.abs(factor_p)
            Tp = factor_p * np.abs(t_p)**2
    
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
    
    return {
        'Rs': Rs, 'Rp': Rp, 'R': R,
        'Ts': Ts, 'Tp': Tp, 'T': T,
        'As': As, 'Ap': Ap, 'A': A
    }


# ==========================================
# CÁLCULO ESPECTRAL COMPLETO
# ==========================================

def calculate_tra_spectra(
    tmm_result: Dict[str, Any],
    model_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Calcula espectros completos de R, T, A usando resultados de TMM.
    
    Esta función usa los coeficientes r, t y las impedancias η
    calculados por tmm.py - NO duplica el cálculo TMM.
    
    Args:
        tmm_result: Resultado de run_tmm_calculation() con:
            - wavelength: array de longitudes de onda
            - r_s, r_p: coeficientes de reflexión
            - t_s, t_p: coeficientes de transmisión
            - eta_0_s, eta_s_s, eta_0_p, eta_s_p: impedancias
            - k_substrate: coeficiente de extinción del sustrato
        
        model_data: (Opcional) Modelo óptico para metadata adicional
    
    Returns:
        Dict con:
            - wavelength: array (nm)
            - Rs, Rp, R: arrays de reflectancia
            - Ts, Tp, T: arrays de transmitancia
            - As, Ap, A: arrays de absorbancia
    """
    try:
        wavelengths = np.array(tmm_result['wavelength'])
        n_points = len(wavelengths)
        
        # Verificar que tmm_result tenga los campos necesarios
        required_fields = ['r_s', 'r_p', 't_s', 't_p', 
                          'eta_0_s', 'eta_s_s', 'eta_0_p', 'eta_s_p']
        
        missing_fields = [f for f in required_fields if f not in tmm_result]
        
        if missing_fields:
            logger.warning(
                f"⚠️ tmm_result no tiene campos: {missing_fields}. "
                "Usando método legacy."
            )
            return _calculate_tra_legacy(tmm_result)
        
        # Obtener k_substrate
        k_substrate = tmm_result.get('k_substrate', 0.0)
        
        # Arrays para resultados
        Rs_array, Rp_array, R_array = [], [], []
        Ts_array, Tp_array, T_array = [], [], []
        As_array, Ap_array, A_array = [], [], []
        
        logger.info(f"📊 Calculando R, T, A para {n_points} longitudes de onda")
        
        # Calcular para cada longitud de onda
        for i in range(n_points):
            rta = calculate_RTA_from_fresnel(
                r_s=tmm_result['r_s'][i],
                r_p=tmm_result['r_p'][i],
                t_s=tmm_result['t_s'][i],
                t_p=tmm_result['t_p'][i],
                eta_0_s=tmm_result['eta_0_s'][i],
                eta_s_s=tmm_result['eta_s_s'][i],
                eta_0_p=tmm_result['eta_0_p'][i],
                eta_s_p=tmm_result['eta_s_p'][i],
                k_substrate=k_substrate
            )
            
            Rs_array.append(rta['Rs'])
            Rp_array.append(rta['Rp'])
            R_array.append(rta['R'])
            Ts_array.append(rta['Ts'])
            Tp_array.append(rta['Tp'])
            T_array.append(rta['T'])
            As_array.append(rta['As'])
            Ap_array.append(rta['Ap'])
            A_array.append(rta['A'])
        
        # Verificación
        R_mean = np.mean(R_array)
        T_mean = np.mean(T_array)
        A_mean = np.mean(A_array)
        
        logger.info(f"✅ Cálculo R, T, A completado")
        logger.info(f"   R promedio: {R_mean:.4f}")
        logger.info(f"   T promedio: {T_mean:.4f}")
        logger.info(f"   A promedio: {A_mean:.4f}")
        logger.info(f"   R+T+A promedio: {R_mean + T_mean + A_mean:.4f}")
        
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
            'angle_deg': tmm_result.get('angle_deg', 0),
            'n_substrate': tmm_result.get('n_substrate', 1.52),
            'k_substrate': k_substrate
        }
        
    except Exception as e:
        logger.error(f"❌ Error calculando R, T, A: {str(e)}", exc_info=True)
        raise


def _calculate_tra_legacy(tmm_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Método legacy para cuando tmm_result no tiene t, η.
    Solo calcula reflectancia; T=0 y A=1-R.
    """
    logger.warning("⚠️ Usando método legacy: T=0, A=1-R")
    
    wavelengths = np.array(tmm_result['wavelength'])
    r_p = np.array(tmm_result['r_p'])
    r_s = np.array(tmm_result['r_s'])
    
    # Reflectancia
    Rp = np.abs(r_p)**2
    Rs = np.abs(r_s)**2
    R = (Rp + Rs) / 2
    
    # Sin información de transmisión
    Tp = np.zeros_like(Rp)
    Ts = np.zeros_like(Rs)
    T = np.zeros_like(R)
    
    # Absorbancia
    Ap = 1 - Rp
    As = 1 - Rs
    A = 1 - R
    
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
        'A': A.tolist()
    }


# ==========================================
# FUNCIÓN DE COMPATIBILIDAD
# ==========================================

def calculate_tra_from_tmm(
    tmm_result: Dict[str, Any], 
    model_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Función de compatibilidad con código existente.
    Redirige a calculate_tra_spectra().
    
    Args:
        tmm_result: Resultado de run_tmm_calculation()
        model_data: (Opcional) Modelo óptico
    
    Returns:
        Dict con R, T, A espectrales
    """
    return calculate_tra_spectra(tmm_result, model_data)