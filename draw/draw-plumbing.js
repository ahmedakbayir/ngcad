import { state, dom } from '../general-files/main.js';
import { PLUMBING_BLOCK_TYPES, getPlumbingBlockCorners, getConnectionPoints } from '../architectural-objects/plumbing-blocks.js';
import { PLUMBING_PIPE_TYPES, snapToConnectionPoint, snapToPipeEndpoint } from '../architectural-objects/plumbing-pipes.js';

/**
 * TESİSAT BLOKLARI 2D RENDERING
 *
 * Her blok tipi için özel 2D sembol çizimi
 */

/**
 * Sinüs dalgalı bağlantı çizgisi çizer (Ocak/Kombi için)
 * Eğer bağlantı noktası boru ucuna doğrudan bağlı değilse, araya sinüs çizgisi çizer
 * SİNÜS BORÜYA TEĞET OLARAK BAĞLANIR
 */
function drawWavyConnectionLine(connectionPoint, zoom) {
    const { ctx2d } = dom;
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    // En yakın boru ucunu ve boru yönünü bul
    let closestPipeEnd = null;
    let pipeDirection = null;
    let minDist = Infinity;
    const DIRECT_CONNECTION_TOLERANCE = 2; // 2 cm - doğrudan bağlı kabul edilme mesafesi

    for (const pipe of pipes) {
        // p1'e olan mesafe
        const dist1 = Math.hypot(pipe.p1.x - connectionPoint.x, pipe.p1.y - connectionPoint.y);
        if (dist1 < minDist) {
            minDist = dist1;
            closestPipeEnd = { x: pipe.p1.x, y: pipe.p1.y };
            // Boru yönü: p2'den p1'e (boru ucundan içeriye)
            const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
            pipeDirection = {
                x: (pipe.p2.x - pipe.p1.x) / pipeLength,
                y: (pipe.p2.y - pipe.p1.y) / pipeLength
            };
        }

        // p2'ye olan mesafe
        const dist2 = Math.hypot(pipe.p2.x - connectionPoint.x, pipe.p2.y - connectionPoint.y);
        if (dist2 < minDist) {
            minDist = dist2;
            closestPipeEnd = { x: pipe.p2.x, y: pipe.p2.y };
            // Boru yönü: p1'den p2'ye (boru ucundan içeriye)
            const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
            pipeDirection = {
                x: (pipe.p1.x - pipe.p2.x) / pipeLength,
                y: (pipe.p1.y - pipe.p2.y) / pipeLength
            };
        }
    }

    // Eğer doğrudan bağlı değilse (mesafe > tolerans), sinüs çizgisi çiz
    if (closestPipeEnd && pipeDirection && minDist > DIRECT_CONNECTION_TOLERANCE) {
        const dx = closestPipeEnd.x - connectionPoint.x;
        const dy = closestPipeEnd.y - connectionPoint.y;
        const distance = Math.hypot(dx, dy);

        // Sinüs parametreleri
        const amplitude = 3; // Dalga genliği (cm)
        const frequency = 3; // Dalga frekansı (tam dalga sayısı)
        const segments = 50; // Çizgi segmentleri

        ctx2d.save();
        ctx2d.strokeStyle = '#2196F3'; // Mavi renk
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.lineCap = 'round';

        ctx2d.beginPath();
        ctx2d.moveTo(connectionPoint.x, connectionPoint.y);

        // Sinüs eğrisi çiz - BAŞTA VE SONDA TEĞET OLMALI (hem değer hem türev 0)
        for (let i = 1; i <= segments; i++) {
            const t = i / segments; // 0-1 arası parametre

            // Ana çizgi üzerindeki nokta
            const baseX = connectionPoint.x + dx * t;
            const baseY = connectionPoint.y + dy * t;

            // Perpendicular (dik) yön
            const perpX = -dy / distance;
            const perpY = dx / distance;

            // Smoothstep envelope - başta ve sonda hem değer hem türev 0 olur (TEĞET)
            const smoothEnvelope = t * t * (3 - 2 * t); // Smoothstep: 0'da 0, 1'de 1, türev başta ve sonda 0

            // Sinüs dalgası
            const wave = Math.sin(smoothEnvelope * frequency * Math.PI * 2);

            // Son offset - envelope ile çarparak başta ve sonda teğet olmasını sağla
            const sineOffset = smoothEnvelope * (1 - smoothEnvelope) * 4 * amplitude * wave;

            // Final pozisyon
            const finalX = baseX + perpX * sineOffset;
            const finalY = baseY + perpY * sineOffset;

            ctx2d.lineTo(finalX, finalY);
        }

        ctx2d.stroke();
        ctx2d.restore();
    }
}

/**
 * Servis Kutusu çizer (yuvarlatılmış dikdörtgen)
 */
function drawServisKutusu(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.SERVIS_KUTUSU;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    // Yuvarlatılmış dikdörtgen (2 cm köşe yarıçapı)
    const halfW = config.width / 2;
    const halfH = config.height / 2;
    const cornerRadius = 2;

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    ctx2d.moveTo(-halfW + cornerRadius, -halfH);
    ctx2d.lineTo(halfW - cornerRadius, -halfH);
    ctx2d.arcTo(halfW, -halfH, halfW, -halfH + cornerRadius, cornerRadius);
    ctx2d.lineTo(halfW, halfH - cornerRadius);
    ctx2d.arcTo(halfW, halfH, halfW - cornerRadius, halfH, cornerRadius);
    ctx2d.lineTo(-halfW + cornerRadius, halfH);
    ctx2d.arcTo(-halfW, halfH, -halfW, halfH - cornerRadius, cornerRadius);
    ctx2d.lineTo(-halfW, -halfH + cornerRadius);
    ctx2d.arcTo(-halfW, -halfH, -halfW + cornerRadius, -halfH, cornerRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    // SK yazısı - sadece kontur (dış dolgusu yok), boyut 2/3'e düşürüldü (18 -> 12)
    if (zoom > 0.15) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5;
        ctx2d.lineJoin = 'round';
        ctx2d.font = `10px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('SK', 0, 0);
    }

    ctx2d.restore();

    // Bağlantı noktası - KALDIRILDI (kullanıcı isteği üzerine)
    // const connections = getConnectionPoints(block);
    // ctx2d.fillStyle = '#FF0000';
    // ctx2d.beginPath();
    // ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    // ctx2d.fill();
}

/**
 * Sayaç çizer (yuvarlatılmış dikdörtgen + 10cm çapraz bağlantı çizgileri)
 */
function drawSayac(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.SAYAC;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    // Yuvarlatılmış dikdörtgen (2 cm köşe yarıçapı)
    const halfW = config.width / 2;
    const halfH = config.height / 2;
    const cornerRadius = 2;

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    ctx2d.moveTo(-halfW + cornerRadius, -halfH);
    ctx2d.lineTo(halfW - cornerRadius, -halfH);
    ctx2d.arcTo(halfW, -halfH, halfW, -halfH + cornerRadius, cornerRadius);
    ctx2d.lineTo(halfW, halfH - cornerRadius);
    ctx2d.arcTo(halfW, halfH, halfW - cornerRadius, halfH, cornerRadius);
    ctx2d.lineTo(-halfW + cornerRadius, halfH);
    ctx2d.arcTo(-halfW, halfH, -halfW, halfH - cornerRadius, cornerRadius);
    ctx2d.lineTo(-halfW, -halfH + cornerRadius);
    ctx2d.arcTo(-halfW, -halfH, -halfW + cornerRadius, -halfH, cornerRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    // 10 cm bağlantı çizgileri - ÜST KISIMDANÇAPRAZ olarak dışarı çıkan
    const lineLength = config.connectionLineLength || 6;

    // Sol üst köşeden çapraz çıkıntı (giriş)
    ctx2d.strokeStyle = '#ffffff'; // Yeşil
    ctx2d.lineWidth = 2 / zoom;
    ctx2d.beginPath();
    // Sayaç gövdesinden başlangıç noktası (sol üst köşeye yakın)
    ctx2d.moveTo(-5, -halfH);
    // 10 cm yukarı ve biraz dışarı çıkıntı
    ctx2d.lineTo(-5, -halfH - lineLength);
    ctx2d.stroke();

    // Sağ üst köşeden çapraz çıkıntı (çıkış)
    ctx2d.strokeStyle = '#FFffff'; // Kırmızı
    ctx2d.beginPath();
    // Sayaç gövdesinden başlangıç noktası (sağ üst köşeye yakın)
    ctx2d.moveTo(5, -halfH);
    // 10 cm yukarı ve biraz dışarı çıkıntı
    ctx2d.lineTo(5, -halfH - lineLength);
    ctx2d.stroke();

    ctx2d.restore();

    // Bağlantı noktaları - KALDIRILDI (kullanıcı isteği üzerine)
    // const connections = getConnectionPoints(block);
    // connections.forEach((cp, i) => {
    //     ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
    //     ctx2d.beginPath();
    //     ctx2d.arc(cp.x, cp.y, 2.5 / zoom, 0, Math.PI * 2);
    //     ctx2d.fill();
    // });

    // G4 yazısı - sadece beyaz kontur (dış dolgusu yok), boyut 2/3'e düşürüldü (14 -> 9)
    if (zoom > 0.2) {
        ctx2d.save();
        ctx2d.translate(block.center.x, block.center.y);
        ctx2d.rotate(block.rotation * Math.PI / 180);

        // Yazı boyutları - 2/3 oranında (14'ten 9'a düşürüldü)
        const fontSize = 9;
        ctx2d.font = `${fontSize}px Arial`;

        // G4 yazısını bloğun ortasına koy - sadece beyaz kontur
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5;
        ctx2d.lineJoin = 'round';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('G4', 0, 0);

        ctx2d.restore();
    }
}

/**
 * Vana çizer (iki kesik koninin birleşimi)
 */
function drawVana(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.VANA;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    const halfLength = config.width / 3; // Konileri daha da yaklaştır
    const largeRadius = config.height / 2;
    const smallRadius = 0.5; // Ortadaki birleşimi daha dar yap

    // Çift kesik koni (elmas şekli, sadece kenar çizgisi)
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : 'rgba(255, 255, 255, 1)';
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    // Sol taraf - geniş uç solda, dar uç ortada
    ctx2d.moveTo(-halfLength, -largeRadius);
    ctx2d.lineTo(smallRadius, 0);
    ctx2d.lineTo(-halfLength, largeRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    ctx2d.beginPath();
    // Sağ taraf - dar uç ortada, geniş uç sağda
    ctx2d.moveTo(-smallRadius, 0);
    ctx2d.lineTo(halfLength, -largeRadius);
    ctx2d.lineTo(halfLength, largeRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    // Ortadaki dar birleşim bölgesi (sadece kenar çizgisi)
    //ctx2d.strokeRect(-smallRadius, -smallRadius, smallRadius*2 , smallRadius*2);
    
    ctx2d.lineWidth = 6/ zoom;
    
    // ctx2d.beginPath();
    // ctx2d.moveTo(0,0);
    // ctx2d.lineTo(0,-largeRadius-smallRadius*3);
    // ctx2d.lineTo(-largeRadius-smallRadius*3,-largeRadius-smallRadius*3);
    // ctx2d.stroke();


    ctx2d.beginPath();
    ctx2d.moveTo(-largeRadius-smallRadius-0.5,0);
    ctx2d.lineTo(-largeRadius-smallRadius-2, 0);
    ctx2d.moveTo(largeRadius+smallRadius+0.5,0);
    ctx2d.lineTo(largeRadius+smallRadius+2, 0);    
    ctx2d.stroke();


    ctx2d.restore();
}

/**
 * Kombi çizer (iç içe iki daire + G harfi)
 */
function drawKombi(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    // Dış daire (50 cm çap, sadece kenar çizgisi)
    const outerRadius = 25;
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    ctx2d.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx2d.stroke();

    // İç daire (36 cm çap, sadece kenar çizgisi)
    const innerRadius = 18;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx2d.stroke();
;

    if (zoom > 0.15) {
        ctx2d.fillStyle = '#FFFFFF';  // Beyaz renk
        ctx2d.lineWidth = 1;
        ctx2d.lineJoin = 'round';
        ctx2d.font = `20px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('G', 0, 0);
    }

    ctx2d.restore();

    // Bağlantı noktası - KALDIRILDI (kullanıcı isteği üzerine)
    // const connections = getConnectionPoints(block);
    // ctx2d.fillStyle = '#FF0000';
    // ctx2d.beginPath();
    // ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    // ctx2d.fill();

    // Sinüs çizgisi çiz (eğer boru ucuna doğrudan bağlı değilse)
    const connections = getConnectionPoints(block);
    drawWavyConnectionLine(connections[0], zoom);
}

/**
 * Ocak çizer (yuvarlatılmış dikdörtgen + 4 daire)
 */
function drawOcak(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.OCAK;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    // Yuvarlatılmış dikdörtgen (50 cm, köşe yarıçapı 5 cm, sadece kenar çizgisi)
    const boxSize = 25; // Yarım boyut
    const cornerRadius = 5;

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    ctx2d.moveTo(-boxSize + cornerRadius, -boxSize);
    ctx2d.lineTo(boxSize - cornerRadius, -boxSize);
    ctx2d.arcTo(boxSize, -boxSize, boxSize, -boxSize + cornerRadius, cornerRadius);
    ctx2d.lineTo(boxSize, boxSize - cornerRadius);
    ctx2d.arcTo(boxSize, boxSize, boxSize - cornerRadius, boxSize, cornerRadius);
    ctx2d.lineTo(-boxSize + cornerRadius, boxSize);
    ctx2d.arcTo(-boxSize, boxSize, -boxSize, boxSize - cornerRadius, cornerRadius);
    ctx2d.lineTo(-boxSize, -boxSize + cornerRadius);
    ctx2d.arcTo(-boxSize, -boxSize, -boxSize + cornerRadius, -boxSize, cornerRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    // 4 ocak gözü (daireler, hepsi eşit - 7 cm radius = 14 cm çap)
    const burnerRadius = 7;  // Tüm gözler 14 cm çap
    const offset = 10;

    ctx2d.strokeStyle = '#404040';
    ctx2d.lineWidth = 1 / zoom;

    // Sol üst
    ctx2d.beginPath();
    ctx2d.arc(-offset, -offset, burnerRadius, 0, Math.PI * 2);
    ctx2d.stroke();

    // Sağ üst
    ctx2d.beginPath();
    ctx2d.arc(offset, -offset, burnerRadius, 0, Math.PI * 2);
    ctx2d.stroke();

    // Sol alt
    ctx2d.beginPath();
    ctx2d.arc(-offset, offset, burnerRadius, 0, Math.PI * 2);
    ctx2d.stroke();

    // Sağ alt
    ctx2d.beginPath();
    ctx2d.arc(offset, offset, burnerRadius, 0, Math.PI * 2);
    ctx2d.stroke();

    ctx2d.restore();

    // Bağlantı noktası - KALDIRILDI (kullanıcı isteği üzerine)
    // const connections = getConnectionPoints(block);
    // ctx2d.fillStyle = '#FF0000';
    // ctx2d.beginPath();
    // ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    // ctx2d.fill();

    // Sinüs çizgisi çiz (eğer boru ucuna doğrudan bağlı değilse)
    const connections = getConnectionPoints(block);
    drawWavyConnectionLine(connections[0], zoom);
}

/**
 * Tesisat bloğu çizer (factory pattern)
 */
export function drawPlumbingBlock(block, isSelected = false) {
    const { ctx2d } = dom;
    const blockType = block.blockType;

    ctx2d.save();

    switch (blockType) {
        case 'SERVIS_KUTUSU':
            drawServisKutusu(block, isSelected);
            break;
        case 'SAYAC':
            drawSayac(block, isSelected);
            break;
        case 'VANA':
            drawVana(block, isSelected);
            break;
        case 'KOMBI':
            drawKombi(block, isSelected);
            break;
        case 'OCAK':
            drawOcak(block, isSelected);
            break;
        default:
            console.error(`Bilinmeyen blok tipi: ${blockType}`);
    }

    ctx2d.restore();
}

/**
 * Tüm tesisat bloklarını çizer (VANA HARİÇ - vanalar artık boru üzerinde)
 */
export function drawPlumbingBlocks() {
    const currentFloorId = state.currentFloor?.id;
    const blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId && b.blockType !== 'VANA');

    for (const block of blocks) {
        const isSelected = state.selectedObject?.object === block;
        drawPlumbingBlock(block, isSelected);
    }
}

/**
 * Tüm vanaları boru üzerinde çizer
 */
export function drawValvesOnPipes() {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
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
            const centerX = pipe.p1.x + dx * valve.pos;
            const centerY = pipe.p1.y + dy * valve.pos;

            // Vananın rotasyonu (boru yönünde)
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const rotation = valve.rotation || Math.round(angle / 15) * 15;

            // Vana seçili mi kontrol et
            const isSelected = state.selectedObject?.type === 'valve' && state.selectedObject?.object === valve;

            // Vana çizimini yap (drawVana fonksiyonunun benzeri ama merkezde)
            ctx2d.save();
            ctx2d.translate(centerX, centerY);
            ctx2d.rotate(rotation * Math.PI / 180);

            const config = PLUMBING_BLOCK_TYPES.VANA;
            const halfLength = config.width / 3;
            const largeRadius = config.height / 2;
            const smallRadius = 0.5;

            ctx2d.strokeStyle = isSelected ? '#8ab4f8' : 'rgba(255, 255, 255, 1)';
            ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

            // Çift kesik koni (elmas şekli)
            ctx2d.beginPath();
            ctx2d.moveTo(-halfLength, -largeRadius);
            ctx2d.lineTo(smallRadius, 0);
            ctx2d.lineTo(-halfLength, largeRadius);
            ctx2d.closePath();
            ctx2d.stroke();

            ctx2d.beginPath();
            ctx2d.moveTo(-smallRadius, 0);
            ctx2d.lineTo(halfLength, -largeRadius);
            ctx2d.lineTo(halfLength, largeRadius);
            ctx2d.closePath();
            ctx2d.stroke();

            ctx2d.lineWidth = 6 / zoom;
            ctx2d.beginPath();
            ctx2d.moveTo(-largeRadius - smallRadius - 0.5, 0);
            ctx2d.lineTo(-largeRadius - smallRadius - 2, 0);
            ctx2d.moveTo(largeRadius + smallRadius + 0.5, 0);
            ctx2d.lineTo(largeRadius + smallRadius + 2, 0);
            ctx2d.stroke();

            ctx2d.restore();
        }
    }
}

/**
 * Seçili tesisat bloğunun handle'larını çizer
 * Bağlantı noktaları + Rotation handle
 */
export function drawPlumbingBlockHandles(block) {
    const { ctx2d } = dom;
    const { zoom } = state;

    const connections = getConnectionPoints(block);

    // Bağlantı noktası handle'ları çiz
    for (let i = 0; i < connections.length; i++) {
        const cp = connections[i];
        // Servis kutusu için tüm noktalar yeşil (6 nokta), diğerleri için ilk yeşil, diğerleri kırmızı
        if (block.blockType === 'SERVIS_KUTUSU') {
            ctx2d.fillStyle = '#00FF00'; // Tüm noktalar yeşil
        } else {
            ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
        }
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5 / zoom;
        ctx2d.beginPath();
        ctx2d.arc(cp.x, cp.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
    }

    // Rotation handle (merkez üstünde, 30 cm yukarıda)
    const rotationHandleDistance = 30;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const handleX = block.center.x + Math.sin(angle) * rotationHandleDistance;
    const handleY = block.center.y - Math.cos(angle) * rotationHandleDistance;

    // Rotation handle'a çizgi çiz
    ctx2d.strokeStyle = '#8ab4f8';
    ctx2d.lineWidth = 2 / zoom;
    ctx2d.setLineDash([5 / zoom, 5 / zoom]);
    ctx2d.beginPath();
    ctx2d.moveTo(block.center.x, block.center.y);
    ctx2d.lineTo(handleX, handleY);
    ctx2d.stroke();
    ctx2d.setLineDash([]);

    // Rotation handle'ı çiz (daire içinde ok)
    ctx2d.fillStyle = '#8ab4f8';
    ctx2d.strokeStyle = '#FFFFFF';
    ctx2d.lineWidth = 1.5 / zoom;
    ctx2d.beginPath();
    ctx2d.arc(handleX, handleY, 6 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();
}

/**
 * TESİSAT BORULARI 2D RENDERING
 */

/**
 * Tek bir boruyu çizer
 * @param {object} pipe - Boru nesnesi
 * @param {boolean} isSelected - Seçili mi?
 */
export function drawPlumbingPipe(pipe, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom } = state;
    const config = pipe.typeConfig || PLUMBING_PIPE_TYPES[pipe.pipeType];

    // Boru çizgisi
    ctx2d.save();
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : `#${config.color.toString(16).padStart(6, '0')}`;
    ctx2d.lineWidth = (isSelected ? config.lineWidth + 2 : config.lineWidth) / zoom;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    // Kesikli çizgi kontrolü - eğer vanaya bağlı değilse kesikli çiz
    if (!pipe.isConnectedToValve) {
        ctx2d.setLineDash([15 / zoom, 10 / zoom]); // Daha açık kesikli çizgi
    }

    ctx2d.beginPath();
    ctx2d.moveTo(pipe.p1.x, pipe.p1.y);
    ctx2d.lineTo(pipe.p2.x, pipe.p2.y);
    ctx2d.stroke();

    // LineDash'i sıfırla
    ctx2d.setLineDash([]);

    ctx2d.restore();

    // Uç noktaları çiz (seçiliyse)
    if (isSelected) {
        ctx2d.fillStyle = '#8ab4f8';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5 / zoom;

        // P1
        ctx2d.beginPath();
        ctx2d.arc(pipe.p1.x, pipe.p1.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();

        // P2
        ctx2d.beginPath();
        ctx2d.arc(pipe.p2.x, pipe.p2.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
    }
}

/**
 * Tüm tesisat borularını çizer
 */
export function drawPlumbingPipes() {
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    for (const pipe of pipes) {
        const isSelected = state.selectedObject?.object === pipe;
        drawPlumbingPipe(pipe, isSelected);
    }
}

/**
 * Boru çizim modu için önizleme çizer
 */
export function drawPlumbingPipePreview() {
    if (state.currentMode !== 'drawPlumbingPipe' || !state.startPoint || !state.mousePos) {
        return;
    }

    const { ctx2d } = dom;
    const { zoom } = state;
    const pipeType = state.currentPlumbingPipeType || 'STANDARD';
    const config = PLUMBING_PIPE_TYPES[pipeType];

    // Snap kontrolü - hem bağlantı noktalarına hem boru uçlarına
    let endPoint = { x: state.mousePos.x, y: state.mousePos.y };
    let isSnapped = false;

    // Önce bağlantı noktalarına snap
    const blockSnap = snapToConnectionPoint(endPoint, 15);
    if (blockSnap) {
        endPoint = { x: blockSnap.x, y: blockSnap.y };
        isSnapped = true;
    } else {
        // Bağlantı noktası yoksa boru uçlarına snap
        const pipeSnap = snapToPipeEndpoint(endPoint, 15);
        if (pipeSnap) {
            endPoint = { x: pipeSnap.x, y: pipeSnap.y };
            isSnapped = true;
        }
    }

    // Önizleme çizgisi
    ctx2d.save();
    ctx2d.strokeStyle = isSnapped ? '#00FF00' : `#${config.color.toString(16).padStart(6, '0')}`;
    ctx2d.lineWidth = config.lineWidth / zoom;
    ctx2d.lineCap = 'round';
    ctx2d.globalAlpha = 0.7;

    ctx2d.beginPath();
    ctx2d.moveTo(state.startPoint.x, state.startPoint.y);
    ctx2d.lineTo(endPoint.x, endPoint.y);
    ctx2d.stroke();

    ctx2d.restore();

    // Başlangıç noktası
    ctx2d.fillStyle = '#00FF00';
    ctx2d.beginPath();
    ctx2d.arc(state.startPoint.x, state.startPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx2d.fill();

    // Bitiş noktası (snap varsa vurgula)
    if (isSnapped) {
        ctx2d.fillStyle = '#00FF00';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.beginPath();
        ctx2d.arc(endPoint.x, endPoint.y, 6 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
    }

    // Uzunluk göster
    const length = Math.hypot(
        endPoint.x - state.startPoint.x,
        endPoint.y - state.startPoint.y
    );

    if (length > 1) {
        const midX = (state.startPoint.x + endPoint.x) / 2;
        const midY = (state.startPoint.y + endPoint.y) / 2;

        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.strokeStyle = '#000000';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.font = `bold ${14 / zoom}px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';

        const text = `${Math.round(length)} cm`;
        ctx2d.strokeText(text, midX, midY);
        ctx2d.fillText(text, midX, midY);
    }
}

/**
 * OCAK/KOMBI EKLEME MODU ÖNİZLEMESİ - Mouse ucunda cihaz simülasyonu
 * CİHAZ BAĞLANTI NOKTASINDAN TUTULUR (mousePos = bağlantı noktası)
 * Boru ucuna gelince snap göstergesi gösterir
 */
export function drawPlumbingBlockPlacementPreview() {
    const { mousePos, currentMode, currentPlumbingBlockType } = state;

    // Sadece ocak veya kombi ekleme modundayken çalış
    if (currentMode !== 'drawPlumbingBlock') return;
    if (!currentPlumbingBlockType || (currentPlumbingBlockType !== 'OCAK' && currentPlumbingBlockType !== 'KOMBI')) return;
    if (!mousePos) return;

    const { ctx2d } = dom;
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    // CİHAZ BAĞLANTI NOKTASINDAN TUTULUR
    // mousePos = bağlantı noktası pozisyonu
    // Cihazın merkezi = mousePos + connectionPoint offsetinin tersi
    const config = PLUMBING_BLOCK_TYPES[currentPlumbingBlockType];
    const connectionPointOffset = config.connectionPoints[0]; // { x: 0, y: -25 } (kombi/ocak için)

    // Cihazın merkezi = mousePos - connectionPointOffset (rotasyon 0 için)
    const deviceCenterX = mousePos.x - connectionPointOffset.x;
    const deviceCenterY = mousePos.y - connectionPointOffset.y;

    const halfW = config.width / 2;
    const halfH = config.height / 2;

    ctx2d.save();
    ctx2d.translate(deviceCenterX, deviceCenterY);

    // Yarı saydam cihaz kutusu
    ctx2d.strokeStyle = state.wallBorderColor;
    ctx2d.lineWidth = 2 / zoom;
    ctx2d.setLineDash([5 / zoom, 5 / zoom]);

    if (currentPlumbingBlockType === 'KOMBI') {
        // Kombi için daire çiz
        ctx2d.beginPath();
        ctx2d.arc(0, 0, 25, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.fill();
    } else {
        // Ocak için yuvarlatılmış dikdörtgen çiz
        const cornerRadius = 5;
        ctx2d.beginPath();
        ctx2d.moveTo(-halfW + cornerRadius, -halfH);
        ctx2d.lineTo(halfW - cornerRadius, -halfH);
        ctx2d.arcTo(halfW, -halfH, halfW, -halfH + cornerRadius, cornerRadius);
        ctx2d.lineTo(halfW, halfH - cornerRadius);
        ctx2d.arcTo(halfW, halfH, halfW - cornerRadius, halfH, cornerRadius);
        ctx2d.lineTo(-halfW + cornerRadius, halfH);
        ctx2d.arcTo(-halfW, halfH, -halfW, halfH - cornerRadius, cornerRadius);
        ctx2d.lineTo(-halfW, -halfH + cornerRadius);
        ctx2d.arcTo(-halfW, -halfH, -halfW + cornerRadius, -halfH, cornerRadius);
        ctx2d.closePath();
        ctx2d.stroke();
        ctx2d.fill();
    }

    ctx2d.setLineDash([]);

    // Cihaz ismi
    ctx2d.fillStyle = '#ffffff';
    ctx2d.font = `bold ${12 / zoom}px Arial`;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(currentPlumbingBlockType, 0, 0);

    ctx2d.restore();

    // Bağlantı noktası göster (mousePos = bağlantı noktası)
    ctx2d.fillStyle = '#00FF00'; // Yeşil (kırmızı yerine)
    ctx2d.beginPath();
    ctx2d.arc(mousePos.x, mousePos.y, 4 / zoom, 0, Math.PI * 2);
    ctx2d.fill();

    // En yakın boru ucunu bul ve snap göstergesi göster
    let closestPipeEnd = null;
    let minDist = Infinity;
    const SNAP_TOLERANCE = 15; // 15 cm

    for (const pipe of pipes) {
        // p1'e olan mesafe
        const dist1 = Math.hypot(pipe.p1.x - mousePos.x, pipe.p1.y - mousePos.y);
        if (dist1 < minDist) {
            minDist = dist1;
            closestPipeEnd = { x: pipe.p1.x, y: pipe.p1.y };
        }

        // p2'ye olan mesafe
        const dist2 = Math.hypot(pipe.p2.x - mousePos.x, pipe.p2.y - mousePos.y);
        if (dist2 < minDist) {
            minDist = dist2;
            closestPipeEnd = { x: pipe.p2.x, y: pipe.p2.y };
        }
    }

    // Snap göstergesi
    if (closestPipeEnd && minDist < SNAP_TOLERANCE) {
        // Boru ucunu vurgula
        ctx2d.save();
        ctx2d.fillStyle = '#00FF00';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 3 / zoom;
        ctx2d.beginPath();
        ctx2d.arc(closestPipeEnd.x, closestPipeEnd.y, 8 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();

        // Esnek hat önizlemesi (sinüs eğrisi) - boru ucundan cihaza
        const dx = mousePos.x - closestPipeEnd.x;
        const dy = mousePos.y - closestPipeEnd.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 2) {
            // Sinüs parametreleri
            const amplitude = 3;
            const frequency = 3;
            const segments = 30;

            ctx2d.strokeStyle = '#00FF00';
            ctx2d.lineWidth = 3 / zoom;
            ctx2d.setLineDash([]);
            ctx2d.globalAlpha = 0.8;

            ctx2d.beginPath();
            ctx2d.moveTo(closestPipeEnd.x, closestPipeEnd.y);

            // Sinüs eğrisi çiz
            for (let i = 1; i <= segments; i++) {
                const t = i / segments;

                // Ana çizgi
                const baseX = closestPipeEnd.x + dx * t;
                const baseY = closestPipeEnd.y + dy * t;

                // Perpendicular yön
                const perpX = -dy / distance;
                const perpY = dx / distance;

                // Smoothstep envelope
                const smoothEnvelope = t * t * (3 - 2 * t);

                // Sinüs dalgası
                const wave = Math.sin(smoothEnvelope * frequency * Math.PI * 2);

                // Offset
                const sineOffset = smoothEnvelope * (1 - smoothEnvelope) * 4 * amplitude * wave;

                // Final pozisyon
                const finalX = baseX + perpX * sineOffset;
                const finalY = baseY + perpY * sineOffset;

                ctx2d.lineTo(finalX, finalY);
            }

            ctx2d.stroke();
            ctx2d.globalAlpha = 1.0;
        }

        // "VANA + CİHAZ EKLENECEK" yazısı
        // const midX = (mousePos.x + closestPipeEnd.x) / 2;
        // const midY = (mousePos.y + closestPipeEnd.y) / 2 - 15 / zoom;

        // ctx2d.fillStyle = '#00FF00';
        // ctx2d.strokeStyle = '#000000';
        // ctx2d.lineWidth = 3 / zoom;
        // ctx2d.font = `bold ${12 / zoom}px Arial`;
        // ctx2d.textAlign = 'center';
        // ctx2d.textBaseline = 'bottom';
        // ctx2d.strokeText('VANA + ' + currentPlumbingBlockType, midX, midY);
        // ctx2d.fillText('VANA + ' + currentPlumbingBlockType, midX, midY);

        ctx2d.restore();
    }
}
