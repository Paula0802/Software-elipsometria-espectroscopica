"""
Modelos de dispersión para materiales ópticos
Versión mejorada con soporte para hasta 10 osciladores
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


def sellmeier_model(wavelength, B1=0, C1=0, B2=0, C2=0, B3=0, C3=0, B4=0, C4=0,
                    B5=0, C5=0, B6=0, C6=0, B7=0, C7=0, B8=0, C8=0, B9=0, C9=0, B10=0, C10=0):
    """
    Modelo de dispersión de Sellmeier con soporte para hasta 10 osciladores
    
    n²(λ) = 1 + Σⱼ (Bⱼ·λ²) / (λ² - Cⱼ)
    
    IMPORTANTE: La ecuación da n² (n al cuadrado), por lo que se debe
    tomar la raíz cuadrada para obtener n.
    
    Args:
        wavelength: Longitud de onda en nm (array)
        B1, C1, ..., B10, C10: Parámetros de Sellmeier (hasta 10 osciladores)
    
    Returns:
        n: Índice de refracción (k = 0 para Sellmeier)
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir nm a μm
    wl_um = wavelength / 1000.0
    wl2 = wl_um ** 2
    
    # Inicializar n² = 1 (parte constante de Sellmeier)
    n_squared = 1.0
    
    # Agregar todos los términos que tengan B y C no nulos
    oscillators = [
        (B1, C1), (B2, C2), (B3, C3), (B4, C4), (B5, C5),
        (B6, C6), (B7, C7), (B8, C8), (B9, C9), (B10, C10)
    ]
    
    for B, C in oscillators:
        if B != 0 and C != 0:
            n_squared += (B * wl2) / (wl2 - C)
    
    # ⭐ IMPORTANTE: Asegurar que n² sea positivo antes de tomar raíz
    n_squared = np.maximum(n_squared, 1e-10)  # Evitar valores negativos o cero
    
    # ⭐ Despejar n: n = √(n²)
    n = np.sqrt(n_squared)
    k = np.zeros_like(n)
    
    return n, k


def drude_model(wavelength, eps_inf, E_p, Gamma_D):
    """
    Modelo de Drude para metales (forma en energía)
    
    ε(E) = ε∞ - Eₚ² / (E² + iΓ_D·E)
    
    Args:
        wavelength: Longitud de onda en nm (array)
        eps_inf: Permitividad a alta frecuencia (ε∞)
        E_p: Energía del plasma en eV
        Gamma_D: Damping (amortiguamiento) en eV
    
    Returns:
        n, k: Índice de refracción complejo
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir λ (nm) a E (eV)
    hc = 1239.84193  # eV·nm
    E = hc / wavelength
    
    # Modelo de Drude en forma de energía
    E_p_sq = E_p ** 2
    E_sq = E ** 2
    
    # ε(E) = ε∞ - Eₚ² / (E² + iΓ_D·E)
    denominator = E_sq + (Gamma_D ** 2)
    
    epsilon_real = eps_inf - E_p_sq / denominator
    epsilon_imag = (E_p_sq * Gamma_D) / (E * denominator)
    
    # Convertir ε a n, k
    n, k = epsilon_to_nk(epsilon_real, epsilon_imag)
    
    return n, k


def lorentz_model(wavelength, eps_inf,
                  f1=0, omega_1=0, gamma_1=0,
                  f2=0, omega_2=0, gamma_2=0,
                  f3=0, omega_3=0, gamma_3=0,
                  f4=0, omega_4=0, gamma_4=0,
                  f5=0, omega_5=0, gamma_5=0,
                  f6=0, omega_6=0, gamma_6=0,
                  f7=0, omega_7=0, gamma_7=0,
                  f8=0, omega_8=0, gamma_8=0,
                  f9=0, omega_9=0, gamma_9=0,
                  f10=0, omega_10=0, gamma_10=0):
    """
    Modelo de Lorentz para dieléctricos con soporte para hasta 10 osciladores
    
    ε(ω) = ε∞ + Σⱼ (fⱼ·ωⱼ²) / (ωⱼ² - ω² - iγⱼω)
    
    Args:
        wavelength: Longitud de onda en nm (array)
        eps_inf: Permitividad a alta frecuencia
        f1, omega_1, gamma_1: Fuerza, frecuencia y amortiguamiento del oscilador 1 (en eV)
        ...
        f10, omega_10, gamma_10: Parámetros del oscilador 10
    
    Returns:
        n, k: Índice de refracción complejo
    """
    wavelength = np.asarray(wavelength, dtype=float)
    
    # Convertir λ a ω (en eV)
    hc = 1239.84193  # eV·nm
    omega = hc / wavelength
    omega_sq = omega ** 2
    
    epsilon = eps_inf + 0j
    
    # Agregar todos los osciladores
    oscillators = [
        (f1, omega_1, gamma_1), (f2, omega_2, gamma_2),
        (f3, omega_3, gamma_3), (f4, omega_4, gamma_4),
        (f5, omega_5, gamma_5), (f6, omega_6, gamma_6),
        (f7, omega_7, gamma_7), (f8, omega_8, gamma_8),
        (f9, omega_9, gamma_9), (f10, omega_10, gamma_10)
    ]
    
    for f, omega_j, gamma_j in oscillators:
        if f != 0 and omega_j != 0:
            omega_j_sq = omega_j ** 2
            denominator = omega_j_sq - omega_sq - 1j * gamma_j * omega
            epsilon += (f * omega_j_sq) / denominator
    
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
    Evalúa una ecuación LaTeX personalizada para n(λ)
    
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
        # ⭐ Soportar hasta 10 osciladores
        return sellmeier_model(
            wavelength,
            params.get('B1', 0), params.get('C1', 0),
            params.get('B2', 0), params.get('C2', 0),
            params.get('B3', 0), params.get('C3', 0),
            params.get('B4', 0), params.get('C4', 0),
            params.get('B5', 0), params.get('C5', 0),
            params.get('B6', 0), params.get('C6', 0),
            params.get('B7', 0), params.get('C7', 0),
            params.get('B8', 0), params.get('C8', 0),
            params.get('B9', 0), params.get('C9', 0),
            params.get('B10', 0), params.get('C10', 0)
        )
    
    elif model_type == 'drude':
        return drude_model(
            wavelength,
            params.get('eps_inf', 1.0),
            params.get('E_p', 9.0),
            params.get('Gamma_D', 0.1)
        )
    
    elif model_type == 'lorentz':
        # ⭐ Soportar hasta 10 osciladores
        return lorentz_model(
            wavelength,
            params.get('eps_inf', 1.0),
            params.get('f1', 0), params.get('omega_1', 0), params.get('gamma_1', 0),
            params.get('f2', 0), params.get('omega_2', 0), params.get('gamma_2', 0),
            params.get('f3', 0), params.get('omega_3', 0), params.get('gamma_3', 0),
            params.get('f4', 0), params.get('omega_4', 0), params.get('gamma_4', 0),
            params.get('f5', 0), params.get('omega_5', 0), params.get('gamma_5', 0),
            params.get('f6', 0), params.get('omega_6', 0), params.get('gamma_6', 0),
            params.get('f7', 0), params.get('omega_7', 0), params.get('gamma_7', 0),
            params.get('f8', 0), params.get('omega_8', 0), params.get('gamma_8', 0),
            params.get('f9', 0), params.get('omega_9', 0), params.get('gamma_9', 0),
            params.get('f10', 0), params.get('omega_10', 0), params.get('gamma_10', 0)
        )
    
    elif model_type == 'constant':
        return constant_model(
            wavelength,
            params.get('n', 1.5),
            params.get('k', 0)
        )
    
    elif model_type == 'custom':
        equation = params.get('equation', '')
        if not equation:
            raise ValueError("Se requiere el parámetro 'equation' para modelo custom")
        return custom_equation_model(wavelength, equation)
    
    else:
        raise ValueError(f"Modelo de dispersión no reconocido: {model_type}")












