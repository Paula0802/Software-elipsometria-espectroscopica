"""
FastAPI Application para Elipsometría Espectroscópica
Versión modular con separación de responsabilidades
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
from backend.optical.conversions import epsilon_to_nk, omega_to_wavelength
from backend.utils.file_readers import read_spe_file, read_optical_file
# from backend.routes.theoretical_routes import router as theoretical_router  # TODO: Fix import

# Inicializar FastAPI
app = FastAPI(title="Elipsometría Espectroscópica API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directorios
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BACKEND_DIR / "uploads"
MODELS_DIR = BACKEND_DIR / "models"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# NOTE: Static files mounting moved to the end of the file so API routes are registered first.


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
            "equation": "epsilon(omega) = eps_inf - omega_p^2 / (omega^2 + i*gamma*omega)",
            "equation_latex": r"\varepsilon(\omega) = \varepsilon_\infty - \frac{\omega_p^2}{\omega^2 + i\gamma\omega}",
            "parameters": ["eps_inf", "omega_p", "gamma"]
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


# Mount static files at the end so API routes are resolved first. This prevents StaticFiles
# from intercepting POST requests to /api/... and returning 405 Method Not Allowed.
try:
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
except Exception:
    # in some environments mounting at module import time may cause issues; ignore silently
    pass