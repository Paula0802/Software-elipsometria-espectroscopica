"""
Módulo de óptica - Modelos de dispersión, EMT, TMM y conversiones
"""

from .dispersion_models import (
    get_nk_from_model,
    cauchy_model,
    sellmeier_model,
    custom_model,
    validate_dispersion_params
)

from .emt import (
    calculate_effective_medium,
    bruggeman_emt,
    maxwell_garnett_emt
)


from .tmm import (
    calculate_reflectance,
    calculate_psi_delta,
    run_tmm_calculation
)

from .conversions import (
    nk_to_epsilon,
    epsilon_to_nk,
    omega_to_wavelength
)

__all__ = [
    # Dispersion models
    'get_nk_from_model',
    'cauchy_model',
    'sellmeier_model',
    'custom_model',
    'validate_dispersion_params',
    # EMT
    'calculate_effective_medium',
    'bruggeman_emt',
    'maxwell_garnett_emt',
    # TMM
    'calculate_reflectance',
    'calculate_psi_delta',
    'run_tmm_calculation',
    # Conversions
    'nk_to_epsilon',
    'epsilon_to_nk',
    'omega_to_wavelength',
]
