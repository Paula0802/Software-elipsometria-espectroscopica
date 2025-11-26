# backend/dispersion.py
import numpy as np

def cauchy_n(lambda_nm, A=1.0, B=0.0, C=0.0):
    # lambda in nm -> convert to um or keep nm consistently with params; common form uses µm^2
    # We'll assume B and C use nm^2, nm^4 as user provided. If your UI uses µm, adapta.
    lam2 = (lambda_nm.astype(float))**2
    n = A + B / lam2 + C / (lam2**2)
    k = np.zeros_like(n)
    return n, k

def compute_nk_from_model(model_name: str, wavelengths_nm: np.ndarray, params: dict):
    """
    model_name: 'cauchy' (others: 'sellmeier','drude','lorentz' later)
    wavelengths_nm: 1D numpy array (nm)
    params: dict with keys depending on model
    returns: n_arr (real), k_arr (real)
    """
    wl = np.array(wavelengths_nm, dtype=float)
    if model_name.lower() == 'cauchy':
        A = float(params.get('A', 1.5))
        B = float(params.get('B', 0.0))
        C = float(params.get('C', 0.0))
        return cauchy_n(wl, A=A, B=B, C=C)
    else:
        raise NotImplementedError(f"Modelo {model_name} no implementado aún.")
