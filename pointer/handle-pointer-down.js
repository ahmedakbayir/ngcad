/**
 * Pointer Down Handler
 * Mouse tıklama işlemlerini yönetir
 */

import { screenToWorld } from '../draw/geometry.js';
import { dom, state } from '../general-files/main.js';
import { BAGLANTI_TIPLERI } from '../plumbing_v2/objects/pipe.js';
import { TESISAT_CONSTANTS } from '../plumbing_v2/interactions/tesisat-snap.js';
import { pixelsToWorld, findGizmoAxisAt, findTranslateGizmoAxisAt } from '../plumbing_v2/interactions/finders.js';

// YENİ IMPORT: 3D hesaplama fonksiyonu
import { calculate3DSnap } from '../plumbing_v2/interactions/pipe-drawing.js';

export function handlePointerDown(e) {
    const rect = dom.c2d.getBoundingClientRect();
    const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

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
                    console.log('✂️ Baca bölündü:', splitResult);
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

    // Click time ve point'i kaydet
    this.lastClickTime = currentTime;
    this.lastClickPoint = { ...point };

    // 0.4 Vana ekleme - Vana tool aktif ve preview var
    if (this.manager.activeTool === 'vana' && !this.boruCizimAktif && this.vanaPreview) {
        this.handleVanaPlacement(this.vanaPreview);
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
                        console.log('🎯 Endpoint gizmo eksenine tıklandı:', clickedAxis);
                        this.startEndpointDrag(this.selectedObject, this.selectedEndpoint, point);
                        this.selectedDragAxis = clickedAxis;
                        this.axisLockDetermined = true;
                        this.lockedAxis = clickedAxis;
                        return true;
                    }
                } else {
                    // Boru gövdesi seçili: önce endpoint gizmo'larını kontrol et, sonra merkez

                    // Borunun uzandığı ekseni hesapla
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

                    // p1 gizmo kontrolü (öncelikli)
                    const p1Axis = findTranslateGizmoAxisAt(this.selectedObject.p1, point, ['X', 'Y', 'Z']);
                    if (p1Axis) {
                        console.log('🎯 P1 endpoint gizmo eksenine tıklandı:', p1Axis);
                        this.selectedEndpoint = 'p1'; // Endpoint bilgisini kaydet
                        this.startEndpointDrag(this.selectedObject, 'p1', point);
                        this.selectedDragAxis = p1Axis;
                        this.axisLockDetermined = true;
                        this.lockedAxis = p1Axis;
                        return true;
                    }

                    // p2 gizmo kontrolü
                    const p2Axis = findTranslateGizmoAxisAt(this.selectedObject.p2, point, ['X', 'Y', 'Z']);
                    if (p2Axis) {
                        console.log('🎯 P2 endpoint gizmo eksenine tıklandı:', p2Axis);
                        this.selectedEndpoint = 'p2'; // Endpoint bilgisini kaydet
                        this.startEndpointDrag(this.selectedObject, 'p2', point);
                        this.selectedDragAxis = p2Axis;
                        this.axisLockDetermined = true;
                        this.lockedAxis = p2Axis;
                        return true;
                    }

                    // Merkez gizmo kontrolü (en düşük öncelik)
                    const centerPoint = {
                        x: (this.selectedObject.p1.x + this.selectedObject.p2.x) / 2,
                        y: (this.selectedObject.p1.y + this.selectedObject.p2.y) / 2,
                        z: ((this.selectedObject.p1.z || 0) + (this.selectedObject.p2.z || 0)) / 2
                    };
                    const centerAxis = findTranslateGizmoAxisAt(centerPoint, point, bodyAllowedAxes);
                    if (centerAxis) {
                        console.log('🎯 Merkez (body) gizmo eksenine tıklandı:', centerAxis);
                        this.startBodyDrag(this.selectedObject, point);
                        this.selectedDragAxis = centerAxis;
                        this.axisLockDetermined = true;
                        this.lockedAxis = centerAxis;
                        return true;
                    }
                }
            } else if (this.selectedObject.type === 'vana' || this.selectedObject.type === 'sayac' ||
                       this.selectedObject.type === 'cihaz' || this.selectedObject.type === 'servis_kutusu') {
                const gizmoCenter = { x: this.selectedObject.x, y: this.selectedObject.y, z: this.selectedObject.z || 0 };
                const clickedAxis = findTranslateGizmoAxisAt(gizmoCenter, point, ['X', 'Y', 'Z']);

                if (clickedAxis) {
                    console.log('🎯 Gizmo eksenine tıklandı:', clickedAxis);
                    this.startDrag(this.selectedObject, point);
                    this.selectedDragAxis = clickedAxis;
                    this.axisLockDetermined = true;
                    this.lockedAxis = clickedAxis;
                    return true;
                }
            }
        }

        // --- VANA KONTROLÜ ---
        const clickedValve = this.manager.components.find(c => c.type === 'vana' && c.containsPoint(point));
        if (clickedValve) {
            const pipe = clickedValve.bagliBoruId ? this.manager.pipes.find(p => p.id === clickedValve.bagliBoruId) : null;
            this.selectValve(pipe, clickedValve);
            this.startDrag(clickedValve, point);
            return true;
        }

        // --- SAYAÇ KONTROLÜ ---
        if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
            const clickedMeter = this.manager.components.find(c =>
                c.type === 'sayac' && c.containsPoint && c.containsPoint(point)
            );
            if (clickedMeter) {
                const cikisNoktasi = clickedMeter.getCikisNoktasi();
                this.startBoruCizim(cikisNoktasi, clickedMeter.id, BAGLANTI_TIPLERI.SAYAC);
                return true;
            }
        }

        // --- SERVİS KUTUSU KONTROLÜ ---
        if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
            const clickedBox = this.manager.components.find(c =>
                c.type === 'servis_kutusu' && c.containsPoint && c.containsPoint(point)
            );
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
            this.selectObject(pipe);
            // Düşey boruları BODY olarak taşı (zincir halindeki tüm düşey borularla birlikte)
            this.startBodyDrag(pipe, point);
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

        // Boru ucu
        // Eğer zaten bir boru seçiliyse, ortak noktalarda o boruyu tercih et
        const preferredPipeId = (this.selectedObject?.type === 'boru') ? this.selectedObject.id : null;
        const boruUcu = this.findBoruUcuAt(point, worldTolerance, false, preferredPipeId);
        if (boruUcu) {
            const pipe = this.manager.pipes.find(p => p.id === boruUcu.boruId);
            if (pipe) {
                if (this.manager.activeTool === 'boru') {
                    const deviceVar = this.hasDeviceAtEndpoint(pipe.id, boruUcu.uc);
                    const meterVar = this.hasMeterAtEndpoint(pipe.id, boruUcu.uc);
                    if (deviceVar || meterVar) {
                        console.warn("🚫 Bu uçta Cihaz/Sayaç fleksi var! Tesisat devam ettirilemez.");
                        return true;
                    }
                    const ucNokta = boruUcu.uc === 'p1' ? pipe.p1 : pipe.p2;
                    this.startBoruCizim(ucNokta, pipe.id, BAGLANTI_TIPLERI.BORU);
                    return true;
                }

                const ucBaglanti = boruUcu.uc === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
                if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU || ucBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                    this.selectObject(pipe);
                    return true;
                }

                this.selectObject(pipe);
                this.selectedEndpoint = boruUcu.uc; // Endpoint bilgisini kaydet
                this.startEndpointDrag(pipe, boruUcu.uc, point);
                return true;
            }
        }

        // Nesne seçimi
        const hitObject = this.findObjectAt(point);
        if (hitObject) {
            this.selectObject(hitObject);
            if (hitObject.type === 'boru') {
                const bagliKutu = this.manager.components.find(c =>
                    c.type === 'servis_kutusu' && c.bagliBoruId === hitObject.id
                );
                if (bagliKutu) return true;
                if (hitObject.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC ||
                    hitObject.bitisBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
                    return true;
                }
                this.startBodyDrag(hitObject, point);
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
            console.warn("🚫 Bu uçta Cihaz/Sayaç fleksi var! Tesisat devam ettirilemez.");
            return true;
        }
        this.startBoruCizim(boruUcu2.nokta, boruUcu2.boruId, BAGLANTI_TIPLERI.BORU);
        return true;
    }

    const bodyTolerance = pixelsToWorld(TESISAT_CONSTANTS.PIPE_BODY_TOLERANCE_PIXELS);
    const boruGovde = this.findBoruGovdeAt(point, bodyTolerance);
    if (boruGovde) {
        this.startBoruCizim(boruGovde.nokta, boruGovde.boruId, BAGLANTI_TIPLERI.BORU);
        return true;
    }

    this.deselectObject();
    return false;
}