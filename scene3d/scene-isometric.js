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
    const isoX = x - y * Math.cos(angle);
    const isoY = -z + y * Math.sin(angle);

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

    // Global değişkenleri sakla (mouse hit detection için)
    window._isoRenderParams = { centerX, centerY, zoom, offset };

    // Tesisat bileşenlerini çiz
    ctx.save();

    // Zoom ve offset uygula
    ctx.translate(centerX + offset.x, centerY + offset.y);
    ctx.scale(zoom, zoom);

    // Boruları çiz
    drawIsometricPipes(ctx);

    // Bileşenleri çiz
    drawIsometricComponents(ctx);

    ctx.restore();

    // Bilgi metni
    ctx.save();
    ctx.fillStyle = document.body.classList.contains('light-mode') ? '#666' : '#aaa';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('İzometrik Görünüm - Sadece Tesisat', 10, 10);
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, 10, 30);
    ctx.fillText(`Borular: ${plumbingManager.pipes.length}`, 10, 50);
    ctx.fillText(`Bileşenler: ${plumbingManager.components.length}`, 10, 70);
    ctx.fillText('Sol tuş: Boru uçlarını sürükle | Sağ tuş: Pan', 10, 90);
    ctx.restore();
}

/**
 * Mouse pozisyonunda boru ucu var mı kontrol eder
 * @param {number} mouseX - Canvas içindeki X koordinatı
 * @param {number} mouseY - Canvas içindeki Y koordinatı
 * @returns {{pipe: object, type: string} | null}
 */
window.getIsoEndpointAtMouse = function(mouseX, mouseY) {
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
    return function(...args) {
        window._isoEndpoints = [];
        return oldRender.apply(this, args);
    };
})(renderIsometric);

/**
 * Boruları izometrik perspektifte çizer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function drawIsometricPipes(ctx) {
    if (!plumbingManager || !plumbingManager.pipes) return;
    if (!state) return;

    ctx.strokeStyle = document.body.classList.contains('light-mode') ? '#0066CC' : '#FF8C00';
    ctx.lineWidth = 3;

    plumbingManager.pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;

        // Offset kontrolü
        const offset = state.isoPipeOffsets[pipe.id] || {};
        const startDx = offset.startDx || 0;
        const startDy = offset.startDy || 0;
        const endDx = offset.endDx || 0;
        const endDy = offset.endDy || 0;

        // Başlangıç ve bitiş noktalarını izometrik koordinatlara dönüştür
        let start = toIsometric(pipe.p1.x, pipe.p1.y, 0);
        let end = toIsometric(pipe.p2.x, pipe.p2.y, 0);

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

        // Uç noktaları çiz (daha büyük, sürüklenebilir)
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(start.isoX, start.isoY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(end.isoX, end.isoY, 6, 0, Math.PI * 2);
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

    plumbingManager.components.forEach(component => {
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
            drawServisKutusuIso(ctx);
        } else if (component.type === 'sayac') {
            drawSayacIso(ctx);
        } else if (component.type === 'vana') {
            drawVanaIso(ctx);
        } else if (component.type === 'cihaz') {
            drawCihazIso(ctx, component);
        } else if (component.type === 'baca') {
            drawBacaIso(ctx);
        } else {
            // Bilinmeyen tip için basit bir kare çiz
            drawDefaultComponentIso(ctx);
        }

        ctx.restore();
    });
}

/**
 * İzometrik kutu (3D blok) çizer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Genişlik (X ekseni)
 * @param {number} depth - Derinlik (Y ekseni)
 * @param {number} height - Yükseklik (Z ekseni)
 * @param {string} fillColor - Dolgu rengi
 * @param {string} strokeColor - Kenar rengi
 */
function drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor) {
    const angle = Math.PI / 6; // 30 derece

    // Taban köşe noktaları (düzlem üzerinde)
    const frontLeft = { x: -width / 2, y: 0 };
    const frontRight = { x: width / 2, y: 0 };
    const backLeft = { x: -width / 2 + depth * Math.cos(angle), y: -depth * Math.sin(angle) };
    const backRight = { x: width / 2 + depth * Math.cos(angle), y: -depth * Math.sin(angle) };

    // Üst köşe noktaları
    const topFrontLeft = { x: frontLeft.x, y: frontLeft.y - height };
    const topFrontRight = { x: frontRight.x, y: frontRight.y - height };
    const topBackLeft = { x: backLeft.x, y: backLeft.y - height };
    const topBackRight = { x: backRight.x, y: backRight.y - height };

    ctx.lineWidth = 1.5;

    // Üst yüzey (en açık)
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(topFrontLeft.x, topFrontLeft.y);
    ctx.lineTo(topFrontRight.x, topFrontRight.y);
    ctx.lineTo(topBackRight.x, topBackRight.y);
    ctx.lineTo(topBackLeft.x, topBackLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sol yüzey (orta ton)
    const leftColor = shadeColor(fillColor, -20);
    ctx.fillStyle = leftColor;
    ctx.beginPath();
    ctx.moveTo(frontLeft.x, frontLeft.y);
    ctx.lineTo(topFrontLeft.x, topFrontLeft.y);
    ctx.lineTo(topBackLeft.x, topBackLeft.y);
    ctx.lineTo(backLeft.x, backLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sağ yüzey (en koyu)
    const rightColor = shadeColor(fillColor, -40);
    ctx.fillStyle = rightColor;
    ctx.beginPath();
    ctx.moveTo(frontRight.x, frontRight.y);
    ctx.lineTo(topFrontRight.x, topFrontRight.y);
    ctx.lineTo(topBackRight.x, topBackRight.y);
    ctx.lineTo(backRight.x, backRight.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
 */
function drawServisKutusuIso(ctx) {
    const width = 40;
    const depth = 40;
    const height = 50;
    const fillColor = document.body.classList.contains('light-mode') ? '#4CAF50' : '#66BB6A';
    const strokeColor = document.body.classList.contains('light-mode') ? '#388E3C' : '#81C784';

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
 */
function drawSayacIso(ctx) {
    const width = 30;
    const depth = 30;
    const height = 35;
    const fillColor = document.body.classList.contains('light-mode') ? '#2196F3' : '#64B5F6';
    const strokeColor = document.body.classList.contains('light-mode') ? '#1976D2' : '#90CAF9';

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
 */
function drawVanaIso(ctx) {
    const width = 20;
    const depth = 20;
    const height = 25;
    const fillColor = document.body.classList.contains('light-mode') ? '#FF9800' : '#FFB74D';
    const strokeColor = document.body.classList.contains('light-mode') ? '#F57C00' : '#FFA726';

    // 3D kutu çiz (küçük silindir gibi)
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Üst yüzeye çizgi ekle (vana simgesi)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
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
    const width = 40;
    const depth = 40;
    const height = 60;
    const fillColor = component.cihazTipi === 'KOMBI'
        ? (document.body.classList.contains('light-mode') ? '#9C27B0' : '#BA68C8')
        : (document.body.classList.contains('light-mode') ? '#F44336' : '#E57373');
    const strokeColor = document.body.classList.contains('light-mode') ? '#000' : '#fff';

    // 3D kutu çiz
    drawIsometricBox(ctx, width, depth, height, fillColor, strokeColor);

    // Metin (üst yüzeyde)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(component.cihazTipi === 'KOMBI' ? 'K' : 'O', 0, -height);
}

/**
 * Bacayı izometrik perspektifte çizer (3D ince ve uzun blok)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function drawBacaIso(ctx) {
    const width = 15;
    const depth = 15;
    const height = 80;
    const fillColor = document.body.classList.contains('light-mode') ? '#795548' : '#A1887F';
    const strokeColor = document.body.classList.contains('light-mode') ? '#5D4037' : '#8D6E63';

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
 */
function drawDefaultComponentIso(ctx) {
    const size = 20;
    ctx.fillStyle = document.body.classList.contains('light-mode') ? '#9E9E9E' : '#BDBDBD';
    ctx.strokeStyle = document.body.classList.contains('light-mode') ? '#616161' : '#E0E0E0';
    ctx.lineWidth = 2;

    // Kare
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    // Soru işareti
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0);
}
