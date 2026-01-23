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
        if (!interactionManager.isDragging || !interactionManager.dragObject) return;

        let point = null;
        let selectedAxis = interactionManager.selectedDragAxis || null;
        let allowedAxes = ['X', 'Y', 'Z']; // Varsayılan: Tüm eksenler

        // Hangi nokta taşınıyor?
        const obj = interactionManager.dragObject;

        if (obj.type === 'boru' && interactionManager.dragEndpoint) {
            // Boru endpoint taşıması
            point = interactionManager.dragEndpoint === 'p1' ? obj.p1 : obj.p2;

            // ✨✨✨ SEZGİSEL EKSEN GÖSTERİMİ (INTUITIVE AXIS DISPLAY) ✨✨✨
            // Eğer tercih edilen eksen varsa, sadece seçili ekseni göster
            if (interactionManager.endpointDragPreferredAxis && selectedAxis) {
                allowedAxes = [selectedAxis]; // Sadece aktif olan ekseni göster
            }
            // ✨✨✨ SON ✨✨✨
        } else if (obj.type === 'boru' && interactionManager.isBodyDrag) {
            // Boru gövde taşıması - Borunun ortası
            point = {
                x: (obj.p1.x + obj.p2.x) / 2,
                y: (obj.p1.y + obj.p2.y) / 2,
                z: ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2
            };

            // ✨✨✨ SEZGİSEL GÖVDE GIZMO (INTUITIVE BODY GIZMO) ✨✨✨
            // Eğer tercih edilen eksen varsa, sadece seçili ekseni göster
            if (interactionManager.bodyDragPreferredAxis && selectedAxis) {
                allowedAxes = [selectedAxis]; // Sadece aktif olan ekseni göster
            } else {
                // Tercih edilen eksen yoksa, tüm izin verilen eksenleri göster
                const primaryAxis = interactionManager.bodyDragPrimaryAxis;
                if (primaryAxis === 'X') {
                    allowedAxes = ['Y', 'Z']; // X'te uzanıyor -> Y-Z'de hareket
                } else if (primaryAxis === 'Y') {
                    allowedAxes = ['X', 'Z']; // Y'de uzanıyor -> X-Z'de hareket
                } else if (primaryAxis === 'Z') {
                    allowedAxes = ['X', 'Y']; // Z'de uzanıyor -> X-Y'de hareket
                }
            }
            // ✨✨✨ SON ✨✨✨
        } else if (obj.type === 'vana' || obj.type === 'sayac' || obj.type === 'cihaz' || obj.type === 'servis_kutusu') {
            // Obje taşıması - Tüm eksenler
            point = { x: obj.x, y: obj.y, z: obj.z || 0 };
        }

        if (!point) return;

        // Gizmo'yu çiz (PreviewMixin'den)
        if (this.drawCoordinateGizmo) {
            this.drawCoordinateGizmo(ctx, point, selectedAxis, allowedAxes);
        }
    },

    /**
     * Seçili nesne için gizmo göster (sürüklemeden önce - statik)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} interactionManager - InteractionManager instance
     */
    drawSelectionGizmo(ctx, interactionManager) {
        // Sürükleme sırasında gösterme (zaten drawDragCoordinateGizmo var)
        if (interactionManager.isDragging) return;

        // Seçili nesne yoksa gösterme
        if (!interactionManager.selectedObject) return;

        const obj = interactionManager.selectedObject;
        let point = null;
        let allowedAxes = ['X', 'Y', 'Z'];

        // Nesneye göre gizmo pozisyonunu belirle
        if (obj.type === 'boru') {
            // Boru için merkez noktayı kullan
            point = {
                x: (obj.p1.x + obj.p2.x) / 2,
                y: (obj.p1.y + obj.p2.y) / 2,
                z: ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2
            };

            // Borunun uzandığı ekseni hesapla
            const dx = Math.abs(obj.p2.x - obj.p1.x);
            const dy = Math.abs(obj.p2.y - obj.p1.y);
            const dz = Math.abs((obj.p2.z || 0) - (obj.p1.z || 0));

            // Ana ekseni bul (en uzun olanı)
            if (dx > dy && dx > dz) {
                allowedAxes = ['Y', 'Z']; // X'te uzanıyor -> Y-Z'de hareket
            } else if (dy > dx && dy > dz) {
                allowedAxes = ['X', 'Z']; // Y'de uzanıyor -> X-Z'de hareket
            } else if (dz > dx && dz > dy) {
                allowedAxes = ['X', 'Y']; // Z'de uzanıyor -> X-Y'de hareket
            }
        } else if (obj.type === 'vana' || obj.type === 'sayac' || obj.type === 'cihaz' || obj.type === 'servis_kutusu') {
            // Diğer nesneler için kendi pozisyonunu kullan
            point = { x: obj.x, y: obj.y, z: obj.z || 0 };
        }

        if (!point) return;

        // Hover ediliyorsa göster
        if (interactionManager.hoveredGizmoAxis) {
            // Gizmo'yu çiz - hover edilen ekseni vurgula
            if (this.drawCoordinateGizmo) {
                this.drawCoordinateGizmo(ctx, point, interactionManager.hoveredGizmoAxis, allowedAxes);
            }
        } else {
            // Gizmo'yu çiz - hiç seçili eksen yok
            if (this.drawCoordinateGizmo) {
                this.drawCoordinateGizmo(ctx, point, null, allowedAxes);
            }
        }
    }
};
