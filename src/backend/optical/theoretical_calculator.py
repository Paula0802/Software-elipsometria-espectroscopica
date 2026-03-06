"""
Calculador de valores teóricos de Psi y Delta
Integra TMM con corrección de ambigüedad de Delta

VERSIÓN v3.1 - CORRECCIÓN DE MÉTRICAS
================================================

CORRECCIONES:
✅ v2.0: Transformación N,C,S correcta: N=cos(2Ψ), C=sin(2Ψ)cos(Δ), S=sin(2Ψ)sin(Δ)
✅ v2.0: Conversión a radianes antes de aplicar sin/cos
✅ v3.0: DOF = 3n - m  (3 observables: N, C, S) — consistente con optimizer.py
✅ v3.0: MSE × 1000   — misma escala que optimizer.py y CompleteEASE
✅ v3.0: Umbrales de calidad alineados con optimizer.py (<5, <20, <50)
✅ v3.0: n_params contado desde el modelo (mínimo 1)
✅ v3.1: σ_Ψ = 0.05°, σ_Δ = 0.5° — valores correctos según Fujiwara Eq. 5.60
✅ v3.1: 'chi_squared' ahora es el χ² estadístico real (Ψ,Δ ponderados por σ)
✅ v3.1: 'chi_squared_ncs' es la suma cruda NCS (renombrada para no confundir)
✅ Serialización JSON segura de optical_constants

FÓRMULAS IMPLEMENTADAS (CompleteEASE, eq. 2-2):
    N = cos(2Ψ),  C = sin(2Ψ)·cos(Δ),  S = sin(2Ψ)·sin(Δ)

    MSE = 1000 · sqrt( Σ[(ΔN² + ΔC² + ΔS²)] / (3n - m) )

    χ²     = Σ[ ((Ψ_exp-Ψ_teo)/σ_Ψ)² + ((Δ_exp-Δ_teo)/σ_Δ)² ]
    χ²_red = χ² / (2n - m)

donde n = longitudes de onda, m = parámetros libres del modelo.
"""
import numpy as np
import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


# ============================================================
# CONSTANTES (mismas que optimizer.py)
# ============================================================
# Valores correctos según Fujiwara, Spectroscopic Ellipsometry (2007), Eq. 5.60
DEFAULT_SIGMA_PSI   = 0.05   # ±0.05° en Ψ
DEFAULT_SIGMA_DELTA = 0.5    # ±0.5°  en Δ


# ============================================================
# UTILIDADES DE SERIALIZACIÓN
# ============================================================

def ensure_json_serializable(obj):
    """Convierte recursivamente tipos numpy a tipos Python nativos."""
    if isinstance(obj, dict):
        return {k: ensure_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [ensure_json_serializable(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.complexfloating):
        return {'real': float(obj.real), 'imag': float(obj.imag)}
    elif isinstance(obj, np.bool_):
        return bool(obj)
    return obj


# ============================================================
# TRANSFORMACIÓN N, C, S  (idéntica a optimizer.py)
# ============================================================

def psi_delta_to_ncs(psi_deg: np.ndarray, delta_deg: np.ndarray):
    """
    Convierte Ψ, Δ (grados) → N, C, S según CompleteEASE eq. 2-2.

    N = cos(2Ψ)            ∈ [-1, 1]
    C = sin(2Ψ) · cos(Δ)  ∈ [-1, 1]
    S = sin(2Ψ) · sin(Δ)  ∈ [-1, 1]

    ⚠️ OBLIGATORIO convertir a radianes antes de sin/cos.
    """
    psi_rad   = np.deg2rad(psi_deg)
    delta_rad = np.deg2rad(delta_deg)

    N = np.cos(2 * psi_rad)
    C = np.sin(2 * psi_rad) * np.cos(delta_rad)
    S = np.sin(2 * psi_rad) * np.sin(delta_rad)

    return N, C, S


# ============================================================
# MÉTRICAS DE BONDAD DE AJUSTE
# ============================================================

def calculate_goodness_of_fit(
    psi_exp:    np.ndarray,
    delta_exp:  np.ndarray,
    psi_theo:   np.ndarray,
    delta_theo: np.ndarray,
    n_params:   int   = 1,
    sigma_psi:  float = DEFAULT_SIGMA_PSI,
    sigma_delta: float = DEFAULT_SIGMA_DELTA
) -> Dict[str, Any]:
    """
    Calcula métricas de bondad de ajuste.

    MSE (CompleteEASE eq. 2-2, consistente con optimizer.py):
        MSE = 1000 · sqrt( Σ(ΔN² + ΔC² + ΔS²) / (3n - m) )

    Chi-cuadrado estadístico (Fujiwara Eq. 5.60):
        χ²     = Σ[ ((Ψ_exp-Ψ_teo)/σ_Ψ)² + ((Δ_exp-Δ_teo)/σ_Δ)² ]
        χ²_red = χ² / (2n - m)

    Escala de calidad (igual que optimizer.py):
        MSE < 5  → EXCELENTE
        MSE < 20 → BUENO
        MSE < 50 → ACEPTABLE
        MSE ≥ 50 → NO ACEPTABLE

    Args:
        psi_exp, delta_exp:   valores experimentales [grados]
        psi_theo, delta_theo: valores teóricos       [grados]
        n_params:  parámetros libres del modelo (mínimo 1)
        sigma_psi, sigma_delta: incertidumbres instrumentales [grados]
                                (Fujiwara Eq. 5.60: σ_Ψ=0.05°, σ_Δ=0.5°)
    """
    # ----------------------------------------------------------
    # Validación y truncado
    # ----------------------------------------------------------
    min_len = min(len(psi_exp), len(delta_exp), len(psi_theo), len(delta_theo))

    if min_len == 0:
        logger.error("  ❌ Arrays vacíos en calculate_goodness_of_fit")
        empty = {'rmse': 0.0, 'mae': 0.0, 'max_error': 0.0, 'r_squared': 0.0}
        return {
            'chi_squared':         float('inf'),
            'chi_squared_reduced': float('inf'),
            'chi_squared_ncs':     float('inf'),
            'mse':                 float('inf'),
            'quality':             'ERROR - Sin datos',
            'psi_metrics':   empty,
            'delta_metrics': empty
        }

    psi_exp    = psi_exp[:min_len]
    delta_exp  = delta_exp[:min_len]
    psi_theo   = psi_theo[:min_len]
    delta_theo = delta_theo[:min_len]
    n_points   = min_len

    # ----------------------------------------------------------
    # Transformación N, C, S
    # ----------------------------------------------------------
    N_exp,  C_exp,  S_exp  = psi_delta_to_ncs(psi_exp,  delta_exp)
    N_theo, C_theo, S_theo = psi_delta_to_ncs(psi_theo, delta_theo)

    sum_sq = float(np.sum(
        (N_exp - N_theo)**2 +
        (C_exp - C_theo)**2 +
        (S_exp - S_theo)**2
    ))

    # ----------------------------------------------------------
    # MSE — fórmula CompleteEASE ×1000, DOF = 3n - m
    # Idéntico a calculate_all_metrics() en optimizer.py
    # ----------------------------------------------------------
    dof_ncs = max(1, 3 * n_points - n_params)
    mse     = float(np.sqrt(sum_sq / dof_ncs) * 1000)

    # ----------------------------------------------------------
    # Chi-cuadrado ESTADÍSTICO (Fujiwara Eq. 5.60)
    # Compara Ψ y Δ directamente en grados, ponderados por σ
    # DOF = 2n - m
    # ----------------------------------------------------------
    dof_stat = max(1, 2 * n_points - n_params)

    chi_squared = float(np.sum(
        ((psi_exp   - psi_theo)   / sigma_psi)  **2 +
        ((delta_exp - delta_theo) / sigma_delta) **2
    ))
    chi_squared_reduced = chi_squared / dof_stat

    # ----------------------------------------------------------
    # Métricas individuales Ψ y Δ
    # ----------------------------------------------------------
    def _metrics(exp, theo):
        res    = exp - theo
        ss_res = np.sum(res**2)
        ss_tot = np.sum((exp - np.mean(exp))**2)
        return {
            'rmse':      float(np.sqrt(np.mean(res**2))),
            'mae':       float(np.mean(np.abs(res))),
            'max_error': float(np.max(np.abs(res))),
            'r_squared': float(1.0 - ss_res / ss_tot) if ss_tot > 0 else 0.0
        }

    # ----------------------------------------------------------
    # Clasificación de calidad — idéntica a optimizer.py
    # ----------------------------------------------------------
    if mse < 5:
        quality = 'EXCELENTE'
    elif mse < 20:
        quality = 'BUENO'
    elif mse < 50:
        quality = 'ACEPTABLE'
    else:
        quality = 'NO ACEPTABLE'

    return {
        # χ² ESTADÍSTICO REAL (Ψ,Δ ponderados por σ_Ψ=0.05°, σ_Δ=0.5°)
        # Esta es la métrica que debe mostrarse al usuario como "chi cuadrado"
        'chi_squared':         chi_squared,
        'chi_squared_reduced': chi_squared_reduced,

        # Suma cruda NCS — usada internamente para MSE, NO es el χ² estadístico
        'chi_squared_ncs':     sum_sq,

        # MSE — métrica principal (CompleteEASE)
        'mse':    mse,
        'quality': quality,

        'psi_metrics':   _metrics(psi_exp,   psi_theo),
        'delta_metrics': _metrics(delta_exp, delta_theo)
    }


# ============================================================
# FUNCIÓN PRINCIPAL
# ============================================================

def calculate_theoretical_psi_delta(
    model: Dict[str, Any],
    experimental_data: Dict[str, Any],
    experimental_data_for_correction: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Calcula Psi y Delta teóricos usando TMM y devuelve métricas de ajuste.

    Args:
        model: Modelo óptico completo {global, ambient, substrate, layers}
        experimental_data: {wavelengths, psi_exp, delta_exp}
        experimental_data_for_correction: {wavelength, psi, delta} para TMM

    Returns:
        {success, data, optical_constants, tra_spectra,
         goodness_of_fit, calculation_time, points_calculated}
    """
    try:
        start_time = time.time()

        logger.info("=" * 60)
        logger.info("CÁLCULO TEÓRICO PSI/DELTA  v3.1")
        logger.info("=" * 60)

        # ------------------------------------------------
        # 1. Importar TMM
        # ------------------------------------------------
        try:
            from backend.optical.tmm import run_tmm_calculation
        except ImportError as e:
            return {
                'success':    False,
                'error':      f'Error importando módulo TMM: {str(e)}',
                'error_type': 'ImportError'
            }

        # ------------------------------------------------
        # 2. Datos experimentales — conversión segura a float64
        # ------------------------------------------------
        psi_exp         = np.array(experimental_data['psi_exp'],     dtype=np.float64)
        delta_exp       = np.array(experimental_data['delta_exp'],   dtype=np.float64)
        wavelengths_exp = np.array(experimental_data['wavelengths'], dtype=np.float64)

        if experimental_data_for_correction is None:
            experimental_data_for_correction = {
                'wavelength': wavelengths_exp,
                'psi':        psi_exp,
                'delta':      delta_exp
            }
        else:
            experimental_data_for_correction = {
                'wavelength': np.array(
                    experimental_data_for_correction['wavelength'], dtype=np.float64),
                'psi':   np.array(
                    experimental_data_for_correction['psi'],   dtype=np.float64),
                'delta': np.array(
                    experimental_data_for_correction['delta'], dtype=np.float64)
            }

        # ------------------------------------------------
        # 3. Preparar modelo TMM
        # ------------------------------------------------
        tmm_model = {
            'global':    model.get('global',    {}),
            'ambient':   model.get('ambient',   {'type': 'constant', 'n': 1.0,  'k': 0.0}),
            'substrate': model.get('substrate', {'type': 'constant', 'n': 1.52, 'k': 0.0}),
            'layers':    model.get('layers',    [])
        }

        global_cfg = tmm_model['global']
        if not global_cfg.get('wavelengths'):
            global_cfg['wavelengths'] = wavelengths_exp.tolist()
            logger.info("  ⚠️ Wavelengths no encontrados en modelo, usando experimentales")

        if 'wavelength_mode' not in global_cfg:
            global_cfg['wavelength_mode'] = 'file'

        angle    = global_cfg.get('angle', 70)
        n_layers = len(tmm_model['layers'])
        logger.info(
            f"  Ángulo: {angle}°  |  Capas: {n_layers}  |  "
            f"λ: {len(wavelengths_exp)} puntos"
        )

        # ------------------------------------------------
        # 4. Contar parámetros libres del modelo
        #    Mínimo 1 para evitar división por cero en DOF
        # ------------------------------------------------
        n_params = 0
        for layer in tmm_model['layers']:
            p = layer.get('params', {})
            if isinstance(p, dict):
                n_params += len(p)
        n_params = max(1, n_params)
        logger.info(f"  Parámetros libres estimados: {n_params}")

        # ------------------------------------------------
        # 5. Ejecutar TMM con corrección de Delta
        # ------------------------------------------------
        logger.info("  🔄 Ejecutando TMM...")
        tmm_result = run_tmm_calculation(
            tmm_model,
            correct_delta_ambiguity=True,
            experimental_data=experimental_data_for_correction,
            expected_delta_range='auto'
        )

        if 'error' in tmm_result:
            logger.error(f"  ❌ Error en TMM: {tmm_result['error']}")
            return {
                'success':    False,
                'error':      tmm_result['error'],
                'error_type': 'TMM_Error'
            }

        logger.info("  ✓ TMM completado")

        # ------------------------------------------------
        # 6. Extraer Ψ y Δ teóricos
        # ------------------------------------------------
        try:
            psi_theoretical   = np.array(tmm_result['psi_deg'],   dtype=float)
            delta_theoretical = np.array(tmm_result['delta_deg'], dtype=float)
            wavelengths = (
                np.array(tmm_result['wavelength'], dtype=float)
                if tmm_result.get('wavelength')
                else wavelengths_exp.copy()
            )
        except KeyError as e:
            return {
                'success':    False,
                'error':      f'Resultado TMM incompleto: falta campo {e}',
                'error_type': 'KeyError'
            }

        if len(psi_theoretical) == 0 or len(delta_theoretical) == 0:
            return {
                'success':    False,
                'error':      'TMM no calculó Psi/Delta. Verifique el modelo.',
                'error_type': 'TMM_Empty_Result'
            }

        # ------------------------------------------------
        # 7. Interpolar si longitudes no coinciden
        # ------------------------------------------------
        if len(psi_theoretical) != len(psi_exp):
            logger.info("  🔄 Interpolando a wavelengths experimentales...")
            psi_theoretical   = np.interp(wavelengths_exp, wavelengths, psi_theoretical)
            delta_theoretical = np.interp(wavelengths_exp, wavelengths, delta_theoretical)
            wavelengths       = wavelengths_exp.copy()

        logger.info(f"  ✓ {len(psi_theoretical)} puntos extraídos")

        # ------------------------------------------------
        # 8. Métricas de bondad de ajuste
        #    Fórmula idéntica a calculate_all_metrics() en optimizer.py
        # ------------------------------------------------
        logger.info("  📊 Calculando métricas...")
        goodness_of_fit = calculate_goodness_of_fit(
            psi_exp, delta_exp,
            psi_theoretical, delta_theoretical,
            n_params=n_params,
            sigma_psi=DEFAULT_SIGMA_PSI,
            sigma_delta=DEFAULT_SIGMA_DELTA
        )
        logger.info(
            f"  ✓ MSE = {goodness_of_fit['mse']:.2f}  "
            f"({goodness_of_fit['quality']})  |  "
            f"χ²_red = {goodness_of_fit['chi_squared_reduced']:.4f}"
        )

        # ------------------------------------------------
        # 9. Calcular R, T, A
        # ------------------------------------------------
        tra_data = {}
        try:
            from backend.optical.tra_calculator import calculate_tra_from_tmm
            tra_data = calculate_tra_from_tmm(tmm_result)
            logger.info("  ✓ R, T, A calculados")
        except ImportError:
            logger.warning("  ⚠️ tra_calculator no disponible")
            tra_data = {'warning': 'TRA calculator not available'}
        except Exception as e:
            logger.warning(f"  ⚠️ Error en R,T,A: {e}")
            tra_data = {'error': str(e)}

        # ------------------------------------------------
        # 10. Constantes ópticas
        # ------------------------------------------------
        optical_constants = tmm_result.get('optical_constants', {})

        if not optical_constants or 'layers' not in optical_constants:
            logger.warning("  ⚠️ optical_constants vacío o sin layers")
            optical_constants = {
                'wavelengths': wavelengths.tolist(),
                'layers': []
            }
        else:
            logger.info(
                f"  ✅ optical_constants: "
                f"{len(optical_constants.get('layers', []))} capas"
            )

        # TMM usa 'wavelength' (singular); frontend espera 'wavelengths' (plural)
        if 'wavelength' in optical_constants and 'wavelengths' not in optical_constants:
            optical_constants['wavelengths'] = optical_constants['wavelength']

        optical_constants = ensure_json_serializable(optical_constants)

        # ------------------------------------------------
        # 11. Respuesta final
        # ------------------------------------------------
        calculation_time = time.time() - start_time

        result = {
            'success': True,
            'data': {
                'wavelengths':       wavelengths.tolist(),
                'psi_theoretical':   psi_theoretical.tolist(),
                'delta_theoretical': delta_theoretical.tolist()
            },
            'optical_constants': optical_constants,
            'tra_spectra':       ensure_json_serializable(tra_data),
            'goodness_of_fit':   ensure_json_serializable(goodness_of_fit),
            'calculation_time':  round(float(calculation_time), 3),
            'points_calculated': int(len(wavelengths))
        }

        logger.info("=" * 60)
        logger.info(f"✓ COMPLETADO EN {calculation_time:.3f} s")
        logger.info("=" * 60)

        return result

    except Exception as e:
        logger.error(f"❌ ERROR CRÍTICO: {e}", exc_info=True)
        return {
            'success':    False,
            'error':      str(e),
            'error_type': type(e).__name__
        }


# ============================================================
# UTILIDAD: R²
# ============================================================

def calculate_r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Coeficiente de determinación R²."""
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    return float(1.0 - ss_res / ss_tot) if ss_tot > 0 else 0.0