import { BORU_TIPLERI, RENK_GRUPLARI } from './objects/pipe.js';
import { SERVIS_KUTUSU_CONFIG, CIKIS_YONLERI } from './objects/service-box.js';
import { SAYAC_CONFIG } from './objects/meter.js';
import { VANA_CONFIG, VANA_TIPLERI } from './objects/valve.js';
import { CIHAZ_TIPLERI, FLEKS_CONFIG } from './objects/device.js';
import { BG, getAdjustedColor, state } from '../general-files/main.js';

export class PlumbingRenderer {
    constructor() {
        this.secilenRenk = '#00BFFF'; // Seçili nesne rengi
    }

    /**
     * Renk grubundan opacity ile renk al
     */
    getRenkByGroup(colorGroup, tip, opacity) {
        const group = RENK_GRUPLARI[colorGroup] || RENK_GRUPLARI.YELLOW;
        const template = group[tip];

        if (template.includes('{opacity}')) {
            return template.replace('{opacity}', opacity);
        }
        return template;
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
            // Geçici borunun renk grubunu belirle
            let geciciColorGroup = 'YELLOW'; // Varsayılan

            // Başlangıç noktasının kaynağına göre renk belirle
            const boruBaslangic = manager.interactionManager?.boruBaslangic;
            if (boruBaslangic) {
                // Sayaç çıkışından başlıyorsa TURQUAZ
                if (boruBaslangic.kaynakTip === 'sayac') {
                    geciciColorGroup = 'TURQUAZ';
                }
                // Boru ucundan başlıyorsa o borunun rengini al
                else if (boruBaslangic.kaynakTip === 'boru' && boruBaslangic.kaynakId) {
                    const baslangicBoru = manager.findPipeById(boruBaslangic.kaynakId);
                    if (baslangicBoru) {
                        geciciColorGroup = baslangicBoru.colorGroup || 'YELLOW';
                    }
                }
            }

            this.drawGeciciBoru(ctx, geciciBoru, geciciColorGroup);
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

        // Ghost eleman (her zaman yarı saydam) - sadece mouse hareket ettikten sonra görünsün
        if (manager.tempComponent && manager.interactionManager.lastMousePoint) {
            ctx.save();
            ctx.globalAlpha = 0.6;

            // Cihaz ghost için özel rendering (drawComponent translate'ini bypass et)
            if (manager.tempComponent.type === 'cihaz') {
                // Vana ve fleks preview çiz (bağlantı varsa)
                if (manager.tempComponent.ghostConnectionInfo) {
                    this.drawCihazGhostConnection(ctx, manager.tempComponent, manager);
                }

                // Manuel translate + draw
                ctx.save();
                ctx.translate(manager.tempComponent.x, manager.tempComponent.y);
                if (manager.tempComponent.rotation) {
                    ctx.rotate(manager.tempComponent.rotation * Math.PI / 180);
                }

                // Cihaz tipine göre çiz
                if (manager.tempComponent.cihazTipi === 'KOMBI') {
                    this.drawKombi(ctx, manager.tempComponent, manager);
                } else if (manager.tempComponent.cihazTipi === 'OCAK') {
                    this.drawOcak(ctx, manager.tempComponent, manager);
                }

                ctx.restore();
            }

            else if (manager.tempComponent.type === 'sayac') {
                // Sayaç Ghost Bağlantılarını Çiz (Vana + Fleks)
                if (manager.tempComponent.ghostConnectionInfo) {
                    this.drawSayacGhostConnection(ctx, manager.tempComponent, manager);
                }
                this.drawComponent(ctx, manager.tempComponent, manager);
            }
            else {
                // Diğer tip ghostlar için normal drawComponent
                this.drawComponent(ctx, manager.tempComponent, manager);
            }

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
            if (zoom < 1) {
                width = 4 / zoom;
            }

            ctx.save();

            // Koordinat sistemini borunun başlangıcına taşı ve döndür
            ctx.translate(pipe.p1.x, pipe.p1.y);
            ctx.rotate(angle);

            if (pipe.isSelected) {
                // Seçiliyse turuncu renk çiz
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
                gradient.addColorStop(0.0, 'rgba(255, 125,0,  0.3)');
                gradient.addColorStop(0.5, 'rgba(255, 125,0,  1)');
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

                // Renk grubuna göre renk seç
                const colorGroup = pipe.colorGroup || 'YELLOW';

                // Kenarlarda hafif karartma, ortası boru rengi
                // Geçişler yumuşak tutuldu
                gradient.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'boru', 0.5));
                gradient.addColorStop(0.5, this.getRenkByGroup(colorGroup, 'boru', 1));
                gradient.addColorStop(1, this.getRenkByGroup(colorGroup, 'boru', 0.5));

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
        breakPoints.forEach(bp => {
            // Dirsek rengini ilk borunun colorGroup'una göre belirle
            const firstPipe = bp.pipes[0];
            const colorGroup = firstPipe?.colorGroup || 'YELLOW';
            // En büyük genişliği bul (merkez daire için)
            let maxArmWidth = 0;
            const armLength = 3;      // 3 cm kol uzunluğu
            const armExtraWidth = 1;  // Sağdan soldan 1 cm fazla (toplam 2 cm)

            const dm = bp.diameters[1] + armExtraWidth * 2
            const adjustedGrayx = ctx.createRadialGradient(bp.x, bp.y, dm / 4, bp.x, bp.y, dm / 2);
            adjustedGrayx.addColorStop(0, this.getRenkByGroup(colorGroup, 'dirsek', 1));
            adjustedGrayx.addColorStop(0.2, this.getRenkByGroup(colorGroup, 'dirsek', 1));
            adjustedGrayx.addColorStop(1, this.getRenkByGroup(colorGroup, 'dirsek', 0.8));
            ctx.fillStyle = adjustedGrayx;
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, dm / 2, 0, Math.PI * 2);
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
                gradientdar.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'dirsek', 0.6));
                gradientdar.addColorStop(0.2, this.getRenkByGroup(colorGroup, 'dirsek', 1));
                gradientdar.addColorStop(0.6, this.getRenkByGroup(colorGroup, 'dirsek', 1));
                gradientdar.addColorStop(1, this.getRenkByGroup(colorGroup, 'dirsek', 0.6));


                // 3 cm'lik ana kol (dikdörtgen)
                ctx.fillStyle = gradientdar;
                ctx.fillRect(0, -armWidth / 2, armLength, armWidth);

                const gradientgenis = ctx.createLinearGradient(0, -armWidth / 2, 0, armWidth / 2);
                // İç kısımda hafif parlaklık efekti
                gradientgenis.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'dirsek', 0.8));
                gradientgenis.addColorStop(0.5, this.getRenkByGroup(colorGroup, 'dirsek', 1));
                gradientgenis.addColorStop(1, this.getRenkByGroup(colorGroup, 'dirsek', 0.8));


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
        const r = 1.6; // Küçük

        // p1 noktası
        ctx.fillStyle = '#FF8C00'; // Turuncu
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pipe.p1.x, pipe.p1.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // p2 noktası
        ctx.beginPath();
        ctx.arc(pipe.p2.x, pipe.p2.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

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


            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(.25, 'rgba(7, 48, 66, 1)');
            gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(.75, 'rgba(7, 48, 66,  1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');

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
            ctx.lineTo(0, 1);
            ctx.lineTo(halfSize, halfSize);    // Sağ alt
            ctx.lineTo(halfSize, -halfSize);    // Sağ alt
            ctx.lineTo(0, -1);                  // Orta
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

    drawGeciciBoru(ctx, geciciBoru, colorGroup = 'YELLOW') {
        ctx.save();

        // Geçici boru için de aynı stil ve zoom kompenzasyonu
        const zoom = state.zoom || 1;
        const zoomCompensation = Math.pow(zoom, 0.6);
        let width = 4;
        if (zoom < 1) {
            width = 4 / zoom;
        }
        const dx = geciciBoru.p2.x - geciciBoru.p1.x;
        const dy = geciciBoru.p2.y - geciciBoru.p1.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);



        ctx.translate(geciciBoru.p1.x, geciciBoru.p1.y);
        ctx.rotate(angle);

        // Renk grubuna göre gradient oluştur
        const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
        gradient.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'boru', 0.3));
        gradient.addColorStop(0.5, this.getRenkByGroup(colorGroup, 'boru', 1));
        gradient.addColorStop(1, this.getRenkByGroup(colorGroup, 'boru', 0.3));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, -width / 2, length, width);

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
                this.drawSayac(ctx, comp, manager);
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
            // Servis kutusu, cihaz ve sayaç için döndürme tutamacı
            if (comp.type === 'servis_kutusu' || comp.type === 'cihaz' || comp.type === 'sayac') {
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

    drawVana(ctx, comp, vanaData = null) {
        // Bağımsız vana çizimi (components dizisindeki vana)
        const size = 8; // Kare boyutu (8x8 cm)
        const halfSize = size / 2;

        // Gradient efekti ile parlaklık
        const gradient = ctx.createConicGradient(0, 0, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(.25, 'rgba(7, 48, 66, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(.75, 'rgba(7, 48, 66,  1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');

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
        ctx.lineTo(0, 1);
        ctx.lineTo(halfSize, halfSize);    // Sağ alt
        ctx.lineTo(halfSize, -halfSize);    // Sağ alt
        ctx.lineTo(0, -1);                  // Orta
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

        /*const fleks = comp.getFleksCizgi();
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
        */
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

    drawKombi(ctx, comp, manager) {
        const zoom = state.zoom || 1;

        // ÖNCE fleks çizgisini çiz (component translate'ini geri al, pan/zoom'u koru)
        if (manager) {
            ctx.save();
            // --- DÜZELTME: Rotasyonu ve çeviriyi geri al ---
            if (comp.rotation) ctx.rotate(-comp.rotation * Math.PI / 180);
            ctx.translate(-comp.x, -comp.y);

            // BORU UCU KOORDİNATINI DOĞRUDAN BORUDAN AL
            let targetPoint = null;
            if (comp.fleksBaglanti?.boruId && comp.fleksBaglanti?.endpoint) {
                const pipe = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
                if (pipe) {
                    targetPoint = comp.getFleksBaglantiNoktasi(pipe);
                } else {
                    // Sadece bir kere logla (her frame değil)
                    if (!comp._fleksWarningLogged) {
                        console.warn('⚠️ FLEKS: Boru bulunamadı!', comp.fleksBaglanti.boruId);
                        comp._fleksWarningLogged = true;
                    }
                }
            } else {
                // Sadece bir kere logla
                if (!comp._fleksWarningLogged2) {
                    console.warn('⚠️ FLEKS: Bağlantı bilgisi eksik!', comp.fleksBaglanti);
                    comp._fleksWarningLogged2 = true;
                }
            }

            const connectionPoint = comp.getGirisNoktasi();
            const deviceCenter = { x: comp.x, y: comp.y };
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint, deviceCenter);

            ctx.restore();
        }

        // Cihazı çiz - local coordinates (0,0)
        const outerRadius = 20; // 40 çap için

        // Shadow efekti
        ctx.save();
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
            gradient.addColorStop(1, '#E8E8E8');    // Parlak gri
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

        // "G" harfi (Gaz) - SABİT boyut, metalik görünüm
        // Metalik gradient
        const textGradient = ctx.createLinearGradient(0, -10, 0, 10);
        if (comp.isSelected) {
            textGradient.addColorStop(0, '#FFFFFF');
            textGradient.addColorStop(0.5, '#9ab9f8');
            textGradient.addColorStop(1, '#5a79b8');
        } else {
            textGradient.addColorStop(0, '#E8E8E8');   // Parlak üst
            textGradient.addColorStop(0.3, '#C0C0C0'); // Orta metalik
            textGradient.addColorStop(0.6, '#A0A0A0'); // Koyu orta
            textGradient.addColorStop(1, '#D0D0D0');   // Parlak alt
        }

        // Gölge efekti
        ctx.shadowColor = comp.isSelected ? 'rgba(138, 180, 248, 0.8)' : 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;

        ctx.fillStyle = textGradient;
        ctx.font = `bold 20px Arial`; // Sabit boyut
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', 0, 1); // 1 cm (+y) aşağı kaydırıldı

        // Shadow sıfırla
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    drawOcak(ctx, comp, manager) {
        const zoom = state.zoom || 1;

        // ÖNCE fleks çizgisini çiz (component translate'ini geri al, pan/zoom'u koru)
        if (manager) {
            ctx.save();
            // --- DÜZELTME: Rotasyonu ve çeviriyi geri al ---
            if (comp.rotation) ctx.rotate(-comp.rotation * Math.PI / 180);
            ctx.translate(-comp.x, -comp.y);

            // BORU UCU KOORDİNATINI DOĞRUDAN BORUDAN AL
            let targetPoint = null;
            if (comp.fleksBaglanti?.boruId && comp.fleksBaglanti?.endpoint) {
                const pipe = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
                if (pipe) {
                    targetPoint = comp.getFleksBaglantiNoktasi(pipe);
                } else {
                    // Sadece bir kere logla (her frame değil)
                    if (!comp._fleksWarningLogged) {
                        console.warn('⚠️ OCAK FLEKS: Boru bulunamadı!', comp.fleksBaglanti.boruId);
                        comp._fleksWarningLogged = true;
                    }
                }
            } else {
                // Sadece bir kere logla
                if (!comp._fleksWarningLogged2) {
                    console.warn('⚠️ OCAK FLEKS: Bağlantı bilgisi eksik!', comp.fleksBaglanti);
                    comp._fleksWarningLogged2 = true;
                }
            }

            const connectionPoint = comp.getGirisNoktasi();
            const deviceCenter = { x: comp.x, y: comp.y };
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint, deviceCenter);

            ctx.restore();
        }

        // Sonra cihazı çiz (local context - zaten translate edilmiş)
        // NOT: drawComponent zaten ctx.translate(comp.x, comp.y) yapmış durumda
        ctx.save(); // Rotation için save
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        const boxSize = 15; // 40x40 kare için
        const cornerRadius = 3;

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
            const innerCorner = 2;
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
        const burnerRadius = 4;
        const offset = 7;
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

    drawSayac(ctx, comp, manager) {
        const { width, height, connectionOffset, nutHeight } = comp.config;
        const rijitUzunluk = comp.config.rijitUzunluk || (comp.ghostConnectionInfo ? 15 : 0);
        //rijitUzunluk = rijitUzunluk + 2
        const zoom = state.zoom || 1;

        if (manager) {
            ctx.save();
            // --- DÜZELTME: Rotasyonu ve çeviriyi geri al ---
            if (comp.rotation) ctx.rotate(-comp.rotation * Math.PI / 180);
            ctx.translate(-comp.x, -comp.y);

            // BORU UCU KOORDİNATINI DOĞRUDAN BORUDAN AL
            let targetPoint = null;
            if (comp.fleksBaglanti?.boruId && comp.fleksBaglanti?.endpoint) {
                const pipe = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
                if (pipe) {
                    targetPoint = comp.getFleksBaglantiNoktasi(pipe);
                } else {
                    // Sadece bir kere logla (her frame değil)
                    if (!comp._fleksWarningLogged) {
                        console.warn('⚠️ SAYAÇ FLEKS: Boru bulunamadı!', comp.fleksBaglanti.boruId);
                        comp._fleksWarningLogged = true;
                    }
                }
            } else {
                // Sadece bir kere logla
                if (!comp._fleksWarningLogged2) {
                    console.warn('⚠️ SAYAÇ FLEKS: Bağlantı bilgisi eksik!', comp.fleksBaglanti);
                    comp._fleksWarningLogged2 = true;
                }
            }

            // FLEKS SOL RAKORA BAĞLANIR (gövdeye değil, direkt rakora)
            const connectionPoint = comp.getSolRakorNoktasi();
            // deviceCenter null -> fleks içeri uzamaz, direkt rakora bağlanır
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint, null);

            ctx.restore();
        }

        ctx.save();
        // --- 1. Gövde (Gradient Metalik Görünüm) ---
        // NOT: Rotation is already applied in drawComponent, don't apply again
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Daha güzel gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) / 1.5);
        if (comp.isSelected) {
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.4, '#B8D4FF');
            gradient.addColorStop(0.7, '#8ab4f8');
            gradient.addColorStop(1, '#2a74d0');
        } else {
            gradient.addColorStop(0, '#F5F5F5');
            gradient.addColorStop(0.3, '#D0D0D0');
            gradient.addColorStop(0.7, '#A0A0A0');
            gradient.addColorStop(1, '#707070');
        }

        ctx.fillStyle = gradient;
        const radius = 4;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-width / 2, -height / 2, width, height, radius);
        } else {
            ctx.rect(-width / 2, -height / 2, width, height);
        }
        ctx.fill();

        // Çerçeve
        ctx.lineWidth = 1.2 / zoom;
        ctx.strokeStyle = comp.isSelected ? '#2a74d0' : '#444';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.stroke();

        // İç gölge efekti
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius - 1);
        } else {
            ctx.rect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2);
        }
        ctx.stroke();
        ctx.restore();

        // --- 2. Etiket (G4) ---
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.fillStyle = comp.isSelected ? '#1a54a0' : '#2a2a2a';
        ctx.font = `bold ${12}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G4', 0, 2);
        ctx.restore();

        // --- 3. Üst Bağlantı Rekorları (Detaylı) ---
        const connY = -height / 2;
        const nutWidth = 7;
        //const nutHeight = 4;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // Rekor gradient
        const rekorGradient = ctx.createLinearGradient(0, connY - nutHeight, 0, connY);
        rekorGradient.addColorStop(0, '#E8E8E8');
        rekorGradient.addColorStop(0.5, '#BCBCBC');
        rekorGradient.addColorStop(1, '#999999');

        ctx.lineWidth = 0.8 / zoom;
        ctx.strokeStyle = '#555';

        // Sol Rekor (Giriş)
        ctx.fillStyle = rekorGradient;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight, 1);
        } else {
            ctx.rect(-connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight);
        }
        ctx.fill();
        ctx.stroke();

        // Sağ Rekor (Çıkış)
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight, 1);
        } else {
            ctx.rect(connectionOffset - nutWidth / 2, connY - nutHeight, nutWidth, nutHeight);
        }
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // --- 4. Rijit Çıkış Kolu ---
        const armStartX = connectionOffset;
        const armStartY = connY - nutHeight;
        const armWidth = 1;

        // Çıkış borusunun renk grubunu al
        let rijitColorGroup = 'YELLOW'; // Varsayılan
        if (comp.cikisBagliBoruId && manager) {
            const cikisBoru = manager.findPipeById(comp.cikisBagliBoruId);
            if (cikisBoru) {
                rijitColorGroup = cikisBoru.colorGroup || 'YELLOW';
            }
        }

        // Boru rengini renk grubuna göre ayarla
        const rijitRenk = this.getRenkByGroup(rijitColorGroup, 'fleks', 1);
        const pipeGradient = ctx.createLinearGradient(armStartX - armWidth / 2, 0, armStartX + armWidth / 2, 0);
        pipeGradient.addColorStop(0, rijitRenk);
        pipeGradient.addColorStop(0.5, rijitRenk);
        pipeGradient.addColorStop(1, rijitRenk);

        ctx.fillStyle = pipeGradient;
        ctx.fillRect(armStartX - armWidth / 2, armStartY - rijitUzunluk, armWidth, rijitUzunluk);

        // Boru kenarlık
        //ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 0.6 / zoom;
        ctx.strokeRect(armStartX - armWidth / 2, armStartY - rijitUzunluk, armWidth, rijitUzunluk);
        ctx.beginPath();
        ctx.arc(armStartX, armStartY - rijitUzunluk, armWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        //ctx.stroke();
        /*
        // Çıkış ucu
        if (!comp.cikisKullanildi) {
            ctx.fillStyle = '#FF8C00';
            ctx.strokeStyle = '#CC7000';
            ctx.lineWidth = 1 / zoom;
            ctx.beginPath();
            ctx.arc(armStartX, armStartY - rijitUzunluk, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
*/
        ctx.restore();
    }

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
    }

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
            handleLength = comp.config.height / 2 + 10; // 12 + 20 = 32cm
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
    }

    drawSnapIndicator(ctx, snap) {
        // Snap göstergesi kaldırıldı - kullanıcı istemiyor
    }

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
        const offset = width / 2 - 10;

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

    drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint = null, deviceCenter = null) {
        let closestPipeEnd = targetPoint;
        let pipeDirection = null;
        let colorGroup = 'YELLOW'; // Varsayılan renk grubu

        // KRITIK: connectionPoint'i cihazın içine doğru uzat (15 cm)
        let adjustedConnectionPoint = connectionPoint;
        if (deviceCenter) {
            const dx_center = deviceCenter.x - connectionPoint.x;
            const dy_center = deviceCenter.y - connectionPoint.y;
            const dist_center = Math.hypot(dx_center, dy_center);
            const iceriMargin = 15; // cm

            if (dist_center > iceriMargin) {
                adjustedConnectionPoint = {
                    x: connectionPoint.x + (dx_center / dist_center) * iceriMargin,
                    y: connectionPoint.y + (dy_center / dist_center) * iceriMargin
                };
            } else {
                adjustedConnectionPoint = deviceCenter;
            }
        }

        // Eğer targetPoint verilmemişse (ghost preview), en yakın boru ucunu bul
        if (!targetPoint) {
            const currentFloorId = state.currentFloor?.id;
            const pipes = (manager.pipes || []).filter(p => p.floorId === currentFloorId);
            let minDist = Infinity;
            let closestPipe = null;

            // En yakın boru ucunu bul
            for (const pipe of pipes) {
                const dist1 = Math.hypot(pipe.p1.x - connectionPoint.x, pipe.p1.y - connectionPoint.y);
                if (dist1 < minDist) {
                    minDist = dist1;
                    closestPipeEnd = { x: pipe.p1.x, y: pipe.p1.y };
                    closestPipe = pipe;
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
                    closestPipe = pipe;
                    const pipeLength = Math.hypot(pipe.p2.x - pipe.p1.x, pipe.p2.y - pipe.p1.y);
                    if (pipeLength > 0) {
                        pipeDirection = {
                            x: (pipe.p1.x - pipe.p2.x) / pipeLength,
                            y: (pipe.p1.y - pipe.p2.y) / pipeLength
                        };
                    }
                }
            }

            // En yakın borunun renk grubunu al
            if (closestPipe) {
                colorGroup = closestPipe.colorGroup || 'YELLOW';
            }
        }

        // Fleks çizgisini ÇİZ (adjustedConnectionPoint kullan - cihazın içine uzanıyor)
        if (closestPipeEnd) {
            const dx = closestPipeEnd.x - adjustedConnectionPoint.x;
            const dy = closestPipeEnd.y - adjustedConnectionPoint.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 0.5) {
                return; // Çok yakınsa çizme
            }

            const amplitude = 1;      // Dalga genliği
            const frequency = 4;      // Dalga frekansı
            const segments = 50;      // Segment sayısı

            ctx.save();

            // Fleks rengini renk grubuna göre ayarla
            const fleksRenk = this.getRenkByGroup(colorGroup, 'fleks', 1);
            const adjustedColor = getAdjustedColor(fleksRenk, 'cihaz');
            ctx.strokeStyle = adjustedColor;
            ctx.lineWidth = 1;  // Daha kalın
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Gölge efekti
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4;

            ctx.beginPath();
            ctx.moveTo(adjustedConnectionPoint.x, adjustedConnectionPoint.y);

            for (let i = 1; i <= segments; i++) {
                const t = i / segments;

                const baseX = adjustedConnectionPoint.x + dx * t;
                const baseY = adjustedConnectionPoint.y + dy * t;

                const perpX = -dy / distance;
                const perpY = dx / distance;

                const smoothEnvelope = t * t / 2 * (4 - 2 * t);

                const wave = Math.sin(smoothEnvelope * frequency * Math.PI * 2);

                const sineOffset = smoothEnvelope * (1 - smoothEnvelope) * 4 * amplitude * wave;

                const finalX = baseX + perpX * sineOffset;
                const finalY = baseY + perpY * sineOffset;

                ctx.lineTo(finalX, finalY);
            }

            ctx.stroke();
            ctx.restore();
        }
    }

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
        ctx.lineTo(0, 1);
        ctx.lineTo(halfSize, halfSize);    // Sağ alt
        ctx.lineTo(halfSize, -halfSize);    // Sağ alt
        ctx.lineTo(0, -1);                  // Orta
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawCihazGhostConnection(ctx, ghost, manager) {
        const connInfo = ghost.ghostConnectionInfo;
        if (!connInfo || !connInfo.boruUcu || !connInfo.girisNoktasi) return;

        const { boruUcu, girisNoktasi } = connInfo;
        const boru = boruUcu.boru;

        // Boru ucunda vana var mı kontrol et
        const vanaVarMi = manager.components.some(comp =>
            comp.type === 'vana' &&
            comp.bagliBoruId === boru.id &&
            Math.hypot(comp.x - boruUcu.nokta.x, comp.y - boruUcu.nokta.y) < 10
        );

        ctx.save();

        // 1. Vana preview (yoksa çiz)
        if (!vanaVarMi) {
            // Vana pozisyonu hesapla - boru ucundan 4cm içeride (kenar margin)
            const VANA_EDGE_MARGIN = 4; // cm
            const VANA_SIZE = 8; // cm
            const VANA_CENTER_MARGIN = VANA_EDGE_MARGIN + (VANA_SIZE / 2); // 8 cm

            const dx = boru.p2.x - boru.p1.x;
            const dy = boru.p2.y - boru.p1.y;
            const length = Math.hypot(dx, dy);

            let vanaX, vanaY;
            if (boruUcu.uc === 'p1') {
                // p1 ucundayız, vana p1'den içeri
                vanaX = boruUcu.nokta.x + (dx / length) * VANA_CENTER_MARGIN;
                vanaY = boruUcu.nokta.y + (dy / length) * VANA_CENTER_MARGIN;
            } else {
                // p2 ucundayız, vana p2'den içeri
                vanaX = boruUcu.nokta.x - (dx / length) * VANA_CENTER_MARGIN;
                vanaY = boruUcu.nokta.y - (dy / length) * VANA_CENTER_MARGIN;
            }

            // Vana çiz
            ctx.save();
            ctx.translate(vanaX, vanaY);
            ctx.rotate(boru.aci);
            ctx.globalAlpha = 0.6;

            const vanaColor = '#00bffa';
            const adjustedColor = getAdjustedColor(vanaColor, 'vana');
            ctx.fillStyle = adjustedColor;

            const halfSize = VANA_SIZE / 2;
            ctx.beginPath();
            ctx.moveTo(-halfSize, -halfSize);
            ctx.lineTo(-halfSize, halfSize);
            ctx.lineTo(0, 1);
            ctx.lineTo(halfSize, halfSize);
            ctx.lineTo(halfSize, -halfSize);
            ctx.lineTo(0, -1);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        // 2. Fleks çizgisi (boru ucundan cihazın içine doğru)
        // Cihazın en yakın kenarını ve merkeze doğru bitiş noktasını hesapla
        const girisNoktasi_cihaz = ghost.getGirisNoktasi();
        const merkez = { x: ghost.x, y: ghost.y };

        // Girişten merkeze doğru vektör
        const dx_flex = merkez.x - girisNoktasi_cihaz.x;
        const dy_flex = merkez.y - girisNoktasi_cihaz.y;
        const uzunluk_flex = Math.hypot(dx_flex, dy_flex);

        // İçeri margin - fleks bitiş noktası cihazın içine doğru uzansın
        const iceriMargin = 15; // cm - ghost için daha belirgin olsun

        let fleksBitis;
        if (uzunluk_flex > iceriMargin) {
            // Girişten merkeze doğru iceriMargin kadar git
            fleksBitis = {
                x: girisNoktasi_cihaz.x + (dx_flex / uzunluk_flex) * iceriMargin,
                y: girisNoktasi_cihaz.y + (dy_flex / uzunluk_flex) * iceriMargin
            };
        } else {
            // Eğer giriş zaten merkeze çok yakınsa, merkezi kullan
            fleksBitis = merkez;
        }

        // Fleks rengini borunun colorGroup'una göre ayarla
        const colorGroup = boru?.colorGroup || 'YELLOW';
        const fleksRenk = this.getRenkByGroup(colorGroup, 'fleks', 1);

        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = fleksRenk;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Kesikli çizgi

        ctx.beginPath();
        ctx.moveTo(boruUcu.nokta.x, boruUcu.nokta.y);
        ctx.lineTo(fleksBitis.x, fleksBitis.y);
        ctx.stroke();

        ctx.setLineDash([]); // Reset dash
        ctx.restore();
    }

    drawSayacGhostConnection(ctx, ghost, manager) {
        const connInfo = ghost.ghostConnectionInfo;
        if (!connInfo || !connInfo.boruUcu) return;

        const { boruUcu } = connInfo;
        const boru = boruUcu.boru;

        // 1. Boru ucunda vana var mı? (Ghost aşamasında yoksa hayalet vana çiz)
        const vanaVarMi = manager.components.some(comp =>
            comp.type === 'vana' &&
            comp.bagliBoruId === boru.id &&
            Math.hypot(comp.x - boruUcu.nokta.x, comp.y - boruUcu.nokta.y) < 10
        );

        ctx.save();

        if (!vanaVarMi) {
            // Vana Önizlemesi (Boru ucundan 4cm içeride)
            const VANA_CENTER_MARGIN = 8; // 4cm edge + 4cm radius
            const dx = boru.p2.x - boru.p1.x;
            const dy = boru.p2.y - boru.p1.y;
            const length = Math.hypot(dx, dy);

            let vanaX, vanaY;
            if (boruUcu.uc === 'p1') {
                vanaX = boruUcu.nokta.x + (dx / length) * VANA_CENTER_MARGIN;
                vanaY = boruUcu.nokta.y + (dy / length) * VANA_CENTER_MARGIN;
            } else {
                vanaX = boruUcu.nokta.x - (dx / length) * VANA_CENTER_MARGIN;
                vanaY = boruUcu.nokta.y - (dy / length) * VANA_CENTER_MARGIN;
            }

            ctx.translate(vanaX, vanaY);
            ctx.rotate(boru.aci);
            ctx.globalAlpha = 0.6;

            // Vana rengi
            const adjustedColor = getAdjustedColor('#00bffa', 'vana');
            ctx.fillStyle = adjustedColor;

            // Basit vana şekli (Kelebek)
            const hs = 4;
            ctx.beginPath();
            ctx.moveTo(-hs, -hs);
            ctx.lineTo(-hs, hs);
            ctx.lineTo(0, 1);
            ctx.lineTo(hs, hs);
            ctx.lineTo(hs, -hs);
            ctx.lineTo(0, -1);
            ctx.closePath();
            ctx.fill();

            ctx.rotate(-boru.aci); // Rotasyonu geri al
            ctx.translate(-vanaX, -vanaY); // Translate'i geri al
        }

        // 2. Fleks Çizgisi (Basit kesikli çizgi)
        // FLEKS SOL RAKORA BAĞLANIR (gövdeye değil)
        const solRakor = ghost.getSolRakorNoktasi();

        // Fleks rengini borunun colorGroup'una göre ayarla
        const colorGroup = boru?.colorGroup || 'YELLOW';
        const fleksRenk = this.getRenkByGroup(colorGroup, 'fleks', 1);

        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = fleksRenk;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        // Boru ucundan (veya vana hizasından)
        ctx.moveTo(boruUcu.nokta.x, boruUcu.nokta.y);
        // Sayacın sol rakoruna
        ctx.lineTo(solRakor.x, solRakor.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.restore();
    }


}