"""
Módulo de optimización multiparamétrica para elipsometría espectroscópica
VERSIÓN PROFESIONAL con mejoras críticas de nivel comercial

Implementa:
1. Levenberg-Marquardt (Trust Region Reflective) con ponderación estadística correcta
2. Simplex (Nelder-Mead) como explorador robusto
3. Multistart (Simplex → LM) para evitar mínimos locales
4. Escalado automático de parámetros
5. Análisis de correlación
6. Regularización física y matemática
7. Pesos espectrales
"""
import numpy as np
from scipy.optimize import least_squares, minimize
from scipy.linalg import LinAlgError
import logging
from typing import Dict, List, Tuple, Any, Optional
import time
import copy

logger = logging.getLogger(__name__)

# ========================================
# CONFIGURACIÓN DE PESOS ESTADÍSTICOS
# ========================================

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


def calculate_spectral_weights(wavelengths: np.ndarray, 
                               focus_regions: Optional[List[Tuple[float, float]]] = None,
                               focus_weight: float = 2.0) -> np.ndarray:
    """
    Calcula pesos espectrales para dar más importancia a regiones específicas
    
    Útil para enfocarse en:
    - Resonancias plasmónicas
    - Bandgaps
    - Regiones con mayor información
    
    Args:
        wavelengths: Array de longitudes de onda (nm)
        focus_regions: Lista de tuplas (λ_min, λ_max) para enfatizar
        focus_weight: Factor de peso adicional para regiones enfocadas
    
    Returns:
        Array de pesos espectrales (1.0 por defecto, focus_weight en regiones)
    """
    weights = np.ones_like(wavelengths, dtype=float)
    
    if focus_regions:
        for wl_min, wl_max in focus_regions:
            mask = (wavelengths >= wl_min) & (wavelengths <= wl_max)
            weights[mask] = focus_weight
            logger.info(f"📍 Peso espectral aumentado en [{wl_min:.1f}, {wl_max:.1f}] nm (x{focus_weight})")
    
    return weights


def scale_parameters(params_to_optimize: List[Dict]) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Escala parámetros para mejorar condicionamiento del Jacobiano
    
    CRÍTICO: LM es muy sensible a escalas de parámetros
    Esto mejora dramáticamente convergencia y estabilidad
    
    Args:
        params_to_optimize: Lista de parámetros con bounds e initial_value
    
    Returns:
        (scales, offsets, names) donde:
            - scales[i] = rango típico del parámetro i
            - offsets[i] = valor inicial del parámetro i
            - names = nombres de parámetros
    """
    scales = []
    offsets = []
    names = []
    
    for param in params_to_optimize:
        initial = param['initial_value']
        lower = param['lower_bound']
        upper = param['upper_bound']
        
        # Escala = mitad del rango permitido
        scale = (upper - lower) / 2.0
        
        # Offset = valor inicial
        offset = initial
        
        scales.append(scale)
        offsets.append(offset)
        names.append(param['name'])
        
        logger.debug(f"  {param['name']}: offset={offset:.4f}, scale={scale:.4f}")
    
    return np.array(scales), np.array(offsets), names


def unscale_parameters(params_scaled: np.ndarray, 
                       scales: np.ndarray, 
                       offsets: np.ndarray) -> np.ndarray:
    """Convierte parámetros escalados a valores físicos"""
    return offsets + params_scaled * scales


def scale_to_normalized(params_physical: np.ndarray,
                        scales: np.ndarray,
                        offsets: np.ndarray) -> np.ndarray:
    """Convierte parámetros físicos a espacio escalado"""
    return (params_physical - offsets) / scales


def apply_physical_constraints(params: Dict[str, float], 
                               param_names: List[str]) -> Dict[str, float]:
    """
    Aplica restricciones físicas a parámetros optimizados
    
    Evita soluciones no físicas como:
    - Fuerzas de oscilador negativas
    - Dampings negativos
    - Frecuencias mal ordenadas
    
    Args:
        params: Diccionario de parámetros optimizados
        param_names: Lista de nombres de parámetros
    
    Returns:
        Diccionario de parámetros con restricciones aplicadas
    """
    constrained = params.copy()
    
    for name in param_names:
        value = params[name]
        
        # Restricciones según tipo de parámetro
        if name.startswith('f') and not name.startswith('file'):
            # Fuerzas de oscilador: siempre positivas
            constrained[name] = max(0.0, value)
        
        elif 'gamma' in name.lower() or 'Gamma' in name:
            # Dampings: siempre positivos
            constrained[name] = max(1e-6, value)
        
        elif 'eps_inf' in name:
            # Permitividad de fondo: típicamente > 1
            constrained[name] = max(1.0, value)
    
    return constrained


def calculate_weighted_residuals(
    psi_exp: np.ndarray,
    psi_theo: np.ndarray,
    delta_exp: np.ndarray,
    delta_theo: np.ndarray,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA,
    spectral_weights: Optional[np.ndarray] = None,
    use_global_unwrap: bool = True
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Calcula residuos ponderados estadísticamente con pesos espectrales opcionales
    
    Residuo ponderado: r_i = w_i * (y_exp - y_theo) / σ_i
    
    Args:
        psi_exp, psi_theo: Arrays de ψ experimental y teórico
        delta_exp, delta_theo: Arrays de Δ experimental y teórico
        sigma_psi: Incertidumbre experimental en ψ (grados)
        sigma_delta: Incertidumbre experimental en Δ (grados)
        spectral_weights: Pesos espectrales opcionales (misma longitud que psi_exp)
        use_global_unwrap: Si True, usa unwrap global (RECOMENDADO)
    
    Returns:
        (residuals_psi_weighted, residuals_delta_weighted)
    """
    # Residuos de ψ
    residuals_psi = psi_exp - psi_theo
    residuals_psi_weighted = residuals_psi / sigma_psi
    
    # Residuos de Δ con unwrap
    if use_global_unwrap:
        delta_exp_unwrapped = unwrap_delta_global(delta_exp)
        delta_theo_unwrapped = unwrap_delta_global(delta_theo)
        residuals_delta = delta_exp_unwrapped - delta_theo_unwrapped
    else:
        residuals_delta = delta_exp - delta_theo
        residuals_delta = np.where(residuals_delta > 180, residuals_delta - 360, residuals_delta)
        residuals_delta = np.where(residuals_delta < -180, residuals_delta + 360, residuals_delta)
    
    residuals_delta_weighted = residuals_delta / sigma_delta
    
    # Aplicar pesos espectrales si se proporcionan
    if spectral_weights is not None:
        residuals_psi_weighted *= spectral_weights
        residuals_delta_weighted *= spectral_weights
    
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
    """Calcula Root Mean Square Error (sin ponderar, para reporte)"""
    return float(np.sqrt(np.mean((experimental - theoretical)**2)))


def calculate_r_squared(experimental: np.ndarray, theoretical: np.ndarray) -> float:
    """Calcula coeficiente de determinación R²"""
    ss_res = np.sum((experimental - theoretical)**2)
    ss_tot = np.sum((experimental - np.mean(experimental))**2)
    
    if ss_tot == 0:
        return 0.0
    
    r_squared = 1 - (ss_res / ss_tot)
    return float(r_squared)


def estimate_confidence_intervals(
    result,
    params_names: List[str],
    n_data: int,
    use_tikhonov: bool = False,
    n_tikhonov_terms: int = 0
) -> Dict[str, Tuple[float, float]]:
    """
    Estima intervalos de confianza (±σ) CORRECTOS para cada parámetro
    SOLO PARA LEVENBERG-MARQUARDT (usa Jacobiano)
    
    CORRECCIÓN CRÍTICA: 
    - Incluye factor σ² en la covarianza
    - Ajusta n_data si hay regularización de Tikhonov
    
    Cov = σ² (J^T J)^(-1)
    donde σ² = Σ(residuals²) / (N_data - N_params)
    
    Args:
        result: Resultado de scipy.optimize.least_squares
        params_names: Nombres de los parámetros
        n_data: Número total de datos FÍSICOS (longitudes × 2)
        use_tikhonov: Si se usó regularización
        n_tikhonov_terms: Número de términos de regularización añadidos
    """
    try:
        J = result.jac
        residuals = result.fun
        n_params = len(result.x)
        
        # CORRECCIÓN: Si hay Tikhonov, el Jacobiano tiene filas extra
        # Usamos solo la parte "física" para calcular covarianza
        if use_tikhonov and n_tikhonov_terms > 0:
            # Tomar solo las primeras n_data filas (parte física)
            J_physical = J[:n_data, :]
            residuals_physical = residuals[:n_data]
            
            logger.info(f"📊 Calculando covarianza sin términos de regularización")
            logger.info(f"  Jacobiano completo: {J.shape}, Jacobiano físico: {J_physical.shape}")
        else:
            J_physical = J
            residuals_physical = residuals
        
        # Calcular σ² CORRECTAMENTE
        ndof = n_data - n_params
        if ndof <= 0:
            logger.warning("⚠️ Grados de libertad no positivos, usando ndof=1")
            ndof = 1
        
        sigma_squared = np.sum(residuals_physical**2) / ndof
        
        # Matriz de covarianza CORRECTA (solo con Jacobiano físico)
        try:
            cov = sigma_squared * np.linalg.inv(J_physical.T @ J_physical)
        except LinAlgError:
            logger.warning("⚠️ Matriz singular, usando pseudo-inversa")
            cov = sigma_squared * np.linalg.pinv(J_physical.T @ J_physical)
        
        perr = np.sqrt(np.abs(np.diag(cov)))
        
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


def calculate_correlation_matrix(
    result,
    params_names: List[str],
    n_data: int,
    use_tikhonov: bool = False,
    n_tikhonov_terms: int = 0
) -> Tuple[np.ndarray, List[Tuple[str, str, float]]]:
    """
    Calcula matriz de correlación entre parámetros
    
    Detecta parámetros altamente correlacionados (|ρ| > 0.95)
    que pueden causar problemas de identificabilidad
    
    Args:
        result: Resultado de least_squares
        params_names: Nombres de parámetros
        n_data: Número de datos físicos
        use_tikhonov: Si se usó regularización
        n_tikhonov_terms: Número de términos de regularización
    
    Returns:
        (correlation_matrix, high_correlations)
        donde high_correlations es lista de (param1, param2, correlation)
    """
    try:
        J = result.jac
        n_params = len(result.x)
        
        # Usar solo Jacobiano físico (sin regularización)
        if use_tikhonov and n_tikhonov_terms > 0:
            J_physical = J[:n_data, :]
            residuals_physical = result.fun[:n_data]
        else:
            J_physical = J
            residuals_physical = result.fun
        
        # Calcular covarianza
        ndof = max(1, n_data - n_params)
        sigma_squared = np.sum(residuals_physical**2) / ndof
        
        try:
            cov = sigma_squared * np.linalg.inv(J_physical.T @ J_physical)
        except LinAlgError:
            cov = sigma_squared * np.linalg.pinv(J_physical.T @ J_physical)
        
        # Matriz de correlación
        std_devs = np.sqrt(np.abs(np.diag(cov)))
        correlation_matrix = np.zeros((n_params, n_params))
        
        for i in range(n_params):
            for j in range(n_params):
                if std_devs[i] > 0 and std_devs[j] > 0:
                    correlation_matrix[i, j] = cov[i, j] / (std_devs[i] * std_devs[j])
                else:
                    correlation_matrix[i, j] = 0.0
        
        # Detectar correlaciones altas (|ρ| > 0.95)
        high_correlations = []
        for i in range(n_params):
            for j in range(i + 1, n_params):
                corr = correlation_matrix[i, j]
                if abs(corr) > 0.95:
                    high_correlations.append((params_names[i], params_names[j], float(corr)))
        
        if high_correlations:
            logger.warning("⚠️ Parámetros altamente correlacionados detectados:")
            for p1, p2, corr in high_correlations:
                logger.warning(f"  {p1} ↔ {p2}: ρ = {corr:.3f}")
        
        return correlation_matrix, high_correlations
        
    except Exception as e:
        logger.warning(f"⚠️ No se pudo calcular matriz de correlación: {str(e)}")
        n_params = len(params_names)
        return np.eye(n_params), []


def calculate_information_criteria(
    chi_squared: float,
    n_params: int,
    n_data: int
) -> Dict[str, float]:
    """
    Calcula criterios de información (AIC, BIC)
    
    Útiles para comparar modelos con diferente número de parámetros
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
    lambda_reg: float = 1e-4,
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None,
    use_parameter_scaling: bool = True
) -> Dict[str, Any]:
    """
    ALGORITMO 1: Levenberg-Marquardt (Trust Region Reflective)
    VERSIÓN PROFESIONAL con todas las mejoras críticas
    
    Mejoras implementadas:
    ✅ Residuos ponderados estadísticamente
    ✅ Unwrap global de Δ
    ✅ Covarianza correcta con σ² (intervalos de confianza válidos)
    ✅ Escalado automático de parámetros (mejora convergencia)
    ✅ Pesos espectrales opcionales
    ✅ Regularización de Tikhonov opcional
    ✅ Matriz de correlación
    ✅ Restricciones físicas
    ✅ Criterios de información (AIC, BIC)
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: LEVENBERG-MARQUARDT (TRF) - VERSIÓN PROFESIONAL")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}
    
    start_time = time.time()
    
    # Escalado de parámetros (MEJORA CRÍTICA)
    if use_parameter_scaling:
        logger.info("🔧 Aplicando escalado de parámetros...")
        scales, offsets, params_names = scale_parameters(params_to_optimize)
        logger.info(f"  ✓ {len(params_names)} parámetros escalados")
    else:
        scales = np.ones(len(params_to_optimize))
        offsets = np.array([p['initial_value'] for p in params_to_optimize])
        params_names = [p['name'] for p in params_to_optimize]
    
    # Valores iniciales en espacio escalado
    initial_values_physical = np.array([p['initial_value'] for p in params_to_optimize])
    initial_values_scaled = scale_to_normalized(initial_values_physical, scales, offsets)
    
    # Bounds en espacio escalado
    bounds_lower_physical = np.array([p['lower_bound'] for p in params_to_optimize])
    bounds_upper_physical = np.array([p['upper_bound'] for p in params_to_optimize])
    
    bounds_lower_scaled = scale_to_normalized(bounds_lower_physical, scales, offsets)
    bounds_upper_scaled = scale_to_normalized(bounds_upper_physical, scales, offsets)
    bounds_scaled = (bounds_lower_scaled, bounds_upper_scaled)
    
    logger.info(f"🔧 Optimizando {len(params_names)} parámetros")
    logger.info(f"  Parámetros: {params_names}")
    logger.info(f"  Ponderación: σ_ψ = {sigma_psi}°, σ_Δ = {sigma_delta}°")
    if use_tikhonov_regularization:
        logger.info(f"  Regularización Tikhonov: λ = {lambda_reg}")
    
    # Pesos espectrales
    spectral_weights = None
    if spectral_focus_regions:
        spectral_weights = calculate_spectral_weights(wavelengths, spectral_focus_regions)
        logger.info(f"  📍 Pesos espectrales: {len(spectral_focus_regions)} regiones enfatizadas")
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
    )
    
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data = len(wavelengths) * 2
    
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        residuals_initial, len(params_names), n_data
    )
    
    logger.info(f"  χ² inicial: {chi_sq_initial:.2f}, χ²ᵣ: {chi_sq_red_initial:.4f}")
    
    iteration_count = [0]
    n_tikhonov_terms = len(params_names) if use_tikhonov_regularization else 0
    
    def objective_function(params_scaled):
        """Función objetivo para Levenberg-Marquardt (retorna residuos ponderados)"""
        iteration_count[0] += 1
        
        # Convertir a espacio físico
        params_physical = unscale_parameters(params_scaled, scales, offsets)
        
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_physical)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en cálculo teórico: {str(e)}")
            return np.ones(n_data + n_tikhonov_terms) * 1e6
        
        # Residuos ponderados
        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
        )
        
        residuals = np.concatenate([residuals_psi, residuals_delta])
        
        # Regularización de Tikhonov (opcional)
        if use_tikhonov_regularization:
            # En espacio escalado, los parámetros iniciales son 0
            residuals_reg = lambda_reg * params_scaled
            residuals = np.concatenate([residuals, residuals_reg])
        
        if iteration_count[0] % 10 == 0:
            chi_sq, chi_sq_red = calculate_chi_squared(residuals[:n_data], len(params_names), n_data)
            logger.info(f"  Iteración {iteration_count[0]}: χ² = {chi_sq:.2f}, χ²ᵣ = {chi_sq_red:.4f}")
        
        return residuals
    
    # OPTIMIZACIÓN CON LEVENBERG-MARQUARDT
    try:
        result = least_squares(
            objective_function,
            x0=initial_values_scaled,
            bounds=bounds_scaled,
            method='trf',
            ftol=ftol,
            xtol=xtol,
            max_nfev=max_iterations,
            verbose=0
        )
        
        optimization_time = time.time() - start_time
        
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} s")
        logger.info(f"  Iteraciones: {result.nfev}, Estado: {result.message}")
        
        # Convertir resultado a espacio físico
        params_optimized_physical = unscale_parameters(result.x, scales, offsets)
        
        # Aplicar restricciones físicas
        params_dict = {params_names[i]: params_optimized_physical[i] for i in range(len(params_names))}
        params_dict_constrained = apply_physical_constraints(params_dict, params_names)
        params_optimized_physical = np.array([params_dict_constrained[name] for name in params_names])
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, params_optimized_physical)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        residuals_psi_final, residuals_delta_final = calculate_weighted_residuals(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
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
        
        # Intervalos de confianza CORRECTOS (con corrección de Tikhonov)
        confidence_intervals = estimate_confidence_intervals(
            result, params_names, n_data,
            use_tikhonov_regularization, n_tikhonov_terms
        )
        
        # Matriz de correlación
        correlation_matrix, high_correlations = calculate_correlation_matrix(
            result, params_names, n_data,
            use_tikhonov_regularization, n_tikhonov_terms
        )
        
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
            'optimized_params': params_dict_constrained,
            'confidence_intervals': confidence_intervals,
            'correlation_matrix': correlation_matrix.tolist(),
            'high_correlations': high_correlations,
            'weighting': {
                'sigma_psi': sigma_psi,
                'sigma_delta': sigma_delta,
                'method': 'statistical_weighting',
                'spectral_focus': spectral_focus_regions is not None
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
    sigma_delta: float = DEFAULT_SIGMA_DELTA,
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None,
    use_parameter_scaling: bool = True
) -> Dict[str, Any]:
    """
    ALGORITMO 2: Simplex (Nelder-Mead)
    VERSIÓN PROFESIONAL con mejoras críticas
    
    Mejoras implementadas:
    ✅ Residuos ponderados estadísticamente
    ✅ Unwrap global de Δ
    ✅ Penalización suave en boundaries
    ✅ Escalado automático de parámetros
    ✅ Pesos espectrales opcionales
    ✅ Criterios de información (AIC, BIC)
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: SIMPLEX (NELDER-MEAD) - VERSIÓN PROFESIONAL")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}
    
    start_time = time.time()
    
    # Escalado de parámetros
    if use_parameter_scaling:
        logger.info("🔧 Aplicando escalado de parámetros...")
        scales, offsets, params_names = scale_parameters(params_to_optimize)
    else:
        scales = np.ones(len(params_to_optimize))
        offsets = np.array([p['initial_value'] for p in params_to_optimize])
        params_names = [p['name'] for p in params_to_optimize]
    
    # Valores iniciales en espacio escalado
    initial_values_physical = np.array([p['initial_value'] for p in params_to_optimize])
    initial_values_scaled = scale_to_normalized(initial_values_physical, scales, offsets)
    
    # Bounds en espacio escalado
    bounds_lower_physical = np.array([p['lower_bound'] for p in params_to_optimize])
    bounds_upper_physical = np.array([p['upper_bound'] for p in params_to_optimize])
    
    bounds_lower_scaled = scale_to_normalized(bounds_lower_physical, scales, offsets)
    bounds_upper_scaled = scale_to_normalized(bounds_upper_physical, scales, offsets)
    
    logger.info(f"🔧 Optimizando {len(params_names)} parámetros")
    logger.info(f"  Parámetros: {params_names}")
    logger.info(f"  Ponderación: σ_ψ = {sigma_psi}°, σ_Δ = {sigma_delta}°")
    logger.info(f"  Iteraciones máximas: {max_iterations}")
    
    # Pesos espectrales
    spectral_weights = None
    if spectral_focus_regions:
        spectral_weights = calculate_spectral_weights(wavelengths, spectral_focus_regions)
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
    )
    
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data = len(wavelengths) * 2
    
    chi_sq_initial, chi_sq_red_initial = calculate_chi_squared(
        residuals_initial, len(params_names), n_data
    )
    
    logger.info(f"  χ² inicial: {chi_sq_initial:.2f}, χ²ᵣ: {chi_sq_red_initial:.4f}")
    
    iteration_count = [0]
    
    def objective_function(params_scaled):
        """Función objetivo para Simplex (retorna χ² ponderado)"""
        iteration_count[0] += 1
        
        # Penalización SUAVE por salir de bounds (en espacio escalado)
        penalty = 0.0
        for i in range(len(params_scaled)):
            if params_scaled[i] < bounds_lower_scaled[i]:
                penalty += (bounds_lower_scaled[i] - params_scaled[i])**2
            elif params_scaled[i] > bounds_upper_scaled[i]:
                penalty += (params_scaled[i] - bounds_upper_scaled[i])**2
        
        if penalty > 0:
            return chi_sq_initial + 1e6 * penalty
        
        # Convertir a espacio físico
        params_physical = unscale_parameters(params_scaled, scales, offsets)
        
        updated_model = update_model_with_params(optical_model, params_to_optimize, params_physical)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en cálculo teórico: {str(e)}")
            return chi_sq_initial * 1e3
        
        # Residuos ponderados
        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
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
            x0=initial_values_scaled,
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
        
        # Convertir resultado a espacio físico
        params_optimized_physical = unscale_parameters(result.x, scales, offsets)
        
        # Aplicar restricciones físicas
        params_dict = {params_names[i]: params_optimized_physical[i] for i in range(len(params_names))}
        params_dict_constrained = apply_physical_constraints(params_dict, params_names)
        params_optimized_physical = np.array([params_dict_constrained[name] for name in params_names])
        
        # Calcular métricas finales
        updated_model_final = update_model_with_params(optical_model, params_to_optimize, params_optimized_physical)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        residuals_psi_final, residuals_delta_final = calculate_weighted_residuals(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
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
            'optimized_params': params_dict_constrained,
            'confidence_intervals': None,  # Simplex no calcula incertidumbre
            'weighting': {
                'sigma_psi': sigma_psi,
                'sigma_delta': sigma_delta,
                'method': 'statistical_weighting',
                'spectral_focus': spectral_focus_regions is not None
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
# ESTRATEGIA 3: MULTISTART (SIMPLEX → LM)
# ========================================

def optimize_multistart(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    n_starts: int = 3,
    max_iterations_simplex: int = 300,
    max_iterations_lm: int = 200,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA,
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None
) -> Dict[str, Any]:
    """
    ESTRATEGIA MULTISTART: Simplex → Levenberg-Marquardt
    
    Combina robustez de Simplex con precisión de LM:
    1. Ejecuta Simplex desde múltiples puntos iniciales
    2. Selecciona el mejor resultado
    3. Refina con Levenberg-Marquardt
    
    Esta estrategia es SUPERIOR a usar solo LM o solo Simplex
    
    Args:
        n_starts: Número de inicios aleatorios para Simplex
    """
    
    logger.info("=" * 60)
    logger.info(f"ESTRATEGIA MULTISTART: {n_starts} × SIMPLEX → LM")
    logger.info("=" * 60)
    
    start_time_total = time.time()
    
    # FASE 1: Múltiples corridas de Simplex
    logger.info(f"🔍 FASE 1: Exploración global con {n_starts} inicios de Simplex")
    
    best_simplex_result = None
    best_chi_squared = float('inf')
    
    for i in range(n_starts):
        logger.info(f"  Inicio {i+1}/{n_starts}")
        
        # Generar punto inicial aleatorio (dentro de bounds)
        if i == 0:
            # Primer inicio = valores proporcionados por usuario
            params_start = params_to_optimize
        else:
            # Inicios aleatorios
            params_start = []
            for param in params_to_optimize:
                random_value = np.random.uniform(param['lower_bound'], param['upper_bound'])
                params_start.append({
                    **param,
                    'initial_value': random_value
                })
        
        # Ejecutar Simplex
        result_simplex = optimize_simplex(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_start, calculate_theoretical_func,
            max_iterations=max_iterations_simplex,
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta,
            spectral_focus_regions=spectral_focus_regions,
            use_parameter_scaling=True
        )
        
        if result_simplex['success']:
            chi_sq = result_simplex['final_metrics']['chi_squared']
            logger.info(f"    ✓ Simplex {i+1}: χ² = {chi_sq:.2f}")
            
            if chi_sq < best_chi_squared:
                best_chi_squared = chi_sq
                best_simplex_result = result_simplex
        else:
            logger.warning(f"    ✗ Simplex {i+1} falló")
    
    if best_simplex_result is None:
        logger.error("❌ Todos los inicios de Simplex fallaron")
        return {
            'success': False,
            'algorithm': 'multistart',
            'error': 'Todos los inicios de Simplex fallaron'
        }
    
    logger.info(f"  🏆 Mejor Simplex: χ² = {best_chi_squared:.2f}")
    
    # FASE 2: Refinamiento con Levenberg-Marquardt
    logger.info(f"🎯 FASE 2: Refinamiento con Levenberg-Marquardt")
    
    # Usar parámetros optimizados de Simplex como punto inicial para LM
    params_for_lm = []
    for param in params_to_optimize:
        param_name = param['name']
        optimized_value = best_simplex_result['optimized_params'][param_name]
        
        params_for_lm.append({
            **param,
            'initial_value': optimized_value
        })
    
    result_lm = optimize_levenberg_marquardt(
        psi_exp, delta_exp, wavelengths,
        optical_model, params_for_lm, calculate_theoretical_func,
        max_iterations=max_iterations_lm,
        sigma_psi=sigma_psi,
        sigma_delta=sigma_delta,
        spectral_focus_regions=spectral_focus_regions,
        use_parameter_scaling=True
    )
    
    total_time = time.time() - start_time_total
    
    if result_lm['success']:
        logger.info(f"✅ MULTISTART completado en {total_time:.2f} s")
        logger.info(f"  Simplex → χ² = {best_chi_squared:.2f}")
        logger.info(f"  LM      → χ² = {result_lm['final_metrics']['chi_squared']:.2f}")
        
        # Agregar información de multistart al resultado
        result_lm['algorithm'] = 'multistart'
        result_lm['multistart_details'] = {
            'n_starts': n_starts,
            'simplex_chi_squared': best_chi_squared,
            'lm_chi_squared': result_lm['final_metrics']['chi_squared'],
            'total_time': total_time
        }
        
        return result_lm
    else:
        logger.warning("⚠️ LM falló después de Simplex, retornando resultado de Simplex")
        best_simplex_result['algorithm'] = 'multistart_simplex_only'
        return best_simplex_result


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
    lambda_reg: float = 1e-4,
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None,
    use_multistart: bool = False,
    n_multistart: int = 3
) -> Dict[str, Any]:
    """
    Función principal de optimización (router de algoritmos)
    VERSIÓN PROFESIONAL con todas las mejoras implementadas
    
    Args:
        algorithm: Algoritmo base:
            - 'levenberg_marquardt': Trust Region Reflective (DEFAULT)
            - 'simplex': Nelder-Mead
        strategy: IGNORADO (siempre simultánea)
        max_iterations: Iteraciones máximas
        sigma_psi: Incertidumbre experimental en ψ (None = usar default 0.01)
        sigma_delta: Incertidumbre experimental en Δ (None = usar default 0.1)
        use_tikhonov_regularization: Activar regularización (solo LM)
        lambda_reg: Factor de regularización
        spectral_focus_regions: Lista de tuplas (λ_min, λ_max) para enfatizar
        use_multistart: Si True, usa estrategia Multistart (Simplex → LM)
        n_multistart: Número de inicios aleatorios para Multistart
    
    Returns:
        Dict con resultados de optimización mejorados
    """
    
    # Valores por defecto de incertidumbres
    if sigma_psi is None:
        sigma_psi = DEFAULT_SIGMA_PSI
    if sigma_delta is None:
        sigma_delta = DEFAULT_SIGMA_DELTA
    
    logger.info(f"\n{'=' * 60}")
    logger.info(f"INICIANDO OPTIMIZACIÓN PROFESIONAL")
    logger.info(f"Parámetros a optimizar: {len(params_to_optimize)}")
    logger.info(f"Ponderación estadística: σ_ψ={sigma_psi}°, σ_Δ={sigma_delta}°")
    
    if spectral_focus_regions:
        logger.info(f"Pesos espectrales: {len(spectral_focus_regions)} regiones enfocadas")
    
    if use_multistart:
        logger.info(f"Estrategia: MULTISTART ({n_multistart} inicios)")
    else:
        logger.info(f"Algoritmo: {algorithm.upper()}")
    
    logger.info(f"{'=' * 60}\n")
    
    # Ajustar max_iterations según algoritmo
    if algorithm == 'simplex' and max_iterations < 500:
        max_iterations = 500
        logger.info(f"⚙️ Ajustando max_iterations a {max_iterations} para Simplex")
    
    # Ejecutar estrategia seleccionada
    if use_multistart:
        result = optimize_multistart(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize,
            calculate_theoretical_func,
            n_starts=n_multistart,
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta,
            spectral_focus_regions=spectral_focus_regions
        )
    elif algorithm == 'levenberg_marquardt':
        result = optimize_levenberg_marquardt(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize,
            calculate_theoretical_func,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta,
            use_tikhonov_regularization=use_tikhonov_regularization,
            lambda_reg=lambda_reg,
            spectral_focus_regions=spectral_focus_regions,
            use_parameter_scaling=True
        )
    else:  # simplex
        result = optimize_simplex(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize,
            calculate_theoretical_func,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta,
            spectral_focus_regions=spectral_focus_regions,
            use_parameter_scaling=True
        )
    
    # Agregar campo de estrategia
    if result.get('success'):
        result['strategy'] = 'simultaneous'
    
    return result