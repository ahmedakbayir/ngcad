// text-annotation.js
// Projeye yerleştirilen serbest metin notları (taşınabilir, S/M/L formatlı)

import { state, isLightMode } from '../general-files/main.js';

export const TEXT_ANNOTATION_SIZES = {
    small: { label: 'Küçük', fontSize: 10 },
    medium: { label: 'Orta', fontSize: 16 },
    large: { label: 'Büyük', fontSize: 24 }
};

function uniqueId() {
    return `text_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function createTextAnnotation(x, y, text, size = 'medium') {
    return {
        type: 'textAnnotation',
        id: uniqueId(),
        x: x,
        y: y,
        text: text || '',
        size: TEXT_ANNOTATION_SIZES[size] ? size : 'medium',
        floorId: state.currentFloor?.id
    };
}

function getFontSize(t) {
    return TEXT_ANNOTATION_SIZES[t?.size]?.fontSize ?? TEXT_ANNOTATION_SIZES.medium.fontSize;
}

function measureText(ctx2d, lines, fontSize) {
    ctx2d.save();
    ctx2d.font = `500 ${fontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    let maxW = 0;
    lines.forEach(l => {
        const w = ctx2d.measureText(l).width;
        if (w > maxW) maxW = w;
    });
    ctx2d.restore();
    const lineGap = fontSize * 1.2;
    return { width: maxW, height: lines.length * lineGap, lineGap };
}

export function getTextAnnotationBounds(ctx2d, t) {
    if (!t || !t.text) return null;
    const fontSize = getFontSize(t);
    const lines = t.text.split('\n');
    const { width, height } = measureText(ctx2d, lines, fontSize);
    const padX = fontSize * 0.4;
    const padY = fontSize * 0.2;
    return {
        x1: t.x - width / 2 - padX,
        y1: t.y - height / 2 - padY,
        x2: t.x + width / 2 + padX,
        y2: t.y + height / 2 + padY,
        width: width + padX * 2,
        height: height + padY * 2
    };
}

export function getTextAnnotationAtPoint(pos, ctx2d) {
    const currentFloorId = state.currentFloor?.id;
    const texts = (state.textAnnotations || []).filter(t =>
        !currentFloorId || !t.floorId || t.floorId === currentFloorId
    );
    for (const t of [...texts].reverse()) {
        const b = getTextAnnotationBounds(ctx2d, t);
        if (!b) continue;
        if (pos.x >= b.x1 && pos.x <= b.x2 && pos.y >= b.y1 && pos.y <= b.y2) {
            return { type: 'textAnnotation', object: t, handle: 'body' };
        }
    }
    return null;
}

export function drawTextAnnotationGhost(ctx2d) {
    const ghost = state.textPlacementGhost;
    if (!ghost) return;
    // pending text bilgisini lazily import et (döngüsel import'tan kaçınmak için global state üzerinden)
    const pending = state._textPlacementPending;
    if (!pending) return;
    const fontSize = TEXT_ANNOTATION_SIZES[pending.size]?.fontSize ?? TEXT_ANNOTATION_SIZES.medium.fontSize;
    const lines = (pending.text || '').split('\n');
    if (!lines.length) return;
    ctx2d.save();
    ctx2d.globalAlpha = 0.55;
    ctx2d.fillStyle = '#8ab4f8';
    ctx2d.font = `500 ${fontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    const lineGap = fontSize * 1.2;
    const totalH = (lines.length - 1) * lineGap;
    lines.forEach((line, i) => {
        const y = ghost.y - totalH / 2 + i * lineGap;
        ctx2d.fillText(line, ghost.x, y);
    });
    ctx2d.restore();
}

export function drawTextAnnotations(ctx2d) {
    const { zoom, selectedObject, selectedGroup } = state;
    const currentFloorId = state.currentFloor?.id;
    const texts = (state.textAnnotations || []).filter(t =>
        !currentFloorId || !t.floorId || t.floorId === currentFloorId
    );
    if (!texts.length) return;

    const baseColor = isLightMode() ? '#2c3338' : '#dfe6ec';
    const selColor = '#8ab4f8';

    texts.forEach(t => {
        if (!t.text) return;
        const fontSize = getFontSize(t);
        const lines = t.text.split('\n');
        const isSelected = (selectedObject?.type === 'textAnnotation' && selectedObject.object === t) ||
            selectedGroup.some(it => it.type === 'textAnnotation' && it.object === t);

        const m = measureText(ctx2d, lines, fontSize);
        const padX = fontSize * 0.4;
        const padY = fontSize * 0.2;

        // Seçili veya hover ise yumuşak arka plan
        if (isSelected) {
            ctx2d.fillStyle = 'rgba(138, 180, 248, 0.12)';
            ctx2d.strokeStyle = selColor;
            ctx2d.lineWidth = 1 / zoom;
            ctx2d.beginPath();
            ctx2d.rect(t.x - m.width / 2 - padX, t.y - m.height / 2 - padY, m.width + padX * 2, m.height + padY * 2);
            ctx2d.fill();
            ctx2d.stroke();
        }

        ctx2d.fillStyle = isSelected ? selColor : baseColor;
        ctx2d.font = `500 ${fontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        const totalH = (lines.length - 1) * m.lineGap;
        lines.forEach((line, i) => {
            const y = t.y - totalH / 2 + i * m.lineGap;
            ctx2d.fillText(line, t.x, y);
        });
    });
}
