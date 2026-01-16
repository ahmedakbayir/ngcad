/**
 * scene-isometric.js
 * İzometrik görünüm renderer'ı - sadece tesisat elemanlarını gösterir
 */

import { state } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

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

    // Boruları çiz
    drawIsometricPipes(ctx);

    // Bileşenleri çiz
    drawIsometricComponents(ctx);

    // Parça etiketlerini çiz
    //drawPipeLabels(ctx, pipeHierarchy);
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

    plumbingManager.pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;

        // Boru rengini colorGroup'a göre belirle
        let pipeColor;
        if (pipe.colorGroup === 'YELLOW') {
            pipeColor = isLightMode ? 'rgba(160, 82, 45, 1)' : 'rgba(184, 134, 11, 1)';  // Sienna / Dark Goldenrod
        } else if (pipe.colorGroup === 'TURQUAZ') {
            pipeColor = isLightMode ? 'rgba(0, 100, 204, 1)' : 'rgba(21, 154, 172, 1)';  // Dark Blue / Dodger Blue
        } else {
            pipeColor = isLightMode ? 'rgba(128, 128, 128, 1)' : 'rgba(200, 200, 200, 1)';  // Gray / Light Gray
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

    plumbingManager.components.forEach((component, index) => {
        if (!component.x || !component.y) return;

        // Bileşen konumunu izometrik koordinatlara dönüştür
        const pos = toIsometric(component.x, component.y, 0);

        // Bileşen tipine göre farklı şekiller çiz
        ctx.save();
        ctx.translate(pos.isoX, pos.isoY);

        // Rotation varsa uygula (izometrik açıya dönüştür)
        if (component.rotation) {
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
        } else if (component.type === 'cihaz') {
            drawCihazIso(ctx, component);
        } else if (component.type === 'baca') {
            drawBacaIso(ctx, component);
        } else {
            // Bilinmeyen tip için basit bir kare çiz
            drawDefaultComponentIso(ctx, component);
        }

        ctx.restore();
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
                const elevationText = `h:${Math.round(z)}`;

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

/**
 * Servis kutusunu izometrik perspektifte çizer (3D blok)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} component - Servis kutusu bileşeni
 */
function drawServisKutusuIso(ctx, component) {
    // Projedeki gerçek boyutları kullan
    // İzometrik görünümde daha küçük gösterim için 0.4x ölçeklendirme
    const scale = 0.4;
    const width = (component.config?.width || 50) * scale;
    const height = (component.config?.height || 25) * scale;
    const depth = (component.config?.depth || 70) * scale;

    // Projedeki renkleri kullan
    let fillColor, strokeColor;
    if (component.config?.colors) {
        // ServisKutusu'nun özel renk paleti varsa
        fillColor = component.config.colors.middle || '#A8A8A8';
        strokeColor = component.config.colors.stroke || '#555555';
    } else if (component.config?.color) {
        // Tek renk varsa
        fillColor = hexToCSS(component.config.color);
        strokeColor = shadeColor(fillColor, -30);
    } else {
        // Varsayılan renkler
        fillColor = '#A8A8A8';
        strokeColor = '#555555';
    }

    // 3D kutu çiz
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Metin (üst yüzeyde)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SK', 0, -height);
}

/**
 * Sayacı izometrik perspektifte çizer (3D blok)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} component - Sayaç bileşeni
 */
function drawSayacIso(ctx, component) {
    // Projedeki gerçek boyutları kullan
    // İzometrik görünümde daha küçük gösterim için 0.4x ölçeklendirme
    const scale = 0.4;
    const width = (component.config?.width || 22) * scale;
    const depth = (component.config?.depth || 16) * scale;
    const height = (component.config?.height || 24) * scale;

    // Projedeki renkleri kullan
    const fillColor = component.config?.color ? hexToCSS(component.config.color) : '#A8A8A8';
    const strokeColor = shadeColor(fillColor, -30);

    // 3D kutu çiz
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Metin (üst yüzeyde)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G4', 0, -height);
}

/**
 * Vanayı izometrik perspektifte çizer (3D silindir benzeri)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} component - Vana bileşeni
 */
function drawVanaIso(ctx, component) {
    // Projedeki gerçek boyutları kullan
    // İzometrik görünümde daha küçük gösterim için 0.4x ölçeklendirme
    const scale = 0.4;
    const width = (component.config?.width || 8) * scale;
    const depth = (component.config?.width || 8) * scale;  // Vana genelde kare
    const height = (component.config?.height || 8) * scale;

    // Projedeki renkleri kullan
    const fillColor = component.config?.color ? hexToCSS(component.config.color) : '#A0A0A0';
    const strokeColor = shadeColor(fillColor, -30);

    // 3D kutu çiz (küçük silindir gibi)
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Üst yüzeye çizgi ekle (vana simgesi)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-width / 3, -height);
    ctx.lineTo(width / 3, -height);
    ctx.stroke();
}

/**
 * Cihazı (kombi, ocak vb.) izometrik perspektifte çizer (3D blok)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} component - Cihaz bileşeni
 */
function drawCihazIso(ctx, component) {
    // Projedeki gerçek boyutları kullan
    // İzometrik görünümde daha küçük gösterim için 0.4x ölçeklendirme
    const scale = 0.4;
    const width = (component.config?.width || 30) * scale;
    const depth = (component.config?.depth || 29) * scale;
    const height = (component.config?.height || 30) * scale;

    // Projedeki renkleri kullan
    const fillColor = component.config?.color ? hexToCSS(component.config.color) : '#C0C0C0';
    const strokeColor = shadeColor(fillColor, -30);

    // 3D kutu çiz
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Metin (üst yüzeyde)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = component.cihazTipi === 'KOMBI' ? 'K' :
        component.cihazTipi === 'OCAK' ? 'O' :
            component.cihazTipi === 'SOBA' ? 'S' :
                component.cihazTipi === 'SOFBEN' ? 'Ş' :
                    component.cihazTipi === 'KAZAN' ? 'KZ' : 'C';
    ctx.fillText(label, 0, -height);
}

/**
 * Bacayı izometrik perspektifte çizer (3D ince ve uzun blok)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} component - Baca bileşeni
 */
function drawBacaIso(ctx, component) {
    // Projedeki gerçek boyutları kullan
    // İzometrik görünümde daha küçük gösterim için 0.4x ölçeklendirme
    const scale = 0.4;
    const width = (component.config?.width || 15) * scale;
    const depth = (component.config?.depth || 15) * scale;
    const height = (component.config?.height || 80) * scale;

    // Projedeki renkleri kullan
    const fillColor = component.config?.color ? hexToCSS(component.config.color) :
        (document.body.classList.contains('light-mode') ? '#795548' : '#A1887F');
    const strokeColor = shadeColor(fillColor, -20);

    // 3D kutu çiz (ince ve uzun)
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Metin (orta yükseklikte)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', 0, -height / 2);
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
