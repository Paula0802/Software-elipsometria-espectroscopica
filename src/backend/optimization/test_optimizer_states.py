# test_optimizer_states.py

import pytest
import numpy as np
from .optimizer_states import (
    OptimizationStatus,
    IterationInfo,
    OptimizationHistory,
    BestSolutionTracker,
    ValidationResult,
    ConvergenceConfig,
    OptimizationResult
)


class TestOptimizationStatus:
    """Tests para OptimizationStatus"""
    
    def test_is_success(self):
        """Verifica que is_success funciona correctamente"""
        # Estados exitosos
        assert OptimizationStatus.CONVERGED_GRADIENT.is_success()
        assert OptimizationStatus.CONVERGED_PARAMETERS.is_success()
        assert OptimizationStatus.CONVERGED_ERROR_ABSOLUTE.is_success()
        
        # Estados no exitosos
        assert not OptimizationStatus.DIVERGED_PARAMETERS.is_success()
        assert not OptimizationStatus.DIVERGED_MSE.is_success()
        assert not OptimizationStatus.MATRIX_SINGULAR.is_success()
    
    def test_str_representation(self):
        """Verifica que los mensajes se generan correctamente"""
        msg = str(OptimizationStatus.CONVERGED_GRADIENT)
        assert "gradiente" in msg.lower()
        assert "✓" in msg or "√" in msg or "convergencia" in msg.lower()


class TestIterationInfo:
    """Tests para IterationInfo"""
    
    def test_creation(self):
        """Verifica creación básica"""
        info = IterationInfo(
            iteration=5,
            mse=0.001,
            chi_squared=10.5,
            chi_squared_reduced=1.05,
            damping=0.1
        )
        
        assert info.iteration == 5
        assert info.mse == 0.001
        assert info.chi_squared == 10.5
        assert info.damping == 0.1
        assert info.step_accepted  # Default True
    
    def test_optional_fields(self):
        """Verifica campos opcionales"""
        info = IterationInfo(
            iteration=1,
            mse=0.5,
            chi_squared=5.0,
            chi_squared_reduced=0.5,
            damping=0.01,
            rho=0.8,
            gradient_norm=0.001,
            params={'thickness': 100.0}
        )
        
        assert info.rho == 0.8
        assert info.gradient_norm == 0.001
        assert info.params['thickness'] == 100.0


class TestOptimizationHistory:
    """Tests para OptimizationHistory"""
    
    def test_add_iteration(self):
        """Verifica que se agregan iteraciones correctamente"""
        history = OptimizationHistory()
        
        info1 = IterationInfo(
            iteration=1,
            mse=0.5,
            chi_squared=5.0,
            chi_squared_reduced=0.5,
            damping=0.01,
            rho=0.8,
            gradient_norm=0.001
        )
        
        history.add_iteration(info1)
        
        assert len(history.iterations) == 1
        assert len(history.mse_history) == 1
        assert history.mse_history[0] == 0.5
        assert history.accepted_steps == 1
        assert history.rejected_steps == 0
    
    def test_rejected_steps(self):
        """Verifica conteo de pasos rechazados"""
        history = OptimizationHistory()
        
        info = IterationInfo(
            iteration=1,
            mse=0.5,
            chi_squared=5.0,
            chi_squared_reduced=0.5,
            damping=0.01,
            step_accepted=False
        )
        
        history.add_iteration(info)
        
        assert history.accepted_steps == 0
        assert history.rejected_steps == 1
    
    def test_get_best_iteration(self):
        """Verifica que encuentra la mejor iteración"""
        history = OptimizationHistory()
        
        # Agregar varias iteraciones
        for i, mse in enumerate([0.5, 0.3, 0.7, 0.2, 0.4]):
            info = IterationInfo(
                iteration=i,
                mse=mse,
                chi_squared=mse*10,
                chi_squared_reduced=mse,
                damping=0.01
            )
            history.add_iteration(info)
        
        best = history.get_best_iteration()
        assert best.iteration == 3  # MSE = 0.2
        assert best.mse == 0.2
    
    def test_to_dict(self):
        """Verifica conversión a diccionario"""
        history = OptimizationHistory()
        
        info = IterationInfo(
            iteration=1,
            mse=0.5,
            chi_squared=5.0,
            chi_squared_reduced=0.5,
            damping=0.01
        )
        history.add_iteration(info)
        
        d = history.to_dict()
        
        assert 'mse_history' in d
        assert 'chi_squared_history' in d
        assert 'accepted_steps' in d
        assert d['accepted_steps'] == 1


class TestBestSolutionTracker:
    """Tests para BestSolutionTracker"""
    
    def test_update_improvement(self):
        """Verifica que detecta mejoras"""
        tracker = BestSolutionTracker()
        
        params1 = {'thickness': 100.0, 'n': 1.5}
        improved = tracker.update(
            iteration=1,
            params=params1,
            error=10.0,
            mse=0.5
        )
        
        assert improved
        assert tracker.improvements == 1
        assert tracker.best_mse == 0.5
        assert tracker.best_iter == 1
    
    def test_no_improvement(self):
        """Verifica que no actualiza si no hay mejora"""
        tracker = BestSolutionTracker()
        
        # Primera solución
        params1 = {'thickness': 100.0}
        tracker.update(1, params1, 10.0, 0.5)
        
        # Intento con peor MSE
        params2 = {'thickness': 120.0}
        improved = tracker.update(2, params2, 15.0, 0.7)
        
        assert not improved
        assert tracker.improvements == 1
        assert tracker.best_params['thickness'] == 100.0
    
    def test_get_best(self):
        """Verifica que retorna la mejor solución"""
        tracker = BestSolutionTracker()
        
        tracker.update(1, {'thickness': 100.0}, 10.0, 0.5)
        tracker.update(2, {'thickness': 90.0}, 8.0, 0.3)
        tracker.update(3, {'thickness': 110.0}, 12.0, 0.6)
        
        best = tracker.get_best()
        
        assert best['iteration'] == 2
        assert best['mse'] == 0.3
        assert best['params']['thickness'] == 90.0


class TestValidationResult:
    """Tests para ValidationResult"""
    
    def test_initial_state(self):
        """Verifica estado inicial"""
        result = ValidationResult(valid=True)
        
        assert result.valid
        assert len(result.violations) == 0
        assert len(result.warnings) == 0
    
    def test_add_violation(self):
        """Verifica agregar violaciones"""
        result = ValidationResult(valid=True)
        
        result.add_violation(
            param_name='thickness',
            violation_type='excessive_change',
            details={'change': 400, 'limit': 200}
        )
        
        assert not result.valid  # Se marca como inválido
        assert 'thickness' in result.violations
        assert result.violations['thickness']['type'] == 'excessive_change'
    
    def test_add_warning(self):
        """Verifica agregar advertencias"""
        result = ValidationResult(valid=True)
        
        result.add_warning("MSE cercano a límite superior")
        
        assert result.valid  # Sigue siendo válido
        assert len(result.warnings) == 1
    
    def test_to_dict(self):
        """Verifica conversión a diccionario"""
        result = ValidationResult(valid=False)
        result.add_violation('thickness', 'out_of_range', {'value': 500})
        result.add_warning("Test warning")
        
        d = result.to_dict()
        
        assert d['valid'] == False
        assert 'thickness' in d['violations']
        assert len(d['warnings']) == 1


class TestConvergenceConfig:
    """Tests para ConvergenceConfig"""
    
    def test_default_values(self):
        """Verifica valores por defecto"""
        config = ConvergenceConfig()
        
        assert config.abs_err_tolerance == 1e-8
        assert config.max_iterations == 200
        assert config.damping_initial == 1e-3
        assert 'thickness' in config.max_relative_change_total
    
    def test_custom_values(self):
        """Verifica valores personalizados"""
        config = ConvergenceConfig(
            max_iterations=500,
            gradient_tolerance=1e-4
        )
        
        assert config.max_iterations == 500
        assert config.gradient_tolerance == 1e-4


class TestOptimizationResult:
    """Tests para OptimizationResult"""
    
    def test_to_dict(self):
        """Verifica conversión a diccionario completa"""
        history = OptimizationHistory()
        validation = ValidationResult(valid=True)
        
        result = OptimizationResult(
            success=True,
            status=OptimizationStatus.CONVERGED_GRADIENT,
            message="Test optimization",
            optimization_time=1.5,
            iterations=10,
            optimized_params={'thickness': 100.0},
            initial_params={'thickness': 90.0},
            best_params={'thickness': 100.0},
            initial_metrics={'mse': 0.5},
            final_metrics={'mse': 0.1},
            best_metrics={'mse': 0.1},
            improvement_percentage=80.0,
            history=history,
            validation_result=validation
        )
        
        d = result.to_dict()
        
        assert d['success'] == True
        assert 'status' in d
        assert d['iterations'] == 10
        assert 'optimized_params' in d
        assert 'history' in d


def run_tests():
    """Función para ejecutar todos los tests"""
    print("=" * 60)
    print("EJECUTANDO TESTS DE OPTIMIZER_STATES")
    print("=" * 60)
    
    # Ejecutar con pytest
    pytest.main([__file__, '-v', '--tb=short'])


if __name__ == '__main__':
    run_tests()