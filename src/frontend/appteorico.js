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

    // Polarización
    const polRadios = document.querySelectorAll('input[name="polarization-mode"]');
    polRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            theoreticalConfig.polarization = this.value;
        });
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

// ============================================================================
// CÁLCULO TEÓRICO
// ============================================================================

window.optimizeModel = async function() {
    console.log('[Cálculo] Ejecutando cálculo teórico...');
    return await calculateTheoreticalProperties();
};

async function calculateTheoreticalProperties() {
    try {
        const model = await collectOpticalModelData();
        
        const payload = {
            wavelengths: theoreticalConfig.wavelengths,
            angle: theoreticalConfig.angle,
            model: model,
            outputs: theoreticalConfig.outputs
        };
        
        console.log('[API] Enviando a /api/theoretical:', payload);
        
        const resultsContainer = document.getElementById('theoretical-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<div style="padding: 60px; text-align: center;"><div class="spinner-border text-primary" role="status"></div><p style="margin-top: 20px; color: #6c757d;">Calculando propiedades teóricas...</p></div>';
        }
        
        const response = await fetch('/api/theoretical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || error.error || 'Error en el cálculo');
        }
        
        const results = await response.json();
        console.log('[API] Resultados recibidos:', results);
        
        displayTheoreticalResults(results);
        
        // Actualizar workflow
        updateWorkflowStep(3);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('modelWizardModal'));
        if (modal) modal.hide();
        
        alert('Cálculo teórico completado exitosamente');
        
    } catch (error) {
        console.error('[Error] Cálculo teórico:', error);
        alert('Error en el cálculo teórico: ' + error.message);
        
        const resultsContainer = document.getElementById('theoretical-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="info-card">
                    <h3 style="color: #dc3545;">Error en el Cálculo</h3>
                    <p>${error.message}</p>
                    <p><small>Revise la configuración del modelo óptico y vuelva a intentarlo.</small></p>
                </div>
            `;
        }
    }
}

function displayTheoreticalResults(results) {
    const container = document.getElementById('theoretical-results-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const wavelengths = results.wavelengths;
    
    // Ψ y Δ
    if (results.psi && results.delta) {
        const psiCard = document.createElement('div');
        psiCard.className = 'graph-wrapper';
        psiCard.innerHTML = '<div class="graph-title">Ψ (Psi) en función de λ</div><div id="graph-psi-theoretical"></div>';
        container.appendChild(psiCard);
        
        Plotly.newPlot('graph-psi-theoretical', [{
            x: wavelengths,
            y: results.psi,
            mode: 'lines+markers',
            name: 'Ψ',
            line: { width: 2, color: '#667eea' },
            marker: { size: 4 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)', showgrid: true, gridcolor: '#e9ecef' },
            yaxis: { title: 'Ψ (grados)', showgrid: true, gridcolor: '#e9ecef' },
            margin: { t: 10, r: 20, b: 50, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white'
        }, { responsive: true });
        
        const deltaCard = document.createElement('div');
        deltaCard.className = 'graph-wrapper';
        deltaCard.innerHTML = '<div class="graph-title">Δ (Delta) en función de λ</div><div id="graph-delta-theoretical"></div>';
        container.appendChild(deltaCard);
        
        Plotly.newPlot('graph-delta-theoretical', [{
            x: wavelengths,
            y: results.delta,
            mode: 'lines+markers',
            name: 'Δ',
            line: { width: 2, color: '#764ba2' },
            marker: { size: 4 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)', showgrid: true, gridcolor: '#e9ecef' },
            yaxis: { title: 'Δ (grados)', showgrid: true, gridcolor: '#e9ecef' },
            margin: { t: 10, r: 20, b: 50, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white'
        }, { responsive: true });
    }
    
    // Reflectancia
    if (results.reflectance) {
        const rCard = document.createElement('div');
        rCard.className = 'graph-wrapper';
        rCard.innerHTML = '<div class="graph-title">Reflectancia en función de λ</div><div id="graph-r-theoretical"></div>';
        container.appendChild(rCard);
        
        Plotly.newPlot('graph-r-theoretical', [{
            x: wavelengths,
            y: results.reflectance,
            mode: 'lines+markers',
            name: 'R',
            line: { width: 2, color: '#4a90e2' },
            marker: { size: 4 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)', showgrid: true, gridcolor: '#e9ecef' },
            yaxis: { title: 'Reflectancia', showgrid: true, gridcolor: '#e9ecef' },
            margin: { t: 10, r: 20, b: 50, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white'
        }, { responsive: true });
    }
    
    // Transmitancia
    if (results.transmittance) {
        const tCard = document.createElement('div');
        tCard.className = 'graph-wrapper';
        tCard.innerHTML = '<div class="graph-title">Transmitancia en función de λ</div><div id="graph-t-theoretical"></div>';
        container.appendChild(tCard);
        
        Plotly.newPlot('graph-t-theoretical', [{
            x: wavelengths,
            y: results.transmittance,
            mode: 'lines+markers',
            name: 'T',
            line: { width: 2, color: '#4caf50' },
            marker: { size: 4 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)', showgrid: true, gridcolor: '#e9ecef' },
            yaxis: { title: 'Transmitancia', showgrid: true, gridcolor: '#e9ecef' },
            margin: { t: 10, r: 20, b: 50, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white'
        }, { responsive: true });
    }
    
    // Absorbancia
    if (results.absorbance) {
        const aCard = document.createElement('div');
        aCard.className = 'graph-wrapper';
        aCard.innerHTML = '<div class="graph-title">Absorbancia en función de λ</div><div id="graph-a-theoretical"></div>';
        container.appendChild(aCard);
        
        Plotly.newPlot('graph-a-theoretical', [{
            x: wavelengths,
            y: results.absorbance,
            mode: 'lines+markers',
            name: 'A',
            line: { width: 2, color: '#ff9800' },
            marker: { size: 4 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)', showgrid: true, gridcolor: '#e9ecef' },
            yaxis: { title: 'Absorbancia', showgrid: true, gridcolor: '#e9ecef' },
            margin: { t: 10, r: 20, b: 50, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white'
        }, { responsive: true });
    }
    
    // Absorbancia por capa
    if (results.absorbance_per_layer) {
        const alCard = document.createElement('div');
        alCard.className = 'graph-wrapper';
        alCard.innerHTML = '<div class="graph-title">Absorbancia por Capa en función de λ</div><div id="graph-al-theoretical"></div>';
        container.appendChild(alCard);
        
        const traces = [];
        for (const [layerName, absValues] of Object.entries(results.absorbance_per_layer)) {
            traces.push({
                x: wavelengths,
                y: absValues,
                mode: 'lines+markers',
                name: layerName,
                marker: { size: 4 }
            });
        }
        
        Plotly.newPlot('graph-al-theoretical', traces, {
            xaxis: { title: 'Longitud de onda (nm)', showgrid: true, gridcolor: '#e9ecef' },
            yaxis: { title: 'Absorbancia', showgrid: true, gridcolor: '#e9ecef' },
            margin: { t: 10, r: 20, b: 50, l: 60 },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white'
        }, { responsive: true });
    }
    
    // Botón descargar
    const downloadCard = document.createElement('div');
    downloadCard.className = 'graph-wrapper';
    downloadCard.innerHTML = '<button class="btn btn-success w-100" onclick="downloadTheoreticalResultsCSV()">Descargar Resultados (CSV)</button>';
    container.appendChild(downloadCard);
    
    window.theoreticalResultsData = results;
}

function downloadTheoreticalResultsCSV() {
    const results = window.theoreticalResultsData;
    if (!results) {
        alert('No hay resultados para descargar');
        return;
    }
    
    let csv = 'wavelength_nm';
    if (results.psi) csv += ',psi_deg';
    if (results.delta) csv += ',delta_deg';
    if (results.reflectance) csv += ',reflectance';
    if (results.transmittance) csv += ',transmittance';
    if (results.absorbance) csv += ',absorbance';
    csv += '\n';
    
    const wavelengths = results.wavelengths;
    for (let i = 0; i < wavelengths.length; i++) {
        csv += wavelengths[i];
        if (results.psi) csv += ',' + results.psi[i];
        if (results.delta) csv += ',' + results.delta[i];
        if (results.reflectance) csv += ',' + results.reflectance[i];
        if (results.transmittance) csv += ',' + results.transmittance[i];
        if (results.absorbance) csv += ',' + results.absorbance[i];
        csv += '\n';
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resultados_teoricos.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// CÓDIGO WIZARD (SIN CAMBIOS - Mantiene toda la funcionalidad existente)
// ============================================================================

const modelWizardModal = new bootstrap.Modal(document.getElementById("modelWizardModal"));
const wizardSteps = [...document.querySelectorAll(".wizard-step")];
let currentStep = 1;

const wizardNextBtn = document.getElementById("wizard-next");
const wizardPrevBtn = document.getElementById("wizard-prev");
const wizardSaveBtn = document.getElementById("wizard-save");
const wizardError = document.getElementById("wizard-error");

function showStep(n) {
    // Ocultar TODOS los pasos
    const allSteps = document.querySelectorAll('.wizard-step');
    allSteps.forEach(step => {
        step.classList.add('d-none');
    });
    
    // Mostrar el paso actual
    const currentStepElement = document.querySelector(`[data-step="${n}"]`);
    if (currentStepElement) {
        currentStepElement.classList.remove('d-none');
        currentStepElement.style.display = 'block';
    }
    
    // ⭐ NUEVO: Actualizar barra de progreso
    const totalSteps = allSteps.length;
    const progressPercentage = (n / totalSteps) * 100;
    
    // Buscar el elemento de la barra de progreso
    const progressBar = document.querySelector('.progress-bar'); // Ajusta el selector según tu HTML
    if (progressBar) {
        progressBar.style.width = progressPercentage + '%';
        progressBar.setAttribute('aria-valuenow', progressPercentage);
    }
    
    // Actualizar número de paso
    const stepNum = document.getElementById("wizard-step-num");
    if (stepNum) stepNum.innerText = n;
    
    // Botones de navegación
    wizardPrevBtn.style.display = (n === 1) ? "none" : "inline-block";
    wizardNextBtn.style.display = (n === totalSteps) ? "none" : "inline-block";
    wizardSaveBtn.classList.toggle("d-none", n !== totalSteps);
    wizardError.style.display = "none";
    
    // Resumen en paso 3
    if (n === 3) {
        updateModelSummary();
    }
}

showStep(1);

wizardNextBtn.addEventListener("click", () => {
    if (currentStep < wizardSteps.length) {
        if (!validateStep(currentStep)) return;
        currentStep += 1;
        showStep(currentStep);
    }
});

wizardPrevBtn.addEventListener("click", () => {
    if (currentStep > 1) {
        currentStep -= 1;
        showStep(currentStep);
    }
});

// Los siguientes event listeners eran para el Paso 1 del wizard que fue eliminado
// Ya no son necesarios porque esos campos ahora están en el panel izquierdo

/*
document.getElementById("input-polarization").addEventListener("change", (e) => {
    const warning = document.getElementById("polarization-warning");
    if (e.target.value === "S" || e.target.value === "P") {
        warning.style.display = "block";
    } else {
        warning.style.display = "none";
    }
});

const wlOptions = document.querySelectorAll('input[name="wl-option"]');
const wlRangeFields = document.getElementById('wl-range-fields');
const wlSingleField = document.getElementById('wl-single-field');
wlOptions.forEach(opt => {
    opt.addEventListener('change', () => {
        const val = document.querySelector('input[name="wl-option"]:checked').value;
        wlRangeFields.style.display = (val === 'range') ? 'block' : 'none';
        wlSingleField.style.display = (val === 'single') ? 'block' : 'none';
    });
});
*/

// ============================================================================
// ⭐ EVENT LISTENERS PARA MODELOS Y ARCHIVOS
// ============================================================================

// Listeners para modelos de ambiente
document.getElementById("ambient-model").addEventListener("change", (e) => {
    updateMediumFields('ambient', e.target.value);
});

// Listeners para modelos de sustrato
document.getElementById("substrate-model").addEventListener("change", (e) => {
    updateMediumFields('substrate', e.target.value);
});

// Listeners para tipos de sustrato/ambiente (homogéneo vs EMT)
document.getElementById("substrate-type-homo").addEventListener("change", () => {
    updateSubstrateTypeInterface('homogeneous');
});

document.getElementById("substrate-type-emt").addEventListener("change", () => {
    updateSubstrateTypeInterface('emt');
});

document.getElementById("ambient-type-homo").addEventListener("change", () => {
    updateAmbientTypeInterface('homogeneous');
});

document.getElementById("ambient-type-emt").addEventListener("change", () => {
    updateAmbientTypeInterface('emt');
});

// ============================================================================
// ⭐ EVENT LISTENER PARA ARCHIVO EN AMBIENTE HOMOGÉNEO
// ============================================================================
const ambientFileInput = document.getElementById('ambient-file');
if (ambientFileInput) {
    ambientFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('[Ambiente] Subiendo archivo:', file.name);
        
        // Remover mensajes previos
        const prevMessages = ambientFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
        prevMessages.forEach(msg => msg.remove());
        
        // Mostrar carga
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
        loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
        ambientFileInput.after(loadingMsg);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', 'nk');
        
        try {
            const response = await fetch('/api/upload-optical-data', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            loadingMsg.remove();
            
            if (result.error || result.success === false) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>❌ Error al procesar archivo</strong>
                    <p class="mb-0">${result.error || 'Error desconocido'}</p>
                `;
                ambientFileInput.after(errorDiv);
                return;
            }
            
            if (!result.info || !result.data) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                errorDiv.innerHTML = `<strong>⚠️ Respuesta incompleta del servidor</strong>`;
                ambientFileInput.after(errorDiv);
                return;
            }
            
            const info = result.info;
            const warnings = result.warnings || [];
            
            console.log('[Ambiente] Archivo procesado:', info);
            
            let warningsHTML = '';
            if (warnings.length > 0) {
                warningsHTML = `
                    <div class="mt-2 pt-2 border-top">
                        <strong>⚠️ Advertencias:</strong>
                        <ul class="mb-0 small">
                            ${warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            const successDiv = document.createElement('div');
            successDiv.className = 'alert alert-success mt-2 file-result-msg';
            successDiv.innerHTML = `
                <strong>✅ Archivo procesado</strong>
                <ul class="mb-0 small mt-2">
                    <li><strong>Formato:</strong> ${info.format}</li>
                    <li><strong>Puntos:</strong> ${info.points}</li>
                    <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                    <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                    <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                </ul>
                ${warningsHTML}
            `;
            
            ambientFileInput.after(successDiv);
            
            // Guardar datos
            ambientFileInput.dataset.opticalData = JSON.stringify(result.data);
            
        } catch (error) {
            loadingMsg.remove();
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
            errorDiv.innerHTML = `
                <strong>❌ Error de conexión</strong>
                <p class="mb-0">${error.message}</p>
            `;
            ambientFileInput.after(errorDiv);
        }
    });
}

// ============================================================================
// ⭐ EVENT LISTENER PARA ARCHIVO EN SUSTRATO HOMOGÉNEO
// ============================================================================
const substrateFileInput = document.getElementById('substrate-file');
if (substrateFileInput) {
    substrateFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('[Sustrato] Subiendo archivo:', file.name);
        
        // Remover mensajes previos
        const prevMessages = substrateFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
        prevMessages.forEach(msg => msg.remove());
        
        // Mostrar carga
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
        loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
        substrateFileInput.after(loadingMsg);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', 'nk');
        
        try {
            const response = await fetch('/api/upload-optical-data', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            loadingMsg.remove();
            
            if (result.error || result.success === false) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>❌ Error al procesar archivo</strong>
                    <p class="mb-0">${result.error || 'Error desconocido'}</p>
                `;
                substrateFileInput.after(errorDiv);
                return;
            }
            
            if (!result.info || !result.data) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                errorDiv.innerHTML = `<strong>⚠️ Respuesta incompleta del servidor</strong>`;
                substrateFileInput.after(errorDiv);
                return;
            }
            
            const info = result.info;
            const warnings = result.warnings || [];
            
            console.log('[Sustrato] Archivo procesado:', info);
            
            let warningsHTML = '';
            if (warnings.length > 0) {
                warningsHTML = `
                    <div class="mt-2 pt-2 border-top">
                        <strong>⚠️ Advertencias:</strong>
                        <ul class="mb-0 small">
                            ${warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            const successDiv = document.createElement('div');
            successDiv.className = 'alert alert-success mt-2 file-result-msg';
            successDiv.innerHTML = `
                <strong>✅ Archivo procesado</strong>
                <ul class="mb-0 small mt-2">
                    <li><strong>Formato:</strong> ${info.format}</li>
                    <li><strong>Puntos:</strong> ${info.points}</li>
                    <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                    <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                    <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                </ul>
                ${warningsHTML}
            `;
            
            substrateFileInput.after(successDiv);
            
            // Guardar datos
            substrateFileInput.dataset.opticalData = JSON.stringify(result.data);
            
        } catch (error) {
            loadingMsg.remove();
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
            errorDiv.innerHTML = `
                <strong>❌ Error de conexión</strong>
                <p class="mb-0">${error.message}</p>
            `;
            substrateFileInput.after(errorDiv);
        }
    });
}

// Inicializar interfaces
updateMediumFields('ambient', 'constant');
updateMediumFields('substrate', 'glass');


window.dispersionTemplates = {

    cauchy: {
        label: "Cauchy",
        equation: "n(\\lambda) = A + \\frac{B}{\\lambda^2} + \\frac{C}{\\lambda^4}",
        params: [
            { name: "A", placeholder: "A (ej: 1.5)", canOptimize: true },
            { name: "B", placeholder: "B (ej: 0.004)", canOptimize: true },
            { name: "C", placeholder: "C (ej: 0)", canOptimize: true }
        ],
        previewFn: (p) => {
            const getValue = (paramName, defaultSymbol) => {
                const value = p[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    const num = parseFloat(value);
                    if (!isNaN(num)) return num;
                }
                return defaultSymbol;
            };
            const A = getValue('A', 'A');
            const B = getValue('B', 'B');
            const C = getValue('C', 'C');
            return `n(\\lambda) = ${A} + \\frac{${B}}{\\lambda^2} + \\frac{${C}}{\\lambda^4}`;
        }
    },

    sellmeier: {
        label: "Sellmeier",
        equation: "n^2(\\lambda) = 1 + \\sum_j \\frac{B_j \\lambda^2}{\\lambda^2 - C_j}",
        params: [
            { name: "B1", placeholder: "B₁", canOptimize: true },
            { name: "C1", placeholder: "C₁ (μm²)", canOptimize: true }
        ],
        maxOscillators: 10,
        termName: "término",
        generateDynamicParam: (index) => {
            const toSubscript = (n) => {
                const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
                return n.toString().split('').map(d => subs[parseInt(d)]).join('');
            };
            
            return [
                { name: `B${index}`, placeholder: `B${toSubscript(index)}`, canOptimize: true },
                { name: `C${index}`, placeholder: `C${toSubscript(index)} (μm²)`, canOptimize: true }
            ];
        },
        previewFn: (p) => {
            const getValue = (paramName, defaultSymbol) => {
                const value = p[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    return parseFloat(value);
                }
                return defaultSymbol;
            };
            
            let terms = [];
            for (let i = 1; i <= 10; i++) {
                const B = p[`B${i}`];
                if (B !== undefined && B !== null && B !== '') {
                    const Bval = getValue(`B${i}`, `B_{${i}}`);
                    const Cval = getValue(`C${i}`, `C_{${i}}`);
                    terms.push(`\\frac{${Bval}\\lambda^2}{\\lambda^2-${Cval}}`);
                }
            }
            return `n^2(\\lambda) = 1 ${terms.length ? '+ ' + terms.join(' + ') : ''}`;
        }
    },

    drude: {
        label: "Drude",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty - \\frac{f_0 \\omega_p^2}{\\omega^2 + i\\Gamma_0 \\omega}",
        params: [
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            { name: "f0", placeholder: "f₀", canOptimize: true },
            { name: "omega_p", placeholder: "ωp (eV)", canOptimize: true },
            { name: "gamma0", placeholder: "Γ₀ (eV)", canOptimize: true }
        ],
        helpText: "Modelo Drude para metales y semiconductores dopados. ε∞ es la permitividad a alta frecuencia, ωp la frecuencia de plasma, f₀ la fuerza del oscilador y Γ₀ el damping.",
        previewFn: (p) => {
            const getValue = (paramName, defaultSymbol) => {
                const value = p[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    const num = parseFloat(value);
                    if (!isNaN(num)) return num;
                }
                return defaultSymbol;
            };
            
            const eps_inf = getValue('eps_inf', '\\varepsilon_\\infty');
            const omega_p = getValue('omega_p', '\\omega_p');
            const f0 = getValue('f0', 'f_0');
            const gamma0 = getValue('gamma0', '\\Gamma_0');
            
            return `\\varepsilon(\\omega) = ${eps_inf} - \\frac{${f0} \\cdot ${omega_p}^2}{\\omega^2 + i \\cdot ${gamma0} \\cdot \\omega}`;
        }
    },

    lorentz: {
        label: "Lorentz",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty + \\sum_j \\frac{f_j \\omega_p^2}{\\omega_j^2 - \\omega^2 - i\\Gamma_j\\omega}",
        params: [
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            { name: "omega_p", placeholder: "ωp (eV)", canOptimize: true },
            // Primer oscilador (siempre visible)
            { name: "f1", placeholder: "f₁", canOptimize: true },
            { name: "omega_1", placeholder: "ω₁ (eV)", canOptimize: true },
            { name: "gamma_1", placeholder: "Γ₁ (eV)", canOptimize: true }
        ],
        maxOscillators: 6,
        termName: "oscilador",
        generateDynamicParam: (index) => {
            const toSubscript = (n) => {
                const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
                return n.toString().split('').map(d => subs[parseInt(d)]).join('');
            };
            
            return [
                { name: `f${index}`, placeholder: `f${toSubscript(index)}`, canOptimize: true },
                { name: `omega_${index}`, placeholder: `ω${toSubscript(index)} (eV)`, canOptimize: true },
                { name: `gamma_${index}`, placeholder: `Γ${toSubscript(index)} (eV)`, canOptimize: true }
            ];
        },
        helpText: "Modelo de Lorentz para dieléctricos con resonancias. ε∞ es la permitividad de fondo, ωp la frecuencia de plasma, fⱼ la fuerza del oscilador j, ωⱼ su frecuencia de resonancia y Γⱼ el damping.",
        previewFn: (p) => {
            const getValue = (paramName, defaultSymbol) => {
                const value = p[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    return parseFloat(value);
                }
                return defaultSymbol;
            };
            
            const eps_inf = getValue('eps_inf', '\\varepsilon_\\infty');
            const omega_p = getValue('omega_p', '\\omega_p');
            
            let terms = [];
            for (let i = 1; i <= 6; i++) {
                const f = p[`f${i}`];
                if (f !== undefined && f !== null && f !== '') {
                    const fval = getValue(`f${i}`, `f_{${i}}`);
                    const wval = getValue(`omega_${i}`, `\\omega_{${i}}`);
                    const gval = getValue(`gamma_${i}`, `\\Gamma_{${i}}`);
                    terms.push(`\\frac{${fval} \\cdot ${omega_p}^2}{${wval}^2 - \\omega^2 - i\\cdot ${gval}\\cdot\\omega}`);
                }
            }
            
            return `\\varepsilon(\\omega) = ${eps_inf} ${terms.length ? '+ ' + terms.join(' + ') : ''}`;
        }
    },

    drude_lorentz: {
        label: "Drude-Lorentz",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty - \\frac{f_0 \\omega_p^2}{\\omega^2 + i\\Gamma_0\\omega} + \\sum_j \\frac{f_j \\omega_p^2}{\\omega_j^2 - \\omega^2 - i\\Gamma_j\\omega}",
        params: [
            // Parámetros globales
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            { name: "omega_p", placeholder: "ωp (eV)", canOptimize: true },
            // Término Drude (siempre visible)
            { name: "f0", placeholder: "f₀ (Drude)", canOptimize: true },
            { name: "gamma_0", placeholder: "Γ₀ (eV)", canOptimize: true },
            // Primer oscilador Lorentz (siempre visible)
            { name: "f1", placeholder: "f₁", canOptimize: true },
            { name: "omega_1", placeholder: "ω₁ (eV)", canOptimize: true },
            { name: "gamma_1", placeholder: "Γ₁ (eV)", canOptimize: true }
        ],
        maxOscillators: 6,
        termName: "oscilador",
        generateDynamicParam: (index) => {
            const toSubscript = (n) => {
                const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
                return n.toString().split('').map(d => subs[parseInt(d)]).join('');
            };
            
            return [
                { name: `f${index}`, placeholder: `f${toSubscript(index)}`, canOptimize: true },
                { name: `omega_${index}`, placeholder: `ω${toSubscript(index)} (eV)`, canOptimize: true },
                { name: `gamma_${index}`, placeholder: `Γ${toSubscript(index)} (eV)`, canOptimize: true }
            ];
        },
        helpText: "Modelo Drude-Lorentz combinado para metales con transiciones interbanda. Término Drude (f₀, Γ₀) para electrones libres + osciladores Lorentz (fⱼ, ωⱼ, Γⱼ) para transiciones electrónicas. Todos usan ωp² común.",
        previewFn: (p) => {
            const getValue = (paramName, defaultSymbol) => {
                const value = p[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    return parseFloat(value);
                }
                return defaultSymbol;
            };
            
            const eps_inf = getValue('eps_inf', '\\varepsilon_\\infty');
            const omega_p = getValue('omega_p', '\\omega_p');
            
            // Término Drude
            let drudeTerms = '';
            if (p['f0'] !== undefined && p['f0'] !== null && p['f0'] !== '') {
                const f0val = getValue('f0', 'f_0');
                const g0val = getValue('gamma_0', '\\Gamma_0');
                drudeTerms = ` - \\frac{${f0val} \\cdot ${omega_p}^2}{\\omega^2 + i\\cdot ${g0val}\\cdot\\omega}`;
            }
            
            // Osciladores Lorentz
            let lorentzTerms = [];
            for (let i = 1; i <= 6; i++) {
                const f = p[`f${i}`];
                if (f !== undefined && f !== null && f !== '') {
                    const fval = getValue(`f${i}`, `f_{${i}}`);
                    const wval = getValue(`omega_${i}`, `\\omega_{${i}}`);
                    const gval = getValue(`gamma_${i}`, `\\Gamma_{${i}}`);
                    lorentzTerms.push(`\\frac{${fval} \\cdot ${omega_p}^2}{${wval}^2 - \\omega^2 - i\\cdot ${gval}\\cdot\\omega}`);
                }
            }
            
            let result = `\\varepsilon(\\omega) = ${eps_inf}`;
            if (drudeTerms) result += drudeTerms;
            if (lorentzTerms.length > 0) result += ' + ' + lorentzTerms.join(' + ');
            
            return result;
        }
    }

};



// ============================================================================
// ⭐ FUNCIONES DE INTERFAZ MEJORADA (Copiadas de app.js)
// ============================================================================

/**
 * Crea campo de parámetro con vista previa en tiempo real
 */
function createParamFieldWithPreview(param, prefix = '', onChangeCb = null) {
    const inputId = `${prefix}${param.name}`;
    const field = document.createElement('div');
    field.className = 'param-field mb-2';
    field.dataset.param = param.name;
    field.dataset.group = param.group || 'default';
    
    // Crear label
    const label = document.createElement('label');
    label.className = 'form-label small mb-1';
    label.textContent = param.placeholder;
    field.appendChild(label);
    
    // Crear input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group input-group-sm';
    
    // Crear input con data-param
    const input = document.createElement('input');
    input.className = 'form-control layer-param';
    input.id = inputId;
    input.type = 'number';
    input.step = 'any';
    input.placeholder = param.placeholder;
    input.setAttribute('data-param', param.name);
    input.setAttribute('data-group', param.group || 'default');
    inputGroup.appendChild(input);
    
    // Agregar checkbox de optimización si es permitido
    if (param.canOptimize) {
        const checkboxSpan = document.createElement('span');
        checkboxSpan.className = 'input-group-text bg-light';
        
        const checkbox = document.createElement('input');
        checkbox.className = 'form-check-input mt-0 optimize-param';
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-param', param.name);
        checkbox.title = `Optimizar ${param.name}`;
        
        checkboxSpan.appendChild(checkbox);
        inputGroup.appendChild(checkboxSpan);
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'input-group-text';
        labelSpan.textContent = 'Opt';
        inputGroup.appendChild(labelSpan);
    }
    
    field.appendChild(inputGroup);
    
    // Event listeners
    input.addEventListener('input', function() {
        const updateEvent = new CustomEvent('param-changed', {
            bubbles: true,
            detail: { param: param.name, value: this.value }
        });
        this.dispatchEvent(updateEvent);
    });
    
    if (onChangeCb) {
        input.addEventListener('input', onChangeCb);
    }
    
    return field;
}

/**
 * Muestra ecuación en tiempo real con INTERFAZ DIVIDIDA
 */
function showEquationPreviewSplit(container, model, getAllParams) {
    const template = window.dispersionTemplates[model];
    if (!template || !template.previewFn) return;
    
    let previewSection = container.querySelector('.equation-preview-split');
    if (!previewSection) {
        // CREAR LA ESTRUCTURA DIVIDIDA SI NO EXISTE
        previewSection = document.createElement('div');
        previewSection.className = 'equation-preview-split row mt-3';
        previewSection.innerHTML = `
            <div class="col-md-6 params-side">
                <!-- Los parámetros YA ESTÁN insertados antes de esta sección -->
            </div>
            <div class="col-md-6 preview-side">
                <h6 class="text-muted small mb-2 fw-bold">Vista previa de ecuación:</h6>
                <div class="equation-column border rounded p-3 bg-white" style="min-height: 150px;">
                    <!-- Ecuación del modelo (fija) -->
                    <div class="mb-3 pb-3 border-bottom">
                        <small class="text-muted fw-bold d-block mb-2">Modelo ${template.label}:</small>
                        <div class="equation-template text-center p-2 bg-light rounded">
                            $$${template.equation}$$
                        </div>
                    </div>
                    
                    <!-- Ecuación con valores (dinámica) -->
                    <div class="mb-3">
                        <small class="text-muted fw-bold d-block mb-2">✨ Con tus valores:</small>
                        <div class="equation-display text-center">
                            <!-- Ecuación renderizada con valores -->
                        </div>
                    </div>
                    
                    ${template.helpText ? `
                        <div class="alert alert-info small mb-3">
                            ${template.helpText}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        container.appendChild(previewSection);
        
        // MOVER parámetros a la columna izquierda
        const paramsSide = previewSection.querySelector('.params-side');
        const existingParams = container.querySelectorAll('.param-field, .btn-outline-primary, .dynamic-oscillator');
        
        existingParams.forEach(el => {
            if (!previewSection.contains(el)) {
                paramsSide.appendChild(el);
            }
        });
    }
    
    // ACTUALIZAR la ecuación con valores
    const params = getAllParams();
    const equationLatex = template.previewFn(params);
    
    const equationDisplay = previewSection.querySelector('.equation-display');
    equationDisplay.innerHTML = `$$${equationLatex}$$`;
    
    // RENDERIZAR con MathJax
    if (window.MathJax) {
        MathJax.typesetPromise([previewSection]);
    }
}

/**
 * Configura vista previa en vivo
 */
function setupLivePreview(container, model) {
    const template = window.dispersionTemplates[model];
    if (!template) return;
    
    // Función para obtener todos los parámetros
    const getAllParams = () => {
        const params = {};
        const inputs = container.querySelectorAll('.layer-param');
        inputs.forEach(inp => {
            const paramName = inp.dataset.param;
            const value = inp.value.trim();
            if (value !== '') {
                params[paramName] = parseFloat(value);
            }
        });
        return params;
    };
    
    // Actualizar vista previa
    const updatePreview = () => {
        showEquationPreviewSplit(container, model, getAllParams);
    };
    
    // Agregar listeners a todos los inputs existentes
    const inputs = container.querySelectorAll('.layer-param');
    inputs.forEach(inp => {
        inp.addEventListener('input', updatePreview);
    });
    
    // Vista previa inicial
    updatePreview();
    
    return { getAllParams, updatePreview };
}

/**
 * Agrega oscilador dinámico (para Sellmeier/Lorentz)
 */
function addDynamicOscillator(container, model, currentCount) {
    const template = window.dispersionTemplates[model];
    if (!template || !template.generateDynamicParam) return null;
    
    const nextIndex = currentCount + 1;
    if (nextIndex > template.maxOscillators) {
        const termName = template.termName;
        alert(`Máximo ${template.maxOscillators} ${termName}s permitidos`);
        return null;
    }
    
    const newParams = template.generateDynamicParam(nextIndex);
    const dynamicSection = document.createElement('div');
    dynamicSection.className = 'dynamic-oscillator border-start border-3 border-primary ps-2 mb-2';
    dynamicSection.dataset.oscIndex = nextIndex;
    
    const termName = template.termName;
    const termNameCapitalized = termName.charAt(0).toUpperCase() + termName.slice(1);
    
    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center mb-1';
    header.innerHTML = `
        <small class="fw-bold text-primary">${termNameCapitalized} ${nextIndex}</small>
        <button type="button" class="btn btn-sm btn-outline-danger remove-oscillator">X</button>
    `;
    dynamicSection.appendChild(header);
    
    newParams.forEach(param => {
        const field = createParamFieldWithPreview(param, `dyn-${model}-${nextIndex}-`);
        dynamicSection.appendChild(field);
    });
    
    return dynamicSection;
}

/**
 * Actualiza campos del modelo con interfaz mejorada
 */
function updateModelFieldsEnhanced(container, model, prefix = '') {
    container.innerHTML = '';
    
    const template = window.dispersionTemplates[model];
    if (!template) return;
    
    // Parámetros normales
    template.params.forEach(param => {
        const field = createParamFieldWithPreview(param, prefix);
        container.appendChild(field);
    });
    
    // Setup live preview DESPUÉS de agregar todos los campos
    const previewControls = setupLivePreview(container, model);
    
    // Botón para agregar términos/osciladores dinámicos
    if (template.maxOscillators) {
        const addOscBtn = document.createElement('button');
        addOscBtn.type = 'button';
        addOscBtn.className = 'btn btn-sm btn-outline-primary w-100 mb-2 mt-2';
        
        const termName = template.termName || 'término';
        const initialCount = 1;
        
        addOscBtn.innerHTML = `+ Agregar ${termName} (máximo ${template.maxOscillators})`;
        addOscBtn.dataset.oscCount = String(initialCount);
        
        addOscBtn.addEventListener('click', () => {
            const currentCount = parseInt(addOscBtn.dataset.oscCount);
            
            if (currentCount >= template.maxOscillators) {
                alert(`Ya alcanzaste el máximo de ${template.maxOscillators} ${termName}s`);
                return;
            }
            
            const newOsc = addDynamicOscillator(container, model, currentCount);
            
            if (newOsc) {
                const previewSection = container.querySelector('.equation-preview-split');
                if (previewSection) {
                    const paramsSide = previewSection.querySelector('.params-side');
                    paramsSide.insertBefore(newOsc, addOscBtn);
                } else {
                    container.insertBefore(newOsc, addOscBtn);
                }
                
                addOscBtn.dataset.oscCount = String(currentCount + 1);
                
                const remaining = template.maxOscillators - (currentCount + 1);
                if (remaining === 0) {
                    addOscBtn.disabled = true;
                    addOscBtn.innerHTML = `✓ Máximo de ${termName}s alcanzado`;
                } else {
                    addOscBtn.innerHTML = `+ Agregar ${termName} (${remaining} disponibles)`;
                }
                
                // Listener para botón de remover
                const removeBtn = newOsc.querySelector('.remove-oscillator');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        newOsc.remove();
                        const newCount = parseInt(addOscBtn.dataset.oscCount) - 1;
                        addOscBtn.dataset.oscCount = String(newCount);
                        
                        addOscBtn.disabled = false;
                        const remaining = template.maxOscillators - newCount;
                        addOscBtn.innerHTML = `+ Agregar ${termName} (${remaining} disponibles)`;
                        
                        if (previewControls && previewControls.updatePreview) {
                            previewControls.updatePreview();
                        }
                    });
                }
                
                // Listeners para inputs del nuevo oscilador
                const newInputs = newOsc.querySelectorAll('.layer-param');
                newInputs.forEach(inp => {
                    inp.addEventListener('input', () => {
                        if (previewControls && previewControls.updatePreview) {
                            previewControls.updatePreview();
                        }
                    });
                });
                
                if (previewControls && previewControls.updatePreview) {
                    previewControls.updatePreview();
                }
            }
        });
        
        container.appendChild(addOscBtn);
        
        setTimeout(() => {
            const previewSection = container.querySelector('.equation-preview-split');
            if (previewSection) {
                const paramsSide = previewSection.querySelector('.params-side');
                if (paramsSide && !paramsSide.contains(addOscBtn)) {
                    paramsSide.appendChild(addOscBtn);
                }
            }
        }, 100);
    }
    
    return previewControls;
}

// ============================================================================
// FIN DE FUNCIONES DE INTERFAZ MEJORADA
// ============================================================================

function updateMediumFields(medium, modelType) {
    const paramsDiv = document.getElementById(`${medium}-params`);
    const fileDiv = document.getElementById(`${medium}-file-upload`);
    const customDiv = document.getElementById(`${medium}-custom-eq`);
    const constantField = document.getElementById(`${medium}-constant-field`);
    const fileHelp = document.getElementById(`${medium}-file-help`);
    
    paramsDiv.innerHTML = "";
    fileDiv.style.display = "none";
    customDiv.style.display = "none";
    if (constantField) constantField.style.display = "none";
    
    if (modelType === "constant") {
        if (constantField) constantField.style.display = "block";
    } else if (window.dispersionTemplates[modelType]) {
        // ⭐ USAR LA FUNCIÓN MEJORADA
        updateModelFieldsEnhanced(paramsDiv, modelType, `${medium}-`);
    } else if (modelType === "file_nk") {
        fileDiv.style.display = "block";
        fileHelp.textContent = "Archivo con columnas: wavelength (nm), n, k (k opcional)";
    } else if (modelType === "file_epsilon") {
        fileDiv.style.display = "block";
        fileHelp.textContent = "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2 — Se convertirá automáticamente a n,k";
    } else if (modelType === "custom") {
        customDiv.style.display = "block";
    } else if (modelType === "glass") {
        paramsDiv.innerHTML = `<div class="form-text">Glass: n = 1.52, k = 0 (valores típicos)</div>`;
    } else if (modelType === "si") {
        paramsDiv.innerHTML = `<div class="form-text">Silicon: Se usarán valores tabulados de Si</div>`;
    }
}

function updateSubstrateTypeInterface(type) {
    const homoConfig = document.getElementById('substrate-homo-config');
    const emtConfig = document.getElementById('substrate-emt-config');
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        const container = document.getElementById('substrate-emt-components');
        if (container.children.length === 0) {
            addMediumEMTComponent('substrate');
        }
    }
}

function updateAmbientTypeInterface(type) {
    const homoConfig = document.getElementById('ambient-homo-config');
    const emtConfig = document.getElementById('ambient-emt-config');
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        const container = document.getElementById('ambient-emt-components');
        if (container.children.length === 0) {
            addMediumEMTComponent('ambient');
        }
    }
}

function addMediumEMTComponent(medium) {
    const container = document.getElementById(`${medium}-emt-components`);
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 medium-emt-component bg-white shadow-sm';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-2">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-medium-component">✕ Eliminar</button>
        </div>

        <div class="row g-2">
            <div class="col-md-4">
                <label class="form-label small fw-bold">Nombre</label>
                <input class="form-control form-control-sm medium-component-name" 
                       value="Componente ${componentCount}" 
                       placeholder="Ej: SiO₂, Poros">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <div class="input-group input-group-sm">
                    <input class="form-control medium-component-fraction" 
                           type="number" min="0" max="1" step="0.01" value="0.5">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 medium-fraction-percent" type="checkbox">
                    </span>
                    <span class="input-group-text">%</span>
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo</label>
                <select class="form-select form-select-sm medium-component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude_lorentz">Drude-Lorentz</option>
                    <option value="file_nk">📁 Archivo n,k,λ</option>
                    <option value="file_epsilon">📁 Archivo ε₁,ε₂,ω</option>
                    <option value="custom">Ecuación personalizada</option>
                </select>
            </div>
        </div>

        <!-- ⭐ ÁREA PARA PARÁMETROS (interfaz mejorada se inserta aquí) -->
        <div class="row mt-3">
            <div class="col-12">
                <div class="medium-component-params"></div>
            </div>
        </div>

        <!-- Sección para archivos -->
        <div class="medium-component-file mt-2" style="display:none;">
            <label class="form-label small fw-bold">Archivo de datos ópticos</label>
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control form-control-sm medium-comp-file"/>
            <div class="form-text medium-component-file-help">Formato n,k,λ</div>
        </div>

        <!-- Sección para constante (n, k) -->
        <div class="medium-component-constant mt-2">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small fw-bold">n</label>
                    <input class="form-control form-control-sm medium-comp-n" 
                           type="number" step="0.001" value="1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold">k</label>
                    <input class="form-control form-control-sm medium-comp-k" 
                           type="number" step="0.001" value="0">
                </div>
            </div>
        </div>

        <!-- Sección para ecuación personalizada -->
        <div class="medium-component-custom mt-2" style="display:none;">
            <div class="alert alert-info small mb-2">
                <strong>📝 Ecuación personalizada</strong>
                <p class="mb-0">Define n(λ) para este componente</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-medium-comp-latex-btn">
                ✏️ Editar ecuación LaTeX
            </button>
            <div class="border rounded p-2 bg-light">
                <div class="latex-equation-display text-center">
                    <em class="text-muted small">No hay ecuación</em>
                </div>
                <input type="hidden" class="latex-equation-value" value="">
            </div>
        </div>
    `;
    
    container.appendChild(componentDiv);

    // ========== EVENT LISTENERS ==========
    
    // Botón eliminar
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
    });

    // Fracción volumétrica
    const fractionInput = componentDiv.querySelector('.medium-component-fraction');
    const percentCheckbox = componentDiv.querySelector('.medium-fraction-percent');

    fractionInput.addEventListener('input', () => updateMediumFractionSum(medium));
    percentCheckbox.addEventListener('change', () => {
        if (percentCheckbox.checked) {
            fractionInput.max = 100;
            fractionInput.step = 1;
        } else {
            fractionInput.max = 1;
            fractionInput.step = 0.01;
        }
    });

    // ⭐⭐⭐ FUNCIÓN INTERNA: Actualizar modelo de componente EMT ⭐⭐⭐
    function updateMediumComponentModel() {
        const model = this.value;
        const paramsDiv = componentDiv.querySelector('.medium-component-params');
        const fileDiv = componentDiv.querySelector('.medium-component-file');
        const constantDiv = componentDiv.querySelector('.medium-component-constant');
        const customDiv = componentDiv.querySelector('.medium-component-custom');
        
        // Ocultar todo
        paramsDiv.innerHTML = "";
        fileDiv.style.display = "none";
        constantDiv.style.display = "none";
        customDiv.style.display = "none";
        
        if (model === 'constant') {
            constantDiv.style.display = "block";
        } else if (model === 'custom') {
            customDiv.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            // ⭐ USAR INTERFAZ MEJORADA
            updateModelFieldsEnhanced(paramsDiv, model, `medium-comp-${componentCount}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileDiv.style.display = "block";
            const fileHelp = componentDiv.querySelector('.medium-component-file-help');
            if (fileHelp) {
                fileHelp.textContent = model === "file_epsilon" 
                    ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                    : "Archivo con columnas: wavelength (nm), n, k";
            }
        }
    }

    // Selectors
    const modelSelect = componentDiv.querySelector('.medium-component-model');
    
    // Event listener para cambio de modelo
    modelSelect.addEventListener("change", updateMediumComponentModel);
    
    // Inicializar modelo
    updateMediumComponentModel.call(modelSelect);
    
    // ⭐ EVENT LISTENER PARA ARCHIVO
    const componentFileInput = componentDiv.querySelector('.medium-comp-file');
    if (componentFileInput) {
        componentFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            console.log(`[${medium} - Componente ${componentCount}] Subiendo archivo: ${file.name}`);
            
            // Remover mensajes previos
            const prevMessages = componentFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
            prevMessages.forEach(msg => msg.remove());
            
            // Mostrar carga
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
            loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
            componentFileInput.after(loadingMsg);
            
            const formData = new FormData();
            formData.append('file', file);
            
            const currentModel = modelSelect.value;
            const fileType = currentModel === 'file_epsilon' ? 'epsilon' : 'nk';
            formData.append('file_type', fileType);
            
            try {
                const response = await fetch('/api/upload-optical-data', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                loadingMsg.remove();
                
                if (result.error || result.success === false) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>❌ Error al procesar archivo</strong>
                        <p class="mb-0">${result.error || 'Error desconocido'}</p>
                    `;
                    componentFileInput.after(errorDiv);
                    return;
                }
                
                if (!result.info || !result.data) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                    errorDiv.innerHTML = `<strong>⚠️ Respuesta incompleta del servidor</strong>`;
                    componentFileInput.after(errorDiv);
                    return;
                }
                
                const info = result.info;
                const warnings = result.warnings || [];
                
                console.log(`[${medium} - Comp ${componentCount}] Archivo procesado:`, info);
                
                // Validar rango
                if (uploadedWavelengths && uploadedWavelengths.length > 0) {
                    const materialWavelengths = result.data.wavelength;
                    const matMin = Math.min(...materialWavelengths);
                    const matMax = Math.max(...materialWavelengths);
                    const expMin = Math.min(...uploadedWavelengths);
                    const expMax = Math.max(...uploadedWavelengths);
                    
                    const coverageOk = (matMin <= expMin) && (matMax >= expMax);
                    
                    if (!coverageOk) {
                        warnings.push(
                            `El archivo de material (${matMin.toFixed(1)}-${matMax.toFixed(1)} nm) ` +
                            `NO cubre completamente el rango teórico (${expMin.toFixed(1)}-${expMax.toFixed(1)} nm).`
                        );
                    }
                }
                
                let warningsHTML = '';
                if (warnings.length > 0) {
                    warningsHTML = `
                        <div class="mt-2 pt-2 border-top">
                            <strong>⚠️ Advertencias:</strong>
                            <ul class="mb-0 small">
                                ${warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                const successDiv = document.createElement('div');
                successDiv.className = `alert ${warnings.length > 0 ? 'alert-warning' : 'alert-success'} mt-2 file-result-msg`;
                successDiv.innerHTML = `
                    <strong>✅ Archivo procesado</strong>
                    <ul class="mb-0 small mt-2">
                        <li><strong>Formato:</strong> ${info.format}</li>
                        <li><strong>Puntos:</strong> ${info.points}</li>
                        <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                        <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                        <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                    </ul>
                    ${warningsHTML}
                `;
                
                componentFileInput.after(successDiv);
                
                // Guardar datos
                componentDiv.dataset.opticalData = JSON.stringify(result.data);
                
                console.log(`[${medium} - Comp ${componentCount}] Archivo guardado (${info.points} puntos)`);
                
            } catch (error) {
                loadingMsg.remove();
                
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>❌ Error de conexión</strong>
                    <p class="mb-0">${error.message}</p>
                `;
                componentFileInput.after(errorDiv);
            }
        });
    }
    
    // ⭐ Listener para botón de ecuación personalizada
    const openLatexBtn = componentDiv.querySelector('.open-medium-comp-latex-btn');
    if (openLatexBtn) {
        openLatexBtn.addEventListener('click', () => {
            const componentId = `medium-comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const customDiv = componentDiv.querySelector('.medium-component-custom');
            customDiv.id = componentId;
            openLatexEditor(componentId);
        });
    }

    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
}

function updateMediumFractionSum(medium) {
    const sumDisplay = document.getElementById(`${medium}-fraction-sum`);
    const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
    
    let sum = 0;
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.medium-component-fraction');
        const isPercent = comp.querySelector('.medium-fraction-percent').checked;
        let value = parseFloat(fractionInput.value) || 0;
        
        if (isPercent) {
            value = value / 100;
        }
        
        sum += value;
    });

    sumDisplay.textContent = sum.toFixed(3);

    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
    } else {
        sumDisplay.style.color = 'red';
    }
}

function refreshMediumComponentTitles(container) {
    const components = container.querySelectorAll('.medium-emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

const layersContainer = document.getElementById("layers-container");
document.getElementById("add-layer").addEventListener("click", () => addLayer());

let layerCounter = 0;

function addLayer(prefill={}) {
    layerCounter++;
    const idx = layerCounter;
    const wrapper = document.createElement("div");
    wrapper.className = "card mb-3 p-3 layer-card";
    wrapper.dataset.idx = String(idx);

    wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="layer-title">Capa ${layersContainer.children.length + 1}</strong>
            <button class="btn btn-sm btn-outline-danger remove-layer">Eliminar</button>
        </div>

        <div class="layer-type-question">
            <label class="form-label fw-bold">Tipo de capa</label>
            <div class="btn-group w-100 mb-3" role="group">
                <input type="radio" class="btn-check" name="layerType${idx}" id="layerTypeHomo${idx}" value="homogeneous" checked>
                <label class="btn btn-outline-primary" for="layerTypeHomo${idx}">
                    <div class="fw-bold">Homogénea</div>
                    <small class="text-muted">Un solo material</small>
                </label>
                
                <input type="radio" class="btn-check" name="layerType${idx}" id="layerTypeHetero${idx}" value="heterogeneous">
                <label class="btn btn-outline-primary" for="layerTypeHetero${idx}">
                    <div class="fw-bold">Heterogénea (EMT)</div>
                    <small class="text-muted">Multi-componente/Porosa</small>
                </label>
            </div>
        </div>

        <div class="layer-basic-config" style="display:none;">
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <label class="form-label">Nombre de la capa</label>
                    <input class="form-control layer-name" value="${prefill.name || ('Capa ' + (layersContainer.children.length + 1))}">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Espesor (nm)</label>
                    <div class="input-group">
                        <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${prefill.thickness || 100}">
                        <span class="input-group-text">
                            <input class="form-check-input mt-0 layer-optimize" type="checkbox" title="Optimizar"/>
                        </span>
                    </div>
                    <div class="form-text">Marcar para optimizar este parámetro</div>
                </div>
            </div>
        </div>

        <div class="homogeneous-config" style="display:none;">
            <div class="card p-3 bg-light">
                <h6 class="mb-2">Configuración homogénea</h6>
                <div class="row g-2">
                    <div class="col-md-12">
                        <label class="form-label">Modelo de dispersión</label>
                        <select class="form-select layer-model">
                            <option value="cauchy" selected>Cauchy</option>
                            <option value="sellmeier">Sellmeier</option>
                            <option value="drude">Drude</option>
                            <option value="lorentz">Lorentz</option>
                            <option value="drude_lorentz">Drude-Lorentz</option>
                            <option value="constant">Constante</option>
                            <option value="file_nk">Archivo n,k,λ</option>
                            <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                            <option value="custom">Ecuación personalizada (LaTeX)</option>
                        </select>
                    </div>
                </div>

                <!-- ⭐ Área para parámetros con interfaz mejorada -->
                <div class="row g-2 mt-2">
                    <div class="col-12">
                        <div class="layer-params"></div>
                    </div>
                </div>

                <div class="layer-file-row mt-2" style="display:none;">
                    <label class="form-label small fw-bold">Archivo de datos ópticos</label>
                    <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control layer-file"/>
                    <div class="form-text layer-file-help">Archivo con columnas apropiadas</div>
                </div>

                <div class="layer-constant-row mt-2" style="display:none;">
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold">n</label>
                            <input class="form-control layer-n-const" type="number" step="0.001" value="1.5">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold">k</label>
                            <input class="form-control layer-k-const" type="number" step="0.001" value="0">
                        </div>
                    </div>
                </div>

                <div class="layer-custom-row mt-2" style="display:none;">
                    <div class="alert alert-info small mb-2">
                        <strong>📝 Ecuación personalizada</strong>
                        <p class="mb-0">Define tu propia ecuación para n en función de λ (nm)</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-latex-editor-btn">
                        ✏️ Editar ecuación LaTeX
                    </button>
                    <div id="layer-custom-${idx}" class="border rounded p-2 bg-light">
                        <div class="latex-equation-display text-center">
                            <em class="text-muted small">No hay ecuación definida</em>
                        </div>
                        <input type="hidden" class="latex-equation-value" value="">
                    </div>
                </div>
            </div>
        </div>

        <div class="heterogeneous-config" style="display:none;">
            <div class="card p-3 bg-light">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h6 class="mb-1">Configuración heterogénea (EMT)</h6>
                        <small class="text-muted">Defina los componentes de la mezcla</small>
                    </div>
                    <button class="btn btn-sm btn-outline-primary add-emt-component">+ Agregar Componente</button>
                </div>

                <div class="mb-3">
                    <label class="form-label">Modelo EMT</label>
                    <select class="form-select emt-model-select">
                        <option value="bruggeman" selected>Bruggeman</option>
                        <option value="maxwell-garnett">Maxwell-Garnett</option>
                    </select>
                    <div class="form-text">Bruggeman: mezclas simétricas. Maxwell-Garnett: matriz con inclusiones.</div>
                </div>

                <div class="emt-components-container"></div>

                <div class="alert alert-warning mt-3 mb-0" style="font-size: 0.9em;">
                    <strong>Importante:</strong> La suma de fracciones volumétricas debe ser exactamente 1.0
                    <div class="mt-2">
                        <strong>Suma actual: <span class="fraction-sum-display">0.000</span></strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    layersContainer.appendChild(wrapper);

    // ========== EVENT LISTENERS ==========
    
    const removeBtn = wrapper.querySelector(".remove-layer");
    removeBtn.addEventListener("click", () => { 
        wrapper.remove(); 
        refreshLayerTitles(); 
    });

    const typeRadios = wrapper.querySelectorAll('input[name="layerType' + idx + '"]');
    const basicConfig = wrapper.querySelector('.layer-basic-config');
    const homoConfig = wrapper.querySelector('.homogeneous-config');
    const heteroConfig = wrapper.querySelector('.heterogeneous-config');

    typeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const selectedType = wrapper.querySelector(`input[name="layerType${idx}"]:checked`).value;
            
            basicConfig.style.display = 'block';
            
            if (selectedType === 'homogeneous') {
                homoConfig.style.display = 'block';
                heteroConfig.style.display = 'none';
            } else {
                homoConfig.style.display = 'none';
                heteroConfig.style.display = 'block';
                
                const componentsContainer = wrapper.querySelector('.emt-components-container');
                if (componentsContainer.children.length === 0) {
                    addEMTComponent(wrapper);
                }
            }
        });
    });

    const checkedRadio = wrapper.querySelector(`input[name="layerType${idx}"]:checked`);
    if (checkedRadio) {
        checkedRadio.dispatchEvent(new Event('change'));
    }

    const modelSelect = wrapper.querySelector(".layer-model");
    const paramsDiv = wrapper.querySelector(".layer-params");
    const fileRow = wrapper.querySelector(".layer-file-row");
    const constantRow = wrapper.querySelector(".layer-constant-row");
    const customRow = wrapper.querySelector(".layer-custom-row");
    const fileHelp = wrapper.querySelector(".layer-file-help");

    // ⭐⭐⭐ FUNCIÓN MEJORADA updateLayerModel ⭐⭐⭐
    function updateLayerModel() {
        const model = modelSelect.value;
        fileRow.style.display = "none";
        constantRow.style.display = "none";
        customRow.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantRow.style.display = "block";
        } else if (model === 'custom') {
            customRow.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            // ⭐ USAR INTERFAZ MEJORADA
            updateModelFieldsEnhanced(paramsDiv, model, `layer-${idx}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileRow.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                : "Archivo con columnas: wavelength (nm), n, k";
        }
    }

    modelSelect.addEventListener("change", updateLayerModel);
    updateLayerModel();

    // ⭐⭐⭐ EVENT LISTENER PARA CARGA DE ARCHIVOS EN CAPAS HOMOGÉNEAS ⭐⭐⭐
    const layerFileInput = wrapper.querySelector('.layer-file');
    if (layerFileInput) {
        layerFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const layerName = wrapper.querySelector('.layer-name')?.value || 'Capa';
            
            console.log(`[${layerName}] Subiendo archivo: ${file.name}`);
            
            // Remover mensajes previos
            const prevMessages = layerFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
            prevMessages.forEach(msg => msg.remove());
            
            // Mostrar carga
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
            loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
            layerFileInput.after(loadingMsg);
            
            const formData = new FormData();
            formData.append('file', file);
            
            const currentModel = modelSelect.value;
            const fileType = currentModel === 'file_epsilon' ? 'epsilon' : 'nk';
            formData.append('file_type', fileType);
            
            try {
                const response = await fetch('/api/upload-optical-data', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                loadingMsg.remove();
                
                if (result.error || result.success === false) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>❌ Error al procesar archivo</strong>
                        <p class="mb-0">${result.error || 'Error desconocido'}</p>
                    `;
                    layerFileInput.after(errorDiv);
                    return;
                }
                
                if (!result.info || !result.data) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                    errorDiv.innerHTML = `<strong>⚠️ Respuesta incompleta del servidor</strong>`;
                    layerFileInput.after(errorDiv);
                    return;
                }
                
                const info = result.info;
                const warnings = result.warnings || [];
                
                console.log(`[${layerName}] Archivo procesado:`, info);
                
                // Validar rango con wavelengths teóricas
                if (uploadedWavelengths && uploadedWavelengths.length > 0) {
                    const materialWavelengths = result.data.wavelength;
                    const matMin = Math.min(...materialWavelengths);
                    const matMax = Math.max(...materialWavelengths);
                    const expMin = Math.min(...uploadedWavelengths);
                    const expMax = Math.max(...uploadedWavelengths);
                    
                    const coverageOk = (matMin <= expMin) && (matMax >= expMax);
                    
                    if (!coverageOk) {
                        warnings.push(
                            `El archivo de material (${matMin.toFixed(1)}-${matMax.toFixed(1)} nm) ` +
                            `NO cubre completamente el rango teórico (${expMin.toFixed(1)}-${expMax.toFixed(1)} nm). ` +
                            `Se requerirá extrapolación.`
                        );
                    }
                }
                
                let warningsHTML = '';
                if (warnings.length > 0) {
                    warningsHTML = `
                        <div class="mt-2 pt-2 border-top">
                            <strong>⚠️ Advertencias:</strong>
                            <ul class="mb-0 small">
                                ${warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                const successDiv = document.createElement('div');
                successDiv.className = `alert ${warnings.length > 0 ? 'alert-warning' : 'alert-success'} mt-2 file-result-msg`;
                successDiv.innerHTML = `
                    <strong>✅ Archivo procesado</strong>
                    <ul class="mb-0 small mt-2">
                        <li><strong>Formato:</strong> ${info.format}</li>
                        <li><strong>Puntos:</strong> ${info.points}</li>
                        <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                        <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                        <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                    </ul>
                    ${warningsHTML}
                `;
                
                layerFileInput.after(successDiv);
                
                // Guardar datos en el wrapper de la capa
                wrapper.dataset.opticalData = JSON.stringify(result.data);
                
                console.log(`[${layerName}] Archivo guardado (${info.points} puntos)`);
                
            } catch (error) {
                loadingMsg.remove();
                
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>❌ Error de conexión</strong>
                    <p class="mb-0">${error.message}</p>
                `;
                layerFileInput.after(errorDiv);
            }
        });
    }

    // ⭐ Listener para ecuación personalizada (LaTeX)
    const openLatexBtn = wrapper.querySelector('.open-latex-editor-btn');
    if (openLatexBtn) {
        openLatexBtn.addEventListener('click', () => {
            openLatexEditor(`layer-custom-${idx}`);
        });
    }

    // ⭐ Listener para agregar componentes EMT
    const addComponentBtn = wrapper.querySelector('.add-emt-component');
    addComponentBtn.addEventListener('click', () => {
        addEMTComponent(wrapper);
    });

    refreshLayerTitles();
}

function addEMTComponent(layerWrapper) {
    const componentsContainer = layerWrapper.querySelector('.emt-components-container');
    const componentCount = componentsContainer.children.length + 1;
    
    const compDiv = document.createElement('div');
    compDiv.className = 'card p-3 mb-3 emt-component bg-white shadow-sm';
    
    compDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-emt-component">✕ Eliminar</button>
        </div>

        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label small fw-bold">Nombre del componente</label>
                <input class="form-control component-name" value="Componente ${componentCount}" placeholder="Ej: SiO₂, Poros, Au">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <div class="input-group">
                    <input class="form-control component-fraction" type="number" min="0" max="1" step="0.01" value="0.5" placeholder="0.0 - 1.0">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 fraction-is-percent" type="checkbox" title="Usar porcentaje">
                    </span>
                    <span class="input-group-text">%</span>
                </div>
                <div class="form-text small">Decimal (0-1) o marcar para %</div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo de dispersión</label>
                <select class="form-select component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="custom">Modelo personalizado</option>
                    <option value="file_nk">📁 Archivo n,k,λ</option>
                    <option value="file_epsilon">📁 Archivo ε₁,ε₂,ω</option>
                </select>
            </div>
        </div>

        <!-- ÁREA PARA PARÁMETROS -->
        <div class="row mt-3">
            <div class="col-12">
                <div class="model-config-container">
                    <div class="component-params">
                        <!-- updateModelFieldsEnhanced insertará aquí la interfaz dividida -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección para archivos -->
        <div class="component-file-section mt-3" style="display:none;">
            <label class="form-label small fw-bold">
                Archivo de datos ópticos
                <button type="button" class="btn btn-sm btn-link p-0" 
                        data-bs-toggle="tooltip" 
                        data-bs-placement="top"
                        title="Formatos aceptados:&#10;• 3 columnas: λ(nm), n, k&#10;• 2 bloques: (λ,n) luego (λ,k)&#10;• Unidades: nm o μm (conversión automática)">
                    ℹ️
                </button>
            </label>
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control component-file"/>
            <div class="form-text component-file-help">
                Se aceptan archivos de refractiveindex.info sin modificación
            </div>
        </div>

        <!-- Sección para constante (n, k) -->
        <div class="component-constant-section mt-3">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small fw-bold">Índice de refracción (n)</label>
                    <input class="form-control component-n" type="number" step="0.001" value="1.5" placeholder="ej: 1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold">Coeficiente de extinción (k)</label>
                    <input class="form-control component-k" type="number" step="0.001" value="0" placeholder="ej: 0">
                </div>
            </div>
        </div>

        <!-- Sección para ecuación personalizada -->
        <div class="component-custom-section mt-3" style="display:none;">
            <div class="alert alert-info small mb-2">
                <strong>📝 Ecuación personalizada</strong>
                <p class="mb-0">Define tu propia ecuación para n en función de λ (nm)</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-component-latex-editor">
                ✏️ Editar ecuación LaTeX
            </button>
            <div class="border rounded p-2 bg-light">
                <div class="latex-equation-display text-center">
                    <em class="text-muted small">No hay ecuación definida</em>
                </div>
                <input type="hidden" class="latex-equation-value" value="">
            </div>
        </div>
    `;
    
    componentsContainer.appendChild(compDiv);

    // ========== EVENT LISTENERS ==========
    
    // Botón eliminar
    const removeBtn = compDiv.querySelector('.remove-emt-component');
    removeBtn.addEventListener('click', () => {
        compDiv.remove();
        refreshComponentTitles(componentsContainer);
        updateFractionSum(layerWrapper);
    });

    // Fracción volumétrica
    const fractionInput = compDiv.querySelector('.component-fraction');
    const percentCheckbox = compDiv.querySelector('.fraction-is-percent');

    fractionInput.addEventListener('input', () => updateFractionSum(layerWrapper));
    percentCheckbox.addEventListener('change', () => {
        if (percentCheckbox.checked) {
            fractionInput.max = 100;
            fractionInput.step = 1;
            fractionInput.placeholder = "0 - 100";
        } else {
            fractionInput.max = 1;
            fractionInput.step = 0.01;
            fractionInput.placeholder = "0.0 - 1.0";
        }
    });

    // MODELO DE DISPERSIÓN
    const modelSelect = compDiv.querySelector('.component-model');
    const paramsDiv = compDiv.querySelector('.component-params');
    const fileSection = compDiv.querySelector('.component-file-section');
    const constantSection = compDiv.querySelector('.component-constant-section');
    const customSection = compDiv.querySelector('.component-custom-section');
    const fileHelp = compDiv.querySelector('.component-file-help');
    const componentFileInput = compDiv.querySelector('.component-file');

    function updateComponentModel() {
        const model = modelSelect.value;
        fileSection.style.display = "none";
        constantSection.style.display = "none";
        customSection.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantSection.style.display = "block";
        } else if (model === 'custom') {
            customSection.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `comp${componentCount}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileSection.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                : "Archivo con columnas: wavelength (nm), n, k";
        }
    }

    modelSelect.addEventListener("change", updateComponentModel);
    updateComponentModel();

    // ⭐⭐⭐ EVENT LISTENER CORREGIDO PARA CARGA DE ARCHIVOS EN COMPONENTES EMT ⭐⭐⭐
    if (componentFileInput) {
        componentFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Obtener info de la capa para logs
            const layerName = layerWrapper.querySelector('.layer-name')?.value || 'Capa';
            const layerIdx = layerWrapper.dataset.idx || '?';
            
            console.log(`📤 [${layerName} - Componente EMT ${componentCount}] Subiendo archivo: ${file.name}`);
            
            // Remover mensajes previos
            const prevMessages = componentFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
            prevMessages.forEach(msg => msg.remove());
            
            // Mostrar mensaje de carga
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
            loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
            componentFileInput.after(loadingMsg);
            
            const formData = new FormData();
            formData.append('file', file);
            
            const currentModel = modelSelect.value;
            const fileType = currentModel === 'file_epsilon' ? 'epsilon' : 'nk';
            formData.append('file_type', fileType);
            
            try {
                const response = await fetch('/api/upload-optical-data', {
                    method: 'POST',
                    body: formData
                });
                
                console.log(`📥 [${layerName} - Comp ${componentCount}] Respuesta: status=${response.status}`);
                
                const result = await response.json();
                console.log(`📊 [${layerName} - Comp ${componentCount}] Resultado:`, result);
                
                // Remover mensaje de carga
                loadingMsg.remove();
                
                // ⭐⭐⭐ CORRECCIÓN CRÍTICA ⭐⭐⭐
                if (result.error || result.success === false) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>❌ Error al procesar archivo</strong>
                        <p class="mb-0">${result.error || 'Error desconocido al procesar el archivo'}</p>
                    `;
                    componentFileInput.after(errorDiv);
                    console.error(`❌ [${layerName} - Comp ${componentCount}] Error:`, result.error);
                    return;
                }
                
                // Verificar que existan los campos esperados
                if (!result.info || !result.data) {
                    console.error(`⚠️ [${layerName} - Comp ${componentCount}] Respuesta incompleta:`, result);
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>⚠️ Respuesta incompleta</strong>
                        <p class="mb-0">El servidor no devolvió la información esperada</p>
                    `;
                    componentFileInput.after(errorDiv);
                    return;
                }
                
                const info = result.info;
                const warnings = result.warnings || [];
                
                console.log(`✅ [${layerName} - Comp ${componentCount}] Archivo procesado:`, info);
                
                // ⭐ VALIDAR RANGO CON DATOS EXPERIMENTALES
                if (uploadedWavelengths && uploadedWavelengths.length > 0) {
                    console.log(`🔍 [${layerName} - Comp ${componentCount}] Validando rango...`);
                    
                    const materialWavelengths = result.data.wavelength;
                    const matMin = Math.min(...materialWavelengths);
                    const matMax = Math.max(...materialWavelengths);
                    const expMin = Math.min(...uploadedWavelengths);
                    const expMax = Math.max(...uploadedWavelengths);
                    
                    const coverageOk = (matMin <= expMin) && (matMax >= expMax);
                    
                    console.log(`📊 [${layerName} - Comp ${componentCount}] Rangos:`);
                    console.log(`  Material: [${matMin.toFixed(1)}, ${matMax.toFixed(1)}] nm`);
                    console.log(`  Experimental: [${expMin.toFixed(1)}, ${expMax.toFixed(1)}] nm`);
                    console.log(`  Cobertura: ${coverageOk ? '✅ OK' : '❌ INSUFICIENTE'}`);
                    
                    if (!coverageOk) {
                        warnings.push(
                            `El archivo de material (${matMin.toFixed(1)}-${matMax.toFixed(1)} nm) ` +
                            `NO cubre completamente el rango experimental (${expMin.toFixed(1)}-${expMax.toFixed(1)} nm). ` +
                            `Los puntos fuera del rango requerirán EXTRAPOLACIÓN, lo cual puede afectar la precisión.`
                        );
                    }
                } else {
                    console.log(`⚠️ [${layerName} - Comp ${componentCount}] No hay datos experimentales para validar`);
                }
                
                // Construir mensaje de éxito
                const successDiv = document.createElement('div');
                successDiv.className = `alert ${warnings.length > 0 ? 'alert-warning' : 'alert-success'} mt-2 file-result-msg`;
                
                let warningsHTML = '';
                if (warnings.length > 0) {
                    warningsHTML = `
                        <div class="mt-2 pt-2 border-top">
                            <strong>⚠️ Advertencias:</strong>
                            <ul class="mb-0 small">
                                ${warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                successDiv.innerHTML = `
                    <strong>✅ Archivo procesado exitosamente</strong>
                    <ul class="mb-0 small mt-2">
                        <li><strong>Formato:</strong> ${info.format}</li>
                        <li><strong>Puntos de datos:</strong> ${info.points}</li>
                        <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                        <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                        <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                        ${info.units_converted ? `<li><strong>Conversión:</strong> ${info.units_converted}</li>` : ''}
                    </ul>
                    ${warningsHTML}
                `;
                
                componentFileInput.after(successDiv);
                
                // Guardar datos en el componente
                compDiv.dataset.opticalData = JSON.stringify(result.data);
                
                console.log(`✅ [${layerName} - Comp ${componentCount}] Archivo ${file.name} guardado (${info.points} puntos)`);
                
            } catch (error) {
                loadingMsg.remove();
                
                console.error(`❌ [${layerName} - Comp ${componentCount}] Error de conexión:`, error);
                
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>❌ Error de conexión</strong>
                    <p class="mb-0">${error.message}</p>
                `;
                componentFileInput.after(errorDiv);
            }
        });
    }

    // Listener para botón de ecuación personalizada
    const openLatexBtn = compDiv.querySelector('.open-component-latex-editor');
    if (openLatexBtn) {
        openLatexBtn.addEventListener('click', () => {
            // Generar ID único para este componente
            const uniqueId = `component-custom-${layerWrapper.dataset.idx}-${componentCount}`;
            
            // Guardar referencia temporal
            const customSection = compDiv.querySelector('.component-custom-section');
            customSection.id = uniqueId;
            
            // Abrir editor
            openLatexEditor(uniqueId);
        });
    }

    refreshComponentTitles(componentsContainer);
    updateFractionSum(layerWrapper);
}

function updateFractionSum(layerWrapper) {
    const sumDisplay = layerWrapper.querySelector('.fraction-sum-display');
    const components = layerWrapper.querySelectorAll('.emt-component');
    
    let sum = 0;
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.component-fraction');
        const isPercent = comp.querySelector('.fraction-is-percent').checked;
        let value = parseFloat(fractionInput.value) || 0;
        
        if (isPercent) {
            value = value / 100;
        }
        
        sum += value;
    });

    sumDisplay.textContent = sum.toFixed(3);

    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
        sumDisplay.parentElement.parentElement.classList.remove('alert-warning');
        sumDisplay.parentElement.parentElement.classList.add('alert-success');
    } else {
        sumDisplay.style.color = 'red';
        sumDisplay.parentElement.parentElement.classList.remove('alert-success');
        sumDisplay.parentElement.parentElement.classList.add('alert-warning');
    }
}

function refreshComponentTitles(container) {
    const components = container.querySelectorAll('.emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

function refreshLayerTitles() {
    [...layersContainer.children].forEach((c, i) => {
        const title = c.querySelector(".layer-title");
        if (title) title.innerText = `Capa ${i + 1}`;
    });
}

function validateStep(step) {
    wizardError.style.display = "none";
    
    // Nota: Ya no validamos ángulo/polarización/wavelengths aquí
    // porque se ingresan en el panel izquierdo antes de abrir el wizard
    
    if (step === 1) {
        // Validar AMBIENTE
        const ambientType = document.querySelector('input[name="ambient-type"]:checked')?.value;
        
        if (ambientType === 'emt') {
            const ambientSum = parseFloat(document.getElementById('ambient-fraction-sum').textContent);
            if (Math.abs(ambientSum - 1.0) > 0.01) {
                wizardError.innerText = `La suma de fracciones del ambiente debe ser 1.0 (actual: ${ambientSum.toFixed(3)})`;
                wizardError.style.display = "block";
                return false;
            }
            
            const ambientComponents = document.querySelectorAll('#ambient-emt-components .medium-emt-component');
            if (ambientComponents.length < 2) {
                wizardError.innerText = "El ambiente heterogéneo debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
                return false;
            }
        } else {
            const ambientModel = document.getElementById("ambient-model").value;
            if (ambientModel === "file_nk" || ambientModel === "file_epsilon") {
                const file = document.getElementById("ambient-file").files[0];
                if (!file) {
                    wizardError.innerText = "Debe seleccionar un archivo para el ambiente.";
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
        
        // Validar SUSTRATO
        const substrateType = document.querySelector('input[name="substrate-type"]:checked')?.value;
        
        if (substrateType === 'emt') {
            const substrateSum = parseFloat(document.getElementById('substrate-fraction-sum').textContent);
            if (Math.abs(substrateSum - 1.0) > 0.01) {
                wizardError.innerText = `La suma de fracciones del sustrato debe ser 1.0 (actual: ${substrateSum.toFixed(3)})`;
                wizardError.style.display = "block";
                return false;
            }
            
            const substrateComponents = document.querySelectorAll('#substrate-emt-components .medium-emt-component');
            if (substrateComponents.length < 2) {
                wizardError.innerText = "El sustrato heterogéneo debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
                return false;
            }
        } else {
            const substrateModel = document.getElementById("substrate-model").value;
            if (substrateModel === "file_nk" || substrateModel === "file_epsilon") {
                const file = document.getElementById("substrate-file").files[0];
                if (!file) {
                    wizardError.innerText = "Debe seleccionar un archivo para el sustrato.";
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
    }

    if (step === 2) {
        const layers = layersContainer.querySelectorAll('.layer-card');
        for (let layer of layers) {
            const basicConfig = layer.querySelector('.layer-basic-config');
            if (basicConfig.style.display === 'none') {
                wizardError.innerText = "Debes seleccionar el tipo de capa (homogénea o heterogénea)";
                wizardError.style.display = "block";
                return false;
            }

            const layerType = layer.querySelector('input[type="radio"]:checked')?.value;
            const layerName = layer.querySelector('.layer-name').value;
            
            if (layerType === 'heterogeneous') {
                const sumText = layer.querySelector('.fraction-sum-display').textContent;
                const sum = parseFloat(sumText);
                
                if (Math.abs(sum - 1.0) > 0.01) {
                    wizardError.innerText = `La suma de fracciones en "${layerName}" debe ser 1.0 (actual: ${sum.toFixed(3)})`;
                    wizardError.style.display = "block";
                    return false;
                }

                const components = layer.querySelectorAll('.emt-component');
                if (components.length < 2) {
                    wizardError.innerText = `La capa heterogénea "${layerName}" debe tener al menos 2 componentes.`;
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
    }
    
    return true;
}

function updateModelSummary() {
    const summaryDiv = document.getElementById("model-summary");
    const contentDiv = document.getElementById("model-summary-content");
    
    if (layersContainer.children.length === 0) {
        summaryDiv.style.display = "none";
        return;
    }
    
    summaryDiv.style.display = "block";
    
    let html = '<table class="table table-sm table-bordered"><thead><tr>';
    html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Tipo</th><th>Optimizar</th>';
    html += '</tr></thead><tbody>';
    
    [...layersContainer.children].forEach((layer, i) => {
        const name = layer.querySelector(".layer-name").value;
        const thickness = layer.querySelector(".layer-thickness").value;
        const layerType = layer.querySelector('input[type="radio"]:checked')?.value || 'No definido';
        const optimize = layer.querySelector(".layer-optimize").checked;
        
        const typeText = layerType === 'homogeneous' ? 'Homogénea' : 
                        layerType === 'heterogeneous' ? 'Heterogénea (EMT)' : 
                        'No definido';
        
        html += `<tr>
            <td>${i + 1}</td>
            <td>${name}</td>
            <td>${thickness}</td>
            <td>${typeText}</td>
            <td>${optimize ? 'Sí' : 'No'}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    contentDiv.innerHTML = html;
}

async function collectMediumData(medium) {
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio && typeRadio.value === 'emt';
    
    if (isEMT) {
        const data = {
            type: 'emt',
            emt_model: document.getElementById(`${medium}-emt-model`).value,
            components: []
        };
        
        const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
        
        for (const compEl of components) {
            const compData = {};
            compData.name = compEl.querySelector('.medium-component-name').value;
            
            let fraction = Number(compEl.querySelector('.medium-component-fraction').value);
            const isPercent = compEl.querySelector('.medium-fraction-percent').checked;
            if (isPercent) {
                fraction = fraction / 100;
            }
            compData.fraction = fraction;

            const model = compEl.querySelector('.medium-component-model').value;
            compData.model = model;

            if (model === 'constant') {
                compData.n = Number(compEl.querySelector('.medium-comp-n').value);
                compData.k = Number(compEl.querySelector('.medium-comp-k').value);
            } else if (model === 'custom') {
                const equationInput = compEl.querySelector('.medium-component-custom .latex-equation-value');
                compData.equation = equationInput ? equationInput.value : '';
            } else if (window.dispersionTemplates[model]) {
                // ⭐⭐⭐ RECOLECCIÓN MEJORADA ⭐⭐⭐
                compData.params = {};
                const inputs = compEl.querySelectorAll('.layer-param');
                inputs.forEach(inp => {
                    const paramName = inp.dataset.param;
                    const val = inp.value.trim();
                    if (paramName && val !== '') {
                        compData.params[paramName] = Number(val);
                    }
                });
                console.log(`[${medium} - ${compData.name}] Parámetros:`, compData.params);
            } else if (model === "file_nk" || model === "file_epsilon") {
                // Intentar usar cache primero
                const cachedData = compEl.dataset.opticalData;
                if (cachedData) {
                    try {
                        compData.optical_data = JSON.parse(cachedData);
                        compData.file_type = model === "file_epsilon" ? "epsilon" : "nk";
                    } catch (e) {
                        console.error("Error al parsear cache:", e);
                    }
                } else {
                    const file = compEl.querySelector('.medium-comp-file').files[0];
                    if (file) {
                        compData.file_name = file.name;
                        compData.file_type = model === "file_epsilon" ? "epsilon" : "nk";
                        
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("file_type", compData.file_type);
                        
                        try {
                            const response = await fetch("/api/upload-optical-data", {
                                method: "POST",
                                body: formData
                            });
                            const result = await response.json();
                            if (result.error) {
                                throw new Error(result.error);
                            }
                            compData.optical_data = result.data;
                        } catch (e) {
                            console.error("Error uploading medium component optical data:", e);
                        }
                    }
                }
            }

            data.components.push(compData);
        }
        
        return data;
    } else {
        const modelType = document.getElementById(`${medium}-model`).value;
        const data = { type: modelType };
        
        if (modelType === "constant") {
            data.n = Number(document.getElementById(`${medium}-n-constant`).value);
            data.k = Number(document.getElementById(`${medium}-k-constant`).value) || 0;
        } else if (window.dispersionTemplates[modelType]) {
            // ⭐⭐⭐ RECOLECCIÓN MEJORADA PARA MEDIOS ⭐⭐⭐
            data.params = {};
            const inputs = document.querySelectorAll(`#${medium}-params .layer-param`);
            inputs.forEach(inp => {
                const paramName = inp.dataset.param;
                const val = inp.value.trim();
                if (paramName && val !== '') {
                    data.params[paramName] = Number(val);
                }
            });
            console.log(`[${medium}] Parámetros:`, data.params);
        } else if (modelType === "file_nk" || modelType === "file_epsilon") {
            // Intentar usar cache
            const fileInput = document.getElementById(`${medium}-file`);
            const cachedData = fileInput?.dataset.opticalData;
            
            if (cachedData) {
                try {
                    data.optical_data = JSON.parse(cachedData);
                    data.file_type = modelType === "file_epsilon" ? "epsilon" : "nk";
                } catch (e) {
                    console.error("Error al parsear cache:", e);
                }
            } else {
                const file = document.getElementById(`${medium}-file`).files[0];
                if (file) {
                    data.file_name = file.name;
                    data.file_type = modelType === "file_epsilon" ? "epsilon" : "nk";
                    
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("file_type", data.file_type);
                    
                    try {
                        const response = await fetch("/api/upload-optical-data", {
                            method: "POST",
                            body: formData
                        });
                        const result = await response.json();
                        if (result.error) {
                            throw new Error(result.error);
                        }
                        data.optical_data = result.data;
                    } catch (e) {
                        console.error("Error uploading optical data:", e);
                    }
                }
            }
        } else if (modelType === "custom") {
            const equationInput = document.querySelector(`#${medium}-custom-eq .latex-equation-value`);
            data.equation = equationInput ? equationInput.value : '';
            if (!data.equation) {
                console.warn("Ecuación personalizada vacía en", medium);
            }
        } else if (modelType === "glass") {
            data.n = 1.52;
            data.k = 0;
        } else if (modelType === "si") {
            data.material = "silicon";
        }
        
        return data;
    }
}

// ============================================================================
// ⭐ FUNCIÓN: Recolectar datos de una capa (MEJORADA)
// ============================================================================
async function collectLayerData(layerElement) {
    const data = {};
    data.name = layerElement.querySelector(".layer-name").value;
    data.thickness = Number(layerElement.querySelector(".layer-thickness").value);
    data.optimize_thickness = layerElement.querySelector(".layer-optimize").checked;
    
    const layerType = layerElement.querySelector('input[type="radio"]:checked').value;
    data.layer_type = layerType;

    if (layerType === 'homogeneous') {
        data.model = layerElement.querySelector(".layer-model").value;
        
        if (data.model === 'constant') {
            data.n = Number(layerElement.querySelector(".layer-n-const").value);
            data.k = Number(layerElement.querySelector(".layer-k-const").value);
        } 
        else if (data.model === 'custom') {
            const equationInput = layerElement.querySelector(".layer-custom-row .latex-equation-value");
            data.equation = equationInput ? equationInput.value : '';
            if (!data.equation) {
                console.warn("⚠️ Ecuación personalizada vacía en capa", data.name);
            }
        } 
        else if (window.dispersionTemplates[data.model]) {
            // ⭐⭐⭐ RECOLECTAR PARÁMETROS DE LA INTERFAZ MEJORADA ⭐⭐⭐
            data.params = {};
            
            // Buscar todos los inputs con clase 'layer-param'
            const inputs = layerElement.querySelectorAll(".layer-param");
            
            inputs.forEach(inp => {
                const paramName = inp.dataset.param;
                const val = inp.value.trim();
                
                if (paramName && val !== '') {
                    data.params[paramName] = Number(val);
                }
            });
            
            // ⭐ OPCIONAL: Recolectar flags de optimización
            const optimizeCheckboxes = layerElement.querySelectorAll(".optimize-param");
            data.optimize_params = {};
            
            optimizeCheckboxes.forEach(checkbox => {
                const paramName = checkbox.dataset.param;
                if (paramName) {
                    data.optimize_params[paramName] = checkbox.checked;
                }
            });
            
            console.log(`[${data.name}] Parámetros recolectados:`, data.params);
        } 
        else if (data.model === "file_nk" || data.model === "file_epsilon") {
            // ⭐ INTENTAR OBTENER DATOS DEL DATASET PRIMERO
            const opticalDataFromDataset = layerElement.dataset.opticalData;
            
            if (opticalDataFromDataset) {
                // Datos ya fueron cargados previamente
                try {
                    data.optical_data = JSON.parse(opticalDataFromDataset);
                    data.file_name = "cached_file";
                    data.file_type = data.model === "file_epsilon" ? "epsilon" : "nk";
                    console.log(`[${data.name}] Usando datos ópticos del cache`);
                } catch (e) {
                    console.error(`[${data.name}] Error al parsear datos del cache:`, e);
                }
            } else {
                // Intentar subir el archivo ahora
                const file = layerElement.querySelector(".layer-file").files[0];
                if (file) {
                    data.file_name = file.name;
                    data.file_type = data.model === "file_epsilon" ? "epsilon" : "nk";
                    
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("file_type", data.file_type);
                    
                    try {
                        console.log(`[${data.name}] Subiendo archivo: ${file.name}`);
                        
                        const response = await fetch("/api/upload-optical-data", {
                            method: "POST",
                            body: formData
                        });
                        
                        const result = await response.json();
                        
                        if (result.error) {
                            throw new Error(result.error);
                        }
                        
                        data.optical_data = result.data;
                        console.log(`[${data.name}] Archivo subido exitosamente`);
                        
                    } catch (e) {
                        console.error(`[${data.name}] Error al subir archivo:`, e);
                        throw new Error(`Error al subir archivo de capa "${data.name}": ${e.message}`);
                    }
                } else {
                    console.warn(`[${data.name}] No se encontró archivo para modelo ${data.model}`);
                }
            }
        }
    } 
    else if (layerType === 'heterogeneous') {
        data.layer_type = 'emt';
        data.emt_model = layerElement.querySelector('.emt-model-select').value;
        data.components = [];

        const components = layerElement.querySelectorAll('.emt-component');
        
        for (const compEl of components) {
            const compData = {};
            compData.name = compEl.querySelector('.component-name').value;
            
            let fraction = Number(compEl.querySelector('.component-fraction').value);
            const isPercent = compEl.querySelector('.fraction-is-percent').checked;
            if (isPercent) {
                fraction = fraction / 100;
            }
            compData.fraction = fraction;

            const model = compEl.querySelector('.component-model').value;
            compData.model = model;

            if (model === 'constant') {
                compData.n = Number(compEl.querySelector('.component-n').value);
                compData.k = Number(compEl.querySelector('.component-k').value);
            } 
            else if (model === 'custom') {
                const equationInput = compEl.querySelector('.component-custom-section .latex-equation-value');
                compData.equation = equationInput ? equationInput.value : '';
            } 
            else if (window.dispersionTemplates[model]) {
                // ⭐⭐⭐ RECOLECTAR PARÁMETROS DE COMPONENTE EMT ⭐⭐⭐
                compData.params = {};
                
                // Buscar todos los inputs con clase 'layer-param' dentro del componente
                const inputs = compEl.querySelectorAll('.layer-param');
                
                inputs.forEach(inp => {
                    const paramName = inp.dataset.param;
                    const val = inp.value.trim();
                    
                    if (paramName && val !== '') {
                        compData.params[paramName] = Number(val);
                    }
                });
                
                console.log(`[${data.name} - ${compData.name}] Parámetros EMT:`, compData.params);
            } 
            else if (model === "file_nk" || model === "file_epsilon") {
                // ⭐ INTENTAR OBTENER DATOS DEL DATASET DEL COMPONENTE
                const opticalDataFromDataset = compEl.dataset.opticalData;
                
                if (opticalDataFromDataset) {
                    try {
                        compData.optical_data = JSON.parse(opticalDataFromDataset);
                        compData.file_name = "cached_file";
                        compData.file_type = model === "file_epsilon" ? "epsilon" : "nk";
                        console.log(`[${data.name} - ${compData.name}] Usando datos del cache`);
                    } catch (e) {
                        console.error(`[${data.name} - ${compData.name}] Error al parsear cache:`, e);
                    }
                } else {
                    const file = compEl.querySelector('.component-file').files[0];
                    if (file) {
                        compData.file_name = file.name;
                        compData.file_type = model === "file_epsilon" ? "epsilon" : "nk";
                        
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("file_type", compData.file_type);
                        
                        try {
                            console.log(`[${data.name} - ${compData.name}] Subiendo archivo: ${file.name}`);
                            
                            const response = await fetch("/api/upload-optical-data", {
                                method: "POST",
                                body: formData
                            });
                            
                            const result = await response.json();
                            
                            if (result.error) {
                                throw new Error(result.error);
                            }
                            
                            compData.optical_data = result.data;
                            console.log(`[${data.name} - ${compData.name}] Archivo subido`);
                            
                        } catch (e) {
                            console.error(`[${data.name} - ${compData.name}] Error:`, e);
                            throw new Error(`Error en componente "${compData.name}": ${e.message}`);
                        }
                    }
                }
            }

            data.components.push(compData);
        }
    }
    
    return data;
}

async function collectOpticalModelData() {
    const model = { 
        global: {}, 
        ambient: {}, 
        substrate: {}, 
        layers: [],
        created_at: new Date().toISOString()
    };
    
    // Leer datos del panel izquierdo, NO del wizard
    model.global.angle = Number(document.getElementById("theoretical-angle").value);
    
    // Leer polarización del panel izquierdo
    const polRadio = document.querySelector('input[name="theoretical-polarization"]:checked');
    model.global.polarization = polRadio ? polRadio.value : 'both';
    
    // Leer wavelengths del panel izquierdo
    const wlMethodSelect = document.getElementById("theoretical-wavelength-method");
    const wlMode = wlMethodSelect ? wlMethodSelect.value : "range";
    model.global.wavelength_mode = wlMode;
    
    if (wlMode === "range") {
        model.global.wl_from = Number(document.getElementById("theoretical-wl-from").value);
        model.global.wl_to = Number(document.getElementById("theoretical-wl-to").value);
        model.global.wl_steps = Number(document.getElementById("theoretical-wl-steps").value);
    } else if (wlMode === "single") {
        model.global.wl_single = Number(document.getElementById("theoretical-wl-single").value);
    }

    model.ambient = await collectMediumData('ambient');
    model.substrate = await collectMediumData('substrate');

    for (const layerEl of layersContainer.children) {
        const layerData = await collectLayerData(layerEl);
        model.layers.push(layerData);
    }

    return model;
}

wizardSaveBtn.addEventListener("click", async () => {
    wizardSaveBtn.disabled = true;
    wizardSaveBtn.innerText = "Guardando...";
    
    try {
        const model = { 
            global: {}, 
            ambient: {}, 
            substrate: {}, 
            layers: [],
            created_at: new Date().toISOString()
        };
        
        model.global.angle = Number(document.getElementById("input-angle").value);
        model.global.polarization = document.getElementById("input-polarization").value;
        
        const wlMode = document.querySelector('input[name="wl-option"]:checked').value;
        model.global.wavelength_mode = wlMode;
        
        if (wlMode === "range") {
            model.global.wl_from = Number(document.getElementById("input-wl-from").value);
            model.global.wl_to = Number(document.getElementById("input-wl-to").value);
            model.global.wl_steps = Number(document.getElementById("input-wl-steps").value);
        } else if (wlMode === "single") {
            model.global.wl_single = Number(document.getElementById("input-wl-single").value);
        } else if (wlMode === "file") {
            model.global.wavelengths = uploadedWavelengths;
        }

        model.ambient = await collectMediumData('ambient');
        model.substrate = await collectMediumData('substrate');

        for (const layerEl of layersContainer.children) {
            const layerData = await collectLayerData(layerEl);
            model.layers.push(layerData);
        }

        const response = await fetch("/api/save-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(model)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        savedModel = model;
        savedModel.filename = result.filename;
        
        modelWizardModal.hide();
        
        // ⭐ NUEVO: Actualizar el banner con información detallada
        updateModelSavedBanner(savedModel, result.filename);
        
        console.log("✓ Modelo guardado exitosamente:", result.filename);
        
    } catch (error) {
        wizardError.innerText = "Error al guardar: " + error.message;
        wizardError.style.display = "block";
    } finally {
        wizardSaveBtn.disabled = false;
        wizardSaveBtn.innerText = "Guardar modelo";
    }
});

// ==========================================
// FUNCIÓN: Actualizar banner después de guardar modelo
// ==========================================
function updateModelSavedBanner(model, filename) {
    const banner = document.getElementById("model-saved-banner");
    
    // Calcular información del modelo
    const layersCount = model.layers.length;
    let wlInfo = "";
    
    if (model.global.wavelength_mode === 'file') {
        const wlCount = model.global.wavelengths ? model.global.wavelengths.length : 0;
        const wlMin = wlCount > 0 ? Math.min(...model.global.wavelengths).toFixed(1) : 0;
        const wlMax = wlCount > 0 ? Math.max(...model.global.wavelengths).toFixed(1) : 0;
        wlInfo = `${wlCount} puntos (${wlMin}-${wlMax} nm)`;
    } else if (model.global.wavelength_mode === 'range') {
        wlInfo = `${model.global.wl_steps} puntos (${model.global.wl_from}-${model.global.wl_to} nm)`;
    } else if (model.global.wavelength_mode === 'single') {
        wlInfo = `${model.global.wl_single} nm`;
    }
    
    const angle = model.global.angle;
    
    // Actualizar HTML del banner
    banner.innerHTML = `
        <div class="alert alert-success" style="margin: 0;">
            <h6 class="mb-2">✓ Modelo óptico guardado correctamente</h6>
            <p class="mb-2 small"><strong>Archivo:</strong> ${filename}</p>
            <p class="mb-3 small">
                <strong>Configuración:</strong> ${layersCount} capas, ${wlInfo}, ángulo ${angle}°
            </p>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" id="view-model-summary-btn">
                    Ver resumen del modelo
                </button>
                <button class="btn btn-sm btn-success" id="calculate-theoretical-btn">
                    Calcular Psi y Delta teóricos
                </button>
            </div>
        </div>
    `;
    
    banner.style.display = "block";
    
    // Event listener para "Ver resumen"
    document.getElementById("view-model-summary-btn").addEventListener("click", () => {
        if (savedModel) {
            showModelSummaryModal(savedModel);
        }
    });
    
    // ⭐ Event listener para "Calcular teóricos"
    document.getElementById("calculate-theoretical-btn").addEventListener("click", () => {
        calculateTheoreticalPsiDelta();
    });
}

// ==========================================
// FUNCIÓN: Calcular Psi y Delta teóricos
// ==========================================
async function calculateTheoreticalPsiDelta() {
    try {
        console.log("=".repeat(60));
        console.log("INICIO CÁLCULO DE PSI Y DELTA TEÓRICOS");
        console.log("=".repeat(60));
        
        // 1. Verificar que existe el modelo guardado
        if (!savedModel) {
            alert("Error: No hay un modelo óptico guardado. Por favor, guarde el modelo primero.");
            return;
        }
        
        // 2. Verificar que existen datos experimentales
        if (!currentData || !uploadedFileData || uploadedFileData.length === 0) {
            alert("Error: No hay datos experimentales cargados. Por favor, suba un archivo con datos experimentales primero.");
            return;
        }
        
        // 3. Extraer datos experimentales
        const cols = currentData.columns;
        const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
        const psiCol = findColumn(cols, ["psi"]);
        const deltaCol = findColumn(cols, ["delta"]);
        
        if (!lambdaCol || !psiCol || !deltaCol) {
            alert("Error: No se encontraron las columnas necesarias (wavelength, psi, delta) en los datos experimentales.");
            return;
        }
        
        const wavelengths_exp = uploadedFileData.map(r => r[lambdaCol]);
        const psi_exp = uploadedFileData.map(r => r[psiCol]);
        const delta_exp = uploadedFileData.map(r => r[deltaCol]);
        
        console.log(`Datos experimentales: ${wavelengths_exp.length} puntos`);
        console.log(`Modelo: ${savedModel.layers.length} capas, ángulo ${savedModel.global.angle}°`);
        
        // 4. Mostrar banner de cálculo en progreso
        showCalculationProgressBanner();
        
        // 5. Preparar request
        const requestData = {
            model: savedModel,
            experimental_data: {
                wavelengths: wavelengths_exp,
                psi_exp: psi_exp,
                delta_exp: delta_exp
            }
        };
        
        // 6. Llamar al endpoint
        console.log("Enviando request al backend...");
        const response = await fetch('/api/calculate-theoretical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        console.log("Respuesta recibida:", result.success ? "✓ Éxito" : "✗ Error");
        
        // 7. Verificar resultado
        if (!response.ok || !result.success) {
            const errorMsg = result.error || 'Error desconocido en el cálculo';
            const suggestion = result.suggestion || '';
            console.error("Error en cálculo:", errorMsg);
            showCalculationErrorBanner(errorMsg, suggestion);
            return;
        }
        
        // 8. Mostrar resultados exitosos
        console.log(`✓ Cálculo completado en ${result.calculation_time} s`);
        console.log(`  χ² = ${result.goodness_of_fit.chi_squared.toFixed(4)}`);
        console.log(`  χ²ᵣ = ${result.goodness_of_fit.chi_squared_reduced.toFixed(4)}`);
        console.log("=".repeat(60));
        
        showCalculationResultsBanner(result);
        
    } catch (error) {
        console.error("Error crítico en cálculo teórico:", error);
        showCalculationErrorBanner(
            "Error de conexión: " + error.message,
            "Verifique su conexión al servidor y vuelva a intentarlo."
        );
    }
}

// ==========================================
// FUNCIÓN: Mostrar progreso del cálculo
// ==========================================
function showCalculationProgressBanner() {
    const banner = document.getElementById("model-saved-banner");
    
    banner.innerHTML = `
        <div class="alert alert-info" style="margin: 0;">
            <h6 class="mb-2">Calculando valores teóricos...</h6>
            <div class="progress mb-2" style="height: 8px;">
                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                     role="progressbar" 
                     style="width: 100%"></div>
            </div>
            <p class="mb-0 small">
                ✓ Calculando propiedades ópticas (n,k)<br>
                ✓ Aplicando Método de Matriz de Transferencia<br>
                → Calculando Psi y Delta teóricos
            </p>
        </div>
    `;
}

// ==========================================
// FUNCIÓN: Mostrar error en el cálculo
// ==========================================
function showCalculationErrorBanner(errorMsg, suggestion) {
    const banner = document.getElementById("model-saved-banner");
    
    banner.innerHTML = `
        <div class="alert alert-danger" style="margin: 0;">
            <h6 class="mb-2">Error en el cálculo</h6>
            <p class="mb-2"><strong>${errorMsg}</strong></p>
            ${suggestion ? `<p class="mb-2 small"><strong>Sugerencia:</strong> ${suggestion}</p>` : ''}
            <button class="btn btn-sm btn-outline-danger" onclick="location.reload()">
                Recargar página
            </button>
        </div>
    `;
}

// ==========================================
// FUNCIÓN: Mostrar resultados del cálculo
// ==========================================
function showCalculationResultsBanner(result) {
    const banner = document.getElementById("model-saved-banner");
    
    const gof = result.goodness_of_fit;
    const fitQuality = gof.fit_quality;
    
    // Determinar color del badge según calidad
    const badgeClass = `badge bg-${fitQuality.color}`;
    
    banner.innerHTML = `
        <div class="alert alert-${fitQuality.color}" style="margin: 0;">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h6 class="mb-1">✓ Cálculo completado (${result.calculation_time} s)</h6>
                    <p class="mb-0 small text-muted">
                        Psi y Delta teóricos calculados para ${result.points_calculated} longitudes de onda
                    </p>
                </div>
                <span class="${badgeClass}" style="font-size: 0.9em;">
                    ${fitQuality.label}
                </span>
            </div>
            
            <div class="card mb-3">
                <div class="card-body" style="padding: 1rem;">
                    <h6 class="card-title mb-2">Análisis de ajuste (Chi-cuadrado)</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <p class="mb-1"><strong>χ² =</strong> ${gof.chi_squared.toFixed(4)}</p>
                            <p class="mb-1"><strong>χ² reducido =</strong> ${gof.chi_squared_reduced.toFixed(4)}</p>
                        </div>
                        <div class="col-md-6">
                            <p class="mb-1 small">${fitQuality.message}</p>
                        </div>
                    </div>
                    
                    <hr class="my-2">
                    
                    <div class="row small">
                        <div class="col-md-6">
                            <strong>Psi:</strong>
                            <ul class="mb-0" style="list-style: none; padding-left: 0;">
                                <li>RMSE: ${gof.psi_metrics.rmse.toFixed(3)}°</li>
                                <li>R²: ${gof.psi_metrics.r_squared.toFixed(4)}</li>
                                <li>Error máx: ${gof.psi_metrics.max_error.toFixed(3)}°</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <strong>Delta:</strong>
                            <ul class="mb-0" style="list-style: none; padding-left: 0;">
                                <li>RMSE: ${gof.delta_metrics.rmse.toFixed(3)}°</li>
                                <li>R²: ${gof.delta_metrics.r_squared.toFixed(4)}</li>
                                <li>Error máx: ${gof.delta_metrics.max_error.toFixed(3)}°</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" onclick="showDetailedComparison()">
                    Ver comparación detallada
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="downloadTheoreticalData()">
                    Descargar datos teóricos
                </button>
                <button class="btn btn-sm btn-primary" onclick="proceedToOptimization()">
                    Proceder a optimización
                </button>
            </div>
        </div>
    `;
    
    // Guardar resultados globalmente para uso posterior
    window.theoreticalResults = result;
}

document.getElementById("view-model-link").addEventListener("click", (e) => {
    e.preventDefault();
    if (savedModel) {
        showModelSummaryModal(savedModel);
    }
});

function showModelSummaryModal(model) {
    const modalBody = document.getElementById("summary-modal-body");
    
    let html = '<h6>Configuración Global</h6>';
    html += `<ul>
        <li><strong>Ángulo de incidencia:</strong> ${model.global.angle}°</li>
        <li><strong>Polarización:</strong> ${model.global.polarization}</li>
        <li><strong>Modo de longitud de onda:</strong> ${model.global.wavelength_mode}</li>
    </ul>`;
    
    if (model.global.wavelength_mode === "range") {
        html += `<p>Rango: ${model.global.wl_from} - ${model.global.wl_to} nm (${model.global.wl_steps} pasos)</p>`;
    } else if (model.global.wavelength_mode === "single") {
        html += `<p>Longitud única: ${model.global.wl_single} nm</p>`;
    }
    
    html += '<h6 class="mt-3">Medio Ambiente</h6>';
    html += `<p>Tipo: ${model.ambient.type}</p>`;
    if (model.ambient.n !== undefined) {
        html += `<p>n = ${model.ambient.n}, k = ${model.ambient.k || 0}</p>`;
    }
    
    html += '<h6 class="mt-3">Sustrato</h6>';
    html += `<p>Tipo: ${model.substrate.type}</p>`;
    if (model.substrate.n !== undefined) {
        html += `<p>n = ${model.substrate.n}, k = ${model.substrate.k || 0}</p>`;
    }
    
    html += '<h6 class="mt-3">Capas</h6>';
    if (model.layers.length === 0) {
        html += '<p class="text-muted">No hay capas definidas</p>';
    } else {
        html += '<table class="table table-sm table-bordered"><thead><tr>';
        html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Tipo</th><th>Detalles</th>';
        html += '</tr></thead><tbody>';
        
        model.layers.forEach((layer, i) => {
            const typeText = layer.layer_type === 'homogeneous' ? 'Homogénea' : 
                           layer.layer_type === 'emt' ? `EMT (${layer.components?.length || 0} comp.)` :
                           'No definido';
            
            let details = '';
            if (layer.layer_type === 'homogeneous') {
                details = layer.model;
            } else if (layer.layer_type === 'emt') {
                details = layer.emt_model;
            }
            
            html += `<tr>
                <td>${i + 1}</td>
                <td>${layer.name}</td>
                <td>${layer.thickness}</td>
                <td>${typeText}</td>
                <td>${details}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
    }
    
    if (model.filename) {
        html += `<p class="mt-3 text-muted small">Guardado en: ${model.filename}</p>`;
    }
    
    modalBody.innerHTML = html;
    
    const summaryModal = new bootstrap.Modal(document.getElementById("modelSummaryModal"));
    summaryModal.show();
}

updateMediumFields('ambient', 'constant');
updateMediumFields('substrate', 'glass');

// ============================================================================
// SISTEMA DE ECUACIONES LATEX
// ============================================================================

let currentLatexFieldId = null;

function openLatexEditor(fieldId) {
    currentLatexFieldId = fieldId;
    const existingLatex = document.querySelector(`#${fieldId} .latex-equation-value`)?.value || '';
    const mathField = document.getElementById('latex-math-editor');
    if (mathField) { mathField.value = existingLatex; }
    updateLatexPreview();
    const modal = new bootstrap.Modal(document.getElementById('latexEditorModal'));
    modal.show();
}

function updateLatexPreview() {
    const mathField = document.getElementById('latex-math-editor');
    const preview = document.getElementById('latex-preview');
    if (mathField && preview) {
        const latex = mathField.value;
        if (latex) {
            preview.innerHTML = `$$n(\\lambda) = ${latex}$$`;
            if (window.MathJax) { MathJax.typesetPromise([preview]); }
        } else {
            preview.innerHTML = '<em class="text-muted">La ecuación aparecerá aquí</em>';
        }
    }
}

function insertLatexExample(latex) {
    const mathField = document.getElementById('latex-math-editor');
    if (mathField) { mathField.value = latex; updateLatexPreview(); }
}

document.addEventListener('DOMContentLoaded', () => {
    const mathField = document.getElementById('latex-math-editor');
    if (mathField) { mathField.addEventListener('input', updateLatexPreview); }
    
    const saveBtn = document.getElementById('save-latex-equation');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const mathField = document.getElementById('latex-math-editor');
            const latex = mathField?.value || '';
            if (!latex) { alert('Escribe una ecuación'); return; }
            if (currentLatexFieldId) {
                const section = document.querySelector(`#${currentLatexFieldId}`);
                if (section) {
                    const hiddenInput = section.querySelector('.latex-equation-value');
                    const displayDiv = section.querySelector('.latex-equation-display');
                    if (hiddenInput) hiddenInput.value = latex;
                    if (displayDiv) {
                        displayDiv.innerHTML = `$$n(\\lambda) = ${latex}$$`;
                        if (window.MathJax) { MathJax.typesetPromise([displayDiv]); }
                    }
                }
            }
            const modal = bootstrap.Modal.getInstance(document.getElementById('latexEditorModal'));
            if (modal) modal.hide();
        });
    }
});

// ==========================================
// FUNCIONES PLACEHOLDER (Para implementar después)
// ==========================================

function showDetailedComparison() {
    alert("Función 'Ver comparación detallada' - Por implementar en siguiente fase");
    // TODO: Mostrar gráficas comparativas Psi_exp vs Psi_theo, Delta_exp vs Delta_theo
}

function downloadTheoreticalData() {
    if (!window.theoreticalResults) {
        alert("No hay datos teóricos para descargar");
        return;
    }
    
    // Crear CSV simple
    const data = window.theoreticalResults.data;
    let csv = "wavelength_nm,psi_theoretical,delta_theoretical\n";
    
    for (let i = 0; i < data.wavelengths.length; i++) {
        csv += `${data.wavelengths[i]},${data.psi_theoretical[i]},${data.delta_theoretical[i]}\n`;
    }
    
    // Descargar
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theoretical_psi_delta_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function proceedToOptimization() {
    alert("Función 'Proceder a optimización' - Por implementar en siguiente fase");
    // TODO: Abrir interfaz de optimización de parámetros
}