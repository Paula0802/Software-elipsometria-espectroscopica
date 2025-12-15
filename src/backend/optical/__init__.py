"""
Módulo de óptica para elipsometría espectroscópica

Este módulo contiene las implementaciones de:
- Modelos de dispersión (Cauchy, Sellmeier, Drude, Lorentz, Drude-Lorentz)
- Teoría del Medio Efectivo (EMT)
- Método de Matriz de Transferencia (TMM)
- Funciones de conversión
"""

from .dispersion_models import (
    cauchy_model,
    sellmeier_model,
    drude_model,
    lorentz_model,
    drude_lorentz_model,
    constant_model,
    get_nk_from_model,
    epsilon_to_nk,
    nk_to_epsilon,
    wavelength_to_energy,
    energy_to_wavelength
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
    nk_to_epsilon as conv_nk_to_epsilon,
    epsilon_to_nk as conv_epsilon_to_nk,
    omega_to_wavelength,
    wavelength_to_omega
)

__all__ = [
    # Dispersion models
    'cauchy_model',
    'sellmeier_model',
    'drude_model',
    'lorentz_model',
    'drude_lorentz_model',
    'constant_model',
    'get_nk_from_model',
    'epsilon_to_nk',
    'nk_to_epsilon',
    'wavelength_to_energy',
    'energy_to_wavelength',
    
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
    'conv_nk_to_epsilon',
    'conv_epsilon_to_nk',
    'omega_to_wavelength',
    'wavelength_to_omega',
]