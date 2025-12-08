"""
Módulo de óptica para elipsometría espectroscópica

Este módulo contiene las implementaciones de:
- Modelos de dispersión (Cauchy, Sellmeier, Drude, Lorentz)
- Teoría del Medio Efectivo (EMT)
- Método de Matriz de Transferencia (TMM)
- Funciones de conversión
"""

from .dispersion_models import (
    cauchy_model,
    sellmeier_model,
    drude_model,
    lorentz_model,
    get_refractive_index
)

from .emt import (
    bruggeman_emt,
    maxwell_garnett_emt,
    calculate_effective_medium
)

from .tmm import (
    transfer_matrix,
    calculate_reflectance,
    calculate_psi_delta,
    run_tmm_calculation
)

from .conversions import (
    nk_to_epsilon,
    epsilon_to_nk,
    omega_to_wavelength,
    wavelength_to_omega
)

__all__ = [
    # Dispersion models
    'cauchy_model',
    'sellmeier_model',
    'drude_model',
    'lorentz_model',
    'get_refractive_index',
    
    # EMT
    'bruggeman_emt',
    'maxwell_garnett_emt',
    'calculate_effective_medium',
    
    # TMM
    'transfer_matrix',
    'calculate_reflectance',
    'calculate_psi_delta',
    'run_tmm_calculation',
    
    # Conversions
    'nk_to_epsilon',
    'epsilon_to_nk',
    'omega_to_wavelength',
    'wavelength_to_omega',
]