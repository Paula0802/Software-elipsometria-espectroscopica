# parameter_validator.py (v2.0 - Con validación EMT robusta)

from dataclasses import dataclass
from typing import Dict, Optional, List, Tuple
import numpy as np
from .optimizer_states import ValidationResult


@dataclass
class PhysicalLimits:
    """Límites físicos para validación de parámetros"""
    
    # Límites para espesores (nm)
    thickness_min: float = 0.1
    thickness_max: float = 10000.0
    
    # Límites para índices de refracción
    n_min: float = 0.5
    n_max: float = 10.0
    
    # Límites para coeficientes de extinción
    k_min: float = 0.0
    k_max: float = 10.0
    
    # Límites para fracciones (EMA)
    fraction_min: float = 0.0
    fraction_max: float = 1.0
    
    # Límites para cambios relativos
    max_relative_change_per_iter: float = 0.5  # 50%
    max_relative_change_total: float = 2.0     # 200%
    
    # ← NUEVO: Tolerancia para suma de fracciones EMT
    emt_sum_tolerance: float = 0.01  # ±1% de 1.0


class ParameterValidator:
    """Validador de parámetros físicos durante optimización"""
    
    def __init__(self, limits: Optional[PhysicalLimits] = None):
        self.limits = limits or PhysicalLimits()
        self.initial_params: Dict[str, float] = {}
        self.fraction_groups: Dict[str, List[str]] = {}  # ← NUEVO
    
    def set_initial_params(self, params: Dict[str, float]):
        """Guarda parámetros iniciales para validar cambios totales"""
        self.initial_params = params.copy()
    
    def set_fraction_groups(self, groups: Dict[str, List[str]]):  # ← NUEVO
        """
        Define grupos de fracciones EMT que deben sumar 1.0
        
        Args:
            groups: Dict donde key=nombre_grupo, value=lista de nombres de parámetros
                   Ejemplo: {'layer1': ['f_layer1_Si', 'f_layer1_void']}
        """
        self.fraction_groups = groups
    
    def validate_params(self, params: Dict[str, float], 
                       previous_params: Optional[Dict[str, float]] = None,
                       enforce_emt: bool = True) -> ValidationResult:  # ← NUEVO arg
        """
        Valida parámetros físicamente
        
        Args:
            params: Parámetros a validar
            previous_params: Parámetros de iteración anterior (para validar cambios)
            enforce_emt: Si True, valida estrictamente suma de fracciones EMT
        
        Returns:
            ValidationResult con resultado de validación
        """
        result = ValidationResult(valid=True)
        
        # Validar cada parámetro
        for name, value in params.items():
            # Determinar tipo de parámetro
            param_type = self._classify_parameter(name)
            
            # Validar límites absolutos
            self._validate_absolute_limits(name, value, param_type, result)
            
            # Validar cambios si hay parámetros previos
            if previous_params and name in previous_params:
                self._validate_iteration_change(
                    name, value, previous_params[name], param_type, result
                )
            
            # Validar cambio total desde inicio
            if name in self.initial_params:
                self._validate_total_change(
                    name, value, self.initial_params[name], param_type, result
                )
        
        # Validar restricciones entre parámetros
        self._validate_cross_parameter_constraints(params, result)
        
        # ← NUEVO: Validar fracciones EMT si hay grupos definidos
        if self.fraction_groups and enforce_emt:
            self._validate_emt_fractions(params, result)
        
        return result
    
    def _classify_parameter(self, param_name: str) -> str:
        """Clasifica tipo de parámetro por su nombre"""
        name_lower = param_name.lower()
        
        if 'thickness' in name_lower or 'd_' in name_lower:
            return 'thickness'
        elif param_name.startswith('n_') or '_n_' in param_name:
            return 'n'
        elif param_name.startswith('k_') or '_k_' in param_name:
            return 'k'
        elif 'fraction' in name_lower or 'f_' in param_name:
            return 'fraction'
        else:
            return 'unknown'
    
    def _validate_absolute_limits(self, name: str, value: float, 
                                  param_type: str, result: ValidationResult):
        """Valida límites absolutos del parámetro"""
        
        limits_map = {
            'thickness': (self.limits.thickness_min, self.limits.thickness_max),
            'n': (self.limits.n_min, self.limits.n_max),
            'k': (self.limits.k_min, self.limits.k_max),
            'fraction': (self.limits.fraction_min, self.limits.fraction_max),
        }
        
        if param_type in limits_map:
            min_val, max_val = limits_map[param_type]
            
            if value < min_val:
                result.add_violation(name, 'below_minimum', {
                    'value': value,
                    'minimum': min_val,
                    'type': param_type
                })
            elif value > max_val:
                result.add_violation(name, 'above_maximum', {
                    'value': value,
                    'maximum': max_val,
                    'type': param_type
                })
            
            # Advertencias para valores en los extremos
            range_size = max_val - min_val
            if value < min_val + 0.1 * range_size:
                result.add_warning(
                    f"{name} = {value:.4f} está muy cerca del límite inferior ({min_val})"
                )
            elif value > max_val - 0.1 * range_size:
                result.add_warning(
                    f"{name} = {value:.4f} está muy cerca del límite superior ({max_val})"
                )
    
    def _validate_iteration_change(self, name: str, current: float, 
                                   previous: float, param_type: str, 
                                   result: ValidationResult):
        """Valida que cambio por iteración no sea excesivo"""
        
        if abs(previous) < 1e-10:
            return  # No validar si valor previo ~0
        
        relative_change = abs((current - previous) / previous)
        
        if relative_change > self.limits.max_relative_change_per_iter:
            result.add_violation(name, 'excessive_iteration_change', {
                'previous': previous,
                'current': current,
                'relative_change': relative_change,
                'max_allowed': self.limits.max_relative_change_per_iter,
                'type': param_type
            })
    
    def _validate_total_change(self, name: str, current: float, 
                              initial: float, param_type: str, 
                              result: ValidationResult):
        """Valida cambio total desde parámetros iniciales"""
        
        if abs(initial) < 1e-10:
            return
        
        relative_change = abs((current - initial) / initial)
        
        # Límites específicos por tipo
        max_change_map = {
            'thickness': 2.0,   # 200%
            'n': 0.5,          # 50%
            'k': 1.0,          # 100%
            'fraction': 0.3,   # 30%
            'unknown': 1.5     # 150%
        }
        
        max_allowed = max_change_map.get(param_type, self.limits.max_relative_change_total)
        
        if relative_change > max_allowed:
            result.add_warning(
                f"{name}: cambio total {relative_change*100:.1f}% "
                f"excede {max_allowed*100:.1f}% recomendado "
                f"(inicial={initial:.4f}, actual={current:.4f})"
            )
    
    def _validate_cross_parameter_constraints(self, params: Dict[str, float], 
                                             result: ValidationResult):
        """Valida restricciones entre parámetros"""
        
        # Validar que suma de fracciones EMA = 1 (detección automática)
        # Nota: Esta es validación "legacy", ahora usamos _validate_emt_fractions
        fraction_params = {k: v for k, v in params.items() 
                          if 'fraction' in k.lower() or k.startswith('f_')}
        
        if fraction_params and not self.fraction_groups:
            # Solo si no hay grupos explícitos definidos
            # Agrupar por capa
            layer_fractions: Dict[str, List[Tuple[str, float]]] = {}
            
            for name, value in fraction_params.items():
                # Extraer identificador de capa
                parts = name.split('_')
                if len(parts) >= 2:
                    layer_id = parts[1]  # ej: "f_layer1_void" -> "layer1"
                    if layer_id not in layer_fractions:
                        layer_fractions[layer_id] = []
                    layer_fractions[layer_id].append((name, value))
            
            # Validar cada capa
            for layer_id, fractions in layer_fractions.items():
                total = sum(f[1] for f in fractions)
                
                if abs(total - 1.0) > 0.01:  # Tolerancia 1%
                    result.add_warning(
                        f"Capa {layer_id}: suma de fracciones = {total:.4f}, "
                        f"debería ser 1.0"
                    )
        
        # Validar relación n-k (k << n generalmente)
        n_params = {k: v for k, v in params.items() if k.startswith('n_')}
        k_params = {k: v for k, v in params.items() if k.startswith('k_')}
        
        for n_name, n_val in n_params.items():
            # Buscar k correspondiente
            k_name = n_name.replace('n_', 'k_')
            if k_name in k_params:
                k_val = k_params[k_name]
                
                # Advertir si k > n (muy raro)
                if k_val > n_val:
                    result.add_warning(
                        f"{k_name} = {k_val:.4f} > {n_name} = {n_val:.4f} "
                        f"(inusual: extinción > índice)"
                    )
    
    def _validate_emt_fractions(self, params: Dict[str, float],   # ← NUEVO
                               result: ValidationResult):
        """
        Valida que fracciones EMT sumen correctamente a 1.0
        
        Usa grupos definidos en self.fraction_groups
        """
        for group_name, param_names in self.fraction_groups.items():
            # Extraer valores actuales
            fractions = {}
            for pname in param_names:
                if pname in params:
                    fractions[pname] = params[pname]
                else:
                    result.add_warning(
                        f"Grupo EMT '{group_name}': parámetro '{pname}' no encontrado"
                    )
            
            if not fractions:
                continue
            
            # Calcular suma
            total = sum(fractions.values())
            
            # Validar suma
            error = abs(total - 1.0)
            
            details = {
                'group': group_name,
                'fractions': fractions,
                'sum': total,
                'error': error,
                'tolerance': self.limits.emt_sum_tolerance
            }
            
            if error > self.limits.emt_sum_tolerance:
                # Violación crítica
                result.add_emt_violation(group_name, details)
                result.add_warning(
                    f"EMT '{group_name}': suma = {total:.6f}, "
                    f"error = {error:.6f} > tolerancia ({self.limits.emt_sum_tolerance})"
                )
            elif error > self.limits.emt_sum_tolerance * 0.5:
                # Advertencia (cerca del límite)
                result.add_warning(
                    f"EMT '{group_name}': suma = {total:.6f} "
                    f"(cerca del límite de tolerancia)"
                )
    
    def normalize_emt_fractions(self, params: Dict[str, float]) -> Dict[str, float]:  # ← NUEVO
        """
        Normaliza fracciones EMT para que sumen exactamente 1.0
        
        Args:
            params: Parámetros a normalizar
            
        Returns:
            Parámetros con fracciones normalizadas
        """
        normalized = params.copy()
        
        for group_name, param_names in self.fraction_groups.items():
            # Extraer fracciones del grupo
            group_values = {}
            for pname in param_names:
                if pname in normalized:
                    group_values[pname] = normalized[pname]
            
            if not group_values:
                continue
            
            # Calcular suma actual
            total = sum(group_values.values())
            
            # Normalizar si suma != 1.0
            if abs(total - 1.0) > 1e-10:
                for pname in group_values:
                    normalized[pname] = group_values[pname] / total
        
        return normalized
    
    def constrain_to_limits(self, params: Dict[str, float]) -> Dict[str, float]:
        """
        Fuerza parámetros a estar dentro de límites físicos
        
        Returns:
            Parámetros corregidos
        """
        constrained = {}
        
        for name, value in params.items():
            param_type = self._classify_parameter(name)
            
            # Aplicar límites según tipo
            if param_type == 'thickness':
                constrained[name] = np.clip(
                    value, 
                    self.limits.thickness_min, 
                    self.limits.thickness_max
                )
            elif param_type == 'n':
                constrained[name] = np.clip(
                    value, 
                    self.limits.n_min, 
                    self.limits.n_max
                )
            elif param_type == 'k':
                constrained[name] = np.clip(
                    value, 
                    self.limits.k_min, 
                    self.limits.k_max
                )
            elif param_type == 'fraction':
                constrained[name] = np.clip(
                    value, 
                    self.limits.fraction_min, 
                    self.limits.fraction_max
                )
            else:
                constrained[name] = value
        
        return constrained
    
    def constrain_and_normalize(self, params: Dict[str, float]) -> Dict[str, float]:  # ← NUEVO
        """
        Aplica límites físicos Y normaliza fracciones EMT
        
        Orden:
        1. Clip a límites físicos
        2. Normalizar fracciones EMT
        
        Returns:
            Parámetros corregidos y normalizados
        """
        # Primero aplicar límites
        constrained = self.constrain_to_limits(params)
        
        # Luego normalizar fracciones
        normalized = self.normalize_emt_fractions(constrained)
        
        return normalized