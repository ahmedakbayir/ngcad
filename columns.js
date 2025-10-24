// ahmedakbayir/ngcad/ngcad-54ad8bf2d516757e62115ea4acba62ce8c974e7f/columns.js
// GÜNCELLENMİŞ: Sürükleme (drag/move/rotate) fonksiyonları eklendi.

import { state, setState } from './main.js'; // setState import edin
import { distToSegmentSquared } from './geometry.js';
import { update3DScene } from './scene3d.js';
import { currentModifierKeys } from './input.js';
// createColumn'u kendi dosyasından import etmeye gerek yok

// Kolon nesnesi oluşturur
export function createColumn(centerX, centerY, size = 40) {
    // ... (mevcut kod - değişiklik yok)
    return {
        type: 'column',
        center: { x: centerX, y: centerY },
        size: size,
        width: size,
        height: size,
        rotation: 0,
        hollowWidth: 0,
        hollowHeight: 0,
        hollowOffsetX: 0,
        hollowOffsetY: 0
    };
}

// Kolonun dünya koordinatlarındaki köşe noktalarını hesaplar
export function getColumnCorners(column) {
    // ... (mevcut kod - değişiklik yok)
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;
    const cx = column.center.x;
    const cy = column.center.y;
    const rot = (column.rotation || 0) * Math.PI / 180;

    const corners = [
        { x: -halfWidth, y: -halfHeight },  // Sol üst   (index 0)
        { x: halfWidth, y: -halfHeight },   // Sağ üst   (index 1)
        { x: halfWidth, y: halfHeight },    // Sağ alt   (index 2)
        { x: -halfWidth, y: halfHeight }    // Sol alt   (index 3)
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

// Verilen noktanın, kolonun hangi kenarına veya köşesine denk geldiğini belirler.
export function getColumnHandleAtPoint(point, column, tolerance) {
    // ... (mevcut kod - değişiklik yok)
    const cx = column.center.x;
    const cy = column.center.y;

    // 1. Köşeleri Kontrol Et
    const corners = getColumnCorners(column);
    const cornerTolerance = tolerance * 1.5;
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) {
            return `corner_${i}`;
        }
    }

    // 2. Kenarları Kontrol Et
    const rot = -(column.rotation || 0) * Math.PI / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;

    if (Math.abs(localY + halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_top';
    if (Math.abs(localY - halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_bottom';
    if (Math.abs(localX + halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_left';
    if (Math.abs(localX - halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_right';

    return null;
}

// Verilen noktada hangi nesnenin (kolon, kenar, köşe, gövde) olduğunu belirler
export function getColumnAtPoint(point) {
    // ... (mevcut kod - değişiklik yok)
    const { columns, zoom } = state;
    const handleTolerance = 8 / zoom;

    for (const column of [...(columns || [])].reverse()) { // columns undefined olabilir kontrolü
        const handle = getColumnHandleAtPoint(point, column, handleTolerance);
        if (handle) {
            return { type: 'column', object: column, handle: handle };
        }
    }

    for (const column of [...(columns || [])].reverse()) { // columns undefined olabilir kontrolü
        if (isPointInColumn(point, column)) {
            return { type: 'column', object: column, handle: 'body' };
        }
    }
    return null;
}

// Noktanın kolon içinde olup olmadığını kontrol eder
export function isPointInColumn(point, column) {
    // ... (mevcut kod - değişiklik yok)
    const cx = column.center.x;
    const cy = column.center.y;
    const rot = -(column.rotation || 0) * Math.PI / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
}

// --- YENİ EKLENEN FONKSİYONLAR (Refactoring) ---

/**
 * Bir kolon seçildiğinde sürükleme için ilk state'i ayarlar.
 * (pointer-down.js'ten taşındı)
 * @param {object} selectedObject - Seçilen kolon nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {Event} e - PointerDown olayı
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset, additionalState }
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) { // 'e' event objesini ekleyin
    const column = selectedObject.object;

    // --- YENİ CTRL+DRAG KOPYALAMA ---
    const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey && selectedObject.handle === 'body'; // Sadece gövde sürüklenirken
    let effectiveColumn = column; // Üzerinde işlem yapılacak kolon (orijinal veya kopya)

    if (isCopying) {
        const newColumn = JSON.parse(JSON.stringify(column)); // Derin kopya
        state.columns.push(newColumn); // Yeni kolonu listeye ekle
        effectiveColumn = newColumn; // Bundan sonra kopya üzerinde işlem yap
        // Seçili nesneyi kopya ile güncelle (önemli!)
        setState({ selectedObject: { ...selectedObject, object: newColumn } });
        // Kopyalama sonrası işlem başarılıysa saveState ve update3DScene çağrılabilir (pointerUp'ta)
    }
    // --- YENİ CTRL+DRAG SONU ---


    // Orijinal veya kopyalanmış kolonun state'ini kaydet
    state.preDragNodeStates.set('center_x', effectiveColumn.center.x);
    state.preDragNodeStates.set('center_y', effectiveColumn.center.y);
    state.preDragNodeStates.set('width', effectiveColumn.width || effectiveColumn.size);
    state.preDragNodeStates.set('height', effectiveColumn.height || effectiveColumn.size);
    state.preDragNodeStates.set('rotation', effectiveColumn.rotation || 0);
    // ... (hollow state'leri de kaydedin)
    state.preDragNodeStates.set('hollowWidth', effectiveColumn.hollowWidth || 0);
    state.preDragNodeStates.set('hollowHeight', effectiveColumn.hollowHeight || 0);
    state.preDragNodeStates.set('hollowOffsetX', effectiveColumn.hollowOffsetX || 0);
    state.preDragNodeStates.set('hollowOffsetY', effectiveColumn.hollowOffsetY || 0);


    let startPointForDragging;
    let dragOffset = { x: 0, y: 0 };
    let additionalState = { columnRotationOffset: null };

    // İşlemleri 'effectiveColumn' üzerinden yap
    if (selectedObject.handle === 'body' || selectedObject.handle === 'center') {
        startPointForDragging = { x: pos.x, y: pos.y };
        dragOffset = {
            x: effectiveColumn.center.x - pos.x,
            y: effectiveColumn.center.y - pos.y
        };
    } else if (selectedObject.handle.startsWith('corner_')) {
        // Döndürme
        startPointForDragging = { x: effectiveColumn.center.x, y: effectiveColumn.center.y };
        const initialAngle = Math.atan2(pos.y - effectiveColumn.center.y, pos.x - effectiveColumn.center.x);
        const initialRotationRad = (effectiveColumn.rotation || 0) * Math.PI / 180;
        additionalState.columnRotationOffset = initialRotationRad - initialAngle;
    } else {
        // Kenar (boyutlandırma)
        startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
    }

    return { startPointForDragging, dragOffset, additionalState };
}


/**
 * Seçili bir kolonu sürüklerken çağrılır.
 * (pointer-move.js'ten taşındı)
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    // Sürüklenen nesne state.selectedObject.object altında güncel olmalı (kopyalanmışsa kopya, değilse orijinal)
    const column = state.selectedObject.object;
    const handle = state.selectedObject.handle;

    if (handle.startsWith('corner_')) {
        // Döndürme
        const center = column.center;
        const mouseAngle = Math.atan2(unsnappedPos.y - center.y, unsnappedPos.x - center.x);
        let newRotationRad = mouseAngle + state.columnRotationOffset;

        // Snap
        const snapAngleRad1 = (1 * Math.PI / 180);
        newRotationRad = Math.round(newRotationRad / snapAngleRad1) * snapAngleRad1;
        let newRotationDeg = newRotationRad * 180 / Math.PI;
        const remainder = newRotationDeg % 90;
        const snapThreshold = 5;
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
        }
        column.rotation = newRotationDeg;

    } else if (handle === 'body' || handle === 'center') {
        // Taşıma
        let newCenterX = unsnappedPos.x + state.dragOffset.x;
        let newCenterY = unsnappedPos.y + state.dragOffset.y;

        // Duvar merkezine snap
        const snappedWallInfo = getSnappedWallInfo({ x: newCenterX, y: newCenterY });
        if (snappedWallInfo) {
             column.rotation = snappedWallInfo.angle;
             const wall = snappedWallInfo.wall; const p1 = wall.p1; const p2 = wall.p2;
              if (p1 && p2) { // p1 ve p2 kontrolü eklendi
                 const dx = p2.x - p1.x; const dy = p2.y - p1.y; const l2 = dx*dx + dy*dy;
                 if (l2 > 0.1) {
                     const t = ((newCenterX - p1.x) * dx + (newCenterY - p1.y) * dy) / l2;
                     newCenterX = p1.x + t * dx;
                     newCenterY = p1.y + t * dy;
                 }
              }
        } else if ((column.rotation || 0) === 0) {
            // 3-nokta snap (sadece 0 dereceyken)
            const SNAP_DISTANCE = 10;
            let bestSnapX = { diff: SNAP_DISTANCE, delta: 0 };
            let bestSnapY = { diff: SNAP_DISTANCE, delta: 0 };
            const halfW = (column.width || column.size) / 2;
            const dragEdgesX = [newCenterX - halfW, newCenterX, newCenterX + halfW];
            const halfH = (column.height || column.size) / 2;
            const dragEdgesY = [newCenterY - halfH, newCenterY, newCenterY + halfH];

            state.walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;
                const isVertical = Math.abs(wall.p1.x - wall.p2.x) < 0.1;
                const isHorizontal = Math.abs(wall.p1.y - wall.p2.y) < 0.1;

                if (isVertical) {
                    const wallX = wall.p1.x;
                    for (const dX of dragEdgesX) {
                        const diff = Math.abs(dX - wallX);
                        if (diff < bestSnapX.diff) bestSnapX = { diff, delta: wallX - dX };
                    }
                } else if (isHorizontal) {
                    const wallY = wall.p1.y;
                    for (const dY of dragEdgesY) {
                        const diff = Math.abs(dY - wallY);
                        if (diff < bestSnapY.diff) bestSnapY = { diff, delta: wallY - dY };
                    }
                }
            });
            if (bestSnapX.delta !== 0) newCenterX += bestSnapX.delta;
            if (bestSnapY.delta !== 0) newCenterY += bestSnapY.delta;
        }

        column.center.x = newCenterX;
        column.center.y = newCenterY;

    } else if (handle.startsWith('edge_')) {
        // Boyutlandırma
        const isAltPressed = currentModifierKeys.alt;
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

         const initialCorners = getColumnCorners({
             center: { x: initialCenterX, y: initialCenterY },
             width: initialWidth,
             height: initialHeight,
             rotation: column.rotation || 0
         });

         let fixedPoint1, fixedPoint2;
         if (fixedEdgeHandle === 'edge_top') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[1]; }
         else if (fixedEdgeHandle === 'edge_bottom') { fixedPoint1 = initialCorners[3]; fixedPoint2 = initialCorners[2]; }
         else if (fixedEdgeHandle === 'edge_left') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[3]; }
         else if (fixedEdgeHandle === 'edge_right') { fixedPoint1 = initialCorners[1]; fixedPoint2 = initialCorners[2]; }
         const fixedEdgeMidPoint = { x: (fixedPoint1.x + fixedPoint2.x) / 2, y: (fixedPoint1.y + fixedPoint2.y) / 2 };

         const rotRad = (column.rotation || 0) * Math.PI / 180;
         const cosRot = Math.cos(rotRad);
         const sinRot = Math.sin(rotRad);
         let axisVector;
         if (handle === 'edge_top' || handle === 'edge_bottom') {
             axisVector = { x: -sinRot, y: cosRot };
         } else {
             axisVector = { x: cosRot, y: sinRot };
         }

         const mouseVec = { x: snappedPos.x - fixedEdgeMidPoint.x, y: snappedPos.y - fixedEdgeMidPoint.y };
         const projection = mouseVec.x * axisVector.x + mouseVec.y * axisVector.y;
         let newSize = Math.max(10, Math.abs(projection));

         const halfSizeVector = { x: axisVector.x * projection / 2, y: axisVector.y * projection / 2 };
         const newCenterX = fixedEdgeMidPoint.x + halfSizeVector.x;
         const newCenterY = fixedEdgeMidPoint.y + halfSizeVector.y;

         if (handle === 'edge_top' || handle === 'edge_bottom') {
             column.height = newSize;
             column.size = Math.max(column.width || initialWidth, newSize);
         } else {
             column.width = newSize;
             column.size = Math.max(newSize, column.height || initialHeight);
         }
        column.center.x = newCenterX;
        column.center.y = newCenterY;
        column.hollowWidth = 0; column.hollowHeight = 0; column.hollowOffsetX = 0; column.hollowOffsetY = 0;
    }

    update3DScene();
}

/**
 * Bir noktanın duvara snap olup olmadığını ve açısını kontrol eder.
 * (pointer-move.js'ten taşındı)
 * @param {object} point - {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object | null} - { wall, angle } veya null
 */
function getSnappedWallInfo(point, tolerance = 1.0) {
    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue;
        const distSq = distToSegmentSquared(point, wall.p1, wall.p2);
        if (distSq < tolerance * tolerance) {
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const roundedAngle = Math.round(angle / 15) * 15;
            return { wall: wall, angle: roundedAngle };
        }
    }
    return null;
}