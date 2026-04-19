// plumbing_v2/renderer/renderer-labels.js
// Nesne etiket çizim sistemi — taşınabilir etiketler

import { computeHatGroups, getCizelge6Debi } from './renderer-utils.js';
import { SERVIS_KUTUSU_CONFIG } from '../objects/service-box.js';
import { SAYAC_CONFIG } from '../objects/meter.js';
import { CIHAZ_TIPLERI } from '../objects/device.js';
import { state, isLightMode } from '../../general-files/main.js';

// ─── Sayaç tür etiketi ───────────────────────────────────────────────────────
const SAYAC_TURU_LABEL = {
    'KÖRÜKLÜ': '',
    'ROTARY': 'Rotary Sayaç',
    'TÜRBİN': 'Türbin Sayaç',
};

// ─── Birim tipi kısaltması ───────────────────────────────────────────────────
function getBirimLabel(birimTipi, birimNo) {
    const no = birimNo || '';
    switch (birimTipi) {
        case 'KONUT': return `D${no}`;
        case 'OFİS': return `Dük${no} (Ofis)`;
        case 'TİCARİ': return `Dük${no} (Ticari)`;
        case 'KAZAN DAİRESİ': return `KD${no}`;
        default: return `D${no}`;   // en azından 'D' göster
    }
}

// ─── Kalıcı etiket offsetleri {dx, dy} her obje id'si için ──────────────────
const _labelOffsets = new Map(); // id → {dx, dy}

// ─── Oto-hesaplanan etiket konumları — bir kez hesaplanır, cache'lenir ───────
const _labelAutoPos = new Map(); // pipe.id → {ax, ay}

/** Cache'i temizle (boru eklendi/silindi/taşındı) */
export function clearLabelAutoPos(pipeId) {
    if (pipeId) _labelAutoPos.delete(pipeId);
    else _labelAutoPos.clear();
}

/**
 * Saklı etiket konumunu (dx, dy) kadar ötelir.
 * Manuel konumlandırılmış etiketlerin nesnesiyle birlikte taşınması için kullanılır.
 * Otomatik konumlandırılmış etiketler için sadece cache temizlenir (yeni konumda yeniden hesaplanır).
 */
export function translateLabel(id, dx, dy) {
    if (!dx && !dy) return;
    const stored = _labelOffsets.get(id);
    if (stored && stored.ax != null) {
        _labelOffsets.set(id, { ax: stored.ax + dx, ay: stored.ay + dy, dir: stored.dir ?? 0 });
    } else {
        // Manuel konum yok — auto-pos cache'ini temizle, yeni pozisyonda yeniden hesaplanır
        _labelAutoPos.delete(id);
    }
}

/**
 * Segment (x1,y1)→(x2,y2) ile dikdörtgen (rx,ry,rw,rh) kesişiyor mu?
 */
function _segIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    const r = rx + rw, b = ry + rh;
    function inside(px, py) { return px >= rx && px <= r && py >= ry && py <= b; }
    if (inside(x1, y1) || inside(x2, y2)) return true;
    function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
        const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        if (Math.abs(d) < 1e-9) return false;
        const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
        const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    return segSeg(x1, y1, x2, y2, rx, ry, r, ry) || segSeg(x1, y1, x2, y2, r, ry, r, b) ||
        segSeg(x1, y1, x2, y2, r, b, rx, b) || segSeg(x1, y1, x2, y2, rx, b, rx, ry);
}

// ─── Render sırasında kaydedilen etiket sınırlayıcı kutuları ────────────────
let _labelBBoxes = []; // {id, bx, by, bw, bh}  (dünya koordinatları)

// ─── Sürükleme durumu ────────────────────────────────────────────────────────
let _drag = null; // {id, startX, startY, startAX, startAY}

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
    // Mevcut bbox'tan gerçek ekran konumunu al — zoom veya auto-konum bağımsız
    const bb = _labelBBoxes.find(b => b.id === id);
    let startAX = 0, startAY = 0;
    if (bb) {
        if (bb.style === 'top-center') {
            startAX = bb.bx + bb.bw / 2;
            startAY = bb.by;
        } else { // 'left-center' (boru + vana etiketleri)
            startAX = bb.bx;
            startAY = bb.by + bb.bh / 2;
        }
    }
    _drag = { id, startX, startY, startAX, startAY };
}

export function updateLabelDrag(curX, curY) {
    if (!_drag) return;
    const ax = _drag.startAX + (curX - _drag.startX);
    const ay = _drag.startAY + (curY - _drag.startY);
    const existing = _labelOffsets.get(_drag.id) || {};
    _labelOffsets.set(_drag.id, { ax, ay, dir: existing.dir ?? 0 });
}

export function endLabelDrag() {
    _drag = null;
}

/** Tüm etiket offsetlerini düz nesne olarak döndür (kaydetme için) */
export function getLabelOffsetsJSON() {
    const out = {};
    _labelOffsets.forEach((v, k) => { out[k] = v; });
    return out;
}

/** Kaydedilmiş offsetleri yükle (proje açılışında) */
export function setLabelOffsetsJSON(data) {
    _labelOffsets.clear();
    _labelAutoPos.clear();
    if (!data) return;
    Object.entries(data).forEach(([k, v]) => _labelOffsets.set(k, v));
}

/** Çift tıklamada etiket yönünü döndür: 0(üst)→1(sağ)→2(alt)→3(sol)→0 */
export function rotateLabelDir(id) {
    const off = _labelOffsets.get(id) || { dir: 0 };
    const newDir = ((off.dir ?? 0) + 1) % 4;
    _labelOffsets.set(id, { ax: off.ax, ay: off.ay, dir: newDir });
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

        // Artık mevcut olmayan borular için oto-konum cache'ini temizle
        if (manager.pipes) {
            const activePipeIds = new Set(manager.pipes.map(p => p.id));
            for (const id of _labelAutoPos.keys()) {
                if (!activePipeIds.has(id)) _labelAutoPos.delete(id);
            }
        }

        const zoom = state.zoom || 1;
        const t = state.viewBlendFactor || 0;
        const light = isLightMode();

        // Sabit dünya birimi — zoom ile birlikte doğal olarak büyür/küçülür
        const fontSize = 10;
        const lineH = fontSize * 1.6;

        const opts = {
            zoom, t, fontSize, lineH,
            textColor: light ? '#111827' : '#e8eaf6',
            subColor: light ? '#1a1e25' : '#9ca3af',
            accentColor: light ? '#1d4ed8' : '#60a5fa',
            // Çok hafif arka plan — hemen hemen şeffaf
            bgColor: light ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,35,0.10)',
            borderColor: light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)',
            connColor: light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)',
            accentBar: light ? 'rgba(29,78,216,0.50)' : 'rgba(96,165,250,0.50)',
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

            // Her hat için etiket borusunu seç, toplam uzunluğu hesapla
            // Kural: en yatay boru varsa öncelik onda, yoksa en uzun boru
            hatGroups.forEach((pipes, hatNo) => {
                let fallback = pipes[0]; // en uzun boru (yatay yoksa)
                let maxLen = 0;
                let totalLen = 0;
                let horizBest = null;
                let horizBestAngle = Infinity; // açı küçüldükçe daha yatay

                pipes.forEach(pipe => {
                    if (!pipe.p1 || !pipe.p2) return;
                    const dx = pipe.p2.x - pipe.p1.x;
                    const dy = pipe.p2.y - pipe.p1.y;
                    const len = Math.hypot(dx, dy, (pipe.p2.z || 0) - (pipe.p1.z || 0));
                    const xyLen = Math.hypot(dx, dy);
                    totalLen += len;

                    if (len > maxLen) { maxLen = len; fallback = pipe; }

                    // Yataydanlık açısı: 0=mükemmel yatay, 90=dik
                    // Çok kısa (xyLen<10) boruları dışla
                    if (xyLen >= 10) {
                        const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
                        // 45°'den az eğimli = "yatay"
                        if (angle < 45 && angle < horizBestAngle) {
                            horizBestAngle = angle;
                            horizBest = pipe;
                        }
                    }
                });

                const chosen = horizBest || fallback;
                if (chosen && chosen.p1 && chosen.p2)
                    this._drawPipeObjLabel(ctx, chosen, hatNo, totalLen, opts, manager.pipes);
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

        // Topraklama etiketleri
        if (manager.pipes) {
            manager.pipes.forEach(pipe => {
                if (pipe.topraklama) this._drawTopraklamaLabel(ctx, pipe, opts);
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
        const r = 2.5 / zoom;

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
        const bx = ax;
        const by = ay - boxH / 2;

        // Bbox kaydet (hit test için) — style: sürükleme anchor hesabı için
        _labelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style: 'left-center' });

        // Kesikli bağlantı çizgisi — kutu sol-orta kenarına kadar
        {
            const ex = bx; // kutunun sol kenarı
            const ey = ay; // kutu merkezi y
            ctx.strokeStyle = connColor;
            ctx.lineWidth = 0.6 / zoom;
            ctx.setLineDash([2 / zoom, 2 / zoom]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Arka plan (çok hafif)
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Sol vurgu çubuğu
        ctx.strokeStyle = accentBar;
        ctx.lineWidth = 1.5 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + 0.75 / zoom, by + r);
        ctx.lineTo(bx + 0.75 / zoom, by + boxH - r);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Metinler
        let ty = by + pad * 0.4 + fontSize;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.accent ? accentColor : (l.sub ? subColor : textColor);
            ctx.textAlign = 'left';
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

        const pad = fontSize * 0.6;
        const gap = 10 / zoom;
        const r = 2.5 / zoom;

        ctx.save();

        // Genişlik ölç
        let maxW = 0;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
        });
        const boxW = maxW + pad * 2;
        const boxH = visLines.length * lineH + pad * 0.8;

        // Kutu üst-merkezi: mutlak konum saklandıysa onu kullan (zoom/taşıma bağımsız)
        const stored = _labelOffsets.get(id);
        let topCX, topCY;
        if (stored && stored.ax != null) {
            topCX = stored.ax;
            topCY = stored.ay;
        } else {
            topCX = cx + ox;
            topCY = cy + gap + oy;
        }
        const bx = topCX - boxW / 2;
        const by = topCY;

        // Bbox kaydet — style: sürükleme anchor hesabı için
        _labelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style: 'top-center' });

        // Kesikli bağlantı çizgisi → kutunun üst-orta noktasına
        ctx.strokeStyle = connColor;
        ctx.lineWidth = 0.6 / zoom;
        ctx.setLineDash([2 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(topCX, by);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arka plan
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Üst vurgu çubuğu (yatay)
        ctx.strokeStyle = accentBar;
        ctx.lineWidth = 1.5 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + r, by + 0.75 / zoom);
        ctx.lineTo(bx + boxW - r, by + 0.75 / zoom);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Metinler
        let ty = by + pad * 0.4 + fontSize;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.accent ? accentColor : (l.sub ? subColor : textColor);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(l.text, bx + pad, ty);
            ty += lineH;
        });

        ctx.restore();
    },

    // ─── BORU — hat numarası + küçük bilgi satırları ────────────────────────
    _drawPipeObjLabel(ctx, pipe, pipeNum, totalLen, opts, allPipes) {
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

        const midX = (sx1 + sx2) / 2;
        const midY = (sy1 + sy2) / 2;
        const angle = Math.atan2(sy2 - sy1, sx2 - sx1);

        const connDist = 1 / zoom;
        const labelDist = 50 / zoom;

        const cx = midX - Math.sin(angle) * connDist;
        const cy = midY + Math.cos(angle) * connDist;

        const stored = _labelOffsets.get(pipe.id);
        const dir = stored?.dir ?? 0;

        // Mutlak konum saklandıysa doğrudan kullan — zoom veya boru hareketi bağımsız
        let ax, ay;

        if (stored && stored.ax != null) {
            ax = stored.ax;
            ay = stored.ay;
        } else {
            // Oto-konum cache'te varsa doğrudan kullan — her render'da yeniden hesaplama
            const cached = _labelAutoPos.get(pipe.id);
            if (cached) {
                ax = cached.ax;
                ay = cached.ay;
            } else {
                // İlk kez: 8 aday yön dene, en az çakışanı seç
                const candidates = [
                    { dx: 0, dy: -1 },
                    { dx: 1, dy: 0 },
                    { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 },
                    { dx: 0.707, dy: -0.707 },
                    { dx: 0.707, dy: 0.707 },
                    { dx: -0.707, dy: -0.707 },
                    { dx: -0.707, dy: 0.707 },
                ];

                let pNX = -Math.sin(angle), pNY = Math.cos(angle);
                if (pNY > 0) { pNX = -pNX; pNY = -pNY; }
                candidates.sort((a, b) =>
                    (a.dx * pNX + a.dy * pNY) - (b.dx * pNX + b.dy * pNY)
                );

                // Tahmini kutu boyutu (dünya birimi — fontSize sabit dünya birimi)
                const estW = fontSize * 3 + fontSize * 0.84 * 8;
                const estH = fontSize * 1.4 + fontSize * 0.78 * 1.45 * 3;

                let bestScore = Infinity, bestAx = 0, bestAy = 0;

                for (const cand of candidates) {
                    const cax = midX + cand.dx * labelDist;
                    const cay = midY + cand.dy * labelDist;
                    const cbx = cax;
                    const cby = cay - estH / 2;

                    let score = 0;
                    for (const bb of _labelBBoxes) {
                        const ox = Math.max(0, Math.min(cbx + estW, bb.bx + bb.bw) - Math.max(cbx, bb.bx));
                        const oy = Math.max(0, Math.min(cby + estH, bb.by + bb.bh) - Math.max(cby, bb.by));
                        if (ox > 0 && oy > 0) score += 10 + ox * oy;
                    }

                    if (allPipes) {
                        for (const p of allPipes) {
                            if (p.id === pipe.id || !p.p1 || !p.p2) continue;
                            const pz1 = (p.p1.z || 0) * t, pz2 = (p.p2.z || 0) * t;
                            if (_segIntersectsRect(
                                p.p1.x + pz1, p.p1.y - pz1,
                                p.p2.x + pz2, p.p2.y - pz2,
                                cbx, cby, estW, estH
                            )) score += 3;
                        }
                    }

                    if (score < bestScore) {
                        bestScore = score;
                        bestAx = cax;
                        bestAy = cay;
                        if (score === 0) break;
                    }
                }

                ax = bestAx;
                ay = bestAy;
                _labelAutoPos.set(pipe.id, { ax, ay });
            }
        }

        // Bilgi satırları (küçük font)
        const uzunluk = (totalLen != null && totalLen > 0) ? (totalLen / 100).toFixed(1) : null;
        const debi = typeof pipe.debi === 'number' ? pipe.debi : null;
        const cap = pipe.boruCap || '';

        const infoLines = [
            debi != null ? `${debi.toFixed(2)} m³/h` : null,
            uzunluk != null ? `${uzunluk} m` : null,
            cap || null,
        ].filter(Boolean);

        // Açıklama metni — boruya ait description string
        if (pipe.description) {
            pipe.description.trimEnd().split('\n').forEach(line => infoLines.push(line.trimEnd()));
        }

        // 300 mbar → kırmızı
        const numColor = pipeNum >= 300 ? '#ef4444' : accentColor;

        const numStr = String(pipeNum);
        const numFont = `bold ${fontSize * 1.4}px "Segoe UI",sans-serif`;
        const infoFont = `${fontSize * 0.78}px "Segoe UI",sans-serif`;
        const infoLineH = fontSize * 0.78 * 1.45;
        const pad = fontSize * 0.42;
        const sep = 1 / zoom;
        const r = 2.5 / zoom;

        ctx.save();

        ctx.font = numFont;
        const numW = ctx.measureText(numStr).width;
        ctx.font = infoFont;
        let maxInfoW = 0;
        infoLines.forEach(l => { maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width); });

        const numCellW = pad + numW + pad;
        const numCellH = fontSize * 1.4 + pad * 0.7;
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

        _labelBBoxes.push({ id: pipe.id, bx, by, bw: boxW, bh: boxH, style: 'left-center' });

        // Bağlantı çizgisi → numara hücresinin merkezinden en yakın kenarına
        {
            const nlx = numBX + numBW / 2;
            const nly = numBY + numBH / 2;
            const dx = cx - nlx, dy = cy - nly;
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
                    ctx.lineWidth = 0.6 / zoom;
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
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Ayırıcı çizgi
        if (infoCellW > 0 || infoCellH > 0) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 0.5 / zoom;
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
        ctx.lineWidth = 3 / zoom;
        ctx.lineCap = 'round';
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
        ctx.font = numFont;
        ctx.fillStyle = numColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, numBX + numBW / 2, numBY + numBH / 2);

        // Bilgi satırları
        ctx.font = infoFont;
        ctx.fillStyle = subColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const infoH = infoLines.length * infoLineH;
        const infoStartY = infoBY + (infoCellH - infoH) / 2 + infoLineH / 2;

        infoLines.forEach((l, i) => {
            ctx.fillText(l, infoBX + pad, infoStartY + i * infoLineH);
        });

        ctx.restore();
    },

    // ─── SAYAÇ ──────────────────────────────────────────────────────────────
    _drawSayacObjLabel(ctx, comp, opts) {
        const { t } = opts;
        const sc = this._scrPos(comp, t);
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
            lines.push({ text: marka ? `Birim İçi Esnek Tesisat (${marka})` : 'Esnek Tesisat', sub: true });
        } else {
            const bagTipi = comp.birimBaglantiTipi || '';
            if (bagTipi) {
                const bagLabel = bagTipi === 'DİŞLİ' ? 'Dişli'
                    : bagTipi === 'KAYNAKLI' ? 'Kaynaklı'
                        : bagTipi;
                lines.push({ text: `Birim İçi ${bagLabel} Tesisat`, sub: true });
            }
        }

        // Abone bilgisi
        const aboneAdi = comp.aboneAdi || '';
        const aboneNo = comp.aboneNo || '';

        if (aboneAdi || aboneNo) {
            if (aboneAdi) lines.push({ text: aboneAdi, sub: true });
            if (aboneNo) lines.push({ text: aboneNo, sub: true });
        }

        // Açıklama metni
        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
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
        const sc = this._scrPos(comp, t);
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
            const d = parseFloat(comp.daireSayisi) || 0;
            const dk = parseFloat(comp.dukkanSayisi) || 0;
            const ek = parseFloat(comp.ekDebi) || 0;
            if (d > 0) lines.push({ text: `Daire Sayısı: ${d}`, sub: true });
            if (dk > 0) lines.push({ text: `Dükkan Sayısı: ${dk}`, sub: true });
            const n = d + dk;
            const faktorluDebi = n > 0 ? getCizelge6Debi(n, 0, true) : 0;
            const toplamDebi = faktorluDebi + ek;
            if (ek > 0) lines.push({ text: `Ek Debi: ${ek.toFixed(2)} m³/h`, sub: true });
            if (toplamDebi > 0) lines.push({ text: `Toplam Debi: ${toplamDebi.toFixed(2)} m³/h`, sub: true });
        }

        // Açıklama metni
        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        if (lines.length === 0) return;

        // Vana açısına dik yönde konumlandır
        const angle = (comp.rotation || 0) * Math.PI / 180;
        let nX = -Math.sin(angle);
        let nY = Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const hw = 3; // yarı-genişlik
        const cx = sc.x + nX * hw;
        const cy = sc.y + nY * hw;

        // Mutlak konum saklandıysa doğrudan kullan (zoom değişse de sabit kalır)
        let ax, ay;
        if (off.ax != null) {
            ax = off.ax;
            ay = off.ay;
        } else {
            ax = sc.x + nX * (hw + 12 / zoom);
            ay = sc.y + nY * (hw + 12 / zoom);
        }

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts);
    },

    // ─── SERVİS KUTUSU ──────────────────────────────────────────────────────
    _drawKutuObjLabel(ctx, comp, opts) {
        const { t } = opts;
        const sc = this._scrPos(comp, t);
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

        // Açıklama metni
        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        // Kutunun alt-merkezi
        const cx = sc.x + SERVIS_KUTUSU_CONFIG.width / 2;
        const cy = sc.y + SERVIS_KUTUSU_CONFIG.height / 2;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx, off.dy, lines, opts);
    },

    // ─── CİHAZ (KOMBİ / OCAK) ───────────────────────────────────────────────
    _drawCihazObjLabel(ctx, comp, opts) {
        const { t } = opts;
        const sc = this._scrPos(comp, t);
        const off = _getOffset(comp.id);

        const lines = [];

        if (comp.cihazTipi === 'KOMBI') {
            const yogusmali = comp.yogusmali !== false;
            const baca = comp.bacaTipi || 'Hermetik';
            lines.push({ text: yogusmali ? `Yoğuşmalı ${baca} Kombi` : `${baca} Kombi`, bold: true });
            if (comp.marka) lines.push({ text: comp.marka, sub: true });
            if (comp.model) lines.push({ text: comp.model, sub: true });
            const kcal = parseFloat(comp.kapasiteKcal);
            const kw = parseFloat(comp.kapasiteKW);
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

        // Açıklama metni
        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        if (lines.length === 0) return;

        const config = CIHAZ_TIPLERI[comp.cihazTipi] || { width: 30, height: 30 };
        const hh = (config.height || config.width) / 2;

        // Etiket cihazın altına (y eksen alt kenar)
        const cx = sc.x;
        const cy = sc.y + hh;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx, off.dy, lines, opts);
    },

    _drawTopraklamaLabel(ctx, pipe, opts) {
        if (!pipe.p1 || !pipe.p2) return;
        const { t, zoom, fontSize, lineH,
            textColor, subColor, bgColor, borderColor, connColor, accentBar } = opts;

        // Sembol geometrisi (renderer-pipes ile aynı hesap)
        const STEM = 12, VERT = 8, W1 = 9;

        const z1 = (pipe.p1.z || 0) * t, z2 = (pipe.p2.z || 0) * t;
        const sx1 = pipe.p1.x + z1, sy1 = pipe.p1.y - z1;
        const sx2 = pipe.p2.x + z2, sy2 = pipe.p2.y - z2;
        const mx = (sx1 + sx2) / 2, my = (sy1 + sy2) / 2;

        const dx = sx2 - sx1, dy = sy2 - sy1;
        const len = Math.hypot(dx, dy);
        const ndx = len > 0.01 ? dx / len : 0;
        const ndy = len > 0.01 ? dy / len : 1;

        let px = ndy, py = -ndx;
        if (px < -0.001 || (Math.abs(px) < 0.001 && py < 0)) { px = -px; py = -py; }

        const qx = -ndx, qy = -ndy;

        // Sembol tabanı (line4 ucu)
        const e5x = mx + px * STEM, e5y = my + py * STEM;
        const bx = e5x + qx * VERT, by = e5y + qy * VERT;

        // Etiket bağlantı noktası: geniş çizginin (W1) ucu
        const connX = bx + px * W1, connY = by + py * W1;

        // Saklı veya varsayılan etiket konumu
        const stored = _labelOffsets.get(pipe.id + '_topraklama');
        let ax, ay;
        if (stored?.ax != null) {
            ax = stored.ax; ay = stored.ay;
        } else {
            ax = connX + px * 10; ay = connY + py * 10;
        }

        const lines = [
            { text: 'TOPRAKLAMA', bold: true },
            { text: 'Bakır Çubuk', sub: true },
            { text: 'ø:16mm - L:1.5m', sub: true },
        ];

        const pad = fontSize * 0.5;
        const r = 2.5 / zoom;

        ctx.save();
        ctx.font = `bold ${fontSize}px "Segoe UI",sans-serif`;
        let maxW = 0;
        lines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
        });

        const boxW = maxW + pad * 2;
        const boxH = lines.length * lineH + pad * 0.6;
        const boxX = ax;
        const boxY = ay - boxH / 2;

        // Bbox kaydet (hit test + drag için)
        _labelBBoxes.push({
            id: pipe.id + '_topraklama',
            bx: boxX, by: boxY, bw: boxW, bh: boxH,
            style: 'left-center',
        });

        // Kesikli bağlantı çizgisi
        ctx.strokeStyle = connColor;
        ctx.lineWidth = 0.6 / zoom;
        ctx.setLineDash([2 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.moveTo(connX, connY);
        ctx.lineTo(boxX, ay);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arka plan
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // Sol vurgu çubuğu
        ctx.strokeStyle = accentBar;
        ctx.lineWidth = 1.5 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(boxX + 0.75 / zoom, boxY + r);
        ctx.lineTo(boxX + 0.75 / zoom, boxY + boxH - r);
        ctx.stroke();

        // Metinler
        let ty = boxY + pad * 0.1 + fontSize;
        lines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.sub ? subColor : textColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(l.text, boxX + pad, ty);
            ty += lineH;
        });

        ctx.restore();
    },
};
