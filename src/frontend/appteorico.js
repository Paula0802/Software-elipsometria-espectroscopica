// ============================================================================
// CONFIGURACIÓN PARA PRUEBAS TEÓRICAS - VERSIÓN PROFESIONAL
// ============================================================================

let theoreticalMode = true;
let theoreticalConfig = {
    wavelengths: [],
    angle: 70,
    polarization: 'both',  // Siempre ambas polarizaciones (fijo internamente)
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
    for (let i = 1; i <= 3; i++) {
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
    console.log('[Pruebas Teóricas] Inicializando...');
    initializeTheoreticalMode();
    updateWorkflowStep(1);
});

function initializeTheoreticalMode() {
    // Selector de método de longitud de onda
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
        continueBtn.addEventListener('click', openTheoreticalModelWizard);
    }
    
    // Checkboxes de salidas - sincronizar con theoreticalConfig
    const outputMappings = {
        'output-psi-delta': 'psi_delta',
        'output-reflectance': 'reflectance',
        'output-transmittance': 'transmittance',
        'output-absorbance': 'absorbance',
        'output-absorbance-layer': 'absorbance_layer'
    };
    
    Object.entries(outputMappings).forEach(([elementId, configKey]) => {
        const checkbox = document.getElementById(elementId);
        if (checkbox) {
            // Sincronizar estado inicial
            theoreticalConfig.outputs[configKey] = checkbox.checked;
            
            // Escuchar cambios
            checkbox.addEventListener('change', function() {
                theoreticalConfig.outputs[configKey] = this.checked;
                console.log(`[Config] ${configKey} = ${this.checked}`);
            });
        }
    });
    
    console.log('[Pruebas Teóricas] Configuración inicial:', theoreticalConfig);
}

function validateTheoreticalAngle() {
    const angleInput = document.getElementById('incident-angle');
    const angle = parseFloat(angleInput.value);
    const warning = document.getElementById('angle-warning');
    const continueBtn = document.getElementById('btn-continue-model');
    
    if (isNaN(angle)) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> Debe ingresar un ángulo válido.';
        continueBtn.disabled = true;
        return false;
    }
    
    if (angle < 0) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> El ángulo debe ser mayor o igual a 0°.';
        continueBtn.disabled = true;
        return false;
    }
    
    if (angle > 90) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> El ángulo no puede superar los 90°.';
        continueBtn.disabled = true;
        return false;
    }
    
    warning.style.display = 'none';
    continueBtn.disabled = false;
    return true;
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
        if (isNaN(single) || single <= 0) {
            throw new Error("Debe ingresar una longitud de onda válida (> 0)");
        }
        wavelengths = [single];
    }
    
    return wavelengths;
}

function openTheoreticalModelWizard() {
    try {
        // Validar ángulo
        if (!validateTheoreticalAngle()) {
            alert('Error: El ángulo de incidencia no es válido (debe estar entre 0° y 90°).');
            return;
        }
        
        // Obtener longitudes de onda
        const wavelengths = getTheoreticalWavelengths();
        
        // Obtener ángulo
        const angle = parseFloat(document.getElementById('incident-angle').value);
        
        // Guardar configuración
        theoreticalConfig.wavelengths = wavelengths;
        theoreticalConfig.angle = angle;
        theoreticalConfig.polarization = 'both';  // Siempre ambas polarizaciones
        uploadedWavelengths = wavelengths;
        
        // Verificar que hay al menos una salida seleccionada
        const hasOutput = Object.values(theoreticalConfig.outputs).some(v => v === true);
        if (!hasOutput) {
            alert('Error: Debe seleccionar al menos una propiedad para calcular.');
            return;
        }
        
        console.log('[Config] Configuración guardada:', {
            angle: theoreticalConfig.angle,
            wavelengths: `${wavelengths.length} puntos (${wavelengths[0]} - ${wavelengths[wavelengths.length-1]} nm)`,
            polarization: theoreticalConfig.polarization,
            outputs: theoreticalConfig.outputs
        });
        
        // Actualizar workflow visual
        updateWorkflowStep(2);
        
        // Abrir modal del wizard
        const modal = new bootstrap.Modal(document.getElementById('modelWizardModal'));
        modal.show();
        
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('[Error]', error);
    }
}