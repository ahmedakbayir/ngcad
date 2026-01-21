/**
 * Interaction Manager (v2) - Refactored
 * Kullanıcı etkileşimlerini yönetir - modüler yapı
 */

import { TesisatSnapSystem } from './tesisat-snap.js';

// Pointer handlers
import { handlePointerMove } from '../../pointer/handle-pointer-move.js';
import { handlePointerDown } from '../../pointer/handle-pointer-down.js';
import { handlePointerUp } from '../../pointer/handle-pointer-up.js';

// Keyboard handler
import { handleKeyDown, toggleVerticalPanel, closeVerticalPanel, applyVerticalHeight } from './keyboard-handler.js';

// Ghost updater
import { updateGhostPosition } from './ghost-updater.js';

// Placement handlers
import {
    placeComponent,
    restorePreviousMode,
    handleVanaPlacement,
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

// Tool modları
export const TESISAT_MODLARI = {
    NONE: null,
    SERVIS_KUTUSU: 'servis_kutusu',
    BORU: 'boru',
    SAYAC: 'sayac',
    VANA: 'vana',
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

        // Ölçü girişi
        this.measurementInput = '';
        this.measurementActive = false;
        this.isVerticalMeasurement = false;  // +/- ile düşey ölçüm modu

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

        // Sayaç/Cihaz boru üzerine ekleme preview (sayac/cihaz tool aktif)
        this.componentOnPipePreview = null; // { pipe, point, componentType }

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

        // Double-click detection
        this.lastClickTime = 0;
        this.lastClickPoint = null;
        this.DOUBLE_CLICK_THRESHOLD = 300; // ms
        this.DOUBLE_CLICK_DISTANCE = 10; // world units
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
    toggleVerticalPanel() {
        return toggleVerticalPanel.call(this);
    }

    closeVerticalPanel() {
        return closeVerticalPanel.call(this);
    }

    applyVerticalHeight() {
        return applyVerticalHeight.call(this);
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

    handleDrag(point) {
        return handleDrag(this, point);
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
    selectObject(obj) {
        return selectObject(this, obj);
    }

    selectValve(pipe, vana) {
        return selectValve(this, pipe, vana);
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

    findBoruUcuAt(point, tolerance = 5, onlyFreeEndpoints = false) {
        return findBoruUcuAt(this.manager, point, tolerance, onlyFreeEndpoints);
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
