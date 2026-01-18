"""
Módulo de estadísticas para análisis de optimización
Incluye cálculo de chi-cuadrado, R², intervalos de confianza, etc.
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class OptimizationStats:
    """
    Clase para calcular estadísticas completas de ajuste
    """
    
    # Datos experimentales
    psi_exp: np.ndarray
    delta_exp: np.ndarray
    wavelengths: np.ndarray
    
    # Datos teóricos (ajustados)
    psi_theo: np.ndarray
    delta_theo: np.ndarray
    
    # Información de optimización
    n_params: int
    n_iterations: int
    
    # Pesos estadísticos (opcional)
    weights_psi: Optional[np.ndarray] = None
    weights_delta: Optional[np.ndarray] = None
    
    def __post_init__(self):
        """Validar datos al inicializar"""
        self.n_points = len(self.wavelengths)
        
        # Grados de libertad
        self.dof = 2 * self.n_points - self.n_params  # 2 observables (Psi, Delta)
        
        if self.dof <= 0:
            logger.warning(f"⚠️ Grados de libertad ≤ 0: {self.dof}")
        
        # Crear pesos por defecto si no se proporcionan
        if self.weights_psi is None:
            self.weights_psi = np.ones_like(self.psi_exp)
        
        if self.weights_delta is None:
            self.weights_delta = np.ones_like(self.delta_exp)
    
    def calculate_all_metrics(self) -> Dict[str, Any]:
        """
        Calcula TODAS las métricas estadísticas
        """
        metrics = {}
        
        # 1. Errores básicos
        metrics['residuals'] = self._calculate_residuals()
        
        # 2. MSE y RMSE
        metrics['mse'] = self._calculate_mse()
        metrics['rmse'] = np.sqrt(metrics['mse'])
        
        # 3. Chi-cuadrado
        metrics['chi_squared'] = self._calculate_chi_squared()
        metrics['chi_squared_reduced'] = metrics['chi_squared'] / self.dof if self.dof > 0 else np.inf
        
        # 4. R² (coeficiente de determinación)
        metrics['r_squared'] = self._calculate_r_squared()
        
        # 5. MAE (Mean Absolute Error)
        metrics['mae'] = self._calculate_mae()
        
        # 6. Máximo error absoluto
        metrics['max_error'] = self._calculate_max_error()
        
        # 7. Interpretación cualitativa
        metrics['interpretation'] = self._interpret_fit_quality(metrics['chi_squared_reduced'])
        
        # 8. Grados de libertad
        metrics['degrees_of_freedom'] = self.dof
        metrics['n_points'] = self.n_points
        metrics['n_params'] = self.n_params
        
        return metrics
    
    def _calculate_residuals(self) -> Dict[str, np.ndarray]:
        """Calcula residuos (diferencias exp - theo)"""
        residuals_psi = self.psi_exp - self.psi_theo
        residuals_delta = self.delta_exp - self.delta_theo
        
        return {
            'psi': residuals_psi,
            'delta': residuals_delta,
            'combined': np.concatenate([residuals_psi, residuals_delta])
        }
    
    def _calculate_mse(self) -> float:
        """Mean Squared Error"""
        mse_psi = np.mean((self.psi_exp - self.psi_theo)**2)
        mse_delta = np.mean((self.delta_exp - self.delta_theo)**2)
        return (mse_psi + mse_delta) / 2
    
    def _calculate_mae(self) -> Dict[str, float]:
        """Mean Absolute Error"""
        mae_psi = np.mean(np.abs(self.psi_exp - self.psi_theo))
        mae_delta = np.mean(np.abs(self.delta_exp - self.delta_theo))
        
        return {
            'psi': float(mae_psi),
            'delta': float(mae_delta),
            'combined': float((mae_psi + mae_delta) / 2)
        }
    
    def _calculate_max_error(self) -> Dict[str, float]:
        """Máximo error absoluto"""
        max_psi = np.max(np.abs(self.psi_exp - self.psi_theo))
        max_delta = np.max(np.abs(self.delta_exp - self.delta_theo))
        
        return {
            'psi': float(max_psi),
            'delta': float(max_delta)
        }
    
    def _calculate_chi_squared(self) -> float:
        """
        Chi-cuadrado ponderado:
        χ² = Σ [w_i * (y_exp - y_theo)²]
        """
        chi2_psi = np.sum(self.weights_psi * (self.psi_exp - self.psi_theo)**2)
        chi2_delta = np.sum(self.weights_delta * (self.delta_exp - self.delta_theo)**2)
        
        return float(chi2_psi + chi2_delta)
    
    def _calculate_r_squared(self) -> Dict[str, float]:
        """
        Coeficiente de determinación R²
        R² = 1 - (SS_res / SS_tot)
        """
        # Para Psi
        ss_res_psi = np.sum((self.psi_exp - self.psi_theo)**2)
        ss_tot_psi = np.sum((self.psi_exp - np.mean(self.psi_exp))**2)
        r2_psi = 1 - (ss_res_psi / ss_tot_psi) if ss_tot_psi > 0 else 0
        
        # Para Delta
        ss_res_delta = np.sum((self.delta_exp - self.delta_theo)**2)
        ss_tot_delta = np.sum((self.delta_exp - np.mean(self.delta_exp))**2)
        r2_delta = 1 - (ss_res_delta / ss_tot_delta) if ss_tot_delta > 0 else 0
        
        return {
            'psi': float(r2_psi),
            'delta': float(r2_delta),
            'combined': float((r2_psi + r2_delta) / 2)
        }
    
    def _interpret_fit_quality(self, chi2_reduced: float) -> Dict[str, str]:
        """
        Interpreta la calidad del ajuste según χ²_red
        
        Criterios:
        - χ²_red << 1: Sobreajuste o errores sobreestimados
        - χ²_red ≈ 1: Ajuste óptimo
        - χ²_red > 1: Modelo insuficiente o errores subestimados
        """
        if chi2_reduced < 0.1:
            return {
                "level": "overfit",
                "label": "POSIBLE SOBREAJUSTE",
                "message": "χ² muy bajo. Verificar errores experimentales.",
                "color": "warning"
            }
        elif chi2_reduced < 1.5:
            return {
                "level": "excellent",
                "label": "EXCELENTE",
                "message": "El modelo describe los datos de manera óptima",
                "color": "success"
            }
        elif chi2_reduced < 3.0:
            return {
                "level": "good",
                "label": "BUENO",
                "message": "Ajuste aceptable con pequeñas desviaciones",
                "color": "success"
            }
        elif chi2_reduced < 5.0:
            return {
                "level": "acceptable",
                "label": "ACEPTABLE",
                "message": "El modelo captura las características principales",
                "color": "warning"
            }
        elif chi2_reduced < 10.0:
            return {
                "level": "poor",
                "label": "POBRE",
                "message": "Desviaciones significativas. Revisar modelo.",
                "color": "danger"
            }
        else:
            return {
                "level": "bad",
                "label": "INADECUADO",
                "message": "El modelo no describe los datos",
                "color": "danger"
            }
    
    def get_summary_report(self) -> str:
        """Genera reporte de texto"""
        metrics = self.calculate_all_metrics()
        
        report = f"""
╔══════════════════════════════════════════════════════════════╗
║           REPORTE ESTADÍSTICO DE OPTIMIZACIÓN               ║
╚══════════════════════════════════════════════════════════════╝

📊 DATOS:
   Puntos experimentales: {self.n_points}
   Parámetros ajustados: {self.n_params}
   Grados de libertad: {self.dof}

📈 CALIDAD DEL AJUSTE:
   Chi-cuadrado reducido (χ²/ν): {metrics['chi_squared_reduced']:.4f}
   Interpretación: {metrics['interpretation']['label']}
   {metrics['interpretation']['message']}

📉 ERRORES:
   RMSE: {metrics['rmse']:.4f}°
   MAE (Psi): {metrics['mae']['psi']:.4f}°
   MAE (Delta): {metrics['mae']['delta']:.4f}°
   Max Error (Psi): {metrics['max_error']['psi']:.4f}°
   Max Error (Delta): {metrics['max_error']['delta']:.4f}°

🎯 R² (Coeficiente de determinación):
   R² (Psi): {metrics['r_squared']['psi']:.6f}
   R² (Delta): {metrics['r_squared']['delta']:.6f}
   R² (Combinado): {metrics['r_squared']['combined']:.6f}

══════════════════════════════════════════════════════════════
"""
        return report