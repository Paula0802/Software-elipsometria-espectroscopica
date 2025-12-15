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
        
        const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
        if (lambdaCol) {
            uploadedWavelengths = data.full_data.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
            console.log("Longitudes de onda extraídas:", uploadedWavelengths.length);
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

// ⭐ INICIALIZAR PASOS CUANDO SE ABRE EL MODAL
document.getElementById("btn-continue-model").addEventListener("click", () => {
    // Inicializar wizard
    currentStep = 1;
    
    // ⭐ CAPTURAR PASOS DEL WIZARD
    wizardSteps = [...document.querySelectorAll(".wizard-step")];
    
    console.log('🔍 DEBUG WIZARD:');
    console.log('  - Total pasos:', wizardSteps.length);
    console.log('  - Paso 1:', document.querySelector('[data-step="1"]') ? '✅' : '❌');
    console.log('  - Paso 2:', document.querySelector('[data-step="2"]') ? '✅' : '❌');
    console.log('  - Paso 3:', document.querySelector('[data-step="3"]') ? '✅' : '❌');
    console.log('  - Contenedor capas:', document.getElementById('layers-container') ? '✅' : '❌');
    console.log('  - Botón agregar capa:', document.getElementById('add-layer') ? '✅' : '❌');
    
    // Mostrar primer paso
    document.getElementById("wizard-step-num").innerText = currentStep;
    showStep(currentStep);
    
    // Abrir modal
    modelWizardModal.show();
});

const wizardNextBtn = document.getElementById("wizard-next");
const wizardPrevBtn = document.getElementById("wizard-prev");
const wizardSaveBtn = document.getElementById("wizard-save");
const wizardError = document.getElementById("wizard-error");

function showStep(n) {
    // Ocultar TODOS los pasos
    const allSteps = document.querySelectorAll('.wizard-step');
    allSteps.forEach(step => {
        step.classList.add('d-none');
    });
    
    // Mostrar el paso actual
    const currentStepElement = document.querySelector(`[data-step="${n}"]`);
    if (currentStepElement) {
        currentStepElement.classList.remove('d-none');
        
        // Forzar display block
        currentStepElement.style.display = 'block';
    }
    
    // Actualizar número de paso
    const stepNum = document.getElementById("wizard-step-num");
    if (stepNum) stepNum.innerText = n;
    
    // Botones de navegación
    const totalSteps = allSteps.length;
    wizardPrevBtn.style.display = (n === 1) ? "none" : "inline-block";
    wizardNextBtn.style.display = (n === totalSteps) ? "none" : "inline-block";
    wizardSaveBtn.classList.toggle("d-none", n !== totalSteps);
    wizardError.style.display = "none";
    
    // Resumen en paso 3
    if (n === 3) {
        updateModelSummary();
    }
}

wizardNextBtn.addEventListener("click", async () => {  // ⭐ agregar async
    if (currentStep < wizardSteps.length) {
        if (!(await validateStep(currentStep))) return;  // ⭐ agregar await
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

// ========================================
// MEJORAS PARA VISUALIZACIÓN DE ECUACIONES
// Agregar este código al final de tu app.js actual
// ========================================

// NUEVAS PLANTILLAS MEJORADAS con soporte para hasta 10 osciladores
window.dispersionTemplates = {
    cauchy: {
        label: "Cauchy",
        equation: "n(\\lambda) = A + \\frac{B}{\\lambda^2} + \\frac{C}{\\lambda^4}",
        params: [
            { name: "A", placeholder: "A (ej: 1.5)", canOptimize: true },
            { name: "B", placeholder: "B (ej: 0.004)", canOptimize: true },
            { name: "C", placeholder: "C (ej: 0)", canOptimize: true }
        ],
        previewFn: (p) => `n(\\lambda) = ${p.A||'A'} + \\frac{${p.B||'B'}}{\\lambda^2} + \\frac{${p.C||'C'}}{\\lambda^4}`
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
            // Convertir número a subíndice Unicode
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
            let terms = [];
            for (let i = 1; i <= 10; i++) {
                const B = p[`B${i}`];
                const C = p[`C${i}`];
                if (B !== undefined && B !== null && B !== '') {
                    const Bval = B || `B_{${i}}`;
                    const Cval = C || `C_{${i}}`;
                    terms.push(`\\frac{${Bval}\\lambda^2}{\\lambda^2-${Cval}}`);
                }
            }
            return `n^2(\\lambda) = 1 ${terms.length ? '+ ' + terms.join(' + ') : ''}`;
        }
    },
    drude: {
        label: "Drude",
        equation: "\\varepsilon(E) = \\varepsilon_\\infty - \\frac{E_p^2}{E^2 + i\\Gamma_D E}",
        params: [
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            { name: "E_p", placeholder: "Eₚ (eV)", canOptimize: true },
            { name: "Gamma_D", placeholder: "Γ_D (eV)", canOptimize: true }
        ],
        previewFn: (p) => `\\varepsilon(E) = ${p.eps_inf||'\\varepsilon_\\infty'} - \\frac{${p.E_p||'E_p'}^2}{E^2 + i ${p.Gamma_D||'\\Gamma_D'} E}`
    },
    lorentz: {
    label: "Lorentz",
    equation: "\\varepsilon(E) = \\varepsilon_\\infty + \\sum_{j=1}^{N} \\frac{A_j E_{j}^2}{E_{j}^2 - E^2 - i\\Gamma_j E}",
    params: [
        { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
        { name: "A1", placeholder: "A₁", canOptimize: true },
        { name: "E0_1", placeholder: "E₁ (eV)", canOptimize: true },
        { name: "Gamma_1", placeholder: "Γ₁ (eV)", canOptimize: true }
    ],
    maxOscillators: 10,
    termName: "oscilador",
    generateDynamicParam: (index) => {
        const toSubscript = (n) => {
            const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
            return n.toString().split('').map(d => subs[parseInt(d)]).join('');
        };
        
        return [
            { name: `A${index}`, placeholder: `A${toSubscript(index)}`, canOptimize: true },
            { name: `E0_${index}`, placeholder: `E${toSubscript(index)} (eV)`, canOptimize: true },
            { name: `Gamma_${index}`, placeholder: `Γ${toSubscript(index)} (eV)`, canOptimize: true }
        ];
    },
    previewFn: (p) => {
        const epsInf = p.eps_inf || '\\varepsilon_\\infty';
        
        // SIEMPRE incluir oscilador 1
        const A1 = p.A1 || 'A_1';
        const E01 = p.E0_1 || 'E_{1}';
        const Gamma1 = p.Gamma_1 || '\\Gamma_1';
        
        let terms = [];
        terms.push(`\\frac{${A1}E_{1}^2}{E_{1}^2-E^2-i\\Gamma_1 E}`);
        
        // Osciladores adicionales
        for (let i = 2; i <= 10; i++) {
            const A = p[`A${i}`];
            if (A !== undefined && A !== null && A !== '') {
                const Aval = A || `A_{${i}}`;
                const E0val = p[`E0_${i}`] || `E_{${i}}`;
                const Gammaval = p[`Gamma_${i}`] || `\\Gamma_{${i}}`;
                terms.push(`\\frac{${Aval}E_{${i}}^2}{E_{${i}}^2-E^2-i\\Gamma_{${i}} E}`);
            }
        }
        
        return `\\varepsilon(E) = ${epsInf} + ${terms.join(' + ')}`;
    }
    },
   
    'drude-lorentz': {
        label: "Drude-Lorentz",
        equation: "\\varepsilon(E) = \\varepsilon_\\infty - \\frac{E_p^2}{E^2 + i\\Gamma_D E} + \\sum_{j=1}^{N} \\frac{A_j E_{j}^2}{E_{j}^2 - E^2 - i\\Gamma_j E}",
        params: [
            // Global
            { name: "eps_inf", placeholder: "ε∞", canOptimize: true },
            
            // Drude (portadores libres)
            { name: "E_p", placeholder: "Eₚ (eV) - Plasma", canOptimize: true, group: "drude" },
            { name: "Gamma_D", placeholder: "Γ_D (eV) - Drude", canOptimize: true, group: "drude" },
            
            // Lorentz - Oscilador 1 (siempre presente)
            { name: "A1", placeholder: "A₁ - Lorentz", canOptimize: true, group: "lorentz" },
            { name: "E1", placeholder: "E₁ (eV)", canOptimize: true, group: "lorentz" },
            { name: "Gamma_1", placeholder: "Γ₁ (eV)", canOptimize: true, group: "lorentz" }
        ],
        maxOscillators: 5,
        termName: "oscilador Lorentz",
        helpText: "Cada oscilador Lorentz representa una transición electrónica ligada. Agrega osciladores hasta describir bien las características de absorción.",
        generateDynamicParam: (index) => {
            const toSubscript = (n) => {
                const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
                return n.toString().split('').map(d => subs[parseInt(d)]).join('');
            };
            
            return [
                { name: `A${index}`, placeholder: `A${toSubscript(index)}`, canOptimize: true, group: "lorentz" },
                { name: `E${index}`, placeholder: `E${toSubscript(index)} (eV)`, canOptimize: true, group: "lorentz", min: 0.001 },
                { name: `Gamma_${index}`, placeholder: `Γ${toSubscript(index)} (eV)`, canOptimize: true, group: "lorentz" }
            ];
        },
        previewFn: (p) => {
            const epsInf = p.eps_inf || '\\varepsilon_\\infty';
            const Ep = p.E_p || 'E_p';
            const GammaD = p.Gamma_D || '\\Gamma_D';
            
            // Término Drude
            const drudeTerm = `\\frac{${Ep}^2}{E^2 + i\\Gamma_D E}`;
            
            // Términos Lorentz
            let lorentzTerms = [];
            for (let i = 1; i <= 5; i++) {
                const A = p[`A${i}`];
                if (A !== undefined && A !== null && A !== '') {
                    const Aval = A || `A_{${i}}`;
                    const Eval = p[`E${i}`] || `E_{${i}}`;
                    const Gammaval = p[`Gamma_${i}`] || `\\Gamma_{${i}}`;
                    lorentzTerms.push(`\\frac{${Aval}E_{${i}}^2}{E_{${i}}^2-E^2-i\\Gamma_{${i}} E}`);
                }
            }
            
            let equation = `\\varepsilon(E) = ${epsInf} - ${drudeTerm}`;
            if (lorentzTerms.length > 0) {
                equation += ' + ' + lorentzTerms.join(' + ');
            }
            
            return equation;
        }
    },
};  // ← Cierre de window.dispersionTemplates




document.getElementById("ambient-model").addEventListener("change", (e) => {
    updateMediumFieldsEnhanced('ambient', e.target.value);  // ✅ NUEVA
});

document.getElementById("substrate-model").addEventListener("change", (e) => {
    updateMediumFieldsEnhanced('substrate', e.target.value);
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



// ⭐ NUEVAS FUNCIONES: Parámetros dinámicos y vista previa

function createParamFieldWithOptimize(param, prefix = '') {
    const inputId = `${prefix}${param.name}`;
    return `
        <div class="param-field mb-2">
            <label class="form-label small mb-1">${param.placeholder}</label>
            <div class="input-group input-group-sm">
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
                    <span class="input-group-text">⚙️</span>
                ` : ''}
            </div>
        </div>
    `;
}

function showEquationPreview(container, model, paramsInputs) {
    const template = dispersionTemplates[model];
    if (!template || !template.previewFn) return;
    
    // Recopilar valores actuales de los parámetros
    const params = {};
    paramsInputs.forEach(input => {
        const paramName = input.dataset.param;
        const value = input.value.trim();
        if (value !== '') {
            params[paramName] = parseFloat(value);
        }
    });
    
    // Generar ecuación con valores
    const equationLatex = template.previewFn(params);
    
    // Crear/actualizar sección de vista previa
    let previewDiv = container.querySelector('.equation-preview-section');
    if (!previewDiv) {
        previewDiv = document.createElement('div');
        previewDiv.className = 'equation-preview-section';
        container.appendChild(previewDiv);
    }
    
    previewDiv.innerHTML = `
        <div class="alert alert-info mt-3">
            <h6 class="mb-2">📐 VERIFICACIÓN DE ECUACIÓN</h6>
            <div class="bg-white p-2 rounded border mb-3 text-center equation-display">
                $$${equationLatex}$$
            </div>
            <hr>
            <p class="mb-2"><strong>¿Verificó la ecuación y desea continuar?</strong></p>
            <div class="btn-group w-100" role="group">
                <input type="radio" class="btn-check" name="confirm-equation-${Date.now()}" id="confirm-yes-${Date.now()}" value="yes">
                <label class="btn btn-outline-success" for="confirm-yes-${Date.now()}">✅ Sí, continuar</label>
                
                <input type="radio" class="btn-check" name="confirm-equation-${Date.now()}" id="confirm-no-${Date.now()}" value="no" checked>
                <label class="btn btn-outline-warning" for="confirm-no-${Date.now()}">✏️ No, modificar</label>
            </div>
        </div>
    `;
    
    // Renderizar MathJax
    if (window.MathJax) {
        MathJax.typesetPromise([previewDiv]);
    }
    
    // Manejar cambio de confirmación
    const confirmRadios = previewDiv.querySelectorAll('input[type="radio"]');
    confirmRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const confirmed = previewDiv.querySelector('input[value="yes"]:checked');
            if (confirmed) {
                // Bloquear inputs
                paramsInputs.forEach(inp => inp.readOnly = true);
                previewDiv.classList.add('equation-confirmed');
            } else {
                // Desbloquear inputs
                paramsInputs.forEach(inp => inp.readOnly = false);
                previewDiv.classList.remove('equation-confirmed');
            }
        });
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

//  NUEVA FUNCIÓN: Actualizar suma de fracciones para medio
function updateMediumFractionSum(medium) {
    const sumDisplay = document.getElementById(`${medium}-fraction-sum`);
    if (!sumDisplay) return;
    
    const components = document.querySelectorAll(`#${medium}-emt-components .medium-emt-component`);
    
    let sum = 0;
    components.forEach(comp => {
        const fractionInput = comp.querySelector('.medium-component-fraction');
        const isPercent = comp.querySelector('.medium-fraction-percent')?.checked;
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

//  NUEVA FUNCIÓN: Agregar componente EMT a medio (sustrato/ambiente)
//  NUEVA FUNCIÓN: Agregar componente EMT a medio (sustrato/ambiente) CON INTERFAZ DIVIDIDA
function addMediumEMTComponent(medium) {
    const container = document.getElementById(`${medium}-emt-components`);
    const componentCount = container.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 medium-emt-component bg-white shadow-sm';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary"> Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-medium-component">✕ Eliminar</button>
        </div>

        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label small fw-bold">Nombre del componente</label>
                <input class="form-control medium-component-name" value="Componente ${componentCount}" placeholder="Ej: SiO₂, Poros, Au">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <div class="input-group">
                    <input class="form-control medium-component-fraction" type="number" min="0" max="1" step="0.01" value="0.5" placeholder="0.0 - 1.0">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 medium-fraction-percent" type="checkbox" title="Usar porcentaje">
                    </span>
                    <span class="input-group-text">%</span>
                </div>
                <div class="form-text small">Decimal (0-1) o marcar para %</div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo de dispersión</label>
                <select class="form-select medium-component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude-lorentz">Drude-Lorentz (metales nobles)</option>
                    <option value="file_nk"> Archivo n,k,λ</option>
                    <option value="file_epsilon"> Archivo ε₁,ε₂,ω</option>
                </select>
            </div>
        </div>

        <!-- ÁREA PARA PARÁMETROS CON INTERFAZ DIVIDIDA -->
        <div class="row mt-3">
            <div class="col-12">
                <div class="model-config-container">
                    <div class="medium-component-params">
                        <!-- updateModelFieldsEnhanced insertará aquí la interfaz dividida -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección para archivos -->
        <div class="medium-component-file mt-3" style="display:none;">
            <label class="form-label small fw-bold">Archivo de datos ópticos</label>
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control medium-comp-file"/>
            <div class="form-text medium-file-help">Seleccione el archivo con los datos ópticos</div>
        </div>

        <!-- Sección para constante (n, k) -->
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

    // ========== EVENT LISTENERS ==========
    
    // Botón eliminar
    const removeBtn = componentDiv.querySelector('.remove-medium-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshMediumComponentTitles(container);
        updateMediumFractionSum(medium);
    });

    // Fracción volumétrica
    const fractionInput = componentDiv.querySelector('.medium-component-fraction');
    const percentCheckbox = componentDiv.querySelector('.medium-fraction-percent');

    fractionInput.addEventListener('input', () => updateMediumFractionSum(medium));
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

    //  MODELO DE DISPERSIÓN CON INTERFAZ DIVIDIDA
    const modelSelect = componentDiv.querySelector('.medium-component-model');
    const paramsDiv = componentDiv.querySelector('.medium-component-params');
    const fileDiv = componentDiv.querySelector('.medium-component-file');
    const constantDiv = componentDiv.querySelector('.medium-component-constant');
    const fileHelp = componentDiv.querySelector('.medium-file-help');

    function updateComponentModel() {
        const model = modelSelect.value;
        fileDiv.style.display = "none";
        constantDiv.style.display = "none";
        paramsDiv.innerHTML = "";

        if (model === 'constant') {
            constantDiv.style.display = "block";
        } else if (window.dispersionTemplates[model]) {
            //  USAR LA INTERFAZ DIVIDIDA
            updateModelFieldsEnhanced(paramsDiv, model, `${medium}-comp${componentCount}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileDiv.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                : "Archivo con columnas: wavelength (nm), n, k";
        }
    }

    modelSelect.addEventListener("change", updateComponentModel);
    updateComponentModel(); // Inicializar con "constant"

    refreshMediumComponentTitles(container);
    updateMediumFractionSum(medium);
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





// NUEVA FUNCIÓN: Actualizar suma de fracciones para medio
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

//  NUEVA FUNCIÓN: Refrescar títulos de componentes de medio
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

function addLayer(prefill={}) {
    layerCounter++;
    const idx = layerCounter;
    const wrapper = document.createElement("div");
    wrapper.className = "card mb-3 p-3 layer-card";
    wrapper.dataset.idx = String(idx);

    // Calcular valores por defecto
    const defaultName = prefill.name || `Capa ${layersContainer.children.length + 1}`;
    const defaultThickness = prefill.thickness || 100;

    wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="layer-title">Capa ${layersContainer.children.length + 1}</strong>
            <button class="btn btn-sm btn-outline-danger remove-layer">Eliminar</button>
        </div>

        <!-- PREGUNTA INICIAL: ¿Homogénea o Heterogénea? -->
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
                    <div class="form-text">Marcar para optimizar este parámetro</div>
                </div>
            </div>
        </div>

        <!-- Contenedor para capa HOMOGÉNEA -->
        <div class="homogeneous-config" style="display:none;">
            <div class="card p-3 bg-light">
                <h6 class="mb-2">Configuración homogénea</h6>
                
                <!-- Selector de modelo -->
                <div class="row g-2 mb-3">
                    <div class="col-md-12">
                        <label class="form-label">Modelo de dispersión</label>
                        <select class="form-select layer-model">
                            <option value="cauchy" selected>Cauchy</option>
                            <option value="sellmeier">Sellmeier</option>
                            <option value="drude">Drude</option>
                            <option value="lorentz">Lorentz</option>
                            <option value="drude-lorentz">Drude-Lorentz (metales nobles)</option>
                            <option value="constant">Constante</option>
                            <option value="file_nk">Archivo n,k,λ</option>
                            <option value="file_epsilon">Archivo ε₁,ε₂,ω</option>
                            <option value="custom">✏️ Ecuación personalizada (LaTeX)</option>
                        </select>
                    </div>
                </div>

                <!-- ÁREA COMPLETA para la interfaz dividida -->
                <div class="model-config-container">
                    <div class="layer-params">
                        <!-- updateModelFieldsEnhanced creará aquí la interfaz dividida -->
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
                        <strong> Ecuación personalizada</strong>
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

        <!-- Contenedor para capa HETEROGÉNEA (EMT) -->
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
                    <strong>Importante:</strong> La suma de fracciones volumétricas debe ser exactamente 1.0
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

    // LISTENER PRINCIPAL: Cambio de tipo de capa
    const typeRadios = wrapper.querySelectorAll(`input[name="layerType${idx}"]`);
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

    // IMPORTANTE: Disparar el evento change inicialmente
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
    });

    refreshLayerTitles();
}

//  FUNCIÓN: Agregar componente EMT a una capa CON INTERFAZ DIVIDIDA
function addEMTComponent(layerWrapper) {
    const componentsContainer = layerWrapper.querySelector('.emt-components-container');
    const componentCount = componentsContainer.children.length + 1;
    
    const componentDiv = document.createElement('div');
    componentDiv.className = 'card p-3 mb-3 emt-component bg-white shadow-sm';
    
    componentDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
            <strong class="component-title text-primary">Componente ${componentCount}</strong>
            <button class="btn btn-sm btn-outline-danger remove-emt-component">✕ Eliminar</button>
        </div>

        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label small fw-bold">Nombre del componente</label>
                <input class="form-control component-name" value="Componente ${componentCount}" placeholder="Ej: SiO₂, Poros, Au">
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Fracción volumétrica</label>
                <div class="input-group">
                    <input class="form-control component-fraction" type="number" min="0" max="1" step="0.01" value="0.5" placeholder="0.0 - 1.0">
                    <span class="input-group-text">
                        <input class="form-check-input mt-0 fraction-is-percent" type="checkbox" title="Usar porcentaje">
                    </span>
                    <span class="input-group-text">%</span>
                </div>
                <div class="form-text small">Decimal (0-1) o marcar para %</div>
            </div>
            <div class="col-md-4">
                <label class="form-label small fw-bold">Modelo de dispersión</label>
                <select class="form-select component-model">
                    <option value="constant" selected>Constante (n, k)</option>
                    <option value="cauchy">Cauchy</option>
                    <option value="sellmeier">Sellmeier</option>
                    <option value="drude">Drude</option>
                    <option value="lorentz">Lorentz</option>
                    <option value="drude-lorentz">Drude-Lorentz (metales nobles)</option>
                    <option value="file_nk"> Archivo n,k,λ</option>
                    <option value="file_epsilon"> Archivo ε₁,ε₂,ω</option>
                </select>
            </div>
        </div>

        <!--  ÁREA PARA PARÁMETROS CON INTERFAZ DIVIDIDA -->
        <div class="row mt-3">
            <div class="col-12">
                <div class="model-config-container">
                    <div class="component-params-container">
                        <!-- updateModelFieldsEnhanced insertará aquí la interfaz dividida -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección para archivos -->
        <div class="component-file-section mt-3" style="display:none;">
            <label class="form-label small fw-bold">Archivo de datos ópticos</label>
            <input type="file" accept=".csv,.txt,.xlsx,.spe" class="form-control component-file"/>
            <div class="form-text component-file-help">Seleccione el archivo con los datos ópticos</div>
        </div>

        <!-- Sección para constante (n, k) -->
        <div class="component-constant-section mt-3">
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
    
    componentsContainer.appendChild(componentDiv);

    // ========== EVENT LISTENERS ==========
    
    // Botón eliminar
    const removeBtn = componentDiv.querySelector('.remove-emt-component');
    removeBtn.addEventListener('click', () => {
        componentDiv.remove();
        refreshComponentTitles(componentsContainer);
        updateFractionSum(layerWrapper);
    });

    // Fracción volumétrica
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

    //  MODELO DE DISPERSIÓN CON INTERFAZ DIVIDIDA
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
        } else if (window.dispersionTemplates[model]) {
            //  USAR LA INTERFAZ DIVIDIDA
            updateModelFieldsEnhanced(paramsContainer, model, `layer-comp${componentCount}-`);
        } else if (model === "file_nk" || model === "file_epsilon") {
            fileSection.style.display = "block";
            fileHelp.textContent = model === "file_epsilon" 
                ? "Archivo con columnas: omega (o wavelength), epsilon1, epsilon2"
                : "Archivo con columnas: wavelength (nm), n, k";
        }
    }

    modelSelect.addEventListener("change", updateComponentModel);
    updateComponentModel(); // Inicializar con "constant"

    refreshComponentTitles(componentsContainer);
    updateFractionSum(layerWrapper);
}

//  FUNCIÓN: Actualizar suma de fracciones
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



function refreshLayerTitles() {
    [...layersContainer.children].forEach((c, i) => {
        const title = c.querySelector(".layer-title");
        if (title) title.innerText = `Capa ${i + 1}`;
    });
}


async function validateStep(step) {
    wizardError.style.display = "none";
    
    if (step === 1) {
        // Validar ángulo
        const angle = parseFloat(document.getElementById("input-angle").value);
        if (isNaN(angle) || angle < 0 || angle > 90) {
            wizardError.innerText = "Ángulo debe estar entre 0° y 90°";
            wizardError.style.display = "block";
            return false;
        }
        
        const wlModeElement = document.querySelector('input[name="wl-option"]:checked');
        const wlMode = wlModeElement ? wlModeElement.value : null;
        
        // Validar que existan datos experimentales
        if (!currentData || !uploadedFileData || uploadedFileData.length === 0) {
            wizardError.innerText = "❌ No hay datos experimentales cargados. Por favor, sube un archivo primero.";
            wizardError.style.display = "block";
            return false;
        }
        
        if (wlMode === 'range') {
            const from = parseFloat(document.getElementById('input-wl-from').value);
            const to = parseFloat(document.getElementById('input-wl-to').value);
            const steps = parseInt(document.getElementById('input-wl-steps').value);
            
            if (isNaN(from) || isNaN(to) || isNaN(steps)) {
                wizardError.innerText = "Define el rango de longitudes de onda completo";
                wizardError.style.display = "block";
                return false;
            }
            
            if (from >= to) {
                wizardError.innerText = "λ inicial debe ser menor que λ final";
                wizardError.style.display = "block";
                return false;
            }
            
            if (steps < 2) {
                wizardError.innerText = "Se requieren al menos 2 pasos";
                wizardError.style.display = "block";
                return false;
            }
            
            // VALIDACIÓN MEJORADA CON MANEJO DE ERRORES
            const cols = currentData.columns;
            const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
            const psiCol = findColumn(cols, ["psi"]);
            const deltaCol = findColumn(cols, ["delta"]);
            
            if (!lambdaCol || !psiCol || !deltaCol) {
                wizardError.innerText = "❌ No se encontraron columnas de wavelength, psi y delta en el archivo";
                wizardError.style.display = "block";
                return false;
            }
            
            const wavelengths_exp = uploadedFileData.map(r => r[lambdaCol]);
            const psi_exp = uploadedFileData.map(r => r[psiCol]);
            const delta_exp = uploadedFileData.map(r => r[deltaCol]);
            
            // Mostrar indicador de carga
            wizardError.innerHTML = '<i class="bi bi-hourglass-split"></i> Validando rango de longitudes de onda...';
            wizardError.className = 'alert alert-info';
            wizardError.style.display = "block";
            
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
                wizardError.style.display = "none";
                
                if (!result.valid) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-range-warning').forEach(w => w.remove());
                    
                    // Mostrar error
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger wl-range-warning';
                    errorDiv.innerHTML = `
                        <strong>❌ Rango no válido</strong>
                        <p class="mb-0">${result.message}</p>
                        ${result.exp_range ? `<small class="text-muted">Rango experimental disponible: [${result.exp_range[0].toFixed(1)}, ${result.exp_range[1].toFixed(1)}] nm</small>` : ''}
                    `;
                    
                    const wlRangeFields = document.getElementById('wl-range-fields');
                    wlRangeFields.after(errorDiv);
                    
                    // También mostrar en el error principal
                    wizardError.innerHTML = result.message;
                    wizardError.className = 'text-danger small';
                    wizardError.style.display = "block";
                    
                    return false;
                }
                
                // Mostrar advertencia si hay extrapolación pero es válido
                if (!result.in_range && result.extrapolation_points > 0) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-range-warning').forEach(w => w.remove());
                    
                    const warningDiv = document.createElement('div');
                    warningDiv.className = 'alert alert-warning wl-range-warning';
                    warningDiv.innerHTML = `
                        <strong>⚠️ Advertencia de extrapolación</strong>
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
                wizardError.style.display = "none";
                
                // Remover advertencias previas
                document.querySelectorAll('.wl-range-warning').forEach(w => w.remove());
                
                // Mostrar error detallado
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger wl-range-warning';
                errorDiv.innerHTML = `
                    <strong>❌ Error al validar rango</strong>
                    <p class="mb-2">${error.message}</p>
                    <small class="text-muted">Si el problema persiste, intenta recargar la página o verifica tu conexión.</small>
                `;
                
                const wlRangeFields = document.getElementById('wl-range-fields');
                wlRangeFields.after(errorDiv);
                
                // También en error principal
                wizardError.innerHTML = `❌ Error de validación: ${error.message}`;
                wizardError.className = 'text-danger small';
                wizardError.style.display = "block";
                
                console.error('Error completo:', error);
                
                return false;
            }
            
        } else if (wlMode === 'single') {
            const single = parseFloat(document.getElementById('input-wl-single').value);
            if (isNaN(single) || single <= 0) {
                wizardError.innerText = "Define una longitud de onda válida";
                wizardError.style.display = "block";
                return false;
            }
            
            // VALIDACIÓN MEJORADA CON MANEJO DE ERRORES
            const cols = currentData.columns;
            const lambdaCol = findColumn(cols, ["lambda", "longitud", "wavelength", "nm", "wave"]);
            const psiCol = findColumn(cols, ["psi"]);
            const deltaCol = findColumn(cols, ["delta"]);
            
            if (!lambdaCol || !psiCol || !deltaCol) {
                wizardError.innerText = "❌ No se encontraron columnas de wavelength, psi y delta en el archivo";
                wizardError.style.display = "block";
                return false;
            }
            
            const wavelengths_exp = uploadedFileData.map(r => r[lambdaCol]);
            const psi_exp = uploadedFileData.map(r => r[psiCol]);
            const delta_exp = uploadedFileData.map(r => r[deltaCol]);
            
            // Mostrar indicador de carga
            wizardError.innerHTML = '<i class="bi bi-hourglass-split"></i> Validando longitud de onda...';
            wizardError.className = 'alert alert-info';
            wizardError.style.display = "block";
            
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
                wizardError.style.display = "none";
                
                if (!result.valid) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-single-warning').forEach(w => w.remove());
                    
                    // Mostrar error
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger wl-single-warning';
                    errorDiv.innerHTML = `
                        <strong>❌ Longitud de onda no válida</strong>
                        <p class="mb-0">${result.message}</p>
                        ${result.exp_range ? `<small class="text-muted">Rango experimental disponible: [${result.exp_range[0].toFixed(1)}, ${result.exp_range[1].toFixed(1)}] nm</small>` : ''}
                    `;
                    
                    const wlSingleField = document.getElementById('wl-single-field');
                    wlSingleField.after(errorDiv);
                    
                    wizardError.innerHTML = result.message;
                    wizardError.className = 'text-danger small';
                    wizardError.style.display = "block";
                    
                    return false;
                }
                
                // Mostrar info si requiere interpolación
                if (result.interpolation_needed && !result.exact_match) {
                    // Remover advertencias previas
                    document.querySelectorAll('.wl-single-warning').forEach(w => w.remove());
                    
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'alert alert-info wl-single-warning';
                    infoDiv.innerHTML = `
                        <strong>ℹ️ Interpolación requerida</strong>
                        <p class="mb-1">${result.message}</p>
                        <small class="text-muted">Punto experimental más cercano: ${result.closest_exp_wavelength.toFixed(2)} nm (distancia: ${result.distance.toFixed(2)} nm)</small>
                    `;
                    
                    const wlSingleField = document.getElementById('wl-single-field');
                    wlSingleField.after(infoDiv);
                }
                
                return true;
                
            } catch (error) {
                // Ocultar indicador de carga
                wizardError.style.display = "none";
                
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
                
                wizardError.innerHTML = ` Error de validación: ${error.message}`;
                wizardError.className = 'text-danger small';
                wizardError.style.display = "block";
                
                console.error('Error completo:', error);
                
                return false;
            }
            
        } else if (wlMode === 'file') {
            if (!uploadedWavelengths || uploadedWavelengths.length === 0) {
                wizardError.innerText = "No hay datos experimentales cargados";
                wizardError.style.display = "block";
                return false;
            }
        }
        
        return true;
    }
    
    if (step === 2) {
        // VALIDACIÓN CORREGIDA DEL PASO 2
        
        // 1. Validar medio ambiente
        const ambientTypeElement = document.querySelector('input[name="ambient-type"]:checked');
        const ambientType = ambientTypeElement ? ambientTypeElement.value : null;
        
        if (!ambientType) {
            wizardError.innerText = "Selecciona si el medio ambiente es homogéneo o heterogéneo.";
            wizardError.style.display = "block";
            return false;
        }
        
        // Solo validar componentes si es EMT
        if (ambientType === 'emt') {
            const ambientComponents = document.querySelectorAll('#ambient-emt-components .medium-emt-component');
            if (ambientComponents.length < 2) {
                wizardError.innerText = "El ambiente heterogéneo debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
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
                wizardError.innerHTML = `La suma de fracciones volumétricas del ambiente debe ser 1.0<br><small>Suma actual: ${ambientFractionSum.toFixed(3)}</small>`;
                wizardError.style.display = "block";
                return false;
            }
        }
        
        // 2. Validar sustrato
        const substrateTypeElement = document.querySelector('input[name="substrate-type"]:checked');
        const substrateType = substrateTypeElement ? substrateTypeElement.value : null;
        
        if (!substrateType) {
            wizardError.innerText = "Selecciona si el sustrato es homogéneo o heterogéneo.";
            wizardError.style.display = "block";
            return false;
        }
        
        // Solo validar componentes si es EMT
        if (substrateType === 'emt') {
            const substrateComponents = document.querySelectorAll('#substrate-emt-components .medium-emt-component');
            if (substrateComponents.length < 2) {
                wizardError.innerText = "El sustrato heterogéneo debe tener al menos 2 componentes.";
                wizardError.style.display = "block";
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
                wizardError.innerHTML = `La suma de fracciones volumétricas del sustrato debe ser 1.0<br><small>Suma actual: ${substrateFractionSum.toFixed(3)}</small>`;
                wizardError.style.display = "block";
                return false;
            }
        }
        
        // Si llegamos aquí, el paso 2 es válido
        console.log('✅ Paso 2 validado correctamente');
        return true;
    }
    
    if (step === 3) {
        // No validar nada en el paso 3, permitir capas vacías
        return true;
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
    //  Verificar si es EMT
    const typeRadio = document.querySelector(`input[name="${medium}-type"]:checked`);
    const isEMT = typeRadio && typeRadio.value === 'emt';
    
    if (isEMT) {
        //  Recopilar datos EMT
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
        //  Recopilar datos homogéneos (normal)
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
            // NUEVO: Ecuación personalizada LaTeX
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

// FUNCIÓN ACTUALIZADA: Recopilar datos de capa
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
            data.optimize_params = {};
            const inputs = layerElement.querySelectorAll(".layer-param");
            inputs.forEach(inp => {
                const paramName = inp.dataset.param;
                const val = inp.value.trim();
                data.params[paramName] = val !== '' ? Number(val) : null;

                // Buscar checkbox de optimización correspondiente
                const optimizeCheckbox = layerElement.querySelector(`.optimize-param[data-param="${paramName}"]`);
                if (optimizeCheckbox) {
                    data.optimize_params[paramName] = optimizeCheckbox.checked;
                }
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
        //  Capa heterogénea (EMT)
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
        
        // ⭐ NUEVO: Actualizar el banner con información detallada
        updateModelSavedBanner(savedModel, result.filename);
        
        console.log("✓ Modelo guardado exitosamente:", result.filename);
        
    } catch (error) {
        wizardError.innerText = "Error al guardar: " + error.message;
        wizardError.style.display = "block";
    } finally {
        wizardSaveBtn.disabled = false;
        wizardSaveBtn.innerText = "Guardar modelo";
    }
});

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
    
    // ⭐ Event listener para "Calcular teóricos"
    document.getElementById("calculate-theoretical-btn").addEventListener("click", () => {
        calculateTheoreticalPsiDelta();
    });
}

// ==========================================
// FUNCIÓN: Calcular Psi y Delta teóricos
// ==========================================
async function calculateTheoreticalPsiDelta() {
    try {
        console.log("=".repeat(60));
        console.log("INICIO CÁLCULO DE PSI Y DELTA TEÓRICOS");
        console.log("=".repeat(60));
        
        // 1. Verificar que existe el modelo guardado
        if (!savedModel) {
            alert("Error: No hay un modelo óptico guardado. Por favor, guarde el modelo primero.");
            return;
        }
        
        // 2. Verificar que existen datos experimentales
        if (!currentData || !uploadedFileData || uploadedFileData.length === 0) {
            alert("Error: No hay datos experimentales cargados. Por favor, suba un archivo con datos experimentales primero.");
            return;
        }
        
        // 3. Extraer datos experimentales
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
        
        // 4. Mostrar banner de cálculo en progreso
        showCalculationProgressBanner();
        
        // 5. Preparar request
        const requestData = {
            model: savedModel,
            experimental_data: {
                wavelengths: wavelengths_exp,
                psi_exp: psi_exp,
                delta_exp: delta_exp
            }
        };
        
        // 6. Llamar al endpoint
        console.log("Enviando request al backend...");
        const response = await fetch('/api/calculate-theoretical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        console.log("Respuesta recibida:", result.success ? "✓ Éxito" : "✗ Error");
        
        // 7. Verificar resultado
        if (!response.ok || !result.success) {
            const errorMsg = result.error || 'Error desconocido en el cálculo';
            const suggestion = result.suggestion || '';
            console.error("Error en cálculo:", errorMsg);
            showCalculationErrorBanner(errorMsg, suggestion);
            return;
        }
        
        // 8. Mostrar resultados exitosos
        console.log(`✓ Cálculo completado en ${result.calculation_time} s`);
        console.log(`  χ² = ${result.goodness_of_fit.chi_squared.toFixed(4)}`);
        console.log(`  χ²ᵣ = ${result.goodness_of_fit.chi_squared_reduced.toFixed(4)}`);
        console.log("=".repeat(60));
        
        showCalculationResultsBanner(result);
        
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
    const fitQuality = gof.fit_quality;
    
    // Determinar color del badge según calidad
    const badgeClass = `badge bg-${fitQuality.color}`;
    
    banner.innerHTML = `
        <div class="alert alert-${fitQuality.color}" style="margin: 0;">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h6 class="mb-1">✓ Cálculo completado (${result.calculation_time} s)</h6>
                    <p class="mb-0 small text-muted">
                        Psi y Delta teóricos calculados para ${result.points_calculated} longitudes de onda
                    </p>
                </div>
                <span class="${badgeClass}" style="font-size: 0.9em;">
                    ${fitQuality.label}
                </span>
            </div>
            
            <div class="card mb-3">
                <div class="card-body" style="padding: 1rem;">
                    <h6 class="card-title mb-2">Análisis de ajuste (Chi-cuadrado)</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <p class="mb-1"><strong>χ² =</strong> ${gof.chi_squared.toFixed(4)}</p>
                            <p class="mb-1"><strong>χ² reducido =</strong> ${gof.chi_squared_reduced.toFixed(4)}</p>
                        </div>
                        <div class="col-md-6">
                            <p class="mb-1 small">${fitQuality.message}</p>
                        </div>
                    </div>
                    
                    <hr class="my-2">
                    
                    <div class="row small">
                        <div class="col-md-6">
                            <strong>Psi:</strong>
                            <ul class="mb-0" style="list-style: none; padding-left: 0;">
                                <li>RMSE: ${gof.psi_metrics.rmse.toFixed(3)}°</li>
                                <li>R²: ${gof.psi_metrics.r_squared.toFixed(4)}</li>
                                <li>Error máx: ${gof.psi_metrics.max_error.toFixed(3)}°</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <strong>Delta:</strong>
                            <ul class="mb-0" style="list-style: none; padding-left: 0;">
                                <li>RMSE: ${gof.delta_metrics.rmse.toFixed(3)}°</li>
                                <li>R²: ${gof.delta_metrics.r_squared.toFixed(4)}</li>
                                <li>Error máx: ${gof.delta_metrics.max_error.toFixed(3)}°</li>
                            </ul>
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
                <button class="btn btn-sm btn-primary" onclick="proceedToOptimization()">
                    Proceder a optimización
                </button>
            </div>
        </div>
    `;
    
    // Guardar resultados globalmente para uso posterior
    window.theoreticalResults = result;
}

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

updateMediumFieldsEnhanced('ambient', 'constant');
updateMediumFieldsEnhanced('substrate', 'glass');

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

// ==========================================
// VALIDACIÓN Y CÁLCULO DE n,k EFECTIVOS EMT
// ==========================================

/**
 * Valida y calcula n,k efectivos para un medio heterogéneo (EMT)
 * Se ejecuta cuando el usuario completa la configuración de un medio EMT
 * 
 * @param {string} mediumType - 'ambient', 'substrate', o 'layer'
 * @param {string} mediumIdentifier - ID del medio o capa (para layers es el índice)
 * @returns {Promise<Object>} Resultado de la validación con n,k efectivos
 */
async function validateAndCalculateEMT(mediumType, mediumIdentifier = null) {
    try {
        // 1. Recopilar datos según el tipo de medio
        let requestData = {
            medium_type: mediumType,
            medium_name: '',
            emt_model: '',
            wavelengths: [],
            components: []
        };

        // 2. Obtener longitudes de onda del wizard
        requestData.wavelengths = getWavelengthsFromWizard();

        if (requestData.wavelengths.length === 0) {
            showEMTError('No se han definido longitudes de onda. Complete el Paso 1 primero.');
            return null;
        }

        // 3. Recopilar datos específicos según el medio
        if (mediumType === 'ambient') {
            requestData = await collectAmbientEMTData(requestData);
        } else if (mediumType === 'substrate') {
            requestData = await collectSubstrateEMTData(requestData);
        } else if (mediumType === 'layer') {
            requestData = await collectLayerEMTData(mediumIdentifier, requestData);
        }

        // 4. Validar que tenemos todos los datos necesarios
        if (requestData.components.length < 2) {
            showEMTError('Se requieren al menos 2 componentes para EMT');
            return null;
        }

        // 5. Llamar al endpoint de validación
        const response = await fetch('/api/validate-emt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            showEMTError(result.error || 'Error desconocido en validación EMT');
            return null;
        }

        // 6. Mostrar resultados exitosos
        showEMTSuccess(result, mediumType, mediumIdentifier);

        return result;

    } catch (error) {
        console.error('Error en validateAndCalculateEMT:', error);
        showEMTError('Error de conexión: ' + error.message);
        return null;
    }
}

/**
 * Obtiene las longitudes de onda configuradas en el wizard (Paso 1)
 */
function getWavelengthsFromWizard() {
    const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;

    if (wlMode === 'file' && uploadedWavelengths && uploadedWavelengths.length > 0) {
        return uploadedWavelengths;
    } else if (wlMode === 'range') {
        const from = parseFloat(document.getElementById('input-wl-from').value);
        const to = parseFloat(document.getElementById('input-wl-to').value);
        const steps = parseInt(document.getElementById('input-wl-steps').value);

        if (isNaN(from) || isNaN(to) || isNaN(steps) || steps < 2) {
            return [];
        }

        // Generar array lineal
        const wavelengths = [];
        const stepSize = (to - from) / (steps - 1);
        for (let i = 0; i < steps; i++) {
            wavelengths.push(from + i * stepSize);
        }
        return wavelengths;
    } else if (wlMode === 'single') {
        const single = parseFloat(document.getElementById('input-wl-single').value);
        return isNaN(single) ? [] : [single];
    }

    return [];
}

/**
 * Recopila datos EMT del medio ambiente
 */
async function collectAmbientEMTData(requestData) {
    requestData.medium_name = 'Medio ambiente (incidente)';
    requestData.emt_model = document.getElementById('ambient-emt-model').value;

    const componentsDiv = document.getElementById('ambient-emt-components');
    const componentElements = componentsDiv.querySelectorAll('.medium-emt-component');

    for (const compEl of componentElements) {
        const compData = await extractComponentData(compEl);
        if (compData) {
            requestData.components.push(compData);
        }
    }

    return requestData;
}

/**
 * Recopila datos EMT del sustrato
 */
async function collectSubstrateEMTData(requestData) {
    requestData.medium_name = 'Sustrato';
    requestData.emt_model = document.getElementById('substrate-emt-model').value;

    const componentsDiv = document.getElementById('substrate-emt-components');
    const componentElements = componentsDiv.querySelectorAll('.medium-emt-component');

    for (const compEl of componentElements) {
        const compData = await extractComponentData(compEl);
        if (compData) {
            requestData.components.push(compData);
        }
    }

    return requestData;
}

/**
 * Recopila datos EMT de una capa
 */
async function collectLayerEMTData(layerIndex, requestData) {
    const layerElement = document.querySelector(`.layer-card[data-idx="${layerIndex}"]`);
    
    if (!layerElement) {
        throw new Error('Capa no encontrada');
    }

    const layerName = layerElement.querySelector('.layer-name').value;
    requestData.medium_name = layerName;
    requestData.emt_model = layerElement.querySelector('.emt-model-select').value;

    const componentsDiv = layerElement.querySelector('.emt-components-container');
    const componentElements = componentsDiv.querySelectorAll('.emt-component');

    for (const compEl of componentElements) {
        const compData = await extractComponentData(compEl, true); // true = es capa
        if (compData) {
            requestData.components.push(compData);
        }
    }

    return requestData;
}

/**
 * Extrae datos de un componente individual
 * @param {HTMLElement} compEl - Elemento DOM del componente
 * @param {boolean} isLayer - true si es componente de capa, false si es de medio
 */
async function extractComponentData(compEl, isLayer = false) {
    const compData = {};

    // Nombre
    const nameInput = compEl.querySelector(isLayer ? '.component-name' : '.medium-component-name');
    compData.name = nameInput ? nameInput.value : 'Sin nombre';

    // Fracción volumétrica
    const fractionInput = compEl.querySelector(isLayer ? '.component-fraction' : '.medium-component-fraction');
    const isPercent = compEl.querySelector(isLayer ? '.fraction-is-percent' : '.medium-fraction-percent')?.checked;
    
    let fraction = parseFloat(fractionInput.value);
    if (isPercent) {
        fraction = fraction / 100.0;
    }
    compData.fraction = fraction;

    // Modelo de dispersión
    const modelSelect = compEl.querySelector(isLayer ? '.component-model' : '.medium-component-model');
    const model = modelSelect.value;
    compData.model = model;

    // Parámetros según el modelo
    if (model === 'constant') {
        const nInput = compEl.querySelector(isLayer ? '.component-n' : '.medium-comp-n');
        const kInput = compEl.querySelector(isLayer ? '.component-k' : '.medium-comp-k');
        compData.n = parseFloat(nInput.value);
        compData.k = parseFloat(kInput.value);
    
    } else if (model === 'custom') {
        const equationInput = compEl.querySelector('.latex-equation-value');
        compData.equation = equationInput ? equationInput.value : '';
        compData.params = { equation: compData.equation };
    
    } else if (dispersionTemplates[model]) {
        // Modelos como cauchy, sellmeier, drude, lorentz
        compData.params = {};
        const paramInputs = compEl.querySelectorAll(isLayer ? '.component-param' : '.medium-comp-param');
        
        paramInputs.forEach(inp => {
            const paramName = inp.dataset.param;
            const value = inp.value.trim();
            if (value !== '') {
                compData.params[paramName] = parseFloat(value);
            }
        });
    
    } else if (model === 'file_nk' || model === 'file_epsilon') {
        // Datos de archivo - aquí necesitarías tener optical_data ya cargado
        // Por simplicidad, asumimos que ya se procesó antes
        console.warn('Validación EMT con archivos requiere que los datos ya estén cargados');
        // compData.optical_data se debería haber procesado previamente
    }

    return compData;
}

/**
 * Muestra mensaje de error en validación EMT
 */
function showEMTError(message) {
    // Crear alerta temporal
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        <strong>❌ Error en validación EMT:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insertar al inicio del modal body
    const modalBody = document.querySelector('#modelWizardModal .modal-body');
    modalBody.insertBefore(alert, modalBody.firstChild);

    // Auto-cerrar después de 8 segundos
    setTimeout(() => {
        alert.remove();
    }, 8000);
}

/**
 * Muestra resultados exitosos de validación EMT
 */
function showEMTSuccess(result, mediumType, mediumIdentifier) {
    const stats = result.statistics;
    const validation = result.validation;

    // Crear elemento de éxito
    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success alert-dismissible fade show mt-3';
    successDiv.innerHTML = `
        <h6 class="alert-heading"> n,k efectivos calculados con éxito</h6>
        <p class="mb-2"><strong>${result.medium_name}</strong> - Modelo: ${validation.emt_model}</p>
        <ul class="small mb-2">
            <li>Componentes: ${validation.components_count}</li>
            <li>Puntos: ${validation.wavelength_points} longitudes de onda</li>
            <li>Suma de fracciones: ${validation.fraction_sum.toFixed(3)} ✓</li>
        </ul>
        <hr>
        <p class="mb-2"><strong>Estadísticas de n efectivo:</strong></p>
        <ul class="small mb-2">
            <li>n mín: ${stats.n_min.toFixed(4)}, máx: ${stats.n_max.toFixed(4)}, promedio: ${stats.n_mean.toFixed(4)}</li>
            <li>k mín: ${stats.k_min.toFixed(6)}, máx: ${stats.k_max.toFixed(6)}, promedio: ${stats.k_mean.toFixed(6)}</li>
        </ul>
        <div class="mt-2">
            <button class="btn btn-sm btn-primary download-nk-btn" data-csv="${result.download_csv}">
                Descargar n,k efectivos (CSV)
            </button>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insertar en el contenedor apropiado
    let targetContainer;
    
    if (mediumType === 'ambient') {
        targetContainer = document.getElementById('ambient-emt-config');
    } else if (mediumType === 'substrate') {
        targetContainer = document.getElementById('substrate-emt-config');
    } else if (mediumType === 'layer') {
        const layerElement = document.querySelector(`.layer-card[data-idx="${mediumIdentifier}"]`);
        targetContainer = layerElement.querySelector('.heterogeneous-config');
    }

    // Remover alertas previas de éxito en este contenedor
    const existingAlerts = targetContainer.querySelectorAll('.alert-success');
    existingAlerts.forEach(alert => alert.remove());

    // Agregar nueva alerta
    targetContainer.appendChild(successDiv);

    // Event listener para botón de descarga
    const downloadBtn = successDiv.querySelector('.download-nk-btn');
    downloadBtn.addEventListener('click', () => {
        downloadCSVFromBase64(result.download_csv, `${result.medium_name.replace(/\s+/g, '_')}_n_k_efectivos.csv`);
    });
}

/**
 * Descarga archivo CSV desde data URI base64
 */
function downloadCSVFromBase64(dataURI, filename) {
    const link = document.createElement('a');
    link.href = dataURI;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Agrega botón "Calcular n,k efectivos" a la interfaz EMT
 */
function addCalculateEMTButton(containerSelector, mediumType, mediumIdentifier = null) {
    const container = document.querySelector(containerSelector);
    
    if (!container) return;

    // Verificar si ya existe el botón
    if (container.querySelector('.calculate-emt-btn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-warning btn-sm w-100 mt-2 calculate-emt-btn';
    button.innerHTML = '🧮 Calcular y verificar n,k efectivos';

    button.addEventListener('click', async () => {
        button.disabled = true;
        button.innerHTML = '⏳ Calculando...';

        await validateAndCalculateEMT(mediumType, mediumIdentifier);

        button.disabled = false;
        button.innerHTML = 'Calcular y verificar n,k efectivos';
    });

    container.appendChild(button);
}


// ⭐ NUEVA FUNCIÓN: Crear campo de parámetro con vista previa en tiempo real
// Crear campo de parametro con vista previa
function createParamFieldWithPreview(param, prefix = '', onChangeCb = null) {
    const inputId = `${prefix}${param.name}`;
    const field = document.createElement('div');
    field.className = 'param-field mb-2';
    field.innerHTML = `
        <label class="form-label small mb-1">${param.placeholder}</label>
        <div class="input-group input-group-sm">
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
                <span class="input-group-text">Opt</span>
            ` : ''}
        </div>
    `;
    
    const input = field.querySelector('input[type="number"]');
    if (input && onChangeCb) {
        input.addEventListener('input', onChangeCb);
    }
    
    return field;
}

// ⭐ NUEVA FUNCIÓN: Mostrar ecuación en tiempo real con INTERFAZ DIVIDIDA
// Mostrar ecuacion en tiempo real con INTERFAZ DIVIDIDA
function showEquationPreviewSplit(container, model, getAllParams) {
    const template = window.dispersionTemplates[model];
    if (!template || !template.previewFn) return;
    
    let previewSection = container.querySelector('.equation-preview-split');
    if (!previewSection) {
        previewSection = document.createElement('div');
        previewSection.className = 'equation-preview-split row mt-3';
        previewSection.innerHTML = `
            <div class="col-md-6 params-side">
                <!-- Los parametros YA ESTAN insertados antes de esta seccion -->
            </div>
            <div class="col-md-6">
                <h6 class="text-muted small mb-2 fw-bold">Vista previa de ecuación:</h6>
                <div class="equation-column border rounded p-3 bg-white" style="min-height: 150px;">
                    <!-- Ecuación del modelo (fija) -->
                    <div class="mb-3 pb-3 border-bottom">
                        <small class="text-muted fw-bold d-block mb-2">📐 Modelo ${template.label}:</small>
                        <div class="equation-template text-center p-2 bg-light rounded">
                            $$${template.equation}$$
                        </div>
                    </div>
                    
                    <!--Ecuación con valores (dinámica) -->
                    <div class="mb-3">
                        <small class="text-muted fw-bold d-block mb-2">✨ Con tus valores:</small>
                        <div class="equation-display text-center">
                            <!-- Ecuación renderizada con valores -->
                        </div>
                    </div>
                    
                    ${template.helpText ? `
                        <div class="alert alert-info small mb-3">
                            ${template.helpText}
                        </div>
                    ` : ''}
                    
                    <hr>
                    <div class="equation-actions">
                        <p class="mb-2 small"><strong>¿Verificaste la ecuación?</strong></p>
                        <div class="btn-group w-100" role="group">
                            <input type="radio" class="btn-check confirm-equation" name="confirm-eq-${Date.now()}" id="confirm-yes-${Date.now()}" value="yes">
                            <label class="btn btn-outline-success btn-sm" for="confirm-yes-${Date.now()}">✅ Confirmar</label>
                            
                            <input type="radio" class="btn-check confirm-equation" name="confirm-eq-${Date.now()}" id="confirm-no-${Date.now()}" value="no" checked>
                            <label class="btn btn-outline-warning btn-sm" for="confirm-no-${Date.now()}">✏️ Modificar</label>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(previewSection);
        
        // MOVER parametros a la columna izquierda
        const paramsSide = previewSection.querySelector('.params-side');
        const existingParams = container.querySelectorAll('.param-field, .btn-outline-primary, .dynamic-oscillator');
        
        existingParams.forEach(el => {
            if (!previewSection.contains(el)) {
                paramsSide.appendChild(el);
            }
        });
    }
    
    const params = getAllParams();
    const equationLatex = template.previewFn(params);
    
    const equationDisplay = previewSection.querySelector('.equation-display');
    equationDisplay.innerHTML = `$$${equationLatex}$$`;
    
    if (window.MathJax) {
        MathJax.typesetPromise([previewSection]);
    }
    
    const confirmRadios = previewSection.querySelectorAll('.confirm-equation');
    confirmRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const confirmed = previewSection.querySelector('input[value="yes"]:checked');
            const paramsSide = previewSection.querySelector('.params-side');
            
            if (confirmed) {
                paramsSide.style.opacity = '0.7';
                paramsSide.style.pointerEvents = 'none';
                previewSection.classList.add('equation-confirmed');
            } else {
                paramsSide.style.opacity = '1';
                paramsSide.style.pointerEvents = 'auto';
                previewSection.classList.remove('equation-confirmed');
            }
        });
    });
}

// NUEVA FUNCIÓN: Agregar oscilador dinámico (para Sellmeier/Lorentz)
// Agregar oscilador dinamico
function addDynamicOscillator(container, model, currentCount) {
    const template = window.dispersionTemplates[model];
    if (!template || !template.generateDynamicParam) return null;
    
    const nextIndex = currentCount + 1;
    if (nextIndex > template.maxOscillators) {
        const termName = template.termName;
        const termNamePlural = termName + 's';
        alert(`Máximo ${template.maxOscillators} ${termNamePlural} permitidos`);
        return null;
    }
    
    const newParams = template.generateDynamicParam(nextIndex);
    const dynamicSection = document.createElement('div');
    dynamicSection.className = 'dynamic-oscillator border-start border-3 border-primary ps-2 mb-2';
    dynamicSection.dataset.oscIndex = nextIndex;
    
    // Obtener nombre del término
    const termName = template.termName;
    const termNameCapitalized = termName.charAt(0).toUpperCase() + termName.slice(1);
    
    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center mb-1';
    header.innerHTML = `
        <small class="fw-bold text-primary">${termNameCapitalized} ${nextIndex}</small>
        <button type="button" class="btn btn-sm btn-outline-danger remove-oscillator">X</button>
    `;
    dynamicSection.appendChild(header);
    
    newParams.forEach(param => {
        const field = createParamFieldWithPreview(param, `dyn-${model}-${nextIndex}-`);
        dynamicSection.appendChild(field);
    });
    
    return dynamicSection;
}

// NUEVA FUNCIÓN: Actualizar vista previa cuando cambian los parámetros
function setupLivePreview(container, model) {
    const template = window.dispersionTemplates[model];
    if (!template) return;
    
    // Función para obtener todos los parámetros
    const getAllParams = () => {
        const params = {};
        const inputs = container.querySelectorAll('.layer-param');
        inputs.forEach(inp => {
            const paramName = inp.dataset.param;
            const value = inp.value.trim();
            if (value !== '') {
                params[paramName] = parseFloat(value);
            }
        });
        return params;
    };
    
    // Actualizar vista previa
    const updatePreview = () => {
        showEquationPreviewSplit(container, model, getAllParams);
    };
    
    // Agregar listeners a todos los inputs existentes
    const inputs = container.querySelectorAll('.layer-param');
    inputs.forEach(inp => {
        inp.addEventListener('input', updatePreview);
    });
    
    // Vista previa inicial
    updatePreview();
    
    return { getAllParams, updatePreview };
}

function updateModelFieldsEnhanced(container, model, prefix = '') {
    container.innerHTML = '';
    
    const template = window.dispersionTemplates[model];
    if (!template) return;
    
    // NUEVO: Manejo especial para Drude-Lorentz
    if (model === 'drude-lorentz') {
        // 1. Parámetro global (ε∞)
        const globalParam = template.params.find(p => !p.group);
        if (globalParam) {
            const field = createParamFieldWithPreview(globalParam, prefix);
            container.appendChild(field);
        }
        
        // 2. Sección Drude
        const drudeHeader = document.createElement('div');
        drudeHeader.className = 'mt-3 mb-2 p-2 bg-primary bg-opacity-10 rounded';
        drudeHeader.innerHTML = '<strong class="text-primary">🔹 Término Drude (portadores libres)</strong>';
        container.appendChild(drudeHeader);
        
        template.params.filter(p => p.group === 'drude').forEach(param => {
            const field = createParamFieldWithPreview(param, prefix);
            container.appendChild(field);
        });
        
        // 3. Sección Lorentz
        const lorentzHeader = document.createElement('div');
        lorentzHeader.className = 'mt-3 mb-2 p-2 bg-success bg-opacity-10 rounded';
        lorentzHeader.innerHTML = '<strong class="text-success">🔹 Osciladores Lorentz (transiciones ligadas)</strong>';
        container.appendChild(lorentzHeader);
        
        template.params.filter(p => p.group === 'lorentz').forEach(param => {
            const field = createParamFieldWithPreview(param, prefix);
            container.appendChild(field);
        });
        
    } else {
        // Parámetros normales para otros modelos
        template.params.forEach(param => {
            const field = createParamFieldWithPreview(param, prefix);
            container.appendChild(field);
        });
    }
    
    // Setup live preview PRIMERO
    const previewControls = setupLivePreview(container, model);
    
    // Botón para agregar términos/osciladores
    if (template.maxOscillators) {
        const addOscBtn = document.createElement('button');
        addOscBtn.type = 'button';
        addOscBtn.className = 'btn btn-sm btn-outline-primary w-100 mb-2 mt-2';
        
        const termName = template.termName;
        const termNamePlural = termName + 's';
        
        addOscBtn.innerHTML = `+ Agregar ${termName} (máximo ${template.maxOscillators})`;
        addOscBtn.dataset.oscCount = '1';
        
        addOscBtn.addEventListener('click', () => {
            const currentCount = parseInt(addOscBtn.dataset.oscCount);
            
            if (currentCount >= template.maxOscillators) {
                alert(`Ya alcanzaste el máximo de ${template.maxOscillators} ${termNamePlural}`);
                return;
            }
            
            const newOsc = addDynamicOscillator(container, model, currentCount);
            
            if (newOsc) {
                // Insertar en params-side
                const previewSection = container.querySelector('.equation-preview-split');
                if (previewSection) {
                    const paramsSide = previewSection.querySelector('.params-side');
                    paramsSide.insertBefore(newOsc, addOscBtn);
                } else {
                    container.insertBefore(newOsc, addOscBtn);
                }
                
                addOscBtn.dataset.oscCount = currentCount + 1;
                
                // Actualizar texto del botón
                const remaining = template.maxOscillators - (currentCount + 1);
                if (remaining === 0) {
                    addOscBtn.disabled = true;
                    addOscBtn.innerHTML = `Máximo de ${termNamePlural} alcanzado`;
                } else {
                    addOscBtn.innerHTML = `+ Agregar ${termName} (${remaining} disponibles)`;
                }
                
                // Listener para remover
                const removeBtn = newOsc.querySelector('.remove-oscillator');
                removeBtn.addEventListener('click', () => {
                    newOsc.remove();
                    const newCount = parseInt(addOscBtn.dataset.oscCount) - 1;
                    addOscBtn.dataset.oscCount = newCount;
                    
                    // Rehabilitar botón
                    addOscBtn.disabled = false;
                    const remaining = template.maxOscillators - newCount;
                    addOscBtn.innerHTML = `+ Agregar ${termName} (${remaining} disponibles)`;
                    
                    previewControls.updatePreview();
                });
                
                // Listeners para actualizar vista previa
                const newInputs = newOsc.querySelectorAll('.layer-param');
                newInputs.forEach(inp => {
                    inp.addEventListener('input', previewControls.updatePreview);
                });
                
                previewControls.updatePreview();
            }
        });
        
        container.appendChild(addOscBtn);
        
        // Mover botón a params-side
        setTimeout(() => {
            const previewSection = container.querySelector('.equation-preview-split');
            if (previewSection) {
                const paramsSide = previewSection.querySelector('.params-side');
                if (paramsSide && !paramsSide.contains(addOscBtn)) {
                    paramsSide.appendChild(addOscBtn);
                }
            }
        }, 100);
    }
    
    return previewControls;
}

// ========================================
// FUNCIÓN PARA ACTUALIZAR updateMediumFields
// ========================================
// Reemplaza la función updateMediumFields existente con esta versión mejorada


function updateMediumFieldsEnhanced(medium, modelType) {
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
    } else if (window.dispersionTemplates[modelType]) {
        // Usar la función mejorada con interfaz dividida
        updateModelFieldsEnhanced(paramsDiv, modelType, `${medium}-`);


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

async function validateAndCalculateEMT(mediumType, mediumIdentifier = null) {
    try {
        let requestData = {
            medium_type: mediumType,
            medium_name: '',
            emt_model: '',
            wavelengths: [],
            components: []
        };

        requestData.wavelengths = getWavelengthsFromWizard();

        if (requestData.wavelengths.length === 0) {
            showEMTError('No se han definido longitudes de onda. Complete el Paso 1 primero.');
            return null;
        }

        if (mediumType === 'ambient') {
            requestData = await collectAmbientEMTData(requestData);
        } else if (mediumType === 'substrate') {
            requestData = await collectSubstrateEMTData(requestData);
        } else if (mediumType === 'layer') {
            requestData = await collectLayerEMTData(mediumIdentifier, requestData);
        }

        if (requestData.components.length < 2) {
            showEMTError('Se requieren al menos 2 componentes para EMT');
            return null;
        }

        const response = await fetch('/api/validate-emt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            showEMTError(result.error || 'Error desconocido en validación EMT');
            return null;
        }

        showEMTSuccess(result, mediumType, mediumIdentifier);
        return result;

    } catch (error) {
        console.error('Error en validateAndCalculateEMT:', error);
        showEMTError('Error de conexión: ' + error.message);
        return null;
    }
}

function getWavelengthsFromWizard() {
    const wlMode = document.querySelector('input[name="wl-option"]:checked')?.value;

    if (wlMode === 'file' && uploadedWavelengths && uploadedWavelengths.length > 0) {
        return uploadedWavelengths;
    } else if (wlMode === 'range') {
        const from = parseFloat(document.getElementById('input-wl-from').value);
        const to = parseFloat(document.getElementById('input-wl-to').value);
        const steps = parseInt(document.getElementById('input-wl-steps').value);

        if (isNaN(from) || isNaN(to) || isNaN(steps) || steps < 2) {
            return [];
        }

        const wavelengths = [];
        const stepSize = (to - from) / (steps - 1);
        for (let i = 0; i < steps; i++) {
            wavelengths.push(from + i * stepSize);
        }
        return wavelengths;
    } else if (wlMode === 'single') {
        const single = parseFloat(document.getElementById('input-wl-single').value);
        return isNaN(single) ? [] : [single];
    }

    return [];
}

async function collectAmbientEMTData(requestData) {
    requestData.medium_name = 'Medio ambiente (incidente)';
    requestData.emt_model = document.getElementById('ambient-emt-model').value;

    const componentsDiv = document.getElementById('ambient-emt-components');
    const componentElements = componentsDiv.querySelectorAll('.medium-emt-component');

    for (const compEl of componentElements) {
        const compData = await extractComponentData(compEl);
        if (compData) {
            requestData.components.push(compData);
        }
    }

    return requestData;
}

async function collectSubstrateEMTData(requestData) {
    requestData.medium_name = 'Sustrato';
    requestData.emt_model = document.getElementById('substrate-emt-model').value;

    const componentsDiv = document.getElementById('substrate-emt-components');
    const componentElements = componentsDiv.querySelectorAll('.medium-emt-component');

    for (const compEl of componentElements) {
        const compData = await extractComponentData(compEl);
        if (compData) {
            requestData.components.push(compData);
        }
    }

    return requestData;
}

async function collectLayerEMTData(layerIndex, requestData) {
    const layerElement = document.querySelector(`.layer-card[data-idx="${layerIndex}"]`);
    
    if (!layerElement) {
        throw new Error('Capa no encontrada');
    }

    const layerName = layerElement.querySelector('.layer-name').value;
    requestData.medium_name = layerName;
    requestData.emt_model = layerElement.querySelector('.emt-model-select').value;

    const componentsDiv = layerElement.querySelector('.emt-components-container');
    const componentElements = componentsDiv.querySelectorAll('.emt-component');

    for (const compEl of componentElements) {
        const compData = await extractComponentData(compEl, true);
        if (compData) {
            requestData.components.push(compData);
        }
    }

    return requestData;
}

async function extractComponentData(compEl, isLayer = false) {
    const compData = {};

    const nameInput = compEl.querySelector(isLayer ? '.component-name' : '.medium-component-name');
    compData.name = nameInput ? nameInput.value : 'Sin nombre';

    const fractionInput = compEl.querySelector(isLayer ? '.component-fraction' : '.medium-component-fraction');
    const isPercent = compEl.querySelector(isLayer ? '.fraction-is-percent' : '.medium-fraction-percent')?.checked;
    
    let fraction = parseFloat(fractionInput.value);
    if (isPercent) {
        fraction = fraction / 100.0;
    }
    compData.fraction = fraction;

    const modelSelect = compEl.querySelector(isLayer ? '.component-model' : '.medium-component-model');
    const model = modelSelect.value;
    compData.model = model;

    if (model === 'constant') {
        const nInput = compEl.querySelector(isLayer ? '.component-n' : '.medium-comp-n');
        const kInput = compEl.querySelector(isLayer ? '.component-k' : '.medium-comp-k');
        compData.n = parseFloat(nInput.value);
        compData.k = parseFloat(kInput.value);
    
    } else if (model === 'custom') {
        const equationInput = compEl.querySelector('.latex-equation-value');
        compData.equation = equationInput ? equationInput.value : '';
        compData.params = { equation: compData.equation };
    
    } else if (window.dispersionTemplates[model]) {
        compData.params = {};
        const paramInputs = compEl.querySelectorAll(isLayer ? '.component-param' : '.medium-comp-param');
        
        paramInputs.forEach(inp => {
            const paramName = inp.dataset.param;
            const value = inp.value.trim();
            if (value !== '') {
                compData.params[paramName] = parseFloat(value);
            }
        });
    
    } else if (model === 'file_nk' || model === 'file_epsilon') {
        console.warn('Validación EMT con archivos requiere que los datos ya estén cargados');
    }

    return compData;
}

function showEMTError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        <strong>Error en validación EMT:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const modalBody = document.querySelector('#modelWizardModal .modal-body');
    modalBody.insertBefore(alert, modalBody.firstChild);

    setTimeout(() => {
        alert.remove();
    }, 8000);
}

function showEMTSuccess(result, mediumType, mediumIdentifier) {
    const stats = result.statistics;
    const validation = result.validation;

    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success alert-dismissible fade show mt-3';
    successDiv.innerHTML = `
        <h6 class="alert-heading">n,k efectivos calculados con éxito</h6>
        <p class="mb-2"><strong>${result.medium_name}</strong> - Modelo: ${validation.emt_model}</p>
        <ul class="small mb-2">
            <li>Componentes: ${validation.components_count}</li>
            <li>Puntos: ${validation.wavelength_points} longitudes de onda</li>
            <li>Suma de fracciones: ${validation.fraction_sum.toFixed(3)} ✓</li>
        </ul>
        <hr>
        <p class="mb-2"><strong>Estadísticas de n efectivo:</strong></p>
        <ul class="small mb-2">
            <li>n mín: ${stats.n_min.toFixed(4)}, máx: ${stats.n_max.toFixed(4)}, promedio: ${stats.n_mean.toFixed(4)}</li>
            <li>k mín: ${stats.k_min.toFixed(6)}, máx: ${stats.k_max.toFixed(6)}, promedio: ${stats.k_mean.toFixed(6)}</li>
        </ul>
        <div class="mt-2">
            <button class="btn btn-sm btn-primary download-nk-btn" data-csv="${result.download_csv}">
                Descargar n,k efectivos (CSV)
            </button>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    let targetContainer;
    
    if (mediumType === 'ambient') {
        targetContainer = document.getElementById('ambient-emt-config');
    } else if (mediumType === 'substrate') {
        targetContainer = document.getElementById('substrate-emt-config');
    } else if (mediumType === 'layer') {
        const layerElement = document.querySelector(`.layer-card[data-idx="${mediumIdentifier}"]`);
        targetContainer = layerElement.querySelector('.heterogeneous-config');
    }

    const existingAlerts = targetContainer.querySelectorAll('.alert-success');
    existingAlerts.forEach(alert => alert.remove());

    targetContainer.appendChild(successDiv);

    const downloadBtn = successDiv.querySelector('.download-nk-btn');
    downloadBtn.addEventListener('click', () => {
        downloadCSVFromBase64(result.download_csv, `${result.medium_name.replace(/\s+/g, '_')}_n_k_efectivos.csv`);
    });
}

function downloadCSVFromBase64(dataURI, filename) {
    const link = document.createElement('a');
    link.href = dataURI;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function addCalculateEMTButton(containerSelector, mediumType, mediumIdentifier = null) {
    const container = document.querySelector(containerSelector);
    
    if (!container) return;

    if (container.querySelector('.calculate-emt-btn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-warning btn-sm w-100 mt-2 calculate-emt-btn';
    button.innerHTML = 'Calcular y verificar n,k efectivos';

    button.addEventListener('click', async () => {
        button.disabled = true;
        button.innerHTML = '⏳ Calculando...';

        await validateAndCalculateEMT(mediumType, mediumIdentifier);

        button.disabled = false;
        button.innerHTML = 'Calcular y verificar n,k efectivos';
    });

    container.appendChild(button);
}
// ⭐ FUNCIÓN: Calcular n,k efectivos para EMT y mostrar resultados
async function calculateEffectiveNK(medium, mediumName) {
    try {
        console.log('Iniciando cálculo EMT para:', medium, mediumName);
        
        // 1. Obtener longitudes de onda
        let wavelengths;
        try {
            wavelengths = getWavelengthsArray();
            console.log('Longitudes obtenidas:', wavelengths.length, 'puntos');
        } catch (error) {
            alert(`Error obteniendo longitudes de onda: ${error.message}`);
            return;
        }
        
        // 2. Obtener componentes
        const componentsContainer = document.getElementById(`${medium}-emt-components`);
        const componentDivs = componentsContainer.querySelectorAll('.medium-emt-component');
        
        if (componentDivs.length < 2) {
            alert('Se requieren al menos 2 componentes para calcular medio efectivo');
            return;
        }
        
        console.log('Componentes encontrados:', componentDivs.length);
        
        // 3. Preparar datos de componentes
        const components = [];
        
        for (const compDiv of componentDivs) {
            const name = compDiv.querySelector('.medium-component-name')?.value || 'Sin nombre';
            const fractionInput = compDiv.querySelector('.medium-component-fraction');
            const isPercent = compDiv.querySelector('.medium-fraction-percent')?.checked;
            let fraction = parseFloat(fractionInput?.value || 0);
            
            if (isPercent) {
                fraction = fraction / 100;
            }
            
            const model = compDiv.querySelector('.medium-component-model')?.value;
            
            const componentData = {
                name: name,
                fraction: fraction,
                model: model
            };
            
            // Agregar parámetros según el modelo
            if (model === 'constant') {
                componentData.n = parseFloat(compDiv.querySelector('.medium-comp-n')?.value || 1.5);
                componentData.k = parseFloat(compDiv.querySelector('.medium-comp-k')?.value || 0);
            } else if (window.dispersionTemplates[model]) {
                // Recolectar parámetros del modelo de dispersión
                const params = {};
                const paramInputs = compDiv.querySelectorAll('.layer-param');
                
                paramInputs.forEach(input => {
                    const paramName = input.dataset.param;
                    const value = parseFloat(input.value);
                    if (paramName && !isNaN(value)) {
                        params[paramName] = value;
                    }
                });
                
                componentData.params = params;
            }
            // TODO: Agregar soporte para archivos cuando se implemente
            
            components.push(componentData);
            console.log(`  ✓ Componente ${componentData.name}: fracción=${fraction}, modelo=${model}`);
        }
        
        // 4. Obtener modelo EMT
        const emtModel = document.getElementById(`${medium}-emt-model`)?.value || 'bruggeman';
        console.log(' Modelo EMT:', emtModel);
        
        // 5. Preparar request
        const requestData = {
            medium_type: medium,
            medium_name: mediumName,
            emt_model: emtModel,
            wavelengths: wavelengths,
            components: components
        };
        
        console.log('Enviando request:', requestData);
        
        // 6. Mostrar mensaje de carga
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'alert alert-info';
        loadingMsg.innerHTML = 'Calculando n,k efectivos...';
        componentsContainer.before(loadingMsg);
        
        // 7. Llamar al endpoint
        const response = await fetch('/api/validate-emt', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        console.log('Respuesta del servidor:', result);
        console.log('¿Tiene success?', result.success);
        console.log('¿Tiene statistics?', result.statistics);
        console.log('Claves del resultado:', Object.keys(result));

        // 8. Remover mensaje de carga
        loadingMsg.remove();
        
        // 9. Verificar respuesta
        if (!response.ok || !result.success) {
            const errorMsg = result.error || 'No se pudieron calcular n,k efectivos';
            console.error('Error del servidor:', errorMsg);
            alert(`Error: ${errorMsg}`);
            return;
        }
        
        // 10. Verificar que existen las estadísticas
        if (!result.statistics) {
            console.error('Error: resultado no contiene statistics', result);
            alert('Error: La respuesta del servidor no tiene el formato esperado (falta statistics)');
            return;
        }
        
        const stats = result.statistics;
        console.log('Estadísticas recibidas:', stats);
        
        // 11. Mostrar resultado exitoso
        const successDiv = document.createElement('div');
        successDiv.className = 'alert alert-success alert-dismissible fade show';
        successDiv.innerHTML = `
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            <h5>n,k efectivos calculados exitosamente</h5>
            <p><strong>${mediumName}</strong> - Modelo: ${emtModel}</p>
            <hr>
            <div class="row">
                <div class="col-md-6">
                    <strong>Estadísticas de n:</strong>
                    <ul class="mb-0">
                        <li>Mínimo: ${stats.n_min.toFixed(4)}</li>
                        <li>Máximo: ${stats.n_max.toFixed(4)}</li>
                        <li>Promedio: ${stats.n_mean.toFixed(4)}</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <strong>Estadísticas de k:</strong>
                    <ul class="mb-0">
                        <li>Mínimo: ${stats.k_min.toFixed(6)}</li>
                        <li>Máximo: ${stats.k_max.toFixed(6)}</li>
                        <li>Promedio: ${stats.k_mean.toFixed(6)}</li>
                    </ul>
                </div>
            </div>
            <hr>
            <div class="d-flex gap-2 mt-3">
                <a href="${result.download_csv}" download="nk_efectivos_${medium}_${Date.now()}.csv" class="btn btn-primary">
                    Descargar CSV
                </a>
                <button class="btn btn-success download-xlsx-btn">
                    Descargar XLSX
                </button>
            </div>
        `;
        
        componentsContainer.before(successDiv);
        
        // 12. Agregar evento para descargar XLSX
        const xlsxBtn = successDiv.querySelector('.download-xlsx-btn');
        xlsxBtn.addEventListener('click', () => {
            downloadAsXLSX(result.wavelengths, result.n_eff, result.k_eff, `nk_efectivos_${medium}`);
        });
        
        console.log('Cálculo EMT completado exitosamente');
        
    } catch (error) {
        console.error('Error calculando n,k efectivos:', error);
        alert(`Error inesperado: ${error.message}`);
    }
}

// FUNCIÓN: Descargar datos como XLSX usando SheetJS
function downloadAsXLSX(wavelengths, n_eff, k_eff, filename) {
    // Crear datos en formato de array de arrays
    const data = [
        ['Wavelength (nm)', 'n_effective', 'k_effective']
    ];
    
    for (let i = 0; i < wavelengths.length; i++) {
        data.push([
            wavelengths[i].toFixed(2),
            n_eff[i].toFixed(6),
            k_eff[i].toFixed(6)
        ]);
    }
    
    // Crear workbook y worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Ajustar anchos de columna
    ws['!cols'] = [
        {wch: 15},
        {wch: 15},
        {wch: 15}
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'n_k_efectivos');
    
    // Descargar
    XLSX.writeFile(wb, `${filename}_${Date.now()}.xlsx`);
}

// DEBUG: Ver qué pasa cuando cambias de paso
document.getElementById('wizard-next')?.addEventListener('click', () => {
    console.log('🔍 Paso actual después de Next:', currentStep);
    console.log('🔍 Pasos visibles:', document.querySelectorAll('.wizard-step:not(.d-none)').length);
    console.log('🔍 Paso 3 tiene d-none?:', document.querySelector('[data-step="3"]')?.classList.contains('d-none'));
});

//  CÓDIGO DE DEBUG TEMPORAL
document.getElementById('wizard-next')?.addEventListener('click', () => {
    setTimeout(() => {
        console.log('DEBUG WIZARD:');
        console.log('  - currentStep:', currentStep);
        console.log('  - Total steps:', wizardSteps.length);
        
        // Mostrar todos los pasos para debug
        document.querySelectorAll('.wizard-step').forEach((step, i) => {
            const stepNum = step.getAttribute('data-step');
            const isHidden = step.classList.contains('d-none');
            console.log(`  - Paso ${stepNum}: ${isHidden ? 'OCULTO' : 'VISIBLE'}`);
        });
        
        // Si estamos en paso 3, forzar mostrar
        if (currentStep === 3) {
            const step3 = document.querySelector('[data-step="3"]');
            if (step3 && step3.classList.contains('d-none')) {
                console.log('FORZANDO MOSTRAR PASO 3');
                step3.classList.remove('d-none');
            }
        }
    }, 100);
});

console.log('[OK] Funciones EMT agregadas correctamente');
console.log('[OK] window.dispersionTemplates es ahora global');
console.log('[OK] Mejoras de visualizacion de ecuaciones cargadas');
console.log('[INFO] Modelos con soporte para multiples osciladores:');
console.log('   - Sellmeier: hasta 10 pares (B,C)');
console.log('   - Lorentz: hasta 10 osciladores (f,ω,γ)');

// ==========================================
// FUNCIONES PLACEHOLDER (Para implementar después)
// ==========================================

function showDetailedComparison() {
    alert("Función 'Ver comparación detallada' - Por implementar en siguiente fase");
    // TODO: Mostrar gráficas comparativas Psi_exp vs Psi_theo, Delta_exp vs Delta_theo
}

function downloadTheoreticalData() {
    if (!window.theoreticalResults) {
        alert("No hay datos teóricos para descargar");
        return;
    }
    
    // Crear CSV simple
    const data = window.theoreticalResults.data;
    let csv = "wavelength_nm,psi_theoretical,delta_theoretical\n";
    
    for (let i = 0; i < data.wavelengths.length; i++) {
        csv += `${data.wavelengths[i]},${data.psi_theoretical[i]},${data.delta_theoretical[i]}\n`;
    }
    
    // Descargar
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theoretical_psi_delta_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function proceedToOptimization() {
    alert("Función 'Proceder a optimización' - Por implementar en siguiente fase");
    // TODO: Abrir interfaz de optimización de parámetros
}