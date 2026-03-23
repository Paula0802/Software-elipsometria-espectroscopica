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
            - 'gamma0' o 'gamma_0': Γ₀ (damping, eV)
    
    Returns:
        (n, k) como arrays numpy
    """
    lam = np.asarray(wavelengths, dtype=float)
    
    eps_inf = float(params.get('eps_inf', 1.0))
    omega_p = float(params.get('omega_p', 9.0))
    f0      = float(params.get('f0', 1.0))
    gamma0  = float(params.get('gamma_0', params.get('gamma0', 0.1)))
    
    # Convertir λ (nm) → ω (eV)
    omega = wavelength_nm_to_energy_ev(lam)
    
    # ε(ω) = ε∞ - (f₀ωp²) / (ω² + iΓ₀ω)
    denominator     = omega**2 + 1j * gamma0 * omega
    epsilon_complex = eps_inf - (f0 * omega_p**2) / denominator
    
    # Convertir ε → (n, k)
    eps_abs = np.abs(epsilon_complex)
    eps1    = np.real(epsilon_complex)
    n = np.sqrt(np.maximum((eps_abs + eps1) / 2.0, 0.0))
    k = np.sqrt(np.maximum((eps_abs - eps1) / 2.0, 0.0))
    
    return n, k


def lorentz_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo de Lorentz puro (sin Drude)

    ε(ω) = ε∞ + (εs - ε∞)·ωt² / (ωt² - ω² + i·Γ₀·ω)
           + Σⱼ [ fⱼ·ω₀ⱼ² / (ω₀ⱼ² - ω² + i·γⱼ·ω) ]

    Args:
        wavelengths: Longitudes de onda en nm (array numpy)
        params: Dict con:
            - 'eps_inf': ε∞ (permitividad de fondo)
            - 'eps_s':   εs (constante dieléctrica estática)
            - 'omega_t': ωt (frecuencia de resonancia principal, eV)
            - 'gamma_0': Γ₀ (damping del oscilador principal, eV)
            - 'f1', 'omega_1', 'gamma_1': Oscilador adicional 1 (opcional)
            - ... hasta oscilador 6

    Returns:
        (n, k) como arrays numpy

    Notas:
        - El término principal usa εs y ωt (forma física del PDF HORIBA)
        - Los osciladores adicionales usan ω₀ⱼ² en el numerador (NO ωp²)
        - Típicamente usado para dieléctricos: SiO₂, Al₂O₃, PMMA, etc.
    """
    lam   = np.asarray(wavelengths, dtype=float)
    omega = wavelength_nm_to_energy_ev(lam)

    eps_inf = float(params.get('eps_inf', 1.0))
    eps_s   = float(params.get('eps_s',   2.0))
    omega_t = float(params.get('omega_t', 4.0))
    gamma_0 = float(params.get('gamma_0', 0.1))

    # Inicializar ε compleja
    epsilon = eps_inf * np.ones_like(omega, dtype=complex)

    # Término principal: (εs - ε∞)·ωt² / (ωt² - ω² + i·Γ₀·ω)
    denom_principal = omega_t**2 - omega**2 + 1j * gamma_0 * omega
    epsilon += (eps_s - eps_inf) * omega_t**2 / denom_principal

    # Osciladores adicionales: fⱼ·ω₀ⱼ² / (ω₀ⱼ² - ω² + i·γⱼ·ω)
    for j in range(1, 7):
        f_key = f"f{j}"
        w_key = f"omega_{j}"
        g_key = f"gamma_{j}"

        if f_key in params and w_key in params and g_key in params:
            f_j     = float(params[f_key])
            omega_j = float(params[w_key])
            gamma_j = float(params[g_key])

            denom_j  = omega_j**2 - omega**2 + 1j * gamma_j * omega
            epsilon += f_j * omega_j**2 / denom_j

    # Convertir ε → (n, k)
    eps_abs = np.abs(epsilon)
    eps1    = np.real(epsilon)
    n = np.sqrt(np.maximum((eps_abs + eps1) / 2.0, 0.0))
    k = np.sqrt(np.maximum((eps_abs - eps1) / 2.0, 0.0))

    return n, k


def drude_lorentz_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo Drude-Lorentz combinado

    ε(ω) = ε∞ - f₀·ωp²/(ω² + i·Γ₀·ω)
           + Σⱼ [ fⱼ·ω₀ⱼ² / (ω₀ⱼ² - ω² + i·γⱼ·ω) ]

    Args:
        wavelengths: Longitudes de onda en nm (array numpy)
        params: Dict con:
            Globales:
            - 'eps_inf': ε∞ (permitividad de fondo)
            - 'omega_p': ωp (frecuencia de plasma, eV)

            Término Drude:
            - 'f0':               f₀ (fuerza oscilador Drude)
            - 'gamma_0'/'gamma0': Γ₀ (damping Drude, eV)

            Osciladores Lorentz:
            - 'f1', 'omega_1', 'gamma_1': Oscilador 1
            - ... hasta oscilador 6

    Returns:
        (n, k) como arrays numpy

    Notas:
        - Término Drude: electrones libres (metales)
        - Osciladores Lorentz: transiciones interbanda
        - CORREGIDO: osciladores Lorentz usan ω₀ⱼ² en numerador (NO ωp²)
        - Típicamente usado para Au, Ag, Cu con mayor precisión que Drude puro
    """
    lam   = np.asarray(wavelengths, dtype=float)
    omega = wavelength_nm_to_energy_ev(lam)

    eps_inf = float(params.get('eps_inf', 1.0))
    omega_p = float(params.get('omega_p', 9.0))

    # Inicializar ε compleja
    epsilon = eps_inf * np.ones_like(omega, dtype=complex)

    # Término Drude: -f₀·ωp² / (ω² + i·Γ₀·ω)
    if 'f0' in params and ('gamma_0' in params or 'gamma0' in params):
        f0     = float(params['f0'])
        gamma0 = float(params.get('gamma_0', params.get('gamma0', 0.1)))
        denom_drude = omega**2 + 1j * gamma0 * omega
        epsilon -= f0 * omega_p**2 / denom_drude

    # Osciladores Lorentz: fⱼ·ω₀ⱼ² / (ω₀ⱼ² - ω² + i·γⱼ·ω)
    # CORREGIDO: usa ω₀ⱼ² en el numerador, NO ωp²
    for j in range(1, 7):
        f_key = f"f{j}"
        w_key = f"omega_{j}"
        g_key = f"gamma_{j}"

        if f_key in params and w_key in params and g_key in params:
            f_j     = float(params[f_key])
            omega_j = float(params[w_key])
            gamma_j = float(params[g_key])

            denom_j  = omega_j**2 - omega**2 + 1j * gamma_j * omega
            epsilon += f_j * omega_j**2 / denom_j

    # Convertir ε → (n, k)
    eps_abs = np.abs(epsilon)
    eps1    = np.real(epsilon)
    n = np.sqrt(np.maximum((eps_abs + eps1) / 2.0, 0.0))
    k = np.sqrt(np.maximum((eps_abs - eps1) / 2.0, 0.0))

    return n, k


def custom_model(wavelengths, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Modelo personalizado basado en ecuación
    
    Args:
        wavelengths: Longitudes de onda en nm
        params: Dict con 'equation' y parámetros nombrados
    
    Returns:
        (n, k) como arrays numpy
    """
    lam = np.asarray(wavelengths, dtype=float)
    
    equation = params.get('equation', '')
    
    if not equation:
        return np.ones_like(lam) * 1.5, np.zeros_like(lam)
    
    try:
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
        
        for key, value in params.items():
            if key != 'equation':
                namespace[key] = float(value)
        
        n = eval(equation, {"__builtins__": {}}, namespace)
        n = np.asarray(n, dtype=float)
        k = np.zeros_like(n)
        
        return n, k
        
    except Exception as e:
        print(f"Error evaluando ecuación personalizada: {e}")
        return np.ones_like(lam) * 1.5, np.zeros_like(lam)


def get_nk_from_model(model_type: str, wavelengths, params: dict):
    """
    Obtiene n, k para un modelo de dispersión o archivo de datos
    
    Args:
        model_type: Tipo de modelo ('cauchy', 'sellmeier', 'drude', 'lorentz',
                    'drude_lorentz', 'drude-lorentz', 'file_nk', etc.)
        wavelengths: Array de longitudes de onda (nm)
        params: Parámetros del modelo O datos ópticos si es archivo
    
    Returns:
        (n, k): Tupla de arrays con índice de refracción y extinción
    """
    model_type_normalized = model_type.replace('-', '_').lower().strip()

    # ========================================
    # CASO ESPECIAL: Archivo de datos ópticos
    # ========================================
    if model_type_normalized in ['file_nk', 'file_epsilon']:
        if 'optical_data' not in params:
            raise ValueError(
                f"Modelo '{model_type}' requiere 'optical_data' en params. "
                f"Claves disponibles: {list(params.keys())}"
            )
        
        optical_data = params['optical_data']
        required_keys = ['wavelength', 'n', 'k']
        missing_keys  = [k for k in required_keys if k not in optical_data]
        
        if missing_keys:
            raise ValueError(
                f"optical_data incompleto. Faltan: {missing_keys}. "
                f"Claves disponibles: {list(optical_data.keys())}"
            )
        
        wl_data = np.array(optical_data['wavelength'], dtype=float)
        n_data  = np.array(optical_data['n'],          dtype=float)
        k_data  = np.array(optical_data['k'],          dtype=float)
        
        if not np.all(np.diff(wl_data) > 0):
            idx     = np.argsort(wl_data)
            wl_data = wl_data[idx]
            n_data  = n_data[idx]
            k_data  = k_data[idx]
        
        wavelengths = np.asarray(wavelengths, dtype=float)
        n_interp    = np.interp(wavelengths, wl_data, n_data)
        k_interp    = np.interp(wavelengths, wl_data, k_data)
        
        return n_interp, k_interp
    
    # ========================================
    # MODELOS ANALÍTICOS
    # ========================================
    if model_type_normalized == 'constant':
        n_val = float(params.get('n', 1.5))
        k_val = float(params.get('k', 0.0))
        return (
            np.full_like(np.asarray(wavelengths, dtype=float), n_val),
            np.full_like(np.asarray(wavelengths, dtype=float), k_val),
        )

    model_map = {
        'cauchy':        cauchy_model,
        'sellmeier':     sellmeier_model,
        'drude':         drude_model,
        'lorentz':       lorentz_model,
        'drude_lorentz': drude_lorentz_model,
        'custom':        custom_model,
    }
    
    if model_type_normalized not in model_map:
        raise ValueError(
            f"Modelo '{model_type}' no reconocido. "
            f"Modelos disponibles: {list(model_map.keys()) + ['file_nk', 'file_epsilon', 'constant']}"
        )
    
    return model_map[model_type_normalized](wavelengths, params)


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
    model_type = model_type.replace('-', '_').lower().strip()

    if model_type == 'cauchy':
        required = ['A']
        missing  = [p for p in required if p not in params]
        if missing:
            return {'valid': False, 'message': f'Faltan parámetros: {missing}'}
        return {'valid': True, 'message': 'OK'}

    elif model_type == 'sellmeier':
        if 'B1' not in params or 'C1' not in params:
            return {'valid': False, 'message': 'Sellmeier requiere al menos B1 y C1'}
        return {'valid': True, 'message': 'OK'}

    elif model_type == 'drude':
        has_gamma     = 'gamma0' in params or 'gamma_0' in params
        required_check = ['eps_inf', 'omega_p', 'f0']
        missing       = [p for p in required_check if p not in params]
        if not has_gamma:
            missing.append('gamma0 o gamma_0')
        if missing:
            return {'valid': False, 'message': f'Drude requiere: {", ".join(missing)}'}
        return {'valid': True, 'message': 'OK'}

    elif model_type == 'lorentz':
        # CORREGIDO: ya no requiere omega_p, ahora requiere eps_s, omega_t, gamma_0
        required = ['eps_inf', 'eps_s', 'omega_t', 'gamma_0']
        missing  = [p for p in required if p not in params]
        if missing:
            return {'valid': False, 'message': f'Lorentz requiere: {", ".join(missing)}'}
        return {'valid': True, 'message': 'OK'}

    elif model_type == 'drude_lorentz':
        required = ['eps_inf', 'omega_p']
        missing  = [p for p in required if p not in params]
        if missing:
            return {'valid': False, 'message': f'Drude-Lorentz requiere: {", ".join(missing)}'}

        has_gamma = 'gamma0' in params or 'gamma_0' in params
        if 'f0' not in params or not has_gamma:
            return {'valid': False, 'message': 'Drude-Lorentz requiere término Drude (f0, gamma_0 o gamma0)'}

        has_oscillator = any(
            f"f{j}" in params and f"omega_{j}" in params and f"gamma_{j}" in params
            for j in range(1, 7)
        )
        if not has_oscillator:
            return {'valid': False, 'message': 'Drude-Lorentz requiere al menos un oscilador Lorentz (f1, omega_1, gamma_1)'}

        return {'valid': True, 'message': 'OK'}

    elif model_type == 'custom':
        if 'equation' not in params:
            return {'valid': False, 'message': 'Modelo custom requiere ecuación'}
        return {'valid': True, 'message': 'OK'}

    else:
        return {'valid': False, 'message': f'Modelo {model_type} no reconocido'}