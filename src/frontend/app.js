document.getElementById("inputFile").addEventListener("change", uploadFile);
document.getElementById("showGrid").addEventListener("change", updateGraphSettings);
document.getElementById("whiteBackground").addEventListener("change", updateGraphSettings);

let currentData = null;
let uploadedFileData = null;
let uploadedWavelengths = [];
let savedModel = null;

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

    // ========== CONFIGURACIÓN HOMOGÉNEA ==========
    const modelSelect = wrapper.querySelector(".layer-model");
    const paramsDiv = wrapper.querySelector(".layer-params");
    const fileRow = wrapper.querySelector(".layer-file-row");
    const constantRow = wrapper.querySelector(".layer-constant-row");
    const fileHelp = wrapper.querySelector(".layer-file-help");

    function updateLayerModel() {
        const model = modelSelect.value;
        fileRow.style.display = "none";
        constantRow.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantRow.style.display = "block";
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
    const fileHelp = componentDiv.querySelector('.component-file-help');

    function updateComponentModel() {
        const model = modelSelect.value;
        fileSection.style.display = "none";
        constantSection.style.display = "none";
        paramsContainer.innerHTML = "";

        if (model === 'constant') {
            constantSection.style.display = "block";
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
        const ambientModel = document.getElementById("ambient-model").value;
        const substrateModel = document.getElementById("substrate-model").value;
        
        if (ambientModel === "file_nk" || ambientModel === "file_epsilon") {
            const file = document.getElementById("ambient-file").files[0];
            if (!file) {
                wizardError.innerText = "Selecciona un archivo para el medio ambiente.";
                wizardError.style.display = "block";
                return false;
            }
        }
        
        if (substrateModel === "file_nk" || substrateModel === "file_epsilon") {
            const file = document.getElementById("substrate-file").files[0];
            if (!file) {
                wizardError.innerText = "Selecciona un archivo para el sustrato.";
                wizardError.style.display = "block";
                return false;
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
        const mathfield = document.getElementById(`${medium}-mathfield`);
        if (mathfield && mathfield.getValue) {
            data.equation = mathfield.getValue();
        }
    } else if (modelType === "glass") {
        data.n = 1.52;
        data.k = 0;
    } else if (modelType === "si") {
        data.material = "silicon";
    }
    
    return data;
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