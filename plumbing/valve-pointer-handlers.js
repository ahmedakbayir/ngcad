// ahmedakbayir/ngcad/valve-pointer-handlers.js
// Boru üzerindeki alt nesnelerin (vana, sayaç, vs.) taşıma işlevselliği
// GÜNCELLENDİ: subObjects desteği eklendi

import { state, setState } from '../general-files/main.js';
import { isSpaceForSubObject } from './plumbing-pipes.js';

/**
 * Alt nesne (vana, sayaç, vs.) pointer down handler
 * YENİ: Tüm subObject tipleri için çalışır
 */
export function onValvePointerDown(selectedObject, pos, snappedPos, e) {
    const subObj = selectedObject.object;
    const pipe = selectedObject.pipe;

    // Alt nesnenin başlangıç pozisyonunu kaydet
    const dragState = {
        type: selectedObject.type || 'valve', // 'valve' veya 'subObject'
        subType: selectedObject.subType, // VALVE, METER, SERVICE_BOX, vb.
        valve: subObj, // Backward compatibility için 'valve' adını koru
        object: subObj,
        pipe: pipe,
        startPos: { ...pos },
        startObjectPos: subObj.pos
    };

    setState({ dragState });

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * Alt nesne pointer move handler
 * Alt nesne boru boyunca taşınır, baştan ve sondan 1 cm mesafe kontrolü
 * YENİ: Tüm subObject tipleri için çalışır
 */
export function onValvePointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || (dragState.type !== 'valve' && dragState.type !== 'subObject')) return false;

    const { object, pipe, startPos, startObjectPos } = dragState;
    const subObj = object || dragState.valve; // Backward compatibility

    if (!subObj || !pipe) return false;

    // Boru vektörü
    const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
    if (pipeLength < 0.1) return false;

    const pipeDx = (pipe.p2.x - pipe.p1.x) / pipeLength;
    const pipeDy = (pipe.p2.y - pipe.p1.y) / pipeLength;

    // Mouse'un boru üzerindeki projeksiyonu
    const mouseDx = snappedPos.roundedX - pipe.p1.x;
    const mouseDy = snappedPos.roundedY - pipe.p1.y;

    // Dot product ile projeksiyon
    const projectionLength = mouseDx * pipeDx + mouseDy * pipeDy;

    // Alt nesnenin yeni pozisyonu
    let newPos = projectionLength;

    // Sınırlar içinde tut (1 cm kenar boşluğu)
    const MIN_MARGIN = 1;
    const objWidth = subObj.typeConfig?.width || subObj.width || 12;
    const minPos = MIN_MARGIN + objWidth / 2;
    const maxPos = pipeLength - MIN_MARGIN - objWidth / 2;

    newPos = Math.max(minPos, Math.min(maxPos, newPos));

    // Alan kontrolü - diğer alt nesnelerle çakışma var mı?
    if (isSpaceForSubObject(pipe, newPos, objWidth, subObj)) {
        subObj.pos = newPos;
        return true;
    }

    return false;
}

/**
 * Vana pointer up handler (opsiyonel - gerekirse eklenebilir)
 */
export function onValvePointerUp() {
    // Vana taşıma tamamlandı - gerekirse ek işlemler yapılabilir
    return true;
}