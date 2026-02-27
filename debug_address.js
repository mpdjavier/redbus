const axios = require('axios');

async function test() {
    try {
        const query = "Crisostomo Alvarez 4778";
        const viewbox = '-65.50,-26.60,-65.00,-27.00';
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&limit=5`;

        console.log("Fetching:", url);
        const res = await axios.get(url, { headers: { 'User-Agent': 'RedBusDebug/1.0' } });
        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();
