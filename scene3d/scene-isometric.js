/**
 * scene-isometric.js
 * İzometrik görünüm renderer'ı - 3D Perspektif ana çizim motorunu kullanır.
 * İzometriye özel sadece "nesneleri kaydırma (sürükleme)" ve "etiketler" uygulanır.
 */

import { state } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';

// ─── GEOMETRİ VE YARDIMCI FONKSİYONLAR ────────────────────────────────────────

function getComponentPipeFraction(comp, pipe) {
    const len = Math.hypot(
        pipe.p2.x - pipe.p1.x,
        pipe.p2.y - pipe.p1.y,
        (pipe.p2.z || 0) - (pipe.p1.z || 0)
    );
    if (comp.fromEnd && comp.fixedDistance != null && len > 0) {
        if (comp.fromEnd === 'p1') return Math.min(comp.fixedDistance / len, 0.95);
        if (comp.fromEnd === 'p2') return Math.max(1 - comp.fixedDistance / len, 0.05);
    }
    if (typeof comp.boruPozisyonu === 'number') return comp.boruPozisyonu;
    return 0.5;
}

export function toIsometric(x, y, z = 0) {
    const angle = Math.PI / 6; // 30 derece
    const isoX = (x + y) * Math.cos(angle);
    const isoY = (y - x) * Math.sin(angle) - z;
    return { isoX, isoY };
}

// Ekranda yapılan (dx, dy) kaydırmasını, Dünya Koordinatı ofsetine (dwx, dwy) çevirir
function toWorldOffset(dx, dy) {
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);
    const dwx = 0.5 * (dx / cos30 - dy / sin30);
    const dwy = 0.5 * (dx / cos30 + dy / sin30);
    return { dwx, dwy };
}

/**
 * 3D Perspektif motorunu kandırmak için Proxy (Kopya) Manager.
 * Tüm nesnelerin konumları, kullanıcının yaptığı izometrik offset'lere göre kaydırılır.
 */
function createIsoProxyManager(manager) {
    const proxyManager = Object.create(manager);
    
    // 1. Boruları kaydır
    proxyManager.pipes = manager.pipes.map(pipe => {
        const off = state.isoPipeOffsets?.[pipe.id] || {};
        const sw = toWorldOffset(off.startDx || 0, off.startDy || 0);
        const ew = toWorldOffset(off.endDx || 0, off.endDy || 0);
        
        const proxyPipe = Object.create(pipe);
        proxyPipe.p1 = { ...pipe.p1, x: pipe.p1.x + sw.dwx, y: pipe.p1.y + sw.dwy };
        proxyPipe.p2 = { ...pipe.p2, x: pipe.p2.x + ew.dwx, y: pipe.p2.y + ew.dwy };
        return proxyPipe;
    });
    
    proxyManager.findPipeById = function(id) {
        return this.pipes.find(p => p.id === id);
    };
    
    // 2. Cihaz ve bileşenleri "Vektörel Kilit" ile kaydır. Asla bozulmazlar.
    proxyManager.components = manager.components.map(comp => {
        const proxyComp = Object.create(comp);
        proxyComp.x = comp.x; proxyComp.y = comp.y; proxyComp.z = comp.z || 0;
        
        let manualDwx = 0, manualDwy = 0;
        const cOff = state.isoComponentOffsets?.[comp.id];
        if (cOff) {
            const wOff = toWorldOffset(cOff.dx || 0, cOff.dy || 0);
            manualDwx = wOff.dwx; manualDwy = wOff.dwy;
        }

        // Ana kilit (Anchor) noktasını bulup orijinal vektörü kopyala
        let anchorOrig = null;
        let anchorProxy = null;

        if (comp.type === 'sayac') {
            const outPipeOrig = manager.findPipeById(comp.cikisBagliBoruId);
            const outPipeProxy = proxyManager.findPipeById(comp.cikisBagliBoruId);
            if (outPipeOrig && outPipeProxy) {
                anchorOrig = outPipeOrig.p1;
                anchorProxy = outPipeProxy.p1;
            } else {
                const inPipeOrig = manager.findPipeById(comp.fleksBaglanti?.boruId);
                const inPipeProxy = proxyManager.findPipeById(comp.fleksBaglanti?.boruId);
                if (inPipeOrig && inPipeProxy) {
                    anchorOrig = comp.fleksBaglanti.endpoint === 'p2' ? inPipeOrig.p2 : inPipeOrig.p1;
                    anchorProxy = comp.fleksBaglanti.endpoint === 'p2' ? inPipeProxy.p2 : inPipeProxy.p1;
                }
            }
        } else if (comp.type === 'cihaz') {
            const inPipeOrig = manager.findPipeById(comp.fleksBaglanti?.boruId);
            const inPipeProxy = proxyManager.findPipeById(comp.fleksBaglanti?.boruId);
            if (inPipeOrig && inPipeProxy) {
                anchorOrig = comp.fleksBaglanti.endpoint === 'p2' ? inPipeOrig.p2 : inPipeOrig.p1;
                anchorProxy = comp.fleksBaglanti.endpoint === 'p2' ? inPipeProxy.p2 : inPipeProxy.p1;
            }
        } else if (comp.type === 'servis_kutusu') {
            const pipeOrig = manager.findPipeById(comp.bagliBoruId);
            const pipeProxy = proxyManager.findPipeById(comp.bagliBoruId);
            if (pipeOrig && pipeProxy) {
                anchorOrig = pipeOrig.p1;
                anchorProxy = pipeProxy.p1;
            }
        } else if (comp.bagliBoruId) {
            const pipeOrig = manager.findPipeById(comp.bagliBoruId);
            const pipeProxy = proxyManager.findPipeById(comp.bagliBoruId);
            if (pipeOrig && pipeProxy) {
                const t = getComponentPipeFraction(comp, pipeOrig);
                anchorOrig = {
                    x: pipeOrig.p1.x + t * (pipeOrig.p2.x - pipeOrig.p1.x),
                    y: pipeOrig.p1.y + t * (pipeOrig.p2.y - pipeOrig.p1.y)
                };
                anchorProxy = {
                    x: pipeProxy.p1.x + t * (pipeProxy.p2.x - pipeProxy.p1.x),
                    y: pipeProxy.p1.y + t * (pipeProxy.p2.y - pipeProxy.p1.y)
                };
            }
        }

        // Cihazın orijinal noktasından ne kadar uzaklaştığını aynen koru
        if (anchorOrig && anchorProxy) {
            proxyComp.x = anchorProxy.x + (comp.x - anchorOrig.x) + manualDwx;
            proxyComp.y = anchorProxy.y + (comp.y - anchorOrig.y) + manualDwy;
        } else {
            proxyComp.x += manualDwx;
            proxyComp.y += manualDwy;
        }

        return proxyComp;
    });
    
    return proxyManager;
}

// ─── ANA RENDER DÖNGÜSÜ ───────────────────────────────────────────────────────

export function renderIsometric(ctx, canvasWidth, canvasHeight, zoom = 1, offset = { x: 0, y: 0 }) {
    if (!plumbingManager || !plumbingManager.renderer) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const bgColor = document.body.classList.contains('light-mode') ? '#e6e7e7' : '#30302e';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    window._isoRenderParams = { centerX, centerY, zoom, offset };
    window._toIsometric = toIsometric; 

    const proxyManager = createIsoProxyManager(plumbingManager);

    // Etkileşim Uç Noktaları - SADECE P2'LER YAKALANABİLİR! (Servis Kutusu Ağzı Sabittir)
    window._isoEndpoints = [];
    proxyManager.pipes.forEach(proxyPipe => {
        if (!proxyPipe.p1 || !proxyPipe.p2) return;
        const realPipe = plumbingManager.pipes.find(p => p.id === proxyPipe.id);
        if (!realPipe) return;
        
        // P1'i listeye ASLA ekleme
        const end = toIsometric(proxyPipe.p2.x, proxyPipe.p2.y, proxyPipe.p2.z || 0);
        window._isoEndpoints.push({ pipe: realPipe, type: 'end', x: end.isoX, y: end.isoY });
    });

    ctx.save();
    
    // 3D PERSPEKTİF MATRİSİNİ KUR 
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);
    ctx.setTransform(
        zoom * cos30, zoom * -sin30, 
        zoom * cos30, zoom * sin30, 
        centerX + offset.x, centerY + offset.y
    );

    // ANA RENDERER'I 3D MODUNA ZORLA
    const oldBlend = state.viewBlendFactor;
    const oldDim = state.dimensionMode;
    const oldVis = state.tempVisibility ? { ...state.tempVisibility } : {};
    
    state.viewBlendFactor = 1; // Full 3D Modu
    state.dimensionMode = 0; // 2D ölçüleri gizle
    if (!state.tempVisibility) state.tempVisibility = {};
    state.tempVisibility.showPlumbingDimensions = false; // 3D ölçüleri gizle
    state.tempVisibility.showObjectLabels = false; // Normal etiketleri gizle
    state.tempVisibility.showZElevation = false; 
    
    // VANA BÜYÜTME MÜDAHALESİ (Yana 1.2, Boya 1.5)
    const originalDrawVana = plumbingManager.renderer.drawVana;
    plumbingManager.renderer.drawVana = function(context, comp, mgr) {
        context.save();
        context.scale(1.2, 1.5); 
        originalDrawVana.call(this, context, comp, mgr);
        context.restore();
    };

    // Ana motor kaydırılmış proxy tesisatı çizer
    plumbingManager.renderer.drawPipes(ctx, proxyManager.pipes);
    plumbingManager.renderer.drawComponents(ctx, proxyManager.components, proxyManager);
    
    // Restore
    plumbingManager.renderer.drawVana = originalDrawVana;
    state.viewBlendFactor = oldBlend;
    state.dimensionMode = oldDim;
    if (oldVis) state.tempVisibility = oldVis;
    ctx.restore();

    // ─── İZOMETRİK ETİKETLERİN ÇİZİMİ (EKRAN DÜZLEMİ) ───
    startIsoLabelFrame();
    ctx.save();
    ctx.translate(centerX + offset.x, centerY + offset.y);
    ctx.scale(zoom, zoom);
    
    drawVerticalPipeLabelsIso(ctx, proxyManager); 
    drawPipeLabelsIso(ctx, proxyManager);
    drawIsometricComponentLabels(ctx, proxyManager);
    
    ctx.restore();
}

window.getIsoEndpointAtMouse = function (mouseX, mouseY) {
    if (!window._isoEndpoints || !window._isoRenderParams) return null;
    const { centerX, centerY, zoom, offset } = window._isoRenderParams;
    const worldX = (mouseX - centerX - offset.x) / zoom;
    const worldY = (mouseY - centerY - offset.y) / zoom;
    const hitRadius = 10 / zoom;

    for (const endpoint of window._isoEndpoints) {
        const dx = worldX - endpoint.x;
        const dy = worldY - endpoint.y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
            return { pipe: endpoint.pipe, type: endpoint.type }; // Yalnızca P2 dönecektir
        }
    }
    return null;
};


// ─── İZOMETRİK ETİKETLEME SİSTEMİ ─────────────────────────────────────────────

const SAYAC_TURU_LABEL_ISO = { 'KÖRÜKLÜ': '', 'ROTARY': 'Rotary Sayaç', 'TÜRBİN': 'Türbin Sayaç' };
let _isoLabelBBoxes = [];

function startIsoLabelFrame() { _isoLabelBBoxes = []; }

function _isoLabelTheme() {
    const light = document.body.classList.contains('light-mode');
    return {
        light,
        textColor: light ? '#0a0e16' : '#f3f4f8',
        subColor: light ? '#25272c' : '#c8ced8',
        accentColor: light ? '#153692' : '#a2cbfc',
        bgColor: light ? 'rgba(255,255,255,0.90)' : 'rgba(20,20,35,0.90)',
        borderColor: light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)',
        connColor: light ? 'rgba(85,85,85,0.85)' : 'rgba(200,200,200,0.85)',
        accentBar: light ? 'rgba(29,78,216,0.60)' : 'rgba(96,165,250,0.60)',
    };
}

function _resolveLabelAnchorByDir(cx, cy, clip, boxW, boxH, dir, defaultStyle) {
    const gap = 12; 
    if (dir == null) return defaultStyle === 'top-center' ? { ax: cx, ay: cy + clip + gap, style: 'top-center' } : { ax: cx + clip + gap, ay: cy, style: 'left-center' };
    switch (dir) {
        case 0: return { ax: cx, ay: cy - clip - gap - boxH, style: 'top-center' };
        case 1: return { ax: cx + clip + gap, ay: cy, style: 'left-center' };
        case 2: return { ax: cx, ay: cy + clip + gap, style: 'top-center' };
        case 3: return { ax: cx - clip - gap - boxW, ay: cy, style: 'left-center' };
    }
    return { ax: cx + clip + gap, ay: cy, style: 'left-center' };
}

function _drawIsoLabelBox(ctx, id, ax, ay, cx, cy, lines, objClip, forceStyle) {
    const visLines = lines.filter(l => l && l.text);
    if (visLines.length === 0) return;
    const T = _isoLabelTheme();
    const fontSize = 11; const lineH = fontSize * 1.5; const pad = fontSize * 0.55;

    ctx.save();
    let maxW = 0;
    visLines.forEach(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
        maxW = Math.max(maxW, ctx.measureText(l.text).width);
    });
    const boxW = maxW + pad * 2; const boxH = visLines.length * lineH + pad * 0.8;
    const stored = state.isoLabelOffsets?.[id];
    let style = forceStyle || 'left-center';

    if (stored && stored.style != null) style = stored.style;
    if (stored && stored.dax != null) { ax = cx + stored.dax; ay = cy + stored.day; }
    else if (stored && stored.dir != null) {
        const r2 = _resolveLabelAnchorByDir(cx, cy, objClip || 0, boxW, boxH, stored.dir, style);
        ax = r2.ax; ay = r2.ay; style = r2.style;
    }

    let bx = style === 'top-center' ? ax - boxW / 2 : ax;
    let by = style === 'top-center' ? ay : ay - boxH / 2;
    _isoLabelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style, cx, cy });

    const lx = bx + boxW / 2; const ly = by + boxH / 2;
    const dist = Math.hypot(lx - cx, ly - cy);
    if (dist > 0.1) {
        const ux = (lx - cx) / dist, uy = (ly - cy) / dist;
        const tObj = objClip > 0 ? objClip * 0.5 : 0;
        const tLab = Math.min(Math.abs(ux) > 0.001 ? (boxW / 2) / Math.abs(ux) : Infinity, Math.abs(uy) > 0.001 ? (boxH / 2) / Math.abs(uy) : Infinity);
        if (tObj + tLab < dist) {
            ctx.strokeStyle = T.connColor; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(cx + ux * tObj, cy + uy * tObj); ctx.lineTo(lx - ux * tLab, ly - uy * tLab); ctx.stroke();
        }
    }

    ctx.fillStyle = T.bgColor; ctx.strokeStyle = T.borderColor; ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 2.5);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle = T.accentBar; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (style === 'top-center') { ctx.moveTo(bx + 2.5, by + 1); ctx.lineTo(bx + boxW - 2.5, by + 1); }
    else { ctx.moveTo(bx + 1, by + 2.5); ctx.lineTo(bx + 1, by + boxH - 2.5); }
    ctx.stroke(); ctx.lineCap = 'butt';

    let ty = by + pad * 0.4 + fontSize;
    visLines.forEach(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
        ctx.fillStyle = l.accent ? T.accentColor : (l.sub ? T.subColor : T.textColor);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(l.text, bx + pad, ty); ty += lineH;
    });
    ctx.restore();
}

// ─── ETİKET METİN ÜRETİCİLERİ ───

function getBirimLabelLinesIso(birimTipi, birimNo) {
    const no = birimNo || '...';
    switch (birimTipi) {
        case 'KONUT': return [`D${no}`];
        case 'OFİS': case 'TİCARİ': return [`(Ticari) Dük${no}`];
        case 'KAZAN DAİRESİ': return [`KD${no}`];
        default: return [`D${no}`];
    }
}

function _buildSayacLinesIso(comp) {
    const lines = [];
    getBirimLabelLinesIso(comp.birimTipi || '', comp.birimNo || '').forEach(t => { if (t) lines.push({ text: t, bold: true }); });
    const turuLabel = SAYAC_TURU_LABEL_ISO[comp.sayacTuru || 'KÖRÜKLÜ'] || '';
    if (turuLabel) lines.push({ text: turuLabel, sub: true });
    if (comp.aboneAdi) lines.push({ text: comp.aboneAdi, sub: true });
    return lines;
}

function _buildCihazLinesIso(comp) {
    const lines = [];
    const tip = comp.cihazTipi || 'KOMBI';
    if (tip === 'KOMBI') {
        lines.push({ text: comp.yogusmali !== false ? `Yoğuşmalı Kombi` : `Kombi`, bold: true });
        if (comp.marka) lines.push({ text: comp.marka, sub: true });
        const kcal = parseFloat(comp.kapasiteKcal);
        if (!isNaN(kcal) && kcal > 0) lines.push({ text: `${Math.round(kcal).toLocaleString('tr-TR')} kcal/h`, sub: true });
    } else if (tip === 'OCAK') {
        lines.push({ text: 'Evsel Ocak', bold: true });
    } else {
        lines.push({ text: tip, bold: true });
    }
    return lines;
}

function _buildVanaLinesIso(comp) {
    const lines = [];
    const vt = comp.vanaTipi || '';
    if (vt === 'AKV') lines.push({ text: 'AKV', bold: true });
    else if (vt === 'BRANSMAN') {
        getBirimLabelLinesIso(comp.birimTipi || 'KONUT', comp.birimNo || '').forEach(t => { if (t) lines.push({ text: t, bold: true }); });
    } else if (vt === 'YANBINA' || vt === 'YAN_BINA') {
        lines.push({ text: 'Yan Bina Vanası', bold: true });
    } else {
        lines.push({ text: 'Vana', bold: true });
    }
    return lines;
}

function _buildRegulatorLinesIso(comp) {
    const lines = [];
    lines.push({ text: comp.shutOff !== false ? 'Shut-Off Regülatör' : 'Regülatör', bold: true });
    lines.push({ text: `${comp.marka ?? 'ESKA'} - ${comp.model ?? 'ERG'}`, sub: true });
    lines.push({ text: `${comp.cikisBasinc || '21'} mbar`, sub: true });
    return lines;
}

function _buildFittingLinesIso(comp) {
    const lines = [];
    let baslik = comp.type === 'filtre' ? 'Filtre' : comp.type === 'izolasyon_flansi' ? 'İzolasyon Flanşı' : comp.type === 'kompansator' ? 'Kompansatör' : comp.type === 'manometre' ? 'Manometre' : comp.type === 'topraklama' ? 'Topraklama' : 'Aksesuar';
    lines.push({ text: baslik, bold: true });
    return lines;
}

function _buildKutuLinesIso(comp) {
    const lines = [];
    lines.push({ text: comp.kutuTipi || 'S.K.', bold: true });
    if (comp.kutuBasinc) lines.push({ text: `${comp.kutuBasinc} mbar`, sub: true });
    return lines;
}

function drawIsometricComponentLabels(ctx, proxyManager) {
    proxyManager.components.forEach(comp => {
        if (typeof comp.x !== 'number') return;
        
        const pos = toIsometric(comp.x, comp.y, comp.z || 0);

        let lines, clip, useBelow = false;
        switch (comp.type) {
            case 'sayac': lines = _buildSayacLinesIso(comp); clip = 24; useBelow = true; break;
            case 'cihaz': lines = _buildCihazLinesIso(comp); clip = 24; useBelow = true; break;
            case 'servis_kutusu': lines = _buildKutuLinesIso(comp); clip = 20; useBelow = true; break;
            case 'vana': lines = _buildVanaLinesIso(comp); clip = 10; break;
            case 'regulator': lines = _buildRegulatorLinesIso(comp); clip = 10; break;
            case 'filtre': case 'izolasyon_flansi': case 'kompansator': case 'manometre': case 'topraklama':
                lines = _buildFittingLinesIso(comp); clip = 10; break;
            case 'baca': lines = [{ text: 'Baca', bold: true }]; clip = 10; useBelow = true; break;
            default: return;
        }
        if (!lines || lines.length === 0) return;
        
        const defaultStyle = useBelow ? 'top-center' : 'left-center';
        let ax = defaultStyle === 'top-center' ? pos.isoX : pos.isoX + clip + 12;
        let ay = defaultStyle === 'top-center' ? pos.isoY + clip + 12 : pos.isoY;
        _drawIsoLabelBox(ctx, comp.id, ax, ay, pos.isoX, pos.isoY, lines, clip, defaultStyle);
    });
}

// ─── DİKEY BORULARIN BOY ETİKETLERİ (YENİ VE KONTRASTLI) ───
function drawVerticalPipeLabelsIso(ctx, proxyManager) {
    const isLightMode = document.body.classList.contains('light-mode');
    
    // Arkaplanla kesinlikle karışmaması için saf beyaz/siyah (Zıt renkler)
    const boxBg = isLightMode ? '#ffffff' : '#222222';
    const boxBorder = isLightMode ? '#000000' : '#ffffff';
    const textColor = isLightMode ? '#000000' : '#ffffff';

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    proxyManager.pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;
        
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        
        if (Math.hypot(dx, dy) < 2.0 && Math.abs(dz) > 1.0) {
            const start = toIsometric(pipe.p1.x, pipe.p1.y, pipe.p1.z || 0);
            const end = toIsometric(pipe.p2.x, pipe.p2.y, pipe.p2.z || 0);
            const midX = (start.isoX + end.isoX) / 2;
            const midY = (start.isoY + end.isoY) / 2;
            
            // "3.0m" (h= ve sıfırlar kaldırıldı, tek ondalık)
            const hText = `${(Math.abs(dz) / 100).toFixed(1)}m`;
            
            ctx.save();
            const tw = ctx.measureText(hText).width;
            
            ctx.fillStyle = boxBg;
            ctx.strokeStyle = boxBorder;
            ctx.lineWidth = 1;
            
            if (ctx.roundRect) ctx.roundRect(midX + 6, midY - 9, tw + 6, 18, 3);
            else ctx.rect(midX + 6, midY - 9, tw + 6, 18);
            
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = textColor;
            ctx.fillText(hText, midX + 9, midY);
            ctx.restore();
        }
    });
}

function drawPipeLabelsIso(ctx, proxyManager) {
    const T = _isoLabelTheme();
    const fontSize = 11; const numFontSize = 14; const pad = 4;
    const { hatMap } = computeHatGroups(plumbingManager.pipes, plumbingManager.components); 
    const pipeMap = new Map(proxyManager.pipes.map(p => [p.id, p])); 

    const visited = new Set();
    const childrenIdx = new Map();
    proxyManager.pipes.forEach(p => {
        if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId) {
            const par = p.baslangicBaglanti.hedefId;
            if (!childrenIdx.has(par)) childrenIdx.set(par, []);
            childrenIdx.get(par).push(p.id);
        }
    });

    const sections = [];
    proxyManager.pipes.forEach(seedPipe => {
        if (visited.has(seedPipe.id)) return;
        const hatNo = hatMap.get(seedPipe.id);
        if (hatNo == null) return;
        const group = []; const queue = [seedPipe.id];
        while (queue.length > 0) {
            const id = queue.shift(); if (visited.has(id)) continue;
            if (hatMap.get(id) !== hatNo) continue;
            const p = pipeMap.get(id); if (!p) continue;
            visited.add(id); group.push(p);
            const par = p.baslangicBaglanti?.tip === 'boru' ? p.baslangicBaglanti.hedefId : null;
            if (par && hatMap.get(par) === hatNo) queue.push(par);
            (childrenIdx.get(id) || []).forEach(cid => { if (hatMap.get(cid) === hatNo) queue.push(cid); });
        }
        if (group.length > 0) sections.push({ hatNo, pipes: group });
    });

    sections.forEach(({ hatNo, pipes }) => {
        let chosen = pipes[0]; let maxLen = 0; let totalLen = 0;
        pipes.forEach(p => {
            if (!p.p1 || !p.p2) return;
            const len = Math.hypot(p.p2.x - p.p1.x, p.p2.y - p.p1.y, (p.p2.z || 0) - (p.p1.z || 0));
            totalLen += len; if (len > maxLen) { maxLen = len; chosen = p; }
        });
        if (!chosen || !chosen.p1 || !chosen.p2) return;

        const a = toIsometric(chosen.p1.x, chosen.p1.y, chosen.p1.z || 0);
        const b = toIsometric(chosen.p2.x, chosen.p2.y, chosen.p2.z || 0);
        const midX = (a.isoX + b.isoX) / 2; const midY = (a.isoY + b.isoY) / 2;

        const infoLines = [
            chosen.debi != null ? `${chosen.debi.toFixed(2)} m³/h` : null,
            totalLen > 0 ? `${(totalLen / 100).toFixed(2)} m` : null,
            chosen.boruCap || null
        ].filter(Boolean);

        ctx.save();
        ctx.font = `bold ${numFontSize}px "Segoe UI",sans-serif`; const numW = ctx.measureText(String(hatNo)).width;
        ctx.font = `${fontSize}px "Segoe UI",sans-serif`; let maxInfoW = 0;
        infoLines.forEach(l => { maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width); });

        const numCellW = pad * 2 + numW; const infoCellW = infoLines.length > 0 ? pad * 2 + maxInfoW : 0;
        const boxW = numCellW + (infoCellW > 0 ? 1 + infoCellW : 0);
        const boxH = Math.max(numFontSize + pad * 2, infoLines.length * (fontSize * 1.4) + pad * 1.2);

        const stored = state.isoLabelOffsets?.[chosen.id];
        let ax = midX + 20, ay = midY, style = 'left-center';
        if (stored && stored.style != null) style = stored.style;
        if (stored && stored.dax != null) { ax = midX + stored.dax; ay = midY + stored.day; }

        let bx = style === 'top-center' ? ax - boxW / 2 : ax;
        let by = style === 'top-center' ? ay : ay - boxH / 2;
        _isoLabelBBoxes.push({ id: chosen.id, bx, by, bw: boxW, bh: boxH, style, cx: midX, cy: midY });

        const lx = bx + boxW / 2; const ly = by + boxH / 2;
        if (Math.hypot(lx - midX, ly - midY) > 0.1) {
            ctx.strokeStyle = T.connColor; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(lx - (lx - midX) / Math.hypot(lx - midX, ly - midY) * (boxW / 2), ly - (ly - midY) / Math.hypot(lx - midX, ly - midY) * (boxH / 2)); ctx.stroke();
        }

        ctx.fillStyle = T.bgColor; ctx.strokeStyle = T.borderColor; ctx.lineWidth = 0.8;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 3); else ctx.rect(bx, by, boxW, boxH);
        ctx.fill(); ctx.stroke();

        if (infoCellW > 0) {
            ctx.strokeStyle = T.borderColor; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(bx + numCellW, by + pad); ctx.lineTo(bx + numCellW, by + boxH - pad); ctx.stroke();
        }

        ctx.font = `bold ${numFontSize}px "Segoe UI",sans-serif`; ctx.fillStyle = hatNo >= 300 ? '#8d2121' : T.accentColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(hatNo), bx + numCellW / 2, by + boxH / 2);

        if (infoLines.length > 0) {
            ctx.font = `${fontSize}px "Segoe UI",sans-serif`; ctx.fillStyle = T.subColor; ctx.textAlign = 'left';
            let ty = by + (boxH - infoLines.length * (fontSize * 1.4)) / 2 + (fontSize * 1.4) * 0.75;
            infoLines.forEach(l => { ctx.fillText(l, bx + numCellW + 1 + pad, ty); ty += (fontSize * 1.4); });
        }
        ctx.restore();
    });
}


// ─── İZO ETİKET ETKİLEŞİM API'LERİ VE YENİDEN YERLEŞTİRME ─────────────────────

export function hitTestIsoLabel(wx, wy) {
    for (let i = _isoLabelBBoxes.length - 1; i >= 0; i--) {
        const bb = _isoLabelBBoxes[i];
        if (wx >= bb.bx && wx <= bb.bx + bb.bw && wy >= bb.by && wy <= bb.by + bb.bh) {
            return { id: bb.id, style: bb.style, bx: bb.bx, by: bb.by, bw: bb.bw, bh: bb.bh, cx: bb.cx, cy: bb.cy };
        }
    }
    return null;
}

function _saveIsoLabelOffsetsFromPlaced(placed) {
    const out = {};
    for (const c of placed) {
        let ax = c.style === 'top-center' ? c.bx + c.bw / 2 : c.bx;
        let ay = c.style === 'top-center' ? c.by : c.by + c.bh / 2;
        out[c.id] = { dax: ax - c.anchorX, day: ay - c.anchorY, style: c.style };
    }
    return out;
}

export function setIsoLabelPos(id, style, bx, by, bw, bh, cx, cy) {
    const newOffsets = { ...(state.isoLabelOffsets || {}) };
    let ax = style === 'top-center' ? bx + bw / 2 : bx;
    let ay = style === 'top-center' ? by : by + bh / 2;
    newOffsets[id] = { dax: ax - cx, day: ay - cy, style: style };
    return newOffsets;
}

export function clearIsoLabelPos(id) {
    if (!state.isoLabelOffsets || state.isoLabelOffsets[id] == null) return null;
    const newOffsets = { ...state.isoLabelOffsets }; delete newOffsets[id]; return newOffsets;
}

export function cycleIsoLabelDir(id) {
    const newOffsets = { ...(state.isoLabelOffsets || {}) };
    newOffsets[id] = { dir: (((newOffsets[id]?.dir ?? 0) + 1) % 4) };
    return newOffsets;
}

const ISO_PRIORITY = { vana: 0, boru: 0, regulator: 1, filtre: 1, izolasyon_flansi: 1, kompansator: 1, manometre: 1, topraklama: 1, sayac: 2, servis_kutusu: 2, cihaz: 3, baca: 3 };
const ISO_CLIP_BY_TYPE = { sayac: 24, cihaz: 24, servis_kutusu: 20, vana: 10, regulator: 10, filtre: 10, izolasyon_flansi: 10, kompansator: 10, manometre: 10, topraklama: 10, boru: 8 };
const ISO_DEFAULT_STYLE_BY_TYPE = { sayac: 'top-center', cihaz: 'top-center', servis_kutusu: 'top-center', vana: 'left-center', regulator: 'left-center', filtre: 'left-center', manometre: 'left-center', topraklama: 'left-center', boru: 'left-center' };

let _isoMeasureCtx = null;
function _getIsoMeasureCtx() { if (!_isoMeasureCtx) { const c = document.createElement('canvas'); _isoMeasureCtx = c.getContext('2d'); } return _isoMeasureCtx; }
function _isoMeasureLines(lines) {
    const ctx = _getIsoMeasureCtx(); let maxW = 0; let count = 0;
    lines.forEach(l => { if (!l?.text) return; count++; ctx.font = `${l.bold ? 'bold ' : ''}11px sans-serif`; maxW = Math.max(maxW, ctx.measureText(l.text).width); });
    return count === 0 ? { bw: 0, bh: 0 } : { bw: maxW + 12, bh: count * 16.5 + 5 };
}
function _isoMeasureHatLabel(hatNo, infoLines) {
    const ctx = _getIsoMeasureCtx(); ctx.font = `bold 14px sans-serif`; const numW = ctx.measureText(String(hatNo)).width;
    ctx.font = `11px sans-serif`; let maxInfoW = 0; infoLines.forEach(t => maxInfoW = Math.max(maxInfoW, ctx.measureText(t).width));
    return { bw: numW + maxInfoW + 17, bh: Math.max(22, infoLines.length * 15.4 + 6) };
}

function _collectIsoLabelCandidates(proxyManager) {
    const cands = [];
    for (const comp of proxyManager.components) {
        if (typeof comp.x !== 'number' || typeof comp.y !== 'number') continue;
        let lines = comp.type === 'sayac' ? _buildSayacLinesIso(comp) : comp.type === 'cihaz' ? _buildCihazLinesIso(comp) : comp.type === 'servis_kutusu' ? _buildKutuLinesIso(comp) : comp.type === 'vana' ? _buildVanaLinesIso(comp) : comp.type === 'regulator' ? _buildRegulatorLinesIso(comp) : ['filtre', 'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama'].includes(comp.type) ? _buildFittingLinesIso(comp) : null;
        if (!lines) continue;
        const sz = _isoMeasureLines(lines); if (sz.bw === 0) continue;
        const pos = toIsometric(comp.x, comp.y, comp.z || 0); 
        cands.push({ kind: 'comp', id: comp.id, type: comp.type, anchorX: pos.isoX, anchorY: pos.isoY, clip: ISO_CLIP_BY_TYPE[comp.type] ?? 10, defaultStyle: ISO_DEFAULT_STYLE_BY_TYPE[comp.type] || 'left-center', bw: sz.bw, bh: sz.bh, priority: ISO_PRIORITY[comp.type] ?? 4, obj: comp });
    }

    const { hatMap } = computeHatGroups(plumbingManager.pipes, plumbingManager.components); 
    const visited = new Set();
    const pipeMap = new Map(proxyManager.pipes.map(p => [p.id, p]));
    
    proxyManager.pipes.forEach(seed => {
        if (visited.has(seed.id)) return;
        const hatNo = hatMap.get(seed.id); if (hatNo == null) return;
        const group = []; const queue = [seed.id];
        while (queue.length > 0) {
            const id = queue.shift(); if (visited.has(id)) continue;
            if (hatMap.get(id) !== hatNo) continue;
            const p = pipeMap.get(id); if (!p) continue;
            visited.add(id); group.push(p);
        }
        if (group.length === 0) return;
        let chosen = group[0]; let maxLen = 0; let totalLen = 0;
        group.forEach(p => {
            if (!p.p1 || !p.p2) return;
            const len = Math.hypot(p.p2.x - p.p1.x, p.p2.y - p.p1.y, (p.p2.z || 0) - (p.p1.z || 0)); totalLen += len;
            if (len > maxLen) { maxLen = len; chosen = p; }
        });
        const a = toIsometric(chosen.p1.x, chosen.p1.y, chosen.p1.z || 0);
        const b = toIsometric(chosen.p2.x, chosen.p2.y, chosen.p2.z || 0);
        const midX = (a.isoX + b.isoX) / 2; const midY = (a.isoY + b.isoY) / 2;
        const infoLines = [chosen.debi != null ? `${chosen.debi.toFixed(2)} m³/h` : null, totalLen > 0 ? `${(totalLen / 100).toFixed(2)} m` : null, chosen.boruCap || null].filter(Boolean);
        const sz = _isoMeasureHatLabel(hatNo, infoLines);
        cands.push({ kind: 'pipe', id: chosen.id, type: 'boru', anchorX: midX, anchorY: midY, clip: ISO_CLIP_BY_TYPE.boru, defaultStyle: 'left-center', bw: sz.bw, bh: sz.bh, priority: ISO_PRIORITY.boru, obj: chosen, hatNo });
    });
    return cands;
}

function _buildIsoObstacleRects(proxyManager) {
    return proxyManager.components.filter(c => typeof c.x === 'number').map(comp => {
        const pos = toIsometric(comp.x, comp.y, comp.z || 0); 
        const clip = ISO_CLIP_BY_TYPE[comp.type] ?? 10;
        return { id: comp.id + '_body', bx: pos.isoX - clip, by: pos.isoY - clip, bw: clip * 2, bh: clip * 2 };
    });
}

function _buildIsoPipeSegments(proxyManager) {
    return proxyManager.pipes.filter(p => p.p1 && p.p2).map(p => {
        const a = toIsometric(p.p1.x, p.p1.y, p.p1.z || 0); 
        const b = toIsometric(p.p2.x, p.p2.y, p.p2.z || 0);
        return { x1: a.isoX, y1: a.isoY, x2: b.isoX, y2: b.isoY, pipeId: p.id };
    });
}

function _bboxFromStyle(ax, ay, bw, bh, style) { return style === 'top-center' ? { bx: ax - bw / 2, by: ay, bw, bh } : { bx: ax, by: ay - bh / 2, bw, bh }; }

function _segRectIntersects(x1, y1, x2, y2, rx, ry, rw, rh) {
    if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
    if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;
    const _int = (ax, ay, bx, by, cx, cy, dx, dy) => {
        const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(den) < 1e-9) return false;
        const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den; const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };
    return _int(x1, y1, x2, y2, rx, ry, rx + rw, ry) || _int(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) || _int(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh) || _int(x1, y1, x2, y2, rx, ry + rh, rx, ry);
}

function _rectOverlapArea(a, b) {
    const x1 = Math.max(a.bx, b.bx); const y1 = Math.max(a.by, b.by);
    const x2 = Math.min(a.bx + a.bw, b.bx + b.bw); const y2 = Math.min(a.by + a.bh, b.by + b.bh);
    return (x2 <= x1 || y2 <= y1) ? 0 : (x2 - x1) * (y2 - y1);
}

function _positionsAtRadius(c, radius) {
    const out = []; const N = Math.max(16, Math.floor(radius / 8));
    for (let i = 0; i < N; i++) {
        const ang = (i / N) * 2 * Math.PI; const ux = Math.cos(ang), uy = Math.sin(ang);
        const style = Math.abs(ux) >= Math.abs(uy) ? 'left-center' : 'top-center';
        out.push({ ax: c.anchorX + ux * radius - (style === 'left-center' ? c.bw/2 : 0), ay: c.anchorY + uy * radius - (style === 'top-center' ? c.bh/2 : 0), style, ux, uy });
    }
    return out;
}

function _isSpotCompletelyClean(box, leader, obstacles, placedLabels, placedLeaders, pipeSegs) {
    const PAD = 8; const expBox = { bx: box.bx - PAD, by: box.by - PAD, bw: box.bw + 2 * PAD, bh: box.bh + 2 * PAD };
    for (const o of obstacles) { if (_rectOverlapArea(expBox, o) > 0) return false; }
    for (const s of pipeSegs) { if (_segRectIntersects(s.x1, s.y1, s.x2, s.y2, expBox.bx, expBox.by, expBox.bw, expBox.bh)) return false; }
    for (const p of placedLabels) { if (_rectOverlapArea(expBox, p) > 0) return false; }
    return true;
}

function _tryPlaceLabelsStrict(cands, obstacles, pipeSegs) {
    cands.sort((a, b) => (a.priority - b.priority) || ((b.bw * b.bh) - (a.bw * a.bh)));
    const placed = []; const placedLeaders = [];

    for (const c of cands) {
        let best = null; let bestLeader = null;
        const baseR = c.clip + 15; const maxR = 2000;
        for (let r = baseR; r <= maxR; r += 15) {
            const positions = _positionsAtRadius(c, r + Math.max(c.bw, c.bh) / 2);
            for (const pos of positions) {
                const box = _bboxFromStyle(pos.ax, pos.ay, c.bw, c.bh, pos.style);
                const leader = { x1: c.anchorX, y1: c.anchorY, x2: box.bx + box.bw / 2, y2: box.by + box.bh / 2 };
                if (_isSpotCompletelyClean(box, leader, obstacles, placed, placedLeaders, pipeSegs)) {
                    best = { bx: box.bx, by: box.by, style: pos.style }; bestLeader = leader; break;
                }
            }
            if (best) break;
        }
        if (best) { c.bx = best.bx; c.by = best.by; c.style = best.style; placed.push(c); placedLeaders.push(bestLeader); }
        else { c.bx = c.anchorX + c.clip + 25; c.by = c.anchorY - c.bh / 2; c.style = 'left-center'; placed.push(c); }
    }
    return { placed };
}

export function relayoutIsoLabels(manager) {
    if (!manager || !manager.pipes || !manager.components) return { pipeOffsets: {}, labelOffsets: {} };
    
    const proxyManager = createIsoProxyManager(manager);
    const cands = _collectIsoLabelCandidates(proxyManager);
    const obstacles = _buildIsoObstacleRects(proxyManager);
    const pipeSegs = _buildIsoPipeSegments(proxyManager);
    
    const finalRun = _tryPlaceLabelsStrict(cands, obstacles, pipeSegs);
    return { pipeOffsets: state.isoPipeOffsets || {}, labelOffsets: _saveIsoLabelOffsetsFromPlaced(finalRun.placed) };
}

// ─── GERİYE DÖNÜK UYUMLULUK (COMPATIBILITY) EKLENTİLERİ ─────────────────────
// draw2d.js gibi diğer dosyaların "import" hatası vermemesi için eklenmiştir.

export function drawIsometricPipes(ctx) { }
export function drawIsometricComponents(ctx) { }
export function angleToIsometric(angle) {
    angle = ((angle % 360) + 360) % 360;
    if (angle >= 0 && angle < 45) return 0;
    else if (angle >= 45 && angle < 135) return 45;
    else if (angle >= 135 && angle < 225) return 180;
    else return -45;
}