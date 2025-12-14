"""
FastAPI Application para Elipsometría Espectroscópica
Versión modular con separación de responsabilidades
⭐ INCLUYE: Endpoint de validación EMT para n,k efectivos
"""
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
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

# Importar módulos propios (usar nombres de paquete absolutos desde src)
from backend.optical.tmm import run_tmm_calculation
from backend.optical.conversions import epsilon_to_nk, omega_to_wavelength, nk_to_epsilon
from backend.utils.file_readers import read_spe_file, read_optical_file
from backend.routes.theoretical_routes import router as theoretical_router

# ⭐ NUEVO: Imports para validación EMT
from backend.optical.emt import calculate_effective_medium
from backend.optical.dispersion_models import get_refractive_index
from io import StringIO
import base64

# Inicializar FastAPI
app = FastAPI(title="Elipsometría Espectroscópica API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    
    # Caso 3: Modelo de dispersión (cauchy, sellmeier, drude, lorentz, custom)
    if 'model' in component and 'params' in component:
        try:
            n, k = get_refractive_index(
                wavelengths,
                component['model'],
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
            n, k = get_refractive_index(
                wavelengths,
                'custom',
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

@app.post("/api/upload-optical-data")
async def upload_optical_data(
    file: UploadFile = File(...),
    file_type: str = Form("nk")
):
    """
    Sube archivos de datos ópticos
    - file_type="nk": archivos con n, k, λ
    - file_type="epsilon": archivos con ε₁, ε₂, ω (convierte a n, k, λ)
    """
    allowed = [".csv", ".txt", ".xlsx", ".spe"]
    original_filename = file.filename or "unknown"
    ext = Path(original_filename).suffix.lower()
    
    if ext not in allowed:
        return JSONResponse(
            {"error": f"Archivo no soportado ({ext}). Use: {allowed}"},
            status_code=400
        )
    
    save_path = generate_safe_upload_path(UPLOAD_DIR, f"optical_{original_filename}")
    
    if not validate_save_path(UPLOAD_DIR, save_path):
        return JSONResponse(
            {"error": "Nombre de archivo inválido"},
            status_code=400
        )
    
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        data = read_optical_file(save_path, file_type)
        return {
            "filename": original_filename,
            "file_type": file_type,
            "data": data,
            "points_count": len(data["wavelength"])
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


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
# ⭐ NUEVO: VALIDACIÓN Y CÁLCULO EMT
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
        },
        "drude": {
           "name": "Drude",
           "equation": "epsilon(E) = eps_inf - E_p^2 / (E^2 + i*Gamma_D*E)",
           "equation_latex": r"\varepsilon(E) = \varepsilon_\infty - \frac{E_p^2}{E^2 + i\Gamma_D E}",
           "parameters": ["eps_inf", "E_p", "Gamma_D"]
        },
            "lorentz": {
            "name": "Lorentz",
            "equation": "epsilon(omega) = eps_inf + sum(fj*omegaj^2 / (omegaj^2 - omega^2 - i*gammaj*omega))",
            "equation_latex": r"\varepsilon(\omega) = \varepsilon_\infty + \sum_j \frac{f_j \omega_j^2}{\omega_j^2 - \omega^2 - i\gamma_j\omega}",
            "parameters": ["eps_inf", "f1", "omega_1", "gamma_1"]
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


# ==========================================
# EJECUTAR SERVIDOR
# ==========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)


# Mount static files at the end so API routes are resolved first
try:
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
except Exception:
    pass