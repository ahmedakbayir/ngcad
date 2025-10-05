import * as state from './state.js';
import { getWallBorderColor } from './ui.js';
import { restoreStateFromData } from './history.js';

export async function handleSave() {
    const nodesCopy = state.nodes.map(n => ({ x: n.x, y: n.y }));
    const wallsCopy = state.walls.map(w => ({ type: w.type, p1: state.nodes.indexOf(w.p1), p2: state.nodes.indexOf(w.p2) }));
    const doorsCopy = state.doors.map(d => ({ wall: state.walls.indexOf(d.wall), pos: d.pos, width: d.width, type: 'door' }));
    const dataToSave = {
        nodes: nodesCopy, walls: wallsCopy, doors: doorsCopy, borderColor: getWallBorderColor()
    };
    const dataStr = JSON.stringify(dataToSave, null, 2);
    if ("showSaveFilePicker" in window) {
        try {
            const options = {
                suggestedName: "mimari-plan.json",
                types: [{ description: "JSON Plan File", accept: { "application/json": [".json"] } }],
            };
            const handle = await window.showSaveFilePicker(options);
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            return;
        } catch (err) {
            if (err.name !== "AbortError") console.error(err.name, err.message);
            return;
        }
    }
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mimari-plan.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function handleOpen(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);
            if (!loadedData.nodes || !loadedData.walls) throw new Error("Invalid file format");
            restoreStateFromData(loadedData);
        } catch (error) {
            console.error("Error loading file:", error);
            alert("Dosya yüklenemedi. Lütfen geçerli bir plan dosyası seçin.");
        }
    };
    reader.readAsText(file);
    event.target.value = null;
}