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

async function validateAndCalculateEMT(context, idx) {
    console.log(`[EMT] Calculando n,k efectivos — context=${context} idx=${idx}`);

    // ── Localizar wrapper ─────────────────────────────────────────────────────
    let layerWrapper = null;
    if (context === 'layer') {
        layerWrapper = document.querySelector(`.layer-card[data-idx="${idx}"]`);
    } else {
        layerWrapper = document.getElementById(`${context}-emt-config`) ||
                       document.getElementById(`${context}-config`);
    }
    if (!layerWrapper) {
        alert('No se encontró la capa. Intente de nuevo.');
        return;
    }

    // ── Longitudes de onda ────────────────────────────────────────────────────
    let wavelengths = [];
    try {
        wavelengths = getTheoreticalWavelengths();
    } catch (e) {
        alert('Configure las longitudes de onda primero.\n' + e.message);
        return;
    }
    if (!wavelengths.length) { alert('No hay longitudes de onda configuradas.'); return; }

    // ── Recolectar datos EMT ──────────────────────────────────────────────────
    let components = [], emtModel = 'bruggeman', hostIndex = null;
    if (context === 'layer') {
        const d = collectLayerEMTData(layerWrapper);
        components = d.components || []; emtModel = d.emt_model || 'bruggeman'; hostIndex = d.host_index ?? null;
    } else {
        const d = collectMediumEMTData(context);
        components = d.components || []; emtModel = d.emt_model || 'bruggeman'; hostIndex = d.host_index ?? null;
    }

    // ── Validaciones ──────────────────────────────────────────────────────────
    if (components.length < 2) { alert('Se necesitan al menos 2 componentes.'); return; }
    const sumF = components.reduce((s, c) => s + (c.fraction || 0), 0);
    if (Math.abs(sumF - 1.0) > 0.01) { alert(`Σf = ${sumF.toFixed(3)} ≠ 1.0`); return; }
    if (emtModel === 'maxwell-garnett' && hostIndex === null) { alert('Seleccione el host para Maxwell-Garnett.'); return; }

    // ── Spinner en botón ──────────────────────────────────────────────────────
    const btn = layerWrapper.querySelector('button[onclick*="validateAndCalculateEMT"]') ||
                layerWrapper.querySelector('.btn-calc-emt');
    const origHTML = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Calculando...'; }

    layerWrapper.querySelector('.emt-calc-result')?.remove();

    // ── Petición al backend ───────────────────────────────────────────────────
    try {
        const payload = { emt_model: emtModel, components, wavelengths, host_index: hostIndex };
        console.log('[EMT] payload →', JSON.stringify(payload).slice(0, 400));

        const response = await fetch('/api/calculate-emt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // ── Leer respuesta cruda para diagnóstico ─────────────────────────────
        const rawText = await response.text();
        console.log('[EMT] respuesta cruda →', rawText.slice(0, 600));

        let result;
        try { result = JSON.parse(rawText); }
        catch (parseErr) { throw new Error('Respuesta no es JSON: ' + rawText.slice(0, 200)); }

        console.log('[EMT] resultado parseado →', result);

        if (!response.ok || result.success === false) {
            throw new Error(result.error || result.detail || `HTTP ${response.status}`);
        }

        // ── Extraer n/k con todas las variantes posibles ──────────────────────
        const n = result.n_eff ?? result.n ?? result.data?.n_eff ?? result.data?.n ?? null;
        const k = result.k_eff ?? result.k ?? result.data?.k_eff ?? result.data?.k ?? null;

        console.log('[EMT] n extraído →', Array.isArray(n) ? `array[${n.length}] ${n[0]}…${n[n.length-1]}` : n);
        console.log('[EMT] k extraído →', Array.isArray(k) ? `array[${k.length}] ${k[0]}…${k[k.length-1]}` : k);

        if (!n || !Array.isArray(n) || n.length === 0) {
            throw new Error(`El servidor respondió OK pero no hay datos de n. Claves disponibles: ${Object.keys(result).join(', ')}`);
        }

        renderEMTResult(layerWrapper, n, k || new Array(n.length).fill(0), wavelengths, context, idx);

    } catch (err) {
        console.error('[EMT] error →', err);
        showEMTError(layerWrapper, err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
}

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