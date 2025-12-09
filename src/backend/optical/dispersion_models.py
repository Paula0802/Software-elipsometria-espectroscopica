"""
Modelos de dispersión para materiales ópticos
Versión completa con soporte para ecuaciones LaTeX personalizadas
"""
import numpy as np
from .conversions import epsilon_to_nk, wavelength_to_omega


def cauchy_model(wavelength, A, B=0, C=0):
    """
    Modelo de dispersión de Cauchy
    
    n(λ) = A + B/λ² + C/λ⁴
    
    Args:
        wavelength: Longitud de onda en nm (array)
        A, B, C: Parámetros de Cauchy
    
    Returns:
        n: Índice de refracción (k = 0 para Cauchy)
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir nm a μm para mejor estabilidad numérica
    wl_um = wavelength / 1000.0
    
    n = A + B / (wl_um ** 2) + C / (wl_um ** 4)
    k = np.zeros_like(n)  # Cauchy no tiene absorción
    
    return n, k


def sellmeier_model(wavelength, B1, C1, B2=0, C2=0, B3=0, C3=0):
    """
    Modelo de dispersión de Sellmeier
    
    n²(λ) = 1 + Σⱼ (Bⱼ·λ²) / (λ² - Cⱼ)
    
    IMPORTANTE: La ecuación da n² (n al cuadrado), por lo que se debe
    tomar la raíz cuadrada para obtener n.
    
    Args:
        wavelength: Longitud de onda en nm (array)
        B1, C1, B2, C2, B3, C3: Parámetros de Sellmeier
    
    Returns:
        n: Índice de refracción (k = 0 para Sellmeier)
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir nm a μm
    wl_um = wavelength / 1000.0
    wl2 = wl_um ** 2
    
    # Inicializar n² = 1 (parte constante de Sellmeier)
    n_squared = 1.0
    
    # Término 1
    if B1 != 0 and C1 != 0:
        n_squared += (B1 * wl2) / (wl2 - C1)
    
    # Término 2
    if B2 != 0 and C2 != 0:
        n_squared += (B2 * wl2) / (wl2 - C2)
    
    # Término 3
    if B3 != 0 and C3 != 0:
        n_squared += (B3 * wl2) / (wl2 - C3)
    
    # ⭐ IMPORTANTE: Asegurar que n² sea positivo antes de tomar raíz
    # En casos edge, n² podría ser negativo si los parámetros están mal
    n_squared = np.maximum(n_squared, 1e-10)  # Evitar valores negativos o cero
    
    # ⭐ Despejar n: n = √(n²)
    n = np.sqrt(n_squared)
    k = np.zeros_like(n)
    
    return n, k


def drude_model(wavelength, eps_inf, omega_p, gamma):
    """
    Modelo de Drude para metales
    
    ε(ω) = ε∞ - ωₚ² / (ω² + iγω)
    
    Args:
        wavelength: Longitud de onda en nm (array)
        eps_inf: Permitividad a alta frecuencia (ε∞)
        omega_p: Frecuencia del plasma en eV
        gamma: Factor de amortiguamiento en eV
    
    Returns:
        n, k: Índice de refracción complejo
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir λ a ω (en eV)
    hc = 1239.84193  # eV·nm
    omega = hc / wavelength
    
    # Modelo de Drude
    omega_p_sq = omega_p ** 2
    omega_sq = omega ** 2
    
    epsilon_real = eps_inf - omega_p_sq / (omega_sq + gamma ** 2)
    epsilon_imag = (omega_p_sq * gamma) / (omega * (omega_sq + gamma ** 2))
    
    # Convertir ε a n, k
    n, k = epsilon_to_nk(epsilon_real, epsilon_imag)
    
    return n, k


def lorentz_model(wavelength, eps_inf, f1, omega_1, gamma_1, f2=0, omega_2=0, gamma_2=0):
    """
    Modelo de Lorentz para dieléctricos
    
    ε(ω) = ε∞ + Σⱼ (fⱼ·ωⱼ²) / (ωⱼ² - ω² - iγⱼω)
    
    Args:
        wavelength: Longitud de onda en nm (array)
        eps_inf: Permitividad a alta frecuencia
        f1, omega_1, gamma_1: Fuerza, frecuencia y amortiguamiento del oscilador 1 (en eV)
        f2, omega_2, gamma_2: Parámetros opcionales del oscilador 2
    
    Returns:
        n, k: Índice de refracción complejo
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir λ a ω (en eV)
    hc = 1239.84193  # eV·nm
    omega = hc / wavelength
    omega_sq = omega ** 2
    
    epsilon = eps_inf + 0j
    
    # Oscilador 1
    if f1 != 0 and omega_1 != 0:
        omega_1_sq = omega_1 ** 2
        denominator = omega_1_sq - omega_sq - 1j * gamma_1 * omega
        epsilon += (f1 * omega_1_sq) / denominator
    
    # Oscilador 2 (opcional)
    if f2 != 0 and omega_2 != 0:
        omega_2_sq = omega_2 ** 2
        denominator = omega_2_sq - omega_sq - 1j * gamma_2 * omega
        epsilon += (f2 * omega_2_sq) / denominator
    
    epsilon_real = np.real(epsilon)
    epsilon_imag = np.imag(epsilon)
    
    # Convertir ε a n, k
    n, k = epsilon_to_nk(epsilon_real, epsilon_imag)
    
    return n, k


def constant_model(wavelength, n_const, k_const=0):
    """
    Modelo de índice de refracción constante (independiente de λ)
    
    Args:
        wavelength: Longitud de onda en nm (array)
        n_const: Índice de refracción constante
        k_const: Coeficiente de extinción constante
    
    Returns:
        n, k: Arrays con valores constantes
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    n = np.full_like(wavelength, n_const, dtype=float)
    k = np.full_like(wavelength, k_const, dtype=float)
    
    return n, k


def custom_equation_model(wavelength, equation_latex):
    """
    ⭐ NUEVO: Evalúa una ecuación LaTeX personalizada para n(λ)
    
    El usuario puede definir su propia ecuación para el índice de refracción
    en función de la longitud de onda.
    
    Args:
        wavelength: Array de longitudes de onda en nm
        equation_latex: Ecuación en formato LaTeX (string)
                       Ejemplo: "1.5 + \\frac{0.004}{\\lambda^2}"
        
    Returns:
        n, k: Índice de refracción (k=0 para ecuaciones personalizadas simples)
    
    Notas:
        - La variable λ debe escribirse como \\lambda en LaTeX
        - Se reemplaza automáticamente por el valor numérico
        - Usa sympy para parsear y evaluar la ecuación
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    try:
        import sympy as sp
        
        # Definir símbolo para lambda (longitud de onda)
        lam = sp.Symbol('lambda', real=True, positive=True)
        
        # Reemplazar \lambda LaTeX con 'lambda' para sympy
        equation_str = equation_latex.replace('\\lambda', 'lambda')
        
        # También permitir 'wl' como alternativa
        equation_str = equation_str.replace('wl', 'lambda')
        
        # Parsear la ecuación LaTeX a expresión sympy
        expr = sp.sympify(equation_str)
        
        # Convertir a función numérica para evaluación rápida
        func = sp.lambdify(lam, expr, modules=['numpy'])
        
        # Evaluar para cada longitud de onda
        n = func(wavelength)
        
        # Asegurar que es array numpy
        n = np.asarray(n, dtype=float)
        
        # Por defecto, k = 0 para ecuaciones personalizadas
        k = np.zeros_like(n)
        
        return n, k
        
    except ImportError:
        raise ImportError(
            "El módulo 'sympy' es requerido para ecuaciones personalizadas. "
            "Instálalo con: pip install sympy"
        )
    except Exception as e:
        raise ValueError(
            f"Error al evaluar la ecuación personalizada '{equation_latex}': {str(e)}\n"
            f"Asegúrate de usar sintaxis LaTeX válida. Ejemplo: 1.5 + \\frac{{0.004}}{{\\lambda^2}}"
        )


def get_refractive_index(wavelength, model_type, params):
    """
    Función genérica para obtener n, k según el modelo de dispersión
    
    Args:
        wavelength: Longitud de onda en nm (array)
        model_type: Tipo de modelo ('cauchy', 'sellmeier', 'drude', 'lorentz', 
                                    'constant', 'custom')
        params: Diccionario con los parámetros del modelo
    
    Returns:
        n, k: Índice de refracción complejo
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    if model_type == 'cauchy':
        return cauchy_model(
            wavelength,
            params.get('A', 1.5),
            params.get('B', 0),
            params.get('C', 0)
        )
    
    elif model_type == 'sellmeier':
        return sellmeier_model(
            wavelength,
            params.get('B1', 0),
            params.get('C1', 0),
            params.get('B2', 0),
            params.get('C2', 0),
            params.get('B3', 0),
            params.get('C3', 0)
        )
    
    elif model_type == 'drude':
        return drude_model(
            wavelength,
            params.get('eps_inf', 1.0),
            params.get('omega_p', 9.0),
            params.get('gamma', 0.1)
        )
    
    elif model_type == 'lorentz':
        return lorentz_model(
            wavelength,
            params.get('eps_inf', 1.0),
            params.get('f1', 1.0),
            params.get('omega_1', 3.0),
            params.get('gamma_1', 0.5),
            params.get('f2', 0),
            params.get('omega_2', 0),
            params.get('gamma_2', 0)
        )
    
    elif model_type == 'constant':
        return constant_model(
            wavelength,
            params.get('n', 1.5),
            params.get('k', 0)
        )
    
    elif model_type == 'custom':
        # ⭐ NUEVO: Soporte para ecuaciones personalizadas
        equation = params.get('equation', '')
        if not equation:
            raise ValueError("Se requiere el parámetro 'equation' para modelo custom")
        return custom_equation_model(wavelength, equation)
    
    else:
        raise ValueError(f"Modelo de dispersión no reconocido: {model_type}")












