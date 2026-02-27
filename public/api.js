// api.js - Handles fetching logic for both Web and Android

const STATE = {
    isNative: false,
    lines: [],
};

function log(msg) {
    console.log(msg);
    const el = document.getElementById('debug-output');
    if (el) {
        const timestamp = new Date().toLocaleTimeString();
        el.innerHTML += `<div style="margin-bottom: 2px;"><span style="color: #888;">[${timestamp}]</span> ${msg}</div>`;
        // Auto-scroll to bottom
        const consoleEl = document.getElementById('debug-console');
        if (consoleEl) {
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
    }
}

function checkPlatform() {
    log(`=== PLATFORM DETECTION START ===`);
    log(`window.Capacitor exists: ${typeof window.Capacitor !== 'undefined'}`);
    log(`Hostname: ${window.location.hostname}`);
    log(`Port: ${window.location.port}`);
    log(`User Agent: ${navigator.userAgent}`);

    // FORCE NATIVE MODE BY DEFAULT
    // Only use WEB mode if we're explicitly on localhost:3000 (dev server)
    const isDevServer = window.location.hostname === 'localhost' && window.location.port === '3000';

    if (isDevServer) {
        STATE.isNative = false;
        log("🌐 WEB mode enabled (dev server detected)");
    } else {
        // Everything else is NATIVE (including Android WebView on localhost)
        STATE.isNative = true;
        log("✅ NATIVE mode FORCED (not dev server)");
    }

    log(`=== FINAL MODE: ${STATE.isNative ? 'NATIVE' : 'WEB'} ===`);
}

// Ensure Capacitor is loaded before checking
function init() {
    log("🚀 API Init called");
    checkPlatform();
    log("API Ready. Native: " + STATE.isNative);
    document.dispatchEvent(new CustomEvent('bus-api-ready'));
}

// Run checkPlatform IMMEDIATELY on script load as fallback
log("📦 api.js loaded");
checkPlatform();

// Also run on window load with delay for Capacitor
window.addEventListener('load', () => {
    log("🔄 Window loaded, re-checking platform...");
    // Small delay to ensure Capacitor injections are settled
    setTimeout(init, 500);
});

const BASE_URL_WEB = '/api'; // Proxied via local Node server
const BASE_URL_NATIVE = 'https://tucuman.miredbus.com.ar/rest';

async function getLines() {
    log("getLines called. Native? " + STATE.isNative);

    // Try WEB mode first (for development)
    if (!STATE.isNative) {
        try {
            const res = await axios.get(`${BASE_URL_WEB}/lines`, { timeout: 3000 });
            if (res.data && Array.isArray(res.data)) {
                log(`WEB mode success: ${res.data.length} lines`);
                return res.data;
            }
        } catch (webError) {
            log(`WEB mode failed: ${webError.message}. Falling back to NATIVE mode.`);
            STATE.isNative = true; // Force NATIVE mode
        }
    }

    // NATIVE mode: Direct fetch to miredbus
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
                throw parseErr;
            }
        }

        if (!rawData || !rawData.grupos || !rawData.grupos.subGrupos) {
            console.error("Invalid Structure", rawData);
            throw new Error("Invalid structure");
        }

        const groups = rawData.grupos.subGrupos;
        console.log(`Step 1: Got ${groups.length} groups`);

        let allLines = [];
        function extract(list) {
            list.forEach(g => {
                if (g.lineas) allLines.push(...g.lineas);
                if (g.subGrupos) extract(g.subGrupos);
            });
        }
        extract(groups);
        console.log(`Step 2: Extracted ${allLines.length} total lines`);

        // DEBUG: Log sample lines
        if (allLines.length > 0) {
            console.log("Sample line 0:", JSON.stringify(allLines[0]));
            console.log("Sample line 1:", allLines.length > 1 ? JSON.stringify(allLines[1]) : "N/A");
            log("Sample line 0: " + JSON.stringify(allLines[0]));
        }

        // Deduplicate by codLinea and filter valid entries
        const seen = new Set();
        const invalidLines = [];
        const uniqueLines = allLines.filter(line => {
            // More permissive validation
            if (!line) {
                invalidLines.push({ reason: 'null/undefined', line });
                return false;
            }

            // Check if codLinea exists (could be 0, which is falsy but valid)
            if (line.codLinea === undefined || line.codLinea === null || line.codLinea === '') {
                invalidLines.push({ reason: 'no codLinea', line });
                return false;
            }

            // Check descripcion
            if (!line.descripcion || line.descripcion.trim() === '') {
                invalidLines.push({ reason: 'no descripcion', line });
                return false;
            }

            // Convert codLinea to string for deduplication
            const codLineaStr = String(line.codLinea);
            if (seen.has(codLineaStr)) {
                invalidLines.push({ reason: 'duplicate', line });
                return false;
            }

            seen.add(codLineaStr);
            return true;
        });

        // Log invalid lines for debugging
        if (invalidLines.length > 0) {
            console.log(`Filtered out ${invalidLines.length} invalid lines:`);
            console.log("First 3 invalid:", invalidLines.slice(0, 3));
            log(`Filtered ${invalidLines.length} invalid lines. First reason: ${invalidLines[0].reason}`);
        }

        const msg = `Final: ${uniqueLines.length} unique lines (from ${allLines.length} total, ${invalidLines.length} filtered)`;
        log(msg);
        return uniqueLines;

    } catch (e) {
        console.error("Native Fetch Error", e);
        throw e;
    }
}

async function getBusPositions(lineIds) {
    if (lineIds.length === 0) return [];

    log(`getBusPositions called for ${lineIds.length} lines. Native: ${STATE.isNative}`);

    if (STATE.isNative) {
        // Native: Fetch parallel requests directly
        log(`Using NATIVE mode - fetching from ${BASE_URL_NATIVE}`);
        const promises = lineIds.map(async (id) => {
            try {
                const url = `${BASE_URL_NATIVE}/posicionesBuses/${id}`;
                log(`Fetching bus positions for line ${id} from ${url}`);

                const options = {
                    url: url,
                    headers: { 'Content-Type': 'application/json' }
                };
                const res = await Capacitor.Plugins.CapacitorHttp.get(options);

                let rawData = res.data;
                if (typeof rawData === 'string') {
                    try { rawData = JSON.parse(rawData); } catch (e) {
                        log(`Error parsing JSON for line ${id}: ${e}`);
                    }
                }

                // API returns { posiciones: [...] }
                const positions = (rawData && rawData.posiciones) || [];
                log(`Line ${id}: Found ${positions.length} buses`);

                const lineDesc = findLineDescription(id);
                return positions.map(p => ({ ...p, linea: lineDesc, codLinea: id }));
            } catch (e) {
                log(`Failed to fetch line ${id}: ${e.message}`);
                console.warn(`Failed to fetch line ${id}`, e);
                return [];
            }
        });

        const results = await Promise.all(promises);
        const flattened = results.flat();
        log(`Total buses found: ${flattened.length}`);
        return flattened;

    } else {
        // Web: Fetch from local proxy which does the heavy lifting
        log(`Using WEB mode - fetching from ${BASE_URL_WEB}`);
        const res = await axios.get(`${BASE_URL_WEB}/buses?lines=${lineIds.join(',')}`);
        log(`Web mode: Found ${res.data.length} buses`);
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
    getRoute: async (lineId) => {
        if (!lineId) return null;
        const CACHE_KEY = `route_${lineId}`;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            console.log(`Route ${lineId}: Using cache`);
            return JSON.parse(cached);
        }

        try {
            let data;
            console.log(`Route ${lineId}: Fetching...`);

            // Try WEB mode first (with timeout)
            if (!STATE.isNative) {
                try {
                    const res = await axios.get(`${BASE_URL_WEB}/route/${lineId}`, { timeout: 3000 });
                    data = res.data;
                    if (data && !data.error && data.nodos) {
                        console.log(`Route ${lineId}: WEB success, ${data.nodos.length} nodes`);
                        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                        return data;
                    }
                } catch (webError) {
                    console.log(`Route ${lineId}: WEB failed (${webError.message}), trying NATIVE...`);
                    STATE.isNative = true; // Force NATIVE mode
                }
            }

            // NATIVE mode
            const options = {
                url: `${BASE_URL_NATIVE}/rutaLinea/${lineId}`,
                headers: { 'Content-Type': 'application/json' }
            };
            const res = await Capacitor.Plugins.CapacitorHttp.get(options);
            data = res.data;
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error(`Route ${lineId}: Parse error`, e);
                    return null;
                }
            }

            if (data && !data.error && data.nodos) {
                console.log(`Route ${lineId}: NATIVE success, ${data.nodos.length} nodes`);
                localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                return data;
            } else {
                return null;
            }
        } catch (e) {
            console.error(`Route ${lineId}: Error - ${e.message}`);
            return null;
        }
    },
    setLinesCache: (list) => { STATE.lines = list; },
    getCurrentPosition: async () => {
        log("getCurrentPosition: Iniciando obtención de ubicación...");

        // Try Browser Geolocation first (Highly recommended for Android WebViews)
        // Since we have the permissions in the manifest, this is usually more stable.
        if (navigator.geolocation) {
            log("Probando Geolocation de Navegador (WebView)...");
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    });
                });
                log("Ubicación obtenida por Navegador con éxito.");
                return { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (browserError) {
                log(`Navegador falló: ${browserError.message} (Código ${browserError.code})`);
                // If it's a timeout or other error, we try the plugin next
            }
        }

        // Fallback to Capacitor Plugin ONLY if browser fails or is missing
        if (STATE.isNative && Capacitor.Plugins.Geolocation) {
            log("Reintentando con Capacitor Plugin...");
            try {
                let permission = await Capacitor.Plugins.Geolocation.checkPermissions();
                if (permission.location !== 'granted') {
                    log("Solicitando permisos vía Plugin...");
                    permission = await Capacitor.Plugins.Geolocation.requestPermissions();
                }

                if (permission.location === 'granted') {
                    const pos = await Capacitor.Plugins.Geolocation.getCurrentPosition({
                        enableHighAccuracy: false, // Use low accuracy for better stability
                        timeout: 10000
                    });
                    log("Ubicación obtenida vía Plugin.");
                    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
                }
            } catch (pluginError) {
                log(`Plugin falló: ${pluginError.message}`);
            }
        }

        throw new Error("No se pudo obtener la ubicación por ningún método.");
    }
};

// OpenStreetMap Overpass API for street directionality
window.OSMAPI = {
    // Batch fetch details for multiple points
    getBatchWayDetails: async (points) => {
        if (!points || points.length === 0) return [];

        // Build a query with multiple around clauses (syntax: (way; way;))
        let arounds = points.map(p => `way(around:60,${p.lat},${p.lng})[highway];`).join('');
        const query = `[out:json][timeout:60];(${arounds});out tags geom;`;
        const url = 'https://overpass.kumi.systems/api/interpreter';

        try {
            console.log(`🚀 OSM Batch Query for ${points.length} points...`);
            let response;
            if (STATE.isNative) {
                const options = { url: url + '?data=' + encodeURIComponent(query) };
                const res = await Capacitor.Plugins.CapacitorHttp.get(options);
                response = { data: res.data };
                if (typeof response.data === 'string') response.data = JSON.parse(response.data);
            } else {
                response = await axios.get(url, { params: { data: query }, timeout: 30000 });
            }

            return response.data.elements || [];
        } catch (e) {
            console.error("OSM Batch API Error", e);
            return [];
        }
    },
    getWayDetails: async (lat, lng) => {
        return window.OSMAPI.getBatchWayDetails([{ lat, lng }]);
    }
};
