/**
 * Keyboard Handler
 * Klavye girişlerini yönetir
 */

import { setMode, setState, setDrawingMode, state } from '../../../general-files/main.js';
import { saveState } from '../../../general-files/history.js';

// Tool modları
export const TESISAT_MODLARI = {
    NONE: null,
    SERVIS_KUTUSU: 'servis_kutusu',
    BORU: 'boru',
    SAYAC: 'sayac',
    VANA: 'vana',
    CIHAZ: 'cihaz'
};

export function handleKeyDown(e) {
    // Input alanlarında yazarken klavye kısayollarını tetikleme
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
    );

    // Eğer kullanıcı bir input alanında yazıyorsa, ESC ve Delete dışındaki kısayolları devre dışı bırak
    if (isTyping && e.key !== 'Escape' && e.key !== 'Delete') {
        return false;
    }

    // Boru çizim modunda ölçü girişi
    if (this.boruCizimAktif && this.boruBaslangic) {
        // Rakam girişi (0-9)
        if (/^[0-9]$/.test(e.key)) {
            this.measurementInput += e.key;
            this.measurementActive = true;
            return true;
        }

        // Backspace - son rakamı sil
        if (e.key === 'Backspace' && this.measurementInput.length > 0) {
            this.measurementInput = this.measurementInput.slice(0, -1);
            if (this.measurementInput.length === 0) {
                this.measurementActive = false;
            }
            return true;
        }

        // Enter - ölçüyü uygula
        if (e.key === 'Enter' && this.measurementInput.length > 0) {
            this.applyMeasurement();
            return true;
        }
    }

    // ESC - iptal ve seç moduna geç
    if (e.key === 'Escape') {
        // Baca çizim modundaysa, çizimi bitir
        if (this.manager.tempComponent && this.manager.tempComponent.type === 'baca' &&
            this.manager.tempComponent.isDrawing && this.manager.tempComponent.parentCihazId) {
            saveState();
            this.manager.tempComponent.finishDrawing();
            this.manager.saveToState();
            this.manager.tempComponent = null;
            this.manager.activeTool = null;
            setMode("select");
            return true;
        }

        this.cancelCurrentAction();
        setMode("select");
        return true;
    }

    // K - Kombi ekle (Ghost mod)
    if (e.key === 'k' || e.key === 'K') {
        // Önceki modu kaydet
        this.previousMode = state.currentMode;
        this.previousDrawingMode = state.currentDrawingMode;
        this.previousActiveTool = this.manager.activeTool;

        // TESİSAT moduna geç
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("TESİSAT");
        }

        // Mevcut eylemleri iptal et
        this.cancelCurrentAction();

        // DÜZELTİLDİ: Parametre nesne olarak gönderilmeli
        this.manager.startPlacement('cihaz', { cihazTipi: 'KOMBI' });
        setMode("plumbingV2", true);

        return true;
    }

    // O - Ocak ekle (Ghost mod)
    if (e.key === 'o' || e.key === 'O') {
        // Önceki modu kaydet
        this.previousMode = state.currentMode;
        this.previousDrawingMode = state.currentDrawingMode;
        this.previousActiveTool = this.manager.activeTool;
        this.cancelCurrentAction();

        // TESİSAT moduna geç
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("TESİSAT");
        }

        // Mevcut eylemleri iptal et
        this.cancelCurrentAction();

        // DÜZELTİLDİ: Parametre nesne olarak gönderilmeli
        // Eskiden sadece 'OCAK' stringi gönderildiği için varsayılan (KOMBI) seçiliyordu.
        this.manager.startPlacement('cihaz', { cihazTipi: 'OCAK' });
        setMode("plumbingV2", true);

        return true;
    }

    // S - Sayaç ekle (Ghost mod)
    if (e.key === 's' || e.key === 'S') {
        // Önceki modu kaydet
        this.previousMode = state.currentMode;
        this.previousDrawingMode = state.currentDrawingMode;
        this.previousActiveTool = this.manager.activeTool;

        // TESİSAT moduna geç
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("TESİSAT");
        }

        // Mevcut eylemleri iptal et
        this.cancelCurrentAction();

        // Sayaç ghost modunu başlat
        this.manager.startPlacement(TESISAT_MODLARI.SAYAC);
        setMode("plumbingV2", true);

        return true;
    }

    // V - Vana ekle (Ghost mod)
    if (e.key === 'v' || e.key === 'V') {
        // Önceki modu kaydet
        this.previousMode = state.currentMode;
        this.previousDrawingMode = state.currentDrawingMode;
        this.previousActiveTool = this.manager.activeTool;

        // TESİSAT moduna geç
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("TESİSAT");
        }

        // Mevcut eylemleri iptal et
        this.cancelCurrentAction();

        // Vana ghost modunu başlat
        this.manager.startPlacement(TESISAT_MODLARI.VANA);
        setMode("plumbingV2", true);

        return true;
    }

    // T - BORU çizme modu (boru icon'unu aktif et)
    if (e.key === 't' || e.key === 'T') {
        // TESİSAT modunda olduğumuzdan emin ol
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("TESİSAT");
        }
        this.cancelCurrentAction();
        // Boru modunu başlat
        this.manager.startPipeMode();

        // UI ikonunu güncelle
        setMode("plumbingV2", true);
        return true;
    }

    // Delete - seçili nesneyi sil
    if (e.key === 'Delete') {
        // Hem this.selectedObject hem de state.selectedObject'i kontrol et
        if (this.selectedObject) {
            this.deleteSelectedObject();
            return true;
        }
        // Eğer this.selectedObject null ama state.selectedObject varsa, önce seç sonra sil
        if (!this.selectedObject && state.selectedObject) {
            const stateObj = state.selectedObject;
            // V2 plumbing nesnesi mi kontrol et
            if (stateObj && ['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'].includes(stateObj.type)) {
                // Nesneyi bul ve seç
                const obj = stateObj.object;
                if (obj) {
                    // this.selectedObject'i senkronize et
                    this.selectedObject = obj;
                    // Şimdi sil
                    this.deleteSelectedObject();
                    return true;
                }
            }
        }
    }

    // Ok tuşları - seçili boru navigasyonu
    if (this.selectedObject && this.selectedObject.type === 'boru') {
        const tolerance = 1;
        const selectedPipe = this.selectedObject;

        // ArrowRight veya ArrowUp: sonraki boru (p2'ye bağlı boru)
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            const nextPipe = this.manager.pipes.find(p =>
                p.id !== selectedPipe.id &&
                Math.hypot(p.p1.x - selectedPipe.p2.x, p.p1.y - selectedPipe.p2.y) < tolerance
            );
            if (nextPipe) {
                this.selectObject(nextPipe);
                return true;
            }
        }

        // ArrowLeft veya ArrowDown: önceki boru (p1'e bağlı boru)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            const prevPipe = this.manager.pipes.find(p =>
                p.id !== selectedPipe.id &&
                Math.hypot(p.p2.x - selectedPipe.p1.x, p.p2.y - selectedPipe.p1.y) < tolerance
            );
            if (prevPipe) {
                this.selectObject(prevPipe);
                return true;
            }
        }
    }

    // Ok tuşları - seçili sayacı hareket ettir
    if (this.selectedObject && this.selectedObject.type === 'sayac') {
        const direction = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        }[e.key];

        if (direction) {
            const result = this.selectedObject.moveByKey(direction);
            this.updateConnectedPipe(result);
            return true;
        }
    }

    // R tuşu - seçili servis kutusunu döndür (çıkış noktası etrafında)
    if (this.selectedObject && this.selectedObject.type === 'servis_kutusu' && e.key === 'r') {
        saveState();
        const deltaDerece = e.shiftKey ? -15 : 15; // Shift ile ters yön
        const result = this.selectedObject.rotate(deltaDerece);
        this.updateConnectedPipe(result);
        this.manager.saveToState();
        return true;
    }

    return false;
}
