# parameter_validator.py

import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import logging

from optimizer_states import ValidationResult, ConvergenceConfig

logger = logging.getLogger(__name__)


@dataclass
class PhysicalLimits:
    """Límites físicos para parámetros de elipsometría"""
    
    # Espesores (nm)
    thickness_min: float = 0.1
    thickness_max: float = 10000.0
    
    # Índice de refracción real
    n_min: float = 0.5
    n_max: float = 10.0
    
    # Coeficiente de extinción
    k_min: float = 0.0
    k_max: float = 15.0
    
    # Fracciones volumétricas
    fraction_min: float = 0.0
    fraction_max: float = 1.0
    
    # Roughness (nm)
    roughness_min: float = 0.0
    roughness_max: float = 100.0
    
    # MSE aceptable (según CompleteEASE)
    mse_excellent: float = 1.0
    mse_good: float = 5.0
    mse_acceptable: float = 20.0
    mse_poor: float = 50.0


class ParameterValidator:
    """Validador de parámetros físicos para optimización"""
    
    def __init__(self, 
                 config: Optional[ConvergenceConfig] = None,
                 physical_limits: Optional[PhysicalLimits] = None):
        """
        Args:
            config: Configuración de convergencia con límites de cambio
            physical_limits: Límites físicos absolutos para parámetros
        """
        self.config = config or ConvergenceConfig()
        self.limits = physical_limits or PhysicalLimits()
    
    def validate_parameter_changes(
        self,
        initial_params: Dict[str, float],
        current_params: Dict[str, float],
        iteration: int = 0
    ) -> ValidationResult:
        """
        Valida que los cambios en parámetros sean físicamente razonables
        
        Args:
            initial_params: Parámetros iniciales
            current_params: Parámetros actuales
            iteration: Número de iteración actual
            
        Returns:
            ValidationResult con violaciones detectadas
        """
        result = ValidationResult(valid=True)
        
        for param_name, current_value in current_params.items():
            if param_name not in initial_params:
                continue
            
            initial_value = initial_params[param_name]
            
            # Calcular cambio relativo
            if abs(initial_value) > 1e-10:
                relative_change = abs(current_value - initial_value) / abs(initial_value)
            else:
                relative_change = abs(current_value)
            
            # Determinar límite para este tipo de parámetro
            param_type = self._get_parameter_type(param_name)
            max_change = self.config.max_relative_change_total.get(
                param_type,
                self.config.max_relative_change_total['default']
            )
            
            # Verificar cambio excesivo
            if relative_change > max_change:
                result.add_violation(
                    param_name=param_name,
                    violation_type='excessive_change',
                    details={
                        'initial_value': float(initial_value),
                        'current_value': float(current_value),
                        'relative_change': float(relative_change),
                        'max_allowed': float(max_change),
                        'change_percentage': float(relative_change * 100),
                        'iteration': iteration
                    }
                )
                logger.warning(
                    f"⚠️ {param_name}: cambio de {relative_change*100:.1f}% "
                    f"excede límite de {max_change*100:.1f}%"
                )
            
            # Advertencia si el cambio es grande pero no crítico
            elif relative_change > max_change * 0.7:
                result.add_warning(
                    f"{param_name}: cambio de {relative_change*100:.1f}% "
                    f"se acerca al límite ({max_change*100:.1f}%)"
                )
        
        return result
    
    def validate_absolute_values(
        self,
        params: Dict[str, float]
    ) -> ValidationResult:
        """
        Valida que los valores absolutos estén en rangos físicos
        
        Args:
            params: Diccionario de parámetros
            
        Returns:
            ValidationResult con violaciones detectadas
        """
        result = ValidationResult(valid=True)
        
        for param_name, value in params.items():
            param_type = self._get_parameter_type(param_name)
            
            # Obtener límites según tipo
            if param_type == 'thickness':
                min_val, max_val = self.limits.thickness_min, self.limits.thickness_max
            elif param_type == 'n':
                min_val, max_val = self.limits.n_min, self.limits.n_max
            elif param_type == 'k':
                min_val, max_val = self.limits.k_min, self.limits.k_max
            elif param_type == 'fraction':
                min_val, max_val = self.limits.fraction_min, self.limits.fraction_max
            elif param_type == 'roughness':
                min_val, max_val = self.limits.roughness_min, self.limits.roughness_max
            else:
                continue  # Parámetro desconocido, no validar
            
            # Verificar fuera de rango
            if value < min_val or value > max_val:
                result.add_violation(
                    param_name=param_name,
                    violation_type='out_of_physical_range',
                    details={
                        'value': float(value),
                        'min_allowed': float(min_val),
                        'max_allowed': float(max_val),
                        'parameter_type': param_type
                    }
                )
                logger.error(
                    f"✗ {param_name} = {value:.3f} fuera de rango físico "
                    f"[{min_val}, {max_val}]"
                )
        
        return result
    
    def validate_volume_fractions(
        self,
        params: Dict[str, float],
        tolerance: float = 0.02
    ) -> ValidationResult:
        """
        Valida que las fracciones volumétricas sumen ~1.0
        
        Args:
            params: Diccionario de parámetros
            tolerance: Tolerancia para suma (default 2%)
            
        Returns:
            ValidationResult
        """
        result = ValidationResult(valid=True)
        
        # Buscar todas las fracciones volumétricas
        fractions = {
            name: value 
            for name, value in params.items() 
            if 'fraction' in name.lower() or 'fvol' in name.lower()
        }
        
        if not fractions:
            return result  # No hay fracciones que validar
        
        total = sum(fractions.values())
        
        if abs(total - 1.0) > tolerance:
            result.add_violation(
                param_name='volume_fractions',
                violation_type='sum_constraint_violation',
                details={
                    'fractions': {k: float(v) for k, v in fractions.items()},
                    'sum': float(total),
                    'expected': 1.0,
                    'tolerance': tolerance,
                    'deviation': float(abs(total - 1.0))
                }
            )
            logger.warning(
                f"⚠️ Suma de fracciones = {total:.4f}, esperado = 1.0 ± {tolerance}"
            )
        
        return result
    
    def check_mse_quality(
        self,
        mse: float
    ) -> Tuple[str, bool]:
        """
        Evalúa la calidad del ajuste según MSE
        
        Args:
            mse: Mean Squared Error
            
        Returns:
            (categoria, es_aceptable)
            categorias: 'excellent', 'good', 'acceptable', 'poor', 'unacceptable'
        """
        if mse < self.limits.mse_excellent:
            return 'excellent', True
        elif mse < self.limits.mse_good:
            return 'good', True
        elif mse < self.limits.mse_acceptable:
            return 'acceptable', True
        elif mse < self.limits.mse_poor:
            return 'poor', False
        else:
            return 'unacceptable', False
    
    def calculate_gain_ratio(
        self,
        chi_squared_old: float,
        chi_squared_new: float,
        predicted_reduction: float
    ) -> float:
        """
        Calcula el gain ratio ρ (rho) para Levenberg-Marquardt
        
        ρ = (χ²_old - χ²_new) / predicted_reduction
        
        Si ρ > 0.75: excelente, disminuir λ agresivamente
        Si 0.25 < ρ < 0.75: bueno, disminuir λ moderadamente  
        Si ρ < 0.25: malo, aumentar λ
        Si ρ < 0: rechazar paso
        
        Args:
            chi_squared_old: χ² antes del paso
            chi_squared_new: χ² después del paso
            predicted_reduction: Reducción predicha por modelo lineal
            
        Returns:
            ρ (gain ratio)
        """
        actual_reduction = chi_squared_old - chi_squared_new
        
        if abs(predicted_reduction) < 1e-15:
            return 0.0
        
        rho = actual_reduction / predicted_reduction
        
        return rho
    
    def _get_parameter_type(self, param_name: str) -> str:
        """
        Determina el tipo de parámetro a partir de su nombre
        
        Args:
            param_name: Nombre del parámetro
            
        Returns:
            Tipo: 'thickness', 'n', 'k', 'fraction', 'roughness', 'unknown'
        """
        name_lower = param_name.lower()
        
        if 'thickness' in name_lower or 'd_' in name_lower:
            return 'thickness'
        elif 'fraction' in name_lower or 'fvol' in name_lower or 'f_' in name_lower:
            return 'fraction'
        elif 'roughness' in name_lower or 'rough' in name_lower:
            return 'roughness'
        elif name_lower.startswith('n') or '_n' in name_lower:
            return 'n'
        elif name_lower.startswith('k') or '_k' in name_lower:
            return 'k'
        else:
            return 'unknown'
    
    def validate_correlation_matrix(
        self,
        correlation_matrix: np.ndarray,
        param_names: List[str],
        threshold: float = 0.95
    ) -> ValidationResult:
        """
        Detecta parámetros altamente correlacionados
        
        Args:
            correlation_matrix: Matriz de correlación NxN
            param_names: Nombres de parámetros
            threshold: Umbral de correlación (default 0.95)
            
        Returns:
            ValidationResult con advertencias de correlaciones altas
        """
        result = ValidationResult(valid=True)
        
        n = len(param_names)
        
        for i in range(n):
            for j in range(i + 1, n):
                corr = abs(correlation_matrix[i, j])
                
                if corr > threshold:
                    result.add_warning(
                        f"Alta correlación ({corr:.3f}) entre "
                        f"'{param_names[i]}' y '{param_names[j]}'"
                    )
        
        return result


# Funciones de utilidad
def generate_validation_report(
    validation_results: List[ValidationResult]
) -> Dict:
    """
    Genera un reporte consolidado de múltiples validaciones
    
    Args:
        validation_results: Lista de ValidationResult
        
    Returns:
        Diccionario con reporte consolidado
    """
    all_violations = {}
    all_warnings = []
    overall_valid = True
    
    for result in validation_results:
        if not result.valid:
            overall_valid = False
        
        all_violations.update(result.violations)
        all_warnings.extend(result.warnings)
    
    return {
        'valid': overall_valid,
        'total_violations': len(all_violations),
        'total_warnings': len(all_warnings),
        'violations': all_violations,
        'warnings': all_warnings
    }