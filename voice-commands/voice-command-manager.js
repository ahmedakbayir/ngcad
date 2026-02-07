/**
 * Voice Command Manager
 * Sesli komut sistemi - adım yönetimi, komut yürütme, boru çizim entegrasyonu
 *
 * Adım listesi tutarak kullanıcının sesli komutlarla tesisat çizmesini sağlar.
 * Herhangi bir adıma geri dönüp oradan devam etme özelliği sunar.
 */

import { parseVoiceCommand, commandToText, directionToVector } from './voice-command-parser.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { ServisKutusu } from '../plumbing_v2/objects/service-box.js';
import { createBoru, BAGLANTI_TIPLERI } from '../plumbing_v2/objects/pipe.js';
import { saveState } from '../general-files/history.js';
import { state } from '../general-files/main.js';

/**
 * Tek bir adımı temsil eder
 */
class VoiceStep {
    constructor(stepNumber, command, startPoint, endPoint) {
        this.stepNumber = stepNumber;
        this.command = command;       // Ayrıştırılmış komut nesnesi
        this.startPoint = startPoint ? { ...startPoint } : null;
        this.endPoint = endPoint ? { ...endPoint } : null;
        this.createdIds = [];         // Bu adımda oluşturulan nesne ID'leri (boru, bileşen vb.)
        this.active = true;           // Aktif mi (geri dönülünce pasif olabilir)
    }

    get text() {
        return commandToText(this.command);
    }
}

export class VoiceCommandManager {
    constructor() {
        this.steps = [];
        this.currentPosition = null;    // { x, y, z } mevcut konum
        this.lastPipeId = null;         // Son oluşturulan borunun ID'si
        this.lastComponentId = null;    // Son bileşen ID'si (servis kutusu vb.)
        this.isActive = false;          // Sesli komut modu aktif mi
        this.activeStepIndex = -1;      // Şu an hangi adımdan devam ediliyor

        // Olay dinleyicileri
        this._listeners = {
            stepAdded: [],
            stepUpdated: [],
            stepsChanged: [],
            positionChanged: [],
            activated: [],
            deactivated: [],
            error: []
        };

        // Singleton
        if (!window.voiceCommandManager) {
            window.voiceCommandManager = this;
        }
    }

    static getInstance() {
        return window.voiceCommandManager || new VoiceCommandManager();
    }

    // ───── OLAY SİSTEMİ ─────

    on(event, callback) {
        if (this._listeners[event]) {
            this._listeners[event].push(callback);
        }
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
     * Metin komutunu işle (sesli veya manuel girişten)
     * @param {string} text - Komut metni
     * @returns {object} Sonuç { success, message, step }
     */
    processCommand(text) {
        const cmd = parseVoiceCommand(text);
        if (!cmd) {
            const result = { success: false, message: `Tanınmayan komut: "${text}"` };
            this._emit('error', result);
            return result;
        }

        switch (cmd.type) {
            case 'place':
                return this._executePlaceCommand(cmd);
            case 'move':
                return this._executeMoveCommand(cmd);
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

    // ───── KOMUT YÜRÜTÜCÜLER ─────

    /**
     * Servis kutusu yerleştir
     */
    _executePlaceCommand(cmd) {
        if (cmd.object !== 'servis_kutusu') {
            return { success: false, message: 'Sadece servis kutusu yerleştirilebilir' };
        }

        // Mevcut servis kutusu varsa uyar
        const existingSK = plumbingManager.components.find(c => c.type === 'servis_kutusu');
        if (existingSK) {
            return { success: false, message: 'Zaten bir servis kutusu mevcut. Tek servis kutusu desteklenir.' };
        }

        saveState();

        // Varsayılan konum: Görünümün ortası veya sabit bir başlangıç noktası
        const startX = state.panOffset ? -state.panOffset.x / state.zoom + 200 : 200;
        const startY = state.panOffset ? -state.panOffset.y / state.zoom + 400 : 400;

        const servisKutusu = new ServisKutusu(startX, startY, {
            floorId: state.currentFloor?.id
        });

        plumbingManager.components.push(servisKutusu);
        plumbingManager.saveToState();

        // Çıkış noktasını mevcut konum olarak ayarla
        const cikis = servisKutusu.getCikisNoktasi();
        this.currentPosition = { x: cikis.x, y: cikis.y, z: cikis.z || 0 };
        this.lastComponentId = servisKutusu.id;
        this.lastPipeId = null;

        // Adım ekle
        const step = new VoiceStep(
            this.steps.length + 1,
            cmd,
            { x: startX, y: startY, z: 0 },
            { ...this.currentPosition }
        );
        step.createdIds.push(servisKutusu.id);
        this.steps.push(step);
        this.activeStepIndex = this.steps.length - 1;

        this._emit('stepAdded', step);
        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return { success: true, message: `Servis kutusu yerleştirildi (${Math.round(startX)}, ${Math.round(startY)})`, step };
    }

    /**
     * Yön komutunu yürüt - boru çiz
     */
    _executeMoveCommand(cmd) {
        if (!this.currentPosition) {
            return { success: false, message: 'Önce servis kutusu koyun!' };
        }

        const vec = directionToVector(cmd.direction, cmd.distance);
        const startPt = { ...this.currentPosition };
        const endPt = {
            x: startPt.x + vec.dx,
            y: startPt.y + vec.dy,
            z: (startPt.z || 0) + vec.dz
        };

        saveState();

        // Boru oluştur
        const boru = createBoru(startPt, endPt, 'STANDART');
        boru.floorId = state.currentFloor?.id;

        // Renk grubu belirleme - sayaç sonrası mı kontrol et
        boru.colorGroup = this._determineColorGroup();

        // Bağlantıları ayarla
        if (this.lastPipeId) {
            // Önceki boruya bağla
            boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.BORU, this.lastPipeId);
            const prevPipe = plumbingManager.findPipeById(this.lastPipeId);
            if (prevPipe) {
                prevPipe.setBitisBaglanti(BAGLANTI_TIPLERI.BORU, boru.id);
            }
        } else if (this.lastComponentId) {
            // Servis kutusuna bağla
            const comp = plumbingManager.findComponentById(this.lastComponentId);
            if (comp && comp.type === 'servis_kutusu') {
                boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.SERVIS_KUTUSU, this.lastComponentId);
                comp.baglaBoru(boru.id);
            } else if (comp && comp.type === 'sayac') {
                boru.setBaslangicBaglanti(BAGLANTI_TIPLERI.SAYAC, this.lastComponentId);
            }
        }

        plumbingManager.pipes.push(boru);
        plumbingManager.saveToState();

        // Durumu güncelle
        this.currentPosition = { ...endPt };
        this.lastPipeId = boru.id;

        // Adım ekle
        const step = new VoiceStep(
            this.steps.length + 1,
            cmd,
            startPt,
            endPt
        );
        step.createdIds.push(boru.id);
        this.steps.push(step);
        this.activeStepIndex = this.steps.length - 1;

        this._emit('stepAdded', step);
        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return { success: true, message: `${commandToText(cmd)} - Boru çizildi`, step };
    }

    /**
     * Belirli bir adıma geri dön
     */
    _executeGotoCommand(cmd) {
        const targetStep = cmd.step;
        if (targetStep < 1 || targetStep > this.steps.length) {
            return { success: false, message: `Geçersiz adım numarası: ${targetStep}. Mevcut adım sayısı: ${this.steps.length}` };
        }

        const step = this.steps[targetStep - 1];
        if (!step.endPoint) {
            return { success: false, message: `${targetStep}. adımın bitiş noktası bulunamadı` };
        }

        // Mevcut konumu hedef adımın bitiş noktasına ayarla
        this.currentPosition = { ...step.endPoint };
        this.activeStepIndex = targetStep - 1;

        // Son boru ID'sini bul - bu adımda oluşturulan son boru
        this.lastPipeId = null;
        this.lastComponentId = null;
        for (let i = step.createdIds.length - 1; i >= 0; i--) {
            const id = step.createdIds[i];
            if (plumbingManager.findPipeById(id)) {
                this.lastPipeId = id;
                break;
            }
            if (plumbingManager.findComponentById(id)) {
                this.lastComponentId = id;
            }
        }

        // Eğer boru bulunamadıysa, bu adıma kadar olan son boruyu bul
        if (!this.lastPipeId && !this.lastComponentId) {
            for (let i = targetStep - 1; i >= 0; i--) {
                const s = this.steps[i];
                for (let j = s.createdIds.length - 1; j >= 0; j--) {
                    const id = s.createdIds[j];
                    if (plumbingManager.findPipeById(id)) {
                        this.lastPipeId = id;
                        break;
                    }
                }
                if (this.lastPipeId) break;
            }
        }

        this._emit('stepsChanged', this.steps);
        this._emit('positionChanged', this.currentPosition);

        return { success: true, message: `${targetStep}. adıma geri dönüldü. Buradan devam edebilirsiniz.` };
    }

    /**
     * Son adımı geri al
     */
    _executeUndoCommand() {
        if (this.steps.length === 0) {
            return { success: false, message: 'Geri alınacak adım yok' };
        }

        const lastStep = this.steps.pop();

        // Oluşturulan nesneleri sil
        for (const id of lastStep.createdIds) {
            plumbingManager.deletePipe(id);
            plumbingManager.deleteComponent(id);
        }

        plumbingManager.saveToState();

        // Önceki adımın konumuna dön
        if (this.steps.length > 0) {
            const prevStep = this.steps[this.steps.length - 1];
            this.currentPosition = prevStep.endPoint ? { ...prevStep.endPoint } : null;
            this.activeStepIndex = this.steps.length - 1;

            // Son boru/bileşen ID'sini güncelle
            this.lastPipeId = null;
            this.lastComponentId = null;
            for (let i = prevStep.createdIds.length - 1; i >= 0; i--) {
                const id = prevStep.createdIds[i];
                if (plumbingManager.findPipeById(id)) {
                    this.lastPipeId = id;
                    break;
                }
                if (plumbingManager.findComponentById(id)) {
                    this.lastComponentId = id;
                }
            }
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
        return { success: true, message: `Sesli komut modu bitti. Toplam ${this.steps.length} adım çizildi.` };
    }

    // ───── YARDIMCI FONKSIYONLAR ─────

    /**
     * Renk grubunu belirle (sayaç öncesi/sonrası)
     */
    _determineColorGroup() {
        // Eğer son boru varsa onun rengini devam ettir
        if (this.lastPipeId) {
            const lastPipe = plumbingManager.findPipeById(this.lastPipeId);
            if (lastPipe) return lastPipe.colorGroup;
        }
        return 'YELLOW'; // Varsayılan: Sayaç öncesi sarı
    }

    /**
     * Tüm adımları temizle (yeni başlangıç)
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

    /**
     * Mevcut adım sayısı
     */
    get stepCount() {
        return this.steps.length;
    }

    /**
     * Belirli bir adımdan devam et (adıma dönüp yeni komut ver)
     * @param {number} stepNumber - Adım numarası (1-tabanlı)
     * @param {string} text - Yeni komut metni
     */
    continueFromStep(stepNumber, text) {
        const gotoResult = this._executeGotoCommand({ type: 'goto', step: stepNumber });
        if (!gotoResult.success) return gotoResult;
        return this.processCommand(text);
    }
}

export const voiceCommandManager = VoiceCommandManager.getInstance();
