// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/architectural-objects/plumbing-blocks.js
// GÜNCELLENDİ: "Graph Move" mantığı kaldırıldı (kullanıcının isteği üzerine).
// GÜNCELLENDİ: onPointerMove, rijit bloklar (Vana/Sayaç) için "Stretch Move" (kopmaz)
//             ve esnek bloklar (Ocak/Kombi) için "Kopma Move" (esnek) kullanacak şekilde geri yüklendi.

import { state, setState } from '../general-files/main.js';
// YENİ İMPORT KALDIRILDI: findAllConnectedComponents artık kullanılmıyor.
// import { findAllConnectedComponents } from './plumbing-pipes.js'; 

/**
 * TESİSAT BLOKLARI - SABİT BOYUTLU MİMARİ ELEMANLAR
 * ... (PLUMBING_BLOCK_TYPES, createPlumbingBlock, getPlumbingBlockCorners, getConnectionPoints, isPointInPlumbingBlock, getPlumbingBlockAtPoint fonksiyonları değişmedi) ...
 */
 
export const PLUMBING_BLOCK_TYPES = {
    SERVIS_KUTUSU: {
        id: 'servis-kutusu',
        name: 'Servis Kutusu',
        // 3D boyutlar (cm) - 20x40x70
        width: 40,      // duvar boyunca (X ekseni)
        height: 20,     // duvardan dışa çıkan (2D Y ekseni, 3D Z ekseni)
        depth: 70,      // yükseklik (3D Y ekseni) - duvara dik yükseliş
        cornerRadius: 2, // 2 cm yuvarlama
        // Bağlantı noktaları (merkeze göre offset) - 6 ADET
        connectionPoints: [
            { x: 20, y: 0, z: -15, label: 'sağ-orta' },      // Sağda ortada (mevcut)
            { x: -20, y: 0, z: -15, label: 'sol-orta' },     // Solda ortada (karşısı)
            { x: 20, y: -8, z: -15, label: 'sağ-üst' },     // Sağ üst köşe
            { x: -20, y: -8, z: -15, label: 'sol-üst' },    // Sol üst köşe
            { x: 20, y: 8, z: -15, label: 'sağ-alt' },      // Sağ alt köşe
            { x: -20, y: 8, z: -15, label: 'sol-alt' },     // Sol alt köşe
            { x: 0, y: 0, z: 35, label: 'sol-alt' },    
            { x: 0, y: 0, z: -35, label: 'sol-alt' },
            { x: 0, y: -10, z: -15, label: 'sol-alt' },    
            { x: 0, y: 10, z: -15, label: 'sol-alt' }     
        ],
        mountType: 'wall', // duvara monte
        color: 0xA8A8A8, // Gri ton
    },
    SAYAC: {
        id: 'sayac',
        name: 'Sayaç',
        // 3D boyutlar (cm) - 15x18x40 - 6 cm daraltıldı (24'ten 18'e)
        width: 18,      // duvar boyunca (X ekseni) - 24'ten 18'e düşürüldü
        height: 18,     // duvardan dışa çıkan (2D Y ekseni, 3D Z ekseni)
        depth: 40,      // yükseklik (3D Y ekseni)
        cornerRadius: 1, // 2 cm yuvarlama
        connectionPoints: [
            // ÜST KISIMDA ÇAPRAZ BAĞLANTI NOKTALARI
            // Giriş: Sol üst köşeden çıkıntılı (10 cm dışarı çıkıntı)
            { x: -6, y: -9 - 10, z: 30, label: 'giriş' },   // Sol-arka-üst, 10 cm çıkıntı (x: -8'den -6'ya)
            // Çıkış: Sağ üst köşeden çıkıntılı (10 cm dışarı çıkıntı)
            { x: 6, y: -9 - 10, z: 30, label: 'çıkış' }     // Sağ-arka-üst, 10 cm çıkıntı (x: 8'den 6'ya)
        ],
        // 10 cm bağlantı çizgileri için offset
        connectionLineLength: 10,
        mountType: 'wall',
        color: 0xA8A8A8, // Gri ton
    },
    VANA: {
        id: 'vana',
        name: 'Vana',
        width: 12,      // Birleşik uzunluk
        height: 6,      // Geniş çap
        depth: 6,
        cornerRadius: 1,
        connectionPoints: [
            { x: -6, y: 0, z: -2.50, label: 'giriş' },  // Sol taraf, orta yükseklikte
            { x: 6, y: 0, z: -2.50, label: 'çıkış' }    // Sağ taraf, orta yükseklikte
        ],
        mountType: 'free', // Serbest yerleşim
        color: 0xA0A0A0,
        shape: 'doubleConeFrustum' // Özel şekil
    },
    KOMBI: {
        id: 'kombi',
        name: 'Kombi',
        width: 50,       // Dış daire çapı (2D çizimde outerRadius=25, çap=50)
        height: 50,      // Dış daire çapı
        depth: 29,
        cornerRadius: 2,
        connectionPoints: [
            { x: -25, y: 0, z: 0, label: 'bağlantı' } // Dış dairenin tam alt kenarında (outerRadius=25)
        ],
        mountType: 'wall',
        color: 0xC0C0C0, // Gri renk (beyaz yerine)
    },
    OCAK: {
        id: 'ocak',
        name: 'Ocak',
        width: 50,       // Dikdörtgen boyutu (2D çizimde boxSize=25, çap=50)
        height: 50,      // Dikdörtgen boyutu
        depth: 59,
        cornerRadius: 2,
        connectionPoints: [
            { x: -25, y: 0, z: 0, label: 'bağlantı' } // Arka kenarın tam üzerinde (boxSize=25)
        ],
        mountType: 'floor', // Zemine oturur
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
        rotation: 0, // Derece cinsinden
        floorId: state.currentFloor?.id,
        // Tip bilgisini sakla
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

export function getPlumbingBlockAtPoint(point) {
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    const blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);
    const tolerance = 8 / zoom;

    // Önce rotation handle'ları kontrol et (daha öncelikli)
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

    // Sonra bağlantı noktalarını kontrol et
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

    // Hiç handle yoksa, body kontrolü
    for (const block of blocks) {
        if (isPointInPlumbingBlock(point, block)) {
            return { type: 'plumbingBlock', object: block, handle: 'body' };
        }
    }

    return null;
}


/**
 * Pointer down event handler
 * GÜNCELLENDİ: "Graph Move" (Ocak/Kombi hariç) için bağlı bileşenleri saklar
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) {
    const block = selectedObject.object;
    const handle = selectedObject.handle;
    let effectiveBlock = block; // Üzerinde işlem yapılacak blok

    // CTRL ile kopyalama
    const isCopying = e.ctrlKey || e.metaKey;
    if (isCopying) {
        const copy = createPlumbingBlock(block.center.x, block.center.y, block.blockType);
        copy.rotation = block.rotation;
        copy.typeConfig = block.typeConfig;

        if (!state.plumbingBlocks) state.plumbingBlocks = [];
        state.plumbingBlocks.push(copy);

        effectiveBlock = copy;
        // Seçili nesneyi kopya ile güncelle
        setState({
            selectedObject: { ...selectedObject, object: copy, handle: 'center' },
        });
    }

    // Başlangıç durumunu (orijinal veya kopya) kaydet
    const dragState = {
        type: 'plumbingBlock',
        block: effectiveBlock,
        handle: handle,
        startPos: { ...pos },
        startCenter: { ...effectiveBlock.center },
        startRotation: effectiveBlock.rotation || 0
    };
    setState({ dragState });


    // --- GÜNCELLENDİ: "Graph Move" (Kopmama) SADECE RİJİT bloklar (Vana, Sayaç, Kutu) için geçerli ---
    // Sadece 'body' sürükleniyorsa VE RİJİT bir bloksa tüm zinciri bul
    if (handle === 'body' && effectiveBlock.blockType !== 'OCAK' && effectiveBlock.blockType !== 'KOMBI') {
        
        // "Graph Move" mantığı Geri Alma isteği üzerine KALDIRILDI.
        // state.preDragNodeStates.clear(); 
        // ... (Graph Move için preDragNodeStates doldurma kodu kaldırıldı) ...

    }
    // --- GÜNCELLEME SONU ---


    // Return değeri - pointer-down.js için gerekli
    return {
        startPointForDragging: pos,
        dragOffset: { x: 0, y: 0 },
        additionalState: {}
    };
}

/**
 * Pointer move event handler
 * Body hareketi (Graph Move veya Stretch Move) + Rotation
 * GÜNCELLENDİ: "Graph Move" kaldırıldı, "Stretch Move" (rijit) ve "Kopma Move" (esnek) geri yüklendi.
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const { dragState } = state;
    if (!dragState || dragState.type !== 'plumbingBlock') return false;

    const { block, handle, startPos, startCenter, startRotation } = dragState;
    
    // Taşıma miktarını SADECE snaplenmemiş pozisyona göre hesapla (pürüzsüz taşıma için)
    // (state.initialDragPoint, pointer-down.js'de ayarlanır)
    // GÜNCELLEME: dx/dy hesaplaması snappedPos.roundedX/Y kullanmalı (orijinal 'stretch' mantığı)
    const dx = snappedPos.roundedX - startPos.x;
    const dy = snappedPos.roundedY - startPos.y;


    if (handle === 'rotation') {
        // Rotation handle - Mouse pozisyonuna göre açı hesapla
        const angleToMouse = Math.atan2(
            snappedPos.roundedX - block.center.x,
            -(snappedPos.roundedY - block.center.y)
        ) * 180 / Math.PI;

        // 15 derecelik snaplama
        const oldRotation = block.rotation || 0;
        const newRotation = Math.round(angleToMouse / 15) * 15;
        
        if (oldRotation !== newRotation) {
            block.rotation = newRotation;
            // Bağlı boruları güncelle (rotasyon sonrası)
            updateConnectedPipesAfterRotation(block, oldRotation, block.rotation);
        }

        return true;
        
    } else if (handle === 'body') {
        
        // --- GÜNCELLEME: Blok tipine göre taşıma mantığını ayır ---
        
        // 1. RİJİT BLOKLAR (Vana, Sayaç, Servis Kutusu) -> "Stretch Move" (Bağlı borular esner)
        if (block.blockType !== 'OCAK' && block.blockType !== 'KOMBI') {
            
            const oldCenter = { ...block.center }; // Mevcut (bir frame önceki) merkezi sakla
            
            // Bloğun merkezini taşı
            block.center.x = startCenter.x + dx;
            block.center.y = startCenter.y + dy;

            // Bağlı boruları güncelle (esnet)
            updateConnectedPipes(block, oldCenter, block.center);
            
            return true;
        }
        
        // 2. FLEKSİBL BLOKLAR (Ocak, Kombi) -> "Kopma Move" (Bağlantı kopar, esnek hat çizilir)
        else {
            // Cihazı (Ocak/Kombi) serbestçe taşı.
            // Bağlantı kopacak ve `draw-plumbing.js` içindeki `drawWavyConnectionLine`
            // (sinüs eğrisi) bu boşluğu görsel olarak dolduracak.
            
            block.center.x = startCenter.x + dx;
            block.center.y = startCenter.y + dy;

            // (updateConnectedPipes çağırmıyoruz, çünkü bağlantı esnek)
            return true;
        }
        // --- GÜNCELLEME SONU ---
    }

    return false;
}

// ... (checkIfBlockIsConnected, updateConnectedPipes, updateConnectedPipesAfterRotation, getConnectionPointsAtPosition, deletePlumbingBlock, getDefaultRotationForWall fonksiyonları değişmedi) ...
function checkIfBlockIsConnected(block) {
    const connections = getConnectionPoints(block);
    const tolerance = 15; // 15 cm tolerans - updateConnectedPipes ile aynı

    // Her bağlantı noktası için boruları kontrol et
    for (const conn of connections) {
        for (const pipe of (state.plumbingPipes || [])) {
            // p1 veya p2 bu bağlantı noktasına yakın mı?
            const dist1 = Math.hypot(pipe.p1.x - conn.x, pipe.p1.y - conn.y);
            const dist2 = Math.hypot(pipe.p2.x - conn.x, pipe.p2.y - conn.y);

            if (dist1 < tolerance || dist2 < tolerance) {
                return true; // Bağlantı bulundu
            }
        }
    }

    return false; // Bağlantı yok
}

function updateConnectedPipes(block, oldCenter, newCenter) {
    const oldConnections = getConnectionPointsAtPosition(block, oldCenter);
    const newConnections = getConnectionPoints(block);

    // Her bağlantı noktası için bağlı boruları bul ve güncelle
    oldConnections.forEach((oldConn, index) => {
        const newConn = newConnections[index];
        const tolerance = 15; // 15 cm tolerans - ÇOK DAHA GÜÇLÜ BAĞLANTILAR

        // Bu bağlantı noktasına bağlı boruları bul
        (state.plumbingPipes || []).forEach(pipe => {
            // Önce explicit connection kontrolü yap
            let shouldUpdateStart = false;
            let shouldUpdateEnd = false;

            // Explicit connection varsa direkt kullan
            if (pipe.connections?.start?.blockId === block && pipe.connections.start.connectionIndex === index) {
                shouldUpdateStart = true;
            }
            // Yoksa mesafe kontrolü yap
            else if (Math.hypot(pipe.p1.x - oldConn.x, pipe.p1.y - oldConn.y) < tolerance) {
                shouldUpdateStart = true;
            }

            // Explicit connection varsa direkt kullan
            if (pipe.connections?.end?.blockId === block && pipe.connections.end.connectionIndex === index) {
                shouldUpdateEnd = true;
            }
            // Yoksa mesafe kontrolü yap
            else if (Math.hypot(pipe.p2.x - oldConn.x, pipe.p2.y - oldConn.y) < tolerance) {
                shouldUpdateEnd = true;
            }

            // p1 güncelleme
            if (shouldUpdateStart) {
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;

                // Explicit bağlantı kaydı
                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.start = {
                    blockId: block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }

            // p2 güncelleme
            if (shouldUpdateEnd) {
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;

                // Explicit bağlantı kaydı
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

function updateConnectedPipesAfterRotation(block, oldRotation, newRotation) {
    // Eski rotasyonda bağlantı noktalarını hesapla
    const tempBlock = { ...block, rotation: oldRotation };
    const oldConnections = getConnectionPoints(tempBlock);
    const newConnections = getConnectionPoints(block);

    // Her bağlantı noktası için bağlı boruları bul ve güncelle
    oldConnections.forEach((oldConn, index) => {
        const newConn = newConnections[index];
        const tolerance = 15; // 15 cm tolerans - ÇOK DAHA GÜÇLÜ BAĞLANTILAR

        (state.plumbingPipes || []).forEach(pipe => {
            // Önce explicit connection kontrolü yap
            let shouldUpdateStart = false;
            let shouldUpdateEnd = false;

            // Explicit connection varsa direkt kullan
            if (pipe.connections?.start?.blockId === block && pipe.connections.start.connectionIndex === index) {
                shouldUpdateStart = true;
            }
            // Yoksa mesafe kontrolü yap
            else if (Math.hypot(pipe.p1.x - oldConn.x, pipe.p1.y - oldConn.y) < tolerance) {
                shouldUpdateStart = true;
            }

            // Explicit connection varsa direkt kullan
            if (pipe.connections?.end?.blockId === block && pipe.connections.end.connectionIndex === index) {
                shouldUpdateEnd = true;
            }
            // Yoksa mesafe kontrolü yap
            else if (Math.hypot(pipe.p2.x - oldConn.x, pipe.p2.y - oldConn.y) < tolerance) {
                shouldUpdateEnd = true;
            }

            // p1 güncelleme
            if (shouldUpdateStart) {
                pipe.p1.x = newConn.x;
                pipe.p1.y = newConn.y;

                // Explicit bağlantı kaydı
                if (!pipe.connections) pipe.connections = { start: null, end: null };
                pipe.connections.start = {
                    blockId: block,
                    connectionIndex: index,
                    blockType: block.blockType
                };
            }

            // p2 güncelleme
            if (shouldUpdateEnd) {
                pipe.p2.x = newConn.x;
                pipe.p2.y = newConn.y;

                // Explicit bağlantı kaydı
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
    // Duvar açısına dik olacak şekilde yerleştir
    return Math.round((wallAngle + 90) / 15) * 15;
}