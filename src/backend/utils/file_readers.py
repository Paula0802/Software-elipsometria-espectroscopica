"""
Lectores de archivos para diferentes formatos de datos ópticos
"""
import struct
import numpy as np
import pandas as pd
from pathlib import Path


def read_spe_file(filepath):
    """
    Lee archivos .spe de DeltaPsi2 (software de elipsometría)
    Formato: texto con headers y sección # DATA: con columnas nm Psi Delta Ic Is
    
    Args:
        filepath: Ruta al archivo .spe
    
    Returns:
        DataFrame de pandas con columnas: wavelength, psi, delta
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
                        data_start = i + 2  # Los datos empiezan 2 líneas después
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
                if len(df.columns) >= 3:
                    column_names = ['wavelength', 'psi', 'delta']
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
    Lectura manual básica de archivos .spe binarios
    Adaptada para diferentes formatos de elipsometría
    
    Args:
        filepath: Ruta al archivo .spe
    
    Returns:
        DataFrame de pandas con columnas: wavelength, psi, delta
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
                df = pd.DataFrame({
                    'wavelength': np.arange(len(data)),
                    'psi': data,
                    'delta': data
                })
            
            return df
            
    except Exception as e:
        raise Exception(f"Error en lectura manual del .spe: {str(e)}")


def read_optical_file(filepath, file_type="nk"):
    """
    Lee archivos de datos ópticos y convierte si es necesario
    
    Soporta:
    - Archivos n, k, λ
    - Archivos ε₁, ε₂, ω (convierte automáticamente a n, k, λ)
    
    Args:
        filepath: Ruta al archivo (Path object)
        file_type: "nk" para n,k,λ o "epsilon" para ε₁,ε₂,ω
    
    Returns:
        dict: {
            'wavelength': [...],
            'n': [...],
            'k': [...],
            'original_epsilon1': [...],  # solo si file_type="epsilon"
            'original_epsilon2': [...]   # solo si file_type="epsilon"
        }
    """
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
        # Buscar columnas epsilon1, epsilon2, omega
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
        
        # Convertir ε a n, k
        from optical.conversions import epsilon_to_nk, omega_to_wavelength
        n, k = epsilon_to_nk(epsilon1, epsilon2)
        
        # Convertir omega a wavelength si es necesario
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
    
    else:  # file_type == "nk"
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
                raise Exception("No se encontró columna n")
        
        n = df[n_col].values.astype(float)
        k = df[k_col].values.astype(float) if k_col else np.zeros_like(n)
        wavelength = df[wl_col].values.astype(float) if wl_col else np.arange(len(n))
        
        return {
            "wavelength": wavelength.tolist(),
            "n": n.tolist(),
            "k": k.tolist()
        }