import { state, setState, dom, resize, MAHAL_LISTESI, WALL_THICKNESS } from './main.js'; // WALL_THICKNESS eklendi
import { saveState } from './history.js';
import { update3DScene } from './scene3d.js';
import { applyStretchModification } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { worldToScreen } from './geometry.js';
import { getMinWallLength } from './actions.js';
import { isSpaceForDoor } from './door-handler.js';
import { isSpaceForWindow } from './window-handler.js';
// GEREKLİ İMPORT EKLENDİ
import { findAvailableSegmentAt } from './wall-item-utils.js';


export function initializeSettings() {
    dom.borderPicker.value = state.wallBorderColor;
    dom.roomPicker.value = state.roomFillColor;
    dom.lineThicknessInput.value = state.lineThickness;
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
        dom.roomNameSelect.selectedIndex = 0;
    }
}

function filterRoomNameList() {
    populateRoomNameList(dom.roomNameInput.value);
}

export function showRoomNamePopup(room, e) {
    setState({ roomToEdit: room });
    dom.roomNameInput.value = '';
    populateRoomNameList();

    dom.roomNamePopup.style.left = `${e.clientX + 5}px`;
    dom.roomNamePopup.style.top = `${e.clientY + 5}px`;
    dom.roomNamePopup.style.display = 'block';
    dom.roomNameInput.focus();

    const clickListener = (event) => {
        if (!dom.roomNamePopup.contains(event.target)) hideRoomNamePopup();
    };
    setState({ clickOutsideRoomPopupListener: clickListener });
    setTimeout(() => window.addEventListener('pointerdown', clickListener), 50);
}

function hideRoomNamePopup() {
    dom.roomNamePopup.style.display = 'none';
    if (state.clickOutsideRoomPopupListener) {
        window.removeEventListener('pointerdown', state.clickOutsideRoomPopupListener);
        setState({ clickOutsideRoomPopupListener: null, roomToEdit: null });
    }
}

function confirmRoomNameChange() {
    if (state.roomToEdit && dom.roomNameSelect.value) {
        state.roomToEdit.name = dom.roomNameSelect.value;
        saveState();
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

let isResizing = false;
function onSplitterPointerDown(e) {
    isResizing = true;
    dom.p2d.style.pointerEvents = 'none';
    dom.p3d.style.pointerEvents = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onSplitterPointerMove);
    window.addEventListener('pointerup', onSplitterPointerUp);
}

function onSplitterPointerMove(e) {
    if (!isResizing) return;
    const mainRect = dom.mainContainer.getBoundingClientRect();
    const p2dPanel = document.getElementById('p2d');
    const p3dPanel = document.getElementById('p3d');

    let p2dWidth = e.clientX - mainRect.left;
    const minWidth = 150;
    const maxWidth = mainRect.width / 2;

    if (p2dWidth < minWidth) p2dWidth = minWidth;
    if (p2dWidth > mainRect.width - minWidth) p2dWidth = mainRect.width - minWidth;

    let p3dWidth = mainRect.width - p2dWidth - dom.splitter.offsetWidth - 20;
    if (p3dWidth > maxWidth) {
        p3dWidth = maxWidth;
        p2dWidth = mainRect.width - p3dWidth - dom.splitter.offsetWidth - 20;
    }

    p2dPanel.style.flex = `1 1 ${p2dWidth}px`;
    p3dPanel.style.flex = `1 1 ${p3dWidth}px`;
    resize();
}

function onSplitterPointerUp() {
    isResizing = false;
    dom.p2d.style.pointerEvents = 'auto';
    dom.p3d.style.pointerEvents = 'auto';
    document.body.style.cursor = 'default';
    window.removeEventListener('pointermove', onSplitterPointerMove);
    window.removeEventListener('pointerup', onSplitterPointerUp);
}


function resizeWall(wall, newLengthCm, stationaryPointHandle) {
    if (!wall || isNaN(newLengthCm) || newLengthCm <= 0) return;
    const stationaryPoint = wall[stationaryPointHandle];
    const movingPointHandle = stationaryPointHandle === "p1" ? "p2" : "p1";
    const movingPoint = wall[movingPointHandle];
    const dx = movingPoint.x - stationaryPoint.x;
    const dy = movingPoint.y - stationaryPoint.y;
    const currentLength = Math.hypot(dx, dy);
    if (currentLength < 0.1) return;
    const scale = newLengthCm / currentLength;
    movingPoint.x = stationaryPoint.x + dx * scale;
    movingPoint.y = stationaryPoint.y + dy * scale;
}

export function positionLengthInput() {
    if (!state.selectedObject) return;

    let midX, midY;
    const { selectedObject } = state;

    if (selectedObject.type === "wall") {
        const wall = selectedObject.object;
        midX = (wall.p1.x + wall.p2.x) / 2;
        midY = (wall.p1.y + wall.p2.y) / 2;
    } else if (selectedObject.type === "door" || selectedObject.type === "window") {
        const item = selectedObject.object;
        const wall = (selectedObject.type === 'door') ? item.wall : selectedObject.wall;
        if (!wall || !wall.p1 || !wall.p2) return;

        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) return;

        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        midX = wall.p1.x + dx * item.pos;
        midY = wall.p1.y + dy * item.pos;
    } else {
        return; // Diğer nesne tipleri için gösterme
    }

    const screenPos = worldToScreen(midX, midY);
    dom.lengthInput.style.left = `${screenPos.x}px`;
    dom.lengthInput.style.top = `${screenPos.y - 20}px`;
}

export function startLengthEdit(initialKey = '') {
    if (!state.selectedObject ||
        (state.selectedObject.type !== "wall" &&
         state.selectedObject.type !== "door" &&
         state.selectedObject.type !== "window")) {
        return;
    }

    setState({ isEditingLength: true });
    positionLengthInput();
    dom.lengthInput.style.display = "block";

    let currentValue = '';
    if (state.selectedObject.type === "wall") {
        const wall = state.selectedObject.object;
        const currentLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        currentValue = currentLength.toFixed(0);
    } else { // Kapı veya Pencere
        currentValue = state.selectedObject.object.width.toFixed(0);
    }

    dom.lengthInput.value = initialKey || currentValue;
    dom.lengthInput.focus();
    if (!initialKey) { // Eğer klavyeden basılarak gelinmediyse, mevcut değeri seç
         setTimeout(() => dom.lengthInput.select(), 0);
    }
}

// --- GÜNCELLENDİ: confirmLengthEdit (Çarpma/Bölme eklendi) ---
function confirmLengthEdit() {
    if (!state.selectedObject) return;

    let rawValue = dom.lengthInput.value.trim();
    let reverseDirection = false;
    let operation = null; // '*' veya '/'
    let operand = NaN;
    let newDimensionCm = NaN; // Hesaplanan veya doğrudan girilen yeni boyut

    const { selectedObject } = state;

    // İşlem kontrolü (* veya /)
    const multiplyMatch = rawValue.match(/^(\d+(\.\d+)?)\*$/);
    const divideMatch = rawValue.match(/^(\d+(\.\d+)?)\/$/);

    if (multiplyMatch) {
        operation = '*';
        operand = parseFloat(multiplyMatch[1]);
    } else if (divideMatch) {
        operation = '/';
        operand = parseFloat(divideMatch[1]);
    }

    // Mevcut boyutu al
    let currentDimension = 0;
    if (selectedObject.type === "wall") {
        const wall = selectedObject.object;
        currentDimension = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    } else if (selectedObject.type === "door" || selectedObject.type === "window") {
        currentDimension = selectedObject.object.width;
    }

    // Yeni boyutu hesapla veya parse et
    if (operation && !isNaN(operand) && operand > 0 && currentDimension > 0) {
        if (operation === '*') {
            newDimensionCm = currentDimension * operand;
        } else { // operation === '/'
            newDimensionCm = currentDimension / operand;
        }
    } else {
        // Doğrudan sayı veya "-" ile yön belirtme (duvarlar için)
        if (selectedObject.type === "wall" && rawValue.endsWith("-")) {
            reverseDirection = true;
            rawValue = rawValue.slice(0, -1);
        }
        newDimensionCm = parseFloat(rawValue);
    }

    // --- Boyut ayarlama mantığı (önceki haliyle aynı, sadece newLengthCm yerine newDimensionCm kullanıldı) ---

    if (selectedObject.type === "wall") {
        const wall = selectedObject.object;

        if (newDimensionCm < getMinWallLength(wall)) {
            cancelLengthEdit();
            return;
        }

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
        }
    } else if (selectedObject.type === "door" || selectedObject.type === "window") {
        const item = selectedObject.object;
        const wall = (selectedObject.type === 'door') ? item.wall : selectedObject.wall;
        const MIN_ITEM_WIDTH = 20;

        if (isNaN(newDimensionCm) || newDimensionCm < MIN_ITEM_WIDTH || !wall) {
            cancelLengthEdit();
            return;
        }

        const originalWidth = item.width;
        const originalPos = item.pos;

        const segment = findAvailableSegmentAt(wall, item.pos, item);

        if (!segment) {
             cancelLengthEdit();
             return;
        }

        let finalWidth = newDimensionCm;
        let finalPos = item.pos;
        const deltaWidth = newDimensionCm - originalWidth;

        if (newDimensionCm <= segment.length) {
            const currentItemStart = item.pos - originalWidth / 2;
            const currentItemEnd = item.pos + originalWidth / 2;
            const spaceLeft = currentItemStart - segment.start;
            const spaceRight = segment.end - currentItemEnd;
            const neededExpansionPerSide = deltaWidth / 2;

            if (deltaWidth <= 0) {
                finalWidth = newDimensionCm;
            } else {
                if (spaceLeft >= neededExpansionPerSide && spaceRight >= neededExpansionPerSide) {
                    finalWidth = newDimensionCm;
                } else if (spaceLeft >= deltaWidth) {
                    finalWidth = newDimensionCm;
                    finalPos = originalPos - neededExpansionPerSide;
                } else if (spaceRight >= deltaWidth) {
                    finalWidth = newDimensionCm;
                    finalPos = originalPos + neededExpansionPerSide;
                } else {
                    if (spaceLeft > 0) {
                         const maxExpandLeft = spaceLeft;
                         const remainingExpansion = deltaWidth - maxExpandLeft;
                         if (spaceRight >= remainingExpansion) {
                              finalWidth = newDimensionCm;
                              finalPos = originalPos - maxExpandLeft / 2 + remainingExpansion / 2;
                         } else {
                             finalWidth = segment.length;
                             finalPos = segment.start + segment.length / 2;
                         }
                    } else if (spaceRight > 0) {
                         const maxExpandRight = spaceRight;
                         const remainingExpansion = deltaWidth - maxExpandRight;
                         if (spaceLeft >= remainingExpansion) {
                             finalWidth = newDimensionCm;
                             finalPos = originalPos + maxExpandRight / 2 - remainingExpansion / 2;
                         } else {
                             finalWidth = segment.length;
                             finalPos = segment.start + segment.length / 2;
                         }
                    } else {
                        finalWidth = segment.length;
                        finalPos = segment.start + segment.length / 2;
                    }
                }
            }
        }
        else {
            finalWidth = segment.length;
            finalPos = segment.start + segment.length / 2;
        }

        item.width = finalWidth;
        item.pos = finalPos;
        item.isWidthManuallySet = true;

        let isValid = false;
        if (selectedObject.type === 'door') {
            isValid = isSpaceForDoor(item);
        } else {
            isValid = isSpaceForWindow(selectedObject);
        }

        if (isValid) {
            saveState();
        } else {
            item.width = originalWidth;
            item.pos = originalPos;
            item.isWidthManuallySet = false;
        }
    }

    cancelLengthEdit();
}


export function cancelLengthEdit() {
    setState({ isEditingLength: false });
    dom.lengthInput.style.display = "none";
    dom.lengthInput.blur();
}

export function setupUIListeners() {
    dom.settingsBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'block'; });
    dom.closeSettingsPopupBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'none'; });
    Object.keys(dom.tabButtons).forEach(key => { dom.tabButtons[key].addEventListener('click', () => openTab(key)); });

    dom.borderPicker.addEventListener("input", (e) => setState({ wallBorderColor: e.target.value }));
    dom.roomPicker.addEventListener("input", (e) => setState({ roomFillColor: e.target.value }));
    dom.lineThicknessInput.addEventListener("input", (e) => { const value = parseFloat(e.target.value); if(!isNaN(value)) setState({ lineThickness: value }); });
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

    dom.roomNameSelect.addEventListener('click', confirmRoomNameChange);
    dom.roomNameSelect.addEventListener('dblclick', confirmRoomNameChange);
    dom.roomNameInput.addEventListener('input', filterRoomNameList);
    dom.roomNameSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmRoomNameChange(); } });
    dom.roomNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            dom.roomNameSelect.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            confirmRoomNameChange();
        }
    });

    dom.splitter.addEventListener('pointerdown', onSplitterPointerDown);

    dom.lengthInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); confirmLengthEdit(); }
        else if (e.key === "Escape") { cancelLengthEdit(); }
    });
    dom.lengthInput.addEventListener("blur", cancelLengthEdit);
}