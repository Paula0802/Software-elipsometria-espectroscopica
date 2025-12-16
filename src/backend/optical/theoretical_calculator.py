"""
Calculador de Psi y Delta teóricos
Orquesta el flujo completo: dispersión → EMT → TMM → Psi/Delta
"""
import numpy as np
import logging
from typing import Dict, List, Tuple, Any
import time

from .dispersion_models import get_nk_from_model
from .emt import calculate_effective_medium
from .tmm import calculate_reflectance, calculate_psi_delta
from .conversions import nk_to_epsilon

logger = logging.getLogger(__name__)


class TheoreticalCalculator:
    """
    Clase para calcular Psi y Delta teóricos a partir de un modelo óptico
    """
    
    def __init__(self, model_data: Dict[str, Any], experimental_data: Dict[str, Any]):
        """
        Args:
            model_data: Diccionario con el modelo óptico completo
            experimental_data: Diccionario con wavelengths, psi_exp, delta_exp
        """
        self.model = model_data
        self.exp_data = experimental_data
        self.wavelengths = None
        self.results = None
        
    def calculate(self) -> Dict[str, Any]:
        """
        Ejecuta el cálculo completo de Psi y Delta teóricos
        
        Returns:
            Dict con resultados y métricas
        """
        start_time = time.time()
        
        try:
            # 1. Obtener longitudes de onda
            self.wavelengths = self._get_wavelengths()
            logger.info(f"Calculando para {len(self.wavelengths)} longitudes de onda")
            
            # 2. Extraer parámetros globales
            angle = self.model['global']['angle']
            
            # 3. Calcular para cada longitud de onda
            psi_theo = []
            delta_theo = []
            rp_array = []
            rs_array = []
            
            for i, wl in enumerate(self.wavelengths):
                # 3a. Calcular n,k del medio ambiente
                ambient_n, ambient_k = self._calculate_medium_nk(
                    self.model['ambient'], wl, 'ambiente'
                )
                
                # 3b. Calcular n,k del sustrato
                substrate_n, substrate_k = self._calculate_medium_nk(
                    self.model['substrate'], wl, 'sustrato'
                )
                
                # 3c. Calcular n,k de cada capa
                layers_n = []
                layers_k = []
                layers_thickness = []
                
                for layer_idx, layer in enumerate(self.model['layers']):
                    n, k = self._calculate_layer_nk(layer, wl, layer_idx)
                    layers_n.append(n)
                    layers_k.append(k)
                    layers_thickness.append(layer['thickness'])
                
                # 3d. Ejecutar TMM para esta longitud de onda
                rp, rs = calculate_reflectance(
                    layers_n=layers_n,
                    layers_k=layers_k,
                    layers_thickness=layers_thickness,
                    n_ambient=ambient_n,
                    n_substrate=substrate_n,
                    wavelength=wl,
                    angle_deg=angle,
                    polarization='both'
                )
                
                # 3e. Calcular Psi y Delta
                psi, delta = calculate_psi_delta(rp, rs)
                
                psi_theo.append(psi)
                delta_theo.append(delta)
                rp_array.append(rp)
                rs_array.append(rs)
                
                # Log de progreso cada 50 puntos
                if (i + 1) % 50 == 0:
                    logger.info(f"Progreso: {i+1}/{len(self.wavelengths)} puntos calculados")
            
            # 4. Calcular métricas de ajuste
            metrics = self._calculate_goodness_of_fit(
                psi_exp=self.exp_data['psi_exp'],
                delta_exp=self.exp_data['delta_exp'],
                psi_theo=psi_theo,
                delta_theo=delta_theo
            )
            
            calc_time = time.time() - start_time
            
            # 5. Preparar resultados
            self.results = {
                'success': True,
                'calculation_time': round(calc_time, 3),
                'points_calculated': len(self.wavelengths),
                'data': {
                    'wavelengths': [float(w) for w in self.wavelengths],
                    'psi_theoretical': [float(p) for p in psi_theo],
                    'delta_theoretical': [float(d) for d in delta_theo],
                    'reflectance_p': [{'real': float(r.real), 'imag': float(r.imag)} for r in rp_array],
                    'reflectance_s': [{'real': float(r.real), 'imag': float(r.imag)} for r in rs_array]
                },
                'goodness_of_fit': metrics
            }
            
            logger.info(f"Cálculo completado en {calc_time:.3f} s")
            logger.info(f"Chi-cuadrado: {metrics['chi_squared']:.4f}")
            
            return self.results
            
        except Exception as e:
            logger.error(f"Error en cálculo teórico: {str(e)}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'error_type': type(e).__name__
            }
    
    def _get_wavelengths(self) -> np.ndarray:
        """Obtiene el array de longitudes de onda del modelo"""
        wl_mode = self.model['global'].get('wavelength_mode', 'file')
        
        if wl_mode == 'file':
            return np.array(self.model['global']['wavelengths'])
        elif wl_mode == 'range':
            wl_from = self.model['global']['wl_from']
            wl_to = self.model['global']['wl_to']
            wl_steps = self.model['global']['wl_steps']
            return np.linspace(wl_from, wl_to, wl_steps)
        elif wl_mode == 'single':
            return np.array([self.model['global']['wl_single']])
        else:
            raise ValueError(f"Modo de longitud de onda no reconocido: {wl_mode}")
    
    def _calculate_medium_nk(self, medium_data: Dict, wavelength: float, 
                            medium_name: str) -> Tuple[float, float]:
        """
        Calcula n,k para un medio (ambiente o sustrato)
        
        Args:
            medium_data: Datos del medio
            wavelength: Longitud de onda actual
            medium_name: Nombre para logging
            
        Returns:
            (n, k) como floats
        """
        try:
            # Verificar si es EMT
            if medium_data.get('type') == 'emt':
                # Calcular medio efectivo
                n_eff, k_eff = calculate_effective_medium(
                    medium_data, 
                    np.array([wavelength])
                )
                return float(n_eff[0]), float(k_eff[0])
            
            # Medio homogéneo
            model_type = medium_data.get('type', 'constant')
            
            if model_type == 'constant':
                return float(medium_data.get('n', 1.0)), float(medium_data.get('k', 0.0))
            
            elif model_type == 'glass':
                return 1.52, 0.0
            
            elif model_type in ['cauchy', 'sellmeier', 'drude', 'lorentz', 'drude-lorentz']:
                n, k = get_nk_from_model(
                    model_type,
                    np.array([wavelength]),
                    medium_data.get('params', {})
                )
                return float(n[0]), float(k[0])
            
            elif model_type in ['file_nk', 'file_epsilon']:
                # Interpolar datos de archivo
                optical_data = medium_data.get('optical_data', {})
                wl_data = np.array(optical_data['wavelength'])
                n_data = np.array(optical_data['n'])
                k_data = np.array(optical_data['k'])
                
                n = np.interp(wavelength, wl_data, n_data)
                k = np.interp(wavelength, wl_data, k_data)
                return float(n), float(k)
            
            else:
                logger.warning(f"Tipo de medio no reconocido: {model_type}, usando n=1.5, k=0")
                return 1.5, 0.0
                
        except Exception as e:
            logger.error(f"Error calculando n,k para {medium_name}: {str(e)}")
            raise
    
    def _calculate_layer_nk(self, layer_data: Dict, wavelength: float, 
                           layer_idx: int) -> Tuple[float, float]:
        """
        Calcula n,k para una capa
        
        Args:
            layer_data: Datos de la capa
            wavelength: Longitud de onda actual
            layer_idx: Índice de la capa (para logging)
            
        Returns:
            (n, k) como floats
        """
        try:
            layer_type = layer_data.get('layer_type', 'homogeneous')
            
            # Capa heterogénea (EMT)
            if layer_type == 'emt':
                n_eff, k_eff = calculate_effective_medium(
                    layer_data,
                    np.array([wavelength])
                )
                return float(n_eff[0]), float(k_eff[0])
            
            # Capa homogénea
            model = layer_data.get('model', 'constant')
            
            if model == 'constant':
                return float(layer_data.get('n', 1.5)), float(layer_data.get('k', 0.0))
            
            elif model in ['cauchy', 'sellmeier', 'drude', 'lorentz', 'drude-lorentz']:
                n, k = get_nk_from_model(
                    model,
                    np.array([wavelength]),
                    layer_data.get('params', {})
                )
                return float(n[0]), float(k[0])
            
            elif model in ['file_nk', 'file_epsilon']:
                optical_data = layer_data.get('optical_data', {})
                wl_data = np.array(optical_data['wavelength'])
                n_data = np.array(optical_data['n'])
                k_data = np.array(optical_data['k'])
                
                n = np.interp(wavelength, wl_data, n_data)
                k = np.interp(wavelength, wl_data, k_data)
                return float(n), float(k)
            
            else:
                logger.warning(f"Modelo de capa no reconocido: {model}, usando n=1.5, k=0")
                return 1.5, 0.0
                
        except Exception as e:
            logger.error(f"Error calculando n,k para capa {layer_idx}: {str(e)}")
            raise
    
    def _calculate_goodness_of_fit(self, psi_exp: List[float], delta_exp: List[float],
                                   psi_theo: List[float], delta_theo: List[float]) -> Dict:
        """
        Calcula métricas de bondad de ajuste
        
        Returns:
            Dict con chi_squared, métricas de psi y delta
        """
        # Forzar conversión a float
        psi_exp = np.asarray(psi_exp, dtype=float)
        delta_exp = np.asarray(delta_exp, dtype=float)
        psi_theo = np.asarray(psi_theo, dtype=float)
        delta_theo = np.asarray(delta_theo, dtype=float)
        
        N = len(psi_exp)
        P = 0  # Número de parámetros libres (0 por ahora, sin optimización)
        
        # Residuos
        residuals_psi = psi_exp - psi_theo
        residuals_delta = delta_exp - delta_theo
        
        # Chi-cuadrado
        chi2 = np.sum(residuals_psi**2 + residuals_delta**2)
        chi2_reduced = chi2 / (N - P) if (N - P) > 0 else chi2
        
        # Métricas para Psi
        mse_psi = np.mean(residuals_psi**2)
        rmse_psi = np.sqrt(mse_psi)
        ss_tot_psi = np.sum((psi_exp - np.mean(psi_exp))**2)
        ss_res_psi = np.sum(residuals_psi**2)
        r2_psi = 1 - (ss_res_psi / ss_tot_psi) if ss_tot_psi > 0 else 0
        
        # Métricas para Delta
        mse_delta = np.mean(residuals_delta**2)
        rmse_delta = np.sqrt(mse_delta)
        ss_tot_delta = np.sum((delta_exp - np.mean(delta_exp))**2)
        ss_res_delta = np.sum(residuals_delta**2)
        r2_delta = 1 - (ss_res_delta / ss_tot_delta) if ss_tot_delta > 0 else 0
        
        return {
            'chi_squared': float(chi2),
            'chi_squared_reduced': float(chi2_reduced),
            'degrees_of_freedom': N - P,
            'psi_metrics': {
                'mse': float(mse_psi),
                'rmse': float(rmse_psi),
                'r_squared': float(r2_psi),
                'max_error': float(np.max(np.abs(residuals_psi))),
                'mean_error': float(np.mean(residuals_psi)),
                'std_error': float(np.std(residuals_psi))
            },
            'delta_metrics': {
                'mse': float(mse_delta),
                'rmse': float(rmse_delta),
                'r_squared': float(r2_delta),
                'max_error': float(np.max(np.abs(residuals_delta))),
                'mean_error': float(np.mean(residuals_delta)),
                'std_error': float(np.std(residuals_delta))
            }
        }


def calculate_theoretical_psi_delta(model_data: Dict[str, Any], 
                                    experimental_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Función de conveniencia para calcular Psi y Delta teóricos
    
    Args:
        model_data: Modelo óptico completo
        experimental_data: Datos experimentales con wavelengths, psi_exp, delta_exp
        
    Returns:
        Dict con resultados del cálculo
    """
    calculator = TheoreticalCalculator(model_data, experimental_data)
    return calculator.calculate()