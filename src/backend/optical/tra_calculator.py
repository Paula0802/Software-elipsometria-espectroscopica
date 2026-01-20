"""
Cálculo de Transmitancia, Reflectancia y Absorbancia espectrales
a partir de resultados TMM
"""
import numpy as np
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


def calculate_tra_from_tmm(tmm_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calcula espectros de T, R, A a partir de coeficientes TMM
    
    Args:
        tmm_result: Resultado de run_tmm_calculation() con:
            - wavelength: array de longitudes de onda
            - r_p: coeficientes de reflexión p
            - r_s: coeficientes de reflexión s
    
    Returns:
        Dict con:
            - wavelength: array
            - R: Reflectancia [%]
            - T: Transmitancia [%]
            - A: Absorbancia [%]
    """
    try:
        wavelengths = np.array(tmm_result['wavelength'])
        r_p = np.array(tmm_result['r_p'])
        r_s = np.array(tmm_result['r_s'])
        
        # ==========================================
        # REFLECTANCIA
        # ==========================================
        # R = |r|² para cada polarización
        R_p = np.abs(r_p)**2
        R_s = np.abs(r_s)**2
        
        # Promedio para luz no polarizada
        R = (R_p + R_s) / 2
        
        # ==========================================
        # TRANSMITANCIA
        # ==========================================
        # NOTA: Para calcular T correctamente necesitamos el coeficiente
        # de transmisión t, que requiere modificar TMM.
        # 
        # Por ahora asumimos:
        # - Si el sustrato es absorbente (metal/Si): T ≈ 0
        # - Si el sustrato es transparente: T = 1 - R - A_layers
        
        # ⚠️ PLACEHOLDER: Asumir sustrato opaco
        T = np.zeros_like(R)
        
        logger.warning(
            "⚠️ Transmitancia asumida como 0 (sustrato opaco). "
            "Para cálculo exacto, modificar TMM para retornar coeficiente t."
        )
        
        # ==========================================
        # ABSORBANCIA
        # ==========================================
        # A = 1 - R - T (conservación de energía)
        A = 1 - R - T
        
        # Asegurar que A >= 0 (por errores numéricos)
        A = np.maximum(A, 0)
        
        # ==========================================
        # CONVERTIR A PORCENTAJE
        # ==========================================
        return {
            'wavelength': wavelengths.tolist(),
            'R': (R * 100).tolist(),
            'T': (T * 100).tolist(),
            'A': (A * 100).tolist()
        }
        
    except Exception as e:
        logger.error(f"Error calculando T, R, A: {str(e)}", exc_info=True)
        raise


def calculate_tra_with_transmittance(
    layers_n: list,
    layers_k: list,
    layers_thickness: list,
    n_ambient: float,
    n_substrate: float,
    wavelength: float,
    angle_deg: float
) -> Dict[str, float]:
    """
    Cálculo COMPLETO de T, R, A incluyendo transmisión
    
    Esta función calcula explícitamente el coeficiente de transmisión.
    Requiere implementación de TMM extendido.
    
    Returns:
        Dict con R, T, A para una longitud de onda
    """
    # TODO: Implementar cuando sea necesario para sustratos transparentes
    raise NotImplementedError(
        "Cálculo de transmitancia exacta no implementado. "
        "Use calculate_tra_from_tmm() para sustrato opaco."
    )