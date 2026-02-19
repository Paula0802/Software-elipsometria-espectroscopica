// ⭐ CORRECCIÓN: NO redeclarar variables si ya existen
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
 * ACTUALIZADO v4: R, T, A separados
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
        'nk-emt': '📊 n y k efectivos (EMT)',
        'reflectance': '📊 Reflectancia (R)',
        'transmittance': '📊 Transmitancia (T)',
        'absorbance': '📊 Absorbancia (A)'
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
    document.querySelectorAll('.graphs-psi-delta, .graphs-nk, .graphs-nk-emt, .graphs-reflectance, .graphs-transmittance, .graphs-absorbance').forEach(container => {
        container.classList.remove('active');
        container.style.display = 'none';
    });
    
    // Mostrar contenedor correspondiente
    const containerMap = {
        'psi-delta': 'graphsPsiDelta',
        'nk': 'graphsNK',
        'nk-emt': 'graphsNKEmt',
        'reflectance': 'graphsReflectance',
        'transmittance': 'graphsTransmittance',
        'absorbance': 'graphsAbsorbance'
    };
    
    const containerId = containerMap[type];
    if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.classList.add('active');
            container.style.display = 'block';
        }
    }
    
    // Mostrar/ocultar selector de capas (para n,k)
    const layerSelector = document.getElementById('layerSelectorInline');
    if (layerSelector) {
        layerSelector.classList.toggle('show', type === 'nk');
        layerSelector.style.display = type === 'nk' ? 'inline-flex' : 'none';
    }
    
    // Mostrar/ocultar opciones de incidente/sustrato
    const nkOptions = document.getElementById('nkOptionsInline');
    if (nkOptions) {
        nkOptions.classList.toggle('show', type === 'nk');
        nkOptions.style.display = type === 'nk' ? 'inline-flex' : 'none';
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
    document.querySelectorAll('.download-buttons-psi-delta, .download-buttons-nk, .download-buttons-nk-emt, .download-buttons-reflectance, .download-buttons-transmittance, .download-buttons-absorbance').forEach(group => {
        group.style.display = 'none';
    });
    
    const buttonClassMap = {
        'psi-delta': '.download-buttons-psi-delta',
        'nk': '.download-buttons-nk',
        'nk-emt': '.download-buttons-nk-emt',
        'reflectance': '.download-buttons-reflectance',
        'transmittance': '.download-buttons-transmittance',
        'absorbance': '.download-buttons-absorbance'
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
    const wavelengths = window.uploadedWavelengths || [];
    
    if (type === 'psi-delta') {
        if (wavelengths.length > 0) {
            updateAllPsiDeltaPlots();
        }
    } else if (type === 'nk') {
        renderNKGraphs();
    } else if (type === 'nk-emt') {
        renderNKEmtGraphs();
    } else if (type === 'reflectance') {
        renderReflectanceGraphs();
    } else if (type === 'transmittance') {
        renderTransmittanceGraphs();
    } else if (type === 'absorbance') {
        renderAbsorbanceGraphs();
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
    
    // ⭐ ACTUALIZADO: pasar opticalConstants completo para acceder a ambient/substrate
    populateNKLayerSelector(opticalConstants.layers, opticalConstants);
    
    const selector = document.getElementById('nkLayerSelect');
    const selectedValue = selector?.value || 'all';
    
    const includeAmbient = document.getElementById('includeAmbientNK')?.checked || false;
    const includeSubstrate = document.getElementById('includeSubstrateNK')?.checked || false;
    
    plotNKForLayer(selectedValue, opticalConstants, includeAmbient, includeSubstrate);
}

function populateNKLayerSelector(layers, opticalConstants) {
    const selector = document.getElementById('nkLayerSelect');
    if (!selector) return;
    
    // ⭐ CRÍTICO: guardar el valor actual ANTES de reconstruir el dropdown
    const previousValue = selector.value;
    
    selector.innerHTML = '<option value="all">Todas las capas</option>';
    
    // Agregar medio incidente si existe
    if (opticalConstants?.ambient) {
        const option = document.createElement('option');
        option.value = 'ambient';
        option.textContent = '🌐 Medio incidente';
        selector.appendChild(option);
    }
    
    // Agregar capas normales
    layers.forEach((layer, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = layer.name || `Capa ${index + 1}`;
        selector.appendChild(option);
    });
    
    // Agregar sustrato si existe
    if (opticalConstants?.substrate) {
        const option = document.createElement('option');
        option.value = 'substrate';
        option.textContent = '🪨 Sustrato';
        selector.appendChild(option);
    }
    
    // ⭐ CRÍTICO: restaurar la selección previa si aún existe como opción válida
    if (previousValue && selector.querySelector(`option[value="${previousValue}"]`)) {
        selector.value = previousValue;
    }
}

/**
 * Actualiza gráficas n,k cuando cambia el selector de capa
 */
function updateNKGraphsForLayer() {
    renderNKGraphs();
}

/**
 * Actualiza gráficas n,k cuando cambian opciones incidente/sustrato
 */
function updateNKOptions() {
    renderNKGraphs();
}


function plotNKForLayer(selectedValue, opticalConstants, includeAmbient = false, includeSubstrate = false) {
    const wavelengths = opticalConstants.wavelengths || opticalConstants.wavelength || window.uploadedWavelengths || [];
    const layers = opticalConstants.layers;
    
    if (!wavelengths || wavelengths.length === 0) {
        console.warn('No hay wavelengths disponibles para plotear n,k');
        return;
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
    
    // ⭐ NUEVO: Ocultar/mostrar checkboxes según selección
    const nkOptions = document.getElementById('nkOptionsInline');
    if (nkOptions) {
        // Si se seleccionó directamente ambient o substrate, los checkboxes no tienen sentido
        nkOptions.style.opacity = (selectedValue === 'ambient' || selectedValue === 'substrate') ? '0.4' : '1';
        nkOptions.style.pointerEvents = (selectedValue === 'ambient' || selectedValue === 'substrate') ? 'none' : 'auto';
    }
    
    // ⭐ NUEVO: Determinar qué trazar según la selección
    let layersToPlot = [];
    let ambientForced = false;
    let substrateForced = false;
    
    if (selectedValue === 'ambient') {
        // Solo mostrar el medio incidente
        ambientForced = true;
    } else if (selectedValue === 'substrate') {
        // Solo mostrar el sustrato
        substrateForced = true;
    } else if (selectedValue === 'all') {
        layersToPlot = layers.map((layer, idx) => ({ ...layer, index: idx }));
    } else {
        const idx = parseInt(selectedValue);
        if (layers[idx]) {
            layersToPlot = [{ ...layers[idx], index: idx }];
        }
    }
    
    // Usar los checkboxes solo cuando NO se seleccionó ambient/substrate directamente
    const showAmbient = ambientForced || includeAmbient;
    const showSubstrate = substrateForced || includeSubstrate;
    
    // ========================================
    // GRÁFICA DE n
    // ========================================
    const tracesN = [];
    
    if (showAmbient && opticalConstants.ambient) {
        const ambientN = opticalConstants.ambient.n;
        const nValues = Array.isArray(ambientN) ? ambientN : Array(wavelengths.length).fill(ambientN);
        tracesN.push({
            x: wavelengths, y: nValues, mode: 'lines',
            name: 'Medio incidente',
            line: { width: 2, color: '#999999', dash: 'dot' }
        });
    }
    
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        tracesN.push({
            x: wavelengths, y: layer.n, mode: 'lines',
            name: layer.name || `Capa ${layer.index + 1}`,
            line: { width: 2, color: color }
        });
    });
    
    if (showSubstrate && opticalConstants.substrate) {
        const substrateN = opticalConstants.substrate.n;
        const nValues = Array.isArray(substrateN) ? substrateN : Array(wavelengths.length).fill(substrateN);
        tracesN.push({
            x: wavelengths, y: nValues, mode: 'lines',
            name: 'Sustrato',
            line: { width: 2, color: '#333333', dash: 'dash' }
        });
    }
    
    const layoutN = {
        title: { text: ambientForced ? 'Índice de Refracción - Medio Incidente' : 
                        substrateForced ? 'Índice de Refracción - Sustrato' : 
                        'Índice de Refracción (n)', font: { size: 14 } },
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
        plot_bgcolor: bgColor, paper_bgcolor: 'white', hovermode: 'x unified'
    };
    
    Plotly.newPlot('nPlot', tracesN, layoutN, { displayModeBar: true, responsive: true });
    
    // ========================================
    // GRÁFICA DE k
    // ========================================
    const tracesK = [];
    
    if (showAmbient && opticalConstants.ambient) {
        const ambientK = opticalConstants.ambient.k || 0;
        const kValues = Array.isArray(ambientK) ? ambientK : Array(wavelengths.length).fill(ambientK);
        tracesK.push({
            x: wavelengths, y: kValues, mode: 'lines',
            name: 'Medio incidente',
            line: { width: 2, color: '#999999', dash: 'dot' }
        });
    }
    
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        tracesK.push({
            x: wavelengths, y: layer.k, mode: 'lines',
            name: layer.name || `Capa ${layer.index + 1}`,
            line: { width: 2, color: color }
        });
    });
    
    if (showSubstrate && opticalConstants.substrate) {
        const substrateK = opticalConstants.substrate.k || 0;
        const kValues = Array.isArray(substrateK) ? substrateK : Array(wavelengths.length).fill(substrateK);
        tracesK.push({
            x: wavelengths, y: kValues, mode: 'lines',
            name: 'Sustrato',
            line: { width: 2, color: '#333333', dash: 'dash' }
        });
    }
    
    const layoutK = {
        title: { text: ambientForced ? 'Coef. de Extinción - Medio Incidente' : 
                        substrateForced ? 'Coef. de Extinción - Sustrato' : 
                        'Coeficiente de Extinción (k)', font: { size: 14 } },
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
        plot_bgcolor: bgColor, paper_bgcolor: 'white', hovermode: 'x unified'
    };
    
    Plotly.newPlot('kPlot', tracesK, layoutK, { displayModeBar: true, responsive: true });
    
    // ========================================
    // GRÁFICA COMBINADA n y k
    // ========================================
    const tracesCombined = [];
    
    if (showAmbient && opticalConstants.ambient) {
        const ambientN = opticalConstants.ambient.n;
        const ambientK = opticalConstants.ambient.k || 0;
        const nValues = Array.isArray(ambientN) ? ambientN : Array(wavelengths.length).fill(ambientN);
        const kValues = Array.isArray(ambientK) ? ambientK : Array(wavelengths.length).fill(ambientK);
        tracesCombined.push({
            x: wavelengths, y: nValues, mode: 'lines',
            name: 'n - Medio incidente',
            line: { width: 2, color: '#999999', dash: 'dot' }, yaxis: 'y1'
        });
        tracesCombined.push({
            x: wavelengths, y: kValues, mode: 'lines',
            name: 'k - Medio incidente',
            line: { width: 2, color: '#999999', dash: 'dashdot' }, yaxis: 'y2'
        });
    }
    
    layersToPlot.forEach((layer) => {
        const color = colors[layer.index % colors.length];
        tracesCombined.push({
            x: wavelengths, y: layer.n, mode: 'lines',
            name: `n - ${layer.name || `Capa ${layer.index + 1}`}`,
            line: { width: 2, color: color }, yaxis: 'y1'
        });
        tracesCombined.push({
            x: wavelengths, y: layer.k, mode: 'lines',
            name: `k - ${layer.name || `Capa ${layer.index + 1}`}`,
            line: { width: 2, color: color, dash: 'dash' }, yaxis: 'y2'
        });
    });
    
    if (showSubstrate && opticalConstants.substrate) {
        const substrateN = opticalConstants.substrate.n;
        const substrateK = opticalConstants.substrate.k || 0;
        const nValues = Array.isArray(substrateN) ? substrateN : Array(wavelengths.length).fill(substrateN);
        const kValues = Array.isArray(substrateK) ? substrateK : Array(wavelengths.length).fill(substrateK);
        tracesCombined.push({
            x: wavelengths, y: nValues, mode: 'lines',
            name: 'n - Sustrato',
            line: { width: 2, color: '#333333', dash: 'dash' }, yaxis: 'y1'
        });
        tracesCombined.push({
            x: wavelengths, y: kValues, mode: 'lines',
            name: 'k - Sustrato',
            line: { width: 2, color: '#333333', dash: 'longdashdot' }, yaxis: 'y2'
        });
    }
    
    const layoutCombined = {
        title: { text: ambientForced ? 'Constantes Ópticas - Medio Incidente' : 
                        substrateForced ? 'Constantes Ópticas - Sustrato' : 
                        'Constantes Ópticas n y k', font: { size: 14 } },
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: {
            title: 'n (índice de refracción)',
            titlefont: { color: '#2E86C1' }, tickfont: { color: '#2E86C1' },
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true, side: 'left'
        },
        yaxis2: {
            title: 'k (coeficiente de extinción)',
            titlefont: { color: '#E74C3C' }, tickfont: { color: '#E74C3C' },
            overlaying: 'y', side: 'right', showgrid: false,
            showline: true, linewidth: 1, linecolor: 'black'
        },
        legend: { x: 0.5, y: -0.15, xanchor: 'center', orientation: 'h' },
        margin: { l: 60, r: 60, t: 50, b: 80 },
        plot_bgcolor: bgColor, paper_bgcolor: 'white', hovermode: 'x unified'
    };
    
    Plotly.newPlot('nkCombinedPlot', tracesCombined, layoutCombined, { displayModeBar: true, responsive: true });
    
    console.log(`✅ Gráficas n,k renderizadas para: ${selectedValue}`);
}



// ==========================================
// GRÁFICAS DE n, k EFECTIVOS (EMT)
// ==========================================

function renderNKEmtGraphs() {
    console.log('📈 Renderizando gráficas n y k efectivos (EMT)...');
    
    const optResults = window.optimizationResults || null;
    
    let emtData = null;
    if (optResults?.emt_data) {
        emtData = optResults.emt_data;
    } else if (window.theoreticalEMTData) {
        emtData = window.theoreticalEMTData;
    }
    
    if (!emtData || Object.keys(emtData).length === 0) {
        showNoDataMessage('nEmtPlot', 'No hay capas EMT en el modelo.');
        showNoDataMessage('kEmtPlot', 'No hay capas EMT en el modelo.');
        showNoDataMessage('nkEmtCombinedPlot', 'No hay capas EMT en el modelo.');
        return;
    }
    
    // ⭐ NUEVO: Poblar selector EMT si existe en el HTML
    populateNKEmtLayerSelector(emtData);
    
    const selector = document.getElementById('nkEmtLayerSelect');
    const selectedValue = selector?.value || 'all';
    
    const wavelengths = emtData.wavelengths || window.uploadedWavelengths || [];
    
    if (!wavelengths || wavelengths.length === 0) {
        console.warn('No hay wavelengths disponibles para plotear n,k EMT');
        return;
    }
    
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
    
    const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'];
    
    const tracesNEmt = [];
    const tracesKEmt = [];
    const tracesCombinedEmt = [];
    let colorIndex = 0;
    
    for (const [layerName, data] of Object.entries(emtData)) {
        if (layerName === 'wavelengths') continue;
        
        // ⭐ NUEVO: Filtrar por selección
        if (selectedValue !== 'all' && layerName !== selectedValue) continue;
        
        const color = colors[colorIndex % colors.length];
        colorIndex++;
        
        if (data.n_effective) {
            tracesNEmt.push({
                x: data.wavelengths || wavelengths, y: data.n_effective,
                mode: 'lines', name: `${layerName}`,
                line: { width: 2, color: color }
            });
            tracesCombinedEmt.push({
                x: data.wavelengths || wavelengths, y: data.n_effective,
                mode: 'lines', name: `n_eff - ${layerName}`,
                line: { width: 2, color: color }, yaxis: 'y1'
            });
        }
        
        if (data.k_effective) {
            tracesKEmt.push({
                x: data.wavelengths || wavelengths, y: data.k_effective,
                mode: 'lines', name: `${layerName}`,
                line: { width: 2, color: color }
            });
            tracesCombinedEmt.push({
                x: data.wavelengths || wavelengths, y: data.k_effective,
                mode: 'lines', name: `k_eff - ${layerName}`,
                line: { width: 2, color: color, dash: 'dash' }, yaxis: 'y2'
            });
        }
    }
    
    if (tracesNEmt.length === 0) {
        showNoDataMessage('nEmtPlot', 'No hay datos de n efectivo para la selección actual');
        showNoDataMessage('kEmtPlot', 'No hay datos de k efectivo para la selección actual');
        showNoDataMessage('nkEmtCombinedPlot', 'No hay datos EMT para la selección actual');
        return;
    }
    
    const titleSuffix = selectedValue !== 'all' ? ` - ${selectedValue}` : '';
    
    const baseLayout = {
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        legend: { x: 1.02, y: 1, xanchor: 'left' },
        margin: { l: 60, r: 120, t: 50, b: 50 },
        plot_bgcolor: bgColor, paper_bgcolor: 'white', hovermode: 'x unified'
    };
    
    Plotly.newPlot('nEmtPlot', tracesNEmt, {
        ...baseLayout,
        title: { text: `Índice de Refracción Efectivo (n_eff) - EMT${titleSuffix}`, font: { size: 14 } },
        yaxis: { title: 'n_eff', showgrid: showGrid, gridcolor: gridColor,
                 showline: true, linewidth: 1, linecolor: 'black', mirror: true }
    }, { displayModeBar: true, responsive: true });
    
    Plotly.newPlot('kEmtPlot', tracesKEmt, {
        ...baseLayout,
        title: { text: `Coeficiente de Extinción Efectivo (k_eff) - EMT${titleSuffix}`, font: { size: 14 } },
        yaxis: { title: 'k_eff', showgrid: showGrid, gridcolor: gridColor,
                 showline: true, linewidth: 1, linecolor: 'black', mirror: true }
    }, { displayModeBar: true, responsive: true });
    
    Plotly.newPlot('nkEmtCombinedPlot', tracesCombinedEmt, {
        ...baseLayout,
        title: { text: `Constantes Ópticas Efectivas (EMT)${titleSuffix}`, font: { size: 14 } },
        yaxis: {
            title: 'n_eff', titlefont: { color: '#e41a1c' }, tickfont: { color: '#e41a1c' },
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true, side: 'left'
        },
        yaxis2: {
            title: 'k_eff', titlefont: { color: '#377eb8' }, tickfont: { color: '#377eb8' },
            overlaying: 'y', side: 'right', showgrid: false,
            showline: true, linewidth: 1, linecolor: 'black'
        },
        legend: { x: 0.5, y: -0.15, xanchor: 'center', orientation: 'h' },
        margin: { l: 60, r: 60, t: 50, b: 80 }
    }, { displayModeBar: true, responsive: true });
    
    console.log(`✅ Gráficas n,k EMT renderizadas para: ${selectedValue}`);
}

// ==========================================
// GRÁFICAS DE REFLECTANCIA (R, Rs, Rp)
// ==========================================

function renderReflectanceGraphs() {
    console.log('📈 Renderizando gráficas de Reflectancia...');
    
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.R) {
        showNoDataMessage('rPlot', 'Calcule los valores teóricos para visualizar R vs λ');
        showNoDataMessage('rsPlot', 'Calcule los valores teóricos para visualizar Rs vs λ');
        showNoDataMessage('rpPlot', 'Calcule los valores teóricos para visualizar Rp vs λ');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    
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
    
    const baseLayout = {
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: { 
            title: 'R',
            range: [0, 1.05],
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        margin: { l: 60, r: 30, t: 50, b: 50 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    // R promedio (energético)
    Plotly.newPlot('rPlot', [{
        x: wavelengths,
        y: traData.R,
        mode: 'lines',
        name: 'R (promedio)',
        line: { width: 2, color: '#dc3545' }
    }], {
        ...baseLayout,
        title: { text: 'Reflectancia Promedio R = (Rs + Rp) / 2', font: { size: 14 } }
    }, { displayModeBar: true, responsive: true });
    
    // Rs (polarización S)
    if (traData.Rs) {
        Plotly.newPlot('rsPlot', [{
            x: wavelengths,
            y: traData.Rs,
            mode: 'lines',
            name: 'Rs (pol. S)',
            line: { width: 2, color: '#e74c3c' }
        }], {
            ...baseLayout,
            title: { text: 'Reflectancia Rs (Polarización S)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'Rs' }
        }, { displayModeBar: true, responsive: true });
    }
    
    // Rp (polarización P)
    if (traData.Rp) {
        Plotly.newPlot('rpPlot', [{
            x: wavelengths,
            y: traData.Rp,
            mode: 'lines',
            name: 'Rp (pol. P)',
            line: { width: 2, color: '#c0392b' }
        }], {
            ...baseLayout,
            title: { text: 'Reflectancia Rp (Polarización P)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'Rp' }
        }, { displayModeBar: true, responsive: true });
    }
    
    console.log('✅ Gráficas de Reflectancia renderizadas');
}


/**
 * ⭐ NUEVO: Puebla el selector de capas EMT incluyendo ambient/substrate si tienen EMT
 */
function populateNKEmtLayerSelector(emtData) {
    const selector = document.getElementById('nkEmtLayerSelect');
    if (!selector) return;
    
    const currentValue = selector.value;
    selector.innerHTML = '<option value="all">Todas las capas EMT</option>';
    
    for (const [layerName, data] of Object.entries(emtData)) {
        if (layerName === 'wavelengths') continue;
        const option = document.createElement('option');
        option.value = layerName;
        // Detectar si es ambiente o sustrato para mostrar ícono
        if (layerName.toLowerCase().includes('ambient') || layerName.toLowerCase().includes('incidente') || layerName.toLowerCase().includes('medio')) {
            option.textContent = `🌐 ${layerName}`;
        } else if (layerName.toLowerCase().includes('sustrat') || layerName.toLowerCase().includes('substrate')) {
            option.textContent = `🪨 ${layerName}`;
        } else {
            option.textContent = layerName;
        }
        selector.appendChild(option);
    }
    
    // Restaurar selección si sigue siendo válida
    if (currentValue && selector.querySelector(`option[value="${currentValue}"]`)) {
        selector.value = currentValue;
    }
}


// ⭐ NUEVO: Handler para el selector EMT
function updateNKEmtGraphsForLayer() {
    renderNKEmtGraphs();
}
window.updateNKEmtGraphsForLayer = updateNKEmtGraphsForLayer;

// ==========================================
// GRÁFICAS DE TRANSMITANCIA (T, Ts, Tp)
// ==========================================

function renderTransmittanceGraphs() {
    console.log('📈 Renderizando gráficas de Transmitancia...');
    
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.T) {
        showNoDataMessage('tPlot', 'Calcule los valores teóricos para visualizar T vs λ');
        showNoDataMessage('tsPlot', 'Calcule los valores teóricos para visualizar Ts vs λ');
        showNoDataMessage('tpPlot', 'Calcule los valores teóricos para visualizar Tp vs λ');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    
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
    
    const baseLayout = {
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: { 
            title: 'T',
            range: [0, 1.05],
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        margin: { l: 60, r: 30, t: 50, b: 50 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    // T promedio
    Plotly.newPlot('tPlot', [{
        x: wavelengths,
        y: traData.T,
        mode: 'lines',
        name: 'T (promedio)',
        line: { width: 2, color: '#28a745' }
    }], {
        ...baseLayout,
        title: { text: 'Transmitancia Promedio T = (Ts + Tp) / 2', font: { size: 14 } }
    }, { displayModeBar: true, responsive: true });
    
    // Ts
    if (traData.Ts) {
        Plotly.newPlot('tsPlot', [{
            x: wavelengths,
            y: traData.Ts,
            mode: 'lines',
            name: 'Ts (pol. S)',
            line: { width: 2, color: '#2ecc71' }
        }], {
            ...baseLayout,
            title: { text: 'Transmitancia Ts (Polarización S)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'Ts' }
        }, { displayModeBar: true, responsive: true });
    }
    
    // Tp
    if (traData.Tp) {
        Plotly.newPlot('tpPlot', [{
            x: wavelengths,
            y: traData.Tp,
            mode: 'lines',
            name: 'Tp (pol. P)',
            line: { width: 2, color: '#27ae60' }
        }], {
            ...baseLayout,
            title: { text: 'Transmitancia Tp (Polarización P)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'Tp' }
        }, { displayModeBar: true, responsive: true });
    }
    
    console.log('✅ Gráficas de Transmitancia renderizadas');
}

// ==========================================
// GRÁFICAS DE ABSORBANCIA (A, As, Ap)
// ==========================================

function renderAbsorbanceGraphs() {
    console.log('📈 Renderizando gráficas de Absorbancia...');
    
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.A) {
        showNoDataMessage('aPlot', 'Calcule los valores teóricos para visualizar A vs λ');
        showNoDataMessage('asPlot', 'Calcule los valores teóricos para visualizar As vs λ');
        showNoDataMessage('apPlot', 'Calcule los valores teóricos para visualizar Ap vs λ');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    
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
    
    const baseLayout = {
        xaxis: { 
            title: 'Longitud de onda (nm)',
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        yaxis: { 
            title: 'A',
            range: [0, 1.05],
            showgrid: showGrid, gridcolor: gridColor,
            showline: true, linewidth: 1, linecolor: 'black', mirror: true
        },
        margin: { l: 60, r: 30, t: 50, b: 50 },
        plot_bgcolor: bgColor,
        paper_bgcolor: 'white',
        hovermode: 'x unified'
    };
    
    // A total
    Plotly.newPlot('aPlot', [{
        x: wavelengths,
        y: traData.A,
        mode: 'lines',
        name: 'A (total)',
        line: { width: 2, color: '#0d6efd' }
    }], {
        ...baseLayout,
        title: { text: 'Absorbancia Total A = 1 - R - T', font: { size: 14 } }
    }, { displayModeBar: true, responsive: true });
    
    // As
    if (traData.As) {
        Plotly.newPlot('asPlot', [{
            x: wavelengths,
            y: traData.As,
            mode: 'lines',
            name: 'As (pol. S)',
            line: { width: 2, color: '#3498db' }
        }], {
            ...baseLayout,
            title: { text: 'Absorbancia As (Polarización S)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'As' }
        }, { displayModeBar: true, responsive: true });
    }
    
    // Ap
    if (traData.Ap) {
        Plotly.newPlot('apPlot', [{
            x: wavelengths,
            y: traData.Ap,
            mode: 'lines',
            name: 'Ap (pol. P)',
            line: { width: 2, color: '#2980b9' }
        }], {
            ...baseLayout,
            title: { text: 'Absorbancia Ap (Polarización P)', font: { size: 14 } },
            yaxis: { ...baseLayout.yaxis, title: 'Ap' }
        }, { displayModeBar: true, responsive: true });
    }
    
    console.log('✅ Gráficas de Absorbancia renderizadas');
}

/**
 * Muestra mensaje de "sin datos"
 */
function showNoDataMessage(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="no-data" style="padding: 40px; text-align: center; color: #666; font-style: italic; background: #f8f9fa; border-radius: 8px; border: 1px dashed #ddd;">${message}</div>`;
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
    
    // Habilitar todas las opciones
    ['nk-layers', 'nk-emt', 'reflectance', 'transmittance', 'absorbance'].forEach(cls => {
        const option = document.querySelector(`.graph-dropdown-item.${cls}`);
        if (option) option.classList.remove('disabled');
    });
    
    console.log('✅ Selector avanzado habilitado');
}

/**
 * Deshabilita opciones del selector
 */
function disableAdvancedGraphOptions() {
    ['nk-layers', 'nk-emt', 'reflectance', 'transmittance', 'absorbance'].forEach(cls => {
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
    
    const wavelengths = opticalConstants.wavelengths || opticalConstants.wavelength || window.uploadedWavelengths || [];
    const layers = opticalConstants.layers;
    
    let header = 'Wavelength_nm';
    
    if (opticalConstants.ambient) {
        header += ',n_ambiente,k_ambiente';
    }
    
    layers.forEach((layer, idx) => {
        const name = (layer.name || `Capa${idx+1}`).replace(/[^a-zA-Z0-9]/g, '_');
        header += `,n_${name},k_${name}`;
    });
    
    if (opticalConstants.substrate) {
        header += ',n_sustrato,k_sustrato';
    }
    
    let csvContent = header + '\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        let row = `${wavelengths[i]}`;
        
        if (opticalConstants.ambient) {
            const n_amb = Array.isArray(opticalConstants.ambient.n) ? opticalConstants.ambient.n[i] : opticalConstants.ambient.n;
            const k_amb = Array.isArray(opticalConstants.ambient.k) ? opticalConstants.ambient.k[i] : (opticalConstants.ambient.k || 0);
            row += `,${n_amb},${k_amb}`;
        }
        
        layers.forEach(layer => {
            row += `,${layer.n[i]},${layer.k[i]}`;
        });
        
        if (opticalConstants.substrate) {
            const n_sub = Array.isArray(opticalConstants.substrate.n) ? opticalConstants.substrate.n[i] : opticalConstants.substrate.n;
            const k_sub = Array.isArray(opticalConstants.substrate.k) ? opticalConstants.substrate.k[i] : (opticalConstants.substrate.k || 0);
            row += `,${n_sub},${k_sub}`;
        }
        
        csvContent += row + '\n';
    }
    
    downloadCSVFile(csvContent, `constantes_opticas_nk_${new Date().toISOString().slice(0,10)}.csv`);
}

// EMT downloads
function downloadNEmtPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('nEmtPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `n_efectivo_emt_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadKEmtPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('kEmtPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `k_efectivo_emt_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadNKEmtCombinedPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('nkEmtCombinedPlot', {
        format: 'png', width: 1200, height: 600,
        filename: `constantes_opticas_emt_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadNKEmtDataCSV() {
    const optResults = window.optimizationResults || null;
    let emtData = optResults?.emt_data || window.theoreticalEMTData;
    
    if (!emtData || Object.keys(emtData).length === 0) {
        alert('No hay datos EMT para descargar');
        return;
    }
    
    const wavelengths = emtData.wavelengths || window.uploadedWavelengths || [];
    
    let header = 'Wavelength_nm';
    const layerNames = [];
    
    for (const [layerName, data] of Object.entries(emtData)) {
        if (layerName === 'wavelengths') continue;
        layerNames.push(layerName);
        const safeName = layerName.replace(/[^a-zA-Z0-9]/g, '_');
        header += `,n_eff_${safeName},k_eff_${safeName}`;
    }
    
    let csvContent = header + '\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        let row = `${wavelengths[i]}`;
        
        for (const layerName of layerNames) {
            const data = emtData[layerName];
            const n_eff = data.n_effective ? data.n_effective[i] : 0;
            const k_eff = data.k_effective ? data.k_effective[i] : 0;
            row += `,${n_eff},${k_eff}`;
        }
        
        csvContent += row + '\n';
    }
    
    downloadCSVFile(csvContent, `constantes_opticas_emt_${new Date().toISOString().slice(0,10)}.csv`);
}

// Reflectance downloads
function downloadRPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('rPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `reflectancia_R_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadRsPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('rsPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `reflectancia_Rs_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadRpPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('rpPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `reflectancia_Rp_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadReflectanceCSV() {
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.R) {
        alert('No hay datos de reflectancia para descargar');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    
    let csvContent = 'Wavelength_nm,R,Rs,Rp\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        const R = traData.R ? traData.R[i] : '';
        const Rs = traData.Rs ? traData.Rs[i] : '';
        const Rp = traData.Rp ? traData.Rp[i] : '';
        csvContent += `${wavelengths[i]},${R},${Rs},${Rp}\n`;
    }
    
    downloadCSVFile(csvContent, `reflectancia_${new Date().toISOString().slice(0,10)}.csv`);
}

// Transmittance downloads
function downloadTPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('tPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `transmitancia_T_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadTsPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('tsPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `transmitancia_Ts_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadTpPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('tpPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `transmitancia_Tp_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadTransmittanceCSV() {
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.T) {
        alert('No hay datos de transmitancia para descargar');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    
    let csvContent = 'Wavelength_nm,T,Ts,Tp\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        const T = traData.T ? traData.T[i] : '';
        const Ts = traData.Ts ? traData.Ts[i] : '';
        const Tp = traData.Tp ? traData.Tp[i] : '';
        csvContent += `${wavelengths[i]},${T},${Ts},${Tp}\n`;
    }
    
    downloadCSVFile(csvContent, `transmitancia_${new Date().toISOString().slice(0,10)}.csv`);
}

// Absorbance downloads
function downloadAPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('aPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `absorbancia_A_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadAsPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('asPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `absorbancia_As_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadApPlotPNG() {
    if (typeof Plotly === 'undefined') return;
    Plotly.downloadImage('apPlot', {
        format: 'png', width: 1000, height: 500,
        filename: `absorbancia_Ap_${new Date().toISOString().slice(0,10)}`
    });
}

function downloadAbsorbanceCSV() {
    const optResults = window.optimizationResults || null;
    let traData = optResults?.tra_spectra || window.theoreticalTRASpectra;
    
    if (!traData || !traData.A) {
        alert('No hay datos de absorbancia para descargar');
        return;
    }
    
    const wavelengths = traData.wavelength || traData.wavelengths || window.uploadedWavelengths || [];
    
    let csvContent = 'Wavelength_nm,A,As,Ap\n';
    
    for (let i = 0; i < wavelengths.length; i++) {
        const A = traData.A ? traData.A[i] : '';
        const As = traData.As ? traData.As[i] : '';
        const Ap = traData.Ap ? traData.Ap[i] : '';
        csvContent += `${wavelengths[i]},${A},${As},${Ap}\n`;
    }
    
    downloadCSVFile(csvContent, `absorbancia_${new Date().toISOString().slice(0,10)}.csv`);
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
    console.log('🎨 Inicializando sistema de dropdown de gráficas v4...');
    
    selectGraphType('psi-delta');
    
    const showGridAdvanced = document.getElementById('showGridAdvanced');
    const whiteBackgroundAdvanced = document.getElementById('whiteBackgroundAdvanced');
    
    if (showGridAdvanced) {
        showGridAdvanced.addEventListener('change', updateAllGraphs);
    }
    
    if (whiteBackgroundAdvanced) {
        whiteBackgroundAdvanced.addEventListener('change', updateAllGraphs);
    }
    
    const includeAmbient = document.getElementById('includeAmbientNK');
    const includeSubstrate = document.getElementById('includeSubstrateNK');
    
    if (includeAmbient) {
        includeAmbient.addEventListener('change', updateNKOptions);
    }
    
    if (includeSubstrate) {
        includeSubstrate.addEventListener('change', updateNKOptions);
    }
    
    console.log('✅ Sistema de dropdown v4 inicializado');
});

// ==========================================
// EXPONER FUNCIONES GLOBALMENTE
// ==========================================
window.toggleGraphDropdown = toggleGraphDropdown;
window.selectGraphType = selectGraphType;
window.updateNKGraphsForLayer = updateNKGraphsForLayer;
window.updateNKOptions = updateNKOptions;
window.updateAllGraphs = updateAllGraphs;
window.enableAdvancedGraphSelector = enableAdvancedGraphSelector;
window.renderNKGraphs = renderNKGraphs;
window.renderNKEmtGraphs = renderNKEmtGraphs;
window.renderReflectanceGraphs = renderReflectanceGraphs;
window.renderTransmittanceGraphs = renderTransmittanceGraphs;
window.renderAbsorbanceGraphs = renderAbsorbanceGraphs;

// Descargas Psi/Delta
window.downloadPsiPNG = downloadPsiPNG;
window.downloadDeltaPNG = downloadDeltaPNG;
window.downloadCombinedPNG = downloadCombinedPNG;
window.downloadAllPDF = downloadAllPDF;

// Descargas n,k
window.downloadNPlotPNG = downloadNPlotPNG;
window.downloadKPlotPNG = downloadKPlotPNG;
window.downloadNKCombinedPNG = downloadNKCombinedPNG;
window.downloadNKDataCSV = downloadNKDataCSV;

// Descargas EMT
window.downloadNEmtPlotPNG = downloadNEmtPlotPNG;
window.downloadKEmtPlotPNG = downloadKEmtPlotPNG;
window.downloadNKEmtCombinedPNG = downloadNKEmtCombinedPNG;
window.downloadNKEmtDataCSV = downloadNKEmtDataCSV;

// Descargas Reflectancia
window.downloadRPlotPNG = downloadRPlotPNG;
window.downloadRsPlotPNG = downloadRsPlotPNG;
window.downloadRpPlotPNG = downloadRpPlotPNG;
window.downloadReflectanceCSV = downloadReflectanceCSV;

// Descargas Transmitancia
window.downloadTPlotPNG = downloadTPlotPNG;
window.downloadTsPlotPNG = downloadTsPlotPNG;
window.downloadTpPlotPNG = downloadTpPlotPNG;
window.downloadTransmittanceCSV = downloadTransmittanceCSV;

// Descargas Absorbancia
window.downloadAPlotPNG = downloadAPlotPNG;
window.downloadAsPlotPNG = downloadAsPlotPNG;
window.downloadApPlotPNG = downloadApPlotPNG;
window.downloadAbsorbanceCSV = downloadAbsorbanceCSV;

console.log('✅ Módulo de dropdown de gráficas v4.0 cargado');