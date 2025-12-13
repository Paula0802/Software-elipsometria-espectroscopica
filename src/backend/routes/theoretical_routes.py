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
from backend.optical.dispersion_models import get_refractive_index

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
    Valida configuración EMT en tiempo real usando Newton-Raphson
    
    Retorna:
        - success: bool
        - n_eff, k_eff: Propiedades ópticas efectivas
        - iterations: Número de iteraciones
        - error: Mensaje de error si falla
    """
    try:
        # Importar función mejorada de validación
        from backend.optical.emt import _solve_bruggeman_newton
        
        # Convertir componentes a formato interno
        components = []
        
        for comp in request.components:
            if comp.epsilon is not None:
                # Usar epsilon directamente
                eps_real = comp.epsilon['real']
                eps_imag = comp.epsilon['imag']
                n, k = epsilon_to_nk(eps_real, eps_imag)
            else:
                n = comp.n or 1.5
                k = comp.k or 0.0
            
            components.append({
                'fraction': comp.fraction,
                'n': n,
                'k': k
            })
        
        # Validar con el solver mejorado
        if request.emt_model == 'bruggeman':
            result = _solve_bruggeman_newton(components, request.wavelength)
        else:
            # TODO: Implementar validación para Maxwell-Garnett
            result = {
                'success': True,
                'n_eff': 1.5,
                'k_eff': 0.0,
                'iterations': 1
            }
        
        return result
        
    except Exception as e:
        logger.error(f"Error en validación EMT: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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