from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import shutil

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

# Servir frontend
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def root():
    return FileResponse(FRONTEND_DIR / "upload.html")


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
        if ext == ".csv" or ext == ".txt":
            df = pd.read_csv(save_path)
        elif ext == ".xlsx":
            df = pd.read_excel(save_path)
        elif ext == ".spe":
            # Los archivos .spe pueden variar, ajusta según tu formato
            df = pd.read_csv(save_path, sep="\t", skiprows=0)
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

    # Primeras 10 filas para preview
    preview = df.head(10).to_dict(orient="records")

    # TODOS los datos para graficar
    all_data = df.to_dict(orient="records")

    return {
        "filename": file.filename,
        "columns": df.columns.tolist(),
        "preview": preview,
        "full_data": all_data  # Agregado: datos completos
    }