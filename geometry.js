import { state, setState, DRAG_HANDLE_RADIUS, EXTEND_RANGE } from './main.js';

export function screenToWorld(sx, sy) {
    const { zoom, panOffset } = state;
    return {
        x: (sx - panOffset.x) / zoom,
        y: (sy - panOffset.y) / zoom
    };
}

export function worldToScreen(wx, wy) {
    const { zoom, panOffset } = state;
    return {
        x: wx * zoom + panOffset.x,
        y: wy * zoom + panOffset.y
    };
}

export function distToSegmentSquared(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return ((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
}

export function getLineIntersection(p1, p2, p3, p4) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (d === 0) return null;
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
    if (t > 0.0001 && t < 0.9999 && u > 0.0001 && u < 0.9999) return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    return null;
}

export function findNodeAt(x, y) {
    const { nodes, zoom } = state;
    const r = DRAG_HANDLE_RADIUS / zoom;
    for (const n of nodes) {
        if (Math.hypot(n.x - x, n.y - y) < r) return n;
    }
    return null;
}

export function getOrCreateNode(x, y) {
    const { nodes, zoom } = state;
    const SNAP = 6 / zoom;
    for (const n of nodes) {
        if (Math.hypot(n.x - x, n.y - y) < SNAP) return n;
    }
    const nn = { x, y };
    nodes.push(nn);
    return nn;
}

function calculatePlanarArea(coords) {
    let area = 0;
    const points = coords[0];
    if (!points || points.length < 3) return 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        area += p1[0] * p2[1] - p2[0] * p1[1];
    }
    return Math.abs(area) / 2;
}

export function detectRooms() {
    const { walls } = state;
    const oldRooms = [...state.rooms];
    if (walls.length < 3) {
        setState({ rooms: [] });
        return;
    }
    
    // Geçerli duvarları filtrele
    const validWalls = walls.filter(wall => {
        if (!wall || !wall.p1 || !wall.p2) return false;
        const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        return length > 0.1 && 
               isFinite(wall.p1.x) && isFinite(wall.p1.y) && 
               isFinite(wall.p2.x) && isFinite(wall.p2.y);
    });
    
    if (validWalls.length < 3) {
        setState({ rooms: [] });
        return;
    }
    
    const lines = validWalls.map((wall) => {
        try {
            return turf.lineString([
                [wall.p1.x, wall.p1.y], 
                [wall.p2.x, wall.p2.y]
            ]);
        } catch (e) {
            console.error("LineString oluşturma hatası:", e, wall);
            return null;
        }
    }).filter(line => line !== null);
    
    if (lines.length < 3) {
        setState({ rooms: [] });
        return;
    }
    
    const featureCollection = turf.featureCollection(lines);
    
    try {
        const polygons = turf.polygonize(featureCollection);
        const newRooms = [];
        if (polygons.features.length > 0) {
            polygons.features.forEach((polygon) => {
                try {
                    const areaInCm2 = calculatePlanarArea(polygon.geometry.coordinates);
                    if (areaInCm2 < 1) return;
                    const areaInM2 = areaInCm2 / 10000;
                    const centerPoint = turf.pointOnFeature(polygon);
                    
                    let existingRoomName = 'TANIMSIZ';
                    if (oldRooms.length > 0) {
                        const containedOldRooms = oldRooms.filter(r => {
                            try {
                                return r.center && turf.booleanPointInPolygon(r.center, polygon);
                            } catch (e) {
                                return false;
                            }
                        });
                        if (containedOldRooms.length > 0) {
                            containedOldRooms.sort((a, b) => b.area - a.area);
                            existingRoomName = containedOldRooms[0].name;
                        }
                    }

                    newRooms.push({
                        polygon: polygon,
                        area: areaInM2,
                        center: centerPoint.geometry.coordinates,
                        name: existingRoomName
                    });
                } catch (e) {
                    console.error("Poligon işleme hatası:", e);
                }
            });
        }
        setState({ rooms: newRooms });
    } catch (e) {
        console.error("Mahal analizi sırasında hata oluştu (Geometri geçersiz olabilir):", e);
        setState({ rooms: [] });
    }
}

export function almostZero(v, eps = 1e-6) {
    return Math.abs(v) < eps;
}

export function areCollinear(a, b, c) {
    return almostZero((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

export function applyStretchModification(movingNode, originalPos, stationaryNode) {
    const deltaX = movingNode.x - originalPos.x;
    const deltaY = movingNode.y - originalPos.y;
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;

    const axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    const delta = axis === 'x' ? deltaX : deltaY;
    const threshold = originalPos[axis];
    const EPSILON = 0.01;
    const stationaryPos = stationaryNode[axis];

    const isMovingSidePositive = (threshold > stationaryPos);

    const nodesToTranslate = new Set();
    state.nodes.forEach(node => {
        if (node === movingNode) return;
        if (isMovingSidePositive) {
            if (node[axis] >= threshold - EPSILON) nodesToTranslate.add(node);
        } else {
            if (node[axis] <= threshold + EPSILON) nodesToTranslate.add(node);
        }
    });

    nodesToTranslate.forEach(node => {
        node[axis] += delta;
    });
}

export function isPointOnWallBody(point) {
    const toleranceSq = 0.1 * 0.1;
    for (const wall of state.walls) {
        if (distToSegmentSquared(point, wall.p1, wall.p2) < toleranceSq) {
            const distToP1 = Math.hypot(point.x - wall.p1.x, point.y - wall.p1.y);
            const distToP2 = Math.hypot(point.x - wall.p2.x, point.y - wall.p2.y);
            if (distToP1 > 1 && distToP2 > 1) {
                return true;
            }
        }
    }
    return false;
}