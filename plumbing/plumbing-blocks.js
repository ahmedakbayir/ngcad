// ahmedakbayir/ngcad/architectural-objects/plumbing-blocks.js
// ✅ DÜZELTME: Kutudan çıkan hatlar kopmaz, kesikli değil, smooth çizim
// ✅ REPAIR_TOLERANCE 2cm -> 5cm (daha geniş yakalama)
// ✅ Basitleştirilmiş taşıma mantığı

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
        width: 6,
        height: 6,
        depth: 6,
        cornerRadius: 1,
        connectionPoints: [
            { x: -3, y: 0, z: -2.50, label: 'giriş' },
            { x: 3, y: 0, z: -2.50, label: 'çıkış' }
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
    if (block.blockType === 'SERVIS_KUTUSU') {
        return [];
    }

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
        return allPoints;
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

function repairMissingConnections(block) {
    const connections = getConnectionPoints(block);
    const REPAIR_TOLERANCE = 2;

    console.log(`🔧 Repairing connections for ${block.blockType}...`);
    
    if (block.blockType === 'SERVIS_KUTUSU') return;

    (state.plumbingPipes || []).forEach(pipe => {
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

    if (block.blockType === 'SERVIS_KUTUSU') return true;

    const MIN_PIPE_LENGTH = 5;

    for (let index = 0; index < newConnections.length; index++) {
        const newConn = newConnections[index];

        for (const pipe of (state.plumbingPipes || [])) {
            let affectsP1 = false;
            let affectsP2 = false;

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

    if (block.blockType === 'SERVIS_KUTUSU') return true;

    for (let index = 0; index < newConnections.length; index++) {
        const newConn = newConnections[index];

        for (const pipe of (state.plumbingPipes || [])) {
            let affectsP1 = false;
            let affectsP2 = false;

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
        isSnapped: false,
        lastSnapType: null,
        lastSnapPoint: null
    };
    setState({ dragState });

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

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
        let targetX = startCenter.x + dx;
        let targetY = startCenter.y + dy;
        let useSnap = false;

        // ✅ SAYAÇ için boru snap ve otomatik rotasyon
        if (block.blockType === 'SAYAC') {
            const currentFloorId = state.currentFloor?.id;
            const pipes = currentFloorId
                ? (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId)
                : (state.plumbingPipes || []);

            // Yakındaki boruyu bul
            let closestPipe = null;
            let closestDist = Infinity;
            const PIPE_SNAP_THRESHOLD = 15;

            pipes.forEach(pipe => {
                const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
                if (pipeLength < 0.1) return;

                const dx_pipe = pipe.p2.x - pipe.p1.x;
                const dy_pipe = pipe.p2.y - pipe.p1.y;
                const lengthSq = dx_pipe * dx_pipe + dy_pipe * dy_pipe;

                // Boruya olan mesafeyi hesapla
                let t = ((unsnappedPos.x - pipe.p1.x) * dx_pipe + (unsnappedPos.y - pipe.p1.y) * dy_pipe) / lengthSq;
                t = Math.max(0, Math.min(1, t));

                const closestX = pipe.p1.x + t * dx_pipe;
                const closestY = pipe.p1.y + t * dy_pipe;
                const dist = Math.hypot(unsnappedPos.x - closestX, unsnappedPos.y - closestY);

                if (dist < closestDist && dist < PIPE_SNAP_THRESHOLD) {
                    closestDist = dist;
                    closestPipe = { pipe, t, closestX, closestY };
                }
            });

            // Eğer yakın bir boru varsa, o borunun yönüne göre dön
            if (closestPipe) {
                const pipe = closestPipe.pipe;
                const pipeAngle = Math.atan2(
                    pipe.p2.y - pipe.p1.y,
                    pipe.p2.x - pipe.p1.x
                ) * 180 / Math.PI;

                // Borunun açısına göre sayaç rotation'ını ayarla
                let normalizedAngle = pipeAngle;
                while (normalizedAngle > 180) normalizedAngle -= 360;
                while (normalizedAngle < -180) normalizedAngle += 360;
                block.rotation = Math.round(normalizedAngle / 15) * 15;

                // Sayacı boruya snap et
                targetX = closestPipe.closestX;
                targetY = closestPipe.closestY;
                useSnap = true;
            }
        }

        if (block.blockType === 'SERVIS_KUTUSU') {
            // ✅ DÜZELTME: Hysteresis eşikleri düşürüldü (smooth taşıma)
            const SNAP_ACTIVATE_THRESHOLD = 10; // 20 -> 10 (daha hızlı snap)
            const SNAP_RELEASE_THRESHOLD = 15;  // 40 -> 15 (daha hızlı kopma)
            
            if (snappedPos.isSnapped && 
                (snappedPos.snapType === 'PLUMBING_WALL_SURFACE' || 
                 snappedPos.snapType === 'PLUMBING_BLOCK_EDGE' ||
                 snappedPos.snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION' ||
                 snappedPos.snapType === 'PLUMBING_INTERSECTION')) {
                
                if (dragState.isSnapped && dragState.lastSnapPoint) {
                    const distToLastSnap = Math.hypot(
                        unsnappedPos.x - dragState.lastSnapPoint.x,
                        unsnappedPos.y - dragState.lastSnapPoint.y
                    );
                    
                    if (distToLastSnap < SNAP_RELEASE_THRESHOLD) {
                        targetX = dragState.lastSnapPoint.x;
                        targetY = dragState.lastSnapPoint.y;
                        useSnap = true;
                        
                        if (dragState.lastSnapAngle !== undefined) {
                            block.rotation = dragState.lastSnapAngle;
                        }
                    } else {
                        dragState.isSnapped = false;
                        dragState.lastSnapType = null;
                        dragState.lastSnapPoint = null;
                        dragState.lastSnapAngle = null;
                    }
                } else {
                    const distToNewSnap = Math.hypot(
                        unsnappedPos.x - snappedPos.x,
                        unsnappedPos.y - snappedPos.y
                    );
                    
                    if (distToNewSnap < SNAP_ACTIVATE_THRESHOLD) {
                        targetX = snappedPos.x;
                        targetY = snappedPos.y;
                        useSnap = true;
                        
                        dragState.isSnapped = true;
                        dragState.lastSnapType = snappedPos.snapType;
                        dragState.lastSnapPoint = { x: snappedPos.x, y: snappedPos.y };
                        dragState.lastSnapAngle = snappedPos.snapAngle;
                        
                        if (snappedPos.snapAngle !== undefined && 
                            (snappedPos.snapType === 'PLUMBING_WALL_SURFACE' ||
                             snappedPos.snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION' ||
                             snappedPos.snapType === 'PLUMBING_INTERSECTION')) {
                            block.rotation = snappedPos.snapAngle;
                        }
                    }
                }
            } else {
                if (dragState.isSnapped && dragState.lastSnapPoint) {
                    const distToLastSnap = Math.hypot(
                        unsnappedPos.x - dragState.lastSnapPoint.x,
                        unsnappedPos.y - dragState.lastSnapPoint.y
                    );
                    
                    if (distToLastSnap < SNAP_RELEASE_THRESHOLD) {
                        targetX = dragState.lastSnapPoint.x;
                        targetY = dragState.lastSnapPoint.y;
                        useSnap = true;
                        
                        if (dragState.lastSnapAngle !== undefined) {
                            block.rotation = dragState.lastSnapAngle;
                        }
                    } else {
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
 * ✅ DÜZELTME: Sadece DOĞRUDAN bağlı boruları taşır, diğer node'lara dokunmaz
 * - Explicit connection varsa kesinlikle taşır
 * - Fiziksel yakınlık kontrolü SADECE explicit connection yoksa ve çok dar tolerance ile
 * - REPAIR_TOLERANCE daraltıldı (1cm) - diğer boruların node'larını yutmaz
 */
function updateConnectedPipes(block, oldCenter, newCenter) {
    const newConnections = getConnectionPoints(block);
    const oldConnections = getConnectionPointsAtPosition(block, oldCenter);
    const REPAIR_TOLERANCE = 1; // ✅ 5cm -> 1cm daraltıldı (node'ları yutmamak için)

    (state.plumbingPipes || []).forEach(pipe => {
        let shouldUpdateStart = false;
        let shouldUpdateEnd = false;
        let startIndex = null;
        let endIndex = null;

        // --- P1 KONTROLÜ ---
        const isStartExplicitlyConnected = pipe.connections?.start?.blockId && (
            pipe.connections.start.blockId === block.id ||
            pipe.connections.start.blockId === block
        );

        if (isStartExplicitlyConnected) {
            startIndex = pipe.connections.start.connectionIndex;
            if (startIndex < newConnections.length) {
                shouldUpdateStart = true;
            }
        } else {
            // Fiziksel yakınlık kontrolü (tüm bloklar için)
            if (block.blockType === 'SERVIS_KUTUSU') {
                // Servis kutusu: Kenarlara yakınlık
                const oldCorners = getPlumbingBlockCorners({ ...block, center: oldCenter });
                for(let i=0; i<oldCorners.length; i++) {
                    const edgeP1 = oldCorners[i];
                    const edgeP2 = oldCorners[(i+1)%4];
                    
                    // Kenar segmentine olan mesafeyi hesapla
                    const dx = edgeP2.x - edgeP1.x;
                    const dy = edgeP2.y - edgeP1.y;
                    const lengthSq = dx * dx + dy * dy;
                    
                    if (lengthSq < 0.1) continue;
                    
                    let t = ((pipe.p1.x - edgeP1.x) * dx + (pipe.p1.y - edgeP1.y) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    
                    const closestX = edgeP1.x + t * dx;
                    const closestY = edgeP1.y + t * dy;
                    const distSq = (pipe.p1.x - closestX) ** 2 + (pipe.p1.y - closestY) ** 2;
                    
                    if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                        shouldUpdateStart = true;
                        startIndex = -1; // Kenara bağlı
                        break;
                    }
                }
            } else {
                // Diğer bloklar: Bağlantı noktalarına yakınlık
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
        const isEndExplicitlyConnected = pipe.connections?.end?.blockId && (
            pipe.connections.end.blockId === block.id ||
            pipe.connections.end.blockId === block
        );

        if (isEndExplicitlyConnected) {
            endIndex = pipe.connections.end.connectionIndex;
            if (endIndex < newConnections.length) {
                shouldUpdateEnd = true;
            }
        } else {
            // Fiziksel yakınlık kontrolü
            if (block.blockType === 'SERVIS_KUTUSU') {
                const oldCorners = getPlumbingBlockCorners({ ...block, center: oldCenter });
                for(let i=0; i<oldCorners.length; i++) {
                    const edgeP1 = oldCorners[i];
                    const edgeP2 = oldCorners[(i+1)%4];
                    
                    const dx = edgeP2.x - edgeP1.x;
                    const dy = edgeP2.y - edgeP1.y;
                    const lengthSq = dx * dx + dy * dy;
                    
                    if (lengthSq < 0.1) continue;
                    
                    let t = ((pipe.p2.x - edgeP1.x) * dx + (pipe.p2.y - edgeP1.y) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    
                    const closestX = edgeP1.x + t * dx;
                    const closestY = edgeP1.y + t * dy;
                    const distSq = (pipe.p2.x - closestX) ** 2 + (pipe.p2.y - closestY) ** 2;
                    
                    if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                        shouldUpdateEnd = true;
                        endIndex = -1;
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

        if (!shouldUpdateStart && !shouldUpdateEnd) return;

        const oldPipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

        // P1 güncelleme
        if (shouldUpdateStart) {
            if (startIndex !== -1 && startIndex < newConnections.length) {
                // Bağlantı noktasına bağlı
                const newConn = newConnections[startIndex];
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;
                if (!isStartExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.start = {
                        blockId: block.id || block,
                        connectionIndex: startIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // ✅ Kenara bağlı veya Servis Kutusu - basitçe delta kadar taşı
                const deltaX = newCenter.x - oldCenter.x;
                const deltaY = newCenter.y - oldCenter.y;
                pipe.p1.x += deltaX;
                pipe.p1.y += deltaY;
            }
        }

        // P2 güncelleme
        if (shouldUpdateEnd) {
            if (endIndex !== -1 && endIndex < newConnections.length) {
                // Bağlantı noktasına bağlı
                const newConn = newConnections[endIndex];
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;
                if (!isEndExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.end = {
                        blockId: block.id || block,
                        connectionIndex: endIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // ✅ Kenara bağlı veya Servis Kutusu - basitçe delta kadar taşı
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
    if (oldLength < 1) oldLength = newLength;

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

    const oldCorners = (block.blockType === 'SERVIS_KUTUSU') ? getPlumbingBlockCorners(tempBlock) : [];
    const newCorners = (block.blockType === 'SERVIS_KUTUSU') ? getPlumbingBlockCorners(block) : [];

    const REPAIR_TOLERANCE = 1; // ✅ 5cm -> 1cm (node'ları yutmamak için)

    (state.plumbingPipes || []).forEach(pipe => {
        let shouldUpdateStart = false;
        let shouldUpdateEnd = false;
        let startIndex = null;
        let endIndex = null;

        // P1 kontrolü
        const isStartExplicitlyConnected = pipe.connections?.start?.blockId && (
            pipe.connections.start.blockId === block.id ||
            pipe.connections.start.blockId === block
        );

        if (isStartExplicitlyConnected) {
            startIndex = pipe.connections.start.connectionIndex;
            if (startIndex < newConnections.length) {
                shouldUpdateStart = true;
            }
        } else {
            if (block.blockType === 'SERVIS_KUTUSU') {
                for(let i=0; i<oldCorners.length; i++) {
                    const edgeP1 = oldCorners[i];
                    const edgeP2 = oldCorners[(i+1)%4];
                    
                    const dx = edgeP2.x - edgeP1.x;
                    const dy = edgeP2.y - edgeP1.y;
                    const lengthSq = dx * dx + dy * dy;
                    
                    if (lengthSq < 0.1) continue;
                    
                    let t = ((pipe.p1.x - edgeP1.x) * dx + (pipe.p1.y - edgeP1.y) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    
                    const closestX = edgeP1.x + t * dx;
                    const closestY = edgeP1.y + t * dy;
                    const distSq = (pipe.p1.x - closestX) ** 2 + (pipe.p1.y - closestY) ** 2;
                    
                    if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                        shouldUpdateStart = true;
                        startIndex = -1;
                        break;
                    }
                }
            } else {
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

        // P2 kontrolü
        const isEndExplicitlyConnected = pipe.connections?.end?.blockId && (
            pipe.connections.end.blockId === block.id ||
            pipe.connections.end.blockId === block
        );

        if (isEndExplicitlyConnected) {
            endIndex = pipe.connections.end.connectionIndex;
            if (endIndex < newConnections.length) {
                shouldUpdateEnd = true;
            }
        } else {
            if (block.blockType === 'SERVIS_KUTUSU') {
                for(let i=0; i<oldCorners.length; i++) {
                    const edgeP1 = oldCorners[i];
                    const edgeP2 = oldCorners[(i+1)%4];
                    
                    const dx = edgeP2.x - edgeP1.x;
                    const dy = edgeP2.y - edgeP1.y;
                    const lengthSq = dx * dx + dy * dy;
                    
                    if (lengthSq < 0.1) continue;
                    
                    let t = ((pipe.p2.x - edgeP1.x) * dx + (pipe.p2.y - edgeP1.y) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    
                    const closestX = edgeP1.x + t * dx;
                    const closestY = edgeP1.y + t * dy;
                    const distSq = (pipe.p2.x - closestX) ** 2 + (pipe.p2.y - closestY) ** 2;
                    
                    if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                        shouldUpdateEnd = true;
                        endIndex = -1;
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

        // P1 güncelle
        if (shouldUpdateStart) {
            if (startIndex !== -1 && startIndex < newConnections.length) {
                const newConn = newConnections[startIndex];
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;
                if (!isStartExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.start = {
                        blockId: block.id || block,
                        connectionIndex: startIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // Kenara bağlı - en yakın yeni kenara snap et
                let closestDistSq = Infinity;
                let snapPoint = { x: pipe.p1.x, y: pipe.p1.y };
                for(let i=0; i<newCorners.length; i++) {
                    const edgeP1 = newCorners[i];
                    const edgeP2 = newCorners[(i+1)%4];
                    
                    const dx = edgeP2.x - edgeP1.x;
                    const dy = edgeP2.y - edgeP1.y;
                    const lengthSq = dx * dx + dy * dy;
                    
                    if (lengthSq < 0.1) continue;
                    
                    let t = ((pipe.p1.x - edgeP1.x) * dx + (pipe.p1.y - edgeP1.y) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    
                    const closestX = edgeP1.x + t * dx;
                    const closestY = edgeP1.y + t * dy;
                    const distSq = (pipe.p1.x - closestX) ** 2 + (pipe.p1.y - closestY) ** 2;
                    
                    if (distSq < closestDistSq) {
                        closestDistSq = distSq;
                        snapPoint = { x: closestX, y: closestY };
                    }
                }
                pipe.p1.x = snapPoint.x;
                pipe.p1.y = snapPoint.y;
            }
        }

        // P2 güncelle
        if (shouldUpdateEnd) {
            if (endIndex !== -1 && endIndex < newConnections.length) {
                const newConn = newConnections[endIndex];
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;
                if (!isEndExplicitlyConnected) {
                    if (!pipe.connections) pipe.connections = { start: null, end: null };
                    pipe.connections.end = {
                        blockId: block.id || block,
                        connectionIndex: endIndex,
                        blockType: block.blockType
                    };
                }
            } else {
                // Kenara bağlı - en yakın yeni kenara snap et
                let closestDistSq = Infinity;
                let snapPoint = { x: pipe.p2.x, y: pipe.p2.y };
                for(let i=0; i<newCorners.length; i++) {
                    const edgeP1 = newCorners[i];
                    const edgeP2 = newCorners[(i+1)%4];
                    
                    const dx = edgeP2.x - edgeP1.x;
                    const dy = edgeP2.y - edgeP1.y;
                    const lengthSq = dx * dx + dy * dy;
                    
                    if (lengthSq < 0.1) continue;
                    
                    let t = ((pipe.p2.x - edgeP1.x) * dx + (pipe.p2.y - edgeP1.y) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    
                    const closestX = edgeP1.x + t * dx;
                    const closestY = edgeP1.y + t * dy;
                    const distSq = (pipe.p2.x - closestX) ** 2 + (pipe.p2.y - closestY) ** 2;
                    
                    if (distSq < closestDistSq) {
                        closestDistSq = distSq;
                        snapPoint = { x: closestX, y: closestY };
                    }
                }
                pipe.p2.x = snapPoint.x;
                pipe.p2.y = snapPoint.y;
            }
        }
    });
}

function getConnectionPointsAtPosition(block, center) {
    if (block.blockType === 'SERVIS_KUTUSU') {
        return [];
    }

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
        index: index,
        z: cp.z
    }));
}

export function deletePlumbingBlock(block) {
    if (block.blockType === 'SAYAC' || block.blockType === 'VANA') {
        mergePipesAfterBlockDeletion(block);
    } else if (block.blockType === 'SERVIS_KUTUSU') {
        clearConnectionsToBlock(block);
    }

    const index = state.plumbingBlocks?.indexOf(block);
    if (index !== undefined && index > -1) {
        state.plumbingBlocks.splice(index, 1);
        return true;
    }
    return false;
}

function clearConnectionsToBlock(block) {
    const REPAIR_TOLERANCE = 1; // ✅ 5cm -> 1cm (node'ları yutmamak için)
    const corners = getPlumbingBlockCorners(block);

    (state.plumbingPipes || []).forEach(pipe => {
        let p1Near = false;
        for(let i=0; i<corners.length; i++) {
            const edgeP1 = corners[i];
            const edgeP2 = corners[(i+1)%4];
            
            const dx = edgeP2.x - edgeP1.x;
            const dy = edgeP2.y - edgeP1.y;
            const lengthSq = dx * dx + dy * dy;
            
            if (lengthSq < 0.1) continue;
            
            let t = ((pipe.p1.x - edgeP1.x) * dx + (pipe.p1.y - edgeP1.y) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t));
            
            const closestX = edgeP1.x + t * dx;
            const closestY = edgeP1.y + t * dy;
            const distSq = (pipe.p1.x - closestX) ** 2 + (pipe.p1.y - closestY) ** 2;
            
            if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
                p1Near = true;
                break;
            }
        }
        if (p1Near && pipe.connections?.start) {
            console.log(`Clearing implicit connection for pipe (P1) from deleted ${block.blockType}`);
            pipe.connections.start = null;
        }

        let p2Near = false;
        for(let i=0; i<corners.length; i++) {
            const edgeP1 = corners[i];
            const edgeP2 = corners[(i+1)%4];
            
            const dx = edgeP2.x - edgeP1.x;
            const dy = edgeP2.y - edgeP1.y;
            const lengthSq = dx * dx + dy * dy;
            
            if (lengthSq < 0.1) continue;
            
            let t = ((pipe.p2.x - edgeP1.x) * dx + (pipe.p2.y - edgeP1.y) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t));
            
            const closestX = edgeP1.x + t * dx;
            const closestY = edgeP1.y + t * dy;
            const distSq = (pipe.p2.x - closestX) ** 2 + (pipe.p2.y - closestY) ** 2;
            
            if (distSq < REPAIR_TOLERANCE * REPAIR_TOLERANCE) {
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

        if (pipe1Info.end === 'p1') {
            pipe1.p1 = (pipe2Info.end === 'p2') ? pipe2.p1 : pipe2.p2;
            pipe1.connections.start = (pipe2Info.end === 'p2') ? pipe2.connections.start : pipe2.connections.end;
        } else {
            pipe1.p2 = (pipe2Info.end === 'p2') ? pipe2.p1 : pipe2.p2;
            pipe1.connections.end = (pipe2Info.end === 'p2') ? pipe2.connections.start : pipe2.connections.end;
        }

        pipe1.valves = [...(pipe1.valves || []), ...(pipe2.valves || [])];
        pipe1.isConnectedToValve = pipe1.isConnectedToValve || pipe2.isConnectedToValve;

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

    cleanupVeryShortPipes();
}

export function getDefaultRotationForWall(wallAngle) {
    return Math.round((wallAngle + 90) / 15) * 15;
}