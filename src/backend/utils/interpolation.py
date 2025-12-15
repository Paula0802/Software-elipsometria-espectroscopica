"""
Interpolación de datos experimentales de elipsometría
Permite interpolar y validar rangos de Psi/Delta experimentales
"""
import numpy as np
from scipy.interpolate import interp1d
from typing import Dict, List, Tuple, Any
import logging

logger = logging.getLogger(__name__)


def interpolate_experimental_data(
    wavelengths_exp: np.ndarray,
    psi_exp: np.ndarray,
    delta_exp: np.ndarray,
    wavelengths_target: np.ndarray
) -> Dict[str, Any]:
    """
    Interpola datos experimentales (Psi, Delta) a nuevas longitudes de onda
    
    Args:
        wavelengths_exp: Array con longitudes de onda experimentales (nm)
        psi_exp: Array con Psi experimental (grados)
        delta_exp: Array con Delta experimental (grados)
        wavelengths_target: Array con longitudes de onda objetivo (nm)
        
    Returns:
        dict: {
            'wavelengths': wavelengths_target,
            'psi': psi_interpolated,
            'delta': delta_interpolated,
            'in_range': bool,  # True si todos los puntos están dentro del rango experimental
            'extrapolated_points': int,  # Número de puntos extrapolados
            'exp_range': [min_exp, max_exp],
            'target_range': [min_target, max_target]
        }
        
    Raises:
        ValueError: Si los rangos no se solapan en absoluto
    """
    # Convertir a numpy arrays
    wavelengths_exp = np.asarray(wavelengths_exp, dtype=float)
    psi_exp = np.asarray(psi_exp, dtype=float)
    delta_exp = np.asarray(delta_exp, dtype=float)
    wavelengths_target = np.asarray(wavelengths_target, dtype=float)
    
    # Verificar que no haya NaN
    if np.any(np.isnan(wavelengths_exp)) or np.any(np.isnan(psi_exp)) or np.any(np.isnan(delta_exp)):
        raise ValueError("Los datos experimentales contienen valores NaN")
    
    if np.any(np.isnan(wavelengths_target)):
        raise ValueError("Las longitudes de onda objetivo contienen valores NaN")
    
    # Obtener rangos
    wl_min_exp = float(np.min(wavelengths_exp))
    wl_max_exp = float(np.max(wavelengths_exp))
    wl_min_target = float(np.min(wavelengths_target))
    wl_max_target = float(np.max(wavelengths_target))
    
    logger.info(f"Rango experimental: [{wl_min_exp:.2f}, {wl_max_exp:.2f}] nm")
    logger.info(f"Rango objetivo: [{wl_min_target:.2f}, {wl_max_target:.2f}] nm")
    
    # Verificar solapamiento
    if wl_max_target < wl_min_exp or wl_min_target > wl_max_exp:
        raise ValueError(
            f"Rango objetivo [{wl_min_target:.1f}, {wl_max_target:.1f}] nm "
            f"no se solapa con rango experimental [{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm. "
            f"No se puede realizar interpolación."
        )
    
    # Contar puntos fuera del rango experimental (extrapolación)
    extrapolated = int(np.sum((wavelengths_target < wl_min_exp) | (wavelengths_target > wl_max_exp)))
    in_range = (extrapolated == 0)
    
    if extrapolated > 0:
        logger.warning(f"{extrapolated} puntos requieren extrapolación")
    
    # Crear funciones de interpolación con extrapolación lineal
    try:
        interp_psi = interp1d(
            wavelengths_exp, 
            psi_exp, 
            kind='linear',
            fill_value='extrapolate',
            bounds_error=False
        )
        
        interp_delta = interp1d(
            wavelengths_exp, 
            delta_exp,
            kind='linear',
            fill_value='extrapolate',
            bounds_error=False
        )
        
        # Interpolar
        psi_interp = interp_psi(wavelengths_target)
        delta_interp = interp_delta(wavelengths_target)
        
        # Verificar resultados
        if np.any(np.isnan(psi_interp)) or np.any(np.isnan(delta_interp)):
            raise ValueError("La interpolación produjo valores NaN")
        
        return {
            'wavelengths': wavelengths_target.tolist(),
            'psi': psi_interp.tolist(),
            'delta': delta_interp.tolist(),
            'in_range': in_range,
            'extrapolated_points': extrapolated,
            'exp_range': [wl_min_exp, wl_max_exp],
            'target_range': [wl_min_target, wl_max_target]
        }
        
    except Exception as e:
        logger.error(f"Error durante interpolación: {str(e)}")
        raise ValueError(f"Error al interpolar datos: {str(e)}")


def validate_wavelength_compatibility(
    wavelengths_exp: np.ndarray,
    wavelengths_target: np.ndarray
) -> Dict[str, Any]:
    """
    Valida si un rango objetivo es compatible con los datos experimentales
    (sin hacer interpolación real, solo validación)
    
    Args:
        wavelengths_exp: Longitudes de onda experimentales
        wavelengths_target: Longitudes de onda objetivo
        
    Returns:
        dict: {
            'compatible': bool,
            'in_range': bool,
            'overlap_percentage': float (0-100),
            'exp_range': [min, max],
            'target_range': [min, max],
            'extrapolated_points': int,
            'message': str
        }
    """
    wavelengths_exp = np.asarray(wavelengths_exp, dtype=float)
    wavelengths_target = np.asarray(wavelengths_target, dtype=float)
    
    wl_min_exp = float(np.min(wavelengths_exp))
    wl_max_exp = float(np.max(wavelengths_exp))
    wl_min_target = float(np.min(wavelengths_target))
    wl_max_target = float(np.max(wavelengths_target))
    
    # Verificar solapamiento
    has_overlap = not (wl_max_target < wl_min_exp or wl_min_target > wl_max_exp)
    
    if not has_overlap:
        return {
            'compatible': False,
            'in_range': False,
            'overlap_percentage': 0.0,
            'exp_range': [wl_min_exp, wl_max_exp],
            'target_range': [wl_min_target, wl_max_target],
            'extrapolated_points': len(wavelengths_target),
            'message': (
                f"El rango objetivo [{wl_min_target:.1f}, {wl_max_target:.1f}] nm "
                f"NO se solapa con el rango experimental [{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm. "
                f"No es posible realizar la optimización."
            )
        }
    
    # Contar puntos dentro/fuera del rango
    in_range_mask = (wavelengths_target >= wl_min_exp) & (wavelengths_target <= wl_max_exp)
    points_in_range = int(np.sum(in_range_mask))
    extrapolated_points = len(wavelengths_target) - points_in_range
    
    overlap_percentage = (points_in_range / len(wavelengths_target)) * 100.0
    all_in_range = (extrapolated_points == 0)
    
    if all_in_range:
        message = (
            f"✓ El rango objetivo [{wl_min_target:.1f}, {wl_max_target:.1f}] nm "
            f"está completamente dentro del rango experimental [{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm."
        )
    else:
        message = (
            f"⚠️ Advertencia: {extrapolated_points} de {len(wavelengths_target)} puntos "
            f"({100 - overlap_percentage:.1f}%) están fuera del rango experimental "
            f"[{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm. "
            f"Se usará extrapolación lineal, lo cual puede afectar la precisión."
        )
    
    return {
        'compatible': True,
        'in_range': all_in_range,
        'overlap_percentage': overlap_percentage,
        'exp_range': [wl_min_exp, wl_max_exp],
        'target_range': [wl_min_target, wl_max_target],
        'extrapolated_points': extrapolated_points,
        'message': message
    }


def check_single_wavelength(
    wavelengths_exp: np.ndarray,
    wavelength_target: float,
    tolerance: float = 0.1
) -> Dict[str, Any]:
    """
    Verifica si una longitud de onda única está dentro del rango experimental
    
    Args:
        wavelengths_exp: Longitudes de onda experimentales
        wavelength_target: Longitud de onda objetivo (nm)
        tolerance: Tolerancia para considerar "igual" (nm)
        
    Returns:
        dict: {
            'in_range': bool,
            'exact_match': bool,
            'closest_exp_wavelength': float,
            'distance': float,
            'exp_range': [min, max],
            'message': str
        }
    """
    wavelengths_exp = np.asarray(wavelengths_exp, dtype=float)
    wavelength_target = float(wavelength_target)
    
    wl_min_exp = float(np.min(wavelengths_exp))
    wl_max_exp = float(np.max(wavelengths_exp))
    
    # Verificar si está dentro del rango
    in_range = (wavelength_target >= wl_min_exp) and (wavelength_target <= wl_max_exp)
    
    # Encontrar la longitud de onda experimental más cercana
    distances = np.abs(wavelengths_exp - wavelength_target)
    closest_idx = np.argmin(distances)
    closest_wavelength = float(wavelengths_exp[closest_idx])
    min_distance = float(distances[closest_idx])
    
    # Verificar si hay coincidencia exacta
    exact_match = (min_distance <= tolerance)
    
    if not in_range:
        message = (
            f"❌ La longitud de onda {wavelength_target:.1f} nm está FUERA del rango experimental "
            f"[{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm. "
            f"No es posible realizar la optimización con esta longitud de onda."
        )
    elif exact_match:
        message = (
            f"✓ La longitud de onda {wavelength_target:.1f} nm coincide exactamente "
            f"con un punto experimental ({closest_wavelength:.1f} nm)."
        )
    else:
        message = (
            f"✓ La longitud de onda {wavelength_target:.1f} nm está dentro del rango experimental "
            f"[{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm. "
            f"Punto experimental más cercano: {closest_wavelength:.1f} nm (distancia: {min_distance:.2f} nm). "
            f"Se usará interpolación lineal."
        )
    
    return {
        'in_range': in_range,
        'exact_match': exact_match,
        'closest_exp_wavelength': closest_wavelength,
        'distance': min_distance,
        'exp_range': [wl_min_exp, wl_max_exp],
        'message': message
    }