// ==========================================
// SISTEMA DE DROPDOWN DE GRÁFICAS
// Para upload.html con estructura de dropdown
// ==========================================

// Variable global para tipo de gráfica actual
let currentGraphType = 'psi-delta';

/**
 * Toggle del menú dropdown de gráficas
 */
function toggleGraphDropdown() {
    const menu = document.getElementById('graphDropdownMenu');
    const button = document.getElementById('graphTypeButton');
    
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
 * @param {string} type - 'psi-delta', 'nk', o 'rta'
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
        'rta': '📊 R, T y A'
    };
    
    const buttonText = button.querySelector('.selected-graph-text');
    if (buttonText) {
        buttonText.textContent = labels[type] || type;
    }
    
    // Actualizar selección visual en el menú
    document.querySelectorAll('.graph-dropdown-item').forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.type === type) {
            item.classList.add('selected');
        }
    });
    
    // Ocultar todos los contenedores de gráficas
    document.querySelectorAll('.graphs-psi-delta, .graphs-nk, .graphs-rta').forEach(container => {
        container.classList.remove('active');
    });
    
    // Mostrar contenedor correspondiente
    if (type === 'psi-delta') {
        document.getElementById('graphsPsiDelta')?.classList.add('active');
    } else if (type === 'nk') {
        document.getElementById('graphsNK')?.classList.add('active');
    } else if (type === 'rta') {
        document.getElementById('graphsRTA')?.classList.add('active');
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
    // Ocultar todos los grupos de botones
    document.querySelectorAll('.download-buttons-psi-delta, .download-buttons-nk, .download-buttons-rta').forEach(group => {
        group.style.display = 'none';
    });
    
    // Mostrar grupo correspondiente
    const groupClass = `.download-buttons-${type === 'psi-delta' ? 'psi-delta' : type}`;
    const activeGroup = document.querySelector(groupClass);
    if (activeGroup) {
        activeGroup.style.display = 'flex';
    }
}

/**
 * Renderiza las gráficas según el tipo seleccionado
 */
function renderGraphsForType(type) {
    if (type === 'psi-delta') {
        // Las gráficas Psi/Delta ya deberían estar renderizadas
        // Solo actualizar si es necesario
        if (uploadedWavelengths && uploadedWavelengths.length > 0) {
            updateAllPsiDeltaPlots();
        }
    } else if (type === 'nk') {
        renderNKGraphs();
    } else if (type === 'rta') {
        renderRTAGraphs();
    }
}

/**
 * Actualiza las gráficas Psi y Delta
 */
function updateAllPsiDeltaPlots() {
    if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
        console.warn('No hay datos para actualizar gráficas Psi/Delta');
        return;
    }
    
    // Llamar a las funciones existentes de plotting
    if (typeof plotPsi === 'function') plotPsi();
    if (typeof plotDelta === 'function') plotDelta();
    if (typeof plotCombined === 'function') plotCombined();
}

/**
 * Renderiza las gráficas de n y k
 */
function renderNKGraphs() {
    console.log('📈 Renderizando gráficas n y k...');
    
    // Obtener datos de constantes ópticas
    let opticalConstants = null;
    
    if (optimizationResults?.optical_constants) {
        opticalConstants = optimizationResults.optical_constants;
    } else if (window.theoreticalOpticalConstants) {
        opticalConstants = window.theoreticalOpticalConstants;
    }
    
    if (!opticalConstants || !opticalConstants.layers || opticalConstants.layers.length === 0) {
        // Mostrar mensaje de que no hay datos
        showNoDataMessage('nPlot', 'Calcule los valores teóricos para visualizar n vs λ');
        showNoDataMessage('kPlot', 'Calcule los valores teóricos para visualizar k vs λ');
        showNoDataMessage('nkCombinedPlot', 'Calcule los valores teóricos para visualizar n y k juntos');
        return;
    }
    
    // Poblar selector de capas si no está poblado
    populateNKLayerSelector(opticalConstants.layers);
    
    // Obtener capa seleccionada
    const selector = document.getElementById('nkLayerSelect');
    const selectedValue = selector?.value || 'all';
    
    // Plotear según selección
    plotNKForLayer(selectedValue, opticalConstants);
}

/**
 * Puebla el selector de capas para n,k
 */
function populateNKLayerSelector(layers) {
    const selector = document.getElementById('nkLayerSelect');
    if (!selector) return;
    
    // Verificar si ya está poblado
    if (selector.options.length > 1) return;
    
    // Limpiar y agregar opciones
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
    
    let opticalConstants = optimizationResults?.optical_constants || window.theoreticalOpticalConstants;
    
    if (opticalConstants) {
        plotNKForLayer(selector.value, opticalConstants);
    }
}

/**
 * Plotea n y k para la capa seleccionada
 */
function plotNKForLayer(selectedValue, opticalConstants) {
    const wavelengths = opticalConstants.wavelengths || uploadedWavelengths;
    const layers = opticalConstants.layers;
    
    // Determinar qué capas plotear
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
    
    // Colores para diferentes capas
    const colors = ['#2E86C1', '#E74C3C', '#28a745', '#9C27B0', '#FF5722', '#00BCD4'];
    
    // Opciones de visualización
    const showGrid = document.getElementById('showGridAdvanced')?.checked ?? 
                     document.getElementById('showGrid')?.checked ?? true;
    const whiteBackground = document.getElementById('whiteBackgroundAdvanced')?.checked ?? 
                            document.getElementById('whiteBackground')?.checked ?? true;
    const bgColor = whiteBackground ? 'white' : '#f5f5f5';
    const gridColor = showGrid ? '#ddd' : 'rgba(0,0,0,0)';
    
    // ========================================
    // GRÁFICA DE n
    // ========================================
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
    
    // ========================================
    // GRÁFICA DE k
    // ========================================
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
    
    // ========================================
    // GRÁFICA COMBINADA n y k
    // ========================================
    const tracesCombined = [];
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        
        // n en eje y1
        tracesCombined.push({
            x: wavelengths,
            y: layer.n,
            mode: 'lines',
            name: `n - ${layer.name || `Capa ${layer.index + 1}`}`,
            line: { width: 2, color: color },
            yaxis: 'y1'
        });
        
        // k en eje y2
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
    
    // Obtener datos de T-R-A
    let traData = null;
    
    if (optimizationResults?.tra_spectra) {
        traData = optimizationResults.tra_spectra;
    } else if (window.theoreticalTRASpectra) {
        traData = window.theoreticalTRASpectra;
    }
    
    if (!traData || !traData.T) {
        showNoDataMessage('rPlot', 'Calcule los valores teóricos para visualizar R vs λ');
        showNoDataMessage('tPlot', 'Calcule los valores teóricos para visualizar T vs λ');
        showNoDataMessage('aPlot', 'Calcule los valores teóricos para visualizar A vs λ');
        return;
    }
    
    const wavelengths = traData.wavelengths || uploadedWavelengths;
    
    // Opciones de visualización
    const showGrid = document.getElementById('showGridAdvanced')?.checked ?? 
                     document.getElementById('showGrid')?.checked ?? true;
    const whiteBackground = document.getElementById('whiteBackgroundAdvanced')?.checked ?? 
                            document.getElementById('whiteBackground')?.checked ?? true;
    const bgColor = whiteBackground ? 'white' : '#f5f5f5';
    const gridColor = showGrid ? '#ddd' : 'rgba(0,0,0,0)';
    
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
    
    // ========================================
    // GRÁFICA DE R (Reflectancia)
    // ========================================
    if (traData.R) {
        const traceR = {
            x: wavelengths,
            y: traData.R,
            mode: 'lines',
            name: 'Reflectancia',
            line: { width: 2, color: '#dc3545' }
        };
        
        const layoutR = { 
            ...baseLayout, 
            title: { text: 'Reflectancia (R)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'R' }
        };
        
        Plotly.newPlot('rPlot', [traceR], layoutR, { displayModeBar: true, responsive: true });
    }
    
    // ========================================
    // GRÁFICA DE T (Transmitancia)
    // ========================================
    if (traData.T) {
        const traceT = {
            x: wavelengths,
            y: traData.T,
            mode: 'lines',
            name: 'Transmitancia',
            line: { width: 2, color: '#28a745' }
        };
        
        const layoutT = { 
            ...baseLayout, 
            title: { text: 'Transmitancia (T)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'T' }
        };
        
        Plotly.newPlot('tPlot', [traceT], layoutT, { displayModeBar: true, responsive: true });
    }
    
    // ========================================
    // GRÁFICA DE A (Absorbancia)
    // ========================================
    if (traData.A) {
        const traceA = {
            x: wavelengths,
            y: traData.A,
            mode: 'lines',
            name: 'Absorbancia',
            line: { width: 2, color: '#0d6efd' }
        };
        
        const layoutA = { 
            ...baseLayout, 
            title: { text: 'Absorbancia (A)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'A' }
        };
        
        Plotly.newPlot('aPlot', [traceA], layoutA, { displayModeBar: true, responsive: true });
    }
    
    console.log('✅ Gráficas R, T, A renderizadas');
}

/**
 * Muestra mensaje de "sin datos" en un contenedor de gráfica
 */
function showNoDataMessage(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="no-data">${message}</div>`;
    }
}

/**
 * Actualiza todas las gráficas (llamar cuando cambian opciones globales)
 */
function updateAllGraphs() {
    renderGraphsForType(currentGraphType);
}

/**
 * Habilita el selector de gráficas avanzado
 * Llamar después de calcular valores teóricos
 */
function enableAdvancedGraphSelector() {
    console.log('🔓 Habilitando selector avanzado de gráficas...');
    
    // Mostrar contenedor del dropdown
    const selectorContainer = document.getElementById('graphSelectorContainer');
    if (selectorContainer) {
        selectorContainer.style.display = 'flex';
    }
    
    // Ocultar opciones simples
    const simpleOptions = document.getElementById('simpleGraphOptions');
    if (simpleOptions) {
        simpleOptions.style.display = 'none';
    }
    
    // Habilitar opciones n,k y R-T-A en el dropdown
    const nkOption = document.querySelector('.graph-dropdown-item.nk-layers');
    const rtaOption = document.querySelector('.graph-dropdown-item.rta');
    
    if (nkOption) {
        nkOption.classList.remove('disabled');
    }
    
    if (rtaOption) {
        rtaOption.classList.remove('disabled');
    }
    
    console.log('✅ Selector avanzado habilitado');
}

/**
 * Deshabilita opciones del selector (para cuando no hay datos)
 */
function disableAdvancedGraphOptions() {
    const nkOption = document.querySelector('.graph-dropdown-item.nk-layers');
    const rtaOption = document.querySelector('.graph-dropdown-item.rta');
    
    if (nkOption) {
        nkOption.classList.add('disabled');
    }
    
    if (rtaOption) {
        rtaOption.classList.add('disabled');
    }
}

// ==========================================
// FUNCIONES DE DESCARGA
// ==========================================

function downloadPsiPNG() {
    Plotly.downloadImage('psiPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `psi_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadDeltaPNG() {
    Plotly.downloadImage('deltaPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `delta_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadCombinedPNG() {
    Plotly.downloadImage('combinedPlot', {
        format: 'png', width: 1200, height: 700,
        filename: `psi_delta_combined_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadAllPDF() {
    alert('Descarga PDF en desarrollo. Por ahora use las descargas PNG individuales.');
}

function downloadNPlotPNG() {
    Plotly.downloadImage('nPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `indice_refraccion_n_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadKPlotPNG() {
    Plotly.downloadImage('kPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `coeficiente_extincion_k_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadNKCombinedPNG() {
    Plotly.downloadImage('nkCombinedPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `constantes_opticas_nk_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadNKDataCSV() {
    let opticalConstants = optimizationResults?.optical_constants || window.theoreticalOpticalConstants;
    
    if (!opticalConstants || !opticalConstants.layers) {
        alert('No hay datos de n,k para descargar');
        return;
    }
    
    const wavelengths = opticalConstants.wavelengths || uploadedWavelengths;
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
    Plotly.downloadImage('rPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `reflectancia_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadTPlotPNG() {
    Plotly.downloadImage('tPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `transmitancia_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadAPlotPNG() {
    Plotly.downloadImage('aPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `absorbancia_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadRTADataCSV() {
    let traData = optimizationResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData) {
        alert('No hay datos de R, T, A para descargar');
        return;
    }
    
    const wavelengths = traData.wavelengths || uploadedWavelengths;
    
    let csvContent = 'Wavelength_nm,Reflectancia,Transmitancia,Absorbancia\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        const R = traData.R ? traData.R[i] : '';
        const T = traData.T ? traData.T[i] : '';
        const A = traData.A ? traData.A[i] : '';
        csvContent += `${wavelengths[i]},${R},${T},${A}\n`;
    }
    
    downloadCSVFile(csvContent, `espectros_RTA_${new Date().toISOString().slice(0,10)}.csv`);
}

/**
 * Función auxiliar para descargar CSV
 */
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
    
    // Seleccionar Psi/Delta por defecto
    selectGraphType('psi-delta');
    
    // Event listeners para checkboxes de opciones
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

// Exponer funciones globalmente
window.toggleGraphDropdown = toggleGraphDropdown;
window.selectGraphType = selectGraphType;
window.updateNKGraphsForLayer = updateNKGraphsForLayer;
window.updateAllGraphs = updateAllGraphs;
window.enableAdvancedGraphSelector = enableAdvancedGraphSelector;
window.renderNKGraphs = renderNKGraphs;
window.renderRTAGraphs = renderRTAGraphs;

// Funciones de descarga
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

console.log('✅ Módulo de dropdown de gráficas cargado');