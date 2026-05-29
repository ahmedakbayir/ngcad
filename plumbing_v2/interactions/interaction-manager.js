/**
 * Interaction Manager (v2) - Refactored
 * Kullanıcı etkileşimlerini yönetir - modüler yapı
 */

import { TesisatSnapSystem } from './tesisat-snap.js';
import { state } from '../../general-files/main.js';

// Pointer handlers
import { handlePointerMove } from '../../pointer/handle-pointer-move.js';
import { handlePointerDown } from '../../pointer/handle-pointer-down.js';
import { handlePointerUp } from '../../pointer/handle-pointer-up.js';

// Keyboard handler
import { handleKeyDown, toggleVerticalPanel, closeVerticalPanel, applyVerticalHeight, applyPipeResize, handlePipePaste } from './keyboard-handler.js';

// Ghost updater
import { updateGhostPosition } from './ghost-updater.js';

// Placement handlers
import {
    placeComponent,
    restorePreviousMode,
    handleVanaPlacement,
    handleRegulatorPlacement,
    handleFittingPlacement,
    handleComponentOnPipePlacement,
    handleSayacEndPlacement,
    handleCihazEkleme,
    handleMeterStartPipeSecondClick
} from './component-placement.js';

// Pipe drawing handlers
import {
    startBoruCizim,
    handlePipeSplit,
    handleBoruClick,
    applyMeasurement,
    cancelCurrentAction,
    hasServisKutusu,
    getGeciciBoruCizgisi
} from './pipe-drawing.js';

// Drag handlers
import {
    startEndpointDrag,
    startDrag,
    startBodyDrag,
    handleDrag,
    endDrag
} from './drag-handler.js';

// Rotation handlers
import {
    findRotationHandleAt,
    startRotation,
    handleRotation,
    endRotation,
    updateConnectedPipe
} from './rotation-handler.js';

// Selection handlers
import {
    selectObject,
    selectValve,
    selectHat,
    deselectObject,
    deleteSelectedObject
} from './selection-manager.js';

// Finder/helper methods
import {
    findObjectAt,
    isFreeEndpoint,
    hasDeviceAtEndpoint,
    hasMeterAtEndpoint,
    hasAncestorMeter,
    findBoruUcuAt,
    findBoruGovdeAt,
    findPipeAt,
    findBilesenCikisAt,
    checkVanaAtPoint,
    findPipeEndpoint,
    removeObject,
    findConnectedPipesChain,
    findVerticalPipeSymbolAt,
    findVerticalPipeChain
} from './finders.js';

/**
 * İki 2D segmentin GERÇEK kesişimini kontrol eder (paylaşılan uç noktalar hariç).
 */
function _segmentsProperlyIntersect2D(a1, a2, b1, b2) {
    const EPSILON = 1.5; // cm — paylaşılan uç nokta toleransı
    if (Math.hypot(a1.x - b1.x, a1.y - b1.y) < EPSILON) return false;
    if (Math.hypot(a1.x - b2.x, a1.y - b2.y) < EPSILON) return false;
    if (Math.hypot(a2.x - b1.x, a2.y - b1.y) < EPSILON) return false;
    if (Math.hypot(a2.x - b2.x, a2.y - b2.y) < EPSILON) return false;

    const cross = (o, a, b) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);

    return (d1 * d2 < 0 && d3 * d4 < 0);
}

/**
 * İki 3D segmentin aynı yol üzerinde örtüşüp örtüşmediğini kontrol eder.
 * (Birebir aynı boru — kopya üstüne yapıştırma tespiti)
 */
function _segmentsCollinearOverlap3D(a1, a2, b1, b2) {
    const EPSILON = 5; // cm
    const adx = a2.x - a1.x, ady = a2.y - a1.y, adz = (a2.z || 0) - (a1.z || 0);
    const aLen = Math.hypot(adx, ady, adz);
    if (aLen < 0.001) return false;

    // B'nin her iki ucu A'nın doğrusu üzerinde mi?
    const onLine = (pt) => {
        const t = ((pt.x - a1.x) * adx + (pt.y - a1.y) * ady + ((pt.z || 0) - (a1.z || 0)) * adz) / (aLen * aLen);
        const cx = a1.x + t * adx, cy = a1.y + t * ady, cz = (a1.z || 0) + t * adz;
        return Math.hypot(pt.x - cx, pt.y - cy, (pt.z || 0) - cz) < EPSILON;
    };
    if (!onLine(b1) || !onLine(b2)) return false;

    // T parametrelerini hesapla; örtüşme aralığı [0,1] ile kesişiyor mu?
    const tb1 = ((b1.x - a1.x) * adx + (b1.y - a1.y) * ady + ((b1.z || 0) - (a1.z || 0)) * adz) / (aLen * aLen);
    const tb2 = ((b2.x - a1.x) * adx + (b2.y - a1.y) * ady + ((b2.z || 0) - (a1.z || 0)) * adz) / (aLen * aLen);
    const tMin = Math.min(tb1, tb2), tMax = Math.max(tb1, tb2);
    return tMax > 0.05 && tMin < 0.95;
}

/**
 * 3D farkında çakışma kontrolü:
 * – Collinear örtüşme (birebir aynı hat) her zaman çakışmadır.
 * – 2D kesişme yalnızca aynı Z seviyesindeyse çakışmadır;
 *   farklı katlarda çapraz geçen borular çakışmaz.
 */
function _segmentsConflict3D(np1, np2, eq1, eq2) {
    // Önce collinear örtüşme kontrolü
    if (_segmentsCollinearOverlap3D(np1, np2, eq1, eq2)) return true;

    // 2D kesişme: Z seviyeleri yeterince yakınsa çakışmadır
    const zMidNew = ((np1.z || 0) + (np2.z || 0)) / 2;
    const zMidEx  = ((eq1.z || 0) + (eq2.z || 0)) / 2;
    if (Math.abs(zMidNew - zMidEx) > 50) return false; // Farklı kot — çakışma yok

    return _segmentsProperlyIntersect2D(np1, np2, eq1, eq2);
}

// Tool modları
export const TESISAT_MODLARI = {
    NONE: null,
    SERVIS_KUTUSU: 'servis_kutusu',
    BORU: 'boru',
    SAYAC: 'sayac',
    VANA: 'vana',
    REGULATOR: 'regulator',
    FILTRE: 'filtre',
    IZOLASYON_FLANSI: 'izolasyon_flansi',
    KOMPANSATOR: 'kompansator',
    MANOMETRE: 'manometre',
    TOPRAKLAMA: 'topraklama',
    CIHAZ: 'cihaz',
    BACA: 'baca'
};

export class InteractionManager {
    constructor(manager) {
        this.manager = manager;
        this.snapSystem = new TesisatSnapSystem(manager);
        this.activeSnap = null;

        // Son bilinen mouse pozisyonu (world koordinatlarında)
        this.lastMousePoint = null;

        // Boru çizim durumu
        this.boruCizimAktif = false;
        this.boruBaslangic = null;
        this.geciciBoruBitis = null;

        // Ölçü girişi (boru çizim modu)
        this.measurementInput = '';
        this.measurementActive = false;
        this.isVerticalMeasurement = false;  // +/- ile düşey ölçüm modu

        // Seçili boru yeniden boyutlandırma
        this.pipeResizeInput = '';
        this.pipeResizeActive = false;

        // Düşey (vertical) mod durumu
        this.verticalModeActive = false;  // TAB ile panel açıkken true
        this.verticalHeightInput = 0;     // Girilen yükseklik değeri (cm)
        this.verticalQuickValues = [5, 10, 30, 100];  // Hızlı değerler

        // Sürükleme durumu
        this.isDragging = false;
        this.dragStart = null;
        this.dragObject = null;

        // Döndürme durumu
        this.isRotating = false;
        this.rotationOffset = 0;

        // Seçili nesne
        this.selectedObject = null;
        this.selectedValve = null; // { pipe, vana }
        this.axisSnapMode = null; // 'X', 'Y', 'Z' veya null
        this.axisSnapPoint = null; // Snaplanan nokta koordinatı
        // Boru uç noktası snap lock (duvar node snap gibi)
        this.pipeEndpointSnapLock = null;
        this.pipeSnapMouseStart = null; // Snap başladığı andaki mouse pozisyonu

        // Pipe splitting preview (boru tool aktif, boruCizimAktif değil)
        this.pipeSplitPreview = null; // { pipe, point }

        // Vana preview (vana tool aktif)
        this.vanaPreview = null; // { pipe, point, t, snapToEnd }

        // Regülatör preview (regulator tool aktif)
        this.regulatorPreview = null; // { pipe, point, t }

        // Tesisat aksesuarı preview (filtre/izolasyon flanşı/kompansatör/manometre tool aktif)
        this.fittingPreview = null; // { pipe, point, t, snapToEnd, fittingType }

        // Sayaç/Cihaz boru üzerine ekleme preview (sayac/cihaz tool aktif)
        this.componentOnPipePreview = null; // { pipe, point, componentType }

        // Hat ucu / kesişim hover göstergesi (seçim modu, fareyle uç yakalama)
        this.hoveredPipeEndpoint = null; // { boruId, uc, nokta, isFree }

        // İç tesisat (servis kutusu olmadan) sayaç yerleştirme durumu
        this.meterPlacementState = null; // null, 'drawing_start_pipe'
        this.meterStartPoint = null; // Kesikli borunun başlangıç noktası
        this.meterPreviewEndPoint = null; // Preview için geçici bitiş noktası

        // Previous mode tracking (for restore)
        this.previousMode = null;
        this.previousDrawingMode = null;
        this.previousActiveTool = null;

        // Drag state
        this.dragEndpoint = null;
        this.isBodyDrag = false;
        this.dragAxis = null;
        this.dragAxisPoint = null;
        this.connectedPipeAtP1 = null;
        this.connectedPipeAtP2 = null;
        this.endpointConnections = null; // Endpoint sürükleme için bağlı borular snapshot'i
        this.useBridgeMode = false;
        this.dragStartObjectPos = null;
        this.axisLockDetermined = false;
        this.lockedAxis = null;

        // Koordinat gizmo için seçili eksen (X, Y, Z veya null)
        this.selectedDragAxis = null;

        // Gizmo hover durumu (mouse gizmo ekseninin üzerindeyken)
        this.hoveredGizmoAxis = null;

        // Seçili boru üzerinde mouse hangi yüzdelik dilimde:
        // 'p1' (≤25%), 'center' (25-75%), 'p2' (≥75%) — sadece ilgili gizmo gösterilir
        this.activePipeGizmo = 'center';

        // Boru gövde taşıması için ana eksen (X, Y, Z)
        this.bodyDragPrimaryAxis = null;

        // Double-click detection
        this.lastClickTime = 0;
        this.lastClickPoint = null;
        this.DOUBLE_CLICK_THRESHOLD = 300; // ms
        this.DOUBLE_CLICK_DISTANCE = 10; // world units

        // Copy/Paste/Cut state
        this.copiedPipes = null; // Kopyalanan pipe'lar ve bileşenler
        this.cutPipes = null; // Kesilen pipe'lar ve bileşenler
        this.cutPipesOriginalIds = null; // Kesilen pipe'ların orijinal ID'leri
        this.pastePreviewPipes = null; // Yapıştırma preview'ı
        this.pastePreviewComponents = null; // Yapıştırma preview bileşenleri
        this.pasteSnapPoint = null; // Aktif yapıştırma snap noktası { x, y, z, type, hasConflict }
    }

    /**
     * Yapıştırma modu için en yakın geçerli snap noktasını bul.
     * Hem uç noktalara hem boru gövdesine yapıştırılabilir.
     * Kes modunda kesilen boruların orijinal konumları hariç tutulur.
     * Kesişim varsa hasConflict=true döner.
     */
    _findPasteSnapPoint(point) {
        const pasteData = this.cutPipes || this.copiedPipes;
        if (!pasteData) return null;

        const isCut = !!this.cutPipes;
        const isSayacPaste = pasteData.pasteMode === 'sayac';
        const excludeIds = isCut
            ? new Set(this.cutPipesOriginalIds?.pipeIds || [])
            : new Set();

        // 3D modda borular Z değerlerine göre kaydırılmış görünür:
        // Dünya noktası (wx, wy, wz) canvas'ta (wx + wz*t, wy - wz*t) konumunda çizilir.
        // screenToWorld() bu kaydırımı zaten tersine çevirir, bu yüzden
        // mouse `point` ile pipe endpoint'lerini karşılaştırırken pipe endpoint'lerini
        // aynı projeksiyon uzayına taşımamız gerekir.
        const t3d = state.viewBlendFactor || 0;

        const TOLERANCE = 20; // cm — snap yakalama mesafesi
        const CORNER_TOLERANCE = 10; // cm — dirsek/TE köşelerine snap için sıkı tolerans
        let best = null;
        let bestDist = TOLERANCE;

        // Köşe (dirsek/TE) tespiti: 2+ boru ucunun aynı (x,y,z)'de buluştuğu noktalar.
        // Mouse 10cm içindeyse bu noktalar diğer endpoint/body snap'lerinin önüne geçer.
        const cornerMap = new Map();
        for (const pipe of this.manager.pipes) {
            if (excludeIds.has(pipe.id)) continue;
            for (const ep of [pipe.p1, pipe.p2]) {
                const key = `${Math.round(ep.x * 2)}|${Math.round(ep.y * 2)}|${Math.round((ep.z || 0) * 2)}`;
                let entry = cornerMap.get(key);
                if (!entry) {
                    entry = { x: ep.x, y: ep.y, z: ep.z || 0, pipeIds: [] };
                    cornerMap.set(key, entry);
                }
                entry.pipeIds.push(pipe.id);
            }
        }
        let bestCornerDist = CORNER_TOLERANCE;
        let bestCorner = null;
        for (const corner of cornerMap.values()) {
            if (corner.pipeIds.length < 2) continue; // dirsek/TE değil → atla
            const cpx = corner.x + corner.z * t3d;
            const cpy = corner.y - corner.z * t3d;
            const d = Math.hypot(point.x - cpx, point.y - cpy);
            if (d < bestCornerDist) {
                bestCornerDist = d;
                bestCorner = { x: corner.x, y: corner.y, z: corner.z, type: 'corner', pipeId: corner.pipeIds[0] };
            }
        }

        for (const pipe of this.manager.pipes) {
            if (excludeIds.has(pipe.id)) continue;

            const z1 = pipe.p1.z || 0;
            const z2 = pipe.p2.z || 0;

            // P1 uç noktası — Z offsetiyle projekte edilmiş konum
            const p1px = pipe.p1.x + z1 * t3d;
            const p1py = pipe.p1.y - z1 * t3d;
            const d1 = Math.hypot(point.x - p1px, point.y - p1py);
            if (d1 < bestDist) {
                bestDist = d1;
                best = { x: pipe.p1.x, y: pipe.p1.y, z: z1, type: 'endpoint', pipeId: pipe.id };
            }

            // P2 uç noktası — Z offsetiyle projekte edilmiş konum
            const p2px = pipe.p2.x + z2 * t3d;
            const p2py = pipe.p2.y - z2 * t3d;
            const d2 = Math.hypot(point.x - p2px, point.y - p2py);
            if (d2 < bestDist) {
                bestDist = d2;
                best = { x: pipe.p2.x, y: pipe.p2.y, z: z2, type: 'endpoint', pipeId: pipe.id };
            }

            // Gövde üzeri (projeksiyon) — uçlardan %5 uzakta kalmak şartıyla
            // Gövde proyeksiyonunu da 3D offsetiyle hesapla
            const ddx = p2px - p1px;
            const ddy = p2py - p1py;
            const len2 = ddx * ddx + ddy * ddy;
            if (len2 > 0.01) {
                const tBody = ((point.x - p1px) * ddx + (point.y - p1py) * ddy) / len2;
                if (tBody > 0.05 && tBody < 0.95) {
                    const projX = pipe.p1.x + tBody * (pipe.p2.x - pipe.p1.x);
                    const projY = pipe.p1.y + tBody * (pipe.p2.y - pipe.p1.y);
                    const projZ = z1 + tBody * (z2 - z1);
                    const spx  = projX + projZ * t3d;
                    const spy  = projY - projZ * t3d;
                    const dist = Math.hypot(point.x - spx, point.y - spy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = { x: projX, y: projY, z: projZ, type: 'body', pipeId: pipe.id };
                    }
                }
            }
        }

        // Köşe (dirsek/TE) bulunduysa diğer snap'lerin önüne geç — kullanıcı
        // mouse 10cm içindeyse köşeyi tercih etsin (yakın bir gövde noktası
        // matematiksel olarak daha yakın olsa bile).
        if (bestCorner) {
            best = bestCorner;
        }

        if (!best) return null;

        // Sayaç-paste: yalnızca serbest boru ucu kabul edilir
        // (body, corner veya dolu uç → snap iptal, kullanıcı geçerli uca yaklaşsın).
        if (isSayacPaste) {
            if (best.type !== 'endpoint' || !best.pipeId) return null;
            const tPipe = this.manager.pipes.find(p => p.id === best.pipeId);
            if (!tPipe) return null;
            const isP1 = Math.hypot(tPipe.p1.x - best.x, tPipe.p1.y - best.y, (tPipe.p1.z || 0) - best.z) < 0.5;
            const tUc = isP1 ? 'p1' : 'p2';
            const tBag = tUc === 'p1' ? tPipe.baslangicBaglanti : tPipe.bitisBaglanti;
            if (tBag && tBag.hedefId) return null;
            const tPt = tUc === 'p1' ? tPipe.p1 : tPipe.p2;
            if (!this.manager.isTrulyFreeEndpoint(tPt, 1)) return null;
            if (this.hasMeterAtEndpoint(tPipe.id, tUc)) return null;
            if (this.hasDeviceAtEndpoint && this.hasDeviceAtEndpoint(tPipe.id, tUc)) return null;
            best.targetEnd = tUc;
        }

        // Kesişim kontrolü: yapıştırılacak borular mevcut borularla çakışıyor mu?
        const ddx = best.x - (pasteData.referencePoint.x);
        const ddy = best.y - (pasteData.referencePoint.y);
        const ddz = best.z - (pasteData.referencePoint.z || 0);

        let hasConflict = false;
        outer: for (const pipeData of pasteData.pipes) {
            const np1 = { x: pipeData.p1.x + ddx, y: pipeData.p1.y + ddy, z: (pipeData.p1.z || 0) + ddz };
            const np2 = { x: pipeData.p2.x + ddx, y: pipeData.p2.y + ddy, z: (pipeData.p2.z || 0) + ddz };

            for (const existing of this.manager.pipes) {
                if (excludeIds.has(existing.id)) continue;
                if (_segmentsConflict3D(np1, np2, existing.p1, existing.p2)) {
                    hasConflict = true;
                    break outer;
                }
            }
        }

        best.hasConflict = hasConflict;
        return best;
    }

    /**
     * Pointer handlers
     */
    handlePointerMove(e) {
        return handlePointerMove.call(this, e);
    }

    handlePointerDown(e) {
        return handlePointerDown.call(this, e);
    }

    handlePointerUp(e) {
        return handlePointerUp.call(this, e);
    }

    /**
     * Keyboard handler
     */
    handleKeyDown(e) {
        return handleKeyDown.call(this, e);
    }

    /**
     * Düşey panel yönetimi
     */
    toggleVerticalPanel(opts) {
        return toggleVerticalPanel.call(this, opts);
    }

    closeVerticalPanel() {
        return closeVerticalPanel.call(this);
    }

    applyVerticalHeight() {
        return applyVerticalHeight.call(this);
    }

    handlePipePaste() {
        return handlePipePaste.call(this);
    }

    /**
     * Ghost updater
     */
    updateGhostPosition(ghost, point, snap) {
        return updateGhostPosition.call(this, ghost, point, snap);
    }

    /**
     * Placement handlers
     */
    placeComponent(point) {
        return placeComponent.call(this, point);
    }

    restorePreviousMode(prevMode, prevDrawMode, prevTool) {
        return restorePreviousMode.call(this, prevMode, prevDrawMode, prevTool);
    }

    handleVanaPlacement(vanaPreview) {
        return handleVanaPlacement.call(this, vanaPreview);
    }

    handleRegulatorPlacement(regulatorPreview, options) {
        return handleRegulatorPlacement.call(this, regulatorPreview, options);
    }

    handleFittingPlacement(fittingPreview) {
        return handleFittingPlacement.call(this, fittingPreview);
    }

    handleComponentOnPipePlacement(pipe, splitPoint, componentType) {
        return handleComponentOnPipePlacement.call(this, pipe, splitPoint, componentType);
    }

    handleSayacEndPlacement(meter) {
        return handleSayacEndPlacement.call(this, meter);
    }

    handleCihazEkleme(cihaz) {
        return handleCihazEkleme.call(this, cihaz);
    }

    handleMeterStartPipeSecondClick(endPoint) {
        return handleMeterStartPipeSecondClick.call(this, endPoint);
    }

    /**
     * Pipe drawing handlers
     */
    startBoruCizim(baslangicNoktasi, kaynakId = null, kaynakTip = null, colorGroup = null) {
        return startBoruCizim(this, baslangicNoktasi, kaynakId, kaynakTip, colorGroup);
    }

    handlePipeSplit(pipe, splitPoint, startDrawing = true) {
        return handlePipeSplit(this, pipe, splitPoint, startDrawing);
    }

    handleBoruClick(point) {
        return handleBoruClick(this, point);
    }

    applyMeasurement() {
        return applyMeasurement(this);
    }

    cancelCurrentAction() {
        return cancelCurrentAction(this);
    }

    hasServisKutusu() {
        return hasServisKutusu(this);
    }

    getGeciciBoruCizgisi() {
        return getGeciciBoruCizgisi(this);
    }

    /**
     * Drag handlers
     */
    startEndpointDrag(pipe, endpoint, point) {
        return startEndpointDrag(this, pipe, endpoint, point);
    }

    startDrag(obj, point) {
        return startDrag(this, obj, point);
    }

    startBodyDrag(pipe, point) {
        return startBodyDrag(this, pipe, point);
    }

    handleDrag(point, event) { // <-- DÜZELTME: event parametresi eklendi
        return handleDrag(this, point, event);
    }

    endDrag() {
        return endDrag(this);
    }

    /**
     * Rotation handlers
     */
    findRotationHandleAt(obj, point, tolerance = 8) {
        return findRotationHandleAt(obj, point, tolerance);
    }

    startRotation(obj, point) {
        return startRotation(this, obj, point, this.manager);
    }

    handleRotation(point) {
        return handleRotation(this, point, this.manager);
    }

    endRotation() {
        return endRotation(this, this.manager);
    }

    updateConnectedPipe(result) {
        return updateConnectedPipe(result, this.manager);
    }

    /**
     * Selection handlers
     */
    selectObject(obj, opts) {
        return selectObject(this, obj, opts);
    }

    selectValve(pipe, vana, opts) {
        return selectValve(this, pipe, vana, opts);
    }

    selectHat(pipe, opts) {
        return selectHat(this, pipe, opts);
    }

    deselectObject() {
        return deselectObject(this);
    }

    deleteSelectedObject() {
        return deleteSelectedObject(this);
    }

    /**
     * Finder/helper methods
     */
    findObjectAt(point) {
        return findObjectAt(this.manager, point);
    }

    isFreeEndpoint(point, tolerance = 5) {
        return isFreeEndpoint(this.manager, point, tolerance);
    }

    hasDeviceAtEndpoint(boruId, endpoint) {
        return hasDeviceAtEndpoint(this.manager, boruId, endpoint);
    }

    hasMeterAtEndpoint(boruId, endpoint) {
        return hasMeterAtEndpoint(this.manager, boruId, endpoint);
    }

    hasAncestorMeter(componentId, componentType) {
        return hasAncestorMeter(this.manager, componentId, componentType);
    }

    findBoruUcuAt(point, tolerance = 5, onlyFreeEndpoints = false, preferredPipeId = null) {
        return findBoruUcuAt(this.manager, point, tolerance, onlyFreeEndpoints, preferredPipeId);
    }

    findBoruGovdeAt(point, tolerance = 5) {
        return findBoruGovdeAt(this.manager, point, tolerance);
    }

    findPipeAt(point, tolerance = 2) {
        return findPipeAt(this.manager, point, tolerance);
    }

    findBoruGovdeAt(point, tolerance = 5) {
        return findBoruGovdeAt(this.manager, point, tolerance);
    }

    findBilesenCikisAt(point, tolerance = 2) {
        return findBilesenCikisAt(this.manager, point, tolerance);
    }

    checkVanaAtPoint(point, tolerance = 2) {
        return checkVanaAtPoint(this.manager, point, tolerance);
    }

    findPipeEndpoint(pipe, point) {
        return findPipeEndpoint(pipe, point);
    }

    removeObject(obj) {
        return removeObject(this.manager, obj);
    }

    findConnectedPipesChain(startPipe) {
        return findConnectedPipesChain(this.manager, startPipe);
    }

    findVerticalPipeSymbolAt(point, tolerance = 10) {
        return findVerticalPipeSymbolAt(this.manager, point, tolerance);
    }

    findVerticalPipeChain(basePipe) {
        return findVerticalPipeChain(this.manager, basePipe);
    }
}