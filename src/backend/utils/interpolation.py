"""
Interpolación de datos experimentales
"""
import numpy as np
from scipy.interpolate import interp1d

def interpolate_experimental_data(wavelengths_exp, psi_exp, delta_exp, wavelengths_target):
    """
    Interpola datos experimentales a nuevas longitudes de onda
    
    Args:
        wavelengths_exp: Array con λ experimentales
        psi_exp: Array con Psi experimental
        delta_exp: Array con Delta experimental
        wavelengths_target: Array con λ objetivo
        
    Returns:
        dict: {
            'wavelengths': wavelengths_target,
            'psi': psi_interpolated,
            'delta': delta_interpolated,
            'in_range': bool,
            'extrapolated_points': int
        }
        
    Raises:
        ValueError: Si los rangos no se solapan
    """
    wavelengths_exp = np.array(wavelengths_exp)
    psi_exp = np.array(psi_exp)
    delta_exp = np.array(delta_exp)
    wavelengths_target = np.array(wavelengths_target)
    
    wl_min_exp = np.min(wavelengths_exp)
    wl_max_exp = np.max(wavelengths_exp)
    wl_min_target = np.min(wavelengths_target)
    wl_max_target = np.max(wavelengths_target)
    
    # Verificar solapamiento
    if wl_max_target < wl_min_exp or wl_min_target > wl_max_exp:
        raise ValueError(
            f"Rango objetivo [{wl_min_target:.1f}, {wl_max_target:.1f}] nm "
            f"no se solapa con rango experimental [{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm"
        )
    
    # Contar puntos fuera del rango
    extrapolated = np.sum((wavelengths_target < wl_min_exp) | (wavelengths_target > wl_max_exp))
    in_range = (extrapolated == 0)
    
    # Interpolar con extrapolación lineal
    interp_psi = interp1d(wavelengths_exp, psi_exp, 
                          kind='linear', 
                          fill_value='extrapolate',
                          bounds_error=False)
    
    interp_delta = interp1d(wavelengths_exp, delta_exp,
                            kind='linear',
                            fill_value='extrapolate', 
                            bounds_error=False)
    
    psi_interp = interp_psi(wavelengths_target)
    delta_interp = interp_delta(wavelengths_target)
    
    return {
        'wavelengths': wavelengths_target.tolist(),
        'psi': psi_interp.tolist(),
        'delta': delta_interp.tolist(),
        'in_range': in_range,
        'extrapolated_points': int(extrapolated),
        'exp_range': [float(wl_min_exp), float(wl_max_exp)],
        'target_range': [float(wl_min_target), float(wl_max_target)]
    }