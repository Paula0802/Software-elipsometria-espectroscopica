"""
Conversiones entre representaciones ópticas
"""
import numpy as np


def epsilon_to_nk(epsilon1, epsilon2):
    """
    Convierte ε₁, ε₂ a n, k
    
    Relación:
        ε = ε₁ + iε₂ = (n + ik)²
    
    Args:
        epsilon1: Parte real de la permitividad dieléctrica
        epsilon2: Parte imaginaria de la permitividad dieléctrica
    
    Returns:
        n: Índice de refracción
        k: Coeficiente de extinción
    """
    epsilon1 = np.asarray(epsilon1, dtype=float)
    epsilon2 = np.asarray(epsilon2, dtype=float)
    
    epsilon_mag = np.sqrt(epsilon1**2 + epsilon2**2)
    n = np.sqrt((epsilon_mag + epsilon1) / 2.0)
    k = np.sqrt((epsilon_mag - epsilon1) / 2.0)
    
    return n, k


def nk_to_epsilon(n, k):
    """
    Convierte n, k a ε₁, ε₂
    
    Relación:
        ε₁ = n² - k²
        ε₂ = 2nk
    
    Args:
        n: Índice de refracción
        k: Coeficiente de extinción
    
    Returns:
        epsilon1: Parte real de la permitividad dieléctrica
        epsilon2: Parte imaginaria de la permitividad dieléctrica
    """
    n = np.asarray(n, dtype=float)
    k = np.asarray(k, dtype=float)
    
    epsilon1 = n**2 - k**2
    epsilon2 = 2 * n * k
    
    return epsilon1, epsilon2


# ==========================================
# CONVERSIONES DE ENERGÍA Y LONGITUD DE ONDA
# ==========================================

def omega_to_wavelength(omega_eV: np.ndarray) -> np.ndarray:
    """
    Convierte energía fotónica (eV) a longitud de onda (nm)
    
    Args:
        omega_eV: Array de energías en eV
    
    Returns:
        wavelength_nm: Array de longitudes de onda en nm
    
    Fórmula:
        E = hc/λ
        λ = hc/E
        
    donde:
        h = 4.135667696×10⁻¹⁵ eV·s (constante de Planck)
        c = 2.99792458×10⁸ m/s (velocidad de la luz)
    
    Ejemplo:
        >>> omega = np.array([1.0, 2.0, 3.0])  # eV
        >>> wl = omega_to_wavelength(omega)
        >>> print(wl)  # [1239.84, 619.92, 413.28] nm
    
    Notas:
        - Comúnmente usado en espectroscopía óptica
        - λ(nm) ≈ 1239.84 / E(eV)
    """
    omega_eV = np.asarray(omega_eV, dtype=float)
    
    # Constantes fundamentales
    h_eV_s = 4.135667696e-15  # eV·s (constante de Planck)
    c_m_s = 299792458  # m/s (velocidad de la luz)
    
    # λ (m) = hc/E
    wavelength_m = (h_eV_s * c_m_s) / omega_eV
    
    # Convertir a nm
    wavelength_nm = wavelength_m * 1e9
    
    return wavelength_nm


def wavelength_to_omega(wavelength_nm: np.ndarray) -> np.ndarray:
    """
    Convierte longitud de onda (nm) a energía fotónica (eV)
    
    Args:
        wavelength_nm: Array de longitudes de onda en nm
    
    Returns:
        omega_eV: Array de energías en eV
    
    Fórmula:
        E = hc/λ
    
    Ejemplo:
        >>> wl = np.array([400, 500, 600])  # nm (azul, verde, rojo)
        >>> omega = wavelength_to_omega(wl)
        >>> print(omega)  # [3.10, 2.48, 2.07] eV
    
    Notas:
        - Útil para convertir espectros λ → E
        - Región visible: ~380-750 nm → ~3.26-1.65 eV
    """
    wavelength_nm = np.asarray(wavelength_nm, dtype=float)
    
    # Constantes fundamentales
    h_eV_s = 4.135667696e-15  # eV·s
    c_m_s = 299792458  # m/s
    
    # Convertir nm a m
    wavelength_m = wavelength_nm * 1e-9
    
    # E = hc/λ
    omega_eV = (h_eV_s * c_m_s) / wavelength_m
    
    return omega_eV


def eV_to_nm(energy_eV):
    """
    Atajo: Convierte energía (eV) a longitud de onda (nm)
    Alias de omega_to_wavelength para conveniencia
    
    Args:
        energy_eV: Energía en eV (float o array)
    
    Returns:
        wavelength_nm: Longitud de onda en nm
    """
    return omega_to_wavelength(energy_eV)


def nm_to_eV(wavelength_nm):
    """
    Atajo: Convierte longitud de onda (nm) a energía (eV)
    Alias de wavelength_to_omega para conveniencia
    
    Args:
        wavelength_nm: Longitud de onda en nm (float o array)
    
    Returns:
        energy_eV: Energía en eV
    """
    return wavelength_to_omega(wavelength_nm)


# ==========================================
# CONVERSIONES DE ÁNGULOS
# ==========================================

def degrees_to_radians(degrees):
    """
    Convierte ángulos de grados a radianes
    
    Args:
        degrees: Ángulo en grados (float o array)
    
    Returns:
        radians: Ángulo en radianes
    
    Ejemplo:
        >>> deg = 45.0
        >>> rad = degrees_to_radians(deg)
        >>> print(rad)  # 0.7853981633974483 (π/4)
    
    Notas:
        - π radianes = 180°
        - rad = deg × (π/180)
    """
    degrees = np.asarray(degrees, dtype=float)
    radians = degrees * (np.pi / 180.0)
    return radians


def radians_to_degrees(radians):
    """
    Convierte ángulos de radianes a grados
    
    Args:
        radians: Ángulo en radianes (float o array)
    
    Returns:
        degrees: Ángulo en grados
    
    Ejemplo:
        >>> rad = np.pi / 4
        >>> deg = radians_to_degrees(rad)
        >>> print(deg)  # 45.0
    
    Notas:
        - 180° = π radianes
        - deg = rad × (180/π)
    """
    radians = np.asarray(radians, dtype=float)
    degrees = radians * (180.0 / np.pi)
    return degrees