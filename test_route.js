const https = require('https');

// Fetch route for line ID 100
const lineId = 100;
const options = {
    hostname: 'tucuman.miredbus.com.ar',
    port: 443,
    path: `/rest/rutaLinea/${lineId}`,
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
            console.log(`=== ROUTE RESPONSE for LINE ${lineId} ===`);
            console.log('All keys in response:', Object.keys(json));
            console.log('');

            if (json.nodos) {
                console.log(`✅ Number of nodos: ${json.nodos.length}`);
                if (json.nodos.length > 0) {
                    console.log('\n📍 First nodo:');
                    console.log(JSON.stringify(json.nodos[0], null, 2));
                    console.log('\n📍 Second nodo:');
                    console.log(JSON.stringify(json.nodos[1], null, 2));
                    if (json.nodos.length > 2) {
                        console.log('\n📍 Last nodo:');
                        console.log(JSON.stringify(json.nodos[json.nodos.length - 1], null, 2));
                    }
                }
            }

            // Check for other geometry fields
            Object.keys(json).forEach(key => {
                if (key !== 'nodos' && key !== 'error') {
                    console.log(`\n⚠️ Found field: ${key}`);
                    console.log(`   Type: ${typeof json[key]}`);
                    if (typeof json[key] === 'string' && json[key].length > 0) {
                        console.log(`   Length: ${json[key].length}`);
                        console.log(`   Sample: ${json[key].substring(0, 100)}...`);
                    } else if (Array.isArray(json[key])) {
                        console.log(`   Array length: ${json[key].length}`);
                        if (json[key].length > 0) {
                            console.log(`   First item: ${JSON.stringify(json[key][0])}`);
                        }
                    }
                }
            });

        } catch (e) {
            console.error('❌ Error parsing JSON:', e.message);
            console.log('Raw data (first 1000 chars):', data.substring(0, 1000));
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request error:', error);
});

req.end();
