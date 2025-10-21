import { state, setState } from './main.js';

export function saveState() {
    // Mevcut state'in derin kopyasını oluşturmaya gerek yok, snapshot yeterli.
    // const currentState = { ... }; // Bu bloğa gerek yoktu.

    const snapshot = {
        nodes: state.nodes.map(n => ({
            x: n.x,
            y: n.y,
            isColumn: n.isColumn,
            columnSize: n.columnSize
        })),
        walls: state.walls.map(w => ({
            type: w.type,
            p1Index: state.nodes.indexOf(w.p1),
            p2Index: state.nodes.indexOf(w.p2),
            thickness: w.thickness || 20, // main.js'den WALL_THICKNESS import edilebilir
            wallType: w.wallType || 'normal',
            // --- GÜNCELLENDİ: Deep copy eklendi ---
            windows: w.windows ? JSON.parse(JSON.stringify(w.windows)) : [],
            vents: w.vents ? JSON.parse(JSON.stringify(w.vents)) : []
            // --- GÜNCELLEME SONU ---
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type,
            // --- YENİ: isWidthManuallySet kaydedilmeli ---
            isWidthManuallySet: d.isWidthManuallySet || false
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center, // center zaten array, JSON uyumlu
            name: r.name,
            centerOffset: r.centerOffset // Bu da JSON uyumlu olmalı {x, y}
        })),
        columns: JSON.parse(JSON.stringify(state.columns)) // Kolonlar zaten deep copy yapılıyordu
    };

    // History yönetimi (değişiklik yok)
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    state.historyIndex = state.history.length - 1;

    if (state.history.length > 50) {
        state.history.shift();
        state.historyIndex--;
    }
}

export function restoreState(snapshot) {
    if (!snapshot) return;

    // Node'ları geri yükle (değişiklik yok)
    const restoredNodes = snapshot.nodes.map(n => ({
        x: n.x,
        y: n.y,
        isColumn: n.isColumn,
        columnSize: n.columnSize
    }));

    // Duvarları geri yükle
    const restoredWalls = snapshot.walls.map(w => ({
        type: w.type,
        p1: restoredNodes[w.p1Index],
        p2: restoredNodes[w.p2Index],
        thickness: w.thickness || 20, // main.js'den WALL_THICKNESS import edilebilir
        wallType: w.wallType || 'normal',
        // --- GÜNCELLENDİ: Deep copy (burada zaten JSON'dan parse edildiği için [... ] yeterli) ---
        // Windows ve vents verisi snapshot içinde zaten stringify/parse edilmiş düz obje olmalı.
        // Tekrar parse etmeye gerek yok, sadece kopyalamak yeterli.
        windows: w.windows ? [...w.windows] : [], // snapshot'taki veriyi kopyala
        vents: w.vents ? [...w.vents] : []     // snapshot'taki veriyi kopyala
        // --- GÜNCELLEME SONU ---
    }));

    // Kapıları geri yükle
    const restoredDoors = snapshot.doors.map(d => ({
        wall: restoredWalls[d.wallIndex], // Doğru duvar referansını bul
        pos: d.pos,
        width: d.width,
        type: d.type,
        // --- YENİ: isWidthManuallySet geri yüklenmeli ---
        isWidthManuallySet: d.isWidthManuallySet || false
    }));

    // State'i güncelle (rooms ve columns için değişiklik yok)
    setState({
        nodes: restoredNodes,
        walls: restoredWalls,
        doors: restoredDoors,
        rooms: snapshot.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name,
            centerOffset: r.centerOffset // centerOffset'ı da geri yükle
        })),
        columns: snapshot.columns || [] // Kolonları geri yükle (veya boş dizi ata)
    });
}

// undo ve redo fonksiyonlarında değişiklik yok
export function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreState(state.history[state.historyIndex]);
    }
}

export function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreState(state.history[state.historyIndex]);
    }
}