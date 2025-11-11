import { state, setState } from '../general-files/main.js';

/**
 * TESİSAT BLOKLARI - SABĐT BOYUTLU MĐMARĐ ELEMANLAR
 *
 * 5 Temel Tesisat Bloğu:
 * 1. Servis Kutusu - Tek bağlantı noktalı
 * 2. Sayaç - Çift bağlantı noktalı (giriş-çıkış)
 * 3. Vana - Çift bağlantı noktalı
 * 4. Kombi - Tek bağlantı noktalı, duvara monte
 * 5. Ocak - Tek bağlantı noktalı, zemine oturur
 */

// Blok tipi tanımları ve sabit boyutları
export const PLUMBING_BLOCK_TYPES = {
    SERVIS_KUTUSU: {
        id: 'servis-kutusu',
        name: 'Servis Kutusu',
        // 3D boyutlar (cm) - 20x40x70
        width: 40,      // duvar boyunca (X ekseni)
        height: 20,     // duvardan dışa çıkan (2D Y ekseni, 3D Z ekseni)
        depth: 70,      // yükseklik (3D Y ekseni) - duvara dik yükseliş
        cornerRadius: 2, // 2 cm yuvarlama
        // Bağlantı noktası (merkeze göre offset)
        connectionPoints: [
            { x: 20, y: 0, z: -15, label: 'çıkış' } // Sağda ortada, yerden -15 cm
        ],
        mountType: 'wall', // duvara monte
        color: 0xA8A8A8, // Gri ton
    },
    SAYAC: {
        id: 'sayac',
        name: 'Sayaç',
        // 3D boyutlar (cm) - 15x30x30
        width: 30,      // duvar boyunca (X ekseni)
        height: 15,     // duvardan dışa çıkan (2D Y ekseni, 3D Z ekseni)
        depth: 30,      // yükseklik (3D Y ekseni)
        cornerRadius: 2, // 2 cm yuvarlama
        connectionPoints: [
            { x: -10, y: 7.5, z: 15, label: 'giriş' },   // Sol üst, yerden 15 cm
            { x: 10, y: 7.5, z: 15, label: 'çıkış' }      // Sağ üst, yerden 15 cm
        ],
        mountType: 'wall',
        color: 0xA8A8A8, // Gri ton
    },
    VANA: {
        id: 'vana',
        name: 'Vana',
        width: 10,      // Birleşik uzunluk
        height: 5,      // Geniş çap
        depth: 5,
        cornerRadius: 1,
        connectionPoints: [
            { x: -5, y: 0, z: 2.5, label: 'giriş' },  // Sol taraf, orta yükseklikte
            { x: 5, y: 0, z: 2.5, label: 'çıkış' }    // Sağ taraf, orta yükseklikte
        ],
        mountType: 'free', // Serbest yerleşim
        color: 0xA0A0A0,
        shape: 'doubleConeFrustum' // Özel şekil
    },
    KOMBI: {
        id: 'kombi',
        name: 'Kombi',
        width: 41,
        height: 72,
        depth: 29,
        cornerRadius: 2,
        connectionPoints: [
            { x: 0, y: -36, z: 10, label: 'bağlantı' } // Alt ortada, yerden 10 cm yukarıda
        ],
        mountType: 'wall',
        color: 0xC0C0C0, // Gri renk (beyaz yerine)
    },
    OCAK: {
        id: 'ocak',
        name: 'Ocak',
        width: 52,
        height: 60,
        depth: 59,
        cornerRadius: 2,
        connectionPoints: [
            { x: 0, y: 0, z: 10, label: 'bağlantı' } // Arkada ortada, yerden 10 cm yukarıda
        ],
        mountType: 'floor', // Zemine oturur
        color: 0x303030,
    }
};

/**
 * Yeni tesisat bloğu oluşturur
 */
export function createPlumbingBlock(centerX, centerY, blockType = 'SERVIS_KUTUSU') {
    const typeConfig = PLUMBING_BLOCK_TYPES[blockType];

    if (!typeConfig) {
        console.error(`Geçersiz blok tipi: ${blockType}`);
        return null;
    }

    return {
        type: 'plumbingBlock',
        blockType: blockType,
        center: { x: centerX, y: centerY },
        rotation: 0, // Derece cinsinden
        floorId: state.currentFloor?.id,
        // Tip bilgisini sakla
        typeConfig: typeConfig
    };
}

/**
 * Bloğun köşe noktalarını hesaplar (2D için)
 */
export function getPlumbingBlockCorners(block) {
    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const halfW = typeConfig.width / 2;
    const halfH = typeConfig.height / 2;
    const cx = block.center.x;
    const cy = block.center.y;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Döndürülmemiş köşeler
    const corners = [
        { x: -halfW, y: -halfH },
        { x: halfW, y: -halfH },
        { x: halfW, y: halfH },
        { x: -halfW, y: halfH }
    ];

    // Rotasyon ve merkeze taşıma
    return corners.map(corner => ({
        x: cx + corner.x * cos - corner.y * sin,
        y: cy + corner.x * sin + corner.y * cos
    }));
}

/**
 * Bloğun bağlantı noktalarını hesaplar (dünya koordinatlarında)
 */
export function getConnectionPoints(block) {
    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const cx = block.center.x;
    const cy = block.center.y;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return typeConfig.connectionPoints.map(cp => ({
        x: cx + cp.x * cos - cp.y * sin,
        y: cy + cp.x * sin + cp.y * cos,
        label: cp.label
    }));
}

/**
 * Noktanın bloğun içinde olup olmadığını kontrol eder
 */
export function isPointInPlumbingBlock(point, block) {
    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const dx = point.x - block.center.x;
    const dy = point.y - block.center.y;
    const angle = -(block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Ters rotasyon uygula
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfW = typeConfig.width / 2;
    const halfH = typeConfig.height / 2;

    return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
}

/**
 * Tıklanan noktada blok ve handle bulur
 */
export function getPlumbingBlockAtPoint(point) {
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    const blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);
    const tolerance = 8 / zoom;

    console.log('🔍 getPlumbingBlockAtPoint called:', {
        point,
        tolerance,
        totalBlocks: state.plumbingBlocks?.length || 0,
        currentFloorBlocks: blocks.length,
        currentFloorId
    });

    // Önce handle'ları kontrol et
    for (const block of blocks) {
        const corners = getPlumbingBlockCorners(block);

        // Merkez handle
        const centerDist = Math.hypot(point.x - block.center.x, point.y - block.center.y);
        if (centerDist < tolerance) {
            return { object: block, handle: 'center' };
        }

        // Rotasyon handle (sağ üst köşeden biraz dışarıda)
        const rotateHandlePos = {
            x: corners[1].x + 20 / zoom,
            y: corners[1].y - 20 / zoom
        };
        const rotateDist = Math.hypot(point.x - rotateHandlePos.x, point.y - rotateHandlePos.y);
        if (rotateDist < tolerance) {
            return { object: block, handle: 'rotate' };
        }

        // Bağlantı noktaları
        const connectionPoints = getConnectionPoints(block);
        for (let i = 0; i < connectionPoints.length; i++) {
            const cp = connectionPoints[i];
            const cpDist = Math.hypot(point.x - cp.x, point.y - cp.y);
            if (cpDist < tolerance) {
                return { object: block, handle: `connection${i}`, connectionPoint: cp };
            }
        }

        // Köşe handle'ları
        for (let i = 0; i < corners.length; i++) {
            const corner = corners[i];
            const cornerDist = Math.hypot(point.x - corner.x, point.y - corner.y);
            if (cornerDist < tolerance) {
                return { object: block, handle: `corner${i}` };
            }
        }
    }

    // Hiç handle yoksa, body kontrolü
    for (const block of blocks) {
        if (isPointInPlumbingBlock(point, block)) {
            return { object: block, handle: 'body' };
        }
    }

    return null;
}

/**
 * Pointer down event handler
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) {
    const block = selectedObject.object;
    const handle = selectedObject.handle;

    // Başlangıç durumunu kaydet
    const dragState = {
        type: 'plumbingBlock',
        block: block,
        handle: handle,
        startPos: { ...pos },
        startCenter: { ...block.center },
        startRotation: block.rotation || 0
    };

    setState({ dragState });

    // CTRL ile kopyalama
    if (e.ctrlKey || e.metaKey) {
        const copy = createPlumbingBlock(block.center.x, block.center.y, block.blockType);
        copy.rotation = block.rotation;
        copy.typeConfig = block.typeConfig;

        if (!state.plumbingBlocks) state.plumbingBlocks = [];
        state.plumbingBlocks.push(copy);

        // Yeni kopyayı sürükle
        dragState.block = copy;
        setState({
            selectedObject: { object: copy, handle: 'center' },
            dragState
        });
    }

    // Return değeri - pointer-down.js için gerekli
    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * Pointer move event handler
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingBlock') return false;

    const { block, handle, startPos, startCenter, startRotation } = dragState;
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;

    if (handle === 'center' || handle === 'body') {
        // Taşıma
        block.center.x = startCenter.x + dx;
        block.center.y = startCenter.y + dy;
        return true;
    } else if (handle === 'rotate') {
        // Döndürme
        const angleToMouse = Math.atan2(
            unsnappedPos.y - block.center.y,
            unsnappedPos.x - block.center.x
        ) * 180 / Math.PI;

        block.rotation = Math.round(angleToMouse / 15) * 15; // 15 derece snap
        return true;
    }

    return false;
}

/**
 * Seçili bloğu siler
 */
export function deletePlumbingBlock(block) {
    const index = state.plumbingBlocks?.indexOf(block);
    if (index !== undefined && index > -1) {
        state.plumbingBlocks.splice(index, 1);
        return true;
    }
    return false;
}

/**
 * Blok tipine göre varsayılan rotasyon açısı
 * (Duvara monte edilenler için)
 */
export function getDefaultRotationForWall(wallAngle) {
    // Duvar açısına dik olacak şekilde yerleştir
    return Math.round((wallAngle + 90) / 15) * 15;
}
