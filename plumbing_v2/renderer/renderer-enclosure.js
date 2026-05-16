// plumbing_v2/renderer/renderer-enclosure.js
// Muhafaza kutusu çizimi — muhafaza:true olan bileşenlerin çevresine kesikli dikdörtgen

import { CIHAZ_TIPLERI } from '../objects/device.js';
import { SAYAC_CONFIG }  from '../objects/meter.js';
import { state, isLightMode } from '../../general-files/main.js';

const PAD = 8; // world units — nesne kenarından iç boşluk

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function _rotate(px, py, angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: cos * px - sin * py, y: sin * px + cos * py };
}

/**
 * Bileşenin eksen hizalı sınırlayıcı kutusunu döndürür (3D t parametresi ile).
 * Tüm tipler local (0,0) merkezli — ctx.translate ile aynı mantık.
 */
function _aabb(comp, t) {
    const z  = (comp.z || 0) * t;
    const cx = comp.x + z;
    const cy = comp.y - z;
    const angle = (comp.rotation || 0) * Math.PI / 180;

    let hw, hh;
    if (comp.type === 'sayac') {
        const cfg = comp.config || SAYAC_CONFIG;
        hw = cfg.width  / 2;
        hh = cfg.height / 2;
    } else if (comp.type === 'vana' || comp.type === 'regulator'
        || comp.type === 'filtre' || comp.type === 'izolasyon_flansi'
        || comp.type === 'kompansator' || comp.type === 'manometre') {
        hw = (comp.config?.width  || 8) / 1.5;
        hh = (comp.config?.height || 8) / 1.5;
    } else if (comp.type === 'cihaz') {
        const cfg = CIHAZ_TIPLERI[comp.cihazTipi] || { width: 30, height: 30 };
        hw = cfg.width  / 2;
        hh = cfg.height / 2;
    } else {
        hw = hh = 10;
    }

    const corners = [
        { x: -hw, y: -hh }, { x: hw, y: -hh },
        { x:  hw, y:  hh }, { x: -hw, y:  hh },
    ].map(p => {
        const r = _rotate(p.x, p.y, angle);
        return { x: cx + r.x, y: cy + r.y };
    });

    return {
        minX: Math.min(...corners.map(c => c.x)),
        minY: Math.min(...corners.map(c => c.y)),
        maxX: Math.max(...corners.map(c => c.x)),
        maxY: Math.max(...corners.map(c => c.y)),
    };
}

function _overlaps(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
           a.minY < b.maxY && a.maxY > b.minY;
}

function _merge(a, b) {
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
    };
}

/** Örtüşen kutuları tekrar tekrar birleştir */
function _mergeAll(boxes) {
    let list = [...boxes];
    let changed = true;
    while (changed) {
        changed = false;
        const next = [];
        const used = new Set();
        for (let i = 0; i < list.length; i++) {
            if (used.has(i)) continue;
            let box = list[i];
            for (let j = i + 1; j < list.length; j++) {
                if (used.has(j)) continue;
                if (_overlaps(box, list[j])) {
                    box = _merge(box, list[j]);
                    used.add(j);
                    changed = true;
                }
            }
            next.push(box);
            used.add(i);
        }
        list = next;
    }
    return list;
}

// ─── Mixin ───────────────────────────────────────────────────────────────────

export const EnclosureMixin = {

    drawMuhafazaBoxes(ctx, manager) {
        if (!manager?.components) return;
        // 3D perspektif aktifken çizme
        if (state.is3DPerspectiveActive) return;

        const t    = state.viewBlendFactor || 0;
        const zoom = state.zoom || 1;
        const light = isLightMode();

        const grouped    = []; // muhafazaGrupla !== false
        const standalone = []; // muhafazaGrupla === false

        manager.components.forEach(comp => {
            if (!comp.muhafaza) return;
            if (!['vana', 'sayac', 'cihaz', 'regulator', 'filtre', 'izolasyon_flansi', 'kompansator', 'manometre'].includes(comp.type)) return;

            const bb = _aabb(comp, t);
            const box = {
                minX: bb.minX - PAD,
                minY: bb.minY - PAD,
                maxX: bb.maxX + PAD,
                maxY: bb.maxY + PAD,
            };

            if (comp.muhafazaGrupla === false) {
                standalone.push(box);
            } else {
                grouped.push(box);
            }
        });

        const allBoxes = [..._mergeAll(grouped), ...standalone];
        if (allBoxes.length === 0) return;

        const strokeColor = light ? 'rgba(30,64,175,0.75)' : 'rgba(147,197,253,0.80)';
        const textColor   = light ? 'rgba(30,64,175,0.60)' : 'rgba(147,197,253,0.60)';
        const fontSize    = 5; // sabit dünya birimi (zoom ile ölçeklenir)
        const r           = 3 / zoom;

        ctx.save();

        allBoxes.forEach(box => {
            const w = box.maxX - box.minX;
            const h = box.maxY - box.minY;

            // Kesikli çerçeve
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth   = 1.2 / zoom;
            ctx.setLineDash([4 / zoom, 3 / zoom]);
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.beginPath();
            ctx.roundRect(box.minX, box.minY, w, h, r);
            ctx.stroke();
            ctx.setLineDash([]);

            // "muhafaza" etiket — dışarıda, uzun kenara ortalı
            ctx.font      = `${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = textColor;
            if (w >= h) {
                // Üst kenarın dışına, yatay ortalı
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('muhafaza', box.minX + w / 2, box.minY - 2 / zoom);
            } else {
                // Sol kenarın dışına, dikey ortalı (döndürülmüş)
                ctx.save();
                ctx.translate(box.minX - 2 / zoom, box.minY + h / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('muhafaza', 0, 0);
                ctx.restore();
            }
        });

        ctx.restore();
    },
};
