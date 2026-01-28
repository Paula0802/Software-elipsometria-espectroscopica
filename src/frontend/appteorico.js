// ============================================================================
// PRUEBAS TEÓRICAS - CONFIGURACIÓN Y CÁLCULO TEÓRICO
// Versión limpia sin dependencia de datos experimentales
// ============================================================================

// ============================================================================
// VARIABLES GLOBALES
// ============================================================================

let theoreticalMode = true;
let theoreticalConfig = {
    wavelengths: [],
    angle: 70,
    polarization: 'both',  // Siempre ambas polarizaciones (fijo)
    outputs: {
        psi_delta: true,
        reflectance: true,
        transmittance: true,
        absorbance: true,
        absorbance_layer: false
    }
};

let savedModel = null;
let layerCounter = 0;

// ============================================================================
// TEMPLATES DE MODELOS DE DISPERSIÓN
// ============================================================================

const dispersionTemplates = {
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
        helpText: "Modelo Drude para metales y semiconductores dopados.",
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
        helpText: "Modelo de Lorentz para dieléctricos con resonancias.",
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
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            { name: "omega_p", placeholder: "ωp (eV)", canOptimize: true },
            { name: "f0", placeholder: "f₀ (Drude)", canOptimize: true },
            { name: "gamma_0", placeholder: "Γ₀ (eV)", canOptimize: true },
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
        helpText: "Modelo Drude-Lorentz combinado para metales con transiciones interbanda.",
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
            let drudeTerms = '';
            if (p['f0'] !== undefined && p['f0'] !== null && p['f0'] !== '') {
                const f0val = getValue('f0', 'f_0');
                const g0val = getValue('gamma_0', '\\Gamma_0');
                drudeTerms = ` - \\frac{${f0val} \\cdot ${omega_p}^2}{\\omega^2 + i\\cdot ${g0val}\\cdot\\omega}`;
            }
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

// Hacer disponible globalmente
window.dispersionTemplates = dispersionTemplates;

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
    initializeWizard();
    updateWorkflowStep(1);
});

function initializeTheoreticalMode() {
    // Selector de método de longitud de onda
    const methodSelect = document.getElementById('wavelength-method');
    if (methodSelect) {
        methodSelect.addEventListener('change', function() {
            const rangeOption = document.getElementById('wavelength-range-option');
            const singleOption = document.getElementById('wavelength-single-option');
            
            if (rangeOption) {
                rangeOption.style.display = this.value === 'range' ? 'block' : 'none';
            }
            if (singleOption) {
                singleOption.style.display = this.value === 'single' ? 'block' : 'none';
            }
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
            theoreticalConfig.outputs[configKey] = checkbox.checked;
            checkbox.addEventListener('change', function() {
                theoreticalConfig.outputs[configKey] = this.checked;
                console.log(`[Config] ${configKey} = ${this.checked}`);
            });
        }
    });
    
    console.log('[Pruebas Teóricas] Modo activado');
}

function validateTheoreticalAngle() {
    const angleInput = document.getElementById('incident-angle');
    const warning = document.getElementById('angle-warning');
    const continueBtn = document.getElementById('btn-continue-model');
    
    // Verificar que los elementos existan
    if (!angleInput) {
        console.error('[Error] No se encontró el campo de ángulo');
        return false;
    }
    
    const angle = parseFloat(angleInput.value);
    
    if (isNaN(angle)) {
        if (warning) {
            warning.style.display = 'block';
            warning.innerHTML = '<strong>Error:</strong> Debe ingresar un ángulo válido.';
        }
        if (continueBtn) continueBtn.disabled = true;
        return false;
    }
    
    if (angle < 0) {
        if (warning) {
            warning.style.display = 'block';
            warning.innerHTML = '<strong>Error:</strong> El ángulo debe ser mayor o igual a 0°.';
        }
        if (continueBtn) continueBtn.disabled = true;
        return false;
    }
    
    if (angle > 90) {
        if (warning) {
            warning.style.display = 'block';
            warning.innerHTML = '<strong>Error:</strong> El ángulo no puede superar los 90°.';
        }
        if (continueBtn) continueBtn.disabled = true;
        return false;
    }
    
    if (warning) warning.style.display = 'none';
    if (continueBtn) continueBtn.disabled = false;
    return true;
}

function getTheoreticalWavelengths() {
    const methodSelect = document.getElementById('wavelength-method');
    if (!methodSelect) {
        throw new Error("No se encontró el selector de método de longitud de onda");
    }
    
    const method = methodSelect.value;
    let wavelengths = [];
    
    if (method === 'range') {
        const minInput = document.getElementById('wavelength-min');
        const maxInput = document.getElementById('wavelength-max');
        const stepsInput = document.getElementById('wavelength-steps');
        
        if (!minInput || !maxInput || !stepsInput) {
            throw new Error("No se encontraron los campos de rango de longitud de onda");
        }
        
        const min = parseFloat(minInput.value);
        const max = parseFloat(maxInput.value);
        const steps = parseInt(stepsInput.value);
        
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
        const singleInput = document.getElementById('wavelength-single');
        if (!singleInput) {
            throw new Error("No se encontró el campo de longitud de onda única");
        }
        
        const single = parseFloat(singleInput.value);
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
        
        // Verificar que hay al menos una salida seleccionada
        const hasOutput = Object.values(theoreticalConfig.outputs).some(v => v === true);
        if (!hasOutput) {
            alert('Error: Debe seleccionar al menos una propiedad para calcular.');
            return;
        }
        
        console.log('[Config] Configuración guardada:', {
            angle: theoreticalConfig.angle,
            wavelengths: `${wavelengths.length} puntos (${wavelengths[0].toFixed(1)} - ${wavelengths[wavelengths.length-1].toFixed(1)} nm)`,
            polarization: theoreticalConfig.polarization,
            outputs: theoreticalConfig.outputs
        });
        
        // Actualizar workflow visual
        updateWorkflowStep(2);
        
        // Resetear wizard al paso 1
        currentWizardStep = 1;
        showWizardStep(1);
        
        // Abrir modal del wizard
        const modal = new bootstrap.Modal(document.getElementById('modelWizardModal'));
        modal.show();
        
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('[Error]', error);
    }
}

// ============================================================================
// WIZARD - NAVEGACIÓN Y CONTROL
// ============================================================================

let currentWizardStep = 1;
const totalWizardSteps = 2;

function initializeWizard() {
    const wizardNextBtn = document.getElementById("wizard-next");
    const wizardPrevBtn = document.getElementById("wizard-prev");
    const wizardSaveBtn = document.getElementById("wizard-save");
    
    if (wizardNextBtn) {
        wizardNextBtn.addEventListener("click", nextWizardStep);
    }
    
    if (wizardPrevBtn) {
        wizardPrevBtn.addEventListener("click", prevWizardStep);
    }
    
    if (wizardSaveBtn) {
        wizardSaveBtn.addEventListener("click", saveOpticalModel);
    }
    
    // Inicializar listeners para ambiente y sustrato
    initializeMediumListeners();
    
    // Inicializar botón de agregar capa
    const addLayerBtn = document.getElementById("add-layer");
    if (addLayerBtn) {
        addLayerBtn.addEventListener("click", () => addLayer());
    }
    
    // Link para ver resumen del modelo
    const viewModelLink = document.getElementById("view-model-link");
    if (viewModelLink) {
        viewModelLink.addEventListener("click", (e) => {
            e.preventDefault();
            if (savedModel) {
                showModelSummaryModal(savedModel);
            }
        });
    }
}

function showWizardStep(step) {
    // Ocultar todos los pasos
    const allSteps = document.querySelectorAll('.wizard-step');
    allSteps.forEach(s => {
        s.classList.add('d-none');
        s.style.display = 'none';
    });
    
    // Mostrar el paso actual
    const currentStepElement = document.querySelector(`[data-step="${step}"]`);
    if (currentStepElement) {
        currentStepElement.classList.remove('d-none');
        currentStepElement.style.display = 'block';
    }
    
    // Actualizar número de paso en el título
    const stepNum = document.getElementById("wizard-step-num");
    if (stepNum) stepNum.innerText = step;
    
    // Actualizar botones de navegación
    const wizardPrevBtn = document.getElementById("wizard-prev");
    const wizardNextBtn = document.getElementById("wizard-next");
    const wizardSaveBtn = document.getElementById("wizard-save");
    const wizardError = document.getElementById("wizard-error");
    
    if (wizardPrevBtn) {
        wizardPrevBtn.style.display = (step === 1) ? "none" : "inline-block";
    }
    
    if (wizardNextBtn) {
        wizardNextBtn.style.display = (step === totalWizardSteps) ? "none" : "inline-block";
    }
    
    if (wizardSaveBtn) {
        wizardSaveBtn.classList.toggle("d-none", step !== totalWizardSteps);
    }
    
    if (wizardError) {
        wizardError.style.display = "none";
    }
}

async function nextWizardStep() {
    const isValid = await validateWizardStep(currentWizardStep);
    if (!isValid) return;
    
    if (currentWizardStep < totalWizardSteps) {
        currentWizardStep++;
        showWizardStep(currentWizardStep);
    }
}

function prevWizardStep() {
    if (currentWizardStep > 1) {
        currentWizardStep--;
        showWizardStep(currentWizardStep);
    }
}

async function validateWizardStep(step) {
    const wizardError = document.getElementById("wizard-error");
    wizardError.style.display = "none";
    
    if (step === 1) {
        // Validar ambiente
        const ambientType = document.querySelector('input[name="ambient-type"]:checked');
        if (!ambientType) {
            wizardError.innerText = "Seleccione el tipo de medio ambiente.";
            wizardError.style.display = "block";
            return false;
        }
        
        if (ambientType.value === 'emt') {
            const ambientComponents = document.querySelectorAll('#ambient-emt-components .medium-emt-component');
            if (ambientComponents.length < 2) {
                wizardError.innerText = "El ambiente EMT debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
                return false;
            }
            
            // Validar suma de fracciones
            let sum = 0;
            ambientComponents.forEach(comp => {
                const fraction = parseFloat(comp.querySelector('.medium-component-fraction').value) || 0;
                sum += fraction;
            });
            
            if (Math.abs(sum - 1.0) > 0.01) {
                wizardError.innerHTML = `La suma de fracciones del ambiente debe ser 1.0 (actual: ${sum.toFixed(3)})`;
                wizardError.style.display = "block";
                return false;
            }
        }
        
        // Validar sustrato
        const substrateType = document.querySelector('input[name="substrate-type"]:checked');
        if (!substrateType) {
            wizardError.innerText = "Seleccione el tipo de sustrato.";
            wizardError.style.display = "block";
            return false;
        }
        
        if (substrateType.value === 'emt') {
            const substrateComponents = document.querySelectorAll('#substrate-emt-components .medium-emt-component');
            if (substrateComponents.length < 2) {
                wizardError.innerText = "El sustrato EMT debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
                return false;
            }
            
            let sum = 0;
            substrateComponents.forEach(comp => {
                const fraction = parseFloat(comp.querySelector('.medium-component-fraction').value) || 0;
                sum += fraction;
            });
            
            if (Math.abs(sum - 1.0) > 0.01) {
                wizardError.innerHTML = `La suma de fracciones del sustrato debe ser 1.0 (actual: ${sum.toFixed(3)})`;
                wizardError.style.display = "block";
                return false;
            }
        }
        
        return true;
    }
    
    if (step === 2) {
        // Paso 2: Capas - validación opcional (puede no haber capas)
        const layers = document.querySelectorAll('#layers-container .layer-card');
        
        for (const layer of layers) {
            const layerType = layer.querySelector('input[type="radio"]:checked');
            if (!layerType) {
                wizardError.innerText = "Seleccione el tipo para todas las capas.";
                wizardError.style.display = "block";
                return false;
            }
            
            if (layerType.value === 'heterogeneous') {
                const components = layer.querySelectorAll('.emt-component');
                if (components.length < 2) {
                    const layerName = layer.querySelector('.layer-name').value || 'Sin nombre';
                    wizardError.innerText = `La capa "${layerName}" (EMT) debe tener al menos 2 componentes.`;
                    wizardError.style.display = "block";
                    return false;
                }
                
                let sum = 0;
                components.forEach(comp => {
                    const fraction = parseFloat(comp.querySelector('.component-fraction').value) || 0;
                    sum += fraction;
                });
                
                if (Math.abs(sum - 1.0) > 0.01) {
                    const layerName = layer.querySelector('.layer-name').value || 'Sin nombre';
                    wizardError.innerHTML = `La suma de fracciones de "${layerName}" debe ser 1.0 (actual: ${sum.toFixed(3)})`;
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
        
        return true;
    }
    
    return true;
}

// ============================================================================
// LISTENERS PARA AMBIENTE Y SUSTRATO
// ============================================================================

function initializeMediumListeners() {
    // Listener para modelo de ambiente
    const ambientModel = document.getElementById("ambient-model");
    if (ambientModel) {
        ambientModel.addEventListener("change", (e) => {
            updateMediumFields('ambient', e.target.value);
        });
        // Inicializar campos del ambiente
        updateMediumFields('ambient', ambientModel.value);
    }
    
    // Listener para modelo de sustrato
    const substrateModel = document.getElementById("substrate-model");
    if (substrateModel) {
        substrateModel.addEventListener("change", (e) => {
            updateMediumFields('substrate', e.target.value);
        });
        // IMPORTANTE: Inicializar campos del sustrato con el valor actual
        updateMediumFields('substrate', substrateModel.value);
    }
    
    // Listeners para tipo de ambiente (homogéneo/EMT)
    const ambientTypeHomo = document.getElementById("ambient-type-homo");
    const ambientTypeEmt = document.getElementById("ambient-type-emt");
    
    if (ambientTypeHomo) {
        ambientTypeHomo.addEventListener("change", () => updateMediumTypeInterface('ambient', 'homogeneous'));
    }
    if (ambientTypeEmt) {
        ambientTypeEmt.addEventListener("change", () => updateMediumTypeInterface('ambient', 'emt'));
    }
    
    // Listeners para tipo de sustrato (homogéneo/EMT)
    const substrateTypeHomo = document.getElementById("substrate-type-homo");
    const substrateTypeEmt = document.getElementById("substrate-type-emt");
    
    if (substrateTypeHomo) {
        substrateTypeHomo.addEventListener("change", () => updateMediumTypeInterface('substrate', 'homogeneous'));
    }
    if (substrateTypeEmt) {
        substrateTypeEmt.addEventListener("change", () => updateMediumTypeInterface('substrate', 'emt'));
    }
    
    // Inicializar la interfaz según el tipo seleccionado actualmente
    const ambientTypeChecked = document.querySelector('input[name="ambient-type"]:checked');
    if (ambientTypeChecked) {
        updateMediumTypeInterface('ambient', ambientTypeChecked.value);
    }
    
    const substrateTypeChecked = document.querySelector('input[name="substrate-type"]:checked');
    if (substrateTypeChecked) {
        updateMediumTypeInterface('substrate', substrateTypeChecked.value);
    }
    
    console.log('[Wizard] Listeners de medios inicializados');
}

function updateMediumTypeInterface(medium, type) {
    const homoConfig = document.getElementById(`${medium}-homo-config`);
    const emtConfig = document.getElementById(`${medium}-emt-config`);
    
    if (type === 'homogeneous') {
        if (homoConfig) homoConfig.style.display = 'block';
        if (emtConfig) emtConfig.style.display = 'none';
    } else {
        if (homoConfig) homoConfig.style.display = 'none';
        if (emtConfig) emtConfig.style.display = 'block';
        
        // Asegurar al menos un componente EMT
        const container = document.getElementById(`${medium}-emt-components`);
        if (container && container.children.length === 0) {
            addMediumEMTComponent(medium);
        }
    }
}

function updateMediumFields(medium, modelType) {
    const paramsDiv = document.getElementById(`${medium}-params`);
    const constantField = document.getElementById(`${medium}-constant-field`);
    
    if (!paramsDiv) {
        console.warn(`[Warning] No se encontró ${medium}-params`);
        return;
    }
    
    // Limpiar parámetros
    paramsDiv.innerHTML = "";
    
    // Ocultar campo constante por defecto
    if (constantField) constantField.style.display = "none";
    
    if (modelType === "constant") {
        if (constantField) {
            constantField.style.display = "block";
            // Valores por defecto para constante
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput && nInput.value === "") nInput.value = "1.0";
            if (kInput && kInput.value === "") kInput.value = "0";
        }
        
    } else if (modelType === "glass") {
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput) nInput.value = "1.52";
            if (kInput) kInput.value = "0";
        }
        
    } else if (modelType === "si") {
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput) nInput.value = "3.87";
            if (kInput) kInput.value = "0.02";
        }
        
    } else if (dispersionTemplates[modelType]) {
        // Modelo de dispersión - ocultar constantes, mostrar parámetros
        if (constantField) constantField.style.display = "none";
        updateModelFieldsEnhanced(paramsDiv, modelType, `${medium}-`);
        
    } else if (modelType === "file_nk" || modelType === "file_epsilon") {
        // Archivo - manejar si tienes estos elementos
        const fileDiv = document.getElementById(`${medium}-file-upload`);
        if (fileDiv) fileDiv.style.display = "block";
    }
}

// ============================================================================
// FUNCIONES DE INTERFAZ DE DISPERSIÓN
// ============================================================================

function createParamFieldWithOptimize(param, prefix = '') {
    const inputId = `${prefix}${param.name}`;
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'param-field mb-2';
    
    fieldDiv.innerHTML = `
        <label class="form-label small mb-1">${param.placeholder}</label>
        <div class="input-group input-group-sm">
            <input class="form-control layer-param"
                   id="${inputId}"
                   data-param="${param.name}"
                   placeholder="${param.placeholder}"
                   type="number"
                   step="any">
        </div>
    `;
    
    return fieldDiv;
}

function updateModelFieldsEnhanced(container, model, prefix = '') {
    container.innerHTML = '';
    
    const template = dispersionTemplates[model];
    if (!template) {
        console.warn('Modelo no encontrado:', model);
        return;
    }
    
    // Crear estructura
    const splitContainer = document.createElement('div');
    splitContainer.className = 'row g-3';
    
    // Columna izquierda: Parámetros
    const paramsColumn = document.createElement('div');
    paramsColumn.className = 'col-md-6';
    
    const paramsCard = document.createElement('div');
    paramsCard.className = 'params-side';
    
    const paramsTitle = document.createElement('h6');
    paramsTitle.className = 'text-muted small mb-2 fw-bold';
    paramsTitle.textContent = 'Parámetros del modelo:';
    paramsCard.appendChild(paramsTitle);
    
    // Agregar campos de parámetros
    template.params.forEach(param => {
        const field = createParamFieldWithOptimize(param, prefix);
        paramsCard.appendChild(field);
    });
    
    // Contenedor para osciladores dinámicos
    const dynamicContainer = document.createElement('div');
    dynamicContainer.className = 'dynamic-oscillators-container';
    paramsCard.appendChild(dynamicContainer);
    
    // Botón para agregar osciladores
    if (template.maxOscillators && template.generateDynamicParam) {
        const addOscBtn = document.createElement('button');
        addOscBtn.type = 'button';
        addOscBtn.className = 'btn btn-sm btn-outline-primary w-100 mt-2 add-oscillator-btn';
        
        const termName = template.termName || 'término';
        addOscBtn.innerHTML = `+ Agregar ${termName} (max ${template.maxOscillators})`;
        addOscBtn.dataset.oscCount = '1';
        
        addOscBtn.addEventListener('click', () => {
            const currentCount = parseInt(addOscBtn.dataset.oscCount) || 1;
            
            if (currentCount >= template.maxOscillators) {
                alert(`Máximo de ${template.maxOscillators} ${termName}s alcanzado`);
                return;
            }
            
            const newOsc = addDynamicOscillator(dynamicContainer, model, currentCount);
            
            if (newOsc) {
                dynamicContainer.appendChild(newOsc);
                addOscBtn.dataset.oscCount = String(currentCount + 1);
                
                // Actualizar preview
                if (container._previewControls && container._previewControls.updatePreview) {
                    const newInputs = newOsc.querySelectorAll('.layer-param');
                    newInputs.forEach(inp => {
                        inp.addEventListener('input', container._previewControls.updatePreview);
                    });
                    container._previewControls.updatePreview();
                }
            }
        });
        
        paramsCard.appendChild(addOscBtn);
    }
    
    paramsColumn.appendChild(paramsCard);
    
    // Columna derecha: Ecuación
    const equationColumn = document.createElement('div');
    equationColumn.className = 'col-md-6';
    
    const equationCard = document.createElement('div');
    equationCard.className = 'equation-preview-section border rounded p-3 bg-light h-100';
    
    const eqTitle = document.createElement('h6');
    eqTitle.className = 'text-muted small mb-2 fw-bold';
    eqTitle.textContent = 'Vista previa de ecuación:';
    equationCard.appendChild(eqTitle);
    
    const modelEqDiv = document.createElement('div');
    modelEqDiv.className = 'mb-3 pb-3 border-bottom';
    modelEqDiv.innerHTML = `
        <small class="text-muted d-block mb-2">Modelo ${template.label}:</small>
        <div class="equation-template text-center p-2 bg-white rounded border">
            $$${template.equation}$$
        </div>
    `;
    equationCard.appendChild(modelEqDiv);
    
    const valueEqDiv = document.createElement('div');
    valueEqDiv.className = 'mb-2';
    valueEqDiv.innerHTML = `
        <small class="text-muted d-block mb-2">Con tus valores:</small>
        <div class="equation-with-values text-center p-2 bg-white rounded border">
            <em class="text-muted">Ingresa valores para ver la ecuación</em>
        </div>
    `;
    equationCard.appendChild(valueEqDiv);
    
    if (template.helpText) {
        const helpDiv = document.createElement('div');
        helpDiv.className = 'alert alert-info small mt-3 mb-0';
        helpDiv.innerHTML = `<strong>Info:</strong> ${template.helpText}`;
        equationCard.appendChild(helpDiv);
    }
    
    equationColumn.appendChild(equationCard);
    
    // Ensamblar
    splitContainer.appendChild(paramsColumn);
    splitContainer.appendChild(equationColumn);
    container.appendChild(splitContainer);
    
    // Renderizar ecuación con MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([modelEqDiv]).catch(err => {
            console.error('Error MathJax:', err);
        });
    }
    
    // Setup live preview
    const previewControls = setupLivePreview(paramsCard, model);
    container._previewControls = previewControls;
    
    return previewControls;
}

function addDynamicOscillator(container, model, currentIndex) {
    const template = dispersionTemplates[model];
    if (!template || !template.generateDynamicParam) return null;
    
    const newIndex = currentIndex + 1;
    const newParams = template.generateDynamicParam(newIndex);
    
    const oscDiv = document.createElement('div');
    oscDiv.className = 'dynamic-oscillator border-top pt-2 mt-2';
    oscDiv.dataset.oscIndex = newIndex;
    
    const oscHeader = document.createElement('div');
    oscHeader.className = 'd-flex justify-content-between align-items-center mb-2';
    oscHeader.innerHTML = `
        <small class="text-muted fw-bold">${template.termName || 'Término'} ${newIndex}</small>
        <button type="button" class="btn btn-sm btn-outline-danger remove-osc-btn" title="Eliminar">×</button>
    `;
    oscDiv.appendChild(oscHeader);
    
    newParams.forEach(param => {
        const field = createParamFieldWithOptimize(param, `${model}-osc${newIndex}-`);
        oscDiv.appendChild(field);
    });
    
    const removeBtn = oscDiv.querySelector('.remove-osc-btn');
    removeBtn.addEventListener('click', () => {
        oscDiv.remove();
        const addBtn = container.parentElement.querySelector('.add-oscillator-btn');
        if (addBtn) {
            const currentCount = parseInt(addBtn.dataset.oscCount) || 1;
            addBtn.dataset.oscCount = String(currentCount - 1);
        }
    });
    
    return oscDiv;
}

function setupLivePreview(container, model) {
    const template = dispersionTemplates[model];
    if (!template) return null;
    
    const getAllParams = () => {
        const params = {};
        const inputs = container.querySelectorAll('.layer-param');
        inputs.forEach(inp => {
            const paramName = inp.dataset.param;
            const value = inp.value.trim();
            if (paramName) {
                params[paramName] = value !== '' ? value : null;
            }
        });
        return params;
    };
    
    const updatePreview = () => {
        const params = getAllParams();
        
        let previewSection = container.closest('.model-config-container')?.querySelector('.equation-preview-section');
        if (!previewSection) {
            previewSection = container.parentElement.querySelector('.equation-preview-section');
        }
        if (!previewSection) return;
        
        const valueDisplay = previewSection.querySelector('.equation-with-values');
        if (!valueDisplay) return;
        
        if (template.previewFn) {
            const valueEquation = template.previewFn(params);
            valueDisplay.innerHTML = `$$${valueEquation}$$`;
            
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([valueDisplay]).catch(err => {
                    console.error('Error MathJax:', err);
                });
            }
        }
    };
    
    const inputs = container.querySelectorAll('.layer-param');
    inputs.forEach(inp => {
        inp.addEventListener('input', updatePreview);
    });
    
    setTimeout(updatePreview, 100);
    
    return { getAllParams, updatePreview };
}

// Exportar funciones globalmente
window.createParamFieldWithOptimize = createParamFieldWithOptimize;
window.updateModelFieldsEnhanced = updateModelFieldsEnhanced;
window.addDynamicOscillator = addDynamicOscillator;
window.setupLivePreview = setupLivePreview;

console.log('[Pruebas Teóricas] Módulo base cargado');

// ============================================================================
// EMT - COMPONENTES PARA AMBIENTE Y SUSTRATO
// ============================================================================

function addMediumEMTComponent(medium) {
    const container = document.getElementById(`${medium}-emt-components`);
    if (!container) return;
    
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 medium-emt-component bg-white shadow-sm';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-medium-component">✕ Eliminar</button>
        </div>

        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label small fw-bold">Nombre</label>
                <input class="form-control medium-component-name" value="Componente ${componentCount}" placeholder="Ej: SiO₂">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <input class="form-control medium-component-fraction" type="number" min="0" max="1" step="0.01" value="0.5">
                <div class="form-text small">Valor entre 0 y 1</div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo</label>
                <select class="form-select medium-component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                </select>
            </div>
        </div>

        <div class="medium-component-params mt-3"></div>

        <div class="medium-component-constant mt-3">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small">n</label>
                    <input class="form-control medium-comp-n" type="number" step="0.001" value="1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small">k</label>
                    <input class="form-control medium-comp-k" type="number" step="0.001" value="0">
                </div>
            </div>
        </div>

        <div class="medium-component-file mt-3" style="display:none;">
            <input type="file" accept=".csv,.txt,.xlsx" class="form-control medium-comp-file"/>
            <div class="form-text">Archivo: wavelength, n, k</div>
        </div>
    `;
    
    container.appendChild(componentDiv);
    
    // Event listeners
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
    });
    
    const fractionInput = componentDiv.querySelector('.medium-component-fraction');
    fractionInput.addEventListener('input', () => updateMediumFractionSum(medium));
    
    const modelSelect = componentDiv.querySelector('.medium-component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params');
    const constantDiv = componentDiv.querySelector('.medium-component-constant');
    const fileDiv = componentDiv.querySelector('.medium-component-file');
    
    modelSelect.addEventListener('change', () => {
        const model = modelSelect.value;
        constantDiv.style.display = 'none';
        fileDiv.style.display = 'none';
        paramsDiv.innerHTML = '';
        
        if (model === 'constant') {
            constantDiv.style.display = 'block';
        } else if (dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `${medium}-comp${componentCount}-`);
        } else if (model === 'file_nk') {
            fileDiv.style.display = 'block';
        }
    });
    
    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
}

function refreshMediumComponentTitles(container) {
    const components = container.querySelectorAll('.medium-emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

function updateMediumFractionSum(medium) {
    const sumDisplay = document.getElementById(`${medium}-fraction-sum`);
    if (!sumDisplay) return;
    
    const container = document.getElementById(`${medium}-emt-components`);
    if (!container) return;
    
    const components = container.querySelectorAll('.medium-emt-component');
    let sum = 0;
    
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.medium-component-fraction');
        sum += parseFloat(fractionInput.value) || 0;
    });
    
    sum = Math.round(sum * 1000) / 1000;
    sumDisplay.textContent = sum.toFixed(3);
    
    const alertBox = sumDisplay.closest('.alert');
    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
        sumDisplay.style.fontWeight = 'bold';
        if (alertBox) {
            alertBox.classList.remove('alert-warning');
            alertBox.classList.add('alert-success');
        }
    } else {
        sumDisplay.style.color = 'red';
        sumDisplay.style.fontWeight = 'bold';
        if (alertBox) {
            alertBox.classList.remove('alert-success');
            alertBox.classList.add('alert-warning');
        }
    }
}

// ============================================================================
// CAPAS
// ============================================================================

const layersContainer = document.getElementById("layers-container");

function addLayer(prefill = {}) {
    layerCounter++;
    const idx = layerCounter;
    const wrapper = document.createElement("div");
    wrapper.className = "card mb-3 p-3 layer-card";
    wrapper.dataset.idx = String(idx);

    const defaultName = prefill.name || `Capa ${layersContainer.children.length + 1}`;
    const defaultThickness = prefill.thickness || 100;

    wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="layer-title">Capa ${layersContainer.children.length + 1}</strong>
            <button class="btn btn-sm btn-outline-danger remove-layer">Eliminar</button>
        </div>

        <div class="mb-3">
            <label class="form-label fw-bold">Tipo de capa</label>
            <div class="btn-group w-100" role="group">
                <input type="radio" class="btn-check" name="layerType${idx}" id="layerTypeHomo${idx}" value="homogeneous" checked>
                <label class="btn btn-outline-primary" for="layerTypeHomo${idx}">
                    <div class="fw-bold">Homogénea</div>
                    <small>Un solo material</small>
                </label>
                
                <input type="radio" class="btn-check" name="layerType${idx}" id="layerTypeHetero${idx}" value="heterogeneous">
                <label class="btn btn-outline-warning" for="layerTypeHetero${idx}">
                    <div class="fw-bold">Heterogénea (EMT)</div>
                    <small>Multi-componente</small>
                </label>
            </div>
        </div>

        <div class="layer-basic-config">
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <label class="form-label">Nombre</label>
                    <input class="form-control layer-name" value="${defaultName}">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Espesor (nm)</label>
                    <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${defaultThickness}">
                </div>
            </div>
        </div>

        <div class="homogeneous-config">
            <div class="card p-3 bg-light">
                <h6 class="mb-2">Configuración homogénea</h6>
                
                <div class="mb-3">
                    <label class="form-label">Modelo de dispersión</label>
                    <select class="form-select layer-model">
                        <option value="cauchy" selected>Cauchy</option>
                        <option value="sellmeier">Sellmeier</option>
                        <option value="drude">Drude</option>
                        <option value="lorentz">Lorentz</option>
                        <option value="drude_lorentz">Drude-Lorentz</option>
                        <option value="constant">Constante</option>
                        <option value="file_nk">Archivo n,k,λ</option>
                    </select>
                </div>

                <div class="model-config-container">
                    <div class="layer-params"></div>
                </div>

                <div class="layer-file-row mt-2" style="display:none;">
                    <input type="file" accept=".csv,.txt,.xlsx" class="form-control layer-file"/>
                    <div class="form-text">Archivo: wavelength, n, k</div>
                </div>

                <div class="layer-constant-row mt-2" style="display:none;">
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label small">n</label>
                            <input class="form-control layer-n-const" type="number" step="0.001" value="1.5">
                        </div>
                        <div class="col-6">
                            <label class="form-label small">k</label>
                            <input class="form-control layer-k-const" type="number" step="0.001" value="0">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="heterogeneous-config" style="display:none;">
            <div class="card p-3 bg-warning bg-opacity-10">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h6 class="mb-1">Configuración EMT</h6>
                        <small class="text-muted">Defina los componentes</small>
                    </div>
                    <button class="btn btn-sm btn-outline-primary add-emt-component">+ Componente</button>
                </div>

                <div class="mb-3">
                    <label class="form-label">Modelo EMT</label>
                    <select class="form-select emt-model-select">
                        <option value="bruggeman" selected>Bruggeman</option>
                        <option value="maxwell-garnett">Maxwell-Garnett</option>
                    </select>
                </div>

                <div class="emt-components-container"></div>

                <div class="alert alert-warning mt-3 mb-0">
                    <strong>Suma de fracciones:</strong> <span class="fraction-sum-display">0.000</span>
                </div>
            </div>
        </div>
    `;

    layersContainer.appendChild(wrapper);

    // Event listeners
    const removeBtn = wrapper.querySelector(".remove-layer");
    removeBtn.addEventListener("click", () => { 
        wrapper.remove(); 
        refreshLayerTitles(); 
    });

    const typeRadios = wrapper.querySelectorAll(`input[name="layerType${idx}"]`);
    const homoConfig = wrapper.querySelector('.homogeneous-config');
    const heteroConfig = wrapper.querySelector('.heterogeneous-config');

    typeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const selectedType = wrapper.querySelector(`input[name="layerType${idx}"]:checked`).value;
            
            if (selectedType === 'homogeneous') {
                homoConfig.style.display = 'block';
                heteroConfig.style.display = 'none';
            } else {
                homoConfig.style.display = 'none';
                heteroConfig.style.display = 'block';
                
                const componentsContainer = wrapper.querySelector('.emt-components-container');
                if (componentsContainer.children.length === 0) {
                    addLayerEMTComponent(wrapper);
                }
            }
        });
    });

    // Configuración homogénea
    const modelSelect = wrapper.querySelector(".layer-model");
    const paramsDiv = wrapper.querySelector(".layer-params");
    const fileRow = wrapper.querySelector(".layer-file-row");
    const constantRow = wrapper.querySelector(".layer-constant-row");

    function updateLayerModel() {
        const model = modelSelect.value;
        fileRow.style.display = "none";
        constantRow.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantRow.style.display = "block";
        } else if (dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `layer-${idx}-`);
        } else if (model === "file_nk") {
            fileRow.style.display = "block";
        }
    }

    modelSelect.addEventListener("change", updateLayerModel);
    updateLayerModel();

    // Configuración heterogénea
    const addComponentBtn = wrapper.querySelector('.add-emt-component');
    addComponentBtn.addEventListener('click', () => addLayerEMTComponent(wrapper));

    refreshLayerTitles();
}

function addLayerEMTComponent(layerWrapper) {
    const container = layerWrapper.querySelector('.emt-components-container');
    if (!container) return;
    
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 emt-component bg-white shadow-sm';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-component">✕</button>
        </div>

        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label small fw-bold">Nombre</label>
                <input class="form-control component-name" value="Componente ${componentCount}">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Fracción</label>
                <input class="form-control component-fraction" type="number" min="0" max="1" step="0.01" value="0.5">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo</label>
                <select class="form-select component-model">
                    <option value="constant" selected>Constante</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="file_nk">Archivo</option>
                </select>
            </div>
        </div>

        <div class="component-params mt-3"></div>

        <div class="component-constant mt-3">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small">n</label>
                    <input class="form-control component-n" type="number" step="0.001" value="1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small">k</label>
                    <input class="form-control component-k" type="number" step="0.001" value="0">
                </div>
            </div>
        </div>

        <div class="component-file mt-3" style="display:none;">
            <input type="file" accept=".csv,.txt" class="form-control component-file-input"/>
        </div>
    `;
    
    container.appendChild(componentDiv);
    
    // Event listeners
    const removeBtn = componentDiv.querySelector('.remove-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshLayerComponentTitles(container);
        updateLayerFractionSum(layerWrapper);
    });
    
    const fractionInput = componentDiv.querySelector('.component-fraction');
    fractionInput.addEventListener('input', () => updateLayerFractionSum(layerWrapper));
    
    const modelSelect = componentDiv.querySelector('.component-model');
    const paramsDiv = componentDiv.querySelector('.component-params');
    const constantDiv = componentDiv.querySelector('.component-constant');
    const fileDiv = componentDiv.querySelector('.component-file');
    
    modelSelect.addEventListener('change', () => {
        const model = modelSelect.value;
        constantDiv.style.display = 'none';
        fileDiv.style.display = 'none';
        paramsDiv.innerHTML = '';
        
        if (model === 'constant') {
            constantDiv.style.display = 'block';
        } else if (dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `comp${componentCount}-`);
        } else if (model === 'file_nk') {
            fileDiv.style.display = 'block';
        }
    });
    
    refreshLayerComponentTitles(container);
    updateLayerFractionSum(layerWrapper);
}

function refreshLayerComponentTitles(container) {
    const components = container.querySelectorAll('.emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

function updateLayerFractionSum(layerWrapper) {
    const sumDisplay = layerWrapper.querySelector('.fraction-sum-display');
    if (!sumDisplay) return;
    
    const components = layerWrapper.querySelectorAll('.emt-component');
    let sum = 0;
    
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.component-fraction');
        sum += parseFloat(fractionInput.value) || 0;
    });
    
    sum = Math.round(sum * 1000) / 1000;
    sumDisplay.textContent = sum.toFixed(3);
    
    const alertBox = sumDisplay.closest('.alert');
    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
        if (alertBox) {
            alertBox.classList.remove('alert-warning');
            alertBox.classList.add('alert-success');
        }
    } else {
        sumDisplay.style.color = 'red';
        if (alertBox) {
            alertBox.classList.remove('alert-success');
            alertBox.classList.add('alert-warning');
        }
    }
}

function refreshLayerTitles() {
    const layers = layersContainer.querySelectorAll('.layer-card');
    layers.forEach((layer, i) => {
        const title = layer.querySelector(".layer-title");
        if (title) title.innerText = `Capa ${i + 1}`;
    });
}

// ============================================================================
// RECOLECCIÓN DE DATOS DEL MODELO
// ============================================================================

function collectMediumData(medium) {
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio && typeRadio.value === 'emt';
    
    if (isEMT) {
        const emtModelSelect = document.getElementById(`${medium}-emt-model`);
        const data = {
            type: 'emt',
            emt_model: emtModelSelect ? emtModelSelect.value : 'bruggeman',
            components: []
        };
        
        const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
        
        components.forEach(comp => {
            const nameInput = comp.querySelector('.medium-component-name');
            const fractionInput = comp.querySelector('.medium-component-fraction');
            const modelSelect = comp.querySelector('.medium-component-model');
            
            const compData = {
                name: nameInput ? nameInput.value : 'Componente',
                fraction: fractionInput ? (parseFloat(fractionInput.value) || 0) : 0,
                model: modelSelect ? modelSelect.value : 'constant'
            };
            
            if (compData.model === 'constant') {
                const nInput = comp.querySelector('.medium-comp-n');
                const kInput = comp.querySelector('.medium-comp-k');
                compData.n = nInput ? (parseFloat(nInput.value) || 1.0) : 1.0;
                compData.k = kInput ? (parseFloat(kInput.value) || 0) : 0;
            } else if (dispersionTemplates[compData.model]) {
                compData.params = {};
                const inputs = comp.querySelectorAll('.layer-param');
                inputs.forEach(inp => {
                    const paramName = inp.dataset.param;
                    const val = inp.value.trim();
                    if (paramName && val !== '') {
                        compData.params[paramName] = parseFloat(val);
                    }
                });
            }
            
            data.components.push(compData);
        });
        
        return data;
    } else {
        // Medio homogéneo
        const modelSelect = document.getElementById(`${medium}-model`);
        
        if (!modelSelect) {
            console.warn(`[Warning] No se encontró ${medium}-model, usando valores por defecto`);
            return { type: 'constant', n: 1.0, k: 0 };
        }
        
        const modelType = modelSelect.value;
        const data = { type: modelType };
        
        // Para constant, glass, si - usar campos n, k
        if (modelType === "constant" || modelType === "glass" || modelType === "si") {
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            
            // Valores por defecto según el modelo
            let defaultN = 1.0, defaultK = 0;
            if (modelType === "glass") { defaultN = 1.52; defaultK = 0; }
            if (modelType === "si") { defaultN = 3.87; defaultK = 0.02; }
            
            data.n = nInput ? (parseFloat(nInput.value) || defaultN) : defaultN;
            data.k = kInput ? (parseFloat(kInput.value) || defaultK) : defaultK;
            
        } else if (dispersionTemplates[modelType]) {
            data.params = {};
            const inputs = document.querySelectorAll(`#${medium}-params .layer-param`);
            inputs.forEach(inp => {
                const paramName = inp.dataset.param;
                const val = inp.value.trim();
                if (paramName && val !== '') {
                    data.params[paramName] = parseFloat(val);
                }
            });
        }
        
        return data;
    }
}

function collectLayerData(layerElement) {
    const data = {};
    data.name = layerElement.querySelector(".layer-name").value;
    data.thickness = parseFloat(layerElement.querySelector(".layer-thickness").value) || 0;
    
    const layerType = layerElement.querySelector('input[type="radio"]:checked').value;
    data.layer_type = layerType;

    if (layerType === 'homogeneous') {
        data.model = layerElement.querySelector(".layer-model").value;
        
        if (data.model === 'constant') {
            data.n = parseFloat(layerElement.querySelector(".layer-n-const").value) || 1.5;
            data.k = parseFloat(layerElement.querySelector(".layer-k-const").value) || 0;
        } else if (dispersionTemplates[data.model]) {
            data.params = {};
            const inputs = layerElement.querySelectorAll(".layer-param");
            inputs.forEach(inp => {
                const paramName = inp.dataset.param;
                const val = inp.value.trim();
                if (paramName && val !== '') {
                    data.params[paramName] = parseFloat(val);
                }
            });
        }
    } else if (layerType === 'heterogeneous') {
        data.layer_type = 'emt';
        data.emt_model = layerElement.querySelector('.emt-model-select').value;
        data.components = [];
        
        const components = layerElement.querySelectorAll('.emt-component');
        
        components.forEach(comp => {
            const compData = {
                name: comp.querySelector('.component-name').value,
                fraction: parseFloat(comp.querySelector('.component-fraction').value) || 0,
                model: comp.querySelector('.component-model').value
            };
            
            if (compData.model === 'constant') {
                compData.n = parseFloat(comp.querySelector('.component-n').value) || 1.5;
                compData.k = parseFloat(comp.querySelector('.component-k').value) || 0;
            } else if (dispersionTemplates[compData.model]) {
                compData.params = {};
                const inputs = comp.querySelectorAll('.layer-param');
                inputs.forEach(inp => {
                    const paramName = inp.dataset.param;
                    const val = inp.value.trim();
                    if (paramName && val !== '') {
                        compData.params[paramName] = parseFloat(val);
                    }
                });
            }
            
            data.components.push(compData);
        });
    }
    
    return data;
}

// ============================================================================
// GUARDAR MODELO Y EJECUTAR CÁLCULO
// ============================================================================

async function saveOpticalModel() {
    const wizardSaveBtn = document.getElementById("wizard-save");
    const wizardError = document.getElementById("wizard-error");
    
    wizardSaveBtn.disabled = true;
    wizardSaveBtn.innerText = "Guardando...";
    
    try {
        // Construir modelo
        const model = {
            global: {
                angle: theoreticalConfig.angle,
                polarization: theoreticalConfig.polarization,
                wavelengths: theoreticalConfig.wavelengths,
                outputs: theoreticalConfig.outputs
            },
            ambient: collectMediumData('ambient'),
            substrate: collectMediumData('substrate'),
            layers: [],
            created_at: new Date().toISOString()
        };
        
        // Recolectar capas
        const layerElements = layersContainer.querySelectorAll('.layer-card');
        layerElements.forEach(layerEl => {
            const layerData = collectLayerData(layerEl);
            model.layers.push(layerData);
        });
        
        console.log('[Modelo] Modelo óptico construido:', model);
        
        savedModel = model;
        
        // Cerrar modal
        const modalEl = document.getElementById('modelWizardModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        
        // Actualizar workflow
        updateWorkflowStep(3);
        
        // Mostrar banner de éxito
        showModelSavedBanner(model);
        
        // Ejecutar cálculo teórico automáticamente
        await executeTheoreticalCalculation(model);
        
    } catch (error) {
        console.error('[Error] Error al guardar modelo:', error);
        wizardError.innerText = "Error: " + error.message;
        wizardError.style.display = "block";
    } finally {
        wizardSaveBtn.disabled = false;
        wizardSaveBtn.innerText = "Guardar Modelo";
    }
}

function showModelSavedBanner(model) {
    const banner = document.getElementById("model-saved-banner");
    
    const layersCount = model.layers.length;
    const wlCount = model.global.wavelengths.length;
    const wlMin = Math.min(...model.global.wavelengths).toFixed(1);
    const wlMax = Math.max(...model.global.wavelengths).toFixed(1);
    
    banner.innerHTML = `
        Modelo guardado: ${layersCount} capa(s), ${wlCount} puntos (${wlMin}-${wlMax} nm), ángulo ${model.global.angle}°.
        <a href="#" id="view-model-link">Ver resumen</a>
    `;
    banner.style.display = "block";
    
    // Re-agregar listener
    document.getElementById("view-model-link").addEventListener("click", (e) => {
        e.preventDefault();
        showModelSummaryModal(model);
    });
}

function showModelSummaryModal(model) {
    const modalBody = document.getElementById("summary-modal-body");
    
    let html = '<h6>Configuración Global</h6>';
    html += `<ul>
        <li><strong>Ángulo:</strong> ${model.global.angle}°</li>
        <li><strong>Longitudes de onda:</strong> ${model.global.wavelengths.length} puntos</li>
        <li><strong>Rango:</strong> ${Math.min(...model.global.wavelengths).toFixed(1)} - ${Math.max(...model.global.wavelengths).toFixed(1)} nm</li>
    </ul>`;
    
    html += '<h6>Ambiente</h6>';
    html += `<p>Tipo: ${model.ambient.type}</p>`;
    
    html += '<h6>Sustrato</h6>';
    html += `<p>Tipo: ${model.substrate.type}</p>`;
    
    html += '<h6>Capas</h6>';
    if (model.layers.length === 0) {
        html += '<p>Sin capas (sistema ambiente-sustrato)</p>';
    } else {
        html += '<table class="table table-sm"><thead><tr><th>#</th><th>Nombre</th><th>Espesor</th><th>Tipo</th></tr></thead><tbody>';
        model.layers.forEach((layer, i) => {
            html += `<tr>
                <td>${i + 1}</td>
                <td>${layer.name}</td>
                <td>${layer.thickness} nm</td>
                <td>${layer.layer_type === 'emt' ? 'EMT' : 'Homogénea'}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }
    
    modalBody.innerHTML = html;
    
    const modal = new bootstrap.Modal(document.getElementById('modelSummaryModal'));
    modal.show();
}

// ============================================================================
// CÁLCULO TEÓRICO
// ============================================================================

async function executeTheoreticalCalculation(model) {
    console.log('[Cálculo] Iniciando cálculo teórico...');
    
    const resultsContainer = document.getElementById('theoretical-results-container');
    
    // Mostrar indicador de carga
    resultsContainer.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Calculando...</span>
            </div>
            <h5>Calculando propiedades ópticas...</h5>
            <p class="text-muted">Esto puede tomar unos segundos</p>
        </div>
    `;
    
    try {
        const requestData = {
            model: model,
            wavelengths: model.global.wavelengths,
            angle: model.global.angle,
            polarization: model.global.polarization,
            outputs: model.global.outputs
        };
        
        console.log('[Cálculo] Enviando request:', requestData);
        
        const response = await fetch('/api/calculate-theoretical-pure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error en el cálculo');
        }
        
        console.log('[Cálculo] Resultado recibido:', result);
        
        // Mostrar resultados
        displayTheoreticalResults(result, model);
        
    } catch (error) {
        console.error('[Cálculo] Error:', error);
        
        resultsContainer.innerHTML = `
            <div class="alert alert-danger">
                <h5>Error en el cálculo</h5>
                <p>${error.message}</p>
                <button class="btn btn-primary btn-sm" onclick="executeTheoreticalCalculation(savedModel)">
                    Reintentar
                </button>
            </div>
        `;
    }
}

function displayTheoreticalResults(result, model) {
    const resultsContainer = document.getElementById('theoretical-results-container');
    const outputs = model.global.outputs;
    
    let html = '<div class="results-grid">';
    
    // Gráfica Psi/Delta
    if (outputs.psi_delta && result.data.psi && result.data.delta) {
        html += `
            <div class="graph-wrapper">
                <div class="graph-title">Ψ (Psi) y Δ (Delta) vs Longitud de onda</div>
                <div id="graph-psi-delta" style="height: 400px;"></div>
            </div>
        `;
    }
    
    // Gráfica Reflectancia
    if (outputs.reflectance && result.data.R_s && result.data.R_p) {
        html += `
            <div class="graph-wrapper">
                <div class="graph-title">Reflectancia vs Longitud de onda</div>
                <div id="graph-reflectance" style="height: 400px;"></div>
            </div>
        `;
    }
    
    // Gráfica Transmitancia
    if (outputs.transmittance && result.data.T_s && result.data.T_p) {
        html += `
            <div class="graph-wrapper">
                <div class="graph-title">Transmitancia vs Longitud de onda</div>
                <div id="graph-transmittance" style="height: 400px;"></div>
            </div>
        `;
    }
    
    // Gráfica Absorbancia
    if (outputs.absorbance && result.data.A_s && result.data.A_p) {
        html += `
            <div class="graph-wrapper">
                <div class="graph-title">Absorbancia vs Longitud de onda</div>
                <div id="graph-absorbance" style="height: 400px;"></div>
            </div>
        `;
    }
    
    html += '</div>';
    
    // Información adicional
    html += `
        <div class="info-card mt-4">
            <h5>Información del Cálculo</h5>
            <ul>
                <li><strong>Tiempo de cálculo:</strong> ${result.calculation_time || 'N/A'} s</li>
                <li><strong>Puntos calculados:</strong> ${model.global.wavelengths.length}</li>
                <li><strong>Ángulo de incidencia:</strong> ${model.global.angle}°</li>
            </ul>
        </div>
    `;
    
    resultsContainer.innerHTML = html;
    
    // Renderizar gráficas con Plotly
    const wavelengths = model.global.wavelengths;
    
    if (outputs.psi_delta && result.data.psi && result.data.delta) {
        Plotly.newPlot('graph-psi-delta', [
            {
                x: wavelengths,
                y: result.data.psi,
                name: 'Ψ (Psi)',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#667eea', width: 2 }
            },
            {
                x: wavelengths,
                y: result.data.delta,
                name: 'Δ (Delta)',
                type: 'scatter',
                mode: 'lines',
                yaxis: 'y2',
                line: { color: '#764ba2', width: 2 }
            }
        ], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Ψ (°)', side: 'left' },
            yaxis2: { title: 'Δ (°)', side: 'right', overlaying: 'y' },
            legend: { x: 0.5, y: 1.1, orientation: 'h' },
            margin: { t: 40 }
        }, { responsive: true });
    }
    
    if (outputs.reflectance && result.data.R_s && result.data.R_p) {
        Plotly.newPlot('graph-reflectance', [
            {
                x: wavelengths,
                y: result.data.R_s,
                name: 'Rs',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#e74c3c', width: 2 }
            },
            {
                x: wavelengths,
                y: result.data.R_p,
                name: 'Rp',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#3498db', width: 2 }
            }
        ], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Reflectancia', range: [0, 1] },
            legend: { x: 0.5, y: 1.1, orientation: 'h' },
            margin: { t: 40 }
        }, { responsive: true });
    }
    
    if (outputs.transmittance && result.data.T_s && result.data.T_p) {
        Plotly.newPlot('graph-transmittance', [
            {
                x: wavelengths,
                y: result.data.T_s,
                name: 'Ts',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#2ecc71', width: 2 }
            },
            {
                x: wavelengths,
                y: result.data.T_p,
                name: 'Tp',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#f39c12', width: 2 }
            }
        ], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Transmitancia', range: [0, 1] },
            legend: { x: 0.5, y: 1.1, orientation: 'h' },
            margin: { t: 40 }
        }, { responsive: true });
    }
    
    if (outputs.absorbance && result.data.A_s && result.data.A_p) {
        Plotly.newPlot('graph-absorbance', [
            {
                x: wavelengths,
                y: result.data.A_s,
                name: 'As',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#9b59b6', width: 2 }
            },
            {
                x: wavelengths,
                y: result.data.A_p,
                name: 'Ap',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#1abc9c', width: 2 }
            }
        ], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Absorbancia', range: [0, 1] },
            legend: { x: 0.5, y: 1.1, orientation: 'h' },
            margin: { t: 40 }
        }, { responsive: true });
    }
    
    console.log('[Resultados] Gráficas renderizadas');
}

console.log('[Pruebas Teóricas] Módulo completo cargado');
