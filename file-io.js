import { state, setState, dom } from './main.js';
import { initializeSettings } from './ui.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { update3DScene } from './scene3d.js';

async function handleSave() {
    const { nodes, walls, doors, rooms, wallBorderColor, roomFillColor, lineThickness } = state;
    const nodesCopy = nodes.map((n) => ({ x: n.x, y: n.y }));
    const wallsCopy = walls.map((w) => ({ type: w.type, p1: nodes.indexOf(w.p1), p2: nodes.indexOf(w.p2) }));
    const doorsCopy = doors.map((d) => ({ wall: walls.indexOf(d.wall), pos: d.pos, width: d.width, type: "door" }));
    const roomsCopy = rooms.map(r => ({ name: r.name, center: r.center }));
    const dataToSave = {
        nodes: nodesCopy, walls: wallsCopy, doors: doorsCopy, rooms: roomsCopy,
        borderColor: wallBorderColor, roomColor: roomFillColor, lineThickness: lineThickness
    };
    const dataStr = JSON.stringify(dataToSave, null, 2);
    
    if ("showSaveFilePicker" in window) {
        try {
            const options = { suggestedName: "mimari-plan.json", types: [ { description: "JSON Plan Dosyası", accept: { "application/json": [".json"] } } ] };
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

function handleOpen(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);
            if (!loadedData.nodes || !loadedData.walls) throw new Error("Invalid file format");
            
            const newNodes = loadedData.nodes.map((p) => ({ x: p.x, y: p.y }));
            const newWalls = loadedData.walls.map((w) => ({ type: w.type, p1: newNodes[w.p1], p2: newNodes[w.p2] }));
            const newDoors = loadedData.doors ? loadedData.doors.map((d) => ({ wall: newWalls[d.wall], pos: d.pos, width: d.width, type: "door" })) : [];
            
            setState({
                nodes: newNodes,
                walls: newWalls,
                doors: newDoors,
                wallBorderColor: loadedData.borderColor || "#e7e6d0",
                roomFillColor: loadedData.roomColor || "#1e1f20",
                lineThickness: loadedData.lineThickness || 1,
                selectedObject: null,
                selectedGroup: [],
                history: [],
                historyIndex: -1
            });

            initializeSettings();
            processWalls();
            
            if (loadedData.rooms && state.rooms.length > 0) {
                loadedData.rooms.forEach(savedRoom => {
                    let closestRoom = null;
                    let minDistance = Infinity;
                    state.rooms.forEach(detectedRoom => {
                        const dist = Math.hypot(savedRoom.center[0] - detectedRoom.center[0], savedRoom.center[1] - detectedRoom.center[1]);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestRoom = detectedRoom;
                        }
                    });
                    if (closestRoom && minDistance < 50) {
                        closestRoom.name = savedRoom.name;
                    }
                });
            }
            
            update3DScene();
            saveState();
        } catch (error) {
            console.error("Dosya yükleme hatası:", error);
            alert("Dosya yüklenemedi. Lütfen geçerli bir plan dosyası seçin.");
        }
    };
    reader.readAsText(file);
    event.target.value = null;
}

export function setupFileIOListeners() {
    dom.bSave.addEventListener("click", handleSave);
    dom.bOpen.addEventListener("click", () => dom.fileInput.click());
    dom.fileInput.addEventListener("change", handleOpen);
}