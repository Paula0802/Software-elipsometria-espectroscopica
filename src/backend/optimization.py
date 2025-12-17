"""
Módulo de optimización multiparamétrica para elipsometría espectroscópica
Utiliza Levenberg-Marquardt con Trust Region Reflective para ajuste de parámetros
"""
import numpy as np
from scipy.optimize import least_squares
import logging
from typing import Dict, List, Tuple, Any
import time

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
        # Calcular matriz de covarianza
        # J^T * J es la aproximación a la matriz Hessiana
        J = result.jac
        cov = np.linalg.inv(J.T @ J)
        
        # Errores estándar = raíz cuadrada de la diagonal de la covarianza
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
        # Retornar sin errores estándar
        return {name: (float(result.x[i]), 0.0) for i, name in enumerate(params_names)}


def optimize_parameters(
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
    Optimización multiparamétrica usando Levenberg-Marquardt
    
    Args:
        psi_exp: Valores experimentales de Psi
        delta_exp: Valores experimentales de Delta
        wavelengths: Longitudes de onda
        optical_model: Modelo óptico completo
        params_to_optimize: Lista de parámetros a optimizar con sus bounds
        calculate_theoretical_func: Función que calcula Psi y Delta teóricos
        max_iterations: Máximo número de iteraciones
        ftol: Tolerancia de la función objetivo
        xtol: Tolerancia de los parámetros
    
    Returns:
        Dict con resultados de optimización
    """
    
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
    
    logger.info(f"🔧 Iniciando optimización de {len(params_names)} parámetros")
    logger.info(f"  Parámetros: {params_names}")
    logger.info(f"  Valores iniciales: {initial_values}")
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    residuals_psi_initial = psi_exp - psi_theo_initial
    residuals_delta_initial = unwrap_delta(delta_exp - delta_theo_initial)
    
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        np.concatenate([residuals_psi_initial, residuals_delta_initial]),
        len(params_names),
        len(wavelengths) * 2
    )
    
    logger.info(f"  χ² inicial: {chi_sq_initial:.2f}")
    logger.info(f"  χ²ᵣ inicial: {chi_sq_red_initial:.4f}")
    
    # Contador de iteraciones
    iteration_count = [0]
    
    def objective_function(params_vector):
        """
        Función objetivo: residuos de Ψ y Δ
        """
        iteration_count[0] += 1
        
        # Actualizar modelo con parámetros actuales
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_vector)
        
        # Calcular Ψ y Δ teóricos
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"Error en cálculo teórico: {str(e)}")
            # Retornar residuos grandes si falla
            return np.ones(len(wavelengths) * 2) * 1e6
        
        # Calcular residuos
        residuals_psi = psi_exp - psi_theo
        residuals_delta = unwrap_delta(delta_exp - delta_theo)
        
        # Concatenar residuos
        residuals = np.concatenate([residuals_psi, residuals_delta])
        
        # Log cada 10 iteraciones
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
            method='trf',  # Trust Region Reflective
            ftol=ftol,
            xtol=xtol,
            max_nfev=max_iterations,
            verbose=0
        )
        
        optimization_time = time.time() - start_time
        
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} segundos")
        logger.info(f"  Iteraciones: {result.nfev}")
        logger.info(f"  Estado: {result.message}")
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, result.x)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        residuals_psi_final = psi_exp - psi_theo_final
        residuals_delta_final = unwrap_delta(delta_exp - delta_theo_final)
        
        chi_sq_final, chi_sq_red_final = calculate_chi_squared(
            result.fun,
            len(params_names),
            len(wavelengths) * 2
        )
        
        rmse_psi_initial = calculate_rmse(psi_exp, psi_theo_initial)
        rmse_delta_initial = calculate_rmse(delta_exp, delta_theo_initial)
        rmse_psi_final = calculate_rmse(psi_exp, psi_theo_final)
        rmse_delta_final = calculate_rmse(delta_exp, delta_theo_final)
        
        r2_psi_initial = calculate_r_squared(psi_exp, psi_theo_initial)
        r2_delta_initial = calculate_r_squared(delta_exp, delta_theo_initial)
        r2_psi_final = calculate_r_squared(psi_exp, psi_theo_final)
        r2_delta_final = calculate_r_squared(delta_exp, delta_theo_final)
        
        # Calcular intervalos de confianza
        confidence_intervals = estimate_confidence_intervals(result, params_names)
        
        # Calcular mejora porcentual
        improvement = ((chi_sq_initial - chi_sq_final) / chi_sq_initial) * 100 if chi_sq_initial > 0 else 0
        
        logger.info(f"  χ² final: {chi_sq_final:.2f} (mejora: {improvement:.2f}%)")
        logger.info(f"  χ²ᵣ final: {chi_sq_red_final:.4f}")
        logger.info(f"  Parámetros optimizados: {result.x}")
        
        return {
            'success': result.success,
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            
            # Parámetros optimizados
            'optimized_params': {
                params_names[i]: float(result.x[i]) 
                for i in range(len(params_names))
            },
            'confidence_intervals': confidence_intervals,
            
            # Métricas iniciales
            'initial_metrics': {
                'chi_squared': float(chi_sq_initial),
                'chi_squared_reduced': float(chi_sq_red_initial),
                'rmse_psi': float(rmse_psi_initial),
                'rmse_delta': float(rmse_delta_initial),
                'r2_psi': float(r2_psi_initial),
                'r2_delta': float(r2_delta_initial)
            },
            
            # Métricas finales
            'final_metrics': {
                'chi_squared': float(chi_sq_final),
                'chi_squared_reduced': float(chi_sq_red_final),
                'rmse_psi': float(rmse_psi_final),
                'rmse_delta': float(rmse_delta_final),
                'r2_psi': float(r2_psi_final),
                'r2_delta': float(r2_delta_final)
            },
            
            # Mejora
            'improvement_percentage': float(improvement),
            
            # Curvas teóricas finales
            'psi_theoretical': psi_theo_final.tolist(),
            'delta_theoretical': delta_theo_final.tolist(),
            
            # Modelo optimizado
            'optimized_model': updated_model_final
        }
        
    except Exception as e:
        logger.error(f"❌ Error durante optimización: {str(e)}", exc_info=True)
        return {
            'success': False,
            'message': f'Error durante optimización: {str(e)}',
            'error': str(e)
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
        Modelo óptico actualizado
    """
    import copy
    updated_model = copy.deepcopy(optical_model)
    
    for i, param_info in enumerate(params_to_optimize):
        param_name = param_info['name']
        param_path = param_info['path']  # e.g., ['layers', 0, 'thickness']
        new_value = float(params_vector[i])
        
        # Navegar al parámetro en el modelo
        target = updated_model
        for key in param_path[:-1]:
            target = target[key]
        
        # Actualizar valor
        target[param_path[-1]] = new_value
    
    return updated_model