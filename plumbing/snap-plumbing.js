// snap-plumbing.js
// TESİSAT ELEMANLARI İÇİN ÖZEL SNAP FONKSİYONLARI
// Duvar merkez çizgisine DEĞİL, duvar yüzeyinden 3 cm içerdeki paralel çizgilere snap yapar
// GÜNCELLENDİ: Blok kenarlarına snap eklendi (PLUMBING_BLOCK_EDGE)
// GÜNCELLENDİ: Blok kenarı-Duvar snap çizgisi kesişimine snap eklendi (PLUMBING_WALL_BLOCK_INTERSECTION)
// GÜNCELLENDİ: Servis kutusu taşıma sırasında snap desteği (snapAngle eklendi)

import { state } from '../general-files/main.js';
import { worldToScreen, getLineIntersectionPoint, distToSegmentSquared } from '../draw/geometry.js';
import { getConnectionPoints, getPlumbingBlockCorners, PLUMBING_BLOCK_TYPES } from '../plumbing/plumbing-blocks.js';

/**
 * TESİSAT ELEMANLARI İÇİN ÖZEL SNAP FONKSİYONU
 * @param {object} wm - Mouse pozisyonu (dünya koordinatları)
 * @param {object} screenMouse - Mouse pozisyonu (ekran koordinatları)
 * @param {number} SNAP_RADIUS_PIXELS - Snap toleransı (piksel)
 * @returns {object|null} - En iyi snap adayı veya null
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

    // Aday ekleme yardımcısı (wall: 'wall', 'block', 'pipe' olabilir)
    const addCandidate = (point, type, distance, wall = null) => {
        if (point && isFinite(point.x) && isFinite(point.y)) {
            candidates.push({ point, type, distance, wall });
        }
    };

    const isBlockMode = state.currentMode === 'drawPlumbingBlock';
    const isDraggingBlock = state.isDragging && state.selectedObject?.type === 'plumbingBlock';
    const blockConfig = isBlockMode ? PLUMBING_BLOCK_TYPES[state.currentPlumbingBlockType] : null;
    const draggedBlock = isDraggingBlock ? state.selectedObject?.object : null;

    // --- DUVAR YÜZEY SNAP HATLARI (Kırmızı çizgiler) ---
    const PLUMBING_OFFSET = 5; 
    const EXTENSION_LENGTH = 50; 
    
    // GÜNCELLENDİ: Taşıma sırasında snap toleransını hafifçe artır (1.5x)
    // Hysteresis mekanizması ile birlikte çalışacak şekilde optimize edildi
    const effectiveSnapRadius = isDraggingBlock ? SNAP_RADIUS_PIXELS * 1.5 : SNAP_RADIUS_PIXELS;
    const INTERSECTION_SNAP_RADIUS = effectiveSnapRadius * 1.5; 
    
    const allSnapLines = []; // {line, wall}
    
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
            // Blok modunda veya blok taşırken: Duvar Yüzeyi + Blok Yarı-Yüksekliği (2D'de)
            const activeConfig = blockConfig || (draggedBlock ? PLUMBING_BLOCK_TYPES[draggedBlock.blockType] : null);
            offset = halfThickness + (activeConfig ? (activeConfig.height / 2) : PLUMBING_OFFSET);
        } else {
            // Boru modunda: Duvar Yüzeyi + 5cm
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

    // --- BLOK KENARLARI (Sadece Servis Kutuları için) ---
    const allPlumbingBlockEdges = []; // {block, p1, p2}
    plumbingBlocks.forEach(block => {
        if (block.blockType !== 'SERVIS_KUTUSU') return; 
        // Kendi bloğunu ekle (taşırken diğer kutulara snap için)
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

    // --- KESİŞİM NOKTALARI 1 (Duvar Snap Çizgisi <-> Blok Kenarı) ---
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
                    // Yeni snap tipi: PLUMBING_WALL_BLOCK_INTERSECTION
                    addCandidate(intersection, 'PLUMBING_WALL_BLOCK_INTERSECTION', dist * 0.5, snapLineItem.wall); // Duvar bilgisini ekledik
                }
            }
        });
    });

    // --- KESİŞİM NOKTALARI 2 (Duvar Snap Çizgisi <-> Duvar Snap Çizgisi) ---
    for (let i = 0; i < allSnapLines.length; i++) {
        for (let j = i + 1; j < allSnapLines.length; j++) {
            const line1 = allSnapLines[i].line;
            const line2 = allSnapLines[j].line;
            
            const intersection = getLineIntersectionPoint(line1.p1, line1.p2, line2.p1, line2.p2);
            
            if (intersection && isFinite(intersection.x) && isFinite(intersection.y)) {
                const screenPt = worldToScreen(intersection.x, intersection.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
                
                if (dist < INTERSECTION_SNAP_RADIUS) {
                    addCandidate(intersection, 'PLUMBING_INTERSECTION', dist * 0.1, allSnapLines[i].wall);
                }
            }
        }
    }
    
    // --- YÜZEY SNAP HATLARI (Duvar) ---
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
            addCandidate(closest, 'PLUMBING_WALL_SURFACE', dist, wall);
        }
    });

    // --- BAĞLANTI NOKTALARI (Sayaç, Vana, Kombi, Ocak) ---
    plumbingBlocks.forEach(block => {
        if (block.blockType === 'SERVIS_KUTUSU') return; // Servis kutusunun sabit noktası yok

        const connections = getConnectionPoints(block);
        connections.forEach(cp => {
            const screenPt = worldToScreen(cp.x, cp.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < SNAP_RADIUS_PIXELS) {
                addCandidate({ x: cp.x, y: cp.y }, 'PLUMBING_CONNECTION', dist * 0.05, block);
            }
        });
    });

    // --- BORU UÇ NOKTALARI ---
    plumbingPipes.forEach(pipe => {
        [pipe.p1, pipe.p2].forEach(point => {
            const screenPt = worldToScreen(point.x, point.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < SNAP_RADIUS_PIXELS) {
                addCandidate({ x: point.x, y: point.y }, 'PLUMBING_PIPE_END', dist * 0.6, pipe);
            }
        });
    });

    // --- BLOK KENARLARI (Servis Kutusu) ---
    allPlumbingBlockEdges.forEach(edge => {
        const l2 = (edge.p1.x - edge.p2.x) ** 2 + (edge.p1.y - edge.p2.y) ** 2;
        if (l2 < 1e-6) return;
        
        let t = ((wm.x - edge.p1.x) * (edge.p2.x - edge.p1.x) + (wm.y - edge.p1.y) * (edge.p2.y - edge.p1.y)) / l2;
        t = Math.max(0, Math.min(1, t)); // Segment üzerinde kal
        
        const closest = { x: edge.p1.x + t * (edge.p2.x - edge.p1.x), y: edge.p1.y + t * (edge.p2.y - edge.p1.y) };
        
        const screenPt = worldToScreen(closest.x, closest.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);

        if (dist < effectiveSnapRadius) {
            addCandidate(closest, 'PLUMBING_BLOCK_EDGE', dist * 0.7, edge.block);
        }
    });


    // Aday yoksa null dön
    if (candidates.length === 0) return null;

    // Adayları öncelik sırasına göre sırala
    const priority = {
        'PLUMBING_CONNECTION': 0,
        'PLUMBING_PIPE_END': 1,
        'PLUMBING_WALL_BLOCK_INTERSECTION': 2, // YENİ (Kutu-Duvar Kesişimi)
        'PLUMBING_BLOCK_EDGE': 3,
        'PLUMBING_INTERSECTION': 4,
        'PLUMBING_WALL_SURFACE': 5
    };

    candidates.sort((a, b) => {
        const pA = priority[a.type] ?? 99;
        const pB = priority[b.type] ?? 99;
        if (pA !== pB) return pA - pB;
        return a.distance - b.distance; 
    });
    
    const bestCandidate = candidates[0];

    // GÜNCELLENDİ: Duvar snap'i için rotation bilgisi ekle
    if ((bestCandidate.type === 'PLUMBING_WALL_SURFACE' || 
         bestCandidate.type === 'PLUMBING_WALL_BLOCK_INTERSECTION' ||
         bestCandidate.type === 'PLUMBING_INTERSECTION') && 
        bestCandidate.wall) {
        
        const wall = bestCandidate.wall;
        const wallAngle = Math.atan2(
            wall.p2.y - wall.p1.y,
            wall.p2.x - wall.p1.x
        ) * 180 / Math.PI;
        
        // Duvara dik açı (90 derece ekle ve 15'in katına yuvarla)
        bestCandidate.snapAngle = Math.round((wallAngle + 90) / 15) * 15;
    }

    return bestCandidate; // En iyi adayı döndür
}

/**
 * Tesisat modunda mı kontrol et
 */
export function isPlumbingMode() {
    return state.currentMode === 'drawPlumbingPipe' || 
           state.currentMode === 'drawPlumbingBlock' ||
           state.currentMode === 'drawValve' ||
           (state.isDragging && state.selectedObject && 
            (state.selectedObject.type === 'plumbingPipe' || 
             state.selectedObject.type === 'plumbingBlock' ||
             state.selectedObject.type === 'valve'));
}