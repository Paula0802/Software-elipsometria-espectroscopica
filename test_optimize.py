import requests
import numpy as np

# Datos de prueba
data = {
    "psi_exp": [20.0, 21.5, 23.0, 24.5, 26.0],
    "delta_exp": [90.0, 92.0, 94.0, 96.0, 98.0],
    "wavelengths": [400, 500, 600, 700, 800],
    "optical_model": {
        "angle": 70.0,
        "ambient": {"type": "constant", "n": 1.0, "k": 0.0},
        "substrate": {"type": "constant", "n": 3.85, "k": 0.0},
        "layers": [
            {
                "name": "Capa 1",
                "thickness": 100.0,
                "model": "cauchy",
                "params": {"A": 1.5, "B": 0.002, "C": 0.0}
            }
        ]
    },
    "params_to_optimize": [
        {
            "name": "layer_0_thickness",
            "path": ["layers", 0, "thickness"],
            "initial_value": 100.0,
            "lower_bound": 50.0,
            "upper_bound": 200.0
        },
        {
            "name": "layer_0_A",
            "path": ["layers", 0, "params", "A"],
            "initial_value": 1.5,
            "lower_bound": 1.0,
            "upper_bound": 2.0
        }
    ]
}

response = requests.post("http://localhost:8000/api/optimize", json=data)
result = response.json()

print("🔍 Resultado de optimización:")
print(f"  Éxito: {result.get('success')}")
print(f"  Iteraciones: {result.get('iterations')}")
print(f"  Tiempo: {result.get('optimization_time'):.2f}s")
print(f"\n📊 Métricas:")
print(f"  χ² inicial: {result.get('initial_metrics', {}).get('chi_squared', 0):.2f}")
print(f"  χ² final: {result.get('final_metrics', {}).get('chi_squared', 0):.2f}")
print(f"  Mejora: {result.get('improvement_percentage', 0):.2f}%")
print(f"\n📋 Parámetros optimizados:")
for param, value in result.get('optimized_params', {}).items():
    conf = result.get('confidence_intervals', {}).get(param, (value, 0))
    print(f"  {param}: {conf[0]:.4f} ± {conf[1]:.4f}")