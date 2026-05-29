/**
 * Pointer Down Handler
 * Mouse tıklama işlemlerini yönetir
 */

import { screenToWorld } from '../draw/geometry.js';
import { dom, state } from '../general-files/main.js';
import { BAGLANTI_TIPLERI } from '../plumbing_v2/objects/pipe.js';
import { TESISAT_CONSTANTS } from '../plumbing_v2/interactions/tesisat-snap.js';
import { pixelsToWorld, findGizmoAxisAt, findTranslateGizmoAxisAt, findBoruGovdeAt } from '../plumbing_v2/interactions/finders.js';
import { getFloorAtElevation } from '../floor/floor-handler.js';

// YENİ IMPORT: 3D hesaplama fonksiyonu
import { calculate3DSnap } from '../plumbing_v2/interactions/pipe-drawing.js';
import { hitTestLabel, startLabelDrag, rotateLabelDir } from '../plumbing_v2/renderer/renderer-labels.js';
import { maybeShowQuickActionButton, hideQuickActionButton } from '../plumbing_v2/interactions/quick-action-button.js';

/**
 * 3D perspektif modda bir boruya tıklandığında, tıklama noktasının
 * borunun hangi Z kotuna (elevation) denk geldiğini hesaplayıp o kata ait floorId'yi döndürür.
 * Renderer projeksiyonu: screenX = x + z*t, screenY = y - z*t (t = viewBlendFactor)
 */
function _computeFloorIdFromPipeClick(pipe, clickPoint, t) {
    if (!pipe || !pipe.p1 || !pipe.p2) return null;
    const p1 = pipe.p1, p2 = pipe.p2;
    const z1 = p1.z || 0, z2 = p2.z || 0;

    const p1sx = p1.x + z1 * t;
    const p1sy = p1.y - z1 * t;
    const p2sx = p2.x + z2 * t;
    const p2sy = p2.y - z2 * t;

    const dx = p2sx - p1sx;
    const dy = p2sy - p1sy;
    const lenSq = dx * dx + dy * dy;
    let u = 0.5;
    if (lenSq > 0.0001) {
        u = ((clickPoint.x - p1sx) * dx + (clickPoint.y - p1sy) * dy) / lenSq;
        if (u < 0) u = 0;
        if (u > 1) u = 1;
    }
    const clickedZ = z1 + u * (z2 - z1);
    const floor = getFloorAtElevation(clickedZ);
    return floor ? floor.id : null;
}

export function handlePointerDown(e) {
    const rect = dom.c2d.getBoundingClientRect();
    const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const isDblClick = (e.detail || 0) >= 2;
    const selectOpts = { openPanel: isDblClick };

    // Snap point varsa kullan, yoksa normal point
    let targetPoint = this.activeSnap
        ? { x: this.activeSnap.x, y: this.activeSnap.y, z: this.activeSnap.z }
        : point;

    // --- DÜZELTME BAŞLANGIÇ ---
    // Boru çizim modundaysa:
    if (this.boruCizimAktif && this.boruBaslangic) {
        // Tıklanan noktayı 3D kurallarına (ve Z yüksekliğine) göre düzelt
        targetPoint = calculate3DSnap(this, targetPoint, e.shiftKey);

        // 2D modunda (t < 0.5) Z'yi korumak için ekstra güvenlik
        const t = state.viewBlendFactor || 0;
        if (t < 0.5 && this.boruBaslangic.nokta) {
            const startZ = this.boruBaslangic.nokta.z || 0;
            targetPoint.z = startZ;
        }
    }
    // --- DÜZELTME BİTİŞ ---

    /* ESKİ HATALI KOD: Bu blok Z'yi zorla başlangıç Z'sine eşitliyordu,
       Shift ile verilen yüksekliği eziyordu. KALDIRILDI.
    if (this.boruCizimAktif && this.boruBaslangic && this.boruBaslangic.nokta) {
        const startZ = this.boruBaslangic.nokta.z || 0;
        targetPoint = { ...targetPoint, z: startZ };
    }
    */

    //console.log('[POINTER DOWN] activeTool:', this.manager.activeTool, 'tempComponent:', this.manager.tempComponent?.type);

    // ─── Yapıştırma modu ─────────────────────────────────────────────────
    // Snap noktası varsa (mouse hareket'te yakalanan): SNAP NOKTASINA yapıştır.
    //   - endpoint → o boru ucuna bağla
    //   - body     → o noktada boruyu BÖL, yeni uca yapıştır (T-bağlantı)
    //   - corner   → duvar köşesine bırak (boru bağlantısı yok)
    // Snap yoksa: serbest yapıştır (mouse noktasında, bağlantı yok).
    if (e.button === 0 && (this.cutPipes || this.copiedPipes) && !this.boruCizimAktif && !this.manager.activeTool) {
        const snap = this.pasteSnapPoint;

        // Yapıştırma yalnızca mevcut bir tesisata bağlanırsa yapılır.
        // Snap yoksa veya çakışma varsa: tıklamayı yut, paste modunu koru,
        // kullanıcı geçerli bir noktaya yaklaşıp tekrar tıklasın.
        if (!snap || snap.hasConflict || !snap.pipeId) {
            return true;
        }

        let pasteX = snap.x;
        let pasteY = snap.y;
        let pasteZ = snap.z || 0;
        let snapPipeId = null;
        let snapType = 'free';

        if (snap.type === 'body' && snap.pipeId) {
            // Boruyu split point'te böl, sonra yeni uca yapıştır
            const pipe = this.manager.findPipeById(snap.pipeId);
            if (pipe) {
                const originalPipeId = pipe.id;
                this.handlePipeSplit(pipe, { x: pasteX, y: pasteY, z: pasteZ }, false);
                const TOL_PT = 0.5;
                const newBoru1 = this.manager.pipes.find(p =>
                    p.id !== originalPipeId &&
                    Math.hypot(p.p2.x - pasteX, p.p2.y - pasteY, (p.p2.z || 0) - pasteZ) < TOL_PT
                );
                if (newBoru1) {
                    snapPipeId = newBoru1.id;
                    snapType = 'endpoint';
                }
            }
        } else if ((snap.type === 'endpoint' || snap.type === 'corner') && snap.pipeId) {
            snapPipeId = snap.pipeId;
            snapType = 'endpoint';
        } else {
            snapType = snap.type;
        }

        this._pasteSnapOverride = {
            x: pasteX, y: pasteY, z: pasteZ,
            snapPipeId,
            snapType
        };
        this.handlePipePaste();
        this._pasteSnapOverride = null;
        this.pasteSnapPoint = null;
        return true;
    }
    // ─────────────────────────────────────────────────────────────────────

    // Sol/sağ tık önce mevcut hızlı eylem butonunu kapatır; pipe seçildiğinde
    // aşağıda yeniden gösterilecek. Middle button (pan) butonu yerinde bırakır.
    if (e.button === 0 || e.button === 2) hideQuickActionButton();

    // Double-click detection
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - this.lastClickTime;
    const isDoubleClick = timeSinceLastClick < this.DOUBLE_CLICK_THRESHOLD &&
        this.lastClickPoint &&
        Math.hypot(point.x - this.lastClickPoint.x, point.y - this.lastClickPoint.y) < this.DOUBLE_CLICK_DISTANCE;

    // Baca çift tıklama - split işlemi
    if (isDoubleClick && !this.boruCizimAktif && !this.manager.activeTool) {
        // Bacaları kontrol et
        const bacalar = this.manager.components.filter(c => c.type === 'baca' && !c.isDrawing);
        for (const baca of bacalar) {
            if (baca.containsPoint(point)) {
                const splitResult = baca.splitAt(point);
                if (splitResult) {
                    // Bölünen noktayı seç (drag için hazır)
                    this.isDragging = true;
                    this.dragObject = baca;
                    this.dragStart = { ...splitResult.splitPoint };
                    this.dragBacaEndpoint = {
                        segmentIndex: splitResult.newSegmentIndex,
                        endpoint: 'start'
                    };
                    this.lastClickTime = 0; // Reset double-click
                    return true;
                }
            }
        }
    }

    // Boru çift tıklama - split işlemi (yeni hat çizmeden, sadece böl)
    // Hat çizimi sırasında dokunarak bölmeyle aynı semantik, ama çizim başlatmaz.
    if (isDoubleClick && !this.boruCizimAktif && !this.manager.activeTool) {
        const splitTolerance = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
        const hit = this.findBoruGovdeAt(point, splitTolerance);
        if (hit) {
            const pipe = this.manager.findPipeById(hit.boruId);
            // Uç noktaya çok yakınsa bölme — normal seçim akışına bırak
            const CORNER = 0.5;
            const nearP1 = Math.hypot(
                hit.nokta.x - pipe.p1.x,
                hit.nokta.y - pipe.p1.y,
                (hit.nokta.z || 0) - (pipe.p1.z || 0)
            ) < CORNER;
            const nearP2 = Math.hypot(
                hit.nokta.x - pipe.p2.x,
                hit.nokta.y - pipe.p2.y,
                (hit.nokta.z || 0) - (pipe.p2.z || 0)
            ) < CORNER;
            if (pipe && !nearP1 && !nearP2) {
                this.handlePipeSplit(pipe, hit.nokta, false);
                this.lastClickTime = 0; // Reset double-click
                return true;
            }
        }
    }

    // Click time ve point'i kaydet
    this.lastClickTime = currentTime;
    this.lastClickPoint = { ...point };

    // 0.4 Vana ekleme - Vana tool aktif ve preview var
    if (this.manager.activeTool === 'vana' && !this.boruCizimAktif && this.vanaPreview) {
        this.handleVanaPlacement(this.vanaPreview);
        return true;
    }

    // 0.4b Regülatör ekleme - Regülatör tool aktif ve preview var
    if (this.manager.activeTool === 'regulator' && !this.boruCizimAktif && this.regulatorPreview) {
        this.handleRegulatorPlacement(this.regulatorPreview);
        return true;
    }

    // 0.4c Tesisat aksesuarı ekleme - Filtre / İzolasyon Flanşı / Kompansatör / Manometre
    if (!this.boruCizimAktif && this.fittingPreview &&
        (this.manager.activeTool === 'filtre' || this.manager.activeTool === 'izolasyon_flansi' ||
         this.manager.activeTool === 'kompansator' || this.manager.activeTool === 'manometre' ||
         this.manager.activeTool === 'topraklama')) {
        this.handleFittingPlacement(this.fittingPreview);
        return true;
    }

    // 0.5 Pipe splitting - Boru tool aktif ama çizim modu değil
    if (this.manager.activeTool === 'boru' && !this.boruCizimAktif && this.pipeSplitPreview) {
        this.handlePipeSplit(this.pipeSplitPreview.pipe, this.pipeSplitPreview.point);
        return true;
    }

    // 0.6 Sayaç/Cihaz boru üzerine ekleme - Sayaç/Cihaz tool aktif ve boru preview var
    if ((this.manager.activeTool === 'sayac' || this.manager.activeTool === 'cihaz') &&
        this.componentOnPipePreview && this.manager.tempComponent) {
        this.handleComponentOnPipePlacement(
            this.componentOnPipePreview.pipe,
            this.componentOnPipePreview.point,
            this.componentOnPipePreview.componentType
        );
        return true;
    }

    // 1. Boru çizim modunda tıklama
    if (this.boruCizimAktif) {
        this.handleBoruClick(targetPoint);
        return true;
    }

    // 1.5. İç tesisat sayaç yerleştirme - ikinci nokta tıklaması
    if (this.meterPlacementState === 'drawing_start_pipe' && this.meterStartPoint) {
        const endPoint = this.meterPreviewEndPoint || targetPoint;
        this.handleMeterStartPipeSecondClick(endPoint);
        return true;
    }

    // 2. Yerleştirme modu (ghost var ve araç aktif)
    if (this.manager.activeTool && this.manager.tempComponent) {
        this.placeComponent(targetPoint);
        return true;
    }

    // 3. Nesne seçimi ve sürükleme - SEÇ, TESİSAT VE KARMA MODLARINDA
    const isSelectionMode = state.currentMode === 'select' ||
        state.currentMode === 'plumbingV2' ||
        state.currentMode === 'MİMARİ-TESİSAT';

    if (isSelectionMode) {
        // Önce seçili nesnenin döndürme tutamacını kontrol et
        if (this.selectedObject && (this.selectedObject.type === 'servis_kutusu' || this.selectedObject.type === 'cihaz' || this.selectedObject.type === 'sayac')) {
            if (this.findRotationHandleAt(this.selectedObject, point, 12)) {
                this.startRotation(this.selectedObject, point);
                return true;
            }
        }

        // --- GİZMO EKSENİNE TIKLAMA KONTROLÜ ---
        if (this.selectedObject && !this.isDragging) {
            if (this.selectedObject.type === 'boru') {
                // Endpoint seçiliyse sadece o gizmo'yu kontrol et
                if (this.selectedEndpoint) {
                    const gizmoCenter = this.selectedEndpoint === 'p1' ? this.selectedObject.p1 : this.selectedObject.p2;
                    const allowedAxes = ['X', 'Y', 'Z'];
                    const clickedAxis = findTranslateGizmoAxisAt(gizmoCenter, point, allowedAxes);

                    if (clickedAxis) {
                        this.startEndpointDrag(this.selectedObject, this.selectedEndpoint, point);
                        this.selectedDragAxis = clickedAxis;
                        this.axisLockDetermined = true;
                        this.lockedAxis = clickedAxis;
                        return true;
                    }
                } else {
                    // Boru gövdesi seçili: mouse'un bulunduğu yüzdelik dilime göre
                    // sadece AKTİF gizmo'ya tıklanabilir (p1 ≤25%, p2 ≥75%, ortada center).
                    const activeGizmo = this.activePipeGizmo || 'center';

                    // Borunun uzandığı eksen — center için izinli eksenler
                    const dx = Math.abs(this.selectedObject.p2.x - this.selectedObject.p1.x);
                    const dy = Math.abs(this.selectedObject.p2.y - this.selectedObject.p1.y);
                    const dz = Math.abs((this.selectedObject.p2.z || 0) - (this.selectedObject.p1.z || 0));

                    let bodyAllowedAxes = ['X', 'Y', 'Z'];
                    if (dx > dy && dx > dz) {
                        bodyAllowedAxes = ['Y', 'Z'];
                    } else if (dy > dx && dy > dz) {
                        bodyAllowedAxes = ['X', 'Z'];
                    } else if (dz > dx && dz > dy) {
                        bodyAllowedAxes = ['X', 'Y'];
                    }

                    if (activeGizmo === 'p1') {
                        const p1Axis = findTranslateGizmoAxisAt(this.selectedObject.p1, point, ['X', 'Y', 'Z']);
                        if (p1Axis) {
                            this.selectedEndpoint = 'p1';
                            this.startEndpointDrag(this.selectedObject, 'p1', point);
                            this.selectedDragAxis = p1Axis;
                            this.axisLockDetermined = true;
                            this.lockedAxis = p1Axis;
                            return true;
                        }
                    } else if (activeGizmo === 'p2') {
                        const p2Axis = findTranslateGizmoAxisAt(this.selectedObject.p2, point, ['X', 'Y', 'Z']);
                        if (p2Axis) {
                            this.selectedEndpoint = 'p2';
                            this.startEndpointDrag(this.selectedObject, 'p2', point);
                            this.selectedDragAxis = p2Axis;
                            this.axisLockDetermined = true;
                            this.lockedAxis = p2Axis;
                            return true;
                        }
                    } else {
                        const centerPoint = {
                            x: (this.selectedObject.p1.x + this.selectedObject.p2.x) / 2,
                            y: (this.selectedObject.p1.y + this.selectedObject.p2.y) / 2,
                            z: ((this.selectedObject.p1.z || 0) + (this.selectedObject.p2.z || 0)) / 2
                        };
                        const centerAxis = findTranslateGizmoAxisAt(centerPoint, point, bodyAllowedAxes);
                        if (centerAxis) {
                            this.startBodyDrag(this.selectedObject, point);
                            this.selectedDragAxis = centerAxis;
                            this.axisLockDetermined = true;
                            this.lockedAxis = centerAxis;
                            return true;
                        }
                    }
                }
            } else if (this.selectedObject.type === 'vana' || this.selectedObject.type === 'regulator' ||
                       this.selectedObject.type === 'sayac' || this.selectedObject.type === 'cihaz' ||
                       this.selectedObject.type === 'servis_kutusu' ||
                       this.selectedObject.type === 'filtre' || this.selectedObject.type === 'izolasyon_flansi' ||
                       this.selectedObject.type === 'kompansator' || this.selectedObject.type === 'manometre' ||
                       this.selectedObject.type === 'topraklama') {
                const gizmoCenter = { x: this.selectedObject.x, y: this.selectedObject.y, z: this.selectedObject.z || 0 };
                const clickedAxis = findTranslateGizmoAxisAt(gizmoCenter, point, ['X', 'Y', 'Z']);

                if (clickedAxis) {
                    this.startDrag(this.selectedObject, point);
                    this.selectedDragAxis = clickedAxis;
                    this.axisLockDetermined = true;
                    this.lockedAxis = clickedAxis;
                    return true;
                }
            }
        }

        // --- ETIKET SÜRÜKLEME / ÇİFT TIKLA YÖN DEĞİŞTİRME / TIKLA SEÇ KONTROLÜ ---
        if (state.tempVisibility.showObjectLabels) {
            const labelId = hitTestLabel(point.x, point.y);
            if (labelId) {
                if (isDoubleClick) {
                    rotateLabelDir(labelId);
                    this.lastClickTime = 0;
                    return true;
                }
                // Cihaz/Sayaç/Servis kutusu/Vana/Regülatör/Hat etiketi: sürüklemeyi hemen başlatma.
                // Pointer hareketsiz bırakılırsa nesneyi seç (hat etiketinde tüm hattı),
                // eşik aşılırsa etiket sürüklemesine geç.
                const labelObj =
                    this.manager.components.find(c => c.id === labelId &&
                        (c.type === 'cihaz' || c.type === 'sayac' || c.type === 'servis_kutusu'
                            || c.type === 'vana' || c.type === 'regulator'
                            || c.type === 'filtre' || c.type === 'izolasyon_flansi'
                            || c.type === 'kompansator' || c.type === 'manometre'
                            || c.type === 'topraklama')) ||
                    this.manager.pipes.find(p => p.id === labelId);
                if (labelObj) {
                    this._pendingLabelClick = { id: labelId, sx: point.x, sy: point.y, obj: labelObj };
                    this.isDraggingLabel = true;
                    return true;
                }
                startLabelDrag(labelId, point.x, point.y);
                this.isDraggingLabel = true;
                return true;
            }
        }

        // --- DÜŞEY BORU SEMBOLÜ ÖNCELİKLİ KONTROLÜ (yalnızca 2D / hafif blend) ---
        // 2D'de düşey hat sembolü (çember+ok) komponentlerle çakıştığında bile
        // boru öncelikli yakalanmalı. 3D / ağır blend'de ise farenin altında ne
        // varsa o seçilsin — bu yüzden burada erken yakalama yapılmaz; seçim
        // findObjectAt'taki en-yakın-aday mantığına bırakılır.
        const _vbfEarly = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);
        if (_vbfEarly < 0.5 && (!this.manager.activeTool || this.manager.activeTool !== 'boru')) {
            const verticalToleranceEarly = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
            const verticalSymbolEarly = this.manager.interactionManager.findVerticalPipeSymbolAt(point, verticalToleranceEarly);
            if (verticalSymbolEarly) {
                const pipe = verticalSymbolEarly.pipe;
                this.selectObject(pipe, selectOpts);
                // Doğrudan gövdeden sürükleme: ALT ile (taşıma) veya CTRL ile (kopya)
                if (e.altKey || e.ctrlKey) this.startBodyDrag(pipe, point);
                maybeShowQuickActionButton(this, point, pipe);
                return true;
            }
        }

        // Vana seçimi: vana.containsPoint çok geniş tolerance kullanıyor (22×28 cm).
        // Bunun yerine vana hit-test'i de findObjectAt'in hassas lokal-frame
        // kontrolüne bırakılır (görsel 9.6×9.6 cm bowtie'a sıkı oturtuldu).
        // selectObject zaten obj.type === 'vana' için selectedValve'ı senkronlar.

        // --- SAYAÇ KONTROLÜ ---
        if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
            const blendT = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);
            const clickedMeter = this.manager.components.find(c => {
                if (c.type !== 'sayac' || !c.containsPoint) return false;
                // 3D blend modunda Z offset'ini geri alarak world koordinatına çevir
                const cz = (c.z || 0) * blendT;
                const localPoint = { x: point.x - cz, y: point.y + cz };
                return c.containsPoint(localPoint);
            });
            if (clickedMeter) {
                const cikisNoktasi = clickedMeter.getCikisNoktasi();
                this.startBoruCizim(cikisNoktasi, clickedMeter.id, BAGLANTI_TIPLERI.SAYAC);
                return true;
            }
        }

        // --- SERVİS KUTUSU KONTROLÜ ---
        if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
            const blendT = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);
            const clickedBox = this.manager.components.find(c => {
                if (c.type !== 'servis_kutusu' || !c.containsPoint) return false;
                const cz = (c.z || 0) * blendT;
                const localPoint = { x: point.x - cz, y: point.y + cz };
                return c.containsPoint(localPoint);
            });
            if (clickedBox) {
                const cikisNoktasi = clickedBox.getCikisNoktasi();
                this.startBoruCizim(cikisNoktasi, clickedBox.id, BAGLANTI_TIPLERI.SERVIS_KUTUSU);
                return true;
            }
        }

        const worldTolerance = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);

        // --- DÜŞEY BORU SEMBOLü KONTROLÜ (2D modunda) ---
        const verticalSymbol = this.manager.interactionManager.findVerticalPipeSymbolAt(point, worldTolerance);
        if (verticalSymbol) {
            const pipe = verticalSymbol.pipe;
            this.selectObject(pipe, selectOpts);
            // Doğrudan gövdeden sürükleme: ALT ile (taşıma) veya CTRL ile (kopya)
            if (e.altKey || e.ctrlKey) this.startBodyDrag(pipe, point);
            maybeShowQuickActionButton(this, point, pipe);
            return true;
        }

        // Baca endpoint
        const bacalar = this.manager.components.filter(c => c.type === 'baca' && c.isSelected);
        for (const baca of bacalar) {
            const endpoint = baca.findNearestEndpoint(point, worldTolerance);
            if (endpoint) {
                this.isDragging = true;
                this.dragObject = baca;
                this.dragStart = { ...point };
                this.dragBacaEndpoint = endpoint;
                return true;
            }
        }

        // --- BORU ARACI AKTİF: uçtan yeni hat çizimi başlat ---
        // Bu yalnızca aktif çizim akışı içindir; SEÇİM modunda uç-nokta gövdeye
        // göre öncelikli OLMAMALI (komponentler/borular findObjectAt ile değerlendirilir).
        if (this.manager.activeTool === 'boru') {
            const preferredPipeId = (this.selectedObject?.type === 'boru') ? this.selectedObject.id : null;
            const boruUcu = this.findBoruUcuAt(point, worldTolerance, false, preferredPipeId);
            if (boruUcu) {
                const pipe = this.manager.pipes.find(p => p.id === boruUcu.boruId);
                if (pipe) {
                    const deviceVar = this.hasDeviceAtEndpoint(pipe.id, boruUcu.uc);
                    const meterVar = this.hasMeterAtEndpoint(pipe.id, boruUcu.uc);
                    if (deviceVar || meterVar) return true;
                    const ucNokta = boruUcu.uc === 'p1' ? pipe.p1 : pipe.p2;
                    this.startBoruCizim(ucNokta, pipe.id, BAGLANTI_TIPLERI.BORU);
                    return true;
                }
            }
        }

        // --- SEÇİLİ BORU UCU ÖNCELİĞİ ---
        // Vanaların ~8cm hit-area'sı uç noktayı örtebiliyor. Boru zaten seçiliyken
        // kullanıcının uçtan tutma niyetini koru: tek tıkta uca yakın (≤10px) ise
        // findObjectAt'a girmeden endpoint dragı başlat. Çift tıkta atla — vana
        // paneli vs. açılabilsin.
        if (!isDblClick && !isDoubleClick && this.selectedObject?.type === 'boru') {
            const selPipe = this.selectedObject;
            const t3d = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);
            const sp1x = selPipe.p1.x + (selPipe.p1.z || 0) * t3d;
            const sp1y = selPipe.p1.y - (selPipe.p1.z || 0) * t3d;
            const sp2x = selPipe.p2.x + (selPipe.p2.z || 0) * t3d;
            const sp2y = selPipe.p2.y - (selPipe.p2.z || 0) * t3d;
            const d1 = Math.hypot(point.x - sp1x, point.y - sp1y);
            const d2 = Math.hypot(point.x - sp2x, point.y - sp2y);
            // Vana hit-area'sı uçtan ~4-12 cm aralığında. Priority'nin bu bandı
            // tamamen örtmesi için min 12 cm world tutuyoruz; yüksek zoom'da
            // pixelsToWorld küçülse de minimum sabit kalır.
            const endpointPriorityTol = Math.max(pixelsToWorld(12), 12);
            if (d1 < endpointPriorityTol && d1 <= d2) {
                this.selectedEndpoint = 'p1';
                this.startEndpointDrag(selPipe, 'p1', point);
                return true;
            }
            if (d2 < endpointPriorityTol) {
                this.selectedEndpoint = 'p2';
                this.startEndpointDrag(selPipe, 'p2', point);
                return true;
            }
        }

        // --- 3D HASSAS SEÇİM ---
        // findObjectAt komponent ve boru adaylarını birlikte sıralar; fareye en
        // yakın çizilen objeyi seçer. Tesisat uç noktası artık komponent gövdesinin
        // önüne geçmez — sayaca tıklandığında sayaç, boruya tıklandığında boru seçilir.
        const hitObject = this.findObjectAt(point);
        if (hitObject) {
            let selectOptsForHit = selectOpts;
            if (hitObject.type === 'boru') {
                const vbf = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);
                if (vbf >= 0.5) {
                    const pFloorId = _computeFloorIdFromPipeClick(hitObject, point, vbf);
                    if (pFloorId) selectOptsForHit = { ...(selectOpts || {}), preferredFloorId: pFloorId };
                }
            }
            this.selectObject(hitObject, selectOptsForHit);

            if (hitObject.type === 'boru') {
                const pipe = hitObject;
                maybeShowQuickActionButton(this, point, pipe);
                const bagliKutu = this.manager.components.find(c =>
                    c.type === 'servis_kutusu' && c.bagliBoruId === pipe.id
                );
                if (bagliKutu) return true;
                if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC ||
                    pipe.bitisBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
                    return true;
                }

                // Uca çok yakın tıklamada (≤6 px) endpoint sürüklemesi — findObjectAt
                // burada komponent döndürmediği için uçta komponent yok demektir, bu
                // yüzden güvenli. Aksi durumda endpoint manipülasyonu gizmo okları
                // üzerinden yapılır (boru seçili → mouse uca yaklaşınca p1/p2 gizmo
                // otomatik aktifleşir).
                const t3d = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);
                const p1sx = pipe.p1.x + (pipe.p1.z || 0) * t3d;
                const p1sy = pipe.p1.y - (pipe.p1.z || 0) * t3d;
                const p2sx = pipe.p2.x + (pipe.p2.z || 0) * t3d;
                const p2sy = pipe.p2.y - (pipe.p2.z || 0) * t3d;
                const d1 = Math.hypot(point.x - p1sx, point.y - p1sy);
                const d2 = Math.hypot(point.x - p2sx, point.y - p2sy);
                const endpointPxTolerance = pixelsToWorld(6);
                if (d1 < endpointPxTolerance && d1 <= d2) {
                    this.selectedEndpoint = 'p1';
                    this.startEndpointDrag(pipe, 'p1', point);
                    return true;
                }
                if (d2 < endpointPxTolerance) {
                    this.selectedEndpoint = 'p2';
                    this.startEndpointDrag(pipe, 'p2', point);
                    return true;
                }

                if (e.altKey || e.ctrlKey) this.startBodyDrag(pipe, point);
            } else {
                this.startDrag(hitObject, point);
            }
            return true;
        }
    }

    if (isSelectionMode) {
        this.deselectObject();
        return false;
    }

    // 4. Bileşen çıkış noktasından çizim başlat
    const bilesenCikis = this.findBilesenCikisAt(point);
    if (bilesenCikis) {
        const baglantiTip = bilesenCikis.tip === 'servis_kutusu'
            ? BAGLANTI_TIPLERI.SERVIS_KUTUSU
            : bilesenCikis.tip === 'sayac'
                ? BAGLANTI_TIPLERI.SAYAC
                : BAGLANTI_TIPLERI.BORU;
        this.startBoruCizim(bilesenCikis.nokta, bilesenCikis.bilesenId, baglantiTip);
        return true;
    }

    // 5. Boru ucu veya gövdesinden çizim başlat
    const worldTolerance2 = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
    // Seçili boru varsa onu tercih et
    const preferredPipeId2 = (this.selectedObject?.type === 'boru') ? this.selectedObject.id : null;
    const boruUcu2 = this.findBoruUcuAt(point, worldTolerance2, false, preferredPipeId2);
    if (boruUcu2) {
        const deviceVar = this.hasDeviceAtEndpoint(boruUcu2.boruId, boruUcu2.uc);
        const meterVar = this.hasMeterAtEndpoint(boruUcu2.boruId, boruUcu2.uc);
        if (deviceVar || meterVar) {
            return true;
        }
        this.startBoruCizim(boruUcu2.nokta, boruUcu2.boruId, BAGLANTI_TIPLERI.BORU);
        return true;
    }

    const worldTolerance3 = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
    const boruGovde = this.findBoruGovdeAt(point, worldTolerance3);
    if (boruGovde) {
        this.startBoruCizim(boruGovde.nokta, boruGovde.boruId, BAGLANTI_TIPLERI.BORU);
        return true;
    }

    this.deselectObject();
    return false;
}