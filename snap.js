import { state, setState, SNAP_UNLOCK_DISTANCE_CM } from './main.js';
import { screenToWorld } from './geometry.js';
import { getColumnCorners } from './columns.js'; // EKLE

export function getSmartSnapPoint(e, enableSnap = true) {
    const rect = state.dom?.c2d?.getBoundingClientRect() || document.getElementById('c2d').getBoundingClientRect();
    const rawWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (!enableSnap || state.currentMode === 'drawDoor' || state.currentMode === 'drawWindow' || state.currentMode === 'drawVent') {
        return {
            x: rawWorld.x,
            y: rawWorld.y,
            roundedX: rawWorld.x,
            roundedY: rawWorld.y,
            isSnapped: false,
            snapType: null,
            snapLines: { h_origins: [], v_origins: [] }
        };
    }

    if (state.isSnapLocked && state.lockedSnapPoint) {
        return state.lockedSnapPoint;
    }

    const snapRadius = 15 / state.zoom;
    const snapPoints = getSnapPoints();
    let bestSnap = null;
    let minDist = snapRadius;

    for (const sp of snapPoints) {
        const dist = Math.hypot(rawWorld.x - sp.x, rawWorld.y - sp.y);
        if (dist < minDist) {
            minDist = dist;
            bestSnap = sp;
        }
    }

    if (state.snapOptions.nearestOnly && bestSnap) {
        const result = {
            x: bestSnap.x,
            y: bestSnap.y,
            roundedX: bestSnap.x,
            roundedY: bestSnap.y,
            isSnapped: true,
            snapType: bestSnap.type,
            snapLines: { h_origins: [], v_origins: [] }
        };
        return result;
    }

    const extensionSnapRadius = 8 / state.zoom;
    let snapX = null, snapY = null;
    let snapTypeX = null, snapTypeY = null;
    const hOrigins = [], vOrigins = [];

    if (bestSnap) {
        snapX = bestSnap.x;
        snapY = bestSnap.y;
        snapTypeX = bestSnap.type;
        snapTypeY = bestSnap.type;
    }

    for (const sp of snapPoints) {
        if (sp === bestSnap) continue;
        const dx = Math.abs(rawWorld.x - sp.x);
        const dy = Math.abs(rawWorld.y - sp.y);

        if (dx < extensionSnapRadius && snapY === null) {
            snapX = sp.x;
            snapTypeX = sp.type;
            vOrigins.push({ x: sp.x, y: sp.y });
        }

        if (dy < extensionSnapRadius && snapX === null) {
            snapY = sp.y;
            snapTypeY = sp.type;
            hOrigins.push({ x: sp.x, y: sp.y });
        }
    }

    if (snapX === null && snapY === null) {
        if (state.gridOptions.visible) {
            const gridSpacing = state.gridOptions.spacing;
            const snappedX = Math.round(rawWorld.x / gridSpacing) * gridSpacing;
            const snappedY = Math.round(rawWorld.y / gridSpacing) * gridSpacing;
            return {
                x: snappedX,
                y: snappedY,
                roundedX: snappedX,
                roundedY: snappedY,
                isSnapped: true,
                snapType: 'GRID',
                snapLines: { h_origins: [], v_origins: [] }
            };
        }

        return {
            x: rawWorld.x,
            y: rawWorld.y,
            roundedX: rawWorld.x,
            roundedY: rawWorld.y,
            isSnapped: false,
            snapType: null,
            snapLines: { h_origins: [], v_origins: [] }
        };
    }

    const finalX = snapX !== null ? snapX : rawWorld.x;
    const finalY = snapY !== null ? snapY : rawWorld.y;
    const finalSnapType = snapX !== null && snapY !== null ? 'INTERSECTION' : (snapTypeX || snapTypeY);

    const result = {
        x: finalX,
        y: finalY,
        roundedX: finalX,
        roundedY: finalY,
        isSnapped: true,
        snapType: finalSnapType,
        snapLines: { h_origins: hOrigins, v_origins: vOrigins }
    };

    if (state.startPoint) {
        const distToStart = Math.hypot(finalX - state.startPoint.x, finalY - state.startPoint.y);
        if (distToStart > SNAP_UNLOCK_DISTANCE_CM && !state.isSnapLocked) {
            setState({ isSnapLocked: true, lockedSnapPoint: result });
        }
    }

    return result;
}

function getSnapPoints() {
    const snapPoints = [];

    if (state.snapOptions.endpoint) {
        state.walls.forEach(wall => {
            snapPoints.push({ x: wall.p1.x, y: wall.p1.y, type: 'ENDPOINT' });
            snapPoints.push({ x: wall.p2.x, y: wall.p2.y, type: 'ENDPOINT' });
        });

        // KOLON SNAP NOKTALARI - GÜNCELLENDİ
        if (state.columns && state.columns.length > 0) {
            state.columns.forEach(column => {
                // Sadece merkez noktasını ekle
                snapPoints.push({ x: column.center.x, y: column.center.y, type: 'ENDPOINT' });
                
                // Köşe noktalarını ekle (varsa)
                const corners = getColumnCorners(column);
                if (corners && corners.length > 0) {
                    corners.forEach(corner => {
                        snapPoints.push({ x: corner.x, y: corner.y, type: 'ENDPOINT' });
                    });
                }
            });
        }
    }

    if (state.snapOptions.midpoint) {
        state.walls.forEach(wall => {
            const midX = (wall.p1.x + wall.p2.x) / 2;
            const midY = (wall.p1.y + wall.p2.y) / 2;
            snapPoints.push({ x: midX, y: midY, type: 'MIDPOINT' });
        });
    }

    if (state.snapOptions.endpointExtension) {
        state.walls.forEach(wall => {
            snapPoints.push({ x: wall.p1.x, y: wall.p1.y, type: 'ENDPOINT' });
            snapPoints.push({ x: wall.p2.x, y: wall.p2.y, type: 'ENDPOINT' });
        });
    }

    if (state.snapOptions.midpointExtension) {
        state.walls.forEach(wall => {
            const midX = (wall.p1.x + wall.p2.x) / 2;
            const midY = (wall.p1.y + wall.p2.y) / 2;
            snapPoints.push({ x: midX, y: midY, type: 'MIDPOINT' });
        });
    }

    return snapPoints;
}