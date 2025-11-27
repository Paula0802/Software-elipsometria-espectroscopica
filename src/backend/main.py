from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import shutil
import struct
import numpy as np

app = FastAPI()

# CORS para desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# RUTAS IMPORTANTES
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BACKEND_DIR / "uploads"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Servir archivos estáticos del frontend
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# Ruta raíz - servir upload.html
@app.get("/")
def root():
    html_path = FRONTEND_DIR / "upload.html"
    if not html_path.exists():
        return JSONResponse(
            {"error": f"No se encuentra upload.html en {FRONTEND_DIR}"},
            status_code=404
        )
    return FileResponse(html_path)

# Ruta alternativa por si acaso
@app.get("/upload.html")
def upload_page():
    return FileResponse(FRONTEND_DIR / "upload.html")


# === FUNCIONES PARA LEER ARCHIVOS .SPE ===
def read_spe_file(filepath):
    """
    Lee archivos .spe de DeltaPsi2 (software de elipsometría)
    Formato: texto con headers y sección # DATA: con columnas nm Psi Delta Ic Is
    """
    try:
        # Leer el archivo como texto con diferentes encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
            try:
                with open(filepath, 'r', encoding=encoding) as f:
                    lines = f.readlines()
                
                # Buscar la línea que contiene "# DATA:"
                data_start = -1
                for i, line in enumerate(lines):
                    if '# DATA:' in line:
                        data_start = i + 2  # Los datos empiezan 2 líneas después (saltar header de columnas)
                        break
                
                if data_start < 0:
                    raise Exception("No se encontró la sección # DATA: en el archivo")
                
                # Leer los datos desde data_start
                df = pd.read_csv(
                    filepath, 
                    sep=r'\s+',  # Separado por espacios
                    skiprows=data_start,
                    header=None,
                    encoding=encoding,
                    on_bad_lines='skip'
                )
                
                # El formato es: nm Psi Delta Ic Is
                # Asignar nombres a las columnas
                if len(df.columns) >= 3:
                    # Renombrar las primeras 3 columnas
                    column_names = ['wavelength', 'psi', 'delta']
                    # Si hay más columnas (Ic, Is, etc), mantenerlas
                    for i in range(3, len(df.columns)):
                        column_names.append(f'col_{i}')
                    df.columns = column_names
                elif len(df.columns) == 2:
                    df.columns = ['psi', 'delta']
                    df.insert(0, 'wavelength', range(len(df)))
                else:
                    raise Exception("El archivo debe tener al menos 3 columnas")
                
                return df
                
            except UnicodeDecodeError:
                continue
        
        raise Exception("No se pudo decodificar el archivo con ningún encoding")
        
    except Exception as e:
        raise Exception(f"Error leyendo archivo .spe de DeltaPsi2: {str(e)}")


def read_spe_manual(filepath):
    """
    Lectura manual básica de archivos .spe
    Adaptada para diferentes formatos de elipsometría
    """
    try:
        with open(filepath, 'rb') as f:
            # Leer header básico
            f.seek(42)  # xdim está en el byte 42
            xdim = struct.unpack('H', f.read(2))[0]
            
            f.seek(656)  # ydim está en el byte 656
            ydim = struct.unpack('H', f.read(2))[0]
            
            f.seek(108)  # data type
            datatype = struct.unpack('h', f.read(2))[0]
            
            # Saltar al inicio de los datos (típicamente en byte 4100)
            f.seek(4100)
            
            # Leer todos los datos disponibles
            if datatype == 0:  # float32
                data = np.fromfile(f, dtype=np.float32)
            elif datatype == 1:  # int32
                data = np.fromfile(f, dtype=np.int32)
            elif datatype == 2:  # int16
                data = np.fromfile(f, dtype=np.int16)
            elif datatype == 3:  # uint16
                data = np.fromfile(f, dtype=np.uint16)
            else:  # Por defecto uint16
                data = np.fromfile(f, dtype=np.uint16)
            
            # Determinar la estructura real de los datos
            total_points = len(data)
            
            # Si hay múltiples columnas (ej: 3 columnas para wavelength, psi, delta)
            if total_points % 3 == 0:
                # Asumir 3 columnas
                num_rows = total_points // 3
                data_reshaped = data.reshape((num_rows, 3))
                df = pd.DataFrame({
                    'wavelength': data_reshaped[:, 0],
                    'psi': data_reshaped[:, 1],
                    'delta': data_reshaped[:, 2]
                })
            elif total_points % 2 == 0 and ydim == 2:
                # Dos columnas
                num_rows = total_points // 2
                data_reshaped = data.reshape((num_rows, 2))
                df = pd.DataFrame({
                    'wavelength': np.arange(num_rows),
                    'psi': data_reshaped[:, 0],
                    'delta': data_reshaped[:, 1]
                })
            else:
                # Una sola columna o formato desconocido
                # Crear wavelength sintético y usar los datos como están
                df = pd.DataFrame({
                    'wavelength': np.arange(len(data)),
                    'psi': data,
                    'delta': data  # Duplicar por ahora
                })
            
            return df
            
    except Exception as e:
        raise Exception(f"Error en lectura manual del .spe: {str(e)}")


# === UPLOAD DE ARCHIVOS ===
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):

    # Validar extensión
    allowed = [".csv", ".txt", ".xlsx", ".spe"]
    ext = Path(file.filename).suffix.lower()

    if ext not in allowed:
        return JSONResponse(
            {"error": f"Archivo no soportado ({ext}). Use: {allowed}"},
            status_code=400
        )

    # Guardar archivo
    save_path = UPLOAD_DIR / file.filename
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Procesar datos
    try:
        if ext == ".csv":
            df = pd.read_csv(save_path)
        elif ext == ".txt":
            # Intentar diferentes delimitadores para archivos .txt
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
            # Leer archivo .spe (formato binario)
            df = read_spe_file(save_path)
        else:
            raise Exception("Formato no reconocido.")

    except Exception as e:
        return JSONResponse({"error": f"Error leyendo archivo: {str(e)}"}, status_code=400)

    # Verificar que tenga al menos 3 columnas
    if len(df.columns) < 3:
        return JSONResponse(
            {"error": "El archivo debe tener al menos 3 columnas (Psi, Delta, Longitud de onda)"},
            status_code=400
        )

    # Limpiar nombres de columnas (quitar espacios)
    df.columns = df.columns.str.strip()
    
    # Asegurar que todas las columnas numéricas estén en float64
    for col in df.columns:
        if df[col].dtype in ['float64', 'float32', 'int64', 'int32']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Reemplazar valores problemáticos
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.fillna(0)  # Reemplazar NaN con 0 para evitar problemas JSON
    
    # Convertir a float para asegurar compatibilidad JSON
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].astype(float)

    # Primeras 10 filas para preview
    preview = df.head(10).to_dict(orient="records")

    # TODOS los datos para graficar (convertir a lista de Python nativo)
    all_data = df.to_dict(orient="records")

    return {
        "filename": file.filename,
        "columns": df.columns.tolist(),
        "preview": preview,
        "full_data": all_data
    }


# Para debug - ver qué archivos hay en frontend
@app.get("/debug/files")
def debug_files():
    try:
        files = list(FRONTEND_DIR.glob("*"))
        return {
            "frontend_dir": str(FRONTEND_DIR),
            "files": [f.name for f in files]
        }
    except Exception as e:
        return {"error": str(e)}