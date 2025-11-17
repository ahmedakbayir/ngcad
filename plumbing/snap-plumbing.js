// snap-plumbing.js
// ✅ KÖK ÇÖZÜM: Boru çizimi sırasında duvar snap'i KİLİTLENMEZ (smooth çizim)

import { state } from '../general-files/main.js';
import { worldToScreen, getLineIntersectionPoint, distToSegmentSquared } from '../draw/geometry.js';
import { getConnectionPoints, getPlumbingBlockCorners, PLUMBING_BLOCK_TYPES } from '../plumbing/plumbing-blocks.js';

/**
 * TESİSAT ELEMANLARI İÇİN ÖZEL SNAP FONKSİYONU
 * ✅ KRİTİK: Boru çizimi sırasında duvar yüzey snap'i KİLİTLENMEZ
 */
export function getPlumbingSnapPoint(wm, screenMouse, SNAP_RADIUS_PIXELS) {
    const candidates = [];
    const currentFloorId = state.currentFloor?.id;
    const walls = currentFloorId
        ? (state.walls || []).filter(w => w.floorId === currentFloorId)
        : (state.walls || []);
    const plumbingBlocks = currentFloorId 
        ? (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId)
        : (state.plumbingBlocks || []);
    const plumbingPipes = currentFloorId
        ? (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId)
        : (state.plumbingPipes || []);

    const addCandidate = (point, type, distance, wall = null, lockable = true) => {
        if (point && isFinite(point.x) && isFinite(point.y)) {
            candidates.push({ point, type, distance, wall, lockable });
        }
    };

    const isBlockMode = state.currentMode === 'drawPlumbingBlock';
    const isDraggingBlock = state.isDragging && state.selectedObject?.type === 'plumbingBlock';
    const blockConfig = isBlockMode ? PLUMBING_BLOCK_TYPES[state.currentPlumbingBlockType] : null;
    const draggedBlock = isDraggingBlock ? state.selectedObject?.object : null;

    const isPipeDrawing = state.currentMode === 'drawPlumbingPipe';
    const isPipeDrawingActive = isPipeDrawing && state.startPoint; // Çizim devam ediyor mu?
    
    const effectiveSnapRadius = isPipeDrawing ? 
        SNAP_RADIUS_PIXELS * 2.0 : // 60px
        (isDraggingBlock ? SNAP_RADIUS_PIXELS * 0.7 : SNAP_RADIUS_PIXELS);
    
    const INTERSECTION_SNAP_RADIUS = effectiveSnapRadius * 1.5;
    
    const PLUMBING_OFFSET = 5; 
    const EXTENSION_LENGTH = 50; 
    
    const allSnapLines = [];
    
    walls.forEach(wall => {
        if (!wall.p1 || !wall.p2) return;
        
        const wallThickness = wall.thickness || state.wallThickness;
        const halfThickness = wallThickness / 2;
        
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) return;
        
        const dirX = dx / len;
        const dirY = dy / len;
        const nx = -dy / len; 
        const ny = dx / len;
        
        let offset;
        if ((isBlockMode || isDraggingBlock) && (blockConfig || draggedBlock)) {
            const activeConfig = blockConfig || (draggedBlock ? PLUMBING_BLOCK_TYPES[draggedBlock.blockType] : null);
            offset = halfThickness + (activeConfig ? (activeConfig.height / 2) : PLUMBING_OFFSET);
        } else {
            offset = halfThickness + PLUMBING_OFFSET;
        }
        
        const extendedP1 = {
            x: wall.p1.x - dirX * EXTENSION_LENGTH,
            y: wall.p1.y - dirY * EXTENSION_LENGTH
        };
        const extendedP2 = {
            x: wall.p2.x + dirX * EXTENSION_LENGTH,
            y: wall.p2.y + dirY * EXTENSION_LENGTH
        };
        
        const line1 = {
            p1: { x: extendedP1.x + nx * offset, y: extendedP1.y + ny * offset },
            p2: { x: extendedP2.x + nx * offset, y: extendedP2.y + ny * offset }
        };
        const line2 = {
            p1: { x: extendedP1.x - nx * offset, y: extendedP1.y - ny * offset },
            p2: { x: extendedP2.x - nx * offset, y: extendedP2.y - ny * offset }
        };
        
        allSnapLines.push({ line: line1, wall: wall }, { line: line2, wall: wall });
    });

    const allPlumbingBlockEdges = [];
    plumbingBlocks.forEach(block => {
        if (block.blockType !== 'SERVIS_KUTUSU') return; 
        if (isDraggingBlock && block === draggedBlock) return;

        const corners = getPlumbingBlockCorners(block);
        if (corners.length < 4) return;
        for (let i = 0; i < 4; i++) {
            allPlumbingBlockEdges.push({
                block: block,
                p1: corners[i],
                p2: corners[(i + 1) % 4]
            });
        }
    });

    // ✅ Kesişimler (boru çizimi için ÖNCELİKLE aktif, blok modu için de)
    allSnapLines.forEach(snapLineItem => {
        const wallSnapLine = snapLineItem.line;
        allPlumbingBlockEdges.forEach(blockEdge => {
            const intersection = getLineIntersectionPoint(
                wallSnapLine.p1, wallSnapLine.p2,
                blockEdge.p1, blockEdge.p2
            );

            if (intersection && isFinite(intersection.x) && isFinite(intersection.y)) {
                const screenPt = worldToScreen(intersection.x, intersection.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);

                if (dist < INTERSECTION_SNAP_RADIUS) {
                    // Boru çiziminde daha yüksek öncelik (dist * 0.05), blok modunda normal öncelik
                    const priorityMultiplier = isPipeDrawing ? 0.05 : 0.5;
                    addCandidate(intersection, 'PLUMBING_WALL_BLOCK_INTERSECTION', dist * priorityMultiplier, snapLineItem.wall, allowLocking);
                }
            }
        });
    });

    for (let i = 0; i < allSnapLines.length; i++) {
        for (let j = i + 1; j < allSnapLines.length; j++) {
            const line1 = allSnapLines[i].line;
            const line2 = allSnapLines[j].line;

            const intersection = getLineIntersectionPoint(line1.p1, line1.p2, line2.p1, line2.p2);

            if (intersection && isFinite(intersection.x) && isFinite(intersection.y)) {
                const screenPt = worldToScreen(intersection.x, intersection.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);

                if (dist < INTERSECTION_SNAP_RADIUS) {
                    // Boru çiziminde en yüksek öncelik (dist * 0.01), blok modunda düşük öncelik
                    const priorityMultiplier = isPipeDrawing ? 0.01 : 0.1;
                    addCandidate(intersection, 'PLUMBING_INTERSECTION', dist * priorityMultiplier, allSnapLines[i].wall, allowLocking);
                }
            }
        }
    }
    
    // ✅ KRİTİK: KİLİTLEME MANTIĞI
    // - İlk tıklama: Kilitle (başlangıç noktası)
    // - Çizim devam ediyor: Kilitleme (smooth hareket)
    // - Taşıma: Kilitleme (smooth hareket)
    // - Blok yerleştirme: Kilitle
    
    const isDragging = state.isDragging;
    const isDrawingInProgress = isPipeDrawing && state.startPoint;
    
    // Çizim veya taşıma devam ediyorsa HİÇBİR SNAP KİLİTLENMEZ
    const allowLocking = !isDrawingInProgress && !isDragging;
    
    // ✅ Duvar yüzey snap
    allSnapLines.forEach(item => {
        const line = item.line;
        const wall = item.wall;

        const l2 = (line.p1.x - line.p2.x) ** 2 + (line.p1.y - line.p2.y) ** 2;
        if (l2 < 1e-6) return;
        
        let t = ((wm.x - line.p1.x) * (line.p2.x - line.p1.x) + 
                 (wm.y - line.p1.y) * (line.p2.y - line.p1.y)) / l2;
        
        const closest = { 
            x: line.p1.x + t * (line.p2.x - line.p1.x), 
            y: line.p1.y + t * (line.p2.y - line.p1.y) 
        };
        
        const screenPt = worldToScreen(closest.x, closest.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
        
        if (dist < effectiveSnapRadius) {
            const priority = isPipeDrawingActive ? 100 : 1.0;
            addCandidate(closest, 'PLUMBING_WALL_SURFACE', dist * priority, wall, allowLocking);
        }
    });

    // ✅ Bağlantı Noktaları
    plumbingBlocks.forEach(block => {
        if (block.blockType === 'SERVIS_KUTUSU') return;

        const connections = getConnectionPoints(block);
        connections.forEach(cp => {
            const screenPt = worldToScreen(cp.x, cp.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < effectiveSnapRadius) {
                addCandidate({ x: cp.x, y: cp.y }, 'PLUMBING_CONNECTION', dist * 0.05, block, allowLocking);
            }
        });
    });

    // ✅ Boru Uç Noktaları (ARTIK BUNLAR DA KİLİTLENMİYOR - çizim/taşıma sırasında)
    plumbingPipes.forEach(pipe => {
        [pipe.p1, pipe.p2].forEach(point => {
            const screenPt = worldToScreen(point.x, point.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < effectiveSnapRadius) {
                addCandidate({ x: point.x, y: point.y }, 'PLUMBING_PIPE_END', dist * 0.6, pipe, allowLocking);
            }
        });
    });

    // ✅ Blok Kenarları ve Merkez (Boru çizimi için)
    if (isPipeDrawing) {
        allPlumbingBlockEdges.forEach(edge => {
            const l2 = (edge.p1.x - edge.p2.x) ** 2 + (edge.p1.y - edge.p2.y) ** 2;
            if (l2 < 1e-6) return;

            let t = ((wm.x - edge.p1.x) * (edge.p2.x - edge.p1.x) + (wm.y - edge.p1.y) * (edge.p2.y - edge.p1.y)) / l2;
            t = Math.max(0, Math.min(1, t));

            const closest = { x: edge.p1.x + t * (edge.p2.x - edge.p1.x), y: edge.p1.y + t * (edge.p2.y - edge.p1.y) };

            const screenPt = worldToScreen(closest.x, closest.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);

            if (dist < effectiveSnapRadius) {
                addCandidate(closest, 'PLUMBING_BLOCK_EDGE', dist * 0.7, edge.block, allowLocking);
            }
        });

        // ✅ Kutu Merkezi (tüm kenarlardan + merkez snap için)
        plumbingBlocks.forEach(block => {
            if (block.blockType !== 'SERVIS_KUTUSU') return;
            if (isDraggingBlock && block === draggedBlock) return;

            const screenPt = worldToScreen(block.center.x, block.center.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);

            if (dist < effectiveSnapRadius) {
                addCandidate(
                    { x: block.center.x, y: block.center.y },
                    'PLUMBING_BLOCK_CENTER',
                    dist * 0.65,
                    block,
                    allowLocking
                );
            }
        });
    }

    if (candidates.length === 0) return null;

    // ✅ ÖNCELİK SIRASI: Boru çizerken snap çizgisi kesişimleri ÖNCELİKLİ
    const priority = isPipeDrawing ? {
        // Boru çizimi sırasında: Kesişimler en öncelikli
        'PLUMBING_INTERSECTION': 0,  // Snap çizgisi kesişimleri
        'PLUMBING_WALL_BLOCK_INTERSECTION': 1,  // Duvar-kutu kesişimleri
        'PLUMBING_CONNECTION': 2,
        'PLUMBING_PIPE_END': 3,
        'PLUMBING_BLOCK_CENTER': 4,  // Kutu merkezi
        'PLUMBING_BLOCK_EDGE': 5,  // Kutu kenarları
        'PLUMBING_WALL_SURFACE': 6
    } : {
        // Blok yerleştirme sırasında: Bağlantı noktaları öncelikli
        'PLUMBING_CONNECTION': 0,
        'PLUMBING_PIPE_END': 1,
        'PLUMBING_WALL_BLOCK_INTERSECTION': 2,
        'PLUMBING_BLOCK_EDGE': 3,
        'PLUMBING_BLOCK_CENTER': 4,
        'PLUMBING_INTERSECTION': 5,
        'PLUMBING_WALL_SURFACE': 6
    };

    candidates.sort((a, b) => {
        const pA = priority[a.type] ?? 99;
        const pB = priority[b.type] ?? 99;
        if (pA !== pB) return pA - pB;
        return a.distance - b.distance; 
    });
    
    const bestCandidate = candidates[0];

    // ✅ KRİTİK: lockable bilgisini bestCandidate'e ekle
    bestCandidate.isLockable = bestCandidate.lockable !== false;

    if ((bestCandidate.type === 'PLUMBING_WALL_SURFACE' || 
         bestCandidate.type === 'PLUMBING_WALL_BLOCK_INTERSECTION' ||
         bestCandidate.type === 'PLUMBING_INTERSECTION') && 
        bestCandidate.wall) {
        
        const wall = bestCandidate.wall;
        const wallAngle = Math.atan2(
            wall.p2.y - wall.p1.y,
            wall.p2.x - wall.p1.x
        ) * 180 / Math.PI;
        
        bestCandidate.snapAngle = Math.round((wallAngle + 90) / 15) * 15;
    }

    return bestCandidate;
}

export function isPlumbingMode() {
    return state.currentMode === 'drawPlumbingPipe' || 
           state.currentMode === 'drawPlumbingBlock' ||
           state.currentMode === 'drawValve' ||
           (state.isDragging && state.selectedObject && 
            (state.selectedObject.type === 'plumbingPipe' || 
             state.selectedObject.type === 'plumbingBlock' ||
             state.selectedObject.type === 'valve'));
}