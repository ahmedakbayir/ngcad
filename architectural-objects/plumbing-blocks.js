// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/architectural-objects/plumbing-blocks.js
// GÜNCELLENDİ: Blok taşıma sırasında bağlı boruların vanaları için uzunluk kontrolleri eklendi

import { state, setState } from '../general-files/main.js';
 
export const PLUMBING_BLOCK_TYPES = {
    SERVIS_KUTUSU: {
        id: 'servis-kutusu',
        name: 'Servis Kutusu',
        width: 40,
        height: 20,
        depth: 70,
        cornerRadius: 1,
        connectionPoints: [
            { x: 20, y: 0, z: -15, label: 'sağ-orta' },
            { x: -20, y: 0, z: -15, label: 'sol-orta' },
            { x: 20, y: -8, z: -15, label: 'sağ-üst' },
            { x: -20, y: -8, z: -15, label: 'sol-üst' },
            { x: 20, y: 8, z: -15, label: 'sağ-alt' },
            { x: -20, y: 8, z: -15, label: 'sol-alt' },
            { x: 0, y: 0, z: 35, label: 'üst' },
            { x: 0, y: 0, z: -35, label: 'alt' },
            { x: 0, y: -10, z: -15, label: 'orta-üst' },
            { x: 0, y: 10, z: -15, label: 'orta-alt' }
        ],
        mountType: 'wall',
        color: 0xA8A8A8,
    },
    SAYAC: {
        id: 'sayac',
        name: 'Sayaç',
        width: 18,
        height: 18,
        depth: 40,
        cornerRadius: 1,
        connectionPoints: [
            { x: -6, y: -9 - 10, z: 30, label: 'giriş' },
            { x: 6, y: -9 - 10, z: 30, label: 'çıkış' }
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
        z: cp.z  // z koordinatını da ekle (alt/üst ayırımı için)
    }));
}

/**
 * Servis kutusunun aktif çıkış noktalarını döndür
 * Şimdilik sadece alttan (z = -35) çıkış kullanılabilir
 */
export function getActiveConnectionPoints(block) {
    const allPoints = getConnectionPoints(block);

    // Servis kutusu için sadece alt çıkış noktasını döndür (z = -35)
    if (block.blockType === 'SERVIS_KUTUSU') {
        return allPoints.filter(cp => cp.label === 'alt');
    }

    // Diğer bloklar için tüm çıkış noktalarını döndür
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
        const connectionPoints = getConnectionPoints(block);
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

    const dragState = {
        type: 'plumbingBlock',
        block: effectiveBlock,
        handle: handle,
        startPos: { ...pos },
        startCenter: { ...effectiveBlock.center },
        startRotation: effectiveBlock.rotation || 0
    };
    setState({ dragState });

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * YENİ YARDIMCI FONKSİYON: Blok taşınırken bağlı borular için vana kontrolü yap
 * Boru çok kısalıyorsa taşımayı iptal et
 */
function checkPipeValveLengthBeforeMove(block, newCenter) {
    const oldConnections = getConnectionPoints(block);
    const tempBlock = { ...block, center: newCenter };
    const newConnections = getConnectionPoints(tempBlock);

    const tolerance = 15;

    for (let index = 0; index < oldConnections.length; index++) {
        const oldConn = oldConnections[index];
        const newConn = newConnections[index];

        // Bu bağlantı noktasına bağlı boruları bul
        for (const pipe of (state.plumbingPipes || [])) {
            let affectsP1 = false;
            let affectsP2 = false;

            // Explicit connection kontrolü
            if (pipe.connections?.start?.blockId === block && pipe.connections.start.connectionIndex === index) {
                affectsP1 = true;
            } else if (Math.hypot(pipe.p1.x - oldConn.x, pipe.p1.y - oldConn.y) < tolerance) {
                affectsP1 = true;
            }

            if (pipe.connections?.end?.blockId === block && pipe.connections.end.connectionIndex === index) {
                affectsP2 = true;
            } else if (Math.hypot(pipe.p2.x - oldConn.x, pipe.p2.y - oldConn.y) < tolerance) {
                affectsP2 = true;
            }

            // Eğer bu boru etkileniyorsa
            if (affectsP1 || affectsP2) {
                // Vana var mı kontrol et
                if (pipe.valves && pipe.valves.length > 0) {
                    // Yeni boru uzunluğunu hesapla
                    const newP1 = affectsP1 ? newConn : pipe.p1;
                    const newP2 = affectsP2 ? newConn : pipe.p2;
                    const newLength = Math.hypot(newP2.x - newP1.x, newP2.y - newP1.y);

                    // Toplam vana uzunluğu
                    const totalValveLength = pipe.valves.reduce((sum, v) => sum + (v.width || 12), 0);
                    const minRequired = totalValveLength + 2; // +2 cm: her uçtan 1 cm

                    if (newLength < minRequired) {
                        console.warn(`Taşıma iptal! Boru çok kısa olacak: ${newLength.toFixed(1)} cm < ${minRequired.toFixed(1)} cm (gerekli)`);
                        return false;
                    }
                }
            }
        }
    }

    return true;
}

export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingBlock') return false;

    const { block, handle, startPos, startCenter, startRotation } = dragState;
    
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;

    if (handle === 'rotation') {
        const angleToMouse = Math.atan2(
            snappedPos.roundedX - block.center.x,
            -(snappedPos.roundedY - block.center.y)
        ) * 180 / Math.PI;

        const oldRotation = block.rotation || 0;
        const newRotation = Math.round(angleToMouse / 15) * 15;
        
        if (oldRotation !== newRotation) {
            block.rotation = newRotation;
            updateConnectedPipesAfterRotation(block, oldRotation, block.rotation);
        }

        return true;
        
    } else if (handle === 'body') {
        // RİJİT BLOKLAR için boru uzunluğu kontrolü
        if (block.blockType !== 'OCAK' && block.blockType !== 'KOMBI') {
            const newCenter = {
                x: startCenter.x + dx,
                y: startCenter.y + dy
            };

            // Vana kontrolü - taşıma güvenli mi?
            if (!checkPipeValveLengthBeforeMove(block, newCenter)) {
                // Taşıma iptal - bloğu eski pozisyonunda bırak
                return false;
            }

            const oldCenter = { ...block.center };
            
            block.center.x = newCenter.x;
            block.center.y = newCenter.y;

            updateConnectedPipes(block, oldCenter, block.center);
            
            return true;
        }
        // FLEKSİBL BLOKLAR için normal taşıma
        else {
            block.center.x = startCenter.x + dx;
            block.center.y = startCenter.y + dy;
            return true;
        }
    }

    return false;
}

function checkIfBlockIsConnected(block) {
    const connections = getConnectionPoints(block);
    const tolerance = 15;

    for (const conn of connections) {
        for (const pipe of (state.plumbingPipes || [])) {
            const dist1 = Math.hypot(pipe.p1.x - conn.x, pipe.p1.y - conn.y);
            const dist2 = Math.hypot(pipe.p2.x - conn.x, pipe.p2.y - conn.y);

            if (dist1 < tolerance || dist2 < tolerance) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Bağlı boruları güncelle
 * GÜNCELLENDİ: Vana pozisyonlarını da güncelle
 * GÜNCELLENDİ: Servis kutusu için boru uçlarını GÜNCELLEME (sabit kalsın)
 */
function updateConnectedPipes(block, oldCenter, newCenter) {
    // KULLANICI İSTEĞİ: Servis kutusu taşınırken boru uçları sabit kalmalı
    if (block.blockType === 'SERVIS_KUTUSU') {
        console.log('🔒 Servis kutusu taşınıyor - çıkış noktaları sabit kalacak');
        return; // Boru uçlarını güncelleme!
    }

    const oldConnections = getConnectionPointsAtPosition(block, oldCenter);
    const newConnections = getConnectionPoints(block);

    oldConnections.forEach((oldConn, index) => {
        const newConn = newConnections[index];
        const tolerance = 15;

        (state.plumbingPipes || []).forEach(pipe => {
            let shouldUpdateStart = false;
            let shouldUpdateEnd = false;

            if (pipe.connections?.start?.blockId === block && pipe.connections.start.connectionIndex === index) {
                shouldUpdateStart = true;
            } else if (Math.hypot(pipe.p1.x - oldConn.x, pipe.p1.y - oldConn.y) < tolerance) {
                shouldUpdateStart = true;
            }

            if (pipe.connections?.end?.blockId === block && pipe.connections.end.connectionIndex === index) {
                shouldUpdateEnd = true;
            } else if (Math.hypot(pipe.p2.x - oldConn.x, pipe.p2.y - oldConn.y) < tolerance) {
                shouldUpdateEnd = true;
            }

            // Eski boru uzunluğu
            const oldPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

            if (shouldUpdateStart) {
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;

                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.start = {
                    blockId: block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }

            if (shouldUpdateEnd) {
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;

                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.end = {
                    blockId: block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }

            // Boru güncellendiyse vana pozisyonlarını da güncelle
            if ((shouldUpdateStart || shouldUpdateEnd) && pipe.valves && pipe.valves.length > 0) {
                const newPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
                updateValvePositionsOnResize(pipe, oldPipeLength, newPipeLength);
            }
        });
    });
}

/**
 * YENİ YARDIMCI FONKSİYON: Vana pozisyonlarını boru boyutuna göre güncelle
 */
function updateValvePositionsOnResize(pipe, oldLength, newLength) {
    if (!pipe.valves || pipe.valves.length === 0) return;

    const ratio = newLength / oldLength;
    pipe.valves.forEach(valve => {
        valve.pos = valve.pos * ratio;
        
        // Sınırlar içinde tut (1 cm kenar boşluğu)
        const valveWidth = valve.width || 12;
        const MIN_MARGIN = 1;
        const minPos = MIN_MARGIN + valveWidth / 2;
        const maxPos = newLength - MIN_MARGIN - valveWidth / 2;
        
        valve.pos = Math.max(minPos, Math.min(maxPos, valve.pos));
    });
}

function updateConnectedPipesAfterRotation(block, oldRotation, newRotation) {
    const tempBlock = { ...block, rotation: oldRotation };
    const oldConnections = getConnectionPoints(tempBlock);
    const newConnections = getConnectionPoints(block);

    oldConnections.forEach((oldConn, index) => {
        const newConn = newConnections[index];
        const tolerance = 15;

        (state.plumbingPipes || []).forEach(pipe => {
            let shouldUpdateStart = false;
            let shouldUpdateEnd = false;

            if (pipe.connections?.start?.blockId === block && pipe.connections.start.connectionIndex === index) {
                shouldUpdateStart = true;
            } else if (Math.hypot(pipe.p1.x - oldConn.x, pipe.p1.y - oldConn.y) < tolerance) {
                shouldUpdateStart = true;
            }

            if (pipe.connections?.end?.blockId === block && pipe.connections.end.connectionIndex === index) {
                shouldUpdateEnd = true;
            } else if (Math.hypot(pipe.p2.x - oldConn.x, pipe.p2.y - oldConn.y) < tolerance) {
                shouldUpdateEnd = true;
            }

            if (shouldUpdateStart) {
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;

                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.start = {
                    blockId: block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }

            if (shouldUpdateEnd) {
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;

                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.end = {
                    blockId: block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }
        });
    });
}

function getConnectionPointsAtPosition(block, center) {
    const typeConfig = block.typeConfig || PLUMBING_BLOCK_TYPES[block.blockType];
    const cx = center.x;
    const cy = center.y;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return typeConfig.connectionPoints.map(cp => ({
        x: cx + cp.x * cos - cp.y * sin,
        y: cy + cp.x * sin + cp.y * cos,
        label: cp.label
    }));
}

export function deletePlumbingBlock(block) {
    const index = state.plumbingBlocks?.indexOf(block);
    if (index !== undefined && index > -1) {
        state.plumbingBlocks.splice(index, 1);
        return true;
    }
    return false;
}

export function getDefaultRotationForWall(wallAngle) {
    return Math.round((wallAngle + 90) / 15) * 15;
}