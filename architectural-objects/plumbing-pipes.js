// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/architectural-objects/plumbing-pipes.js
// GÜNCELLENDİ: "Graph Move" (Kopmayan taşıma) için düzenlendi.
// GÜNCELLENDİ: `getConnectionPoints` import edildi.
// GÜNCELLENDİ: `findAllConnectedComponents` eklendi ve export edildi.
// GÜNCELLENDİ: onPointerDown ve onPointerMove, bağlı bileşenleri taşıyacak şekilde güncellendi.
// GÜNCELLENDİ (Tekrar): "Graph Move" (body) kaldırıldı, "Stretch Move" (p1/p2) ve "Single Move" (body) geri yüklendi.
// GÜNCELLENDİ (Kural): Boru gövdeden (body) taşınamaz. Sadece uçlardan (p1/p2) esnetilebilir.
// GÜNCELLENDİ (Kural): Vana taşıma marjı 1 cm'ye düşürüldü.
// GÜNCELLENDİ (Kural): Boru esnetme (kısaltma), vana toplam genişliği + 2cm (uçlardan 1'er cm) altına inemez.

import { state, setState } from '../general-files/main.js';
// YENİ İMPORT: Blok bağlantı noktaları için eklendi
import { getPlumbingBlockAtPoint, getConnectionPoints } from './plumbing-blocks.js';

/**
 * TESİSAT BORULARI - Tesisat nesnelerini birbirine bağlayan borular
 * ... (PLUMBING_PIPE_TYPES, createPlumbingPipe, isPointOnPipe, snapToConnectionPoint, snapToPipeEndpoint, getPipeAtPoint, deletePlumbingPipe fonksiyonları değişmedi) ...
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
        // Bağlantı bilgileri (opsiyonel)
        connections: {
            start: null, // { blockId, connectionIndex }
            end: null    // { blockId, connectionIndex }
        },
        // Kesikli çizgi kontrolü için
        isConnectedToValve: false, // Eğer false ise kesikli çizilir,
        // Boru üzerindeki vanalar (boru nesneleri)
        valves: [] // { pos: number (p1'e olan uzaklık), width: number }
    };
}

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

export function snapToConnectionPoint(point, tolerance = 10, filterFn = null) {
    const currentFloorId = state.currentFloor?.id;
    let blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);

    // Eğer filter fonksiyonu varsa uygula
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
                // BAĞLANTI NOKTASI KONTROLÜ:
                // SAYAÇ, VANA ve SERVIS_KUTUSU için kontrol
                if (block.blockType === 'SAYAC' || block.blockType === 'VANA') {
                    // Sayaç ve vana'nın her bağlantı noktasına sadece BİR boru bağlanabilir
                    // İKİ YÖNTEMLİ KONTROL:
                    // 1. Bağlantı bilgisi (connections) üzerinden kontrol (kesin)
                    // 2. Pozisyon bazlı kontrol (yedek)

                    const isOccupiedByConnection = (state.plumbingPipes || []).some(pipe => {
                        // p1 bu bloğun bu bağlantı noktasına bağlı mı?
                        const p1Connected = pipe.connections?.start?.blockId &&
                            (pipe.connections.start.blockId === block.id || pipe.connections.start.blockId === block) &&
                            pipe.connections.start.connectionIndex === i;

                        // p2 bu bloğun bu bağlantı noktasına bağlı mı?
                        const p2Connected = pipe.connections?.end?.blockId &&
                            (pipe.connections.end.blockId === block.id || pipe.connections.end.blockId === block) &&
                            pipe.connections.end.connectionIndex === i;

                        return p1Connected || p2Connected;
                    });

                    const CONNECTION_TOLERANCE = 10; // 10 cm tolerans (pozisyon kontrolü için)
                    const isOccupiedByPosition = (state.plumbingPipes || []).some(pipe =>
                        Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < CONNECTION_TOLERANCE ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < CONNECTION_TOLERANCE
                    );

                    if (isOccupiedByConnection || isOccupiedByPosition) {
                        // Bu bağlantı noktası dolu, atla
                        continue;
                    }
                } else if (block.blockType === 'SERVIS_KUTUSU') {
                    // SERVIS_KUTUSU: Her bağlantı noktasına sadece BİR boru bağlanabilir
                    // İKİ YÖNTEMLİ KONTROL (SAYAC/VANA ile aynı mantık):

                    // 1. Bağlantı bilgisi (connections) üzerinden kontrol (kesin)
                    const isOccupiedByConnection = (state.plumbingPipes || []).some(pipe => {
                        const p1Connected = pipe.connections?.start?.blockId &&
                            (pipe.connections.start.blockId === block.id || pipe.connections.start.blockId === block) &&
                            pipe.connections.start.connectionIndex === i;

                        const p2Connected = pipe.connections?.end?.blockId &&
                            (pipe.connections.end.blockId === block.id || pipe.connections.end.blockId === block) &&
                            pipe.connections.end.connectionIndex === i;

                        return p1Connected || p2Connected;
                    });

                    // 2. Pozisyon bazlı kontrol (yedek, eski borular için)
                    const CONNECTION_TOLERANCE = 10; // 10 cm tolerans
                    const isOccupiedByPosition = (state.plumbingPipes || []).some(pipe =>
                        Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < CONNECTION_TOLERANCE ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < CONNECTION_TOLERANCE
                    );

                    if (isOccupiedByConnection || isOccupiedByPosition) {
                        // Bu bağlantı noktası dolu, atla
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

export function snapToPipeEndpoint(point, tolerance = 10, selfPipe = null) { // selfPipe eklendi
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    let closestSnap = null;
    let minDist = tolerance;

    for (const pipe of pipes) {
        if (pipe === selfPipe) continue; // Kendine snap yapma

        // p1'e olan mesafe
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

        // p2'ye olan mesafe
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

    // Debug log kaldırıldı (her mouse move'da çağrılıyor)

    // Ters sırada kontrol et (en son eklenen önce)
    for (const pipe of [...pipes].reverse()) {
        if (isPointOnPipe(point, pipe, tolerance)) {
            // Uç noktalara mı yakın?
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

// --- YENİ YARDIMCI FONKSİYON: Tüm bağlı bileşenleri bul (BFS) ---
// (Bu fonksiyon hala "Graph Move" için gerekli olabilir, ancak pipe.js'de kullanılmayacak)
export function findAllConnectedComponents(startObject, startType) {
    const queue = [{ object: startObject, type: startType }];
    const visited = new Set();
    const components = {
        blocks: new Set(),
        pipes: new Set()
    };
    const tolerance = 15; // 15 cm bağlantı toleransı

    // (state.plumbingBlocks ve state.plumbingPipes'in tanımlı olduğundan emin ol)
    const allPipes = state.plumbingPipes || [];
    const allBlocks = state.plumbingBlocks || [];

    while (queue.length > 0) {
        const current = queue.shift();
        
        // Zaten ziyaret edildi mi? (Referans kontrolü)
        const visitedKey = current.object; 
        if (visited.has(visitedKey)) continue;
        visited.add(visitedKey);

        if (current.type === 'plumbingBlock') {
            const block = current.object;
            components.blocks.add(block);
            const blockConnections = getConnectionPoints(block);

            // Find pipes connected to this block
            allPipes.forEach(pipe => {
                if (visited.has(pipe)) return; // Boru zaten ziyaret edildiyse atla
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

            // Find blocks connected to this pipe
            allBlocks.forEach(block => {
                if (visited.has(block)) return; // Blok zaten ziyaret edildiyse atla
                const blockConnections = getConnectionPoints(block);
                for (const cp of blockConnections) {
                    if (Math.hypot(pipe.p1.x - cp.x, pipe.p1.y - cp.y) < tolerance ||
                        Math.hypot(pipe.p2.x - cp.x, pipe.p2.y - cp.y) < tolerance) {
                        queue.push({ object: block, type: 'plumbingBlock' });
                        break;
                    }
                }
            });

            // Find other pipes connected to this pipe
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
    return components; // { blocks: Set, pipes: Set }
}
// --- YARDIMCI FONKSİYON SONU ---


/**
 * Boru pointer down handler
 * GÜNCELLENDİ: "Graph Move" mantığı kaldırıldı
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
        startP2: { ...pipe.p2 },
        lastValidP1: { ...pipe.p1 }, // Kural 1 (Destek): Vana limiti için son geçerli pozisyon
        lastValidP2: { ...pipe.p2 }  // Kural 1 (Destek): Vana limiti için son geçerli pozisyon
    };

    setState({ dragState });

    // --- "Graph Move" mantığı (preDragNodeStates) kaldırıldı ---

    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * Boru pointer move handler
 * GÜNCELLENDİ: "Graph Move" (body) kaldırıldı, "Single Move" (body) geri yüklendi.
 * GÜNCELLENDİ: Kural 1 (Vana Limiti) ve Kural 3 (Gövdeden Taşıma Yok) eklendi.
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingPipe') return false;

    const { pipe, handle, startPos, startP1, startP2 } = dragState;
    
    // Taşıma miktarını snappedPos'a göre hesapla (orijinal "stretch" mantığı)
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;

    if (handle === 'p1' || handle === 'p2') {
        // P1/P2 HAREKETİ (ESNETME / STRETCH)
        
        const targetPoint = (handle === 'p1') ? pipe.p1 : pipe.p2;
        const otherPoint = (handle === 'p1') ? pipe.p2 : pipe.p1; // Sabit uç
        const startPoint = (handle === 'p1') ? startP1 : startP2;
        const lastValidTarget = (handle === 'p1') ? dragState.lastValidP1 : dragState.lastValidP2;

        // Hedef pozisyonu snaplenmiş fare pozisyonu olarak ayarla
        targetPoint.x = snappedPos.x;
        targetPoint.y = snappedPos.y;

        // Bağlantı noktasına snap (hem blok hem boru ucu)
        // Kendisi hariç (selfPipe = pipe)
        const snap = snapToConnectionPoint(targetPoint, 15) || snapToPipeEndpoint(targetPoint, 15, pipe);
        if (snap) {
            targetPoint.x = snap.x;
            targetPoint.y = snap.y;

            // Snap yapıldıysa bağlantı bilgisini güncelle
            const connectionKey = handle === 'p1' ? 'start' : 'end';
            if (!pipe.connections) pipe.connections = { start: null, end: null };

            if (snap.block) {
                // Bloğa snap yapıldı
                pipe.connections[connectionKey] = {
                    blockId: snap.block.id || snap.block,
                    connectionIndex: snap.connectionIndex,
                    blockType: snap.block.blockType
                };
            } else {
                // Boru ucuna snap yapıldı (blok değil)
                pipe.connections[connectionKey] = null;
            }
        } else {
            // Snap yapılmadı - eğer daha önce bloğa bağlıysa bağlantıyı kes
            const connectionKey = handle === 'p1' ? 'start' : 'end';
            if (pipe.connections?.[connectionKey]?.blockId) {
                console.log(`⚠️ Boru ucu bloğa bağlıyken snap alanından çıktı, bağlantı koparıldı`);
                pipe.connections[connectionKey] = null;
            }
        }

        // Kural 1 (Vana Limiti): Minimum uzunluk kontrolü
        const totalValveWidth = (pipe.valves || []).reduce((sum, v) => sum + v.width, 0);
        const minPipeLength = totalValveWidth + 20; // Toplam vana genişliği + 2cm (iki uçtan 1'er cm)
        const newPipeLength = Math.hypot(targetPoint.x - otherPoint.x, targetPoint.y - otherPoint.y);

        if (newPipeLength < minPipeLength) {
            // Eğer yeni uzunluk limitten azsa, eski geçerli pozisyona geri dön
            targetPoint.x = lastValidTarget.x;
            targetPoint.y = lastValidTarget.y;
        } else {
            // Pozisyon geçerliyse, 'son geçerli' pozisyonu güncelle
            lastValidTarget.x = targetPoint.x;
            lastValidTarget.y = targetPoint.y;
        }
        
        return true;
        
    } else if (handle === 'body') {
        // Kural 3: Boru gövdeden taşınamaz.
        // Bu bloğu boş bırakarak veya false döndürerek taşımayı engelle.
        return false;
    }

    return false;
}

/**
 * Boru üzerinde vana için yer olup olmadığını kontrol eder
 * @param {object} pipe - Boru nesnesi
 * @param {number} pos - p1'den olan uzaklık (cm)
 * @param {number} valveWidth - Vana genişliği (cm) - varsayılan 12
 * @param {object} excludeValve - Kontrol edilmeyecek vana (taşıma sırasında kendini hariç tutmak için)
 * @returns {boolean} - Yer varsa true
 */
export function isSpaceForValve(pipe, pos, valveWidth = 12, excludeValve = null) {
    const MIN_MARGIN = 1; // Kural 2: 5cm'den 1cm'ye düşürüldü
    const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);

    // Boru uçlarına çok yakınsa izin verme
    if (pos - valveWidth / 2 < MIN_MARGIN || pos + valveWidth / 2 > pipeLength - MIN_MARGIN) {
        return false;
    }

    // Diğer vanalarla çakışma kontrolü
    for (const valve of (pipe.valves || [])) {
        if (valve === excludeValve) continue; // Kendini hariç tut

        const otherStart = valve.pos - valve.width / 2;
        const otherEnd = valve.pos + valve.width / 2;
        const newStart = pos - valveWidth / 2;
        const newEnd = pos + valveWidth / 2;

        // Aralıklar kesişiyorsa çakışma var
        if (!(newEnd <= otherStart || newStart >= otherEnd)) {
            return false;
        }
    }

    return true;
}

/**
 * Bir noktada vana var mı kontrol eder
 * @param {object} point - Kontrol edilecek nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object|null} - { type: 'valve', object: valve, pipe: pipe, handle: 'body' } veya null
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
            // Vananın merkez pozisyonu
            const valveCenterX = pipe.p1.x + dx * valve.pos;
            const valveCenterY = pipe.p1.y + dy * valve.pos;

            // Noktanın vanaya uzaklığı
            const dist = Math.hypot(point.x - valveCenterX, point.y - valveCenterY);

            // Tolerans içindeyse vanayı döndür
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