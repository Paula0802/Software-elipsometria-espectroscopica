# optimizer_states.py (v2.0 - Con soporte Simplex)

from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import numpy as np

class OptimizationStatus(Enum):
    """Estados posibles de la optimización"""
    STARTED = 0
    CONVERGED_GRADIENT = 1
    CONVERGED_PARAMETERS = 2
    CONVERGED_ERROR_ABSOLUTE = 3
    CONVERGED_ERROR_RELATIVE = 4
    CONVERGED_MSE = 5  # ← NUEVO: Convergencia por MSE (Simplex)
    MAX_ITERATIONS = 6
    STAGNATION = 7  # ← NUEVO: Estancamiento detectado (Simplex)
    DIVERGED_PARAMETERS = -1
    DIVERGED_MSE = -2
    MATRIX_SINGULAR = -3
    USER_INTERRUPTED = -4
    SIMPLEX_COLLAPSED = -5  # ← NUEVO: Simplex colapsó
    
    def is_success(self) -> bool:
        """Retorna True si la optimización fue exitosa"""
        return self.value > 0
    
    def __str__(self) -> str:
        messages = {
            self.STARTED: "Optimización iniciada",
            self.CONVERGED_GRADIENT: "✓ Convergencia: gradiente < tolerancia",
            self.CONVERGED_PARAMETERS: "✓ Convergencia: cambio en parámetros < tolerancia",
            self.CONVERGED_ERROR_ABSOLUTE: "✓ Convergencia: error absoluto < tolerancia",
            self.CONVERGED_ERROR_RELATIVE: "✓ Convergencia: error relativo < tolerancia",
            self.CONVERGED_MSE: "✓ Convergencia: MSE < tolerancia",  # ← NUEVO
            self.MAX_ITERATIONS: "⚠ Máximo de iteraciones alcanzado",
            self.STAGNATION: "⚠ Estancamiento detectado",  # ← NUEVO
            self.DIVERGED_PARAMETERS: "✗ Divergencia: parámetros no físicos detectados",
            self.DIVERGED_MSE: "✗ Divergencia: MSE aumentando",
            self.MATRIX_SINGULAR: "✗ Error: matriz singular (mal condicionada)",
            self.USER_INTERRUPTED: "⚠ Interrumpido por usuario",
            self.SIMPLEX_COLLAPSED: "✗ Error: simplex colapsó (dimensión degenerada)",  # ← NUEVO
        }
        return messages[self]


@dataclass
class IterationInfo:
    """Información de una iteración individual"""
    iteration: int
    mse: float
    chi_squared: float
    chi_squared_reduced: float
    damping: float
    rho: Optional[float] = None  # Gain ratio (solo LM)
    gradient_norm: Optional[float] = None
    max_param_change: float = 0.0
    step_accepted: bool = True
    timestamp: float = 0.0
    
    # Parámetros en esta iteración
    params: Optional[Dict[str, float]] = None
    
    # ← NUEVO: Métricas específicas de Simplex
    simplex_size: Optional[float] = None  # Tamaño del simplex
    function_evals: Optional[int] = None  # Evaluaciones de función


@dataclass
class OptimizationHistory:
    """Historia completa de la optimización"""
    iterations: List[IterationInfo] = field(default_factory=list)
    
    # Métricas por iteración (para plotting rápido)
    mse_history: List[float] = field(default_factory=list)
    chi_squared_history: List[float] = field(default_factory=list)
    damping_history: List[float] = field(default_factory=list)
    rho_history: List[float] = field(default_factory=list)
    gradient_norm_history: List[float] = field(default_factory=list)
    
    # ← NUEVO: Métricas Simplex
    simplex_size_history: List[float] = field(default_factory=list)
    
    # Tracking de aceptación/rechazo
    accepted_steps: int = 0
    rejected_steps: int = 0
    
    # ← NUEVO: Tracking de restarts (Simplex)
    restart_iterations: List[int] = field(default_factory=list)
    total_restarts: int = 0
    
    def add_iteration(self, info: IterationInfo):
        """Agrega una iteración a la historia"""
        self.iterations.append(info)
        self.mse_history.append(info.mse)
        self.chi_squared_history.append(info.chi_squared)
        self.damping_history.append(info.damping)
        
        if info.rho is not None:
            self.rho_history.append(info.rho)
        if info.gradient_norm is not None:
            self.gradient_norm_history.append(info.gradient_norm)
        if info.simplex_size is not None:  # ← NUEVO
            self.simplex_size_history.append(info.simplex_size)
        
        if info.step_accepted:
            self.accepted_steps += 1
        else:
            self.rejected_steps += 1
    
    def add_restart(self, iteration: int):  # ← NUEVO
        """Registra un restart del simplex"""
        self.restart_iterations.append(iteration)
        self.total_restarts += 1
    
    def get_best_iteration(self) -> Optional[IterationInfo]:
        """Retorna la iteración con menor MSE"""
        if not self.iterations:
            return None
        return min(self.iterations, key=lambda x: x.mse)
    
    def detect_stagnation(self, window: int = 10) -> bool:  # ← NUEVO
        """
        Detecta estancamiento mirando ventana reciente de MSE
        
        Args:
            window: Tamaño de ventana a analizar
            
        Returns:
            True si MSE no mejoró significativamente
        """
        if len(self.mse_history) < window:
            return False
        
        recent = self.mse_history[-window:]
        improvement = (max(recent) - min(recent)) / max(recent)
        
        return improvement < 0.001  # < 0.1% mejora
    
    def to_dict(self) -> Dict:
        """Convierte historia a diccionario para JSON"""
        return {
            'mse_history': self.mse_history,
            'chi_squared_history': self.chi_squared_history,
            'damping_history': self.damping_history,
            'rho_history': self.rho_history,
            'gradient_norm_history': self.gradient_norm_history,
            'simplex_size_history': self.simplex_size_history,  # ← NUEVO
            'accepted_steps': self.accepted_steps,
            'rejected_steps': self.rejected_steps,
            'restart_iterations': self.restart_iterations,  # ← NUEVO
            'total_restarts': self.total_restarts,  # ← NUEVO
            'best_iteration': {
                'iteration': self.get_best_iteration().iteration,
                'mse': self.get_best_iteration().mse
            } if self.get_best_iteration() else None
        }


@dataclass
class BestSolutionTracker:
    """Mantiene registro de la mejor solución encontrada"""
    best_params: Dict[str, float] = field(default_factory=dict)
    best_error: float = float('inf')
    best_mse: float = float('inf')
    best_iter: int = 0
    improvements: int = 0
    
    def update(self, iteration: int, params: Dict[str, float], 
               error: float, mse: float) -> bool:
        """
        Actualiza si encontró mejor solución
        
        Returns:
            True si hubo mejora
        """
        if mse < self.best_mse:
            self.best_params = params.copy()
            self.best_error = error
            self.best_mse = mse
            self.best_iter = iteration
            self.improvements += 1
            return True
        return False
    
    def get_best(self) -> Dict:
        """Retorna mejor solución encontrada"""
        return {
            'params': self.best_params,
            'error': self.best_error,
            'mse': self.best_mse,
            'iteration': self.best_iter
        }


@dataclass
class ValidationResult:
    """Resultado de validación física de parámetros"""
    valid: bool
    violations: Dict[str, Dict] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    
    # ← NUEVO: Tracking específico de fracciones EMT
    emt_validation: Optional[Dict[str, Dict]] = None
    
    def add_violation(self, param_name: str, violation_type: str, 
                     details: Dict):
        """Agrega una violación detectada"""
        self.valid = False
        self.violations[param_name] = {
            'type': violation_type,
            **details
        }
    
    def add_warning(self, message: str):
        """Agrega una advertencia (no bloquea optimización)"""
        self.warnings.append(message)
    
    def add_emt_violation(self, group_name: str, details: Dict):  # ← NUEVO
        """Agrega violación de restricción EMT"""
        if self.emt_validation is None:
            self.emt_validation = {}
        
        self.emt_validation[group_name] = details
        
        # Si suma no es ~1.0, es violación crítica
        if abs(details.get('sum', 1.0) - 1.0) > 0.05:  # >5% error
            self.valid = False
    
    def to_dict(self) -> Dict:
        """Convierte a diccionario para JSON"""
        return {
            'valid': self.valid,
            'violations': self.violations,
            'warnings': self.warnings,
            'emt_validation': self.emt_validation  # ← NUEVO
        }


@dataclass
class ConvergenceConfig:
    """Configuración de criterios de convergencia"""
    # Tolerancias
    abs_err_tolerance: float = 1e-8
    rel_err_tolerance: float = 1e-5
    gradient_tolerance: float = 1e-3
    param_tolerance: float = 1e-3
    mse_tolerance: float = 1e-6  # ← NUEVO: Para Simplex
    
    # Iteraciones
    max_iterations: int = 200
    min_iterations: int = 5  # Mínimo antes de checkear convergencia
    
    # Damping (Levenberg-Marquardt)
    damping_initial: float = 1e-3
    damping_min: float = 1e-7
    damping_max: float = 1e7
    damping_accept_threshold: float = 0.1  # Threshold para ρ
    damping_increase_factor: float = 11.0
    damping_decrease_factor: float = 9.0
    
    # ← NUEVO: Configuración Simplex
    simplex_adaptive: bool = True  # Usar parámetros adaptativos
    max_stagnant_iterations: int = 15  # Iteraciones sin mejora → estancamiento
    simplex_restart_threshold: int = 20  # MSE estancado → restart
    max_restarts: int = 3  # Máximo de restarts permitidos
    simplex_initial_step: float = 0.05  # Paso inicial (5% de valor)
    simplex_collapse_threshold: float = 1e-8  # Tamaño mínimo antes de colapso
    
    # Validación física
    max_relative_change_per_iter: float = 0.5  # 50% máximo por iteración
    max_relative_change_total: Dict[str, float] = field(default_factory=lambda: {
        'thickness': 2.0,      # 200% máximo total
        'n': 0.5,              # 50% para índices
        'k': 1.0,              # 100% para extinción
        'fraction': 0.3,       # 30% para fracciones
        'default': 1.5         # 150% para otros
    })
    
    # ← NUEVO: Tolerancia para validación EMT
    emt_sum_tolerance: float = 0.01  # Suma fracciones debe estar en [0.99, 1.01]


@dataclass
class OptimizationResult:
    """Resultado completo de optimización"""
    success: bool
    status: OptimizationStatus
    message: str
    
    # Tiempos
    optimization_time: float
    iterations: int
    
    # Parámetros
    optimized_params: Dict[str, float]
    initial_params: Dict[str, float]
    best_params: Dict[str, float]  # Puede diferir de optimized si hubo overshoot
    
    # Métricas
    initial_metrics: Dict
    final_metrics: Dict
    best_metrics: Dict  # Métricas en best_iter
    
    # Mejora
    improvement_percentage: float
    
    # Historia
    history: OptimizationHistory
    
    # Diagnóstico
    confidence_intervals: Optional[Dict] = None
    correlation_matrix: Optional[List[List[float]]] = None
    high_correlations: Optional[List] = None
    validation_result: Optional[ValidationResult] = None
    
    # ← NUEVO: Información de restarts (Simplex)
    total_restarts: int = 0
    restart_iterations: List[int] = field(default_factory=list)
    
    # Datos teóricos finales
    psi_theoretical: List[float] = field(default_factory=list)
    delta_theoretical: List[float] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        """Convierte resultado a diccionario para JSON"""
        return {
            'success': self.success,
            'status': str(self.status),
            'message': self.message,
            'optimization_time': self.optimization_time,
            'iterations': self.iterations,
            'optimized_params': self.optimized_params,
            'initial_params': self.initial_params,
            'best_params': self.best_params,
            'initial_metrics': self.initial_metrics,
            'final_metrics': self.final_metrics,
            'best_metrics': self.best_metrics,
            'improvement_percentage': self.improvement_percentage,
            'history': self.history.to_dict(),
            'confidence_intervals': self.confidence_intervals,
            'validation_result': self.validation_result.to_dict() if self.validation_result else None,
            'total_restarts': self.total_restarts,  # ← NUEVO
            'restart_iterations': self.restart_iterations,  # ← NUEVO
            'psi_theoretical': self.psi_theoretical,
            'delta_theoretical': self.delta_theoretical,
        }