// ui.js
// Son Güncelleme: Merdiven popup Tamam butonu düzeltmesi, kot mantığı ve sahanlık seçildiğinde korkuluk pasifleştirme.
import { state, setState, dom, resize, MAHAL_LISTESI, WALL_HEIGHT } from './main.js';
import { saveState } from './history.js';
import { update3DScene } from './scene3d.js';
import { applyStretchModification } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { worldToScreen } from './geometry.js';
import { getMinWallLength } from './actions.js';
import { isSpaceForDoor } from './door-handler.js';
import { isSpaceForWindow } from './window-handler.js';
import { findAvailableSegmentAt } from './wall-item-utils.js';
// updateConnectedStairElevations import edildiğinden emin olun:
import { recalculateStepCount, updateConnectedStairElevations } from './stairs.js';

export function initializeSettings() {
    dom.borderPicker.value = state.wallBorderColor;
    dom.roomPicker.value = state.roomFillColor;
    dom.lineThicknessInput.value = state.lineThickness;
    dom.wallThicknessInput.value = state.wallThickness;
    dom.drawingAngleInput.value = state.drawingAngle;
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
}

function openTab(tabName) {
    Object.values(dom.tabPanes).forEach(pane => pane.classList.remove('active'));
    Object.values(dom.tabButtons).forEach(btn => btn.classList.remove('active'));
    dom.tabPanes[tabName].classList.add('active');
    dom.tabButtons[tabName].classList.add('active');
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

export function showRoomNamePopup(room, e) {
    setState({ roomToEdit: room });
    dom.roomNameInput.value = ''; // Input'u temizle
    populateRoomNameList(); // Listeyi doldur

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
    dom.roomNameInput.focus(); // Input alanına odaklan

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
    dom.b3d.classList.toggle('active');
    setTimeout(() => {
        resize();
        if (dom.mainContainer.classList.contains('show-3d')) {
            update3DScene();
        }
    }, 10);
}

// Splitter fonksiyonları
let isResizing = false;
function onSplitterPointerDown(e) { isResizing = true; dom.p2d.style.pointerEvents = 'none'; dom.p3d.style.pointerEvents = 'none'; document.body.style.cursor = 'col-resize'; window.addEventListener('pointermove', onSplitterPointerMove); window.addEventListener('pointerup', onSplitterPointerUp); }
function onSplitterPointerMove(e) { if (!isResizing) return; const mainRect = dom.mainContainer.getBoundingClientRect(); const p2dPanel = document.getElementById('p2d'); const p3dPanel = document.getElementById('p3d'); let p2dWidth = e.clientX - mainRect.left; const minWidth = 150; const maxWidth = mainRect.width / 2; if (p2dWidth < minWidth) p2dWidth = minWidth; if (p2dWidth > mainRect.width - minWidth) p2dWidth = mainRect.width - minWidth; let p3dWidth = mainRect.width - p2dWidth - dom.splitter.offsetWidth - 20; if (p3dWidth > maxWidth) { p3dWidth = maxWidth; p2dWidth = mainRect.width - p3dWidth - dom.splitter.offsetWidth - 20; } p2dPanel.style.flex = `1 1 ${p2dWidth}px`; p3dPanel.style.flex = `1 1 ${p3dWidth}px`; resize(); }
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
    dom.lengthInput.focus();
    if (!initialKey) { setTimeout(() => dom.lengthInput.select(), 0); }
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
    dom.stairShowRailingCheckbox.checked = !stair.isLanding && (stair.showRailing !== undefined ? stair.showRailing : true); // Sahanlıksa default false, değilse true
    dom.stairShowRailingCheckbox.disabled = stair.isLanding; // Sahanlıksa disable
    // --- Korkuluk Checkbox Durumu SONU ---

    // Bağlı merdiven select'ini doldur
    dom.stairConnectedStairSelect.innerHTML = '<option value="">YOK</option>';
    (state.stairs || []).forEach(s => {
        if (s.id !== stair.id) {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = s.name || `Merdiven (${s.id.substring(0, 4)})`;
            option.selected = (stair.connectedStairId === s.id);
            dom.stairConnectedStairSelect.appendChild(option);
        }
    });

    // Alt Kot input'unu etkinleştir/devre dışı bırak
    dom.stairBottomElevationInput.disabled = !!stair.connectedStairId;

    // Sahanlık checkbox durumuna göre Üst Kot input'unu etkinleştir/devre dışı bırak
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

    dom.stairPopup.style.left = `${left}px`;
    dom.stairPopup.style.top = `${top}px`;
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

// --- GÜNCELLENMİŞ confirmStairChange ---
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

        // --- Korkuluk Durumunu Ata ---
        // Sahanlıksa her zaman false, değilse checkbox'ın değeri
        stair.showRailing = !stair.isLanding && dom.stairShowRailingCheckbox.checked;
        // --- Korkuluk Durumu SONU ---

        // Alt kotu ayarla
        let bottomElevation = parseInt(dom.stairBottomElevationInput.value, 10) || 0;
        if (stair.connectedStairId) {
            const connectedStair = (state.stairs || []).find(s => s.id === stair.connectedStairId);
            if (connectedStair) {
                bottomElevation = connectedStair.topElevation || 0; // Bağlı merdivenin üst kotu = bu merdivenin alt kotu
            }
        }
        stair.bottomElevation = bottomElevation;

        // Üst Kot'u ayarla
        const LANDING_THICKNESS = 10;
        if (stair.isLanding) {
            // Sahanlık: Üst kot = Bağlı merdivenin üst kotu (değişmez) VEYA Alt kot + kalınlık
             if (stair.connectedStairId) {
                 const connectedStair = (state.stairs || []).find(s => s.id === stair.connectedStairId);
                 if (connectedStair) {
                     stair.topElevation = connectedStair.topElevation || (stair.bottomElevation + LANDING_THICKNESS);
                 } else { // Bağlantı ID'si var ama merdiven bulunamadıysa (hata durumu)
                      stair.topElevation = stair.bottomElevation + LANDING_THICKNESS;
                 }
             } else { // Bağlantı yoksa
                 stair.topElevation = stair.bottomElevation + LANDING_THICKNESS;
             }
             // Sahanlığın alt kotunu üst kota göre ayarla
             stair.bottomElevation = stair.topElevation - LANDING_THICKNESS;

        } else {
            // Normal Merdiven: Input'taki değeri al veya varsayılanı hesapla
            let topElevationInput = parseInt(dom.stairTopElevationInput.value, 10);
            if (isNaN(topElevationInput)) {
                topElevationInput = stair.bottomElevation + WALL_HEIGHT; // Alt kot + kat yüksekliği
            }
            // Üst kot, alt kottan en az 10cm yüksek olmalı
            stair.topElevation = Math.max(stair.bottomElevation + 10, topElevationInput);
        }

        recalculateStepCount(stair); // Basamak sayısını yeniden hesapla

        // Kot güncellemesini yay (eğer üst kot değiştiyse)
        if (stair.topElevation !== previousTopElevation) {
            // State'i güncelleyerek değişikliği tetikle (eğer state yönetim kütüphanesi kullanılıyorsa önemli)
            setState({ stairs: [...(state.stairs || [])] });
            updateConnectedStairElevations(stair.id); // Değişikliği yay
        }

        saveState(); // Değişiklikleri geçmişe kaydet
        update3DScene(); // 3D sahneyi güncelle

    } catch (error) {
        console.error("confirmStairChange içinde hata oluştu:", error);
    } finally {
        hideStairPopup(); // Her durumda popup'ı kapat
    }
}
// --- confirmStairChange Sonu ---


// --- GÜNCELLENMİŞ setupUIListeners ---
export function setupUIListeners() {
    dom.settingsBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'block'; });
    dom.closeSettingsPopupBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'none'; });
    Object.keys(dom.tabButtons).forEach(key => { dom.tabButtons[key].addEventListener('click', () => openTab(key)); });
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
    dom.roomNameSelect.addEventListener('click', confirmRoomNameChange); // Tek tıklamada da onaylansın
    dom.roomNameSelect.addEventListener('dblclick', confirmRoomNameChange);
    dom.roomNameInput.addEventListener('input', filterRoomNameList);
    dom.roomNameSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } });
    dom.roomNameInput.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); dom.roomNameSelect.focus(); } else if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } });
    dom.splitter.addEventListener('pointerdown', onSplitterPointerDown);
    dom.lengthInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmLengthEdit(); } else if (e.key === "Escape") { cancelLengthEdit(); } });
    dom.lengthInput.addEventListener("blur", cancelLengthEdit); // Odak dışı kalınca da iptal et

    // MERDİVEN POPUP LISTENER'LARI
    dom.confirmStairPopupButton.addEventListener('click', confirmStairChange);
    dom.cancelStairPopupButton.addEventListener('click', hideStairPopup);

    // "Orta Düzlem" checkbox'ı değiştiğinde:
    dom.stairIsLandingCheckbox.addEventListener('change', () => {
        const isLanding = dom.stairIsLandingCheckbox.checked;
        dom.stairTopElevationInput.disabled = isLanding; // Üst kotu pasifleştir/aktifleştir
        dom.stairShowRailingCheckbox.disabled = isLanding; // Korkuluk seçeneğini pasifleştir/aktifleştir

        if (isLanding) {
            // Sahanlık seçildi: Korkuluk işaretini kaldır ve pasifleştir
            dom.stairShowRailingCheckbox.checked = false;
            // Sahanlık üst kotunu, bağlı merdiven varsa onun üst kotuna eşitle (veya alt + kalınlık)
            if (currentEditingStair) { // Hata kontrolü
                 let topElev;
                 if (currentEditingStair.connectedStairId) {
                     const connectedStair = (state.stairs || []).find(s => s.id === currentEditingStair.connectedStairId);
                     topElev = connectedStair ? (connectedStair.topElevation || 0) : (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + 10;
                 } else {
                     topElev = (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + 10;
                 }
                dom.stairTopElevationInput.value = topElev;
            }
        } else {
            // Sahanlık kaldırıldı: Korkuluk seçeneğini aktifleştir ve işaretle
            dom.stairShowRailingCheckbox.disabled = false;
            dom.stairShowRailingCheckbox.checked = true;
            // Üst kot inputunu tekrar normal davranışına bırak (kullanıcı değiştirebilir)
            // İsteğe bağlı: Üst kotu varsayılan değere (örn: alt + WALL_HEIGHT) ayarlayabilirsiniz.
            if (currentEditingStair) {
                 dom.stairTopElevationInput.value = (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + WALL_HEIGHT;
            }
        }
    });

    // "Bağlı Merdiven" select'i değiştiğinde:
    dom.stairConnectedStairSelect.addEventListener('change', () => {
        const selectedId = dom.stairConnectedStairSelect.value;
        let isConnected = false; // Bağlantı durumu
        if (selectedId && currentEditingStair) {
             const connectedStair = (state.stairs || []).find(s => s.id === selectedId);
             if (connectedStair) {
                 dom.stairBottomElevationInput.value = connectedStair.topElevation || 0; // Alt kotu bağlanan merdivenin üst kotuna ayarla
                 isConnected = true;
                 // Eğer sahanlık seçiliyse, üst kotu da güncelle (artık sahanlık üst kotu=bağlı merdiven üst kotu)
                 if (dom.stairIsLandingCheckbox.checked) {
                     dom.stairTopElevationInput.value = connectedStair.topElevation || 0;
                 }
             }
        }
        dom.stairBottomElevationInput.disabled = isConnected; // Alt kot inputunu pasifleştir/aktifleştir
        // Bağlantı kaldırıldıysa ve sahanlıksa, üst kotu alt kota göre tekrar ayarla (kalınlık ekleyerek)
        if (!isConnected && dom.stairIsLandingCheckbox.checked) {
             dom.stairTopElevationInput.value = (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + 10;
        }
    });

    // Alt kot inputu değişirse ve sahanlıksa üst kotu da güncelle
     dom.stairBottomElevationInput.addEventListener('input', () => {
         if (dom.stairIsLandingCheckbox.checked) {
             dom.stairTopElevationInput.value = (parseInt(dom.stairBottomElevationInput.value, 10) || 0) + 10;
         }
     });

    // Merdiven popup inputları için Enter/Escape tuşları
    [dom.stairNameInput, dom.stairBottomElevationInput, dom.stairTopElevationInput, dom.stairWidthEditInput].forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Varsayılan Enter davranışını engelle
                confirmStairChange(); // Değişiklikleri onayla
            } else if (e.key === 'Escape') {
                hideStairPopup(); // Popup'ı kapat
            }
        });
    });
    // MERDİVEN POPUP LISTENER'LARI SONU
}
// --- setupUIListeners Sonu ---