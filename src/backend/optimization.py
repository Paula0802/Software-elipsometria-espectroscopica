"""
Módulo de optimización multiparamétrica para elipsometría espectroscópica
Implementa 4 estrategias de optimización configurables por el usuario
"""
import numpy as np
from scipy.optimize import least_squares
import logging
from typing import Dict, List, Tuple, Any
import time
import copy

logger = logging.getLogger(__name__)


def unwrap_delta(delta_diff: np.ndarray) -> np.ndarray:
    """
    Unwrap delta para manejar periodicidad de 360°
    
    Args:
        delta_diff: Diferencia entre delta experimental y teórico
    
    Returns:
        delta_diff ajustado al rango [-180, 180]
    """
    delta_diff = np.array(delta_diff)
    delta_diff = np.where(delta_diff > 180, delta_diff - 360, delta_diff)
    delta_diff = np.where(delta_diff < -180, delta_diff + 360, delta_diff)
    return delta_diff


def calculate_chi_squared(residuals: np.ndarray, n_params: int, n_data: int) -> Tuple[float, float]:
    """
    Calcula chi-cuadrado y chi-cuadrado reducido
    
    Args:
        residuals: Residuos concatenados [psi_residuals, delta_residuals]
        n_params: Número de parámetros optimizados
        n_data: Número de puntos de datos
    
    Returns:
        (chi_squared, chi_squared_reduced)
    """
    chi_squared = float(np.sum(residuals**2))
    degrees_of_freedom = n_data - n_params
    chi_squared_reduced = chi_squared / degrees_of_freedom if degrees_of_freedom > 0 else chi_squared
    
    return chi_squared, chi_squared_reduced


def calculate_rmse(experimental: np.ndarray, theoretical: np.ndarray) -> float:
    """
    Calcula Root Mean Square Error
    """
    return float(np.sqrt(np.mean((experimental - theoretical)**2)))


def calculate_r_squared(experimental: np.ndarray, theoretical: np.ndarray) -> float:
    """
    Calcula coeficiente de determinación R²
    """
    ss_res = np.sum((experimental - theoretical)**2)
    ss_tot = np.sum((experimental - np.mean(experimental))**2)
    
    if ss_tot == 0:
        return 0.0
    
    r_squared = 1 - (ss_res / ss_tot)
    return float(r_squared)


def estimate_confidence_intervals(result, params_names: List[str]) -> Dict[str, Tuple[float, float]]:
    """
    Estima intervalos de confianza (±σ) para cada parámetro
    
    Args:
        result: Resultado de scipy.optimize.least_squares
        params_names: Nombres de los parámetros
    
    Returns:
        Dict con intervalos de confianza para cada parámetro
    """
    try:
        J = result.jac
        cov = np.linalg.inv(J.T @ J)
        perr = np.sqrt(np.diag(cov))
        
        confidence_intervals = {}
        for i, name in enumerate(params_names):
            confidence_intervals[name] = (
                float(result.x[i]),
                float(perr[i])
            )
        
        return confidence_intervals
        
    except Exception as e:
        logger.warning(f"No se pudieron calcular intervalos de confianza: {str(e)}")
        return {name: (float(result.x[i]), 0.0) for i, name in enumerate(params_names)}


def update_model_with_params(
    optical_model: Dict,
    params_to_optimize: List[Dict],
    params_vector: np.ndarray
) -> Dict:
    """
    Actualiza el modelo óptico con nuevos valores de parámetros
    
    Args:
        optical_model: Modelo óptico original
        params_to_optimize: Lista de parámetros a optimizar
        params_vector: Vector de nuevos valores
    
    Returns:
        Modelo óptico actualizado
    """
    updated_model = copy.deepcopy(optical_model)
    
    for i, param_info in enumerate(params_to_optimize):
        param_path = param_info['path']
        new_value = float(params_vector[i])
        
        target = updated_model
        for key in param_path[:-1]:
            target = target[key]
        
        target[param_path[-1]] = new_value
    
    return updated_model


def _single_optimization(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 200,
    ftol: float = 1e-8,
    xtol: float = 1e-8,
    phase_name: str = ""
) -> Dict[str, Any]:
    """
    Ejecuta UNA optimización (usada internamente por todas las estrategias)
    
    Returns:
        Dict con resultados de optimización
    """
    
    if len(params_to_optimize) == 0:
        logger.warning(f"⚠️ {phase_name}: No hay parámetros para optimizar")
        return None
    
    start_time = time.time()
    
    # Extraer valores iniciales y bounds
    initial_values = []
    bounds_lower = []
    bounds_upper = []
    params_names = []
    
    for param_info in params_to_optimize:
        initial_values.append(param_info['initial_value'])
        bounds_lower.append(param_info['lower_bound'])
        bounds_upper.append(param_info['upper_bound'])
        params_names.append(param_info['name'])
    
    initial_values = np.array(initial_values)
    bounds = (bounds_lower, bounds_upper)
    
    logger.info(f"🔧 {phase_name} - Optimizando {len(params_names)} parámetros")
    logger.info(f"  Parámetros: {params_names}")
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    residuals_psi_initial = psi_exp - psi_theo_initial
    residuals_delta_initial = unwrap_delta(delta_exp - delta_theo_initial)
    
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        np.concatenate([residuals_psi_initial, residuals_delta_initial]),
        len(params_names),
        len(wavelengths) * 2
    )
    
    logger.info(f"  χ² inicial: {chi_sq_initial:.2f}, χ²ᵣ: {chi_sq_red_initial:.4f}")
    
    iteration_count = [0]
    
    def objective_function(params_vector):
        iteration_count[0] += 1
        
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_vector)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"Error en cálculo teórico: {str(e)}")
            return np.ones(len(wavelengths) * 2) * 1e6
        
        residuals_psi = psi_exp - psi_theo
        residuals_delta = unwrap_delta(delta_exp - delta_theo)
        residuals = np.concatenate([residuals_psi, residuals_delta])
        
        if iteration_count[0] % 10 == 0:
            chi_sq, chi_sq_red = calculate_chi_squared(residuals, len(params_names), len(wavelengths) * 2)
            logger.info(f"  Iteración {iteration_count[0]}: χ² = {chi_sq:.2f}, χ²ᵣ = {chi_sq_red:.4f}")
        
        return residuals
    
    # OPTIMIZACIÓN
    try:
        result = least_squares(
            objective_function,
            x0=initial_values,
            bounds=bounds,
            method='trf',
            ftol=ftol,
            xtol=xtol,
            max_nfev=max_iterations,
            verbose=0
        )
        
        optimization_time = time.time() - start_time
        
        logger.info(f"✅ {phase_name} completada en {optimization_time:.2f} s")
        logger.info(f"  Iteraciones: {result.nfev}, Estado: {result.message}")
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, result.x)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        chi_sq_final, chi_sq_red_final = calculate_chi_squared(
            result.fun,
            len(params_names),
            len(wavelengths) * 2
        )
        
        rmse_psi_final = calculate_rmse(psi_exp, psi_theo_final)
        rmse_delta_final = calculate_rmse(delta_exp, delta_theo_final)
        r2_psi_final = calculate_r_squared(psi_exp, psi_theo_final)
        r2_delta_final = calculate_r_squared(delta_exp, delta_theo_final)
        
        confidence_intervals = estimate_confidence_intervals(result, params_names)
        
        improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
        
        logger.info(f"  χ² final: {chi_sq_final:.2f} (mejora: {improvement:.2f}%)")
        
        return {
            'success': result.success,
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'optimized_params': {params_names[i]: float(result.x[i]) for i in range(len(params_names))},
            'confidence_intervals': confidence_intervals,
            'metrics': {
                'chi_squared': float(chi_sq_final),
                'chi_squared_reduced': float(chi_sq_red_final),
                'rmse_psi': float(rmse_psi_final),
                'rmse_delta': float(rmse_delta_final),
                'r2_psi': float(r2_psi_final),
                'r2_delta': float(r2_delta_final)
            },
            'initial_chi_squared': float(chi_sq_initial),
            'improvement_percentage': float(improvement),
            'psi_theoretical': psi_theo_final.tolist(),
            'delta_theoretical': delta_theo_final.tolist(),
            'optimized_model': updated_model_final
        }
        
    except Exception as e:
        logger.error(f"❌ Error en {phase_name}: {str(e)}", exc_info=True)
        return {
            'success': False,
            'message': f'Error: {str(e)}',
            'error': str(e)
        }


# ========================================
# ESTRATEGIA 1: SIMULTÁNEA (ORIGINAL)
# ========================================

def optimize_simultaneous(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 200
) -> Dict[str, Any]:
    """
    ESTRATEGIA 1: Optimización simultánea de TODOS los parámetros
    
    Ventajas:
    - Rápida (1 sola optimización)
    - Simple
    
    Desventajas:
    - Puede fallar con muchos parámetros (>10)
    - Riesgo de mínimos locales
    
    Recomendada para: 1-3 capas, <8 parámetros
    """
    
    logger.info("=" * 60)
    logger.info("ESTRATEGIA: SIMULTÁNEA (todos los parámetros a la vez)")
    logger.info("=" * 60)
    
    result = _single_optimization(
        psi_exp, delta_exp, wavelengths,
        optical_model,
        params_to_optimize,
        calculate_theoretical_func,
        max_iterations=max_iterations,
        phase_name="Optimización simultánea"
    )
    
    if result and result['success']:
        # Calcular métricas iniciales
        psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
        chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
            np.concatenate([psi_exp - psi_theo_initial, unwrap_delta(delta_exp - delta_theo_initial)]),
            len(params_to_optimize),
            len(wavelengths) * 2
        )
        
        result['initial_metrics'] = {
            'chi_squared': float(chi_sq_initial),
            'chi_squared_reduced': float(chi_sq_red_initial),
            'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_initial)),
            'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_initial)),
            'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_initial)),
            'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_initial))
        }
        
        result['final_metrics'] = result['metrics']
        result['strategy'] = 'simultaneous'
    
    return result


# ========================================
# ESTRATEGIA 2: POR FASES
# ========================================

def optimize_by_phases(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 200
) -> Dict[str, Any]:
    """
    ESTRATEGIA 2: Optimización en 2 fases
    Fase 1: Espesores
    Fase 2: Parámetros de dispersión
    
    Ventajas:
    - Mejor convergencia para sistemas multicapa
    - Evita correlaciones espesores-índices
    
    Desventajas:
    - Más lenta (2 optimizaciones)
    
    Recomendada para: 2-5 capas, 6-15 parámetros
    """
    
    logger.info("=" * 60)
    logger.info("ESTRATEGIA: POR FASES (espesores → dispersión)")
    logger.info("=" * 60)
    
    # Separar parámetros
    thickness_params = [p for p in params_to_optimize if 'thickness' in p['name']]
    dispersion_params = [p for p in params_to_optimize if 'thickness' not in p['name']]
    
    logger.info(f"📊 Fase 1: {len(thickness_params)} espesores")
    logger.info(f"📊 Fase 2: {len(dispersion_params)} parámetros de dispersión")
    
    # Guardar métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        np.concatenate([psi_exp - psi_theo_initial, unwrap_delta(delta_exp - delta_theo_initial)]),
        len(params_to_optimize),
        len(wavelengths) * 2
    )
    
    initial_metrics = {
        'chi_squared': float(chi_sq_initial),
        'chi_squared_reduced': float(chi_sq_red_initial),
        'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_initial)),
        'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_initial)),
        'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_initial)),
        'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_initial))
    }
    
    # FASE 1: Espesores
    phase1_result = _single_optimization(
        psi_exp, delta_exp, wavelengths,
        optical_model,
        thickness_params,
        calculate_theoretical_func,
        max_iterations=max_iterations // 2,
        phase_name="FASE 1 (Espesores)"
    )
    
    if not phase1_result or not phase1_result['success']:
        return {
            'success': False,
            'error': 'Fase 1 (espesores) falló',
            'strategy': 'by_phases'
        }
    
    # FASE 2: Dispersión (usando modelo con espesores optimizados)
    phase2_result = _single_optimization(
        psi_exp, delta_exp, wavelengths,
        phase1_result['optimized_model'],
        dispersion_params,
        calculate_theoretical_func,
        max_iterations=max_iterations // 2,
        phase_name="FASE 2 (Dispersión)"
    )
    
    if not phase2_result or not phase2_result['success']:
        return {
            'success': False,
            'error': 'Fase 2 (dispersión) falló',
            'strategy': 'by_phases'
        }
    
    # Combinar resultados
    all_optimized_params = {**phase1_result['optimized_params'], **phase2_result['optimized_params']}
    all_confidence_intervals = {**phase1_result['confidence_intervals'], **phase2_result['confidence_intervals']}
    
    total_time = phase1_result['optimization_time'] + phase2_result['optimization_time']
    total_iterations = phase1_result['iterations'] + phase2_result['iterations']
    
    improvement = ((chi_sq_initial - phase2_result['metrics']['chi_squared']) / chi_sq_initial) * 100
    
    return {
        'success': True,
        'strategy': 'by_phases',
        'message': 'Optimización por fases completada',
        'iterations': total_iterations,
        'optimization_time': total_time,
        'optimized_params': all_optimized_params,
        'confidence_intervals': all_confidence_intervals,
        'initial_metrics': initial_metrics,
        'final_metrics': phase2_result['metrics'],
        'improvement_percentage': float(improvement),
        'psi_theoretical': phase2_result['psi_theoretical'],
        'delta_theoretical': phase2_result['delta_theoretical'],
        'optimized_model': phase2_result['optimized_model'],
        'phase_details': {
            'phase1': {
                'params_count': len(thickness_params),
                'iterations': phase1_result['iterations'],
                'time': phase1_result['optimization_time'],
                'chi_squared': phase1_result['metrics']['chi_squared']
            },
            'phase2': {
                'params_count': len(dispersion_params),
                'iterations': phase2_result['iterations'],
                'time': phase2_result['optimization_time'],
                'chi_squared': phase2_result['metrics']['chi_squared']
            }
        }
    }


# ========================================
# ESTRATEGIA 3: CAPA POR CAPA
# ========================================

def optimize_layer_by_layer(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 200
) -> Dict[str, Any]:
    """
    ESTRATEGIA 3: Optimización secuencial capa por capa (bottom-up)
    
    Ventajas:
    - Excelente para sistemas multicapa (>5 capas)
    - Minimiza correlaciones entre capas
    
    Desventajas:
    - Muy lenta
    - Requiere que sustrato sea conocido
    
    Recomendada para: >5 capas, sistemas complejos
    """
    
    logger.info("=" * 60)
    logger.info("ESTRATEGIA: CAPA POR CAPA (secuencial bottom-up)")
    logger.info("=" * 60)
    
    # Agrupar parámetros por capa
    params_by_layer = {}
    for param in params_to_optimize:
        if 'layers' in param['path']:
            layer_idx = param['path'][1]
            if layer_idx not in params_by_layer:
                params_by_layer[layer_idx] = []
            params_by_layer[layer_idx].append(param)
    
    if not params_by_layer:
        return {
            'success': False,
            'error': 'No se encontraron parámetros de capas',
            'strategy': 'layer_by_layer'
        }
    
    # Métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    chi_sq_initial, _ = calculate_chi_squared(
        np.concatenate([psi_exp - psi_theo_initial, unwrap_delta(delta_exp - delta_theo_initial)]),
        len(params_to_optimize),
        len(wavelengths) * 2
    )
    
    initial_metrics = {
        'chi_squared': float(chi_sq_initial),
        'chi_squared_reduced': float(chi_sq_initial / (len(wavelengths) * 2 - len(params_to_optimize))),
        'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_initial)),
        'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_initial)),
        'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_initial)),
        'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_initial))
    }
    
    current_model = optical_model
    all_optimized_params = {}
    all_confidence_intervals = {}
    layer_details = {}
    total_time = 0
    total_iterations = 0
    
    # Optimizar capa por capa
    for layer_idx in sorted(params_by_layer.keys()):
        layer_params = params_by_layer[layer_idx]
        
        logger.info(f"\n🔧 Optimizando capa {layer_idx} ({len(layer_params)} parámetros)...")
        
        result = _single_optimization(
            psi_exp, delta_exp, wavelengths,
            current_model,
            layer_params,
            calculate_theoretical_func,
            max_iterations=max_iterations // len(params_by_layer),
            phase_name=f"Capa {layer_idx}"
        )
        
        if not result or not result['success']:
            logger.warning(f"⚠️ Capa {layer_idx} no convergió, continuando...")
            continue
        
        current_model = result['optimized_model']
        all_optimized_params.update(result['optimized_params'])
        all_confidence_intervals.update(result['confidence_intervals'])
        total_time += result['optimization_time']
        total_iterations += result['iterations']
        
        layer_details[f'layer_{layer_idx}'] = {
            'params_count': len(layer_params),
            'iterations': result['iterations'],
            'time': result['optimization_time'],
            'chi_squared': result['metrics']['chi_squared']
        }
    
    # Métricas finales
    psi_theo_final, delta_theo_final = calculate_theoretical_func(current_model, wavelengths)
    chi_sq_final, chi_sq_red_final = calculate_chi_squared(
        np.concatenate([psi_exp - psi_theo_final, unwrap_delta(delta_exp - delta_theo_final)]),
        len(params_to_optimize),
        len(wavelengths) * 2
    )
    
    final_metrics = {
        'chi_squared': float(chi_sq_final),
        'chi_squared_reduced': float(chi_sq_red_final),
        'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_final)),
        'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_final)),
        'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_final)),
        'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_final))
    }
    
    improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
    
    return {
        'success': True,
        'strategy': 'layer_by_layer',
        'message': f'Optimización capa por capa completada ({len(params_by_layer)} capas)',
        'iterations': total_iterations,
        'optimization_time': total_time,
        'optimized_params': all_optimized_params,
        'confidence_intervals': all_confidence_intervals,
        'initial_metrics': initial_metrics,
        'final_metrics': final_metrics,
        'improvement_percentage': float(improvement),
        'psi_theoretical': psi_theo_final.tolist(),
        'delta_theoretical': delta_theo_final.tolist(),
        'optimized_model': current_model,
        'layer_details': layer_details
    }


# ========================================
# ESTRATEGIA 4: REFINAMIENTO ITERATIVO
# ========================================

def optimize_iterative_refinement(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 200
) -> Dict[str, Any]:
    """
    ESTRATEGIA 4: Refinamiento iterativo
    Paso 1: Optimización global (tolerancia relajada)
    Paso 2: Refinamiento de espesores
    Paso 3: Refinamiento de dispersión
    
    Ventajas:
    - Máxima precisión final
    - Menos riesgo de mínimos locales
    
    Desventajas:
    - Más lenta (3 optimizaciones)
    
    Recomendada para: Ajuste final de alta precisión
    """
    
    logger.info("=" * 60)
    logger.info("ESTRATEGIA: REFINAMIENTO ITERATIVO (3 pasos)")
    logger.info("=" * 60)
    
    # Métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    chi_sq_initial, _ = calculate_chi_squared(
        np.concatenate([psi_exp - psi_theo_initial, unwrap_delta(delta_exp - delta_theo_initial)]),
        len(params_to_optimize),
        len(wavelengths) * 2
    )
    
    initial_metrics = {
        'chi_squared': float(chi_sq_initial),
        'chi_squared_reduced': float(chi_sq_initial / (len(wavelengths) * 2 - len(params_to_optimize))),
        'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_initial)),
        'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_initial)),
        'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_initial)),
        'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_initial))
    }
    
    # PASO 1: Optimización global con tolerancia relajada
    logger.info("\n🔧 PASO 1: Optimización global (tolerancia relajada)...")
    
    step1_result = _single_optimization(
        psi_exp, delta_exp, wavelengths,
        optical_model,
        params_to_optimize,
        calculate_theoretical_func,
        max_iterations=max_iterations // 3,
        ftol=1e-6,  # Tolerancia relajada
        xtol=1e-6,
        phase_name="PASO 1 (Global)"
    )
    
    if not step1_result or not step1_result['success']:
        return {
            'success': False,
            'error': 'Paso 1 (global) falló',
            'strategy': 'iterative_refinement'
        }
    
    # PASO 2: Refinar espesores
    thickness_params = [p for p in params_to_optimize if 'thickness' in p['name']]
    
    if thickness_params:
        logger.info("\n🔧 PASO 2: Refinamiento de espesores...")
        
        # Actualizar valores iniciales con resultados del paso 1
        for param in thickness_params:
            param['initial_value'] = step1_result['optimized_params'][param['name']]
        
        step2_result = _single_optimization(
            psi_exp, delta_exp, wavelengths,
            step1_result['optimized_model'],
            thickness_params,
            calculate_theoretical_func,
            max_iterations=max_iterations // 3,
            ftol=1e-8,  # Tolerancia estricta
            xtol=1e-8,
            phase_name="PASO 2 (Espesores)"
        )
        
        if not step2_result or not step2_result['success']:
            logger.warning("⚠️ Paso 2 no convergió, usando resultado del paso 1")
            step2_result = step1_result
    else:
        step2_result = step1_result
    
    # PASO 3: Refinar dispersión
    dispersion_params = [p for p in params_to_optimize if 'thickness' not in p['name']]
    
    if dispersion_params:
        logger.info("\n🔧 PASO 3: Refinamiento de dispersión...")
        
        # Actualizar valores iniciales
        for param in dispersion_params:
            if param['name'] in step1_result['optimized_params']:
                param['initial_value'] = step1_result['optimized_params'][param['name']]
        
        step3_result = _single_optimization(
            psi_exp, delta_exp, wavelengths,
            step2_result['optimized_model'],
            dispersion_params,
            calculate_theoretical_func,
            max_iterations=max_iterations // 3,
            ftol=1e-8,
            xtol=1e-8,
            phase_name="PASO 3 (Dispersión)"
        )
        
        if not step3_result or not step3_result['success']:
            logger.warning("⚠️ Paso 3 no convergió, usando resultado del paso 2")
            step3_result = step2_result
    else:
        step3_result = step2_result
    
    # Combinar resultados
    all_optimized_params = {**step1_result['optimized_params']}
    if thickness_params and step2_result != step1_result:
        all_optimized_params.update(step2_result['optimized_params'])
    if dispersion_params and step3_result != step2_result:
        all_optimized_params.update(step3_result['optimized_params'])
    
    all_confidence_intervals = step3_result['confidence_intervals']
    
    total_time = step1_result['optimization_time']
    total_iterations = step1_result['iterations']
    
    if step2_result != step1_result:
        total_time += step2_result['optimization_time']
        total_iterations += step2_result['iterations']
    
    if step3_result != step2_result:
        total_time += step3_result['optimization_time']
        total_iterations += step3_result['iterations']
    
    improvement = ((chi_sq_initial - step3_result['metrics']['chi_squared']) / chi_sq_initial) * 100
    
    return {
        'success': True,
        'strategy': 'iterative_refinement',
        'message': 'Refinamiento iterativo completado',
        'iterations': total_iterations,
        'optimization_time': total_time,
        'optimized_params': all_optimized_params,
        'confidence_intervals': all_confidence_intervals,
        'initial_metrics': initial_metrics,
        'final_metrics': step3_result['metrics'],
        'improvement_percentage': float(improvement),
        'psi_theoretical': step3_result['psi_theoretical'],
        'delta_theoretical': step3_result['delta_theoretical'],
        'optimized_model': step3_result['optimized_model'],
        'refinement_steps': {
            'step1_global': {
                'iterations': step1_result['iterations'],
                'time': step1_result['optimization_time'],
                'chi_squared': step1_result['metrics']['chi_squared']
            },
            'step2_thickness': {
                'iterations': step2_result['iterations'] if step2_result != step1_result else 0,
                'time': step2_result['optimization_time'] if step2_result != step1_result else 0,
                'chi_squared': step2_result['metrics']['chi_squared']
            } if thickness_params else None,
            'step3_dispersion': {
                'iterations': step3_result['iterations'] if step3_result != step2_result else 0,
                'time': step3_result['optimization_time'] if step3_result != step2_result else 0,
                'chi_squared': step3_result['metrics']['chi_squared']
            } if dispersion_params else None
        }
    }


# ========================================
# FUNCIÓN PRINCIPAL (ROUTER)
# ========================================

def optimize_parameters(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    strategy: str = 'simultaneous',
    max_iterations: int = 200,
    ftol: float = 1e-8,
    xtol: float = 1e-8
) -> Dict[str, Any]:
    """
    Función principal de optimización (router de estrategias)
    
    Args:
        strategy: Estrategia a usar:
            - 'simultaneous': Optimización simultánea (DEFAULT)
            - 'by_phases': Por fases (espesores → dispersión)
            - 'layer_by_layer': Capa por capa
            - 'iterative_refinement': Refinamiento iterativo
    
    Returns:
        Dict con resultados de optimización
    """
    
    strategies = {
        'simultaneous': optimize_simultaneous,
        'by_phases': optimize_by_phases,
        'layer_by_layer': optimize_layer_by_layer,
        'iterative_refinement': optimize_iterative_refinement
    }
    
    if strategy not in strategies:
        logger.error(f"❌ Estrategia '{strategy}' no reconocida. Usando 'simultaneous'.")
        strategy = 'simultaneous'
    
    logger.info(f"\n{'=' * 60}")
    logger.info(f"INICIANDO OPTIMIZACIÓN - Estrategia: {strategy.upper()}")
    logger.info(f"Parámetros a optimizar: {len(params_to_optimize)}")
    logger.info(f"{'=' * 60}\n")
    
    optimization_func = strategies[strategy]
    
    # Ejecutar estrategia seleccionada
    result = optimization_func(
        psi_exp, delta_exp, wavelengths,
        optical_model,
        params_to_optimize,
        calculate_theoretical_func,
        max_iterations=max_iterations
    )
    
    return result