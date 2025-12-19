// api.js - Handles fetching logic for both Web and Android

const STATE = {
    isNative: false,
    lines: [],
};

function log(msg) {
    console.log(msg);
    const el = document.getElementById('debug-console');
    if (el) {
        el.innerHTML += `<br>> ${msg}`;
        el.scrollTop = el.scrollHeight;
    }
}

function checkPlatform() {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        STATE.isNative = true;
        log("Detected: NATIVE mode");
    } else {
        STATE.isNative = false;
        log("Detected: WEB mode");
    }

    // Heuristic override: if URL is not localhost:3000 (dev) and not miredbus (prod web), assume native?
    // Capacitor android serves from http://localhost (no port) or https://localhost
    if (window.location.hostname === 'localhost' && window.location.port === '') {
        log("Heuristic: Host is localhost (no port). Forcing NATIVE.");
        STATE.isNative = true;
    }
}

// Ensure Capacitor is loaded before checking
function init() {
    // Check multiple times or wait?
    // Capacitor usually ready by 'load'
    checkPlatform();

    // Announce ready
    log("API Ready. Native: " + STATE.isNative);
    document.dispatchEvent(new CustomEvent('bus-api-ready'));
}

window.addEventListener('load', () => {
    // Small delay to ensure Capacitor injections are settled
    setTimeout(init, 500);
});

const BASE_URL_WEB = '/api'; // Proxied via local Node server
const BASE_URL_NATIVE = 'https://tucuman.miredbus.com.ar/rest';

async function getLines() {
    log("getLines called. Native? " + STATE.isNative);

    if (STATE.isNative) {
        // Native: Direct fetch to miredbus
        try {
            const options = {
                url: `${BASE_URL_NATIVE}/gruposLineas`,
                headers: { 'Content-Type': 'application/json' }
            };

            if (!Capacitor.Plugins.CapacitorHttp) {
                throw new Error("CapacitorHttp plugin missing!");
            }

            log("Sending Native Request...");
            const response = await Capacitor.Plugins.CapacitorHttp.get(options);
            log("Response Rcvd. Status: " + response.status);

            // Debug: Capacitor sometimes returns data as string
            let rawData = response.data;
            if (typeof rawData === 'string') {
                try {
                    rawData = JSON.parse(rawData);
                } catch (parseErr) {
                    console.error("JSON Parse Error", parseErr);
                    alert("Error parsing server data: " + parseErr.message);
                    throw parseErr;
                }
            }

            if (!rawData || !rawData.grupos || !rawData.grupos.subGrupos) {
                console.error("Invalid Structure", rawData);
                alert("Invalid API response structure");
                throw new Error("Invalid structure");
            }

            const groups = rawData.grupos.subGrupos;

            let allLines = [];
            function extract(list) {
                list.forEach(g => {
                    if (g.lineas) allLines.push(...g.lineas);
                    if (g.subGrupos) extract(g.subGrupos);
                });
            }
            extract(groups);
            return allLines;

        } catch (e) {
            console.error("Native Fetch Error", e);
            alert("Native Fetch Error: " + (e.message || JSON.stringify(e)));
            throw e;
        }
    } else {
        // Web: Fetch from local proxy
        const res = await axios.get(`${BASE_URL_WEB}/lines`);
        return res.data;
    }
}

async function getBusPositions(lineIds) {
    if (lineIds.length === 0) return [];

    if (STATE.isNative) {
        // Native: Fetch parallel requests directly
        // We must mimic server.js aggregation logic here
        const promises = lineIds.map(async (id) => {
            try {
                const options = {
                    url: `${BASE_URL_NATIVE}/posicionesBuses/${id}`,
                    headers: { 'Content-Type': 'application/json' }
                };
                const res = await Capacitor.Plugins.CapacitorHttp.get(options);

                let rawData = res.data;
                if (typeof rawData === 'string') {
                    try { rawData = JSON.parse(rawData); } catch (e) { console.error(e); }
                }

                // API returns { posiciones: [...] }
                const positions = (rawData && rawData.posiciones) || [];
                // API positions don't have line info, we must inject it
                // We know 'id' but we want 'description'. Requires looking up id in cache or similar.
                // For simplicity, we might just attach the ID or finding the description from 'lines'.
                const lineDesc = findLineDescription(id);
                return positions.map(p => ({ ...p, linea: lineDesc, codLinea: id }));
            } catch (e) {
                console.warn(`Failed to fetch line ${id}`, e);
                return [];
            }
        });

        const results = await Promise.all(promises);
        return results.flat();

    } else {
        // Web: Fetch from local proxy which does the heavy lifting
        const res = await axios.get(`${BASE_URL_WEB}/buses?lines=${lineIds.join(',')}`);
        return res.data;
    }
}

// Helper to find description
function findLineDescription(id) {
    const found = STATE.lines.find(l => l.codLinea == id);
    return found ? found.descripcion : `Linea ${id}`;
}

// Expose to window
window.BusAPI = {
    getLines,
    getBusPositions,
    setLinesCache: (list) => { STATE.lines = list; }
};
