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

DEFAULT_SIGMA_PSI   = 1   # ±1 en ψ
DEFAULT_SIGMA_DELTA = 1    # ±1  en Δ


# ============================================================================
# FUNCIÓN AUXILIAR: CONVERSIÓN Ψ,Δ → N,C,S (CompleteEASE)
# ============================================================================

def psi_delta_to_ncs(psi_deg: np.ndarray, delta_deg: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Convierte Ψ y Δ (en grados) a coordenadas N, C, S según CompleteEASE
    
    Esta transformación es fundamental porque:
    - N, C, S están siempre acotadas en [-1, 1]
    - El elipsómetro mide N,C,S con aproximadamente la misma precisión
    - Evita problemas numéricos con la periodicidad de Δ
    
    Fórmulas (CompleteEASE Manual, eq. 2-2):
        N = cos(2Ψ)
        C = sin(2Ψ)cos(Δ)
        S = sin(2Ψ)sin(Δ)
    
    Args:
        psi_deg: Array de Ψ en grados
        delta_deg: Array de Δ en grados
    
    Returns:
        (N, C, S) como arrays de numpy
    
    Referencias:
        J.A. Woollam Co., CompleteEASE Data Analysis Manual, v6.56, 2022.
    """
    psi_rad   = np.deg2rad(psi_deg)
    delta_rad = np.deg2rad(delta_deg)
    
    N = np.cos(2 * psi_rad)
    C = np.sin(2 * psi_rad) * np.cos(delta_rad)
    S = np.sin(2 * psi_rad) * np.sin(delta_rad)
    
    return N, C, S


# ============================================================================
# FUNCIONES DE CÁLCULO DE MÉTRICAS
# ============================================================================

def calculate_all_metrics(
    psi_exp: np.ndarray,
    psi_theo: np.ndarray,
    delta_exp: np.ndarray,
    delta_theo: np.ndarray,
    n_params: int,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA
) -> Dict[str, Any]:
    """
    Calcula TODAS las métricas de ajuste.
    
    Implementa métricas duales:
    1. MSE de CompleteEASE (N, C, S) - MÉTRICA PRINCIPAL para comparar guesses
    2. χ² estadístico (Ψ, Δ ponderados por σ) - MÉTRICA SECUNDARIA para reporte

    NOMENCLATURA:
    - 'chi_squared'         → χ² estadístico real  (Ψ,Δ ponderados, Fujiwara Eq. 5.60)
    - 'chi_squared_reduced' → χ²_red estadístico real
    - 'chi_squared_ncs'     → suma cruda (ΔN²+ΔC²+ΔS²), usada internamente para MSE

    Args:
        psi_exp, psi_theo: Arrays de Ψ experimental y teórico [grados]
        delta_exp, delta_theo: Arrays de Δ experimental y teórico [grados]
        n_params: Número de parámetros optimizados
        sigma_psi: Incertidumbre experimental en Ψ [grados] (default 0.05°)
        sigma_delta: Incertidumbre experimental en Δ [grados] (default 0.5°)
    
    Returns:
        Dict con todas las métricas calculadas.
        
    Referencias:
        J.A. Woollam Co., CompleteEASE Data Analysis Manual, v6.56, 2022, eq. (2-2)
        Fujiwara, H. (2007). Spectroscopic Ellipsometry. Eq. 5.60.
    """
    n_wavelengths = len(psi_exp)
    
    # === MÉTODO 1: MSE DE COMPLETEEASE (N, C, S) - PRINCIPAL ===
    N_exp,  C_exp,  S_exp  = psi_delta_to_ncs(psi_exp,  delta_exp)
    N_theo, C_theo, S_theo = psi_delta_to_ncs(psi_theo, delta_theo)
    
    sum_squared_ncs = float(np.sum(
        (N_exp - N_theo)**2 +
        (C_exp - C_theo)**2 +
        (S_exp - S_theo)**2
    ))
    
    dof_completeease = max(1, 3 * n_wavelengths - n_params)
    mse_completeease = np.sqrt(sum_squared_ncs / dof_completeease) * 1000

    # Suma NCS normalizada (para referencia interna, NO es el χ² estadístico)
    chi_squared_ncs         = sum_squared_ncs
    chi_squared_reduced_ncs = sum_squared_ncs / dof_completeease
    
    if mse_completeease < 5:
        quality = 'EXCELENTE'
    elif mse_completeease < 20:
        quality = 'BUENO'
    elif mse_completeease < 50:
        quality = 'ACEPTABLE'
    else:
        quality = 'POBRE'
    
    # === MÉTODO 2: χ² ESTADÍSTICO (Ψ, Δ ponderados) - SECUNDARIO ===
    # Fujiwara Eq. 5.60: σ_Ψ = 0.05°, σ_Δ = 0.5°
    residuals_psi_weighted   = (psi_exp   - psi_theo)   / sigma_psi
    residuals_delta_weighted = (delta_exp - delta_theo) / sigma_delta
    
    chi_squared_statistical = float(
        np.sum(residuals_psi_weighted**2) +
        np.sum(residuals_delta_weighted**2)
    )
    
    dof_statistical = max(1, 2 * n_wavelengths - n_params)
    chi_squared_reduced_statistical = chi_squared_statistical / dof_statistical
    
    # === MÉTODO 3: RMSE SIMPLE ===
    rmse_psi   = float(np.sqrt(np.mean((psi_exp   - psi_theo)**2)))
    rmse_delta = float(np.sqrt(np.mean((delta_exp - delta_theo)**2)))
    
    # === MÉTODO 4: R² ===
    ss_res_psi = np.sum((psi_exp - psi_theo)**2)
    ss_tot_psi = np.sum((psi_exp - np.mean(psi_exp))**2)
    r2_psi = 1 - (ss_res_psi / ss_tot_psi) if ss_tot_psi > 0 else 0.0
    
    ss_res_delta = np.sum((delta_exp - delta_theo)**2)
    ss_tot_delta = np.sum((delta_exp - np.mean(delta_exp))**2)
    r2_delta = 1 - (ss_res_delta / ss_tot_delta) if ss_tot_delta > 0 else 0.0
    
    return {
        # MÉTRICAS PRINCIPALES (COMPLETEEASE)
        'mse':     float(mse_completeease),
        'quality': quality,

        # Suma cruda NCS — usada internamente para MSE, NO confundir con χ² estadístico
        'chi_squared_ncs':         float(chi_squared_ncs),
        'chi_squared_reduced_ncs': float(chi_squared_reduced_ncs),

        # χ² ESTADÍSTICO REAL (Ψ,Δ ponderados por σ_Ψ=0.05°, σ_Δ=0.5°)
        # Esta es la métrica correcta para reportar como "chi cuadrado"
        'chi_squared':         float(chi_squared_statistical),
        'chi_squared_reduced': float(chi_squared_reduced_statistical),
        
        # MÉTRICAS POR COMPONENTE
        'psi_metrics': {
            'rmse':      float(rmse_psi),
            'r_squared': float(r2_psi),
            'max_error': float(np.max(np.abs(psi_exp - psi_theo)))
        },
        'delta_metrics': {
            'rmse':      float(rmse_delta),
            'r_squared': float(r2_delta),
            'max_error': float(np.max(np.abs(delta_exp - delta_theo)))
        },
        
        # INFORMACIÓN
        'n_wavelengths': n_wavelengths,
        'n_params':      n_params,
        'sigma_psi':     sigma_psi,
        'sigma_delta':   sigma_delta,
        'method_info': {
            'completeease': f'MSE basado en N,C,S (3n-m={dof_completeease} dof)',
            'statistical':  f'χ² basado en Ψ,Δ ponderados (2n-m={dof_statistical} dof)'
        }
    }


# ========================================
# FUNCIONES AUXILIARES
# ========================================

def unwrap_delta_global(delta: np.ndarray) -> np.ndarray:
    """
    Unwrap global de delta usando np.unwrap (maneja discontinuidades de 360°)
    
    CRÍTICO: Previene saltos artificiales en resonancias
    """
    delta_rad = np.deg2rad(delta)
    delta_unwrapped_rad = np.unwrap(delta_rad)
    return np.rad2deg(delta_unwrapped_rad)


def calculate_spectral_weights(wavelengths: np.ndarray, 
                               focus_regions: Optional[List[Tuple[float, float]]] = None,
                               focus_weight: float = 2.0) -> np.ndarray:
    """Calcula pesos espectrales para enfatizar regiones específicas"""
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
    """
    scales  = []
    offsets = []
    names   = []
    
    for param in params_to_optimize:
        initial = param['initial_value']
        lower   = param['lower_bound']
        upper   = param['upper_bound']
        
        scale  = (upper - lower) / 2.0
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
    Aplica restricciones físicas a parámetros optimizados.
    
    Evita soluciones no físicas como:
    - Fuerzas de oscilador negativas
    - Dampings negativos
    - Fracciones volumétricas fuera de [0,1]
    """
    constrained = params.copy()
    
    for name in param_names:
        value = params[name]
        
        if name.endswith('_fraction'):
            constrained[name] = max(0.0, min(1.0, value))
            if value != constrained[name]:
                logger.debug(f"  {name}: {value:.4f} → {constrained[name]:.4f} (limitado a [0,1])")
        elif name.startswith('f') and not name.startswith('file'):
            constrained[name] = max(0.0, value)
        elif 'gamma' in name.lower() or 'Gamma' in name:
            constrained[name] = max(1e-6, value)
        elif 'eps_inf' in name:
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
    Calcula residuos ponderados estadísticamente.
    
    Residuo ponderado: r_i = w_i * (y_exp - y_theo) / σ_i
    """
    residuals_psi = psi_exp - psi_theo
    residuals_psi_weighted = residuals_psi / sigma_psi
    
    if use_global_unwrap:
        delta_exp_unwrapped  = unwrap_delta_global(delta_exp)
        delta_theo_unwrapped = unwrap_delta_global(delta_theo)
        residuals_delta = delta_exp_unwrapped - delta_theo_unwrapped
    else:
        residuals_delta = delta_exp - delta_theo
        residuals_delta = np.where(residuals_delta >  180, residuals_delta - 360, residuals_delta)
        residuals_delta = np.where(residuals_delta < -180, residuals_delta + 360, residuals_delta)
    
    residuals_delta_weighted = residuals_delta / sigma_delta
    
    if spectral_weights is not None:
        residuals_psi_weighted   *= spectral_weights
        residuals_delta_weighted *= spectral_weights
    
    return residuals_psi_weighted, residuals_delta_weighted


def calculate_chi_squared(
    residuals_weighted: np.ndarray,
    n_params: int,
    n_data: int
) -> Tuple[float, float]:
    """Calcula chi-cuadrado y chi-cuadrado reducido"""
    chi_squared = float(np.sum(residuals_weighted**2))
    degrees_of_freedom = n_data - n_params
    
    if degrees_of_freedom <= 0:
        logger.warning(f"⚠️ Grados de libertad no positivos: {degrees_of_freedom}")
        chi_squared_reduced = chi_squared
    else:
        chi_squared_reduced = chi_squared / degrees_of_freedom
    
    return chi_squared, chi_squared_reduced


def calculate_rmse(experimental: np.ndarray, theoretical: np.ndarray) -> float:
    """Calcula Root Mean Square Error"""
    return float(np.sqrt(np.mean((experimental - theoretical)**2)))


def calculate_r_squared(experimental: np.ndarray, theoretical: np.ndarray) -> float:
    """Calcula coeficiente de determinación R²"""
    ss_res = np.sum((experimental - theoretical)**2)
    ss_tot = np.sum((experimental - np.mean(experimental))**2)
    
    if ss_tot == 0:
        return 0.0
    return float(1 - (ss_res / ss_tot))


def estimate_confidence_intervals(
    result,
    params_names: List[str],
    n_data: int,
    use_tikhonov: bool = False,
    n_tikhonov_terms: int = 0
) -> Dict[str, Tuple[float, float]]:
    """
    Estima intervalos de confianza (±σ) para cada parámetro.
    SOLO PARA LEVENBERG-MARQUARDT (usa Jacobiano).
    
    Cov = σ² (J^T J)^(-1)
    donde σ² = Σ(residuals²) / (N_data - N_params)
    """
    try:
        J         = result.jac
        residuals = result.fun
        n_params  = len(result.x)
        
        if use_tikhonov and n_tikhonov_terms > 0:
            J_physical         = J[:n_data, :]
            residuals_physical = residuals[:n_data]
        else:
            J_physical         = J
            residuals_physical = residuals
        
        ndof         = max(1, n_data - n_params)
        sigma_squared = np.sum(residuals_physical**2) / ndof
        
        try:
            cov = sigma_squared * np.linalg.inv(J_physical.T @ J_physical)
        except LinAlgError:
            logger.warning("⚠️ Matriz singular, usando pseudo-inversa")
            cov = sigma_squared * np.linalg.pinv(J_physical.T @ J_physical)
        
        perr = np.sqrt(np.abs(np.diag(cov)))
        
        confidence_intervals = {}
        for i, name in enumerate(params_names):
            confidence_intervals[name] = (float(result.x[i]), float(perr[i]))
        
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
    Calcula matriz de correlación entre parámetros.
    Detecta parámetros altamente correlacionados (|ρ| > 0.95).
    """
    try:
        J        = result.jac
        n_params = len(result.x)
        
        if use_tikhonov and n_tikhonov_terms > 0:
            J_physical         = J[:n_data, :]
            residuals_physical = result.fun[:n_data]
        else:
            J_physical         = J
            residuals_physical = result.fun
        
        ndof          = max(1, n_data - n_params)
        sigma_squared = np.sum(residuals_physical**2) / ndof
        
        try:
            cov = sigma_squared * np.linalg.inv(J_physical.T @ J_physical)
        except LinAlgError:
            cov = sigma_squared * np.linalg.pinv(J_physical.T @ J_physical)
        
        std_devs           = np.sqrt(np.abs(np.diag(cov)))
        correlation_matrix = np.zeros((n_params, n_params))
        
        for i in range(n_params):
            for j in range(n_params):
                if std_devs[i] > 0 and std_devs[j] > 0:
                    correlation_matrix[i, j] = cov[i, j] / (std_devs[i] * std_devs[j])
                else:
                    correlation_matrix[i, j] = 0.0
        
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
    """Calcula criterios de información (AIC, BIC)"""
    if chi_squared <= 0 or n_data <= 0:
        return {'aic': float('inf'), 'bic': float('inf')}
    
    log_likelihood = -0.5 * chi_squared
    aic = 2 * n_params - 2 * log_likelihood
    bic = n_params * np.log(n_data) - 2 * log_likelihood
    
    return {'aic': float(aic), 'bic': float(bic)}


# ==========================================
# APLICAR PARÁMETROS OPTIMIZADOS AL MODELO
# ==========================================

def apply_optimized_params_to_model(params_dict, optical_model, param_definitions):
    """
    Aplica parámetros optimizados al modelo óptico usando los 'path' definidos.
    Soporte completo para fracciones volumétricas EMT.
    """
    for param_def in param_definitions:
        param_name  = param_def['name']
        param_value = params_dict.get(param_name)
        
        if param_value is None:
            continue
        
        path = param_def.get('path', [])
        
        if not path:
            logger.warning(f"⚠️ Parámetro {param_name} sin path definido")
            continue
        
        current = optical_model
        
        for key in path[:-1]:
            if isinstance(current, dict):
                if key not in current:
                    if isinstance(path[-1], str):
                        current[key] = {}
                    else:
                        current[key] = []
                current = current[key]
            elif isinstance(current, list):
                if not isinstance(key, int) or key >= len(current):
                    logger.warning(f"⚠️ Índice {key} fuera de rango para {param_name}")
                    break
                current = current[key]
            else:
                logger.warning(f"⚠️ Tipo inesperado en path para {param_name}")
                break
        else:
            last_key = path[-1]
            if isinstance(current, dict):
                current[last_key] = param_value
                logger.debug(f"✅ {param_name} = {param_value:.6f} aplicado en {path}")
            elif isinstance(current, list):
                if isinstance(last_key, int) and last_key < len(current):
                    current[last_key] = param_value
                    logger.debug(f"✅ {param_name} = {param_value:.6f} aplicado en {path}")
    
    return optical_model


# ==========================================
# FUNCIONES EMT (FRACCIONES VOLUMÉTRICAS)
# ==========================================

def validate_fraction_constraint(params_dict, fraction_groups):
    """Valida que la suma de fracciones volumétricas sea ≈ 1.0 para cada grupo"""
    violations = {}
    
    for group_key, param_names in fraction_groups.items():
        group_sum = sum(params_dict.get(p, 0.0) for p in param_names)
        if abs(group_sum - 1.0) > 0.01:
            violations[group_key] = group_sum
    
    return len(violations) == 0, violations


def calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0):
    """Calcula penalización por violar restricción suma=1 en fracciones"""
    penalty = 0.0
    for group_key, param_names in fraction_groups.items():
        group_sum = sum(params_dict.get(p, 0.0) for p in param_names)
        penalty += penalty_factor * (group_sum - 1.0)**2
    return penalty


# ========================================
# FUNCIÓN DE ACTUALIZACIÓN DE MODELO (COMPATIBILIDAD)
# ========================================

def update_model_with_params(
    optical_model: Dict,
    params_to_optimize: List[Dict],
    params_vector: np.ndarray
) -> Dict:
    """
    Actualiza el modelo óptico con nuevos valores de parámetros.
    (Mantenida por compatibilidad con código anterior)
    """
    params_dict = {}
    for i, param_info in enumerate(params_to_optimize):
        params_dict[param_info['name']] = float(params_vector[i])
    
    updated_model = copy.deepcopy(optical_model)
    return apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)


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
    use_parameter_scaling: bool = True,
    fraction_groups: Optional[Dict[str, List[str]]] = None
) -> Dict[str, Any]:
    logger.info("=" * 60)
    logger.info("ALGORITMO: LEVENBERG-MARQUARDT (TRF) v5.1")
    logger.info("=" * 60)

    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}

    start_time = time.time()

    if fraction_groups:
        logger.info(f"🧪 Restricciones EMT activas: {len(fraction_groups)} grupos")

    if use_parameter_scaling:
        scales, offsets, params_names = scale_parameters(params_to_optimize)
    else:
        scales       = np.ones(len(params_to_optimize))
        offsets      = np.array([p['initial_value'] for p in params_to_optimize])
        params_names = [p['name'] for p in params_to_optimize]

    initial_values_physical = np.array([p['initial_value'] for p in params_to_optimize])
    initial_values_scaled   = scale_to_normalized(initial_values_physical, scales, offsets)

    bounds_lower_physical = np.array([p['lower_bound'] for p in params_to_optimize])
    bounds_upper_physical = np.array([p['upper_bound'] for p in params_to_optimize])
    bounds_lower_scaled   = scale_to_normalized(bounds_lower_physical, scales, offsets)
    bounds_upper_scaled   = scale_to_normalized(bounds_upper_physical, scales, offsets)
    bounds_scaled         = (bounds_lower_scaled, bounds_upper_scaled)

    logger.info(f"🔧 Optimizando {len(params_names)} parámetros: {params_names}")
    logger.info(f"  σ_ψ = {sigma_psi}°, σ_Δ = {sigma_delta}°")
    if use_tikhonov_regularization:
        logger.info(f"  Regularización Tikhonov: λ = {lambda_reg}")

    spectral_weights = None
    if spectral_focus_regions:
        spectral_weights = calculate_spectral_weights(wavelengths, spectral_focus_regions)

    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    metrics_initial = calculate_all_metrics(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
    )

    logger.info(f"  MSE inicial: {metrics_initial['mse']:.2f} [{metrics_initial['quality']}]")

    n_data           = len(wavelengths) * 2
    iteration_count  = [0]
    n_tikhonov_terms = len(params_names) if use_tikhonov_regularization else 0

    best_partial = {
        'params_scaled': initial_values_scaled.copy(),
        'cost': float('inf')
    }

    def objective_function(params_scaled):
        iteration_count[0] += 1

        params_physical = unscale_parameters(params_scaled, scales, offsets)
        params_dict = {params_names[i]: params_physical[i] for i in range(len(params_names))}

        updated_model = copy.deepcopy(optical_model)
        updated_model = apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)

        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en cálculo teórico: {str(e)}")
            return np.ones(n_data + n_tikhonov_terms) * 1e6

        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
        )

        residuals = np.concatenate([residuals_psi, residuals_delta])

        if fraction_groups:
            penalty = calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0)
            if penalty > 1e-6:
                residuals = np.concatenate([residuals, [np.sqrt(penalty)]])

        if use_tikhonov_regularization:
            residuals_reg = lambda_reg * params_scaled
            residuals = np.concatenate([residuals, residuals_reg])

        current_cost = float(np.sum(residuals**2))
        if current_cost < best_partial['cost']:
            best_partial['cost'] = current_cost
            best_partial['params_scaled'] = params_scaled.copy()

        if iteration_count[0] % 10 == 0:
            metrics_iter = calculate_all_metrics(
                psi_exp, psi_theo, delta_exp, delta_theo,
                n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
            )
            logger.info(f"  Iter {iteration_count[0]}: MSE = {metrics_iter['mse']:.2f}")

            # ⭐ ACTUALIZAR ESTADO GLOBAL EN TIEMPO REAL
            try:
                import main as main_module
                state = main_module.current_optimization_state
                if state.is_cancelled:
                    raise StopIteration("Optimización cancelada por usuario")
                state.current_iteration = iteration_count[0]
                state.current_mse       = metrics_iter['mse']
                state.status_message    = (
                    f"Iter {iteration_count[0]} — MSE: {metrics_iter['mse']:.2f} "
                    f"[{metrics_iter['quality']}]"
                )
            except StopIteration:
                raise
            except Exception:
                pass  # No interrumpir optimización si falla el update de estado

        return residuals

    try:
        n_params_actual   = len(params_names)
        max_nfev_adjusted = max(max_iterations, n_params_actual * 200)
        logger.info(f"  max_nfev ajustado: {max_nfev_adjusted} ({n_params_actual} params × 200)")

        result = least_squares(
            objective_function,
            x0=initial_values_scaled,
            bounds=bounds_scaled,
            method='trf',
            ftol=ftol,
            xtol=xtol,
            max_nfev=max_nfev_adjusted,
            verbose=0
        )

        if not result.success:
            logger.warning(
                f"⚠️ LM no convergió formalmente ({max_nfev_adjusted} eval). "
                f"Usando mejor punto parcial encontrado. Msg: {result.message}"
            )
            if best_partial['cost'] < float(np.sum(result.fun**2)):
                result = type(result)(
                    x=best_partial['params_scaled'],
                    cost=best_partial['cost'] / 2,
                    fun=result.fun,
                    jac=result.jac,
                    grad=result.grad,
                    optimality=result.optimality,
                    active_mask=result.active_mask,
                    nfev=result.nfev,
                    njev=result.njev,
                    status=result.status,
                    message=result.message,
                    success=True
                )
            else:
                result.success = True

        optimization_time = time.time() - start_time

        params_optimized_physical = unscale_parameters(result.x, scales, offsets)
        params_dict = {params_names[i]: params_optimized_physical[i] for i in range(len(params_names))}
        params_dict_constrained = apply_physical_constraints(params_dict, params_names)

        if fraction_groups:
            valid, violations = validate_fraction_constraint(params_dict_constrained, fraction_groups)
            if not valid:
                for group, suma in violations.items():
                    logger.warning(f"  ⚠️ {group}: suma = {suma:.6f}")

        updated_model_final = copy.deepcopy(optical_model)
        updated_model_final = apply_optimized_params_to_model(
            params_dict_constrained, updated_model_final, params_to_optimize
        )
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)

        metrics_final = calculate_all_metrics(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
        )

        confidence_intervals = estimate_confidence_intervals(
            result, params_names, n_data, use_tikhonov_regularization, n_tikhonov_terms
        )

        correlation_matrix, high_correlations = calculate_correlation_matrix(
            result, params_names, n_data, use_tikhonov_regularization, n_tikhonov_terms
        )

        info_criteria = calculate_information_criteria(
            metrics_final['chi_squared'], len(params_names), n_data
        )

        improvement_mse = (
            (metrics_initial['mse'] - metrics_final['mse']) /
            metrics_initial['mse'] * 100
        ) if metrics_initial['mse'] > 0 else 0

        logger.info(
            f"✅ MSE: {metrics_initial['mse']:.2f} → {metrics_final['mse']:.2f} "
            f"({improvement_mse:.1f}%) en {optimization_time:.2f}s"
        )

        return {
            'success':                True,
            'algorithm':              'levenberg_marquardt',
            'message':                result.message,
            'iterations':             result.nfev,
            'optimization_time':      optimization_time,
            'improvement_percentage': float(improvement_mse),
            'optimized_params':       params_dict_constrained,
            'params_to_optimize':     params_to_optimize,
            'confidence_intervals':   confidence_intervals,
            'correlation_matrix':     correlation_matrix.tolist(),
            'high_correlations':      high_correlations,
            'weighting': {
                'sigma_psi':      sigma_psi,
                'sigma_delta':    sigma_delta,
                'method':         'statistical_weighting',
                'spectral_focus': spectral_focus_regions is not None
            },
            'initial_metrics':   metrics_initial,
            'final_metrics':     metrics_final,
            'improvement':       {'mse_percent': float(improvement_mse)},
            'psi_theoretical':   psi_theo_final.tolist(),
            'delta_theoretical': delta_theo_final.tolist(),
            'optimized_model':   updated_model_final
        }

    except StopIteration as e:
        logger.warning(f"⚠️ Optimización LM cancelada: {str(e)}")
        optimization_time = time.time() - start_time

        params_best_physical = unscale_parameters(best_partial['params_scaled'], scales, offsets)
        params_dict_best     = {params_names[i]: params_best_physical[i] for i in range(len(params_names))}
        params_dict_best     = apply_physical_constraints(params_dict_best, params_names)

        updated_model_best = copy.deepcopy(optical_model)
        updated_model_best = apply_optimized_params_to_model(
            params_dict_best, updated_model_best, params_to_optimize
        )
        psi_best, delta_best = calculate_theoretical_func(updated_model_best, wavelengths)
        metrics_best = calculate_all_metrics(
            psi_exp, psi_best, delta_exp, delta_best,
            n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
        )

        return {
            'success':                True,
            'algorithm':              'levenberg_marquardt',
            'message':                'Cancelado por usuario — mejor resultado parcial',
            'cancelled':              True,
            'iterations':             iteration_count[0],
            'optimization_time':      optimization_time,
            'improvement_percentage': float(
                (metrics_initial['mse'] - metrics_best['mse']) /
                metrics_initial['mse'] * 100
            ) if metrics_initial['mse'] > 0 else 0,
            'optimized_params':       params_dict_best,
            'params_to_optimize':     params_to_optimize,
            'confidence_intervals':   None,
            'correlation_matrix':     [],
            'high_correlations':      [],
            'weighting': {
                'sigma_psi':   sigma_psi,
                'sigma_delta': sigma_delta,
                'method':      'statistical_weighting',
            },
            'initial_metrics':   metrics_initial,
            'final_metrics':     metrics_best,
            'improvement':       {'mse_percent': 0.0},
            'psi_theoretical':   psi_best.tolist(),
            'delta_theoretical': delta_best.tolist(),
            'optimized_model':   updated_model_best
        }

    except Exception as e:
        logger.error(f"❌ Error en Levenberg-Marquardt: {str(e)}", exc_info=True)
        return {
            'success':   False,
            'algorithm': 'levenberg_marquardt',
            'message':   f'Error: {str(e)}',
            'error':     str(e)
        }


def estimate_confidence_intervals_simplex(
    params_optimized: np.ndarray,
    objective_func,
    params_names: List[str],
    n_data: int,
    chi_sq_optimal: float
) -> Dict[str, Tuple[float, float]]:
    """
    Estima incertidumbres para Simplex usando aproximación numérica del Hessiano.
    
    Método: Diferencias finitas centradas para construir el Hessiano H,
    luego Cov ≈ 2 * chi_sq / (n_data - n_params) * H^{-1}
    
    Referencias:
        Press et al., Numerical Recipes (2007), §15.5
    """
    n_params = len(params_optimized)
    H = np.zeros((n_params, n_params))
    
    # Paso de diferencia finita: 1% del valor o mínimo 1e-6
    h = np.array([
        max(abs(p) * 0.01, 1e-6) for p in params_optimized
    ])
    
    # Diagonal del Hessiano (segundas derivadas)
    f0 = objective_func(params_optimized)
    for i in range(n_params):
        ei = np.zeros(n_params)
        ei[i] = h[i]
        fp = objective_func(params_optimized + ei)
        fm = objective_func(params_optimized - ei)
        H[i, i] = (fp - 2*f0 + fm) / h[i]**2
    
    # Términos cruzados
    for i in range(n_params):
        for j in range(i+1, n_params):
            ei = np.zeros(n_params)
            ej = np.zeros(n_params)
            ei[i] = h[i]
            ej[j] = h[j]
            fpp = objective_func(params_optimized + ei + ej)
            fpm = objective_func(params_optimized + ei - ej)
            fmp = objective_func(params_optimized - ei + ej)
            fmm = objective_func(params_optimized - ei - ej)
            H[i, j] = (fpp - fpm - fmp + fmm) / (4 * h[i] * h[j])
            H[j, i] = H[i, j]
    
    try:
        ndof = max(1, n_data - n_params)
        sigma_sq = chi_sq_optimal / ndof
        
        try:
            cov = sigma_sq * 2.0 * np.linalg.inv(H)
        except LinAlgError:
            cov = sigma_sq * 2.0 * np.linalg.pinv(H)
        
        perr = np.sqrt(np.abs(np.diag(cov)))
        
        return {
            name: (float(params_optimized[i]), float(perr[i]))
            for i, name in enumerate(params_names)
        }
    except Exception as e:
        logger.warning(f"⚠️ No se pudo calcular incertidumbre Simplex: {e}")
        return {
            name: (float(params_optimized[i]), 0.0)
            for i, name in enumerate(params_names)
        }

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
    use_parameter_scaling: bool = True,
    fraction_groups: Optional[Dict[str, List[str]]] = None
) -> Dict[str, Any]:
    logger.info("=" * 60)
    logger.info("ALGORITMO: SIMPLEX (NELDER-MEAD) v5.3")
    logger.info("=" * 60)

    if len(params_to_optimize) == 0:
        return {'success': False, 'error': 'No hay parámetros para optimizar'}

    start_time = time.time()

    if fraction_groups:
        logger.info(f"🧪 Restricciones EMT activas: {len(fraction_groups)} grupos")

    if use_parameter_scaling:
        scales, offsets, params_names = scale_parameters(params_to_optimize)
    else:
        scales       = np.ones(len(params_to_optimize))
        offsets      = np.array([p['initial_value'] for p in params_to_optimize])
        params_names = [p['name'] for p in params_to_optimize]

    initial_values_physical = np.array([p['initial_value'] for p in params_to_optimize])
    initial_values_scaled   = scale_to_normalized(initial_values_physical, scales, offsets)

    bounds_lower_physical = np.array([p['lower_bound'] for p in params_to_optimize])
    bounds_upper_physical = np.array([p['upper_bound'] for p in params_to_optimize])
    bounds_lower_scaled   = scale_to_normalized(bounds_lower_physical, scales, offsets)
    bounds_upper_scaled   = scale_to_normalized(bounds_upper_physical, scales, offsets)

    logger.info(f"🔧 Optimizando {len(params_names)} parámetros: {params_names}")

    spectral_weights = None
    if spectral_focus_regions:
        spectral_weights = calculate_spectral_weights(wavelengths, spectral_focus_regions)

    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    metrics_initial = calculate_all_metrics(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
    )

    logger.info(f"  MSE inicial: {metrics_initial['mse']:.2f} [{metrics_initial['quality']}]")

    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
    )
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data         = len(wavelengths) * 2
    chi_sq_initial = float(np.sum(residuals_initial**2))

    param_scales_magnitude = np.abs(offsets)
    xatol_per_param = np.where(
        param_scales_magnitude > 10,
        1e-3,
        1e-5
    )
    xatol_effective = float(np.max(xatol_per_param))
    fatol_effective = 1e-5
    logger.info(f"  Tolerancias adaptativas: xatol={xatol_effective:.2e}, fatol={fatol_effective:.2e}")

    iteration_count  = [0]
    no_improve_count = [0]

    best_partial = {
        'params_scaled': initial_values_scaled.copy(),
        'chi_sq':        chi_sq_initial,
        'mse':           metrics_initial['mse']
    }

    dof_approx = max(1, 3 * len(wavelengths) - len(params_names))

    def chi_sq_to_mse_approx(chi_sq_val: float) -> float:
        sigma_ratio_sq = (sigma_psi / sigma_delta) ** 2
        chi_sq_ncs_approx = chi_sq_val * sigma_ratio_sq
        return float(np.sqrt(max(chi_sq_ncs_approx, 0.0) / dof_approx) * 1000)

    _model_static_keys = {'global', 'ambient', 'substrate'}

    def make_model_copy_efficient(base_model: Dict) -> Dict:
        shallow = {}
        for k, v in base_model.items():
            if k in _model_static_keys:
                shallow[k] = v
            else:
                shallow[k] = copy.deepcopy(v)
        return shallow

    def objective_function(params_scaled):
        iteration_count[0] += 1

        penalty = 0.0
        for i in range(len(params_scaled)):
            if params_scaled[i] < bounds_lower_scaled[i]:
                penalty += (bounds_lower_scaled[i] - params_scaled[i])**2
            elif params_scaled[i] > bounds_upper_scaled[i]:
                penalty += (params_scaled[i] - bounds_upper_scaled[i])**2

        if penalty > 0:
            return chi_sq_initial + 1e6 * penalty

        params_physical = unscale_parameters(params_scaled, scales, offsets)
        params_dict = {params_names[i]: params_physical[i] for i in range(len(params_names))}

        updated_model = make_model_copy_efficient(optical_model)
        updated_model = apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)

        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception:
            return chi_sq_initial * 1e3

        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
        )

        chi_sq = float(np.sum(np.concatenate([residuals_psi, residuals_delta])**2))

        if fraction_groups:
            chi_sq += calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0)

        if chi_sq < best_partial['chi_sq']:
            best_partial['chi_sq']        = chi_sq
            best_partial['params_scaled'] = params_scaled.copy()
            no_improve_count[0]           = 0
        else:
            no_improve_count[0] += 1

        if iteration_count[0] % 20 == 0:
            mse_approx = chi_sq_to_mse_approx(chi_sq)
            logger.info(f"  Iter {iteration_count[0]}: MSE ≈ {mse_approx:.2f} (aprox rápida)")

            try:
                import main as main_module
                state = main_module.current_optimization_state
                if state.is_cancelled:
                    raise StopIteration("Optimización cancelada por usuario")
                state.current_iteration = iteration_count[0]
                state.current_mse       = mse_approx
                state.status_message    = f"Iter {iteration_count[0]} — MSE ≈ {mse_approx:.2f}"
            except StopIteration:
                raise
            except Exception:
                pass

        return chi_sq

    MAX_STAGNATION = max(200, len(params_names) * 20)
    logger.info(f"  Parada temprana si no mejora en {MAX_STAGNATION} evaluaciones consecutivas")

    _original_objective = objective_function

    def objective_with_early_stop(params_scaled):
        val = _original_objective(params_scaled)
        if no_improve_count[0] >= MAX_STAGNATION:
            logger.info(
                f"  ⏹ Parada temprana: sin mejora en {MAX_STAGNATION} evaluaciones "
                f"(iter {iteration_count[0]})"
            )
            raise StopIteration("Convergencia temprana — sin mejora")
        return val

    try:
        n_params_actual   = len(params_names)
        max_iter_adjusted = max(max_iterations, n_params_actual * 100)
        logger.info(f"  max_iter ajustado: {max_iter_adjusted} ({n_params_actual} params × 100)")

        result = minimize(
            objective_with_early_stop,
            x0=initial_values_scaled,
            method='Nelder-Mead',
            options={
                'maxiter':  max_iter_adjusted,
                'maxfev':   max_iter_adjusted * 2,
                'xatol':    xatol_effective,
                'fatol':    fatol_effective,
                'adaptive': True
            }
        )

        if not result.success:
            logger.warning(
                f"⚠️ Simplex no convergió formalmente ({max_iter_adjusted} iter). "
                f"Usando mejor punto parcial. Msg: {result.message}"
            )
            if best_partial['chi_sq'] < result.fun:
                result.x = best_partial['params_scaled']
            result.success = True

        optimization_time = time.time() - start_time

        params_optimized_physical = unscale_parameters(result.x, scales, offsets)
        params_dict = {params_names[i]: params_optimized_physical[i] for i in range(len(params_names))}
        params_dict_constrained = apply_physical_constraints(params_dict, params_names)

        if fraction_groups:
            valid, violations = validate_fraction_constraint(params_dict_constrained, fraction_groups)
            if not valid:
                for group, suma in violations.items():
                    logger.warning(f"  ⚠️ {group}: suma = {suma:.6f}")

        updated_model_final = copy.deepcopy(optical_model)
        updated_model_final = apply_optimized_params_to_model(
            params_dict_constrained, updated_model_final, params_to_optimize
        )
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)

        metrics_final = calculate_all_metrics(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
        )

        info_criteria = calculate_information_criteria(
            metrics_final['chi_squared'], len(params_names), n_data
        )

        improvement_mse = (
            (metrics_initial['mse'] - metrics_final['mse']) /
            metrics_initial['mse'] * 100
        ) if metrics_initial['mse'] > 0 else 0

        logger.info(
            f"✅ MSE: {metrics_initial['mse']:.2f} → {metrics_final['mse']:.2f} "
            f"({improvement_mse:.1f}%) en {optimization_time:.2f}s"
        )

        # ── Incertidumbres por Hessiano numérico ──────────────────────────────
        logger.info("  Calculando incertidumbres (Hessiano numérico)...")
        params_optimized_array  = np.array([params_dict_constrained[n] for n in params_names])
        params_optimized_scaled = scale_to_normalized(params_optimized_array, scales, offsets)

        confidence_intervals_simplex = estimate_confidence_intervals_simplex(
            params_optimized_scaled,
            objective_function,
            params_names,
            n_data,
            chi_sq_optimal=result.fun
        )

        # Convertir incertidumbres de espacio escalado a físico
        confidence_intervals = {}
        for i, name in enumerate(params_names):
            _, err_scaled = confidence_intervals_simplex[name]
            err_physical  = float(err_scaled * abs(scales[i]))
            confidence_intervals[name] = (float(params_dict_constrained[name]), err_physical)

        logger.info(f"  Incertidumbres calculadas para {len(confidence_intervals)} parámetros")

        return {
            'success':                True,
            'algorithm':              'simplex',
            'message':                result.message,
            'iterations':             result.nfev,
            'optimization_time':      optimization_time,
            'improvement_percentage': float(improvement_mse),
            'optimized_params':       params_dict_constrained,
            'params_to_optimize':     params_to_optimize,
            'confidence_intervals':   confidence_intervals,
            'weighting': {
                'sigma_psi':      sigma_psi,
                'sigma_delta':    sigma_delta,
                'method':         'statistical_weighting',
                'spectral_focus': spectral_focus_regions is not None
            },
            'initial_metrics':   metrics_initial,
            'final_metrics':     metrics_final,
            'improvement':       {'mse_percent': float(improvement_mse)},
            'psi_theoretical':   psi_theo_final.tolist(),
            'delta_theoretical': delta_theo_final.tolist(),
            'optimized_model':   updated_model_final
        }

    except StopIteration as e:
        logger.warning(f"⚠️ Optimización Simplex detenida: {str(e)}")
        optimization_time = time.time() - start_time

        params_best_physical = unscale_parameters(best_partial['params_scaled'], scales, offsets)
        params_dict_best     = {params_names[i]: params_best_physical[i] for i in range(len(params_names))}
        params_dict_best     = apply_physical_constraints(params_dict_best, params_names)

        updated_model_best = copy.deepcopy(optical_model)
        updated_model_best = apply_optimized_params_to_model(
            params_dict_best, updated_model_best, params_to_optimize
        )
        psi_best, delta_best = calculate_theoretical_func(updated_model_best, wavelengths)

        metrics_best = calculate_all_metrics(
            psi_exp, psi_best, delta_exp, delta_best,
            n_params=len(params_names), sigma_psi=sigma_psi, sigma_delta=sigma_delta
        )

        cancelled_by_user = "cancelada por usuario" in str(e).lower()

        return {
            'success':                True,
            'algorithm':              'simplex',
            'message':                'Cancelado por usuario — mejor resultado parcial'
                                      if cancelled_by_user else
                                      'Convergencia temprana — mejor resultado encontrado',
            'cancelled':              cancelled_by_user,
            'early_stopped':          not cancelled_by_user,
            'iterations':             iteration_count[0],
            'optimization_time':      optimization_time,
            'improvement_percentage': float(
                (metrics_initial['mse'] - metrics_best['mse']) /
                metrics_initial['mse'] * 100
            ) if metrics_initial['mse'] > 0 else 0,
            'optimized_params':       params_dict_best,
            'params_to_optimize':     params_to_optimize,
            'confidence_intervals':   None,
            'weighting': {
                'sigma_psi':   sigma_psi,
                'sigma_delta': sigma_delta,
                'method':      'statistical_weighting',
            },
            'initial_metrics':   metrics_initial,
            'final_metrics':     metrics_best,
            'improvement':       {'mse_percent': 0.0},
            'psi_theoretical':   psi_best.tolist(),
            'delta_theoretical': delta_best.tolist(),
            'optimized_model':   updated_model_best
        }

    except Exception as e:
        logger.error(f"❌ Error en Simplex: {str(e)}", exc_info=True)
        return {
            'success':   False,
            'algorithm': 'simplex',
            'message':   f'Error: {str(e)}',
            'error':     str(e)
        }

# ============================================================================
# ⭐ NUEVO v5.0: ESTRATEGIA MULTIGUESS
# ============================================================================
def generate_multiguess_params(
    params_to_optimize: List[Dict],
    n_guesses: int = 5,
    random_seed: Optional[int] = None
) -> List[List[Dict]]:
    """
    Genera N conjuntos de parámetros iniciales para la estrategia Multiguess.
    
    Args:
        params_to_optimize: Lista de parámetros con initial_value, bounds, variation
        n_guesses: Número de conjuntos a generar (incluye el original)
        random_seed: Semilla para reproducibilidad (None = aleatorio)
    
    Returns:
        Lista de n_guesses conjuntos de parámetros.
        El primer conjunto siempre usa los valores originales del usuario.
    """
    rng = np.random.default_rng(random_seed)

    if random_seed is not None:
        logger.info(f"  🎲 Semilla aleatoria fijada: {random_seed} (reproducible)")
    else:
        logger.info(f"  🎲 Semilla aleatoria: no fijada (run único)")

    all_guesses = []

    for i in range(n_guesses):
        if i == 0:
            all_guesses.append(copy.deepcopy(params_to_optimize))
            continue

        guess_params = []
        for param in params_to_optimize:
            initial = param['initial_value']
            lb      = param['lower_bound']
            ub      = param['upper_bound']
            mode    = param.get('variation_mode', 'relative')
            var_val = param.get('variation_value', 20.0)

            if mode == 'absolute':
                delta = var_val
            else:
                delta = abs(initial) * (var_val / 100.0)

            low  = max(initial - delta, lb)
            high = min(initial + delta, ub)

            if low >= high:
                low  = lb
                high = ub
                logger.debug(f"  {param['name']}: variación excede bounds, usando bounds completos")

            random_val = rng.uniform(low, high)

            new_param = copy.deepcopy(param)
            new_param['initial_value'] = random_val
            guess_params.append(new_param)

        all_guesses.append(guess_params)

    return all_guesses


def optimize_multiguess(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    algorithm: str = 'levenberg_marquardt',
    n_guesses: int = 5,
    max_iterations: int = 200,
    sigma_psi: float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA,
    use_tikhonov_regularization: bool = False,
    lambda_reg: float = 1e-4,
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None,
    fraction_groups: Optional[Dict[str, List[str]]] = None,
    random_seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    ⭐ ESTRATEGIA MULTIGUESS v5.3

    Ejecuta el algoritmo seleccionado (LM o Simplex) múltiples veces
    con diferentes puntos iniciales controlados por el usuario, y retorna
    TODOS los resultados para que el usuario decida cuál tiene sentido físico.

    Args:
        random_seed: Semilla aleatoria opcional. Si se proporciona, los guesses
                     generados son reproducibles entre runs. Útil para debugging
                     y comparación de resultados. None = aleatorio cada vez.
    """

    logger.info("=" * 60)
    logger.info(f"ESTRATEGIA MULTIGUESS v5.3: {n_guesses} guesses × {algorithm.upper()}")
    logger.info("=" * 60)

    start_time_total = time.time()

    all_guess_params = generate_multiguess_params(
        params_to_optimize,
        n_guesses,
        random_seed=random_seed
    )

    logger.info("📊 Configuración de variación por parámetro:")
    for param in params_to_optimize:
        mode    = param.get('variation_mode', 'relative')
        var_val = param.get('variation_value', 20.0)
        unit    = '%' if mode == 'relative' else ''
        logger.info(f"  {param['name']}: ±{var_val}{unit} ({mode})")

    all_results      = []
    best_mse         = float('inf')
    best_guess_index = 0

    for i, guess_params in enumerate(all_guess_params):
        logger.info(f"\n{'─' * 40}")
        logger.info(f"📌 GUESS {i+1}/{n_guesses}")

        for p in guess_params:
            orig = params_to_optimize[
                [pp['name'] for pp in params_to_optimize].index(p['name'])
            ]['initial_value']
            if i == 0:
                logger.info(f"  {p['name']}: {p['initial_value']:.6f} (original)")
            else:
                change = ((p['initial_value'] - orig) / orig * 100) if orig != 0 else 0
                logger.info(f"  {p['name']}: {p['initial_value']:.6f} ({change:+.1f}% vs original)")

        if algorithm == 'levenberg_marquardt':
            result = optimize_levenberg_marquardt(
                psi_exp, delta_exp, wavelengths,
                optical_model, guess_params, calculate_theoretical_func,
                max_iterations=max_iterations,
                sigma_psi=sigma_psi, sigma_delta=sigma_delta,
                use_tikhonov_regularization=use_tikhonov_regularization,
                lambda_reg=lambda_reg,
                spectral_focus_regions=spectral_focus_regions,
                use_parameter_scaling=True,
                fraction_groups=fraction_groups
            )
        else:
            result = optimize_simplex(
                psi_exp, delta_exp, wavelengths,
                optical_model, guess_params, calculate_theoretical_func,
                max_iterations=max_iterations,
                sigma_psi=sigma_psi, sigma_delta=sigma_delta,
                spectral_focus_regions=spectral_focus_regions,
                use_parameter_scaling=True,
                fraction_groups=fraction_groups
            )

        guess_result = {
            'guess_number':           i + 1,
            'initial_params':         {p['name']: p['initial_value'] for p in guess_params},
            'success':                result.get('success', False),
            'algorithm':              algorithm,
            'iterations':             result.get('iterations', 0),
            'optimization_time':      result.get('optimization_time', 0),
            'optimized_params':       result.get('optimized_params', {}),
            'metrics':                result.get('final_metrics', {}),
            'improvement_percentage': result.get('improvement_percentage', 0),
            'confidence_intervals':   result.get('confidence_intervals', None),
            'psi_theoretical':        result.get('psi_theoretical', []),
            'delta_theoretical':      result.get('delta_theoretical', []),
            # ⭐ CORRECCIÓN: incluir optimized_model para que el frontend pueda
            # recalcular n,k y R/T/A correctamente (incluye EMT, fracciones, etc.)
            'optimized_model':        result.get('optimized_model', None),
        }

        all_results.append(guess_result)

        if result.get('success', False):
            mse = result.get('final_metrics', {}).get('mse', float('inf'))
            if mse < best_mse:
                best_mse         = mse
                best_guess_index = i
            logger.info(f"  ✅ Guess {i+1}: MSE = {mse:.2f}")
        else:
            logger.warning(f"  ❌ Guess {i+1}: No convergió")

    total_time = time.time() - start_time_total

    # Análisis de convergencia
    converged_results = [r for r in all_results if r['success']]
    n_converged       = len(converged_results)
    n_failed          = n_guesses - n_converged

    parameter_ranges = {}

    if n_converged > 0:
        param_names = list(converged_results[0]['optimized_params'].keys())

        for pname in param_names:
            values = [r['optimized_params'].get(pname, 0) for r in converged_results]
            parameter_ranges[pname] = {
                'min':   float(min(values)),
                'max':   float(max(values)),
                'mean':  float(np.mean(values)),
                'std':   float(np.std(values)),
                'range': float(max(values) - min(values)),
                'cv':    float(np.std(values) / abs(np.mean(values)) * 100)
                         if abs(np.mean(values)) > 1e-10 else 0.0
            }

        mse_values = [r['metrics'].get('mse', float('inf')) for r in converged_results]

        convergence_analysis = {
            'all_converge_to_similar': all(
                pr['cv'] < 5.0 for pr in parameter_ranges.values()
            ),
            'mse_range': float(max(mse_values) - min(mse_values)),
            'mse_std':   float(np.std(mse_values)),
            'mse_mean':  float(np.mean(mse_values)),
            'interpretation': ''
        }

        if convergence_analysis['all_converge_to_similar'] and convergence_analysis['mse_std'] < 1.0:
            convergence_analysis['interpretation'] = (
                'ALTA CONFIANZA: Todos los guesses convergen a valores similares. '
                'Probablemente se encontró el mínimo global.'
            )
        elif convergence_analysis['mse_std'] < 5.0:
            convergence_analysis['interpretation'] = (
                'CONFIANZA MODERADA: Los guesses convergen a valores cercanos '
                'pero con algo de variación. Revisar parámetros con mayor dispersión.'
            )
        else:
            convergence_analysis['interpretation'] = (
                'BAJA CONFIANZA: Los guesses convergen a valores diferentes. '
                'Posibles mínimos locales. Considerar restringir bounds o revisar modelo.'
            )
    else:
        convergence_analysis = {
            'all_converge_to_similar': False,
            'mse_range': 0, 'mse_std': 0, 'mse_mean': 0,
            'interpretation': 'NINGÚN GUESS CONVERGIÓ. Revisar modelo óptico y bounds.'
        }

    logger.info(f"\n{'=' * 60}")
    logger.info(f"RESUMEN MULTIGUESS")
    logger.info(f"{'=' * 60}")
    logger.info(f"  Convergidos:  {n_converged}/{n_guesses}")
    logger.info(f"  Mejor MSE:    {best_mse:.2f} (Guess #{best_guess_index + 1})")
    logger.info(f"  Tiempo total: {total_time:.2f} s")
    if random_seed is not None:
        logger.info(f"  Semilla usada: {random_seed} (reproducible)")
    logger.info(f"  {convergence_analysis['interpretation']}")

    return {
        'success':          n_converged > 0,
        'strategy':         'multiguess',
        'algorithm':        algorithm,
        'n_guesses':        n_guesses,
        'n_converged':      n_converged,
        'n_failed':         n_failed,
        'total_time':       total_time,
        'best_guess_index': best_guess_index,
        'random_seed':      random_seed,
        'all_results':      all_results,
        'summary': {
            'converged_count':      n_converged,
            'failed_count':         n_failed,
            'best_mse':             float(best_mse) if best_mse != float('inf') else None,
            'parameter_ranges':     parameter_ranges,
            'convergence_analysis': convergence_analysis,
        },
        'optimized_params':       all_results[best_guess_index]['optimized_params']       if n_converged > 0 else {},
        'final_metrics':          all_results[best_guess_index]['metrics']                if n_converged > 0 else {},
        'initial_metrics':        all_results[0]['metrics']                               if all_results     else {},
        'improvement_percentage': all_results[best_guess_index]['improvement_percentage'] if n_converged > 0 else 0,
        'psi_theoretical':        all_results[best_guess_index]['psi_theoretical']        if n_converged > 0 else [],
        'delta_theoretical':      all_results[best_guess_index]['delta_theoretical']      if n_converged > 0 else [],
        'confidence_intervals':   all_results[best_guess_index]['confidence_intervals']   if n_converged > 0 else None,
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
    max_iterations: int = 200,
    sigma_psi: Optional[float] = None,
    sigma_delta: Optional[float] = None,
    use_tikhonov_regularization: bool = False,
    lambda_reg: float = 1e-4,
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None,
    use_multiguess: bool = False,
    n_guesses: int = 5,
    fraction_groups: Optional[Dict[str, List[str]]] = None,
    random_seed: Optional[int] = None
) -> Dict[str, Any]:

    if sigma_psi   is None: sigma_psi   = DEFAULT_SIGMA_PSI
    if sigma_delta is None: sigma_delta = DEFAULT_SIGMA_DELTA

    logger.info(f"\n{'=' * 60}")
    logger.info(f"OPTIMIZACIÓN v5.3 - {algorithm.upper()}")
    if use_multiguess:
        logger.info(f"  Estrategia: MULTIGUESS ({n_guesses} guesses)")
    logger.info(f"  Parámetros: {len(params_to_optimize)}")
    logger.info(f"  σ_ψ={sigma_psi}°, σ_Δ={sigma_delta}°")
    if fraction_groups:
        logger.info(f"  Restricciones EMT: {len(fraction_groups)} grupos")
    logger.info(f"{'=' * 60}\n")

    if algorithm == 'simplex' and max_iterations < 200:
        max_iterations = 200

    if use_multiguess:
        result = optimize_multiguess(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize, calculate_theoretical_func,
            algorithm=algorithm, n_guesses=n_guesses,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi, sigma_delta=sigma_delta,
            use_tikhonov_regularization=use_tikhonov_regularization,
            lambda_reg=lambda_reg,
            spectral_focus_regions=spectral_focus_regions,
            fraction_groups=fraction_groups,
            random_seed=random_seed
        )
    elif algorithm == 'levenberg_marquardt':
        result = optimize_levenberg_marquardt(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize, calculate_theoretical_func,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi, sigma_delta=sigma_delta,
            use_tikhonov_regularization=use_tikhonov_regularization,
            lambda_reg=lambda_reg,
            spectral_focus_regions=spectral_focus_regions,
            use_parameter_scaling=True,
            fraction_groups=fraction_groups
        )
    else:
        result = optimize_simplex(
            psi_exp, delta_exp, wavelengths,
            optical_model, params_to_optimize, calculate_theoretical_func,
            max_iterations=max_iterations,
            sigma_psi=sigma_psi, sigma_delta=sigma_delta,
            spectral_focus_regions=spectral_focus_regions,
            use_parameter_scaling=True,
            fraction_groups=fraction_groups
        )

    if 'strategy' not in result:
        result['strategy'] = 'multiguess' if use_multiguess else 'single'

    return result