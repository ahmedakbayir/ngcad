// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/architectural-objects/plumbing-pipes.js
// GÜNCELLENDİ: Boru gövde taşıma devre dışı bırakıldı
// GÜNCELLENDİ: Vana taşıma için boru uzunluğu kontrolleri eklendi

import { state, setState } from '../general-files/main.js';
import { getPlumbingBlockAtPoint, getConnectionPoints } from './plumbing-blocks.js';

/**
 * TESİSAT BORULARI - Tesisat nesnelerini birbirine bağlayan borular
 */
 
export const PLUMBING_PIPE_TYPES = {
    STANDARD: {
        id: 'standard',
        name: 'Standart Boru',
        diameter: 2,        // 2 cm çap
        color: 0x2d7a2d,    // Koyu yeşil
        lineWidth: 6,       // 2D çizgi kalınlığı (piksel) - 2 kat kalın
    },
    THICK: {
        id: 'thick',
        name: 'Kalın Boru',
        diameter: 4,        // 4 cm çap
        color: 0x1b5e20,    // Daha koyu yeşil
        lineWidth: 10,      // 2D çizgi kalınlığı (piksel)
    }
};

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
        connections: {
            start: null,
            end: null
        },
        isConnectedToValve: false,
        valves: []
    };
}

export function isPointOnPipe(point, pipe, tolerance = 5) {
    const { p1, p2 } = pipe;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq < 0.01) return false;

    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;

    const distSq = (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
    return distSq < tolerance * tolerance;
}

export function snapToConnectionPoint(point, tolerance = 10, filterFn = null) {
    const currentFloorId = state.currentFloor?.id;
    let blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);

    if (filterFn) {
        blocks = blocks.filter(filterFn);
    }

    let closestSnap = null;
    let minDist = tolerance;

    for (const block of blocks) {
        const connections = getConnectionPoints(block);

        for (let i = 0; i < connections.length; i++) {
            const cp = connections[i];
            const dist = Math.hypot(point.x - cp.x, point.y - cp.y);

            if (dist < minDist) {
                if (block.blockType === 'SAYAC' || block.blockType === 'VANA') {
                    const CONNECTION_TOLERANCE = 5;
                    const isOccupied = (state.plumbingPipes || []).some(pipe =>
                        Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < CONNECTION_TOLERANCE ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < CONNECTION_TOLERANCE
                    );

                    if (isOccupied) {
                        continue;
                    }
                }

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

export function snapToPipeEndpoint(point, tolerance = 10, selfPipe = null) {
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    let closestSnap = null;
    let minDist = tolerance;

    for (const pipe of pipes) {
        if (pipe === selfPipe) continue;

        const dist1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y);
        if (dist1 < minDist) {
            minDist = dist1;
            closestSnap = {
                x: pipe.p1.x,
                y: pipe.p1.y,
                pipe: pipe,
                endpoint: 'p1'
            };
        }

        const dist2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y);
        if (dist2 < minDist) {
            minDist = dist2;
            closestSnap = {
                x: pipe.p2.x,
                y: pipe.p2.y,
                pipe: pipe,
                endpoint: 'p2'
            };
        }
    }

    return closestSnap;
}

export function getPipeAtPoint(point, tolerance = 8) {
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    for (const pipe of [...pipes].reverse()) {
        if (isPointOnPipe(point, pipe, tolerance)) {
            const distP1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y);
            const distP2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y);

            if (distP1 < tolerance) {
                return { type: 'plumbingPipe', object: pipe, handle: 'p1' };
            } else if (distP2 < tolerance) {
                return { type: 'plumbingPipe', object: pipe, handle: 'p2' };
            } else {
                return { type: 'plumbingPipe', object: pipe, handle: 'body' };
            }
        }
    }

    return null;
}

export function deletePlumbingPipe(pipe) {
    const index = state.plumbingPipes?.indexOf(pipe);
    if (index !== undefined && index > -1) {
        state.plumbingPipes.splice(index, 1);
        return true;
    }
    return false;
}

export function findAllConnectedComponents(startObject, startType) {
    const queue = [{ object: startObject, type: startType }];
    const visited = new Set();
    const components = {
        blocks: new Set(),
        pipes: new Set()
    };
    const tolerance = 15;

    const allPipes = state.plumbingPipes || [];
    const allBlocks = state.plumbingBlocks || [];

    while (queue.length > 0) {
        const current = queue.shift();
        
        const visitedKey = current.object; 
        if (visited.has(visitedKey)) continue;
        visited.add(visitedKey);

        if (current.type === 'plumbingBlock') {
            const block = current.object;
            components.blocks.add(block);
            const blockConnections = getConnectionPoints(block);

            allPipes.forEach(pipe => {
                if (visited.has(pipe)) return;
                for (const cp of blockConnections) {
                    if (Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < tolerance ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < tolerance) {
                        queue.push({ object: pipe, type: 'plumbingPipe' });
                        break;
                    }
                }
            });
        } 
        else if (current.type === 'plumbingPipe') {
            const pipe = current.object;
            components.pipes.add(pipe);

            allBlocks.forEach(block => {
                if (visited.has(block)) return;
                const blockConnections = getConnectionPoints(block);
                for (const cp of blockConnections) {
                    if (Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < tolerance ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < tolerance) {
                        queue.push({ object: block, type: 'plumbingBlock' });
                        break;
                    }
                }
            });

            allPipes.forEach(otherPipe => {
                if (otherPipe === pipe || visited.has(otherPipe)) return;
                if (Math.hypot(pipe.p1.x - otherPipe.p1.x, pipe.p1.y - otherPipe.p1.y) < tolerance ||
                    Math.hypot(pipe.p1.x - otherPipe.p2.x, pipe.p1.y - otherPipe.p2.y) < tolerance ||
                    Math.hypot(pipe.p2.x - otherPipe.p1.x, pipe.p2.y - otherPipe.p1.y) < tolerance ||
                    Math.hypot(pipe.p2.x - otherPipe.p2.x, pipe.p2.y - otherPipe.p2.y) < tolerance) {
                    queue.push({ object: otherPipe, type: 'plumbingPipe' });
                }
            });
        }
    }
    return components;
}

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

export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingPipe') return false;

    const { pipe, handle, startPos, startP1, startP2 } = dragState;
    
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;

    if (handle === 'p1' || handle === 'p2') {
        const targetPoint = (handle === 'p1') ? pipe.p1 : pipe.p2;
        const startPoint = (handle === 'p1') ? startP1 : startP2;

        targetPoint.x = snappedPos.x;
        targetPoint.y = snappedPos.y;

        const snap = snapToConnectionPoint(targetPoint, 15) || snapToPipeEndpoint(targetPoint, 15, pipe);
        if (snap) {
            targetPoint.x = snap.x;
            targetPoint.y = snap.y;
        }
        return true;
        
    } else if (handle === 'body') {
        // GÖVDE HAREKETİ DEVRE DIŞI
        // Boru gövdeden taşınamaz, sadece uçlardan taşınabilir
        return false;
    }

    return false;
}

/**
 * Boru üzerinde vana için yer olup olmadığını kontrol eder
 * GÜNCELLENDİ: Boru uçlarından 1 cm mesafe kontrolü eklendi
 */
export function isSpaceForValve(pipe, pos, valveWidth = 12, excludeValve = null) {
    const MIN_MARGIN = 1; // Uç noktalara minimum mesafe - 5 cm'den 1 cm'ye düşürüldü
    const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

    // Boru uçlarına çok yakınsa izin verme
    if (pos - valveWidth / 2 < MIN_MARGIN || pos + valveWidth / 2 > pipeLength - MIN_MARGIN) {
        return false;
    }

    // Diğer vanalarla çakışma kontrolü
    for (const valve of (pipe.valves || [])) {
        if (valve === excludeValve) continue;

        const otherStart = valve.pos - valve.width / 2;
        const otherEnd = valve.pos + valve.width / 2;
        const newStart = pos - valveWidth / 2;
        const newEnd = pos + valveWidth / 2;

        if (!(newEnd <= otherStart || newStart >= otherEnd)) {
            return false;
        }
    }

    return true;
}

/**
 * Bir noktada vana var mı kontrol eder
 */
export function getValveAtPoint(point, tolerance = 8) {
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    for (const pipe of pipes) {
        if (!pipe.valves || pipe.valves.length === 0) continue;

        const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
        if (pipeLength < 0.1) continue;

        const dx = (pipe.p2.x - pipe.p1.x) / pipeLength;
        const dy = (pipe.p2.y - pipe.p1.y) / pipeLength;

        for (const valve of pipe.valves) {
            const valveCenterX = pipe.p1.x + dx * valve.pos;
            const valveCenterY = pipe.p1.y + dy * valve.pos;

            const dist = Math.hypot(point.x - valveCenterX, point.y - valveCenterY);

            if (dist < tolerance) {
                return {
                    type: 'valve',
                    object: valve,
                    pipe: pipe,
                    handle: 'body'
                };
            }
        }
    }

    return null;
}

/**
 * YENİ FONKSİYON: Boru üzerindeki tüm vanaların toplam uzunluğunu hesapla
 */
export function getTotalValveLength(pipe) {
    if (!pipe.valves || pipe.valves.length === 0) return 0;
    
    return pipe.valves.reduce((sum, valve) => sum + (valve.width || 12), 0);
}

/**
 * YENİ FONKSİYON: Vana taşıma için pozisyon sınırını hesapla
 * Vana, borunun baştan ve sondan 1 cm kalana kadar taşınabilir
 */
export function getValveMovementLimits(pipe, valve) {
    const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
    const valveWidth = valve.width || 12;
    const MIN_MARGIN = 1; // 1 cm kenar boşluğu

    return {
        minPos: MIN_MARGIN + valveWidth / 2,
        maxPos: pipeLength - MIN_MARGIN - valveWidth / 2,
        pipeLength: pipeLength
    };
}

/**
 * YENİ FONKSİYON: Boru uzunluğu değiştiğinde vana pozisyonlarını güncelle
 * Vanaların toplam uzunluğu + 2 cm'den daha fazla kısalmasın kontrolü
 */
export function updateValvePositionsOnPipeResize(pipe, oldLength, newLength) {
    if (!pipe.valves || pipe.valves.length === 0) return true;

    const totalValveLength = getTotalValveLength(pipe);
    const MIN_REQUIRED_LENGTH = totalValveLength + 2; // +2 cm: her uçtan 1 cm

    // Boru çok kısaldıysa izin verme
    if (newLength < MIN_REQUIRED_LENGTH) {
        console.warn(`Boru çok kısa! Minimum gerekli uzunluk: ${MIN_REQUIRED_LENGTH.toFixed(1)} cm`);
        return false;
    }

    // Vana pozisyonlarını oranla güncelle
    const ratio = newLength / oldLength;
    pipe.valves.forEach(valve => {
        valve.pos = valve.pos * ratio;
        
        // Sınırlar içinde tut (1 cm kenar boşluğu)
        const limits = getValveMovementLimits(pipe, valve);
        valve.pos = Math.max(limits.minPos, Math.min(limits.maxPos, valve.pos));
    });

    return true;
}