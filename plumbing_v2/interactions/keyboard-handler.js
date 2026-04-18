/**
 * Keyboard Handler
 * Klavye girişlerini yönetir
 */

import { setMode, setState, setDrawingMode, state } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { handleBoruClick } from './pipe-drawing.js';
import { draw2D } from '../../draw/draw2d.js';
import { collectDownstreamNodes, collectDownstreamPipes } from './drag-handler.js';
import { translateLabel, clearLabelAutoPos } from '../renderer/renderer-labels.js';
import { Boru } from '../objects/pipe.js';
import { Vana } from '../objects/valve.js';
import { Sayac } from '../objects/meter.js';
import { Cihaz } from '../objects/device.js';
import { Baca } from '../objects/chimney.js';
import { togglePropertiesPanel, closePropertiesPanel, isPanelOpen, isPinned } from '../properties/properties-panel.js';

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

    // Seçili boru yeniden boyutlandırma / düşey hat ekleme (boru çizim modu dışında, seçili boru varsa)
    if (!this.boruCizimAktif && this.selectedObject?.type === 'boru') {
        // +/- ile başlayan giriş: P2'ye düşey boru ekle
        if ((e.key === '+' || e.key === '-') && !this.pipeResizeActive) {
            this.pipeResizeInput = e.key;
            this.pipeResizeActive = true;
            return true;
        }
        if (/^[0-9]$/.test(e.key)) {
            this.pipeResizeInput += e.key;
            this.pipeResizeActive = true;
            return true;
        }
        if (e.key === 'Backspace' && this.pipeResizeActive) {
            this.pipeResizeInput = this.pipeResizeInput.slice(0, -1);
            if (this.pipeResizeInput.length === 0) this.pipeResizeActive = false;
            return true;
        }
        if (e.key === 'Enter' && this.pipeResizeActive) {
            const inp = this.pipeResizeInput;
            if (inp.startsWith('+') || inp.startsWith('-')) {
                applyVerticalPipeInsert.call(this);
            } else {
                applyPipeResize.call(this);
            }
            return true;
        }
    }

    // SPACE - Özellikler panelini aç/kapat
    if (e.key === ' ' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const sel = this.selectedObject;
        const selVana = this.selectedValve?.vana;
        const target = (sel && ['boru', 'sayac', 'servis_kutusu', 'cihaz'].includes(sel.type)) ? sel
            : selVana ? selVana
            : null;
        if (target) {
            togglePropertiesPanel(target, this.manager);
            return true;
        }
        if (isPanelOpen() && !isPinned()) {
            closePropertiesPanel();
            return true;
        }
        return false;
    }

    // ESC - iptal ve seç moduna geç
    if (e.key === 'Escape') {
        // Boru resize aktifse önce onu iptal et
        if (this.pipeResizeActive) {
            this.pipeResizeInput = '';
            this.pipeResizeActive = false;
            return true;
        }
        // Özellikler paneli açıksa önce onu kapat (pinli olsa bile ESC kapatır)
        if (isPanelOpen()) {
            closePropertiesPanel();
            return true;
        }
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

    // K - Kombi ekle (Ghost mod, ya da 3D + seçili hat varsa otomatik)
    if ((e.key === 'k' || e.key === 'K') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if ((state.viewBlendFactor || 0) > 0.1) {
            const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
            if (boruUcuInfo) {
                this.cancelCurrentAction();
                this.manager.placeDeviceAtOpenEnd('KOMBI', boruUcuInfo);
                return true;
            }
        }
        // 2D mod veya seçili hat yoksa ghost mod
        this.previousMode = state.currentMode;
        this.previousDrawingMode = state.currentDrawingMode;
        this.previousActiveTool = this.manager.activeTool;
        if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
        this.cancelCurrentAction();
        this.manager.startPlacement('cihaz', { cihazTipi: 'KOMBI' });
        setMode("plumbingV2", true);
        return true;
    }

    // O - Ocak ekle (Ghost mod, ya da 3D + seçili hat varsa otomatik)
    if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if ((state.viewBlendFactor || 0) > 0.1) {
            const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
            if (boruUcuInfo) {
                this.cancelCurrentAction();
                this.manager.placeDeviceAtOpenEnd('OCAK', boruUcuInfo);
                return true;
            }
        }
        // 2D mod veya seçili hat yoksa ghost mod
        this.previousMode = state.currentMode;
        this.previousDrawingMode = state.currentDrawingMode;
        this.previousActiveTool = this.manager.activeTool;
        this.cancelCurrentAction();
        if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
        this.cancelCurrentAction();
        this.manager.startPlacement('cihaz', { cihazTipi: 'OCAK' });
        setMode("plumbingV2", true);
        return true;
    }

    // S - Sayaç ekle (Ghost mod)
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
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
    if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.altKey && !e.metaKey) {
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
    if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.altKey && !e.metaKey) {
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

    // CTRL+C - Kopyala (seçili boru ve sonrasındaki tüm parçaları)
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        // this.selectedObject yoksa state.selectedObject'ten al
        const selForCopy = this.selectedObject ||
            (state.selectedObject?.object?.type === 'boru' ? state.selectedObject.object : null);
        if (selForCopy && selForCopy.type === 'boru') {
            if (!this.selectedObject) this.selectedObject = selForCopy;
            handlePipeCopy.call(this);
            draw2D();
            return true;
        }
    }

    // CTRL+X - Kes (seçili boru ve sonrasındaki tüm parçaları)
    if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
        // this.selectedObject yoksa state.selectedObject'ten al
        const selForCut = this.selectedObject ||
            (state.selectedObject?.object?.type === 'boru' ? state.selectedObject.object : null);
        if (selForCut && selForCut.type === 'boru') {
            if (!this.selectedObject) this.selectedObject = selForCut;
            handlePipeCut.call(this);
            draw2D();
            return true;
        }
    }

    // CTRL+V - Yapıştır (canvas tıklamasını bekle — handle-pointer-down.js halleder)
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (this.copiedPipes || this.cutPipes) {
            return true; // Mimari handler'a geçmeyi engelle; yapıştırma canvas tıklamasıyla olur
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

/**
 * Seçili borudan başlayarak downstream (sonrasındaki) tüm boruları ve bileşenleri bulur
 * BFS algoritması kullanarak tüm bağlı zinciri toplar
 */
/**
 * 3D modda seçili hattın boş ucunu döndürür.
 * `this` = InteractionManager bağlamında çağrılır.
 * @returns {{ pipe, end, point } | null}
 */
function _getSeciliHatinBosUcu() {
    const manager = this.manager;
    // Seçili boruları bul
    const seciliPipes = manager.pipes.filter(p => p.isSelected);
    if (seciliPipes.length === 0) return null;

    for (const pipe of seciliPipes) {
        // p1 ucunu kontrol et
        if (manager.isTrulyFreeEndpoint(pipe.p1, 1)) {
            const hasDevice = manager.components.some(c =>
                (c.type === 'cihaz' || c.type === 'sayac') &&
                c.fleksBaglanti?.boruId === pipe.id &&
                c.fleksBaglanti?.endpoint === 'p1'
            );
            if (!hasDevice) return { pipe, end: 'p1', point: pipe.p1 };
        }
        // p2 ucunu kontrol et
        if (manager.isTrulyFreeEndpoint(pipe.p2, 1)) {
            const hasDevice = manager.components.some(c =>
                (c.type === 'cihaz' || c.type === 'sayac') &&
                c.fleksBaglanti?.boruId === pipe.id &&
                c.fleksBaglanti?.endpoint === 'p2'
            );
            if (!hasDevice) return { pipe, end: 'p2', point: pipe.p2 };
        }
    }
    return null;
}

function getDownstreamPipesAndComponents(startPipe, manager) {
    const result = {
        pipes: [],
        components: [],
        connections: new Map() // pipe.id -> { p1Connection, p2Connection }
    };

    const visited = new Set();
    const queue = [startPipe];
    const tolerance = 1; // 3D mesafe toleransı

    // Başlangıç borusunu ekle
    visited.add(startPipe.id);
    result.pipes.push(startPipe);

    // Bağlantı bilgilerini kaydet
    result.connections.set(startPipe.id, {
        p1Connection: startPipe.baslangicBaglanti ? JSON.parse(JSON.stringify(startPipe.baslangicBaglanti)) : null,
        p2Connection: startPipe.bitisBaglanti ? JSON.parse(JSON.stringify(startPipe.bitisBaglanti)) : null
    });

    // BFS ile tüm downstream pipe'ları bul
    while (queue.length > 0) {
        const currentPipe = queue.shift();

        // p2 ucuna bağlı boruları bul (downstream direction)
        const nextPipes = manager.pipes.filter(p =>
            !visited.has(p.id) &&
            Math.hypot(
                p.p1.x - currentPipe.p2.x,
                p.p1.y - currentPipe.p2.y,
                (p.p1.z || 0) - (currentPipe.p2.z || 0)
            ) < tolerance
        );

        for (const nextPipe of nextPipes) {
            visited.add(nextPipe.id);
            result.pipes.push(nextPipe);
            queue.push(nextPipe);

            // Bağlantı bilgilerini kaydet
            result.connections.set(nextPipe.id, {
                p1Connection: nextPipe.baslangicBaglanti ? JSON.parse(JSON.stringify(nextPipe.baslangicBaglanti)) : null,
                p2Connection: nextPipe.bitisBaglanti ? JSON.parse(JSON.stringify(nextPipe.bitisBaglanti)) : null
            });
        }

        // T-bağlantılardan çıkan boruları da ekle
        if (currentPipe.tBaglantilar && currentPipe.tBaglantilar.length > 0) {
            for (const tBaglanti of currentPipe.tBaglantilar) {
                const branchPipe = manager.pipes.find(p => p.id === tBaglanti.boruId);
                if (branchPipe && !visited.has(branchPipe.id)) {
                    visited.add(branchPipe.id);
                    result.pipes.push(branchPipe);
                    queue.push(branchPipe);

                    // Bağlantı bilgilerini kaydet
                    result.connections.set(branchPipe.id, {
                        p1Connection: branchPipe.baslangicBaglanti ? JSON.parse(JSON.stringify(branchPipe.baslangicBaglanti)) : null,
                        p2Connection: branchPipe.bitisBaglanti ? JSON.parse(JSON.stringify(branchPipe.bitisBaglanti)) : null
                    });
                }
            }
        }

        // Bu boru üzerindeki Vana bileşenlerini topla (manager.components'tan, bagliBoruId ile)
        // NOT: pipe.vana eski stil basit metadata'dır; gerçek vana bileşenleri manager.components'tedir.
        for (const comp of manager.components) {
            if (comp.type === 'vana' && comp.bagliBoruId === currentPipe.id) {
                result.components.push({
                    type: 'vana',
                    object: comp,
                    parentPipeId: currentPipe.id
                });
            }
        }

        // Bu borunun uçlarına bağlı bileşenleri bul (sayaç, cihaz, baca)
        // NOT: girisNoktasi bir metod olduğu için doğrudan erişilemez;
        //      fleksBaglanti.boruId ile bağlantı kontrolü yapılır.
        for (const component of manager.components) {
            // Sayaç kontrolü: fleksBaglanti ile boru bağlantısına bak
            if (component.type === 'sayac' && component.fleksBaglanti?.boruId === currentPipe.id) {
                result.components.push({
                    type: 'sayac',
                    object: component,
                    parentPipeId: currentPipe.id,
                    connectionEndpoint: component.fleksBaglanti.endpoint
                });

                // Sayacın çıkış borusunu BFS'e ekle (sayaç üzerinden geçiş)
                if (component.cikisBagliBoruId) {
                    const nextPipe = manager.pipes.find(p => p.id === component.cikisBagliBoruId);
                    if (nextPipe && !visited.has(nextPipe.id)) {
                        visited.add(nextPipe.id);
                        result.pipes.push(nextPipe);
                        queue.push(nextPipe);
                        result.connections.set(nextPipe.id, {
                            p1Connection: nextPipe.baslangicBaglanti ? JSON.parse(JSON.stringify(nextPipe.baslangicBaglanti)) : null,
                            p2Connection: nextPipe.bitisBaglanti    ? JSON.parse(JSON.stringify(nextPipe.bitisBaglanti))    : null
                        });
                    }
                }
            }
            // Cihaz kontrolü
            else if (component.type === 'cihaz' && component.fleksBaglanti?.boruId === currentPipe.id) {
                result.components.push({
                    type: 'cihaz',
                    object: component,
                    parentPipeId: currentPipe.id,
                    connectionEndpoint: component.fleksBaglanti.endpoint
                });

                // Cihazın bacasını da ekle
                const baca = manager.components.find(c =>
                    c.type === 'baca' && c.parentCihazId === component.id
                );
                if (baca) {
                    result.components.push({
                        type: 'baca',
                        object: baca,
                        parentCihazId: component.id
                    });
                }
            }
        }
    }

    return result;
}

/**
 * CTRL+C - Kopyala
 * Seçili boru ve sonrasındaki tüm parçaları kopyalar
 */
export function handlePipeCopy() {
    if (!this.selectedObject || this.selectedObject.type !== 'boru') {
        return;
    }

    const selectedPipe = this.selectedObject;

    // Downstream pipe'ları ve bileşenleri bul
    const downstream = getDownstreamPipesAndComponents(selectedPipe, this.manager);

    // Kopyalanacak veriyi hazırla
    this.copiedPipes = {
        pipes: downstream.pipes.map(pipe => ({
            id: pipe.id,
            p1: { ...pipe.p1 },
            p2: { ...pipe.p2 },
            boruTipi: pipe.boruTipi,
            boruCap: pipe.boruCap,
            colorGroup: pipe.colorGroup,
            floorId: pipe.floorId,
            baslangicBaglanti: downstream.connections.get(pipe.id).p1Connection,
            bitisBaglanti: downstream.connections.get(pipe.id).p2Connection,
            tBaglantilar: pipe.tBaglantilar ? JSON.parse(JSON.stringify(pipe.tBaglantilar)) : [],
            uzerindekiElemanlar: pipe.uzerindekiElemanlar ? JSON.parse(JSON.stringify(pipe.uzerindekiElemanlar)) : []
        })),
        components: downstream.components.map(comp => ({
            type: comp.type,
            data: JSON.parse(JSON.stringify(comp.object)),
            parentPipeId: comp.parentPipeId,
            parentCihazId: comp.parentCihazId,
            connectionPoint: comp.connectionPoint
        })),
        referencePoint: { ...selectedPipe.p1 } // İlk borunun p1'i referans nokta
    };

    // Cut state'i temizle
    this.cutPipes = null;
    this.cutPipesOriginalIds = null;

    console.log(`✅ ${downstream.pipes.length} boru ve ${downstream.components.length} bileşen kopyalandı`);
}

/**
 * CTRL+X - Kes
 * Seçili boru ve sonrasındaki tüm parçaları keser (ghost olarak gösterilir)
 */
export function handlePipeCut() {
    if (!this.selectedObject || this.selectedObject.type !== 'boru') {
        return;
    }

    const selectedPipe = this.selectedObject;

    // Downstream pipe'ları ve bileşenleri bul
    const downstream = getDownstreamPipesAndComponents(selectedPipe, this.manager);

    // Kesilecek veriyi hazırla
    this.cutPipes = {
        pipes: downstream.pipes.map(pipe => ({
            id: pipe.id,
            p1: { ...pipe.p1 },
            p2: { ...pipe.p2 },
            boruTipi: pipe.boruTipi,
            boruCap: pipe.boruCap,
            colorGroup: pipe.colorGroup,
            floorId: pipe.floorId,
            baslangicBaglanti: downstream.connections.get(pipe.id).p1Connection,
            bitisBaglanti: downstream.connections.get(pipe.id).p2Connection,
            tBaglantilar: pipe.tBaglantilar ? JSON.parse(JSON.stringify(pipe.tBaglantilar)) : [],
            uzerindekiElemanlar: pipe.uzerindekiElemanlar ? JSON.parse(JSON.stringify(pipe.uzerindekiElemanlar)) : []
        })),
        components: downstream.components.map(comp => ({
            type: comp.type,
            data: JSON.parse(JSON.stringify(comp.object)),
            parentPipeId: comp.parentPipeId,
            parentCihazId: comp.parentCihazId,
            connectionPoint: comp.connectionPoint
        })),
        referencePoint: { ...selectedPipe.p1 } // İlk borunun p1'i referans nokta
    };

    // Orijinal ID'leri sakla (paste'ten sonra silmek için)
    this.cutPipesOriginalIds = {
        pipeIds: downstream.pipes.map(p => p.id),
        componentIds: downstream.components.map(c => c.object.id)
    };

    // Copy state'i temizle
    this.copiedPipes = null;

    console.log(`✂️ ${downstream.pipes.length} boru ve ${downstream.components.length} bileşen kesildi`);
}

/**
 * CTRL+V - Yapıştır
 * Kopyalanan/kesilen parçaları mouse pozisyonuna yapıştırır
 */
export function handlePipePaste() {
    const pasteData = this.cutPipes || this.copiedPipes;

    if (!pasteData || !this.lastMousePoint) {
        return;
    }

    const isCut = !!this.cutPipes;

    // Snap geçersiz kılma varsa (endpoint snap ile tıklama) onu kullan
    const targetPt = this._pasteSnapOverride || this.lastMousePoint;

    // Referans noktasından hedef noktaya olan farkı hesapla
    const dx = targetPt.x - pasteData.referencePoint.x;
    const dy = targetPt.y - pasteData.referencePoint.y;
    const dz = (targetPt.z || 0) - (pasteData.referencePoint.z || 0);

    saveState();

    // Yeni ID mapping (eski ID -> yeni ID)
    const pipeIdMap = new Map();
    const componentIdMap = new Map();
    const newPipes = [];
    const newComponents = [];

    // 1. Boruları oluştur
    // getOrCreateNodeAt kullanarak komşu borular arasında NODE PAYLAŞIMI sağlanır.
    // Drag sistemi "p.p1 === node" referans eşitliğiyle çalıştığı için bu kritiktir;
    // aksi hâlde yapıştırılan borular geometrik olarak bitişik olsa da bağımsız sürüklenir.
    for (const pipeData of pasteData.pipes) {
        const p1Node = this.manager.getOrCreateNodeAt(
            pipeData.p1.x + dx, pipeData.p1.y + dy, (pipeData.p1.z || 0) + dz
        );
        const p2Node = this.manager.getOrCreateNodeAt(
            pipeData.p2.x + dx, pipeData.p2.y + dy, (pipeData.p2.z || 0) + dz
        );

        const newPipe = new Boru(p1Node, p2Node, pipeData.boruTipi);

        newPipe.colorGroup = pipeData.colorGroup;
        newPipe.floorId = pipeData.floorId;
        if (pipeData.boruCap) newPipe.boruCap = pipeData.boruCap;

        // ID mapping'i kaydet
        pipeIdMap.set(pipeData.id, newPipe.id);

        // Bağlantı bilgilerini güncelle (ID'ler henüz eski, sonra güncellenecek)
        if (pipeData.baslangicBaglanti) {
            newPipe.baslangicBaglanti = JSON.parse(JSON.stringify(pipeData.baslangicBaglanti));
        }
        if (pipeData.bitisBaglanti) {
            newPipe.bitisBaglanti = JSON.parse(JSON.stringify(pipeData.bitisBaglanti));
        }

        // T-bağlantıları kopyala (ID'ler sonra güncellenecek)
        if (pipeData.tBaglantilar && pipeData.tBaglantilar.length > 0) {
            newPipe.tBaglantilar = JSON.parse(JSON.stringify(pipeData.tBaglantilar));
        }

        newPipes.push(newPipe);
        this.manager.pipes.push(newPipe);
        this.manager.registerPipeNodes(newPipe); // Node'ları sisteme kaydet
    }

    // 2. Pipe bağlantı ID'lerini güncelle
    for (let i = 0; i < newPipes.length; i++) {
        const newPipe = newPipes[i];
        const oldPipeData = pasteData.pipes[i];

        // Başlangıç bağlantısı
        if (newPipe.baslangicBaglanti && newPipe.baslangicBaglanti.tip === 'boru') {
            const newTargetId = pipeIdMap.get(newPipe.baslangicBaglanti.hedefId);
            if (newTargetId) {
                newPipe.baslangicBaglanti.hedefId = newTargetId;
            } else {
                // Hedef boru kopyalanmadıysa bağlantıyı kaldır
                newPipe.baslangicBaglanti = null;
            }
        }

        // Bitiş bağlantısı
        if (newPipe.bitisBaglanti && newPipe.bitisBaglanti.tip === 'boru') {
            const newTargetId = pipeIdMap.get(newPipe.bitisBaglanti.hedefId);
            if (newTargetId) {
                newPipe.bitisBaglanti.hedefId = newTargetId;
            } else {
                newPipe.bitisBaglanti = null;
            }
        }

        // T-bağlantıları güncelle
        if (newPipe.tBaglantilar && newPipe.tBaglantilar.length > 0) {
            newPipe.tBaglantilar = newPipe.tBaglantilar.map(tBag => {
                const newBranchId = pipeIdMap.get(tBag.boruId);
                if (newBranchId) {
                    return {
                        pozisyon: {
                            x: tBag.pozisyon.x + dx,
                            y: tBag.pozisyon.y + dy,
                            z: (tBag.pozisyon.z || 0) + dz
                        },
                        boruId: newBranchId
                    };
                }
                return null;
            }).filter(t => t !== null);
        }
    }

    // 3. Bileşenleri oluştur
    for (const compData of pasteData.components) {
        let newComponent = null;

        if (compData.type === 'vana') {
            // Vana: parentPipeId'yi bul
            const newParentPipeId = pipeIdMap.get(compData.parentPipeId);
            const newParentPipe = newPipes.find(p => p.id === newParentPipeId);

            if (newParentPipe) {
                const vanaData = compData.data;

                // Vana constructor: (x, y, tip, options)
                const newVana = new Vana(vanaData.x + dx, vanaData.y + dy, vanaData.vanaTipi, {
                    z: (vanaData.z || 0) + dz,
                    floorId: vanaData.floorId,
                    bagliBoruId: newParentPipe.id,  // yeni boru ID'si ile bağla
                    boruPozisyonu: vanaData.boruPozisyonu,
                    fromEnd: vanaData.fromEnd,
                    fixedDistance: vanaData.fixedDistance
                });
                newVana.rotation = vanaData.rotation;
                newVana.showEndCap = vanaData.showEndCap || false;

                // girisBagliBoruId / cikisBagliBoruId (BRANSMAN/YANBINA vanalar için)
                if (vanaData.girisBagliBoruId) {
                    const newGirisId = pipeIdMap.get(vanaData.girisBagliBoruId);
                    if (newGirisId) newVana.girisBagliBoruId = newGirisId;
                }
                if (vanaData.cikisBagliBoruId) {
                    const newCikisId = pipeIdMap.get(vanaData.cikisBagliBoruId);
                    if (newCikisId) newVana.cikisBagliBoruId = newCikisId;
                }

                // Panel özellikleri (fromJSON ile aynı alan listesi)
                ['vanaCap', 'izolator', 'flans', 'muhafaza', 'muhafazaGrupla',
                 'birimNo', 'tesisatNo', 'daireSayisi', 'dukkanSayisi',
                 'ekDebi', 'bransmanDebi', 'description'].forEach(k => {
                    if (vanaData[k] !== undefined) newVana[k] = vanaData[k];
                });

                this.manager.components.push(newVana);
                newVana.updateEndCapStatus(this.manager);

                componentIdMap.set(vanaData.id, newVana.id);
                newComponents.push(newVana);
            }
        }
        else if (compData.type === 'sayac') {
            const sayacData = compData.data;

            // Sayaç constructor: (x, y, options)
            const newSayac = new Sayac(sayacData.x + dx, sayacData.y + dy, {
                z: (sayacData.z || 0) + dz,
                floorId: sayacData.floorId
            });
            newSayac.rotation = sayacData.rotation;
            newSayac.config.rijitUzunluk = sayacData.rijitUzunluk ?? 0;

            // Panel özellikleri (fromJSON ile aynı alan listesi)
            ['sayacTipi', 'sayacTuru', 'cikisCap', 'basinc',
             'birimTipi', 'birimNo', 'birimBoruTipi', 'birimBaglantiTipi',
             'esnekMarka', 'muhafaza', 'muhafazaGrupla',
             'aboneAdi', 'aboneNo', 'ustaAdi', 'ustaNo', 'description'].forEach(k => {
                if (sayacData[k] !== undefined) newSayac[k] = sayacData[k];
            });

            // fleksBaglanti: eski boruId'yi yeni ID'ye maple
            const fbPipeId = pipeIdMap.get(sayacData.fleksBaglanti?.boruId);
            if (fbPipeId) {
                newSayac.fleksBaglanti.boruId   = fbPipeId;
                newSayac.fleksBaglanti.endpoint  = sayacData.fleksBaglanti.endpoint;
                newSayac.fleksBaglanti.uzunluk   = sayacData.fleksBaglanti.uzunluk ?? 15;
            }

            // cikisBagliBoruId: eski ID'yi yeni ID'ye maple
            const cikisPipeId = pipeIdMap.get(sayacData.cikisBagliBoruId);
            if (cikisPipeId) newSayac.cikisBagliBoruId = cikisPipeId;

            // iliskiliVanaId: vana daha önce oluşturulmuş olmalı
            const newVanaId = componentIdMap.get(sayacData.iliskiliVanaId);
            if (newVanaId) newSayac.iliskiliVanaId = newVanaId;

            this.manager.components.push(newSayac);
            componentIdMap.set(sayacData.id, newSayac.id);
            newComponents.push(newSayac);
        }
        else if (compData.type === 'cihaz') {
            const cihazData = compData.data;

            // Cihaz constructor: (x, y, tip, options)
            const newCihaz = new Cihaz(cihazData.x + dx, cihazData.y + dy, cihazData.cihazTipi, {
                z: (cihazData.z || 0) + dz,
                floorId: cihazData.floorId
            });
            newCihaz.rotation = cihazData.rotation;
            newCihaz.z = (cihazData.z || 0) + dz;

            // Panel özellikleri
            ['marka', 'model', 'bacaTipi', 'kapasiteKcal', 'kapasiteKW', 'verim',
             'muhafaza', 'muhafazaGrupla', 'yedekCihaz', 'yogusmali', 'description'].forEach(k => {
                if (cihazData[k] !== undefined) newCihaz[k] = cihazData[k];
            });

            // fleksBaglanti: eski boruId'yi yeni ID'ye maple
            const cfbPipeId = pipeIdMap.get(cihazData.fleksBaglanti?.boruId);
            if (cfbPipeId) {
                newCihaz.fleksBaglanti.boruId  = cfbPipeId;
                newCihaz.fleksBaglanti.endpoint = cihazData.fleksBaglanti.endpoint;
                newCihaz.fleksBaglanti.uzunluk  = cihazData.fleksBaglanti.uzunluk ?? 30;
            }

            // iliskiliVanaId
            const newCihazVanaId = componentIdMap.get(cihazData.iliskiliVanaId);
            if (newCihazVanaId) newCihaz.iliskiliVanaId = newCihazVanaId;

            this.manager.components.push(newCihaz);
            componentIdMap.set(cihazData.id, newCihaz.id);
            newComponents.push(newCihaz);
        }
        else if (compData.type === 'baca') {
            // Baca: Parent cihazı bul
            const newParentCihazId = componentIdMap.get(compData.parentCihazId);
            const newParentCihaz = newComponents.find(c => c.id === newParentCihazId);

            if (newParentCihaz) {
                const bacaData = compData.data;

                // Baca constructor: (x, y, parentCihazId, options)
                const newBaca = new Baca(
                    bacaData.startX + dx,
                    bacaData.startY + dy,
                    newParentCihaz.id,
                    { z: (bacaData.z || 0) + dz, floorId: bacaData.floorId }
                );

                // Segment'leri kopyala: orijinal format {x1,y1,z1,x2,y2,z2}
                if (bacaData.segments && bacaData.segments.length > 0) {
                    newBaca.segments = bacaData.segments.map(seg => ({
                        x1: seg.x1 + dx, y1: seg.y1 + dy, z1: (seg.z1 || 0) + dz,
                        x2: seg.x2 + dx, y2: seg.y2 + dy, z2: (seg.z2 || 0) + dz
                    }));
                    // currentSegmentStart son segment sonuna konumlan
                    const last = bacaData.segments[bacaData.segments.length - 1];
                    newBaca.currentSegmentStart = {
                        x: last.x2 + dx, y: last.y2 + dy, z: (last.z2 || 0) + dz
                    };
                }
                if (bacaData.havalandirma) {
                    newBaca.havalandirma = { ...bacaData.havalandirma };
                }
                newBaca.isDrawing = false;

                this.manager.components.push(newBaca);
                componentIdMap.set(compData.data.id, newBaca.id);
                newComponents.push(newBaca);
            }
        }
    }

    // 4. Snap noktasındaki boru ile ilk pasted boru arasında bağlantı kur
    const snapInfo = this._pasteSnapOverride;
    if (snapInfo?.snapPipeId && newPipes.length > 0) {
        const snapPipe = this.manager.pipes.find(p => p.id === snapInfo.snapPipeId);
        const firstPastePipe = newPipes[0];
        if (snapPipe && firstPastePipe) {
            // Snap noktasının snap borusunun hangi ucuna daha yakın olduğunu bul
            const sx = snapInfo.x, sy = snapInfo.y, sz = snapInfo.z || 0;
            const dP1 = Math.hypot(snapPipe.p1.x - sx, snapPipe.p1.y - sy, (snapPipe.p1.z||0) - sz);
            const dP2 = Math.hypot(snapPipe.p2.x - sx, snapPipe.p2.y - sy, (snapPipe.p2.z||0) - sz);
            const snapToP1 = dP1 < dP2;
            const snapNode  = snapToP1 ? snapPipe.p1 : snapPipe.p2;

            // NODE PAYLAŞIMINI ZORLA:
            // getOrCreateNodeAt, snap borusunun node'unu haritada bulamazsa (registerPipeNodes
            // çağrılmamış borularda olur) yeni bir ayrı node oluşturur. Bunu düzelt:
            // firstPastePipe.p1'i doğrudan snapNode nesnesiyle değiştir.
            const oldNode = firstPastePipe.p1;
            if (oldNode !== snapNode) {
                firstPastePipe.p1       = snapNode;
                firstPastePipe.p1NodeId = snapNode._nodeId;
                this.manager.nodes.set(snapNode._nodeId, snapNode);
                if (oldNode?._nodeId) this.manager.nodes.delete(oldNode._nodeId);
            }

            // Debi bağlantıları (hangi uca snap yapıldığına göre)
            firstPastePipe.baslangicBaglanti = { tip: 'boru', hedefId: snapPipe.id };
            if (snapToP1) {
                snapPipe.baslangicBaglanti = { tip: 'boru', hedefId: firstPastePipe.id };
            } else {
                snapPipe.bitisBaglanti = { tip: 'boru', hedefId: firstPastePipe.id };
            }
        }
    }

    // 5. Eğer CUT işlemi idiyse, orijinal parçaları sil
    if (isCut && this.cutPipesOriginalIds) {
        // Boruları sil
        for (const oldPipeId of this.cutPipesOriginalIds.pipeIds) {
            const index = this.manager.pipes.findIndex(p => p.id === oldPipeId);
            if (index !== -1) {
                this.manager.pipes.splice(index, 1);
            }
        }

        // Bileşenleri sil
        for (const oldCompId of this.cutPipesOriginalIds.componentIds) {
            const index = this.manager.components.findIndex(c => c.id === oldCompId);
            if (index !== -1) {
                this.manager.components.splice(index, 1);
            }
        }
    }

    // State'i temizle
    // Kopyala: copiedPipes korunur — ESC'ye kadar yeniden yapıştırılabilir.
    // Kes: ilk yapıştırmada orijinaller silindi; bundan sonra kopya gibi davran.
    if (isCut) {
        this.copiedPipes = pasteData; // sonraki paste'ler için kopyaya dönüştür
        this.cutPipes = null;
        this.cutPipesOriginalIds = null;
    }
    // Yapıştırma sonrası seçimi sıfırla (artık silinmiş boru referansı kalmasın)
    this.selectedObject = null;

    // Manager state'i güncelle
    this.manager.saveToState();
    draw2D();

    console.log(`✅ ${newPipes.length} boru ve ${newComponents.length} bileşen yapıştırıldı`);
}

/**
 * Seçili boruyu girilen uzunluğa yeniden boyutlandırır.
 * p1 sabit kalır, p2 aynı yön boyunca yeni uzunluğa taşınır.
 * `this` = InteractionManager bağlamında çağrılır.
 */
export function applyPipeResize() {
    const newLen = parseFloat(this.pipeResizeInput);
    this.pipeResizeInput = '';
    this.pipeResizeActive = false;

    if (isNaN(newLen) || newLen <= 0) return;

    const pipe = this.selectedObject;
    if (!pipe || pipe.type !== 'boru') return;

    const p1 = pipe.p1;
    const p2 = pipe.p2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z || 0) - (p1.z || 0);
    const currentLen = Math.hypot(dx, dy, dz);

    if (currentLen < 0.001) return;

    const factor = newLen / currentLen;

    // p2'nin yeni konumu
    const newP2x = p1.x + dx * factor;
    const newP2y = p1.y + dy * factor;
    const newP2z = (p1.z || 0) + dz * factor;

    // p2'nin hareketi (delta)
    const moveDx = newP2x - p2.x;
    const moveDy = newP2y - p2.y;
    const moveDz = newP2z - (p2.z || 0);

    if (Math.abs(moveDx) < 0.001 && Math.abs(moveDy) < 0.001 && Math.abs(moveDz) < 0.001) return;

    saveState();

    // p2'den itibaren tüm downstream düğümleri topla (CTRL drag ile aynı mantık)
    const downstreamNodes = collectDownstreamNodes(this.manager, [p2], pipe);
    const downstreamPipes = collectDownstreamPipes(this.manager, [p2], pipe);

    // p2 ve tüm downstream düğümleri delta kadar taşı
    p2.x = newP2x; p2.y = newP2y; p2.z = newP2z;
    downstreamNodes.forEach(node => {
        node.x += moveDx; node.y += moveDy; node.z = (node.z || 0) + moveDz;
    });

    // Seçili boru etiketini güncelle (otomatik konumu yeniden hesaplat)
    clearLabelAutoPos(pipe.id);

    // Yardımcı: cihazın bacalarını taşı
    const moveBacalar = (cihaz) => {
        this.manager.components.forEach(baca => {
            if (baca.type !== 'baca' || baca.parentCihazId !== cihaz.id) return;
            baca.startX += moveDx; baca.startY += moveDy;
            if (baca.currentSegmentStart) {
                baca.currentSegmentStart.x += moveDx;
                baca.currentSegmentStart.y += moveDy;
            }
            if (baca.segments) {
                baca.segments.forEach(seg => {
                    seg.x1 += moveDx; seg.y1 += moveDy;
                    seg.x2 += moveDx; seg.y2 += moveDy;
                    if (seg.z1 !== undefined) seg.z1 += moveDz;
                    if (seg.z2 !== undefined) seg.z2 += moveDz;
                });
            }
            baca.z = (baca.z || 0) + moveDz;
            if (baca.havalandirma) {
                baca.havalandirma.x += moveDx;
                baca.havalandirma.y += moveDy;
            }
        });
    };

    // Downstream pipe'ların etiketlerini ve bileşenlerini taşı
    const movedComponents = new Set();
    downstreamPipes.forEach(p => {
        clearLabelAutoPos(p.id);
        this.manager.components.forEach(c => {
            if (c.bagliBoruId !== p.id && c.fleksBaglanti?.boruId !== p.id && c.cikisBagliBoruId !== p.id) return;
            if (movedComponents.has(c.id)) return;
            movedComponents.add(c.id);
            c.x += moveDx; c.y += moveDy; c.z = (c.z || 0) + moveDz;
            translateLabel(c.id, moveDx, moveDy);
            if (c.type === 'cihaz') moveBacalar(c);
        });
    });

    // Seçili borunun p2 ucundaki bileşenler (downstreamPipes dışında kaldıklarından ayrıca işlenir)
    // Not: bagliBoruId vanalar için kullanılır, updateAllValvePositions() onları otomatik günceller
    this.manager.components.forEach(c => {
        if (movedComponents.has(c.id)) return;
        const onSelectedPipe =
            (c.fleksBaglanti?.boruId === pipe.id) ||
            (c.cikisBagliBoruId === pipe.id);
        if (!onSelectedPipe) return;
        movedComponents.add(c.id);
        c.x += moveDx; c.y += moveDy; c.z = (c.z || 0) + moveDz;
        translateLabel(c.id, moveDx, moveDy);
        if (c.type === 'cihaz') moveBacalar(c);
    });

    this.manager.saveToState();
}

/**
 * Seçili borunun P2 ucuna düşey (Z yönünde) boru ekler.
 * +100 → yukarı 100 cm, -50 → aşağı 50 cm.
 * Downstream zinciri de aynı miktarda Z'de kayar.
 * `this` = InteractionManager bağlamında çağrılır.
 */
export function applyVerticalPipeInsert() {
    const input = this.pipeResizeInput;
    this.pipeResizeInput = '';
    this.pipeResizeActive = false;

    const amount = parseFloat(input); // "+100" → 100, "-50" → -50
    if (isNaN(amount) || amount === 0) return;

    const pipe = this.selectedObject;
    if (!pipe || pipe.type !== 'boru') return;

    saveState();

    const p2 = pipe.p2;
    const moveDz = amount;

    // Downstream node ve pipe'ları yeni boru eklenmeden ÖNCE hesapla
    const downstreamNodes = collectDownstreamNodes(this.manager, [p2], pipe);
    const downstreamPipes = collectDownstreamPipes(this.manager, [p2], pipe);

    // Yeni düşey boru: p1 = mevcut p2 (shared node), p2 = yeni nokta z+amount
    const newPipe = new Boru(p2, { x: p2.x, y: p2.y, z: (p2.z || 0) + amount }, pipe.boruTipi);
    newPipe.colorGroup = pipe.colorGroup || 'YELLOW';
    newPipe.boruCap = pipe.boruCap || 'DN25';
    newPipe.floorId = pipe.floorId;

    const newNode = newPipe.p2; // z+amount konumundaki yeni düğüm

    // Doğrudan bağlı downstream pipe'ların P1'ini eski p2'den yeni düğüme aktar
    this.manager.pipes.forEach(p => {
        if (p === pipe) return;
        if (p.p1 === p2) {
            p.p1 = newNode;
            p.p1NodeId = newNode._nodeId;
        }
    });

    // Downstream düğümleri Z'de kaydır (X, Y değişmez)
    downstreamNodes.forEach(node => {
        node.z = (node.z || 0) + moveDz;
    });

    // Yardımcı: cihazın bacalarını Z'de kaydır
    const moveBacalarZ = (cihaz) => {
        this.manager.components.forEach(baca => {
            if (baca.type !== 'baca' || baca.parentCihazId !== cihaz.id) return;
            baca.z = (baca.z || 0) + moveDz;
            if (baca.segments) {
                baca.segments.forEach(seg => {
                    if (seg.z1 !== undefined) seg.z1 += moveDz;
                    if (seg.z2 !== undefined) seg.z2 += moveDz;
                });
            }
        });
    };

    // Downstream bileşenlerini taşı (yalnızca z)
    const movedComponents = new Set();
    downstreamPipes.forEach(p => {
        clearLabelAutoPos(p.id);
        this.manager.components.forEach(c => {
            if (c.bagliBoruId !== p.id && c.fleksBaglanti?.boruId !== p.id && c.cikisBagliBoruId !== p.id) return;
            if (movedComponents.has(c.id)) return;
            movedComponents.add(c.id);
            c.z = (c.z || 0) + moveDz;
            if (c.type === 'cihaz') moveBacalarZ(c);
        });
    });

    // Seçili borunun p2 ucundaki bileşenler (downstreamPipes dışında kaldı)
    this.manager.components.forEach(c => {
        if (movedComponents.has(c.id)) return;
        const onSelectedPipe =
            (c.fleksBaglanti?.boruId === pipe.id) ||
            (c.cikisBagliBoruId === pipe.id);
        if (!onSelectedPipe) return;
        movedComponents.add(c.id);
        c.z = (c.z || 0) + moveDz;
        if (c.type === 'cihaz') moveBacalarZ(c);
    });

    // Yeni boruyu ekle
    this.manager.pipes.push(newPipe);
    this.manager.registerPipeNodes(newPipe);

    // Debi ağacı: newPipe, mevcut borunun devamıdır
    newPipe.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    pipe.bitisBaglanti        = { tip: 'boru', hedefId: newPipe.id };

    // pipe'ın eski çocukları (baslangicBaglanti.hedefId === pipe.id) artık newPipe'a bağlanır
    this.manager.pipes.forEach(p => {
        if (p === newPipe) return;
        if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId === pipe.id) {
            p.baslangicBaglanti = { tip: 'boru', hedefId: newPipe.id };
        }
    });

    this.manager.saveToState();
}