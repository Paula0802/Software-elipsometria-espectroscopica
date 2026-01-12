"""
FastAPI Application para Elipsometría Espectroscópica
Versión modular con separación de responsabilidades
✅ INCLUYE: 
   - Validación EMT para n,k efectivos
   - process_optical_file con k OPCIONAL
   - Endpoint /api/validate-material-range
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

# Importar módulos propios
from backend.optical.tmm import run_tmm_calculation
from backend.optical.conversions import epsilon_to_nk, omega_to_wavelength, nk_to_epsilon
from backend.utils.file_readers import read_spe_file, read_optical_file
from backend.routes.theoretical_routes import router as theoretical_router
from backend.optical.theoretical_calculator import calculate_theoretical_psi_delta
# ⭐ Imports para validación EMT
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


"""
FUNCIÓN CORREGIDA: prepare_component_optical_data
Reemplaza las líneas 118-195 en backend/main.py

Mejoras:
- Soporte unificado para optical_data y file_data
- Manejo de wavelength/wavelengths (singular/plural)
- K opcional con warning
- Logging detallado para debugging
- Mensajes de error descriptivos
"""

def prepare_component_optical_data(component: Dict[str, Any], wavelengths: np.ndarray) -> Dict[str, Any]:
    """
    Prepara los datos ópticos (n, k) de un componente individual para EMT
    
    Args:
        component: Diccionario con la configuración del componente
        wavelengths: Array de longitudes de onda
    
    Returns:
        Dict con 'n' y 'k' como arrays
    """
    comp_name = component.get('name', 'Unknown')
    comp_type = component.get('type', component.get('model', 'unknown'))
    
    logger.info(f"🔧 Procesando componente: {comp_name} (tipo: {comp_type})")
    
    # ========================================
    # Caso 1: Modelo constante
    # ========================================
    if component.get('model') == 'constant' or (comp_type == 'constant' and 'n' in component):
        n_val = float(component.get('n', 1.5))
        k_val = float(component.get('k', 0.0))
        logger.info(f"   ✓ Constante: n={n_val}, k={k_val}")
        return {
            'n': np.full_like(wavelengths, n_val, dtype=float),
            'k': np.full_like(wavelengths, k_val, dtype=float)
        }
    
    # ========================================
    # Caso 2: Datos de archivo
    # ========================================
    # Buscar datos en CUALQUIERA de estos formatos:
    file_source = None
    source_name = None
    
    if 'optical_data' in component:
        file_source = component['optical_data']
        source_name = 'optical_data'
    elif 'file_data' in component:
        file_source = component['file_data']
        source_name = 'file_data'
    elif comp_type == 'file' and 'data' in component:
        file_source = component['data']
        source_name = 'data'
    
    if file_source is not None:
        logger.info(f"   📁 Encontrado source: {source_name}")
        
        if not isinstance(file_source, dict):
            raise ValueError(
                f"Componente '{comp_name}': {source_name} debe ser un diccionario, "
                f"recibido: {type(file_source)}"
            )
        
        # Buscar wavelengths en formato singular o plural
        file_wavelengths = file_source.get('wavelength') or file_source.get('wavelengths')
        
        if file_wavelengths is None:
            raise ValueError(
                f"Componente '{comp_name}': {source_name} no contiene 'wavelength' ni 'wavelengths'. "
                f"Keys disponibles: {list(file_source.keys())}"
            )
        
        # Buscar n y k
        file_n = file_source.get('n', [])
        file_k = file_source.get('k', [])
        
        # Convertir a numpy arrays
        try:
            file_wavelengths = np.asarray(file_wavelengths, dtype=float)
            file_n = np.asarray(file_n, dtype=float)
            
            # K es OPCIONAL
            if len(file_k) == 0:
                logger.warning(f"   ⚠️ k ausente en '{comp_name}', asumiendo k=0")
                file_k = np.zeros_like(file_n)
            else:
                file_k = np.asarray(file_k, dtype=float)
        except (ValueError, TypeError) as e:
            raise ValueError(
                f"Componente '{comp_name}': Error convirtiendo datos a numéricos: {str(e)}"
            )
        
        # Validaciones de longitud
        if len(file_wavelengths) == 0 or len(file_n) == 0:
            raise ValueError(
                f"Componente '{comp_name}': Datos vacíos - "
                f"wavelengths={len(file_wavelengths)}, n={len(file_n)}"
            )
        
        if len(file_wavelengths) != len(file_n) or len(file_wavelengths) != len(file_k):
            raise ValueError(
                f"Componente '{comp_name}': Longitudes inconsistentes - "
                f"wavelengths={len(file_wavelengths)}, n={len(file_n)}, k={len(file_k)}"
            )
        
        # Verificar NaN
        if np.any(np.isnan(file_wavelengths)) or np.any(np.isnan(file_n)) or np.any(np.isnan(file_k)):
            raise ValueError(
                f"Componente '{comp_name}': Los datos contienen valores NaN"
            )
        
        # Interpolar a las longitudes de onda objetivo
        n_interp = np.interp(wavelengths, file_wavelengths, file_n)
        k_interp = np.interp(wavelengths, file_wavelengths, file_k)
        
        logger.info(f"   ✓ Interpolado: {len(file_wavelengths)} → {len(wavelengths)} puntos")
        logger.info(f"   ✓ n: [{file_n.min():.4f}, {file_n.max():.4f}]")
        logger.info(f"   ✓ k: [{file_k.min():.6f}, {file_k.max():.6f}]")
        
        return {'n': n_interp, 'k': k_interp}
    
    # ========================================
    # Caso 3: Modelo de dispersión
    # ========================================
    model_name = component.get('model')
    
    if model_name and model_name not in ['constant', 'file']:
        logger.info(f"   🔬 Modelo de dispersión: {model_name}")
        
        # Caso 3a: Ecuación personalizada
        if model_name == 'custom':
            equation = component.get('equation')
            if not equation:
                raise ValueError(
                    f"Componente '{comp_name}': modelo 'custom' requiere campo 'equation'"
                )
            
            try:
                n, k = get_nk_from_model('custom', wavelengths, {'equation': equation})
                logger.info(f"   ✓ Ecuación evaluada correctamente")
                return {'n': n, 'k': k}
            except Exception as e:
                raise ValueError(
                    f"Error evaluando ecuación para '{comp_name}': {str(e)}"
                )
        
        # Caso 3b: Modelos estándar (Cauchy, Sellmeier, etc.)
        params = component.get('params')
        if not params:
            raise ValueError(
                f"Componente '{comp_name}' con modelo '{model_name}' no tiene parámetros"
            )
        
        try:
            n, k = get_nk_from_model(model_name, wavelengths, params)
            logger.info(f"   ✓ Modelo calculado: n ∈ [{n.min():.4f}, {n.max():.4f}]")
            return {'n': n, 'k': k}
        except Exception as e:
            raise ValueError(
                f"Error calculando modelo '{model_name}' para '{comp_name}': {str(e)}"
            )
    
    # ========================================
    # Si llegamos aquí, no hay datos válidos
    # ========================================
    available_keys = list(component.keys())
    raise ValueError(
        f"Componente '{comp_name}' no tiene datos ópticos válidos.\n"
        f"Tipo detectado: {comp_type}\n"
        f"Keys disponibles: {available_keys}\n"
        f"Formatos soportados:\n"
        f"  1. model='constant' con n, k\n"
        f"  2. optical_data o file_data con wavelength/wavelengths, n, k\n"
        f"  3. model con params (cauchy, sellmeier, etc.)\n"
        f"  4. model='custom' con equation"
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
# UPLOAD DE ARCHIVOS ÓPTICOS (n, k, λ)
# ==========================================

@app.post("/api/upload-optical-data")
async def upload_optical_data(file: UploadFile = File(...), file_type: str = Form('nk')):
    """
    Procesa archivos de datos ópticos (n,k,λ) con detección automática de formato
    ✅ K ES OPCIONAL - Se asume 0 si no está presente
    """
    try:
        # Validar extensión
        allowed = [".csv", ".txt", ".dat", ".xlsx", ".spe"] 
        original_filename = file.filename or "unknown"
        ext = Path(original_filename).suffix.lower()
        
        if ext not in allowed:
            logger.error(f"Extensión no permitida: {ext}")
            return {
                "success": False,
                "error": f"Archivo no soportado ({ext}). Use: {', '.join(allowed)}"
            }
        
        # Guardar archivo temporalmente
        save_path = generate_safe_upload_path(UPLOAD_DIR, original_filename)
        
        if not validate_save_path(UPLOAD_DIR, save_path):
            logger.error("Ruta de archivo inválida")
            return {
                "success": False,
                "error": "Nombre de archivo inválido"
            }
        
        # Guardar contenido
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"✅ Procesando archivo óptico: {original_filename}")
        logger.info(f"   Tipo solicitado: {file_type}")
        
        # Procesar archivo
        result = process_optical_file(str(save_path), file_type)
        
        # Verificar si hubo error en el procesamiento
        if not result.get('success', False):
            error_msg = result.get('error', 'Error desconocido al procesar archivo')
            logger.error(f"❌ Error procesando archivo: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }
        
        # Archivo procesado exitosamente
        info = result['info']
        logger.info(f"✅ Archivo procesado exitosamente:")
        logger.info(f"   Formato: {info.get('format', 'N/A')}")
        logger.info(f"   Puntos: {info.get('points', 0)}")
        logger.info(f"   Rango λ: {info.get('wavelength_range', [0, 0])}")
        
        if info.get('units_converted'):
            logger.info(f"   Conversión: {info['units_converted']}")
        
        # Retornar resultado completo
        return result
        
    except Exception as e:
        logger.error(f"❌ Error crítico procesando archivo óptico: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": f"Error procesando archivo: {str(e)}"
        }


# ==========================================
# ⭐⭐⭐ NUEVO ENDPOINT: /api/validate-material-range
# ==========================================

@app.post("/api/validate-material-range")
async def validate_material_range(request: dict):
    """
    Valida que un archivo de material cubra el rango requerido según
    el modo de longitud de onda seleccionado en el wizard
    
    Request:
    {
        "material_wavelengths": [400, 401, ..., 800],
        "wavelength_mode": "file" | "range" | "single",
        "experimental_wavelengths": [450, 451, ..., 750],  # Si mode=file
        "wl_from": 400,  # Si mode=range
        "wl_to": 800,    # Si mode=range
        "wl_steps": 401, # Si mode=range
        "wl_single": 550 # Si mode=single
    }
    
    Response:
    {
        "valid": true/false,
        "status": "perfect" | "needs_interpolation" | "partial_coverage" | "insufficient",
        "message": "...",
        "coverage_percentage": 95.5,
        "material_range": [400, 800],
        "required_range": [450, 750],
        "interpolation_needed": true/false,
        "extrapolation_needed": true/false,
        "points_requiring_extrapolation": 10
    }
    """
    try:
        material_wl = np.array(request.get('material_wavelengths', []), dtype=float)
        mode = request.get('wavelength_mode')
        
        if len(material_wl) == 0:
            return {
                'valid': False,
                'status': 'error',
                'message': 'No se proporcionaron wavelengths del material'
            }
        
        mat_min = float(np.min(material_wl))
        mat_max = float(np.max(material_wl))
        
        # ============================================
        # MODO 1: Usar wavelengths del archivo experimental
        # ============================================
        if mode == 'file':
            exp_wl = np.array(request.get('experimental_wavelengths', []), dtype=float)
            
            if len(exp_wl) == 0:
                return {
                    'valid': False,
                    'status': 'error',
                    'message': 'No hay datos experimentales disponibles'
                }
            
            exp_min = float(np.min(exp_wl))
            exp_max = float(np.max(exp_wl))
            
            # Verificar cobertura
            covers_min = mat_min <= exp_min
            covers_max = mat_max >= exp_max
            full_coverage = covers_min and covers_max
            
            # Contar puntos que requieren extrapolación
            points_below = np.sum(exp_wl < mat_min)
            points_above = np.sum(exp_wl > mat_max)
            points_covered = len(exp_wl) - points_below - points_above
            coverage_pct = (points_covered / len(exp_wl)) * 100
            
            # Determinar si se necesita interpolación
            exact_matches = np.sum(np.isin(exp_wl, material_wl))
            interpolation_needed = exact_matches < len(exp_wl)
            
            if full_coverage:
                if interpolation_needed:
                    return {
                        'valid': True,
                        'status': 'needs_interpolation',
                        'message': f'✅ Archivo válido. Cubre el rango experimental [{exp_min:.1f}, {exp_max:.1f}] nm. '
                                   f'Se aplicará interpolación para los puntos intermedios.',
                        'coverage_percentage': 100.0,
                        'material_range': [mat_min, mat_max],
                        'required_range': [exp_min, exp_max],
                        'interpolation_needed': True,
                        'extrapolation_needed': False,
                        'points_requiring_extrapolation': 0
                    }
                else:
                    return {
                        'valid': True,
                        'status': 'perfect',
                        'message': f'✅ Archivo perfecto. Coincide exactamente con el rango experimental.',
                        'coverage_percentage': 100.0,
                        'material_range': [mat_min, mat_max],
                        'required_range': [exp_min, exp_max],
                        'interpolation_needed': False,
                        'extrapolation_needed': False,
                        'points_requiring_extrapolation': 0
                    }
            
            elif coverage_pct >= 80:  # Cobertura aceptable pero no completa
                return {
                    'valid': True,
                    'status': 'partial_coverage',
                    'message': f'⚠️ Archivo válido pero con cobertura parcial ({coverage_pct:.1f}%). '
                               f'Material: [{mat_min:.1f}, {mat_max:.1f}] nm. '
                               f'Experimental: [{exp_min:.1f}, {exp_max:.1f}] nm. '
                               f'{points_below + points_above} puntos requerirán EXTRAPOLACIÓN.',
                    'coverage_percentage': coverage_pct,
                    'material_range': [mat_min, mat_max],
                    'required_range': [exp_min, exp_max],
                    'interpolation_needed': True,
                    'extrapolation_needed': True,
                    'points_requiring_extrapolation': int(points_below + points_above)
                }
            
            else:  # Cobertura insuficiente
                return {
                    'valid': False,
                    'status': 'insufficient',
                    'message': f'❌ Archivo NO válido. Cobertura insuficiente ({coverage_pct:.1f}%). '
                               f'Material: [{mat_min:.1f}, {mat_max:.1f}] nm. '
                               f'Experimental: [{exp_min:.1f}, {exp_max:.1f}] nm. '
                               f'El archivo no cubre el rango experimental mínimo requerido.',
                    'coverage_percentage': coverage_pct,
                    'material_range': [mat_min, mat_max],
                    'required_range': [exp_min, exp_max],
                    'interpolation_needed': False,
                    'extrapolation_needed': True,
                    'points_requiring_extrapolation': int(points_below + points_above)
                }
        
        # ============================================
        # MODO 2: Rango personalizado
        # ============================================
        elif mode == 'range':
            wl_from = float(request.get('wl_from', 0))
            wl_to = float(request.get('wl_to', 0))
            wl_steps = int(request.get('wl_steps', 0))
            
            if wl_from <= 0 or wl_to <= 0 or wl_steps < 2:
                return {
                    'valid': False,
                    'status': 'error',
                    'message': 'Parámetros de rango inválidos'
                }
            
            # Verificar cobertura
            covers_min = mat_min <= wl_from
            covers_max = mat_max >= wl_to
            full_coverage = covers_min and covers_max
            
            # Calcular cobertura porcentual
            overlap_min = max(mat_min, wl_from)
            overlap_max = min(mat_max, wl_to)
            
            if overlap_max >= overlap_min:
                coverage_pct = ((overlap_max - overlap_min) / (wl_to - wl_from)) * 100
            else:
                coverage_pct = 0.0
            
            if full_coverage:
                return {
                    'valid': True,
                    'status': 'needs_interpolation',
                    'message': f'✅ Archivo válido. Cubre el rango solicitado [{wl_from:.1f}, {wl_to:.1f}] nm. '
                               f'Se aplicará interpolación para los {wl_steps} puntos.',
                    'coverage_percentage': 100.0,
                    'material_range': [mat_min, mat_max],
                    'required_range': [wl_from, wl_to],
                    'interpolation_needed': True,
                    'extrapolation_needed': False,
                    'points_requiring_extrapolation': 0
                }
            
            elif coverage_pct >= 80:
                return {
                    'valid': True,
                    'status': 'partial_coverage',
                    'message': f'⚠️ Archivo válido pero con cobertura parcial ({coverage_pct:.1f}%). '
                               f'Material: [{mat_min:.1f}, {mat_max:.1f}] nm. '
                               f'Rango solicitado: [{wl_from:.1f}, {wl_to:.1f}] nm. '
                               f'Se aplicará extrapolación fuera del rango del material.',
                    'coverage_percentage': coverage_pct,
                    'material_range': [mat_min, mat_max],
                    'required_range': [wl_from, wl_to],
                    'interpolation_needed': True,
                    'extrapolation_needed': True,
                    'points_requiring_extrapolation': 0
                }
            
            else:
                return {
                    'valid': False,
                    'status': 'insufficient',
                    'message': f'❌ Archivo NO válido. Cobertura insuficiente ({coverage_pct:.1f}%). '
                               f'Material: [{mat_min:.1f}, {mat_max:.1f}] nm. '
                               f'Rango solicitado: [{wl_from:.1f}, {wl_to:.1f}] nm.',
                    'coverage_percentage': coverage_pct,
                    'material_range': [mat_min, mat_max],
                    'required_range': [wl_from, wl_to],
                    'interpolation_needed': False,
                    'extrapolation_needed': True,
                    'points_requiring_extrapolation': 0
                }
        
        # ============================================
        # MODO 3: Longitud única
        # ============================================
        elif mode == 'single':
            wl_single = float(request.get('wl_single', 0))
            
            if wl_single <= 0:
                return {
                    'valid': False,
                    'status': 'error',
                    'message': 'Longitud de onda inválida'
                }
            
            # Verificar si está en rango
            in_range = (mat_min <= wl_single <= mat_max)
            
            if not in_range:
                return {
                    'valid': False,
                    'status': 'out_of_range',
                    'message': f'❌ Longitud de onda {wl_single:.1f} nm fuera del rango del archivo '
                               f'[{mat_min:.1f}, {mat_max:.1f}] nm. No se puede usar este archivo.',
                    'material_range': [mat_min, mat_max],
                    'required_wavelength': wl_single,
                    'interpolation_needed': False
                }
            
            # Verificar si existe exactamente
            exact_match = wl_single in material_wl
            
            if exact_match:
                return {
                    'valid': True,
                    'status': 'perfect',
                    'message': f'✅ Archivo válido. Contiene la longitud de onda {wl_single:.1f} nm exactamente.',
                    'material_range': [mat_min, mat_max],
                    'required_wavelength': wl_single,
                    'interpolation_needed': False,
                    'exact_match': True
                }
            else:
                # Encontrar el punto más cercano
                closest_idx = np.argmin(np.abs(material_wl - wl_single))
                closest_wl = float(material_wl[closest_idx])
                distance = abs(closest_wl - wl_single)
                
                return {
                    'valid': True,
                    'status': 'needs_interpolation',
                    'message': f'✅ Archivo válido. La longitud {wl_single:.1f} nm está dentro del rango. '
                               f'Se aplicará interpolación (punto más cercano: {closest_wl:.1f} nm, distancia: {distance:.2f} nm).',
                    'material_range': [mat_min, mat_max],
                    'required_wavelength': wl_single,
                    'interpolation_needed': True,
                    'exact_match': False,
                    'closest_wavelength': closest_wl,
                    'distance': distance
                }
        
        else:
            return {
                'valid': False,
                'status': 'error',
                'message': f'Modo de longitud de onda no reconocido: {mode}'
            }
    
    except Exception as e:
        logger.error(f"Error en validate_material_range: {str(e)}", exc_info=True)
        return {
            'valid': False,
            'status': 'error',
            'message': f'Error interno: {str(e)}'
        }


# ==========================================
# VALIDACIÓN DE RANGO (ENDPOINT EXISTENTE)
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
        file_type = request.get('file_type', 'nk')
        
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
# RESTO DE ENDPOINTS (SIN CAMBIOS)
# ==========================================

# ... (el resto de tu código se mantiene exactamente igual)
# Copio el resto sin cambios a continuación:

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


@app.post("/api/validate-wavelength-range")
async def validate_wavelength_range(data: Dict[str, Any]):
    """Valida si el rango de longitudes de onda del modelo es compatible con los datos experimentales"""
    try:
        logger.info("=" * 60)
        logger.info("INICIO VALIDACIÓN DE RANGO")
        logger.info(f"Modo: {data.get('wavelength_mode')}")
        
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
        
        wavelengths_exp = data.get('wavelengths_exp', [])
        psi_exp = data.get('psi_exp', [])
        delta_exp = data.get('delta_exp', [])
        mode = data.get('wavelength_mode')
        
        logger.info(f"Datos recibidos: {len(wavelengths_exp)} puntos experimentales")
        
        if len(wavelengths_exp) == 0:
            logger.warning("No hay datos experimentales")
            return {
                "valid": False,
                "message": "❌ No hay datos experimentales cargados"
            }
        
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
        
        if np.any(np.isnan(wavelengths_exp)) or np.any(np.isnan(psi_exp)) or np.any(np.isnan(delta_exp)):
            logger.error("Datos experimentales contienen NaN")
            return {
                "valid": False,
                "message": "Los datos experimentales contienen valores inválidos (NaN)"
            }
        
        wl_min_exp = float(np.min(wavelengths_exp))
        wl_max_exp = float(np.max(wavelengths_exp))
        
        logger.info(f"Rango experimental: [{wl_min_exp:.2f}, {wl_max_exp:.2f}] nm")
        
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
        
        elif mode == 'range':
            try:
                wl_from = float(data.get('wl_from', 0))
                wl_to = float(data.get('wl_to', 0))
                wl_steps = int(data.get('wl_steps', 0))
                
                logger.info(f"Rango solicitado: [{wl_from:.2f}, {wl_to:.2f}] nm, {wl_steps} pasos")
                
                if wl_from <= 0 or wl_to <= 0 or wl_steps < 2:
                    logger.warning(f"⚠️ Parámetros inválidos")
                    return {
                        "valid": False,
                        "message": "Parámetros de rango inválidos"
                    }
                
                if wl_from >= wl_to:
                    logger.warning(f"⚠️ Rango inválido")
                    return {
                        "valid": False,
                        "message": "La longitud de onda inicial debe ser menor que la final"
                    }
                
                wavelengths_target = np.linspace(wl_from, wl_to, wl_steps)
                logger.info(f"✓ Generadas {len(wavelengths_target)} longitudes objetivo")
                
                try:
                    validation = validate_wavelength_compatibility(
                        wavelengths_exp,
                        wavelengths_target
                    )
                    logger.info(f"✓ Validación completada")
                except Exception as e:
                    logger.error(f"❌ Error en validate_wavelength_compatibility: {str(e)}")
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
                
                logger.info("✓ Rango válido")
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
                
            except Exception as e:
                logger.error(f"Error en modo range: {str(e)}")
                return JSONResponse({
                    "valid": False,
                    "message": f"Error interno: {str(e)}"
                }, status_code=500)
        
        elif mode == 'single':
            try:
                wl_single = float(data.get('wl_single', 0))
                
                logger.info(f"Longitud única: {wl_single:.2f} nm")
                
                if wl_single <= 0:
                    return {
                        "valid": False,
                        "message": "Longitud de onda inválida"
                    }
                
                try:
                    check = check_single_wavelength(wavelengths_exp, wl_single)
                    logger.info(f"✓ Verificación completada")
                except Exception as e:
                    logger.error(f"Error en check_single_wavelength: {str(e)}")
                    return JSONResponse({
                        "valid": False,
                        "message": f"Error al verificar: {str(e)}"
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
                
            except Exception as e:
                logger.error(f"Error en modo single: {str(e)}")
                return JSONResponse({
                    "valid": False,
                    "message": f"Error interno: {str(e)}"
                }, status_code=500)
        
        else:
            logger.error(f"Modo desconocido: {mode}")
            return {
                "valid": False,
                "message": f"Modo no reconocido: {mode}"
            }
    
    except Exception as e:
        logger.error(f"❌ ERROR CRÍTICO: {str(e)}", exc_info=True)
        return JSONResponse({
            "valid": False,
            "message": "Error interno del servidor"
        }, status_code=500)
@app.post("/api/validate-emt")
async def validate_emt_configuration(data: Dict[str, Any]):
    """Valida y calcula n,k efectivos para una configuración EMT"""
    try:
        medium_name = data.get('medium_name', 'Medio sin nombre')
        emt_model = data.get('emt_model', 'bruggeman')
        wavelengths = np.array(data.get('wavelengths', []))
        components = data.get('components', [])
        
        # ⭐⭐⭐ LOGGING ULTRA-DETALLADO ⭐⭐⭐
        logger.info("=" * 80)
        logger.info("🔍 VALIDACIÓN EMT - REQUEST COMPLETO")
        logger.info("=" * 80)
        logger.info(f"Medium name: {medium_name}")
        logger.info(f"Medium type: {data.get('medium_type', 'unknown')}")
        logger.info(f"EMT model: {emt_model}")
        logger.info(f"Wavelengths: {len(wavelengths)} puntos")
        logger.info(f"Components count: {len(components)}")
        logger.info("")
        logger.info("📦 ESTRUCTURA COMPLETA DE CADA COMPONENTE:")
        logger.info("-" * 80)
        
        for idx, comp in enumerate(components):
            logger.info(f"\n🔹 COMPONENTE {idx}: {comp.get('name', 'Sin nombre')}")
            logger.info(f"   Type of object: {type(comp)}")
            logger.info(f"   Keys disponibles: {list(comp.keys()) if isinstance(comp, dict) else 'NO ES DICT'}")
            
            if isinstance(comp, dict):
                # Mostrar TODA la estructura de manera organizada
                for key, value in comp.items():
                    if key in ['optical_data', 'file_data', 'data']:
                        # Caso especial: datos de archivo
                        logger.info(f"\n   📁 '{key}':")
                        if isinstance(value, dict):
                            logger.info(f"      Type: dict")
                            logger.info(f"      Keys: {list(value.keys())}")
                            
                            # Mostrar detalles de cada sub-key
                            for sub_key, sub_value in value.items():
                                if isinstance(sub_value, (list, np.ndarray)):
                                    arr = np.asarray(sub_value)
                                    logger.info(f"      '{sub_key}':")
                                    logger.info(f"         Type: {type(sub_value).__name__}")
                                    logger.info(f"         Length: {len(sub_value)}")
                                    if len(arr) > 0:
                                        logger.info(f"         Range: [{arr.min():.4f}, {arr.max():.4f}]")
                                        logger.info(f"         First: {arr[0]:.4f}, Last: {arr[-1]:.4f}")
                                else:
                                    logger.info(f"      '{sub_key}': {type(sub_value).__name__} = {sub_value}")
                        
                        elif isinstance(value, (list, np.ndarray)):
                            logger.info(f"      Type: {type(value).__name__}")
                            logger.info(f"      Length: {len(value)}")
                        else:
                            logger.info(f"      Type: {type(value).__name__}")
                            logger.info(f"      Value: {value}")
                    
                    elif key == 'params':
                        # Parámetros de modelos
                        logger.info(f"   🔧 '{key}': {value}")
                    
                    elif key in ['fraction', 'n', 'k', 'thickness']:
                        # Valores numéricos importantes
                        logger.info(f"   📊 '{key}': {value}")
                    
                    elif key in ['model', 'type', 'name']:
                        # Identificadores
                        logger.info(f"   🏷️ '{key}': {value}")
                    
                    elif isinstance(value, str):
                        # Texto corto
                        logger.info(f"   '{key}': {value}")
                    
                    else:
                        # Otros (mostrar solo tipo)
                        logger.info(f"   '{key}': {type(value).__name__}")
        
        logger.info("")
        logger.info("=" * 80)
        # ⭐⭐⭐ FIN LOGGING ULTRA-DETALLADO ⭐⭐⭐
        
        # Validaciones básicas
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
        
        total_fraction = sum(comp.get('fraction', 0) for comp in components)
        fraction_valid = abs(total_fraction - 1.0) < 0.01
        
        logger.info(f"✓ Suma de fracciones: {total_fraction:.3f}")
        logger.info(f"✓ Rango wavelength: [{wavelengths.min():.1f}, {wavelengths.max():.1f}] nm")
        
        if not fraction_valid:
            return JSONResponse(
                {
                    "error": f"La suma de fracciones debe ser 1.0 (actual: {total_fraction:.3f})",
                    "fraction_sum": total_fraction,
                    "fraction_valid": False
                },
                status_code=400
            )
        
        # Procesar componentes
        prepared_components = []
        
        logger.info("=" * 80)
        logger.info("🔧 INICIANDO PROCESAMIENTO DE COMPONENTES")
        logger.info("=" * 80)
        
        for i, comp in enumerate(components):
            comp_name = comp.get('name', f'Componente {i+1}')
            fraction = comp.get('fraction', 0)
            comp_type = comp.get('type') or comp.get('model', 'unknown')
            
            logger.info(f"\n🔹 Procesando componente {i}: {comp_name}")
            logger.info(f"   Tipo: {comp_type}")
            logger.info(f"   Fracción: {fraction:.3f}")
            
            try:
                optical_data = prepare_component_optical_data(comp, wavelengths)
                
                # Verificar que los datos sean válidos
                if 'n' not in optical_data or 'k' not in optical_data:
                    raise ValueError(f"prepare_component_optical_data no devolvió n,k válidos")
                
                n_array = np.array(optical_data['n'])
                k_array = np.array(optical_data['k'])
                
                if len(n_array) != len(wavelengths) or len(k_array) != len(wavelengths):
                    raise ValueError(
                        f"Longitud incorrecta: n={len(n_array)}, k={len(k_array)}, "
                        f"esperado={len(wavelengths)}"
                    )
                
                if np.any(np.isnan(n_array)) or np.any(np.isnan(k_array)):
                    raise ValueError("Los valores calculados contienen NaN")
                
                logger.info(f"   ✅ n: [{n_array.min():.4f}, {n_array.max():.4f}]")
                logger.info(f"   ✅ k: [{k_array.min():.6f}, {k_array.max():.6f}]")
                
                prepared_components.append({
                    'name': comp_name,
                    'fraction': fraction,
                    'n': n_array,
                    'k': k_array
                })
                
            except Exception as e:
                logger.error(f"❌ Error en componente '{comp_name}': {str(e)}", exc_info=True)
                return JSONResponse(
                    {
                        "error": f"Error en componente '{comp_name}': {str(e)}",
                        "component_index": i,
                        "component_type": comp_type
                    },
                    status_code=400
                )
        
        logger.info(f"\n✅ Todos los componentes procesados correctamente ({len(prepared_components)})")
        
        # Calcular medio efectivo
        emt_data = {
            'emt_model': emt_model,
            'components': prepared_components
        }
        
        try:
            logger.info("=" * 80)
            logger.info(f"🧮 Calculando medio efectivo con {emt_model}...")
            n_eff, k_eff = calculate_effective_medium(emt_data, wavelengths)
            logger.info(f"✅ Cálculo EMT exitoso")
        except Exception as e:
            logger.error(f"❌ Error en calculate_effective_medium: {str(e)}", exc_info=True)
            return JSONResponse(
                {
                    "error": f"Error calculando medio efectivo con {emt_model}: {str(e)}",
                    "emt_model": emt_model
                },
                status_code=500
            )
        
        # Validar resultado
        if np.any(np.isnan(n_eff)) or np.any(np.isnan(k_eff)):
            logger.error(f"❌ El cálculo produjo valores NaN")
            return JSONResponse(
                {
                    "error": "El cálculo produjo valores NaN",
                    "nan_count_n": int(np.sum(np.isnan(n_eff))),
                    "nan_count_k": int(np.sum(np.isnan(k_eff)))
                },
                status_code=500
            )
        
        logger.info(f"✅ n_eff: [{n_eff.min():.4f}, {n_eff.max():.4f}]")
        logger.info(f"✅ k_eff: [{k_eff.min():.6f}, {k_eff.max():.6f}]")
        logger.info("=" * 80)
        
        # Crear CSV para descarga
        df = pd.DataFrame({
            'wavelength_nm': wavelengths,
            'n_effective': n_eff,
            'k_effective': k_eff
        })
        
        csv_buffer = StringIO()
        df.to_csv(csv_buffer, index=False, float_format='%.6f')
        csv_data = csv_buffer.getvalue()
        csv_base64 = base64.b64encode(csv_data.encode()).decode()
        
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
        logger.error(f"❌ ERROR CRÍTICO en validate_emt: {str(e)}", exc_info=True)
        return JSONResponse(
            {
                "error": f"Error inesperado: {str(e)}",
                "type": type(e).__name__
            },
            status_code=500
        )


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


@app.post("/api/tmm/calculate")
async def calculate_tmm(model: Dict[str, Any]):
    """Ejecuta el cálculo TMM"""
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


@app.post("/api/calculate-theoretical")
async def calculate_theoretical_endpoint(data: Dict[str, Any]):
    """Calcula Psi y Delta teóricos CON CORRECCIÓN DE AMBIGÜEDAD"""
    try:
        # Validaciones
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
        
        # Preparar datos para corrección de Delta
        experimental_data_for_tmm = {
            'wavelength': exp_data['wavelengths'],
            'psi': exp_data['psi_exp'],
            'delta': exp_data['delta_exp']
        }
        
        # Importar y ejecutar
        from backend.optical.theoretical_calculator import calculate_theoretical_psi_delta
        
        result = calculate_theoretical_psi_delta(
            model, 
            exp_data,
            experimental_data_for_correction=experimental_data_for_tmm
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )
        
@app.post("/api/optimize")
async def optimize_model_endpoint(request: dict):
    """
    Endpoint de optimización CON CORRECCIÓN DE DELTA y soporte para fracciones EMT
    """
    try:
        from backend.optimization import optimize_parameters
        
        # ✅ CONVERSIÓN SEGURA: Validar y convertir datos experimentales
        try:
            psi_exp = np.asarray(request.get('psi_exp', []), dtype=float)
            delta_exp = np.asarray(request.get('delta_exp', []), dtype=float)
            wavelengths = np.asarray(request.get('wavelengths', []), dtype=float)
        except (ValueError, TypeError) as e:
            logger.error(f"Error convirtiendo datos experimentales: {str(e)}")
            return {
                'success': False,
                'error': f'Datos experimentales inválidos: {str(e)}'
            }
        
        optical_model = request.get('optical_model', {})
        params_to_optimize = request.get('params_to_optimize', [])
        
        # ⭐ NUEVO: Procesar y validar parámetros de fracciones volumétricas EMT
        emt_fraction_params = []
        other_params = []
        
        for param in params_to_optimize:
            param_type = param.get('type')
            
            if param_type == 'emt_fraction':
                # Validar estructura del parámetro EMT
                if 'name' not in param or 'component_index' not in param:
                    logger.warning(f"⚠️ Parámetro EMT incompleto: {param}")
                    continue
                
                # Determinar si es medio o capa
                medium = param.get('medium')  # 'ambient', 'substrate', o None
                layer_index = param.get('layer_index')  # Índice de capa (si aplica)
                
                emt_param = {
                    'name': param['name'],
                    'type': 'emt_fraction',
                    'initial_value': param.get('initial_value', 0.5),
                    'lower_bound': param.get('lower_bound', 0.0),
                    'upper_bound': param.get('upper_bound', 1.0),
                    'component_index': param['component_index']
                }
                
                if medium:
                    emt_param['medium'] = medium
                    emt_param['path'] = param.get('path', [medium, 'emt', 'components', param['component_index'], 'fraction'])
                elif layer_index is not None:
                    emt_param['layer_index'] = layer_index
                    emt_param['path'] = param.get('path', ['layers', layer_index, 'emt', 'components', param['component_index'], 'fraction'])
                else:
                    logger.warning(f"⚠️ Parámetro EMT sin medio ni capa: {param}")
                    continue
                
                emt_fraction_params.append(emt_param)
                
            else:
                # Parámetros normales (espesor, dispersión, etc.)
                other_params.append(param)
        
        # Combinar todos los parámetros
        all_params = other_params + emt_fraction_params
        
        logger.info(f"📊 Parámetros a optimizar:")
        logger.info(f"  Espesores/Dispersión: {len(other_params)}")
        logger.info(f"  Fracciones EMT: {len(emt_fraction_params)}")
        logger.info(f"  Total: {len(all_params)}")
        
        # ⭐ NUEVO: Identificar grupos de fracciones para restricción suma=1
        fraction_groups = {}
        
        for param in emt_fraction_params:
            # Crear clave de grupo
            if 'medium' in param:
                group_key = param['medium']
            elif 'layer_index' in param:
                group_key = f"layer_{param['layer_index']}"
            else:
                continue
            
            if group_key not in fraction_groups:
                fraction_groups[group_key] = []
            
            fraction_groups[group_key].append(param['name'])
        
        logger.info(f"🔗 Grupos de fracciones identificados: {len(fraction_groups)}")
        for group_key, param_names in fraction_groups.items():
            logger.info(f"  {group_key}: {param_names}")
        
        # ⭐ CAMBIO CRÍTICO: Leer algoritmo y ajustar iteraciones
        algorithm = request.get('algorithm', 'levenberg_marquardt')
        
        # ✅ ASIGNAR ITERACIONES SEGÚN ALGORITMO
        if algorithm == 'simplex':
            max_iterations = 500  # Simplex necesita MÁS iteraciones
            logger.info("🔧 Usando Simplex (Nelder-Mead) con 500 iteraciones")
        else:
            max_iterations = 200  # Levenberg-Marquardt converge rápido
            logger.info("🔧 Usando Levenberg-Marquardt con 200 iteraciones")
        
        logger.info(f"📊 Optimización solicitada:")
        logger.info(f"  Algoritmo: {algorithm}")
        logger.info(f"  Max iteraciones: {max_iterations}")
        logger.info(f"  Parámetros: {len(all_params)}")
        logger.info(f"  Longitudes de onda: {len(wavelengths)}")
        
        # ✅ VALIDACIONES
        if len(psi_exp) == 0 or len(delta_exp) == 0:
            return {'success': False, 'error': 'Datos experimentales faltantes'}
        
        if len(all_params) == 0:
            return {'success': False, 'error': 'No se especificaron parámetros para optimizar'}
        
        if len(psi_exp) != len(delta_exp) or len(psi_exp) != len(wavelengths):
            return {
                'success': False,
                'error': f'Longitudes inconsistentes: psi={len(psi_exp)}, delta={len(delta_exp)}, wl={len(wavelengths)}'
            }
        
        # ✅ VERIFICAR NaN
        if np.any(np.isnan(psi_exp)) or np.any(np.isnan(delta_exp)) or np.any(np.isnan(wavelengths)):
            return {
                'success': False,
                'error': 'Datos experimentales contienen valores NaN'
            }
        
        # ✅ PREPARAR datos experimentales para corrección
        experimental_data_for_correction = {
            'wavelength': wavelengths.tolist(),
            'psi': psi_exp.tolist(),
            'delta': delta_exp.tolist()
        }
        
        logger.info(f"✅ Datos experimentales validados: {len(wavelengths)} puntos")
        
        # ✅ FUNCIÓN CORREGIDA con soporte para Delta
        def calculate_theoretical_func(model, wls):
            from backend.optical.tmm import run_tmm_calculation
            
            if 'global' in model:
                angle = model['global'].get('angle', 70.0)
                polarization = model['global'].get('polarization', 'both')
            else:
                angle = model.get('angle', 70.0)
                polarization = model.get('polarization', 'both')
            
            ambient = model.get('ambient', {'type': 'constant', 'n': 1.0, 'k': 0.0})
            substrate = model.get('substrate', {'type': 'constant', 'n': 1.52, 'k': 0.0})
            layers = model.get('layers', [])
            
            wls_list = wls.tolist() if isinstance(wls, np.ndarray) else list(wls)
            
            config = {
                'global': {
                    'angle': angle,
                    'polarization': polarization,
                    'wavelength_mode': 'file',
                    'wavelengths': wls_list
                },
                'ambient': ambient,
                'substrate': substrate,
                'layers': layers
            }
            
            result = run_tmm_calculation(
                config,
                correct_delta_ambiguity=True,
                experimental_data=experimental_data_for_correction,
                expected_delta_range='auto'
            )
            
            if 'error' in result:
                raise Exception(result['error'])
            
            psi_theo = np.array(result['psi_deg'], dtype=float)
            delta_theo = np.array(result['delta_deg'], dtype=float)
            
            return psi_theo, delta_theo
        
        logger.info("🚀 Iniciando optimización con corrección de Delta y restricciones EMT...")
        
        # ⭐ CAMBIO CRÍTICO: Pasar parámetros procesados y grupos de fracciones
        result = optimize_parameters(
            psi_exp=psi_exp,
            delta_exp=delta_exp,
            wavelengths=wavelengths,
            optical_model=optical_model,
            params_to_optimize=all_params,  # ✅ Incluye parámetros EMT procesados
            calculate_theoretical_func=calculate_theoretical_func,
            algorithm=algorithm,
            max_iterations=max_iterations,
            fraction_groups=fraction_groups  # ⭐ NUEVO: Pasar grupos para restricciones
        )
        
        # ✅ LOGGING detallado
        if result.get('success'):
            logger.info("=" * 60)
            logger.info(f"✅ OPTIMIZACIÓN COMPLETADA - Algoritmo: {algorithm}")
            logger.info("=" * 60)
            logger.info(f"  Mejora: {result['improvement_percentage']:.2f}%")
            logger.info(f"  χ² inicial: {result['initial_metrics']['chi_squared']:.4f}")
            logger.info(f"  χ² final: {result['final_metrics']['chi_squared']:.4f}")
            logger.info(f"  Iteraciones: {result.get('iterations', 'N/A')}")
            logger.info(f"  Tiempo: {result.get('optimization_time', 'N/A')} s")
            
            # ⭐ NUEVO: Mostrar fracciones optimizadas
            if emt_fraction_params:
                logger.info("  Fracciones optimizadas:")
                for param in emt_fraction_params:
                    final_val = result.get('optimized_model', {})
                    # Navegar por el path para obtener valor final
                    val = final_val
                    for key in param['path']:
                        if isinstance(val, dict):
                            val = val.get(key, 'N/A')
                        elif isinstance(val, list) and isinstance(key, int):
                            val = val[key] if key < len(val) else 'N/A'
                        else:
                            val = 'N/A'
                            break
                    logger.info(f"    {param['name']}: {param['initial_value']:.4f} → {val if isinstance(val, (int, float)) else 'N/A'}")
            
            logger.info("=" * 60)
        
        return result
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"❌ ERROR CRÍTICO EN OPTIMIZACIÓN")
        logger.error(f"Tipo: {type(e).__name__}")
        logger.error(f"Mensaje: {str(e)}", exc_info=True)
        logger.error("=" * 60)
        
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }


def _interpret_chi_squared(chi2_reduced: float) -> Dict[str, str]:
    """Interpreta el valor de chi-cuadrado reducido"""
    if chi2_reduced < 0.1:
        return {
            "level": "excellent",
            "label": "EXCELENTE",
            "message": "El modelo describe los datos de manera excepcional",
            "color": "success"
        }
    elif chi2_reduced < 1.0:
        return {
            "level": "good",
            "label": "BUENO",
            "message": "El modelo es consistente con los datos",
            "color": "success"
        }
    elif chi2_reduced < 2.0:
        return {
            "level": "acceptable",
            "label": "ACEPTABLE",
            "message": "El modelo captura las características principales",
            "color": "warning"
        }
    elif chi2_reduced < 5.0:
        return {
            "level": "poor",
            "label": "NO ACEPTABLE",
            "message": "Existen desviaciones significativas",
            "color": "warning"
        }
    else:
        return {
            "level": "bad",
            "label": "INADECUADO",
            "message": "El modelo no describe adecuadamente los datos",
            "color": "danger"
        }

def _get_error_suggestion(error_type: str, error_msg: str) -> str:
    """Proporciona sugerencias según el tipo de error"""
    if 'EMT' in error_msg or 'convergió' in error_msg:
        return "Revise las fracciones volumétricas (deben sumar 1.0)"
    
    elif 'wavelength' in error_msg.lower():
        return "Verifique las longitudes de onda"
    
    elif 'param' in error_msg.lower():
        return "Algunos parámetros pueden estar fuera de rango"
    
    elif 'NaN' in error_msg:
        return "Valores numéricos inválidos. Revise parámetros"
    
    elif 'layer' in error_msg.lower():
        return "Problema con configuración de capas"
    
    else:
        return "Revise la configuración del modelo"


@app.get("/api/dispersion-models")
async def get_dispersion_models():
    """Devuelve información sobre modelos de dispersión"""
    models = {
        "cauchy": {
            "name": "Cauchy",
            "equation": "n(lambda) = A + B/lambda^2 + C/lambda^4",
            "parameters": ["A", "B", "C"]
        },
        "sellmeier": {
            "name": "Sellmeier",
            "equation": "n^2(lambda) = 1 + sum(Bj*lambda^2 / (lambda^2 - Cj))",
            "parameters": ["B1", "C1", "B2", "C2"]
        }
    }
    return models


@app.get("/debug/files")
def debug_files():
    """Endpoint de debug"""
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


@app.post("/api/validate-custom-equation")
async def validate_custom_equation(request: dict):
    """Valida ecuación personalizada en LaTeX"""
    try:
        from backend.optical.custom_dispersion import CustomDispersionModel
        
        equation_n = request.get('equation_n', '')
        equation_k = request.get('equation_k', '0')
        variable = request.get('variable', 'auto')
        wavelength_min = request.get('wavelength_min', 300.0)
        wavelength_max = request.get('wavelength_max', 800.0)
        
        model = CustomDispersionModel(
            equation_n=equation_n,
            equation_k=equation_k,
            variable=variable
        )
        
        validation = model.validate((wavelength_min, wavelength_max))
        
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
# MONTAR ARCHIVOS ESTÁTICOS
# ==========================================

frontend_path = Path(__file__).parent.parent / "frontend"

if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
    logger.info(f"✅ Frontend montado desde: {frontend_path}")
else:
    logger.warning(f"⚠️ No se encontró el directorio frontend en: {frontend_path}")


# ==========================================
# EJECUTAR SERVIDOR
# ==========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)


try:
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
except Exception:
    pass