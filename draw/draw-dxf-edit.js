// draw/draw-dxf-edit.js
// DXF düzenleme modunda bbox + handle render'ı + hit testleri.
// Rotation-aware: bbox merkezi etrafında dönüşü destekler.

import { state } from '../general-files/main.js';

const HANDLE_PX = 10;     // görsel handle çapı (ekran px)
const HIT_TOL_PX = 36;    // tıklama yakalama toleransı

/**
 * BBox merkezinin sahnedeki konumu + rotation döndürür.
 * Diğer fonksiyonlar bu pivot'u kullanır.
 */
function getDxfPivot() {
    const dxf = state.dxfImport;
    if (!dxf || !dxf.bbox) return null;
    const bb = dxf.bbox;
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    return {
        x: cx * dxf.scale + dxf.offset.x,
        y: -cy * dxf.scale + dxf.offset.y,
        rotation: dxf.rotation || 0,
    };
}

/**
 * Sahnede ROTATION'SIZ bbox (eski formül). Edit overlay ve hit test bunu
 * kullanır, görsel için ctx rotate uygulanır.
 */
export function getDxfSceneBBox() {
    const dxf = state.dxfImport;
    if (!dxf || !dxf.bbox) return null;
    const bb = dxf.bbox;
    const s = dxf.scale;
    const o = dxf.offset;
    const x1 = bb.minX * s + o.x;
    const x2 = bb.maxX * s + o.x;
    const y1 = -bb.maxY * s + o.y;
    const y2 = -bb.minY * s + o.y;
    return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
             minY: Math.min(y1, y2), maxY: Math.max(y1, y2) };
}

export function drawDxfEditOverlay(ctx, zoom) {
    if (!state.dxfEditMode) return;
    const sbb = getDxfSceneBBox();
    const pivot = getDxfPivot();
    if (!sbb || !pivot) return;

    const handleSize = HANDLE_PX / zoom;
    const lineW = 2 / zoom;
    // Mod tespiti:
    //   rot-*  → DÖNDÜR (yeşil)
    //   nw/ne/sw/se → YENİDEN BOYUTLANDIR (mavi)
    //   body / yok → varsayılan (turuncu)
    const activeHandle = (state.dxfEditDrag && state.dxfEditDrag.handle) || state.dxfHoveredHandle;
    let accent = '#fb923c'; // turuncu — varsayılan / body
    if (activeHandle) {
        if (activeHandle.startsWith('rot-')) accent = '#22c55e';        // yeşil — döndür
        else if (activeHandle !== 'body')    accent = '#2563eb';        // mavi — yeniden boyutlandır
    }

    ctx.save();
    // Rotation transform — sahne pivot etrafında
    if (pivot.rotation !== 0) {
        ctx.translate(pivot.x, pivot.y);
        ctx.rotate(pivot.rotation);
        ctx.translate(-pivot.x, -pivot.y);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = lineW;
    ctx.setLineDash([8 / zoom, 6 / zoom]);
    ctx.strokeRect(sbb.minX, sbb.minY, sbb.maxX - sbb.minX, sbb.maxY - sbb.minY);
    ctx.setLineDash([]);

    // 4 köşe — dolu daire
    const corners = [
        { x: sbb.minX, y: sbb.minY },
        { x: sbb.maxX, y: sbb.minY },
        { x: sbb.minX, y: sbb.maxY },
        { x: sbb.maxX, y: sbb.maxY },
    ];
    const r = handleSize / 2;
    ctx.fillStyle = accent;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 / zoom;
    for (const c of corners) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

/**
 * Sahne (rotation'lı) cursor → DXF'in lokal frame'ine geri çevir, hit testi yap.
 * Köşeye yakın + cursor bbox MERKEZE doğru → 'rot-*' (DÖNDÜR)
 * Köşeye yakın + cursor MERKEZDEN UZAĞA → 'nw' / 'ne' / ... (BOYUTLANDIR)
 * Body içi → 'body'
 */
export function hitTestDxfEdit(sceneX, sceneY, zoom) {
    if (!state.dxfEditMode) return null;
    const sbb = getDxfSceneBBox();
    const pivot = getDxfPivot();
    if (!sbb || !pivot) return null;

    // Rotation'lı cursor'u ROTATION'SIZ frame'e geri al (ters rotation)
    let fakeX = sceneX, fakeY = sceneY;
    if (pivot.rotation !== 0) {
        const lx = sceneX - pivot.x;
        const ly = sceneY - pivot.y;
        const cosR = Math.cos(-pivot.rotation);
        const sinR = Math.sin(-pivot.rotation);
        fakeX = pivot.x + lx * cosR - ly * sinR;
        fakeY = pivot.y + lx * sinR + ly * cosR;
    }

    const tol = HIT_TOL_PX / zoom;
    const bbCenterX = (sbb.minX + sbb.maxX) / 2;
    const bbCenterY = (sbb.minY + sbb.maxY) / 2;

    const corners = [
        { id: 'nw', x: sbb.minX, y: sbb.minY },
        { id: 'ne', x: sbb.maxX, y: sbb.minY },
        { id: 'sw', x: sbb.minX, y: sbb.maxY },
        { id: 'se', x: sbb.maxX, y: sbb.maxY },
    ];
    for (const c of corners) {
        if (Math.abs(fakeX - c.x) <= tol && Math.abs(fakeY - c.y) <= tol) {
            // Cursor merkeze doğru mu? Köşeden merkeze vektör vs. cursor-köşe vektör
            const cornerToCenterX = bbCenterX - c.x;
            const cornerToCenterY = bbCenterY - c.y;
            const cursorFromCornerX = fakeX - c.x;
            const cursorFromCornerY = fakeY - c.y;
            const dot = cursorFromCornerX * cornerToCenterX + cursorFromCornerY * cornerToCenterY;
            // dot > 0 → cursor köşenin İÇERİDE kalan tarafında → döndür
            return dot > 0 ? ('rot-' + c.id) : c.id;
        }
    }
    if (fakeX >= sbb.minX && fakeX <= sbb.maxX &&
        fakeY >= sbb.minY && fakeY <= sbb.maxY) return 'body';
    return null;
}
