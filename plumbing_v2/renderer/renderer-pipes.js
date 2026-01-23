// plumbing_v2/renderer-pipes.js
// Boru çizim metodları

import { BORU_TIPLERI, getRenkGruplari } from '../objects/pipe.js';
import { SERVIS_KUTUSU_CONFIG } from '../objects/service-box.js';
import { SAYAC_CONFIG } from '../objects/meter.js';
import { CIHAZ_TIPLERI } from '../objects/device.js';
import { state, getDimensionPlumbingColor, isLightMode, getShadow, THEME_COLORS } from '../../general-files/main.js';
import { buildPipeHierarchy } from './renderer-utils.js';

// Seçili eleman rengi
const CUSTOM_COLORS = {
    SELECTED: '#808080' // 0.5 Derece Gri (Tüm seçili elemanlar için)
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

export const PipeMixin = {
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
    },

    drawShadows(ctx, manager) {
        const isLight = this.isLightMode();
        // Açık mod: Siyah transparan gölge
        // Koyu mod: Beyaz transparan iz (Zemin koyu olduğu için parlaklık veriyoruz)
        const shadowColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)';

        ctx.save();
        ctx.fillStyle = shadowColor;
        ctx.strokeStyle = shadowColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Boru Gölgeleri (Z=0, sadece X ve Y koordinatları)
        manager.pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;
            const zoom = state.zoom || 1;

            // Zoom'a göre kalınlık ayarı (drawPipes ile uyumlu)
            let width = config.lineWidth;
            if (zoom < 1) width = 4 / zoom;

            ctx.lineWidth = width;
            ctx.beginPath();
            // Borunun orijinal X,Y koordinatları zaten zemindedir (Z hariç)
            ctx.moveTo(pipe.p1.x, pipe.p1.y);
            ctx.lineTo(pipe.p2.x, pipe.p2.y);
            ctx.stroke();
        });

        // 2. Bileşen Gölgeleri
        manager.components.forEach(comp => {
            ctx.save();
            ctx.translate(comp.x, comp.y);
            if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

            if (comp.type === 'servis_kutusu') {
                const { width, height } = SERVIS_KUTUSU_CONFIG;
                ctx.fillRect(-width / 2, -height / 2, width, height);
            }
            else if (comp.type === 'sayac') {
                const { width, height } = comp.config || SAYAC_CONFIG;
                ctx.fillRect(-width / 2, -height / 2, width, height);
            }
            else if (comp.type === 'cihaz') {
                const config = CIHAZ_TIPLERI[comp.cihazTipi] || CIHAZ_TIPLERI.KOMBI;
                if (comp.cihazTipi === 'KOMBI') {
                    ctx.beginPath();
                    ctx.arc(0, 0, 20, 0, Math.PI * 2);
                    ctx.fill();
                } else if (comp.cihazTipi === 'OCAK') {
                    const boxSize = 15;
                    ctx.fillRect(-boxSize, -boxSize, boxSize * 2, boxSize * 2);
                } else {
                    ctx.fillRect(-config.width / 2, -config.height / 2, config.width, config.height);
                }
            }
            else if (comp.type === 'vana') {
                // Vana gölgesi (küçük daire)
                ctx.beginPath();
                ctx.arc(0, 0, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        });

        // 3. Baca Gölgeleri (Z=0 seviyesinde, zemin düzlemi)
        manager.components.filter(c => c.type === 'baca').forEach(baca => {
            if (baca.segments && baca.segments.length > 0) {
                ctx.lineWidth = 12; // Baca genişliği
                ctx.beginPath();
                baca.segments.forEach((seg, i) => {
                    // Gölgeler ALWAYS zemin seviyesinde (x, y), Z offset YOK
                    if (i === 0) ctx.moveTo(seg.x1, seg.y1);
                    ctx.lineTo(seg.x2, seg.y2);
                });
                ctx.stroke();
            }
        });

        ctx.restore();
    },

    drawPipeElevations(ctx, pipes) {

        if (!state.tempVisibility.showZElevation) return;
        // Sadece 3D görünümde çiz (t > 0.1)
        const t = state.viewBlendFactor || 0;
        if (t < 0.1) return;

        const isLightMode = this.isLightMode();
        ctx.font = '7px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = isLightMode ? '#000000' : '#FFFFFF';

        // Tekrarlanan noktaları önlemek için Set kullan
        const processedPoints = new Set();

        pipes.forEach(pipe => {
            if (!pipe.p1 || !pipe.p2) return;

            [pipe.p1, pipe.p2].forEach(point => {
                const z = point.z || 0;
                // Z değeri 0 ise gösterme (zemin kotu genelde kalabalık yapar)
                if (Math.abs(z) < 0.1) return;

                // Nokta anahtarı (x,y,z) - koordinatları yuvarlayarak karşılaştır
                const key = `${Math.round(point.x)},${Math.round(point.y)},${Math.round(z)}`;

                if (processedPoints.has(key)) return;
                processedPoints.add(key);

                // Ekran koordinatlarını hesapla (3D projection)
                // x' = x + z*t, y' = y - z*t
                const sx = point.x + (z * t);
                const sy = point.y - (z * t);

                ctx.fillText(`${Math.round(z)}`, sx-5, sy - 5);
            });
        });
    },

drawPipes(ctx, pipes) {
        if (!pipes) return;

        // Kırılım noktalarını hesapla
        const breakPoints = this.findBreakPoints(pipes);
        const t = state.viewBlendFactor || 0;

        // Mod durumunu al
        const isLight = isLightMode();

        pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;

            // --- 1. DÜŞEYLİK HESABI ---
            const rawZDiff = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));
            const rawDx = pipe.p2.x - pipe.p1.x;
            const rawDy = pipe.p2.y - pipe.p1.y;
            const rawLen2d = Math.hypot(rawDx, rawDy);

            let elevationAngle = 90;
            if (rawLen2d > 0.001) {
                elevationAngle = Math.atan2(rawZDiff, rawLen2d) * 180 / Math.PI;
            }
            const isVerticalPipe = rawZDiff > 0.1 && elevationAngle > 85;
            // ------------------------

            // Ekran koordinatlarını hesapla (3D/2D dönüşümü)
            const z1 = (pipe.p1.z || 0) * t;
            const z2 = (pipe.p2.z || 0) * t;
            const x1 = pipe.p1.x + z1;
            const y1 = pipe.p1.y - z1;
            const x2 = pipe.p2.x + z2;
            const y2 = pipe.p2.y - z2;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);

            // Zoom ayarı
            const zoom = state.zoom || 1;
            let width = config.lineWidth;
            if (zoom < 1) width = 4 / zoom;

            ctx.save();

            // Kesikli çizgi kontrolü
            if (pipe.lineStyle === 'dashed') {
                ctx.setLineDash([10, 2]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.translate(x1, y1);
            ctx.rotate(angle);

            // --- 2. GÖVDE ÇİZİMİ ---
            // Düşey boru seçili ise ve 2D modundaysak gövdeyi normal çiz (seçili çizme)
            const showBodySelection = pipe.isSelected && !(isVerticalPipe && t < 0.95);

            if (showBodySelection) {
                // SEÇİLİ GÖVDE (Yatay hatlar için)
                const secilenRenk = this.getSecilenRenk(pipe.colorGroup);
                const rgb = this.hexToRgb(secilenRenk);
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
                gradient.addColorStop(0.0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
                gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
                gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
                ctx.fillStyle = gradient;
                ctx.fillRect(0, -width / 2, length, width);
            } else {
                // NORMAL GÖVDE
                const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);

                // Düşey borular için yeşil renk grubu, diğerleri için normal renk grubu
                const colorGroup = isVerticalPipe ? 'GREEN' : (pipe.colorGroup || 'YELLOW');

                // Tüm borular için aynı gradient formatı
                gradient.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'boru', 0.5));
                gradient.addColorStop(0.45, this.getRenkByGroup(colorGroup, 'boru', 1.0)); // Highlight
                gradient.addColorStop(0.55, this.getRenkByGroup(colorGroup, 'boru', 1.0)); // Highlight
                gradient.addColorStop(1.0, this.getRenkByGroup(colorGroup, 'boru', 0.5));

                ctx.fillStyle = gradient;
                ctx.fillRect(0, -width / 2, length, width);
            }

            ctx.restore();

            // Temsili boru yuvarlağı
            if (pipe.isTemsiliBoru && pipe.lineStyle === 'dashed') {
                ctx.save();
                const colorGroup = pipe.colorGroup || 'YELLOW';
                // Temsili boruda standart renk kalsın veya isterseniz greenColor yapabilirsiniz
                const yuvarlatRenk = this.getRenkByGroup(colorGroup, 'boru', 1);
                ctx.fillStyle = yuvarlatRenk;
                ctx.beginPath();
                ctx.arc(pipe.p1.x, pipe.p1.y, width / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });

        // Ekstra çizimler
        this.drawElbows(ctx, pipes, breakPoints);
        this.drawPipeValves(ctx, pipes);

        // Seçili borular için yön görselleştirmesi (sınırlayıcı kutu/prizma) - ayara bağlı
        if (state.tempVisibility && state.tempVisibility.show3DPipeFrame) {
            this.drawPipeDirectionVisualization(ctx, pipes);
        }

        pipes.forEach(pipe => {
            if (pipe.isSelected) this.drawPipeEndpoints(ctx, pipe);
        });

        // --- 3. DÜŞEY HAT SEMBOLLERİ ---
        if (t < 0.99) {
            const symbolOpacity = 1 - t;

            pipes.forEach(pipe => {
                const rawZDiff = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));
                const rawDx = pipe.p2.x - pipe.p1.x;
                const rawDy = pipe.p2.y - pipe.p1.y;
                const rawLen2d = Math.hypot(rawDx, rawDy);

                let elevationAngle = 90;
                if (rawLen2d > 0.001) {
                    elevationAngle = Math.atan2(rawZDiff, rawLen2d) * 180 / Math.PI;
                }

                // DÜŞEY BORU SEMBOLÜ (Çember ve Oklar)
                if (rawZDiff > 0.1 && elevationAngle > 85) {
                    ctx.save();
                    ctx.globalAlpha = symbolOpacity;

                    // NORMAL BORU RENGİNİ KULLAN
                    const colorGroup = pipe.colorGroup || 'YELLOW';
                    const pipeColor = this.getRenkByGroup(colorGroup, 'boru', 1.0);

                    let circleFill, circleStroke, arrowColor;

                    if (pipe.isSelected) {
                        // SEÇİLİ: Turuncu dolgu
                        circleFill = '#FFA500';
                        if (isLight) {
                            circleStroke = '#000000';
                            arrowColor = '#000000';
                        } else {
                            circleStroke = '#FFFFFF';
                            arrowColor = '#FFFFFF';
                        }
                    } else {
                        // NORMAL: Gri dolgu, normal boru rengi kontur ve ok
                        circleFill = '#808080';
                        circleStroke = pipeColor;
                        arrowColor = pipeColor;
                    }

                    const zOffset = (pipe.p1.z || 0) * t;
                    const centerX = pipe.p1.x + zOffset;
                    const centerY = pipe.p1.y - zOffset

                    const circleRadius = 5;
                    const arrowLength = 12;

                    // Çember
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = circleFill;
                    ctx.fill();
                    ctx.strokeStyle = circleStroke;
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Oklar
                    ctx.fillStyle = arrowColor;
                    ctx.strokeStyle = arrowColor;
                    ctx.lineWidth = 2;

                    const zDiff = (pipe.p2.z || 0) - (pipe.p1.z || 0);
                    if (zDiff > 0) {
                        // YUKARI OK
                        const angle45 = Math.PI / 4;
                        const arrowStartX = centerX + circleRadius * Math.cos(angle45);
                        const arrowStartY = centerY - circleRadius * Math.sin(angle45);
                        const arrowTipX = centerX + (circleRadius + arrowLength) * Math.cos(angle45);
                        const arrowTipY = centerY - (circleRadius + arrowLength) * Math.sin(angle45);

                        ctx.beginPath();
                        ctx.moveTo(arrowStartX, arrowStartY);
                        ctx.lineTo(arrowTipX - 3 * Math.cos(angle45), arrowTipY + 3 * Math.sin(angle45));
                        ctx.stroke();

                        const arrowHeadSize = 5;
                        ctx.beginPath();
                        ctx.moveTo(arrowTipX, arrowTipY);
                        ctx.lineTo(
                            arrowTipX - arrowHeadSize * Math.cos(angle45 - Math.PI / 6),
                            arrowTipY + arrowHeadSize * Math.sin(angle45 - Math.PI / 6)
                        );
                        ctx.lineTo(
                            arrowTipX - arrowHeadSize * Math.cos(angle45 + Math.PI / 6),
                            arrowTipY + arrowHeadSize * Math.sin(angle45 + Math.PI / 6)
                        );
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        // AŞAĞI OK
                        const angle225 = 5 * Math.PI / 4;
                        const arrowHeadSize = 5;
                        const arrowStartX = centerX + (circleRadius + arrowLength) * Math.cos(angle225);
                        const arrowStartY = centerY - (circleRadius + arrowLength) * Math.sin(angle225);
                        const arrowTipX = centerX + circleRadius * Math.cos(angle225);
                        const arrowTipY = centerY - circleRadius * Math.sin(angle225);

                        ctx.beginPath();
                        ctx.moveTo(arrowStartX, arrowStartY);
                        ctx.lineTo(arrowTipX - 3 * Math.cos(angle225) + (circleRadius * Math.cos(angle225)), arrowTipY + 3 * Math.sin(angle225) - (circleRadius * Math.sin(angle225)));
                        ctx.stroke();

                        const reverseAngle = angle225 + Math.PI;
                        ctx.beginPath();
                        ctx.moveTo(arrowTipX, arrowTipY);
                        ctx.lineTo(
                            arrowTipX - arrowHeadSize * Math.cos(reverseAngle - Math.PI / 6),
                            arrowTipY + arrowHeadSize * Math.sin(reverseAngle - Math.PI / 6)
                        );
                        ctx.lineTo(
                            arrowTipX - arrowHeadSize * Math.cos(reverseAngle + Math.PI / 6),
                            arrowTipY + arrowHeadSize * Math.sin(reverseAngle + Math.PI / 6)
                        );
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.restore();
                }
                // EĞİMLİ BORU ETİKETİ
                else if (rawZDiff > 0.1 && elevationAngle < 85 && elevationAngle > 0.5) {
                    ctx.save();
                    ctx.globalAlpha = symbolOpacity;
                    const colorGroup = pipe.colorGroup || 'YELLOW';
                    const pipeColor = this.getRenkByGroup(colorGroup, 'boru', 1);

                    const midX = (pipe.p1.x + pipe.p2.x) / 2;
                    const midY = (pipe.p1.y + pipe.p2.y) / 2;
                    const midZ = ((pipe.p1.z || 0) + (pipe.p2.z || 0)) / 2;
                    const zOffset = midZ * t;
                    const centerX = midX + zOffset;
                    const centerY = midY - zOffset;

                    const isAscending = ((pipe.p2.z || 0) - (pipe.p1.z || 0)) > 0;
                    const arrowSymbol = isAscending ? '↗' : '↘';

                    ctx.font = '8px Arial';
                    ctx.fillStyle = pipeColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${arrowSymbol} ${Math.round(elevationAngle)}°`, centerX, centerY - 10);

                    ctx.restore();
                }
            });
        }
    },


    findBreakPoints(pipes) {
        const pointMap = new Map();
        const tolerance = 0.5;
        // viewBlendFactor ile smooth interpolasyon
        const t = state.viewBlendFactor || 0;

        pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;

            // Z değerlerini al (interpolasyon için t burada kullanılmayacak, çizimde kullanılacak)
            const rawZ1 = pipe.p1.z || 0;
            const rawZ2 = pipe.p2.z || 0;

            // Ekran izdüşüm koordinatlarını hesapla (Sadece açı hesabı için t kullanılıyor)
            const z1_interp = rawZ1 * t;
            const z2_interp = rawZ2 * t;

            // drawPipes ile TAM UYUMLU: x' = x + z*t, y' = y - z*t
            const tx1 = pipe.p1.x + z1_interp;
            const ty1 = pipe.p1.y - z1_interp;
            const tx2 = pipe.p2.x + z2_interp;
            const ty2 = pipe.p2.y - z2_interp;

            // Anahtar oluştururken HAM (RAW) koordinatları kullan
            // Böylece fiziksel olarak bağlı borular her zaman aynı grupta olur
            const key1 = `${Math.round(pipe.p1.x / tolerance) * tolerance},${Math.round(pipe.p1.y / tolerance) * tolerance},${Math.round(rawZ1 / tolerance) * tolerance}`;
            if (!pointMap.has(key1)) {
                pointMap.set(key1, {
                    x: pipe.p1.x,
                    y: pipe.p1.y,
                    z: rawZ1, // DÜZELTME: Ham Z değerini sakla
                    pipes: [],
                    directions: [],
                    diameters: []
                });
            }
            const entry1 = pointMap.get(key1);
            entry1.pipes.push(pipe);
            // Açıyı İZDÜŞÜM (transformed) koordinatlarına göre hesapla
            entry1.directions.push(Math.atan2(ty2 - ty1, tx2 - tx1));
            entry1.diameters.push(config.diameter);

            // p2 noktası için aynı işlemler
            const key2 = `${Math.round(pipe.p2.x / tolerance) * tolerance},${Math.round(pipe.p2.y / tolerance) * tolerance},${Math.round(rawZ2 / tolerance) * tolerance}`;
            if (!pointMap.has(key2)) {
                pointMap.set(key2, {
                    x: pipe.p2.x,
                    y: pipe.p2.y,
                    z: rawZ2, // DÜZELTME: Ham Z değerini sakla
                    pipes: [],
                    directions: [],
                    diameters: []
                });
            }
            const entry2 = pointMap.get(key2);
            entry2.pipes.push(pipe);
            // Açıyı İZDÜŞÜM koordinatlarına göre hesapla (p2'den p1'e)
            entry2.directions.push(Math.atan2(ty1 - ty2, tx1 - tx2));
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
    },

    drawElbows(ctx, pipes, breakPoints) {
        // viewBlendFactor ile smooth interpolasyon
        const t = state.viewBlendFactor || 0;

        breakPoints.forEach(bp => {
            const firstPipe = bp.pipes[0];

            // Birleşme noktasındaki borulardan en az birinin düşey olup olmadığını kontrol et
            let hasVerticalPipe = false;
            for (const pipe of bp.pipes) {
                const rawZDiff = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));
                const rawDx = pipe.p2.x - pipe.p1.x;
                const rawDy = pipe.p2.y - pipe.p1.y;
                const rawLen2d = Math.hypot(rawDx, rawDy);
                let elevationAngle = 90;
                if (rawLen2d > 0.001) {
                    elevationAngle = Math.atan2(rawZDiff, rawLen2d) * 180 / Math.PI;
                }
                if (rawZDiff > 0.1 && elevationAngle > 85) {
                    hasVerticalPipe = true;
                    break;
                }
            }

            // Düşey boru varsa yeşil, yoksa normal renk grubu
            const colorGroup = hasVerticalPipe ? 'GREEN' : (firstPipe?.colorGroup || 'YELLOW');

            // Dirseğin çizileceği MERKEZİ hesapla (Z'yi t ile interpolate et)
            const z = (bp.z || 0) * t;
            const cx = bp.x + z; // X'e Z ekle
            const cy = bp.y - z; // Y'den Z çıkar

            // En büyük genişliği bul (merkez daire için)
            let maxArmWidth = 0;
            const armLength = 3;      // 3 cm kol uzunluğu
            const armExtraWidth = 1;  // Sağdan soldan 1 cm fazla

            const dm = bp.diameters[1] + armExtraWidth * 2;

            // Merkez daireyi çiz (Hesaplanan cx, cy'de)
            const adjustedGrayx = ctx.createRadialGradient(cx, cy, dm / 4, cx, cy, dm / 2);
            adjustedGrayx.addColorStop(0, this.getRenkByGroup(colorGroup, 'dirsek', 1));
            adjustedGrayx.addColorStop(0.2, this.getRenkByGroup(colorGroup, 'dirsek', 1));
            adjustedGrayx.addColorStop(1, this.getRenkByGroup(colorGroup, 'dirsek', 0.8));
            ctx.fillStyle = adjustedGrayx;
            ctx.beginPath();
            ctx.arc(cx, cy, dm / 2, 0, Math.PI * 2);
            ctx.fill();

            // Her yön için dirsek kolu çiz
            for (let i = 0; i < bp.directions.length; i++) {
                const angle = bp.directions[i];
                const diameter = bp.diameters[i];

                const armWidth = diameter + armExtraWidth * 2;
                if (armWidth > maxArmWidth) maxArmWidth = armWidth;

                ctx.save();
                // Translate'i cx, cy'ye yap (dönüşüm uygulanmış merkez)
                ctx.translate(cx, cy);
                ctx.rotate(angle);

                const gradientdar = ctx.createLinearGradient(0, -armWidth / 2, 0, armWidth / 2);
                gradientdar.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'dirsek', 0.6));
                gradientdar.addColorStop(0.2, this.getRenkByGroup(colorGroup, 'dirsek', 1));
                gradientdar.addColorStop(0.6, this.getRenkByGroup(colorGroup, 'dirsek', 1));
                gradientdar.addColorStop(1, this.getRenkByGroup(colorGroup, 'dirsek', 0.6));

                // Kolu çiz
                ctx.fillStyle = gradientdar;
                ctx.fillRect(0, -armWidth / 2, armLength, armWidth);

                const gradientgenis = ctx.createLinearGradient(0, -armWidth / 2, 0, armWidth / 2);
                gradientgenis.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'dirsek', 0.8));
                gradientgenis.addColorStop(0.5, this.getRenkByGroup(colorGroup, 'dirsek', 1));
                gradientgenis.addColorStop(1, this.getRenkByGroup(colorGroup, 'dirsek', 0.8));

                // Uç kalınlık
                ctx.fillStyle = gradientgenis;
                const lineWidth = armWidth + 0.4;
                const lineThickness = 1.5;
                ctx.fillRect(armLength - 0.2, -lineWidth / 2, lineThickness, lineWidth);

                ctx.restore();
            }
        });
    },

    drawPipeEndpoints(ctx, pipe) {
        // Uç noktaları küçük belirgin noktalar (seçili borular için)
        const r = 1.6; // Küçük
        const themeColors = this.isLightMode() ? THEME_COLORS.light : THEME_COLORS.dark;

        // Z koordinatlarını al ve viewBlendFactor ile interpolate et
        const t = state.viewBlendFactor || 0;
        const z1 = (pipe.p1.z || 0) * t;
        const z2 = (pipe.p2.z || 0) * t;

        // Koordinatları hesapla (Z smooth interpolasyonla)
        const x1 = pipe.p1.x + z1;
        const y1 = pipe.p1.y - z1;
        const x2 = pipe.p2.x + z2;
        const y2 = pipe.p2.y - z2;

        // p1 noktası
        ctx.fillStyle = themeColors.pipeEndpoint;
        ctx.strokeStyle = themeColors.pipeEndpointStroke;

        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x1, y1, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // p2 noktası
        ctx.beginPath();
        ctx.arc(x2, y2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    },

    drawPipeValves(ctx, pipes) {
        if (!pipes) return;

        // viewBlendFactor için
        const t = state.viewBlendFactor || 0;

        pipes.forEach(pipe => {
            if (!pipe.vana) return;

            // --- DÜZELTME: Düşey borudaki vanayı 2D'de gizle ---
            if (t < 0.1) {
                const dx = pipe.p2.x - pipe.p1.x;
                const dy = pipe.p2.y - pipe.p1.y;
                const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
                const len2d = Math.hypot(dx, dy);
                // Düşey boru kriteri: 2D uzunluk < 2cm veya Z farkı 2D boydan büyük
                if (len2d < 2.0 || Math.abs(dz) > len2d) {
                    return;
                }
            }
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
    },

    drawGeciciBoruShadow(ctx, geciciBoru) {
        // Geçici borunun gölgesini çiz (zemin seviyesinde)
        const isLight = this.isLightMode();
        const shadowColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)';

        ctx.save();
        ctx.strokeStyle = shadowColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Zoom'a göre kalınlık ayarı
        const zoom = state.zoom || 1;
        let width = 4;
        if (zoom < 1) {
            width = 4 / zoom;
        }

        ctx.lineWidth = width;
        ctx.beginPath();
        // Gölge zemin seviyesinde (sadece X, Y koordinatları)
        ctx.moveTo(geciciBoru.p1.x, geciciBoru.p1.y);
        ctx.lineTo(geciciBoru.p2.x, geciciBoru.p2.y);
        ctx.stroke();

        ctx.restore();
    },

    drawGeciciBoru(ctx, geciciBoru, colorGroup = 'YELLOW') {
        ctx.save();

        // Geçici boru için de aynı stil ve zoom kompenzasyonu
        const zoom = state.zoom || 1;
        const zoomCompensation = Math.pow(zoom, 0.6);
        let width = 4;
        if (zoom < 1) {
            width = 4 / zoom;
        }

        // Z koordinatlarını al ve viewBlendFactor ile interpolate et
        const t = state.viewBlendFactor || 0;
        const z1 = (geciciBoru.p1.z || 0) * t;
        const z2 = (geciciBoru.p2.z || 0) * t;

        // Koordinatları hesapla (Z smooth interpolasyonla)
        const x1 = geciciBoru.p1.x + z1;
        const y1 = geciciBoru.p1.y - z1;
        const x2 = geciciBoru.p2.x + z2;
        const y2 = geciciBoru.p2.y - z2;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);



        ctx.translate(x1, y1);
        ctx.rotate(angle);

        // Renk grubuna göre gradient oluştur
        const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
        gradient.addColorStop(0.0, this.getRenkByGroup(colorGroup, 'boru', 0.3));
        gradient.addColorStop(0.5, this.getRenkByGroup(colorGroup, 'boru', 1));
        gradient.addColorStop(1, this.getRenkByGroup(colorGroup, 'boru', 0.3));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, -width / 2, length, width);

        ctx.restore();
    },

    drawPipeMeasurements(ctx, pipes) {
        if (!pipes) return;

        const zoom = state.zoom || 1;
        const baseFontSize = 10;
        const ZOOM_EXPONENT = -0.1;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5;

        // 3D faktörü (Z izdüşümü için)
        const t = state.viewBlendFactor || 0;

        pipes.forEach(pipe => {
            // 1. Gerçek 3D Uzunluk Hesapla (Z dahil)
            const dxWorld = pipe.p2.x - pipe.p1.x;
            const dyWorld = pipe.p2.y - pipe.p1.y;
            const dzWorld = (pipe.p2.z || 0) - (pipe.p1.z || 0);
            const length3D = Math.hypot(dxWorld, dyWorld, dzWorld);

            // Çok kısa borularda ölçü gösterme (15 cm altı)
            if (length3D < 15) return;

            // 2. Ekran Koordinatlarını Hesapla (İzdüşüm)
            // x' = x + z*t, y' = y - z*t
            const z1 = (pipe.p1.z || 0) * t;
            const z2 = (pipe.p2.z || 0) * t;

            const sx1 = pipe.p1.x + z1;
            const sy1 = pipe.p1.y - z1;
            const sx2 = pipe.p2.x + z2;
            const sy2 = pipe.p2.y - z2;

            // Ekran üzerindeki orta nokta
            const midX = (sx1 + sx2) / 2;
            const midY = (sy1 + sy2) / 2;

            // Boru açısı (Ekran üzerindeki görsel açı)
            const sdx = sx2 - sx1;
            const sdy = sy2 - sy1;
            const angle = Math.atan2(sdy, sdx);

            // Boru genişliği
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;
            const width = config.lineWidth;

            // Ölçü offset (boruya temas etmeden, en yakınına)
            const offset = width / 2 + 10; // 1cm margin

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
            const roundedLength = Math.round(length3D);
            const displayText = roundedLength.toString();

            // Yazıyı çiz - THEME_COLORS'dan al
            const plumbingDimensionColor = getDimensionPlumbingColor();
            ctx.fillStyle = plumbingDimensionColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(displayText, 0, 0);

            ctx.restore();
        });
    },

    drawTempPipeMeasurement(ctx, geciciBoru) {
        if (!geciciBoru) return;

        const zoom = state.zoom || 1;
        const baseFontSize = 10;
        const ZOOM_EXPONENT = -0.1;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5;

        // 3D faktörü
        const t = state.viewBlendFactor || 0;

        // 3D uzunluk hesapla
        const dxWorld = geciciBoru.p2.x - geciciBoru.p1.x;
        const dyWorld = geciciBoru.p2.y - geciciBoru.p1.y;
        const dzWorld = (geciciBoru.p2.z || 0) - (geciciBoru.p1.z || 0);
        const length3D = Math.hypot(dxWorld, dyWorld, dzWorld);

        if (length3D < 1) return;

        // Ekran koordinatlarını hesapla (İzdüşüm)
        const z1 = (geciciBoru.p1.z || 0) * t;
        const z2 = (geciciBoru.p2.z || 0) * t;

        const sx1 = geciciBoru.p1.x + z1;
        const sy1 = geciciBoru.p1.y - z1;
        const sx2 = geciciBoru.p2.x + z2;
        const sy2 = geciciBoru.p2.y - z2;

        // Borunun ortası (Ekran)
        const midX = (sx1 + sx2) / 2;
        const midY = (sy1 + sy2) / 2;

        // Boru açısı (Ekran)
        const sdx = sx2 - sx1;
        const sdy = sy2 - sy1;
        const angle = Math.atan2(sdy, sdx);

        // Ölçü offset
        const width = 4; // geçici boru genişliği
        const offset = width / 2 + 10;

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
        const roundedLength = Math.round(length3D);
        const displayText = roundedLength.toString();

        // Yazıyı çiz
        const plumbingDimensionColor = getDimensionPlumbingColor();
        ctx.fillStyle = plumbingDimensionColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, 0, 0);

        ctx.restore();
    },

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

        // 3D faktörü (Z izdüşümü için)
        const t = state.viewBlendFactor || 0;

        // Parent-child ilişkisini kur
        const hierarchy = buildPipeHierarchy(pipes, components);

        pipes.forEach(pipe => {
            // 3D Uzunluk Hesapla (Z dahil)
            const dxWorld = pipe.p2.x - pipe.p1.x;
            const dyWorld = pipe.p2.y - pipe.p1.y;
            const dzWorld = (pipe.p2.z || 0) - (pipe.p1.z || 0);
            const length3D = Math.hypot(dxWorld, dyWorld, dzWorld);

            // Çok kısa borularda etiket gösterme
            if (length3D < 15) return;

            // Ekran Koordinatlarını Hesapla (3D İzdüşüm)
            // x' = x + z*t, y' = y - z*t
            const z1 = (pipe.p1.z || 0) * t;
            const z2 = (pipe.p2.z || 0) * t;

            const sx1 = pipe.p1.x + z1;
            const sy1 = pipe.p1.y - z1;
            const sx2 = pipe.p2.x + z2;
            const sy2 = pipe.p2.y - z2;

            // Ekran üzerindeki orta nokta
            const midX = (sx1 + sx2) / 2;
            const midY = (sy1 + sy2) / 2;

            // Boru açısı (Ekran üzerindeki görsel açı)
            const sdx = sx2 - sx1;
            const sdy = sy2 - sy1;
            const angle = Math.atan2(sdy, sdx);

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
                const darkBlue = '#2b97df';
                const darkgreen = '#008b0c';

                const parentText = parent + '';
                const parentWidth = ctx.measureText(parentText).width;

                // Self kısmını çiz (KIRMIZI)
                const selfText = self;
                const selfWidth = ctx.measureText(selfText).width;

                // Children kısmını çiz (dark blue)
                const childrenText = '' + children;

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
                ctx.fillStyle = darkgreen;
                ctx.fillText(childrenText, startX + parentWidth + selfWidth, 0);
            }

            ctx.restore();
        });
    },

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
    },

    /**
     * Borunun kaç boyutlu olduğunu ve hangi eksenlerde hareket ettiğini hesaplar
     * @param {Object} pipe - Boru objesi (p1, p2 noktaları ile)
     * @returns {Object} Boyut bilgisi ve eksen değişimleri
     */
    getPipeDimensionality(pipe) {
        const threshold = 0.1; // Minimum değişim eşiği (cm cinsinden)

        const dx = Math.abs(pipe.p2.x - pipe.p1.x);
        const dy = Math.abs(pipe.p2.y - pipe.p1.y);
        const dz = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));

        const changesX = dx > threshold;
        const changesY = dy > threshold;
        const changesZ = dz > threshold;

        const dimensionality = (changesX ? 1 : 0) + (changesY ? 1 : 0) + (changesZ ? 1 : 0);

        return {
            dimensionality,
            changesX,
            changesY,
            changesZ,
            dx,
            dy,
            dz
        };
    },

    /**
     * 2D borular için sınırlayıcı dikdörtgen çizer (doğru düzlemde, kesikli çizgilerle)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} pipe - Boru objesi
     * @param {Object} dimInfo - Boyut bilgisi
     */
    draw2DBoundingBox(ctx, pipe, dimInfo) {
        const t = state.viewBlendFactor || 0;
        const zoom = state.zoom || 1;
        const isLight = this.isLightMode();
        const padding = 5;

        // Dünya koordinatlarında min/max değerler
        const minX = Math.min(pipe.p1.x, pipe.p2.x);
        const maxX = Math.max(pipe.p1.x, pipe.p2.x);
        const minY = Math.min(pipe.p1.y, pipe.p2.y);
        const maxY = Math.max(pipe.p1.y, pipe.p2.y);
        const minZ = Math.min(pipe.p1.z || 0, pipe.p2.z || 0);
        const maxZ = Math.max(pipe.p1.z || 0, pipe.p2.z || 0);

        let corners3D = [];
        let labels = []; // Kenar etiketleri için

        // Hangi düzlemde olduğunu belirle ve köşeleri oluştur
        if (dimInfo.changesX && dimInfo.changesY && !dimInfo.changesZ) {
            // X-Y düzlemi (Z sabit)
            const z = (pipe.p1.z || 0);
            corners3D = [
                { x: minX - padding, y: minY - padding, z },
                { x: maxX + padding, y: minY - padding, z },
                { x: maxX + padding, y: maxY + padding, z },
                { x: minX - padding, y: maxY + padding, z }
            ];
            labels = [
                { text: `${Math.round(dimInfo.dx)}`, mid: { x: (minX + maxX) / 2, y: minY - padding, z }, axis: 'x' },
                { text: `${Math.round(dimInfo.dy)}`, mid: { x: maxX + padding, y: (minY + maxY) / 2, z }, axis: 'y' }
            ];
        } else if (dimInfo.changesX && !dimInfo.changesY && dimInfo.changesZ) {
            // X-Z düzlemi (Y sabit)
            const y = pipe.p1.y;
            corners3D = [
                { x: minX - padding, y, z: minZ },
                { x: maxX + padding, y, z: minZ },
                { x: maxX + padding, y, z: maxZ },
                { x: minX - padding, y, z: maxZ }
            ];
            labels = [
                { text: `${Math.round(dimInfo.dx)}`, mid: { x: (minX + maxX) / 2, y, z: minZ }, axis: 'x' },
                { text: `${Math.round(dimInfo.dz)}`, mid: { x: maxX + padding, y, z: (minZ + maxZ) / 2 }, axis: 'z' }
            ];
        } else if (!dimInfo.changesX && dimInfo.changesY && dimInfo.changesZ) {
            // Y-Z düzlemi (X sabit)
            const x = pipe.p1.x;
            corners3D = [
                { x, y: minY - padding, z: minZ },
                { x, y: maxY + padding, z: minZ },
                { x, y: maxY + padding, z: maxZ },
                { x, y: minY - padding, z: maxZ }
            ];
            labels = [
                { text: `${Math.round(dimInfo.dy)}`, mid: { x, y: (minY + maxY) / 2, z: minZ }, axis: 'y' },
                { text: `${Math.round(dimInfo.dz)}`, mid: { x, y: maxY + padding, z: (minZ + maxZ) / 2 }, axis: 'z' }
            ];
        }

        // Köşeleri ekran koordinatlarına dönüştür
        const corners2D = corners3D.map(corner => {
            const zOffset = corner.z * t;
            return {
                x: corner.x + zOffset,
                y: corner.y - zOffset
            };
        });

        ctx.save();
        ctx.strokeStyle = isLight ? 'rgba(100, 149, 237, 0.6)' : 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([8 / zoom, 4 / zoom]);

        // Dikdörtgeni çiz
        ctx.beginPath();
        ctx.moveTo(corners2D[0].x, corners2D[0].y);
        ctx.lineTo(corners2D[1].x, corners2D[1].y);
        ctx.lineTo(corners2D[2].x, corners2D[2].y);
        ctx.lineTo(corners2D[3].x, corners2D[3].y);
        ctx.closePath();
        ctx.stroke();

        // Uzunluk etiketlerini çiz
        ctx.setLineDash([]);
        ctx.fillStyle = isLight ? 'rgba(100, 149, 237, 1)' : 'rgba(100, 200, 255, 1)';
        ctx.font = `bold ${10 / zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        labels.forEach(label => {
            const zOffset = label.mid.z * t;
            const sx = label.mid.x + zOffset;
            const sy = label.mid.y - zOffset;

            // Arka plan kutusu
            const textWidth = ctx.measureText(label.text).width;
            ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(sx - textWidth / 2 - 2 / zoom, sy - 6 / zoom, textWidth + 4 / zoom, 12 / zoom);

            // Yazıyı çiz
            ctx.fillStyle = isLight ? 'rgba(100, 149, 237, 1)' : 'rgba(100, 200, 255, 1)';
            ctx.fillText(label.text, sx, sy);
        });

        ctx.restore();
    },

    /**
     * 3D borular için dikdörtgen prizma çizer (kesikli çizgilerle + uzunluk etiketleri)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} pipe - Boru objesi
     * @param {Object} dimInfo - Boyut bilgisi
     */
    draw3DBoundingPrism(ctx, pipe, dimInfo) {
        const t = state.viewBlendFactor || 0;
        const zoom = state.zoom || 1;
        const isLight = this.isLightMode();

        // Dünya koordinatlarında sınırlayıcı kutuyu hesapla
        const minX = Math.min(pipe.p1.x, pipe.p2.x);
        const maxX = Math.max(pipe.p1.x, pipe.p2.x);
        const minY = Math.min(pipe.p1.y, pipe.p2.y);
        const maxY = Math.max(pipe.p1.y, pipe.p2.y);
        const minZ = Math.min(pipe.p1.z || 0, pipe.p2.z || 0);
        const maxZ = Math.max(pipe.p1.z || 0, pipe.p2.z || 0);

        // Biraz kenar boşluğu ekle
        const padding = 5;

        // 8 köşe noktası (dünya koordinatları)
        const corners3D = [
            { x: minX - padding, y: minY - padding, z: minZ }, // 0
            { x: maxX + padding, y: minY - padding, z: minZ }, // 1
            { x: maxX + padding, y: maxY + padding, z: minZ }, // 2
            { x: minX - padding, y: maxY + padding, z: minZ }, // 3
            { x: minX - padding, y: minY - padding, z: maxZ }, // 4
            { x: maxX + padding, y: minY - padding, z: maxZ }, // 5
            { x: maxX + padding, y: maxY + padding, z: maxZ }, // 6
            { x: minX - padding, y: maxY + padding, z: maxZ }  // 7
        ];

        // Köşeleri ekran koordinatlarına dönüştür
        const corners2D = corners3D.map(corner => {
            const zOffset = corner.z * t;
            return {
                x: corner.x + zOffset,
                y: corner.y - zOffset
            };
        });

        ctx.save();
        ctx.strokeStyle = isLight ? 'rgba(100, 149, 237, 0.6)' : 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([8 / zoom, 4 / zoom]);

        // Alt yüz (z=minZ)
        ctx.beginPath();
        ctx.moveTo(corners2D[0].x, corners2D[0].y);
        ctx.lineTo(corners2D[1].x, corners2D[1].y);
        ctx.lineTo(corners2D[2].x, corners2D[2].y);
        ctx.lineTo(corners2D[3].x, corners2D[3].y);
        ctx.closePath();
        ctx.stroke();

        // Üst yüz (z=maxZ)
        ctx.beginPath();
        ctx.moveTo(corners2D[4].x, corners2D[4].y);
        ctx.lineTo(corners2D[5].x, corners2D[5].y);
        ctx.lineTo(corners2D[6].x, corners2D[6].y);
        ctx.lineTo(corners2D[7].x, corners2D[7].y);
        ctx.closePath();
        ctx.stroke();

        // Dikey kenarlar (alt ve üst yüzü birleştiren)
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(corners2D[i].x, corners2D[i].y);
            ctx.lineTo(corners2D[i + 4].x, corners2D[i + 4].y);
            ctx.stroke();
        }

        // Uzunluk etiketlerini çiz
        ctx.setLineDash([]);
        ctx.font = `bold ${10 / zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const labels = [
            // X ekseni (alt yüz, ön kenar)
            {
                text: `${Math.round(dimInfo.dx)}`,
                mid: {
                    x: (minX + maxX) / 2,
                    y: minY - padding,
                    z: minZ
                }
            },
            // Y ekseni (alt yüz, sağ kenar)
            {
                text: `${Math.round(dimInfo.dy)}`,
                mid: {
                    x: maxX + padding,
                    y: (minY + maxY) / 2,
                    z: minZ
                }
            },
            // Z ekseni (ön-sol dikey kenar)
            {
                text: `${Math.round(dimInfo.dz)}`,
                mid: {
                    x: minX - padding,
                    y: minY - padding,
                    z: (minZ + maxZ) / 2
                }
            }
        ];

        labels.forEach(label => {
            const zOffset = label.mid.z * t;
            const sx = label.mid.x + zOffset;
            const sy = label.mid.y - zOffset;

            // Arka plan kutusu
            const textWidth = ctx.measureText(label.text).width;
            ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(sx - textWidth / 2 - 2 / zoom, sy - 6 / zoom, textWidth + 4 / zoom, 12 / zoom);

            // Yazıyı çiz
            ctx.fillStyle = isLight ? 'rgba(100, 149, 237, 1)' : 'rgba(100, 200, 255, 1)';
            ctx.fillText(label.text, sx, sy);
        });

        ctx.restore();
    },

    /**
     * Seçili borular için yön görselleştirmesi çizer
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} pipes - Boru dizisi
     */
    drawPipeDirectionVisualization(ctx, pipes) {
        if (!pipes) return;

        pipes.forEach(pipe => {
            // Sadece seçili borular için çiz
            if (!pipe.isSelected) return;

            const dimInfo = this.getPipeDimensionality(pipe);

            // 1D borular için görselleştirme yapma
            if (dimInfo.dimensionality === 1) return;

            // 2D borular için dikdörtgen çiz (doğru düzlemde)
            if (dimInfo.dimensionality === 2) {
                this.draw2DBoundingBox(ctx, pipe, dimInfo);
            }
            // 3D borular için prizma çiz
            else if (dimInfo.dimensionality === 3) {
                this.draw3DBoundingPrism(ctx, pipe, dimInfo);
            }
        });
    }
};
