
const axios = require('axios');

async function getStreetDetails(lat, lng) {
    const query = `
        [out:json][timeout:25];
        way(around:50,${lat},${lng})[highway];
        out tags;
    `;

    // Alternative Overpass instances
    // const url = 'https://overpass-api.de/api/interpreter';
    const url = 'https://overpass.kumi.systems/api/interpreter';

    try {
        console.log(`Querying Overpass API (Kumi Systems) for ${lat}, ${lng}...`);
        console.log(`Query: ${query}`);

        const response = await axios.get(url, {
            params: {
                data: query
            },
            timeout: 10000 // 10s timeout for axios
        });

        const ways = response.data.elements;
        if (!ways || ways.length === 0) {
            console.log("No street found nearby.");
            return;
        }

        console.log(`Found ${ways.length} nearby ways.`);
        ways.forEach(way => {
            console.log(`\nWay ID: ${way.id}`);
            console.log(`Name: ${way.tags.name || 'Unnamed'}`);
            console.log(`Highway Type: ${way.tags.highway}`);
            console.log(`One Way: ${way.tags.oneway || 'No info (assumed no)'}`);
            if (way.tags.lanes) console.log(`Lanes: ${way.tags.lanes}`);
        });

    } catch (error) {
        console.error("Error querying Overpass API:", error.message);
        if (error.response) {
            console.error("Response data status:", error.response.status);
            // console.error("Response data:", error.response.data);
        }
    }
}

getStreetDetails(-26.832, -65.204);
