/**
 * Vertical Height Panel Handler
 * Düşey yükseklik paneli etkileşimlerini yönetir
 */

import { plumbingManager } from '../plumbing-manager.js';

/**
 * Düşey panel event listener'larını başlat
 */
export function initVerticalPanelListeners() {
    const panel = document.getElementById('vertical-height-panel');
    const input = document.getElementById('vertical-height-input');
    const arrowUp = document.getElementById('vertical-arrow-up');
    const arrowDown = document.getElementById('vertical-arrow-down');

    if (!panel || !input || !arrowUp || !arrowDown) {
        console.warn('Vertical panel elements not found');
        return;
    }

    // Ayarlardan hızlı değerleri yükle
    loadQuickValuesFromSettings();

    // ▲ buton: 1 artır
    arrowUp.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentValue = parseFloat(input.value) || 0;
        const newValue = currentValue + 1;
        input.value = newValue;
        updateInteractionManagerValue(newValue);
    });

    // ▼ buton: 1 azalt
    arrowDown.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentValue = parseFloat(input.value) || 0;
        const newValue = currentValue - 1;
        input.value = newValue;
        updateInteractionManagerValue(newValue);
    });

    // Mouse wheel: Artır/azalt (panel üzerinde)
    panel.addEventListener('wheel', (e) => {
        e.preventDefault();
        const currentValue = parseFloat(input.value) || 0;
        const delta = e.deltaY > 0 ? -1 : 1; // Aşağı scroll = azalt, yukarı = artır
        const newValue = currentValue + delta;
        input.value = newValue;
        updateInteractionManagerValue(newValue);
    });

    // Hızlı değer butonları - Plus (+)
    const plusBtns = document.querySelectorAll('.vertical-quick-plus');
    plusBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = parseFloat(btn.getAttribute('data-value')) || 0;
            const currentValue = parseFloat(input.value) || 0;
            const newValue = currentValue + value;
            input.value = newValue;
            updateInteractionManagerValue(newValue);
        });
    });

    // Hızlı değer butonları - Minus (-)
    const minusBtns = document.querySelectorAll('.vertical-quick-minus');
    minusBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = parseFloat(btn.getAttribute('data-value')) || 0;
            const currentValue = parseFloat(input.value) || 0;
            const newValue = currentValue + value; // data-value zaten negatif
            input.value = newValue;
            updateInteractionManagerValue(newValue);
        });
    });

    // Panel dışına tıklandığında kapat (opsiyonel - şimdilik yok)
    // document.addEventListener('click', (e) => {
    //     if (plumbingManager.interactionManager.verticalModeActive && !panel.contains(e.target)) {
    //         plumbingManager.interactionManager.closeVerticalPanel();
    //     }
    // });

    // Ayarlar menüsünden değer değişikliklerini dinle
    setupSettingsListeners();
}

/**
 * InteractionManager'daki değeri güncelle
 */
function updateInteractionManagerValue(value) {
    if (plumbingManager && plumbingManager.interactionManager) {
        plumbingManager.interactionManager.verticalHeightInput = value;
    }
}

/**
 * Hızlı değerleri güncelle (ayarlar menüsünden)
 */
export function updateQuickValues(values) {
    const quickLabels = document.querySelectorAll('.vertical-quick-label');
    const plusBtns = document.querySelectorAll('.vertical-quick-plus');
    const minusBtns = document.querySelectorAll('.vertical-quick-minus');

    if (quickLabels.length !== 4 || values.length !== 4) {
        console.warn('Quick values mismatch');
        return;
    }

    // Label'ları ve buton değerlerini güncelle
    quickLabels.forEach((label, index) => {
        label.textContent = values[index];
    });

    plusBtns.forEach((btn, index) => {
        btn.setAttribute('data-value', values[index]);
    });

    minusBtns.forEach((btn, index) => {
        btn.setAttribute('data-value', -values[index]); // Negatif değer
    });

    // InteractionManager'daki değerleri de güncelle
    if (plumbingManager && plumbingManager.interactionManager) {
        plumbingManager.interactionManager.verticalQuickValues = [...values];
    }
}

/**
 * Ayarlardan hızlı değerleri yükle
 */
function loadQuickValuesFromSettings() {
    const values = [
        parseInt(document.getElementById('vertical-quick-1')?.value) || 5,
        parseInt(document.getElementById('vertical-quick-2')?.value) || 10,
        parseInt(document.getElementById('vertical-quick-3')?.value) || 30,
        parseInt(document.getElementById('vertical-quick-4')?.value) || 100
    ];
    updateQuickValues(values);
}

/**
 * Ayarlar menüsü input'larına listener ekle
 */
function setupSettingsListeners() {
    for (let i = 1; i <= 4; i++) {
        const input = document.getElementById(`vertical-quick-${i}`);
        if (input) {
            input.addEventListener('change', () => {
                loadQuickValuesFromSettings();
            });
        }
    }
}
