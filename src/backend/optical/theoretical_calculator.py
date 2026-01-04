"""
Calculador de Psi y Delta teóricos
Orquesta el flujo completo: dispersión → EMT → TMM → Psi/Delta

CORRECCIONES v4.0 (2026-01-03):
- ✅ NUEVO: MSE calculado según CompleteEASE (ecuación 2-2 del manual)
- ✅ NUEVO: Transformación Ψ,Δ → N,C,S para cálculo de error
- ✅ NUEVO: Métricas duales (MSE principal + χ² secundario)
- ✅ Manejo correcto de periodicidad de Delta en residuos
- ✅ Integración con corrección de ambigüedad de Delta
- ✅ Conversión segura de tipos de datos (dtype fix)
"""
import numpy as np
import logging
from typing import Dict, List, Tuple, Any, Optional
import time

from .dispersion_models import get_nk_from_model
from .emt import calculate_effective_medium
from .tmm import calculate_reflectance, calculate_psi_delta
from .conversions import nk_to_epsilon

logger = logging.getLogger(__name__)


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
# CLASE PRINCIPAL
# ============================================================================

class TheoreticalCalculator:
    """
    Clase para calcular Psi y Delta teóricos a partir de un modelo óptico
    """
    
    def __init__(self, model_data: Dict[str, Any], experimental_data: Dict[str, Any],
                 experimental_data_for_correction: Optional[Dict[str, Any]] = None):
        """
        Args:
            model_data: Diccionario con el modelo óptico completo
            experimental_data: Diccionario con wavelengths, psi_exp, delta_exp
            experimental_data_for_correction: Datos experimentales para corrección de Delta (opcional)
        """
        self.model = model_data
        self.exp_data = experimental_data
        self.exp_data_for_correction = experimental_data_for_correction
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
            
            # ✅ CONVERSIÓN SEGURA: Convertir datos experimentales a numpy arrays de float
            exp_wl_array = None
            exp_delta_array = None
            use_correction = self.exp_data_for_correction is not None
            
            if use_correction:
                try:
                    # Forzar conversión a float para evitar errores de dtype
                    exp_wl_array = np.asarray(
                        self.exp_data_for_correction['wavelength'], 
                        dtype=float
                    )
                    exp_delta_array = np.asarray(
                        self.exp_data_for_correction['delta'], 
                        dtype=float
                    )
                    logger.info("✅ Corrección de ambigüedad de Delta ACTIVADA")
                    logger.info(f"   Datos experimentales: {len(exp_wl_array)} puntos")
                except Exception as e:
                    logger.error(f"Error convirtiendo datos experimentales: {e}")
                    logger.warning("⚠️ Desactivando corrección de Delta por error en datos")
                    use_correction = False
            else:
                logger.info("⚠️ Corrección de ambigüedad de Delta DESACTIVADA")
            
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
                
                # ✅ INTERPOLACIÓN SEGURA: Extraer dato experimental para esta longitud de onda
                exp_delta_i = None
                if use_correction:
                    exp_delta_i = float(np.interp(wl, exp_wl_array, exp_delta_array))
                
                # 3e. Calcular Psi y Delta CON CORRECCIÓN DE AMBIGÜEDAD
                psi, delta = calculate_psi_delta(
                    rp, rs,
                    correct_ambiguity=use_correction,  # ✅ ACTIVAR si hay datos exp
                    experimental_delta=exp_delta_i,    # ✅ PASAR dato experimental
                    expected_range='auto',              # ✅ Detección automática
                    layers_n=layers_n,                  # ✅ Para detección de metales
                    layers_k=layers_k                   # ✅ Para detección de metales
                )
                
                psi_theo.append(psi)
                delta_theo.append(delta)
                rp_array.append(rp)
                rs_array.append(rs)
                
                # Log de progreso cada 50 puntos
                if (i + 1) % 50 == 0:
                    logger.info(f"Progreso: {i+1}/{len(self.wavelengths)} puntos calculados")
            
            # 4. Calcular métricas de ajuste (✅ NUEVA VERSIÓN con MSE de CompleteEASE)
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
                'delta_correction_used': use_correction,  # ✅ NUEVO: Indicar si se usó corrección
                'data': {
                    'wavelengths': [float(w) for w in self.wavelengths],
                    'psi_theoretical': [float(p) for p in psi_theo],
                    'delta_theoretical': [float(d) for d in delta_theo],
                    'reflectance_p': [{'real': float(r.real), 'imag': float(r.imag)} for r in rp_array],
                    'reflectance_s': [{'real': float(r.real), 'imag': float(r.imag)} for r in rs_array]
                },
                'goodness_of_fit': metrics
            }
            
            # ✅ LOGGING ACTUALIZADO: Mostrar MSE como métrica principal
            logger.info(f"Cálculo completado en {calc_time:.3f} s")
            logger.info(f"MSE (CompleteEASE): {metrics['mse']:.2f} [{metrics['quality']}]")
            logger.info(f"χ²ᵣ: {metrics['chi_squared_reduced']:.6f}")
            if use_correction:
                logger.info("✅ Delta corregido para ambigüedad de fase")
            
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
    
    def _normalize_delta_residuals(self, delta_exp: np.ndarray, delta_theo: np.ndarray) -> np.ndarray:
        """
        Calcula residuos de Delta manejando correctamente la periodicidad de 360°
        
        Args:
            delta_exp: Delta experimental (puede estar en cualquier convención)
            delta_theo: Delta teórico (ya corregido por ambigüedad)
        
        Returns:
            residuals: Residuos normalizados al rango [-180°, 180°]
        
        Notas:
            - Delta es periódica en 360°: Δ ≡ Δ + 360°
            - Los residuos deben estar en el rango más cercano
            - Ejemplo: si Δ_exp = -80° y Δ_theo = 280°, el residuo es 0°, NO -360°
        """
        residuals = delta_exp - delta_theo
        
        # Normalizar al rango [-180°, 180°]
        residuals = np.where(residuals > 180, residuals - 360, residuals)
        residuals = np.where(residuals < -180, residuals + 360, residuals)
        
        return residuals
    
    def _calculate_goodness_of_fit(self, psi_exp: List[float], delta_exp: List[float],
                                   psi_theo: List[float], delta_theo: List[float]) -> Dict:
        """
        Calcula métricas de bondad de ajuste SEGÚN COMPLETEEASE
        
        CORRECCIÓN v4.0 (2026-01-03):
        - ✅ NUEVO: MSE calculado según CompleteEASE (ecuación 2-2 del manual)
        - ✅ NUEVO: Transformación Ψ,Δ → N,C,S para cálculo de error principal
        - ✅ NUEVO: Métricas duales (MSE como principal + análisis detallado)
        - ✅ Manejo correcto de periodicidad de Delta
        - ✅ Delta teórico ya viene corregido por ambigüedad
        
        Fórmula principal (CompleteEASE Manual, ecuación 2-2):
            MSE = √[1/(3n-m) × Σ[(N_E-N_G)² + (C_E-C_G)² + (S_E-S_G)²]] × 1000
        
        Returns:
            Dict con métricas duales (MSE de CompleteEASE + análisis detallado en Ψ,Δ)
        
        Referencias:
            J.A. Woollam Co., CompleteEASE Data Analysis Manual, v6.56, 2023, eq. (2-2)
        """
        # Forzar conversión a float
        psi_exp = np.asarray(psi_exp, dtype=float)
        delta_exp = np.asarray(delta_exp, dtype=float)
        psi_theo = np.asarray(psi_theo, dtype=float)
        delta_theo = np.asarray(delta_theo, dtype=float)
        
        n_wavelengths = len(psi_exp)
        n_params = 0  # Número de parámetros libres (0 antes de optimizar)
        
        # ========================================================================
        # MÉTODO 1: MSE DE COMPLETEEASE (N, C, S) - MÉTRICA PRINCIPAL
        # ========================================================================
        
        # Transformar Ψ,Δ → N,C,S
        N_exp, C_exp, S_exp = psi_delta_to_ncs(psi_exp, delta_exp)
        N_theo, C_theo, S_theo = psi_delta_to_ncs(psi_theo, delta_theo)
        
        # Suma de errores cuadrados en N, C, S
        sum_squared_ncs = float(np.sum(
            (N_exp - N_theo)**2 +
            (C_exp - C_theo)**2 +
            (S_exp - S_theo)**2
        ))
        
        # Grados de libertad: 3n - m
        # (3 componentes × n longitudes de onda - m parámetros)
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
            quality = 'NO ACEPTABLE'
        
        # ========================================================================
        # MÉTODO 2: ANÁLISIS DETALLADO EN Ψ Y Δ (MÉTRICA SECUNDARIA)
        # ========================================================================
        
        # Residuos de Psi
        residuals_psi = psi_exp - psi_theo
        
        # ✅ CORRECCIÓN: Residuos de Delta con manejo de periodicidad
        # NOTA: delta_theo ya viene corregido por ambigüedad si se activó
        residuals_delta = self._normalize_delta_residuals(delta_exp, delta_theo)
        
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
        
        # ========================================================================
        # RETORNAR MÉTRICAS DUALES
        # ========================================================================
        
        return {
            # ====== MÉTRICAS PRINCIPALES (COMPLETEEASE) ======
            'mse': float(mse_completeease),  # ← MÉTRICA PRINCIPAL
            'chi_squared': float(chi_squared_ncs),
            'chi_squared_reduced': float(chi_squared_reduced_ncs),
            'degrees_of_freedom': dof_completeease,
            'quality': quality,  # ← Interpretación textual
            'formula': 'CompleteEASE (ecuación 2-2): MSE en N,C,S',
            
            # ====== MÉTRICAS DETALLADAS (ANÁLISIS) ======
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
            },
            
            # ====== INFORMACIÓN ADICIONAL ======
            'n_wavelengths': n_wavelengths,
            'n_params': n_params,
            'interpretation': {
                'mse_excellent': 'MSE < 5',
                'mse_good': 'MSE < 20',
                'mse_acceptable': 'MSE < 50',
                'mse_poor': 'MSE > 100'
            }
        }


def calculate_theoretical_psi_delta(model_data: Dict[str, Any], 
                                    experimental_data: Dict[str, Any],
                                    experimental_data_for_correction: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Función de conveniencia para calcular Psi y Delta teóricos
    
    Args:
        model_data: Modelo óptico completo
        experimental_data: Datos experimentales con wavelengths, psi_exp, delta_exp
        experimental_data_for_correction: Datos para corrección de ambigüedad de Delta (opcional)
        
    Returns:
        Dict con resultados del cálculo
    """
    calculator = TheoreticalCalculator(
        model_data, 
        experimental_data,
        experimental_data_for_correction=experimental_data_for_correction
    )
    return calculator.calculate()