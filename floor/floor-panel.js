// floor-panel.js
import { state, setState } from '../general-files/main.js';

let floorPanel = null;

/**
 * Kat panelini oluşturur (sadece bir kez)
 */
export function createFloorPanel() {
    if (floorPanel) return;

    floorPanel = document.createElement('div');
    floorPanel.id = 'floor-panel';
    floorPanel.style.cssText = `
        position: fixed;
        background: #2a2b2c;
        border: 1px solid #8ab4f8;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: none;
        min-width: 500px;
        max-width: 600px;
    `;

    floorPanel.innerHTML = `
        <div style="margin-bottom: 16px; font-size: 14px; font-weight: 500;
                    color: #8ab4f8; border-bottom: 1px solid #3a3b3c; padding-bottom: 8px;
                    display: flex; justify-content: space-between; align-items: center;">
            <span>KAT YÖNETİMİ</span>
            <button id="close-floor-panel" style="background: transparent; border: none;
                    color: #e7e6d0; cursor: pointer; font-size: 18px; padding: 0; width: 24px; height: 24px;">
                ✕
            </button>
        </div>
        <div id="floor-table-container" style="overflow-y: auto; max-height: 400px;">
            <!-- Tablo buraya dinamik olarak eklenecek -->
        </div>
    `;

    document.body.appendChild(floorPanel);
    setupFloorPanelListeners();
}

/**
 * Panel event listener'larını kurar
 */
function setupFloorPanelListeners() {
    const closeBtn = floorPanel.querySelector('#close-floor-panel');
    closeBtn.addEventListener('click', hideFloorPanel);

    // Panel dışına tıklandığında kapat
    document.addEventListener('click', (e) => {
        if (floorPanel.style.display === 'block' &&
            !floorPanel.contains(e.target) &&
            e.target.id !== 'bFloors') {
            hideFloorPanel();
        }
    });
}

/**
 * Kat tablosunu render eder
 */
export function renderFloorTable() {
    if (!floorPanel) return;

    const tableContainer = floorPanel.querySelector('#floor-table-container');
    const floors = state.floors || [];

    let html = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid #3a3b3c;">
                    <th style="padding: 8px; text-align: left; color: #8ab4f8; font-size: 12px; width: 60px;">Göster</th>
                    <th style="padding: 8px; text-align: left; color: #8ab4f8; font-size: 12px; width: 120px;">Kat Adı</th>
                    <th style="padding: 8px; text-align: left; color: #8ab4f8; font-size: 12px;">Ön İzleme</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Katları ters sırada göster (en üstteki kat en üstte)
    const sortedFloors = [...floors].reverse();

    sortedFloors.forEach((floor, index) => {
        const isActive = state.currentFloor?.id === floor.id;
        let rowStyle = '';

        if (floor.isPlaceholder) {
            // Placeholder satırları için özel stil
            rowStyle = 'background: rgba(95, 99, 104, 0.1);';
        } else if (isActive) {
            rowStyle = 'background: rgba(138, 180, 248, 0.1); border-left: 3px solid #8ab4f8;';
        }

        // Kat adını belirle (placeholder için ok işareti ekle)
        let floorNameDisplay = floor.name;
        if (floor.isPlaceholder) {
            const arrow = floor.isBelow ? '↓' : '↑';
            floorNameDisplay = `${arrow} ${floor.name} ${arrow}`;
        }

        html += `
            <tr data-floor-id="${floor.id}"
                style="${rowStyle} border-bottom: 1px solid #3a3b3c; cursor: pointer;"
                class="floor-row">
                <td style="padding: 8px;">
                    ${floor.isPlaceholder ?
                        '' :
                        `<input type="checkbox"
                                class="floor-visibility-toggle"
                                data-floor-id="${floor.id}"
                                ${floor.visible ? 'checked' : ''}
                                style="cursor: pointer;"/>`
                    }
                </td>
                <td style="padding: 8px; color: ${floor.isPlaceholder ? '#5f6368' : (isActive ? '#8ab4f8' : '#e7e6d0')}; font-size: 13px; font-weight: ${floor.isPlaceholder ? 'bold' : 'normal'};">
                    ${floorNameDisplay}
                    ${isActive && !floor.isPlaceholder ? '<span style="color: #24ffda; font-size: 11px;"> (AKTİF)</span>' : ''}
                </td>
                <td style="padding: 8px;">
                    ${floor.isPlaceholder ?
                        renderPlaceholderPreview(floor) :
                        renderFloorPreview(floor)
                    }
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;

    // Event listener'ları ekle
    setupTableEventListeners();
}

/**
 * Placeholder kat önizlemesi (kesikli çizgiler + buton)
 */
function renderPlaceholderPreview(floor) {
    return `
        <div style="position: relative; width: 150px; height: 60px;">
            <svg width="150" height="60" style="display: block;">
                <rect x="10" y="10" width="130" height="40"
                      fill="none"
                      stroke="#5f6368"
                      stroke-width="1"
                      stroke-dasharray="4,4"/>
                <line x1="10" y1="10" x2="140" y2="50"
                      stroke="#5f6368"
                      stroke-width="1"
                      stroke-dasharray="4,4"/>
                <line x1="140" y1="10" x2="10" y2="50"
                      stroke="#5f6368"
                      stroke-width="1"
                      stroke-dasharray="4,4"/>
            </svg>
            <button class="add-floor-btn"
                    data-floor-id="${floor.id}"
                    style="position: absolute;
                           top: 50%;
                           left: 50%;
                           transform: translate(-50%, -50%);
                           background: #3a3b3c;
                           color: #8ab4f8;
                           border: 1px solid #8ab4f8;
                           border-radius: 50%;
                           width: 30px;
                           height: 30px;
                           font-size: 18px;
                           cursor: pointer;
                           display: flex;
                           align-items: center;
                           justify-content: center;
                           transition: all 0.2s;">
                +
            </button>
        </div>
    `;
}

/**
 * Normal kat önizlemesi (düz çizgiler)
 */
function renderFloorPreview(floor) {
    return `
        <svg width="150" height="60" style="display: block;">
            <rect x="10" y="10" width="130" height="40"
                  fill="none"
                  stroke="#e7e6d0"
                  stroke-width="1.5"/>
            <line x1="10" y1="10" x2="140" y2="50"
                  stroke="#e7e6d0"
                  stroke-width="1"/>
            <line x1="140" y1="10" x2="10" y2="50"
                  stroke="#e7e6d0"
                  stroke-width="1"/>
        </svg>
    `;
}

/**
 * Tablo event listener'larını kurar
 */
function setupTableEventListeners() {
    // Satıra tıklama - katı aktif yap
    const rows = floorPanel.querySelectorAll('.floor-row');
    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            // Checkbox veya button tıklamasıysa ignore et
            if (e.target.classList.contains('floor-visibility-toggle') ||
                e.target.classList.contains('add-floor-btn')) {
                return;
            }

            const floorId = row.dataset.floorId;
            const floor = state.floors.find(f => f.id === floorId);

            if (floor && !floor.isPlaceholder) {
                setState({ currentFloor: floor });
                renderFloorTable();
            }
        });
    });

    // Görünürlük toggle'ları
    const visibilityToggles = floorPanel.querySelectorAll('.floor-visibility-toggle');
    visibilityToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = toggle.dataset.floorId;
            toggleFloorVisibility(floorId);
        });
    });

    // Kat ekleme butonları
    const addButtons = floorPanel.querySelectorAll('.add-floor-btn');
    addButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = btn.dataset.floorId;
            addFloorFromPlaceholder(floorId);
        });

        // Hover efekti
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#8ab4f8';
            btn.style.color = '#1e1f20';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#3a3b3c';
            btn.style.color = '#8ab4f8';
        });
    });
}

/**
 * Kat görünürlüğünü toggle eder
 */
function toggleFloorVisibility(floorId) {
    const floors = state.floors.map(f => {
        if (f.id === floorId) {
            return { ...f, visible: !f.visible };
        }
        return f;
    });

    setState({ floors });
    renderFloorTable();
}

/**
 * Placeholder'dan yeni kat ekler
 */
function addFloorFromPlaceholder(placeholderId) {
    const floors = [...state.floors];
    const placeholderIndex = floors.findIndex(f => f.id === placeholderId);

    if (placeholderIndex === -1) return;

    const placeholder = floors[placeholderIndex];
    const isAboveGround = placeholder.bottomElevation >= 0; // Zemin ve üstü

    let newFloorName;
    let newPlaceholderName;

    if (isAboveGround) {
        // Zemin üstü - KAT ekleme
        const existingFloors = floors
            .filter(f => !f.isPlaceholder && f.name.includes('.KAT'))
            .map(f => parseInt(f.name.split('.')[0]))
            .filter(n => !isNaN(n));

        const maxFloorNumber = existingFloors.length > 0 ? Math.max(...existingFloors) : 0;
        const newFloorNumber = maxFloorNumber + 1;
        newFloorName = `${newFloorNumber}.KAT`;
    } else {
        // Zemin altı - BODRUM ekleme
        const existingBasements = floors
            .filter(f => !f.isPlaceholder && f.name.includes('.BODRUM'))
            .map(f => parseInt(f.name.split('.')[0]))
            .filter(n => !isNaN(n));

        const maxBasementNumber = existingBasements.length > 0 ? Math.max(...existingBasements) : 0;
        const newBasementNumber = maxBasementNumber + 1;
        newFloorName = `${newBasementNumber}.BODRUM`;
    }

    // Placeholder'ı gerçek kata dönüştür
    floors[placeholderIndex] = {
        ...placeholder,
        name: newFloorName,
        isPlaceholder: false,
        visible: true
    };

    // Yeni placeholder ekle
    let newBottomElevation, newTopElevation;

    if (isAboveGround) {
        // Üste yeni placeholder ekle
        newBottomElevation = floors[placeholderIndex].topElevation;
        newTopElevation = newBottomElevation + state.defaultFloorHeight;

        floors.splice(placeholderIndex, 0, {
            id: `floor-placeholder-${Date.now()}`,
            name: 'KAT EKLE',
            bottomElevation: newBottomElevation,
            topElevation: newTopElevation,
            visible: false,
            isPlaceholder: true,
            isBelow: false
        });
    } else {
        // Alta yeni placeholder ekle
        newTopElevation = floors[placeholderIndex].bottomElevation;
        newBottomElevation = newTopElevation - state.defaultFloorHeight;

        floors.splice(placeholderIndex + 1, 0, {
            id: `floor-placeholder-${Date.now()}`,
            name: 'KAT EKLE',
            bottomElevation: newBottomElevation,
            topElevation: newTopElevation,
            visible: false,
            isPlaceholder: true,
            isBelow: true
        });
    }

    // Katları yüksekliğe göre sırala
    floors.sort((a, b) => a.bottomElevation - b.bottomElevation);

    // Yeni eklenen katı bul ve aktif yap
    const newFloor = floors.find(f => f.name === newFloorName);

    setState({
        floors,
        currentFloor: newFloor
    });

    renderFloorTable();
}

/**
 * Kat panelini gösterir
 */
export function showFloorPanel() {
    if (!floorPanel) {
        createFloorPanel();
    }

    // Panel'i ekranın ortasına yerleştir
    floorPanel.style.display = 'block';
    floorPanel.style.left = '50%';
    floorPanel.style.top = '50%';
    floorPanel.style.transform = 'translate(-50%, -50%)';

    renderFloorTable();
}

/**
 * Kat panelini gizler
 */
export function hideFloorPanel() {
    if (floorPanel) {
        floorPanel.style.display = 'none';
    }
}

/**
 * Kat panelinin görünür olup olmadığını döndürür
 */
export function isFloorPanelVisible() {
    return floorPanel && floorPanel.style.display === 'block';
}
