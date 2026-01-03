import { BORU_TIPLERI, RENK_GRUPLARI, getRenkGruplari } from './objects/pipe.js';
import { SERVIS_KUTUSU_CONFIG, CIKIS_YONLERI } from './objects/service-box.js';
import { SAYAC_CONFIG } from './objects/meter.js';
import { VANA_CONFIG, VANA_TIPLERI } from './objects/valve.js';
import { CIHAZ_TIPLERI, FLEKS_CONFIG } from './objects/device.js';
// YENİ: isLightMode ve THEME_COLORS import edildi
import { getAdjustedColor, state, getDimensionPlumbingColor, isLightMode, getShadow, THEME_COLORS } from '../general-files/main.js';


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

// Dosyanın en üstüne, importların altına ekleyin:
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

//   { pos: 0.75, color: '#ff' }, // Magenta

/**
 * İki nokta arasındaki mesafeyi hesaplar
 */
function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Borular arasında parent-child ilişkisini kurar ve etiketler
 * @param {Array} pipes - Borular listesi
 * @param {Array} components - Bileşenler listesi
 * @returns {Map} pipe.id -> { label, parent, children }
 */
function buildPipeHierarchy(pipes, components) {
    if (!pipes || !components || pipes.length === 0) {
        return new Map();
    }

    const hierarchy = new Map();
    const TOLERANCE = 15; // cm cinsinden mesafe toleransı (artırıldı)

    // Kaynak bileşeni bul (Servis Kutusu veya Sayaç)
    const sourceComponent = components.find(c =>
        c.type === 'servis_kutusu' || c.type === 'sayac'
    );

    let rootPipes = [];
    let sourcePos = null;

    if (sourceComponent) {
        // Kaynağa bağlı ilk boruyu/boruları bul
        sourcePos = { x: sourceComponent.x, y: sourceComponent.y };
        rootPipes = pipes.filter(pipe =>
            distance(pipe.p1, sourcePos) < TOLERANCE ||
            distance(pipe.p2, sourcePos) < TOLERANCE
        );
    }

    if (rootPipes.length === 0) {
        // Kaynak yoksa veya bağlı boru yoksa, en soldaki/üstteki borudan başla
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

    // Ziyaret edilmemiş boruları da etiketle (bağlantısız borular)
    pipes.forEach(pipe => {
        if (!visited.has(pipe.id)) {
            const label = String.fromCharCode(65 + labelIndex++);
            hierarchy.set(pipe.id, {
                label: label,
                parent: null,
                children: []
            });
        }
    });

    return hierarchy;
}

export class PlumbingRenderer {
    constructor() {
        // Tema renkleri main.js'ten import ediliyor (THEME_COLORS)
    }


    /**
     * Renk grubundan opacity ile renk al (TEMAya göre dinamik)
     */
    getRenkByGroup(colorGroup, tip, opacity) {
        const renkGruplari = getRenkGruplari(); // Dinamik olarak temaya göre al
        const group = renkGruplari[colorGroup] || renkGruplari.YELLOW;
        const template = group[tip];

        if (template.includes('{opacity}')) {
            return template.replace('{opacity}', opacity);
        }
        return template;
    }

    isLightMode() {
        // main.js'ten import edilen fonksiyonu kullan
        return isLightMode();
    }



    getSecilenRenk(colorGroup) {
        // İsteğiniz üzerine tüm seçili durumlar için standart gri
        return CUSTOM_COLORS.SELECTED;
    }

    /**
     * Hex rengi RGB'ye çevir
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 191, b: 255 }; // Varsayılan
    }

    render(ctx, manager) {
        if (!manager) return;

        // Hierarchy'yi hesapla ve cache'le (selection-manager için)
        const hierarchy = buildPipeHierarchy(manager.pipes, manager.components);
        window._pipeHierarchy = hierarchy;

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

        // İç tesisat sayaç ekleme - kesikli boru preview
        if (manager.interactionManager?.meterPlacementState === 'drawing_start_pipe' &&
            manager.interactionManager.meterStartPoint &&
            manager.interactionManager.meterPreviewEndPoint) {
            this.drawMeterStartPipePreview(ctx, manager.interactionManager);
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
        } else {
            // Ölçüler gizli iken sadece etiketleri göster
            const showLabelsOnly = !shouldBeFaded && state.dimensionMode === 0;
            if (showLabelsOnly) {
                this.drawPipeLabelsOnly(ctx, manager.pipes, manager.components);
            }
        }

        // Ghost eleman (her zaman yarı saydam) - sadece mouse hareket ettikten sonra görünsün
        if (manager.tempComponent && manager.interactionManager.lastMousePoint) {
            // İÇ TESİSAT: İlk tıklama öncesi sayaç ghost gösterme
            const isSayacBeforeFirstClick =
                manager.tempComponent.type === 'sayac' &&
                manager.interactionManager.meterPlacementState === null &&
                !manager.interactionManager.hasServisKutusu();

            if (!isSayacBeforeFirstClick) {
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
                else if (manager.tempComponent.type === 'baca') {
                    // Baca ghost - sadece cihaz üzerinde görünsün
                    if (manager.tempComponent.ghostSnapCihaz) {
                        this.drawBaca(ctx, manager.tempComponent, manager);
                    }
                }
                else {
                    // Diğer tip ghostlar için normal drawComponent
                    this.drawComponent(ctx, manager.tempComponent, manager);
                }

                ctx.restore();
            } // isSayacBeforeFirstClick kapatma
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

        // Seçili borunun yolunu sağ üstte göster
        if (window._selectedPipePath && window._selectedPipePath.length > 0) {
            this.drawSelectedPipePath(ctx);
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

            // Kesikli çizgi desteği (İÇ TESİSAT için temsili boru)
            if (pipe.lineStyle === 'dashed') {
                ctx.setLineDash([10, 2]); // 10 dolu, 2 boş
            } else {
                ctx.setLineDash([]);
            }

            // Koordinat sistemini borunun başlangıcına taşı ve döndür
            ctx.translate(pipe.p1.x, pipe.p1.y);
            ctx.rotate(angle);

            if (pipe.isSelected) {
                // Seçili borunun rengi colorGroup'a göre ayarlanır
                const secilenRenk = this.getSecilenRenk(pipe.colorGroup);

                // Seçili rengi RGB'ye çevir
                const rgb = this.hexToRgb(secilenRenk);

                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
                gradient.addColorStop(0.0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
                gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
                gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
                ctx.fillStyle = gradient;
                //getShadow(ctx);
                ctx.fillRect(0, -width / 2, length, width);

            } else {
                // Gradient ile 3D silindir etkisi (Kenarlarda yumuşak siyahlık)
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);

                // Renk grubuna göre renk seç
                const colorGroup = pipe.colorGroup || 'YELLOW';

                // Kenarlarda hafif karartma, ortası boru rengi
                // Geçişler yumuşak tutuldu
                if (isLightMode) {
                    gradient.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'boru', 0.5));
                    gradient.addColorStop(0.5, this.getRenkByGroup(colorGroup, 'boru', 1));
                    gradient.addColorStop(1, this.getRenkByGroup(colorGroup, 'boru', 0.5));
                    //getShadow(ctx);
                }
                else {
                    gradient.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'boru', 1));
                    gradient.addColorStop(0.1, this.getRenkByGroup(colorGroup, 'boru', 0.5));
                    gradient.addColorStop(0.9, this.getRenkByGroup(colorGroup, 'boru', 0.5));
                    gradient.addColorStop(1, this.getRenkByGroup(colorGroup, 'boru', 1));
                }
                ctx.fillStyle = gradient;
                ctx.fillRect(0, -width / 2, length, width);
            }

            ctx.restore();

            // İç tesisat temsili boru: Başlangıç noktasına yuvarlak ekle
            if (pipe.isTemsiliBoru && pipe.lineStyle === 'dashed') {
                ctx.save();
                const colorGroup = pipe.colorGroup || 'YELLOW';
                const yuvarlatRenk = this.getRenkByGroup(colorGroup, 'boru', 1);

                ctx.fillStyle = yuvarlatRenk;
                ctx.beginPath();
                ctx.arc(pipe.p1.x, pipe.p1.y, width / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
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
        const themeColors = this.isLightMode() ? THEME_COLORS.light : THEME_COLORS.dark;
        // p1 noktası
        ctx.fillStyle = themeColors.pipeEndpoint;
        ctx.strokeStyle = themeColors.pipeEndpointStroke;

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

    drawBacaEndpoints(ctx, baca) {
        // Baca segment uç noktalarını küçük noktalarla göster (seçili bacalar için)
        const r = 1.6; // Küçük nokta
        const themeColors = this.isLightMode() ? THEME_COLORS.light : THEME_COLORS.dark;

        ctx.fillStyle = themeColors.pipeEndpoint;
        ctx.strokeStyle = themeColors.pipeEndpointStroke;
        ctx.lineWidth = 1;

        // Her segment için uç noktaları çiz
        baca.segments.forEach((segment, index) => {
            // Segment başlangıcı (ilk segment hariç - cihaza bağlı)
            if (index > 0) {
                ctx.beginPath();
                ctx.arc(segment.x1, segment.y1, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // Segment sonu (her zaman göster)
            ctx.beginPath();
            ctx.arc(segment.x2, segment.y2, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
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
                    if (oncekiBoru) angle = oncekiBoru.aci;
                }
            }

            ctx.save();
            ctx.translate(vanaPos.x, vanaPos.y);
            ctx.rotate(angle);

            // 1. Boru Rengi
            let colorGroup = pipe.colorGroup || 'YELLOW';
            if (colorGroup === 'SARI') colorGroup = 'YELLOW';
            if (colorGroup === 'TURKUAZ') colorGroup = 'TURQUAZ';
            if (colorGroup === 'MAVI') colorGroup = 'BLUE';
            if (colorGroup === 'TURUNCU') colorGroup = 'ORANGE';

            // 2. Mod ve Tema Seçimi
            const mode = isLightMode() ? 'light' : 'dark';
            const theme = VALVE_THEMES[colorGroup] || VALVE_THEMES.DEFAULT;
            const palette = theme[mode];

            // 3. Gradient
            const gradient = ctx.createConicGradient(0, 0, 0);

            if (pipe.vana.isSelected) {
                // Seçiliyse düz turuncu veya gri (eski kodunuzda turuncu vardı)
                ctx.fillStyle = '#FF8C00';
            } else {
                palette.forEach(s => gradient.addColorStop(s.pos, s.color));
                ctx.fillStyle = gradient;
            }

            getShadow(ctx);

            // Çizim
            ctx.beginPath();
            ctx.moveTo(-halfSize, -halfSize);
            ctx.lineTo(-halfSize, halfSize);
            ctx.lineTo(0, 1);
            ctx.lineTo(halfSize, halfSize);
            ctx.lineTo(halfSize, -halfSize);
            ctx.lineTo(0, -1);
            ctx.closePath();
            ctx.fill();

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
    }

    drawServisKutusu(ctx, comp) {
        const { width, height } = SERVIS_KUTUSU_CONFIG;
        const colors = CUSTOM_COLORS.BOX_ORANGE;

        // 1. Gölge Efekti
        getShadow(ctx);

        // 2. Gradient Oluşturma
        const grad = ctx.createLinearGradient(0, -height / 2, 0, height / 2);

        if (comp.isSelected) {
            // Seçili Durum: Gri Gradyan
            grad.addColorStop(0, '#A0A0A0');
            grad.addColorStop(0.5, '#808080');
            grad.addColorStop(1, '#606060');
            ctx.strokeStyle = '#505050';
        } else {
            // Normal Durum: Turuncu Gradyan
            grad.addColorStop(0, colors.top);
            grad.addColorStop(0.5, colors.middle);
            grad.addColorStop(1, colors.bottom);
            ctx.strokeStyle = colors.stroke;
        }

        // 3. Gövdeyi Çiz
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();

        // 4. Kenar Çizgisi
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.2 / (state.zoom || 1);
        ctx.stroke();

        // 5. İç Kapak Detayı
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.strokeRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6);

        // 6. Yazı (S.K.)
        ctx.fillStyle = '#222';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S.K.', 0, 1);

    }

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

                    /* 
                                      // Büyük kırmızı daire - çıkış noktası
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

    drawVana(ctx, comp, manager = null) {
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

        // ÖNCE fleks çizgisini çiz (component translate'ini geri al)
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
                        // console.warn('⚠️ FLEKS: Boru bulunamadı!', comp.fleksBaglanti.boruId);
                        comp._fleksWarningLogged = true;
                    }
                }
            } else {
                if (!comp._fleksWarningLogged2) {
                    // console.warn('⚠️ FLEKS: Bağlantı bilgisi eksik!', comp.fleksBaglanti);
                    comp._fleksWarningLogged2 = true;
                }
            }

            const connectionPoint = comp.getGirisNoktasi();
            const deviceCenter = { x: comp.x, y: comp.y };
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint, deviceCenter, comp);

            ctx.restore();
        }

        const outerRadius = 20;
        ctx.save();
        getShadow(ctx);

        // Ana gövde - Radial gradient
        const gradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, outerRadius);
        const colors = isLightMode() ? CUSTOM_COLORS.DEVICE_BLUE.light : CUSTOM_COLORS.DEVICE_BLUE.dark;

        if (comp.isSelected) {
            // Seçili: Gri Tonlama
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.3, '#E0E0E0');
            gradient.addColorStop(0.7, '#A0A0A0');
            gradient.addColorStop(1, '#606060');
        } else {
            // Normal: Mavi Tonlama
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(0.3, colors[0.3]);
            gradient.addColorStop(0.7, colors[0.6]);
            gradient.addColorStop(1, colors[1]);
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Dış çerçeve
        ctx.shadowBlur = 0;
        ctx.strokeStyle = comp.isSelected ? CUSTOM_COLORS.SELECTED : colors[1];
        ctx.lineWidth = (comp.isSelected ? 2.5 : 1.5) / zoom;
        ctx.stroke();

        // İç panel
        const innerRadius = 14;
        const innerGradient = ctx.createRadialGradient(-3, -3, 0, 0, 0, innerRadius);
        innerGradient.addColorStop(0, '#383838');
        innerGradient.addColorStop(1, '#616161');
        ctx.fillStyle = innerGradient;
        ctx.beginPath();
        ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // "K" Harfi
        ctx.fillStyle = '#FFF';
        ctx.font = `bold 20px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', 0, 1);

        ctx.restore();
    }
    drawOcak(ctx, comp, manager) {
        const zoom = state.zoom || 1;

        // ÖNCE fleks çizgisini çiz
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
                        // console.warn('⚠️ OCAK FLEKS: Boru bulunamadı!', comp.fleksBaglanti.boruId);
                        comp._fleksWarningLogged = true;
                    }
                }
            } else {
                if (!comp._fleksWarningLogged2) {
                    // console.warn('⚠️ OCAK FLEKS: Bağlantı bilgisi eksik!', comp.fleksBaglanti);
                    comp._fleksWarningLogged2 = true;
                }
            }

            const connectionPoint = comp.getGirisNoktasi();
            const deviceCenter = { x: comp.x, y: comp.y };
            this.drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint, deviceCenter, comp);

            ctx.restore();
        }

        ctx.save();
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        const boxSize = 15;
        const cornerRadius = 3;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const gradient = ctx.createRadialGradient(-6, -6, 0, 0, 0, boxSize * 1.5);
        const colors = isLightMode() ? CUSTOM_COLORS.DEVICE_BLUE.light : CUSTOM_COLORS.DEVICE_BLUE.dark;

        if (comp.isSelected) {
            // Seçili: Gri
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.5, '#A0A0A0');
            gradient.addColorStop(1, '#606060');
        } else {
            // Normal: Mavi
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(0.5, colors[0.6]);
            gradient.addColorStop(1, colors[1]);
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

        ctx.shadowBlur = 0;
        ctx.strokeStyle = comp.isSelected ? CUSTOM_COLORS.SELECTED : colors[1];
        ctx.lineWidth = (comp.isSelected ? 2.5 : 2) / zoom;
        ctx.stroke();

        // Ocak Gözleri
        const burnerRadius = 4;
        const offset = 7;
        const burnerPositions = [
            { x: -offset, y: -offset },
            { x: offset, y: -offset },
            { x: -offset, y: offset },
            { x: offset, y: offset }
        ];

        burnerPositions.forEach(pos => {
            const burnerGradient = ctx.createRadialGradient(pos.x - 2, pos.y - 2, 0, pos.x, pos.y, burnerRadius);
            burnerGradient.addColorStop(0, '#555');
            burnerGradient.addColorStop(1, '#111');
            ctx.fillStyle = burnerGradient;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, burnerRadius, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    /**
     * Baca çizimi
     */
    drawBaca(ctx, baca, manager) {
        const zoom = state.zoom || 1;
        const BACA_CONFIG = {
            genislik: 12,  // 12cm genişlik
            havalandirmaGenislik: 10,  // İnce kenar
            havalandirmaUzunluk: 29,   // Geniş kenar
            havalandirmaOffset: 0,  // Baca ucundan ne kadar uzakta
            izgaraSayisi: 6,
            // Gri tonlar - pastel
            fillColorLight: 'rgba(111, 112, 112, 0.8)',  // Açık gri
            fillColorMid: 'rgba(221, 235, 235, 0.8)',    // Orta gri
            strokeColor: '#babbbbff'      // Stroke (fill'e yakın)
        };

        ctx.save();

        // Bağlı cihazı bul (clipping için)
        const parentCihaz = manager.components.find(c => c.id === baca.parentCihazId && c.type === 'cihaz');

        // Round join ile yumuşak köşeler
        ctx.lineWidth = BACA_CONFIG.genislik;
        ctx.lineJoin = 'round';  // Yuvarlatılmış köşeler
        ctx.lineCap = 'round';   // Yuvarlatılmış uçlar

        // Gradient helper - her segment için perpendicular gradient
        const createSegmentGradient = (seg, startX, startY) => {
            const dx = seg.x2 - startX;
            const dy = seg.y2 - startY;
            const midX = (startX + seg.x2) / 2;
            const midY = (startY + seg.y2) / 2;
            const angle = Math.atan2(dy, dx);
            const perpAngle = angle + Math.PI / 2;

            const gradStart = {
                x: midX + Math.cos(perpAngle) * BACA_CONFIG.genislik / 2,
                y: midY + Math.sin(perpAngle) * BACA_CONFIG.genislik / 2
            };
            const gradEnd = {
                x: midX - Math.cos(perpAngle) * BACA_CONFIG.genislik / 2,
                y: midY - Math.sin(perpAngle) * BACA_CONFIG.genislik / 2
            };

            const gradient = ctx.createLinearGradient(gradStart.x, gradStart.y, gradEnd.x, gradEnd.y);
            gradient.addColorStop(0, BACA_CONFIG.fillColorLight);
            gradient.addColorStop(0.5, BACA_CONFIG.fillColorMid);
            gradient.addColorStop(1, BACA_CONFIG.fillColorLight);
            return gradient;
        };

        // 1. Her segment için ayrı gradient ile çiz (köşelerde düzgün görünür)
        baca.segments.forEach((segment, index) => {
            ctx.beginPath();

            // Başlangıç noktası (clipping hesabı ile)
            let startX = segment.x1;
            let startY = segment.y1;

            if (index === 0 && parentCihaz) {
                const cihazRadius = Math.max(parentCihaz.config.width, parentCihaz.config.height) / 2;
                const distFromCenter = Math.hypot(segment.x1 - parentCihaz.x, segment.y1 - parentCihaz.y);
                if (distFromCenter < cihazRadius) {
                    const dx = segment.x2 - segment.x1;
                    const dy = segment.y2 - segment.y1;
                    const angle = Math.atan2(dy, dx);
                    const startOffset = cihazRadius - distFromCenter;
                    startX = segment.x1 + Math.cos(angle) * startOffset;
                    startY = segment.y1 + Math.sin(angle) * startOffset;
                }
            }

            ctx.moveTo(startX, startY);
            ctx.lineTo(segment.x2, segment.y2);

            // Gradient uygula
            const gradient = createSegmentGradient(segment, startX, startY);
            ctx.strokeStyle = gradient;
            ctx.stroke();
        });

        // 2. Köşeleri arc ile doldur - radial gradient
        const cornerRadius = BACA_CONFIG.genislik / 2;
        for (let i = 0; i < baca.segments.length - 1; i++) {
            const seg1 = baca.segments[i];
            const seg2 = baca.segments[i + 1];

            // Köşe noktası (segmentlerin birleştiği nokta)
            const cornerX = seg1.x2;
            const cornerY = seg1.y2;

            // Radial gradient: merkezden kenarlara
            const radialGrad = ctx.createRadialGradient(cornerX, cornerY, 0, cornerX, cornerY, cornerRadius);
            radialGrad.addColorStop(0, BACA_CONFIG.fillColorMid);
            radialGrad.addColorStop(1, BACA_CONFIG.fillColorLight);

            ctx.beginPath();
            ctx.arc(cornerX, cornerY, cornerRadius, 0, Math.PI * 2);
            ctx.fillStyle = radialGrad;
            //ctx.fill();
        }

        // Outline ve highlight kaldırıldı - sadece gradient yeterli

        // Havalandırma ızgarası (ESC basılınca) - BACANIN DIŞINDA
        if (baca.havalandirma && baca.segments.length > 0) {
            const lastSegment = baca.segments[baca.segments.length - 1];
            const dx = lastSegment.x2 - lastSegment.x1;
            const dy = lastSegment.y2 - lastSegment.y1;
            const segmentAngle = Math.atan2(dy, dx);

            // Izgara pozisyonu: son segment ucundan offset kadar ötede
            const offsetDistance = BACA_CONFIG.genislik / 2 + BACA_CONFIG.havalandirmaOffset;
            const izgaraX = lastSegment.x2 + Math.cos(segmentAngle) * offsetDistance;
            const izgaraY = lastSegment.y2 + Math.sin(segmentAngle) * offsetDistance;

            ctx.save();
            ctx.translate(izgaraX, izgaraY);
            ctx.rotate(segmentAngle);

            // Havalandırma dikdörtgeni - sağdan ve soldan birer ızgara genişliği kaldırılmış
            const izgaraGenislik = BACA_CONFIG.havalandirmaGenislik;  // 10cm
            const hvGenislik = BACA_CONFIG.havalandirmaGenislik;  // 10cm
            const hvUzunluk = BACA_CONFIG.havalandirmaUzunluk - 2 * izgaraGenislik;  // 30 - 20 = 10cm

            // Simetrik gradient (gri tonlar): açık → orta → açık
            const gradient = ctx.createLinearGradient(0, -2 * hvUzunluk, 0, hvUzunluk);
            gradient.addColorStop(0, '#D8D8D8');    // Açık
            gradient.addColorStop(0.5, '#B8B8B8');  // Orta
            gradient.addColorStop(1, '#D8D8D8');    // Açık (simetrik)

            ctx.fillStyle = gradient;
            ctx.strokeStyle = BACA_CONFIG.strokeColor;
            ctx.lineWidth = 0.8 / zoom;

            const hvX = -hvGenislik;
            const hvY = -hvUzunluk;

            ctx.fillRect(hvX, hvY, hvGenislik, 2 * hvUzunluk);
            ctx.strokeRect(hvX, hvY, hvGenislik, 2 * hvUzunluk);

            // Izgaralar (4 çubuk - geniş kenar boyunca)
            ctx.strokeStyle = '#A0A0A0';  // Daha koyu gri
            ctx.lineWidth = 0.6 / zoom;
            const izgaraAralik = 2 * hvUzunluk / (BACA_CONFIG.izgaraSayisi + 1);

            for (let i = 1; i <= BACA_CONFIG.izgaraSayisi; i++) {
                const y = hvY + i * izgaraAralik;
                ctx.beginPath();
                ctx.moveTo(hvX, y);
                ctx.lineTo(hvX + hvGenislik, y);
                ctx.stroke();
            }

            ctx.restore();
        }

        // Ghost segment (çizim sırasında)
        if (baca.isDrawing && manager?.interactionManager?.lastMousePoint) {
            const ghostSeg = baca.getGhostSegment(
                manager.interactionManager.lastMousePoint.x,
                manager.interactionManager.lastMousePoint.y
            );

            if (ghostSeg) {
                const dx = ghostSeg.x2 - ghostSeg.x1;
                const dy = ghostSeg.y2 - ghostSeg.y1;
                const length = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);

                ctx.save();
                ctx.translate(ghostSeg.x1, ghostSeg.y1);
                ctx.rotate(angle);

                // Ghost segment (yarı saydam) - Gri tonlar
                ctx.globalAlpha = 0.5;

                // Simetrik gradient
                const ghostSegmentGradient = ctx.createLinearGradient(0, -BACA_CONFIG.genislik / 2, 0, BACA_CONFIG.genislik / 2);
                ghostSegmentGradient.addColorStop(0, BACA_CONFIG.fillColorLight);
                ghostSegmentGradient.addColorStop(0.5, BACA_CONFIG.fillColorMid);
                ghostSegmentGradient.addColorStop(1, BACA_CONFIG.fillColorLight);

                ctx.fillStyle = ghostSegmentGradient;
                ctx.strokeStyle = BACA_CONFIG.strokeColor;
                ctx.lineWidth = 1.5 / zoom;
                ctx.setLineDash([5 / zoom, 5 / zoom]);

                ctx.fillRect(0, -BACA_CONFIG.genislik / 2, length, BACA_CONFIG.genislik);
                ctx.strokeRect(0, -BACA_CONFIG.genislik / 2, length, BACA_CONFIG.genislik);

                ctx.setLineDash([]);
                ctx.globalAlpha = 1;

                // Ghost havalandırma - gerçek ızgarayla aynı (segment sonunda + offset)
                const offsetDistance = BACA_CONFIG.genislik / 2 + BACA_CONFIG.havalandirmaOffset;
                ctx.translate(length + offsetDistance, 0);
                const izgaraGenislik = BACA_CONFIG.havalandirmaGenislik;
                const hvGenislik = BACA_CONFIG.havalandirmaGenislik;
                const hvUzunluk = BACA_CONFIG.havalandirmaUzunluk - 2 * izgaraGenislik;  // 30 - 20 = 10cm

                ctx.globalAlpha = 0.5;

                // Simetrik gradient (gri tonlar) - gerçek ızgarayla aynı
                const ghostGradient = ctx.createLinearGradient(0, -2 * hvUzunluk, 0, hvUzunluk);
                ghostGradient.addColorStop(0, '#D8D8D8');    // Açık
                ghostGradient.addColorStop(0.5, '#B8B8B8');  // Orta
                ghostGradient.addColorStop(1, '#D8D8D8');    // Açık (simetrik)

                ctx.fillStyle = ghostGradient;
                ctx.strokeStyle = BACA_CONFIG.strokeColor;
                ctx.lineWidth = 0.8 / zoom;

                const hvX = -hvGenislik;  // Sol tarafa kaydır (gerçek ızgara gibi)
                const hvY = -hvUzunluk;

                ctx.fillRect(hvX, hvY, hvGenislik, 2 * hvUzunluk);
                ctx.strokeRect(hvX, hvY, hvGenislik, 2 * hvUzunluk);

                // Izgaralar (6 çubuk - gerçek ızgarayla aynı)
                ctx.strokeStyle = '#A0A0A0';
                ctx.lineWidth = 0.6 / zoom;
                const izgaraAralik = 2 * hvUzunluk / (BACA_CONFIG.izgaraSayisi + 1);

                for (let i = 1; i <= BACA_CONFIG.izgaraSayisi; i++) {
                    const y = hvY + i * izgaraAralik;
                    ctx.beginPath();
                    ctx.moveTo(hvX, y);
                    ctx.lineTo(hvX + hvGenislik, y);
                    ctx.stroke();
                }

                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }

        ctx.restore();
    }

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

            // Yazıyı çiz - THEME_COLORS'dan al (sadece uzunluk)
            const plumbingDimensionColor = getDimensionPlumbingColor();
            ctx.fillStyle = plumbingDimensionColor;
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

        // Yazıyı çiz (geçici için farklı renk, arka plan yok) - THEME_COLORS'dan al
        const plumbingDimensionColor = getDimensionPlumbingColor();
        ctx.fillStyle = plumbingDimensionColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, 0, 0);

        ctx.restore();
    }

    /**
     * Sadece boru etiketlerini çizer (ölçüler gizli iken)
     * Ortadaki harf KIRMIZI renkte
     */
    drawPipeLabelsOnly(ctx, pipes, components) {
        if (!pipes || pipes.length === 0) return;

        const zoom = state.zoom || 1;
        const baseFontSize = 10;
        const ZOOM_EXPONENT = -0.1;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5;

        // Parent-child ilişkisini kur
        const hierarchy = buildPipeHierarchy(pipes, components);

        pipes.forEach(pipe => {
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const length = Math.hypot(dx, dy);

            // Çok kısa borularda etiket gösterme
            if (length < 15) return;

            // Borunun ortası
            const midX = (pipe.p1.x + pipe.p2.x) / 2;
            const midY = (pipe.p1.y + pipe.p2.y) / 2;

            // Boru açısı
            const angle = Math.atan2(dy, dx);

            // Boru genişliği
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;
            const width = config.lineWidth;

            // Etiket offset (boruya temas etmeden)
            const offset = width / 2 - 10;

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

            // Parent-child etiketi oluştur
            const pipeData = hierarchy.get(pipe.id);
            if (pipeData) {
                const parent = pipeData.parent || '';
                const self = pipeData.label;
                const children = pipeData.children.length > 0 ? pipeData.children.join(',') : '';

                // Yazı pozisyonları hesapla
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Dark blue renk (parent ve children için)
                const darkBlue = '#00008B';

                const parentText = parent + ':';
                const parentWidth = ctx.measureText(parentText).width;

                // Self kısmını çiz (KIRMIZI)
                const selfText = self;
                const selfWidth = ctx.measureText(selfText).width;

                // Children kısmını çiz (dark blue)
                const childrenText = ':' + children;

                // Toplam genişlik
                const totalWidth = parentWidth + selfWidth + ctx.measureText(childrenText).width;
                const startX = -totalWidth / 2;

                // Parent (dark blue)
                ctx.fillStyle = darkBlue;
                ctx.textAlign = "left";
                ctx.fillText(parentText, startX, 0);

                // Self (KIRMIZI)
                ctx.fillStyle = '#ff0000'; // Kırmızı
                ctx.fillText(selfText, startX + parentWidth, 0);

                // Children (dark blue)
                ctx.fillStyle = darkBlue;
                ctx.fillText(childrenText, startX + parentWidth + selfWidth, 0);
            }

            ctx.restore();
        });
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

    drawWavyConnectionLine(ctx, connectionPoint, zoom, manager, targetPoint = null, deviceCenter = null, comp = null) {
        let closestPipeEnd = targetPoint;
        let pipeDirection = null;
        let colorGroup = 'YELLOW'; // Varsayılan renk grubu

        // ÖNCE: Eğer cihaz ve fleks bağlantısı varsa, O borunun rengini kullan!
        if (comp && comp.fleksBaglanti?.boruId) {
            const fleksBoru = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
            if (fleksBoru) {
                colorGroup = fleksBoru.colorGroup || 'YELLOW';
            }
        }

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


        ctx.restore();
    }

    /**
     * İç tesisat sayaç ekleme - kesikli boru preview
     * Sayaç ghost'u normal ghost rendering sistemi ile çiziliyor
     */
    drawMeterStartPipePreview(ctx, interactionManager) {
        const p1 = interactionManager.meterStartPoint;
        const p2 = interactionManager.meterPreviewEndPoint;

        if (!p1 || !p2) return;

        ctx.save();
        ctx.globalAlpha = 0.6;

        // Kesikli boru preview
        const colorGroup = 'YELLOW';
        const boruRenk = this.getRenkByGroup(colorGroup, 'boru', 1);

        ctx.strokeStyle = boruRenk;
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 2]); // 10 dolu, 2 boş

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.setLineDash([]); // Reset

        // Başlangıç noktasına yuvarlak
        ctx.fillStyle = boruRenk;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 2, 0, Math.PI * 2);
        ctx.fill();

        // Mesafe etiketi
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const text = `${distance.toFixed(0)} cm`;
        ctx.strokeText(text, midX, midY - 10);
        ctx.fillText(text, midX, midY - 10);

        ctx.restore();
    }

    /**
     * Seçili borunun yolunu sağ üstte gösterir
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawSelectedPipePath(ctx) {
        const path = window._selectedPipePath;
        if (!path || path.length === 0) return;

        // Yol metnini oluştur: "A , B , D"
        const pathText = path.join(' , ');

        ctx.save();

        // Canvas koordinatlarına dönüş (zoom/pan'den bağımsız)
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Sağ üst köşe pozisyonu
        const canvas = ctx.canvas;
        const padding = 20;
        const x = canvas.width - padding;
        const y = padding;

        // Font ayarları
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        // Kırmızı renk
        ctx.fillStyle = '#ff0000';
        ctx.fillText(pathText, x, y);

        ctx.restore();
    }


}