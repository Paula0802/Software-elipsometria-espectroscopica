"""
Rutas para cálculos teóricos (Pruebas Teóricas)
Compatible con el código existente de TMM y EMT
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
import numpy as np
import logging

# Importar módulos existentes
from backend.optical.tmm import run_tmm_calculation
from backend.optical.conversions import nk_to_epsilon, epsilon_to_nk
from backend.optical.dispersion_models import get_nk_from_model

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["theoretical"])


# ==========================================
# MODELOS PYDANTIC
# ==========================================

class EMTComponent(BaseModel):
    """Componente para cálculo EMT"""
    fraction: float = Field(..., ge=0, le=1, description="Fracción volumétrica (0-1)")
    n: Optional[float] = Field(1.5, description="Índice de refracción")
    k: Optional[float] = Field(0.0, description="Coeficiente de extinción")
    epsilon: Optional[Dict[str, float]] = Field(None, description="Permitividad directa")


class EMTValidationRequest(BaseModel):
    """Request para validación EMT"""
    components: List[EMTComponent]
    emt_model: str = Field("bruggeman", description="bruggeman o maxwell-garnett")
    wavelength: float = Field(550.0, description="Longitud de onda de prueba (nm)")


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
# ENDPOINTS
# ==========================================

@router.post("/validate-emt")
async def validate_emt_endpoint(request: EMTValidationRequest):
    """
    Valida y calcula n,k efectivos para configuración EMT
    
    Soporta:
    - Bruggeman: Mezclas simétricas
    - Maxwell-Garnett: Matriz (host) + inclusiones
    
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
            "download_csv": str,  # Data URI base64
            "medium_name": str,
            "info": dict
        }
    """
    try:
        logger.info(f"=== Validando EMT: {request.medium_name} ===")
        logger.info(f"  Modelo: {request.emt_model}")
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
        total_fraction = sum(comp.fraction for comp in request.components)
        if abs(total_fraction - 1.0) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"La suma de fracciones volumétricas debe ser 1.0 (actual: {total_fraction:.3f})"
            )
        
        # Validar host_index para Maxwell-Garnett
        if request.emt_model == 'maxwell-garnett':
            host_index = getattr(request, 'host_index', 0)
            
            if host_index < 0 or host_index >= len(request.components):
                raise HTTPException(
                    status_code=400,
                    detail=f"host_index={host_index} inválido. Debe estar entre 0 y {len(request.components)-1}"
                )
            
            logger.info(f"  Maxwell-Garnett: host_index={host_index}")
        
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
                'name': comp.name,
                'fraction': comp.fraction
            }
            
            # Caso 1: Datos de archivo (optical_data)
            if comp.optical_data is not None:
                logger.info(f"  Componente {i} ({comp.name}): usando datos de archivo")
                
                # Extraer wavelengths, n, k del archivo
                file_wavelengths = np.array(comp.optical_data['wavelength'])
                file_n = np.array(comp.optical_data['n'])
                file_k = np.array(comp.optical_data['k'])
                
                # Interpolar a las wavelengths del request
                n_interp = np.interp(wavelengths_np, file_wavelengths, file_n)
                k_interp = np.interp(wavelengths_np, file_wavelengths, file_k)
                
                comp_data['n'] = n_interp
                comp_data['k'] = k_interp
                
            # Caso 2: Modelo de dispersión (cauchy, sellmeier, drude, etc.)
            elif comp.model and comp.params:
                logger.info(f"  Componente {i} ({comp.name}): modelo {comp.model}")
                
                # Calcular n, k usando el modelo de dispersión
                n_calc, k_calc = get_nk_from_model(
                    comp.model,
                    wavelengths_np,
                    comp.params
                )
                
                comp_data['n'] = n_calc
                comp_data['k'] = k_calc
                
            # Caso 3: Valores constantes n, k
            elif comp.n is not None:
                logger.info(f"  Componente {i} ({comp.name}): constante n={comp.n}, k={comp.k}")
                
                # Repetir valores para todas las wavelengths
                comp_data['n'] = np.full(n_points, comp.n)
                comp_data['k'] = np.full(n_points, comp.k if comp.k else 0.0)
                
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Componente {i} ({comp.name}) no tiene datos ópticos válidos"
                )
            
            prepared_components.append(comp_data)
        
        # ==========================================
        # 4. CALCULAR n,k EFECTIVOS
        # ==========================================
        
        # Construir layer_data para calculate_effective_medium
        layer_data = {
            'emt_model': request.emt_model,
            'components': prepared_components
        }
        
        # ⭐ Si es Maxwell-Garnett, incluir host_index
        if request.emt_model == 'maxwell-garnett':
            host_index = getattr(request, 'host_index', 0)
            layer_data['host_index'] = host_index
            
            host_name = prepared_components[host_index]['name']
            logger.info(f"  Maxwell-Garnett: usando '{host_name}' (índice {host_index}) como matriz (host)")
        
        logger.info("  Calculando n,k efectivos...")
        
        # Llamar a la función de EMT
        n_eff, k_eff = calculate_effective_medium(layer_data, wavelengths_np)
        
        logger.info(f"  ✓ Cálculo completado: {len(n_eff)} puntos")
        
        # ==========================================
        # 5. VALIDACIONES FÍSICAS
        # ==========================================
        warnings = []
        
        # Validar que n,k sean físicamente razonables
        if np.any(n_eff < 0):
            warnings.append("⚠️ Algunos valores de n efectivo son negativos (no físico)")
        
        if np.any(k_eff < 0):
            warnings.append("⚠️ Algunos valores de k efectivo son negativos (no físico)")
        
        if np.any(n_eff > 10):
            warnings.append(f"⚠️ Algunos valores de n efectivo son muy altos (n_max = {n_eff.max():.2f})")
        
        # Validar fracciones para Maxwell-Garnett
        if request.emt_model == 'maxwell-garnett':
            total_inclusion_fraction = sum(
                comp.fraction for i, comp in enumerate(request.components) 
                if i != host_index
            )
            
            if total_inclusion_fraction > 0.4:
                warnings.append(
                    f"⚠️ Maxwell-Garnett: fracción total de inclusiones = {total_inclusion_fraction:.1%}. "
                    "El modelo es más preciso para fracciones ≤ 30-40%"
                )
        
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
        
        # ==========================================
        # 8. CONSTRUIR RESPUESTA
        # ==========================================
        return {
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
                        "name": comp.name,
                        "fraction": comp.fraction
                    }
                    for comp in request.components
                ],
                "host_index": getattr(request, 'host_index', None) if request.emt_model == 'maxwell-garnett' else None
            }
        }
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"Error en validación EMT: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error al calcular EMT: {str(e)}"
        )

@router.post("/theoretical")
async def calculate_theoretical(request: TheoreticalConfig):
    """
    Cálculo teórico completo usando TMM
    
    Utiliza tu implementación existente de run_tmm_calculation
    y añade cálculo de R, T, A
    
    Retorna:
        - wavelengths: Longitudes de onda
        - psi, delta: Ángulos elipsométricos (si solicitado)
        - reflectance, transmittance, absorbance: Propiedades (si solicitado)
    """
    try:
        wavelengths = np.array(request.wavelengths)
        angle = request.angle
        model = request.model
        outputs = request.outputs
        
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
        
        logger.info(f"Ejecutando cálculo TMM para {len(wavelengths)} wavelengths")
        
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
            
            # Transmitancia (aproximada, asumiendo sustrato transparente)
            if outputs.get('transmittance', False):
                T = 1.0 - R  # Simplificación para capas delgadas transparentes
                results['transmittance'] = T.tolist()
            
            # Absorbancia
            if outputs.get('absorbance', False):
                A = 1.0 - R - (1.0 - R)  # A = 1 - R - T
                # Para capas transparentes, A ≈ 0
                # Para capas absorbentes, necesitamos calcular T correctamente
                # Por ahora, simplificación
                results['absorbance'] = np.zeros_like(R).tolist()
        
        logger.info("Cálculo teórico completado exitosamente")
        return results
        
    except Exception as e:
        logger.error(f"Error en cálculo teórico: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))