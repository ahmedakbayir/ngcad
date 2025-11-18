// draw/draw-plumbing.js
// ✅ DÜZELTME: Tüm borular sürekli çizgi (isConnectedToValve kontrolü kaldırıldı)

import { state, dom, BG} from '../general-files/main.js';
import { PLUMBING_BLOCK_TYPES, getPlumbingBlockCorners, getConnectionPoints, getActiveConnectionPoints } from './plumbing-blocks.js';
import { PLUMBING_PIPE_TYPES, snapToConnectionPoint, snapToPipeEndpoint, isSpaceForValve } from './plumbing-pipes.js';
import { getObjectAtPoint } from '../general-files/actions.js';
import { distToSegmentSquared } from '../draw/geometry.js';
import { snapTo15DegreeAngle } from '../draw/geometry.js';

/**
 * TESİSAT BLOKLARI 2D RENDERING
 */

/**
 * Sinüs dalgalı bağlantı çizgisi çizer (Ocak/Kombi için)
 */
function drawWavyConnectionLine(connectionPoint, zoom) {
    const { ctx2d } = dom;
    const currentFloorId = state.currentFloor?.id;
    const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId);

    let closestPipeEnd = null;
    let pipeDirection = null;
    let minDist = Infinity;
    const DIRECT_CONNECTION_TOLERANCE = 2;

    for (const pipe of pipes) {
        const dist1 = Math.hypot(pipe.p1.x - connectionPoint.x, pipe.p1.y - connectionPoint.y);
        if (dist1 < minDist) {
            minDist = dist1;
            closestPipeEnd = { x: pipe.p1.x, y: pipe.p1.y };
            const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
            if (pipeLength > 0) {
                pipeDirection = {
                    x: (pipe.p2.x - pipe.p1.x) / pipeLength,
                    y: (pipe.p2.y - pipe.p1.y) / pipeLength
                };
            }
        }

        const dist2 = Math.hypot(pipe.p2.x - connectionPoint.x, pipe.p2.y - connectionPoint.y);
        if (dist2 < minDist) {
            minDist = dist2;
            closestPipeEnd = { x: pipe.p2.x, y: pipe.p2.y };
            const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
             if (pipeLength > 0) {
                pipeDirection = {
                    x: (pipe.p1.x - pipe.p2.x) / pipeLength,
                    y: (pipe.p1.y - pipe.p2.y) / pipeLength
                };
             }
        }
    }

    if (closestPipeEnd && pipeDirection && minDist > DIRECT_CONNECTION_TOLERANCE) {
        const dx = closestPipeEnd.x - connectionPoint.x;
        const dy = closestPipeEnd.y - connectionPoint.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 0.1) return;

        const amplitude = 3;
        const frequency = 3;
        const segments = 50;

        ctx2d.save();
        ctx2d.strokeStyle = '#2196F3';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.lineCap = 'round';

        ctx2d.beginPath();
        ctx2d.moveTo(connectionPoint.x, connectionPoint.y);

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;

            const baseX = connectionPoint.x + dx * t;
            const baseY = connectionPoint.y + dy * t;

            const perpX = -dy / distance;
            const perpY = dx / distance;

            const smoothEnvelope = t * t * (3 - 2 * t);

            const wave = Math.sin(smoothEnvelope * frequency * Math.PI * 2);

            const sineOffset = smoothEnvelope * (1 - smoothEnvelope) * 4 * amplitude * wave;

            const finalX = baseX + perpX * sineOffset;
            const finalY = baseY + perpY * sineOffset;

            ctx2d.lineTo(finalX, finalY);
        }

        ctx2d.stroke();
        ctx2d.restore();
    }
}

/**
 * Servis Kutusu çizer
 */
function drawServisKutusu(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.SERVIS_KUTUSU;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

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
    ctx2d.fill();
    ctx2d.stroke();

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
 * Sayaç çizer
 */
function drawSayac(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.SAYAC;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    const halfW = config.width / 2;
    const halfH = config.height / 2;
    const cornerRadius = 0.5;

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
    ctx2d.fill();
    ctx2d.stroke();

    const protrusionDepth = 1;
    const protrusionWidth = config.width - 3;
    const halfProtW = protrusionWidth / 2;
    const protRadius = 0.5;

    const y1 = halfH;
    const y2 = halfH + protrusionDepth;
    const x1 = -halfProtW;
    const x2 = halfProtW;

    ctx2d.beginPath();
    ctx2d.moveTo(x1, y1);
    ctx2d.lineTo(x1, y2 - protRadius);
    ctx2d.arcTo(x1, y2, x1 + protRadius, y2, protRadius);
    ctx2d.lineTo(x2 - protRadius, y2);
    ctx2d.arcTo(x2, y2, x2, y2 - protRadius, protRadius);
    ctx2d.lineTo(x2, y1);
    ctx2d.stroke(); 

    const lineLength = config.connectionLineLength || 10;
    const inletCP_X = config.connectionPoints[0].x;
    const outletCP_X = config.connectionPoints[1].x;
    const armStartY = config.connectionPoints[0].y + lineLength;
    const armEndY = config.connectionPoints[0].y;

    ctx2d.strokeStyle = wallBorderColor; 
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom; 

    ctx2d.beginPath();
    ctx2d.moveTo(inletCP_X, armStartY);
    ctx2d.lineTo(inletCP_X, armEndY);
    ctx2d.stroke();

    ctx2d.beginPath();
    ctx2d.moveTo(outletCP_X, armStartY);
    ctx2d.lineTo(outletCP_X, armEndY);
    ctx2d.stroke();

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
 * Kombi çizer
 */
function drawKombi(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.KOMBI;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    const outerRadius = 25;
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx2d.fillStyle = isSelected ? 'rgba(138, 180, 248, 0.1)' : 'rgba(30, 31, 32, 0.8)';

    ctx2d.beginPath();
    ctx2d.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx2d.fill(); 
    ctx2d.stroke();

    const innerRadius = 18;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx2d.stroke();

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
 * Ocak çizer
 */
function drawOcak(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    const config = PLUMBING_BLOCK_TYPES.OCAK;

    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate(block.rotation * Math.PI / 180);

    const boxSize = 25;
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

    const burnerRadius = 7;
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
 * Tesisat bloğu çizer
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
 * Tüm tesisat bloklarını çizer (VANA HARİÇ)
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
 * Vana 2D çizim fonksiyonu
 */
function drawVana(block, isSelected) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor } = state;
    
    ctx2d.save();
    ctx2d.translate(block.center.x, block.center.y);
    ctx2d.rotate((block.rotation || 0) * Math.PI / 180);

    const config = PLUMBING_BLOCK_TYPES.VANA;
    const halfLength = config.width / 2;
    const largeRadius = config.height / 2;
    const smallRadius = 0.5;

    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : 'rgba(255, 255, 255, 1)';
    ctx2d.lineWidth = (isSelected ? 3 : 4) / zoom;
    ctx2d.fillStyle = 'rgba(255,255,255, 1)';

    ctx2d.beginPath();
    ctx2d.moveTo(-halfLength, -largeRadius);
    ctx2d.lineTo(0, -smallRadius);
    ctx2d.lineTo(halfLength, -largeRadius);
    ctx2d.lineTo(halfLength, largeRadius);
    ctx2d.lineTo(0, smallRadius);
    ctx2d.lineTo(-halfLength, largeRadius);
    ctx2d.closePath();
    
    ctx2d.stroke();
    ctx2d.fillStyle = BG;

    ctx2d.fill();
    

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

    const connections = getConnectionPoints(block);

    for (let i = 0; i < connections.length; i++) {
        const cp = connections[i];
        ctx2d.fillStyle = i === 0 ? '#00FF00' : '#FF0000';
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5 / zoom;
        ctx2d.beginPath();
        ctx2d.arc(cp.x, cp.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
    }

    const rotationHandleDistance = 30;
    const angle = (block.rotation || 0) * Math.PI / 180;
    const handleX = block.center.x + Math.sin(angle) * rotationHandleDistance;
    const handleY = block.center.y - Math.cos(angle) * rotationHandleDistance;

    ctx2d.strokeStyle = '#8ab4f8';
    ctx2d.lineWidth = 2 / zoom;
    ctx2d.setLineDash([5 / zoom, 5 / zoom]);
    ctx2d.beginPath();
    ctx2d.moveTo(block.center.x, block.center.y);
    ctx2d.lineTo(handleX, handleY);
    ctx2d.stroke();
    ctx2d.setLineDash([]);

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
 * ✅ DÜZELTME: isConnectedToValve kontrolü kaldırıldı - TÜM BORULAR SÜREKLİ ÇİZGİ
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

    // ✅ DÜZELTME: Kesikli çizgi mantığı kaldırıldı - her zaman sürekli çizgi
    // if (!pipe.isConnectedToValve) {
    //     ctx2d.setLineDash([15 / zoom, 10 / zoom]); 
    // }

    ctx2d.beginPath();
    ctx2d.moveTo(pipe.p1.x, pipe.p1.y);
    ctx2d.lineTo(pipe.p2.x, pipe.p2.y);
    ctx2d.stroke();
    ctx2d.setLineDash([]); // Her zaman reset (artık gerek yok ama güvenlik için)
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
 * BLOK EKLEME MODU ÖNİZLEMESİ
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

        ctx2d.fillStyle = '#00FF00';
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
        const clickedPipe = getObjectAtPoint(mousePos);
        if (!clickedPipe || clickedPipe.type !== 'plumbingPipe' || clickedPipe.handle !== 'body') {
            return;
        }
        
        const pipe = clickedPipe.object;
        const config = PLUMBING_BLOCK_TYPES.SAYAC;
        const connectionDistance = Math.abs(config.connectionPoints[0].x - config.connectionPoints[1].x); 
        const halfDist = connectionDistance / 2;

        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 0.1) return;

        const t = Math.max(0, Math.min(1,
            ((mousePos.x - pipe.p1.x) * dx + (mousePos.y - pipe.p1.y) * dy) / lengthSq
        ));
        const centerX = pipe.p1.x + t * dx;
        const centerY = pipe.p1.y + t * dy;

        const len = Math.hypot(dx, dy);
        const dirX = dx / len;
        const dirY = dy / len;
        
        const cp1 = { x: centerX - dirX * halfDist, y: centerY - dirY * halfDist };
        const cp2 = { x: centerX + dirX * halfDist, y: centerY + dirY * halfDist };
        
        ctx2d.save();
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 1.5 / zoom;
        
        ctx2d.fillStyle = '#00FF00';
        ctx2d.beginPath();
        ctx2d.arc(cp1.x, cp1.y, 5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();

        ctx2d.fillStyle = '#FF0000';
        ctx2d.beginPath();
        ctx2d.arc(cp2.x, cp2.y, 5 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();

        ctx2d.restore();
        
    } else if (currentPlumbingBlockType === 'SERVIS_KUTUSU') {
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

/**
 * ✅ TESİSAT SNAP YAKALAMA İŞARETİ
 * Boru çizimi ve servis kutusu yaklaştığında snap noktalarını gösterir
 */
export function drawPlumbingSnapIndicator() {
    const { mousePos, currentMode, zoom } = state;
    const { ctx2d } = dom;

    if (!mousePos || !mousePos.isSnapped) return;

    // Sadece plumbing modlarında göster
    const isPlumbingMode = currentMode === 'drawPlumbingPipe' ||
                           currentMode === 'drawPlumbingBlock' ||
                           (state.isDragging && state.selectedObject?.type === 'plumbingBlock');

    if (!isPlumbingMode) return;

    const snapType = mousePos.snapType;

    // Snap tiplerine göre farklı renkler ve stiller
    let indicatorColor = '#00FF00'; // Varsayılan yeşil
    let indicatorSize = 6 / zoom;
    let showCross = false;

    // if (snapType === 'PLUMBING_INTERSECTION' || snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION') {
    //     // Kesişimler için daha büyük ve sarı indicator
    //     indicatorColor = '#FFD700'; // Altın sarısı
    //     indicatorSize = 8 / zoom;
    //     showCross = true;
    // } else 
        if (snapType === 'PLUMBING_BLOCK_CENTER') {
        // Merkez için mavi indicator
        indicatorColor = '#2196F3';
        indicatorSize = 7 / zoom;
        showCross = true;
    } else if (snapType === 'PLUMBING_BLOCK_EDGE') {
        // Kenar için yeşil indicator
        indicatorColor = '#00FF00';
        indicatorSize = 6 / zoom;
    } else if (snapType === 'PLUMBING_CONNECTION') {
        // Bağlantı noktaları için kırmızı indicator
        indicatorColor = '#FF4444';
        indicatorSize = 6 / zoom;
    } else if (snapType === 'PLUMBING_PIPE_END') {
        // Boru ucu için mavi indicator
        indicatorColor = '#4444FF';
        indicatorSize = 6 / zoom;
    } else if (snapType === 'PLUMBING_WALL_SURFACE') {
        // Duvar yüzeyi için açık yeşil indicator
        indicatorColor = '#88FF88';
        indicatorSize = 5 / zoom;
    }

    ctx2d.save();

    // Dış çember (beyaz kenarlık)
    ctx2d.strokeStyle = '#FFFFFF';
    ctx2d.lineWidth = 2 / zoom;
    ctx2d.fillStyle = indicatorColor;
    ctx2d.beginPath();
    ctx2d.arc(mousePos.x, mousePos.y, indicatorSize, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();

    // Kesişimler ve merkez için artı işareti
    if (showCross) {
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 2 / zoom;
        const crossSize = indicatorSize * 1.5;

        // Yatay çizgi
        ctx2d.beginPath();
        ctx2d.moveTo(mousePos.x - crossSize, mousePos.y);
        ctx2d.lineTo(mousePos.x + crossSize, mousePos.y);
        ctx2d.stroke();

        // Dikey çizgi
        ctx2d.beginPath();
        ctx2d.moveTo(mousePos.x, mousePos.y - crossSize);
        ctx2d.lineTo(mousePos.x, mousePos.y + crossSize);
        ctx2d.stroke();
    }

    ctx2d.restore();
}