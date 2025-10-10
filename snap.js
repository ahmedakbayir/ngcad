import { state, dom, SNAP_UNLOCK_DISTANCE_CM } from './main.js'; // 'dom' objesini buraya ekleyin
import { screenToWorld, worldToScreen, distToSegmentSquared } from './geometry.js';

export function getSmartSnapPoint(e, applyGridSnapFallback = true) {
    // Hatalı satırı düzeltiyoruz: 'state' yerine doğrudan 'dom' kullanıyoruz
    const rect = dom.c2d.getBoundingClientRect(); 
    const screenMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const wm = screenToWorld(screenMouse.x, screenMouse.y);

    if (state.currentMode === 'select' && !state.isDragging) {
        return { x: wm.x, y: wm.y, isSnapped: false, snapLines: { h_origins: [], v_origins: [] } };
    }

    if (state.isSnapLocked && state.lockedSnapPoint) {
        const distCm = Math.hypot(wm.x - state.lockedSnapPoint.x, wm.y - state.lockedSnapPoint.y);
        if (distCm < SNAP_UNLOCK_DISTANCE_CM) {
            return { x: state.lockedSnapPoint.x, y: state.lockedSnapPoint.y, isSnapped: true, snapLines: state.mousePos.snapLines };
        } else {
            // state.isSnapLocked = false;
            // state.lockedSnapPoint = null;
            // Bu şekilde state doğrudan değiştirilmemeli. setState kullanılmalı ama bu fonksiyon içinde gerek yok.
        }
    }

    let x = wm.x, y = wm.y, isSnapped = false;
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
        if (state.snapOptions.endpoint) pointsToCheck.push({p: p1, type: 'ENDPOINT'}, {p: p2, type: 'ENDPOINT'});
        if (state.snapOptions.midpoint) pointsToCheck.push({p: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, type: 'MIDPOINT'});

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

    const uniqueExtensionPoints = Array.from(new Set(extensionPoints));
    uniqueExtensionPoints.forEach(p => {
        if (p === draggedNode) return;
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

        if (bestSnap.type === 'INTERSECTION' || bestSnap.type === 'PROJECTION') {
            if (Math.abs(x - bestVSnap.x) < 0.1 && bestVSnap.origin) snapLines.v_origins.push(bestVSnap.origin);
            if (Math.abs(y - bestHSnap.y) < 0.1 && bestHSnap.origin) snapLines.h_origins.push(bestHSnap.origin);
        }

        // Bu kısım state'i doğrudan değiştirdiği için sorun yaratabilir,
        // setState ile yapılması daha doğru olur ama şimdilik hatayı çözmek için bu şekilde bırakabiliriz.
        // Asıl sorun, bu fonksiyonun çağrıldığı yerin state'i güncellemesidir.
        // state.isSnapLocked = lockableSnapTypes.includes(bestSnap.type);
        // state.lockedSnapPoint = state.isSnapLocked ? bestSnap.point : null;
    } else {
        // state.isSnapLocked = false;
        // state.lockedSnapPoint = null;
        if (applyGridSnapFallback) {
            x = Math.round(x / state.gridOptions.spacing) * state.gridOptions.spacing;
            y = Math.round(y / state.gridOptions.spacing) * state.gridOptions.spacing;
        }
    }
    return { x, y, isSnapped, snapLines };
}