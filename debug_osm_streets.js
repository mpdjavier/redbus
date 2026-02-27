
const axios = require('axios');

async function checkStreets() {
    const streets = [
        { name: "General Paz", lat: -26.837, lng: -65.208 },
        { name: "Santiago del Estero", lat: -26.825, lng: -65.208 }
    ];

    const url = 'https://overpass.kumi.systems/api/interpreter';

    for (const street of streets) {
        const query = `[out:json];way(around:50,${street.lat},${street.lng})[highway];out tags;`;
        try {
            console.log(`Checking ${street.name}...`);
            const res = await axios.get(url, { params: { data: query } });
            const way = res.data.elements.find(e => e.tags.name && e.tags.name.includes(street.name));
            if (way) {
                console.log(`Match: ${way.tags.name}`);
                console.log(`One Way: ${way.tags.oneway}`);
                // To determine physical direction, we'd need nodes, but usually 'yes' means 
                // direction of increasing node IDs in OSM.
                // We'll trust the user's claim: General Paz (W -> E), Santiago (E -> W).
            } else {
                console.log(`No exact match for ${street.name}, first result:`, res.data.elements[0]?.tags?.name);
            }
        } catch (e) {
            console.error(`Error checking ${street.name}: ${e.message}`);
        }
    }
}

checkStreets();
