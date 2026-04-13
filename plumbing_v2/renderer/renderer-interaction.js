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

    drawPipeResizeInput(ctx, interactionManager) {
        if (!interactionManager.pipeResizeActive) return;
        const pipe = interactionManager.selectedObject;
        if (!pipe || pipe.type !== 'boru') return;

        const zoom = state.zoom || 1;
        const t = state.viewBlendFactor || 0;

        // Borunun orta noktası (3D projeksiyon dahil)
        const mx = (pipe.p1.x + pipe.p2.x) / 2;
        const my = (pipe.p1.y + pipe.p2.y) / 2;
        const mz = ((pipe.p1.z || 0) + (pipe.p2.z || 0)) / 2;
        const cx = mx + mz * t;
        const cy = my - mz * t;

        const baseFontSize = 16;
        const ZOOM_EXPONENT = -0.65;
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const actualFontSize = Math.max(8, fontSize);

        ctx.save();
        ctx.translate(cx, cy - 15 / zoom);

        ctx.font = `bold ${actualFontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
        const rawInput = interactionManager.pipeResizeInput;
        const isVertical = rawInput.startsWith('+') || rawInput.startsWith('-');
        const displayText = isVertical
            ? rawInput + '_ cm ↕'
            : rawInput + '_ cm';

        const metrics = ctx.measureText(displayText);
        const textWidth = metrics.width;
        const padding = 4;

        // Arka plan: düşey ekleme → yeşil/kırmızı, boyutlandırma → açık mavi
        const isNegative = rawInput.startsWith('-');
        ctx.fillStyle = isVertical
            ? (isNegative ? 'rgba(255, 120, 80, 0.95)' : 'rgba(80, 200, 120, 0.95)')
            : 'rgba(100, 180, 255, 0.95)';
        ctx.beginPath();
        ctx.roundRect(
            -textWidth / 2 - padding,
            -actualFontSize / 2 - padding,
            textWidth + padding * 2,
            actualFontSize + padding * 2,
            3 / zoom
        );
        ctx.fill();

        // Kenarlık
        ctx.strokeStyle = isVertical ? (isNegative ? '#cc3300' : '#006633') : '#0066cc';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, 0, 0);

        ctx.restore();
    },

    drawSelectedPipePath(ctx) {
        const path = window._selectedPipePath;
        if (!path || path.length === 0) return;

        // Sayıları "1 → 3 → 5" formatında göster
        const pathText = path.join(' → ');

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const canvas = ctx.canvas;
        const padding = 20;
        const x = canvas.width - padding;
        const y = canvas.height - padding;

        ctx.font = 'bold 15px "Segoe UI",sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        // Arka plan
        const tw = ctx.measureText(pathText).width;
        ctx.fillStyle = 'rgba(20,20,35,0.55)';
        ctx.beginPath();
        ctx.roundRect(x - tw - 8, y - 22, tw + 16, 26, 5);
        ctx.fill();

        ctx.fillStyle = '#60a5fa';
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
        // Hover edilen eksen belirgin olsun
        const hoveredAxis = interactionManager.hoveredGizmoAxis || null;
        if (this.drawTranslateGizmo) {
            this.drawTranslateGizmo(ctx, point, hoveredAxis, allowedAxes);
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

                // Hover edilen eksen belirgin olsun
                const hoveredAxis = interactionManager.hoveredGizmoAxis || null;
                if (this.drawTranslateGizmo) {
                    this.drawTranslateGizmo(ctx, point, hoveredAxis, allowedAxes);
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

                // Merkez gizmo (body için) - Hover edilen eksen belirgin olsun
                const centerPoint = {
                    x: (obj.p1.x + obj.p2.x) / 2,
                    y: (obj.p1.y + obj.p2.y) / 2,
                    z: ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2
                };
                if (this.drawTranslateGizmo) {
                    const centerHoveredAxis = interactionManager.hoveredGizmoId === 'center' ? interactionManager.hoveredGizmoAxis : null;
                    this.drawTranslateGizmo(ctx, centerPoint, centerHoveredAxis, bodyAllowedAxes);
                }

                // p1 endpoint gizmo (tüm eksenler) - Hover edilen eksen belirgin olsun
                if (this.drawTranslateGizmo) {
                    const p1HoveredAxis = interactionManager.hoveredGizmoId === 'p1' ? interactionManager.hoveredGizmoAxis : null;
                    this.drawTranslateGizmo(ctx, obj.p1, p1HoveredAxis, ['X', 'Y', 'Z']);
                }

                // p2 endpoint gizmo (tüm eksenler) - Hover edilen eksen belirgin olsun
                if (this.drawTranslateGizmo) {
                    const p2HoveredAxis = interactionManager.hoveredGizmoId === 'p2' ? interactionManager.hoveredGizmoAxis : null;
                    this.drawTranslateGizmo(ctx, obj.p2, p2HoveredAxis, ['X', 'Y', 'Z']);
                }
            }
        } else if (obj.type === 'vana' || obj.type === 'sayac' || obj.type === 'cihaz' || obj.type === 'servis_kutusu') {
            // Diğer nesneler için kendi pozisyonunu kullan - Hover edilen eksen belirgin olsun
            const point = { x: obj.x, y: obj.y, z: obj.z || 0 };
            const allowedAxes = ['X', 'Y', 'Z'];

            const hoveredAxis = interactionManager.hoveredGizmoAxis || null;
            if (this.drawTranslateGizmo) {
                this.drawTranslateGizmo(ctx, point, hoveredAxis, allowedAxes);
            }
        }
    }
};
