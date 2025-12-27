/**
 * Interaction Manager (v2) - Refactored
 * Kullanıcı etkileşimlerini yönetir - modüler yapı
 */

import { TesisatSnapSystem } from './tesisat-snap.js';

// Pointer handlers
import { handlePointerMove } from './pointer/pointer-move.js';
import { handlePointerDown } from './pointer/pointer-down.js';
import { handlePointerUp } from './pointer/pointer-up.js';

// Keyboard handler
import { handleKeyDown } from './keyboard/keyboard-handler.js';

// Ghost updater
import { updateGhostPosition } from './ghost/ghost-updater.js';

// Placement handlers
import {
    placeComponent,
    restorePreviousMode,
    handleVanaPlacement,
    handleSayacEndPlacement,
    handleCihazEkleme,
    handleMeterStartPipeSecondClick
} from './placement/component-placement.js';

// Pipe drawing handlers
import {
    startBoruCizim,
    handlePipeSplit,
    handleBoruClick,
    applyMeasurement,
    cancelCurrentAction,
    hasServisKutusu,
    getGeciciBoruCizgisi
} from './pipe/pipe-drawing.js';

// Drag handlers
import {
    startEndpointDrag,
    startDrag,
    startBodyDrag,
    handleDrag,
    updateConnectedPipesChain,
    endDrag
} from './drag/drag-handler.js';

// Rotation handlers
import {
    findRotationHandleAt,
    startRotation,
    handleRotation,
    endRotation,
    updateConnectedPipe
} from './rotation/rotation-handler.js';

// Selection handlers
import {
    selectObject,
    selectValve,
    deselectObject,
    deleteSelectedObject
} from './selection/selection-manager.js';

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
    findConnectedPipesChain
} from './helpers/finders.js';

// Tool modları
export const TESISAT_MODLARI = {
    NONE: null,
    SERVIS_KUTUSU: 'servis_kutusu',
    BORU: 'boru',
    SAYAC: 'sayac',
    VANA: 'vana',
    CIHAZ: 'cihaz'
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

        // Boru uç noktası snap lock (duvar node snap gibi)
        this.pipeEndpointSnapLock = null;
        this.pipeSnapMouseStart = null; // Snap başladığı andaki mouse pozisyonu

        // Pipe splitting preview (boru tool aktif, boruCizimAktif değil)
        this.pipeSplitPreview = null; // { pipe, point }

        // Vana preview (vana tool aktif)
        this.vanaPreview = null; // { pipe, point, t, snapToEnd }

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
        this.useBridgeMode = false;
        this.dragStartObjectPos = null;
        this.axisLockDetermined = false;
        this.lockedAxis = null;
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
        return startBoruCizim.call(this, baslangicNoktasi, kaynakId, kaynakTip, colorGroup);
    }

    handlePipeSplit(pipe, splitPoint, startDrawing = true) {
        return handlePipeSplit.call(this, pipe, splitPoint, startDrawing);
    }

    handleBoruClick(point) {
        return handleBoruClick.call(this, point);
    }

    applyMeasurement() {
        return applyMeasurement.call(this);
    }

    cancelCurrentAction() {
        return cancelCurrentAction.call(this);
    }

    hasServisKutusu() {
        return hasServisKutusu.call(this);
    }

    getGeciciBoruCizgisi() {
        return getGeciciBoruCizgisi.call(this);
    }

    /**
     * Drag handlers
     */
    startEndpointDrag(pipe, endpoint, point) {
        return startEndpointDrag.call(this, pipe, endpoint, point);
    }

    startDrag(obj, point) {
        return startDrag.call(this, obj, point);
    }

    startBodyDrag(pipe, point) {
        return startBodyDrag.call(this, pipe, point);
    }

    handleDrag(point) {
        return handleDrag.call(this, point);
    }

    updateConnectedPipesChain(oldPoint, newPoint) {
        return updateConnectedPipesChain.call(this, oldPoint, newPoint);
    }

    endDrag() {
        return endDrag.call(this);
    }

    /**
     * Rotation handlers
     */
    findRotationHandleAt(obj, point, tolerance = 8) {
        return findRotationHandleAt.call(this, obj, point, tolerance);
    }

    startRotation(obj, point) {
        return startRotation.call(this, obj, point);
    }

    handleRotation(point) {
        return handleRotation.call(this, point);
    }

    endRotation() {
        return endRotation.call(this);
    }

    updateConnectedPipe(result) {
        return updateConnectedPipe.call(this, result);
    }

    /**
     * Selection handlers
     */
    selectObject(obj) {
        return selectObject.call(this, obj);
    }

    selectValve(pipe, vana) {
        return selectValve.call(this, pipe, vana);
    }

    deselectObject() {
        return deselectObject.call(this);
    }

    deleteSelectedObject() {
        return deleteSelectedObject.call(this);
    }

    /**
     * Finder/helper methods
     */
    findObjectAt(point) {
        return findObjectAt.call(this, point);
    }

    isFreeEndpoint(point, tolerance = 1) {
        return isFreeEndpoint.call(this, point, tolerance);
    }

    hasDeviceAtEndpoint(boruId, endpoint) {
        return hasDeviceAtEndpoint.call(this, boruId, endpoint);
    }

    hasMeterAtEndpoint(boruId, endpoint) {
        return hasMeterAtEndpoint.call(this, boruId, endpoint);
    }

    hasAncestorMeter(componentId, componentType) {
        return hasAncestorMeter.call(this, componentId, componentType);
    }

    findBoruUcuAt(point, tolerance = 5, onlyFreeEndpoints = false) {
        return findBoruUcuAt.call(this, point, tolerance, onlyFreeEndpoints);
    }

    findBoruGovdeAt(point, tolerance = 5) {
        return findBoruGovdeAt.call(this, point, tolerance);
    }

    findPipeAt(point, tolerance = 2) {
        return findPipeAt.call(this, point, tolerance);
    }

    findBilesenCikisAt(point, tolerance = 2) {
        return findBilesenCikisAt.call(this, point, tolerance);
    }

    checkVanaAtPoint(point, tolerance = 2) {
        return checkVanaAtPoint.call(this, point, tolerance);
    }

    findPipeEndpoint(pipe, point) {
        return findPipeEndpoint.call(this, pipe, point);
    }

    removeObject(obj) {
        return removeObject.call(this, obj);
    }

    findConnectedPipesChain(startPipe) {
        return findConnectedPipesChain.call(this, startPipe);
    }
}
