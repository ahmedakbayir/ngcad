// snap-plumbing.js
// TESİSAT ELEMANLARI İÇİN ÖZEL SNAP FONKSİYONLARI
// Duvar merkez çizgisine DEĞİL, duvar yüzeyinden 3 cm içerdeki paralel çizgilere snap yapar

import { state } from '../general-files/main.js';
import { worldToScreen, getLineIntersectionPoint } from '../draw/geometry.js';
import { getConnectionPoints } from './plumbing-blocks.js';

/**
 * TESİSAT ELEMANLARI İÇİN ÖZEL SNAP FONKSİYONU
 * Duvar merkez çizgisine DEĞİL, duvar yüzeyinden 3 cm içerdeki paralel çizgilere snap yapar
 * 
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

    // Aday ekleme yardımcısı
    const addCandidate = (point, type, distance) => {
        if (point && isFinite(point.x) && isFinite(point.y)) {
            candidates.push({ point, type, distance });
        }
    };

    // --- DUVAR YÜZEY SNAP HATLARI (Yüzey + 3cm offset) ---
    const PLUMBING_OFFSET = 5; // 3 cm içeri offset
    const EXTENSION_LENGTH = 50; // Her iki uçtan 50 cm uzatma (kesişimleri kapsamak için)
    const INTERSECTION_SNAP_RADIUS = SNAP_RADIUS_PIXELS * 1.5; // Kesişimler için daha büyük tolerans
    
    // Tüm snap hatlarını topla (kesişim hesabı için)
    const allSnapLines = [];
    
    walls.forEach(wall => {
        if (!wall.p1 || !wall.p2) return;
        
        const wallThickness = wall.thickness || state.wallThickness;
        const halfThickness = wallThickness / 2;
        
        // Duvar yönü ve normal vektörü
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) return;
        
        // Normalize edilmiş yön vektörleri
        const dirX = dx / len;
        const dirY = dy / len;
        const nx = -dy / len; // Normal (dik) yön
        const ny = dx / len;
        
        // İki paralel snap hattı: yüzeyden 3 cm içerde
        // Offset = duvar kalınlığı/2 + 3 cm
        const offset = halfThickness + PLUMBING_OFFSET;
        
        // Uç noktaları uzat
        const extendedP1 = {
            x: wall.p1.x - dirX * EXTENSION_LENGTH,
            y: wall.p1.y - dirY * EXTENSION_LENGTH
        };
        const extendedP2 = {
            x: wall.p2.x + dirX * EXTENSION_LENGTH,
            y: wall.p2.y + dirY * EXTENSION_LENGTH
        };
        
        // Snap hattı 1 (bir taraf) - UZATILMIŞ
        const line1 = {
            p1: { x: extendedP1.x + nx * offset, y: extendedP1.y + ny * offset },
            p2: { x: extendedP2.x + nx * offset, y: extendedP2.y + ny * offset }
        };

        // Snap hattı 2 (diğer taraf) - UZATILMIŞ
        const line2 = {
            p1: { x: extendedP1.x - nx * offset, y: extendedP1.y - ny * offset },
            p2: { x: extendedP2.x - nx * offset, y: extendedP2.y - ny * offset }
        };
        
        // Hem kesişim hesabı hem de yüzey snap için sakla
        allSnapLines.push(line1, line2);
    });

    // --- ⭐ YENİ: KESİŞİM NOKTALARI HESAPLA (EN YÜKSEK ÖNCELİK) ---
    for (let i = 0; i < allSnapLines.length; i++) {
        for (let j = i + 1; j < allSnapLines.length; j++) {
            const line1 = allSnapLines[i];
            const line2 = allSnapLines[j];
            
            // Kesişim noktasını hesapla
            const intersection = getLineIntersectionPoint(line1.p1, line1.p2, line2.p1, line2.p2);
            
            if (intersection && isFinite(intersection.x) && isFinite(intersection.y)) {
                const screenPt = worldToScreen(intersection.x, intersection.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
                
                // Kesişimler için DAHA BÜYÜK tolerans
                if (dist < INTERSECTION_SNAP_RADIUS) {
                    // Kesişimlere çok yüksek öncelik: distance * 0.1
                    addCandidate(intersection, 'PLUMBING_INTERSECTION', dist * 0.1);
                }
            }
        }
    }
    
    // --- YÜZEY SNAP HATLARI (Kesişimlerden sonra) ---
    allSnapLines.forEach(line => {
        const l2 = (line.p1.x - line.p2.x) ** 2 + (line.p1.y - line.p2.y) ** 2;
        if (l2 < 1e-6) return;
        
        // Mouse'un snap hattı üzerindeki izdüşümünü bul
        let t = ((wm.x - line.p1.x) * (line.p2.x - line.p1.x) + 
                 (wm.y - line.p1.y) * (line.p2.y - line.p1.y)) / l2;
        
        const closest = { 
            x: line.p1.x + t * (line.p2.x - line.p1.x), 
            y: line.p1.y + t * (line.p2.y - line.p1.y) 
        };
        
        const screenPt = worldToScreen(closest.x, closest.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
        
        if (dist < SNAP_RADIUS_PIXELS) {
            addCandidate(closest, 'PLUMBING_WALL_SURFACE', dist);
        }
    });

    // --- BAĞLANTI NOKTALARI (En yüksek öncelik) ---
    const plumbingBlocks = currentFloorId 
        ? (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId)
        : (state.plumbingBlocks || []);
    
    plumbingBlocks.forEach(block => {
        const connections = getConnectionPoints(block);
        connections.forEach(cp => {
            const screenPt = worldToScreen(cp.x, cp.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < SNAP_RADIUS_PIXELS) {
                // Bağlantı noktalarına daha yüksek öncelik (distance * 0.05 - kesişimden önce)
                addCandidate({ x: cp.x, y: cp.y }, 'PLUMBING_CONNECTION', dist * 0.05);
            }
        });
    });

    // --- BORU UÇ NOKTALARI (Orta öncelik) ---
    const plumbingPipes = currentFloorId
        ? (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId)
        : (state.plumbingPipes || []);
    
    plumbingPipes.forEach(pipe => {
        [pipe.p1, pipe.p2].forEach(point => {
            const screenPt = worldToScreen(point.x, point.y);
            const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
            if (dist < SNAP_RADIUS_PIXELS) {
                // Boru uçlarına orta öncelik (distance * 0.6)
                addCandidate({ x: point.x, y: point.y }, 'PLUMBING_PIPE_END', dist * 0.6);
            }
        });
    });

    // Aday yoksa null dön
    if (candidates.length === 0) return null;

    // Adayları öncelik sırasına göre sırala
    const priority = {
        'PLUMBING_CONNECTION': 0,      // En yüksek: Blok bağlantı noktaları
        'PLUMBING_INTERSECTION': 1,    // İkinci: Snap hatlarının kesişimi
        'PLUMBING_PIPE_END': 2,        // Üçüncü: Boru uç noktaları
        'PLUMBING_WALL_SURFACE': 3     // En düşük: Duvar yüzey snap hatları
    };

    candidates.sort((a, b) => {
        const pA = priority[a.type] ?? 99;
        const pB = priority[b.type] ?? 99;
        if (pA !== pB) return pA - pB;
        return a.distance - b.distance; // Aynı öncelikteyse mesafeye göre
    });
    
    return candidates[0]; // En iyi adayı döndür
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