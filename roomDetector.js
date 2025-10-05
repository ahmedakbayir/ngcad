import * as state from './state.js';

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
    if (state.walls.length < 3) {
        state.set({ rooms: [] });
        return;
    }
    const lines = state.walls.map(wall => turf.lineString([[wall.p1.x, wall.p1.y], [wall.p2.x, wall.p2.y]]));
    const featureCollection = turf.featureCollection(lines);
    let newRooms = [];
    try {
        const polygons = turf.polygonize(featureCollection);
        if (polygons.features.length > 0) {
            polygons.features.forEach((polygon) => {
                const areaInCm2 = calculatePlanarArea(polygon.geometry.coordinates);
                if (areaInCm2 < 1) return;
                const areaInM2 = areaInCm2 / 10000;
                const centerPoint = turf.pointOnFeature(polygon);
                newRooms.push({
                    polygon: polygon,
                    area: areaInM2,
                    center: centerPoint.geometry.coordinates,
                });
            });
        }
    } catch (e) {
        console.error("Turf.js hata verdi:", e);
    }
    state.set({ rooms: newRooms });
}