// ahmedakbayir/ngcad/ngcad-1fde862049234ed29ab17f348568a2e3a4540854/snap.js
// SON GÜNCELLEME: Merdiven snap iyileştirmeleri eklendi.

import { state, dom, setState, SNAP_UNLOCK_DISTANCE_CM } from './main.js';
import { screenToWorld, worldToScreen, distToSegmentSquared, getLineIntersectionPoint } from './geometry.js'; // getLineIntersectionPoint import edildi
import { getColumnCorners } from './columns.js';
import { getBeamCorners } from './beams.js';
import { getStairCorners } from './stairs.js';

export function getSmartSnapPoint(e, applyGridSnapFallback = true) {
    const rect = dom.c2d.getBoundingClientRect();
    const screenMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const wm = screenToWorld(screenMouse.x, screenMouse.y);

    // Kapı sürüklenirken snap yapma (değişiklik yok)
    if (state.isDragging && state.selectedObject?.type === 'door') {
        // ... (kod aynı)
        return { /* ... */ };
    }

    // Dinamik uzaktan snap (değişiklik yok)
    if (state.isDragging && state.selectedObject) {
         // ... (kod aynı, merdiven kontrolü zaten vardı)
         // Not: Buradaki merdiven kontrolü sadece merkeze snap yapıyor, köşe/kenar değil.
         // Daha detaylı uzaktan snap istenirse burası da geliştirilebilir.
    }

    // Kiriş çizim modu snap'i (değişiklik yok)
    if (state.currentMode === 'drawBeam') {
        // ... (kod aynı)
        return { /* ... */ };
    }

    // Grid snap için varsayılan değerler (değişiklik yok)
    const gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1;
    let roundedX = Math.round(wm.x / gridValue) * gridValue;
    let roundedY = Math.round(wm.y / gridValue) * gridValue;

    // Select modunda snap yapma (değişiklik yok)
    if (state.currentMode === 'select' && !state.isDragging) {
        // ... (kod aynı)
        return { /* ... */ };
    }

    // Snap kilidi kontrolü (değişiklik yok)
    if (state.isSnapLocked && state.lockedSnapPoint) {
        // ... (kod aynı)
        // return { ... }; // Eğer kilitliyse buradan döner
    }

    // Snap hesaplamaları başlangıcı
    let x = wm.x, y = wm.y, isSnapped = false, isLockable = false;
    let snapLines = { h_origins: [], v_origins: [] };
    const SNAP_RADIUS_PIXELS = 35; // Piksel cinsinden yakalama yarıçapı
    const lockableSnapTypes = ['INTERSECTION', 'ENDPOINT']; // Kilitlenebilir snap türleri

    // Taranacak duvarlar (nearestOnly ayarına göre)
    const wallsToScan = state.snapOptions.nearestOnly
        ? state.walls.map(wall => ({ wall, distance: Math.sqrt(distToSegmentSquared(wm, wall.p1, wall.p2)) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)
          .map(item => item.wall)
        : state.walls;

    const candidates = []; // Potansiyel snap noktaları listesi
    // Sürüklenen node (varsa)
    let draggedNode = (state.isDragging && state.selectedObject?.type === "wall" && state.selectedObject.handle !== "body")
        ? state.selectedObject.object[state.selectedObject.handle]
        : null;

    // --- YENİ: MERDİVEN ÇİZİM MODU ÖZEL SNAP ---
    if (state.currentMode === 'drawStairs') {
        // Merdiven çizerken duvar kenarlarına, diğer merdiven kenarlarına ve köşelerine snap yap
        const stairSnapCandidates = [];
        const STAIR_SNAP_RADIUS_PIXELS = SNAP_RADIUS_PIXELS * 0.8; // Merdiven için biraz daha küçük yarıçap

        // 1. Duvar Kenarlarına Snap (Mevcut kod korunuyor ve geliştiriliyor)
        for (const wall of wallsToScan) {
            if (!wall.p1 || !wall.p2) continue;
            const wallThickness = wall.thickness || state.wallThickness;
            const halfThickness = wallThickness / 2;
            const dxW = wall.p2.x - wall.p1.x;
            const dyW = wall.p2.y - wall.p1.y;
            const isVertical = Math.abs(dxW) < 0.1;
            const isHorizontal = Math.abs(dyW) < 0.1;

            if (isVertical) {
                const wallX = wall.p1.x;
                const snapXPositions = [wallX - halfThickness, wallX + halfThickness];
                for (const snapX of snapXPositions) {
                    const screenSnapPoint = worldToScreen(snapX, wm.y);
                    const distance = Math.abs(screenMouse.x - screenSnapPoint.x);
                    if (distance < STAIR_SNAP_RADIUS_PIXELS) {
                        stairSnapCandidates.push({ point: { x: snapX, y: wm.y }, distance: distance, type: 'WALL_EDGE' });
                    }
                }
            } else if (isHorizontal) {
                const wallY = wall.p1.y;
                const snapYPositions = [wallY - halfThickness, wallY + halfThickness];
                for (const snapY of snapYPositions) {
                    const screenSnapPoint = worldToScreen(wm.x, snapY);
                    const distance = Math.abs(screenMouse.y - screenSnapPoint.y);
                    if (distance < STAIR_SNAP_RADIUS_PIXELS) {
                        stairSnapCandidates.push({ point: { x: wm.x, y: snapY }, distance: distance, type: 'WALL_EDGE' });
                    }
                }
            }
             // Açılı duvar kenarlarına snap de eklenebilir (daha karmaşık)
        }

        // 2. Diğer Merdiven Kenarlarına ve Köşelerine Snap
        if (state.stairs) {
            for (const otherStair of state.stairs) {
                const corners = getStairCorners(otherStair);
                // Köşelere snap
                corners.forEach(corner => {
                    const screenPoint = worldToScreen(corner.x, corner.y);
                    const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                    if (distance < STAIR_SNAP_RADIUS_PIXELS) {
                        stairSnapCandidates.push({ point: corner, distance: distance, type: 'ENDPOINT' }); // Köşeyi ENDPOINT gibi kabul et
                    }
                });
                // Kenarlara snap (Segmentlere dik izdüşüm)
                for (let i = 0; i < corners.length; i++) {
                    const p1 = corners[i];
                    const p2 = corners[(i + 1) % corners.length];
                    const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
                    if (l2 === 0) continue;
                    let t = ((wm.x - p1.x) * (p2.x - p1.x) + (wm.y - p1.y) * (p2.y - p1.y)) / l2;
                    t = Math.max(0, Math.min(1, t)); // İzdüşümü segment içinde tut
                    const closestX = p1.x + t * (p2.x - p1.x);
                    const closestY = p1.y + t * (p2.y - p1.y);
                    const screenClosest = worldToScreen(closestX, closestY);
                    const distance = Math.hypot(screenMouse.x - screenClosest.x, screenMouse.y - screenClosest.y);
                    // Mesafe uygunsa VE izdüşüm segment üzerindeyse (t kontrolü zaten yaptı)
                    if (distance < STAIR_SNAP_RADIUS_PIXELS) {
                         stairSnapCandidates.push({ point: { x: closestX, y: closestY }, distance: distance, type: 'EDGE' }); // Kenar tipi
                    }
                }
            }
        }

        // En iyi merdiven snap adayını bul ve döndür
        if (stairSnapCandidates.length > 0) {
            stairSnapCandidates.sort((a, b) => a.distance - b.distance);
            const bestStairSnap = stairSnapCandidates[0];
            return {
                x: bestStairSnap.point.x, y: bestStairSnap.point.y,
                isSnapped: true, snapLines: { h_origins: [], v_origins: [] }, isLockable: false, // Merdiven kenar/köşe snap'i kilitlenmez
                point: bestStairSnap.point, snapType: bestStairSnap.type,
                roundedX: bestStairSnap.point.x, roundedY: bestStairSnap.point.y
            };
        }

        // Eğer merdiven özel snap bulunamazsa, normal snap'e devam et (aşağıdaki kod çalışır)
    }
    // --- MERDİVEN ÇİZİM MODU ÖZEL SNAP SONU ---

    // Genel Snap Noktaları (Duvar Uçları ve Ortaları)
    for (const wall of wallsToScan) {
        if (draggedNode === wall.p1 || draggedNode === wall.p2) continue; // Sürüklenen node'a snap yapma
        const p1 = wall.p1, p2 = wall.p2;
        if (!p1 || !p2) continue; // Geçersiz duvarları atla

        const pointsToCheck = [];
        if (state.snapOptions.endpoint && state.currentMode !== "drawDoor") { // Kapı çizerken uçlara snap yapma
            pointsToCheck.push({p: p1, type: 'ENDPOINT'}, {p: p2, type: 'ENDPOINT'});
        }
        if (state.snapOptions.midpoint) {
            pointsToCheck.push({p: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, type: 'MIDPOINT'});
        }
        // Adayları kontrol et ve listeye ekle
        pointsToCheck.forEach(item => {
            const screenPoint = worldToScreen(item.p.x, item.p.y);
            const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
            if (distance < SNAP_RADIUS_PIXELS) {
                 // Sürüklenen nesne varsa ve bu nokta sürüklenen nesnenin bir parçasıysa atla
                 if (state.isDragging && state.selectedObject) {
                     if (state.selectedObject.type === 'wall') {
                        const selWall = state.selectedObject.object;
                        if (item.p === selWall.p1 || item.p === selWall.p2) return;
                     }
                     // Diğer nesne tipleri için de benzer kontroller eklenebilir (kolon, kiriş, merdiven köşeleri)
                 }
                candidates.push({ point: item.p, distance: distance, type: item.type });
            }
        });
    }

    // Kolon, Kiriş Snap Noktaları (Mevcut kod korunuyor)
    const COLUMN_BEAM_SNAP_DISTANCE_CM = 5;
    const COLUMN_BEAM_SNAP_DISTANCE_PIXELS = COLUMN_BEAM_SNAP_DISTANCE_CM * state.zoom;
    // ... (Kolon ve Kiriş snap kodları burada) ...

    // --- YENİ: MERDİVEN KÖŞE/MERKEZ SNAP (Çizim modu DIŞINDA) ---
    // Eğer çizim modu merdiven değilse (yukarıda handle edildi), diğer modlarda merdivenlere snap yap
    if (state.currentMode !== 'drawStairs' && state.stairs) {
        for (const stair of state.stairs) {
             // Sürüklenen merdivenin kendisine snap yapmayı engelle
             if (state.isDragging && state.selectedObject?.type === 'stairs' && state.selectedObject.object === stair) continue;

            const corners = getStairCorners(stair);
            const center = stair.center;
            const pointsToCheck = [...corners, center];

            for (const point of pointsToCheck) {
                const screenPoint = worldToScreen(point.x, point.y);
                const distance = Math.hypot(screenMouse.x - screenPoint.x, screenMouse.y - screenPoint.y);
                // Mesafe uygunsa ve sürüklenen nesnenin parçası değilse ekle
                if (distance < SNAP_RADIUS_PIXELS) {
                    candidates.push({ point: point, distance: distance, type: 'ENDPOINT' }); // Merdiven köşesini/merkezini ENDPOINT gibi kabul et
                }
            }
        }
    }
    // --- MERDİVEN KÖŞE/MERKEZ SNAP SONU ---


    // Uzantı Çizgileri ve Kesişimler
    let bestVSnap = { x: null, dist: Infinity, origin: null };
    let bestHSnap = { y: null, dist: Infinity, origin: null };

    const extensionPoints = []; // Uzantı çizgisi kaynak noktaları
    if (state.startPoint) extensionPoints.push(state.startPoint); // Çizim başlangıç noktası

    // Duvar uç/orta noktalarını ekle (ayarlara göre)
    if (state.snapOptions.endpointExtension || state.snapOptions.midpointExtension) {
        wallsToScan.forEach(w => {
            if (!w.p1 || !w.p2) return;
            if (state.snapOptions.endpointExtension) extensionPoints.push(w.p1, w.p2);
            if (state.snapOptions.midpointExtension) extensionPoints.push({ x: (w.p1.x + w.p2.x) / 2, y: (w.p1.y + w.p2.y) / 2 });
        });
    }
    // --- YENİ: MERDİVEN KÖŞELERİNİ UZANTI NOKTALARINA EKLE ---
    if (state.snapOptions.endpointExtension && state.stairs) { // Sadece endpoint açıksa merdiven köşelerini ekle
        state.stairs.forEach(stair => {
             // Sürüklenen merdivenin köşelerini atla
             if (state.isDragging && state.selectedObject?.type === 'stairs' && state.selectedObject.object === stair) return;
            extensionPoints.push(...getStairCorners(stair));
        });
    }
    // --- MERDİVEN KÖŞELERİ EKLEME SONU ---

    // Tekrarlanan ve sürüklenen node'u kaldır
    const uniqueExtensionPoints = [...new Map(extensionPoints.map(p => [JSON.stringify(p), p])).values()]
                                    .filter(p => p !== draggedNode);

    // En iyi dikey (V) ve yatay (H) uzantı snap'lerini bul
    uniqueExtensionPoints.forEach(p => {
        const dx = Math.abs(wm.x - p.x) * state.zoom; // Piksel cinsinden X farkı
        if (dx < SNAP_RADIUS_PIXELS && dx < bestVSnap.dist) {
            bestVSnap = { x: p.x, dist: dx, origin: p };
        }
        const dy = Math.abs(wm.y - p.y) * state.zoom; // Piksel cinsinden Y farkı
        if (dy < SNAP_RADIUS_PIXELS && dy < bestHSnap.dist) {
            bestHSnap = { y: p.y, dist: dy, origin: p };
        }
    });

    // Kesişim noktası snap'ini kontrol et
    if (bestVSnap.x !== null && bestHSnap.y !== null) {
        const intersectPt = { x: bestVSnap.x, y: bestHSnap.y };
        const screenIntersect = worldToScreen(intersectPt.x, intersectPt.y);
        const distToIntersection = Math.hypot(screenMouse.x - screenIntersect.x, screenMouse.y - screenIntersect.y);
        // Eğer kesişim noktası fareye yakınsa, adaylara ekle
        if (distToIntersection < SNAP_RADIUS_PIXELS) {
            candidates.push({ point: intersectPt, distance: distToIntersection, type: 'INTERSECTION' });
        }
    }
    // Dikey ve yatay izdüşüm (uzantı) snap'lerini adaylara ekle
    if (bestVSnap.x !== null) candidates.push({ point: { x: bestVSnap.x, y: wm.y }, distance: bestVSnap.dist, type: 'PROJECTION' });
    if (bestHSnap.y !== null) candidates.push({ point: { x: wm.x, y: bestHSnap.y }, distance: bestHSnap.dist, type: 'PROJECTION' });

    // --- YENİ: KESİŞİM SNAP (Duvarlar ve Merdivenler) ---
    const INTERSECTION_SNAP_RADIUS_PIXELS = SNAP_RADIUS_PIXELS * 0.7; // Kesişim için daha küçük yarıçap

    // 1. Duvar-Duvar Kesişimleri
    for (let i = 0; i < wallsToScan.length; i++) {
        const wall1 = wallsToScan[i];
        if (!wall1.p1 || !wall1.p2) continue;
        for (let j = i + 1; j < wallsToScan.length; j++) {
            const wall2 = wallsToScan[j];
            if (!wall2.p1 || !wall2.p2) continue;
            // Sürüklenen duvarların kesişimini atla (isteğe bağlı)
            if (state.isDragging && state.selectedObject?.type === 'wall') {
                const selWall = state.selectedObject.object;
                if(selWall === wall1 || selWall === wall2) continue;
            }

            const intersection = getLineIntersectionPoint(wall1.p1, wall1.p2, wall2.p1, wall2.p2);
            if (intersection) {
                const screenIntersect = worldToScreen(intersection.x, intersection.y);
                const distance = Math.hypot(screenMouse.x - screenIntersect.x, screenMouse.y - screenIntersect.y);
                if (distance < INTERSECTION_SNAP_RADIUS_PIXELS) {
                    candidates.push({ point: intersection, distance: distance, type: 'INTERSECTION' });
                }
            }
        }
    }

    // 2. Duvar-Merdiven Kesişimleri
    if (state.stairs) {
        for (const wall of wallsToScan) {
            if (!wall.p1 || !wall.p2) continue;
            for (const stair of state.stairs) {
                 // Sürüklenen merdivenle kesişimi atla (isteğe bağlı)
                 if (state.isDragging && state.selectedObject?.type === 'stairs' && state.selectedObject.object === stair) continue;

                const corners = getStairCorners(stair);
                for (let i = 0; i < corners.length; i++) {
                    const p1 = corners[i];
                    const p2 = corners[(i + 1) % corners.length];
                    const intersection = getLineIntersectionPoint(wall.p1, wall.p2, p1, p2);
                    if (intersection) {
                        const screenIntersect = worldToScreen(intersection.x, intersection.y);
                        const distance = Math.hypot(screenMouse.x - screenIntersect.x, screenMouse.y - screenIntersect.y);
                        if (distance < INTERSECTION_SNAP_RADIUS_PIXELS) {
                            candidates.push({ point: intersection, distance: distance, type: 'INTERSECTION' });
                        }
                    }
                }
            }
        }
    }

    // 3. Merdiven-Merdiven Kesişimleri (İsteğe bağlı, daha fazla hesaplama gerektirir)
    // ... (Benzer şekilde merdiven kenarlarının birbirleriyle kesişimi kontrol edilebilir) ...
    // --- KESİŞİM SNAP SONU ---


    // En iyi snap adayını seç (öncelik ve mesafeye göre)
    let bestSnap = null;
    if (candidates.length > 0) {
        candidates.sort((a, b) => {
            // Öncelik sırası: Kesişim/Endpoint > Midpoint > Kenar > Projeksiyon > Duvar Kenarı
            const priority = { 'INTERSECTION': 0, 'ENDPOINT': 1, 'MIDPOINT': 2, 'EDGE': 3, 'PROJECTION': 4, 'WALL_EDGE': 5 };
            const pA = priority[a.type] ?? 99;
            const pB = priority[b.type] ?? 99;
            if (pA !== pB) return pA - pB; // Önceliğe göre sırala
            return a.distance - b.distance; // Aynı öncelikteyse mesafeye göre sırala
        });
        bestSnap = candidates[0]; // En iyi adayı al
    }

    // En iyi snap bulunduysa koordinatları güncelle
    if (bestSnap) {
        x = bestSnap.point.x;
        y = bestSnap.point.y;
        isSnapped = true;
        isLockable = lockableSnapTypes.includes(bestSnap.type); // Kilitlenebilir mi?
        roundedX = x; // Snap noktası zaten hassas olduğu için yuvarlamaya gerek yok
        roundedY = y;

        // Snap çizgilerinin kaynaklarını belirle (kesişim veya projeksiyon ise)
        if ((bestSnap.type === 'INTERSECTION' || bestSnap.type === 'PROJECTION') ) {
            // Dikey snap çizgisi kaynağı (eğer varsa ve snap noktasıyla eşleşiyorsa)
            if (Math.abs(x - (bestVSnap.x ?? x)) < 0.1 && bestVSnap.origin) {
                 snapLines.v_origins.push(bestVSnap.origin);
            }
             // Yatay snap çizgisi kaynağı (eğer varsa ve snap noktasıyla eşleşiyorsa)
            if (Math.abs(y - (bestHSnap.y ?? y)) < 0.1 && bestHSnap.origin) {
                 snapLines.h_origins.push(bestHSnap.origin);
            }
        }
    } else if (applyGridSnapFallback) { // Hiçbir snap bulunamadıysa ve grid snap aktifse
        // Grid snap uygula (eğer çizim modundaysa ve sürükleme değilse)
         if (!state.isDragging && (state.currentMode === 'drawWall' || state.currentMode === 'drawRoom' || state.currentMode === 'drawColumn' /*|| state.currentMode === 'drawStairs'*/)) { // Merdiven çizimi grid'e snap yapmasın
            x = roundedX;
            y = roundedY;
            isSnapped = true; // Grid'e snap yapıldı
            isLockable = false; // Grid snap kilitlenmez
            // Snap çizgileri boş kalır
         } else {
             // Sürükleme veya diğer modlarda grid snap yapma, ham koordinatları kullan
             x = wm.x;
             y = wm.y;
             isSnapped = false;
         }
    } else { // Grid snap de uygulanmayacaksa
        x = wm.x;
        y = wm.y;
        isSnapped = false;
        // roundedX/Y grid değerleri olarak kalır (çizim önizlemesi için)
    }

    // Snap kilidini ayarla (eğer kilitlenebilir bir snap bulunduysa)
    if (isLockable && bestSnap) {
        setState({ isSnapLocked: true, lockedSnapPoint: { ...bestSnap.point, roundedX: roundedX, roundedY: roundedY } });
    } else {
         // Eğer kilitli değilse VEYA kilitlenebilir snap bulunamadıysa kilidi kaldır
        setState({ isSnapLocked: false, lockedSnapPoint: null });
    }

    // Sonuçları döndür
    return {
        x, y, // Snap uygulanmış veya ham koordinatlar
        isSnapped, // Snap yapıldı mı?
        snapLines, // Snap çizgilerinin kaynakları
        isLockable, // Bu snap kilitlenebilir mi?
        point: bestSnap ? bestSnap.point : null, // Snap yapılan nokta (varsa)
        snapType: bestSnap ? bestSnap.type : (isSnapped ? 'GRID' : null), // Snap türü
        roundedX, // Grid'e veya snap noktasına yuvarlanmış X
        roundedY  // Grid'e veya snap noktasına yuvarlanmış Y
    };
}