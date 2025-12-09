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

        // Vanaların pozisyonlarını güncelle (boru uzunluğu değiştiğinde)
        manager.updateAllValvePositions();

        // MİMARİ modunda tesisat nesneleri soluk görünmeli
        const shouldBeFaded = state.currentDrawingMode === 'MİMARİ';

        if (shouldBeFaded) {
            ctx.save();
            ctx.globalAlpha = 0.35; // Biraz daha görünür (önceden 0.15)
        }

        // Borular
        this.drawPipes(ctx, manager.pipes);

        // Bileşenler
        this.drawComponents(ctx, manager.components, manager);

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
            this.drawComponent(ctx, manager.tempComponent, manager);
            ctx.restore();
        }

        // Snap göstergesi (her zaman normal)
        const activeSnap = manager.interactionManager?.activeSnap;
        if (activeSnap) {
            this.drawSnapIndicator(ctx, activeSnap);
        }

        // ✨ Ghost ara borular (sürükleme preview)
        const ghostBridgePipes = manager.interactionManager?.ghostBridgePipes;
        if (ghostBridgePipes && ghostBridgePipes.length > 0) {
            this.drawGhostBridgePipes(ctx, ghostBridgePipes);
        }

        // Ölçü girişi göstergesi
        if (manager.interactionManager?.measurementActive) {
            this.drawMeasurementInput(ctx, manager.interactionManager);
        }

        // Boru uç noktası snap guide çizgileri
        if (manager.interactionManager?.pipeEndpointSnapLock) {
            this.drawPipeEndpointSnapGuides(ctx, manager.interactionManager);
        }

        // Pipe splitting preview (boru tool aktif, hover)
        if (manager.interactionManager?.pipeSplitPreview) {
            this.drawPipeSplitPreview(ctx, manager.interactionManager.pipeSplitPreview);
        }

        // Vana preview (vana tool aktif, hover)
        if (manager.interactionManager?.vanaPreview) {
            this.drawVanaPreview(ctx, manager.interactionManager.vanaPreview);
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

            const zoom = state.zoom || 1;
            let width = config.lineWidth;    
            if(zoom<1){
                width = 4 /zoom;
                }

            ctx.save();

            // Koordinat sistemini borunun başlangıcına taşı ve döndür
            ctx.translate(pipe.p1.x, pipe.p1.y);
            ctx.rotate(angle);

            if (pipe.isSelected) {
                // Seçiliyse turuncu renk çiz
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
                gradient.addColorStop(0.0, 'rgba(255, 125,0,  0.3)');
                gradient.addColorStop(0.5,  'rgba(255, 125,0,  1)');
                gradient.addColorStop(1, 'rgba( 255, 125,0,  0.3)');
                ctx.fillStyle = gradient
                ctx.shadowColor = 'rgba(255, 255, 255, 1)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.fillRect(0, -width / 2, length, width);

            } else {
                // Gradient ile 3D silindir etkisi (Kenarlarda yumuşak siyahlık)
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);

                // Kenarlarda hafif karartma, ortası boru rengi
                // Geçişler yumuşak tutuldu
                gradient.addColorStop(0.0, 'rgba(255, 255,0,  0.5)');
                gradient.addColorStop(0.5,  'rgba(255, 255,0,  1)');
                gradient.addColorStop(1, 'rgba( 255, 255,0,  0.5)');
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

        // Boru üzerindeki vanaları çiz (ESKİ - deprecated, geriye dönük uyumluluk için)
        this.drawPipeValves(ctx, pipes);

        // Seçili borular için uç noktaları göster (dirseklerin üstünde görünsün)
        pipes.forEach(pipe => {
            if (pipe.isSelected) {
                this.drawPipeEndpoints(ctx, pipe);
            }
        });
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
        const adjustedGray = getAdjustedColor('rgba( 219, 219,0,  1)', 'boru');

        
        ctx.fillStyle = adjustedGray;

        breakPoints.forEach(bp => {
            // En büyük genişliği bul (merkez daire için)
            let maxArmWidth = 0;
            const armLength = 3;      // 3 cm kol uzunluğu
            const armExtraWidth = 1;  // Sağdan soldan 1 cm fazla (toplam 2 cm)
            
            const dm= bp.diameters[1]+armExtraWidth*2
            const adjustedGrayx = ctx.createRadialGradient(bp.x, bp.y,dm/4,bp.x, bp.y,dm/2);
                adjustedGrayx.addColorStop(0, 'rgba(255, 255, 0, 1)');
                adjustedGrayx.addColorStop(0.2, 'rgba(255, 255, 0, 1)');
                adjustedGrayx.addColorStop(1, 'rgba(255, 255, 0, .8)');
            ctx.fillStyle = adjustedGrayx;
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, dm/2, 0, Math.PI * 2);
            ctx.fill();

            // Her yön için dirsek kolu çiz
            for (let i = 0; i < bp.directions.length; i++) {
                const angle = bp.directions[i];
                const diameter = bp.diameters[i];

                // Boyutlar (cm cinsinden)

                const armWidth = diameter + armExtraWidth * 2;

                if (armWidth > maxArmWidth) maxArmWidth = armWidth;

                ctx.save();
                ctx.translate(bp.x, bp.y);
                ctx.rotate(angle);


                const gradientdar = ctx.createLinearGradient(0, -armWidth / 2, 0, armWidth / 2);

                // Kenarlarda hafif karartma, ortası boru rengi
                // Geçişler yumuşak tutuldu
                gradientdar.addColorStop(0.0, 'rgba(255, 255,0,  0.6)');
                gradientdar.addColorStop(0.2,  'rgba(255, 255,0,  1)');
                gradientdar.addColorStop(0.6,  'rgba(255, 255,0, 1)');
                gradientdar.addColorStop(1, 'rgba( 255, 255,0,  0.6)');


                // 3 cm'lik ana kol (dikdörtgen)
                ctx.fillStyle = gradientdar;
                ctx.fillRect(0, -armWidth / 2, armLength, armWidth);

                const gradientgenis = ctx.createLinearGradient(0, -armWidth / 2, 0, armWidth / 2);
                // İç kısımda hafif parlaklık efekti
                gradientgenis.addColorStop(0.0, 'rgba(255, 255,0,  0.8)');
                gradientgenis.addColorStop(0.5,  'rgba(255, 255,0,  1)');
                gradientgenis.addColorStop(1, 'rgba( 255, 255,0,  0.8)');


                // Uçta kalın çizgi (sağdan soldan 0.2 cm taşan, 1.5x kalın)
                ctx.fillStyle = gradientgenis;
                const lineWidth = armWidth + 0.4; // 0.2 cm her taraftan
                const lineThickness = 1.5;
                ctx.fillRect(armLength - 0.2, -lineWidth / 2, lineThickness, lineWidth);

                ctx.restore();

            }

        });
    }

    drawPipeEndpoints(ctx, pipe) {
        // Uç noktaları küçük belirgin noktalar (seçili borular için)
        const r = 3; // Küçük

        // p1 noktası
        ctx.fillStyle = '#FF8C00'; // Turuncu
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        //ctx.arc(pipe.p1.x, pipe.p1.y, r, 0, Math.PI * 2);
        ctx.fill();
        //ctx.stroke();

        // p2 noktası
        ctx.beginPath();
        //ctx.arc(pipe.p2.x, pipe.p2.y, r, 0, Math.PI * 2);
        ctx.fill();
        //ctx.stroke();
    }

    /**
     * Boru üzerindeki vanaları çiz
     */
    drawPipeValves(ctx, pipes) {
        if (!pipes) return;

        pipes.forEach(pipe => {
            if (!pipe.vana) return;

            // Vana pozisyonu (ekleme noktası)
            const vanaPos = pipe.getVanaPozisyon();
            if (!vanaPos) return;

            // Vana boyutu
            const size = 8;
            const halfSize = size / 2;

            // Vana yönünü belirle
            let angle = pipe.aci;

            // Eğer vana borunun başındaysa (t=0) ve boru başka bir boruya bağlıysa,
            // önceki borunun yönünü kullan
            if (pipe.vana.t === 0 && pipe.baslangicBaglanti && pipe.baslangicBaglanti.hedefId) {
                if (pipe.baslangicBaglanti.tip === 'boru') {
                    // Önceki boruyu bul
                    const oncekiBoru = pipes.find(p => p.id === pipe.baslangicBaglanti.hedefId);
                    if (oncekiBoru) {
                        angle = oncekiBoru.aci;
                    }
                }
            }

            // Vananın merkezi ekleme noktasında olsun (ekleme noktası zaten dirsek için 3cm içeride)
            const adjustedX = vanaPos.x;
            const adjustedY = vanaPos.y;

            ctx.save();
            ctx.translate(adjustedX, adjustedY);
            ctx.rotate(angle);
            const gradient = ctx.createConicGradient(0, 0, 0);
            //const gradient = ctx.createLinearGradient(0, -halfSize, 0,halfSize);
            // İç kısımda hafif parlaklık efekti
            
            
            gradient.addColorStop(0,  'rgba(255, 255, 255, 1)');
            gradient.addColorStop(.25,  'rgba(7, 48, 66, 1)');
            gradient.addColorStop(0.5,  'rgba(255, 255, 255, 1)');
            gradient.addColorStop(.75,  'rgba(7, 48, 66,  1)');
            gradient.addColorStop(1,  'rgba(255, 255, 255, 1)');

            // Mavi renk (kutu mavisi)
            const vanaColor = gradient
            const adjustedColor = getAdjustedColor(vanaColor, 'vana');

            // Kare sınırları
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            //ctx.strokeRect(-halfSize, -halfSize, size, size);

            // İki üçgen çiz (karşı karşıya bakan)
            const fillColor = pipe.vana.isSelected ? '#FF8C00' : gradient; // Seçiliyse turuncu
            ctx.fillStyle = fillColor;
            ctx.shadowColor = 'rgba(0, 0, 0, 1)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            // Sol üçgen (sağa bakan)
            ctx.beginPath();
            ctx.moveTo(-halfSize, -halfSize);  // Sol üst
            ctx.lineTo(-halfSize, halfSize);   // Sol alt
            ctx.lineTo(0,1);  
            ctx.lineTo(halfSize, halfSize);    // Sağ alt
            ctx.lineTo(halfSize, -halfSize);    // Sağ alt
            ctx.lineTo(0,-1);                  // Orta
            ctx.closePath();
            ctx.fill();

            // Seçili vana için dış çerçeve
            if (pipe.vana.isSelected) {
                ctx.strokeStyle = '#FF8C00';
                ctx.lineWidth = 1;
                ctx.strokeRect(-halfSize - 1, -halfSize - 1, size + 2, size + 2);
            }

            ctx.restore();
        });
    }

    drawGeciciBoru(ctx, geciciBoru) {
        ctx.save();

        // Geçici boru için de aynı stil ve zoom kompenzasyonu
        const zoom = state.zoom || 1;
        const zoomCompensation = Math.pow(zoom, 0.6);
        let width = 4;    
        if(zoom<1){
            width = 4 /zoom;
            }
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

    drawComponents(ctx, components, manager) {
        if (!components) return;
        components.forEach(comp => this.drawComponent(ctx, comp, manager));
    }

    drawComponent(ctx, comp, manager) {
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
                this.drawCihaz(ctx, comp, manager);
                break;
        }

        // Seçim göstergesi
        if (comp.isSelected) {
            // Servis kutusu için kesikli çizgi gösterme, renk değişimi yeterli
            if (comp.type !== 'servis_kutusu') {
                this.drawSelectionBox(ctx, comp);
            }
            // Servis kutusu için döndürme tutamacı
            if (comp.type === 'servis_kutusu') {
                this.drawRotationHandles(ctx, comp);
            }
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
        const baseColor = "rgba(206, 206, 206, 1)";
        const adjustedColor = getAdjustedColor(baseColor, 'servis_kutusu');
        const adjustedStroke = getAdjustedColor('#fff', 'servis_kutusu');

        // Seçiliyse renk değişsin
        ctx.fillStyle = comp.isSelected ? this.secilenRenk : '#00bffa';
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
        ctx.fillText('S.K.', 0, 1);

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

    drawVana(ctx, comp, vanaData = null) {
        // Bağımsız vana çizimi (components dizisindeki vana)
        const size = 8; // Kare boyutu (8x8 cm)
        const halfSize = size / 2;

        // Gradient efekti ile parlaklık
        const gradient = ctx.createConicGradient(0, 0, 0);
        gradient.addColorStop(0,  'rgba(255, 255, 255, 1)');
        gradient.addColorStop(.25,  'rgba(7, 48, 66, 1)');
        gradient.addColorStop(0.5,  'rgba(255, 255, 255, 1)');
        gradient.addColorStop(.75,  'rgba(7, 48, 66,  1)');
        gradient.addColorStop(1,  'rgba(255, 255, 255, 1)');

        // Seçiliyse turuncu renk
        const fillColor = comp.isSelected ? '#FF8C00' : gradient;
        ctx.fillStyle = fillColor;

        // Gölge efekti
        ctx.shadowColor = 'rgba(0, 0, 0, 1)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // İki üçgen çiz (karşı karşıya bakan, kelebek vana görünümü)
            ctx.beginPath();
            ctx.moveTo(-halfSize, -halfSize);  // Sol üst
            ctx.lineTo(-halfSize, halfSize);   // Sol alt
            ctx.lineTo(0,1);  
            ctx.lineTo(halfSize, halfSize);    // Sağ alt
            ctx.lineTo(halfSize, -halfSize);    // Sağ alt
            ctx.lineTo(0,-1);                  // Orta
            ctx.closePath();
            ctx.fill();

        // Seçili vana için dış çerçeve
        if (comp.isSelected) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#FF8C00';
            ctx.lineWidth = 1;
            ctx.strokeRect(-halfSize - 1, -halfSize - 1, size + 2, size + 2);
        }
    }

    drawCihaz(ctx, comp, manager) {
        const config = CIHAZ_TIPLERI[comp.cihazTipi] || CIHAZ_TIPLERI.KOMBI;

        // Kombi veya Ocak için özel çizim
        if (comp.cihazTipi === 'KOMBI') {
            this.drawKombi(ctx, comp, manager);
            return;
        }

        if (comp.cihazTipi === 'OCAK') {
            this.drawOcak(ctx, comp, manager);
            return;
        }

        // Diğer cihazlar için eski stil çizim
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

    /**
     * Kombi çizer (40x40 boyutunda) - Gerçekçi tasarım
     */
    drawKombi(ctx, comp, manager) {
        const zoom = state.zoom || 1;

        // ÖNCE fleks çizgisini global context'te çiz
        if (manager) {
            const connectionPoint = comp.getGirisNoktasi();
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager);
        }

        // Sonra cihazı çiz (local context)
        ctx.save();
        ctx.translate(comp.x, comp.y);
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        const outerRadius = 20; // 40 çap için

        // Shadow efekti
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Ana gövde - Radial gradient ile 3D metalik efekt
        const gradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, outerRadius);
        if (comp.isSelected) {
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.3, '#8ab4f8');
            gradient.addColorStop(0.7, '#5a94f0');
            gradient.addColorStop(1, '#2a74d0');
        } else {
            gradient.addColorStop(0, '#FFFFFF');      // Işık noktası
            gradient.addColorStop(0.3, '#E8E8E8');    // Parlak gri
            gradient.addColorStop(0.6, '#C0C0C0');    // Orta gri (metalik)
            gradient.addColorStop(0.85, '#A0A0A0');   // Koyu gri
            gradient.addColorStop(1, '#808080');      // En koyu kenar
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Dış çerçeve
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        const adjustedStroke = getAdjustedColor(comp.isSelected ? '#5a94f0' : '#666', 'cihaz');
        ctx.strokeStyle = adjustedStroke;
        ctx.lineWidth = (comp.isSelected ? 2.5 : 1.5) / zoom;
        ctx.stroke();

        // İç panel (ekran alanı)
        const innerRadius = 14;
        const innerGradient = ctx.createRadialGradient(-3, -3, 0, 0, 0, innerRadius);
        if (comp.isSelected) {
            innerGradient.addColorStop(0, '#6aa4f8');
            innerGradient.addColorStop(1, '#4a84d8');
        } else {
            innerGradient.addColorStop(0, '#404040');  // Koyu merkez (ekran)
            innerGradient.addColorStop(0.6, '#303030');
            innerGradient.addColorStop(1, '#202020');
        }

        ctx.fillStyle = innerGradient;
        ctx.beginPath();
        ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
        ctx.fill();

        // İç panel çerçevesi
        ctx.strokeStyle = comp.isSelected ? '#8ab4f8' : '#555';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // "G" harfi (Gaz) - BÜYÜK ve SABİT boyutta
        if (zoom > 0.15) {
            // Beyaz glow efekti
            ctx.shadowColor = comp.isSelected ? 'rgba(138, 180, 248, 0.8)' : 'rgba(255, 255, 255, 0.8)';
            ctx.shadowBlur = 5;

            ctx.fillStyle = comp.isSelected ? '#FFFFFF' : '#00FFFF';
            ctx.font = `bold 20px Arial`; // SABİT boyut
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('G', 0, 0);

            // Shadow sıfırla
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    /**
     * Ocak çizer (40x40 boyutunda) - Metalik tasarım
     */
    drawOcak(ctx, comp, manager) {
        const zoom = state.zoom || 1;

        // ÖNCE fleks çizgisini global context'te çiz
        if (manager) {
            const connectionPoint = comp.getGirisNoktasi();
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager);
        }

        // Sonra cihazı çiz (local context)
        ctx.save();
        ctx.translate(comp.x, comp.y);
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        const boxSize = 20; // 40x40 kare için
        const cornerRadius = 4;

        // Shadow efekti
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Ana yüzey - Metalik görünümü (Radial gradient)
        const gradient = ctx.createRadialGradient(-6, -6, 0, 0, 0, boxSize * 1.5);
        if (comp.isSelected) {
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.3, '#9ab9f8');
            gradient.addColorStop(0.6, '#7a99d8');
            gradient.addColorStop(1, '#5a79b8');
        } else {
            gradient.addColorStop(0, '#B0B0B0');    // Parlak gri (metalik)
            gradient.addColorStop(0.3, '#909090');  // Orta gri
            gradient.addColorStop(0.6, '#707070');  // Koyu gri
            gradient.addColorStop(1, '#505050');    // En koyu kenar
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(-boxSize + cornerRadius, -boxSize);
        ctx.lineTo(boxSize - cornerRadius, -boxSize);
        ctx.arcTo(boxSize, -boxSize, boxSize, -boxSize + cornerRadius, cornerRadius);
        ctx.lineTo(boxSize, boxSize - cornerRadius);
        ctx.arcTo(boxSize, boxSize, boxSize - cornerRadius, boxSize, cornerRadius);
        ctx.lineTo(-boxSize + cornerRadius, boxSize);
        ctx.arcTo(-boxSize, boxSize, -boxSize, boxSize - cornerRadius, cornerRadius);
        ctx.lineTo(-boxSize, -boxSize + cornerRadius);
        ctx.arcTo(-boxSize, -boxSize, -boxSize + cornerRadius, -boxSize, cornerRadius);
        ctx.closePath();
        ctx.fill();

        // Dış çerçeve (metalik kenar)
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        const adjustedStroke = getAdjustedColor(comp.isSelected ? '#8ab4f8' : '#606060', 'cihaz');
        ctx.strokeStyle = adjustedStroke;
        ctx.lineWidth = (comp.isSelected ? 2.5 : 2) / zoom;
        ctx.stroke();

        // İç dekoratif çerçeve (metalik parlaklık)
        if (!comp.isSelected) {
            ctx.strokeStyle = '#858585';
            ctx.lineWidth = 1 / zoom;
            const innerBox = boxSize - 2;
            const innerCorner = 3;
            ctx.beginPath();
            ctx.moveTo(-innerBox + innerCorner, -innerBox);
            ctx.lineTo(innerBox - innerCorner, -innerBox);
            ctx.arcTo(innerBox, -innerBox, innerBox, -innerBox + innerCorner, innerCorner);
            ctx.lineTo(innerBox, innerBox - innerCorner);
            ctx.arcTo(innerBox, innerBox, innerBox - innerCorner, innerBox, innerCorner);
            ctx.lineTo(-innerBox + innerCorner, innerBox);
            ctx.arcTo(-innerBox, innerBox, -innerBox, innerBox - innerCorner, innerCorner);
            ctx.lineTo(-innerBox, -innerBox + innerCorner);
            ctx.arcTo(-innerBox, -innerBox, -innerBox + innerCorner, -innerBox, innerCorner);
            ctx.closePath();
            ctx.stroke();
        }

        // 4 gözlü ocak - basit düz kapak tasarımı
        const burnerRadius = 5.5;
        const offset = 8;
        const burnerPositions = [
            { x: -offset, y: -offset }, // Sol üst
            { x: offset, y: -offset },  // Sağ üst
            { x: -offset, y: offset },  // Sol alt
            { x: offset, y: offset }    // Sağ alt
        ];

        burnerPositions.forEach(pos => {
            // Gölge efekti
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 4;

            // Düz kapak (basit daire)
            const burnerGradient = ctx.createRadialGradient(pos.x - 2, pos.y - 2, 0, pos.x, pos.y, burnerRadius);
            if (comp.isSelected) {
                burnerGradient.addColorStop(0, '#7a99d8');
                burnerGradient.addColorStop(0.5, '#5a79b8');
                burnerGradient.addColorStop(1, '#3a5998');
            } else {
                burnerGradient.addColorStop(0, '#404040');    // Parlak merkez
                burnerGradient.addColorStop(0.5, '#2a2a2a');  // Orta
                burnerGradient.addColorStop(1, '#1a1a1a');    // Koyu kenar
            }

            ctx.fillStyle = burnerGradient;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, burnerRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;

            // Dış çerçeve
            ctx.strokeStyle = comp.isSelected ? '#6a89c8' : '#606060';
            ctx.lineWidth = 1.2 / zoom;
            ctx.stroke();
        });

        ctx.restore();
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

    /**
     * Döndürme tutamacı (servis kutusu için) - Merkezden yukarı çubuk çıkar
     */
    drawRotationHandles(ctx, comp) {
        const { height } = SERVIS_KUTUSU_CONFIG;

        // Döndürme çubuğu uzunluğu (daha küçük - 10cm)
        const handleLength = height / 2 + 30; // 10cm dışarıda

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
        const ZOOM_EXPONENT = -0.1;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5;

        pipes.forEach(pipe => {
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const length = Math.hypot(dx, dy);

            // Çok kısa borularda ölçü gösterme
            if (length < 15) return;

            // Borunun ortası
            const midX = (pipe.p1.x + pipe.p2.x) / 2;
            const midY = (pipe.p1.y + pipe.p2.y) / 2;

            // Boru açısı
            const angle = Math.atan2(dy, dx);

            // Boru genişliği
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;
            const width = config.lineWidth;

            // Ölçü offset (boruya temas etmeden, en yakınına)
            const offset = width / 2 - 10; // 1cm yukarı

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
            const adjustedTextColor = getAdjustedColor('rgba(214, 214, 214, 1)', 'boru');
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
        const ZOOM_EXPONENT = -0.1;
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
        const offset = width / 2 -10;

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
        const adjustedTextColor = getAdjustedColor('rgba(214, 214, 214, 1)', 'boru');

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

    /**
     * Sinüs dalgalı bağlantı çizgisi çizer (Ocak/Kombi için fleks bağlantısı)
     */
    drawWavyConnectionLine(ctx, connectionPoint, zoom, manager) {
        console.log('🔌 FLEKS ÇİZİMİ - connectionPoint:', connectionPoint);

        const currentFloorId = state.currentFloor?.id;
        const pipes = (manager.pipes || []).filter(p => p.floorId === currentFloorId);

        console.log(`🔌 FLEKS - Borular: ${pipes.length} adet`);

        let closestPipeEnd = null;
        let pipeDirection = null;
        let minDist = Infinity;

        // En yakın boru ucunu bul
        for (const pipe of pipes) {
            const dist1 = Math.hypot(pipe.p1.x - connectionPoint.x, pipe.p1.y - connectionPoint.y);
            if (dist1 < minDist) {
                minDist = dist1;
                closestPipeEnd = { x: pipe.p1.x, y: pipe.p1.y };
                const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
                if (pipeLength > 0) {
                    pipeDirection = {
                        x: (pipe.p2.x - pipe.p1.x) / pipeLength,
                        y: (pipe.p2.y - pipe.p1.y) / pipeLength
                    };
                }
            }

            const dist2 = Math.hypot(pipe.p2.x - connectionPoint.x, pipe.p2.y - connectionPoint.y);
            if (dist2 < minDist) {
                minDist = dist2;
                closestPipeEnd = { x: pipe.p2.x, y: pipe.p2.y };
                const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
                if (pipeLength > 0) {
                    pipeDirection = {
                        x: (pipe.p1.x - pipe.p2.x) / pipeLength,
                        y: (pipe.p1.y - pipe.p2.y) / pipeLength
                    };
                }
            }
        }

        // Fleks çizgisini ÇİZ (her zaman çiz, mesafe kontrolü yok)
        if (closestPipeEnd && pipeDirection) {
            const dx = closestPipeEnd.x - connectionPoint.x;
            const dy = closestPipeEnd.y - connectionPoint.y;
            const distance = Math.hypot(dx, dy);

            console.log(`🔌 FLEKS - En yakın boru ucu: (${closestPipeEnd.x.toFixed(1)}, ${closestPipeEnd.y.toFixed(1)}), mesafe: ${distance.toFixed(1)}cm`);

            if (distance < 0.5) {
                console.log('⚠️ FLEKS - Çok yakın, çizilmiyor');
                return; // Çok yakınsa çizme
            }

            console.log('✅ FLEKS ÇİZİLİYOR!');

            const amplitude = 3;      // Dalga genliği
            const frequency = 3;      // Dalga frekansı
            const segments = 50;      // Segment sayısı

            ctx.save();

            // Fleks rengini ayarla (sarı-altın rengi)
            const adjustedColor = getAdjustedColor('#FFD700', 'cihaz');
            ctx.strokeStyle = adjustedColor;
            ctx.lineWidth = 3 / zoom;  // Daha kalın
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Gölge efekti
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4;

            ctx.beginPath();
            ctx.moveTo(connectionPoint.x, connectionPoint.y);

            for (let i = 1; i <= segments; i++) {
                const t = i / segments;

                const baseX = connectionPoint.x + dx * t;
                const baseY = connectionPoint.y + dy * t;

                const perpX = -dy / distance;
                const perpY = dx / distance;

                const smoothEnvelope = t * t * (3 - 2 * t);

                const wave = Math.sin(smoothEnvelope * frequency * Math.PI * 2);

                const sineOffset = smoothEnvelope * (1 - smoothEnvelope) * 4 * amplitude * wave;

                const finalX = baseX + perpX * sineOffset;
                const finalY = baseY + perpY * sineOffset;

                ctx.lineTo(finalX, finalY);
            }

            ctx.stroke();
            ctx.restore();
        } else {
            console.log('❌ FLEKS - Boru ucu bulunamadı veya yön hesaplanamadı');
        }
    }

    /**
     * Boru uç noktası snap guide çizgileri
     */
    drawPipeEndpointSnapGuides(ctx, interactionManager) {
        const snapLock = interactionManager.pipeEndpointSnapLock;
        if (!snapLock) return;

        const zoom = state.zoom || 1;
        const dragObject = interactionManager.dragObject;
        if (!dragObject || dragObject.type !== 'boru') return;

        const endpoint = interactionManager.dragEndpoint;
        if (!endpoint) return;

        const point = endpoint === 'p1' ? dragObject.p1 : dragObject.p2;

        ctx.save();
        ctx.strokeStyle = '#00FF00'; // Yeşil snap guide
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);

        // Canvas boyutlarını al (görünür alan)
        const canvas = ctx.canvas;
        const rect = canvas.getBoundingClientRect();
        const panX = state.panX || 0;
        const panY = state.panY || 0;

        // Görünür dünya koordinatları
        const minX = -panX / zoom - 500;
        const maxX = -panX / zoom + canvas.width / zoom + 500;
        const minY = -panY / zoom - 500;
        const maxY = -panY / zoom + canvas.height / zoom + 500;

        // X ekseni snap'i varsa dikey çizgi çiz
        if (snapLock.x !== null) {
            ctx.beginPath();
            ctx.moveTo(snapLock.x, minY);
            ctx.lineTo(snapLock.x, maxY);
            ctx.stroke();
        }

        // Y ekseni snap'i varsa yatay çizgi çiz
        if (snapLock.y !== null) {
            ctx.beginPath();
            ctx.moveTo(minX, snapLock.y);
            ctx.lineTo(maxX, snapLock.y);
            ctx.stroke();
        }

        // Snap noktasında daire çiz
        ctx.setLineDash([]);
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Ghost ara boruları çiz (geçici boru stili)
     */
    drawGhostBridgePipes(ctx, ghostPipes) {
        ctx.save();

        // Yarı saydam
        ctx.globalAlpha = 0.6;

        ghostPipes.forEach(ghost => {
            // Düz çizgi (geçici boru stili)
            ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Turuncu renk
            ctx.lineWidth = 4;

            // Çizgiyi çiz
            ctx.beginPath();
            ctx.moveTo(ghost.p1.x, ghost.p1.y);
            ctx.lineTo(ghost.p2.x, ghost.p2.y);
            ctx.stroke();
        });

        ctx.restore();
    }

    /**
     * Pipe splitting preview noktası çiz
     */
    drawPipeSplitPreview(ctx, preview) {
        if (!preview || !preview.point) return;

        const { point } = preview;
        const zoom = state.zoom || 1;

        ctx.save();

        // Dış daire (mavi, parlak)
        ctx.fillStyle = 'rgba(0, 150, 255, 0.8)';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // İç daire (beyaz nokta)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2 / zoom, 0, Math.PI * 2);
        ctx.fill();

        // Animasyon için pulse efekti (isteğe bağlı - statik de kalabilir)
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 10 / zoom, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Vana preview çiz - gerçekteki gibi (stroke olmasın)
     */
    drawVanaPreview(ctx, vanaPreview) {
        if (!vanaPreview || !vanaPreview.pipe || !vanaPreview.point) return;

        const { pipe, point } = vanaPreview;
        const angle = pipe.aci;

        // Vana boyutu
        const size = 8;
        const halfSize = size / 2;

        // Vana merkezi ekleme noktasında
        const adjustedX = point.x;
        const adjustedY = point.y;

        ctx.save();
        ctx.translate(adjustedX, adjustedY);
        ctx.rotate(angle);

        // Yarı saydam
        ctx.globalAlpha = 0.7;

        // İki üçgen çiz (mavi) - STROKE YOK, sadece fill
        const vanaColor = '#00bffa';
        const adjustedColor = getAdjustedColor(vanaColor, 'vana');
        ctx.fillStyle = adjustedColor;

            ctx.beginPath();
            ctx.moveTo(-halfSize, -halfSize);  // Sol üst
            ctx.lineTo(-halfSize, halfSize);   // Sol alt
            ctx.lineTo(0,1);  
            ctx.lineTo(halfSize, halfSize);    // Sağ alt
            ctx.lineTo(halfSize, -halfSize);    // Sağ alt
            ctx.lineTo(0,-1);                  // Orta
            ctx.closePath();
            ctx.fill();
            
        ctx.restore();
    }
}