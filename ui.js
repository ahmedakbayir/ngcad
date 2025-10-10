import { state, setState, dom, resize, MAHAL_LISTESI } from './main.js';
import { saveState } from './history.js';
import { update3DScene } from './scene3d.js';
import { applyStretchModification } from './geometry.js'; // <-- EKLENDİ
import { processWalls } from './wall-processor.js';
import { worldToScreen } from './geometry.js';

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

// Splitter Mantığı
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

    let p3dWidth = mainRect.width - p2dWidth - dom.splitter.offsetWidth - 20; // 20 for main padding
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


// Duvar Uzunluğu Değiştirme
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
    if (!state.selectedObject || state.selectedObject.type !== "wall") return;
    const wall = state.selectedObject.object;
    const midX = (wall.p1.x + wall.p2.x) / 2;
    const midY = (wall.p1.y + wall.p2.y) / 2;
    const screenPos = worldToScreen(midX, midY);
    dom.lengthInput.style.left = `${screenPos.x}px`;
    dom.lengthInput.style.top = `${screenPos.y - 20}px`;
}

export function startLengthEdit(initialKey = '') {
    if (!state.selectedObject || state.selectedObject.type !== "wall") return;
    setState({ isEditingLength: true });
    positionLengthInput();
    dom.lengthInput.style.display = "block";
    const wall = state.selectedObject.object;
    const currentLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    dom.lengthInput.value = initialKey || currentLength.toFixed(0);
    dom.lengthInput.focus();
    dom.lengthInput.select();
}

function confirmLengthEdit() {
    if (!state.selectedObject || state.selectedObject.type !== "wall") return;
    let rawValue = dom.lengthInput.value.trim();
    let reverseDirection = false;
    if (rawValue.endsWith("-")) {
        reverseDirection = true;
        rawValue = rawValue.slice(0, -1);
    }
    const newLengthCm = parseFloat(rawValue);
    if (!isNaN(newLengthCm) && newLengthCm > 0) {
        const wall = state.selectedObject.object;
        const stationaryHandle = reverseDirection ? "p2" : "p1";
        const movingPointHandle = reverseDirection ? "p1" : "p2";
        const movingPoint = wall[movingPointHandle];
        const stationaryPoint = wall[stationaryHandle];
        const originalPos = { x: movingPoint.x, y: movingPoint.y };
        resizeWall(state.selectedObject.object, newLengthCm, stationaryHandle);
        applyStretchModification(movingPoint, originalPos, stationaryPoint);
        processWalls();
        saveState();
    }
    cancelLengthEdit();
}

export function cancelLengthEdit() {
    setState({ isEditingLength: false });
    dom.lengthInput.style.display = "none";
    dom.lengthInput.blur();
}

export function setupUIListeners() {
    // Ayarlar Pop-up
    dom.settingsBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'block'; });
    dom.closeSettingsPopupBtn.addEventListener("click", () => { dom.settingsPopup.style.display = 'none'; });
    Object.keys(dom.tabButtons).forEach(key => { dom.tabButtons[key].addEventListener('click', () => openTab(key)); });

    // Ayarlar - İçerik
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
    
    // Mahal Adı Listesi
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

    // Splitter
    dom.splitter.addEventListener('pointerdown', onSplitterPointerDown);
    
    // Uzunluk Girişi
    dom.lengthInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); confirmLengthEdit(); }
        else if (e.key === "Escape") { cancelLengthEdit(); }
    });
    dom.lengthInput.addEventListener("blur", cancelLengthEdit);
}