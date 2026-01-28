// ============================================================================
// CONFIGURACIÓN PARA PRUEBAS TEÓRICAS - VERSIÓN PROFESIONAL
// ============================================================================

let theoreticalMode = true;
let theoreticalConfig = {
    wavelengths: [],
    angle: 70,
    polarization: 'both',
    outputs: {
        psi_delta: true,
        reflectance: true,
        transmittance: true,
        absorbance: true,
        absorbance_layer: false
    }
};

let currentData = null;
let uploadedFileData = null;
let uploadedWavelengths = [];
let savedModel = null;


// ============================================================================
// GESTIÓN DEL FLUJO DE TRABAJO (WORKFLOW)
// ============================================================================

function updateWorkflowStep(stepNumber) {
    // Actualizar estado de los pasos
    for (let i = 1; i <= 2; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (!stepEl) continue;

        if (i < stepNumber) {
            stepEl.classList.add('completed');
            stepEl.classList.remove('active');
        } else if (i === stepNumber) {
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
        } else {
            stepEl.classList.remove('active', 'completed');
        }
    }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Pruebas Teóricas] Modo activado');
    initializeTheoreticalMode();
    updateWorkflowStep(1); // Comenzar en paso 1
});

function initializeTheoreticalMode() {
    // Wavelength method selector
    const methodSelect = document.getElementById('wavelength-method');
    if (methodSelect) {
        methodSelect.addEventListener('change', function() {
            document.getElementById('wavelength-range-option').style.display = 
                this.value === 'range' ? 'block' : 'none';
            document.getElementById('wavelength-single-option').style.display = 
                this.value === 'single' ? 'block' : 'none';
        });
    }
    
    // Validación de ángulo
    const angleInput = document.getElementById('incident-angle');
    if (angleInput) {
        angleInput.addEventListener('input', validateTheoreticalAngle);
        angleInput.addEventListener('change', validateTheoreticalAngle);
    }
    
    // Botón configurar modelo
    const continueBtn = document.getElementById('btn-continue-model');
    if (continueBtn) {
        const newBtn = continueBtn.cloneNode(true);
        continueBtn.parentNode.replaceChild(newBtn, continueBtn);
        newBtn.addEventListener('click', openTheoreticalModelWizard);
    }
    
    // Checkboxes de salidas
    ['output-psi-delta', 'output-reflectance', 'output-transmittance', 'output-absorbance', 'output-absorbance-layer'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                theoreticalConfig.outputs[id.replace('output-', '').replace('-', '_')] = this.checked;
            });
        }
    });

    
}

function validateTheoreticalAngle() {
    const angle = parseFloat(document.getElementById('incident-angle').value);
    const warning = document.getElementById('angle-warning');
    const continueBtn = document.getElementById('btn-continue-model');
    
    if (isNaN(angle)) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> Debe ingresar un ángulo válido.';
        continueBtn.disabled = true;
        return false;
    }
    
    if (angle > 90) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Advertencia:</strong> El ángulo de incidencia no puede superar los 90 grados.';
        continueBtn.disabled = true;
        return false;
    } else if (angle < 0) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> El ángulo debe ser mayor o igual a 0 grados.';
        continueBtn.disabled = true;
        return false;
    } else {
        warning.style.display = 'none';
        continueBtn.disabled = false;
        return true;
    }
}

function getTheoreticalWavelengths() {
    const method = document.getElementById('wavelength-method').value;
    let wavelengths = [];
    
    if (method === 'range') {
        const min = parseFloat(document.getElementById('wavelength-min').value);
        const max = parseFloat(document.getElementById('wavelength-max').value);
        const steps = parseInt(document.getElementById('wavelength-steps').value);
        
        if (isNaN(min) || isNaN(max) || isNaN(steps)) {
            throw new Error("Los valores de rango deben ser números válidos");
        }
        if (min >= max) {
            throw new Error("La longitud inicial debe ser menor que la final");
        }
        if (steps < 2) {
            throw new Error("El número de pasos debe ser al menos 2");
        }
        
        const step = (max - min) / (steps - 1);
        for (let i = 0; i < steps; i++) {
            wavelengths.push(min + i * step);
        }
    } else {
        const single = parseFloat(document.getElementById('wavelength-single').value);
        if (isNaN(single)) {
            throw new Error("Debe ingresar una longitud de onda válida");
        }
        wavelengths = [single];
    }
    
    return wavelengths;
}

function openTheoreticalModelWizard() {
    try {
        if (!validateTheoreticalAngle()) {
            alert('Error: El ángulo de incidencia no es válido (debe estar entre 0° y 90°).');
            return;
        }
        
        const wavelengths = getTheoreticalWavelengths();
        const angle = parseFloat(document.getElementById('incident-angle').value);
        const polarization = document.querySelector('input[name="polarization-mode"]:checked').value;
        
        theoreticalConfig.wavelengths = wavelengths;
        theoreticalConfig.angle = angle;
        theoreticalConfig.polarization = polarization;
        uploadedWavelengths = wavelengths;
        
        const hasOutput = Object.values(theoreticalConfig.outputs).some(v => v === true);
        if (!hasOutput) {
            alert('Error: Debe seleccionar al menos una propiedad para calcular.');
            return;
        }
        
        console.log('[Config] Configuración teórica:', theoreticalConfig);
        
        // Ya no necesitamos pre-configurar el wizard porque 
        // el Paso 1 (configuración global) fue eliminado.
        // Los datos se leen directamente del panel izquierdo
        // en la función collectOpticalModelData()
        
        // Actualizar workflow
        updateWorkflowStep(2);
        
        // Abrir modal
        const modal = new bootstrap.Modal(document.getElementById('modelWizardModal'));
        modal.show();
        
    } catch (error) {
        alert('Error: ' + error.message);
        console.error(error);
    }
}

