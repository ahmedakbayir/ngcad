import { state, setState } from '../general-files/main.js';
import { getPlumbingBlockAtPoint, getConnectionPoints } from './plumbing-blocks.js';

/**
 * TESİSAT BORULARI - Tesisat nesnelerini birbirine bağlayan borular
 *
 * Özellikler:
 * - Mouse ile tıklanarak çizilir
 * - Bağlantı noktalarına snap olur
 * - Klavyeden uzunluk girilebilir
 * - Kalın çizgi olarak gösterilir
 */

// Boru tipi tanımları
export const PLUMBING_PIPE_TYPES = {
    STANDARD: {
        id: 'standard',
        name: 'Standart Boru',
        diameter: 2,        // 2 cm çap
        color: 0x4885e8,    // Mavi (#4885e8)
        lineWidth: 6,       // 2D çizgi kalınlığı (piksel) - 2 kat kalın
    },
    THICK: {
        id: 'thick',
        name: 'Kalın Boru',
        diameter: 4,        // 4 cm çap
        color: 0x4885e8,    // Mavi (#4885e8)
        lineWidth: 10,      // 2D çizgi kalınlığı (piksel)
    }
};

/**
 * Yeni boru segmenti oluşturur
 * @param {number} x1 - Başlangıç X koordinatı
 * @param {number} y1 - Başlangıç Y koordinatı
 * @param {number} x2 - Bitiş X koordinatı
 * @param {number} y2 - Bitiş Y koordinatı
 * @param {string} pipeType - Boru tipi (STANDARD, THICK)
 * @returns {object} - Yeni boru nesnesi
 */
export function createPlumbingPipe(x1, y1, x2, y2, pipeType = 'STANDARD') {
    const typeConfig = PLUMBING_PIPE_TYPES[pipeType];

    if (!typeConfig) {
        console.error(`Geçersiz boru tipi: ${pipeType}`);
        return null;
    }

    return {
        type: 'plumbingPipe',
        pipeType: pipeType,
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        floorId: state.currentFloor?.id,
        typeConfig: typeConfig,
        // Bağlantı bilgileri (opsiyonel)
        connections: {
            start: null, // { blockId, connectionIndex }
            end: null    // { blockId, connectionIndex }
        },
        // Kesikli çizgi kontrolü için
        isConnectedToValve: false, // Eğer false ise kesikli çizilir
    };
}

/**
 * Noktanın boru üzerinde olup olmadığını kontrol eder
 * @param {object} point - Test edilecek nokta {x, y}
 * @param {object} pipe - Boru nesnesi
 * @param {number} tolerance - Tolerans mesafesi
 * @returns {boolean}
 */
export function isPointOnPipe(point, pipe, tolerance = 5) {
    const { p1, p2 } = pipe;

    // Segment uzunluğu
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq < 0.01) return false; // Çok kısa segment

    // Parametrik pozisyon (0-1 arası)
    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    // En yakın nokta
    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;

    // Mesafe kontrolü
    const distSq = (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
    return distSq < tolerance * tolerance;
}

/**
 * Bağlantı noktasına snap mesafesini hesaplar
 * @param {object} point - Kontrol edilecek nokta
 * @param {number} tolerance - Snap toleransı
 * @returns {object|null} - Snap noktası veya null
 */
export function snapToConnectionPoint(point, tolerance = 10) {
    const currentFloorId = state.currentFloor?.id;
    const blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);

    let closestSnap = null;
    let minDist = tolerance;

    for (const block of blocks) {
        const connections = getConnectionPoints(block);

        for (let i = 0; i < connections.length; i++) {
            const cp = connections[i];
            const dist = Math.hypot(point.x - cp.x, point.y - cp.y);

            if (dist < minDist) {
                minDist = dist;
                closestSnap = {
                    x: cp.x,
                    y: cp.y,
                    block: block,
                    connectionIndex: i,
                    label: cp.label
                };
            }
        }
    }

    return closestSnap;
}

/**
 * Tıklanan noktada boru bulur
 * @param {object} point - Tıklanan nokta
 * @param {number} tolerance - Seçim toleransı
 * @returns {object|null} - Bulunan boru veya null
 */
export function getPipeAtPoint(point, tolerance = 8) {
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    console.log('🔍 getPipeAtPoint called:', {
        point,
        tolerance,
        totalPipes: state.plumbingPipes?.length || 0,
        currentFloorPipes: pipes.length,
        currentFloorId
    });

    // Ters sırada kontrol et (en son eklenen önce)
    for (const pipe of [...pipes].reverse()) {
        if (isPointOnPipe(point, pipe, tolerance)) {
            // Uç noktalara mı yakın?
            const distP1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y);
            const distP2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y);

            if (distP1 < tolerance) {
                return { object: pipe, handle: 'p1' };
            } else if (distP2 < tolerance) {
                return { object: pipe, handle: 'p2' };
            } else {
                return { object: pipe, handle: 'body' };
            }
        }
    }

    return null;
}

/**
 * Seçili boruyu siler
 * @param {object} pipe - Silinecek boru
 * @returns {boolean} - Silme başarılı mı?
 */
export function deletePlumbingPipe(pipe) {
    const index = state.plumbingPipes?.indexOf(pipe);
    if (index !== undefined && index > -1) {
        state.plumbingPipes.splice(index, 1);
        return true;
    }
    return false;
}

/**
 * Boru pointer down handler
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) {
    const pipe = selectedObject.object;
    const handle = selectedObject.handle;

    const dragState = {
        type: 'plumbingPipe',
        pipe: pipe,
        handle: handle,
        startPos: { ...pos },
        startP1: { ...pipe.p1 },
        startP2: { ...pipe.p2 }
    };

    setState({ dragState });

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * Boru pointer move handler
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingPipe') return false;

    const { pipe, handle, startPos, startP1, startP2 } = dragState;
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;

    if (handle === 'p1') {
        // Başlangıç noktasını taşı
        pipe.p1.x = startP1.x + dx;
        pipe.p1.y = startP1.y + dy;

        // Bağlantı noktasına snap
        const snap = snapToConnectionPoint(pipe.p1);
        if (snap) {
            pipe.p1.x = snap.x;
            pipe.p1.y = snap.y;
        }
        return true;
    } else if (handle === 'p2') {
        // Bitiş noktasını taşı
        pipe.p2.x = startP2.x + dx;
        pipe.p2.y = startP2.y + dy;

        // Bağlantı noktasına snap
        const snap = snapToConnectionPoint(pipe.p2);
        if (snap) {
            pipe.p2.x = snap.x;
            pipe.p2.y = snap.y;
        }
        return true;
    } else if (handle === 'body') {
        // Tüm boruyu taşı
        pipe.p1.x = startP1.x + dx;
        pipe.p1.y = startP1.y + dy;
        pipe.p2.x = startP2.x + dx;
        pipe.p2.y = startP2.y + dy;
        return true;
    }

    return false;
}
