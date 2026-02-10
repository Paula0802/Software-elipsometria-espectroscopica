"""
Calculador de valores teóricos de Psi y Delta
Integra TMM con corrección de ambigüedad de Delta

Este módulo es llamado por app.py en el endpoint /api/calculate-theoretical

CORRECCIÓN: Serialización JSON segura de optical_constants
"""
import numpy as np
import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def ensure_json_serializable(obj):
    """
    Convierte recursivamente todos los tipos numpy a tipos Python nativos
    para garantizar serialización JSON correcta.
    
    Resuelve el problema de numpy.float64, numpy.int64, etc. que
    FastAPI/Starlette no serializa correctamente en algunos casos.
    """
    if isinstance(obj, dict):
        return {k: ensure_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [ensure_json_serializable(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, (np.complexfloating,)):
        # Números complejos no son JSON-serializables, convertir a dict
        return {'real': float(obj.real), 'imag': float(obj.imag)}
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    else:
        return obj


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
            optical_constants: {wavelengths, ambient, layers, substrate}
            tra_spectra: {wavelength, R, T, A}
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
        
        # ⭐ ASEGURAR que las wavelengths estén en global (CRÍTICO)
        if 'wavelengths' not in tmm_model['global'] or len(tmm_model['global'].get('wavelengths', [])) == 0:
            tmm_model['global']['wavelengths'] = wavelengths_exp.tolist()
            logger.info("  ⚠️ Wavelengths no encontrados en modelo, usando experimentales")
        
        # ⭐ También establecer wavelength_mode si no existe
        if 'wavelength_mode' not in tmm_model['global']:
            tmm_model['global']['wavelength_mode'] = 'file'
        
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
            
            # ⭐ CORRECCIÓN: Usar wavelengths del modelo si TMM no los devuelve
            if 'wavelength' in tmm_result and len(tmm_result['wavelength']) > 0:
                wavelengths = np.array(tmm_result['wavelength'], dtype=float)
            else:
                # Usar los wavelengths experimentales que ya tenemos
                wavelengths = wavelengths_exp.copy()
                logger.warning("  ⚠️ TMM no devolvió wavelengths, usando experimentales")
            
            # ⭐ VALIDACIÓN ADICIONAL: Verificar que psi y delta tengan datos
            if len(psi_theoretical) == 0:
                logger.error("  ❌ TMM devolvió psi_deg vacío")
                return {
                    'success': False,
                    'error': 'TMM no calculó valores de Psi. Verifique el modelo óptico.',
                    'error_type': 'TMM_Empty_Result'
                }
            
            if len(delta_theoretical) == 0:
                logger.error("  ❌ TMM devolvió delta_deg vacío")
                return {
                    'success': False,
                    'error': 'TMM no calculó valores de Delta. Verifique el modelo óptico.',
                    'error_type': 'TMM_Empty_Result'
                }
                
        except KeyError as e:
            logger.error(f"  ❌ Falta campo en resultado TMM: {str(e)}")
            logger.error(f"  Campos disponibles en tmm_result: {list(tmm_result.keys())}")
            return {
                'success': False,
                'error': f'Resultado TMM incompleto: falta campo {str(e)}',
                'error_type': 'KeyError'
            }
        
        logger.info(f"  ✓ Resultados extraídos: {len(psi_theoretical)} puntos")
        
        # ==========================================
        # 6. VERIFICAR LONGITUDES CONSISTENTES
        # ==========================================
        if not (len(psi_exp) == len(delta_exp) == len(psi_theoretical) == len(delta_theoretical)):
            logger.warning(
                f"  ⚠️ Longitudes inconsistentes: "
                f"psi_exp={len(psi_exp)}, delta_exp={len(delta_exp)}, "
                f"psi_theo={len(psi_theoretical)}, delta_theo={len(delta_theoretical)}"
            )
            
            # ⭐ INTENTAR INTERPOLAR SI LAS LONGITUDES NO COINCIDEN
            if len(psi_theoretical) != len(psi_exp) and len(psi_theoretical) > 0:
                logger.info("  🔄 Interpolando resultados teóricos a wavelengths experimentales...")
                
                # Interpolar psi y delta teóricos a los wavelengths experimentales
                psi_theoretical = np.interp(wavelengths_exp, wavelengths, psi_theoretical)
                delta_theoretical = np.interp(wavelengths_exp, wavelengths, delta_theoretical)
                wavelengths = wavelengths_exp.copy()
                
                logger.info(f"  ✓ Interpolación completada: {len(wavelengths)} puntos")
        
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
        tra_data = {}
        try:
            from backend.optical.tra_calculator import calculate_tra_from_tmm
            
            logger.info("  📊 Calculando T, R, A...")
            tra_data = calculate_tra_from_tmm(tmm_result)
            logger.info("  ✓ T, R, A calculados")
        except ImportError:
            logger.warning("  ⚠️ Módulo tra_calculator no disponible, omitiendo T, R, A")
            tra_data = {'warning': 'TRA calculator not available'}
        except Exception as e:
            logger.warning(f"  ⚠️ Error calculando T, R, A: {str(e)}")
            tra_data = {'error': str(e)}
        
        # ==========================================
        # 9. EXTRAER CONSTANTES ÓPTICAS (CON SERIALIZACIÓN SEGURA)
        # ==========================================
        optical_constants = tmm_result.get('optical_constants', {})
        
        if not optical_constants or 'layers' not in optical_constants:
            logger.warning("  ⚠️ optical_constants vacío o sin layers en resultado TMM")
            logger.warning(f"  Claves en tmm_result: {list(tmm_result.keys())}")
            logger.warning(f"  Claves en optical_constants: {list(optical_constants.keys()) if optical_constants else 'VACÍO'}")
            
            # Crear estructura básica como fallback
            optical_constants = {
                'wavelengths': wavelengths.tolist(),
                'layers': [],
                'note': 'Constantes ópticas no disponibles - reconstrucción necesaria'
            }
        else:
            logger.info(f"  ✅ optical_constants recibidas: {len(optical_constants.get('layers', []))} capas")
        
        # ⭐⭐⭐ GARANTIZAR que optical_constants tenga 'wavelengths' (plural)
        # El TMM usa 'wavelength' (singular), el frontend busca 'wavelengths' primero
        if 'wavelength' in optical_constants and 'wavelengths' not in optical_constants:
            optical_constants['wavelengths'] = optical_constants['wavelength']
            logger.info("  ✓ Agregada clave 'wavelengths' (el TMM usaba 'wavelength')")
        
        # ⭐⭐⭐ SERIALIZACIÓN JSON SEGURA - Convierte numpy types a Python nativos
        optical_constants = ensure_json_serializable(optical_constants)
        
        logger.info(f"  ✅ optical_constants serializado correctamente")
        logger.info(f"  Claves: {list(optical_constants.keys())}")
        logger.info(f"  Capas: {len(optical_constants.get('layers', []))}")
        if optical_constants.get('layers'):
            for i, layer in enumerate(optical_constants['layers']):
                logger.info(f"    Capa {i}: {layer.get('name', 'sin nombre')}, n[0]={layer['n'][0] if layer.get('n') else 'N/A'}, k[0]={layer['k'][0] if layer.get('k') else 'N/A'}")
        
        # ==========================================
        # 10. CONSTRUIR RESPUESTA COMPLETA
        # ==========================================
        calculation_time = time.time() - start_time
        
        # ⭐ Serializar tra_data también
        tra_data_safe = ensure_json_serializable(tra_data)
        
        # ⭐ Serializar goodness_of_fit también
        goodness_of_fit_safe = ensure_json_serializable(goodness_of_fit)
        
        result = {
            'success': True,
            'data': {
                'wavelengths': wavelengths.tolist(),
                'psi_theoretical': psi_theoretical.tolist(),
                'delta_theoretical': delta_theoretical.tolist()
            },
            'optical_constants': optical_constants,
            'tra_spectra': tra_data_safe,
            'goodness_of_fit': goodness_of_fit_safe,
            'calculation_time': round(float(calculation_time), 3),
            'points_calculated': int(len(wavelengths))
        }
        
        logger.info("=" * 60)
        logger.info(f"✓ CÁLCULO COMPLETADO EN {calculation_time:.3f}s")
        logger.info(f"  optical_constants incluye {len(optical_constants.get('layers', []))} capas")
        logger.info(f"  tra_spectra claves: {list(tra_data_safe.keys()) if isinstance(tra_data_safe, dict) else 'N/A'}")
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
    """
    # ⭐ VALIDACIÓN: Asegurar que los arrays tengan la misma longitud
    min_len = min(len(psi_exp), len(delta_exp), len(psi_theo), len(delta_theo))
    
    if min_len == 0:
        logger.error("  ❌ Arrays vacíos en calculate_goodness_of_fit")
        return {
            'chi_squared': float('inf'),
            'chi_squared_reduced': float('inf'),
            'mse': float('inf'),
            'quality': 'ERROR - Sin datos',
            'psi_metrics': {'rmse': 0, 'mae': 0, 'max_error': 0, 'r_squared': 0},
            'delta_metrics': {'rmse': 0, 'mae': 0, 'max_error': 0, 'r_squared': 0}
        }
    
    # Truncar a la longitud mínima si es necesario
    if not (len(psi_exp) == len(delta_exp) == len(psi_theo) == len(delta_theo)):
        logger.warning(f"  ⚠️ Truncando arrays a longitud mínima: {min_len}")
        psi_exp = psi_exp[:min_len]
        delta_exp = delta_exp[:min_len]
        psi_theo = psi_theo[:min_len]
        delta_theo = delta_theo[:min_len]
    
    # ==========================================
    # TRANSFORMACIÓN N,C,S (CompleteEASE)
    # ==========================================
    N_exp = psi_exp * np.cos(np.radians(delta_exp))
    C_exp = psi_exp * np.sin(np.radians(delta_exp))
    
    N_theo = psi_theo * np.cos(np.radians(delta_theo))
    C_theo = psi_theo * np.sin(np.radians(delta_theo))
    
    # ==========================================
    # CHI-CUADRADO EN N,C,S
    # ==========================================
    sigma_psi = 0.01
    sigma_delta = 0.1
    sigma_N = sigma_psi
    sigma_C = sigma_psi
    
    chi_squared = np.sum(
        ((N_exp - N_theo) / sigma_N) ** 2 +
        ((C_exp - C_theo) / sigma_C) ** 2
    )
    
    n_points = len(psi_exp)
    n_params = 1
    degrees_of_freedom = max(1, n_points - n_params)
    
    chi_squared_reduced = chi_squared / degrees_of_freedom
    
    # ==========================================
    # MSE
    # ==========================================
    mse = chi_squared / n_points
    
    # ==========================================
    # MÉTRICAS INDIVIDUALES
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
    # CLASIFICACIÓN DE CALIDAD
    # ==========================================
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
    """Calcula el coeficiente de determinación R²"""
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    
    if ss_tot == 0:
        return 0.0
    
    return 1.0 - (ss_res / ss_tot)