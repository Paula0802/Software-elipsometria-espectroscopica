"""
Modelos de dispersión óptica
Implementa Cauchy, Sellmeier, Drude y modelos personalizados
"""
import numpy as np
from typing import Dict, Tuple

def wavelength_nm_to_energy_ev(lambda_nm):
    """
    Convierte longitud de onda (nm) a energía (eV)
    
    Fórmula: E(eV) = 1239.84193 / λ(nm)
    
    Args:
        lambda_nm: Longitud de onda en nanómetros (array o float)
    
    Returns:
        energy_ev: Energía en electronvoltios
    """
    lambda_nm = np.asarray(lambda_nm, dtype=float)
    return 1239.84193 / lambda_nm

def cauchy_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo de dispersión de Cauchy
    n(λ) = A + B/λ² + C/λ⁴
    
    Args:
        wavelengths: Longitudes de onda en nm
        params: Dict con 'A', 'B', 'C'
    
    Returns:
        (n, k) como arrays numpy
    """
    lam = np.asarray(wavelengths, dtype=float)
    
    A = float(params.get('A', 1.5))
    B = float(params.get('B', 0.0))
    C = float(params.get('C', 0.0))
    
    # λ en micrones para el cálculo
    lam_um = lam / 1000.0
    
    n = A + B / (lam_um**2) + C / (lam_um**4)
    k = np.zeros_like(n)
    
    return n, k


def sellmeier_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo de dispersión de Sellmeier
    n²(λ) = 1 + Σ[Bᵢλ² / (λ² - Cᵢ)]
    
    Args:
        wavelengths: Longitudes de onda en nm
        params: Dict con 'B1', 'C1', 'B2', 'C2', ...
    
    Returns:
        (n, k) como arrays numpy
    """
    lam = np.asarray(wavelengths, dtype=float)
    
    # λ en micrones
    lam_um = lam / 1000.0
    lam_sq = lam_um**2
    
    n_sq = np.ones_like(lam_um)
    
    # Sumar hasta 10 osciladores posibles
    for i in range(1, 11):
        B_key = f'B{i}'
        C_key = f'C{i}'
        
        if B_key in params and C_key in params:
            B = float(params[B_key])
            C = float(params[C_key])
            n_sq += (B * lam_sq) / (lam_sq - C)
    
    n = np.sqrt(np.maximum(n_sq, 0))  # Evitar raíces negativas
    k = np.zeros_like(n)
    
    return n, k

def drude_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo de Drude para metales y semiconductores dopados
    
    ε(ω) = ε∞ - (f₀ωp²) / (ω² + iΓ₀ω)
    
    Args:
        wavelengths: Longitudes de onda en nm (array numpy)
        params: Dict con:
            - 'eps_inf': ε∞ (permitividad a alta frecuencia)
            - 'omega_p': ωp (frecuencia de plasma, eV)
            - 'f0': f₀ (fuerza del oscilador, adimensional)
            - 'gamma0': Γ₀ (damping, eV)
    
    Returns:
        (n, k) como arrays numpy
    
    Notas:
        - ω se calcula automáticamente desde λ: ω = 1239.84193 / λ(nm)
        - ε(ω) se convierte a n,k usando epsilon_to_nk
        - Típicamente usado para Au, Ag, Cu, semiconductores dopados
    """
    lam = np.asarray(wavelengths, dtype=float)
    
    # Extraer parámetros con valores por defecto razonables
    eps_inf = float(params.get('eps_inf', 1.0))
    omega_p = float(params.get('omega_p', 9.0))
    f0 = float(params.get('f0', 1.0))
    gamma0 = float(params.get('gamma0', 0.1))
    
    # PASO 1: Convertir λ (nm) → ω (eV)
    omega = wavelength_nm_to_energy_ev(lam)
    
    # PASO 2: Calcular ε(ω) complejo
    # ε(ω) = ε∞ - (f₀ωp²) / (ω² + iΓ₀ω)
    denominator = omega**2 + 1j * gamma0 * omega
    epsilon_complex = eps_inf - (f0 * omega_p**2) / denominator
    
    # Separar parte real e imaginaria
    epsilon1 = np.real(epsilon_complex)
    epsilon2 = np.imag(epsilon_complex)
    
    # PASO 3: Convertir ε → (n, k)
    from backend.optical.conversions import epsilon_to_nk
    n, k = epsilon_to_nk(epsilon1, epsilon2)
    
    return n, k

def custom_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo personalizado basado en ecuación LaTeX
    
    Args:
        wavelengths: Longitudes de onda en nm
        params: Dict con 'equation' (string LaTeX) y parámetros nombrados
    
    Returns:
        (n, k) como arrays numpy
    """
    lam = np.asarray(wavelengths, dtype=float)
    
    equation = params.get('equation', '')
    
    if not equation:
        # Sin ecuación, devolver constante
        return np.ones_like(lam) * 1.5, np.zeros_like(lam)
    
    try:
        # Crear namespace con numpy y wavelength
        namespace = {
            'np': np,
            'lam': lam,
            'lambda': lam,
            'wavelength': lam,
            'sqrt': np.sqrt,
            'exp': np.exp,
            'log': np.log,
            'sin': np.sin,
            'cos': np.cos,
        }
        
        # Agregar parámetros del usuario
        for key, value in params.items():
            if key != 'equation':
                namespace[key] = float(value)
        
        # Evaluar ecuación
        n = eval(equation, {"__builtins__": {}}, namespace)
        
        # Asegurar que n sea array
        n = np.asarray(n, dtype=float)
        
        # k = 0 para modelos transparentes
        k = np.zeros_like(n)
        
        return n, k
        
    except Exception as e:
        # Error en evaluación, devolver constante
        print(f"Error evaluando ecuación personalizada: {e}")
        return np.ones_like(lam) * 1.5, np.zeros_like(lam)


def get_nk_from_model(model_type: str, wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Función principal para obtener n,k según el modelo
    
    Args:
        model_type: Tipo de modelo ('cauchy', 'sellmeier', 'drude', 'custom')
        wavelengths: Array de longitudes de onda en nm
        params: Parámetros del modelo
    
    Returns:
        (n, k) como arrays numpy
    """
    model_map = {
        'cauchy': cauchy_model,
        'sellmeier': sellmeier_model,
        'drude': drude_model,
        'custom': custom_model,
    }
    
    if model_type not in model_map:
        raise ValueError(f"Modelo '{model_type}' no reconocido. Modelos disponibles: {list(model_map.keys())}")
    
    return model_map[model_type](wavelengths, params)

# ==========================================
# UTILIDADES
# ==========================================

def validate_dispersion_params(model_type: str, params: Dict) -> Dict:
    """
    Valida que los parámetros del modelo sean correctos
    
    Args:
        model_type: Tipo de modelo
        params: Diccionario de parámetros
    
    Returns:
        Dict con {'valid': bool, 'message': str}
    """
    if model_type == 'cauchy':
        required = ['A']
        optional = ['B', 'C']
        
    elif model_type == 'sellmeier':
        # Al menos un par B1, C1
        if 'B1' not in params or 'C1' not in params:
            return {'valid': False, 'message': 'Sellmeier requiere al menos B1 y C1'}
        return {'valid': True, 'message': 'OK'}
    
    # ⭐ NUEVA SECCIÓN - VALIDACIÓN DRUDE
    elif model_type == 'drude':
        required = ['eps_inf', 'omega_p', 'f0', 'gamma0']
        missing = [p for p in required if p not in params]
        if missing:
            return {'valid': False, 'message': f'Drude requiere: {", ".join(missing)}'}
        return {'valid': True, 'message': 'OK'}
        
    elif model_type == 'custom':
        if 'equation' not in params:
            return {'valid': False, 'message': 'Modelo custom requiere ecuación'}
        return {'valid': True, 'message': 'OK'}
        
    else:
        return {'valid': False, 'message': f'Modelo {model_type} no reconocido'}
    
    # Verificar parámetros requeridos (solo Cauchy llega aquí)
    missing = [p for p in required if p not in params]
    if missing:
        return {'valid': False, 'message': f'Faltan parámetros: {missing}'}
    
    return {'valid': True, 'message': 'OK'}