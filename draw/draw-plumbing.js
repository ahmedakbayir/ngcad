import { state, dom } from '../general-files/main.js';
import { PLUMBING_BLOCK_TYPES, getPlumbingBlockCorners, getConnectionPoints } from '../architectural-objects/plumbing-blocks.js';
import { PLUMBING_PIPE_TYPES } from '../architectural-objects/plumbing-pipes.js';

/**
 * TESİSAT BLOKLARI 2D RENDERING
 *
 * Her blok tipi için özel 2D sembol çizimi
 */

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

    // SK yazısı - beyaz büyük
    if (zoom > 0.2) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.font = `bold ${18 / zoom}px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('SK', 0, 0);
    }

    ctx2d.restore();

    // Bağlantı noktası
    const connections = getConnectionPoints(block);
    ctx2d.fillStyle = '#FF0000';
    ctx2d.beginPath();
    ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
}

/**
 * Sayaç çizer (yuvarlatılmış dikdörtgen)
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

    ctx2d.restore();

    // Bağlantı noktaları
    const connections = getConnectionPoints(block);
    connections.forEach((cp, i) => {
        ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
        ctx2d.beginPath();
        ctx2d.arc(cp.x, cp.y, 2.5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
    });

    // G4 yazısı - dışarıda (önünde)
    if (zoom > 0.3) {
        ctx2d.save();
        ctx2d.translate(block.center.x, block.center.y);
        ctx2d.rotate(block.rotation * Math.PI / 180);

        // G4 yazısını bloğun önüne koy (y: -halfH - 8)
        ctx2d.fillStyle = '#333';
        ctx2d.font = `bold ${12 / zoom}px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'bottom';
        ctx2d.fillText('G4', 0, -halfH - 3);
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
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    // Sol taraf - geniş uç solda, dar uç ortada
    ctx2d.moveTo(-halfLength, -largeRadius);
    ctx2d.lineTo(-smallRadius, 0);
    ctx2d.lineTo(-halfLength, largeRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    ctx2d.beginPath();
    // Sağ taraf - dar uç ortada, geniş uç sağda
    ctx2d.moveTo(smallRadius, 0);
    ctx2d.lineTo(halfLength, -largeRadius);
    ctx2d.lineTo(halfLength, largeRadius);
    ctx2d.closePath();
    ctx2d.stroke();

    // Ortadaki dar birleşim bölgesi (sadece kenar çizgisi)
    ctx2d.strokeRect(-smallRadius, -smallRadius, smallRadius * 2, smallRadius * 2);

    ctx2d.restore();

    // Bağlantı noktaları
    const connections = getConnectionPoints(block);
    connections.forEach((cp, i) => {
        ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
        ctx2d.beginPath();
        ctx2d.arc(cp.x, cp.y, 2 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
    });
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

    // G harfi
    if (zoom > 0.2) {
        ctx2d.fillStyle = '#2196F3';
        ctx2d.font = `bold ${20 / zoom}px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('G', 0, 0);
    }

    ctx2d.restore();

    // Bağlantı noktası (altta)
    const connections = getConnectionPoints(block);
    ctx2d.fillStyle = '#FF0000';
    ctx2d.beginPath();
    ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
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

    // Bağlantı noktası (arka ortada)
    const connections = getConnectionPoints(block);
    ctx2d.fillStyle = '#FF0000';
    ctx2d.beginPath();
    ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
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
 * Tüm tesisat bloklarını çizer
 */
export function drawPlumbingBlocks() {
    const currentFloorId = state.currentFloor?.id;
    const blocks = (state.plumbingBlocks || []).filter(b => b.floorId === currentFloorId);

    for (const block of blocks) {
        const isSelected = state.selectedObject?.object === block;
        drawPlumbingBlock(block, isSelected);
    }
}

/**
 * Seçili tesisat bloğunun handle'larını çizer
 */
export function drawPlumbingBlockHandles(block) {
    const { ctx2d } = dom;
    const { zoom } = state;

    const corners = getPlumbingBlockCorners(block);
    const connections = getConnectionPoints(block);

    // Köşe handle'ları
    ctx2d.fillStyle = '#8ab4f8';
    ctx2d.strokeStyle = '#FFFFFF';
    ctx2d.lineWidth = 1.5 / zoom;

    for (const corner of corners) {
        ctx2d.beginPath();
        ctx2d.arc(corner.x, corner.y, 5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
    }

    // Merkez handle
    ctx2d.fillStyle = '#FF9800';
    ctx2d.beginPath();
    ctx2d.arc(block.center.x, block.center.y, 6 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // Rotasyon handle (sağ üst köşeden biraz dışarıda)
    const rotateHandlePos = {
        x: corners[1].x + 20 / zoom,
        y: corners[1].y - 20 / zoom
    };
    ctx2d.fillStyle = '#4CAF50';
    ctx2d.beginPath();
    ctx2d.arc(rotateHandlePos.x, rotateHandlePos.y, 5 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // Rotasyon handle'ına çizgi
    ctx2d.strokeStyle = '#4CAF50';
    ctx2d.setLineDash([3 / zoom, 3 / zoom]);
    ctx2d.beginPath();
    ctx2d.moveTo(corners[1].x, corners[1].y);
    ctx2d.lineTo(rotateHandlePos.x, rotateHandlePos.y);
    ctx2d.stroke();
    ctx2d.setLineDash([]);

    // Bağlantı noktası handle'ları
    for (let i = 0; i < connections.length; i++) {
        const cp = connections[i];
        ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.beginPath();
        ctx2d.arc(cp.x, cp.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
    }
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

    // Önizleme çizgisi
    ctx2d.save();
    ctx2d.strokeStyle = `#${config.color.toString(16).padStart(6, '0')}`;
    ctx2d.lineWidth = config.lineWidth / zoom;
    ctx2d.lineCap = 'round';
    ctx2d.globalAlpha = 0.7;

    ctx2d.beginPath();
    ctx2d.moveTo(state.startPoint.x, state.startPoint.y);
    ctx2d.lineTo(state.mousePos.x, state.mousePos.y);
    ctx2d.stroke();

    ctx2d.restore();

    // Başlangıç noktası
    ctx2d.fillStyle = '#00FF00';
    ctx2d.beginPath();
    ctx2d.arc(state.startPoint.x, state.startPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx2d.fill();

    // Uzunluk göster
    const length = Math.hypot(
        state.mousePos.x - state.startPoint.x,
        state.mousePos.y - state.startPoint.y
    );

    if (length > 1) {
        const midX = (state.startPoint.x + state.mousePos.x) / 2;
        const midY = (state.startPoint.y + state.mousePos.y) / 2;

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
