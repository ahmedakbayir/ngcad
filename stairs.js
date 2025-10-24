// stairs.js
// (Bu dosya beams.js ve columns.js'den uyarlanmıştır)

import { state, setState } from './main.js'; // setState import edin
import { distToSegmentSquared } from './geometry.js';
import { update3DScene } from './scene3d.js';
import { currentModifierKeys } from './input.js';

// --- YENİ FONKSİYON ---
/**
 * Merdivenin uzunluğuna göre basamak sayısını (25-30cm aralığında) hesaplar ve günceller.
 * @param {object} stair - Merdiven nesnesi
 */
export function recalculateStepCount(stair) {
    const totalRun = stair.width; // Merdivenin uzunluğu
    const minStepRun = 25;
    const maxStepRun = 30;

    if (!totalRun || totalRun <= 0) {
        stair.stepCount = 1;
        return;
    }

    // İdeal basamak sayısını hesapla
    const idealStepRun = (minStepRun + maxStepRun) / 2;
    let idealStepCount = totalRun / idealStepRun;

    // En yakın tam sayıya yuvarla (minimum 1)
    let calculatedStepCount = Math.max(1, Math.round(idealStepCount));

    // Hesaplanan basamak derinliğini kontrol et
    let currentStepRun = totalRun / calculatedStepCount;

    // Aralık kontrolü ve düzeltme
    if (currentStepRun < minStepRun) {
        calculatedStepCount = Math.max(1, Math.floor(totalRun / minStepRun));
    } else if (currentStepRun > maxStepRun) {
        calculatedStepCount = Math.max(1, Math.ceil(totalRun / maxStepRun));
    }

    // Son kontrol
    currentStepRun = totalRun / calculatedStepCount;
    // Küçük bir tolerans ekleyelim
    if (currentStepRun < minStepRun - 0.5 || currentStepRun > maxStepRun + 0.5) {
        if (currentStepRun < minStepRun) {
            calculatedStepCount = Math.max(1, Math.floor(totalRun / minStepRun));
        } else {
            calculatedStepCount = Math.max(1, Math.ceil(totalRun / maxStepRun));
        }
    }


    stair.stepCount = Math.max(1, calculatedStepCount); // Ekstra güvenlik
}
// --- YENİ FONKSİYON SONU ---

// Merdiven nesnesi oluşturur
export function createStairs(centerX, centerY, width, height, rotation) {
    const newStair = {
        type: 'stairs',
        center: { x: centerX, y: centerY },
        width: width, // Merdivenin UZUNLUĞU (Basamakların toplam run'ı)
        height: height, // Merdivenin ENİ
        rotation: rotation, // Açı
        stepCount: 1, // Başlangıç değeri, recalculate ile güncellenecek
        // direction: 'up' // (Ok yönü için, şimdilik sadece rotasyona bağlı)
    };
    recalculateStepCount(newStair); // Oluştururken hesapla
    return newStair;
}

// Merdivenin dünya koordinatlarındaki köşe noktalarını hesaplar
export function getStairCorners(stair) {
    const halfWidth = (stair.width || 0) / 2; // Uzunluk
    const halfHeight = (stair.height || 0) / 2; // En
    const cx = stair.center.x;
    const cy = stair.center.y;
    const rot = (stair.rotation || 0) * Math.PI / 180;

    const corners = [
        { x: -halfWidth, y: -halfHeight },  // Sol üst
        { x: halfWidth, y: -halfHeight },   // Sağ üst
        { x: halfWidth, y: halfHeight },    // Sağ alt
        { x: -halfWidth, y: halfHeight }    // Sol alt
    ];

    return corners.map(corner => {
        const rotatedX = corner.x * Math.cos(rot) - corner.y * Math.sin(rot);
        const rotatedY = corner.x * Math.sin(rot) + corner.y * Math.cos(rot);
        return {
            x: cx + rotatedX,
            y: cy + rotatedY
        };
    });
}

// Verilen noktanın, merdivenin hangi kenarına veya köşesine denk geldiğini belirler.
export function getStairHandleAtPoint(point, stair, tolerance) {
    const cx = stair.center.x;
    const cy = stair.center.y;

    // 1. Köşeleri Kontrol Et
    const corners = getStairCorners(stair);
    const cornerTolerance = tolerance * 1.5;
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) {
            return `corner_${i}`; // Döndürme için
        }
    }

    // 2. Kenarları Kontrol Et
    const rot = -(stair.rotation || 0) * Math.PI / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (stair.width || 0) / 2;
    const halfHeight = (stair.height || 0) / 2;

    if (Math.abs(localY + halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_top';
    if (Math.abs(localY - halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_bottom';
    if (Math.abs(localX + halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_left';
    if (Math.abs(localX - halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_right';

    return null;
}

// Verilen noktada hangi nesnenin (merdiven, kenar, köşe, gövde) olduğunu belirler
export function getStairAtPoint(point) {
    const { stairs, zoom } = state;
    const handleTolerance = 8 / zoom;

    // ÖNCE Handle kontrolü yap (SADECE EN ÜSTTEKİ MERDİVEN)
    for (const stair of [...(stairs || [])].reverse()) { // stairs undefined olabilir kontrolü
        const handle = getStairHandleAtPoint(point, stair, handleTolerance);
        if (handle) {
            // Handle bulundu, SADECE BU MERDİVENİ döndür ve ÇIK
            return { type: 'stairs', object: stair, handle: handle };
        }
    }

    // Handle bulunamadıysa, Body kontrolü yap (SADECE EN ÜSTTEKİ MERDİVEN)
    for (const stair of [...(stairs || [])].reverse()) { // stairs undefined olabilir kontrolü
        if (isPointInStair(point, stair)) {
            // Body içinde, SADECE BU MERDİVENİ döndür ve ÇIK
            return { type: 'stairs', object: stair, handle: 'body' };
        }
    }

    // Hiçbir merdiven bulunamadı
    return null;
}

// Noktanın merdiven içinde olup olmadığını kontrol eder
export function isPointInStair(point, stair) {
    const cx = stair.center.x;
    const cy = stair.center.y;
    const rot = -(stair.rotation || 0) * Math.PI / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (stair.width || 0) / 2;
    const halfHeight = (stair.height || 0) / 2;
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
}

/**
 * Bir merdiven seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen merdiven nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {Event} e - PointerDown olayı
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset, additionalState }
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) { // 'e' event objesini ekleyin
    const stair = selectedObject.object;

    // --- YENİ CTRL+DRAG KOPYALAMA ---
    const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey && selectedObject.handle === 'body';
    let effectiveStair = stair;

    if (isCopying) {
        const newStair = JSON.parse(JSON.stringify(stair));
        state.stairs = state.stairs || []; // stairs dizisi yoksa oluştur
        state.stairs.push(newStair);
        effectiveStair = newStair;
        setState({ selectedObject: { ...selectedObject, object: newStair } });
        // Kopyalama sonrası işlem başarılıysa saveState ve update3DScene çağrılabilir (pointerUp'ta)
    }
    // --- YENİ CTRL+DRAG SONU ---

    state.preDragNodeStates.set('center_x', effectiveStair.center.x);
    state.preDragNodeStates.set('center_y', effectiveStair.center.y);
    state.preDragNodeStates.set('width', effectiveStair.width || 0);
    state.preDragNodeStates.set('height', effectiveStair.height || 0);
    state.preDragNodeStates.set('rotation', effectiveStair.rotation || 0);
    // state.preDragNodeStates.set('stepCount', effectiveStair.stepCount || 1); // Kaydetmeye gerek yok, kopyadan geliyor

    let startPointForDragging;
    let dragOffset = { x: 0, y: 0 };
    let additionalState = { columnRotationOffset: null }; // Kolon/Kiriş ile aynı state'i kullanalım

    // İşlemleri 'effectiveStair' üzerinden yap
    if (selectedObject.handle === 'body' || selectedObject.handle === 'center') {
        startPointForDragging = { x: pos.x, y: pos.y };
        dragOffset = {
            x: effectiveStair.center.x - pos.x,
            y: effectiveStair.center.y - pos.y
        };
    } else if (selectedObject.handle.startsWith('corner_')) {
        // Döndürme
        startPointForDragging = { x: effectiveStair.center.x, y: effectiveStair.center.y };
        const initialAngle = Math.atan2(pos.y - effectiveStair.center.y, pos.x - effectiveStair.center.x);
        const initialRotationRad = (effectiveStair.rotation || 0) * Math.PI / 180;
        additionalState.columnRotationOffset = initialRotationRad - initialAngle;
    } else {
        // Kenar (boyutlandırma)
        startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
    }

    return { startPointForDragging, dragOffset, additionalState };
}

/**
 * Seçili bir merdiveni sürüklerken çağrılır.
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const stair = state.selectedObject.object; // Kopyalanmışsa güncel merdiven burada
    const handle = state.selectedObject.handle;

    if (handle.startsWith('corner_')) {
        // Döndürme (Kolon/Kiriş ile aynı)
        const center = stair.center;
        const mouseAngle = Math.atan2(unsnappedPos.y - center.y, unsnappedPos.x - center.x);
        let newRotationRad = mouseAngle + state.columnRotationOffset;

        const snapAngleRad1 = (1 * Math.PI / 180);
        newRotationRad = Math.round(newRotationRad / snapAngleRad1) * snapAngleRad1;
        let newRotationDeg = newRotationRad * 180 / Math.PI;
        const remainder = newRotationDeg % 90;
        const snapThreshold = 5;
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
        }
        stair.rotation = newRotationDeg;

    } else if (handle === 'body' || handle === 'center') {
        // Taşıma
        let newCenterX = unsnappedPos.x + state.dragOffset.x;
        let newCenterY = unsnappedPos.y + state.dragOffset.y;

        // --- GÜNCELLENMİŞ SNAP MANTIĞI (Duvar Kenarları Dahil) ---
        const SNAP_DISTANCE = 15; // Snap mesafesi (cm)
        let bestSnapX = { diff: SNAP_DISTANCE, delta: 0 };
        let bestSnapY = { diff: SNAP_DISTANCE, delta: 0 };

        // Geçici merkeze göre köşe ve merkez noktalarını hesapla
        const tempCorners = getStairCorners({ ...stair, center: { x: newCenterX, y: newCenterY } });
        const dragPoints = [
            ...tempCorners, // Köşeler
            { x: newCenterX, y: newCenterY } // Merkez
        ];

        // 1. Duvarlara Snap (Merkez + Kenarlar)
        state.walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;
            const wallThickness = wall.thickness || state.wallThickness;
            const halfThickness = wallThickness / 2;
            
            const isVertical = Math.abs(wall.p1.x - wall.p2.x) < 0.1;
            const isHorizontal = Math.abs(wall.p1.y - wall.p2.y) < 0.1;

            if (isVertical) {
                const wallCenterX = wall.p1.x;
                // Duvar merkezine ve iki kenarına snap
                const snapXPositions = [
                    wallCenterX,                    // Merkez
                    wallCenterX - halfThickness,    // Sol kenar
                    wallCenterX + halfThickness     // Sağ kenar
                ];
                
                for (const snapX of snapXPositions) {
                    for (const dP of dragPoints) {
                        const diff = Math.abs(dP.x - snapX);
                        if (diff < bestSnapX.diff) bestSnapX = { diff, delta: snapX - dP.x };
                    }
                }
            } else if (isHorizontal) {
                const wallCenterY = wall.p1.y;
                // Duvar merkezine ve iki kenarına snap
                const snapYPositions = [
                    wallCenterY,                    // Merkez
                    wallCenterY - halfThickness,    // Üst kenar
                    wallCenterY + halfThickness     // Alt kenar
                ];
                
                for (const snapY of snapYPositions) {
                    for (const dP of dragPoints) {
                        const diff = Math.abs(dP.y - snapY);
                        if (diff < bestSnapY.diff) bestSnapY = { diff, delta: snapY - dP.y };
                    }
                }
            }
             // TODO: Açılı duvarlara snap gerekirse eklenebilir (daha karmaşık)
        });

        // 2. Diğer Merdivenlere Snap
        (state.stairs || []).forEach(otherStair => { // stairs undefined olabilir
             if (otherStair === stair) return; // Kendisine snap yapma
             const otherCorners = getStairCorners(otherStair);
             const otherPoints = [
                 ...otherCorners,
                 otherStair.center
             ];

             // Basitlik için sadece X ve Y eksenlerine paralel kenarlara snap yapalım
             // (Daha gelişmiş snap için köşe-köşe veya kenar-kenar hizalama gerekir)
             otherPoints.forEach(oP => {
                 // Dikey Hizalama (X)
                 for (const dP of dragPoints) {
                     const diffX = Math.abs(dP.x - oP.x);
                     if (diffX < bestSnapX.diff) bestSnapX = { diff: diffX, delta: oP.x - dP.x };
                 }
                 // Yatay Hizalama (Y)
                 for (const dP of dragPoints) {
                     const diffY = Math.abs(dP.y - oP.y);
                     if (diffY < bestSnapY.diff) bestSnapY = { diff: diffY, delta: oP.y - dP.y };
                 }
             });
        });

        // Snap deltalarını uygula
        if (bestSnapX.delta !== 0) newCenterX += bestSnapX.delta;
        if (bestSnapY.delta !== 0) newCenterY += bestSnapY.delta;
        // --- SNAP MANTIĞI SONU ---

        stair.center.x = newCenterX;
        stair.center.y = newCenterY;

    } else if (handle.startsWith('edge_')) {
        // Boyutlandırma (Kolon/Kiriş ile aynı)
        let fixedEdgeHandle;
        if (handle === 'edge_top') fixedEdgeHandle = 'edge_bottom';
        else if (handle === 'edge_bottom') fixedEdgeHandle = 'edge_top';
        else if (handle === 'edge_left') fixedEdgeHandle = 'edge_right';
        else if (handle === 'edge_right') fixedEdgeHandle = 'edge_left';
        else return;

        const initialWidth = state.preDragNodeStates.get('width');
        const initialHeight = state.preDragNodeStates.get('height');
        const initialCenterX = state.preDragNodeStates.get('center_x');
        const initialCenterY = state.preDragNodeStates.get('center_y');
        if (initialWidth === undefined) return;

         const initialCorners = getStairCorners({
             center: { x: initialCenterX, y: initialCenterY },
             width: initialWidth,
             height: initialHeight,
             rotation: stair.rotation || 0
         });

         let fixedPoint1, fixedPoint2;
         if (fixedEdgeHandle === 'edge_top') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[1]; }
         else if (fixedEdgeHandle === 'edge_bottom') { fixedPoint1 = initialCorners[3]; fixedPoint2 = initialCorners[2]; }
         else if (fixedEdgeHandle === 'edge_left') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[3]; }
         else if (fixedEdgeHandle === 'edge_right') { fixedPoint1 = initialCorners[1]; fixedPoint2 = initialCorners[2]; }
         const fixedEdgeMidPoint = { x: (fixedPoint1.x + fixedPoint2.x) / 2, y: (fixedPoint1.y + fixedPoint2.y) / 2 };

         const rotRad = (stair.rotation || 0) * Math.PI / 180;
         const cosRot = Math.cos(rotRad);
         const sinRot = Math.sin(rotRad);
         let axisVector;
         if (handle === 'edge_top' || handle === 'edge_bottom') {
             axisVector = { x: -sinRot, y: cosRot }; // Y ekseni (height/en)
         } else {
             axisVector = { x: cosRot, y: sinRot }; // X ekseni (width/uzunluk)
         }

         const mouseVec = { x: snappedPos.x - fixedEdgeMidPoint.x, y: snappedPos.y - fixedEdgeMidPoint.y };
         const projection = mouseVec.x * axisVector.x + mouseVec.y * axisVector.y;
         let newSize = Math.max(10, Math.abs(projection));

         const halfSizeVector = { x: axisVector.x * projection / 2, y: axisVector.y * projection / 2 };
         const newCenterX = fixedEdgeMidPoint.x + halfSizeVector.x;
         const newCenterY = fixedEdgeMidPoint.y + halfSizeVector.y;

         if (handle === 'edge_top' || handle === 'edge_bottom') {
             stair.height = newSize; // 'height' (en) değişti
         } else {
             stair.width = newSize; // 'width' (uzunluk) değişti
             // Sadece uzunluk değiştiğinde basamakları yeniden hesapla
             recalculateStepCount(stair);
         }
        stair.center.x = newCenterX;
        stair.center.y = newCenterY;
    }

    update3DScene();
}