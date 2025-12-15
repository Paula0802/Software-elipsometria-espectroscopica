"""
dispersion_models.py
Funciones para calcular n,k a partir de modelos de dispersión óptica.
"""

import numpy as np

def cauchy_model(wavelengths, params):
    """
    Modelo de Cauchy: n(λ) = A + B/λ² + C/λ⁴
    
    Args:
        wavelengths: array de longitudes de onda en nm
        params: dict con 'A', 'B', 'C'
    
    Returns:
        tuple (n_array, k_array) donde k=0 para Cauchy
    """
    A = params.get('A', 1.5)
    B = params.get('B', 0.0)
    C = params.get('C', 0.0)
    
    lam = np.array(wavelengths)
    n = A + B / (lam**2) + C / (lam**4)
    k = np.zeros_like(n)
    
    return n, k


def sellmeier_model(wavelengths, params):
    """
    Modelo de Sellmeier: n²(λ) = 1 + Σ(Bⱼλ²/(λ² - Cⱼ))
    
    Args:
        wavelengths: array de longitudes de onda en nm
        params: dict con 'B1', 'C1', 'B2', 'C2', etc. (hasta 10 términos)
    
    Returns:
        tuple (n_array, k_array) donde k=0 para Sellmeier
    """
    lam = np.array(wavelengths) / 1000.0  # Convertir nm a μm
    n_squared = np.ones_like(lam)
    
    # Hasta 10 términos
    for i in range(1, 11):
        B_key = f'B{i}'
        C_key = f'C{i}'
        
        if B_key in params and C_key in params:
            B = params[B_key]
            C = params[C_key]
            
            if B is not None and C is not None:
                n_squared += (B * lam**2) / (lam**2 - C)
    
    n = np.sqrt(n_squared)
    k = np.zeros_like(n)
    
    return n, k


def drude_model(wavelengths, params):
    """
    Modelo de Drude: ε(E) = ε∞ - Eₚ²/(E² + iΓ_D·E)
    
    Args:
        wavelengths: array de longitudes de onda en nm
        params: dict con 'eps_inf', 'E_p' (eV), 'Gamma_D' (eV)
    
    Returns:
        tuple (n_array, k_array)
    """
    eps_inf = params.get('eps_inf', 1.0)
    E_p = params.get('E_p', 1.0)
    Gamma_D = params.get('Gamma_D', 0.1)
    
    # Convertir longitud de onda (nm) a energía (eV)
    lam_nm = np.array(wavelengths)
    E = 1239.84 / lam_nm  # E [eV] = hc/λ
    
    # Modelo de Drude
    denominator = E**2 + 1j * Gamma_D * E
    epsilon = eps_inf - (E_p**2) / denominator
    
    # Convertir permitividad compleja a n, k
    n = np.real(np.sqrt(epsilon))
    k = np.imag(np.sqrt(epsilon))
    
    return n, k


def lorentz_model(wavelengths, params):
    """
    Modelo de Lorentz: ε(E) = ε∞ + Σ(Aⱼ·E₀ⱼ²/(E₀ⱼ² - E² - iΓⱼ·E))
    
    Args:
        wavelengths: array de longitudes de onda en nm
        params: dict con 'eps_inf', 'A1', 'E0_1', 'Gamma_1', etc. (hasta 10 osciladores)
    
    Returns:
        tuple (n_array, k_array)
    """
    eps_inf = params.get('eps_inf', 1.0)
    
    # Convertir longitud de onda (nm) a energía (eV)
    lam_nm = np.array(wavelengths)
    E = 1239.84 / lam_nm
    
    epsilon = np.ones_like(E, dtype=complex) * eps_inf
    
    # Hasta 10 osciladores
    for i in range(1, 11):
        A_key = f'A{i}'
        E0_key = f'E0_{i}'
        Gamma_key = f'Gamma_{i}'
        
        if A_key in params and E0_key in params and Gamma_key in params:
            A = params[A_key]
            E0 = params[E0_key]
            Gamma = params[Gamma_key]
            
            if A is not None and E0 is not None and Gamma is not None:
                numerator = A * E0**2
                denominator = E0**2 - E**2 - 1j * Gamma * E
                epsilon += numerator / denominator
    
    # Convertir permitividad compleja a n, k
    sqrt_epsilon = np.sqrt(epsilon)
    n = np.real(sqrt_epsilon)
    k = np.imag(sqrt_epsilon)
    
    return n, k


def drude_lorentz_model(wavelengths, params):
    """
    Modelo de Drude-Lorentz: Combinación de término Drude + osciladores Lorentz
    ε(E) = ε∞ - Eₚ²/(E² + iΓ_D·E) + Σ(Aⱼ·Eⱼ²/(Eⱼ² - E² - iΓⱼ·E))
    
    Args:
        wavelengths: array de longitudes de onda en nm
        params: dict con:
            - 'eps_inf': permitividad de fondo
            - 'E_p': energía de plasma Drude (eV)
            - 'Gamma_D': amortiguamiento Drude (eV)
            - 'A1', 'E1', 'Gamma_1': oscilador Lorentz 1
            - 'A2', 'E2', 'Gamma_2': oscilador Lorentz 2
            - ... hasta 5 osciladores Lorentz
    
    Returns:
        tuple (n_array, k_array)
    """
    eps_inf = params.get('eps_inf', 1.0)
    E_p = params.get('E_p', 1.0)
    Gamma_D = params.get('Gamma_D', 0.1)
    
    # Convertir longitud de onda (nm) a energía (eV)
    lam_nm = np.array(wavelengths)
    E = 1239.84 / lam_nm
    
    # Término Drude
    drude_term = -(E_p**2) / (E**2 + 1j * Gamma_D * E)
    
    # Inicializar permitividad con fondo + Drude
    epsilon = np.ones_like(E, dtype=complex) * eps_inf + drude_term
    
    # Términos Lorentz (hasta 5 osciladores)
    for i in range(1, 6):
        A_key = f'A{i}'
        E_key = f'E{i}'
        Gamma_key = f'Gamma_{i}'
        
        if A_key in params and E_key in params and Gamma_key in params:
            A = params[A_key]
            E0 = params[E_key]
            Gamma = params[Gamma_key]
            
            if A is not None and E0 is not None and Gamma is not None:
                numerator = A * E0**2
                denominator = E0**2 - E**2 - 1j * Gamma * E
                epsilon += numerator / denominator
    
    # Convertir permitividad compleja a n, k
    sqrt_epsilon = np.sqrt(epsilon)
    n = np.real(sqrt_epsilon)
    k = np.imag(sqrt_epsilon)
    
    return n, k


def constant_model(wavelengths, params):
    """
    Modelo constante: n y k constantes para todas las longitudes de onda.
    
    Args:
        wavelengths: array de longitudes de onda en nm
        params: dict con 'n' y 'k'
    
    Returns:
        tuple (n_array, k_array)
    """
    n_const = params.get('n', 1.5)
    k_const = params.get('k', 0.0)
    
    n = np.full_like(wavelengths, n_const, dtype=float)
    k = np.full_like(wavelengths, k_const, dtype=float)
    
    return n, k


def get_nk_from_model(model_type, wavelengths, params):
    """
    Función principal para obtener n,k desde cualquier modelo de dispersión.
    
    Args:
        model_type: str - 'cauchy', 'sellmeier', 'drude', 'lorentz', 'drude-lorentz', 'constant'
        wavelengths: array de longitudes de onda en nm
        params: dict con parámetros del modelo
    
    Returns:
        tuple (n_array, k_array)
    
    Raises:
        ValueError: si el modelo no es reconocido
    """
    model_map = {
        'cauchy': cauchy_model,
        'sellmeier': sellmeier_model,
        'drude': drude_model,
        'lorentz': lorentz_model,
        'drude-lorentz': drude_lorentz_model,
        'constant': constant_model
    }
    
    if model_type not in model_map:
        raise ValueError(f"Modelo '{model_type}' no reconocido. Opciones: {list(model_map.keys())}")
    
    return model_map[model_type](wavelengths, params)


# ============================================
# FUNCIONES DE UTILIDAD
# ============================================

def epsilon_to_nk(epsilon_complex):
    """
    Convierte permitividad compleja ε = ε₁ + iε₂ a índice de refracción n,k
    
    Args:
        epsilon_complex: array complejo con permitividad
    
    Returns:
        tuple (n_array, k_array)
    """
    sqrt_eps = np.sqrt(epsilon_complex)
    n = np.real(sqrt_eps)
    k = np.imag(sqrt_eps)
    return n, k


def nk_to_epsilon(n, k):
    """
    Convierte índice de refracción (n,k) a permitividad compleja
    
    Args:
        n: array con parte real del índice
        k: array con parte imaginaria del índice
    
    Returns:
        array complejo con permitividad ε = ε₁ + iε₂
    """
    n_complex = n + 1j * k
    epsilon = n_complex ** 2
    return epsilon


def wavelength_to_energy(wavelength_nm):
    """
    Convierte longitud de onda (nm) a energía (eV)
    
    Args:
        wavelength_nm: longitud de onda en nanómetros
    
    Returns:
        energía en electronvoltios
    """
    return 1239.84 / np.array(wavelength_nm)


def energy_to_wavelength(energy_ev):
    """
    Convierte energía (eV) a longitud de onda (nm)
    
    Args:
        energy_ev: energía en electronvoltios
    
    Returns:
        longitud de onda en nanómetros
    """
    return 1239.84 / np.array(energy_ev)












