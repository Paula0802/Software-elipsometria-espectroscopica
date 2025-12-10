"""
Endpoint para cálculos teóricos de elipsometría
Permite calcular propiedades ópticas sin datos experimentales
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional
import numpy as np

# Importar módulos existentes
from ..optical.dispersion_models import get_refractive_index
from ..optical.tmm import run_tmm_calculation, calculate_psi_delta, calculate_reflectance

router = APIRouter()


# ========================================
# MODELOS DE DATOS
# ========================================

class TheoreticalOutputs(BaseModel):
    """Configuración de qué resultados calcular"""
    psi_delta: bool = True
    reflectance: bool = True
    transmittance: bool = True
    absorbance: bool = True
    absorbance_layer: bool = False


class MediumConfig(BaseModel):
    """Configuración de medio (ambiente o sustrato)"""
    type: str
    n: Optional[float] = None
    k: Optional[float] = None
    params: Optional[Dict[str, Any]] = None
    emt_model: Optional[str] = None
    components: Optional[List[Dict[str, Any]]] = None


class LayerConfig(BaseModel):
    """Configuración de una capa"""
    name: str
    thickness: float
    layer_type: str = "homogeneous"
    model: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    emt_model: Optional[str] = None
    components: Optional[List[Dict[str, Any]]] = None


class OpticalModelConfig(BaseModel):
    """Configuración completa del modelo óptico"""
    ambient: MediumConfig
    layers: List[LayerConfig]
    substrate: MediumConfig


class TheoreticalRequest(BaseModel):
    """Request para cálculo teórico"""
    wavelengths: List[float] = Field(..., description="Longitudes de onda en nm")
    angle: float = Field(..., description="Ángulo de incidencia en grados")
    model: OpticalModelConfig
    outputs: TheoreticalOutputs = TheoreticalOutputs()
    
    @validator('angle')
    def validate_angle(cls, v):
        if v < 0 or v > 90:
            raise ValueError('El ángulo debe estar entre 0 y 90 grados')
        return v
    
    @validator('wavelengths')
    def validate_wavelengths(cls, v):
        if len(v) == 0:
            raise ValueError('Debe proporcionar al menos una longitud de onda')
        if any(wl <= 0 for wl in v):
            raise ValueError('Las longitudes de onda deben ser positivas')
        return v


class TheoreticalResponse(BaseModel):
    """Respuesta con resultados teóricos"""
    wavelengths: List[float]
    psi: Optional[List[float]] = None
    delta: Optional[List[float]] = None
    reflectance: Optional[List[float]] = None
    transmittance: Optional[List[float]] = None
    absorbance: Optional[List[float]] = None
    absorbance_per_layer: Optional[Dict[str, List[float]]] = None


# ========================================
# FUNCIONES AUXILIARES
# ========================================

def get_medium_refractive_index(wavelengths: np.ndarray, medium_config: MediumConfig) -> tuple:
    """
    Obtener n, k de un medio (ambiente o sustrato)
    
    Args:
        wavelengths: Array de longitudes de onda en nm
        medium_config: Configuración del medio
    
    Returns:
        n, k: Arrays de índices de refracción
    """
    if medium_config.layer_type == "homogeneous":
        # Medio homogéneo
        if medium_config.type == "constant":
            n = np.full_like(wavelengths, medium_config.n, dtype=float)
            k = np.full_like(wavelengths, medium_config.k if medium_config.k else 0, dtype=float)
            return n, k
        
        else:
            # Modelo de dispersión
            n, k = get_refractive_index(
                wavelengths,
                medium_config.type,
                medium_config.params or {}
            )
            return n, k
    
    elif medium_config.layer_type == "emt":
        # Medio con EMT - no implementado aún
        raise NotImplementedError("EMT para medios no está implementado aún")
    
    else:
        raise ValueError(f"Tipo de medio no reconocido: {medium_config.layer_type}")


def get_layer_refractive_index(wavelengths: np.ndarray, layer_config: LayerConfig) -> tuple:
    """
    Obtener n, k de una capa
    
    Args:
        wavelengths: Array de longitudes de onda en nm
        layer_config: Configuración de la capa
    
    Returns:
        n, k: Arrays de índices de refracción
    """
    if layer_config.layer_type == "homogeneous":
        # Capa homogénea
        n, k = get_refractive_index(
            wavelengths,
            layer_config.model,
            layer_config.params or {}
        )
        return n, k
    
    elif layer_config.layer_type == "emt":
        # Capa con EMT - no implementado aún
        raise NotImplementedError("EMT para capas no está implementado aún")
    
    else:
        raise ValueError(f"Tipo de capa no reconocido: {layer_config.layer_type}")


def calculate_optical_properties(
    wavelengths: np.ndarray,
    angle: float,
    ambient_n: np.ndarray,
    ambient_k: np.ndarray,
    layers_n: List[np.ndarray],
    layers_k: List[np.ndarray],
    layers_d: List[float],
    substrate_n: np.ndarray,
    substrate_k: np.ndarray,
    outputs: TheoreticalOutputs,
    layer_names: List[str] = None
) -> dict:
    """
    Calcular propiedades ópticas usando TMM
    
    Args:
        wavelengths: Longitudes de onda en nm
        angle: Ángulo de incidencia en grados
        ambient_n, ambient_k: Índices del ambiente
        layers_n, layers_k: Listas de índices por capa
        layers_d: Espesores de capas en nm
        substrate_n, substrate_k: Índices del sustrato
        outputs: Configuración de salidas
        layer_names: Nombres de las capas (para absorbancia por capa)
    
    Returns:
        dict con resultados calculados
    """
    results = {
        'wavelengths': wavelengths.tolist()
    }
    
    n_wavelengths = len(wavelengths)
    
    # Inicializar arrays de resultados
    if outputs.psi_delta:
        psi_array = np.zeros(n_wavelengths)
        delta_array = np.zeros(n_wavelengths)
    
    if outputs.reflectance:
        R_array = np.zeros(n_wavelengths)
    
    if outputs.transmittance:
        T_array = np.zeros(n_wavelengths)
    
    if outputs.absorbance:
        A_array = np.zeros(n_wavelengths)
    
    if outputs.absorbance_layer:
        n_layers = len(layers_n)
        A_layer_arrays = {name: np.zeros(n_wavelengths) for name in layer_names}
    
    # Calcular para cada longitud de onda
    for i, wl in enumerate(wavelengths):
        # Construir índices complejos para esta λ
        n_ambient_complex = ambient_n[i] + 1j * ambient_k[i]
        n_substrate_complex = substrate_n[i] + 1j * substrate_k[i]
        
        n_layers_complex = []
        for j in range(len(layers_n)):
            n_layers_complex.append(layers_n[j][i] + 1j * layers_k[j][i])
        
        # Llamar a TMM (en desarrollo)
        # TODO: Implementar cálculo completo de TMM
        raise NotImplementedError("Cálculo de TMM no está completamente implementado aún")
        
        # # Guardar resultados (deshabilitado hasta implementar TMM)
        # if outputs.psi_delta:
        #     psi_array[i] = tmm_result['psi']
        #     delta_array[i] = tmm_result['delta']
        
        if outputs.reflectance:
            R_array[i] = tmm_result.get('R', 0)
        
        if outputs.transmittance:
            T_array[i] = tmm_result.get('T', 0)
        
        if outputs.absorbance:
            A_array[i] = tmm_result.get('A', 0)
        
        if outputs.absorbance_layer and 'absorption_per_layer' in tmm_result:
            for j, name in enumerate(layer_names):
                A_layer_arrays[name][i] = tmm_result['absorption_per_layer'][j]
    
    # Agregar resultados al diccionario
    if outputs.psi_delta:
        results['psi'] = psi_array.tolist()
        results['delta'] = delta_array.tolist()
    
    if outputs.reflectance:
        results['reflectance'] = R_array.tolist()
    
    if outputs.transmittance:
        results['transmittance'] = T_array.tolist()
    
    if outputs.absorbance:
        results['absorbance'] = A_array.tolist()
    
    if outputs.absorbance_layer:
        results['absorbance_per_layer'] = {
            name: arr.tolist() for name, arr in A_layer_arrays.items()
        }
    
    return results


# ========================================
# ENDPOINT PRINCIPAL
# ========================================

@router.post("/api/theoretical", response_model=TheoreticalResponse)
async def calculate_theoretical(request: TheoreticalRequest):
    """
    Calcular propiedades ópticas teóricas
    
    Este endpoint permite calcular Ψ, Δ, R, T, A sin necesidad de datos experimentales.
    Ideal para estudios teóricos y validación de modelos.
    """
    try:
        # Convertir wavelengths a numpy array
        wavelengths = np.array(request.wavelengths, dtype=float)
        
        # Obtener índices de refracción del ambiente
        ambient_n, ambient_k = get_medium_refractive_index(
            wavelengths,
            request.model.ambient
        )
        
        # Obtener índices de refracción de las capas
        layers_n = []
        layers_k = []
        layers_d = []
        layer_names = []
        
        for layer in request.model.layers:
            n, k = get_layer_refractive_index(wavelengths, layer)
            layers_n.append(n)
            layers_k.append(k)
            layers_d.append(layer.thickness)
            layer_names.append(layer.name)
        
        # Obtener índices de refracción del sustrato
        substrate_n, substrate_k = get_medium_refractive_index(
            wavelengths,
            request.model.substrate
        )
        
        # Calcular propiedades ópticas
        results = calculate_optical_properties(
            wavelengths=wavelengths,
            angle=request.angle,
            ambient_n=ambient_n,
            ambient_k=ambient_k,
            layers_n=layers_n,
            layers_k=layers_k,
            layers_d=layers_d,
            substrate_n=substrate_n,
            substrate_k=substrate_k,
            outputs=request.outputs,
            layer_names=layer_names
        )
        
        return TheoreticalResponse(**results)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error en el cálculo teórico: {str(e)}"
        )


# ========================================
# ENDPOINT DE VALIDACIÓN
# ========================================

@router.get("/api/theoretical/info")
async def get_theoretical_info():
    """
    Obtener información sobre los cálculos teóricos disponibles
    """
    return {
        "description": "Endpoint para cálculos teóricos de elipsometría",
        "capabilities": {
            "psi_delta": "Ángulos elipsométricos Ψ y Δ",
            "reflectance": "Reflectancia espectral",
            "transmittance": "Transmitancia espectral",
            "absorbance": "Absorbancia total",
            "absorbance_layer": "Absorbancia por capa individual"
        },
        "wavelength_range": "Cualquier rango en nm (recomendado: 200-2500 nm)",
        "angle_range": "0° - 90° (ángulo de incidencia)",
        "supported_models": [
            "constant",
            "cauchy",
            "sellmeier",
            "drude",
            "lorentz",
            "emt (Bruggeman, Maxwell-Garnett, Looyenga)"
        ],
        "documentation": "http://127.0.0.1:8000/theory.html"
    }