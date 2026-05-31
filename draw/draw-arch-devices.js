// draw/draw-arch-devices.js
// Mahal içi mimari cihazların (alarm cihazları + yangın tüpü) 2D çizimi.

import { state, dom, getAdjustedColor, getWallFillColor } from '../general-files/main.js';
import {
    ARCH_DEVICE_KINDS,
    ARCH_DEVICE_LABELS,
    ARCH_DEVICE_NAMES,
    getArchDeviceSize,
    isArchDeviceInsideRoom,
} from '../architectural-objects/arch-devices.js';

const SELECTED_COLOR = '#8ab4f8';
const OUTSIDE_WARN_COLOR = '#e74c3c';

export function drawArchDevice(device, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor, lineThickness } = state;

    const inside = isArchDeviceInsideRoom(device);
    const baseStroke = getAdjustedColor(wallBorderColor, 'column');
    const baseFill = getAdjustedColor(getWallFillColor(), 'column');

    const strokeColor = isSelected
        ? SELECTED_COLOR
        : (inside ? baseStroke : OUTSIDE_WARN_COLOR);
    const fillColor = inside ? baseFill : '#f7d4d0';

    const { width, height } = getArchDeviceSize(device);
    const rot = (device.rotation || 0) * Math.PI / 180;

    ctx2d.save();
    ctx2d.translate(device.center.x, device.center.y);
    ctx2d.rotate(rot);

    ctx2d.fillStyle = fillColor;
    ctx2d.strokeStyle = strokeColor;
    ctx2d.lineWidth = lineThickness / zoom;

    if (device.kind === ARCH_DEVICE_KINDS.FIRE_EXT) {
        drawFireExtinguisherSilhouette(ctx2d, width, height, strokeColor, fillColor, zoom, lineThickness);
    } else {
        drawAlarmDeviceShape(ctx2d, device, width, height, zoom, strokeColor);
    }

    ctx2d.restore();

    // Dış etiket — cihaz döndürülse de yatay (sabit yön) kalır.
    // Konum: dünya koordinatlarında cihaz merkezinin altında (rotasyondan bağımsız).
    drawDeviceNameLabel(ctx2d, device, width, height, zoom, strokeColor);
}

// Tavan tipi alarm sensörü silüeti: üstte gövde + altta ızgara + 2 duman dalgası
function drawAlarmDeviceShape(ctx, device, width, height, zoom, strokeColor) {
    const halfW = width / 2;
    const halfH = height / 2;

    // Bölümler — 25×20 kutuya yerleşir
    const bodyH = height * 0.68;   // üst gövde yüksekliği (yazıya yer açar)
    const grilleH = height * 0.32; // ızgara daha kısa

    const bodyTop = -halfH;
    const bodyBottom = bodyTop + bodyH;
    const grilleTop = bodyBottom;
    const grilleBottom = grilleTop + grilleH;

    // Üst gövde — yuvarlatılmış dikdörtgen
    const r = Math.min(width, bodyH) * 0.20;
    ctx.beginPath();
    roundedRectPath(ctx, -halfW, bodyTop, width, bodyH, r);
    ctx.fill();
    ctx.stroke();

    // Izgara — gövdeden biraz içe çekilmiş, dar trapez
    const inset = width * 0.10;             // gövde kenarından içe
    const topWidth = width - 2 * inset;
    const bottomWidth = topWidth * 0.62;    // alt taban belirgin dar
    const xTL = -topWidth / 2;
    const xTR =  topWidth / 2;
    const xBL = -bottomWidth / 2;
    const xBR =  bottomWidth / 2;

    ctx.beginPath();
    ctx.moveTo(xTL, grilleTop);
    ctx.lineTo(xTR, grilleTop);
    ctx.lineTo(xBR, grilleBottom);
    ctx.lineTo(xBL, grilleBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Izgara dikey çubukları (trapez kenarlarına paralel)
    const barCount = 5;
    const yTopBar = grilleTop + grilleH * 0.10;
    const yBotBar = grilleBottom - grilleH * 0.05;
    for (let i = 1; i <= barCount; i++) {
        const t = i / (barCount + 1);
        const xTop = xTL + (xTR - xTL) * t;
        const xBot = xBL + (xBR - xBL) * t;
        ctx.beginPath();
        ctx.moveTo(xTop, yTopBar);
        ctx.lineTo(xBot, yBotBar);
        ctx.stroke();
    }

    // İç kısa kod (GAC / CO / DAC) — gövdenin ortasında
    const label = ARCH_DEVICE_LABELS[device.kind] || '';
    if (label) {
        const fontSize = bodyH * 0.75;
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = strokeColor;
        ctx.fillText(label, 0, bodyTop + bodyH / 2);
    }
}

// Yandan görünüm silüeti: gövde + boyun + sap + horn
// (referans görsele uygun: tüp şeklinde gövde, sol üstte pin halkası, sağ üstte horn)
function drawFireExtinguisherSilhouette(ctx, width, height, strokeColor, fillColor, zoom, lineThickness) {
    const halfW = width / 2;
    const halfH = height / 2;

    // Gövdeyi sığdırmak için bir miktar sol tarafa yasla, horn sağa uzansın
    const bodyW = width * 0.42;
    const bodyH = height * 0.78;
    const bodyCx = -width * 0.10;
    const bodyTop = -halfH + height * 0.20;
    const bodyBottom = bodyTop + bodyH;
    const bodyLeft = bodyCx - bodyW / 2;
    const bodyRight = bodyCx + bodyW / 2;
    const bodyR = bodyW * 0.35;

    // Boyun (gövdeden üste doğru kısa parça)
    const neckW = bodyW * 0.55;
    const neckH = height * 0.10;
    const neckTop = bodyTop - neckH;
    ctx.beginPath();
    roundedRectPath(ctx, bodyCx - neckW / 2, neckTop, neckW, neckH, neckH * 0.25);
    ctx.fill();
    ctx.stroke();

    // Gövde (yuvarlatılmış dikdörtgen)
    ctx.beginPath();
    roundedRectPath(ctx, bodyLeft, bodyTop, bodyW, bodyH, bodyR);
    ctx.fill();
    ctx.stroke();

    // Sap halkası (boynun solunda küçük halka)
    const ringR = height * 0.08;
    const ringCx = bodyCx - neckW / 2 - ringR * 0.6;
    const ringCy = neckTop + neckH * 0.45;
    ctx.beginPath();
    ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
    ctx.lineWidth = (lineThickness / zoom) * 1.2;
    ctx.stroke();
    ctx.lineWidth = lineThickness / zoom;

    // Horn (boynun sağ üst köşesinden çıkan koni — küçük sap + üçgen ağız)
    const hornBaseX = bodyCx + neckW / 2;
    const hornBaseY = neckTop + neckH * 0.5;
    const hornTipX = halfW - width * 0.02;
    const hornTopY = neckTop - height * 0.04;
    const hornBotY = neckTop + neckH * 0.85;
    ctx.beginPath();
    ctx.moveTo(hornBaseX, hornBaseY - neckH * 0.15);
    ctx.lineTo(hornTipX, hornTopY);
    ctx.lineTo(hornTipX, hornBotY);
    ctx.lineTo(hornBaseX, hornBaseY + neckH * 0.15);
    ctx.closePath();
    ctx.fillStyle = strokeColor;
    ctx.fill();
    ctx.stroke();

    // Gövdede yatay bant (etiket çizgisi) — silüeti daha okunaklı yapar
    ctx.beginPath();
    ctx.moveTo(bodyLeft + bodyR * 0.3, bodyTop + bodyH * 0.45);
    ctx.lineTo(bodyRight - bodyR * 0.3, bodyTop + bodyH * 0.45);
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
}

function drawDeviceNameLabel(ctx, device, width, height, zoom, color) {
    const name = ARCH_DEVICE_NAMES[device.kind] || '';
    if (!name) return;
    // Cihaz döndürülse bile etiket yatay kalır — dünya koordinatlarında çiz.
    // Konum: cihaz merkezinin altında, döndürme sırasında köşelerle çakışmaması için
    // bounding-circle yarıçapı (köşegen / 2) kadar mesafe.
    const radius = Math.hypot(width, height) / 2;
    const margin = 4;
    const fontSize = Math.max(7, 9 / Math.max(zoom, 0.4));
    ctx.save();
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(name, device.center.x, device.center.y + radius + margin);
    ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    roundedRectPath(ctx, x, y, w, h, r);
}

function roundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}
