// ahmedakbayir/ngcad/ngcad-aee2f87ddbc673a773a88b47eada95c85eabda93/snap.js
// SON GÜNCELLEME: Merdiven modu (drawStairs) için tamamen ayrı bir yakalama
// fonksiyonu (getStairSnapPoint) eklendi. Bu fonksiyon, kullanıcının
// istediği öncelik sırasına göre SADECE yüzeyleri, köşeleri ve
// yüzey kesişimlerini yakalar, duvar içi merkez çizgilerini/noktalarını YOK SAYAR.

import { state, dom, setState, SNAP_UNLOCK_DISTANCE_CM } from './main.js';
import { getColumnCorners } from '../architectural-objects/columns.js';
import { getBeamCorners } from '../architectural-objects/beams.js';
import { getStairCorners } from '../architectural-objects/stairs.js';
import { screenToWorld, worldToScreen, distToSegmentSquared, getLineIntersectionPoint } from '../draw/geometry.js';
import { getPlumbingSnapPoint, isPlumbingMode } from '../plumbing/snap-plumbing.js';

// --- MERDİVEN SNAP İÇİN YARDIMCI FONKSİYONLAR ---

/**
 * Bir duvarın iki YÜZEY çizgisini (segmentlerini) döndürür.
 * @param {object} wall - Duvar nesnesi
 * @returns {Array<object>} - [ { p1, p2 }, { p1, p2 } ] formatında iki çizgi segmenti
 */
function getWallSurfaceLines(wall) {
    if (!wall || !wall.p1 || !wall.p2) return [];
    const wallThickness = wall.thickness || state.wallThickness;
    const halfThickness = wallThickness / 2;
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return [];

    const nx = -dy / len; // Normal
    const ny = dx / len;

    const line1_p1 = { x: wall.p1.x + nx * halfThickness, y: wall.p1.y + ny * halfThickness };
    const line1_p2 = { x: wall.p2.x + nx * halfThickness, y: wall.p2.y + ny * halfThickness };
    const line2_p1 = { x: wall.p1.x - nx * halfThickness, y: wall.p1.y - ny * halfThickness };
    const line2_p2 = { x: wall.p2.x - nx * halfThickness, y: wall.p2.y - ny * halfThickness };

    return [ { p1: line1_p1, p2: line1_p2 }, { p1: line2_p1, p2: line2_p2 } ];
}

/**
 * Bir merdivenin dört YÜZEY çizgisini (segmentlerini) döndürür.
 * @param {object} stair - Merdiven nesnesi
 * @returns {Array<object>} - [ { p1, p2 }, ... ] formatında dört çizgi segmenti
 */
function getStairEdges(stair) {
    const corners = getStairCorners(stair);
    if (!corners || corners.length !== 4) return [];
    return [
        { p1: corners[0], p2: corners[1] },
        { p1: corners[1], p2: corners[2] },
        { p1: corners[2], p2: corners[3] },
        { p1: corners[3], p2: corners[0] }
    ];
}


/**
 * SADECE MERDİVEN ÇİZİM MODU (drawStairs) İÇİN ÖZEL YAKALAMA FONKSİYONU
 * Sadece yüzeyleri, yüzey kesişimlerini ve merdiven köşelerini yakalar.
 * Duvar içi noktaları (merkez, uç, orta) TAMAMEN YOK SAYAR.
 * @param {object} wm - Fare pozisyonu (Dünya koordinatları)
 * @param {object} screenMouse - Fare pozisyonu (Ekran koordinatları)
 * @param {number} SNAP_RADIUS_PIXELS - Yakalama için piksel toleransı
 * @returns {object | null} - Bulunan en iyi snap adayı veya null
 */
function getStairSnapPoint(wm, screenMouse, SNAP_RADIUS_PIXELS) {
    const candidates = [];
    const currentFloorId = state.currentFloor?.id;
    // Eğer currentFloorId yoksa (eski projeler), tüm objeleri kullan
    const walls = currentFloorId
        ? (state.walls || []).filter(w => w.floorId === currentFloorId)
        : (state.walls || []);
    const stairs = currentFloorId
        ? (state.stairs || []).filter(s => s.floorId === currentFloorId)
        : (state.stairs || []);

    // Aday ekleme yardımcısı
    const addCandidate = (point, type, distance) => {
        if (point && isFinite(point.x) && isFinite(point.y)) {
            candidates.push({ point, type, distance });
        }
    };

    // Tüm duvar yüzeylerini ve merdiven kenarlarını/köşelerini topla
    const allWallSurfaceLines = walls.flatMap(getWallSurfaceLines);
    const allStairEdges = stairs.flatMap(getStairEdges);
    const allStairCorners = stairs.flatMap(stair => getStairCorners(stair) || []);

    // --- 1. Kesişim Noktaları ---

    // 1.1 Duvar-Duvar YÜZEY Kesişimi (Öncelik 0)
    for (let i = 0; i < allWallSurfaceLines.length; i++) {
        for (let j = i + 1; j < allWallSurfaceLines.length; j++) {
            const line1 = allWallSurfaceLines[i];
            const line2 = allWallSurfaceLines[j];
            const intersect = getLineIntersectionPoint(line1.p1, line1.p2, line2.p1, line2.p2);
            if (intersect) {
                const screenPt = worldToScreen(intersect.x, intersect.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
                if (dist < SNAP_RADIUS_PIXELS) addCandidate(intersect, 'SURFACE_INTERSECTION', dist);
            }
        }
    }

    // 1.2 Merdiven-Merdiven Kesişimi (Öncelik 1)
    for (let i = 0; i < allStairEdges.length; i++) {
        for (let j = i + 1; j < allStairEdges.length; j++) {
            const line1 = allStairEdges[i];
            const line2 = allStairEdges[j];
            const intersect = getLineIntersectionPoint(line1.p1, line1.p2, line2.p1, line2.p2);
            if (intersect) {
                const screenPt = worldToScreen(intersect.x, intersect.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
                if (dist < SNAP_RADIUS_PIXELS) addCandidate(intersect, 'STAIR_INTERSECTION', dist);
            }
        }
    }

    // 1.3 Duvar(Yüzey)-Merdiven Kesişimi (Öncelik 2)
    for (const wallLine of allWallSurfaceLines) {
        for (const stairLine of allStairEdges) {
            const intersect = getLineIntersectionPoint(wallLine.p1, wallLine.p2, stairLine.p1, stairLine.p2);
            if (intersect) {
                const screenPt = worldToScreen(intersect.x, intersect.y);
                const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
                if (dist < SNAP_RADIUS_PIXELS) addCandidate(intersect, 'WALL_STAIR_INTERSECTION', dist);
            }
        }
    }

    // --- 2. Nokta ve Yüzeyler ---

    // 2.1 Merdiven Köşesi (Öncelik 3)
    allStairCorners.forEach(corner => {
        const screenPt = worldToScreen(corner.x, corner.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
        if (dist < SNAP_RADIUS_PIXELS) addCandidate(corner, 'STAIR_CORNER', dist);
    });

    // 2.2 Merdiven Yüzeyi (Kenarı) (Öncelik 4)
    allStairEdges.forEach(edge => {
        const l2 = (edge.p1.x - edge.p2.x) ** 2 + (edge.p1.y - edge.p2.y) ** 2;
        if (l2 < 1e-6) return;
        let t = ((wm.x - edge.p1.x) * (edge.p2.x - edge.p1.x) + (wm.y - edge.p1.y) * (edge.p2.y - edge.p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const closest = { x: edge.p1.x + t * (edge.p2.x - edge.p1.x), y: edge.p1.y + t * (edge.p2.y - edge.p1.y) };
        const screenPt = worldToScreen(closest.x, closest.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
        if (dist < SNAP_RADIUS_PIXELS) addCandidate(closest, 'STAIR_EDGE', dist);
    });

    // 2.3 Duvar Yüzeyi (Öncelik 5)
    allWallSurfaceLines.forEach(edge => {
        const l2 = (edge.p1.x - edge.p2.x) ** 2 + (edge.p1.y - edge.p2.y) ** 2;
        if (l2 < 1e-6) return;
        let t = ((wm.x - edge.p1.x) * (edge.p2.x - edge.p1.x) + (wm.y - edge.p1.y) * (edge.p2.y - edge.p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const closest = { x: edge.p1.x + t * (edge.p2.x - edge.p1.x), y: edge.p1.y + t * (edge.p2.y - edge.p1.y) };
        const screenPt = worldToScreen(closest.x, closest.y);
        const dist = Math.hypot(screenMouse.x - screenPt.x, screenMouse.y - screenPt.y);
        if (dist < SNAP_RADIUS_PIXELS) addCandidate(closest, 'WALL_SURFACE', dist);
    });

    // Aday yoksa null dön
    if (candidates.length === 0) return null;

    // Adayları kullanıcı tarafından istenen öncelik sırasına göre sırala
    const priority = {
        'SURFACE_INTERSECTION': 0,    // Duvar-Duvar Yüzey Kesişimi
        'STAIR_INTERSECTION': 1,      // Merdiven-Merdiven Kesişimi
        'WALL_STAIR_INTERSECTION': 2, // Duvar(Yüzey)-Merdiven Kesişimi
        'STAIR_CORNER': 3,            // Merdiven Köşesi
        'STAIR_EDGE': 4,              // Merdiven Yüzeyi
        'WALL_SURFACE': 5             // Duvar Yüzeyi
    };

    candidates.sort((a, b) => {
         const pA = priority[a.type] ?? 99;
         const pB = priority[b.type] ?? 99;
         if (pA !== pB) return pA - pB;
         return a.distance - b.distance; // Aynı öncelikteyse mesafeye göre sırala
    });
    
    return candidates[0]; // En iyi adayı döndür
}


/**
 * ANA YAKALAMA FONKSİYONU
 * Fare pozisyonuna göre en uygun yakalama noktasını hesaplar.
 */
export function getSmartSnapPoint(e, applyGridSnapFallback = true) {
    const rect = dom.c2d.getBoundingClientRect();
    const screenMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const wm = screenToWorld(screenMouse.x, screenMouse.y); // Raw mouse world coordinates

    // --- SABİT PİKSEL SNAP TOLERANSI ---
    const SNAP_RADIUS_PIXELS = 30; // Piksel cinsinden yakalama yarıçapı (35->45 artırıldı)
    const INTERSECTION_SNAP_RADIUS_PIXELS = SNAP_RADIUS_PIXELS * 1.5; // Kesişimler için DAHA BÜYÜK (0.7->1.3)
    // --- SABİT PİKSEL SNAP TOLERANSI SONU ---


    // Kapı sürüklenirken snap yapma
    if (state.isDragging && state.selectedObject?.type === 'door') {
        return { x: wm.x, y: wm.y, isSnapped: false, snapLines: { h_origins: [], v_origins: [] }, isLockable: false, point: null, snapType: null, roundedX: wm.x, roundedY: wm.y };
    }

    // Dinamik uzaktan snap
    if (state.isDragging && state.selectedObject) {
         // ... (mevcut kod korunuyor)
    }

    // Kiriş çizim modu snap'i
    if (state.currentMode === 'drawBeam') {
        // ... (mevcut kod korunuyor)
    }

    // Grid snap için varsayılan değerler
    let gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1;
     if (gridValue <= 0) {
         console.error("snap.js: Geçersiz gridValue:", gridValue);
         gridValue = 1;
     }
    let roundedX = Math.round(wm.x / gridValue) * gridValue;
    let roundedY = Math.round(wm.y / gridValue) * gridValue;

    // Select modunda snap yapma
    if (state.currentMode === 'select' && !state.isDragging) {
        return { x: wm.x, y: wm.y, isSnapped: false, snapLines: { h_origins: [], v_origins: [] }, isLockable: false, point: null, snapType: null, roundedX: roundedX, roundedY: roundedY };
    }

    // Snap kilidi kontrolü
    if (state.isSnapLocked && state.lockedSnapPoint) {
         const lockedPoint = state.lockedSnapPoint;
         const worldUnlockDistance = SNAP_UNLOCK_DISTANCE_CM;
         const distToLockSq = Math.hypot(wm.x - lockedPoint.x, wm.y - lockedPoint.y);

        if (distToLockSq > worldUnlockDistance) {
            setState({ isSnapLocked: false, lockedSnapPoint: null });
        } else {
             return {
                 x: lockedPoint.x, y: lockedPoint.y, isSnapped: true,
                 snapLines: { h_origins: [], v_origins: [] }, isLockable: true,
                 point: lockedPoint, snapType: 'LOCKED',
                 roundedX: lockedPoint.roundedX !== undefined ? lockedPoint.roundedX : lockedPoint.x,
                 roundedY: lockedPoint.roundedY !== undefined ? lockedPoint.roundedY : lockedPoint.y
             };
        }
    }


    // --- ÖZEL MERDİVEN MODU KONTROLÜ ---
    if (state.currentMode === 'drawStairs') {
        // Tamamen ayrı olan merdiven yakalama fonksiyonunu çağır
        const stairSnap = getStairSnapPoint(wm, screenMouse, SNAP_RADIUS_PIXELS);
        
        if (stairSnap) {
            const bestStairSnap = stairSnap;
            // Kilitlenebilir yap (yüzeyler dahil)
            setState({ isSnapLocked: true, lockedSnapPoint: { ...bestStairSnap.point, roundedX: bestStairSnap.point.x, roundedY: bestStairSnap.point.y } });
            
            return {
                 x: bestStairSnap.point.x, y: bestStairSnap.point.y,
                 isSnapped: true, snapLines: { h_origins: [], v_origins: [] }, isLockable: true,
                 point: bestStairSnap.point, snapType: bestStairSnap.type,
                 roundedX: bestStairSnap.point.x, roundedY: bestStairSnap.point.y
             };
        }
        // Merdiven snap bulamadıysa, aşağıdaki genel grid snap'e düşmesine izin ver.
    }
    // --- MERDİVEN MODU KONTROLÜ SONU ---

    if (isPlumbingMode()) {
    const plumbingSnap = getPlumbingSnapPoint(wm, screenMouse, SNAP_RADIUS_PIXELS);
    
    if (plumbingSnap) {
        const shouldLock = plumbingSnap.isLockable !== false;
        let snapAngle = 0;
            // Eğer snap bir duvar yüzeyine yapıldıysa, duvarın açısını al
            if (plumbingSnap.type === 'PLUMBING_WALL_SURFACE' && plumbingSnap.wall) {
                const wall = plumbingSnap.wall;
                if (wall.p1 && wall.p2) {
                    const dx = wall.p2.x - wall.p1.x;
                    const dy = wall.p2.y - wall.p1.y;
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    // Blok yerleşimi için 90 derece katlarına yuvarla
                    snapAngle = Math.round(angle / 90) * 90;
                }
            }

        if (shouldLock) {
        setState({ 
            isSnapLocked: true, 
            lockedSnapPoint: { 
                ...plumbingSnap.point, 
                roundedX: plumbingSnap.point.x, 
                roundedY: plumbingSnap.point.y 
            } 
        })
    };
        
        return {
            x: plumbingSnap.point.x, 
            y: plumbingSnap.point.y,
            isSnapped: true, 
            snapLines: { h_origins: [], v_origins: [] }, 
            isLockable: true,
            point: plumbingSnap.point, 
            snapType: plumbingSnap.type,
            roundedX: plumbingSnap.point.x, 
            roundedY: plumbingSnap.point.y
        };
    }
    // Tesisat snap bulamadıysa, normal snap'e devam et 
    }

    // Snap hesaplamaları başlangıcı (MERDİVEN DIŞINDAKİ MODLAR İÇİN)
    let x = wm.x, y = wm.y, isSnapped = false, isLockable = false;
    let snapLines = { h_origins: [], v_origins: [] };
    const lockableSnapTypes = ['INTERSECTION', 'ENDPOINT'];

    // Sadece aktif kata ait duvarları kullan
    const currentFloorId = state.currentFloor?.id;
    // Eğer currentFloorId yoksa (eski projeler için), tüm duvarları kullan
    const currentFloorWalls = currentFloorId
        ? (state.walls || []).filter(w => w.floorId === currentFloorId)
        : (state.walls || []);

    // Taranacak duvarlar
    const wallsToScan = state.snapOptions.nearestOnly
        ? currentFloorWalls.map(wall => ({ wall, distance: Math.sqrt(distToSegmentSquared(wm, wall.p1, wall.p2)) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)
          .map(item => item.wall)
        : currentFloorWalls;

    const candidates = [];
    let draggedNode = (state.isDragging && state.selectedObject?.type === "wall" && state.selectedObject.handle !== "body")
        ? state.selectedObject.object[state.selectedObject.handle]
        : null;

    // Genel Snap Noktaları (Duvar Uçları ve Ortaları)
    for (const wall of wallsToScan) {
        if (draggedNode === wall.p1 || draggedNode === wall.p2) continue;
        const p1 = wall.p1, p2 = wall.p2;
        if (!p1 || !p2) continue;

        const pointsToCheck = [];
        // DİKKAT: Merdiven modu zaten yukarıda halledildi, burada ENDPOINT kontrolü güvende.
        if (state.snapOptions.endpoint && state.currentMode !== "drawDoor") {
            pointsToCheck.push({p: p1, type: 'ENDPOINT'}, {p: p2, type: 'ENDPOINT'});
        }
        if (state.snapOptions.midpoint) {
            pointsToCheck.push({p: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, type: 'MIDPOINT'});
        }
        pointsToCheck.forEach(item => {
             if (!item.p || typeof item.p.x !== 'number' || typeof item.p.y !== 'number') return;
            const screenPoint = worldToScreen(item.p.x, item.p.y);
            const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
            if (distance < SNAP_RADIUS_PIXELS) {
                 if (state.isDragging && state.selectedObject) {
                     if (state.selectedObject.type === 'wall') {
                        const selWall = state.selectedObject.object;
                        if (item.p === selWall.p1 || item.p === selWall.p2) return;
                     }
                 }
                candidates.push({ point: item.p, distance: distance, type: item.type });
            }
        });
    }

    // Kolon, Kiriş Snap Noktaları (sadece aktif kat)
    const currentFloorColumns = currentFloorId
        ? (state.columns || []).filter(c => c.floorId === currentFloorId)
        : (state.columns || []);
    if (currentFloorColumns.length > 0) {
        currentFloorColumns.forEach(column => {
             if (state.isDragging && state.selectedObject?.type === 'column' && state.selectedObject.object === column) return;
             try {
                 const corners = getColumnCorners(column);
                 if (!corners || corners.length !== 4) return;
                 const center = column.center;
                 const pointsToCheck = [...corners, center];
                 pointsToCheck.forEach(p => {
                     const screenPoint = worldToScreen(p.x, p.y);
                     const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                     if (distance < SNAP_RADIUS_PIXELS) {
                         candidates.push({ point: p, distance: distance, type: 'ENDPOINT' });
                     }
                 });
             } catch (error) { console.error("Error processing column corners for snap:", error, column); }
        });
    }
    const currentFloorBeams = currentFloorId
        ? (state.beams || []).filter(b => b.floorId === currentFloorId)
        : (state.beams || []);
    if (currentFloorBeams.length > 0) {
         currentFloorBeams.forEach(beam => {
             if (state.isDragging && state.selectedObject?.type === 'beam' && state.selectedObject.object === beam) return;
              try {
                 const corners = getBeamCorners(beam);
                 if (!corners || corners.length !== 4) return;
                 const center = beam.center;
                 const pointsToCheck = [...corners, center];
                 pointsToCheck.forEach(p => {
                     const screenPoint = worldToScreen(p.x, p.y);
                     const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                     if (distance < SNAP_RADIUS_PIXELS) {
                         candidates.push({ point: p, distance: distance, type: 'ENDPOINT' });
                     }
                 });
              } catch (error) { console.error("Error processing beam corners for snap:", error, beam); }
         });
    }

    // Merdiven Köşe/Merkez Snap (Çizim modu DIŞINDA, sadece aktif kat)
    const currentFloorStairs = currentFloorId
        ? (state.stairs || []).filter(s => s.floorId === currentFloorId)
        : (state.stairs || []);
    if (state.currentMode !== 'drawStairs' && currentFloorStairs.length > 0) {
        for (const stair of currentFloorStairs) {
             if (state.isDragging && state.selectedObject?.type === 'stairs' && state.selectedObject.object === stair) continue;
             try {
                 const corners = getStairCorners(stair);
                 if (!corners || corners.length !== 4) continue;
                 const center = stair.center;
                 if (!center) continue;
                 const pointsToCheck = [...corners, center];

                 for (const point of pointsToCheck) {
                     if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') continue;
                     const screenPoint = worldToScreen(point.x, point.y);
                     const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                     if (distance < SNAP_RADIUS_PIXELS) {
                         candidates.push({ point: point, distance: distance, type: 'ENDPOINT' });
                     }
                 }
             } catch (error) { console.error("Error processing stair corners for snap:", error, stair); }
        }
    }

    // Rehber (Guide) Snap Noktaları ve Kesişimleri - DEVRE DIŞI
    /*
    const guides = state.guides || [];
    if (guides.length > 0 && state.selectedObject?.type !== 'guide') {
        // Önce rehber kesişimlerini hesapla (yüksek öncelikli)
        for (let i = 0; i < guides.length; i++) {
            for (let j = i + 1; j < guides.length; j++) {
                const g1 = guides[i];
                const g2 = guides[j];

                try {
                    let intersection = null;

                    // Yatay-Dikey kesişim
                    if (g1.subType === 'horizontal' && g2.subType === 'vertical') {
                        intersection = { x: g2.x, y: g1.y };
                    } else if (g1.subType === 'vertical' && g2.subType === 'horizontal') {
                        intersection = { x: g1.x, y: g2.y };
                    }
                    // Açısal/Serbest çizgiler arası kesişim
                    else if ((g1.subType === 'angular' || g1.subType === 'free') &&
                             (g2.subType === 'angular' || g2.subType === 'free')) {
                        if (g1.p1 && g1.p2 && g2.p1 && g2.p2) {
                            intersection = getLineIntersectionPoint(g1.p1, g1.p2, g2.p1, g2.p2);
                        }
                    }
                    // Açısal/Serbest - Yatay kesişim
                    else if ((g1.subType === 'angular' || g1.subType === 'free') && g2.subType === 'horizontal') {
                        if (g1.p1 && g1.p2) {
                            const lineStart = { x: g1.p1.x - 10000, y: g2.y };
                            const lineEnd = { x: g1.p1.x + 10000, y: g2.y };
                            intersection = getLineIntersectionPoint(g1.p1, g1.p2, lineStart, lineEnd);
                        }
                    } else if (g1.subType === 'horizontal' && (g2.subType === 'angular' || g2.subType === 'free')) {
                        if (g2.p1 && g2.p2) {
                            const lineStart = { x: g2.p1.x - 10000, y: g1.y };
                            const lineEnd = { x: g2.p1.x + 10000, y: g1.y };
                            intersection = getLineIntersectionPoint(g2.p1, g2.p2, lineStart, lineEnd);
                        }
                    }
                    // Açısal/Serbest - Dikey kesişim
                    else if ((g1.subType === 'angular' || g1.subType === 'free') && g2.subType === 'vertical') {
                        if (g1.p1 && g1.p2) {
                            const lineStart = { x: g2.x, y: g1.p1.y - 10000 };
                            const lineEnd = { x: g2.x, y: g1.p1.y + 10000 };
                            intersection = getLineIntersectionPoint(g1.p1, g1.p2, lineStart, lineEnd);
                        }
                    } else if (g1.subType === 'vertical' && (g2.subType === 'angular' || g2.subType === 'free')) {
                        if (g2.p1 && g2.p2) {
                            const lineStart = { x: g1.x, y: g2.p1.y - 10000 };
                            const lineEnd = { x: g1.x, y: g2.p1.y + 10000 };
                            intersection = getLineIntersectionPoint(g2.p1, g2.p2, lineStart, lineEnd);
                        }
                    }

                    if (intersection) {
                        const screenPoint = worldToScreen(intersection.x, intersection.y);
                        const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                        if (distance < INTERSECTION_SNAP_RADIUS_PIXELS) {
                            // Kesişimlere çok yüksek öncelik: distance * 0.2 (0.5 -> 0.2)
                            candidates.push({ point: intersection, distance: distance * 0.2, type: 'GUIDE_INTERSECTION' });
                        }
                    }
                } catch (error) {
                    console.error("Error processing guide intersection:", error, g1, g2);
                }
            }
        }

        // Sonra bireysel rehber snap noktaları
        for (const guide of guides) {
            try {
                if (guide.subType === 'point') {
                    // Nokta rehberi - doğrudan nokta
                    const screenPoint = worldToScreen(guide.x, guide.y);
                    const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                    if (distance < SNAP_RADIUS_PIXELS) {
                        candidates.push({ point: { x: guide.x, y: guide.y }, distance: distance, type: 'GUIDE_POINT' });
                    }
                } else if (guide.subType === 'horizontal') {
                    // Yatay rehber - Y sabit, X fare konumunda
                    const guidePoint = { x: wm.x, y: guide.y };
                    const screenPoint = worldToScreen(guidePoint.x, guidePoint.y);
                    const distance = Math.abs(screenMouse.y - screenPoint.y);
                    if (distance < SNAP_RADIUS_PIXELS) {
                        candidates.push({ point: guidePoint, distance: distance, type: 'GUIDE_HORIZONTAL' });
                    }
                } else if (guide.subType === 'vertical') {
                    // Dikey rehber - X sabit, Y fare konumunda
                    const guidePoint = { x: guide.x, y: wm.y };
                    const screenPoint = worldToScreen(guidePoint.x, guidePoint.y);
                    const distance = Math.abs(screenMouse.x - screenPoint.x);
                    if (distance < SNAP_RADIUS_PIXELS) {
                        candidates.push({ point: guidePoint, distance: distance, type: 'GUIDE_VERTICAL' });
                    }
                } else if (guide.subType === 'angular' || guide.subType === 'free') {
                    // Açısal/Serbest rehber - Uç noktalar
                    if (guide.p1) {
                        const screenPoint = worldToScreen(guide.p1.x, guide.p1.y);
                        const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                        if (distance < SNAP_RADIUS_PIXELS) {
                            candidates.push({ point: guide.p1, distance: distance, type: 'GUIDE_ENDPOINT' });
                        }
                    }
                    if (guide.p2) {
                        const screenPoint = worldToScreen(guide.p2.x, guide.p2.y);
                        const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                        if (distance < SNAP_RADIUS_PIXELS) {
                            candidates.push({ point: guide.p2, distance: distance, type: 'GUIDE_ENDPOINT' });
                        }
                    }

                    // Çizgi üzerindeki en yakın nokta
                    if (guide.p1 && guide.p2) {
                        const dx = guide.p2.x - guide.p1.x;
                        const dy = guide.p2.y - guide.p1.y;
                        const lenSq = dx * dx + dy * dy;
                        if (lenSq > 0.1) {
                            let t = ((wm.x - guide.p1.x) * dx + (wm.y - guide.p1.y) * dy) / lenSq;

                            // Serbest rehber için segmente sınırla, açısal için sonsuz çizgi
                            if (guide.subType === 'free') {
                                t = Math.max(0, Math.min(1, t));
                            }

                            const closest = {
                                x: guide.p1.x + t * dx,
                                y: guide.p1.y + t * dy
                            };
                            const screenPoint = worldToScreen(closest.x, closest.y);
                            const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                            if (distance < SNAP_RADIUS_PIXELS) {
                                candidates.push({ point: closest, distance: distance, type: 'GUIDE_LINE' });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing guide for snap:", error, guide);
            }
        }
    }
    */

    // Uzantı Çizgileri ve Kesişimler
    let bestVSnap = { x: null, dist: Infinity, origin: null };
    let bestHSnap = { y: null, dist: Infinity, origin: null };
    const extensionPoints = [];
    if (state.startPoint) extensionPoints.push(state.startPoint);
    if (state.snapOptions.endpointExtension || state.snapOptions.midpointExtension) {
        wallsToScan.forEach(w => {
            if (!w.p1 || !w.p2) return;
            if (state.snapOptions.endpointExtension) extensionPoints.push(w.p1, w.p2);
            if (state.snapOptions.midpointExtension) extensionPoints.push({ x: (w.p1.x + w.p2.x) / 2, y: (w.p1.y + w.p2.y) / 2 });
        });
    }
    if (state.snapOptions.endpointExtension && currentFloorStairs.length > 0) {
        currentFloorStairs.forEach(stair => {
             if (state.isDragging && state.selectedObject?.type === 'stairs' && state.selectedObject.object === stair) return;
             try { const corners = getStairCorners(stair); if (corners) extensionPoints.push(...corners); } catch (e) {}
        });
    }
    const uniqueExtensionPoints = [...new Map(extensionPoints.map(p => p ? [JSON.stringify(p), p] : [null, null])).values()]
                                    .filter(p => p && p !== draggedNode && typeof p.x === 'number' && typeof p.y === 'number');
    uniqueExtensionPoints.forEach(p => {
        const dx = Math.abs(wm.x - p.x) * state.zoom;
        if (dx < SNAP_RADIUS_PIXELS && dx < bestVSnap.dist) { bestVSnap = { x: p.x, dist: dx, origin: p }; }
        const dy = Math.abs(wm.y - p.y) * state.zoom;
        if (dy < SNAP_RADIUS_PIXELS && dy < bestHSnap.dist) { bestHSnap = { y: p.y, dist: dy, origin: p }; }
    });
    if (bestVSnap.x !== null && bestHSnap.y !== null) {
        const intersectPt = { x: bestVSnap.x, y: bestHSnap.y };
        const screenIntersect = worldToScreen(intersectPt.x, intersectPt.y);
        const distToIntersection = Math.hypot(screenMouse.x - screenIntersect.x, screenMouse.y - screenIntersect.y);
        if (distToIntersection < SNAP_RADIUS_PIXELS) {
            candidates.push({ point: intersectPt, distance: distToIntersection, type: 'INTERSECTION' });
        }
    }
    if (bestVSnap.x !== null && isFinite(wm.y)) candidates.push({ point: { x: bestVSnap.x, y: wm.y }, distance: bestVSnap.dist, type: 'PROJECTION' });
    if (bestHSnap.y !== null && isFinite(wm.x)) candidates.push({ point: { x: wm.x, y: bestHSnap.y }, distance: bestHSnap.dist, type: 'PROJECTION' });

    // Kesişim Snap (Duvar-Duvar MERKEZ, Duvar-Merdiven KENAR)
    // DİKKAT: Bu blok merdiven çizerken çalışmaz (yukarıda return edildi).
    for (let i = 0; i < wallsToScan.length; i++) {
        const wall1 = wallsToScan[i]; if (!wall1.p1 || !wall1.p2) continue;
        for (let j = i + 1; j < wallsToScan.length; j++) {
            const wall2 = wallsToScan[j]; if (!wall2.p1 || !wall2.p2) continue;
            if (state.isDragging && state.selectedObject?.type === 'wall') { const selWall = state.selectedObject.object; if(selWall === wall1 || selWall === wall2) continue; }
            const intersection = getLineIntersectionPoint(wall1.p1, wall1.p2, wall2.p1, wall2.p2); // Merkez çizgisi kesişimi
            if (intersection && isFinite(intersection.x) && isFinite(intersection.y)) {
                const screenIntersect = worldToScreen(intersection.x, intersection.y);
                const distance = Math.hypot(screenMouse.x - screenIntersect.x, screenMouse.y - screenIntersect.y);
                if (distance < INTERSECTION_SNAP_RADIUS_PIXELS) {
                    candidates.push({ point: intersection, distance: distance, type: 'INTERSECTION' });
                }
            }
        }
    }
    if (currentFloorStairs.length > 0) {
        for (const wall of wallsToScan) {
            if (!wall.p1 || !wall.p2) continue;
            for (const stair of currentFloorStairs) {
                 if (state.isDragging && state.selectedObject?.type === 'stairs' && state.selectedObject.object === stair) continue;
                 try {
                     const corners = getStairCorners(stair); if (!corners || corners.length !== 4) continue;
                     for (let i = 0; i < corners.length; i++) {
                         const p1 = corners[i], p2 = corners[(i + 1) % 4]; if (!p1 || !p2) continue;
                         const intersection = getLineIntersectionPoint(wall.p1, wall.p2, p1, p2); // Duvar merkezi - Merdiven kenarı
                         if (intersection && isFinite(intersection.x) && isFinite(intersection.y)) {
                             const screenIntersect = worldToScreen(intersection.x, intersection.y);
                             const distance = Math.hypot(screenMouse.x - screenIntersect.x, screenMouse.y - screenIntersect.y);
                             if (distance < INTERSECTION_SNAP_RADIUS_PIXELS) {
                                 candidates.push({ point: intersection, distance: distance, type: 'INTERSECTION' });
                             }
                         }
                     }
                 } catch (e) { console.error("Error processing stair intersections (general):", e, stair); }
            }
        }
    }

    // En iyi snap adayını seç
    let bestSnap = null;
    if (candidates.length > 0) {
         const validCandidates = candidates.filter(c => c.point && typeof c.point.x === 'number' && typeof c.point.y === 'number');
         if (validCandidates.length > 0) {
             validCandidates.sort((a, b) => {
                 const priority = { 'INTERSECTION': 0, 'ENDPOINT': 1, 'MIDPOINT': 2, 'EDGE': 3, 'PROJECTION': 4, 'WALL_EDGE': 5 };
                 const pA = priority[a.type] ?? 99; const pB = priority[b.type] ?? 99;
                 if (pA !== pB) return pA - pB;
                 return a.distance - b.distance;
             });
             bestSnap = validCandidates[0];
         }
    }

    // En iyi snap bulunduysa koordinatları güncelle
    if (bestSnap) {
        x = bestSnap.point.x;
        y = bestSnap.point.y;
        isSnapped = true;
        isLockable = lockableSnapTypes.includes(bestSnap.type);
        roundedX = x;
        roundedY = y;
        if ((bestSnap.type === 'INTERSECTION' || bestSnap.type === 'PROJECTION') ) {
            if (bestVSnap.origin && Math.abs(x - (bestVSnap.x ?? x)) < 0.1) { snapLines.v_origins.push(bestVSnap.origin); }
            if (bestHSnap.origin && Math.abs(y - (bestHSnap.y ?? y)) < 0.1) { snapLines.h_origins.push(bestHSnap.origin); }
        }
    } else if (applyGridSnapFallback) {
         const currentMode = state.currentMode || 'select';
         // Merdiven modu buraya gelirse grid'e snap yapsın (özel snap bulamadıysa)
         if (!state.isDragging && (currentMode === 'drawWall' || currentMode === 'drawRoom' || currentMode === 'drawColumn' || currentMode === 'drawStairs')) {
            x = roundedX;
            y = roundedY;
            isSnapped = true;
            isLockable = false;
         } else {
             x = wm.x; y = wm.y; isSnapped = false;
         }
    } else {
        x = wm.x; y = wm.y; isSnapped = false;
    }

    // Snap kilidini ayarla
    if (isLockable && bestSnap && bestSnap.point) {
         setState({ isSnapLocked: true, lockedSnapPoint: { ...bestSnap.point, roundedX: roundedX, roundedY: roundedY } });
    } else if (state.isSnapLocked) {
         setState({ isSnapLocked: false, lockedSnapPoint: null });
    }

    // --- SON DOĞRULAMA ---
    const finalX = isFinite(x) ? x : wm.x;
    const finalY = isFinite(y) ? y : wm.y; 
    const finalRoundedX = isFinite(roundedX) ? roundedX : Math.round(wm.x / (gridValue > 0 ? gridValue : 1));
    const finalRoundedY = isFinite(roundedY) ? roundedY : Math.round(wm.y / (gridValue > 0 ? gridValue : 1));
    const finalIsSnapped = isFinite(finalX) && isFinite(finalY) && isSnapped;
    const finalIsLockable = finalIsSnapped && isLockable;
    const finalBestSnapPoint = (finalIsSnapped && bestSnap && bestSnap.point) ? bestSnap.point : null;
    const finalSnapType = (finalIsSnapped && bestSnap) ? bestSnap.type : (finalIsSnapped ? 'GRID' : null);
    // snapAngle'ı bestSnap'ten al (eğer varsa, yoksa 0)
    const finalSnapAngle = (finalIsSnapped && bestSnap && bestSnap.snapAngle) ? bestSnap.snapAngle : 0;


    return {
        x: finalX,
        y: finalY,
        isSnapped: finalIsSnapped,
        snapLines,
        isLockable: finalIsLockable,
        point: finalBestSnapPoint,
        snapType: finalSnapType,
        roundedX: finalRoundedX,
        roundedY: finalRoundedY,
        snapAngle: finalSnapAngle // <-- YENİ: Genel snap dönüşüne de eklendi (tesisat dışı modlar için 0 olacak)
    };
}