// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/architectural-objects/plumbing-pipes.js
// GÜNCELLENDİ: Node-based hareket - REFERANS kontrolü ile (pozisyon değil)
// GÜNCELLENDİ: Silme ve birleştirme fonksiyonları eklendi

import { state, setState } from '../general-files/main.js';
import { getPlumbingBlockAtPoint, getConnectionPoints } from './plumbing-blocks.js';

export const PLUMBING_PIPE_TYPES = {
    STANDARD: {
        id: 'standard',
        name: 'Standart Boru',
        diameter: 2,
        color: 0x2d7a2d,
        lineWidth: 6,
    },
    THICK: {
        id: 'thick',
        name: 'Kalın Boru',
        diameter: 4,
        color: 0x1b5e20,
        lineWidth: 10,
    }
};

/**
 * Mevcut borularda verilen koordinata sahip node'u arar.
 * Bulursa o node'u döndürür, bulamazsa yeni bir node oluşturur.
 */
function getOrCreateNode(x, y, tolerance = 2) {
    // Mevcut borularda bu koordinata sahip bir node var mı?
    for (const pipe of (state.plumbingPipes || [])) {
        // p1'i kontrol et
        if (Math.abs(pipe.p1.x - x) < tolerance && Math.abs(pipe.p1.y - y) < tolerance) {
            return pipe.p1;
        }
        // p2'yi kontrol et
        if (Math.abs(pipe.p2.x - x) < tolerance && Math.abs(pipe.p2.y - y) < tolerance) {
            return pipe.p2;
        }
    }

    // Bulunamadı, yeni node oluştur
    return { x, y };
}

export function createPlumbingPipe(x1, y1, x2, y2, pipeType = 'STANDARD') {
    const typeConfig = PLUMBING_PIPE_TYPES[pipeType];

    if (!typeConfig) {
        console.error(`Geçersiz boru tipi: ${pipeType}`);
        return null;
    }

    // Node paylaşımı: Aynı koordinatta mevcut node varsa onu kullan
    const p1 = getOrCreateNode(x1, y1);
    const p2 = getOrCreateNode(x2, y2);

    return {
        type: 'plumbingPipe',
        pipeType: pipeType,
        p1: p1,
        p2: p2,
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
                    const isOccupiedByConnection = (state.plumbingPipes || []).some(pipe => {
                        const p1Connected = pipe.connections?.start?.blockId &&
                            (pipe.connections.start.blockId === block.id || pipe.connections.start.blockId === block) &&
                            pipe.connections.start.connectionIndex === i;

                        const p2Connected = pipe.connections?.end?.blockId &&
                            (pipe.connections.end.blockId === block.id || pipe.connections.end.blockId === block) &&
                            pipe.connections.end.connectionIndex === i;

                        return p1Connected || p2Connected;
                    });

                    const CONNECTION_TOLERANCE = 10;
                    const isOccupiedByPosition = (state.plumbingPipes || []).some(pipe =>
                        Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < CONNECTION_TOLERANCE ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < CONNECTION_TOLERANCE
                    );

                    if (isOccupiedByConnection || isOccupiedByPosition) {
                        continue;
                    }
                } else if (block.blockType === 'SERVIS_KUTUSU') {
                    const isOccupiedByConnection = (state.plumbingPipes || []).some(pipe => {
                        const p1Connected = pipe.connections?.start?.blockId &&
                            (pipe.connections.start.blockId === block.id || pipe.connections.start.blockId === block) &&
                            pipe.connections.start.connectionIndex === i;

                        const p2Connected = pipe.connections?.end?.blockId &&
                            (pipe.connections.end.blockId === block.id || pipe.connections.end.blockId === block) &&
                            pipe.connections.end.connectionIndex === i;

                        return p1Connected || p2Connected;
                    });

                    const CONNECTION_TOLERANCE = 10;
                    const isOccupiedByPosition = (state.plumbingPipes || []).some(pipe =>
                        Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < CONNECTION_TOLERANCE ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < CONNECTION_TOLERANCE
                    );

                    if (isOccupiedByConnection || isOccupiedByPosition) {
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

/**
 * ⭐ YENİ FONKSİYON: Boru sil ve komşu boruları birleştir
 *
 * Senaryolar:
 * 1. Her iki uçta 1'er boru → birleştir
 * 2. Sadece bir uçta boru → o ucu diğer uca çek
 * 3. Hiç boru yok veya 2'den fazla → sadece sil
 *
 * ⭐ GÜNCELLENDİ: Node referansı + pozisyon + blok bağlantısı kontrolü
 */
export function deletePlumbingPipeAndMerge(pipeToDelete) {
    const tolerance = 2; // 2 cm - aynı noktada kabul edilme

    // Silinecek borunun uç noktaları ve bağlantıları
    const p1Node = pipeToDelete.p1;
    const p2Node = pipeToDelete.p2;
    const p1Coord = { x: p1Node.x, y: p1Node.y };
    const p2Coord = { x: p2Node.x, y: p2Node.y };
    const p1Connection = pipeToDelete.connections?.start;
    const p2Connection = pipeToDelete.connections?.end;

    // Bu uç noktalara bağlı BAŞKA boruları bul
    // Üç yöntem: 1) Node referansı, 2) Pozisyon, 3) Blok bağlantısı
    const pipesAtP1 = [];
    const pipesAtP2 = [];

    (state.plumbingPipes || []).forEach(pipe => {
        if (pipe === pipeToDelete) return;

        // P1'e bağlı borular - 3 kontrol yöntemi
        // 1) Node referansı (en güvenilir)
        if (pipe.p1 === p1Node || pipe.p2 === p1Node) {
            const end = pipe.p1 === p1Node ? 'p1' : 'p2';
            pipesAtP1.push({ pipe, end });
        }
        // 2) Pozisyon kontrolü (node referansı yoksa)
        else if (Math.hypot(pipe.p1.x - p1Coord.x, pipe.p1.y - p1Coord.y) < tolerance) {
            pipesAtP1.push({ pipe, end: 'p1' });
        } else if (Math.hypot(pipe.p2.x - p1Coord.x, pipe.p2.y - p1Coord.y) < tolerance) {
            pipesAtP1.push({ pipe, end: 'p2' });
        }
        // 3) Blok bağlantısı kontrolü (explicit connection)
        else if (p1Connection?.blockId && (
            (pipe.connections?.start?.blockId === p1Connection.blockId &&
             pipe.connections.start.connectionIndex === p1Connection.connectionIndex) ||
            (pipe.connections?.end?.blockId === p1Connection.blockId &&
             pipe.connections.end.connectionIndex === p1Connection.connectionIndex)
        )) {
            const end = pipe.connections?.start?.blockId === p1Connection.blockId ? 'p1' : 'p2';
            pipesAtP1.push({ pipe, end });
        }

        // P2'ye bağlı borular - 3 kontrol yöntemi
        // 1) Node referansı (en güvenilir)
        if (pipe.p1 === p2Node || pipe.p2 === p2Node) {
            const end = pipe.p1 === p2Node ? 'p1' : 'p2';
            // Aynı boruyu iki kez ekleme (eğer her iki uç da aynı node'a bağlıysa)
            if (!pipesAtP1.some(p => p.pipe === pipe)) {
                pipesAtP2.push({ pipe, end });
            }
        }
        // 2) Pozisyon kontrolü (node referansı yoksa)
        else if (Math.hypot(pipe.p1.x - p2Coord.x, pipe.p1.y - p2Coord.y) < tolerance) {
            if (!pipesAtP1.some(p => p.pipe === pipe)) {
                pipesAtP2.push({ pipe, end: 'p1' });
            }
        } else if (Math.hypot(pipe.p2.x - p2Coord.x, pipe.p2.y - p2Coord.y) < tolerance) {
            if (!pipesAtP1.some(p => p.pipe === pipe)) {
                pipesAtP2.push({ pipe, end: 'p2' });
            }
        }
        // 3) Blok bağlantısı kontrolü (explicit connection)
        else if (p2Connection?.blockId && (
            (pipe.connections?.start?.blockId === p2Connection.blockId &&
             pipe.connections.start.connectionIndex === p2Connection.connectionIndex) ||
            (pipe.connections?.end?.blockId === p2Connection.blockId &&
             pipe.connections.end.connectionIndex === p2Connection.connectionIndex)
        )) {
            if (!pipesAtP1.some(p => p.pipe === pipe)) {
                const end = pipe.connections?.start?.blockId === p2Connection.blockId ? 'p1' : 'p2';
                pipesAtP2.push({ pipe, end });
            }
        }
    });

    // Duplicate removal (aynı boru hem p1 hem p2'de olabilir)
    const uniquePipesAtP1 = Array.from(new Map(pipesAtP1.map(item => [item.pipe, item])).values());
    const uniquePipesAtP2 = Array.from(new Map(pipesAtP2.map(item => [item.pipe, item])).values());

    console.log(`🗑️ Deleting pipe, p1 has ${uniquePipesAtP1.length} connections, p2 has ${uniquePipesAtP2.length} connections`);

    // BORU SİL
    const index = state.plumbingPipes.indexOf(pipeToDelete);
    if (index > -1) {
        state.plumbingPipes.splice(index, 1);
    }

    // ⭐ SENARYO 1: Her iki uçta TAM 1 boru varsa, bu boruları birleştir
    if (uniquePipesAtP1.length === 1 && uniquePipesAtP2.length === 1) {
        const pipe1Info = uniquePipesAtP1[0];
        const pipe2Info = uniquePipesAtP2[0];

        // Aynı boru değillerse birleştir
        if (pipe1Info.pipe !== pipe2Info.pipe) {
            const pipe1 = pipe1Info.pipe;
            const pipe2 = pipe2Info.pipe;

            // Yeni birleştirilmiş boru oluştur - NODE PAYLAŞIMI ile
            const newP1Node = pipe1Info.end === 'p1' ? pipe1.p2 : pipe1.p1;
            const newP2Node = pipe2Info.end === 'p2' ? pipe2.p1 : pipe2.p2;

            const mergedPipe = {
                type: 'plumbingPipe',
                pipeType: pipe1.pipeType || 'STANDARD',
                p1: newP1Node,  // Node referansını paylaş
                p2: newP2Node,  // Node referansını paylaş
                floorId: pipe1.floorId,
                typeConfig: pipe1.typeConfig,
                isConnectedToValve: pipe1.isConnectedToValve || pipe2.isConnectedToValve,
                connections: {
                    start: pipe1Info.end === 'p1' ? pipe1.connections.end : pipe1.connections.start,
                    end: pipe2Info.end === 'p2' ? pipe2.connections.start : pipe2.connections.end
                },
                valves: [...(pipe1.valves || []), ...(pipe2.valves || [])] // Vanaları birleştir
            };

            // Eski boruları sil
            const idx1 = state.plumbingPipes.indexOf(pipe1);
            const idx2 = state.plumbingPipes.indexOf(pipe2);

            if (idx1 > -1) state.plumbingPipes.splice(idx1, 1);
            if (idx2 > -1) {
                const newIdx2 = state.plumbingPipes.indexOf(pipe2);
                if (newIdx2 > -1) state.plumbingPipes.splice(newIdx2, 1);
            }

            // Yeni boruyu ekle
            state.plumbingPipes.push(mergedPipe);

            console.log('✅ Pipes merged after deletion (with node sharing)');
        }
    }
    // ⭐ SENARYO 2: p1'de hiç boru yoksa ama p2'de 1 boru varsa → İleriye çek
    else if (uniquePipesAtP1.length === 0 && uniquePipesAtP2.length === 1) {
        const pipeInfo = uniquePipesAtP2[0];
        const pipe = pipeInfo.pipe;

        // p2'deki borunun ucunu p1'e çek (node'u güncelle)
        const targetNode = pipeInfo.end === 'p1' ? pipe.p1 : pipe.p2;
        targetNode.x = p1Coord.x;
        targetNode.y = p1Coord.y;

        // Bağlantıyı güncelle (eğer p1'de blok bağlantısı varsa)
        if (p1Connection) {
            const connectionKey = pipeInfo.end === 'p1' ? 'start' : 'end';
            pipe.connections[connectionKey] = p1Connection;
        }

        console.log('✅ Forward pipe pulled back to p1');
    }
    // ⭐ SENARYO 3: p2'de hiç boru yoksa ama p1'de 1 boru varsa → Geriye çek
    else if (uniquePipesAtP2.length === 0 && uniquePipesAtP1.length === 1) {
        const pipeInfo = uniquePipesAtP1[0];
        const pipe = pipeInfo.pipe;

        // p1'deki borunun ucunu p2'ye çek (node'u güncelle)
        const targetNode = pipeInfo.end === 'p1' ? pipe.p1 : pipe.p2;
        targetNode.x = p2Coord.x;
        targetNode.y = p2Coord.y;

        // Bağlantıyı güncelle (eğer p2'de blok bağlantısı varsa)
        if (p2Connection) {
            const connectionKey = pipeInfo.end === 'p1' ? 'start' : 'end';
            pipe.connections[connectionKey] = p2Connection;
        }

        console.log('✅ Backward pipe pulled forward to p2');
    }
    // SENARYO 4: Hiç boru yok veya 2'den fazla → sadece silindi
    else {
        console.log('ℹ️ Pipe deleted without merging (no adjacent pipes or too many)');
    }
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
        startP2: { ...pipe.p2 },
        lastValidP1: { ...pipe.p1 },
        lastValidP2: { ...pipe.p2 }
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
 * GÜNCELLENDİ: Node-based hareket - REFERANS kontrolü (pozisyon değil!)
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingPipe') return false;

    const { pipe, handle, startPos, startP1, startP2 } = dragState;
    
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;

    if (handle === 'p1' || handle === 'p2') {
        // P1/P2 HAREKETİ (NODE-BASED MOVEMENT)
        
        const targetPoint = (handle === 'p1') ? pipe.p1 : pipe.p2;
        const otherPoint = (handle === 'p1') ? pipe.p2 : pipe.p1;
        const startPoint = (handle === 'p1') ? startP1 : startP2;
        const lastValidTarget = (handle === 'p1') ? dragState.lastValidP1 : dragState.lastValidP2;

        // Hedef pozisyonu snaplenmiş fare pozisyonu olarak ayarla
        const newX = snappedPos.x;
        const newY = snappedPos.y;

        // Bağlantı noktasına snap (hem blok hem boru ucu)
        const snap = snapToConnectionPoint({ x: newX, y: newY }, 15) || snapToPipeEndpoint({ x: newX, y: newY }, 15, pipe);
        
        let finalX = newX;
        let finalY = newY;
        
        if (snap) {
            finalX = snap.x;
            finalY = snap.y;

            // Snap yapıldıysa bağlantı bilgisini güncelle
            const connectionKey = handle === 'p1' ? 'start' : 'end';
            if (!pipe.connections) pipe.connections = { start: null, end: null };

            if (snap.block) {
                pipe.connections[connectionKey] = {
                    blockId: snap.block.id || snap.block,
                    connectionIndex: snap.connectionIndex,
                    blockType: snap.block.blockType
                };
            } else {
                pipe.connections[connectionKey] = null;
            }
        } else {
            const connectionKey = handle === 'p1' ? 'start' : 'end';
            if (pipe.connections?.[connectionKey]?.blockId) {
                console.log(`⚠️ Boru ucu bloğa bağlıyken snap alanından çıktı, bağlantı koparıldı`);
                pipe.connections[connectionKey] = null;
            }
        }

        // ⭐ DÜZELTME: Hem referans hem pozisyon kontrolü (eski borular için)
        // Aynı koordinattaki borular birlikte taşınmalı

        const oldX = targetPoint.x;
        const oldY = targetPoint.y;
        const POSITION_TOLERANCE = 2; // 2 cm tolerans

        (state.plumbingPipes || []).forEach(otherPipe => {
            if (otherPipe === pipe) {
                return;
            }

            // ⭐ 1. REFERANS KONTROLÜ: AYNI DÜĞÜM MÜ?
            const p1SameRef = (otherPipe.p1 === targetPoint);
            const p2SameRef = (otherPipe.p2 === targetPoint);

            // ⭐ 2. POZİSYON KONTROLÜ: AYNI KOORDINATTA MI?
            const p1SamePos = Math.hypot(otherPipe.p1.x - oldX, otherPipe.p1.y - oldY) < POSITION_TOLERANCE;
            const p2SamePos = Math.hypot(otherPipe.p2.x - oldX, otherPipe.p2.y - oldY) < POSITION_TOLERANCE;

            // P1 taşınmalı mı? (referans VEYA pozisyon)
            if (p1SameRef || p1SamePos) {
                otherPipe.p1.x = finalX;
                otherPipe.p1.y = finalY;
                if (p1SameRef) {
                    console.log(`🔗 P1 is THE SAME NODE (ref) - moved together`);
                } else {
                    console.log(`🔗 P1 is AT SAME POSITION - moved together & merged`);
                    // Node referansını birleştir
                    otherPipe.p1 = targetPoint;
                }
            }

            // P2 taşınmalı mı? (referans VEYA pozisyon)
            if (p2SameRef || p2SamePos) {
                otherPipe.p2.x = finalX;
                otherPipe.p2.y = finalY;
                if (p2SameRef) {
                    console.log(`🔗 P2 is THE SAME NODE (ref) - moved together`);
                } else {
                    console.log(`🔗 P2 is AT SAME POSITION - moved together & merged`);
                    // Node referansını birleştir
                    otherPipe.p2 = targetPoint;
                }
            }
        });

        // Seçili borunun ucunu güncelle
        targetPoint.x = finalX;
        targetPoint.y = finalY;

        // Kural 1 (Vana Limiti): Minimum uzunluk kontrolü
        const totalValveWidth = (pipe.valves || []).reduce((sum, v) => sum + v.width, 0);
        const minPipeLength = totalValveWidth + 20;
        const newPipeLength = Math.hypot(targetPoint.x - otherPoint.x, targetPoint.y - otherPoint.y);

        if (newPipeLength < minPipeLength) {
            // Eğer yeni uzunluk limitten azsa, tüm boruları eski pozisyona geri dön
            targetPoint.x = lastValidTarget.x;
            targetPoint.y = lastValidTarget.y;

            // ⭐ DÜZELTME: Aynı düğümü (referans VEYA pozisyon) kullanan boruları da geri al
            (state.plumbingPipes || []).forEach(otherPipe => {
                if (otherPipe === pipe) return;

                // Referans veya pozisyon kontrolü
                const p1SameRef = (otherPipe.p1 === targetPoint);
                const p2SameRef = (otherPipe.p2 === targetPoint);
                const p1SamePos = Math.hypot(otherPipe.p1.x - finalX, otherPipe.p1.y - finalY) < POSITION_TOLERANCE;
                const p2SamePos = Math.hypot(otherPipe.p2.x - finalX, otherPipe.p2.y - finalY) < POSITION_TOLERANCE;

                if (p1SameRef || p1SamePos) {
                    otherPipe.p1.x = oldX;
                    otherPipe.p1.y = oldY;
                }

                if (p2SameRef || p2SamePos) {
                    otherPipe.p2.x = oldX;
                    otherPipe.p2.y = oldY;
                }
            });
        } else {
            lastValidTarget.x = targetPoint.x;
            lastValidTarget.y = targetPoint.y;
        }
        
        return true;
        
    } else if (handle === 'body') {
        return false;
    }

    return false;
}

export function isSpaceForValve(pipe, pos, valveWidth = 12, excludeValve = null) {
    const MIN_MARGIN = 1;
    const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

    if (pos - valveWidth / 2 < MIN_MARGIN || pos + valveWidth / 2 > pipeLength - MIN_MARGIN) {
        return false;
    }

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