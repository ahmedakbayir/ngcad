import { plumbingManager } from '../plumbing-manager.js';

export function initVerticalPanelListeners() {
    const panel = document.getElementById('vertical-height-panel');
    const input = document.getElementById('vertical-height-input');
    
    // Kat Butonları
    const btnFloorUp = document.getElementById('btn-floor-up');
    const btnFloorDown = document.getElementById('btn-floor-down');

    // Sayaç Butonları
    const btnInc = document.getElementById('btn-inc-10');
    const btnDec = document.getElementById('btn-dec-10');
    const confirmBtn = document.getElementById('vertical-confirm-btn');
    const cancelBtn = document.getElementById('vertical-cancel-btn');
    const closeBtn = document.getElementById('vertical-close-btn');

    if (!panel) return;

    // Dikey hızlı seçim sliderı
    const slider = renderQuickSlider();

    // --- Olay Dinleyicileri ---

    // Input değişimi → slider'ı senkronla
    input.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        updateManagerValue(v);
        if (slider) slider.setValue(isNaN(v) ? 0 : v, false);
    });

    // ESC — input focus iken global keydown engellendiği için (input.js:583
    // input alanı aktifken Escape'i return ediyor) doğrudan input'a bağlıyoruz.
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            plumbingManager.interactionManager.closeVerticalPanel();
        }
    });

    // Artır / Azalt Butonları (+/- 10)
    if(btnInc) btnInc.onclick = () => addToValue(10);
    if(btnDec) btnDec.onclick = () => addToValue(-10);

    // Kat Butonları — yükseklik panel açılışında bağlam noktasının katından alınır
    // (panel.dataset.floorHeight, keyboard-handler.openVerticalPanel'de set edilir)
    const readFloorHeight = () => {
        const h = parseFloat(panel.dataset.floorHeight);
        return (h && !isNaN(h) && h > 0) ? h : 280;
    };
    if(btnFloorUp) btnFloorUp.onclick = () => setExactValue(readFloorHeight());
    if(btnFloorDown) btnFloorDown.onclick = () => setExactValue(-readFloorHeight());

    // Panel her açılışta slider'ı input değerine (0) eşle
    const observer = new MutationObserver(() => {
        if (panel.style.display !== 'none' && slider) {
            const v = parseFloat(input.value) || 0;
            slider.setValue(v, false);
        }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['style'] });

    // Mouse Tekerleği ile Değer Değiştirme
    panel.addEventListener('wheel', (e) => {
        e.preventDefault();
        // Yukarı çevirirse +5, aşağı çevirirse -5
        const delta = e.deltaY < 0 ? 5 : -5;
        addToValue(delta);
    }, { passive: false });

    // Onay ve İptal
    confirmBtn.onclick = () => {
        plumbingManager.interactionManager.applyVerticalHeight();
    };

    cancelBtn.onclick = closeBtn.onclick = () => {
        plumbingManager.interactionManager.closeVerticalPanel();
    };

    // Yardımcı Fonksiyonlar
    function addToValue(amount) {
        let current = parseFloat(input.value) || 0;
        let newVal = current + amount;
        input.value = newVal;
        updateManagerValue(newVal);
        if (slider) slider.setValue(newVal, false);
    }
    
    function setExactValue(val) {
        input.value = val;
        updateManagerValue(val);
        if (slider) slider.setValue(val, false);
        input.focus();
    }

    function updateManagerValue(val) {
        if (plumbingManager.interactionManager) {
            plumbingManager.interactionManager.verticalHeightInput = val || 0;
        }
    }
}

// ─── Hızlı Slider (yan sütun, dikey, eşit dağılımlı tutamaç) ────────────────
// 15 satır: en üstte "+++" (auto +), altında 150/120/100/80/50/30/0/-30/.../-150,
// en altta "---" (auto −). Eşit aralıklarla dizilir; tick uzunluğu |değer|/150
// ile orantılıdır. "+++" veya "---" snap'ine kilitlenip basılı tutulursa
// 1 sn'de bir ±50 artarak ±500 maks değere kadar gider.
function renderQuickSlider() {
    const container = document.getElementById('quick-values-container');
    if (!container) return null;

    container.innerHTML = '';

    // null değer = auto-extend ucu (label sadece görsel)
    const ROWS = [
        { value: null, label: '+++', auto: +1 },
        { value:  150, label: '+150' },
        { value:  120, label: '+120' },
        { value:  100, label: '+100' },
        { value:   80, label: '+80'  },
        { value:   50, label: '+50'  },
        { value:   30, label: '+30'  },
        { value:    0, label: '0'    },
        { value:  -30, label: '-30'  },
        { value:  -50, label: '-50'  },
        { value:  -80, label: '-80'  },
        { value: -100, label: '-100' },
        { value: -120, label: '-120' },
        { value: -150, label: '-150' },
        { value: null, label: '---', auto: -1 }
    ];
    const MAX_VISIBLE = 150;
    const MAX_AUTO = 500;
    const AUTO_STEP = 50;
    const AUTO_INTERVAL_MS = 1000;

    const TICK_MIN_PX = 6;
    const TICK_MAX_PX = 48;

    const track = document.createElement('div');
    track.className = 'quick-slider-track';
    container.appendChild(track);

    // Eşit dağılım: her satır idx/(n-1) konumunda
    const topPctForIndex = (idx) => (idx / (ROWS.length - 1)) * 100;

    // Değerden satır indeksi (tam değer veya en yakın snap)
    const indexForValue = (val) => {
        if (val == null || isNaN(val)) return ROWS.findIndex(r => r.value === 0);
        // Auto-extend bölgesi: +++/--- satırlarına kilitle
        if (val >  MAX_VISIBLE) return 0;
        if (val < -MAX_VISIBLE) return ROWS.length - 1;
        // En yakın değerli satır
        let bestIdx = 0, bestDist = Infinity;
        ROWS.forEach((r, i) => {
            if (r.value == null) return;
            const d = Math.abs(val - r.value);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        });
        return bestIdx;
    };

    // Satır oluştur
    ROWS.forEach((row, idx) => {
        const topPct = topPctForIndex(idx);

        const tick = document.createElement('div');
        const isAuto = row.value === null;
        const isNeg  = !isAuto && row.value < 0;
        const isZero = row.value === 0;
        tick.className = 'quick-slider-tick'
            + (isZero ? ' zero' : '')
            + (isNeg  ? ' negative' : '')
            + (isAuto ? ' auto-extend' : '');
        tick.style.top = `${topPct}%`;
        if (!isZero) {
            const mag = isAuto ? MAX_VISIBLE : Math.abs(row.value);
            const widthPx = TICK_MIN_PX + (mag / MAX_VISIBLE) * (TICK_MAX_PX - TICK_MIN_PX);
            tick.style.width = `${widthPx}px`;
        }
        track.appendChild(tick);

        const label = document.createElement('div');
        label.className = 'quick-slider-tick-label'
            + (isZero ? ' zero' : '')
            + (isAuto ? ' auto-extend' : '');
        label.textContent = row.label;
        label.style.top = `${topPct}%`;
        track.appendChild(label);
    });

    const handle = document.createElement('div');
    handle.className = 'quick-slider-handle';
    track.appendChild(handle);

    const bubble = document.createElement('div');
    bubble.className = 'quick-slider-value-bubble';
    track.appendChild(bubble);

    let currentValue = 0;
    let autoTimer = null;
    let dragging = false;

    const setValue = (val, syncInput = true) => {
        const v = Math.max(-MAX_AUTO, Math.min(MAX_AUTO, Math.round(val)));
        currentValue = v;
        const idx = indexForValue(v);
        const topPct = topPctForIndex(idx);
        handle.style.top = `${topPct}%`;
        handle.classList.toggle('negative', v < 0);
        bubble.style.top = `${topPct}%`;
        bubble.textContent = v > 0 ? `+${v}` : `${v}`;
        bubble.classList.toggle('negative', v < 0);

        if (syncInput) {
            const inputEl = document.getElementById('vertical-height-input');
            if (inputEl) inputEl.value = v;
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.verticalHeightInput = v;
            }
        }
    };

    const stopAuto = () => {
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
        track.classList.remove('auto-extending');
    };

    const startAuto = (direction) => {
        if (autoTimer) return;
        track.classList.add('auto-extending');
        autoTimer = setInterval(() => {
            const next = currentValue + direction * AUTO_STEP;
            if (Math.abs(next) > MAX_AUTO) { stopAuto(); return; }
            setValue(next);
        }, AUTO_INTERVAL_MS);
    };

    // y pixel → satır indeksi (eşit aralıklı dağılıma göre)
    const yPxToRowIndex = (yPx, trackH) => {
        const clamped = Math.max(0, Math.min(trackH, yPx));
        const ratio = clamped / trackH;
        return Math.round(ratio * (ROWS.length - 1));
    };

    const onMove = (e) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const idx = yPxToRowIndex(y, rect.height);
        const row = ROWS[idx];

        if (row.auto) {
            // +++/--- satırı veya track dışı → otomatik genişleme
            startAuto(row.auto);
            setValue(row.auto > 0
                ? Math.max(currentValue,  MAX_VISIBLE)
                : Math.min(currentValue, -MAX_VISIBLE));
        } else {
            stopAuto();
            setValue(row.value);
        }
    };

    const onUp = () => {
        dragging = false;
        track.classList.remove('dragging');
        stopAuto();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    track.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        track.classList.add('dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        onMove(e);
    });

    setValue(0, false);

    return { setValue };
}