/**
 * Voice Command Manager (v2)
 * Sesli komut sistemi - adım yönetimi, komut yürütme, boru çizim entegrasyonu
 *
 * Yeni özellikler:
 * - İç tesisat (sayaçla başlama)
 * - Vana, sayaç, kombi, ocak ekleme
 * - 3D/2D görünüm geçişi
 * - Ölçü göster/gizle
 * - Toplu komut desteği (virgülle ayrılmış)
 * - Mesafesiz yön komutu (varsayılan mesafe)
 * - Herhangi bir adıma geri dönüp devam etme
 */

import { parseBatch, parseVoiceCommand, commandToText, directionToVector, VARSAYILAN_MESAFE } from './voice-command-parser.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { ServisKutusu } from '../plumbing_v2/objects/service-box.js';
import { createBoru, BAGLANTI_TIPLERI } from '../plumbing_v2/objects/pipe.js';
import { createVana } from '../plumbing_v2/objects/valve.js';
import { createSayac } from '../plumbing_v2/objects/meter.js';
import { createCihaz } from '../plumbing_v2/objects/device.js';
import { saveState } from '../general-files/history.js';
import { state, setState } from '../general-files/main.js';
import { toggle3DPerspective } from '../general-files/ui.js';
import { draw2D } from '../draw/draw2d.js';

/**
 * Tek bir adımı temsil eder
 */
class VoiceStep {
    constructor(stepNumber, command, startPoint, endPoint) {
        this.stepNumber = stepNumber;
        this.command = command;
        this.startPoint = startPoint ? { ...startPoint } : null;
        this.endPoint = endPoint ? { ...endPoint } : null;
        this.createdIds = [];
        this.active = true;
    }

    get text() {
        return commandToText(this.command);
    }
}

export class VoiceCommandManager {
    constructor() {
        this.steps = [];
        this.currentPosition = null;
        this.lastPipeId = null;
        this.lastComponentId = null;
        this.isActive = false;
        this.activeStepIndex = -1;

        this._listeners = {
            stepAdded: [],
            stepUpdated: [],
            stepsChanged: [],
            positionChanged: [],
            activated: [],
            deactivated: [],
            error: []
        };

        if (!window.voiceCommandManager) {
            window.voiceCommandManager = this;
        }
    }

    static getInstance() {
        return window.voiceCommandManager || new VoiceCommandManager();
    }

    // ───── OLAY SİSTEMİ ─────

    on(event, callback) {
        if (this._listeners[event]) this._listeners[event].push(callback);
    }

    off(event, callback) {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        }
    }

    _emit(event, data) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(cb => cb(data));
        }
    }

    // ───── AKTİVASYON ─────

    activate() {
        this.isActive = true;
        this._emit('activated');
    }

    deactivate() {
        this.isActive = false;
        this._emit('deactivated');
    }

    // ───── KOMUT İŞLEME ─────

    /**
     * Metin komutunu işle - toplu komut desteği ile.
     * Virgülle ayrılmış komutlar sırayla işlenir.
     * @param {string} text - Komut metni
     * @returns {object} Son komutun sonucu { success, message, step }
     */
    processCommand(text) {
        // Toplu komut ayrıştırma
        const commands = parseBatch(text);

        if (commands.length === 0) {
            const result = { success: false, message: `Tanınmayan komut: "${text}"` };
            this._emit('error', result);
            return result;
        }

        // Tek komut
        if (commands.length === 1) {
            return this._executeCommand(commands[0]);
        }

        // Toplu komut - hepsini sırayla çalıştır
        let lastResult = null;
        let successCount = 0;
        for (const cmd of commands) {
            lastResult = this._executeCommand(cmd);
            if (lastResult.success) successCount++;
        }

        if (successCount === commands.length) {
            return { success: true, message: `${successCount} komut başarıyla çalıştırıldı` };
        }
        return lastResult;
    }

    /**
     * Tek bir komutu yürüt
     */
    _executeCommand(cmd) {
        // Hareket/dallanma komutu öncesi: eğer currentPosition yoksa seçili nesneden devam et
        if (!this.currentPosition && (cmd.type === 'move' || cmd.type === 'branch' || cmd.type === 'add')) {
            this._tryInitFromSelection();
        }

        switch (cmd.type) {
            case 'place':
                return this._executePlaceCommand(cmd);
            case 'move':
                return this._executeMoveCommand(cmd);
            case 'branch':
                return this._executeBranchCommand(cmd);
            case 'add':
                return this._executeAddCommand(cmd);
            case 'view':
                return this._executeViewCommand(cmd);
            case 'goto':
                return this._executeGotoCommand(cmd);
            case 'undo':
                return this._executeUndoCommand();
            case 'finish':
                return this._executeFinishCommand();
            default:
                return { success: false, message: 'Bilinmeyen komut tipi' };
        }
    }

    /**
     * Seçili boru veya bileşenden devam etmeyi dene.
     * Kullanıcı bir boru/kutu/sayaç seçtiyse, onun ucundan devam eder.
     */
    _tryInitFromSelection() {
        const sel = state.selectedObject;
        if (!sel || !sel.object) return;

        const obj = sel.object;

        // Seçili nesne boru ise, bitiş ucundan (p2) devam et
        if (sel.type === 'pipe' && obj.p2) {
            this.currentPosition = { x: obj.p2.x, y: obj.p2.y, z: obj.p2.z || 0 };
            this.lastPipeId = obj.id;
            this.lastComponentId = null;
            return;
        }

        // Seçili nesne bileşen ise (servis kutusu, sayaç vs.) çıkış noktasından devam et
        if (obj.getCikisNoktasi) {
            const cikis = obj.getCikisNoktasi();
            this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
            this.lastComponentId = obj.id;
            this.lastPipeId = null;
            return;
        }

        // Nesnenin konumu varsa oradan devam et
        if (obj.x !== undefined && obj.y !== undefined) {
            this.currentPosition = { x: obj.x, y: obj.y, z: obj.z || 0 };
            this.lastComponentId = obj.id;
            this.lastPipeId = null;
        }
    }

    // ───── YERLEŞTIRME KOMUTLARI ─────

    /**
     * Servis kutusu veya iç tesisat (sayaç) yerleştir
     */
    _executePlaceCommand(cmd) {
        if (cmd.object === 'ic_tesisat') {
            return this._placeIcTesisat(cmd);
        }

        // Servis kutusu
        const existingSK = plumbingManager.components.find(c => c.type === 'servis_kutusu');
        if (existingSK) {
            return { success: false, message: 'Zaten bir servis kutusu mevcut.' };
        }

        saveState();

        const startX = state.panOffset ? -state.panOffset.x / state.zoom + 200 : 200;
        const startY = state.panOffset ? -state.panOffset.y / state.zoom + 400 : 400;

        const servisKutusu = new ServisKutusu(startX, startY, {
            floorId: state.currentFloor?.id
        });

        plumbingManager.components.push(servisKutusu);
        plumbingManager.saveToState();

        const cikis = servisKutusu.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = servisKutusu.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd,
            { x: startX, y: startY, z: 0 },
            { ...this.currentPosition }
        );
        step.createdIds.push(servisKutusu.id);

        return { success: true, message: `Servis kutusu yerleştirildi`, step };
    }

    /**
     * İç tesisat başlat - sayaçla başla (servis kutusu olmadan)
     */
    _placeIcTesisat(cmd) {
        saveState();

        const startX = state.panOffset ? -state.panOffset.x / state.zoom + 200 : 200;
        const startY = state.panOffset ? -state.panOffset.y / state.zoom + 400 : 400;

        const sayac = createSayac(startX, startY, {
            floorId: state.currentFloor?.id
        });

        plumbingManager.components.push(sayac);
        plumbingManager.saveToState();

        // Sayacın çıkış noktasını mevcut konum olarak ayarla
        const cikis = sayac.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = sayac.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd,
            { x: startX, y: startY, z: 0 },
            { ...this.currentPosition }
        );
        step.createdIds.push(sayac.id);

        return { success: true, message: `İç tesisat başlatıldı (sayaç yerleştirildi)`, step };
    }

    // ───── HAREKET KOMUTLARI ─────

    /**
     * Yön komutu → boru çiz
     */
    _executeMoveCommand(cmd) {
        if (!this.currentPosition) {
            return { success: false, message: 'Önce "servis kutusu koy" veya "iç tesisat başlat" deyin!' };
        }

        // Mesafe yoksa varsayılan mesafe kullan
        const distance = cmd.distance || VARSAYILAN_MESAFE;

        const vec = directionToVector(cmd.direction, distance);
        const startPt = { ...this.currentPosition };
        const endPt = {
            x: startPt.x + vec.dx,
            y: startPt.y + vec.dy,
            z: (startPt.z || 0) + vec.dz
        };

        saveState();

        const boru = createBoru(startPt, endPt, 'STANDART');
        boru.floorId = state.currentFloor?.id;
        boru.colorGroup = this._determineColorGroup();

        // Bağlantıları ayarla
        if (this.lastPipeId) {
            boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.BORU, this.lastPipeId);
            const prevPipe = plumbingManager.findPipeById(this.lastPipeId);
            if (prevPipe) {
                prevPipe.setBitisBaglanti(BAGLANTI_TIPLERI.BORU, boru.id);
            }
        } else if (this.lastComponentId) {
            const comp = plumbingManager.findComponentById(this.lastComponentId);
            if (comp && comp.type === 'servis_kutusu') {
                boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.SERVIS_KUTUSU, this.lastComponentId);
                comp.baglaBoru(boru.id);
            } else if (comp && comp.type === 'sayac') {
                boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.SAYAC, this.lastComponentId);
                if (comp.baglaCikis) comp.baglaCikis(boru.id);
            }
        }

        plumbingManager.pipes.push(boru);
        plumbingManager.saveToState();

        this.currentPosition = { ...endPt };
        this.lastPipeId = boru.id;

        const displayCmd = { ...cmd, distance }; // Adım metninde gerçek mesafeyi göster
        const step = this._addStep(displayCmd, startPt, endPt);
        step.createdIds.push(boru.id);

        return { success: true, message: `${commandToText(displayCmd)} - Boru çizildi`, step };
    }

    // ───── DALLANMA KOMUTLARI ─────

    /**
     * Hattın ortasından dallanma (T-bağlantı)
     * "hattın ortasından 100 ileri" → mevcut borunun ortasından yeni boru çiz
     */
    _executeBranchCommand(cmd) {
        const pipe = this._getLastPipe();
        if (!pipe) {
            return { success: false, message: 'Dallanma için önce boru çizin!' };
        }

        // Mesafe
        const distance = cmd.distance || VARSAYILAN_MESAFE;

        // Dallanma noktası (ortası = t:0.5)
        const t = 0.5;
        const branchPoint = pipe.getPointAt(t);

        const vec = directionToVector(cmd.direction, distance);
        const endPt = {
            x: branchPoint.x + vec.dx,
            y: branchPoint.y + vec.dy,
            z: (branchPoint.z || 0) + vec.dz
        };

        saveState();

        // Yeni boru oluştur (T-bağlantı)
        const boru = createBoru(branchPoint, endPt, 'STANDART');
        boru.floorId = state.currentFloor?.id;
        boru.colorGroup = this._determineColorGroup();

        // Ana boruya T-bağlantı ekle
        pipe.tBaglantiEkle(t, boru.id);

        // Yeni borunun başlangıcını ana boruya bağla
        boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.BORU, pipe.id);

        plumbingManager.pipes.push(boru);
        plumbingManager.saveToState();

        this.currentPosition = { ...endPt };
        this.lastPipeId = boru.id;

        const displayCmd = { ...cmd, distance };
        const step = this._addStep(displayCmd, { ...branchPoint }, endPt);
        step.createdIds.push(boru.id);

        return { success: true, message: `Ortadan ${distance} cm ${cmd.direction} - T-bağlantı`, step };
    }

    // ───── BİLEŞEN EKLEME KOMUTLARI ─────

    /**
     * Vana, sayaç, kombi veya ocak ekle
     */
    _executeAddCommand(cmd) {
        switch (cmd.object) {
            case 'vana':
                return this._addVana(cmd);
            case 'sayac':
                return this._addSayac(cmd);
            case 'kombi':
                return this._addCihaz(cmd, 'KOMBI');
            case 'ocak':
                return this._addCihaz(cmd, 'OCAK');
            default:
                return { success: false, message: `Bilinmeyen bileşen: ${cmd.object}` };
        }
    }

    /**
     * Son boruya vana ekle
     */
    _addVana(cmd) {
        const pipe = this._getLastPipe();
        if (!pipe) {
            return { success: false, message: 'Vana eklemek için önce boru çizin!' };
        }

        saveState();

        // Konum hesapla
        let t = 0.5; // Ortaya varsayılan
        let fromEnd = null;
        let fixedDistance = null;

        if (cmd.position === 'end') {
            t = 0.95;
            fromEnd = 'p2';
            fixedDistance = pipe.uzunluk * 0.05;
        } else if (cmd.position === 'start') {
            t = 0.05;
            fromEnd = 'p1';
            fixedDistance = pipe.uzunluk * 0.05;
        } else if (cmd.position === 'middle') {
            t = 0.5;
        } else if (cmd.position === 'offset' && cmd.offset) {
            const len = pipe.uzunluk;
            if (cmd.fromEnd === 'start') {
                t = Math.min(cmd.offset / len, 0.95);
                fromEnd = 'p1';
                fixedDistance = cmd.offset;
            } else {
                t = Math.max(1 - cmd.offset / len, 0.05);
                fromEnd = 'p2';
                fixedDistance = cmd.offset;
            }
        }

        // Vana konumunu hesapla
        const pos = pipe.getPointAt(t);

        const vana = createVana(pos.x, pos.y, 'AKV', {
            floorId: state.currentFloor?.id,
            bagliBoruId: pipe.id,
            boruPozisyonu: t
        });

        if (fromEnd) {
            vana.fromEnd = fromEnd;
            vana.fixedDistance = fixedDistance;
        }

        vana.z = pos.z || 0;
        vana.rotation = pipe.aciDerece;

        plumbingManager.components.push(vana);
        plumbingManager.saveToState();

        const step = this._addStep(cmd, { ...pos }, { ...this.currentPosition });
        step.createdIds.push(vana.id);

        return { success: true, message: `Vana eklendi (${cmd.position || 'son'})`, step };
    }

    /**
     * Sayaç ekle:
     * - Mevcut boru varsa: borunun ucuna doğrudan sayaç yerleştir
     * - Boru yoksa (bileşenden başlıyorsa): 100cm boru çiz + ucuna sayaç
     */
    _addSayac(cmd) {
        if (!this.currentPosition) {
            return { success: false, message: 'Sayaç eklemek için önce başlangıç konumu belirleyin!' };
        }

        const existingPipe = this._getLastPipe();

        // Mevcut boru varsa doğrudan ucuna sayaç ekle
        if (existingPipe) {
            return this._addSayacToPipeEnd(cmd, existingPipe);
        }

        // Boru yoksa (bileşenden başlıyorsa) önce 100cm boru çiz
        return this._addSayacWithPipe(cmd);
    }

    /**
     * Mevcut borunun ucuna doğrudan sayaç yerleştir
     */
    _addSayacToPipeEnd(cmd, pipe) {
        saveState();

        const endPt = pipe.p2;
        const startPt = { ...this.currentPosition };

        const sayac = createSayac(endPt.x + 30, endPt.y, {
            floorId: state.currentFloor?.id,
            z: endPt.z || 0
        });

        sayac.ghostConnectionInfo = {
            boruUcu: {
                boruId: pipe.id,
                boru: pipe,
                uc: 'p2',
                nokta: { x: endPt.x, y: endPt.y, z: endPt.z || 0 }
            }
        };

        const interactionMgr = plumbingManager.interactionManager;
        if (interactionMgr && interactionMgr.handleSayacEndPlacement) {
            const success = interactionMgr.handleSayacEndPlacement(sayac);
            if (success) {
                plumbingManager.saveToState();

                const cikis = sayac.getCikisNoktasi();
                this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
                this.lastComponentId = sayac.id;
                this.lastPipeId = null;

                const step = this._addStep(cmd, startPt, { ...this.currentPosition });
                step.createdIds.push(sayac.id);

                plumbingManager.updatePipeColorsAfterMeter(sayac.id);

                return { success: true, message: 'Sayaç eklendi', step };
            }
        }

        // Fallback: Manuel ekleme
        plumbingManager.components.push(sayac);
        plumbingManager.saveToState();

        const cikis = sayac.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = sayac.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd, startPt, { ...this.currentPosition });
        step.createdIds.push(sayac.id);

        return { success: true, message: 'Sayaç eklendi', step };
    }

    /**
     * Boru yokken: 100cm boru çiz + ucuna sayaç (iç tesisat başlatma senaryosu)
     */
    _addSayacWithPipe(cmd) {
        saveState();

        const SAYAC_BORU_MESAFE = 100;
        const startPt = { ...this.currentPosition };

        // Varsayılan yön: sağa
        const dx = 1, dy = 0, dz = 0;

        const endPt = {
            x: startPt.x + dx * SAYAC_BORU_MESAFE,
            y: startPt.y + dy * SAYAC_BORU_MESAFE,
            z: (startPt.z || 0) + dz * SAYAC_BORU_MESAFE
        };

        // Boru oluştur
        const boru = createBoru(startPt, endPt, 'STANDART');
        boru.floorId = state.currentFloor?.id;
        boru.colorGroup = this._determineColorGroup();

        if (this.lastComponentId) {
            const comp = plumbingManager.findComponentById(this.lastComponentId);
            if (comp && comp.type === 'servis_kutusu') {
                boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.SERVIS_KUTUSU, this.lastComponentId);
                comp.baglaBoru(boru.id);
            } else if (comp && comp.type === 'sayac') {
                boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.SAYAC, this.lastComponentId);
                if (comp.baglaCikis) comp.baglaCikis(boru.id);
            }
        }

        plumbingManager.pipes.push(boru);

        // Borunun ucuna sayaç ekle
        const sayac = createSayac(endPt.x + 30, endPt.y, {
            floorId: state.currentFloor?.id,
            z: endPt.z || 0
        });

        sayac.ghostConnectionInfo = {
            boruUcu: {
                boruId: boru.id,
                boru: boru,
                uc: 'p2',
                nokta: { x: endPt.x, y: endPt.y, z: endPt.z || 0 }
            }
        };

        const interactionMgr = plumbingManager.interactionManager;
        if (interactionMgr && interactionMgr.handleSayacEndPlacement) {
            const success = interactionMgr.handleSayacEndPlacement(sayac);
            if (success) {
                plumbingManager.saveToState();

                const cikis = sayac.getCikisNoktasi();
                this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
                this.lastComponentId = sayac.id;
                this.lastPipeId = null;

                const step = this._addStep(cmd, startPt, { ...this.currentPosition });
                step.createdIds.push(boru.id, sayac.id);

                plumbingManager.updatePipeColorsAfterMeter(sayac.id);

                return { success: true, message: 'Sayaç eklendi (100 cm boru + sayaç)', step };
            }
        }

        // Fallback
        plumbingManager.components.push(sayac);
        plumbingManager.saveToState();

        const cikis = sayac.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = sayac.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd, startPt, { ...this.currentPosition });
        step.createdIds.push(boru.id, sayac.id);

        return { success: true, message: 'Sayaç eklendi (100 cm boru + sayaç)', step };
    }

    /**
     * Son borunun ucuna cihaz (kombi/ocak) ekle
     */
    _addCihaz(cmd, deviceType) {
        const pipe = this._getLastPipe();
        if (!pipe) {
            return { success: false, message: `${deviceType} eklemek için önce boru çizin!` };
        }

        saveState();

        // plumbingManager.placeDeviceAtOpenEnd kullan (otomatik vana + fleks + baca)
        const endPt = pipe.p2;
        const boruUcuInfo = {
            pipe: pipe,
            end: 'p2',
            point: { x: endPt.x, y: endPt.y, z: endPt.z || 0 }
        };

        const success = plumbingManager.placeDeviceAtOpenEnd(deviceType, boruUcuInfo);

        if (success) {
            plumbingManager.saveToState();

            // Cihaz eklendikten sonra bu noktadan ilerleme durur (cihaz son eleman)
            const step = this._addStep(cmd, { ...endPt }, { ...this.currentPosition });

            return { success: true, message: `${deviceType} eklendi`, step };
        }

        return { success: false, message: `${deviceType} eklenemedi. Boru ucunda sorun olabilir.` };
    }

    // ───── GÖRÜNÜM KOMUTLARI ─────

    /**
     * 3D/2D geçişi, ölçü göster/gizle
     */
    _executeViewCommand(cmd) {
        switch (cmd.action) {
            case '3d': {
                // 3D perspektif aktif değilse aç
                if (!state.is3DPerspectiveActive) {
                    toggle3DPerspective();
                }
                return { success: true, message: '3D görünüme geçildi' };
            }

            case '2d': {
                // 3D perspektif aktifse kapat
                if (state.is3DPerspectiveActive) {
                    toggle3DPerspective();
                }
                return { success: true, message: '2D görünüme geçildi' };
            }

            case 'show_dimensions': {
                // dimensionMode 0 ise ölçüler hiç çizilmez, en az 1 olmalı
                if (state.dimensionMode === 0) {
                    setState({ dimensionMode: 1 });
                    // dimensionOptions da güncelle
                    if (state.dimensionOptions) {
                        state.dimensionOptions.defaultView = 1;
                    }
                }
                state.tempVisibility.showArchDimensions = true;
                state.tempVisibility.showPlumbingDimensions = true;
                this._syncDimensionCheckboxes(true);
                draw2D();
                return { success: true, message: 'Ölçüler gösteriliyor' };
            }

            case 'hide_dimensions': {
                state.tempVisibility.showArchDimensions = false;
                state.tempVisibility.showPlumbingDimensions = false;
                this._syncDimensionCheckboxes(false);
                draw2D();
                return { success: true, message: 'Ölçüler gizlendi' };
            }

            default:
                return { success: false, message: `Bilinmeyen görünüm komutu: ${cmd.action}` };
        }
    }

    /**
     * Checkbox'ları durum ile senkronize et
     */
    _syncDimensionCheckboxes(visible) {
        const archCb = document.getElementById('vis-chk-arch-dim');
        const plumbCb = document.getElementById('vis-chk-plumb-dim');
        if (archCb) archCb.checked = visible;
        if (plumbCb) plumbCb.checked = visible;
    }

    // ───── NAVİGASYON KOMUTLARI ─────

    /**
     * Belirli bir adıma geri dön
     */
    _executeGotoCommand(cmd) {
        const targetStep = cmd.step;
        if (targetStep < 1 || targetStep > this.steps.length) {
            return { success: false, message: `Geçersiz adım: ${targetStep}. Toplam ${this.steps.length} adım var.` };
        }

        const step = this.steps[targetStep - 1];
        if (!step.endPoint) {
            return { success: false, message: `${targetStep}. adımın bitiş noktası bulunamadı` };
        }

        this.currentPosition = { ...step.endPoint };
        this.activeStepIndex = targetStep - 1;

        // Son boru/bileşen ID'sini bul
        this._restoreLastIds(targetStep - 1);

        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return { success: true, message: `${targetStep}. adıma dönüldü. Devam edebilirsiniz.` };
    }

    /**
     * Son adımı geri al
     */
    _executeUndoCommand() {
        if (this.steps.length === 0) {
            return { success: false, message: 'Geri alınacak adım yok' };
        }

        const lastStep = this.steps.pop();

        for (const id of lastStep.createdIds) {
            plumbingManager.deletePipe(id);
            plumbingManager.deleteComponent(id);
        }

        plumbingManager.saveToState();

        if (this.steps.length > 0) {
            const prevStep = this.steps[this.steps.length - 1];
            this.currentPosition = prevStep.endPoint ? { ...prevStep.endPoint } : null;
            this.activeStepIndex = this.steps.length - 1;
            this._restoreLastIds(this.steps.length - 1);
        } else {
            this.currentPosition = null;
            this.lastPipeId = null;
            this.lastComponentId = null;
            this.activeStepIndex = -1;
        }

        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return { success: true, message: `"${lastStep.text}" geri alındı` };
    }

    /**
     * Sesli komut modunu bitir
     */
    _executeFinishCommand() {
        this.deactivate();
        return { success: true, message: `Sesli komut tamamlandı. ${this.steps.length} adım çizildi.` };
    }

    // ───── YARDIMCI FONKSİYONLAR ─────

    /**
     * Adım ekle (ortak yardımcı)
     */
    _addStep(cmd, startPt, endPt) {
        const step = new VoiceStep(
            this.steps.length + 1,
            cmd,
            startPt,
            endPt
        );
        this.steps.push(step);
        this.activeStepIndex = this.steps.length - 1;

        this._emit('stepAdded', step);
        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return step;
    }

    /**
     * Renk grubunu belirle
     */
    _determineColorGroup() {
        if (this.lastPipeId) {
            const lastPipe = plumbingManager.findPipeById(this.lastPipeId);
            if (lastPipe) return lastPipe.colorGroup;
        }
        return 'YELLOW';
    }

    /**
     * Son boruyu al (seçili boruyu da kontrol eder)
     */
    _getLastPipe() {
        if (this.lastPipeId) {
            return plumbingManager.findPipeById(this.lastPipeId);
        }
        // Son adımlarda boru ara
        for (let i = this.steps.length - 1; i >= 0; i--) {
            for (let j = this.steps[i].createdIds.length - 1; j >= 0; j--) {
                const pipe = plumbingManager.findPipeById(this.steps[i].createdIds[j]);
                if (pipe) return pipe;
            }
        }
        // Seçili nesne boru ise onu kullan
        const sel = state.selectedObject;
        if (sel && sel.type === 'pipe' && sel.object) {
            return sel.object;
        }
        return null;
    }

    /**
     * Belirli bir adıma kadar son boru/bileşen ID'lerini geri yükle
     */
    _restoreLastIds(stepIndex) {
        this.lastPipeId = null;
        this.lastComponentId = null;
        for (let i = stepIndex; i >= 0; i--) {
            const s = this.steps[i];
            for (let j = s.createdIds.length - 1; j >= 0; j--) {
                const id = s.createdIds[j];
                if (!this.lastPipeId && plumbingManager.findPipeById(id)) {
                    this.lastPipeId = id;
                }
                if (!this.lastComponentId && plumbingManager.findComponentById(id)) {
                    this.lastComponentId = id;
                }
                if (this.lastPipeId) return; // Boru bulunca dur
            }
        }
    }

    /**
     * Tüm adımları temizle
     */
    clearAll() {
        this.steps = [];
        this.currentPosition = null;
        this.lastPipeId = null;
        this.lastComponentId = null;
        this.activeStepIndex = -1;
        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', null);
    }

    get stepCount() {
        return this.steps.length;
    }

    /**
     * Belirli bir adımdan devam et
     */
    continueFromStep(stepNumber, text) {
        const gotoResult = this._executeGotoCommand({ type: 'goto', step: stepNumber });
        if (!gotoResult.success) return gotoResult;
        return this.processCommand(text);
    }
}

export const voiceCommandManager = VoiceCommandManager.getInstance();
