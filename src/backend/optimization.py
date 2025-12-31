"""
Módulo de optimización multiparamétrica para elipsometría espectroscópica
Versión mejorada con ponderación estadística y robustez numérica

Soporta 2 algoritmos:
1. Levenberg-Marquardt (Trust Region Reflective) - con covarianza correcta
2. Simplex (Nelder-Mead) - con penalización suave

Ambos ejecutan optimización SIMULTÁNEA de todos los parámetros
"""
import numpy as np
from scipy.optimize import least_squares, minimize
import logging
from typing import Dict, List, Tuple, Any, Optional
import time
import copy

logger = logging.getLogger(__name__)


# ========================================
# CONFIGURACIÓN DE PESOS ESTADÍSTICOS
# ========================================

# Incertidumbres experimentales típicas (pueden ser personalizadas por el usuario)
DEFAULT_SIGMA_PSI = 0.01    # ±0.01° en ψ (error típico de elipsómetros)
DEFAULT_SIGMA_DELTA = 0.1   # ±0.1° en Δ (error típico de elipsómetros)


def unwrap_delta_global(delta: np.ndarray) -> np.ndarray:
    """
    Unwrap global de delta usando np.unwrap (maneja discontinuidades de 360°)
    
    CRÍTICO: Esto previene saltos artificiales en resonancias
    
    Args:
        delta: Array de valores delta en grados
    
    Returns:
        delta unwrapped en grados (puede estar fuera de [0, 360])
    """
    delta_rad = np.deg2rad(delta)
    delta_unwrapped_rad = np.unwrap(delta_rad)
    return np.rad2deg(delta_unwrapped_rad)


def calculate_weighted_residuals(
    psi_exp: np.ndarray,
    psi_theo: np.ndarray,
    delta_exp: np.ndarray,
    delta_theo: np.ndarray,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA,
    use_global_unwrap: bool = True
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Calcula residuos ponderados estadísticamente
    
    Residuo ponderado: r_i = (y_exp - y_theo) / σ_i
    
    Args:
        psi_exp, psi_theo: Arrays de ψ experimental y teórico
        delta_exp, delta_theo: Arrays de Δ experimental y teórico
        sigma_psi: Incertidumbre experimental en ψ (grados)
        sigma_delta: Incertidumbre experimental en Δ (grados)
        use_global_unwrap: Si True, usa unwrap global (RECOMENDADO)
    
    Returns:
        (residuals_psi_weighted, residuals_delta_weighted)
    """
    # Residuos de ψ (directo)
    residuals_psi = psi_exp - psi_theo
    residuals_psi_weighted = residuals_psi / sigma_psi
    
    # Residuos de Δ (con unwrap)
    if use_global_unwrap:
        # MÉTODO ROBUSTO: unwrap global de ambas señales
        delta_exp_unwrapped = unwrap_delta_global(delta_exp)
        delta_theo_unwrapped = unwrap_delta_global(delta_theo)
        residuals_delta = delta_exp_unwrapped - delta_theo_unwrapped
    else:
        # Método original (solo para comparación)
        residuals_delta = delta_exp - delta_theo
        residuals_delta = np.where(residuals_delta > 180, residuals_delta - 360, residuals_delta)
        residuals_delta = np.where(residuals_delta < -180, residuals_delta + 360, residuals_delta)
    
    residuals_delta_weighted = residuals_delta / sigma_delta
    
    return residuals_psi_weighted, residuals_delta_weighted


def calculate_chi_squared(
    residuals_weighted: np.ndarray,
    n_params: int,
    n_data: int
) -> Tuple[float, float]:
    """
    Calcula chi-cuadrado y chi-cuadrado reducido CORRECTOS
    
    IMPORTANTE: residuals_weighted ya deben estar ponderados (r_i = Δy_i / σ_i)
    
    χ² = Σ(r_i²) donde r_i son residuos ponderados
    χ²_red = χ² / (N_data - N_params)
    
    Args:
        residuals_weighted: Residuos ponderados concatenados [psi, delta]
        n_params: Número de parámetros optimizados
        n_data: Número de puntos de datos (longitudes de onda × 2)
    
    Returns:
        (chi_squared, chi_squared_reduced)
    """
    chi_squared = float(np.sum(residuals_weighted**2))
    degrees_of_freedom = n_data - n_params
    
    if degrees_of_freedom <= 0:
        logger.warning(f"⚠️ Grados de libertad no positivos: {degrees_of_freedom}")
        chi_squared_reduced = chi_squared
    else:
        chi_squared_reduced = chi_squared / degrees_of_freedom
    
    return chi_squared, chi_squared_reduced


def calculate_rmse(experimental: np.ndarray, theoretical: np.ndarray) -> float:
    """
    Calcula Root Mean Square Error (sin ponderar, para reporte)
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


def estimate_confidence_intervals(
    result,
    params_names: List[str],
    n_data: int
) -> Dict[str, Tuple[float, float]]:
    """
    Estima intervalos de confianza (±σ) CORRECTOS para cada parámetro
    SOLO PARA LEVENBERG-MARQUARDT (usa Jacobiano)
    
    CORRECCIÓN CRÍTICA: Incluye factor σ² en la covarianza
    
    Cov = σ² (J^T J)^(-1)
    donde σ² = Σ(residuals²) / (N_data - N_params)
    
    Args:
        result: Resultado de scipy.optimize.least_squares
        params_names: Nombres de los parámetros
        n_data: Número total de datos (longitudes × 2)
    
    Returns:
        Dict con intervalos de confianza para cada parámetro
    """
    try:
        J = result.jac
        residuals = result.fun
        n_params = len(result.x)
        
        # CORRECCIÓN: calcular σ² correctamente
        ndof = n_data - n_params
        if ndof <= 0:
            logger.warning("⚠️ Grados de libertad no positivos, usando ndof=1")
            ndof = 1
        
        sigma_squared = np.sum(residuals**2) / ndof
        
        # Matriz de covarianza CORRECTA
        try:
            cov = sigma_squared * np.linalg.inv(J.T @ J)
        except np.linalg.LinAlgError:
            logger.warning("⚠️ Matriz singular, usando pseudo-inversa")
            cov = sigma_squared * np.linalg.pinv(J.T @ J)
        
        perr = np.sqrt(np.abs(np.diag(cov)))  # abs por seguridad numérica
        
        confidence_intervals = {}
        for i, name in enumerate(params_names):
            confidence_intervals[name] = (
                float(result.x[i]),
                float(perr[i])
            )
        
        return confidence_intervals
        
    except Exception as e:
        logger.warning(f"⚠️ No se pudieron calcular intervalos de confianza: {str(e)}")
        return {name: (float(result.x[i]), 0.0) for i, name in enumerate(params_names)}


def calculate_information_criteria(
    chi_squared: float,
    n_params: int,
    n_data: int
) -> Dict[str, float]:
    """
    Calcula criterios de información (AIC, BIC)
    
    Útiles para comparar modelos con diferente número de parámetros
    
    AIC = N ln(χ²/N) + 2k
    BIC = N ln(χ²/N) + k ln(N)
    
    donde N = número de datos, k = número de parámetros
    
    Args:
        chi_squared: Chi-cuadrado del ajuste
        n_params: Número de parámetros
        n_data: Número de datos
    
    Returns:
        Dict con AIC y BIC
    """
    if chi_squared <= 0 or n_data <= 0:
        return {'aic': float('inf'), 'bic': float('inf')}
    
    log_likelihood = -0.5 * chi_squared
    
    aic = 2 * n_params - 2 * log_likelihood
    bic = n_params * np.log(n_data) - 2 * log_likelihood
    
    return {
        'aic': float(aic),
        'bic': float(bic)
    }


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
        Modelo óptico actualizado (deep copy)
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
    xtol: float = 1e-8,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA,
    use_tikhonov_regularization: bool = False,
    lambda_reg: float = 1e-4
) -> Dict[str, Any]:
    """
    ALGORITMO 1: Levenberg-Marquardt (Trust Region Reflective)
    CON PONDERACIÓN ESTADÍSTICA CORRECTA
    
    Mejoras implementadas:
    - ✅ Residuos ponderados por σ_psi y σ_delta
    - ✅ Unwrap global de Δ (previene saltos artificiales)
    - ✅ Covarianza correcta con σ² (intervalos de confianza válidos)
    - ✅ Criterios de información (AIC, BIC)
    - ✅ Regularización de Tikhonov opcional (estabiliza parámetros correlacionados)
    
    Args:
        sigma_psi: Incertidumbre experimental en ψ (default: 0.01°)
        sigma_delta: Incertidumbre experimental en Δ (default: 0.1°)
        use_tikhonov_regularization: Activar regularización (útil para Drude-Lorentz)
        lambda_reg: Factor de regularización
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: LEVENBERG-MARQUARDT (TRF) - VERSIÓN MEJORADA")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}
    
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
    logger.info(f"  Ponderación: σ_ψ = {sigma_psi}°, σ_Δ = {sigma_delta}°")
    if use_tikhonov_regularization:
        logger.info(f"  Regularización Tikhonov: λ = {lambda_reg}")
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, use_global_unwrap=True
    )
    
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data = len(wavelengths) * 2
    
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        residuals_initial, len(params_names), n_data
    )
    
    logger.info(f"  χ² inicial: {chi_sq_initial:.2f}, χ²ᵣ: {chi_sq_red_initial:.4f}")
    
    iteration_count = [0]
    
    def objective_function(params_vector):
        """Función objetivo para Levenberg-Marquardt (retorna residuos ponderados)"""
        iteration_count[0] += 1
        
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_vector)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en cálculo teórico: {str(e)}")
            return np.ones(n_data) * 1e6
        
        # Residuos ponderados
        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, use_global_unwrap=True
        )
        
        residuals = np.concatenate([residuals_psi, residuals_delta])
        
        # Regularización de Tikhonov (opcional)
        if use_tikhonov_regularization:
            residuals_reg = lambda_reg * (params_vector - initial_values)
            residuals = np.concatenate([residuals, residuals_reg])
        
        if iteration_count[0] % 10 == 0:
            chi_sq, chi_sq_red = calculate_chi_squared(residuals[:n_data], len(params_names), n_data)
            logger.info(f"  Iteración {iteration_count[0]}: χ² = {chi_sq:.2f}, χ²ᵣ = {chi_sq_red:.4f}")
        
        return residuals
    
    # OPTIMIZACIÓN CON LEVENBERG-MARQUARDT
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
        
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} s")
        logger.info(f"  Iteraciones: {result.nfev}, Estado: {result.message}")
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, result.x)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        residuals_psi_final, residuals_delta_final = calculate_weighted_residuals(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            sigma_psi, sigma_delta, use_global_unwrap=True
        )
        
        residuals_final = np.concatenate([residuals_psi_final, residuals_delta_final])
        
        chi_sq_final, chi_sq_red_final = calculate_chi_squared(
            residuals_final, len(params_names), n_data
        )
        
        # Métricas adicionales (sin ponderar, para reporte)
        rmse_psi_final = calculate_rmse(psi_exp, psi_theo_final)
        rmse_delta_final = calculate_rmse(delta_exp, delta_theo_final)
        r2_psi_final = calculate_r_squared(psi_exp, psi_theo_final)
        r2_delta_final = calculate_r_squared(delta_exp, delta_theo_final)
        
        # Intervalos de confianza CORRECTOS
        confidence_intervals = estimate_confidence_intervals(result, params_names, n_data)
        
        # Criterios de información
        info_criteria = calculate_information_criteria(chi_sq_final, len(params_names), n_data)
        
        improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
        
        logger.info(f"  χ² final: {chi_sq_final:.2f} (mejora: {improvement:.2f}%)")
        logger.info(f"  AIC: {info_criteria['aic']:.2f}, BIC: {info_criteria['bic']:.2f}")
        
        return {
            'success': result.success,
            'algorithm': 'levenberg_marquardt',
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'optimized_params': {params_names[i]: float(result.x[i]) for i in range(len(params_names))},
            'confidence_intervals': confidence_intervals,
            'weighting': {
                'sigma_psi': sigma_psi,
                'sigma_delta': sigma_delta,
                'method': 'statistical_weighting'
            },
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
                'r2_delta': float(r2_delta_final),
                'aic': float(info_criteria['aic']),
                'bic': float(info_criteria['bic'])
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
    max_iterations: int = 500,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA
) -> Dict[str, Any]:
    """
    ALGORITMO 2: Simplex (Nelder-Mead)
    CON PONDERACIÓN ESTADÍSTICA Y PENALIZACIÓN SUAVE
    
    Mejoras implementadas:
    - ✅ Residuos ponderados por σ_psi y σ_delta
    - ✅ Unwrap global de Δ
    - ✅ Penalización suave (no brutal) en boundaries
    - ✅ Criterios de información (AIC, BIC)
    
    Args:
        sigma_psi: Incertidumbre experimental en ψ (default: 0.01°)
        sigma_delta: Incertidumbre experimental en Δ (default: 0.1°)
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: SIMPLEX (NELDER-MEAD) - VERSIÓN MEJORADA")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}
    
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
    logger.info(f"  Ponderación: σ_ψ = {sigma_psi}°, σ_Δ = {sigma_delta}°")
    logger.info(f"  Iteraciones máximas: {max_iterations}")
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, use_global_unwrap=True
    )
    
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data = len(wavelengths) * 2
    
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        residuals_initial, len(params_names), n_data
    )
    
    logger.info(f"  χ² inicial: {chi_sq_initial:.2f}, χ²ᵣ: {chi_sq_red_initial:.4f}")
    
    iteration_count = [0]
    
    def objective_function(params_vector):
        """Función objetivo para Simplex (retorna χ² ponderado)"""
        iteration_count[0] += 1
        
        # Penalización SUAVE (no brutal) por salir de bounds
        penalty = 0.0
        for i, (lower, upper) in enumerate(bounds_list):
            if params_vector[i] < lower:
                penalty += (lower - params_vector[i])**2
            elif params_vector[i] > upper:
                penalty += (params_vector[i] - upper)**2
        
        if penalty > 0:
            return chi_sq_initial + 1e6 * penalty  # Penalización proporcional
        
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_vector)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en cálculo teórico: {str(e)}")
            return chi_sq_initial * 1e3  # Penalización moderada
        
        # Residuos ponderados
        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, use_global_unwrap=True
        )
        
        residuals = np.concatenate([residuals_psi, residuals_delta])
        chi_sq = float(np.sum(residuals**2))
        
        if iteration_count[0] % 20 == 0:
            chi_sq_red = chi_sq / (n_data - len(params_names))
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
                'maxfev': max_iterations * 2,
                'xatol': 1e-8,
                'fatol': 1e-8,
                'adaptive': True
            }
        )
        
        optimization_time = time.time() - start_time
        
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} s")
        logger.info(f"  Iteraciones: {result.nfev}, Estado: {result.message}")
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, result.x)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        residuals_psi_final, residuals_delta_final = calculate_weighted_residuals(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            sigma_psi, sigma_delta, use_global_unwrap=True
        )
        
        residuals_final = np.concatenate([residuals_psi_final, residuals_delta_final])
        
        chi_sq_final, chi_sq_red_final = calculate_chi_squared(
            residuals_final, len(params_names), n_data
        )
        
        # Métricas adicionales
        rmse_psi_final = calculate_rmse(psi_exp, psi_theo_final)
        rmse_delta_final = calculate_rmse(delta_exp, delta_theo_final)
        r2_psi_final = calculate_r_squared(psi_exp, psi_theo_final)
        r2_delta_final = calculate_r_squared(delta_exp, delta_theo_final)
        
        # Criterios de información
        info_criteria = calculate_information_criteria(chi_sq_final, len(params_names), n_data)
        
        improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
        
        logger.info(f"  χ² final: {chi_sq_final:.2f} (mejora: {improvement:.2f}%)")
        logger.info(f"  AIC: {info_criteria['aic']:.2f}, BIC: {info_criteria['bic']:.2f}")
        
        return {
            'success': result.success,
            'algorithm': 'simplex',
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'optimized_params': {params_names[i]: float(result.x[i]) for i in range(len(params_names))},
            'confidence_intervals': None,  # Simplex no calcula incertidumbre
            'weighting': {
                'sigma_psi': sigma_psi,
                'sigma_delta': sigma_delta,
                'method': 'statistical_weighting'
            },
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
                'r2_delta': float(r2_delta_final),
                'aic': float(info_criteria['aic']),
                'bic': float(info_criteria['bic'])
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
    strategy: str = 'simultaneous',
    max_iterations: int = 200,
    sigma_psi: Optional[float] = None,
    sigma_delta: Optional[float] = None,
    use_tikhonov_regularization: bool = False,
    lambda_reg: float = 1e-4
) -> Dict[str, Any]:
    """
    Función principal de optimización (router de algoritmos)
    VERSIÓN MEJORADA con ponderación estadística
    
    Args:
        algorithm: Algoritmo a usar:
            - 'levenberg_marquardt': Trust Region Reflective (DEFAULT)
            - 'simplex': Nelder-Mead
        strategy: IGNORADO (siempre simultánea)
        max_iterations: Iteraciones máximas
        sigma_psi: Incertidumbre experimental en ψ (None = usar default)
        sigma_delta: Incertidumbre experimental en Δ (None = usar default)
        use_tikhonov_regularization: Activar regularización (solo LM)
        lambda_reg: Factor de regularización
    
    Returns:
        Dict con resultados de optimización mejorados
    """
    
    # Valores por defecto de incertidumbres
    if sigma_psi is None:
        sigma_psi = DEFAULT_SIGMA_PSI
    if sigma_delta is None:
        sigma_delta = DEFAULT_SIGMA_DELTA
    
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
    logger.info(f"Ponderación estadística: σ_ψ={sigma_psi}°, σ_Δ={sigma_delta}°")
    logger.info(f"{'=' * 60}\n")
    
    # Ajustar max_iterations según algoritmo
    if algorithm == 'simplex' and max_iterations < 500:
        max_iterations = 500
        logger.info(f"⚙️ Ajustando max_iterations a {max_iterations} para Simplex")
    
    # Ejecutar algoritmo seleccionado
    if algorithm == 'levenberg_marquardt':
        result = optimize_levenberg_marquardt(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize,
            calculate_theoretical_func,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta,
            use_tikhonov_regularization=use_tikhonov_regularization,
            lambda_reg=lambda_reg
        )
    else:  # simplex
        result = optimize_simplex(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize,
            calculate_theoretical_func,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta
        )
    
    # Agregar campo de estrategia
    if result.get('success'):
        result['strategy'] = 'simultaneous'
    
    return result