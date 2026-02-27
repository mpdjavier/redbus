
const Geometry = {
    getDistance: function (p1, p2) {
        const R = 6371e3;
        const φ1 = p1.lat * Math.PI / 180;
        const φ2 = p2.lat * Math.PI / 180;
        const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
        const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },
    distanceToSegment: function (p, a, b) {
        const x = p.lng, y = p.lat;
        const x1 = a.lng, y1 = a.lat;
        const x2 = b.lng, y2 = b.lat;
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        return this.getDistance(p, { lat: yy, lng: xx });
    },
    projectOnPolyline: function (point, polyline) {
        let minDist = Infinity;
        let index = -1;
        for (let i = 0; i < polyline.length - 1; i++) {
            const dist = this.distanceToSegment(point, polyline[i], polyline[i + 1]);
            if (dist < minDist) {
                minDist = dist;
                index = i;
            }
        }
        return { dist: minDist, index: index };
    },
    // The function I implemented
    extractRouteSegment: function (path, p1, p2) {
        const proj1 = this.projectOnPolyline(p1, path);
        const proj2 = this.projectOnPolyline(p2, path);
        if (proj1.index === -1 || proj2.index === -1) return null;
        if (proj2.index < proj1.index) return null;
        return path.slice(proj1.index, proj2.index + 2);
    }
};

// === TEST CASE: Loop ===
// A simple loop: (0,0) -> (0,10) -> (2,5) -> (0,0) [Approx]
// Using lat/lng degrees. 1 deg is huge but math works.
const route = [
    { lat: 0, lng: 0 },   // Index 0: Start
    { lat: 1, lng: 0 },   // Index 1
    { lat: 2, lng: 0 },   // Index 2
    { lat: 2, lng: 1 },   // Index 3
    { lat: 1, lng: 1 },   // Index 4
    { lat: 0, lng: 0.1 }  // Index 5: End (close to start)
];

// Origin: Near start (0,0). User clicks slightly closer to index 5?
// Let's say user is at (-0.0001, 0.05).
// Dist to segment 0-1 (Start): close to (0,0)
// Dist to segment 4-5 (End): close to (0, 0.1)
// Let's explicitly put them closer to the end segment.
const origin = { lat: 0.05, lng: 0.09 }; // Closer to (0, 0.1) than (0,0)-(1,0) line?

// Destination: Middle of route (2, 0.5)
const dest = { lat: 2, lng: 0.5 };

console.log("Origin:", origin);
console.log("Dest:", dest);

const proj1 = Geometry.projectOnPolyline(origin, route);
console.log("Proj Origin Index:", proj1.index, "Dist:", proj1.dist);

const proj2 = Geometry.projectOnPolyline(dest, route);
console.log("Proj Dest Index:", proj2.index, "Dist:", proj2.dist);

const segment = Geometry.extractRouteSegment(route, origin, dest);
console.log("Segment found:", segment ? "YES" : "NO");
if (segment) {
    console.log("Segment length:", segment.length);
    console.log("Start:", segment[0]);
    console.log("End:", segment[segment.length - 1]);
} else {
    console.log("Returned NULL - Fallback would show full reversed route?");
}

// === TEST CASE: Overlap ===
// Route goes out and back on same street.
// (0,0) -> (0,10) -> (0,0)
const routeBack = [
    { lat: 0, lng: 0 },    // 0
    { lat: 0.05, lng: 0 }, // 1
    { lat: 0.1, lng: 0 },  // 2
    { lat: 0.05, lng: 0.00001 }, // 3 (Returning, slightly offset)
    { lat: 0, lng: 0.00001 }     // 4
];

// Origin: (0.02, 0)
// Dest: (0.08, 0)
// Expectation: 0 -> 2.
// But if Origin snaps to 4? And Dest snaps to 2?
// 4 > 2 -> Null.
// If Origin snaps to 1, Dest snaps to 3? 1 < 3. Segment 1..3.
// But segment 1..3 includes 2. Correct.

// What if Origin snaps to 3 (Return trip)? Dest snaps to 2 (Outbound)?
// 3 > 2 -> Null.

// What if Origin snaps to 0. Dest snaps to 4.
// 0 < 4. Segment 0..4. Full route. Correct.
