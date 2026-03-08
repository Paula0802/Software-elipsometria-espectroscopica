// ============================================================
// FUNCIONES DE CÁLCULO EMT (Effective Medium Theory)
// Agregar este código a tu app.js
// ============================================================

/**
 * Valida y calcula n,k efectivos para medios EMT (ambiente/sustrato) o capas heterogéneas
 * @param {string} type - 'ambient', 'substrate', o 'layer'
 * @param {number|string} identifier - Para capas, el índice de la capa
 */

async function validateAndCalculateEMT(type, identifier = null) {
    console.log(`🧮 Iniciando cálculo EMT para: ${type}`, identifier);
    
    let container, emtModel, components, resultContainer, button;
    
    try {
        if (type === 'ambient' || type === 'substrate') {
            container = document.getElementById(`${type}-emt-components`);
            emtModel = document.getElementById(`${type}-emt-model`)?.value || 'bruggeman';
            resultContainer = document.getElementById(`${type}-emt-config`);
            button = resultContainer?.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn');
            components = container?.querySelectorAll('.medium-emt-component');
        } else if (type === 'layer') {
            const layerCard = document.querySelector(`.layer-card[data-idx="${identifier}"]`);
            if (!layerCard) {
                throw new Error(`No se encontró la capa con índice ${identifier}`);
            }
            container = layerCard.querySelector('.emt-components-container');
            emtModel = layerCard.querySelector('.emt-model-select')?.value || 'bruggeman';
            resultContainer = layerCard.querySelector('.heterogeneous-config');
            button = resultContainer?.querySelector('.calculate-layer-emt-btn');
            components = container?.querySelectorAll('.emt-component');
        } else {
            throw new Error(`Tipo no reconocido: ${type}`);
        }
        
        if (!container || !components || components.length === 0) {
            throw new Error('No se encontraron componentes EMT');
        }
        
        console.log(`  Modelo EMT: ${emtModel}`);
        console.log(`  Componentes encontrados: ${components.length}`);
        
        let totalFraction = 0;
        components.forEach(comp => {
            const fractionInput = comp.querySelector('.medium-component-fraction, .component-fraction');
            const fraction = parseFloat(fractionInput?.value) || 0;
            totalFraction += fraction;
        });
        
        totalFraction = Math.round(totalFraction * 1000) / 1000;
        
        if (Math.abs(totalFraction - 1.0) > 0.01) {
            throw new Error(`La suma de fracciones debe ser 1.0 (actual: ${totalFraction.toFixed(3)})`);
        }
        
        console.log(`  ✅ Suma de fracciones válida: ${totalFraction}`);
        
        const componentsData = [];
        
        for (const comp of components) {
            const compData = {};
            
            compData.name = comp.querySelector('.medium-component-name, .component-name')?.value || 'Componente';
            
            const fractionInput = comp.querySelector('.medium-component-fraction, .component-fraction');
            compData.fraction = parseFloat(fractionInput?.value) || 0;
            
            const modelSelect = comp.querySelector('.medium-component-model, .component-model');
            compData.model = modelSelect?.value || 'constant';
            
            console.log(`  Componente: ${compData.name}, f=${compData.fraction}, modelo=${compData.model}`);
            
            if (compData.model === 'constant') {
                const nInput = comp.querySelector('.medium-comp-n, .component-n');
                const kInput = comp.querySelector('.medium-comp-k, .component-k');
                compData.n = parseFloat(nInput?.value) || 1.5;
                compData.k = parseFloat(kInput?.value) || 0;
                console.log(`    n=${compData.n}, k=${compData.k}`);
                
            } else if (compData.model === 'file_nk' || compData.model === 'file_epsilon') {
                const opticalDataStr = comp.dataset.opticalData;
                if (opticalDataStr) {
                    compData.optical_data = JSON.parse(opticalDataStr);
                    console.log(`    Datos de archivo: ${compData.optical_data.wavelength?.length} puntos`);
                } else {
                    throw new Error(`El componente "${compData.name}" requiere un archivo de datos ópticos`);
                }
                
            } else if (['cauchy', 'sellmeier', 'drude', 'lorentz', 'drude_lorentz'].includes(compData.model)) {
                compData.params = {};
                
                // ⭐ DIAGNÓSTICO: ver estructura real del DOM
                console.log('🔍 outerHTML del comp (500 chars):', comp.outerHTML.substring(0, 500));
                
                const sel1 = comp.querySelectorAll('input[data-param]');
                const sel2 = comp.querySelectorAll('.layer-param');
                const sel3 = comp.querySelectorAll('.component-param');
                const sel4 = comp.querySelectorAll('.model-params-placeholder input');
                const sel5 = comp.querySelectorAll('.component-params input');
                
                console.log(`  input[data-param]: ${sel1.length}`);
                console.log(`  .layer-param: ${sel2.length}`);
                console.log(`  .component-param: ${sel3.length}`);
                console.log(`  .model-params-placeholder input: ${sel4.length}`);
                console.log(`  .component-params input: ${sel5.length}`);
                
                // Usar el selector que encuentre algo
                const paramInputs = sel1.length > 0 ? sel1 :
                                    sel2.length > 0 ? sel2 :
                                    sel4.length > 0 ? sel4 :
                                    sel5.length > 0 ? sel5 : [];
                
                console.log(`  ✅ Usando selector con ${paramInputs.length} inputs`);
                
                paramInputs.forEach(inp => {
                    const paramName = inp.dataset.param;
                    if (paramName) {
                        const val = inp.value.trim();
                        const parsed = parseFloat(val);
                        compData.params[paramName] = isNaN(parsed) ? 0 : parsed;
                        console.log(`    ${paramName} = "${val}" → ${compData.params[paramName]}`);
                    }
                });
                
                console.log(`  Parámetros recolectados (${Object.keys(compData.params).length}):`, compData.params);
            }
            
            componentsData.push(compData);
        }
        
        let wavelengths;
        try {
            wavelengths = getWavelengthsArray();
        } catch (e) {
            console.warn('No hay wavelengths definidos, usando rango por defecto');
            wavelengths = [];
            for (let i = 300; i <= 800; i += 10) {
                wavelengths.push(i);
            }
        }
        
        console.log(`  Longitudes de onda: ${wavelengths.length} puntos`);
        
        const requestData = {
            emt_model: emtModel,
            components: componentsData,
            wavelengths: wavelengths
        };
        
        if (emtModel === 'maxwell-garnett') {
            const hostSelect = resultContainer?.querySelector('.emt-host-select');
            requestData.host_index = parseInt(hostSelect?.value) || 0;
            console.log(`  Host index para Maxwell-Garnett: ${requestData.host_index}`);
        }
        
        console.log('📤 Enviando request al backend...');
        console.log('📦 Componentes enviados:', JSON.stringify(componentsData, null, 2));
        
        const response = await fetch('/api/calculate-emt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok || result.error) {
            throw new Error(result.error || `Error del servidor: ${response.status}`);
        }
        
        console.log('✅ Cálculo EMT completado');
        
        if (resultContainer) {
            resultContainer.dataset.emtCalculated = 'true';
            resultContainer.dataset.nEffective = JSON.stringify(result.n_effective);
            resultContainer.dataset.kEffective = JSON.stringify(result.k_effective);
            resultContainer.dataset.wavelengthsEffective = JSON.stringify(result.wavelengths || wavelengths);
        }
        
        showEMTResults(type, identifier, result, resultContainer);
        
        return result;
        
    } catch (error) {
        console.error('❌ Error en cálculo EMT:', error);
        showEMTError(type, identifier, error.message, resultContainer);
        throw error;
    }
}


function showEMTResults(type, identifier, result, container) {
    container?.querySelectorAll('.emt-result-display').forEach(el => el.remove());
    
    const n_eff = result.n_effective;
    const k_eff = result.k_effective;
    const wavelengths = result.wavelengths;
    
    const n_min = Math.min(...n_eff).toFixed(4);
    const n_max = Math.max(...n_eff).toFixed(4);
    const k_min = Math.min(...k_eff).toFixed(6);
    const k_max = Math.max(...k_eff).toFixed(6);
    const wl_min = Math.min(...wavelengths).toFixed(1);
    const wl_max = Math.max(...wavelengths).toFixed(1);
    
    const resultHTML = `
        <div class="emt-result-display alert alert-success mt-3">
            <h6 class="alert-heading">
                <i class="bi bi-check-circle-fill me-2"></i>
                ✅ Propiedades ópticas efectivas calculadas
            </h6>
            <hr>
            <div class="row">
                <div class="col-md-6">
                    <strong>Índice de refracción efectivo (n<sub>eff</sub>):</strong>
                    <ul class="mb-2">
                        <li>Rango: ${n_min} - ${n_max}</li>
                        <li>Puntos: ${n_eff.length}</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <strong>Coeficiente de extinción efectivo (k<sub>eff</sub>):</strong>
                    <ul class="mb-2">
                        <li>Rango: ${k_min} - ${k_max}</li>
                        <li>Puntos: ${k_eff.length}</li>
                    </ul>
                </div>
            </div>
            <div class="small text-muted">
                <strong>Rango de λ:</strong> ${wl_min} - ${wl_max} nm
            </div>
            <button class="btn btn-sm btn-outline-primary mt-2" onclick="plotEMTPreview('${type}', '${identifier}')">
                📊 Ver gráfica de n,k efectivos
            </button>
        </div>
    `;
    
    const button = container?.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn');
    if (button) {
        button.insertAdjacentHTML('beforebegin', resultHTML);
    } else {
        container?.insertAdjacentHTML('beforeend', resultHTML);
    }
}

function showEMTError(type, identifier, errorMessage, container) {
    container?.querySelectorAll('.emt-error-display').forEach(el => el.remove());
    
    const errorHTML = `
        <div class="emt-error-display alert alert-danger mt-3">
            <h6 class="alert-heading">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                ❌ Error en cálculo EMT
            </h6>
            <p class="mb-0">${errorMessage}</p>
        </div>
    `;
    
    const button = container?.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn');
    if (button) {
        button.insertAdjacentHTML('beforebegin', errorHTML);
    } else {
        container?.insertAdjacentHTML('beforeend', errorHTML);
    }
}

function plotEMTPreview(type, identifier) {
    let container;
    
    if (type === 'ambient' || type === 'substrate') {
        container = document.getElementById(`${type}-emt-config`);
    } else if (type === 'layer') {
        const layerCard = document.querySelector(`.layer-card[data-idx="${identifier}"]`);
        container = layerCard?.querySelector('.heterogeneous-config');
    }
    
    if (!container || container.dataset.emtCalculated !== 'true') {
        alert('No hay datos EMT calculados para graficar');
        return;
    }
    
    const n_eff = JSON.parse(container.dataset.nEffective);
    const k_eff = JSON.parse(container.dataset.kEffective);
    const wavelengths = JSON.parse(container.dataset.wavelengthsEffective);
    
    const modalId = `emt-plot-modal-${type}-${identifier || 'main'}`;
    document.getElementById(modalId)?.remove();
    
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            📊 Propiedades ópticas efectivas - ${type === 'layer' ? `Capa ${identifier}` : type.charAt(0).toUpperCase() + type.slice(1)}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="${modalId}-plot" style="height: 400px;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    document.getElementById(modalId).addEventListener('shown.bs.modal', () => {
        Plotly.newPlot(`${modalId}-plot`, [
            {
                x: wavelengths, y: n_eff, mode: 'lines', name: 'n efectivo',
                line: { color: '#0d6efd', width: 2 }
            },
            {
                x: wavelengths, y: k_eff, mode: 'lines', name: 'k efectivo',
                line: { color: '#dc3545', width: 2 }, yaxis: 'y2'
            }
        ], {
            title: 'Propiedades ópticas efectivas (EMT)',
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'n efectivo', titlefont: { color: '#0d6efd' }, tickfont: { color: '#0d6efd' } },
            yaxis2: {
                title: 'k efectivo', titlefont: { color: '#dc3545' }, tickfont: { color: '#dc3545' },
                overlaying: 'y', side: 'right'
            },
            height: 380, margin: { l: 60, r: 60, t: 50, b: 50 }
        }, { responsive: true });
    });
}

if (typeof getWavelengthsArray !== 'function') {
    function getWavelengthsArray() {
        const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;
        
        if (wlMode === 'file') {
            if (typeof uploadedWavelengths !== 'undefined' && uploadedWavelengths.length > 0) {
                return uploadedWavelengths;
            }
            throw new Error('No hay datos experimentales cargados');
        } else if (wlMode === 'range') {
            const wlFrom = parseFloat(document.getElementById('input-wl-from')?.value);
            const wlTo = parseFloat(document.getElementById('input-wl-to')?.value);
            const wlSteps = parseInt(document.getElementById('input-wl-steps')?.value);
            if (isNaN(wlFrom) || isNaN(wlTo) || isNaN(wlSteps)) {
                throw new Error('Define el rango de longitudes de onda');
            }
            const wavelengths = [];
            const step = (wlTo - wlFrom) / (wlSteps - 1);
            for (let i = 0; i < wlSteps; i++) {
                wavelengths.push(wlFrom + i * step);
            }
            return wavelengths;
        } else if (wlMode === 'single') {
            const wlSingle = parseFloat(document.getElementById('input-wl-single')?.value);
            if (isNaN(wlSingle) || wlSingle <= 0) {
                throw new Error('Define una longitud de onda válida');
            }
            return [wlSingle];
        }
        
        throw new Error('Selecciona un modo de longitud de onda');
    }
}

window.validateAndCalculateEMT = validateAndCalculateEMT;
window.showEMTResults = showEMTResults;
window.showEMTError = showEMTError;
window.plotEMTPreview = plotEMTPreview;

console.log('✅ Funciones EMT cargadas correctamente');

/**
 * Muestra los resultados del cálculo EMT
 */
function showEMTResults(type, identifier, result, container) {
    // Remover resultados anteriores
    container?.querySelectorAll('.emt-result-display').forEach(el => el.remove());
    
    const n_eff = result.n_effective;
    const k_eff = result.k_effective;
    const wavelengths = result.wavelengths;
    
    // Calcular estadísticas
    const n_min = Math.min(...n_eff).toFixed(4);
    const n_max = Math.max(...n_eff).toFixed(4);
    const k_min = Math.min(...k_eff).toFixed(6);
    const k_max = Math.max(...k_eff).toFixed(6);
    const wl_min = Math.min(...wavelengths).toFixed(1);
    const wl_max = Math.max(...wavelengths).toFixed(1);
    
    const resultHTML = `
        <div class="emt-result-display alert alert-success mt-3">
            <h6 class="alert-heading">
                <i class="bi bi-check-circle-fill me-2"></i>
                ✅ Propiedades ópticas efectivas calculadas
            </h6>
            <hr>
            <div class="row">
                <div class="col-md-6">
                    <strong>Índice de refracción efectivo (n<sub>eff</sub>):</strong>
                    <ul class="mb-2">
                        <li>Rango: ${n_min} - ${n_max}</li>
                        <li>Puntos: ${n_eff.length}</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <strong>Coeficiente de extinción efectivo (k<sub>eff</sub>):</strong>
                    <ul class="mb-2">
                        <li>Rango: ${k_min} - ${k_max}</li>
                        <li>Puntos: ${k_eff.length}</li>
                    </ul>
                </div>
            </div>
            <div class="small text-muted">
                <strong>Rango de λ:</strong> ${wl_min} - ${wl_max} nm
            </div>
            <button class="btn btn-sm btn-outline-primary mt-2" onclick="plotEMTPreview('${type}', '${identifier}')">
                📊 Ver gráfica de n,k efectivos
            </button>
        </div>
    `;
    
    // Insertar antes del botón de calcular
    const button = container?.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn');
    if (button) {
        button.insertAdjacentHTML('beforebegin', resultHTML);
    } else {
        container?.insertAdjacentHTML('beforeend', resultHTML);
    }
}

/**
 * Muestra error del cálculo EMT
 */
function showEMTError(type, identifier, errorMessage, container) {
    // Remover errores anteriores
    container?.querySelectorAll('.emt-error-display').forEach(el => el.remove());
    
    const errorHTML = `
        <div class="emt-error-display alert alert-danger mt-3">
            <h6 class="alert-heading">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                ❌ Error en cálculo EMT
            </h6>
            <p class="mb-0">${errorMessage}</p>
        </div>
    `;
    
    const button = container?.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn');
    if (button) {
        button.insertAdjacentHTML('beforebegin', errorHTML);
    } else {
        container?.insertAdjacentHTML('beforeend', errorHTML);
    }
}

/**
 * Grafica preview de n,k efectivos
 */
function plotEMTPreview(type, identifier) {
    let container;
    
    if (type === 'ambient' || type === 'substrate') {
        container = document.getElementById(`${type}-emt-config`);
    } else if (type === 'layer') {
        const layerCard = document.querySelector(`.layer-card[data-idx="${identifier}"]`);
        container = layerCard?.querySelector('.heterogeneous-config');
    }
    
    if (!container || container.dataset.emtCalculated !== 'true') {
        alert('No hay datos EMT calculados para graficar');
        return;
    }
    
    const n_eff = JSON.parse(container.dataset.nEffective);
    const k_eff = JSON.parse(container.dataset.kEffective);
    const wavelengths = JSON.parse(container.dataset.wavelengthsEffective);
    
    // Crear modal para la gráfica
    const modalId = `emt-plot-modal-${type}-${identifier || 'main'}`;
    
    // Remover modal anterior si existe
    document.getElementById(modalId)?.remove();
    
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            📊 Propiedades ópticas efectivas - ${type === 'layer' ? `Capa ${identifier}` : type.charAt(0).toUpperCase() + type.slice(1)}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="${modalId}-plot" style="height: 400px;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    // Esperar a que el modal se abra y luego graficar
    document.getElementById(modalId).addEventListener('shown.bs.modal', () => {
        Plotly.newPlot(`${modalId}-plot`, [
            {
                x: wavelengths,
                y: n_eff,
                mode: 'lines',
                name: 'n efectivo',
                line: { color: '#0d6efd', width: 2 }
            },
            {
                x: wavelengths,
                y: k_eff,
                mode: 'lines',
                name: 'k efectivo',
                line: { color: '#dc3545', width: 2 },
                yaxis: 'y2'
            }
        ], {
            title: 'Propiedades ópticas efectivas (EMT)',
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { 
                title: 'n efectivo',
                titlefont: { color: '#0d6efd' },
                tickfont: { color: '#0d6efd' }
            },
            yaxis2: {
                title: 'k efectivo',
                titlefont: { color: '#dc3545' },
                tickfont: { color: '#dc3545' },
                overlaying: 'y',
                side: 'right'
            },
            height: 380,
            margin: { l: 60, r: 60, t: 50, b: 50 }
        }, {
            responsive: true
        });
    });
}

/**
 * Función auxiliar para obtener wavelengths (si no existe)
 */
if (typeof getWavelengthsArray !== 'function') {
    function getWavelengthsArray() {
        const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;
        
        if (wlMode === 'file') {
            if (typeof uploadedWavelengths !== 'undefined' && uploadedWavelengths.length > 0) {
                return uploadedWavelengths;
            }
            throw new Error('No hay datos experimentales cargados');
        } else if (wlMode === 'range') {
            const wlFrom = parseFloat(document.getElementById('input-wl-from')?.value);
            const wlTo = parseFloat(document.getElementById('input-wl-to')?.value);
            const wlSteps = parseInt(document.getElementById('input-wl-steps')?.value);
            
            if (isNaN(wlFrom) || isNaN(wlTo) || isNaN(wlSteps)) {
                throw new Error('Define el rango de longitudes de onda');
            }
            
            const wavelengths = [];
            const step = (wlTo - wlFrom) / (wlSteps - 1);
            for (let i = 0; i < wlSteps; i++) {
                wavelengths.push(wlFrom + i * step);
            }
            return wavelengths;
        } else if (wlMode === 'single') {
            const wlSingle = parseFloat(document.getElementById('input-wl-single')?.value);
            if (isNaN(wlSingle) || wlSingle <= 0) {
                throw new Error('Define una longitud de onda válida');
            }
            return [wlSingle];
        }
        
        throw new Error('Selecciona un modo de longitud de onda');
    }
}

// ============================================================
// HACER FUNCIONES GLOBALES
// ============================================================
window.validateAndCalculateEMT = validateAndCalculateEMT;
window.showEMTResults = showEMTResults;
window.showEMTError = showEMTError;
window.plotEMTPreview = plotEMTPreview;

console.log('✅ Funciones EMT cargadas correctamente');