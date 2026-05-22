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
    // SARI BORU -> ALTIN VANA
    YELLOW: {
        light: [
            { pos: 0, color: 'rgba(70, 70, 70, 1)' },
            { pos: 0.25, color: 'rgba(120, 50, 5, 1)' },
            { pos: 0.5, color: 'rgba(70, 70, 70, 1)' },
            { pos: 0.75, color: 'rgba(120, 50, 5, 1)' },
            { pos: 1, color: 'rgba(70, 70, 70, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' }, // Tam saf beyaz
            { pos: 0.25, color: 'rgba(245, 235, 200, 1)' }, // Neredeyse beyaz (Çok hafif krem/altın)
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' }, // Tam saf beyaz
            { pos: 0.75, color: 'rgba(245, 235, 200, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }  // Tam saf beyaz
        ]
    },
    // TURKUAZ BORU -> MAVİ VANA
    TURQUAZ: {
        light: [
            { pos: 0, color: 'rgba(70, 70, 70, 1)' },
            { pos: 0.25, color: 'rgba(0, 60, 150, 1)' },
            { pos: 0.5, color: 'rgba(70, 70, 70, 1)' },
            { pos: 0.75, color: 'rgba(0, 60, 150, 1)' },
            { pos: 1, color: 'rgba(70, 70, 70, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(210, 240, 250, 1)' }, // Neredeyse beyaz (Buz mavisine çalan çok açık ton)
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(210, 240, 250, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ]
    },
    // VARSAYILAN 
    DEFAULT: {
        light: [
            { pos: 0, color: 'rgba(70, 70, 70, 1)' },
            { pos: 0.25, color: 'rgba(80, 80, 80, 1)' },
            { pos: 0.5, color: 'rgba(70, 70, 70, 1)' },
            { pos: 0.75, color: 'rgba(80, 80, 80, 1)' },
            { pos: 1, color: 'rgba(70, 70, 70, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(240, 240, 240, 1)' }, // Neredeyse beyaz (sadece vananın şeklini belli edecek ufak bir grilik)
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(240, 240, 240, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
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

        // 3D Perspektif şematiği: cihaz hat doğrultusunda, hattın tam devamında.
        // comp.x/y/z/rotation geçici olarak override edilir; finally'de geri yüklenir.
        // Böylece drawKombi/drawOcak içindeki comp.x/y/rotation referansları da
        // (fleks, getGirisNoktasi) aynı şematik konumu kullanır.
        const persp = (comp.type === 'cihaz' && state.is3DPerspectiveActive)
            ? this._computeCihazPerspSchematic(comp, manager, t)
            : null;
        let _origX, _origY, _origZ, _origRot;
        if (persp) {
            _origX = comp.x; _origY = comp.y; _origZ = comp.z; _origRot = comp.rotation;
            comp.x = persp.x; comp.y = persp.y; comp.z = persp.z; comp.rotation = persp.rotation;
        }

        try {
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
            case 'regulator':
                this.drawRegulator(ctx, comp, manager);
                break;
            case 'cihaz':
                this.drawCihaz(ctx, comp, manager);
                break;
            case 'baca':
                this.drawBaca(ctx, comp, manager);
                break;
            case 'filtre':
            case 'izolasyon_flansi':
            case 'kompansator':
            case 'manometre':
            case 'topraklama':
                this.drawFitting(ctx, comp, manager);
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
        } finally {
            if (persp) {
                comp.x = _origX; comp.y = _origY; comp.z = _origZ; comp.rotation = _origRot;
            }
            ctx.restore();
        }
    },

    /**
     * 3D Perspektif şematik hesabı (TEK YÖN: ÖNDEN, ama HAT DOĞRULTUSUNDA).
     * - Konum: hat ucunun iso-ekran doğrultusunda, fleks + cihaz yarı genişliği
     *   kadar ilerisinde. Hat dikey ise cihaz dikey yönde, yatay ise yatay yönde
     *   uzanır — hangi yön olursa olsun cihaz HATTIN ÖNÜNDE çıkar.
     * - Z = hat ucunun z'si: cihaz hattın kotunda görünür (z=0'a düşmez).
     * - rotation = 0: cihaz hat yönüne göre dönmez, hep ön yüzünü gösterir.
     * Dönüş: { x, y, z, rotation } veya null (hesaplanamazsa).
     */
    _computeCihazPerspSchematic(comp, manager, t) {
        if (!manager || !comp.fleksBaglanti?.boruId || !comp.fleksBaglanti.endpoint) return null;
        const pipe = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
        if (!pipe) return null;
        const ep = comp.fleksBaglanti.endpoint;
        const endpoint = ep === 'p1' ? pipe.p1 : pipe.p2;
        const otherEnd = ep === 'p1' ? pipe.p2 : pipe.p1;

        const dx = endpoint.x - otherEnd.x;
        const dy = endpoint.y - otherEnd.y;
        const dz = (endpoint.z || 0) - (otherEnd.z || 0);
        if (Math.hypot(dx, dy, dz) < 0.1) return null;

        // İso-ekran (z-shift uygulanmış) yönü: cihaz bu yönde uzar.
        // Hat dikey (kolon) → iso-ekranda dikey eğim; cihaz dikey ilerisinde.
        // Hat yatay → iso-ekranda yatay; cihaz yatay ilerisinde.
        const su = dx + dz * t;
        const sv = dy - dz * t;
        const sLen = Math.hypot(su, sv);
        if (sLen < 0.1) return null;
        const ux = su / sLen;
        const uy = sv / sLen;

        const flexLen = comp.fleksBaglanti.uzunluk || 30;
        const halfW = (comp.config?.width || 30) / 2;
        const dist = flexLen + halfW;

        return {
            x: endpoint.x + dist * ux,
            y: endpoint.y + dist * uy,
            z: endpoint.z || 0,
            rotation: 0,
        };
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

        // --- 3D GÖRÜNÜM: 2D çizim kullan (aynı 2D kodu) ---
        // (Eski 3D kutu kodu aşağıda yorum olarak korunmuştur)
        {
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
        }

        /*
        // --- ESKİ 3D KUTU GÖRÜNÜMÜ (DEVRE DIŞI) ---
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
        ctx.lineWidth = 0.5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = strokeStyle;
        ctx.fillStyle = faceFillStyle;

        const p1 = { x: x, y: y };
        const p2 = { x: x + w, y: y };
        const p3 = { x: x + w, y: y + h };
        const p4 = { x: x, y: y + h };

        ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2.x + localZ.x, p2.y + localZ.y); ctx.lineTo(p1.x + localZ.x, p1.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p4.x, p4.y); ctx.lineTo(p4.x + localZ.x, p4.y + localZ.y); ctx.lineTo(p1.x + localZ.x, p1.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x + localZ.x, p3.y + localZ.y); ctx.lineTo(p2.x + localZ.x, p2.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x + localZ.x, p3.y + localZ.y); ctx.lineTo(p4.x + localZ.x, p4.y + localZ.y); ctx.closePath(); ctx.fill(); ctx.stroke();

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

        ctx.save();
        ctx.translate(localZ.x, localZ.y);
        ctx.fillStyle = faceFillStyle;
        ctx.strokeStyle = comp.isSelected ? CUSTOM_COLORS.SELECTED : strokeStyle;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();

        ctx.save();
        if (comp.rotation) { ctx.rotate(-(comp.rotation * Math.PI / 180)); }
        ctx.fillStyle = '#222';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S.K.', 0, 0);
        ctx.restore();
        ctx.restore();
        ctx.restore();
        */
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
        const size = 9.6;
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
// Kapama sembolü (end cap) - vana boru ucunda ve boşta ise
        if (comp.showEndCap) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            let dir = 1;
            let connectedPipe = null;

            // 1. Vana boruya bağlı mı kontrol et (Daha güvenli tespit)
            if (manager) {
                if (comp.bagliBoruId) {
                    connectedPipe = manager.findPipeById(comp.bagliBoruId);
                }
                // Eğer ID ile bulunamadıysa, fiziksel koordinatlarına göre boruyu yakala (Güçlü Fallback)
                if (!connectedPipe && manager.pipes) {
                    connectedPipe = manager.pipes.find(p => 
                        (Math.abs(p.p1.x - comp.x) < 1 && Math.abs(p.p1.y - comp.y) < 1) ||
                        (Math.abs(p.p2.x - comp.x) < 1 && Math.abs(p.p2.y - comp.y) < 1)
                    );
                }
            }

            // 2. Yönü hesapla (3D izdüşümleri de hesaba katarak)
            if (connectedPipe) {
                const t = state.viewBlendFactor || 0;
                
                // Borunun merkezi (3D destekli)
                const p1z = (connectedPipe.p1.z || 0) * t;
                const p2z = (connectedPipe.p2.z || 0) * t;
                const px1 = connectedPipe.p1.x + p1z;
                const py1 = connectedPipe.p1.y - p1z;
                const px2 = connectedPipe.p2.x + p2z;
                const py2 = connectedPipe.p2.y - p2z;
                const pipeMidX = (px1 + px2) / 2;
                const pipeMidY = (py1 + py2) / 2;
                
                // Vananın merkezi (3D destekli)
                const vz = (comp.z || 0) * t;
                const valveX = comp.x + vz;
                const valveY = comp.y - vz;
                
                // Merkeze olan fark
                const dx = pipeMidX - valveX;
                const dy = pipeMidY - valveY;
                
                const rot = (comp.rotation || 0) * Math.PI / 180;
                const dot = dx * Math.cos(rot) + dy * Math.sin(rot);
                
                // Boru, vananın yerel koordinatlarında +X yönündeyse, tapayı -X yönüne (sola) çizmeliyiz.
                // Ufak bir tolerans (0.1) ile float hatalarını engelliyoruz.
                dir = dot > 0.1 ? -1 : 1;
            } else {
                dir = (comp.fromEnd === 'p1') ? -1 : 1;
            }

            // 3. Çizim Aşaması
            ctx.save();
            
            // AYNALAMA: Tapa sol tarafa (-X) çizilecekse, hesaplamaları karıştırmadan 
            // sadece canvas'ı aynalıyoruz. Böylece her zaman güvenli (pozitif) X yönüne çizebiliriz.
            if (dir === -1) {
                ctx.scale(-1, 1);
            }

            const capWidth = 1;
            const capHeight = size;
            const capX = halfSize + 2; // Daima sağ tarafa çiziyoruz, aynalama hallediyor

            let capColor = comp.isSelected ? this.getSecilenRenk(colorGroup) : 
                ((palette.find(s => s.pos === 0.25) || palette[1])?.color || 'rgba(255, 215, 0, 1)');

            ctx.fillStyle = capColor;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 0.2;

            ctx.beginPath();
            // Ana tapa dikdörtgeni
            ctx.rect(capX, -capHeight / 2 - 0.5, capWidth, capHeight + 1);
            // Vana ile tapanın arasındaki flanş bağlantıları
            ctx.rect(capX - 1, -capHeight / 2 - 1, capWidth + 1, 0.5);
            ctx.rect(capX - 1, capHeight / 2 + 0.5, capWidth + 1, 0.5); 
            ctx.fill();
            
            ctx.restore();
        }
    },

    /**
     * Regülatör — daire içinde eşkenar üçgen.
     * Üçgenin bir köşesi tesisatın akış yönünde (sağ).
     */
    drawRegulator(ctx, comp, manager = null) {
        const t = state.viewBlendFactor || 0;
        if (t < 0.1 && manager && comp.bagliBoruId) {
            const pipe = manager.findPipeById(comp.bagliBoruId);
            if (pipe) {
                const dx = pipe.p2.x - pipe.p1.x;
                const dy = pipe.p2.y - pipe.p1.y;
                const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
                const len2d = Math.hypot(dx, dy);
                if (len2d < 2.0 || Math.abs(dz) > len2d) return;
            }
        }

        // 2x büyütüldü
        const radius = 10;
        const triSize = 11.2;
        const h = (Math.sqrt(3) / 2) * triSize;

        // Boru rengini takip et
        let colorGroup = 'YELLOW';
        if (comp.bagliBoruId && manager) {
            const bagliBoru = manager.findPipeById(comp.bagliBoruId);
            if (bagliBoru) colorGroup = bagliBoru.colorGroup || 'YELLOW';
        }
        if (colorGroup === 'SARI') colorGroup = 'YELLOW';
        if (colorGroup === 'TURKUAZ') colorGroup = 'TURQUAZ';

        const mode = isLightMode() ? 'light' : 'dark';
        const theme = VALVE_THEMES[colorGroup] || VALVE_THEMES.DEFAULT;
        const palette = theme[mode];
        const mainColorStop = palette.find(s => s.pos === 0.25) || palette[1];
        const bodyColor = mainColorStop ? mainColorStop.color : '#A0A0A0';
        const strokeColor = 'rgba(40,40,40,0.9)';

        getShadow(ctx);

        // Daire — boru rengiyle dolu
        ctx.fillStyle = comp.isSelected ? this.getSecilenRenk(colorGroup) : bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // Eşkenar üçgen — bir köşe akış yönünde (sağ)
        ctx.fillStyle = comp.isSelected ? '#FFFFFF' : (mode === 'dark' ? '#1a1a1a' : '#FFFFFF');
        ctx.beginPath();
        ctx.moveTo(h * 2 / 3, 0);
        ctx.lineTo(-h / 3, -triSize / 2);
        ctx.lineTo(-h / 3, triSize / 2);
        ctx.closePath();
        ctx.fill();

        // Seçili çerçeve
        if (comp.isSelected) {
            ctx.strokeStyle = this.getSecilenRenk(colorGroup);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    },

    drawSayac(ctx, comp, manager) {
        const { width, height, connectionOffset, nutHeight } = comp.config;
        const zoom = state.zoom || 1;
        const rijitUzunluk = comp.config.rijitUzunluk || (comp.ghostConnectionInfo ? 15 : 0);
        const nutWidth = 7;

        const t = state.viewBlendFactor || 0;
        const rot = (comp.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);

        // --- GLOBAL EKRAN KOORDİNATLARINA DÖNÜŞ ---
        ctx.save();
        const defaultZ = (comp.z || 0) * t;
        if (comp.rotation) ctx.rotate(-rot);
        ctx.translate(-(comp.x + defaultZ), -(comp.y - defaultZ));

        // Tesisat bağlantılarının Y eksenindeki Pivot (Menteşe) Noktası
        const connY = -height / 2;
        const pivotY = connY - nutHeight - rijitUzunluk;

        // Tesisatın Z Kotunu bul
        let pipeZ = comp.z || 0;
        if (manager) {
            if (comp.cikisBagliBoruId) {
                const pipe = manager.findPipeById(comp.cikisBagliBoruId);
                if (pipe) pipeZ = pipe.p1.z || pipe.p2.z || 0;
            } else if (comp.fleksBaglanti?.boruId) {
                const pipe = manager.findPipeById(comp.fleksBaglanti.boruId);
                if (pipe) {
                    const ep = comp.fleksBaglanti.endpoint;
                    const epPoint = ep === 'p1' ? pipe.p1 : ep === 'p2' ? pipe.p2 : null;
                    pipeZ = epPoint !== null ? (epPoint.z !== undefined ? epPoint.z : 0)
                        : (pipe.p1.z || pipe.p2.z || 0);
                }
            }
        }

        // --- 1. FLEKS BORUNUN ÇİZİMİ ---
        let targetScreen = null;
        if (manager && comp.fleksBaglanti?.boruId && comp.fleksBaglanti?.endpoint) {
            const pipe = manager.findPipeById(comp.fleksBaglanti.boruId);
            if (pipe) {
                let targetWorld = comp.getFleksBaglantiNoktasi(pipe);
                if (targetWorld) {
                    if (targetWorld.z === undefined) targetWorld.z = pipeZ;

                    targetScreen = {
                        x: targetWorld.x + targetWorld.z * t,
                        y: targetWorld.y - targetWorld.z * t
                    };
                }
            }
        }

        // Sol rakorun "sarkmış" (folded) halindeki kesin ekran koordinatı
        const lx = -connectionOffset;
        const ly = connY - nutHeight;
        const sx = comp.x + lx * cos - (pivotY * t + ly * (1 - t)) * sin + (pipeZ + pivotY * t - ly * t) * t;
        const sy = comp.y + lx * sin + (pivotY * t + ly * (1 - t)) * cos - (pipeZ + pivotY * t - ly * t) * t;
        const leftRakorScreen = { x: sx, y: sy };

        // Ghost (hayalet) sayacın fleksini yatay değil, aşağı/3D yönünde sarkıt
        if (!targetScreen) {
            const ghostLx = -connectionOffset;
            const ghostLy = pivotY;
            const gSx = comp.x + ghostLx * cos - (pivotY * t + ghostLy * (1 - t)) * sin + (pipeZ + pivotY * t - ghostLy * t) * t;
            const gSy = comp.y + ghostLx * sin + (pivotY * t + ghostLy * (1 - t)) * cos - (pipeZ + pivotY * t - ghostLy * t) * t;
            targetScreen = { x: gSx, y: gSy };
        }

        if (manager) {
            this.drawWavyConnectionLine(ctx, leftRakorScreen, zoom, manager, targetScreen, null);
        }

        // --- 2. SİHİRLİ MATRİS İLE SETİ BÜKME ---
        const a = cos;
        const b = sin;
        const c = -sin * (1 - t) - t * t;
        const d = cos * (1 - t) + t * t;
        const e = comp.x - pivotY * t * sin + pipeZ * t + pivotY * t * t;
        const f = comp.y + pivotY * t * cos - pipeZ * t - pivotY * t * t;

        ctx.transform(a, b, c, d, e, f);
        getShadow(ctx);

        // --- 3. RİJİT ÇIKIŞ BORUSUNUN ÇİZİMİ ---
        let rijitColorGroup = 'TURQUAZ';
        let rightAnchor_lx = connectionOffset;
        let rightAnchor_ly = pivotY;

        if (manager && comp.cikisBagliBoruId) {
            const cikisBoru = manager.findPipeById(comp.cikisBagliBoruId);
            if (cikisBoru) {
                rijitColorGroup = cikisBoru.colorGroup || 'TURQUAZ';
                const wX = comp.x + connectionOffset * cos - pivotY * sin;
                const wY = comp.y + connectionOffset * sin + pivotY * cos;
                const d1 = Math.hypot(cikisBoru.p1.x - wX, cikisBoru.p1.y - wY);
                const d2 = Math.hypot(cikisBoru.p2.x - wX, cikisBoru.p2.y - wY);
                const pipeStart = d1 < d2 ? cikisBoru.p1 : cikisBoru.p2;

                const dx = pipeStart.x - comp.x;
                const dy = pipeStart.y - comp.y;
                rightAnchor_lx = dx * cos + dy * sin;
                rightAnchor_ly = -dx * sin + dy * cos;
            }
        }

        const rijitRenk = this.getRenkByGroup(rijitColorGroup, 'boru', 1);

        // ÇÖZÜM: Siyah çamurlu çerçeve eklemeden, orijinal normal boru kalınlığına (4) çektik
        ctx.lineWidth = 4 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rijitRenk;

        ctx.beginPath();
        ctx.moveTo(rightAnchor_lx, rightAnchor_ly); // Ana Boru Bağlantısı
        ctx.lineTo(connectionOffset, connY - nutHeight); // Sağ Rakor
        ctx.stroke();

        // --- 4. REKORLAR (SOMUNLAR) ---
        const rekorGradient = ctx.createLinearGradient(0, connY - nutHeight, 0, connY);
        rekorGradient.addColorStop(0, '#E8E8E8');
        rekorGradient.addColorStop(1, '#999999');
        ctx.fillStyle = rekorGradient;
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1 / zoom;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight, 1);
        else ctx.rect(-connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight);
        ctx.fill(); ctx.stroke();

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight, 1);
        else ctx.rect(connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight);
        ctx.fill(); ctx.stroke();

// --- 5. SAYAÇ GÖVDESİ (GERÇEKÇİ KÖRÜKLÜ SAYAÇ TASARIMI) ---
        ctx.save();
        
        // 1. Dış Gövde Metalik Görünüm (Açık Gri / Beyaz Çelik Gövde)
        ctx.fillStyle = comp.isSelected ? '#808080' : '#f5f6fa';
        ctx.strokeStyle = comp.isSelected ? '#505050' : '#718093';
        ctx.lineWidth = (comp.isSelected ? 2.5 : 1.5) / zoom;
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const radius = 4;
        if (ctx.roundRect) ctx.roundRect(-width / 2, -height / 2, width, height, radius);
        else ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill(); ctx.stroke();

        // 2. Alt Gövde Kıvrımı (Körüklü sayacın iki sac birleşim bombesi çizgisi)
        if (!comp.isSelected) {
            ctx.strokeStyle = '#b5b8c0';
            ctx.lineWidth = 1 / zoom;
            ctx.beginPath();
            ctx.moveTo(-width / 2, height / 2 - height * 0.25);
            ctx.lineTo(width / 2, height / 2 - height * 0.25);
            ctx.stroke();
        }

        // 3. Numaratör Ekranı (Üst Yarım Alandaki Gösterge Paneli)
        const ew = width * 0.85;
        const eh = height * 0.25;
        ctx.fillStyle = '#dcdde1'; 
        ctx.strokeStyle = '#2f3640';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.rect(-ew / 2, -height / 3, ew, eh);
        ctx.fill(); ctx.stroke();

        
        // Siyah Haneler (Ana metreküp bölmesi - Sol Taraf)
        ctx.fillStyle = '#2f3640';
        ctx.fillRect(-ew / 2 + 1, -height / 3 + 1, ew * 0.72 - 1, eh - 2);
        // 4. Kırmızı Haneler (Gaz tüketim küsurat bölmesi - Sağ Taraf)
        ctx.fillStyle = '#e84118';
        ctx.fillRect(ew / 2 - ew * 0.48, -height / 3 + 1, ew * 0.48 - 1, eh - 2);

        // 5. Sayaç Tipi Yazısı (G4, G6 vb. Numaratörün Altında Marka Logosu Gibi Duracak)
        ctx.shadowBlur = 0;
        ctx.fillStyle = comp.isSelected ? '#fff' : '#2f3640';
        const tipText = comp.sayacTipi || 'G4';
        const tipFontSize = tipText.length <= 3 ? 11 : tipText.length <= 4 ? 9 : 7;
        ctx.font = `bold ${tipFontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tipText, 0, height / 4);

        ctx.restore(); // Körüklü sayaç görsel stil save'ini kapatır

        ctx.restore(); // Fonksiyonun en başındaki ana transform save'ini kapatır
    },
    /**
     * Tesisat aksesuarı (Filtre / İzolasyon Flanşı / Kompansatör / Manometre)
     * Boru üzerinde vana/regülatör gibi konumlanır. Sadece görseldir.
     */
    drawFitting(ctx, comp, manager = null) {
        const t = state.viewBlendFactor || 0;
        if (t < 0.1 && manager && comp.bagliBoruId) {
            const pipe = manager.findPipeById(comp.bagliBoruId);
            if (pipe) {
                const dx = pipe.p2.x - pipe.p1.x;
                const dy = pipe.p2.y - pipe.p1.y;
                const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
                const len2d = Math.hypot(dx, dy);
                if (len2d < 2.0 || Math.abs(dz) > len2d) return;
            }
        }

        // Renk grubu — boru renkine adapte ol
        let colorGroup = 'YELLOW';
        if (comp.bagliBoruId && manager) {
            const bagliBoru = manager.findPipeById(comp.bagliBoruId);
            if (bagliBoru) colorGroup = bagliBoru.colorGroup || 'YELLOW';
        }
        if (colorGroup === 'SARI') colorGroup = 'YELLOW';
        if (colorGroup === 'TURKUAZ') colorGroup = 'TURQUAZ';

        this.drawFittingSymbol(ctx, comp.type, {
            isSelected: comp.isSelected,
            colorGroup,
            direction: comp.direction,
        });
    },

    /**
     * Aksesuar sembolünü çiz (preview ve gerçek nesne için ortak).
     * Local koordinat: boru +X yönünde akıyor; -X giriş, +X çıkış.
     */
    drawFittingSymbol(ctx, type, opts = {}) {
        const { isSelected = false, colorGroup = 'YELLOW', isPreview = false, direction = 1 } = opts;

        const mode = isLightMode() ? 'light' : 'dark';
        const theme = VALVE_THEMES[colorGroup] || VALVE_THEMES.DEFAULT;
        const palette = theme[mode];
        const mainColorStop = palette.find(s => s.pos === 0.25) || palette[1];
        const accent = mainColorStop ? mainColorStop.color : '#A0A0A0';
        const baseStroke = isPreview ? '#00bffa'
            : (isSelected ? CUSTOM_COLORS.SELECTED : (mode === 'dark' ? '#FFFFFF' : '#1a1a1a'));
        const baseFill = isPreview ? '#00bffa'
            : (isSelected ? CUSTOM_COLORS.SELECTED : accent);

        getShadow(ctx);

        // Boru hizasında bir gövde çizmiyoruz — boru zaten arkadaki renkte görünür.
        // Sembol sadece üst katman.
        switch (type) {
            case 'filtre': {
                // Kare içinde nokta deseni (resimdeki gibi)
                const w = 9.5, h = 9.5;
                ctx.fillStyle = baseFill;
                ctx.strokeStyle = baseStroke;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.rect(-w / 2, -h / 2, w, h);
                ctx.fill();
                ctx.stroke();

                // Nokta deseni — beyaz/dark karşıt
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                const dotColor = mode === 'dark' ? '#1a1a1a' : '#FFFFFF';
                ctx.fillStyle = dotColor;
                const cols = 3, rows = 3;
                const dx = w / (cols + 1);
                const dy = h / (rows + 1);
                const r = 0.6;
                for (let i = 1; i <= cols; i++) {
                    for (let j = 1; j <= rows; j++) {
                        ctx.beginPath();
                        ctx.arc(-w / 2 + i * dx, -h / 2 + j * dy, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                break;
            }
            case 'izolasyon_flansi': {
                // İki paralel kısa çizgi: = (boruya dik)
                const len = 10;
                const gap = 2;
                ctx.strokeStyle = baseFill;
                ctx.lineCap = 'round';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-gap / 2, -len / 2);
                ctx.lineTo(-gap / 2, len / 2);
                ctx.moveTo(gap / 2, -len / 2);
                ctx.lineTo(gap / 2, len / 2);
                ctx.stroke();
                break;
            }
            case 'kompansator': {
                // İki uçta dik flanş çizgileri + aralarında borunun yönünde uzanan
                // sinüzoidal dalga. Dalga hat yönünde (lokal X), genlik hatta dik (Y).
                ctx.strokeStyle = baseFill;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 1.4;

                const halfLen = 5.5;     // hat boyunca yarı-uzunluk (X)
                const flansHalf = 4.5;   // uç flanş çizgilerinin yarı yüksekliği (Y)
                const amp = 2.2;         // dalga genliği (Y)
                const cycles = 1;        // tek tam dalga (görseldeki gibi: tepe + çukur)
                const steps = 32;

                // Sol uç flanş
                ctx.beginPath();
                ctx.moveTo(-halfLen, -flansHalf);
                ctx.lineTo(-halfLen, flansHalf);
                // Sağ uç flanş
                ctx.moveTo(halfLen, -flansHalf);
                ctx.lineTo(halfLen, flansHalf);
                ctx.stroke();

                // Dalga
                ctx.beginPath();
                for (let i = 0; i <= steps; i++) {
                    const tt = i / steps;
                    const x = -halfLen + tt * 2 * halfLen;
                    const y = -amp * Math.sin(tt * cycles * Math.PI * 2);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                break;
            }
            case 'topraklama': {
                // Boruya dik çıkan kısa sap + boruya paralel kısa kol +
                // gittikçe kısalan 3 paralel çizgi (klasik toprak sembolü).
                // direction: +1 → +Y (lokal alt), -1 → -Y (lokal üst).
                const sign = direction === -1 ? -1 : 1;
                const STEM = 12;     // boruya dik çıkış
                const VERT = 5;      // boruya paralel iniş (lokal -X yönünde)
                const W1 = 9, W2 = 6, W3 = 3, GAP = 1.8;

                ctx.strokeStyle = baseFill;
                ctx.lineCap = 'round';
                ctx.lineWidth = 1.4;

                // Line 5: borudan dik çıkış (lokal Y)
                const e5x = 0,         e5y = sign * STEM;
                // Line 4: boruya paralel (lokal -X)
                const bx  = e5x - VERT, by = e5y;

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(e5x, e5y);
                ctx.moveTo(e5x, e5y);
                ctx.lineTo(bx, by);
                ctx.stroke();

                // Lines 1-2-3: boruya dik kısalan çizgiler (lokal -X yönünde dizilir)
                [[W1, 0], [W2, GAP], [W3, GAP * 2]].forEach(([hw, off]) => {
                    const lx = bx - off;
                    ctx.beginPath();
                    ctx.moveTo(lx, by - hw);
                    ctx.lineTo(lx, by + hw);
                    ctx.stroke();
                });
                break;
            }
            case 'manometre': {
                // Boruya bağlı küçük daire (saat). Boruya dik kısa bir bağlantı
                // sapı + daire içinde ibre.
                const sapUz = 5;
                const r = 4.2;

                ctx.strokeStyle = baseFill;
                ctx.lineCap = 'round';
                ctx.lineWidth = 1.2;

                // Bağlantı sapı (yukarı)
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -sapUz);
                ctx.stroke();

                // Daire
                ctx.fillStyle = isPreview ? '#00bffa'
                    : (isSelected ? CUSTOM_COLORS.SELECTED : (mode === 'dark' ? '#2a2a2a' : '#FFFFFF'));
                ctx.beginPath();
                ctx.arc(0, -sapUz - r, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // İbre (sağ-yukarı)
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.strokeStyle = mode === 'dark' ? '#FFFFFF' : '#1a1a1a';
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(0, -sapUz - r);
                ctx.lineTo(r * 0.6, -sapUz - r - r * 0.5);
                ctx.stroke();
                break;
            }
        }

        // Seçim çerçevesi
        if (isSelected && !isPreview) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = CUSTOM_COLORS.SELECTED;
            ctx.lineWidth = 0.8;
            ctx.strokeRect(-8, -10, 16, 20);
        }
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
        ctx.strokeStyle = isLightMode() ? '#464545' : '#949191'
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, 0); // Merkezden başla
        ctx.lineTo(0, -handleLength); // Yukarı doğru (negatif Y)
        ctx.stroke();

        // Ucunda tutamaç (daire) - biraz daha küçük
        ctx.fillStyle = isLightMode() ? '#464545' : '#949191'
        ctx.strokeStyle = isLightMode() ? '#181818' : '#ebe8e8'
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
