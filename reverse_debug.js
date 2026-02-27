const axios = require('axios');

async function test() {
    try {
        // Point in Tucuman (approx)
        const lat = -26.833;
        const lon = -65.205;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

        console.log("Fetching:", url);
        const res = await axios.get(url, { headers: { 'User-Agent': 'RedBusDebug/1.0' } });
        console.log("Display Name:", res.data.display_name);
        console.log("Address:", JSON.stringify(res.data.address, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();
