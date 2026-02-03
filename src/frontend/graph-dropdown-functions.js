// ==========================================
// SISTEMA DE DROPDOWN DE GRÁFICAS - VERSIÓN CORREGIDA
// Para upload.html con estructura de dropdown
// ==========================================

// ⭐ CORRECCIÓN: NO redeclarar variables si ya existen
// Esto evita el error "Identifier has already been declared"
if (typeof uploadedWavelengths === 'undefined') {
    window.uploadedWavelengths = [];
}
if (typeof uploadedPsi === 'undefined') {
    window.uploadedPsi = [];
}
if (typeof uploadedDelta === 'undefined') {
    window.uploadedDelta = [];
}
if (typeof optimizationResults === 'undefined') {
    window.optimizationResults = null;
}

// Variable global para tipo de gráfica actual
let currentGraphType = 'psi-delta';

/**
 * Toggle del menú dropdown de gráficas
 */
function toggleGraphDropdown() {
    const menu = document.getElementById('graphDropdownMenu');
    const button = document.getElementById('graphTypeButton');
    
    if (!menu || !button) return;
    
    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
        button.classList.remove('active');
    } else {
        menu.classList.add('show');
        button.classList.add('active');
    }
}

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.graph-type-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        const menu = document.getElementById('graphDropdownMenu');
        const button = document.getElementById('graphTypeButton');
        if (menu) menu.classList.remove('show');
        if (button) button.classList.remove('active');
    }
});

/**
 * Selecciona el tipo de gráfica desde el dropdown
 */
function selectGraphType(type) {
    console.log(`📊 Cambiando a gráfica: ${type}`);
    
    currentGraphType = type;
    
    // Cerrar dropdown
    const menu = document.getElementById('graphDropdownMenu');
    const button = document.getElementById('graphTypeButton');
    if (menu) menu.classList.remove('show');
    if (button) button.classList.remove('active');
    
    // Actualizar texto del botón
    const labels = {
        'psi-delta': '📊 Ψ y Δ (Psi y Delta)',
        'nk': '📊 n y k por capas',
        'rta': '📊 R, T y A',
        'layer-absorption': '📊 Absorción por capa'
    };
    
    if (button) {
        const buttonText = button.querySelector('.selected-graph-text');
        if (buttonText) {
            buttonText.textContent = labels[type] || type;
        }
    }
    
    // Actualizar selección visual en el menú
    document.querySelectorAll('.graph-dropdown-item').forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.type === type) {
            item.classList.add('selected');
        }
    });
    
    // Ocultar todos los contenedores de gráficas
    document.querySelectorAll('.graphs-psi-delta, .graphs-nk, .graphs-rta, .graphs-layer-absorption').forEach(container => {
        container.classList.remove('active');
        container.style.display = 'none';
    });
    
    // Ocultar sección extendida de RTA (legacy)
    const rtaExtended = document.getElementById('graphsRTAExtended');
    if (rtaExtended) {
        rtaExtended.style.display = 'none';
    }
    
    // Mostrar contenedor correspondiente
    const containerMap = {
        'psi-delta': 'graphsPsiDelta',
        'nk': 'graphsNK',
        'rta': 'graphsRTA',
        'layer-absorption': 'graphsLayerAbsorption'
    };
    
    const containerId = containerMap[type];
    if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.classList.add('active');
            container.style.display = 'block';
        }
    }
    
    // Mostrar/ocultar selector de capas (solo para n,k)
    const layerSelector = document.getElementById('layerSelectorInline');
    if (layerSelector) {
        layerSelector.classList.toggle('show', type === 'nk');
    }
    
    // Actualizar botones de descarga
    updateDownloadButtons(type);
    
    // Renderizar gráficas si hay datos
    renderGraphsForType(type);
}

/**
 * Actualiza los botones de descarga según el tipo de gráfica
 */
function updateDownloadButtons(type) {
    document.querySelectorAll('.download-buttons-psi-delta, .download-buttons-nk, .download-buttons-rta, .download-buttons-layer-absorption').forEach(group => {
        group.style.display = 'none';
    });
    
    const buttonClassMap = {
        'psi-delta': '.download-buttons-psi-delta',
        'nk': '.download-buttons-nk',
        'rta': '.download-buttons-rta',
        'layer-absorption': '.download-buttons-layer-absorption'
    };
    
    const groupClass = buttonClassMap[type];
    if (groupClass) {
        const activeGroup = document.querySelector(groupClass);
        if (activeGroup) {
            activeGroup.style.display = 'flex';
        }
    }
}

/**
 * Renderiza las gráficas según el tipo seleccionado
 */
function renderGraphsForType(type) {
    // Usar window para acceder a las variables globales
    const wavelengths = window.uploadedWavelengths || [];
    
    if (type === 'psi-delta') {
        if (wavelengths.length > 0) {
            updateAllPsiDeltaPlots();
        }
    } else if (type === 'nk') {
        renderNKGraphs();
    } else if (type === 'rta') {
        renderRTAGraphs();
    } else if (type === 'layer-absorption') {
        renderLayerAbsorptionGraphs();
    }
}

/**
 * Actualiza las gráficas Psi y Delta
 */
function updateAllPsiDeltaPlots() {
    const wavelengths = window.uploadedWavelengths || [];
    
    if (wavelengths.length === 0) {
        console.warn('No hay datos para actualizar gráficas Psi/Delta');
        return;
    }
    
    if (typeof plotPsi === 'function') plotPsi();
    if (typeof plotDelta === 'function') plotDelta();
    if (typeof plotCombined === 'function') plotCombined();
}

/**
 * Renderiza las gráficas de n y k
 */
function renderNKGraphs() {
    console.log('📈 Renderizando gráficas n y k...');
    
    const optResults = window.optimizationResults || null;
    
    let opticalConstants = null;
    
    if (optResults?.optical_constants) {
        opticalConstants = optResults.optical_constants;
    } else if (window.theoreticalOpticalConstants) {
        opticalConstants = window.theoreticalOpticalConstants;
    }
    
    if (!opticalConstants || !opticalConstants.layers || opticalConstants.layers.length === 0) {
        showNoDataMessage('nPlot', 'Calcule los valores teóricos para visualizar n vs λ');
        showNoDataMessage('kPlot', 'Calcule los valores teóricos para visualizar k vs λ');
        showNoDataMessage('nkCombinedPlot', 'Calcule los valores teóricos para visualizar n y k juntos');
        return;
    }
    
    populateNKLayerSelector(opticalConstants.layers);
    
    const selector = document.getElementById('nkLayerSelect');
    const selectedValue = selector?.value || 'all';
    
    plotNKForLayer(selectedValue, opticalConstants);
}

/**
 * Puebla el selector de capas para n,k
 */
function populateNKLayerSelector(layers) {
    const selector = document.getElementById('nkLayerSelect');
    if (!selector) return;
    
    if (selector.options.length > 1) return;
    
    selector.innerHTML = '<option value="all">Todas las capas</option>';
    
    layers.forEach((layer, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = layer.name || `Capa ${index + 1}`;
        selector.appendChild(option);
    });
}

/**
 * Actualiza gráficas n,k cuando cambia el selector de capa
 */
function updateNKGraphsForLayer() {
    const selector = document.getElementById('nkLayerSelect');
    if (!selector) return;
    
    const optResults = window.optimizationResults || null;
    let opticalConstants = optResults?.optical_constants || window.theoreticalOpticalConstants;
    
    if (opticalConstants) {
        plotNKForLayer(selector.value, opticalConstants);
    }
}

/**
 * Plotea n y k para la capa seleccionada
 */
function plotNKForLayer(selectedValue, opticalConstants) {
    const wavelengths = opticalConstants.wavelengths || window.uploadedWavelengths || [];
    const layers = opticalConstants.layers;
    
    if (!wavelengths || wavelengths.length === 0) {
        console.warn('No hay wavelengths disponibles para plotear n,k');
        return;
    }
    
    let layersToPlot;
    if (selectedValue === 'all') {
        layersToPlot = layers.map((layer, idx) => ({ ...layer, index: idx }));
    } else {
        const idx = parseInt(selectedValue);
        if (layers[idx]) {
            layersToPlot = [{ ...layers[idx], index: idx }];
        } else {
            layersToPlot = [];
        }
    }
    
    const colors = ['#2E86C1', '#E74C3C', '#28a745', '#9C27B0', '#FF5722', '#00BCD4'];
    
    const showGrid = document.getElementById('showGridAdvanced')?.checked ?? 
                     document.getElementById('showGrid')?.checked ?? true;
    const whiteBackground = document.getElementById('whiteBackgroundAdvanced')?.checked ?? 
                            document.getElementById('whiteBackground')?.checked ?? true;
    const bgColor = whiteBackground ? 'white' : '#f5f5f5';
    const gridColor = showGrid ? '#ddd' : 'rgba(0,0,0,0)';
    
    if (typeof Plotly === 'undefined') {
        console.error('Plotly no está cargado');
        return;
    }
    
    // GRÁFICA DE n
    const tracesN = [];
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        tracesN.push({
            x: wavelengths,
            y: layer.n,
            mode: 'lines',
            name: layer.name || `Capa ${layer.index + 1}`,
            line: { width: 2, color: color }
        });
    });
    
    const layoutN = {
        title: { text: 'Índice de Refracción (n)', font: { size: 14 } },
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: { 
            title: 'n',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        legend: { x: 1.02, y: 1, xanchor: 'left' },
        margin: { l: 60, r: 120, t: 50, b: 50 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    Plotly.newPlot('nPlot', tracesN, layoutN, { displayModeBar: true, responsive: true });
    
    // GRÁFICA DE k
    const tracesK = [];
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        tracesK.push({
            x: wavelengths,
            y: layer.k,
            mode: 'lines',
            name: layer.name || `Capa ${layer.index + 1}`,
            line: { width: 2, color: color }
        });
    });
    
    const layoutK = {
        title: { text: 'Coeficiente de Extinción (k)', font: { size: 14 } },
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: { 
            title: 'k',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        legend: { x: 1.02, y: 1, xanchor: 'left' },
        margin: { l: 60, r: 120, t: 50, b: 50 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    Plotly.newPlot('kPlot', tracesK, layoutK, { displayModeBar: true, responsive: true });
    
    // GRÁFICA COMBINADA n y k
    const tracesCombined = [];
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        
        tracesCombined.push({
            x: wavelengths,
            y: layer.n,
            mode: 'lines',
            name: `n - ${layer.name || `Capa ${layer.index + 1}`}`,
            line: { width: 2, color: color },
            yaxis: 'y1'
        });
        
        tracesCombined.push({
            x: wavelengths,
            y: layer.k,
            mode: 'lines',
            name: `k - ${layer.name || `Capa ${layer.index + 1}`}`,
            line: { width: 2, color: color, dash: 'dash' },
            yaxis: 'y2'
        });
    });
    
    const layoutCombined = {
        title: { text: 'Constantes Ópticas n y k', font: { size: 14 } },
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: {
            title: 'n (índice de refracción)',
            titlefont: { color: '#2E86C1' },
            tickfont: { color: '#2E86C1' },
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true,
            side: 'left'
        },
        yaxis2: {
            title: 'k (coeficiente de extinción)',
            titlefont: { color: '#E74C3C' },
            tickfont: { color: '#E74C3C' },
            overlaying: 'y',
            side: 'right',
            showgrid: false,
            showline: true, linewidth: 1, linecolor: 'black'
        },
        legend: { x: 0.5, y: -0.15, xanchor: 'center', orientation: 'h' },
        margin: { l: 60, r: 60, t: 50, b: 80 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    Plotly.newPlot('nkCombinedPlot', tracesCombined, layoutCombined, { displayModeBar: true, responsive: true });
    
    console.log(`✅ Gráficas n,k renderizadas (${layersToPlot.length} capas)`);
}

/**
 * Renderiza las gráficas R, T, A
 */
function renderRTAGraphs() {
    console.log('📈 Renderizando gráficas R, T, A...');
    
    const optResults = window.optimizationResults || null;
    
    let traData = null;
    
    if (optResults?.tra_spectra) {
        traData = optResults.tra_spectra;
    } else if (window.theoreticalTRASpectra) {
        traData = window.theoreticalTRASpectra;
    }
    
    if (!traData || !traData.R) {
        showNoDataMessage('rPlot', 'Calcule los valores teóricos para visualizar R vs λ');
        showNoDataMessage('tPlot', 'Calcule los valores teóricos para visualizar T vs λ');
        showNoDataMessage('aPlot', 'Calcule los valores teóricos para visualizar A vs λ');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    const polarization = traData.polarization || 'both';
    
    if (typeof Plotly === 'undefined') {
        console.error('Plotly no está cargado');
        return;
    }
    
    const showGrid = document.getElementById('showGridAdvanced')?.checked ?? 
                     document.getElementById('showGrid')?.checked ?? true;
    const whiteBackground = document.getElementById('whiteBackgroundAdvanced')?.checked ?? 
                            document.getElementById('whiteBackground')?.checked ?? true;
    const bgColor = whiteBackground ? 'white' : '#f5f5f5';
    const gridColor = showGrid ? '#ddd' : 'rgba(0,0,0,0)';
    
    const polLabel = polarization === 's' ? '(pol. S)' : 
                     polarization === 'p' ? '(pol. P)' : '(promedio S+P)';
    
    const baseLayout = {
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: { 
            title: '',
            range: [0, 1.05],
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        margin: { l: 60, r: 30, t: 50, b: 50 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    // GRÁFICA DE R
    if (traData.R) {
        const traces = [{
            x: wavelengths,
            y: traData.R,
            mode: 'lines',
            name: `R ${polLabel}`,
            line: { width: 2, color: '#dc3545' }
        }];
        
        if (polarization === 'both' && traData.Rs && traData.Rp) {
            traces.push({
                x: wavelengths, y: traData.Rs, mode: 'lines',
                name: 'Rs (pol. S)', line: { width: 1, color: '#dc3545', dash: 'dot' },
                visible: 'legendonly'
            });
            traces.push({
                x: wavelengths, y: traData.Rp, mode: 'lines',
                name: 'Rp (pol. P)', line: { width: 1, color: '#dc3545', dash: 'dash' },
                visible: 'legendonly'
            });
        }
        
        Plotly.newPlot('rPlot', traces, { 
            ...baseLayout, 
            title: { text: `Reflectancia (R) ${polLabel}`, font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'R' },
            showlegend: polarization === 'both'
        }, { displayModeBar: true, responsive: true });
    }
    
    // GRÁFICA DE T
    if (traData.T) {
        const traces = [{
            x: wavelengths,
            y: traData.T,
            mode: 'lines',
            name: `T ${polLabel}`,
            line: { width: 2, color: '#28a745' }
        }];
        
        if (polarization === 'both' && traData.Ts && traData.Tp) {
            traces.push({
                x: wavelengths, y: traData.Ts, mode: 'lines',
                name: 'Ts (pol. S)', line: { width: 1, color: '#28a745', dash: 'dot' },
                visible: 'legendonly'
            });
            traces.push({
                x: wavelengths, y: traData.Tp, mode: 'lines',
                name: 'Tp (pol. P)', line: { width: 1, color: '#28a745', dash: 'dash' },
                visible: 'legendonly'
            });
        }
        
        Plotly.newPlot('tPlot', traces, { 
            ...baseLayout, 
            title: { text: `Transmitancia (T) ${polLabel}`, font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'T' },
            showlegend: polarization === 'both'
        }, { displayModeBar: true, responsive: true });
    }
    
    // GRÁFICA DE A
    if (traData.A) {
        const traces = [{
            x: wavelengths,
            y: traData.A,
            mode: 'lines',
            name: `A total ${polLabel}`,
            line: { width: 2, color: '#0d6efd' }
        }];
        
        if (polarization === 'both' && traData.As && traData.Ap) {
            traces.push({
                x: wavelengths, y: traData.As, mode: 'lines',
                name: 'As (pol. S)', line: { width: 1, color: '#0d6efd', dash: 'dot' },
                visible: 'legendonly'
            });
            traces.push({
                x: wavelengths, y: traData.Ap, mode: 'lines',
                name: 'Ap (pol. P)', line: { width: 1, color: '#0d6efd', dash: 'dash' },
                visible: 'legendonly'
            });
        }
        
        Plotly.newPlot('aPlot', traces, { 
            ...baseLayout, 
            title: { text: `Absorbancia Total (A) ${polLabel}`, font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'A' },
            showlegend: polarization === 'both'
        }, { displayModeBar: true, responsive: true });
    }
    
    console.log(`✅ Gráficas R, T, A renderizadas`);
}

/**
 * Muestra mensaje de "sin datos"
 */
function showNoDataMessage(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="no-data">${message}</div>`;
    }
}

/**
 * Actualiza todas las gráficas
 */
function updateAllGraphs() {
    renderGraphsForType(currentGraphType);
}

/**
 * Habilita el selector de gráficas avanzado
 */
function enableAdvancedGraphSelector() {
    console.log('🔓 Habilitando selector avanzado de gráficas...');
    
    const selectorContainer = document.getElementById('graphSelectorContainer');
    if (selectorContainer) {
        selectorContainer.style.display = 'flex';
    }
    
    const simpleOptions = document.getElementById('simpleGraphOptions');
    if (simpleOptions) {
        simpleOptions.style.display = 'none';
    }
    
    ['nk-layers', 'rta', 'layer-abs'].forEach(cls => {
        const option = document.querySelector(`.graph-dropdown-item.${cls}`);
        if (option) option.classList.remove('disabled');
    });
    
    console.log('✅ Selector avanzado habilitado');
}

/**
 * Deshabilita opciones del selector
 */
function disableAdvancedGraphOptions() {
    ['nk-layers', 'rta', 'layer-abs'].forEach(cls => {
        const option = document.querySelector(`.graph-dropdown-item.${cls}`);
        if (option) option.classList.add('disabled');
    });
}

// ==========================================
// FUNCIONES DE DESCARGA
// ==========================================

function downloadPsiPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('psiPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `psi_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadDeltaPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('deltaPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `delta_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadCombinedPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('combinedPlot', {
        format: 'png', width: 1200, height: 700,
        filename: `psi_delta_combined_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadAllPDF() {
    alert('Descarga PDF en desarrollo. Por ahora use las descargas PNG individuales.');
}

function downloadNPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('nPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `indice_refraccion_n_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadKPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('kPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `coeficiente_extincion_k_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadNKCombinedPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('nkCombinedPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `constantes_opticas_nk_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadNKDataCSV() {
    const optResults = window.optimizationResults || null;
    let opticalConstants = optResults?.optical_constants || window.theoreticalOpticalConstants;
    
    if (!opticalConstants || !opticalConstants.layers) {
        alert('No hay datos de n,k para descargar');
        return;
    }
    
    const wavelengths = opticalConstants.wavelengths || window.uploadedWavelengths || [];
    const layers = opticalConstants.layers;
    
    let header = 'Wavelength_nm';
    layers.forEach((layer, idx) => {
        const name = (layer.name || `Capa${idx+1}`).replace(/[^a-zA-Z0-9]/g, '_');
        header += `,n_${name},k_${name}`;
    });
    
    let csvContent = header + '\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        let row = `${wavelengths[i]}`;
        layers.forEach(layer => {
            row += `,${layer.n[i]},${layer.k[i]}`;
        });
        csvContent += row + '\n';
    }
    
    downloadCSVFile(csvContent, `constantes_opticas_nk_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadRPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('rPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `reflectancia_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadTPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('tPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `transmitancia_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadAPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('aPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `absorbancia_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadRTADataCSV() {
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData) {
        alert('No hay datos de R, T, A para descargar');
        return;
    }
    
    const wavelengths = traData.wavelength || window.uploadedWavelengths || [];
    
    let header = 'Wavelength_nm,R,T,A';
    
    if (traData.layer_names && traData.layer_names.length > 0) {
        traData.layer_names.forEach(name => {
            header += `,A_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        });
    }
    
    let csvContent = header + '\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        const R = traData.R ? traData.R[i] : '';
        const T = traData.T ? traData.T[i] : '';
        const A = traData.A ? traData.A[i] : '';
        
        let row = `${wavelengths[i]},${R},${T},${A}`;
        
        if (traData.layer_absorptions && traData.layer_absorptions.length > 0) {
            traData.layer_absorptions.forEach(layerAbs => {
                row += `,${layerAbs[i] || 0}`;
            });
        }
        
        csvContent += row + '\n';
    }
    
    downloadCSVFile(csvContent, `espectros_RTA_${new Date().toISOString().slice(0,10)}.csv`);
}

// ==========================================
// ABSORCIÓN POR CAPA
// ==========================================

let showLayerAbsorption = false;

function toggleLayerAbsorption() {
    showLayerAbsorption = !showLayerAbsorption;
    
    const container = document.getElementById('layerAbsorptionContainer');
    const toggleBtn = document.getElementById('toggleLayerAbsorptionBtn');
    
    if (container) {
        container.style.display = showLayerAbsorption ? 'block' : 'none';
    }
    
    if (toggleBtn) {
        toggleBtn.textContent = showLayerAbsorption ? 
            '📊 Ocultar absorción por capa' : 
            '📊 Mostrar absorción por capa';
        toggleBtn.classList.toggle('active', showLayerAbsorption);
    }
    
    if (showLayerAbsorption) {
        renderLayerAbsorptionGraphs();
    }
}

function renderLayerAbsorptionGraphs() {
    console.log('📈 Renderizando gráficas de absorción por capa...');
    
    const optResults = window.optimizationResults || null;
    const traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.layer_absorptions || traData.layer_absorptions.length === 0) {
        console.warn('No hay datos de absorción por capa');
        
        const combinedPlot = document.getElementById('combinedLayerAbsPlot');
        if (combinedPlot) {
            combinedPlot.innerHTML = '<div class="no-data">No hay datos de absorción por capa</div>';
        }
        
        const individualPlots = document.getElementById('individualLayerPlots');
        if (individualPlots) {
            individualPlots.innerHTML = '';
        }
        return;
    }
    
    if (typeof Plotly === 'undefined') {
        console.error('Plotly no está cargado');
        return;
    }
    
    const wavelengths = traData.wavelength || window.uploadedWavelengths || [];
    const layerNames = traData.layer_names || [];
    const layerAbsorptions = traData.layer_absorptions || [];
    
    const showGrid = document.getElementById('showGridAdvanced')?.checked ?? 
                     document.getElementById('showGrid')?.checked ?? true;
    const whiteBackground = document.getElementById('whiteBackgroundAdvanced')?.checked ?? 
                            document.getElementById('whiteBackground')?.checked ?? true;
    const bgColor = whiteBackground ? 'white' : '#f5f5f5';
    const gridColor = showGrid ? '#ddd' : 'rgba(0,0,0,0)';
    
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e91e63', '#00bcd4'];
    
    // GRÁFICA COMBINADA
    const combinedPlotDiv = document.getElementById('combinedLayerAbsPlot');
    if (combinedPlotDiv) {
        const traces = [];
        
        layerAbsorptions.forEach((layerAbs, index) => {
            const layerName = layerNames[index] || `Capa ${index + 1}`;
            const color = colors[index % colors.length];
            
            traces.push({
                x: wavelengths,
                y: layerAbs,
                mode: 'lines',
                name: layerName,
                line: { width: 2, color: color }
            });
        });
        
        if (traData.A) {
            traces.push({
                x: wavelengths,
                y: traData.A,
                mode: 'lines',
                name: 'A total (1-R-T)',
                line: { width: 3, color: '#2c3e50', dash: 'dash' }
            });
        }
        
        Plotly.newPlot(combinedPlotDiv, traces, {
            title: { text: 'Absorción por Capa - Comparación', font: { size: 16 } },
            xaxis: { 
                title: 'Longitud de onda (nm)',
                showgrid: showGrid, gridcolor: gridColor,
                showline: true, linewidth: 1, linecolor: 'black', mirror: true
            },
            yaxis: { 
                title: 'Absorción',
                showgrid: showGrid, gridcolor: gridColor,
                showline: true, linewidth: 1, linecolor: 'black', mirror: true
            },
            legend: { x: 1.02, y: 1, xanchor: 'left' },
            margin: { l: 60, r: 150, t: 50, b: 50 },
            plot_bgcolor: bgColor,
            paper_bgcolor: 'white',
            hovermode: 'x unified'
        }, { displayModeBar: true, responsive: true });
    }
    
    console.log(`✅ Gráficas de absorción por capa renderizadas`);
}

function downloadLayerAbsorptionPNG() {
    if (typeof Plotly === 'undefined') return;
    const combinedPlot = document.getElementById('combinedLayerAbsPlot');
    if (combinedPlot) {
        Plotly.downloadImage(combinedPlot, {
            format: 'png', width: 1200, height: 600,
            filename: `absorcion_por_capa_${new Date().toISOString().slice(0,10)}`
        });
    }
}

function downloadLayerAbsorptionCSV() {
    const optResults = window.optimizationResults || null;
    const traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.layer_absorptions) {
        alert('No hay datos de absorción por capa para descargar');
        return;
    }
    
    const wavelengths = traData.wavelength || window.uploadedWavelengths || [];
    const layerNames = traData.layer_names || [];
    const layerAbsorptions = traData.layer_absorptions;
    
    let header = 'Wavelength_nm,A_total';
    layerNames.forEach(name => {
        header += `,A_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    });
    
    let csvContent = header + '\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        const A_total = traData.A ? traData.A[i] : 0;
        let row = `${wavelengths[i]},${A_total}`;
        
        layerAbsorptions.forEach(layerAbs => {
            row += `,${layerAbs[i] || 0}`;
        });
        
        csvContent += row + '\n';
    }
    
    downloadCSVFile(csvContent, `absorcion_por_capa_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadCSVFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`✅ Archivo descargado: ${filename}`);
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Inicializando sistema de dropdown de gráficas...');
    
    selectGraphType('psi-delta');
    
    const showGridAdvanced = document.getElementById('showGridAdvanced');
    const whiteBackgroundAdvanced = document.getElementById('whiteBackgroundAdvanced');
    
    if (showGridAdvanced) {
        showGridAdvanced.addEventListener('change', updateAllGraphs);
    }
    
    if (whiteBackgroundAdvanced) {
        whiteBackgroundAdvanced.addEventListener('change', updateAllGraphs);
    }
    
    console.log('✅ Sistema de dropdown inicializado');
});

// ==========================================
// EXPONER FUNCIONES GLOBALMENTE
// ==========================================
window.toggleGraphDropdown = toggleGraphDropdown;
window.selectGraphType = selectGraphType;
window.updateNKGraphsForLayer = updateNKGraphsForLayer;
window.updateAllGraphs = updateAllGraphs;
window.enableAdvancedGraphSelector = enableAdvancedGraphSelector;
window.renderNKGraphs = renderNKGraphs;
window.renderRTAGraphs = renderRTAGraphs;
window.renderLayerAbsorptionGraphs = renderLayerAbsorptionGraphs;

window.downloadPsiPNG = downloadPsiPNG;
window.downloadDeltaPNG = downloadDeltaPNG;
window.downloadCombinedPNG = downloadCombinedPNG;
window.downloadAllPDF = downloadAllPDF;
window.downloadNPlotPNG = downloadNPlotPNG;
window.downloadKPlotPNG = downloadKPlotPNG;
window.downloadNKCombinedPNG = downloadNKCombinedPNG;
window.downloadNKDataCSV = downloadNKDataCSV;
window.downloadRPlotPNG = downloadRPlotPNG;
window.downloadTPlotPNG = downloadTPlotPNG;
window.downloadAPlotPNG = downloadAPlotPNG;
window.downloadRTADataCSV = downloadRTADataCSV;

window.toggleLayerAbsorption = toggleLayerAbsorption;
window.downloadLayerAbsorptionPNG = downloadLayerAbsorptionPNG;
window.downloadLayerAbsorptionCSV = downloadLayerAbsorptionCSV;

console.log('✅ Módulo de dropdown de gráficas cargado (VERSIÓN CORREGIDA v2)');