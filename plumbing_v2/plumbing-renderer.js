import { BORU_TIPLERI } from './objects/pipe.js';
import { SERVIS_KUTUSU_CONFIG, CIKIS_YONLERI } from './objects/service-box.js';
import { SAYAC_CONFIG } from './objects/meter.js';
import { VANA_CONFIG, VANA_TIPLERI } from './objects/valve.js';
import { CIHAZ_TIPLERI, FLEKS_CONFIG } from './objects/device.js';
import { getAdjustedColor, state } from '../general-files/main.js';

export class PlumbingRenderer {
    constructor() {
        this.secilenRenk = '#00BFFF'; // Seçili nesne rengi
    }

    render(ctx, manager) {
        if (!manager) return;

        // MİMARİ modunda tesisat nesneleri soluk görünmeli
        const shouldBeFaded = state.currentDrawingMode === 'MİMARİ';

        if (shouldBeFaded) {
            ctx.save();
            ctx.globalAlpha = 0.35; // Biraz daha görünür (önceden 0.15)
        }

        // Borular
        this.drawPipes(ctx, manager.pipes);

        // Bileşenler
        this.drawComponents(ctx, manager.components);

        // Geçici boru çizgisi (boru çizim modunda)
        const geciciBoru = manager.interactionManager?.getGeciciBoruCizgisi();
        if (geciciBoru) {
            this.drawGeciciBoru(ctx, geciciBoru);
        }

        if (shouldBeFaded) {
            ctx.restore();
        }

        // Boru ölçüleri (MİMARİ modunda veya dimensionMode=0 ise gizle)
        const showMeasurements = !shouldBeFaded && state.dimensionMode !== 0;
        if (showMeasurements) {
            this.drawPipeMeasurements(ctx, manager.pipes);

            // Geçici boru ölçüsü
            if (geciciBoru) {
                this.drawTempPipeMeasurement(ctx, geciciBoru);
            }
        }

        // Ghost eleman (her zaman yarı saydam)
        if (manager.tempComponent) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            this.drawComponent(ctx, manager.tempComponent);
            ctx.restore();
        }

        // Snap göstergesi (her zaman normal)
        const activeSnap = manager.interactionManager?.activeSnap;
        if (activeSnap) {
            this.drawSnapIndicator(ctx, activeSnap);
        }

        // Ölçü girişi göstergesi
        if (manager.interactionManager?.measurementActive) {
            this.drawMeasurementInput(ctx, manager.interactionManager);
        }
    }

    drawPipes(ctx, pipes) {
        if (!pipes) return;

        // Önce kırılım noktalarını bul (birden fazla borunun birleştiği noktalar)
        const breakPoints = this.findBreakPoints(pipes);

        pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;
            
            // Çizim moduna göre renk ayarla
            const adjustedColor = getAdjustedColor(config.color, 'boru');
            
            // Boru geometrisi
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const width = config.lineWidth;

            ctx.save();
            
            // Koordinat sistemini borunun başlangıcına taşı ve döndür
            ctx.translate(pipe.p1.x, pipe.p1.y);
            ctx.rotate(angle);

            if (pipe.isSelected) {
                // Seçiliyse basit düz renk (mavi) çiz
                ctx.fillStyle = this.secilenRenk;
                ctx.fillRect(0, -width / 2, length, width);
            } else {
                // Gradient ile 3D silindir etkisi (Kenarlarda yumuşak siyahlık)
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
                
                // Kenarlarda hafif karartma, ortası boru rengi
                // Geçişler yumuşak tutuldu
                gradient.addColorStop(0.0, 'rgba(255, 255,0,  0.3)'); 
                gradient.addColorStop(0.5,  'rgba(255, 255,0,  1)');  
                gradient.addColorStop(1, 'rgba( 255, 255,0,  0.3)');  
                // gradient.addColorStop(0.0, 'rgba(0,255, 255,  0.3)'); 
                // gradient.addColorStop(0.5,  'rgba(0, 255, 255, 1)');  
                // gradient.addColorStop(1, 'rgba( 0, 255, 255, 0.3)');  

                ctx.fillStyle = gradient;
                ctx.fillRect(0, -width / 2, length, width);
            }

            ctx.restore();
        });

        // Dirsek görüntülerini çiz
        this.drawElbows(ctx, pipes, breakPoints);
    }

    findBreakPoints(pipes) {
        const pointMap = new Map();
        const tolerance = 0.5;

        pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;

            // p1 noktası
            const key1 = `${Math.round(pipe.p1.x / tolerance) * tolerance},${Math.round(pipe.p1.y / tolerance) * tolerance}`;
            if (!pointMap.has(key1)) {
                pointMap.set(key1, { x: pipe.p1.x, y: pipe.p1.y, pipes: [], directions: [], diameters: [] });
            }
            const entry1 = pointMap.get(key1);
            entry1.pipes.push(pipe);
            entry1.directions.push(Math.atan2(pipe.p2.y - pipe.p1.y, pipe.p2.x - pipe.p1.x));
            entry1.diameters.push(config.diameter);

            // p2 noktası
            const key2 = `${Math.round(pipe.p2.x / tolerance) * tolerance},${Math.round(pipe.p2.y / tolerance) * tolerance}`;
            if (!pointMap.has(key2)) {
                pointMap.set(key2, { x: pipe.p2.x, y: pipe.p2.y, pipes: [], directions: [], diameters: [] });
            }
            const entry2 = pointMap.get(key2);
            entry2.pipes.push(pipe);
            entry2.directions.push(Math.atan2(pipe.p1.y - pipe.p2.y, pipe.p1.x - pipe.p2.x));
            entry2.diameters.push(config.diameter);
        });

        // Sadece 2 veya daha fazla borunun birleştiği noktaları döndür
        const breakPoints = [];
        pointMap.forEach(entry => {
            if (entry.pipes.length >= 2) {
                breakPoints.push(entry);
            }
        });

        return breakPoints;
    }

    drawElbows(ctx, pipes, breakPoints) {
        // Çizim moduna göre renk ayarla (Orijinal düz renk yapısı korundu)
        // const adjustedGray = getAdjustedColor('rgba(0, 133, 133, 1)', 'boru');
        const adjustedGray = getAdjustedColor('rgba(155, 155, 0, 1)', 'boru');

        
        ctx.fillStyle = adjustedGray;

        breakPoints.forEach(bp => {
            // En büyük genişliği bul (merkez daire için)
            let maxArmWidth = 0;

            // Her yön için dirsek kolu çiz
            for (let i = 0; i < bp.directions.length; i++) {
                const angle = bp.directions[i];
                const diameter = bp.diameters[i];

                // Boyutlar (cm cinsinden)
                const armLength = 3;      // 3 cm kol uzunluğu
                const armExtraWidth = 1;  // Sağdan soldan 1 cm fazla (toplam 2 cm)

                const armWidth = diameter + armExtraWidth * 2;

                if (armWidth > maxArmWidth) maxArmWidth = armWidth;

                ctx.save();
                ctx.translate(bp.x, bp.y);
                ctx.rotate(angle);

                // 3 cm'lik ana kol (dikdörtgen)
                ctx.fillStyle = adjustedGray;
                ctx.fillRect(0, -armWidth / 2, armLength, armWidth);

                // Uçta kalın çizgi (sağdan soldan 0.2 cm taşan, 1.5x kalın)
                const lineWidth = armWidth + 0.4; // 0.2 cm her taraftan
                const lineThickness = 1.5;
                ctx.fillRect(armLength - 0.2, -lineWidth / 2, lineThickness, lineWidth);

                ctx.restore();
            }

            // Merkeze daire çiz (boşluğu kapat)
            ctx.fillStyle = adjustedGray;
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, maxArmWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawPipeEndpoints(ctx, pipe) {
        ctx.fillStyle = '#333';
        const r = 2;

        ctx.beginPath();
        ctx.arc(pipe.p1.x, pipe.p1.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pipe.p2.x, pipe.p2.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    drawGeciciBoru(ctx, geciciBoru) {
        ctx.save();
        
        // Geçici boru için de aynı stil
        const width = 4;
        const dx = geciciBoru.p2.x - geciciBoru.p1.x;
        const dy = geciciBoru.p2.y - geciciBoru.p1.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        ctx.translate(geciciBoru.p1.x, geciciBoru.p1.y);
        ctx.rotate(angle);

        // Aynı yumuşak gradient
        const gradient = ctx.createLinearGradient(0, -width/2, 0, width/2);
                // gradient.addColorStop(0.0, 'rgba(0,255, 255,  0.3)'); 
                // gradient.addColorStop(0.5,  'rgba(0, 255, 255, 1)');  
                // gradient.addColorStop(1, 'rgba( 0, 255, 255, 0.3)');  
                gradient.addColorStop(0.0, 'rgba(255, 255, 0, 0.3)'); 
                gradient.addColorStop(0.5,  'rgba(255, 255, 0, 1)');  
                gradient.addColorStop(1, 'rgba(255, 255, 0, 0.3)');  
        ctx.fillStyle = gradient;
        ctx.fillRect(0, -width/2, length, width);

        ctx.restore();
    }

    drawComponents(ctx, components) {
        if (!components) return;
        components.forEach(comp => this.drawComponent(ctx, comp));
    }

    drawComponent(ctx, comp) {
        ctx.save();

        ctx.translate(comp.x, comp.y);
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        switch (comp.type) {
            case 'servis_kutusu':
                this.drawServisKutusu(ctx, comp);
                break;
            case 'sayac':
                this.drawSayac(ctx, comp);
                break;
            case 'vana':
                this.drawVana(ctx, comp);
                break;
            case 'cihaz':
                this.drawCihaz(ctx, comp);
                break;
        }

        // Seçim göstergesi
        if (comp.isSelected) {
            this.drawSelectionBox(ctx, comp);
        }

        ctx.restore();
    }

    drawServisKutusu(ctx, comp) {
        const { width, height, color } = SERVIS_KUTUSU_CONFIG;
        
        ctx.shadowColor = 'rgba(0, 0, 0, 1)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Ana kutu
        const adjustedColor = getAdjustedColor("rgba(206, 206, 206, 1)", 'servis_kutusu');
        //const adjustedColor = getAdjustedColor("#0390a3", 'servis_kutusu');
        const adjustedStroke = getAdjustedColor('#fff', 'servis_kutusu');
       
        ctx.fillStyle = adjustedColor;
        ctx.strokeStyle = comp.isSelected ? this.secilenRenk : adjustedStroke;
        ctx.lineWidth = 2;
 

        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        //ctx.stroke();

        // Orta kısım - kabartmalı efekt için shadow ile
        const innerMargin = 4; // Kenarlardan boşluk
        const innerWidth = width - (innerMargin * 2);
        const innerHeight = height - (innerMargin * 2);

        // Shadow ayarları
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 1)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // İç dikdörtgen (biraz daha açık renk)
        const innerColor = this.lightenColor(adjustedColor, 0.3);
        ctx.fillStyle = innerColor;
        ctx.beginPath();
        ctx.rect(-innerWidth / 2, -innerHeight / 2, innerWidth, innerHeight);
        ctx.fill();
        ctx.restore();

        // "S.K." yazısı
        const adjustedText = getAdjustedColor('#000', 'servis_kutusu');
        ctx.fillStyle = adjustedText;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S.K', 0, 0);

        // Çıkış noktası göstergesi - sadece boru bağlı değilse göster, boru çapında
        if (!comp.cikisKullanildi) {
            const cikisLocal = comp.getCikisLocalKoordinat();
           // const adjustedYellow = getAdjustedColor('#0390a3', 'servis_kutusu');
            const adjustedYellow = getAdjustedColor('rgba(255, 251, 0, 1)', 'servis_kutusu');
            ctx.fillStyle = adjustedYellow;
            ctx.beginPath();
            // Boru çapı 2cm, yarıçap 1cm
            ctx.arc(cikisLocal.x, cikisLocal.y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

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
    }

    drawSayac(ctx, comp) {
        const { width, height, color } = SAYAC_CONFIG;

        // Giriş kolu çiz
        const girisKol = comp.girisKolUzunlugu || 10;
        const adjustedGray = getAdjustedColor('#666', 'sayac');
        ctx.strokeStyle = adjustedGray;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-width / 2, 0);
        ctx.lineTo(-width / 2 - girisKol, 0);
        ctx.stroke();

        // Sayaç gövdesi
        const adjustedColor = getAdjustedColor(color, 'sayac');
        const adjustedStroke = getAdjustedColor('#333', 'sayac');
        ctx.fillStyle = adjustedColor;
        ctx.strokeStyle = comp.isSelected ? this.secilenRenk : adjustedStroke;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // İç gösterge
        const adjustedWhite = getAdjustedColor('#fff', 'sayac');
        ctx.fillStyle = adjustedWhite;
        ctx.beginPath();
        ctx.arc(0, 0, width / 3, 0, Math.PI * 2);
        ctx.fill();

        // Sayaç ikonu
        const adjustedText = getAdjustedColor('#333', 'sayac');
        ctx.fillStyle = adjustedText;
        ctx.font = '6px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('m³', 0, 0);
    }

    drawVana(ctx, comp) {
        const { width, height, color } = VANA_CONFIG;
        const tipBilgisi = VANA_TIPLERI[comp.vanaTipi] || VANA_TIPLERI.AKV;

        const adjustedColor = getAdjustedColor(color, 'vana');
        ctx.fillStyle = adjustedColor;

        // Kelebek vana şekli
        ctx.beginPath();
        ctx.moveTo(-width, -height / 2);
        ctx.lineTo(-width, height / 2);
        ctx.lineTo(0, 0);
        ctx.lineTo(width, height / 2);
        ctx.lineTo(width, -height / 2);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        // Sonlanma vanası - kapama sembolü
        if (tipBilgisi.sembol === 'kapama') {
            const adjustedRed = getAdjustedColor('#FF0000', 'vana');
            ctx.strokeStyle = adjustedRed;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(width + 2, -height);
            ctx.lineTo(width + 2, height);
            ctx.stroke();
        }

        // Selenoid vana - elektrik sembolü
        if (tipBilgisi.sembol === 'elektrik') {
            const adjustedBlue = getAdjustedColor('#0000FF', 'vana');
            ctx.strokeStyle = adjustedBlue;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -height - 2);
            ctx.lineTo(0, -height - 6);
            ctx.stroke();

            // Şimşek
            ctx.fillStyle = adjustedBlue;
            ctx.font = '6px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', 0, -height - 8);
        }
    }

    drawCihaz(ctx, comp) {
        const config = CIHAZ_TIPLERI[comp.cihazTipi] || CIHAZ_TIPLERI.KOMBI;
        const { width, height, color } = config;

        // Fleks çizgisi
        ctx.restore(); // Rotasyonu kaldır fleks için
        ctx.save();
        ctx.translate(comp.x, comp.y);

        const fleks = comp.getFleksCizgi();
        if (fleks) {
            const adjustedFleksRenk = getAdjustedColor(FLEKS_CONFIG.renk, 'cihaz');
            ctx.strokeStyle = adjustedFleksRenk;
            ctx.lineWidth = FLEKS_CONFIG.kalinlik;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(fleks.baslangic.x - comp.x, fleks.baslangic.y - comp.y);
            ctx.lineTo(fleks.bitis.x - comp.x, fleks.bitis.y - comp.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Rotasyonu uygula
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        // Cihaz gövdesi
        const adjustedColor = getAdjustedColor(color, 'cihaz');
        const adjustedStroke = getAdjustedColor('#333', 'cihaz');
        ctx.fillStyle = adjustedColor;
        ctx.strokeStyle = comp.isSelected ? this.secilenRenk : adjustedStroke;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        ctx.stroke();

        // Cihaz adı
        const adjustedText = getAdjustedColor('#000', 'cihaz');
        ctx.fillStyle = adjustedText;
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.name, 0, 0);

        // Baca göstergesi
        if (config.bacaGerekli) {
            const adjustedBaca = getAdjustedColor('#666', 'cihaz');
            ctx.fillStyle = adjustedBaca;
            ctx.beginPath();
            ctx.rect(-5, -height / 2 - 10, 10, 10);
            ctx.fill();
        }
    }

    drawSelectionBox(ctx, comp) {
        const bbox = comp.getBoundingBox ? comp.getBoundingBox() : null;
        if (!bbox) return;

        // Koordinatları local'e çevir
        const w = bbox.maxX - bbox.minX;
        const h = bbox.maxY - bbox.minY;

        ctx.strokeStyle = this.secilenRenk;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
        ctx.setLineDash([]);
    }

    drawSnapIndicator(ctx, snap) {
        // Snap göstergesi kaldırıldı - kullanıcı istemiyor
    }

    /**
     * Boru üzerinde ölçü gösterimi
     */
    drawPipeMeasurements(ctx, pipes) {
        if (!pipes) return;

        const zoom = state.zoom || 1;
        const baseFontSize = 10;
        const ZOOM_EXPONENT = -0.65;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5;

        pipes.forEach(pipe => {
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const length = Math.hypot(dx, dy);

            // Çok kısa borularda ölçü gösterme
            if (length < 10) return;

            // Borunun ortası
            const midX = (pipe.p1.x + pipe.p2.x) / 2;
            const midY = (pipe.p1.y + pipe.p2.y) / 2;

            // Boru açısı
            const angle = Math.atan2(dy, dx);

            // Boru genişliği
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;
            const width = config.lineWidth;

            // Ölçü offset (boruya temas etmeden, en yakınına)
            const offset = width / 2 - 8; // 1cm yukarı

            // Normal vektör (boruya dik)
            const normalX = -Math.sin(angle);
            const normalY = Math.cos(angle);

            // Yazı pozisyonu (borunun üstünde)
            const textX = midX + normalX * offset;
            const textY = midY + normalY * offset;

            ctx.save();
            ctx.translate(textX, textY);
            ctx.rotate(angle);

            // Açıyı düzelt (ters yazmasın)
            if (Math.abs(angle) > Math.PI / 2) {
                ctx.rotate(Math.PI);
            }

            // Font ayarla
            const actualFontSize = Math.max(minWorldFontSize, fontSize);
            ctx.font = `400 ${actualFontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

            // Rounded length
            const roundedLength = Math.round(length);
            const displayText = roundedLength.toString();

            // Yazıyı çiz (arka plan yok)
            const adjustedTextColor = getAdjustedColor('#ffffff', 'boru');
            ctx.fillStyle = adjustedTextColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(displayText, 0, 0);

            ctx.restore();
        });
    }

    /**
     * Geçici boru ölçüsü (çizim sırasında)
     */
    drawTempPipeMeasurement(ctx, geciciBoru) {
        if (!geciciBoru) return;

        const zoom = state.zoom || 1;
        const baseFontSize = 10;
        const ZOOM_EXPONENT = -0.65;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5;

        const dx = geciciBoru.p2.x - geciciBoru.p1.x;
        const dy = geciciBoru.p2.y - geciciBoru.p1.y;
        const length = Math.hypot(dx, dy);

        if (length < 1) return;

        // Borunun ortası
        const midX = (geciciBoru.p1.x + geciciBoru.p2.x) / 2;
        const midY = (geciciBoru.p1.y + geciciBoru.p2.y) / 2;

        // Boru açısı
        const angle = Math.atan2(dy, dx);

        // Ölçü offset
        const width = 4; // geçici boru genişliği
        const offset = width / 2 -8;

        // Normal vektör
        const normalX = -Math.sin(angle);
        const normalY = Math.cos(angle);

        // Yazı pozisyonu
        const textX = midX + normalX * offset;
        const textY = midY + normalY * offset;

        ctx.save();
        ctx.translate(textX, textY);
        ctx.rotate(angle);

        // Açıyı düzelt
        if (Math.abs(angle) > Math.PI / 2) {
            ctx.rotate(Math.PI);
        }

        // Font ayarla
        const actualFontSize = Math.max(minWorldFontSize, fontSize);
        ctx.font = `400 ${actualFontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

        // Rounded length
        const roundedLength = Math.round(length);
        const displayText = roundedLength.toString();

        // Yazıyı çiz (geçici için farklı renk, arka plan yok)
        const adjustedTextColor = getAdjustedColor('rgba(255, 255, 0, 1)', 'boru');

        ctx.fillStyle = adjustedTextColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, 0, 0);

        ctx.restore();
    }

    /**
     * Ölçü girişi göstergesi (klavyeden girilen ölçü)
     */
    drawMeasurementInput(ctx, interactionManager) {
        if (!interactionManager.measurementInput || !interactionManager.boruBaslangic) return;

        const zoom = state.zoom || 1;
        const baseFontSize = 16;
        const ZOOM_EXPONENT = -0.65;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 8;

        // Başlangıç noktasının yanında göster
        const x = interactionManager.boruBaslangic.nokta.x;
        const y = interactionManager.boruBaslangic.nokta.y - 15; // 15cm yukarıda

        ctx.save();
        ctx.translate(x, y);

        // Font ayarla
        const actualFontSize = Math.max(minWorldFontSize, fontSize);
        ctx.font = `bold ${actualFontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

        const displayText = interactionManager.measurementInput + ' cm';

        // Yazı genişliğini ölç
        const metrics = ctx.measureText(displayText);
        const textWidth = metrics.width;
        const padding = 4;

        // Arka plan (sarı transparan)
        ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
        ctx.fillRect(
            -textWidth / 2 - padding,
            -actualFontSize / 2 - padding,
            textWidth + padding * 2,
            actualFontSize + padding * 2
        );

        // Kenarlık
        ctx.strokeStyle = '#FF6600';
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(
            -textWidth / 2 - padding,
            -actualFontSize / 2 - padding,
            textWidth + padding * 2,
            actualFontSize + padding * 2
        );

        // Yazıyı çiz
        ctx.fillStyle = '#000';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, 0, 0);

        ctx.restore();
    }

    hexToRgba(hex, alpha) {
        const hexStr = hex.toString(16).padStart(6, '0');
        const r = parseInt(hexStr.substring(0, 2), 16);
        const g = parseInt(hexStr.substring(2, 4), 16);
        const b = parseInt(hexStr.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}