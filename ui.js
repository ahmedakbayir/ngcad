import { setMode } from './_modeManager.js';
import * as fileManager from './fileManager.js';
import * as state from './state.js';

// DOM Elementleri
export const p2d = document.getElementById("p2d");
export const c2d = document.getElementById("c2d");
export const ctx2d = c2d.getContext("2d");
export const lengthInput = document.getElementById("length-input");
export const picker = document.getElementById("borderPicker");

let wallBorderColor = '#ffffff';

export function getWallBorderColor() {
    return wallBorderColor;
}

export function setWallBorderColor(color) {
    wallBorderColor = color;
    picker.value = color;
}

function initButtons() {
    document.getElementById("bSel").addEventListener("click", () => setMode("select"));
    document.getElementById("bWall").addEventListener("click", () => setMode("drawWall"));
    document.getElementById("bRoom").addEventListener("click", () => setMode("drawRoom"));
    document.getElementById("bDoor").addEventListener("click", () => setMode("drawDoor"));

    picker.addEventListener("input", (e) => (wallBorderColor = e.target.value));

    const fileInput = document.getElementById("file-input");
    document.getElementById("bSave").addEventListener("click", fileManager.handleSave);
    document.getElementById("bOpen").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", fileManager.handleOpen);
}

function initGridPopup() {
    const gridSettingsBtn = document.getElementById("grid-settings-btn");
    const gridPopup = document.getElementById("grid-popup");
    const gridVisibleInput = document.getElementById("grid-visible");
    const gridColorInput = document.getElementById("grid-color");
    const gridWeightInput = document.getElementById("grid-weight");
    const gridSpaceInput = document.getElementById("grid-space");
    const closeGridPopupBtn = document.getElementById("close-grid-popup");

    gridSettingsBtn.addEventListener("click", () => {
        gridPopup.style.display = gridPopup.style.display === "block" ? "none" : "block";
    });
    closeGridPopupBtn.addEventListener("click", () => {
        gridPopup.style.display = "none";
    });
    gridVisibleInput.addEventListener("change", (e) => { state.gridOptions.visible = e.target.checked; });
    gridColorInput.addEventListener("input", (e) => { state.gridOptions.color = e.target.value; });
    gridWeightInput.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value >= 0.1 && value <= 5) { state.gridOptions.weight = value; }
    });
    gridSpaceInput.addEventListener("input", (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 50) { state.gridOptions.spacing = value; }
    });
}

export function updateModeClasses(currentMode) {
    document.getElementById("bSel").classList.toggle("active", currentMode === "select");
    document.getElementById("bWall").classList.toggle("active", currentMode === "drawWall");
    document.getElementById("bRoom").classList.toggle("active", currentMode === "drawRoom");
    document.getElementById("bDoor").classList.toggle("active", currentMode === "drawDoor");
    p2d.className = `panel ${currentMode}-mode`;
}

export function initUI() {
    initButtons();
    initGridPopup();
}