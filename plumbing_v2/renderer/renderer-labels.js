// plumbing_v2/renderer/renderer-labels.js
// Nesne etiket çizim sistemi — taşınabilir etiketler

import { buildPipeHierarchy } from './renderer-utils.js';
import { SERVIS_KUTUSU_CONFIG } from '../objects/service-box.js';
import { SAYAC_CONFIG } from '../objects/meter.js';
import { CIHAZ_TIPLERI } from '../objects/device.js';
import { state, isLightMode } from '../../general-files/main.js';

// ─── Unicode çemberleri ①–⑳ ─────────────────────────────────────────────────
const CIRCLE_NUMS = [
    '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
    '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
];
function getCircleNum(n) {
    return (n >= 1 && n <= 20) ? CIRCLE_NUMS[n - 1] : `(${n})`;
}

// ─── Sayaç tür etiketi ───────────────────────────────────────────────────────
const SAYAC_TURU_LABEL = {
    'KÖRÜKLÜ': '',
    'ROTARY':  'Rotary Sayaç',
    'TÜRBİN':  'Türbin Sayaç',
};

// ─── Birim tipi kısaltması ───────────────────────────────────────────────────
function getBirimLabel(birimTipi, birimNo) {
    const no = birimNo || '';
    switch (birimTipi) {
        case 'KONUT':         return `D${no}`;
        case 'OFİS':          return `Dük${no} (Ofis)`;
        case 'TİCARİ':        return `Dük${no} (Ticari)`;
        case 'KAZAN DAİRESİ': return `KD${no}`;
        default: return no ? `D${no}` : '';
    }
}

// ─── Kalıcı etiket offsetleri {dx, dy} her obje id'si için ──────────────────
const _labelOffsets = new Map(); // id → {dx, dy}

// ─── Render sırasında kaydedilen etiket sınırlayıcı kutuları ────────────────
let _labelBBoxes = []; // {id, bx, by, bw, bh}  (dünya koordinatları)

// ─── Sürükleme durumu ────────────────────────────────────────────────────────
let _drag = null; // {id, startX, startY, startDX, startDY}

// ─── API ─────────────────────────────────────────────────────────────────────

export function hitTestLabel(wx, wy) {
    for (const bb of _labelBBoxes) {
        if (wx >= bb.bx && wx <= bb.bx + bb.bw &&
            wy >= bb.by && wy <= bb.by + bb.bh) {
            return bb.id;
        }
    }
    return null;
}

export function startLabelDrag(id, startX, startY) {
    const off = _labelOffsets.get(id) || { dx: 0, dy: 0 };
    _drag = { id, startX, startY, startDX: off.dx, startDY: off.dy };
}

export function updateLabelDrag(curX, curY) {
    if (!_drag) return;
    const dx = _drag.startDX + (curX - _drag.startX);
    const dy = _drag.startDY + (curY - _drag.startY);
    _labelOffsets.set(_drag.id, { dx, dy });
}

export function endLabelDrag() {
    _drag = null;
}

function _getOffset(id) {
    return _labelOffsets.get(id) || { dx: 0, dy: 0 };
}

// ─── MIXIN ───────────────────────────────────────────────────────────────────
export const LabelMixin = {

    drawObjectLabels(ctx, manager) {
        if (!manager) return;

        _labelBBoxes = []; // Her render'da sıfırla

        const zoom  = state.zoom || 1;
        const t     = state.viewBlendFactor || 0;
        const light = isLightMode();

        const fontSize = Math.max(5.5, 9 * Math.pow(zoom, -0.10));
        const lineH    = fontSize * 1.6;

        const opts = {
            zoom, t, fontSize, lineH,
            textColor:   light ? '#111827' : '#e8eaf6',
            subColor:    light ? '#374151' : '#9ca3af',
            accentColor: light ? '#1d4ed8' : '#60a5fa',
            // Çok hafif arka plan — hemen hemen şeffaf
            bgColor:     light ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,35,0.10)',
            borderColor: light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)',
            connColor:   light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)',
            accentBar:   light ? 'rgba(29,78,216,0.50)' : 'rgba(96,165,250,0.50)',
        };

        // Boru hiyerarşisi (numara sırası için)
        const hierarchy = buildPipeHierarchy(manager.pipes, manager.components);

        // Borular
        if (manager.pipes && manager.pipes.length > 0) {
            const sorted = [...manager.pipes].sort((a, b) => {
                const la = hierarchy.get(a.id)?.label || 'ZZZ';
                const lb = hierarchy.get(b.id)?.label || 'ZZZ';
                const na = la.length === 1 ? la.charCodeAt(0) - 64 : la.charCodeAt(0) - 64 + 26;
                const nb = lb.length === 1 ? lb.charCodeAt(0) - 64 : lb.charCodeAt(0) - 64 + 26;
                return na - nb;
            });
            sorted.forEach((pipe, idx) => {
                this._drawPipeObjLabel(ctx, pipe, idx + 1, opts);
            });
        }

        // Bileşenler
        if (manager.components) {
            manager.components.forEach(comp => {
                switch (comp.type) {
                    case 'sayac':
                        this._drawSayacObjLabel(ctx, comp, opts);
                        break;
                    case 'vana':
                        this._drawVanaObjLabel(ctx, comp, manager, opts);
                        break;
                    case 'servis_kutusu':
                        this._drawKutuObjLabel(ctx, comp, opts);
                        break;
                    case 'cihaz':
                        this._drawCihazObjLabel(ctx, comp, opts);
                        break;
                }
            });
        }
    },

    // ─── Yardımcı: ekran koordinatı ─────────────────────────────────────────
    _scrPos(obj, t) {
        const z = (obj.z || 0) * t;
        return { x: obj.x + z, y: obj.y - z };
    },

    // ─── Etiket kutusu çiz ve bbox kaydet ───────────────────────────────────
    /**
     * @param ax, ay  - kutunun sol kenar orta noktası (offset uygulanmış)
     * @param cx, cy  - bağlantı çizgisinin obje tarafındaki ucu
     * @param lines   - [{text, bold?, sub?, accent?}]
     */
    _drawObjLabelBox(ctx, id, ax, ay, cx, cy, lines, opts) {
        const { zoom, fontSize, lineH,
                textColor, subColor, accentColor,
                connColor, bgColor, borderColor, accentBar } = opts;

        const visLines = lines.filter(l => l && l.text);
        if (visLines.length === 0) return;

        const pad = fontSize * 0.6;
        const r   = 2.5 / zoom;

        ctx.save();
        ctx.font = `${fontSize}px "Segoe UI",sans-serif`;

        // Genişlik ölç
        let maxW = 0;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
        });
        const boxW = maxW + pad * 2;
        const boxH = visLines.length * lineH + pad * 0.8;
        const bx   = ax;
        const by   = ay - boxH / 2;

        // Bbox kaydet (hit test için)
        _labelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH });

        // Kesikli bağlantı çizgisi
        ctx.strokeStyle = connColor;
        ctx.lineWidth   = 0.6 / zoom;
        ctx.setLineDash([2 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arka plan (çok hafif)
        ctx.fillStyle   = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth   = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Sol vurgu çubuğu
        ctx.strokeStyle = accentBar;
        ctx.lineWidth   = 1.5 / zoom;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + 0.75 / zoom, by + r);
        ctx.lineTo(bx + 0.75 / zoom, by + boxH - r);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Metinler
        let ty = by + pad * 0.4 + fontSize;
        visLines.forEach(l => {
            ctx.font      = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.accent ? accentColor : (l.sub ? subColor : textColor);
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(l.text, bx + pad, ty);
            ty += lineH;
        });

        ctx.restore();
    },

    // ─── Varsayılan anchor hesapla (obje sağ kenarından) ────────────────────
    _defaultAnchor(sc, halfW, gap, zoom) {
        return { cx: sc.x + halfW, cy: sc.y, ax: sc.x + halfW + gap / zoom };
    },

    // ─── BORU (Sol: numara | Sağ: bilgiler) ─────────────────────────────────
    _drawPipeObjLabel(ctx, pipe, pipeNum, opts) {
        const { t, zoom, fontSize, lineH,
                textColor, subColor, accentColor,
                connColor, bgColor, borderColor, accentBar } = opts;

        if (!pipe.p1 || !pipe.p2) return;

        const len3D = Math.hypot(
            pipe.p2.x - pipe.p1.x,
            pipe.p2.y - pipe.p1.y,
            (pipe.p2.z || 0) - (pipe.p1.z || 0)
        );
        if (len3D < 15) return;

        const z1 = (pipe.p1.z || 0) * t, z2 = (pipe.p2.z || 0) * t;
        const sx1 = pipe.p1.x + z1, sy1 = pipe.p1.y - z1;
        const sx2 = pipe.p2.x + z2, sy2 = pipe.p2.y - z2;

        const midX  = (sx1 + sx2) / 2;
        const midY  = (sy1 + sy2) / 2;
        const angle = Math.atan2(sy2 - sy1, sx2 - sx1);

        let nX = -Math.sin(angle);
        let nY =  Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const connDist  = 7  / zoom;
        const labelDist = 18 / zoom;

        const cx = midX + nX * connDist;
        const cy = midY + nY * connDist;

        const off = _getOffset(pipe.id);
        const ax  = midX + nX * labelDist + off.dx;
        const ay  = midY + nY * labelDist + off.dy;

        const uzunluk = pipe.uzunluk != null ? (pipe.uzunluk / 100).toFixed(1) : null;
        const debi    = (typeof pipe.debi === 'number' && pipe.debi > 0) ? pipe.debi : null;
        const cap     = pipe.boruCap || '';

        const infoLines = [
            debi    != null ? `${debi.toFixed(2)} m³/h` : null,
            uzunluk != null ? `${uzunluk} m` : null,
            cap     || null,
        ].filter(Boolean);

        if (infoLines.length === 0) return;

        const numStr    = String(pipeNum);
        const numFont   = `bold ${fontSize * 1.4}px "Segoe UI",sans-serif`;
        const infoFont  = `${fontSize * 0.95}px "Segoe UI",sans-serif`;
        const pad       = fontSize * 0.55;
        const sepW      = 1 / zoom;
        const r         = 2.5 / zoom;

        ctx.save();

        // Numara genişliği
        ctx.font = numFont;
        const numW = ctx.measureText(numStr).width;

        // Bilgi genişliği
        ctx.font = infoFont;
        let maxInfoW = 0;
        infoLines.forEach(l => {
            maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width);
        });

        const leftW  = pad + numW + pad;
        const rightW = pad + maxInfoW + pad;
        const boxW   = leftW + sepW + rightW;
        const boxH   = Math.max(
            fontSize * 1.4 + pad,
            infoLines.length * lineH * 0.95 + pad * 0.8
        );
        const bx = ax;
        const by = ay - boxH / 2;

        // Bbox kaydet
        _labelBBoxes.push({ id: pipe.id, bx, by, bw: boxW, bh: boxH });

        // Bağlantı çizgisi
        ctx.strokeStyle = connColor;
        ctx.lineWidth   = 0.6 / zoom;
        ctx.setLineDash([2 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arka plan
        ctx.fillStyle   = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth   = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Sol kenar vurgu çubuğu
        ctx.strokeStyle = accentBar;
        ctx.lineWidth   = 1.5 / zoom;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + 0.75 / zoom, by + r);
        ctx.lineTo(bx + 0.75 / zoom, by + boxH - r);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Dikey ayırıcı
        ctx.strokeStyle = borderColor;
        ctx.lineWidth   = 0.6 / zoom;
        ctx.beginPath();
        ctx.moveTo(bx + leftW, by + pad * 0.5);
        ctx.lineTo(bx + leftW, by + boxH - pad * 0.5);
        ctx.stroke();

        // Numara (sol, ortalanmış)
        ctx.font      = numFont;
        ctx.fillStyle = accentColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, bx + pad + numW / 2, by + boxH / 2);

        // Bilgi satırları (sağ)
        const infoStartY = by + (boxH - infoLines.length * lineH * 0.95) / 2 + fontSize * 0.85;
        ctx.font      = infoFont;
        ctx.fillStyle = subColor;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        infoLines.forEach((l, i) => {
            ctx.fillText(l, bx + leftW + sepW + pad, infoStartY + i * lineH * 0.95);
        });

        ctx.restore();
    },

    // ─── SAYAÇ ──────────────────────────────────────────────────────────────
    _drawSayacObjLabel(ctx, comp, opts) {
        const { t, zoom } = opts;
        const sc  = this._scrPos(comp, t);
        const off = _getOffset(comp.id);

        const lines = [];

        // Birim: D1 / Dük1 / KD1
        const birimLabel = getBirimLabel(comp.birimTipi || '', comp.birimNo || '');
        if (birimLabel) lines.push({ text: birimLabel, bold: true });

        // Sayaç türü (Körüklü → gösterme)
        const turuLabel = SAYAC_TURU_LABEL[comp.sayacTuru || 'KÖRÜKLÜ'] || '';
        if (turuLabel) lines.push({ text: turuLabel, sub: true });

        // Tesisat tipi
        const boruTipi = comp.birimBoruTipi || 'ÇELİK';
        if (boruTipi === 'ESNEK') {
            const marka = comp.esnekMarka || '';
            lines.push({ text: marka ? `${marka} Esnek Tesisat` : 'Esnek Tesisat', sub: true });
        } else {
            const bagTipi = comp.birimBaglantiTipi || '';
            if (bagTipi) {
                const bagLabel = bagTipi === 'DİŞLİ' ? 'Dişli'
                               : bagTipi === 'KAYNAKLI' ? 'Kaynaklı'
                               : bagTipi;
                lines.push({ text: `${bagLabel} Tesisat`, sub: true });
            }
        }

        // Abone bilgisi
        const aboneAdi = comp.aboneAdi || '';
        const aboneNo  = comp.aboneNo  || '';
        if (aboneAdi || aboneNo) {
            lines.push({ text: [aboneAdi, aboneNo].filter(Boolean).join(' - '), sub: true });
        }

        if (lines.length === 0) return;

        const hw  = SAYAC_CONFIG.width / 2;
        const cx  = sc.x + hw;
        const cy  = sc.y;
        const ax  = cx + 14 / zoom + off.dx;
        const ay  = cy + off.dy;

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts);
    },

    // ─── VANA ───────────────────────────────────────────────────────────────
    _drawVanaObjLabel(ctx, comp, manager, opts) {
        const { t, zoom } = opts;
        const sc  = this._scrPos(comp, t);
        const off = _getOffset(comp.id);

        const lines = [];
        const vt = comp.vanaTipi || '';

        if (vt === 'CIHAZ') {
            // Sadece izolator varsa
            if (comp.izolator) lines.push({ text: 'İzolatörlü', sub: true });

        } else if (vt === 'AKV') {
            lines.push({ text: 'AKV', bold: true });

        } else if (vt === 'BRANSMAN') {
            // Birim tipi: sayaç üzerinden bul
            let birimTipi = 'KONUT';
            if (manager) {
                const sayac = manager.components.find(c => c.type === 'sayac' && c.iliskiliVanaId === comp.id);
                if (sayac?.birimTipi) birimTipi = sayac.birimTipi;
            }
            const lbl = getBirimLabel(birimTipi, comp.birimNo || '');
            if (lbl) lines.push({ text: lbl, bold: true });

        } else if (vt === 'EMNIYET') {
            // Hiçbir şey yazılmaz

        } else if (vt === 'SELENOID') {
            lines.push({ text: 'Selenoid Vana', sub: true });

        } else if (vt === 'YANBINA') {
            lines.push({ text: 'Yan Bina Vanası', sub: true });

        }

        if (lines.length === 0) return;

        // Vana açısına dik yönde konumlandır
        const angle = (comp.rotation || 0) * Math.PI / 180;
        let nX = -Math.sin(angle);
        let nY =  Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const hw  = 3; // yarı-genişlik
        const cx  = sc.x + nX * hw;
        const cy  = sc.y + nY * hw;
        const ax  = sc.x + nX * (hw + 12 / zoom) + off.dx;
        const ay  = sc.y + nY * (hw + 12 / zoom) + off.dy;

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts);
    },

    // ─── SERVİS KUTUSU ──────────────────────────────────────────────────────
    _drawKutuObjLabel(ctx, comp, opts) {
        const { t, zoom } = opts;
        const sc  = this._scrPos(comp, t);
        const off = _getOffset(comp.id);

        const lines = [];

        // Birinci satır: kutu tipi + çıkış yönü
        const tipYon = [comp.kutuTipi, comp.cikisYonu].filter(Boolean).join(' ');
        if (tipYon) lines.push({ text: tipYon, bold: true });

        // İkinci satır: basınç
        if (comp.kutuBasinc) lines.push({ text: `${comp.kutuBasinc} mbar`, sub: true });

        if (lines.length === 0) return;

        const hw  = SERVIS_KUTUSU_CONFIG.width / 2;
        const cx  = sc.x + hw;
        const cy  = sc.y;
        const ax  = cx + 14 / zoom + off.dx;
        const ay  = cy + off.dy;

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts);
    },

    // ─── CİHAZ (KOMBİ / OCAK) ───────────────────────────────────────────────
    _drawCihazObjLabel(ctx, comp, opts) {
        const { t, zoom } = opts;
        const sc  = this._scrPos(comp, t);
        const off = _getOffset(comp.id);

        const lines = [];

        if (comp.cihazTipi === 'KOMBI') {
            const yogusmali = comp.yogusmali !== false;
            const baca      = comp.bacaTipi || 'Hermetik';
            lines.push({ text: yogusmali ? `Yoğuşmalı ${baca} Kombi` : `${baca} Kombi`, bold: true });
            if (comp.marka) lines.push({ text: comp.marka, sub: true });
            if (comp.model) lines.push({ text: comp.model, sub: true });
            const kcal = parseFloat(comp.kapasiteKcal);
            const kw   = parseFloat(comp.kapasiteKW);
            if (!isNaN(kcal) && kcal > 0) {
                const kwStr = (!isNaN(kw) && kw > 0) ? ` (${kw} kW)` : '';
                lines.push({ text: `${Math.round(kcal).toLocaleString('tr-TR')} kcal/h${kwStr}`, sub: true });
            }
            if (comp.yedekCihaz) lines.push({ text: 'Yedek Cihaz', sub: true });

        } else if (comp.cihazTipi === 'OCAK') {
            lines.push({ text: 'Evsel Ocak', bold: true });
            if (comp.marka) lines.push({ text: comp.marka, sub: true });
            if (comp.model) lines.push({ text: comp.model, sub: true });
            if (comp.yedekCihaz) lines.push({ text: 'Yedek Cihaz', sub: true });

        } else {
            return;
        }

        if (lines.length === 0) return;

        const config  = CIHAZ_TIPLERI[comp.cihazTipi] || { width: 30 };
        const angle   = (comp.rotation || 0) * Math.PI / 180;
        const hw      = config.width / 2;
        const rX      = Math.cos(angle) * hw;
        const rY      = Math.sin(angle) * hw;

        const cx = sc.x + rX;
        const cy = sc.y + rY;
        const ax = cx + Math.cos(angle) * (14 / zoom) + off.dx;
        const ay = cy + Math.sin(angle) * (14 / zoom) + off.dy;

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts);
    },
};
