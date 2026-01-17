"""
Módulo de optimización multiparamétrica para elipsometría espectroscópica
VERSIÓN PROFESIONAL v4.1 con soporte para fracciones volumétricas EMT

ACTUALIZACIONES v4.1 (2026-01-09):
✅ NUEVO: Soporte completo para fracciones volumétricas EMT
✅ NUEVO: Función apply_optimized_params_to_model con navegación por paths
✅ NUEVO: Validación de restricción suma=1 para grupos de fracciones
✅ NUEVO: Parámetro fraction_groups en todas las funciones de optimización

ACTUALIZACIONES v4.0 (2026-01-03):
✅ MSE calculado según CompleteEASE (ecuación 2-2)
✅ Transformación Ψ,Δ → N,C,S para cálculo de error
✅ Métricas duales (MSE principal + χ² secundario)
✅ Interpretación automática de calidad del ajuste
✅ improvement_percentage retornado correctamente

CARACTERÍSTICAS PREVIAS:
- Levenberg-Marquardt (Trust Region Reflective) con ponderación estadística
- Simplex (Nelder-Mead) como explorador robusto
- Multistart (Simplex → LM) para evitar mínimos locales
- Escalado automático de parámetros
- Análisis de correlación
- Regularización física y matemática
- Pesos espectrales
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
    
    Fórmulas (CompleteEASE Manual):
        N = cos(2Ψ)
        C = sin(2Ψ)cos(Δ)
        S = sin(2Ψ)sin(Δ)
    
    Args:
        psi_deg: Array de Ψ en grados
        delta_deg: Array de Δ en grados
    
    Returns:
        (N, C, S) como arrays de numpy
    
    Referencias:
        J.A. Woollam Co., CompleteEASE Data Analysis Manual, v6.56, 2023.
    """
    psi_rad = np.deg2rad(psi_deg)
    delta_rad = np.deg2rad(delta_deg)
    
    N = np.cos(2 * psi_rad)
    C = np.sin(2 * psi_rad) * np.cos(delta_rad)
    S = np.sin(2 * psi_rad) * np.sin(delta_rad)
    
    return N, C, S


# ============================================================================
# FUNCIONES DE CÁLCULO DE MÉTRICAS - VERSIÓN DUAL
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
    Calcula TODAS las métricas de ajuste en un solo lugar
    
    NUEVO v4.0: Implementa métricas duales
    1. MSE de CompleteEASE (N, C, S) - MÉTRICA PRINCIPAL
    2. χ² estadístico (Ψ, Δ ponderados) - MÉTRICA SECUNDARIA
    
    Args:
        psi_exp, psi_theo: Arrays de Ψ experimental y teórico
        delta_exp, delta_theo: Arrays de Δ experimental y teórico
        n_params: Número de parámetros optimizados
        sigma_psi: Incertidumbre experimental en Ψ
        sigma_delta: Incertidumbre experimental en Δ
    
    Returns:
        Dict con todas las métricas calculadas
        
    Referencias:
        J.A. Woollam Co., CompleteEASE Data Analysis Manual, v6.56, 2023, eq. (2-2)
    """
    n_wavelengths = len(psi_exp)
    
    # ==========================================
    # MÉTODO 1: MSE DE COMPLETEEASE (N, C, S) - PRINCIPAL
    # ==========================================
    
    # Transformar a coordenadas N, C, S
    N_exp, C_exp, S_exp = psi_delta_to_ncs(psi_exp, delta_exp)
    N_theo, C_theo, S_theo = psi_delta_to_ncs(psi_theo, delta_theo)
    
    # Suma de errores cuadrados en N, C, S
    sum_squared_ncs = float(np.sum(
        (N_exp - N_theo)**2 +
        (C_exp - C_theo)**2 +
        (S_exp - S_theo)**2
    ))
    
    # Grados de libertad: 3n - m (3 componentes × n longitudes - m parámetros)
    dof_completeease = 3 * n_wavelengths - n_params
    if dof_completeease <= 0:
        dof_completeease = 1
    
    # MSE según CompleteEASE (ecuación 2-2 del manual)
    mse_completeease = np.sqrt(sum_squared_ncs / dof_completeease) * 1000
    
    # Chi² base (sin el factor × 1000)
    chi_squared_ncs = sum_squared_ncs
    chi_squared_reduced_ncs = sum_squared_ncs / dof_completeease
    
    # Interpretación de calidad según valores estándar
    if mse_completeease < 5:
        quality = 'EXCELENTE'
    elif mse_completeease < 20:
        quality = 'BUENO'
    elif mse_completeease < 50:
        quality = 'ACEPTABLE'
    else:
        quality = 'POBRE'
    
    # ==========================================
    # MÉTODO 2: χ² ESTADÍSTICO (Ψ, Δ ponderados) - SECUNDARIO
    # ==========================================
    
    # Residuos ponderados por incertidumbre experimental
    residuals_psi_weighted = (psi_exp - psi_theo) / sigma_psi
    residuals_delta_weighted = (delta_exp - delta_theo) / sigma_delta
    
    # Chi² estadístico
    chi_squared_statistical = float(
        np.sum(residuals_psi_weighted**2) +
        np.sum(residuals_delta_weighted**2)
    )
    
    # Grados de libertad: 2n - m (Ψ y Δ)
    n_data_points = 2 * n_wavelengths
    dof_statistical = n_data_points - n_params
    if dof_statistical <= 0:
        dof_statistical = 1
    
    chi_squared_reduced_statistical = chi_squared_statistical / dof_statistical
    
    # ==========================================
    # MÉTODO 3: RMSE SIMPLE (para referencia)
    # ==========================================
    
    rmse_psi = float(np.sqrt(np.mean((psi_exp - psi_theo)**2)))
    rmse_delta = float(np.sqrt(np.mean((delta_exp - delta_theo)**2)))
    
    # ==========================================
    # MÉTODO 4: R² (coeficiente de determinación)
    # ==========================================
    
    ss_res_psi = np.sum((psi_exp - psi_theo)**2)
    ss_tot_psi = np.sum((psi_exp - np.mean(psi_exp))**2)
    r2_psi = 1 - (ss_res_psi / ss_tot_psi) if ss_tot_psi > 0 else 0.0
    
    ss_res_delta = np.sum((delta_exp - delta_theo)**2)
    ss_tot_delta = np.sum((delta_exp - np.mean(delta_exp))**2)
    r2_delta = 1 - (ss_res_delta / ss_tot_delta) if ss_tot_delta > 0 else 0.0
    
    # ==========================================
    # RETORNAR TODAS LAS MÉTRICAS
    # ==========================================
    
    return {
        # ====== MÉTRICAS PRINCIPALES (COMPLETEEASE) ======
        'mse': float(mse_completeease),  # ← MÉTRICA PRINCIPAL
        'chi_squared': float(chi_squared_ncs),
        'chi_squared_reduced': float(chi_squared_reduced_ncs),
        'quality': quality,  # ← NUEVO: Interpretación automática
        
        # ====== MÉTRICAS ESTADÍSTICAS (ANÁLISIS RIGUROSO) ======
        'chi_squared_statistical': float(chi_squared_statistical),
        'chi_squared_reduced_statistical': float(chi_squared_reduced_statistical),
        
        # ====== MÉTRICAS POR COMPONENTE (PSI Y DELTA) ======
        'psi_metrics': {
            'rmse': float(rmse_psi),
            'r_squared': float(r2_psi),
            'max_error': float(np.max(np.abs(psi_exp - psi_theo)))
        },
        'delta_metrics': {
            'rmse': float(rmse_delta),
            'r_squared': float(r2_delta),
            'max_error': float(np.max(np.abs(delta_exp - delta_theo)))
        },
        
        # ====== INFORMACIÓN SOBRE CÁLCULO ======
        'n_wavelengths': n_wavelengths,
        'n_params': n_params,
        'sigma_psi': sigma_psi,
        'sigma_delta': sigma_delta,
        'method_info': {
            'completeease': f'MSE basado en N,C,S (3n-m={dof_completeease} dof)',
            'statistical': f'χ² basado en Ψ,Δ ponderados (2n-m={dof_statistical} dof)'
        }
    }


# ========================================
# FUNCIONES AUXILIARES
# ========================================

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
    - ⭐ NUEVO: Fracciones volumétricas fuera de [0,1]
    
    Args:
        params: Diccionario de parámetros optimizados
        param_names: Lista de nombres de parámetros
    
    Returns:
        Diccionario de parámetros con restricciones aplicadas
    """
    constrained = params.copy()
    
    for name in param_names:
        value = params[name]
        
        # ⭐ NUEVO: Fracciones volumétricas EMT
        if name.endswith('_fraction'):
            # Limitar a [0, 1]
            constrained[name] = max(0.0, min(1.0, value))
            if value != constrained[name]:
                logger.debug(f"  {name}: {value:.4f} → {constrained[name]:.4f} (limitado a [0,1])")
        
        # Restricciones según tipo de parámetro
        elif name.startswith('f') and not name.startswith('file'):
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


# ==========================================
# ⭐ NUEVA FUNCIÓN v4.1: Aplicar parámetros optimizados (CON SOPORTE EMT)
# ==========================================

def apply_optimized_params_to_model(params_dict, optical_model, param_definitions):
    """
    Aplica parámetros optimizados al modelo óptico usando los 'path' definidos
    ⭐ NUEVO v4.1: Soporte completo para fracciones volumétricas EMT
    
    Args:
        params_dict: Dict con {param_name: param_value}
        optical_model: Modelo óptico completo
        param_definitions: Lista de definiciones de parámetros con 'path'
    
    Returns:
        optical_model actualizado (se modifica in-place)
    """
    for param_def in param_definitions:
        param_name = param_def['name']
        param_value = params_dict.get(param_name)
        
        if param_value is None:
            continue
        
        # Obtener el path (ej: ['layers', 0, 'thickness'])
        path = param_def.get('path', [])
        
        if not path:
            logger.warning(f"⚠️ Parámetro {param_name} sin path definido")
            continue
        
        # Navegar por el modelo siguiendo el path
        current = optical_model
        
        # Navegar hasta el penúltimo elemento
        for key in path[:-1]:
            if isinstance(current, dict):
                if key not in current:
                    # ⭐ NUEVO: Crear estructura si no existe (para EMT)
                    if isinstance(path[-1], str):
                        current[key] = {}
                    else:
                        current[key] = []
                    logger.debug(f"✨ Creando estructura: {key}")
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
            # Asignar el valor en el último elemento del path
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
# ⭐ NUEVA FUNCIÓN v4.1: Validar restricción de suma de fracciones
# ==========================================

def validate_fraction_constraint(params_dict, fraction_groups):
    """
    Valida que la suma de fracciones volumétricas sea ≈ 1.0 para cada grupo
    
    Args:
        params_dict: Dict con parámetros actuales
        fraction_groups: Dict con grupos de fracciones
                        Ej: {'ambient': ['ambient_comp0_fraction', 'ambient_comp1_fraction']}
    
    Returns:
        (valid, violations) donde violations es dict con {grupo: suma}
    """
    violations = {}
    
    for group_key, param_names in fraction_groups.items():
        group_sum = sum(params_dict.get(p, 0.0) for p in param_names)
        
        if abs(group_sum - 1.0) > 0.01:  # Tolerancia de 1%
            violations[group_key] = group_sum
    
    return len(violations) == 0, violations


# ==========================================
# ⭐ NUEVA FUNCIÓN v4.1: Calcular penalización por restricción
# ==========================================

def calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0):
    """
    Calcula penalización por violar restricción suma=1 en fracciones
    
    Args:
        params_dict: Dict con parámetros actuales
        fraction_groups: Dict con grupos de fracciones
        penalty_factor: Factor multiplicador de penalización
    
    Returns:
        Penalización total (0 si todas las sumas ≈ 1.0)
    """
    penalty = 0.0
    
    for group_key, param_names in fraction_groups.items():
        group_sum = sum(params_dict.get(p, 0.0) for p in param_names)
        penalty += penalty_factor * (group_sum - 1.0)**2
        
        if abs(group_sum - 1.0) > 0.01:
            logger.debug(f"  ⚠️ Grupo {group_key}: suma={group_sum:.4f} (penalización={(group_sum - 1.0)**2 * penalty_factor:.2f})")
    
    return penalty


# ========================================
# FUNCIÓN DE ACTUALIZACIÓN DE MODELO (COMPATIBLE CON CÓDIGO ANTERIOR)
# ========================================

def update_model_with_params(
    optical_model: Dict,
    params_to_optimize: List[Dict],
    params_vector: np.ndarray
) -> Dict:
    """
    Actualiza el modelo óptico con nuevos valores de parámetros
    ⭐ DEPRECADO: Usar apply_optimized_params_to_model para mejor compatibilidad
    
    Esta función se mantiene por compatibilidad con código existente
    """
    # Convertir vector a diccionario
    params_dict = {}
    for i, param_info in enumerate(params_to_optimize):
        params_dict[param_info['name']] = float(params_vector[i])
    
    # Usar la nueva función
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
    fraction_groups: Optional[Dict[str, List[str]]] = None  # ⭐ NUEVO v4.1
) -> Dict[str, Any]:
    """
    ALGORITMO 1: Levenberg-Marquardt (Trust Region Reflective)
    VERSIÓN v4.1 con soporte para fracciones volumétricas EMT
    
    Mejoras v4.1:
    ✅ NUEVO: Soporte para optimización de fracciones volumétricas EMT
    ✅ NUEVO: Penalización automática para restricción suma=1
    ✅ NUEVO: Uso de apply_optimized_params_to_model con paths
    
    Mejoras v4.0:
    ✅ MSE calculado según CompleteEASE (ecuación 2-2)
    ✅ Transformación Ψ,Δ → N,C,S para error principal
    ✅ Métricas duales (MSE + χ² estadístico)
    ✅ Residuos ponderados estadísticamente
    ✅ Unwrap global de Δ
    ✅ Covarianza correcta con σ²
    ✅ Escalado automático de parámetros
    ✅ Pesos espectrales opcionales
    ✅ Regularización de Tikhonov opcional
    ✅ Matriz de correlación
    ✅ Restricciones físicas
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: LEVENBERG-MARQUARDT (TRF) v4.1 - MSE CompleteEASE + EMT")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}
    
    start_time = time.time()
    
    # ⭐ NUEVO v4.1: Logging de fracciones EMT
    if fraction_groups:
        logger.info(f"🧪 Restricciones EMT activas: {len(fraction_groups)} grupos")
        for group_key, param_list in fraction_groups.items():
            logger.info(f"  {group_key}: {len(param_list)} componentes")
    
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
    
    # Calcular TODAS las métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    metrics_initial = calculate_all_metrics(
        psi_exp, psi_theo_initial,
        delta_exp, delta_theo_initial,
        n_params=len(params_names),
        sigma_psi=sigma_psi,
        sigma_delta=sigma_delta
    )
    
    logger.info(f"  MSE inicial (CompleteEASE): {metrics_initial['mse']:.2f} [{metrics_initial['quality']}]")
    logger.info(f"  χ²ᵣ inicial (N,C,S): {metrics_initial['chi_squared_reduced']:.6f}")
    
    # También calcular residuos ponderados para Levenberg-Marquardt
    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
    )
    
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data = len(wavelengths) * 2
    
    iteration_count = [0]
    n_tikhonov_terms = len(params_names) if use_tikhonov_regularization else 0
    
    def objective_function(params_scaled):
        """Función objetivo para Levenberg-Marquardt (retorna residuos ponderados)"""
        iteration_count[0] += 1
        
        # Convertir a espacio físico
        params_physical = unscale_parameters(params_scaled, scales, offsets)
        
        # ⭐ NUEVO v4.1: Crear dict de parámetros
        params_dict = {params_names[i]: params_physical[i] for i in range(len(params_names))}
        
        # ⭐ NUEVO v4.1: Aplicar parámetros usando la función mejorada
        updated_model = copy.deepcopy(optical_model)
        updated_model = apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)
        
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
        
        # ⭐ NUEVO v4.1: Penalización por restricción de fracciones
        if fraction_groups:
            penalty = calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0)
            # Agregar penalización como residuos extra (para que LM lo minimice)
            if penalty > 1e-6:
                residuals = np.concatenate([residuals, [np.sqrt(penalty)]])
        
        # Regularización de Tikhonov (opcional)
        if use_tikhonov_regularization:
            # En espacio escalado, los parámetros iniciales son 0
            residuals_reg = lambda_reg * params_scaled
            residuals = np.concatenate([residuals, residuals_reg])
        
        # Logging con MSE
        if iteration_count[0] % 10 == 0:
            metrics_iter = calculate_all_metrics(
                psi_exp, psi_theo, delta_exp, delta_theo,
                n_params=len(params_names),
                sigma_psi=sigma_psi,
                sigma_delta=sigma_delta
            )
            logger.info(f"  Iteración {iteration_count[0]}: MSE = {metrics_iter['mse']:.2f}, χ²ᵣ = {metrics_iter['chi_squared_reduced']:.6f}")
        
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
        
        # ⭐ NUEVO v4.1: Validar restricción de fracciones final
        if fraction_groups:
            valid, violations = validate_fraction_constraint(params_dict_constrained, fraction_groups)
            if not valid:
                logger.warning("⚠️ Restricción de fracciones no satisfecha completamente:")
                for group, suma in violations.items():
                    logger.warning(f"  {group}: suma = {suma:.6f} (esperado: 1.0)")
        
        # Calcular TODAS las métricas finales
        updated_model_final = copy.deepcopy(optical_model)
        updated_model_final = apply_optimized_params_to_model(params_dict_constrained, updated_model_final, params_to_optimize)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        metrics_final = calculate_all_metrics(
            psi_exp, psi_theo_final,
            delta_exp, delta_theo_final,
            n_params=len(params_names),
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta
        )
        
        # También calcular residuos ponderados para intervalos de confianza
        residuals_psi_final, residuals_delta_final = calculate_weighted_residuals(
            psi_exp, psi_theo_final, delta_exp, delta_theo_final,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
        )
        
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
        info_criteria = calculate_information_criteria(
            metrics_final['chi_squared'], len(params_names), n_data
        )
        
        # Mejora basada en MSE
        improvement_mse = ((metrics_initial['mse'] - metrics_final['mse']) / 
                          metrics_initial['mse']) * 100 if metrics_initial['mse'] > 0 else 0
        
        improvement_chi2_red = ((metrics_initial['chi_squared_reduced'] - metrics_final['chi_squared_reduced']) / 
                                metrics_initial['chi_squared_reduced']) * 100 if metrics_initial['chi_squared_reduced'] > 0 else 0
        
        logger.info(f"  MSE final: {metrics_final['mse']:.2f} [{metrics_final['quality']}] (mejora: {improvement_mse:.2f}%)")
        logger.info(f"  χ²ᵣ final: {metrics_final['chi_squared_reduced']:.6f} (mejora: {improvement_chi2_red:.2f}%)")
        logger.info(f"  AIC: {info_criteria['aic']:.2f}, BIC: {info_criteria['bic']:.2f}")
        
        return {
            'success': result.success,
            'algorithm': 'levenberg_marquardt',
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'improvement_percentage': float(improvement_mse),
            'optimized_params': params_dict_constrained,
            'params_to_optimize': params_to_optimize,  # ⭐ NUEVO: Para fallback en frontend
            'confidence_intervals': confidence_intervals,
            'correlation_matrix': correlation_matrix.tolist(),
            'high_correlations': high_correlations,
            'weighting': {
                'sigma_psi': sigma_psi,
                'sigma_delta': sigma_delta,
                'method': 'statistical_weighting',
                'spectral_focus': spectral_focus_regions is not None
            },
            # Métricas completas (MSE + χ²)
            'initial_metrics': metrics_initial,
            'final_metrics': metrics_final,
            'improvement': {
                'mse_percent': float(improvement_mse),
                'chi_squared_reduced_percent': float(improvement_chi2_red)
            },
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
    use_parameter_scaling: bool = True,
    fraction_groups: Optional[Dict[str, List[str]]] = None  # ⭐ NUEVO v4.1
) -> Dict[str, Any]:
    """
    ALGORITMO 2: Simplex (Nelder-Mead)
    VERSIÓN v4.1 con soporte para fracciones volumétricas EMT
    
    Mejoras v4.1:
    ✅ NUEVO: Soporte para optimización de fracciones volumétricas EMT
    ✅ NUEVO: Penalización automática para restricción suma=1
    
    Mejoras v4.0:
    ✅ MSE calculado según CompleteEASE
    ✅ Métricas duales (MSE + χ²)
    ✅ Residuos ponderados estadísticamente
    ✅ Unwrap global de Δ
    ✅ Penalización suave en boundaries
    ✅ Escalado automático de parámetros
    """
    
    logger.info("=" * 60)
    logger.info("ALGORITMO: SIMPLEX (NELDER-MEAD) v4.1 - MSE CompleteEASE + EMT")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return {'success': False, 'error': 'No hay parámetros para optimizar'}
    
    start_time = time.time()
    
    # ⭐ NUEVO v4.1: Logging de fracciones EMT
    if fraction_groups:
        logger.info(f"🧪 Restricciones EMT activas: {len(fraction_groups)} grupos")
    
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
    
    # Calcular TODAS las métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    metrics_initial = calculate_all_metrics(
        psi_exp, psi_theo_initial,
        delta_exp, delta_theo_initial,
        n_params=len(params_names),
        sigma_psi=sigma_psi,
        sigma_delta=sigma_delta
    )
    
    logger.info(f"  MSE inicial: {metrics_initial['mse']:.2f} [{metrics_initial['quality']}]")
    logger.info(f"  χ²ᵣ inicial: {metrics_initial['chi_squared_reduced']:.6f}")
    
    # También necesitamos χ² estadístico para la optimización
    residuals_psi_initial, residuals_delta_initial = calculate_weighted_residuals(
        psi_exp, psi_theo_initial, delta_exp, delta_theo_initial,
        sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
    )
    
    residuals_initial = np.concatenate([residuals_psi_initial, residuals_delta_initial])
    n_data = len(wavelengths) * 2
    chi_sq_statistical_initial = float(np.sum(residuals_initial**2))
    
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
            return chi_sq_statistical_initial + 1e6 * penalty
        
        # Convertir a espacio físico
        params_physical = unscale_parameters(params_scaled, scales, offsets)
        
        # ⭐ NUEVO v4.1: Crear dict y aplicar parámetros
        params_dict = {params_names[i]: params_physical[i] for i in range(len(params_names))}
        
        updated_model = copy.deepcopy(optical_model)
        updated_model = apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en cálculo teórico: {str(e)}")
            return chi_sq_statistical_initial * 1e3
        
        # Residuos ponderados
        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            sigma_psi, sigma_delta, spectral_weights, use_global_unwrap=True
        )
        
        residuals = np.concatenate([residuals_psi, residuals_delta])
        chi_sq = float(np.sum(residuals**2))
        
        # ⭐ NUEVO v4.1: Agregar penalización por restricción de fracciones
        if fraction_groups:
            fraction_penalty = calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0)
            chi_sq += fraction_penalty
        
        # Logging con MSE
        if iteration_count[0] % 20 == 0:
            metrics_iter = calculate_all_metrics(
                psi_exp, psi_theo, delta_exp, delta_theo,
                n_params=len(params_names),
                sigma_psi=sigma_psi,
                sigma_delta=sigma_delta
            )
            logger.info(f"  Iteración {iteration_count[0]}: MSE = {metrics_iter['mse']:.2f}, χ²ᵣ = {metrics_iter['chi_squared_reduced']:.6f}")
        
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
        
        # ⭐ NUEVO v4.1: Validar restricción de fracciones final
        if fraction_groups:
            valid, violations = validate_fraction_constraint(params_dict_constrained, fraction_groups)
            if not valid:
                logger.warning("⚠️ Restricción de fracciones no satisfecha completamente:")
                for group, suma in violations.items():
                    logger.warning(f"  {group}: suma = {suma:.6f} (esperado: 1.0)")
        
        # Calcular TODAS las métricas finales
        updated_model_final = copy.deepcopy(optical_model)
        updated_model_final = apply_optimized_params_to_model(params_dict_constrained, updated_model_final, params_to_optimize)
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        metrics_final = calculate_all_metrics(
            psi_exp, psi_theo_final,
            delta_exp, delta_theo_final,
            n_params=len(params_names),
            sigma_psi=sigma_psi,
            sigma_delta=sigma_delta
        )
        
        # Criterios de información
        info_criteria = calculate_information_criteria(
            metrics_final['chi_squared'], len(params_names), n_data
        )
        
        # Mejora basada en MSE
        improvement_mse = ((metrics_initial['mse'] - metrics_final['mse']) / 
                          metrics_initial['mse']) * 100 if metrics_initial['mse'] > 0 else 0
        
        logger.info(f"  MSE final: {metrics_final['mse']:.2f} [{metrics_final['quality']}] (mejora: {improvement_mse:.2f}%)")
        logger.info(f"  AIC: {info_criteria['aic']:.2f}, BIC: {info_criteria['bic']:.2f}")
        
        return {
            'success': result.success,
            'algorithm': 'simplex',
            'message': result.message,
            'iterations': result.nfev,
            'optimization_time': optimization_time,
            'improvement_percentage': float(improvement_mse),
            'optimized_params': params_dict_constrained,
            'params_to_optimize': params_to_optimize,  
            'confidence_intervals': None,  # Simplex no calcula incertidumbre
            'weighting': {
                'sigma_psi': sigma_psi,
                'sigma_delta': sigma_delta,
                'method': 'statistical_weighting',
                'spectral_focus': spectral_focus_regions is not None
            },
            # Métricas completas (MSE + χ²)
            'initial_metrics': metrics_initial,
            'final_metrics': metrics_final,
            'improvement': {
                'mse_percent': float(improvement_mse)
            },
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
    spectral_focus_regions: Optional[List[Tuple[float, float]]] = None,
    fraction_groups: Optional[Dict[str, List[str]]] = None  # ⭐ NUEVO v4.1
) -> Dict[str, Any]:
    """
    ESTRATEGIA MULTISTART: Simplex → Levenberg-Marquardt
    VERSIÓN v4.1 con soporte para fracciones volumétricas EMT
    
    Combina robustez de Simplex con precisión de LM:
    1. Ejecuta Simplex desde múltiples puntos iniciales
    2. Selecciona el mejor resultado
    3. Refina con Levenberg-Marquardt
    
    Esta estrategia es SUPERIOR a usar solo LM o solo Simplex
    
    Args:
        n_starts: Número de inicios aleatorios para Simplex
        fraction_groups: ⭐ NUEVO v4.1: Grupos de fracciones para restricción suma=1
    """
    
    logger.info("=" * 60)
    logger.info(f"ESTRATEGIA MULTISTART v4.1: {n_starts} × SIMPLEX → LM + EMT")
    logger.info("=" * 60)
    
    start_time_total = time.time()
    
    # FASE 1: Múltiples corridas de Simplex
    logger.info(f"🔍 FASE 1: Exploración global con {n_starts} inicios de Simplex")
    
    best_simplex_result = None
    best_mse = float('inf')
    
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
            use_parameter_scaling=True,
            fraction_groups=fraction_groups  # ⭐ NUEVO v4.1
        )
        
        if result_simplex['success']:
            mse = result_simplex['final_metrics']['mse']
            logger.info(f"    ✓ Simplex {i+1}: MSE = {mse:.2f}")
            
            if mse < best_mse:
                best_mse = mse
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
    
    logger.info(f"  🏆 Mejor Simplex: MSE = {best_mse:.2f}")
    
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
        use_parameter_scaling=True,
        fraction_groups=fraction_groups  # ⭐ NUEVO v4.1
    )
    
    total_time = time.time() - start_time_total
    
    if result_lm['success']:
        logger.info(f"✅ MULTISTART completado en {total_time:.2f} s")
        logger.info(f"  Simplex → MSE = {best_mse:.2f}")
        logger.info(f"  LM      → MSE = {result_lm['final_metrics']['mse']:.2f}")
        
        # Agregar información de multistart al resultado
        result_lm['algorithm'] = 'multistart'
        result_lm['multistart_details'] = {
            'n_starts': n_starts,
            'simplex_mse': best_mse,
            'lm_mse': result_lm['final_metrics']['mse'],
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
    n_multistart: int = 3,
    fraction_groups: Optional[Dict[str, List[str]]] = None  # ⭐ NUEVO v4.1
) -> Dict[str, Any]:
    """
    Función principal de optimización (router de algoritmos)
    VERSIÓN v4.1 con soporte para fracciones volumétricas EMT
    
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
        fraction_groups: ⭐ NUEVO v4.1: Dict con grupos de fracciones para restricción suma=1
                        Ej: {'ambient': ['ambient_comp0_fraction', 'ambient_comp1_fraction']}
    
    Returns:
        Dict con resultados de optimización mejorados (v4.1: incluye soporte EMT)
    """
    
    # Valores por defecto de incertidumbres
    if sigma_psi is None:
        sigma_psi = DEFAULT_SIGMA_PSI
    if sigma_delta is None:
        sigma_delta = DEFAULT_SIGMA_DELTA
    
    logger.info(f"\n{'=' * 60}")
    logger.info(f"OPTIMIZACIÓN PROFESIONAL v4.1 - MSE CompleteEASE + EMT")
    logger.info(f"Parámetros a optimizar: {len(params_to_optimize)}")
    logger.info(f"Ponderación estadística: σ_ψ={sigma_psi}°, σ_Δ={sigma_delta}°")
    
    if spectral_focus_regions:
        logger.info(f"Pesos espectrales: {len(spectral_focus_regions)} regiones enfocadas")
    
    if fraction_groups:
        logger.info(f"🧪 Restricciones EMT: {len(fraction_groups)} grupos de fracciones")
    
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
            spectral_focus_regions=spectral_focus_regions,
            fraction_groups=fraction_groups  # ⭐ NUEVO v4.1
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
            use_parameter_scaling=True,
            fraction_groups=fraction_groups  # ⭐ NUEVO v4.1
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
            use_parameter_scaling=True,
            fraction_groups=fraction_groups  # ⭐ NUEVO v4.1
        )
    
    # Agregar campo de estrategia
    if result.get('success'):
        result['strategy'] = 'simultaneous'
    
    return result

# ============================================================================
# ⭐ NUEVA FUNCIÓN FASE 3: LEVENBERG-MARQUARDT CON VALIDACIÓN FÍSICA
# ============================================================================

def optimize_levenberg_marquardt_enhanced(
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths: np.ndarray,
    optical_model: Dict,
    params_to_optimize: List[Dict],
    calculate_theoretical_func,
    config: Optional['ConvergenceConfig'] = None,
    fraction_groups: Optional[Dict[str, List[str]]] = None
) -> 'OptimizationResult':
    """
    LEVENBERG-MARQUARDT MEJORADO v5.0 con validación física completa
    
    NUEVAS CARACTERÍSTICAS v5.0:
    ✅ Validación de cambios físicos en cada iteración
    ✅ Detección temprana de divergencia
    ✅ Tracking completo de historia de optimización
    ✅ Control adaptativo de damping con factor ρ (rho)
    ✅ Mejor manejo de parámetros no físicos
    ✅ Retorna OptimizationResult estructurado
    
    Args:
        config: Configuración de convergencia (None = usar defaults)
        fraction_groups: Grupos de fracciones EMT
    
    Returns:
        OptimizationResult con toda la información de la optimización
    """
    from .optimizer_states import (
        OptimizationStatus,
        IterationInfo,
        OptimizationHistory,
        BestSolutionTracker,
        ConvergenceConfig,
        OptimizationResult
    )
    from .parameter_validator import ParameterValidator, PhysicalLimits
    
    logger.info("=" * 60)
    logger.info("LEVENBERG-MARQUARDT ENHANCED v5.0 - Validación Física Completa")
    logger.info("=" * 60)
    
    if len(params_to_optimize) == 0:
        logger.warning("⚠️ No hay parámetros para optimizar")
        return OptimizationResult(
            success=False,
            status=OptimizationStatus.DIVERGED_PARAMETERS,
            message="No hay parámetros para optimizar",
            optimization_time=0.0,
            iterations=0,
            optimized_params={},
            initial_params={},
            best_params={},
            initial_metrics={},
            final_metrics={},
            best_metrics={},
            improvement_percentage=0.0,
            history=OptimizationHistory()
        )
    
    start_time = time.time()
    
    # Configuración
    if config is None:
        config = ConvergenceConfig()
    
    # ✅ CORRECCIÓN: Crear PhysicalLimits desde config
    physical_limits = PhysicalLimits(
        thickness_min=0.1,
        thickness_max=10000.0,
        n_min=0.5,
        n_max=10.0,
        k_min=0.0,
        k_max=10.0,
        fraction_min=0.0,
        fraction_max=1.0,
        max_relative_change_per_iter=config.max_relative_change_per_iter,
        max_relative_change_total=2.0
    )
    
    # Inicializar validador con límites físicos
    validator = ParameterValidator(limits=physical_limits)
    
    # Inicializar trackers
    history = OptimizationHistory()
    best_tracker = BestSolutionTracker()
    
    # Parámetros iniciales
    params_names = [p['name'] for p in params_to_optimize]
    initial_params_dict = {p['name']: p['initial_value'] for p in params_to_optimize}
    
    # ✅ CORRECCIÓN: Establecer parámetros iniciales en el validador
    validator.set_initial_params(initial_params_dict)
    
    logger.info(f"🔧 Optimizando {len(params_names)} parámetros")
    logger.info(f"  Parámetros: {params_names}")
    logger.info(f"  Configuración:")
    logger.info(f"    - Max iteraciones: {config.max_iterations}")
    logger.info(f"    - Tolerancia gradiente: {config.gradient_tolerance}")
    logger.info(f"    - Tolerancia parámetros: {config.param_tolerance}")
    logger.info(f"    - Damping inicial: {config.damping_initial}")
    
    if fraction_groups:
        logger.info(f"    - Restricciones EMT: {len(fraction_groups)} grupos")
    
    # Escalado de parámetros
    scales, offsets, _ = scale_parameters(params_to_optimize)
    
    initial_values_physical = np.array([p['initial_value'] for p in params_to_optimize])
    initial_values_scaled = scale_to_normalized(initial_values_physical, scales, offsets)
    
    # Bounds
    bounds_lower_physical = np.array([p['lower_bound'] for p in params_to_optimize])
    bounds_upper_physical = np.array([p['upper_bound'] for p in params_to_optimize])
    
    bounds_lower_scaled = scale_to_normalized(bounds_lower_physical, scales, offsets)
    bounds_upper_scaled = scale_to_normalized(bounds_upper_physical, scales, offsets)
    bounds_scaled = (bounds_lower_scaled, bounds_upper_scaled)
    
    # Calcular métricas iniciales
    psi_theo_initial, delta_theo_initial = calculate_theoretical_func(optical_model, wavelengths)
    
    metrics_initial = calculate_all_metrics(
        psi_exp, psi_theo_initial,
        delta_exp, delta_theo_initial,
        n_params=len(params_names),
        sigma_psi=DEFAULT_SIGMA_PSI,
        sigma_delta=DEFAULT_SIGMA_DELTA
    )
    
    logger.info(f"  MSE inicial: {metrics_initial['mse']:.2f} [{metrics_initial['quality']}]")
    logger.info(f"  χ²ᵣ inicial: {metrics_initial['chi_squared_reduced']:.6f}")
    
    # Inicializar best tracker
    best_tracker.update(
        iteration=0,
        params=initial_params_dict,
        error=metrics_initial['chi_squared'],
        mse=metrics_initial['mse']
    )
    
    # Variables para tracking
    iteration_count = [0]
    last_chi_squared = [metrics_initial['chi_squared']]
    divergence_count = [0]
    previous_params = [initial_params_dict.copy()]
    n_data = len(wavelengths) * 2
    
    # Callback para scipy
    def iteration_callback(xk, state=None):
        """Callback llamado después de cada iteración aceptada"""
        nonlocal last_chi_squared, divergence_count, previous_params
        
        iteration_count[0] += 1
        
        # Convertir a físico
        params_physical = unscale_parameters(xk, scales, offsets)
        params_dict = {params_names[i]: params_physical[i] for i in range(len(params_names))}
        
        # Aplicar al modelo
        updated_model = copy.deepcopy(optical_model)
        updated_model = apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            logger.error(f"❌ Error en iteración {iteration_count[0]}: {str(e)}")
            return True  # Detener optimización
        
        # Calcular métricas
        metrics_iter = calculate_all_metrics(
            psi_exp, psi_theo,
            delta_exp, delta_theo,
            n_params=len(params_names)
        )
        
        # ✅ CORRECCIÓN: Validación completa con parámetros previos
        validation_result = validator.validate_params(
            params=params_dict,
            previous_params=previous_params[0]
        )
        
        if not validation_result.valid:
            logger.error(f"❌ Iteración {iteration_count[0]}: Cambios no físicos detectados")
            for param, violation in validation_result.violations.items():
                logger.error(f"  {param}: {violation}")
            divergence_count[0] += 1
            
            # Si hay 3 violaciones consecutivas, detener
            if divergence_count[0] >= 3:
                logger.error("❌ Demasiadas violaciones consecutivas, deteniendo...")
                return True
        else:
            divergence_count[0] = 0  # Reset contador
            
        # Mostrar warnings si los hay
        if validation_result.warnings:
            for warning in validation_result.warnings:
                logger.warning(f"⚠️ {warning}")
        
        # Detectar divergencia en MSE
        if metrics_iter['chi_squared'] > last_chi_squared[0] * 1.5:
            logger.warning(f"⚠️ Iteración {iteration_count[0]}: χ² aumentó significativamente")
        
        last_chi_squared[0] = metrics_iter['chi_squared']
        previous_params[0] = params_dict.copy()
        
        # Actualizar best tracker
        improved = best_tracker.update(
            iteration=iteration_count[0],
            params=params_dict,
            error=metrics_iter['chi_squared'],
            mse=metrics_iter['mse']
        )
        
        # Crear IterationInfo
        iter_info = IterationInfo(
            iteration=iteration_count[0],
            mse=metrics_iter['mse'],
            chi_squared=metrics_iter['chi_squared'],
            chi_squared_reduced=metrics_iter['chi_squared_reduced'],
            damping=config.damping_initial,  # scipy no expone lambda directamente
            params=params_dict,
            step_accepted=True,
            timestamp=time.time() - start_time
        )
        
        history.add_iteration(iter_info)
        
        # Logging cada 10 iteraciones
        if iteration_count[0] % 10 == 0:
            improvement_symbol = "↓" if improved else "→"
            logger.info(
                f"  Iter {iteration_count[0]:3d}: MSE = {metrics_iter['mse']:7.2f} "
                f"[{metrics_iter['quality']}] {improvement_symbol} "
                f"(best: {best_tracker.best_mse:.2f} @ iter {best_tracker.best_iter})"
            )
        
        # Detener si alcanzamos max_iterations
        if iteration_count[0] >= config.max_iterations:
            logger.warning(f"⚠️ Máximo de iteraciones alcanzado: {config.max_iterations}")
            return True
        
        return False  # Continuar optimización
    
    # Función objetivo
    def objective_function(params_scaled):
        """Función objetivo para least_squares"""
        params_physical = unscale_parameters(params_scaled, scales, offsets)
        params_dict = {params_names[i]: params_physical[i] for i in range(len(params_names))}
        
        updated_model = copy.deepcopy(optical_model)
        updated_model = apply_optimized_params_to_model(params_dict, updated_model, params_to_optimize)
        
        try:
            psi_theo, delta_theo = calculate_theoretical_func(updated_model, wavelengths)
        except Exception as e:
            return np.ones(n_data) * 1e6
        
        residuals_psi, residuals_delta = calculate_weighted_residuals(
            psi_exp, psi_theo, delta_exp, delta_theo,
            DEFAULT_SIGMA_PSI, DEFAULT_SIGMA_DELTA,
            spectral_weights=None,
            use_global_unwrap=True
        )
        
        residuals = np.concatenate([residuals_psi, residuals_delta])
        
        # Penalización por fracciones EMT
        if fraction_groups:
            penalty = calculate_fraction_penalty(params_dict, fraction_groups, penalty_factor=1000.0)
            if penalty > 1e-6:
                residuals = np.concatenate([residuals, [np.sqrt(penalty)]])
        
        return residuals
    
    # EJECUTAR OPTIMIZACIÓN
    try:
        logger.info("🚀 Iniciando optimización...")
        
        result = least_squares(
            objective_function,
            x0=initial_values_scaled,
            bounds=bounds_scaled,
            method='trf',
            ftol=config.abs_err_tolerance,
            xtol=config.param_tolerance,
            max_nfev=config.max_iterations,
            verbose=0,
            # scipy 1.9+ soporta callback
            # callback=iteration_callback  # Descomentar si tienes scipy >= 1.9
        )
        
        # NOTA: Si tu scipy no soporta callback, iteration_callback no se ejecutará
        # En ese caso, solo tendrás la iteración final registrada
        
        optimization_time = time.time() - start_time
        
        # Convertir resultado a físico
        params_optimized_physical = unscale_parameters(result.x, scales, offsets)
        params_dict = {params_names[i]: params_optimized_physical[i] for i in range(len(params_names))}
        
        # ✅ CORRECCIÓN: Usar constrain_to_limits del validador
        params_dict_constrained = validator.constrain_to_limits(params_dict)
        
        # Validación final completa
        validation_final = validator.validate_params(
            params=params_dict_constrained,
            previous_params=previous_params[0]
        )
        
        # Calcular métricas finales
        updated_model_final = copy.deepcopy(optical_model)
        updated_model_final = apply_optimized_params_to_model(
            params_dict_constrained, updated_model_final, params_to_optimize
        )
        psi_theo_final, delta_theo_final = calculate_theoretical_func(updated_model_final, wavelengths)
        
        metrics_final = calculate_all_metrics(
            psi_exp, psi_theo_final,
            delta_exp, delta_theo_final,
            n_params=len(params_names)
        )
        
        # Determinar status de optimización
        if not validation_final.valid:
            status = OptimizationStatus.DIVERGED_PARAMETERS
            success = False
            message = "Parámetros optimizados fuera de rangos físicos"
        elif iteration_count[0] >= config.max_iterations:
            status = OptimizationStatus.MAX_ITERATIONS
            success = True
            message = f"Máximo de iteraciones alcanzado ({config.max_iterations})"
        elif result.success:
            status = OptimizationStatus.CONVERGED_PARAMETERS
            success = True
            message = "Convergencia exitosa"
        else:
            status = OptimizationStatus.DIVERGED_MSE
            success = False
            message = result.message
        
        # Calcular intervalos de confianza
        confidence_intervals = estimate_confidence_intervals(
            result, params_names, n_data,
            use_tikhonov=False, n_tikhonov_terms=0
        )
        
        # Matriz de correlación
        correlation_matrix, high_correlations = calculate_correlation_matrix(
            result, params_names, n_data,
            use_tikhonov=False, n_tikhonov_terms=0
        )
        
        # Mejora
        improvement_percentage = (
            (metrics_initial['mse'] - metrics_final['mse']) / metrics_initial['mse'] * 100
            if metrics_initial['mse'] > 0 else 0.0
        )
        
        # Logging final
        logger.info(f"{'='*60}")
        logger.info(f"✅ Optimización completada en {optimization_time:.2f} s")
        logger.info(f"  Estado: {status}")
        logger.info(f"  Iteraciones: {iteration_count[0]}")
        logger.info(f"  MSE: {metrics_initial['mse']:.2f} → {metrics_final['mse']:.2f} (mejora: {improvement_percentage:.1f}%)")
        logger.info(f"  Mejor MSE encontrado: {best_tracker.best_mse:.2f} @ iter {best_tracker.best_iter}")
        
        if not validation_final.valid:
            logger.warning(f"⚠️ Violaciones detectadas:")
            for param, violation in validation_final.violations.items():
                logger.warning(f"  {param}: {violation}")
        
        if validation_final.warnings:
            logger.info(f"  Advertencias:")
            for warning in validation_final.warnings:
                logger.info(f"    - {warning}")
        
        # Construir OptimizationResult
        return OptimizationResult(
            success=success,
            status=status,
            message=message,
            optimization_time=optimization_time,
            iterations=iteration_count[0],
            optimized_params=params_dict_constrained,
            initial_params=initial_params_dict,
            best_params=best_tracker.best_params,
            initial_metrics=metrics_initial,
            final_metrics=metrics_final,
            best_metrics={
                'mse': best_tracker.best_mse,
                'error': best_tracker.best_error,
                'iteration': best_tracker.best_iter
            },
            improvement_percentage=improvement_percentage,
            history=history,
            confidence_intervals=confidence_intervals,
            correlation_matrix=correlation_matrix.tolist(),
            high_correlations=high_correlations,
            validation_result=validation_final,
            psi_theoretical=psi_theo_final.tolist(),
            delta_theoretical=delta_theo_final.tolist()
        )
        
    except Exception as e:
        logger.error(f"❌ Error en optimización: {str(e)}", exc_info=True)
        
        return OptimizationResult(
            success=False,
            status=OptimizationStatus.MATRIX_SINGULAR,
            message=f"Error: {str(e)}",
            optimization_time=time.time() - start_time,
            iterations=iteration_count[0],
            optimized_params=initial_params_dict,
            initial_params=initial_params_dict,
            best_params=best_tracker.best_params if best_tracker.best_params else initial_params_dict,
            initial_metrics=metrics_initial,
            final_metrics=metrics_initial,
            best_metrics={
                'mse': best_tracker.best_mse,
                'error': best_tracker.best_error,
                'iteration': best_tracker.best_iter
            },
            improvement_percentage=0.0,
            history=history
        )