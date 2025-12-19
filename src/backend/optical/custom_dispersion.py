"""
Módulo para manejar modelos de dispersión personalizados
definidos por ecuaciones en LaTeX
"""

import numpy as np
import sympy as sp
from sympy.parsing.latex import parse_latex
from typing import Tuple, Union, Dict, List
import re

class CustomDispersionModel:
    """
    Permite definir modelos de dispersión mediante ecuaciones LaTeX
    """
    
    def __init__(self, 
                 equation_n: str, 
                 equation_k: str = "0",
                 variable: str = "auto"):
        """
        Args:
            equation_n: Ecuación para n en LaTeX
            equation_k: Ecuación para k en LaTeX (default: 0)
            variable: "lambda", "omega", o "auto" (detectar automáticamente)
        """
        self.equation_n_latex = equation_n
        self.equation_k_latex = equation_k
        self.variable_type = variable
        
        # Parsear ecuaciones
        self.expr_n = self._parse_latex(equation_n)
        self.expr_k = self._parse_latex(equation_k)
        
        # Detectar variable si es auto
        if self.variable_type == "auto":
            self.variable_type = self._detect_variable()
        
        # Crear función evaluable
        self.func_n = self._create_function(self.expr_n)
        self.func_k = self._create_function(self.expr_k)
        
    def _parse_latex(self, latex_str: str) -> sp.Expr:
        """
        Convierte LaTeX a expresión SymPy
        """
        try:
            # Limpiar string
            latex_str = latex_str.strip()
            
            # Reemplazos comunes para facilitar parsing
            replacements = {
                r'\\lambda': 'lambda_var',
                r'\\omega': 'omega_var',
                r'λ': 'lambda_var',
                r'ω': 'omega_var',
                r'\\epsilon_\\infty': 'epsilon_inf',
                r'ε∞': 'epsilon_inf',
                r'\\omega_p': 'omega_p',
                r'ωₚ': 'omega_p',
            }
            
            for old, new in replacements.items():
                latex_str = latex_str.replace(old, new)
            
            # Parsear
            expr = parse_latex(latex_str)
            
            return expr
            
        except Exception as e:
            raise ValueError(f"Error parseando LaTeX: {str(e)}\nEcuación: {latex_str}")
    
    def _detect_variable(self) -> str:
        """
        Detecta si la ecuación es función de λ o ω
        """
        symbols_n = self.expr_n.free_symbols
        symbols_k = self.expr_k.free_symbols
        all_symbols = symbols_n.union(symbols_k)
        
        symbol_names = {str(s) for s in all_symbols}
        
        if 'lambda_var' in symbol_names:
            return 'lambda'
        elif 'omega_var' in symbol_names:
            return 'omega'
        else:
            # Default a lambda
            return 'lambda'
    
    def _create_function(self, expr: sp.Expr):
        """
        Crea función evaluable desde expresión SymPy
        """
        if self.variable_type == 'lambda':
            var = sp.Symbol('lambda_var')
        else:
            var = sp.Symbol('omega_var')
        
        # Lambdify: convierte expresión simbólica a función numérica
        func = sp.lambdify(var, expr, modules=['numpy'])
        
        return func
    
    def get_nk(self, wavelengths: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calcula n y k para un array de longitudes de onda
        
        Args:
            wavelengths: Array de longitudes de onda en nm
            
        Returns:
            (n_array, k_array): Tupla con arrays de n y k
        """
        # Convertir λ → ω si es necesario
        if self.variable_type == 'omega':
            # ω = 2πc/λ
            # c = 299792458 m/s
            # λ en nm → convertir a m
            c = 299792458  # m/s
            lambda_m = wavelengths * 1e-9  # nm → m
            omega = 2 * np.pi * c / lambda_m  # rad/s
            
            var_values = omega
        else:
            var_values = wavelengths
        
        try:
            # Evaluar ecuaciones
            n_values = self.func_n(var_values)
            k_values = self.func_k(var_values)
            
            # Asegurar que son arrays
            n_values = np.atleast_1d(n_values)
            k_values = np.atleast_1d(k_values)
            
            # Validar valores físicos
            if np.any(n_values < 0):
                raise ValueError("Ecuación produce valores negativos de n")
            
            if np.any(k_values < 0):
                raise ValueError("Ecuación produce valores negativos de k")
            
            return n_values, k_values
            
        except Exception as e:
            raise ValueError(f"Error evaluando ecuación: {str(e)}")
    
    def validate(self, wavelength_range: Tuple[float, float]) -> Dict[str, any]:
        """
        Valida que la ecuación produce valores razonables
        
        Args:
            wavelength_range: (λ_min, λ_max) en nm
            
        Returns:
            Dict con resultados de validación
        """
        lambda_min, lambda_max = wavelength_range
        test_wavelengths = np.linspace(lambda_min, lambda_max, 100)
        
        try:
            n_values, k_values = self.get_nk(test_wavelengths)
            
            validation = {
                'valid': True,
                'n_min': float(np.min(n_values)),
                'n_max': float(np.max(n_values)),
                'k_min': float(np.min(k_values)),
                'k_max': float(np.max(k_values)),
                'message': 'Ecuación válida'
            }
            
            # Advertencias
            warnings = []
            if validation['n_min'] < 0.5 or validation['n_max'] > 10:
                warnings.append("Valores de n fuera del rango típico (0.5-10)")
            
            if validation['k_max'] > 5:
                warnings.append("Valores de k muy altos (k > 5)")
            
            if warnings:
                validation['warnings'] = warnings
            
            return validation
            
        except Exception as e:
            return {
                'valid': False,
                'message': f'Error en validación: {str(e)}'
            }


# ==========================================
# FUNCIONES HELPER
# ==========================================

def omega_to_lambda(omega: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """
    Convierte frecuencia angular (rad/s) a longitud de onda (nm)
    
    λ = 2πc/ω
    """
    c = 299792458  # m/s
    lambda_m = 2 * np.pi * c / omega
    lambda_nm = lambda_m * 1e9
    return lambda_nm


def lambda_to_omega(wavelength_nm: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """
    Convierte longitud de onda (nm) a frecuencia angular (rad/s)
    
    ω = 2πc/λ
    """
    c = 299792458  # m/s
    lambda_m = wavelength_nm * 1e-9
    omega = 2 * np.pi * c / lambda_m
    return omega


def ev_to_omega(energy_ev: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """
    Convierte energía (eV) a frecuencia angular (rad/s)
    
    ω = E/ℏ
    """
    hbar = 1.054571817e-34  # J·s
    e = 1.602176634e-19     # C
    
    energy_j = energy_ev * e
    omega = energy_j / hbar
    
    return omega