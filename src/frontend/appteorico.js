// ============================================================================
// CONFIGURACIÓN PARA PRUEBAS TEÓRICAS
// ============================================================================

// ⚠️ IMPORTANTE: Declarar TODAS las variables globales primero
let theoreticalMode = true;
let theoreticalConfig = {
    wavelengths: [],
    angle: 70,
    outputs: {
        psi_delta: true,
        reflectance: true,
        transmittance: true,
        absorbance: true,
        absorbance_layer: false
    }
};

// Variables del código original (necesarias para compatibilidad)
let currentData = null;
let uploadedFileData = null;
let uploadedWavelengths = [];
let savedModel = null;

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔬 Modo de Pruebas Teóricas activado');
    initializeTheoreticalMode();
    
    // Deshabilitar event listeners del modo upload que no se usan
    const inputFile = document.getElementById('inputFile');
    if (inputFile) {
        inputFile.removeEventListener('change', uploadFile);
        inputFile.style.display = 'none';
    }
    
    const showGrid = document.getElementById('showGrid');
    const whiteBackground = document.getElementById('whiteBackground');
    if (showGrid) {
        showGrid.removeEventListener('change', updateGraphSettings);
        showGrid.style.display = 'none';
    }
    if (whiteBackground) {
        whiteBackground.removeEventListener('change', updateGraphSettings);
        whiteBackground.style.display = 'none';
    }
});

function initializeTheoreticalMode() {
    // Ocultar/deshabilitar elementos no necesarios en modo teórico
    const inputFile = document.getElementById('inputFile');
    if (inputFile) {
        inputFile.style.display = 'none';
    }
    
    const showGrid = document.getElementById('showGrid');
    const whiteBackground = document.getElementById('whiteBackground');
    if (showGrid) showGrid.style.display = 'none';
    if (whiteBackground) whiteBackground.style.display = 'none';
    
    // Wavelength method selector
    const methodSelect = document.getElementById('wavelength-method');
    if (methodSelect) {
        methodSelect.addEventListener('change', function() {
            document.getElementById('wavelength-range-option').style.display = 
                this.value === 'range' ? 'block' : 'none';
            document.getElementById('wavelength-single-option').style.display = 
                this.value === 'single' ? 'block' : 'none';
        });
    }
    
    // Validación de ángulo en tiempo real
    const angleInput = document.getElementById('incident-angle');
    if (angleInput) {
        angleInput.addEventListener('input', validateTheoreticalAngle);
        angleInput.addEventListener('change', validateTheoreticalAngle);
    }
    
    // Botón continuar con el modelo
    const continueBtn = document.getElementById('btn-continue-model');
    if (continueBtn) {
        // Remover event listeners anteriores
        const newBtn = continueBtn.cloneNode(true);
        continueBtn.parentNode.replaceChild(newBtn, continueBtn);
        
        newBtn.addEventListener('click', openTheoreticalModelWizard);
    }
    
    // Checkboxes de salidas
    ['output-psi-delta', 'output-reflectance', 'output-transmittance', 'output-absorbance', 'output-absorbance-layer'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                theoreticalConfig.outputs[id.replace('output-', '').replace('-', '_')] = this.checked;
            });
        }
    });
}

function validateTheoreticalAngle() {
    const angle = parseFloat(document.getElementById('incident-angle').value);
    const warning = document.getElementById('angle-warning');
    const continueBtn = document.getElementById('btn-continue-model');
    
    if (isNaN(angle)) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> Debe ingresar un ángulo válido.';
        continueBtn.disabled = true;
        return false;
    }
    
    if (angle > 90) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Advertencia:</strong> El ángulo de incidencia no puede superar los 90 grados.';
        continueBtn.disabled = true;
        return false;
    } else if (angle < 0) {
        warning.style.display = 'block';
        warning.innerHTML = '<strong>Error:</strong> El ángulo debe ser mayor o igual a 0 grados.';
        continueBtn.disabled = true;
        return false;
    } else {
        warning.style.display = 'none';
        continueBtn.disabled = false;
        return true;
    }
}

function getTheoreticalWavelengths() {
    const method = document.getElementById('wavelength-method').value;
    let wavelengths = [];
    
    if (method === 'range') {
        const min = parseFloat(document.getElementById('wavelength-min').value);
        const max = parseFloat(document.getElementById('wavelength-max').value);
        const steps = parseInt(document.getElementById('wavelength-steps').value);
        
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
    } else {
        const single = parseFloat(document.getElementById('wavelength-single').value);
        if (isNaN(single)) {
            throw new Error("Debe ingresar una longitud de onda válida");
        }
        wavelengths = [single];
    }
    
    return wavelengths;
}

function openTheoreticalModelWizard() {
    try {
        // Validar ángulo
        if (!validateTheoreticalAngle()) {
            alert('Error: El ángulo de incidencia no es válido (debe estar entre 0° y 90°).');
            return;
        }
        
        // Obtener wavelengths
        const wavelengths = getTheoreticalWavelengths();
        const angle = parseFloat(document.getElementById('incident-angle').value);
        
        // Guardar configuración
        theoreticalConfig.wavelengths = wavelengths;
        theoreticalConfig.angle = angle;
        uploadedWavelengths = wavelengths; // Para compatibilidad con el wizard existente
        
        // Verificar que al menos una salida esté seleccionada
        const hasOutput = Object.values(theoreticalConfig.outputs).some(v => v === true);
        if (!hasOutput) {
            alert('Error: Debe seleccionar al menos una propiedad para calcular.');
            return;
        }
        
        console.log('📊 Configuración teórica:', theoreticalConfig);
        
        // Pre-configurar el wizard
        document.getElementById('input-angle').value = angle;
        
        // Deshabilitar opción de "usar longitudes del archivo"
        const wlOptionFile = document.getElementById('wl-option-file');
        if (wlOptionFile) {
            wlOptionFile.disabled = true;
            wlOptionFile.checked = false;
        }
        
        // Activar opción de rango y pre-configurar
        const wlOptionRange = document.getElementById('wl-option-range');
        if (wlOptionRange) {
            wlOptionRange.checked = true;
            wlOptionRange.dispatchEvent(new Event('change'));
        }
        
        // Abrir el modal del wizard
        const modal = new bootstrap.Modal(document.getElementById('modelWizardModal'));
        modal.show();
        
    } catch (error) {
        alert('Error: ' + error.message);
        console.error(error);
    }
}

// Interceptar la función de optimización para modo teórico
const originalOptimizeModel = window.optimizeModel;
window.optimizeModel = async function() {
    if (theoreticalMode) {
        console.log('🔬 Ejecutando cálculo teórico...');
        return await calculateTheoreticalProperties();
    } else if (originalOptimizeModel) {
        return await originalOptimizeModel();
    }
};

async function calculateTheoreticalProperties() {
    try {
        // Recopilar modelo óptico usando la función existente
        const model = await collectOpticalModelData();
        
        const payload = {
            wavelengths: theoreticalConfig.wavelengths,
            angle: theoreticalConfig.angle,
            model: model,
            outputs: theoreticalConfig.outputs
        };
        
        console.log('📤 Enviando a /api/theoretical:', payload);
        
        // Mostrar indicador de carga
        const resultsContainer = document.getElementById('theoretical-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<div style="padding: 40px; text-align: center;"><div class="spinner-border text-primary" role="status"></div><p class="mt-3">Calculando propiedades teóricas...</p></div>';
        }
        
        const response = await fetch('/api/theoretical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || error.error || 'Error en el cálculo');
        }
        
        const results = await response.json();
        console.log('📥 Resultados teóricos recibidos:', results);
        
        // Mostrar resultados
        displayTheoreticalResults(results);
        
        // Cerrar wizard
        const modal = bootstrap.Modal.getInstance(document.getElementById('modelWizardModal'));
        if (modal) modal.hide();
        
        alert('✅ Cálculo teórico completado exitosamente');
        
    } catch (error) {
        console.error('❌ Error en cálculo teórico:', error);
        alert('Error en el cálculo teórico: ' + error.message);
        
        const resultsContainer = document.getElementById('theoretical-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: #dc3545;"><h4>Error en el cálculo</h4><p>${error.message}</p></div>`;
        }
    }
}

function displayTheoreticalResults(results) {
    const container = document.getElementById('theoretical-results-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const wavelengths = results.wavelengths;
    
    // Ψ y Δ
    if (results.psi && results.delta) {
        const psiDiv = document.createElement('div');
        psiDiv.style.marginBottom = '20px';
        psiDiv.innerHTML = '<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><h5>Ψ en función de λ</h5><div id="graph-psi-theoretical"></div></div>';
        container.appendChild(psiDiv);
        
        Plotly.newPlot('graph-psi-theoretical', [{
            x: wavelengths,
            y: results.psi,
            mode: 'lines+markers',
            name: 'Ψ',
            line: { width: 2 },
            marker: { size: 5 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Ψ (grados)' },
            margin: { t: 20, r: 20, b: 50, l: 60 }
        }, { responsive: true });
        
        const deltaDiv = document.createElement('div');
        deltaDiv.style.marginBottom = '20px';
        deltaDiv.innerHTML = '<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><h5>Δ en función de λ</h5><div id="graph-delta-theoretical"></div></div>';
        container.appendChild(deltaDiv);
        
        Plotly.newPlot('graph-delta-theoretical', [{
            x: wavelengths,
            y: results.delta,
            mode: 'lines+markers',
            name: 'Δ',
            line: { width: 2 },
            marker: { size: 5 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Δ (grados)' },
            margin: { t: 20, r: 20, b: 50, l: 60 }
        }, { responsive: true });
    }
    
    // Reflectancia
    if (results.reflectance) {
        const rDiv = document.createElement('div');
        rDiv.style.marginBottom = '20px';
        rDiv.innerHTML = '<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><h5>Reflectancia en función de λ</h5><div id="graph-r-theoretical"></div></div>';
        container.appendChild(rDiv);
        
        Plotly.newPlot('graph-r-theoretical', [{
            x: wavelengths,
            y: results.reflectance,
            mode: 'lines+markers',
            name: 'R',
            line: { width: 2 },
            marker: { size: 5 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Reflectancia' },
            margin: { t: 20, r: 20, b: 50, l: 60 }
        }, { responsive: true });
    }
    
    // Transmitancia
    if (results.transmittance) {
        const tDiv = document.createElement('div');
        tDiv.style.marginBottom = '20px';
        tDiv.innerHTML = '<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><h5>Transmitancia en función de λ</h5><div id="graph-t-theoretical"></div></div>';
        container.appendChild(tDiv);
        
        Plotly.newPlot('graph-t-theoretical', [{
            x: wavelengths,
            y: results.transmittance,
            mode: 'lines+markers',
            name: 'T',
            line: { width: 2 },
            marker: { size: 5 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Transmitancia' },
            margin: { t: 20, r: 20, b: 50, l: 60 }
        }, { responsive: true });
    }
    
    // Absorbancia
    if (results.absorbance) {
        const aDiv = document.createElement('div');
        aDiv.style.marginBottom = '20px';
        aDiv.innerHTML = '<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><h5>Absorbancia en función de λ</h5><div id="graph-a-theoretical"></div></div>';
        container.appendChild(aDiv);
        
        Plotly.newPlot('graph-a-theoretical', [{
            x: wavelengths,
            y: results.absorbance,
            mode: 'lines+markers',
            name: 'A',
            line: { width: 2 },
            marker: { size: 5 }
        }], {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Absorbancia' },
            margin: { t: 20, r: 20, b: 50, l: 60 }
        }, { responsive: true });
    }
    
    // Absorbancia por capa
    if (results.absorbance_per_layer) {
        const alDiv = document.createElement('div');
        alDiv.style.marginBottom = '20px';
        alDiv.innerHTML = '<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><h5>Absorbancia por Capa en función de λ</h5><div id="graph-al-theoretical"></div></div>';
        container.appendChild(alDiv);
        
        const traces = [];
        for (const [layerName, absValues] of Object.entries(results.absorbance_per_layer)) {
            traces.push({
                x: wavelengths,
                y: absValues,
                mode: 'lines+markers',
                name: layerName,
                marker: { size: 5 }
            });
        }
        
        Plotly.newPlot('graph-al-theoretical', traces, {
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Absorbancia' },
            margin: { t: 20, r: 20, b: 50, l: 60 }
        }, { responsive: true });
    }
    
    // Botón descargar
    const downloadDiv = document.createElement('div');
    downloadDiv.style.textAlign = 'center';
    downloadDiv.style.marginTop = '20px';
    downloadDiv.innerHTML = '<button class="btn btn-success btn-lg" onclick="downloadTheoreticalResultsCSV()">💾 Descargar Resultados (CSV)</button>';
    container.appendChild(downloadDiv);
    
    // Guardar resultados globalmente para descarga
    window.theoreticalResultsData = results;
}

function downloadTheoreticalResultsCSV() {
    const results = window.theoreticalResultsData;
    if (!results) {
        alert('No hay resultados para descargar');
        return;
    }
    
    let csv = 'wavelength_nm';
    if (results.psi) csv += ',psi_deg';
    if (results.delta) csv += ',delta_deg';
    if (results.reflectance) csv += ',reflectance';
    if (results.transmittance) csv += ',transmittance';
    if (results.absorbance) csv += ',absorbance';
    csv += '\n';
    
    const wavelengths = results.wavelengths;
    for (let i = 0; i < wavelengths.length; i++) {
        csv += wavelengths[i];
        if (results.psi) csv += ',' + results.psi[i];
        if (results.delta) csv += ',' + results.delta[i];
        if (results.reflectance) csv += ',' + results.reflectance[i];
        if (results.transmittance) csv += ',' + results.transmittance[i];
        if (results.absorbance) csv += ',' + results.absorbance[i];
        csv += '\n';
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resultados_teoricos.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// CÓDIGO ORIGINAL DE OPTIMIZACIÓN - Event Listeners protegidos
// ============================================================================

// Proteger event listeners originales (solo se ejecutan en modo upload, no en teórico)
if (!theoreticalMode) {
    const inputFileEl = document.getElementById("inputFile");
    const showGridEl = document.getElementById("showGrid");
    const whiteBackgroundEl = document.getElementById("whiteBackground");
    
    if (inputFileEl) inputFileEl.addEventListener("change", uploadFile);
    if (showGridEl) showGridEl.addEventListener("change", updateGraphSettings);
    if (whiteBackgroundEl) whiteBackgroundEl.addEventListener("change", updateGraphSettings);
}

// Variables ya declaradas arriba (comentadas para evitar redeclaración)
// let currentData = null;
// let uploadedFileData = null;
// let uploadedWavelengths = [];
// let savedModel = null;

async function uploadFile() {
    const file = document.getElementById("inputFile").files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    console.log("📤 Subiendo archivo:", file.name);

    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });

        console.log("📥 Respuesta del servidor:", response.status);

        const data = await response.json();
        console.log("📊 Datos recibidos:", data);

        if (data.error) {
            alert("❌ Error: " + data.error);
            console.error("Error del servidor:", data.error);
            return;
        }

        console.log("✅ Columnas encontradas:", data.columns);
        console.log("✅ Filas totales:", data.total_rows);

        const cols = Array.isArray(data.columns) ? data.columns : (Array.isArray(data.preview) && data.preview.length ? Object.keys(data.preview[0]) : []);
        const previewRows = Array.isArray(data.preview) ? data.preview : (Array.isArray(data.full_data) ? data.full_data.slice(0, 10) : []);
        const fullData = Array.isArray(data.full_data) ? data.full_data : (Array.isArray(data.preview) ? data.preview : []);

        fillPreviewTable(cols, previewRows);
        currentData = { columns: cols, fullData: fullData };
        uploadedFileData = fullData;
        
        const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
        if (lambdaCol) {
            uploadedWavelengths = data.full_data.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
            console.log("✅ Longitudes de onda extraídas:", uploadedWavelengths.length);
        }
        
        drawGraphs(cols, fullData);
        document.getElementById("btn-continue-model").style.display = "block";

    } catch (error) {
        console.error("❌ Error capturado:", error);
        alert("Error al subir archivo: " + error.message);
    }
}

function updateGraphSettings() {
    if (currentData) {
        drawGraphs(currentData.columns, currentData.fullData);
    }
}

function fillPreviewTable(columns, preview) {
    const table = document.getElementById("previewTable");
    table.innerHTML = "";
    if (!Array.isArray(columns)) columns = [];
    if (!Array.isArray(preview)) preview = [];

    if (columns.length === 0 && preview.length > 0) {
        columns = Object.keys(preview[0]);
    }

    let thead = "<tr>";
    for (const col of columns) thead += `<th>${col}</th>`;
    thead += "</tr>";
    table.innerHTML += thead;

    for (const row of preview) {
        let tr = "<tr>";
        for (const c of columns) {
            const value = row && (row[c] !== null && row[c] !== undefined) ? row[c] : '';
            tr += `<td>${value}</td>`;
        }
        tr += "</tr>";
        table.innerHTML += tr;
    }
}

function drawGraphs(columns, fullData) {
    
    console.log("🎨 Iniciando drawGraphs...");
    console.log("📋 Columnas:", columns);
    console.log("📊 Datos completos:", fullData.length, "filas");
    
    let lambdaCol = findColumn(columns, ["lambda", "longitud", "wavelength", "nm", "wave"]);
    let psiCol = findColumn(columns, ["psi"]);
    let deltaCol = findColumn(columns, ["delta"]);

    console.log("🔍 Columnas encontradas:");
    console.log("  - Lambda:", lambdaCol);
    console.log("  - Psi:", psiCol);
    console.log("  - Delta:", deltaCol);

    if (!lambdaCol || !psiCol || !deltaCol) {
        alert("No se pudieron identificar las columnas necesarias.\n" +
              "Asegúrate de que el archivo contenga columnas para:\n" +
              "- Longitud de onda (lambda, wavelength, nm)\n" +
              "- Psi\n" +
              "- Delta\n\n" +
              "Columnas encontradas: " + columns.join(", "));
        return;
    }

    console.log("🧹 Limpiando divs de gráficas...");
    document.getElementById("psiPlot").innerHTML = "";
    document.getElementById("deltaPlot").innerHTML = "";
    document.getElementById("combinedPlot").innerHTML = "";

    const lambda = fullData.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
    const psi = fullData.map(r => r[psiCol]).filter(v => v !== null && v !== undefined);
    const delta = fullData.map(r => r[deltaCol]).filter(v => v !== null && v !== undefined);

    console.log("📈 Datos extraídos:");
    console.log("  - Lambda:", lambda.length, "puntos");
    console.log("  - Psi:", psi.length, "puntos");
    console.log("  - Delta:", delta.length, "puntos");

    const showGrid = document.getElementById("showGrid").checked;
    const whiteBackground = document.getElementById("whiteBackground").checked;
    
    const bgColor = whiteBackground ? "white" : "#f5f5f5";
    const gridColor = showGrid ? "#ddd" : "rgba(0,0,0,0)";

    const layout_base = {
        plot_bgcolor: bgColor,
        paper_bgcolor: "white",
        font: { family: "Arial, sans-serif", size: 11 },
        margin: { l: 60, r: 30, t: 40, b: 50 },
        xaxis: {
            showgrid: showGrid,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: "#999",
            showline: true,
            linewidth: 2,
            linecolor: 'black',
            mirror: true
        },
        yaxis: {
            showgrid: showGrid,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: "#999",
            showline: true,
            linewidth: 2,
            linecolor: 'black',
            mirror: true
        }
    };

    Plotly.newPlot("psiPlot", [{
        x: lambda,
        y: psi,
        mode: "markers",
        marker: { 
            size: 4,
            color: "#2E86C1",
            symbol: "circle"
        },
        name: "Psi"
    }], {
        ...layout_base,
        title: "Psi vs Longitud de Onda",
        xaxis: { ...layout_base.xaxis, title: "Longitud de onda (nm)" },
        yaxis: { ...layout_base.yaxis, title: "Psi (°)" }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });

    console.log("✅ Gráfica Psi creada");

    Plotly.newPlot("deltaPlot", [{
        x: lambda,
        y: delta,
        mode: "markers",
        marker: { 
            size: 4,
            color: "#E74C3C",
            symbol: "circle"
        },
        name: "Delta"
    }], {
        ...layout_base,
        title: "Delta vs Longitud de Onda",
        xaxis: { ...layout_base.xaxis, title: "Longitud de onda (nm)" },
        yaxis: { ...layout_base.yaxis, title: "Delta (°)" }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });

    console.log("✅ Gráfica Delta creada");

    Plotly.newPlot("combinedPlot", [
        {
            x: lambda,
            y: psi,
            mode: "markers",
            marker: { 
                size: 4,
                color: "#2E86C1",
                symbol: "circle"
            },
            name: "Psi",
            yaxis: "y1"
        },
        {
            x: lambda,
            y: delta,
            mode: "markers",
            marker: { 
                size: 4,
                color: "#E74C3C",
                symbol: "circle"
            },
            name: "Delta",
            yaxis: "y2"
        }
    ], {
        plot_bgcolor: bgColor,
        paper_bgcolor: "white",
        font: { family: "Arial, sans-serif", size: 11 },
        margin: { l: 60, r: 60, t: 40, b: 50 },
        title: "Psi y Delta vs Longitud de Onda",
        xaxis: { 
            title: "Longitud de onda (nm)",
            showgrid: showGrid,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: "#999",
            showline: true,
            linewidth: 2,
            linecolor: 'black',
            mirror: true
        },
        yaxis: {
            title: "Psi (°)",
            titlefont: { color: "#2E86C1" },
            tickfont: { color: "#2E86C1" },
            showgrid: showGrid,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: "#999",
            showline: true,
            linewidth: 2,
            linecolor: 'black',
            mirror: true
        },
        yaxis2: {
            title: "Delta (°)",
            titlefont: { color: "#E74C3C" },
            tickfont: { color: "#E74C3C" },
            overlaying: "y",
            side: "right",
            showgrid: false,
            zeroline: true,
            zerolinecolor: "#999",
            showline: true,
            linewidth: 2,
            linecolor: 'black'
        }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });

    console.log("✅ Gráfica Combinada creada");
    console.log("🎉 ¡Todas las gráficas completadas!");
}

function findColumn(columns, keywords) {
    for (let col of columns) {
        const colLower = col.toLowerCase().trim();
        for (let keyword of keywords) {
            if (colLower === keyword.toLowerCase() || colLower.includes(keyword.toLowerCase())) {
                return col;
            }
        }
    }
    return null;
}

function downloadPsiPNG() {
    Plotly.downloadImage('psiPlot', {
        format: 'png',
        width: 800,
        height: 600,
        filename: 'psi_vs_wavelength'
    });
}

function downloadDeltaPNG() {
    Plotly.downloadImage('deltaPlot', {
        format: 'png',
        width: 800,
        height: 600,
        filename: 'delta_vs_wavelength'
    });
}

function downloadCombinedPNG() {
    Plotly.downloadImage('combinedPlot', {
        format: 'png',
        width: 800,
        height: 600,
        filename: 'combined_psi_delta'
    });
}

async function downloadAllPDF() {
    const psiImg = await Plotly.toImage('psiPlot', {format: 'png', width: 800, height: 500});
    const deltaImg = await Plotly.toImage('deltaPlot', {format: 'png', width: 800, height: 500});
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Gráficas Experimentales</title>
            <style>
                body { margin: 20px; font-family: Arial; }
                h1 { font-size: 18px; margin-bottom: 20px; }
                img { width: 100%; max-width: 800px; margin-bottom: 30px; display: block; }
            </style>
        </head>
        <body>
            <h1>Gráficas Experimentales - Elipsometría</h1>
            <img src="${psiImg}" alt="Psi vs Wavelength">
            <img src="${deltaImg}" alt="Delta vs Wavelength">
        </body>
        </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
}

const modelWizardModal = new bootstrap.Modal(document.getElementById("modelWizardModal"));
const wizardSteps = [...document.querySelectorAll(".wizard-step")];
let currentStep = 1;

document.getElementById("btn-continue-model").addEventListener("click", () => {
    currentStep = 1;
    document.getElementById("wizard-step-num").innerText = currentStep;
    showStep(currentStep);
    modelWizardModal.show();
});

const wizardNextBtn = document.getElementById("wizard-next");
const wizardPrevBtn = document.getElementById("wizard-prev");
const wizardSaveBtn = document.getElementById("wizard-save");
const wizardError = document.getElementById("wizard-error");

function showStep(n) {
    wizardSteps.forEach(s => s.classList.add("d-none"));
    const el = document.querySelector(`.wizard-step[data-step="${n}"]`);
    if (el) el.classList.remove("d-none");
    document.getElementById("wizard-step-num").innerText = n;
    wizardPrevBtn.style.display = (n === 1) ? "none" : "inline-block";
    wizardNextBtn.style.display = (n === wizardSteps.length) ? "none" : "inline-block";
    wizardSaveBtn.classList.toggle("d-none", n !== wizardSteps.length);
    wizardError.style.display = "none";
    
    if (n === 3) {
        updateModelSummary();
    }
}
showStep(1);

wizardNextBtn.addEventListener("click", () => {
    if (currentStep < wizardSteps.length) {
        if (!validateStep(currentStep)) return;
        currentStep += 1;
        showStep(currentStep);
    }
});

wizardPrevBtn.addEventListener("click", () => {
    if (currentStep > 1) {
        currentStep -= 1;
        showStep(currentStep);
    }
});

document.getElementById("input-polarization").addEventListener("change", (e) => {
    const warning = document.getElementById("polarization-warning");
    if (e.target.value === "S" || e.target.value === "P") {
        warning.style.display = "block";
    } else {
        warning.style.display = "none";
    }
});

const wlOptions = document.querySelectorAll('input[name="wl-option"]');
const wlRangeFields = document.getElementById('wl-range-fields');
const wlSingleField = document.getElementById('wl-single-field');
wlOptions.forEach(opt => {
    opt.addEventListener('change', () => {
        const val = document.querySelector('input[name="wl-option"]:checked').value;
        wlRangeFields.style.display = (val === 'range') ? 'block' : 'none';
        wlSingleField.style.display = (val === 'single') ? 'block' : 'none';
    });
});

document.getElementById("ambient-model").addEventListener("change", (e) => {
    updateMediumFields('ambient', e.target.value);
});

document.getElementById("substrate-model").addEventListener("change", (e) => {
    updateMediumFields('substrate', e.target.value);
});

// ⭐ NUEVO: Listeners para tipo de sustrato/ambiente (homogéneo o EMT)
document.getElementById("substrate-type-homo").addEventListener("change", () => {
    updateSubstrateTypeInterface('homogeneous');
});

document.getElementById("substrate-type-emt").addEventListener("change", () => {
    updateSubstrateTypeInterface('emt');
});

document.getElementById("ambient-type-homo").addEventListener("change", () => {
    updateAmbientTypeInterface('homogeneous');
});

document.getElementById("ambient-type-emt").addEventListener("change", () => {
    updateAmbientTypeInterface('emt');
});

const dispersionTemplates = {
    cauchy: {
        label: "Cauchy",
        equation: "n(\\lambda) = A + \\frac{B}{\\lambda^2} + \\frac{C}{\\lambda^4}",
        params: [
            { name: "A", placeholder: "A" },
            { name: "B", placeholder: "B" },
            { name: "C", placeholder: "C" }
        ]
    },
    sellmeier: {
        label: "Sellmeier",
        equation: "n^2(\\lambda) = 1 + \\sum_j \\frac{B_j \\lambda^2}{\\lambda^2 - C_j}",
        params: [
            { name: "B1", placeholder: "B₁" },
            { name: "C1", placeholder: "C₁" },
            { name: "B2", placeholder: "B₂ (opcional)" },
            { name: "C2", placeholder: "C₂ (opcional)" }
        ]
    },
    drude: {
        label: "Drude",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty - \\frac{\\omega_p^2}{\\omega^2 + i\\gamma\\omega}",
        params: [
            { name: "eps_inf", placeholder: "ε∞" },
            { name: "omega_p", placeholder: "ωₚ" },
            { name: "gamma", placeholder: "γ" }
        ]
    },
    lorentz: {
        label: "Lorentz",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty + \\sum_j \\frac{f_j \\omega_j^2}{\\omega_j^2 - \\omega^2 - i\\gamma_j\\omega}",
        params: [
            { name: "eps_inf", placeholder: "ε∞" },
            { name: "f1", placeholder: "f₁" },
            { name: "omega_1", placeholder: "ω₁" },
            { name: "gamma_1", placeholder: "γ₁" }
        ]
    }
};

function updateMediumFields(medium, modelType) {
    const paramsDiv = document.getElementById(`${medium}-params`);
    const fileDiv = document.getElementById(`${medium}-file-upload`);
    const customDiv = document.getElementById(`${medium}-custom-eq`);
    const constantField = document.getElementById(`${medium}-constant-field`);
    const fileHelp = document.getElementById(`${medium}-file-help`);
    
    paramsDiv.innerHTML = "";
    fileDiv.style.display = "none";
    customDiv.style.display = "none";
    if (constantField) constantField.style.display = "none";
    
    if (modelType === "constant") {
        if (constantField) constantField.style.display = "block";
    } else if (dispersionTemplates[modelType]) {
        const template = dispersionTemplates[modelType];
        let html = `
            <div class="dispersion-templates mb-2">
                <small class="text-muted">Modelo ${template.label}:</small>
                <div class="eq-preview mt-1">$${template.equation}$</div>
            </div>
        `;
        template.params.forEach(p => {
            html += `<input class="form-control form-control-sm mb-1" name="${medium}_${p.name}" 
                     placeholder="${p.placeholder}" type="number" step="any">`;
        });
        paramsDiv.innerHTML = html;
        if (window.MathJax) {
            MathJax.typesetPromise([paramsDiv]);
        }
    } else if (modelType === "file_nk") {
        fileDiv.style.display = "block";
        fileHelp.textContent = "Archivo con columnas: wavelength (nm), n, k (k opcional)";
    } else if (modelType === "file_epsilon") {
        fileDiv.style.display = "block";
        fileHelp.textContent = "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2 — Se convertirá automáticamente a n,k";
    } else if (modelType === "custom") {
        customDiv.style.display = "block";
    } else if (modelType === "glass") {
        paramsDiv.innerHTML = `<div class="form-text">Glass: n = 1.52, k = 0 (valores típicos)</div>`;
    } else if (modelType === "si") {
        paramsDiv.innerHTML = `<div class="form-text">Silicon: Se usarán valores tabulados de Si</div>`;
    }
}

// ⭐ NUEVA FUNCIÓN: Actualizar interfaz de sustrato según tipo
function updateSubstrateTypeInterface(type) {
    const homoConfig = document.getElementById('substrate-homo-config');
    const emtConfig = document.getElementById('substrate-emt-config');
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        // Asegurar al menos un componente
        const container = document.getElementById('substrate-emt-components');
        if (container.children.length === 0) {
            addMediumEMTComponent('substrate');
        }
    }
}

// ⭐ NUEVA FUNCIÓN: Actualizar interfaz de ambiente según tipo
function updateAmbientTypeInterface(type) {
    const homoConfig = document.getElementById('ambient-homo-config');
    const emtConfig = document.getElementById('ambient-emt-config');
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        const container = document.getElementById('ambient-emt-components');
        if (container.children.length === 0) {
            addMediumEMTComponent('ambient');
        }
    }
}

// ⭐ NUEVA FUNCIÓN: Agregar componente EMT a medio (sustrato/ambiente)
function addMediumEMTComponent(medium) {
    const container = document.getElementById(`${medium}-emt-components`);
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-2 mb-2 medium-emt-component bg-white';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-2">
            <strong class="component-title">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-medium-component">✕</button>
        </div>

        <div class="row g-2">
            <div class="col-md-4">
                <label class="form-label small">Nombre</label>
                <input class="form-control form-control-sm medium-component-name" value="Componente ${componentCount}" placeholder="Ej: SiO2, Poros">
            </div>
            <div class="col-md-4">
                <label class="form-label small">Fracción volumétrica</label>
                <div class="input-group input-group-sm">
                    <input class="form-control medium-component-fraction" type="number" min="0" max="1" step="0.01" value="0.5">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 medium-fraction-percent" type="checkbox">
                    </span>
                    <span class="input-group-text">%</span>
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label small">Modelo</label>
                <select class="form-select form-select-sm medium-component-model">
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="constant" selected>Constante</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                    <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                    <option value="custom">✏️ Ecuación personalizada (LaTeX)</option>
                </select>
            </div>
        </div>

        <div class="row g-2 mt-1">
            <div class="col-12 medium-component-params"></div>
        </div>

        <div class="medium-component-file mt-2" style="display:none;">
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control form-control-sm medium-comp-file"/>
            <div class="form-text">Archivo con datos ópticos</div>
        </div>

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

        <div class="medium-component-custom mt-2" style="display:none;">
            <div class="alert alert-info small mb-2">
                <strong>✏️ Ecuación personalizada</strong>
                <p class="mb-0 small">Define n(λ) para este componente</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-medium-comp-latex-btn">
                ✏️ Editar ecuación LaTeX
            </button>
            <div class="border rounded p-2 bg-light">
                <div class="latex-equation-display text-center">
                    <em class="text-muted small">No hay ecuación</em>
                </div>
                <input type="hidden" class="latex-equation-value" value="">
            </div>
        </div>
    `;
    
    container.appendChild(componentDiv);

    // Event listeners
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
    });

    const fractionInput = componentDiv.querySelector('.medium-component-fraction');
    const percentCheckbox = componentDiv.querySelector('.medium-fraction-percent');

    fractionInput.addEventListener('input', () => updateMediumFractionSum(medium));
    percentCheckbox.addEventListener('change', () => {
        if (percentCheckbox.checked) {
            fractionInput.max = 100;
            fractionInput.step = 1;
        } else {
            fractionInput.max = 1;
            fractionInput.step = 0.01;
        }
    });

    const modelSelect = componentDiv.querySelector('.medium-component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params');
    const fileDiv = componentDiv.querySelector('.medium-component-file');
    const constantDiv = componentDiv.querySelector('.medium-component-constant');
    const customDiv = componentDiv.querySelector('.medium-component-custom');

    function updateMediumComponentModel() {
        const model = modelSelect.value;
        fileDiv.style.display = "none";
        constantDiv.style.display = "none";
        customDiv.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantDiv.style.display = "block";
        } else if (model === 'custom') {
            // ⭐ NUEVO: Ecuación personalizada
            customDiv.style.display = "block";
        } else if (dispersionTemplates[model]) {
            const template = dispersionTemplates[model];
            let html = `<div class="small text-muted mb-1">${template.label}</div>`;
            template.params.forEach(p => {
                html += `<input class="form-control form-control-sm mb-1 medium-comp-param" 
                         data-param="${p.name}" placeholder="${p.placeholder}" 
                         type="number" step="any">`;
            });
            paramsDiv.innerHTML = html;
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileDiv.style.display = "block";
        }
    }

    modelSelect.addEventListener("change", updateMediumComponentModel);
    updateMediumComponentModel();
    
    // ⭐ NUEVO: Listener para botón LaTeX de componente medio
    const openLatexBtn = componentDiv.querySelector('.open-medium-comp-latex-btn');
    if (openLatexBtn) {
        openLatexBtn.addEventListener('click', () => {
            const componentId = `medium-comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            customDiv.id = componentId;
            openLatexEditor(componentId);
        });
    }

    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
}

// ⭐ NUEVA FUNCIÓN: Actualizar suma de fracciones para medio
function updateMediumFractionSum(medium) {
    const sumDisplay = document.getElementById(`${medium}-fraction-sum`);
    const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
    
    let sum = 0;
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.medium-component-fraction');
        const isPercent = comp.querySelector('.medium-fraction-percent').checked;
        let value = parseFloat(fractionInput.value) || 0;
        
        if (isPercent) {
            value = value / 100;
        }
        
        sum += value;
    });

    sumDisplay.textContent = sum.toFixed(3);

    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
    } else {
        sumDisplay.style.color = 'red';
    }
}

// ⭐ NUEVA FUNCIÓN: Refrescar títulos de componentes de medio
function refreshMediumComponentTitles(container) {
    const components = container.querySelectorAll('.medium-emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

const layersContainer = document.getElementById("layers-container");
document.getElementById("add-layer").addEventListener("click", () => addLayer());

let layerCounter = 0;

// ⭐ FUNCIÓN CORREGIDA: Primero pregunta tipo de capa, luego muestra interfaz correspondiente
function addLayer(prefill={}) {
    layerCounter++;
    const idx = layerCounter;
    const wrapper = document.createElement("div");
    wrapper.className = "card mb-3 p-3 layer-card";
    wrapper.dataset.idx = String(idx);

    // ⭐ PASO 1: Primero mostrar SOLO la pregunta del tipo
    wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="layer-title">Capa ${layersContainer.children.length + 1}</strong>
            <button class="btn btn-sm btn-outline-danger remove-layer">Eliminar</button>
        </div>

        <!-- ⭐ PREGUNTA INICIAL: ¿Homogénea o Heterogénea? -->
        <div class="layer-type-question">
            <label class="form-label fw-bold">¿La capa es homogénea o heterogénea?</label>
            <div class="btn-group w-100 mb-3" role="group">
                <input type="radio" class="btn-check" name="layerType${idx}" id="layerTypeHomo${idx}" value="homogeneous" checked>
                <label class="btn btn-outline-primary" for="layerTypeHomo${idx}">
                    <div class="fw-bold">Homogénea</div>
                    <small class="text-muted">Un solo material</small>
                </label>
                
                <input type="radio" class="btn-check" name="layerType${idx}" id="layerTypeHetero${idx}" value="heterogeneous">
                <label class="btn btn-outline-warning" for="layerTypeHetero${idx}">
                    <div class="fw-bold">Heterogénea (EMT)</div>
                    <small class="text-muted">Multi-componente/Porosa</small>
                </label>
            </div>
        </div>

        <!-- Contenedor para configuración básica (nombre y espesor) -->
        <div class="layer-basic-config" style="display:none;">
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <label class="form-label">Nombre de la capa</label>
                    <input class="form-control layer-name" value="${prefill.name || ('Capa ' + (layersContainer.children.length + 1))}">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Espesor (nm)</label>
                    <div class="input-group">
                        <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${prefill.thickness || 100}">
                        <span class="input-group-text">
                            <input class="form-check-input mt-0 layer-optimize" type="checkbox" title="Optimizar"/>
                        </span>
                    </div>
                    <div class="form-text">Marcar para optimizar este parámetro</div>
                </div>
            </div>
        </div>

        <!-- ⭐ Contenedor para capa HOMOGÉNEA -->
        <div class="homogeneous-config" style="display:none;">
            <div class="card p-3 bg-light">
                <h6 class="mb-2">Configuración homogénea</h6>
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label">Modelo de dispersión</label>
                        <select class="form-select layer-model">
                            <option value="cauchy" selected>Cauchy</option>
                            <option value="sellmeier">Sellmeier</option>
                            <option value="drude">Drude</option>
                            <option value="lorentz">Lorentz</option>
                            <option value="constant">Constante</option>
                            <option value="file_nk">Archivo n,k,λ</option>
                            <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                            <option value="custom">✏️ Ecuación personalizada (LaTeX)</option>
                        </select>
                    </div>
                    <div class="col-md-6 layer-params-col">
                        <div class="layer-params"></div>
                    </div>
                </div>

                <div class="layer-file-row mt-2" style="display:none;">
                    <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control layer-file"/>
                    <div class="form-text layer-file-help">Archivo con columnas apropiadas</div>
                </div>

                <div class="layer-constant-row mt-2" style="display:none;">
                    <label class="form-label small">n</label>
                    <input class="form-control layer-n-const" type="number" step="0.001" value="1.5">
                    <label class="form-label small mt-1">k</label>
                    <input class="form-control layer-k-const" type="number" step="0.001" value="0">
                </div>

                <div class="layer-custom-row mt-2" style="display:none;">
                    <div class="alert alert-info small mb-2">
                        <strong>✏️ Ecuación personalizada</strong>
                        <p class="mb-0">Define tu propia ecuación para n en función de λ (nm)</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-latex-editor-btn">
                        ✏️ Editar ecuación LaTeX
                    </button>
                    <div id="layer-custom-${idx}" class="border rounded p-2 bg-light">
                        <div class="latex-equation-display text-center">
                            <em class="text-muted small">No hay ecuación definida</em>
                        </div>
                        <input type="hidden" class="latex-equation-value" value="">
                    </div>
                </div>
            </div>
        </div>

        <!-- ⭐ Contenedor para capa HETEROGÉNEA (EMT) -->
        <div class="heterogeneous-config" style="display:none;">
            <div class="card p-3 bg-warning bg-opacity-10">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h6 class="mb-1">Configuración heterogénea (EMT)</h6>
                        <small class="text-muted">Defina los componentes de la mezcla</small>
                    </div>
                    <button class="btn btn-sm btn-outline-primary add-emt-component">+ Componente</button>
                </div>

                <div class="mb-3">
                    <label class="form-label">Modelo EMT</label>
                    <select class="form-select emt-model-select">
                        <option value="bruggeman" selected>Bruggeman</option>
                        <option value="maxwell-garnett">Maxwell-Garnett</option>
                    </select>
                    <div class="form-text">Bruggeman: mezclas simétricas. Maxwell-Garnett: matriz con inclusiones.</div>
                </div>

                <div class="emt-components-container"></div>

                <div class="alert alert-warning mt-3 mb-0" style="font-size: 0.9em;">
                    <strong>⚠️ Importante:</strong> La suma de fracciones volumétricas debe ser exactamente 1.0
                    <div class="mt-2">
                        <strong>Suma actual: <span class="fraction-sum-display">0.000</span></strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    layersContainer.appendChild(wrapper);

    // ========== EVENT LISTENERS ==========

    // Eliminar capa
    const removeBtn = wrapper.querySelector(".remove-layer");
    removeBtn.addEventListener("click", () => { 
        wrapper.remove(); 
        refreshLayerTitles(); 
    });

    // ⭐ LISTENER PRINCIPAL: Cambio de tipo de capa
    const typeRadios = wrapper.querySelectorAll('input[name="layerType' + idx + '"]');
    const basicConfig = wrapper.querySelector('.layer-basic-config');
    const homoConfig = wrapper.querySelector('.homogeneous-config');
    const heteroConfig = wrapper.querySelector('.heterogeneous-config');

    typeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const selectedType = wrapper.querySelector(`input[name="layerType${idx}"]:checked`).value;
            
            // Mostrar configuración básica (nombre y espesor)
            basicConfig.style.display = 'block';
            
            if (selectedType === 'homogeneous') {
                homoConfig.style.display = 'block';
                heteroConfig.style.display = 'none';
            } else {
                homoConfig.style.display = 'none';
                heteroConfig.style.display = 'block';
                
                // Asegurar que hay al menos un componente
                const componentsContainer = wrapper.querySelector('.emt-components-container');
                if (componentsContainer.children.length === 0) {
                    addEMTComponent(wrapper);
                }
            }
        });
    });

    // ⭐ IMPORTANTE: Disparar el evento change inicialmente para mostrar la configuración por defecto
    const checkedRadio = wrapper.querySelector(`input[name="layerType${idx}"]:checked`);
    if (checkedRadio) {
        checkedRadio.dispatchEvent(new Event('change'));
    }

    // ========== CONFIGURACIÓN HOMOGÉNEA ==========
    const modelSelect = wrapper.querySelector(".layer-model");
    const paramsDiv = wrapper.querySelector(".layer-params");
    const fileRow = wrapper.querySelector(".layer-file-row");
    const constantRow = wrapper.querySelector(".layer-constant-row");
    const customRow = wrapper.querySelector(".layer-custom-row");
    const fileHelp = wrapper.querySelector(".layer-file-help");

    function updateLayerModel() {
        const model = modelSelect.value;
        fileRow.style.display = "none";
        constantRow.style.display = "none";
        customRow.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantRow.style.display = "block";
        } else if (model === 'custom') {
            // ⭐ NUEVO: Mostrar interfaz de ecuación personalizada
            customRow.style.display = "block";
        } else if (dispersionTemplates[model]) {
            const template = dispersionTemplates[model];
            let html = `<div class="dispersion-templates mb-2">
                <small class="text-muted">${template.label}:</small>
                <div class="eq-preview mt-1" style="font-size: 0.85em;">$${template.equation}$</div>
            </div>`;
            template.params.forEach(p => {
                html += `<input class="form-control form-control-sm mb-1 layer-param" 
                         data-param="${p.name}" placeholder="${p.placeholder}" 
                         type="number" step="any">`;
            });
            paramsDiv.innerHTML = html;
            if (window.MathJax) {
                MathJax.typesetPromise([paramsDiv]);
            }
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileRow.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega, epsilon1, epsilon2"
                : "Archivo con columnas: wavelength, n, k";
        }
    }

    modelSelect.addEventListener("change", updateLayerModel);
    updateLayerModel();

    // ⭐ NUEVO: Listener para botón de editor LaTeX
    const openLatexBtn = wrapper.querySelector('.open-latex-editor-btn');
    if (openLatexBtn) {
        openLatexBtn.addEventListener('click', () => {
            openLatexEditor(`layer-custom-${idx}`);
        });
    }

    // ========== CONFIGURACIÓN HETEROGÉNEA (EMT) ==========
    const addComponentBtn = wrapper.querySelector('.add-emt-component');
    addComponentBtn.addEventListener('click', () => {
        addEMTComponent(wrapper);
    });

    refreshLayerTitles();
}

// ⭐ FUNCIÓN: Agregar componente EMT a una capa
function addEMTComponent(layerWrapper) {
    const componentsContainer = layerWrapper.querySelector('.emt-components-container');
    const componentCount = componentsContainer.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-2 mb-2 emt-component bg-white';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-2">
            <strong class="component-title">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-emt-component">✕</button>
        </div>

        <div class="row g-2">
            <div class="col-md-4">
                <label class="form-label small">Nombre del componente</label>
                <input class="form-control form-control-sm component-name" value="Componente ${componentCount}" placeholder="Ej: SiO2, Poros, Au">
            </div>
            <div class="col-md-4">
                <label class="form-label small">Fracción volumétrica</label>
                <div class="input-group input-group-sm">
                    <input class="form-control component-fraction" type="number" min="0" max="1" step="0.01" value="0.5" placeholder="0.0 - 1.0">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 fraction-is-percent" type="checkbox" title="Usar %">
                    </span>
                    <span class="input-group-text">%</span>
                </div>
                <div class="form-text">Decimal (0-1) o marcar para %</div>
            </div>
            <div class="col-md-4">
                <label class="form-label small">Modelo de dispersión</label>
                <select class="form-select form-select-sm component-model">
                    <option value="cauchy" selected>Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="constant">Constante</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                    <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                    <option value="custom">✏️ Ecuación personalizada (LaTeX)</option>
                </select>
            </div>
        </div>

        <div class="row g-2 mt-1">
            <div class="col-12 component-params-container">
                <!-- Parámetros del modelo se insertan aquí -->
            </div>
        </div>

        <div class="component-file-section mt-2" style="display:none;">
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control form-control-sm component-file"/>
            <div class="form-text component-file-help">Archivo con datos ópticos</div>
        </div>

        <div class="component-constant-section mt-2" style="display:none;">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small">n</label>
                    <input class="form-control form-control-sm component-n" type="number" step="0.001" value="1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small">k</label>
                    <input class="form-control form-control-sm component-k" type="number" step="0.001" value="0">
                </div>
            </div>
        </div>

        <div class="component-custom-section mt-2" style="display:none;">
            <div class="alert alert-info small mb-2">
                <strong>✏️ Ecuación personalizada</strong>
                <p class="mb-0 small">Define n(λ) para este componente</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-component-latex-btn">
                ✏️ Editar ecuación LaTeX
            </button>
            <div class="border rounded p-2 bg-light">
                <div class="latex-equation-display text-center">
                    <em class="text-muted small">No hay ecuación</em>
                </div>
                <input type="hidden" class="latex-equation-value" value="">
            </div>
        </div>
    `;
    
    componentsContainer.appendChild(componentDiv);

    // Event listeners para el componente
    const removeBtn = componentDiv.querySelector('.remove-emt-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshComponentTitles(componentsContainer);
        updateFractionSum(layerWrapper);
    });

    const fractionInput = componentDiv.querySelector('.component-fraction');
    const percentCheckbox = componentDiv.querySelector('.fraction-is-percent');

    fractionInput.addEventListener('input', () => updateFractionSum(layerWrapper));
    percentCheckbox.addEventListener('change', () => {
        if (percentCheckbox.checked) {
            fractionInput.max = 100;
            fractionInput.step = 1;
            fractionInput.placeholder = "0 - 100";
        } else {
            fractionInput.max = 1;
            fractionInput.step = 0.01;
            fractionInput.placeholder = "0.0 - 1.0";
        }
    });

    const modelSelect = componentDiv.querySelector('.component-model');
    const paramsContainer = componentDiv.querySelector('.component-params-container');
    const fileSection = componentDiv.querySelector('.component-file-section');
    const constantSection = componentDiv.querySelector('.component-constant-section');
    const customSection = componentDiv.querySelector('.component-custom-section');
    const fileHelp = componentDiv.querySelector('.component-file-help');

    function updateComponentModel() {
        const model = modelSelect.value;
        fileSection.style.display = "none";
        constantSection.style.display = "none";
        customSection.style.display = "none";
        paramsContainer.innerHTML = "";

        if (model === 'constant') {
            constantSection.style.display = "block";
        } else if (model === 'custom') {
            // ⭐ NUEVO: Ecuación personalizada
            customSection.style.display = "block";
        } else if (dispersionTemplates[model]) {
            const template = dispersionTemplates[model];
            let html = `<div class="small text-muted mb-1">${template.label}</div>`;
            template.params.forEach(p => {
                html += `<input class="form-control form-control-sm mb-1 component-param" 
                         data-param="${p.name}" placeholder="${p.placeholder}" 
                         type="number" step="any">`;
            });
            paramsContainer.innerHTML = html;
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileSection.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo: omega, epsilon1, epsilon2"
                : "Archivo: wavelength, n, k";
        }
    }

    modelSelect.addEventListener("change", updateComponentModel);
    updateComponentModel();
    
    // ⭐ NUEVO: Listener para botón LaTeX del componente
    const openLatexBtn = componentDiv.querySelector('.open-component-latex-btn');
    if (openLatexBtn) {
        openLatexBtn.addEventListener('click', () => {
            const componentId = `component-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            customSection.id = componentId;
            openLatexEditor(componentId);
        });
    }

    refreshComponentTitles(componentsContainer);
    updateFractionSum(layerWrapper);
}

// ⭐ FUNCIÓN: Actualizar suma de fracciones
function updateFractionSum(layerWrapper) {
    const sumDisplay = layerWrapper.querySelector('.fraction-sum-display');
    const components = layerWrapper.querySelectorAll('.emt-component');
    
    let sum = 0;
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.component-fraction');
        const isPercent = comp.querySelector('.fraction-is-percent').checked;
        let value = parseFloat(fractionInput.value) || 0;
        
        if (isPercent) {
            value = value / 100;
        }
        
        sum += value;
    });

    sumDisplay.textContent = sum.toFixed(3);

    // Color según validez
    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
        sumDisplay.parentElement.parentElement.classList.remove('alert-warning');
        sumDisplay.parentElement.parentElement.classList.add('alert-success');
    } else {
        sumDisplay.style.color = 'red';
        sumDisplay.parentElement.parentElement.classList.remove('alert-success');
        sumDisplay.parentElement.parentElement.classList.add('alert-warning');
    }
}

// ⭐ FUNCIÓN: Refrescar títulos de componentes
function refreshComponentTitles(container) {
    const components = container.querySelectorAll('.emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

function refreshLayerTitles() {
    [...layersContainer.children].forEach((c, i) => {
        const title = c.querySelector(".layer-title");
        if (title) title.innerText = `Capa ${i + 1}`;
    });
}

function validateStep(step) {
    wizardError.style.display = "none";
    
    if (step === 1) {
        const angle = Number(document.getElementById("input-angle").value);
        if (isNaN(angle) || angle <= 0 || angle >= 90) {
            wizardError.innerText = "Introduce un ángulo válido (0 < θ < 90).";
            wizardError.style.display = "block";
            return false;
        }
        const wlMode = document.querySelector('input[name="wl-option"]:checked').value;
        if (wlMode === 'range') {
            const from = Number(document.getElementById("input-wl-from").value);
            const to = Number(document.getElementById("input-wl-to").value);
            const steps = Number(document.getElementById("input-wl-steps").value);
            if (isNaN(from) || isNaN(to) || isNaN(steps) || from <= 0 || to <= 0 || steps < 2 || from >= to) {
                wizardError.innerText = "Introduce un rango de longitudes válido (inicio < fin, pasos >= 2).";
                wizardError.style.display = "block";
                return false;
            }
        } else if (wlMode === 'single') {
            const single = Number(document.getElementById("input-wl-single").value);
            if (isNaN(single) || single <= 0) {
                wizardError.innerText = "Introduce una longitud de onda válida (> 0 nm).";
                wizardError.style.display = "block";
                return false;
            }
        } else if (wlMode === 'file') {
            if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
                wizardError.innerText = "No hay longitudes de onda en el archivo subido.";
                wizardError.style.display = "block";
                return false;
            }
        }
    }
    
    if (step === 2) {
        // Validar medio ambiente
        const ambientType = document.querySelector('input[name="ambient-type"]:checked')?.value;
        
        if (ambientType === 'emt') {
            const ambientSum = parseFloat(document.getElementById('ambient-fraction-sum').textContent);
            if (Math.abs(ambientSum - 1.0) > 0.01) {
                wizardError.innerText = `La suma de fracciones del ambiente debe ser 1.0 (actual: ${ambientSum.toFixed(3)})`;
                wizardError.style.display = "block";
                return false;
            }
            
            const ambientComponents = document.querySelectorAll('#ambient-emt-components .medium-emt-component');
            if (ambientComponents.length < 2) {
                wizardError.innerText = "El ambiente heterogéneo debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
                return false;
            }
        } else {
            // Validación para ambiente homogéneo
            const ambientModel = document.getElementById("ambient-model").value;
            if (ambientModel === "file_nk" || ambientModel === "file_epsilon") {
                const file = document.getElementById("ambient-file").files[0];
                if (!file) {
                    wizardError.innerText = "Selecciona un archivo para el medio ambiente.";
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
        
        // Validar sustrato
        const substrateType = document.querySelector('input[name="substrate-type"]:checked')?.value;
        
        if (substrateType === 'emt') {
            const substrateSum = parseFloat(document.getElementById('substrate-fraction-sum').textContent);
            if (Math.abs(substrateSum - 1.0) > 0.01) {
                wizardError.innerText = `La suma de fracciones del sustrato debe ser 1.0 (actual: ${substrateSum.toFixed(3)})`;
                wizardError.style.display = "block";
                return false;
            }
            
            const substrateComponents = document.querySelectorAll('#substrate-emt-components .medium-emt-component');
            if (substrateComponents.length < 2) {
                wizardError.innerText = "El sustrato heterogéneo debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
                return false;
            }
        } else {
            // Validación para sustrato homogéneo
            const substrateModel = document.getElementById("substrate-model").value;
            if (substrateModel === "file_nk" || substrateModel === "file_epsilon") {
                const file = document.getElementById("substrate-file").files[0];
                if (!file) {
                    wizardError.innerText = "Selecciona un archivo para el sustrato.";
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
    }

    // ⭐ VALIDACIÓN: Fracciones EMT
    if (step === 3) {
        const layers = layersContainer.querySelectorAll('.layer-card');
        for (let layer of layers) {
            const basicConfig = layer.querySelector('.layer-basic-config');
            if (basicConfig.style.display === 'none') {
                wizardError.innerText = "Debes seleccionar el tipo de capa (homogénea o heterogénea)";
                wizardError.style.display = "block";
                return false;
            }

            const layerType = layer.querySelector('input[type="radio"]:checked')?.value;
            const layerName = layer.querySelector('.layer-name').value;
            
            if (layerType === 'heterogeneous') {
                const sumText = layer.querySelector('.fraction-sum-display').textContent;
                const sum = parseFloat(sumText);
                
                if (Math.abs(sum - 1.0) > 0.01) {
                    wizardError.innerText = `La suma de fracciones en "${layerName}" debe ser 1.0 (actual: ${sum.toFixed(3)})`;
                    wizardError.style.display = "block";
                    return false;
                }

                const components = layer.querySelectorAll('.emt-component');
                if (components.length < 2) {
                    wizardError.innerText = `La capa heterogénea "${layerName}" debe tener al menos 2 componentes.`;
                    wizardError.style.display = "block";
                    return false;
                }
            }
        }
    }
    
    return true;
}

function updateModelSummary() {
    const summaryDiv = document.getElementById("model-summary");
    const contentDiv = document.getElementById("model-summary-content");
    
    if (layersContainer.children.length === 0) {
        summaryDiv.style.display = "none";
        return;
    }
    
    summaryDiv.style.display = "block";
    
    let html = '<table class="table table-sm table-bordered"><thead><tr>';
    html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Tipo</th><th>Optimizar</th>';
    html += '</tr></thead><tbody>';
    
    [...layersContainer.children].forEach((layer, i) => {
        const name = layer.querySelector(".layer-name").value;
        const thickness = layer.querySelector(".layer-thickness").value;
        const layerType = layer.querySelector('input[type="radio"]:checked')?.value || 'No definido';
        const optimize = layer.querySelector(".layer-optimize").checked;
        
        const typeText = layerType === 'homogeneous' ? 'Homogénea' : 
                        layerType === 'heterogeneous' ? 'Heterogénea (EMT)' : 
                        'No definido';
        
        html += `<tr>
            <td>${i + 1}</td>
            <td>${name}</td>
            <td>${thickness}</td>
            <td>${typeText}</td>
            <td>${optimize ? 'Sí' : 'No'}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    contentDiv.innerHTML = html;
}

async function collectMediumData(medium) {
    // ⭐ Verificar si es EMT
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio && typeRadio.value === 'emt';
    
    if (isEMT) {
        // ⭐ Recopilar datos EMT
        const data = {
            type: 'emt',
            emt_model: document.getElementById(`${medium}-emt-model`).value,
            components: []
        };
        
        const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
        
        for (const compEl of components) {
            const compData = {};
            compData.name = compEl.querySelector('.medium-component-name').value;
            
            let fraction = Number(compEl.querySelector('.medium-component-fraction').value);
            const isPercent = compEl.querySelector('.medium-fraction-percent').checked;
            if (isPercent) {
                fraction = fraction / 100;
            }
            compData.fraction = fraction;

            const model = compEl.querySelector('.medium-component-model').value;
            compData.model = model;

            if (model === 'constant') {
                compData.n = Number(compEl.querySelector('.medium-comp-n').value);
                compData.k = Number(compEl.querySelector('.medium-comp-k').value);
            } else if (model === 'custom') {
                // ⭐ NUEVO: Ecuación personalizada
                const equationInput = compEl.querySelector('.medium-component-custom .latex-equation-value');
                compData.equation = equationInput ? equationInput.value : '';
            } else if (dispersionTemplates[model]) {
                compData.params = {};
                const inputs = compEl.querySelectorAll('.medium-comp-param');
                inputs.forEach(inp => {
                    const val = inp.value.trim();
                    compData.params[inp.dataset.param] = val !== '' ? Number(val) : null;
                });
            } else if (model === "file_nk" || model === "file_epsilon") {
                const file = compEl.querySelector('.medium-comp-file').files[0];
                if (file) {
                    compData.file_name = file.name;
                    compData.file_type = model === "file_epsilon" ? "epsilon" : "nk";
                    
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("file_type", compData.file_type);
                    
                    try {
                        const response = await fetch("/api/upload-optical-data", {
                            method: "POST",
                            body: formData
                        });
                        const result = await response.json();
                        if (result.error) {
                            throw new Error(result.error);
                        }
                        compData.optical_data = result.data;
                    } catch (e) {
                        console.error("Error uploading medium component optical data:", e);
                    }
                }
            }

            data.components.push(compData);
        }
        
        return data;
    } else {
        // ⭐ Recopilar datos homogéneos (normal)
        const modelType = document.getElementById(`${medium}-model`).value;
        const data = { type: modelType };
        
        if (modelType === "constant") {
            data.n = Number(document.getElementById(`${medium}-n-constant`).value);
            data.k = Number(document.getElementById(`${medium}-k-constant`).value) || 0;
        } else if (dispersionTemplates[modelType]) {
            data.params = {};
            const inputs = document.querySelectorAll(`#${medium}-params input`);
            inputs.forEach(inp => {
                const name = inp.name.replace(`${medium}_`, '');
                const val = inp.value.trim();
                data.params[name] = val !== '' ? Number(val) : null;
            });
        } else if (modelType === "file_nk" || modelType === "file_epsilon") {
            const file = document.getElementById(`${medium}-file`).files[0];
            if (file) {
                data.file_name = file.name;
                data.file_type = modelType === "file_epsilon" ? "epsilon" : "nk";
                
                const formData = new FormData();
                formData.append("file", file);
                formData.append("file_type", data.file_type);
                
                try {
                    const response = await fetch("/api/upload-optical-data", {
                        method: "POST",
                        body: formData
                    });
                    const result = await response.json();
                    if (result.error) {
                        throw new Error(result.error);
                    }
                    data.optical_data = result.data;
                } catch (e) {
                    console.error("Error uploading optical data:", e);
                }
            }
        } else if (modelType === "custom") {
            // ⭐ NUEVO: Ecuación personalizada LaTeX
            const equationInput = document.querySelector(`#${medium}-custom-section .latex-equation-value`);
            data.equation = equationInput ? equationInput.value : '';
            if (!data.equation) {
                console.warn("Ecuación personalizada vacía en", medium);
            }
        } else if (modelType === "glass") {
            data.n = 1.52;
            data.k = 0;
        } else if (modelType === "si") {
            data.material = "silicon";
        }
        
        return data;
    }
}

// ⭐ FUNCIÓN ACTUALIZADA: Recopilar datos de capa
async function collectLayerData(layerElement) {
    const data = {};
    data.name = layerElement.querySelector(".layer-name").value;
    data.thickness = Number(layerElement.querySelector(".layer-thickness").value);
    data.optimize_thickness = layerElement.querySelector(".layer-optimize").checked;
    
    const layerType = layerElement.querySelector('input[type="radio"]:checked').value;
    data.layer_type = layerType;

    if (layerType === 'homogeneous') {
        // Capa homogénea
        data.model = layerElement.querySelector(".layer-model").value;
        
        if (data.model === 'constant') {
            data.n = Number(layerElement.querySelector(".layer-n-const").value);
            data.k = Number(layerElement.querySelector(".layer-k-const").value);
        } else if (data.model === 'custom') {
            // ⭐ NUEVO: Ecuación personalizada LaTeX
            const equationInput = layerElement.querySelector(".layer-custom-row .latex-equation-value");
            data.equation = equationInput ? equationInput.value : '';
            if (!data.equation) {
                console.warn("Ecuación personalizada vacía en capa", data.name);
            }
        } else if (dispersionTemplates[data.model]) {
            data.params = {};
            const inputs = layerElement.querySelectorAll(".layer-param");
            inputs.forEach(inp => {
                const val = inp.value.trim();
                data.params[inp.dataset.param] = val !== '' ? Number(val) : null;
            });
        } else if (data.model === "file_nk" || data.model === "file_epsilon") {
            const file = layerElement.querySelector(".layer-file").files[0];
            if (file) {
                data.file_name = file.name;
                data.file_type = data.model === "file_epsilon" ? "epsilon" : "nk";
                
                const formData = new FormData();
                formData.append("file", file);
                formData.append("file_type", data.file_type);
                
                try {
                    const response = await fetch("/api/upload-optical-data", {
                        method: "POST",
                        body: formData
                    });
                    const result = await response.json();
                    if (result.error) {
                        throw new Error(result.error);
                    }
                    data.optical_data = result.data;
                } catch (e) {
                    console.error("Error uploading layer optical data:", e);
                }
            }
        }
    } else if (layerType === 'heterogeneous') {
        // ⭐ Capa heterogénea (EMT)
        data.layer_type = 'emt'; // Backend espera 'emt'
        data.emt_model = layerElement.querySelector('.emt-model-select').value;
        data.components = [];

        const components = layerElement.querySelectorAll('.emt-component');
        
        for (const compEl of components) {
            const compData = {};
            compData.name = compEl.querySelector('.component-name').value;
            
            let fraction = Number(compEl.querySelector('.component-fraction').value);
            const isPercent = compEl.querySelector('.fraction-is-percent').checked;
            if (isPercent) {
                fraction = fraction / 100;
            }
            compData.fraction = fraction;

            const model = compEl.querySelector('.component-model').value;
            compData.model = model;

            if (model === 'constant') {
                compData.n = Number(compEl.querySelector('.component-n').value);
                compData.k = Number(compEl.querySelector('.component-k').value);
            } else if (model === 'custom') {
                // ⭐ NUEVO: Ecuación personalizada
                const equationInput = compEl.querySelector('.component-custom-section .latex-equation-value');
                compData.equation = equationInput ? equationInput.value : '';
            } else if (dispersionTemplates[model]) {
                compData.params = {};
                const inputs = compEl.querySelectorAll('.component-param');
                inputs.forEach(inp => {
                    const val = inp.value.trim();
                    compData.params[inp.dataset.param] = val !== '' ? Number(val) : null;
                });
            } else if (model === "file_nk" || model === "file_epsilon") {
                const file = compEl.querySelector('.component-file').files[0];
                if (file) {
                    compData.file_name = file.name;
                    compData.file_type = model === "file_epsilon" ? "epsilon" : "nk";
                    
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("file_type", compData.file_type);
                    
                    try {
                        const response = await fetch("/api/upload-optical-data", {
                            method: "POST",
                            body: formData
                        });
                        const result = await response.json();
                        if (result.error) {
                            throw new Error(result.error);
                        }
                        compData.optical_data = result.data;
                    } catch (e) {
                        console.error("Error uploading component optical data:", e);
                    }
                }
            }

            data.components.push(compData);
        }
    }
    
    return data;
}

wizardSaveBtn.addEventListener("click", async () => {
    wizardSaveBtn.disabled = true;
    wizardSaveBtn.innerText = "Guardando...";
    
    try {
        const model = { 
            global: {}, 
            ambient: {}, 
            substrate: {}, 
            layers: [],
            created_at: new Date().toISOString()
        };
        
        model.global.angle = Number(document.getElementById("input-angle").value);
        model.global.polarization = document.getElementById("input-polarization").value;
        
        const wlMode = document.querySelector('input[name="wl-option"]:checked').value;
        model.global.wavelength_mode = wlMode;
        
        if (wlMode === "range") {
            model.global.wl_from = Number(document.getElementById("input-wl-from").value);
            model.global.wl_to = Number(document.getElementById("input-wl-to").value);
            model.global.wl_steps = Number(document.getElementById("input-wl-steps").value);
        } else if (wlMode === "single") {
            model.global.wl_single = Number(document.getElementById("input-wl-single").value);
        } else if (wlMode === "file") {
            model.global.wavelengths = uploadedWavelengths;
        }

        model.ambient = await collectMediumData('ambient');
        model.substrate = await collectMediumData('substrate');

        for (const layerEl of layersContainer.children) {
            const layerData = await collectLayerData(layerEl);
            model.layers.push(layerData);
        }

        const response = await fetch("/api/save-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(model)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        savedModel = model;
        savedModel.filename = result.filename;
        
        modelWizardModal.hide();
        
        document.getElementById("model-saved-banner").style.display = "block";
        
        alert("✓ Modelo óptico guardado correctamente en: " + result.filename);
        
    } catch (error) {
        wizardError.innerText = "Error al guardar: " + error.message;
        wizardError.style.display = "block";
    } finally {
        wizardSaveBtn.disabled = false;
        wizardSaveBtn.innerText = "Guardar modelo";
    }
});

document.getElementById("view-model-link").addEventListener("click", (e) => {
    e.preventDefault();
    if (savedModel) {
        showModelSummaryModal(savedModel);
    }
});

function showModelSummaryModal(model) {
    const modalBody = document.getElementById("summary-modal-body");
    
    let html = '<h6>Configuración Global</h6>';
    html += `<ul>
        <li><strong>Ángulo de incidencia:</strong> ${model.global.angle}°</li>
        <li><strong>Polarización:</strong> ${model.global.polarization}</li>
        <li><strong>Modo de longitud de onda:</strong> ${model.global.wavelength_mode}</li>
    </ul>`;
    
    if (model.global.wavelength_mode === "range") {
        html += `<p>Rango: ${model.global.wl_from} - ${model.global.wl_to} nm (${model.global.wl_steps} pasos)</p>`;
    } else if (model.global.wavelength_mode === "single") {
        html += `<p>Longitud única: ${model.global.wl_single} nm</p>`;
    }
    
    html += '<h6 class="mt-3">Medio Ambiente</h6>';
    html += `<p>Tipo: ${model.ambient.type}</p>`;
    if (model.ambient.n !== undefined) {
        html += `<p>n = ${model.ambient.n}, k = ${model.ambient.k || 0}</p>`;
    }
    
    html += '<h6 class="mt-3">Sustrato</h6>';
    html += `<p>Tipo: ${model.substrate.type}</p>`;
    if (model.substrate.n !== undefined) {
        html += `<p>n = ${model.substrate.n}, k = ${model.substrate.k || 0}</p>`;
    }
    
    html += '<h6 class="mt-3">Capas</h6>';
    if (model.layers.length === 0) {
        html += '<p class="text-muted">No hay capas definidas</p>';
    } else {
        html += '<table class="table table-sm table-bordered"><thead><tr>';
        html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Tipo</th><th>Detalles</th>';
        html += '</tr></thead><tbody>';
        
        model.layers.forEach((layer, i) => {
            const typeText = layer.layer_type === 'homogeneous' ? 'Homogénea' : 
                           layer.layer_type === 'emt' ? `EMT (${layer.components?.length || 0} comp.)` :
                           'No definido';
            
            let details = '';
            if (layer.layer_type === 'homogeneous') {
                details = layer.model;
            } else if (layer.layer_type === 'emt') {
                details = layer.emt_model;
            }
            
            html += `<tr>
                <td>${i + 1}</td>
                <td>${layer.name}</td>
                <td>${layer.thickness}</td>
                <td>${typeText}</td>
                <td>${details}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
    }
    
    if (model.filename) {
        html += `<p class="mt-3 text-muted small">Guardado en: ${model.filename}</p>`;
    }
    
    modalBody.innerHTML = html;
    
    const summaryModal = new bootstrap.Modal(document.getElementById("modelSummaryModal"));
    summaryModal.show();
}

updateMediumFields('ambient', 'constant');
updateMediumFields('substrate', 'glass');

// ========================================
// SISTEMA DE ECUACIONES LATEX
// ========================================

let currentLatexFieldId = null;

function openLatexEditor(fieldId) {
    currentLatexFieldId = fieldId;
    const existingLatex = document.querySelector(`#${fieldId} .latex-equation-value`)?.value || '';
    const mathField = document.getElementById('latex-math-editor');
    if (mathField) { mathField.value = existingLatex; }
    updateLatexPreview();
    const modal = new bootstrap.Modal(document.getElementById('latexEditorModal'));
    modal.show();
}

function updateLatexPreview() {
    const mathField = document.getElementById('latex-math-editor');
    const preview = document.getElementById('latex-preview');
    if (mathField && preview) {
        const latex = mathField.value;
        if (latex) {
            preview.innerHTML = `$$n(\\lambda) = ${latex}$$`;
            if (window.MathJax) { MathJax.typesetPromise([preview]); }
        } else {
            preview.innerHTML = '<em class="text-muted">La ecuación aparecerá aquí</em>';
        }
    }
}

function insertLatexExample(latex) {
    const mathField = document.getElementById('latex-math-editor');
    if (mathField) { mathField.value = latex; updateLatexPreview(); }
}

document.addEventListener('DOMContentLoaded', () => {
    const mathField = document.getElementById('latex-math-editor');
    if (mathField) { mathField.addEventListener('input', updateLatexPreview); }
    
    const saveBtn = document.getElementById('save-latex-equation');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const mathField = document.getElementById('latex-math-editor');
            const latex = mathField?.value || '';
            if (!latex) { alert('⚠️ Escribe una ecuación'); return; }
            if (currentLatexFieldId) {
                const section = document.querySelector(`#${currentLatexFieldId}`);
                if (section) {
                    const hiddenInput = section.querySelector('.latex-equation-value');
                    const displayDiv = section.querySelector('.latex-equation-display');
                    if (hiddenInput) hiddenInput.value = latex;
                    if (displayDiv) {
                        displayDiv.innerHTML = `$$n(\\lambda) = ${latex}$$`;
                        if (window.MathJax) { MathJax.typesetPromise([displayDiv]); }
                    }
                }
            }
            const modal = bootstrap.Modal.getInstance(document.getElementById('latexEditorModal'));
            if (modal) modal.hide();
        });
    }
});