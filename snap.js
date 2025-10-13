import { state, dom, setState, SNAP_UNLOCK_DISTANCE_CM } from './main.js';
import { screenToWorld, worldToScreen, distToSegmentSquared } from './geometry.js';

export function getSmartSnapPoint(e, applyGridSnapFallback = true) {
    const rect = dom.c2d.getBoundingClientRect();
    const screenMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const wm = screenToWorld(screenMouse.x, screenMouse.y);

    // --- YENİ MANTIK ---
    // Eğer bir kapı sürükleniyorsa, hiçbir snap işlemi yapma ve doğrudan fare pozisyonunu döndür.
    if (state.isDragging && state.selectedObject?.type === 'door') {
        return {
            x: wm.x,
            y: wm.y,
            isSnapped: false,
            snapLines: { h_origins: [], v_origins: [] },
            isLockable: false,
            roundedX: wm.x,
            roundedY: wm.y
        };
    }
    // --- YENİ MANTIK SONU ---

    if (state.currentMode === 'drawDoor') {
        const gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1;
        let roundedX = Math.round(wm.x / gridValue) * gridValue;
        let roundedY = Math.round(wm.y / gridValue) * gridValue;
        return { 
            x: wm.x, 
            y: wm.y, 
            isSnapped: false, 
            snapLines: { h_origins: [], v_origins: [] }, 
            isLockable: false, 
            roundedX: roundedX, 
            roundedY: roundedY 
        };
    }
    
    const gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1;
    let roundedX = Math.round(wm.x / gridValue) * gridValue;
    let roundedY = Math.round(wm.y / gridValue) * gridValue;

    if (state.currentMode === 'select' && !state.isDragging) {
        return { x: wm.x, y: wm.y, isSnapped: false, snapLines: { h_origins: [], v_origins: [] }, isLockable: false, roundedX: wm.x, roundedY: wm.y };
    }

    if (state.isSnapLocked && state.lockedSnapPoint) {
        if (state.lockedSnapPoint.roundedX) {
            const distCm = Math.hypot(wm.x - state.lockedSnapPoint.roundedX, wm.y - state.lockedSnapPoint.roundedY);
            if (distCm < SNAP_UNLOCK_DISTANCE_CM) {
                return { ...state.lockedSnapPoint, isSnapped: true, snapLines: state.mousePos.snapLines, isLockable: true, roundedX: state.lockedSnapPoint.roundedX, roundedY: state.lockedSnapPoint.roundedY };
            } else {
                 setState({ isSnapLocked: false, lockedSnapPoint: null });
            }
        }
    }

    let x = wm.x, y = wm.y, isSnapped = false, isLockable = false;
    let snapLines = { h_origins: [], v_origins: [] };
    const SNAP_RADIUS_PIXELS = 35;
    const lockableSnapTypes = ['INTERSECTION', 'ENDPOINT'];

    const wallsToScan = state.snapOptions.nearestOnly
        ? state.walls.map(wall => ({ wall, distance: Math.sqrt(distToSegmentSquared(wm, wall.p1, wall.p2)) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)
          .map(item => item.wall)
        : state.walls;

    const candidates = [];
    let draggedNode = (state.isDragging && state.selectedObject?.type === "wall" && state.selectedObject.handle !== "body")
        ? state.selectedObject.object[state.selectedObject.handle]
        : null;
    for (const wall of wallsToScan) {
        if (draggedNode === wall.p1 || draggedNode === wall.p2) continue;
        const p1 = wall.p1, p2 = wall.p2;

        const pointsToCheck = [];
        if (state.snapOptions.endpoint && state.currentMode !== "drawDoor") {
            pointsToCheck.push({p: p1, type: 'ENDPOINT'}, {p: p2, type: 'ENDPOINT'});
        }
        if (state.snapOptions.midpoint) {
            pointsToCheck.push({p: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, type: 'MIDPOINT'});
        }
        pointsToCheck.forEach(item => {
            const screenPoint = worldToScreen(item.p.x, item.p.y);
            const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
            if (distance < SNAP_RADIUS_PIXELS) candidates.push({ point: item.p, distance: distance, type: item.type });
        });
    }

    let bestVSnap = { x: null, dist: Infinity, origin: null };
    let bestHSnap = { y: null, dist: Infinity, origin: null };

    const extensionPoints = [];
    if (state.startPoint) extensionPoints.push(state.startPoint);

    if (state.snapOptions.endpointExtension || state.snapOptions.midpointExtension) {
        wallsToScan.forEach(w => {
            if (state.snapOptions.endpointExtension) extensionPoints.push(w.p1, w.p2);
            if (state.snapOptions.midpointExtension) extensionPoints.push({ x: (w.p1.x + w.p2.x) / 2, y: (w.p1.y + w.p2.y) / 2 });
        });
    }

    const uniqueExtensionPoints = [...new Set(extensionPoints.filter(p => p !== draggedNode))];

    uniqueExtensionPoints.forEach(p => {
        const dx = Math.abs(wm.x - p.x) * state.zoom;
        if (dx < SNAP_RADIUS_PIXELS && dx < bestVSnap.dist) {
            bestVSnap = { x: p.x, dist: dx, origin: p };
        }
        const dy = Math.abs(wm.y - p.y) * state.zoom;
        if (dy < SNAP_RADIUS_PIXELS && dy < bestHSnap.dist) {
            bestHSnap = { y: p.y, dist: dy, origin: p };
        }
    });

    if (bestVSnap.x !== null && bestHSnap.y !== null) {
        const intersectPt = { x: bestVSnap.x, y: bestHSnap.y };
        const distToIntersection = Math.hypot(screenMouse.x - worldToScreen(intersectPt.x, intersectPt.y).x, screenMouse.y - worldToScreen(intersectPt.x, intersectPt.y).y);
        if (distToIntersection < SNAP_RADIUS_PIXELS) {
            candidates.push({ point: intersectPt, distance: distToIntersection, type: 'INTERSECTION' });
        }
    }
    if (bestVSnap.x !== null) candidates.push({ point: { x: bestVSnap.x, y: wm.y }, distance: bestVSnap.dist, type: 'PROJECTION' });
    if (bestHSnap.y !== null) candidates.push({ point: { x: wm.x, y: bestHSnap.y }, distance: bestHSnap.dist, type: 'PROJECTION' });

    let bestSnap = null;
    if (candidates.length > 0) {
        candidates.sort((a, b) => {
            const priority = { 'INTERSECTION': 0, 'ENDPOINT': 0, 'MIDPOINT': 1, 'PROJECTION': 2 };
            const pA = priority[a.type] ?? 99;
            const pB = priority[b.type] ?? 99;
            if (pA !== pB) return pA - pB;
            return a.distance - b.distance;
        });
        bestSnap = candidates[0];
    }
    
    if (bestSnap) {
        x = bestSnap.point.x;
        y = bestSnap.point.y;
        isSnapped = true;
        isLockable = lockableSnapTypes.includes(bestSnap.type);
        
        roundedX = x;
        roundedY = y;

        if (bestSnap.type === 'INTERSECTION' || bestSnap.type === 'PROJECTION') {
            if (Math.abs(x - (bestVSnap.x || x)) < 0.1 && bestVSnap.origin) snapLines.v_origins.push(bestVSnap.origin);
            if (Math.abs(y - (bestHSnap.y || y)) < 0.1 && bestHSnap.origin) snapLines.h_origins.push(bestHSnap.origin);
        }
    } else {
        x = wm.x; 
        y = wm.y; 
        isSnapped = false;
    }
    
    if (isLockable && bestSnap) {
        setState({ isSnapLocked: true, lockedSnapPoint: { ...bestSnap.point, roundedX: roundedX, roundedY: roundedY } });
    } else {
        setState({ isSnapLocked: false, lockedSnapPoint: null });
    }

    return { x, y, isSnapped, snapLines, isLockable, point: bestSnap ? bestSnap.point : null, snapType: bestSnap ? bestSnap.type : null, roundedX, roundedY };
}