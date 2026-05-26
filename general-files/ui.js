// ui.js
// Son Güncelleme: Sahanlık kotu (125-135) mantığı confirmStairChange ve ilgili listener'larda düzeltildi.
import { getMinWallLength } from './actions.js';
import { state, setState, dom, resize, MAHAL_LISTESI, WALL_HEIGHT, setMode, setDrawingMode, THEME_COLORS } from './main.js'; // THEME_COLORS eklendi
import { saveState, undo, redo } from './history.js';
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
import { renderIsometric, hitTestIsoLabel, setIsoLabelPos, cycleIsoLabelDir, relayoutIsoLabels, toIsometric, createIsoProxyManager } from '../scene3d/scene-isometric.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { closePropertiesPanel } from '../plumbing_v2/properties/properties-panel.js';
// updateConnectedStairElevations import edildiğinden emin olun:
import { gsap } from 'gsap';
import * as THREE from 'three';
import { orbitControls, camera } from '../scene3d/scene3d-core.js';
import { draw2D } from '../draw/draw2d.js';
import { fitDrawingToPerspectiveScreen } from '../draw/draw-persp.js';
import { fitDrawingToScreen } from '../draw/zoom.js';

/**
 * Persp panel aç/kapat/yeniden boyutlandır olaylarında çağrılır.
 * 2D ve (panel açıksa) 3D persp'i ekrana sığdırır.
 * %80 doluluk fit fonksiyonlarının kaynağında uygulanır.
 */
function _fitPerspAndMainTo80() {
    fitDrawingToScreen();
    if (dom.mainContainer && dom.mainContainer.classList.contains('show-persp')) {
        import('../draw/draw-persp.js').then(m => m.syncMainToPersp()).catch(() => {});
        fitDrawingToPerspectiveScreen();
    }
}

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
    if (dom.roomDescriptionInput) dom.roomDescriptionInput.value = room.description || '';

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
    // Popup kapanırken açıklamayı kaydet
    if (state.roomToEdit && dom.roomDescriptionInput) {
        const newDesc = dom.roomDescriptionInput.value;
        if ((state.roomToEdit.description || '') !== newDesc) {
            state.roomToEdit.description = newDesc;
            saveState();
        }
    }
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
    }
    if (state.roomToEdit && dom.roomDescriptionInput) {
        state.roomToEdit.description = dom.roomDescriptionInput.value;
    }
    if (state.roomToEdit) saveState();
    hideRoomNamePopup();
}

export function toggle3DView() {
    dom.mainContainer.classList.toggle('show-3d');
    // --- YENİ EKLENEN KOD: Butonun rengini aktif/pasif yap ---
    const is3DActive = dom.mainContainer.classList.contains('show-3d');
    dom.b3d.classList.toggle('active', is3DActive);

    if (is3DActive) { // (dom.mainContainer kontrolü yerine değişkene aldık)
        setMode("select");
        //closePropertiesPanel(); // 3D açılınca özellikler paneli otomatik kapansın

        // Split ratio butonlarını göster
        const splitButtons = document.getElementById('split-ratio-buttons');
        if (splitButtons) splitButtons.style.display = 'flex';

        // FPS kamera kontrollerini göster
        const fpsControls = document.getElementById('fps-camera-controls');
        if (fpsControls) fpsControls.style.display = 'flex';

        // Varsayılan split ratio'yu ayarla (50%)
        setSplitRatio(50);
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

// Persp paneli son kullanıcı genişliği (kapatılırken hatırlanır, sonraki açılışta geri yüklenir).
let _savedPerspP2dFlex = null;
let _savedPerspPanelFlex = null;
let _savedPerspRatioBtn = null;

function _capturePerspFlex() {
    const p2d = document.getElementById('p2d');
    const pPersp = document.getElementById('pPersp');
    if (!p2d || !pPersp) return;
    // Sadece anlamlı (kapalı durumun '0 0 0' / '1 1 100%' kombinasyonu olmayan) genişlikleri yakala.
    const f2 = p2d.style.flex;
    const fp = pPersp.style.flex;
    if (!fp || fp === '0 0 0') return;
    _savedPerspP2dFlex = f2;
    _savedPerspPanelFlex = fp;
    const activeBtn = document.querySelector('#persp-ratio-buttons .split-btn.active');
    _savedPerspRatioBtn = activeBtn ? activeBtn.id : null;
}

export function togglePerspView() {
    const wasActive = dom.mainContainer.classList.contains('show-persp');
    // Kapatma anı: mevcut genişliği kaydet.
    if (wasActive) _capturePerspFlex();

    dom.mainContainer.classList.toggle('show-persp');
    const isActive = dom.mainContainer.classList.contains('show-persp');
    if (dom.bPersp) dom.bPersp.classList.toggle('active', isActive);
    // Yeni açılan persp en son aktif olsun; kapandıysa açık olan iso'ya devret
    if (dom.bPersp) {
        if (isActive) {
            dom.bPersp.classList.add('last-active');
            if (dom.bIso) dom.bIso.classList.remove('last-active');
        } else {
            dom.bPersp.classList.remove('last-active');
            if (dom.bIso && dom.bIso.classList.contains('active')) {
                dom.bIso.classList.add('last-active');
            }
        }
    }

    if (isActive) {
        setMode("select");
        const btns = document.getElementById('persp-ratio-buttons');
        if (btns) btns.style.display = 'flex';
        if (dom.perspSplitter) dom.perspSplitter.style.display = 'block';
        // Önceki açılışta preset ratio (25/50/75/100) kullanıldıysa onunla geri aç;
        // splitter ile manuel sürüklenmişse (preset yok) güvenli varsayılan %50.
        // Doğrudan eski inline flex'i (pixel bazlı) restore etmek, bir sonraki açılışta
        // perspektif panelini sağda sıkışmış halde getirebiliyordu — bu yüzden hep
        // viewport'a göre yeniden hesaplayan setPerspRatio'dan geçiyoruz.
        let restoreRatio = 50;
        if (_savedPerspRatioBtn) {
            const m = _savedPerspRatioBtn.match(/persp-(\d+)/);
            if (m) restoreRatio = parseInt(m[1], 10);
        }
        setPerspRatio(restoreRatio);
    } else {
        const btns = document.getElementById('persp-ratio-buttons');
        if (btns) btns.style.display = 'none';
        if (dom.perspSplitter) dom.perspSplitter.style.display = 'none';
        // Kapanırken inline flex stillerini temizle ki p2d sabit genişlikte
        // (örn. splitter veya %100 ratio kalıntısı) takılı kalmasın — CSS varsayılanı
        // (#p2d { flex: 1 1 auto }) tüm alanı doldurur.
        const p2d = document.getElementById('p2d');
        const pPersp = document.getElementById('pPersp');
        if (p2d) p2d.style.flex = '';
        if (pPersp) pPersp.style.flex = '';
    }

    setTimeout(() => {
        resize();
        // 3D perspektif paneli aç/kapat: 2D + 3D %80 sığdırma.
        _fitPerspAndMainTo80();
    }, 30);
}

export function setPerspRatio(ratio) {
    const p2dPanel = document.getElementById('p2d');
    const pPerspPanel = document.getElementById('pPersp');

    document.querySelectorAll('#persp-ratio-buttons .split-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`persp-${ratio}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (ratio === 0) {
        // Kapatmadan önce mevcut genişliği kaydet ki bir sonraki açılışta geri yüklensin.
        if (dom.mainContainer.classList.contains('show-persp')) _capturePerspFlex();
        p2dPanel.style.flex = '1 1 100%';
        pPerspPanel.style.flex = '0 0 0';
        if (dom.mainContainer.classList.contains('show-persp')) togglePerspView();
        setTimeout(() => resize(), 10);
        return;
    }

    if (!dom.mainContainer.classList.contains('show-persp')) {
        dom.mainContainer.classList.add('show-persp');
        if (dom.bPersp) dom.bPersp.classList.add('active');
        setMode("select");
        const btns = document.getElementById('persp-ratio-buttons');
        if (btns) btns.style.display = 'flex';
        if (dom.perspSplitter) dom.perspSplitter.style.display = 'block';
        setTimeout(() => setPerspRatio(ratio), 50);
        return;
    }

    if (ratio === 100) {
        p2dPanel.style.flex = '0 0 0';
        pPerspPanel.style.flex = '1 1 100%';
    } else if (ratio === 75) {
        p2dPanel.style.flex = '1 1 25%';
        pPerspPanel.style.flex = '1 1 75%';
    } else if (ratio === 50) {
        p2dPanel.style.flex = '1 1 50%';
        pPerspPanel.style.flex = '1 1 50%';
    } else if (ratio === 25) {
        p2dPanel.style.flex = '1 1 75%';
        pPerspPanel.style.flex = '1 1 25%';
    }

    // Son kullanıcı genişliğini kaydet (sonraki açılışta geri yüklenecek).
    _capturePerspFlex();

    setTimeout(() => {
        resize();
        // Ratio değişimi: 2D + 3D %80 sığdırma.
        _fitPerspAndMainTo80();
    }, 30);
}

export function toggleIsoView() {
    dom.mainContainer.classList.toggle('show-iso');
    // --- YENİ EKLENEN KOD: Butonun rengini aktif/pasif yap ---
    const isIsoActive = dom.mainContainer.classList.contains('show-iso');
    dom.bIso.classList.toggle('active', isIsoActive);
    // İso/persp aktif buton dimming mantığı — yeni açılan en son aktif olsun
    if (isIsoActive) {
        dom.bIso.classList.add('last-active');
        if (dom.bPersp) dom.bPersp.classList.remove('last-active');
    } else {
        dom.bIso.classList.remove('last-active');
        // İso kapandı, persp açıksa onu son aktif yap
        if (dom.bPersp && dom.bPersp.classList.contains('active')) {
            dom.bPersp.classList.add('last-active');
        }
    }
    if (isIsoActive) {
        setMode("select");

        // İzometri ratio butonlarını göster
        const isoButtons = document.getElementById('iso-ratio-buttons');
        if (isoButtons) isoButtons.style.display = 'flex';

        // İzometri splitter'ını göster
        dom.isoSplitter.style.display = 'block';

        // İzometrik canvas boyutunu ayarla
        resizeIsoCanvas(); // Bu fonksiyonun bu dosyada olduğundan emin olun veya import edin

        // İzometrik görünümü çiz
        drawIsoView();

        // Varsayılan split ratio'yu ayarla (100% — daima tam ekran aç)
        setIsoRatio(100);
    } else {
        // İzometri ratio butonlarını gizle
        const isoButtons = document.getElementById('iso-ratio-buttons');
        if (isoButtons) isoButtons.style.display = 'none';

        // İzometri splitter'ını gizle
        dom.isoSplitter.style.display = 'none';

        // setIsoRatio(100) ile bırakılan inline flex stillerini temizle —
        // aksi takdirde p2d '0 0 0' takılı kalıyor ve izometri kapatılınca
        // 2D çizim ekrana gelmiyor.
        const p2dPanel = document.getElementById('p2d');
        const pIsoPanel = document.getElementById('pIso');
        if (p2dPanel) p2dPanel.style.flex = '';
        if (pIsoPanel) pIsoPanel.style.flex = '';
    }

    setTimeout(() => {
        resize();
        if (dom.mainContainer.classList.contains('show-iso')) {
            resizeIsoCanvas();
            // İzometri açıldığında otomatik ekrana sığdır
            if (isIsoActive) {
                fitIsoToScreen();
            } else {
                drawIsoView();
            }
        } else {
            // İzometri kapatıldı — 2D canvas yeniden boyutlandı, yeniden çiz.
            draw2D();
        }
    }, 10);
}

export function toggle3DPerspective() {
    // 2D ► 3D toggle'ı sol canvas'ı dönüştürmez; sağdaki perspektif panelini açıp kapatır.
    // Sol panel her zaman 2D kalır → viewBlendFactor & is3DPerspectiveActive sıfırla.
    state.viewBlendFactor = 0;
    setState({ is3DPerspectiveActive: false });

    const willBeActive = !dom.mainContainer.classList.contains('show-persp');
    if (dom.b3DPerspective) dom.b3DPerspective.checked = willBeActive;
    togglePerspView();
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

// history.js gibi modüller çevrimden bağımsız tetikleyebilsin (geç bağlama)
if (typeof window !== 'undefined') window._aangcad_drawIsoView = () => drawIsoView();

export function drawIsoView() {
    if (!dom.mainContainer.classList.contains('show-iso')) return;

    const ctx = dom.ctxIso;
    const canvas = dom.cIso;

    // Bayat iso offset'leri temizle — boru/komponent silinmiş/bölünmüşse, eski
    // id'lerin state'te birikmesini engelle (aksi halde split sonrası garip artefaktlar olur).
    if (plumbingManager) {
        const pipeIds = new Set((plumbingManager.pipes || []).map(p => p.id));
        const compIds = new Set((plumbingManager.components || []).map(c => c.id));

        let changed = false;
        const cleanedPipes = {};
        for (const id in state.isoPipeOffsets) {
            if (pipeIds.has(id)) cleanedPipes[id] = state.isoPipeOffsets[id];
            else changed = true;
        }
        const cleanedComps = {};
        for (const id in state.isoComponentOffsets) {
            if (compIds.has(id)) cleanedComps[id] = state.isoComponentOffsets[id];
            else changed = true;
        }
        const cleanedLabels = {};
        for (const id in state.isoLabelOffsets) {
            if (id.startsWith('vert_')) {
                if (pipeIds.has(id.slice(5))) cleanedLabels[id] = state.isoLabelOffsets[id];
                else changed = true;
            } else if (pipeIds.has(id) || compIds.has(id)) {
                cleanedLabels[id] = state.isoLabelOffsets[id];
            } else {
                changed = true;
            }
        }
        if (changed) {
            setState({
                isoPipeOffsets: cleanedPipes,
                isoComponentOffsets: cleanedComps,
                isoLabelOffsets: cleanedLabels,
            });
        }
    }

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

        const rect = dom.cIso.getBoundingClientRect();
        const mouseXInRect = e.clientX - rect.left;
        const mouseYInRect = e.clientY - rect.top;

        // Canvas internal koordinatlarına dönüştür (CSS boyutu farklı olabilir)
        const mouseX = (mouseXInRect / rect.width) * dom.cIso.width;
        const mouseY = (mouseYInRect / rect.height) * dom.cIso.height;

        // Canvas merkezi
        const centerX = dom.cIso.width / 2;
        const centerY = dom.cIso.height / 2;

        // Transform: screen = world * zoom + center + offset
        // Reverse: world = (screen - center - offset) / zoom

        // Zoom öncesi mouse'un altındaki world noktası
        const worldPointX = (mouseX - centerX - state.isoPanOffset.x) / state.isoZoom;
        const worldPointY = (mouseY - centerY - state.isoPanOffset.y) / state.isoZoom;

        // Zoom faktörü - daha smooth geçişler için küçük adımlar
        const zoomDelta = e.deltaY > 0 ? 0.95 : 1.05;
        const newZoom = Math.max(0.1, Math.min(5, state.isoZoom * zoomDelta));

        // Zoom sonrası aynı world noktası mouse pozisyonunda kalmalı
        const newIsoPanOffset = {
            x: mouseX - centerX - worldPointX * newZoom,
            y: mouseY - centerY - worldPointY * newZoom
        };

        setState({
            isoZoom: newZoom,
            isoPanOffset: newIsoPanOffset
        });
        drawIsoView();
    }, { passive: false });

    // Mouse koordinatlarını iso world (transform öncesi) uzaya çevirir
    const isoMouseToWorld = (mouseX, mouseY) => {
        const params = window._isoRenderParams;
        if (!params) return { wx: mouseX, wy: mouseY };
        const { centerX, centerY, zoom, offset } = params;
        return {
            wx: (mouseX - centerX - offset.x) / zoom,
            wy: (mouseY - centerY - offset.y) / zoom,
        };
    };

    // İSO / PERSP arasında "son aktif" izleyici — her iki panel açıkken hangisi
    // ile etkileşim hâlinde olduğumuzu butonlardan görelim.
    const _setLastActiveView = (which) => {
        if (which === 'iso') {
            dom.bIso && dom.bIso.classList.add('last-active');
            dom.bPersp && dom.bPersp.classList.remove('last-active');
        } else if (which === 'persp') {
            dom.bPersp && dom.bPersp.classList.add('last-active');
            dom.bIso && dom.bIso.classList.remove('last-active');
        }
    };
    dom.cIso.addEventListener('mousedown', () => _setLastActiveView('iso'), true);
    dom.cIso.addEventListener('mouseenter', () => _setLastActiveView('iso'));
    if (dom.cPersp) {
        dom.cPersp.addEventListener('mousedown', () => _setLastActiveView('persp'), true);
        dom.cPersp.addEventListener('mouseenter', () => _setLastActiveView('persp'));
    }

    // Mouse down - sürükleme veya pan başlat
    dom.cIso.addEventListener('mousedown', (e) => {
        if (!dom.mainContainer.classList.contains('show-iso')) return;

        const rect = dom.cIso.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (e.button === 0) {
            // 1) BORU UCU sürükleme — etiketten ÖNCE kontrol et.
            // Aksi takdirde, kısa hatlarda sayaç/hat etiketi P2'nin üstüne denk
            // gelince click etiket drag'ine gidiyor ve uç hiç tutulamıyor.
            const endpoint = findPipeEndpointAtMouse(mouseX, mouseY);
            if (endpoint) {
                e.preventDefault();
                // Sürüklenen endpoint'in dünya konumunu yakala — diğer borularla
                // bağlantı tespiti tüm sürükleme boyunca bu sabit pozisyona göre yapılır.
                const epX = endpoint.type === 'start' ? endpoint.pipe.p1.x : endpoint.pipe.p2.x;
                const epY = endpoint.type === 'start' ? endpoint.pipe.p1.y : endpoint.pipe.p2.y;
                const epZ = endpoint.type === 'start' ? (endpoint.pipe.p1.z || 0) : (endpoint.pipe.p2.z || 0);
                setState({
                    isoDragging: true,
                    isoDraggedPipe: endpoint.pipe,
                    isoDraggedEndpoint: endpoint.type,
                    isoPanStart: { x: e.clientX, y: e.clientY },
                    isoDraggedEndpointWorld: { x: epX, y: epY, z: epZ },
                });
                return;
            }

            // 2) ETİKET sürükleme — endpoint yoksa
            const { wx, wy } = isoMouseToWorld(mouseX, mouseY);
            const labelHit = hitTestIsoLabel(wx, wy);
            if (labelHit) {
                e.preventDefault();
                setState({
                    isoLabelDragging: true,
                    isoDraggedLabelId: labelHit.id,
                    isoDraggedLabelStyle: labelHit.style,
                    isoDraggedLabelSize: { bw: labelHit.bw, bh: labelHit.bh },
                    // Tıklama noktası ile kutunun sol-üst köşesi arasındaki ofset
                    isoLabelGrab: { ox: wx - labelHit.bx, oy: wy - labelHit.by },
                    // Nesnenin iso pozisyonu — delta hesabı için sabit kalmalı
                    isoDraggedLabelObjPos: { cx: labelHit.cx, cy: labelHit.cy },
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

    // Çift tıklama — etiketin yönünü değiştir (2D sahnedeki gibi)
    dom.cIso.addEventListener('dblclick', (e) => {
        if (!dom.mainContainer.classList.contains('show-iso')) return;
        const rect = dom.cIso.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const { wx, wy } = isoMouseToWorld(mouseX, mouseY);
        const hit = hitTestIsoLabel(wx, wy);
        if (hit) {
            e.preventDefault();
            const newOffsets = cycleIsoLabelDir(hit.id);
            setState({ isoLabelOffsets: newOffsets });
            drawIsoView();
        }
    });

    // Mouse move - sürükleme veya pan
    dom.cIso.addEventListener('mousemove', (e) => {
        // --- HOVER (endpoint marker belirginleşmesi) ---
        // Sürükleme veya pan yokken, fareyle endpoint'lere yaklaşılınca işaret olsun.
        if (!state.isoDragging && !state.isoLabelDragging && !state.isoPanning) {
            const rect0 = dom.cIso.getBoundingClientRect();
            const mx = e.clientX - rect0.left;
            const my = e.clientY - rect0.top;
            const ep = (typeof window.getIsoEndpointAtMouse === 'function')
                ? window.getIsoEndpointAtMouse(mx, my, 14) // hover yarıçapı tıklamadan biraz geniş
                : null;
            const newHoverId = ep && ep.pipe ? ep.pipe.id : null;
            if (window._isoHoverEpId !== newHoverId) {
                window._isoHoverEpId = newHoverId;
                dom.cIso.style.cursor = newHoverId ? 'pointer' : '';
                drawIsoView();
            }
        }

        // --- ETİKET SÜRÜKLEME ---
        if (state.isoLabelDragging && state.isoDraggedLabelId) {
            const rect = dom.cIso.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const { wx, wy } = isoMouseToWorld(mouseX, mouseY);
            const grab = state.isoLabelGrab || { ox: 0, oy: 0 };
            const sz = state.isoDraggedLabelSize || { bw: 0, bh: 0 };
            const obj = state.isoDraggedLabelObjPos || { cx: 0, cy: 0 };
            const bx = wx - grab.ox;
            const by = wy - grab.oy;
            const newOffsets = setIsoLabelPos(
                state.isoDraggedLabelId,
                state.isoDraggedLabelStyle,
                bx, by, sz.bw, sz.bh,
                obj.cx, obj.cy
            );
            setState({ isoLabelOffsets: newOffsets });
            drawIsoView();
            return;
        }

        // Boru ucu sürükleme — EKSEN-KISITLI hareket + bağlantı koruma
        if (state.isoDragging && state.isoDraggedPipe) {
            const dx = e.clientX - state.isoPanStart.x;
            const dy = e.clientY - state.isoPanStart.y;

            const draggedPipe = state.isoDraggedPipe;
            const draggedEndpoint = state.isoDraggedEndpoint; // 'start' veya 'end'
            const toIso = window._toIsometric || ((x, y) => ({ isoX: x, isoY: y }));
            const hierarchy = window._isoPipeHierarchy;

            // Mouse hareketini iso world birimine çevir (incremental — her frame)
            const mouseDx = dx / state.isoZoom;
            const mouseDy = dy / state.isoZoom;

            // ── 1) DRAGGED PIPE'IN AKSEN YÖNÜNÜ HESAPLA ──
            // Pipe orijinal iso konumlarına göre normalize edilmiş yön vektörü.
            // (Sürükleme sırasında pipe her zaman bu eksen üzerinde kalır.)
            const dpStart = toIso(draggedPipe.p1.x, draggedPipe.p1.y, draggedPipe.p1.z || 0);
            const dpEnd = toIso(draggedPipe.p2.x, draggedPipe.p2.y, draggedPipe.p2.z || 0);
            const axisX = dpEnd.isoX - dpStart.isoX;
            const axisY = dpEnd.isoY - dpStart.isoY;
            const axisLen = Math.hypot(axisX, axisY);
            if (axisLen < 0.001) {
                setState({ isoPanStart: { x: e.clientX, y: e.clientY } });
                return;
            }
            const nx = axisX / axisLen;
            const ny = axisY / axisLen;

            // ── 2) MOUSE HAREKETİNİ EKSENE PROJECT ET ──
            const proj = mouseDx * nx + mouseDy * ny;
            const offsetX = proj * nx;
            const offsetY = proj * ny;

            // ── 3) DRAGGED PIPE'IN UCUNU MIN-LENGTH + FLIP KONTROLÜYLE OYNAT ──
            const prevDp = state.isoPipeOffsets[draggedPipe.id] || {};
            const testS = {
                x: dpStart.isoX + (prevDp.startDx || 0),
                y: dpStart.isoY + (prevDp.startDy || 0),
            };
            const testE = {
                x: dpEnd.isoX + (prevDp.endDx || 0),
                y: dpEnd.isoY + (prevDp.endDy || 0),
            };
            if (draggedEndpoint === 'start') { testS.x += offsetX; testS.y += offsetY; }
            else                              { testE.x += offsetX; testE.y += offsetY; }

            const newLen = Math.hypot(testE.x - testS.x, testE.y - testS.y);
            const minLen = axisLen * 0.1;

            // Flip kontrolü: yeni vektör orijinal vektörle aynı yönde olmalı
            const origVx = (draggedEndpoint === 'end') ? axisX : -axisX;
            const origVy = (draggedEndpoint === 'end') ? axisY : -axisY;
            const newVx = (draggedEndpoint === 'end') ? (testE.x - testS.x) : (testS.x - testE.x);
            const newVy = (draggedEndpoint === 'end') ? (testE.y - testS.y) : (testS.y - testE.y);
            const dot = origVx * newVx + origVy * newVy;

            // İptal kuralları (min uzunluk altı VEYA yön ters) — yine de isoPanStart'ı
            // güncelle ki kullanıcı min'e gelince geri açabilsin (eski bug fix).
            if (newLen < minLen || dot <= 0) {
                setState({ isoPanStart: { x: e.clientX, y: e.clientY } });
                return;
            }

            // ── 4) ETKİ ALANINI UYGULA — SPATIAL BFS ──
            // Sürüklenen uç + bu uçla aynı dünya pozisyonunda buluşan endpoint'ler
            // ve onların bağlantıları zincirleme dolaşılır. hierarchy'ye bağımlı değil,
            // sadece world coords üzerinden iz sürer.
            //   - draggedPipe: SADECE sürüklenen uç hareket eder (axis korunur)
            //   - Diğer pipe'lar: p1'i junction'da olan → her iki ucu birden ötelenir
            //     (subtree downstream takip eder); p2'si junction'da olan → sadece p2
            const newOffsets = { ...state.isoPipeOffsets };
            const newCompOffsets = { ...state.isoComponentOffsets };
            const processed = new Set();
            const processedComps = new Set();
            const TOL_3D = 5; // cm — pipe-pipe junction toleransı

            const applyOffset = (pipeId, which, dx2, dy2) => {
                const prev = newOffsets[pipeId] || {};
                newOffsets[pipeId] = {
                    ...prev,
                    [which + 'Dx']: (prev[which + 'Dx'] || 0) + dx2,
                    [which + 'Dy']: (prev[which + 'Dy'] || 0) + dy2,
                };
            };
            const applyCompOffset = (compId, dx2, dy2) => {
                const prev = newCompOffsets[compId] || {};
                newCompOffsets[compId] = {
                    dx: (prev.dx || 0) + dx2,
                    dy: (prev.dy || 0) + dy2,
                };
            };

            // ── EXPLICIT KOMPONENT-PİPE BAĞLANTI INDEKSİ ──
            // Cihaz/sayaç fleks ile bağlı, koordinatlar tam eşleşmediği için spatial
            // değil EXPLICIT pointer ile gez:
            //   pipeId → [{ compId, atEndpoint, otherSidePipeId, otherSideEndpoint }]
            const epStr = (ep) => (ep === 'p2' || ep === 'end') ? 'end' : 'start';
            const compsByPipe = new Map();
            const addLink = (pipeId, link) => {
                if (!pipeId) return;
                if (!compsByPipe.has(pipeId)) compsByPipe.set(pipeId, []);
                compsByPipe.get(pipeId).push(link);
            };
            (plumbingManager.components || []).forEach(comp => {
                if (comp.type === 'sayac') {
                    const inletPipe = comp.fleksBaglanti?.boruId || null;
                    const inletEp = epStr(comp.fleksBaglanti?.endpoint);
                    const outletPipe = comp.cikisBagliBoruId || null;
                    const outletEp = 'start';
                    if (inletPipe) addLink(inletPipe, {
                        compId: comp.id, atEndpoint: inletEp,
                        otherSidePipeId: outletPipe, otherSideEndpoint: outletEp,
                    });
                    if (outletPipe) addLink(outletPipe, {
                        compId: comp.id, atEndpoint: outletEp,
                        otherSidePipeId: inletPipe, otherSideEndpoint: inletEp,
                    });
                } else if (comp.type === 'cihaz') {
                    const inletPipe = comp.fleksBaglanti?.boruId || null;
                    const inletEp = epStr(comp.fleksBaglanti?.endpoint);
                    if (inletPipe) addLink(inletPipe, {
                        compId: comp.id, atEndpoint: inletEp,
                        otherSidePipeId: null,
                    });
                } else if (comp.type === 'servis_kutusu') {
                    const outletPipe = comp.bagliBoruId || null;
                    if (outletPipe) addLink(outletPipe, {
                        compId: comp.id, atEndpoint: 'start',
                        otherSidePipeId: null,
                    });
                }
            });

            const pipeById = new Map(plumbingManager.pipes.map(p => [p.id, p]));
            const queue = [{ pipeId: draggedPipe.id, endpoint: draggedEndpoint }];

            // Bir pipe endpoint'ten propagation tetikler (junction veya component bridge)
            const enqueuePipeEndpoint = (pipeId, endpoint) => {
                if (!pipeId || !endpoint) return;
                const k = pipeId + '|' + endpoint;
                if (!processed.has(k)) queue.push({ pipeId, endpoint });
                // start'a girersek (downstream), 'end'i de ekle ki boru wholly translate olsun
                if (endpoint === 'start' && pipeId !== draggedPipe.id) {
                    const k2 = pipeId + '|end';
                    if (!processed.has(k2)) queue.push({ pipeId, endpoint: 'end' });
                }
            };

            while (queue.length > 0) {
                const { pipeId, endpoint } = queue.shift();
                const key = pipeId + '|' + endpoint;
                if (processed.has(key)) continue;
                processed.add(key);

                applyOffset(pipeId, endpoint, offsetX, offsetY);

                const pipe = pipeById.get(pipeId);
                if (!pipe || !pipe.p1 || !pipe.p2) continue;
                const ep = endpoint === 'start' ? pipe.p1 : pipe.p2;
                const W = { x: ep.x, y: ep.y, z: ep.z || 0 };

                // (1) Pipe-pipe junction — spatial eşleşme
                plumbingManager.pipes.forEach(other => {
                    if (!other.p1 || !other.p2) return;
                    const d1 = Math.hypot(other.p1.x - W.x, other.p1.y - W.y, (other.p1.z || 0) - W.z);
                    const d2 = Math.hypot(other.p2.x - W.x, other.p2.y - W.y, (other.p2.z || 0) - W.z);
                    if (d1 < TOL_3D) {
                        enqueuePipeEndpoint(other.id, 'start');
                    }
                    if (d2 < TOL_3D) {
                        const k = other.id + '|end';
                        if (!processed.has(k)) queue.push({ pipeId: other.id, endpoint: 'end' });
                    }
                });

                // (2) Komponent köprüsü — EXPLICIT bağlantı (sayaç giriş↔çıkış, cihaz, kutu)
                const links = compsByPipe.get(pipeId) || [];
                links.forEach(link => {
                    if (link.atEndpoint !== endpoint) return;
                    if (processedComps.has(link.compId)) return;
                    processedComps.add(link.compId);
                    applyCompOffset(link.compId, offsetX, offsetY);
                    if (link.otherSidePipeId && link.otherSideEndpoint) {
                        enqueuePipeEndpoint(link.otherSidePipeId, link.otherSideEndpoint);
                    }
                });
            }

            setState({
                isoPipeOffsets: newOffsets,
                isoComponentOffsets: newCompOffsets,
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
                isoDraggedEndpointWorld: null,
            });
            saveState(); // İso uç sürüklemesi undo'ya dahil olsun
        }
        if (state.isoLabelDragging) {
            setState({
                isoLabelDragging: false,
                isoDraggedLabelId: null,
                isoDraggedLabelStyle: null,
                isoDraggedLabelSize: null,
                isoLabelGrab: null,
                isoDraggedLabelObjPos: null,
            });
            saveState(); // İso etiket taşıma da undo'ya dahil
        }
    };

    dom.cIso.addEventListener('mouseup', stopInteraction);
    dom.cIso.addEventListener('mouseleave', stopInteraction);

    // Sağ tık menüsü — orjinal boyuta sıfırla / etiketleri yeniden yerleştir
    dom.cIso.addEventListener('contextmenu', (e) => {
        if (!dom.mainContainer.classList.contains('show-iso')) return;
        e.preventDefault();
        const menu = document.getElementById('iso-context-menu');
        if (!menu) return;
        // Önce göster ki boyutunu ölçebilelim
        menu.style.display = 'block';
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const mw = menu.offsetWidth || 240;
        const mh = menu.offsetHeight || 80;
        // %90 kuralı — viewport orta %90'ında kalmalı, her kenardan %5 boşluk.
        const marginX = Math.max(8, Math.round(vw * 0.05));
        const marginY = Math.max(8, Math.round(vh * 0.05));
        let left = e.clientX;
        let top = e.clientY;
        if (left + mw > vw - marginX) left = vw - mw - marginX;
        if (top + mh > vh - marginY) top = vh - mh - marginY;
        if (left < marginX) left = marginX;
        if (top < marginY) top = marginY;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
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
    const activeBtn = document.getElementById(`split - ${ratio} `);
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
        //closePropertiesPanel(); // 3D açılınca özellikler paneli otomatik kapansın

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
let isIsoResizing = false;

function onSplitterPointerDown(e) { isResizing = true; dom.p2d.style.pointerEvents = 'none'; dom.p3d.style.pointerEvents = 'none'; document.body.style.cursor = 'col-resize'; window.addEventListener('pointermove', onSplitterPointerMove); window.addEventListener('pointerup', onSplitterPointerUp); }
function onSplitterPointerMove(e) {
    if (!isResizing) return;

    const mainRect = dom.mainContainer.getBoundingClientRect();
    const p2dPanel = document.getElementById('p2d');
    const p3dPanel = document.getElementById('p3d');
    const splitterW = dom.splitter.offsetWidth;

    let p2dWidth = e.clientX - mainRect.left;

    const min2DWidth = 0;
    const min3DWidth = 150;
    if (p2dWidth < min2DWidth) p2dWidth = min2DWidth;
    const max2DWidth = mainRect.width - min3DWidth - splitterW;
    if (p2dWidth > max2DWidth) p2dWidth = max2DWidth;

    const p3dWidth = mainRect.width - p2dWidth - splitterW;

    // Tam mouse senkronu için: bir taraf sabit basis, diğer taraf "kalanı doldur"
    p2dPanel.style.flex = `0 0 ${p2dWidth}px`;
    p3dPanel.style.flex = `1 1 auto`;

    resize();
}
function onSplitterPointerUp() { isResizing = false; dom.p2d.style.pointerEvents = 'auto'; dom.p3d.style.pointerEvents = 'auto'; document.body.style.cursor = 'default'; window.removeEventListener('pointermove', onSplitterPointerMove); window.removeEventListener('pointerup', onSplitterPointerUp); }

// İzometri Splitter fonksiyonları
function onIsoSplitterPointerDown(e) {
    isIsoResizing = true;
    dom.p2d.style.pointerEvents = 'none';
    dom.pIso.style.pointerEvents = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onIsoSplitterPointerMove);
    window.addEventListener('pointerup', onIsoSplitterPointerUp);
}

function onIsoSplitterPointerMove(e) {
    if (!isIsoResizing) return;

    const mainRect = dom.mainContainer.getBoundingClientRect();
    const p2dPanel = document.getElementById('p2d');
    const pIsoPanel = document.getElementById('pIso');
    const splitterW = dom.isoSplitter.offsetWidth;

    let p2dWidth = e.clientX - mainRect.left;

    const min2DWidth = 150;
    const minIsoWidth = 150;
    if (p2dWidth < min2DWidth) p2dWidth = min2DWidth;
    const max2DWidth = mainRect.width - minIsoWidth - splitterW;
    if (p2dWidth > max2DWidth) p2dWidth = max2DWidth;

    p2dPanel.style.flex = `0 0 ${p2dWidth}px`;
    pIsoPanel.style.flex = `1 1 auto`;

    resize();
    resizeIsoCanvas();
    drawIsoView();
}

function onIsoSplitterPointerUp() {
    isIsoResizing = false;
    dom.p2d.style.pointerEvents = 'auto';
    dom.pIso.style.pointerEvents = 'auto';
    document.body.style.cursor = 'default';
    window.removeEventListener('pointermove', onIsoSplitterPointerMove);
    window.removeEventListener('pointerup', onIsoSplitterPointerUp);
}

// 3D Perspektif Splitter (sürükleyerek panel oranını değiştir)
let isPerspResizing = false;
function onPerspSplitterPointerDown(e) {
    isPerspResizing = true;
    dom.p2d.style.pointerEvents = 'none';
    dom.pPersp.style.pointerEvents = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onPerspSplitterPointerMove);
    window.addEventListener('pointerup', onPerspSplitterPointerUp);
}

function onPerspSplitterPointerMove(e) {
    if (!isPerspResizing) return;
    const mainRect = dom.mainContainer.getBoundingClientRect();
    const p2dPanel = document.getElementById('p2d');
    const pPerspPanel = document.getElementById('pPersp');
    const splitterW = dom.perspSplitter ? dom.perspSplitter.offsetWidth : 4;
    let p2dWidth = e.clientX - mainRect.left;
    const minSide = 100;
    const max2DWidth = mainRect.width - minSide - splitterW;
    if (p2dWidth < minSide) p2dWidth = minSide;
    if (p2dWidth > max2DWidth) p2dWidth = max2DWidth;
    p2dPanel.style.flex = `0 0 ${p2dWidth}px`;
    pPerspPanel.style.flex = `1 1 auto`;
    // Preset ratio butonlarının aktif durumunu temizle (kullanıcı manuel sürüklüyor).
    document.querySelectorAll('#persp-ratio-buttons .split-btn').forEach(b => b.classList.remove('active'));
    // Son kullanıcı genişliğini kaydet.
    _capturePerspFlex();
    resize();
    import('../draw/draw-persp.js').then(m => m.syncMainToPersp()).catch(() => {});
}

function onPerspSplitterPointerUp() {
    isPerspResizing = false;
    dom.p2d.style.pointerEvents = 'auto';
    dom.pPersp.style.pointerEvents = 'auto';
    document.body.style.cursor = 'default';
    window.removeEventListener('pointermove', onPerspSplitterPointerMove);
    window.removeEventListener('pointerup', onPerspSplitterPointerUp);
    // Splitter sürükleme bitti: 2D + 3D %80 sığdırma.
    _fitPerspAndMainTo80();
}


// Duvar boyutlandırma fonksiyonu
function resizeWall(wall, newLengthCm, stationaryPointHandle) {
    if (!wall || isNaN(newLengthCm) || newLengthCm <= 0) return;
    const stationaryPoint = wall[stationaryPointHandle];
    const movingPointHandle = stationaryPointHandle === "p1" ? "p2" : "p1";
    const movingPoint = wall[movingPointHandle];
    if (!stationaryPoint || !movingPoint) return;
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
    if (selectedObject.type === "wall") { const wall = selectedObject.object; if (!wall.p1 || !wall.p2) return; midX = (wall.p1.x + wall.p2.x) / 2; midY = (wall.p1.y + wall.p2.y) / 2; }
    else if (selectedObject.type === "door" || selectedObject.type === "window") { const item = selectedObject.object; const wall = (selectedObject.type === 'door') ? item.wall : selectedObject.wall; if (!wall || !wall.p1 || !wall.p2) return; const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return; const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen; midX = wall.p1.x + dx * item.pos; midY = wall.p1.y + dy * item.pos; }
    else { return; }
    const screenPos = worldToScreen(midX, midY);
    dom.lengthInput.style.left = `${screenPos.x}px`;
    dom.lengthInput.style.top = `${screenPos.y - 20}px`;
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
            option.textContent = s.name || `Merdiven(${s.id.substring(0, 4)})`;
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

    dom.stairPopup.style.left = `${left} px`;
    dom.stairPopup.style.top = `${top} px`;
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

    // MAIN MENU DROPDOWN LOGIC
    const mainMenuBtn = document.getElementById('mainMenuBtn');
    const mainMenuContent = document.getElementById('mainMenuContent');

    if (mainMenuBtn && mainMenuContent) {
        mainMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mainMenuBtn.parentElement.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.main-dropdown')) {
                const dropdowns = document.querySelectorAll('.main-dropdown.show');
                dropdowns.forEach(d => d.classList.remove('show'));
            }
        });
    }

    // Geri Al İşlemi (Ctrl + Z)
    document.getElementById('menuUndo')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');
        undo();
        draw2D();
        if (dom.mainContainer.classList.contains('show-3d')) update3DScene();
    });

    // İleri Al İşlemi (Ctrl + Y)
    document.getElementById('menuRedo')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');
        redo();
        draw2D();
        if (dom.mainContainer.classList.contains('show-3d')) update3DScene();
    });
    // SİLME İŞLEMİ (Menüden tetiklenir)
    document.getElementById('menuDelete')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');
        document.getElementById('bDelete')?.click(); // Gizli orijinal silme butonunu tetikler
    });

    // Kaydet İşlemi (Üzerine yaz / update et)
    document.getElementById('menuSave')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');

        const projectNameInput = document.getElementById('projectNameInput');
        const projectName = projectNameInput ? projectNameInput.value.trim() : 'Ahmet Akbayir';

        window.currentProjectName = projectName; // Dosya I/O tarafının kullanması için
        window.saveAsNewFile = false; // Farklı kaydetme, update et

        document.getElementById('bSave')?.click();
    });

    // Farklı Kaydet İşlemi (Yeni isimle oluştur)
    document.getElementById('menuSaveAs')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');

        const projectNameInput = document.getElementById('projectNameInput');
        const currentName = projectNameInput ? projectNameInput.value.trim() : 'Ahmet Akbayir';

        const newName = prompt("Farklı Kaydet - Yeni Proje Adını Girin:", currentName);
        if (newName && newName.trim() !== "") {
            if (projectNameInput) projectNameInput.value = newName.trim();
            document.title = `${newName.trim()} - AangCAD`;
            window.currentProjectName = newName.trim();
            window.saveAsNewFile = true; // Yeni bir kopya oluştur (save as)

            document.getElementById('bSave')?.click();
        }
    });

    // Aç İşlemi
    document.getElementById('menuOpen')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');
        document.getElementById('bOpen')?.click();
    });


    // --- YENİ: DOSYA AÇILDIĞINDA PROJE ADINI GÜNCELLEME ---
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                // Dosya adını al ve uzantısını (.json veya .xml) temizle
                const fileName = file.name.replace(/\.[^/.]+$/, "");
                
                const projectNameInput = document.getElementById('projectNameInput');
                if (projectNameInput) {
                    projectNameInput.value = fileName;
                    // Global durumu ve sekme başlığını da güncelle
                    window.currentProjectName = fileName;
                    document.title = `${fileName} - AangCAD`;
                }
            }
        });
    }

    // =================================================================
    // KLAVYE KISAYOLLARI (TARAYICIYI EZME)
    // =================================================================
    document.addEventListener('keydown', (e) => {
        // Ctrl + S (veya Mac için Cmd + S) yakalama
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault(); // Tarayıcının varsayılan sayfa kaydetmesini ENGELLER
            
            if (e.shiftKey) {
                // Ctrl + Shift + S -> Farklı Kaydet'i tetikle
                document.getElementById('menuSaveAs')?.click();
            } else {
                // Sadece Ctrl + S -> Normal Kaydet'i tetikle
                document.getElementById('menuSave')?.click();
            }
        }
    });

    // --- PROJE ADI DÜZENLEME MANTIĞI ---
    const projectNameInput = document.getElementById('projectNameInput');
    if (projectNameInput) {
        projectNameInput.addEventListener('change', (e) => {
            const newName = e.target.value.trim() || "Ahmet Akbayir";
            e.target.value = newName; // Boş bırakılırsa varsayılan ile geri doldur
            document.title = `${newName}`; // Tarayıcı sekme adını da güncelle
            window.currentProjectName = newName; // Sistem için kaydet
        });

        // Enter tuşuna basıldığında odaktan çık
        projectNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                projectNameInput.blur();
            }
        });
    }

    // DARK MODE TOGGLE
    dom.darkModeToggle.addEventListener("change", toggleDarkMode);

    dom.borderPicker.addEventListener("input", (e) => setState({ wallBorderColor: e.target.value }));
    dom.roomPicker.addEventListener("input", (e) => setState({ roomFillColor: e.target.value }));
    dom.lineThicknessInput.addEventListener("input", (e) => { const value = parseFloat(e.target.value); if (!isNaN(value)) setState({ lineThickness: value }); });
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
    dom.roomNameSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } else if (e.key === 'Escape') { e.preventDefault(); hideRoomNamePopup(); } });
    dom.roomNameInput.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); dom.roomNameSelect.focus(); } else if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } else if (e.key === 'Escape') { e.preventDefault(); hideRoomNamePopup(); } });
    if (dom.roomDescriptionInput) {
        dom.roomDescriptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); hideRoomNamePopup(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmRoomNameChange(); }
            else { e.stopPropagation(); }
        });
        dom.roomDescriptionInput.addEventListener('input', (e) => {
            if (state.roomToEdit) {
                state.roomToEdit.description = e.target.value;
            }
        });
    }
    dom.splitter.addEventListener('pointerdown', onSplitterPointerDown);
    dom.isoSplitter.addEventListener('pointerdown', onIsoSplitterPointerDown);
    if (dom.perspSplitter) {
        dom.perspSplitter.addEventListener('pointerdown', onPerspSplitterPointerDown);
    }
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
            if (connectedStair) currentBottomElev = connectedStair.topElevation || 0;
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

    // 3D PERSPEKTİF (TESİSAT) BUTONU LISTENER'I — Katı Model / İzometri ile aynı patern
    if (dom.bPersp) {
        dom.bPersp.addEventListener('click', () => {
            togglePerspView();
        });
    }
    // Ratio butonları (25/50/75/100) — orta değer için splitter sürüklenir
    document.querySelectorAll('#persp-ratio-buttons .split-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ratio = parseInt(btn.getAttribute('data-ratio'), 10);
            if (!isNaN(ratio)) setPerspRatio(ratio);
        });
    });
    const perspReset = document.getElementById('persp-reset');
    if (perspReset) {
        perspReset.addEventListener('click', () => {
            fitDrawingToPerspectiveScreen();
        });
    }

    // 3D PERSPEKTİF GÖRÜNÜM BUTONU LISTENER'I
    if (dom.b3DPerspective) {
        dom.b3DPerspective.addEventListener('change', (e) => {
            // Eğer checkbox durumu state ile uyuş নির্ভরযোগ্যsa fonksiyonu tetikle
            if (e.target.checked !== state.is3DPerspectiveActive) {
                toggle3DPerspective();
            }
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

    // İZOMETRİ "EKRANA SIĞDIR" BUTONU — sadece zoom/pan'i fit eder, sürükleme
    // offset'lerini silmez. Sıfırlama sağ tık menüsünden yapılır.
    const isoResetBtn = document.getElementById('iso-reset');
    if (isoResetBtn) {
        isoResetBtn.addEventListener('click', () => {
            fitIsoToScreen();
        });
    }

    // İZOMETRİ SAĞ TIK MENÜSÜ — orjinal boyuta sıfırla / etiketleri yeniden yerleştir
    const isoCtxMenu = document.getElementById('iso-context-menu');
    const isoCtxReset = document.getElementById('iso-ctx-reset');
    const isoCtxRelayout = document.getElementById('iso-ctx-relayout');
    const hideIsoCtxMenu = () => { if (isoCtxMenu) isoCtxMenu.style.display = 'none'; };
    if (isoCtxMenu && isoCtxReset && isoCtxRelayout) {
        isoCtxReset.addEventListener('click', () => {
            hideIsoCtxMenu();
            resetIsometricView();
        });
        isoCtxRelayout.addEventListener('click', () => {
            hideIsoCtxMenu();
            if (!plumbingManager) return;
            const toast = document.getElementById('label-relayout-toast');
            const toastText = document.getElementById('label-relayout-toast-text');
            if (toast && toastText) {
                toastText.textContent = 'İzo etiketleri yerleştiriliyor…';
                toast.style.display = 'flex';
            }
            try {
                const { pipeOffsets, labelOffsets } = relayoutIsoLabels(plumbingManager);
                setState({
                    isoPipeOffsets: pipeOffsets,
                    isoLabelOffsets: labelOffsets,
                });
                drawIsoView();
            } finally {
                if (toast) setTimeout(() => { toast.style.display = 'none'; }, 600);
            }
        });
        // Dışarıya tıklayınca veya ESC ile kapat
        document.addEventListener('mousedown', (e) => {
            if (isoCtxMenu.style.display === 'block' && !isoCtxMenu.contains(e.target)) {
                hideIsoCtxMenu();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideIsoCtxMenu();
        });
    }

    // İZOMETRİ RENK MODU (Topoloji / Çap)
    const isoColorBtns = [
        document.getElementById('iso-color-topology'),
        document.getElementById('iso-color-diameter'),
    ].filter(Boolean);
    const syncIsoColorBtns = () => {
        isoColorBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.colorMode === state.isometricColorMode);
        });
    };
    syncIsoColorBtns();
    isoColorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.colorMode;
            if (state.isometricColorMode === mode) return;
            setState({ isometricColorMode: mode });
            syncIsoColorBtns();
            drawIsoView();
        });
    });

    // İZOMETRİ ETİKETLERİ YERLEŞTİR + YOĞUN HATLARI ÖLÇEKLE
    const isoRelayoutBtn = document.getElementById('iso-relayout');
    if (isoRelayoutBtn) {
        isoRelayoutBtn.addEventListener('click', () => {
            if (!plumbingManager) return;
            const toast = document.getElementById('label-relayout-toast');
            const toastText = document.getElementById('label-relayout-toast-text');
            if (toast && toastText) {
                toastText.textContent = 'İzo etiketleri yerleştiriliyor…';
                toast.style.display = 'flex';
            }
            try {
                const { pipeOffsets, labelOffsets } = relayoutIsoLabels(plumbingManager);
                setState({
                    isoPipeOffsets: pipeOffsets,
                    isoLabelOffsets: labelOffsets,
                });
                drawIsoView();
            } finally {
                if (toast) setTimeout(() => { toast.style.display = 'none'; }, 600);
            }
        });
    }

    setupVisibilityPanel();
}

function setupVisibilityPanel() {
    const ids = {
        z: 'vis-chk-z',
        archDim: 'vis-chk-arch-dim',
        plumbDim: 'vis-chk-plumb-dim',
        room: 'vis-chk-room',
        shadow: 'vis-chk-shadow',
        axis: 'vis-chk-axis',
        pipeFrame: 'vis-chk-pipe-frame',
        path: 'vis-chk-path',
        junctions: 'vis-chk-junctions',
        arch: 'vis-chk-arch',
        plumbing: 'vis-chk-plumbing',
        objLabels: 'vis-chk-obj-labels',
        birim: 'vis-chk-birim',
        hideOtherFloors3D: 'vis-chk-hide-other-floors-3d'
    };

    // State'i güncelle ve sahneyi yeniden çiz
    const updateVisibility = (key, value) => {
        state.tempVisibility[key] = value;

        // Yeniden çizim tetikle
        draw2D();
        if (dom.mainContainer.classList.contains('show-3d')) {
            update3DScene();
        }
        if (dom.mainContainer.classList.contains('show-iso')) {
            // İzometrik görünümü yeniden çiz (gerekirse parametreleri state'ten al)
            const canvas = document.getElementById('cIso');
            const ctx = canvas.getContext('2d');
            renderIsometric(ctx, canvas.width, canvas.height, state.isoZoom, state.isoPanOffset);
        }
    };

    // Checkbox Listener'ları
    document.getElementById(ids.z)?.addEventListener('change', (e) => updateVisibility('showZElevation', e.target.checked));
    document.getElementById(ids.archDim)?.addEventListener('change', (e) => updateVisibility('showArchDimensions', e.target.checked));
    document.getElementById(ids.plumbDim)?.addEventListener('change', (e) => updateVisibility('showPlumbingDimensions', e.target.checked));
    document.getElementById(ids.room)?.addEventListener('change', (e) => updateVisibility('showRoomNames', e.target.checked));
    document.getElementById(ids.shadow)?.addEventListener('change', (e) => updateVisibility('showPipeShadows', e.target.checked));
    document.getElementById(ids.axis)?.addEventListener('change', (e) => updateVisibility('show3DAxis', e.target.checked));
    document.getElementById(ids.pipeFrame)?.addEventListener('change', (e) => updateVisibility('show3DPipeFrame', e.target.checked));
    document.getElementById(ids.path)?.addEventListener('change', (e) => updateVisibility('showPipePath', e.target.checked));
    document.getElementById(ids.junctions)?.addEventListener('change', (e) => updateVisibility('showJunctionNodes', e.target.checked));
    document.getElementById(ids.arch)?.addEventListener('change', (e) => updateVisibility('showArchitecture', e.target.checked));
    document.getElementById(ids.plumbing)?.addEventListener('change', (e) => updateVisibility('showPlumbing', e.target.checked));
    document.getElementById(ids.objLabels)?.addEventListener('change', (e) => updateVisibility('showObjectLabels', e.target.checked));
    document.getElementById(ids.birim)?.addEventListener('change', (e) => updateVisibility('showBirimBoundaries', e.target.checked));
    document.getElementById(ids.hideOtherFloors3D)?.addEventListener('change', (e) => updateVisibility('hideOtherFloors3D', e.target.checked));
    // Hepsini Göster
    document.getElementById('vis-btn-show-all')?.addEventListener('click', () => {
        Object.values(ids).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = true;
                el.dispatchEvent(new Event('change')); // Change eventini tetikle
            }
        });
    });

    // Hepsini Gizle
    document.getElementById('vis-btn-hide-all')?.addEventListener('click', () => {
        Object.values(ids).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = false;
                el.dispatchEvent(new Event('change'));
            }
        });
    });

    // Başlangıç değerlerini state'ten yükle (eğer daha önce set edildiyse)
    Object.keys(ids).forEach(key => {
        const stateKeyMap = {
            'vis-chk-z': 'showZElevation',
            'vis-chk-arch-dim': 'showArchDimensions',
            'vis-chk-plumb-dim': 'showPlumbingDimensions',
            'vis-chk-room': 'showRoomNames',
            'vis-chk-shadow': 'showPipeShadows',
            'vis-chk-axis': 'show3DAxis',
            'vis-chk-pipe-frame': 'show3DPipeFrame',
            'vis-chk-path': 'showPipePath',
            'vis-chk-junctions': 'showJunctionNodes',
            'vis-chk-arch': 'showArchitecture',
            'vis-chk-plumbing': 'showPlumbing',
            'vis-chk-obj-labels': 'showObjectLabels',
            'vis-chk-birim': 'showBirimBoundaries',
            'vis-chk-hide-other-floors-3d': 'hideOtherFloors3D'
        };
        const elId = ids[key];
        const stateKey = stateKeyMap[elId];
        const el = document.getElementById(elId);
        if (el && state.tempVisibility) {
            el.checked = state.tempVisibility[stateKey];
        }
    });
}
// --- setupUIListeners Sonu ---

/**
 * İzometri içeriğinin bounding box'ını hesaplayıp ekrana sığdırır.
 * isoZoom + isoPanOffset'i çizimi merkezleyecek ve canvas'a oturtacak şekilde ayarlar.
 */
export function fitIsoToScreen() {
    if (!dom.mainContainer.classList.contains('show-iso')) return;
    if (!plumbingManager) return;
    const canvas = dom.cIso;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    const PADDING = 40;
    const FIT_FILL = 0.9;

    let minIsoX = Infinity, minIsoY = Infinity, maxIsoX = -Infinity, maxIsoY = -Infinity;
    let hasContent = false;

    const include = (x, y, z = 0) => {
        const iso = toIsometric(x, y, z);
        if (iso.isoX < minIsoX) minIsoX = iso.isoX;
        if (iso.isoY < minIsoY) minIsoY = iso.isoY;
        if (iso.isoX > maxIsoX) maxIsoX = iso.isoX;
        if (iso.isoY > maxIsoY) maxIsoY = iso.isoY;
        hasContent = true;
    };

    // Kullanıcının manuel sürüklemelerini (isoPipeOffsets, isoComponentOffsets)
    // dikkate al — fit, ekranda HALEN gördüğü düzene göre yapılmalı, orijinaline
    // değil. createIsoProxyManager bu offset'leri uygulayıp proxy pozisyonlar üretir.
    const proxy = createIsoProxyManager(plumbingManager);
    (proxy.pipes || []).forEach(p => {
        if (p.p1) include(p.p1.x, p.p1.y, p.p1.z || 0);
        if (p.p2) include(p.p2.x, p.p2.y, p.p2.z || 0);
    });
    (proxy.components || []).forEach(c => {
        if (c.x != null && c.y != null) include(c.x, c.y, c.z || 0);
    });

    if (!hasContent || !isFinite(minIsoX) || !isFinite(maxIsoX)) {
        setState({ isoZoom: 1, isoPanOffset: { x: 0, y: 0 } });
        drawIsoView();
        return;
    }

    const isoWidth = Math.max(maxIsoX - minIsoX, 1);
    const isoHeight = Math.max(maxIsoY - minIsoY, 1);
    const availW = Math.max(canvas.width - 2 * PADDING, 1);
    const availH = Math.max(canvas.height - 2 * PADDING, 1);

    const newZoom = Math.max(0.1, Math.min(5, Math.min(availW / isoWidth, availH / isoHeight) * FIT_FILL));

    const isoCenterX = (minIsoX + maxIsoX) / 2;
    const isoCenterY = (minIsoY + maxIsoY) / 2;

    setState({
        isoZoom: newZoom,
        isoPanOffset: {
            x: -isoCenterX * newZoom,
            y: -isoCenterY * newZoom,
        },
    });
    drawIsoView();
}

/**
 * İzometrik görünümü orijinal boyutlara sıfırlar ve ekrana sığdırır.
 */
export function resetIsometricView() {
    setState({
        isoPipeOffsets: {},
        isoComponentOffsets: {},
        isoLabelOffsets: {},
    });
    fitIsoToScreen();
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
                const slider = document.getElementById(`opacity - ${type} `);
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
        const slider = document.getElementById(`opacity - ${type} `);
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