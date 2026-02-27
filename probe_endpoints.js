const axios = require('axios');

const endpoints = [
    'https://tucuman.miredbus.com.ar/rest/recorridoLinea/100',
    'https://tucuman.miredbus.com.ar/rest/recorridos/100',
    'https://tucuman.miredbus.com.ar/rest/lineas/100/recorrido',
    'https://tucuman.miredbus.com.ar/rest/recorrido/100',
    'https://tucuman.miredbus.com.ar/rest/traza/100',
    'https://tucuman.miredbus.com.ar/rest/poly/100',
    'https://tucuman.miredbus.com.ar/rest/linea/100'
];

async function probe() {
    for (const url of endpoints) {
        try {
            console.log(`Probing ${url}...`);
            const res = await axios.get(url);
            console.log(`SUCCESS: ${url} returned status ${res.status}`);
            console.log('Sample data:', JSON.stringify(res.data).substring(0, 100));
        } catch (e) {
            console.log(`FAILED: ${url} - ${e.message}`);
        }
    }
}

probe();
