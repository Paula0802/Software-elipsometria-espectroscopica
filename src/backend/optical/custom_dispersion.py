"""
Módulo para modelos de dispersión personalizados
Parser simplificado sin dependencias externas problemáticas

VERSIÓN 2.0 - CORRECCIONES:
✅ Manejo correcto de números complejos (n̂ = n + ik)
✅ Extracción apropiada de n y k desde índice refractivo complejo
✅ Soporte completo para modelos Drude y Lorentz
"""

import numpy as np
import sympy as sp
from typing import Tuple, Union, Dict, List
import re
import logging

logger = logging.getLogger(__name__)

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
        
        logger.info(f"\n{'='*60}")
        logger.info(f"PARSEANDO ECUACIONES")
        logger.info(f"{'='*60}")
        
        # Parsear ecuaciones
        self.expr_n = self._parse_equation(equation_n, 'n')
        self.expr_k = self._parse_equation(equation_k, 'k')
        
        # Detectar variable si es auto
        if self.variable_type == "auto":
            self.variable_type = self._detect_variable()
        
        logger.info(f"Variable detectada: {self.variable_type}")
        
        # Crear funciones evaluables
        self.func_n = self._create_function(self.expr_n)
        self.func_k = self._create_function(self.expr_k)
        
        logger.info(f"✅ Ecuaciones parseadas exitosamente")
        logger.info(f"{'='*60}\n")
    
    def _parse_equation(self, eq_str: str, var_name: str) -> sp.Expr:
        """
        Parsea ecuación con sintaxis LaTeX simplificada
        Soporta: n = ..., n² = ..., n² - 1 = ..., o solo expresión
        """
        try:
            eq_str = eq_str.strip()
            
            if not eq_str or eq_str == '0':
                return sp.sympify('0')
            
            logger.info(f"\n--- Parseando {var_name} ---")
            logger.info(f"Entrada: {eq_str}")
            
            # Detectar si es ecuación (tiene =)
            is_equation = '=' in eq_str
            
            # Convertir LaTeX a sintaxis Python
            python_expr = self._latex_to_python(eq_str)
            logger.info(f"Python: {python_expr}")
            
            if is_equation:
                parts = python_expr.split('=', 1)  # Solo primer =
                if len(parts) != 2:
                    raise ValueError("Ecuación debe tener exactamente un =")
                
                lhs = parts[0].strip().lower().replace(' ', '')
                rhs = parts[1].strip()
                
                logger.info(f"LHS: {lhs}")
                logger.info(f"RHS: {rhs}")
                
                # Parsear lado derecho
                rhs_expr = sp.sympify(rhs)
                
                # Resolver según lado izquierdo
                if lhs in ['n^2', 'n**2', 'n²', 'n2']:
                    expr = sp.sqrt(rhs_expr)
                    logger.info(f"✓ Detectado: n² = ...")
                    logger.info(f"  Resultado: n = √({rhs_expr})")
                elif lhs == 'n':
                    expr = rhs_expr
                    logger.info(f"✓ Detectado: n = ...")
                elif lhs in ['n^2-1', 'n**2-1', 'n²-1', 'n2-1']:
                    expr = sp.sqrt(rhs_expr + 1)
                    logger.info(f"✓ Detectado: n² - 1 = ...")
                    logger.info(f"  Resultado: n = √({rhs_expr} + 1)")
                elif lhs in ['k', 'k^2', 'k**2', 'k²']:
                    # Para k, usar directamente o raíz cuadrada
                    expr = sp.sqrt(rhs_expr) if '^' in lhs or '²' in lhs else rhs_expr
                    logger.info(f"✓ Detectado: k = ...")
                else:
                    raise ValueError(f"Lado izquierdo debe ser 'n', 'n²', 'n²-1' o 'k'. Recibido: {lhs}")
            else:
                # Sin =, parsear directamente
                expr = sp.sympify(python_expr)
                logger.info(f"✓ Expresión directa (sin =)")
            
            logger.info(f"Expresión SymPy: {expr}")
            
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
            r'\gamma': 'gamma_var',
            'ωₚ': 'omega_p',
            'ω₀': 'omega_0',
            'ω_p': 'omega_p',
            'ω_0': 'omega_0',
            'Γ': 'gamma_var',
            
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
        
        VERSIÓN 2.0: Manejo correcto de números complejos
        - Para modelos que retornan n̂ = n + ik (ej: Drude, Lorentz)
        - Extrae correctamente n = Re(n̂) y k = |Im(n̂)|
        
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
            logger.info(f"✓ Conversión: λ (nm) → ω (rad/s)")
            logger.info(f"  Rango ω: [{omega.min():.3e}, {omega.max():.3e}] rad/s")
        else:
            # λ - Auto-detectar unidades
            # Si wavelengths típico es 400-800 (nm), pero ecuación espera 0.4-0.8 (μm)
            
            # ⭐ AUTO-DETECCIÓN: Probar con nm primero
            try:
                n_test_nm = self.func_n(500.0)  # Probar con 500 nm
                
                # Si n está en rango razonable (0.5 - 10), usar nm
                # También verificar si no es complejo con parte imaginaria grande
                if np.iscomplexobj(n_test_nm):
                    n_real = np.abs(np.real(n_test_nm))
                else:
                    n_real = abs(n_test_nm)
                
                if 0.5 <= n_real <= 10:
                    var_values = wavelengths
                    logger.info(f"✓ Usando λ en nm directamente")
                else:
                    # Si n es irrazonable, probar con μm
                    n_test_um = self.func_n(0.5)  # Probar con 0.5 μm
                    
                    if np.iscomplexobj(n_test_um):
                        n_real_um = np.abs(np.real(n_test_um))
                    else:
                        n_real_um = abs(n_test_um)
                    
                    if 0.5 <= n_real_um <= 10:
                        var_values = wavelengths / 1000.0  # nm → μm
                        logger.info(f"✓ Convirtiendo λ: nm → μm (ecuación espera μm)")
                    else:
                        # Usar nm por defecto
                        var_values = wavelengths
                        logger.info(f"⚠️ No se pudo auto-detectar unidades, usando nm")
            except:
                # Si falla, usar nm por defecto
                var_values = wavelengths
        
        try:
            # ========================================
            # EVALUAR ECUACIONES
            # ========================================
            n_complex = self.func_n(var_values)
            k_complex = self.func_k(var_values)
            
            # Asegurar que son arrays
            n_complex = np.atleast_1d(n_complex)
            k_complex = np.atleast_1d(k_complex)
            
            # ========================================
            # ⭐ NUEVA LÓGICA v2.0: MANEJO DE NÚMEROS COMPLEJOS
            # ========================================
            
            # CASO 1: La ecuación de n retorna número complejo
            # (típico en modelos Drude/Lorentz donde n² = ε y ε es complejo)
            if np.iscomplexobj(n_complex):
                logger.info("🔍 Detectado: ecuación de n produce valores complejos")
                
                # Extraer partes real e imaginaria
                n_real_part = np.real(n_complex)
                n_imag_part = np.imag(n_complex)
                
                logger.info(f"  Re(n̂): [{n_real_part.min():.4f}, {n_real_part.max():.4f}]")
                logger.info(f"  Im(n̂): [{n_imag_part.min():.4f}, {n_imag_part.max():.4f}]")
                
                # Para índice refractivo complejo: n̂ = n + ik
                # n = Re(n̂)
                # k = Im(n̂) (tomar valor absoluto para asegurar k ≥ 0)
                n_values = n_real_part
                k_from_n_complex = np.abs(n_imag_part)
                
                # Decidir si usar k de la ecuación compleja o la ecuación k separada
                if self.equation_k_original == "0" or self.equation_k_original.strip() == "":
                    # Usuario NO especificó k, usar el k extraído de n̂
                    k_values = k_from_n_complex
                    logger.info("  ✓ Usando k extraído de n̂ = n + ik")
                else:
                    # Usuario SÍ especificó k por separado
                    # Evaluar la ecuación de k
                    if np.iscomplexobj(k_complex):
                        k_values = np.real(k_complex)
                        logger.info("  ✓ Usando k de ecuación separada (tomando parte real)")
                    else:
                        k_values = k_complex
                        logger.info("  ✓ Usando k de ecuación separada")
                    
                    # Advertir si hay discrepancia significativa
                    if np.mean(np.abs(k_values - k_from_n_complex)) > 0.1:
                        logger.warning(
                            f"⚠️ Discrepancia entre k de ecuación ({np.mean(k_values):.4f}) "
                            f"y k extraído de n̂ ({np.mean(k_from_n_complex):.4f})"
                        )
            
            # CASO 2: n es real pero k puede ser complejo
            else:
                n_values = np.real(n_complex)
                
                if np.iscomplexobj(k_complex):
                    logger.info("🔍 Detectado: ecuación de k produce valores complejos")
                    k_values = np.real(k_complex)
                    logger.info("  ✓ Tomando parte real de k")
                else:
                    k_values = k_complex
            
            # ========================================
            # VALIDACIONES FÍSICAS
            # ========================================
            
            # Validar que n no sea negativo (físicamente imposible)
            if np.any(n_values < 0):
                n_negative_count = np.sum(n_values < 0)
                logger.error(f"❌ {n_negative_count} valores de n < 0 detectados")
                logger.error(f"   Rango: [{n_values.min():.4f}, {n_values.max():.4f}]")
                raise ValueError(
                    f"Ecuación produce {n_negative_count} valores negativos de n. "
                    "Verificar ecuación o parámetros."
                )
            
            # Validar que k no sea negativo (absorción siempre positiva)
            if np.any(k_values < 0):
                k_negative_count = np.sum(k_values < 0)
                logger.error(f"❌ {k_negative_count} valores de k < 0 detectados")
                logger.error(f"   Rango: [{k_values.min():.4f}, {k_values.max():.4f}]")
                raise ValueError(
                    f"Ecuación produce {k_negative_count} valores negativos de k. "
                    "Verificar ecuación o parámetros."
                )
            
            # Advertencias para valores extremos
            if np.any(n_values > 10):
                logger.warning(f"⚠️ Valores altos de n detectados (máx: {n_values.max():.2f})")
            
            if np.any(k_values > 5):
                logger.warning(f"⚠️ Valores altos de k detectados (máx: {k_values.max():.2f})")
            
            # Logging final
            logger.info("✅ Resultados finales:")
            logger.info(f"  n: [{n_values.min():.4f}, {n_values.max():.4f}]")
            logger.info(f"  k: [{k_values.min():.6f}, {k_values.max():.6f}]")
            
            return n_values, k_values
            
        except Exception as e:
            logger.error(f"❌ Error evaluando ecuaciones: {str(e)}")
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
                warnings.append(
                    f"Valores de n fuera del rango típico (0.5-10): "
                    f"{validation['n_min']:.2f} - {validation['n_max']:.2f}"
                )
            
            if validation['k_max'] > 5:
                warnings.append(f"Valores de k muy altos (k > 5): máx = {validation['k_max']:.2f}")
            
            if validation['k_min'] < 0:
                warnings.append(f"⚠️ Valores negativos de k detectados: mín = {validation['k_min']:.4f}")
            
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