const axios = require('axios');

async function run() {
    try {
        const lineId = 136;
        console.log(`Checking Line ${lineId}...`);
        const res = await axios.get(`http://localhost:3000/api/route/${lineId}`);
        if (!res.data.nodos) {
            console.error("No 'nodos' found in response");
            return;
        }
        const path = res.data.nodos.map(n => ({ lat: n.latitud, lng: n.longitud }));
        console.log(`Path length: ${path.length}`);
        if (path.length === 0) {
            console.error("Path is empty");
            return;
        }

        const sampleCount = 9;
        const indices = [];
        for (let i = 0.1; i < 1.0; i += 0.1) indices.push(Math.floor(path.length * i));
        const finalIndices = [...new Set(indices)].filter(i => i < path.length - 1);

        console.log(`Sampled ${finalIndices.length} points.`);

        const query = `[out:json][timeout:30];(${finalIndices.map(idx => `way(around:100,${path[idx].lat},${path[idx].lng})[highway];`).join('')});out tags geom;`;
        const url = 'https://overpass.kumi.systems/api/interpreter';

        console.log("Querying OSM (Timeout 30s)...");
        const osmRes = await axios.get(url, { params: { data: query } });
        const batchWays = osmRes.data.elements;
        console.log(`Received ${batchWays.length} ways from OSM.`);

        let mismatchCount = 0;
        let matchCount = 0;
        let validOneWayCount = 0;

        finalIndices.forEach(idx => {
            const p1 = path[idx];
            const p2 = path[idx + 1];
            const bearing = (Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat) * 180 / Math.PI + 360) % 360;

            const nearbyWays = batchWays.filter(w => {
                if (!w.geometry) return false;
                return w.geometry.some(gp => {
                    const dLat = Math.abs(gp.lat - p1.lat);
                    const dLng = Math.abs((gp.lon || gp.lng) - p1.lng);
                    return dLat < 0.001 && dLng < 0.001; // ~100m
                });
            });

            // Simulate checkDirection
            let bestWay = null;
            let minDiff = 50;
            nearbyWays.forEach(way => {
                const g = way.geometry;
                const wayBearing = (Math.atan2(g[g.length - 1].lon - g[0].lon, g[g.length - 1].lat - g[0].lat) * 180 / Math.PI + 360) % 360;
                let df = Math.abs(bearing - wayBearing) % 360; if (df > 180) df = 360 - df;
                let db = Math.abs(bearing - (wayBearing + 180) % 360) % 360; if (db > 180) db = 360 - db;
                const bd = Math.min(df, db);
                if (bd < minDiff) { minDiff = bd; bestWay = way; bestWay.fbr = wayBearing; }
            });

            if (bestWay && bestWay.tags.oneway && bestWay.tags.oneway !== 'no') {
                validOneWayCount++;
                let lb = bestWay.fbr;
                if (bestWay.tags.oneway === '-1') lb = (lb + 180) % 360;
                let diff = Math.abs(bearing - lb) % 360;
                const normalized = diff > 180 ? 360 - diff : diff;

                const isMismatch = normalized > 100;
                const isExplicitMatch = normalized < 45;

                console.log(`Idx ${idx}: ${bestWay.tags.name} - OneWay: ${bestWay.tags.oneway}, Brng: ${Math.round(bearing)}, Legal: ${Math.round(lb)}, Diff: ${Math.round(normalized)} -> ${isMismatch ? 'ERR' : (isExplicitMatch ? 'OK' : 'SKIP')}`);

                if (isMismatch) mismatchCount++;
                else if (isExplicitMatch) matchCount++;
            }
        });

        console.log(`\nFinal Consensus: Matches=${matchCount}, Mismatches=${mismatchCount}, OneWays=${validOneWayCount}`);
        if (validOneWayCount > 0 && mismatchCount > matchCount) {
            console.log("🚨 REVERSAL TRIGGERED");
        } else {
            console.log("✅ NO REVERSAL needed based on consensus.");
        }
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.error("Data:", e.response.data);
    }
}

run();
