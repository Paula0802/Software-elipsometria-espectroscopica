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

// Manejar ambos casos: si el DOM ya está cargado o si aún está cargándose
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
    
    // Selector de método de longitud de onda
    console.log('[InitMode] Paso 1: Inicializando selector de wavelength method...');
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
    
    // Validación de ángulo
    console.log('[InitMode] Paso 2: Inicializando validación de ángulo...');
    const angleInput = document.getElementById('incident-angle');
    if (angleInput) {
        angleInput.addEventListener('input', validateTheoreticalAngle);
        angleInput.addEventListener('change', validateTheoreticalAngle);
        console.log('[InitMode] ✅ Angle listeners agregados');
    } else {
        console.warn('[InitMode] ⚠️ No se encontró incident-angle');
    }
    
    // Botón configurar modelo
    console.log('[InitMode] Paso 3: Inicializando botón configurar modelo...');
    const continueBtn = document.getElementById('btn-continue-model');
    if (continueBtn) {
        continueBtn.addEventListener('click', openTheoreticalModelWizard);
        console.log('[InitMode] ✅ Button listener agregado');
    } else {
        console.warn('[InitMode] ⚠️ No se encontró btn-continue-model');
    }
    
    // Checkboxes de salidas - sincronizar con theoreticalConfig
    console.log('[InitMode] Paso 4: Inicializando checkboxes de salidas...');
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
    
    // Verificar que los elementos existan
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
        
        console.log('[GetWavelengths] minInput:', minInput);
        console.log('[GetWavelengths] maxInput:', maxInput);
        console.log('[GetWavelengths] stepsInput:', stepsInput);
        
        if (!minInput || !maxInput || !stepsInput) {
            throw new Error("No se encontraron los campos de rango de longitud de onda (wavelength-min, wavelength-max, wavelength-steps)");
        }
        
        const min = parseFloat(minInput.value);
        const max = parseFloat(maxInput.value);
        const steps = parseInt(stepsInput.value);
        
        console.log('[GetWavelengths] min:', min, 'max:', max, 'steps:', steps);
        
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
        // Paso 1: Validar ángulo
        console.log('[OpenWizard] Paso 1: Validando ángulo...');
        if (!validateTheoreticalAngle()) {
            alert('Error: El ángulo de incidencia no es válido (debe estar entre 0° y 90°).');
            return;
        }
        console.log('[OpenWizard] ✅ Ángulo validado');
        
        // Paso 2: Obtener longitudes de onda
        console.log('[OpenWizard] Paso 2: Obteniendo longitudes de onda...');
        let wavelengths = [];
        try {
            wavelengths = getTheoreticalWavelengths();
        } catch (wlError) {
            console.error('[OpenWizard] Error al obtener wavelengths:', wlError.message);
            alert('Error al obtener longitudes de onda: ' + wlError.message);
            return;
        }
        console.log('[OpenWizard] ✅ Longitudes de onda obtenidas:', wavelengths.length, 'puntos');
        
        // Paso 3: Obtener ángulo
        console.log('[OpenWizard] Paso 3: Obteniendo ángulo...');
        const angleInput = document.getElementById('incident-angle');
        if (!angleInput) {
            throw new Error("No se encontró el campo de ángulo de incidencia (incident-angle)");
        }
        
        const angle = parseFloat(angleInput.value);
        if (isNaN(angle)) {
            throw new Error("El ángulo debe ser un número válido");
        }
        console.log('[OpenWizard] ✅ Ángulo obtenido:', angle + '°');
        
        // Paso 4: Guardar configuración
        console.log('[OpenWizard] Paso 4: Guardando configuración...');
        theoreticalConfig.wavelengths = wavelengths;
        theoreticalConfig.angle = angle;
        theoreticalConfig.polarization = 'both';  // Siempre ambas polarizaciones
        console.log('[OpenWizard] ✅ Configuración guardada');
        
        // Paso 5: Verificar que hay al menos una salida seleccionada
        console.log('[OpenWizard] Paso 5: Verificando salidas...');
        const hasOutput = Object.values(theoreticalConfig.outputs).some(v => v === true);
        if (!hasOutput) {
            alert('Error: Debe seleccionar al menos una propiedad para calcular.');
            return;
        }
        console.log('[OpenWizard] ✅ Salidas configuradas:', theoreticalConfig.outputs);
        
        console.log('[Config] Configuración final:', {
            angle: theoreticalConfig.angle,
            wavelengths: `${wavelengths.length} puntos (${wavelengths[0].toFixed(1)} - ${wavelengths[wavelengths.length-1].toFixed(1)} nm)`,
            polarization: theoreticalConfig.polarization,
            outputs: theoreticalConfig.outputs
        });
        
        // Paso 6: Actualizar workflow visual
        console.log('[OpenWizard] Paso 6: Actualizando workflow...');
        updateWorkflowStep(2);
        console.log('[OpenWizard] ✅ Workflow actualizado');
        
        // Paso 7: Resetear wizard al paso 1
        console.log('[OpenWizard] Paso 7: Reseteando wizard...');
        currentWizardStep = 1;
        showWizardStep(1);
        console.log('[OpenWizard] ✅ Wizard reseteado');
        
        // Paso 8: Abrir modal del wizard
        console.log('[OpenWizard] Paso 8: Abriendo modal...');
        const modalEl = document.getElementById('modelWizardModal');
        if (!modalEl) {
            throw new Error("No se encontró el modal (modelWizardModal)");
        }
        
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        console.log('[OpenWizard] ✅ Modal abierto');
        
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
let mediumListenersInitialized = false;  // Flag para inicializar listeners una sola vez

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
    
    // NO inicializar listeners de medios aquí - se harán cuando se muestre el step 1
    console.log('[InitWizard] Listeners de medios se inicializarán cuando se abra el modal');
    
    // Inicializar botón de agregar capa
    const addLayerBtn = document.getElementById("add-layer");
    if (addLayerBtn) {
        addLayerBtn.addEventListener("click", () => addLayer());
        console.log('[InitWizard] ✅ add-layer listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró add-layer');
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
        console.log('[InitWizard] ✅ view-model-link listener agregado');
    } else {
        console.warn('[InitWizard] ⚠️ No se encontró view-model-link');
    }
    
    console.log('[InitWizard] ✅ Wizard inicializado');
}

function showWizardStep(step) {
    console.log(`[ShowWizardStep] Mostrando paso ${step}`);
    
    // Inicializar listeners la primera vez que se muestra el paso 1
    if (step === 1 && !mediumListenersInitialized) {
        console.log('[ShowWizardStep] Inicializando listeners de medios...');
        initializeMediumListeners();
        mediumListenersInitialized = true;
        console.log('[ShowWizardStep] ✅ Listeners de medios inicializados');
    }
    
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
        // Validar solo ambiente
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
        
        return true;
    }
    
    if (step === 2) {
        // Validar solo sustrato
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
        // Paso 3: Capas - validación opcional (puede no haber capas)
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

// ============================================================================
// LISTENERS PARA AMBIENTE Y SUSTRATO
// ============================================================================

function initializeMediumListeners() {
    console.log('[InitMediumListeners] ===== INICIALIZANDO LISTENERS DE MEDIOS =====');
    
    // Listener para modelo de ambiente
    console.log('[InitMediumListeners] Inicializando ambiente...');
    const ambientModel = document.getElementById("ambient-model");
    if (ambientModel) {
        console.log('[InitMediumListeners] ✅ ambient-model encontrado');
        ambientModel.addEventListener("change", (e) => {
            console.log('[Event] Modelo de ambiente cambiado a:', e.target.value);
            updateMediumFields('ambient', e.target.value);
        });
        // Inicializar campos del ambiente
        console.log('[InitMediumListeners] Inicializando campos de ambiente...');
        updateMediumFields('ambient', ambientModel.value);
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró ambient-model');
    }
    
    // Listener para modelo de sustrato
    console.log('[InitMediumListeners] Inicializando sustrato...');
    const substrateModel = document.getElementById("substrate-model");
    if (substrateModel) {
        console.log('[InitMediumListeners] ✅ substrate-model encontrado');
        substrateModel.addEventListener("change", (e) => {
            console.log('[Event] Modelo de sustrato cambiado a:', e.target.value);
            updateMediumFields('substrate', e.target.value);
        });
        // IMPORTANTE: Inicializar campos del sustrato con el valor actual
        console.log('[InitMediumListeners] Inicializando campos de sustrato...');
        updateMediumFields('substrate', substrateModel.value);
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró substrate-model');
    }
    
    // Listeners para tipo de ambiente (homogéneo/EMT)
    console.log('[InitMediumListeners] Inicializando tipos de ambiente...');
    const ambientTypeHomo = document.getElementById("ambient-type-homo");
    const ambientTypeEmt = document.getElementById("ambient-type-emt");
    
    if (ambientTypeHomo) {
        ambientTypeHomo.addEventListener("change", () => {
            console.log('[Event] Ambiente cambiado a homogéneo');
            updateMediumTypeInterface('ambient', 'homogeneous');
        });
        console.log('[InitMediumListeners] ✅ ambient-type-homo listener agregado');
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró ambient-type-homo');
    }
    
    if (ambientTypeEmt) {
        ambientTypeEmt.addEventListener("change", () => {
            console.log('[Event] Ambiente cambiado a EMT');
            updateMediumTypeInterface('ambient', 'emt');
        });
        console.log('[InitMediumListeners] ✅ ambient-type-emt listener agregado');
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró ambient-type-emt');
    }
    
    // Listeners para tipo de sustrato (homogéneo/EMT)
    console.log('[InitMediumListeners] Inicializando tipos de sustrato...');
    const substrateTypeHomo = document.getElementById("substrate-type-homo");
    const substrateTypeEmt = document.getElementById("substrate-type-emt");
    
    if (substrateTypeHomo) {
        substrateTypeHomo.addEventListener("change", () => {
            console.log('[Event] Sustrato cambiado a homogéneo');
            updateMediumTypeInterface('substrate', 'homogeneous');
        });
        console.log('[InitMediumListeners] ✅ substrate-type-homo listener agregado');
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró substrate-type-homo');
    }
    
    if (substrateTypeEmt) {
        substrateTypeEmt.addEventListener("change", () => {
            console.log('[Event] Sustrato cambiado a EMT');
            updateMediumTypeInterface('substrate', 'emt');
        });
        console.log('[InitMediumListeners] ✅ substrate-type-emt listener agregado');
    } else {
        console.warn('[InitMediumListeners] ⚠️ No se encontró substrate-type-emt');
    }
    
    // ⭐ NUEVO: Listeners para modelo EMT del ambiente (Maxwell-Garnett/Bruggeman)
    const ambientEmtModel = document.getElementById('ambient-emt-model');
    if (ambientEmtModel) {
        ambientEmtModel.addEventListener('change', () => {
            console.log('[Event] Modelo EMT ambiente cambiado a:', ambientEmtModel.value);
            updateMediumHostSelectOptions('ambient');
        });
        console.log('[InitMediumListeners] ✅ ambient-emt-model listener agregado');
    }
    
    // ⭐ NUEVO: Listeners para modelo EMT del sustrato (Maxwell-Garnett/Bruggeman)
    const substrateEmtModel = document.getElementById('substrate-emt-model');
    if (substrateEmtModel) {
        substrateEmtModel.addEventListener('change', () => {
            console.log('[Event] Modelo EMT sustrato cambiado a:', substrateEmtModel.value);
            updateMediumHostSelectOptions('substrate');
        });
        console.log('[InitMediumListeners] ✅ substrate-emt-model listener agregado');
    }

    // Configurar handlers de archivos
    setupFileUploadHandlers();
    
    console.log('[InitMediumListeners] ===== LISTENERS INICIALIZADOS EXITOSAMENTE =====');
}

// ============================================================================
// MANEJO DE ARCHIVOS ÓPTICOS
// ============================================================================

/**
 * Configura los event listeners para carga de archivos en ambiente y sustrato
 * Se llama una vez cuando se inicializan los listeners de medios
 */
function setupFileUploadHandlers() {
    console.log('[SetupFileHandlers] Configurando handlers de archivos...');
    
    // Archivo para AMBIENTE homogéneo
    const ambientFileInput = document.getElementById('ambient-file');
    if (ambientFileInput) {
        ambientFileInput.addEventListener('change', (e) => {
            handleMediumFileUpload('ambient', e.target);
        });
        console.log('[SetupFileHandlers] ✅ Handler de archivo ambiente configurado');
    } else {
        console.log('[SetupFileHandlers] ⚠️ No se encontró input ambient-file (puede no existir en el HTML)');
    }
    
    // Archivo para SUSTRATO homogéneo
    const substrateFileInput = document.getElementById('substrate-file');
    if (substrateFileInput) {
        substrateFileInput.addEventListener('change', (e) => {
            handleMediumFileUpload('substrate', e.target);
        });
        console.log('[SetupFileHandlers] ✅ Handler de archivo sustrato configurado');
    } else {
        console.log('[SetupFileHandlers] ⚠️ No se encontró input substrate-file (puede no existir en el HTML)');
    }
    
    console.log('[SetupFileHandlers] ✅ Handlers de archivos configurados');
}


/**
 * Procesa la carga de archivo óptico para ambiente o sustrato
 * @param {string} medium - 'ambient' o 'substrate'
 * @param {HTMLInputElement} fileInput - El input file que disparó el evento
 */
async function handleMediumFileUpload(medium, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    console.log(`[${medium}] Subiendo archivo: ${file.name}`);
    
    // Obtener contenedor padre para mostrar mensajes
    const parentContainer = fileInput.closest('.card') || fileInput.parentElement;
    
    // Remover mensajes previos
    const prevMessages = parentContainer.querySelectorAll('.file-result-msg, .file-loading-msg');
    prevMessages.forEach(msg => msg.remove());
    
    // Mostrar indicador de carga
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
    loadingMsg.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>Procesando archivo...</span>
        </div>
    `;
    fileInput.after(loadingMsg);
    
    // Preparar FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Detectar tipo de archivo según el modelo seleccionado
    const modelSelect = document.getElementById(`${medium}-model`);
    const modelType = modelSelect ? modelSelect.value : 'file_nk';
    const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
    formData.append('file_type', fileType);
    
    try {
        const response = await fetch('/api/upload-optical-data', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        // Remover indicador de carga
        loadingMsg.remove();
        
        // Verificar resultado
        if (!result.success) {
            showFileError(fileInput, result.error || 'Error desconocido al procesar archivo');
            return;
        }
        
        if (!result.info || !result.data) {
            showFileError(fileInput, 'Respuesta incompleta del servidor');
            return;
        }
        
        // Mostrar éxito
        showFileSuccess(fileInput, result);
        
        // ⭐ GUARDAR DATOS EN EL ELEMENTO
        fileInput.dataset.opticalData = JSON.stringify(result.data);
        
        console.log(`[${medium}] ✅ Archivo procesado: ${result.info.points} puntos`);
        console.log(`[${medium}]    Rango λ: [${result.info.wavelength_range[0].toFixed(1)}, ${result.info.wavelength_range[1].toFixed(1)}] nm`);
        
    } catch (error) {
        loadingMsg.remove();
        showFileError(fileInput, `Error de conexión: ${error.message}`);
        console.error(`[${medium}] Error:`, error);
    }
}

/**
 * Procesa la carga de archivo óptico para una capa homogénea
 * @param {HTMLElement} layerWrapper - El contenedor de la capa (.layer-card)
 * @param {HTMLInputElement} fileInput - El input file
 */
async function handleLayerFileUpload(layerWrapper, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    const layerName = layerWrapper.querySelector('.layer-name')?.value || 'Capa';
    console.log(`[Capa ${layerName}] Subiendo archivo: ${file.name}`);
    
    // Remover mensajes previos
    const prevMessages = fileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
    prevMessages.forEach(msg => msg.remove());
    
    // Mostrar indicador de carga
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
    loadingMsg.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>Procesando archivo...</span>
        </div>
    `;
    fileInput.after(loadingMsg);
    
    // Preparar FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Detectar tipo según selector de modelo
    const modelSelect = layerWrapper.querySelector('.layer-model');
    const modelType = modelSelect ? modelSelect.value : 'file_nk';
    const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
    formData.append('file_type', fileType);
    
    try {
        const response = await fetch('/api/upload-optical-data', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        loadingMsg.remove();
        
        if (!result.success) {
            showFileError(fileInput, result.error || 'Error al procesar archivo');
            return;
        }
        
        if (!result.info || !result.data) {
            showFileError(fileInput, 'Respuesta incompleta del servidor');
            return;
        }
        
        // Mostrar éxito
        showFileSuccess(fileInput, result);
        
        // ⭐ GUARDAR DATOS EN EL WRAPPER DE LA CAPA
        layerWrapper.dataset.opticalData = JSON.stringify(result.data);
        
        console.log(`[Capa ${layerName}] ✅ Archivo procesado: ${result.info.points} puntos`);
        
    } catch (error) {
        loadingMsg.remove();
        showFileError(fileInput, `Error de conexión: ${error.message}`);
        console.error(`[Capa ${layerName}] Error:`, error);
    }
}



/**
 * Procesa la carga de archivo óptico para un componente EMT
 * @param {HTMLElement} componentDiv - El contenedor del componente (.emt-component o .medium-emt-component)
 * @param {HTMLInputElement} fileInput - El input file
 */
async function handleEMTComponentFileUpload(componentDiv, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    const compName = componentDiv.querySelector('.component-name, .medium-component-name')?.value || 'Componente';
    console.log(`[EMT ${compName}] Subiendo archivo: ${file.name}`);
    
    // Remover mensajes previos
    const prevMessages = fileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
    prevMessages.forEach(msg => msg.remove());
    
    // Mostrar indicador de carga
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
    loadingMsg.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>Procesando archivo...</span>
        </div>
    `;
    fileInput.after(loadingMsg);
    
    // Preparar FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Detectar tipo según selector de modelo del componente
    const modelSelect = componentDiv.querySelector('.component-model, .medium-component-model');
    const modelType = modelSelect ? modelSelect.value : 'file_nk';
    const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
    formData.append('file_type', fileType);
    
    try {
        const response = await fetch('/api/upload-optical-data', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        loadingMsg.remove();
        
        if (!result.success) {
            showFileError(fileInput, result.error || 'Error al procesar archivo');
            return;
        }
        
        if (!result.info || !result.data) {
            showFileError(fileInput, 'Respuesta incompleta del servidor');
            return;
        }
        
        // Mostrar éxito
        showFileSuccess(fileInput, result);
        
        // ⭐ GUARDAR DATOS EN EL COMPONENTE
        componentDiv.dataset.opticalData = JSON.stringify(result.data);
        
        console.log(`[EMT ${compName}] ✅ Archivo procesado: ${result.info.points} puntos`);
        console.log(`[EMT ${compName}]    n: [${result.info.n_range[0].toFixed(4)}, ${result.info.n_range[1].toFixed(4)}]`);
        console.log(`[EMT ${compName}]    k: [${result.info.k_range[0].toFixed(6)}, ${result.info.k_range[1].toFixed(6)}]`);
        
    } catch (error) {
        loadingMsg.remove();
        showFileError(fileInput, `Error de conexión: ${error.message}`);
        console.error(`[EMT ${compName}] Error:`, error);
    }
}



/**
 * Muestra mensaje de error para carga de archivo
 * @param {HTMLInputElement} fileInput - El input file
 * @param {string} message - Mensaje de error
 */
function showFileError(fileInput, message) {
    // Remover mensajes previos
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

/**
 * Muestra mensaje de éxito para carga de archivo
 * @param {HTMLInputElement} fileInput - El input file
 * @param {Object} result - Resultado del servidor con info y data
 */
function showFileSuccess(fileInput, result) {
    // Remover mensajes previos
    const parent = fileInput.parentElement;
    parent.querySelectorAll('.file-result-msg').forEach(el => el.remove());
    
    const info = result.info;
    const warnings = result.warnings || [];
    
    // Construir HTML de advertencias si las hay
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

/**
 * Actualiza las opciones del selector de host para Maxwell-Garnett en ambiente/sustrato
 * @param {string} medium - 'ambient' o 'substrate'
 */
function updateMediumHostSelectOptions(medium) {
    const emtModelSelect = document.getElementById(`${medium}-emt-model`);
    if (!emtModelSelect) return;
    
    const isMaxwellGarnett = emtModelSelect.value === 'maxwell-garnett';
    
    // Buscar o crear el contenedor del selector de host
    let hostContainer = document.getElementById(`${medium}-host-container`);
    
    if (!hostContainer) {
        // Crear el contenedor si no existe
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
        
        // Insertar después del selector de modelo EMT
        emtModelSelect.parentElement.after(hostContainer);
    }
    
    // Mostrar u ocultar según el modelo
    hostContainer.style.display = isMaxwellGarnett ? 'block' : 'none';
    
    if (!isMaxwellGarnett) return;
    
    // Obtener componentes actuales
    const componentsContainer = document.getElementById(`${medium}-emt-components`);
    if (!componentsContainer) return;
    
    const components = componentsContainer.querySelectorAll('.medium-emt-component');
    const hostSelect = document.getElementById(`${medium}-host-select`);
    
    if (!hostSelect) return;
    
    // Guardar selección actual
    const currentSelection = hostSelect.value;
    
    // Limpiar opciones
    hostSelect.innerHTML = '<option value="">-- Seleccione el host --</option>';
    
    // Agregar opciones por cada componente
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
        
        // Sugerir el componente con mayor fracción
        if (fraction > maxFraction) {
            maxFraction = fraction;
            suggestedHostIndex = index;
        }
    });
    
    // Restaurar selección o usar sugerencia
    if (currentSelection !== '' && hostSelect.querySelector(`option[value="${currentSelection}"]`)) {
        hostSelect.value = currentSelection;
    } else if (components.length > 0) {
        hostSelect.value = suggestedHostIndex;
    }
    
    console.log(`[updateMediumHostSelectOptions] ${medium}: ${components.length} componentes, host sugerido: ${suggestedHostIndex}`);
}



/**
 * Actualiza las opciones del selector de host para Maxwell-Garnett en una capa
 * @param {HTMLElement} layerWrapper - El contenedor de la capa (.layer-card)
 */
function updateHostSelectOptions(layerWrapper) {
    const emtModelSelect = layerWrapper.querySelector('.emt-model-select');
    if (!emtModelSelect) return;
    
    const isMaxwellGarnett = emtModelSelect.value === 'maxwell-garnett';
    
    // Buscar o crear el contenedor del selector de host
    let hostContainer = layerWrapper.querySelector('.host-select-container');
    
    if (!hostContainer) {
        // Crear el contenedor si no existe
        hostContainer = document.createElement('div');
        hostContainer.className = 'mb-3 mt-2 host-select-container';
        hostContainer.innerHTML = `
            <label class="form-label small fw-bold">Componente matriz (Host)</label>
            <select class="form-select form-select-sm layer-host-select">
                <option value="">-- Seleccione el host --</option>
            </select>
            <div class="form-text small">El componente con mayor fracción volumétrica suele ser el host.</div>
        `;
        
        // Insertar después del selector de modelo EMT
        emtModelSelect.parentElement.after(hostContainer);
    }
    
    // Mostrar u ocultar según el modelo
    hostContainer.style.display = isMaxwellGarnett ? 'block' : 'none';
    
    if (!isMaxwellGarnett) return;
    
    // Obtener componentes actuales
    const componentsContainer = layerWrapper.querySelector('.emt-components-container');
    if (!componentsContainer) return;
    
    const components = componentsContainer.querySelectorAll('.emt-component');
    const hostSelect = layerWrapper.querySelector('.layer-host-select');
    
    if (!hostSelect) return;
    
    // Guardar selección actual
    const currentSelection = hostSelect.value;
    
    // Limpiar opciones
    hostSelect.innerHTML = '<option value="">-- Seleccione el host --</option>';
    
    // Agregar opciones por cada componente
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
        
        // Sugerir el componente con mayor fracción
        if (fraction > maxFraction) {
            maxFraction = fraction;
            suggestedHostIndex = index;
        }
    });
    
    // Restaurar selección o usar sugerencia
    if (currentSelection !== '' && hostSelect.querySelector(`option[value="${currentSelection}"]`)) {
        hostSelect.value = currentSelection;
    } else if (components.length > 0) {
        hostSelect.value = suggestedHostIndex;
    }
    
    const layerName = layerWrapper.querySelector('.layer-name')?.value || 'Capa';
    console.log(`[updateHostSelectOptions] ${layerName}: ${components.length} componentes, host sugerido: ${suggestedHostIndex}`);
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
    console.log(`[UpdateMediumFields] Actualizando campos de ${medium} para modelo ${modelType}`);
    
    const paramsDiv = document.getElementById(`${medium}-params`);
    const constantField = document.getElementById(`${medium}-constant-field`);
    const fileUploadDiv = document.getElementById(`${medium}-file-upload`);
    const customEquationDiv = document.getElementById(`${medium}-custom-equation`);
    
    console.log(`[UpdateMediumFields] paramsDiv encontrado:`, !!paramsDiv);
    console.log(`[UpdateMediumFields] constantField encontrado:`, !!constantField);
    console.log(`[UpdateMediumFields] fileUploadDiv encontrado:`, !!fileUploadDiv);
    console.log(`[UpdateMediumFields] customEquationDiv encontrado:`, !!customEquationDiv);
    
    if (!paramsDiv) {
        console.warn(`[UpdateMediumFields] ⚠️ No se encontró ${medium}-params`);
        return;
    }
    
    // Limpiar parámetros
    paramsDiv.innerHTML = "";
    
    // Ocultar todos los campos opcionales por defecto
    if (constantField) constantField.style.display = "none";
    if (fileUploadDiv) fileUploadDiv.style.display = "none";
    if (customEquationDiv) customEquationDiv.style.display = "none";
    
    // =============================================
    // CASO 1: Constante
    // =============================================
    if (modelType === "constant") {
        console.log(`[UpdateMediumFields] Mostrando modelo constante`);
        
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput && nInput.value === "") nInput.value = "1.0";
            if (kInput && kInput.value === "") kInput.value = "0";
        }
    }
    // =============================================
    // CASO 2: Glass (vidrio predefinido)
    // =============================================
    else if (modelType === "glass") {
        console.log(`[UpdateMediumFields] Mostrando modelo glass`);
        
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput) nInput.value = "1.52";
            if (kInput) kInput.value = "0";
        }
    }
    // =============================================
    // CASO 3: Silicon (silicio predefinido)
    // =============================================
    else if (modelType === "si") {
        console.log(`[UpdateMediumFields] Mostrando modelo silicon`);
        
        if (constantField) {
            constantField.style.display = "block";
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            if (nInput) nInput.value = "3.87";
            if (kInput) kInput.value = "0.02";
        }
    }
    // =============================================
    // CASO 4: Archivo n,k,λ
    // =============================================
    else if (modelType === "file_nk") {
        console.log(`[UpdateMediumFields] Mostrando carga de archivo n,k,λ`);
        
        if (fileUploadDiv) {
            fileUploadDiv.style.display = "block";
            // Actualizar hint del archivo
            const uploadHint = fileUploadDiv.querySelector('.upload-hint');
            if (uploadHint) {
                uploadHint.textContent = 'Formato: wavelength(nm), n, k';
            }
        }
    }
    // =============================================
    // CASO 5: Archivo ε₁,ε₂,ω
    // =============================================
    else if (modelType === "file_epsilon") {
        console.log(`[UpdateMediumFields] Mostrando carga de archivo ε₁,ε₂,ω`);
        
        if (fileUploadDiv) {
            fileUploadDiv.style.display = "block";
            // Actualizar hint del archivo
            const uploadHint = fileUploadDiv.querySelector('.upload-hint');
            if (uploadHint) {
                uploadHint.textContent = 'Formato: energy(eV), ε₁, ε₂';
            }
        }
    }
    // =============================================
    // CASO 6: Ecuación personalizada (LaTeX)
    // =============================================
    else if (modelType === "custom_equation") {
        console.log(`[UpdateMediumFields] Mostrando ecuación personalizada`);
        
        if (customEquationDiv) {
            customEquationDiv.style.display = "block";
            
            // Configurar listener para preview en tiempo real
            const latexInput = document.getElementById(`${medium}-custom-latex`);
            const previewDiv = document.getElementById(`${medium}-equation-preview`);
            
            if (latexInput && previewDiv) {
                // Remover listener anterior si existe
                latexInput.removeEventListener('input', latexInput._previewHandler);
                
                // Crear nuevo handler
                latexInput._previewHandler = function() {
                    updateCustomEquationPreview(medium);
                };
                
                latexInput.addEventListener('input', latexInput._previewHandler);
            }
        }
    }
    // =============================================
    // CASO 7: Modelos de dispersión (Cauchy, Sellmeier, etc.)
    // =============================================
    else if (dispersionTemplates[modelType]) {
        console.log(`[UpdateMediumFields] Mostrando modelo de dispersión: ${modelType}`);
        updateModelFieldsEnhanced(paramsDiv, modelType, `${medium}-`);
    }
    // =============================================
    // CASO DEFAULT
    // =============================================
    else {
        console.warn(`[UpdateMediumFields] ⚠️ Modelo desconocido: ${modelType}`);
    }
    
    console.log(`[UpdateMediumFields] ✅ Campos actualizados para ${medium}`);
}

// ============================================================================
// 2. AGREGAR esta nueva función para actualizar el preview de ecuación LaTeX:
// ============================================================================

/**
 * Actualiza la vista previa de una ecuación personalizada en LaTeX
 * @param {string} medium - 'ambient' o 'substrate'
 */
function updateCustomEquationPreview(medium) {
    const latexInput = document.getElementById(`${medium}-custom-latex`);
    const previewDiv = document.getElementById(`${medium}-equation-preview`);
    
    if (!latexInput || !previewDiv) return;
    
    const latex = latexInput.value.trim();
    
    if (!latex) {
        previewDiv.innerHTML = '<em class="text-muted">La ecuación se mostrará aquí</em>';
        return;
    }
    
    // Renderizar con MathJax
    previewDiv.innerHTML = `$$${latex}$$`;
    
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([previewDiv]).catch(err => {
            console.error('[MathJax] Error al renderizar ecuación:', err);
            previewDiv.innerHTML = `<span class="text-danger">Error en la sintaxis LaTeX</span>`;
        });
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
    // medium = 'ambient' o 'substrate'
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
                    <option value="file_nk">Archivo</option>
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
    
    // Event listeners
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
        // ⭐ NUEVO: Actualizar selector de host
        updateMediumHostSelectOptions(medium);
    });
    
    // ⭐ MODIFICADO: Listener de fracción actualiza también el host
    const fractionInput = componentDiv.querySelector('.medium-component-fraction');
    fractionInput.addEventListener('input', () => {
        updateMediumFractionSum(medium);
        updateMediumHostSelectOptions(medium);
    });
    
    // ⭐ NUEVO: Listener de nombre actualiza el host
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
        } else if (model === 'file_nk') {
            fileDiv.style.display = 'block';
        }
    }
    
    modelSelect.addEventListener('change', updateComponentModel);
    updateComponentModel();
    
    // Event listener para archivo de componente EMT de medio
    const fileInput = componentDiv.querySelector('.medium-comp-file');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            handleEMTComponentFileUpload(componentDiv, fileInput);
        });
    }
    
    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
    
    // ⭐ NUEVO: Actualizar selector de host
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

    // Event listener para archivo de capa homogénea
    const layerFileInput = wrapper.querySelector('.layer-file');
    if (layerFileInput) {
        layerFileInput.addEventListener('change', () => {
            handleLayerFileUpload(wrapper, layerFileInput);
        });
    }

    // Configuración heterogénea
    const addComponentBtn = wrapper.querySelector('.add-emt-component');
    addComponentBtn.addEventListener('click', () => addLayerEMTComponent(wrapper));

    // ⭐ NUEVO: Listener para modelo EMT de la capa (Maxwell-Garnett/Bruggeman)
    const emtModelSelect = wrapper.querySelector('.emt-model-select');
    if (emtModelSelect) {
        emtModelSelect.addEventListener('change', () => {
            console.log('[Event] Modelo EMT capa cambiado a:', emtModelSelect.value);
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
            <input type="file" accept=".csv,.txt,.xlsx" class="form-control component-file-input"/>
        </div>
    `;
    
    container.appendChild(componentDiv);
    
    // Event listeners
    const removeBtn = componentDiv.querySelector('.remove-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshLayerComponentTitles(container);
        updateLayerFractionSum(layerWrapper);
        // ⭐ NUEVO: Actualizar selector de host
        updateHostSelectOptions(layerWrapper);
    });
    
    // ⭐ MODIFICADO: Listener de fracción actualiza también el host
    const fractionInput = componentDiv.querySelector('.component-fraction');
    fractionInput.addEventListener('input', () => {
        updateLayerFractionSum(layerWrapper);
        updateHostSelectOptions(layerWrapper);
    });
    
    // ⭐ NUEVO: Listener de nombre actualiza el host
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
        } else if (model === 'file_nk') {
            fileDiv.style.display = 'block';
        }
    });
    
    // Event listener para archivo de componente EMT
    const compFileInput = componentDiv.querySelector('.component-file-input');
    if (compFileInput) {
        compFileInput.addEventListener('change', () => {
            handleEMTComponentFileUpload(componentDiv, compFileInput);
        });
    }
    
    refreshLayerComponentTitles(container);
    updateLayerFractionSum(layerWrapper);
    
    // ⭐ NUEVO: Actualizar selector de host
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

// ============================================================================
// RECOLECCIÓN DE DATOS DEL MODELO
// ============================================================================

/**
 * Recolecta los datos completos de un medio (ambiente o sustrato)
 * Soporta: constante, modelos de dispersión, archivos, y EMT
 * @param {string} medium - 'ambient' o 'substrate'
 * @returns {Object} Datos del medio para el backend
 */
function collectMediumData(medium) {
    console.log(`[collectMediumData] Recolectando datos de ${medium}...`);
    
    // Determinar si es homogéneo o EMT
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio ? typeRadio.value === 'emt' : false;
    
    // Alternativa: verificar por ID del radio button
    const emtRadio = document.getElementById(`${medium}-type-emt`);
    const isEMTbyRadio = emtRadio ? emtRadio.checked : false;
    const finalIsEMT = isEMT || isEMTbyRadio;
    
    console.log(`[collectMediumData] ${medium} es EMT: ${finalIsEMT}`);
    
    if (finalIsEMT) {
        // =============================================
        // CASO EMT
        // =============================================
        return collectMediumEMTData(medium);
    } else {
        // =============================================
        // CASO HOMOGÉNEO
        // =============================================
        return collectMediumHomogeneousData(medium);
    }
}

/**
 * Recolecta datos de un medio homogéneo
 * @param {string} medium - 'ambient' o 'substrate'
 * @returns {Object} Datos del medio homogéneo
 */
function collectMediumHomogeneousData(medium) {
    const modelSelect = document.getElementById(`${medium}-model`);
    const model = modelSelect ? modelSelect.value : 'constant';
    
    console.log(`[collectMediumHomogeneousData] ${medium} modelo: ${model}`);
    
    // CASO 1: Constante (incluyendo glass y si)
    if (model === 'constant' || model === 'glass' || model === 'si') {
        const nInput = document.getElementById(`${medium}-n-constant`);
        const kInput = document.getElementById(`${medium}-k-constant`);
        
        const n = nInput ? parseFloat(nInput.value) || 1.0 : 1.0;
        const k = kInput ? parseFloat(kInput.value) || 0.0 : 0.0;
        
        console.log(`[collectMediumHomogeneousData] ${medium} constante: n=${n}, k=${k}`);
        
        return {
            type: 'constant',
            n: n,
            k: k
        };
    }
    
    // CASO 2: Archivo de datos ópticos (n,k,λ o ε₁,ε₂,ω)
    if (model === 'file_nk' || model === 'file_epsilon') {
        const fileInput = document.getElementById(`${medium}-file`);
        
        if (fileInput && fileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(fileInput.dataset.opticalData);
                console.log(`[collectMediumHomogeneousData] ${medium} archivo: ${opticalData.wavelength?.length || 0} puntos`);
                
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
        
        console.warn(`[collectMediumHomogeneousData] ${medium} archivo sin datos, usando constante por defecto`);
        return {
            type: 'constant',
            n: 1.0,
            k: 0.0
        };
    }
    
    // CASO 3: Ecuación personalizada
    if (model === 'custom_equation') {
        const latexInput = document.getElementById(`${medium}-custom-latex`);
        const equation = latexInput ? latexInput.value.trim() : '';
        
        if (equation) {
            console.log(`[collectMediumHomogeneousData] ${medium} ecuación personalizada: ${equation.substring(0, 50)}...`);
            
            return {
                type: 'custom_equation',
                equation: equation
            };
        }
        
        console.warn(`[collectMediumHomogeneousData] ${medium} ecuación vacía, usando constante por defecto`);
        return {
            type: 'constant',
            n: 1.0,
            k: 0.0
        };
    }
    
    // CASO 4: Modelos de dispersión (Cauchy, Sellmeier, Drude, Lorentz, etc.)
    if (dispersionTemplates[model]) {
        const params = collectDispersionParams(medium, model);
        console.log(`[collectMediumHomogeneousData] ${medium} dispersión ${model}:`, params);
        
        return {
            type: model,
            model: model,
            params: params
        };
    }
    
    // CASO DEFAULT: Constante
    console.warn(`[collectMediumHomogeneousData] ${medium} modelo no reconocido: ${model}, usando constante`);
    return {
        type: 'constant',
        n: 1.0,
        k: 0.0
    };
}

// ============================================================================
// 4. AGREGAR al final de initializeMediumListeners() para manejar file inputs:
// ============================================================================

// AGREGAR ESTO dentro de initializeMediumListeners():

    // Configurar listeners para inputs de archivo
    const ambientFileInput = document.getElementById('ambient-file');
    if (ambientFileInput) {
        ambientFileInput.addEventListener('change', (e) => {
            handleMediumFileUpload('ambient', e.target);
        });
        console.log('[InitMediumListeners] ✅ ambient-file listener agregado');
    }
    
    const substrateFileInput = document.getElementById('substrate-file');
    if (substrateFileInput) {
        substrateFileInput.addEventListener('change', (e) => {
            handleMediumFileUpload('substrate', e.target);
        });
        console.log('[InitMediumListeners] ✅ substrate-file listener agregado');
    }



window.updateCustomEquationPreview = updateCustomEquationPreview;


/**
 * Recolecta datos de un medio EMT
 * @param {string} medium - 'ambient' o 'substrate'
 * @returns {Object} Datos del medio EMT
 */
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
    
    console.log(`[collectMediumEMTData] ${medium} EMT (${emtModel}): ${components.length} componentes`);
    
    // Obtener host index para Maxwell-Garnett
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
        console.log(`[collectMediumEMTData] ${medium} host index: ${hostIndex}`);
    }
    
    return result;
}

/**
 * Recolecta datos de un componente EMT de medio
 * @param {HTMLElement} compDiv - Elemento del componente
 * @param {number} index - Índice del componente
 * @returns {Object|null} Datos del componente
 */
function collectMediumEMTComponentData(compDiv, index) {
    const nameInput = compDiv.querySelector('.medium-component-name');
    const fractionInput = compDiv.querySelector('.medium-component-fraction');
    const modelSelect = compDiv.querySelector('.medium-component-model');
    
    const name = nameInput ? nameInput.value : `Componente ${index + 1}`;
    const fraction = fractionInput ? parseFloat(fractionInput.value) || 0 : 0;
    const model = modelSelect ? modelSelect.value : 'constant';
    
    console.log(`[collectMediumEMTComponentData] Componente ${index}: ${name}, f=${fraction}, modelo=${model}`);
    
    const compData = {
        name: name,
        fraction: fraction,
        model: model
    };
    
    // CASO 1: Constante
    if (model === 'constant') {
        const nInput = compDiv.querySelector('.medium-comp-n');
        const kInput = compDiv.querySelector('.medium-comp-k');
        
        compData.type = 'constant';
        compData.n = nInput ? parseFloat(nInput.value) || 1.5 : 1.5;
        compData.k = kInput ? parseFloat(kInput.value) || 0 : 0;
        
        return compData;
    }
    
    // CASO 2: Archivo
    if (model === 'file_nk' || model === 'file_epsilon') {
        // Buscar datos en el dataset del componente
        if (compDiv.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(compDiv.dataset.opticalData);
                compData.type = 'file';
                compData.optical_data = {
                    wavelength: opticalData.wavelength || opticalData.wavelengths,
                    n: opticalData.n,
                    k: opticalData.k
                };
                console.log(`[collectMediumEMTComponentData] ${name} archivo: ${compData.optical_data.wavelength?.length || 0} puntos`);
                return compData;
            } catch (e) {
                console.error(`[collectMediumEMTComponentData] Error parseando optical_data:`, e);
            }
        }
        
        // Fallback: buscar en el input de archivo
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
        
        console.warn(`[collectMediumEMTComponentData] ${name} archivo sin datos`);
        // Retornar constante por defecto si no hay datos
        compData.type = 'constant';
        compData.n = 1.5;
        compData.k = 0;
        return compData;
    }
    
    // CASO 3: Modelos de dispersión
    if (dispersionTemplates[model]) {
        const paramsDiv = compDiv.querySelector('.medium-component-params');
        const params = collectParamsFromContainer(paramsDiv, model);
        
        compData.type = model;
        compData.params = params;
        
        console.log(`[collectMediumEMTComponentData] ${name} dispersión:`, params);
        return compData;
    }
    
    // Default: constante
    compData.type = 'constant';
    compData.n = 1.5;
    compData.k = 0;
    return compData;
}

/**
 * Recolecta parámetros de dispersión de un contenedor
 * @param {HTMLElement} container - Contenedor con los inputs de parámetros
 * @param {string} model - Nombre del modelo de dispersión
 * @returns {Object} Parámetros del modelo
 */
function collectParamsFromContainer(container, model) {
    const params = {};
    
    if (!container || !dispersionTemplates[model]) {
        return params;
    }
    
    const template = dispersionTemplates[model];
    
    template.params.forEach(paramDef => {
        const paramName = paramDef.name;
        // Buscar input por diferentes patrones de nombre
        const input = container.querySelector(`input[name*="${paramName}"]`) ||
                      container.querySelector(`input[data-param="${paramName}"]`) ||
                      container.querySelector(`.param-${paramName}`);
        
        if (input) {
            params[paramName] = parseFloat(input.value) || paramDef.default || 0;
        } else {
            // Usar valor por defecto
            params[paramName] = paramDef.default || 0;
        }
    });
    
    return params;
}

/**
 * Recolecta parámetros de dispersión para ambiente/sustrato
 * @param {string} medium - 'ambient' o 'substrate'
 * @param {string} model - Nombre del modelo de dispersión
 * @returns {Object} Parámetros del modelo
 */
function collectDispersionParams(medium, model) {
    const paramsContainer = document.getElementById(`${medium}-params`);
    
    if (!paramsContainer) {
        console.warn(`[collectDispersionParams] No se encontró contenedor de parámetros para ${medium}`);
        return {};
    }
    
    return collectParamsFromContainer(paramsContainer, model);
}

/**
 * Recolecta los datos completos de una capa
 * Soporta: homogénea (constante, dispersión, archivo) y EMT
 * @param {HTMLElement} layerElement - Elemento .layer-card de la capa
 * @returns {Object} Datos de la capa para el backend
 */
function collectLayerData(layerElement) {
    const idx = layerElement.dataset.idx || '0';
    
    // Datos básicos
    const nameInput = layerElement.querySelector('.layer-name');
    const thicknessInput = layerElement.querySelector('.layer-thickness');
    
    const name = nameInput ? nameInput.value : `Capa ${idx}`;
    const thickness = thicknessInput ? parseFloat(thicknessInput.value) || 100 : 100;
    
    // Determinar tipo de capa (homogénea o EMT)
    const typeRadio = layerElement.querySelector(`input[name^="layerType"]:checked`);
    const layerType = typeRadio ? typeRadio.value : 'homogeneous';
    const isEMT = layerType === 'heterogeneous' || layerType === 'emt';
    
    console.log(`[collectLayerData] Capa "${name}": espesor=${thickness}nm, tipo=${layerType}`);
    
    const layerData = {
        name: name,
        thickness: thickness,
        layer_type: isEMT ? 'emt' : 'homogeneous'
    };
    
    if (isEMT) {
        // =============================================
        // CASO EMT
        // =============================================
        Object.assign(layerData, collectLayerEMTData(layerElement));
    } else {
        // =============================================
        // CASO HOMOGÉNEO
        // =============================================
        Object.assign(layerData, collectLayerHomogeneousData(layerElement));
    }
    
    return layerData;
}

/**
 * Recolecta datos de una capa homogénea
 * @param {HTMLElement} layerElement - Elemento .layer-card
 * @returns {Object} Datos de la capa homogénea
 */
function collectLayerHomogeneousData(layerElement) {
    const modelSelect = layerElement.querySelector('.layer-model');
    const model = modelSelect ? modelSelect.value : 'cauchy';
    
    console.log(`[collectLayerHomogeneousData] Modelo: ${model}`);
    
    // CASO 1: Constante
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
    
    // CASO 2: Archivo de datos ópticos
    if (model === 'file_nk' || model === 'file_epsilon') {
        // Buscar datos en el wrapper de la capa
        if (layerElement.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(layerElement.dataset.opticalData);
                console.log(`[collectLayerHomogeneousData] Archivo: ${opticalData.wavelength?.length || 0} puntos`);
                
                return {
                    model: model,
                    type: 'file',
                    optical_data: {
                        wavelength: opticalData.wavelength || opticalData.wavelengths,
                        n: opticalData.n,
                        k: opticalData.k
                    }
                };
            } catch (e) {
                console.error(`[collectLayerHomogeneousData] Error parseando optical_data:`, e);
            }
        }
        
        // Fallback: buscar en el input de archivo
        const fileInput = layerElement.querySelector('.layer-file');
        if (fileInput && fileInput.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(fileInput.dataset.opticalData);
                return {
                    model: model,
                    type: 'file',
                    optical_data: {
                        wavelength: opticalData.wavelength || opticalData.wavelengths,
                        n: opticalData.n,
                        k: opticalData.k
                    }
                };
            } catch (e) {
                console.error(`[collectLayerHomogeneousData] Error parseando optical_data del input:`, e);
            }
        }
        
        console.warn(`[collectLayerHomogeneousData] Archivo sin datos, usando Cauchy por defecto`);
        return {
            model: 'cauchy',
            type: 'cauchy',
            params: { A: 1.5, B: 0.004, C: 0 }
        };
    }
    
    // CASO 3: Modelos de dispersión
    if (dispersionTemplates[model]) {
        const paramsDiv = layerElement.querySelector('.layer-params');
        const params = collectParamsFromContainer(paramsDiv, model);
        
        console.log(`[collectLayerHomogeneousData] Dispersión ${model}:`, params);
        
        return {
            model: model,
            type: model,
            params: params
        };
    }
    
    // Default: Cauchy
    console.warn(`[collectLayerHomogeneousData] Modelo no reconocido: ${model}, usando Cauchy`);
    return {
        model: 'cauchy',
        type: 'cauchy',
        params: { A: 1.5, B: 0.004, C: 0 }
    };
}

/**
 * Recolecta datos de una capa EMT
 * @param {HTMLElement} layerElement - Elemento .layer-card
 * @returns {Object} Datos de la capa EMT
 */
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
    
    console.log(`[collectLayerEMTData] EMT (${emtModel}): ${components.length} componentes`);
    
    // Obtener host index para Maxwell-Garnett
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
        console.log(`[collectLayerEMTData] Host index: ${hostIndex}`);
    }
    
    return result;
}

/**
 * Recolecta datos de un componente EMT de capa
 * @param {HTMLElement} compDiv - Elemento del componente
 * @param {number} index - Índice del componente
 * @returns {Object|null} Datos del componente
 */
function collectLayerEMTComponentData(compDiv, index) {
    const nameInput = compDiv.querySelector('.component-name');
    const fractionInput = compDiv.querySelector('.component-fraction');
    const modelSelect = compDiv.querySelector('.component-model');
    
    const name = nameInput ? nameInput.value : `Componente ${index + 1}`;
    const fraction = fractionInput ? parseFloat(fractionInput.value) || 0 : 0;
    const model = modelSelect ? modelSelect.value : 'constant';
    
    console.log(`[collectLayerEMTComponentData] Componente ${index}: ${name}, f=${fraction}, modelo=${model}`);
    
    const compData = {
        name: name,
        fraction: fraction,
        model: model
    };
    
    // CASO 1: Constante
    if (model === 'constant') {
        const nInput = compDiv.querySelector('.component-n');
        const kInput = compDiv.querySelector('.component-k');
        
        compData.type = 'constant';
        compData.n = nInput ? parseFloat(nInput.value) || 1.5 : 1.5;
        compData.k = kInput ? parseFloat(kInput.value) || 0 : 0;
        
        return compData;
    }
    
    // CASO 2: Archivo
    if (model === 'file_nk' || model === 'file_epsilon') {
        // Buscar datos en el dataset del componente
        if (compDiv.dataset.opticalData) {
            try {
                const opticalData = JSON.parse(compDiv.dataset.opticalData);
                compData.type = 'file';
                compData.optical_data = {
                    wavelength: opticalData.wavelength || opticalData.wavelengths,
                    n: opticalData.n,
                    k: opticalData.k
                };
                console.log(`[collectLayerEMTComponentData] ${name} archivo: ${compData.optical_data.wavelength?.length || 0} puntos`);
                return compData;
            } catch (e) {
                console.error(`[collectLayerEMTComponentData] Error parseando optical_data:`, e);
            }
        }
        
        // Fallback: buscar en el input de archivo
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
        
        console.warn(`[collectLayerEMTComponentData] ${name} archivo sin datos`);
        // Retornar constante por defecto
        compData.type = 'constant';
        compData.n = 1.5;
        compData.k = 0;
        return compData;
    }
    
    // CASO 3: Modelos de dispersión
    if (dispersionTemplates[model]) {
        const paramsDiv = compDiv.querySelector('.component-params');
        const params = collectParamsFromContainer(paramsDiv, model);
        
        compData.type = model;
        compData.params = params;
        
        console.log(`[collectLayerEMTComponentData] ${name} dispersión:`, params);
        return compData;
    }
    
    // Default: constante
    compData.type = 'constant';
    compData.n = 1.5;
    compData.k = 0;
    return compData;
}

// ============================================================================
// UI DE SELECCIÓN DE GRÁFICAS
// ============================================================================
// ============================================================================
// SELECTOR DE CAPAS PARA GRÁFICAS n,k
// ============================================================================

/**
 * Crea el selector de capas para mostrar gráficas de constantes ópticas
 * Aparece DESPUÉS de calcular, en la sección de resultados
 * @param {Array} layers - Array de capas del modelo
 * @param {Object} opticalConstants - Datos de constantes ópticas del resultado
 * @returns {HTMLElement} Elemento con el selector
 */
function createLayerNKSelector(layers, opticalConstants) {
    const container = document.createElement('div');
    container.className = 'layer-nk-selector card p-3 mb-4';
    container.id = 'layer-nk-selector';
    
    if (!layers || layers.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info mb-0">
                <strong>Sin capas definidas</strong>
                <p class="mb-0 small">El modelo solo tiene ambiente y sustrato.</p>
            </div>
        `;
        return container;
    }
    
    container.innerHTML = `
        <h6 class="mb-3">
            Constantes Ópticas por Capa (n, k)
        </h6>
        
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
    
    // Agregar checkboxes
    const checkboxesContainer = container.querySelector('.layer-checkboxes-container');
    
    // Ambiente
    checkboxesContainer.appendChild(createLayerCheckbox('ambient', 'Ambiente', false));
    
    // Capas
    layers.forEach((layer, index) => {
        const layerName = layer.name || `Capa ${index + 1}`;
        const checkbox = createLayerCheckbox(`layer-${index}`, layerName, true);
        checkbox.dataset.layerIndex = index;
        checkboxesContainer.appendChild(checkbox);
    });
    
    // Sustrato
    checkboxesContainer.appendChild(createLayerCheckbox('substrate', 'Sustrato', false));
    
    // Event listeners
    setupLayerNKSelectorListeners(container, layers, opticalConstants);
    
    return container;
}

/**
 * Crea un checkbox individual para una capa
 */
function createLayerCheckbox(id, label, checked = true) {
    const div = document.createElement('div');
    div.className = 'form-check form-check-inline';
    div.innerHTML = `
        <input class="form-check-input layer-nk-checkbox" type="checkbox" id="nk-${id}" value="${id}" ${checked ? 'checked' : ''}>
        <label class="form-check-label small" for="nk-${id}">${label}</label>
    `;
    return div;
}

/**
 * Configura los event listeners del selector de capas
 */
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

/**
 * Renderiza las gráficas de n,k para las capas seleccionadas
 */
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

/**
 * Renderiza las gráficas de n,k para una capa específica
 */
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
    
    // Gráfica combinada
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
    
    // Gráficas separadas
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

/**
 * Gráfica combinada de n y k (eje dual)
 */
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

/**
 * Gráfica individual de n
 */
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

/**
 * Gráfica individual de k
 */
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
// VISUALIZACIÓN DE RESULTADOS TEÓRICOS (VERSIÓN MEJORADA)
// ============================================================================

let lastTheoreticalResults = null;
let lastTheoreticalModel = null;

function createAccordionSection(id, title, expanded, contentGenerator) {
    const section = document.createElement('div');
    section.className = 'accordion-item';
    section.innerHTML = `
        <div class="accordion-header ${expanded ? 'active' : ''}" data-target="${id}">
            <span class="accordion-title">${title}</span>
            <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-content ${expanded ? 'open' : ''}" id="accordion-${id}">
            <div class="accordion-body"></div>
        </div>
    `;
    
    const header = section.querySelector('.accordion-header');
    const content = section.querySelector('.accordion-content');
    const body = section.querySelector('.accordion-body');
    
    // Click handler - solo uno abierto a la vez
    header.addEventListener('click', () => {
        const allHeaders = document.querySelectorAll('.accordion-header');
        const allContents = document.querySelectorAll('.accordion-content');
        
        const isOpen = content.classList.contains('open');
        
        // Cerrar todos
        allHeaders.forEach(h => h.classList.remove('active'));
        allContents.forEach(c => c.classList.remove('open'));
        
        // Si estaba cerrado, abrir este
        if (!isOpen) {
            header.classList.add('active');
            content.classList.add('open');
            
            // Renderizar contenido si está vacío
            if (body.children.length === 0) {
                const generatedContent = contentGenerator();
                body.appendChild(generatedContent);
            }
        }
    });
    
    // Si está expandido por defecto, generar contenido
    if (expanded) {
        setTimeout(() => {
            const generatedContent = contentGenerator();
            body.appendChild(generatedContent);
        }, 100);
    }
    
    return section;
}

function createPsiDeltaGraphs(wavelengths, psi, delta) {
    const container = document.createElement('div');
    
    // Gráfica Psi
    container.appendChild(createSingleGraph('graph-psi', 'Ψ (Psi) vs λ', (divId) => {
        Plotly.newPlot(divId, [{
            x: wavelengths, y: psi, name: 'Ψ', type: 'scatter', mode: 'lines',
            line: { color: '#667eea', width: 2 }
        }], {
            xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Ψ (°)', range: [0, 90], gridcolor: '#e0e0e0' },
            margin: { t: 30, b: 50, l: 60, r: 30 },
            plot_bgcolor: 'white', paper_bgcolor: 'white'
        }, { responsive: true });
    }));
    
    // Gráfica Delta
    container.appendChild(createSingleGraph('graph-delta', 'Δ (Delta) vs λ', (divId) => {
        Plotly.newPlot(divId, [{
            x: wavelengths, y: delta, name: 'Δ', type: 'scatter', mode: 'lines',
            line: { color: '#764ba2', width: 2 }
        }], {
            xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Δ (°)', range: [0, 360], gridcolor: '#e0e0e0' },
            margin: { t: 30, b: 50, l: 60, r: 30 },
            plot_bgcolor: 'white', paper_bgcolor: 'white'
        }, { responsive: true });
    }));
    
    // Gráfica combinada
    container.appendChild(createSingleGraph('graph-psi-delta', 'Ψ y Δ vs λ (combinada)', (divId) => {
        Plotly.newPlot(divId, [
            { x: wavelengths, y: psi, name: 'Ψ', type: 'scatter', mode: 'lines', line: { color: '#667eea', width: 2 } },
            { x: wavelengths, y: delta, name: 'Δ', type: 'scatter', mode: 'lines', yaxis: 'y2', line: { color: '#764ba2', width: 2 } }
        ], {
            xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
            yaxis: { title: 'Ψ (°)', side: 'left', range: [0, 90], gridcolor: '#e0e0e0' },
            yaxis2: { title: 'Δ (°)', side: 'right', overlaying: 'y', range: [0, 360] },
            legend: { x: 0.5, y: 1.05, orientation: 'h', xanchor: 'center' },
            margin: { t: 40, b: 50, l: 60, r: 60 },
            plot_bgcolor: 'white', paper_bgcolor: 'white'
        }, { responsive: true });
    }));
    
    return container;
}

function createRTAGraphs(type, wavelengths, dataS, dataP, colorS, colorP) {
    const container = document.createElement('div');
    const labels = { R: 'Reflectancia', T: 'Transmitancia', A: 'Absorbancia' };
    const label = labels[type];
    
    // Gráfica polarización s
    if (dataS?.length > 0) {
        container.appendChild(createSingleGraph(`graph-${type}s`, `${type}s (polarización s) vs λ`, (divId) => {
            Plotly.newPlot(divId, [{
                x: wavelengths, y: dataS, name: `${type}s`, type: 'scatter', mode: 'lines',
                line: { color: colorS, width: 2 }
            }], {
                xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
                yaxis: { title: `${type}s`, range: [0, 1], gridcolor: '#e0e0e0' },
                margin: { t: 30, b: 50, l: 60, r: 30 },
                plot_bgcolor: 'white', paper_bgcolor: 'white'
            }, { responsive: true });
        }));
    }
    
    // Gráfica polarización p
    if (dataP?.length > 0) {
        container.appendChild(createSingleGraph(`graph-${type}p`, `${type}p (polarización p) vs λ`, (divId) => {
            Plotly.newPlot(divId, [{
                x: wavelengths, y: dataP, name: `${type}p`, type: 'scatter', mode: 'lines',
                line: { color: colorP, width: 2 }
            }], {
                xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
                yaxis: { title: `${type}p`, range: [0, 1], gridcolor: '#e0e0e0' },
                margin: { t: 30, b: 50, l: 60, r: 30 },
                plot_bgcolor: 'white', paper_bgcolor: 'white'
            }, { responsive: true });
        }));
    }
    
    // Gráfica combinada s y p
    if (dataS?.length > 0 && dataP?.length > 0) {
        container.appendChild(createSingleGraph(`graph-${type}-combined`, `${type}s y ${type}p vs λ`, (divId) => {
            Plotly.newPlot(divId, [
                { x: wavelengths, y: dataS, name: `${type}s`, type: 'scatter', mode: 'lines', line: { color: colorS, width: 2 } },
                { x: wavelengths, y: dataP, name: `${type}p`, type: 'scatter', mode: 'lines', line: { color: colorP, width: 2 } }
            ], {
                xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
                yaxis: { title: label, range: [0, 1], gridcolor: '#e0e0e0' },
                legend: { x: 0.5, y: 1.05, orientation: 'h', xanchor: 'center' },
                margin: { t: 40, b: 50, l: 60, r: 30 },
                plot_bgcolor: 'white', paper_bgcolor: 'white'
            }, { responsive: true });
        }));
    }
    
    return container;
}

function createSingleGraph(id, title, plotFn) {
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

function createOpticalConstantsSection(layers, opticalConstants) {
    const container = document.createElement('div');
    container.innerHTML = '<p class="text-muted mb-3">Seleccione capas para visualizar sus constantes ópticas n y k.</p>';
    // Aquí puedes reutilizar createLayerNKSelector o simplificarlo
    // Por ahora retornamos un placeholder
    const selector = createLayerNKSelector(layers, opticalConstants);
    container.appendChild(selector);
    return container;
}

// ============================================================================
// FUNCIONES DE DESCARGA
// ============================================================================

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


// ============================================================================
// GUARDAR MODELO Y EJECUTAR CÁLCULO
// ============================================================================

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
        console.log('[SaveModel] Iniciando recolección de datos...');
        
        // Validar configuración global
        if (!theoreticalConfig.angle || !theoreticalConfig.wavelengths || theoreticalConfig.wavelengths.length === 0) {
            throw new Error("Configuración incompleta: falta ángulo o longitudes de onda");
        }
        
        // Construir modelo
        const model = {
            global: {
                angle: theoreticalConfig.angle,
                polarization: theoreticalConfig.polarization,  // Siempre 'both'
                wavelengths: theoreticalConfig.wavelengths,
                outputs: theoreticalConfig.outputs
            },
            ambient: null,
            substrate: null,
            layers: [],
            created_at: new Date().toISOString()
        };
        
        console.log('[SaveModel] Recolectando datos de ambiente...');
        model.ambient = collectMediumData('ambient');
        
        console.log('[SaveModel] Recolectando datos de sustrato...');
        model.substrate = collectMediumData('substrate');
        
        console.log('[SaveModel] Recolectando datos de capas...');
        const layerElements = document.querySelectorAll('#layers-container .layer-card');
        
        for (const layerEl of layerElements) {
            const layerData = collectLayerData(layerEl);
            model.layers.push(layerData);
        }
        
        console.log('[Modelo] Modelo óptico construido:', {
            angle: model.global.angle,
            wavelengths: `${model.global.wavelengths.length} puntos`,
            layers: `${model.layers.length} capas`,
            ambient: model.ambient.type,
            substrate: model.substrate.type
        });
        
        savedModel = model;
        
        // Cerrar modal
        const modalEl = document.getElementById('modelWizardModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
        
        // Actualizar workflow
        updateWorkflowStep(3);
        
        // Mostrar banner de éxito
        showModelSavedBanner(model);
        
        // Ejecutar cálculo teórico automáticamente
        console.log('[SaveModel] Iniciando cálculo teórico...');
        await executeTheoreticalCalculation(model);
        
    } catch (error) {
        console.error('[Error] Error al guardar modelo:', error);
        wizardError.innerText = "❌ Error: " + error.message;
        wizardError.style.display = "block";
        
        // Log en consola para debugging
        console.error('[Error] Stack trace:', error.stack);
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
    
    const resultsContainer = document.getElementById('results-container');
    
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

// ============================================================================
// FUNCIONES NUEVAS PARA SELECTOR DE GRÁFICAS Y VISUALIZACIÓN
// Agregar al final de appteorico.js
// ============================================================================

// Variables para almacenar resultados
let currentGraphType = 'psi-delta';
let currentLayerIndex = 0;

// ============================================================================
// INICIALIZACIÓN DEL SELECTOR DE GRÁFICAS
// ============================================================================

function initializeGraphSelector() {
    const btn = document.getElementById('graph-selector-btn');
    const dropdown = document.getElementById('graph-selector-dropdown');
    const items = document.querySelectorAll('.graph-selector-item');
    
    if (!btn || !dropdown) return;
    
    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('open');
        dropdown.classList.toggle('show');
    });
    
    // Cerrar al hacer clic fuera
    document.addEventListener('click', () => {
        btn.classList.remove('open');
        dropdown.classList.remove('show');
    });
    
    // Seleccionar item
    items.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            selectGraphType(type);
            
            // Actualizar UI
            items.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Actualizar label del botón
            const title = item.querySelector('.item-title').textContent;
            document.getElementById('graph-selector-label').textContent = title;
            
            // Cerrar dropdown
            btn.classList.remove('open');
            dropdown.classList.remove('show');
        });
    });
    
    // Opciones de visualización
    const showGridCheck = document.getElementById('show-grid');
    const whiteBgCheck = document.getElementById('white-bg');
    
    if (showGridCheck) {
        showGridCheck.addEventListener('change', () => refreshCurrentGraphs());
    }
    if (whiteBgCheck) {
        whiteBgCheck.addEventListener('change', () => refreshCurrentGraphs());
    }
}

// ============================================================================
// SELECCIÓN DE TIPO DE GRÁFICA
// ============================================================================

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
    
    // ⭐ NUEVO: Mostrar/ocultar selector de capas n,k
    const layerSelector = document.getElementById('layerSelectorInline');
    if (layerSelector) {
        layerSelector.style.display = type === 'nk' ? 'inline-flex' : 'none';
    }

    // ⭐ NUEVO: Mostrar/ocultar selector de capas EMT
    const emtLayerSelector = document.getElementById('emtLayerSelectorInline');
    if (emtLayerSelector) {
        emtLayerSelector.style.display = type === 'nk-emt' ? 'inline-flex' : 'none';
    }

    // ⭐ NUEVO: Mostrar/ocultar opciones incidente/sustrato
    const nkOptions = document.getElementById('nkOptionsInline');
    if (nkOptions) {
        nkOptions.style.display = type === 'nk' ? 'inline-flex' : 'none';
    }

    // ⭐ NUEVO: Ocultar título de capa al cambiar de tipo
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

// ============================================================================
// RENDERIZADO DE GRÁFICAS PSI/DELTA
// ============================================================================

function renderPsiDeltaGraphs(container, wavelengths, psi, delta) {
    // Botones de descarga
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-buttons';
    downloadDiv.innerHTML = `
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-psi')">Descargar Ψ (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-delta')">Descargar Δ (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-psi-delta')">Descargar Combinada (PNG)</button>
        <button class="btn btn-outline-secondary" onclick="downloadAllGraphsPDF()">Descargar todas (PDF)</button>
    `;
    container.appendChild(downloadDiv);
    
    // Gráfica Psi
    if (psi?.length > 0) {
        container.appendChild(createGraphCard('graph-psi', 'Ψ (Psi) vs Longitud de Onda', (divId) => {
            plotSingleLine(divId, wavelengths, psi, 'Ψ', '#667eea', 'Ψ (°)', [0, 90]);
        }));
    }
    
    // Gráfica Delta
    if (delta?.length > 0) {
        container.appendChild(createGraphCard('graph-delta', 'Δ (Delta) vs Longitud de Onda', (divId) => {
            plotSingleLine(divId, wavelengths, delta, 'Δ', '#764ba2', 'Δ (°)', [0, 360]);
        }));
    }
    
    // Gráfica combinada
    if (psi?.length > 0 && delta?.length > 0) {
        container.appendChild(createGraphCard('graph-psi-delta', 'Ψ y Δ vs Longitud de Onda', (divId) => {
            plotDualAxis(divId, wavelengths, psi, delta, 'Ψ', 'Δ', '#667eea', '#764ba2', 'Ψ (°)', 'Δ (°)', [0, 90], [0, 360]);
        }));
    }
}

// ============================================================================
// RENDERIZADO DE GRÁFICAS R/T/A
// ============================================================================

function renderRTAGraphs(container, prefix, label, wavelengths, dataS, dataP) {
    // Botones de descarga
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
    
    // Gráfica s
    if (dataS?.length > 0) {
        container.appendChild(createGraphCard(`graph-${prefix}s`, `${prefix}s (polarización s) vs Longitud de Onda`, (divId) => {
            plotSingleLine(divId, wavelengths, dataS, `${prefix}s`, colorS, label, [0, 1]);
        }));
    }
    
    // Gráfica p
    if (dataP?.length > 0) {
        container.appendChild(createGraphCard(`graph-${prefix}p`, `${prefix}p (polarización p) vs Longitud de Onda`, (divId) => {
            plotSingleLine(divId, wavelengths, dataP, `${prefix}p`, colorP, label, [0, 1]);
        }));
    }
    
    // Gráfica combinada
    if (dataS?.length > 0 && dataP?.length > 0) {
        // Calcular promedio
        const dataAvg = dataS.map((s, i) => (s + dataP[i]) / 2);
        
        container.appendChild(createGraphCard(`graph-${prefix}-combined`, `${prefix}s, ${prefix}p y ${prefix} promedio vs Longitud de Onda`, (divId) => {
            plotTripleLine(divId, wavelengths, dataS, dataP, dataAvg, `${prefix}s`, `${prefix}p`, `${prefix} avg`, colorS, colorP, '#34495e', label);
        }));
    }
}

// ============================================================================
// RENDERIZADO DE GRÁFICAS N/K CON SELECTOR DE CAPA
// ============================================================================

function renderNKGraphsWithSelector(container, wavelengths, opticalConstants, layers) {
    // Selector de capa
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
    
    // Contenedor de gráficas n,k
    const graphsDiv = document.createElement('div');
    graphsDiv.id = 'nk-graphs-container';
    container.appendChild(graphsDiv);
    
    // Listener para selector
    const select = document.getElementById('nk-layer-select');
    select.addEventListener('change', () => {
        renderNKForLayer(graphsDiv, wavelengths, opticalConstants, layers, select.value);
    });
    
    // Renderizar inicial (ambiente)
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
    
    // Botones de descarga
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-buttons';
    downloadDiv.innerHTML = `
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-n-${safeId}')">Descargar n (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-k-${safeId}')">Descargar k (PNG)</button>
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('graph-nk-${safeId}')">Descargar Combinada (PNG)</button>
    `;
    container.appendChild(downloadDiv);
    
    // Gráfica n
    container.appendChild(createGraphCard(`graph-n-${safeId}`, `n (índice de refracción) - ${layerName}`, (divId) => {
        plotSingleLine(divId, wavelengths, n, 'n', '#2196F3', 'n', null);
    }));
    
    // Gráfica k
    container.appendChild(createGraphCard(`graph-k-${safeId}`, `k (coeficiente de extinción) - ${layerName}`, (divId) => {
        plotSingleLine(divId, wavelengths, k, 'k', '#FF5722', 'k', null);
    }));
    
    // Gráfica combinada
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
    
    // Renderizar después de agregar al DOM
    setTimeout(() => plotFn(id), 50);
    
    return card;
}

function plotSingleLine(divId, x, y, name, color, yTitle, yRange) {
    const config = getPlotConfig();
    
    const trace = {
        x: x,
        y: y,
        name: name,
        type: 'scatter',
        mode: 'lines',
        line: { color: color, width: 2 }
    };
    
    const layout = {
        xaxis: { 
            title: 'Longitud de onda (nm)', 
            gridcolor: config.gridColor,
            showgrid: config.showGrid
        },
        yaxis: { 
            title: yTitle, 
            gridcolor: config.gridColor,
            showgrid: config.showGrid,
            range: yRange
        },
        margin: { t: 30, b: 60, l: 70, r: 30 },
        plot_bgcolor: config.bgColor,
        paper_bgcolor: config.bgColor,
        showlegend: false
    };
    
    Plotly.newPlot(divId, [trace], layout, { responsive: true, displayModeBar: true });
}

function plotDualAxis(divId, x, y1, y2, name1, name2, color1, color2, yTitle1, yTitle2, yRange1, yRange2) {
    const config = getPlotConfig();
    
    const trace1 = {
        x: x,
        y: y1,
        name: name1,
        type: 'scatter',
        mode: 'lines',
        line: { color: color1, width: 2 },
        yaxis: 'y'
    };
    
    const trace2 = {
        x: x,
        y: y2,
        name: name2,
        type: 'scatter',
        mode: 'lines',
        line: { color: color2, width: 2 },
        yaxis: 'y2'
    };
    
    const layout = {
        xaxis: { 
            title: 'Longitud de onda (nm)', 
            gridcolor: config.gridColor,
            showgrid: config.showGrid
        },
        yaxis: { 
            title: yTitle1,
            titlefont: { color: color1 },
            tickfont: { color: color1 },
            gridcolor: config.gridColor,
            showgrid: config.showGrid,
            range: yRange1
        },
        yaxis2: { 
            title: yTitle2,
            titlefont: { color: color2 },
            tickfont: { color: color2 },
            overlaying: 'y',
            side: 'right',
            range: yRange2
        },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 60, l: 70, r: 70 },
        plot_bgcolor: config.bgColor,
        paper_bgcolor: config.bgColor
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
        xaxis: { 
            title: 'Longitud de onda (nm)', 
            gridcolor: config.gridColor,
            showgrid: config.showGrid
        },
        yaxis: { 
            title: yTitle, 
            gridcolor: config.gridColor,
            showgrid: config.showGrid,
            range: [0, 1]
        },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 60, l: 70, r: 30 },
        plot_bgcolor: config.bgColor,
        paper_bgcolor: config.bgColor
    };
    
    Plotly.newPlot(divId, traces, layout, { responsive: true, displayModeBar: true });
}

// ============================================================================
// FUNCIÓN MODIFICADA: displayTheoreticalResults
// Reemplazar la función existente con esta versión
// ============================================================================

function displayTheoreticalResults(result, model) {
    console.log('[displayTheoreticalResults] Mostrando resultados...');
    
    lastTheoreticalResults = result;
    lastTheoreticalModel = model;
    
    // Ocultar estado inicial
    const noResults = document.getElementById('no-results');
    if (noResults) noResults.style.display = 'none';
    
    // Mostrar contenedor de resultados
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.style.display = 'block';
    
    // Mostrar selector y opciones
    const selectorContainer = document.getElementById('graph-selector-container');
    const graphOptions = document.getElementById('graph-options');
    if (selectorContainer) selectorContainer.style.display = 'block';
    if (graphOptions) graphOptions.style.display = 'flex';
    
    // Actualizar título
    const title = document.getElementById('graphs-title');
    if (title) {
        const wl = model.global?.wavelengths || [];
        title.textContent = `Resultados: ${wl.length} puntos, ${model.global?.angle}°`;
    }
    
    // Mostrar resumen del modelo en panel izquierdo
    updateModelSummary(model);
    
    // Inicializar selector si no está inicializado
    initializeGraphSelector();
    
    // Mostrar gráficas por defecto (psi-delta)
    currentGraphType = 'psi-delta';
    selectGraphType('psi-delta');
}

// ============================================================================
// ACTUALIZAR RESUMEN DEL MODELO EN PANEL IZQUIERDO
// ============================================================================

function updateModelSummary(model) {
    const container = document.getElementById('model-summary-container');
    const layersSummary = document.getElementById('model-layers-summary');
    
    if (!container || !layersSummary) return;
    
    container.style.display = 'block';
    
    let html = '';
    
    // Ambiente
    html += `<div class="model-layer">
        <span class="model-layer-icon">🌬️</span>
        <span class="model-layer-name">Ambiente</span>
        <div class="model-layer-details">${getModelDescription(model.ambient)}</div>
    </div>`;
    
    // Capas
    if (model.layers && model.layers.length > 0) {
        model.layers.forEach((layer, idx) => {
            html += `<div class="model-layer">
                <span class="model-layer-icon">📚</span>
                <span class="model-layer-name">${layer.name || 'Capa ' + (idx + 1)}</span>
                <div class="model-layer-details">${layer.thickness} nm - ${getModelDescription(layer)}</div>
            </div>`;
        });
    }
    
    // Sustrato
    html += `<div class="model-layer">
        <span class="model-layer-icon">🧱</span>
        <span class="model-layer-name">Sustrato</span>
        <div class="model-layer-details">${getModelDescription(model.substrate)}</div>
    </div>`;
    
    layersSummary.innerHTML = html;
    
    // Listener para editar
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

console.log('[Pruebas Teóricas] Módulo de gráficas cargado');