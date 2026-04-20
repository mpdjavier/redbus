// geometry.js

const Geometry = {
    // Calculate distance in meters between two lat/lng points
    getDistance: function (p1, p2) {
        const R = 6371e3; // metres
        const φ1 = p1.lat * Math.PI / 180; // φ, λ in radians
        const φ2 = p2.lat * Math.PI / 180;
        const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
        const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    },

    // Calculate minimum distance from point P to line segment AB
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
        if (len_sq != 0) // in case of 0 length line
            param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;

        return this.getDistance(p, { lat: yy, lng: xx });
    },

    // Get the closest point on a segment to a given point
    getClosestPointOnSegment: function (p, a, b) {
        const x = p.lng, y = p.lat;
        const x1 = a.lng, y1 = a.lat;
        const x2 = b.lng, y2 = b.lat;

        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) param = (A * C + B * D) / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        return { lat: yy, lng: xx };
    },

    // Distance from point to polyline (array of points)
    distanceToPolyline: function (point, polyline) {
        return this.projectOnPolyline(point, polyline).dist;
    },

    // Get closest distance, segment index, and the projected point
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

        let projectedPoint = null;
        if (index !== -1) {
            projectedPoint = this.getClosestPointOnSegment(point, polyline[index], polyline[index + 1]);
        }

        return { dist: minDist, index: index, point: projectedPoint };
    },

    // Calculate distance along route between two points on the polyline
    distanceAlongRoute: function (pointA, pointB, polyline) {
        const projA = this.projectOnPolyline(pointA, polyline);
        const projB = this.projectOnPolyline(pointB, polyline);

        if (projA.index === -1 || projB.index === -1) return -1;

        let totalDist = 0;
        if (projB.index >= projA.index) {
            // Standard forward path
            totalDist += this.getDistance(projA.point, polyline[projA.index + 1]);
            for (let i = projA.index + 1; i < projB.index; i++) {
                totalDist += this.getDistance(polyline[i], polyline[i + 1]);
            }
            totalDist += this.getDistance(polyline[projB.index], projB.point);
        } else {
            // Loop path
            totalDist += this.getDistance(projA.point, polyline[projA.index + 1]);
            for (let i = projA.index + 1; i < polyline.length - 1; i++) {
                totalDist += this.getDistance(polyline[i], polyline[i + 1]);
            }
            for (let i = 0; i < projB.index; i++) {
                totalDist += this.getDistance(polyline[i], polyline[i + 1]);
            }
            totalDist += this.getDistance(polyline[projB.index], projB.point);
        }

        return totalDist;
    },

    // Extract the segment of the route between two points
    extractRouteSegment: function (path, p1, p2) {
        const candidates1 = this.findAllProjections(p1, path, 100);
        const candidates2 = this.findAllProjections(p2, path, 100);

        if (candidates1.length === 0 || candidates2.length === 0) {
            const proj1 = this.projectOnPolyline(p1, path);
            const proj2 = this.projectOnPolyline(p2, path);
            if (proj1.index === -1 || proj2.index === -1 || proj2.index < proj1.index) return null;
            return path.slice(proj1.index, proj2.index + 2);
        }

        let bestStart = -1;
        let bestEnd = -1;
        let minRouteDist = Infinity;

        candidates1.forEach(c1 => {
            candidates2.forEach(c2 => {
                if (c2.index > c1.index) {
                    const distCheck = c2.index - c1.index;
                    if (distCheck < minRouteDist) {
                        minRouteDist = distCheck;
                        bestStart = c1.index;
                        bestEnd = c2.index;
                    }
                }
            });
        });

        if (bestStart !== -1) {
            return path.slice(bestStart, bestEnd + 2);
        }
        return null;
    },

    // Find ALL projections within a threshold distance (meters)
    findAllProjections: function (point, polyline, threshold = 200) {
        const results = [];
        for (let i = 0; i < polyline.length - 1; i++) {
            const dist = this.distanceToSegment(point, polyline[i], polyline[i + 1]);
            if (dist < threshold) {
                const projectedPoint = this.getClosestPointOnSegment(point, polyline[i], polyline[i + 1]);
                results.push({ dist: dist, index: i, point: projectedPoint });
            }
        }
        return results.sort((a, b) => a.dist - b.dist);
    },

    // Smart distance calculation that handles overlapping segments
    smartDistanceAlongRoute: function (pointA, pointB, polyline) {
        const candidatesA = this.findAllProjections(pointA, polyline, 300);
        const candidatesB = this.findAllProjections(pointB, polyline, 300);

        if (candidatesA.length === 0 || candidatesB.length === 0) {
            return this.distanceAlongRoute(pointA, pointB, polyline);
        }

        let validDist = -1;
        let minScore = Infinity;

        candidatesA.forEach(cA => {
            candidatesB.forEach(cB => {
                let routeDist = 0;
                if (cB.index >= cA.index) {
                    routeDist += this.getDistance(cA.point, polyline[cA.index + 1]);
                    for (let k = cA.index + 1; k < cB.index; k++) {
                        routeDist += this.getDistance(polyline[k], polyline[k + 1]);
                    }
                    routeDist += this.getDistance(polyline[cB.index], cB.point);
                } else {
                    routeDist += this.getDistance(cA.point, polyline[cA.index + 1]);
                    for (let k = cA.index + 1; k < polyline.length - 1; k++) {
                        routeDist += this.getDistance(polyline[k], polyline[k + 1]);
                    }
                    for (let k = 0; k < cB.index; k++) {
                        routeDist += this.getDistance(polyline[k], polyline[k + 1]);
                    }
                    routeDist += this.getDistance(polyline[cB.index], cB.point);
                }

                const spatialError = cA.dist + cB.dist;
                const score = spatialError + (routeDist * 0.001);

                if (score < minScore) {
                    minScore = score;
                    validDist = routeDist;
                }
            });
        });

        return validDist !== -1 ? validDist : this.distanceAlongRoute(pointA, pointB, polyline);
    },

    getTripSegmentIndices: function (origin, dest, polyline) {
        const candidatesOrigin = this.findAllProjections(origin, polyline, 300);
        const candidatesDest = this.findAllProjections(dest, polyline, 300);

        let bestStart = -1;
        let bestEnd = -1;
        let minRouteDist = Infinity;

        candidatesOrigin.forEach(cO => {
            candidatesDest.forEach(cD => {
                let routeDist = 0;
                if (cD.index >= cO.index) {
                    routeDist = cD.index - cO.index;
                } else {
                    routeDist = (polyline.length - cO.index) + cD.index;
                }

                if (routeDist < minRouteDist) {
                    minRouteDist = routeDist;
                    bestStart = cO.index;
                    bestEnd = cD.index;
                }
            });
        });

        return bestStart !== -1 ? { startIndex: bestStart, endIndex: bestEnd } : null;
    },

    getBearing: function (p1, p2) {
        const φ1 = p1.lat * Math.PI / 180;
        const φ2 = p2.lat * Math.PI / 180;
        const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        const θ = Math.atan2(y, x);
        const brng = (θ * 180 / Math.PI + 360) % 360;
        return brng;
    },

    isHeadingAligned: function (h1, h2, tolerance = 90) {
        if (h1 === null || h1 === undefined || h2 === null || h2 === undefined) return true;
        let diff = Math.abs(h1 - h2);
        if (diff > 180) diff = 360 - diff;
        return diff <= tolerance;
    },

    distanceToRouteIndex: function (point, targetIndex, polyline, busHeading = null) {
        let candidates = this.findAllProjections(point, polyline, 500);

        candidates = candidates.filter(c => {
            if (busHeading !== null && busHeading !== undefined && busHeading !== 0) {
                const segmentEnd = polyline[c.index + 1];
                if (segmentEnd) {
                    const routeHeading = this.getBearing(polyline[c.index], segmentEnd);
                    if (!this.isHeadingAligned(busHeading, routeHeading, 75)) {
                        return false;
                    }
                }
            }
            return true;
        });

        if (candidates.length === 0) return -1;

        const bestCandidate = candidates[0];
        let dist = this.getDistance(bestCandidate.point, polyline[bestCandidate.index + 1]);

        if (bestCandidate.index + 1 <= targetIndex) {
            for (let k = bestCandidate.index + 1; k < targetIndex; k++) {
                dist += this.getDistance(polyline[k], polyline[k + 1]);
            }
        } else {
            for (let k = bestCandidate.index + 1; k < polyline.length - 1; k++) {
                dist += this.getDistance(polyline[k], polyline[k + 1]);
            }
            for (let k = 0; k < targetIndex; k++) {
                dist += this.getDistance(polyline[k], polyline[k + 1]);
            }
        }

        return dist;
    },

    checkDirection: function (bearing, ways) {
        if (!ways || !Array.isArray(ways)) return { isMismatch: false, wayResolved: null };

        let bestWay = null;
        let minHeadingDiff = 45;

        ways.forEach(way => {
            if (!way.geometry || way.geometry.length < 2) return;

            const pStart = way.geometry[0];
            const pEnd = way.geometry[way.geometry.length - 1];
            const p1 = { lat: pStart.lat, lng: pStart.lon || pStart.lng };
            const p2 = { lat: pEnd.lat, lng: pEnd.lon || pEnd.lng };

            const wayForwardBearing = this.getBearing(p1, p2);

            let diffForward = Math.abs(bearing - wayForwardBearing) % 360;
            if (diffForward > 180) diffForward = 360 - diffForward;

            let diffBackward = Math.abs(bearing - (wayForwardBearing + 180) % 360) % 360;
            if (diffBackward > 180) diffBackward = 360 - diffBackward;

            const bestDiff = Math.min(diffForward, diffBackward);

            if (bestDiff < minHeadingDiff) {
                minHeadingDiff = bestDiff;
                bestWay = way;
                bestWay.forwardBearing = wayForwardBearing;
            }
        });

        if (!bestWay) return { isMismatch: false, wayResolved: null };

        const oneway = (bestWay.tags && bestWay.tags.oneway) || "no";
        if (oneway === "no") return { isMismatch: false, wayResolved: bestWay };

        let legalBearing = bestWay.forwardBearing;
        if (oneway === "-1") legalBearing = (legalBearing + 180) % 360;

        const totalDiff = Math.abs(bearing - legalBearing) % 360;
        const normalizedDiff = totalDiff > 180 ? 360 - totalDiff : totalDiff;

        if (normalizedDiff > 100) {
            return { isMismatch: true, wayResolved: bestWay };
        }

        if (normalizedDiff < 45) {
            return { isMismatch: false, wayResolved: bestWay, isExplicitMatch: true };
        }

        return { isMismatch: false, wayResolved: bestWay };
    },

    detectBusMotionInversion: function (positions, polyline) {
        if (!positions || positions.length === 0 || !polyline || polyline.length < 2) {
            return { isMismatch: false, mismatchCount: 0, matchCount: 0, confidence: 0 };
        }

        let mismatchCount = 0;
        let matchCount = 0;
        let totalValids = 0;

        positions.forEach(bus => {
            if (!bus.inferredHeading && !bus.orientacion_verificada) return;

            const headingToUse = bus.inferredHeading || bus.orientacion;
            const busPoint = { lat: bus.latitud, lng: bus.longitud };
            
            const candidates = this.findAllProjections(busPoint, polyline, 80);
            if (candidates.length === 0) return;

            totalValids++;
            const bestCandidate = candidates[0];
            const p1 = polyline[bestCandidate.index];
            const p2 = polyline[bestCandidate.index + 1];
            if (!p2) return;

            const routeHeading = this.getBearing(p1, p2);

            if (!this.isHeadingAligned(headingToUse, routeHeading, 110)) {
                mismatchCount++;
            } else if (this.isHeadingAligned(headingToUse, routeHeading, 60)) {
                matchCount++;
            }
        });

        const confidence = totalValids > 0 ? (mismatchCount / totalValids) : 0;
        const isMismatch = (mismatchCount > matchCount) && (mismatchCount >= 1);

        return { isMismatch, mismatchCount, matchCount, confidence };
    },

    // Calculate total length of a path in meters
    calculatePathLength: function (path) {
        if (!path || path.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            total += this.getDistance(path[i], path[i + 1]);
        }
        return total;
    }
};

window.Geometry = Geometry;
