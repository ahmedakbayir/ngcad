// plumbing_v2/renderer-previews.js
// Preview ve ghost çizim metodları

import { getRenkGruplari } from '../objects/pipe.js';
import { state, getAdjustedColor } from '../../general-files/main.js';

export const PreviewMixin = {
    getRenkByGroup(colorGroup, tip, opacity) {
        const renkGruplari = getRenkGruplari(); // Dinamik olarak temaya göre al
        const group = renkGruplari[colorGroup] || renkGruplari.YELLOW;
        const template = group[tip];

        if (template.includes('{opacity}')) {
            return template.replace('{opacity}', opacity);
        }
        return template;
    },

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
    },

    drawPipeSplitPreview(ctx, preview) {
        if (!preview || !preview.point) return;

        const { point, isEndpoint } = preview;
        const zoom = state.zoom || 1;

        const z = point.z || 0;
        const t = state.viewBlendFactor || 0;
        const screenX = point.x + (z * t);
        const screenY = point.y - (z * t);

        ctx.save();
        ctx.translate(screenX, screenY);

        if (isEndpoint) {
            // UÇ NOKTA / KÖŞE: Daha koyu mavi ve KARE
            const size = 8 / zoom;
            ctx.fillStyle = '#1a73e8'; // Koyu mavi
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3 / zoom;

            ctx.beginPath();
            ctx.rect(-size / 2, -size / 2, size, size);
            ctx.fill();
            ctx.stroke();

            // Dış çerçeve efekti
            ctx.strokeStyle = 'rgba(26, 115, 232, 0.4)';
            ctx.lineWidth = 3 / zoom;
            ctx.beginPath();
            ctx.rect(-(size + 4) / 2, -(size + 4) / 2, size + 4, size + 4);
            ctx.stroke();
        } else {
            // HAT ÜZERİ: Mevcut açık mavi yuvarlak
            ctx.fillStyle = 'rgba(0, 150, 255, 0.8)';
            ctx.strokeStyle = '#5a5858';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(0, 0, 4 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // İç nokta
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, 3 / zoom, 0, Math.PI * 2);
            ctx.fill();

            // Dış pulse efekti
            ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
            ctx.lineWidth = 1.5 / zoom;
            ctx.beginPath();
            ctx.arc(0, 0, 7 / zoom, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    },

    /**
     * Hat ucu / kesişim hover göstergesi.
     * Vana veya başka komponent uçta olsa bile, fare uca yaklaşınca
     * yeşil halka çizilir — kullanıcıya "buradan seçebilirsin" sinyali.
     */
    drawPipeEndpointHover(ctx, hover) {
        if (!hover || !hover.nokta) return;
        const zoom = state.zoom || 1;
        const t = state.viewBlendFactor || 0;
        const z = hover.nokta.z || 0;
        const screenX = hover.nokta.x + (z * t);
        const screenY = hover.nokta.y - (z * t);

        ctx.save();
        ctx.translate(screenX, screenY);

        const r = 11 / zoom;

        // 1) En dış soluk pulse halkası
        ctx.strokeStyle = 'rgba(68, 255, 136, 0.35)';
        ctx.lineWidth = 3 / zoom;
        ctx.beginPath();
        ctx.arc(0, 0, r + 7 / zoom, 0, Math.PI * 2);
        ctx.stroke();

        // 2) Beyaz kontur (kontrast — koyu zeminde de görünür)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 5 / zoom;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // 3) Ana parlak yeşil halka
        ctx.strokeStyle = '#22FF66';
        ctx.lineWidth = 3 / zoom;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // 4) İç beyaz halka
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();

        // 5) Merkez yeşil dolu nokta
        ctx.fillStyle = '#22FF66';
        ctx.beginPath();
        ctx.arc(0, 0, 3 / zoom, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    },

    drawVanaPreview(ctx, vanaPreview) {
        if (!vanaPreview || !vanaPreview.pipe || !vanaPreview.point) return;

        const { pipe, point } = vanaPreview;

        // --- DÜZELTME BAŞLANGIÇ: Düşey boru açı kontrolü ---
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);

        const len2d = Math.hypot(dx, dy);
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

        let angle = pipe.aci;
        const t = state.viewBlendFactor || 0;

        if (isVertical && t < 0.1) return;
        // -------------------------------------------------------------

        if (isVertical && t > 0.1) {
            angle = -45 * Math.PI / 180; // 3D'de düşey boru açısı
        }
        // --- DÜZELTME BİTİŞ ---

        // Vana boyutu
        const size = 8;
        const halfSize = size / 2;

        // 3D offset uygula
        const z = point.z || 0;
        const adjustedX = point.x + (z * t); // Z etkisini t ile çarp
        const adjustedY = point.y - (z * t);

        ctx.save();
        ctx.translate(adjustedX, adjustedY);
        ctx.rotate(angle);

        // Yarı saydam
        ctx.globalAlpha = 0.7;

        // Vana rengi
        const vanaColor = '#00bffa';
        const adjustedColor = this.getAdjustedColor ? this.getAdjustedColor(vanaColor, 'vana') : vanaColor;
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
    },

    drawRegulatorPreview(ctx, regulatorPreview) {
        if (!regulatorPreview || !regulatorPreview.pipe || !regulatorPreview.point) return;

        const { pipe, point } = regulatorPreview;

        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);

        const len2d = Math.hypot(dx, dy);
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

        let angle = pipe.aci;
        const t = state.viewBlendFactor || 0;
        if (isVertical && t < 0.1) return;
        if (isVertical && t > 0.1) angle = -45 * Math.PI / 180;

        const z = point.z || 0;
        const adjustedX = point.x + (z * t);
        const adjustedY = point.y - (z * t);

        // 2x büyütüldü
        const radius = 10;
        const triSize = 11.2;
        const h = (Math.sqrt(3) / 2) * triSize;

        ctx.save();
        ctx.translate(adjustedX, adjustedY);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.7;

        // Daire
        ctx.fillStyle = '#00bffa';
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        // Eşkenar üçgen — bir köşe akış yönünde (sağ)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(h * 2 / 3, 0);
        ctx.lineTo(-h / 3, -triSize / 2);
        ctx.lineTo(-h / 3, triSize / 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    },

    drawFittingPreview(ctx, fittingPreview) {
        if (!fittingPreview || !fittingPreview.pipe || !fittingPreview.point) return;

        const { pipe, point, fittingType } = fittingPreview;

        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const len2d = Math.hypot(dx, dy);
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

        let angle = pipe.aci;
        const t = state.viewBlendFactor || 0;
        if (isVertical && t < 0.1) return;
        if (isVertical && t > 0.1) angle = -45 * Math.PI / 180;

        const z = point.z || 0;
        const adjustedX = point.x + (z * t);
        const adjustedY = point.y - (z * t);

        ctx.save();
        ctx.translate(adjustedX, adjustedY);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.7;

        if (this.drawFittingSymbol) {
            this.drawFittingSymbol(ctx, fittingType, { isPreview: true });
        }

        ctx.restore();
    },

    drawComponentOnPipePreview(ctx, preview) {
        if (!preview || !preview.point) return;

        const { point, componentType } = preview;
        const zoom = state.zoom || 1;

        // 3D offset uygula (viewBlendFactor ile)
        const z = point.z || 0;
        const t = state.viewBlendFactor || 0;
        const screenX = point.x + (z * t);
        const screenY = point.y - (z * t);

        ctx.save();

        // Dış daire (yeşil/turuncu - sayaç için yeşil, cihaz için turuncu)
        const previewColor = componentType === 'sayac' ? 'rgba(50, 200, 50, 0.8)' : 'rgba(255, 150, 50, 0.8)';
        ctx.fillStyle = previewColor;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 8 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // İç daire (beyaz nokta)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 3 / zoom, 0, Math.PI * 2);
        ctx.fill();

        // Dış pulse efekti
        const pulseColor = componentType === 'sayac' ? 'rgba(50, 200, 50, 0.4)' : 'rgba(255, 150, 50, 0.4)';
        ctx.strokeStyle = pulseColor;
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 12 / zoom, 0, Math.PI * 2);
        ctx.stroke();

        // Metin göstergesi (Sayaç veya Cihaz)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${12 / zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = componentType === 'sayac' ? 'S' : 'C';
        ctx.fillText(label, screenX, screenY + 18 / zoom);

        ctx.restore();
    },

    drawCihazGhostConnection(ctx, ghost, manager) {
        const connInfo = ghost.ghostConnectionInfo;
        if (!connInfo || !connInfo.boruUcu || !connInfo.girisNoktasi) return;

        const { boruUcu, girisNoktasi } = connInfo;
        const boru = boruUcu.boru;

        // DÜZELTME: 3D offset hesapla
        const t = state.viewBlendFactor || 0;
        const boruZ = boruUcu.nokta.z || 0;

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

            // Düşey borularda dx=dy=0 olur; yönü EKRAN (3D projekte) koordinatlarında
            // hesapla — Z farkı ekranda görünür eğim üretir.
            const p1z = boru.p1.z || 0, p2z = boru.p2.z || 0;
            const p1sx = boru.p1.x + p1z * t, p1sy = boru.p1.y - p1z * t;
            const p2sx = boru.p2.x + p2z * t, p2sy = boru.p2.y - p2z * t;
            const sdx = p2sx - p1sx;
            const sdy = p2sy - p1sy;
            const sLen = Math.hypot(sdx, sdy);

            // Boru ucunun ekran konumu
            const boruUcScreenX0 = boruUcu.nokta.x + boruZ * t;
            const boruUcScreenY0 = boruUcu.nokta.y - boruZ * t;

            let vanaScreenX, vanaScreenY;
            if (sLen > 0.01) {
                if (boruUcu.uc === 'p1') {
                    vanaScreenX = boruUcScreenX0 + (sdx / sLen) * VANA_CENTER_MARGIN;
                    vanaScreenY = boruUcScreenY0 + (sdy / sLen) * VANA_CENTER_MARGIN;
                } else {
                    vanaScreenX = boruUcScreenX0 - (sdx / sLen) * VANA_CENTER_MARGIN;
                    vanaScreenY = boruUcScreenY0 - (sdy / sLen) * VANA_CENTER_MARGIN;
                }
            } else {
                vanaScreenX = boruUcScreenX0;
                vanaScreenY = boruUcScreenY0;
            }

            // Ekran açısı (vana yönelimi için)
            const screenAci = (sLen > 0.01) ? Math.atan2(sdy, sdx) : (boru.aci || 0);

            // Vana çiz
            ctx.save();
            ctx.translate(vanaScreenX, vanaScreenY);
            ctx.rotate(screenAci);
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

        // DÜZELTME: 3D offset uygula (boru ucu ve fleks bitiş noktası)
        const boruUcScreenX = boruUcu.nokta.x + (boruZ * t);
        const boruUcScreenY = boruUcu.nokta.y - (boruZ * t);

        const cihazZ = ghost.z || 0;
        const fleksBitisScreenX = fleksBitis.x + (cihazZ * t);
        const fleksBitisScreenY = fleksBitis.y - (cihazZ * t);

        // Fleks rengini borunun colorGroup'una göre ayarla
        const colorGroup = boru?.colorGroup || 'YELLOW';
        const fleksRenk = this.getRenkByGroup(colorGroup, 'fleks', 1);

        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = fleksRenk;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Kesikli çizgi

        ctx.beginPath();
        ctx.moveTo(boruUcScreenX, boruUcScreenY);
        ctx.lineTo(fleksBitisScreenX, fleksBitisScreenY);
        ctx.stroke();

        ctx.setLineDash([]); // Reset dash
        ctx.restore();
    },

    drawSayacGhostConnection(ctx, ghost, manager) {
        const connInfo = ghost.ghostConnectionInfo;
        if (!connInfo || !connInfo.boruUcu) return;

        const { boruUcu } = connInfo;
        const boru = boruUcu.boru;

        // DÜZELTME: 3D offset hesapla
        const t = state.viewBlendFactor || 0;
        const boruZ = boruUcu.nokta.z || 0;

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

            // Düşey borularda yön EKRAN koordinatlarında hesaplanmalı
            const p1z = boru.p1.z || 0, p2z = boru.p2.z || 0;
            const p1sx = boru.p1.x + p1z * t, p1sy = boru.p1.y - p1z * t;
            const p2sx = boru.p2.x + p2z * t, p2sy = boru.p2.y - p2z * t;
            const sdx = p2sx - p1sx;
            const sdy = p2sy - p1sy;
            const sLen = Math.hypot(sdx, sdy);

            const boruUcScreenX0 = boruUcu.nokta.x + boruZ * t;
            const boruUcScreenY0 = boruUcu.nokta.y - boruZ * t;

            let vanaScreenX, vanaScreenY;
            if (sLen > 0.01) {
                if (boruUcu.uc === 'p1') {
                    vanaScreenX = boruUcScreenX0 + (sdx / sLen) * VANA_CENTER_MARGIN;
                    vanaScreenY = boruUcScreenY0 + (sdy / sLen) * VANA_CENTER_MARGIN;
                } else {
                    vanaScreenX = boruUcScreenX0 - (sdx / sLen) * VANA_CENTER_MARGIN;
                    vanaScreenY = boruUcScreenY0 - (sdy / sLen) * VANA_CENTER_MARGIN;
                }
            } else {
                vanaScreenX = boruUcScreenX0;
                vanaScreenY = boruUcScreenY0;
            }

            const screenAci = (sLen > 0.01) ? Math.atan2(sdy, sdx) : (boru.aci || 0);

            ctx.translate(vanaScreenX, vanaScreenY);
            ctx.rotate(screenAci);
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

            ctx.rotate(-screenAci); // Rotasyonu geri al
            ctx.translate(-vanaScreenX, -vanaScreenY); // Translate'i geri al
        }

        // ESKİ VE HATALI OLAN "2. Fleks Çizgisi (Basit kesikli çizgi)" BÖLÜMÜ BURADAN SİLİNDİ!
        // Çünkü drawSayac fonksiyonu artık bu fleksin 3D versiyonunu zaten kendi içinde çok güzel çiziyor.

        ctx.restore();
    },

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
    },

    /**
     * 3D Koordinat Gizmo - Taşıma sırasında gösterilir
     * X, Y, Z eksenlerini zoom'a göre ayarlanmış uzunlukta gösterir
     * Seçili eksen sonsuz uzunlukta, diğerleri kısa
     */
    drawCoordinateGizmo(ctx, point, selectedAxis = null, allowedAxes = ['X', 'Y', 'Z']) {
        if (!point) return;

        const t = state.viewBlendFactor || 0;

        // D2 ekranda gizmo görünmemeli
        if (t < 0.1) return;

        const zoom = state.zoom || 1;

        // 3D offset uygula
        const z = point.z || 0;
        const screenX = point.x + (z * t);
        const screenY = point.y - (z * t);

        ctx.save();

        // Ekranda sabit boyutta görünmesi için zoom'a göre ayarla
        // zoom > 2: ekranda sabit boyut, zoom <= 2: dünya koordinatında sabit boyut
        const effectiveZoom = Math.max(zoom, 2);
        const baseAxisLength = 150 / effectiveZoom;  // Ekranda ~150px gibi görünür
        const infiniteLength = 10000;  // Seçili eksen için sonsuz uzunluk
        const lineWidth = 0.5 / zoom;

        // Kesikli çizgi paterni [çizgi uzunluğu, boşluk uzunluğu]
        const dashPattern = [10 / zoom, 10 / zoom];

        // Z ekseni (yukarı - yeşil)
        if (allowedAxes.includes('Z')) {
            const zLength = selectedAxis === 'Z' ? infiniteLength : baseAxisLength;

            ctx.save();
            ctx.globalAlpha = selectedAxis === 'Z' ? 0.7 : 0.3;
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([]);

            // Z ekseni çizgisi (3D görünümde yukarı-sol yönü) - iki yönde
            const zEndX1 = screenX - (zLength * t);
            const zEndY1 = screenY + (zLength * t);
            const zEndX2 = screenX + (zLength * t);
            const zEndY2 = screenY - (zLength * t);

            ctx.beginPath();
            ctx.moveTo(zEndX1, zEndY1);
            ctx.lineTo(zEndX2, zEndY2);
            ctx.stroke();

            ctx.restore();
        }

        // X ekseni (sağa - kırmızı/magenta)
        if (allowedAxes.includes('X')) {
            const xLength = selectedAxis === 'X' ? infiniteLength : baseAxisLength;

            ctx.save();
            ctx.globalAlpha = selectedAxis === 'X' ? 0.7 : 0.3;
            ctx.strokeStyle = '#FF00FF';
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([]);

            // X ekseni - iki yönde
            const xEndX1 = screenX - xLength;
            const xEndY1 = screenY;
            const xEndX2 = screenX + xLength;
            const xEndY2 = screenY;

            ctx.beginPath();
            ctx.moveTo(xEndX1, xEndY1);
            ctx.lineTo(xEndX2, xEndY2);
            ctx.stroke();

            ctx.restore();
        }

        // Y ekseni (aşağı - turkuaz/cyan)
        if (allowedAxes.includes('Y')) {
            const yLength = selectedAxis === 'Y' ? infiniteLength : baseAxisLength;

            ctx.save();
            ctx.globalAlpha = selectedAxis === 'Y' ? 0.7 : 0.3;
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([]);

            // Y ekseni - iki yönde
            const yEndX1 = screenX;
            const yEndY1 = screenY - yLength;
            const yEndX2 = screenX;
            const yEndY2 = screenY + yLength;

            ctx.beginPath();
            ctx.moveTo(yEndX1, yEndY1);
            ctx.lineTo(yEndX2, yEndY2);
            ctx.stroke();

            ctx.restore();
        }

        // Merkez nokta - daha küçük
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([]); // Düz çizgi
        ctx.beginPath();
        ctx.arc(screenX, screenY, 2 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    },

    /**
     * 3D Taşıma Gizmo - Taşıma modunda kullanılır (3D sahnede)
     * Zoom'a göre ayarlanmış uzunlukta kollar ve ok işaretleri ile gösterir
     * Seçili eksen daha uzun, pasif eksenler kısa ve soluk renkte
     */
    drawTranslateGizmo(ctx, point, selectedAxis = null, allowedAxes = ['X', 'Y', 'Z']) {
        if (!point) return;

        const t = state.viewBlendFactor || 0;

        // 2D ekranda gizmo görünmemeli
        if (t < 0.1) return;

        const zoom = state.zoom || 1;

        // 3D offset uygula
        const z = point.z || 0;
        const screenX = point.x + (z * t);
        const screenY = point.y - (z * t);

        ctx.save();

        // Ekranda sabit boyutta görünmesi için zoom'a göre ayarla
        // zoom > 2: ekranda sabit boyut, zoom <= 2: dünya koordinatında sabit boyut
        const effectiveZoom = Math.max(zoom, 2);
        const baseArmLength = 50 / effectiveZoom;  // Ekranda ~50px gibi görünür
        const lineWidth = 1.5 / zoom;
        const arrowSize = 6 / zoom; // Ok başı boyutu

        // Yardımcı fonksiyon: Ok başı çiz
        const drawArrowHead = (x, y, angle, color, alpha) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillStyle = color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-arrowSize, -arrowSize / 2);
            ctx.lineTo(-arrowSize, arrowSize / 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        // Z ekseni (yeşil) - çapraz yukarı-sol yönü
        if (allowedAxes.includes('Z')) {
            const isActive = selectedAxis === 'Z';
            const zArmLength = baseArmLength;  // Her zaman aynı uzunluk
            const alpha = isActive ? 1.0 : 0.3;
            const color = '#00FF00';

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = isActive ? lineWidth * 1.5 : lineWidth;

            // Z ekseni kolları (hem + hem - yönde)
            // + yönü: yukarı-sağ
            const zPlusEndX = screenX + (zArmLength * t);
            const zPlusEndY = screenY - (zArmLength * t);
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(zPlusEndX, zPlusEndY);
            ctx.stroke();

            // - yönü: aşağı-sol
            const zMinusEndX = screenX - (zArmLength * t);
            const zMinusEndY = screenY + (zArmLength * t);
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(zMinusEndX, zMinusEndY);
            ctx.stroke();

            ctx.restore();

            // Ok başları
            const zAnglePlus = -Math.PI / 4; // Yukarı-sağ
            const zAngleMinus = Math.PI * 3 / 4; // Aşağı-sol
            drawArrowHead(zPlusEndX, zPlusEndY, zAnglePlus, color, alpha);
            drawArrowHead(zMinusEndX, zMinusEndY, zAngleMinus, color, alpha);
        }

        // X ekseni (magenta) - yatay sağa/sola
        if (allowedAxes.includes('X')) {
            const isActive = selectedAxis === 'X';
            const xArmLength = baseArmLength;  // Her zaman aynı uzunluk
            const alpha = isActive ? 1.0 : 0.3;
            const color = '#FF00FF';

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = isActive ? lineWidth * 1.5 : lineWidth;

            // X ekseni kolları (hem + hem - yönde)
            // + yönü: sağa
            const xPlusEndX = screenX + xArmLength;
            const xPlusEndY = screenY;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(xPlusEndX, xPlusEndY);
            ctx.stroke();

            // - yönü: sola
            const xMinusEndX = screenX - xArmLength;
            const xMinusEndY = screenY;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(xMinusEndX, xMinusEndY);
            ctx.stroke();

            ctx.restore();

            // Ok başları
            const xAnglePlus = 0; // Sağa
            const xAngleMinus = Math.PI; // Sola
            drawArrowHead(xPlusEndX, xPlusEndY, xAnglePlus, color, alpha);
            drawArrowHead(xMinusEndX, xMinusEndY, xAngleMinus, color, alpha);
        }

        // Y ekseni (cyan) - dikey yukarı/aşağı
        if (allowedAxes.includes('Y')) {
            const isActive = selectedAxis === 'Y';
            const yArmLength = baseArmLength;  // Her zaman aynı uzunluk
            const alpha = isActive ? 1.0 : 0.3;
            const color = '#00FFFF';

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = isActive ? lineWidth * 1.5 : lineWidth;

            // Y ekseni kolları (hem + hem - yönde)
            // + yönü: aşağı (canvas Y ekseni)
            const yPlusEndX = screenX;
            const yPlusEndY = screenY + yArmLength;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(yPlusEndX, yPlusEndY);
            ctx.stroke();

            // - yönü: yukarı
            const yMinusEndX = screenX;
            const yMinusEndY = screenY - yArmLength;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(yMinusEndX, yMinusEndY);
            ctx.stroke();

            ctx.restore();

            // Ok başları
            const yAnglePlus = Math.PI / 2; // Aşağı
            const yAngleMinus = -Math.PI / 2; // Yukarı
            drawArrowHead(yPlusEndX, yPlusEndY, yAnglePlus, color, alpha);
            drawArrowHead(yMinusEndX, yMinusEndY, yAngleMinus, color, alpha);
        }

        // Merkez nokta - beyaz daire
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1 / zoom;
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 3 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    },

    /**
     * Copy/Paste Preview - Kopyalanan/Kesilen borular ve bileşenler için ghost preview
     * Mouse pozisyonunu takip eder
     */
    drawPastePreview(ctx, interactionManager) {
        const pasteData = interactionManager.cutPipes || interactionManager.copiedPipes;

        if (!pasteData || !interactionManager.lastMousePoint) {
            return;
        }

        const isCut = !!interactionManager.cutPipes;
        const snap = interactionManager.pasteSnapPoint; // { x, y, z, type, hasConflict } veya null

        // Ghost konumunu belirle: snap noktası varsa ona, yoksa mouse'a
        const refPt = snap
            ? { x: snap.x, y: snap.y, z: snap.z || 0 }
            : interactionManager.lastMousePoint;

        const dx = refPt.x - pasteData.referencePoint.x;
        const dy = refPt.y - pasteData.referencePoint.y;
        const dz = (refPt.z || 0) - (pasteData.referencePoint.z || 0);

        const t = state.viewBlendFactor || 0;
        const zoom = state.zoom || 1;

        // Renk durumu: çakışma varsa kırmızı, snap varsa yeşil, yoksa nötr
        const hasSnap = !!snap;
        const hasConflict = snap?.hasConflict;

        ctx.save();

        // 0. Snap göstergesi — yaklaşılabilir noktada büyük halka
        if (hasSnap) {
            ctx.globalAlpha = 1.0;
            const snapScreenX = snap.x + (snap.z || 0) * t;
            const snapScreenY = snap.y - (snap.z || 0) * t;
            const snapColor = hasConflict ? '#FF4444' : '#44FF88';
            // Köşe ve uç noktası: daha belirgin halka (8); gövde: küçük (6)
            //  const snapR = (snap.type === 'endpoint' || snap.type === 'corner') ? 8 / zoom : 6 / zoom;
            const snapR = snap.type === 'endpoint' ? 8 / zoom : 6 / zoom;

            ctx.strokeStyle = snapColor;
            ctx.lineWidth = 2.5 / zoom;
            ctx.beginPath();
            ctx.arc(snapScreenX, snapScreenY, snapR, 0, Math.PI * 2);
            ctx.stroke();

            if (!hasConflict) {
                // İçi dolu küçük nokta — "tıklanabilir" işareti
                ctx.fillStyle = snapColor;
                ctx.beginPath();
                ctx.arc(snapScreenX, snapScreenY, 2.5 / zoom, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Çakışma: çarpı
                ctx.strokeStyle = '#FF4444';
                ctx.lineWidth = 2 / zoom;
                const s = 5 / zoom;
                ctx.beginPath();
                ctx.moveTo(snapScreenX - s, snapScreenY - s);
                ctx.lineTo(snapScreenX + s, snapScreenY + s);
                ctx.moveTo(snapScreenX + s, snapScreenY - s);
                ctx.lineTo(snapScreenX - s, snapScreenY + s);
                ctx.stroke();
            }
        }

        // Ghost alpha: snap + geçerli → opak; snap yok → soluk
        ctx.globalAlpha = hasSnap && !hasConflict
            ? (isCut ? 0.55 : 0.75)
            : 0.25;

        // 1. Boruları çiz
        for (const pipeData of pasteData.pipes) {
            const p1 = {
                x: pipeData.p1.x + dx,
                y: pipeData.p1.y + dy,
                z: (pipeData.p1.z || 0) + dz
            };
            const p2 = {
                x: pipeData.p2.x + dx,
                y: pipeData.p2.y + dy,
                z: (pipeData.p2.z || 0) + dz
            };

            const p1ScreenX = p1.x + (p1.z * t);
            const p1ScreenY = p1.y - (p1.z * t);
            const p2ScreenX = p2.x + (p2.z * t);
            const p2ScreenY = p2.y - (p2.z * t);

            const renkGruplari = getRenkGruplari();
            const colorGroup = renkGruplari[pipeData.colorGroup] || renkGruplari.YELLOW;

            // Çakışma varsa kırmızı çiz
            if (hasConflict) {
                ctx.strokeStyle = 'rgba(255,60,60,0.85)';
            } else {
                ctx.strokeStyle = colorGroup.boru.replace('{opacity}', '0.85');
            }
            ctx.lineWidth = 4;

            if (isCut) ctx.setLineDash([10, 5]);

            ctx.beginPath();
            ctx.moveTo(p1ScreenX, p1ScreenY);
            ctx.lineTo(p2ScreenX, p2ScreenY);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = hasConflict
                ? 'rgba(255,60,60,1)'
                : colorGroup.boru.replace('{opacity}', '1');
            ctx.beginPath();
            ctx.arc(p1ScreenX, p1ScreenY, 3 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p2ScreenX, p2ScreenY, 3 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. Bileşenleri çiz (basit gösterim)
        for (const compData of pasteData.components) {
            if (compData.type === 'vana') {
                const vanaPos = {
                    x: compData.data.x + dx,
                    y: compData.data.y + dy,
                    z: (compData.data.z || 0) + dz
                };
                const screenX = vanaPos.x + (vanaPos.z * t);
                const screenY = vanaPos.y - (vanaPos.z * t);
                ctx.fillStyle = 'rgba(0, 191, 250, 0.6)';
                ctx.beginPath();
                ctx.arc(screenX, screenY, 4 / zoom, 0, Math.PI * 2);
                ctx.fill();
            }
            else if (compData.type === 'sayac') {
                const sayacPos = {
                    x: compData.data.x + dx,
                    y: compData.data.y + dy,
                    z: (compData.data.z || 0) + dz
                };
                const screenX = sayacPos.x + (sayacPos.z * t);
                const screenY = sayacPos.y - (sayacPos.z * t);
                ctx.fillStyle = 'rgba(50, 200, 50, 0.6)';
                ctx.fillRect(screenX - 10 / zoom, screenY - 6 / zoom, 20 / zoom, 12 / zoom);
            }
            else if (compData.type === 'cihaz') {
                const cihazPos = {
                    x: compData.data.x + dx,
                    y: compData.data.y + dy,
                    z: (compData.data.z || 0) + dz
                };
                const screenX = cihazPos.x + (cihazPos.z * t);
                const screenY = cihazPos.y - (cihazPos.z * t);
                ctx.fillStyle = 'rgba(255, 150, 50, 0.6)';
                ctx.fillRect(screenX - 15 / zoom, screenY - 15 / zoom, 30 / zoom, 30 / zoom);
            }
        }

        // 3. Durum etiketi
        let labelText;
        if (hasSnap && hasConflict) {
            labelText = isCut ? '✂ Çakışma — başka yer seçin' : '⎘ Çakışma — başka yer seçin';
        } else if (hasSnap) {
            labelText = isCut ? '✂ Tıkla: yapıştır' : '⎘ Tıkla: yapıştır';
        } else {
            labelText = isCut ? '✂ Yapıştırılabilir bir noktaya yaklaşın' : '⎘ Yapıştırılabilir bir noktaya yaklaşın';
        }

        const labelRefX = interactionManager.lastMousePoint.x;
        const labelRefY = interactionManager.lastMousePoint.y - 30 / zoom;
        const labelScreenX = labelRefX + ((interactionManager.lastMousePoint.z || 0) * t);
        const labelScreenY = labelRefY - ((interactionManager.lastMousePoint.z || 0) * t);

        ctx.globalAlpha = 1.0;
        const labelColor = hasConflict ? '#FF8888' : (hasSnap ? '#88FF99' : '#CCCCCC');
        ctx.fillStyle = labelColor;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.font = `bold ${14 / zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(labelText, labelScreenX, labelScreenY);
        ctx.fillText(labelText, labelScreenX, labelScreenY);

        ctx.restore();
    }
};