"""
Módulo para modelos de dispersión personalizados
Parser simplificado sin dependencias externas problemáticas
"""

import numpy as np
import sympy as sp
from typing import Tuple, Union, Dict, List
import re

class CustomDispersionModel:
    """
    Permite definir modelos de dispersión mediante ecuaciones
    Soporta sintaxis LaTeX simplificada
    """
    
    def __init__(self, 
                 equation_n: str, 
                 equation_k: str = "0",
                 variable: str = "auto"):
        """
        Args:
            equation_n: Ecuación para n (LaTeX simplificado o Python)
            equation_k: Ecuación para k (default: 0)
            variable: "lambda", "omega", o "auto"
        """
        self.equation_n_original = equation_n
        self.equation_k_original = equation_k
        self.variable_type = variable
        
        print(f"\n{'='*60}")
        print(f"PARSEANDO ECUACIONES")
        print(f"{'='*60}")
        
        # Parsear ecuaciones
        self.expr_n = self._parse_equation(equation_n, 'n')
        self.expr_k = self._parse_equation(equation_k, 'k')
        
        # Detectar variable si es auto
        if self.variable_type == "auto":
            self.variable_type = self._detect_variable()
        
        print(f"Variable detectada: {self.variable_type}")
        
        # Crear funciones evaluables
        self.func_n = self._create_function(self.expr_n)
        self.func_k = self._create_function(self.expr_k)
        
        print(f"✅ Ecuaciones parseadas exitosamente")
        print(f"{'='*60}\n")
    
    def _parse_equation(self, eq_str: str, var_name: str) -> sp.Expr:
        """
        Parsea ecuación con sintaxis LaTeX simplificada
        Soporta: n = ..., n² = ..., n² - 1 = ..., o solo expresión
        """
        try:
            eq_str = eq_str.strip()
            
            if not eq_str or eq_str == '0':
                return sp.sympify('0')
            
            print(f"\n--- Parseando {var_name} ---")
            print(f"Entrada: {eq_str}")
            
            # Detectar si es ecuación (tiene =)
            is_equation = '=' in eq_str
            
            # Convertir LaTeX a sintaxis Python
            python_expr = self._latex_to_python(eq_str)
            print(f"Python: {python_expr}")
            
            if is_equation:
                parts = python_expr.split('=', 1)  # Solo primer =
                if len(parts) != 2:
                    raise ValueError("Ecuación debe tener exactamente un =")
                
                lhs = parts[0].strip().lower().replace(' ', '')
                rhs = parts[1].strip()
                
                print(f"LHS: {lhs}")
                print(f"RHS: {rhs}")
                
                # Parsear lado derecho
                rhs_expr = sp.sympify(rhs)
                
                # Resolver según lado izquierdo
                if lhs in ['n^2', 'n**2', 'n²', 'n2']:
                    expr = sp.sqrt(rhs_expr)
                    print(f"✓ Detectado: n² = ...")
                    print(f"  Resultado: n = √({rhs_expr})")
                elif lhs == 'n':
                    expr = rhs_expr
                    print(f"✓ Detectado: n = ...")
                elif lhs in ['n^2-1', 'n**2-1', 'n²-1', 'n2-1']:
                    expr = sp.sqrt(rhs_expr + 1)
                    print(f"✓ Detectado: n² - 1 = ...")
                    print(f"  Resultado: n = √({rhs_expr} + 1)")
                elif lhs in ['k', 'k^2', 'k**2', 'k²']:
                    # Para k, usar directamente o raíz cuadrada
                    expr = sp.sqrt(rhs_expr) if '^' in lhs or '²' in lhs else rhs_expr
                    print(f"✓ Detectado: k = ...")
                else:
                    raise ValueError(f"Lado izquierdo debe ser 'n', 'n²', 'n²-1' o 'k'. Recibido: {lhs}")
            else:
                # Sin =, parsear directamente
                expr = sp.sympify(python_expr)
                print(f"✓ Expresión directa (sin =)")
            
            print(f"Expresión SymPy: {expr}")
            
            return expr
                
        except Exception as e:
            raise ValueError(f"Error parseando {var_name}: {str(e)}\nEcuación original: {eq_str}")
    
    def _latex_to_python(self, latex_str: str) -> str:
        """
        Convierte LaTeX simplificado a sintaxis Python/SymPy
        """
        result = latex_str
        
        # 1. Reemplazos de símbolos y constantes
        replacements = {
            # Variables principales
            r'\lambda': 'lambda_var',
            r'\omega': 'omega_var',
            'λ': 'lambda_var',
            'ω': 'omega_var',
            
            # Constantes físicas
            r'\epsilon_\infty': 'epsilon_inf',
            r'\epsilon_inf': 'epsilon_inf',
            r'\varepsilon_\infty': 'epsilon_inf',
            r'\varepsilon_inf': 'epsilon_inf',
            'ε∞': 'epsilon_inf',
            'ε_∞': 'epsilon_inf',
            
            r'\omega_p': 'omega_p',
            r'\omega_0': 'omega_0',
            'ωₚ': 'omega_p',
            'ω₀': 'omega_0',
            'ω_p': 'omega_p',
            'ω_0': 'omega_0',
            
            # Subíndices comunes (Sellmeier, etc.)
            'B_1': 'B1',
            'C_1': 'C1',
            'B_2': 'B2',
            'C_2': 'C2',
            'B_3': 'B3',
            'C_3': 'C3',
            'A_0': 'A0',
            'A_1': 'A1',
        }
        
        for old, new in replacements.items():
            result = result.replace(old, new)
        
        # 2. Convertir fracciones: \frac{num}{den} → ((num)/(den))
        frac_pattern = r'\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        
        max_iterations = 10
        for _ in range(max_iterations):
            # Buscar fracciones de adentro hacia afuera
            new_result = re.sub(frac_pattern, r'((\1)/(\2))', result)
            if new_result == result:
                break
            result = new_result
        
        # 3. Convertir raíces: \sqrt{x} → sqrt(x)
        sqrt_pattern = r'\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        result = re.sub(sqrt_pattern, r'sqrt(\1)', result)
        
        # 4. Convertir potencias: ^{x} → **(x)
        # Primero las llaves: ^{2} → **2
        result = re.sub(r'\^\{([^}]+)\}', r'**(\1)', result)
        # Luego sin llaves: ^2 → **2
        result = re.sub(r'\^(\d+)', r'**\1', result)
        
        # 5. Limpiar backslashes restantes
        result = result.replace('\\', '')
        
        # 6. Asegurar multiplicación explícita en casos como "0.5lambda"
        # Insertar * entre número y letra
        result = re.sub(r'(\d)([a-zA-Z])', r'\1*\2', result)
        
        return result
    
    def _detect_variable(self) -> str:
        """Detecta si la ecuación usa λ o ω"""
        symbols_n = self.expr_n.free_symbols
        symbols_k = self.expr_k.free_symbols
        all_symbols = symbols_n.union(symbols_k)
        
        symbol_names = {str(s) for s in all_symbols}
        
        if 'lambda_var' in symbol_names:
            return 'lambda'
        elif 'omega_var' in symbol_names:
            return 'omega'
        else:
            # Default a lambda si no se detecta
            return 'lambda'
    
    def _create_function(self, expr: sp.Expr):
        """Crea función evaluable desde expresión SymPy"""
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
            wavelengths: Array de longitudes de onda en nm (SIEMPRE)
            
        Returns:
            (n_array, k_array)
        """
        if self.variable_type == 'omega':
            # ω = 2πc/λ
            c = 299792458  # m/s
            lambda_m = wavelengths * 1e-9  # nm → m
            omega = 2 * np.pi * c / lambda_m
            var_values = omega
        else:
            # λ - Auto-detectar unidades
            # Si wavelengths típico es 400-800 (nm), pero ecuación espera 0.4-0.8 (μm)
            
            # ⭐ AUTO-DETECCIÓN: Probar con nm primero
            try:
                n_test_nm = self.func_n(500.0)  # Probar con 500 nm
                
                # Si n está en rango razonable (0.5 - 10), usar nm
                if 0.5 <= n_test_nm <= 10:
                    var_values = wavelengths
                    print(f"✓ Usando λ en nm directamente")
                else:
                    # Si n es irrazonable, probar con μm
                    n_test_um = self.func_n(0.5)  # Probar con 0.5 μm
                    if 0.5 <= n_test_um <= 10:
                        var_values = wavelengths / 1000.0  # nm → μm
                        print(f"✓ Convirtiendo λ: nm → μm (ecuación espera μm)")
                    else:
                        # Usar nm por defecto
                        var_values = wavelengths
                        print(f"⚠️ No se pudo auto-detectar unidades, usando nm")
            except:
                # Si falla, usar nm por defecto
                var_values = wavelengths
        
        try:
            # Evaluar ecuaciones
            n_values = self.func_n(var_values)
            k_values = self.func_k(var_values)
            
            # Asegurar que son arrays
            n_values = np.atleast_1d(n_values)
            k_values = np.atleast_1d(k_values)
            
            # Convertir complejos a reales si es necesario
            if np.iscomplexobj(n_values):
                n_values = np.real(n_values)
            if np.iscomplexobj(k_values):
                k_values = np.real(k_values)
            
            # Validar valores físicos
            if np.any(n_values < 0):
                raise ValueError("Ecuación produce valores negativos de n")
            if np.any(k_values < 0):
                raise ValueError("Ecuación produce valores negativos de k")
            
            return n_values, k_values
            
        except Exception as e:
            raise ValueError(f"Error evaluando ecuaciones: {str(e)}")
    
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
                warnings.append(f"Valores de n fuera del rango típico (0.5-10): {validation['n_min']:.2f} - {validation['n_max']:.2f}")
            
            if validation['k_max'] > 5:
                warnings.append(f"Valores de k muy altos (k > 5): máx = {validation['k_max']:.2f}")
            
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
    """Convierte ω (rad/s) → λ (nm)"""
    c = 299792458  # m/s
    lambda_m = 2 * np.pi * c / omega
    lambda_nm = lambda_m * 1e9
    return lambda_nm


def lambda_to_omega(wavelength_nm: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """Convierte λ (nm) → ω (rad/s)"""
    c = 299792458  # m/s
    lambda_m = wavelength_nm * 1e-9
    omega = 2 * np.pi * c / lambda_m
    return omega