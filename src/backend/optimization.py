"""
Módulo de optimización multiparamétrica para elipsometría espectroscópica
Soporta 2 algoritmos:
1. Levenberg-Marquardt (Trust Region Reflective)
2. Simplex (Nelder-Mead)

Ambos ejecutan optimización SIMULTÁNEA de todos los parámetros
"""
import numpy as np
from scipy.optimize import least_squares, minimize
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
    SOLO PARA LEVENBERG-MARQUARDT (usa Jacobiano)
    
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


# ========================================
# ALGORITMO 1: LEVENBERG-MARQUARDT
# ========================================

def optimize_levenberg_marquardt(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 200,
    ftol: float = 1e-8,
    xtol: float = 1e-8
) -> Dict[str, Any]:
    """
    ALGORITMO 1: Levenberg-Marquardt (Trust Region Reflective)
    
    Características:
    - Basado en gradientes (calcula Jacobiano)
    - Convergencia rápida (10-50 iteraciones típicamente)
    - Alta precisión en el mínimo
    - Proporciona estimación de incertidumbre
    
    Recomendado para: La mayoría de casos con valores iniciales razonables
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: LEVENBERG-MARQUARDT (TRF)")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {
            'success': False,
            'error': 'No hay parámetros para optimizar'
        }
    
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
    
    logger.info(f"🔧 Optimizando {len(params_names)} parámetros")
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
        """Función objetivo para Levenberg-Marquardt (retorna residuos)"""
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
    
    # OPTIMIZACIÓN CON LEVENBERG-MARQUARDT
    try:
        result = least_squares(
            objective_function,
            x0=initial_values,
            bounds=bounds,
            method='trf',  # Trust Region Reflective (variante de LM)
            ftol=ftol,
            xtol=xtol,
            max_nfev=max_iterations,
            verbose=0
        )
        
        optimization_time = time.time() - start_time
        
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} s")
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
        
        # Intervalos de confianza (solo LM)
        confidence_intervals = estimate_confidence_intervals(result, params_names)
        
        improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
        
        logger.info(f"  χ² final: {chi_sq_final:.2f} (mejora: {improvement:.2f}%)")
        
        return {
            'success': result.success,
            'algorithm': 'levenberg_marquardt',
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'optimized_params': {params_names[i]: float(result.x[i]) for i in range(len(params_names))},
            'confidence_intervals': confidence_intervals,  # ← Solo LM tiene esto
            'initial_metrics': {
                'chi_squared': float(chi_sq_initial),
                'chi_squared_reduced': float(chi_sq_red_initial),
                'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_initial)),
                'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_initial)),
                'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_initial)),
                'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_initial))
            },
            'final_metrics': {
                'chi_squared': float(chi_sq_final),
                'chi_squared_reduced': float(chi_sq_red_final),
                'rmse_psi': float(rmse_psi_final),
                'rmse_delta': float(rmse_delta_final),
                'r2_psi': float(r2_psi_final),
                'r2_delta': float(r2_delta_final)
            },
            'improvement_percentage': float(improvement),
            'psi_theoretical': psi_theo_final.tolist(),
            'delta_theoretical': delta_theo_final.tolist(),
            'optimized_model': updated_model_final
        }
        
    except Exception as e:
        logger.error(f"❌ Error en Levenberg-Marquardt: {str(e)}", exc_info=True)
        return {
            'success': False,
            'algorithm': 'levenberg_marquardt',
            'message': f'Error: {str(e)}',
            'error': str(e)
        }


# ========================================
# ALGORITMO 2: SIMPLEX (NELDER-MEAD)
# ========================================

def optimize_simplex(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    max_iterations: int = 500  # Simplex necesita más iteraciones
) -> Dict[str, Any]:
    """
    ALGORITMO 2: Simplex (Nelder-Mead)
    
    Características:
    - Libre de derivadas (no calcula Jacobiano)
    - Más robusto ante valores iniciales alejados
    - Más lento (100-500 iteraciones típicamente)
    - No proporciona incertidumbre directamente
    
    Recomendado para: Cuando LM falla o valores iniciales muy inciertos
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: SIMPLEX (NELDER-MEAD)")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {
            'success': False,
            'error': 'No hay parámetros para optimizar'
        }
    
    start_time = time.time()
    
    # Extraer valores iniciales y bounds
    initial_values = []
    bounds_list = []
    params_names = []
    
    for param_info in params_to_optimize:
        initial_values.append(param_info['initial_value'])
        bounds_list.append((param_info['lower_bound'], param_info['upper_bound']))
        params_names.append(param_info['name'])
    
    initial_values = np.array(initial_values)
    
    logger.info(f"🔧 Optimizando {len(params_names)} parámetros")
    logger.info(f"  Parámetros: {params_names}")
    logger.info(f"  Iteraciones máximas: {max_iterations}")
    
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
        """Función objetivo para Simplex (retorna chi-cuadrado)"""
        iteration_count[0] += 1
        
        # Verificar bounds manualmente (Simplex no los respeta estrictamente)
        for i, (lower, upper) in enumerate(bounds_list):
            if params_vector[i] < lower or params_vector[i] > upper:
                return 1e10  # Penalización por salir de bounds
        
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_vector)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"Error en cálculo teórico: {str(e)}")
            return 1e10
        
        residuals_psi = psi_exp - psi_theo
        residuals_delta = unwrap_delta(delta_exp - delta_theo)
        residuals = np.concatenate([residuals_psi, residuals_delta])
        
        chi_sq = float(np.sum(residuals**2))
        
        if iteration_count[0] % 20 == 0:  # Log cada 20 iteraciones (Simplex es más lento)
            chi_sq_red = chi_sq / (len(wavelengths) * 2 - len(params_names))
            logger.info(f"  Iteración {iteration_count[0]}: χ² = {chi_sq:.2f}, χ²ᵣ = {chi_sq_red:.4f}")
        
        return chi_sq
    
    # OPTIMIZACIÓN CON SIMPLEX
    try:
        result = minimize(
            objective_function,
            x0=initial_values,
            method='Nelder-Mead',
            options={
                'maxiter': max_iterations,
                'maxfev': max_iterations * 2,  # Nelder-Mead puede hacer más evaluaciones
                'xatol': 1e-8,  # Tolerancia en parámetros
                'fatol': 1e-8,  # Tolerancia en función objetivo
                'adaptive': True  # Mejora la convergencia
            }
        )
        
        optimization_time = time.time() - start_time
        
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} s")
        logger.info(f"  Iteraciones: {result.nfev}, Estado: {result.message}")
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, result.x)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        residuals_psi_final = psi_exp - psi_theo_final
        residuals_delta_final = unwrap_delta(delta_exp - delta_theo_final)
        residuals_final = np.concatenate([residuals_psi_final, residuals_delta_final])
        
        chi_sq_final, chi_sq_red_final = calculate_chi_squared(
            residuals_final,
            len(params_names),
            len(wavelengths) * 2
        )
        
        rmse_psi_final = calculate_rmse(psi_exp, psi_theo_final)
        rmse_delta_final = calculate_rmse(delta_exp, delta_theo_final)
        r2_psi_final = calculate_r_squared(psi_exp, psi_theo_final)
        r2_delta_final = calculate_r_squared(delta_exp, delta_theo_final)
        
        improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
        
        logger.info(f"  χ² final: {chi_sq_final:.2f} (mejora: {improvement:.2f}%)")
        
        return {
            'success': result.success,
            'algorithm': 'simplex',
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'optimized_params': {params_names[i]: float(result.x[i]) for i in range(len(params_names))},
            'confidence_intervals': None,  # ← Simplex NO calcula incertidumbre
            'initial_metrics': {
                'chi_squared': float(chi_sq_initial),
                'chi_squared_reduced': float(chi_sq_red_initial),
                'rmse_psi': float(calculate_rmse(psi_exp, psi_theo_initial)),
                'rmse_delta': float(calculate_rmse(delta_exp, delta_theo_initial)),
                'r2_psi': float(calculate_r_squared(psi_exp, psi_theo_initial)),
                'r2_delta': float(calculate_r_squared(delta_exp, delta_theo_initial))
            },
            'final_metrics': {
                'chi_squared': float(chi_sq_final),
                'chi_squared_reduced': float(chi_sq_red_final),
                'rmse_psi': float(rmse_psi_final),
                'rmse_delta': float(rmse_delta_final),
                'r2_psi': float(r2_psi_final),
                'r2_delta': float(r2_delta_final)
            },
            'improvement_percentage': float(improvement),
            'psi_theoretical': psi_theo_final.tolist(),
            'delta_theoretical': delta_theo_final.tolist(),
            'optimized_model': updated_model_final
        }
        
    except Exception as e:
        logger.error(f"❌ Error en Simplex: {str(e)}", exc_info=True)
        return {
            'success': False,
            'algorithm': 'simplex',
            'message': f'Error: {str(e)}',
            'error': str(e)
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
    algorithm: str = 'levenberg_marquardt',
    strategy: str = 'simultaneous',  # Siempre simultánea, ignorado
    max_iterations: int = 200
) -> Dict[str, Any]:
    """
    Función principal de optimización (router de algoritmos)
    
    Args:
        algorithm: Algoritmo a usar:
            - 'levenberg_marquardt': Trust Region Reflective (DEFAULT)
            - 'simplex': Nelder-Mead
        strategy: IGNORADO (siempre simultánea)
        max_iterations: Iteraciones máximas
    
    Returns:
        Dict con resultados de optimización
    """
    
    algorithms = {
        'levenberg_marquardt': optimize_levenberg_marquardt,
        'simplex': optimize_simplex
    }
    
    if algorithm not in algorithms:
        logger.error(f"❌ Algoritmo '{algorithm}' no reconocido. Usando 'levenberg_marquardt'.")
        algorithm = 'levenberg_marquardt'
    
    logger.info(f"\n{'=' * 60}")
    logger.info(f"INICIANDO OPTIMIZACIÓN - Algoritmo: {algorithm.upper()}")
    logger.info(f"Parámetros a optimizar: {len(params_to_optimize)}")
    logger.info(f"Estrategia: SIMULTÁNEA (todos los parámetros a la vez)")
    logger.info(f"{'=' * 60}\n")
    
    optimization_func = algorithms[algorithm]
    
    # Ajustar max_iterations según algoritmo
    if algorithm == 'simplex' and max_iterations < 500:
        max_iterations = 500  # Simplex necesita más iteraciones
        logger.info(f"⚙️ Ajustando max_iterations a {max_iterations} para Simplex")
    
    # Ejecutar algoritmo seleccionado
    result = optimization_func(
        psi_exp, delta_exp, wavelengths,
        optical_model,
        params_to_optimize,
        calculate_theoretical_func,
        max_iterations=max_iterations
    )
    
    # Agregar campo de estrategia (siempre simultánea)
    if result.get('success'):
        result['strategy'] = 'simultaneous'
    
    return result