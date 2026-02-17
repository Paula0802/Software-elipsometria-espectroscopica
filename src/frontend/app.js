document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOMContentLoaded ejecutado');
    
    // ==========================================
    // 1. HABILITAR BOTONES EMT
    // ==========================================
    document.querySelectorAll('button[onclick*="calculateEffectiveNK"]').forEach(btn => {
        btn.disabled = false;
        if (!btn.innerHTML.includes('Calcular')) {
            btn.innerHTML = '🔬 Calcular n,k efectivos';
            btn.classList.remove('btn-success');
            btn.classList.add('btn-warning');
        }
    });
    console.log('✅ Botones EMT habilitados');

    // ==========================================
    // 2. EVENT LISTENERS PARA ARCHIVO Y GRÁFICAS
    // ==========================================
    const inputFile = document.getElementById("inputFile");
    const showGrid = document.getElementById("showGrid");
    const whiteBackground = document.getElementById("whiteBackground");
    
    if (inputFile) {
        inputFile.addEventListener("change", uploadFile);
        console.log('✅ Event listener de inputFile registrado');
    }
    
    if (showGrid) {
        showGrid.addEventListener("change", updateGraphSettings);
    }
    
    if (whiteBackground) {
        whiteBackground.addEventListener("change", updateGraphSettings);
    }

    // ==========================================
    // 3. BOTÓN GUARDAR MODELO
    // ==========================================
    // NOTA: El listener del botón guardar se maneja mediante
    // event delegation al final del archivo (línea ~3200+)
    // Esto permite que funcione en todos los pasos del wizard
    console.log('✅ Botón guardar modelo manejado por event delegation');
});

// ⭐⭐⭐ FIX DEFINITIVO: Un solo listener para addLayer ⭐⭐⭐
(function() {
    if (window._addLayerFixApplied) return;
    window._addLayerFixApplied = true;
    
    let isAddingLayer = false; // Flag para prevenir doble ejecución
    
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'add-layer') {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevenir múltiples clicks rápidos
            if (isAddingLayer) {
                console.log('⚠️ Ya se está agregando una capa...');
                return;
            }
            
            isAddingLayer = true;
            console.log('➕ Agregando UNA sola capa...');
            
            // Llamar a addLayer UNA sola vez
            if (typeof addLayer === 'function') {
                addLayer();
            }
            
            // Resetear flag después de un pequeño delay
            setTimeout(() => {
                isAddingLayer = false;
            }, 300);
        }
    }, true); // Fase de captura
    
    console.log('✅ Fix de add-layer aplicado (versión 2)');
})();

// ⭐ Event delegation para navegación del wizard
document.getElementById("modelWizardModal")?.addEventListener("click", async (e) => {
    const target = e.target;
    
    // Botón siguiente
    if (target.matches('.wizard-next-btn') || target.closest('.wizard-next-btn')) {
        e.preventDefault();
        if (currentStep < 4) {
            if (!(await validateStep(currentStep))) return;
            currentStep++;
            showStep(currentStep);
        }
    }
    
    // Botón anterior
    if (target.matches('.wizard-prev-btn') || target.closest('.wizard-prev-btn')) {
        e.preventDefault();
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
        }
    }
    
    // Botón guardar (ya tienes wizardSaveBtn.addEventListener, déjalo)
});

let currentData = null;
let uploadedFileData = null;
let uploadedWavelengths = [];
let uploadedPsi = [];        
let uploadedDelta = [];
let savedModel = null;

// ==========================================
// VARIABLES GLOBALES PARA OPTIMIZACIÓN
// ==========================================

let currentOpticalModel = null;  // Modelo óptico guardado
let theoreticalPsi = [];         // Psi teórico calculado
let theoreticalDelta = [];       // Delta teórico calculado
let theoreticalWavelengths = []; // Longitudes de onda teóricas
let optimizationResults = null;  // Resultados de optimización
let isOptimizing = false;        // Flag para evitar múltiples optimizaciones simultáneas
let experimentalData = []; // Datos experimentales completos (con wavelength, psi, delta)
let lastOptimizationParams = null; // Últimos parámetros usados en optimización

async function uploadFile() {
    const file = document.getElementById("inputFile").files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    console.log("Subiendo archivo:", file.name);

    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });

        console.log("Respuesta del servidor:", response.status);

        const data = await response.json();
        console.log("Datos recibidos:", data);

        if (data.error) {
            alert("Error: " + data.error);
            console.error("Error del servidor:", data.error);
            return;
        }

        console.log("Columnas encontradas:", data.columns);
        console.log("Filas totales:", data.total_rows);

        const cols = Array.isArray(data.columns) ? data.columns : (Array.isArray(data.preview) && data.preview.length ? Object.keys(data.preview[0]) : []);
        const previewRows = Array.isArray(data.preview) ? data.preview : (Array.isArray(data.full_data) ? data.full_data.slice(0, 10) : []);
        const fullData = Array.isArray(data.full_data) ? data.full_data : (Array.isArray(data.preview) ? data.preview : []);

        fillPreviewTable(cols, previewRows);
        currentData = { columns: cols, fullData: fullData };
        uploadedFileData = fullData;
        
        // EXTRAER WAVELENGTHS, PSI Y DELTA 
        const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
        const psiCol = findColumn(cols, ["psi"]);
        const deltaCol = findColumn(cols, ["delta"]);
        
        if (lambdaCol) {
            uploadedWavelengths = data.full_data.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
            console.log("Longitudes de onda extraídas:", uploadedWavelengths.length);
        }
        
        if (psiCol) {
            uploadedPsi = data.full_data.map(r => r[psiCol]).filter(v => v !== null && v !== undefined);
            console.log("Valores de Psi extraídos:", uploadedPsi.length);
        }
        
        if (deltaCol) {
            uploadedDelta = data.full_data.map(r => r[deltaCol]).filter(v => v !== null && v !== undefined);
            console.log("Valores de Delta extraídos:", uploadedDelta.length);
        }
        
        drawGraphs(cols, fullData);
        document.getElementById("btn-continue-model").style.display = "block";

    } catch (error) {
        console.error("Error capturado:", error);
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
    
    console.log("Iniciando drawGraphs...");
    console.log("Columnas:", columns);
    console.log("Datos completos:", fullData.length, "filas");
    
    let lambdaCol = findColumn(columns, ["lambda", "longitud", "wavelength", "nm", "wave"]);
    let psiCol = findColumn(columns, ["psi"]);
    let deltaCol = findColumn(columns, ["delta"]);

    console.log("Columnas encontradas:");
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

    console.log("Limpiando divs de gráficas...");
    document.getElementById("psiPlot").innerHTML = "";
    document.getElementById("deltaPlot").innerHTML = "";
    document.getElementById("combinedPlot").innerHTML = "";

    const lambda = fullData.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
    const psi = fullData.map(r => r[psiCol]).filter(v => v !== null && v !== undefined);
    const delta = fullData.map(r => r[deltaCol]).filter(v => v !== null && v !== undefined);

    console.log("Datos extraídos:");
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

    console.log("Gráfica Psi creada");

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

    console.log("Gráfica Delta creada");

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

    console.log("Gráfica Combinada creada");
    console.log("Todas las gráficas completadas");
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
let wizardSteps = []; // Inicializar vacío
let currentStep = 1;

// INICIALIZAR PASOS CUANDO SE ABRE EL MODAL
document.getElementById("btn-continue-model").addEventListener("click", () => {
    // Inicializar wizard
    currentStep = 1;
    
    // CAPTURAR PASOS DEL WIZARD
    wizardSteps = [...document.querySelectorAll(".wizard-step")];
    
    console.log('🔍 DEBUG WIZARD:');
    console.log('  - Total pasos:', wizardSteps.length);
    console.log('  - Paso 1:', document.querySelector('[data-step="1"]') ? '✅' : '❌');
    console.log('  - Paso 2:', document.querySelector('[data-step="2"]') ? '✅' : '❌');
    console.log('  - Paso 3:', document.querySelector('[data-step="3"]') ? '✅' : '❌');
    console.log('  - Contenedor capas:', document.getElementById('layers-container') ? '✅' : '❌');
    console.log('  - Botón agregar capa:', document.getElementById('add-layer') ? '✅' : '❌');
    
    // ⭐ INICIALIZAR INTERFAZ DEL AMBIENTE AL ABRIR EL MODAL
    const ambientTypeChecked = document.querySelector('input[name="ambient-type"]:checked');
    if (ambientTypeChecked) {
        updateAmbientTypeInterface(ambientTypeChecked.value);
    } else {
        // Por defecto, marcar homogéneo y mostrar esa interfaz
        document.getElementById('ambient-type-homo').checked = true;
        updateAmbientTypeInterface('homogeneous');
    }
    
    // Mostrar primer paso
    document.getElementById("wizard-step-num").innerText = currentStep;
    showStep(currentStep);
    
    // Abrir modal
    modelWizardModal.show();
});


function showStep(n) {
    console.log(`🎯 showStep llamado con n=${n}`);
    
    // Ocultar TODOS los pasos
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.style.display = 'none';
        step.classList.add('d-none');
    });
    
    // Mostrar el paso actual
    const currentStepElement = document.querySelector(`[data-step="${n}"]`);
    console.log(`  Elemento del paso ${n}:`, currentStepElement);
    
    if (currentStepElement) {
        currentStepElement.style.display = 'block';
        currentStepElement.classList.remove('d-none');
        console.log(`  ✅ Paso ${n} mostrado correctamente`);
    } else {
        console.error(`  ❌ No se encontró el elemento del paso ${n}`);
    }
    
    // Actualizar número de paso
    const stepNum = document.getElementById("wizard-step-num");
    if (stepNum) stepNum.textContent = n;
    
    // Actualizar barra de progreso
    const totalSteps = 4;
    const progressPercentage = (n / totalSteps) * 100;
    const progressBar = document.getElementById('wizard-progress-bar');
    if (progressBar) {
        progressBar.style.width = progressPercentage + '%';
        progressBar.setAttribute('aria-valuenow', progressPercentage);
    }
    
    // Configurar botones del paso actual
    const stepFooter = currentStepElement ? currentStepElement.querySelector('.wizard-step-footer') : null;
    if (stepFooter) {
        const prevBtn = stepFooter.querySelector('.wizard-prev-btn');
        const nextBtn = stepFooter.querySelector('.wizard-next-btn');
        const saveBtn = stepFooter.querySelector('.wizard-save-btn');
        const errorDiv = stepFooter.querySelector('.text-danger');
        
        if (prevBtn) prevBtn.style.display = (n === 1) ? 'none' : 'inline-block';
        if (nextBtn) nextBtn.style.display = (n === totalSteps) ? 'none' : 'inline-block';
        if (saveBtn) saveBtn.classList.toggle('d-none', n !== totalSteps);
        if (errorDiv) errorDiv.style.display = 'none';
    }
    
    // ⭐ Inicializar interfaz del ambiente al mostrar paso 2
    if (n === 2) {
        console.log('🔧 Inicializando Paso 2 (Ambiente)...');
        
        const ambientTypeChecked = document.querySelector('input[name="ambient-type"]:checked');
        if (ambientTypeChecked) {
            updateAmbientTypeInterface(ambientTypeChecked.value);
        } else {
            const homoRadio = document.getElementById('ambient-type-homo');
            if (homoRadio) homoRadio.checked = true;
            updateAmbientTypeInterface('homogeneous');
        }
    }
    
    // ⭐ CORREGIDO: Inicializar interfaz del sustrato al mostrar paso 3
    if (n === 3) {
        console.log('🔧 Inicializando Paso 3 (Sustrato)...');
        
        // 1. Inicializar tipo de sustrato (homogéneo/EMT)
        const substrateTypeChecked = document.querySelector('input[name="substrate-type"]:checked');
        if (substrateTypeChecked) {
            updateSubstrateTypeInterface(substrateTypeChecked.value);
        } else {
            const homoRadio = document.getElementById('substrate-type-homo');
            if (homoRadio) homoRadio.checked = true;
            updateSubstrateTypeInterface('homogeneous');
        }
        
        // 2. Inicializar el modelo del sustrato SI es homogéneo
        const substrateHomoConfig = document.getElementById('substrate-homo-config');
        if (substrateHomoConfig && substrateHomoConfig.style.display !== 'none') {
            const substrateModel = document.getElementById('substrate-model');
            if (substrateModel) {
                const modelValue = substrateModel.value;
                console.log(`  Sustrato modelo seleccionado: ${modelValue}`);
                
                // ⭐ Manejar presets especiales (glass, si, constant)
                if (modelValue === 'glass' || modelValue === 'si' || modelValue === 'constant') {
                    const constantField = document.getElementById('substrate-constant-field');
                    const paramsDiv = document.getElementById('substrate-params');
                    const fileUpload = document.getElementById('substrate-file-upload');
                    const customEq = document.getElementById('substrate-custom-eq');
                    
                    if (constantField) constantField.style.display = 'block';
                    if (paramsDiv) paramsDiv.innerHTML = '';
                    if (fileUpload) fileUpload.style.display = 'none';
                    if (customEq) customEq.style.display = 'none';
                    
                    // Establecer valores por defecto según el preset
                    const nInput = document.getElementById('substrate-n-constant');
                    const kInput = document.getElementById('substrate-k-constant');
                    
                    if (modelValue === 'glass') {
                        if (nInput) nInput.value = '1.52';
                        if (kInput) kInput.value = '0';
                    } else if (modelValue === 'si') {
                        if (nInput) nInput.value = '3.87';
                        if (kInput) kInput.value = '0.02';
                    }
                    
                    console.log(`  ✅ Preset ${modelValue} aplicado`);
                } else if (modelValue !== 'file_nk' && modelValue !== 'file_epsilon' && modelValue !== 'custom') {
                    // Para modelos de dispersión reales
                    updateMediumFieldsEnhanced('substrate', modelValue);
                }
            }
        }
    }
    
    // ⭐ Inicializar paso 4 (Capas) y mostrar resumen
    if (n === 4) {
        console.log('🔧 Inicializando Paso 4 (Capas)...');
        updateModelSummary();
    }
}


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
////
// FUNCIÓN: Obtener longitudes de onda según configuración del usuario
//  FUNCIÓN: Obtener longitudes de onda según configuración del usuario
function getWavelengthsArray() {
    // Obtener el modo seleccionado (corregido el nombre del radio button)
    const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;
    
    if (wlMode === 'file') {
        // Usar longitudes de onda del archivo experimental
        if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
            throw new Error('No hay datos experimentales cargados. Sube un archivo primero.');
        }
        return uploadedWavelengths;
        
    } else if (wlMode === 'range') {
        // Generar rango
        const wlFrom = parseFloat(document.getElementById('input-wl-from')?.value);
        const wlTo = parseFloat(document.getElementById('input-wl-to')?.value);
        const wlSteps = parseInt(document.getElementById('input-wl-steps')?.value);
        
        if (isNaN(wlFrom) || isNaN(wlTo) || isNaN(wlSteps)) {
            throw new Error('Define el rango de longitudes de onda (inicio, fin, pasos)');
        }
        
        if (wlFrom >= wlTo) {
            throw new Error('La longitud inicial debe ser menor que la final');
        }
        
        if (wlSteps < 2) {
            throw new Error('Se requieren al menos 2 pasos');
        }
        
        const wavelengths = [];
        const step = (wlTo - wlFrom) / (wlSteps - 1);
        for (let i = 0; i < wlSteps; i++) {
            wavelengths.push(wlFrom + i * step);
        }
        return wavelengths;
        
    } else if (wlMode === 'single') {
        // Una sola longitud de onda
        const wlSingle = parseFloat(document.getElementById('input-wl-single')?.value);
        
        if (isNaN(wlSingle) || wlSingle <= 0) {
            throw new Error('Define una longitud de onda válida (> 0 nm)');
        }
        
        return [wlSingle];
    }
    
    throw new Error('Selecciona un modo de longitud de onda');
} 


window.dispersionTemplates = {

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
        helpText: "Modelo Drude para metales y semiconductores dopados. ε∞ es la permitividad a alta frecuencia, ωp la frecuencia de plasma, f₀ la fuerza del oscilador y Γ₀ el damping.",
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
            // Primer oscilador (siempre visible)
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
        helpText: "Modelo de Lorentz para dieléctricos con resonancias. ε∞ es la permitividad de fondo, ωp la frecuencia de plasma, fⱼ la fuerza del oscilador j, ωⱼ su frecuencia de resonancia y Γⱼ el damping.",
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
            // Parámetros globales
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            { name: "omega_p", placeholder: "ωp (eV)", canOptimize: true },
            // Término Drude (siempre visible)
            { name: "f0", placeholder: "f₀ (Drude)", canOptimize: true },
            { name: "gamma_0", placeholder: "Γ₀ (eV)", canOptimize: true },
            // Primer oscilador Lorentz (siempre visible)
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
        helpText: "Modelo Drude-Lorentz combinado para metales con transiciones interbanda. Término Drude (f₀, Γ₀) para electrones libres + osciladores Lorentz (fⱼ, ωⱼ, Γⱼ) para transiciones electrónicas. Todos usan ωp² común.",
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
            
            // Término Drude
            let drudeTerms = '';
            if (p['f0'] !== undefined && p['f0'] !== null && p['f0'] !== '') {
                const f0val = getValue('f0', 'f_0');
                const g0val = getValue('gamma_0', '\\Gamma_0');
                drudeTerms = ` - \\frac{${f0val} \\cdot ${omega_p}^2}{\\omega^2 + i\\cdot ${g0val}\\cdot\\omega}`;
            }
            
            // Osciladores Lorentz
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



/**
 * Crea un campo de parámetro con checkbox de optimización
 * VERSIÓN v5.0: Con controles de variación para Multiguess
 */
function createParamFieldWithOptimize(param, prefix = '') {
    const inputId = `${prefix}${param.name}`;
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'param-field mb-2';
    fieldDiv.dataset.paramName = inputId; // ⭐ Para encontrarlo después en collectParametersToOptimize
    
    fieldDiv.innerHTML = `
        <label class="form-label small mb-1">${param.placeholder}</label>
        <div class="input-group input-group-sm mb-1">
            <input class="form-control layer-param"
                   id="${inputId}"
                   data-param="${param.name}"
                   placeholder="${param.placeholder}"
                   type="number"
                   step="any">
            ${param.canOptimize ? `
                <span class="input-group-text bg-light">
                    <input class="form-check-input mt-0 optimize-param"
                           type="checkbox"
                           data-param="${param.name}"
                           title="Optimizar ${param.name}">
                </span>
                <span class="input-group-text small">Opt</span>
            ` : ''}
        </div>
        
        ${param.canOptimize ? `
            <!-- ⭐⭐⭐ NUEVO v5.0: Controles de variación multiguess ⭐⭐⭐ -->
            <div class="multiguess-variation-controls d-flex gap-2 align-items-center mt-2" style="font-size: 0.85rem;">
                <small class="text-muted" style="min-width: 60px;">Variación:</small>
                <select class="variation-mode-select form-select form-select-sm" style="width: 100px;" title="Modo de variación para multiguess">
                    <option value="relative" selected>% Relativo</option>
                    <option value="absolute">Absoluto</option>
                </select>
                <input type="number" 
                       class="variation-value-input form-control form-control-sm" 
                       style="width: 70px;" 
                       value="20" 
                       min="0.1" 
                       step="1" 
                       title="Valor de variación (% o absoluto)">
                <small class="text-muted variation-unit">%</small>
            </div>
        ` : ''}
    `;
    
    // ⭐ v5.0: Event listener para actualizar la unidad cuando cambia el modo
    if (param.canOptimize) {
        setTimeout(() => {
            const modeSelect = fieldDiv.querySelector('.variation-mode-select');
            const unitSpan = fieldDiv.querySelector('.variation-unit');
            if (modeSelect && unitSpan) {
                modeSelect.addEventListener('change', function() {
                    unitSpan.textContent = this.value === 'relative' ? '%' : '';
                });
            }
        }, 0);
    }
    
    return fieldDiv;
}

// ============================================================================
// 2. FUNCIÓN: Agregar oscilador/término dinámico
// ============================================================================
function addDynamicOscillator(container, model, currentIndex) {
    const template = window.dispersionTemplates[model];
    if (!template || !template.generateDynamicParam) return null;
    
    const newIndex = currentIndex + 1;
    const newParams = template.generateDynamicParam(newIndex);
    
    const oscDiv = document.createElement('div');
    oscDiv.className = 'dynamic-oscillator border-top pt-2 mt-2';
    oscDiv.dataset.oscIndex = newIndex;
    
    const oscHeader = document.createElement('div');
    oscHeader.className = 'd-flex justify-content-between align-items-center mb-2';
    oscHeader.innerHTML = `
        <small class="text-muted fw-bold">${template.termName || 'Termino'} ${newIndex}</small>
        <button type="button" class="btn btn-sm btn-outline-danger remove-osc-btn" title="Eliminar">x</button>
    `;
    oscDiv.appendChild(oscHeader);
    
    // Agregar campos de parámetros
    newParams.forEach(param => {
        const field = createParamFieldWithOptimize(param, `${model}-osc${newIndex}-`);
        oscDiv.appendChild(field);
    });
    
    // Event listener para eliminar
    const removeBtn = oscDiv.querySelector('.remove-osc-btn');
    removeBtn.addEventListener('click', () => {
        oscDiv.remove();
        // Actualizar contador del botón
        const addBtn = container.querySelector('.add-oscillator-btn');
        if (addBtn) {
            const currentCount = parseInt(addBtn.dataset.oscCount) || 1;
            addBtn.dataset.oscCount = String(currentCount - 1);
        }
        // Actualizar preview
        const previewControls = container._previewControls;
        if (previewControls && previewControls.updatePreview) {
            previewControls.updatePreview();
        }
    });
    
    return oscDiv;
}

// ============================================================================
// 3. FUNCIÓN: Setup de vista previa en tiempo real (Live Preview)
// ============================================================================
function setupLivePreview(container, model) {
    const template = window.dispersionTemplates[model];
    if (!template) return null;
    
    // Función para recolectar todos los parámetros
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
    
    // Función para actualizar la vista previa de la ecuación
    const updatePreview = () => {
        const params = getAllParams();
        
        // Buscar contenedor de vista previa
        let previewSection = container.closest('.model-config-container')?.querySelector('.equation-preview-section');
        
        if (!previewSection) {
            previewSection = container.querySelector('.equation-preview-section');
        }
        
        if (!previewSection) return;
        
        const valueDisplay = previewSection.querySelector('.equation-with-values');
        if (!valueDisplay) return;
        
        // Generar ecuación con valores usando previewFn
        if (template.previewFn) {
            const valueEquation = template.previewFn(params);
            valueDisplay.innerHTML = `$$${valueEquation}$$`;
            
            // Renderizar con MathJax
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([valueDisplay]).catch(err => {
                    console.error('Error MathJax:', err);
                });
            }
        }
    };
    
    // Agregar listeners a todos los inputs
    const inputs = container.querySelectorAll('.layer-param');
    inputs.forEach(inp => {
        inp.addEventListener('input', updatePreview);
    });
    
    // Vista previa inicial
    setTimeout(updatePreview, 100);
    
    return { getAllParams, updatePreview };
}

// ============================================================================
// 4. FUNCIÓN PRINCIPAL: Actualizar campos de modelo con interfaz dividida
// ============================================================================
function updateModelFieldsEnhanced(container, model, prefix = '') {
    container.innerHTML = '';
    
    const template = window.dispersionTemplates[model];
    if (!template) {
        console.warn('Modelo no encontrado:', model);
        return;
    }
    
    // Crear estructura de interfaz dividida
    const splitContainer = document.createElement('div');
    splitContainer.className = 'row g-3';
    
    // ========== COLUMNA IZQUIERDA: PARÁMETROS ==========
    const paramsColumn = document.createElement('div');
    paramsColumn.className = 'col-md-6';
    
    const paramsCard = document.createElement('div');
    paramsCard.className = 'params-side';
    
    // Título de parámetros
    const paramsTitle = document.createElement('h6');
    paramsTitle.className = 'text-muted small mb-2 fw-bold';
    paramsTitle.textContent = 'Parametros del modelo:';
    paramsCard.appendChild(paramsTitle);
    
    // Agregar campos de parámetros base
    template.params.forEach(param => {
        const field = createParamFieldWithOptimize(param, prefix);
        paramsCard.appendChild(field);
    });
    
    // Contenedor para osciladores dinámicos
    const dynamicContainer = document.createElement('div');
    dynamicContainer.className = 'dynamic-oscillators-container';
    paramsCard.appendChild(dynamicContainer);
    
    // Botón para agregar osciladores (solo si el modelo lo soporta)
    if (template.maxOscillators && template.generateDynamicParam) {
        const addOscBtn = document.createElement('button');
        addOscBtn.type = 'button';
        addOscBtn.className = 'btn btn-sm btn-outline-primary w-100 mt-2 add-oscillator-btn';
        
        const termName = template.termName || 'termino';
        addOscBtn.innerHTML = `+ Agregar ${termName} (max ${template.maxOscillators})`;
        addOscBtn.dataset.oscCount = '1';
        
        addOscBtn.addEventListener('click', () => {
            const currentCount = parseInt(addOscBtn.dataset.oscCount) || 1;
            
            if (currentCount >= template.maxOscillators) {
                alert(`Maximo de ${template.maxOscillators} ${termName}s alcanzado`);
                return;
            }
            
            const newOsc = addDynamicOscillator(dynamicContainer, model, currentCount);
            
            if (newOsc) {
                dynamicContainer.appendChild(newOsc);
                addOscBtn.dataset.oscCount = String(currentCount + 1);
                
                // Agregar listeners a nuevos inputs
                const newInputs = newOsc.querySelectorAll('.layer-param');
                newInputs.forEach(inp => {
                    inp.addEventListener('input', () => {
                        if (container._previewControls && container._previewControls.updatePreview) {
                            container._previewControls.updatePreview();
                        }
                    });
                });
                
                // Actualizar preview
                if (container._previewControls && container._previewControls.updatePreview) {
                    container._previewControls.updatePreview();
                }
            }
        });
        
        paramsCard.appendChild(addOscBtn);
    }
    
    paramsColumn.appendChild(paramsCard);
    
    // ========== COLUMNA DERECHA: ECUACIÓN ==========
    const equationColumn = document.createElement('div');
    equationColumn.className = 'col-md-6';
    
    const equationCard = document.createElement('div');
    equationCard.className = 'equation-preview-section border rounded p-3 bg-light h-100';
    
    // Título
    const eqTitle = document.createElement('h6');
    eqTitle.className = 'text-muted small mb-2 fw-bold';
    eqTitle.textContent = 'Vista previa de ecuacion:';
    equationCard.appendChild(eqTitle);
    
    // Ecuación del modelo (template)
    const modelEqDiv = document.createElement('div');
    modelEqDiv.className = 'mb-3 pb-3 border-bottom';
    modelEqDiv.innerHTML = `
        <small class="text-muted d-block mb-2">Modelo ${template.label}:</small>
        <div class="equation-template text-center p-2 bg-white rounded border">
            $$${template.equation}$$
        </div>
    `;
    equationCard.appendChild(modelEqDiv);
    
    // Ecuación con valores del usuario
    const valueEqDiv = document.createElement('div');
    valueEqDiv.className = 'mb-2';
    valueEqDiv.innerHTML = `
        <small class="text-muted d-block mb-2">Con tus valores:</small>
        <div class="equation-with-values text-center p-2 bg-white rounded border">
            <em class="text-muted">Ingresa valores para ver la ecuacion</em>
        </div>
    `;
    equationCard.appendChild(valueEqDiv);
    
    // Texto de ayuda (si existe)
    if (template.helpText) {
        const helpDiv = document.createElement('div');
        helpDiv.className = 'alert alert-info small mt-3 mb-0';
        helpDiv.innerHTML = `<strong>Info:</strong> ${template.helpText}`;
        equationCard.appendChild(helpDiv);
    }
    
    equationColumn.appendChild(equationCard);
    
    // ========== ENSAMBLAR ==========
    splitContainer.appendChild(paramsColumn);
    splitContainer.appendChild(equationColumn);
    container.appendChild(splitContainer);
    
    // Renderizar ecuación del modelo con MathJax
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


/**
 * Actualiza los campos de parámetros para un medio (ambiente o sustrato)
 * según el modelo de dispersión seleccionado
 * @param {string} medium - 'ambient' o 'substrate'
 * @param {string} modelType - tipo de modelo (cauchy, sellmeier, glass, etc.)
 */
function updateMediumFieldsEnhanced(medium, modelType) {
    console.log(`🔧 updateMediumFieldsEnhanced: medium=${medium}, model=${modelType}`);
    
    // Obtener referencias a los elementos del DOM
    const paramsDiv = document.getElementById(`${medium}-params`);
    const fileDiv = document.getElementById(`${medium}-file-upload`);
    const customDiv = document.getElementById(`${medium}-custom-eq`);
    const constantField = document.getElementById(`${medium}-constant-field`);
    const fileHelp = document.getElementById(`${medium}-file-help`);
    
    // Verificar que existe el contenedor de parámetros
    if (!paramsDiv) {
        console.error(`❌ No se encontró #${medium}-params`);
        return;
    }
    
    // Limpiar todo primero
    paramsDiv.innerHTML = "";
    if (fileDiv) fileDiv.style.display = "none";
    if (customDiv) customDiv.style.display = "none";
    if (constantField) constantField.style.display = "none";
    
    // ⭐ MANEJAR PRESETS ESPECIALES PRIMERO (glass, si, constant)
    if (modelType === "constant" || modelType === "glass" || modelType === "si") {
        console.log(`  📋 Aplicando preset: ${modelType}`);
        
        if (constantField) {
            constantField.style.display = "block";
            
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            
            if (modelType === "glass") {
                if (nInput) nInput.value = "1.52";
                if (kInput) kInput.value = "0";
                console.log(`  ✅ Glass preset aplicado: n=1.52, k=0`);
            } else if (modelType === "si") {
                if (nInput) nInput.value = "3.87";
                if (kInput) kInput.value = "0.02";
                console.log(`  ✅ Si preset aplicado: n=3.87, k=0.02`);
            } else {
                // Para "constant", mantener valores actuales o usar defaults
                console.log(`  ✅ Constant mode: usando valores actuales`);
            }
        } else {
            console.warn(`  ⚠️ No se encontró #${medium}-constant-field`);
        }
        return; // ⭐ IMPORTANTE: Salir aquí para presets
    }
    
    // Manejar archivos de datos ópticos
    if (modelType === "file_nk" || modelType === "file_epsilon") {
        console.log(`  📁 Modo archivo: ${modelType}`);
        
        if (fileDiv) {
            fileDiv.style.display = "block";
            if (fileHelp) {
                fileHelp.textContent = modelType === "file_epsilon"
                    ? "Archivo con columnas: omega, epsilon1, epsilon2"
                    : "Archivo con columnas: wavelength, n, k";
            }
        }
        return;
    }
    
    // Manejar ecuación personalizada
    if (modelType === "custom") {
        console.log(`  ✏️ Modo ecuación personalizada`);
        
        if (customDiv) {
            customDiv.style.display = "block";
        }
        return;
    }
    
    // ⭐ MANEJAR MODELOS DE DISPERSIÓN REALES
    // Verificar que existe el template para este modelo
    if (typeof window.dispersionTemplates === 'undefined') {
        console.error('❌ dispersionTemplates no está definido');
        return;
    }
    
    const template = window.dispersionTemplates[modelType];
    if (!template) {
        console.warn(`⚠️ No hay template para el modelo: ${modelType}`);
        return;
    }
    
    console.log(`  📐 Generando campos para modelo: ${modelType}`);
    
    // Generar campos de parámetros según el template
    const prefix = `${medium}-`;
    
    template.params.forEach(param => {
        const paramId = `${prefix}${param.name}`;
        const isOptimizable = param.optimizable !== false;
        
        const fieldHTML = `
            <div class="mb-2">
                <label class="form-label small">${param.label || param.name}</label>
                <div class="input-group input-group-sm">
                    <input type="number" 
                           class="form-control" 
                           id="${paramId}" 
                           value="${param.default || 0}" 
                           step="${param.step || 0.001}"
                           ${param.min !== undefined ? `min="${param.min}"` : ''}
                           ${param.max !== undefined ? `max="${param.max}"` : ''}>
                    ${isOptimizable ? `
                        <span class="input-group-text">
                            <input type="checkbox" 
                                   class="form-check-input mt-0 param-optimize" 
                                   id="${paramId}-optimize"
                                   title="Optimizar este parámetro">
                        </span>
                    ` : ''}
                </div>
                ${param.description ? `<div class="form-text small">${param.description}</div>` : ''}
            </div>
        `;
        
        paramsDiv.innerHTML += fieldHTML;
    });
    
    console.log(`  ✅ ${template.params.length} campos generados para ${modelType}`);
}



// ============================================================================
// 6. FUNCIÓN: Actualizar interfaz de componente EMT (para medios heterogéneos)
// ============================================================================
function updateEMTComponentModel(componentDiv, prefix = '') {
    const modelSelect = componentDiv.querySelector('.medium-component-model, .component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params, .component-params');
    const fileDiv = componentDiv.querySelector('.medium-component-file, .component-file');
    const constantDiv = componentDiv.querySelector('.medium-component-constant, .component-constant');
    const customDiv = componentDiv.querySelector('.medium-component-custom, .component-custom-section');
    
    if (!modelSelect || !paramsDiv) return;
    
    const model = modelSelect.value;
    
    // Ocultar todo
    if (fileDiv) fileDiv.style.display = "none";
    if (constantDiv) constantDiv.style.display = "none";
    if (customDiv) customDiv.style.display = "none";
    paramsDiv.innerHTML = "";
    
    if (model === 'constant') {
        if (constantDiv) constantDiv.style.display = "block";
        
    } else if (model === 'custom') {
        if (customDiv) customDiv.style.display = "block";
        
    } else if (window.dispersionTemplates[model]) {
        // Usar interfaz dividida
        updateModelFieldsEnhanced(paramsDiv, model, prefix);
        
    } else if (model === "file_nk" || model === "file_epsilon") {
        if (fileDiv) fileDiv.style.display = "block";
    }
}

// ============================================================================
// EXPORTAR FUNCIONES AL OBJETO WINDOW (para uso global)
// ============================================================================
window.createParamFieldWithOptimize = createParamFieldWithOptimize;
window.addDynamicOscillator = addDynamicOscillator;
window.setupLivePreview = setupLivePreview;
window.updateModelFieldsEnhanced = updateModelFieldsEnhanced;
window.updateMediumFieldsEnhanced = updateMediumFieldsEnhanced;
window.updateEMTComponentModel = updateEMTComponentModel;

console.log('Funciones de interfaz de dispersion cargadas correctamente');



document.getElementById("ambient-model").addEventListener("change", (e) => {
    updateMediumFieldsEnhanced('ambient', e.target.value); 
});

//  EVENT LISTENER PARA ARCHIVOS EN AMBIENTE HOMOGÉNEO 
const ambientFileInput = document.getElementById('ambient-file');

if (ambientFileInput) {
    ambientFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('[Ambiente Homogéneo] Subiendo archivo:', file.name);
        
        // Remover mensajes previos
        const prevMessages = ambientFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg, .material-validation-alert');
        prevMessages.forEach(msg => msg.remove());
        
        // Mostrar carga
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
        loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
        ambientFileInput.after(loadingMsg);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', 'nk');
        
        try {
            const response = await fetch('/api/upload-optical-data', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            loadingMsg.remove();
            
            //  VERIFICAR SUCCESS
            if (result.error || result.success === false) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>Error al procesar archivo</strong>
                    <p class="mb-0">${result.error || 'Error desconocido'}</p>
                `;
                ambientFileInput.after(errorDiv);
                return;
            }
            
            if (!result.info || !result.data) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>Respuesta incompleta del servidor</strong>
                `;
                ambientFileInput.after(errorDiv);
                return;
            }
            
            const info = result.info;
            const warnings = result.warnings || [];
            
            console.log('[Ambiente] Archivo procesado:', info);
            
            // Mostrar resultado de archivo procesado
            let warningsHTML = '';
            if (warnings.length > 0) {
                warningsHTML = `
                    <div class="mt-2 pt-2 border-top">
                        <strong>Advertencias de procesamiento:</strong>
                        <ul class="mb-0 small">
                            ${warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            const successDiv = document.createElement('div');
            successDiv.className = 'alert alert-success mt-2 file-result-msg';
            successDiv.innerHTML = `
                <strong> Archivo procesado</strong>
                <ul class="mb-0 small mt-2">
                    <li><strong>Formato:</strong> ${info.format}</li>
                    <li><strong>Puntos:</strong> ${info.points}</li>
                    <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                    <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                    <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                    ${info.units_converted ? `<li><strong>Conversión:</strong> ${info.units_converted}</li>` : ''}
                </ul>
                ${warningsHTML}
            `;
            
            ambientFileInput.after(successDiv);
            
            //  VALIDAR CONTRA MODO DE WAVELENGTH 
            const validation = await validateMaterialFileAgainstWavelengthMode(
                result.data.wavelength,
                ambientFileInput
            );
            
            showMaterialValidationResult(validation, ambientFileInput);

            console.log('[Ambiente] Validación:', validation);
            
            //MOSTRAR RESULTADO DE VALIDACIÓN
            showMaterialValidationResult(validation, ambientFileInput);
            
            // Guardar datos
            ambientFileInput.dataset.opticalData = JSON.stringify(result.data);
            
            console.log('[Ambiente] Completo');
            
        } catch (error) {
            loadingMsg.remove();
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
            errorDiv.innerHTML = `
                <strong>Error de conexión</strong>
                <p class="mb-0">${error.message}</p>
            `;
            ambientFileInput.after(errorDiv);
        }
    });
}
document.getElementById("substrate-model").addEventListener("change", (e) => {
    updateMediumFieldsEnhanced('substrate', e.target.value);
});

// EVENT LISTENER PARA ARCHIVOS EN SUSTRATO HOMOGÉNEO 
const substrateFileInput = document.getElementById('substrate-file');

if (substrateFileInput) {
    substrateFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('[Sustrato Homogéneo] Subiendo archivo:', file.name);
        
        // Remover mensajes previos
        const prevMessages = substrateFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg, .material-validation-alert');
        prevMessages.forEach(msg => msg.remove());
        
        // Mostrar carga
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
        loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
        substrateFileInput.after(loadingMsg);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', 'nk');
        
        try {
            const response = await fetch('/api/upload-optical-data', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            loadingMsg.remove();
            
            //  VERIFICAR SUCCESS
            if (result.error || result.success === false) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>Error al procesar archivo</strong>
                    <p class="mb-0">${result.error || 'Error desconocido'}</p>
                `;
                substrateFileInput.after(errorDiv);
                return;
            }
            
            if (!result.info || !result.data) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong> Respuesta incompleta del servidor</strong>
                `;
                substrateFileInput.after(errorDiv);
                return;
            }
            
            const info = result.info;
            const warnings = result.warnings || [];
            
            console.log('[Sustrato] Archivo procesado:', info);
            
            // Mostrar resultado de archivo procesado
            let warningsHTML = '';
            if (warnings.length > 0) {
                warningsHTML = `
                    <div class="mt-2 pt-2 border-top">
                        <strong>Advertencias de procesamiento:</strong>
                        <ul class="mb-0 small">
                            ${warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            const successDiv = document.createElement('div');
            successDiv.className = 'alert alert-success mt-2 file-result-msg';
            successDiv.innerHTML = `
                <strong> Archivo procesado</strong>
                <ul class="mb-0 small mt-2">
                    <li><strong>Formato:</strong> ${info.format}</li>
                    <li><strong>Puntos:</strong> ${info.points}</li>
                    <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                    <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                    <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                    ${info.units_converted ? `<li><strong>Conversión:</strong> ${info.units_converted}</li>` : ''}
                </ul>
                ${warningsHTML}
            `;
            
            substrateFileInput.after(successDiv);
            
            // VALIDAR CONTRA MODO DE WAVELENGTH 
            const validation = await validateMaterialFileAgainstWavelengthMode(
                result.data.wavelength,
                substrateFileInput
            );
            showMaterialValidationResult(validation, substrateFileInput);
            console.log('[Sustrato] Validación:', validation);
            
            //  MOSTRAR RESULTADO DE VALIDACIÓN
            showMaterialValidationResult(validation, substrateFileInput);
            
            // Guardar datos
            substrateFileInput.dataset.opticalData = JSON.stringify(result.data);
            
            console.log('[Sustrato] Completo');
            
        } catch (error) {
            loadingMsg.remove();
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
            errorDiv.innerHTML = `
                <strong>Error de conexión</strong>
                <p class="mb-0">${error.message}</p>
            `;
            substrateFileInput.after(errorDiv);
        }
    });
}
// NUEVO: Listeners para tipo de sustrato/ambiente (homogéneo o EMT)
document.getElementById("substrate-type-homo").addEventListener("change", () => {
    updateSubstrateTypeInterface('homogeneous');
});

document.getElementById("substrate-type-emt").addEventListener("change", () => {
    updateSubstrateTypeInterface('emt');
});

document.getElementById("ambient-type-homo").addEventListener("change", () => {
    console.log('🎛️ Ambiente cambiado a homogéneo');
    updateAmbientTypeInterface('homogeneous');
});

document.getElementById("ambient-type-emt").addEventListener("change", () => {
    console.log('🎛️ Ambiente cambiado a EMT');
    updateAmbientTypeInterface('emt');
});

// ========================================
// ⭐ NUEVO: Event listeners para Maxwell-Garnett en AMBIENTE y SUSTRATO
// ========================================

// Para AMBIENTE
const ambientEmtModel = document.getElementById('ambient-emt-model');
const ambientHostSelection = document.querySelector('#ambient-emt-config .maxwell-garnett-host-selection');

if (ambientEmtModel && ambientHostSelection) {
    ambientEmtModel.addEventListener('change', () => {
        if (ambientEmtModel.value === 'maxwell-garnett') {
            ambientHostSelection.style.display = 'block';
            // Llamar función para actualizar opciones
            updateMediumHostSelectOptions('ambient');
        } else {
            ambientHostSelection.style.display = 'none';
        }
    });
}

// Para SUSTRATO
const substrateEmtModel = document.getElementById('substrate-emt-model');
const substrateHostSelection = document.querySelector('#substrate-emt-config .maxwell-garnett-host-selection');

if (substrateEmtModel && substrateHostSelection) {
    substrateEmtModel.addEventListener('change', () => {
        if (substrateEmtModel.value === 'maxwell-garnett') {
            substrateHostSelection.style.display = 'block';
            updateMediumHostSelectOptions('substrate');
        } else {
            substrateHostSelection.style.display = 'none';
        }
    });
}





function addDynamicParams(container, model) {
    const template = dispersionTemplates[model];
    if (!template || !template.dynamicParams) return;
    
    const dynamicContainer = document.createElement('div');
    dynamicContainer.className = 'dynamic-params-container mt-2';
    
    template.dynamicParams.forEach(param => {
        dynamicContainer.innerHTML += createParamFieldWithOptimize(param, `dynamic-${model}-`);
    });
    
    container.appendChild(dynamicContainer);
    
    // Actualizar vista previa
    const allInputs = container.querySelectorAll('.layer-param');
    allInputs.forEach(inp => {
        inp.addEventListener('input', () => {
            showEquationPreview(container, model, allInputs);
        });
    });
    
    showEquationPreview(container, model, allInputs);
}

/**
 * Actualiza la interfaz del sustrato según el tipo seleccionado (homogéneo/EMT)
 * @param {string} type - 'homogeneous' o 'emt'
 */
function updateSubstrateTypeInterface(type) {
    console.log(`🔧 updateSubstrateTypeInterface: ${type}`);
    
    const homoConfig = document.getElementById('substrate-homo-config');
    const emtConfig = document.getElementById('substrate-emt-config');
    
    if (!homoConfig) {
        console.error('❌ No se encontró #substrate-homo-config');
        return;
    }
    if (!emtConfig) {
        console.error('❌ No se encontró #substrate-emt-config');
        return;
    }
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
        
        // ⭐ NUEVO: Inicializar el modelo seleccionado cuando se muestra
        const substrateModel = document.getElementById('substrate-model');
        if (substrateModel) {
            const modelValue = substrateModel.value;
            console.log(`  Inicializando modelo homogéneo: ${modelValue}`);
            
            // Obtener referencias a los contenedores
            const constantField = document.getElementById('substrate-constant-field');
            const paramsDiv = document.getElementById('substrate-params');
            const fileUpload = document.getElementById('substrate-file-upload');
            const customEq = document.getElementById('substrate-custom-eq');
            
            // Limpiar todo primero
            if (paramsDiv) paramsDiv.innerHTML = '';
            if (fileUpload) fileUpload.style.display = 'none';
            if (customEq) customEq.style.display = 'none';
            if (constantField) constantField.style.display = 'none';
            
            // Manejar presets especiales
            if (modelValue === 'glass' || modelValue === 'si' || modelValue === 'constant') {
                if (constantField) {
                    constantField.style.display = 'block';
                    
                    const nInput = document.getElementById('substrate-n-constant');
                    const kInput = document.getElementById('substrate-k-constant');
                    
                    if (modelValue === 'glass') {
                        if (nInput) nInput.value = '1.52';
                        if (kInput) kInput.value = '0';
                    } else if (modelValue === 'si') {
                        if (nInput) nInput.value = '3.87';
                        if (kInput) kInput.value = '0.02';
                    }
                    // Para 'constant', mantener los valores actuales
                    
                    console.log(`  ✅ Campos constantes mostrados para ${modelValue}`);
                }
            } else if (modelValue === 'file_nk' || modelValue === 'file_epsilon') {
                if (fileUpload) {
                    fileUpload.style.display = 'block';
                    const fileHelp = document.getElementById('substrate-file-help');
                    if (fileHelp) {
                        fileHelp.textContent = modelValue === 'file_epsilon'
                            ? 'Archivo con columnas: omega, epsilon1, epsilon2'
                            : 'Archivo con columnas: wavelength, n, k';
                    }
                }
            } else if (modelValue === 'custom') {
                if (customEq) customEq.style.display = 'block';
            } else {
                // Para modelos de dispersión reales
                updateMediumFieldsEnhanced('substrate', modelValue);
            }
        }
        
    } else if (type === 'emt') {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        // Asegurar al menos un componente EMT
        const container = document.getElementById('substrate-emt-components');
        if (container && container.children.length === 0) {
            console.log('  ⭐ Agregando componente EMT inicial al sustrato');
            addMediumEMTComponent('substrate');
        }
    }
}

/**
 * Actualiza la interfaz del ambiente según el tipo seleccionado (homogéneo/EMT)
 * @param {string} type - 'homogeneous' o 'emt'
 */
function updateAmbientTypeInterface(type) {
    console.log(`🔧 updateAmbientTypeInterface: ${type}`);
    
    const homoConfig = document.getElementById('ambient-homo-config');
    const emtConfig = document.getElementById('ambient-emt-config');
    
    if (!homoConfig || !emtConfig) {
        console.error('❌ No se encontraron los contenedores de configuración del ambiente');
        return;
    }
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
        
        // Inicializar campos del ambiente
        const ambientModel = document.getElementById('ambient-model');
        if (ambientModel) {
            const modelValue = ambientModel.value;
            
            const constantField = document.getElementById('ambient-constant-field');
            const paramsDiv = document.getElementById('ambient-params');
            const fileUpload = document.getElementById('ambient-file-upload');
            const customEq = document.getElementById('ambient-custom-eq');
            
            // Limpiar todo
            if (paramsDiv) paramsDiv.innerHTML = '';
            if (fileUpload) fileUpload.style.display = 'none';
            if (customEq) customEq.style.display = 'none';
            if (constantField) constantField.style.display = 'none';
            
            if (modelValue === 'constant') {
                if (constantField) constantField.style.display = 'block';
            } else if (modelValue === 'file_nk' || modelValue === 'file_epsilon') {
                if (fileUpload) fileUpload.style.display = 'block';
            } else if (modelValue === 'custom') {
                if (customEq) customEq.style.display = 'block';
            } else {
                updateMediumFieldsEnhanced('ambient', modelValue);
            }
        }
        
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        const container = document.getElementById('ambient-emt-components');
        if (container && container.children.length === 0) {
            addMediumEMTComponent('ambient');
        }
    }
}



//  FUNCIÓN: Refrescar títulos de componentes
function refreshComponentTitles(container) {
    const components = container.querySelectorAll('.emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) title.textContent = `Componente ${i + 1}`;
    });
}

//  NUEVA FUNCIÓN: Refrescar títulos de componentes de MEDIOS (ambiente/sustrato)
function refreshMediumComponentTitles(container) {
    const components = container.querySelectorAll('.medium-emt-component');
    components.forEach((comp, i) => {
        const title = comp.querySelector('.component-title');
        if (title) {
            title.textContent = `Componente ${i + 1}`;
        }
    });
}

/**
 * ✅ FUNCIÓN SIMPLIFICADA
 * Actualiza suma de fracciones volumétricas para medios (ambiente/sustrato)
 * Las fracciones SIEMPRE están en formato decimal (0-1)
 */
function updateMediumFractionSum(medium) {
    console.log(`🔍 updateMediumFractionSum llamada para: ${medium}`);
    
    const sumDisplay = document.getElementById(`${medium}-fraction-sum`);
    if (!sumDisplay) {
        console.error(`❌ No se encontró #${medium}-fraction-sum`);
        return;
    }
    
    const componentsContainer = document.getElementById(`${medium}-emt-components`);
    if (!componentsContainer) {
        console.error(`❌ No se encontró #${medium}-emt-components`);
        return;
    }
    
    const components = componentsContainer.querySelectorAll('.medium-emt-component');
    
    console.log(`📊 Componentes encontrados: ${components.length}`);
    
    let sum = 0;
    
    components.forEach((comp, index) => {
        const fractionInput = comp.querySelector('.medium-component-fraction');
        
        if (!fractionInput) {
            console.warn(`⚠️ Componente ${index}: no se encontró input de fracción`);
            return;
        }
        
        let value = parseFloat(fractionInput.value) || 0;
        
        console.log(`  Componente ${index + 1}:`);
        console.log(`    - Valor: ${value}`);
        
        sum += value;
        console.log(`    - Suma acumulada: ${sum}`);
    });
    
    // ✅ Redondear para evitar errores de precisión flotante
    sum = Math.round(sum * 1000000) / 1000000;
    
    console.log(`✅ Suma final: ${sum}`);
    
    // ✅ MOSTRAR con 3 decimales
    sumDisplay.textContent = sum.toFixed(3);
    
    // Cambiar color según validez
    const alertBox = sumDisplay.closest('.alert');
    
    if (Math.abs(sum - 1.0) < 0.01) {
        sumDisplay.style.color = 'green';
        sumDisplay.style.fontWeight = 'bold';
        
        if (alertBox) {
            alertBox.classList.remove('alert-warning');
            alertBox.classList.add('alert-success');
        }
        
        console.log('✅ Suma válida (≈ 1.0)');
    } else {
        sumDisplay.style.color = 'red';
        sumDisplay.style.fontWeight = 'bold';
        
        if (alertBox) {
            alertBox.classList.remove('alert-success');
            alertBox.classList.add('alert-warning');
        }
        
        console.log(`⚠️ Suma inválida: ${sum} ≠ 1.0`);
    }
}

function addMediumEMTComponent(medium) {
    const container = document.getElementById(`${medium}-emt-components`);
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 medium-emt-component bg-white shadow-sm';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-medium-component">✕ Eliminar</button>
        </div>

        <div class="row g-3">
            <div class="col-md-3">
                <label class="form-label small fw-bold">Nombre del componente</label>
                <input class="form-control medium-component-name" value="Componente ${componentCount}" placeholder="Ej: SiO₂, Poros, Au">
            </div>
            <div class="col-md-3">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <input class="form-control medium-component-fraction" type="number" min="0" max="1" step="0.01" value="0.5" placeholder="0.0 - 1.0">
                <div class="form-text small">Valor decimal entre 0 y 1</div>
            </div>
            <div class="col-md-2">
                <label class="form-label small fw-bold">Optimizar fracción</label>
                <div class="form-check form-switch mt-2">
                    <input class="form-check-input medium-fraction-optimize" type="checkbox" title="Permitir optimización de fracción volumétrica">
                    <label class="form-check-label small">Habilitar</label>
                </div>
                
                <!-- ⭐⭐⭐ NUEVO v5.0: Controles de variación multiguess ⭐⭐⭐ -->
                <div class="multiguess-variation-controls mt-2" style="font-size: 0.85rem;">
                    <div class="d-flex gap-2 align-items-center mb-1">
                        <small class="text-muted" style="min-width: 60px;">Variación:</small>
                    </div>
                    <select class="variation-mode-select form-select form-select-sm mb-1" style="width: 100%;">
                        <option value="relative" selected>% Relativo</option>
                        <option value="absolute">Absoluto</option>
                    </select>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">±</span>
                        <input type="number" class="variation-value-input form-control form-control-sm" 
                               value="20" min="0.1" step="1" title="Variación (% o valor absoluto)">
                        <span class="input-group-text variation-unit">%</span>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo de dispersión</label>
                <select class="form-select medium-component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude_lorentz">Drude-Lorentz</option>
                    <option value="custom">Modelo personalizado</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                    <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                </select>
            </div>
        </div>

        <div class="row mt-3">
            <div class="col-12">
                <div class="model-config-container">
                    <div class="medium-component-params"></div>
                </div>
            </div>
        </div>

        <div class="medium-component-file mt-3" style="display:none;">
            <label class="form-label small fw-bold">
                Archivo de datos ópticos
                <button type="button" class="btn btn-sm btn-link p-0" 
                        data-bs-toggle="tooltip" 
                        data-bs-placement="top"
                        title="Formatos aceptados:&#10;• 3 columnas: λ(nm), n, k&#10;• 2 bloques: (λ,n) luego (λ,k)&#10;• Unidades: nm o μm (conversión automática)">
                    ℹ️
                </button>
            </label>
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control medium-comp-file"/>
            <div class="form-text medium-file-help">
                Se aceptan archivos de refractiveindex.info sin modificación
            </div>
        </div>

        <div class="medium-component-constant mt-3">
            <div class="row g-2">
                <div class="col-6">
                    <label class="form-label small fw-bold">Índice de refracción (n)</label>
                    <input class="form-control medium-comp-n" type="number" step="0.001" value="1.5" placeholder="ej: 1.5">
                </div>
                <div class="col-6">
                    <label class="form-label small fw-bold">Coeficiente de extinción (k)</label>
                    <input class="form-control medium-comp-k" type="number" step="0.001" value="0" placeholder="ej: 0">
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(componentDiv);

    // ⭐⭐⭐ NUEVO v5.0: Event listener para actualizar unidad de variación ⭐⭐⭐
    setTimeout(() => {
        const variationModeSelect = componentDiv.querySelector('.variation-mode-select');
        const variationUnitSpan = componentDiv.querySelector('.variation-unit');
        if (variationModeSelect && variationUnitSpan) {
            variationModeSelect.addEventListener('change', function() {
                variationUnitSpan.textContent = this.value === 'relative' ? '%' : '';
            });
        }
    }, 0);

    // ========== EVENT LISTENERS ==========
    
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
    });

    // Event listener para input de fracción (solo actualiza suma)
    const fractionInput = componentDiv.querySelector('.medium-component-fraction');

    if (fractionInput) {
        fractionInput.addEventListener('input', () => {
            console.log(`🔄 Fracción cambiada en ${medium}`);
            updateMediumFractionSum(medium);
        });
    }

    // ⭐ NOTA: El checkbox de optimización NO tiene event listener especial
    // Solo se usa al recolectar parámetros optimizables

    const modelSelect = componentDiv.querySelector('.medium-component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params');
    const fileDiv = componentDiv.querySelector('.medium-component-file');
    const constantDiv = componentDiv.querySelector('.medium-component-constant');
    const fileHelp = componentDiv.querySelector('.medium-file-help');
    const fileInput = componentDiv.querySelector('.medium-comp-file');

    function updateComponentModel() {
        const model = modelSelect.value;
        fileDiv.style.display = "none";
        constantDiv.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantDiv.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `${medium}-comp${componentCount}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileDiv.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                : "Archivo con columnas: wavelength (nm), n, k";
        }
    }

    // EVENT LISTENER PARA CARGA DE ARCHIVOS
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            console.log(`[EMT ${medium}] Subiendo archivo: ${file.name}`);
            
            // Remover mensajes previos
            const prevMessages = fileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
            prevMessages.forEach(msg => msg.remove());
            
            // Mostrar mensaje de carga
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
            loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
            fileInput.after(loadingMsg);
            
            const formData = new FormData();
            formData.append('file', file);
            
            const currentModel = modelSelect.value;
            const fileType = currentModel === 'file_epsilon' ? 'epsilon' : 'nk';
            formData.append('file_type', fileType);
            
            try {
                const response = await fetch('/api/upload-optical-data', {
                    method: 'POST',
                    body: formData
                });
                
                console.log(`[EMT ${medium}] Respuesta recibida: status=${response.status}`);
                
                const result = await response.json();
                console.log(`[EMT ${medium}] Resultado:`, result);
                
                // Remover mensaje de carga
                loadingMsg.remove();
                
                if (result.error || result.success === false) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>❌ Error al procesar archivo</strong>
                        <p class="mb-0">${result.error || 'Error desconocido al procesar el archivo'}</p>
                    `;
                    fileInput.after(errorDiv);
                    console.error(`[EMT ${medium}] Error:`, result.error);
                    return;
                }
                
                // Verificar que existan los campos esperados
                if (!result.info || !result.data) {
                    console.error(`[EMT ${medium}] Respuesta incompleta:`, result);
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>⚠️ Respuesta incompleta</strong>
                        <p class="mb-0">El servidor no devolvió la información esperada</p>
                    `;
                    fileInput.after(errorDiv);
                    return;
                }
                
                const info = result.info;
                const warnings = result.warnings || [];
                
                console.log(`[EMT ${medium}] Archivo procesado:`, info);
                
                // VALIDAR RANGO CON DATOS EXPERIMENTALES
                if (uploadedWavelengths && uploadedWavelengths.length > 0) {
                    console.log(`[EMT ${medium}] Validando rango...`);
                    
                    const materialWavelengths = result.data.wavelength;
                    const matMin = Math.min(...materialWavelengths);
                    const matMax = Math.max(...materialWavelengths);
                    const expMin = Math.min(...uploadedWavelengths);
                    const expMax = Math.max(...uploadedWavelengths);
                    
                    const coverageOk = (matMin <= expMin) && (matMax >= expMax);
                    
                    console.log(`[EMT ${medium}] Rangos:`);
                    console.log(`  Material: [${matMin.toFixed(1)}, ${matMax.toFixed(1)}] nm`);
                    console.log(`  Experimental: [${expMin.toFixed(1)}, ${expMax.toFixed(1)}] nm`);
                    console.log(`  Cobertura: ${coverageOk ? 'OK' : '❌ INSUFICIENTE'}`);
                    
                    if (!coverageOk) {
                        warnings.push(
                            `El archivo de material (${matMin.toFixed(1)}-${matMax.toFixed(1)} nm) ` +
                            `NO cubre completamente el rango experimental (${expMin.toFixed(1)}-${expMax.toFixed(1)} nm). ` +
                            `Los puntos fuera del rango requerirán EXTRAPOLACIÓN, lo cual puede afectar la precisión.`
                        );
                    }
                } else {
                    console.log(`[EMT ${medium}] No hay datos experimentales para validar`);
                }
                
                // Construir mensaje de éxito
                const successDiv = document.createElement('div');
                successDiv.className = `alert ${warnings.length > 0 ? 'alert-warning' : 'alert-success'} mt-2 file-result-msg`;
                
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
                
                successDiv.innerHTML = `
                    <strong>✅ Archivo procesado exitosamente</strong>
                    <ul class="mb-0 small mt-2">
                        <li><strong>Formato:</strong> ${info.format}</li>
                        <li><strong>Puntos de datos:</strong> ${info.points}</li>
                        <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                        <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                        <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                        ${info.units_converted ? `<li><strong>Conversión:</strong> ${info.units_converted}</li>` : ''}
                    </ul>
                    ${warningsHTML}
                `;
                
                fileInput.after(successDiv);
                
                // Guardar datos en el componente
                componentDiv.dataset.opticalData = JSON.stringify(result.data);
                
                console.log(`[EMT ${medium}] Archivo ${file.name} guardado (${info.points} puntos)`);
                
                const validation = await validateMaterialFileAgainstWavelengthMode(
                    result.data.wavelength,
                    fileInput
                );

                console.log(`[EMT ${medium}] Validación wavelength:`, validation);

                showMaterialValidationResult(validation, fileInput);
                
            } catch (error) {
                loadingMsg.remove();
                
                console.error(`[EMT ${medium}] Error de conexión:`, error);
                
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>❌ Error de conexión</strong>
                    <p class="mb-0">${error.message}</p>
                `;
                fileInput.after(errorDiv);
            }
        });
    }

    modelSelect.addEventListener("change", updateComponentModel);
    updateComponentModel();

    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
}

/**
 * FUNCIÓN OPTIMIZADA: Agregar componente EMT a una CAPA (con carga diferida)
 * VERSIÓN v5.0: Con controles de variación para Multiguess
 */
function addEMTComponent(layerWrapper) {
    const container = layerWrapper.querySelector('.emt-components-container');
    if (!container) {
        console.error('❌ No se encontró .emt-components-container en la capa');
        return;
    }
    
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 emt-component bg-white shadow-sm';
    
    // HTML MÍNIMO - Sin parámetros de dispersión todavía
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-component">✕ Eliminar</button>
        </div>

        <div class="row g-3">
            <div class="col-md-3">
                <label class="form-label small fw-bold">Nombre del componente</label>
                <input class="form-control component-name" value="Componente ${componentCount}" placeholder="Ej: SiO₂, Poros, Au">
            </div>
            <div class="col-md-3">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <input class="form-control component-fraction" type="number" min="0" max="1" step="0.01" value="0.5" placeholder="0.0 - 1.0">
                <div class="form-text small">Valor decimal entre 0 y 1</div>
            </div>
            <div class="col-md-2">
                <label class="form-label small fw-bold">Optimizar fracción</label>
                <div class="form-check form-switch mt-2">
                    <input class="form-check-input fraction-optimize" type="checkbox" title="Permitir optimización de fracción volumétrica">
                    <label class="form-check-label small">Habilitar</label>
                </div>
                
                <!-- ⭐⭐⭐ NUEVO v5.0: Controles de variación multiguess ⭐⭐⭐ -->
                <div class="multiguess-variation-controls mt-2" style="font-size: 0.85rem;">
                    <div class="d-flex gap-2 align-items-center mb-1">
                        <small class="text-muted" style="min-width: 60px;">Variación:</small>
                    </div>
                    <select class="variation-mode-select form-select form-select-sm mb-1" style="width: 100%;">
                        <option value="relative" selected>% Relativo</option>
                        <option value="absolute">Absoluto</option>
                    </select>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">±</span>
                        <input type="number" class="variation-value-input form-control form-control-sm" 
                               value="20" min="0.1" step="1" title="Variación (% o valor absoluto)">
                        <span class="input-group-text variation-unit">%</span>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo de dispersión</label>
                <select class="form-select component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude_lorentz">Drude-Lorentz</option>
                    <option value="custom">Modelo personalizado</option>
                    <option value="file_nk">Archivo n,k,λ</option>
                    <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                </select>
            </div>
        </div>

        <!-- Contenedores vacíos que se llenarán bajo demanda -->
        <div class="model-params-placeholder mt-3"></div>
    `;
    
    container.appendChild(componentDiv);

    // ⭐⭐⭐ NUEVO v5.0: Event listener para actualizar unidad de variación ⭐⭐⭐
    setTimeout(() => {
        const variationModeSelect = componentDiv.querySelector('.variation-mode-select');
        const variationUnitSpan = componentDiv.querySelector('.variation-unit');
        if (variationModeSelect && variationUnitSpan) {
            variationModeSelect.addEventListener('change', function() {
                variationUnitSpan.textContent = this.value === 'relative' ? '%' : '';
            });
        }
    }, 0);

    // ========== EVENT LISTENERS ==========
    
    // Botón eliminar
    const removeBtn = componentDiv.querySelector('.remove-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshComponentTitles(container);
        updateFractionSum(layerWrapper);
        
        // ⭐ NUEVO: Actualizar opciones de host si es Maxwell-Garnett
        const emtModelSelect = layerWrapper.querySelector('.emt-model-select');
        if (emtModelSelect && emtModelSelect.value === 'maxwell-garnett') {
            updateHostSelectOptions(layerWrapper);
        }
    });

    // Fracción volumétrica
    const fractionInput = componentDiv.querySelector('.component-fraction');

    fractionInput.addEventListener('input', () => {
        updateFractionSum(layerWrapper);
        
        // ⭐ NUEVO: Actualizar opciones de host cuando cambia fracción
        const emtModelSelect = layerWrapper.querySelector('.emt-model-select');
        if (emtModelSelect && emtModelSelect.value === 'maxwell-garnett') {
            updateHostSelectOptions(layerWrapper);
        }
    });

    // ⭐ NOTA: El checkbox de optimización NO tiene event listener especial
    // Solo se usa al recolectar parámetros optimizables

    // ⭐ NUEVO: Actualizar opciones de host cuando cambia nombre
    const nameInput = componentDiv.querySelector('.component-name');
    nameInput.addEventListener('input', () => {
        const emtModelSelect = layerWrapper.querySelector('.emt-model-select');
        if (emtModelSelect && emtModelSelect.value === 'maxwell-garnett') {
            updateHostSelectOptions(layerWrapper);
        }
    });

    // Selector de modelo
    const modelSelect = componentDiv.querySelector('.component-model');
    const placeholder = componentDiv.querySelector('.model-params-placeholder');

    // FUNCIÓN DE CARGA DIFERIDA
    function loadModelInterface(model) {
        // Limpiar contenido anterior
        placeholder.innerHTML = '';
        
        // Crear contenedores según el modelo
        if (model === 'constant') {
            placeholder.innerHTML = `
                <div class="component-constant">
                    <div class="row g-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold">Índice de refracción (n)</label>
                            <input class="form-control component-n" type="number" step="0.001" value="1.5" placeholder="ej: 1.5">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold">Coeficiente de extinción (k)</label>
                            <input class="form-control component-k" type="number" step="0.001" value="0" placeholder="ej: 0">
                        </div>
                    </div>
                </div>
            `;
        } 
        else if (model === 'custom') {
            placeholder.innerHTML = `
                <div class="component-custom-section">
                    <div class="alert alert-info small mb-2">
                        <strong>Ecuación personalizada</strong>
                        <p class="mb-0">Define tu propia ecuación para n en función de λ (nm)</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-latex-editor-btn-comp">
                        ✏️ Editar ecuación LaTeX
                    </button>
                    <div class="border rounded p-2 bg-light">
                        <div class="latex-equation-display text-center">
                            <em class="text-muted small">No hay ecuación definida</em>
                        </div>
                        <input type="hidden" class="latex-equation-value" value="">
                    </div>
                </div>
            `;
            
            // Event listener para editor LaTeX
            const latexBtn = placeholder.querySelector('.open-latex-editor-btn-comp');
            if (latexBtn) {
                latexBtn.addEventListener('click', () => {
                    openLatexEditor(`component-custom-${componentCount}`);
                });
            }
        }
        else if (window.dispersionTemplates[model]) {
            // Crear contenedor para parámetros de dispersión
            const paramsDiv = document.createElement('div');
            paramsDiv.className = 'component-params';
            placeholder.appendChild(paramsDiv);
            
            // Usar la función de interfaz mejorada
            updateModelFieldsEnhanced(paramsDiv, model, `comp${componentCount}-`);
        }
        else if (model === "file_nk" || model === "file_epsilon") {
            const fileType = model === "file_epsilon" ? "epsilon" : "nk";
            const fileHelp = model === "file_epsilon" 
                ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                : "Archivo con columnas: wavelength (nm), n, k";
            
            placeholder.innerHTML = `
                <div class="component-file">
                    <label class="form-label small fw-bold">
                        Archivo de datos ópticos
                        <button type="button" class="btn btn-sm btn-link p-0" 
                                data-bs-toggle="tooltip" 
                                title="Formatos aceptados: .csv, .txt, .xlsx, .spe">
                            ℹ️
                        </button>
                    </label>
                    <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control component-file-input"/>
                    <div class="form-text component-file-help">${fileHelp}</div>
                </div>
            `;
            
            // Event listener para carga de archivos
            const fileInput = placeholder.querySelector('.component-file-input');
            setupFileUploadHandler(fileInput, componentDiv, modelSelect.value);
        }
    }

    // Cargar interfaz del modelo seleccionado (inicialmente "constant")
    loadModelInterface('constant');

    // Event listener para cambio de modelo
    modelSelect.addEventListener('change', () => {
        loadModelInterface(modelSelect.value);
    });

    refreshComponentTitles(container);
    updateFractionSum(layerWrapper);
    
    // ========================================
    // ⭐ NUEVO: AGREGAR BOTÓN "Calcular n,k efectivos"
    // ========================================
    const heterogeneousConfig = layerWrapper.querySelector('.heterogeneous-config');
    if (heterogeneousConfig && !heterogeneousConfig.querySelector('.calculate-layer-emt-btn')) {
        const calculateBtn = document.createElement('button');
        calculateBtn.type = 'button';
        calculateBtn.className = 'btn btn-warning btn-sm w-100 mt-3 calculate-layer-emt-btn';
        calculateBtn.innerHTML = '🧮 Calcular y verificar n,k efectivos';
        
        const layerIdx = layerWrapper.dataset.idx;
        
        calculateBtn.addEventListener('click', async () => {
            calculateBtn.disabled = true;
            calculateBtn.innerHTML = '⏳ Calculando...';
            
            await validateAndCalculateEMT('layer', layerIdx);
            
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '🧮 Calcular y verificar n,k efectivos';
        });
        
        // Insertar antes del alert de suma de fracciones
        const fractionAlert = heterogeneousConfig.querySelector('.alert-warning');
        if (fractionAlert) {
            fractionAlert.before(calculateBtn);
        } else {
            heterogeneousConfig.appendChild(calculateBtn);
        }
    }
}

/**
 * FUNCIÓN AUXILIAR: Configurar handler de carga de archivos
 */
function setupFileUploadHandler(fileInput, componentDiv, modelType) {
    if (!fileInput) return;
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log(`[EMT Componente] Subiendo archivo: ${file.name}`);
        
        // Remover mensajes previos
        const prevMessages = fileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
        prevMessages.forEach(msg => msg.remove());
        
        // Mostrar carga
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
        loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
        fileInput.after(loadingMsg);
        
        const formData = new FormData();
        formData.append('file', file);
        
        const fileType = modelType === 'file_epsilon' ? 'epsilon' : 'nk';
        formData.append('file_type', fileType);
        
        try {
            const response = await fetch('/api/upload-optical-data', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            loadingMsg.remove();
            
            if (result.error || result.success === false) {
                showFileError(fileInput, result.error || 'Error desconocido');
                return;
            }
            
            if (!result.info || !result.data) {
                showFileError(fileInput, 'Respuesta incompleta del servidor');
                return;
            }
            
            showFileSuccess(fileInput, result);
            
            // Guardar datos
            componentDiv.dataset.opticalData = JSON.stringify(result.data);
            
            // Validar rango
            const validation = await validateMaterialFileAgainstWavelengthMode(
                result.data.wavelength,
                fileInput
            );
            showMaterialValidationResult(validation, fileInput);
            
        } catch (error) {
            loadingMsg.remove();
            showFileError(fileInput, `Error de conexión: ${error.message}`);
        }
    });
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



// Actualizar modelo de componente EMT con interfaz dividida
function updateMediumComponentModel(componentDiv, mediumPrefix = '') {
    const modelSelect = componentDiv.querySelector('.medium-component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params');
    const fileDiv = componentDiv.querySelector('.medium-component-file');
    const constantDiv = componentDiv.querySelector('.medium-component-constant');
    const customDiv = componentDiv.querySelector('.medium-component-custom');

    function updateModel() {
        const model = modelSelect.value;
        fileDiv.style.display = "none";
        constantDiv.style.display = "none";
        customDiv.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantDiv.style.display = "block";
        } else if (model === 'custom') {
            customDiv.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            // USAR LA INTERFAZ DIVIDIDA
            updateModelFieldsEnhanced(paramsDiv, model, `${mediumPrefix}comp-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileDiv.style.display = "block";
        }
    }

    modelSelect.addEventListener("change", updateModel);
    updateModel();
}


// ⭐ CORREGIDO: Usar event delegation para el botón "Agregar capa"
// El botón está dentro del modal, que no existe cuando el script carga
document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "add-layer") {
        e.preventDefault();
        addLayer();
    }
});

let layerCounter = 0;

function addLayer(prefill={}) {
    // ⭐ CORREGIDO: Obtener el contenedor DENTRO de la función
    const layersContainer = document.getElementById("layers-container");
    
    // ⭐ NUEVO: Verificación de seguridad
    if (!layersContainer) {
        console.error('❌ No se encontró #layers-container');
        alert('Error: No se pudo encontrar el contenedor de capas. Intenta recargar la página.');
        return;
    }

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

        <div class="layer-basic-config" style="display:none;">
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <label class="form-label">Nombre de la capa</label>
                    <input class="form-control layer-name" value="${defaultName}">
                </div>
                <div class="col-md-6" data-param-name="layer_${idx}_thickness">
                    <label class="form-label">Espesor (nm)</label>
                    <div class="input-group">
                        <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${defaultThickness}">
                        <span class="input-group-text">
                            <input class="form-check-input mt-0 layer-optimize" type="checkbox" title="Optimizar"/>
                        </span>
                    </div>
                    
                    <!-- ⭐⭐⭐ NUEVO v5.0: Variación multiguess para espesor ⭐⭐⭐ -->
                    <div class="multiguess-variation-controls d-flex gap-2 align-items-center mt-2" style="font-size: 0.85rem;">
                        <small class="text-muted" style="min-width: 60px;">Variación:</small>
                        <select class="variation-mode-select form-select form-select-sm" style="width: 100px;">
                            <option value="relative" selected>% Relativo</option>
                            <option value="absolute">Absoluto</option>
                        </select>
                        <input type="number" class="variation-value-input form-control form-control-sm" 
                               style="width: 70px;" value="20" min="0.1" step="1" title="Variación (% o valor absoluto)">
                        <small class="text-muted variation-unit">%</small>
                    </div>
                    
                    <div class="form-text">Marcar para optimizar este parámetro</div>
                </div>
            </div>
        </div>

        <div class="homogeneous-config" style="display:none;">
            <div class="card p-3 bg-light">
                <h6 class="mb-2">Configuración homogénea</h6>
                
                <div class="row g-2 mb-3">
                    <div class="col-md-12">
                        <label class="form-label">Modelo de dispersión</label>
                        <select class="form-select layer-model">
                            <option value="cauchy" selected>Cauchy</option>
                            <option value="sellmeier">Sellmeier</option>
                            <option value="drude">Drude</option>
                            <option value="lorentz">Lorentz</option>
                            <option value="drude_lorentz">Drude-Lorentz</option>
                            <option value="constant">Constante</option>
                            <option value="file_nk">Archivo n,k,λ</option>
                            <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                            <option value="custom">Ecuación personalizada (LaTeX)</option>
                        </select>
                    </div>
                </div>

                <div class="model-config-container">
                    <div class="layer-params"></div>
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
                        <strong>Ecuación personalizada</strong>
                        <p class="mb-0">Define tu propia ecuación para n en función de λ (nm)</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-latex-editor-btn">
                        Editar ecuación LaTeX
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

                <!-- ⭐ NUEVO: Selección de host para Maxwell-Garnett -->
                <div class="mb-3 maxwell-garnett-host-selection" style="display: none;">
                    <label class="form-label fw-bold">
                        <i class="bi bi-grid-3x3-gap-fill me-2"></i>Componente que actúa como matriz (host)
                    </label>
                    <select class="form-select emt-host-select">
                        <!-- Se llenará dinámicamente con los componentes -->
                    </select>
                    <div class="alert alert-info small mt-2 mb-0">
                        <strong>💡 Importante:</strong> 
                        En Maxwell-Garnett, un componente actúa como matriz continua y los demás como inclusiones esféricas.
                        Generalmente:
                        <ul class="mb-0 mt-1">
                            <li>Matriz: Material con mayor fracción volumétrica</li>
                            <li>Inclusiones: Nanopartículas, poros, etc.</li>
                        </ul>
                    </div>
                </div>

                <div class="emt-components-container"></div>

                <div class="alert alert-warning mt-3 mb-0" style="font-size: 0.9em;">
                    <strong>Importante:</strong> La suma de fracciones volumétricas debe ser exactamente 1.0
                    <div class="mt-2">
                        <strong>Suma actual: <span class="fraction-sum-display">0.000</span></strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    layersContainer.appendChild(wrapper);

    // ⭐⭐⭐ NUEVO v5.0: Event listener para actualizar unidad de variación de espesor ⭐⭐⭐
    setTimeout(() => {
        const thicknessModeSelect = wrapper.querySelector('[data-param-name^="layer_"] .variation-mode-select');
        const thicknessUnitSpan = wrapper.querySelector('[data-param-name^="layer_"] .variation-unit');
        if (thicknessModeSelect && thicknessUnitSpan) {
            thicknessModeSelect.addEventListener('change', function() {
                thicknessUnitSpan.textContent = this.value === 'relative' ? '%' : 'nm';
            });
        }
    }, 0);

    // ========== EVENT LISTENERS ==========

    const removeBtn = wrapper.querySelector(".remove-layer");
    removeBtn.addEventListener("click", () => { 
        wrapper.remove(); 
        refreshLayerTitles(); 
    });

    const typeRadios = wrapper.querySelectorAll(`input[name="layerType${idx}"]`);
    const basicConfig = wrapper.querySelector('.layer-basic-config');
    const homoConfig = wrapper.querySelector('.homogeneous-config');
    const heteroConfig = wrapper.querySelector('.heterogeneous-config');

    typeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const selectedType = wrapper.querySelector(`input[name="layerType${idx}"]:checked`).value;
            
            basicConfig.style.display = 'block';
            
            if (selectedType === 'homogeneous') {
                homoConfig.style.display = 'block';
                heteroConfig.style.display = 'none';
            } else {
                homoConfig.style.display = 'none';
                heteroConfig.style.display = 'block';
                
                const componentsContainer = wrapper.querySelector('.emt-components-container');
                if (componentsContainer.children.length === 0) {
                    addEMTComponent(wrapper);
                }
            }
        });
    });

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
    const layerFileInput = wrapper.querySelector('.layer-file');

    function updateLayerModel() {
        const model = modelSelect.value;
        fileRow.style.display = "none";
        constantRow.style.display = "none";
        customRow.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantRow.style.display = "block";
        } else if (model === 'custom') {
            customRow.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            updateModelFieldsEnhanced(paramsDiv, model, `layer-${idx}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileRow.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega, epsilon1, epsilon2"
                : "Archivo con columnas: wavelength, n, k";
        }
    }

    modelSelect.addEventListener("change", updateLayerModel);
    updateLayerModel();

    // EVENT LISTENER PARA ARCHIVOS EN CAPAS HOMOGÉNEAS
    if (layerFileInput) {
        layerFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            console.log(`[Capa Homogénea ${idx}] Subiendo archivo: ${file.name}`);
            
            const prevMessages = layerFileInput.parentElement.querySelectorAll('.file-result-msg, .file-loading-msg');
            prevMessages.forEach(msg => msg.remove());
            
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'alert alert-info mt-2 file-loading-msg';
            loadingMsg.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Procesando archivo...';
            layerFileInput.after(loadingMsg);
            
            const formData = new FormData();
            formData.append('file', file);
            
            const currentModel = modelSelect.value;
            const fileType = currentModel === 'file_epsilon' ? 'epsilon' : 'nk';
            formData.append('file_type', fileType);
            
            try {
                const response = await fetch('/api/upload-optical-data', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                loadingMsg.remove();
                
                if (result.error || result.success === false) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                    errorDiv.innerHTML = `
                        <strong>Error al procesar archivo</strong>
                        <p class="mb-0">${result.error || 'Error desconocido'}</p>
                    `;
                    layerFileInput.after(errorDiv);
                    return;
                }
                
                if (!result.info || !result.data) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-warning mt-2 file-result-msg';
                    errorDiv.innerHTML = `<strong>Respuesta incompleta</strong>`;
                    layerFileInput.after(errorDiv);
                    return;
                }
                
                const info = result.info;
                const warnings = result.warnings || [];
                
                let warningsHTML = '';
                if (warnings.length > 0) {
                    warningsHTML = `
                        <div class="mt-2 pt-2 border-top">
                            <strong>Advertencias:</strong>
                            <ul class="mb-0 small">
                                ${warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                const successDiv = document.createElement('div');
                successDiv.className = `alert ${warnings.length > 0 ? 'alert-warning' : 'alert-success'} mt-2 file-result-msg`;
                successDiv.innerHTML = `
                    <strong>Archivo procesado exitosamente</strong>
                    <ul class="mb-0 small mt-2">
                        <li><strong>Formato:</strong> ${info.format}</li>
                        <li><strong>Puntos:</strong> ${info.points}</li>
                        <li><strong>Rango λ:</strong> ${info.wavelength_range[0].toFixed(1)} - ${info.wavelength_range[1].toFixed(1)} nm</li>
                        <li><strong>Rango n:</strong> ${info.n_range[0].toFixed(4)} - ${info.n_range[1].toFixed(4)}</li>
                        <li><strong>Rango k:</strong> ${info.k_range[0].toFixed(6)} - ${info.k_range[1].toFixed(6)}</li>
                        ${info.units_converted ? `<li><strong>Conversión:</strong> ${info.units_converted}</li>` : ''}
                    </ul>
                    ${warningsHTML}
                `;
                
                layerFileInput.after(successDiv);
                
                wrapper.dataset.opticalData = JSON.stringify(result.data);
                
                const validation = await validateMaterialFileAgainstWavelengthMode(
                    result.data.wavelength,
                    layerFileInput
                );
                showMaterialValidationResult(validation, layerFileInput);
                
            } catch (error) {
                loadingMsg.remove();
                
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger mt-2 file-result-msg';
                errorDiv.innerHTML = `
                    <strong>Error de conexión</strong>
                    <p class="mb-0">${error.message}</p>
                `;
                layerFileInput.after(errorDiv);
            }
        });
    }

    // Listener para botón de editor LaTeX
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
        
        // ⭐ ACTUALIZAR opciones de host después de agregar componente
        const emtModelSelect = wrapper.querySelector('.emt-model-select');
        if (emtModelSelect && emtModelSelect.value === 'maxwell-garnett') {
            setTimeout(() => {
                updateHostSelectOptions(wrapper);
            }, 100);
        }
    });

    // ⭐ NUEVO: Event listener para cambio de modelo EMT
    const emtModelSelect = wrapper.querySelector('.emt-model-select');
    const hostSelection = wrapper.querySelector('.maxwell-garnett-host-selection');
    
    if (emtModelSelect && hostSelection) {
        emtModelSelect.addEventListener('change', () => {
            if (emtModelSelect.value === 'maxwell-garnett') {
                hostSelection.style.display = 'block';
                updateHostSelectOptions(wrapper);
            } else {
                hostSelection.style.display = 'none';
            }
        });
    }

    const componentsContainer = wrapper.querySelector('.emt-components-container');
    if (componentsContainer && componentsContainer.children.length === 0){
        console.log(`➕ Agregando componente EMT inicial a la capa ${idx}`);
        addEMTComponent(wrapper);
    }

    refreshLayerTitles();
}





/**
 * ✅ FUNCIÓN SIMPLIFICADA
 * Actualiza suma de fracciones volumétricas para CAPAS heterogéneas
 * Las fracciones SIEMPRE están en formato decimal (0-1)
 */
function updateFractionSum(layerWrapper) {
    const sumDisplay = layerWrapper.querySelector('.fraction-sum-display');
    const components = layerWrapper.querySelectorAll('.emt-component');
    
    let sum = 0;
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.component-fraction');
        let value = parseFloat(fractionInput.value) || 0;
        sum += value;
    });

    // ✅ Redondear para evitar errores de precisión flotante
    sum = Math.round(sum * 1000000) / 1000000;

    sumDisplay.textContent = sum.toFixed(3);

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



//CARGA DIFERIDA DE CONFIGURACIÓN HOMOGÉNEA
function loadHomogeneousConfig(wrapper, idx, defaultName, defaultThickness) {
    const basicConfig = wrapper.querySelector('.layer-basic-config');
    const homoConfig = wrapper.querySelector('.homogeneous-config');
    const heteroConfig = wrapper.querySelector('.heterogeneous-config');
    
    // Ocultar heterogénea
    heteroConfig.style.display = 'none';
    heteroConfig.innerHTML = '';
    
    // Mostrar y llenar homogénea (SOLO si está vacía)
    if (basicConfig.innerHTML === '') {
        basicConfig.innerHTML = `
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <label class="form-label">Nombre de la capa</label>
                    <input class="form-control layer-name" value="${defaultName}">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Espesor (nm)</label>
                    <div class="input-group">
                        <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${defaultThickness}">
                        <span class="input-group-text">
                            <input class="form-check-input mt-0 layer-optimize" type="checkbox" title="Optimizar"/>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (homoConfig.innerHTML === '') {
        homoConfig.innerHTML = `
            <div class="card p-3 bg-light">
                <h6 class="mb-2">Configuración homogénea</h6>
                
                <div class="row g-2 mb-3">
                    <div class="col-md-12">
                        <label class="form-label">Modelo de dispersión</label>
                        <select class="form-select layer-model">
                            <option value="cauchy" selected>Cauchy</option>
                            <option value="sellmeier">Sellmeier</option>
                            <option value="constant">Constante</option>
                            <option value="lorentz">Lorentz</option>
                            <option value="drude_lorentz">Drude-Lorentz</option>
                            <option value="file_nk">Archivo n,k,λ</option>
                            <option value="custom">Ecuación personalizada</option>
                        </select>
                    </div>
                </div>

                <div class="model-config-container">
                    <div class="layer-params"></div>
                </div>

                <div class="layer-file-row mt-2" style="display:none;">
                    <input type="file" accept=".csv,.txt,.xlsx,.dat" class="form-control layer-file"/>
                </div>

                <div class="layer-constant-row mt-2" style="display:none;">
                    <label class="form-label small">n</label>
                    <input class="form-control layer-n-const" type="number" step="0.001" value="1.5">
                    <label class="form-label small mt-1">k</label>
                    <input class="form-control layer-k-const" type="number" step="0.001" value="0">
                </div>

                <div class="layer-custom-row mt-2" style="display:none;">
                    <button type="button" class="btn btn-primary btn-sm mb-2 w-100 open-latex-editor-btn">
                        Editar ecuación LaTeX
                    </button>
                    <div id="layer-custom-${idx}" class="border rounded p-2 bg-light">
                        <div class="latex-equation-display text-center">
                            <em class="text-muted small">No hay ecuación definida</em>
                        </div>
                        <input type="hidden" class="latex-equation-value" value="">
                    </div>
                </div>
            </div>
        `;
        
        // Setup model select
        const modelSelect = homoConfig.querySelector(".layer-model");
        const paramsDiv = homoConfig.querySelector(".layer-params");
        const fileRow = homoConfig.querySelector(".layer-file-row");
        const constantRow = homoConfig.querySelector(".layer-constant-row");
        const customRow = homoConfig.querySelector(".layer-custom-row");
        
        modelSelect.addEventListener("change", () => {
            const model = modelSelect.value;
            fileRow.style.display = "none";
            constantRow.style.display = "none";
            customRow.style.display = "none";
            paramsDiv.innerHTML = "";

            if (model === 'constant') {
                constantRow.style.display = "block";
            } else if (model === 'custom') {
                customRow.style.display = "block";
            } else if (window.dispersionTemplates[model]) {
                updateModelFieldsEnhanced(paramsDiv, model, `layer-${idx}-`);
            } else if (model === "file_nk") {
                fileRow.style.display = "block";
            }
        });
        
        // Trigger inicial
        modelSelect.dispatchEvent(new Event('change'));
    }
    
    basicConfig.style.display = 'block';
    homoConfig.style.display = 'block';
}

//CARGA DIFERIDA DE CONFIGURACIÓN HETEROGÉNEA
function loadHeterogeneousConfig(wrapper, idx, defaultName, defaultThickness) {
    const basicConfig = wrapper.querySelector('.layer-basic-config');
    const homoConfig = wrapper.querySelector('.homogeneous-config');
    const heteroConfig = wrapper.querySelector('.heterogeneous-config');
    
    // Ocultar homogénea
    homoConfig.style.display = 'none';
    homoConfig.innerHTML = '';
    
    // Mostrar y llenar heterogénea (SOLO si está vacía)
    if (basicConfig.innerHTML === '') {
        basicConfig.innerHTML = `
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <label class="form-label">Nombre de la capa</label>
                    <input class="form-control layer-name" value="${defaultName}">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Espesor (nm)</label>
                    <div class="input-group">
                        <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${defaultThickness}">
                        <span class="input-group-text">
                            <input class="form-check-input mt-0 layer-optimize" type="checkbox"/>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (heteroConfig.innerHTML === '') {
        heteroConfig.innerHTML = `
            <div class="card p-3 bg-warning bg-opacity-10">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">Configuración EMT</h6>
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
                    <strong>Suma de fracciones:</strong> 
                    <span class="fraction-sum-display">0.000</span>
                </div>
            </div>
        `;
        
        // Setup EMT
        const addComponentBtn = heteroConfig.querySelector('.add-emt-component');
        addComponentBtn.addEventListener('click', () => {
            addEMTComponent(wrapper);
        });
    }
    
    basicConfig.style.display = 'block';
    heteroConfig.style.display = 'block';
}


function refreshLayerTitles() {
    const layersContainer = document.getElementById("layers-container");
    if (!layersContainer) {
        console.warn('⚠️ refreshLayerTitles: No se encontró #layers-container');
        return;
    }
    [...layersContainer.children].forEach((c, i) => {
        const title = c.querySelector(".layer-title");
        if (title) title.innerText = `Capa ${i + 1}`;
    });
}

async function validateStep(step) {
    console.log(`🔍 validateStep llamado para paso ${step}`);
    
    // Encontrar el error div del paso actual
    const currentStepElement = document.querySelector(`.wizard-step[data-step="${step}"]`);
    const errorDiv = currentStepElement ? currentStepElement.querySelector('.wizard-step-footer .text-danger') : wizardError;
    
    if (errorDiv) errorDiv.style.display = "none";
    
    if (step === 1) {
        // Validar ángulo
        const angle = parseFloat(document.getElementById("input-angle").value);
        if (isNaN(angle) || angle < 0 || angle > 90) {
            errorDiv.innerText = "Ángulo debe estar entre 0° y 90°";
            errorDiv.style.display = "block";
            return false;
        }
        
        const wlModeElement = document.querySelector('input[name="wl-option"]:checked');
        const wlMode = wlModeElement ? wlModeElement.value : null;
        
        // Validar que existan datos experimentales
        if (!currentData || !uploadedFileData || uploadedFileData.length === 0) {
            errorDiv.innerText = "No hay datos experimentales cargados. Por favor, sube un archivo primero.";
            errorDiv.style.display = "block";
            return false;
        }
        
        if (wlMode === 'range') {
            const from = parseFloat(document.getElementById('input-wl-from').value);
            const to = parseFloat(document.getElementById('input-wl-to').value);
            const steps = parseInt(document.getElementById('input-wl-steps').value);
            
            if (isNaN(from) || isNaN(to) || isNaN(steps)) {
                errorDiv.innerText = "Define el rango de longitudes de onda completo";
                errorDiv.style.display = "block";
                return false;
            }
            
            if (from >= to) {
                errorDiv.innerText = "λ inicial debe ser menor que λ final";
                errorDiv.style.display = "block";
                return false;
            }
            
            if (steps < 2) {
                errorDiv.innerText = "Se requieren al menos 2 pasos";
                errorDiv.style.display = "block";
                return false;
            }
            
            // VALIDACIÓN MEJORADA CON MANEJO DE ERRORES
            const cols = currentData.columns;
            const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
            const psiCol = findColumn(cols, ["psi"]);
            const deltaCol = findColumn(cols, ["delta"]);
            
            if (!lambdaCol || !psiCol || !deltaCol) {
                errorDiv.innerText = "No se encontraron columnas de wavelength, psi y delta en el archivo";
                errorDiv.style.display = "block";
                return false;
            }
            
            const wavelengths_exp = uploadedFileData.map(r => r[lambdaCol]);
            const psi_exp = uploadedFileData.map(r => r[psiCol]);
            const delta_exp = uploadedFileData.map(r => r[deltaCol]);
            
            // Mostrar indicador de carga
            errorDiv.innerHTML = '<i class="bi bi-hourglass-split"></i> Validando rango de longitudes de onda...';
            errorDiv.className = 'alert alert-info';
            errorDiv.style.display = "block";
            
            try {
                const response = await fetch('/api/validate-wavelength-range', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        wavelengths_exp: wavelengths_exp,
                        psi_exp: psi_exp,
                        delta_exp: delta_exp,
                        wavelength_mode: 'range',
                        wl_from: from,
                        wl_to: to,
                        wl_steps: steps
                    })
                });
                
                // VERIFICAR SI LA RESPUESTA ES JSON VÁLIDO
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    throw new Error("El servidor devolvió una respuesta inválida (no JSON). Código de estado: " + response.status);
                }
                
                const result = await response.json();
                
                // Ocultar indicador de carga
                errorDiv.style.display = "none";
                
                if (!result.valid) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-range-warning').forEach(w => w.remove());
                    
                    // Mostrar error
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger wl-range-warning';
                    errorDiv.innerHTML = `
                        <strong>Rango no válido</strong>
                        <p class="mb-0">${result.message}</p>
                        ${result.exp_range ? `<small class="text-muted">Rango experimental disponible: [${result.exp_range[0].toFixed(1)}, ${result.exp_range[1].toFixed(1)}] nm</small>` : ''}
                    `;
                    
                    const wlRangeFields = document.getElementById('wl-range-fields');
                    wlRangeFields.after(errorDiv);
                    
                    // También mostrar en el error principal
                    errorDiv.innerHTML = result.message;
                    errorDiv.className = 'text-danger small';
                    errorDiv.style.display = "block";
                    
                    return false;
                }
                
                // Mostrar advertencia si hay extrapolación pero es válido
                if (!result.in_range && result.extrapolation_points > 0) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-range-warning').forEach(w => w.remove());
                    
                    const warningDiv = document.createElement('div');
                    warningDiv.className = 'alert alert-warning wl-range-warning';
                    warningDiv.innerHTML = `
                        <strong>Advertencia de extrapolación</strong>
                        <p class="mb-2">${result.extrapolation_points} de ${steps} puntos (${(100 - result.overlap_percentage).toFixed(1)}%) están fuera del rango experimental.</p>
                        <small class="d-block">Rango experimental: [${result.exp_range[0].toFixed(1)}, ${result.exp_range[1].toFixed(1)}] nm</small>
                        <small class="d-block">Rango solicitado: [${result.target_range[0].toFixed(1)}, ${result.target_range[1].toFixed(1)}] nm</small>
                        <small class="d-block mt-2 text-muted"><strong>Nota:</strong> Se usará extrapolación lineal, lo cual puede reducir la precisión de la optimización.</small>
                    `;
                    
                    const wlRangeFields = document.getElementById('wl-range-fields');
                    wlRangeFields.after(warningDiv);
                }
                
                return true;
                
            } catch (error) {
                // Ocultar indicador de carga
                errorDiv.style.display = "none";
                
                // Remover advertencias previas
                document.querySelectorAll('.wl-range-warning').forEach(w => w.remove());
                
                // Mostrar error detallado
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger wl-range-warning';
                errorDiv.innerHTML = `
                    <strong>Error al validar rango</strong>
                    <p class="mb-2">${error.message}</p>
                    <small class="text-muted">Si el problema persiste, intenta recargar la página o verifica tu conexión.</small>
                `;
                
                const wlRangeFields = document.getElementById('wl-range-fields');
                wlRangeFields.after(errorDiv);
                
                // También en error principal
                errorDiv.innerHTML = `Error de validación: ${error.message}`;
                errorDiv.className = 'text-danger small';
                errorDiv.style.display = "block";
                
                console.error('Error completo:', error);
                
                return false;
            }
            
        } else if (wlMode === 'single') {
            const single = parseFloat(document.getElementById('input-wl-single').value);
            if (isNaN(single) || single <= 0) {
                errorDiv.innerText = "Define una longitud de onda válida";
                errorDiv.style.display = "block";
                return false;
            }
            
            // VALIDACIÓN MEJORADA CON MANEJO DE ERRORES
            const cols = currentData.columns;
            const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
            const psiCol = findColumn(cols, ["psi"]);
            const deltaCol = findColumn(cols, ["delta"]);
            
            if (!lambdaCol || !psiCol || !deltaCol) {
                errorDiv.innerText = "No se encontraron columnas de wavelength, psi y delta en el archivo";
                errorDiv.style.display = "block";
                return false;
            }
            
            const wavelengths_exp = uploadedFileData.map(r => r[lambdaCol]);
            const psi_exp = uploadedFileData.map(r => r[psiCol]);
            const delta_exp = uploadedFileData.map(r => r[deltaCol]);
            
            // Mostrar indicador de carga
            errorDiv.innerHTML = '<i class="bi bi-hourglass-split"></i> Validando longitud de onda...';
            errorDiv.className = 'alert alert-info';
            errorDiv.style.display = "block";
            
            try {
                const response = await fetch('/api/validate-wavelength-range', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        wavelengths_exp: wavelengths_exp,
                        psi_exp: psi_exp,
                        delta_exp: delta_exp,
                        wavelength_mode: 'single',
                        wl_single: single
                    })
                });
                
                // VERIFICAR SI LA RESPUESTA ES JSON VÁLIDO
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    throw new Error("El servidor devolvió una respuesta inválida (no JSON). Código de estado: " + response.status);
                }
                
                const result = await response.json();
                
                // Ocultar indicador de carga
                errorDiv.style.display = "none";
                
                if (!result.valid) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-single-warning').forEach(w => w.remove());
                    
                    // Mostrar error
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger wl-single-warning';
                    errorDiv.innerHTML = `
                        <strong>Longitud de onda no válida</strong>
                        <p class="mb-0">${result.message}</p>
                        ${result.exp_range ? `<small class="text-muted">Rango experimental disponible: [${result.exp_range[0].toFixed(1)}, ${result.exp_range[1].toFixed(1)}] nm</small>` : ''}
                    `;
                    
                    const wlSingleField = document.getElementById('wl-single-field');
                    wlSingleField.after(errorDiv);
                    
                    errorDiv.innerHTML = result.message;
                    errorDiv.className = 'text-danger small';
                    errorDiv.style.display = "block";
                    
                    return false;
                }
                
                // Mostrar info si requiere interpolación
                if (result.interpolation_needed && !result.exact_match) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-single-warning').forEach(w => w.remove());
                    
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'alert alert-info wl-single-warning';
                    infoDiv.innerHTML = `
                        <strong>Interpolación requerida</strong>
                        <p class="mb-1">${result.message}</p>
                        <small class="text-muted">Punto experimental más cercano: ${result.closest_exp_wavelength.toFixed(2)} nm (distancia: ${result.distance.toFixed(2)} nm)</small>
                    `;
                    
                    const wlSingleField = document.getElementById('wl-single-field');
                    wlSingleField.after(infoDiv);
                }
                
                return true;
                
            } catch (error) {
                // Ocultar indicador de carga
                errorDiv.style.display = "none";
                
                // Remover advertencias previas
                document.querySelectorAll('.wl-single-warning').forEach(w => w.remove());
                
                // Mostrar error detallado
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger wl-single-warning';
                errorDiv.innerHTML = `
                    <strong>Error al validar longitud de onda</strong>
                    <p class="mb-2">${error.message}</p>
                    <small class="text-muted">Si el problema persiste, intenta recargar la página.</small>
                `;
                
                const wlSingleField = document.getElementById('wl-single-field');
                wlSingleField.after(errorDiv);
                
                errorDiv.innerHTML = ` Error de validación: ${error.message}`;
                errorDiv.className = 'text-danger small';
                errorDiv.style.display = "block";
                
                console.error('Error completo:', error);
                
                return false;
            }
            
        } else if (wlMode === 'file') {
            if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
                errorDiv.innerText = "No hay datos experimentales cargados";
                errorDiv.style.display = "block";
                return false;
            }
        }
        
        return true;
    }
    
    if (step === 2) {
        console.log('🔍 Validando paso 2 (ambiente)');
        
        // 1. Validar medio ambiente
        const ambientTypeElement = document.querySelector('input[name="ambient-type"]:checked');
        const ambientType = ambientTypeElement ? ambientTypeElement.value : null;
        
        console.log('  - Tipo de ambiente seleccionado:', ambientType);
        
        if (!ambientType) {
            errorDiv.innerText = "Selecciona si el medio ambiente es homogéneo o heterogéneo.";
            errorDiv.style.display = "block";
            return false;
        }
        
        // Solo validar componentes si es EMT
        if (ambientType === 'emt') {
            const ambientComponents = document.querySelectorAll('#ambient-emt-components .medium-emt-component');
            if (ambientComponents.length < 2) {
                errorDiv.innerText = "El ambiente heterogéneo debe tener al menos 2 componentes.";
                errorDiv.style.display = "block";
                return false;
            }
            
            // Validar suma de fracciones del ambiente
            let ambientFractionSum = 0;
            ambientComponents.forEach(comp => {
                const fractionInput = comp.querySelector('.medium-component-fraction');
                const isPercent = comp.querySelector('.medium-fraction-percent')?.checked;
                let value = parseFloat(fractionInput.value) || 0;
                if (isPercent) {
                    value = value / 100;
                }
                ambientFractionSum += value;
            });
            
            if (Math.abs(ambientFractionSum - 1.0) > 0.01) {
                errorDiv.innerHTML = `La suma de fracciones volumétricas del ambiente debe ser 1.0<br><small>Suma actual: ${ambientFractionSum.toFixed(3)}</small>`;
                errorDiv.style.display = "block";
                return false;
            }
        }
        
        // Si llegamos aquí, el paso 2 es válido
        console.log('Paso 2 (ambiente) validado correctamente');
        return true;
    }
    
    if (step === 3) {
        // VALIDACIÓN DEL PASO 3: Solo sustrato
        
        // 1. Validar sustrato
        const substrateTypeElement = document.querySelector('input[name="substrate-type"]:checked');
        const substrateType = substrateTypeElement ? substrateTypeElement.value : null;
        
        if (!substrateType) {
            errorDiv.innerText = "Selecciona si el sustrato es homogéneo o heterogéneo.";
            errorDiv.style.display = "block";
            return false;
        }
        
        // Solo validar componentes si es EMT
        if (substrateType === 'emt') {
            const substrateComponents = document.querySelectorAll('#substrate-emt-components .medium-emt-component');
            if (substrateComponents.length < 2) {
                errorDiv.innerText = "El sustrato heterogéneo debe tener al menos 2 componentes.";
                errorDiv.style.display = "block";
                return false;
            }
            
            // Validar suma de fracciones del sustrato
            let substrateFractionSum = 0;
            substrateComponents.forEach(comp => {
                const fractionInput = comp.querySelector('.medium-component-fraction');
                const isPercent = comp.querySelector('.medium-fraction-percent')?.checked;
                let value = parseFloat(fractionInput.value) || 0;
                if (isPercent) {
                    value = value / 100;
                }
                substrateFractionSum += value;
            });
            
            if (Math.abs(substrateFractionSum - 1.0) > 0.01) {
                errorDiv.innerHTML = `La suma de fracciones volumétricas del sustrato debe ser 1.0<br><small>Suma actual: ${substrateFractionSum.toFixed(3)}</small>`;
                errorDiv.style.display = "block";
                return false;
            }
        }
        
        // Si llegamos aquí, el paso 3 es válido
        console.log('Paso 3 (sustrato) validado correctamente');
        return true;
    }
    
    if (step === 4) {
        // VALIDACIÓN DEL PASO 4: Capas (permitir vacías)
        // No validar nada, permitir capas vacías
        console.log('Paso 4 (capas) validado correctamente');
        return true;
    }
    
    return true;
}

function updateModelSummary() {
    const summaryDiv = document.getElementById("model-summary");
    const contentDiv = document.getElementById("model-summary-content");
    
    // ⭐ CORREGIDO: Obtener layersContainer dentro de la función
    const layersContainer = document.getElementById("layers-container");
    
    if (!layersContainer || layersContainer.children.length === 0) {
        if (summaryDiv) summaryDiv.style.display = "none";
        return;
    }
    
    summaryDiv.style.display = "block";
    
    let html = '<table class="table table-sm table-bordered"><thead><tr>';
    html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Tipo</th><th>Optimizar</th>';
    html += '</tr></thead><tbody>';
    
    [...layersContainer.children].forEach((layer, i) => {
        const nameEl = layer.querySelector(".layer-name");
        const thicknessEl = layer.querySelector(".layer-thickness");
        const typeRadio = layer.querySelector('input[type="radio"]:checked');
        const optimizeEl = layer.querySelector(".layer-optimize");
        
        const name = nameEl ? nameEl.value : `Capa ${i + 1}`;
        const thickness = thicknessEl ? thicknessEl.value : '0';
        const layerType = typeRadio ? typeRadio.value : 'No definido';
        const optimize = optimizeEl ? optimizeEl.checked : false;
        
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
    console.log(`📥 collectMediumData: ${medium}`);
    
    // Verificar si es EMT
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio && typeRadio.value === 'emt';
    
    console.log(`  Tipo: ${isEMT ? 'EMT' : 'Homogéneo'}`);
    
    if (isEMT) {
        // ========== MEDIO EMT ==========
        const emtConfig = document.getElementById(`${medium}-emt-config`);
        const emtModelSelect = document.getElementById(`${medium}-emt-model`);
        
        const data = {
            type: 'emt',
            emt_model: emtModelSelect ? emtModelSelect.value : 'bruggeman',
            components: []
        };
        
        // Verificar si ya se calcularon n,k efectivos
        if (emtConfig && emtConfig.dataset.emtCalculated === 'true') {
            console.log(`  ✅ Usando n,k efectivos pre-calculados`);
            data.n_effective = JSON.parse(emtConfig.dataset.nEffective || '[]');
            data.k_effective = JSON.parse(emtConfig.dataset.kEffective || '[]');
            data.wavelengths_effective = JSON.parse(emtConfig.dataset.wavelengthsEffective || '[]');
        }
        
        // Recopilar componentes
        const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
        
        for (const compEl of components) {
            const compData = {};
            
            const nameInput = compEl.querySelector('.medium-component-name');
            compData.name = nameInput ? nameInput.value : 'Componente';
            
            const fractionInput = compEl.querySelector('.medium-component-fraction');
            compData.fraction = fractionInput ? parseFloat(fractionInput.value) || 0.5 : 0.5;

            const modelSelect = compEl.querySelector('.medium-component-model');
            compData.model = modelSelect ? modelSelect.value : 'constant';

            if (compData.model === 'constant') {
                const nInput = compEl.querySelector('.medium-comp-n');
                const kInput = compEl.querySelector('.medium-comp-k');
                compData.n = nInput ? parseFloat(nInput.value) || 1.5 : 1.5;
                compData.k = kInput ? parseFloat(kInput.value) || 0 : 0;
            }
            
            data.components.push(compData);
        }
        
        return data;
        
    } else {
        // ========== MEDIO HOMOGÉNEO ==========
        const modelSelect = document.getElementById(`${medium}-model`);
        const modelType = modelSelect ? modelSelect.value : 'constant';
        
        console.log(`  Modelo: ${modelType}`);
        
        const data = { type: modelType };
        
        // ⭐ CORRECCIÓN: Manejar presets (glass, si, constant)
        if (modelType === "constant" || modelType === "glass" || modelType === "si") {
            const nInput = document.getElementById(`${medium}-n-constant`);
            const kInput = document.getElementById(`${medium}-k-constant`);
            
            // ⭐ VERIFICAR QUE EXISTEN ANTES DE LEER .value
            if (nInput) {
                data.n = parseFloat(nInput.value) || 1.0;
            } else {
                // Valores por defecto según el preset
                if (modelType === "glass") data.n = 1.52;
                else if (modelType === "si") data.n = 3.87;
                else data.n = 1.0;
            }
            
            if (kInput) {
                data.k = parseFloat(kInput.value) || 0;
            } else {
                if (modelType === "si") data.k = 0.02;
                else data.k = 0;
            }
            
            console.log(`  n=${data.n}, k=${data.k}`);
            
        } else if (modelType === "file_nk" || modelType === "file_epsilon") {
            // Archivo de datos ópticos
            const fileInput = document.getElementById(`${medium}-file`);
            
            // Primero intentar obtener de dataset (ya cargado)
            if (fileInput && fileInput.dataset.opticalData) {
                try {
                    data.optical_data = JSON.parse(fileInput.dataset.opticalData);
                    console.log(`  ✅ Datos ópticos de dataset`);
                } catch (e) {
                    console.error(`  ❌ Error parseando dataset:`, e);
                }
            } else if (fileInput && fileInput.files && fileInput.files[0]) {
                // Subir archivo
                const file = fileInput.files[0];
                data.file_name = file.name;
                data.file_type = modelType === "file_epsilon" ? "epsilon" : "nk";
                
                const formData = new FormData();
                formData.append("file", file);
                formData.append("file_type", data.file_type);
                
                const response = await fetch("/api/upload-optical-data", {
                    method: "POST",
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.error || result.success === false) {
                    throw new Error(result.error || 'Error al procesar archivo');
                }
                
                data.optical_data = result.data;
                console.log(`  ✅ Archivo subido`);
            }
            
        } else if (modelType === "custom") {
            const equationInput = document.querySelector(`#${medium}-custom-section .latex-equation-value`);
            data.equation = equationInput ? equationInput.value : '';
            
        } else if (window.dispersionTemplates && window.dispersionTemplates[modelType]) {
            // Modelo de dispersión (Cauchy, Sellmeier, etc.)
            data.params = {};
            const paramsDiv = document.getElementById(`${medium}-params`);
            
            if (paramsDiv) {
                const inputs = paramsDiv.querySelectorAll('input[type="number"]');
                inputs.forEach(inp => {
                    const paramName = inp.id.replace(`${medium}-`, '') || inp.dataset.param;
                    if (paramName) {
                        data.params[paramName] = parseFloat(inp.value) || 0;
                    }
                });
            }
            
            console.log(`  Parámetros:`, data.params);
        }
        
        return data;
    }
}

// FUNCIÓN CORREGIDA: Recopilar datos de capa con prioridad a datos ya cargados
async function collectLayerData(layerElement) {
    console.log('🔍 [collectLayerData] Iniciando...');
    
    const data = {};
    data.name = layerElement.querySelector(".layer-name").value;
    data.thickness = Number(layerElement.querySelector(".layer-thickness").value);
    data.optimize_thickness = layerElement.querySelector(".layer-optimize").checked;
    
    console.log(`  📛 Capa: ${data.name}`);
    console.log(`  📏 Espesor: ${data.thickness} nm`);
    
    const layerType = layerElement.querySelector('input[type="radio"]:checked').value;
    data.layer_type = layerType;
    
    console.log(`  🔹 Tipo: ${layerType}`);

    if (layerType === 'homogeneous') {
        // ========== CAPA HOMOGÉNEA (código sin cambios) ==========
        console.log('  📦 Procesando capa HOMOGÉNEA');
        
        data.model = layerElement.querySelector(".layer-model").value;
        console.log(`    - Modelo: ${data.model}`);
        
        if (data.model === 'constant') {
            data.n = Number(layerElement.querySelector(".layer-n-const").value);
            data.k = Number(layerElement.querySelector(".layer-k-const").value);
            console.log(`    - n: ${data.n}, k: ${data.k}`);
            
        } else if (data.model === 'custom') {
            const equationInput = layerElement.querySelector(".layer-custom-row .latex-equation-value");
            data.equation = equationInput ? equationInput.value : '';
            if (!data.equation) {
                console.warn("⚠️ Ecuación personalizada vacía en capa", data.name);
            }
            console.log(`    - Ecuación: ${data.equation}`);
            
        } else if (dispersionTemplates[data.model]) {
            data.params = {};
            data.optimize_params = {};
            const inputs = layerElement.querySelectorAll(".layer-param");
            inputs.forEach(inp => {
                const paramName = inp.dataset.param;
                const val = inp.value.trim();
                data.params[paramName] = val !== '' ? Number(val) : null;

                const optimizeCheckbox = layerElement.querySelector(`.optimize-param[data-param="${paramName}"]`);
                if (optimizeCheckbox) {
                    data.optimize_params[paramName] = optimizeCheckbox.checked;
                }
            });
            console.log(`    - Parámetros:`, data.params);
            
        } else if (data.model === "file_nk" || data.model === "file_epsilon") {
            console.log(`    - Modelo de archivo: ${data.model}`);
            
            const opticalDataStr = layerElement.dataset.opticalData;
            
            if (opticalDataStr) {
                try {
                    data.optical_data = JSON.parse(opticalDataStr);
                    console.log(`    ✅ Datos ópticos recuperados de dataset (${data.optical_data.wavelength?.length} puntos)`);
                } catch (e) {
                    console.error(`    ❌ Error parseando dataset.opticalData:`, e);
                    throw new Error(`Error en capa "${data.name}": Datos ópticos corruptos`);
                }
            } else {
                const file = layerElement.querySelector(".layer-file").files[0];
                
                if (file) {
                    console.log(`    📤 Subiendo archivo: ${file.name}`);
                    
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
                        
                        if (result.error || result.success === false) {
                            throw new Error(result.error || 'Error al procesar archivo de capa');
                        }
                        
                        data.optical_data = result.data;
                        console.log(`    ✅ Archivo subido (${data.optical_data.wavelength?.length} puntos)`);
                        
                        layerElement.dataset.opticalData = JSON.stringify(result.data);
                        
                        const fileInput = layerElement.querySelector(".layer-file");
                        await validateMaterialFileRange(file, result.data, fileInput);
                        
                    } catch (e) {
                        console.error("❌ Error uploading layer optical data:", e);
                        throw e;
                    }
                } else {
                    console.error(`    ❌ No se encontró archivo ni dataset para capa "${data.name}"`);
                    throw new Error(`La capa "${data.name}" requiere un archivo de datos ópticos`);
                }
            }
        }
        
    } else if (layerType === 'heterogeneous') {
        // ========== CAPA HETEROGÉNEA (EMT) - VERSIÓN CORREGIDA ==========
        console.log('  📦 Procesando capa HETEROGÉNEA (EMT)');
        
        data.layer_type = 'emt';
        data.emt_model = layerElement.querySelector('.emt-model-select').value;
        data.components = [];
        
        console.log(`    🧪 Modelo EMT: ${data.emt_model}`);

        const components = layerElement.querySelectorAll('.emt-component');
        console.log(`    📊 Componentes encontrados: ${components.length}`);
        
        for (const compEl of components) {
            console.log(`\n      🔸 Procesando componente...`);
            
            const compData = {};
            compData.name = compEl.querySelector('.component-name').value;
            
            // ✅ CORRECCIÓN: Leer fracción volumétrica (SIEMPRE decimal 0-1)
            const fractionInput = compEl.querySelector('.component-fraction');
            
            if (!fractionInput) {
                throw new Error(`No se encontró input de fracción en componente "${compData.name}"`);
            }
            
            let fraction = parseFloat(fractionInput.value);
            
            if (isNaN(fraction)) {
                throw new Error(`Fracción inválida en componente "${compData.name}": ${fractionInput.value}`);
            }
            
            compData.fraction = fraction;
            
            // ⭐ NUEVO: Verificar si la fracción está marcada para optimización
            const optimizeFractionCheckbox = compEl.querySelector('.fraction-optimize');
            if (optimizeFractionCheckbox) {
                compData.optimize_fraction = optimizeFractionCheckbox.checked;
                console.log(`        - Optimizar fracción: ${compData.optimize_fraction ? 'SÍ' : 'NO'}`);
            }

            const model = compEl.querySelector('.component-model').value;
            compData.model = model;
            
            console.log(`        - Nombre: ${compData.name}`);
            console.log(`        - Fracción: ${compData.fraction}`);
            console.log(`        - Modelo: ${model}`);

            if (model === 'constant') {
                compData.n = Number(compEl.querySelector('.component-n').value);
                compData.k = Number(compEl.querySelector('.component-k').value);
                console.log(`        - n: ${compData.n}, k: ${compData.k}`);
                
            } else if (model === 'custom') {
                const equationInput = compEl.querySelector('.component-custom-section .latex-equation-value');
                compData.equation = equationInput ? equationInput.value : '';
                console.log(`        - Ecuación: ${compData.equation}`);
                
            } else if (dispersionTemplates[model]) {
                compData.params = {};
                const inputs = compEl.querySelectorAll('.component-param');
                inputs.forEach(inp => {
                    const val = inp.value.trim();
                    compData.params[inp.dataset.param] = val !== '' ? Number(val) : null;
                });
                console.log(`        - Parámetros:`, compData.params);
                
            } else if (model === "file_nk" || model === "file_epsilon") {
                console.log(`        - Modelo de archivo: ${model}`);
                
                const opticalDataStr = compEl.dataset.opticalData;
                
                if (opticalDataStr) {
                    try {
                        compData.optical_data = JSON.parse(opticalDataStr);
                        console.log(`        ✅ Datos ópticos recuperados de dataset (${compData.optical_data.wavelength?.length} puntos)`);
                    } catch (e) {
                        console.error(`        ❌ Error parseando dataset.opticalData:`, e);
                        throw new Error(`Error en componente "${compData.name}": Datos ópticos corruptos`);
                    }
                } else {
                    const file = compEl.querySelector('.component-file-input').files[0];
                    
                    if (file) {
                        console.log(`        📤 Subiendo archivo: ${file.name}`);
                        
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
                            
                            if (result.error || result.success === false) {
                                throw new Error(result.error || 'Error al procesar archivo de componente EMT');
                            }
                            
                            compData.optical_data = result.data;
                            console.log(`        ✅ Archivo subido (${compData.optical_data.wavelength?.length} puntos)`);
                            
                            compEl.dataset.opticalData = JSON.stringify(result.data);
                            
                            const fileInput = compEl.querySelector('.component-file-input');
                            await validateMaterialFileRange(file, result.data, fileInput);
                            
                        } catch (e) {
                            console.error("        ❌ Error uploading component optical data:", e);
                            throw e;
                        }
                    } else {
                        console.error(`        ❌ No se encontró archivo ni dataset para componente "${compData.name}"`);
                        throw new Error(`El componente "${compData.name}" requiere un archivo de datos ópticos`);
                    }
                }
            }

            data.components.push(compData);
            console.log(`        ✅ Componente agregado`);
        }
        
        console.log(`    ✅ Total componentes recolectados: ${data.components.length}`);
    }
    
    console.log(`✅ [collectLayerData] Datos completos de capa recolectados\n`);
    return data;
}


// ==========================================
// CORRECCIÓN PARA BOTÓN "GUARDAR MODELO"
// ==========================================
// 
// INSTRUCCIONES:
// 1. Busca en tu app.js la línea: wizardSaveBtn.addEventListener("click", async () => {
// 2. ANTES de esa línea, pega el siguiente código:
// ==========================================

// ==========================================
// DECLARACIÓN DE VARIABLES DEL WIZARD
// ==========================================
const wizardSaveBtn = document.querySelector('.wizard-save-btn');
const wizardError = document.getElementById('wizard-error');

// Verificar que existen los elementos
if (!wizardSaveBtn) {
    console.error('❌ No se encontró el botón .wizard-save-btn');
}
if (!wizardError) {
    console.error('❌ No se encontró el elemento #wizard-error');
}


// ==========================================
// FUNCIÓN: updateModelSavedBanner (si no existe)
// ==========================================
if (typeof updateModelSavedBanner === 'undefined') {
    function updateModelSavedBanner(model, filename) {
        const bannerDiv = document.getElementById('model-saved-banner');
        if (!bannerDiv) return;
        
        bannerDiv.style.display = 'block';
        
        // Contar capas
        const numLayers = model.layers ? model.layers.length : 0;
        
        // Determinar tipo de ambiente y sustrato
        const ambientType = model.ambient?.type === 'emt' ? 'EMT' : 
                           (model.ambient?.type || 'Constante');
        const substrateType = model.substrate?.type === 'emt' ? 'EMT' : 
                             (model.substrate?.type || 'Glass');
        
        bannerDiv.innerHTML = `
            <div class="alert alert-success mb-0">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="alert-heading mb-2">
                            <i class="bi bi-check-circle-fill me-2"></i>
                            ✅ Modelo óptico configurado
                        </h6>
                        <ul class="mb-2 small">
                            <li><strong>Ángulo:</strong> ${model.global?.angle || 70}°</li>
                            <li><strong>Polarización:</strong> ${model.global?.polarization || 'both'}</li>
                            <li><strong>Ambiente:</strong> ${ambientType}</li>
                            <li><strong>Sustrato:</strong> ${substrateType}</li>
                            <li><strong>Capas:</strong> ${numLayers}</li>
                        </ul>
                        <small class="text-muted">Archivo: ${filename}</small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="document.getElementById('btn-continue-model').click()">
                            ✏️ Editar
                        </button>
                        <button class="btn btn-sm btn-success" onclick="calculateTheoreticalValues()">
                            🧮 Calcular teóricos
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    window.updateModelSavedBanner = updateModelSavedBanner;
}

console.log('✅ Código de wizardSaveBtn cargado correctamente');

// ==========================================
// FUNCIÓN: Actualizar banner después de guardar modelo
// ==========================================
function updateModelSavedBanner(model, filename) {
    const banner = document.getElementById("model-saved-banner");
    
    // Calcular información del modelo
    const layersCount = model.layers.length;
    let wlInfo = "";
    
    if (model.global.wavelength_mode === 'file') {
        const wlCount = model.global.wavelengths ? model.global.wavelengths.length : 0;
        const wlMin = wlCount > 0 ? Math.min(...model.global.wavelengths).toFixed(1) : 0;
        const wlMax = wlCount > 0 ? Math.max(...model.global.wavelengths).toFixed(1) : 0;
        wlInfo = `${wlCount} puntos (${wlMin}-${wlMax} nm)`;
    } else if (model.global.wavelength_mode === 'range') {
        wlInfo = `${model.global.wl_steps} puntos (${model.global.wl_from}-${model.global.wl_to} nm)`;
    } else if (model.global.wavelength_mode === 'single') {
        wlInfo = `${model.global.wl_single} nm`;
    }
    
    const angle = model.global.angle;
    
    // Actualizar HTML del banner
    banner.innerHTML = `
        <div class="alert alert-success" style="margin: 0;">
            <h6 class="mb-2">✓ Modelo óptico guardado correctamente</h6>
            <p class="mb-2 small"><strong>Archivo:</strong> ${filename}</p>
            <p class="mb-3 small">
                <strong>Configuración:</strong> ${layersCount} capas, ${wlInfo}, ángulo ${angle}°
            </p>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" id="view-model-summary-btn">
                    Ver resumen del modelo
                </button>
                <button class="btn btn-sm btn-success" id="calculate-theoretical-btn">
                    Calcular Psi y Delta teóricos
                </button>
            </div>
        </div>
    `;
    
    banner.style.display = "block";
    
    // Event listener para "Ver resumen"
    document.getElementById("view-model-summary-btn").addEventListener("click", () => {
        if (savedModel) {
            showModelSummaryModal(savedModel);
        }
    });
    
    // Event listener para "Calcular teóricos"
    document.getElementById("calculate-theoretical-btn").addEventListener("click", () => {
        calculateTheoreticalPsiDelta();
    });
}

async function calculateTheoreticalPsiDelta() {
    try {
        console.log("=".repeat(60));
        console.log("INICIO CÁLCULO DE PSI Y DELTA TEÓRICOS");
        console.log("=".repeat(60));
        
        if (!savedModel) {
            alert("Error: No hay un modelo óptico guardado. Por favor, guarde el modelo primero.");
            return;
        }
        
        if (!currentData || !uploadedFileData || uploadedFileData.length === 0) {
            alert("Error: No hay datos experimentales cargados. Por favor, suba un archivo con datos experimentales primero.");
            return;
        }
        
        const cols = currentData.columns;
        const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
        const psiCol = findColumn(cols, ["psi"]);
        const deltaCol = findColumn(cols, ["delta"]);
        
        if (!lambdaCol || !psiCol || !deltaCol) {
            alert("Error: No se encontraron las columnas necesarias (wavelength, psi, delta) en los datos experimentales.");
            return;
        }
        
        const wavelengths_exp = uploadedFileData.map(r => r[lambdaCol]);
        const psi_exp = uploadedFileData.map(r => r[psiCol]);
        const delta_exp = uploadedFileData.map(r => r[deltaCol]);
        
        console.log(`Datos experimentales: ${wavelengths_exp.length} puntos`);
        console.log(`Modelo: ${savedModel.layers.length} capas, ángulo ${savedModel.global.angle}°`);
        
        showCalculationProgressBanner();
        
        const requestData = {
            model: savedModel,
            experimental_data: {
                wavelengths: wavelengths_exp,
                psi_exp: psi_exp,
                delta_exp: delta_exp
            }
        };
        
        console.log("Enviando request al backend...");
        const response = await fetch('/api/calculate-theoretical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        console.log("Respuesta recibida:", result.success ? "✓ Éxito" : "✗ Error");
        
        if (!response.ok || !result.success) {
            const errorMsg = result.error || 'Error desconocido en el cálculo';
            const suggestion = result.suggestion || '';
            console.error("Error en cálculo:", errorMsg);
            showCalculationErrorBanner(errorMsg, suggestion);
            return;
        }
        
        // ⭐⭐⭐ CORRECCIÓN: Guardar TODOS los datos retornados
        theoreticalPsi = result.data?.psi_theoretical || [];
        theoreticalDelta = result.data?.delta_theoretical || [];
        
        // ⭐⭐⭐ NUEVO: Guardar optical_constants y tra_spectra
        window.theoreticalOpticalConstants = result.optical_constants || null;
        window.theoreticalTRASpectra = result.tra_spectra || null;
        
        console.log('✅ Valores teóricos calculados y guardados');
        console.log(`  Puntos: ${theoreticalPsi.length}`);
        console.log(`  χ² inicial: ${result.goodness_of_fit.chi_squared.toFixed(4)}`);
        
        // ⭐⭐⭐ VERIFICAR si se recibieron datos adicionales
        if (window.theoreticalOpticalConstants) {
            console.log('✅ Constantes ópticas recibidas');
            console.log(`  Capas: ${window.theoreticalOpticalConstants.layers?.length || 0}`);
        } else {
            console.warn('⚠️ No se recibieron constantes ópticas');
        }
        
        if (window.theoreticalTRASpectra) {
            console.log('✅ Espectros T-R-A recibidos');
            console.log(`  Puntos T: ${window.theoreticalTRASpectra.T?.length || 0}`);
        } else {
            console.warn('⚠️ No se recibieron espectros T-R-A');
        }
        
        console.log(`✓ Cálculo completado en ${result.calculation_time} s`);
        console.log(`  χ² = ${result.goodness_of_fit.chi_squared.toFixed(4)}`);
        console.log(`  χ²ᵣ = ${result.goodness_of_fit.chi_squared_reduced.toFixed(4)}`);
        console.log("=".repeat(60));
        
        showCalculationResultsBanner(result);

        if (typeof enableAdvancedGraphSelector === 'function') {
            enableAdvancedGraphSelector();
        }
        
        // ✅ CORRECCIÓN: Guardar resultado (DENTRO del try donde result existe)
        window.currentTheoreticalData = result;
        
        // ✅ CORRECCIÓN: Renderizar gráficas después del cálculo
        setTimeout(() => {
            if (typeof enableAdvancedGraphSelector === 'function') {
                enableAdvancedGraphSelector();
            }
            if (typeof renderGraphsForType === 'function') {
                renderGraphsForType(currentGraphType);
            }
        }, 500);
        
    } catch (error) {
        console.error("Error crítico en cálculo teórico:", error);
        showCalculationErrorBanner(
            "Error de conexión: " + error.message,
            "Verifique su conexión al servidor y vuelva a intentarlo."
        );
    }
}
// ==========================================
// FUNCIÓN: Mostrar progreso del cálculo
// ==========================================
function showCalculationProgressBanner() {
    const banner = document.getElementById("model-saved-banner");
    
    banner.innerHTML = `
        <div class="alert alert-info" style="margin: 0;">
            <h6 class="mb-2">Calculando valores teóricos...</h6>
            <div class="progress mb-2" style="height: 8px;">
                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                     role="progressbar" 
                     style="width: 100%"></div>
            </div>
            <p class="mb-0 small">
                ✓ Calculando propiedades ópticas (n,k)<br>
                ✓ Aplicando Método de Matriz de Transferencia<br>
                → Calculando Psi y Delta teóricos
            </p>
        </div>
    `;
}

// ==========================================
// FUNCIÓN: Mostrar error en el cálculo
// ==========================================
function showCalculationErrorBanner(errorMsg, suggestion) {
    const banner = document.getElementById("model-saved-banner");
    
    banner.innerHTML = `
        <div class="alert alert-danger" style="margin: 0;">
            <h6 class="mb-2">Error en el cálculo</h6>
            <p class="mb-2"><strong>${errorMsg}</strong></p>
            ${suggestion ? `<p class="mb-2 small"><strong>Sugerencia:</strong> ${suggestion}</p>` : ''}
            <button class="btn btn-sm btn-outline-danger" onclick="location.reload()">
                Recargar página
            </button>
        </div>
    `;
}

// ==========================================
// FUNCIÓN: Mostrar resultados del cálculo
// ==========================================
function showCalculationResultsBanner(result) {
    const banner = document.getElementById("model-saved-banner");
    
    const gof = result.goodness_of_fit;
    
    // ✅ NUEVO: Determinar calidad basada en MSE
    const mse = gof.mse;
    let qualityLabel, qualityColor;
    
    if (mse < 5) {
        qualityLabel = 'EXCELENTE';
        qualityColor = 'success';
    } else if (mse < 20) {
        qualityLabel = 'BUENO';
        qualityColor = 'info';
    } else if (mse < 50) {
        qualityLabel = 'ACEPTABLE';
        qualityColor = 'warning';
    } else {
        qualityLabel = 'NO ACEPTABLE';
        qualityColor = 'danger';
    }
    
    const badgeClass = `badge bg-${qualityColor}`;
    
    banner.innerHTML = `
        <div class="alert alert-${qualityColor}" style="margin: 0;">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h6 class="mb-1">✓ Cálculo completado (${result.calculation_time} s)</h6>
                    <p class="mb-0 small text-muted">
                        Psi y Delta teóricos calculados para ${result.points_calculated} longitudes de onda
                    </p>
                </div>
                <span class="${badgeClass}" style="font-size: 0.9em;">
                    ${qualityLabel}
                </span>
            </div>
            
            <div class="card mb-3">
                <div class="card-body" style="padding: 1rem;">
                    <h6 class="card-title mb-2">Análisis de ajuste inicial</h6>
                    
                    <!-- ✅ MSE como métrica principal -->
                    <div class="alert alert-${qualityColor} mb-3" style="padding: 10px;">
                        <div class="row align-items-center">
                            <div class="col-md-8">
                                <strong>MSE (Mean Squared Error):</strong> ${gof.mse.toFixed(2)}
                            </div>
                            <div class="col-md-4 text-end">
                                <span class="badge bg-${qualityColor}">${qualityLabel}</span>
                            </div>
                        </div>
                        <small class="text-muted d-block mt-1">
                            Basado en transformación N,C,S 
                        </small>
                    </div>
                    
                    <!-- Métricas secundarias en acordeón -->
                    <div class="accordion accordion-flush" id="metricsAccordion">
                        <div class="accordion-item">
                            <h2 class="accordion-header">
                                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#detailedMetrics">
                                    📊 Ver métricas detalladas
                                </button>
                            </h2>
                            <div id="detailedMetrics" class="accordion-collapse collapse" data-bs-parent="#metricsAccordion">
                                <div class="accordion-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <strong>Métricas en N,C,S:</strong>
                                            <ul class="small mb-2">
                                                <li>χ²: ${gof.chi_squared.toFixed(4)}</li>
                                                <li>χ²ᵣ: ${gof.chi_squared_reduced.toFixed(4)}</li>
                                            </ul>
                                            
                                            <strong>Psi:</strong>
                                            <ul class="small mb-0">
                                                <li>RMSE: ${gof.psi_metrics.rmse.toFixed(3)}°</li>
                                                <li>R²: ${gof.psi_metrics.r_squared.toFixed(4)}</li>
                                                <li>Error máx: ${gof.psi_metrics.max_error.toFixed(3)}°</li>
                                            </ul>
                                        </div>
                                        <div class="col-md-6">
                                            <strong>Delta:</strong>
                                            <ul class="small mb-0">
                                                <li>RMSE: ${gof.delta_metrics.rmse.toFixed(3)}°</li>
                                                <li>R²: ${gof.delta_metrics.r_squared.toFixed(4)}</li>
                                                <li>Error máx: ${gof.delta_metrics.max_error.toFixed(3)}°</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" onclick="showDetailedComparison()">
                    Ver comparación detallada
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="downloadTheoreticalData()">
                    Descargar datos teóricos
                </button>
                <button class="btn btn-sm btn-primary" onclick="startOptimization()">
                    Proceder a optimización
                </button>
            </div>
        </div>
    `;
    
    banner.style.display = "block";
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // ⭐ Mostrar pestañas de visualización
    setTimeout(() => {
        if (typeof enableAdvancedGraphSelector === 'function') {
            enableAdvancedGraphSelector();
        }
        if (typeof renderGraphsForType === 'function') {
            renderGraphsForType(currentGraphType);
        }
    }, 500);
    
    // Guardar resultados globalmente para uso posterior
    window.theoreticalResults = result;
    
    // Actualizar gráficas con valores teóricos
    updateGraphsWithTheoretical();
    
    // Scroll a las gráficas después de un pequeño delay
    setTimeout(() => {
        document.getElementById('psiPlot').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }, 500);
}

// ==========================================
// FUNCIÓN: Actualizar gráficas con valores teóricos
// ==========================================
/**
 * Actualiza las gráficas mostrando valores teóricos
 * Colores: Azul para experimental, Verde para teórico
 */
function updateGraphsWithTheoretical() {
    if (!theoreticalPsi || theoreticalPsi.length === 0) {
        console.warn('No hay valores teóricos para graficar');
        return;
    }
    
    console.log('Actualizando gráficas con valores teóricos');
    
    // Extraer datos experimentales
    const wavelengths = uploadedWavelengths;
    const cols = currentData.columns;
    const psiCol = findColumn(cols, ["psi"]);
    const deltaCol = findColumn(cols, ["delta"]);
    const psi_exp = uploadedFileData.map(r => r[psiCol]);
    const delta_exp = uploadedFileData.map(r => r[deltaCol]);
    
    // Configuración de gráficas
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
    
    // ==========================================
    // GRÁFICA PSI (Experimental + Teórico)
    // ==========================================
    Plotly.newPlot("psiPlot", [
        {
            x: wavelengths,
            y: psi_exp,
            mode: "markers",
            marker: { size: 5, color: "#2E86C1", symbol: "circle" },
            name: "Ψ experimental"
        },
        {
            x: wavelengths,
            y: theoreticalPsi,
            mode: "lines",
            line: { width: 3, color: "#28a745", dash: 'solid' },
            name: "Ψ teórico"
        }
    ], {
        ...layout_base,
        title: "Psi vs Longitud de Onda - Teórico",
        yaxis: { ...layout_base.yaxis, title: "Psi (°)" }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });
    
    // ==========================================
    // GRÁFICA DELTA (Experimental + Teórico)
    // ==========================================
    Plotly.newPlot("deltaPlot", [
        {
            x: wavelengths,
            y: delta_exp,
            mode: "markers",
            marker: { size: 5, color: "#E74C3C", symbol: "circle" },
            name: "Δ experimental"
        },
        {
            x: wavelengths,
            y: theoreticalDelta,
            mode: "lines",
            line: { width: 3, color: "#fd7e14", dash: 'solid' },
            name: "Δ teórico"
        }
    ], {
        ...layout_base,
        title: "Delta vs Longitud de Onda - Teórico",
        yaxis: { ...layout_base.yaxis, title: "Delta (°)" }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });
    
    // ==========================================
    // GRÁFICA COMBINADA (4 curvas)
    // ==========================================
    Plotly.newPlot("combinedPlot", [
        // PSI - Experimental
        {
            x: wavelengths,
            y: psi_exp,
            mode: "markers",
            marker: { size: 5, color: "#2E86C1", symbol: "circle" },
            name: "Ψ experimental",
            yaxis: "y1"
        },
        // PSI - Teórico
        {
            x: wavelengths,
            y: theoreticalPsi,
            mode: "lines",
            line: { width: 3, color: "#28a745" },
            name: "Ψ teórico",
            yaxis: "y1"
        },
        // DELTA - Experimental
        {
            x: wavelengths,
            y: delta_exp,
            mode: "markers",
            marker: { size: 5, color: "#E74C3C", symbol: "circle" },
            name: "Δ experimental",
            yaxis: "y2"
        },
        // DELTA - Teórico
        {
            x: wavelengths,
            y: theoreticalDelta,
            mode: "lines",
            line: { width: 3, color: "#fd7e14" },
            name: "Δ teórico",
            yaxis: "y2"
        }
    ], {
        plot_bgcolor: bgColor,
        paper_bgcolor: "white",
        font: { family: "Arial, sans-serif", size: 11 },
        margin: { l: 60, r: 60, t: 40, b: 50 },
        title: "Ψ y Δ vs Longitud de Onda - Teórico",
        xaxis: { 
            title: "Longitud de onda (nm)",
            showgrid: showGrid,
            gridcolor: gridColor,
            showline: true,
            linewidth: 2,
            linecolor: 'black',
            mirror: true
        },
        yaxis: {
            title: "Psi (°)",
            titlefont: { color: "#28a745" },
            tickfont: { color: "#28a745" },
            showgrid: showGrid,
            gridcolor: gridColor,
            showline: true,
            linewidth: 2,
            linecolor: 'black',
            mirror: true
        },
        yaxis2: {
            title: "Delta (°)",
            titlefont: { color: "#fd7e14" },
            tickfont: { color: "#fd7e14" },
            overlaying: "y",
            side: "right",
            showgrid: false,
            showline: true,
            linewidth: 2,
            linecolor: 'black'
        }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });
    
    console.log('Gráficas actualizadas con valores teóricos');
}




// ==========================================
// VALIDACIÓN DE ARCHIVOS CONTRA MODO DE WAVELENGTH
// ==========================================

/**
 * Valida un archivo de material contra el modo de longitud de onda seleccionado
 * @param {Array} materialWavelengths - Wavelengths del archivo de material
 * @param {HTMLElement} fileInput - Input element donde mostrar mensajes
 * @returns {Promise<Object>} Resultado de validación
 */
async function validateMaterialFileAgainstWavelengthMode(materialWavelengths, fileInput) {
    try {
        // Obtener modo de longitud de onda seleccionado
        const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;
        
        if (!wlMode) {
            console.warn('No se ha seleccionado modo de longitud de onda en el wizard');
            return {
                valid: true,
                status: 'no_validation',
                message: 'No se pudo validar: completa el Paso 1 del wizard primero'
            };
        }
        
        // Preparar request según el modo
        const requestData = {
            material_wavelengths: materialWavelengths,
            wavelength_mode: wlMode
        };
        
        // ============================================
        // MODO 1: Usar wavelengths del archivo experimental
        // ============================================
        if (wlMode === 'file') {
            if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
                return {
                    valid: false,
                    status: 'no_experimental_data',
                    message: 'No hay datos experimentales. Sube un archivo experimental primero en el Paso 1.'
                };
            }
            
            requestData.experimental_wavelengths = uploadedWavelengths;
        }
        
        // ============================================
        // MODO 2: Rango personalizado
        // ============================================
        else if (wlMode === 'range') {
            const wlFrom = parseFloat(document.getElementById('input-wl-from')?.value);
            const wlTo = parseFloat(document.getElementById('input-wl-to')?.value);
            const wlSteps = parseInt(document.getElementById('input-wl-steps')?.value);
            
            if (isNaN(wlFrom) || isNaN(wlTo) || isNaN(wlSteps)) {
                return {
                    valid: false,
                    status: 'incomplete_config',
                    message: 'Define el rango de longitudes de onda en el Paso 1 primero'
                };
            }
            
            requestData.wl_from = wlFrom;
            requestData.wl_to = wlTo;
            requestData.wl_steps = wlSteps;
        }
        
        // ============================================
        // MODO 3: Longitud única
        // ============================================
        else if (wlMode === 'single') {
            const wlSingle = parseFloat(document.getElementById('input-wl-single')?.value);
            
            if (isNaN(wlSingle)) {
                return {
                    valid: false,
                    status: 'incomplete_config',
                    message: 'Define la longitud de onda en el Paso 1 primero'
                };
            }
            
            requestData.wl_single = wlSingle;
        }
        
        // Llamar al endpoint de validación
        console.log('Validando archivo de material contra configuración de wavelength...');
        console.log('Request:', requestData);
        
        const response = await fetch('/api/validate-material-range', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        console.log('Resultado validación:', result);
        
        return result;
        
    } catch (error) {
        console.error('Error validando archivo de material:', error);
        return {
            valid: false,
            status: 'error',
            message: `Error de validación: ${error.message}`
        };
    }
}

/**
 * Muestra el resultado de validación como alerta visual
 * @param {Object} validation - Resultado de validateMaterialFileAgainstWavelengthMode
 * @param {HTMLElement} fileInput - Input donde mostrar la alerta
 */
function showMaterialValidationResult(validation, fileInput) {
    // Remover alertas previas
    const prevAlerts = fileInput.parentElement.querySelectorAll('.material-validation-alert');
    prevAlerts.forEach(alert => alert.remove());
    
    let alertClass, icon;
    
    switch (validation.status) {
        case 'perfect':
            alertClass = 'alert-success';
            
            break;
        case 'needs_interpolation':
            alertClass = 'alert-info';
           
            break;
        case 'partial_coverage':
            alertClass = 'alert-warning';
            
            break;
        case 'insufficient':
        case 'out_of_range':
            alertClass = 'alert-danger';
            
            break;
        case 'no_validation':
        case 'no_experimental_data':
        case 'incomplete_config':
            alertClass = 'alert-warning';
            
            break;
        default:
            alertClass = 'alert-secondary';
            
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertClass} mt-2 material-validation-alert`;
    alertDiv.innerHTML = `
        <strong>${icon} ${validation.message}</strong>
        ${validation.coverage_percentage !== undefined ? `
            <div class="mt-2 small">
                <strong>Cobertura:</strong> ${validation.coverage_percentage.toFixed(1)}%
            </div>
        ` : ''}
    `;
    
    fileInput.after(alertDiv);
}


/**
 * Inicia el proceso de optimización
 */
async function startOptimization() {
    try {
        // Verificar que no haya optimización en progreso
        if (isOptimizing) {
            alert('Ya hay una optimización en progreso');
            return;
        }
        
        // Verificar que existe el modelo guardado
        if (!savedModel) {
            alert('Error: No hay modelo óptico guardado. Por favor, guarda el modelo primero.');
            return;
        }
        
        // Verificar que existen datos experimentales
        if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
            alert('Error: No hay datos experimentales cargados');
            return;
        }
        
        if (!uploadedPsi || uploadedPsi.length === 0 || !uploadedDelta || uploadedDelta.length === 0) {
            alert('Error: No se encontraron datos de Psi y Delta experimentales');
            return;
        }
        
        if (!theoreticalPsi || theoreticalPsi.length === 0) {
            alert('Error: Primero debes calcular los valores teóricos');
            return;
        }
        
        // Recopilar parámetros a optimizar
        const paramsToOptimize = collectParametersToOptimize();
        
        if (paramsToOptimize.length === 0) {
            alert('No hay parámetros marcados para optimizar.\n\nPor favor marca al menos un parámetro (espesor o parámetros de dispersión) en el modelo óptico.');
            return;
        }
        
        console.log('Parámetros a optimizar:', paramsToOptimize);
        
        // Confirmar con el usuario
        const paramNames = paramsToOptimize.map(p => p.name).join('\n  • ');
        const confirmed = confirm(
            `¿Deseas optimizar los siguientes parámetros?\n\n  • ${paramNames}\n\n` +
            `Esto puede tomar 1-3 segundos.`
        );
        
        if (!confirmed) {
            return;
        }
        
        // Mostrar pantalla de progreso
        showOptimizationProgress();
        
        isOptimizing = true;
        
        // CORRECCIÓN: Preparar modelo con estructura correcta ⭐⭐⭐
        const requestData = {
            psi_exp: uploadedPsi,
            delta_exp: uploadedDelta,
            wavelengths: uploadedWavelengths,
            optical_model: {
                angle: savedModel.global?.angle || 70.0,
                ambient: savedModel.ambient || {},
                substrate: savedModel.substrate || {},
                layers: savedModel.layers || []
            },
            params_to_optimize: paramsToOptimize
        };
        
        console.log('Enviando solicitud de optimización...');
        console.log('  Modelo óptico:', requestData.optical_model);
        console.log('  Parámetros:', requestData.params_to_optimize);
        
        // Llamar al backend
        const response = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (!result.success) {
            throw new Error(result.message || 'Optimización no convergió');
        }
        
        console.log('Optimización completada:', result);
        
        // Guardar resultados
        optimizationResults = result;
        
        // Actualizar valores teóricos con los optimizados
        theoreticalPsi = result.psi_theoretical;
        theoreticalDelta = result.delta_theoretical;
        
        // Mostrar resultados
        showOptimizationResults(result);
        
    } catch (error) {
        console.error('Error en optimización:', error);
        alert(`Error durante la optimización:\n\n${error.message}`);
        hideOptimizationProgress();
    } finally {
        isOptimizing = false;
    }
}

/**
 * Ejecuta optimización con el algoritmo seleccionado
 * VERSIÓN v6.0 + MULTIGUESS v5.0 - Con validación física mejorada y soporte multiguess
 */
async function executeOptimizationWithAlgorithm(algorithm, advancedConfig = {}) {
    try {
        console.log(`🚀 Iniciando optimización con algoritmo: ${algorithm}`);
        
        // ========================================
        // 1. VERIFICACIONES PREVIAS
        // ========================================
        if (isOptimizing) {
            alert('Ya hay una optimización en progreso');
            return;
        }
        
        if (!savedModel) {
            alert('Error: No hay modelo óptico guardado.');
            return;
        }
        
        if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
            alert('Error: No hay datos experimentales cargados');
            return;
        }
        
        if (!theoreticalPsi || theoreticalPsi.length === 0) {
            alert('Error: Primero debes calcular los valores teóricos');
            return;
        }
        
        // ========================================
        // 2. RECOPILAR PARÁMETROS A OPTIMIZAR
        // ========================================
        const paramsToOptimize = collectParametersToOptimize();
        
        if (paramsToOptimize.length === 0) {
            alert('No hay parámetros marcados para optimizar.');
            return;
        }
        
        console.log(`📊 Parámetros a optimizar: ${paramsToOptimize.length}`);
        console.log(`🔧 Algoritmo: ${algorithm}`);
        
        // ========================================
        // 3. MOSTRAR PROGRESO
        // ========================================
        showOptimizationProgress(algorithm);
        isOptimizing = true;
        
        // ========================================
        // 4. PREPARAR REQUEST CON VALIDACIÓN MEJORADA + MULTIGUESS v5.0
        // ========================================
        const requestData = {
            psi_exp: uploadedPsi,
            delta_exp: uploadedDelta,
            wavelengths: uploadedWavelengths,
            optical_model: {
                global: {
                    angle: savedModel.global.angle,
                    polarization: savedModel.global.polarization,
                    wavelength_mode: savedModel.global.wavelength_mode,
                    // Incluir campos según el modo
                    ...(savedModel.global.wavelength_mode === 'file' && {
                        wavelengths: savedModel.global.wavelengths
                    }),
                    ...(savedModel.global.wavelength_mode === 'range' && {
                        wl_from: savedModel.global.wl_from,
                        wl_to: savedModel.global.wl_to,
                        wl_steps: savedModel.global.wl_steps
                    }),
                    ...(savedModel.global.wavelength_mode === 'single' && {
                        wl_single: savedModel.global.wl_single
                    })
                },
                ambient: savedModel.ambient,
                substrate: savedModel.substrate,
                layers: savedModel.layers
            },
            params_to_optimize: paramsToOptimize,
            algorithm: algorithm,
            
            // ⭐⭐⭐ NUEVO v5.0: Estrategia multiguess ⭐⭐⭐
            strategy: advancedConfig.useMultiguess ? 'multiguess' : 'simultaneous',
            
            // ⭐⭐⭐ NUEVO v5.0: Parámetros Multiguess ⭐⭐⭐
            use_multiguess: advancedConfig.useMultiguess || false,
            n_guesses: advancedConfig.nGuesses || 5,
            
            // ⭐⭐⭐ VALIDACIÓN FÍSICA MEJORADA ⭐⭐⭐
            use_enhanced_validation: true,
            max_iterations: algorithm === 'simplex' ? 500 : 300,
            
            // ⭐ Activar damping adaptativo para LM
            adaptive_damping: algorithm === 'levenberg_marquardt',
            
            // Límites físicos de cambio
            max_thickness_change: 2.0,      // 200% máximo para espesores
            max_n_change: 0.5,               // 50% máximo para n
            max_k_change: 1.0,               // 100% máximo para k
            max_fraction_change: 0.3,        // 30% máximo para fracciones
            
            // ⭐⭐⭐ CONFIGURACIÓN ESPECÍFICA DE SIMPLEX ⭐⭐⭐
            ...(algorithm === 'simplex' && {
                simplex_adaptive: true,              // Parámetros adaptativos
                max_stagnant_iterations: 15,         // Máx iteraciones sin mejora
                simplex_restart_threshold: 20,       // Umbral para restart
                max_restarts: 3                      // Máximo 3 restarts
            }),
            
            // ⭐ PARÁMETROS OPCIONALES (configuración avanzada)
            ...(advancedConfig.sigma_psi && { sigma_psi: advancedConfig.sigma_psi }),
            ...(advancedConfig.sigma_delta && { sigma_delta: advancedConfig.sigma_delta }),
            ...(advancedConfig.use_tikhonov_regularization !== undefined && { 
                use_tikhonov_regularization: advancedConfig.use_tikhonov_regularization 
            }),
            ...(advancedConfig.lambda_reg && { lambda_reg: advancedConfig.lambda_reg })
        };
        
        // ========================================
        // 5. LOGGING DETALLADO
        // ========================================
        console.log('📤 Enviando request de optimización');
        console.log('  - Algoritmo:', algorithm);
        console.log('  - Parámetros:', paramsToOptimize.length);
        console.log('  - Validación mejorada: ACTIVADA');
        console.log('  - Damping adaptativo:', algorithm === 'levenberg_marquardt' ? 'SÍ' : 'NO');
        
        // ⭐⭐⭐ NUEVO v5.0: Log de multiguess ⭐⭐⭐
        if (advancedConfig.useMultiguess) {
            console.log(`  - 🎯 MULTIGUESS ACTIVADO: ${advancedConfig.nGuesses} guesses`);
            console.log(`  - Estrategia: multiguess`);
            console.log(`  - Variaciones configuradas por parámetro`);
        } else {
            console.log(`  - Estrategia: simultaneous (single guess)`);
        }
        
        console.log('  - Límites de cambio:');
        console.log('    • Espesor: 200%');
        console.log('    • n: 50%');
        console.log('    • k: 100%');
        console.log('    • Fracciones: 30%');
        
        if (algorithm === 'simplex') {
            console.log('  - Configuración Simplex:');
            console.log('    • Adaptativo: SÍ');
            console.log('    • Max stagnant: 15 iter');
            console.log('    • Restart threshold: 20 iter');
            console.log('    • Max restarts: 3');
        }
        
        // ========================================
        // 6. LLAMAR AL BACKEND
        // ========================================
        const response = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        // ========================================
        // 🔍 DIAGNÓSTICO COMPLETO DE LA RESPUESTA
        // ========================================
        console.log('='.repeat(60));
        console.log('🔍 DIAGNÓSTICO FRONTEND - Respuesta completa:');
        console.log('='.repeat(60));
        console.log('success:', result.success);
        console.log('status:', result.status);
        console.log('algorithm:', result.algorithm);
        console.log('strategy:', result.strategy); // ⭐ NUEVO v5.0
        console.log('optimized_params:', result.optimized_params);
        console.log('best_params:', result.best_params);
        console.log('validation_result:', result.validation_result);
        console.log('history:', result.history);
        
        // ⭐⭐⭐ NUEVO v5.0: Diagnóstico multiguess ⭐⭐⭐
        if (result.strategy === 'multiguess') {
            console.log('');
            console.log('🎯 RESULTADOS MULTIGUESS:');
            console.log('  - all_results:', result.all_results ? `${result.all_results.length} guesses` : 'N/A');
            console.log('  - n_guesses:', result.n_guesses);
            console.log('  - best_guess_index:', result.best_guess_index);
            console.log('  - summary:', result.summary ? 'presente' : 'ausente');
            if (result.summary) {
                console.log('    • converged_count:', result.summary.converged_count);
                console.log('    • failed_count:', result.summary.failed_count);
                console.log('    • best_mse:', result.summary.best_mse);
            }
        }
        
        console.log('Claves en result:', Object.keys(result));
        console.log('='.repeat(60));
        
        // Verificar componentes principales
        if (!result.optimized_params && result.strategy !== 'multiguess') {
            console.error('❌ FALTA optimized_params en la respuesta');
        } else if (result.strategy !== 'multiguess') {
            console.log('✅ optimized_params presente:', Object.keys(result.optimized_params));
        }
        
        if (!result.initial_metrics && result.strategy !== 'multiguess') {
            console.error('❌ FALTA initial_metrics en la respuesta');
        } else if (result.strategy !== 'multiguess') {
            console.log('✅ initial_metrics presente');
        }
        
        if (!result.final_metrics && result.strategy !== 'multiguess') {
            console.error('❌ FALTA final_metrics en la respuesta');
        } else if (result.strategy !== 'multiguess') {
            console.log('✅ final_metrics presente');
        }
        
        if (!result.confidence_intervals) {
            console.warn('⚠️ FALTA confidence_intervals (normal para Simplex o Multiguess)');
        } else {
            console.log('✅ confidence_intervals presente');
        }
        
        // ⭐⭐⭐ NUEVO: Logging detallado de validación física ⭐⭐⭐
        if (result.strategy !== 'multiguess') {
            console.log('');
            console.log('🛡️ VALIDACIÓN FÍSICA:');
            if (result.validation_result) {
                console.log('  ✅ validation_result presente');
                console.log('  - Válido:', result.validation_result.valid);
                
                if (result.validation_result.violations) {
                    const violationCount = Object.keys(result.validation_result.violations).length;
                    console.log(`  - Violaciones detectadas: ${violationCount}`);
                    
                    Object.keys(result.validation_result.violations).forEach(param => {
                        const v = result.validation_result.violations[param];
                        console.log(`    • ${param}:`);
                        console.log(`      - Cambio: ${((v.change_percentage || 0) * 100).toFixed(1)}%`);
                        console.log(`      - Tipo: ${v.type || 'N/A'}`);
                        if (v.initial !== undefined) console.log(`      - Inicial: ${v.initial}`);
                        if (v.final !== undefined) console.log(`      - Final: ${v.final}`);
                    });
                } else {
                    console.log('  - Violaciones: ninguna');
                }
                
                if (result.validation_result.warnings && result.validation_result.warnings.length > 0) {
                    console.log(`  - Advertencias: ${result.validation_result.warnings.length}`);
                    result.validation_result.warnings.forEach((w, i) => {
                        console.log(`    ${i + 1}. ${w}`);
                    });
                } else {
                    console.log('  - Advertencias: ninguna');
                }
                
                if (result.validation_result.damping_applied !== undefined) {
                    console.log(`  - Damping aplicado: ${result.validation_result.damping_applied ? 'SÍ' : 'NO'}`);
                }
            } else {
                console.warn('  ⚠️ No hay validation_result (versión legacy del backend)');
            }
        }
        
        // ⭐ NUEVO: Verificar historia detallada
        if (result.strategy !== 'multiguess') {
            console.log('');
            console.log('📊 HISTORIA DE OPTIMIZACIÓN:');
            if (result.history) {
                console.log('  ✅ history presente');
                console.log('  - Pasos aceptados:', result.history.accepted_steps || 0);
                console.log('  - Pasos rechazados:', result.history.rejected_steps || 0);
                console.log('  - Mejor iteración:', result.history.best_iteration || 'N/A');
                
                if (result.history.mse_history) {
                    console.log('  - MSE history length:', result.history.mse_history.length);
                }
                
                // ⭐ NUEVO: Info de restarts para Simplex
                if (result.total_restarts !== undefined) {
                    console.log(`  - Total restarts: ${result.total_restarts}`);
                    if (result.restart_iterations && result.restart_iterations.length > 0) {
                        console.log(`  - Iteraciones de restart: [${result.restart_iterations.join(', ')}]`);
                    }
                }
            } else {
                console.warn('  ⚠️ No hay history (versión legacy del backend)');
            }
        }
        
        console.log('='.repeat(60));
        
        // ========================================
        // 7. VERIFICAR RESULTADO
        // ========================================
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (!result.success) {
            throw new Error(result.message || 'Optimización no convergió');
        }
        
        console.log('✅ Optimización completada exitosamente');
        console.log(`  - Algoritmo usado: ${result.algorithm}`);
        console.log(`  - Estrategia: ${result.strategy || 'simultaneous'}`);
        console.log(`  - Estado: ${result.status || 'N/A'}`);
        
        // ⭐ v5.0: Mejora para multiguess
        if (result.strategy !== 'multiguess') {
            console.log(`  - Mejora: ${result.improvement_percentage?.toFixed(2) || 0}%`);
            
            // ⭐ NUEVO: Advertencia si se usó best_params por violaciones
            if (result.validation_result && !result.validation_result.valid) {
                console.warn('');
                console.warn('⚠️ ADVERTENCIA: Se detectaron violaciones físicas');
                console.warn(`  - Violaciones: ${Object.keys(result.validation_result.violations).join(', ')}`);
                console.warn('  - Solución: Usando best_params en lugar de optimized_params');
                console.warn('  - Esto garantiza que los parámetros finales sean físicamente válidos');
            }
        }
        
        // ========================================
        // 8. GUARDAR RESULTADOS
        // ========================================
        // ⭐ v5.0: Solo guardar si NO es multiguess (multiguess tiene su propio flujo)
        if (result.strategy !== 'multiguess') {
            optimizationResults = result;
            theoreticalPsi = result.psi_theoretical;
            theoreticalDelta = result.delta_theoretical;
        }
        
        // ========================================
        // 9. MOSTRAR RESULTADOS
        // ========================================
        showOptimizationResults(result);
        
        // ⭐⭐⭐ NUEVO: Auto-actualizar gráficas solo si NO es multiguess ⭐⭐⭐
        // (multiguess las actualiza cuando el usuario selecciona un guess)
        if (result.strategy !== 'multiguess') {
            console.log('📈 Actualizando gráficas automáticamente...');
            updateAllPlots();
        }
        
    } catch (error) {
        console.error('❌ Error en optimización:', error);
        console.error('Stack trace:', error.stack);
        alert(`Error durante la optimización:\n\n${error.message}`);
        hideOptimizationProgress();
    } finally {
        isOptimizing = false;
    }
}

/**
 * Recopila parámetros a optimizar del modelo guardado
 * VERSIÓN v6.0 + MULTIGUESS v5.0 - Con configuración de variación por parámetro
 */
function collectParametersToOptimize() {
    const params = [];
    
    // ⭐ CONSTANTES: Tolerancias según tipo de parámetro
    const THICKNESS_TOLERANCE_NM = 5.0;      // Ajustable según equipo de deposición
    const FRACTION_TOLERANCE = 0.3;          // ⭐ NUEVO: ±30% para fracciones EMT
    
    console.log('🔍 Recopilando parámetros a optimizar...');
    console.log('📊 Modelo guardado:', savedModel);
    
    // ========================================
    // 1. VALIDAR QUE EXISTE savedModel
    // ========================================
    if (!savedModel) {
        console.error('❌ No hay modelo guardado');
        return params;
    }
    
    if (!savedModel.layers || !Array.isArray(savedModel.layers)) {
        console.error('❌ El modelo no tiene capas válidas');
        return params;
    }
    
    // ========================================
    // 2. ⭐ OPTIMIZACIÓN DE ESPESORES DE CAPAS
    // ========================================
    const layerCards = document.querySelectorAll('.layer-card');
    console.log(`📋 Capas en DOM: ${layerCards.length}`);
    console.log(`📋 Capas en modelo: ${savedModel.layers.length}`);
    
    layerCards.forEach((layerCard, layerIndex) => {
        const optimizeThickness = layerCard.querySelector('.layer-optimize');
        
        if (optimizeThickness && optimizeThickness.checked) {
            // ✅ VALIDAR que la capa existe en el modelo
            if (!savedModel.layers || layerIndex >= savedModel.layers.length) {
                console.warn(`⚠️ Capa ${layerIndex} no existe en el modelo (solo hay ${savedModel.layers?.length || 0} capas)`);
                return;
            }
            
            const layer = savedModel.layers[layerIndex];
            
            // Obtener espesor del DOM si no está en el modelo
            const thicknessInput = layerCard.querySelector('.layer-thickness');
            const currentValue = thicknessInput ? parseFloat(thicknessInput.value) : 
                                (layer && typeof layer.thickness === 'number' ? layer.thickness : null);
            
            if (!currentValue || isNaN(currentValue) || currentValue <= 0) {
                console.warn(`⚠️ Espesor inválido en capa ${layerIndex}: ${currentValue}`);
                alert(`Error: La capa ${layerIndex + 1} no tiene un espesor válido. Por favor verifica el modelo.`);
                return;
            }
            
            // Bounds realistas con rango mínimo
            const lowerBound = Math.max(0.1, currentValue - THICKNESS_TOLERANCE_NM);
            const upperBound = Math.max(currentValue + THICKNESS_TOLERANCE_NM, lowerBound + 1.0);
            
            // ⭐⭐⭐ NUEVO v5.0: Leer configuración de variación del DOM ⭐⭐⭐
            const thicknessContainer = layerCard.querySelector(`[data-param-name="layer_${layerIndex}_thickness"]`);
            const variationModeSelect = thicknessContainer?.querySelector('.variation-mode-select');
            const variationValueInput = thicknessContainer?.querySelector('.variation-value-input');
            
            const variationMode = variationModeSelect?.value || 'relative';
            const variationValue = parseFloat(variationValueInput?.value || '20');
            
            console.log(`✅ Agregando espesor de capa ${layerIndex}: ${currentValue} nm [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}]`);
            console.log(`   📊 Variación multiguess: ${variationMode} ${variationValue}${variationMode === 'relative' ? '%' : ' nm'}`);
            
            params.push({
                type: 'thickness',
                name: `layer_${layerIndex}_thickness`,
                path: ['layers', layerIndex, 'thickness'],
                initial_value: currentValue,
                lower_bound: lowerBound,
                upper_bound: upperBound,
                // ⭐⭐⭐ NUEVO v5.0: Variación para multiguess ⭐⭐⭐
                variation_mode: variationMode,       // 'absolute' o 'relative'
                variation_value: variationValue      // ±valor numérico
            });
        }
    });
    
    // ========================================
    // 3. OPTIMIZACIÓN DE PARÁMETROS DE DISPERSIÓN
    // ========================================
    const paramCheckboxes = document.querySelectorAll('.optimize-param:checked');
    console.log(`🔧 Checkboxes de parámetros marcados: ${paramCheckboxes.length}`);
    
    paramCheckboxes.forEach((checkbox) => {
        const paramName = checkbox.dataset.param;
        
        if (!paramName) {
            console.warn('⚠️ Checkbox sin data-param:', checkbox);
            return;
        }
        
        const paramInput = checkbox.closest('.param-field')?.querySelector('input[type="number"]');
        
        if (!paramInput) {
            console.warn(`⚠️ No se encontró input para parámetro ${paramName}`);
            return;
        }
        
        const currentValue = parseFloat(paramInput.value);
        
        if (isNaN(currentValue)) {
            console.warn(`⚠️ Valor inválido para ${paramName}: ${paramInput.value}`);
            return;
        }
        
        // ✅ VALIDAR que la capa existe
        const layerCard = checkbox.closest('.layer-card');
        
        if (!layerCard) {
            console.warn(`⚠️ Parámetro ${paramName} no está dentro de una capa`);
            return;
        }
        
        const layerIndex = Array.from(document.querySelectorAll('.layer-card')).indexOf(layerCard);
        
        if (layerIndex === -1) {
            console.warn(`⚠️ No se pudo determinar índice de capa para ${paramName}`);
            return;
        }
        
        // ✅ VALIDAR que la capa existe en el modelo
        if (layerIndex >= savedModel.layers.length) {
            console.warn(`⚠️ Capa ${layerIndex} no existe en modelo para parámetro ${paramName}`);
            return;
        }
        
        const layer = savedModel.layers[layerIndex];
        
        // ✅ VALIDAR que el parámetro existe en la capa
        if (!layer.params || !(paramName in layer.params)) {
            console.warn(`⚠️ Parámetro ${paramName} no existe en capa ${layerIndex}:`, layer);
            return;
        }
        
        // Determinar bounds según el tipo de parámetro
        let lowerBound, upperBound;
        
        if (paramName === 'A' || paramName.startsWith('n')) {
            lowerBound = 0.5;
            upperBound = 5.0;
        } else if (paramName === 'B' || paramName === 'C') {
            lowerBound = 0.0;
            upperBound = 1.0;
        } else if (paramName.includes('epsilon')) {
            lowerBound = -100;
            upperBound = 100;
        } else if (paramName.startsWith('omega') || paramName.startsWith('E')) {
            lowerBound = Math.max(0.1, currentValue * 0.1);
            upperBound = currentValue * 5.0;
        } else if (paramName.startsWith('gamma') || paramName.startsWith('Gamma')) {
            lowerBound = Math.max(0.001, currentValue * 0.1);
            upperBound = currentValue * 10.0;
        } else if (paramName.startsWith('f')) {
            lowerBound = 0.0;
            upperBound = 5.0;
        } else {
            lowerBound = currentValue * 0.5;
            upperBound = currentValue * 1.5;
        }
        
        // ⭐⭐⭐ NUEVO v5.0: Leer configuración de variación del DOM ⭐⭐⭐
        const paramField = checkbox.closest('.param-field');
        const variationModeSelectParam = paramField?.querySelector('.variation-mode-select');
        const variationValueInputParam = paramField?.querySelector('.variation-value-input');
        
        const variationModeParam = variationModeSelectParam?.value || 'relative';
        const variationValueParam = parseFloat(variationValueInputParam?.value || '20');
        
        console.log(`✅ Agregando parámetro ${paramName} de capa ${layerIndex}: ${currentValue}`);
        console.log(`   📊 Variación multiguess: ${variationModeParam} ${variationValueParam}${variationModeParam === 'relative' ? '%' : ''}`);
        
        params.push({
            type: 'dispersion_param',
            name: `layer_${layerIndex}_${paramName}`,
            path: ['layers', layerIndex, 'params', paramName],
            initial_value: currentValue,
            lower_bound: lowerBound,
            upper_bound: upperBound,
            // ⭐⭐⭐ NUEVO v5.0: Variación para multiguess ⭐⭐⭐
            variation_mode: variationModeParam,
            variation_value: variationValueParam
        });
    });
    
    // ========================================
    // 4. ⭐⭐⭐ FRACCIONES VOLUMÉTRICAS DE MEDIOS (AMBIENTE/SUSTRATO) - BOUNDS MEJORADOS
    // ========================================
    console.log('🧪 Buscando fracciones volumétricas optimizables en MEDIOS...');
    
    ['ambient', 'substrate'].forEach(medium => {
        const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
        console.log(`  ${medium}: ${components.length} componentes encontrados`);
        
        components.forEach((comp, idx) => {
            const fractionCheckbox = comp.querySelector('.medium-fraction-optimize');
            if (fractionCheckbox && fractionCheckbox.checked) {
                const fractionInput = comp.querySelector('.medium-component-fraction');
                const currentValue = parseFloat(fractionInput.value) || 0.5;
                
                // ⭐⭐⭐ BOUNDS: ±30% del valor actual
                const lowerBound = Math.max(0.0, currentValue - FRACTION_TOLERANCE);
                const upperBound = Math.min(1.0, currentValue + FRACTION_TOLERANCE);
                
                // ⭐⭐⭐ NUEVO v5.0: Leer configuración de variación del DOM ⭐⭐⭐
                const variationModeSelectFrac = comp.querySelector('.variation-mode-select');
                const variationValueInputFrac = comp.querySelector('.variation-value-input');
                
                const variationModeFrac = variationModeSelectFrac?.value || 'relative';
                const variationValueFrac = parseFloat(variationValueInputFrac?.value || '20');
                
                console.log(`  ✅ Agregando fracción de ${medium} comp ${idx}: ${currentValue} [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`);
                console.log(`     📊 Variación multiguess: ${variationModeFrac} ${variationValueFrac}${variationModeFrac === 'relative' ? '%' : ''}`);
                
                params.push({
                    type: 'emt_fraction',
                    medium: medium,
                    component_index: idx,
                    element: fractionInput,
                    name: `${medium}_comp${idx}_fraction`,
                    path: [medium, 'emt', 'components', idx, 'fraction'],
                    initial_value: currentValue,
                    lower_bound: lowerBound,
                    upper_bound: upperBound,
                    // ⭐⭐⭐ NUEVO v5.0: Variación para multiguess ⭐⭐⭐
                    variation_mode: variationModeFrac,
                    variation_value: variationValueFrac
                });
            }
        });
    });
    
    // ========================================
    // 5. ⭐⭐⭐ FRACCIONES VOLUMÉTRICAS DE CAPAS HETEROGÉNEAS - BOUNDS MEJORADOS
    // ========================================
    console.log('🧪 Buscando fracciones volumétricas optimizables en CAPAS...');
    
    document.querySelectorAll('.layer-card').forEach(layerCard => {
        const layerIdx = parseInt(layerCard.dataset.idx);
        
        // Buscar el contenedor de componentes EMT dentro de la capa
        const emtContainer = layerCard.querySelector('.emt-components-container');
        
        if (!emtContainer) {
            console.log(`  Capa ${layerIdx}: No tiene EMT`);
            return; // Esta capa no es heterogénea
        }
        
        const components = emtContainer.querySelectorAll('.emt-component');
        console.log(`  Capa ${layerIdx}: ${components.length} componentes EMT encontrados`);
        
        components.forEach((comp, compIdx) => {
            const fractionCheckbox = comp.querySelector('.fraction-optimize');
            if (fractionCheckbox && fractionCheckbox.checked) {
                const fractionInput = comp.querySelector('.component-fraction');
                const currentValue = parseFloat(fractionInput.value) || 0.5;
                
                // ⭐⭐⭐ BOUNDS: ±30% del valor actual
                const lowerBound = Math.max(0.0, currentValue - FRACTION_TOLERANCE);
                const upperBound = Math.min(1.0, currentValue + FRACTION_TOLERANCE);
                
                // ⭐⭐⭐ NUEVO v5.0: Leer configuración de variación del DOM ⭐⭐⭐
                const variationModeSelectFrac = comp.querySelector('.variation-mode-select');
                const variationValueInputFrac = comp.querySelector('.variation-value-input');
                
                const variationModeFrac = variationModeSelectFrac?.value || 'relative';
                const variationValueFrac = parseFloat(variationValueInputFrac?.value || '20');
                
                console.log(`  ✅ Agregando fracción de capa ${layerIdx} comp ${compIdx}: ${currentValue} [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`);
                console.log(`     📊 Variación multiguess: ${variationModeFrac} ${variationValueFrac}${variationModeFrac === 'relative' ? '%' : ''}`);
                
                params.push({
                    type: 'emt_fraction',
                    layer_index: layerIdx,
                    component_index: compIdx,
                    element: fractionInput,
                    name: `layer_${layerIdx}_comp${compIdx}_fraction`,
                    path: ['layers', layerIdx, 'emt', 'components', compIdx, 'fraction'],
                    initial_value: currentValue,
                    lower_bound: lowerBound,
                    upper_bound: upperBound,
                    // ⭐⭐⭐ NUEVO v5.0: Variación para multiguess ⭐⭐⭐
                    variation_mode: variationModeFrac,
                    variation_value: variationValueFrac
                });
            }
        });
    });
    
    // ========================================
    // 6. RESUMEN FINAL
    // ========================================
    console.log('='.repeat(60));
    console.log(`📊 RESUMEN: ${params.length} parámetros recopilados para optimizar`);
    console.log(`   Tolerancia de espesores: ±${THICKNESS_TOLERANCE_NM} nm`);
    console.log(`   Tolerancia de fracciones EMT: ±${(FRACTION_TOLERANCE * 100).toFixed(0)}%`);
    console.log('='.repeat(60));
    
    // Agrupar por tipo
    const byType = {
        thickness: params.filter(p => p.type === 'thickness'),
        dispersion_param: params.filter(p => p.type === 'dispersion_param'),
        emt_fraction: params.filter(p => p.type === 'emt_fraction')
    };
    
    console.log(`  📏 Espesores: ${byType.thickness.length}`);
    byType.thickness.forEach((p, i) => {
        console.log(`    ${i+1}. ${p.name}: ${p.initial_value} nm [${p.lower_bound.toFixed(1)}, ${p.upper_bound.toFixed(1)}]`);
        console.log(`       Variación: ${p.variation_mode} ±${p.variation_value}${p.variation_mode === 'relative' ? '%' : ' nm'}`); // ⭐ NUEVO v5.0
    });
    
    console.log(`  🔧 Parámetros de dispersión: ${byType.dispersion_param.length}`);
    byType.dispersion_param.forEach((p, i) => {
        console.log(`    ${i+1}. ${p.name}: ${p.initial_value} [${p.lower_bound}, ${p.upper_bound}]`);
        console.log(`       Variación: ${p.variation_mode} ±${p.variation_value}${p.variation_mode === 'relative' ? '%' : ''}`); // ⭐ NUEVO v5.0
    });
    
    console.log(`  🧪 Fracciones volumétricas EMT: ${byType.emt_fraction.length}`);
    byType.emt_fraction.forEach((p, i) => {
        console.log(`    ${i+1}. ${p.name}: ${p.initial_value} [${p.lower_bound.toFixed(2)}, ${p.upper_bound.toFixed(2)}]`);
        console.log(`       Variación: ${p.variation_mode} ±${p.variation_value}${p.variation_mode === 'relative' ? '%' : ''}`); // ⭐ NUEVO v5.0
    });
    
    console.log('='.repeat(60));
    
    return params;
}


/**
 * ⭐⭐⭐ VERSIÓN 3.0 - Indicador de progreso con actualización en tiempo real
 * Muestra iteración actual, MSE actual, y restarts durante optimización Simplex
 */
function showOptimizationProgress(algorithm = 'levenberg_marquardt') {
    const algorithmNames = {
        'levenberg_marquardt': 'Levenberg-Marquardt',
        'simplex': 'Simplex (Nelder-Mead)',
        'levenberg_marquardt_enhanced': 'Levenberg-Marquardt (Validación Mejorada)'
    };
    
    const algorithmName = algorithmNames[algorithm] || algorithm;
    
    // Mensajes que irán rotando
    const messages = [
        'Calculando residuos ponderados...',
        'Evaluando función objetivo...',
        'Calculando matriz Jacobiana...',
        'Optimizando parámetros simultáneamente...',
        'Verificando convergencia...',
        'Validando restricciones físicas...',
        'Refinando solución...',
        'Casi listo...'
    ];
    
    let currentMessageIndex = 0;
    
    const progressHTML = `
        <!-- Card flotante centrado -->
        <div class="card shadow-lg" id="optimizationProgress" 
             style="position: fixed; 
                    top: 50%; 
                    left: 50%; 
                    transform: translate(-50%, -50%); 
                    z-index: 9999; 
                    min-width: 500px;
                    max-width: 90%;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    border: 2px solid #0d6efd;
                    animation: slideIn 0.3s ease-out;">
            <div class="card-body text-center p-4">
                <!-- Spinner grande animado -->
                <div class="mb-3">
                    <div class="spinner-border text-primary" 
                         role="status" 
                         style="width: 4rem; height: 4rem; border-width: 0.35rem;">
                        <span class="visually-hidden">Optimizando...</span>
                    </div>
                </div>
                
                <!-- Título -->
                <h5 class="text-primary mb-3">
                    <i class="bi bi-gear-fill me-2"></i>
                    Optimización en Progreso
                </h5>
                
                <!-- ⭐ NUEVO: Métricas en tiempo real -->
                <div class="card bg-light mb-3" id="realTimeMetrics" style="display: none;">
                    <div class="card-body p-3">
                        <div class="row text-center">
                            <div class="col-4">
                                <div class="text-muted small">Iteración</div>
                                <div class="fs-4 fw-bold text-primary" id="currentIteration">-</div>
                            </div>
                            <div class="col-4">
                                <div class="text-muted small">MSE Actual</div>
                                <div class="fs-4 fw-bold text-success" id="currentMSE">-</div>
                            </div>
                            <div class="col-4">
                                <div class="text-muted small">Restarts</div>
                                <div class="fs-4 fw-bold text-warning" id="currentRestarts">0</div>
                            </div>
                        </div>
                        
                        <!-- ⭐ Barra de progreso adaptativa -->
                        <div class="mt-3">
                            <div class="d-flex justify-content-between small text-muted mb-1">
                                <span>Progreso estimado</span>
                                <span id="progressPercentage">0%</span>
                            </div>
                            <div class="progress" style="height: 20px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                                     role="progressbar" 
                                     id="adaptiveProgressBar"
                                     style="width: 0%">
                                </div>
                            </div>
                        </div>
                        
                        <!-- ⭐ Indicador de estado -->
                        <div class="mt-2">
                            <small class="text-muted" id="optimizationStatus">
                                <i class="bi bi-hourglass-split me-1"></i>
                                Iniciando optimización...
                            </small>
                        </div>
                    </div>
                </div>
                
                <!-- Mensaje dinámico -->
                <p class="text-muted mb-3" id="optimizationMessage" 
                   style="min-height: 24px; transition: opacity 0.3s;">
                    ${messages[0]}
                </p>
                
                <!-- Barra de progreso -->
                <div class="progress mb-3" style="height: 8px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                         role="progressbar" 
                         style="width: 100%">
                    </div>
                </div>
                
                <!-- Información del algoritmo -->
                <div class="small text-muted mb-2">
                    <strong>Algoritmo:</strong> ${algorithmName}
                </div>
                
                <!-- Tiempo estimado -->
                <div class="small text-muted">
                    <i class="bi bi-clock me-1"></i>
                    Tiempo estimado: <span id="estimatedTime">10-120 segundos</span>
                </div>
            </div>
        </div>
        
        <!-- Overlay oscuro de fondo -->
        <div id="optimizationOverlay" 
             style="position: fixed; 
                    top: 0; 
                    left: 0; 
                    width: 100%; 
                    height: 100%; 
                    background: rgba(0,0,0,0.5); 
                    z-index: 9998;">
        </div>
        
        <!-- Estilo de animación -->
        <style>
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translate(-50%, -60%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }
            
            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.05);
                }
            }
            
            #optimizationProgress .spinner-border {
                animation: pulse 2s ease-in-out infinite;
            }
        </style>
    `;
    
    // Remover card anterior si existe
    const oldProgress = document.getElementById('optimizationProgress');
    if (oldProgress) {
        oldProgress.remove();
    }
    
    const oldOverlay = document.getElementById('optimizationOverlay');
    if (oldOverlay) {
        oldOverlay.remove();
    }
    
    // Agregar card al body
    document.body.insertAdjacentHTML('beforeend', progressHTML);
    
    // ⭐⭐⭐ NUEVO: Iniciar polling de estado si es Simplex
    if (algorithm === 'simplex') {
        console.log('🔄 Iniciando polling de métricas en tiempo real para Simplex');
        startRealtimeMetricsPolling();
    }
    
    // ⭐ ANIMACIÓN: Cambiar mensajes cada 5 segundos
    const messageInterval = setInterval(() => {
        const messageElement = document.getElementById('optimizationMessage');
        if (messageElement) {
            currentMessageIndex = (currentMessageIndex + 1) % messages.length;
            
            // Fade out
            messageElement.style.opacity = '0';
            
            setTimeout(() => {
                messageElement.textContent = messages[currentMessageIndex];
                // Fade in
                messageElement.style.opacity = '1';
            }, 300);
        } else {
            clearInterval(messageInterval);
        }
    }, 5000);
    
    // Guardar referencia al intervalo
    window.optimizationMessageInterval = messageInterval;
    
    console.log('✅ Pantalla de progreso mostrada');
}

/**
 * ⭐⭐⭐ NUEVA FUNCIÓN: Polling de métricas en tiempo real
 * Solicita al backend el estado actual de la optimización cada 2 segundos
 */
function startRealtimeMetricsPolling() {
    // Mostrar panel de métricas
    const metricsPanel = document.getElementById('realTimeMetrics');
    if (metricsPanel) {
        metricsPanel.style.display = 'block';
    }
    
    let pollCount = 0;
    const maxIterations = 500; // Máximo esperado para Simplex
    
    // Hacer polling cada 2 segundos
    const pollingInterval = setInterval(async () => {
        try {
            // ⭐ Este endpoint deberá ser implementado en el backend
            const response = await fetch('/api/optimization-status', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                // Si el endpoint no existe o falla, simplemente continuar
                console.warn('Endpoint /api/optimization-status no disponible');
                return;
            }
            
            const status = await response.json();
            
            // Actualizar métricas si están disponibles
            if (status.current_iteration !== undefined) {
                const iterElement = document.getElementById('currentIteration');
                if (iterElement) {
                    iterElement.textContent = status.current_iteration;
                    
                    // Actualizar barra de progreso adaptativa
                    const progress = Math.min((status.current_iteration / maxIterations) * 100, 95);
                    const progressBar = document.getElementById('adaptiveProgressBar');
                    const progressText = document.getElementById('progressPercentage');
                    
                    if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                    }
                    if (progressText) {
                        progressText.textContent = `${progress.toFixed(0)}%`;
                    }
                }
            }
            
            if (status.current_mse !== undefined) {
                const mseElement = document.getElementById('currentMSE');
                if (mseElement) {
                    mseElement.textContent = status.current_mse.toFixed(2);
                    
                    // Cambiar color según calidad
                    if (status.current_mse < 5) {
                        mseElement.className = 'fs-4 fw-bold text-success';
                    } else if (status.current_mse < 20) {
                        mseElement.className = 'fs-4 fw-bold text-info';
                    } else {
                        mseElement.className = 'fs-4 fw-bold text-warning';
                    }
                }
            }
            
            if (status.total_restarts !== undefined) {
                const restartsElement = document.getElementById('currentRestarts');
                if (restartsElement) {
                    restartsElement.textContent = status.total_restarts;
                }
            }
            
            // Actualizar estado textual
            const statusElement = document.getElementById('optimizationStatus');
            if (statusElement && status.status_message) {
                statusElement.innerHTML = `<i class="bi bi-arrow-repeat me-1"></i>${status.status_message}`;
            }
            
            // Si la optimización terminó, detener polling
            if (status.completed) {
                clearInterval(pollingInterval);
                window.optimizationPollingInterval = null;
            }
            
        } catch (error) {
            console.warn('Error en polling de métricas:', error);
            // No detener el polling por errores temporales
        }
        
        pollCount++;
        
        // Seguridad: detener después de 5 minutos (150 polls de 2s)
        if (pollCount > 150) {
            console.warn('⏱️ Timeout de polling alcanzado');
            clearInterval(pollingInterval);
            window.optimizationPollingInterval = null;
        }
        
    }, 2000); // Cada 2 segundos
    
    // Guardar referencia para poder detenerlo
    window.optimizationPollingInterval = pollingInterval;
}

/**
 * ⭐ ACTUALIZACIÓN: hideOptimizationProgress() ahora detiene el polling
 */
function hideOptimizationProgress() {
    // Limpiar intervalo de mensajes
    if (window.optimizationMessageInterval) {
        clearInterval(window.optimizationMessageInterval);
        window.optimizationMessageInterval = null;
    }
    
    // ⭐ NUEVO: Limpiar intervalo de polling
    if (window.optimizationPollingInterval) {
        clearInterval(window.optimizationPollingInterval);
        window.optimizationPollingInterval = null;
    }
    
    // Remover overlay
    const overlay = document.getElementById('optimizationOverlay');
    if (overlay) {
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }
    
    // Remover card con animación fade-out
    const progress = document.getElementById('optimizationProgress');
    if (progress) {
        progress.style.transition = 'opacity 0.3s, transform 0.3s';
        progress.style.opacity = '0';
        progress.style.transform = 'translate(-50%, -40%)';
        
        setTimeout(() => {
            progress.remove();
        }, 300);
    }
    
    console.log('✅ Pantalla de progreso ocultada');
}

function showOptimizationResults(result) {
    console.log('📊 Resultado completo:', result);
    
    // ⭐⭐⭐ NUEVO v5.0: Detectar si es respuesta multiguess ⭐⭐⭐
    if (result.strategy === 'multiguess' && result.all_results) {
        showMultiguessResults(result);
        return;  // Sale de la función, multiguess tiene su propia UI
    }
    
    // ⭐ LOGGING PARA DIAGNÓSTICO
    console.log('📊 MÉTRICAS RECIBIDAS:');
    console.log('  Initial:', result.initial_metrics);
    console.log('  Final:', result.final_metrics);
    console.log('  chi_squared existe en initial?', 'chi_squared' in result.initial_metrics);
    console.log('  chi_squared existe en final?', 'chi_squared' in result.final_metrics);
    
    hideOptimizationProgress();
    
    const banner = document.getElementById('model-saved-banner');
    
    if (!banner) {
        console.error('No se encontró el banner para mostrar resultados');
        return;
    }
    
    // Extraer datos
    const initialMetrics = result.initial_metrics;
    const finalMetrics = result.final_metrics;
    const optimizedParams = result.optimized_params;
    const bestParams = result.best_params || optimizedParams;
    const confidenceIntervals = result.confidence_intervals;
    
    // ⭐ NUEVO: Extraer datos de validación
    const validation = result.validation_result;
    const hasViolations = validation && !validation.valid;
    const hasWarnings = validation && validation.warnings && validation.warnings.length > 0;
    
    // ⭐ NUEVO: Determinar si usar best_params o optimized_params
    const shouldUseBest = hasViolations || 
                         (result.best_metrics && result.best_metrics.mse < finalMetrics.mse);
    
    const paramsToDisplay = shouldUseBest ? bestParams : optimizedParams;
    const metricsToDisplay = shouldUseBest ? 
                            (result.best_metrics || finalMetrics) : 
                            finalMetrics;
    
    // Mejora
    const improvement = (result.improvement_percentage !== undefined && result.improvement_percentage !== null) 
        ? parseFloat(result.improvement_percentage) 
        : 0;
    
    // Determinar calidad del ajuste según MSE
    const mse = metricsToDisplay.mse;
    let fitQuality, fitColor, fitIcon;
    
    if (mse < 5) {
        fitQuality = 'EXCELENTE';
        fitColor = 'success';
        fitIcon = '✅';
    } else if (mse < 20) {
        fitQuality = 'BUENO';
        fitColor = 'info';
        fitIcon = 'ℹ️';
    } else if (mse < 50) {
        fitQuality = 'ACEPTABLE';
        fitColor = 'warning';
        fitIcon = '⚠️';
    } else {
        fitQuality = 'NO ACEPTABLE';
        fitColor = 'danger';
        fitIcon = '❌';
    }
    
    // ⭐⭐⭐ NUEVO: HTML DE ALERTAS DE VALIDACIÓN ⭐⭐⭐
    let validationAlertsHTML = '';
    
    if (hasViolations) {
        let violationsListHTML = '';
        for (const [paramName, violation] of Object.entries(validation.violations)) {
            violationsListHTML += `
                <li class="mb-2">
                    <strong>${formatParamName(paramName)}</strong>
                    <div class="small">
                        Cambió de ${violation.initial_value?.toFixed(2) || 'N/A'} 
                        → ${violation.current_value?.toFixed(2) || 'N/A'}
                        <span class="text-danger fw-bold ms-2">
                            (${(violation.change_percentage * 100)?.toFixed(1) || 0}% de cambio)
                        </span>
                    </div>
                    <div class="small text-muted">
                        Máximo permitido: ${((violation.max_allowed || 1) * 100).toFixed(0)}%
                    </div>
                </li>
            `;
        }
        
        validationAlertsHTML = `
            <div class="alert alert-danger mb-3">
                <h6 class="alert-heading">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    ⚠️ Parámetros Fuera de Rangos Físicos
                </h6>
                <hr>
                <p class="mb-2">
                    Los parámetros optimizados exceden los límites físicos razonables:
                </p>
                <ul class="mb-3">
                    ${violationsListHTML}
                </ul>
                <div class="alert alert-info mb-0">
                    <strong>💡 Solución Aplicada:</strong>
                    Usando los parámetros de la <strong>Mejor Solución Encontrada</strong> 
                    (iteración ${result.best_metrics?.iteration || result.history?.best_iteration?.iteration || 'N/A'}) 
                    en lugar de los parámetros finales.
                </div>
            </div>
        `;
    }
    
    if (hasWarnings && !hasViolations) {
        validationAlertsHTML = `
            <div class="alert alert-warning mb-3">
                <h6 class="alert-heading">
                    <i class="bi bi-exclamation-circle-fill me-2"></i>
                    Advertencias
                </h6>
                <ul class="mb-0">
                    ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    if (!hasViolations && !hasWarnings && validation) {
        validationAlertsHTML = `
            <div class="alert alert-success mb-3">
                <i class="bi bi-check-circle-fill me-2"></i>
                <strong>✅ Validación Exitosa</strong>
                - Todos los parámetros están dentro de rangos físicos razonables.
            </div>
        `;
    }
    
    // ⭐⭐⭐ NUEVO: Mostrar historia de optimización CON RESTARTS ⭐⭐⭐
    let historyHTML = '';
    if (result.history && result.history.mse_history && result.history.mse_history.length > 0) {
        const history = result.history;
        
        // Calcular tasa de aceptación
        const totalSteps = (history.accepted_steps || 0) + (history.rejected_steps || 0);
        const acceptanceRate = totalSteps > 0 
            ? ((history.accepted_steps || 0) / totalSteps * 100).toFixed(1) 
            : 0;
        
        historyHTML = `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>📈 Historia de Convergencia</strong>
                </div>
                <div class="card-body">
                    <div class="row text-center">
                        <div class="col-md-3">
                            <div class="text-muted small">Pasos Aceptados</div>
                            <div class="fs-4 text-success fw-bold">${history.accepted_steps || 0}</div>
                            <div class="text-muted small">${acceptanceRate}% tasa aceptación</div>
                        </div>
                        <div class="col-md-3">
                            <div class="text-muted small">Pasos Rechazados</div>
                            <div class="fs-4 text-danger fw-bold">${history.rejected_steps || 0}</div>
                        </div>
                        <div class="col-md-3">
                            <div class="text-muted small">Mejor Iteración</div>
                            <div class="fs-4 text-primary fw-bold">
                                ${history.best_iteration?.iteration || 'N/A'}
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="text-muted small">Mejor MSE</div>
                            <div class="fs-4 text-success fw-bold">
                                ${history.best_iteration?.mse?.toFixed(2) || 'N/A'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- ⭐⭐⭐ NUEVO: Mostrar restarts si existen ⭐⭐⭐ -->
                    ${(result.total_restarts !== undefined && result.total_restarts > 0) ? `
                        <hr class="my-3">
                        <div class="alert alert-info mb-0">
                            <div class="row align-items-center">
                                <div class="col-md-4 text-center">
                                    <strong class="fs-5">🔄 ${result.total_restarts}</strong>
                                    <div class="small text-muted">Restart${result.total_restarts > 1 ? 's' : ''} ejecutado${result.total_restarts > 1 ? 's' : ''}</div>
                                </div>
                                <div class="col-md-8">
                                    <div class="small">
                                        <strong>Iteraciones de restart:</strong>
                                        <div class="mt-1">
                                            ${result.restart_iterations ? 
                                                result.restart_iterations.map((iter, idx) => 
                                                    `<span class="badge bg-primary me-1">Restart ${idx + 1}: iter ${iter}</span>`
                                                ).join('') 
                                                : 'N/A'
                                            }
                                        </div>
                                    </div>
                                    <div class="small text-muted mt-2">
                                        <i class="bi bi-info-circle me-1"></i>
                                        Los restarts ayudan a escapar de mínimos locales cuando la optimización se estanca.
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- ⭐⭐⭐ NUEVO: Botón para ver gráfica de convergencia ⭐⭐⭐ -->
                    <button class="btn btn-sm btn-outline-info w-100 mt-3" 
                            onclick="plotConvergenceHistory()">
                        📊 Ver gráfica de convergencia completa
                    </button>
                </div>
            </div>
        `;
    }
    
    // Información de ponderación
    let weightingInfoHTML = '';
    if (result.weighting) {
        weightingInfoHTML = `
            <div class="alert alert-info small mb-3">
                <strong>📊 Ponderación estadística aplicada:</strong>
                <ul class="mb-0 mt-1">
                    <li>σ<sub>ψ</sub> = ${result.weighting.sigma_psi}°</li>
                    <li>σ<sub>Δ</sub> = ${result.weighting.sigma_delta}°</li>
                    <li>Método: Transformación N,C,S de CompleteEASE</li>
                </ul>
            </div>
        `;
    }
    
    // Crear tabla de parámetros
    let paramsTableHTML = `
        <table class="table table-sm table-bordered mb-0">
            <thead class="table-light">
                <tr>
                    <th>Parámetro</th>
                    <th>Valor Inicial</th>
                    <th>${shouldUseBest ? 'Mejor Valor' : 'Valor Optimizado'} ± σ</th>
                    <th>Cambio</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (const paramName in paramsToDisplay) {
        const displayValue = paramsToDisplay[paramName];
        const confidence = confidenceIntervals ? confidenceIntervals[paramName] : null;
        
        let initialValue = null;
        try {
            initialValue = getInitialParamValue(paramName);
        } catch (e) {
            console.warn(`No se pudo obtener valor inicial para ${paramName}:`, e);
        }
        
        if (initialValue === null && result.params_to_optimize) {
            const param = result.params_to_optimize.find(p => p.name === paramName);
            if (param) {
                initialValue = param.initial_value;
            }
        }
        
        const initialValueDisplay = (initialValue !== null && initialValue !== undefined && !isNaN(initialValue))
            ? initialValue.toFixed(4) 
            : '<span class="text-muted">N/A</span>';
        
        let changeDisplay;
        if (initialValue !== null && initialValue !== undefined && !isNaN(initialValue) && initialValue !== 0) {
            const changePercent = ((displayValue - initialValue) / initialValue * 100).toFixed(1);
            const changeColor = Math.abs(parseFloat(changePercent)) > 10 ? 'text-danger' : 'text-muted';
            changeDisplay = `<span class="${changeColor}">${changePercent}%</span>`;
        } else {
            changeDisplay = '<span class="text-muted">N/A</span>';
        }
        
        const confidenceDisplay = (confidence && confidence[1] !== undefined)
            ? `± ${confidence[1].toFixed(4)}`
            : '';
        
        paramsTableHTML += `
            <tr>
                <td><strong>${formatParamName(paramName)}</strong></td>
                <td>${initialValueDisplay}</td>
                <td><strong>${displayValue.toFixed(4)}</strong> ${confidenceDisplay}</td>
                <td>${changeDisplay}</td>
            </tr>
        `;
    }
    
    paramsTableHTML += `</tbody></table>`;
    
    // ✅ HTML FINAL DEL BANNER - CON CHI CUADRADO Y RESTARTS
    banner.innerHTML = `
        <div class="alert alert-${fitColor}" style="margin: 0;">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h5 class="mb-1">${fitIcon} Optimización completada exitosamente</h5>
                    <p class="mb-0 small">
                        <strong>Algoritmo:</strong> ${result.algorithm || 'N/A'} | 
                        <strong>Tiempo:</strong> ${result.optimization_time?.toFixed(2) || 'N/A'} segundos | 
                        <strong>Iteraciones:</strong> ${result.iterations || 'N/A'}
                        ${shouldUseBest ? ' | <strong class="text-primary">Usando Mejor Solución</strong>' : ''}
                        ${(result.total_restarts && result.total_restarts > 0) ? ` | <strong class="text-info">🔄 ${result.total_restarts} Restart${result.total_restarts > 1 ? 's' : ''}</strong>` : ''}
                    </p>
                </div>
                <span class="badge bg-${fitColor}" style="font-size: 1em; padding: 8px 12px;">
                    ${fitQuality}
                </span>
            </div>
            
            <!-- ⭐ ALERTAS DE VALIDACIÓN -->
            ${validationAlertsHTML}
            
            <!-- ⭐ HISTORIA DE CONVERGENCIA (CON RESTARTS) -->
            ${historyHTML}
            
            <!-- INFORMACIÓN DE PONDERACIÓN -->
            ${weightingInfoHTML}
            
            <!-- ✅ COMPARACIÓN ANTES/DESPUÉS - CON CHI CUADRADO -->
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>📊 Comparación de métricas</strong>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6 class="text-danger">❌ ANTES de optimización</h6>
                            <ul class="list-unstyled small mb-0">
                                <li><strong>χ²:</strong> ${initialMetrics.chi_squared ? initialMetrics.chi_squared.toFixed(4) : 'N/A'}</li>
                                <li><strong>χ²ᵣ:</strong> ${initialMetrics.chi_squared_reduced.toFixed(6)}</li>
                                <li><strong>MSE:</strong> ${initialMetrics.mse.toFixed(2)} [${initialMetrics.quality}]</li>
                                <li class="text-muted"><strong>RMSE Ψ:</strong> ${initialMetrics.psi_metrics.rmse.toFixed(3)}°</li>
                                <li class="text-muted"><strong>RMSE Δ:</strong> ${initialMetrics.delta_metrics.rmse.toFixed(3)}°</li>
                            </ul>
                        </div>
                        
                        <div class="col-md-6">
                            <h6 class="text-success">✅ ${shouldUseBest ? 'MEJOR SOLUCIÓN' : 'DESPUÉS'}</h6>
                            <ul class="list-unstyled small mb-0">
                                <li><strong>χ²:</strong> <span class="text-${fitColor} fw-bold">${finalMetrics.chi_squared ? finalMetrics.chi_squared.toFixed(4) : 'N/A'}</span></li>
                                <li><strong>χ²ᵣ:</strong> ${metricsToDisplay.chi_squared_reduced?.toFixed(6) || finalMetrics.chi_squared_reduced.toFixed(6)}</li>
                                <li><strong>MSE:</strong> <span class="text-${fitColor} fw-bold">${metricsToDisplay.mse.toFixed(2)} [${finalMetrics.quality}]</span></li>
                                <li class="text-muted"><strong>RMSE Ψ:</strong> ${finalMetrics.psi_metrics.rmse.toFixed(3)}°</li>
                                <li class="text-muted"><strong>RMSE Δ:</strong> ${finalMetrics.delta_metrics.rmse.toFixed(3)}°</li>
                            </ul>
                        </div>
                    </div>
                    
                    <hr class="my-2">
                    
                    <div class="alert alert-success mb-0" style="padding: 8px;">
                        <strong>📈 Mejora en MSE:</strong> ${improvement.toFixed(2)}% 
                        (MSE: ${initialMetrics.mse.toFixed(2)} → ${metricsToDisplay.mse.toFixed(2)})
                        ${initialMetrics.chi_squared && finalMetrics.chi_squared ? 
                            `<br><strong>📈 Mejora en χ²:</strong> ${((initialMetrics.chi_squared - finalMetrics.chi_squared) / initialMetrics.chi_squared * 100).toFixed(2)}% 
                            (χ²: ${initialMetrics.chi_squared.toFixed(2)} → ${finalMetrics.chi_squared.toFixed(2)})` : ''
                        }
                    </div>
                </div>
            </div>
            
            <!-- PARÁMETROS OPTIMIZADOS -->
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>🔧 Parámetros ${shouldUseBest ? '(Mejor Solución)' : 'optimizados'}</strong>
                </div>
                <div class="card-body" style="padding: 1rem;">
                    ${paramsTableHTML}
                </div>
            </div>
            
            <!-- MENSAJE SEGÚN CALIDAD -->
            ${getQualityMessageMSE(mse)}
            
            <!-- BOTONES DE ACCIÓN -->
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-outline-secondary" onclick="downloadOptimizedResults()">
                    💾 Descargar resultados
                </button>
                <button class="btn btn-outline-warning" onclick="showOptimizationStrategyModal()">
                    🔄 Re-optimizar
                </button>
            </div>
        </div>
    `;
    
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // ⭐ Actualizar pestañas de visualización con datos optimizados
    setTimeout(() => {
        if (typeof enableAdvancedGraphSelector === 'function'){
            enableAdvancedGraphSelector();
        }
        if (typeof renderGraphsForType === 'function'){
            renderGraphsForType(currentGraphType);
        }
    }, 800);
    
    // ⭐⭐⭐ ACTUALIZAR GRÁFICAS AUTOMÁTICAMENTE
    setTimeout(() => {
        updateGraphsWithOptimized();
        
        const graficasTitle = document.getElementById('graficas-title');
        if (graficasTitle) {
            graficasTitle.textContent = 'Gráficas ajustadas';
        } else {
            const allH5 = document.querySelectorAll('h5');
            allH5.forEach(h5 => {
                if (h5.textContent.includes('Gráficas experimentales')) {
                    h5.textContent = 'Gráficas ajustadas';
                }
            });
        }
        
        document.getElementById('psiPlot').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }, 800);

    calculateAndDisplayStatistics(result);
}


function showMultiguessResults(result) {
    console.log('🎯 Mostrando resultados Multiguess:', result);
    
    hideOptimizationProgress();
    
    const banner = document.getElementById('model-saved-banner');
    if (!banner) {
        console.error('❌ No se encontró #model-saved-banner');
        return;
    }
    
    const allResults = result.all_results;
    const summary = result.summary;
    const bestIdx = result.best_guess_index;
    const convergence = summary.convergence_analysis;
    
    // ==========================================
    // HELPER: Nombre legible de parámetro
    // ==========================================
    function formatParamName(name) {
        return name
            .replace('layer_', 'L')
            .replaceAll('_', ' ');  // ← Fix: replaceAll en vez de replace
    }

    function formatParamValue(val) {
        if (val === undefined || val === null) return '—';
        return typeof val === 'number' ? val.toFixed(4) : val;
    }
    
    // ==========================================
    // GENERAR TABLA DE RESULTADOS
    // ==========================================
    
    // Obtener nombres de parámetros del primer resultado
    const paramNames = allResults[0]?.optimized_params 
        ? Object.keys(allResults[0].optimized_params) 
        : [];
    
    // Cabecera: para cada parámetro mostrar columna Inicial y Final
    let tableHeader = `
        <tr>
            <th>#</th>
            <th>Estado</th>
            <th>MSE</th>
            <th>Calidad</th>
            ${paramNames.map(p => `
                <th colspan="2" class="text-center">${formatParamName(p)}</th>
            `).join('')}
            <th>Iters</th>
            <th>Tiempo</th>
            <th>Acción</th>
        </tr>
        <tr class="table-secondary small">
            <th colspan="4"></th>
            ${paramNames.map(() => `
                <th class="text-muted fw-normal">Inicial</th>
                <th class="text-muted fw-normal">Optimizado</th>
            `).join('')}
            <th colspan="3"></th>
        </tr>`;
    
    // Filas de tabla
    let tableRows = '';
    allResults.forEach((guess, idx) => {
        const isBest = idx === bestIdx;
        const converged = guess.success;
        const mse = guess.metrics?.mse?.toFixed(2) || 'N/A';
        const quality = guess.metrics?.quality || 'N/A';
        const iterations = guess.iterations || 0;
        const time = (guess.optimization_time || 0).toFixed(2);
        
        const rowClass = isBest ? 'table-success' : (converged ? '' : 'table-danger');
        const statusIcon = converged ? '✅' : '❌';
        const bestBadge = isBest ? ' <span class="badge bg-success">MEJOR</span>' : '';
        
        // ⭐ Columnas: valor inicial del guess + valor optimizado final
        const paramColumns = paramNames.map(p => {
            const initialVal = guess.initial_params?.[p];
            const optimizedVal = guess.optimized_params?.[p];
            
            // Calcular variación para resaltar cambio
            let changeHTML = '';
            if (initialVal !== undefined && optimizedVal !== undefined) {
                const change = optimizedVal - initialVal;
                const pct = initialVal !== 0 ? (change / Math.abs(initialVal)) * 100 : 0;
                const changeColor = Math.abs(pct) > 10 ? 'text-warning' : 'text-muted';
                changeHTML = `<small class="${changeColor}">(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)</small>`;
            }
            
            return `
                <td class="text-muted small">${formatParamValue(initialVal)}</td>
                <td>
                    <strong>${formatParamValue(optimizedVal)}</strong><br>
                    ${changeHTML}
                </td>`;
        }).join('');
        
        tableRows += `
            <tr class="${rowClass}">
                <td><strong>Guess ${idx + 1}</strong>${bestBadge}</td>
                <td>${statusIcon}</td>
                <td><strong>${mse}</strong></td>
                <td>${quality}</td>
                ${paramColumns}
                <td>${iterations}</td>
                <td>${time}s</td>
                <td>
                    ${converged ? 
                        `<button class="btn btn-sm btn-outline-primary" 
                                 onclick="selectMultiguessResult(${idx})">
                            📊 Usar este
                        </button>` : 
                        '<span class="text-muted">No convergió</span>'}
                </td>
            </tr>`;
    });
    
    // ==========================================
    // ANÁLISIS DE CONVERGENCIA
    // ==========================================
    
    let convergenceHTML = '';
    if (convergence) {
        const confidenceColor = convergence.all_converge_to_similar ? 'success' : 
                               (convergence.mse_std < 5 ? 'warning' : 'danger');
        convergenceHTML = `
            <div class="alert alert-${confidenceColor} mt-3">
                <strong>📊 Análisis de convergencia:</strong><br>
                ${convergence.interpretation}
                <div class="mt-1 small">
                    MSE promedio: ${convergence.mse_mean?.toFixed(2) || 'N/A'} 
                    ± ${convergence.mse_std?.toFixed(2) || 'N/A'}
                </div>
            </div>`;
    }
    
    // ==========================================
    // DISPERSIÓN DE PARÁMETROS
    // ==========================================
    
    let rangesHTML = '';
    if (summary.parameter_ranges && Object.keys(summary.parameter_ranges).length > 0) {
        let rangeRows = '';
        for (const [pname, range] of Object.entries(summary.parameter_ranges)) {
            // Colorear CV según nivel de dispersión
            const cvColor = range.cv < 5 ? 'text-success' : 
                           (range.cv < 20 ? 'text-warning' : 'text-danger');
            rangeRows += `
                <tr>
                    <td>${formatParamName(pname)}</td>
                    <td>${range.min?.toFixed(4)}</td>
                    <td>${range.max?.toFixed(4)}</td>
                    <td><strong>${range.mean?.toFixed(4)}</strong></td>
                    <td>${range.std?.toFixed(4)}</td>
                    <td class="${cvColor} fw-bold">${range.cv?.toFixed(1)}%</td>
                </tr>`;
        }
        
        rangesHTML = `
            <div class="card mt-3">
                <div class="card-header bg-light">
                    <strong>📏 Dispersión de parámetros entre guesses convergidos</strong>
                    <small class="text-muted ms-2">(CV &lt; 5% = alta confianza | CV &gt; 20% = baja confianza)</small>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm table-bordered mb-0">
                        <thead>
                            <tr>
                                <th>Parámetro</th>
                                <th>Mín</th>
                                <th>Máx</th>
                                <th>Media</th>
                                <th>Desv. Est.</th>
                                <th>CV</th>
                            </tr>
                        </thead>
                        <tbody>${rangeRows}</tbody>
                    </table>
                </div>
            </div>`;
    }
    
    // ==========================================
    // HTML COMPLETO
    // ==========================================
    
    banner.innerHTML = `
        <div class="card shadow-sm">
            <div class="card-header bg-primary text-white">
                <h5 class="mb-0">
                    🎯 Resultados Multiguess — ${result.algorithm === 'levenberg_marquardt' ? 'Levenberg-Marquardt' : 'Simplex'}
                </h5>
            </div>
            <div class="card-body">
                <!-- Resumen rápido -->
                <div class="row text-center mb-3">
                    <div class="col">
                        <div class="h4 text-primary">${result.n_guesses}</div>
                        <small class="text-muted">Guesses ejecutados</small>
                    </div>
                    <div class="col">
                        <div class="h4 text-success">${summary.converged_count}</div>
                        <small class="text-muted">Convergidos</small>
                    </div>
                    <div class="col">
                        <div class="h4 text-danger">${summary.failed_count}</div>
                        <small class="text-muted">Fallidos</small>
                    </div>
                    <div class="col">
                        <div class="h4 text-info">${summary.best_mse?.toFixed(2) || 'N/A'}</div>
                        <small class="text-muted">Mejor MSE</small>
                    </div>
                    <div class="col">
                        <div class="h4">${result.total_time?.toFixed(1)}s</div>
                        <small class="text-muted">Tiempo total</small>
                    </div>
                </div>
                
                ${convergenceHTML}
                
                <!-- Tabla de resultados -->
                <div class="table-responsive">
                    <table class="table table-sm table-bordered table-hover">
                        <thead class="table-dark">${tableHeader}</thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                
                ${rangesHTML}
                
                <!-- Botones -->
                <div class="d-flex gap-2 mt-3">
                    <button class="btn btn-success" onclick="selectMultiguessResult(${bestIdx})">
                        ✅ Usar mejor resultado (Guess #${bestIdx + 1})
                    </button>
                    <button class="btn btn-outline-secondary" onclick="downloadMultiguessResults()">
                        📥 Descargar todos los resultados
                    </button>
                    <button class="btn btn-outline-warning" onclick="showOptimizationStrategyModal()">
                        🔄 Optimizar nuevamente
                    </button>
                </div>
            </div>
        </div>
    `;
    
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    window.multiguessResults = result;
}

/**
 * ⭐⭐⭐ NUEVA v5.0: Selecciona un resultado específico de multiguess ⭐⭐⭐
 * Actualiza gráficas y variables globales con el guess seleccionado
 */
function selectMultiguessResult(guessIndex) {
    const result = window.multiguessResults;
    if (!result || !result.all_results) {
        alert('No hay resultados multiguess disponibles');
        return;
    }
    
    const guess = result.all_results[guessIndex];
    if (!guess || !guess.success) {
        alert('Este guess no convergió. Selecciona otro.');
        return;
    }
    
    console.log(`📊 Seleccionando Guess #${guessIndex + 1}:`, guess);
    
    // Actualizar variables globales
    optimizationResults = {
        success: true,
        algorithm: result.algorithm,
        optimized_params: guess.optimized_params,
        final_metrics: guess.metrics,
        initial_metrics: result.initial_metrics,
        improvement_percentage: guess.improvement_percentage,
        confidence_intervals: guess.confidence_intervals,
        psi_theoretical: guess.psi_theoretical,
        delta_theoretical: guess.delta_theoretical,
    };
    
    theoreticalPsi = guess.psi_theoretical;
    theoreticalDelta = guess.delta_theoretical;
    
    // Actualizar gráficas
    updateGraphsWithOptimized();
    
    // Resaltar fila seleccionada en la tabla
    document.querySelectorAll('#model-saved-banner tbody tr').forEach((row, idx) => {
        row.classList.remove('table-primary');
        if (idx === guessIndex) {
            row.classList.add('table-primary');
        }
    });
    
    // Scroll a gráficas
    setTimeout(() => {
        const psiPlot = document.getElementById('psiPlot');
        if (psiPlot) {
            psiPlot.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }, 300);
    
    console.log(`✅ Guess #${guessIndex + 1} aplicado a las gráficas`);
}

/**
 * ⭐⭐⭐ NUEVA v5.0: Descarga resultados multiguess como JSON ⭐⭐⭐
 */
function downloadMultiguessResults() {
    const result = window.multiguessResults;
    if (!result) {
        alert('No hay resultados para descargar');
        return;
    }
    
    const dataStr = JSON.stringify(result, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multiguess_results_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('✅ Resultados multiguess descargados como JSON');
}



/**
 * Actualiza gráficas con datos optimizados
 * VERSIÓN v5.0: Compatible con multiguess (usa variables globales)
 */
function updateGraphsWithOptimized() {
    console.log('📈 Actualizando gráficas con datos optimizados...');
    
    // ⭐ v5.0: Usar variables globales (compatibles con multiguess)
    const psi_optimized = optimizationResults?.psi_theoretical || theoreticalPsi;
    const delta_optimized = optimizationResults?.delta_theoretical || theoreticalDelta;
    const wavelengths = uploadedWavelengths;
    
    if (!psi_optimized || !delta_optimized || !wavelengths) {
        console.error('❌ Faltan datos para actualizar gráficas');
        console.log('  psi_optimized:', psi_optimized ? 'OK' : 'FALTA');
        console.log('  delta_optimized:', delta_optimized ? 'OK' : 'FALTA');
        console.log('  wavelengths:', wavelengths ? 'OK' : 'FALTA');
        return;
    }
    
    console.log('✅ Datos disponibles para gráficas:');
    console.log('  - Longitudes de onda:', wavelengths.length);
    console.log('  - Psi optimizado:', psi_optimized.length);
    console.log('  - Delta optimizado:', delta_optimized.length);
    
    // ==========================================
    // ACTUALIZAR GRÁFICA DE PSI
    // ==========================================
    const psiPlot = document.getElementById('psiPlot');
    if (psiPlot) {
        // Verificar si ya hay una gráfica existente
        const existingData = psiPlot.data || [];
        
        // Trace de datos experimentales
        const tracePsiExp = {
            x: wavelengths,
            y: uploadedPsi,
            mode: 'markers',
            type: 'scatter',
            name: 'Ψ Experimental',
            marker: { color: '#2E86C1', size: 6 }
        };
        
        // Trace de datos teóricos (si existen)
        const traces = [tracePsiExp];
        
        if (theoreticalPsi && theoreticalPsi.length > 0) {
            traces.push({
                x: wavelengths,
                y: theoreticalPsi,
                mode: 'lines',
                type: 'scatter',
                name: 'Ψ Teórico',
                line: { color: '#28a745', width: 2 }
            });
        }
        
        // Trace de datos optimizados
        traces.push({
            x: wavelengths,
            y: psi_optimized,
            mode: 'lines',
            type: 'scatter',
            name: 'Ψ Optimizado',
            line: { color: '#9C27B0', width: 2, dash: 'dot' }
        });
        
        const layoutPsi = {
            title: 'Psi (Ψ) vs Longitud de onda',
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Ψ (grados)' },
            showlegend: true,
            hovermode: 'closest',
            plot_bgcolor: '#f8f9fa',
            paper_bgcolor: '#ffffff'
        };
        
        Plotly.newPlot(psiPlot, traces, layoutPsi);
        console.log('✅ Gráfica Psi actualizada');
    } else {
        console.warn('⚠️ No se encontró elemento #psiPlot');
    }
    
    // ==========================================
    // ACTUALIZAR GRÁFICA DE DELTA
    // ==========================================
    const deltaPlot = document.getElementById('deltaPlot');
    if (deltaPlot) {
        // Trace de datos experimentales
        const traceDeltaExp = {
            x: wavelengths,
            y: uploadedDelta,
            mode: 'markers',
            type: 'scatter',
            name: 'Δ Experimental',
            marker: { color: '#E74C3C', size: 6 }
        };
        
        // Trace de datos teóricos (si existen)
        const traces = [traceDeltaExp];
        
        if (theoreticalDelta && theoreticalDelta.length > 0) {
            traces.push({
                x: wavelengths,
                y: theoreticalDelta,
                mode: 'lines',
                type: 'scatter',
                name: 'Δ Teórico',
                line: { color: '#fd7e14', width: 2 }
            });
        }
        
        // Trace de datos optimizados
        traces.push({
            x: wavelengths,
            y: delta_optimized,
            mode: 'lines',
            type: 'scatter',
            name: 'Δ Optimizado',
            line: { color: '#FF5722', width: 2, dash: 'dot' }
        });
        
        const layoutDelta = {
            title: 'Delta (Δ) vs Longitud de onda',
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: { title: 'Δ (grados)' },
            showlegend: true,
            hovermode: 'closest',
            plot_bgcolor: '#f8f9fa',
            paper_bgcolor: '#ffffff'
        };
        
        Plotly.newPlot(deltaPlot, traces, layoutDelta);
        console.log('✅ Gráfica Delta actualizada');
    } else {
        console.warn('⚠️ No se encontró elemento #deltaPlot');
    }
    
    // ==========================================
    // ACTUALIZAR GRÁFICA COMBINADA
    // ==========================================
    const combinedPlot = document.getElementById('combinedPlot');
    if (combinedPlot) {
        const traces = [
            {
                x: wavelengths,
                y: uploadedPsi,
                mode: 'markers',
                name: 'Ψ Experimental',
                marker: { color: '#2E86C1', size: 5 },
                yaxis: 'y'
            }
        ];
        
        // Agregar Psi teórico si existe
        if (theoreticalPsi && theoreticalPsi.length > 0) {
            traces.push({
                x: wavelengths,
                y: theoreticalPsi,
                mode: 'lines',
                name: 'Ψ Teórico',
                line: { color: '#28a745', width: 2 },
                yaxis: 'y'
            });
        }
        
        // Agregar Psi optimizado
        traces.push({
            x: wavelengths,
            y: psi_optimized,
            mode: 'lines',
            name: 'Ψ Optimizado',
            line: { color: '#9C27B0', width: 2, dash: 'dot' },
            yaxis: 'y'
        });
        
        // Delta experimental
        traces.push({
            x: wavelengths,
            y: uploadedDelta,
            mode: 'markers',
            name: 'Δ Experimental',
            marker: { color: '#E74C3C', size: 5 },
            yaxis: 'y2'
        });
        
        // Agregar Delta teórico si existe
        if (theoreticalDelta && theoreticalDelta.length > 0) {
            traces.push({
                x: wavelengths,
                y: theoreticalDelta,
                mode: 'lines',
                name: 'Δ Teórico',
                line: { color: '#fd7e14', width: 2 },
                yaxis: 'y2'
            });
        }
        
        // Delta optimizado
        traces.push({
            x: wavelengths,
            y: delta_optimized,
            mode: 'lines',
            name: 'Δ Optimizado',
            line: { color: '#FF5722', width: 2, dash: 'dot' },
            yaxis: 'y2'
        });
        
        const layoutCombined = {
            title: 'Ψ y Δ vs Longitud de onda (Comparación)',
            xaxis: { title: 'Longitud de onda (nm)' },
            yaxis: {
                title: 'Ψ (grados)',
                titlefont: { color: '#2E86C1' },
                tickfont: { color: '#2E86C1' }
            },
            yaxis2: {
                title: 'Δ (grados)',
                titlefont: { color: '#E74C3C' },
                tickfont: { color: '#E74C3C' },
                overlaying: 'y',
                side: 'right'
            },
            showlegend: true,
            hovermode: 'closest',
            plot_bgcolor: '#f8f9fa',
            paper_bgcolor: '#ffffff'
        };
        
        Plotly.newPlot(combinedPlot, traces, layoutCombined);
        console.log('✅ Gráfica combinada actualizada');
    } else {
        console.warn('⚠️ No se encontró elemento #combinedPlot');
    }
    
    console.log('📊 Todas las gráficas actualizadas exitosamente');
}


// ⭐⭐⭐ NUEVA FUNCIÓN: Cambiar entre pestañas ⭐⭐⭐
function switchVisualizationTab(tabName, dataType = 'theoretical') {
    console.log('🔄 Cambiando a pestaña:', tabName, 'con datos:', dataType);
    
    // Ocultar todas las pestañas
    document.querySelectorAll('.visualization-tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Remover clase active de todos los botones
    document.querySelectorAll('#visualization-tabs-container .btn-group button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Determinar qué datos usar
    let wavelengths, psiData, deltaData;
    if (dataType === 'optimized' && lastOptimizationResult) {
        wavelengths = lastOptimizationResult.wavelengths || theoreticalWavelengths;
        psiData = lastOptimizationResult.optimized_psi || theoreticalPsi;
        deltaData = lastOptimizationResult.optimized_delta || theoreticalDelta;
    } else {
        wavelengths = theoreticalWavelengths;
        psiData = theoreticalPsi;
        deltaData = theoreticalDelta;
    }
    
    // Mostrar la pestaña seleccionada y renderizar
    if (tabName === 'psi-delta') {
        document.getElementById('tab-psi-delta').style.display = 'block';
        event.target.classList.add('active');
        plotPsiDeltaCombined(wavelengths, psiData, deltaData, dataType);
    } else if (tabName === 'n-k') {
        document.getElementById('tab-n-k').style.display = 'block';
        event.target.classList.add('active');
        plotNK(wavelengths, dataType);
    } else if (tabName === 't-r-a') {
        document.getElementById('tab-t-r-a').style.display = 'block';
        event.target.classList.add('active');
        plotTRA(wavelengths, dataType);
    }
}

// ⭐⭐⭐ FUNCIÓN AUXILIAR: Plot Ψ y Δ combinados ⭐⭐⭐
function plotPsiDeltaCombined(wavelengths, psiData, deltaData, dataType) {
    const tracePsi = {
        x: wavelengths,
        y: psiData,
        mode: 'lines',
        name: 'Ψ ' + (dataType === 'optimized' ? '(Optimizado)' : '(Teórico)'),
        line: { color: 'blue', width: 2 }
    };
    
    const traceDelta = {
        x: wavelengths,
        y: deltaData,
        mode: 'lines',
        name: 'Δ ' + (dataType === 'optimized' ? '(Optimizado)' : '(Teórico)'),
        line: { color: 'green', width: 2 },
        yaxis: 'y2'
    };
    
    const layout = {
        title: 'Ψ y Δ vs Longitud de Onda',
        xaxis: { title: 'Longitud de onda (nm)' },
        yaxis: { title: 'Ψ (°)', side: 'left' },
        yaxis2: { title: 'Δ (°)', side: 'right', overlaying: 'y' },
        showlegend: true,
        hovermode: 'x unified'
    };
    
    Plotly.newPlot('psi-delta-combined-plot', [tracePsi, traceDelta], layout, {responsive: true});
}

// ⭐⭐⭐ Funciones placeholder para n-k y T-R-A (implementar según necesites) ⭐⭐⭐
function plotNK(wavelengths, dataType) {
    // TODO: Implementar plot de n y k
    document.getElementById('n-k-plot').innerHTML = '<div class="alert alert-info">Gráfica de n, k en desarrollo...</div>';
}

function plotTRA(wavelengths, dataType) {
    // TODO: Implementar plot de T, R, A
    document.getElementById('t-r-a-plot').innerHTML = '<div class="alert alert-info">Gráfica de T-R-A en desarrollo...</div>';
}

function downloadVisualizationPlot(plotType, format) {
    // TODO: Implementar descarga de gráficas
    console.log(`Descargando ${plotType} en formato ${format}`);
}


// ==========================================
// CÁLCULO Y VISUALIZACIÓN DE ESTADÍSTICAS
// ==========================================

async function calculateAndDisplayStatistics(optimizationResult) {
    try {
        console.log('📊 Calculando estadísticas...');
        
        const statsRequest = {
            psi_exp: optimizationResult.psi_exp || experimentalData.psi,
            delta_exp: optimizationResult.delta_exp || experimentalData.delta,
            wavelengths: optimizationResult.wavelengths || experimentalData.wavelengths,
            psi_theo: optimizationResult.psi_optimized,
            delta_theo: optimizationResult.delta_optimized,
            n_params: optimizationResult.optimized_params?.length || 1,
            n_iterations: optimizationResult.iterations || 0
        };
        
        const response = await fetch('/api/calculate-statistics', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(statsRequest)
        });
        
        const stats = await response.json();
        
        if (stats.success) {
            console.log('✅ Estadísticas calculadas');
            console.log(stats.report);
            displayStatistics(stats);
        } else {
            console.error('Error calculando estadísticas:', stats.error);
        }
        
    } catch (error) {
        console.error('Error en cálculo de estadísticas:', error);
    }
}

function displayStatistics(stats) {
    const metrics = stats.metrics;
    const interpretation = stats.interpretation;
    
    let statsContainer = document.getElementById('statistics-container');
    if (!statsContainer) {
        statsContainer = document.createElement('div');
        statsContainer.id = 'statistics-container';
        statsContainer.className = 'card mt-3';
        
        const resultsContainer = document.getElementById('optimization-results');
        if (resultsContainer) {
            resultsContainer.parentNode.insertBefore(statsContainer, resultsContainer.nextSibling);
        }
    }
    
    const colorClass = {
        'success': 'success',
        'warning': 'warning',
        'danger': 'danger'
    }[interpretation.color] || 'info';
    
    statsContainer.innerHTML = `
        <div class="card-header bg-primary text-white">
            <h5 class="mb-0">
                <i class="fas fa-chart-line"></i> Estadísticas del Ajuste
            </h5>
        </div>
        <div class="card-body">
            <div class="alert alert-${colorClass} mb-3">
                <h6 class="alert-heading">
                    <i class="fas fa-check-circle"></i> Calidad del Ajuste: ${interpretation.label}
                </h6>
                <p class="mb-0">${interpretation.message}</p>
                <hr>
                <small>
                    <strong>χ² reducido:</strong> ${metrics.chi_squared_reduced.toFixed(4)}
                    <span class="text-muted">(Óptimo ≈ 1.0)</span>
                </small>
            </div>
            
            <div class="row">
                <div class="col-md-6 mb-3">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">
                                <i class="fas fa-calculator"></i> Chi-cuadrado
                            </h6>
                            <p class="card-text">
                                <strong>χ²:</strong> ${metrics.chi_squared.toFixed(2)}<br>
                                <strong>χ²/ν:</strong> ${metrics.chi_squared_reduced.toFixed(4)}<br>
                                <small class="text-muted">Grados de libertad: ${metrics.degrees_of_freedom}</small>
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6 mb-3">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">
                                <i class="fas fa-percentage"></i> Coeficiente de Determinación (R²)
                            </h6>
                            <p class="card-text">
                                <strong>Psi:</strong> ${(metrics.r_squared.psi * 100).toFixed(2)}%<br>
                                <strong>Delta:</strong> ${(metrics.r_squared.delta * 100).toFixed(2)}%<br>
                                <strong>Promedio:</strong> ${(metrics.r_squared.combined * 100).toFixed(2)}%
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6 mb-3">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">
                                <i class="fas fa-ruler"></i> Errores Cuadráticos
                            </h6>
                            <p class="card-text">
                                <strong>RMSE:</strong> ${metrics.rmse.toFixed(4)}°<br>
                                <strong>MAE (Psi):</strong> ${metrics.mae.psi.toFixed(4)}°<br>
                                <strong>MAE (Delta):</strong> ${metrics.mae.delta.toFixed(4)}°
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6 mb-3">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">
                                <i class="fas fa-exclamation-triangle"></i> Errores Máximos
                            </h6>
                            <p class="card-text">
                                <strong>Max (Psi):</strong> ${metrics.max_error.psi.toFixed(4)}°<br>
                                <strong>Max (Delta):</strong> ${metrics.max_error.delta.toFixed(4)}°
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-3">
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i> 
                    Puntos experimentales: ${metrics.n_points} | 
                    Parámetros ajustados: ${metrics.n_params}
                </small>
            </div>
            
            <button class="btn btn-outline-primary btn-sm mt-3" onclick="showFullReport()">
                <i class="fas fa-file-alt"></i> Ver Reporte Completo
            </button>
        </div>
    `;
    
    window.currentStatsReport = stats.report;
}

function showFullReport() {
    if (!window.currentStatsReport) {
        alert('No hay reporte disponible');
        return;
    }
    
    let modal = document.getElementById('stats-report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stats-report-modal';
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-file-alt"></i> Reporte Estadístico Completo
                        </h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <pre id="stats-report-content" style="font-size: 12px;"></pre>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('stats-report-content').textContent = window.currentStatsReport;
    
    $('#stats-report-modal').modal('show');
}


// ⭐⭐⭐ NUEVA FUNCIÓN: Plotear historia de convergencia ⭐⭐⭐
function plotConvergenceHistory() {
    if (!optimizationResults || !optimizationResults.history) {
        alert('No hay historia de optimización disponible');
        return;
    }
    
    const history = optimizationResults.history;
    
    if (!history.mse_history || history.mse_history.length === 0) {
        alert('No hay datos de MSE en la historia');
        return;
    }
    
    // Crear trace principal de MSE
    const trace_mse = {
        x: Array.from({length: history.mse_history.length}, (_, i) => i + 1),
        y: history.mse_history,
        mode: 'lines+markers',
        name: 'MSE',
        line: { color: '#0d6efd', width: 2 },
        marker: { size: 4 }
    };
    
    const traces = [trace_mse];
    
    // ⭐ NUEVO: Marcar iteraciones de restart si existen
    if (optimizationResults.restart_iterations && optimizationResults.restart_iterations.length > 0) {
        const restartIterations = optimizationResults.restart_iterations;
        const restartMSEs = restartIterations.map(iter => history.mse_history[iter - 1]);
        
        const trace_restarts = {
            x: restartIterations,
            y: restartMSEs,
            mode: 'markers',
            name: 'Restarts',
            marker: { 
                color: '#dc3545', 
                size: 12, 
                symbol: 'star',
                line: { color: '#fff', width: 2 }
            }
        };
        
        traces.push(trace_restarts);
    }
    
    // ⭐ NUEVO: Marcar mejor iteración
    if (history.best_iteration && history.best_iteration.iteration) {
        const bestIter = history.best_iteration.iteration;
        const bestMSE = history.best_iteration.mse;
        
        const trace_best = {
            x: [bestIter],
            y: [bestMSE],
            mode: 'markers',
            name: 'Mejor Solución',
            marker: { 
                color: '#198754', 
                size: 14, 
                symbol: 'diamond',
                line: { color: '#fff', width: 2 }
            }
        };
        
        traces.push(trace_best);
    }
    
    const layout = {
        title: {
            text: 'Convergencia de MSE por Iteración',
            font: { size: 16 }
        },
        xaxis: { 
            title: 'Iteración',
            gridcolor: '#e9ecef'
        },
        yaxis: { 
            title: 'MSE', 
            type: 'log',
            gridcolor: '#e9ecef'
        },
        height: 450,
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#dee2e6',
            borderwidth: 1
        },
        hovermode: 'closest',
        plot_bgcolor: '#f8f9fa'
    };
    
    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };
    
    // Crear div si no existe
    let plotDiv = document.getElementById('convergence-plot');
    if (!plotDiv) {
        plotDiv = document.createElement('div');
        plotDiv.id = 'convergence-plot';
        plotDiv.className = 'mt-3 mb-3';
        
        const banner = document.getElementById('model-saved-banner');
        banner.appendChild(plotDiv);
    }
    
    Plotly.newPlot(plotDiv, traces, layout, config);
    
    // Scroll suave a la gráfica
    setTimeout(() => {
        plotDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}


/**
 * ✅ NUEVA FUNCIÓN: Retorna mensaje apropiado según MSE (CompleteEASE)
 */
function getQualityMessageMSE(mse) {
    if (mse < 5) {
        return `
            <div class="alert alert-success small mb-0">
                <strong>✅ Ajuste excelente (MSE < 5)</strong><br>
                El modelo describe muy bien los datos experimentales según los estándares de CompleteEASE. 
                Los parámetros optimizados son altamente confiables.
                <div class="mt-2 small text-muted">
                    <strong>Referencia:</strong> J.A. Woollam Co., CompleteEASE Manual, v6.56 (2023)
                </div>
            </div>
        `;
    } else if (mse < 20) {
        return `
            <div class="alert alert-info small mb-0">
                <strong>ℹ️ Buen ajuste (5 ≤ MSE < 20)</strong><br>
                El modelo describe adecuadamente los datos. 
                Los parámetros son confiables con pequeñas desviaciones.
            </div>
        `;
    } else if (mse < 50) {
        return `
            <div class="alert alert-warning small mb-0">
                <strong>⚠️ Ajuste aceptable (20 ≤ MSE < 50)</strong><br>
                El modelo captura las tendencias principales pero hay desviaciones notables. 
                Considera revisar la estructura del modelo o los rangos de wavelength de los archivos de materiales.
            </div>
        `;
    } else {
        return `
            <div class="alert alert-danger small mb-0">
                <strong>❌ Ajuste inadecuado (MSE ≥ 50)</strong><br>
                El modelo NO describe bien los datos experimentales. 
                <strong>Recomendaciones:</strong>
                <ul class="mb-0 mt-2">
                    <li>Verificar que el modelo físico sea apropiado para la muestra</li>
                    <li>Revisar rangos de longitud de onda de archivos de materiales</li>
                    <li>Considerar agregar/quitar capas</li>
                    <li>Verificar calidad de datos experimentales</li>
                    <li>Intentar con algoritmo Simplex si usaste Levenberg-Marquardt</li>
                </ul>
            </div>
        `;
    }
}


/**
 * Obtiene el valor inicial de un parámetro con múltiples fallbacks
 * @param {string} paramName - Nombre del parámetro (ej: "layer_0_thickness")
 * @returns {number|null} Valor inicial del parámetro
 */
function getInitialParamValue(paramName) {
    console.log(`🔍 Buscando valor inicial para: ${paramName}`);
    
    // Extraer información del nombre del parámetro
    const parts = paramName.split('_');
    
    if (parts[0] !== 'layer') {
        console.warn(`⚠️ Formato de parámetro no reconocido: ${paramName}`);
        return null;
    }
    
    const layerIndex = parseInt(parts[1]);
    const paramType = parts.slice(2).join('_');
    
    console.log(`  📌 layerIndex: ${layerIndex}, paramType: ${paramType}`);
    
    // ==========================================
    // FALLBACK 1: Desde savedModel (PRIORIDAD MÁS ALTA)
    // ==========================================
    if (savedModel && savedModel.layers && savedModel.layers[layerIndex]) {
        const layer = savedModel.layers[layerIndex];
        
        if (paramType === 'thickness' && layer.thickness !== undefined) {
            console.log(`  ✅ Encontrado en savedModel.thickness: ${layer.thickness}`);
            return parseFloat(layer.thickness);
        }
        
        if (layer.params && layer.params[paramType] !== undefined) {
            console.log(`  ✅ Encontrado en savedModel.params: ${layer.params[paramType]}`);
            return parseFloat(layer.params[paramType]);
        }
    }
    
    // ==========================================
    // FALLBACK 2: Desde currentOpticalModel
    // ==========================================
    if (typeof currentOpticalModel !== 'undefined' && currentOpticalModel && currentOpticalModel.layers && currentOpticalModel.layers[layerIndex]) {
        const layer = currentOpticalModel.layers[layerIndex];
        
        if (paramType === 'thickness' && layer.thickness !== undefined) {
            console.log(`  ✅ Encontrado en currentOpticalModel.thickness: ${layer.thickness}`);
            return parseFloat(layer.thickness);
        }
        
        if (layer.params && layer.params[paramType] !== undefined) {
            console.log(`  ✅ Encontrado en currentOpticalModel.params: ${layer.params[paramType]}`);
            return parseFloat(layer.params[paramType]);
        }
    }
    
    // ==========================================
    // FALLBACK 3: Desde el DOM (última opción)
    // ==========================================
    try {
        const layerCard = document.querySelector(`.layer-card[data-idx="${layerIndex}"]`);
        if (layerCard) {
            if (paramType === 'thickness') {
                const thicknessInput = layerCard.querySelector('.layer-thickness');
                if (thicknessInput && thicknessInput.value) {
                    const value = parseFloat(thicknessInput.value);
                    if (!isNaN(value)) {
                        console.log(`  ✅ Encontrado en DOM (thickness): ${value}`);
                        return value;
                    }
                }
            } else {
                // Buscar input de parámetro de dispersión
                const paramInput = layerCard.querySelector(`input[data-param="${paramType}"]`);
                if (paramInput && paramInput.value) {
                    const value = parseFloat(paramInput.value);
                    if (!isNaN(value)) {
                        console.log(`  ✅ Encontrado en DOM (param): ${value}`);
                        return value;
                    }
                }
            }
        }
    } catch (e) {
        console.warn(`  ⚠️ Error buscando en DOM: ${e.message}`);
    }
    
    // ==========================================
    // NO SE ENCONTRÓ: Retornar null
    // ==========================================
    console.warn(`  ❌ No se pudo obtener valor inicial para ${paramName}`);
    return null;
}

/**
 * Formatea el nombre del parámetro para mostrarlo en la tabla
 */
function formatParamName(paramName) {
    // Convertir "layer_0_thickness" → "Capa 1 - Espesor"
    // Convertir "layer_1_A" → "Capa 2 - A"
    
    const parts = paramName.split('_');
    
    if (parts[0] === 'layer') {
        const layerNum = parseInt(parts[1]) + 1;
        const paramType = parts.slice(2).join('_');
        
        const paramLabels = {
            'thickness': 'Espesor (nm)',
            'A': 'A (Cauchy)',
            'B': 'B (Cauchy)',
            'C': 'C (Cauchy)',
            'B1': 'B₁ (Sellmeier)',
            'C1': 'C₁ (Sellmeier)',
            'eps_inf': 'ε∞',
            'E_p': 'Eₚ (eV)',
            'Gamma_D': 'Γ_D (eV)'
        };
        
        const label = paramLabels[paramType] || paramType;
        return `Capa ${layerNum} - ${label}`;
    }
    
    return paramName;
}

/**
 * Retorna mensaje apropiado según la calidad del ajuste
 */
function getQualityMessage(chiSqReduced) {
    if (chiSqReduced < 1.5) {
        return `
            <div class="alert alert-success small mb-0">
                <strong> Ajuste excelente</strong><br>
                El modelo describe muy bien los datos experimentales. 
                Los parámetros optimizados son confiables.
            </div>
        `;
    } else if (chiSqReduced < 3.0) {
        return `
            <div class="alert alert-info small mb-0">
                <strong>Buen ajuste</strong><br>
                El modelo describe adecuadamente los datos. 
                Los parámetros son confiables con pequeñas desviaciones.
            </div>
        `;
    } else if (chiSqReduced < 5.0) {
        return `
            <div class="alert alert-warning small mb-0">
                <strong>Ajuste aceptable</strong><br>
                El modelo captura las tendencias principales pero hay desviaciones notables. 
                Considera revisar la estructura del modelo.
            </div>
        `;
    } else {
        return `
            <div class="alert alert-danger small mb-0">
                <strong> Ajuste inadecuado</strong><br>
                El modelo NO describe bien los datos experimentales. 
                <strong>Recomendaciones:</strong>
                <ul class="mb-0 mt-2">
                    <li>Verificar que el modelo físico sea apropiado para la muestra</li>
                    <li>Revisar rangos de longitud de onda de archivos de materiales</li>
                    <li>Considerar agregar/quitar capas</li>
                    <li>Verificar calidad de datos experimentales</li>
                </ul>
            </div>
        `;
    }
}



/**
 * Descarga los resultados de optimización en formato Excel (XLSX)
 */
function downloadOptimizedResults() {
    if (!optimizationResults) {
        alert('No hay resultados de optimización para descargar');
        return;
    }
    
    console.log('Preparando descarga de resultados optimizados');
    
    try {
        // Crear workbook
        const wb = XLSX.utils.book_new();
        
        // ========== HOJA 1: PARÁMETROS OPTIMIZADOS ==========
        const paramsData = [
            ['PARÁMETROS OPTIMIZADOS'],
            [],
            ['Parámetro', 'Valor Inicial', 'Valor Optimizado', 'Error Estándar (±σ)', 'Cambio (%)']
        ];
        
        for (const paramName in optimizationResults.optimized_params) {
            const optimizedValue = optimizationResults.optimized_params[paramName];
            const confidence = optimizationResults.confidence_intervals[paramName];
            const initialValue = getInitialParamValue(paramName);
            
            const change = initialValue !== null ? 
                ((optimizedValue - initialValue) / initialValue * 100).toFixed(2) : 
                'N/A';
            
            paramsData.push([
                formatParamName(paramName),
                initialValue !== null ? initialValue : 'N/A',
                optimizedValue,
                confidence[1],
                change
            ]);
        }
        
        paramsData.push([]);
        paramsData.push(['INFORMACIÓN DE OPTIMIZACIÓN']);
        paramsData.push(['Iteraciones', optimizationResults.iterations]);
        paramsData.push(['Tiempo (s)', optimizationResults.optimization_time.toFixed(3)]);
        paramsData.push(['Mejora (%)', optimizationResults.improvement_percentage.toFixed(2)]);
        paramsData.push(['Estado', optimizationResults.success ? 'Exitoso' : 'Fallido']);
        paramsData.push(['Mensaje', optimizationResults.message || 'Convergencia exitosa']);
        
        const ws_params = XLSX.utils.aoa_to_sheet(paramsData);
        ws_params['!cols'] = [
            {wch: 25}, {wch: 15}, {wch: 18}, {wch: 18}, {wch: 12}
        ];
        XLSX.utils.book_append_sheet(wb, ws_params, 'Parámetros');
        
        // ========== HOJA 2: MÉTRICAS DE AJUSTE ==========
        const metricsData = [
            ['COMPARACIÓN DE MÉTRICAS: ANTES vs DESPUÉS'],
            [],
            ['Métrica', 'ANTES (inicial)', 'DESPUÉS (optimizado)', 'Mejora']
        ];
        
        const initial = optimizationResults.initial_metrics;
        const final = optimizationResults.final_metrics;
        
        const metricsComparison = [
            ['χ² (Chi-cuadrado)', initial.chi_squared, final.chi_squared, 
             ((initial.chi_squared - final.chi_squared) / initial.chi_squared * 100).toFixed(2) + '%'],
            ['χ² reducido', initial.chi_squared_reduced, final.chi_squared_reduced,
             ((initial.chi_squared_reduced - final.chi_squared_reduced) / initial.chi_squared_reduced * 100).toFixed(2) + '%'],
            ['RMSE Ψ (°)', initial.rmse_psi, final.rmse_psi,
             ((initial.rmse_psi - final.rmse_psi) / initial.rmse_psi * 100).toFixed(2) + '%'],
            ['RMSE Δ (°)', initial.rmse_delta, final.rmse_delta,
             ((initial.rmse_delta - final.rmse_delta) / initial.rmse_delta * 100).toFixed(2) + '%'],
            ['R² Ψ', initial.r2_psi, final.r2_psi,
             ((final.r2_psi - initial.r2_psi) / Math.abs(initial.r2_psi) * 100).toFixed(2) + '%'],
            ['R² Δ', initial.r2_delta, final.r2_delta,
             ((final.r2_delta - initial.r2_delta) / Math.abs(initial.r2_delta) * 100).toFixed(2) + '%']
        ];
        
        metricsComparison.forEach(row => metricsData.push(row));
        
        metricsData.push([]);
        metricsData.push(['CALIDAD DEL AJUSTE']);
        
        const chiSqReduced = final.chi_squared_reduced;
        let quality;
        if (chiSqReduced < 1.5) quality = 'EXCELENTE';
        else if (chiSqReduced < 3.0) quality = 'BUENO';
        else if (chiSqReduced < 5.0) quality = 'ACEPTABLE';
        else quality = 'INADECUADO';
        
        metricsData.push(['Clasificación', quality]);
        metricsData.push(['χ² reducido final', chiSqReduced.toFixed(4)]);
        
        const ws_metrics = XLSX.utils.aoa_to_sheet(metricsData);
        ws_metrics['!cols'] = [
            {wch: 20}, {wch: 18}, {wch: 22}, {wch: 12}
        ];
        XLSX.utils.book_append_sheet(wb, ws_metrics, 'Métricas');
        
        // ========== HOJA 3: DATOS COMPARATIVOS (Ψ y Δ) ==========
        const dataComparison = [
            ['λ (nm)', 'Ψ exp (°)', 'Ψ opt (°)', 'Residuo Ψ', 'Δ exp (°)', 'Δ opt (°)', 'Residuo Δ']
        ];
        
        const wavelengths = uploadedWavelengths;
        const cols = currentData.columns;
        const psiCol = findColumn(cols, ["psi"]);
        const deltaCol = findColumn(cols, ["delta"]);
        
        const psi_exp = uploadedFileData.map(r => r[psiCol]);
        const delta_exp = uploadedFileData.map(r => r[deltaCol]);
        const psi_opt = optimizationResults.psi_theoretical;
        const delta_opt = optimizationResults.delta_theoretical;
        
        for (let i = 0; i < wavelengths.length; i++) {
            dataComparison.push([
                wavelengths[i].toFixed(2),
                psi_exp[i].toFixed(4),
                psi_opt[i].toFixed(4),
                (psi_exp[i] - psi_opt[i]).toFixed(4),
                delta_exp[i].toFixed(4),
                delta_opt[i].toFixed(4),
                (delta_exp[i] - delta_opt[i]).toFixed(4)
            ]);
        }
        
        const ws_data = XLSX.utils.aoa_to_sheet(dataComparison);
        ws_data['!cols'] = [
            {wch: 10}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}
        ];
        XLSX.utils.book_append_sheet(wb, ws_data, 'Datos Comparativos');
        
        // ========== HOJA 4: INFORMACIÓN DEL MODELO ==========
        const modelInfo = [
            ['INFORMACIÓN DEL MODELO ÓPTICO'],
            [],
            ['Configuración Global'],
            ['Ángulo de incidencia (°)', currentOpticalModel.global.angle],
            ['Polarización', currentOpticalModel.global.polarization],
            ['Modo de λ', currentOpticalModel.global.wavelength_mode],
            [],
            ['Medio Ambiente'],
            ['Tipo', currentOpticalModel.ambient.type],
        ];
        
        if (currentOpticalModel.ambient.n !== undefined) {
            modelInfo.push(['n', currentOpticalModel.ambient.n]);
            modelInfo.push(['k', currentOpticalModel.ambient.k || 0]);
        }
        
        modelInfo.push([]);
        modelInfo.push(['Sustrato']);
        modelInfo.push(['Tipo', currentOpticalModel.substrate.type]);
        
        if (currentOpticalModel.substrate.n !== undefined) {
            modelInfo.push(['n', currentOpticalModel.substrate.n]);
            modelInfo.push(['k', currentOpticalModel.substrate.k || 0]);
        }
        
        modelInfo.push([]);
        modelInfo.push(['Capas']);
        modelInfo.push(['#', 'Nombre', 'Espesor (nm)', 'Modelo']);
        
        currentOpticalModel.layers.forEach((layer, i) => {
            modelInfo.push([
                i + 1,
                layer.name,
                layer.thickness,
                layer.model || layer.layer_type
            ]);
        });
        
        const ws_model = XLSX.utils.aoa_to_sheet(modelInfo);
        ws_model['!cols'] = [
            {wch: 25}, {wch: 20}, {wch: 15}, {wch: 20}
        ];
        XLSX.utils.book_append_sheet(wb, ws_model, 'Modelo');
        
        // Generar archivo y descargar
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `resultados_optimizacion_${timestamp}.xlsx`;
        
        XLSX.writeFile(wb, filename);
        
        console.log(`Archivo descargado: ${filename}`);
        
        // Mostrar mensaje de éxito
        const banner = document.getElementById('model-saved-banner');
        const successMsg = document.createElement('div');
        successMsg.className = 'alert alert-success mt-2';
        successMsg.innerHTML = `
            <strong> Descarga exitosa</strong>
            <p class="mb-0 small">Archivo guardado: <code>${filename}</code></p>
        `;
        banner.appendChild(successMsg);
        
        setTimeout(() => successMsg.remove(), 5000);
        
    } catch (error) {
        console.error('Error descargando resultados:', error);
        alert(`Error al generar archivo: ${error.message}`);
    }
}

/**
 * Permite re-optimizar el modelo con parámetros actuales
 */
function reoptimize() {
    const message = `¿Deseas ejecutar la optimización nuevamente?

Esto usará los parámetros OPTIMIZADOS actuales como punto de partida.

Útil si:
- Quieres refinar aún más el ajuste
- El resultado anterior fue "ACEPTABLE" o "INADECUADO"
- Cambiaste los parámetros a optimizar

¿Continuar?`;
    
    if (confirm(message)) {
        console.log('Re-ejecutando optimización...');
        
        // Actualizar modelo con parámetros optimizados
        updateModelWithOptimizedParams();
        
        // Ejecutar optimización nuevamente
        startOptimization();
    }
}

/**
 * Actualiza currentOpticalModel con los parámetros optimizados
 * Para usar como punto de partida en re-optimización
 */
function updateModelWithOptimizedParams() {
    if (!optimizationResults || !currentOpticalModel) {
        console.warn('No hay resultados de optimización o modelo para actualizar');
        return;
    }
    
    console.log('Actualizando modelo con parámetros optimizados');
    
    const optimizedParams = optimizationResults.optimized_params;
    
    for (const paramName in optimizedParams) {
        const value = optimizedParams[paramName];
        const parts = paramName.split('_');
        
        if (parts[0] === 'layer') {
            const layerIndex = parseInt(parts[1]);
            const paramType = parts.slice(2).join('_');
            
            const layer = currentOpticalModel.layers[layerIndex];
            if (!layer) continue;
            
            if (paramType === 'thickness') {
                layer.thickness = value;
                console.log(`  ✓ Capa ${layerIndex}: espesor → ${value.toFixed(2)} nm`);
            } else if (layer.params) {
                layer.params[paramType] = value;
                console.log(`  ✓ Capa ${layerIndex}: ${paramType} → ${value.toFixed(4)}`);
            }
        }
    }
    
    console.log('Modelo actualizado con parámetros optimizados');
}


// ==========================================
// ECUACIONES PERSONALIZADAS EN LaTeX
// ==========================================

/**
 * Abre editor de ecuaciones LaTeX
 * @param {string} targetId - ID del contenedor donde se guardará la ecuación
 */
function openLatexEditor(targetId) {
    // Crear modal
    const modalHTML = `
        <div class="modal fade" id="latexEditorModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"> Editor de Ecuación Personalizada (LaTeX)</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Selector de variable -->
                        <div class="mb-3">
                            <label class="form-label"><strong>Variable independiente:</strong></label>
                            <div class="btn-group w-100" role="group">
                                <input type="radio" class="btn-check" name="latex-variable" id="latex-var-lambda" value="lambda" checked>
                                <label class="btn btn-outline-primary" for="latex-var-lambda">
                                    λ (longitud de onda, nm)
                                </label>
                                
                                <input type="radio" class="btn-check" name="latex-variable" id="latex-var-omega" value="omega">
                                <label class="btn btn-outline-primary" for="latex-var-omega">
                                    ω (frecuencia angular, rad/s)
                                </label>
                            </div>
                            <small class="text-muted d-block mt-1">
                                 En LaTeX usa: <code>\\lambda</code> para λ o <code>\\omega</code> para ω
                            </small>
                        </div>
                        
                        <hr>
                        
                        <!-- Ecuación para n -->
                        <div class="mb-3">
                            <label for="latex-eq-n" class="form-label">
                                <strong>Ecuación para n (índice de refracción):</strong>
                            </label>
                            <textarea class="form-control font-monospace" 
                                      id="latex-eq-n" 
                                      rows="4" 
                                      placeholder="Ejemplo: 1.5 + \\frac{0.002}{\\lambda^2}"></textarea>
                            
                            <div class="mt-2">
                                <small class="text-muted"><strong>Ejemplos comunes:</strong></small>
                                <div class="d-flex flex-wrap gap-2 mt-1">
                                    <button class="btn btn-sm btn-outline-secondary" onclick="insertLatexExample('cauchy')">
                                        Cauchy
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="insertLatexExample('sellmeier')">
                                        Sellmeier
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="insertLatexExample('drude')">
                                        Drude
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <hr>
                        
                        <!-- Ecuación para k -->
                        <div class="mb-3">
                            <label for="latex-eq-k" class="form-label">
                                <strong>Ecuación para k (coeficiente de extinción):</strong>
                                <span class="badge bg-secondary">Opcional</span>
                            </label>
                            <textarea class="form-control font-monospace" 
                                      id="latex-eq-k" 
                                      rows="3" 
                                      placeholder="Ejemplo: 0  (para materiales transparentes)"></textarea>
                        </div>
                        
                        <hr>
                        
                        <!-- Botón validar -->
                        <div class="d-grid gap-2">
                            <button class="btn btn-primary btn-lg" id="btn-validate-latex">
                                 Validar Ecuación
                            </button>
                        </div>
                        
                        <!-- Resultado de validación -->
                        <div id="latex-validation-result" class="mt-3" style="display: none;"></div>
                        
                        <!-- Preview de gráfica -->
                        <div id="latex-preview-plot" class="mt-3" style="display: none; height: 350px;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-success" id="btn-save-latex" disabled>
                            Guardar Ecuación
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Eliminar modal anterior si existe
    const oldModal = document.getElementById('latexEditorModal');
    if (oldModal) {
        oldModal.remove();
    }
    
    // Agregar modal al DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Inicializar modal de Bootstrap
    const modalElement = document.getElementById('latexEditorModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Guardar targetId para usar al guardar
    modalElement.dataset.targetId = targetId;
    
    // Event listeners
    document.getElementById('btn-validate-latex').addEventListener('click', validateLatexEquation);
    document.getElementById('btn-save-latex').addEventListener('click', function() {
        saveLatexEquation(targetId);
        modal.hide();
    });
    
    // Mostrar modal
    modal.show();
}

/**
 * Inserta ejemplos de ecuaciones LaTeX
 */
function insertLatexExample(type) {
    const eqN = document.getElementById('latex-eq-n');
    const eqK = document.getElementById('latex-eq-k');
    
    const examples = {
        'cauchy': {
            n: 'A + \\frac{B}{\\lambda^2} + \\frac{C}{\\lambda^4}',
            k: '0',
            note: 'Donde A, B, C son constantes. Sustituye por valores numéricos.'
        },
        'sellmeier': {
            n: '\\sqrt{1 + \\frac{B_1 \\lambda^2}{\\lambda^2 - C_1}}',
            k: '0',
            note: 'Sustituye B_1 y C_1 por valores numéricos.'
        },
        'drude': {
            n: '\\sqrt{\\epsilon_\\infty - \\frac{\\omega_p^2}{\\omega^2}}',
            k: '0',
            note: 'Para usar ω, selecciona "ω" arriba. Sustituye ε∞ y ωₚ por valores.'
        }
    };
    
    if (examples[type]) {
        eqN.value = examples[type].n;
        eqK.value = examples[type].k;
        
        alert(`Ejemplo insertado: ${type}\n\n${examples[type].note}`);
    }
}

/**
 * Valida ecuación LaTeX
 */
async function validateLatexEquation() {
    const eqN = document.getElementById('latex-eq-n').value.trim();
    const eqK = document.getElementById('latex-eq-k').value.trim() || '0';
    const variable = document.querySelector('input[name="latex-variable"]:checked').value;
    
    if (!eqN) {
        alert('Por favor ingresa una ecuación para n');
        return;
    }
    
    const resultDiv = document.getElementById('latex-validation-result');
    const btnSave = document.getElementById('btn-save-latex');
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <div class="alert alert-info">
            <div class="spinner-border spinner-border-sm me-2"></div>
            Validando ecuación...
        </div>
    `;
    
    btnSave.disabled = true;
    
    try {
        // Obtener rango de longitudes de onda
        const wavelengthMin = uploadedWavelengths && uploadedWavelengths.length > 0 ? 
            Math.min(...uploadedWavelengths) : 300;
        const wavelengthMax = uploadedWavelengths && uploadedWavelengths.length > 0 ? 
            Math.max(...uploadedWavelengths) : 800;
        
        console.log('Validando ecuación:', { eqN, eqK, variable, wavelengthMin, wavelengthMax });
        
        const response = await fetch('/api/validate-custom-equation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                equation_n: eqN,
                equation_k: eqK,
                variable: variable,
                wavelength_min: wavelengthMin,
                wavelength_max: wavelengthMax
            })
        });
        
        const result = await response.json();
        console.log('Resultado validación:', result);
        
        if (result.success && result.validation.valid) {
            const v = result.validation;
            
            let html = `
                <div class="alert alert-success">
                    <h6 class="alert-heading"> Ecuación válida</h6>
                    <hr>
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Variable detectada:</strong> ${result.detected_variable}<br>
                            <strong>Rango de n:</strong> ${v.n_min.toFixed(4)} - ${v.n_max.toFixed(4)}
                        </div>
                        <div class="col-md-6">
                            <strong>Rango de k:</strong> ${v.k_min.toFixed(4)} - ${v.k_max.toFixed(4)}
                        </div>
                    </div>
            `;
            
            if (v.warnings && v.warnings.length > 0) {
                html += `
                    <div class="alert alert-warning mt-2 mb-0">
                        <strong> Advertencias:</strong>
                        <ul class="mb-0 mt-1">
                            ${v.warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            html += '</div>';
            
            resultDiv.innerHTML = html;
            btnSave.disabled = false;
            
            // Mostrar gráfica de preview
            plotLatexPreview(result.preview);
            
        } else {
            const errorMsg = result.validation?.message || result.error || 'Error desconocido';
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h6 class="alert-heading">Error en ecuación</h6>
                    <p class="mb-0">${errorMsg}</p>
                </div>
            `;
            btnSave.disabled = true;
        }
        
    } catch (error) {
        console.error('Error validando ecuación:', error);
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <strong> Error de conexión</strong>
                <p class="mb-0">${error.message}</p>
            </div>
        `;
        btnSave.disabled = true;
    }
}

/**
 * Guarda ecuación LaTeX validada
 */
function saveLatexEquation(targetId) {
    const eqN = document.getElementById('latex-eq-n').value.trim();
    const eqK = document.getElementById('latex-eq-k').value.trim() || '0';
    const variable = document.querySelector('input[name="latex-variable"]:checked').value;
    
    console.log('Guardando ecuación para:', targetId);
    
    // Buscar el contenedor donde se mostrará la ecuación
    const targetContainer = document.getElementById(targetId);
    
    if (targetContainer) {
        // Actualizar display
        const displayDiv = targetContainer.querySelector('.latex-equation-display');
        const hiddenInput = targetContainer.querySelector('.latex-equation-value');
        
        if (displayDiv) {
            displayDiv.innerHTML = `
                <div class="alert alert-success mb-0">
                    <strong>Ecuación definida</strong><br>
                    <small>
                        <strong>n:</strong> <code>${eqN.substring(0, 60)}${eqN.length > 60 ? '...' : ''}</code><br>
                        <strong>k:</strong> <code>${eqK}</code><br>
                        <strong>Variable:</strong> ${variable}
                    </small>
                </div>
            `;
        }
        
        if (hiddenInput) {
            hiddenInput.value = JSON.stringify({
                equation_n: eqN,
                equation_k: eqK,
                variable: variable
            });
        }
    }
    
    console.log('Ecuación guardada');
}

/**
 * Plotea preview de n y k vs λ
 */
function plotLatexPreview(preview) {
    const plotDiv = document.getElementById('latex-preview-plot');
    if (!plotDiv) return;
    
    plotDiv.style.display = 'block';
    
    const trace_n = {
        x: preview.wavelengths,
        y: preview.n_values,
        mode: 'lines',
        name: 'n (índice refracción)',
        line: { color: '#0d6efd', width: 2 }
    };
    
    const trace_k = {
        x: preview.wavelengths,
        y: preview.k_values,
        mode: 'lines',
        name: 'k (extinción)',
        line: { color: '#dc3545', width: 2 },
        yaxis: 'y2'
    };
    
    const layout = {
        title: 'Preview: n y k vs λ',
        xaxis: { 
            title: 'Longitud de onda (nm)',
            gridcolor: '#eee'
        },
        yaxis: { 
            title: 'n',
            titlefont: { color: '#0d6efd' },
            tickfont: { color: '#0d6efd' },
            gridcolor: '#eee'
        },
        yaxis2: {
            title: 'k',
            titlefont: { color: '#dc3545' },
            tickfont: { color: '#dc3545' },
            overlaying: 'y',
            side: 'right'
        },
        height: 350,
        margin: { l: 60, r: 60, t: 50, b: 50 },
        plot_bgcolor: 'white',
        paper_bgcolor: 'white'
    };
    
    Plotly.newPlot(plotDiv, [trace_n, trace_k], layout, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
    });
}

/**
 * Event listener para botones "Editar ecuación LaTeX" dentro de capas
 */
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('open-latex-editor-btn')) {
        // Encontrar el contenedor de la capa
        const layerCard = e.target.closest('.layer-card');
        if (layerCard) {
            const idx = layerCard.dataset.idx;
            const targetId = `layer-custom-${idx}`;
            openLatexEditor(targetId);
        }
    }
});

/**
 * Muestra modal simplificado para seleccionar ALGORITMO de optimización
 * VERSIÓN v5.0: Modal está en upload.html, solo lo mostramos aquí
 */
function showOptimizationStrategyModal() {
    const modal = new bootstrap.Modal(document.getElementById('strategyModal'));
    
    // ⭐ v5.0: Event listener para toggle de opciones multiguess
    const multiguessCheckbox = document.getElementById('useMultiguess');
    if (multiguessCheckbox) {
        // Remover listener anterior si existe
        multiguessCheckbox.removeEventListener('change', toggleMultiguessOptions);
        multiguessCheckbox.addEventListener('change', toggleMultiguessOptions);
    }
    
    // Event listener para selección de cards
    document.querySelectorAll('.strategy-card').forEach(card => {
        card.addEventListener('click', function() {
            const algorithm = this.dataset.algorithm;
            document.getElementById(`algo-${algorithm}`).checked = true;
        });
    });
    
    // Event listener para botón confirmar
    const confirmBtn = document.getElementById('btn-confirm-algorithm');
    confirmBtn.removeEventListener('click', handleConfirmAlgorithm);
    confirmBtn.addEventListener('click', handleConfirmAlgorithm);
    
    modal.show();
}

// ⭐ v5.0: Funciones auxiliares
function toggleMultiguessOptions() {
    const optionsDiv = document.getElementById('multiguessOptions');
    if (optionsDiv) {
        optionsDiv.style.display = this.checked ? 'block' : 'none';
    }
}

function handleConfirmAlgorithm() {
    const selectedAlgorithm = document.querySelector('input[name="algorithm"]:checked').value;
    const useMultiguess = document.getElementById('useMultiguess')?.checked || false;
    const nGuesses = parseInt(document.getElementById('nGuesses')?.value || '5');
    
    // Cerrar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('strategyModal'));
    modal.hide();
    
    // ⭐ v5.0: Pasar configuración multiguess
    executeOptimizationWithAlgorithm(selectedAlgorithm, { 
        useMultiguess, 
        nGuesses 
    });
}

function selectAlgorithm(algorithm) {
    // Marcar el radio button correspondiente
    document.getElementById(`algo-${algorithm}`).checked = true;
    
    // Resaltar la card seleccionada
    document.querySelectorAll('.strategy-card').forEach(card => {
        card.style.borderColor = 'transparent';
        card.style.boxShadow = 'none';
    });
    
    const selectedCard = document.getElementById(`algo-${algorithm}`).closest('.strategy-card');
    selectedCard.style.borderColor = '#0d6efd';
    selectedCard.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
}

function confirmAlgorithmSelection() {
    const selectedAlgorithm = document.querySelector('input[name="algorithm"]:checked').value;
    
    closeOptimizationStrategyModal();
    
    // Ejecutar optimización con el algoritmo seleccionado
    executeOptimizationWithAlgorithm(selectedAlgorithm);
}

function closeOptimizationStrategyModal() {
    const modal = document.getElementById('strategyModal');
    if (modal) {
        modal.remove();
    }
}

function selectAlgorithm(algorithm) {
    // Marcar el radio button correspondiente
    document.getElementById(`algo-${algorithm}`).checked = true;
    
    // Resaltar la card seleccionada
    document.querySelectorAll('.strategy-card').forEach(card => {
        card.style.borderColor = 'transparent';
        card.style.boxShadow = 'none';
    });
    
    const selectedCard = document.getElementById(`algo-${algorithm}`).closest('.strategy-card');
    selectedCard.style.borderColor = '#0d6efd';
    selectedCard.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
}

function confirmAlgorithmSelection() {
    const selectedAlgorithm = document.querySelector('input[name="algorithm"]:checked').value;
    
    closeOptimizationStrategyModal();
    
    // Ejecutar optimización con el algoritmo seleccionado
    executeOptimizationWithAlgorithm(selectedAlgorithm);
}

function closeOptimizationStrategyModal() {
    const modal = document.getElementById('strategyModal');
    if (modal) {
        modal.remove();
    }
}


/**
 * Ejecuta optimización con la estrategia seleccionada
 */
/**
 * Ejecuta optimización con la estrategia seleccionada
 */
async function executeOptimizationWithStrategy(strategy) {
    try {
        // Verificaciones previas
        if (!savedModel) {
            alert('Error: No hay modelo óptico guardado.');
            return;
        }
        
        if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
            alert('Error: No hay datos experimentales cargados');
            return;
        }
        
        if (!theoreticalPsi || theoreticalPsi.length === 0) {
            alert('Error: Primero debes calcular los valores teóricos');
            return;
        }
        
        // Recopilar parámetros
        const paramsToOptimize = collectParametersToOptimize();
        
        if (paramsToOptimize.length === 0) {
            alert('No hay parámetros marcados para optimizar.');
            return;
        }
        
        console.log(`🔧 Estrategia seleccionada: ${strategy}`);
        console.log(`📊 Parámetros a optimizar: ${paramsToOptimize.length}`);
        
        // Mostrar progreso
        showOptimizationProgress();
        isOptimizing = true;
        
        // ✅ CORRECCIÓN: Incluir TODA la estructura global
        const requestData = {
            psi_exp: uploadedPsi,
            delta_exp: uploadedDelta,
            wavelengths: uploadedWavelengths,
            optical_model: {
                global: {
                    angle: savedModel.global.angle,
                    polarization: savedModel.global.polarization,
                    wavelength_mode: savedModel.global.wavelength_mode,
                    // Incluir campos según el modo
                    ...(savedModel.global.wavelength_mode === 'file' && {
                        wavelengths: savedModel.global.wavelengths
                    }),
                    ...(savedModel.global.wavelength_mode === 'range' && {
                        wl_from: savedModel.global.wl_from,
                        wl_to: savedModel.global.wl_to,
                        wl_steps: savedModel.global.wl_steps
                    }),
                    ...(savedModel.global.wavelength_mode === 'single' && {
                        wl_single: savedModel.global.wl_single
                    })
                },
                ambient: savedModel.ambient,
                substrate: savedModel.substrate,
                layers: savedModel.layers
            },
            params_to_optimize: paramsToOptimize,
            strategy: strategy
        };
        
        console.log('📤 Enviando request:', requestData);
        
        // Llamar al backend
        const response = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (!result.success) {
            throw new Error(result.message || 'Optimización no convergió');
        }
        
        console.log('✅ Optimización completada');
        console.log(`  Estrategia: ${strategy}`);
        console.log(`  Mejora: ${result.improvement_percentage.toFixed(2)}%`);
        
        // Guardar resultados
        optimizationResults = result;
        theoreticalPsi = result.psi_theoretical;
        theoreticalDelta = result.delta_theoretical;
        
        // Mostrar resultados
        showOptimizationResultsWithStrategy(result);
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert(`Error durante la optimización:\n\n${error.message}`);
        hideOptimizationProgress();
    } finally {
        isOptimizing = false;
    }
}


/**
 * Muestra resultados con detalles de la estrategia usada
 * Y ACTUALIZA LAS GRÁFICAS AUTOMÁTICAMENTE
 */
function showOptimizationResultsWithStrategy(result) {
    hideOptimizationProgress();
    
    const banner = document.getElementById('model-saved-banner');
    if (!banner) return;
    
    const gof = result.final_metrics;
    const chiSqReduced = gof.chi_squared_reduced;
    
    // Determinar calidad
    let fitQuality, fitColor, fitIcon;
    if (chiSqReduced < 1.5) {
        fitQuality = 'EXCELENTE';
        fitColor = 'success';
        fitIcon = '✅';
    } else if (chiSqReduced < 3.0) {
        fitQuality = 'BUENO';
        fitColor = 'info';
        fitIcon = 'ℹ️';
    } else if (chiSqReduced < 5.0) {
        fitQuality = 'ACEPTABLE';
        fitColor = 'warning';
        fitIcon = '⚠️';
    } else {
        fitQuality = 'INADECUADO';
        fitColor = 'danger';
        fitIcon = '❌';
    }
    
    // Nombre de estrategia legible
    const strategyNames = {
        'simultaneous': 'Simultánea',
        'by_phases': 'Por Fases',
        'layer_by_layer': 'Capa por Capa',
        'iterative_refinement': 'Refinamiento Iterativo'
    };
    
    const strategyName = strategyNames[result.strategy] || result.strategy;
    
    // Construir HTML con detalles de estrategia
    let strategyDetailsHTML = '';
    
    if (result.strategy === 'by_phases' && result.phase_details) {
        strategyDetailsHTML = `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>📊 Detalles de Fases</strong>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Fase 1 (Espesores):</strong>
                            <ul class="small mb-0">
                                <li>Parámetros: ${result.phase_details.phase1.params_count}</li>
                                <li>Iteraciones: ${result.phase_details.phase1.iterations}</li>
                                <li>Tiempo: ${result.phase_details.phase1.time.toFixed(2)} s</li>
                                <li>χ²: ${result.phase_details.phase1.chi_squared.toFixed(2)}</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <strong>Fase 2 (Dispersión):</strong>
                            <ul class="small mb-0">
                                <li>Parámetros: ${result.phase_details.phase2.params_count}</li>
                                <li>Iteraciones: ${result.phase_details.phase2.iterations}</li>
                                <li>Tiempo: ${result.phase_details.phase2.time.toFixed(2)} s</li>
                                <li>χ²: ${result.phase_details.phase2.chi_squared.toFixed(2)}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (result.strategy === 'layer_by_layer' && result.layer_details) {
        let layersHTML = '';
        for (const [key, details] of Object.entries(result.layer_details)) {
            layersHTML += `
                <div class="col-md-4 mb-2">
                    <strong>${key.replace('_', ' ').toUpperCase()}:</strong>
                    <ul class="small mb-0">
                        <li>Params: ${details.params_count}</li>
                        <li>Iter: ${details.iterations}</li>
                        <li>χ²: ${details.chi_squared.toFixed(2)}</li>
                    </ul>
                </div>
            `;
        }
        
        strategyDetailsHTML = `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>📊 Detalles Capa por Capa</strong>
                </div>
                <div class="card-body">
                    <div class="row">
                        ${layersHTML}
                    </div>
                </div>
            </div>
        `;
    } else if (result.strategy === 'iterative_refinement' && result.refinement_steps) {
        const steps = result.refinement_steps;
        strategyDetailsHTML = `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>📊 Pasos de Refinamiento</strong>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <strong>Paso 1 (Global):</strong>
                            <ul class="small mb-0">
                                <li>Iter: ${steps.step1_global.iterations}</li>
                                <li>Tiempo: ${steps.step1_global.time.toFixed(2)} s</li>
                                <li>χ²: ${steps.step1_global.chi_squared.toFixed(2)}</li>
                            </ul>
                        </div>
                        ${steps.step2_thickness ? `
                        <div class="col-md-4">
                            <strong>Paso 2 (Espesores):</strong>
                            <ul class="small mb-0">
                                <li>Iter: ${steps.step2_thickness.iterations}</li>
                                <li>Tiempo: ${steps.step2_thickness.time.toFixed(2)} s</li>
                                <li>χ²: ${steps.step2_thickness.chi_squared.toFixed(2)}</li>
                            </ul>
                        </div>
                        ` : ''}
                        ${steps.step3_dispersion ? `
                        <div class="col-md-4">
                            <strong>Paso 3 (Dispersión):</strong>
                            <ul class="small mb-0">
                                <li>Iter: ${steps.step3_dispersion.iterations}</li>
                                <li>Tiempo: ${steps.step3_dispersion.time.toFixed(2)} s</li>
                                <li>χ²: ${steps.step3_dispersion.chi_squared.toFixed(2)}</li>
                            </ul>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    // Tabla de parámetros
    let paramsTableHTML = `
        <table class="table table-sm table-bordered mb-0">
            <thead class="table-light">
                <tr>
                    <th>Parámetro</th>
                    <th>Valor Inicial</th>
                    <th>Valor Optimizado ± σ</th>
                    <th>Cambio</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (const paramName in result.optimized_params) {
        const optimizedValue = result.optimized_params[paramName];
        const confidence = result.confidence_intervals[paramName];
        const initialValue = getInitialParamValue(paramName);
        
        const change = initialValue !== null ? 
            ((optimizedValue - initialValue) / initialValue * 100).toFixed(1) : 
            'N/A';
        
        const changeColor = Math.abs(parseFloat(change)) > 10 ? 'text-danger' : 'text-muted';
        
        paramsTableHTML += `
            <tr>
                <td><strong>${formatParamName(paramName)}</strong></td>
                <td>${initialValue !== null ? initialValue.toFixed(4) : 'N/A'}</td>
                <td><strong>${optimizedValue.toFixed(4)}</strong> ± ${confidence[1].toFixed(4)}</td>
                <td class="${changeColor}">${change !== 'N/A' ? change + '%' : 'N/A'}</td>
            </tr>
        `;
    }
    
    paramsTableHTML += `</tbody></table>`;
    
    // HTML completo del banner
    banner.innerHTML = `
        <div class="alert alert-${fitColor}" style="margin: 0;">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h5 class="mb-1">${fitIcon} Optimización completada - Estrategia: ${strategyName}</h5>
                    <p class="mb-0 small">
                        <strong>Tiempo:</strong> ${result.optimization_time.toFixed(2)} s | 
                        <strong>Iteraciones:</strong> ${result.iterations}
                    </p>
                </div>
                <span class="badge bg-${fitColor}" style="font-size: 1em; padding: 8px 12px;">
                    ${fitQuality}
                </span>
            </div>
            
            ${strategyDetailsHTML}
            
            <!-- COMPARACIÓN ANTES/DESPUÉS -->
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>📊 Comparación de métricas</strong>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6 class="text-danger">❌ ANTES de optimización</h6>
                            <ul class="list-unstyled small mb-0">
                                <li><strong>χ²:</strong> ${result.initial_metrics.chi_squared.toFixed(2)}</li>
                                <li><strong>χ² reducido:</strong> ${result.initial_metrics.chi_squared_reduced.toFixed(4)}</li>
                                <li><strong>RMSE Ψ:</strong> ${result.initial_metrics.rmse_psi.toFixed(3)}°</li>
                                <li><strong>RMSE Δ:</strong> ${result.initial_metrics.rmse_delta.toFixed(3)}°</li>
                            </ul>
                        </div>
                        
                        <div class="col-md-6">
                            <h6 class="text-success">✅ DESPUÉS de optimización</h6>
                            <ul class="list-unstyled small mb-0">
                                <li><strong>χ²:</strong> ${gof.chi_squared.toFixed(2)}</li>
                                <li><strong>χ² reducido:</strong> ${gof.chi_squared_reduced.toFixed(4)}</li>
                                <li><strong>RMSE Ψ:</strong> ${gof.rmse_psi.toFixed(3)}°</li>
                                <li><strong>RMSE Δ:</strong> ${gof.rmse_delta.toFixed(3)}°</li>
                            </ul>
                        </div>
                    </div>
                    
                    <hr class="my-2">
                    
                    <div class="alert alert-success mb-0" style="padding: 8px;">
                        <strong>📈 Mejora:</strong> ${result.improvement_percentage.toFixed(2)}% 
                        (χ²ᵣ: ${result.initial_metrics.chi_squared_reduced.toFixed(2)} → ${gof.chi_squared_reduced.toFixed(2)})
                    </div>
                </div>
            </div>
            
            <!-- PARÁMETROS OPTIMIZADOS -->
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <strong>🔧 Parámetros optimizados</strong>
                </div>
                <div class="card-body" style="padding: 1rem;">
                    ${paramsTableHTML}
                </div>
            </div>
            
            ${getQualityMessage(chiSqReduced)}
            
            <!-- BOTONES -->
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-outline-secondary" onclick="downloadOptimizedResults()">
                    📥 Descargar resultados
                </button>
                <button class="btn btn-outline-warning" onclick="showOptimizationStrategyModal()">
                    🔄 Optimizar nuevamente
                </button>
            </div>
        </div>
    `;
    
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // ✅ ACTUALIZAR GRÁFICAS AUTOMÁTICAMENTE (sin botón)
    setTimeout(() => {
        updateGraphsWithOptimized();
        
        // Scroll a las gráficas
        document.getElementById('psiPlot').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }, 800);
}

// ==========================================
// MODIFICAR startOptimization() ORIGINAL
// ==========================================

/**
 * Inicia el proceso de optimización (MODIFICADO)
 * Ahora abre el modal de selección de estrategia
 */
function startOptimization() {
    // Verificaciones previas
    if (isOptimizing) {
        alert('Ya hay una optimización en progreso');
        return;
    }
    
    if (!savedModel) {
        alert('Error: No hay modelo óptico guardado. Por favor, guarda el modelo primero.');
        return;
    }
    
    if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
        alert('Error: No hay datos experimentales cargados');
        return;
    }
    
    if (!theoreticalPsi || theoreticalPsi.length === 0) {
        alert('Error: Primero debes calcular los valores teóricos');
        return;
    }
    
    const paramsToOptimize = collectParametersToOptimize();
    
    if (paramsToOptimize.length === 0) {
        alert('No hay parámetros marcados para optimizar.\n\nPor favor marca al menos un parámetro en el modelo óptico.');
        return;
    }
    
    // Mostrar modal de selección de estrategia
    showOptimizationStrategyModal();
}

/**
 * Ejecuta optimización SIMULTÁNEA con el algoritmo seleccionado
 */
async function executeOptimizationWithAdvancedSettings(advancedConfig = {}) {
    try {
        // Validaciones previas (igual que antes)
        if (!savedModel) {
            alert('Error: No hay modelo óptico guardado.');
            return;
        }
        
        if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
            alert('Error: No hay datos experimentales cargados');
            return;
        }
        
        if (!theoreticalPsi || theoreticalPsi.length === 0) {
            alert('Error: Primero debes calcular los valores teóricos');
            return;
        }
        
        const paramsToOptimize = collectParametersToOptimize();
        
        if (paramsToOptimize.length === 0) {
            alert('No hay parámetros marcados para optimizar.');
            return;
        }
        
        console.log('🔧 Configuración avanzada:', advancedConfig);
        
        // Mostrar progreso
        showOptimizationProgress();
        isOptimizing = true;
        
        // ✅ REQUEST CON PARÁMETROS AVANZADOS
        const requestData = {
            psi_exp: uploadedPsi,
            delta_exp: uploadedDelta,
            wavelengths: uploadedWavelengths,
            optical_model: {
                global: {
                    angle: savedModel.global.angle,
                    polarization: savedModel.global.polarization,
                    wavelength_mode: savedModel.global.wavelength_mode,
                    ...(savedModel.global.wavelength_mode === 'file' && {
                        wavelengths: savedModel.global.wavelengths
                    }),
                    ...(savedModel.global.wavelength_mode === 'range' && {
                        wl_from: savedModel.global.wl_from,
                        wl_to: savedModel.global.wl_to,
                        wl_steps: savedModel.global.wl_steps
                    }),
                    ...(savedModel.global.wavelength_mode === 'single' && {
                        wl_single: savedModel.global.wl_single
                    })
                },
                ambient: savedModel.ambient,
                substrate: savedModel.substrate,
                layers: savedModel.layers
            },
            params_to_optimize: paramsToOptimize,
            algorithm: advancedConfig.algorithm || 'levenberg_marquardt',
            strategy: 'simultaneous',
            
            // ⭐ NUEVOS PARÁMETROS OPCIONALES
            sigma_psi: advancedConfig.sigma_psi || null,  // null = usar default del backend
            sigma_delta: advancedConfig.sigma_delta || null,
            use_tikhonov_regularization: advancedConfig.use_tikhonov_regularization || false,
            lambda_reg: advancedConfig.lambda_reg || 1e-4
        };
        
        console.log('📤 Enviando request:', requestData);
        
        // Llamar al backend
        const response = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (!result.success) {
            throw new Error(result.message || 'Optimización no convergió');
        }
        
        console.log('✅ Optimización completada');
        
        // Guardar resultados
        optimizationResults = result;
        theoreticalPsi = result.psi_theoretical;
        theoreticalDelta = result.delta_theoretical;
        
        // Mostrar resultados
        showOptimizationResults(result);
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert(`Error durante la optimización:\n\n${error.message}`);
        hideOptimizationProgress();
    } finally {
        isOptimizing = false;
    }
}
/**
 * Muestra resultados con información del algoritmo usado
 */
function showOptimizationResultsWithAlgorithm(result) {
    const algorithmNames = {
        'levenberg_marquardt': 'Levenberg-Marquardt',
        'simplex': 'Simplex (Nelder-Mead)'
    };
    
    const algorithmName = algorithmNames[result.algorithm] || result.algorithm;
    
    // Determinar calidad basada en chi cuadrado reducido
    const chiSquaredReduced = result.final_metrics.chi_squared_reduced;
    let qualityBadge = '';
    let qualityClass = '';
    
    if (chiSquaredReduced < 1.5) {
        qualityBadge = 'EXCELENTE';
        qualityClass = 'success';
    } else if (chiSquaredReduced < 3.0) {
        qualityBadge = 'BUENO';
        qualityClass = 'primary';
    } else if (chiSquaredReduced < 5.0) {
        qualityBadge = 'ACEPTABLE';
        qualityClass = 'warning';
    } else {
        qualityBadge = 'INADECUADO';
        qualityClass = 'danger';
    }
    
    let resultsHTML = `
        <div class="card border-${qualityClass} shadow-sm">
            <div class="card-header bg-${qualityClass} text-white">
                <h5 class="mb-0">
                    <i class="fas fa-chart-line me-2"></i>
                    Resultados de Optimización
                    <span class="badge bg-light text-${qualityClass} ms-2">${qualityBadge}</span>
                </h5>
                <small>Algoritmo: ${algorithmName}</small>
            </div>
            <div class="card-body">
                <!-- Parámetros Optimizados -->
                <h6 class="border-bottom pb-2 mb-3">
                    <i class="fas fa-sliders-h me-2"></i>Parámetros Optimizados
                </h6>
                <div class="table-responsive mb-4">
                    <table class="table table-sm table-hover">
                        <thead class="table-light">
                            <tr>
                                <th>Parámetro</th>
                                <th>Valor Inicial</th>
                                <th>Valor Optimizado</th>
                                ${result.confidence_intervals ? '<th>Incertidumbre (±σ)</th>' : ''}
                                <th>Cambio</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    // Agregar filas de parámetros
    for (const [paramName, optimizedValue] of Object.entries(result.optimized_params)) {
        const paramInfo = result.params_to_optimize ?
            result.params_to_optimize.find(p => p.name === paramName) : null;
        
        const initialValue = paramInfo ? paramInfo.initial_value : '-';
        const change = paramInfo ?
            ((optimizedValue - paramInfo.initial_value) / paramInfo.initial_value * 100).toFixed(2) + '%' :
            '-';
        
        // Incertidumbre (solo para LM)
        let uncertaintyCell = '';
        if (result.confidence_intervals && result.confidence_intervals[paramName]) {
            const uncertainty = result.confidence_intervals[paramName][1];
            uncertaintyCell = `<td class="text-muted">±${uncertainty.toFixed(6)}</td>`;
        }
        
        resultsHTML += `
            <tr>
                <td><strong>${formatParamName(paramName)}</strong></td>
                <td>${typeof initialValue === 'number' ? initialValue.toFixed(6) : initialValue}</td>
                <td class="text-primary"><strong>${optimizedValue.toFixed(6)}</strong></td>
                ${uncertaintyCell}
                <td class="${parseFloat(change) > 0 ? 'text-success' : 'text-danger'}">${change}</td>
            </tr>
        `;
    }
    
    resultsHTML += `
                        </tbody>
                    </table>
                </div>
                
                <!-- Comparación de Métricas -->
                <h6 class="border-bottom pb-2 mb-3">
                    <i class="fas fa-chart-bar me-2"></i>Comparación de Métricas
                </h6>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <div class="card bg-light">
                            <div class="card-body">
                                <h6 class="text-muted mb-3">ANTES</h6>
                                <table class="table table-sm mb-0">
                                    <tr>
                                        <td>χ²:</td>
                                        <td class="text-end"><strong>${result.initial_metrics.chi_squared.toFixed(4)}</strong></td>
                                    </tr>
                                    <tr>
                                        <td>χ²ᵣ:</td>
                                        <td class="text-end"><strong>${result.initial_metrics.chi_squared_reduced.toFixed(4)}</strong></td>
                                    </tr>
                                    <tr>
                                        <td>RMSE Ψ:</td>
                                        <td class="text-end">${result.initial_metrics.rmse_psi.toFixed(4)}°</td>
                                    </tr>
                                    <tr>
                                        <td>RMSE Δ:</td>
                                        <td class="text-end">${result.initial_metrics.rmse_delta.toFixed(4)}°</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card bg-success bg-opacity-10 border-success">
                            <div class="card-body">
                                <h6 class="text-success mb-3">DESPUÉS</h6>
                                <table class="table table-sm mb-0">
                                    <tr>
                                        <td>χ²:</td>
                                        <td class="text-end"><strong>${result.final_metrics.chi_squared.toFixed(4)}</strong></td>
                                    </tr>
                                    <tr>
                                        <td>χ²ᵣ:</td>
                                        <td class="text-end"><strong class="text-${qualityClass}">${result.final_metrics.chi_squared_reduced.toFixed(4)}</strong></td>
                                    </tr>
                                    <tr>
                                        <td>RMSE Ψ:</td>
                                        <td class="text-end">${result.final_metrics.rmse_psi.toFixed(4)}°</td>
                                    </tr>
                                    <tr>
                                        <td>RMSE Δ:</td>
                                        <td class="text-end">${result.final_metrics.rmse_delta.toFixed(4)}°</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Información Adicional -->
                <div class="alert alert-info">
                    <strong><i class="fas fa-info-circle me-2"></i>Información de Optimización:</strong>
                    <ul class="mb-0 mt-2">
                        <li>Mejora: <strong>${result.improvement_percentage.toFixed(2)}%</strong></li>
                        <li>Iteraciones: <strong>${result.iterations || 'N/A'}</strong></li>
                        <li>Tiempo: <strong>${result.optimization_time ? result.optimization_time.toFixed(2) + ' s' : 'N/A'}</strong></li>
                        <li>Mensaje: ${result.message || 'Optimización completada'}</li>
                    </ul>
                </div>
                
                <!-- Botones de Acción -->
                <div class="d-grid gap-2 d-md-flex justify-content-md-end">
                    <button class="btn btn-outline-primary" onclick="downloadOptimizedResults()">
                        <i class="fas fa-download me-2"></i>Descargar Resultados
                    </button>
                    <button class="btn btn-primary" onclick="showOptimizationStrategyModal()">
                        <i class="fas fa-redo me-2"></i>Optimizar Nuevamente
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const container = document.getElementById('optimizationResults');
    if (container) {
        container.innerHTML = resultsHTML;
        
        // Actualizar gráficos después de un breve delay
        setTimeout(() => {
            updateGraphsWithOptimized();
        }, 800);
    }
}

/**
 * Inicia el proceso de optimización (SIMPLIFICADO)
 */
function startOptimization() {
    // Verificaciones previas
    if (isOptimizing) {
        alert('Ya hay una optimización en progreso');
        return;
    }
    
    if (!savedModel) {
        alert('Error: No hay modelo óptico guardado.');
        return;
    }
    
    if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
        alert('Error: No hay datos experimentales cargados');
        return;
    }
    
    if (!theoreticalPsi || theoreticalPsi.length === 0) {
        alert('Error: Primero debes calcular los valores teóricos');
        return;
    }
    
    const paramsToOptimize = collectParametersToOptimize();
    
    if (paramsToOptimize.length === 0) {
        alert('No hay parámetros marcados para optimizar.\n\nPor favor marca al menos un parámetro en el modelo óptico.');
        return;
    }
    
    // Mostrar modal de selección de ALGORITMO
    showOptimizationStrategyModal();
}

/**
 * NUEVA FUNCIÓN: Mostrar modal de configuración avanzada
 */
function showAdvancedOptimizationSettings() {
    const modalHTML = `
        <div class="modal fade" id="advancedOptModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">⚙️ Configuración Avanzada de Optimización</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Incertidumbres experimentales -->
                        <h6 class="border-bottom pb-2 mb-3">Incertidumbres Experimentales</h6>
                        
                        <div class="mb-3">
                            <label class="form-label">σ<sub>ψ</sub> (incertidumbre en Psi, grados)</label>
                            <input type="number" class="form-control" id="sigma-psi" 
                                   value="0.01" step="0.001" min="0.001">
                            <small class="text-muted">Típico: 0.01° para elipsómetros comerciales</small>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">σ<sub>Δ</sub> (incertidumbre en Delta, grados)</label>
                            <input type="number" class="form-control" id="sigma-delta" 
                                   value="0.1" step="0.01" min="0.01">
                            <small class="text-muted">Típico: 0.1° para elipsómetros comerciales</small>
                        </div>
                        
                        <hr>
                        
                        <!-- Regularización (opcional) -->
                        <h6 class="border-bottom pb-2 mb-3">Regularización (Opcional)</h6>
                        
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" id="use-tikhonov">
                            <label class="form-check-label" for="use-tikhonov">
                                Activar regularización de Tikhonov
                            </label>
                        </div>
                        
                        <div class="mb-3" id="tikhonov-config" style="display: none;">
                            <label class="form-label">λ (factor de regularización)</label>
                            <input type="number" class="form-control" id="lambda-reg" 
                                   value="0.0001" step="0.0001" min="0.00001">
                            <small class="text-muted">
                                Útil para estabilizar parámetros correlacionados (Drude-Lorentz).
                                Mayor λ = mayor estabilización pero menor precisión.
                            </small>
                        </div>
                        
                        <div class="alert alert-info small">
                            <strong>💡 Cuándo usar regularización:</strong>
                            <ul class="mb-0 mt-1">
                                <li>Modelos Drude-Lorentz con múltiples osciladores</li>
                                <li>Cuando los parámetros están altamente correlacionados</li>
                                <li>Si la optimización diverge o da valores no físicos</li>
                            </ul>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="confirmAdvancedSettings()">
                            ✓ Confirmar y Optimizar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal anterior si existe
    const oldModal = document.getElementById('advancedOptModal');
    if (oldModal) oldModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Event listener para mostrar/ocultar configuración de Tikhonov
    document.getElementById('use-tikhonov').addEventListener('change', function() {
        document.getElementById('tikhonov-config').style.display = 
            this.checked ? 'block' : 'none';
    });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('advancedOptModal'));
    modal.show();
}

/**
 * Confirma configuración avanzada y ejecuta optimización
 */
function confirmAdvancedSettings() {
    // Obtener valores del modal
    const sigmaPsi = parseFloat(document.getElementById('sigma-psi').value);
    const sigmaDelta = parseFloat(document.getElementById('sigma-delta').value);
    const useTikhonov = document.getElementById('use-tikhonov').checked;
    const lambdaReg = parseFloat(document.getElementById('lambda-reg').value);
    
    // Cerrar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('advancedOptModal'));
    modal.hide();
    
    // Ejecutar optimización con configuración avanzada
    executeOptimizationWithAdvancedSettings({
        sigma_psi: sigmaPsi,
        sigma_delta: sigmaDelta,
        use_tikhonov_regularization: useTikhonov,
        lambda_reg: lambdaReg
    });
}

// ========================================
// FIX DEFINITIVO: Eliminar botón duplicado
// ========================================
(function() {
    // Desactivar función inmediatamente
    window.checkAndShowOptimizeButton = function() {
        console.log('⚠️ checkAndShowOptimizeButton() desactivada - el botón está en el banner');
    };
    
    // Remover cualquier botón duplicado que ya exista
    const removeExistingButton = () => {
        const duplicateBtn = document.getElementById('btn-proceed-optimize');
        if (duplicateBtn) {
            console.log('🗑️ Removiendo botón duplicado existente');
            duplicateBtn.remove();
        }
    };
    
    // Ejecutar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeExistingButton);
    } else {
        removeExistingButton();
    }
    
    // Observer para eliminar el botón si aparece dinámicamente
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.id === 'btn-proceed-optimize') {
                    console.log('🗑️ Botón duplicado detectado y removido');
                    node.remove();
                }
                if (node.querySelector && node.querySelector('#btn-proceed-optimize')) {
                    const btn = node.querySelector('#btn-proceed-optimize');
                    console.log('🗑️ Botón duplicado en nodo hijo detectado y removido');
                    btn.remove();
                }
            });
        });
    });
    
    // Observar el body completo
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();

// ============================================================
// FUNCIÓN: calculateEffectiveNK - VERSIÓN CORREGIDA
// 
// INSTRUCCIONES:
// 1. Busca la función calculateEffectiveNK en tu app.js
// 2. ELIMÍNALA completamente (desde "async function calculateEffectiveNK" 
//    hasta su llave de cierre "}")
// 3. Pega este código en su lugar
// ============================================================

/**
 * Calcula n,k efectivos para un medio EMT
 * @param {string} mediumType - 'ambient', 'substrate', o 'layer'
 * @param {number|null} layerIndex - Índice de la capa (solo si mediumType='layer')
 */
async function calculateEffectiveNK(mediumType, layerIndex = null) {
    console.log(`🧮 calculateEffectiveNK llamado: ${mediumType}, layerIndex=${layerIndex}`);
    
    let button;
    let container;
    let emtComponentsContainer;
    let emtModelSelect;
    
    try {
        // ==========================================
        // 1. IDENTIFICAR CONTENEDORES
        // ==========================================
        
        if (mediumType === 'ambient') {
            container = document.getElementById('ambient-emt-config');
            emtComponentsContainer = document.getElementById('ambient-emt-components');
            emtModelSelect = document.getElementById('ambient-emt-model');
            button = container?.querySelector('.calculate-emt-btn, [onclick*="calculateEffectiveNK"]');
            
            if (container && container.style.display === 'none') {
                container.style.display = 'block';
            }
            
        } else if (mediumType === 'substrate') {
            container = document.getElementById('substrate-emt-config');
            emtComponentsContainer = document.getElementById('substrate-emt-components');
            emtModelSelect = document.getElementById('substrate-emt-model');
            button = container?.querySelector('.calculate-emt-btn, [onclick*="calculateEffectiveNK"]');
            
            if (container && container.style.display === 'none') {
                container.style.display = 'block';
            }
            
        } else if (mediumType === 'layer') {
            // Para capas, buscar por índice
            const layerCard = document.querySelector(`.layer-card[data-layer-index="${layerIndex}"], .layer-card[data-idx="${layerIndex}"]`);
            if (!layerCard) {
                throw new Error(`No se encontró la capa con índice ${layerIndex}`);
            }
            container = layerCard.querySelector('.emt-config, .heterogeneous-config');
            emtComponentsContainer = layerCard.querySelector('.emt-components-container, .layer-emt-components');
            emtModelSelect = layerCard.querySelector('.emt-model-select, [id*="emt-model"]');
            button = layerCard.querySelector('.calculate-emt-btn, .calculate-layer-emt-btn, [onclick*="calculateEffectiveNK"]');
        }
        
        // Validar contenedor
        if (!emtComponentsContainer) {
            throw new Error(`No se encontró el contenedor de componentes EMT para ${mediumType}`);
        }
        
        // ==========================================
        // 2. MOSTRAR ESTADO "CALCULANDO..."
        // ==========================================
        
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Calculando...';
        }
        
        // Limpiar mensajes anteriores
        if (container) {
            container.querySelectorAll('.emt-result-display, .emt-error-display').forEach(el => el.remove());
        }
        
        // ==========================================
        // 3. RECOPILAR DATOS DE COMPONENTES
        // ==========================================
        
        const components = [];
        const componentCards = emtComponentsContainer.querySelectorAll('.medium-emt-component, .emt-component, .component-card');
        
        console.log(`  Componentes encontrados: ${componentCards.length}`);
        
        if (componentCards.length < 2) {
            throw new Error('Se requieren al menos 2 componentes para EMT');
        }
        
        let totalFraction = 0;
        
        for (const card of componentCards) {
            const compData = {};
            
            // Nombre
            const nameInput = card.querySelector('.medium-component-name, .component-name, input[placeholder*="nombre"]');
            compData.name = nameInput?.value || 'Componente';
            
            // Fracción
            const fractionInput = card.querySelector('.medium-component-fraction, .component-fraction, input[type="number"]');
            compData.fraction = parseFloat(fractionInput?.value) || 0;
            totalFraction += compData.fraction;
            
            // Modelo de dispersión
            const modelSelect = card.querySelector('.medium-component-model, .component-model, select');
            compData.model = modelSelect?.value || 'constant';
            
            console.log(`  Componente: ${compData.name}, f=${compData.fraction}, modelo=${compData.model}`);
            
            // Obtener datos ópticos según el modelo
            if (compData.model === 'constant') {
                const nInput = card.querySelector('.medium-comp-n, .component-n, input[placeholder*="n"]');
                const kInput = card.querySelector('.medium-comp-k, .component-k, input[placeholder*="k"]');
                compData.n = parseFloat(nInput?.value) || 1.5;
                compData.k = parseFloat(kInput?.value) || 0;
                
            } else if (compData.model === 'file_nk' || compData.model === 'file_epsilon' || compData.model === 'file') {
                const opticalDataStr = card.dataset.opticalData || card.dataset.fileData;
                
                if (opticalDataStr) {
                    try {
                        compData.optical_data = JSON.parse(opticalDataStr);
                    } catch (e) {
                        throw new Error(`Error en datos ópticos del componente "${compData.name}"`);
                    }
                } else {
                    const componentIndex = Array.from(componentCards).indexOf(card);
                    const globalDataKey = `${mediumType}_component_${componentIndex}_optical_data`;
                    
                    if (window[globalDataKey]) {
                        compData.optical_data = window[globalDataKey];
                    } else {
                        throw new Error(`El componente "${compData.name}" requiere un archivo de datos ópticos cargado`);
                    }
                }
                
            } else {
                // Modelos de dispersión (Cauchy, Sellmeier, etc.)
                compData.params = {};
                const paramInputs = card.querySelectorAll('input[data-param], .dispersion-param');
                paramInputs.forEach(inp => {
                    const paramName = inp.dataset.param || inp.name;
                    if (paramName) {
                        compData.params[paramName] = parseFloat(inp.value) || 0;
                    }
                });
            }
            
            components.push(compData);
        }
        
        // ==========================================
        // 4. VALIDAR SUMA DE FRACCIONES
        // ==========================================
        
        totalFraction = Math.round(totalFraction * 1000) / 1000;
        
        if (Math.abs(totalFraction - 1.0) > 0.01) {
            throw new Error(`La suma de fracciones debe ser 1.0 (actual: ${totalFraction.toFixed(3)})`);
        }
        
        // ==========================================
        // 5. OBTENER LONGITUDES DE ONDA
        // ==========================================
        
        let wavelengths = [];
        
        if (typeof uploadedWavelengths !== 'undefined' && uploadedWavelengths.length > 0) {
            wavelengths = uploadedWavelengths;
        } else if (typeof experimentalData !== 'undefined' && experimentalData.wavelengths) {
            wavelengths = experimentalData.wavelengths;
        } else {
            const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;
            
            if (wlMode === 'range') {
                const wlFrom = parseFloat(document.getElementById('input-wl-from')?.value) || 300;
                const wlTo = parseFloat(document.getElementById('input-wl-to')?.value) || 800;
                const wlSteps = parseInt(document.getElementById('input-wl-steps')?.value) || 51;
                
                const step = (wlTo - wlFrom) / (wlSteps - 1);
                for (let i = 0; i < wlSteps; i++) {
                    wavelengths.push(wlFrom + i * step);
                }
                
            } else if (wlMode === 'single') {
                const wlSingle = parseFloat(document.getElementById('input-wl-single')?.value) || 550;
                wavelengths = [wlSingle];
                
            } else {
                // Rango por defecto
                for (let wl = 300; wl <= 800; wl += 10) {
                    wavelengths.push(wl);
                }
            }
        }
        
        // ==========================================
        // 6. OBTENER MODELO EMT
        // ==========================================
        
        const emtModel = emtModelSelect?.value || 'bruggeman';
        
        // ==========================================
        // 7. ENVIAR AL BACKEND
        // ==========================================
        
        const requestData = {
            emt_model: emtModel,
            components: components,
            wavelengths: wavelengths
        };
        
        if (emtModel === 'maxwell-garnett') {
            const hostSelect = container?.querySelector('.emt-host-select, #emt-host-index');
            requestData.host_index = parseInt(hostSelect?.value) || 0;
        }
        
        console.log('📤 Enviando al backend /api/calculate-emt...');
        
        const response = await fetch('/api/calculate-emt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Error del servidor: ${response.status}`);
        }
        
        console.log('✅ Cálculo EMT completado');
        
        // ==========================================
        // 8. GUARDAR RESULTADOS
        // ==========================================
        
        if (container) {
            container.dataset.emtCalculated = 'true';
            container.dataset.nEffective = JSON.stringify(result.n_effective);
            container.dataset.kEffective = JSON.stringify(result.k_effective);
            container.dataset.wavelengthsEffective = JSON.stringify(result.wavelengths);
        }
        
        const globalKey = mediumType === 'layer' 
            ? `layer_${layerIndex}_emt_result`
            : `${mediumType}_emt_result`;
        
        window[globalKey] = {
            n_effective: result.n_effective,
            k_effective: result.k_effective,
            wavelengths: result.wavelengths,
            statistics: result.statistics
        };
        
        // ==========================================
        // 9. MOSTRAR RESULTADOS EN UI
        // ==========================================
        
        const stats = result.statistics;
        
        const resultHTML = `
            <div class="emt-result-display alert alert-success mt-3">
                <h6 class="alert-heading mb-2">
                    <i class="bi bi-check-circle-fill me-2"></i>
                    ✅ Propiedades ópticas efectivas calculadas
                </h6>
                <hr class="my-2">
                <div class="row small">
                    <div class="col-6">
                        <strong>n<sub>eff</sub>:</strong> ${stats.n_min.toFixed(4)} - ${stats.n_max.toFixed(4)}
                    </div>
                    <div class="col-6">
                        <strong>k<sub>eff</sub>:</strong> ${stats.k_min.toFixed(6)} - ${stats.k_max.toFixed(6)}
                    </div>
                </div>
                <div class="small text-muted mt-1">
                    ${result.wavelengths.length} puntos | λ: ${Math.min(...result.wavelengths).toFixed(0)}-${Math.max(...result.wavelengths).toFixed(0)} nm
                </div>
            </div>
        `;
        
        if (container) {
            if (button) {
                button.insertAdjacentHTML('afterend', resultHTML);
            } else {
                container.insertAdjacentHTML('beforeend', resultHTML);
            }
        }
        
        // ==========================================
        // 10. RESTAURAR BOTÓN
        // ==========================================
        
        if (button) {
            button.disabled = false;
            button.innerHTML = '✅ Recalcular n,k efectivos';
            button.classList.remove('btn-warning');
            button.classList.add('btn-success');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error en calculateEffectiveNK:', error);
        
        const errorHTML = `
            <div class="emt-error-display alert alert-danger mt-3">
                <h6 class="alert-heading mb-1">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    ❌ Error en cálculo EMT
                </h6>
                <p class="mb-0 small">${error.message}</p>
            </div>
        `;
        
        if (container) {
            container.querySelectorAll('.emt-error-display').forEach(el => el.remove());
            
            if (button) {
                button.insertAdjacentHTML('afterend', errorHTML);
                button.disabled = false;
                button.innerHTML = '🧮 Calcular n,k efectivos';
            } else {
                container.insertAdjacentHTML('beforeend', errorHTML);
            }
        } else {
            alert(`Error: ${error.message}`);
        }
        
        throw error;
    }
}

// Hacer la función global
window.calculateEffectiveNK = calculateEffectiveNK;

console.log('✅ Función calculateEffectiveNK cargada correctamente');

// ==========================================
// FIX: Event delegation para botón Guardar Modelo
// Reemplaza el listener existente que solo funciona en el paso 1
// ==========================================

// Remover listener anterior si existe (no podemos, pero podemos sobrescribir)
document.addEventListener('click', async function(e) {
    // Verificar si el click fue en un botón de guardar modelo
    const saveBtn = e.target.closest('.wizard-save-btn');
    
    if (!saveBtn) return; // No es el botón que buscamos
    
    // Evitar múltiples clicks
    if (saveBtn.disabled) return;
    
    console.log('🔘 Botón Guardar Modelo clickeado (event delegation)');
    
    saveBtn.disabled = true;
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
    
    // Obtener el errorDiv del paso actual
    const currentStepElement = document.querySelector('.wizard-step[style*="display: block"]') || 
                               document.querySelector('.wizard-step:not([style*="display: none"])');
    const errorDiv = currentStepElement?.querySelector('.wizard-step-footer .text-danger') || 
                    document.getElementById('wizard-error');
    
    try {
        const model = { 
            global: {}, 
            ambient: {}, 
            substrate: {}, 
            layers: [],
            created_at: new Date().toISOString()
        };
        
        // ==========================================
        // RECOPILAR CONFIGURACIÓN GLOBAL
        // ==========================================
        model.global.angle = Number(document.getElementById("input-angle").value);
        model.global.polarization = 'both'; 
        
        const wlModeElement = document.querySelector('input[name="wl-option"]:checked');
        const wlMode = wlModeElement ? wlModeElement.value : 'file';
        model.global.wavelength_mode = wlMode;
        
        if (wlMode === "range") {
            model.global.wl_from = Number(document.getElementById("input-wl-from").value);
            model.global.wl_to = Number(document.getElementById("input-wl-to").value);
            model.global.wl_steps = Number(document.getElementById("input-wl-steps").value);
        } else if (wlMode === "single") {
            model.global.wl_single = Number(document.getElementById("input-wl-single").value);
        } else if (wlMode === "file") {
            model.global.wavelengths = window.uploadedWavelengths || [];
        }

        console.log('📋 Configuración global:', model.global);

        // ==========================================
        // RECOPILAR DATOS DE AMBIENTE Y SUSTRATO
        // ==========================================
        console.log('🌍 Recopilando datos del ambiente...');
        if (typeof collectMediumData === 'function') {
            model.ambient = await collectMediumData('ambient');
        }
        
        console.log('🏔️ Recopilando datos del sustrato...');
        if (typeof collectMediumData === 'function') {
            model.substrate = await collectMediumData('substrate');
        }

        // ==========================================
        // RECOPILAR DATOS DE CAPAS
        // ==========================================
        console.log('📚 Recopilando datos de capas...');
        const layersContainer = document.getElementById('layers-container');
        
        if (layersContainer && typeof collectLayerData === 'function') {
            for (const layerEl of layersContainer.children) {
                const layerData = await collectLayerData(layerEl);
                model.layers.push(layerData);
            }
        }
        
        console.log(`✅ ${model.layers.length} capas recopiladas`);

        // ==========================================
        // GUARDAR EN VARIABLE GLOBAL
        // ==========================================
        currentOpticalModel = model;
        savedModel = model;
        console.log('💾 Modelo guardado en variable global');

        // ==========================================
        // ENVIAR AL SERVIDOR
        // ==========================================
        console.log('📤 Enviando modelo al servidor...');
        
        const response = await fetch("/api/save-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(model)
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        // ==========================================
        // ÉXITO - CERRAR MODAL Y MOSTRAR BANNER
        // ==========================================
        savedModel = model;
        savedModel.filename = result.filename;
        
        // Cerrar modal
        const modalElement = document.getElementById('modelWizardModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            modalInstance.hide();
        }
        
        // Mostrar banner de modelo guardado
        if (typeof updateModelSavedBanner === 'function') {
            updateModelSavedBanner(savedModel, result.filename);
        } else {
            // Fallback: mostrar banner simple
            const bannerDiv = document.getElementById('model-saved-banner');
            if (bannerDiv) {
                bannerDiv.style.display = 'block';
                bannerDiv.innerHTML = `
                    <div class="alert alert-success">
                        <strong>✅ Modelo guardado exitosamente</strong>
                        <p class="mb-0">Archivo: ${result.filename}</p>
                    </div>
                `;
            }
        }
        
        console.log("✅ Modelo guardado exitosamente:", result.filename);
        
    } catch (error) {
        console.error('❌ Error al guardar modelo:', error);
        
        if (errorDiv) {
            errorDiv.innerText = "Error al guardar: " + error.message;
            errorDiv.style.display = "block";
        } else {
            alert("Error al guardar modelo: " + error.message);
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
});

console.log('✅ Fix de event delegation para botón Guardar cargado');


// ⭐ Event listeners para cambio de tipo de sustrato
document.addEventListener('change', (e) => {
    if (e.target.name === 'substrate-type') {
        updateSubstrateTypeInterface(e.target.value);
    }
    if (e.target.name === 'ambient-type') {
        updateAmbientTypeInterface(e.target.value);
    }
});

// ⭐ Event listener para cambio de modelo del sustrato
document.addEventListener('change', (e) => {
    if (e.target.id === 'substrate-model') {
        const substrateTypeChecked = document.querySelector('input[name="substrate-type"]:checked');
        if (substrateTypeChecked && substrateTypeChecked.value === 'homogeneous') {
            updateMediumFieldsEnhanced('substrate', e.target.value);
        }
    }
    if (e.target.id === 'ambient-model') {
        const ambientTypeChecked = document.querySelector('input[name="ambient-type"]:checked');
        if (ambientTypeChecked && ambientTypeChecked.value === 'homogeneous') {
            updateMediumFieldsEnhanced('ambient', e.target.value);
        }
    }
});

// ⭐ Event delegation para cambio de modelo del sustrato (funciona con modales)
document.addEventListener('change', function(e) {
    if (e.target.id === 'substrate-model') {
        const modelValue = e.target.value;
        console.log(`🔄 Sustrato modelo cambiado a: ${modelValue}`);
        
        const constantField = document.getElementById('substrate-constant-field');
        const paramsDiv = document.getElementById('substrate-params');
        const fileUpload = document.getElementById('substrate-file-upload');
        const customEq = document.getElementById('substrate-custom-eq');
        
        // Ocultar todo primero
        if (constantField) constantField.style.display = 'none';
        if (paramsDiv) paramsDiv.innerHTML = '';
        if (fileUpload) fileUpload.style.display = 'none';
        if (customEq) customEq.style.display = 'none';
        
        // Mostrar según el modelo seleccionado
        if (modelValue === 'constant' || modelValue === 'glass' || modelValue === 'si') {
            if (constantField) {
                constantField.style.display = 'block';
                const nInput = document.getElementById('substrate-n-constant');
                const kInput = document.getElementById('substrate-k-constant');
                if (modelValue === 'glass') {
                    if (nInput) nInput.value = '1.52';
                    if (kInput) kInput.value = '0';
                } else if (modelValue === 'si') {
                    if (nInput) nInput.value = '3.87';
                    if (kInput) kInput.value = '0.02';
                }
            }
        } else if (modelValue === 'file_nk' || modelValue === 'file_epsilon') {
            if (fileUpload) {
                fileUpload.style.display = 'block';
                const fileHelp = document.getElementById('substrate-file-help');
                if (fileHelp) {
                    fileHelp.textContent = modelValue === 'file_epsilon'
                        ? 'Archivo con columnas: omega, epsilon1, epsilon2'
                        : 'Archivo con columnas: wavelength, n, k';
                }
            }
        } else if (modelValue === 'custom') {
            if (customEq) customEq.style.display = 'block';
        } else {
            // Modelos de dispersión (cauchy, sellmeier, drude, etc.)
            updateMediumFieldsEnhanced('substrate', modelValue);
        }
    }
});

// ============================================================================
// ⭐ EVENT DELEGATION PARA ELEMENTOS DENTRO DEL MODAL
// ============================================================================
// Estos elementos están dentro del modal y no existen cuando el script carga.
// Usamos event delegation desde document para capturar los eventos.
// ============================================================================


document.addEventListener('change', function(e) {
    // Selector de modelo del SUSTRATO
    if (e.target && e.target.id === 'substrate-model') {
        handleSubstrateModelChange(e.target.value);
    }
    
    // Selector de modelo del AMBIENTE
    if (e.target && e.target.id === 'ambient-model') {
        handleAmbientModelChange(e.target.value);
    }
    
    // Radio buttons de tipo de sustrato (homogéneo/EMT)
    if (e.target && e.target.name === 'substrate-type') {
        updateSubstrateTypeInterface(e.target.value);
    }
    
    // Radio buttons de tipo de ambiente (homogéneo/EMT)
    if (e.target && e.target.name === 'ambient-type') {
        updateAmbientTypeInterface(e.target.value);
    }
});


// ============================================================================
// FUNCIÓN: Manejar cambio de modelo del sustrato (con interfaz mejorada)
// ============================================================================
function handleSubstrateModelChange(modelValue) {
    console.log(`🔄 Sustrato modelo cambiado a: ${modelValue}`);
    
    const constantField = document.getElementById('substrate-constant-field');
    const paramsDiv = document.getElementById('substrate-params');
    const fileUpload = document.getElementById('substrate-file-upload');
    const customEq = document.getElementById('substrate-custom-eq');
    
    // Ocultar todo primero
    if (constantField) constantField.style.display = 'none';
    if (paramsDiv) paramsDiv.innerHTML = '';
    if (fileUpload) fileUpload.style.display = 'none';
    if (customEq) customEq.style.display = 'none';
    
    // Mostrar según el modelo seleccionado
    if (modelValue === 'constant' || modelValue === 'glass' || modelValue === 'si') {
        // Presets: mostrar campos n, k constantes
        if (constantField) {
            constantField.style.display = 'block';
            const nInput = document.getElementById('substrate-n-constant');
            const kInput = document.getElementById('substrate-k-constant');
            if (modelValue === 'glass') {
                if (nInput) nInput.value = '1.52';
                if (kInput) kInput.value = '0';
            } else if (modelValue === 'si') {
                if (nInput) nInput.value = '3.87';
                if (kInput) kInput.value = '0.02';
            }
        }
    } else if (modelValue === 'file_nk' || modelValue === 'file_epsilon') {
        // Archivos: mostrar input de archivo
        if (fileUpload) {
            fileUpload.style.display = 'block';
            const fileHelp = document.getElementById('substrate-file-help');
            if (fileHelp) {
                fileHelp.textContent = modelValue === 'file_epsilon'
                    ? 'Archivo con columnas: omega, epsilon1, epsilon2'
                    : 'Archivo con columnas: wavelength, n, k';
            }
        }
    } else if (modelValue === 'custom') {
        // Ecuación personalizada
        if (customEq) customEq.style.display = 'block';
    } else {
        // ⭐ Modelos de dispersión: usar interfaz mejorada con vista previa
        if (paramsDiv && window.dispersionTemplates && window.dispersionTemplates[modelValue]) {
            updateModelFieldsEnhanced(paramsDiv, modelValue, 'substrate-');
        } else {
            console.warn(`⚠️ No hay template para: ${modelValue}`);
        }
    }
}

// ============================================================================
// FUNCIÓN: Manejar cambio de modelo del ambiente (con interfaz mejorada)
// ============================================================================
function handleAmbientModelChange(modelValue) {
    console.log(`🔄 Ambiente modelo cambiado a: ${modelValue}`);
    
    const constantField = document.getElementById('ambient-constant-field');
    const paramsDiv = document.getElementById('ambient-params');
    const fileUpload = document.getElementById('ambient-file-upload');
    const customEq = document.getElementById('ambient-custom-eq');
    
    // Ocultar todo primero
    if (constantField) constantField.style.display = 'none';
    if (paramsDiv) paramsDiv.innerHTML = '';
    if (fileUpload) fileUpload.style.display = 'none';
    if (customEq) customEq.style.display = 'none';
    
    // Mostrar según el modelo seleccionado
    if (modelValue === 'constant') {
        if (constantField) constantField.style.display = 'block';
    } else if (modelValue === 'file_nk' || modelValue === 'file_epsilon') {
        if (fileUpload) {
            fileUpload.style.display = 'block';
            const fileHelp = document.getElementById('ambient-file-help');
            if (fileHelp) {
                fileHelp.textContent = modelValue === 'file_epsilon'
                    ? 'Archivo con columnas: omega, epsilon1, epsilon2'
                    : 'Archivo con columnas: wavelength, n, k';
            }
        }
    } else if (modelValue === 'custom') {
        if (customEq) customEq.style.display = 'block';
    } else {
        // ⭐ Modelos de dispersión: usar interfaz mejorada con vista previa
        if (paramsDiv && window.dispersionTemplates && window.dispersionTemplates[modelValue]) {
            updateModelFieldsEnhanced(paramsDiv, modelValue, 'ambient-');
        } else {
            console.warn(`⚠️ No hay template para: ${modelValue}`);
        }
    }
}

// ============================================================================
// FUNCIÓN: Manejar cambio de modelo del ambiente
// ============================================================================
function handleAmbientModelChange(modelValue) {
    console.log(`🔄 Ambiente modelo cambiado a: ${modelValue}`);
    
    const constantField = document.getElementById('ambient-constant-field');
    const paramsDiv = document.getElementById('ambient-params');
    const fileUpload = document.getElementById('ambient-file-upload');
    const customEq = document.getElementById('ambient-custom-eq');
    
    // Ocultar todo primero
    if (constantField) constantField.style.display = 'none';
    if (paramsDiv) paramsDiv.innerHTML = '';
    if (fileUpload) fileUpload.style.display = 'none';
    if (customEq) customEq.style.display = 'none';
    
    // Mostrar según el modelo seleccionado
    if (modelValue === 'constant') {
        if (constantField) constantField.style.display = 'block';
    } else if (modelValue === 'file_nk' || modelValue === 'file_epsilon') {
        if (fileUpload) {
            fileUpload.style.display = 'block';
            const fileHelp = document.getElementById('ambient-file-help');
            if (fileHelp) {
                fileHelp.textContent = modelValue === 'file_epsilon'
                    ? 'Archivo con columnas: omega, epsilon1, epsilon2'
                    : 'Archivo con columnas: wavelength, n, k';
            }
        }
    } else if (modelValue === 'custom') {
        if (customEq) customEq.style.display = 'block';
    } else {
        // Modelos de dispersión
        if (paramsDiv && window.dispersionTemplates && window.dispersionTemplates[modelValue]) {
            const template = window.dispersionTemplates[modelValue];
            let html = '';
            
            template.params.forEach(param => {
                html += `
                    <div class="mb-2">
                        <label class="form-label small">${param.label || param.name}</label>
                        <div class="input-group input-group-sm">
                            <input type="number" 
                                   class="form-control" 
                                   id="ambient-${param.name}" 
                                   value="${param.default || 0}" 
                                   step="${param.step || 0.001}">
                            <span class="input-group-text">
                                <input type="checkbox" 
                                       class="form-check-input mt-0" 
                                       id="ambient-${param.name}-optimize"
                                       title="Optimizar">
                            </span>
                        </div>
                    </div>
                `;
            });
            
            paramsDiv.innerHTML = html;
        }
    }
}

// ============================================================================
// FUNCIÓN: Actualizar interfaz del sustrato (homogéneo/EMT)
// ============================================================================
function updateSubstrateTypeInterface(type) {
    console.log(`🔧 updateSubstrateTypeInterface: ${type}`);
    
    const homoConfig = document.getElementById('substrate-homo-config');
    const emtConfig = document.getElementById('substrate-emt-config');
    
    if (!homoConfig || !emtConfig) {
        console.error('❌ No se encontraron contenedores del sustrato');
        return;
    }
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
        
        // Inicializar el modelo actual
        const substrateModel = document.getElementById('substrate-model');
        if (substrateModel) {
            handleSubstrateModelChange(substrateModel.value);
        }
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        // Agregar componente EMT si no hay ninguno
        const container = document.getElementById('substrate-emt-components');
        if (container && container.children.length === 0) {
            if (typeof addMediumEMTComponent === 'function') {
                addMediumEMTComponent('substrate');
            }
        }
    }
}

// ============================================================================
// FUNCIÓN: Actualizar interfaz del ambiente (homogéneo/EMT)
// ============================================================================
function updateAmbientTypeInterface(type) {
    console.log(`🔧 updateAmbientTypeInterface: ${type}`);
    
    const homoConfig = document.getElementById('ambient-homo-config');
    const emtConfig = document.getElementById('ambient-emt-config');
    
    if (!homoConfig || !emtConfig) {
        console.error('❌ No se encontraron contenedores del ambiente');
        return;
    }
    
    if (type === 'homogeneous') {
        homoConfig.style.display = 'block';
        emtConfig.style.display = 'none';
        
        const ambientModel = document.getElementById('ambient-model');
        if (ambientModel) {
            handleAmbientModelChange(ambientModel.value);
        }
    } else {
        homoConfig.style.display = 'none';
        emtConfig.style.display = 'block';
        
        const container = document.getElementById('ambient-emt-components');
        if (container && container.children.length === 0) {
            if (typeof addMediumEMTComponent === 'function') {
                addMediumEMTComponent('ambient');
            }
        }
    }
}

console.log('✅ Event delegation para modal cargado correctamente');