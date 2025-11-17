// ahmedakbayir/ngcad/architectural-objects/plumbing-blocks.js
// SON HALİ - ÇALIŞAN VERSİYON
// ✅ Bloklar asla kopmaz
// ✅ Mıknatıs etkisi yok
// ✅ Silinebilir ve birleştirir
// GÜNCELLENDİ: Servis Kutusu bağlantı noktaları kaldırıldı (kenara snap için)
// GÜNCELLENDİ: updateConnectedPipes/Rotation, pozisyona göre bağlı boruları da taşıyacak şekilde güncellendi

import { state, setState } from '../general-files/main.js';
import { cleanupVeryShortPipes } from './plumbing-pipes.js';
 
export const PLUMBING_BLOCK_TYPES = {
    SERVIS_KUTUSU: {
        id: 'servis-kutusu',
        name: 'Servis Kutusu',
        width: 40,
        height: 20,
        depth: 70,
        cornerRadius: 1,
        // GÜNCELLENDİ: Bağlantı noktaları kaldırıldı. Snap artık kenarlara yapılacak.
        connectionPoints: [],
        mountType: 'wall',
        color: 0xA8A8A8,
    },
    SAYAC: {
        id: 'sayac',
        name: 'Sayaç',
        width: 18,
        height: 18,
        depth: 40,
        cornerRadius: 0.5,
        connectionPoints: [
            { x: -5, y: -9-10, z: 30, label: 'giriş' },
            { x: 5, y: -9-10, z: 30, label: 'çıkış' }
        ],
        connectionLineLength: 10,
        mountType: 'wall',
        color: 0xA8A8A8,
    },
    VANA: {
        id: 'vana',
        name: 'Vana',
        width: 12,
        height: 6,
        depth: 6,
        cornerRadius: 1,
        connectionPoints: [
            { x: -6, y: 0, z: -2.50, label: 'giriş' },
            { x: 6, y: 0, z: -2.50, label: 'çıkış' }
        ],
        mountType: 'free',
        color: 0xA0A0A0,
        shape: 'doubleConeFrustum'
    },
    KOMBI: {
        id: 'kombi',
        name: 'Kombi',
        width: 50,
        height: 50,
        depth: 29,
        cornerRadius: 2,
        connectionPoints: [
            { x: -25, y: 0, z: 0, label: 'bağlantı' }
        ],
        mountType: 'wall',
        color: 0xC0C0C0,
    },
    OCAK: {
        id: 'ocak',
        name: 'Ocak',
        width: 50,
        height: 50,
        depth: 59,
        cornerRadius: 2,
        connectionPoints: [
            { x: -25, y: 0, z: 0, label: 'bağlantı' }
        ],
        mountType: 'floor',
        color: 0x303030,
    }
};

export function createPlumbingBlock(centerX, centerY, blockType = 'SERVIS_KUTUSU') {
    const typeConfig = PLUMBING_BLOCK_TYPES[blockType];

    if (!typeConfig) {
        console.error(`Geçersiz blok tipi: ${blockType}`);
        return null;
    }

    return {
        type: 'plumbingBlock',
        blockType: blockType,
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        center: { x: centerX, y: centerY },
        rotation: 0,
        floorId: state.currentFloor?.id,
        typeConfig: typeConfig
    };
}

export function getPlumbingBlockCorners(block) {
    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const halfW = typeConfig.width / 2;
    const halfH = typeConfig.height / 2;
    const cx = block.center.x;
    const cy = block.center.y;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const corners = [
        { x: -halfW, y: -halfH },
        { x: halfW, y: -halfH },
        { x: halfW, y: halfH },
        { x: -halfW, y: halfH }
    ];

    return corners.map(corner => ({
        x: cx + corner.x * cos - corner.y * sin,
        y: cy + corner.x * sin + corner.y * cos
    }));
}

export function getConnectionPoints(block) {
    // GÜNCELLENDİ: Servis kutusunun artık sabit bağlantı noktası yok
    if (block.blockType === 'SERVIS_KUTUSU') {
        return [];
    }
    // --- GÜNCELLEME SONU ---

    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const cx = block.center.x;
    const cy = block.center.y;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return typeConfig.connectionPoints.map((cp, index) => ({
        x: cx + cp.x * cos - cp.y * sin,
        y: cy + cp.x * sin + cp.y * cos,
        label: cp.label,
        index: index,
        z: cp.z
    }));
}

export function getActiveConnectionPoints(block) {
    const allPoints = getConnectionPoints(block);

    // GÜNCELLENDİ: Servis kutusu mantığı kaldırıldı (zaten boş array dönecek)
    if (block.blockType === 'SERVIS_KUTUSU') {
        return allPoints; // Boş array döner
    }

    return allPoints;
}

export function isPointInPlumbingBlock(point, block) {
    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const dx = point.x - block.center.x;
    const dy = point.y - block.center.y;
    const angle = -(block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfW = typeConfig.width / 2;
    const halfH = typeConfig.height / 2;

    return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
}

export function getPlumbingBlockAtPoint(point) {
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    const blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);
    const tolerance = 8 / zoom;

    for (const block of blocks) {
        const rotationHandleDistance = 30;
        const angle = (block.rotation || 0) * Math.PI / 180;
        const handleX = block.center.x + Math.sin(angle) * rotationHandleDistance;
        const handleY = block.center.y - Math.cos(angle) * rotationHandleDistance;

        const rotDist = Math.hypot(point.x - handleX, point.y - handleY);
        if (rotDist < tolerance) {
            return { type: 'plumbingBlock', object: block, handle: 'rotation' };
        }
    }

    for (const block of blocks) {
        const connectionPoints = getConnectionPoints(block); // Artık Servis Kutusu için boş
        for (let i = 0; i < connectionPoints.length; i++) {
            const cp = connectionPoints[i];
            const cpDist = Math.hypot(point.x - cp.x, point.y - cp.y);
            if (cpDist < tolerance) {
                return { type: 'plumbingBlock', object: block, handle: `connection${i}`, connectionPoint: cp };
            }
        }
    }

    for (const block of blocks) {
        if (isPointInPlumbingBlock(point, block)) {
            return { type: 'plumbingBlock', object: block, handle: 'body' };
        }
    }

    return null;
}



/**
 * ⭐ Eksik connections bilgilerini doldur
 */
function repairMissingConnections(block) {
    const connections = getConnectionPoints(block);
    const REPAIR_TOLERANCE = 2;

    console.log(`🔧 Repairing connections for ${block.blockType}...`);
    
    // GÜNCELLENDİ: Servis kutusunun bağlantı noktası yok, tamir etme
    if (block.blockType === 'SERVIS_KUTUSU') return;
    // --- GÜNCELLEME SONU ---

    (state.plumbingPipes || []).forEach(pipe => {
        // P1 kontrolü
        if (!pipe.connections?.start?.blockId) {
            for (let i = 0; i < connections.length; i++) {
                const dist = Math.hypot(pipe.p1.x - connections[i].x, pipe.p1.y - connections[i].y);
                if (dist < REPAIR_TOLERANCE) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.start = {
                        blockId: block.id || block,
                        connectionIndex: i,
                        blockType: block.blockType
                    };
                    console.log(`✅ Repaired P1 → ${block.blockType}[${i}]`);
                    break;
                }
            }
        }

        // P2 kontrolü
        if (!pipe.connections?.end?.blockId) {
            for (let i = 0; i < connections.length; i++) {
                const dist = Math.hypot(pipe.p2.x - connections[i].x, pipe.p2.y - connections[i].y);
                if (dist < REPAIR_TOLERANCE) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.end = {
                        blockId: block.id || block,
                        connectionIndex: i,
                        blockType: block.blockType
                    };
                    console.log(`✅ Repaired P2 → ${block.blockType}[${i}]`);
                    break;
                }
            }
        }
    });
}

function checkPipeValveLengthBeforeRotation(block, newRotation) {
    const tempBlock = { ...block, rotation: newRotation };
    const newConnections = getConnectionPoints(tempBlock);

    // GÜNCELLENDİ: Servis kutusunun bağlantı noktası yok, kontrol etme
    if (block.blockType === 'SERVIS_KUTUSU') return true;
    // --- GÜNCELLEME SONU ---

    const MIN_PIPE_LENGTH = 5;

    for (let index = 0; index < newConnections.length; index++) {
        const newConn = newConnections[index];

        for (const pipe of (state.plumbingPipes || [])) {
            let affectsP1 = false;
            let affectsP2 = false;

            // SADECE explicit bağlantıları kontrol et
            const isP1ConnectedToThisBlock = pipe.connections?.start?.blockId && (
                pipe.connections.start.blockId === block.id ||
                pipe.connections.start.blockId === block
            ) && pipe.connections.start.connectionIndex === index;

            const isP2ConnectedToThisBlock = pipe.connections?.end?.blockId && (
                pipe.connections.end.blockId === block.id ||
                pipe.connections.end.blockId === block
            ) && pipe.connections.end.connectionIndex === index;

            if (isP1ConnectedToThisBlock) {
                affectsP1 = true;
            }

            if (isP2ConnectedToThisBlock) {
                affectsP2 = true;
            }

            if (affectsP1 || affectsP2) {
                const newP1 = affectsP1 ? newConn : pipe.p1;
                const newP2 = affectsP2 ? newConn : pipe.p2;
                const newLength = Math.hypot(newP2.x - newP1.x, newP2.y - newP1.y);

                let minRequired = MIN_PIPE_LENGTH;

                if (pipe.valves && pipe.valves.length > 0) {
                    const totalValveLength = pipe.valves.reduce((sum, v) => sum + (v.width || 12), 0);
                    minRequired = totalValveLength + 2;
                }

                if (newLength < minRequired) {
                    console.warn(`Rotation blocked - pipe too short`);
                    return false;
                }
            }
        }
    }

    return true;
}

function checkPipeValveLengthBeforeMove(block, newCenter) {
    const tempBlock = { ...block, center: newCenter };
    const newConnections = getConnectionPoints(tempBlock);

    // GÜNCELLENDİ: Servis kutusunun bağlantı noktası yok, kontrol etme
    if (block.blockType === 'SERVIS_KUTUSU') return true;
    // --- GÜNCELLEME SONU ---

    for (let index = 0; index < newConnections.length; index++) {
        const newConn = newConnections[index];

        for (const pipe of (state.plumbingPipes || [])) {
            let affectsP1 = false;
            let affectsP2 = false;

            // SADECE explicit bağlantıları kontrol et
            const isP1ConnectedToThisBlock = pipe.connections?.start?.blockId && (
                pipe.connections.start.blockId === block.id ||
                pipe.connections.start.blockId === block
            ) && pipe.connections.start.connectionIndex === index;

            const isP2ConnectedToThisBlock = pipe.connections?.end?.blockId && (
                pipe.connections.end.blockId === block.id ||
                pipe.connections.end.blockId === block
            ) && pipe.connections.end.connectionIndex === index;

            if (isP1ConnectedToThisBlock) {
                affectsP1 = true;
            }

            if (isP2ConnectedToThisBlock) {
                affectsP2 = true;
            }

            if (affectsP1 || affectsP2) {
                if (pipe.valves && pipe.valves.length > 0) {
                    const newP1 = affectsP1 ? newConn : pipe.p1;
                    const newP2 = affectsP2 ? newConn : pipe.p2;
                    const newLength = Math.hypot(newP2.x - newP1.x, newP2.y - newP1.y);

                    const totalValveLength = pipe.valves.reduce((sum, v) => sum + (v.width || 12), 0);
                    const minRequired = totalValveLength + 2;

                    if (newLength < minRequired) {
                        console.warn(`Move blocked - pipe too short`);
                        return false;
                    }
                }
            }
        }
    }

    return true;
}


// plumbing-blocks.js içindeki GÜNCELLENMİŞ FONKSİYONLAR
// Hysteresis (yapışma-kopma eşiği) mekanizması eklendi

// ============================================
// 1. onPointerDown - Snap durumunu başlat
// ============================================
export function onPointerDown(selectedObject, pos, snappedPos, e) {
    const block = selectedObject.object;
    const handle = selectedObject.handle;
    let effectiveBlock = block;

    const isCopying = e.ctrlKey || e.metaKey;
    if (isCopying) {
        const copy = createPlumbingBlock(block.center.x, block.center.y, block.blockType);
        copy.rotation = block.rotation;
        copy.typeConfig = block.typeConfig;

        if (!state.plumbingBlocks) state.plumbingBlocks = [];
        state.plumbingBlocks.push(copy);

        effectiveBlock = copy;
        setState({
            selectedObject: { ...selectedObject, object: copy, handle: 'center' },
        });
    }

    // ⭐ TAŞIMA BAŞLAMADAN ÖNCE EKSİK BAĞLANTI BİLGİLERİNİ DOLDUR
    if (handle === 'body') {
        repairMissingConnections(effectiveBlock);
    }

    const dragState = {
        type: 'plumbingBlock',
        block: effectiveBlock,
        handle: handle,
        startPos: { ...pos },
        startCenter: { ...effectiveBlock.center },
        startRotation: effectiveBlock.rotation || 0,
        isSnapped: false, // GÜNCELLENDİ: Snap durumu takibi
        lastSnapType: null, // GÜNCELLENDİ: Son snap tipi
        lastSnapPoint: null // GÜNCELLENDİ: Son snap noktası
    };
    setState({ dragState });

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

// ============================================
// 2. onPointerMove - Hysteresis ile snap
// ============================================
export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingBlock') return false;

    const { block, handle, startPos, startCenter, startRotation } = dragState;
    
    const dx = unsnappedPos.x - startPos.x;
    const dy = unsnappedPos.y - startPos.y;

    if (handle === 'rotation') {
        const angleToMouse = Math.atan2(
            snappedPos.roundedX - block.center.x,
            -(snappedPos.roundedY - block.center.y)
        ) * 180 / Math.PI;

        const oldRotation = block.rotation || 0;
        const newRotation = Math.round(angleToMouse / 15) * 15;

        if (oldRotation !== newRotation) {
            if (!checkPipeValveLengthBeforeRotation(block, newRotation)) {
                return false;
            }

            block.rotation = newRotation;
            updateConnectedPipesAfterRotation(block, oldRotation, block.rotation);
        }

        return true;
        
    } else if (handle === 'body') {
        // GÜNCELLENDİ: Hysteresis mekanizması ile snap
        let targetX = startCenter.x + dx;
        let targetY = startCenter.y + dy;
        let useSnap = false;

        // Servis kutusu için snap mantığı
        if (block.blockType === 'SERVIS_KUTUSU') {
            // HYSTERESIS MANTĞI:
            // - Snap edilmemişse: Normal tolerans ile snap ara
            // - Snap edildiyse: 2x toleransta kal, yoksa kop
            
            const SNAP_ACTIVATE_THRESHOLD = 20; // Snap yakalamak için mesafe (dünya koordinatı)
            const SNAP_RELEASE_THRESHOLD = 40; // Snap'ten kopmak için mesafe (dünya koordinatı)
            
            if (snappedPos.isSnapped && 
                (snappedPos.snapType === 'PLUMBING_WALL_SURFACE' || 
                 snappedPos.snapType === 'PLUMBING_BLOCK_EDGE' ||
                 snappedPos.snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION' ||
                 snappedPos.snapType === 'PLUMBING_INTERSECTION')) {
                
                // Snap mevcut
                if (dragState.isSnapped && dragState.lastSnapPoint) {
                    // Zaten snap edilmişti - kopmak için daha uzağa git
                    const distToLastSnap = Math.hypot(
                        unsnappedPos.x - dragState.lastSnapPoint.x,
                        unsnappedPos.y - dragState.lastSnapPoint.y
                    );
                    
                    if (distToLastSnap < SNAP_RELEASE_THRESHOLD) {
                        // Hala yakın, snap'i koru
                        targetX = dragState.lastSnapPoint.x;
                        targetY = dragState.lastSnapPoint.y;
                        useSnap = true;
                        
                        // Rotasyonu da koru
                        if (dragState.lastSnapAngle !== undefined) {
                            block.rotation = dragState.lastSnapAngle;
                        }
                    } else {
                        // Kopma eşiği aşıldı
                        dragState.isSnapped = false;
                        dragState.lastSnapType = null;
                        dragState.lastSnapPoint = null;
                        dragState.lastSnapAngle = null;
                    }
                } else {
                    // İlk kez snap ediliyor
                    const distToNewSnap = Math.hypot(
                        unsnappedPos.x - snappedPos.x,
                        unsnappedPos.y - snappedPos.y
                    );
                    
                    if (distToNewSnap < SNAP_ACTIVATE_THRESHOLD) {
                        // Snap'i yakala
                        targetX = snappedPos.x;
                        targetY = snappedPos.y;
                        useSnap = true;
                        
                        // Snap durumunu kaydet
                        dragState.isSnapped = true;
                        dragState.lastSnapType = snappedPos.snapType;
                        dragState.lastSnapPoint = { x: snappedPos.x, y: snappedPos.y };
                        dragState.lastSnapAngle = snappedPos.snapAngle;
                        
                        // Snap açısını uygula
                        if (snappedPos.snapAngle !== undefined && 
                            (snappedPos.snapType === 'PLUMBING_WALL_SURFACE' ||
                             snappedPos.snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION' ||
                             snappedPos.snapType === 'PLUMBING_INTERSECTION')) {
                            block.rotation = snappedPos.snapAngle;
                        }
                    }
                }
            } else {
                // Snap mevcut değil
                if (dragState.isSnapped && dragState.lastSnapPoint) {
                    // Önceki snap'ten kopmak için kontrol
                    const distToLastSnap = Math.hypot(
                        unsnappedPos.x - dragState.lastSnapPoint.x,
                        unsnappedPos.y - dragState.lastSnapPoint.y
                    );
                    
                    if (distToLastSnap < SNAP_RELEASE_THRESHOLD) {
                        // Hala yakın, snap'i koru (manyetik etki)
                        targetX = dragState.lastSnapPoint.x;
                        targetY = dragState.lastSnapPoint.y;
                        useSnap = true;
                        
                        if (dragState.lastSnapAngle !== undefined) {
                            block.rotation = dragState.lastSnapAngle;
                        }
                    } else {
                        // Kopma eşiği aşıldı
                        dragState.isSnapped = false;
                        dragState.lastSnapType = null;
                        dragState.lastSnapPoint = null;
                        dragState.lastSnapAngle = null;
                    }
                }
            }
        }

        const newCenter = {
            x: targetX,
            y: targetY
        };

        if (!checkPipeValveLengthBeforeMove(block, newCenter)) {
            return false;
        }

        const oldCenter = { ...block.center };
        
        block.center.x = newCenter.x;
        block.center.y = newCenter.y;

        updateConnectedPipes(block, oldCenter, block.center);
        
        return true;
    }

    return false;
}


/**
 * GÜNCELLENMİŞ updateConnectedPipes
 * Artık SADECE explicit (connections objesi olan) bağlantıları değil,
 * FİZİKSEL YAKINLIK (Math.hypot) ile bağlı olan boruları da taşır.
 * Bu, 'SERVIS_KUTUSU'nun kenarına yapışan boruların da taşınmasını sağlar.
 */
function updateConnectedPipes(block, oldCenter, newCenter) {
    const newConnections = getConnectionPoints(block);
    // GÜNCELLENDİ: Eski bağlantı noktalarını da al (fiziksel yakınlık kontrolü için)
    const oldConnections = getConnectionPointsAtPosition(block, oldCenter); // oldCenter'ı kullanan helper lazım
    const REPAIR_TOLERANCE = 2; // Fiziksel yakınlık toleransı

    (state.plumbingPipes || []).forEach(pipe => {
        let shouldUpdateStart = false;
        let shouldUpdateEnd = false;
        let startIndex = null;
        let endIndex = null;

        // --- P1 KONTROLÜ ---
        // 1. Explicit bağlantı var mı?
        const isStartExplicitlyConnected = pipe.connections?.start?.blockId && (
            pipe.connections.start.blockId === block.id ||
            pipe.connections.start.blockId === block
        );

        if (isStartExplicitlyConnected) {
            startIndex = pipe.connections.start.connectionIndex;
            // GÜNCELLENDİ: Servis kutusu için index 0 olabilir ama newConnections[0] olmayabilir
            if (startIndex < newConnections.length) {
                shouldUpdateStart = true;
            }
        } else if (!pipe.connections?.start?.blockId) {
            // 2. Explicit bağlantı yoksa, fiziksel olarak eski bir bağlantı noktasına yakın mı?
            // (Sadece 'SERVIS_KUTUSU' gibi bağlantı noktası olmayanlar için)
            if (block.blockType === 'SERVIS_KUTUSU') {
                 // Servis kutusu için özel: Kenarlara yakınlığı kontrol et (daha karmaşık)
                 // Şimdilik: Bloğun merkeziyle hareket et
                 // VEYA: Eski merkezi kullanarak 'implicit' bağlantı ara
                 const oldCorners = getPlumbingBlockCorners({ ...block, center: oldCenter });
                 for(let i=0; i<oldCorners.length; i++) {
                     const edgeP1 = oldCorners[i];
                     const edgeP2 = oldCorners[(i+1)%4];
                     const distSq = distToSegmentSquared(pipe.p1, edgeP1, edgeP2);
                     if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                         shouldUpdateStart = true;
                         // Kenara bağlı, index yok
                         startIndex = -1; // Kenara bağlı olduğunu belirt
                         break;
                     }
                 }
            } else {
                // Diğer bloklar (Sayaç, Vana vb.) için eski bağlantı noktalarını kontrol et
                for (let i = 0; i < oldConnections.length; i++) {
                    const dist = Math.hypot(pipe.p1.x - oldConnections[i].x, pipe.p1.y - oldConnections[i].y);
                    if (dist < REPAIR_TOLERANCE) {
                        shouldUpdateStart = true;
                        startIndex = i;
                        break;
                    }
                }
            }
        }

        // --- P2 KONTROLÜ ---
        // 1. Explicit bağlantı var mı?
        const isEndExplicitlyConnected = pipe.connections?.end?.blockId && (
            pipe.connections.end.blockId === block.id ||
            pipe.connections.end.blockId === block
        );

        if (isEndExplicitlyConnected) {
            endIndex = pipe.connections.end.connectionIndex;
            if (endIndex < newConnections.length) {
                shouldUpdateEnd = true;
            }
        } else if (!pipe.connections?.end?.blockId) {
            // 2. Explicit bağlantı yoksa, fiziksel olarak eski bir bağlantı noktasına yakın mı?
            if (block.blockType === 'SERVIS_KUTUSU') {
                const oldCorners = getPlumbingBlockCorners({ ...block, center: oldCenter });
                 for(let i=0; i<oldCorners.length; i++) {
                     const edgeP1 = oldCorners[i];
                     const edgeP2 = oldCorners[(i+1)%4];
                     const distSq = distToSegmentSquared(pipe.p2, edgeP1, edgeP2);
                     if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                         shouldUpdateEnd = true;
                         endIndex = -1; // Kenara bağlı
                         break;
                     }
                 }
            } else {
                for (let i = 0; i < oldConnections.length; i++) {
                    const dist = Math.hypot(pipe.p2.x - oldConnections[i].x, pipe.p2.y - oldConnections[i].y);
                    if (dist < REPAIR_TOLERANCE) {
                        shouldUpdateEnd = true;
                        endIndex = i;
                        break;
                    }
                }
            }
        }
        // --- KONTROLLER SONU ---


        if (!shouldUpdateStart && !shouldUpdateEnd) return;

        const oldPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

        if (shouldUpdateStart) {
            if (startIndex !== -1) {
                // Bağlantı noktasına bağlı
                const newConn = newConnections[startIndex];
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;
                // Bağlantıyı onar (eğer eksikse)
                if (!isStartExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.start = {
                        blockId: block.id || block,
                        connectionIndex: startIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // Kenara bağlı (startIndex === -1), sadece taşı
                const deltaX = newCenter.x - oldCenter.x;
                const deltaY = newCenter.y - oldCenter.y;
                pipe.p1.x += deltaX;
                pipe.p1.y += deltaY;
            }
        }

        if (shouldUpdateEnd) {
             if (endIndex !== -1) {
                // Bağlantı noktasına bağlı
                const newConn = newConnections[endIndex];
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;
                // Bağlantıyı onar (eğer eksikse)
                if (!isEndExplicitlyConnected) {
                     if (!pipe.connections) pipe.connections = { start: null, end: null };
                     pipe.connections.end = {
                        blockId: block.id || block,
                        connectionIndex: endIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                 // Kenara bağlı (endIndex === -1), sadece taşı
                const deltaX = newCenter.x - oldCenter.x;
                const deltaY = newCenter.y - oldCenter.y;
                pipe.p2.x += deltaX;
                pipe.p2.y += deltaY;
            }
        }

        if ((shouldUpdateStart || shouldUpdateEnd) && pipe.valves && pipe.valves.length > 0) {
            const newPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
            updateValvePositionsOnResize(pipe, oldPipeLength, newPipeLength);
        }
    });
}

function updateValvePositionsOnResize(pipe, oldLength, newLength) {
    if (!pipe.valves || pipe.valves.length === 0) return;
    if (oldLength < 1) oldLength = newLength; // Sıfıra bölme hatasını önle

    const ratio = newLength / oldLength;
    pipe.valves.forEach(valve => {
        valve.pos = valve.pos * ratio;
        
        const valveWidth = valve.width || 12;
        const MIN_MARGIN = 1;
        const minPos = MIN_MARGIN + valveWidth / 2;
        const maxPos = newLength - MIN_MARGIN - valveWidth / 2;
        
        valve.pos = Math.max(minPos, Math.min(maxPos, valve.pos));
    });
}

/**
 * GÜNCELLENMİŞ updateConnectedPipesAfterRotation
 * Artık SADECE explicit (connections objesi olan) bağlantıları değil,
 * FİZİKSEL YAKINLIK (Math.hypot) ile bağlı olan boruları da döndürür.
 */
function updateConnectedPipesAfterRotation(block, oldRotation, newRotation) {
    const tempBlock = { ...block, rotation: oldRotation };
    const oldConnections = getConnectionPoints(tempBlock);
    const newConnections = getConnectionPoints(block);
    
    // GÜNCELLENDİ: Servis kutusu için eski ve yeni köşe noktaları
    const oldCorners = (block.blockType === 'SERVIS_KUTUSU') ? getPlumbingBlockCorners(tempBlock) : [];
    const newCorners = (block.blockType === 'SERVIS_KUTUSU') ? getPlumbingBlockCorners(block) : [];

    const REPAIR_TOLERANCE = 2; // Fiziksel yakınlık toleransı

    (state.plumbingPipes || []).forEach(pipe => {
        let shouldUpdateStart = false;
        let shouldUpdateEnd = false;
        let startIndex = null;
        let endIndex = null;

        // --- P1 KONTROLÜ ---
        // 1. Explicit bağlantı var mı?
        const isStartExplicitlyConnected = pipe.connections?.start?.blockId && (
            pipe.connections.start.blockId === block.id ||
            pipe.connections.start.blockId === block
        );

        if (isStartExplicitlyConnected) {
            startIndex = pipe.connections.start.connectionIndex;
            if (startIndex < newConnections.length) { // Servis kutusu için newConnections boş olabilir
                shouldUpdateStart = true;
            }
        } else if (!pipe.connections?.start?.blockId) {
            // 2. Explicit bağlantı yoksa, fiziksel olarak eski bir bağlantı noktasına yakın mı?
            if (block.blockType === 'SERVIS_KUTUSU') {
                 // Servis kutusu için: Eski *kenarlara* yakınlığı kontrol et
                 for(let i=0; i<oldCorners.length; i++) {
                     const edgeP1 = oldCorners[i];
                     const edgeP2 = oldCorners[(i+1)%4];
                     const distSq = distToSegmentSquared(pipe.p1, edgeP1, edgeP2);
                     if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                         shouldUpdateStart = true;
                         startIndex = -1; // Kenara bağlı olduğunu belirt
                         break;
                     }
                 }
            } else {
                // Diğer bloklar (Sayaç, Vana vb.) için eski bağlantı noktalarını kontrol et
                for (let i = 0; i < oldConnections.length; i++) {
                    const dist = Math.hypot(pipe.p1.x - oldConnections[i].x, pipe.p1.y - oldConnections[i].y);
                    if (dist < REPAIR_TOLERANCE) {
                        shouldUpdateStart = true;
                        startIndex = i;
                        break;
                    }
                }
            }
        }

        // --- P2 KONTROLÜ ---
        // 1. Explicit bağlantı var mı?
        const isEndExplicitlyConnected = pipe.connections?.end?.blockId && (
            pipe.connections.end.blockId === block.id ||
            pipe.connections.end.blockId === block
        );

        if (isEndExplicitlyConnected) {
            endIndex = pipe.connections.end.connectionIndex;
            if (endIndex < newConnections.length) {
                shouldUpdateEnd = true;
            }
        } else if (!pipe.connections?.end?.blockId) {
            // 2. Explicit bağlantı yoksa, fiziksel olarak eski bir bağlantı noktasına yakın mı?
            if (block.blockType === 'SERVIS_KUTUSU') {
                 for(let i=0; i<oldCorners.length; i++) {
                     const edgeP1 = oldCorners[i];
                     const edgeP2 = oldCorners[(i+1)%4];
                     const distSq = distToSegmentSquared(pipe.p2, edgeP1, edgeP2);
                     if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                         shouldUpdateEnd = true;
                         endIndex = -1; // Kenara bağlı
                         break;
                     }
                 }
            } else {
                for (let i = 0; i < oldConnections.length; i++) {
                    const dist = Math.hypot(pipe.p2.x - oldConnections[i].x, pipe.p2.y - oldConnections[i].y);
                    if (dist < REPAIR_TOLERANCE) {
                        shouldUpdateEnd = true;
                        endIndex = i;
                        break;
                    }
                }
            }
        }
        // --- KONTROLLER SONU ---


        if (shouldUpdateStart) {
            if (startIndex !== -1) {
                // Bağlantı noktasına bağlı
                const newConn = newConnections[startIndex];
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;
                // Bağlantıyı onar (eğer eksikse)
                if (!isStartExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.start = {
                        blockId: block.id || block,
                        connectionIndex: startIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // Kenara bağlı (startIndex === -1), en yakın yeni kenara snap et
                let closestDistSq = Infinity;
                let snapPoint = { x: pipe.p1.x, y: pipe.p1.y }; // Varsayılan: hareket etme
                for(let i=0; i<newCorners.length; i++) {
                    const edgeP1 = newCorners[i];
                    const edgeP2 = newCorners[(i+1)%4];
                    const distSq = distToSegmentSquared(pipe.p1, edgeP1, edgeP2);
                    if (distSq < closestDistSq) {
                        closestDistSq = distSq;
                        // En yakın noktayı hesapla
                        const l2 = (edgeP1.x - edgeP2.x)**2 + (edgeP1.y - edgeP2.y)**2;
                        let t = ((pipe.p1.x - edgeP1.x) * (edgeP2.x - edgeP1.x) + (pipe.p1.y - edgeP1.y) * (edgeP2.y - edgeP1.y)) / l2;
                        t = Math.max(0, Math.min(1, t));
                        snapPoint = { x: edgeP1.x + t * (edgeP2.x - edgeP1.x), y: edgeP1.y + t * (edgeP2.y - edgeP1.y) };
                    }
                }
                pipe.p1.x = snapPoint.x;
                pipe.p1.y = snapPoint.y;
            }
        }

        if (shouldUpdateEnd) {
            if (endIndex !== -1) {
                // Bağlantı noktasına bağlı
                const newConn = newConnections[endIndex];
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;
                // Bağlantıyı onar (eğer eksikse)
                if (!isEndExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.end = {
                        blockId: block.id || block,
                        connectionIndex: endIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // Kenara bağlı (endIndex === -1), en yakın yeni kenara snap et
                let closestDistSq = Infinity;
                let snapPoint = { x: pipe.p2.x, y: pipe.p2.y };
                for(let i=0; i<newCorners.length; i++) {
                    const edgeP1 = newCorners[i];
                    const edgeP2 = newCorners[(i+1)%4];
                    const distSq = distToSegmentSquared(pipe.p2, edgeP1, edgeP2);
                    if (distSq < closestDistSq) {
                        closestDistSq = distSq;
                        const l2 = (edgeP1.x - edgeP2.x)**2 + (edgeP1.y - edgeP2.y)**2;
                        let t = ((pipe.p2.x - edgeP1.x) * (edgeP2.x - edgeP1.x) + (pipe.p2.y - edgeP1.y) * (edgeP2.y - edgeP1.y)) / l2;
                        t = Math.max(0, Math.min(1, t));
                        snapPoint = { x: edgeP1.x + t * (edgeP2.x - edgeP1.x), y: edgeP1.y + t * (edgeP2.y - edgeP1.y) };
                    }
                }
                pipe.p2.x = snapPoint.x;
                pipe.p2.y = snapPoint.y;
            }
        }
    });
}


// GÜNCELLENDİ: Bu yardımcı fonksiyon eklendi
function getConnectionPointsAtPosition(block, center) {
    // GÜNCELLENDİ: Servis kutusunun bağlantı noktası yok
    if (block.blockType === 'SERVIS_KUTUSU') {
        return [];
    }
    // --- GÜNCELLEME SONU ---

    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const cx = center.x;
    const cy = center.y;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return typeConfig.connectionPoints.map((cp, index) => ({
        x: cx + cp.x * cos - cp.y * sin,
        y: cy + cp.x * sin + cp.y * cos,
        label: cp.label,
        index: index, // index eklendi
        z: cp.z
    }));
}

export function deletePlumbingBlock(block) {
    if (block.blockType === 'SAYAC' || block.blockType === 'VANA') {
        mergePipesAfterBlockDeletion(block);
    }
    // GÜNCELLENDİ: Servis kutusu silindiğinde de bağlantıları kopar
    else if (block.blockType === 'SERVIS_KUTUSU') {
        clearConnectionsToBlock(block);
    }
    // --- GÜNCELLEME SONU ---


    const index = state.plumbingBlocks?.indexOf(block);
    if (index !== undefined && index > -1) {
        state.plumbingBlocks.splice(index, 1);
        return true;
    }
    return false;
}

// GÜNCELLENDİ: Servis kutusu için bu fonksiyon eklendi
/**
 * Bir blok (özellikle Servis Kutusu) silindiğinde, ona bağlı (fiziksel olarak) boruların bağlantısını keser.
 */
function clearConnectionsToBlock(block) {
    const REPAIR_TOLERANCE = 2; // Fiziksel yakınlık toleransı
    const corners = getPlumbingBlockCorners(block);

    (state.plumbingPipes || []).forEach(pipe => {
        // P1'i kontrol et
        let p1Near = false;
        for(let i=0; i<corners.length; i++) {
            const edgeP1 = corners[i];
            const edgeP2 = corners[(i+1)%4];
            if (distToSegmentSquared(pipe.p1, edgeP1, edgeP2) < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                p1Near = true;
                break;
            }
        }
        if (p1Near && pipe.connections?.start) {
             console.log(`Clearing implicit connection for pipe (P1) from deleted ${block.blockType}`);
             pipe.connections.start = null;
        }

        // P2'yi kontrol et
        let p2Near = false;
        for(let i=0; i<corners.length; i++) {
            const edgeP1 = corners[i];
            const edgeP2 = corners[(i+1)%4];
            if (distToSegmentSquared(pipe.p2, edgeP1, edgeP2) < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                p2Near = true;
                break;
            }
        }
         if (p2Near && pipe.connections?.end) {
             console.log(`Clearing implicit connection for pipe (P2) from deleted ${block.blockType}`);
             pipe.connections.end = null;
        }
    });
}
// --- GÜNCELLEME SONU ---


/**
 * ⭐ GÜNCELLENDİ: Node paylaşımı ile blok silindiğinde boruları birleştir
 */
function mergePipesAfterBlockDeletion(block) {
    const tolerance = 15;
    const connections = getConnectionPoints(block);

    const connectedPipes = [];

    for (const pipe of (state.plumbingPipes || [])) {
        let connectionInfo = null;

        const isP1Connected = pipe.connections?.start?.blockId && (
            pipe.connections.start.blockId === block.id ||
            pipe.connections.start.blockId === block
        );

        const isP2Connected = pipe.connections?.end?.blockId && (
            pipe.connections.end.blockId === block.id ||
            pipe.connections.end.blockId === block
        );

        if (isP1Connected) {
            connectionInfo = { pipe, end: 'p1', connectionIndex: pipe.connections.start.connectionIndex };
            connectedPipes.push(connectionInfo);
        } else if (isP2Connected) {
            connectionInfo = { pipe, end: 'p2', connectionIndex: pipe.connections.end.connectionIndex };
            connectedPipes.push(connectionInfo);
        } else {
            // GÜNCELLENDİ: Servis kutusu için bu döngü çalışmayacak (connections boş)
            for (let i = 0; i < connections.length; i++) {
                const cp = connections[i];
                if (Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < tolerance) {
                    connectionInfo = { pipe, end: 'p1', connectionIndex: i };
                    connectedPipes.push(connectionInfo);
                    break;
                } else if (Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < tolerance) {
                    connectionInfo = { pipe, end: 'p2', connectionIndex: i };
                    connectedPipes.push(connectionInfo);
                    break;
                }
            }
        }
    }

    if (connectedPipes.length === 2) {
        const pipe1Info = connectedPipes[0];
        const pipe2Info = connectedPipes[1];

        const pipe1 = pipe1Info.pipe;
        const pipe2 = pipe2Info.pipe;

        // ⭐ DÜZELTME: Her iki boruyu silip yeni boru yaratmak yerine,
        // bir boruyu koru ve diğer borunun ucuna uzat

        // pipe1'i koruyoruz, pipe2'yi siliyoruz
        // pipe1'in bloğa bağlı olan ucunu, pipe2'nin dış ucuna bağlıyoruz

        if (pipe1Info.end === 'p1') {
            // pipe1'in p1'i bloğa bağlı, p2'yi değiştir (YANLIŞ, p1'i değiştir)
            pipe1.p1 = (pipe2Info.end === 'p2') ? pipe2.p1 : pipe2.p2;
            pipe1.connections.start = (pipe2Info.end === 'p2') ? pipe2.connections.start : pipe2.connections.end;
        } else {
            // pipe1'in p2'si bloğa bağlı, p2'yi değiştir
            pipe1.p2 = (pipe2Info.end === 'p2') ? pipe2.p1 : pipe2.p2;
            pipe1.connections.end = (pipe2Info.end === 'p2') ? pipe2.connections.start : pipe2.connections.end;
        }

        // pipe2'nin vanalarını pipe1'e aktar
        pipe1.valves = [...(pipe1.valves || []), ...(pipe2.valves || [])];
        pipe1.isConnectedToValve = pipe1.isConnectedToValve || pipe2.isConnectedToValve;

        // Sadece pipe2'yi sil
        const idx2 = state.plumbingPipes.indexOf(pipe2);
        if (idx2 > -1) {
            state.plumbingPipes.splice(idx2, 1);
        }

        console.log('✅ Block deleted, pipe1 extended to merge with pipe2 (pipe2 deleted)');
    } else if (connectedPipes.length > 0) {
        connectedPipes.forEach(info => {
            if (info.end === 'p1' && info.pipe.connections?.start) {
                info.pipe.connections.start = null;
            } else if (info.end === 'p2' && info.pipe.connections?.end) {
                info.pipe.connections.end = null;
            }
        });
        console.log('⚠️ Block deleted, connections cleared');
    }

    // Blok silindikten sonra çok kısa boruları temizle
    cleanupVeryShortPipes();
}

export function getDefaultRotationForWall(wallAngle) {
    return Math.round((wallAngle + 90) / 15) * 15;
}