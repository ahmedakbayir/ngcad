// plumbing_v2/plumbing-renderer.js
// Ana tesisat renderer sınıfı - Modüler yapı ile yeniden organize edildi

import { buildPipeHierarchy, computePipeDebileri, slicePipeAcrossFloors, makeSlicedPipeProxy } from './renderer/renderer-utils.js';
import { ColorMixin } from './renderer/renderer-colors.js';
import { PipeMixin } from './renderer/renderer-pipes.js';
import { ComponentMixin } from './renderer/renderer-components.js';
import { DeviceMixin } from './renderer/renderer-devices.js';
import { InteractionMixin } from './renderer/renderer-interaction.js';
import { PreviewMixin } from './renderer/renderer-previews.js';
import { LabelMixin, clearLabelAutoPos } from './renderer/renderer-labels.js';
import { EnclosureMixin } from './renderer/renderer-enclosure.js';
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

        // Her boruya doğrudan bağlı cihazların debi toplamını hesapla
        computePipeDebileri(manager);

        // Vanaların pozisyonlarını güncelle (boru uzunluğu değiştiğinde)
        manager.updateAllValvePositions();

        // MİMARİ modunda tesisat nesneleri soluk görünmeli
        const shouldBeFaded = state.currentDrawingMode === 'MİMARİ';

        if (shouldBeFaded) {
            ctx.save();
            ctx.globalAlpha = 0.35; // Biraz daha görünür (önceden 0.15)
        }

        // --- KAT FİLTRESİ + DİLİMLEME ---
        // 2D: sadece aktif katın tesisatı çizilir.
        // 3D: diğer katların tesisatı da çizilir ama sönük (α≈0.35).
        // floorId yoksa (legacy kayıt) her zaman görünür sayılır.
        // Borular Z aralığına göre her katın kesitine dilimlenir; cross-floor
        // riser her iki katta da kendi Z aralığıyla görünür.
        const _vbf = state.viewBlendFactor || 0;
        const _is3D = _vbf >= 0.5;
        const _curFloorId = state.currentFloor?.id || null;
        const _sameFloor = (o) => !_curFloorId || !o.floorId || o.floorId === _curFloorId;
        // "3D Diğer Katları Gizle" görünüm ayarı: 3D'de bile diğer katların hiç çizilmemesi.
        const _hideOtherIn3D = !!state.tempVisibility?.hideOtherFloors3D;
        const _showOtherSlices = _is3D && !_hideOtherIn3D;

        const _floors = (state.floors || []).filter(f => !f.isPlaceholder);
        const _allSlices = [];
        manager.pipes.forEach(pipe => {
            const slices = slicePipeAcrossFloors(pipe, _floors);
            slices.forEach(s => _allSlices.push(s));
        });
        const _slicesCurrent = _allSlices.filter(s => !_curFloorId || !s.floorId || s.floorId === _curFloorId);
        const _slicesOther = _showOtherSlices ? _allSlices.filter(s => s.floorId && _curFloorId && s.floorId !== _curFloorId) : [];
        const _pipesCurrent = _slicesCurrent.map(makeSlicedPipeProxy);
        const _pipesOther = _slicesOther.map(makeSlicedPipeProxy);

        const _allComps = manager.components || [];
        const _skCurrent = _allComps.filter(c => c.type === 'servis_kutusu' && _sameFloor(c));
        const _skOther = _showOtherSlices ? _allComps.filter(c => c.type === 'servis_kutusu' && !_sameFloor(c)) : [];
        const _digerCurrent = _allComps.filter(c => c.type !== 'servis_kutusu' && _sameFloor(c));
        const _digerOther = _showOtherSlices ? _allComps.filter(c => c.type !== 'servis_kutusu' && !_sameFloor(c)) : [];

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

        // Muhafaza kutuları (her şeyin altında)
        this.drawMuhafazaBoxes(ctx, manager);

        // Diğer kat (yalnız 3D'de) — sönük geçiş
        if (_pipesOther.length || _skOther.length || _digerOther.length) {
            ctx.save();
            ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.12;
            _skOther.forEach(comp => this.drawComponent(ctx, comp, manager));
            this.drawPipes(ctx, _pipesOther);
            this.drawServiceBoxReducers(ctx, _skOther, _pipesOther);
            this.drawPipeWallCrossings(ctx, _pipesOther);
            this.drawTopraklamaSymbols(ctx, _pipesOther);
            this.drawFloorCrossingMarkers(ctx, _pipesOther);
            this.drawComponents(ctx, _digerOther, manager);
            ctx.restore();
        }

        // Aktif kat — normal
        _skCurrent.forEach(comp => this.drawComponent(ctx, comp, manager));
        this.drawPipes(ctx, _pipesCurrent);
        this.drawServiceBoxReducers(ctx, _skCurrent, _pipesCurrent);
        this.drawPipeWallCrossings(ctx, _pipesCurrent);
        this.drawTopraklamaSymbols(ctx, _pipesCurrent);
        this.drawFloorCrossingMarkers(ctx, _pipesCurrent);
        this.drawComponents(ctx, _digerCurrent, manager);

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

            // Ghost preview: kat geçişlerinde işaretleyici + duvar geçişlerinde kırmızı (3D perspektif)
            if (_is3D) {
                const _geciciSlices = slicePipeAcrossFloors(geciciBoru, _floors).map(makeSlicedPipeProxy);
                if (_geciciSlices.length) {
                    this.drawFloorCrossingMarkers(ctx, _geciciSlices);
                }
                this.drawPipeWallCrossings(ctx, [geciciBoru], { isGhost: true });
            }
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
        // Ölçüler sadece aktif katın boruları için yazılır; diğer katlar sadece çizim olarak görünür
        if (showMeasurements && state.tempVisibility.showPlumbingDimensions) {
            this.drawPipeMeasurements(ctx, _pipesCurrent);
            if (geciciBoru) {
                this.drawTempPipeMeasurement(ctx, geciciBoru);
            }
        }


        // Nesne Etiketleri (boru/sayaç/vana/cihaz detay)
        if (!shouldBeFaded && state.tempVisibility.showObjectLabels) {
            this.drawObjectLabels(ctx, manager);
        }

        // --- YENİ EKLENEN KISIM: KOT YAZILARI ---
        // Boru köşe noktalarındaki h değerlerini çiz (3D modunda)
        if (state.tempVisibility.showZElevation) {
            this.drawPipeElevations(ctx, _pipesCurrent);
        }

        // Canlı hat (iç tesisat) başlangıç noktası kot etiketi
        if (!shouldBeFaded) {
            this.drawCanliHatKotu(ctx, manager);
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

        // Ölçü girişi göstergesi (boru çizim modu)
        if (manager.interactionManager?.measurementActive) {
            this.drawMeasurementInput(ctx, manager.interactionManager);
        }

        // Seçili boru yeniden boyutlandırma girişi
        if (manager.interactionManager?.pipeResizeActive) {
            this.drawPipeResizeInput(ctx, manager.interactionManager);
        }

        // Boru uç noktası snap guide çizgileri
        if (manager.interactionManager?.pipeEndpointSnapLock) {
            this.drawPipeEndpointSnapGuides(ctx, manager.interactionManager);
        }

        // Pipe splitting preview (boru tool aktif, hover)
        if (manager.interactionManager?.pipeSplitPreview) {
            this.drawPipeSplitPreview(ctx, manager.interactionManager.pipeSplitPreview);
        }

        // Hat ucu hover göstergesi (seçim modu, fareyle uç yakalama)
        if (manager.interactionManager?.hoveredPipeEndpoint) {
            this.drawPipeEndpointHover(ctx, manager.interactionManager.hoveredPipeEndpoint);
        }

        // Vana preview (vana tool aktif, hover)
        if (manager.interactionManager?.vanaPreview) {
            this.drawVanaPreview(ctx, manager.interactionManager.vanaPreview);
        }

        // Regülatör preview (regulator tool aktif, hover)
        if (manager.interactionManager?.regulatorPreview) {
            this.drawRegulatorPreview(ctx, manager.interactionManager.regulatorPreview);
        }

        // Sayaç/Cihaz boru üzerine ekleme preview (sayac/cihaz tool aktif, hover)
        if (manager.interactionManager?.componentOnPipePreview) {
            this.drawComponentOnPipePreview(ctx, manager.interactionManager.componentOnPipePreview);
        }

        // Copy/Paste Preview (CTRL+C veya CTRL+X sonrası)
        if (manager.interactionManager && (manager.interactionManager.copiedPipes || manager.interactionManager.cutPipes)) {
            this.drawPastePreview(ctx, manager.interactionManager);
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
Object.assign(PlumbingRenderer.prototype, LabelMixin);
Object.assign(PlumbingRenderer.prototype, EnclosureMixin);
