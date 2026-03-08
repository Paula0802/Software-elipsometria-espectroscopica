// ============================================================
// FUNCIONES DE CÁLCULO EMT (Effective Medium Theory)
// Versión corregida — sin duplicados
// FIX: los checkboxes de "Optimizar" también tienen data-param
//      y causaban que todos los valores llegaran como 0.
//      Ahora se filtran explícitamente por inp.type !== 'checkbox'
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
            container       = document.getElementById(`${type}-emt-components`);
            emtModel        = document.getElementById(`${type}-emt-model`)?.value || 'bruggeman';
            resultContainer = document.getElementById(`${type}-emt-config`);
            button          = resultContainer?.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn');
            components      = container?.querySelectorAll('.medium-emt-component');

        } else if (type === 'layer') {
            const layerCard = document.querySelector(`.layer-card[data-idx="${identifier}"]`);
            if (!layerCard) throw new Error(`No se encontró la capa con índice ${identifier}`);

            container       = layerCard.querySelector('.emt-components-container');
            emtModel        = layerCard.querySelector('.emt-model-select')?.value || 'bruggeman';
            resultContainer = layerCard.querySelector('.heterogeneous-config');
            button          = resultContainer?.querySelector('.calculate-layer-emt-btn');
            components      = container?.querySelectorAll('.emt-component');

        } else {
            throw new Error(`Tipo no reconocido: ${type}`);
        }

        if (!container || !components || components.length === 0) {
            throw new Error('No se encontraron componentes EMT');
        }

        console.log(`  Modelo EMT: ${emtModel}`);
        console.log(`  Componentes encontrados: ${components.length}`);

        // ── Validar suma de fracciones ────────────────────────────────────────
        let totalFraction = 0;
        components.forEach(comp => {
            const fractionInput = comp.querySelector('.medium-component-fraction, .component-fraction');
            totalFraction += parseFloat(fractionInput?.value) || 0;
        });
        totalFraction = Math.round(totalFraction * 1000) / 1000;

        if (Math.abs(totalFraction - 1.0) > 0.01) {
            throw new Error(`La suma de fracciones debe ser 1.0 (actual: ${totalFraction.toFixed(3)})`);
        }
        console.log(`  ✅ Suma de fracciones válida: ${totalFraction}`);

        // ── Recopilar datos de cada componente ────────────────────────────────
        const componentsData = [];

        for (const comp of components) {
            const compData = {};

            compData.name = comp.querySelector(
                '.medium-component-name, .component-name'
            )?.value || 'Componente';

            compData.fraction = parseFloat(
                comp.querySelector('.medium-component-fraction, .component-fraction')?.value
            ) || 0;

            compData.model = comp.querySelector(
                '.medium-component-model, .component-model'
            )?.value || 'constant';

            console.log(`  Componente: ${compData.name} | f=${compData.fraction} | modelo=${compData.model}`);

            // ── CASO: constante ───────────────────────────────────────────────
            if (compData.model === 'constant') {
                compData.n = parseFloat(comp.querySelector('.medium-comp-n, .component-n')?.value) || 1.5;
                compData.k = parseFloat(comp.querySelector('.medium-comp-k, .component-k')?.value) || 0;
                console.log(`    n=${compData.n}, k=${compData.k}`);

            // ── CASO: archivo ─────────────────────────────────────────────────
            } else if (compData.model === 'file_nk' || compData.model === 'file_epsilon') {
                const opticalDataStr = comp.dataset.opticalData;
                if (!opticalDataStr) {
                    throw new Error(`El componente "${compData.name}" requiere un archivo de datos ópticos`);
                }
                compData.optical_data = JSON.parse(opticalDataStr);
                console.log(`    Archivo: ${compData.optical_data.wavelength?.length} puntos`);

            // ── CASO: modelo de dispersión ────────────────────────────────────
            } else if (['cauchy', 'sellmeier', 'drude', 'lorentz', 'drude_lorentz'].includes(compData.model)) {
                compData.params = {};

                // ════════════════════════════════════════════════════════════════
                // FIX PRINCIPAL:
                // createParamFieldWithOptimize genera DOS tipos de input
                // con el atributo data-param:
                //
                //   1. <input type="number" class="form-control layer-param"
                //             data-param="eps_inf" ...>   ← queremos este
                //
                //   2. <input type="checkbox" class="form-check-input optimize-param"
                //             data-param="eps_inf" ...>   ← este causaba NaN → 0
                //
                // La versión anterior NO filtraba checkboxes, por eso todos
                // los parámetros llegaban como 0 al backend.
                // ════════════════════════════════════════════════════════════════
                const allParamInputs = comp.querySelectorAll('input[data-param]');
                console.log(`    input[data-param] encontrados: ${allParamInputs.length}`);

                allParamInputs.forEach(inp => {
                    // ⭐ LÍNEA CLAVE DEL FIX: ignorar checkboxes
                    if (inp.type === 'checkbox') return;

                    const paramName = inp.dataset.param;
                    if (!paramName) return;

                    const raw    = inp.value.trim();
                    const parsed = parseFloat(raw);
                    compData.params[paramName] = isNaN(parsed) ? 0 : parsed;
                    console.log(`      ${paramName} = "${raw}" → ${compData.params[paramName]}`);
                });

                // Fallback: si no encontró nada con data-param, buscar por clase
                if (Object.keys(compData.params).length === 0) {
                    console.warn(`    ⚠️ No se encontraron inputs con data-param. Buscando por .layer-param...`);
                    comp.querySelectorAll('input.layer-param').forEach(inp => {
                        if (inp.type === 'checkbox') return;
                        const paramName = inp.dataset.param || inp.name || inp.id;
                        if (!paramName) return;
                        const parsed = parseFloat(inp.value.trim());
                        compData.params[paramName] = isNaN(parsed) ? 0 : parsed;
                        console.log(`      [fallback] ${paramName} = ${compData.params[paramName]}`);
                    });
                }

                const paramCount = Object.keys(compData.params).length;
                if (paramCount === 0) {
                    throw new Error(
                        `El componente "${compData.name}" (modelo: ${compData.model}) no tiene parámetros. ` +
                        `¿Seleccionaste el modelo correcto y llenaste los campos?`
                    );
                }

                const allZero = Object.values(compData.params).every(v => v === 0);
                if (allZero) {
                    console.warn(
                        `    ⚠️ Todos los parámetros de "${compData.name}" son 0. ` +
                        `Verifica que hayas ingresado valores en los campos del modelo.`
                    );
                }

                console.log(`    Parámetros finales (${paramCount}):`, compData.params);
            }

            componentsData.push(compData);
        }

        // ── Obtener longitudes de onda ────────────────────────────────────────
        let wavelengths;
        try {
            wavelengths = getWavelengthsArray();
        } catch (e) {
            console.warn('No hay wavelengths definidos, usando rango por defecto 300-800 nm');
            wavelengths = [];
            for (let i = 300; i <= 800; i += 10) wavelengths.push(i);
        }
        console.log(`  Longitudes de onda: ${wavelengths.length} puntos`);

        // ── Preparar y enviar request ─────────────────────────────────────────
        const requestData = {
            emt_model:   emtModel,
            components:  componentsData,
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
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(requestData)
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || `Error del servidor: ${response.status}`);
        }

        console.log('✅ Cálculo EMT completado');

        if (resultContainer) {
            resultContainer.dataset.emtCalculated        = 'true';
            resultContainer.dataset.nEffective           = JSON.stringify(result.n_effective);
            resultContainer.dataset.kEffective           = JSON.stringify(result.k_effective);
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

// ─────────────────────────────────────────────────────────────────────────────
// showEMTResults
// ─────────────────────────────────────────────────────────────────────────────
function showEMTResults(type, identifier, result, container) {
    container?.querySelectorAll('.emt-result-display').forEach(el => el.remove());

    const n_eff       = result.n_effective;
    const k_eff       = result.k_effective;
    const wavelengths = result.wavelengths;

    const n_min  = Math.min(...n_eff).toFixed(4);
    const n_max  = Math.max(...n_eff).toFixed(4);
    const k_min  = Math.min(...k_eff).toFixed(6);
    const k_max  = Math.max(...k_eff).toFixed(6);
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
            <button class="btn btn-sm btn-outline-primary mt-2"
                    onclick="plotEMTPreview('${type}', '${identifier}')">
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

// ─────────────────────────────────────────────────────────────────────────────
// showEMTError
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// plotEMTPreview
// ─────────────────────────────────────────────────────────────────────────────
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

    const n_eff       = JSON.parse(container.dataset.nEffective);
    const k_eff       = JSON.parse(container.dataset.kEffective);
    const wavelengths = JSON.parse(container.dataset.wavelengthsEffective);

    const modalId = `emt-plot-modal-${type}-${identifier || 'main'}`;
    document.getElementById(modalId)?.remove();

    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            📊 Propiedades ópticas efectivas —
                            ${type === 'layer' ? `Capa ${identifier}` : type.charAt(0).toUpperCase() + type.slice(1)}
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
            xaxis:  { title: 'Longitud de onda (nm)' },
            yaxis:  { title: 'n efectivo', titlefont: { color: '#0d6efd' }, tickfont: { color: '#0d6efd' } },
            yaxis2: {
                title: 'k efectivo', titlefont: { color: '#dc3545' }, tickfont: { color: '#dc3545' },
                overlaying: 'y', side: 'right'
            },
            height: 380, margin: { l: 60, r: 60, t: 50, b: 50 }
        }, { responsive: true });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// getWavelengthsArray (solo se define si no existe ya en el scope global)
// ─────────────────────────────────────────────────────────────────────────────
if (typeof getWavelengthsArray !== 'function') {
    function getWavelengthsArray() {
        const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;

        if (wlMode === 'file') {
            if (typeof uploadedWavelengths !== 'undefined' && uploadedWavelengths.length > 0) {
                return uploadedWavelengths;
            }
            throw new Error('No hay datos experimentales cargados');

        } else if (wlMode === 'range') {
            const wlFrom  = parseFloat(document.getElementById('input-wl-from')?.value);
            const wlTo    = parseFloat(document.getElementById('input-wl-to')?.value);
            const wlSteps = parseInt(document.getElementById('input-wl-steps')?.value);

            if (isNaN(wlFrom) || isNaN(wlTo) || isNaN(wlSteps)) {
                throw new Error('Define el rango de longitudes de onda');
            }

            const wavelengths = [];
            const step = (wlTo - wlFrom) / (wlSteps - 1);
            for (let i = 0; i < wlSteps; i++) wavelengths.push(wlFrom + i * step);
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

// ─────────────────────────────────────────────────────────────────────────────
// Registrar funciones globalmente
// ─────────────────────────────────────────────────────────────────────────────
window.validateAndCalculateEMT = validateAndCalculateEMT;
window.showEMTResults          = showEMTResults;
window.showEMTError            = showEMTError;
window.plotEMTPreview          = plotEMTPreview;

console.log('✅ emt_functions.js (versión corregida) cargado correctamente');