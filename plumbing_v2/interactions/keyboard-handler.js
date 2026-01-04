/**
 * Keyboard Handler
 * Klavye girişlerini yönetir
 */

import { setMode, setState, setDrawingMode, state } from '../../../general-files/main.js';
import { saveState } from '../../../general-files/history.js';
import { handleBoruClick } from './pipe-drawing.js';

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

    // Boru çizim modunda ölçü girişi ve düşey mod
    if (this.boruCizimAktif && this.boruBaslangic) {
        // TAB - Düşey yükseklik panelini aç/kapat
        if (e.key === 'Tab') {
            e.preventDefault(); // Varsayılan tab davranışını engelle
            this.toggleVerticalPanel();
            return true;
        }

        // Düşey panel aktifken sayı girişi
        if (this.verticalModeActive) {
            if (/^[0-9\-+]$/.test(e.key)) {
                const input = document.getElementById('vertical-height-input');
                if (input) {
                    // Manuel olarak input'a ekle
                    const currentValue = input.value || '0';
                    if (e.key === '+' || e.key === '-') {
                        input.value = e.key + (currentValue === '0' ? '' : currentValue);
                    } else {
                        if (currentValue === '0') {
                            input.value = e.key;
                        } else {
                            input.value = currentValue + e.key;
                        }
                    }
                    this.verticalHeightInput = parseFloat(input.value) || 0;
                }
                return true;
            }

            // Backspace - son rakamı sil
            if (e.key === 'Backspace') {
                const input = document.getElementById('vertical-height-input');
                if (input && input.value.length > 0) {
                    const currentValue = input.value;
                    input.value = currentValue.slice(0, -1) || '0';
                    this.verticalHeightInput = parseFloat(input.value) || 0;
                }
                return true;
            }

            // Enter - düşey yüksekliği uygula ve paneli kapat
            if (e.key === 'Enter') {
                this.applyVerticalHeight();
                return true;
            }
        } else {
            // Normal ölçü girişi (düşey panel kapalıyken)
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
    }

    // ESC - iptal ve seç moduna geç
    if (e.key === 'Escape') {
        // Düşey panel açıksa önce onu kapat
        if (this.verticalModeActive) {
            this.closeVerticalPanel();
            return true;
        }

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

        // ArrowRight: İleri (Çocuk boru)
        if (e.key === 'ArrowRight') {
            // p2'ye bağlı olan boruları bul
            const nextPipes = this.manager.pipes.filter(p =>
                p.id !== selectedPipe.id &&
                Math.hypot(p.p1.x - selectedPipe.p2.x, p.p1.y - selectedPipe.p2.y) < tolerance
            );
            
            if (nextPipes.length > 0) {
                // Şimdilik ilk bulunanı seç
                this.selectObject(nextPipes[0]);
                return true;
            }
        }

        // ArrowLeft: Geri (Ebeveyn boru)
        if (e.key === 'ArrowLeft') {
            // p1'e bağlı olan boruyu bul (ebeveynin p2'si bizim p1'imize denk gelir)
            const prevPipe = this.manager.pipes.find(p =>
                p.id !== selectedPipe.id &&
                Math.hypot(p.p2.x - selectedPipe.p1.x, p.p2.y - selectedPipe.p1.y) < tolerance
            );
            if (prevPipe) {
                this.selectObject(prevPipe);
                return true;
            }
        }

        // ArrowUp / ArrowDown: Kardeşler (Siblings) - Aynı noktadan başlayan diğer borular
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Aynı başlangıç noktasına (p1) sahip boruları bul
            const siblings = this.manager.pipes.filter(p => 
                Math.hypot(p.p1.x - selectedPipe.p1.x, p.p1.y - selectedPipe.p1.y) < tolerance
            );

            if (siblings.length > 1) {
                // ID'ye göre sırala (kararlı geçiş için)
                siblings.sort((a, b) => a.id.localeCompare(b.id));

                const currentIndex = siblings.findIndex(p => p.id === selectedPipe.id);
                let newIndex;

                if (e.key === 'ArrowDown') {
                    // Sonraki kardeş
                    newIndex = (currentIndex + 1) % siblings.length;
                } else {
                    // Önceki kardeş
                    newIndex = (currentIndex - 1 + siblings.length) % siblings.length;
                }

                this.selectObject(siblings[newIndex]);
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

/**
 * Düşey yükseklik panelini aç/kapat
 */
export function toggleVerticalPanel() {
    const panel = document.getElementById('vertical-height-panel');
    if (!panel) return;

    if (this.verticalModeActive) {
        closeVerticalPanel.call(this);
    } else {
        openVerticalPanel.call(this);
    }
}

/**
 * Düşey yükseklik panelini aç
 */
function openVerticalPanel() {
    const panel = document.getElementById('vertical-height-panel');
    const input = document.getElementById('vertical-height-input');
    if (!panel || !input) return;

    // Mouse pozisyonunda paneli göster
    if (this.lastMousePoint) {
        const canvas = document.getElementById('c2d');
        const rect = canvas.getBoundingClientRect();

        // Mouse pozisyonunu ekran koordinatlarına çevir
        // lastMousePoint zaten screen koordinatlarında olmalı
        let screenX = this.lastMousePoint.screenX || rect.width / 2;
        let screenY = this.lastMousePoint.screenY || rect.height / 2;

        // Panel boyutlarını hesaba kat
        const panelWidth = 220; // Yaklaşık genişlik
        const panelHeight = 120; // Yaklaşık yükseklik

        // Ekran dışına taşmayı önle
        if (screenX + panelWidth > rect.width) {
            screenX = rect.width - panelWidth - 10;
        }
        if (screenY + panelHeight > rect.height) {
            screenY = rect.height - panelHeight - 10;
        }

        panel.style.left = `${screenX + 20}px`;
        panel.style.top = `${screenY}px`;
    }

    // Paneli göster
    panel.style.display = 'block';
    this.verticalModeActive = true;

    // Input değerini sıfırla
    input.value = '0';
    this.verticalHeightInput = 0;

    // Input'a focus ver
    setTimeout(() => input.focus(), 50);
}

/**
 * Düşey yükseklik panelini kapat
 */
export function closeVerticalPanel() {
    const panel = document.getElementById('vertical-height-panel');
    if (!panel) return;

    panel.style.display = 'none';
    this.verticalModeActive = false;
    this.verticalHeightInput = 0;
}

/**
 * Düşey yüksekliği uygula ve boru çiz
 */
export function applyVerticalHeight() {
    if (!this.boruCizimAktif || !this.boruBaslangic) {
        closeVerticalPanel.call(this);
        return;
    }

    const height = this.verticalHeightInput;

    // Yükseklik 0 ise paneli kapat ve normal çizime devam et
    if (height === 0) {
        closeVerticalPanel.call(this);
        return;
    }

    // Düşey boru ekle
    // Mevcut noktadan itibaren Z ekseninde yeni nokta oluştur
    const startPoint = this.boruBaslangic.nokta;
    const endPoint = {
        x: startPoint.x,
        y: startPoint.y,
        z: (startPoint.z || 0) + height
    };

    // Düşey boru oluştur ve ekle
    handleBoruClick(this, endPoint);

    // Panel kapat
    closeVerticalPanel.call(this);

    // Yeni başlangıç noktası artık bu yükseklikte
    // handleBoruClick içinde zaten boruBaslangic güncelleniyor
}
