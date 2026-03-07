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
// HELPER: safeTypeset
// Llama MathJax.typesetPromise de forma segura aunque MathJax aún no esté listo.
// Si MathJax ya cargó  → renderiza de inmediato.
// Si aún no cargó     → espera el evento 'MathJaxReady' y renderiza después.
// ============================================================================
function safeTypeset(element) {
    if (!element) return;
    if (window._mathJaxReady && window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([element]).catch(err =>
            console.error('[MathJax] Error al renderizar:', err)
        );
    } else {
        window.addEventListener('MathJaxReady', () => {
            window.MathJax.typesetPromise([element]).catch(err =>
                console.error('[MathJax] Error al renderizar (encolado):', err)
            );
        }, { once: true });
    }
}

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

if (document.readyState === 'loading') {
    console.log('[Init] DOM aún se está cargando, esperando DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    console.log('[Init] DOM ya está cargado, inicializando inmediatamente...');
    initializeApp();
}

function initializeApp() {
    console.log('[Init] ===== INICIALIZANDO PRUEBAS TEÓRICAS =====');
    console.log('[Init] document.readyState:', document.readyState);
    
    try {
        initializeTheoreticalMode();
        console.log('[Init] ✅ Modo teórico inicializado');
        
        initializeWizard();
        console.log('[Init] ✅ Wizard inicializado');
        
        updateWorkflowStep(1);
        console.log('[Init] ✅ Workflow actualizado');
        
        console.log('[Init] ===== INICIALIZACIÓN COMPLETADA =====');
    } catch (error) {
        console.error('[Init] ❌ Error durante la inicialización:', error.message);
        console.error('[Init] Stack:', error.stack);
    }
}

function initializeTheoreticalMode() {
    console.log('[InitMode] Iniciando inicialización del modo teórico...');
    
    const methodSelect = document.getElementById('wavelength-method');
    if (methodSelect) {
        methodSelect.addEventListener('change', function() {
            console.log('[Event] Wavelength method cambiado a:', this.value);
            const rangeOption = document.getElementById('wavelength-range-option');
            const singleOption = document.getElementById('wavelength-single-option');
            
            if (rangeOption) {
                rangeOption.style.display = this.value === 'range' ? 'block' : 'none';
            }
            if (singleOption) {
                singleOption.style.display = this.value === 'single' ? 'block' : 'none';
            }
        });
        console.log('[InitMode] ✅ Wavelength method listener agregado');
    } else {
        console.warn('[InitMode] ⚠️ No se encontró wavelength-method');
    }
    
    const angleInput = document.getElementById('incident-angle');
    if (angleInput) {
        angleInput.addEventListener('input', validateTheoreticalAngle);
        angleInput.addEventListener('change', validateTheoreticalAngle);
        console.log('[InitMode] ✅ Angle listeners agregados');
    } else {
        console.warn('[InitMode] ⚠️ No se encontró incident-angle');
    }
    
    const continueBtn = document.getElementById('btn-continue-model');
    if (continueBtn) {
        continueBtn.addEventListener('click', openTheoreticalModelWizard);
        console.log('[InitMode] ✅ Button listener agregado');
    } else {
        console.warn('[InitMode] ⚠️ No se encontró btn-continue-model');
    }
    
    const outputMappings = {
        'output-psi-delta': 'psi_delta',
        'output-reflectance': 'reflectance',
        'output-transmittance': 'transmittance',
        'output-absorbance': 'absorbance',
    };
    
    Object.entries(outputMappings).forEach(([elementId, configKey]) => {
        const checkbox = document.getElementById(elementId);
        if (checkbox) {
            theoreticalConfig.outputs[configKey] = checkbox.checked;
            checkbox.addEventListener('change', function() {
                theoreticalConfig.outputs[configKey] = this.checked;
                console.log(`[Event] ${configKey} = ${this.checked}`);
            });
        } else {
            console.warn(`[InitMode] ⚠️ No se encontró ${elementId}`);
        }
    });
    
    console.log('[InitMode] ✅ Modo teórico completamente inicializado');
}

function validateTheoreticalAngle() {
    console.log('[ValidateAngle] Validando...');
    
    const angleInput = document.getElementById('incident-angle');
    const warning = document.getElementById('angle-warning');
    const continueBtn = document.getElementById('btn-continue-model');
    
    if (!angleInput) {
        console.error('[ValidateAngle] ❌ No se encontró el campo de ángulo');
        if (continueBtn) continueBtn.disabled = true;
        return false;
    }
    
    const angle = parseFloat(angleInput.value);
    
    console.log('[ValidateAngle] Valor parseado:', angle);
    
    if (isNaN(angle)) {
        const msg = 'Debe ingresar un ángulo válido.';
        if (warning) {
            warning.style.display = 'block';
            warning.innerHTML = '<strong>Error:</strong> ' + msg;
        }
        if (continueBtn) continueBtn.disabled = true;
        console.log('[ValidateAngle] ❌', msg);
        return false;
    }
    
    if (angle < 0) {
        const msg = 'El ángulo debe ser mayor o igual a 0°.';
        if (warning) {
            warning.style.display = 'block';
            warning.innerHTML = '<strong>Error:</strong> ' + msg;
        }
        if (continueBtn) continueBtn.disabled = true;
        console.log('[ValidateAngle] ❌', msg);
        return false;
    }
    
    if (angle > 90) {
        const msg = 'El ángulo no puede superar los 90°.';
        if (warning) {
            warning.style.display = 'block';
            warning.innerHTML = '<strong>Error:</strong> ' + msg;
        }
        if (continueBtn) continueBtn.disabled = true;
        console.log('[ValidateAngle] ❌', msg);
        return false;
    }
    
    if (warning) warning.style.display = 'none';
    if (continueBtn) continueBtn.disabled = false;
    console.log('[ValidateAngle] ✅ Ángulo válido:', angle);
    return true;
}

function getTheoreticalWavelengths() {
    console.log('[GetWavelengths] Iniciando...');
    
    const methodSelect = document.getElementById('wavelength-method');
    console.log('[GetWavelengths] methodSelect:', methodSelect);
    
    if (!methodSelect) {
        console.error('[GetWavelengths] ❌ methodSelect es null');
        throw new Error("No se encontró el selector de método de longitud de onda (wavelength-method)");
    }
    
    const method = methodSelect.value;
    console.log('[GetWavelengths] método seleccionado:', method);
    
    let wavelengths = [];
    
    if (method === 'range') {
        console.log('[GetWavelengths] Usando rango...');
        
        const minInput = document.getElementById('wavelength-min');
        const maxInput = document.getElementById('wavelength-max');
        const stepsInput = document.getElementById('wavelength-steps');
        
        if (!minInput || !maxInput || !stepsInput) {
            throw new Error("No se encontraron los campos de rango de longitud de onda (wavelength-min, wavelength-max, wavelength-steps)");
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
        console.log('[GetWavelengths] ✅ Rango generado con', wavelengths.length, 'puntos');
    } else {
        console.log('[GetWavelengths] Usando longitud única...');
        
        const singleInput = document.getElementById('wavelength-single');
        if (!singleInput) {
            throw new Error("No se encontró el campo de longitud de onda única (wavelength-single)");
        }
        
        const single = parseFloat(singleInput.value);
        if (isNaN(single) || single <= 0) {
            throw new Error("Debe ingresar una longitud de onda válida (> 0)");
        }
        wavelengths = [single];
        console.log('[GetWavelengths] ✅ Longitud única:', single);
    }
    
    return wavelengths;
}

function openTheoreticalModelWizard() {
    console.log('[OpenWizard] ===== INICIANDO WIZARD =====');
    
    try {
        if (!validateTheoreticalAngle()) {
            alert('Error: El ángulo de incidencia no es válido (debe estar entre 0° y 90°).');
            return;
        }
        
        let wavelengths = [];
        try {
            wavelengths = getTheoreticalWavelengths();
        } catch (wlError) {
            console.error('[OpenWizard] Error al obtener wavelengths:', wlError.message);
            alert('Error al obtener longitudes de onda: ' + wlError.message);
            return;
        }
        
        const angleInput = document.getElementById('incident-angle');
        if (!angleInput) {
            throw new Error("No se encontró el campo de ángulo de incidencia (incident-angle)");
        }
        
        const angle = parseFloat(angleInput.value);
        if (isNaN(angle)) {
            throw new Error("El ángulo debe ser un número válido");
        }
        
        theoreticalConfig.wavelengths = wavelengths;
        theoreticalConfig.angle = angle;
        theoreticalConfig.polarization = 'both';
        
        const hasOutput = Object.values(theoreticalConfig.outputs).some(v => v === true);
        if (!hasOutput) {
            alert('Error: Debe seleccionar al menos una propiedad para calcular.');
            return;
        }
        
        updateWorkflowStep(2);
        
        currentWizardStep = 1;
        showWizardStep(1);
        
        const modalEl = document.getElementById('modelWizardModal');
        if (!modalEl) {
            throw new Error("No se encontró el modal (modelWizardModal)");
        }
        
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        console.log('[OpenWizard] ===== WIZARD ABIERTO EXITOSAMENTE =====');
        
    } catch (error) {
        console.error('[OpenWizard] ❌ ERROR:', error.message);
        console.error('[OpenWizard] Stack:', error.stack);
        alert('Error al abrir el wizard: ' + error.message);
    }
}

// ============================================================================
// WIZARD - NAVEGACIÓN Y CONTROL
// ============================================================================

let currentWizardStep = 1;
const totalWizardSteps = 3;
let mediumListenersInitialized = false;

function initializeWizard() {
    console.log('[InitWizard] Inicializando wizard...');
    
    const wizardNextBtn = document.getElementById("wizard-next");
    const wizardPrevBtn = document.getElementById("wizard-prev");
    const wizardSaveBtn = document.getElementById("wizard-save");
    
    if (wizardNextBtn) {
        wizardNextBtn.addEventListener("click", nextWizardStep);
        console.log('[InitWizard] ✅ wizard-next listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró wizard-next');
    }
    
    if (wizardPrevBtn) {
        wizardPrevBtn.addEventListener("click", prevWizardStep);
        console.log('[InitWizard] ✅ wizard-prev listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró wizard-prev');
    }
    
    if (wizardSaveBtn) {
        wizardSaveBtn.addEventListener("click", saveOpticalModel);
        console.log('[InitWizard] ✅ wizard-save listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró wizard-save');
    }
    
    const addLayerBtn = document.getElementById("add-layer");
    if (addLayerBtn) {
        addLayerBtn.addEventListener("click", () => addLayer());
        console.log('[InitWizard] ✅ add-layer listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró add-layer');
    }
    
    const viewModelLink = document.getElementById("view-model-link");
    if (viewModelLink) {
        viewModelLink.addEventListener("click", (e) => {
            e.preventDefault();
            if (savedModel) {
                showModelSummaryModal(savedModel);
            }
        });
        console.log('[InitWizard] ✅ view-model-link listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró view-model-link');
    }
    
    console.log('[InitWizard] ✅ Wizard inicializado');
}

function showWizardStep(step) {
    console.log(`[ShowWizardStep] Mostrando paso ${step}`);
    
    if (step === 1 && !mediumListenersInitialized) {
        console.log('[ShowWizardStep] Inicializando listeners de medios...');
        initializeMediumListeners();
        mediumListenersInitialized = true;
        console.log('[ShowWizardStep] ✅ Listeners de medios inicializados');
    }
    
    const allSteps = document.querySelectorAll('.wizard-step');
    allSteps.forEach(s => {
        s.classList.add('d-none');
        s.style.display = 'none';
    });
    
    const currentStepElement = document.querySelector(`[data-step="${step}"]`);
    if (currentStepElement) {
        currentStepElement.classList.remove('d-none');
        currentStepElement.style.display = 'block';
    }
    
    const stepNum = document.getElementById("wizard-step-num");
    if (stepNum) stepNum.innerText = step;
    
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
    
    console.log(`[ShowWizardStep] ✅ Paso ${step} mostrado`);
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
        
        return true;
    }
    
    if (step === 2) {
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
    
    if (step === 3) {
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
    console.log('[InitMediumListeners] ===== INICIALIZANDO LISTENERS DE MEDIOS =====');
    
    const ambientModel = document.getElementById("ambient-model");
    if (ambientModel) {
        ambientModel.addEventListener("change", (e) => {
            updateMediumFields('ambient', e.target.value);
        });
        updateMediumFields('ambient', ambientModel.value);
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró ambient-model');
    }
    
    const substrateModel = document.getElementById("substrate-model");
    if (substrateModel) {
        substrateModel.addEventListener("change", (e) => {
            updateMediumFields('substrate', e.target.value);
        });
        updateMediumFields('substrate', substrateModel.value);
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró substrate-model');
    }
    
    const ambientTypeHomo = document.getElementById("ambient-type-homo");
    const ambientTypeEmt = document.getElementById("ambient-type-emt");
    
    if (ambientTypeHomo) {
        ambientTypeHomo.addEventListener("change", () => {
            updateMediumTypeInterface('ambient', 'homogeneous');
        });
    }
    
    if (ambientTypeEmt) {
        ambientTypeEmt.addEventListener("change", () => {
            updateMediumTypeInterface('ambient', 'emt');
        });
    }
    
    const substrateTypeHomo = document.getElementById("substrate-type-homo");
    const substrateTypeEmt = document.getElementById("substrate-type-emt");
    
    if (substrateTypeHomo) {
        substrateTypeHomo.addEventListener("change", () => {
            updateMediumTypeInterface('substrate', 'homogeneous');
        });
    }
    
    if (substrateTypeEmt) {
        substrateTypeEmt.addEventListener("change", () => {
            updateMediumTypeInterface('substrate', 'emt');
        });
    }
    
    const ambientEmtModel = document.getElementById('ambient-emt-model');
    if (ambientEmtModel) {
        ambientEmtModel.addEventListener('change', () => {
            updateMediumHostSelectOptions('ambient');
        });
    }
    
    const substrateEmtModel = document.getElementById('substrate-emt-model');
    if (substrateEmtModel) {
        substrateEmtModel.addEventListener('change', () => {
            updateMediumHostSelectOptions('substrate');
        });
    }

    setupFileUploadHandlers();
    
    console.log('[InitMediumListeners] ===== LISTENERS INICIALIZADOS EXITOSAMENTE =====');
}

// ============================================================================
// MANEJO DE ARCHIVOS ÓPTICOS
// ============================================================================

function setupFileUploadHandlers() {
    console.log('[SetupFileHandlers] Configurando handlers de archivos...');
    
    const ambientFileInput = document.getElementById('ambient-file');
    if (ambientFileInput) {
        ambientFileInput.addEventListener('change', (e) => {
            handleMediumFileUpload('ambient', e.target);
        });
    }
    
    const substrateFileInput = document.getElementById('substrate-file');
    if (substrateFileInput) {
        substrateFileInput.addEventListener('change', (e) => {
            handleMediumFileUpload('substrate', e.target);
        });
    }
    
    console.log('[SetupFileHandlers] ✅ Handlers de archivos configurados');
}

async function handleMediumFileUpload(medium, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    const parentContainer = fileInput.closest('.card') || fileInput.parentElement;
    
    const prevMessages = parentContainer.querySelectorAll('.file-result-msg, .file-loading-msg, .material-validation-alert');
    prevMessages.forEach(msg => msg.remove());
    
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
    loadingMsg.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>Procesando archivo...</span>
        </div>
    `;
    fileInput.after(loadingMsg);
    
    const formData = new FormData();
    formData.append('file', file);
    
    const modelSelect = document.getElementById(`${medium}-model`);
    const modelType = modelSelect ? modelSelect.value : 'file_nk';
    const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
    formData.append('file_type', fileType);
    
    console.log(`[${medium}] Subiendo archivo: ${file.name}, file_type: ${fileType}`);
    
    try {
        const response = await fetch('/api/upload-optical-data', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        loadingMsg.remove();
        
        if (!result.success) {
            showFileError(fileInput, result.error || 'Error desconocido al procesar archivo');
            return;
        }
        
        if (!result.info || !result.data) {
            showFileError(fileInput, 'Respuesta incompleta del servidor');
            return;
        }
        
        showFileSuccess(fileInput, result);
        fileInput.dataset.opticalData = JSON.stringify(result.data);
        
        // ← ESTO FALTABA
        const validation = await validateMaterialFileAgainstWavelengthMode(result.data.wavelength, fileInput);
        showMaterialValidationResult(validation, fileInput);
        
    } catch (error) {
        loadingMsg.remove();
        showFileError(fileInput, `Error de conexión: ${error.message}`);
        console.error(`[${medium}] Error:`, error);
    }
}

async function handleLayerFileUpload(layerWrapper, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    const prevMessages = fileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg, .material-validation-alert');
    prevMessages.forEach(msg => msg.remove());
    
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
    loadingMsg.innerHTML = `<div class="d-flex align-items-center"><div class="spinner-border spinner-border-sm me-2"></div><span>Procesando archivo...</span></div>`;
    fileInput.after(loadingMsg);
    
    const formData = new FormData();
    formData.append('file', file);
    const modelSelect = layerWrapper.querySelector('.layer-model');
    const modelType = modelSelect ? modelSelect.value : 'file_nk';
    const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
    formData.append('file_type', fileType);
    
    try {
        const response = await fetch('/api/upload-optical-data', { method: 'POST', body: formData });
        const result = await response.json();
        loadingMsg.remove();
        
        if (!result.success) { showFileError(fileInput, result.error || 'Error al procesar archivo'); return; }
        
        showFileSuccess(fileInput, result);
        layerWrapper.dataset.opticalData = JSON.stringify(result.data);
        
        // ← AGREGADO
        const validation = await validateMaterialFileAgainstWavelengthMode(result.data.wavelength, fileInput);
        showMaterialValidationResult(validation, fileInput);
        
    } catch (error) {
        loadingMsg.remove();
        showFileError(fileInput, `Error de conexión: ${error.message}`);
    }
}

async function handleEMTComponentFileUpload(componentDiv, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    const prevMessages = fileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg, .material-validation-alert');
    prevMessages.forEach(msg => msg.remove());
    
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
    loadingMsg.innerHTML = `<div class="d-flex align-items-center"><div class="spinner-border spinner-border-sm me-2"></div><span>Procesando archivo...</span></div>`;
    fileInput.after(loadingMsg);
    
    const formData = new FormData();
    formData.append('file', file);
    const modelSelect = componentDiv.querySelector('.component-model, .medium-component-model');
    const modelType = modelSelect ? modelSelect.value : 'file_nk';
    const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
    formData.append('file_type', fileType);
    
    try {
        const response = await fetch('/api/upload-optical-data', { method: 'POST', body: formData });
        const result = await response.json();
        loadingMsg.remove();
        
        if (!result.success) { showFileError(fileInput, result.error || 'Error al procesar archivo'); return; }
        
        showFileSuccess(fileInput, result);
        componentDiv.dataset.opticalData = JSON.stringify(result.data);
        
        // ← AGREGADO
        const validation = await validateMaterialFileAgainstWavelengthMode(result.data.wavelength, fileInput);
        showMaterialValidationResult(validation, fileInput);
        
    } catch (error) {
        loadingMsg.remove();
        showFileError(fileInput, `Error de conexión: ${error.message}`);
    }
}


function showFileError(fileInput, message) {
    const parent = fileInput.parentElement;
    parent.querySelectorAll('.file-result-msg').forEach(el => el.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
    errorDiv.innerHTML = `
        <strong>❌ Error al procesar archivo</strong>
        <p class="mb-0 mt-1">${message}</p>
    `;
    fileInput.after(errorDiv);
}

function showFileSuccess(fileInput, result) {
    const parent = fileInput.parentElement;
    parent.querySelectorAll('.file-result-msg').forEach(el => el.remove());
    
    const info = result.info;
    const warnings = result.warnings || [];
    
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
    
    const alertClass = warnings.length > 0 ? 'alert-warning' : 'alert-success';
    
    const successDiv = document.createElement('div');
    successDiv.className = `alert ${alertClass} mt-2 file-result-msg`;
    successDiv.innerHTML = `
        <strong>✅ Archivo procesado correctamente</strong>
        <ul class="mb-0 small mt-2">
            <li><strong>Formato:</strong> ${info.format || 'N/A'}</li>
            <li><strong>Puntos:</strong> ${info.points}</li>
            <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
            <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
            <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
            ${info.units_converted ? `<li><strong>Conversión:</strong> ${info.units_converted}</li>` : ''}
        </ul>
        ${warningsHTML}
    `;
    fileInput.after(successDiv);
}


// ============================================================================
// SELECTOR DE HOST PARA MAXWELL-GARNETT
// ============================================================================

function updateMediumHostSelectOptions(medium) {
    const emtModelSelect = document.getElementById(`${medium}-emt-model`);
    if (!emtModelSelect) return;
    
    const isMaxwellGarnett = emtModelSelect.value === 'maxwell-garnett';
    
    let hostContainer = document.getElementById(`${medium}-host-container`);
    
    if (!hostContainer) {
        hostContainer = document.createElement('div');
        hostContainer.id = `${medium}-host-container`;
        hostContainer.className = 'mb-2 mt-2';
        hostContainer.innerHTML = `
            <label class="form-label small fw-bold">Componente matriz (Host)</label>
            <select id="${medium}-host-select" class="form-select form-select-sm">
                <option value="">-- Seleccione el host --</option>
            </select>
            <div class="form-text small">El componente con mayor fracción volumétrica suele ser el host.</div>
        `;
        
        emtModelSelect.parentElement.after(hostContainer);
    }
    
    hostContainer.style.display = isMaxwellGarnett ? 'block' : 'none';
    
    if (!isMaxwellGarnett) return;
    
    const componentsContainer = document.getElementById(`${medium}-emt-components`);
    if (!componentsContainer) return;
    
    const components = componentsContainer.querySelectorAll('.medium-emt-component');
    const hostSelect = document.getElementById(`${medium}-host-select`);
    
    if (!hostSelect) return;
    
    const currentSelection = hostSelect.value;
    hostSelect.innerHTML = '<option value="">-- Seleccione el host --</option>';
    
    let maxFraction = 0;
    let suggestedHostIndex = 0;
    
    components.forEach((comp, index) => {
        const nameInput = comp.querySelector('.medium-component-name');
        const fractionInput = comp.querySelector('.medium-component-fraction');
        
        const name = nameInput ? nameInput.value : `Componente ${index + 1}`;
        const fraction = fractionInput ? parseFloat(fractionInput.value) || 0 : 0;
        
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${name} (f = ${fraction.toFixed(2)})`;
        hostSelect.appendChild(option);
        
        if (fraction > maxFraction) {
            maxFraction = fraction;
            suggestedHostIndex = index;
        }
    });
    
    if (currentSelection !== '' && hostSelect.querySelector(`option[value="${currentSelection}"]`)) {
        hostSelect.value = currentSelection;
    } else if (components.length > 0) {
        hostSelect.value = suggestedHostIndex;
    }
}

function updateHostSelectOptions(layerWrapper) {
    const emtModelSelect = layerWrapper.querySelector('.emt-model-select');
    if (!emtModelSelect) return;
    
    const isMaxwellGarnett = emtModelSelect.value === 'maxwell-garnett';
    
    let hostContainer = layerWrapper.querySelector('.host-select-container');
    
    if (!hostContainer) {
        hostContainer = document.createElement('div');
        hostContainer.className = 'mb-3 mt-2 host-select-container';
        hostContainer.innerHTML = `
            <label class="form-label small fw-bold">Componente matriz (Host)</label>
            <select class="form-select form-select-sm layer-host-select">
                <option value="">-- Seleccione el host --</option>
            </select>
            <div class="form-text small">El componente con mayor fracción volumétrica suele ser el host.</div>
        `;
        
        emtModelSelect.parentElement.after(hostContainer);
    }
    
    hostContainer.style.display = isMaxwellGarnett ? 'block' : 'none';
    
    if (!isMaxwellGarnett) return;
    
    const componentsContainer = layerWrapper.querySelector('.emt-components-container');
    if (!componentsContainer) return;
    
    const components = componentsContainer.querySelectorAll('.emt-component');
    const hostSelect = layerWrapper.querySelector('.layer-host-select');
    
    if (!hostSelect) return;
    
    const currentSelection = hostSelect.value;
    hostSelect.innerHTML = '<option value="">-- Seleccione el host --</option>';
    
    let maxFraction = 0;
    let suggestedHostIndex = 0;
    
    components.forEach((comp, index) => {
        const nameInput = comp.querySelector('.component-name');
        const fractionInput = comp.querySelector('.component-fraction');
        
        const name = nameInput ? nameInput.value : `Componente ${index + 1}`;
        const fraction = fractionInput ? parseFloat(fractionInput.value) || 0 : 0;
        
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${name} (f = ${fraction.toFixed(2)})`;
        hostSelect.appendChild(option);
        
        if (fraction > maxFraction) {
            maxFraction = fraction;
            suggestedHostIndex = index;
        }
    });
    
    if (currentSelection !== '' && hostSelect.querySelector(`option[value="${currentSelection}"]`)) {
        hostSelect.value = currentSelection;
    } else if (components.length > 0) {
        hostSelect.value = suggestedHostIndex;
    }
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
        
        const container = document.getElementById(`${medium}-emt-components`);
        if (container && container.children.length === 0) {
            addMediumEMTComponent(medium);
        }
    }
}

function updateMediumFields(medium, modelType) {
    console.log(`[UpdateMediumFields] Actualizando campos de ${medium} para modelo ${modelType}`);
    
    const paramsDiv = document.getElementById(`${medium}-params`);
    const constantField = document.getElementById(`${medium}-constant-field`);
    const fileUploadDiv = document.getElementById(`${medium}-file-upload`);
    const customEquationDiv = document.getElementById(`${medium}-custom-equation`);
    
    if (!paramsDiv) {
        console.warn(`[UpdateMediumFields] ⚠️ No se encontró ${medium}-params`);
        return;
    }
    
    paramsDiv.innerHTML = "";
    
    if (constantField) constantField.style.display = "none";
    if (fileUploadDiv) fileUploadDiv.style.display = "none";
    if (customEquationDiv) customEquationDiv.style.display = "none";
    
    if (modelType === "constant") {
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput && nInput.value === "") nInput.value = "1.0";
            if (kInput && kInput.value === "") kInput.value = "0";
        }
    }
    else if (modelType === "glass") {
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput) nInput.value = "1.52";
            if (kInput) kInput.value = "0";
        }
    }
    else if (modelType === "si") {
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput) nInput.value = "3.87";
            if (kInput) kInput.value = "0.02";
        }
    }
    else if (modelType === "file_nk") {
        if (fileUploadDiv) {
            fileUploadDiv.style.display = "block";
            const uploadHint = fileUploadDiv.querySelector('.upload-hint');
            if (uploadHint) uploadHint.textContent = 'Formato: wavelength(nm), n, k';
        }
    }
    else if (modelType === "file_epsilon") {
        if (fileUploadDiv) {
            fileUploadDiv.style.display = "block";
            const uploadHint = fileUploadDiv.querySelector('.upload-hint');
            if (uploadHint) uploadHint.textContent = 'Formato: energy(eV), ε₁, ε₂';
        }
    }
    else if (modelType === "custom_equation") {
        if (customEquationDiv) {
            customEquationDiv.style.display = "block";
            
            const latexInput = document.getElementById(`${medium}-custom-latex`);
            const previewDiv = document.getElementById(`${medium}-equation-preview`);
            
            if (latexInput && previewDiv) {
                latexInput.removeEventListener('input', latexInput._previewHandler);
                
                latexInput._previewHandler = function() {
                    updateCustomEquationPreview(medium);
                };
                
                latexInput.addEventListener('input', latexInput._previewHandler);
            }
        }
    }
    else if (dispersionTemplates[modelType]) {
        updateModelFieldsEnhanced(paramsDiv, modelType, `${medium}-`);
    }
    else {
        console.warn(`[UpdateMediumFields] ⚠️ Modelo desconocido: ${modelType}`);
    }
    
    console.log(`[UpdateMediumFields] ✅ Campos actualizados para ${medium}`);
}

function updateCustomEquationPreview(medium) {
    const latexInput = document.getElementById(`${medium}-custom-latex`);
    const previewDiv = document.getElementById(`${medium}-equation-preview`);
    
    if (!latexInput || !previewDiv) return;
    
    const latex = latexInput.value.trim();
    
    if (!latex) {
        previewDiv.innerHTML = '<em class="text-muted">La ecuación se mostrará aquí</em>';
        return;
    }
    
    previewDiv.innerHTML = `$$${latex}$$`;
    
    safeTypeset(previewDiv);
}

// ============================================================================
// FUNCIONES DE INTERFAZ DE DISPERSIÓN
// ============================================================================

function createParamFieldWithOptimize(param, prefix = '') {
    const inputId = `${prefix}${param.name}`;
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'param-field mb-2';
    
    // Sin controles de optimización (Opt / Variación) — solo el input
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
    
    template.params.forEach(param => {
        const field = createParamFieldWithOptimize(param, prefix);
        paramsCard.appendChild(field);
    });
    
    const dynamicContainer = document.createElement('div');
    dynamicContainer.className = 'dynamic-oscillators-container';
    paramsCard.appendChild(dynamicContainer);
    
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
    
    splitContainer.appendChild(paramsColumn);
    splitContainer.appendChild(equationColumn);
    container.appendChild(splitContainer);
    
    // Renderizar ecuación base
    safeTypeset(modelEqDiv);
    
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

// *** FIX 1: setupLivePreview — traversal DOM corregido ***
// paramsCard está dentro de paramsColumn (col-md-6) que está dentro de splitContainer (row)
// equationCard (.equation-preview-section) es hermano de paramsColumn dentro de splitContainer
// Por eso hay que subir DOS niveles desde paramsCard: parentElement (col-md-6) → parentElement (row)
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
        
        // Busca primero por closest (modelo dentro de .model-config-container)
        let previewSection = container.closest('.model-config-container')?.querySelector('.equation-preview-section');
        if (!previewSection) {
            // *** FIX: subir dos niveles (paramsCard → col-md-6 → row) para encontrar el hermano equationCard ***
            previewSection = container.parentElement?.parentElement?.querySelector('.equation-preview-section');
        }
        if (!previewSection) return;
        
        const valueDisplay = previewSection.querySelector('.equation-with-values');
        if (!valueDisplay) return;
        
        if (template.previewFn) {
            const valueEquation = template.previewFn(params);
            valueDisplay.innerHTML = `$$${valueEquation}$$`;
            
                // *** Re-renderizar con safeTypeset ***
                safeTypeset(valueDisplay);
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
    if (!container) {
        console.error(`[addMediumEMTComponent] No se encontró contenedor para ${medium}`);
        return;
    }
    
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-2 mb-2 medium-emt-component';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="small medium-component-title">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger py-0 px-1 remove-medium-component">✕</button>
        </div>
        
        <div class="row g-2">
            <div class="col-4">
                <label class="form-label small">Nombre</label>
                <input class="form-control form-control-sm medium-component-name" value="Comp ${componentCount}">
            </div>
            <div class="col-4">
                <label class="form-label small">Fracción</label>
                <input class="form-control form-control-sm medium-component-fraction" type="number" min="0" max="1" step="0.01" value="0.5">
            </div>
            <div class="col-4">
                <label class="form-label small">Modelo</label>
                <select class="form-select form-select-sm medium-component-model">
                    <option value="constant" selected>Constante</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude_lorentz">Drude-Lorentz</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                    <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                </select>
            </div>
        </div>
        
        <div class="medium-component-params mt-2"></div>
        
        <div class="medium-component-constant mt-2">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small">n</label>
                    <input class="form-control form-control-sm medium-comp-n" type="number" step="0.001" value="1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small">k</label>
                    <input class="form-control form-control-sm medium-comp-k" type="number" step="0.001" value="0">
                </div>
            </div>
        </div>
        
        <div class="medium-component-file mt-2" style="display:none;">
            <input type="file" accept=".csv,.txt,.xlsx" class="form-control form-control-sm medium-comp-file"/>
        </div>
    `;
    
    container.appendChild(componentDiv);
    
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
        updateMediumHostSelectOptions(medium);
    });
    
    const fractionInput = componentDiv.querySelector('.medium-component-fraction');
    fractionInput.addEventListener('input', () => {
        updateMediumFractionSum(medium);
        updateMediumHostSelectOptions(medium);
    });
    
    const nameInput = componentDiv.querySelector('.medium-component-name');
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            updateMediumHostSelectOptions(medium);
        });
    }
    
    const modelSelect = componentDiv.querySelector('.medium-component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params');
    const constantDiv = componentDiv.querySelector('.medium-component-constant');
    const fileDiv = componentDiv.querySelector('.medium-component-file');
    
    function updateComponentModel() {
        const model = modelSelect.value;
        constantDiv.style.display = 'none';
        fileDiv.style.display = 'none';
        paramsDiv.innerHTML = '';
        
        if (model === 'constant') {
            constantDiv.style.display = 'block';
        } else if (dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `${medium}-comp${componentCount}-`);
        } else if (model === 'file_nk' || model === 'file_epsilon') {
            fileDiv.style.display = 'block';
        }
    }
    
    modelSelect.addEventListener('change', updateComponentModel);
    updateComponentModel();
    
    const fileInput = componentDiv.querySelector('.medium-comp-file');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            handleEMTComponentFileUpload(componentDiv, fileInput);
        });
    }
    
    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
    updateMediumHostSelectOptions(medium);
    
    console.log(`[addMediumEMTComponent] Componente ${componentCount} agregado a ${medium}`);
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
                        <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
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

                <div class="d-flex gap-2 mt-3">
                    <button type="button" class="btn btn-sm btn-outline-success"
                            onclick="validateAndCalculateEMT('layer', ${idx})">
                        🧮 Calcular n,k efectivos
                    </button>
                </div>

                <div class="alert alert-warning mt-3 mb-0">
                    <strong>Suma de fracciones:</strong> <span class="fraction-sum-display">0.000</span>
                </div>
            </div>
        </div>
    `;

    layersContainer.appendChild(wrapper);

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
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileRow.style.display = "block";
        }
    }

    modelSelect.addEventListener("change", updateLayerModel);
    updateLayerModel();

    const layerFileInput = wrapper.querySelector('.layer-file');
    if (layerFileInput) {
        layerFileInput.addEventListener('change', () => {
            handleLayerFileUpload(wrapper, layerFileInput);
        });
    }

    const addComponentBtn = wrapper.querySelector('.add-emt-component');
    addComponentBtn.addEventListener('click', () => addLayerEMTComponent(wrapper));

    const emtModelSelect = wrapper.querySelector('.emt-model-select');
    if (emtModelSelect) {
        emtModelSelect.addEventListener('change', () => {
            updateHostSelectOptions(wrapper);
        });
    }

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
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude_lorentz">Drude-Lorentz</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                    <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
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
            <input type="file" accept=".csv,.txt,.xlsx" class="form-control component-file-input"/>
        </div>
    `;
    
    container.appendChild(componentDiv);
    
    const removeBtn = componentDiv.querySelector('.remove-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshLayerComponentTitles(container);
        updateLayerFractionSum(layerWrapper);
        updateHostSelectOptions(layerWrapper);
    });
    
    const fractionInput = componentDiv.querySelector('.component-fraction');
    fractionInput.addEventListener('input', () => {
        updateLayerFractionSum(layerWrapper);
        updateHostSelectOptions(layerWrapper);
    });
    
    const nameInput = componentDiv.querySelector('.component-name');
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            updateHostSelectOptions(layerWrapper);
        });
    }
    
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
        } else if (model === 'file_nk' || model === 'file_epsilon') {
            fileDiv.style.display = 'block';
        }
    });
    
    const compFileInput = componentDiv.querySelector('.component-file-input');
    if (compFileInput) {
        compFileInput.addEventListener('change', () => {
            handleEMTComponentFileUpload(componentDiv, compFileInput);
        });
    }
    
    refreshLayerComponentTitles(container);
    updateLayerFractionSum(layerWrapper);
    updateHostSelectOptions(layerWrapper);
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
    console.log(`[collectMediumData] Recolectando datos de ${medium}...`);
    
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio ? typeRadio.value === 'emt' : false;
    
    const emtRadio = document.getElementById(`${medium}-type-emt`);
    const isEMTbyRadio = emtRadio ? emtRadio.checked : false;
    const finalIsEMT = isEMT || isEMTbyRadio;
    
    if (finalIsEMT) {
        return collectMediumEMTData(medium);
    } else {
        return collectMediumHomogeneousData(medium);
    }
}

function collectMediumHomogeneousData(medium) {
    const modelSelect = document.getElementById(`${medium}-model`);
    const model = modelSelect ? modelSelect.value : 'constant';
    
    if (model === 'constant' || model === 'glass' || model === 'si') {
        const nInput = document.getElementById(`${medium}-n-constant`);
        const kInput = document.getElementById(`${medium}-k-constant`);
        
        const n = nInput ? parseFloat(nInput.value) || 1.0 : 1.0;
        const k = kInput ? parseFloat(kInput.value) || 0.0 : 0.0;
        
        return { type: 'constant', n: n, k: k };
    }
    
    if (model === 'file_nk' || model === 'file_epsilon') {
        const fileInput = document.getElementById(`${medium}-file`);
        
        if (fileInput && fileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(fileInput.dataset.opticalData);
                return {
                    type: model,
                    optical_data: {
                        wavelength: opticalData.wavelength || opticalData.wavelengths,
                        n: opticalData.n,
                        k: opticalData.k
                    }
                };
            } catch (e) {
                console.error(`[collectMediumHomogeneousData] Error parseando optical_data de ${medium}:`, e);
            }
        }
        
        return { type: 'constant', n: 1.0, k: 0.0 };
    }
    
    if (model === 'custom_equation') {
        const latexInput = document.getElementById(`${medium}-custom-latex`);
        const equation = latexInput ? latexInput.value.trim() : '';
        
        if (equation) {
            return { type: 'custom_equation', equation: equation };
        }
        
        return { type: 'constant', n: 1.0, k: 0.0 };
    }
    
    if (dispersionTemplates[model]) {
        const params = collectDispersionParams(medium, model);
        return { type: model, model: model, params: params };
    }
    
    return { type: 'constant', n: 1.0, k: 0.0 };
}

function collectMediumEMTData(medium) {
    const emtModelSelect = document.getElementById(`${medium}-emt-model`);
    const emtModel = emtModelSelect ? emtModelSelect.value : 'bruggeman';
    
    const componentsContainer = document.getElementById(`${medium}-emt-components`);
    const componentDivs = componentsContainer ? componentsContainer.querySelectorAll('.medium-emt-component') : [];
    
    const components = [];
    
    componentDivs.forEach((compDiv, index) => {
        const compData = collectMediumEMTComponentData(compDiv, index);
        if (compData) {
            components.push(compData);
        }
    });
    
    let hostIndex = null;
    if (emtModel === 'maxwell-garnett') {
        const hostSelect = document.getElementById(`${medium}-host-select`);
        if (hostSelect && hostSelect.value !== '') {
            hostIndex = parseInt(hostSelect.value);
        }
    }
    
    const result = {
        type: 'emt',
        emt_model: emtModel,
        components: components
    };
    
    if (hostIndex !== null) {
        result.host_index = hostIndex;
    }
    
    return result;
}

function collectMediumEMTComponentData(compDiv, index) {
    const nameInput = compDiv.querySelector('.medium-component-name');
    const fractionInput = compDiv.querySelector('.medium-component-fraction');
    const modelSelect = compDiv.querySelector('.medium-component-model');
    
    const name = nameInput ? nameInput.value : `Componente ${index + 1}`;
    const fraction = fractionInput ? parseFloat(fractionInput.value) || 0 : 0;
    const model = modelSelect ? modelSelect.value : 'constant';
    
    const compData = { name: name, fraction: fraction, model: model };
    
    if (model === 'constant') {
        const nInput = compDiv.querySelector('.medium-comp-n');
        const kInput = compDiv.querySelector('.medium-comp-k');
        
        compData.type = 'constant';
        compData.n = nInput ? parseFloat(nInput.value) || 1.5 : 1.5;
        compData.k = kInput ? parseFloat(kInput.value) || 0 : 0;
        
        return compData;
    }
    
    if (model === 'file_nk' || model === 'file_epsilon') {
        if (compDiv.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(compDiv.dataset.opticalData);
                compData.type = 'file';
                compData.optical_data = {
                    wavelength: opticalData.wavelength || opticalData.wavelengths,
                    n: opticalData.n,
                    k: opticalData.k
                };
                return compData;
            } catch (e) {
                console.error(`[collectMediumEMTComponentData] Error parseando optical_data:`, e);
            }
        }
        
        const fileInput = compDiv.querySelector('.medium-comp-file');
        if (fileInput && fileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(fileInput.dataset.opticalData);
                compData.type = 'file';
                compData.optical_data = {
                    wavelength: opticalData.wavelength || opticalData.wavelengths,
                    n: opticalData.n,
                    k: opticalData.k
                };
                return compData;
            } catch (e) {
                console.error(`[collectMediumEMTComponentData] Error parseando optical_data del input:`, e);
            }
        }
        
        compData.type = 'constant';
        compData.n = 1.5;
        compData.k = 0;
        return compData;
    }
    
    if (dispersionTemplates[model]) {
        const paramsDiv = compDiv.querySelector('.medium-component-params');
        const params = collectParamsFromContainer(paramsDiv, model);
        
        compData.type = model;
        compData.params = params;
        
        return compData;
    }
    
    compData.type = 'constant';
    compData.n = 1.5;
    compData.k = 0;
    return compData;
}

function collectParamsFromContainer(container, model) {
    const params = {};
    if (!container) return params;

    // Leer TODOS los inputs con data-param, no solo los del template
    const allInputs = container.querySelectorAll('input[data-param]');
    allInputs.forEach(input => {
        const paramName = input.dataset.param;
        const value = input.value.trim();
        if (paramName && value !== '') {
            params[paramName] = parseFloat(value) || 0;
        }
    });

    return params;
}

function collectDispersionParams(medium, model) {
    const paramsContainer = document.getElementById(`${medium}-params`);
    
    if (!paramsContainer) {
        console.warn(`[collectDispersionParams] No se encontró contenedor de parámetros para ${medium}`);
        return {};
    }
    
    return collectParamsFromContainer(paramsContainer, model);
}

function collectLayerData(layerElement) {
    const idx = layerElement.dataset.idx || '0';
    
    const nameInput = layerElement.querySelector('.layer-name');
    const thicknessInput = layerElement.querySelector('.layer-thickness');
    
    const name = nameInput ? nameInput.value : `Capa ${idx}`;
    const thickness = thicknessInput ? parseFloat(thicknessInput.value) || 100 : 100;
    
    const typeRadio = layerElement.querySelector(`input[name^="layerType"]:checked`);
    const layerType = typeRadio ? typeRadio.value : 'homogeneous';
    const isEMT = layerType === 'heterogeneous' || layerType === 'emt';
    
    const layerData = {
        name: name,
        thickness: thickness,
        layer_type: isEMT ? 'emt' : 'homogeneous'
    };
    
    if (isEMT) {
        Object.assign(layerData, collectLayerEMTData(layerElement));
    } else {
        Object.assign(layerData, collectLayerHomogeneousData(layerElement));
    }
    
    return layerData;
}



function collectLayerHomogeneousData(layerElement) {
    const modelSelect = layerElement.querySelector('.layer-model');
    const model = modelSelect ? modelSelect.value : 'cauchy';
    
    if (model === 'constant') {
        const nInput = layerElement.querySelector('.layer-n-const');
        const kInput = layerElement.querySelector('.layer-k-const');
        
        return {
            model: 'constant',
            type: 'constant',
            n: nInput ? parseFloat(nInput.value) || 1.5 : 1.5,
            k: kInput ? parseFloat(kInput.value) || 0 : 0
        };
    }
    
    if (model === 'file_nk' || model === 'file_epsilon') {

        // ── Lugar 1: dataset del wrapper (layer-card) ──────────────────────
        if (layerElement.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(layerElement.dataset.opticalData);
                if (opticalData && opticalData.n && opticalData.n.length > 0) {
                    console.log(`[collectLayerHomogeneousData] ✅ optical_data en layer-card: ${opticalData.n.length} puntos`);
                    return {
                        model: model,
                        type: 'file',
                        optical_data: {
                            wavelength: opticalData.wavelength || opticalData.wavelengths,
                            n: opticalData.n,
                            k: opticalData.k
                        }
                    };
                }
            } catch (e) {
                console.error('[collectLayerHomogeneousData] Error parseando optical_data del wrapper:', e);
            }
        }
        
        // ── Lugar 2: dataset del input .layer-file ─────────────────────────
        const fileInput = layerElement.querySelector('.layer-file');
        if (fileInput && fileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(fileInput.dataset.opticalData);
                if (opticalData && opticalData.n && opticalData.n.length > 0) {
                    console.log(`[collectLayerHomogeneousData] ✅ optical_data en layer-file input: ${opticalData.n.length} puntos`);
                    return {
                        model: model,
                        type: 'file',
                        optical_data: {
                            wavelength: opticalData.wavelength || opticalData.wavelengths,
                            n: opticalData.n,
                            k: opticalData.k
                        }
                    };
                }
            } catch (e) {
                console.error('[collectLayerHomogeneousData] Error parseando optical_data del input:', e);
            }
        }

        // ── Lugar 3: buscar en cualquier input de archivo dentro del card ──
        const anyFileInput = layerElement.querySelector('input[type="file"]');
        if (anyFileInput && anyFileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(anyFileInput.dataset.opticalData);
                if (opticalData && opticalData.n && opticalData.n.length > 0) {
                    console.log(`[collectLayerHomogeneousData] ✅ optical_data en input[type=file] genérico: ${opticalData.n.length} puntos`);
                    return {
                        model: model,
                        type: 'file',
                        optical_data: {
                            wavelength: opticalData.wavelength || opticalData.wavelengths,
                            n: opticalData.n,
                            k: opticalData.k
                        }
                    };
                }
            } catch (e) {
                console.error('[collectLayerHomogeneousData] Error parseando optical_data del input genérico:', e);
            }
        }
        
        // ── Fallback: no se encontraron datos ──────────────────────────────
        console.error('[collectLayerHomogeneousData] ❌ No se encontró optical_data para modelo', model);
        console.error('  layerElement.dataset:', JSON.stringify(layerElement.dataset));
        console.error('  ¿Subiste el archivo y apareció el mensaje verde antes de guardar?');
        return { model: 'cauchy', type: 'cauchy', params: { A: 1.5, B: 0.004, C: 0 } };
    }
    
    if (dispersionTemplates[model]) {
        const paramsDiv = layerElement.querySelector('.layer-params');
        const params = collectParamsFromContainer(paramsDiv, model);
        
        return { model: model, type: model, params: params };
    }
    
    return { model: 'cauchy', type: 'cauchy', params: { A: 1.5, B: 0.004, C: 0 } };
}














function collectLayerEMTData(layerElement) {
    const emtModelSelect = layerElement.querySelector('.emt-model-select');
    const emtModel = emtModelSelect ? emtModelSelect.value : 'bruggeman';
    
    const componentsContainer = layerElement.querySelector('.emt-components-container');
    const componentDivs = componentsContainer ? componentsContainer.querySelectorAll('.emt-component') : [];
    
    const components = [];
    
    componentDivs.forEach((compDiv, index) => {
        const compData = collectLayerEMTComponentData(compDiv, index);
        if (compData) {
            components.push(compData);
        }
    });
    
    let hostIndex = null;
    if (emtModel === 'maxwell-garnett') {
        const hostSelect = layerElement.querySelector('.layer-host-select');
        if (hostSelect && hostSelect.value !== '') {
            hostIndex = parseInt(hostSelect.value);
        }
    }
    
    const result = {
        model: 'emt',
        type: 'emt',
        emt_model: emtModel,
        components: components
    };
    
    if (hostIndex !== null) {
        result.host_index = hostIndex;
    }
    
    return result;
}

function collectLayerEMTComponentData(compDiv, index) {
    const nameInput = compDiv.querySelector('.component-name');
    const fractionInput = compDiv.querySelector('.component-fraction');
    const modelSelect = compDiv.querySelector('.component-model');
    
    const name = nameInput ? nameInput.value : `Componente ${index + 1}`;
    const fraction = fractionInput ? parseFloat(fractionInput.value) || 0 : 0;
    const model = modelSelect ? modelSelect.value : 'constant';
    
    const compData = { name: name, fraction: fraction, model: model };
    
    if (model === 'constant') {
        const nInput = compDiv.querySelector('.component-n');
        const kInput = compDiv.querySelector('.component-k');
        
        compData.type = 'constant';
        compData.n = nInput ? parseFloat(nInput.value) || 1.5 : 1.5;
        compData.k = kInput ? parseFloat(kInput.value) || 0 : 0;
        
        return compData;
    }
    
    if (model === 'file_nk' || model === 'file_epsilon') {
        if (compDiv.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(compDiv.dataset.opticalData);
                compData.type = 'file';
                compData.optical_data = {
                    wavelength: opticalData.wavelength || opticalData.wavelengths,
                    n: opticalData.n,
                    k: opticalData.k
                };
                return compData;
            } catch (e) {
                console.error(`[collectLayerEMTComponentData] Error parseando optical_data:`, e);
            }
        }
        
        const fileInput = compDiv.querySelector('.component-file-input');
        if (fileInput && fileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(fileInput.dataset.opticalData);
                compData.type = 'file';
                compData.optical_data = {
                    wavelength: opticalData.wavelength || opticalData.wavelengths,
                    n: opticalData.n,
                    k: opticalData.k
                };
                return compData;
            } catch (e) {
                console.error(`[collectLayerEMTComponentData] Error parseando optical_data del input:`, e);
            }
        }
        
        compData.type = 'constant';
        compData.n = 1.5;
        compData.k = 0;
        return compData;
    }
    
    if (dispersionTemplates[model]) {
        const paramsDiv = compDiv.querySelector('.component-params');
        const params = collectParamsFromContainer(paramsDiv, model);
        
        compData.type = model;
        compData.params = params;
        
        return compData;
    }
    
    compData.type = 'constant';
    compData.n = 1.5;
    compData.k = 0;
    return compData;
}

// ============================================================================
// UI DE SELECCIÓN DE GRÁFICAS
// ============================================================================
function createLayerNKSelector(layers, opticalConstants) {
    const container = document.createElement('div');
    container.className = 'layer-nk-selector card p-3 mb-4';
    container.id = 'layer-nk-selector';
    
    if (!layers || layers.length === 0) {
        // Sin capas: mostrar selector solo con ambiente y sustrato
        container.innerHTML = `
            <h6 class="mb-3">Constantes Ópticas por Capa (n, k)</h6>
            
            <div class="row mb-3">
                <div class="col-12">
                    <label class="form-label small fw-bold">Seleccione las capas a visualizar:</label>
                    <div class="layer-checkboxes-container d-flex flex-wrap gap-2"></div>
                </div>
            </div>
            
            <div class="row mb-3">
                <div class="col-12">
                    <label class="form-label small fw-bold">Tipo de gráfica:</label>
                    <div class="btn-group w-100" role="group">
                        <input type="radio" class="btn-check" name="nkGraphType" id="nkGraphTypeCombined" value="combined" checked>
                        <label class="btn btn-outline-primary btn-sm" for="nkGraphTypeCombined">n y k combinadas</label>
                        
                        <input type="radio" class="btn-check" name="nkGraphType" id="nkGraphTypeSeparate" value="separate">
                        <label class="btn btn-outline-primary btn-sm" for="nkGraphTypeSeparate">n y k separadas</label>
                        
                        <input type="radio" class="btn-check" name="nkGraphType" id="nkGraphTypeAll" value="all">
                        <label class="btn btn-outline-primary btn-sm" for="nkGraphTypeAll">Todas (3 gráficas)</label>
                    </div>
                </div>
            </div>
            
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <button type="button" class="btn btn-sm btn-outline-secondary me-1" id="btn-select-all-layers">Todas</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-deselect-all-layers">Ninguna</button>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btn-render-nk-graphs">Mostrar Gráficas</button>
            </div>
            
            <div id="nk-graphs-container" class="mt-4"></div>
        `;

        const checkboxesContainer = container.querySelector('.layer-checkboxes-container');
        checkboxesContainer.appendChild(createLayerCheckbox('ambient', 'Ambiente', true));
        checkboxesContainer.appendChild(createLayerCheckbox('substrate', 'Sustrato', true));

        setupLayerNKSelectorListeners(container, [], opticalConstants);
        return container;
    }
    
    container.innerHTML = `
        <h6 class="mb-3">Constantes Ópticas por Capa (n, k)</h6>
        
        <div class="row mb-3">
            <div class="col-12">
                <label class="form-label small fw-bold">Seleccione las capas a visualizar:</label>
                <div class="layer-checkboxes-container d-flex flex-wrap gap-2"></div>
            </div>
        </div>
        
        <div class="row mb-3">
            <div class="col-12">
                <label class="form-label small fw-bold">Tipo de gráfica:</label>
                <div class="btn-group w-100" role="group">
                    <input type="radio" class="btn-check" name="nkGraphType" id="nkGraphTypeCombined" value="combined" checked>
                    <label class="btn btn-outline-primary btn-sm" for="nkGraphTypeCombined">n y k combinadas</label>
                    
                    <input type="radio" class="btn-check" name="nkGraphType" id="nkGraphTypeSeparate" value="separate">
                    <label class="btn btn-outline-primary btn-sm" for="nkGraphTypeSeparate">n y k separadas</label>
                    
                    <input type="radio" class="btn-check" name="nkGraphType" id="nkGraphTypeAll" value="all">
                    <label class="btn btn-outline-primary btn-sm" for="nkGraphTypeAll">Todas (3 gráficas)</label>
                </div>
            </div>
        </div>
        
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <button type="button" class="btn btn-sm btn-outline-secondary me-1" id="btn-select-all-layers">Todas</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-deselect-all-layers">Ninguna</button>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="btn-render-nk-graphs">Mostrar Gráficas</button>
        </div>
        
        <div id="nk-graphs-container" class="mt-4"></div>
    `;
    
    const checkboxesContainer = container.querySelector('.layer-checkboxes-container');
    checkboxesContainer.appendChild(createLayerCheckbox('ambient', 'Ambiente', false));
    
    layers.forEach((layer, index) => {
        const layerName = layer.name || `Capa ${index + 1}`;
        const checkbox = createLayerCheckbox(`layer-${index}`, layerName, true);
        checkbox.dataset.layerIndex = index;
        checkboxesContainer.appendChild(checkbox);
    });
    
    checkboxesContainer.appendChild(createLayerCheckbox('substrate', 'Sustrato', false));
    
    setupLayerNKSelectorListeners(container, layers, opticalConstants);
    
    return container;
}


function showModelSavedBanner(model) {
    const banner = document.getElementById("model-saved-banner");
    
    if (!banner) {
        console.warn('[showModelSavedBanner] Elemento model-saved-banner no encontrado');
        return;
    }
    
    const layersCount = model.layers.length;
    const wlCount = model.global.wavelengths.length;
    const wlMin = Math.min(...model.global.wavelengths).toFixed(1);
    const wlMax = Math.max(...model.global.wavelengths).toFixed(1);
    
    banner.innerHTML = `
        <div class="card border-success">
            <div class="card-body bg-success bg-opacity-10">
                <p class="mb-2">
                    <strong>✓ Modelo óptico guardado correctamente</strong>
                </p>
                <p class="mb-3 text-muted small">
                    <strong>Archivo:</strong> optical_model_${new Date().toISOString().slice(0,19).replace(/[-T:]/g, (m, i) => i < 10 ? m : i === 10 ? '_' : '')}.json<br>
                    <strong>Configuración:</strong> ${layersCount} capa(s), ${wlCount} puntos (${wlMin}-${wlMax} nm), ángulo ${model.global.angle}°
                </p>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-success btn-sm" onclick="showModelSummaryModal(window.savedModel)">
                        Ver resumen del modelo
                    </button>
                </div>
            </div>
        </div>
    `;
    banner.style.display = "block";
}

function createLayerCheckbox(id, label, checked = true) {
    const div = document.createElement('div');
    div.className = 'form-check form-check-inline';
    div.innerHTML = `
        <input class="form-check-input layer-nk-checkbox" type="checkbox" id="nk-${id}" value="${id}" ${checked ? 'checked' : ''}>
        <label class="form-check-label small" for="nk-${id}">${label}</label>
    `;
    return div;
}

function setupLayerNKSelectorListeners(container, layers, opticalConstants) {
    const selectAllBtn = container.querySelector('#btn-select-all-layers');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            container.querySelectorAll('.layer-nk-checkbox').forEach(cb => cb.checked = true);
        });
    }
    
    const deselectAllBtn = container.querySelector('#btn-deselect-all-layers');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            container.querySelectorAll('.layer-nk-checkbox').forEach(cb => cb.checked = false);
        });
    }
    
    const renderBtn = container.querySelector('#btn-render-nk-graphs');
    if (renderBtn) {
        renderBtn.addEventListener('click', () => {
            renderSelectedLayerNKGraphs(container, layers, opticalConstants);
        });
    }
}

function renderSelectedLayerNKGraphs(selectorContainer, layers, opticalConstants) {
    const graphsContainer = selectorContainer.querySelector('#nk-graphs-container');
    if (!graphsContainer) return;
    
    graphsContainer.innerHTML = '';
    
    const graphType = selectorContainer.querySelector('input[name="nkGraphType"]:checked')?.value || 'combined';
    const selectedCheckboxes = selectorContainer.querySelectorAll('.layer-nk-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        graphsContainer.innerHTML = `<div class="alert alert-warning">Seleccione al menos una capa.</div>`;
        return;
    }
    
    const wavelengths = opticalConstants.wavelengths || [];
    
    if (wavelengths.length === 0) {
        graphsContainer.innerHTML = `<div class="alert alert-danger">No hay datos de longitud de onda.</div>`;
        return;
    }
    
    selectedCheckboxes.forEach(checkbox => {
        const value = checkbox.value;
        let layerData = null;
        let layerName = '';
        
        if (value === 'ambient') {
            layerData = opticalConstants.ambient;
            layerName = 'Ambiente';
        } else if (value === 'substrate') {
            layerData = opticalConstants.substrate;
            layerName = 'Sustrato';
        } else if (value.startsWith('layer-')) {
            const layerIndex = parseInt(value.replace('layer-', ''));
            layerData = opticalConstants.layers?.[layerIndex];
            layerName = layers[layerIndex]?.name || `Capa ${layerIndex + 1}`;
        }
        
        if (layerData && layerData.n && layerData.k) {
            renderLayerNKGraphs(graphsContainer, wavelengths, layerData, layerName, graphType);
        }
    });
}

function renderLayerNKGraphs(container, wavelengths, layerData, layerName, graphType) {
    const n = layerData.n;
    const k = layerData.k;
    const safeId = layerName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    const layerWrapper = document.createElement('div');
    layerWrapper.className = 'layer-nk-graphs-wrapper mb-4 p-3 border rounded';
    layerWrapper.innerHTML = `<h6 class="text-primary mb-3">${layerName}</h6>`;
    
    const graphsRow = document.createElement('div');
    graphsRow.className = 'row';
    
    const showCombined = graphType === 'combined' || graphType === 'all';
    const showSeparate = graphType === 'separate' || graphType === 'all';
    
    if (showCombined) {
        const combinedId = `nk-combined-${safeId}`;
        const combinedCol = document.createElement('div');
        combinedCol.className = graphType === 'all' ? 'col-md-4 mb-3' : 'col-12 mb-3';
        combinedCol.innerHTML = `
            <div class="graph-wrapper p-2 bg-white rounded">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold">n y k vs λ</span>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="downloadGraphPNG('${combinedId}')"><small>PNG</small></button>
                </div>
                <div id="${combinedId}" style="width:100%; height:280px;"></div>
            </div>
        `;
        graphsRow.appendChild(combinedCol);
        setTimeout(() => plotNKCombined(combinedId, wavelengths, n, k, layerName), 50);
    }
    
    if (showSeparate) {
        const nId = `n-${safeId}`;
        const kId = `k-${safeId}`;
        const colClass = graphType === 'all' ? 'col-md-4 mb-3' : 'col-md-6 mb-3';
        
        const nCol = document.createElement('div');
        nCol.className = colClass;
        nCol.innerHTML = `
            <div class="graph-wrapper p-2 bg-white rounded">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold">n vs λ</span>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="downloadGraphPNG('${nId}')"><small>PNG</small></button>
                </div>
                <div id="${nId}" style="width:100%; height:280px;"></div>
            </div>
        `;
        graphsRow.appendChild(nCol);
        
        const kCol = document.createElement('div');
        kCol.className = colClass;
        kCol.innerHTML = `
            <div class="graph-wrapper p-2 bg-white rounded">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold">k vs λ</span>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="downloadGraphPNG('${kId}')"><small>PNG</small></button>
                </div>
                <div id="${kId}" style="width:100%; height:280px;"></div>
            </div>
        `;
        graphsRow.appendChild(kCol);
        
        setTimeout(() => {
            plotNSingle(nId, wavelengths, n, layerName);
            plotKSingle(kId, wavelengths, k, layerName);
        }, 50);
    }
    
    layerWrapper.appendChild(graphsRow);
    container.appendChild(layerWrapper);
}

function plotNKCombined(divId, wavelengths, n, k, title) {
    const trace1 = {
        x: wavelengths, y: n, name: 'n', type: 'scatter', mode: 'lines',
        line: { color: '#2196F3', width: 2 }, yaxis: 'y'
    };
    const trace2 = {
        x: wavelengths, y: k, name: 'k', type: 'scatter', mode: 'lines',
        line: { color: '#FF5722', width: 2 }, yaxis: 'y2'
    };
    
    const layout = {
        title: { text: `${title}: n, k vs λ`, font: { size: 14 } },
        xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'n', titlefont: { color: '#2196F3' }, tickfont: { color: '#2196F3' }, gridcolor: '#e0e0e0' },
        yaxis2: { title: 'k', titlefont: { color: '#FF5722' }, tickfont: { color: '#FF5722' }, overlaying: 'y', side: 'right' },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 50, l: 60, r: 60 },
        plot_bgcolor: 'white', paper_bgcolor: 'white'
    };
    
    Plotly.newPlot(divId, [trace1, trace2], layout, { responsive: true, displayModeBar: false });
}

function plotNSingle(divId, wavelengths, n, title) {
    const trace = {
        x: wavelengths, y: n, name: 'n', type: 'scatter', mode: 'lines',
        line: { color: '#2196F3', width: 2 }
    };
    const layout = {
        title: { text: `${title}: n vs λ`, font: { size: 14 } },
        xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'n', gridcolor: '#e0e0e0' },
        margin: { t: 50, b: 50, l: 60, r: 30 },
        plot_bgcolor: 'white', paper_bgcolor: 'white'
    };
    Plotly.newPlot(divId, [trace], layout, { responsive: true, displayModeBar: false });
}

function plotKSingle(divId, wavelengths, k, title) {
    const trace = {
        x: wavelengths, y: k, name: 'k', type: 'scatter', mode: 'lines',
        line: { color: '#FF5722', width: 2 }
    };
    const layout = {
        title: { text: `${title}: k vs λ`, font: { size: 14 } },
        xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'k', gridcolor: '#e0e0e0' },
        margin: { t: 50, b: 50, l: 60, r: 30 },
        plot_bgcolor: 'white', paper_bgcolor: 'white'
    };
    Plotly.newPlot(divId, [trace], layout, { responsive: true, displayModeBar: false });
}

// ============================================================================
// VISUALIZACIÓN DE RESULTADOS TEÓRICOS
// ============================================================================

let lastTheoreticalResults = null;
let lastTheoreticalModel = null;

function downloadTheoreticalDataCSV() {
    if (!lastTheoreticalResults || !lastTheoreticalModel) {
        alert('No hay datos para descargar. Realice un cálculo primero.');
        return;
    }
    
    const data = lastTheoreticalResults.data || {};
    const opticalConstants = lastTheoreticalResults.optical_constants || {};
    const wavelengths = opticalConstants.wavelengths || lastTheoreticalModel.global?.wavelengths || [];
    
    if (wavelengths.length === 0) {
        alert('No hay datos de longitud de onda.');
        return;
    }
    
    let headers = ['wavelength_nm'];
    let columns = [wavelengths];
    
    if (data.psi?.length > 0) { headers.push('psi_deg'); columns.push(data.psi); }
    if (data.delta?.length > 0) { headers.push('delta_deg'); columns.push(data.delta); }
    if (data.R_s?.length > 0) { headers.push('R_s'); columns.push(data.R_s); }
    if (data.R_p?.length > 0) { headers.push('R_p'); columns.push(data.R_p); }
    if (data.T_s?.length > 0) { headers.push('T_s'); columns.push(data.T_s); }
    if (data.T_p?.length > 0) { headers.push('T_p'); columns.push(data.T_p); }
    if (data.A_s?.length > 0) { headers.push('A_s'); columns.push(data.A_s); }
    if (data.A_p?.length > 0) { headers.push('A_p'); columns.push(data.A_p); }
    
    if (opticalConstants.layers) {
        opticalConstants.layers.forEach((layer, idx) => {
            const name = (layer.name || `Capa${idx+1}`).replace(/\s+/g, '_');
            if (layer.n?.length > 0) { headers.push(`n_${name}`); columns.push(layer.n); }
            if (layer.k?.length > 0) { headers.push(`k_${name}`); columns.push(layer.k); }
        });
    }
    
    let csv = headers.join(',') + '\n';
    for (let i = 0; i < wavelengths.length; i++) {
        csv += columns.map(col => col[i]?.toFixed(6) ?? '').join(',') + '\n';
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `theoretical_data_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadGraphPNG(graphId) {
    const graphDiv = document.getElementById(graphId);
    if (!graphDiv || !graphDiv.data) {
        alert('Gráfica no disponible.');
        return;
    }
    
    Plotly.downloadImage(graphDiv, {
        format: 'png',
        width: 1200,
        height: 600,
        filename: `${graphId}_${new Date().toISOString().slice(0,10)}`
    });
}

async function downloadAllGraphsPDF() {
    if (!lastTheoreticalResults) {
        alert('No hay datos para generar PDF.');
        return;
    }
    
    const graphDivs = document.querySelectorAll('[id^="graph-"]');
    if (graphDivs.length === 0) {
        alert('No hay gráficas para exportar.');
        return;
    }
    
    let html = `<!DOCTYPE html><html><head><title>Resultados Teóricos</title>
        <style>body{font-family:Arial;padding:20px}h1{color:#1976D2}img{max-width:100%;margin:10px 0}</style></head><body>
        <h1>Resultados de Cálculo Teórico</h1>
        <p><strong>Fecha:</strong> ${new Date().toLocaleDateString()} | <strong>Ángulo:</strong> ${lastTheoreticalModel.global?.angle}° | <strong>Capas:</strong> ${lastTheoreticalModel.layers?.length || 0}</p>`;
    
    for (const div of graphDivs) {
        if (div.data) {
            try {
                const img = await Plotly.toImage(div, { format: 'png', width: 800, height: 400 });
                html += `<div><h3>${div.id.replace(/-/g, ' ')}</h3><img src="${img}"></div>`;
            } catch (e) { console.warn(e); }
        }
    }
    
    html += '</body></html>';
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
}


async function saveOpticalModel() {
    const wizardSaveBtn = document.getElementById("wizard-save");
    const wizardError = document.getElementById("wizard-error");
    
    if (!wizardSaveBtn || !wizardError) {
        console.error('[Error] Elementos del wizard no encontrados');
        alert('Error: Elementos de la interfaz no encontrados');
        return;
    }
    
    wizardSaveBtn.disabled = true;
    wizardSaveBtn.innerText = "Guardando...";
    wizardError.style.display = "none";
    
    try {
        if (!theoreticalConfig.angle || !theoreticalConfig.wavelengths || theoreticalConfig.wavelengths.length === 0) {
            throw new Error("Configuración incompleta: falta ángulo o longitudes de onda");
        }
        
        const model = {
            global: {
                angle: theoreticalConfig.angle,
                polarization: theoreticalConfig.polarization,
                wavelengths: theoreticalConfig.wavelengths,
                outputs: theoreticalConfig.outputs
            },
            ambient: null,
            substrate: null,
            layers: [],
            created_at: new Date().toISOString()
        };
        
        model.ambient = collectMediumData('ambient');
        model.substrate = collectMediumData('substrate');
        
        // ── DEBUG: ver qué hay en el DOM antes de recolectar ──────────────
        const layerElements = document.querySelectorAll('#layers-container .layer-card');
        console.log('=== DEBUG CAPAS ===');
        console.log('Total layer-cards encontrados:', layerElements.length);
        console.log('layers-container existe:', !!document.getElementById('layers-container'));
        layerElements.forEach((el, i) => {
            console.log(`  layer-card[${i}] dataset.opticalData:`, el.dataset.opticalData ? '✅ tiene datos' : '❌ vacío');
            el.querySelectorAll('input[type="file"]').forEach((fi, j) => {
                console.log(`    fileInput[${j}] (.${fi.className}) dataset.opticalData:`, fi.dataset.opticalData ? '✅ tiene datos' : '❌ vacío');
            });
            const modelSel = el.querySelector('.layer-model');
            console.log(`  layer-card[${i}] modelo seleccionado:`, modelSel ? modelSel.value : 'no encontrado');
        });
        console.log('===================');
        // ── FIN DEBUG ────────────────────────────────────────────────────
        
        for (const layerEl of layerElements) {
            const layerData = collectLayerData(layerEl);
            model.layers.push(layerData);
        }
        
        savedModel = model;
        window.savedModel = model;
        
        // DEBUG: verificar que las capas tienen optical_data
        model.layers.forEach((layer, i) => {
            if (layer.type === 'file') {
                const hasData = layer.optical_data && layer.optical_data.wavelength && layer.optical_data.wavelength.length > 0;
                console.log(`[saveOpticalModel] Capa ${i} (${layer.name}): type=file, optical_data=${hasData ? '✅ ' + layer.optical_data.wavelength.length + ' puntos' : '❌ VACÍO'}`);
            } else {
                console.log(`[saveOpticalModel] Capa ${i} (${layer.name}): type=${layer.type}, model=${layer.model}`);
            }
        });
        
        const modalEl = document.getElementById('modelWizardModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
        
        updateWorkflowStep(3);
        showModelSavedBanner(model);
        
        await executeTheoreticalCalculation(model);
        
    } catch (error) {
        console.error('[Error] Error al guardar modelo:', error);
        wizardError.innerText = "❌ Error: " + error.message;
        wizardError.style.display = "block";
    } finally {
        wizardSaveBtn.disabled = false;
        wizardSaveBtn.innerText = "Guardar Modelo";
    }
}


function showModelSavedBanner(model) {
    const banner = document.getElementById("model-saved-banner");
    
    if (!banner) {
        console.warn('[showModelSavedBanner] Elemento model-saved-banner no encontrado');
        return;
    }
    
    const layersCount = model.layers.length;
    const wlCount = model.global.wavelengths.length;
    const wlMin = Math.min(...model.global.wavelengths).toFixed(1);
    const wlMax = Math.max(...model.global.wavelengths).toFixed(1);
    
    banner.innerHTML = `
        <div class="card border-success">
            <div class="card-body bg-success bg-opacity-10">
                <p class="mb-2">
                    <strong>✓ Modelo óptico guardado correctamente</strong>
                </p>
                <p class="mb-3 text-muted small">
                    <strong>Archivo:</strong> optical_model_${new Date().toISOString().slice(0,19).replace(/[-T:]/g, (m, i) => i < 10 ? m : i === 10 ? '_' : '')}.json<br>
                    <strong>Configuración:</strong> ${layersCount} capa(s), ${wlCount} puntos (${wlMin}-${wlMax} nm), ángulo ${model.global.angle}°
                </p>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-success btn-sm" onclick="showModelSummaryModal(window.savedModel)">
                        Ver resumen del modelo
                    </button>
                </div>
            </div>
        </div>
    `;
    banner.style.display = "block";
}





function showModelSummaryModal(model) {
    if (!model) {
        console.error('❌ showModelSummaryModal: model es null/undefined');
        return;
    }

    const modalBody = document.getElementById("summary-modal-body");
    if (!modalBody) {
        console.error('❌ No se encontró #summary-modal-body');
        return;
    }
    
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
    
    const modalEl = document.getElementById('modelSummaryModal');
    if (!modalEl) {
        console.error('❌ No se encontró #modelSummaryModal');
        return;
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

// ⭐ FIX: Exponer globalmente para que onclick y consola puedan acceder
window.showModelSavedBanner = showModelSavedBanner;
window.showModelSummaryModal = showModelSummaryModal;

// ============================================================================
// CÁLCULO TEÓRICO
// ============================================================================

async function executeTheoreticalCalculation(model) {
    console.log('[Cálculo] Iniciando cálculo teórico...');
    
    const resultsContainer = document.getElementById('results-container');
    
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
        
        const response = await fetch('/api/calculate-theoretical-pure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error en el cálculo');
        }
        
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

// ============================================================================
// SELECTOR DE GRÁFICAS
// ============================================================================

let currentGraphType = 'psi-delta';
let currentLayerIndex = 0;

function initializeGraphSelector() {
    const btn = document.getElementById('graph-selector-btn');
    const dropdown = document.getElementById('graph-selector-dropdown');
    const items = document.querySelectorAll('.graph-selector-item');
    
    if (!btn || !dropdown) return;
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('open');
        dropdown.classList.toggle('show');
    });
    
    document.addEventListener('click', () => {
        btn.classList.remove('open');
        dropdown.classList.remove('show');
    });
    
    items.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            selectGraphType(type);
            
            items.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const title = item.querySelector('.item-title').textContent;
            document.getElementById('graph-selector-label').textContent = title;
            
            btn.classList.remove('open');
            dropdown.classList.remove('show');
        });
    });
    
    const showGridCheck = document.getElementById('show-grid');
    const whiteBgCheck = document.getElementById('white-bg');
    
    if (showGridCheck) {
        showGridCheck.addEventListener('change', () => refreshCurrentGraphs());
    }
    if (whiteBgCheck) {
        whiteBgCheck.addEventListener('change', () => refreshCurrentGraphs());
    }
}

function selectGraphType(type) {
    currentGraphType = type;
    
    if (!lastTheoreticalResults || !lastTheoreticalModel) {
        console.warn('[selectGraphType] No hay resultados para mostrar');
        return;
    }
    
    const container = document.getElementById('results-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const data = lastTheoreticalResults.data || {};
    const opticalConstants = lastTheoreticalResults.optical_constants || {};
    const wavelengths = opticalConstants.wavelengths || lastTheoreticalModel.global?.wavelengths || [];
    
    const layerSelector = document.getElementById('layerSelectorInline');
    if (layerSelector) {
        layerSelector.style.display = type === 'nk' ? 'inline-flex' : 'none';
    }

    const emtLayerSelector = document.getElementById('emtLayerSelectorInline');
    if (emtLayerSelector) {
        emtLayerSelector.style.display = type === 'nk-emt' ? 'inline-flex' : 'none';
    }

    const nkOptions = document.getElementById('nkOptionsInline');
    if (nkOptions) {
        nkOptions.style.display = type === 'nk' ? 'inline-flex' : 'none';
    }

    const layerTitle = document.getElementById('selectedLayerTitle');
    if (layerTitle) {
        layerTitle.style.display = 'none';
    }
    
    switch (type) {
        case 'psi-delta':
            renderPsiDeltaGraphs(container, wavelengths, data.psi, data.delta);
            break;
        case 'nk':
            renderNKGraphsWithSelector(container, wavelengths, opticalConstants, lastTheoreticalModel.layers || []);
            break;
        case 'nk-emt':
            renderNKEmtGraphs();
            break;
        case 'reflectance':
            renderRTAGraphs(container, 'R', 'Reflectancia', wavelengths, data.R_s, data.R_p);
            break;
        case 'transmittance':
            renderRTAGraphs(container, 'T', 'Transmitancia', wavelengths, data.T_s, data.T_p);
            break;
        case 'absorbance':
            renderRTAGraphs(container, 'A', 'Absorbancia', wavelengths, data.A_s, data.A_p);
            break;
    }
}

function refreshCurrentGraphs() {
    selectGraphType(currentGraphType);
}

function renderPsiDeltaGraphs(container, wavelengths, psi, delta) {
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-buttons';
    downloadDiv.innerHTML = `
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-psi')">Descargar Ψ (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-delta')">Descargar Δ (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-psi-delta')">Descargar Combinada (PNG)</button>
        <button class="btn btn-outline-secondary" onclick="downloadAllGraphsPDF()">Descargar todas (PDF)</button>
    `;
    container.appendChild(downloadDiv);
    
    if (psi?.length > 0) {
        container.appendChild(createGraphCard('graph-psi', 'Ψ (Psi) vs Longitud de Onda', (divId) => {
            plotSingleLine(divId, wavelengths, psi, 'Ψ', '#667eea', 'Ψ (°)', [0, 90]);
        }));
    }
    
    if (delta?.length > 0) {
        container.appendChild(createGraphCard('graph-delta', 'Δ (Delta) vs Longitud de Onda', (divId) => {
            plotSingleLine(divId, wavelengths, delta, 'Δ', '#764ba2', 'Δ (°)', [0, 360]);
        }));
    }
    
    if (psi?.length > 0 && delta?.length > 0) {
        container.appendChild(createGraphCard('graph-psi-delta', 'Ψ y Δ vs Longitud de Onda', (divId) => {
            plotDualAxis(divId, wavelengths, psi, delta, 'Ψ', 'Δ', '#667eea', '#764ba2', 'Ψ (°)', 'Δ (°)', [0, 90], [0, 360]);
        }));
    }
}

function renderRTAGraphs(container, prefix, label, wavelengths, dataS, dataP) {
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-buttons';
    downloadDiv.innerHTML = `
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-${prefix}s')">Descargar ${prefix}s (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-${prefix}p')">Descargar ${prefix}p (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-${prefix}-combined')">Descargar Combinada (PNG)</button>
        <button class="btn btn-outline-secondary" onclick="downloadAllGraphsPDF()">Descargar todas (PDF)</button>
    `;
    container.appendChild(downloadDiv);
    
    const colors = {
        R: { s: '#e74c3c', p: '#c0392b' },
        T: { s: '#2ecc71', p: '#27ae60' },
        A: { s: '#9b59b6', p: '#8e44ad' }
    };
    
    const colorS = colors[prefix]?.s || '#3498db';
    const colorP = colors[prefix]?.p || '#2980b9';
    
    if (dataS?.length > 0) {
        container.appendChild(createGraphCard(`graph-${prefix}s`, `${prefix}s (polarización s) vs Longitud de Onda`, (divId) => {
            plotSingleLine(divId, wavelengths, dataS, `${prefix}s`, colorS, label, [0, 1]);
        }));
    }
    
    if (dataP?.length > 0) {
        container.appendChild(createGraphCard(`graph-${prefix}p`, `${prefix}p (polarización p) vs Longitud de Onda`, (divId) => {
            plotSingleLine(divId, wavelengths, dataP, `${prefix}p`, colorP, label, [0, 1]);
        }));
    }
    
    if (dataS?.length > 0 && dataP?.length > 0) {
        const dataAvg = dataS.map((s, i) => (s + dataP[i]) / 2);
        
        container.appendChild(createGraphCard(`graph-${prefix}-combined`, `${prefix}s, ${prefix}p y ${prefix} promedio vs Longitud de Onda`, (divId) => {
            plotTripleLine(divId, wavelengths, dataS, dataP, dataAvg, `${prefix}s`, `${prefix}p`, `${prefix} avg`, colorS, colorP, '#34495e', label);
        }));
    }
}

function renderNKGraphsWithSelector(container, wavelengths, opticalConstants, layers) {
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'layer-selector-container';
    
    let options = '<option value="ambient">Ambiente</option>';
    layers.forEach((layer, idx) => {
        const name = layer.name || `Capa ${idx + 1}`;
        options += `<option value="layer-${idx}">${name}</option>`;
    });
    options += '<option value="substrate">Sustrato</option>';
    
    selectorDiv.innerHTML = `
        <label>Seleccione la capa a visualizar:</label>
        <select id="nk-layer-select" class="form-select">
            ${options}
        </select>
    `;
    container.appendChild(selectorDiv);
    
    const graphsDiv = document.createElement('div');
    graphsDiv.id = 'nk-graphs-container';
    container.appendChild(graphsDiv);
    
    const select = document.getElementById('nk-layer-select');
    select.addEventListener('change', () => {
        renderNKForLayer(graphsDiv, wavelengths, opticalConstants, layers, select.value);
    });
    
    renderNKForLayer(graphsDiv, wavelengths, opticalConstants, layers, 'ambient');
}

function renderNKForLayer(container, wavelengths, opticalConstants, layers, layerValue) {
    container.innerHTML = '';
    
    let layerData = null;
    let layerName = '';
    
    if (layerValue === 'ambient') {
        layerData = opticalConstants.ambient;
        layerName = 'Ambiente';
    } else if (layerValue === 'substrate') {
        layerData = opticalConstants.substrate;
        layerName = 'Sustrato';
    } else if (layerValue.startsWith('layer-')) {
        const idx = parseInt(layerValue.replace('layer-', ''));
        layerData = opticalConstants.layers?.[idx];
        layerName = layers[idx]?.name || `Capa ${idx + 1}`;
    }
    
    if (!layerData || !layerData.n || !layerData.k) {
        container.innerHTML = '<div class="alert alert-warning">No hay datos de n,k disponibles para esta capa.</div>';
        return;
    }
    
    const n = layerData.n;
    const k = layerData.k;
    const safeId = layerName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-buttons';
    downloadDiv.innerHTML = `
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-n-${safeId}')">Descargar n (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-k-${safeId}')">Descargar k (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-nk-${safeId}')">Descargar Combinada (PNG)</button>
    `;
    container.appendChild(downloadDiv);
    
    container.appendChild(createGraphCard(`graph-n-${safeId}`, `n (índice de refracción) - ${layerName}`, (divId) => {
        plotSingleLine(divId, wavelengths, n, 'n', '#2196F3', 'n', null);
    }));
    
    container.appendChild(createGraphCard(`graph-k-${safeId}`, `k (coeficiente de extinción) - ${layerName}`, (divId) => {
        plotSingleLine(divId, wavelengths, k, 'k', '#FF5722', 'k', null);
    }));
    
    container.appendChild(createGraphCard(`graph-nk-${safeId}`, `n y k - ${layerName}`, (divId) => {
        plotDualAxis(divId, wavelengths, n, k, 'n', 'k', '#2196F3', '#FF5722', 'n', 'k', null, null);
    }));
}

// ============================================================================
// FUNCIONES DE PLOTTING
// ============================================================================

function getPlotConfig() {
    const showGrid = document.getElementById('show-grid')?.checked ?? true;
    const whiteBg = document.getElementById('white-bg')?.checked ?? false;
    
    return {
        showGrid,
        bgColor: whiteBg ? 'white' : '#fafafa',
        gridColor: showGrid ? '#e0e0e0' : 'transparent'
    };
}

function createGraphCard(id, title, plotFn) {
    const card = document.createElement('div');
    card.className = 'graph-card';
    card.innerHTML = `
        <div class="graph-card-header">
            <span class="graph-card-title">${title}</span>
            <button class="btn btn-sm btn-outline-secondary" onclick="downloadGraphPNG('${id}')">PNG</button>
        </div>
        <div id="${id}" class="graph-container"></div>
    `;
    
    setTimeout(() => plotFn(id), 50);
    
    return card;
}

function plotSingleLine(divId, x, y, name, color, yTitle, yRange) {
    const config = getPlotConfig();
    
    const trace = {
        x: x, y: y, name: name, type: 'scatter', mode: 'lines',
        line: { color: color, width: 2 }
    };
    
    const layout = {
        xaxis: { title: 'Longitud de onda (nm)', gridcolor: config.gridColor, showgrid: config.showGrid },
        yaxis: { title: yTitle, gridcolor: config.gridColor, showgrid: config.showGrid, range: yRange },
        margin: { t: 30, b: 60, l: 70, r: 30 },
        plot_bgcolor: config.bgColor, paper_bgcolor: config.bgColor,
        showlegend: false
    };
    
    Plotly.newPlot(divId, [trace], layout, { responsive: true, displayModeBar: true });
}

function plotDualAxis(divId, x, y1, y2, name1, name2, color1, color2, yTitle1, yTitle2, yRange1, yRange2) {
    const config = getPlotConfig();
    
    const trace1 = {
        x: x, y: y1, name: name1, type: 'scatter', mode: 'lines',
        line: { color: color1, width: 2 }, yaxis: 'y'
    };
    
    const trace2 = {
        x: x, y: y2, name: name2, type: 'scatter', mode: 'lines',
        line: { color: color2, width: 2 }, yaxis: 'y2'
    };
    
    const layout = {
        xaxis: { title: 'Longitud de onda (nm)', gridcolor: config.gridColor, showgrid: config.showGrid },
        yaxis: { title: yTitle1, titlefont: { color: color1 }, tickfont: { color: color1 }, gridcolor: config.gridColor, showgrid: config.showGrid, range: yRange1 },
        yaxis2: { title: yTitle2, titlefont: { color: color2 }, tickfont: { color: color2 }, overlaying: 'y', side: 'right', range: yRange2 },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 60, l: 70, r: 70 },
        plot_bgcolor: config.bgColor, paper_bgcolor: config.bgColor
    };
    
    Plotly.newPlot(divId, [trace1, trace2], layout, { responsive: true, displayModeBar: true });
}

function plotTripleLine(divId, x, y1, y2, y3, name1, name2, name3, color1, color2, color3, yTitle) {
    const config = getPlotConfig();
    
    const traces = [
        { x, y: y1, name: name1, type: 'scatter', mode: 'lines', line: { color: color1, width: 2 } },
        { x, y: y2, name: name2, type: 'scatter', mode: 'lines', line: { color: color2, width: 2 } },
        { x, y: y3, name: name3, type: 'scatter', mode: 'lines', line: { color: color3, width: 2, dash: 'dash' } }
    ];
    
    const layout = {
        xaxis: { title: 'Longitud de onda (nm)', gridcolor: config.gridColor, showgrid: config.showGrid },
        yaxis: { title: yTitle, gridcolor: config.gridColor, showgrid: config.showGrid, range: [0, 1] },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 60, l: 70, r: 30 },
        plot_bgcolor: config.bgColor, paper_bgcolor: config.bgColor
    };
    
    Plotly.newPlot(divId, traces, layout, { responsive: true, displayModeBar: true });
}

// ============================================================================
// MOSTRAR RESULTADOS
// ============================================================================

function displayTheoreticalResults(result, model) {
    console.log('[displayTheoreticalResults] Mostrando resultados...');
    
    lastTheoreticalResults = result;
    lastTheoreticalModel = model;
    
    const noResults = document.getElementById('no-results');
    if (noResults) noResults.style.display = 'none';
    
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.style.display = 'block';
    
    const selectorContainer = document.getElementById('graph-selector-container');
    const graphOptions = document.getElementById('graph-options');
    if (selectorContainer) selectorContainer.style.display = 'block';
    if (graphOptions) graphOptions.style.display = 'flex';
    
    const title = document.getElementById('graphs-title');
    if (title) {
        const wl = model.global?.wavelengths || [];
        title.textContent = `Resultados: ${wl.length} puntos, ${model.global?.angle}°`;
    }
    
    updateModelSummary(model);
    initializeGraphSelector();
    
    currentGraphType = 'psi-delta';
    selectGraphType('psi-delta');
}

function updateModelSummary(model) {
    const container = document.getElementById('model-summary-container');
    const layersSummary = document.getElementById('model-layers-summary');
    
    if (!container || !layersSummary) return;
    
    container.style.display = 'block';
    
    let html = '';
    
    html += `<div class="model-layer">
        <span class="model-layer-icon">🌬️</span>
        <span class="model-layer-name">Ambiente</span>
        <div class="model-layer-details">${getModelDescription(model.ambient)}</div>
    </div>`;
    
    if (model.layers && model.layers.length > 0) {
        model.layers.forEach((layer, idx) => {
            html += `<div class="model-layer">
                <span class="model-layer-icon">📚</span>
                <span class="model-layer-name">${layer.name || 'Capa ' + (idx + 1)}</span>
                <div class="model-layer-details">${layer.thickness} nm - ${getModelDescription(layer)}</div>
            </div>`;
        });
    }
    
    html += `<div class="model-layer">
        <span class="model-layer-icon">🧱</span>
        <span class="model-layer-name">Sustrato</span>
        <div class="model-layer-details">${getModelDescription(model.substrate)}</div>
    </div>`;
    
    layersSummary.innerHTML = html;
    
    const editLink = document.getElementById('edit-model-link');
    if (editLink) {
        editLink.onclick = (e) => {
            e.preventDefault();
            openTheoreticalModelWizard();
        };
    }
}

function getModelDescription(obj) {
    if (!obj) return 'No definido';
    
    if (obj.type === 'constant') {
        return `Constante: n=${obj.n?.toFixed(3) || '?'}, k=${obj.k?.toFixed(4) || '0'}`;
    }
    if (obj.type === 'emt') {
        return `EMT (${obj.emt_model || 'Bruggeman'}) - ${obj.components?.length || 0} componentes`;
    }
    if (obj.model) {
        return obj.model.charAt(0).toUpperCase() + obj.model.slice(1);
    }
    
    return obj.type || 'Desconocido';
}

// ============================================================================
// EXPORTAR FUNCIONES GLOBALMENTE
// ============================================================================

window.initializeGraphSelector = initializeGraphSelector;
window.selectGraphType = selectGraphType;
window.refreshCurrentGraphs = refreshCurrentGraphs;
window.displayTheoreticalResults = displayTheoreticalResults;
window.updateModelSummary = updateModelSummary;
window.updateCustomEquationPreview = updateCustomEquationPreview;
window.downloadTheoreticalDataCSV = downloadTheoreticalDataCSV;
window.downloadGraphPNG = downloadGraphPNG;
window.downloadAllGraphsPDF = downloadAllGraphsPDF;

// *** FIX 3: Override window.getWavelengthsArray para que emt_functions.js
//     use los inputs de pruebas teóricas en lugar de los de optimización ***
window.getWavelengthsArray = function() {
    return getTheoreticalWavelengths();
};

console.log('[Pruebas Teóricas] Módulo completamente cargado con Drude, Lorentz y Drude-Lorentz');

// ============================================================================
// CALCULAR N,K EFECTIVOS (EMT) — agregar al final de pruebas_teoricas.js
// ============================================================================

async function validateAndCalculateEMT(context, idx) {
    console.log(`[EMT] Calculando n,k efectivos para ${context} idx=${idx}`);

    // ── 1. Localizar el wrapper correcto ──────────────────────────────────────
    let layerWrapper = null;

    if (context === 'layer') {
        layerWrapper = document.querySelector(`.layer-card[data-idx="${idx}"]`);
    } else if (context === 'ambient' || context === 'substrate') {
        // Para medios (ambiente/sustrato) el "wrapper" es el contenedor EMT
        layerWrapper = document.getElementById(`${context}-emt-config`) ||
                       document.getElementById(`${context}-config`);
    }

    if (!layerWrapper) {
        alert('No se encontró la capa. Intente de nuevo.');
        console.error('[EMT] layerWrapper no encontrado para', context, idx);
        return;
    }

    // ── 2. Obtener longitudes de onda ─────────────────────────────────────────
    let wavelengths = [];
    try {
        wavelengths = getTheoreticalWavelengths();
    } catch (e) {
        alert('Configure las longitudes de onda antes de calcular los n,k efectivos.\n' + e.message);
        return;
    }

    if (wavelengths.length === 0) {
        alert('No hay longitudes de onda configuradas.');
        return;
    }

    // ── 3. Recolectar componentes EMT ─────────────────────────────────────────
    let components = [];
    let emtModel = 'bruggeman';
    let hostIndex = null;

    if (context === 'layer') {
        const emtData = collectLayerEMTData(layerWrapper);
        components = emtData.components || [];
        emtModel   = emtData.emt_model || 'bruggeman';
        hostIndex  = emtData.host_index ?? null;
    } else {
        const emtData = collectMediumEMTData(context);
        components = emtData.components || [];
        emtModel   = emtData.emt_model || 'bruggeman';
        hostIndex  = emtData.host_index ?? null;
    }

    // ── 4. Validaciones básicas ───────────────────────────────────────────────
    if (components.length < 2) {
        alert('Se necesitan al menos 2 componentes para calcular el EMT.');
        return;
    }

    const totalFraction = components.reduce((s, c) => s + (c.fraction || 0), 0);
    if (Math.abs(totalFraction - 1.0) > 0.01) {
        alert(`La suma de fracciones debe ser 1.0 (actual: ${totalFraction.toFixed(3)}).`);
        return;
    }

    if (emtModel === 'maxwell-garnett' && hostIndex === null) {
        alert('Seleccione el componente host (matriz) para Maxwell-Garnett.');
        return;
    }

    // ── 5. Mostrar spinner en el botón ────────────────────────────────────────
    const btn = layerWrapper.querySelector(
        `button[onclick*="validateAndCalculateEMT"], .btn-calc-emt`
    );
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Calculando...';
    }

    // Eliminar resultado anterior si existe
    const prevResult = layerWrapper.querySelector('.emt-calc-result');
    if (prevResult) prevResult.remove();

    // ── 6. Llamar al backend ──────────────────────────────────────────────────
    try {
        const payload = {
            emt_model:   emtModel,
            components:  components,
            wavelengths: wavelengths,
            host_index:  hostIndex
        };

        console.log('[EMT] Payload enviado:', JSON.stringify(payload).slice(0, 300));

        const response = await fetch('/api/calculate-emt', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || `Error HTTP ${response.status}`);
        }

        // ── 7. Mostrar resultados ─────────────────────────────────────────────
        renderEMTResult(layerWrapper, result, wavelengths, context, idx);

    } catch (error) {
        console.error('[EMT] Error al calcular:', error);
        showEMTError(layerWrapper, error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ── Muestra los n,k efectivos dentro del card de la capa ──────────────────────
function renderEMTResult(wrapper, result, wavelengths, context, idx) {
    // El backend devuelve n_eff / k_eff; también se aceptan n / k por compatibilidad
    const n = result.n_eff || result.n || result.data?.n_eff || result.data?.n || [];
    const k = result.k_eff || result.k || result.data?.k_eff || result.data?.k || [];

    if (!n.length) {
        showEMTError(wrapper, 'El servidor no devolvió datos de n,k.');
        return;
    }

    // Estadísticas rápidas
    const nMean = (n.reduce((a, b) => a + b, 0) / n.length).toFixed(4);
    const kMean = (k.reduce((a, b) => a + b, 0) / k.length).toFixed(6);
    const nMin  = Math.min(...n).toFixed(4);
    const nMax  = Math.max(...n).toFixed(4);
    const kMin  = Math.min(...k).toFixed(6);
    const kMax  = Math.max(...k).toFixed(6);

    const safeId = `emt-plot-${context}-${idx}-${Date.now()}`;

    const resultDiv = document.createElement('div');
    resultDiv.className = 'emt-calc-result mt-3 p-3 border rounded bg-light';
    resultDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0 text-success">✅ n, k efectivos calculados</h6>
            <button class="btn btn-sm btn-outline-secondary py-0"
                    onclick="this.closest('.emt-calc-result').remove()">✕</button>
        </div>

        <div class="row g-2 mb-3 small">
            <div class="col-6">
                <strong>n efectivo</strong><br>
                Media: ${nMean} | Rango: [${nMin}, ${nMax}]
            </div>
            <div class="col-6">
                <strong>k efectivo</strong><br>
                Media: ${kMean} | Rango: [${kMin}, ${kMax}]
            </div>
        </div>

        <div id="${safeId}" style="height:260px; width:100%;"></div>

        <div class="mt-2 text-end">
            <button class="btn btn-sm btn-outline-primary"
                    onclick="downloadEMTResultCSV('${safeId}')">
                Descargar CSV
            </button>
        </div>
    `;

    // Guardar datos en el div para descarga posterior
    resultDiv.dataset.nData  = JSON.stringify(n);
    resultDiv.dataset.kData  = JSON.stringify(k);
    resultDiv.dataset.wlData = JSON.stringify(wavelengths);

    // Insertar después del botón de calcular
    const insertAfter = wrapper.querySelector(
        `button[onclick*="validateAndCalculateEMT"], .btn-calc-emt`
    ) || wrapper.querySelector('.emt-components-container');

    if (insertAfter) {
        insertAfter.insertAdjacentElement('afterend', resultDiv);
    } else {
        wrapper.appendChild(resultDiv);
    }

    // Plotly dual-axis n & k
    setTimeout(() => {
        try {
            const trace1 = {
                x: wavelengths, y: n, name: 'n eff', type: 'scatter', mode: 'lines',
                line: { color: '#2196F3', width: 2 }, yaxis: 'y'
            };
            const trace2 = {
                x: wavelengths, y: k, name: 'k eff', type: 'scatter', mode: 'lines',
                line: { color: '#FF5722', width: 2 }, yaxis: 'y2'
            };
            const layout = {
                xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
                yaxis: {
                    title: 'n efectivo',
                    titlefont: { color: '#2196F3' }, tickfont: { color: '#2196F3' },
                    gridcolor: '#e0e0e0'
                },
                yaxis2: {
                    title: 'k efectivo',
                    titlefont: { color: '#FF5722' }, tickfont: { color: '#FF5722' },
                    overlaying: 'y', side: 'right'
                },
                legend: { x: 0.5, y: 1.12, orientation: 'h', xanchor: 'center' },
                margin: { t: 30, b: 50, l: 65, r: 65 },
                plot_bgcolor: 'white', paper_bgcolor: 'white'
            };
            Plotly.newPlot(safeId, [trace1, trace2], layout, {
                responsive: true, displayModeBar: false
            });
        } catch (err) {
            console.error('[EMT] Error al graficar:', err);
        }
    }, 80);
}

// ── Muestra error inline ───────────────────────────────────────────────────────
function showEMTError(wrapper, message) {
    const prev = wrapper.querySelector('.emt-calc-result');
    if (prev) prev.remove();

    const errDiv = document.createElement('div');
    errDiv.className = 'emt-calc-result alert alert-danger mt-2';
    errDiv.innerHTML = `
        <strong>❌ Error al calcular n,k efectivos</strong>
        <p class="mb-0 mt-1 small">${message}</p>
        <button class="btn btn-sm btn-link p-0 mt-1"
                onclick="this.closest('.emt-calc-result').remove()">Cerrar</button>
    `;

    const insertAfter = wrapper.querySelector(
        `button[onclick*="validateAndCalculateEMT"], .btn-calc-emt`
    ) || wrapper.querySelector('.emt-components-container');

    if (insertAfter) {
        insertAfter.insertAdjacentElement('afterend', errDiv);
    } else {
        wrapper.appendChild(errDiv);
    }
}

// ── Descarga CSV del resultado EMT ────────────────────────────────────────────
function downloadEMTResultCSV(plotId) {
    const resultDiv = document.getElementById(plotId)?.closest('.emt-calc-result');
    if (!resultDiv) return;

    try {
        const n   = JSON.parse(resultDiv.dataset.nData  || '[]');
        const k   = JSON.parse(resultDiv.dataset.kData  || '[]');
        const wl  = JSON.parse(resultDiv.dataset.wlData || '[]');

        if (!wl.length) { alert('No hay datos para descargar.'); return; }

        let csv = 'wavelength_nm,n_eff,k_eff\n';
        for (let i = 0; i < wl.length; i++) {
            csv += `${wl[i].toFixed(3)},${(n[i] ?? '').toString()},${(k[i] ?? '').toString()}\n`;
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `emt_nk_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error('[EMT CSV]', e);
        alert('Error al generar CSV: ' + e.message);
    }
}

// ── Exportar globalmente ───────────────────────────────────────────────────────
window.validateAndCalculateEMT = validateAndCalculateEMT;
window.downloadEMTResultCSV    = downloadEMTResultCSV;

console.log('[EMT Fix] validateAndCalculateEMT registrada correctamente.');

// ============================================================================
// PARCHE: VALIDACIÓN DE ARCHIVOS ÓPTICOS vs RANGO DE LONGITUDES DE ONDA
// 
// INSTRUCCIONES:
//   Pega este bloque al FINAL de appteorico.js, justo después de la línea:
//   console.log('[EMT Fix] validateAndCalculateEMT registrada correctamente.');
//
// PROBLEMA QUE RESUELVE:
//   handleMediumFileUpload, handleLayerFileUpload y handleEMTComponentFileUpload
//   llaman a validateMaterialFileAgainstWavelengthMode() y showMaterialValidationResult()
//   pero esas funciones nunca estaban definidas en appteorico.js.
//   Cuando el usuario sube un archivo, el fetch funciona y los datos se guardan
//   en dataset.opticalData correctamente, PERO luego se lanza un ReferenceError
//   que el catch intercepta y llama a showFileError(), reemplazando el mensaje
//   verde de éxito con un mensaje rojo de "Error de conexión".
//   El usuario ve que "falló" cuando en realidad los datos sí llegaron.
// ============================================================================

/**
 * Compara el rango del archivo subido contra las longitudes de onda
 * configuradas en el panel izquierdo de pruebas teóricas.
 * @param {number[]} fileWavelengths  - array de λ del archivo
 * @param {HTMLElement} fileInput     - el <input type="file"> que disparó el evento
 * @returns {{ valid: boolean, warnings: string[] }}
 */
async function validateMaterialFileAgainstWavelengthMode(fileWavelengths, fileInput) {
    if (!fileWavelengths || fileWavelengths.length === 0) {
        return { valid: true, warnings: [] };
    }

    let configWavelengths = [];
    try {
        configWavelengths = getTheoreticalWavelengths();
    } catch (e) {
        // Si aún no hay longitudes configuradas no bloqueamos
        return { valid: true, warnings: [] };
    }

    if (configWavelengths.length === 0) {
        return { valid: true, warnings: [] };
    }

    const fileMin   = Math.min(...fileWavelengths);
    const fileMax   = Math.max(...fileWavelengths);
    const configMin = Math.min(...configWavelengths);
    const configMax = Math.max(...configWavelengths);

    const warnings = [];

    if (configMin < fileMin - 0.5) {
        warnings.push(
            `El rango configurado empieza en ${configMin.toFixed(1)} nm, ` +
            `pero el archivo cubre desde ${fileMin.toFixed(1)} nm. ` +
            `Se extrapolará fuera del rango del archivo.`
        );
    }
    if (configMax > fileMax + 0.5) {
        warnings.push(
            `El rango configurado llega a ${configMax.toFixed(1)} nm, ` +
            `pero el archivo solo cubre hasta ${fileMax.toFixed(1)} nm. ` +
            `Se extrapolará fuera del rango del archivo.`
        );
    }

    return { valid: warnings.length === 0, warnings };
}

/**
 * Muestra advertencias de rango justo debajo del input de archivo.
 * Si la validación es exitosa no muestra nada extra
 * (showFileSuccess ya mostró el resumen verde).
 * @param {{ valid: boolean, warnings: string[] }} validation
 * @param {HTMLElement} fileInput
 */
function showMaterialValidationResult(validation, fileInput) {
    if (!validation) return;

    const parent = fileInput.parentElement;
    // Limpiar alertas anteriores de validación
    parent.querySelectorAll('.material-validation-alert').forEach(el => el.remove());

    if (validation.warnings && validation.warnings.length > 0) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning mt-2 mb-0 small material-validation-alert';
        alertDiv.innerHTML = `
            <strong>⚠️ Advertencia de cobertura espectral:</strong>
            <ul class="mb-1 mt-1">
                ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
            </ul>
            <span class="text-muted">
                El backend interpolará automáticamente dentro del rango disponible.
            </span>
        `;
        // Insertar después del bloque verde de éxito (.file-result-msg)
        const successMsg = parent.querySelector('.file-result-msg');
        if (successMsg) {
            successMsg.insertAdjacentElement('afterend', alertDiv);
        } else {
            fileInput.insertAdjacentElement('afterend', alertDiv);
        }
    }
}

// Exportar globalmente por si fixes_v2.js u otro módulo las necesita
window.validateMaterialFileAgainstWavelengthMode = validateMaterialFileAgainstWavelengthMode;
window.showMaterialValidationResult              = showMaterialValidationResult;

console.log('[File Upload Fix] validateMaterialFileAgainstWavelengthMode y showMaterialValidationResult registradas.');