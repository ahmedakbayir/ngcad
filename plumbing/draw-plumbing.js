// draw/draw-plumbing.js

import { state, dom } from '../general-files/main.js';
import { PLUMBING_BLOCK_TYPES, getPlumbingBlockCorners, getConnectionPoints, getActiveConnectionPoints } from './plumbing-blocks.js';
import { PLUMBING_PIPE_TYPES, snapToConnectionPoint, snapToPipeEndpoint, isSpaceForValve } from './plumbing-pipes.js'; // isSpaceForValve import edildi
import { getObjectAtPoint } from '../general-files/actions.js'; // getObjectAtPoint import edildi
import { distToSegmentSquared } from '../draw/geometry.js'; // Gerekli import eklendi
import { snapTo15DegreeAngle } from '../draw/geometry.js'; // Gerekli import eklendi

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
            if (pipeLength > 0) { // Sıfıra bölmeyi engelle
                pipeDirection = {
                    x: (pipe.p2.x - pipe.p1.x) / pipeLength,
                    y: (pipe.p2.y - pipe.p1.y) / pipeLength
                };
            }
        }

        // p2'ye olan mesafe
        const dist2 = Math.hypot(pipe.p2.x - connectionPoint.x, pipe.p2.y - connectionPoint.y);
        if (dist2 < minDist) {
            minDist = dist2;
            closestPipeEnd = { x: pipe.p2.x, y: pipe.p2.y };
            // Boru yönü: p1'den p2'ye (boru ucundan içeriye)
            const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
             if (pipeLength > 0) { // Sıfıra bölmeyi engelle
                pipeDirection = {
                    x: (pipe.p1.x - pipe.p2.x) / pipeLength,
                    y: (pipe.p1.y - pipe.p2.y) / pipeLength
                };
             }
        }
    }

    // Eğer doğrudan bağlı değilse (mesafe > tolerans), sinüs çizgisi çiz
    if (closestPipeEnd && pipeDirection && minDist > DIRECT_CONNECTION_TOLERANCE) {
        const dx = closestPipeEnd.x - connectionPoint.x;
        const dy = closestPipeEnd.y - connectionPoint.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 0.1) return; // Çok kısaysa çizme

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

    // Yuvarlatılmış dikdörtgen (1 cm köşe yarıçapı)
    const halfW = config.width / 2;
    const halfH = config.height / 2;
    const cornerRadius = 1;

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx2d.fillStyle = isSelected ? 'rgba(138, 180, 248, 0.1)' : 'rgba(30, 31, 32, 0.8)';

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
    ctx2d.fill(); // Dolgu
    ctx2d.stroke();

    // SK yazısı
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
}

/**
 * Sayaç çizer (GÜNCELLENMİŞ: Ön çıkıntılı tasarım ve geri eklenen kollar)
 */
function drawSayac(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.SAYAC; // width: 18, height: 18

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    // --- Ana Gövde ---
    const halfW = config.width / 2;     // 9
    const halfH = config.height / 2;    // 9
    const cornerRadius = 0.5;             // İstenen: 1cm

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx2d.fillStyle = isSelected ? 'rgba(138, 180, 248, 0.1)' : 'rgba(30, 31, 32, 0.8)'; // Hafif dolgu

    ctx2d.beginPath();
    ctx2d.moveTo(-halfW + cornerRadius, -halfH); // Sol üst
    ctx2d.lineTo(halfW - cornerRadius, -halfH);  // Sağ üst
    ctx2d.arcTo(halfW, -halfH, halfW, -halfH + cornerRadius, cornerRadius);
    ctx2d.lineTo(halfW, halfH - cornerRadius);  // Sağ alt
    ctx2d.arcTo(halfW, halfH, halfW - cornerRadius, halfH, cornerRadius);
    ctx2d.lineTo(-halfW + cornerRadius, halfH); // Sol alt
    ctx2d.arcTo(-halfW, halfH, -halfW, halfH - cornerRadius, cornerRadius);
    ctx2d.lineTo(-halfW, -halfH + cornerRadius); // Sol üst
    ctx2d.arcTo(-halfW, -halfH, -halfW + cornerRadius, -halfH, cornerRadius);
    ctx2d.closePath();
    ctx2d.fill(); // Dolgu
    ctx2d.stroke(); // Kontur

    // --- Ön Çıkıntı ---
    const protrusionDepth = 1;  // 4.5
    const protrusionWidth = config.width - 3; // 12
    const halfProtW = protrusionWidth / 2;    // 6
    const protRadius = 0.5; // 1cm

    const y1 = halfH;                     // 9 (ana gövdenin önü)
    const y2 = halfH + protrusionDepth;   // 9 + 4.5 = 13.5 (çıkıntının önü)
    const x1 = -halfProtW;                // -6
    const x2 = halfProtW;                 // 6

    // Çıkıntıyı çiz (sadece 3 kenar, arka kenar ana gövdeye yapışık)
    ctx2d.beginPath();
    ctx2d.moveTo(x1, y1);
    ctx2d.lineTo(x1, y2 - protRadius);
    ctx2d.arcTo(x1, y2, x1 + protRadius, y2, protRadius);
    ctx2d.lineTo(x2 - protRadius, y2);
    ctx2d.arcTo(x2, y2, x2, y2 - protRadius, protRadius);
    ctx2d.lineTo(x2, y1);
    ctx2d.stroke(); 

    // --- Bağlantı kolları ---
    const lineLength = config.connectionLineLength || 10; // 10cm
    const inletCP_X = config.connectionPoints[0].x;     // -5 (Düzeltildi)
    const outletCP_X = config.connectionPoints[1].x;   // 5 (Düzeltildi)
    const armStartY = config.connectionPoints[0].y + lineLength; // -19 + 10 = -9
    const armEndY = config.connectionPoints[0].y; // -19 

    ctx2d.strokeStyle = wallBorderColor; 
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom; 

    // Sol kol (Giriş)
    ctx2d.beginPath();
    ctx2d.moveTo(inletCP_X, armStartY);
    ctx2d.lineTo(inletCP_X, armEndY);
    ctx2d.stroke();

    // Sağ kol (Çıkış)
    ctx2d.beginPath();
    ctx2d.moveTo(outletCP_X, armStartY);
    ctx2d.lineTo(outletCP_X, armEndY);
    ctx2d.stroke();

    // G4 yazısı
    if (zoom > 0.2) {
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5;
        ctx2d.lineJoin = 'round';
        ctx2d.font = `9px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('G4', 0, 0); 
    }

    ctx2d.restore();
}


/**
 * Kombi çizer (iç içe iki daire + G harfi)
 */
function drawKombi(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.KOMBI; // width: 18, height: 18

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    // Dış daire (50 cm çap, sadece kenar çizgisi)
    const outerRadius = 25;
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx2d.fillStyle = isSelected ? 'rgba(138, 180, 248, 0.1)' : 'rgba(30, 31, 32, 0.8)';

    ctx2d.beginPath();
    ctx2d.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx2d.fill(); 
    ctx2d.stroke();

    // İç daire (36 cm çap, sadece kenar çizgisi)
    const innerRadius = 18;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx2d.stroke();
;

    if (zoom > 0.15) {
        ctx2d.fillStyle = '#FFFFFF';  
        ctx2d.lineWidth = 1;
        ctx2d.lineJoin = 'round';
        ctx2d.font = `20px Arial`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('G', 0, 0);
    }

    ctx2d.restore();

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
    ctx2d.fillStyle = isSelected ? 'rgba(138, 180, 248, 0.1)' : 'rgba(30, 31, 32, 0.8)';

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

    // 4 ocak gözü (daireler, hepsi eşit - 7 cm radius = 14 cm çap)
    const burnerRadius = 7;  // Tüm gözler 14 cm çap
    const offset = 10;

    ctx2d.strokeStyle = '#404040';
    ctx2d.lineWidth = 1 / zoom;

    ctx2d.beginPath(); ctx2d.arc(-offset, -offset, burnerRadius, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(offset, -offset, burnerRadius, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(-offset, offset, burnerRadius, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(offset, offset, burnerRadius, 0, Math.PI * 2); ctx2d.stroke();

    ctx2d.restore();

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
 * Vana 2D çizim fonksiyonu (artık boru üzerinde çağrılmak için)
 */
function drawVana(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    
    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate((block.rotation || 0) * Math.PI / 180);

    const config = PLUMBING_BLOCK_TYPES.VANA;
    const halfLength = config.width / 2; // 6
    const largeRadius = config.height / 2; // 3
    const smallRadius = 0.5; // 0.5

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : 'rgba(255, 255, 255, 1)';
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx2d.fillStyle = 'rgba(255,255,255, 1)'; // Koyu dolgu (boru çizgisini silmek için)

    // Çift kesik koni (elmas şekli)
    ctx2d.beginPath();
    ctx2d.moveTo(-halfLength, -largeRadius);
    ctx2d.lineTo(0, -smallRadius);
    ctx2d.lineTo(halfLength, -largeRadius);
    ctx2d.lineTo(halfLength, largeRadius);
    ctx2d.lineTo(0, smallRadius);
    ctx2d.lineTo(-halfLength, largeRadius);
    ctx2d.closePath();
    
    ctx2d.fill(); // Önce dolgu (boruyu sil)
    ctx2d.stroke(); // Sonra kenarlık

    ctx2d.restore();
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
            const centerX = pipe.p1.x + dx * valve.pos;
            const centerY = pipe.p1.y + dy * valve.pos;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const isSelected = state.selectedObject?.type === 'valve' && state.selectedObject?.object === valve;

            drawVana({
                center: { x: centerX, y: centerY },
                rotation: angle
            }, isSelected);
        }
    }
}

/**
 * Seçili tesisat bloğunun handle'larını çizer
 */
export function drawPlumbingBlockHandles(block) {
    const { ctx2d } = dom;
    const { zoom } = state;

    const connections = getConnectionPoints(block); // Servis Kutusu için boş

    // Bağlantı noktası handle'ları çiz
    for (let i = 0; i < connections.length; i++) {
        const cp = connections[i];
        ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000'; // Sayaç/Vana
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
 */
export function drawPlumbingPipe(pipe, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom } = state;
    const config = pipe.typeConfig || PLUMBING_PIPE_TYPES[pipe.pipeType];

    ctx2d.save();
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : `#${config.color.toString(16).padStart(6, '0')}`;
    ctx2d.lineWidth = (isSelected ? config.lineWidth + 2 : config.lineWidth) / zoom;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    if (!pipe.isConnectedToValve) {
        ctx2d.setLineDash([15 / zoom, 10 / zoom]); 
    }

    ctx2d.beginPath();
    ctx2d.moveTo(pipe.p1.x, pipe.p1.y);
    ctx2d.lineTo(pipe.p2.x, pipe.p2.y);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.restore();

    if (isSelected) {
        ctx2d.fillStyle = '#8ab4f8';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5 / zoom;
        ctx2d.beginPath();
        ctx2d.arc(pipe.p1.x, pipe.p1.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
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
    if (state.currentMode !== 'drawPlumbingPipe' || !state.mousePos) {
        return;
    }

    const { ctx2d } = dom;
    const { zoom } = state;
    const pipeType = state.currentPlumbingPipeType || 'STANDARD';
    const config = PLUMBING_PIPE_TYPES[pipeType];

    if (!state.startPoint) {
        return;
    }

    let endPoint = { x: state.mousePos.x, y: state.mousePos.y };
    let isSnapped = false;

    const blockSnap = snapToConnectionPoint(endPoint, 15);
    if (blockSnap) {
        endPoint = { x: blockSnap.x, y: blockSnap.y };
        isSnapped = true;
    } else {
        const pipeSnap = snapToPipeEndpoint(endPoint, 15);
        if (pipeSnap) {
            endPoint = { x: pipeSnap.x, y: pipeSnap.y };
            isSnapped = true;
        }
    }
    
    if (!isSnapped) {
        endPoint = snapTo15DegreeAngle(state.startPoint, endPoint);
    }

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

    ctx2d.fillStyle = '#00FF00';
    ctx2d.beginPath();
    ctx2d.arc(state.startPoint.x, state.startPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx2d.fill();

    if (isSnapped) {
        ctx2d.fillStyle = '#00FF00';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1 / zoom; 
        ctx2d.beginPath();
        ctx2d.arc(endPoint.x, endPoint.y, 4 / zoom, 0, Math.PI * 2); 
        ctx2d.fill();
        ctx2d.stroke();
    }

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
 * GÜNCELLENDİ: 'SAYAC' tipi için yeni önizleme mantığı eklendi
 * OCAK/KOMBI/SERVİS KUTUSU/SAYAÇ EKLEME MODU ÖNİZLEMESİ
 */
export function drawPlumbingBlockPlacementPreview() {
    const { mousePos, currentMode, currentPlumbingBlockType } = state;

    if (currentMode !== 'drawPlumbingBlock') return;
    if (!currentPlumbingBlockType) return; 
    if (!mousePos) return;

    const { ctx2d } = dom;
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    // 'OCAK' ve 'KOMBI' (Bağlantı noktasından tutma)
    if (currentPlumbingBlockType === 'OCAK' || currentPlumbingBlockType === 'KOMBI') {
        const config = PLUMBING_BLOCK_TYPES[currentPlumbingBlockType];
        const connectionPointOffset = config.connectionPoints[0]; 

        const deviceCenterX = mousePos.x - connectionPointOffset.x;
        const deviceCenterY = mousePos.y - connectionPointOffset.y;

        const halfW = config.width / 2;
        const halfH = config.height / 2;

        ctx2d.save();
        ctx2d.translate(deviceCenterX, deviceCenterY);
        
        ctx2d.strokeStyle = '#8ab4f8';
        ctx2d.fillStyle = 'rgba(138, 180, 248, 0.2)';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.setLineDash([5 / zoom, 5 / zoom]);

        if (currentPlumbingBlockType === 'KOMBI') {
            ctx2d.beginPath();
            ctx2d.arc(0, 0, 25, 0, Math.PI * 2);
            ctx2d.stroke();
            ctx2d.fill();
        } else {
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
        ctx2d.restore();

        ctx2d.fillStyle = '#00FF00'; // Yeşil
        ctx2d.beginPath();
        ctx2d.arc(mousePos.x, mousePos.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();

        let closestPipeEnd = null;
        let minDist = Infinity;
        const SNAP_TOLERANCE = 15; 

        for (const pipe of pipes) {
            const dist1 = Math.hypot(pipe.p1.x - mousePos.x, pipe.p1.y - mousePos.y);
            if (dist1 < minDist) { minDist = dist1; closestPipeEnd = { x: pipe.p1.x, y: pipe.p1.y }; }
            const dist2 = Math.hypot(pipe.p2.x - mousePos.x, pipe.p2.y - mousePos.y);
            if (dist2 < minDist) { minDist = dist2; closestPipeEnd = { x: pipe.p2.x, y: pipe.p2.y }; }
        }

        if (closestPipeEnd && minDist < SNAP_TOLERANCE) {
            ctx2d.save();
            ctx2d.fillStyle = '#00FF00';
            ctx2d.strokeStyle = '#FFFFFF';
            ctx2d.lineWidth = 3 / zoom;
            ctx2d.beginPath();
            ctx2d.arc(closestPipeEnd.x, closestPipeEnd.y, 8 / zoom, 0, Math.PI * 2);
            ctx2d.fill();
            ctx2d.stroke();
            const dx = mousePos.x - closestPipeEnd.x;
            const dy = mousePos.y - closestPipeEnd.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 2) {
                const amplitude = 3; const frequency = 3; const segments = 30;
                ctx2d.strokeStyle = '#00FF00'; ctx2d.lineWidth = 3 / zoom; ctx2d.setLineDash([]); ctx2d.globalAlpha = 0.8;
                ctx2d.beginPath(); ctx2d.moveTo(closestPipeEnd.x, closestPipeEnd.y);
                for (let i = 1; i <= segments; i++) {
                    const t = i / segments; const baseX = closestPipeEnd.x + dx * t; const baseY = closestPipeEnd.y + dy * t;
                    const perpX = -dy / distance; const perpY = dx / distance;
                    const smoothEnvelope = t * t * (3 - 2 * t); const wave = Math.sin(smoothEnvelope * frequency * Math.PI * 2);
                    const sineOffset = smoothEnvelope * (1 - smoothEnvelope) * 4 * amplitude * wave;
                    const finalX = baseX + perpX * sineOffset; const finalY = baseY + perpY * sineOffset;
                    ctx2d.lineTo(finalX, finalY);
                }
                ctx2d.stroke(); ctx2d.globalAlpha = 1.0;
            }
            ctx2d.restore();
        }

    } else if (currentPlumbingBlockType === 'SAYAC') {
        // --- YENİ: SAYAÇ ÖNİZLEMESİ (BORU ÜZERİNDE) ---
        // Mouse boru üzerinde mi?
        const clickedPipe = getObjectAtPoint(mousePos);
        if (!clickedPipe || clickedPipe.type !== 'plumbingPipe' || clickedPipe.handle !== 'body') {
            return; // Boru üzerinde değilse önizleme yok
        }
        
        const pipe = clickedPipe.object;
        const config = PLUMBING_BLOCK_TYPES.SAYAC;
        // Bağlantı noktaları arasındaki mesafe (10cm)
        const connectionDistance = Math.abs(config.connectionPoints[0].x - config.connectionPoints[1].x); 
        const halfDist = connectionDistance / 2;

        // 2. Boru üzerindeki pozisyonu (merkezi) bul
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 0.1) return;

        const t = Math.max(0, Math.min(1,
            ((mousePos.x - pipe.p1.x) * dx + (mousePos.y - pipe.p1.y) * dy) / lengthSq
        ));
        const centerX = pipe.p1.x + t * dx;
        const centerY = pipe.p1.y + t * dy;

        // 3. Boru açısını al (vektörleri al)
        const len = Math.hypot(dx, dy);
        const dirX = dx / len; // Boru yönü
        const dirY = dy / len;
        
        // 4. Bağlantı noktalarını hesapla (merkeze göre 5cm sol/sağ)
        const cp1 = { x: centerX - dirX * halfDist, y: centerY - dirY * halfDist };
        const cp2 = { x: centerX + dirX * halfDist, y: centerY + dirY * halfDist };
        
        // 5. Bağlantı noktalarını (giriş/çıkış) çiz
        ctx2d.save();
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5 / zoom;
        
        // Giriş (Yeşil) - Sayaç konfigürasyonuna göre (x: -5)
        ctx2d.fillStyle = '#00FF00';
        ctx2d.beginPath();
        ctx2d.arc(cp1.x, cp1.y, 5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();

        // Çıkış (Kırmızı) - Sayaç konfigürasyonuna göre (x: 5)
        ctx2d.fillStyle = '#FF0000';
        ctx2d.beginPath();
        ctx2d.arc(cp2.x, cp2.y, 5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();

        ctx2d.restore();
        
    } else if (currentPlumbingBlockType === 'SERVIS_KUTUSU') {
        // --- Mevcut SERVIS KUTUSU mantığı ---
        const config = PLUMBING_BLOCK_TYPES[currentPlumbingBlockType];
        if (!config) return;

        const deviceCenterX = mousePos.x;
        const deviceCenterY = mousePos.y;
        const rotation = (mousePos.snapAngle || 0); 

        const halfW = config.width / 2;
        const halfH = config.height / 2;

        ctx2d.save();
        ctx2d.translate(deviceCenterX, deviceCenterY);
        ctx2d.rotate(rotation * Math.PI / 180); 

        ctx2d.strokeStyle = '#8ab4f8'; 
        ctx2d.fillStyle = 'rgba(138, 180, 248, 0.2)';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.setLineDash([5 / zoom, 5 / zoom]);

        const cornerRadius = 1;
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
        ctx2d.fill();
        ctx2d.stroke();
        
        ctx2d.setLineDash([]);
        ctx2d.restore();

        if (mousePos.isSnapped && (mousePos.snapType === 'PLUMBING_WALL_SURFACE' || mousePos.snapType === 'PLUMBING_BLOCK_EDGE')) {
            ctx2d.fillStyle = '#00FF00';
            ctx2d.beginPath();
            ctx2d.arc(mousePos.x, mousePos.y, 4 / zoom, 0, Math.PI * 2);
            ctx2d.fill();
        }
    }
}