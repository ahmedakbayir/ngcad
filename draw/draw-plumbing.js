import { state, dom } from '../general-files/main.js';
import { PLUMBING_BLOCK_TYPES, getPlumbingBlockCorners, getConnectionPoints } from '../architectural-objects/plumbing-blocks.js';

/**
 * TESİSAT BLOKLARI 2D RENDERING
 *
 * Her blok tipi için özel 2D sembol çizimi
 */

/**
 * Servis Kutusu çizer (basit dikdörtgen)
 */
function drawServisKutusu(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.SERVIS_KUTUSU;

    const corners = getPlumbingBlockCorners(block);

    // Ana dikdörtgen
    ctx2d.fillStyle = '#F5F5F5';
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
        ctx2d.lineTo(corners[i].x, corners[i].y);
    }
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    // Bağlantı noktası
    const connections = getConnectionPoints(block);
    ctx2d.fillStyle = '#FF0000';
    ctx2d.beginPath();
    ctx2d.arc(connections[0].x, connections[0].y, 3 / zoom, 0, Math.PI * 2);
    ctx2d.fill();

    // Etiket
    if (zoom > 0.3) {
        ctx2d.save();
        ctx2d.translate(block.center.x, block.center.y);
        ctx2d.rotate(block.rotation * Math.PI / 180);
        ctx2d.fillStyle = '#333';
        ctx2d.font = `${12 / zoom}px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('SK', 0, 0);
        ctx2d.restore();
    }
}

/**
 * Sayaç çizer (dikdörtgen)
 */
function drawSayac(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;

    const corners = getPlumbingBlockCorners(block);

    // Ana dikdörtgen
    ctx2d.fillStyle = '#FFFFFF';
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
        ctx2d.lineTo(corners[i].x, corners[i].y);
    }
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    // Bağlantı noktaları
    const connections = getConnectionPoints(block);
    connections.forEach((cp, i) => {
        ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
        ctx2d.beginPath();
        ctx2d.arc(cp.x, cp.y, 2.5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
    });

    // Etiket
    if (zoom > 0.3) {
        ctx2d.save();
        ctx2d.translate(block.center.x, block.center.y);
        ctx2d.rotate(block.rotation * Math.PI / 180);
        ctx2d.fillStyle = '#333';
        ctx2d.font = `${11 / zoom}px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('SAY', 0, 0);
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

    const halfLength = config.width / 2;
    const largeRadius = config.height / 2;
    const smallRadius = 1;

    // Çift kesik koni (elmas şekli)
    ctx2d.fillStyle = '#A0A0A0';
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;

    ctx2d.beginPath();
    // Sol taraf
    ctx2d.moveTo(-halfLength, 0);
    ctx2d.lineTo(-smallRadius, -largeRadius);
    ctx2d.lineTo(-smallRadius, largeRadius);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    ctx2d.beginPath();
    // Sağ taraf
    ctx2d.moveTo(halfLength, 0);
    ctx2d.lineTo(smallRadius, -largeRadius);
    ctx2d.lineTo(smallRadius, largeRadius);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    // Ortadaki dar kısım
    ctx2d.fillStyle = '#808080';
    ctx2d.fillRect(-smallRadius, -largeRadius, smallRadius * 2, largeRadius * 2);

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

    // Dış daire (50 cm çap)
    const outerRadius = 25;
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx2d.fillStyle = '#FFFFFF';

    ctx2d.beginPath();
    ctx2d.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // İç daire (36 cm çap)
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

    // Yuvarlatılmış dikdörtgen (50 cm, köşe yarıçapı 5 cm)
    const boxSize = 25; // Yarım boyut
    const cornerRadius = 5;

    ctx2d.fillStyle = '#303030';
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
    ctx2d.fill();
    ctx2d.stroke();

    // 4 ocak gözü (daireler, çaplar 12-16 cm arası)
    const burnerRadius1 = 6;
    const burnerRadius2 = 8;
    const offset = 10;

    ctx2d.fillStyle = '#606060';
    ctx2d.strokeStyle = '#404040';
    ctx2d.lineWidth = 1 / zoom;

    // Sol üst
    ctx2d.beginPath();
    ctx2d.arc(-offset, -offset, burnerRadius1, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // Sağ üst
    ctx2d.beginPath();
    ctx2d.arc(offset, -offset, burnerRadius2, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // Sol alt
    ctx2d.beginPath();
    ctx2d.arc(-offset, offset, burnerRadius2, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // Sağ alt
    ctx2d.beginPath();
    ctx2d.arc(offset, offset, burnerRadius1, 0, Math.PI * 2);
    ctx2d.fill();
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
