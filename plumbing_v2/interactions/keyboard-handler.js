/**
 * Keyboard Handler
 * Klavye girişlerini yönetir
 */

import { setMode, setState, setDrawingMode, state } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { handleBoruClick } from './pipe-drawing.js';
import { Boru } from '../objects/pipe.js';
import { Vana } from '../objects/valve.js';
import { Sayac } from '../objects/meter.js';
import { Cihaz } from '../objects/device.js';
import { Baca } from '../objects/chimney.js';

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

    // V - Vana ekle (Ghost mod) - CTRL tuşu basılı DEĞİLKEN
    if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey) {
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

    // CTRL+C - Kopyala (seçili boru ve sonrasındaki tüm parçaları)
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (this.selectedObject && this.selectedObject.type === 'boru') {
            e.preventDefault();
            handlePipeCopy.call(this);
            return true;
        }
    }

    // CTRL+X - Kes (seçili boru ve sonrasındaki tüm parçaları)
    if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
        if (this.selectedObject && this.selectedObject.type === 'boru') {
            e.preventDefault();
            handlePipeCut.call(this);
            return true;
        }
    }

    // CTRL+V - Yapıştır (kopyalanan/kesilen parçaları)
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (this.copiedPipes || this.cutPipes) {
            e.preventDefault();
            handlePipePaste.call(this);
            return true;
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

        // Bu boru üzerindeki vanaları ekle
        if (currentPipe.vana) {
            result.components.push({
                type: 'vana',
                object: currentPipe.vana,
                parentPipeId: currentPipe.id
            });
        }

        // Bu borunun uçlarına bağlı bileşenleri bul (sayaç, cihaz, baca)
        for (const component of manager.components) {
            // Sayaç kontrolü
            if (component.type === 'sayac') {
                const distToP2 = Math.hypot(
                    component.girisNoktasi.x - currentPipe.p2.x,
                    component.girisNoktasi.y - currentPipe.p2.y,
                    (component.girisNoktasi.z || 0) - (currentPipe.p2.z || 0)
                );
                if (distToP2 < tolerance) {
                    result.components.push({
                        type: 'sayac',
                        object: component,
                        connectionPoint: 'p2'
                    });
                }
            }
            // Cihaz kontrolü
            else if (component.type === 'cihaz') {
                const distToP2 = Math.hypot(
                    component.girisNoktasi.x - currentPipe.p2.x,
                    component.girisNoktasi.y - currentPipe.p2.y,
                    (component.girisNoktasi.z || 0) - (currentPipe.p2.z || 0)
                );
                if (distToP2 < tolerance) {
                    result.components.push({
                        type: 'cihaz',
                        object: component,
                        connectionPoint: 'p2'
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
    }

    return result;
}

/**
 * CTRL+C - Kopyala
 * Seçili boru ve sonrasındaki tüm parçaları kopyalar
 */
function handlePipeCopy() {
    if (!this.selectedObject || this.selectedObject.type !== 'boru') {
        console.log('❌ Copy: Seçili boru yok');
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
function handlePipeCut() {
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
function handlePipePaste() {
    const pasteData = this.cutPipes || this.copiedPipes;

    console.log('🔵 Paste çağrıldı:', {
        hasPasteData: !!pasteData,
        hasMousePoint: !!this.lastMousePoint,
        cutPipes: !!this.cutPipes,
        copiedPipes: !!this.copiedPipes
    });

    if (!pasteData || !this.lastMousePoint) {
        console.log('❌ Paste iptal: Veri veya mouse pozisyonu yok');
        return;
    }

    const isCut = !!this.cutPipes;

    // Referans noktasından mouse'a olan farkı hesapla
    const dx = this.lastMousePoint.x - pasteData.referencePoint.x;
    const dy = this.lastMousePoint.y - pasteData.referencePoint.y;
    const dz = (this.lastMousePoint.z || 0) - (pasteData.referencePoint.z || 0);

    saveState();

    // Yeni ID mapping (eski ID -> yeni ID)
    const pipeIdMap = new Map();
    const componentIdMap = new Map();
    const newPipes = [];
    const newComponents = [];

    // 1. Boruları oluştur
    for (const pipeData of pasteData.pipes) {
        const newPipe = new Boru(
            {
                x: pipeData.p1.x + dx,
                y: pipeData.p1.y + dy,
                z: (pipeData.p1.z || 0) + dz
            },
            {
                x: pipeData.p2.x + dx,
                y: pipeData.p2.y + dy,
                z: (pipeData.p2.z || 0) + dz
            },
            pipeData.boruTipi
        );

        newPipe.colorGroup = pipeData.colorGroup;
        newPipe.floorId = pipeData.floorId;

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
                // Yeni vana oluştur
                const vanaData = compData.data;
                const newVana = new Vana(
                    {
                        x: vanaData.x + dx,
                        y: vanaData.y + dy,
                        z: (vanaData.z || 0) + dz
                    },
                    vanaData.rotation
                );
                newVana.vanaAcik = vanaData.vanaAcik;
                newVana.vanaKilitli = vanaData.vanaKilitli;

                // Boru üzerine ekle
                newParentPipe.vana = newVana;
                this.manager.components.push(newVana);

                componentIdMap.set(compData.data.id, newVana.id);
                newComponents.push(newVana);
            }
        }
        else if (compData.type === 'sayac') {
            // Sayaç: Yeni boru ucuna bağla
            const sayacData = compData.data;

            const newSayac = new Sayac(
                {
                    x: sayacData.girisNoktasi.x + dx,
                    y: sayacData.girisNoktasi.y + dy,
                    z: (sayacData.girisNoktasi.z || 0) + dz
                },
                sayacData.rotation
            );

            this.manager.components.push(newSayac);
            componentIdMap.set(compData.data.id, newSayac.id);
            newComponents.push(newSayac);
        }
        else if (compData.type === 'cihaz') {
            // Cihaz: Yeni konuma yerleştir
            const cihazData = compData.data;

            const newCihaz = new Cihaz(
                cihazData.x + dx,
                cihazData.y + dy,
                (cihazData.z || 0) + dz,
                cihazData.cihazTipi
            );
            newCihaz.rotation = cihazData.rotation;
            newCihaz.girisNoktasi = {
                x: cihazData.girisNoktasi.x + dx,
                y: cihazData.girisNoktasi.y + dy,
                z: (cihazData.girisNoktasi.z || 0) + dz
            };

            this.manager.components.push(newCihaz);
            componentIdMap.set(compData.data.id, newCihaz.id);
            newComponents.push(newCihaz);
        }
        else if (compData.type === 'baca') {
            // Baca: Parent cihazı bul
            const newParentCihazId = componentIdMap.get(compData.parentCihazId);
            const newParentCihaz = newComponents.find(c => c.id === newParentCihazId);

            if (newParentCihaz) {
                const bacaData = compData.data;

                const newBaca = new Baca(
                    bacaData.startX + dx,
                    bacaData.startY + dy,
                    (bacaData.startZ || 0) + dz,
                    newParentCihaz.id
                );

                // Segment'leri kopyala
                if (bacaData.segments && bacaData.segments.length > 0) {
                    newBaca.segments = bacaData.segments.map(seg => ({
                        x: seg.x + dx,
                        y: seg.y + dy,
                        z: (seg.z || 0) + dz
                    }));
                }

                newBaca.isDrawing = false;

                this.manager.components.push(newBaca);
                componentIdMap.set(compData.data.id, newBaca.id);
                newComponents.push(newBaca);
            }
        }
    }

    // 4. Eğer CUT işlemi idiyse, orijinal parçaları sil
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
    this.copiedPipes = null;
    this.cutPipes = null;
    this.cutPipesOriginalIds = null;

    // Manager state'i güncelle
    this.manager.saveToState();

    console.log(`✅ ${newPipes.length} boru ve ${newComponents.length} bileşen yapıştırıldı`);
}