// snap-plumbing.js
// ✅ KÖK ÇÖZÜM: Boru çizimi/taşıma sırasında duvar snap'i KİLİTLENMEZ (smooth çizim)
// ✅ DÜZELTME: Duvar yüzey snap'i her zaman kilitsiz (isLockable: false)
// ✅ YENİ: Boru çizerken çizim eksenine DİK snap hatlarına ÖNCELİK

import { state } from '../general-files/main.js';
import { worldToScreen, getLineIntersectionPoint, distToSegmentSquared } from '../draw/geometry.js';
import { getConnectionPoints, getPlumbingBlockCorners, PLUMBING_BLOCK_TYPES } from '../plumbing/plumbing-blocks.js';

/**
 * İki vektör arasındaki açıyı hesaplar (derece cinsinden)
 */
function getAngleBetweenVectors(v1x, v1y, v2x, v2y) {
    const dot = v1x * v2x + v1y * v2y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    
    if (len1 < 0.001 || len2 < 0.001) return 0;
    
    const cosAngle = dot / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180 / Math.PI;
    return angle;
}

/**
 * TESİSAT ELEMANLARI İÇİN ÖZEL SNAP FONKSİYONU
 * ✅ KRİTİK: Boru çizimi/taşıma sırasında duvar yüzey snap'i KİLİTLENMEZ
 * ✅ YENİ: Boru çizerken dik snap hatlarına öncelik
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

    const addCandidate = (point, type, distance, wall = null, lockable = true, isPerpendicular = false) => {
        if (point && isFinite(point.x) && isFinite(point.y)) {
            candidates.push({ point, type, distance, wall, lockable, isPerpendicular });
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

    // ✅ KİLİTLEME MANTIĞI: Sadece ilk tıklamada kilitle, hareket sırasında ASLA kilitleme
    const isDragging = state.isDragging;
    const isDrawingInProgress = isPipeDrawing && state.startPoint;
    
    // Smooth kayma için: Çizim/taşıma sırasında HİÇBİR SNAP KİLİTLENMEZ
    // Sadece kesişim/bağlantı noktaları ilk tıklamada kilitlenebilir
    const allowLocking = !isDrawingInProgress && !isDragging;

    // ✅ YENİ: Boru çizim ekseni vektörü (dikey snap kontrolü için)
    let currentPipeVector = null;
    if (isPipeDrawingActive && state.startPoint) {
        const dx = wm.x - state.startPoint.x;
        const dy = wm.y - state.startPoint.y;
        const len = Math.hypot(dx, dy);
        if (len > 1) { // Çok kısa vektörleri yoksay
            currentPipeVector = { x: dx / len, y: dy / len };
        }
    }

    // ✅ Kesişimler (boru çizimi için ÖNCELİKLE aktif, blok modu için de)
    // ✅ SERVİS KUTUSU: Kesişimlere snap YAPMA (sadece düz duvar yüzeyine snap yap)
    const isServiceBox = (isBlockMode && state.currentPlumbingBlockType === 'SERVIS_KUTUSU') ||
                         (isDraggingBlock && draggedBlock && draggedBlock.blockType === 'SERVIS_KUTUSU');

    if (!isServiceBox) {
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
                        const priorityMultiplier = isPipeDrawing ? 0.05 : 0.5;
                        addCandidate(intersection, 'PLUMBING_WALL_BLOCK_INTERSECTION', dist * priorityMultiplier, snapLineItem.wall, allowLocking, false);
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
                        const priorityMultiplier = isPipeDrawing ? 0.01 : 0.1;
                        addCandidate(intersection, 'PLUMBING_INTERSECTION', dist * priorityMultiplier, allSnapLines[i].wall, allowLocking, false);
                    }
                }
            }
        }
    }
    
    // ✅ KRİTİK: Duvar yüzey snap - HER ZAMAN KİLİTSİZ (smooth kayma için)
    // ✅ YENİ: Boru çizerken DİK snap hatlarına öncelik
    allSnapLines.forEach(item => {
        const line = item.line;
        const wall = item.wall;

        const l2 = (line.p1.x - line.p2.x) ** 2 + (line.p1.y - line.p2.y) ** 2;
        if (l2 < 1e-6) return;
        
        let t = ((wm.x - line.p1.x) * (line.p2.x - line.p1.x) + 
                 (wm.y - line.p1.y) * (line.p2.y - line.p1.y)) / l2;
        
        // ✅ KRİTİK: t değerini SINIRLANDIRMA - çizgi uzantısı yok
        t = Math.max(0, Math.min(1, t));
        
        const closest = { 
            x: line.p1.x + t * (line.p2.x - line.p1.x), 
            y: line.p1.y + t * (line.p2.y - line.p1.y) 
        };
        
        const screenPt = worldToScreen(closest.x, closest.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
        
        if (dist < effectiveSnapRadius) {
            let priority = isPipeDrawingActive ? 100 : 1.0;
            let isPerpendicular = false;

            // ✅ YENİ: Boru çizerken DİKLİK KONTROLÜ
            if (currentPipeVector) {
                // Snap hattının yön vektörü
                const snapLineVectorX = line.p2.x - line.p1.x;
                const snapLineVectorY = line.p2.y - line.p1.y;
                const snapLineLen = Math.hypot(snapLineVectorX, snapLineVectorY);
                
                if (snapLineLen > 0.001) {
                    const snapLineNormX = snapLineVectorX / snapLineLen;
                    const snapLineNormY = snapLineVectorY / snapLineLen;
                    
                    // Açıyı hesapla
                    const angle = getAngleBetweenVectors(
                        currentPipeVector.x, currentPipeVector.y,
                        snapLineNormX, snapLineNormY
                    );
                    
                    // 85-95 derece arası = DİK snap
                    const PERPENDICULAR_TOLERANCE = 5; // ±5 derece tolerans
                    if (Math.abs(angle - 90) < PERPENDICULAR_TOLERANCE) {
                        isPerpendicular = true;
                        priority = 0.001; // ✅ EN YÜKSEK ÖNCELİK (kesişimlerden bile önce)
                    }
                }
            }

            // ✅ SMOOTH KAYMA: Her zaman kilitsiz snap (isLockable: false)
            addCandidate(closest, 'PLUMBING_WALL_SURFACE', dist * priority, wall, false, isPerpendicular);
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
                addCandidate({ x: cp.x, y: cp.y }, 'PLUMBING_CONNECTION', dist * 0.05, block, allowLocking, false);
            }
        });
    });

    // ✅ Boru Uç Noktaları (çizim/taşıma sırasında kilitsiz)
    plumbingPipes.forEach(pipe => {
        [pipe.p1, pipe.p2].forEach(point => {
            const screenPt = worldToScreen(point.x, point.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < effectiveSnapRadius) {
                addCandidate({ x: point.x, y: point.y }, 'PLUMBING_PIPE_END', dist * 0.6, pipe, false, false);
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
                addCandidate(closest, 'PLUMBING_BLOCK_EDGE', dist * 0.7, edge.block, false, false);
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
                    false,
                    false
                );
            }
        });
    }

    if (candidates.length === 0) return null;

    // ✅ SERVİS KUTUSU: SADECE DUVAR YÜZEYİNE SNAP YAP
    const isServiceBox = (isBlockMode && state.currentPlumbingBlockType === 'SERVIS_KUTUSU') ||
                         (isDraggingBlock && draggedBlock && draggedBlock.blockType === 'SERVIS_KUTUSU');

    if (isServiceBox) {
        // Sadece duvar yüzeyi snap türlerini tut (köşeler, kesişimler, blok kenarları hariç)
        candidates = candidates.filter(c =>
            c.type === 'PLUMBING_WALL_SURFACE' ||
            c.type === 'PLUMBING_WALL_SURFACE_PERPENDICULAR'
        );

        if (candidates.length === 0) return null;
    }

    // ✅ ÖNCELİK SIRASI: DİK snap'ler EN ÖNCELİKLİ
    const priority = isPipeDrawing ? {
        // Boru çizimi sırasında: DİK snap en öncelikli
        'PLUMBING_WALL_SURFACE_PERPENDICULAR': -1, // ✅ YENİ: Dik snap en öncelikli
        'PLUMBING_INTERSECTION': 0,
        'PLUMBING_WALL_BLOCK_INTERSECTION': 1,
        'PLUMBING_CONNECTION': 2,
        'PLUMBING_PIPE_END': 3,
        'PLUMBING_BLOCK_CENTER': 4,
        'PLUMBING_BLOCK_EDGE': 5,
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
        // ✅ YENİ: Dik snap'lere öncelik
        if (a.isPerpendicular && !b.isPerpendicular) return -1;
        if (!a.isPerpendicular && b.isPerpendicular) return 1;
        
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

        // ✅ SERVİS KUTUSU: Uzun kenarı duvara paralel dön (wallAngle)
        // ✅ DİĞER BLOKLAR: Duvara dik dön (wallAngle + 90)
        if (isServiceBox) {
            bestCandidate.snapAngle = Math.round(wallAngle / 15) * 15;
        } else {
            bestCandidate.snapAngle = Math.round((wallAngle + 90) / 15) * 15;
        }
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