// draw/draw-dxf.js
// DXF arka plan referansını 2D canvas üzerine çizer.
//
// Çağrıldığı yer: draw2D() içinde, grid'den hemen sonra (her şey altta).
// Önemli: ctx zaten dpr*zoom*pan transform'u uygulanmış durumda; sahne
// koordinatlarında (cm cinsinden, Y-down) çiziyoruz.

import { state } from '../general-files/main.js';
import { dxfToScene } from '../general-files/dxf-io.js';
import { isLightMode } from '../general-files/main.js';

export function drawDxfOverlay(ctx, zoom) {
    const dxf = state.dxfImport;
    if (!dxf) return;
    if (state.tempVisibility?.showDxf === false) return;
    if (!dxf.entities || dxf.entities.length === 0) return;

    const calib = { scale: dxf.scale, offset: dxf.offset };
    const visibleLayers = new Set(dxf.layers.filter(l => l.visible).map(l => l.name));

    ctx.save();

    // Rotation — bbox merkezi etrafında. dxfToScene'i değiştirmek yerine ctx
    // transform ile (tek seferlik). Entity çizimi eski formülü kullanır.
    const rotation = dxf.rotation || 0;
    if (rotation !== 0 && dxf.bbox) {
        const cx = (dxf.bbox.minX + dxf.bbox.maxX) / 2;
        const cy = (dxf.bbox.minY + dxf.bbox.maxY) / 2;
        const centerX = cx * dxf.scale + dxf.offset.x;
        const centerY = -cy * dxf.scale + dxf.offset.y;
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation);
        ctx.translate(-centerX, -centerY);
    }

    // Koyu temada DXF çok siliklenir, aydınlık temada biraz daha belirgin
    const light = isLightMode();
    ctx.globalAlpha = light ? 0.5 : 0.22;
    ctx.lineWidth = 1 / zoom;

    if (!light) {
        // Tek mat gri — tüm DXF tek renkte, koyu zemine karışmasın diye orta gri.
        ctx.strokeStyle = '#7a8390';
        for (const e of dxf.entities) {
            if (!visibleLayers.has(e.layer)) continue;
            drawEntity(ctx, e, calib, zoom);
        }
    } else {
        let currentColor = null;
        for (const e of dxf.entities) {
            if (!visibleLayers.has(e.layer)) continue;
            const color = e.color || '#666';
            if (color !== currentColor) {
                ctx.strokeStyle = color;
                currentColor = color;
            }
            drawEntity(ctx, e, calib, zoom);
        }
    }

    ctx.restore();
}

function drawEntity(ctx, e, calib, zoom) {
    switch (e.type) {
        case 'LINE': {
            const a = dxfToScene(e.x1, e.y1, calib);
            const b = dxfToScene(e.x2, e.y2, calib);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            break;
        }
        case 'POLYLINE': {
            const verts = e.vertices;
            if (verts.length < 2) break;
            ctx.beginPath();
            const first = dxfToScene(verts[0].x, verts[0].y, calib);
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < verts.length; i++) {
                const p = dxfToScene(verts[i].x, verts[i].y, calib);
                ctx.lineTo(p.x, p.y);
            }
            if (e.closed) ctx.closePath();
            ctx.stroke();
            break;
        }
        case 'CIRCLE': {
            const c = dxfToScene(e.cx, e.cy, calib);
            const r = e.r * calib.scale;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'ARC': {
            const c = dxfToScene(e.cx, e.cy, calib);
            const r = e.r * calib.scale;
            // DXF arc CCW Y-up → ekranda Y-flip sonrası CW; açıları negatifle ve yön=true.
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, -e.a2, -e.a1, false);
            ctx.stroke();
            break;
        }
        // TEXT — DXF'ten parse edilmiyor, burada da gerek yok.
    }
}
