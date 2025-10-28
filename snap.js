import { state, dom, setState, SNAP_UNLOCK_DISTANCE_CM } from './main.js';
import { screenToWorld, worldToScreen, distToSegmentSquared } from './geometry.js';
import { getColumnCorners } from './columns.js';
import { getBeamCorners } from './beams.js';
import { getStairCorners } from './stairs.js';

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

    if (state.currentMode === 'drawDoor' || state.currentMode === 'drawBeam') {
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

    if (state.currentMode === 'drawStairs') {
    const edgeCandidates = [];
    
    for (const wall of wallsToScan) {
        if (!wall.p1 || !wall.p2) continue;
        
        const wallThickness = wall.thickness || state.wallThickness;
        const halfThickness = wallThickness / 2;
        const dxW = wall.p2.x - wall.p1.x;
        const dyW = wall.p2.y - wall.p1.y;
        const wallLen = Math.hypot(dxW, dyW);
        if (wallLen < 0.1) continue;
        
        const isVertical = Math.abs(dxW) < 0.1;
        const isHorizontal = Math.abs(dyW) < 0.1;
        
        if (isVertical) {
            const wallX = wall.p1.x;
            const snapXPositions = [wallX - halfThickness, wallX + halfThickness];
            
            for (const snapX of snapXPositions) {
                const screenSnapPoint = worldToScreen(snapX, wm.y);
                const distance = Math.abs(screenMouse.x - screenSnapPoint.x);
                
                if (distance < SNAP_RADIUS_PIXELS) {
                    edgeCandidates.push({
                        point: { x: snapX, y: wm.y },
                        distance: distance,
                        type: 'WALL_EDGE'
                    });
                }
            }
        } else if (isHorizontal) {
            const wallY = wall.p1.y;
            const snapYPositions = [wallY - halfThickness, wallY + halfThickness];
            
            for (const snapY of snapYPositions) {
                const screenSnapPoint = worldToScreen(wm.x, snapY);
                const distance = Math.abs(screenMouse.y - screenSnapPoint.y);
                
                if (distance < SNAP_RADIUS_PIXELS) {
                    edgeCandidates.push({
                        point: { x: wm.x, y: snapY },
                        distance: distance,
                        type: 'WALL_EDGE'
                    });
                }
            }
        }
    }
    
    // En yakın kenar snap'ini bul
    if (edgeCandidates.length > 0) {
        edgeCandidates.sort((a, b) => a.distance - b.distance);
        const bestEdgeSnap = edgeCandidates[0];
        
        return {
            x: bestEdgeSnap.point.x,
            y: bestEdgeSnap.point.y,
            isSnapped: true,
            snapLines: { h_origins: [], v_origins: [] },
            isLockable: false,
            point: bestEdgeSnap.point,
            snapType: 'WALL_EDGE',
            roundedX: bestEdgeSnap.point.x,
            roundedY: bestEdgeSnap.point.y
        };
    }
    
    // Kenar snap'i bulunamadıysa normal fare pozisyonu
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

    // --- YENİ: KOLON, KİRİŞ VE MERDİVEN SNAP NOKTALARI ---
    const COLUMN_BEAM_SNAP_DISTANCE_CM = 5; // Kolon ve kiriş için snap mesafesi (cm)
    const COLUMN_BEAM_SNAP_DISTANCE_PIXELS = COLUMN_BEAM_SNAP_DISTANCE_CM * state.zoom;

    // Kolonlar için snap noktaları
    if (state.columns) {
        for (const column of state.columns) {
            const corners = getColumnCorners(column);
            const center = column.center;
            
            // Köşeler ve merkez
            const pointsToCheck = [...corners, center];
            
            for (const point of pointsToCheck) {
                const screenPoint = worldToScreen(point.x, point.y);
                const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                
                // Sadece 5cm mesafe dahilinde snap yap
                if (distance < COLUMN_BEAM_SNAP_DISTANCE_PIXELS) {
                    candidates.push({ point: point, distance: distance, type: 'ENDPOINT' });
                }
            }
        }
    }

    // Kirişler için snap noktaları
    if (state.beams) {
        for (const beam of state.beams) {
            const corners = getBeamCorners(beam);
            const center = beam.center;
            
            // Köşeler ve merkez
            const pointsToCheck = [...corners, center];
            
            for (const point of pointsToCheck) {
                const screenPoint = worldToScreen(point.x, point.y);
                const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                
                // Sadece 5cm mesafe dahilinde snap yap
                if (distance < COLUMN_BEAM_SNAP_DISTANCE_PIXELS) {
                    candidates.push({ point: point, distance: distance, type: 'ENDPOINT' });
                }
            }
        }
    }

    // Merdivenler için snap noktaları (DIŞ KENAR ÇİZGİSİ)
    if (state.stairs) {
        for (const stair of state.stairs) {
            const corners = getStairCorners(stair);
            const rotRad = (stair.rotation || 0) * Math.PI / 180;
            const perpX = -Math.sin(rotRad);
            const perpY = Math.cos(rotRad);
            const doubleLineOffset = 0 / state.zoom; // renderer2d.js'teki ile aynı
            
            // DIŞ kenar çizgisinin köşe noktaları
            const outerCorners = [
                { x: corners[0].x - perpX * doubleLineOffset, y: corners[0].y - perpY * doubleLineOffset },
                { x: corners[1].x - perpX * doubleLineOffset, y: corners[1].y - perpY * doubleLineOffset },
                { x: corners[2].x + perpX * doubleLineOffset, y: corners[2].y + perpY * doubleLineOffset },
                { x: corners[3].x + perpX * doubleLineOffset, y: corners[3].y + perpY * doubleLineOffset }
            ];
            
            // Dış köşeler ve merkez
            const pointsToCheck = [...outerCorners, stair.center];
            
            for (const point of pointsToCheck) {
                const screenPoint = worldToScreen(point.x, point.y);
                const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                
                if (distance < SNAP_RADIUS_PIXELS) {
                    candidates.push({ point: point, distance: distance, type: 'ENDPOINT' });
                }
            }
        }
    }
    // --- KOLON, KİRİŞ VE MERDİVEN SNAP NOKTALARI SONU ---

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