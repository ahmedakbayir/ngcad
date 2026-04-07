// plumbing_v2/renderer/renderer-labels.js
// Nesne etiket çizim sistemi — taşınabilir etiketler

import { computeHatGroups } from './renderer-utils.js';
import { SERVIS_KUTUSU_CONFIG } from '../objects/service-box.js';
import { SAYAC_CONFIG } from '../objects/meter.js';
import { CIHAZ_TIPLERI } from '../objects/device.js';
import { state, isLightMode } from '../../general-files/main.js';

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
        default:              return `D${no}`;   // en azından 'D' göster
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
    const existing = _labelOffsets.get(_drag.id) || {};
    _labelOffsets.set(_drag.id, { dx, dy, dir: existing.dir ?? 0 });
}

export function endLabelDrag() {
    _drag = null;
}

/** Çift tıklamada etiket yönünü döndür: 0(üst)→1(sağ)→2(alt)→3(sol)→0 */
export function rotateLabelDir(id) {
    const off = _labelOffsets.get(id) || { dx: 0, dy: 0, dir: 0 };
    const newDir = ((off.dir ?? 0) + 1) % 4;
    _labelOffsets.set(id, { dx: off.dx, dy: off.dy, dir: newDir });
}

function _getOffset(id) {
    return _labelOffsets.get(id) || { dx: 0, dy: 0 };
}

// ─── MIXIN ───────────────────────────────────────────────────────────────────
export const LabelMixin = {

    drawObjectLabels(ctx, manager) {
        if (!manager) return;
        // 3D perspektif aktifken etiketleri gizle
        if (state.is3DPerspectiveActive) return;

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

        // Hat gruplarını hesapla (debi zaten computePipeDebileri ile set edildi)
        const { hatMap } = computeHatGroups(manager.pipes, manager.components);
        window._hatMap = hatMap; // panel readonly için erişilebilir yap

        // Borular: her hat no için sadece en uzun parçada 1 etiket
        if (manager.pipes && manager.pipes.length > 0) {
            // Hat no → borular
            const hatGroups = new Map();
            manager.pipes.forEach(pipe => {
                const hatNo = hatMap.get(pipe.id);
                if (hatNo == null) return;
                if (!hatGroups.has(hatNo)) hatGroups.set(hatNo, []);
                hatGroups.get(hatNo).push(pipe);
            });

            // Her hat için en uzun boruyu seç, toplam uzunluğu hesapla
            hatGroups.forEach((pipes, hatNo) => {
                let longest = pipes[0];
                let maxLen = 0;
                let totalLen = 0;
                pipes.forEach(pipe => {
                    if (!pipe.p1 || !pipe.p2) return;
                    const len = Math.hypot(
                        pipe.p2.x - pipe.p1.x,
                        pipe.p2.y - pipe.p1.y,
                        (pipe.p2.z || 0) - (pipe.p1.z || 0)
                    );
                    totalLen += len;
                    if (len > maxLen) { maxLen = len; longest = pipe; }
                });
                if (longest && longest.p1 && longest.p2)
                    this._drawPipeObjLabel(ctx, longest, hatNo, totalLen, opts);
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

        // Kesikli bağlantı çizgisi — kutu sol-orta kenarına kadar
        {
            const ex = bx; // kutunun sol kenarı
            const ey = ay; // kutu merkezi y
            ctx.strokeStyle = connColor;
            ctx.lineWidth   = 0.6 / zoom;
            ctx.setLineDash([2 / zoom, 2 / zoom]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);
        }

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

    // ─── Etiket kutusu ALTINDA çiz (üst-orta ankraj) ────────────────────────
    /**
     * @param cx, cy  - bağlantı çizgisinin obje tarafındaki ucu (obje alt-merkezi)
     * @param ox, oy  - kullanıcı offset (taşıma)
     * @param lines   - [{text, bold?, sub?, accent?}]
     */
    _drawObjLabelBoxBelow(ctx, id, cx, cy, ox, oy, lines, opts) {
        const { zoom, fontSize, lineH,
                textColor, subColor, accentColor,
                connColor, bgColor, borderColor, accentBar } = opts;

        const visLines = lines.filter(l => l && l.text);
        if (visLines.length === 0) return;

        const pad  = fontSize * 0.6;
        const gap  = 10 / zoom;
        const r    = 2.5 / zoom;

        ctx.save();

        // Genişlik ölç
        let maxW = 0;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
        });
        const boxW = maxW + pad * 2;
        const boxH = visLines.length * lineH + pad * 0.8;

        // Kutu üst-merkezi = obje altı + gap + offset
        const topCX = cx + ox;
        const topCY = cy + gap + oy;
        const bx = topCX - boxW / 2;
        const by = topCY;

        // Bbox kaydet
        _labelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH });

        // Kesikli bağlantı çizgisi → kutunun üst-orta noktasına
        ctx.strokeStyle = connColor;
        ctx.lineWidth   = 0.6 / zoom;
        ctx.setLineDash([2 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(topCX, by);
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

        // Üst vurgu çubuğu (yatay)
        ctx.strokeStyle = accentBar;
        ctx.lineWidth   = 1.5 / zoom;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + r, by + 0.75 / zoom);
        ctx.lineTo(bx + boxW - r, by + 0.75 / zoom);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Metinler
        let ty = by + pad * 0.4 + fontSize;
        visLines.forEach(l => {
            ctx.font      = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.accent ? accentColor : (l.sub ? subColor : textColor);
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(l.text, bx + boxW / 2, ty);
            ty += lineH;
        });

        ctx.restore();
    },

    // ─── BORU — hat numarası + küçük bilgi satırları ────────────────────────
    _drawPipeObjLabel(ctx, pipe, pipeNum, totalLen, opts) {
        const { t, zoom, fontSize,
                subColor, accentColor, connColor, bgColor, borderColor, accentBar } = opts;

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

        // Boru normali (daima üst tarafa)
        let nX = -Math.sin(angle);
        let nY =  Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const connDist  = 6  / zoom;
        const labelDist = 26 / zoom;

        const cx = midX + nX * connDist;
        const cy = midY + nY * connDist;

        const off = _getOffset(pipe.id);
        // dir: 0=num sol (default), 1=num üst, 2=num sağ, 3=num alt
        const dir = off.dir != null ? off.dir : 0;

        const ax = midX + nX * labelDist + off.dx;
        const ay = midY + nY * labelDist + off.dy;

        // Bilgi satırları (küçük font)
        const uzunluk = (totalLen != null && totalLen > 0) ? (totalLen / 100).toFixed(1) : null;
        const debi    = typeof pipe.debi === 'number' ? pipe.debi : null;
        const cap     = pipe.boruCap || '';

        const infoLines = [
            debi    != null ? `${debi.toFixed(2)} m³/h` : null,
            uzunluk != null ? `${uzunluk} m`            : null,
            cap     || null,
        ].filter(Boolean);

        // 300 mbar → kırmızı
        const numColor = pipeNum >= 301 ? '#ef4444' : accentColor;

        const numStr    = String(pipeNum);
        const numFont   = `bold ${fontSize * 1.4}px "Segoe UI",sans-serif`;
        const infoFont  = `${fontSize * 0.78}px "Segoe UI",sans-serif`;
        const infoLineH = fontSize * 0.78 * 1.45;
        const pad  = fontSize * 0.42;
        const sep  = 1 / zoom;
        const r    = 2.5 / zoom;

        ctx.save();

        ctx.font = numFont;
        const numW = ctx.measureText(numStr).width;
        ctx.font = infoFont;
        let maxInfoW = 0;
        infoLines.forEach(l => { maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width); });

        const numCellW  = pad + numW + pad;
        const numCellH  = fontSize * 1.4 + pad * 0.7;
        const infoCellW = infoLines.length > 0 ? pad + maxInfoW + pad : 0;
        const infoCellH = infoLines.length > 0 ? infoLines.length * infoLineH + pad * 0.6 : 0;

        // --- Layout: dir'e göre kutu boyutu ve hücre konumları ---
        const isHoriz = (dir === 0 || dir === 2);
        let boxW, boxH;
        if (isHoriz) {
            boxW = numCellW + (infoCellW > 0 ? sep + infoCellW : 0);
            boxH = Math.max(numCellH, infoCellH);
        } else {
            boxW = Math.max(numCellW, infoCellW > 0 ? infoCellW : 0);
            boxH = numCellH + (infoCellH > 0 ? sep + infoCellH : 0);
        }

        // Kutu sol-üst köşesi (ax,ay = sol-orta)
        const bx = ax;
        const by = ay - boxH / 2;

        // Numara ve bilgi hücrelerinin sol-üst konumları
        let numBX, numBY, numBW, numBH, infoBX, infoBY;
        if (dir === 0) {        // [num | info]
            numBX = bx; numBY = by; numBW = numCellW; numBH = boxH;
            infoBX = bx + numCellW + sep; infoBY = by;
        } else if (dir === 1) { // [num / info]
            numBX = bx; numBY = by; numBW = boxW; numBH = numCellH;
            infoBX = bx; infoBY = by + numCellH + sep;
        } else if (dir === 2) { // [info | num]
            infoBX = bx; infoBY = by;
            numBX = bx + infoCellW + sep; numBY = by; numBW = numCellW; numBH = boxH;
        } else {                // [info / num]
            infoBX = bx; infoBY = by;
            numBX = bx; numBY = by + infoCellH + sep; numBW = boxW; numBH = numCellH;
        }

        _labelBBoxes.push({ id: pipe.id, bx, by, bw: boxW, bh: boxH });

        // Bağlantı çizgisi → numara hücresinin merkezinden en yakın kenarına
        {
            const nlx = numBX + numBW / 2;
            const nly = numBY + numBH / 2;
            const dx  = cx - nlx, dy = cy - nly;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
                const ux = dx / dist, uy = dy / dist;
                let tEdge = Infinity;
                if (ux > 0) tEdge = Math.min(tEdge, (numBX + numBW - nlx) / ux);
                if (ux < 0) tEdge = Math.min(tEdge, (numBX - nlx) / ux);
                if (uy > 0) tEdge = Math.min(tEdge, (numBY + numBH - nly) / uy);
                if (uy < 0) tEdge = Math.min(tEdge, (numBY - nly) / uy);
                if (isFinite(tEdge) && tEdge > 0) {
                    ctx.strokeStyle = connColor;
                    ctx.lineWidth   = 0.6 / zoom;
                    ctx.setLineDash([2 / zoom, 2 / zoom]);
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(nlx + ux * tEdge, nly + uy * tEdge);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }

        // Arka plan
        ctx.fillStyle   = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth   = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Ayırıcı çizgi
        if (infoCellW > 0 || infoCellH > 0) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth   = 0.5 / zoom;
            ctx.beginPath();
            if (isHoriz) {
                const sepX = (dir === 0) ? bx + numCellW : bx + infoCellW;
                ctx.moveTo(sepX, by + pad * 0.5);
                ctx.lineTo(sepX, by + boxH - pad * 0.5);
            } else {
                const sepY = (dir === 1) ? by + numCellH : by + infoCellH;
                ctx.moveTo(bx + pad * 0.5, sepY);
                ctx.lineTo(bx + boxW - pad * 0.5, sepY);
            }
            ctx.stroke();
        }

        // Vurgu çubuğu (numara hücresinin önde gelen kenarı)
        ctx.strokeStyle = accentBar;
        ctx.lineWidth   = 1.5 / zoom;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        if (isHoriz) {
            ctx.moveTo(numBX + 0.75 / zoom, numBY + r);
            ctx.lineTo(numBX + 0.75 / zoom, numBY + numBH - r);
        } else {
            ctx.moveTo(numBX + r, numBY + 0.75 / zoom);
            ctx.lineTo(numBX + numBW - r, numBY + 0.75 / zoom);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Hat numarası
        ctx.font         = numFont;
        ctx.fillStyle    = numColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, numBX + numBW / 2, numBY + numBH / 2);

        // Bilgi satırları
        if (infoCellW > 0 || infoCellH > 0) {
            const infoH      = infoLines.length * infoLineH;
            const infoStartY = infoBY + (infoCellH - infoH) / 2 + fontSize * 0.78 * 0.8;
            ctx.font         = infoFont;
            ctx.fillStyle    = subColor;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'alphabetic';
            infoLines.forEach((l, i) => {
                ctx.fillText(l, infoBX + pad, infoStartY + i * infoLineH);
            });
        }

        ctx.restore();
    },

    // ─── SAYAÇ ──────────────────────────────────────────────────────────────
    _drawSayacObjLabel(ctx, comp, opts) {
        const { t } = opts;
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

        // Sayacın alt-merkezi
        const cx = sc.x + SAYAC_CONFIG.width / 2;
        const cy = sc.y + SAYAC_CONFIG.height / 2;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx, off.dy, lines, opts);
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
            // Birim tipi: önce vananın kendi property'si, yoksa bağlı sayaçtan
            let birimTipi = comp.birimTipi || '';
            if (!birimTipi && manager) {
                const sayac = manager.components.find(c => c.type === 'sayac' && c.iliskiliVanaId === comp.id);
                if (sayac?.birimTipi) birimTipi = sayac.birimTipi;
            }
            if (!birimTipi) birimTipi = 'KONUT';
            const lbl = getBirimLabel(birimTipi, comp.birimNo || '');
            if (lbl) lines.push({ text: lbl, bold: true });

        } else if (vt === 'EMNIYET') {
            // Hiçbir şey yazılmaz

        } else if (vt === 'SELENOID') {
            lines.push({ text: 'Selenoid Vana', sub: true });

        } else if (vt === 'YANBINA' || vt === 'YAN_BINA') {
            lines.push({ text: 'Yan Bina Vanası', bold: true });
            if (comp.tesisatNo) lines.push({ text: `Tesisat No: ${comp.tesisatNo}`, sub: true });
            const d  = parseFloat(comp.daireSayisi)  || 0;
            const dk = parseFloat(comp.dukkanSayisi) || 0;
            const ek = parseFloat(comp.ekDebi)       || 0;
            if (d  > 0) lines.push({ text: `Daire Sayısı: ${d}`,  sub: true });
            if (dk > 0) lines.push({ text: `Dükkan Sayısı: ${dk}`, sub: true });
            const toplam = (d + dk) * 3.5 + ek;
            lines.push({ text: `Toplam Debi: ${toplam.toFixed(2)} m³/h`, sub: true });
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
        const { t } = opts;
        const sc  = this._scrPos(comp, t);
        const off = _getOffset(comp.id);

        const lines = [];

        // Birinci satır: kutu tipi (her zaman bir şey göster)
        lines.push({ text: comp.kutuTipi || 'S.K.', bold: true });

        // İkinci satır: basınç
        if (comp.kutuBasinc) lines.push({ text: `${comp.kutuBasinc} mbar`, sub: true });

        // Üçüncü satır: çıkış yönü (insan okunabilir)
        const yon = comp.cikisYonu || 'sag';
        const yonLabel = yon === 'sag' ? 'Yandan Çıkış'
                       : yon === 'alt' ? 'Alttan Çıkış'
                       : yon === 'ust' ? 'Üstten Çıkış'
                       : '';
        if (yonLabel) lines.push({ text: yonLabel, sub: true });

        // Kutunun alt-merkezi
        const cx = sc.x + SERVIS_KUTUSU_CONFIG.width / 2;
        const cy = sc.y + SERVIS_KUTUSU_CONFIG.height / 2;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx, off.dy, lines, opts);
    },

    // ─── CİHAZ (KOMBİ / OCAK) ───────────────────────────────────────────────
    _drawCihazObjLabel(ctx, comp, opts) {
        const { t } = opts;
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

        const config = CIHAZ_TIPLERI[comp.cihazTipi] || { width: 30, height: 30 };
        const hh     = (config.height || config.width) / 2;

        // Etiket cihazın altına (y eksen alt kenar)
        const cx = sc.x;
        const cy = sc.y + hh;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx, off.dy, lines, opts);
    },
};
