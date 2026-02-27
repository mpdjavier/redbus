const https = require('https');

// Fetch route for line ID 1
const options = {
    hostname: 'tucuman.miredbus.com.ar',
    port: 443,
    path: '/rest/rutaLinea/1',
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
            console.log('=== ROUTE RESPONSE for LINE 1 ===');
            console.log('Keys:', Object.keys(json));

            if (json.nodos) {
                console.log(`\nNumber of nodos: ${json.nodos.length}`);
                console.log('First nodo:', JSON.stringify(json.nodos[0], null, 2));
                console.log('Second nodo:', JSON.stringify(json.nodos[1], null, 2));
                console.log('Last nodo:', JSON.stringify(json.nodos[json.nodos.length - 1], null, 2));
            }

            // Check for encoded polyline
            if (json.polyline) {
                console.log('\n⚠️ Found encoded polyline!');
                console.log('Polyline sample:', json.polyline.substring(0, 100));
            }

            if (json.geometria) {
                console.log('\n⚠️ Found geometria field!');
                console.log('Geometria type:', typeof json.geometria);
                if (typeof json.geometria === 'string') {
                    console.log('Geometria sample:', json.geometria.substring(0, 100));
                }
            }

            // Full output for analysis
            console.log('\n=== FULL JSON (first 2000 chars) ===');
            console.log(JSON.stringify(json, null, 2).substring(0, 2000));

        } catch (e) {
            console.error('Error parsing JSON:', e.message);
            console.log('Raw data:', data.substring(0, 500));
        }
    });
});

req.on('error', (error) => {
    console.error('Request error:', error);
});

req.end();
