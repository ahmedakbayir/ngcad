// plumbing_v2/renderer-devices.js
// Cihaz çizim metodları (Kombi, Ocak, Baca, vs.)

import { CIHAZ_TIPLERI, FLEKS_CONFIG } from './objects/device.js';
import { getRenkGruplari } from './objects/pipe.js';
import { getAdjustedColor, state, isLightMode, getShadow } from '../general-files/main.js';

// Seçili eleman rengi ve cihaz renkleri
const CUSTOM_COLORS = {
    SELECTED: '#808080', // 0.5 Derece Gri (Tüm seçili elemanlar için)
    DEVICE_BLUE: { // Ocak/Kombi - Mavi Yoğunluklu
        light: { 0: '#E3F2FD', 0.3: '#90CAF9', 0.6: '#42A5F5', 1: '#1565C0' },
        dark: { 0: '#E3F2FD', 0.3: '#64B5F6', 0.6: '#1E88E5', 1: '#0D47A1' }
    }
};

export const DeviceMixin = {
    getRenkByGroup(colorGroup, tip, opacity) {
        const renkGruplari = getRenkGruplari(); // Dinamik olarak temaya göre al
        const group = renkGruplari[colorGroup] || renkGruplari.YELLOW;
        const template = group[tip];

        if (template.includes('{opacity}')) {
            return template.replace('{opacity}', opacity);
        }
        return template;
    },

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
    },

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
    },
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
    },

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

        // 3D faktörü
        const t = state.viewBlendFactor || 0;

        ctx.save();

        // Bağlı cihazı bul (clipping için)
        const parentCihaz = manager.components.find(c => c.id === baca.parentCihazId && c.type === 'cihaz');

        // Round join ile yumuşak köşeler
        ctx.lineWidth = BACA_CONFIG.genislik;
        ctx.lineJoin = 'round';  // Yuvarlatılmış köşeler
        ctx.lineCap = 'round';   // Yuvarlatılmış uçlar

        // Gradient helper - her segment için perpendicular gradient (3D koordinatlarla)
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

        // 1. Her segment için ayrı gradient ile çiz (3D izdüşüm ile)
        baca.segments.forEach((segment, index) => {
            ctx.beginPath();

            // 3D izdüşüm hesapla
            const z1 = segment.z1 || baca.z || 0;
            const z2 = segment.z2 || baca.z || 0;

            let screenX1 = segment.x1 + (z1 * t);
            let screenY1 = segment.y1 - (z1 * t);
            const screenX2 = segment.x2 + (z2 * t);
            const screenY2 = segment.y2 - (z2 * t);

            // Başlangıç noktası (clipping hesabı ile) - 3D koordinatlarda
            if (index === 0 && parentCihaz) {
                const cihazZ = parentCihaz.z || 0;
                const cihazScreenX = parentCihaz.x + (cihazZ * t);
                const cihazScreenY = parentCihaz.y - (cihazZ * t);
                const cihazRadius = Math.max(parentCihaz.config.width, parentCihaz.config.height) / 2;
                const distFromCenter = Math.hypot(screenX1 - cihazScreenX, screenY1 - cihazScreenY);

                if (distFromCenter < cihazRadius) {
                    const dx = screenX2 - screenX1;
                    const dy = screenY2 - screenY1;
                    const angle = Math.atan2(dy, dx);
                    const startOffset = cihazRadius - distFromCenter;
                    screenX1 = screenX1 + Math.cos(angle) * startOffset;
                    screenY1 = screenY1 + Math.sin(angle) * startOffset;
                }
            }

            ctx.moveTo(screenX1, screenY1);
            ctx.lineTo(screenX2, screenY2);

            // Gradient uygula (ekran koordinatlarıyla)
            const gradient = createSegmentGradient(
                { x2: screenX2, y2: screenY2 },
                screenX1,
                screenY1
            );
            ctx.strokeStyle = gradient;
            ctx.stroke();
        });

        // 2. Köşeleri arc ile doldur - radial gradient (3D izdüşüm ile)
        const cornerRadius = BACA_CONFIG.genislik / 2;
        for (let i = 0; i < baca.segments.length - 1; i++) {
            const seg1 = baca.segments[i];
            const seg2 = baca.segments[i + 1];

            // Köşe noktası (segmentlerin birleştiği nokta) - 3D izdüşüm
            const cornerZ = seg1.z2 || baca.z || 0;
            const cornerX = seg1.x2 + (cornerZ * t);
            const cornerY = seg1.y2 - (cornerZ * t);

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

        // Havalandırma ızgarası (ESC basılınca) - BACANIN DIŞINDA (3D izdüşüm ile)
        if (baca.havalandirma && baca.segments.length > 0) {
            const lastSegment = baca.segments[baca.segments.length - 1];

            // 3D izdüşüm hesapla
            const lastZ1 = lastSegment.z1 || baca.z || 0;
            const lastZ2 = lastSegment.z2 || baca.z || 0;
            const screenLastX1 = lastSegment.x1 + (lastZ1 * t);
            const screenLastY1 = lastSegment.y1 - (lastZ1 * t);
            const screenLastX2 = lastSegment.x2 + (lastZ2 * t);
            const screenLastY2 = lastSegment.y2 - (lastZ2 * t);

            const dx = screenLastX2 - screenLastX1;
            const dy = screenLastY2 - screenLastY1;
            const segmentAngle = Math.atan2(dy, dx);

            // Izgara pozisyonu: son segment ucundan offset kadar ötede
            const offsetDistance = BACA_CONFIG.genislik / 2 + BACA_CONFIG.havalandirmaOffset;
            const izgaraX = screenLastX2 + Math.cos(segmentAngle) * offsetDistance;
            const izgaraY = screenLastY2 + Math.sin(segmentAngle) * offsetDistance;

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
    },

    hexToRgba(hex, alpha) {
        const hexStr = hex.toString(16).padStart(6, '0');
        const r = parseInt(hexStr.substring(0, 2), 16);
        const g = parseInt(hexStr.substring(2, 4), 16);
        const b = parseInt(hexStr.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

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
};
