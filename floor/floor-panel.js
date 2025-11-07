// floor-panel.js
import { state, setState } from '../general-files/main.js';

let miniPanel = null; // Sağda sabit dar panel
let detailPanel = null; // Detaylı panel (çift tıklama ile açılır)

/**
 * Mini kat panelini oluşturur (sağda sabit)
 */
export function createFloorPanel() {
    if (miniPanel) return;

    // Mini panel oluştur
    miniPanel = document.createElement('div');
    miniPanel.id = 'floor-mini-panel';
    miniPanel.style.cssText = `
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        background: #2a2b2c;
        border: 1px solid #5f6368;
        border-right: none;
        border-radius: 8px 0 0 8px;
        padding: 8px 4px;
        box-shadow: -2px 0 8px rgba(0,0,0,0.3);
        z-index: 1000;
        width: 50px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        align-items: center;
    `;

    miniPanel.innerHTML = `
        <div id="floor-expand-btn" style="position: absolute; left: -20px; top: 50%; transform: translateY(-50%); cursor: pointer; background: #2a2b2c; border: 1px solid #5f6368; border-right: none; border-radius: 4px 0 0 4px; padding: 8px 4px; box-shadow: -2px 0 4px rgba(0,0,0,0.2); transition: left 0.2s; z-index: 1;" title="Katlar Panelini Aç">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8ab4f8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="8 2, 4 6, 8 10"></polyline>
            </svg>
        </div>
        <div id="floor-scroll-up" style="display: none; cursor: pointer; padding: 4px; color: #8ab4f8; font-size: 16px;">▲</div>
        <div id="floor-mini-list" style="flex: 1; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0;">
            <!-- Katlar buraya dinamik olarak eklenecek -->
        </div>
        <div id="floor-scroll-down" style="display: none; cursor: pointer; padding: 4px; color: #8ab4f8; font-size: 16px;">▼</div>
    `;

    document.body.appendChild(miniPanel);

    // Genişleme butonu
    const expandBtn = miniPanel.querySelector('#floor-expand-btn');
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDetailPanel();
    });

    // Hover efekti - genişleme butonunu daha görünür yap
    miniPanel.addEventListener('mouseenter', () => {
        expandBtn.style.left = '-24px';
    });
    miniPanel.addEventListener('mouseleave', () => {
        expandBtn.style.left = '-20px';
    });

    // Çift tıklama ile detaylı panel aç
    miniPanel.addEventListener('dblclick', showDetailPanel);

    // Kaydırma okları
    setupScrollButtons();

    // Detaylı panel oluştur
    createDetailPanel();

    // İlk render
    renderMiniPanel();
}

/**
 * Kaydırma butonlarını kurar
 */
function setupScrollButtons() {
    const scrollUp = miniPanel.querySelector('#floor-scroll-up');
    const scrollDown = miniPanel.querySelector('#floor-scroll-down');
    const floorList = miniPanel.querySelector('#floor-mini-list');

    scrollUp.addEventListener('click', (e) => {
        e.stopPropagation();
        floorList.scrollTop -= 50;
        updateScrollButtons();
    });

    scrollDown.addEventListener('click', (e) => {
        e.stopPropagation();
        floorList.scrollTop += 50;
        updateScrollButtons();
    });

    floorList.addEventListener('scroll', updateScrollButtons);
}

/**
 * Kaydırma butonlarının görünürlüğünü günceller
 */
function updateScrollButtons() {
    const scrollUp = miniPanel.querySelector('#floor-scroll-up');
    const scrollDown = miniPanel.querySelector('#floor-scroll-down');
    const floorList = miniPanel.querySelector('#floor-mini-list');

    // Yukarı kaydırma göster
    scrollUp.style.display = floorList.scrollTop > 0 ? 'block' : 'none';

    // Aşağı kaydırma göster
    const isAtBottom = floorList.scrollHeight - floorList.scrollTop <= floorList.clientHeight + 5;
    scrollDown.style.display = isAtBottom ? 'none' : 'block';
}

/**
 * Mini paneli render eder
 */
export function renderMiniPanel() {
    if (!miniPanel) return;

    const floorList = miniPanel.querySelector('#floor-mini-list');
    const floors = state.floors || [];

    // Tüm katları sırala (gizli olanları tespit için)
    const allSortedFloors = [...floors]
        .filter(f => !f.isPlaceholder)
        .sort((a, b) => b.bottomElevation - a.bottomElevation);

    let html = '';

    allSortedFloors.forEach((floor, index) => {
        const isActive = state.currentFloor?.id === floor.id;
        const isVisible = floor.visible !== false;

        if (!isVisible) {
            // Gizli kat - kesikli çizgi göster
            const gapHeight = Math.max(8, state.defaultFloorHeight / 5 * 0.1); // Piksel cinsinden boşluk
            html += `
                <div style="width: 30px; height: ${gapHeight}px; display: flex; align-items: center; justify-content: center;">
                    <svg width="24" height="${gapHeight}" viewBox="0 0 24 ${gapHeight}">
                        <line x1="2" y1="${gapHeight/2}" x2="22" y2="${gapHeight/2}"
                              stroke="#5f6368" stroke-width="1" stroke-dasharray="2,2" />
                    </svg>
                </div>
            `;
            return; // Gizli katı gösterme
        }

        // Kat kısa adı
        const shortName = getShortFloorName(floor.name);

        // Durum renkler
        let bgColor, textColor;

        if (isActive) {
            // Aktif görünür - Mavi
            bgColor = '#8ab4f8';
            textColor = '#1e1f20';
        } else {
            // Pasif görünür - Koyu gri
            bgColor = '#4a4b4c';
            textColor = '#e7e6d0';
        }

        html += `
            <div class="floor-mini-item clickable"
                 data-floor-id="${floor.id}"
                 style="background: ${bgColor};
                        color: ${textColor};
                        padding: 6px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                        text-align: center;
                        min-width: 36px;
                        cursor: pointer;
                        transition: all 0.2s;">
                ${shortName}
            </div>
        `;
    });

    floorList.innerHTML = html;

    // Kat tıklama event'leri
    floorList.querySelectorAll('.floor-mini-item.clickable').forEach(item => {
        // Tek tıklama - kat değiştir
        item.addEventListener('click', (e) => {
            const floorId = item.dataset.floorId;
            const floor = floors.find(f => f.id === floorId);
            if (floor && floor.visible !== false) {
                setState({ currentFloor: floor });
                renderMiniPanel();
            }
        });

        // Çift tıklama - detaylı panel aç
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            showDetailPanel();
        });

        // Hover efekti
        item.addEventListener('mouseenter', () => {
            if (item.dataset.floorId !== state.currentFloor?.id) {
                item.style.transform = 'scale(1.05)';
            }
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
        });
    });

    updateScrollButtons();
}

/**
 * Kat adını kısaltır (K3, K2, K1, Z, B1, B2)
 */
function getShortFloorName(fullName) {
    if (fullName === 'ZEMİN') return 'Z';
    if (fullName.includes('.KAT')) {
        return 'K' + fullName.split('.')[0];
    }
    if (fullName.includes('.BODRUM')) {
        return 'B' + fullName.split('.')[0];
    }
    return fullName.substring(0, 2);
}

/**
 * Detaylı kat panelini oluşturur
 */
function createDetailPanel() {
    if (detailPanel) return;

    detailPanel = document.createElement('div');
    detailPanel.id = 'floor-detail-panel';
    detailPanel.style.cssText = `
        position: fixed;
        background: #2a2b2c;
        border: 1px solid #8ab4f8;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: none;
        width: 600px;
        max-height: 80vh;
        overflow-y: auto;
    `;

    detailPanel.innerHTML = `
        <div style="margin-bottom: 16px; font-size: 14px; font-weight: 500;
                    color: #8ab4f8; border-bottom: 1px solid #3a3b3c; padding-bottom: 8px;
                    display: flex; justify-content: space-between; align-items: center;">
            <span>KAT YÖNETİMİ</span>
            <button id="close-detail-panel" style="background: transparent; border: none;
                    color: #e7e6d0; cursor: pointer; font-size: 18px; padding: 0; width: 24px; height: 24px;">
                ✕
            </button>
        </div>
        <div id="floor-detail-table-container">
            <!-- Tablo buraya dinamik olarak eklenecek -->
        </div>
    `;

    document.body.appendChild(detailPanel);
    setupDetailPanelListeners();
}

/**
 * Detaylı panel event listener'ları
 */
function setupDetailPanelListeners() {
    const closeBtn = detailPanel.querySelector('#close-detail-panel');
    closeBtn.addEventListener('click', hideDetailPanel);

    // Panel dışına tıklandığında kapat
    document.addEventListener('click', (e) => {
        if (detailPanel.style.display === 'block' &&
            !detailPanel.contains(e.target) &&
            !miniPanel.contains(e.target)) {
            hideDetailPanel();
        }
    });
}

/**
 * Detaylı paneli gösterir
 */
export function showDetailPanel() {
    if (!detailPanel) {
        createDetailPanel();
    }

    // Panel'i ekranın ortasına yerleştir
    detailPanel.style.display = 'block';
    detailPanel.style.left = '50%';
    detailPanel.style.top = '50%';
    detailPanel.style.transform = 'translate(-50%, -50%)';

    renderDetailPanel();
}

/**
 * Detaylı paneli gizler
 */
export function hideDetailPanel() {
    if (detailPanel) {
        detailPanel.style.display = 'none';
    }
}

/**
 * Detaylı kat tablosunu render eder
 */
function renderDetailPanel() {
    if (!detailPanel) return;

    const tableContainer = detailPanel.querySelector('#floor-detail-table-container');
    const floors = state.floors || [];

    let html = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid #3a3b3c;">
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 40px;">Göster</th>
                    <th style="padding: 6px; text-align: left; color: #8ab4f8; font-size: 11px; width: 100px;">Kat Adı</th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px;">Ön İzleme</th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 40px;">Sil</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Katları ters sırada göster (en üstteki kat en üstte)
    const sortedFloors = [...floors].reverse();

    sortedFloors.forEach(floor => {
        const isActive = state.currentFloor?.id === floor.id;
        const isVisible = floor.visible !== false;
        let rowStyle = '';

        if (floor.isPlaceholder) {
            rowStyle = 'background: rgba(95, 99, 104, 0.1);';
        } else if (isActive) {
            rowStyle = 'background: rgba(138, 180, 248, 0.1); border-left: 3px solid #8ab4f8;';
        }

        // Gizli katlar için opacity ekle
        if (!isVisible && !floor.isPlaceholder) {
            rowStyle += ' opacity: 0.4;';
        }

        // Kat adını belirle (placeholder için ok işareti ekle)
        let floorNameDisplay = floor.name;
        if (floor.isPlaceholder) {
            const arrow = floor.isBelow ? '↓' : '↑';
            floorNameDisplay = `${arrow} ${floor.name} ${arrow}`;
        }

        const isDraggable = !floor.isPlaceholder && floor.name !== 'ZEMİN';

        html += `
            <tr data-floor-id="${floor.id}"
                style="${rowStyle} border-bottom: 1px solid #3a3b3c; cursor: ${isDraggable ? 'move' : 'pointer'}; height: 50px;"
                class="floor-row ${isDraggable ? 'floor-draggable' : ''}"
                draggable="${isDraggable}">
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ? '' : renderVisibilityToggle(floor)}
                </td>
                <td style="padding: 4px; color: ${floor.isPlaceholder ? '#5f6368' : (isActive ? '#8ab4f8' : '#e7e6d0')}; font-size: 12px; font-weight: ${floor.isPlaceholder ? 'bold' : 'normal'};">
                    ${floorNameDisplay}
                    ${isActive && !floor.isPlaceholder ? '<span style="color: #24ffda; font-size: 10px;"> (AKTİF)</span>' : ''}
                </td>
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ?
                        renderPlaceholderPreview(floor) :
                        renderFloorPreview(floor)
                    }
                </td>
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder || floor.name === 'ZEMİN' ? '' : renderDeleteButton(floor)}
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;
    setupDetailTableEventListeners();
}

/**
 * Görünürlük toggle göz ikonu (SVG)
 */
function renderVisibilityToggle(floor) {
    const isVisible = floor.visible !== false;
    const title = isVisible ? 'Gizle' : 'Göster';
    const color = isVisible ? '#8ab4f8' : '#5f6368';

    // Görünür - Göz ikonu
    const eyeIcon = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>
    `;

    // Gizli - Çizili göz ikonu (password şeklinde)
    const eyeOffIcon = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
    `;

    return `
        <button class="floor-visibility-btn"
                data-floor-id="${floor.id}"
                style="background: transparent;
                       border: none;
                       cursor: pointer;
                       padding: 2px;
                       display: flex;
                       align-items: center;
                       justify-content: center;
                       transition: transform 0.2s;"
                title="${title}">
            ${isVisible ? eyeIcon : eyeOffIcon}
        </button>
    `;
}

/**
 * Silme butonu (çöp kutusu)
 */
function renderDeleteButton(floor) {
    return `
        <button class="floor-delete-btn"
                data-floor-id="${floor.id}"
                style="background: transparent;
                       border: 1px solid #e74c3c;
                       color: #e74c3c;
                       border-radius: 4px;
                       cursor: pointer;
                       font-size: 14px;
                       padding: 2px 6px;
                       transition: all 0.2s;"
                title="Katı Sil">
            🗑️
        </button>
    `;
}

/**
 * Placeholder kat önizlemesi (küçük, kesikli çizgiler + buton)
 */
function renderPlaceholderPreview(floor) {
    return `
        <div style="position: relative; width: 80px; height: 40px; display: inline-block;">
            <svg width="80" height="40" style="display: block;">
                <rect x="5" y="5" width="70" height="30"
                      fill="none"
                      stroke="#5f6368"
                      stroke-width="1"
                      stroke-dasharray="3,3"/>
                <line x1="5" y1="5" x2="75" y2="35"
                      stroke="#5f6368"
                      stroke-width="0.5"
                      stroke-dasharray="3,3"/>
                <line x1="75" y1="5" x2="5" y2="35"
                      stroke="#5f6368"
                      stroke-width="0.5"
                      stroke-dasharray="3,3"/>
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
                           width: 20px;
                           height: 20px;
                           font-size: 14px;
                           cursor: pointer;
                           display: flex;
                           align-items: center;
                           justify-content: center;
                           transition: all 0.2s;
                           line-height: 1;">
                +
            </button>
        </div>
    `;
}

/**
 * Normal kat önizlemesi - proje içeriği ile (1/500 ölçek)
 */
function renderFloorPreview(floor) {
    const scale = 1 / 500; // 1:500 ölçek
    const svgWidth = 80;
    const svgHeight = 40;

    // Kattaki elemanları filtrele
    const walls = state.walls || [];
    const doors = state.doors || [];
    const rooms = state.rooms || [];

    // Tüm elemanların bounds'ını hesapla
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    walls.forEach(wall => {
        if (wall.p1 && wall.p2) {
            minX = Math.min(minX, wall.p1.x, wall.p2.x);
            minY = Math.min(minY, wall.p1.y, wall.p2.y);
            maxX = Math.max(maxX, wall.p1.x, wall.p2.x);
            maxY = Math.max(maxY, wall.p1.y, wall.p2.y);
        }
    });

    // Eğer hiç eleman yoksa basit önizleme göster
    if (!isFinite(minX)) {
        return `
            <svg width="${svgWidth}" height="${svgHeight}" style="display: block; margin: 0 auto;">
                <rect x="5" y="5" width="70" height="30"
                      fill="none"
                      stroke="#5f6368"
                      stroke-width="1"
                      stroke-dasharray="2,2"/>
                <text x="40" y="25" text-anchor="middle" font-size="8" fill="#5f6368">Boş</text>
            </svg>
        `;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Ölçekleme faktörü
    const padding = 5;
    const availableWidth = svgWidth - 2 * padding;
    const availableHeight = svgHeight - 2 * padding;

    const scaleX = availableWidth / (width * scale || 1);
    const scaleY = availableHeight / (height * scale || 1);
    const finalScale = Math.min(scaleX, scaleY) * scale;

    // SVG çiz
    let svgContent = '';

    // Duvarları çiz
    walls.forEach(wall => {
        if (wall.p1 && wall.p2) {
            const x1 = (wall.p1.x - centerX) * finalScale + svgWidth / 2;
            const y1 = (wall.p1.y - centerY) * finalScale + svgHeight / 2;
            const x2 = (wall.p2.x - centerX) * finalScale + svgWidth / 2;
            const y2 = (wall.p2.y - centerY) * finalScale + svgHeight / 2;

            svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                                stroke="#e7e6d0" stroke-width="0.5"/>`;
        }
    });

    // Kapıları çiz (kırmızı)
    doors.forEach(door => {
        if (door.position) {
            const x = (door.position.x - centerX) * finalScale + svgWidth / 2;
            const y = (door.position.y - centerY) * finalScale + svgHeight / 2;

            svgContent += `<circle cx="${x}" cy="${y}" r="0.8" fill="#ff6b6b"/>`;
        }
    });

    return `
        <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="display: block; margin: 0 auto; background: #1e1f20;">
            ${svgContent}
        </svg>
    `;
}

/**
 * Detaylı tablo event listener'ları
 */
function setupDetailTableEventListeners() {
    // Satıra tıklama - katı aktif yap
    const rows = detailPanel.querySelectorAll('.floor-row');
    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            // Eğer buton tıklamasıysa ignore et
            if (e.target.closest('.floor-visibility-btn') ||
                e.target.closest('.floor-delete-btn') ||
                e.target.closest('.add-floor-btn')) {
                return;
            }

            const floorId = row.dataset.floorId;
            const floor = state.floors.find(f => f.id === floorId);

            if (floor && !floor.isPlaceholder && floor.visible !== false) {
                setState({ currentFloor: floor });
                renderDetailPanel();
                renderMiniPanel();
            }
        });
    });

    // Görünürlük toggle'ları
    const visibilityBtns = detailPanel.querySelectorAll('.floor-visibility-btn');
    visibilityBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = btn.dataset.floorId;
            toggleFloorVisibility(floorId);
        });
    });

    // Silme butonları
    const deleteBtns = detailPanel.querySelectorAll('.floor-delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = btn.dataset.floorId;
            confirmDeleteFloor(floorId);
        });

        // Hover efekti
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#e74c3c';
            btn.style.color = '#fff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
            btn.style.color = '#e74c3c';
        });
    });

    // Kat ekleme butonları
    const addButtons = detailPanel.querySelectorAll('.add-floor-btn');
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

    // Drag & Drop - Sürüklenebilir katlar
    const draggableRows = detailPanel.querySelectorAll('.floor-draggable');
    let draggedRow = null;

    draggableRows.forEach(row => {
        // Drag başladı
        row.addEventListener('dragstart', (e) => {
            draggedRow = row;
            row.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', row.innerHTML);
        });

        // Drag bitti
        row.addEventListener('dragend', (e) => {
            row.style.opacity = '1';

            // Tüm satırlardan drop-target class'ını kaldır
            draggableRows.forEach(r => {
                r.style.borderTop = '';
                r.style.borderBottom = '';
            });
        });

        // Üzerine gelindi
        row.addEventListener('dragover', (e) => {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropType = 'move';

            // Görsel feedback
            if (draggedRow !== row) {
                const rect = row.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;

                if (e.clientY < midpoint) {
                    row.style.borderTop = '2px solid #8ab4f8';
                    row.style.borderBottom = '';
                } else {
                    row.style.borderTop = '';
                    row.style.borderBottom = '2px solid #8ab4f8';
                }
            }
        });

        // Üzerinden çıkıldı
        row.addEventListener('dragleave', (e) => {
            row.style.borderTop = '';
            row.style.borderBottom = '';
        });

        // Bırakıldı
        row.addEventListener('drop', (e) => {
            if (e.stopPropagation) {
                e.stopPropagation();
            }

            row.style.borderTop = '';
            row.style.borderBottom = '';

            if (draggedRow !== row) {
                const draggedFloorId = draggedRow.dataset.floorId;
                const targetFloorId = row.dataset.floorId;

                swapFloors(draggedFloorId, targetFloorId, e.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
            }

            return false;
        });
    });
}

/**
 * İki katın yerini değiştirir
 */
function swapFloors(draggedFloorId, targetFloorId, insertBefore) {
    const draggedFloor = state.floors.find(f => f.id === draggedFloorId);
    if (!draggedFloor) return;

    // Onay dialogu
    const confirmed = confirm(`"${draggedFloor.name}" katının yerini değiştirmek istediğinize emin misiniz?`);
    if (!confirmed) return;

    const floors = [...state.floors];
    const draggedIndex = floors.findIndex(f => f.id === draggedFloorId);
    const targetIndex = floors.findIndex(f => f.id === targetFloorId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const draggedFloorObj = floors[draggedIndex];
    const targetFloorObj = floors[targetIndex];

    // Yükseklikleri değiştir
    const tempBottom = draggedFloorObj.bottomElevation;
    const tempTop = draggedFloorObj.topElevation;

    draggedFloorObj.bottomElevation = targetFloorObj.bottomElevation;
    draggedFloorObj.topElevation = targetFloorObj.topElevation;

    targetFloorObj.bottomElevation = tempBottom;
    targetFloorObj.topElevation = tempTop;

    // Katları yeniden sırala
    floors.sort((a, b) => a.bottomElevation - b.bottomElevation);

    // Kat numaralarını yeniden düzenle
    renumberFloors(floors);

    setState({ floors });
    renderDetailPanel();
    renderMiniPanel();
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
    renderDetailPanel();
    renderMiniPanel();
}

/**
 * Kat silme onayı
 */
function confirmDeleteFloor(floorId) {
    const floor = state.floors.find(f => f.id === floorId);
    if (!floor) return;

    const confirmed = confirm(`"${floor.name}" katı silinecek. Emin misiniz?`);
    if (confirmed) {
        deleteFloor(floorId);
    }
}

/**
 * Katı siler, diğer katları kaydırır ve yeniden isimlendirir
 */
function deleteFloor(floorId) {
    const floor = state.floors.find(f => f.id === floorId);
    if (!floor) return;

    const floors = [...state.floors];
    const floorIndex = floors.findIndex(f => f.id === floorId);

    if (floorIndex === -1) return;

    const isAboveGround = floor.bottomElevation >= 0;
    const floorHeight = floor.topElevation - floor.bottomElevation;

    // Katı sil
    floors.splice(floorIndex, 1);

    // Diğer katları kaydır
    if (isAboveGround) {
        // Zemin üstü - üstteki katları aşağı kaydır
        floors.forEach(f => {
            if (f.bottomElevation > floor.bottomElevation) {
                f.bottomElevation -= floorHeight;
                f.topElevation -= floorHeight;
            }
        });
    } else {
        // Zemin altı - alttaki katları yukarı kaydır
        floors.forEach(f => {
            if (f.topElevation <= floor.bottomElevation) {
                f.bottomElevation += floorHeight;
                f.topElevation += floorHeight;
            }
        });
    }

    // Kat numaralarını yeniden düzenle
    renumberFloors(floors);

    // Eğer silinen kat aktifse, başka bir kata geç
    let newCurrentFloor = state.currentFloor;
    if (state.currentFloor?.id === floorId) {
        newCurrentFloor = floors.find(f => !f.isPlaceholder && f.visible !== false) || null;
    }

    setState({ floors, currentFloor: newCurrentFloor });
    renderDetailPanel();
    renderMiniPanel();
}

/**
 * Katları sırasına göre yeniden numaralandırır
 */
function renumberFloors(floors) {
    // Katları yüksekliğe göre sırala
    const sortedFloors = [...floors]
        .filter(f => !f.isPlaceholder)
        .sort((a, b) => a.bottomElevation - b.bottomElevation);

    // Zemin üstü katlar
    const aboveGroundFloors = sortedFloors.filter(f =>
        f.bottomElevation > 0 && f.name.includes('.KAT')
    );

    aboveGroundFloors.forEach((floor, index) => {
        floor.name = `${index + 1}.KAT`;
    });

    // Zemin altı katlar (bodrum)
    const belowGroundFloors = sortedFloors.filter(f =>
        f.topElevation <= 0 && f.name.includes('.BODRUM')
    ).reverse(); // En alttakinden başla

    belowGroundFloors.forEach((floor, index) => {
        floor.name = `${index + 1}.BODRUM`;
    });
}

/**
 * Placeholder'dan yeni kat ekler
 */
function addFloorFromPlaceholder(placeholderId) {
    const floors = [...state.floors];
    const placeholderIndex = floors.findIndex(f => f.id === placeholderId);

    if (placeholderIndex === -1) return;

    const placeholder = floors[placeholderIndex];
    const isAboveGround = placeholder.bottomElevation >= 0;

    let newFloorName;

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
            name: 'ÜSTE KAT EKLE',
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
            name: 'ALTA KAT EKLE',
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

    renderDetailPanel();
    renderMiniPanel();
}

/**
 * Eski showFloorPanel - şimdi detaylı paneli açar
 */
export function showFloorPanel() {
    showDetailPanel();
}

/**
 * Eski hideFloorPanel - şimdi detaylı paneli kapatır
 */
export function hideFloorPanel() {
    hideDetailPanel();
}
