"""
Calculador de valores teóricos de Psi y Delta
Integra TMM con corrección de ambigüedad de Delta

Este módulo es llamado por app.py en el endpoint /api/calculate-theoretical
"""
import numpy as np
import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

def calculate_theoretical_psi_delta(
    model: Dict[str, Any],
    experimental_data: Dict[str, Any],
    experimental_data_for_correction: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Calcula Psi y Delta teóricos usando TMM
    
    Args:
        model: Modelo óptico completo con:
            - global: {angle, polarization, wavelengths}
            - ambient: {type, n, k, ...}
            - substrate: {type, n, k, ...}
            - layers: [{thickness, n, k, ...}, ...]
        
        experimental_data: Datos experimentales para validación:
            - wavelengths: array de longitudes de onda [nm]
            - psi_exp: array de Psi experimental [grados]
            - delta_exp: array de Delta experimental [grados]
        
        experimental_data_for_correction: Datos para corrección de Delta (formato TMM):
            - wavelength: array de longitudes de onda
            - psi: array de Psi experimental
            - delta: array de Delta experimental
    
    Returns:
        Dict con:
            success: bool
            data: {wavelengths, psi_theoretical, delta_theoretical}
            optical_constants: {wavelength, ambient, layers, substrate}  # ⭐ NUEVO
            tra_spectra: {wavelength, R, T, A}  # ⭐ NUEVO
            goodness_of_fit: {chi_squared, mse, quality, ...}
            calculation_time: float
            points_calculated: int
        
        En caso de error:
            success: False
            error: str (mensaje de error)
            error_type: str (tipo de excepción)
    """
    try:
        start_time = time.time()
        
        logger.info("=" * 60)
        logger.info("CÁLCULO TEÓRICO PSI/DELTA")
        logger.info("=" * 60)
        
        # ==========================================
        # 1. IMPORTAR TMM
        # ==========================================
        try:
            from backend.optical.tmm import run_tmm_calculation
        except ImportError as e:
            logger.error(f"Error importando TMM: {str(e)}")
            return {
                'success': False,
                'error': f'Error importando módulo TMM: {str(e)}',
                'error_type': 'ImportError'
            }
        
        # ==========================================
        # 2. PREPARAR DATOS EXPERIMENTALES CON CONVERSIÓN SEGURA
        # ==========================================
        # ⭐ CONVERTIR EXPLÍCITAMENTE A FLOAT64
        psi_exp = np.array(experimental_data['psi_exp'], dtype=np.float64)
        delta_exp = np.array(experimental_data['delta_exp'], dtype=np.float64)
        wavelengths_exp = np.array(experimental_data['wavelengths'], dtype=np.float64)
        
        # Preparar datos para corrección de Delta (SI SE PROPORCIONA)
        if experimental_data_for_correction is None:
            experimental_data_for_correction = {
                'wavelength': wavelengths_exp,
                'psi': psi_exp,
                'delta': delta_exp
            }
        else:
            # ⭐ CONVERTIR LOS DATOS DE CORRECCIÓN TAMBIÉN
            experimental_data_for_correction = {
                'wavelength': np.array(experimental_data_for_correction['wavelength'], dtype=np.float64),
                'psi': np.array(experimental_data_for_correction['psi'], dtype=np.float64),
                'delta': np.array(experimental_data_for_correction['delta'], dtype=np.float64)
            }
        
        # ==========================================
        # 3. PREPARAR MODELO TMM
        # ==========================================
        tmm_model = {
            'global': model.get('global', {}),
            'ambient': model.get('ambient', {'type': 'constant', 'n': 1.0, 'k': 0.0}),
            'substrate': model.get('substrate', {'type': 'constant', 'n': 1.52, 'k': 0.0}),
            'layers': model.get('layers', [])
        }
        
        # Asegurar que las wavelengths estén en global
        if 'wavelengths' not in tmm_model['global']:
            tmm_model['global']['wavelengths'] = wavelengths_exp.tolist()
        
        n_wavelengths = len(wavelengths_exp)
        angle = tmm_model['global'].get('angle', 70)
        n_layers = len(tmm_model['layers'])
        
        logger.info(f"  Configuración:")
        logger.info(f"    - Wavelengths: {n_wavelengths} puntos")
        logger.info(f"    - Ángulo: {angle}°")
        logger.info(f"    - Capas: {n_layers}")
        
        # ==========================================
        # 4. EJECUTAR TMM CON CORRECCIÓN DE DELTA
        # ==========================================
        logger.info("  🔄 Ejecutando TMM...")
        
        # Ejecutar TMM con corrección de ambigüedad de Delta
        tmm_result = run_tmm_calculation(
            tmm_model,
            correct_delta_ambiguity=True,
            experimental_data=experimental_data_for_correction,
            expected_delta_range='auto'
        )
        
        # Verificar errores en TMM
        if 'error' in tmm_result:
            logger.error(f"  ❌ Error en TMM: {tmm_result['error']}")
            return {
                'success': False,
                'error': tmm_result['error'],
                'error_type': 'TMM_Error'
            }
        
        logger.info("  ✓ TMM completado exitosamente")
        
        # ==========================================
        # 5. EXTRAER RESULTADOS
        # ==========================================
        try:
            psi_theoretical = np.array(tmm_result['psi_deg'], dtype=float)
            delta_theoretical = np.array(tmm_result['delta_deg'], dtype=float)
            wavelengths = np.array(tmm_result['wavelength'], dtype=float)
        except KeyError as e:
            logger.error(f"  ❌ Falta campo en resultado TMM: {str(e)}")
            return {
                'success': False,
                'error': f'Resultado TMM incompleto: falta campo {str(e)}',
                'error_type': 'KeyError'
            }
        
        logger.info(f"  ✓ Resultados extraídos: {len(wavelengths)} puntos")
        
        # ==========================================
        # 6. VERIFICAR LONGITUDES CONSISTENTES
        # ==========================================
        if not (len(psi_exp) == len(delta_exp) == len(wavelengths)):
            logger.warning(
                f"  ⚠️ Longitudes inconsistentes: "
                f"psi_exp={len(psi_exp)}, delta_exp={len(delta_exp)}, "
                f"wavelengths={len(wavelengths)}"
            )
        
        # ==========================================
        # 7. CALCULAR MÉTRICAS DE BONDAD DE AJUSTE
        # ==========================================
        logger.info("  📊 Calculando métricas de bondad de ajuste...")
        
        goodness_of_fit = calculate_goodness_of_fit(
            psi_exp, delta_exp,
            psi_theoretical, delta_theoretical
        )
        
        logger.info(f"  ✓ MSE = {goodness_of_fit['mse']:.2f} ({goodness_of_fit['quality']})")
        logger.info(f"  ✓ χ² reducido = {goodness_of_fit['chi_squared_reduced']:.4f}")
        
        # ==========================================
        # 8. CALCULAR T, R, A
        # ==========================================
        from backend.optical.tra_calculator import calculate_tra_from_tmm
        
        logger.info("  📊 Calculando T, R, A...")
        tra_data = calculate_tra_from_tmm(tmm_result)
        logger.info("  ✓ T, R, A calculados")
        
        # ==========================================
        # 9. CONSTRUIR RESPUESTA COMPLETA
        # ==========================================
        calculation_time = time.time() - start_time
        
        result = {
            'success': True,
            'data': {
                'wavelengths': wavelengths.tolist(),
                'psi_theoretical': psi_theoretical.tolist(),
                'delta_theoretical': delta_theoretical.tolist()
            },
            'optical_constants': tmm_result['optical_constants'],  # ⭐ NUEVO
            'tra_spectra': tra_data,  # ⭐ NUEVO
            'goodness_of_fit': goodness_of_fit,
            'calculation_time': round(calculation_time, 3),
            'points_calculated': len(wavelengths)
        }
        
        logger.info("=" * 60)
        logger.info(f"✓ CÁLCULO COMPLETADO EN {calculation_time:.3f}s")
        logger.info("=" * 60)
        
        return result
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"❌ ERROR CRÍTICO: {str(e)}")
        logger.error("=" * 60, exc_info=True)
        
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }

def calculate_goodness_of_fit(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    psi_theo: np.ndarray,
    delta_theo: np.ndarray
) -> Dict[str, Any]:
    """
    Calcula métricas de bondad de ajuste usando transformación N,C,S
    
    Basado en la metodología de CompleteEASE (J.A. Woollam Co.)
    
    Args:
        psi_exp: Psi experimental [grados]
        delta_exp: Delta experimental [grados]
        psi_theo: Psi teórico [grados]
        delta_theo: Delta teórico [grados]
    
    Returns:
        Dict con métricas de ajuste
    """
    # ==========================================
    # TRANSFORMACIÓN N,C,S (CompleteEASE)
    # ==========================================
    # N = Ψ·cos(Δ)
    # C = Ψ·sin(Δ)
    # S = tan(Ψ)
    
    N_exp = psi_exp * np.cos(np.radians(delta_exp))
    C_exp = psi_exp * np.sin(np.radians(delta_exp))
    
    N_theo = psi_theo * np.cos(np.radians(delta_theo))
    C_theo = psi_theo * np.sin(np.radians(delta_theo))
    
    # ==========================================
    # CHI-CUADRADO EN N,C,S
    # ==========================================
    # Incertidumbres típicas para elipsómetros comerciales
    sigma_psi = 0.01    # [grados] - típico: 0.005-0.02
    sigma_delta = 0.1   # [grados] - típico: 0.05-0.2
    
    # Las incertidumbres en N,C son aproximadamente sigma_psi
    sigma_N = sigma_psi
    sigma_C = sigma_psi
    
    # Chi-cuadrado
    chi_squared = np.sum(
        ((N_exp - N_theo) / sigma_N) ** 2 +
        ((C_exp - C_theo) / sigma_C) ** 2
    )
    
    # Grados de libertad
    n_points = len(psi_exp)
    n_params = 1  # Placeholder - en optimización real sería el número de parámetros
    degrees_of_freedom = max(1, n_points - n_params)
    
    chi_squared_reduced = chi_squared / degrees_of_freedom
    
    # ==========================================
    # MSE (Mean Squared Error)
    # ==========================================
    # CompleteEASE define MSE = χ² / N
    mse = chi_squared / n_points
    
    # ==========================================
    # MÉTRICAS INDIVIDUALES PARA PSI Y DELTA
    # ==========================================
    psi_metrics = {
        'rmse': float(np.sqrt(np.mean((psi_exp - psi_theo) ** 2))),
        'mae': float(np.mean(np.abs(psi_exp - psi_theo))),
        'max_error': float(np.max(np.abs(psi_exp - psi_theo))),
        'r_squared': float(calculate_r_squared(psi_exp, psi_theo))
    }
    
    delta_metrics = {
        'rmse': float(np.sqrt(np.mean((delta_exp - delta_theo) ** 2))),
        'mae': float(np.mean(np.abs(delta_exp - delta_theo))),
        'max_error': float(np.max(np.abs(delta_exp - delta_theo))),
        'r_squared': float(calculate_r_squared(delta_exp, delta_theo))
    }
    
    # ==========================================
    # CLASIFICACIÓN DE CALIDAD (basado en MSE)
    # ==========================================
    # Estándares de CompleteEASE:
    # - MSE < 5: EXCELENTE ajuste
    # - 5 ≤ MSE < 20: BUENO
    # - 20 ≤ MSE < 50: ACEPTABLE
    # - MSE ≥ 50: INADECUADO
    
    if mse < 5:
        quality = 'EXCELENTE'
    elif mse < 20:
        quality = 'BUENO'
    elif mse < 50:
        quality = 'ACEPTABLE'
    else:
        quality = 'INADECUADO'
    
    return {
        'chi_squared': float(chi_squared),
        'chi_squared_reduced': float(chi_squared_reduced),
        'mse': float(mse),
        'quality': quality,
        'psi_metrics': psi_metrics,
        'delta_metrics': delta_metrics
    }


def calculate_r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Calcula el coeficiente de determinación R²
    
    R² = 1 - (SS_res / SS_tot)
    
    donde:
        SS_res = Σ(y_true - y_pred)²
        SS_tot = Σ(y_true - mean(y_true))²
    
    Args:
        y_true: Valores reales
        y_pred: Valores predichos
    
    Returns:
        R² ∈ (-∞, 1], donde 1 = ajuste perfecto
    """
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    
    if ss_tot == 0:
        return 0.0
    
    return 1.0 - (ss_res / ss_tot)