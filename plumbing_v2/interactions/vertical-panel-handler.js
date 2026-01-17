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

    // Kullanıcının istediği pratik değerler (Grid yapısı için)
    const quickValues = [20, 30, 50, 100, -20, -30, -50, -100]; 
    renderQuickButtons(quickValues);

    // --- Olay Dinleyicileri ---

    // Input değişimi
    input.addEventListener('input', (e) => {
        updateManagerValue(parseFloat(e.target.value));
    });

    // Artır / Azalt Butonları (+/- 10)
    if(btnInc) btnInc.onclick = () => addToValue(10);
    if(btnDec) btnDec.onclick = () => addToValue(-10);

    // Kat Butonları
    if(btnFloorUp) btnFloorUp.onclick = () => setExactValue(280);
    if(btnFloorDown) btnFloorDown.onclick = () => setExactValue(-280);

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
    }
    
    function setExactValue(val) {
        input.value = val;
        updateManagerValue(val);
        input.focus();
    }

    function updateManagerValue(val) {
        if (plumbingManager.interactionManager) {
            plumbingManager.interactionManager.verticalHeightInput = val || 0;
        }
    }
}

function renderQuickButtons(values) {
    const container = document.getElementById('quick-values-container');
    if (!container) return;

    container.innerHTML = ''; // Temizle

    values.forEach(val => {
        const btn = document.createElement('button');
        btn.className = 'quick-val-btn';
        // Pozitifse başına + koy, negatifse zaten - var
        const label = val > 0 ? `+${val}` : `${val}`;
        btn.textContent = label;
        
        btn.onclick = () => {
            const input = document.getElementById('vertical-height-input');
            let current = parseFloat(input.value) || 0;
            let newVal = current + val; // MEVCUT DEĞERE EKLER
            
            input.value = newVal;
            
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.verticalHeightInput = newVal;
            }
            input.focus();
        };
        
        container.appendChild(btn);
    });
}