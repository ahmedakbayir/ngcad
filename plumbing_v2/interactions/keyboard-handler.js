/**
 * Keyboard Handler
 * Klavye girişlerini yönetir
 */

import { setMode, setState, setDrawingMode, state } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
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

    // Düşey panel aktifse, klavye girişine izin ver (readonly input olsa bile)
    const isVerticalPanelInput = activeElement && activeElement.id === 'vertical-height-input';

    // Eğer kullanıcı bir input alanında yazıyorsa (ama düşey panel değilse), ESC ve Delete dışındaki kısayolları devre dışı bırak
    if (isTyping && !isVerticalPanelInput && e.key !== 'Escape' && e.key !== 'Delete') {
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
                    let currentValue = input.value || '0';
                    let newValue;

                    if (e.key === '+') {
                        // Artı: eğer '0' ise, pozitif başlangıç işareti
                        if (currentValue === '0' || currentValue === '-0') {
                            newValue = '0'; // Hazır, rakam bekliyor
                        } else {
                            // Zaten bir sayı varsa, pozitif yap
                            newValue = Math.abs(parseFloat(currentValue) || 0).toString();
                        }
                    } else if (e.key === '-') {
                        // Eksi: eğer '0' ise, negatif başlangıç işareti
                        if (currentValue === '0') {
                            newValue = '-'; // Negatif başlangıç, rakam bekliyor
                        } else if (currentValue === '-') {
                            newValue = '0'; // İkinci eksi iptal eder
                        } else {
                            // Zaten bir sayı varsa, işaret değiştir
                            const num = parseFloat(currentValue) || 0;
                            newValue = (-num).toString();
                        }
                    } else {
                        // Rakam: ekle
                        if (currentValue === '0') {
                            newValue = e.key;
                        } else if (currentValue === '-') {
                            newValue = '-' + e.key;
                        } else {
                            newValue = currentValue + e.key;
                        }
                    }

                    input.value = newValue;
                    // verticalHeightInput'u güncelle - ama sadece geçerli sayı ise
                    const parsedValue = parseFloat(newValue);
                    if (!isNaN(parsedValue)) {
                        this.verticalHeightInput = parsedValue;
                    }
                    // Eğer sadece "-" ise, henüz güncelleme (kullanıcı rakam girecek)
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
            // +/- ile düşey mod
            if (e.key === '+' || e.key === '-') {
                this.measurementInput = e.key;
                this.measurementActive = true;
                this.isVerticalMeasurement = true;
                return true;
            }

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
                    this.isVerticalMeasurement = false;
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
    // GÜNCELLENDİ: Seçili boru varsa onun ucundan başlat
    if (e.key === 't' || e.key === 'T') {
        // 1. Seçili boru var mı kontrol et
        if (this.selectedObject && this.selectedObject.type === 'boru') {
            const pipe = this.selectedObject;
            
            // Boş ucu bul (Önce P2 - bitiş, sonra P1 - başlangıç)
            let startPoint = null;
            
            if (this.manager.isTrulyFreeEndpoint(pipe.p2)) {
                startPoint = pipe.p2;
            } else if (this.manager.isTrulyFreeEndpoint(pipe.p1)) {
                startPoint = pipe.p1;
            }
            
            if (startPoint) {
                if (state.currentDrawingMode !== "KARMA") {
                    setDrawingMode("TESİSAT");
                }
                
                const sourceId = pipe.id;
                const sourceColor = pipe.colorGroup;
                this.cancelCurrentAction(); 
                
                this.startBoruCizim(startPoint, sourceId, 'boru', sourceColor);
                
                setMode("plumbingV2", true);
                return true;
            }
        }

        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("TESİSAT");
        }
        this.cancelCurrentAction();
        this.manager.startPipeMode();
        setMode("plumbingV2", true);
        return true;
    }

    // Delete - seçili nesneyi sil
    if (e.key === 'Delete') {
        if (this.selectedObject) {
            this.deleteSelectedObject();
            return true;
        }
        if (!this.selectedObject && state.selectedObject) {
            const stateObj = state.selectedObject;
            if (stateObj && ['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'].includes(stateObj.type)) {
                const obj = stateObj.object;
                if (obj) {
                    this.selectedObject = obj;
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
            // DÜZELTME: Z ekseni kontrolü eklendi
            const nextPipes = this.manager.pipes.filter(p =>
                p.id !== selectedPipe.id &&
                Math.hypot(
                    p.p1.x - selectedPipe.p2.x, 
                    p.p1.y - selectedPipe.p2.y,
                    (p.p1.z || 0) - (selectedPipe.p2.z || 0)
                ) < tolerance
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
            // DÜZELTME: Z ekseni kontrolü eklendi (Hatayı çözen kısım)
            const prevPipe = this.manager.pipes.find(p =>
                p.id !== selectedPipe.id &&
                Math.hypot(
                    p.p2.x - selectedPipe.p1.x, 
                    p.p2.y - selectedPipe.p1.y,
                    (p.p2.z || 0) - (selectedPipe.p1.z || 0)
                ) < tolerance
            );
            if (prevPipe) {
                this.selectObject(prevPipe);
                return true;
            }
        }

        // ArrowUp / ArrowDown: Kardeşler (Siblings) - Aynı noktadan başlayan diğer borular
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Aynı başlangıç noktasına (p1) sahip boruları bul
            // DÜZELTME: Z ekseni kontrolü eklendi
            const siblings = this.manager.pipes.filter(p => 
                Math.hypot(
                    p.p1.x - selectedPipe.p1.x, 
                    p.p1.y - selectedPipe.p1.y,
                    (p.p1.z || 0) - (selectedPipe.p1.z || 0)
                ) < tolerance
            );

            if (siblings.length > 1) {
                siblings.sort((a, b) => a.id.localeCompare(b.id));

                const currentIndex = siblings.findIndex(p => p.id === selectedPipe.id);
                let newIndex;

                if (e.key === 'ArrowDown') {
                    newIndex = (currentIndex + 1) % siblings.length;
                } else {
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

    // // R tuşu - seçili servis kutusunu döndür
    // if (this.selectedObject && this.selectedObject.type === 'servis_kutusu' && e.key === 'r') {
    //     saveState();
    //     const deltaDerece = e.shiftKey ? -15 : 15;
    //     const result = this.selectedObject.rotate(deltaDerece);
    //     this.updateConnectedPipe(result);
    //     this.manager.saveToState();
    //     return true;
    // }

    return false;
}

/**
 * Düşey yükseklik panelini aç/kapat
 */
export function toggleVerticalPanel() {
    const panel = document.getElementById('vertical-height-panel');
    if (!panel) return;

    if (this.verticalModeActive) {
        applyVerticalHeight.call(this);
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

    if (this.lastMousePoint) {
        const canvas = document.getElementById('c2d');
        const rect = canvas.getBoundingClientRect();

        let screenX = this.lastMousePoint.screenX || rect.width / 2;
        let screenY = this.lastMousePoint.screenY || rect.height / 2;

        const panelWidth = 220;
        const panelHeight = 120;

        if (screenX + panelWidth > rect.width) {
            screenX = rect.width - panelWidth - 10;
        }
        if (screenY + panelHeight > rect.height) {
            screenY = rect.height - panelHeight - 10;
        }

        panel.style.left = `${screenX + 20}px`;
        panel.style.top = `${screenY}px`;
    }

    panel.style.display = 'block';
    this.verticalModeActive = true;

    input.value = '100';
    this.verticalHeightInput = 0;

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

    const input = document.getElementById('vertical-height-input');
    const height = input ? parseFloat(input.value) : this.verticalHeightInput;

    if (height === 0) {
        closeVerticalPanel.call(this);
        return;
    }

    const startPoint = this.boruBaslangic.nokta;
    const endPoint = {
        x: startPoint.x,
        y: startPoint.y,
        z: (startPoint.z || 0) + height
    };

    handleBoruClick(this, endPoint);

    closeVerticalPanel.call(this);
}