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

    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        fillPreviewTable(data.columns, data.preview);
        currentData = { columns: data.columns, fullData: data.full_data };
        uploadedFileData = data.full_data;
        
        const lambdaCol = findColumn(data.columns, ["lambda", "longitud", "wavelength", "nm", "wave"]);
        if (lambdaCol) {
            uploadedWavelengths = data.full_data.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
        }
        
        drawGraphs(data.columns, data.full_data);
        document.getElementById("btn-continue-model").style.display = "block";

    } catch (error) {
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

    let thead = "<tr>";
    columns.forEach(col => thead += `<th>${col}</th>`);
    thead += "</tr>";
    table.innerHTML += thead;

    preview.forEach(row => {
        let tr = "<tr>";
        columns.forEach(c => {
            const value = row[c] !== null && row[c] !== undefined ? row[c] : '';
            tr += `<td>${value}</td>`;
        });
        tr += "</tr>";
        table.innerHTML += tr;
    });
}

function drawGraphs(columns, fullData) {
    
    let lambdaCol = findColumn(columns, ["lambda", "longitud", "wavelength", "nm", "wave"]);
    let psiCol = findColumn(columns, ["psi"]);
    let deltaCol = findColumn(columns, ["delta"]);

    if (!lambdaCol || !psiCol || !deltaCol) {
        alert("No se pudieron identificar las columnas necesarias.\n" +
              "Asegurate de que el archivo contenga columnas para:\n" +
              "- Longitud de onda (lambda, wavelength, nm)\n" +
              "- Psi\n" +
              "- Delta\n\n" +
              "Columnas encontradas: " + columns.join(", "));
        return;
    }

    const lambda = fullData.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
    const psi = fullData.map(r => r[psiCol]).filter(v => v !== null && v !== undefined);
    const delta = fullData.map(r => r[deltaCol]).filter(v => v !== null && v !== undefined);

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
        yaxis: { ...layout_base.yaxis, title: "Psi (grados)" }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });

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
        yaxis: { ...layout_base.yaxis, title: "Delta (grados)" }
    }, {
        displayModeBar: true,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
    });

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
            title: "Psi (grados)",
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
            title: "Delta (grados)",
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
            <title>Graficas Experimentales</title>
            <style>
                body { margin: 20px; font-family: Arial; }
                h1 { font-size: 18px; margin-bottom: 20px; }
                img { width: 100%; max-width: 800px; margin-bottom: 30px; display: block; }
            </style>
        </head>
        <body>
            <h1>Graficas Experimentales - Elipsometria</h1>
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
            { name: "A", placeholder: "A (ej. 1.45)", default: 1.45 },
            { name: "B", placeholder: "B (ej. 0.003)", default: 0.003 },
            { name: "C", placeholder: "C (ej. 0)", default: 0 }
        ]
    },
    sellmeier: {
        label: "Sellmeier",
        equation: "n^2(\\lambda) = 1 + \\sum_j \\frac{B_j \\lambda^2}{\\lambda^2 - C_j}",
        params: [
            { name: "B1", placeholder: "B1", default: 1.0 },
            { name: "C1", placeholder: "C1 (nm^2)", default: 10000 },
            { name: "B2", placeholder: "B2 (opcional)", default: 0 },
            { name: "C2", placeholder: "C2 (opcional)", default: 0 }
        ]
    },
    drude: {
        label: "Drude",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty - \\frac{\\omega_p^2}{\\omega^2 + i\\gamma\\omega}",
        params: [
            { name: "eps_inf", placeholder: "epsilon infinito", default: 1.0 },
            { name: "omega_p", placeholder: "omega_p (eV)", default: 9.0 },
            { name: "gamma", placeholder: "gamma (eV)", default: 0.1 }
        ]
    },
    lorentz: {
        label: "Lorentz",
        equation: "\\varepsilon(\\omega) = \\varepsilon_\\infty + \\sum_j \\frac{f_j \\omega_j^2}{\\omega_j^2 - \\omega^2 - i\\gamma_j\\omega}",
        params: [
            { name: "eps_inf", placeholder: "epsilon infinito", default: 1.0 },
            { name: "f1", placeholder: "f1 (fuerza del oscilador)", default: 1.0 },
            { name: "omega_1", placeholder: "omega_1 (eV)", default: 3.0 },
            { name: "gamma_1", placeholder: "gamma_1 (eV)", default: 0.5 }
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
                     placeholder="${p.placeholder}" type="number" step="any" value="${p.default}">`;
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
        fileHelp.textContent = "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2 - Se convertira automaticamente a n,k";
    } else if (modelType === "custom") {
        customDiv.style.display = "block";
    } else if (modelType === "glass") {
        paramsDiv.innerHTML = `<div class="form-text">Glass: n = 1.52, k = 0 (valores tipicos)</div>`;
    } else if (modelType === "si") {
        paramsDiv.innerHTML = `<div class="form-text">Silicon: Se usaran valores tabulados de Si</div>`;
    }
}

const layersContainer = document.getElementById("layers-container");
document.getElementById("add-layer").addEventListener("click", () => addLayer());

let layerCounter = 0;

function addLayer(prefill={}) {
    layerCounter++;
    const idx = layerCounter;
    const wrapper = document.createElement("div");
    wrapper.className = "card mb-2 p-3 layer-card";
    wrapper.dataset.idx = String(idx);

    wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <strong class="layer-title">Capa ${layersContainer.children.length + 1}</strong>
            <button class="btn btn-sm btn-outline-danger remove-layer">Eliminar</button>
        </div>
        <div class="row mt-2 g-2">
            <div class="col-md-6">
                <label class="form-label">Nombre</label>
                <input class="form-control layer-name" value="${prefill.name || ('Capa ' + (layersContainer.children.length + 1))}">
            </div>
            <div class="col-md-6">
                <label class="form-label">Espesor (nm)</label>
                <div class="input-group">
                    <input class="form-control layer-thickness" type="number" min="0" step="0.1" value="${prefill.thickness || 100}">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 layer-optimize" type="checkbox" title="Optimizar" ${prefill.optimize ? 'checked' : ''}/>
                    </span>
                </div>
                <div class="form-text">Marcar para optimizar este parametro</div>
            </div>

            <div class="col-md-6">
                <label class="form-label">Modelo de dispersion</label>
                <select class="form-select layer-model">
                    <option value="cauchy" selected>Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="file_nk">Archivo n,k,longitud</option>
                    <option value="file_epsilon">Archivo epsilon1,epsilon2,omega</option>
                    <option value="custom">Ecuacion personalizada</option>
                </select>
            </div>

            <div class="col-md-6 layer-params-col">
                <div class="layer-params"></div>
            </div>

            <div class="col-12 layer-file-row" style="display:none;">
                <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control layer-file"/>
                <div class="form-text layer-file-help">Archivo con columnas apropiadas</div>
            </div>

            <div class="col-12 layer-custom-row" style="display:none;">
                <label class="form-label">Ecuacion LaTeX</label>
                <math-field class="layer-mathfield" virtual-keyboard-mode="manual" style="min-height:40px;"></math-field>
                <div class="eq-preview layer-eq-preview mt-2"></div>
            </div>
        </div>
    `;

    layersContainer.appendChild(wrapper);

    const removeBtn = wrapper.querySelector(".remove-layer");
    removeBtn.addEventListener("click", () => { 
        wrapper.remove(); 
        refreshLayerTitles(); 
    });

    const modelSelect = wrapper.querySelector(".layer-model");
    const paramsDiv = wrapper.querySelector(".layer-params");
    const fileRow = wrapper.querySelector(".layer-file-row");
    const customRow = wrapper.querySelector(".layer-custom-row");
    const fileHelp = wrapper.querySelector(".layer-file-help");

    function updateLayerModel() {
        const model = modelSelect.value;
        fileRow.style.display = "none";
        customRow.style.display = "none";
        paramsDiv.innerHTML = "";

        if (dispersionTemplates[model]) {
            const template = dispersionTemplates[model];
            let html = `
                <div class="dispersion-templates mb-2">
                    <small class="text-muted">${template.label}:</small>
                    <div class="eq-preview mt-1" style="font-size: 0.85em;">$${template.equation}$</div>
                </div>
            `;
            template.params.forEach(p => {
                html += `<input class="form-control form-control-sm mb-1 layer-param" 
                         data-param="${p.name}" placeholder="${p.placeholder}" 
                         type="number" step="any" value="${p.default}">`;
            });
            paramsDiv.innerHTML = html;
            if (window.MathJax) {
                MathJax.typesetPromise([paramsDiv]);
            }
        } else if (model === "file_nk") {
            fileRow.style.display = "block";
            fileHelp.textContent = "Archivo con columnas: wavelength (nm), n, k";
        } else if (model === "file_epsilon") {
            fileRow.style.display = "block";
            fileHelp.textContent = "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2 - Se convertira a n,k";
        } else if (model === "custom") {
            customRow.style.display = "block";
        }
    }

    modelSelect.addEventListener("change", updateLayerModel);
    updateLayerModel();
    refreshLayerTitles();
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
            wizardError.innerText = "Introduce un angulo valido (0 < angulo < 90 grados).";
            wizardError.style.display = "block";
            return false;
        }
        const wlMode = document.querySelector('input[name="wl-option"]:checked').value;
        if (wlMode === 'range') {
            const from = Number(document.getElementById("input-wl-from").value);
            const to = Number(document.getElementById("input-wl-to").value);
            const steps = Number(document.getElementById("input-wl-steps").value);
            if (isNaN(from) || isNaN(to) || isNaN(steps) || from <= 0 || to <= 0 || steps < 2 || from >= to) {
                wizardError.innerText = "Introduce un rango de longitudes valido (inicio < fin, pasos >= 2).";
                wizardError.style.display = "block";
                return false;
            }
        } else if (wlMode === 'single') {
            const single = Number(document.getElementById("input-wl-single").value);
            if (isNaN(single) || single <= 0) {
                wizardError.innerText = "Introduce una longitud de onda valida (> 0 nm).";
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
    html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Modelo</th><th>Optimizar</th>';
    html += '</tr></thead><tbody>';
    
    [...layersContainer.children].forEach((layer, i) => {
        const name = layer.querySelector(".layer-name").value;
        const thickness = layer.querySelector(".layer-thickness").value;
        const model = layer.querySelector(".layer-model").value;
        const optimize = layer.querySelector(".layer-optimize").checked;
        
        html += `<tr>
            <td>${i + 1}</td>
            <td>${name}</td>
            <td>${thickness}</td>
            <td>${model}</td>
            <td>${optimize ? 'Si' : 'No'}</td>
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
            data.params[name] = Number(inp.value) || 0;
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

async function collectLayerData(layerElement) {
    const data = {};
    data.name = layerElement.querySelector(".layer-name").value;
    data.thickness = Number(layerElement.querySelector(".layer-thickness").value);
    data.optimize_thickness = layerElement.querySelector(".layer-optimize").checked;
    data.model = layerElement.querySelector(".layer-model").value;
    
    if (dispersionTemplates[data.model]) {
        data.params = {};
        const inputs = layerElement.querySelectorAll(".layer-param");
        inputs.forEach(inp => {
            data.params[inp.dataset.param] = Number(inp.value) || 0;
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
    } else if (data.model === "custom") {
        const mathfield = layerElement.querySelector(".layer-mathfield");
        if (mathfield && mathfield.getValue) {
            data.equation = mathfield.getValue();
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
        
        alert("Modelo optico guardado correctamente en: " + result.filename);
        
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
    
    let html = '<h6>Configuracion Global</h6>';
    html += `<ul>
        <li><strong>Angulo de incidencia:</strong> ${model.global.angle} grados</li>
        <li><strong>Polarizacion:</strong> ${model.global.polarization}</li>
        <li><strong>Modo de longitud de onda:</strong> ${model.global.wavelength_mode}</li>
    </ul>`;
    
    if (model.global.wavelength_mode === "range") {
        html += `<p>Rango: ${model.global.wl_from} - ${model.global.wl_to} nm (${model.global.wl_steps} pasos)</p>`;
    } else if (model.global.wavelength_mode === "single") {
        html += `<p>Longitud unica: ${model.global.wl_single} nm</p>`;
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
        html += '<th>#</th><th>Nombre</th><th>Espesor (nm)</th><th>Modelo</th><th>Optimizar</th>';
        html += '</tr></thead><tbody>';
        
        model.layers.forEach((layer, i) => {
            html += `<tr>
                <td>${i + 1}</td>
                <td>${layer.name}</td>
                <td>${layer.thickness}</td>
                <td>${layer.model}</td>
                <td>${layer.optimize_thickness ? 'Si' : 'No'}</td>
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
