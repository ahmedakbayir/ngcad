// plumbing_v2/renderer-interaction.js
// Kullanıcı etkileşimi göstergesi metodları

import { state } from '../../general-files/main.js';

export const InteractionMixin = {
    drawSnapIndicator(ctx, snap) {
        // Snap göstergesi kaldırıldı - kullanıcı istemiyor
    },

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
    },

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
    },

    /**
     * Koordinat gizmo'yu göster (taşıma sırasında)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} interactionManager - InteractionManager instance
     */
    drawDragCoordinateGizmo(ctx, interactionManager) {
        // 3D Eksen ayarı kapalıysa gösterme
        if (!state.show3DAxis) return;

        if (!interactionManager.isDragging || !interactionManager.dragObject) return;

        let point = null;
        let selectedAxis = interactionManager.selectedDragAxis || null;

        // Hangi nokta taşınıyor?
        const obj = interactionManager.dragObject;

        if (obj.type === 'boru' && interactionManager.dragEndpoint) {
            // Boru endpoint taşıması
            point = interactionManager.dragEndpoint === 'p1' ? obj.p1 : obj.p2;
        } else if (obj.type === 'vana' || obj.type === 'sayac' || obj.type === 'cihaz' || obj.type === 'servis_kutusu') {
            // Obje taşıması
            point = { x: obj.x, y: obj.y, z: obj.z || 0 };
        }

        if (!point) return;

        // Gizmo'yu çiz (PreviewMixin'den)
        if (this.drawCoordinateGizmo) {
            this.drawCoordinateGizmo(ctx, point, selectedAxis);
        }
    }
};
