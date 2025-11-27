document.getElementById("inputFile").addEventListener("change", uploadFile);

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
        drawGraphs(data.columns, data.full_data);

    } catch (error) {
        alert("Error al subir archivo: " + error.message);
    }
}


// === Mostrar primeras 10 filas en la tabla ===
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


// === Graficar PSI y DELTA tipo GNUPLOT ===
function drawGraphs(columns, fullData) {
    
    let lambdaCol = findColumn(columns, ["lambda", "longitud", "wavelength", "nm", "λ", "wave"]);
    let psiCol = findColumn(columns, ["psi", "Ψ"]);
    let deltaCol = findColumn(columns, ["delta", "Δ"]);

    if (!lambdaCol || !psiCol || !deltaCol) {
        alert("No se pudieron identificar las columnas necesarias.\n" +
              "Asegúrate de que el archivo contenga columnas para:\n" +
              "- Longitud de onda (lambda, wavelength, nm)\n" +
              "- Psi\n" +
              "- Delta\n\n" +
              "Columnas encontradas: " + columns.join(", "));
        return;
    }

    const lambda = fullData.map(r => r[lambdaCol]).filter(v => v !== null && v !== undefined);
    const psi = fullData.map(r => r[psiCol]).filter(v => v !== null && v !== undefined);
    const delta = fullData.map(r => r[deltaCol]).filter(v => v !== null && v !== undefined);

    const layout_base = {
        plot_bgcolor: "#f5f5f5",
        paper_bgcolor: "white",
        font: { family: "Arial, sans-serif", size: 11 },
        margin: { l: 60, r: 30, t: 40, b: 50 },
        xaxis: {
            showgrid: true,
            gridcolor: "#ddd",
            zeroline: true,
            zerolinecolor: "#999"
        },
        yaxis: {
            showgrid: true,
            gridcolor: "#ddd",
            zeroline: true,
            zerolinecolor: "#999"
        }
    };

    // Gráfica Psi
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

    // Gráfica Delta
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
}


// === Función auxiliar para detectar columnas ===
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


// === FUNCIONES DE DESCARGA ===

// Descargar Psi como PNG
function downloadPsiPNG() {
    Plotly.downloadImage('psiPlot', {
        format: 'png',
        width: 800,
        height: 600,
        filename: 'psi_vs_wavelength'
    });
}

// Descargar Delta como PNG
function downloadDeltaPNG() {
    Plotly.downloadImage('deltaPlot', {
        format: 'png',
        width: 800,
        height: 600,
        filename: 'delta_vs_wavelength'
    });
}

// Descargar ambas gráficas en PDF
async function downloadAllPDF() {
    // Crear un canvas temporal combinando ambas gráficas
    const psiImg = await Plotly.toImage('psiPlot', {format: 'png', width: 800, height: 500});
    const deltaImg = await Plotly.toImage('deltaPlot', {format: 'png', width: 800, height: 500});
    
    // Crear un nuevo documento HTML temporal para imprimir
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
    
    // Esperar a que las imágenes carguen antes de imprimir
    setTimeout(() => {
        printWindow.print();
    }, 500);
}