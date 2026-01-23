// plumbing_v2/plumbing-renderer.js
// Ana tesisat renderer sınıfı - Modüler yapı ile yeniden organize edildi

import { buildPipeHierarchy } from './renderer/renderer-utils.js';
import { ColorMixin } from './renderer/renderer-colors.js';
import { PipeMixin } from './renderer/renderer-pipes.js';
import { ComponentMixin } from './renderer/renderer-components.js';
import { DeviceMixin } from './renderer/renderer-devices.js';
import { InteractionMixin } from './renderer/renderer-interaction.js';
import { PreviewMixin } from './renderer/renderer-previews.js';
import { state } from '../general-files/main.js';

/**
 * Tesisat çizim motoru
 * Borular, bileşenler, cihazlar ve kullanıcı etkileşimlerini render eder
 */
export class PlumbingRenderer {
    constructor() {
        // Tema renkleri main.js'ten import ediliyor (THEME_COLORS)
    }

    /**
     * Ana render metodu - Tüm tesisat elemanlarını çizer
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {PlumbingManager} manager - Tesisat yönetici nesnesi
     */
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

        // --- YENİ EKLENEN KISIM: GÖLGE ÇİZİMİ ---
        // Sadece 3D modunda gölge çiz (Zemine izdüşüm)
        if (state.viewBlendFactor > 0.1 && state.tempVisibility && state.tempVisibility.showPipeShadows) {
            this.drawShadows(ctx, manager);

            // Geçici boru gölgesini de çiz
            const geciciBoru = manager.interactionManager?.getGeciciBoruCizgisi();
            if (geciciBoru) {
                this.drawGeciciBoruShadow(ctx, geciciBoru);
            }
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

        const showMeasurements = !shouldBeFaded && state.dimensionMode !== 0;

        // 1. Ölçüler Açık İse (Ve Panelden de İzin Verildiyse)
        if (showMeasurements && state.tempVisibility.showPlumbingDimensions) {
            this.drawPipeMeasurements(ctx, manager.pipes);
            if (geciciBoru) {
                this.drawTempPipeMeasurement(ctx, geciciBoru);
            }
        }
        else {
            // 2. Ölçüler Kapalı İse -> Sadece Etiketleri Göster
            // DÜZELTME: && state.tempVisibility.showPipeLabels eklendi.
            // Artık panelden "Hat No" kapatılınca burası çalışmayacak.
            const showLabelsOnly = !shouldBeFaded && state.dimensionMode === 0;

            if (showLabelsOnly && state.tempVisibility.showPipeLabels) {
                this.drawPipeLabelsOnly(ctx, manager.pipes, manager.components);
            }
        }


        // --- YENİ EKLENEN KISIM: KOT YAZILARI ---
        // Boru köşe noktalarındaki h değerlerini çiz (3D modunda)
        if (state.tempVisibility.showZElevation) {
            this.drawPipeElevations(ctx, manager.pipes);
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

                    // DÜZELTME: 3D modda Z offset'i uygula
                    const z = manager.tempComponent.z || 0;
                    const t = state.viewBlendFactor || 0;
                    const screenX = manager.tempComponent.x + (z * t);
                    const screenY = manager.tempComponent.y - (z * t);

                    ctx.translate(screenX, screenY);
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

        // 3D Eksen Rehberi Çizimi - taşıma gizmosu ile aynı
        if (manager.interactionManager?.boruCizimAktif && manager.interactionManager?.boruBaslangic) {
            const startPt = manager.interactionManager.boruBaslangic.nokta;
            const snapMode = manager.interactionManager.axisSnapMode;
            this.drawCoordinateGizmo(ctx, startPt, snapMode, ['X', 'Y', 'Z']);
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

        // Sayaç/Cihaz boru üzerine ekleme preview (sayac/cihaz tool aktif, hover)
        if (manager.interactionManager?.componentOnPipePreview) {
            this.drawComponentOnPipePreview(ctx, manager.interactionManager.componentOnPipePreview);
        }

        // Seçili borunun yolunu sağ üstte göster
        if (state.tempVisibility.showPipePath && window._selectedPipePath && window._selectedPipePath.length > 0) {
            this.drawSelectedPipePath(ctx);
        }

        // Gizmo gösterimi ayara bağlı
        if (state.tempVisibility && state.tempVisibility.show3DAxis) {
            // Koordinat gizmo (taşıma sırasında)
            if (manager.interactionManager?.isDragging) {
                this.drawDragCoordinateGizmo(ctx, manager.interactionManager);
            }

            // Seçim gizmosu (seçili nesne için - sürüklemeden önce)
            if (!manager.interactionManager?.isDragging && manager.interactionManager?.selectedObject) {
                this.drawSelectionGizmo(ctx, manager.interactionManager);
            }
        }
    }
}



// Tüm mixin'leri PlumbingRenderer sınıfına ekle
Object.assign(PlumbingRenderer.prototype, ColorMixin);
Object.assign(PlumbingRenderer.prototype, PipeMixin);
Object.assign(PlumbingRenderer.prototype, ComponentMixin);
Object.assign(PlumbingRenderer.prototype, DeviceMixin);
Object.assign(PlumbingRenderer.prototype, InteractionMixin);
Object.assign(PlumbingRenderer.prototype, PreviewMixin);
