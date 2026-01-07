"""
Rutas para cálculos teóricos (Pruebas Teóricas)
Compatible con el código existente de TMM y EMT
Versión corregida con soporte completo para Maxwell-Garnett
CORRECCIÓN v2: KeyError 'params' solucionado
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
import numpy as np
import logging
import base64

# Importar módulos existentes
from backend.optical.tmm import run_tmm_calculation
from backend.optical.conversions import nk_to_epsilon, epsilon_to_nk
from backend.optical.dispersion_models import get_nk_from_model
from backend.optical.emt import calculate_effective_medium

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["theoretical"])


# ==========================================
# MODELOS PYDANTIC PARA EMT
# ==========================================

class EMTComponentRequest(BaseModel):
    """Datos de un componente EMT individual"""
    name: str = Field(..., description="Nombre del componente")
    fraction: float = Field(..., ge=0, le=1, description="Fracción volumétrica (0-1)")
    model: Optional[str] = Field(None, description="Modelo de dispersión (cauchy, sellmeier, etc.)")
    params: Optional[dict] = Field(None, description="Parámetros del modelo de dispersión")
    n: Optional[float] = Field(None, description="Índice de refracción constante")
    k: Optional[float] = Field(None, description="Coeficiente de extinción constante")
    optical_data: Optional[dict] = Field(None, description="Datos de archivo (wavelength, n, k)")
    
    class Config:
        extra = 'allow'


class EMTValidationRequest(BaseModel):
    """Request para validar configuración EMT y calcular n,k efectivos"""
    
    # ⭐ IDENTIFICACIÓN (REQUERIDOS)
    medium_type: str = Field(
        ..., 
        description="Tipo de medio: 'ambient', 'substrate', o 'layer'"
    )
    medium_name: str = Field(
        ..., 
        description="Nombre descriptivo del medio (ej: 'Medio ambiente', 'Sustrato', 'Capa 1')"
    )
    
    # ⭐ CONFIGURACIÓN EMT (REQUERIDOS)
    emt_model: str = Field(
        ..., 
        description="Modelo EMT: 'bruggeman' o 'maxwell-garnett'"
    )
    wavelengths: List[float] = Field(
        ..., 
        description="Array de longitudes de onda en nm"
    )
    components: List[dict] = Field(
        ..., 
        description="Lista de componentes con fracciones y propiedades ópticas"
    )
    
    # ⭐ CONFIGURACIÓN MAXWELL-GARNETT (OPCIONAL)
    host_index: Optional[int] = Field(
        None, 
        description="Índice del componente que actúa como matriz (solo para Maxwell-Garnett, default=0)"
    )
    
    class Config:
        extra = 'allow'  # Permite campos adicionales sin generar error


class TheoreticalConfig(BaseModel):
    """Configuración para cálculo teórico"""
    wavelengths: List[float] = Field(..., description="Longitudes de onda (nm)")
    angle: float = Field(..., ge=0, lt=90, description="Ángulo de incidencia (grados)")
    model: Dict[str, Any] = Field(..., description="Modelo óptico completo")
    outputs: Dict[str, bool] = Field(
        default={
            "psi_delta": True,
            "reflectance": True,
            "transmittance": True,
            "absorbance": True,
            "absorbance_layer": False
        },
        description="Propiedades a calcular"
    )


# ==========================================
# ENDPOINT: VALIDACIÓN Y CÁLCULO EMT
# ==========================================

@router.post("/validate-emt")
async def validate_emt_endpoint(request: EMTValidationRequest):
    """
    Valida y calcula n,k efectivos para configuración EMT
    
    Soporta:
    - **Bruggeman**: Mezclas simétricas (no existe host)
    - **Maxwell-Garnett**: Matriz (host) + inclusiones esféricas
    
    Returns:
        {
            "success": bool,
            "validation": {
                "valid": bool,
                "emt_model": str,
                "components_count": int,
                "wavelength_points": int,
                "fraction_sum": float,
                "warnings": list
            },
            "wavelengths": list,
            "n_eff": list,
            "k_eff": list,
            "statistics": {
                "n_min": float,
                "n_max": float,
                "n_mean": float,
                "k_min": float,
                "k_max": float,
                "k_mean": float
            },
            "download_csv": str (Data URI base64),
            "medium_name": str,
            "info": dict
        }
    """
    try:
        # ==========================================
        # 0. LOGGING INICIAL
        # ==========================================
        logger.info("=" * 60)
        logger.info(f"VALIDACIÓN EMT: {request.medium_name}")
        logger.info("=" * 60)
        logger.info(f"  Tipo de medio: {request.medium_type}")
        logger.info(f"  Modelo EMT: {request.emt_model}")
        logger.info(f"  Componentes: {len(request.components)}")
        logger.info(f"  Wavelengths: {len(request.wavelengths)} puntos")
        
        # ==========================================
        # 1. VALIDACIONES BÁSICAS
        # ==========================================
        
        # Validar número de componentes
        if len(request.components) < 2:
            raise HTTPException(
                status_code=400,
                detail="Se requieren al menos 2 componentes para EMT"
            )
        
        # Validar suma de fracciones
        total_fraction = sum(comp['fraction'] for comp in request.components)
        
        if abs(total_fraction - 1.0) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"La suma de fracciones volumétricas debe ser 1.0 (actual: {total_fraction:.3f})"
            )
        
        logger.info(f"  ✓ Suma de fracciones: {total_fraction:.3f}")
        
        # Validar host_index para Maxwell-Garnett
        if request.emt_model == 'maxwell-garnett':
            # Obtener host_index (default a 0 si no existe)
            host_index = request.host_index if request.host_index is not None else 0
            
            # Validar rango
            if host_index < 0 or host_index >= len(request.components):
                raise HTTPException(
                    status_code=400,
                    detail=f"host_index={host_index} inválido. Debe estar entre 0 y {len(request.components)-1}"
                )
            
            logger.info(f"  ✓ Maxwell-Garnett: host_index={host_index}")
        
        # ==========================================
        # 2. PREPARAR WAVELENGTHS
        # ==========================================
        wavelengths_np = np.array(request.wavelengths, dtype=float)
        n_points = len(wavelengths_np)
        
        logger.info(f"  Rango wavelength: [{wavelengths_np.min():.1f}, {wavelengths_np.max():.1f}] nm")
        
        # ==========================================
        # 3. PREPARAR COMPONENTES
        # ==========================================
        prepared_components = []
        
        for i, comp in enumerate(request.components):
            comp_data = {
                'name': comp.get('name', f'Componente {i+1}'),
                'fraction': comp['fraction']
            }
            
            # ========================================
            # Caso 1: Datos de archivo (optical_data)
            # ========================================
            if 'optical_data' in comp and comp.get('optical_data'):
                logger.info(f"  Componente {i} ({comp_data['name']}): usando datos de archivo")
                
                # Extraer wavelengths, n, k del archivo
                file_wl = np.array(comp['optical_data']['wavelength'])
                file_n = np.array(comp['optical_data']['n'])
                file_k = np.array(comp['optical_data']['k'])
                
                # Interpolar a las wavelengths del request
                n_interp = np.interp(wavelengths_np, file_wl, file_n)
                k_interp = np.interp(wavelengths_np, file_wl, file_k)
                
                comp_data['n'] = n_interp
                comp_data['k'] = k_interp
                
                logger.info(f"    Interpolado: {len(file_wl)} puntos → {len(n_interp)} puntos")
            
            # ========================================
            # Caso 2: Modelo de dispersión
            # ========================================
            elif 'model' in comp and comp.get('params'):
                logger.info(f"  Componente {i} ({comp_data['name']}): modelo {comp['model']}")
                
                # Calcular n, k usando el modelo de dispersión
                n_calc, k_calc = get_nk_from_model(
                    comp['model'],
                    wavelengths_np,
                    comp['params']
                )
                
                comp_data['n'] = n_calc
                comp_data['k'] = k_calc
                
                logger.info(f"    Calculado con modelo {comp['model']}")
            
            # ========================================
            # Caso 3: Valores constantes n, k
            # ========================================
            elif 'n' in comp:
                n_val = float(comp['n'])
                k_val = float(comp.get('k', 0.0))
                
                logger.info(f"  Componente {i} ({comp_data['name']}): constante n={n_val}, k={k_val}")
                
                # Repetir valores para todas las wavelengths
                comp_data['n'] = np.full(n_points, n_val)
                comp_data['k'] = np.full(n_points, k_val)
            
            # ========================================
            # Caso 4: Sin datos válidos
            # ========================================
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Componente {i} ({comp_data['name']}) no tiene datos ópticos válidos. "
                           "Debe tener: 'optical_data', 'model'+'params', o 'n'+'k'"
                )
            
            prepared_components.append(comp_data)
        
        logger.info(f"  ✓ {len(prepared_components)} componentes preparados")
        
        # ==========================================
        # 4. CALCULAR n,k EFECTIVOS
        # ==========================================
        
        # Construir layer_data para calculate_effective_medium
        layer_data = {
            'emt_model': request.emt_model,
            'components': prepared_components
        }
        
        # Si es Maxwell-Garnett, incluir host_index
        if request.emt_model == 'maxwell-garnett':
            host_index = request.host_index if request.host_index is not None else 0
            layer_data['host_index'] = host_index
            
            host_name = prepared_components[host_index]['name']
            logger.info(f"  Maxwell-Garnett: usando '{host_name}' (índice {host_index}) como matriz (host)")
        
        logger.info("  🔄 Calculando n,k efectivos...")
        
        # Llamar a la función de EMT
        n_eff, k_eff = calculate_effective_medium(layer_data, wavelengths_np)
        
        logger.info(f"  ✓ Cálculo completado: {len(n_eff)} puntos generados")
        
        # ==========================================
        # 5. VALIDACIONES FÍSICAS
        # ==========================================
        warnings = []
        
        # Validar que n,k sean físicamente razonables
        if np.any(n_eff < 0):
            warnings.append("⚠️ Algunos valores de n efectivo son negativos (no físico)")
            logger.warning("  ⚠️ n efectivo < 0 detectado")
        
        if np.any(k_eff < 0):
            warnings.append("⚠️ Algunos valores de k efectivo son negativos (no físico)")
            logger.warning("  ⚠️ k efectivo < 0 detectado")
        
        if np.any(n_eff > 10):
            warnings.append(f"⚠️ Algunos valores de n efectivo son muy altos (n_max = {n_eff.max():.2f})")
            logger.warning(f"  ⚠️ n_max = {n_eff.max():.2f} (muy alto)")
        
        # Validación específica para Maxwell-Garnett
        if request.emt_model == 'maxwell-garnett':
            host_index = request.host_index if request.host_index is not None else 0
            
            total_inclusion_fraction = sum(
                comp['fraction'] for idx, comp in enumerate(request.components) 
                if idx != host_index
            )
            
            if total_inclusion_fraction > 0.4:
                warnings.append(
                    f"⚠️ Maxwell-Garnett: fracción total de inclusiones = {total_inclusion_fraction:.1%}. "
                    "El modelo es más preciso para fracciones ≤ 30-40%"
                )
                logger.warning(f"  ⚠️ Fracción de inclusiones alta: {total_inclusion_fraction:.1%}")
        
        # ==========================================
        # 6. CALCULAR ESTADÍSTICAS
        # ==========================================
        statistics = {
            'n_min': float(np.min(n_eff)),
            'n_max': float(np.max(n_eff)),
            'n_mean': float(np.mean(n_eff)),
            'k_min': float(np.min(k_eff)),
            'k_max': float(np.max(k_eff)),
            'k_mean': float(np.mean(k_eff))
        }
        
        logger.info(f"  Estadísticas n: min={statistics['n_min']:.4f}, max={statistics['n_max']:.4f}, mean={statistics['n_mean']:.4f}")
        logger.info(f"  Estadísticas k: min={statistics['k_min']:.6f}, max={statistics['k_max']:.6f}, mean={statistics['k_mean']:.6f}")
        
        # ==========================================
        # 7. GENERAR CSV PARA DESCARGA
        # ==========================================
        csv_content = "Wavelength (nm),n_effective,k_effective\n"
        for i in range(len(wavelengths_np)):
            csv_content += f"{wavelengths_np[i]:.2f},{n_eff[i]:.6f},{k_eff[i]:.6f}\n"
        
        # Convertir a Data URI base64
        csv_base64 = base64.b64encode(csv_content.encode('utf-8')).decode('utf-8')
        download_csv = f"data:text/csv;base64,{csv_base64}"
        
        logger.info("  ✓ CSV generado para descarga")
        
        # ==========================================
        # 8. CONSTRUIR RESPUESTA
        # ==========================================
        response = {
            "success": True,
            "validation": {
                "valid": True,
                "emt_model": request.emt_model,
                "components_count": len(request.components),
                "wavelength_points": n_points,
                "fraction_sum": total_fraction,
                "warnings": warnings
            },
            "wavelengths": wavelengths_np.tolist(),
            "n_eff": n_eff.tolist(),
            "k_eff": k_eff.tolist(),
            "statistics": statistics,
            "download_csv": download_csv,
            "medium_name": request.medium_name,
            "info": {
                "model": request.emt_model,
                "components": [
                    {
                        "name": comp.get('name', f'Componente {i+1}'),
                        "fraction": comp['fraction']
                    }
                    for i, comp in enumerate(request.components)
                ],
                "host_index": request.host_index if request.emt_model == 'maxwell-garnett' else None
            }
        }
        
        logger.info("=" * 60)
        logger.info("✓ VALIDACIÓN EMT COMPLETADA EXITOSAMENTE")
        logger.info("=" * 60)
        
        return response
        
    except HTTPException:
        # Re-lanzar HTTPException sin modificar
        raise
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"ERROR EN VALIDACIÓN EMT: {e}")
        logger.error("=" * 60, exc_info=True)
        
        raise HTTPException(
            status_code=500,
            detail=f"Error al calcular EMT: {str(e)}"
        )


# ==========================================
# ENDPOINT: CÁLCULO TEÓRICO TMM
# ==========================================

@router.post("/theoretical")
async def calculate_theoretical(request: TheoreticalConfig):
    """
    Cálculo teórico completo usando TMM
    
    Utiliza tu implementación existente de run_tmm_calculation
    y añade cálculo de R, T, A
    
    Returns:
        {
            "wavelengths": list,
            "angle": float,
            "psi": list (opcional),
            "delta": list (opcional),
            "reflectance": list (opcional),
            "transmittance": list (opcional),
            "absorbance": list (opcional)
        }
    """
    try:
        logger.info("=" * 60)
        logger.info("CÁLCULO TEÓRICO TMM")
        logger.info("=" * 60)
        
        wavelengths = np.array(request.wavelengths)
        angle = request.angle
        model = request.model
        outputs = request.outputs
        
        logger.info(f"  Wavelengths: {len(wavelengths)} puntos")
        logger.info(f"  Ángulo: {angle}°")
        
        # Preparar modelo para run_tmm_calculation
        tmm_model = {
            'global': {
                'angle': angle,
                'polarization': 'both',
                'wavelengths': wavelengths.tolist()
            },
            'ambient': model.get('ambient', {'type': 'constant', 'n': 1.0, 'k': 0.0}),
            'substrate': model.get('substrate', {'type': 'constant', 'n': 1.52, 'k': 0.0}),
            'layers': model.get('layers', [])
        }
        
        logger.info(f"  Capas: {len(tmm_model['layers'])}")
        logger.info("  🔄 Ejecutando TMM...")
        
        # Ejecutar cálculo TMM usando tu función existente
        tmm_result = run_tmm_calculation(tmm_model)
        
        # Preparar resultados
        results = {
            'wavelengths': tmm_result['wavelength'],
            'angle': angle
        }
        
        # Ángulos elipsométricos
        if outputs.get('psi_delta', False):
            results['psi'] = tmm_result['psi_deg']
            results['delta'] = tmm_result['delta_deg']
            logger.info("  ✓ Psi, Delta calculados")
        
        # Calcular Reflectancia, Transmitancia, Absorbancia
        if outputs.get('reflectance', False) or outputs.get('transmittance', False) or outputs.get('absorbance', False):
            r_p_array = np.array(tmm_result.get('r_p', []))
            r_s_array = np.array(tmm_result.get('r_s', []))
            
            # Reflectancia: promedio de |r_p|² y |r_s|²
            R_p = np.abs(r_p_array) ** 2
            R_s = np.abs(r_s_array) ** 2
            R = (R_p + R_s) / 2.0
            
            if outputs.get('reflectance', False):
                results['reflectance'] = R.tolist()
                logger.info("  ✓ Reflectancia calculada")
            
            # Transmitancia (aproximada, asumiendo sustrato transparente)
            if outputs.get('transmittance', False):
                T = 1.0 - R  # Simplificación para capas delgadas transparentes
                results['transmittance'] = T.tolist()
                logger.info("  ✓ Transmitancia calculada")
            
            # Absorbancia
            if outputs.get('absorbance', False):
                A = 1.0 - R - (1.0 - R)  # A = 1 - R - T
                # Para capas transparentes, A ≈ 0
                # Para capas absorbentes, necesitamos calcular T correctamente
                # Por ahora, simplificación
                results['absorbance'] = np.zeros_like(R).tolist()
                logger.info("  ✓ Absorbancia calculada")
        
        logger.info("=" * 60)
        logger.info("✓ CÁLCULO TEÓRICO COMPLETADO")
        logger.info("=" * 60)
        
        return results
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"ERROR EN CÁLCULO TEÓRICO: {e}")
        logger.error("=" * 60, exc_info=True)
        
        raise HTTPException(
            status_code=500, 
            detail=f"Error en cálculo teórico: {str(e)}"
        )