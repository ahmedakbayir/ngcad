// ahmedakbayir/ngcad/ngcad-36d2e95fa4df91f140572e4119169d6a11aeaa8b/beams.js
// YENİ DOSYA (columns.js'den kopyalandı ve düzenlendi)

import { distToSegmentSquared } from '../draw/geometry.js';
import { state, setState } from '../general-files/main.js'; // setState import edin
import { currentModifierKeys } from '../general-files/input.js';

// Kiriş nesnesi oluşturur
export function createBeam(centerX, centerY, width, height, rotation) {
    return {
        type: 'beam',
        center: { x: centerX, y: centerY },
        width: width, // Kullanıcının çizdiği uzunluk
        height: height, // Duvar kalınlığından gelen en
        depth: 20, // 3D yükseklik
        rotation: rotation, // Hesaplanan açı
        hollowWidth: 0,
        hollowHeight: 0,
        hollowOffsetX: 0,
        hollowOffsetY: 0,
        floorId: state.currentFloor?.id
    };
}

// Kirişin dünya koordinatlarındaki köşe noktalarını hesaplar
export function getBeamCorners(beam) {
    const halfWidth = (beam.width || 0) / 2;
    const halfHeight = (beam.height || 0) / 2;
    const cx = beam.center.x;
    const cy = beam.center.y;
    const rot = (beam.rotation || 0) * Math.PI / 180;

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

// Verilen noktanın, kirişin hangi kenarına veya köşesine denk geldiğini belirler.
export function getBeamHandleAtPoint(point, beam, tolerance) {
    const cx = beam.center.x;
    const cy = beam.center.y;

    // 1. Köşeleri Kontrol Et
    const corners = getBeamCorners(beam);
    const cornerTolerance = tolerance * 1.5;
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) {
            return `corner_${i}`;
        }
    }

    // 2. Kenarları Kontrol Et
    const rot = -(beam.rotation || 0) * Math.PI / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (beam.width || 0) / 2;
    const halfHeight = (beam.height || 0) / 2;

    if (Math.abs(localY + halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_top';
    if (Math.abs(localY - halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_bottom';
    if (Math.abs(localX + halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_left';
    if (Math.abs(localX - halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_right';

    return null;
}

// Verilen noktada hangi nesnenin (kiriş, kenar, köşe, gövde) olduğunu belirler
export function getBeamAtPoint(point) {
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    // Sadece aktif kata ait kirişleri filtrele
    const beams = (state.beams || []).filter(b => !currentFloorId || !b.floorId || b.floorId === currentFloorId);
    const handleTolerance = 8 / zoom;

    for (const beam of [...beams].reverse()) {
        const handle = getBeamHandleAtPoint(point, beam, handleTolerance);
        if (handle) {
            return { type: 'beam', object: beam, handle: handle };
        }
    }

    for (const beam of [...beams].reverse()) {
        if (isPointInBeam(point, beam)) {
            return { type: 'beam', object: beam, handle: 'body' };
        }
    }
    return null;
}

// Noktanın kiriş içinde olup olmadığını kontrol eder
export function isPointInBeam(point, beam) {
    const cx = beam.center.x;
    const cy = beam.center.y;
    const rot = (beam.rotation || 0) * Math.PI / 180;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (beam.width || 0) / 2;
    const halfHeight = (beam.height || 0) / 2;
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
}

/**
 * Bir kiriş seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen kiriş nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {Event} e - PointerDown olayı
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset, additionalState }
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) { // 'e' event objesini ekleyin
    const beam = selectedObject.object;

    // --- YENİ CTRL+DRAG KOPYALAMA ---
    const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey && selectedObject.handle === 'body';
    let effectiveBeam = beam;

    if (isCopying) {
        const newBeam = JSON.parse(JSON.stringify(beam));
        newBeam.floorId = state.currentFloor?.id; // Aktif kata ata
        state.beams = state.beams || []; // beams dizisi yoksa oluştur
        state.beams.push(newBeam);
        effectiveBeam = newBeam;
        setState({ selectedObject: { ...selectedObject, object: newBeam } });
        // Kopyalama sonrası işlem başarılıysa saveState ve update3DScene çağrılabilir (pointerUp'ta)
    }
    // --- YENİ CTRL+DRAG SONU ---

    state.preDragNodeStates.set('center_x', effectiveBeam.center.x);
    state.preDragNodeStates.set('center_y', effectiveBeam.center.y);
    state.preDragNodeStates.set('width', effectiveBeam.width || 0);
    state.preDragNodeStates.set('height', effectiveBeam.height || 0);
    state.preDragNodeStates.set('rotation', effectiveBeam.rotation || 0);
    // ... (hollow state'leri)
    state.preDragNodeStates.set('hollowWidth', effectiveBeam.hollowWidth || 0);
    state.preDragNodeStates.set('hollowHeight', effectiveBeam.hollowHeight || 0);
    state.preDragNodeStates.set('hollowOffsetX', effectiveBeam.hollowOffsetX || 0);
    state.preDragNodeStates.set('hollowOffsetY', effectiveBeam.hollowOffsetY || 0);


    let startPointForDragging;
    let dragOffset = { x: 0, y: 0 };
    let additionalState = { columnRotationOffset: null }; // Kiriş için de aynı değişken adını kullanalım

    // İşlemleri 'effectiveBeam' üzerinden yap
    if (selectedObject.handle === 'body' || selectedObject.handle === 'center') {
        startPointForDragging = { x: pos.x, y: pos.y };
        dragOffset = {
            x: effectiveBeam.center.x - pos.x,
            y: effectiveBeam.center.y - pos.y
        };
    } else if (selectedObject.handle.startsWith('corner_')) {
        // Döndürme
        startPointForDragging = { x: effectiveBeam.center.x, y: effectiveBeam.center.y };
        const initialAngle = Math.atan2(pos.y - effectiveBeam.center.y, pos.x - effectiveBeam.center.x);
        const initialRotationRad = (effectiveBeam.rotation || 0) * Math.PI / 180;
        additionalState.columnRotationOffset = initialRotationRad - initialAngle; // columnRotationOffset kullanılıyor
    } else {
        // Kenar (boyutlandırma)
        startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
    }

    return { startPointForDragging, dragOffset, additionalState };
}

/**
 * Seçili bir kirişi sürüklerken çağrılır.
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const beam = state.selectedObject.object; // Kopyalanmışsa güncel beam burada
    const handle = state.selectedObject.handle;

    if (handle.startsWith('corner_')) {
        // Döndürme
        const center = beam.center;
        const mouseAngle = Math.atan2(unsnappedPos.y - center.y, unsnappedPos.x - center.x);
        let newRotationRad = mouseAngle + state.columnRotationOffset; // columnRotationOffset kullanılıyor

        const snapAngleRad1 = (1 * Math.PI / 180);
        newRotationRad = Math.round(newRotationRad / snapAngleRad1) * snapAngleRad1;
        let newRotationDeg = newRotationRad * 180 / Math.PI;
        const remainder = newRotationDeg % 90;
        const snapThreshold = 5;
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
        }
        beam.rotation = newRotationDeg;

    } else if (handle === 'body' || handle === 'center') {
        // Taşıma
        let newCenterX = unsnappedPos.x + state.dragOffset.x;
        let newCenterY = unsnappedPos.y + state.dragOffset.y;

        // Duvar merkezine snap
        const snappedWallInfo = getSnappedWallInfo({ x: newCenterX, y: newCenterY });
        if (snappedWallInfo) {
             beam.rotation = snappedWallInfo.angle;
             const wall = snappedWallInfo.wall; const p1 = wall.p1; const p2 = wall.p2;
             if(p1 && p2){ // p1, p2 kontrolü
                 const dx = p2.x - p1.x; const dy = p2.y - p1.y; const l2 = dx*dx + dy*dy;
                 if (l2 > 0.1) {
                     const t = ((newCenterX - p1.x) * dx + (newCenterY - p1.y) * dy) / l2;
                     newCenterX = p1.x + t * dx;
                     newCenterY = p1.y + t * dy;
                 }
             }
        } else if ((beam.rotation || 0) === 0) {
            // 3-nokta snap (sadece 0 dereceyken)
            const SNAP_DISTANCE = 10;
            let bestSnapX = { diff: SNAP_DISTANCE, delta: 0 };
            let bestSnapY = { diff: SNAP_DISTANCE, delta: 0 };
            const halfW = (beam.width || 0) / 2;
            const dragEdgesX = [newCenterX - halfW, newCenterX, newCenterX + halfW];
            const halfH = (beam.height || 0) / 2;
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

        beam.center.x = newCenterX;
        beam.center.y = newCenterY;

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

         const initialCorners = getBeamCorners({
             center: { x: initialCenterX, y: initialCenterY },
             width: initialWidth,
             height: initialHeight,
             rotation: beam.rotation || 0
         });

         let fixedPoint1, fixedPoint2;
         if (fixedEdgeHandle === 'edge_top') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[1]; }
         else if (fixedEdgeHandle === 'edge_bottom') { fixedPoint1 = initialCorners[3]; fixedPoint2 = initialCorners[2]; }
         else if (fixedEdgeHandle === 'edge_left') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[3]; }
         else if (fixedEdgeHandle === 'edge_right') { fixedPoint1 = initialCorners[1]; fixedPoint2 = initialCorners[2]; }
         const fixedEdgeMidPoint = { x: (fixedPoint1.x + fixedPoint2.x) / 2, y: (fixedPoint1.y + fixedPoint2.y) / 2 };

         const rotRad = (beam.rotation || 0) * Math.PI / 180;
         const cosRot = Math.cos(rotRad);
         const sinRot = Math.sin(rotRad);
         let axisVector;
         if (handle === 'edge_top' || handle === 'edge_bottom') {
             axisVector = { x: -sinRot, y: cosRot }; // Y ekseni (height)
         } else {
             axisVector = { x: cosRot, y: sinRot }; // X ekseni (width)
         }

         const mouseVec = { x: snappedPos.x - fixedEdgeMidPoint.x, y: snappedPos.y - fixedEdgeMidPoint.y };
         const projection = mouseVec.x * axisVector.x + mouseVec.y * axisVector.y;
         let newSize = Math.max(10, Math.abs(projection));

         const halfSizeVector = { x: axisVector.x * projection / 2, y: axisVector.y * projection / 2 };
         const newCenterX = fixedEdgeMidPoint.x + halfSizeVector.x;
         const newCenterY = fixedEdgeMidPoint.y + halfSizeVector.y;

         if (handle === 'edge_top' || handle === 'edge_bottom') {
             beam.height = newSize; // 'height' (en) değişti
         } else {
             beam.width = newSize; // 'width' (uzunluk) değişti
         }
        beam.center.x = newCenterX;
        beam.center.y = newCenterY;
        beam.hollowWidth = 0; beam.hollowHeight = 0; beam.hollowOffsetX = 0; beam.hollowOffsetY = 0;
    }

}

/**
 * Bir noktanın duvara snap olup olmadığını ve açısını kontrol eder.
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