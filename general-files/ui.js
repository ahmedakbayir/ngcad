// ui.js
// Son Güncelleme: Sahanlık kotu (125-135) mantığı confirmStairChange ve ilgili listener'larda düzeltildi.
import { getMinWallLength } from './actions.js';
import { state, setState, dom, resize, MAHAL_LISTESI, WALL_HEIGHT, setMode, THEME_COLORS } from './main.js'; // THEME_COLORS eklendi
import { saveState } from './history.js';
import { isSpaceForDoor } from '../architectural-objects/door-handler.js';
import { isSpaceForWindow } from '../architectural-objects/window-handler.js';
import { recalculateStepCount, updateConnectedStairElevations } from '../architectural-objects/stairs.js';
import { worldToScreen } from '../draw/geometry.js';
import { applyStretchModification } from '../draw/geometry.js';
import { toggleCameraMode } from '../scene3d/scene3d-camera.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { updateSceneBackground } from '../scene3d/scene3d-core.js';
import { processWalls } from '../wall/wall-processor.js';
import { findAvailableSegmentAt } from '../wall/wall-item-utils.js';
import { renderIsometric } from '../scene3d/scene-isometric.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
// updateConnectedStairElevations import edildiğinden emin olun:

// ═══════════════════════════════════════════════════════════════
// DARK MODE / LIGHT MODE FONKSİYONLARI
// ═══════════════════════════════════════════════════════════════

/**
 * Tema uygular (dark/light mode)
 * @param {boolean} isDarkMode - true ise dark mode, false ise light mode
 */
function applyTheme(isDarkMode) {
    const theme = isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.add('light-mode');
        localStorage.setItem('darkMode', 'false');
    }

    // Tüm tema renklerini güncelle
    setState({
        wallBorderColor: theme.wallStroke,
        roomFillColor: theme.roomFill,
        gridOptions: {
            ...state.gridOptions,
            color: theme.grid
        },
        dimensionOptions: {
            ...state.dimensionOptions,
            color: theme.dimensionArchitecture // Varsayılan mimari
        }
    });

    // 3D sahne arkaplan rengini güncelle
    updateSceneBackground();
}

/**
 * Dark mode toggle handler
 */
function toggleDarkMode() {
    const isDarkMode = dom.darkModeToggle.checked;
    applyTheme(isDarkMode);
}

/**
 * Tema değiştir (L kısayolu için)
 */
export function toggleTheme() {
    const isDarkMode = !document.body.classList.contains('light-mode');
    dom.darkModeToggle.checked = !isDarkMode;
    applyTheme(!isDarkMode);
}

export function initializeSettings() {
    // Dark Mode ayarını localStorage'dan yükle
    const isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Varsayılan: true (dark mode)
    dom.darkModeToggle.checked = isDarkMode;
    applyTheme(isDarkMode);

    dom.borderPicker.value = state.wallBorderColor;
    dom.roomPicker.value = state.roomFillColor;
    dom.lineThicknessInput.value = state.lineThickness;
    dom.wallThicknessInput.value = state.wallThickness;
    dom.drawingAngleInput.value = state.drawingAngle;
    dom.defaultFloorHeightInput.value = state.defaultFloorHeight; // YENİ EKLENDİ
    dom.gridVisibleInput.checked = state.gridOptions.visible;
    dom.gridColorInput.value = state.gridOptions.color;
    dom.gridWeightInput.value = state.gridOptions.weight;
    dom.gridSpaceInput.value = state.gridOptions.spacing;
    dom.snapEndpointInput.checked = state.snapOptions.endpoint;
    dom.snapMidpointInput.checked = state.snapOptions.midpoint;
    dom.snapEndpointExtInput.checked = state.snapOptions.endpointExtension;
    dom.snapMidpointExtInput.checked = state.snapOptions.midpointExtension;
    dom.snapNearestOnlyInput.checked = state.snapOptions.nearestOnly;
    dom.dimensionFontSizeInput.value = state.dimensionOptions.fontSize;
    dom.dimensionColorInput.value = state.dimensionOptions.color;
    dom.dimensionDefaultViewSelect.value = state.dimensionOptions.defaultView;
    dom.dimensionShowAreaSelect.value = state.dimensionOptions.showArea;
    dom.dimensionShowOuterSelect.value = state.dimensionOptions.showOuter;
    dom.stairsShowRailingInput.checked = state.stairSettings.showRailing; // YENİ EKLENDİ
    dom.stairsStepDepthSelect.value = state.stairSettings.stepDepthRange; // YENİ EKLENDİ
}

function openTab(tabName) {
    // Tüm tab pane'leri gizle
    Object.values(dom.tabPanes).forEach(pane => pane.classList.remove('active'));

    // Tüm tab butonlarını pasif yap (hem yatay hem dikey)
    if (dom.tabButtons) {
        Object.values(dom.tabButtons).forEach(btn => btn.classList.remove('active'));
    }
    const verticalBtns = document.querySelectorAll('.tab-btn-vertical');
    verticalBtns.forEach(btn => btn.classList.remove('active'));

    // Seçilen tab'ı aktif yap
    dom.tabPanes[tabName].classList.add('active');
    if (dom.tabButtons && dom.tabButtons[tabName]) {
        dom.tabButtons[tabName].classList.add('active');
    }
    const activeVerticalBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activeVerticalBtn) {
        activeVerticalBtn.classList.add('active');
    }
}

function populateRoomNameList(filter = '') {
    dom.roomNameSelect.innerHTML = '';
    const filteredList = MAHAL_LISTESI.filter(name => name.toUpperCase().includes(filter.toUpperCase()));

    filteredList.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (state.roomToEdit && name === state.roomToEdit.name) {
            option.selected = true;
        }
        dom.roomNameSelect.appendChild(option);
    });

    if (filteredList.length > 0) {
        dom.roomNameSelect.selectedIndex = 0; // İlk elemanı seçili yap
    } else {
        // Eğer filtre sonucu boşsa, input'taki değeri yeni seçenek olarak ekle (opsiyonel)
        if (filter.trim() !== '' && !MAHAL_LISTESI.includes(filter.trim().toUpperCase())) {
            const option = document.createElement('option');
            option.value = filter.trim();
            option.textContent = filter.trim();
            option.selected = true;
            dom.roomNameSelect.appendChild(option);
        }
    }
}


function filterRoomNameList() {
    populateRoomNameList(dom.roomNameInput.value);
}

export function showRoomNamePopup(room, e, initialKey = '') {
    setState({ roomToEdit: room });
    dom.roomNameInput.value = initialKey; // Initial key veya boş
    populateRoomNameList(initialKey); // Listeyi doldur (varsa filtre ile)

    // Popup'ı konumlandır
    const popupWidth = dom.roomNamePopup.offsetWidth || 200; // Genişliği al veya varsay
    const popupHeight = dom.roomNamePopup.offsetHeight || 250; // Yüksekliği al veya varsay
    let left = e.clientX + 5;
    let top = e.clientY + 5;

    // Ekran sınırlarını kontrol et
    if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 10;
    }
    if (top + popupHeight > window.innerHeight) {
        top = window.innerHeight - popupHeight - 10;
    }
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    dom.roomNamePopup.style.left = `${left}px`;
    dom.roomNamePopup.style.top = `${top}px`;
    dom.roomNamePopup.style.display = 'block';

    // Use setTimeout to ensure focus works correctly
    setTimeout(() => {
        dom.roomNameInput.focus();
    }, 0);

    // Dışarı tıklama dinleyicisini ayarla
    const clickListener = (event) => {
        // Tıklanan element popup'ın içinde değilse kapat
        if (!dom.roomNamePopup.contains(event.target)) {
            hideRoomNamePopup();
        }
    };
    setState({ clickOutsideRoomPopupListener: clickListener });
    // setTimeout önemli, yoksa popup'ı açan tıklama hemen kapatabilir
    setTimeout(() => window.addEventListener('pointerdown', clickListener, { capture: true, once: true }), 0);
}

// hideRoomNamePopup fonksiyonu
export function hideRoomNamePopup() {
    dom.roomNamePopup.style.display = 'none';
    if (state.clickOutsideRoomPopupListener) {
        window.removeEventListener('pointerdown', state.clickOutsideRoomPopupListener, { capture: true });
        setState({ clickOutsideRoomPopupListener: null, roomToEdit: null });
    }
    dom.c2d.focus();
}

function confirmRoomNameChange() {
    if (state.roomToEdit && dom.roomNameSelect.value) {
        state.roomToEdit.name = dom.roomNameSelect.value;
        saveState(); // İsim değişince kaydet
    }
    hideRoomNamePopup();
}

export function toggle3DView() {
    dom.mainContainer.classList.toggle('show-3d');

    if (dom.mainContainer.classList.contains('show-3d')) {
        setMode("select"); // 3D açılırken modu "select" yap

        // Split ratio butonlarını göster
        const splitButtons = document.getElementById('split-ratio-buttons');
        if (splitButtons) splitButtons.style.display = 'flex';

        // FPS kamera kontrollerini göster
        const fpsControls = document.getElementById('fps-camera-controls');
        if (fpsControls) fpsControls.style.display = 'flex';

        // Varsayılan split ratio'yu ayarla (25%)
        setSplitRatio(25);
    } else {
        // Split ratio butonlarını gizle
        const splitButtons = document.getElementById('split-ratio-buttons');
        if (splitButtons) splitButtons.style.display = 'none';

        // FPS kamera kontrollerini gizle
        const fpsControls = document.getElementById('fps-camera-controls');
        if (fpsControls) fpsControls.style.display = 'none';
    }

    setTimeout(() => {
        resize();
        if (dom.mainContainer.classList.contains('show-3d')) {
            update3DScene();
        }
    }, 10);
}

export function toggleIsoView() {
    dom.mainContainer.classList.toggle('show-iso');

    if (dom.mainContainer.classList.contains('show-iso')) {
        setMode("select"); // İzometri açılırken modu "select" yap

        // İzometri ratio butonlarını göster
        const isoButtons = document.getElementById('iso-ratio-buttons');
        if (isoButtons) isoButtons.style.display = 'flex';

        // İzometrik canvas boyutunu ayarla
        resizeIsoCanvas();

        // İzometrik görünümü çiz
        drawIsoView();

        // Varsayılan split ratio'yu ayarla (25%)
        setIsoRatio(25);
    } else {
        // İzometri ratio butonlarını gizle
        const isoButtons = document.getElementById('iso-ratio-buttons');
        if (isoButtons) isoButtons.style.display = 'none';
    }

    setTimeout(() => {
        resize();
        if (dom.mainContainer.classList.contains('show-iso')) {
            resizeIsoCanvas();
            drawIsoView();
        }
    }, 10);
}

export function toggle3DPerspective() {
    setState({ is3DPerspectiveActive: !state.is3DPerspectiveActive });

    // Buton görünümünü güncelle
    if (state.is3DPerspectiveActive) {
        dom.b3DPerspective.classList.add('active');
        dom.b3DPerspective.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"></path>
              <rect x="9" y="9" width="6" height="6" fill="none"></rect>
              <path d="M9 9L3 3M15 9L21 3M9 15L3 21M15 15L21 21"></path>
            </svg>
            2D Görünüm
        `;
    } else {
        dom.b3DPerspective.classList.remove('active');
        dom.b3DPerspective.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"></path>
              <rect x="9" y="9" width="6" height="6" fill="none"></rect>
              <path d="M9 9L3 3M15 9L21 3M9 15L3 21M15 15L21 21"></path>
            </svg>
            3D Görünüm
        `;
    }
}

// İzometri ekran bölme oranını ayarla
export function setIsoRatio(ratio) {
    const p2dPanel = document.getElementById('p2d');
    const pIsoPanel = document.getElementById('pIso');

    // Buton aktif durumlarını güncelle
    document.querySelectorAll('#iso-ratio-buttons .split-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`iso-${ratio}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Ratio 0 ise izometri panelini kapat
    if (ratio === 0) {
        // Önce 2D panelini tam ekran yap
        p2dPanel.style.flex = '1 1 100%';
        pIsoPanel.style.flex = '0 0 0';

        // Sonra izometriyi kapat
        if (dom.mainContainer.classList.contains('show-iso')) {
            toggleIsoView(); // İzometriyi kapat
        }

        // resize'ı çağır
        setTimeout(() => {
            resize();
        }, 10);
        return;
    }

    // İzometri açık değilse, önce aç sonra ratio'yu tekrar ayarla
    if (!dom.mainContainer.classList.contains('show-iso')) {
        // İzometri ratio butonlarını ve izometriyi göster
        dom.mainContainer.classList.add('show-iso');
        dom.bIso.classList.add('active');
        setMode("select");

        const isoButtons = document.getElementById('iso-ratio-buttons');
        if (isoButtons) isoButtons.style.display = 'flex';

        // Ratio'yu tekrar ayarla (recursive call ile)
        setTimeout(() => {
            setIsoRatio(ratio);
        }, 50);
        return;
    }

    // Ratio'ya göre flex ayarla
    if (ratio === 100) {
        p2dPanel.style.flex = '0 0 0';
        pIsoPanel.style.flex = '1 1 100%';
    } else if (ratio === 75) {
        p2dPanel.style.flex = '1 1 25%';
        pIsoPanel.style.flex = '1 1 75%';
    } else if (ratio === 50) {
        p2dPanel.style.flex = '1 1 50%';
        pIsoPanel.style.flex = '1 1 50%';
    } else if (ratio === 25) {
        p2dPanel.style.flex = '1 1 75%';
        pIsoPanel.style.flex = '1 1 25%';
    }

    setTimeout(() => {
        resize();
        if (dom.mainContainer.classList.contains('show-iso')) {
            resizeIsoCanvas();
            drawIsoView();
        }
    }, 10);
}

function resizeIsoCanvas() {
    const rIso = dom.pIso.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Canvas boyutunu ayarla
    dom.cIso.width = rIso.width * dpr;
    dom.cIso.height = rIso.height * dpr;
    dom.cIso.style.width = rIso.width + 'px';
    dom.cIso.style.height = rIso.height + 'px';

    // Smoothing'i kapat (keskin çizgiler için)
    dom.ctxIso.imageSmoothingEnabled = false;
    dom.ctxIso.webkitImageSmoothingEnabled = false;
    dom.ctxIso.mozImageSmoothingEnabled = false;
    dom.ctxIso.msImageSmoothingEnabled = false;
}

export function drawIsoView() {
    if (!dom.mainContainer.classList.contains('show-iso')) return;

    const ctx = dom.ctxIso;
    const canvas = dom.cIso;

    // İzometrik görünümü render et (state'ten zoom ve offset kullan)
    renderIsometric(ctx, canvas.width, canvas.height, state.isoZoom, state.isoPanOffset);
}

/**
 * İzometrik görünüm için mouse event listener'larını kurar
 */
export function setupIsometricControls() {
    if (!dom.cIso) return;

    // Mouse wheel ile zoom
    dom.cIso.addEventListener('wheel', (e) => {
        if (!dom.mainContainer.classList.contains('show-iso')) return;

        e.preventDefault();

        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(5, state.isoZoom * zoomDelta));

        setState({ isoZoom: newZoom });
        drawIsoView();
    }, { passive: false });

    // Mouse down - sürükleme veya pan başlat
    dom.cIso.addEventListener('mousedown', (e) => {
        if (!dom.mainContainer.classList.contains('show-iso')) return;

        const rect = dom.cIso.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Sol tuş: Boru ucu sürükleme dene
        if (e.button === 0) {
            const endpoint = findPipeEndpointAtMouse(mouseX, mouseY);
            if (endpoint) {
                e.preventDefault();

                // Constraint'i hesapla ve sabitle (sürükleme boyunca değişmemeli)
                const toIso = window._toIsometric || ((x, y) => ({ isoX: x, isoY: y }));
                const hierarchy = window._isoPipeHierarchy;

                let constraintPipe = endpoint.pipe; // Varsayılan: kendi doğrultusunda
                let isDraggedEndpointConnectedToParent = false;

                // Parent pipe'ı bul ve sürüklenen endpoint'in parent'a bağlı olup olmadığını kontrol et
                const draggedPipeData = hierarchy ? hierarchy.get(endpoint.pipe.id) : null;
                if (draggedPipeData && draggedPipeData.parent && plumbingManager) {
                    const parentPipe = plumbingManager.pipes.find(p => {
                        const pData = hierarchy.get(p.id);
                        return pData && pData.label === draggedPipeData.parent;
                    });

                    if (parentPipe) {
                        // Parent bulundu, ama sürüklenen endpoint parent'a bağlı mı?
                        const draggedPos = toIso(
                            endpoint.type === 'start' ? endpoint.pipe.p1.x : endpoint.pipe.p2.x,
                            endpoint.type === 'start' ? endpoint.pipe.p1.y : endpoint.pipe.p2.y,
                            endpoint.type === 'start' ? (endpoint.pipe.p1.z || 0) : (endpoint.pipe.p2.z || 0)
                        );
                        // Önceki offset'i ekle
                        const prevDraggedOffset = state.isoPipeOffsets[endpoint.pipe.id] || {};
                        draggedPos.isoX += (prevDraggedOffset[endpoint.type + 'Dx'] || 0);
                        draggedPos.isoY += (prevDraggedOffset[endpoint.type + 'Dy'] || 0);

                        // Parent'ın endpoint'lerine yakınlık kontrolü
                        const parentStart = toIso(parentPipe.p1.x, parentPipe.p1.y, parentPipe.p1.z || 0);
                        const parentEnd = toIso(parentPipe.p2.x, parentPipe.p2.y, parentPipe.p2.z || 0);
                        const prevParentOffset = state.isoPipeOffsets[parentPipe.id] || {};
                        parentStart.isoX += (prevParentOffset.startDx || 0);
                        parentStart.isoY += (prevParentOffset.startDy || 0);
                        parentEnd.isoX += (prevParentOffset.endDx || 0);
                        parentEnd.isoY += (prevParentOffset.endDy || 0);

                        const distToParentStart = Math.hypot(draggedPos.isoX - parentStart.isoX, draggedPos.isoY - parentStart.isoY);
                        const distToParentEnd = Math.hypot(draggedPos.isoX - parentEnd.isoX, draggedPos.isoY - parentEnd.isoY);
                        const connectionThreshold = 25; // Hızlı hareket için yeterli

                        // 3D mesafe kontrolü (düşey borular için)
                        const draggedX = endpoint.type === 'start' ? endpoint.pipe.p1.x : endpoint.pipe.p2.x;
                        const draggedY = endpoint.type === 'start' ? endpoint.pipe.p1.y : endpoint.pipe.p2.y;
                        const draggedZ = endpoint.type === 'start' ? (endpoint.pipe.p1.z || 0) : (endpoint.pipe.p2.z || 0);
                        const dist3DToStart = Math.hypot(draggedX - parentPipe.p1.x, draggedY - parentPipe.p1.y, draggedZ - (parentPipe.p1.z || 0));
                        const dist3DToEnd = Math.hypot(draggedX - parentPipe.p2.x, draggedY - parentPipe.p2.y, draggedZ - (parentPipe.p2.z || 0));

                        // Eğer sürüklenen endpoint parent'a bağlıysa, parent doğrultusunu kullan
                        if (distToParentStart < connectionThreshold || distToParentEnd < connectionThreshold ||
                            dist3DToStart < 5 || dist3DToEnd < 5) {
                            constraintPipe = parentPipe;
                            isDraggedEndpointConnectedToParent = true;
                        }
                    }
                }

                setState({
                    isoDragging: true,
                    isoDraggedPipe: endpoint.pipe,
                    isoDraggedEndpoint: endpoint.type,
                    isoPanStart: { x: e.clientX, y: e.clientY },
                    // Constraint'i sabitle
                    isoConstraintPipe: constraintPipe,
                    isoConstraintConnectedToParent: isDraggedEndpointConnectedToParent
                });
                return;
            }
        }

        // Orta veya sağ tuş: Pan başlat
        if (e.button === 1 || e.button === 2) {
            e.preventDefault();
            setState({
                isoPanning: true,
                isoPanStart: { x: e.clientX, y: e.clientY }
            });
        }
    });

    // Mouse move - sürükleme veya pan
    dom.cIso.addEventListener('mousemove', (e) => {
        // Boru ucu sürükleme
        if (state.isoDragging && state.isoDraggedPipe) {
            const dx = e.clientX - state.isoPanStart.x;
            const dy = e.clientY - state.isoPanStart.y;

            const draggedPipe = state.isoDraggedPipe;
            const draggedEndpoint = state.isoDraggedEndpoint; // 'start' veya 'end'

            console.log(`\n🎯 SÜRÜKLEME:
  Pipe: ${draggedPipe.id}
  Endpoint: ${draggedEndpoint}
  p1: (${draggedPipe.p1.x.toFixed(1)}, ${draggedPipe.p1.y.toFixed(1)}, ${(draggedPipe.p1.z || 0).toFixed(1)})
  p2: (${draggedPipe.p2.x.toFixed(1)}, ${draggedPipe.p2.y.toFixed(1)}, ${(draggedPipe.p2.z || 0).toFixed(1)})
  Sürüklenen nokta: ${draggedEndpoint === 'start' ? 'p1' : 'p2'}`);

            // toIsometric fonksiyonunu al
            const toIso = window._toIsometric || ((x, y) => ({ isoX: x, isoY: y }));
            const hierarchy = window._isoPipeHierarchy;

            // Mouse hareketini zoom'a göre ayarla
            const mouseDx = dx / state.isoZoom;
            const mouseDy = dy / state.isoZoom;

            // Kaydedilen constraint'i kullan (sürükleme boyunca sabit)
            const constraintPipe = state.isoConstraintPipe || draggedPipe;
            const isDraggedEndpointConnectedToParent = state.isoConstraintConnectedToParent || false;

            // draggedPipeData'yı da tanımla (child pipe taşıma için gerekli)
            const draggedPipeData = hierarchy ? hierarchy.get(draggedPipe.id) : null;
            console.log(`  Hierarchy: parent=${draggedPipeData?.parent || 'none'}, children=[${draggedPipeData?.children?.join(', ') || 'none'}]`);

            if (draggedPipeData && draggedPipeData.parent && plumbingManager) {
                const parentPipe = plumbingManager.pipes.find(p => {
                    const pData = hierarchy.get(p.id);
                    return pData && pData.label === draggedPipeData.parent;
                });

                if (parentPipe) {
                    // Parent bulundu, ama sürüklenen endpoint parent'a bağlı mı?
                    const draggedPos = toIso(
                        draggedEndpoint === 'start' ? draggedPipe.p1.x : draggedPipe.p2.x,
                        draggedEndpoint === 'start' ? draggedPipe.p1.y : draggedPipe.p2.y,
                        draggedEndpoint === 'start' ? (draggedPipe.p1.z || 0) : (draggedPipe.p2.z || 0)
                    );
                    // Önceki offset'i ekle
                    const prevDraggedOffset = state.isoPipeOffsets[draggedPipe.id] || {};
                    draggedPos.isoX += (prevDraggedOffset[draggedEndpoint + 'Dx'] || 0);
                    draggedPos.isoY += (prevDraggedOffset[draggedEndpoint + 'Dy'] || 0);

                    // Parent'ın endpoint'lerine yakınlık kontrolü
                    const parentStart = toIso(parentPipe.p1.x, parentPipe.p1.y, parentPipe.p1.z || 0);
                    const parentEnd = toIso(parentPipe.p2.x, parentPipe.p2.y, parentPipe.p2.z || 0);
                    const prevParentOffset = state.isoPipeOffsets[parentPipe.id] || {};
                    parentStart.isoX += (prevParentOffset.startDx || 0);
                    parentStart.isoY += (prevParentOffset.startDy || 0);
                    parentEnd.isoX += (prevParentOffset.endDx || 0);
                    parentEnd.isoY += (prevParentOffset.endDy || 0);

                    const distToParentStart = Math.hypot(draggedPos.isoX - parentStart.isoX, draggedPos.isoY - parentStart.isoY);
                    const distToParentEnd = Math.hypot(draggedPos.isoX - parentEnd.isoX, draggedPos.isoY - parentEnd.isoY);
                    const connectionThreshold = 25; // Hızlı hareket için yeterli

                    // 3D mesafe kontrolü (düşey borular için)
                    const draggedX = draggedEndpoint === 'start' ? draggedPipe.p1.x : draggedPipe.p2.x;
                    const draggedY = draggedEndpoint === 'start' ? draggedPipe.p1.y : draggedPipe.p2.y;
                    const draggedZ = draggedEndpoint === 'start' ? (draggedPipe.p1.z || 0) : (draggedPipe.p2.z || 0);
                    const dist3DToStart = Math.hypot(draggedX - parentPipe.p1.x, draggedY - parentPipe.p1.y, draggedZ - (parentPipe.p1.z || 0));
                    const dist3DToEnd = Math.hypot(draggedX - parentPipe.p2.x, draggedY - parentPipe.p2.y, draggedZ - (parentPipe.p2.z || 0));

                    // Eğer sürüklenen endpoint parent'a bağlıysa, parent doğrultusunu kullan
                    // İzometrik VEYA 3D mesafe kontrolü (3D eşiği gevşettik: < 5)
                    if (distToParentStart < connectionThreshold || distToParentEnd < connectionThreshold ||
                        dist3DToStart < 5 || dist3DToEnd < 5) {
                        constraintPipe = parentPipe;
                        isDraggedEndpointConnectedToParent = true;
                    }
                    // Değilse kendi doğrultusunda hareket eder
                }
            }

            // Constraint pipe'ın doğrultusunu hesapla (ÖNCEKİ OFFSET'LERİ EKLE!)
            const constraintStart = toIso(constraintPipe.p1.x, constraintPipe.p1.y, constraintPipe.p1.z || 0);
            const constraintEnd = toIso(constraintPipe.p2.x, constraintPipe.p2.y, constraintPipe.p2.z || 0);

            // Önceki offset'leri constraint pipe'a ekle
            const prevConstraintOffset = state.isoPipeOffsets[constraintPipe.id] || {};
            constraintStart.isoX += (prevConstraintOffset.startDx || 0);
            constraintStart.isoY += (prevConstraintOffset.startDy || 0);
            constraintEnd.isoX += (prevConstraintOffset.endDx || 0);
            constraintEnd.isoY += (prevConstraintOffset.endDy || 0);

            const dirX = constraintEnd.isoX - constraintStart.isoX;
            const dirY = constraintEnd.isoY - constraintStart.isoY;
            const length = Math.sqrt(dirX * dirX + dirY * dirY);

            if (length < 0.001) return; // Çok kısa pipe, skip

            // Normalize edilmiş yön vektörü (TEK BOYUT!)
            const normDirX = dirX / length;
            const normDirY = dirY / length;

            // Mouse hareketini constraint doğrultusuna PROJECT ET (TEK BOYUT!)
            const projection = mouseDx * normDirX + mouseDy * normDirY;
            const offsetX = projection * normDirX;
            const offsetY = projection * normDirY;

            // Yeni offset state'i oluştur
            const newOffsets = { ...state.isoPipeOffsets };
            const visited = new Set();
            const threshold = 25; // Yakınlık eşiği (pixel) - hızlı hareket için yeterli

            // Helper: Bir endpoint'i hareket ettir (MİNİMUM UZUNLUK KONTROLÜ ile)
            // Return: true = hareket edildi, false = engellendi
            const moveEndpoint = (targetPipe, endpoint, moveOffsetX, moveOffsetY) => {
                if (!newOffsets[targetPipe.id]) newOffsets[targetPipe.id] = {};
                const prevOffset = newOffsets[targetPipe.id];

                // Yeni offset'leri geçici olarak hesapla
                const testOffsets = { ...prevOffset };
                testOffsets[endpoint + 'Dx'] = (prevOffset[endpoint + 'Dx'] || 0) + moveOffsetX;
                testOffsets[endpoint + 'Dy'] = (prevOffset[endpoint + 'Dy'] || 0) + moveOffsetY;

                // Pipe'ın yeni uzunluğunu hesapla
                const startPos = toIso(targetPipe.p1.x, targetPipe.p1.y, targetPipe.p1.z || 0);
                const endPos = toIso(targetPipe.p2.x, targetPipe.p2.y, targetPipe.p2.z || 0);
                startPos.isoX += (testOffsets.startDx || 0);
                startPos.isoY += (testOffsets.startDy || 0);
                endPos.isoX += (testOffsets.endDx || 0);
                endPos.isoY += (testOffsets.endDy || 0);

                const newLength = Math.hypot(endPos.isoX - startPos.isoX, endPos.isoY - startPos.isoY);

                // Orijinal uzunluğu hesapla
                const origStart = toIso(targetPipe.p1.x, targetPipe.p1.y, targetPipe.p1.z || 0);
                const origEnd = toIso(targetPipe.p2.x, targetPipe.p2.y, targetPipe.p2.z || 0);
                const origLength = Math.hypot(origEnd.isoX - origStart.isoX, origEnd.isoY - origStart.isoY);

                // Minimum uzunluk kontrolü: %10'un altına düşmesin
                const minLength = origLength * 0.1;

                // YÖN KONTROLÜ (Flip Prevention):
                // Yeni vektörün (sabit noktadan yeni uca), orijinal vektörle aynı yönde olması gerekir.
                const origDx = origEnd.isoX - origStart.isoX;
                const origDy = origEnd.isoY - origStart.isoY;

                // Sabit nokta hangisi? (Hareket etmeyen uç)
                // Eğer 'end' hareket ediyorsa sabit 'start'tır.
                let vecOrigX, vecOrigY, vecNewX, vecNewY;

                if (endpoint === 'end') {
                    // Sabit: Start
                    vecOrigX = origEnd.isoX - origStart.isoX;
                    vecOrigY = origEnd.isoY - origStart.isoY;
                    vecNewX = endPos.isoX - startPos.isoX; // startPos (sabit) - endPos (yeni)
                    vecNewY = endPos.isoY - startPos.isoY;
                } else {
                    // Sabit: End
                    vecOrigX = origStart.isoX - origEnd.isoX;
                    vecOrigY = origStart.isoY - origEnd.isoY;
                    vecNewX = startPos.isoX - endPos.isoX; // endPos (sabit) - startPos (yeni)
                    vecNewY = startPos.isoY - endPos.isoY;
                }

                // Dot product (İç çarpım) > 0 ise yön aynıdır
                const dotProduct = vecOrigX * vecNewX + vecOrigY * vecNewY;

                if (newLength >= minLength && dotProduct > 0) {
                    // Uzunluk OK ve Yön OK, hareketi uygula
                    newOffsets[targetPipe.id][endpoint + 'Dx'] = testOffsets[endpoint + 'Dx'];
                    newOffsets[targetPipe.id][endpoint + 'Dy'] = testOffsets[endpoint + 'Dy'];
                    return true; // Hareket başarılı
                }
                // Eğer minimum'un altına düşecekse veya yön tersine dönecekse hareketi UYGULAMA
                return false; // Hareket engellendi`
            };

            // Helper: Bir pipe'ı tamamen translate et (her iki uç)
            const translatePipe = (targetPipe, moveOffsetX, moveOffsetY) => {
                if (!newOffsets[targetPipe.id]) newOffsets[targetPipe.id] = {};
                const prevOffset = newOffsets[targetPipe.id];

                newOffsets[targetPipe.id].startDx = (prevOffset.startDx || 0) + moveOffsetX;
                newOffsets[targetPipe.id].startDy = (prevOffset.startDy || 0) + moveOffsetY;
                newOffsets[targetPipe.id].endDx = (prevOffset.endDx || 0) + moveOffsetX;
                newOffsets[targetPipe.id].endDy = (prevOffset.endDy || 0) + moveOffsetY;
            };

            // Recursive: Bir pipe ve tüm child'larını (torunlar dahil) translate et
            const translatePipeAndAllChildren = (targetPipe, moveOffsetX, moveOffsetY) => {
                if (visited.has(targetPipe.id)) return;
                visited.add(targetPipe.id);

                // Bu pipe'ı translate et
                translatePipe(targetPipe, moveOffsetX, moveOffsetY);

                // Tüm child'ları da translate et (recursive)
                if (!hierarchy) return;
                const pipeData = hierarchy.get(targetPipe.id);
                if (!pipeData || !pipeData.children || pipeData.children.length === 0) return;

                pipeData.children.forEach(childLabel => {
                    const childPipe = plumbingManager.pipes.find(p => {
                        const pData = hierarchy.get(p.id);
                        return pData && pData.label === childLabel;
                    });

                    if (childPipe) {
                        translatePipeAndAllChildren(childPipe, moveOffsetX, moveOffsetY);
                    }
                });
            };

            // ============ ANA MANTIK ============
            // 1. Sürüklenen pipe'ın endpoint'ini hareket ettir
            const draggedEndpointMoved = moveEndpoint(draggedPipe, draggedEndpoint, offsetX, offsetY);

            // Eğer ana endpoint hareket etmediyse (min uzunluk kontrolü), tüm işlemi iptal et
            if (!draggedEndpointMoved) {
                return; // Hiçbir şey hareket etmez
            }

            // 2. Parent pipe'ın bağlı ucunu hareket ettir
            if (constraintPipe !== draggedPipe) {
                // Constraint parent ise, parent'ın bağlantı noktasını bul
                // Sürüklenen endpoint parent'a bağlı olabilir VEYA diğer endpoint parent'a bağlı olabilir

                // Önce sürüklenen endpoint parent'a bağlı mı?
                let parentConnectionEndpoint = null;

                if (isDraggedEndpointConnectedToParent) {
                    // Sürüklenen endpoint parent'a bağlı
                    parentConnectionEndpoint = draggedEndpoint;
                } else {
                    // Diğer endpoint parent'a bağlı mı kontrol et (dikey boru senaryosu)
                    const otherEndpoint = draggedEndpoint === 'start' ? 'end' : 'start';
                    const otherEndpointPos = otherEndpoint === 'start' ? draggedPipe.p1 : draggedPipe.p2;

                    // Parent'ın endpoint'lerine yakınlık kontrolü
                    const otherPos = toIso(otherEndpointPos.x, otherEndpointPos.y, otherEndpointPos.z || 0);
                    const prevOtherOffset = state.isoPipeOffsets[draggedPipe.id] || {};
                    otherPos.isoX += (prevOtherOffset[otherEndpoint + 'Dx'] || 0);
                    otherPos.isoY += (prevOtherOffset[otherEndpoint + 'Dy'] || 0);

                    const parentStart = toIso(constraintPipe.p1.x, constraintPipe.p1.y, constraintPipe.p1.z || 0);
                    const parentEnd = toIso(constraintPipe.p2.x, constraintPipe.p2.y, constraintPipe.p2.z || 0);
                    const prevParentOffset = state.isoPipeOffsets[constraintPipe.id] || {};
                    parentStart.isoX += (prevParentOffset.startDx || 0);
                    parentStart.isoY += (prevParentOffset.startDy || 0);
                    parentEnd.isoX += (prevParentOffset.endDx || 0);
                    parentEnd.isoY += (prevParentOffset.endDy || 0);

                    const distToParentStart = Math.hypot(otherPos.isoX - parentStart.isoX, otherPos.isoY - parentStart.isoY);
                    const distToParentEnd = Math.hypot(otherPos.isoX - parentEnd.isoX, otherPos.isoY - parentEnd.isoY);
                    const connectionThreshold = 25;

                    // 3D mesafe kontrolü de ekle
                    const dist3DToStart = Math.hypot(
                        otherEndpointPos.x - constraintPipe.p1.x,
                        otherEndpointPos.y - constraintPipe.p1.y,
                        (otherEndpointPos.z || 0) - (constraintPipe.p1.z || 0)
                    );
                    const dist3DToEnd = Math.hypot(
                        otherEndpointPos.x - constraintPipe.p2.x,
                        otherEndpointPos.y - constraintPipe.p2.y,
                        (otherEndpointPos.z || 0) - (constraintPipe.p2.z || 0)
                    );

                    if (distToParentStart < connectionThreshold || distToParentEnd < connectionThreshold ||
                        dist3DToStart < 5 || dist3DToEnd < 5) {
                        parentConnectionEndpoint = otherEndpoint;
                    }
                }

                // Parent'a bağlı bir endpoint varsa, parent'ın ucunu hareket ettir
                if (parentConnectionEndpoint) {
                    const connectionPos = toIso(
                        parentConnectionEndpoint === 'start' ? draggedPipe.p1.x : draggedPipe.p2.x,
                        parentConnectionEndpoint === 'start' ? draggedPipe.p1.y : draggedPipe.p2.y,
                        parentConnectionEndpoint === 'start' ? (draggedPipe.p1.z || 0) : (draggedPipe.p2.z || 0)
                    );
                    // Önceki offset'i ekle (yeni hareketle birlikte)
                    const prevConnectionOffset = newOffsets[draggedPipe.id] || {};
                    connectionPos.isoX += (prevConnectionOffset[parentConnectionEndpoint + 'Dx'] || 0);
                    connectionPos.isoY += (prevConnectionOffset[parentConnectionEndpoint + 'Dy'] || 0);

                    // Parent'ın hangi ucu bağlantı noktasına yakın?
                    const parentStart = toIso(constraintPipe.p1.x, constraintPipe.p1.y, constraintPipe.p1.z || 0);
                    const parentEnd = toIso(constraintPipe.p2.x, constraintPipe.p2.y, constraintPipe.p2.z || 0);

                    // Parent'ın GÜNCELLENMİŞ offset'lerini ekle (newOffsets'ten oku!)
                    const prevParentOffset = newOffsets[constraintPipe.id] || state.isoPipeOffsets[constraintPipe.id] || {};
                    parentStart.isoX += (prevParentOffset.startDx || 0);
                    parentStart.isoY += (prevParentOffset.startDy || 0);
                    parentEnd.isoX += (prevParentOffset.endDx || 0);
                    parentEnd.isoY += (prevParentOffset.endDy || 0);

                    const distToStart = Math.hypot(connectionPos.isoX - parentStart.isoX, connectionPos.isoY - parentStart.isoY);
                    const distToEnd = Math.hypot(connectionPos.isoX - parentEnd.isoX, connectionPos.isoY - parentEnd.isoY);

                    // Parent'ın yakın ucunu hareket ettir, DİĞER UÇ SABİT KALIR!
                    if (distToStart < distToEnd) {
                        moveEndpoint(constraintPipe, 'start', offsetX, offsetY);
                    } else {
                        moveEndpoint(constraintPipe, 'end', offsetX, offsetY);
                    }

                    // Dikey borunun parent'a bağlı ucunu da hareket ettir (kopmasın!)
                    // Sadece DİĞER ucu sürükleniyorsa (dikey boru senaryosu)
                    if (parentConnectionEndpoint !== draggedEndpoint) {
                        moveEndpoint(draggedPipe, parentConnectionEndpoint, offsetX, offsetY);
                    }
                }
            }

            // 3. Sürüklenen endpoint'e bağlı TÜM CHILD'LARI translate et (torunlar dahil)
            if (hierarchy && draggedPipeData && draggedPipeData.children && draggedPipeData.children.length > 0) {
                // Her child'ı kontrol et
                draggedPipeData.children.forEach(childLabel => {
                    const childPipe = plumbingManager.pipes.find(p => {
                        const pData = hierarchy.get(p.id);
                        return pData && pData.label === childLabel;
                    });

                    if (!childPipe) return;

                    // Sürüklenen endpoint'in 3D koordinatları
                    const draggedX = draggedEndpoint === 'start' ? draggedPipe.p1.x : draggedPipe.p2.x;
                    const draggedY = draggedEndpoint === 'start' ? draggedPipe.p1.y : draggedPipe.p2.y;
                    const draggedZ = draggedEndpoint === 'start' ? (draggedPipe.p1.z || 0) : (draggedPipe.p2.z || 0);

                    // Child'ın her iki ucunu da kontrol et (baslangicBaglanti her zaman p1 olmalı ama emin olmak için)
                    const distToStart3D = Math.hypot(
                        childPipe.p1.x - draggedX,
                        childPipe.p1.y - draggedY,
                        (childPipe.p1.z || 0) - draggedZ
                    );

                    const distToEnd3D = Math.hypot(
                        childPipe.p2.x - draggedX,
                        childPipe.p2.y - draggedY,
                        (childPipe.p2.z || 0) - draggedZ
                    );

                    const minDist = Math.min(distToStart3D, distToEnd3D);
                    const threshold3D = 25; // 25 cm tolerance (Dikey hatların yakalanması için artırıldı)

                    // Eğer child'ın herhangi bir ucu sürüklenen uca yakınsa, tüm child'ı taşı
                    if (minDist < threshold3D) {
                        translatePipeAndAllChildren(childPipe, offsetX, offsetY);
                    }
                });
            }

            setState({
                isoPipeOffsets: newOffsets,
                isoPanStart: { x: e.clientX, y: e.clientY }
            });

            drawIsoView();
            return;
        }

        // Pan
        if (state.isoPanning) {
            const dx = e.clientX - state.isoPanStart.x;
            const dy = e.clientY - state.isoPanStart.y;

            setState({
                isoPanOffset: {
                    x: state.isoPanOffset.x + dx,
                    y: state.isoPanOffset.y + dy
                },
                isoPanStart: { x: e.clientX, y: e.clientY }
            });

            drawIsoView();
        }
    });

    // Mouse up - sürükleme ve pan bitir
    const stopInteraction = () => {
        if (state.isoPanning) {
            setState({ isoPanning: false });
        }
        if (state.isoDragging) {
            setState({
                isoDragging: false,
                isoDraggedPipe: null,
                isoDraggedEndpoint: null,
                // Constraint verilerini temizle
                isoConstraintPipe: null,
                isoConstraintConnectedToParent: false
            });
        }
    };

    dom.cIso.addEventListener('mouseup', stopInteraction);
    dom.cIso.addEventListener('mouseleave', stopInteraction);

    // Sağ tık menüsünü engelle
    dom.cIso.addEventListener('contextmenu', (e) => {
        if (dom.mainContainer.classList.contains('show-iso')) {
            e.preventDefault();
        }
    });
}

// 3D sahneyi %100 genişlet / daralt
export function toggle3DFullscreen() {
    dom.mainContainer.classList.toggle('fullscreen-3d');

    setTimeout(() => {
        resize();
        update3DScene();
    }, 10);
}

// Ekran bölme oranını ayarla
export function setSplitRatio(ratio) {
    const p2dPanel = document.getElementById('p2d');
    const p3dPanel = document.getElementById('p3d');

    // Buton aktif durumlarını güncelle
    document.querySelectorAll('.split-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`split - ${ ratio } `);
    if (activeBtn) activeBtn.classList.add('active');

    // Ratio 0 ise 3D panelini kapat
    if (ratio === 0) {
        // Önce 2D panelini tam ekran yap
        p2dPanel.style.flex = '1 1 100%';
        p3dPanel.style.flex = '0 0 0';

        // Sonra 3D'yi kapat
        if (dom.mainContainer.classList.contains('show-3d')) {
            toggle3DView(); // 3D'yi kapat
        }

        // resize'ı çağır
        setTimeout(() => {
            resize();
        }, 10);
        return;
    }

    // 3D açık değilse, önce aç sonra ratio'yu tekrar ayarla
    if (!dom.mainContainer.classList.contains('show-3d')) {
        // Split ratio butonlarını ve 3D'yi göster
        dom.mainContainer.classList.add('show-3d');
        dom.b3d.classList.add('active');
        setMode("select");

        const splitButtons = document.getElementById('split-ratio-buttons');
        if (splitButtons) splitButtons.style.display = 'flex';
    }

    // Panel genişliklerini ayarla
    if (ratio === 100) {
        p2dPanel.style.flex = '0 0 0';
        p3dPanel.style.flex = '1 1 100%';
    } else if (ratio === 75) {
        p2dPanel.style.flex = '1 1 25%';
        p3dPanel.style.flex = '1 1 75%';
    } else if (ratio === 50) {
        p2dPanel.style.flex = '1 1 50%';
        p3dPanel.style.flex = '1 1 50%';
    } else if (ratio === 25) {
        p2dPanel.style.flex = '1 1 75%';
        p3dPanel.style.flex = '1 1 25%';
    }

    setTimeout(() => {
        resize();
        update3DScene();
    }, 10);
}

// Splitter fonksiyonları
let isResizing = false;
function onSplitterPointerDown(e) { isResizing = true; dom.p2d.style.pointerEvents = 'none'; dom.p3d.style.pointerEvents = 'none'; document.body.style.cursor = 'col-resize'; window.addEventListener('pointermove', onSplitterPointerMove); window.addEventListener('pointerup', onSplitterPointerUp); }
function onSplitterPointerMove(e) {
    if (!isResizing) return;

    const mainRect = dom.mainContainer.getBoundingClientRect();
    const p2dPanel = document.getElementById('p2d');
    const p3dPanel = document.getElementById('p3d');

    let p2dWidth = e.clientX - mainRect.left;

    // Minimum genişlikler - 2D paneli 0'a kadar küçültülebilir (tam fullscreen için)
    const min2DWidth = 0; // 2D paneli tamamen kapatılabilir
    const min3DWidth = 150; // 3D paneli en az 150px olmalı

    // 2D panel için minimum kontrol
    if (p2dWidth < min2DWidth) p2dWidth = min2DWidth;

    // 3D panel için minimum kontrol (2D panel maksimum genişliği)
    const max2DWidth = mainRect.width - min3DWidth - dom.splitter.offsetWidth - 20;
    if (p2dWidth > max2DWidth) p2dWidth = max2DWidth;

    let p3dWidth = mainRect.width - p2dWidth - dom.splitter.offsetWidth - 20;

    p2dPanel.style.flex = `1 1 ${ p2dWidth } px`;
    p3dPanel.style.flex = `1 1 ${ p3dWidth } px`;

    resize();
}
function onSplitterPointerUp() { isResizing = false; dom.p2d.style.pointerEvents = 'auto'; dom.p3d.style.pointerEvents = 'auto'; document.body.style.cursor = 'default'; window.removeEventListener('pointermove', onSplitterPointerMove); window.removeEventListener('pointerup', onSplitterPointerUp); }


// Duvar boyutlandırma fonksiyonu
function resizeWall(wall, newLengthCm, stationaryPointHandle) {
    if (!wall || isNaN(newLengthCm) || newLengthCm <= 0) return;
    const stationaryPoint = wall[stationaryPointHandle];
    const movingPointHandle = stationaryPointHandle === "p1" ? "p2" : "p1";
    const movingPoint = wall[movingPointHandle];
    if(!stationaryPoint || !movingPoint) return;
    const dx = movingPoint.x - stationaryPoint.x;
    const dy = movingPoint.y - stationaryPoint.y;
    const currentLength = Math.hypot(dx, dy);
    if (currentLength < 0.1) return;
    const scale = newLengthCm / currentLength;
    movingPoint.x = stationaryPoint.x + dx * scale;
    movingPoint.y = stationaryPoint.y + dy * scale;
}

// Uzunluk input'unu konumlandırma
export function positionLengthInput() {
    if (!state.selectedObject) return;
    let midX, midY;
    const { selectedObject } = state;
    if (selectedObject.type === "wall") { const wall = selectedObject.object; if(!wall.p1 || !wall.p2) return; midX = (wall.p1.x + wall.p2.x) / 2; midY = (wall.p1.y + wall.p2.y) / 2; }
    else if (selectedObject.type === "door" || selectedObject.type === "window") { const item = selectedObject.object; const wall = (selectedObject.type === 'door') ? item.wall : selectedObject.wall; if (!wall || !wall.p1 || !wall.p2) return; const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return; const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen; midX = wall.p1.x + dx * item.pos; midY = wall.p1.y + dy * item.pos; }
    else { return; }
    const screenPos = worldToScreen(midX, midY);
    dom.lengthInput.style.left = `${ screenPos.x } px`;
    dom.lengthInput.style.top = `${ screenPos.y - 20 } px`;
}

// Uzunluk düzenlemeyi başlatma
export function startLengthEdit(initialKey = '') {
    if (!state.selectedObject || (state.selectedObject.type !== "wall" && state.selectedObject.type !== "door" && state.selectedObject.type !== "window")) return;
    setState({ isEditingLength: true });
    positionLengthInput();
    dom.lengthInput.style.display = "block";
    let currentValue = '';
    if (state.selectedObject.type === "wall") { const wall = state.selectedObject.object; const currentLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); currentValue = currentLength.toFixed(0); }
    else { currentValue = state.selectedObject.object.width.toFixed(0); }
    dom.lengthInput.value = initialKey || currentValue;
    // Use setTimeout to ensure the input is fully rendered before focusing
    setTimeout(() => {
        dom.lengthInput.focus();
        if (!initialKey) {
            dom.lengthInput.select();
        }
    }, 10);
}

// Uzunluk düzenlemeyi onaylama
function confirmLengthEdit() {
    if (!state.selectedObject) return;
    let rawValue = dom.lengthInput.value.trim();
    let reverseDirection = false;
    let operation = null;
    let operand = NaN;
    let newDimensionCm = NaN;
    const { selectedObject } = state;
    const MIN_ITEM_WIDTH = 20;

    const multiplyMatch = rawValue.match(/^(\d+(\.\d+)?)\*$/);
    const divideMatch = rawValue.match(/^(\d+(\.\d+)?)\/$/);

    if (multiplyMatch) {
        operation = '*'; operand = parseFloat(multiplyMatch[1]); if (operand > 10) operand /= 10;
    } else if (divideMatch) {
        operation = '/'; operand = parseFloat(divideMatch[1]); if (operand > 10) operand /= 10;
    }

    let currentDimension = 0;
    if (selectedObject.type === "wall") { const wall = selectedObject.object; currentDimension = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); }
    else if (selectedObject.type === "door" || selectedObject.type === "window") { currentDimension = selectedObject.object.width; }

    if (operation && !isNaN(operand) && operand > 0 && currentDimension > 0) {
        if (operation === '*') newDimensionCm = currentDimension * operand; else newDimensionCm = currentDimension / operand;
    } else {
        if (selectedObject.type === "wall" && rawValue.endsWith("-")) { reverseDirection = true; rawValue = rawValue.slice(0, -1); }
        newDimensionCm = parseFloat(rawValue);
    }

    if (selectedObject.type === "wall") {
        const wall = selectedObject.object;
        if (newDimensionCm < getMinWallLength(wall)) { cancelLengthEdit(); return; }
        if (!isNaN(newDimensionCm) && newDimensionCm > 0) {
            const stationaryHandle = reverseDirection ? "p2" : "p1";
            const movingPointHandle = reverseDirection ? "p1" : "p2";
            const movingPoint = wall[movingPointHandle];
            const stationaryPoint = wall[stationaryHandle];
            const originalPos = { x: movingPoint.x, y: movingPoint.y };
            resizeWall(selectedObject.object, newDimensionCm, stationaryHandle);
            applyStretchModification(movingPoint, originalPos, stationaryPoint);
            processWalls();
            saveState();
            update3DScene();
        }
    } else if (selectedObject.type === "door" || selectedObject.type === "window") {
        const item = selectedObject.object;
        const wall = (selectedObject.type === 'door') ? item.wall : selectedObject.wall;

        if (isNaN(newDimensionCm) || newDimensionCm < MIN_ITEM_WIDTH || !wall || !wall.p1 || !wall.p2) { cancelLengthEdit(); return; }

        const originalWidth = item.width;
        const originalPos = item.pos;
        const segment = findAvailableSegmentAt(wall, item.pos, item);
        if (!segment) { console.warn("Öğe için uygun segment bulunamadı."); cancelLengthEdit(); return; }

        const deltaWidth = newDimensionCm - originalWidth;
        const itemStartOriginal = originalPos - originalWidth / 2;
        const itemEndOriginal = originalPos + originalWidth / 2;
        const spaceLeft = itemStartOriginal - segment.start;
        const spaceRight = segment.end - itemEndOriginal;
        let deltaLeft = 0, deltaRight = 0;

        if (deltaWidth > 0) { // Genişletme
            const idealDelta = deltaWidth / 2;
            deltaLeft = Math.min(idealDelta, spaceLeft);
            deltaRight = Math.min(idealDelta, spaceRight);
            if (deltaLeft < idealDelta) deltaRight = Math.min(deltaWidth - deltaLeft, spaceRight);
            else if (deltaRight < idealDelta) deltaLeft = Math.min(deltaWidth - deltaRight, spaceLeft);
        } else { // Küçültme
            const idealDelta = deltaWidth / 2;
            deltaLeft = idealDelta; deltaRight = idealDelta;
            const potentialFinalWidth = originalWidth + deltaLeft + deltaRight;
            if (potentialFinalWidth < MIN_ITEM_WIDTH) {
                const adjustment = MIN_ITEM_WIDTH - potentialFinalWidth;
                deltaLeft += adjustment / 2; deltaRight += adjustment / 2;
            }
        }

        let finalWidth = originalWidth + deltaLeft + deltaRight;
        let finalPos = originalPos + (deltaRight - deltaLeft) / 2;
        finalWidth = Math.max(MIN_ITEM_WIDTH, Math.min(finalWidth, segment.length));
        const minPossiblePos = segment.start + finalWidth / 2;
        const maxPossiblePos = segment.end - finalWidth / 2;
        finalPos = Math.max(minPossiblePos, Math.min(maxPossiblePos, finalPos));

        item.width = finalWidth; item.pos = finalPos; item.isWidthManuallySet = true;

        let isValid = (selectedObject.type === 'door') ? isSpaceForDoor(item) : isSpaceForWindow(selectedObject);
        if (isValid) { saveState(); update3DScene(); }
        else { console.warn("Yeni boyutlandırma geçerli değil, geri alınıyor."); item.width = originalWidth; item.pos = originalPos; item.isWidthManuallySet = false; }
    }
    cancelLengthEdit();
}

// Uzunluk düzenlemeyi iptal etme
export function cancelLengthEdit() {
    setState({ isEditingLength: false });
    dom.lengthInput.style.display = "none";
    dom.lengthInput.blur();
}

// --- MERDİVEN POPUP FONKSİYONLARI ---
let currentEditingStair = null; // Düzenlenen merdiveni tutmak için

export function showStairPopup(stair, e) {
    // --- YENİ EKLENEN GÜNCELLEME KODU ---
    // Panel açılmadan önce tüm merdivenlerin basamak sayısını ve kotlarını güncelle
    if (state.stairs && state.stairs.length > 0) {
        // Önce tüm normal merdivenlerin basamak sayısını güncelle
        state.stairs.forEach(s => {
            if (!s.isLanding) {
                recalculateStepCount(s);
            }
        });
        // Sonra, en üstteki (bağlantısı olmayan) merdivenlerden başlayarak kotları güncelle
        const topLevelStairs = state.stairs.filter(s => !s.connectedStairId);
        topLevelStairs.forEach(topStair => {
            updateConnectedStairElevations(topStair.id, new Set()); // Ziyaret edilenleri takip et
        });
        // Güncellenmiş merdiven nesnesini bul (referans değişmiş olabilir)
        const updatedStair = state.stairs.find(s => s.id === stair.id);
        if (updatedStair) {
            stair = updatedStair; // Güncel referansı kullan
        } else {
            console.warn("showStairPopup: Düzenlenecek merdiven güncellendikten sonra bulunamadı.");
            // Hata durumu - belki paneli kapatmak veya eski veriyle devam etmek gerekebilir
        }
    }
    setState({ isStairPopupVisible: true });
    if (!stair) return;
    currentEditingStair = stair;

    // Popup'ı doldur
    dom.stairNameInput.value = stair.name || 'Merdiven';
    dom.stairBottomElevationInput.value = stair.bottomElevation || 0;
    dom.stairTopElevationInput.value = stair.topElevation || WALL_HEIGHT;
    dom.stairWidthEditInput.value = Math.round(stair.height || 120);
    dom.stairIsLandingCheckbox.checked = stair.isLanding || false;

    // --- Korkuluk Checkbox Durumu ---
    // KULLANICI İSTEĞİ: Değer neyse onu göster, sahanlıksa pasifleştir
    dom.stairShowRailingCheckbox.checked = stair.showRailing || false;
    dom.stairShowRailingCheckbox.disabled = stair.isLanding;
    // --- Korkuluk Checkbox Durumu SONU ---

    // Bağlı merdiven select'ini doldur
    dom.stairConnectedStairSelect.innerHTML = '<option value="">YOK</option>';
    (state.stairs || []).forEach(s => {
        if (s.id !== stair.id) {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = s.name || `Merdiven(${ s.id.substring(0, 4) })`;
            option.selected = (stair.connectedStairId === s.id);
            dom.stairConnectedStairSelect.appendChild(option);
        }
    });

    // Alt Kot input'unu etkinleştir/devre dışı bırak
    dom.stairBottomElevationInput.disabled = !!stair.connectedStairId;

    // Sahanlık checkbox durumuna göre Üst Kot input'unu etkinleştir/devre dışı bırak
    // KOT DÜZELTMESİ: Sahanlıksa Üst Kot pasif, Normal merdivense aktif olmalı.
    dom.stairTopElevationInput.disabled = dom.stairIsLandingCheckbox.checked;

    // Popup'ı konumlandır
    const popupWidth = dom.stairPopup.offsetWidth || 300;
    const popupHeight = dom.stairPopup.offsetHeight || 350;
    let left = e.clientX + 5;
    let top = e.clientY + 5;
    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 10;
    if (top + popupHeight > window.innerHeight) top = window.innerHeight - popupHeight - 10;
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    dom.stairPopup.style.left = `${ left } px`;
    dom.stairPopup.style.top = `${ top } px`;
    dom.stairPopup.style.display = 'block';

    // Dışarı tıklama dinleyicisini ayarla
    const clickListener = (event) => {
        if (!dom.stairPopup.contains(event.target) &&
            event.target !== dom.confirmStairPopupButton &&
            event.target !== dom.cancelStairPopupButton) {
             hideStairPopup();
        }
    };
    setState({ clickOutsideRoomPopupListener: clickListener });
    setTimeout(() => window.addEventListener('pointerdown', clickListener, { capture: true, once: true }), 0);
}

export function hideStairPopup() {
    setState({ isStairPopupVisible: false });
    dom.stairPopup.style.display = 'none';
    currentEditingStair = null;
    if (state.clickOutsideRoomPopupListener) {
        window.removeEventListener('pointerdown', state.clickOutsideRoomPopupListener, { capture: true });
        setState({ clickOutsideRoomPopupListener: null });
    }
     dom.c2d.focus();
}

// --- KULLANICI İSTEĞİNE GÖRE GÜNCELLENMİŞ confirmStairChange ---
function confirmStairChange() {
    if (!currentEditingStair) {
        console.error("HATA: confirmStairChange içinde currentEditingStair bulunamadı!");
        hideStairPopup();
        return;
    }
    const stair = currentEditingStair;
    const previousTopElevation = stair.topElevation; // Kot güncellemesi için önceki değeri sakla

    try {
        // Formdaki değerleri al
        stair.name = dom.stairNameInput.value.trim() || 'Merdiven';
        const connectedStairId = dom.stairConnectedStairSelect.value;
        stair.connectedStairId = connectedStairId || null;
        stair.height = parseInt(dom.stairWidthEditInput.value, 10) || 120; // 2D genişlik (eni)
        stair.isLanding = dom.stairIsLandingCheckbox.checked;

        // Korkuluk Durumunu Ata
        // Sahanlıksa her zaman false, değilse checkbox'ın değeri
        stair.showRailing = !stair.isLanding ? dom.stairShowRailingCheckbox.checked : false;

        const LANDING_THICKNESS = 10;
        const connectedStair = (stair.connectedStairId) 
            ? (state.stairs || []).find(s => s.id === stair.connectedStairId) 
            : null;

        if (stair.isLanding) {
            // **** KULLANICI İSTEĞİ: SAHANLIK KOTU MANTIĞI ****
            if (connectedStair) {
                // Bağlantı var: Üst kotu bağlantıdan al, alt kotu 10cm aşağıda hesapla
                stair.topElevation = connectedStair.topElevation || 0;
                stair.bottomElevation = stair.topElevation - LANDING_THICKNESS;
            } else {
                // Bağlantı yok: Alt kotu input'tan al, üst kotu 10cm yukarıda hesapla
                stair.bottomElevation = parseInt(dom.stairBottomElevationInput.value, 10) || 0;
                stair.topElevation = stair.bottomElevation + LANDING_THICKNESS;
            }
        } else {
            // **** NORMAL MERDİVEN KOTU MANTIĞI ****
            if (connectedStair) {
                // Bağlantı var: Alt kotu bağlantıdan al
                stair.bottomElevation = connectedStair.topElevation || 0;
            } else {
                // Bağlantı yok: Alt kotu input'tan al
                stair.bottomElevation = parseInt(dom.stairBottomElevationInput.value, 10) || 0;
            }
            // Üst kotu input'tan al (veya varsayılanı hesapla)
            let topElevationInput = parseInt(dom.stairTopElevationInput.value, 10);
            if (isNaN(topElevationInput)) {
                topElevationInput = stair.bottomElevation + WALL_HEIGHT; // Varsayılan: Tam kat yüksekliği
            }
            // Üst kot, alt kottan en az 10cm yüksek olmalı
            stair.topElevation = Math.max(stair.bottomElevation + 10, topElevationInput);
        }

        recalculateStepCount(stair); // Basamak sayısını yeniden hesapla

        // Kot güncellemesini yay (eğer üst kot değiştiyse)
        if (stair.topElevation !== previousTopElevation) {
            const updatedStairs = (state.stairs || []).map(s => s.id === stair.id ? stair : s);
            setState({ stairs: updatedStairs });
            updateConnectedStairElevations(stair.id, new Set());
        }

        saveState(); // Değişiklikleri geçmişe kaydet
        if (dom.mainContainer.classList.contains('show-3d')) {
             setTimeout(update3DScene, 0); // 3D sahneyi gecikmeli güncelle
        }

    } catch (error) {
        console.error("confirmStairChange içinde hata oluştu:", error);
    } finally {
        hideStairPopup(); // Her durumda popup'ı kapat
    }
}
// --- confirmStairChange Sonu ---


// --- GÜNCELLENMİŞ setupUIListeners (Sahanlık kotu mantığını düzelten) ---
export function setupUIListeners() {
    dom.settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dom.settingsPopup.style.display = 'block';
    });
    dom.closeSettingsPopupBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'none'; });

    // Ayarlar popup'ı dışında bir yere tıklanınca kapat
    document.addEventListener("click", (e) => {
        if (dom.settingsPopup.style.display === 'block' &&
            !dom.settingsPopup.contains(e.target) &&
            e.target !== dom.settingsBtn) {
            dom.settingsPopup.style.display = 'none';
        }
    });

    // Dikey tab butonları için listener'lar ekle
    const tabBtnsVertical = document.querySelectorAll('.tab-btn-vertical');
    tabBtnsVertical.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.id.replace('tab-btn-', '');
            openTab(tabName);
        });
    });

    // Eski yatay tab butonları da varsa destekle
    if (dom.tabButtons) {
        Object.keys(dom.tabButtons).forEach(key => {
            dom.tabButtons[key].addEventListener('click', () => openTab(key));
        });
    }

    // DARK MODE TOGGLE
    dom.darkModeToggle.addEventListener("change", toggleDarkMode);

    dom.borderPicker.addEventListener("input", (e) => setState({ wallBorderColor: e.target.value }));
    dom.roomPicker.addEventListener("input", (e) => setState({ roomFillColor: e.target.value }));
    dom.lineThicknessInput.addEventListener("input", (e) => { const value = parseFloat(e.target.value); if(!isNaN(value)) setState({ lineThickness: value }); });
    dom.wallThicknessInput.addEventListener("input", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) setState({ wallThickness: value }); });
    dom.drawingAngleInput.addEventListener("input", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) setState({ drawingAngle: value }); });
    dom.gridVisibleInput.addEventListener("change", (e) => { state.gridOptions.visible = e.target.checked; });
    dom.gridColorInput.addEventListener("input", (e) => { state.gridOptions.color = e.target.value; });
    dom.gridWeightInput.addEventListener("input", (e) => { const value = parseFloat(e.target.value); if (!isNaN(value)) state.gridOptions.weight = value; });
    dom.gridSpaceInput.addEventListener("input", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) state.gridOptions.spacing = value; });
    dom.snapEndpointInput.addEventListener("change", (e) => state.snapOptions.endpoint = e.target.checked);
    dom.snapMidpointInput.addEventListener("change", (e) => state.snapOptions.midpoint = e.target.checked);
    dom.snapEndpointExtInput.addEventListener("change", (e) => state.snapOptions.endpointExtension = e.target.checked);
    dom.snapMidpointExtInput.addEventListener("change", (e) => state.snapOptions.midpointExtension = e.target.checked);
    dom.snapNearestOnlyInput.addEventListener("change", (e) => state.snapOptions.nearestOnly = e.target.checked);
    dom.dimensionFontSizeInput.addEventListener("input", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) state.dimensionOptions.fontSize = value; });
    dom.dimensionColorInput.addEventListener("input", (e) => { state.dimensionOptions.color = e.target.value; });
    dom.dimensionDefaultViewSelect.addEventListener("change", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) { state.dimensionOptions.defaultView = value; setState({ dimensionMode: value }); } });
    dom.dimensionShowAreaSelect.addEventListener("change", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) state.dimensionOptions.showArea = value; });
    dom.dimensionShowOuterSelect.addEventListener("change", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) state.dimensionOptions.showOuter = value; });
    dom.defaultFloorHeightInput.addEventListener("input", (e) => { const value = parseInt(e.target.value, 10); if (!isNaN(value)) setState({ defaultFloorHeight: value }); }); // YENİ EKLENDİ
    dom.stairsShowRailingInput.addEventListener("change", (e) => { state.stairSettings.showRailing = e.target.checked; }); // YENİ EKLENDİ
    dom.stairsStepDepthSelect.addEventListener("change", (e) => { state.stairSettings.stepDepthRange = e.target.value; }); // YENİ EKLENDİ
    dom.roomNameSelect.addEventListener('click', confirmRoomNameChange);
    dom.roomNameSelect.addEventListener('dblclick', confirmRoomNameChange);
    dom.roomNameInput.addEventListener('input', filterRoomNameList);
    dom.roomNameSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } });
    dom.roomNameInput.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); dom.roomNameSelect.focus(); } else if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } });
    dom.splitter.addEventListener('pointerdown', onSplitterPointerDown);
    dom.lengthInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmLengthEdit(); } else if (e.key === "Escape") { cancelLengthEdit(); } });
    dom.lengthInput.addEventListener("blur", cancelLengthEdit);

    // EKRAN BÖLME ORANI BUTONLARI
    document.getElementById('split-100')?.addEventListener('click', () => setSplitRatio(100));
    document.getElementById('split-75')?.addEventListener('click', () => setSplitRatio(75));
    document.getElementById('split-50')?.addEventListener('click', () => setSplitRatio(50));
    document.getElementById('split-25')?.addEventListener('click', () => setSplitRatio(25));
    document.getElementById('split-0')?.addEventListener('click', () => setSplitRatio(0));

    // MERDİVEN POPUP LISTENER'LARI
    dom.confirmStairPopupButton.addEventListener('click', confirmStairChange);
    dom.cancelStairPopupButton.addEventListener('click', hideStairPopup);

    // "Orta Düzlem" checkbox'ı değiştiğinde:
    dom.stairIsLandingCheckbox.addEventListener('change', () => {
        const isLanding = dom.stairIsLandingCheckbox.checked;
        const LANDING_THICKNESS = 10;
        
        // Input'ları ayarla
        dom.stairTopElevationInput.disabled = isLanding; // Sahanlıksa Üst Kot pasif
        dom.stairShowRailingCheckbox.disabled = isLanding; // Sahanlıksa Korkuluk pasif

        // O anki alt kotu al (bağlantı varsa oradan, yoksa input'tan)
        let currentBottomElev = parseInt(dom.stairBottomElevationInput.value, 10) || 0;
        const connectedStairId = dom.stairConnectedStairSelect.value;
        if (connectedStairId) {
            const connectedStair = (state.stairs || []).find(s => s.id === connectedStairId);
            if(connectedStair) currentBottomElev = connectedStair.topElevation || 0;
        }

        if (isLanding) {
            // Sahanlık seçildi:
            dom.stairShowRailingCheckbox.checked = false; // Korkuluğu kaldır
            // Üst kotu = Alt kot + kalınlık olarak ayarla
            dom.stairTopElevationInput.value = currentBottomElev + LANDING_THICKNESS;
        } else {
            // Sahanlık kaldırıldı:
            // Korkuluk pasifliğini kaldır (kullanıcı seçebilir, varsayılan false kalır)
            // dom.stairShowRailingCheckbox.checked = false; // (Varsayılan false istendiği için değiştirme)
            // Üst kotu = Alt kot + KAT YÜKSEKLİĞİ olarak ayarla
            dom.stairTopElevationInput.value = currentBottomElev + WALL_HEIGHT;
        }
    });

    // "Bağlı Merdiven" select'i değiştiğinde:
    dom.stairConnectedStairSelect.addEventListener('change', () => {
        const selectedId = dom.stairConnectedStairSelect.value;
        const LANDING_THICKNESS = 10;
        let isConnected = false;
        let newBottomElevation = 0;

        if (selectedId && currentEditingStair) {
             const connectedStair = (state.stairs || []).find(s => s.id === selectedId);
             if (connectedStair) {
                 newBottomElevation = connectedStair.topElevation || 0;
                 dom.stairBottomElevationInput.value = newBottomElevation;
                 isConnected = true;
             }
        } else {
             newBottomElevation = 0; 
             dom.stairBottomElevationInput.value = newBottomElevation;
        }
        
        dom.stairBottomElevationInput.disabled = isConnected;
        
        // Eğer sahanlık seçiliyse, üst kotu alt kota göre tekrar ayarla
        if (dom.stairIsLandingCheckbox.checked) {
             dom.stairTopElevationInput.value = newBottomElevation + LANDING_THICKNESS;
        } else {
            // Normal merdivense üst kotu da kat yüksekliğine göre ayarla
             dom.stairTopElevationInput.value = newBottomElevation + WALL_HEIGHT;
        }
    });

    // Alt kot inputu değişirse (ve serbestse) ve sahanlıksa üst kotu da güncelle
     dom.stairBottomElevationInput.addEventListener('input', () => {
         if (dom.stairIsLandingCheckbox.checked && !dom.stairBottomElevationInput.disabled) {
             const LANDING_THICKNESS = 10;
             dom.stairTopElevationInput.value = (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + LANDING_THICKNESS;
         }
         // Normal merdivense üst kotu da güncelle
         else if (!dom.stairIsLandingCheckbox.checked && !dom.stairBottomElevationInput.disabled) {
             dom.stairTopElevationInput.value = (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + WALL_HEIGHT;
         }
     });

    // Merdiven popup inputları için Enter/Escape tuşları
    [dom.stairNameInput, dom.stairBottomElevationInput, dom.stairTopElevationInput, dom.stairWidthEditInput].forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmStairChange();
            } else if (e.key === 'Escape') {
                hideStairPopup();
            }
        });
    });
    // MERDİVEN POPUP LISTENER'LARI SONU

    // FPS KAMERA BUTONU LISTENER'I
    dom.bFirstPerson.addEventListener('click', () => {
        // Butonu toggle et
        dom.bFirstPerson.classList.toggle('active');

        // Kamera modunu değiştir
        toggleCameraMode();

        // Koordinat görüntülemesini toggle et
        const cameraCoords = document.getElementById('camera-coords');
        if (cameraCoords) {
            // FPS modunda mıyız kontrol et (aktif buton = FPS modu)
            if (dom.bFirstPerson.classList.contains('active')) {
                cameraCoords.style.display = 'block';
            } else {
                cameraCoords.style.display = 'none';
            }
        }

        // NOT: Pointer lock kullanmıyoruz - klavye kontrolleri yeterli
        // Mouse serbest kalıyor, kullanıcı FPS modunda bile mouse ile UI'ya erişebilir
    });

    // 3D GÖSTER BUTONU LISTENER'I
    dom.b3d.addEventListener('click', () => {
        toggle3DView();
    });

    // İZOMETRİ GÖSTER BUTONU LISTENER'I
    dom.bIso.addEventListener('click', () => {
        toggleIsoView();
    });

    // 3D PERSPEKTİF GÖRÜNÜM BUTONU LISTENER'I
    if (dom.b3DPerspective) {
        dom.b3DPerspective.addEventListener('click', () => {
            toggle3DPerspective();
        });
    }

    // KATI GÖSTER / BİNAYI GÖSTER TOGGLE BUTONU
    if (dom.bFloorView) {
        dom.bFloorView.addEventListener('click', () => {
            const currentMode = dom.bFloorView.getAttribute('data-view-mode');

            if (currentMode === 'floor') {
                // Binayı göster moduna geç (3D'de tüm katları göster)
                dom.bFloorView.setAttribute('data-view-mode', 'building');
                dom.bFloorView.textContent = 'BİNA';
                dom.bFloorView.title = 'Binayı Göster (3D\'de Tüm Katlar)';
                setState({ viewMode3D: 'building' });
            } else {
                // Katı göster moduna geç (3D'de sadece aktif katı göster)
                dom.bFloorView.setAttribute('data-view-mode', 'floor');
                dom.bFloorView.textContent = 'KAT';
                dom.bFloorView.title = 'Katı Göster (3D\'de Sadece Aktif Kat)';
                setState({ viewMode3D: 'floor' });
            }

            // 3D sahneyi güncelle
            update3DScene();
        });
    }

    // OPACITY KONTROLLERI
    setupOpacityControls();

    // İZOMETRİ RATIO BUTONLARI
    const isoRatioButtons = document.querySelectorAll('#iso-ratio-buttons .split-btn[data-ratio]');
    isoRatioButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const ratio = parseInt(btn.getAttribute('data-ratio'));
            setIsoRatio(ratio);
        });
    });

    // İZOMETRİ RESET BUTONU
    const isoResetBtn = document.getElementById('iso-reset');
    if (isoResetBtn) {
        isoResetBtn.addEventListener('click', () => {
            resetIsometricView();
        });
    }
}
// --- setupUIListeners Sonu ---

/**
 * İzometrik görünümü orijinal boyutlara sıfırlar
 */
export function resetIsometricView() {
    setState({
        isoZoom: 0.5,
        isoPanOffset: { x: 0, y: 0 },
        isoPipeOffsets: {}
    });
    drawIsoView();
}

/**
 * Mouse pozisyonunda boru ucu var mı kontrol eder
 * @param {number} mouseX - Canvas içindeki X koordinatı
 * @param {number} mouseY - Canvas içindeki Y koordinatı
 * @returns {{pipe: object, type: string} | null} - Boru ve uç tipi ('start' veya 'end')
 */
function findPipeEndpointAtMouse(mouseX, mouseY) {
    // Bu fonksiyon scene-isometric.js'de export edilecek
    if (typeof window.getIsoEndpointAtMouse === 'function') {
        return window.getIsoEndpointAtMouse(mouseX, mouseY);
    }
    return null;
}

/**
 * Opacity kontrol UI'sini başlatır
 */
function setupOpacityControls() {
    const toggleBtn = document.getElementById('opacity-toggle-btn');
    const panel = document.getElementById('opacity-panel');
    const container = document.getElementById('opacity-controls-container');

    if (!toggleBtn || !panel || !container) return;

    // Toggle butonu click event
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('expanded');
        toggleBtn.classList.toggle('active');
    });

    // Her bir slider için event listener ekle
    const sliderTypes = ['wall', 'floor', 'door', 'window', 'column', 'beam', 'stair'];

    // HEPSİ slider'ı
    const allSlider = document.getElementById('opacity-all');
    const allValueDisplay = allSlider?.nextElementSibling;

    if (allSlider && allValueDisplay) {
        allSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            allValueDisplay.textContent = value;

            // Tüm diğer slider'ları da aynı değere ayarla
            const newOpacitySettings = {};
            sliderTypes.forEach(type => {
                const slider = document.getElementById(`opacity - ${ type } `);
                const valueDisplay = slider?.nextElementSibling;

                if (slider && valueDisplay) {
                    slider.value = value;
                    valueDisplay.textContent = value;
                    newOpacitySettings[type] = value;
                }
            });

            // State'i güncelle
            setState({ opacitySettings: { ...state.opacitySettings, ...newOpacitySettings } });

            // 3D sahneyi güncelle
            update3DScene();
        });
    }

    sliderTypes.forEach(type => {
        const slider = document.getElementById(`opacity - ${ type } `);
        const valueDisplay = slider?.nextElementSibling;

        if (!slider || !valueDisplay) return;

        // Slider değiştiğinde
        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            valueDisplay.textContent = value;

            // State'i güncelle
            const newOpacitySettings = { ...state.opacitySettings, [type]: value };
            setState({ opacitySettings: newOpacitySettings });

            // 3D sahneyi güncelle
            update3DScene();
        });

        // Başlangıç değerlerini state'ten al ve UI'ya yansıt
        const initialValue = state.opacitySettings?.[type] || 100;
        slider.value = initialValue;
        valueDisplay.textContent = initialValue;
    });

    // 3D açıldığında container'ı göster
    const observer = new MutationObserver(() => {
        const is3DVisible = dom.mainContainer.classList.contains('show-3d');
        container.style.display = is3DVisible ? 'block' : 'none';
    });

    observer.observe(dom.mainContainer, {
        attributes: true,
        attributeFilter: ['class']
    });

    // İlk yükleme için kontrol
    const is3DVisible = dom.mainContainer.classList.contains('show-3d');
    container.style.display = is3DVisible ? 'block' : 'none';
}