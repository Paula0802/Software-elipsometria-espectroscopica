"""
FastAPI Application para Elipsometría Espectroscópica
Versión modular con separación de responsabilidades
 INCLUYE: Endpoint de validación EMT para n,k efectivos
"""
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from pathlib import Path, PurePath
from datetime import datetime
import pandas as pd
import shutil
import numpy as np
import json
import uuid
import re
import logging  

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)
# Importar módulos propios (usar nombres de paquete absolutos desde src)
from backend.optical.tmm import run_tmm_calculation
from backend.optical.conversions import epsilon_to_nk, omega_to_wavelength, nk_to_epsilon
from backend.utils.file_readers import read_spe_file, read_optical_file
from backend.routes.theoretical_routes import router as theoretical_router

# ⭐ NUEVO: Imports para validación EMT
from backend.optical.emt import calculate_effective_medium
from backend.optical.dispersion_models import get_nk_from_model
from io import StringIO
import base64

# Inicializar FastAPI
app = FastAPI(title="Elipsometría Espectroscópica API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar rutas de cálculos teóricos
app.include_router(theoretical_router)

# Directorios
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BACKEND_DIR / "uploads"
MODELS_DIR = BACKEND_DIR / "models"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ==========================================
# UTILIDADES DE SEGURIDAD
# ==========================================

def sanitize_filename(filename: str) -> str:
    """Sanitiza nombres de archivo para evitar path traversal"""
    basename = PurePath(filename).name
    basename = re.sub(r'[^\w\.\-]', '_', basename)
    if not basename or basename.startswith('.'):
        basename = f"file_{uuid.uuid4().hex[:8]}"
    return basename


def validate_save_path(base_dir: Path, save_path: Path) -> bool:
    """Valida que la ruta de guardado esté dentro del directorio permitido"""
    try:
        resolved_base = base_dir.resolve(strict=True)
        parent_dir = save_path.parent
        if parent_dir.exists():
            resolved_parent = parent_dir.resolve(strict=True)
            if not resolved_parent.is_relative_to(resolved_base):
                return False
        if save_path.exists() and save_path.is_symlink():
            return False
        try:
            save_path.relative_to(base_dir)
        except ValueError:
            return False
        return True
    except Exception:
        return False


def generate_safe_upload_path(base_dir: Path, original_filename: str) -> Path:
    """Genera una ruta segura para guardar archivos subidos"""
    safe_name = sanitize_filename(original_filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = base_dir / unique_name
    if not validate_save_path(base_dir, save_path):
        unique_name = f"{uuid.uuid4().hex}.dat"
        save_path = base_dir / unique_name
    return save_path


# ==========================================
# ⭐ NUEVO: FUNCIÓN AUXILIAR PARA EMT
# ==========================================

# ==========================================
# ⭐ FUNCIÓN AUXILIAR PARA EMT
# ==========================================

def prepare_component_optical_data(component: Dict[str, Any], wavelengths: np.ndarray) -> Dict[str, Any]:
    """
    Prepara los datos ópticos (n, k) de un componente individual para EMT
    
    Args:
        component: Diccionario con la configuración del componente
        wavelengths: Array de longitudes de onda
    
    Returns:
        Dict con 'n' y 'k' como arrays
    """
    # Caso 1: Modelo constante
    if component.get('model') == 'constant':
        n_val = component.get('n', 1.5)
        k_val = component.get('k', 0.0)
        return {
            'n': np.full_like(wavelengths, n_val, dtype=float),
            'k': np.full_like(wavelengths, k_val, dtype=float)
        }
    
    # Caso 2: Datos de archivo (optical_data)
    if 'optical_data' in component:
        optical_data = component['optical_data']
        n_interp = np.interp(
            wavelengths,
            optical_data['wavelength'],
            optical_data['n']
        )
        k_interp = np.interp(
            wavelengths,
            optical_data['wavelength'],
            optical_data['k']
        )
        return {'n': n_interp, 'k': k_interp}
    
    # Caso 3: Modelo de dispersión (cauchy, sellmeier, drude, lorentz, drude-lorentz, custom)
    if 'model' in component and 'params' in component:
        try:
            n, k = get_nk_from_model(
                component['model'],
                wavelengths,
                component['params']
            )
            return {'n': n, 'k': k}
        except Exception as e:
            raise ValueError(
                f"Error calculando n,k para componente '{component.get('name', 'Unknown')}' "
                f"con modelo '{component['model']}': {str(e)}"
            )
    
    # Caso 4: Ecuación personalizada
    if component.get('model') == 'custom' and 'equation' in component:
        try:
            n, k = get_nk_from_model(
                'custom',
                wavelengths,
                {'equation': component['equation']}
            )
            return {'n': n, 'k': k}
        except Exception as e:
            raise ValueError(
                f"Error evaluando ecuación personalizada para componente "
                f"'{component.get('name', 'Unknown')}': {str(e)}"
            )
    
    # Si no se puede determinar
    raise ValueError(
        f"Componente '{component.get('name', 'Unknown')}' no tiene datos ópticos válidos. "
        f"Debe especificar: model='constant', optical_data, o model con params."
    )

# ==========================================
# ENDPOINTS PRINCIPALES
# ==========================================

@app.get("/")
def root():
    """Página principal - sirve upload.html"""
    html_path = FRONTEND_DIR / "upload.html"
    if not html_path.exists():
        return JSONResponse(
            {"error": f"No se encuentra upload.html en {FRONTEND_DIR}"},
            status_code=404
        )
    return FileResponse(html_path, headers={"Cache-Control": "no-cache"})


@app.get("/upload.html")
def upload_page():
    """Página de upload alternativa"""
    return FileResponse(FRONTEND_DIR / "upload.html", headers={"Cache-Control": "no-cache"})


# ==========================================
# UPLOAD DE ARCHIVOS EXPERIMENTALES
# ==========================================

@app.post("/api/upload")
async def upload_experimental_file(file: UploadFile = File(...)):
    """
    Sube y procesa archivos experimentales (.csv, .txt, .xlsx, .spe)
    con datos de Psi, Delta y longitud de onda
    """
    allowed = [".csv", ".txt", ".xlsx", ".spe"]
    original_filename = file.filename or "unknown"
    ext = Path(original_filename).suffix.lower()
    
    if ext not in allowed:
        return JSONResponse(
            {"error": f"Archivo no soportado ({ext}). Use: {allowed}"},
            status_code=400
        )
    
    save_path = generate_safe_upload_path(UPLOAD_DIR, original_filename)
    
    if not validate_save_path(UPLOAD_DIR, save_path):
        return JSONResponse(
            {"error": "Nombre de archivo inválido"},
            status_code=400
        )
    
    # Guardar archivo
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Procesar archivo
    try:
        if ext == ".csv":
            df = pd.read_csv(save_path)
        elif ext == ".txt":
            try:
                df = pd.read_csv(save_path, sep="\t")
            except:
                try:
                    df = pd.read_csv(save_path, sep=",")
                except:
                    df = pd.read_csv(save_path, delim_whitespace=True)
        elif ext == ".xlsx":
            df = pd.read_excel(save_path)
        elif ext == ".spe":
            df = read_spe_file(save_path)
        else:
            raise Exception("Formato no reconocido.")
    except Exception as e:
        return JSONResponse({"error": f"Error leyendo archivo: {str(e)}"}, status_code=400)
    
    if len(df.columns) < 3:
        return JSONResponse(
            {"error": "El archivo debe tener al menos 3 columnas (Psi, Delta, Longitud de onda)"},
            status_code=400
        )
    
    # Limpiar datos
    df.columns = df.columns.str.strip()
    
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col], errors='raise')
        except (ValueError, TypeError):
            pass
    
    df = df.replace([np.inf, -np.inf], np.nan)
    nan_count = df.isna().sum().sum()
    
    if nan_count > 0:
        nan_columns = df.columns[df.isna().any()].tolist()
        df = df.dropna()
        if len(df) == 0:
            return JSONResponse(
                {"error": f"El archivo contiene demasiados valores inválidos en las columnas: {nan_columns}"},
                status_code=400
            )
    
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].astype(float)
    
    preview = df.head(10).to_dict(orient="records")
    all_data = df.to_dict(orient="records")
    
    return {
        "filename": original_filename,
        "columns": df.columns.tolist(),
        "preview": preview,
        "full_data": all_data,
        "total_rows": len(df),
        "rows_with_nan_removed": int(nan_count) if nan_count > 0 else 0
    }




# ==========================================
# UPLOAD DE DATOS ÓPTICOS (n,k o ε)
# ==========================================
def process_optical_file(file_path, file_type):
    """
    Procesa archivos de datos ópticos con detección automática de formato
    """
    import pandas as pd
    import numpy as np
    
    # Leer archivo
    df = pd.read_csv(file_path, comment='#', delim_whitespace=True, header=None)
    
    result = {
        'success': False,
        'data': None,
        'info': {},
        'warnings': []
    }
    
    # DETECTAR FORMATO
    num_cols = len(df.columns)
    
    if file_type == 'nk':
        if num_cols == 3:
            # Formato: wavelength, n, k
            wavelengths = df.iloc[:, 0].values
            n_values = df.iloc[:, 1].values
            k_values = df.iloc[:, 2].values
            
            result['info']['format'] = 'Tres columnas (λ, n, k)'
            
        elif num_cols == 2:
            # Formato: DOS BLOQUES SEPARADOS
            # Primer bloque: wavelength, n
            # Segundo bloque: wavelength, k
            
            # Buscar donde cambia el patrón (donde empieza el bloque de k)
            # Heurística: buscar repetición de wavelengths
            mid_point = len(df) // 2
            
            wavelengths_block1 = df.iloc[:mid_point, 0].values
            n_values = df.iloc[:mid_point, 1].values
            
            wavelengths_block2 = df.iloc[mid_point:, 0].values
            k_values = df.iloc[mid_point:, 1].values
            
            # Verificar que las wavelengths coincidan
            if not np.allclose(wavelengths_block1, wavelengths_block2, rtol=0.01):
                result['warnings'].append(
                    'Los valores de λ en los dos bloques no coinciden exactamente. '
                    'Se usará el primer bloque.'
                )
            
            wavelengths = wavelengths_block1
            result['info']['format'] = 'Dos bloques (λ,n) y (λ,k)'
            
        else:
            result['error'] = f'Formato no reconocido: {num_cols} columnas encontradas'
            return result
    
    # DETECTAR UNIDADES (μm vs nm)
    max_wavelength = np.max(wavelengths)
    
    if max_wavelength < 50:  # Probablemente en micrómetros
        wavelengths = wavelengths * 1000  # Convertir μm → nm
        result['info']['units_converted'] = 'μm → nm'
        result['warnings'].append(
            f'Longitudes de onda detectadas en micrómetros (máx: {max_wavelength:.2f} μm). '
            f'Convertidas automáticamente a nanómetros.'
        )
    else:
        result['info']['units'] = 'nm (sin conversión)'
    
    # VALIDAR DATOS
    if len(wavelengths) != len(n_values):
        result['error'] = f'Discrepancia: {len(wavelengths)} wavelengths vs {len(n_values)} valores de n'
        return result
    
    if len(wavelengths) != len(k_values):
        result['error'] = f'Discrepancia: {len(wavelengths)} wavelengths vs {len(k_values)} valores de k'
        return result
    
    # CONSTRUIR RESULTADO
    result['success'] = True
    result['data'] = {
        'wavelength': wavelengths.tolist(),
        'n': n_values.tolist(),
        'k': k_values.tolist(),
        'file_type': 'nk'
    }
    
    result['info']['points'] = len(wavelengths)
    result['info']['wavelength_range'] = [float(np.min(wavelengths)), float(np.max(wavelengths))]
    result['info']['n_range'] = [float(np.min(n_values)), float(np.max(n_values))]
    result['info']['k_range'] = [float(np.min(k_values)), float(np.max(k_values))]
    
    return result
# ==========================================
# validacion de datos con ε
# ==========================================
@app.post("/api/validate-material-file-range")
async def validate_material_file_range(request: dict):
    """
    Valida que el rango del archivo de material cubra el rango experimental
    """
    try:
        # Extraer datos
        material_wavelengths = request.get('material_wavelengths', [])
        experimental_wavelengths = request.get('experimental_wavelengths', [])
        file_type = request.get('file_type', 'nk')  # 'nk', 'epsilon', o 'omega'
        
        if not material_wavelengths or not experimental_wavelengths:
            return {
                'valid': False,
                'error': 'Datos de longitudes de onda faltantes'
            }
        
        # Convertir a numpy arrays
        mat_wl = np.array(material_wavelengths, dtype=float)
        exp_wl = np.array(experimental_wavelengths, dtype=float)
        
        # Rangos
        mat_min, mat_max = mat_wl.min(), mat_wl.max()
        exp_min, exp_max = exp_wl.min(), exp_wl.max()
        
        # Validar cobertura
        coverage_ok = (mat_min <= exp_min) and (mat_max >= exp_max)
        
        # Calcular estadísticas de cobertura
        points_below = np.sum(exp_wl < mat_min)
        points_above = np.sum(exp_wl > mat_max)
        points_covered = len(exp_wl) - points_below - points_above
        coverage_percentage = (points_covered / len(exp_wl)) * 100
        
        return {
            'valid': coverage_ok,
            'coverage_percentage': float(coverage_percentage),
            'material_range': [float(mat_min), float(mat_max)],
            'experimental_range': [float(exp_min), float(exp_max)],
            'points_requiring_extrapolation': int(points_below + points_above),
            'points_below_range': int(points_below),
            'points_above_range': int(points_above),
            'file_type': file_type,
            'warning': None if coverage_ok else f'El archivo de material ({mat_min:.1f}-{mat_max:.1f} nm) no cubre completamente el rango experimental ({exp_min:.1f}-{exp_max:.1f} nm)'
        }
        
    except Exception as e:
        logger.error(f"Error en validación de rango de archivo: {str(e)}")
        return {
            'valid': False,
            'error': str(e)
        }
# ==========================================
# CONVERSIÓN EPSILON → N,K
# ==========================================

@app.post("/api/convert-epsilon")
async def convert_epsilon_endpoint(data: Dict[str, Any]):
    """Endpoint para convertir ε₁, ε₂, ω a n, k, λ"""
    try:
        epsilon1 = np.array(data.get("epsilon1", []))
        epsilon2 = np.array(data.get("epsilon2", []))
        omega = np.array(data.get("omega", []))
        omega_unit = data.get("omega_unit", "eV")
        
        if len(epsilon1) == 0 or len(epsilon2) == 0:
            return JSONResponse({"error": "Se requieren datos de epsilon1 y epsilon2"}, status_code=400)
        
        n, k = epsilon_to_nk(epsilon1, epsilon2)
        
        if len(omega) > 0:
            wavelength = omega_to_wavelength(omega, omega_unit)
        else:
            wavelength = np.arange(len(n))
        
        return {
            "wavelength": wavelength.tolist(),
            "n": n.tolist(),
            "k": k.tolist()
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

# ==========================================
# VALIDACIÓN DE RANGOS DE LONGITUD DE ONDA
# ==========================================
@app.post("/api/validate-wavelength-range")
async def validate_wavelength_range(data: Dict[str, Any]):
    """
    Valida si el rango de longitudes de onda del modelo
    es compatible con los datos experimentales
    """
    try:
        # Log de entrada para debugging
        logger.info("=" * 60)
        logger.info("INICIO VALIDACIÓN DE RANGO")
        logger.info(f"Modo: {data.get('wavelength_mode')}")
        
        # ⭐ IMPORTAR CON MANEJO DE ERRORES
        try:
            from backend.utils.interpolation import (
                validate_wavelength_compatibility,
                check_single_wavelength
            )
            logger.info("✓ Módulo de interpolación importado correctamente")
        except ImportError as e:
            logger.error(f"Error importando módulo de interpolación: {str(e)}")
            return JSONResponse({
                "valid": False,
                "message": "Error interno: módulo de interpolación no disponible"
            }, status_code=500)
        
        # Extraer datos de la petición
        wavelengths_exp = data.get('wavelengths_exp', [])
        psi_exp = data.get('psi_exp', [])
        delta_exp = data.get('delta_exp', [])
        mode = data.get('wavelength_mode')
        
        logger.info(f"Datos recibidos: {len(wavelengths_exp)} puntos experimentales")
        
        # Validar que existen datos experimentales
        if len(wavelengths_exp) == 0:
            logger.warning("No hay datos experimentales")
            return {
                "valid": False,
                "message": " No hay datos experimentales cargados"
            }
        
        # ⭐ CONVERTIR A NUMPY CON MANEJO DE ERRORES
        try:
            wavelengths_exp = np.array(wavelengths_exp, dtype=float)
            psi_exp = np.array(psi_exp, dtype=float)
            delta_exp = np.array(delta_exp, dtype=float)
            logger.info("✓ Datos convertidos a numpy arrays")
        except Exception as e:
            logger.error(f"Error convirtiendo datos a numpy: {str(e)}")
            return JSONResponse({
                "valid": False,
                "message": f"Error procesando datos experimentales: {str(e)}"
            }, status_code=400)
        
        # Verificar que no hay NaN
        if np.any(np.isnan(wavelengths_exp)) or np.any(np.isnan(psi_exp)) or np.any(np.isnan(delta_exp)):
            logger.error("Datos experimentales contienen NaN")
            return {
                "valid": False,
                "message": "Los datos experimentales contienen valores inválidos (NaN)"
            }
        
        wl_min_exp = float(np.min(wavelengths_exp))
        wl_max_exp = float(np.max(wavelengths_exp))
        
        logger.info(f"Rango experimental: [{wl_min_exp:.2f}, {wl_max_exp:.2f}] nm")
        
        # ============================================
        # MODO 1: Usar longitudes del archivo
        # ============================================
        if mode == 'file':
            logger.info("✓ Modo: usar longitudes del archivo")
            return {
                "valid": True,
                "message": f"✓ Usando longitudes de onda del archivo experimental [{wl_min_exp:.1f}, {wl_max_exp:.1f}] nm",
                "in_range": True,
                "interpolation_needed": False,
                "extrapolation_points": 0,
                "exp_range": [wl_min_exp, wl_max_exp],
                "target_range": [wl_min_exp, wl_max_exp]
            }
        
        # ============================================
        # MODO 2: Rango personalizado
        # ============================================
        elif mode == 'range':
            try:
                wl_from = float(data.get('wl_from', 0))
                wl_to = float(data.get('wl_to', 0))
                wl_steps = int(data.get('wl_steps', 0))
                
                logger.info(f"Rango solicitado: [{wl_from:.2f}, {wl_to:.2f}] nm, {wl_steps} pasos")
                
                # Validaciones básicas
                if wl_from <= 0 or wl_to <= 0 or wl_steps < 2:
                    logger.warning(f"⚠️ Parámetros inválidos: from={wl_from}, to={wl_to}, steps={wl_steps}")
                    return {
                        "valid": False,
                        "message": "Parámetros de rango inválidos"
                    }
                
                if wl_from >= wl_to:
                    logger.warning(f"⚠️ Rango inválido: from={wl_from} >= to={wl_to}")
                    return {
                        "valid": False,
                        "message": "La longitud de onda inicial debe ser menor que la final"
                    }
                
                # Generar longitudes de onda objetivo
                wavelengths_target = np.linspace(wl_from, wl_to, wl_steps)
                logger.info(f"✓ Generadas {len(wavelengths_target)} longitudes objetivo")
                
                # Validar compatibilidad
                try:
                    validation = validate_wavelength_compatibility(
                        wavelengths_exp,
                        wavelengths_target
                    )
                    logger.info(f"✓ Validación completada: compatible={validation['compatible']}, in_range={validation['in_range']}")
                except Exception as e:
                    logger.error(f" Error en validate_wavelength_compatibility: {str(e)}")
                    logger.error(f"Tipo de error: {type(e).__name__}")
                    import traceback
                    logger.error(f"Traceback:\n{traceback.format_exc()}")
                    
                    return JSONResponse({
                        "valid": False,
                        "message": f"Error al validar compatibilidad: {str(e)}"
                    }, status_code=500)
                
                if not validation['compatible']:
                    logger.warning(f"Rango no compatible: {validation['message']}")
                    return {
                        "valid": False,
                        "message": validation['message'],
                        "in_range": False,
                        "exp_range": validation['exp_range'],
                        "target_range": validation['target_range']
                    }
                
                logger.info("✓ Rango válido, retornando resultado")
                return {
                    "valid": True,
                    "message": validation['message'],
                    "in_range": validation['in_range'],
                    "interpolation_needed": True,
                    "extrapolation_points": validation['extrapolated_points'],
                    "exp_range": validation['exp_range'],
                    "target_range": validation['target_range'],
                    "overlap_percentage": validation['overlap_percentage']
                }
                
            except ValueError as ve:
                logger.error(f"ValueError en modo range: {str(ve)}")
                return JSONResponse({
                    "valid": False,
                    "message": f"Error de validación: {str(ve)}"
                }, status_code=400)
            except Exception as e:
                logger.error(f"Error inesperado en modo range: {str(e)}")
                logger.error(f"Tipo de error: {type(e).__name__}")
                import traceback
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                
                return JSONResponse({
                    "valid": False,
                    "message": f"Error interno del servidor: {str(e)}"
                }, status_code=500)
        
        # ============================================
        # MODO 3: Longitud única
        # ============================================
        elif mode == 'single':
            try:
                wl_single = float(data.get('wl_single', 0))
                
                logger.info(f"Longitud única solicitada: {wl_single:.2f} nm")
                
                if wl_single <= 0:
                    logger.warning(f"Longitud inválida: {wl_single}")
                    return {
                        "valid": False,
                        "message": "Longitud de onda inválida"
                    }
                
                # Verificar longitud única
                try:
                    check = check_single_wavelength(wavelengths_exp, wl_single)
                    logger.info(f"✓ Verificación completada: in_range={check['in_range']}, exact_match={check['exact_match']}")
                except Exception as e:
                    logger.error(f"Error en check_single_wavelength: {str(e)}")
                    logger.error(f"Tipo de error: {type(e).__name__}")
                    import traceback
                    logger.error(f"Traceback:\n{traceback.format_exc()}")
                    
                    return JSONResponse({
                        "valid": False,
                        "message": f"Error al verificar longitud de onda: {str(e)}"
                    }, status_code=500)
                
                return {
                    "valid": check['in_range'],
                    "message": check['message'],
                    "in_range": check['in_range'],
                    "interpolation_needed": not check['exact_match'],
                    "extrapolation_points": 0 if check['in_range'] else 1,
                    "exp_range": check['exp_range'],
                    "target_range": [wl_single, wl_single],
                    "exact_match": check['exact_match'],
                    "closest_exp_wavelength": check['closest_exp_wavelength'],
                    "distance": check['distance']
                }
                
            except ValueError as ve:
                logger.error(f"ValueError en modo single: {str(ve)}")
                return JSONResponse({
                    "valid": False,
                    "message": f"Error de validación: {str(ve)}"
                }, status_code=400)
            except Exception as e:
                logger.error(f"Error inesperado en modo single: {str(e)}")
                logger.error(f"Tipo de error: {type(e).__name__}")
                import traceback
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                
                return JSONResponse({
                    "valid": False,
                    "message": f"Error interno del servidor: {str(e)}"
                }, status_code=500)
        
        else:
            logger.error(f"Modo desconocido: {mode}")
            return {
                "valid": False,
                "message": f"Modo de longitud de onda no reconocido: {mode}"
            }
    
    except Exception as e:
        logger.error("=" * 60)
        logger.error("❌ ERROR CRÍTICO EN ENDPOINT")
        logger.error(f"Tipo de error: {type(e).__name__}")
        logger.error(f"Mensaje: {str(e)}")
        import traceback
        logger.error(f"Traceback completo:\n{traceback.format_exc()}")
        logger.error("=" * 60)
        
        return JSONResponse({
            "valid": False,
            "message": f"Error interno del servidor. Por favor, revisa los logs del servidor."
        }, status_code=500)





# ==========================================
#  NUEVO: VALIDACIÓN Y CÁLCULO EMT
# ==========================================

@app.post("/api/validate-emt")
async def validate_emt_configuration(data: Dict[str, Any]):
    """
    Valida y calcula n,k efectivos para una configuración EMT
    
    ANTES de guardar el modelo completo, permite verificar que:
    - La suma de fracciones volumétricas = 1.0
    - Los parámetros de componentes son válidos
    - Newton-Raphson converge (para Bruggeman)
    - No hay valores NaN en los resultados
    
    Request body:
    {
        "medium_type": "ambient" | "substrate" | "layer",
        "medium_name": "Nombre del medio",
        "emt_model": "bruggeman" | "maxwell-garnett",
        "wavelengths": [400, 401, ..., 800],
        "components": [
            {
                "name": "SiO2",
                "fraction": 0.7,
                "model": "cauchy",
                "params": {"A": 1.45, "B": 0.003, "C": 0}
            },
            {
                "name": "Poros",
                "fraction": 0.3,
                "model": "constant",
                "n": 1.0,
                "k": 0.0
            }
        ]
    }
    
    Response (éxito):
    {
        "success": true,
        "n_eff": [...],
        "k_eff": [...],
        "wavelengths": [...],
        "validation": {...},
        "download_csv": "data:text/csv;base64,...",
        "statistics": {...}
    }
    """
    try:
        # 1. Validar datos de entrada
        medium_name = data.get('medium_name', 'Medio sin nombre')
        emt_model = data.get('emt_model', 'bruggeman')
        wavelengths = np.array(data.get('wavelengths', []))
        components = data.get('components', [])
        
        if len(wavelengths) == 0:
            return JSONResponse(
                {"error": "No se especificaron longitudes de onda"},
                status_code=400
            )
        
        if len(components) < 2:
            return JSONResponse(
                {"error": "Se requieren al menos 2 componentes para EMT"},
                status_code=400
            )
        
        # 2. Validar suma de fracciones
        total_fraction = sum(comp.get('fraction', 0) for comp in components)
        fraction_valid = abs(total_fraction - 1.0) < 0.01
        
        if not fraction_valid:
            return JSONResponse(
                {
                    "error": f"La suma de fracciones volumétricas debe ser 1.0 (actual: {total_fraction:.3f})",
                    "fraction_sum": total_fraction,
                    "fraction_valid": False
                },
                status_code=400
            )
        
        # 3. Preparar componentes: calcular n, k para cada uno
        prepared_components = []
        
        for i, comp in enumerate(components):
            comp_name = comp.get('name', f'Componente {i+1}')
            fraction = comp.get('fraction', 0)
            
            try:
                # Calcular n, k para este componente
                optical_data = prepare_component_optical_data(comp, wavelengths)
                
                prepared_components.append({
                    'name': comp_name,
                    'fraction': fraction,
                    'n': optical_data['n'],
                    'k': optical_data['k']
                })
                
            except Exception as e:
                return JSONResponse(
                    {
                        "error": f"Error en componente '{comp_name}': {str(e)}",
                        "component_index": i
                    },
                    status_code=400
                )
        
        # 4. Preparar datos para EMT
        emt_data = {
            'emt_model': emt_model,
            'components': prepared_components
        }
        
       # 5. Calcular n,k efectivos usando el módulo EMT
        try:
            n_eff, k_eff = calculate_effective_medium(emt_data, wavelengths)
            
            # ⭐ DEBUG: Verificar tipo y contenido
            print(f"🔍 DEBUG EMT:")
            print(f"  - Tipo n_eff: {type(n_eff)}")
            print(f"  - Tipo k_eff: {type(k_eff)}")
            print(f"  - Es numpy array?: {isinstance(n_eff, np.ndarray)}")
            print(f"  - Longitud: {len(n_eff) if hasattr(n_eff, '__len__') else 'N/A'}")
            if isinstance(n_eff, np.ndarray):
                print(f"  - n_eff (primeros 5): {n_eff[:5]}")
            else:
                print(f"  - n_eff (valor único): {n_eff}")
            
        except Exception as e:
            return JSONResponse(
                {
                    "error": f"Error calculando medio efectivo con {emt_model}: {str(e)}",
                    "emt_model": emt_model
                },
                status_code=500
            )
        
        # 6. Verificar que los resultados son válidos
        if np.any(np.isnan(n_eff)) or np.any(np.isnan(k_eff)):
            return JSONResponse(
                {
                    "error": "El cálculo de n,k efectivos produjo valores NaN. "
                           "Revisa los parámetros de los componentes.",
                    "nan_count_n": int(np.sum(np.isnan(n_eff))),
                    "nan_count_k": int(np.sum(np.isnan(k_eff)))
                },
                status_code=500
            )
        
        # 7. Crear CSV para descarga
        df = pd.DataFrame({
            'wavelength_nm': wavelengths,
            'n_effective': n_eff,
            'k_effective': k_eff
        })
        
        csv_buffer = StringIO()
        df.to_csv(csv_buffer, index=False, float_format='%.6f')
        csv_data = csv_buffer.getvalue()
        
        # Convertir a base64 para download
        csv_base64 = base64.b64encode(csv_data.encode()).decode()
        
        # 8. Retornar resultados exitosos
        return {
            "success": True,
            "medium_name": medium_name,
            "n_eff": n_eff.tolist(),
            "k_eff": k_eff.tolist(),
            "wavelengths": wavelengths.tolist(),
            "validation": {
                "fraction_sum": float(total_fraction),
                "fraction_valid": True,
                "components_count": len(components),
                "emt_model": emt_model,
                "wavelength_points": len(wavelengths)
            },
            "download_csv": f"data:text/csv;base64,{csv_base64}",
            "statistics": {
                "n_min": float(np.min(n_eff)),
                "n_max": float(np.max(n_eff)),
                "n_mean": float(np.mean(n_eff)),
                "k_min": float(np.min(k_eff)),
                "k_max": float(np.max(k_eff)),
                "k_mean": float(np.mean(k_eff))
            }
        }
        
    except Exception as e:
        return JSONResponse(
            {
                "error": f"Error inesperado en validación EMT: {str(e)}",
                "type": type(e).__name__
            },
            status_code=500
        )


# ==========================================
# GESTIÓN DE MODELOS ÓPTICOS
# ==========================================

@app.post("/api/save-model")
async def save_model(model: Dict[str, Any]):
    """Guarda el modelo óptico en formato JSON"""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"optical_model_{timestamp}.json"
        filepath = MODELS_DIR / filename
        
        model["saved_at"] = datetime.now().isoformat()
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(model, f, indent=2, ensure_ascii=False)
        
        return {
            "success": True,
            "filename": filename,
            "filepath": str(filepath)
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/models")
async def list_models():
    """Lista todos los modelos guardados"""
    try:
        models = []
        for filepath in MODELS_DIR.glob("*.json"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    models.append({
                        "filename": filepath.name,
                        "created_at": data.get("created_at", ""),
                        "saved_at": data.get("saved_at", ""),
                        "layers_count": len(data.get("layers", []))
                    })
            except:
                pass
        
        models.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        return {"models": models}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/models/{filename}")
async def get_model(filename: str):
    """Obtiene un modelo específico"""
    try:
        filepath = MODELS_DIR / filename
        if not filepath.exists():
            return JSONResponse({"error": "Modelo no encontrado"}, status_code=404)
        
        with open(filepath, "r", encoding="utf-8") as f:
            model = json.load(f)
        
        return model
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/models/{filename}")
async def delete_model(filename: str):
    """Elimina un modelo"""
    try:
        filepath = MODELS_DIR / filename
        if not filepath.exists():
            return JSONResponse({"error": "Modelo no encontrado"}, status_code=404)
        
        filepath.unlink()
        return {"success": True, "message": f"Modelo {filename} eliminado"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ==========================================
# CÁLCULO TMM (Método de Matriz de Transferencia)
# ==========================================

@app.post("/api/tmm/calculate")
async def calculate_tmm(model: Dict[str, Any]):
    """
    Ejecuta el cálculo TMM para un modelo óptico
    Calcula Psi y Delta teóricos
    """
    try:
        result = run_tmm_calculation(model)
        
        return {
            "success": True,
            "wavelength": result['wavelength'],
            "psi_deg": result['psi_deg'],
            "delta_deg": result['delta_deg']
        }
    except Exception as e:
        return JSONResponse(
            {"error": f"Error en cálculo TMM: {str(e)}"},
            status_code=500
        )

# ==========================================
# CÁLCULO DE PSI Y DELTA TEÓRICOS
# ==========================================

@app.post("/api/calculate-theoretical")
async def calculate_theoretical_endpoint(data: Dict[str, Any]):
    """
    Calcula Psi y Delta teóricos a partir de un modelo óptico
    y los compara con datos experimentales
    
    Request body:
    {
        "model": {
            "global": {...},
            "ambient": {...},
            "substrate": {...},
            "layers": [...]
        },
        "experimental_data": {
            "wavelengths": [...],
            "psi_exp": [...],
            "delta_exp": [...]
        }
    }
    
    Response:
    {
        "success": true,
        "calculation_time": 0.42,
        "points_calculated": 401,
        "data": {
            "wavelengths": [...],
            "psi_theoretical": [...],
            "delta_theoretical": [...]
        },
        "goodness_of_fit": {
            "chi_squared": 12.345,
            "chi_squared_reduced": 0.0308,
            ...
        }
    }
    """
    try:
        logger.info("=" * 60)
        logger.info("INICIO CÁLCULO DE PSI Y DELTA TEÓRICOS")
        logger.info("=" * 60)
        
        # 1. Validar que existan los datos requeridos
        if 'model' not in data:
            return JSONResponse(
                {"error": "No se proporcionó el modelo óptico"},
                status_code=400
            )
        
        if 'experimental_data' not in data:
            return JSONResponse(
                {"error": "No se proporcionaron datos experimentales"},
                status_code=400
            )
        
        model = data['model']
        exp_data = data['experimental_data']
        
        # 2. Validar datos experimentales
        required_exp_fields = ['wavelengths', 'psi_exp', 'delta_exp']
        for field in required_exp_fields:
            if field not in exp_data:
                return JSONResponse(
                    {"error": f"Falta el campo '{field}' en datos experimentales"},
                    status_code=400
                )
        
        # Verificar que tienen la misma longitud
        wl_len = len(exp_data['wavelengths'])
        psi_len = len(exp_data['psi_exp'])
        delta_len = len(exp_data['delta_exp'])
        
        if not (wl_len == psi_len == delta_len):
            return JSONResponse(
                {
                    "error": f"Los datos experimentales tienen longitudes diferentes: "
                            f"wavelengths={wl_len}, psi={psi_len}, delta={delta_len}"
                },
                status_code=400
            )
        
        logger.info(f"Datos experimentales: {wl_len} puntos")
        logger.info(f"Ángulo de incidencia: {model['global'].get('angle')}°")
        logger.info(f"Capas en el modelo: {len(model.get('layers', []))}")
        
        # 3. Importar el calculador (lazy import para no afectar startup)
        try:
            from backend.optical.theoretical_calculator import calculate_theoretical_psi_delta
        except ImportError as e:
            logger.error(f"Error importando theoretical_calculator: {str(e)}")
            return JSONResponse(
                {"error": "Error interno: módulo de cálculo no disponible"},
                status_code=500
            )
        
        # 4. Ejecutar el cálculo
        logger.info("Iniciando cálculo teórico...")
        result = calculate_theoretical_psi_delta(model, exp_data)
        
        # 5. Verificar si hubo error
        if not result.get('success', False):
            error_msg = result.get('error', 'Error desconocido')
            error_type = result.get('error_type', 'UnknownError')
            
            logger.error(f"Error en cálculo: {error_type} - {error_msg}")
            
            return JSONResponse(
                {
                    "success": False,
                    "error": error_msg,
                    "error_type": error_type,
                    "suggestion": _get_error_suggestion(error_type, error_msg)
                },
                status_code=500
            )
        
        # 6. Log de resultados
        logger.info(f"✓ Cálculo completado exitosamente")
        logger.info(f"  Tiempo: {result['calculation_time']} s")
        logger.info(f"  Puntos: {result['points_calculated']}")
        logger.info(f"  χ²: {result['goodness_of_fit']['chi_squared']:.4f}")
        logger.info(f"  χ²ᵣ: {result['goodness_of_fit']['chi_squared_reduced']:.4f}")
        logger.info("=" * 60)
        
        # 7. Agregar interpretación del ajuste
        chi2_red = result['goodness_of_fit']['chi_squared_reduced']
        result['goodness_of_fit']['fit_quality'] = _interpret_chi_squared(chi2_red)
        
        return result
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error("ERROR CRÍTICO EN CÁLCULO TEÓRICO")
        logger.error(f"Tipo: {type(e).__name__}")
        logger.error(f"Mensaje: {str(e)}")
        import traceback
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        logger.error("=" * 60)
        
        return JSONResponse(
            {
                "success": False,
                "error": f"Error inesperado: {str(e)}",
                "error_type": type(e).__name__
            },
            status_code=500
        )

@app.post("/api/optimize")
async def optimize_model_endpoint(request: dict):
    """
    Endpoint para optimización de parámetros del modelo óptico
    
    Request body:
    {
        "psi_exp": [array de Psi experimental],
        "delta_exp": [array de Delta experimental],
        "wavelengths": [array de longitudes de onda],
        "optical_model": {modelo óptico completo},
        "params_to_optimize": [
            {
                "name": "layer_0_thickness",
                "path": ["layers", 0, "thickness"],
                "initial_value": 100.0,
                "lower_bound": 10.0,
                "upper_bound": 500.0
            },
            ...
        ]
    }
    
    Returns:
    {
        "success": true/false,
        "optimized_params": {...},
        "confidence_intervals": {...},
        "initial_metrics": {...},
        "final_metrics": {...},
        "improvement_percentage": ...,
        "psi_theoretical": [...],
        "delta_theoretical": [...],
        "optimized_model": {...}
    }
    """
    try:
        from backend.optimization import optimize_parameters
        
        # Extraer datos del request
        psi_exp = np.array(request.get('psi_exp', []), dtype=float)
        delta_exp = np.array(request.get('delta_exp', []), dtype=float)
        wavelengths = np.array(request.get('wavelengths', []), dtype=float)
        optical_model = request.get('optical_model', {})
        params_to_optimize = request.get('params_to_optimize', [])
        
        logger.info(f"📊 Solicitud de optimización recibida")
        logger.info(f"  Puntos de datos: {len(wavelengths)}")
        logger.info(f"  Parámetros a optimizar: {len(params_to_optimize)}")
        for param in params_to_optimize:
            logger.info(f"    - {param['name']}: {param['initial_value']} (bounds: [{param['lower_bound']}, {param['upper_bound']}])")
        
        # Validar datos
        if len(psi_exp) == 0 or len(delta_exp) == 0:
            return {'error': 'Datos experimentales faltantes'}
        
        if len(wavelengths) == 0:
            return {'error': 'Longitudes de onda faltantes'}
        
        if len(psi_exp) != len(wavelengths) or len(delta_exp) != len(wavelengths):
            return {'error': 'Las longitudes de los datos no coinciden'}
        
        if len(params_to_optimize) == 0:
            return {'error': 'No se especificaron parámetros para optimizar'}
        
        # Función para calcular valores teóricos
        def calculate_theoretical_func(model, wls):
            """
            Wrapper para calcular Psi y Delta teóricos
            Usa el módulo TMM existente
            """
            from backend.optical.tmm import run_tmm_calculation
            
            # Extraer configuración del modelo
            angle = model.get('angle', 70.0)
            ambient = model.get('ambient', {})
            substrate = model.get('substrate', {})
            layers = model.get('layers', [])
            
            # Calcular para todas las longitudes de onda
            psi_list = []
            delta_list = []
            
            for wl in wls:
                # ⭐⭐⭐ CORRECCIÓN: Estructura correcta para TMM ⭐⭐⭐
                config = {
                    'global': {
                        'angle': angle,
                        'wavelength': float(wl)
                    },
                    'ambient': ambient,
                    'layers': layers,
                    'substrate': substrate
                }
                
                result = run_tmm_calculation(config)
                
                if 'error' in result:
                    raise Exception(result['error'])
                
                psi_list.append(result['psi'])
                delta_list.append(result['delta'])
            
            return np.array(psi_list), np.array(delta_list)
        
        # Ejecutar optimización
        logger.info("🚀 Iniciando optimización...")
        
        result = optimize_parameters(
            psi_exp=psi_exp,
            delta_exp=delta_exp,
            wavelengths=wavelengths,
            optical_model=optical_model,
            params_to_optimize=params_to_optimize,
            calculate_theoretical_func=calculate_theoretical_func,
            max_iterations=200,
            ftol=1e-8,
            xtol=1e-8
        )
        
        if result.get('success'):
            logger.info("✅ Optimización completada exitosamente")
            logger.info(f"  χ² inicial: {result['initial_metrics']['chi_squared']:.2f}")
            logger.info(f"  χ² final: {result['final_metrics']['chi_squared']:.2f}")
            logger.info(f"  Mejora: {result['improvement_percentage']:.2f}%")
        else:
            logger.warning(f"⚠️ Optimización no convergió: {result.get('message', 'Sin mensaje')}")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Error en optimización: {str(e)}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'message': f'Error durante optimización: {str(e)}'
        }

def _interpret_chi_squared(chi2_reduced: float) -> Dict[str, str]:
    """
    Interpreta el valor de chi-cuadrado reducido
    
    Args:
        chi2_reduced: Valor de χ²ᵣ
        
    Returns:
        Dict con nivel y mensaje
    """
    if chi2_reduced < 0.1:
        return {
            "level": "excellent",
            "label": "EXCELENTE",
            "message": "El modelo describe los datos experimentales de manera excepcional",
            "color": "success"
        }
    elif chi2_reduced < 1.0:
        return {
            "level": "good",
            "label": "BUENO",
            "message": "El modelo es consistente con los datos experimentales",
            "color": "success"
        }
    elif chi2_reduced < 2.0:
        return {
            "level": "acceptable",
            "label": "ACEPTABLE",
            "message": "El modelo captura las características principales, pero hay desviaciones menores",
            "color": "warning"
        }
    elif chi2_reduced < 5.0:
        return {
            "level": "poor",
            "label": "POBRE",
            "message": "Existen desviaciones significativas. Considere ajustar los parámetros del modelo",
            "color": "warning"
        }
    else:
        return {
            "level": "bad",
            "label": "INADECUADO",
            "message": "El modelo no describe adecuadamente los datos experimentales. Revise la configuración",
            "color": "danger"
        }


def _get_error_suggestion(error_type: str, error_msg: str) -> str:
    """
    Proporciona sugerencias según el tipo de error
    
    Args:
        error_type: Tipo de excepción
        error_msg: Mensaje de error
        
    Returns:
        Sugerencia para el usuario
    """
    if 'EMT' in error_msg or 'convergió' in error_msg:
        return "Revise las fracciones volumétricas de los componentes EMT. La suma debe ser exactamente 1.0"
    
    elif 'wavelength' in error_msg.lower() or 'longitud' in error_msg.lower():
        return "Verifique que las longitudes de onda del modelo coincidan con los datos experimentales"
    
    elif 'param' in error_msg.lower():
        return "Algunos parámetros del modelo de dispersión pueden estar fuera del rango válido"
    
    elif 'NaN' in error_msg or 'inf' in error_msg.lower():
        return "Se generaron valores numéricos inválidos. Revise los parámetros de los modelos de dispersión"
    
    elif 'layer' in error_msg.lower() or 'capa' in error_msg.lower():
        return "Hay un problema con la configuración de una de las capas. Revise espesores y parámetros ópticos"
    
    else:
        return "Revise la configuración del modelo óptico y asegúrese de que todos los parámetros sean válidos"
# ==========================================
# INFORMACIÓN SOBRE MODELOS DE DISPERSIÓN
# ==========================================

@app.get("/api/dispersion-models")
async def get_dispersion_models():
    """Devuelve información sobre los modelos de dispersión disponibles"""
    models = {
        "cauchy": {
            "name": "Cauchy",
            "equation": "n(lambda) = A + B/lambda^2 + C/lambda^4",
            "equation_latex": r"n(\lambda) = A + \frac{B}{\lambda^2} + \frac{C}{\lambda^4}",
            "parameters": ["A", "B", "C"]
        },
        "sellmeier": {
            "name": "Sellmeier",
            "equation": "n^2(lambda) = 1 + sum(Bj*lambda^2 / (lambda^2 - Cj))",
            "equation_latex": r"n^2(\lambda) = 1 + \sum_j \frac{B_j \lambda^2}{\lambda^2 - C_j}",
            "parameters": ["B1", "C1", "B2", "C2"]
        }
    }
    return models

# ==========================================
# DEBUG
# ==========================================

@app.get("/debug/files")
def debug_files():
    """Endpoint de debug para ver archivos en las carpetas"""
    try:
        frontend_files = list(FRONTEND_DIR.glob("*"))
        models_files = list(MODELS_DIR.glob("*"))
        uploads_files = list(UPLOAD_DIR.glob("*"))
        return {
            "frontend_dir": str(FRONTEND_DIR),
            "frontend_files": [f.name for f in frontend_files],
            "models_dir": str(MODELS_DIR),
            "models_files": [f.name for f in models_files],
            "uploads_dir": str(UPLOAD_DIR),
            "uploads_files": [f.name for f in uploads_files]
        }
    except Exception as e:
        return {"error": str(e)}


# Agregar al final de main.py, antes de montar frontend

@app.post("/api/validate-custom-equation")
async def validate_custom_equation(request: dict):
    """
    Valida ecuación personalizada en LaTeX
    """
    try:
        from backend.optical.custom_dispersion import CustomDispersionModel
        
        equation_n = request.get('equation_n', '')
        equation_k = request.get('equation_k', '0')
        variable = request.get('variable', 'auto')
        wavelength_min = request.get('wavelength_min', 300.0)
        wavelength_max = request.get('wavelength_max', 800.0)
        
        # Crear modelo
        model = CustomDispersionModel(
            equation_n=equation_n,
            equation_k=equation_k,
            variable=variable
        )
        
        # Validar
        validation = model.validate((wavelength_min, wavelength_max))
        
        # Generar preview de valores
        test_wavelengths = np.linspace(wavelength_min, wavelength_max, 50)
        n_preview, k_preview = model.get_nk(test_wavelengths)
        
        return {
            'success': True,
            'validation': validation,
            'preview': {
                'wavelengths': test_wavelengths.tolist(),
                'n_values': n_preview.tolist(),
                'k_values': k_preview.tolist()
            },
            'detected_variable': model.variable_type
        }
        
    except Exception as e:
        logger.error(f"Error validando ecuación: {str(e)}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }

# ==========================================
# EJECUTAR SERVIDOR
# ==========================================
# Obtener ruta del frontend
frontend_path = Path(__file__).parent.parent / "frontend"

# Verificar que exista el directorio
if frontend_path.exists():
    # Montar archivos estáticos del frontend
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
    logger.info(f"✅ Frontend montado desde: {frontend_path}")
else:
    logger.warning(f"⚠️ No se encontró el directorio frontend en: {frontend_path}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)


# Mount static files at the end so API routes are resolved first
try:
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
except Exception:
    pass