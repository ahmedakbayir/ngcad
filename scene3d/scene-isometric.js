/**
 * scene-isometric.js
 * İzometrik görünüm renderer'ı - 3D Perspektif ana çizim motorunu kullanır.
 * İzometriye özel sadece "nesneleri kaydırma (sürükleme)" ve "etiketler" uygulanır.
 */

import { state } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { CIHAZ_TIPLERI } from '../plumbing_v2/objects/device.js';
import { SAYAC_CONFIG }  from '../plumbing_v2/objects/meter.js';

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

// Fiziksel bağlantı noktası için ortak ID oluşturur (Kopmaları önlemek için)
function getJointKey(p) {
    return `${Math.round(p.x)}_${Math.round(p.y)}_${Math.round(p.z || 0)}`;
}

/**
 * 3D Perspektif motorunu kandırmak için Proxy (Kopya) Manager.
 * Tüm nesnelerin konumları, kullanıcının yaptığı izometrik offset'lere göre kaydırılır.
 */
export function createIsoProxyManager(manager) {
    const proxyManager = Object.create(manager);
    
    // 1. JOINT OFSET HARİTASI (Kopmaları ve fırlamaları kesin çözer)
    const jointOffsets = new Map();
    
    // Önce kullanıcı tarafından yapılmış manuel sürüklemeleri Joint'lere kaydet
    manager.pipes.forEach(pipe => {
        const off = state.isoPipeOffsets?.[pipe.id];
        if (off) {
            if (off.startDx || off.startDy) {
                jointOffsets.set(getJointKey(pipe.p1), toWorldOffset(off.startDx, off.startDy));
            }
            if (off.endDx || off.endDy) {
                jointOffsets.set(getJointKey(pipe.p2), toWorldOffset(off.endDx, off.endDy));
            }
        }
    });

    // YENİ HAT YAYILIMI:
    // İso düzenleme yapılmış bir sahneye yeni hat eklendiğinde, yeni hat eski (orijinal)
    // koordinatlarda kalıyor → uçlardan biri offset junction'da, diğeri orijinalde
    // anlamsız zikzak çıkıyor. state.isoPipeOffsets'ta KAYDI olmayan hatlar için
    // bir ucu offsetli junction'a denk geliyorsa diğer ucuna da aynı offset kopyalanır
    // (rijit ötelenme). Bu eski "dikey boru koruması" mantığının genelleştirilmesidir.
    const stateOffsets = state.isoPipeOffsets || {};
    let changed = true;
    let iter = 0;
    while (changed && iter < 10) {
        changed = false; iter++;
        manager.pipes.forEach(pipe => {
            if (stateOffsets[pipe.id]) return; // explicit drag offset var, dokunma
            const k1 = getJointKey(pipe.p1);
            const k2 = getJointKey(pipe.p2);
            const off1 = jointOffsets.get(k1);
            const off2 = jointOffsets.get(k2);
            if (off1 && !off2) { jointOffsets.set(k2, { ...off1 }); changed = true; }
            else if (off2 && !off1) { jointOffsets.set(k1, { ...off2 }); changed = true; }
        });
    }
    
    // 2. Kopya (Proxy) boruları Joint haritasındaki net ofsetlere göre kaydır
    // İzometri renk modu 'diameter' ise colorGroup'u boruCap (DN15..DN450) ile değiştir.
    // Bu sayede renderer'ın mevcut colorGroup→renk lookup'ı tüm gövde/dirsek/reducer
    // çizimlerinde otomatik olarak çap renklerini kullanır.
    const colorByDiameter = state.isometricColorMode === 'diameter';
    proxyManager.pipes = manager.pipes.map(pipe => {
        const proxyPipe = Object.create(pipe);
        const off1 = jointOffsets.get(getJointKey(pipe.p1)) || { dwx: 0, dwy: 0 };
        const off2 = jointOffsets.get(getJointKey(pipe.p2)) || { dwx: 0, dwy: 0 };

        proxyPipe.p1 = { ...pipe.p1, x: pipe.p1.x + off1.dwx, y: pipe.p1.y + off1.dwy };
        proxyPipe.p2 = { ...pipe.p2, x: pipe.p2.x + off2.dwx, y: pipe.p2.y + off2.dwy };
        if (colorByDiameter && pipe.boruCap) proxyPipe.colorGroup = pipe.boruCap;
        return proxyPipe;
    });
    
    proxyManager.findPipeById = function(id) {
        return this.pipes.find(p => p.id === id);
    };
    
    // 3. Cihaz ve bileşenleri "Vektörel Kilit" ile kaydır. 
    proxyManager.components = manager.components.map(comp => {
        const proxyComp = Object.create(comp);
        proxyComp.x = comp.x; proxyComp.y = comp.y; proxyComp.z = comp.z || 0;
        
        let manualDwx = 0, manualDwy = 0;
        const cOff = state.isoComponentOffsets?.[comp.id];
        if (cOff) {
            const wOff = toWorldOffset(cOff.dx || 0, cOff.dy || 0);
            manualDwx = wOff.dwx; manualDwy = wOff.dwy;
        }

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

        // Anchor varsa cihaz tamamen pipe anchor'una kilitlenir (manuel ofset yok sayılır,
        // aksi takdirde sürüklemede 2× kayma olur). Anchor yoksa manuel ofset fallback.
        if (anchorOrig && anchorProxy) {
            proxyComp.x = anchorProxy.x + (comp.x - anchorOrig.x);
            proxyComp.y = anchorProxy.y + (comp.y - anchorOrig.y);
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

    // Muhafaza kutuları — bileşenlerin ALTINDA, ekran-eksen hizalı
    // (komponentler iso matriste çizildiği için kendi label-style frame'inde)
    ctx.save();
    ctx.translate(centerX + offset.x, centerY + offset.y);
    ctx.scale(zoom, zoom);
    drawMuhafazaBoxesIso(ctx, proxyManager);
    ctx.restore();

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
    const oldPerspActive = state.is3DPerspectiveActive;
    const oldZoom = state.zoom;

    state.viewBlendFactor = 1; // Full 3D Modu
    state.dimensionMode = 0; // 2D ölçüleri gizle
    state.is3DPerspectiveActive = true; // Cihaz "persp şematiği" (hat doğrultusunda) aktif
    // İzometri zoom'unu state.zoom'a yansıt — böylece motor içindeki
    // "lineWidth = X / state.zoom" hesapları setTransform(zoom*cos30, …) ile
    // birleşip ekran pixelinde sabit kalınlık üretir. (Büyük projelerde
    // izoZoom küçülünce, state.zoom=1 olduğu için çizgiler abartılı kalın
    // görünüyordu — bu satır sorunu çözüyor.)
    state.zoom = zoom;
    if (!state.tempVisibility) state.tempVisibility = {};
    state.tempVisibility.showPlumbingDimensions = false; // 3D ölçüleri gizle
    state.tempVisibility.showObjectLabels = false; // Normal etiketleri gizle
    state.tempVisibility.showZElevation = false;
    state.tempVisibility.isoVerticalNormalColor = true; // Dikey borular normal hat rengini alsın

    // VANA: enden daralt, boydan uzat (eski 1.2 × 1.5 → 0.85 × 1.75; daha ince/uzun)
    const originalDrawVana = plumbingManager.renderer.drawVana;
    plumbingManager.renderer.drawVana = function(context, comp, mgr) {
        context.save();
        context.scale(1.2, .85);
        originalDrawVana.call(this, context, comp, mgr);
        context.restore();
    };

    // BORU KALINLIĞI: izometride DN'den bağımsız TEK sabit kalınlık (şematik görünüm)
    const originalPipeWidthFromCap = plumbingManager.renderer.pipeWidthFromCap;
    plumbingManager.renderer.pipeWidthFromCap = function(_boruCap) {
        return 3.2; // ~1 px daha kalın — çap fark etmez
    };

    // Redüksiyon hunisi de çap bağımsız sabit geometriyle çizilsin
    state.isoReducerFixed = true;

    // Ana motor kaydırılmış proxy tesisatı çizer
    plumbingManager.renderer.drawPipes(ctx, proxyManager.pipes);
    plumbingManager.renderer.drawComponents(ctx, proxyManager.components, proxyManager);

    // Restore
    plumbingManager.renderer.drawVana = originalDrawVana;
    plumbingManager.renderer.pipeWidthFromCap = originalPipeWidthFromCap;
    state.isoReducerFixed = false;
    state.viewBlendFactor = oldBlend;
    state.dimensionMode = oldDim;
    state.is3DPerspectiveActive = oldPerspActive;
    state.zoom = oldZoom;
    if (oldVis) state.tempVisibility = oldVis;
    ctx.restore();

    // ─── İZOMETRİK ETİKETLERİN ÇİZİMİ (EKRAN DÜZLEMİ) ───
    startIsoLabelFrame();
    ctx.save();
    ctx.translate(centerX + offset.x, centerY + offset.y);
    ctx.scale(zoom, zoom);

    drawIsoEndpointMarkers(ctx);
    drawVerticalPipeLabelsIso(ctx, proxyManager);
    drawPipeLabelsIso(ctx, proxyManager);
    drawIsometricComponentLabels(ctx, proxyManager);

    ctx.restore();
}

// İzometride sürüklenebilir uçların göstergesi
// Normal: küçük ama görünür; hover (window._isoHoverEpId): belirginleşir.
function drawIsoEndpointMarkers(ctx) {
    if (!window._isoEndpoints || window._isoEndpoints.length === 0) return;
    const light = document.body.classList.contains('light-mode');
    const hoverId = window._isoHoverEpId || null;

    const baseFillCenter = light ? 'rgba(255,255,255,0.85)' : 'rgba(230,235,245,0.80)';
    const baseFillEdge   = light ? 'rgba(60,80,120,0.35)'   : 'rgba(150,175,210,0.40)';
    const baseRing       = light ? 'rgba(20,40,80,0.40)'    : 'rgba(200,220,245,0.35)';

    const hoverFillCenter = light ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.96)';
    const hoverFillEdge   = light ? 'rgba(20,90,200,0.85)'   : 'rgba(135,206,235,0.85)';
    const hoverRing       = light ? '#1a73e8'                 : '#87CEEB';

    ctx.save();
    for (const ep of window._isoEndpoints) {
        const isHover = hoverId && ep.pipe && ep.pipe.id === hoverId;
        const r = isHover ? 3 : 1.3;
        const grad = ctx.createRadialGradient(ep.x - r * 0.4, ep.y - r * 0.4, 0, ep.x, ep.y, r);
        grad.addColorStop(0, isHover ? hoverFillCenter : baseFillCenter);
        grad.addColorStop(1, isHover ? hoverFillEdge : baseFillEdge);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = isHover ? 1.0 : 0.5;
        ctx.strokeStyle = isHover ? hoverRing : baseRing;
        ctx.stroke();
    }
    ctx.restore();
}

// ─── İZOMETRİK MUHAFAZA KUTULARI ─────────────────────────────────────────────
// 2D'deki drawMuhafazaBoxes karşılığı; köşeleri toIsometric'e projekte edip
// ekran-eksen hizalı AABB hesaplar, örtüşenleri birleştirir, kesikli kutu çizer.
function drawMuhafazaBoxesIso(ctx, proxyManager) {
    if (!proxyManager?.components) return;

    const ALLOWED = ['vana', 'sayac', 'cihaz', 'regulator', 'filtre', 'izolasyon_flansi', 'kompansator', 'manometre'];
    const PAD = 8; // ekran düzleminde iso-birim cinsinden iç boşluk
    const light = document.body.classList.contains('light-mode');
    const curFloorId = state.currentFloor?.id || null;
    const sameFloor = (c) => !curFloorId || !c.floorId || c.floorId === curFloorId;

    const grouped = [];
    const standalone = [];

    proxyManager.components.forEach(comp => {
        if (!comp.muhafaza) return;
        if (!sameFloor(comp)) return;
        if (!ALLOWED.includes(comp.type)) return;

        let hw, hh;
        if (comp.type === 'sayac') {
            const cfg = comp.config || SAYAC_CONFIG;
            hw = cfg.width / 2;
            hh = cfg.height / 2;
        } else if (comp.type === 'cihaz') {
            const cfg = CIHAZ_TIPLERI[comp.cihazTipi] || { width: 30, height: 30 };
            hw = cfg.width / 2;
            hh = cfg.height / 2;
        } else {
            hw = (comp.config?.width  || 8) / 1.5;
            hh = (comp.config?.height || 8) / 1.5;
        }

        const angle = (comp.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const wz = comp.z || 0;

        const localCorners = [
            { lx: -hw, ly: -hh }, { lx:  hw, ly: -hh },
            { lx:  hw, ly:  hh }, { lx: -hw, ly:  hh },
        ];
        const projected = localCorners.map(c => {
            const rx = cos * c.lx - sin * c.ly;
            const ry = sin * c.lx + cos * c.ly;
            return toIsometric(comp.x + rx, comp.y + ry, wz);
        });

        const xs = projected.map(p => p.isoX);
        const ys = projected.map(p => p.isoY);
        const box = {
            minX: Math.min(...xs) - PAD,
            minY: Math.min(...ys) - PAD,
            maxX: Math.max(...xs) + PAD,
            maxY: Math.max(...ys) + PAD,
        };

        if (comp.muhafazaGrupla === false) standalone.push(box);
        else grouped.push(box);
    });

    const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
    const merge = (a, b) => ({
        minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
    });
    const mergeAll = (list) => {
        let cur = [...list];
        let changed = true;
        while (changed) {
            changed = false;
            const next = []; const used = new Set();
            for (let i = 0; i < cur.length; i++) {
                if (used.has(i)) continue;
                let box = cur[i];
                for (let j = i + 1; j < cur.length; j++) {
                    if (used.has(j)) continue;
                    if (overlaps(box, cur[j])) { box = merge(box, cur[j]); used.add(j); changed = true; }
                }
                next.push(box); used.add(i);
            }
            cur = next;
        }
        return cur;
    };

    const allBoxes = [...mergeAll(grouped), ...standalone];
    if (allBoxes.length === 0) return;

    const strokeColor = light ? 'rgba(30,64,175,0.75)' : 'rgba(147,197,253,0.80)';
    const textColor   = light ? 'rgba(30,64,175,0.60)' : 'rgba(147,197,253,0.60)';
    const fontSize = 10; // iso label frame'de raw değer — zoom ile büyür

    ctx.save();
    allBoxes.forEach(box => {
        const w = box.maxX - box.minX;
        const h = box.maxY - box.minY;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.roundRect(box.minX - 1, box.minY - 1, w + 1, h + 1, 3);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = `${fontSize}px "Segoe UI",sans-serif`;
        ctx.fillStyle = textColor;
        if (w >= h) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('muhafaza', box.minX + w / 2, box.minY - 2);
        } else {
            ctx.save();
            ctx.translate(box.minX - 2, box.minY + h / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('muhafaza', 0, 0);
            ctx.restore();
        }
    });
    ctx.restore();
}

window.getIsoEndpointAtMouse = function (mouseX, mouseY, radiusPx = 10) {
    if (!window._isoEndpoints || !window._isoRenderParams) return null;
    const { centerX, centerY, zoom, offset } = window._isoRenderParams;
    const worldX = (mouseX - centerX - offset.x) / zoom;
    const worldY = (mouseY - centerY - offset.y) / zoom;
    const hitRadius = radiusPx / zoom;

    for (const endpoint of window._isoEndpoints) {
        const dx = worldX - endpoint.x;
        const dy = worldY - endpoint.y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
            return { pipe: endpoint.pipe, type: endpoint.type }; // Yalnızca P2 dönecektir
        }
    }
    return null;
};


// ─── İZOMETRİK ETİKETLEME SİSTEMI (Kenarlıksız / Arka plansız) ─────────────────

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
        connColor: light ? 'rgba(85,85,85,0.85)' : 'rgba(200,200,200,0.85)',
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

// Etiketler arka plansız, kenarlıksız (sadece metin + isteğe bağlı hizalama çizgisi)
// noLeader=true ile bağlantı (leader) çizgisi çizilmez (sayaç/kutu/regülatör için).
function _drawIsoLabelBox(ctx, id, ax, ay, cx, cy, lines, objClip, forceStyle, noLeader) {
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

    if (!noLeader) {
        const lx = bx + boxW / 2; const ly = by + boxH / 2;
        const dist = Math.hypot(lx - cx, ly - cy);
        if (dist > 0.1) {
            const ux = (lx - cx) / dist, uy = (ly - cy) / dist;
            // Nesne ve etiket tarafları: dikdörtgen-kenar projeksiyonu (line iki kutu sınırına tam değer).
            const tObj = objClip > 0 ? Math.min(
                Math.abs(ux) > 0.001 ? objClip / Math.abs(ux) : Infinity,
                Math.abs(uy) > 0.001 ? objClip / Math.abs(uy) : Infinity
            ) : 0;
            const tLab = Math.min(Math.abs(ux) > 0.001 ? (boxW / 2) / Math.abs(ux) : Infinity, Math.abs(uy) > 0.001 ? (boxH / 2) / Math.abs(uy) : Infinity);
            if (tObj + tLab < dist) {
                ctx.strokeStyle = T.connColor; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(cx + ux * tObj, cy + uy * tObj); ctx.lineTo(lx - ux * tLab, ly - uy * tLab); ctx.stroke();
            }
        }
    }

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

// 2D `getBirimLabelLines` ile birebir aynı — OFİS/TİCARİ ayrımı korunur
function getBirimLabelLinesIso(birimTipi, birimNo) {
    const no = birimNo || '...';
    switch (birimTipi) {
        case 'KONUT': return [`D${no}`];
        case 'OFİS': return [`(Ofis) Dük${no}`];
        case 'TİCARİ': return [`(Ticari) Dük${no}`];
        case 'KAZAN DAİRESİ': return [`KD${no}`];
        default: return [`D${no}`];
    }
}

// 2D `_drawSayacObjLabel` ile birebir aynı satırlar
function _buildSayacLinesIso(comp) {
    const lines = [];
    getBirimLabelLinesIso(comp.birimTipi || '', comp.birimNo || '').forEach(t => { if (t) lines.push({ text: t, bold: true }); });

    const turuLabel = SAYAC_TURU_LABEL_ISO[comp.sayacTuru || 'KÖRÜKLÜ'] || '';
    if (turuLabel) lines.push({ text: turuLabel, sub: true });

    const boruTipi = comp.birimBoruTipi || 'ÇELİK';
    if (boruTipi === 'ESNEK') {
        const marka = comp.esnekMarka || '';
        lines.push({ text: marka ? `Esnek Tesisat (${marka})` : 'Esnek Tesisat', sub: true });
    } else {
        const bagTipi = comp.birimBaglantiTipi || '';
        if (bagTipi) {
            const bagLabel = bagTipi === 'DİŞLİ' ? 'Dişli'
                : bagTipi === 'KAYNAKLI' ? 'Kaynaklı'
                : bagTipi;
            lines.push({ text: `${bagLabel} Tesisat`, sub: true });
        }
    }

    if (comp.aboneAdi) lines.push({ text: comp.aboneAdi, sub: true });
    if (comp.aboneNo) lines.push({ text: comp.aboneNo, sub: true });

    if (comp.description) {
        comp.description.trimEnd().split('\n').forEach(line => {
            lines.push({ text: line.trimEnd() || ' ', sub: true });
        });
    }
    return lines;
}

// 2D `_drawCihazObjLabel` ile birebir aynı satırlar
function _buildCihazLinesIso(comp) {
    const lines = [];
    const tip = comp.cihazTipi || 'KOMBI';
    if (tip === 'KOMBI') {
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
    } else if (tip === 'OCAK') {
        lines.push({ text: 'Evsel Ocak', bold: true });
        if (comp.marka) lines.push({ text: comp.marka, sub: true });
        if (comp.model) lines.push({ text: comp.model, sub: true });
        if (comp.yedekCihaz) lines.push({ text: 'Yedek Cihaz', sub: true });
    } else {
        lines.push({ text: tip, bold: true });
    }

    if (comp.description) {
        comp.description.trimEnd().split('\n').forEach(line => {
            lines.push({ text: line.trimEnd() || ' ', sub: true });
        });
    }
    return lines;
}

function _buildVanaLinesIso(comp) {
    const lines = [];
    const vt = comp.vanaTipi || '';
    if (vt === 'AKV') lines.push({ text: 'AKV', bold: true });
    else if (vt === 'SELENOID') lines.push({ text: 'Selenoid Vana', bold: true });
    else if (vt === 'CIHAZ') lines.push({ text: '', bold: true });
    else if (vt === 'BRANSMAN') {
        getBirimLabelLinesIso(comp.birimTipi || 'KONUT', comp.birimNo || '').forEach(t => { if (t) lines.push({ text: t, bold: true }); });
    } else if (vt === 'YANBINA' || vt === 'YAN_BINA') {
        lines.push({ text: 'Yan Bina Vanası', bold: true });
    } else {
        lines.push({ text: 'Emn.V', bold: true });
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

// 2D `_drawKutuObjLabel` ile birebir aynı satırlar
function _buildKutuLinesIso(comp) {
    const lines = [];
    lines.push({ text: comp.kutuTipi || 'S.K.', bold: true });
    if (comp.kutuBasinc) lines.push({ text: `${comp.kutuBasinc} mbar`, sub: true });

    const yon = comp.cikisYonu || 'sag';
    const yonLabel = yon === 'sag' ? 'Yandan Çıkış'
        : yon === 'alt' ? 'Alttan Çıkış'
        : yon === 'ust' ? 'Üstten Çıkış'
        : '';
    if (yonLabel) lines.push({ text: yonLabel, sub: true });

    if (comp.description) {
        comp.description.trimEnd().split('\n').forEach(line => {
            lines.push({ text: line.trimEnd() || ' ', sub: true });
        });
    }
    return lines;
}

// Cihaz iso-modda persp-şematik konuma kayar; sayaç/kutu vs. proxyComp.x/y'de durur.
// Etiket anchor'ı çizilen nesneyle aynı konumu kullanmalı, yoksa leader hava boşluğunu gösterir.
function _resolveIsoCompAnchor(comp, proxyManager) {
    const fn = plumbingManager?.renderer?._computeCihazPerspSchematic;
    if (comp.type === 'cihaz' && typeof fn === 'function') {
        const sch = fn.call(plumbingManager.renderer, comp, proxyManager, 1);
        if (sch) return { x: sch.x, y: sch.y, z: sch.z || 0 };
    }
    return { x: comp.x, y: comp.y, z: comp.z || 0 };
}

function drawIsometricComponentLabels(ctx, proxyManager) {
    proxyManager.components.forEach(comp => {
        if (typeof comp.x !== 'number') return;

        const anchor = _resolveIsoCompAnchor(comp, proxyManager);
        const pos = toIsometric(anchor.x, anchor.y, anchor.z);

        let lines, clip, useBelow = false, noLeader = false;
        switch (comp.type) {
            // Sayaç / Servis Kutusu / Regülatör: leader çizgisi YOK (kullanıcı isteği)
            case 'sayac': lines = _buildSayacLinesIso(comp); clip = 24; useBelow = true; noLeader = true; break;
            case 'cihaz': lines = _buildCihazLinesIso(comp); clip = 24; useBelow = true; break;
            case 'servis_kutusu': lines = _buildKutuLinesIso(comp); clip = 20; useBelow = true; noLeader = true; break;
            case 'vana': lines = _buildVanaLinesIso(comp); clip = 10; break;
            case 'regulator': lines = _buildRegulatorLinesIso(comp); clip = 10; noLeader = true; break;
            case 'filtre': case 'izolasyon_flansi': case 'kompansator': case 'manometre': case 'topraklama':
                lines = _buildFittingLinesIso(comp); clip = 10; break;
            case 'baca': lines = [{ text: 'Baca', bold: true }]; clip = 10; useBelow = true; break;
            default: return;
        }
        if (!lines || lines.length === 0) return;

        const defaultStyle = useBelow ? 'top-center' : 'left-center';
        let ax = defaultStyle === 'top-center' ? pos.isoX : pos.isoX + clip + 12;
        let ay = defaultStyle === 'top-center' ? pos.isoY + clip + 12 : pos.isoY;
        _drawIsoLabelBox(ctx, comp.id, ax, ay, pos.isoX, pos.isoY, lines, clip, defaultStyle, noLeader);
    });
}

// Gruplanmış Dikey Boru Etiketleri
// Dikey boru grupları (h-etiketi adayları) — hem draw hem layout için ortak.
function _computeVerticalPipeLabelInfos(proxyManager) {
    const originalPipes = plumbingManager.pipes;
    const vertPipes = originalPipes.filter(pipe => {
        if (!pipe.p1 || !pipe.p2) return false;
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        return Math.hypot(dx, dy) < 2.0 && Math.abs(dz) > 1.0;
    });

    const { hatMap } = computeHatGroups(plumbingManager.pipes, plumbingManager.components);
    const visited = new Set();
    const groups = [];

    vertPipes.forEach(startPipe => {
        if (visited.has(startPipe.id)) return;
        const group = [];
        const queue = [startPipe];
        visited.add(startPipe.id);
        while (queue.length > 0) {
            const curr = queue.shift();
            group.push(curr);
            const currHat = hatMap.get(curr.id);
            vertPipes.forEach(other => {
                if (visited.has(other.id)) return;
                if (hatMap.get(other.id) !== currHat) return;
                if (
                    (Math.abs(curr.p1.x - other.p1.x) < 1 && Math.abs(curr.p1.y - other.p1.y) < 1 && Math.abs((curr.p1.z||0) - (other.p1.z||0)) < 1) ||
                    (Math.abs(curr.p1.x - other.p2.x) < 1 && Math.abs(curr.p1.y - other.p2.y) < 1 && Math.abs((curr.p1.z||0) - (other.p2.z||0)) < 1) ||
                    (Math.abs(curr.p2.x - other.p1.x) < 1 && Math.abs(curr.p2.y - other.p1.y) < 1 && Math.abs((curr.p2.z||0) - (other.p1.z||0)) < 1) ||
                    (Math.abs(curr.p2.x - other.p2.x) < 1 && Math.abs(curr.p2.y - other.p2.y) < 1 && Math.abs((curr.p2.z||0) - (other.p2.z||0)) < 1)
                ) {
                    visited.add(other.id);
                    queue.push(other);
                }
            });
        }
        groups.push(group);
    });

    const infos = [];
    groups.forEach(group => {
        let totalDz = 0, sumIsoX = 0, sumIsoY = 0, validCount = 0;
        group.forEach(pipe => {
            totalDz += Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));
            const proxyP = proxyManager.pipes.find(pp => pp.id === pipe.id);
            if (proxyP && proxyP.p1 && proxyP.p2) {
                const start = toIsometric(proxyP.p1.x, proxyP.p1.y, proxyP.p1.z || 0);
                const end = toIsometric(proxyP.p2.x, proxyP.p2.y, proxyP.p2.z || 0);
                sumIsoX += (start.isoX + end.isoX) / 2;
                sumIsoY += (start.isoY + end.isoY) / 2;
                validCount++;
            }
        });
        if (validCount === 0 || totalDz < 1.0) return;
        const midX = sumIsoX / validCount;
        const midY = sumIsoY / validCount;
        const repId = group[0].id;
        const hText = `${(totalDz / 100).toFixed(2)}m`;
        infos.push({ repId, midX, midY, hText });
    });
    return infos;
}

function drawVerticalPipeLabelsIso(ctx, proxyManager) {
    const isLightMode = document.body.classList.contains('light-mode');
    const textColor = isLightMode ? 'rgba(20,20,20,0.85)' : 'rgba(225,230,240,0.85)';

    // İnce ve küçük: weight 300, 9px
    ctx.font = '300 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const infos = _computeVerticalPipeLabelInfos(proxyManager);

    infos.forEach(({ repId, midX, midY, hText }) => {

        const tw = ctx.measureText(hText).width;
        // Tıklama için biraz şişirilmiş bbox (görsel font küçük kalır, hit kolay)
        const boxW = tw + 10;
        const boxH = 14;

        // Stored offset (dax/day) ax/ay formatında saklanır + style ile birlikte.
        let bx = midX + 6;
        let by = midY - boxH / 2;
        let style = 'left-center';

        const stored = state.isoLabelOffsets?.[`vert_${repId}`];
        if (stored && stored.style) style = stored.style;
        if (stored && stored.dax != null) {
            const ax = midX + stored.dax;
            const ay = midY + stored.day;
            bx = style === 'top-center' ? ax - boxW / 2 : ax;
            by = style === 'top-center' ? ay : ay - boxH / 2;
        } else if (stored && stored.dir != null) {
            const gap = 12;
            switch(stored.dir) {
                case 0: bx = midX - boxW / 2; by = midY - gap - boxH; break;
                case 1: bx = midX + gap; by = midY - boxH/2; break;
                case 2: bx = midX - boxW / 2; by = midY + gap; break;
                case 3: bx = midX - gap - boxW; by = midY - boxH/2; break;
            }
        }

        _isoLabelBBoxes.push({
            id: `vert_${repId}`,
            bx: bx,
            by: by,
            bw: boxW,
            bh: boxH,
            style,
            cx: midX,
            cy: midY
        });
        
        ctx.save();
        ctx.fillStyle = textColor;
        ctx.fillText(hText, bx + 3, by + boxH/2);
        ctx.restore();
    });
}

function _isoRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
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

function drawPipeLabelsIso(ctx, proxyManager) {
    const T = _isoLabelTheme();
    // Kat planı stili: küçük no hücresinde sol kenarda kalın accent çubuk + ince ayraç + info hücresi.
    const numFontSize = 12; const fontSize = 9; const pad = 3;
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
        let chosen = pipes[0]; let maxProxyLen = 0; let totalLen = 0;
        
        // BORU UZUNLUKLARI ORİJİNAL (GERÇEK) DEĞERLER ÜZERİNDEN HESAPLANIR
        pipes.forEach(p => {
            if (!p.p1 || !p.p2) return;
            const origPipe = plumbingManager.pipes.find(op => op.id === p.id);
            if (origPipe && origPipe.p1 && origPipe.p2) {
                const realLen = Math.hypot(origPipe.p2.x - origPipe.p1.x, origPipe.p2.y - origPipe.p1.y, (origPipe.p2.z || 0) - (origPipe.p1.z || 0));
                totalLen += realLen;
            }
            
            // Etiketi en uzun çizilen hatta bağlamak için Proxy boyunu referans alırız
            const proxyLen = Math.hypot(p.p2.x - p.p1.x, p.p2.y - p.p1.y, (p.p2.z || 0) - (p.p1.z || 0));
            if (proxyLen > maxProxyLen) { maxProxyLen = proxyLen; chosen = p; }
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

        const isLight = document.body.classList.contains('light-mode');
        const isHigh = hatNo >= 300;
        const hatColor = isHigh ? '#8d2121' : T.accentColor;
        const accentBar = isHigh
            ? (isLight ? 'rgba(141,33,33,0.55)' : 'rgba(220,90,90,0.55)')
            : (isLight ? 'rgba(29,78,216,0.55)' : 'rgba(96,165,250,0.55)');
        const bgColor = isLight ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,35,0.12)';
        const borderColor = isLight ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.20)';
        const sepColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)';

        ctx.save();
        ctx.font = `bold ${numFontSize}px "Segoe UI",sans-serif`;
        const numW = ctx.measureText(String(hatNo)).width;
        ctx.font = `${fontSize}px "Segoe UI",sans-serif`;
        let maxInfoW = 0;
        infoLines.forEach(l => { maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width); });

        const barW = 3;                                 // sol kenardaki kalın accent çubuk
        const numCellW = barW + pad + numW + pad;       // bar + sol pad + sayı + sağ pad
        const infoLineH = fontSize * 1.45;
        const infoCellW = infoLines.length > 0 ? pad + maxInfoW + pad : 0;
        const numCellH = numFontSize + pad * 1.6;
        const infoCellH = infoLines.length > 0 ? infoLines.length * infoLineH + pad * 0.8 : 0;

        const boxW = numCellW + (infoCellW > 0 ? 1 + infoCellW : 0);
        const boxH = Math.max(numCellH, infoCellH, numFontSize + pad * 2);
        const r = 2.5;

        const stored = state.isoLabelOffsets?.[chosen.id];
        let ax = midX + 20, ay = midY, style = 'left-center';
        if (stored && stored.style != null) style = stored.style;
        if (stored && stored.dax != null) { ax = midX + stored.dax; ay = midY + stored.day; }

        let bx = style === 'top-center' ? ax - boxW / 2 : ax;
        let by = style === 'top-center' ? ay : ay - boxH / 2;
        _isoLabelBBoxes.push({ id: chosen.id, bx, by, bw: boxW, bh: boxH, style, cx: midX, cy: midY });

        // LEADER — kutu kenarına kadar
        const cxBox = bx + boxW / 2; const cyBox = by + boxH / 2;
        const ddx = cxBox - midX, ddy = cyBox - midY; const ddist = Math.hypot(ddx, ddy);
        if (ddist > 0.1) {
            const ux = ddx / ddist, uy = ddy / ddist;
            const tLab = Math.min(
                Math.abs(ux) > 1e-3 ? (boxW / 2) / Math.abs(ux) : Infinity,
                Math.abs(uy) > 1e-3 ? (boxH / 2) / Math.abs(uy) : Infinity
            );
            ctx.strokeStyle = T.connColor; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(cxBox - ux * tLab, cyBox - uy * tLab); ctx.stroke();
        }

        // ARKA PLAN — hafif yuvarlatılmış, neredeyse şeffaf
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        _isoRoundRect(ctx, bx, by, boxW, boxH, r);
        ctx.fill();
        ctx.stroke();

        // SOL KENAR KALIN ACCENT ÇUBUĞU
        ctx.strokeStyle = accentBar;
        ctx.lineWidth = barW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + barW / 2 + 0.5, by + r);
        ctx.lineTo(bx + barW / 2 + 0.5, by + boxH - r);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // İNCE AYRAÇ — num cell ile info cell arası
        if (infoCellW > 0) {
            ctx.strokeStyle = sepColor;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(bx + numCellW, by + pad * 0.6);
            ctx.lineTo(bx + numCellW, by + boxH - pad * 0.6);
            ctx.stroke();
        }

        // HAT NUMARASI — bold, accent renkte
        ctx.font = `bold ${numFontSize}px "Segoe UI",sans-serif`;
        ctx.fillStyle = hatColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(hatNo), bx + barW + pad + numW / 2, by + boxH / 2);

        // INFO SATIRLARI
        if (infoLines.length > 0) {
            ctx.font = `${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = T.subColor;
            ctx.textAlign = 'left';
            const totalInfoH = infoLines.length * infoLineH;
            let ty = by + (boxH - totalInfoH) / 2 + infoLineH * 0.72;
            infoLines.forEach(l => { ctx.fillText(l, bx + numCellW + 1 + pad, ty); ty += infoLineH; });
        }
        ctx.restore();
    });
}


// ─── İZO ETİKET ETKİLEŞİM API'LERİ VE YENİDEN YERLEŞTİRME ─────────────────────

export function hitTestIsoLabel(wx, wy) {
    // Birden çok etiket çakışırsa en KÜÇÜK kutuyu tercih et — h-etiketi gibi
    // küçük öğeler komşu büyük etiket altında kalıp tıklanamıyordu.
    let best = null; let bestArea = Infinity;
    for (let i = _isoLabelBBoxes.length - 1; i >= 0; i--) {
        const bb = _isoLabelBBoxes[i];
        if (wx >= bb.bx && wx <= bb.bx + bb.bw && wy >= bb.by && wy <= bb.by + bb.bh) {
            const area = bb.bw * bb.bh;
            if (area < bestArea) { bestArea = area; best = bb; }
        }
    }
    return best ? { id: best.id, style: best.style, bx: best.bx, by: best.by, bw: best.bw, bh: best.bh, cx: best.cx, cy: best.cy } : null;
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

// Yerleştirme sırası: h (vert) önce → boru çapı → vana → diğer bağlantı parçaları → sayaç/kutu → cihaz/baca
const ISO_PRIORITY = { vert: 0, boru: 1, vana: 2, regulator: 3, filtre: 3, izolasyon_flansi: 3, kompansator: 3, manometre: 3, topraklama: 3, sayac: 4, servis_kutusu: 4, cihaz: 5, baca: 5 };
const ISO_CLIP_BY_TYPE = { sayac: 24, cihaz: 24, servis_kutusu: 20, vana: 10, regulator: 10, filtre: 10, izolasyon_flansi: 10, kompansator: 10, manometre: 10, topraklama: 10, boru: 8 };
const ISO_DEFAULT_STYLE_BY_TYPE = { sayac: 'top-center', cihaz: 'top-center', servis_kutusu: 'top-center', vana: 'left-center', regulator: 'left-center', filtre: 'left-center', manometre: 'left-center', topraklama: 'left-center', boru: 'left-center' };

let _isoMeasureCtx = null;
function _getIsoMeasureCtx() { if (!_isoMeasureCtx) { const c = document.createElement('canvas'); _isoMeasureCtx = c.getContext('2d'); } return _isoMeasureCtx; }
function _isoMeasureLines(lines) {
    const ctx = _getIsoMeasureCtx(); let maxW = 0; let count = 0;
    lines.forEach(l => { if (!l?.text) return; count++; ctx.font = `${l.bold ? 'bold ' : ''}11px sans-serif`; maxW = Math.max(maxW, ctx.measureText(l.text).width); });
    return count === 0 ? { bw: 0, bh: 0 } : { bw: maxW + 12, bh: count * 16.5 + 5 };
}
// drawPipeLabelsIso (kat planı stili) ile birebir — bar(3) + pad + num(bold 12) + pad + sep + pad + info(9) + pad.
function _isoMeasureHatLabel(hatNo, infoLines) {
    const ctx = _getIsoMeasureCtx();
    const numFontSize = 12, fontSize = 9, pad = 3, barW = 3;
    ctx.font = `bold ${numFontSize}px sans-serif`;
    const numW = ctx.measureText(String(hatNo)).width;
    ctx.font = `${fontSize}px sans-serif`;
    let maxInfoW = 0;
    infoLines.forEach(t => { maxInfoW = Math.max(maxInfoW, ctx.measureText(t).width); });
    const numCellW = barW + pad + numW + pad;
    const infoCellW = infoLines.length > 0 ? pad + maxInfoW + pad : 0;
    const bw = numCellW + (infoCellW > 0 ? 1 + infoCellW : 0);
    const bh = Math.max(numFontSize + pad * 2, infoLines.length * (fontSize * 1.45) + pad * 0.8);
    return { bw, bh };
}

function _collectIsoLabelCandidates(proxyManager) {
    const cands = [];
    for (const comp of proxyManager.components) {
        if (typeof comp.x !== 'number' || typeof comp.y !== 'number') continue;
        let lines = comp.type === 'sayac' ? _buildSayacLinesIso(comp) : comp.type === 'cihaz' ? _buildCihazLinesIso(comp) : comp.type === 'servis_kutusu' ? _buildKutuLinesIso(comp) : comp.type === 'vana' ? _buildVanaLinesIso(comp) : comp.type === 'regulator' ? _buildRegulatorLinesIso(comp) : ['filtre', 'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama'].includes(comp.type) ? _buildFittingLinesIso(comp) : null;
        if (!lines) continue;
        const sz = _isoMeasureLines(lines); if (sz.bw === 0) continue;
        const anchor = _resolveIsoCompAnchor(comp, proxyManager);
        const pos = toIsometric(anchor.x, anchor.y, anchor.z);
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

    // Dikey boru h-etiketleri (h: yükseklik) — küçük kutu ama layout'a girsin ki çarpışmasınlar
    const measure = _getIsoMeasureCtx();
    measure.font = '300 9px sans-serif';
    _computeVerticalPipeLabelInfos(proxyManager).forEach(({ repId, midX, midY, hText }) => {
        const tw = measure.measureText(hText).width;
        const bw = tw + 10; const bh = 14;
        cands.push({
            kind: 'vert', id: `vert_${repId}`, type: 'vert',
            anchorX: midX, anchorY: midY,
            clip: 6, defaultStyle: 'left-center',
            bw, bh,
            priority: ISO_PRIORITY.vert, obj: null
        });
    });
    return cands;
}

function _buildIsoObstacleRects(proxyManager) {
    return proxyManager.components.filter(c => typeof c.x === 'number').map(comp => {
        const anchor = _resolveIsoCompAnchor(comp, proxyManager);
        const pos = toIsometric(anchor.x, anchor.y, anchor.z);
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
    const out = [];
    // 12 yönlü dengeli dairesel tarama
    for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * 2 * Math.PI;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        
        // Ekranda dikey doğrultuya yakınsa üst/alt, yatay doğrultudaysa yan hizalama stili seç
        const style = Math.abs(ux) < 0.3 ? 'top-center' : 'left-center';
        out.push({
            ax: c.anchorX + ux * radius - (style === 'left-center' ? c.bw / 2 : 0),
            ay: c.anchorY + uy * radius - (style === 'top-center' ? c.bh / 2 : 0),
            style, ux, uy
        });
    }
    return out;
}

// İki segment kesişiyor mu (uç noktalar dahil)
function _segSegIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-9) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// drawIsometricComponentLabels noLeader=true ile çizmediği için skorlamada da yok sayılmalı.
function _visibleLeaderSeg(c, box) {
    // Leader çizmeyen tipler: sayaç, servis kutusu, regülatör (drawIsometricComponentLabels noLeader=true),
    // ve dikey boru h-etiketi (drawVerticalPipeLabelsIso leader çizmiyor).
    if (c.type === 'sayac' || c.type === 'servis_kutusu' || c.type === 'regulator' || c.type === 'vert') return null;

    const cx0 = c.anchorX, cy0 = c.anchorY;
    const lx = box.bx + box.bw / 2, ly = box.by + box.bh / 2;
    const dx = lx - cx0, dy = ly - cy0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.1) return null;

    const ux = dx / dist, uy = dy / dist;
    const tObj = c.clip || 0;
    const tLab = Math.min(
        Math.abs(ux) > 1e-3 ? (box.bw / 2) / Math.abs(ux) : Infinity,
        Math.abs(uy) > 1e-3 ? (box.bh / 2) / Math.abs(uy) : Infinity
    );

    if (tObj + tLab + 1 >= dist) return null;
    return { x1: cx0 + ux * tObj, y1: cy0 + uy * tObj, x2: lx - ux * tLab, y2: ly - uy * tLab };
}

function _scorePlacement(c, box, obstacles, placedLabels, placedLeaders, pipeSegs) {
    const PAD = 4;
    const expBox = { bx: box.bx - PAD, by: box.by - PAD, bw: box.bw + 2 * PAD, bh: box.bh + 2 * PAD };
    let pen = 0;

    // Muafiyet kimlik haritası
    const myIds = new Set([c.id]);
    if (c.obj) {
        if (c.obj.id) myIds.add(c.obj.id);
        if (c.obj.bagliBoruId) myIds.add(c.obj.bagliBoruId);
        if (c.obj.cikisBagliBoruId) myIds.add(c.obj.cikisBagliBoruId);
        if (c.obj.fleksBaglanti?.boruId) myIds.add(c.obj.fleksBaglanti.boruId);
    }

    const boxCx = box.bx + box.bw / 2;
    const boxCy = box.by + box.bh / 2;

    // 1. Nesne Gövdeleriyle Çakışma ve Yakınlık Alanı Yoğunluk Kontrolü
    for (const o of obstacles) {
        if (o.id === c.id + '_body' || myIds.has(o.id.replace('_body', ''))) continue;

        const ov = _rectOverlapArea(box, o);
        if (ov > 0) {
            pen += 10000 + ov * 20;
        } else if (_rectOverlapArea(expBox, o) > 0) {
            pen += 1500;
        }

        // [BORU ÇÖZÜMÜ]: Karmaşa Yakınlık Cezası (Etiketi boş alanlara doğru sürükler)
        const oCx = o.bx + o.bw / 2;
        const oCy = o.by + o.bh / 2;
        const d = Math.hypot(boxCx - oCx, boxCy - oCy);
        if (d < 75) {
            pen += (75 - d) * 10; // Düğüm noktasına yaklaştıkça ceza katlanarak artar
        }
    }

    // 2. Diğer Etiketlerle Çakışma
    for (const p of placedLabels) {
        if (p.id === c.id) continue;
        const ov = _rectOverlapArea(box, p);
        if (ov > 0) {
            pen += 15000 + ov * 30;
        } else if (_rectOverlapArea(expBox, p) > 0) {
            pen += 2000;
        }
        
        const pCx = p.bx + p.bw / 2;
        const pCy = p.by + p.bh / 2;
        const d = Math.hypot(boxCx - pCx, boxCy - pCy);
        if (d < 50) pen += (50 - d) * 5;
    }

    // 3. Boru Çizgileriyle Kesişim Kontrolü
    for (const s of pipeSegs) {
        const isOwnPipe = myIds.has(s.pipeId);
        if (_segRectIntersects(s.x1, s.y1, s.x2, s.y2, box.bx, box.by, box.bw, box.bh)) {
            pen += isOwnPipe ? 100 : 4000; // Yabancı boru üstüne biniyorsa ağır ceza
        } else if (_segRectIntersects(s.x1, s.y1, s.x2, s.y2, expBox.bx, expBox.by, expBox.bw, expBox.bh)) {
            pen += isOwnPipe ? 10 : 400;
        }
    }

    // 4. Bağlantı Çizgileri Kesişimi
    const vis = _visibleLeaderSeg(c, box);
    if (vis) {
        for (const s of pipeSegs) {
            if (!myIds.has(s.pipeId) && _segSegIntersect(vis.x1, vis.y1, vis.x2, vis.y2, s.x1, s.y1, s.x2, s.y2)) {
                pen += 600;
            }
        }
        for (const pl of placedLeaders) {
            if (pl && _segSegIntersect(vis.x1, vis.y1, vis.x2, vis.y2, pl.x1, pl.y1, pl.x2, pl.y2)) {
                pen += 3000;
            }
        }
    }

    return pen;
}

function _isSpotCompletelyClean(c, box, obstacles, placedLabels, placedLeaders, pipeSegs) {
    return _scorePlacement(c, box, obstacles, placedLabels, placedLeaders, pipeSegs) === 0;
}

function _tryPlaceLabelsStrict(cands, obstacles, pipeSegs) {
    cands.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.anchorX - b.anchorX;
    });

    const placed = [];
    const placedLeaders = [];

    for (const c of cands) {
        let bestBox = null;
        let bestLeader = null;
        let minTotalScore = Infinity;

        // [SAYAÇ ÇÖZÜMÜ]: Lider çizgisi olmayan (sayaç, kutu vb.) etiketlerin uzağa kaçmasını fiziksel olarak engelle
        const isNoLeader = ['sayac', 'servis_kutusu', 'regulator', 'vert'].includes(c.type) || c.kind === 'vert';
        const baseR = c.clip + (isNoLeader ? 8 : 12);
        const maxR = isNoLeader ? (c.clip + 35) : 140; // Sayaçlar en fazla 40-50px uzağa gidebilir, borular 140px

        // Yarıçapları küçükten büyüğe doğru tara
        for (let r = baseR; r <= maxR; r += 8) {
            const positions = _positionsAtRadius(c, r + Math.max(c.bw, c.bh) / 2);
            let bestAtThisRadius = null;
            let minScoreAtThisRadius = Infinity;
            let bestLeaderAtThisRadius = null;

            // [BORU ÇÖZÜMÜ]: Erken break kaldırıldı! Bu yarıçaptaki TÜM açılar elenir, en temiz yön seçilir.
            for (const pos of positions) {
                const box = _bboxFromStyle(pos.ax, pos.ay, c.bw, c.bh, pos.style);
                const score = _scorePlacement(c, box, obstacles, placed, placedLeaders, pipeSegs);
                
                if (score < minScoreAtThisRadius) {
                    minScoreAtThisRadius = score;
                    bestAtThisRadius = { bx: box.bx, by: box.by, style: pos.style };
                    bestLeaderAtThisRadius = _visibleLeaderSeg(c, box);
                }
            }

            // Merkezden uzaklaştıkça artan mesafe cezası uygula
            // Lider çizgisi olmayan etiketlerde uzağa gitme cezası çok daha ağırdır
            const distPenalty = r * (isNoLeader ? 20 : 2.0);
            const totalScore = minScoreAtThisRadius + distPenalty;

            if (totalScore < minTotalScore) {
                minTotalScore = totalScore;
                bestBox = bestAtThisRadius;
                bestLeader = bestLeaderAtThisRadius;
            }

            // Eğer bu yarıçapta zaten kusursuz (0 ceza) ve yakın bir yer bulduysak aramayı bitirebiliriz
            if (minScoreAtThisRadius === 0 && r < baseR + 20) {
                break;
            }
        }

        if (bestBox) {
            c.bx = bestBox.bx; c.by = bestBox.by; c.style = bestBox.style;
            placed.push(c);
            placedLeaders.push(bestLeader);
        } else {
            // Tamamen sıkışma durumunda güvenli fallback (İzometrik 30° aksında öteleme)
            const fallbackAng = Math.PI / 6;
            c.bx = c.anchorX + Math.cos(fallbackAng) * baseR;
            c.by = c.anchorY + Math.sin(fallbackAng) * baseR - c.bh / 2;
            c.style = 'left-center';
            placed.push(c);
            placedLeaders.push(_visibleLeaderSeg(c, _bboxFromStyle(c.bx, c.by, c.bw, c.bh, c.style)));
        }
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
export function drawIsometricPipes(ctx) { }
export function drawIsometricComponents(ctx) { }
export function angleToIsometric(angle) {
    angle = ((angle % 360) + 360) % 360;
    if (angle >= 0 && angle < 45) return 0;
    else if (angle >= 45 && angle < 135) return 45;
    else if (angle >= 135 && angle < 225) return 180;
    else return -45;
}