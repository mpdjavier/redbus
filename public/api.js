// api.js - Handles fetching logic for both Web and Android

const STATE = {
    isNative: false,
    hasCapacitor: typeof window.Capacitor !== 'undefined' && window.Capacitor.Plugins && !!window.Capacitor.Plugins.CapacitorHttp,
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
function initAPI() {
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
    setTimeout(initAPI, 500);
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

        let rawData;
        // Try Native CapacitorHttp if available
        if (STATE.hasCapacitor) {
            log("Sending Native Request via CapacitorHttp...");
            const response = await Capacitor.Plugins.CapacitorHttp.get(options);
            log("Response Rcvd. Status: " + response.status);
            rawData = response.data;
        } else {
            // Fallback to standard Axios (for Wear OS or other WebViews)
            log("CapacitorHttp not found. Falling back to standard Axios...");
            const response = await axios.get(options.url, { timeout: 10000 });
            rawData = response.data;
        }
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

                let rawData;
                if (STATE.hasCapacitor) {
                    const options = {
                        url: url,
                        headers: { 'Content-Type': 'application/json' }
                    };
                    const res = await Capacitor.Plugins.CapacitorHttp.get(options);
                    rawData = res.data;
                } else {
                    const res = await axios.get(url, { timeout: 10000 });
                    rawData = res.data;
                }
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
    // Batch fetch details for multiple points with basic retry logic
    getBatchWayDetails: async (points, retryCount = 0) => {
        if (!points || points.length === 0) return [];

        // Build a query with multiple around clauses
        // Limit points per query if too many
        const maxPoints = 50;
        const currentPoints = points.slice(0, maxPoints);

        const arounds = currentPoints.map(p => `way(around:60,${p.lat},${p.lng})[highway];`).join('');
        const query = `[out:json][timeout:60];(${arounds});out tags geom;`;
        
        // Use a pool of servers if one fails
        const servers = [
            'https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter'
        ];
        const url = servers[retryCount % servers.length];

        try {
            console.log(`🚀 OSM Batch Query (${retryCount+1}): ${currentPoints.length} pts @ ${new URL(url).hostname}`);
            let response;
            if (STATE.isNative) {
                const options = { 
                    url: url + '?data=' + encodeURIComponent(query),
                    connectTimeout: 10000,
                    readTimeout: 30000
                };
                const res = await Capacitor.Plugins.CapacitorHttp.get(options);
                if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
                response = { data: res.data };
                if (typeof response.data === 'string') response.data = JSON.parse(response.data);
            } else {
                response = await axios.get(url, { 
                    params: { data: query }, 
                    timeout: 45000,
                    validateStatus: (status) => status === 200
                });
            }

            return response.data.elements || [];
        } catch (e) {
            console.warn(`OSM Batch Error (Attempt ${retryCount+1}): ${e.message}`);
            if (retryCount < 2) {
                const delay = (retryCount + 1) * 3000;
                console.log(`🕒 Retrying in ${delay/1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                return window.OSMAPI.getBatchWayDetails(points, retryCount + 1);
            }
            return [];
        }
    },
    getWayDetails: async (lat, lng) => {
        return window.OSMAPI.getBatchWayDetails([{ lat, lng }]);
    },
    getStreetsInBounds: async (south, west, north, east) => {
        const query = `[out:json][timeout:25];
        (
          way["highway"~"primary|secondary|tertiary|residential|unclassified|living_street"](${south},${west},${north},${east});
        );
        out body;
        >;
        out skel qt;`;
        const url = 'https://overpass-api.de/api/interpreter';

        try {
            console.log(`🚀 OSM BBox Query: (${south},${west},${north},${east})`);
            let response;
            if (STATE.isNative) {
                const options = { url: url + '?data=' + encodeURIComponent(query) };
                const res = await Capacitor.Plugins.CapacitorHttp.get(options);
                response = { data: res.data };
                if (typeof response.data === 'string') response.data = JSON.parse(response.data);
            } else {
                response = await axios.get(url, { params: { data: query }, timeout: 15000 });
            }
            return response.data || { elements: [] };
        } catch (e) {
            console.error("OSM BBox API Error", e);
            return { elements: [] };
        }
    },

    // Validate a path against OSM one-way streets
    validatePathDirection: async (path) => {
        if (!path || path.length < 10) return { score: 0, confidence: 0 };

        // Sample more points for better coverage (9 instead of 5)
        const samples = [];
        const sampleCount = 9;
        const step = Math.floor(path.length / (sampleCount + 1));
        
        for (let i = 1; i <= sampleCount; i++) {
            const idx = i * step;
            // Robust bearing: find a point far enough (>15m) to avoid noise from jittery nodes
            let nextIdx = idx + 1;
            while (nextIdx < path.length - 1 && Geometry.getDistance(path[idx], path[nextIdx]) < 15) {
                nextIdx++;
            }
            
            samples.push({
                point: path[idx],
                next: path[nextIdx],
                idx: idx
            });
        }

        const osmWays = await window.OSMAPI.getBatchWayDetails(samples.map(s => s.point));
        if (!osmWays || osmWays.length === 0) return { score: 0, confidence: 0 };

        let mismatchCount = 0;
        let matchCount = 0;
        let validSegments = 0;

        samples.forEach(sample => {
            // Find the closest OSM way with a oneway tag
            const way = osmWays.find(w => {
                if (!w.tags || !w.tags.highway || !w.tags.oneway || w.tags.oneway === 'no') return false;
                // Check if any node in way is near sample point
                return w.geometry && w.geometry.some(g => 
                    Math.abs(g.lat - sample.point.lat) < 0.0005 && 
                    Math.abs(g.lon - sample.point.lng) < 0.0005
                );
            });

            if (way && way.geometry && way.geometry.length >= 2) {
                // Find the specific OSM segment nearest to the sample point
                const osmPath = way.geometry.map(g => ({ lat: g.lat, lng: g.lon || g.lng }));
                const projection = Geometry.projectOnPolyline(sample.point, osmPath);
                
                if (projection.index !== -1) {
                    const p1 = osmPath[projection.index];
                    const p2 = osmPath[projection.index + 1];
                    const osmBearing = Geometry.getBearing(p1, p2);
                    const rbBearing = Geometry.getBearing(sample.point, sample.next);
                    
                    const diff = Math.abs(osmBearing - rbBearing);
                    const normalizedDiff = diff > 180 ? 360 - diff : diff;

                    if (way.tags.oneway === 'yes') {
                        validSegments++;
                        if (normalizedDiff > 130) mismatchCount++;
                        else if (normalizedDiff < 50) matchCount++;
                    } else if (way.tags.oneway === '-1') {
                        validSegments++;
                        if (normalizedDiff < 50) mismatchCount++; // -1 means it should be opposite digitized direction
                        else if (normalizedDiff > 130) matchCount++;
                    }
                }
            }
        });

        const score = validSegments > 0 ? (mismatchCount / validSegments) : 0;
        // ABSOLUTE PRIORITY: IF any oneway segment is mismatched and it's not outweighed by matches, consider it a mismatch.
        // Also reduce the minimum count to 1 to be more responsive to single-way street data.
        const isMismatch = (mismatchCount > matchCount) && (mismatchCount >= 1);


        return { 
            score, 
            confidence: validSegments / sampleCount,
            isMismatch: isMismatch
        };
    },

    // New: Convert a path of coordinates into a list of street names
    generateItinerary: async (path) => {
        if (!path || path.length < 10) return [];

        // Adaptive Sampling: Point every ~150-300m, capped at 40 points total
        const totalDist = Geometry.calculatePathLength(path);
        let stepDist = Math.max(150, Math.min(300, totalDist / 40));
        
        const samples = [];
        let lastPoint = path[0];
        samples.push(lastPoint);

        for (let i = 1; i < path.length; i++) {
            const dist = Geometry.getDistance(lastPoint, path[i]);
            if (dist > stepDist) {
                samples.push(path[i]);
                lastPoint = path[i];
            }
        }
        
        if (samples.length < 2) return [];

        // Limit to prevent huge batch queries that trigger 429s
        const finalSamples = samples.slice(0, 50);

        console.log(`🗺️ Path length: ${Math.round(totalDist)}m | Samples: ${finalSamples.length}`);
        const osmWays = await window.OSMAPI.getBatchWayDetails(finalSamples);
        
        if (!osmWays || osmWays.length === 0) return [];

        // Extract and deduplicate street names in sequence
        const streetSequence = [];
        let lastStreet = "";

        samples.forEach(sample => {
            // Find way closest to this sample point
            const way = osmWays.find(w => {
                if (!w.tags || !w.tags.name) return false;
                return w.geometry && w.geometry.some(g => 
                    Math.abs(g.lat - sample.lat) < 0.0006 && 
                    Math.abs(g.lon - (sample.lng || sample.lon)) < 0.0006
                );
            });

            if (way && way.tags.name !== lastStreet) {
                streetSequence.push(way.tags.name);
                lastStreet = way.tags.name;
            }
        });

        return streetSequence;
    }
};

// Persistent Audit API
window.AuditAPI = {
    STORAGE_KEY: 'route_audits_v4',
    VERSION: '4.0', 
    getAudits: () => {
        try {
            const raw = localStorage.getItem(window.AuditAPI.STORAGE_KEY);
            if (!raw) return {};
            return JSON.parse(raw);
        } catch (e) {
            return {};
        }
    },
    getAudit: (lineId) => {
        const audits = window.AuditAPI.getAudits();
        return audits[String(lineId)] || null;
    },
    saveAudit: (lineId, data) => {
        const audits = window.AuditAPI.getAudits();
        audits[String(lineId)] = {
            ...data,
            timestamp: Date.now()
        };
        localStorage.setItem(window.AuditAPI.STORAGE_KEY, JSON.stringify(audits));
    },
    clearAllAudits: () => {
        localStorage.removeItem(window.AuditAPI.STORAGE_KEY);
        console.log("🗑️ All audits cleared (V4)");
    },
    runAudit: async (lineId, path) => {
        if (!path || path.length < 5) return null;
        console.log(`🔍 Running OSM Alignment Check for line ${lineId}...`);
        try {
            const validation = await window.OSMAPI.validatePathDirection(path);
            const auditData = {
                isReversed: validation.isMismatch,
                confidence: validation.confidence,
                matchScore: validation.score
            };
            return auditData;
        } catch (e) {
            console.error(`Audit failed for line ${lineId}:`, e);
            return null;
        }
    }
};
// Indexed Lines API (User selection for search/sync)
window.IndexedLinesAPI = {
    STORAGE_KEY: 'indexed_lines_v1',
    getIndexed: () => {
        try {
            const raw = localStorage.getItem(window.IndexedLinesAPI.STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    },
    saveIndexed: (list) => {
        localStorage.setItem(window.IndexedLinesAPI.STORAGE_KEY, JSON.stringify(list));
    },
    isIndexed: (lineId) => {
        const list = window.IndexedLinesAPI.getIndexed();
        return list.includes(String(lineId));
    },
    toggleIndexing: (lineId, forceState = null) => {
        const list = window.IndexedLinesAPI.getIndexed();
        const idStr = String(lineId);
        const idx = list.indexOf(idStr);
        
        const nextState = forceState !== null ? forceState : (idx === -1);
        
        if (nextState && idx === -1) list.push(idStr);
        else if (!nextState && idx !== -1) list.splice(idx, 1);
        
        window.IndexedLinesAPI.saveIndexed(list);
        return nextState;
    }
};

// Database API for Itineraries and Local Storage
window.DatabaseAPI = {
    ITINERARY_KEY: 'bus_itineraries_v1',
    getItineraries: () => {
        try {
            const raw = localStorage.getItem(window.DatabaseAPI.ITINERARY_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    },
    saveItinerary: (lineId, streets) => {
        const data = window.DatabaseAPI.getItineraries();
        data[String(lineId)] = {
            streets,
            updatedAt: Date.now()
        };
        localStorage.setItem(window.DatabaseAPI.ITINERARY_KEY, JSON.stringify(data));
    },
    getItinerary: (lineId) => {
        const data = window.DatabaseAPI.getItineraries();
        return data[String(lineId)] || null;
    }
};
