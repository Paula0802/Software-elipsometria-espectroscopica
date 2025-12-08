"""
Teoría del Medio Efectivo (Effective Medium Theory - EMT)
Implementa modelos de Bruggeman y Maxwell-Garnett
"""
import numpy as np
from .conversions import nk_to_epsilon, epsilon_to_nk
from .dispersion_models import get_refractive_index


def bruggeman_emt(components, wavelengths):
    """
    Aproximación de Bruggeman para medio efectivo
    
    La ecuación de Bruggeman es:
    Σⱼ fⱼ · (εⱼ - ε_eff) / (εⱼ + 2·ε_eff) = 0
    
    donde:
    - fⱼ: fracción volumétrica del componente j
    - εⱼ: permitividad del componente j
    - ε_eff: permitividad efectiva (a resolver)
    
    Args:
        components: Lista de diccionarios con {fraction, n, k} para cada componente
        wavelengths: Array de longitudes de onda en nm
    
    Returns:
        n_eff, k_eff: Índice de refracción efectivo complejo
    """
    wavelengths = np.asarray(wavelengths, dtype=float)
    n_points = len(wavelengths)
    
    # Inicializar arrays para n_eff y k_eff
    epsilon_eff = np.zeros(n_points, dtype=complex)
    
    # Para cada longitud de onda
    for i, wl in enumerate(wavelengths):
        # Resolver ecuación de Bruggeman iterativamente
        epsilon_eff[i] = _solve_bruggeman(components, wl)
    
    # Convertir ε_eff a n_eff, k_eff
    epsilon_real = np.real(epsilon_eff)
    epsilon_imag = np.imag(epsilon_eff)
    
    n_eff, k_eff = epsilon_to_nk(epsilon_real, epsilon_imag)
    
    return n_eff, k_eff


def _solve_bruggeman(components, wavelength):
    """
    Resuelve la ecuación de Bruggeman para una longitud de onda
    usando el método iterativo de punto fijo
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wavelength: Longitud de onda actual (escalar)
    
    Returns:
        epsilon_eff: Permitividad efectiva (número complejo)
    """
    # Obtener permitividades de cada componente
    epsilons = []
    fractions = []
    
    for comp in components:
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        # Interpolar n, k a esta longitud de onda si es necesario
        if isinstance(n, (list, np.ndarray)):
            # Aquí asumimos que n, k ya están en la longitud de onda correcta
            n_val = n
            k_val = k
        else:
            n_val = n
            k_val = k
        
        eps_real, eps_imag = nk_to_epsilon(n_val, k_val)
        epsilon = eps_real + 1j * eps_imag
        
        epsilons.append(epsilon)
        fractions.append(fraction)
    
    # Estimación inicial: promedio ponderado
    epsilon_eff = sum(f * eps for f, eps in zip(fractions, epsilons))
    
    # Iteración de punto fijo
    max_iter = 100
    tolerance = 1e-6
    
    for iteration in range(max_iter):
        # Calcular nuevo ε_eff usando ecuación de Bruggeman
        numerator = 0
        denominator = 0
        
        for f, eps in zip(fractions, epsilons):
            numerator += f * eps * (1 + 2 * epsilon_eff)
            denominator += f * (1 + 2 * epsilon_eff) - f * (eps - epsilon_eff)
        
        epsilon_new = numerator / denominator if denominator != 0 else epsilon_eff
        
        # Verificar convergencia
        if abs(epsilon_new - epsilon_eff) < tolerance:
            break
        
        epsilon_eff = epsilon_new
    
    return epsilon_eff


def maxwell_garnett_emt(components, wavelengths, host_index=0):
    """
    Aproximación de Maxwell-Garnett para medio efectivo
    
    Modelo: matriz (host) con inclusiones
    
    ε_eff = ε_host · [1 + Σⱼ (3·fⱼ·βⱼ) / (1 - fⱼ·βⱼ)]
    
    donde βⱼ = (εⱼ - ε_host) / (εⱼ + 2·ε_host)
    
    Args:
        components: Lista de componentes con fracciones y propiedades ópticas
        wavelengths: Array de longitudes de onda
        host_index: Índice del componente que actúa como matriz (default: 0)
    
    Returns:
        n_eff, k_eff: Índice de refracción efectivo
    """
    wavelengths = np.asarray(wavelengths, dtype=float)
    n_points = len(wavelengths)
    
    epsilon_eff = np.zeros(n_points, dtype=complex)
    
    # Para cada longitud de onda
    for i, wl in enumerate(wavelengths):
        epsilon_eff[i] = _solve_maxwell_garnett(components, wl, host_index)
    
    epsilon_real = np.real(epsilon_eff)
    epsilon_imag = np.imag(epsilon_eff)
    
    n_eff, k_eff = epsilon_to_nk(epsilon_real, epsilon_imag)
    
    return n_eff, k_eff


def _solve_maxwell_garnett(components, wavelength, host_index):
    """
    Calcula permitividad efectiva usando Maxwell-Garnett
    
    Args:
        components: Lista de componentes
        wavelength: Longitud de onda actual
        host_index: Índice del componente matriz
    
    Returns:
        epsilon_eff: Permitividad efectiva
    """
    # Obtener permitividad del host (matriz)
    host = components[host_index]
    n_host = host['n']
    k_host = host['k']
    eps_host_real, eps_host_imag = nk_to_epsilon(n_host, k_host)
    epsilon_host = eps_host_real + 1j * eps_host_imag
    
    # Sumar contribuciones de inclusiones
    sum_beta = 0
    
    for idx, comp in enumerate(components):
        if idx == host_index:
            continue  # Saltar el host
        
        n = comp['n']
        k = comp['k']
        fraction = comp['fraction']
        
        eps_real, eps_imag = nk_to_epsilon(n, k)
        epsilon = eps_real + 1j * eps_imag
        
        # Factor β = (ε - ε_host) / (ε + 2·ε_host)
        beta = (epsilon - epsilon_host) / (epsilon + 2 * epsilon_host)
        
        sum_beta += 3 * fraction * beta / (1 - fraction * beta)
    
    # Permitividad efectiva
    epsilon_eff = epsilon_host * (1 + sum_beta)
    
    return epsilon_eff


def calculate_effective_medium(layer_data, wavelengths):
    """
    Función principal para calcular medio efectivo según el modelo EMT
    
    Args:
        layer_data: Diccionario con información de la capa:
            {
                'emt_model': 'bruggeman' o 'maxwell-garnett',
                'components': [
                    {
                        'name': 'SiO2',
                        'fraction': 0.7,
                        'model': 'cauchy',
                        'params': {'A': 1.45, 'B': 0.003, 'C': 0},
                        'n': array or scalar,
                        'k': array or scalar
                    },
                    ...
                ]
            }
        wavelengths: Array de longitudes de onda en nm
    
    Returns:
        n_eff, k_eff: Índice de refracción efectivo para cada longitud de onda
    """
    emt_model = layer_data.get('emt_model', 'bruggeman')
    components = layer_data['components']
    
    # Preparar componentes: calcular n, k para cada λ si es necesario
    prepared_components = []
    
    for comp in components:
        comp_data = {
            'fraction': comp['fraction'],
            'name': comp.get('name', 'Unknown')
        }
        
        # Si ya tiene n, k como datos
        if 'optical_data' in comp:
            comp_data['n'] = np.interp(
                wavelengths, 
                comp['optical_data']['wavelength'],
                comp['optical_data']['n']
            )
            comp_data['k'] = np.interp(
                wavelengths,
                comp['optical_data']['wavelength'],
                comp['optical_data']['k']
            )
        
        # Si tiene modelo de dispersión
        elif 'model' in comp and 'params' in comp:
            n, k = get_refractive_index(
                wavelengths,
                comp['model'],
                comp['params']
            )
            comp_data['n'] = n
            comp_data['k'] = k
        
        # Si ya tiene n, k directos
        elif 'n' in comp:
            comp_data['n'] = comp['n']
            comp_data['k'] = comp.get('k', 0)
        
        else:
            raise ValueError(f"Componente {comp.get('name')} no tiene datos ópticos válidos")
        
        prepared_components.append(comp_data)
    
    # Aplicar modelo EMT
    if emt_model == 'bruggeman':
        n_eff, k_eff = bruggeman_emt(prepared_components, wavelengths)
    elif emt_model == 'maxwell-garnett':
        # Por defecto, el primer componente es la matriz
        n_eff, k_eff = maxwell_garnett_emt(prepared_components, wavelengths, host_index=0)
    else:
        raise ValueError(f"Modelo EMT no reconocido: {emt_model}")
    
    return n_eff, k_eff