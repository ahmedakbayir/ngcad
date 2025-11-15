// ahmedakbayir/ngcad/valve-pointer-handlers.js
// Boru üzerindeki vana taşıma işlevselliği

import { state, setState } from '../general-files/main.js';
import { getValveMovementLimits } from './plumbing-pipes.js';

/**
 * Vana pointer down handler
 */
export function onValvePointerDown(selectedObject, pos, snappedPos, e) {
    const valve = selectedObject.object;
    const pipe = selectedObject.pipe;

    // Vananın başlangıç pozisyonunu kaydet
    const dragState = {
        type: 'valve',
        valve: valve,
        pipe: pipe,
        startPos: { ...pos },
        startValvePos: valve.pos
    };

    setState({ dragState });

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * Vana pointer move handler
 * Vana boru boyunca taşınır, baştan ve sondan 1 cm mesafe kontrolü
 */
export function onValvePointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'valve') return false;

    const { valve, pipe, startPos, startValvePos } = dragState;

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

    // Vananın yeni pozisyonu
    let newPos = projectionLength;

    // Hareket sınırlarını al (1 cm kenar boşluğu)
    const limits = getValveMovementLimits(pipe, valve);
    
    // Sınırlar içinde tut
    newPos = Math.max(limits.minPos, Math.min(limits.maxPos, newPos));

    // Diğer vanalarla çakışma kontrolü
    const valveWidth = valve.width || 12;
    const valveStart = newPos - valveWidth / 2;
    const valveEnd = newPos + valveWidth / 2;

    let hasCollision = false;
    for (const otherValve of pipe.valves) {
        if (otherValve === valve) continue;

        const otherStart = otherValve.pos - (otherValve.width || 12) / 2;
        const otherEnd = otherValve.pos + (otherValve.width || 12) / 2;

        // Çakışma var mı?
        if (!(valveEnd <= otherStart || valveStart >= otherEnd)) {
            hasCollision = true;
            break;
        }
    }

    // Çakışma yoksa pozisyonu güncelle
    if (!hasCollision) {
        valve.pos = newPos;
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