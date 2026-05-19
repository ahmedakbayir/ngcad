/**
 * scene-isometric.js
 * İzometrik görünüm renderer'ı - sadece tesisat elemanlarını gösterir
 */

import { state } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { VANA_TIPLERI } from '../plumbing_v2/objects/valve.js';
import { CIHAZ_TIPLERI } from '../plumbing_v2/objects/device.js';
import { FITTING_DEFS } from '../plumbing_v2/objects/pipe-fitting.js';
import { computeHatGroups, getCizelge6Debi } from '../plumbing_v2/renderer/renderer-utils.js';

// ─── On-pipe komponentin boru üzerindeki konum yüzdesini (0..1) hesaplar ─────
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

// ─── Bir boru ucunun iso konumunu (offset ile birlikte) döndürür ─────────────
function _pipeEndpointIso(pipe, endpoint /* 'start' | 'end' */) {
    if (!pipe) return null;
    const p = endpoint === 'end' ? pipe.p2 : pipe.p1;
    if (!p) return null;
    const pos = toIsometric(p.x, p.y, p.z || 0);
    const off = state.isoPipeOffsets?.[pipe.id] || {};
    if (endpoint === 'end') {
        pos.isoX += off.endDx || 0; pos.isoY += off.endDy || 0;
    } else {
        pos.isoX += off.startDx || 0; pos.isoY += off.startDy || 0;
    }
    return pos;
}

// ─── Komponentin iso ekran konumu ────────────────────────────────────────────
// Sayaç/cihaz/kutu: kendi boru ucuna ANCHOR — boru hareket ettikçe doğal takip.
// On-pipe (vana/regulator/fittings): boru üzerinde fraction'a göre yerleşir.
// Baca + serbest: kendi world coord'u + isoComponentOffsets.
function getComponentIsoPos(component) {
    const onPipe = ['vana', 'regulator', 'filtre', 'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama'];
    const isOnPipe = onPipe.includes(component.type) && component.bagliBoruId;
    let pos = null;
    let anchoredToPipe = false;

    if (isOnPipe && plumbingManager) {
        const pipe = plumbingManager.findPipeById(component.bagliBoruId);
        if (pipe && pipe.p1 && pipe.p2) {
            const t = getComponentPipeFraction(component, pipe);
            const a = _pipeEndpointIso(pipe, 'start');
            const b = _pipeEndpointIso(pipe, 'end');
            if (a && b) {
                pos = { isoX: a.isoX + (b.isoX - a.isoX) * t, isoY: a.isoY + (b.isoY - a.isoY) * t };
                anchoredToPipe = true;
            }
        }
    } else if (component.type === 'sayac' && plumbingManager) {
        // Sayaç → inlet ve outlet boru uçlarının ORTASI (gövde her iki tarafı kapsar)
        const inletPipe = component.fleksBaglanti?.boruId
            ? plumbingManager.findPipeById(component.fleksBaglanti.boruId) : null;
        const outletPipe = component.cikisBagliBoruId
            ? plumbingManager.findPipeById(component.cikisBagliBoruId) : null;
        const inletEp = component.fleksBaglanti?.endpoint === 'p2' ? 'end' : 'start';
        const a = inletPipe ? _pipeEndpointIso(inletPipe, inletEp) : null;
        const b = outletPipe ? _pipeEndpointIso(outletPipe, 'start') : null;
        if (a && b) {
            pos = { isoX: (a.isoX + b.isoX) / 2, isoY: (a.isoY + b.isoY) / 2 };
            anchoredToPipe = true;
        } else if (a) {
            pos = a; anchoredToPipe = true;
        } else if (b) {
            pos = b; anchoredToPipe = true;
        }
    } else if (component.type === 'cihaz'
            && component.fleksBaglanti?.boruId && plumbingManager) {
        // Cihaz → inlet (fleks) boru ucuna anchor — hat sonunda görünür
        const pipe = plumbingManager.findPipeById(component.fleksBaglanti.boruId);
        if (pipe) {
            const ep = component.fleksBaglanti.endpoint === 'p2' ? 'end' : 'start';
            pos = _pipeEndpointIso(pipe, ep);
            if (pos) anchoredToPipe = true;
        }
    } else if (component.type === 'servis_kutusu' && component.bagliBoruId && plumbingManager) {
        // SK → outlet borusu p1'e anchor (outlet pipe SK'dan çıkar)
        const pipe = plumbingManager.findPipeById(component.bagliBoruId);
        if (pipe) {
            pos = _pipeEndpointIso(pipe, 'start');
            if (pos) anchoredToPipe = true;
        }
    }

    if (!pos) {
        pos = toIsometric(component.x, component.y, component.z || 0);
    }

    // Boruya anchor'lı değilse kullanıcı sürükleme offset'i uygulanır (baca/standalone)
    if (!anchoredToPipe) {
        const cOff = state.isoComponentOffsets?.[component.id];
        if (cOff) {
            pos.isoX += cOff.dx || 0;
            pos.isoY += cOff.dy || 0;
        }
    }
    return pos;
}

/**
 * 2D düzlem koordinatlarını izometrik koordinatlara dönüştürür
 * @param {number} x - Düzlem X koordinatı (cm)
 * @param {number} y - Düzlem Y koordinatı (cm)
 * @param {number} z - Z koordinatı (yükseklik, cm)
 * @returns {{isoX: number, isoY: number}}
 */
export function toIsometric(x, y, z = 0) {
    // İzometrik projeksiyon formülü
    // X ekseni: sağa doğru (0°)
    // Y ekseni: yukarı-sağa doğru (30°)
    // Z ekseni: dikey yukarı

    const angle = Math.PI / 6; // 30 derece

    // İzometrik X: orijinal X eksenini koruyoruz (sağa-sola hareketi temsil eder)
    // İzometrik Y: Y eksenini 30 derece açıyla yukarı çıkarıyoruz (ileri-geri hareketi temsil eder)
    // const isoX = x - y * Math.cos(angle);
    // const isoY = -z + y * Math.sin(angle);
    const isoX = (x + y) * Math.cos(angle);
    const isoY = (y - x) * Math.sin(angle) - z;
    return { isoX, isoY };
}

/**
 * Açıyı (derece) izometrik render için uygun açıya dönüştürür
 * @param {number} angle - Açı (derece, 0-360)
 * @returns {number} İzometrik açı (derece)
 */
export function angleToIsometric(angle) {
    // Açıyı 0-360 aralığına normalize et
    angle = ((angle % 360) + 360) % 360;

    // Sağa-sola (0 veya 180): Yatay (izometrik 0° veya 180°)
    // İleri (90): 45 derece yukarı-sağa
    // Geri (270): 45 derece yukarı-sola (veya -45 derece)

    if (angle >= 0 && angle < 45) {
        // Sağa (0°): yatay sağa
        return 0;
    } else if (angle >= 45 && angle < 135) {
        // İleri (90°): 45 derece
        return 45;
    } else if (angle >= 135 && angle < 225) {
        // Sola (180°): yatay sola
        return 180;
    } else {
        // Geri (270°): -45 derece (veya 315 derece)
        return -45;
    }
}

/**
 * İki nokta arasındaki mesafeyi hesaplar
 */
function distance(p1, p2) {
    // Dikey hatların (Z ekseni farkı) algılanabilmesi için Z farkı da hesaba katılmalı
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
}

/**
 * Borular arasında parent-child ilişkisini kurar ve etiketler
 * @returns {Map} pipe.id -> { label, parent, children }
 */
function buildPipeHierarchy() {
    if (!plumbingManager || !plumbingManager.pipes || !plumbingManager.components) {
        return new Map();
    }

    const pipes = plumbingManager.pipes;
    const components = plumbingManager.components;
    const hierarchy = new Map();
    const TOLERANCE = 15; // cm cinsinden mesafe toleransı (plumbing-renderer ile tutarlı)

    // Kaynak bileşeni bul (Servis Kutusu veya Sayaç)
    const sourceComponent = components.find(c =>
        c.type === 'servis_kutusu' || c.type === 'sayac'
    );

    if (!sourceComponent || pipes.length === 0) {
        return new Map();
    }

    // Kaynağa bağlı ilk boruyu bul
    let sourcePos = { x: sourceComponent.x, y: sourceComponent.y };
    let rootPipes = pipes.filter(pipe =>
        distance(pipe.p1, sourcePos) < TOLERANCE ||
        distance(pipe.p2, sourcePos) < TOLERANCE
    );

    if (rootPipes.length === 0) {
        // Kaynak yoksa, en soldaki/üstteki borudan başla
        const sortedPipes = [...pipes].sort((a, b) => {
            const aMin = Math.min(a.p1.x, a.p2.x) + Math.min(a.p1.y, a.p2.y);
            const bMin = Math.min(b.p1.x, b.p2.x) + Math.min(b.p1.y, b.p2.y);
            return aMin - bMin;
        });
        rootPipes = [sortedPipes[0]];
        // Kaynak olmadığında root pipe'ın p1'ini kaynak olarak kabul et
        sourcePos = rootPipes[0].p1;
    }

    // BFS ile tüm boruları etiketle
    const visited = new Set();
    const queue = []; // { pipe, exitPoint } - çıkış noktası ile birlikte
    let labelIndex = 0;

    // Root pipe'ları başlat (kaynaktan çıkan borular parent'sız)
    rootPipes.forEach(rootPipe => {
        const label = String.fromCharCode(65 + labelIndex++); // A, B, C...
        hierarchy.set(rootPipe.id, {
            label: label,
            parent: null,
            children: []
        });

        // Kaynağa hangi ucu bağlı? Diğer ucu çıkış noktası olarak kullan
        const p1DistToSource = distance(rootPipe.p1, sourcePos);
        const p2DistToSource = distance(rootPipe.p2, sourcePos);
        const exitPoint = p1DistToSource < p2DistToSource ? rootPipe.p2 : rootPipe.p1;

        queue.push({ pipe: rootPipe, exitPoint });
        visited.add(rootPipe.id);
    });

    // BFS ile devam et
    while (queue.length > 0) {
        const { pipe: currentPipe, exitPoint: currentExitPoint } = queue.shift();
        const currentData = hierarchy.get(currentPipe.id);

        // Sadece çıkış noktasından bağlı boruları bul
        pipes.forEach(otherPipe => {
            if (visited.has(otherPipe.id)) return;

            // otherPipe'ın hangi ucu currentExitPoint'e bağlı?
            const p1Connected = distance(currentExitPoint, otherPipe.p1) < TOLERANCE;
            const p2Connected = distance(currentExitPoint, otherPipe.p2) < TOLERANCE;

            if (p1Connected || p2Connected) {
                // Yeni etiket ata
                const newLabel = String.fromCharCode(65 + labelIndex++);
                hierarchy.set(otherPipe.id, {
                    label: newLabel,
                    parent: currentData.label,
                    children: []
                });

                // Parent'ın children listesine ekle
                currentData.children.push(newLabel);

                // otherPipe'ın çıkış noktası = bağlantı noktasının karşısı
                const newExitPoint = p1Connected ? otherPipe.p2 : otherPipe.p1;

                visited.add(otherPipe.id);
                queue.push({ pipe: otherPipe, exitPoint: newExitPoint });
            }
        });
    }

    return hierarchy;
}

/**
 * İzometrik görünümü çizer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} canvasWidth - Canvas genişliği
 * @param {number} canvasHeight - Canvas yüksekliği
 * @param {number} zoom - Zoom seviyesi
 * @param {{x: number, y: number}} offset - Pan offset
 */
export function renderIsometric(ctx, canvasWidth, canvasHeight, zoom = 1, offset = { x: 0, y: 0 }) {
    if (!plumbingManager) return;

    // Canvas'ı temizle
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Arkaplan rengi
    const bgColor = document.body.classList.contains('light-mode') ? '#e6e7e7' : '#30302e';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Ortalama (viewport merkezi)
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Parent-child ilişkisini kur
    const pipeHierarchy = buildPipeHierarchy();
    window._isoPipeHierarchy = pipeHierarchy; // Global olarak sakla

    // Global değişkenleri sakla (mouse hit detection ve sürükleme için)
    window._isoRenderParams = { centerX, centerY, zoom, offset };
    window._toIsometric = toIsometric; // toIsometric fonksiyonunu global olarak sakla

    // Tesisat bileşenlerini çiz
    ctx.save();

    // Transform: screen = (world * zoom) + center + offset
    ctx.translate(centerX + offset.x, centerY + offset.y);
    ctx.scale(zoom, zoom);

    // Frame başı — etiket bbox cache'i temizle
    startIsoLabelFrame();

    // Boruları çiz
    drawIsometricPipes(ctx);

    // Bileşenleri çiz (etiketleri de yazar)
    drawIsometricComponents(ctx);

    // Hat (boru) etiketlerini çiz — projedeki gibi hat no + debi + uzunluk + cap
    drawPipeLabelsIso(ctx);

    // Eski "Parent:Self:[Children]" gösterimi — kullanıcı isteyince
    if (state.tempVisibility.showPipeLabels) {
        drawPipeLabels(ctx, pipeHierarchy);
    }
    // Z kotlarını çiz (dirsek ve TEE noktalarında)
    if (state.tempVisibility.showZElevation) {
        drawJunctionElevations(ctx);
    }
    ctx.restore();

    // Bilgi metni
    ctx.save();
    ctx.fillStyle = document.body.classList.contains('light-mode') ? '#666' : '#aaa';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    /*
    ctx.fillText('İzometrik Görünüm - Sadece Tesisat', 10, 10);
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, 10, 30);
    ctx.fillText(`Borular: ${plumbingManager.pipes.length}`, 10, 50);
    ctx.fillText(`Bileşenler: ${plumbingManager.components.length}`, 10, 70);
    ctx.fillText('Sol tuş: Boru uçlarını sürükle | Sağ tuş: Pan', 10, 90);
    */
    ctx.restore();
}

/**
 * Mouse pozisyonunda boru ucu var mı kontrol eder
 * @param {number} mouseX - Canvas içindeki X koordinatı
 * @param {number} mouseY - Canvas içindeki Y koordinatı
 * @returns {{pipe: object, type: string} | null}
 */
window.getIsoEndpointAtMouse = function (mouseX, mouseY) {
    if (!window._isoEndpoints || !window._isoRenderParams) return null;

    const { centerX, centerY, zoom, offset } = window._isoRenderParams;

    // Mouse pozisyonunu world koordinatlarına çevir
    const worldX = (mouseX - centerX - offset.x) / zoom;
    const worldY = (mouseY - centerY - offset.y) / zoom;

    // Endpoint'lere yakınlık kontrolü
    const hitRadius = 10 / zoom; // Zoom'a göre ayarlanmış hit radius

    for (const endpoint of window._isoEndpoints) {
        const dx = worldX - endpoint.x;
        const dy = worldY - endpoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < hitRadius) {
            return { pipe: endpoint.pipe, type: endpoint.type };
        }
    }

    return null;
};

// Her render'da endpoint listesini temizle
renderIsometric = ((oldRender) => {
    return function (...args) {
        window._isoEndpoints = [];
        return oldRender.apply(this, args);
    };
})(renderIsometric);

/**
 * Boruları izometrik perspektifte çizer (Z koordinatlarıyla)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
export function drawIsometricPipes(ctx) {
    if (!plumbingManager || !plumbingManager.pipes) return;
    if (!state) return;

    const isLightMode = document.body.classList.contains('light-mode');
    ctx.lineWidth = 3;

    // Düşey boru renkleri
    const greenColor = isLightMode ? '#008000' : '#39ff14'; // Light: Koyu Yeşil, Dark: Neon Yeşil

    plumbingManager.pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;

        // --- DÜŞEYLİK KONTROLÜ ---
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        // 2D mesafesi çok kısa (örn: < 1 cm) VE Z farkı varsa düşeydir
        const isVertical = Math.hypot(dx, dy) < 1.0 && Math.abs(dz) > 1.0; 

        // Boru rengini belirle
        let pipeColor;
        
        if (isVertical) {
            pipeColor = greenColor;
        } else {
            // Yatay borular için standart renkler
            if (pipe.colorGroup === 'YELLOW') {
                pipeColor = isLightMode ? 'rgba(160, 82, 45, 1)' : 'rgba(184, 134, 11, 1)';  // Sienna / Dark Goldenrod
            } else if (pipe.colorGroup === 'TURQUAZ') {
                pipeColor = isLightMode ? 'rgba(0, 100, 204, 1)' : 'rgba(21, 154, 172, 1)';  // Dark Blue / Dodger Blue
            } else {
                pipeColor = isLightMode ? 'rgba(128, 128, 128, 1)' : 'rgba(200, 200, 200, 1)';  // Gray / Light Gray
            }
        }

        ctx.strokeStyle = pipeColor;

        // Offset kontrolü
        const offset = state.isoPipeOffsets[pipe.id] || {};
        const startDx = offset.startDx || 0;
        const startDy = offset.startDy || 0;
        const endDx = offset.endDx || 0;
        const endDy = offset.endDy || 0;

        // Başlangıç ve bitiş noktalarını izometrik koordinatlara dönüştür
        let start = toIsometric(pipe.p1.x, pipe.p1.y, pipe.p1.z || 0);
        let end = toIsometric(pipe.p2.x, pipe.p2.y, pipe.p2.z || 0);

        // Offset uygula
        start.isoX += startDx;
        start.isoY += startDy;
        end.isoX += endDx;
        end.isoY += endDy;

        // Çizgiyi çiz
        ctx.beginPath();
        ctx.moveTo(start.isoX, start.isoY);
        ctx.lineTo(end.isoX, end.isoY);
        ctx.stroke();

        // Uç noktaları çiz (sürüklenebilir)
        ctx.fillStyle = pipeColor;
        ctx.beginPath();
        ctx.arc(start.isoX, start.isoY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(end.isoX, end.isoY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Global endpoint pozisyonlarını sakla (hit detection için)
        if (!window._isoEndpoints) window._isoEndpoints = [];
        window._isoEndpoints.push({ pipe, type: 'start', x: start.isoX, y: start.isoY });
        window._isoEndpoints.push({ pipe, type: 'end', x: end.isoX, y: end.isoY });
    });
}

/**
 * Tesisat bileşenlerini (servis kutusu, sayaç, vana, cihaz) izometrik perspektifte çizer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function drawIsometricComponents(ctx) {
    if (!plumbingManager || !plumbingManager.components) return;

    const FITTING_TYPES = new Set(['filtre', 'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama']);

    plumbingManager.components.forEach((component, index) => {
        if (typeof component.x !== 'number' || typeof component.y !== 'number') return;

        // Z kotunu ve boru iso offset'lerini hesaba kat — nesne hat üzerindeki gerçek
        // yüksekliğinde durup, hat uzatılıp kısaltıldığında onunla birlikte hareket etsin
        const pos = getComponentIsoPos(component);

        // Bileşen tipine göre farklı şekiller çiz
        ctx.save();
        ctx.translate(pos.isoX, pos.isoY);

        // Rotation — vana/regülatör/fitting boru üzerinde olduğundan döndürmeyi
        // bunlar için uygulamıyoruz (eşkenar dörtgen / üçgen / daire simetrik).
        const rotatable = component.type === 'servis_kutusu'
            || component.type === 'cihaz'
            || component.type === 'sayac'
            || component.type === 'baca';
        if (component.rotation && rotatable) {
            const isoAngle = angleToIsometric(component.rotation);
            ctx.rotate((isoAngle * Math.PI) / 180);
        }

        // Bileşen tipine göre çiz
        if (component.type === 'servis_kutusu') {
            drawServisKutusuIso(ctx, component);
        } else if (component.type === 'sayac') {
            drawSayacIso(ctx, component);
        } else if (component.type === 'vana') {
            drawVanaIso(ctx, component);
        } else if (component.type === 'regulator') {
            drawRegulatorIso(ctx, component);
        } else if (component.type === 'cihaz') {
            drawCihazIso(ctx, component);
        } else if (component.type === 'baca') {
            drawBacaIso(ctx, component);
        } else if (FITTING_TYPES.has(component.type)) {
            drawFittingIso(ctx, component);
        } else {
            drawDefaultComponentIso(ctx, component);
        }

        ctx.restore();

        // Etiketi şeklin dışına yaz (rotasyonsuz)
        drawComponentLabelIso(ctx, component, pos);
    });
}

/**
 * Boru etiketlerini çizer (Parent:Self:[Children] formatında)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Map} pipeHierarchy - Boru hierarchy bilgisi
 */
function drawPipeLabels(ctx, pipeHierarchy) {
    if (!plumbingManager || !plumbingManager.pipes || !pipeHierarchy) return;

    const isLightMode = document.body.classList.contains('light-mode');
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    plumbingManager.pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;

        const pipeData = pipeHierarchy.get(pipe.id);
        if (!pipeData) return;

        // Etiket metnini oluştur
        const parent = pipeData.parent || '';
        const self = pipeData.label;
        const children = pipeData.children.length > 0 ? pipeData.children.join(',') : '';

        // Boru ortasını izometrik koordinatlara dönüştür
        const midX = (pipe.p1.x + pipe.p2.x) / 2;
        const midY = (pipe.p1.y + pipe.p2.y) / 2;
        const midZ = ((pipe.p1.z || 0) + (pipe.p2.z || 0)) / 2;
        const mid = toIsometric(midX, midY, midZ);

        // Renkleri ayarla
        const darkBlue = '#00008B';
        const red = '#ff0000';

        // Parent:Self:Children formatında ayrı ayrı çiz
        const parentText = parent + ':';
        const selfText = self;
        const childrenText = ':' + children;

        // Metin genişliklerini hesapla
        const parentWidth = ctx.measureText(parentText).width;
        const selfWidth = ctx.measureText(selfText).width;
        const childrenWidth = ctx.measureText(childrenText).width;
        const totalWidth = parentWidth + selfWidth + childrenWidth;

        // Başlangıç pozisyonu (ortalanmış)
        let currentX = mid.isoX - totalWidth / 2;
        const y = mid.isoY - 15;

        // Parent (dark blue)
        ctx.fillStyle = darkBlue;
        ctx.textAlign = 'left';
        ctx.fillText(parentText, currentX, y);
        currentX += parentWidth;

        // Self (kırmızı)
        ctx.fillStyle = red;
        ctx.fillText(selfText, currentX, y);
        currentX += selfWidth;

        // Children (dark blue)
        ctx.fillStyle = darkBlue;
        ctx.fillText(childrenText, currentX, y);
    });
}

/**
 * Dirsek ve TEE noktalarında Z kotlarını çizer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function drawJunctionElevations(ctx) {
    if (!plumbingManager || !plumbingManager.pipes) return;

    const pipes = plumbingManager.pipes;
    const TOLERANCE = 3; // cm cinsinden mesafe toleransı
    const processedJunctions = new Set(); // İşlenmiş junction'ları takip et

    const isLightMode = document.body.classList.contains('light-mode');
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLightMode ? '#000' : '#fff';

    // Her boru için uç noktaları kontrol et
    pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;

        // Her iki uç noktayı kontrol et (endpoint: 'p1' veya 'p2')
        ['p1', 'p2'].forEach(endpoint => {
            const point = pipe[endpoint];
            const z = point.z || 0;

            // Z değeri 0 ise gösterme (zemin seviyesi)
            if (Math.abs(z) < 0.1) return;

            // Bu noktayı benzersiz bir şekilde tanımla
            const junctionKey = `${point.x.toFixed(1)},${point.y.toFixed(1)},${z.toFixed(1)}`;

            // Zaten işlenmiş mi?
            if (processedJunctions.has(junctionKey)) return;

            // Bu noktada kaç boru birleşiyor?
            let connectionCount = 0;
            pipes.forEach(otherPipe => {
                if (!otherPipe.p1 || !otherPipe.p2) return;

                [otherPipe.p1, otherPipe.p2].forEach(otherPoint => {
                    const dist3D = Math.hypot(
                        point.x - otherPoint.x,
                        point.y - otherPoint.y,
                        (point.z || 0) - (otherPoint.z || 0)
                    );

                    if (dist3D < TOLERANCE) {
                        connectionCount++;
                    }
                });
            });

            // En az 2 bağlantı varsa bu bir junction (dirsek veya TEE)
            if (connectionCount >= 2) {
                processedJunctions.add(junctionKey);

                // İzometrik koordinatlara dönüştür
                let iso = toIsometric(point.x, point.y, z);

                // Offset kontrolü - borunun sürüklenme offset'ini uygula
                const offset = state.isoPipeOffsets[pipe.id] || {};
                const dx = endpoint === 'p1' ? (offset.startDx || 0) : (offset.endDx || 0);
                const dy = endpoint === 'p1' ? (offset.startDy || 0) : (offset.endDy || 0);

                // Offset uygula
                iso.isoX += dx;
                iso.isoY += dy;

                // Z kotunu yaz (h:225 formatında, negatif değerler için -)
                //const elevationText = `${Math.round(z)}`;

                // Sade metin - arkaplan yok
                ctx.fillStyle = isLightMode ? '#000' : '#fff';
                ctx.fillText(elevationText, iso.isoX + 8, iso.isoY - 8);
            }
        });
    });
}

/**
 * Basit izometrik dikdörtgen prizma çizer (flat, 3D kabuk değil)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Genişlik (X ekseni)
 * @param {number} depth - Derinlik (Y ekseni)
 * @param {number} height - Yükseklik (Z ekseni)
 * @param {string} fillColor - Dolgu rengi
 * @param {string} strokeColor - Kenar rengi
 */
function drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor) {
    // Basit dikdörtgen prizma - sadece ön yüzey
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;

    // Basit dikdörtgen çiz
    ctx.fillRect(-width / 2, -height, width, height);
    ctx.strokeRect(-width / 2, -height, width, height);
}

/**
 * Hex rengi (0xRRGGBB veya #RRGGBB) CSS string'e çevirir
 * @param {number|string} color - Hex renk (0xA8A8A8 veya #A8A8A8)
 * @returns {string} CSS hex renk (#RRGGBB)
 */
function hexToCSS(color) {
    if (typeof color === 'string') {
        // Zaten string ise (#RRGGBB formatında), olduğu gibi döndür
        return color.startsWith('#') ? color : '#' + color;
    }
    // Numeric hex ise (0xRRGGBB), string'e çevir
    return '#' + color.toString(16).padStart(6, '0');
}

/**
 * Rengi koyulaştırır veya açar
 * @param {string} color - Hex renk (#RRGGBB)
 * @param {number} percent - % koyulaştırma/açma (-100 ile 100 arası)
 * @returns {string} Yeni hex renk
 */
function shadeColor(color, percent) {
    // Hex rengi RGB'ye çevir
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    // % uygula
    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    // Sınırla
    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    R = (R > 0) ? R : 0;
    G = (G > 0) ? G : 0;
    B = (B > 0) ? B : 0;

    const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

    return "#" + RR + GG + BB;
}

// Tüm iso 2D parallelogram çizimi için ortak yardımcı sabitler
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);

/**
 * Servis kutusunu 2D izometrik parallelogram olarak çizer.
 * Dikey kenarlar dik kalır, üst/alt kenarlar iso eğimiyle (30°) eğimli.
 * Anchor = pipe.p1 = SK çıkış noktası → kutunun ilgili dik kenarında,
 * ALTTAN %20 mesafede (kutunun içine girer, kutu anchor'ı SARAR).
 */
function drawServisKutusuIso(ctx, component) {
    const w = 18, h = 30;
    const bottomFrac = 0.20;             // çıkış kenarda alttan %20'de
    const yBottom = h * bottomFrac;      // anchor'dan kutu altına mesafe (aşağı)
    const yTop = h - yBottom;            // anchor'dan kutu üstüne mesafe (yukarı)
    const cikisYonu = component.cikisYonu || 'sag';

    const sx = w * ISO_COS;
    const sy = w * ISO_SIN;

    // Anchor (0, 0). Çıkış kenarındaki anchor; karşı kenar iso eğimle kaymış.
    let BL, BR, TL, TR;
    switch (cikisYonu) {
        case 'sol':
            // Anchor sol kenarda — kutu anchor'ın sağında
            BL = { x: 0,    y:  yBottom };
            BR = { x: sx,   y:  yBottom - sy };
            TL = { x: 0,    y: -yTop };
            TR = { x: sx,   y: -yTop - sy };
            break;
        case 'sag':
        default:
            // Anchor sağ kenarda — kutu anchor'ın solunda
            BR = { x: 0,    y:  yBottom };
            BL = { x: -sx,  y:  yBottom + sy };
            TR = { x: 0,    y: -yTop };
            TL = { x: -sx,  y: -yTop + sy };
            break;
    }

    // Dolgu (mor) + iso parallelogram konturu
    ctx.fillStyle = '#9c66bb';
    ctx.strokeStyle = '#3a1f4d';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(BL.x, BL.y);
    ctx.lineTo(BR.x, BR.y);
    ctx.lineTo(TR.x, TR.y);
    ctx.lineTo(TL.x, TL.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // İç çerçeve detayı
    const cx = (BL.x + BR.x + TR.x + TL.x) / 4;
    const cy = (BL.y + BR.y + TR.y + TL.y) / 4;
    const shrink = (p) => ({
        x: p.x + (cx - p.x) * 0.18,
        y: p.y + (cy - p.y) * 0.18,
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 0.6;
    const iBL = shrink(BL), iBR = shrink(BR), iTR = shrink(TR), iTL = shrink(TL);
    ctx.beginPath();
    ctx.moveTo(iBL.x, iBL.y);
    ctx.lineTo(iBR.x, iBR.y);
    ctx.lineTo(iTR.x, iTR.y);
    ctx.lineTo(iTL.x, iTL.y);
    ctx.closePath();
    ctx.stroke();
}

/**
 * Sayacı 2D izometrik parallelogram olarak çizer — dikey kenarlar dik,
 * üst/alt kenarlar iso eğiminde. Anchor (üst-orta) ile gövde arası fleks gap.
 */
function drawSayacIso(ctx, component) {
    const w = 18, h = 20;
    const gap = 10; // fleks boşluğu
    const sx = w * ISO_COS / 2; // yarı genişlik (iso)
    const sy = w * ISO_SIN / 2; // yarı eğim farkı

    // Parallelogram köşeleri — anchor (0,0) üst-orta'da, gövde anchor altında
    const TL = { x: -sx, y: gap + sy };
    const TR = { x:  sx, y: gap - sy };
    const BR = { x:  sx, y: gap - sy + h };
    const BL = { x: -sx, y: gap + sy + h };

    ctx.fillStyle = '#43A047';
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(TL.x, TL.y);
    ctx.lineTo(TR.x, TR.y);
    ctx.lineTo(BR.x, BR.y);
    ctx.lineTo(BL.x, BL.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cam yüzeyi iç çerçeve
    const cx = (TL.x + TR.x + BR.x + BL.x) / 4;
    const cy = (TL.y + TR.y + BR.y + BL.y) / 4;
    const shrink = (p) => ({
        x: p.x + (cx - p.x) * 0.18,
        y: p.y + (cy - p.y) * 0.18,
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.6;
    const iTL = shrink(TL), iTR = shrink(TR), iBR = shrink(BR), iBL = shrink(BL);
    ctx.beginPath();
    ctx.moveTo(iTL.x, iTL.y);
    ctx.lineTo(iTR.x, iTR.y);
    ctx.lineTo(iBR.x, iBR.y);
    ctx.lineTo(iBL.x, iBL.y);
    ctx.closePath();
    ctx.stroke();

    // Fleks bağlantı çizgisi (anchor → üst kenar orta noktası)
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, gap);
    ctx.stroke();
}

/**
 * Vanayı izometrik perspektifte çizer — eşkenar dörtgen + kol (boru rengine göre)
 */
function drawVanaIso(ctx, component) {
    let colorGroup = 'YELLOW';
    if (component.bagliBoruId && plumbingManager) {
        const p = plumbingManager.findPipeById(component.bagliBoruId);
        if (p) colorGroup = p.colorGroup || 'YELLOW';
    }
    const fill = colorGroup === 'TURQUAZ' ? '#4DA6FF' : '#D4A017';
    const stroke = colorGroup === 'TURQUAZ' ? '#0B3D75' : '#5C3A00';

    const halfW = 7, halfH = 5;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    // Anchor (0,0) — eşkenar dörtgen merkezi
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(0, -halfH);
    ctx.lineTo(halfW, 0);
    ctx.lineTo(0, halfH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Üst kol (volan)
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, -halfH - 4);
    ctx.moveTo(-3, -halfH - 4);
    ctx.lineTo(3, -halfH - 4);
    ctx.stroke();
}

/**
 * Regülatörü izometrik perspektifte çizer — kırmızı üçgen
 */
function drawRegulatorIso(ctx, component) {
    const w = 14, h = 12;
    ctx.fillStyle = '#E53935';
    ctx.strokeStyle = '#7F0000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(0, -h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

/**
 * Tesisat aksesuarı (filtre/izolasyon/kompansatör/manometre/topraklama) — renkli küçük daire
 */
function drawFittingIso(ctx, component) {
    const palette = {
        filtre: { fill: '#FDD835', stroke: '#7A5800' },
        izolasyon_flansi: { fill: '#8D6E63', stroke: '#3E2723' },
        kompansator: { fill: '#26C6DA', stroke: '#006064' },
        manometre: { fill: '#F5F5F5', stroke: '#424242' },
        topraklama: { fill: '#A5D6A7', stroke: '#1B5E20' },
    };
    const p = palette[component.type] || palette.manometre;
    ctx.fillStyle = p.fill;
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

/**
 * Cihazı izometrik perspektifte çizer.
 *   - KOMBI → yuvarlak (mavi daire, küçük "alev" göstergesi)
 *   - OCAK  → kare (turuncu, 4 gözü ile)
 *   - SOBA/SOFBEN/KAZAN → kare farklı renkler
 */
function drawCihazIso(ctx, component) {
    const tip = component.cihazTipi || 'KOMBI';

    if (tip === 'KOMBI') {
        // Yuvarlak — anchor (boru ucu) gövdenin TEPESİNDE
        const r = 12;
        ctx.fillStyle = '#1E88E5';
        ctx.strokeStyle = '#0D47A1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, r, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Ortada alev göstergesi
        ctx.fillStyle = '#FFB74D';
        ctx.beginPath();
        ctx.arc(0, r, 3, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    if (tip === 'OCAK') {
        // Iso parallelogram — anchor üst-orta'da, gövde anchor altında
        const w = 24, h = 22;
        const sx = w * ISO_COS / 2;
        const sy = w * ISO_SIN / 2;
        const TL = { x: -sx, y: sy };
        const TR = { x:  sx, y: -sy };
        const BR = { x:  sx, y: -sy + h };
        const BL = { x: -sx, y: sy + h };

        ctx.fillStyle = '#FB8C00';
        ctx.strokeStyle = '#7A3E00';
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(TL.x, TL.y);
        ctx.lineTo(TR.x, TR.y);
        ctx.lineTo(BR.x, BR.y);
        ctx.lineTo(BL.x, BL.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4 göz (siyah daireler) — parallelogram içinde dağıt
        ctx.fillStyle = '#3D1E00';
        const cx = 0;
        const cy = h / 2;
        const ox = sx / 2;
        const oy = h / 4;
        // Eğime göre göz konumlarını da kaydır
        const burners = [
            { x: -ox, y: cy - oy + ox * (ISO_SIN / ISO_COS) },
            { x:  ox, y: cy - oy - ox * (ISO_SIN / ISO_COS) },
            { x: -ox, y: cy + oy + ox * (ISO_SIN / ISO_COS) },
            { x:  ox, y: cy + oy - ox * (ISO_SIN / ISO_COS) },
        ];
        burners.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
        });
        return;
    }

    // SOBA / SOFBEN / KAZAN — yuvarlatılmış kare farklı renklerde
    const palette = {
        SOBA: { fill: '#8E24AA', stroke: '#4A148C' },
        SOFBEN: { fill: '#00897B', stroke: '#004D40' },
        KAZAN: { fill: '#6D4C41', stroke: '#3E2723' },
    };
    const c = palette[tip] || { fill: '#9E9E9E', stroke: '#424242' };
    const w = 22, h = 22;
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, 0, w, h, 3);
    else ctx.rect(-w / 2, 0, w, h, 3);
    ctx.fill();
    ctx.stroke();
}

/**
 * Bacayı izometrik perspektifte çizer — koyu gri ince ve uzun dikdörtgen
 */
function drawBacaIso(ctx, component) {
    const w = 8, h = 28;
    ctx.fillStyle = '#616161';
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h, w, h, 2);
    else ctx.rect(-w / 2, -h, w, h);
    ctx.fill();
    ctx.stroke();
}

/**
 * Bilinmeyen bileşen için varsayılan şekil çizer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} component - Bileşen
 */
function drawDefaultComponentIso(ctx, component) {
    // Projedeki boyutları kullan veya varsayılan
    // İzometrik görünümde daha küçük gösterim için 0.4x ölçeklendirme
    const scale = 0.4;
    const width = (component.config?.width || 20) * scale;
    const depth = (component.config?.depth || 20) * scale;
    const height = (component.config?.height || 20) * scale;

    // Projedeki renkleri kullan
    const fillColor = component.config?.color ? hexToCSS(component.config.color) :
        (document.body.classList.contains('light-mode') ? '#9E9E9E' : '#BDBDBD');
    const strokeColor = shadeColor(fillColor, -30);

    // 3D kutu çiz
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Soru işareti
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, -height / 2);
}

// ═════════════════════════════════════════════════════════════════════════════
// İZOMETRİ ETİKET SİSTEMİ — 2D ile aynı görünüm/içerik, iso projeksiyon ile.
// ═════════════════════════════════════════════════════════════════════════════

// Aynı render içinde diğer etiketlerle çakışmadan yerleştirmek için bbox kaydı
let _isoLabelBBoxes = [];

const SAYAC_TURU_LABEL_ISO = {
    'KÖRÜKLÜ': '',
    'ROTARY': 'Rotary Sayaç',
    'TÜRBİN': 'Türbin Sayaç',
};

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

// ─── Tema değerleri ──────────────────────────────────────────────────────────
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

// ─── Etiket kutusu çiz (anchor sağ-orta noktası) ─────────────────────────────
function _drawIsoLabelBox(ctx, id, ax, ay, cx, cy, lines, objClip, forceStyle) {
    const visLines = lines.filter(l => l && l.text);
    if (visLines.length === 0) return;

    const T = _isoLabelTheme();
    const fontSize = 11;
    const lineH = fontSize * 1.5;
    const pad = fontSize * 0.55;
    const r = 2.5;

    ctx.save();
    let maxW = 0;
    visLines.forEach(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
        maxW = Math.max(maxW, ctx.measureText(l.text).width);
    });
    const boxW = maxW + pad * 2;
    const boxH = visLines.length * lineH + pad * 0.8;

    // Manuel konum (DELTA) veya yön (dir) — kullanıcı sürüklemiş veya dblclick'lemiş olabilir.
    const stored = state.isoLabelOffsets?.[id];
    let style = forceStyle || 'left-center';
    if (stored && stored.dax != null) {
        ax = cx + stored.dax;
        ay = cy + stored.day;
    } else if (stored && stored.dir != null) {
        const r2 = _resolveLabelAnchorByDir(cx, cy, objClip || 0, boxW, boxH, stored.dir, style);
        ax = r2.ax; ay = r2.ay; style = r2.style;
    }

    // Stile göre kutunun sol-üst köşesini hesapla
    let bx, by;
    if (style === 'top-center') {
        bx = ax - boxW / 2;
        by = ay;
    } else { // left-center
        bx = ax;
        by = ay - boxH / 2;
    }

    _isoLabelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style, cx, cy });

    // Bağlantı çizgisi: obje merkezinden kutunun en yakın kenarına
    {
        const lx = bx + boxW / 2;
        const ly = by + boxH / 2;
        const dx = lx - cx;
        const dy = ly - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.1) {
            const ux = dx / dist, uy = dy / dist;
            let tObj = 0;
            if (objClip > 0 && (Math.abs(ux) > 0.001 || Math.abs(uy) > 0.001)) {
                tObj = Math.min(
                    Math.abs(ux) > 0.001 ? objClip / Math.abs(ux) : Infinity,
                    Math.abs(uy) > 0.001 ? objClip / Math.abs(uy) : Infinity
                );
            }
            const tLab = Math.min(
                Math.abs(ux) > 0.001 ? (boxW / 2) / Math.abs(ux) : Infinity,
                Math.abs(uy) > 0.001 ? (boxH / 2) / Math.abs(uy) : Infinity
            );
            if (tObj + tLab < dist) {
                ctx.strokeStyle = T.connColor;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(cx + ux * tObj, cy + uy * tObj);
                ctx.lineTo(lx - ux * tLab, ly - uy * tLab);
                ctx.stroke();
            }
        }
    }

    // Kutu
    ctx.fillStyle = T.bgColor;
    ctx.strokeStyle = T.borderColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, r);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    // Accent çubuk — stile göre kenar
    ctx.strokeStyle = T.accentBar;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (style === 'top-center') {
        ctx.moveTo(bx + r, by + 1);
        ctx.lineTo(bx + boxW - r, by + 1);
    } else {
        ctx.moveTo(bx + 1, by + r);
        ctx.lineTo(bx + 1, by + boxH - r);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Yazılar
    let ty = by + pad * 0.4 + fontSize;
    visLines.forEach(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
        ctx.fillStyle = l.accent ? T.accentColor : (l.sub ? T.subColor : T.textColor);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(l.text, bx + pad, ty);
        ty += lineH;
    });
    ctx.restore();
}

// ─── Etiket kutusu — üst-orta ankraj (kutu/sayaç/cihaz için) ─────────────────
function _drawIsoLabelBoxBelow(ctx, id, cx, cy, lines, objClip) {
    const visLines = lines.filter(l => l && l.text);
    if (visLines.length === 0) return;

    const T = _isoLabelTheme();
    const fontSize = 11;
    const lineH = fontSize * 1.5;
    const pad = fontSize * 0.55;
    const r = 2.5;
    const gap = 12;

    ctx.save();
    let maxW = 0;
    visLines.forEach(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
        maxW = Math.max(maxW, ctx.measureText(l.text).width);
    });
    const boxW = maxW + pad * 2;
    const boxH = visLines.length * lineH + pad * 0.8;

    // Manuel konum DELTA olarak saklanır (nesneye göreceli).
    const stored = state.isoLabelOffsets?.[id];
    let topCX, topCY;
    if (stored && stored.dax != null) {
        topCX = cx + stored.dax;
        topCY = cy + stored.day;
    } else {
        topCX = cx;
        topCY = cy + objClip + gap;
    }
    const bx = topCX - boxW / 2;
    const by = topCY;

    _isoLabelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style: 'top-center', cx, cy });

    // Bağlantı çizgisi
    {
        const lx = bx + boxW / 2;
        const ly = by + boxH / 2;
        const dx = lx - cx;
        const dy = ly - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.1) {
            const ux = dx / dist, uy = dy / dist;
            let tObj = 0;
            if (objClip > 0 && (Math.abs(ux) > 0.001 || Math.abs(uy) > 0.001)) {
                tObj = Math.min(
                    Math.abs(ux) > 0.001 ? objClip / Math.abs(ux) : Infinity,
                    Math.abs(uy) > 0.001 ? objClip / Math.abs(uy) : Infinity
                );
            }
            const tLab = Math.min(
                Math.abs(ux) > 0.001 ? (boxW / 2) / Math.abs(ux) : Infinity,
                Math.abs(uy) > 0.001 ? (boxH / 2) / Math.abs(uy) : Infinity
            );
            if (tObj + tLab < dist) {
                ctx.strokeStyle = T.connColor;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(cx + ux * tObj, cy + uy * tObj);
                ctx.lineTo(lx - ux * tLab, ly - uy * tLab);
                ctx.stroke();
            }
        }
    }

    // Kutu
    ctx.fillStyle = T.bgColor;
    ctx.strokeStyle = T.borderColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, r);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    // Üst kenarda accent çubuk
    ctx.strokeStyle = T.accentBar;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + r, by + 1);
    ctx.lineTo(bx + boxW - r, by + 1);
    ctx.stroke();
    ctx.lineCap = 'butt';

    let ty = by + pad * 0.4 + fontSize;
    visLines.forEach(l => {
        ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
        ctx.fillStyle = l.accent ? T.accentColor : (l.sub ? T.subColor : T.textColor);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(l.text, bx + pad, ty);
        ty += lineH;
    });
    ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// İçerik üreticileri — 2D renderer-labels.js ile eşdeğer
// ═════════════════════════════════════════════════════════════════════════════

function _buildSayacLinesIso(comp) {
    const lines = [];
    getBirimLabelLinesIso(comp.birimTipi || '', comp.birimNo || '')
        .forEach(t => { if (t) lines.push({ text: t, bold: true }); });

    const turuLabel = SAYAC_TURU_LABEL_ISO[comp.sayacTuru || 'KÖRÜKLÜ'] || '';
    if (turuLabel) lines.push({ text: turuLabel, sub: true });

    const boruTipi = comp.birimBoruTipi || 'ÇELİK';
    if (boruTipi === 'ESNEK') {
        const marka = comp.esnekMarka || '';
        lines.push({ text: marka ? `Esnek Tesisat (${marka})` : 'Esnek Tesisat', sub: true });
    } else {
        const bagTipi = comp.birimBaglantiTipi || '';
        if (bagTipi) {
            const bagLabel = bagTipi === 'DİŞLİ' ? 'Dişli' : bagTipi === 'KAYNAKLI' ? 'Kaynaklı' : bagTipi;
            lines.push({ text: `${bagLabel} Tesisat`, sub: true });
        }
    }

    if (comp.aboneAdi) lines.push({ text: comp.aboneAdi, sub: true });
    if (comp.aboneNo) lines.push({ text: comp.aboneNo, sub: true });

    if (comp.description) comp.description.trimEnd().split('\n').forEach(line => {
        lines.push({ text: line.trimEnd() || ' ', sub: true });
    });
    return lines;
}

function _buildCihazLinesIso(comp) {
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
        lines.push({ text: comp.cihazTipi || 'Cihaz', bold: true });
    }
    if (comp.description) comp.description.trimEnd().split('\n').forEach(line => {
        lines.push({ text: line.trimEnd() || ' ', sub: true });
    });
    return lines;
}

function _buildVanaLinesIso(comp, manager) {
    const lines = [];
    const vt = comp.vanaTipi || '';
    if (vt === 'CIHAZ') {
        if (comp.izolator) lines.push({ text: 'İzolatörlü', sub: true });
    } else if (vt === 'AKV') {
        lines.push({ text: 'AKV', bold: true });
    } else if (vt === 'BRANSMAN') {
        if (comp.ilerdeKullanim) {
            lines.push({ text: 'ilerde kullanım amacıyla', sub: true });
            const n = parseInt(comp.birimSayisi, 10) || 0;
            const tipiLbl = comp.birimTipi === 'OFİS' || comp.birimTipi === 'TİCARİ' ? 'dükkan'
                : comp.birimTipi === 'KAZAN DAİRESİ' ? 'kazan dairesi' : 'daire';
            if (n > 0) lines.push({ text: `${n} ${tipiLbl}`, bold: true });
        } else {
            let birimTipi = comp.birimTipi || '';
            if (!birimTipi && manager) {
                const sayac = manager.components.find(c => c.type === 'sayac' && c.iliskiliVanaId === comp.id);
                if (sayac?.birimTipi) birimTipi = sayac.birimTipi;
            }
            if (!birimTipi) birimTipi = 'KONUT';
            getBirimLabelLinesIso(birimTipi, comp.birimNo || '')
                .forEach(t => { if (t) lines.push({ text: t, bold: true }); });
        }
    } else if (vt === 'EMNIYET') {
        lines.push({ text: 'Emn.V', sub: true });
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
    if (comp.description) comp.description.trimEnd().split('\n').forEach(line => {
        lines.push({ text: line.trimEnd() || ' ', sub: true });
    });
    return lines;
}

function _buildRegulatorLinesIso(comp, manager) {
    const lines = [];
    const baslik = comp.shutOff !== false ? 'Shut-Off Regülatör' : 'Regülatör';
    lines.push({ text: baslik, bold: true });

    const marka = (comp.marka ?? 'ESKA').toString().trim() || 'ESKA';
    const model = (comp.model ?? 'ERG').toString().trim() || 'ERG';
    lines.push({ text: `${marka} - ${model}`, sub: true });

    let girisBasinc = null;
    if (manager && comp.bagliBoruId) {
        const bagliBoru = manager.findPipeById(comp.bagliBoruId);
        if (bagliBoru?.basinc != null) girisBasinc = Math.round(Number(bagliBoru.basinc));
    }
    const cikis = comp.cikisBasinc || '21';
    lines.push({ text: girisBasinc != null ? `${girisBasinc}►${cikis} mbar` : `${cikis} mbar`, sub: true });

    if (comp.description) comp.description.trimEnd().split('\n').forEach(line => {
        lines.push({ text: line.trimEnd() || ' ', sub: true });
    });
    return lines;
}

function _buildFittingLinesIso(comp) {
    const lines = [];
    let baslik;
    switch (comp.type) {
        case 'filtre': baslik = comp.konik ? 'Konik Filtre' : 'Filtre'; break;
        case 'izolasyon_flansi': baslik = 'İzolasyon Flanşı'; break;
        case 'kompansator': baslik = 'Kompansatör'; break;
        case 'manometre': baslik = 'Manometre'; break;
        case 'topraklama': baslik = 'TOPRAKLAMA'; break;
        default: baslik = '';
    }
    if (baslik) lines.push({ text: baslik, bold: comp.type === 'topraklama' });
    if (comp.type === 'topraklama' && comp.topraklamaYontemi) {
        lines.push({ text: comp.topraklamaYontemi, sub: true });
    }
    const marka = (comp.marka ?? '').toString().trim();
    const model = (comp.model ?? '').toString().trim();
    if (marka || model) lines.push({ text: [marka, model].filter(Boolean).join(' - '), sub: true });
    if (comp.description) comp.description.trimEnd().split('\n').forEach(line => {
        lines.push({ text: line.trimEnd() || ' ', sub: true });
    });
    return lines;
}

function _buildKutuLinesIso(comp) {
    const lines = [];
    lines.push({ text: comp.kutuTipi || 'S.K.', bold: true });
    if (comp.kutuBasinc) lines.push({ text: `${comp.kutuBasinc} mbar`, sub: true });
    const yon = comp.cikisYonu || 'sag';
    const yonLabel = yon === 'sag' ? 'Yandan Çıkış' : yon === 'alt' ? 'Alttan Çıkış' : yon === 'ust' ? 'Üstten Çıkış' : '';
    if (yonLabel) lines.push({ text: yonLabel, sub: true });
    if (comp.description) comp.description.trimEnd().split('\n').forEach(line => {
        lines.push({ text: line.trimEnd() || ' ', sub: true });
    });
    return lines;
}

// ═════════════════════════════════════════════════════════════════════════════
// Etiket çağrı entry point — tek komponent için
// ═════════════════════════════════════════════════════════════════════════════
function drawComponentLabelIso(ctx, component, pos) {
    const manager = plumbingManager;
    const cx = pos.isoX;
    const cy = pos.isoY;

    let lines, clip, useBelow = false;
    switch (component.type) {
        case 'sayac':
            lines = _buildSayacLinesIso(component);
            // gap(10) + iso_sy(~4.5) + h(20) ≈ 35
            clip = 36;
            useBelow = true;
            break;
        case 'cihaz': {
            lines = _buildCihazLinesIso(component);
            // Kombi 2r=24, ocak iso h+sy ≈ 28
            clip = 30;
            useBelow = true;
            break;
        }
        case 'servis_kutusu':
            lines = _buildKutuLinesIso(component);
            // Kutu anchor'ı sarar — alt %20 anchor'ın altında. BL ≈ +0.2h + iso_sy
            // (h=30, iso_sy=9) ≈ 15. Label altında kalsın diye clip 18.
            clip = 18;
            useBelow = true;
            break;
        case 'vana':
            lines = _buildVanaLinesIso(component, manager);
            clip = 6;
            break;
        case 'regulator':
            lines = _buildRegulatorLinesIso(component, manager);
            clip = 8;
            break;
        case 'filtre':
        case 'izolasyon_flansi':
        case 'kompansator':
        case 'manometre':
        case 'topraklama':
            lines = _buildFittingLinesIso(component);
            clip = 6;
            break;
        case 'baca':
            lines = [{ text: 'Baca', bold: true }];
            clip = 8;
            useBelow = true;
            break;
        default:
            return;
    }
    if (!lines || lines.length === 0) return;

    // Varsayılan stil ve anchor — manuel/dir override ise _drawIsoLabelBox içinde halledilir.
    const defaultStyle = useBelow ? 'top-center' : 'left-center';
    let ax, ay;
    if (defaultStyle === 'top-center') {
        ax = cx; ay = cy + clip + 12;
    } else {
        ax = cx + clip + 12; ay = cy;
    }
    _drawIsoLabelBox(ctx, component.id, ax, ay, cx, cy, lines, clip, defaultStyle);
}

// ═════════════════════════════════════════════════════════════════════════════
// HAT (BORU) ETİKETLERİ
// ═════════════════════════════════════════════════════════════════════════════
function drawPipeLabelsIso(ctx) {
    if (!plumbingManager || !plumbingManager.pipes) return;
    const T = _isoLabelTheme();
    const fontSize = 11;
    const numFontSize = 14;
    const pad = 4;

    // Hat (section) gruplarını hesapla — 2D ile aynı algoritma
    const { hatMap } = computeHatGroups(plumbingManager.pipes, plumbingManager.components);

    // Section -> {hatNo, pipes[]}
    const visited = new Set();
    const pipeMap = new Map(plumbingManager.pipes.map(p => [p.id, p]));
    const childrenIdx = new Map();
    plumbingManager.pipes.forEach(p => {
        if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId) {
            const par = p.baslangicBaglanti.hedefId;
            if (!childrenIdx.has(par)) childrenIdx.set(par, []);
            childrenIdx.get(par).push(p.id);
        }
    });

    const sections = [];
    plumbingManager.pipes.forEach(seedPipe => {
        if (visited.has(seedPipe.id)) return;
        const hatNo = hatMap.get(seedPipe.id);
        if (hatNo == null) return;
        const group = [];
        const queue = [seedPipe.id];
        while (queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            if (hatMap.get(id) !== hatNo) continue;
            const p = pipeMap.get(id);
            if (!p) continue;
            visited.add(id);
            group.push(p);
            const par = p.baslangicBaglanti?.tip === 'boru' ? p.baslangicBaglanti.hedefId : null;
            if (par && hatMap.get(par) === hatNo) queue.push(par);
            (childrenIdx.get(id) || []).forEach(cid => {
                if (hatMap.get(cid) === hatNo) queue.push(cid);
            });
        }
        if (group.length > 0) sections.push({ hatNo, pipes: group });
    });

    sections.forEach(({ hatNo, pipes }) => {
        // En uzun yatay-eğilimli boru üzerine etiketi yerleştir
        let chosen = pipes[0];
        let maxLen = 0;
        let totalLen = 0;
        pipes.forEach(p => {
            if (!p.p1 || !p.p2) return;
            const len = Math.hypot(p.p2.x - p.p1.x, p.p2.y - p.p1.y, (p.p2.z || 0) - (p.p1.z || 0));
            totalLen += len;
            if (len > maxLen) { maxLen = len; chosen = p; }
        });
        if (!chosen || !chosen.p1 || !chosen.p2) return;

        // İso uzayda midpoint (offset uygulanmış)
        const a = toIsometric(chosen.p1.x, chosen.p1.y, chosen.p1.z || 0);
        const b = toIsometric(chosen.p2.x, chosen.p2.y, chosen.p2.z || 0);
        const off = state.isoPipeOffsets?.[chosen.id] || {};
        a.isoX += (off.startDx || 0); a.isoY += (off.startDy || 0);
        b.isoX += (off.endDx || 0);   b.isoY += (off.endDy || 0);
        const midX = (a.isoX + b.isoX) / 2;
        const midY = (a.isoY + b.isoY) / 2;

        // Etiket içeriği
        const uzunluk = (totalLen > 0) ? (totalLen / 100).toFixed(2) : null;
        const debi = typeof chosen.debi === 'number' ? chosen.debi : null;
        const cap = chosen.boruCap || '';
        const infoLines = [
            debi != null ? `${debi.toFixed(2)} m³/h` : null,
            uzunluk != null ? `${uzunluk} m` : null,
            cap || null,
        ].filter(Boolean);

        // Hat numarası kutusu
        const numStr = String(hatNo);
        ctx.save();
        ctx.font = `bold ${numFontSize}px "Segoe UI",sans-serif`;
        const numW = ctx.measureText(numStr).width;
        ctx.font = `${fontSize}px "Segoe UI",sans-serif`;
        let maxInfoW = 0;
        infoLines.forEach(l => { maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width); });

        const numCellW = pad * 2 + numW;
        const infoCellW = infoLines.length > 0 ? pad * 2 + maxInfoW : 0;
        const boxW = numCellW + (infoCellW > 0 ? 1 + infoCellW : 0);
        const boxH = Math.max(numFontSize + pad * 2, infoLines.length * (fontSize * 1.4) + pad * 1.2);

        // Manuel konum (DELTA) veya dir (4 yön) — varsayılan sağa ofset.
        const stored = state.isoLabelOffsets?.[chosen.id];
        let ax, ay, style = 'left-center';
        if (stored && stored.dax != null) {
            ax = midX + stored.dax;
            ay = midY + stored.day;
        } else if (stored && stored.dir != null) {
            const r2 = _resolveLabelAnchorByDir(midX, midY, 8, boxW, boxH, stored.dir, 'left-center');
            ax = r2.ax; ay = r2.ay; style = r2.style;
        } else {
            ax = midX + 20;
            ay = midY;
        }
        let bx, by;
        if (style === 'top-center') {
            bx = ax - boxW / 2;
            by = ay;
        } else {
            bx = ax;
            by = ay - boxH / 2;
        }

        _isoLabelBBoxes.push({ id: chosen.id, bx, by, bw: boxW, bh: boxH, style, cx: midX, cy: midY });

        // Bağlantı çizgisi
        const lx = bx + boxW / 2;
        const ly = by + boxH / 2;
        const dx = lx - midX;
        const dy = ly - midY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.1) {
            const ux = dx / dist, uy = dy / dist;
            const tLab = Math.min(
                Math.abs(ux) > 0.001 ? (boxW / 2) / Math.abs(ux) : Infinity,
                Math.abs(uy) > 0.001 ? (boxH / 2) / Math.abs(uy) : Infinity
            );
            ctx.strokeStyle = T.connColor;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(midX, midY);
            ctx.lineTo(lx - ux * tLab, ly - uy * tLab);
            ctx.stroke();
        }

        // Kutu
        ctx.fillStyle = T.bgColor;
        ctx.strokeStyle = T.borderColor;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 3);
        else ctx.rect(bx, by, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        // Hücre ayırıcı
        if (infoCellW > 0) {
            ctx.strokeStyle = T.borderColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(bx + numCellW, by + pad);
            ctx.lineTo(bx + numCellW, by + boxH - pad);
            ctx.stroke();
        }

        // Hat numarası
        const numColor = hatNo >= 300 ? '#8d2121' : T.accentColor;
        ctx.font = `bold ${numFontSize}px "Segoe UI",sans-serif`;
        ctx.fillStyle = numColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, bx + numCellW / 2, by + boxH / 2);

        // Info satırları
        if (infoLines.length > 0) {
            ctx.font = `${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = T.subColor;
            ctx.textAlign = 'left';
            const infoLineH = fontSize * 1.4;
            const infoTotalH = infoLines.length * infoLineH;
            let ty = by + (boxH - infoTotalH) / 2 + infoLineH * 0.75;
            infoLines.forEach(l => {
                ctx.fillText(l, bx + numCellW + 1 + pad, ty);
                ty += infoLineH;
            });
        }
        ctx.restore();
    });
}

// İso etiket render girişi — render başında bbox cache temizlenir
function startIsoLabelFrame() {
    _isoLabelBBoxes = [];
}

// ─── İso label etkileşim API'leri ────────────────────────────────────────────
// (Mouse koordinatları iso world uzayında verilmelidir.)

/** Verilen iso world noktasında etiket varsa id'sini, stilini ve nesne pozisyonunu döner. */
export function hitTestIsoLabel(wx, wy) {
    for (let i = _isoLabelBBoxes.length - 1; i >= 0; i--) {
        const bb = _isoLabelBBoxes[i];
        if (wx >= bb.bx && wx <= bb.bx + bb.bw &&
            wy >= bb.by && wy <= bb.by + bb.bh) {
            return {
                id: bb.id, style: bb.style,
                bx: bb.bx, by: bb.by, bw: bb.bw, bh: bb.bh,
                cx: bb.cx, cy: bb.cy,
            };
        }
    }
    return null;
}

/**
 * Etiket sürükleme — yeni iso world konumunu, nesnenin (cx, cy) iso pozisyonuna
 * göre DELTA olarak saklar. Böylece nesne sonradan sürüklendiğinde etiket takip eder.
 */
export function setIsoLabelPos(id, style, bx, by, bw, bh, cx, cy) {
    const newOffsets = { ...(state.isoLabelOffsets || {}) };
    let ax, ay;
    if (style === 'top-center') {
        ax = bx + bw / 2;
        ay = by;
    } else {
        ax = bx;
        ay = by + bh / 2;
    }
    newOffsets[id] = { dax: ax - cx, day: ay - cy };
    return newOffsets;
}

/** Manuel etiket konumunu temizler (otomatik konuma döner). */
export function clearIsoLabelPos(id) {
    if (!state.isoLabelOffsets || state.isoLabelOffsets[id] == null) return null;
    const newOffsets = { ...state.isoLabelOffsets };
    delete newOffsets[id];
    return newOffsets;
}

/**
 * Çift tıklamada yönü 0→1→2→3→0 olarak döndürür (2D sahne ile aynı semantik).
 * 0=üst, 1=sağ, 2=alt, 3=sol. dax/day (manuel ofset) temizlenir ki dir geçerli olsun.
 */
export function cycleIsoLabelDir(id) {
    const newOffsets = { ...(state.isoLabelOffsets || {}) };
    const cur = newOffsets[id] || {};
    const next = (((cur.dir ?? 0) + 1) % 4);
    newOffsets[id] = { dir: next };
    return newOffsets;
}

/**
 * Bir etiketin "objClip + gap" mesafelerini hesaplar — dir tabanlı konumlandırma için.
 * cx, cy: nesne iso pozisyonu; clip: nesnenin yarı boyutu (kabaca); boxW, boxH: kutu boyutu.
 * Return: { ax, ay, style } — anchor noktası + render stili.
 */
function _resolveLabelAnchorByDir(cx, cy, clip, boxW, boxH, dir, defaultStyle) {
    const gap = 12;
    if (dir == null) {
        // Default: tip-bazlı varsayılan
        if (defaultStyle === 'top-center') {
            return { ax: cx, ay: cy + clip + gap, style: 'top-center' };
        }
        return { ax: cx + clip + gap, ay: cy, style: 'left-center' };
    }
    switch (dir) {
        case 0: // ÜST — kutu nesnenin üstünde
            return { ax: cx, ay: cy - clip - gap - boxH, style: 'top-center' };
        case 1: // SAĞ — kutu nesnenin sağında
            return { ax: cx + clip + gap, ay: cy, style: 'left-center' };
        case 2: // ALT — kutu nesnenin altında
            return { ax: cx, ay: cy + clip + gap, style: 'top-center' };
        case 3: // SOL — kutu nesnenin solunda
            return { ax: cx - clip - gap - boxW, ay: cy, style: 'left-center' };
    }
    return { ax: cx + clip + gap, ay: cy, style: 'left-center' };
}
