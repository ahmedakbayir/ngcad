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
import { state, setState, setMode, setDrawingMode } from '../general-files/main.js';
import { toggle3DPerspective } from '../general-files/ui.js';
import { draw2D } from '../draw/draw2d.js';
import { fitDrawingToScreen, zoomIn, zoomOut, fitSelectionToScreen, panView } from '../draw/zoom.js';
import { buildPipeHierarchy } from '../plumbing_v2/renderer/renderer-utils.js';

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
        this.parentStepIndex = -1;  // -1 = kök seviye, >=0 = dallanma (parent step index)
        this.children = [];         // Alt adımların index'leri
        this.pipeLabel = null;      // Hat harfi (A, B, C...) - boru çizen adımlar için
        this.parentPipeLabel = null; // Üst hat harfi - bileşen ekleme adımları için
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
        this.lastDirection = null; // Son kullanılan yön (sadece sayı verildiğinde devam için)
        this.isActive = false;
        this.activeStepIndex = -1;
        this._branchFromStepIndex = -1; // Dallanma durumunda parent step index

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
            case 'continue':
                return this._executeContinueCommand(cmd);
            case 'branch':
                return this._executeBranchCommand(cmd);
            case 'add':
                return this._executeAddCommand(cmd);
            case 'view':
                return this._executeViewCommand(cmd);
            case 'zoom':
                return this._executeZoomCommand(cmd);
            case 'pan':
                return this._executePanCommand(cmd);
            case 'split':
                return this._executeSplitCommand(cmd);
            case 'mode':
                return this._executeModeCommand(cmd);
            case 'select':
                return this._executeSelectCommand(cmd);
            case 'select_adjacent':
                return this._executeSelectAdjacentCommand(cmd);
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
     * Seçim yoksa mevcut tesisattaki açık boru ucundan devam eder.
     */
    _tryInitFromSelection() {
        // 1. Seçili nesneden devam etmeyi dene
        const sel = state.selectedObject;
        if (sel && sel.object) {
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
                return;
            }
        }

        // 2. Seçim yoksa, mevcut tesisattaki açık boru ucundan devam et
        //    (servis kutusu aramaya gerek yok - zaten tesisat var)
        if (!this.currentPosition && plumbingManager.pipes.length > 0) {
            const openEnds = plumbingManager.getBosBitisBorular();
            if (openEnds.length > 0) {
                // Son açık ucu kullan (en son eklenen boru genelde en altta)
                const lastOpen = openEnds[openEnds.length - 1];
                const pt = lastOpen.pipe[lastOpen.end];
                this.currentPosition = { x: pt.x, y: pt.y, z: pt.z || 0 };
                this.lastPipeId = lastOpen.pipe.id;
                this.lastComponentId = null;
                return;
            }
            // Açık uç yoksa son borunun p2 ucundan devam et
            const lastPipe = plumbingManager.pipes[plumbingManager.pipes.length - 1];
            if (lastPipe && lastPipe.p2) {
                this.currentPosition = { x: lastPipe.p2.x, y: lastPipe.p2.y, z: lastPipe.p2.z || 0 };
                this.lastPipeId = lastPipe.id;
                this.lastComponentId = null;
            }
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
     * İç tesisat başlat - kesikli boru + sayaç (manuel akışla aynı)
     * Manuel akış: handleMeterStartPipeSecondClick → kesikli temsili boru + handleSayacEndPlacement
     */
    _placeIcTesisat(cmd) {
        saveState();

        // Başlangıç noktası (p1)
        const startX = state.panOffset ? -state.panOffset.x / state.zoom + 200 : 200;
        const startY = state.panOffset ? -state.panOffset.y / state.zoom + 400 : 400;

        // Bitiş noktası (p2) - sağa doğru 200cm
        const BORU_UZUNLUK = 200;
        const endX = startX + BORU_UZUNLUK;
        const endY = startY;

        // 1. Kesikli temsili boru oluştur (manuel akışla aynı)
        const temsiliBoru = createBoru({ x: startX, y: startY }, { x: endX, y: endY });
        temsiliBoru.dagitimTuru = 'KOLON';
        temsiliBoru.lineStyle = 'dashed';
        temsiliBoru.isTemsiliBoru = true;
        temsiliBoru.floorId = state.currentFloor?.id;

        plumbingManager.pipes.push(temsiliBoru);

        // 2. Sayaç pozisyon ve rotation hesapla (handleMeterStartPipeSecondClick mantığı)
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.hypot(dx, dy);
        const fleksUzunluk = 15;
        const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;

        const tempMeter = createSayac(endX, endY, {
            floorId: state.currentFloor?.id
        });
        tempMeter.rotation = boruAci;

        // Sayacın giriş noktasını hesapla (rotation uygulanmış)
        const girisLocal = tempMeter.getGirisLocalKoordinat();
        const rad = tempMeter.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
        const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

        // Perpendicular yön
        const perpX = -dy / length;
        const perpY = dx / length;

        tempMeter.x = endX - girisRotatedX + perpX * fleksUzunluk;
        tempMeter.y = endY - girisRotatedY + perpY * fleksUzunluk;

        // 3. Ghost connection bilgisi
        tempMeter.ghostConnectionInfo = {
            boruUcu: {
                boruId: temsiliBoru.id,
                boru: temsiliBoru,
                uc: 'p2',
                nokta: { x: endX, y: endY }
            }
        };

        // 4. handleSayacEndPlacement ile vana + fleks + sayaç otomatik ekle
        const interactionMgr = plumbingManager.interactionManager;
        let success = false;
        if (interactionMgr && interactionMgr.handleSayacEndPlacement) {
            success = interactionMgr.handleSayacEndPlacement(tempMeter);
        }

        if (!success) {
            // Fallback: Manuel ekleme
            plumbingManager.components.push(tempMeter);
        }

        plumbingManager.saveToState();

        // Sayacın çıkış noktasından devam et
        const cikis = tempMeter.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = tempMeter.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd,
            { x: startX, y: startY, z: 0 },
            { ...this.currentPosition }
        );
        step.createdIds.push(temsiliBoru.id, tempMeter.id);

        if (success) {
            plumbingManager.updatePipeColorsAfterMeter(tempMeter.id);
        }

        return { success: true, message: `İç tesisat başlatıldı`, step };
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

        // Son yönü kaydet
        this.lastDirection = cmd.direction;

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

    // ───── DEVAM KOMUTU (sadece sayı) ─────

    /**
     * Sadece sayı verildiğinde son yönde devam et.
     * "100 geri" sonra "50" → aynı yönde 50 daha
     * Son yön yoksa son borunun doğrultusunu kullan.
     */
    _executeContinueCommand(cmd) {
        if (!this.currentPosition) {
            return { success: false, message: 'Önce başlangıç konumu belirleyin!' };
        }

        // Son yönü bul
        let direction = this.lastDirection;

        // Son yön yoksa son borunun doğrultusunu kullan
        if (!direction && this.lastPipeId) {
            const lastPipe = plumbingManager.findPipeById(this.lastPipeId);
            if (lastPipe) {
                const dx = lastPipe.p2.x - lastPipe.p1.x;
                const dy = lastPipe.p2.y - lastPipe.p1.y;
                const dz = (lastPipe.p2.z || 0) - (lastPipe.p1.z || 0);
                // En baskın ekseni bul
                const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
                if (ax >= ay && ax >= az) {
                    direction = dx > 0 ? 'saga' : 'sola';
                } else if (ay >= ax && ay >= az) {
                    direction = dy < 0 ? 'ileri' : 'geri';
                } else {
                    direction = dz > 0 ? 'yukari' : 'asagi';
                }
            }
        }

        if (!direction) {
            return { success: false, message: 'Yön belirtilmedi ve önceki yön bulunamadı. Yön belirtin (ör: "50 sağa")' };
        }

        // Move komutu olarak yürüt
        const moveCmd = { type: 'move', distance: cmd.distance, direction, raw: cmd.raw };
        return this._executeMoveCommand(moveCmd);
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
     * Mevcut borunun ucuna sayaç yerleştir (manuel akışla aynı)
     * Pipe p2 ucuna: vana + fleks + sayaç otomatik eklenir
     */
    _addSayacToPipeEnd(cmd, pipe) {
        saveState();

        const startPt = { ...this.currentPosition };
        const endPt = pipe.p2;

        // Boru yönü hesapla
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const length = Math.hypot(dx, dy);
        const fleksUzunluk = 15;
        const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;

        // Sayaç oluştur ve pozisyon/rotation ayarla
        const sayac = createSayac(endPt.x, endPt.y, {
            floorId: state.currentFloor?.id,
            z: endPt.z || 0
        });
        sayac.rotation = boruAci;

        // Sayacın giriş noktasını hesapla (rotation uygulanmış)
        const girisLocal = sayac.getGirisLocalKoordinat();
        const rad = sayac.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
        const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

        // Perpendicular yön
        const perpX = length > 0 ? -dy / length : 0;
        const perpY = length > 0 ? dx / length : 1;

        sayac.x = endPt.x - girisRotatedX + perpX * fleksUzunluk;
        sayac.y = endPt.y - girisRotatedY + perpY * fleksUzunluk;

        // Ghost connection bilgisi
        sayac.ghostConnectionInfo = {
            boruUcu: {
                boruId: pipe.id,
                boru: pipe,
                uc: 'p2',
                nokta: { x: endPt.x, y: endPt.y, z: endPt.z || 0 }
            }
        };

        // handleSayacEndPlacement ile vana + fleks + sayaç otomatik ekle
        const interactionMgr = plumbingManager.interactionManager;
        let success = false;
        if (interactionMgr && interactionMgr.handleSayacEndPlacement) {
            success = interactionMgr.handleSayacEndPlacement(sayac);
        }

        if (!success) {
            plumbingManager.components.push(sayac);
        }

        plumbingManager.saveToState();

        const cikis = sayac.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = sayac.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd, startPt, { ...this.currentPosition });
        step.createdIds.push(sayac.id);

        if (success) {
            plumbingManager.updatePipeColorsAfterMeter(sayac.id);
        }

        return { success: true, message: 'Sayaç eklendi', step };
    }

    /**
     * Boru yokken: 100cm boru çiz + ucuna sayaç (bileşenden başlama senaryosu)
     * Manuel akışla aynı: boru + vana + fleks + sayaç
     */
    _addSayacWithPipe(cmd) {
        saveState();

        const SAYAC_BORU_MESAFE = 100;
        const startPt = { ...this.currentPosition };

        // Varsayılan yön: sağa
        const endPt = {
            x: startPt.x + SAYAC_BORU_MESAFE,
            y: startPt.y,
            z: startPt.z || 0
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

        // Borunun ucuna sayaç ekle (tam pozisyon hesabıyla)
        const dx = endPt.x - startPt.x;
        const dy = endPt.y - startPt.y;
        const length = Math.hypot(dx, dy);
        const fleksUzunluk = 15;
        const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;

        const sayac = createSayac(endPt.x, endPt.y, {
            floorId: state.currentFloor?.id,
            z: endPt.z || 0
        });
        sayac.rotation = boruAci;

        const girisLocal = sayac.getGirisLocalKoordinat();
        const rad = sayac.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
        const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

        const perpX = length > 0 ? -dy / length : 0;
        const perpY = length > 0 ? dx / length : 1;

        sayac.x = endPt.x - girisRotatedX + perpX * fleksUzunluk;
        sayac.y = endPt.y - girisRotatedY + perpY * fleksUzunluk;

        sayac.ghostConnectionInfo = {
            boruUcu: {
                boruId: boru.id,
                boru: boru,
                uc: 'p2',
                nokta: { x: endPt.x, y: endPt.y, z: endPt.z || 0 }
            }
        };

        const interactionMgr = plumbingManager.interactionManager;
        let success = false;
        if (interactionMgr && interactionMgr.handleSayacEndPlacement) {
            success = interactionMgr.handleSayacEndPlacement(sayac);
        }

        if (!success) {
            plumbingManager.components.push(sayac);
        }

        plumbingManager.saveToState();

        const cikis = sayac.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = sayac.id;
        this.lastPipeId = null;

        const step = this._addStep(cmd, startPt, { ...this.currentPosition });
        step.createdIds.push(boru.id, sayac.id);

        if (success) {
            plumbingManager.updatePipeColorsAfterMeter(sayac.id);
        }

        return { success: true, message: 'Sayaç eklendi (boru + sayaç)', step };
    }

    /**
     * Son borunun ucuna cihaz (kombi/ocak) ekle
     * Cihazı fleksle beraber hattın ucuna doğru yönde konumlar.
     */
    _addCihaz(cmd, deviceType) {
        const pipe = this._getLastPipe();
        if (!pipe) {
            return { success: false, message: `${deviceType} eklemek için önce boru çizin!` };
        }

        // NOT: saveState() burada çağrılmıyor - handleCihazEkleme kendi içinde çağırır

        const endPt = pipe.p2;

        // Boru yönünü hesapla (p1 → p2 yönünde devam)
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const length3D = Math.hypot(dx, dy, dz);

        // Boru yönü birim vektörü
        const dirX = length3D > 0 ? dx / length3D : 1;
        const dirY = length3D > 0 ? dy / length3D : 0;

        // Cihaz pozisyonunu fleks uzunluğu kadar ileri hesapla
        const fleksUzunluk = 30; // defaultUzunluk
        const deviceX = endPt.x + dirX * fleksUzunluk;
        const deviceY = endPt.y + dirY * fleksUzunluk;
        const deviceZ = (endPt.z || 0) + (length3D > 0 ? (dz / length3D) * fleksUzunluk : 0);

        // Cihazı oluştur - doğru pozisyonda
        const newDevice = createCihaz(deviceX, deviceY, deviceType, {
            floorId: pipe.floorId || state.currentFloor?.id
        });
        newDevice.z = deviceZ;

        // Boru açısına göre cihaz rotation'unu ayarla
        const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;
        newDevice.rotation = 0; // handleCihazEkleme de 0 yapıyor

        // Ghost connection info ekle
        newDevice.ghostConnectionInfo = {
            boruUcu: {
                boruId: pipe.id,
                nokta: { x: endPt.x, y: endPt.y, z: endPt.z || 0 },
                uc: 'p2',
                boru: pipe
            }
        };

        // handleCihazEkleme ile vana + fleks + baca otomatik ekle
        const success = plumbingManager.interactionManager.handleCihazEkleme(newDevice);

        if (success) {
            plumbingManager.saveToState();

            // Cihaz eklendikten sonra bu noktadan ilerleme durur (cihaz son eleman)
            const step = this._addStep(cmd, { ...endPt }, { ...this.currentPosition });

            // Geri al için oluşturulan tüm bileşen ID'lerini kaydet
            step.createdIds.push(newDevice.id);
            if (newDevice.iliskiliVanaId) {
                step.createdIds.push(newDevice.iliskiliVanaId);
            }
            // Otomatik oluşturulan bacayı bul ve kaydet
            const baca = plumbingManager.components.find(
                c => c.type === 'baca' && c.parentCihazId === newDevice.id
            );
            if (baca) {
                step.createdIds.push(baca.id);
            }

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

            case 'show_z': {
                state.tempVisibility.showZElevation = true;
                this._syncVisibilityCheckbox('vis-chk-z', true);
                draw2D();
                return { success: true, message: 'Z kotu gösteriliyor' };
            }

            case 'hide_z': {
                state.tempVisibility.showZElevation = false;
                this._syncVisibilityCheckbox('vis-chk-z', false);
                draw2D();
                return { success: true, message: 'Z kotu gizlendi' };
            }

            case 'show_shadow': {
                state.tempVisibility.showPipeShadows = true;
                this._syncVisibilityCheckbox('vis-chk-shadow', true);
                draw2D();
                return { success: true, message: 'Hat gölgesi gösteriliyor' };
            }

            case 'hide_shadow': {
                state.tempVisibility.showPipeShadows = false;
                this._syncVisibilityCheckbox('vis-chk-shadow', false);
                draw2D();
                return { success: true, message: 'Hat gölgesi gizlendi' };
            }

            case 'show_labels': {
                state.tempVisibility.showPipeLabels = true;
                this._syncVisibilityCheckbox('vis-chk-labels', true);
                draw2D();
                return { success: true, message: 'Hat etiketleri gösteriliyor' };
            }

            case 'hide_labels': {
                state.tempVisibility.showPipeLabels = false;
                this._syncVisibilityCheckbox('vis-chk-labels', false);
                draw2D();
                return { success: true, message: 'Hat etiketleri gizlendi' };
            }

            case 'fit_to_screen': {
                fitDrawingToScreen();
                draw2D();
                return { success: true, message: 'Ekrana sığdırıldı' };
            }

            case 'fit_selection': {
                fitSelectionToScreen();
                draw2D();
                const sel = state.selectedObject;
                if (sel && sel.object) {
                    return { success: true, message: 'Seçili nesne ekrana sığdırıldı' };
                }
                return { success: true, message: 'Seçim yok - tüm çizim ekrana sığdırıldı' };
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

    /**
     * Tek bir görünürlük checkbox'ını senkronize et
     */
    _syncVisibilityCheckbox(id, checked) {
        const cb = document.getElementById(id);
        if (cb) cb.checked = checked;
    }

    // ───── ZOOM KOMUTLARI ─────

    /**
     * Yakınlaş / Uzaklaş
     */
    _executeZoomCommand(cmd) {
        const times = cmd.multiplier || 1;
        if (cmd.action === 'in') {
            for (let i = 0; i < times; i++) zoomIn();
            draw2D();
            return { success: true, message: times > 1 ? `${times}x Yakınlaştırıldı` : 'Yakınlaştırıldı' };
        } else {
            for (let i = 0; i < times; i++) zoomOut();
            draw2D();
            return { success: true, message: times > 1 ? `${times}x Uzaklaştırıldı` : 'Uzaklaştırıldı' };
        }
    }

    // ───── PAN (KAYDIR) KOMUTLARI ─────

    /**
     * Ekranı belirtilen yöne kaydır
     */
    _executePanCommand(cmd) {
        panView(cmd.direction);
        draw2D();
        const dirNames = { right: 'sağa', left: 'sola', up: 'yukarı', down: 'aşağı' };
        return { success: true, message: `Ekran ${dirNames[cmd.direction] || cmd.direction} kaydırıldı` };
    }

    // ───── HAT BÖLME KOMUTLARI ─────

    /**
     * Hattı (boruyu) böl.
     * - position: 'middle' → ortadan ikiye böl
     * - position: 'distance' → belirtilen cm noktasından böl
     * - position: 'parts' → N eşit parçaya böl
     */
    _executeSplitCommand(cmd) {
        // Son boru veya seçili boru
        let pipe = this._getLastPipe();
        if (!pipe) {
            return { success: false, message: 'Bölmek için önce bir hat çizin veya seçin!' };
        }

        saveState();

        const pipeLen = pipe.uzunluk || Math.hypot(
            pipe.p2.x - pipe.p1.x,
            pipe.p2.y - pipe.p1.y
        );

        if (cmd.position === 'distance') {
            // Belirli mesafeden böl
            const dist = cmd.distance;
            if (dist <= 0 || dist >= pipeLen) {
                return { success: false, message: `Bölme noktası hattın dışında (hat uzunluğu: ${Math.round(pipeLen)} cm)` };
            }
            const t = dist / pipeLen;
            return this._splitPipeAtT(pipe, [t], cmd);
        }

        if (cmd.position === 'parts') {
            // N parçaya böl
            const parts = cmd.parts;
            const tValues = [];
            for (let i = 1; i < parts; i++) {
                tValues.push(i / parts);
            }
            return this._splitPipeAtT(pipe, tValues, cmd);
        }

        // Ortadan böl (varsayılan)
        return this._splitPipeAtT(pipe, [0.5], cmd);
    }

    /**
     * Boruyu belirtilen t değerlerinde (0-1 arası) böler.
     * Her t değeri bir bölme noktasıdır.
     * @param {object} pipe - Bölünecek boru
     * @param {number[]} tValues - Bölme noktaları (sıralı, 0-1 arası)
     * @param {object} cmd - Komut nesnesi
     */
    _splitPipeAtT(pipe, tValues, cmd) {
        // t değerlerini sırala
        const sorted = [...tValues].sort((a, b) => a - b);

        // Orijinal boru bilgileri
        const origP1 = { ...pipe.p1 };
        const origP2 = { ...pipe.p2 };
        const dx = origP2.x - origP1.x;
        const dy = origP2.y - origP1.y;
        const dz = (origP2.z || 0) - (origP1.z || 0);

        // Bölme noktalarını hesapla
        const points = [origP1];
        for (const t of sorted) {
            points.push({
                x: origP1.x + dx * t,
                y: origP1.y + dy * t,
                z: (origP1.z || 0) + dz * t
            });
        }
        points.push(origP2);

        // Orijinal boruyu ilk segment olarak güncelle
        pipe.p2 = { ...points[1] };
        if (pipe.p2.z !== undefined) pipe.p2.z = points[1].z;

        // Ek segmentleri oluştur
        const newPipeIds = [];
        let prevPipe = pipe;

        for (let i = 1; i < points.length - 1; i++) {
            const segStart = points[i];
            const segEnd = points[i + 1];

            const newPipe = createBoru(segStart, segEnd, 'STANDART');
            newPipe.floorId = pipe.floorId;
            newPipe.colorGroup = pipe.colorGroup;
            newPipe.dagitimTuru = pipe.dagitimTuru;

            // Bağlantılar
            newPipe.setBaslangicBaglanti(BAGLANTI_TIPLERI.BORU, prevPipe.id);
            prevPipe.setBitisBaglanti(BAGLANTI_TIPLERI.BORU, newPipe.id);

            // Son segment ise, orijinal borunun bitiş bağlantısını aktar
            if (i === points.length - 2 && pipe.bitisBaglanti) {
                newPipe.bitisBaglanti = { ...pipe.bitisBaglanti };
            }

            plumbingManager.pipes.push(newPipe);
            newPipeIds.push(newPipe.id);
            prevPipe = newPipe;
        }

        plumbingManager.saveToState();

        // Son parçanın ucundan devam et
        const lastPoint = points[points.length - 1];
        this.currentPosition = { x: lastPoint.x, y: lastPoint.y, z: lastPoint.z || 0 };
        this.lastPipeId = newPipeIds.length > 0 ? newPipeIds[newPipeIds.length - 1] : pipe.id;

        const step = this._addStep(cmd, origP1, lastPoint);
        step.createdIds.push(...newPipeIds);

        const partsCount = points.length - 1;
        return { success: true, message: `Hat ${partsCount} parçaya bölündü`, step };
    }

    // ───── MOD DEĞİŞTİRME KOMUTLARI ─────

    /**
     * Çizim modunu veya proje modunu değiştir.
     * "mimari moda geç" → setDrawingMode('MİMARİ')
     * "duvar çiz" → setMode('drawWall')
     */
    _executeModeCommand(cmd) {
        // Proje modu değişikliği (MİMARİ, TESİSAT, KARMA)
        if (cmd.drawingMode) {
            setDrawingMode(cmd.drawingMode);
            draw2D();
            const modeNames = { 'MİMARİ': 'Mimari', 'TESİSAT': 'Tesisat', 'KARMA': 'Karma' };
            return { success: true, message: `${modeNames[cmd.drawingMode] || cmd.drawingMode} moduna geçildi` };
        }

        // Araç modu değişikliği (drawWall, drawRoom, etc.)
        if (cmd.mode) {
            setMode(cmd.mode, true);
            draw2D();
            const toolNames = {
                'drawWall': 'Duvar çizim', 'drawRoom': 'Oda çizim', 'drawDoor': 'Kapı yerleştirme',
                'drawWindow': 'Pencere yerleştirme', 'drawColumn': 'Kolon yerleştirme',
                'drawBeam': 'Kiriş yerleştirme', 'drawStairs': 'Merdiven çizim',
                'drawSymmetry': 'Simetri', 'select': 'Seçim',
                'plumbingV2': 'Tesisat'
            };
            return { success: true, message: `${toolNames[cmd.mode] || cmd.mode} moduna geçildi` };
        }

        return { success: false, message: 'Geçersiz mod komutu' };
    }

    // ───── SEÇİM KOMUTLARI ─────

    /**
     * Etikete göre hat seçimi: "A nolu hattı seç"
     */
    _executeSelectCommand(cmd) {
        const label = cmd.label;
        if (!label) {
            return { success: false, message: 'Hat etiketi belirtilmedi' };
        }

        // Pipe hierarchy'den label'a sahip boruyu bul
        const hierarchy = buildPipeHierarchy(plumbingManager.pipes, plumbingManager.components);

        // Label'a sahip boru ID'sini bul
        let targetPipe = null;
        for (const [pipeId, data] of hierarchy) {
            if (data.label === label) {
                targetPipe = plumbingManager.findPipeById(pipeId);
                break;
            }
        }

        if (!targetPipe) {
            return { success: false, message: `"${label}" etiketli hat bulunamadı` };
        }

        // Önceki seçimi temizle (mouse seçimiyle aynı davranış)
        const prevSel = state.selectedObject;
        if (prevSel && prevSel.object && prevSel.object !== targetPipe) {
            prevSel.object.isSelected = false;
        }

        // Boruyu seç
        targetPipe.isSelected = true;
        setState({
            selectedObject: {
                type: 'pipe',
                object: targetPipe,
                handle: 'body'
            }
        });

        // Voice command position'ı güncelle - bu hattan devam edilebilir
        this.currentPosition = { x: targetPipe.p2.x, y: targetPipe.p2.y, z: targetPipe.p2.z || 0 };
        this.lastPipeId = targetPipe.id;
        this.lastComponentId = null;

        draw2D();

        const step = this._addStep(cmd, { ...targetPipe.p1 }, { ...targetPipe.p2 });
        return { success: true, message: `${label} hattı seçildi`, step };
    }

    // ───── ÖNCEKİ / SONRAKİ HAT SEÇİMİ ─────

    /**
     * Önceki veya sonraki hattı seç (alfabetik sıraya göre)
     */
    _executeSelectAdjacentCommand(cmd) {
        const hierarchy = buildPipeHierarchy(plumbingManager.pipes, plumbingManager.components);
        if (!hierarchy || hierarchy.size === 0) {
            return { success: false, message: 'Hiç hat bulunamadı' };
        }

        // Etiketli boruları topla ve sırala
        const labeledPipes = [];
        for (const [pipeId, data] of hierarchy) {
            if (data.label) {
                labeledPipes.push({ pipeId, label: data.label });
            }
        }
        labeledPipes.sort((a, b) => a.label.localeCompare(b.label, 'tr'));

        if (labeledPipes.length === 0) {
            return { success: false, message: 'Etiketli hat bulunamadı' };
        }

        // Mevcut seçimi bul
        const sel = state.selectedObject;
        let currentIndex = -1;
        if (sel && sel.object && sel.type === 'pipe') {
            currentIndex = labeledPipes.findIndex(lp => lp.pipeId === sel.object.id);
        }

        let targetIndex;
        if (cmd.direction === 'next') {
            targetIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % labeledPipes.length;
        } else {
            targetIndex = currentIndex < 0 ? labeledPipes.length - 1 : (currentIndex - 1 + labeledPipes.length) % labeledPipes.length;
        }

        const targetLabel = labeledPipes[targetIndex].label;
        return this._executeSelectCommand({ type: 'select', label: targetLabel, raw: cmd.raw });
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

        // Dallanma bağlamını ayarla - sonraki komutlar bu adımın altına eklenecek
        this._branchFromStepIndex = targetStep - 1;

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

        // Dallanma bağlamı varsa parent-child ilişkisi kur
        if (this._branchFromStepIndex >= 0) {
            step.parentStepIndex = this._branchFromStepIndex;
            const parentStep = this.steps[this._branchFromStepIndex];
            if (parentStep) {
                parentStep.children.push(this.steps.length); // yeni step'in index'i
            }
        }

        this.steps.push(step);
        this.activeStepIndex = this.steps.length - 1;

        // Hat harflerini güncelle
        this._refreshPipeLabels();

        this._emit('stepAdded', step);
        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return step;
    }

    /**
     * Renk grubunu belirle.
     * Manuel (mouse) akışla aynı mantık: sayaç sonrası borular TURQUAZ olmalı.
     */
    _determineColorGroup() {
        // 1. Son boru varsa onun renk grubunu kullan
        if (this.lastPipeId) {
            const lastPipe = plumbingManager.findPipeById(this.lastPipeId);
            if (lastPipe) return lastPipe.colorGroup;
        }

        // 2. Son bileşen sayaç ise, sayaç sonrası → TURQUAZ
        if (this.lastComponentId) {
            const comp = plumbingManager.findComponentById(this.lastComponentId);
            if (comp && comp.type === 'sayac') return 'TURQUAZ';
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
     * Tüm adımların hat harflerini güncelle (buildPipeHierarchy ile)
     */
    _refreshPipeLabels() {
        const hierarchy = buildPipeHierarchy(plumbingManager.pipes, plumbingManager.components);
        if (!hierarchy || hierarchy.size === 0) return;

        for (const step of this.steps) {
            step.pipeLabel = null;
            step.parentPipeLabel = null;

            for (const id of step.createdIds) {
                // Boru mu?
                const pipeData = hierarchy.get(id);
                if (pipeData) {
                    step.pipeLabel = pipeData.label;
                    break;
                }
                // Bileşen ise, bağlı olduğu borunun harfini bul
                const comp = plumbingManager.findComponentById(id);
                if (comp && comp.bagliBoruId) {
                    const parentPipeData = hierarchy.get(comp.bagliBoruId);
                    if (parentPipeData) {
                        step.parentPipeLabel = parentPipeData.label;
                        break;
                    }
                }
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
        this.lastDirection = null;
        this.activeStepIndex = -1;
        this._branchFromStepIndex = -1;
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
