// ahmedakbayir/ngcad/architectural-objects/plumbing-blocks.js
// SON HALİ - ÇALIŞAN VERSİYON
// ✅ Bloklar asla kopmaz
// ✅ Mıknatıs etkisi yok
// ✅ Silinebilir ve birleştirir

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

    if (block.blockType === 'SERVIS_KUTUSU') {
        return allPoints.filter(cp => {
            if (cp.z === -15) return true;
            if (cp.label === 'alt') return true;
            return false;
        });
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
 * ⭐ Eksik connections bilgilerini doldur
 */
function repairMissingConnections(block) {
    const connections = getConnectionPoints(block);
    const REPAIR_TOLERANCE = 2;

    console.log(`🔧 Repairing connections for ${block.blockType}...`);

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
            if (!checkPipeValveLengthBeforeRotation(block, newRotation)) {
                return false;
            }

            block.rotation = newRotation;
            updateConnectedPipesAfterRotation(block, oldRotation, block.rotation);
        }

        return true;
        
    } else if (handle === 'body') {
        if (block.blockType !== 'OCAK' && block.blockType !== 'KOMBI') {
            const newCenter = {
                x: startCenter.x + dx,
                y: startCenter.y + dy
            };

            if (!checkPipeValveLengthBeforeMove(block, newCenter)) {
                return false;
            }

            const oldCenter = { ...block.center };
            
            block.center.x = newCenter.x;
            block.center.y = newCenter.y;

            updateConnectedPipes(block, oldCenter, block.center);
            
            return true;
        } else {
            block.center.x = startCenter.x + dx;
            block.center.y = startCenter.y + dy;
            return true;
        }
    }

    return false;
}

/**
 * ⭐ ÇALIŞAN VERSİYON - Bağlı boruları güncelle
 * SADECE connections.blockId kontrolü (explicit bağlantılar)
 */
function updateConnectedPipes(block, oldCenter, newCenter) {
    const newConnections = getConnectionPoints(block);

    (state.plumbingPipes || []).forEach(pipe => {
        let shouldUpdateStart = false;
        let shouldUpdateEnd = false;
        let startIndex = null;
        let endIndex = null;

        // P1 - SADECE explicit bağlantı
        const isStartExplicitlyConnected = pipe.connections?.start?.blockId && (
            pipe.connections.start.blockId === block.id ||
            pipe.connections.start.blockId === block
        );

        if (isStartExplicitlyConnected) {
            startIndex = pipe.connections.start.connectionIndex;
            shouldUpdateStart = true;
        }

        // P2 - SADECE explicit bağlantı
        const isEndExplicitlyConnected = pipe.connections?.end?.blockId && (
            pipe.connections.end.blockId === block.id ||
            pipe.connections.end.blockId === block
        );

        if (isEndExplicitlyConnected) {
            endIndex = pipe.connections.end.connectionIndex;
            shouldUpdateEnd = true;
        }

        if (!shouldUpdateStart && !shouldUpdateEnd) return;

        const oldPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

        if (shouldUpdateStart && startIndex !== null) {
            const newConn = newConnections[startIndex];
            pipe.p1.x = newConn.x;
            pipe.p1.y = newConn.y;

            pipe.connections.start = {
                blockId: block.id || block,
                connectionIndex: startIndex,
                blockType: block.blockType
            };
        }

        if (shouldUpdateEnd && endIndex !== null) {
            const newConn = newConnections[endIndex];
            pipe.p2.x = newConn.x;
            pipe.p2.y = newConn.y;

            pipe.connections.end = {
                blockId: block.id || block,
                connectionIndex: endIndex,
                blockType: block.blockType
            };
        }

        if ((shouldUpdateStart || shouldUpdateEnd) && pipe.valves && pipe.valves.length > 0) {
            const newPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
            updateValvePositionsOnResize(pipe, oldPipeLength, newPipeLength);
        }
    });
}

function updateValvePositionsOnResize(pipe, oldLength, newLength) {
    if (!pipe.valves || pipe.valves.length === 0) return;

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

            const isStartConnectedToThisBlock = pipe.connections?.start?.blockId && (
                pipe.connections.start.blockId === block.id ||
                pipe.connections.start.blockId === block
            ) && pipe.connections.start.connectionIndex === index;

            const isEndConnectedToThisBlock = pipe.connections?.end?.blockId && (
                pipe.connections.end.blockId === block.id ||
                pipe.connections.end.blockId === block
            ) && pipe.connections.end.connectionIndex === index;

            if (isStartConnectedToThisBlock) {
                shouldUpdateStart = true;
            } else if ((block.blockType === 'SAYAC' || block.blockType === 'VANA') &&
                       Math.hypot(pipe.p1.x - oldConn.x, pipe.p1.y - oldConn.y) < tolerance) {
                const isP1AlreadyConnectedToThisBlock = pipe.connections?.start?.blockId && (
                    pipe.connections.start.blockId === block.id ||
                    pipe.connections.start.blockId === block
                );
                if (!isP1AlreadyConnectedToThisBlock) {
                    shouldUpdateStart = true;
                }
            }

            if (isEndConnectedToThisBlock) {
                shouldUpdateEnd = true;
            } else if ((block.blockType === 'SAYAC' || block.blockType === 'VANA') &&
                       Math.hypot(pipe.p2.x - oldConn.x, pipe.p2.y - oldConn.y) < tolerance) {
                const isP2AlreadyConnectedToThisBlock = pipe.connections?.end?.blockId && (
                    pipe.connections.end.blockId === block.id ||
                    pipe.connections.end.blockId === block
                );
                if (!isP2AlreadyConnectedToThisBlock) {
                    shouldUpdateEnd = true;
                }
            }

            if (shouldUpdateStart) {
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;

                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.start = {
                    blockId: block.id || block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }

            if (shouldUpdateEnd) {
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;

                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.end = {
                    blockId: block.id || block,
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
    if (block.blockType === 'SAYAC' || block.blockType === 'VANA') {
        mergePipesAfterBlockDeletion(block);
    }

    const index = state.plumbingBlocks?.indexOf(block);
    if (index !== undefined && index > -1) {
        state.plumbingBlocks.splice(index, 1);
        return true;
    }
    return false;
}

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
            // pipe1'in p1'i bloğa bağlı, p2'yi değiştir
            pipe1.p2 = pipe2Info.end === 'p2' ? pipe2.p1 : pipe2.p2;
            pipe1.connections.end = pipe2Info.end === 'p2' ? pipe2.connections.start : pipe2.connections.end;
        } else {
            // pipe1'in p2'si bloğa bağlı, p1'i değiştir
            pipe1.p1 = pipe2Info.end === 'p2' ? pipe2.p1 : pipe2.p2;
            pipe1.connections.start = pipe2Info.end === 'p2' ? pipe2.connections.start : pipe2.connections.end;
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