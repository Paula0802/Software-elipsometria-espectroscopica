// ============================================================================
// FIXES V2 — Agregar al final de pruebas_teoricas.js (reemplaza emt_calculate_fix.js)
// Corrige:
//   1. EMT: parseo correcto de respuesta del servidor
//   2. Todas las gráficas: modo 'markers' en vez de 'lines'
//   3. R/T/A: solo curva promedio, sin Rs/Rp separados
//   4. R/T/A: escala automática correcta (no rango fijo [0,1])
// ============================================================================


// ============================================================================
// 1. FUNCIÓN EMT CORREGIDA
// ============================================================================
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
        
        // ========================================
        // 2. VALIDAR SUMA DE FRACCIONES
        // ========================================
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
        
        // ========================================
        // 3. RECOPILAR DATOS DE COMPONENTES
        // ========================================
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
                // ⭐ FIX: nunca mandar null — usar 0 como fallback
                compData.params = {};
                const paramInputs = comp.querySelectorAll('.layer-param, .component-param, input[data-param]');
                paramInputs.forEach(inp => {
                    const paramName = inp.dataset.param;
                    if (paramName) {
                        const val = inp.value.trim();
                        const parsed = parseFloat(val);
                        compData.params[paramName] = isNaN(parsed) ? 0 : parsed;
                    }
                });

                // ⭐ FIX: validar que no haya parámetros nulos
                const nullParams = Object.entries(compData.params)
                    .filter(([k, v]) => v === null || v === undefined || isNaN(v))
                    .map(([k]) => k);
                if (nullParams.length > 0) {
                    console.warn(`⚠️ "${compData.name}": params inválidos reemplazados por 0: ${nullParams.join(', ')}`);
                }

                // ⭐ FIX: si no encontró params con los selectores, intentar con el placeholder
                if (Object.keys(compData.params).length === 0) {
                    console.warn(`⚠️ "${compData.name}": no se encontraron inputs con data-param. Buscando en placeholder...`);
                    const placeholder = comp.querySelector('.model-params-placeholder');
                    if (placeholder) {
                        placeholder.querySelectorAll('input[data-param]').forEach(inp => {
                            const paramName = inp.dataset.param;
                            if (paramName) {
                                const parsed = parseFloat(inp.value.trim());
                                compData.params[paramName] = isNaN(parsed) ? 0 : parsed;
                            }
                        });
                    }
                }

                console.log(`    Parámetros (${Object.keys(compData.params).length}):`, compData.params);
            }
            
            componentsData.push(compData);
        }
        
        // ========================================
        // 4. OBTENER LONGITUDES DE ONDA
        // ========================================
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
        
        // ========================================
        // 5. PREPARAR REQUEST
        // ========================================
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
        
        // ========================================
        // 6. LLAMAR AL BACKEND
        // ========================================
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
        
        // ========================================
        // 7. GUARDAR RESULTADOS
        // ========================================
        if (resultContainer) {
            resultContainer.dataset.emtCalculated = 'true';
            resultContainer.dataset.nEffective = JSON.stringify(result.n_effective);
            resultContainer.dataset.kEffective = JSON.stringify(result.k_effective);
            resultContainer.dataset.wavelengthsEffective = JSON.stringify(result.wavelengths || wavelengths);
        }
        
        // ========================================
        // 8. MOSTRAR RESULTADOS
        // ========================================
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

// ── Renderiza el resultado EMT inline ─────────────────────────────────────────
function renderEMTResult(wrapper, n, k, wavelengths, context, idx) {
    const fmt4 = v => Number(v).toFixed(4);
    const fmt6 = v => Number(v).toFixed(6);

    const nMean = fmt4(n.reduce((a, b) => a + b, 0) / n.length);
    const kMean = fmt6(k.reduce((a, b) => a + b, 0) / k.length);
    const nMin = fmt4(Math.min(...n)), nMax = fmt4(Math.max(...n));
    const kMin = fmt6(Math.min(...k)), kMax = fmt6(Math.max(...k));

    const plotId = `emt-plot-${context}-${idx}-${Date.now()}`;

    const div = document.createElement('div');
    div.className = 'emt-calc-result mt-3 p-3 border rounded bg-light';
    div.dataset.nData  = JSON.stringify(n);
    div.dataset.kData  = JSON.stringify(k);
    div.dataset.wlData = JSON.stringify(wavelengths);
    div.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0 text-success">✅ n, k efectivos calculados</h6>
            <button class="btn btn-sm btn-outline-secondary py-0" onclick="this.closest('.emt-calc-result').remove()">✕</button>
        </div>
        <div class="row g-2 mb-3 small">
            <div class="col-6"><strong>n efectivo</strong><br>Media: ${nMean} &nbsp;|&nbsp; Rango: [${nMin}, ${nMax}]</div>
            <div class="col-6"><strong>k efectivo</strong><br>Media: ${kMean} &nbsp;|&nbsp; Rango: [${kMin}, ${kMax}]</div>
        </div>
        <div id="${plotId}" style="height:260px; width:100%;"></div>
        <div class="mt-2 text-end">
            <button class="btn btn-sm btn-outline-primary" onclick="downloadEMTResultCSV('${plotId}')">Descargar CSV</button>
        </div>`;

    const anchor = wrapper.querySelector('button[onclick*="validateAndCalculateEMT"]') ||
                   wrapper.querySelector('.emt-components-container');
    anchor ? anchor.insertAdjacentElement('afterend', div) : wrapper.appendChild(div);

    // Gráfica de puntos (markers), doble eje Y
    setTimeout(() => {
        try {
            Plotly.newPlot(plotId, [
                { x: wavelengths, y: n, name: 'n eff', type: 'scatter', mode: 'markers',
                  marker: { color: '#2196F3', size: 5 }, yaxis: 'y' },
                { x: wavelengths, y: k, name: 'k eff', type: 'scatter', mode: 'markers',
                  marker: { color: '#FF5722', size: 5 }, yaxis: 'y2' }
            ], {
                xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
                yaxis: { title: 'n efectivo', titlefont: { color: '#2196F3' }, tickfont: { color: '#2196F3' }, gridcolor: '#e0e0e0', autorange: true },
                yaxis2: { title: 'k efectivo', titlefont: { color: '#FF5722' }, tickfont: { color: '#FF5722' }, overlaying: 'y', side: 'right', autorange: true },
                legend: { x: 0.5, y: 1.12, orientation: 'h', xanchor: 'center' },
                margin: { t: 30, b: 50, l: 65, r: 65 },
                plot_bgcolor: 'white', paper_bgcolor: 'white'
            }, { responsive: true, displayModeBar: false });
        } catch (e) { console.error('[EMT plot]', e); }
    }, 80);
}

function showEMTError(wrapper, message) {
    wrapper.querySelector('.emt-calc-result')?.remove();
    const div = document.createElement('div');
    div.className = 'emt-calc-result alert alert-danger mt-2';
    div.innerHTML = `<strong>❌ Error al calcular n,k efectivos</strong>
        <p class="mb-0 mt-1 small">${message}</p>
        <button class="btn btn-sm btn-link p-0 mt-1" onclick="this.closest('.emt-calc-result').remove()">Cerrar</button>`;
    const anchor = wrapper.querySelector('button[onclick*="validateAndCalculateEMT"]') ||
                   wrapper.querySelector('.emt-components-container');
    anchor ? anchor.insertAdjacentElement('afterend', div) : wrapper.appendChild(div);
}

function downloadEMTResultCSV(plotId) {
    const d = document.getElementById(plotId)?.closest('.emt-calc-result');
    if (!d) return;
    const n = JSON.parse(d.dataset.nData || '[]');
    const k = JSON.parse(d.dataset.kData || '[]');
    const wl = JSON.parse(d.dataset.wlData || '[]');
    if (!wl.length) { alert('Sin datos.'); return; }
    let csv = 'wavelength_nm,n_eff,k_eff\n';
    for (let i = 0; i < wl.length; i++) csv += `${wl[i].toFixed(3)},${n[i] ?? ''},${k[i] ?? ''}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `emt_nk_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}


// ============================================================================
// 2. FUNCIONES DE PLOTTING — MARKERS, ESCALA AUTO, SOLO PROMEDIO EN R/T/A
// ============================================================================

// Reemplaza plotSingleLine: usa markers y autorange
function plotSingleLine(divId, x, y, name, color, yTitle, _yRange) {
    const cfg = getPlotConfig();
    Plotly.newPlot(divId, [{
        x, y, name, type: 'scatter', mode: 'markers',
        marker: { color, size: 4 }
    }], {
        xaxis: { title: 'Longitud de onda (nm)', gridcolor: cfg.gridColor, showgrid: cfg.showGrid },
        yaxis: { title: yTitle, gridcolor: cfg.gridColor, showgrid: cfg.showGrid, autorange: true },
        margin: { t: 30, b: 60, l: 70, r: 30 },
        plot_bgcolor: cfg.bgColor, paper_bgcolor: cfg.bgColor,
        showlegend: false
    }, { responsive: true, displayModeBar: true });
}

// Reemplaza plotDualAxis: markers, autorange
function plotDualAxis(divId, x, y1, y2, name1, name2, color1, color2, yTitle1, yTitle2, _r1, _r2) {
    const cfg = getPlotConfig();
    Plotly.newPlot(divId, [
        { x, y: y1, name: name1, type: 'scatter', mode: 'markers',
          marker: { color: color1, size: 4 }, yaxis: 'y' },
        { x, y: y2, name: name2, type: 'scatter', mode: 'markers',
          marker: { color: color2, size: 4 }, yaxis: 'y2' }
    ], {
        xaxis: { title: 'Longitud de onda (nm)', gridcolor: cfg.gridColor, showgrid: cfg.showGrid },
        yaxis: { title: yTitle1, titlefont: { color: color1 }, tickfont: { color: color1 },
                 gridcolor: cfg.gridColor, showgrid: cfg.showGrid, autorange: true },
        yaxis2: { title: yTitle2, titlefont: { color: color2 }, tickfont: { color: color2 },
                  overlaying: 'y', side: 'right', autorange: true },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 60, l: 70, r: 70 },
        plot_bgcolor: cfg.bgColor, paper_bgcolor: cfg.bgColor
    }, { responsive: true, displayModeBar: true });
}

// Reemplaza plotTripleLine (ya no se usa en RTA, pero la dejamos corregida)
function plotTripleLine(divId, x, y1, y2, y3, name1, name2, name3, color1, color2, color3, yTitle) {
    const cfg = getPlotConfig();
    Plotly.newPlot(divId, [
        { x, y: y1, name: name1, type: 'scatter', mode: 'markers', marker: { color: color1, size: 4 } },
        { x, y: y2, name: name2, type: 'scatter', mode: 'markers', marker: { color: color2, size: 4 } },
        { x, y: y3, name: name3, type: 'scatter', mode: 'markers', marker: { color: color3, size: 5, symbol: 'diamond' } }
    ], {
        xaxis: { title: 'Longitud de onda (nm)', gridcolor: cfg.gridColor, showgrid: cfg.showGrid },
        yaxis: { title: yTitle, gridcolor: cfg.gridColor, showgrid: cfg.showGrid, autorange: true },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 60, l: 70, r: 30 },
        plot_bgcolor: cfg.bgColor, paper_bgcolor: cfg.bgColor
    }, { responsive: true, displayModeBar: true });
}

// n,k graphs también con markers
function plotNKCombined(divId, wavelengths, n, k, title) {
    Plotly.newPlot(divId, [
        { x: wavelengths, y: n, name: 'n', type: 'scatter', mode: 'markers',
          marker: { color: '#2196F3', size: 4 }, yaxis: 'y' },
        { x: wavelengths, y: k, name: 'k', type: 'scatter', mode: 'markers',
          marker: { color: '#FF5722', size: 4 }, yaxis: 'y2' }
    ], {
        title: { text: `${title}: n, k vs λ`, font: { size: 14 } },
        xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'n', titlefont: { color: '#2196F3' }, tickfont: { color: '#2196F3' }, gridcolor: '#e0e0e0', autorange: true },
        yaxis2: { title: 'k', titlefont: { color: '#FF5722' }, tickfont: { color: '#FF5722' }, overlaying: 'y', side: 'right', autorange: true },
        legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
        margin: { t: 50, b: 50, l: 60, r: 60 },
        plot_bgcolor: 'white', paper_bgcolor: 'white'
    }, { responsive: true, displayModeBar: false });
}

function plotNSingle(divId, wavelengths, n, title) {
    Plotly.newPlot(divId, [{
        x: wavelengths, y: n, name: 'n', type: 'scatter', mode: 'markers',
        marker: { color: '#2196F3', size: 4 }
    }], {
        title: { text: `${title}: n vs λ`, font: { size: 14 } },
        xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'n', gridcolor: '#e0e0e0', autorange: true },
        margin: { t: 50, b: 50, l: 60, r: 30 },
        plot_bgcolor: 'white', paper_bgcolor: 'white'
    }, { responsive: true, displayModeBar: false });
}

function plotKSingle(divId, wavelengths, k, title) {
    Plotly.newPlot(divId, [{
        x: wavelengths, y: k, name: 'k', type: 'scatter', mode: 'markers',
        marker: { color: '#FF5722', size: 4 }
    }], {
        title: { text: `${title}: k vs λ`, font: { size: 14 } },
        xaxis: { title: 'λ (nm)', gridcolor: '#e0e0e0' },
        yaxis: { title: 'k', gridcolor: '#e0e0e0', autorange: true },
        margin: { t: 50, b: 50, l: 60, r: 30 },
        plot_bgcolor: 'white', paper_bgcolor: 'white'
    }, { responsive: true, displayModeBar: false });
}


// ============================================================================
// 3. renderRTAGraphs — SOLO CURVA PROMEDIO (Rs+Rp)/2
// ============================================================================

function renderRTAGraphs(container, prefix, label, wavelengths, dataS, dataP) {
    // Calcular promedio
    const dataAvg = (dataS?.length && dataP?.length)
        ? dataS.map((s, i) => (s + dataP[i]) / 2)
        : (dataS || dataP || []);

    if (!dataAvg.length) {
        container.innerHTML += `<div class="alert alert-warning">No hay datos de ${label} disponibles.</div>`;
        return;
    }

    const colors = { R: '#e74c3c', T: '#2ecc71', A: '#9b59b6' };
    const color  = colors[prefix] || '#3498db';
    const graphId = `graph-${prefix}-avg`;

    // Botón de descarga
    const downloadDiv = document.createElement('div');
    downloadDiv.className = 'download-buttons';
    downloadDiv.innerHTML = `
        <button class="btn btn-outline-primary" onclick="downloadGraphPNG('${graphId}')">
            Descargar ${label} promedio (PNG)
        </button>
        <button class="btn btn-outline-secondary" onclick="downloadAllGraphsPDF()">
            Descargar todas (PDF)
        </button>`;
    container.appendChild(downloadDiv);

    // Gráfica única: promedio
    container.appendChild(createGraphCard(graphId, `${label} promedio [(${prefix}s + ${prefix}p) / 2] vs Longitud de Onda`, (divId) => {
        const cfg = getPlotConfig();
        Plotly.newPlot(divId, [{
            x: wavelengths, y: dataAvg, name: `${prefix} promedio`,
            type: 'scatter', mode: 'markers',
            marker: { color, size: 4 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)', gridcolor: cfg.gridColor, showgrid: cfg.showGrid },
            yaxis: {
                title: label,
                gridcolor: cfg.gridColor, showgrid: cfg.showGrid,
                autorange: true          // ← escala automática real
            },
            margin: { t: 30, b: 60, l: 70, r: 30 },
            plot_bgcolor: cfg.bgColor, paper_bgcolor: cfg.bgColor,
            showlegend: false
        }, { responsive: true, displayModeBar: true });
    }));
}


// ============================================================================
// EXPORTAR TODO GLOBALMENTE
// ============================================================================
window.validateAndCalculateEMT = validateAndCalculateEMT;
window.downloadEMTResultCSV    = downloadEMTResultCSV;
window.plotSingleLine          = plotSingleLine;
window.plotDualAxis            = plotDualAxis;
window.plotTripleLine          = plotTripleLine;
window.plotNKCombined          = plotNKCombined;
window.plotNSingle             = plotNSingle;
window.plotKSingle             = plotKSingle;
window.renderRTAGraphs         = renderRTAGraphs;

console.log('[fixes_v2] Todas las correcciones cargadas correctamente.');