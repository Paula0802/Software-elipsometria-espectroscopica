"""
Funciones de conversión para parámetros ópticos
"""
import numpy as np


def nk_to_epsilon(n, k):
    """
    Convierte índice de refracción complejo (n, k) a permitividad dieléctrica compleja (ε)
    
    ε = (n + ik)² = (n² - k²) + i(2nk)
    
    Args:
        n: Parte real del índice de refracción (puede ser array)
        k: Parte imaginaria del índice de refracción (puede ser array)
    
    Returns:
        tuple: (epsilon1, epsilon2) - partes real e imaginaria de ε
    """
    n = np.asarray(n, dtype=complex)
    k = np.asarray(k, dtype=complex)
    
    epsilon = (n + 1j * k) ** 2
    
    epsilon1 = np.real(epsilon)  # Parte real
    epsilon2 = np.imag(epsilon)  # Parte imaginaria
    
    return epsilon1, epsilon2


def epsilon_to_nk(epsilon1, epsilon2):
    """
    Convierte permitividad dieléctrica compleja (ε) a índice de refracción complejo (n, k)
    
    n = sqrt((|ε| + ε₁) / 2)
    k = sqrt((|ε| - ε₁) / 2)
    
    donde |ε| = sqrt(ε₁² + ε₂²)
    
    Args:
        epsilon1: Parte real de la permitividad
        epsilon2: Parte imaginaria de la permitividad
    
    Returns:
        tuple: (n, k) - índice de refracción complejo
    """
    epsilon1 = np.asarray(epsilon1, dtype=float)
    epsilon2 = np.asarray(epsilon2, dtype=float)
    
    # Magnitud de epsilon
    eps_abs = np.sqrt(epsilon1**2 + epsilon2**2)
    
    # Cálculo de n y k
    n = np.sqrt((eps_abs + epsilon1) / 2.0)
    k = np.sqrt((eps_abs - epsilon1) / 2.0)
    
    return n, k


def omega_to_wavelength(omega, unit="eV"):
    """
    Convierte energía (ω) a longitud de onda (λ) en nm
    
    λ = hc / E
    
    Args:
        omega: Energía (puede ser array)
        unit: Unidad de energía ('eV' o 'rad/s')
    
    Returns:
        wavelength: Longitud de onda en nanómetros
    """
    omega = np.asarray(omega, dtype=float)
    
    hc = 1239.84193  # eV·nm (constante de Planck × velocidad de la luz)
    
    if unit == "eV":
        wavelength = hc / omega
    elif unit == "rad/s":
        hbar = 6.582119569e-16  # eV·s (constante de Planck reducida)
        energy_eV = omega * hbar
        wavelength = hc / energy_eV
    else:
        # Asumir que ya está en nm
        wavelength = omega
    
    return wavelength


def wavelength_to_omega(wavelength, unit="eV"):
    """
    Convierte longitud de onda (λ) en nm a energía (ω)
    
    E = hc / λ
    
    Args:
        wavelength: Longitud de onda en nanómetros (puede ser array)
        unit: Unidad de salida deseada ('eV' o 'rad/s')
    
    Returns:
        omega: Energía en la unidad especificada
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    hc = 1239.84193  # eV·nm
    
    if unit == "eV":
        omega = hc / wavelength
    elif unit == "rad/s":
        hbar = 6.582119569e-16  # eV·s
        energy_eV = hc / wavelength
        omega = energy_eV / hbar
    else:
        omega = wavelength
    
    return omega


def degrees_to_radians(degrees):
    """Convierte grados a radianes"""
    return np.deg2rad(degrees)


def radians_to_degrees(radians):
    """Convierte radianes a grados"""
    return np.rad2deg(radians)