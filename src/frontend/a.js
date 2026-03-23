function renderNKEmtGraphs() {
    console.log('Renderizando gráficas n y k efectivos (EMT)...');
    
    const optResults = window.optimizationResults || null;
    
    let emtData = null;
    
    // ⭐ FIX: theoreticalEMTData primero (siempre tiene los datos más recientes)
    if (window.theoreticalEMTData && Object.keys(window.theoreticalEMTData).filter(k => k !== 'wavelengths').length > 0) {
        emtData = window.theoreticalEMTData;
        console.log('EMT data desde window.theoreticalEMTData');
    }
    else if (optResults?.emt_data && Object.keys(optResults.emt_data).filter(k => k !== 'wavelengths').length > 0) {
        emtData = optResults.emt_data;
        console.log('EMT data desde optimizationResults.emt_data');
    }
    // Fuente 3: extraer de optical_constants.layers las capas heterogéneas
    else {
        const optConst = window.theoreticalOpticalConstants || optResults?.optical_constants;
        if (optConst?.layers) {
            const wavelengths = optConst.wavelengths || optConst.wavelength || window.uploadedWavelengths || [];
            const builtEmt = { wavelengths };
            
            optConst.layers.forEach((layer, idx) => {
                const isHeterogeneous = layer.n_eff || layer.k_eff ||
                    layer.is_heterogeneous ||
                    layer.type === 'heterogeneous' ||
                    layer.layer_type === 'heterogeneous';
                if (isHeterogeneous) {
                    const layerName = layer.name || `Capa ${idx + 1}`;
                    builtEmt[layerName] = {
                        wavelengths,
                        n_effective: layer.n_eff || layer.n || [],
                        k_effective: layer.k_eff || layer.k || []
                    };
                    console.log(`Capa heterogénea detectada: ${layerName}`);
                }
            });
            
            if (Object.keys(builtEmt).filter(k => k !== 'wavelengths').length > 0) {
                emtData = builtEmt;
                console.log('EMT data construido desde optical_constants.layers:', Object.keys(builtEmt));
            }
        }
    }
    
    if (!emtData || Object.keys(emtData).filter(k => k !== 'wavelengths').length === 0) {
        showNoDataMessage('nEmtPlot',        'No hay capas heterogéneas (EMT) en el modelo.');
        showNoDataMessage('kEmtPlot',        'No hay capas heterogéneas (EMT) en el modelo.');
        showNoDataMessage('nkEmtCombinedPlot','No hay capas heterogéneas (EMT) en el modelo.');
        return;
    }
    
    populateNKEmtLayerSelector(emtData);
    
    const selector     = document.getElementById('nkEmtLayerSelect');
    const selectedValue = selector?.value || 'all';
    const wavelengths  = emtData.wavelengths || window.uploadedWavelengths || [];
    
    if (!wavelengths || wavelengths.length === 0) {
        console.warn('No hay wavelengths disponibles para plotear n,k EMT');
        return;
    }
    
    if (typeof Plotly === 'undefined') { console.error('Plotly no está cargado'); return; }
    
    const showGrid        = document.getElementById('showGridAdvanced')?.checked ?? document.getElementById('showGrid')?.checked ?? true;
    const whiteBackground = document.getElementById('whiteBackgroundAdvanced')?.checked ?? document.getElementById('whiteBackground')?.checked ?? true;
    const bgColor   = whiteBackground ? 'white' : '#f5f5f5';
    const gridColor = showGrid ? '#ddd' : 'rgba(0,0,0,0)';
    const colors    = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'];
    
    const tracesNEmt = [], tracesKEmt = [], tracesCombinedEmt = [];
    let colorIndex = 0;
    
    for (const [layerName, data] of Object.entries(emtData)) {
        if (layerName === 'wavelengths') continue;
        if (selectedValue !== 'all' && layerName !== selectedValue) continue;
        
        const color = colors[colorIndex % colors.length];
        colorIndex++;
        
        if (data.n_effective?.length > 0) {
            tracesNEmt.push({ x: data.wavelengths || wavelengths, y: data.n_effective, mode: 'lines', name: layerName, line: { width: 2, color } });
            tracesCombinedEmt.push({ x: data.wavelengths || wavelengths, y: data.n_effective, mode: 'lines', name: `n_eff - ${layerName}`, line: { width: 2, color }, yaxis: 'y1' });
        }
        if (data.k_effective?.length > 0) {
            tracesKEmt.push({ x: data.wavelengths || wavelengths, y: data.k_effective, mode: 'lines', name: layerName, line: { width: 2, color } });
            tracesCombinedEmt.push({ x: data.wavelengths || wavelengths, y: data.k_effective, mode: 'lines', name: `k_eff - ${layerName}`, line: { width: 2, color, dash: 'dash' }, yaxis: 'y2' });
        }
    }
    
    if (tracesNEmt.length === 0) {
        showNoDataMessage('nEmtPlot',        'No hay datos de n efectivo para la selección actual');
        showNoDataMessage('kEmtPlot',        'No hay datos de k efectivo para la selección actual');
        showNoDataMessage('nkEmtCombinedPlot','No hay datos EMT para la selección actual');
        return;
    }
    
    const titleSuffix = selectedValue !== 'all' ? ` - ${selectedValue}` : '';
    const baseLayout = {
        xaxis: { title: 'Longitud de onda (nm)', showgrid: showGrid, gridcolor: gridColor, showline: true, linewidth: 1, linecolor: 'black', mirror: true },
        legend: { x: 1.02, y: 1, xanchor: 'left' },
        margin: { l: 60, r: 120, t: 50, b: 50 },
        plot_bgcolor: bgColor, paper_bgcolor: 'white', hovermode: 'x unified'
    };
    
    Plotly.newPlot('nEmtPlot', tracesNEmt, { ...baseLayout, title: { text: `Índice de Refracción Efectivo (n_eff) - EMT${titleSuffix}`, font: { size: 14 } }, yaxis: { title: 'n_eff', showgrid: showGrid, gridcolor: gridColor, showline: true, linewidth: 1, linecolor: 'black', mirror: true } }, { displayModeBar: true, responsive: true });
    Plotly.newPlot('kEmtPlot', tracesKEmt, { ...baseLayout, title: { text: `Coeficiente de Extinción Efectivo (k_eff) - EMT${titleSuffix}`, font: { size: 14 } }, yaxis: { title: 'k_eff', showgrid: showGrid, gridcolor: gridColor, showline: true, linewidth: 1, linecolor: 'black', mirror: true } }, { displayModeBar: true, responsive: true });
    Plotly.newPlot('nkEmtCombinedPlot', tracesCombinedEmt, {
        title: { text: `Constantes Ópticas Efectivas (EMT)${titleSuffix}`, font: { size: 14 } },
        xaxis: { title: 'Longitud de onda (nm)', showgrid: showGrid, gridcolor: gridColor, showline: true, linewidth: 1, linecolor: 'black', mirror: true },
        yaxis: { title: 'n_eff', titlefont: { color: '#e41a1c' }, tickfont: { color: '#e41a1c' }, showgrid: showGrid, gridcolor: gridColor, showline: true, linewidth: 1, linecolor: 'black', mirror: true, side: 'left' },
        yaxis2: { title: 'k_eff', titlefont: { color: '#377eb8' }, tickfont: { color: '#377eb8' }, overlaying: 'y', side: 'right', showgrid: false, showline: true, linewidth: 1, linecolor: 'black' },
        legend: { x: 1.02, y: 1, xanchor: 'left' },
        margin: { l: 60, r: 150, t: 50, b: 50 },
        plot_bgcolor: bgColor, paper_bgcolor: 'white', hovermode: 'x unified'
    }, { displayModeBar: true, responsive: true });
    
    console.log(`✅ Gráficas n,k EMT renderizadas para: ${selectedValue}`);
}