const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));

app.get('/api/lines', async (req, res) => {
    try {
        const groupsResponse = await axios.get('https://tucuman.miredbus.com.ar/rest/gruposLineas');
        const groups = groupsResponse.data.grupos.subGrupos;
        let allLines = [];
        function extractLines(groupList) {
            groupList.forEach(group => {
                if (group.lineas) allLines.push(...group.lineas);
                if (group.subGrupos) extractLines(group.subGrupos);
            });
        }
        extractLines(groups);

        // Deduplicate by codLinea and filter valid entries
        const seen = new Set();
        const uniqueLines = allLines.filter(line => {
            if (!line || !line.codLinea || !line.descripcion) return false;
            if (seen.has(line.codLinea)) return false;
            seen.add(line.codLinea);
            return true;
        });

        console.log(`Returning ${uniqueLines.length} unique lines (filtered from ${allLines.length} total)`);
        res.json(uniqueLines);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch lines' });
    }
});

app.get('/api/buses', async (req, res) => {
    try {
        console.log('Fetching bus groups...');
        // 1. Fetch available lines
        const groupsResponse = await axios.get('https://tucuman.miredbus.com.ar/rest/gruposLineas');
        const groups = groupsResponse.data.grupos.subGrupos;

        let allLines = [];

        // Helper function to extract lines recursively considering the structure
        function extractLines(groupList) {
            groupList.forEach(group => {
                if (group.lineas) {
                    allLines.push(...group.lineas);
                }
                if (group.subGrupos) {
                    extractLines(group.subGrupos);
                }
            });
        }

        extractLines(groups);

        // Filter lines if query param is present
        if (req.query.lines) {
            const requestedLines = req.query.lines.split(',');
            allLines = allLines.filter(line => requestedLines.includes(line.codLinea.toString()));
        }

        console.log(`Found ${allLines.length} lines to fetch (Total available: ${groups.length}). Fetching positions...`);

        // 2. Fetch positions for all lines in parallel
        const positionPromises = allLines.map(line =>
            axios.get(`https://tucuman.miredbus.com.ar/rest/posicionesBuses/${line.codLinea}`)
                .then(response => ({
                    linea: line.descripcion,
                    codLinea: line.codLinea,
                    posiciones: response.data.posiciones
                }))
                .catch(err => {
                    console.error(`Error fetching line ${line.codLinea}:`, err.message);
                    return null;
                })
        );

        const results = await Promise.all(positionPromises);

        // 3. Aggregate results
        let allBuses = [];
        results.forEach(result => {
            if (result && result.posiciones) {
                result.posiciones.forEach(pos => {
                    allBuses.push({
                        linea: result.linea,
                        codLinea: result.codLinea,
                        interno: pos.interno,
                        latitud: pos.latitud,  // Keep original property name
                        longitud: pos.longitud, // Keep original property name
                        velocidad: pos.velocidad || 0,
                        orientacion: pos.orientacion
                    });
                });
            }
        });

        console.log(`Returning ${allBuses.length} buses.`);
        res.json(allBuses);

    } catch (error) {
        console.error('Global error:', error);
        res.status(500).json({ error: 'Failed to fetch bus data' });
    }
});

app.get('/api/route/:id', async (req, res) => {
    try {
        const lineId = req.params.id;
        console.log(`Fetching route for line ${lineId}...`);
        const response = await axios.get(`https://tucuman.miredbus.com.ar/rest/rutaLinea/${lineId}`);
        res.json(response.data);
    } catch (error) {
        console.error(`Error fetching route for line ${req.params.id}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch route data' });
    }
});

app.listen(port, () => {
    console.log(`Bus Radar server listening at http://localhost:${port}`);
});
