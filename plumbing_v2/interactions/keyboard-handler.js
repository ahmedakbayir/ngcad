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
import { Regulator } from '../objects/regulator.js';
import { getFloorIdForZ } from '../../floor/floor-handler.js';
import { ensureFloorForElevation } from '../../floor/floor-panel.js';
import { syncAllFloorAssignments } from '../floor-sync.js';
import { togglePropertiesPanel, closePropertiesPanel, isPanelOpen, openEmptyPanel, currentPanelMode, PANEL_MODES } from '../properties/properties-panel.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';


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
        // Pending K/O/S/V timer'ı varsa input'a geçince temizle ki sıra bozulmasın.
        if (this._doubleKeyTimer) {
            clearTimeout(this._doubleKeyTimer);
            this._doubleKeyTimer = null;
            this._doubleKeyChar = null;
            this._doubleKeyData = null;
        }
        return false;
    }

    // Pending K/O/S/V double-press timer var ve şu anki tuş aynı değilse,
    // tek-tuş aksiyonunu hemen tetikle (chord penceresinden çıktık).
    if (this._doubleKeyTimer) {
        const cur = (e.key || '').toLowerCase();
        const sameAsPending = (cur === this._doubleKeyChar) &&
            !e.ctrlKey && !e.altKey && !e.metaKey;
        if (!sameAsPending) {
            const prev = this._doubleKeyChar;
            const prevData = this._doubleKeyData;
            clearTimeout(this._doubleKeyTimer);
            this._doubleKeyTimer = null;
            this._doubleKeyChar = null;
            this._doubleKeyData = null;
            if (prev === 'k') _doSingleCihaz.call(this, 'KOMBI');
            else if (prev === 'o') _doSingleCihaz.call(this, 'OCAK');
            else if (prev === 's') _doSingleSayac.call(this);
            else if (prev === 'v') _doSingleVana.call(this, prevData);
        }
    }

    // TAB - Düşey yükseklik panelini aç/kapat (hat çiziminde VEYA bir hat seçiliyken)
    if (e.key === 'Tab') {
        const hasSelectedPipe = this.selectedObject?.type === 'boru'
            || state.selectedObject?.object?.type === 'boru';
        if ((this.boruCizimAktif && this.boruBaslangic) || hasSelectedPipe || this.verticalModeActive) {
            e.preventDefault();
            this.toggleVerticalPanel();
            return true;
        }
    }

    // Düşey panel aktifken sayı girişi (hat çizim modundan bağımsız çalışır)
    // Panel input'una çift karakter girmesin diye preventDefault uyguluyoruz.
    if (this.verticalModeActive) {
        if (/^[0-9\-+]$/.test(e.key)) {
            e.preventDefault();
            const input = document.getElementById('vertical-height-input');
            if (input) {
                let currentValue = input.value || '0';
                let newValue;

                if (e.key === '+') {
                    if (currentValue === '0' || currentValue === '-0') {
                        newValue = '0';
                    } else {
                        newValue = Math.abs(parseFloat(currentValue) || 0).toString();
                    }
                } else if (e.key === '-') {
                    if (currentValue === '0') {
                        newValue = '-';
                    } else if (currentValue === '-') {
                        newValue = '0';
                    } else {
                        const num = parseFloat(currentValue) || 0;
                        newValue = (-num).toString();
                    }
                } else {
                    if (currentValue === '0') {
                        newValue = e.key;
                    } else if (currentValue === '-') {
                        newValue = '-' + e.key;
                    } else {
                        newValue = currentValue + e.key;
                    }
                }

                input.value = newValue;
                const parsedValue = parseFloat(newValue);
                if (!isNaN(parsedValue)) {
                    this.verticalHeightInput = parsedValue;
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
        }

        if (e.key === 'Backspace') {
            e.preventDefault();
            const input = document.getElementById('vertical-height-input');
            if (input && input.value.length > 0) {
                const currentValue = input.value;
                input.value = currentValue.slice(0, -1) || '0';
                this.verticalHeightInput = parseFloat(input.value) || 0;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            this.applyVerticalHeight();
            return true;
        }
    }

    // Boru çizim modunda ölçü girişi (düşey panel kapalıyken)
    if (this.boruCizimAktif && this.boruBaslangic) {
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
        
        // 1. Önce Tesisat motorunda bir şey seçili mi ona bak
        const sel = this.selectedObject;
        const selVana = this.selectedValve?.vana;
        let target = (sel && ['boru', 'sayac', 'servis_kutusu', 'cihaz'].includes(sel.type)) ? sel
            : selVana ? selVana
            : null;
            
        // 2. Eğer tesisatta hiçbir şey seçili değilse, Mimari (genel state) seçimine bak
        if (!target && state.selectedObject && state.selectedObject.object) {
            target = state.selectedObject.object;
        }
        
        // 3. O da yoksa, Oda (Room) seçimine bak
        if (!target && state.selectedRoom) {
            target = state.selectedRoom;
        }

        // Bulunan bir hedef varsa paneli aç
        if (target) {
            togglePropertiesPanel(target, this.manager);
            return true;
        }
        
        // Hiçbir şey seçili değilse: panel açıksa kapat, kapalıysa boş paneli aç
        if (isPanelOpen()) {
            closePropertiesPanel();
        } else {
            openEmptyPanel();
        }
        return true;
    }
    // ESC - iptal ve seç moduna geç
    if (e.key === 'Escape') {
        // Boru resize aktifse önce onu iptal et
        if (this.pipeResizeActive) {
            this.pipeResizeInput = '';
            this.pipeResizeActive = false;
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

        // --- YENİ VE DOĞRU SIRALAMA ---
        
        // 1. EĞER çizim, yerleştirme, sürükleme vb. bir İŞLEM varsa ÖNCE onu iptal et
        if (this.boruCizimAktif || this.manager.tempComponent || this.isDragging || this.isRotating) {
            this.cancelCurrentAction();
            setMode("select");
            return true;
        }

        // 2. EĞER işlem yok ama herhangi bir görsel seçim varsa (singular,
        //    hat, çoklu seçim, ya da sahte kalmış isSelected bayrağı), bırak
        const hasAnySelection = !!this.selectedObject
            || !!this.selectedValve
            || (this.selectedHatPipes && this.selectedHatPipes.length > 0)
            || (this.selectedObjects && this.selectedObjects.length > 0)
            || (this.manager?.pipes || []).some(p => p.isSelected)
            || (this.manager?.components || []).some(c => c.isSelected);
        if (hasAnySelection) {
            this.cancelCurrentAction();
            setMode("select");
            return true;
        }

        // 3. EĞER hiçbir çizim/işlem veya seçim yoksa ve panel DAİMA AÇIK modunda DEĞİLSE paneli kapat
        if (isPanelOpen() && currentPanelMode !== PANEL_MODES.ALWAYS) {
            closePropertiesPanel(true); // Zorla kapat
            return true;
        }

        // Garanti çıkış
        this.cancelCurrentAction();
        setMode("select");
        return true;
    }

    // V + harf - Vana yerleştirme modundayken vana tipini değiştir
    // Varsayılan EMNIYET; A=AKV, B=BRANSMAN, S=SELENOID, Y=YANBINA, C=CIHAZ, E=EMNIYET
    if (this.manager.activeTool === TESISAT_MODLARI.VANA &&
        this.manager.tempComponent &&
        this.manager.tempComponent.type === 'vana' &&
        !e.ctrlKey && !e.altKey && !e.metaKey &&
        e.key.length === 1) {
        const VANA_TIP_KISAYOLLARI = {
            'a': 'AKV',
            'b': 'BRANSMAN',
            's': 'SELENOID',
            'y': 'YANBINA',
            'c': 'CIHAZ',
            'e': 'EMNIYET',
        };
        const yeniTip = VANA_TIP_KISAYOLLARI[e.key.toLowerCase()];
        if (yeniTip) {
            this.manager.tempComponent.vanaTipi = yeniTip;

            // Sonlanma vanası (BRANSMAN/YANBINA) + boş uç varsa tıklama
            // beklemeden otomatik yerleştir. Önce V handler'ın yakaladığı
            // chord context'i kullan; yoksa anlık _getSeciliHatinBosUcu.
            if (yeniTip === 'BRANSMAN' || yeniTip === 'YANBINA') {
                let boruUcuInfo = null;
                if (this._vanaChordContext) {
                    const pipe = this.manager.pipes.find(p => p.id === this._vanaChordContext.pipeId);
                    if (pipe) {
                        const end = this._vanaChordContext.end;
                        boruUcuInfo = { pipe, end, point: pipe[end] };
                    }
                }
                if (!boruUcuInfo) {
                    boruUcuInfo = _getSeciliHatinBosUcu.call(this);
                }
                if (boruUcuInfo) {
                    const { pipe, end, point } = boruUcuInfo;
                    this._vanaChordContext = null;
                    this.handleVanaPlacement({
                        pipe,
                        point,
                        t: end === 'p2' ? 1.0 : 0.0,
                        vanaTipi: yeniTip
                    });
                    return true;
                }
            }

            draw2D();
            return true;
        }
    }

    // K / O — Kombi / Ocak chord-aware kısayol.
    //   k tek basış: tek tuş aksiyonu (kombi/ocak otomatik veya ghost)
    //   kk / oo (~280 ms içinde çift basış): İniş + cihaz
    // İlk basışta tek-tuş aksiyonu zamanlanır; ikinci aynı tuş gelirse iptal
    // edilip chord (iniş+cihaz) tetiklenir. Pending'i farklı tuş hemen flush eder.
    if ((e.key === 'k' || e.key === 'K' || e.key === 'o' || e.key === 'O') &&
        !e.ctrlKey && !e.altKey && !e.metaKey) {
        const charLower = e.key.toLowerCase();
        const cihazTipi = charLower === 'k' ? 'KOMBI' : 'OCAK';

        // İkinci basış? (yukarıdaki "flush" mantığı aynı karakter geldiğinde
        // pending'i temizlememişti, bu yüzden burada hâlâ ayakta olabilir)
        if (this._doubleKeyChar === charLower && this._doubleKeyTimer) {
            clearTimeout(this._doubleKeyTimer);
            this._doubleKeyTimer = null;
            this._doubleKeyChar = null;
            _doInisVeCihazChord.call(this, cihazTipi);
            return true;
        }

        // İlk basış → tek tuş aksiyonunu ~280 ms zamanla
        const self = this;
        this._doubleKeyChar = charLower;
        this._doubleKeyTimer = setTimeout(() => {
            self._doubleKeyTimer = null;
            self._doubleKeyChar = null;
            _doSingleCihaz.call(self, cihazTipi);
        }, 280);
        return true;
    }

    // S - Sayaç chord-aware kısayol.
    //   s tek basış: hatta boş uç varsa sayaç yerleştir, yoksa ghost mod
    //   ss (~280 ms içinde çift basış): İniş + sayaç
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // İkinci basış? (flush mantığı aynı tuş geldiğinde pending'i temizlemez)
        if (this._doubleKeyChar === 's' && this._doubleKeyTimer) {
            clearTimeout(this._doubleKeyTimer);
            this._doubleKeyTimer = null;
            this._doubleKeyChar = null;
            this._doubleKeyData = null;
            _doInisVeSayacChord.call(this);
            return true;
        }

        // İlk basış → tek-tuş aksiyonunu ~280 ms zamanla
        const self = this;
        this._doubleKeyChar = 's';
        this._doubleKeyData = null;
        this._doubleKeyTimer = setTimeout(() => {
            self._doubleKeyTimer = null;
            self._doubleKeyChar = null;
            self._doubleKeyData = null;
            _doSingleSayac.call(self);
        }, 280);
        return true;
    }

    // V - Vana chord-aware kısayol.
    //   v tek basış: ghost mod (V→B / V→Y chord için context yakalanır)
    //   vv (~280 ms içinde çift basış): 30 cm İniş + BRANSMAN vana
    if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // İkinci basış? (flush mantığı aynı tuş geldiğinde pending'i temizlemez)
        if (this._doubleKeyChar === 'v' && this._doubleKeyTimer) {
            clearTimeout(this._doubleKeyTimer);
            this._doubleKeyTimer = null;
            this._doubleKeyChar = null;
            this._doubleKeyData = null;
            _doInisVeBransmanChord.call(this);
            return true;
        }

        // Çizim/seçim varsa boş ucu yakala — gecikme sırasında state değişebilir,
        // bu yüzden chord context'i ilk basış anında snapshot'la.
        const aktifUc = _getSeciliHatinBosUcu.call(this);
        const chordCtx = aktifUc
            ? { pipeId: aktifUc.pipe.id, end: aktifUc.end }
            : null;

        // İlk basış → tek-tuş aksiyonunu ~280 ms zamanla
        const self = this;
        this._doubleKeyChar = 'v';
        this._doubleKeyData = chordCtx;
        this._doubleKeyTimer = setTimeout(() => {
            const ctx = self._doubleKeyData;
            self._doubleKeyTimer = null;
            self._doubleKeyChar = null;
            self._doubleKeyData = null;
            _doSingleVana.call(self, ctx);
        }, 280);
        return true;
    }

    // T - BORU çizme modu (boru icon'unu aktif et)
    // GÜNCELLENDİ: Seçili boru varsa her zaman P2 ucundan çizime başla
    if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const selPipe = (this.selectedObject && this.selectedObject.type === 'boru')
            ? this.selectedObject
            : (state.selectedObject?.object?.type === 'boru' ? state.selectedObject.object : null);

        if (selPipe) {
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            this.cancelCurrentAction();
            this.startBoruCizim(selPipe.p2, selPipe.id, 'boru', selPipe.colorGroup);
            setMode("plumbingV2", true);
            return true;
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
 * @param {object} [opts] - { mode: 'araya'|'inisCikis', pipe, point } (sağ tık menüsünden gelir)
 */
export function toggleVerticalPanel(opts) {
    const panel = document.getElementById('vertical-height-panel');
    if (!panel) return;

    if (this.verticalModeActive) {
        applyVerticalHeight.call(this);
    } else {
        openVerticalPanel.call(this, opts);
    }
}

// Panel açılışı için bağlam çözümü:
//   - opts ile gelen (pipe+point) → 'splitAtPoint'
//   - hat çizim aktif → 'drawing'
//   - seçili boru → 'selectedPipe' (point: p2 (iniş çıkış için), arayaPoint: gövde noktası)
function _resolveVerticalContext(opts) {
    if (opts && opts.pipe && opts.point) {
        return { kind: 'splitAtPoint', pipe: opts.pipe, point: opts.point };
    }
    if (this.boruCizimAktif && this.boruBaslangic) {
        return { kind: 'drawing', point: this.boruBaslangic.nokta };
    }
    const selPipe = (this.selectedObject && this.selectedObject.type === 'boru')
        ? this.selectedObject
        : (state.selectedObject?.object?.type === 'boru' ? state.selectedObject.object : null);
    if (selPipe) {
        // Araya için: son mouse pozisyonunu boruya projekte et; yoksa orta nokta
        let arayaPoint = null;
        if (this.lastMousePoint && typeof selPipe.projectPoint === 'function') {
            const proj = selPipe.projectPoint({ x: this.lastMousePoint.x, y: this.lastMousePoint.y });
            // Uçlardan biraz uzaklaş (split başarılı olması için)
            if (proj && proj.t > 0.05 && proj.t < 0.95) {
                arayaPoint = {
                    x: selPipe.p1.x + proj.t * (selPipe.p2.x - selPipe.p1.x),
                    y: selPipe.p1.y + proj.t * (selPipe.p2.y - selPipe.p1.y),
                    z: (selPipe.p1.z || 0) + proj.t * ((selPipe.p2.z || 0) - (selPipe.p1.z || 0))
                };
            }
        }
        if (!arayaPoint) {
            arayaPoint = {
                x: (selPipe.p1.x + selPipe.p2.x) / 2,
                y: (selPipe.p1.y + selPipe.p2.y) / 2,
                z: ((selPipe.p1.z || 0) + (selPipe.p2.z || 0)) / 2
            };
        }
        return { kind: 'selectedPipe', pipe: selPipe, point: selPipe.p2, arayaPoint };
    }
    return null;
}

function _findFloorAtZ(z) {
    const floors = state.floors || [];
    const f = floors.find(fl => z >= (fl.bottomElevation || 0) && z < (fl.topElevation || 0));
    return f || state.currentFloor || null;
}

function _floorHeightAt(z) {
    const f = _findFloorAtZ(z);
    if (!f) return 280;
    const h = (f.topElevation || 0) - (f.bottomElevation || 0);
    return h > 0 ? Math.round(h) : 280;
}

/**
 * Düşey yükseklik panelini aç
 */
function openVerticalPanel(opts) {
    const panel = document.getElementById('vertical-height-panel');
    const input = document.getElementById('vertical-height-input');
    if (!panel || !input) return;

    const ctx = _resolveVerticalContext.call(this, opts);
    this.verticalContext = ctx;

    // Mod seçimi: sağ tık → 'araya' default, diğer durumlarda 'inisCikis'
    const defaultMode = (opts && opts.mode) ? opts.mode
        : (ctx && ctx.kind === 'splitAtPoint' ? 'araya' : 'inisCikis');
    const radios = panel.querySelectorAll('input[name="vertical-mode"]');
    radios.forEach(r => { r.checked = (r.value === defaultMode); });

    // Kat yüksekliği: başlangıç noktasının z'sine göre dinamik
    const startZ = (ctx && ctx.point) ? (ctx.point.z || 0) : 0;
    const floorH = _floorHeightAt(startZ);
    panel.dataset.floorHeight = String(floorH);
    const btnUp = document.getElementById('btn-floor-up');
    const btnDown = document.getElementById('btn-floor-down');
    if (btnUp) btnUp.title = `+${floorH} cm`;
    if (btnDown) btnDown.title = `-${floorH} cm`;

    panel.style.display = 'block';
    this.verticalModeActive = true;

    input.value = '0';
    this.verticalHeightInput = 0;

    // Konumlandırma — panel fixed positioned, viewport-relative koordinat kullanılır.
    // lastMousePoint.clientX/Y her canvas'tan (c2d, cPersp, cIso) güncelleniyor;
    // böylece 3D perspektif veya izometri görünümünde de panel doğru konuma açılır.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let clientX = (this.lastMousePoint && this.lastMousePoint.clientX != null)
        ? this.lastMousePoint.clientX : vw / 2;
    let clientY = (this.lastMousePoint && this.lastMousePoint.clientY != null)
        ? this.lastMousePoint.clientY : vh / 2;

    // Panel gerçek boyutu (render edildikten sonra)
    const pw = panel.offsetWidth || 260;
    const ph = panel.offsetHeight || 280;

    // %90 kuralı — panel viewport'un orta %90'lık alanında kalmalı, her kenardan
    // en az %5 boşluk bırakmalı. Panel kendi başına %90'dan büyükse kenara yasla.
    const marginX = Math.max(8, Math.round(vw * 0.05));
    const marginY = Math.max(8, Math.round(vh * 0.05));

    let left = clientX + 20;
    let top  = clientY;
    if (left + pw > vw - marginX) left = vw - pw - marginX;
    if (top  + ph > vh - marginY) top  = vh - ph - marginY;
    if (left < marginX) left = marginX;
    if (top  < marginY) top  = marginY;

    panel.style.left = `${left}px`;
    panel.style.top  = `${top}px`;

    setTimeout(() => input.focus(), 50);

    // Dışarı tıklayınca paneli kapat. Aynı turdaki TAB/sağ-tık olayını yakalamamak
    // için listener'ı bir sonraki tick'te bağlıyoruz; kapatınca da kendini söker.
    const self = this;
    const onOutsideClick = (ev) => {
        if (!panel.contains(ev.target)) {
            closeVerticalPanel.call(self);
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', onOutsideClick, true);
    }, 0);
    this._verticalOutsideClickHandler = onOutsideClick;
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
    this.verticalContext = null;

    if (this._verticalOutsideClickHandler) {
        document.removeEventListener('mousedown', this._verticalOutsideClickHandler, true);
        this._verticalOutsideClickHandler = null;
    }
}

/**
 * Düşey yüksekliği uygula
 * Mod 'inisCikis': aktif uçtan +h düşey ekle, çizime devam et
 * Mod 'araya'   : hattı verilen noktada böl, downstream zinciri +h kaldır, araya düşey koy
 */
export function applyVerticalHeight() {
    const input = document.getElementById('vertical-height-input');
    const height = input ? parseFloat(input.value) : this.verticalHeightInput;

    if (!height || isNaN(height) || height === 0) {
        closeVerticalPanel.call(this);
        return;
    }

    const ctx = this.verticalContext || _resolveVerticalContext.call(this);
    if (!ctx) {
        closeVerticalPanel.call(this);
        return;
    }

    const panel = document.getElementById('vertical-height-panel');
    const modeEl = panel?.querySelector('input[name="vertical-mode"]:checked');
    const mode = modeEl?.value || 'inisCikis';

    if (mode === 'araya' && (ctx.kind === 'splitAtPoint' || ctx.kind === 'selectedPipe')) {
        // Seçili boruda araya için arayaPoint (gövde projeksiyonu); sağ tıkta point.
        const splitPt = (ctx.kind === 'selectedPipe' && ctx.arayaPoint) ? ctx.arayaPoint : ctx.point;
        _applyArayaInisCikis.call(this, ctx.pipe, splitPt, height);
        closeVerticalPanel.call(this);
        return;
    }

    // 'inisCikis' veya araya çalışamayan durum: tek düşey ekle + çizime devam et
    let startPoint;
    if (ctx.kind === 'drawing') {
        startPoint = this.boruBaslangic.nokta;
    } else if (ctx.kind === 'selectedPipe') {
        startPoint = { x: ctx.pipe.p2.x, y: ctx.pipe.p2.y, z: ctx.pipe.p2.z || 0 };
        // Seçili borunun p2 ucundan çizime başla
        if (!this.boruCizimAktif) {
            this.startBoruCizim(startPoint, ctx.pipe.id, 'boru', ctx.pipe.colorGroup);
        }
    } else { // splitAtPoint + inisCikis
        startPoint = { x: ctx.point.x, y: ctx.point.y, z: ctx.point.z || 0 };
        if (!this.boruCizimAktif) {
            // Split point üzerinde çizime başla (handlePipeSplit gibi)
            this.handlePipeSplit(ctx.pipe, startPoint, true);
        }
    }

    const endPoint = {
        x: startPoint.x,
        y: startPoint.y,
        z: (startPoint.z || 0) + height
    };

    handleBoruClick(this, endPoint);
    closeVerticalPanel.call(this);
}

/**
 * Araya iniş çıkış: pipe'ı splitPoint'te böl, downstream zincirini +h kaldır,
 * boru1.p2 (eski Z) ile boru2.p1 (yeni Z) arasına düşey boru ekle.
 *
 * splitPoint pipe.p2'nin (veya p1'in) üstüne denk gelirse split yapılamaz;
 * o durumda applyVerticalPipeInsert ile uç noktasından (p2) eklenir.
 */
function _applyArayaInisCikis(pipe, splitPoint, height) {
    const manager = this.manager;
    if (!pipe || !splitPoint) return;

    // Köşe (uç) kontrolü: tıklama noktası borunun bir ucuyla çakışıyorsa
    // split başarısız olur. Bu durumda uç-noktası tabanlı ekleme yap.
    const CORNER_TOL = 0.5;
    const dCornerP1 = Math.hypot(
        pipe.p1.x - splitPoint.x,
        pipe.p1.y - splitPoint.y,
        (pipe.p1.z || 0) - (splitPoint.z || 0)
    );
    const dCornerP2 = Math.hypot(
        pipe.p2.x - splitPoint.x,
        pipe.p2.y - splitPoint.y,
        (pipe.p2.z || 0) - (splitPoint.z || 0)
    );
    if (dCornerP2 < CORNER_TOL) {
        // p2 ucundan iniş/çıkış — applyVerticalPipeInsert tam olarak bunu yapar.
        this.selectedObject = pipe;
        this.pipeResizeInput = String(height);
        applyVerticalPipeInsert.call(this);
        return;
    }
    if (dCornerP1 < CORNER_TOL) {
        // p1 ucu daha az yaygın; şimdilik desteklenmiyor — uyarı.
        console.warn('[araya-inis-cikis] p1 ucundan ekleme henüz desteklenmiyor');
        return;
    }

    // 1. Hattı böl (çizime BAŞLATMA)
    this.handlePipeSplit(pipe, splitPoint, false);

    // splitAt sonrası yeni borular pipe'ın üzerinde değil, manager.pipes içinde.
    // boru1 = splitPoint'te biten (eski p1'den gelen)
    // boru2 = splitPoint'ten başlayan (eski p2'ye giden)
    const TOL = 0.5;
    const dist3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

    const boru1 = manager.pipes.find(p =>
        dist3D(p.p2, splitPoint) < TOL &&
        dist3D(p.p1, pipe.p1) < TOL
    );
    const boru2 = manager.pipes.find(p =>
        dist3D(p.p1, splitPoint) < TOL &&
        dist3D(p.p2, pipe.p2) < TOL
    );

    if (!boru1 || !boru2) {
        console.warn('[araya-inis-cikis] boru1/boru2 bulunamadı', { boru1: !!boru1, boru2: !!boru2 });
        return;
    }

    // boru2.p1 ile boru1.p2 splitAt'te aynı düğüm referansını paylaşır.
    // Downstream'i kaldırınca boru1.p2 de kalkmasın diye boru2.p1'i kopyalayıp ayır.
    if (boru2.p1 === boru1.p2) {
        const old = boru2.p1;
        const detached = { _nodeId: `n_${Date.now()}_${Math.random().toString(36).substr(2,6)}`, x: old.x, y: old.y, z: old.z };
        boru2.p1 = detached;
        boru2.p1NodeId = detached._nodeId;
    }

    // 2. Downstream zinciri topla (boru2 dahil) ve +height kaldır
    // Aynı düğüm referansını birden fazla kez kaldırmamak için Set tutuyoruz.
    const downstream = getDownstreamPipesAndComponents(boru2, manager);
    const shiftedNodes = new Set();
    const shiftZ = (node) => {
        if (!node || shiftedNodes.has(node)) return;
        node.z = (node.z || 0) + height;
        shiftedNodes.add(node);
    };
    for (const p of downstream.pipes) {
        shiftZ(p.p1);
        shiftZ(p.p2);
    }
    for (const entry of downstream.components) {
        const c = entry.object;
        if (c && typeof c.z === 'number') c.z = (c.z || 0) + height;
    }

    // 3. boru1.p2 (eski Z) ile boru2.p1 (yeni Z = eski+h) arasına düşey boru
    // Düğüm referanslarını paylaş ki taşımalarda zincir kopmasın.
    const dusey = new Boru(boru1.p2, boru2.p1);
    dusey.colorGroup = pipe.colorGroup || boru1.colorGroup || 'YELLOW';
    dusey.floorId    = pipe.floorId    || boru1.floorId;
    if (pipe.basinc != null) dusey.basinc = pipe.basinc;
    dusey.boruCap = pipe.boruCap || boru1.boruCap || 'DN25';

    // Bağlantıları yeniden zincirle: boru1 → düşey → boru2
    dusey.baslangicBaglanti = { tip: 'boru', hedefId: boru1.id };
    dusey.bitisBaglanti     = { tip: 'boru', hedefId: boru2.id };
    boru1.bitisBaglanti     = { tip: 'boru', hedefId: dusey.id };
    boru2.baslangicBaglanti = { tip: 'boru', hedefId: dusey.id };

    manager.pipes.push(dusey);
    manager.registerPipeNodes(dusey);
    manager.recomputePipeParents?.();
    recomputeAllPressures(manager);
    manager.saveToState?.();
    draw2D();
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

    // Bir borunun belirli ucunda dolu bağlantı (sayaç/kutu/üst boru) var mı?
    // isTrulyFreeEndpoint sadece komşu boru sayısına bakar; sayaç çıkışı gibi
    // tek borulu noktaları yanlışlıkla boş gösterir. baglanti.hedefId varsa
    // o uç DOLUDUR — sayaç/kutu tarafına cihaz eklenmesini bu kontrol önler.
    const isEndOccupiedByConnection = (pipe, end) => {
        const bag = end === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
        return !!(bag && bag.hedefId);
    };

    const hasFleksAt = (pipe, end) => {
        return manager.components.some(c =>
            (c.type === 'cihaz' || c.type === 'sayac') &&
            c.fleksBaglanti?.boruId === pipe.id &&
            c.fleksBaglanti?.endpoint === end
        );
    };

    const isUcValid = (pipe, end) => {
        if (isEndOccupiedByConnection(pipe, end)) return false;
        const pt = end === 'p1' ? pipe.p1 : pipe.p2;
        if (!manager.isTrulyFreeEndpoint(pt, 1)) return false;
        if (hasFleksAt(pipe, end)) return false;
        return true;
    };

    // 1. AKTİF ÇİZİM: kullanıcı bir hat çiziyorsa, son çizilen borunun çizime
    //    devam edeceği uç doğal olarak BOŞ UÇTUR; bu uç önceliklidir.
    if (this.boruCizimAktif && this.boruBaslangic) {
        const { kaynakTip, kaynakId, nokta } = this.boruBaslangic;
        if (kaynakTip === 'boru' && kaynakId && nokta) {
            const pipe = manager.pipes.find(p => p.id === kaynakId);
            if (pipe) {
                const d1 = Math.hypot(
                    pipe.p1.x - nokta.x,
                    pipe.p1.y - nokta.y,
                    (pipe.p1.z || 0) - (nokta.z || 0)
                );
                const d2 = Math.hypot(
                    pipe.p2.x - nokta.x,
                    pipe.p2.y - nokta.y,
                    (pipe.p2.z || 0) - (nokta.z || 0)
                );
                const end = d1 < d2 ? 'p1' : 'p2';
                if (isUcValid(pipe, end)) {
                    return { pipe, end, point: pipe[end] };
                }
            }
        }
    }

    // 2. SEÇİLİ BORULAR: p2 önceliklidir (akış yönünde "boş uç" tipik olarak p2).
    // Üç kaynak: pipe.isSelected flag, interactionManager.selectedObject, state.selectedObject.object.
    // Bunlardan biri set olduğunda, kullanıcı bir parçayı açıkça seçmiş demektir.
    let seciliPipes = manager.pipes.filter(p => p.isSelected);
    if (seciliPipes.length === 0 && this.selectedObject?.type === 'boru') {
        seciliPipes = [this.selectedObject];
    }
    if (seciliPipes.length === 0 && state.selectedObject?.object?.type === 'boru') {
        seciliPipes = [state.selectedObject.object];
    }
    if (seciliPipes.length === 0) return null;

    // 2a. STRICT: gerçekten boş uç → otomatik yerleştirme (mevcut davranış)
    for (const pipe of seciliPipes) {
        if (isUcValid(pipe, 'p2')) return { pipe, end: 'p2', point: pipe.p2 };
    }
    for (const pipe of seciliPipes) {
        if (isUcValid(pipe, 'p1')) return { pipe, end: 'p1', point: pipe.p1 };
    }

    // 2b. RELAXED: kullanıcı açıkça bir boruyu seçti → p2'yi (yoksa p1'i) hedef al.
    // Yalnız fleksli ucu yasakla (sayaç/cihaz çakışması fiziksel sorun). Bu yol
    // sayesinde kk/oo/ss/vv kısayolları yalnız çizim modunda değil, herhangi bir
    // boru seçimi varken de p2'ye iniş+bileşen ekleyebilir.
    for (const pipe of seciliPipes) {
        if (!hasFleksAt(pipe, 'p2')) return { pipe, end: 'p2', point: pipe.p2 };
    }
    for (const pipe of seciliPipes) {
        if (!hasFleksAt(pipe, 'p1')) return { pipe, end: 'p1', point: pipe.p1 };
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

        // Bu boru üzerindeki Vana ve Regülatör bileşenlerini topla
        // (manager.components'tan, bagliBoruId ile).
        // NOT: pipe.vana eski stil basit metadata'dır; gerçek vana bileşenleri manager.components'tedir.
        for (const comp of manager.components) {
            if ((comp.type === 'vana' || comp.type === 'regulator') && comp.bagliBoruId === currentPipe.id) {
                result.components.push({
                    type: comp.type,
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
                            p2Connection: nextPipe.bitisBaglanti ? JSON.parse(JSON.stringify(nextPipe.bitisBaglanti)) : null
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
        const newP1Z = (pipeData.p1.z || 0) + dz;
        const newP2Z = (pipeData.p2.z || 0) + dz;
        // Hedef yükseklikte kat yoksa placeholder'dan oluştur
        ensureFloorForElevation(newP1Z);
        ensureFloorForElevation(newP2Z);

        const p1Node = this.manager.getOrCreateNodeAt(
            pipeData.p1.x + dx, pipeData.p1.y + dy, newP1Z
        );
        const p2Node = this.manager.getOrCreateNodeAt(
            pipeData.p2.x + dx, pipeData.p2.y + dy, newP2Z
        );

        const newPipe = new Boru(p1Node, p2Node, pipeData.boruTipi);

        newPipe.colorGroup = pipeData.colorGroup;
        // floorId: p1.z'ye göre (mevcut kural: boru p1 katında yaşar)
        newPipe.floorId = getFloorIdForZ(newP1Z) || pipeData.floorId;
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
                const newVanaZ = (vanaData.z || 0) + dz;
                ensureFloorForElevation(newVanaZ);
                // Vana bağlı olduğu borunun katında yaşasın (riser üzerindeki vana da üst katta gözüksün)
                const newVanaFloorId = newParentPipe.floorId || getFloorIdForZ(newVanaZ) || vanaData.floorId;
                const newVana = new Vana(vanaData.x + dx, vanaData.y + dy, vanaData.vanaTipi, {
                    z: newVanaZ,
                    floorId: newVanaFloorId,
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
                    'ekDebi', 'bransmanDebi', 'ilerdeKullanim', 'birimSayisi',
                    'description'].forEach(k => {
                        if (vanaData[k] !== undefined) newVana[k] = vanaData[k];
                    });

                this.manager.components.push(newVana);
                newVana.updateEndCapStatus(this.manager);

                componentIdMap.set(vanaData.id, newVana.id);
                newComponents.push(newVana);
            }
        }
        else if (compData.type === 'regulator') {
            // Regülatör: parentPipeId'yi bul; vana ile aynı mantık.
            const newParentPipeId = pipeIdMap.get(compData.parentPipeId);
            const newParentPipe = newPipes.find(p => p.id === newParentPipeId);

            if (newParentPipe) {
                const regData = compData.data;
                const newRegZ = (regData.z || 0) + dz;
                ensureFloorForElevation(newRegZ);
                const newRegFloorId = newParentPipe.floorId || getFloorIdForZ(newRegZ) || regData.floorId;
                const newReg = new Regulator(regData.x + dx, regData.y + dy, {
                    z: newRegZ,
                    floorId: newRegFloorId,
                    bagliBoruId: newParentPipe.id,
                    boruPozisyonu: regData.boruPozisyonu,
                    fromEnd: regData.fromEnd,
                    fixedDistance: regData.fixedDistance,
                    cikisBasinc: regData.cikisBasinc,
                    shutOff: regData.shutOff,
                    marka: regData.marka,
                    model: regData.model,
                });
                newReg.rotation = regData.rotation || 0;

                // Panel özellikleri (toJSON ile aynı set)
                ['muhafaza', 'muhafazaGrupla', 'description'].forEach(k => {
                    if (regData[k] !== undefined) newReg[k] = regData[k];
                });

                this.manager.components.push(newReg);
                componentIdMap.set(regData.id, newReg.id);
                newComponents.push(newReg);
            }
        }
        else if (compData.type === 'sayac') {
            const sayacData = compData.data;

            // Sayaç constructor: (x, y, options)
            const newSayacZ = (sayacData.z || 0) + dz;
            ensureFloorForElevation(newSayacZ);
            // Sayaç bağlı olduğu boruya göre kata düşsün
            const sayacFleksNewPipeId = pipeIdMap.get(sayacData.fleksBaglanti?.boruId);
            const sayacFleksNewPipe = sayacFleksNewPipeId ? newPipes.find(p => p.id === sayacFleksNewPipeId) : null;
            const newSayacFloorId = sayacFleksNewPipe?.floorId || getFloorIdForZ(newSayacZ) || sayacData.floorId;
            const newSayac = new Sayac(sayacData.x + dx, sayacData.y + dy, {
                z: newSayacZ,
                floorId: newSayacFloorId
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
                newSayac.fleksBaglanti.boruId = fbPipeId;
                newSayac.fleksBaglanti.endpoint = sayacData.fleksBaglanti.endpoint;
                newSayac.fleksBaglanti.uzunluk = sayacData.fleksBaglanti.uzunluk ?? 15;
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
            const newCihazZ = (cihazData.z || 0) + dz;
            ensureFloorForElevation(newCihazZ);
            // Cihaz bağlı olduğu boruya göre kata düşsün
            const cihazFleksNewPipeId = pipeIdMap.get(cihazData.fleksBaglanti?.boruId);
            const cihazFleksNewPipe = cihazFleksNewPipeId ? newPipes.find(p => p.id === cihazFleksNewPipeId) : null;
            const newCihazFloorId = cihazFleksNewPipe?.floorId || getFloorIdForZ(newCihazZ) || cihazData.floorId;
            const newCihaz = new Cihaz(cihazData.x + dx, cihazData.y + dy, cihazData.cihazTipi, {
                z: newCihazZ,
                floorId: newCihazFloorId
            });
            newCihaz.rotation = cihazData.rotation;
            newCihaz.z = newCihazZ;

            // Panel özellikleri
            ['marka', 'model', 'bacaTipi', 'kapasiteKcal', 'kapasiteKW', 'verim',
                'muhafaza', 'muhafazaGrupla', 'yedekCihaz', 'yogusmali', 'description'].forEach(k => {
                    if (cihazData[k] !== undefined) newCihaz[k] = cihazData[k];
                });

            // fleksBaglanti: eski boruId'yi yeni ID'ye maple
            const cfbPipeId = pipeIdMap.get(cihazData.fleksBaglanti?.boruId);
            if (cfbPipeId) {
                newCihaz.fleksBaglanti.boruId = cfbPipeId;
                newCihaz.fleksBaglanti.endpoint = cihazData.fleksBaglanti.endpoint;
                newCihaz.fleksBaglanti.uzunluk = cihazData.fleksBaglanti.uzunluk ?? 30;
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
                const newBacaZ = (bacaData.z || 0) + dz;
                // Baca parent cihazla aynı katta olsun
                const newBacaFloorId = newParentCihaz.floorId || getFloorIdForZ(newBacaZ) || bacaData.floorId;
                const newBaca = new Baca(
                    bacaData.startX + dx,
                    bacaData.startY + dy,
                    newParentCihaz.id,
                    { z: newBacaZ, floorId: newBacaFloorId }
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

    // 3.5. Pipe → komponent bağlantılarını remap et (sayaç / vana / cihaz / servis_kutusu / bransman).
    // Step 2 yalnızca tip === 'boru' bağlantılarını yeniden eşledi; sayaç çıkış borularının
    // baslangicBaglanti'si { tip: 'sayac', hedefId: <eski sayac id> } olarak kalmıştı.
    // recomputeAllPressures bu eski referansı izleyerek KAYNAK sayacın fleksBaglanti.boruId'sine
    // (yani kaynağın upstream borusuna) düşüyordu — kopyalanan iç tesisatların basıncı kaynağa
    // bağlanıyordu. Kopya komponentleri oluşturulduktan sonra hedefId'leri componentIdMap ile
    // güncelle; kopyalanmamış komponente referansı varsa bağlantıyı kopar.
    const remapComponentRef = (bag) => {
        if (!bag || !bag.tip || bag.tip === 'boru') return bag;
        const newId = componentIdMap.get(bag.hedefId);
        if (newId) { bag.hedefId = newId; return bag; }
        return null;
    };
    for (const newPipe of newPipes) {
        if (newPipe.baslangicBaglanti && newPipe.baslangicBaglanti.tip && newPipe.baslangicBaglanti.tip !== 'boru') {
            newPipe.baslangicBaglanti = remapComponentRef(newPipe.baslangicBaglanti);
        }
        if (newPipe.bitisBaglanti && newPipe.bitisBaglanti.tip && newPipe.bitisBaglanti.tip !== 'boru') {
            newPipe.bitisBaglanti = remapComponentRef(newPipe.bitisBaglanti);
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
            const dP1 = Math.hypot(snapPipe.p1.x - sx, snapPipe.p1.y - sy, (snapPipe.p1.z || 0) - sz);
            const dP2 = Math.hypot(snapPipe.p2.x - sx, snapPipe.p2.y - sy, (snapPipe.p2.z || 0) - sz);
            const snapToP1 = dP1 < dP2;
            const snapNode = snapToP1 ? snapPipe.p1 : snapPipe.p2;

            // NODE PAYLAŞIMINI ZORLA:
            // getOrCreateNodeAt, snap borusunun node'unu haritada bulamazsa (registerPipeNodes
            // çağrılmamış borularda olur) yeni bir ayrı node oluşturur. Bunu düzelt:
            // firstPastePipe.p1'i doğrudan snapNode nesnesiyle değiştir.
            const oldNode = firstPastePipe.p1;
            if (oldNode !== snapNode) {
                firstPastePipe.p1 = snapNode;
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

    // Yapıştırma topolojiyi değiştirdi — her borunun kök kaynağını (parent)
    // ve colorGroup'unu yeniden türet.
    this.manager.recomputePipeParents();

    // Yeni topolojiye göre tüm basınçları yeniden hesapla (regülatör/sayaç zinciri dahil).
    recomputeAllPressures(this.manager);

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

    // Seçili borunun etiketini lineer olarak ötele — p1 sabit, p2 hareketli
    // olduğu için orta nokta yarım delta kadar kayar.
    translateLabel(pipe.id, moveDx / 2, moveDy / 2);

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
        // Downstream borular bütünüyle delta kadar kaydığı için etiketler de
        // tam delta öteleniyor — eski cache temizleme yerine lineer ötele.
        translateLabel(p.id, moveDx, moveDy);
        this.manager.components.forEach(c => {
            if (c.bagliBoruId !== p.id && c.fleksBaglanti?.boruId !== p.id && c.cikisBagliBoruId !== p.id) return;
            if (movedComponents.has(c.id)) return;
            movedComponents.add(c.id);
            c.x += moveDx; c.y += moveDy; c.z = (c.z || 0) + moveDz;
            c.floorId = getFloorIdForZ(c.z) || c.floorId;
            translateLabel(c.id, moveDx, moveDy);
            if (c.type === 'cihaz') moveBacalar(c);
        });
        p.floorId = getFloorIdForZ(p.p1.z || 0) || p.floorId;
    });

    // Seçili borunun p2 ucundaki bileşenler — yalnızca p2'ye bağlı olanlar taşınır.
    // p1 sabit kaldığı için p1'e bağlı sayaç/cihaz/vana hareket etmemeli.
    this.manager.components.forEach(c => {
        if (movedComponents.has(c.id)) return;
        let attachedToP2 = false;
        if (c.fleksBaglanti?.boruId === pipe.id) {
            attachedToP2 = c.fleksBaglanti.endpoint === 'p2';
        } else if (c.cikisBagliBoruId === pipe.id) {
            // Sayacın çıkışı genelde p1'e bağlanır; ama eski verilerde p2 olabilir.
            const cikis = typeof c.getCikisNoktasi === 'function' ? c.getCikisNoktasi() : null;
            if (cikis) {
                const dP1 = Math.hypot(p1.x - cikis.x, p1.y - cikis.y);
                const dP2 = Math.hypot(p2.x - cikis.x, p2.y - cikis.y);
                attachedToP2 = dP2 < dP1;
            }
        }
        if (!attachedToP2) return;
        movedComponents.add(c.id);
        c.x += moveDx; c.y += moveDy; c.z = (c.z || 0) + moveDz;
        c.floorId = getFloorIdForZ(c.z) || c.floorId;
        translateLabel(c.id, moveDx, moveDy);
        if (c.type === 'cihaz') moveBacalar(c);
    });

    // Seçili borunun üzerindeki vana/aksesuar etiketleri — bunlar p2'ye sabit
    // mesafede (fixedDistance) durduğu için p2 hareket ettiğinde tam delta öteleniyor.
    this.manager.components.forEach(c => {
        if (movedComponents.has(c.id)) return;
        if (c.bagliBoruId !== pipe.id) return;
        // Vana ve benzeri boru-üstü bileşenler: konumlarını boruya göre güncelle,
        // etiketi gerçek dünya farkı kadar ötele.
        const oldX = c.x, oldY = c.y;
        if (typeof c.updatePositionFromPipe === 'function') c.updatePositionFromPipe(pipe);
        const vDx = c.x - oldX;
        const vDy = c.y - oldY;
        if (vDx || vDy) translateLabel(c.id, vDx, vDy);
    });

    // Seçili borunun yeni p2 z'sine göre floorId'sini güncelle (p1 katı korunur).
    if (pipe.floorId) {
        const newPipeFloorId = getFloorIdForZ(p1.z || 0);
        if (newPipeFloorId) pipe.floorId = newPipeFloorId;
    }

    // Resize sonrası tüm tesisat nesnelerinin floorId/kat eşleşmesini tazele;
    // gerekiyorsa yeni kat oluşturur. Aksi halde uzayan/kısalan hat kat
    // yönetimine yansımıyor ve cihazlar eski katlarında "aktif" görünüyordu.
    syncAllFloorAssignments(this.manager);

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

    // Downstream bileşenlerini taşı (yalnızca z) — floorId'leri de güncelle
    const movedComponents = new Set();
    downstreamPipes.forEach(p => {
        clearLabelAutoPos(p.id);
        this.manager.components.forEach(c => {
            if (c.bagliBoruId !== p.id && c.fleksBaglanti?.boruId !== p.id && c.cikisBagliBoruId !== p.id) return;
            if (movedComponents.has(c.id)) return;
            movedComponents.add(c.id);
            c.z = (c.z || 0) + moveDz;
            c.floorId = getFloorIdForZ(c.z) || c.floorId;
            if (c.type === 'cihaz') moveBacalarZ(c);
        });
        p.floorId = getFloorIdForZ(p.p1.z || 0) || p.floorId;
    });

    // NOT: Seçili borunun p1 ve p2 uçları yerinde kaldı (yeni düşey boru ARALARINA
    // değil, p2'den itibaren yukarıya/aşağıya eklendi). Dolayısıyla seçili boruya
    // doğrudan bağlı sayaç/cihaz/vana z'sinin değişmemesi gerekir — eski kod
    // bunları yanlış olarak kaydırıyordu.

    // Yeni boruyu ekle
    this.manager.pipes.push(newPipe);
    this.manager.registerPipeNodes(newPipe);
    newPipe.floorId = getFloorIdForZ(newPipe.p1.z || 0) || pipe.floorId;

    // Debi ağacı: newPipe, mevcut borunun devamıdır
    newPipe.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    pipe.bitisBaglanti = { tip: 'boru', hedefId: newPipe.id };

    // pipe'ın eski çocukları (baslangicBaglanti.hedefId === pipe.id) artık newPipe'a bağlanır
    this.manager.pipes.forEach(p => {
        if (p === newPipe) return;
        if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId === pipe.id) {
            p.baslangicBaglanti = { tip: 'boru', hedefId: newPipe.id };
        }
    });

    // Topoloji değişti (yeni düşey boru, çocuklar yeniden bağlandı)
    this.manager.recomputePipeParents();

    // Seçimi yeni düşey boruya aktar — böylece iniş sonrası K/O/S/V-B/V-Y
    // doğrudan yeni hattın açık ucuna yerleşir (tıklama gerektirmez).
    if (this.selectedObject) {
        this.selectedObject.isSelected = false;
    }
    newPipe.isSelected = true;
    this.selectedObject = newPipe;

    // Düşey ekleme cihazlar/sayaçları Z'de kaydırıyor; mevcut katlar dışına
    // çıkılırsa yeni kat oluştur ve tüm floorId eşleşmelerini tazele.
    syncAllFloorAssignments(this.manager);

    this.manager.saveToState();
}

/**
 * Tek-tuş kombi/ocak aksiyonu:
 * Seçili veya çizilen hatta boş uç varsa cihazı otomatik yerleştir;
 * yoksa cihaz ghost moduna geç.
 */
function _doSingleCihaz(cihazTipi) {
    const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
    if (boruUcuInfo) {
        this.cancelCurrentAction();
        this.manager.placeDeviceAtOpenEnd(cihazTipi, boruUcuInfo);
        return;
    }
    // Ghost mod
    this.previousMode = state.currentMode;
    this.previousDrawingMode = state.currentDrawingMode;
    this.previousActiveTool = this.manager.activeTool;
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    this.cancelCurrentAction();
    this.manager.startPlacement('cihaz', { cihazTipi });
    setMode("plumbingV2", true);
}

/**
 * Chord (kk / oo) aksiyonu: iniş borusu ekle, ardından cihazı iniş ucuna yerleştir.
 * Boş uç yoksa tek-tuş davranışına düşer.
 */
function _doInisVeCihazChord(cihazTipi) {
    const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
    if (!boruUcuInfo) {
        _doSingleCihaz.call(this, cihazTipi);
        return;
    }

    const { pipe: parentPipe, end, point } = boruUcuInfo;
    const INIS_CM = 100; // context menü "İniş + Cihaz" ile aynı default

    saveState();
    this.cancelCurrentAction(); // varsa aktif çizim/seçim temizlensin

    const inisBoru = new Boru(
        point,
        { x: point.x, y: point.y, z: (point.z || 0) - INIS_CM },
        parentPipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = parentPipe.colorGroup || 'YELLOW';
    inisBoru.floorId = parentPipe.floorId;
    // Parent ile aynı bölümde kalsın
    inisBoru.boruCap = parentPipe.boruCap || 'DN25';
    if (parentPipe.basinc != null) inisBoru.basinc = parentPipe.basinc;
    this.manager.pipes.push(inisBoru);
    this.manager.registerPipeNodes(inisBoru);

    // Topoloji: iniş, parent'ın ucuna takılır. Parent zaten bir aşağıya
    // yönelmişse override etme — yeni iniş ikinci dal olur (kk/oo seçili
    // boruda çağrıldığında p2 dolu olabilir).
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: parentPipe.id };
    if (end === 'p2') {
        if (!parentPipe.bitisBaglanti?.hedefId) {
            parentPipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
        }
    } else {
        if (!parentPipe.baslangicBaglanti?.hedefId) {
            parentPipe.baslangicBaglanti = { tip: 'boru', hedefId: inisBoru.id };
        }
    }

    this.manager.recomputePipeParents();

    this.manager.placeDeviceAtOpenEnd(cihazTipi, {
        pipe: inisBoru,
        end: 'p2',
        point: inisBoru.p2
    });
    recomputeAllPressures(this.manager);
    this.manager.saveToState();
}

/**
 * Tek-tuş sayaç aksiyonu:
 * Seçili/çizilen hatta boş uç varsa sayacı otomatik yerleştir; yoksa ghost mod.
 */
function _doSingleSayac() {
    const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
    if (boruUcuInfo) {
        this.cancelCurrentAction();
        this.manager.placeMeterAtOpenEnd(boruUcuInfo);
        return;
    }
    this.previousMode = state.currentMode;
    this.previousDrawingMode = state.currentDrawingMode;
    this.previousActiveTool = this.manager.activeTool;
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    this.cancelCurrentAction();
    this.manager.startPlacement(TESISAT_MODLARI.SAYAC);
    setMode("plumbingV2", true);
}

/**
 * Tek-tuş vana aksiyonu:
 * Vana ghost modunu başlat (varsayılan: AKV). V→B / V→Y chord context'i
 * cancelCurrentAction sonrasında set edilir (cancel _vanaChordContext'i temizler).
 */
function _doSingleVana(chordCtx) {
    this.previousMode = state.currentMode;
    this.previousDrawingMode = state.currentDrawingMode;
    this.previousActiveTool = this.manager.activeTool;
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    this.cancelCurrentAction();
    this.manager.startPlacement(TESISAT_MODLARI.VANA, { vanaTipi: 'AKV' });
    this._vanaChordContext = chordCtx || null;
    setMode("plumbingV2", true);
}

/**
 * Chord (ss) aksiyonu: 30 cm iniş borusu ekle, ardından sayacı iniş ucuna yerleştir.
 * Boş uç yoksa tek-tuş davranışına düşer.
 */
function _doInisVeSayacChord() {
    const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
    if (!boruUcuInfo) {
        _doSingleSayac.call(this);
        return;
    }

    const { pipe: parentPipe, end, point } = boruUcuInfo;
    const INIS_CM = 30; // context menü "İniş + Sayaç" ile aynı default

    saveState();
    this.cancelCurrentAction();

    const inisBoru = new Boru(
        point,
        { x: point.x, y: point.y, z: (point.z || 0) - INIS_CM },
        parentPipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = parentPipe.colorGroup || 'YELLOW';
    inisBoru.floorId = parentPipe.floorId;
    // Parent ile aynı bölümde kalsın → hatNo da aynı olsun.
    inisBoru.boruCap = parentPipe.boruCap || 'DN25';
    if (parentPipe.basinc != null) inisBoru.basinc = parentPipe.basinc;
    this.manager.pipes.push(inisBoru);
    this.manager.registerPipeNodes(inisBoru);

    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: parentPipe.id };
    // Parent zaten bir aşağıya yönelmişse override etme — yeni iniş ikinci dal olur.
    if (end === 'p2') {
        if (!parentPipe.bitisBaglanti?.hedefId) {
            parentPipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
        }
    } else {
        if (!parentPipe.baslangicBaglanti?.hedefId) {
            parentPipe.baslangicBaglanti = { tip: 'boru', hedefId: inisBoru.id };
        }
    }

    this.manager.recomputePipeParents();

    this.manager.placeMeterAtOpenEnd({
        pipe: inisBoru,
        end: 'p2',
        point: inisBoru.p2
    });
    recomputeAllPressures(this.manager);
    this.manager.saveToState();
}

/**
 * Chord (vv) aksiyonu: 30 cm iniş borusu ekle, ardından BRANSMAN vanasını iniş ucuna yerleştir.
 * Boş uç yoksa tek-tuş davranışına düşer.
 */
function _doInisVeBransmanChord() {
    const boruUcuInfo = _getSeciliHatinBosUcu.call(this);
    if (!boruUcuInfo) {
        _doSingleVana.call(this, null);
        return;
    }

    const { pipe: parentPipe, end, point } = boruUcuInfo;
    const INIS_CM = 30;

    saveState();
    this.cancelCurrentAction();

    const inisBoru = new Boru(
        point,
        { x: point.x, y: point.y, z: (point.z || 0) - INIS_CM },
        parentPipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = parentPipe.colorGroup || 'YELLOW';
    inisBoru.floorId = parentPipe.floorId;
    // Parent ile aynı bölümde kalsın → vana üzerindeki hatNo parentla aynı görünsün.
    inisBoru.boruCap = parentPipe.boruCap || 'DN25';
    if (parentPipe.basinc != null) inisBoru.basinc = parentPipe.basinc;
    this.manager.pipes.push(inisBoru);
    this.manager.registerPipeNodes(inisBoru);

    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: parentPipe.id };
    if (end === 'p2') {
        if (!parentPipe.bitisBaglanti?.hedefId) {
            parentPipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
        }
    } else {
        if (!parentPipe.baslangicBaglanti?.hedefId) {
            parentPipe.baslangicBaglanti = { tip: 'boru', hedefId: inisBoru.id };
        }
    }

    this.manager.recomputePipeParents();

    // handleVanaPlacement normalde saveState çağırır; chord'da iki ayrı undo
    // adımı oluşmasın diye skipSaveState ile çağırıyoruz (yukarıda zaten saveState yapıldı).
    this.handleVanaPlacement({
        pipe: inisBoru,
        point: inisBoru.p2,
        t: 1.0,
        vanaTipi: 'BRANSMAN',
        skipSaveState: true
    });
    recomputeAllPressures(this.manager);
    this.manager.saveToState();
}