// plumbing_v2/renderer-components.js
// Bileşen çizim metodları

import { SERVIS_KUTUSU_CONFIG } from '../objects/service-box.js';
import { SAYAC_CONFIG } from '../objects/meter.js';
import { getRenkGruplari } from '../objects/pipe.js';
import { state, getShadow, THEME_COLORS, isLightMode } from '../../general-files/main.js';

// Seçili eleman rengi
const CUSTOM_COLORS = {
    SELECTED: '#808080', // 0.5 Derece Gri (Tüm seçili elemanlar için)

    METER_GREEN: { // Sayaç - Yeşil Yoğunluklu
        light: { 0: '#E8F5E9', 0.3: '#A5D6A7', 0.7: '#66BB6A', 1: '#2E7D32' },
        dark: { 0: '#E8F5E9', 0.3: '#81C784', 0.7: '#43A047', 1: '#1B5E20' }
    },
    BOX_ORANGE: { // Servis Kutusu - Turuncu Yoğunluklu
        top: '#9c66bbff',
        middle: '#daa2ffff',
        bottom: '#9c66bbff',
        stroke: '#2f203aff'
    },
    DEVICE_BLUE: { // Ocak/Kombi - Mavi Yoğunluklu
        light: { 0: '#E3F2FD', 0.3: '#90CAF9', 0.6: '#42A5F5', 1: '#1565C0' },
        dark: { 0: '#E3F2FD', 0.3: '#64B5F6', 0.6: '#1E88E5', 1: '#0D47A1' }
    }
};

// --- VANA RENK PALETLERİ (Light/Dark Mod Destekli) ---
const VALVE_THEMES = {
    // SARI BORU -> GOLD/SARI VANA
    YELLOW: {
        light: [ // Aydınlık Mod (Daha canlı, parlak)
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(160, 82, 45, 1)' }, // Sienna
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(160, 82, 45, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ],
        dark: [ // Karanlık Mod (Daha metalik, doygun)
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(184, 134, 11, 1)' }, // Dark Goldenrod
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(184, 134, 11, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ]
    },
    // TURKUAZ BORU -> MAVİ VANA
    TURQUAZ: {
        light: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(0, 100, 204, 1)' }, // Dark Blue
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(0, 100, 204, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(21, 154, 172, 1)' }, // Dodger Blue
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(21, 154, 172, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ]
    },
    // VARSAYILAN (Gri/Beyaz)
    DEFAULT: {
        light: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(128, 128, 128, 1)' },
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(128, 128, 128, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(200, 200, 200, 1)' },
            { pos: 0.25, color: 'rgba(80, 80, 80, 1)' },
            { pos: 0.5, color: 'rgba(200, 200, 200, 1)' },
            { pos: 0.75, color: 'rgba(80, 80, 80, 1)' },
            { pos: 1, color: 'rgba(200, 200, 200, 1)' }
        ]
    }
};

export const ComponentMixin = {
    getRenkByGroup(colorGroup, tip, opacity) {
        const renkGruplari = getRenkGruplari(); // Dinamik olarak temaya göre al
        const group = renkGruplari[colorGroup] || renkGruplari.YELLOW;
        const template = group[tip];

        if (template.includes('{opacity}')) {
            return template.replace('{opacity}', opacity);
        }
        return template;
    },

    isLightMode() {
        // main.js'ten import edilen fonksiyonu kullan
        return isLightMode();
    },

    getSecilenRenk(colorGroup) {
        // İsteğiniz üzerine tüm seçili durumlar için standart gri
        return CUSTOM_COLORS.SELECTED;
    },

    drawComponents(ctx, components, manager) {
        if (!components) return;

        // Z-index sıralaması: Bacalar en altta (cihazın altında), sonra diğerleri
        const bacalar = components.filter(c => c.type === 'baca');
        const digerler = components.filter(c => c.type !== 'baca');

        // Önce bacaları çiz (en altta)
        bacalar.forEach(comp => this.drawComponent(ctx, comp, manager));

        // Sonra diğerlerini çiz (üstte)
        digerler.forEach(comp => this.drawComponent(ctx, comp, manager));

        // Servis kutusu çıkış bağlantı noktalarını göster (debug için)
        this.drawBoxConnectionPoints(ctx, components, manager);

        // Seçili bacalar için uç noktaları göster
        bacalar.forEach(baca => {
            if (baca.isSelected) {
                this.drawBacaEndpoints(ctx, baca);
            }
        });
    },

    drawComponent(ctx, comp, manager) {
        ctx.save();
        const t = state.viewBlendFactor || 0;
        const z = (comp.z || 0) * t;
        ctx.translate(comp.x + z, comp.y - z);

        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);
        switch (comp.type) {
            case 'servis_kutusu':
                this.drawServisKutusu(ctx, comp);
                break;
            case 'sayac':
                this.drawSayac(ctx, comp, manager);
                break;
            case 'vana':
                this.drawVana(ctx, comp, manager);
                break;
            case 'cihaz':
                this.drawCihaz(ctx, comp, manager);
                break;
            case 'baca':
                this.drawBaca(ctx, comp, manager);
                break;
        }

        // Seçim göstergesi
        if (comp.isSelected) {
            // Servis kutusu için kesikli çizgi gösterme, renk değişimi yeterli
            if (comp.type !== 'servis_kutusu') {
                this.drawSelectionBox(ctx, comp);
            }
            // Servis kutusu, cihaz ve sayaç için döndürme tutamacı
            if (comp.type === 'servis_kutusu' || comp.type === 'cihaz' || comp.type === 'sayac') {
                this.drawRotationHandles(ctx, comp);
            }
        }

        ctx.restore();
    },

    drawServisKutusu(ctx, comp) {
        const { width, height } = SERVIS_KUTUSU_CONFIG;

        const t = state.viewBlendFactor || 0;

        // --- 2D GÖRÜNÜM (PLAN) ---
        if (t < 0.1) {
            const colors = CUSTOM_COLORS.BOX_ORANGE;
            getShadow(ctx);

            const grad = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
            if (comp.isSelected) {
                grad.addColorStop(0, '#A0A0A0'); grad.addColorStop(0.5, '#808080'); grad.addColorStop(1, '#606060');
                ctx.strokeStyle = '#505050';
            } else {
                grad.addColorStop(0, colors.top); grad.addColorStop(0.5, colors.middle); grad.addColorStop(1, colors.bottom);
                ctx.strokeStyle = colors.stroke;
            }

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(-width / 2, -height / 2, width, height, 4);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.2 / (state.zoom || 1);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.strokeRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6);

            ctx.fillStyle = '#222';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S.K.', 0, 1);
            return;
        }

        // --- 3D GÖRÜNÜM ---

        const boxHeight = 50;
        const currentH = boxHeight * t;
        const screenZVector = { x: currentH, y: -currentH };

        const rotRad = -(comp.rotation || 0) * Math.PI / 180;
        const localZ = {
            x: screenZVector.x * Math.cos(rotRad) - screenZVector.y * Math.sin(rotRad),
            y: screenZVector.x * Math.sin(rotRad) + screenZVector.y * Math.cos(rotRad)
        };

        const r = 2;
        const w = width;
        const h = height;
        const x = -w / 2;
        const y = -h / 2;

        getShadow(ctx);

        const alpha = 0.3;

        const hexToRgba = (hex, a) => {
            let c;
            if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
                c = hex.substring(1).split('');
                if (c.length == 3) { c = [c[0], c[0], c[1], c[1], c[2], c[2]]; }
                c = '0x' + c.join('');
                return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + a + ')';
            }
            return hex;
        };

        const baseColorHex = comp.isSelected ? '#808080' : CUSTOM_COLORS.BOX_ORANGE.middle;
        const strokeColorHex = comp.isSelected ? '#505050' : CUSTOM_COLORS.BOX_ORANGE.stroke;

        const faceFillStyle = hexToRgba(baseColorHex.substring(0, 7), alpha);
        const strokeStyle = hexToRgba(strokeColorHex.substring(0, 7), 0.6);
        const embossSideColor = hexToRgba('#555555', alpha + 0.2);

        ctx.save();
        ctx.lineWidth = 0.5; // İnce çizgi
        ctx.lineJoin = 'round';
        ctx.strokeStyle = strokeStyle;
        ctx.fillStyle = faceFillStyle;

        // Köşeler
        const p1 = { x: x, y: y };
        const p2 = { x: x + w, y: y };
        const p3 = { x: x + w, y: y + h };
        const p4 = { x: x, y: y + h };

        // 1. ARKA YÜZEYLER
        ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();

        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2.x + localZ.x, p2.y + localZ.y); ctx.lineTo(p1.x + localZ.x, p1.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p4.x, p4.y); ctx.lineTo(p4.x + localZ.x, p4.y + localZ.y); ctx.lineTo(p1.x + localZ.x, p1.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();

        // 2. ÖN YÜZEYLER
        ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x + localZ.x, p3.y + localZ.y); ctx.lineTo(p2.x + localZ.x, p2.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x + localZ.x, p3.y + localZ.y); ctx.lineTo(p4.x + localZ.x, p4.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();

        // 3. KABARTMA (EMBOSS) - Yazısız
        const margin = 5; const embossDepth = 1.0; const er = 2;
        const vecW = { x: p3.x - p4.x, y: p3.y - p4.y };
        const vecH = { x: localZ.x, y: localZ.y };
        const wRatio = (w - 2 * margin) / w; const hRatio = (boxHeight - 2 * margin) / boxHeight;
        const startOffsetX = (margin / w) * vecW.x + (margin / boxHeight) * vecH.x;
        const startOffsetY = (margin / w) * vecW.y + (margin / boxHeight) * vecH.y;
        const eBL = { x: p4.x + startOffsetX, y: p4.y + startOffsetY };
        const eBR = { x: eBL.x + wRatio * vecW.x, y: eBL.y + wRatio * vecW.y };
        const eTR = { x: eBR.x + hRatio * vecH.x, y: eBR.y + hRatio * vecH.y };
        const eTL = { x: eBL.x + hRatio * vecH.x, y: eBL.y + hRatio * vecH.y };
        const embossShift = { x: 0, y: embossDepth * 1.5 };
        const oBL = { x: eBL.x + embossShift.x, y: eBL.y + embossShift.y };
        const oBR = { x: eBR.x + embossShift.x, y: eBR.y + embossShift.y };
        const oTR = { x: eTR.x + embossShift.x, y: eTR.y + embossShift.y };
        const oTL = { x: eTL.x + embossShift.x, y: eTL.y + embossShift.y };

        ctx.fillStyle = embossSideColor;
        ctx.beginPath();
        ctx.moveTo(eBL.x, eBL.y); ctx.lineTo(eBR.x, eBR.y); ctx.lineTo(oBR.x, oBR.y); ctx.lineTo(oBL.x, oBL.y);
        ctx.moveTo(eBR.x, eBR.y); ctx.lineTo(eTR.x, eTR.y); ctx.lineTo(oTR.x, oTR.y); ctx.lineTo(oBR.x, oBR.y);
        ctx.moveTo(eTR.x, eTR.y); ctx.lineTo(eTL.x, eTL.y); ctx.lineTo(oTL.x, oTL.y); ctx.lineTo(oTR.x, oTR.y);
        ctx.moveTo(eTL.x, eTL.y); ctx.lineTo(eBL.x, eBL.y); ctx.lineTo(oBL.x, oBL.y); ctx.lineTo(oTL.x, oTL.y);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = faceFillStyle;
        ctx.beginPath();
        ctx.moveTo(oBL.x + er, oBL.y); ctx.lineTo(oBR.x - er, oBR.y); ctx.lineTo(oTR.x - er, oTR.y); ctx.lineTo(oTL.x + er, oTL.y); ctx.closePath();
        ctx.fill(); ctx.stroke();

        // 4. ÜST KAPAK (TAVAN)
        ctx.save();
        ctx.translate(localZ.x, localZ.y);
        ctx.fillStyle = faceFillStyle;
        ctx.strokeStyle = comp.isSelected ? CUSTOM_COLORS.SELECTED : strokeStyle;

        // Kapağı çiz
        ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();

        // --- S.K. YAZISI (TAVAN MERKEZİNDE) ---
        ctx.save();
        // (0,0) şu an tavanın merkezi

        // DÜZ OKUNMASI İÇİN ROTASYONU SIFIRLA
        if (comp.rotation) {
            ctx.rotate(-(comp.rotation * Math.PI / 180));
        }

        ctx.fillStyle = '#222';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillText('S.K.', 0, 0);
        ctx.restore(); // Yazı rotasyonunu geri al

        ctx.restore(); // Tavan transformunu geri al

        ctx.restore(); // Genel
    },

    drawBoxConnectionPoints(ctx, components, manager) {
        if (!components || !manager) return;

        const boxes = components.filter(c => c.type === 'servis_kutusu');

        boxes.forEach(box => {
            // Kutu çıkış noktasını al
            const cikis = box.getCikisNoktasi();

            // Bağlı boruyu bul
            if (box.bagliBoruId) {
                const bagliBoru = manager.pipes.find(p => p.id === box.bagliBoruId);

                if (bagliBoru) {
                    ctx.save();

                    /* // Büyük kırmızı daire - çıkış noktası
                                       ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                                       ctx.strokeStyle = '#FFFFFF';
                                       ctx.lineWidth = 2;
                                       ctx.beginPath();
                                       ctx.arc(cikis.x, cikis.y, 2, 0, Math.PI * 2);
                                       ctx.fill();
                                       ctx.stroke();

                                       // Borunun p1 noktasını yeşil göster
                                       ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
                                       ctx.strokeStyle = '#FFFFFF';
                                       ctx.lineWidth = 2;
                                       ctx.beginPath();
                                       ctx.arc(bagliBoru.p1.x, bagliBoru.p1.y, 5, 0, Math.PI * 2);
                                       ctx.fill();
                                       ctx.stroke();
                   */
                    // İki nokta arasındaki mesafeyi göster
                    const dist = Math.hypot(bagliBoru.p1.x - cikis.x, bagliBoru.p1.y - cikis.y);

                    // Eğer mesafe 0'dan büyükse sarı çizgi çiz
                    if (dist > 0.1) {
                        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.beginPath();
                        ctx.moveTo(cikis.x, cikis.y);
                        ctx.lineTo(bagliBoru.p1.x, bagliBoru.p1.y);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Mesafe yazısı
                        const midX = (cikis.x + bagliBoru.p1.x) / 2;
                        const midY = (cikis.y + bagliBoru.p1.y) / 2;

                        ctx.fillStyle = '#FF0000';
                        ctx.font = 'bold 12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${dist.toFixed(2)} cm`, midX, midY - 10);
                    }

                    ctx.restore();
                }
            }
        });
    },

    lightenColor(color, amount) {
        // Rengi aydınlatma helper fonksiyonu
        // rgba formatı için
        if (color.startsWith('rgba')) {
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                let r = parseInt(match[1]);
                let g = parseInt(match[2]);
                let b = parseInt(match[3]);
                const a = match[4] ? parseFloat(match[4]) : 1;

                r = Math.min(255, Math.floor(r + (255 - r) * amount));
                g = Math.min(255, Math.floor(g + (255 - g) * amount));
                b = Math.min(255, Math.floor(b + (255 - b) * amount));

                return `rgba(${r}, ${g}, ${b}, ${a})`;
            }
        }
        // rgb formatı için
        if (color.startsWith('rgb')) {
            const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                let r = parseInt(match[1]);
                let g = parseInt(match[2]);
                let b = parseInt(match[3]);

                r = Math.min(255, Math.floor(r + (255 - r) * amount));
                g = Math.min(255, Math.floor(g + (255 - g) * amount));
                b = Math.min(255, Math.floor(b + (255 - b) * amount));

                return `rgb(${r}, ${g}, ${b})`;
            }
        }
        // hex formatı için
        if (color.startsWith('#')) {
            const hex = color.substring(1);
            let r = parseInt(hex.substring(0, 2), 16);
            let g = parseInt(hex.substring(2, 4), 16);
            let b = parseInt(hex.substring(4, 6), 16);

            r = Math.min(255, Math.floor(r + (255 - r) * amount));
            g = Math.min(255, Math.floor(g + (255 - g) * amount));
            b = Math.min(255, Math.floor(b + (255 - b) * amount));

            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        return color;
    },

    drawVana(ctx, comp, manager = null) {
        const t = state.viewBlendFactor || 0;
        if (t < 0.1 && manager && comp.bagliBoruId) {
            const pipe = manager.findPipeById(comp.bagliBoruId);
            if (pipe) {
                const dx = pipe.p2.x - pipe.p1.x;
                const dy = pipe.p2.y - pipe.p1.y;
                const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
                const len2d = Math.hypot(dx, dy);
                // Düşey boru kriteri
                if (len2d < 2.0 || Math.abs(dz) > len2d) {
                    return;
                }
            }
        }
        const size = 12;
        const halfSize = size / 2;

        // 1. Boru Rengini Tespit Et
        let colorGroup = 'YELLOW';
        if (comp.bagliBoruId && manager) {
            const bagliBoru = manager.findPipeById(comp.bagliBoruId);
            if (bagliBoru) {
                colorGroup = bagliBoru.colorGroup || 'YELLOW';
            }
        }
        // Renk isimlerini standartlaştır
        if (colorGroup === 'SARI') colorGroup = 'YELLOW';
        if (colorGroup === 'TURKUAZ') colorGroup = 'TURQUAZ';
        if (colorGroup === 'MAVI') colorGroup = 'BLUE';
        if (colorGroup === 'TURUNCU') colorGroup = 'ORANGE';

        // 2. Modu Tespit Et (Light/Dark)
        const mode = isLightMode() ? 'light' : 'dark';

        // 3. Uygun Temayı Seç
        const theme = VALVE_THEMES[colorGroup] || VALVE_THEMES.DEFAULT;
        const palette = theme[mode];

        // 4. Gradient Oluştur
        const gradient = ctx.createConicGradient(0, 0, 0);

        if (comp.isSelected) {
            // Seçiliyse GRİ tonlama (veya seçili renk)
            const secilenRenk = this.getSecilenRenk(colorGroup);
            // Seçili durumda düz renk veya özel bir gradient kullanabilirsiniz
            // Burada basitçe seçilen rengi kullanıyoruz, ama gradient istenirse buraya eklenebilir.
            ctx.fillStyle = secilenRenk;
        } else {
            // Normal durumda paleti uygula
            palette.forEach(s => gradient.addColorStop(s.pos, s.color));
            ctx.fillStyle = gradient;

        }

        getShadow(ctx);

        // Şekli Çiz
        ctx.beginPath();
        ctx.moveTo(-halfSize, -halfSize);
        ctx.lineTo(-halfSize, halfSize);
        ctx.lineTo(0, 1);
        ctx.lineTo(halfSize, halfSize);
        ctx.lineTo(halfSize, -halfSize);
        ctx.lineTo(0, -1);
        ctx.closePath();
        ctx.fill();

        // Seçili çerçeve
        if (comp.isSelected) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            const secilenRenk = this.getSecilenRenk(colorGroup);
            ctx.strokeStyle = secilenRenk;
            ctx.lineWidth = 1;
            ctx.strokeRect(-halfSize - 1, -halfSize - 1, size + 2, size + 2);
        }

        // Kapama sembolü (end cap) - vana boru ucunda ve boşta ise
        if (comp.showEndCap) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Kapama pozisyonu: vananın sağ tarafı (çıkış)
            const capX = halfSize + 2; // 0.5 cm boşluk
            const capWidth = 1; // cm - kalın, belirgin
            const capHeight = size; // cm - vana ile aynı yükseklikte

            // Boruyla aynı renkte kapama çiz
            // Palette'in ilk rengini kullan (beyaz hariç, sonraki renk)
            let capColor;
            if (comp.isSelected) {
                capColor = this.getSecilenRenk(colorGroup);
            } else {
                // Palette'den ana rengi al (pozisyon 0.25'teki renk genellikle ana renk)
                const mainColorStop = palette.find(s => s.pos === 0.25) || palette[1];
                capColor = mainColorStop ? mainColorStop.color : 'rgba(255, 215, 0, 1)';
            }

            ctx.fillStyle = capColor;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 0.2;

            // Dikdörtgen kapama çiz
            ctx.beginPath();
            ctx.rect(capX, -capHeight / 2 - 0.5, capWidth, capHeight + 1);
            ctx.rect(capX - 1, -capHeight / 2 - 1, capWidth + 1, 0.5);
            ctx.rect(capX - 1, capHeight / 2 + 1, capWidth + 1, -0.5);
            ctx.fill();
            //ctx.stroke();
        }
    },

    drawSayac(ctx, comp, manager) {
        const { width, height, connectionOffset, nutHeight } = comp.config;
        const zoom = state.zoom || 1;
        const rijitUzunluk = comp.config.rijitUzunluk || (comp.ghostConnectionInfo ? 15 : 0);

        if (manager) {
            ctx.save();
            if (comp.rotation) ctx.rotate(-comp.rotation * Math.PI / 180);
            ctx.translate(-comp.x, -comp.y);

            let targetPoint = null;
            if (comp.fleksBaglanti?.boruId && comp.fleksBaglanti?.endpoint) {
                const pipe = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
                if (pipe) {
                    targetPoint = comp.getFleksBaglantiNoktasi(pipe);
                } else {
                    if (!comp._fleksWarningLogged) {
                        // console.warn('⚠️ SAYAÇ FLEKS: Boru bulunamadı!', comp.fleksBaglanti.boruId);
                        comp._fleksWarningLogged = true;
                    }
                }
            } else {
                if (!comp._fleksWarningLogged2) {
                    //console.warn('⚠️ SAYAÇ FLEKS: Bağlantı bilgisi eksik!', comp.fleksBaglanti);
                    comp._fleksWarningLogged2 = true;
                }
            }

            const connectionPoint = comp.getSolRakorNoktasi();
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint, null);
            ctx.restore();
        }

        ctx.save();
        getShadow(ctx);

        // Yeşil Gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) / 1.5);
        const colors = isLightMode() ? CUSTOM_COLORS.METER_GREEN.light : CUSTOM_COLORS.METER_GREEN.dark;

        if (comp.isSelected) {
            // Seçili: Gri
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.4, '#C0C0C0');
            gradient.addColorStop(0.7, '#A0A0A0');
            gradient.addColorStop(1, '#606060');
        } else {
            // Normal: Yeşil
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(0.3, colors[0.3]);
            gradient.addColorStop(0.7, colors[0.7]);
            gradient.addColorStop(1, colors[1]);
        }

        ctx.fillStyle = gradient;
        const radius = 4;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-width / 2, -height / 2, width, height, radius);
        else ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();

        ctx.lineWidth = 1.2 / zoom;
        ctx.strokeStyle = comp.isSelected ? CUSTOM_COLORS.SELECTED : colors[1];
        ctx.stroke();

        // G4 Yazısı
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#222';
        ctx.font = `bold 12px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G4', 0, 2);

        // Rekorlar ve Çıkış Borusu
        const connY = -height / 2;
        const nutWidth = 7;
        const rekorGradient = ctx.createLinearGradient(0, connY - nutHeight, 0, connY);
        rekorGradient.addColorStop(0, '#E8E8E8');
        rekorGradient.addColorStop(1, '#999999');
        ctx.fillStyle = rekorGradient;
        ctx.strokeStyle = '#555';

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight, 1);
        else ctx.rect(-connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight);
        ctx.fill(); ctx.stroke();

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight, 1);
        else ctx.rect(connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight);
        ctx.fill(); ctx.stroke();

        // Rijit Çıkış Rengi
        const armStartX = connectionOffset;
        const armStartY = connY - nutHeight;
        let rijitColorGroup = 'TURQUAZ';
        if (comp.cikisBagliBoruId && manager) {
            const cikisBoru = manager.findPipeById(comp.cikisBagliBoruId);
            if (cikisBoru) rijitColorGroup = cikisBoru.colorGroup || 'TURQUAZ';
        }
        const rijitRenk = this.getRenkByGroup(rijitColorGroup, 'fleks', 1);

        // Rijit boru gradienti (hafif metalik)
        const pipeGradient = ctx.createLinearGradient(armStartX - 0.5, 0, armStartX + 0.5, 0);
        pipeGradient.addColorStop(0, rijitRenk);
        pipeGradient.addColorStop(0.5, rijitRenk);
        pipeGradient.addColorStop(1, rijitRenk);

        ctx.fillStyle = pipeGradient;
        ctx.fillRect(armStartX - 0.5, armStartY - rijitUzunluk, 1, rijitUzunluk);

        ctx.restore();
    },

    drawSelectionBox(ctx, comp) {
        // const bbox = comp.getBoundingBox ? comp.getBoundingBox() : null;
        // if (!bbox) return;

        // // Koordinatları local'e çevir
        // const w = bbox.maxX - bbox.minX;
        // const h = bbox.maxY - bbox.minY;

        // ctx.strokeStyle = this.secilenRenk;
        // ctx.lineWidth = 1;
        // ctx.setLineDash([3, 3]);
        // ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
        // ctx.setLineDash([]);
    },

    drawRotationHandles(ctx, comp) {
        let handleLength;

        if (comp.type === 'servis_kutusu') {
            const { height } = SERVIS_KUTUSU_CONFIG;
            handleLength = height / 2 + 10; // 10cm dışarıda
        } else if (comp.type === 'cihaz') {
            // Cihaz için: 30 cm çapında, handle 20 cm yukarıda (yarıya düşürüldü)
            handleLength = 15 + 20; // radius + 20cm = 35cm
        } else if (comp.type === 'sayac') {
            // Sayaç için: handle merkezden yukarıda
            handleLength = -20; // 12 + 20 = 32cm
        } else {
            return; // Diğer tipler için handle çizme
        }

        // Çubuğu çiz (merkezden yukarı doğru, local koordinatlarda)
        ctx.strokeStyle = this.secilenRenk;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, 0); // Merkezden başla
        ctx.lineTo(0, -handleLength); // Yukarı doğru (negatif Y)
        ctx.stroke();

        // Ucunda tutamaç (daire) - biraz daha küçük
        ctx.fillStyle = this.secilenRenk;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -handleLength, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    },

    drawBacaEndpoints(ctx, baca) {
        // Baca segment uç noktalarını küçük noktalarla göster (seçili bacalar için) - 3D izdüşüm ile
        const r = 1.6; // Küçük nokta
        const themeColors = this.isLightMode() ? THEME_COLORS.light : THEME_COLORS.dark;
        const t = state.viewBlendFactor || 0;

        ctx.fillStyle = themeColors.pipeEndpoint;
        ctx.strokeStyle = themeColors.pipeEndpointStroke;
        ctx.lineWidth = 1;

        // Her segment için uç noktaları çiz (3D izdüşüm ile)
        baca.segments.forEach((segment, index) => {
            const z1 = segment.z1 || baca.z || 0;
            const z2 = segment.z2 || baca.z || 0;
            const screenX1 = segment.x1 + (z1 * t);
            const screenY1 = segment.y1 - (z1 * t);
            const screenX2 = segment.x2 + (z2 * t);
            const screenY2 = segment.y2 - (z2 * t);

            // Segment başlangıcı (ilk segment hariç - cihaza bağlı)
            if (index > 0) {
                ctx.beginPath();
                ctx.arc(screenX1, screenY1, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // Segment sonu (her zaman göster)
            ctx.beginPath();
            ctx.arc(screenX2, screenY2, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }
};
