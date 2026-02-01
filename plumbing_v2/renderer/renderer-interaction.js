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
            // Boru endpoint taşıması - Tüm eksenler
            point = interactionManager.dragEndpoint === 'p1' ? obj.p1 : obj.p2;
        } else if (obj.type === 'boru' && interactionManager.isBodyDrag) {
            // Boru gövde taşıması - Borunun ortası
            point = {
                x: (obj.p1.x + obj.p2.x) / 2,
                y: (obj.p1.y + obj.p2.y) / 2,
                z: ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2
            };

            // Borunun uzandığı eksen hariç diğer 2 eksen
            const primaryAxis = interactionManager.bodyDragPrimaryAxis;
            if (primaryAxis === 'X') {
                allowedAxes = ['Y', 'Z']; // X'te uzanıyor -> Y-Z'de hareket
            } else if (primaryAxis === 'Y') {
                allowedAxes = ['X', 'Z']; // Y'de uzanıyor -> X-Z'de hareket
            } else if (primaryAxis === 'Z') {
                allowedAxes = ['X', 'Y']; // Z'de uzanıyor -> X-Y'de hareket
            }
        } else if (obj.type === 'boru') {
            // Boru seçili ama endpoint bilgisi yok - merkez kullan
            point = {
                x: (obj.p1.x + obj.p2.x) / 2,
                y: (obj.p1.y + obj.p2.y) / 2,
                z: ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2
            };
        } else if (obj.type === 'vana' || obj.type === 'sayac' || obj.type === 'cihaz' || obj.type === 'servis_kutusu') {
            // Obje taşıması - Tüm eksenler
            point = { x: obj.x, y: obj.y, z: obj.z || 0 };
        }

        if (!point) return;

        // 3D sahnede taşıma gizmo'yu çiz (PreviewMixin'den)
        if (this.drawTranslateGizmo) {
            this.drawTranslateGizmo(ctx, point, selectedAxis, allowedAxes);
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

        // Nesneye göre gizmo pozisyonunu belirle
        if (obj.type === 'boru') {
            // Eğer endpoint seçiliyse sadece o noktayı göster
            if (interactionManager.selectedEndpoint) {
                const point = interactionManager.selectedEndpoint === 'p1' ? obj.p1 : obj.p2;
                const allowedAxes = ['X', 'Y', 'Z']; // Endpoint için tüm eksenler kullanılabilir

                // Hover durumunda eksen uzamasın, sadece vurgulansın
                if (this.drawTranslateGizmo) {
                    this.drawTranslateGizmo(ctx, point, null, allowedAxes);
                }
            } else {
                // Boru gövdesi seçili: hem merkez hem endpoint'lerde gizmo göster

                // Borunun uzandığı ekseni hesapla
                const dx = Math.abs(obj.p2.x - obj.p1.x);
                const dy = Math.abs(obj.p2.y - obj.p1.y);
                const dz = Math.abs((obj.p2.z || 0) - (obj.p1.z || 0));

                let bodyAllowedAxes = ['X', 'Y', 'Z'];
                // Ana ekseni bul (en uzun olanı)
                if (dx > dy && dx > dz) {
                    bodyAllowedAxes = ['Y', 'Z']; // X'te uzanıyor -> Y-Z'de hareket
                } else if (dy > dx && dy > dz) {
                    bodyAllowedAxes = ['X', 'Z']; // Y'de uzanıyor -> X-Z'de hareket
                } else if (dz > dx && dz > dy) {
                    bodyAllowedAxes = ['X', 'Y']; // Z'de uzanıyor -> X-Y'de hareket
                }

                // Merkez gizmo (body için) - Hover durumunda uzamasın
                const centerPoint = {
                    x: (obj.p1.x + obj.p2.x) / 2,
                    y: (obj.p1.y + obj.p2.y) / 2,
                    z: ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2
                };
                if (this.drawTranslateGizmo) {
                    this.drawTranslateGizmo(ctx, centerPoint, null, bodyAllowedAxes);
                }

                // p1 endpoint gizmo (tüm eksenler) - Hover durumunda uzamasın
                if (this.drawTranslateGizmo) {
                    this.drawTranslateGizmo(ctx, obj.p1, null, ['X', 'Y', 'Z']);
                }

                // p2 endpoint gizmo (tüm eksenler) - Hover durumunda uzamasın
                if (this.drawTranslateGizmo) {
                    this.drawTranslateGizmo(ctx, obj.p2, null, ['X', 'Y', 'Z']);
                }
            }
        } else if (obj.type === 'vana' || obj.type === 'sayac' || obj.type === 'cihaz' || obj.type === 'servis_kutusu') {
            // Diğer nesneler için kendi pozisyonunu kullan - Hover durumunda uzamasın
            const point = { x: obj.x, y: obj.y, z: obj.z || 0 };
            const allowedAxes = ['X', 'Y', 'Z'];

            if (this.drawTranslateGizmo) {
                this.drawTranslateGizmo(ctx, point, null, allowedAxes);
            }
        }
    }
};
