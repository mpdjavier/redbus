const https = require('https');

// Fetch available lines
const options = {
    hostname: 'tucuman.miredbus.com.ar',
    port: 443,
    path: '/rest/gruposLineas',
    method: 'GET',
    headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);

            // Extract all lines
            const allLines = [];
            function extract(groups) {
                groups.forEach(g => {
                    if (g.lineas) allLines.push(...g.lineas);
                    if (g.subGrupos) extract(g.subGrupos);
                });
            }

            if (json.grupos && json.grupos.subGrupos) {
                extract(json.grupos.subGrupos);
            }

            console.log(`Total lines found: ${allLines.length}`);
            console.log('\nFirst 10 lines:');
            allLines.slice(0, 10).forEach(line => {
                console.log(`  - codLinea: ${line.codLinea}, descripcion: ${line.descripcion}`);
            });

        } catch (e) {
            console.error('Error parsing JSON:', e.message);
        }
    });
});

req.on('error', (error) => {
    console.error('Request error:', error);
});

req.end();
