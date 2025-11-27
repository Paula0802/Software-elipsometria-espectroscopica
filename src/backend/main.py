from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from pathlib import Path, PurePath
from datetime import datetime
import pandas as pd
import shutil
import struct
import numpy as np
import json
import uuid
import re
app = FastAPI(title="Elipsometria Espectroscopica API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BACKEND_DIR / "uploads"
MODELS_DIR = BACKEND_DIR / "models"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
def sanitize_filename(filename: str) -> str:
    basename = PurePath(filename).name
    basename = re.sub(r'[^\w\.\-]', '_', basename)
    if not basename or basename.startswith('.'):
        basename = f"file_{uuid.uuid4().hex[:8]}"
    return basename
def validate_save_path(base_dir: Path, save_path: Path) -> bool:
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
    safe_name = sanitize_filename(original_filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = base_dir / unique_name
    if not validate_save_path(base_dir, save_path):
        unique_name = f"{uuid.uuid4().hex}.dat"
        save_path = base_dir / unique_name
    return save_path
@app.get("/")
def root():
    html_path = FRONTEND_DIR / "upload.html"
    if not html_path.exists():
        return JSONResponse(
            {"error": f"No se encuentra upload.html en {FRONTEND_DIR}"},
            status_code=404
        )
    return FileResponse(html_path, headers={"Cache-Control": "no-cache"})
@app.get("/upload.html")
def upload_page():
    return FileResponse(FRONTEND_DIR / "upload.html", headers={"Cache-Control": "no-cache"})
def read_spe_file(filepath):
    try:
        for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
            try:
                with open(filepath, 'r', encoding=encoding) as f:
                    lines = f.readlines()
                
                data_start = -1
                for i, line in enumerate(lines):
                    if '# DATA:' in line:
                        data_start = i + 2
                        break
                
                if data_start < 0:
                    raise Exception("No se encontro la seccion # DATA: en el archivo")
                
                df = pd.read_csv(
                    filepath, 
                    sep=r'\s+',
                    skiprows=data_start,
                    header=None,
                    encoding=encoding,
                    on_bad_lines='skip'
                )
                
                if len(df.columns) >= 3:
                    column_names = ['wavelength', 'psi', 'delta']
                    for i in range(3, len(df.columns)):
                        column_names.append(f'col_{i}')
                    df.columns = column_names
                elif len(df.columns) == 2:
                    df.columns = ['psi', 'delta']
                    df.insert(0, 'wavelength', list(range(len(df))))
                else:
                    raise Exception("El archivo debe tener al menos 3 columnas")
                
                return df
                
            except UnicodeDecodeError:
                continue
        
        raise Exception("No se pudo decodificar el archivo con ningun encoding")
        
    except Exception as e:
        raise Exception(f"Error leyendo archivo .spe de DeltaPsi2: {str(e)}")
def read_spe_manual(filepath):
    try:
        with open(filepath, 'rb') as f:
            f.seek(42)
            xdim = struct.unpack('H', f.read(2))[0]
            
            f.seek(656)
            ydim = struct.unpack('H', f.read(2))[0]
            
            f.seek(108)
            datatype = struct.unpack('h', f.read(2))[0]
            
            f.seek(4100)
            
            if datatype == 0:
                data = np.fromfile(f, dtype=np.float32)
            elif datatype == 1:
                data = np.fromfile(f, dtype=np.int32)
            elif datatype == 2:
                data = np.fromfile(f, dtype=np.int16)
            elif datatype == 3:
                data = np.fromfile(f, dtype=np.uint16)
            else:
                data = np.fromfile(f, dtype=np.uint16)
            
            total_points = len(data)
            
            if total_points % 3 == 0:
                num_rows = total_points // 3
                data_reshaped = data.reshape((num_rows, 3))
                df = pd.DataFrame({
                    'wavelength': data_reshaped[:, 0],
                    'psi': data_reshaped[:, 1],
                    'delta': data_reshaped[:, 2]
                })
            elif total_points % 2 == 0 and ydim == 2:
                num_rows = total_points // 2
                data_reshaped = data.reshape((num_rows, 2))
                df = pd.DataFrame({
                    'wavelength': np.arange(num_rows),
                    'psi': data_reshaped[:, 0],
                    'delta': data_reshaped[:, 1]
                })
            else:
                df = pd.DataFrame({
                    'wavelength': np.arange(len(data)),
                    'psi': data,
                    'delta': data
                })
            
            return df
            
    except Exception as e:
        raise Exception(f"Error en lectura manual del .spe: {str(e)}")
def convert_epsilon_to_nk(epsilon1: np.ndarray, epsilon2: np.ndarray) -> tuple:
    eps_abs = np.sqrt(epsilon1**2 + epsilon2**2)
    n = np.sqrt((eps_abs + epsilon1) / 2)
    k = np.sqrt((eps_abs - epsilon1) / 2)
    return n, k
def omega_to_wavelength(omega: np.ndarray, unit: str = "eV") -> np.ndarray:
    hc = 1239.84193
    if unit == "eV":
        wavelength = hc / omega
    elif unit == "rad/s":
        hbar = 6.582119569e-16
        energy_eV = omega * hbar
        wavelength = hc / energy_eV
    else:
        wavelength = omega
    return wavelength
def read_optical_file(filepath: Path, file_type: str = "nk") -> dict:
    ext = filepath.suffix.lower()
    
    try:
        if ext == ".csv":
            df = pd.read_csv(filepath)
        elif ext == ".txt":
            try:
                df = pd.read_csv(filepath, sep="\t")
            except:
                try:
                    df = pd.read_csv(filepath, sep=",")
                except:
                    df = pd.read_csv(filepath, delim_whitespace=True)
        elif ext == ".xlsx":
            df = pd.read_excel(filepath)
        elif ext == ".spe":
            df = read_spe_file(filepath)
        else:
            raise Exception(f"Formato no soportado: {ext}")
    except Exception as e:
        raise Exception(f"Error leyendo archivo: {str(e)}")
    
    df.columns = df.columns.str.strip().str.lower()
    
    if file_type == "epsilon":
        eps1_col = None
        eps2_col = None
        wl_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if 'epsilon1' in col_lower or 'eps1' in col_lower or 'e1' == col_lower:
                eps1_col = col
            elif 'epsilon2' in col_lower or 'eps2' in col_lower or 'e2' == col_lower:
                eps2_col = col
            elif 'omega' in col_lower or 'wavelength' in col_lower or 'lambda' in col_lower or 'nm' in col_lower:
                wl_col = col
        
        if eps1_col is None or eps2_col is None:
            if len(df.columns) >= 3:
                wl_col = df.columns[0]
                eps1_col = df.columns[1]
                eps2_col = df.columns[2]
            else:
                raise Exception("No se encontraron columnas epsilon1 y epsilon2")
        
        epsilon1 = df[eps1_col].values.astype(float)
        epsilon2 = df[eps2_col].values.astype(float)
        
        n, k = convert_epsilon_to_nk(epsilon1, epsilon2)
        
        if wl_col:
            wl_values = df[wl_col].values.astype(float)
            if 'omega' in wl_col.lower():
                wavelength = omega_to_wavelength(wl_values)
            else:
                wavelength = wl_values
        else:
            wavelength = np.arange(len(n))
        
        return {
            "wavelength": wavelength.tolist(),
            "n": n.tolist(),
            "k": k.tolist(),
            "original_epsilon1": epsilon1.tolist(),
            "original_epsilon2": epsilon2.tolist()
        }
    
    else:
        n_col = None
        k_col = None
        wl_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if col_lower == 'n' or 'refractive' in col_lower:
                n_col = col
            elif col_lower == 'k' or 'extinction' in col_lower:
                k_col = col
            elif 'wavelength' in col_lower or 'lambda' in col_lower or 'nm' in col_lower:
                wl_col = col
        
        if n_col is None:
            if len(df.columns) >= 2:
                wl_col = df.columns[0]
                n_col = df.columns[1]
                if len(df.columns) >= 3:
                    k_col = df.columns[2]
            else:
                raise Exception("No se encontro columna n")
        
        n = df[n_col].values.astype(float)
        k = df[k_col].values.astype(float) if k_col else np.zeros_like(n)
        wavelength = df[wl_col].values.astype(float) if wl_col else np.arange(len(n))
        
        return {
            "wavelength": wavelength.tolist(),
            "n": n.tolist(),
            "k": k.tolist()
        }
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
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
            {"error": "Nombre de archivo invalido"},
            status_code=400
        )
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
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
    df.columns = df.columns.str.strip()
    
    invalid_values = []
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
                {"error": f"El archivo contiene demasiados valores invalidos en las columnas: {nan_columns}"},
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
@app.post("/api/upload-optical-data")
async def upload_optical_data(
    file: UploadFile = File(...),
    file_type: str = Form("nk")
):
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
            {"error": "Nombre de archivo invalido"},
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
@app.post("/api/convert-epsilon")
async def convert_epsilon_endpoint(data: Dict[str, Any]):
    try:
        epsilon1 = np.array(data.get("epsilon1", []))
        epsilon2 = np.array(data.get("epsilon2", []))
        omega = np.array(data.get("omega", []))
        omega_unit = data.get("omega_unit", "eV")
        
        if len(epsilon1) == 0 or len(epsilon2) == 0:
            return JSONResponse({"error": "Se requieren datos de epsilon1 y epsilon2"}, status_code=400)
        
        n, k = convert_epsilon_to_nk(epsilon1, epsilon2)
        
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
@app.post("/api/save-model")
async def save_model(model: Dict[str, Any]):
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
    try:
        filepath = MODELS_DIR / filename
        if not filepath.exists():
            return JSONResponse({"error": "Modelo no encontrado"}, status_code=404)
        
        filepath.unlink()
        return {"success": True, "message": f"Modelo {filename} eliminado"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
@app.get("/api/dispersion-models")
async def get_dispersion_models():
    models = {
        "cauchy": {
            "name": "Cauchy",
            "equation": "n(lambda) = A + B/lambda^2 + C/lambda^4",
            "equation_latex": r"n(\lambda) = A + \frac{B}{\lambda^2} + \frac{C}{\lambda^4}",
            "parameters": ["A", "B", "C"],
            "defaults": {"A": 1.45, "B": 0.003, "C": 0}
        },
        "sellmeier": {
            "name": "Sellmeier",
            "equation": "n^2(lambda) = 1 + sum(Bj*lambda^2 / (lambda^2 - Cj))",
            "equation_latex": r"n^2(\lambda) = 1 + \sum_j \frac{B_j \lambda^2}{\lambda^2 - C_j}",
            "parameters": ["B1", "C1", "B2", "C2"],
            "defaults": {"B1": 1.0, "C1": 10000, "B2": 0, "C2": 0}
        },
        "drude": {
            "name": "Drude",
            "equation": "epsilon(omega) = eps_inf - omega_p^2 / (omega^2 + i*gamma*omega)",
            "equation_latex": r"\varepsilon(\omega) = \varepsilon_\infty - \frac{\omega_p^2}{\omega^2 + i\gamma\omega}",
            "parameters": ["eps_inf", "omega_p", "gamma"],
            "defaults": {"eps_inf": 1.0, "omega_p": 9.0, "gamma": 0.1}
        },
        "lorentz": {
            "name": "Lorentz",
            "equation": "epsilon(omega) = eps_inf + sum(fj*omegaj^2 / (omegaj^2 - omega^2 - i*gammaj*omega))",
            "equation_latex": r"\varepsilon(\omega) = \varepsilon_\infty + \sum_j \frac{f_j \omega_j^2}{\omega_j^2 - \omega^2 - i\gamma_j\omega}",
            "parameters": ["eps_inf", "f1", "omega_1", "gamma_1"],
            "defaults": {"eps_inf": 1.0, "f1": 1.0, "omega_1": 3.0, "gamma_1": 0.5}
        }
    }
    return models
@app.get("/debug/files")
def debug_files():
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
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)