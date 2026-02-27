const https = require('https');

// Fetch bus positions for line 1
// We need to find the native URL or just rely on console logs from the app?
// Let's force native URL via node script

const options = {
    hostname: 'tucuman.miredbus.com.ar',
    port: 443,
    path: '/rest/posicionesBuses/100',
    method: 'GET',
    headers: {
        'Accept': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("Response keys:", Object.keys(json));
            if (json.posiciones && json.posiciones.length > 0) {
                console.log("Sample Bus Data:", JSON.stringify(json.posiciones[0], null, 2));
            } else {
                console.log("No buses found for line 118");
            }
        } catch (e) {
            console.error("Parse error", e);
            console.log("Raw:", data);
        }
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.end();
