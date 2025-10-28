// stairs.js
// Son Güncelleme: CTRL+Sürükle ile kopyalamada yeni isim atama, duvar yüzeyi snap düzeltmesi.

import { state, setState, WALL_HEIGHT } from './main.js';
import { distToSegmentSquared } from './geometry.js'; // getStairCorners'ı import et veya stairs.js içinde tanımlıysa importu kaldır
import { update3DScene } from './scene3d.js';
import { currentModifierKeys } from './input.js';
// recalculateStepCount bu dosyada tanımlı olduğu için import etmeye gerek yok

// Sıradaki merdiven ismini verir
function getNextStairLetter() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let highestCharIndex = -1;
    (state.stairs || []).forEach(s => {
        if (s.name && s.name.length === 1 && letters.includes(s.name)) {
            highestCharIndex = Math.max(highestCharIndex, letters.indexOf(s.name));
        }
    });
    if (highestCharIndex < letters.length - 1) {
        return letters[highestCharIndex + 1];
    } else {
        return `Merdiven ${highestCharIndex + 2}`;
    }
}

// Merdiven nesnesi oluşturur
export function createStairs(centerX, centerY, width, height, rotation) {
    const nextName = getNextStairLetter(); // Sıradaki ismi al
    const newStair = {
        type: 'stairs',
        id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`, // Benzersiz ID
        name: nextName, // Otomatik isim
        center: { x: centerX, y: centerY },
        width: width, // Merdivenin UZUNLUĞU (Basamakların toplam run'ı)
        height: height, // Merdivenin ENİ
        rotation: rotation, // Açı
        stepCount: 1, // Başlangıç değeri, recalculate ile güncellenecek
        bottomElevation: 0, // Alt Kot
        topElevation: WALL_HEIGHT, // Üst Kot (WALL_HEIGHT kullanıldı)
        connectedStairId: null, // Bağlı merdiven ID'si
        isLanding: false // Sahanlık mı?
    };
    recalculateStepCount(newStair); // Oluştururken hesapla
    return newStair;
}

// Merdivenin uzunluğuna göre basamak sayısını hesaplar (sahanlık durumunu dikkate alır)
export function recalculateStepCount(stair) {
    if (stair.isLanding) {
        stair.stepCount = 1;
        return;
    }
    const totalRun = stair.width;
    const minStepRun = 25;
    const maxStepRun = 30;
    if (!totalRun || totalRun <= 0) {
        stair.stepCount = 1; return;
    }
    const idealStepRun = (minStepRun + maxStepRun) / 2;
    let idealStepCount = totalRun / idealStepRun;
    let calculatedStepCount = Math.max(1, Math.round(idealStepCount));
    let currentStepRun = totalRun / calculatedStepCount;
    if (currentStepRun < minStepRun) {
        calculatedStepCount = Math.max(1, Math.floor(totalRun / minStepRun));
    } else if (currentStepRun > maxStepRun) {
        calculatedStepCount = Math.max(1, Math.ceil(totalRun / maxStepRun));
    }
    currentStepRun = totalRun / calculatedStepCount;
    if (currentStepRun < minStepRun - 0.5 || currentStepRun > maxStepRun + 0.5) {
        if (currentStepRun < minStepRun) {
            calculatedStepCount = Math.max(1, Math.floor(totalRun / minStepRun));
        } else {
            calculatedStepCount = Math.max(1, Math.ceil(totalRun / maxStepRun));
        }
    }
    stair.stepCount = Math.max(1, calculatedStepCount);
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
    const corners = getStairCorners(stair);
    const cornerTolerance = tolerance * 1.5;
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) { return `corner_${i}`; }
    }
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
    for (const stair of [...(stairs || [])].reverse()) {
        const handle = getStairHandleAtPoint(point, stair, handleTolerance);
        if (handle) { return { type: 'stairs', object: stair, handle: handle }; }
    }
    for (const stair of [...(stairs || [])].reverse()) {
        if (isPointInStair(point, stair)) { return { type: 'stairs', object: stair, handle: 'body' }; }
    }
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
export function onPointerDown(selectedObject, pos, snappedPos, e) {
    const stair = selectedObject.object;
    const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey && selectedObject.handle === 'body';
    let effectiveStair = stair;

    if (isCopying) {
        const newStair = JSON.parse(JSON.stringify(stair));
        newStair.name = getNextStairLetter(); // Kopyaya yeni bir isim ver
        newStair.id = `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`; // Yeni ID ata
        state.stairs = state.stairs || [];
        state.stairs.push(newStair);
        effectiveStair = newStair;
        setState({ selectedObject: { ...selectedObject, object: newStair } });
    }

    state.preDragNodeStates.set('center_x', effectiveStair.center.x);
    state.preDragNodeStates.set('center_y', effectiveStair.center.y);
    state.preDragNodeStates.set('width', effectiveStair.width || 0);
    state.preDragNodeStates.set('height', effectiveStair.height || 0);
    state.preDragNodeStates.set('rotation', effectiveStair.rotation || 0);

    let startPointForDragging;
    let dragOffset = { x: 0, y: 0 };
    let additionalState = { columnRotationOffset: null };

    if (selectedObject.handle === 'body' || selectedObject.handle === 'center') {
        startPointForDragging = { x: pos.x, y: pos.y };
        dragOffset = { x: effectiveStair.center.x - pos.x, y: effectiveStair.center.y - pos.y };
    } else if (selectedObject.handle.startsWith('corner_')) {
        startPointForDragging = { x: effectiveStair.center.x, y: effectiveStair.center.y };
        const initialAngle = Math.atan2(pos.y - effectiveStair.center.y, pos.x - effectiveStair.center.x);
        const initialRotationRad = (effectiveStair.rotation || 0) * Math.PI / 180;
        additionalState.columnRotationOffset = initialRotationRad - initialAngle;
    } else {
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
    const stair = state.selectedObject.object;
    const handle = state.selectedObject.handle;

    if (handle.startsWith('corner_')) {
        // Döndürme
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

        // --- GÜNCELLENMİŞ SNAP MANTIĞI (Duvar Yüzeyleri ve Diğer Merdivenler) ---
        const SNAP_DISTANCE_WALL_SURFACE = 5; // Duvar yüzeyine snap mesafesi (cm)
        const SNAP_DISTANCE_OTHER = 15; // Diğer snap türleri için mesafe (cm)
        let bestSnapX = { diff: SNAP_DISTANCE_OTHER, delta: 0, type: 'other' };
        let bestSnapY = { diff: SNAP_DISTANCE_OTHER, delta: 0, type: 'other' };

        const tempCorners = getStairCorners({ ...stair, center: { x: newCenterX, y: newCenterY } });
        const dragPoints = [ ...tempCorners, { x: newCenterX, y: newCenterY } ];

        // 1. Duvar Yüzeylerine Snap
        state.walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;
            const wallThickness = wall.thickness || state.wallThickness;
            const halfThickness = wallThickness / 2;
            const dxW = wall.p2.x - wall.p1.x;
            const dyW = wall.p2.y - wall.p1.y;
            const isVertical = Math.abs(dxW) < 0.1;
            const isHorizontal = Math.abs(dyW) < 0.1;

            if (isVertical) {
                const wallX = wall.p1.x;
                const snapXPositions = [ wallX - halfThickness, wallX + halfThickness ];
                for (const snapX of snapXPositions) {
                    for (const dP of dragPoints) {
                        const diff = Math.abs(dP.x - snapX);
                        if (diff < SNAP_DISTANCE_WALL_SURFACE && diff < bestSnapX.diff) {
                            bestSnapX = { diff, delta: snapX - dP.x, type: 'wall_surface' };
                        }
                    }
                }
            } else if (isHorizontal) {
                const wallY = wall.p1.y;
                const snapYPositions = [ wallY - halfThickness, wallY + halfThickness ];
                for (const snapY of snapYPositions) {
                    for (const dP of dragPoints) {
                        const diff = Math.abs(dP.y - snapY);
                        if (diff < SNAP_DISTANCE_WALL_SURFACE && diff < bestSnapY.diff) {
                            bestSnapY = { diff, delta: snapY - dP.y, type: 'wall_surface' };
                        }
                    }
                }
            }
            // Açılı duvar snap'i şimdilik atlandı
        });

        // 2. Diğer Merdivenlere Snap (Eğer daha iyi duvar yüzeyi snap'i yoksa)
        if (bestSnapX.type !== 'wall_surface' || bestSnapY.type !== 'wall_surface') {
            (state.stairs || []).forEach(otherStair => {
                if (otherStair === stair) return;
                const otherCorners = getStairCorners(otherStair);
                const otherPoints = [ ...otherCorners, otherStair.center ];
                otherPoints.forEach(oP => {
                    for (const dP of dragPoints) {
                        const diffX = Math.abs(dP.x - oP.x);
                        if (diffX < bestSnapX.diff || (bestSnapX.type === 'wall_surface' && diffX < SNAP_DISTANCE_OTHER)) {
                            bestSnapX = { diff: diffX, delta: oP.x - dP.x, type: 'stair' };
                        }
                        const diffY = Math.abs(dP.y - oP.y);
                        if (diffY < bestSnapY.diff || (bestSnapY.type === 'wall_surface' && diffY < SNAP_DISTANCE_OTHER)) {
                            bestSnapY = { diff: diffY, delta: oP.y - dP.y, type: 'stair' };
                        }
                    }
                });
            });
        }

        // Snap deltalarını uygula
        newCenterX += bestSnapX.delta;
        newCenterY += bestSnapY.delta;
        // --- SNAP MANTIĞI SONU ---

        stair.center.x = newCenterX;
        stair.center.y = newCenterY;

    } else if (handle.startsWith('edge_')) {
        // Boyutlandırma
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
             recalculateStepCount(stair);
         }
        stair.center.x = newCenterX;
        stair.center.y = newCenterY;
    }

    update3DScene();
}