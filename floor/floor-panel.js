// floor-panel.js
import { state, setState, setDrawingMode, setMode } from '../general-files/main.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

let miniPanel = null; // Sağda sabit dar panel
let detailPanel = null; // Detaylı panel (çift tıklama ile açılır)
let selectedFloors = new Set(); // Seçili katların ID'leri

/**
 * Kat isminin kısa versiyonunu döndürür
 */
function getShortFloorName(fullName) {
    if (fullName === 'ZEMİN') return 'ZEMİN';
    if (fullName.includes('.KAT')) {
        return fullName.split('.')[0] + '. KAT';
    }
    if (fullName.includes('.BODRUM')) {
        return fullName.split('.')[0] + '. BODRUM' ;
    }
    return fullName.substring(0, 2);
}

/**
 * Mini kat panelini oluşturur (sağda sabit)
 */
export function createFloorPanel() {
    if (miniPanel) return;

    // Mini panel oluştur - Üstte yatay
    miniPanel = document.createElement('div');
    miniPanel.id = 'floor-mini-panel';
    miniPanel.style.cssText = `
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(42, 43, 44, 0.9);
        border: 1px solid #5f6368;
        border-top: none;
        border-radius: 0;
        padding: 6px 10px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 1000;
        max-width: 90vw;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        backdrop-filter: blur(4px);
    `;

    miniPanel.innerHTML = `
        <!-- Proje Modları (MİMARİ / TESİSAT / KARMA) -->
        <div id="drawing-mode-selector" style="display: flex; gap: 4px; margin-right: 8px; padding-right: 8px; border-right: 1px solid #5f6368;">
            <button class="mode-btn" id="mode-mimari" title="Mimari Mod" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: rgba(60, 64, 67, 0.8); border: 1px solid #5f6368; color: #e8eaed; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap;">MİMARİ</button>
            <button class="mode-btn" id="mode-tesisat" title="Tesisat Mod" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: rgba(60, 64, 67, 0.8); border: 1px solid #5f6368; color: #e8eaed; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap;">TESİSAT</button>
            <button class="mode-btn active" id="mode-karma" title="Karma Mod" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: rgba(100, 149, 237, 0.4); border: 1px solid #87CEEB; color: #87CEEB; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap; box-shadow: 0 0 8px rgba(135, 206, 235, 0.5);">KARMA</button>
        </div>

        <div id="floor-expand-btn" style="cursor: pointer; padding: 4px 8px; background: transparent; border: 1px solid #5f6368; border-radius: 4px; transition: all 0.2s;" title="Katlar Panelini Aç">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8ab4f8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <!-- Bina temeli -->
                <rect x="2" y="20" width="20" height="2" fill="#8ab4f8" stroke="none"></rect>
                <!-- Bina gövdesi (3 katlı) -->
                <rect x="4" y="8" width="16" height="12" stroke="#8ab4f8" fill="none"></rect>
                <!-- Kat çizgileri (yatay) -->
                <line x1="4" y1="12" x2="20" y2="12" stroke="#8ab4f8"></line>
                <line x1="4" y1="16" x2="20" y2="16" stroke="#8ab4f8"></line>
                <!-- Pencereler (her katta 3 pencere) -->
                <rect x="6" y="9.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="11" y="9.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="16" y="9.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="6" y="13.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="11" y="13.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="16" y="13.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="6" y="17.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="11" y="17.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <rect x="16" y="17.5" width="2" height="1.5" fill="#8ab4f8"></rect>
                <!-- Çatı (üçgen) -->
                <polyline points="12,3 20,8 4,8" stroke="#8ab4f8" fill="none"></polyline>
            </svg>
        </div>
        <div id="floor-scroll-left" style="display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px 6px; color: #8ab4f8; font-size: 16px; transition: all 0.2s; opacity: 0.3;">◀</div>
        <div id="floor-mini-list" style="flex: 1; overflow-x: auto; overflow-y: hidden; display: flex; flex-direction: row; align-items: center; gap: 6px; scrollbar-width: none;">
            <!-- Katlar buraya dinamik olarak eklenecek -->
        </div>
        <div id="floor-scroll-right" style="display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px 6px; color: #8ab4f8; font-size: 16px; transition: all 0.2s; opacity: 0.3;">▶</div>
    `;

    document.body.appendChild(miniPanel);

    // Genişleme butonu - toggle (aç/kapat)
    const expandBtn = miniPanel.querySelector('#floor-expand-btn');
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Detaylı panel açıksa kapat, kapalıysa aç
        if (detailPanel && detailPanel.style.display === 'block') {
            hideDetailPanel();
        } else {
            showDetailPanel();
        }
    });

    // Hover efekti
    expandBtn.addEventListener('mouseenter', () => {
        expandBtn.style.background = 'rgba(95, 99, 104, 0.3)';
    });
    expandBtn.addEventListener('mouseleave', () => {
        expandBtn.style.background = 'transparent';
    });

    // Kaydırma okları
    setupScrollButtons();

    // Mod butonları
    setupModeButtons();

    // Detaylı panel oluştur
    createDetailPanel();

    // İlk render
    renderMiniPanel();

    // Window resize'da pozisyon kontrolü
    window.addEventListener('resize', () => {
        if (miniPanel) {
            adjustFloorPanelPosition();
        }
    });
}

/**
 * Mod butonlarını kurar (MİMARİ, TESİSAT, KARMA)
 */
function setupModeButtons() {
    const modeMimari = miniPanel.querySelector('#mode-mimari');
    const modeTesisat = miniPanel.querySelector('#mode-tesisat');
    const modeKarma = miniPanel.querySelector('#mode-karma');

    if (!modeMimari || !modeTesisat || !modeKarma) return;

    // Buton hover efektleri
    [modeMimari, modeTesisat, modeKarma].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if (!btn.classList.contains('active')) {
                btn.style.background = 'rgba(80, 84, 87, 0.9)';
                btn.style.borderColor = '#87CEEB';
                btn.style.transform = 'scale(1.05)';
                btn.style.boxShadow = '0 2px 4px rgba(135, 206, 235, 0.3)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (!btn.classList.contains('active')) {
                btn.style.background = 'rgba(60, 64, 67, 0.8)';
                btn.style.borderColor = '#5f6368';
                btn.style.transform = 'scale(1)';
                btn.style.boxShadow = 'none';
            }
        });
    });

    // Aktif buton stilini güncelle
    function updateActiveButton(activeMode) {
        [modeMimari, modeTesisat, modeKarma].forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = 'rgba(60, 64, 67, 0.8)';
            btn.style.borderColor = '#5f6368';
            btn.style.color = '#e8eaed';
            btn.style.boxShadow = 'none';
        });

        const activeBtn = activeMode === 'MİMARİ' ? modeMimari :
                         activeMode === 'TESİSAT' ? modeTesisat : modeKarma;
        activeBtn.classList.add('active');
        activeBtn.style.background = 'rgba(100, 149, 237, 0.4)';
        activeBtn.style.borderColor = '#87CEEB';
        activeBtn.style.color = '#87CEEB';
        activeBtn.style.boxShadow = '0 0 8px rgba(135, 206, 235, 0.5)';
    }

    // Buton click event'leri
    modeMimari.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawingMode('MİMARİ');
        updateActiveButton('MİMARİ');
    });

    modeTesisat.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawingMode('TESİSAT');
        updateActiveButton('TESİSAT');
    });

    modeKarma.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawingMode('KARMA');
        setMode('select', true); // KARMA modunda otomatik SEÇ moduna geç
        updateActiveButton('KARMA');
    });

    // İlk yüklemede aktif modu ayarla
    updateActiveButton(state.currentDrawingMode);
}

/**
 * Kaydırma butonlarını kurar (yatay)
 */
function setupScrollButtons() {
    const scrollLeft = miniPanel.querySelector('#floor-scroll-left');
    const scrollRight = miniPanel.querySelector('#floor-scroll-right');
    const floorList = miniPanel.querySelector('#floor-mini-list');

    scrollLeft.addEventListener('click', (e) => {
        e.stopPropagation();
        floorList.scrollLeft -= 100;
        updateScrollButtons();
    });

    scrollRight.addEventListener('click', (e) => {
        e.stopPropagation();
        floorList.scrollLeft += 100;
        updateScrollButtons();
    });

    // Mouse wheel ile yatay kaydırma
    floorList.addEventListener('wheel', (e) => {
        e.preventDefault();
        floorList.scrollLeft += e.deltaY;
        updateScrollButtons();
    });

    floorList.addEventListener('scroll', updateScrollButtons);
}

/**
 * Kaydırma butonlarının görünürlüğünü günceller (yatay)
 */
function updateScrollButtons() {
    const scrollLeft = miniPanel.querySelector('#floor-scroll-left');
    const scrollRight = miniPanel.querySelector('#floor-scroll-right');
    const floorList = miniPanel.querySelector('#floor-mini-list');

    // Scroll gerekli mi kontrol et
    const needsScroll = floorList.scrollWidth > floorList.clientWidth + 5;

    // Scroll gerekmiyorsa okları tamamen gizle
    if (!needsScroll) {
        scrollLeft.style.display = 'none';
        scrollRight.style.display = 'none';
        return;
    }

    // Scroll gerekiyorsa okları göster ve opacity ile kontrol et
    scrollLeft.style.display = 'flex';
    scrollRight.style.display = 'flex';

    // Sola kaydırma - başta ise soluk
    scrollLeft.style.opacity = floorList.scrollLeft > 0 ? '1' : '0.3';
    scrollLeft.style.cursor = floorList.scrollLeft > 0 ? 'pointer' : 'default';

    // Sağa kaydırma - sonda ise soluk
    const isAtRight = floorList.scrollWidth - floorList.scrollLeft <= floorList.clientWidth + 5;
    scrollRight.style.opacity = isAtRight ? '0.3' : '1';
    scrollRight.style.cursor = isAtRight ? 'default' : 'pointer';
}

/**
 * Mini paneli render eder
 */
export function renderMiniPanel() {
    if (!miniPanel) return;

    const floorList = miniPanel.querySelector('#floor-mini-list');
    const floors = state.floors || [];

    // Tüm katları sırala (küçükten büyüğe, soldan sağa)
    const allSortedFloors = [...floors]
        .filter(f => !f.isPlaceholder)
        .sort((a, b) => a.bottomElevation - b.bottomElevation);

    let html = '';

    allSortedFloors.forEach((floor, index) => {
        const isActive = state.currentFloor?.id === floor.id;
        const isVisible = floor.visible !== false;

        if (!isVisible) {
            // Gizli kat - tek tire işareti göster
            html += `
                <div style="width: 8px; height: 36px; display: flex; align-items: center; justify-content: center; color: #5f6368; font-size: 18px;">
                    –
                </div>
            `;
            return; // Gizli katı gösterme
        }

        // Kat kısa adı
        const shortName = getShortFloorName(floor.name);

        // Bu katta çizim var mı kontrol et (floor-specific)
        const floorWalls = (state.walls || []).filter(w => w.floorId === floor.id);
        const floorDoors = (state.doors || []).filter(d => d.floorId === floor.id);
        const floorColumns = (state.columns || []).filter(c => c.floorId === floor.id);
        const floorBeams = (state.beams || []).filter(b => b.floorId === floor.id);
        const floorStairs = (state.stairs || []).filter(s => s.floorId === floor.id);
        const hasContent = floorWalls.length > 0 || floorDoors.length > 0 ||
                          floorColumns.length > 0 || floorBeams.length > 0 || floorStairs.length > 0;

        // Durum renkler
        let bgColor, textColor, dotColor;

        if (isActive) {
            // Aktif görünür - Mavi
            bgColor = '#8ab4f8';
            textColor = '#1e1f20';
            dotColor = '#1e5a8e'; // Koyu mavi nokta
        } else {
            // Pasif görünür - Koyu gri
            bgColor = '#4a4b4c';
            textColor = '#e7e6d0';
            dotColor = '#808080'; // Gri nokta
        }

        // Nokta HTML (sadece içerik varsa, sağ üst köşede)
        const dotHtml = hasContent ? `<span style="position: absolute; top: 4px; right: 4px; width: 4px; height: 4px; border-radius: 50%; background: ${dotColor};"></span>` : '';

        html += `
            <div class="floor-mini-item clickable"
                 data-floor-id="${floor.id}"
                 style="position: relative;
                        background: ${bgColor};
                        color: ${textColor};
                        padding: 6px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                        text-align: center;
                        min-width: 40px;
                        cursor: pointer;
                        transition: all 0.2s;">
                ${shortName}${dotHtml}
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
                update3DScene(); // 3D sahneyi güncelle
            }
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
    adjustFloorPanelPosition();
}

/**
 * Kat panelinin pozisyonunu ekran sınırlarına göre ayarlar
 */
function adjustFloorPanelPosition() {
    if (!miniPanel) return;

    const viewportWidth = window.innerWidth;

    // Sol ve sağ boşluk oranları (ekranın %26'sı)
    const leftLimit = viewportWidth * 0.26; // Soldan %26 boşluk
    const rightLimit = viewportWidth * 0.74; // Sağdan %26 boşluk (ekranın %74'üne kadar)

    // Kullanılabilir maksimum genişlik
    const maxAvailableWidth = rightLimit - leftLimit;

    // Panele maksimum genişlik uygula
    if (maxAvailableWidth > 0) {
        miniPanel.style.maxWidth = `${maxAvailableWidth}px`;
    }

    // Önce paneli merkeze al
    miniPanel.style.left = '50%';
    miniPanel.style.transform = 'translateX(-50%)';

    // Panelin güncel pozisyonunu kontrol et
    const panelRect = miniPanel.getBoundingClientRect();
    const panelLeft = panelRect.left;
    const panelRight = panelRect.right;
    const panelWidth = panelRect.width;

    let adjustedLeft = null;

    // Sol taraftan kontrol - ekranın %26'sından sola gitmesin
    if (panelLeft < leftLimit) {
        // Sol sınırı aşıyor, paneli sağa kaydır
        const newCenterPx = leftLimit + (panelWidth / 2);
        adjustedLeft = (newCenterPx / viewportWidth) * 100;
    }

    // Sağ taraftan kontrol - ekranın %74'ünden sağa gitmesin
    if (panelRight > rightLimit) {
        // Sağ sınırı aşıyor, paneli sola kaydır
        const newCenterPx = rightLimit - (panelWidth / 2);
        const newLeftPercent = (newCenterPx / viewportWidth) * 100;

        // Eğer sol kontrol de ayarlama yaptıysa, ikisinin ortalamasını al
        if (adjustedLeft !== null) {
            adjustedLeft = Math.max(adjustedLeft, newLeftPercent);
        } else {
            adjustedLeft = newLeftPercent;
        }
    }

    // Ayarlama yapılacaksa uygula
    if (adjustedLeft !== null) {
        miniPanel.style.left = `${adjustedLeft}%`;
    }
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
        width: 650px;
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

// Global listener'lar için flag
let detailPanelListenersAdded = false;

/**
 * Detaylı panel event listener'ları
 */
function setupDetailPanelListeners() {
    const closeBtn = detailPanel.querySelector('#close-detail-panel');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideDetailPanel();
    });

    // Panel içindeki TÜM tıklamaları durdur (document'e bubble up etmesin)
    detailPanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Global listener'ları sadece bir kez ekle
    if (detailPanelListenersAdded) return;
    detailPanelListenersAdded = true;

    // Panel dışına tıklandığında kapat
    document.addEventListener('click', (e) => {
        if (detailPanel &&
            detailPanel.style.display === 'block' &&
            !detailPanel.contains(e.target) &&
            !miniPanel.contains(e.target)) {
            hideDetailPanel();
        }
    });

    // ESC tuşuna basıldığında kapat
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailPanel && detailPanel.style.display === 'block') {
            e.preventDefault();
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

    // Panel'i mini panel'in hemen altında aç
    detailPanel.style.display = 'block';
    detailPanel.style.left = '50%';

    // Mini panel'in yüksekliğini hesapla ve hemen altında aç
    const miniPanelHeight = miniPanel ? miniPanel.offsetHeight : 40;
    detailPanel.style.top = `${miniPanelHeight + 5}px`;

    detailPanel.style.transform = 'translateX(-50%)';

    renderDetailPanel();
}

/**
 * Detaylı paneli gizler
 */
export function hideDetailPanel() {
    if (detailPanel) {
        detailPanel.style.display = 'none';
        // Panel kapatıldığında seçimleri temizle
        selectedFloors.clear();
    }
}

/**
 * Detaylı kat tablosunu render eder
 */
function renderDetailPanel() {
    if (!detailPanel) return;

    const tableContainer = detailPanel.querySelector('#floor-detail-table-container');
    const floors = state.floors || [];

    // Toplu işlem butonları
    const bulkActionsHtml = selectedFloors.size > 0 ? `
        <div style="margin-bottom: 12px; padding: 8px; background: rgba(138, 180, 248, 0.1); border: 1px solid #8ab4f8; border-radius: 4px; display: flex; gap: 8px; align-items: center;">
            <span style="color: #8ab4f8; font-size: 11px; font-weight: 500;">${selectedFloors.size} kat seçildi</span>
            <button id="bulk-delete-btn" class="wall-panel-btn" style="padding: 4px 8px; font-size: 11px; background: rgba(220, 53, 69, 0.2); border-color: #dc3545; color: #dc3545;">
                Seçilenleri Sil
            </button>
            <button id="bulk-height-btn" class="wall-panel-btn" style="padding: 4px 8px; font-size: 11px;">
                Yükseklik Ver
            </button>
            <button id="clear-selection-btn" class="wall-panel-btn" style="padding: 4px 8px; font-size: 11px; background: transparent;">
                Seçimi Temizle
            </button>
        </div>
    ` : '';

    let html = bulkActionsHtml + `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid #3a3b3c;">
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 35px;">
                        <input type="checkbox" id="select-all-floors" style="cursor: pointer;" ${selectedFloors.size === floors.filter(f => !f.isPlaceholder).length && selectedFloors.size > 0 ? 'checked' : ''}>
                    </th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 40px;">Göster</th>
                    <th style="padding: 6px; text-align: left; color: #8ab4f8; font-size: 11px; width: 160px;">Kat Adı</th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 70px;">Kat Y.<br>(cm)</th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 80px;">Toplam Y.<br>(cm)</th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px;">Ön İzleme</th>
                    <th style="padding: 6px; text-align: center; color: #8ab4f8; font-size: 11px; width: 40px;">Sil</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Katları ters sırada göster (en üstteki kat en üstte)
    const sortedFloors = [...floors].reverse();

    // Tüm katlar için global bounds hesapla (önizlemeler için)
    const globalBounds = calculateGlobalBounds();

    // İlk placeholder'ı (üste ekle) bulalım - satırlar arası ayırıcı için
    const upperPlaceholderIndex = sortedFloors.findIndex(f => f.isPlaceholder && !f.isBelow);
    const lowerPlaceholderIndex = sortedFloors.findIndex(f => f.isPlaceholder && f.isBelow);

    sortedFloors.forEach((floor, index) => {
        // Alt placeholder'dan önce ayırıcı çizgi ekle
        if (index === lowerPlaceholderIndex && lowerPlaceholderIndex !== -1) {
            html += `
                <tr style="height: 2px; background: #5f6368;">
                    <td colspan="7" style="padding: 0; height: 2px; background: linear-gradient(to right, transparent, #8ab4f8, transparent);"></td>
                </tr>
            `;
        }

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

        // Kat adını belirle (placeholder için + butonu ekle)
        let floorNameDisplay = floor.name;
        if (floor.isPlaceholder) {
            floorNameDisplay = `
                <button class="add-floor-btn-inline"
                        data-floor-id="${floor.id}"
                        style="background: #3a3b3c;
                               color: #8ab4f8;
                               border: 1px solid #8ab4f8;
                               border-radius: 50%;
                               width: 20px;
                               height: 20px;
                               font-size: 14px;
                               cursor: pointer;
                               display: inline-flex;
                               align-items: center;
                               justify-content: center;
                               transition: all 0.2s;
                               line-height: 1;
                               margin-right: 8px;
                               vertical-align: middle;">
                    +
                </button>
                <span style="vertical-align: middle;">${floor.name}</span>
            `;
        }

        const isDraggable = !floor.isPlaceholder && floor.name !== 'ZEMİN';

        // Kat yüksekliği ve toplam Y. hesapla
        const floorHeight = floor.isPlaceholder ? '' : Math.round(floor.topElevation - floor.bottomElevation);
        const totalY = floor.isPlaceholder ? '' : Math.round(floor.topElevation);

        html += `
            <tr data-floor-id="${floor.id}"
                style="${rowStyle} border-bottom: 1px solid #3a3b3c; cursor: ${isDraggable ? 'move' : 'pointer'}; height: 50px;"
                class="floor-row ${isDraggable ? 'floor-draggable' : ''}"
                draggable="${isDraggable}">
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ? '' : `<input type="checkbox" class="floor-checkbox" data-floor-id="${floor.id}" style="cursor: pointer;" ${selectedFloors.has(floor.id) ? 'checked' : ''}>`}
                </td>
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ? '' : renderVisibilityToggle(floor)}
                </td>
                <td style="padding: 4px; color: ${floor.isPlaceholder ? '#5f6368' : (isActive ? '#8ab4f8' : '#e7e6d0')}; font-size: 12px; font-weight: ${floor.isPlaceholder ? 'bold' : 'normal'};">
                    ${floorNameDisplay}
                    ${isActive && !floor.isPlaceholder ? '<span style="color: #24ffda; font-size: 10px;"> (AKTİF)</span>' : ''}
                </td>
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ? '' : `
                        <input type="number"
                               class="floor-height-input"
                               data-floor-id="${floor.id}"
                               value="${floorHeight}"
                               style="width: 60px; padding: 6px 4px; background: #3a3b3c; color: #e7e6d0; border: 1px solid #5f6368; border-radius: 3px; text-align: center; font-size: 11px; height: 30px;"
                               min="100"
                               max="1000"
                               step="10" />
                    `}
                </td>
                <td style="padding: 4px; text-align: center; color: #e7e6d0; font-size: 11px;">
                    ${totalY}
                </td>
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ?
                        renderPlaceholderPreview(floor) :
                        renderFloorPreview(floor, globalBounds)
                    }
                </td>
                <td style="padding: 4px; text-align: center;">
                    ${floor.isPlaceholder ? '' : renderDeleteButton(floor)}
                </td>
            </tr>
        `;

        // Üst placeholder'dan sonra ayırıcı çizgi ekle
        if (index === upperPlaceholderIndex && upperPlaceholderIndex !== -1) {
            html += `
                <tr style="height: 2px; background: #5f6368;">
                    <td colspan="7" style="padding: 0; height: 2px; background: linear-gradient(to right, transparent, #8ab4f8, transparent);"></td>
                </tr>
            `;
        }
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
    const isZemin = floor.name === 'ZEMİN';
    const cursor = isZemin ? 'not-allowed' : 'pointer';
    const opacity = isZemin ? '0.4' : '1';
    const title = isZemin ? 'Zemin kat silinemez' : 'Katı Sil';

    return `
        <button class="floor-delete-btn ${isZemin ? 'zemin-delete-disabled' : ''}"
                data-floor-id="${floor.id}"
                style="background: transparent;
                       border: 1px solid #e74c3c;
                       color: #e74c3c;
                       border-radius: 4px;
                       cursor: ${cursor};
                       font-size: 14px;
                       padding: 2px 6px;
                       transition: all 0.2s;
                       opacity: ${opacity};"
                title="${title}">
            🗑️
        </button>
    `;
}

/**
 * Placeholder kat önizlemesi (boş - sadece inline buton kullanılıyor)
 */
function renderPlaceholderPreview(floor) {
    return '';
}

/**
 * Tüm katlardaki duvarların toplam sınırlarını hesapla
 */
function calculateGlobalBounds() {
    const allWalls = state.walls || [];

    if (allWalls.length === 0) {
        return null;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    allWalls.forEach(wall => {
        if (wall.p1 && wall.p2) {
            minX = Math.min(minX, wall.p1.x, wall.p2.x);
            minY = Math.min(minY, wall.p1.y, wall.p2.y);
            maxX = Math.max(maxX, wall.p1.x, wall.p2.x);
            maxY = Math.max(maxY, wall.p1.y, wall.p2.y);
        }
    });

    if (!isFinite(minX)) {
        return null;
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

/**
 * Normal kat önizlemesi - proje içeriği ile (1/500 ölçek)
 * Global bounds kullanarak tüm katların aynı koordinat sisteminde gösterilmesini sağlar
 */
function renderFloorPreview(floor, globalBounds) {
    const scale = 1 / 500; // 1:500 ölçek
    const svgWidth = 80;
    const svgHeight = 40;

    // Sadece bu kata ait duvarları göster
    const walls = (state.walls || []).filter(w => !floor || w.floorId === floor.id);

    // Eğer bu katta duvar yoksa boş önizleme göster
    if (walls.length === 0) {
        return `
            <svg width="${svgWidth}" height="${svgHeight}" style="display: block; margin: 0 auto;">
                <rect x="${svgWidth * 0.05}" y="${svgHeight * 0.05}"
                      width="${svgWidth * 0.9}" height="${svgHeight * 0.9}"
                      fill="none"
                      stroke="#5f6368"
                      stroke-width="1"
                      stroke-dasharray="2,2"/>
                <text x="${svgWidth / 2}" y="${svgHeight / 2}"
                      text-anchor="middle" font-size="8" fill="#5f6368">Boş</text>
            </svg>
        `;
    }

    // Global bounds kullan veya bu katın kendi bounds'ını hesapla
    let useBounds;
    if (globalBounds) {
        useBounds = globalBounds;
    } else {
        // Fallback: Bu katın kendi bounds'ını hesapla
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        walls.forEach(wall => {
            if (wall.p1 && wall.p2) {
                minX = Math.min(minX, wall.p1.x, wall.p2.x);
                minY = Math.min(minY, wall.p1.y, wall.p2.y);
                maxX = Math.max(maxX, wall.p1.x, wall.p2.x);
                maxY = Math.max(maxY, wall.p1.y, wall.p2.y);
            }
        });
        useBounds = {
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    // %5 padding kullan - %90 alan kullanılabilir
    const paddingPercent = 0.05;
    const availableWidth = svgWidth * (1 - 2 * paddingPercent);
    const availableHeight = svgHeight * (1 - 2 * paddingPercent);

    // Ölçekleme faktörünü hesapla
    const scaleX = availableWidth / (useBounds.width * scale || 1);
    const scaleY = availableHeight / (useBounds.height * scale || 1);
    const finalScale = Math.min(scaleX, scaleY) * scale;

    // SVG çiz
    let svgContent = '';

    // Duvarları çiz - global center'a göre konumlandır
    walls.forEach(wall => {
        if (wall.p1 && wall.p2) {
            const x1 = (wall.p1.x - useBounds.centerX) * finalScale + svgWidth / 2;
            const y1 = (wall.p1.y - useBounds.centerY) * finalScale + svgHeight / 2;
            const x2 = (wall.p2.x - useBounds.centerX) * finalScale + svgWidth / 2;
            const y2 = (wall.p2.y - useBounds.centerY) * finalScale + svgHeight / 2;

            svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                                stroke="#e7e6d0" stroke-width="0.5"/>`;
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
    // Satıra tıklama - katı aktif yap veya placeholder'dan kat ekle
    const rows = detailPanel.querySelectorAll('.floor-row');
    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            // Eğer buton tıklamasıysa ignore et
            if (e.target.closest('.floor-visibility-btn') ||
                e.target.closest('.floor-delete-btn') ||
                e.target.closest('.add-floor-btn') ||
                e.target.closest('.floor-checkbox')) {
                return;
            }

            const floorId = row.dataset.floorId;
            const floor = state.floors.find(f => f.id === floorId);

            if (floor) {
                if (floor.isPlaceholder) {
                    // Placeholder satırına tıklanırsa yeni kat ekle
                    addFloorFromPlaceholder(floorId);
                } else if (floor.visible !== false) {
                    // Normal kata tıklanırsa aktif yap
                    setState({ currentFloor: floor });
                    renderDetailPanel();
                    renderMiniPanel();
                    update3DScene(); // 3D sahneyi güncelle
                }
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

        // Hover efekti (ZEMİN için değil)
        const isDisabled = btn.classList.contains('zemin-delete-disabled');
        if (!isDisabled) {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#e74c3c';
                btn.style.color = '#fff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.color = '#e74c3c';
            });
        }
    });

    // Kat ekleme butonları (sadece inline)
    const addButtons = detailPanel.querySelectorAll('.add-floor-btn-inline');
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

    // Kat yüksekliği input'ları
    const heightInputs = detailPanel.querySelectorAll('.floor-height-input');
    heightInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const floorId = input.dataset.floorId;
            const newHeight = parseFloat(input.value);

            if (!newHeight || newHeight < 100 || newHeight > 1000) {
                alert('Kat yüksekliği 100-1000 cm arasında olmalıdır.');
                renderDetailPanel();
                return;
            }

            updateFloorHeight(floorId, newHeight);
        });

        // Enter tuşuna basıldığında da değişikliği uygula
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); // Input'tan çık, change event'ini tetikle
            }
        });

        // Tıklanma event'ini durdur (satır tıklamasını engellemek için)
        input.addEventListener('click', (e) => {
            e.stopPropagation();
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

    // Checkbox event listener'ları
    const checkboxes = detailPanel.querySelectorAll('.floor-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            const floorId = checkbox.dataset.floorId;

            if (checkbox.checked) {
                selectedFloors.add(floorId);
            } else {
                selectedFloors.delete(floorId);
            }

            renderDetailPanel();
        });

        // Checkbox tıklamasının satır tıklamasını tetiklemesini engelle
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });

    // Tümünü seç checkbox
    const selectAllCheckbox = detailPanel.querySelector('#select-all-floors');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const floors = state.floors || [];
            const selectableFloors = floors.filter(f => !f.isPlaceholder);

            if (e.target.checked) {
                // Tümünü seç
                selectableFloors.forEach(floor => {
                    selectedFloors.add(floor.id);
                });
            } else {
                // Tüm seçimi kaldır
                selectedFloors.clear();
            }

            renderDetailPanel();
        });
    }

    // Toplu işlem butonları
    const bulkDeleteBtn = detailPanel.querySelector('#bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', () => {
            bulkDeleteFloors();
        });
    }

    const bulkHeightBtn = detailPanel.querySelector('#bulk-height-btn');
    if (bulkHeightBtn) {
        bulkHeightBtn.addEventListener('click', () => {
            bulkSetHeight();
        });
    }

    const clearSelectionBtn = detailPanel.querySelector('#clear-selection-btn');
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', () => {
            selectedFloors.clear();
            renderDetailPanel();
        });
    }
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
    update3DScene(); // 3D sahneyi güncelle
}

/**
 * Kat görünürlüğünü toggle eder
 */
function toggleFloorVisibility(floorId) {
    const floor = state.floors.find(f => f.id === floorId);
    if (!floor) return;

    const isCurrentlyActive = state.currentFloor?.id === floorId;
    const willBeHidden = floor.visible !== false; // Şu anda görünür, gizlenecek

    const floors = state.floors.map(f => {
        if (f.id === floorId) {
            return { ...f, visible: !f.visible };
        }
        return f;
    });

    // Aktif kat gizleniyorsa, yeni aktif kat bul
    let newCurrentFloor = state.currentFloor;
    if (isCurrentlyActive && willBeHidden) {
        // 1. Önce ZEMİN'e bak
        const zeminFloor = floors.find(f => f.name === 'ZEMİN');
        if (zeminFloor && zeminFloor.visible !== false) {
            newCurrentFloor = zeminFloor;
        } else {
            // 2. ZEMİN de gizliyse, en yakın görünür komşuyu bul
            const currentElevation = floor.bottomElevation;
            const visibleFloors = floors.filter(f =>
                !f.isPlaceholder && f.visible !== false
            );

            if (visibleFloors.length > 0) {
                // En yakın komşuyu bul (elevation farkına göre)
                let closest = visibleFloors[0];
                let minDistance = Math.abs(closest.bottomElevation - currentElevation);

                visibleFloors.forEach(f => {
                    const distance = Math.abs(f.bottomElevation - currentElevation);
                    if (distance < minDistance ||
                        (distance === minDistance && f.bottomElevation < currentElevation)) {
                        // Eşitse alttakini seç (bottomElevation küçük olan)
                        closest = f;
                        minDistance = distance;
                    }
                });

                newCurrentFloor = closest;
            }
        }
    }

    setState({ floors, currentFloor: newCurrentFloor });
    renderDetailPanel();
    renderMiniPanel();
    update3DScene(); // 3D sahneyi güncelle
}

/**
 * Kat silme onayı
 */
function confirmDeleteFloor(floorId) {
    const floor = state.floors.find(f => f.id === floorId);
    if (!floor) return;

    // ZEMİN katı silinemez
    if (floor.name === 'ZEMİN') {
        return;
    }

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
    update3DScene(); // 3D sahneyi güncelle
}

/**
 * Katları sırasına göre yeniden numaralandırır
 */
function renumberFloors(floors) {
    // Katları yüksekliğe göre sırala (ZEMİN hariç)
    const sortedFloors = [...floors]
        .filter(f => !f.isPlaceholder && f.name !== 'ZEMİN')
        .sort((a, b) => a.bottomElevation - b.bottomElevation);

    // Zemin üstü katlar (bottomElevation >= 270, ZEMİN'in üstünde)
    // İsim kontrolü YOK - sadece pozisyona göre
    const aboveGroundFloors = sortedFloors.filter(f => f.bottomElevation >= 270);

    aboveGroundFloors.forEach((floor, index) => {
        floor.name = `${index + 1}.KAT`;
    });

    // Zemin altı katlar (topElevation <= 0, ZEMİN'in altında)
    // İsim kontrolü YOK - sadece pozisyona göre
    const belowGroundFloors = sortedFloors.filter(f => f.topElevation <= 0).reverse();

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

    // Yeni eklenen katı ekle ama aktif katı değiştirme
    setState({
        floors
    });

    renderDetailPanel();
    renderMiniPanel();
    update3DScene(); // 3D sahneyi güncelle
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

/**
 * Bir katın yüksekliğini günceller ve üstteki katları kaydırır
 * @param {string} floorId - Kat ID'si
 * @param {number} newHeight - Yeni kat yüksekliği (cm)
 */
function updateFloorHeight(floorId, newHeight) {
    const floors = [...state.floors];
    const floorIndex = floors.findIndex(f => f.id === floorId);

    if (floorIndex === -1) return;

    const floor = floors[floorIndex];
    const oldHeight = floor.topElevation - floor.bottomElevation;
    const heightDifference = newHeight - oldHeight;

    // Katın yeni yüksekliğini ayarla
    floor.topElevation = floor.bottomElevation + newHeight;

    // Üstteki tüm katları kaydır (placeholder'lar dahil)
    floors.forEach(f => {
        if (f.bottomElevation >= floor.topElevation - newHeight && f.id !== floor.id) {
            f.bottomElevation += heightDifference;
            f.topElevation += heightDifference;
        }
    });

    // State'i güncelle
    setState({ floors });

    // Panelleri yeniden render et
    renderDetailPanel();
    renderMiniPanel();
    update3DScene(); // 3D sahneyi güncelle
}

/**
 * Seçili katları toplu olarak siler
 */
function bulkDeleteFloors() {
    if (selectedFloors.size === 0) return;

    const floors = state.floors || [];
    const floorsToDelete = floors.filter(f => selectedFloors.has(f.id));

    // ZEMİN katını silmeye çalışıyor muyuz?
    const hasZemin = floorsToDelete.some(f => f.name === 'ZEMİN');
    if (hasZemin) {
        alert('Zemin kat silinemez.');
        return;
    }

    const confirmed = confirm(`${selectedFloors.size} kat silinecek. Emin misiniz?`);
    if (!confirmed) return;

    const newFloors = floors.filter(f => !selectedFloors.has(f.id));

    // Kalan katları yeniden numaralandır
    renumberFloors(newFloors);

    setState({ floors: newFloors });

    // Aktif kat silinmişse, ilk görünür katı aktif yap
    if (selectedFloors.has(state.currentFloor?.id)) {
        const firstVisible = newFloors.find(f => !f.isPlaceholder && f.visible !== false);
        setState({ currentFloor: firstVisible || null });
    }

    selectedFloors.clear();
    renderDetailPanel();
    renderMiniPanel();
    update3DScene(); // 3D sahneyi güncelle
}

/**
 * Seçili katlara toplu olarak yükseklik verir
 */
function bulkSetHeight() {
    if (selectedFloors.size === 0) return;

    const heightStr = prompt('Tüm seçili katlar için yükseklik (cm):', '270');
    if (!heightStr) return;

    const newHeight = parseFloat(heightStr);
    if (!newHeight || newHeight < 100 || newHeight > 1000) {
        alert('Kat yüksekliği 100-1000 cm arasında olmalıdır.');
        return;
    }

    // Seçili katları yüksekliğe göre sırala (alttakilerden başla)
    const floors = [...state.floors];
    const selectedFloorIds = Array.from(selectedFloors);
    const selectedFloorObjects = floors
        .filter(f => selectedFloorIds.includes(f.id))
        .sort((a, b) => a.bottomElevation - b.bottomElevation);

    // Her kata yüksekliği uygula (alttakilerden başlayarak)
    selectedFloorObjects.forEach(floor => {
        updateFloorHeight(floor.id, newHeight);
    });
}

// Window'a export et (klavye kısayolları için)
if (typeof window !== 'undefined') {
    window.renderMiniPanel = renderMiniPanel;
}
