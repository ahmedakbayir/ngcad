// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/general-files/history.js
// GÜNCELLENDİ: Tesisat nesneleri (plumbingBlocks, plumbingPipes) eklendi.
// GÜNCELLENDİ: Boru bağlantı referansları (blockId) için indeksleme eklendi.
import { state, setState } from './main.js';
// YENİ İMPORT: Boru tiplerini geri yüklemek için eklendi
import { PLUMBING_PIPE_TYPES } from '../plumbing_v2/plumbing-types.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

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
            thickness: w.thickness || state.wallThickness, // GÜNCELLENDİ
            wallType: w.wallType || 'normal',
            floorId: w.floorId, // FLOOR ISOLATION: floorId kaydet
            // --- GÜNCELLENDİ: Deep copy eklendi ---
            windows: w.windows ? JSON.parse(JSON.stringify(w.windows)) : [],
            vents: w.vents ? JSON.parse(JSON.stringify(w.vents)) : [],
            // --- GÜNCELLEME SONU ---
            isArc: w.isArc, // EKLENDİ
            arcControl1: w.arcControl1 ? { ...w.arcControl1 } : null, // EKLENDİ
            arcControl2: w.arcControl2 ? { ...w.arcControl2 } : null  // EKLENDİ
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type,
            floorId: d.floorId, // FLOOR ISOLATION: floorId kaydet
            // --- YENİ: isWidthManuallySet kaydedilmeli ---
            isWidthManuallySet: d.isWidthManuallySet || false
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center, // center zaten array, JSON uyumlu
            name: r.name,
            floorId: r.floorId, // FLOOR ISOLATION: floorId kaydet
            centerOffset: r.centerOffset // Bu da JSON uyumlu olmalı {x, y}
        })),
        columns: JSON.parse(JSON.stringify(state.columns)), // Kolonlar zaten deep copy yapılıyordu
        beams: JSON.parse(JSON.stringify(state.beams)), // <-- YENİ SATIRI EKLEYİN
        stairs: JSON.parse(JSON.stringify(state.stairs.map(s => ({ // <-- YENİ SATIRI EKLEYİN (ve içeriğini güncelle)
            type: s.type,
            id: s.id,
            name: s.name,
            center: s.center,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            stepCount: s.stepCount,
            bottomElevation: s.bottomElevation,
            topElevation: s.topElevation,
            connectedStairId: s.connectedStairId,
            isLanding: s.isLanding,
            showRailing: s.showRailing, // <-- DÜZELTME: Korkuluk bilgisi eklendi
            floorId: s.floorId // FLOOR ISOLATION: floorId kaydet
        })))),
        
        // --- YENİ EKLENEN TESİSAT KAYDI ---
        plumbingBlocks: JSON.parse(JSON.stringify(state.plumbingBlocks || [])), // Blokları kopyala
        plumbingPipes: (state.plumbingPipes || []).map(p => {
            // V2 pipe format check
            if (!p.connections) {
                // V2 format - just copy the object
                return JSON.parse(JSON.stringify(p));
            }

            // Old format - Boru özelliklerini kopyala
            return {
                pipeType: p.pipeType,
                p1: { ...p.p1 },
                p2: { ...p.p2 },
                floorId: p.floorId,
                isConnectedToValve: p.isConnectedToValve,
                // Bağlantıları kaydet (ID veya index)
                connections: {
                    start: (p.connections.start && p.connections.start.blockId) ? {
                        blockId: typeof p.connections.start.blockId === 'string'
                            ? p.connections.start.blockId
                            : (p.connections.start.blockId.id || null),
                        blockIndex: typeof p.connections.start.blockId === 'object'
                            ? state.plumbingBlocks.indexOf(p.connections.start.blockId)
                            : -1,
                        connectionIndex: p.connections.start.connectionIndex,
                        blockType: p.connections.start.blockType
                    } : null,
                    end: (p.connections.end && p.connections.end.blockId) ? {
                        blockId: typeof p.connections.end.blockId === 'string'
                            ? p.connections.end.blockId
                            : (p.connections.end.blockId.id || null),
                        blockIndex: typeof p.connections.end.blockId === 'object'
                            ? state.plumbingBlocks.indexOf(p.connections.end.blockId)
                            : -1,
                        connectionIndex: p.connections.end.connectionIndex,
                        blockType: p.connections.end.blockType
                    } : null
                }
            };
        }),
        // --- YENİ KAYIT SONU ---

        guides: JSON.parse(JSON.stringify(state.guides || [])), // <-- REFERANS ÇİZGİSİ EKLENDİ
        floors: JSON.parse(JSON.stringify(state.floors || [])), // FLOOR ISOLATION: floors kaydet
        currentFloor: state.currentFloor ? { id: state.currentFloor.id } : null // FLOOR ISOLATION: currentFloor ID'sini kaydet
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
        thickness: w.thickness || state.wallThickness, // GÜNCELLENDİ
        wallType: w.wallType || 'normal',
        floorId: w.floorId, // FLOOR ISOLATION: floorId geri yükle
        // --- GÜNCELLENDİ: Deep copy (burada zaten JSON'dan parse edildiği için [... ] yeterli) ---
        // Windows ve vents verisi snapshot içinde zaten stringify/parse edilmiş düz obje olmalı.
        // Tekrar parse etmeye gerek yok, sadece kopyalamak yeterli.
        windows: w.windows ? [...w.windows] : [], // snapshot'taki veriyi kopyala
        vents: w.vents ? [...w.vents] : [],     // snapshot'taki veriyi kopyala
        // --- GÜNCELLEME SONU ---
        isArc: w.isArc, // EKLENDİ
        arcControl1: w.arcControl1 ? { ...w.arcControl1 } : null, // EKLENDİ
        arcControl2: w.arcControl2 ? { ...w.arcControl2 } : null  // EKLENDİ
    }));

    // Kapıları geri yükle
    const restoredDoors = snapshot.doors.map(d => ({
        wall: restoredWalls[d.wallIndex], // Doğru duvar referansını bul
        pos: d.pos,
        width: d.width,
        type: d.type,
        floorId: d.floorId, // FLOOR ISOLATION: floorId geri yükle
        // --- YENİ: isWidthManuallySet geri yüklenmeli ---
        isWidthManuallySet: d.isWidthManuallySet || false
    }));

    // --- YENİ EKLENEN TESİSAT GERİ YÜKLEME ---
    // Önce blokları kopyala
    const restoredPlumbingBlocks = snapshot.plumbingBlocks ? JSON.parse(JSON.stringify(snapshot.plumbingBlocks)) : [];

    // Sonra boruları geri yükle ve referansları bağla
    const restoredPlumbingPipes = (snapshot.plumbingPipes || []).map(p => {
        // V2 format check - no connections property
        if (!p.connections) {
            return JSON.parse(JSON.stringify(p));
        }

        // typeConfig'i geri yüklerken PLUMBING_PIPE_TYPES'ı kullan
        const pipeConfig = PLUMBING_PIPE_TYPES[p.pipeType] || PLUMBING_PIPE_TYPES['STANDARD'];

        // Start connection için blockId bul (ID bazlı veya index bazlı)
        let startBlockId = null;
        if (p.connections.start) {
            if (p.connections.start.blockId) {
                // ID varsa (yeni sistem), ID ile bloğu bul
                startBlockId = restoredPlumbingBlocks.find(b => b.id === p.connections.start.blockId);
            }
            if (!startBlockId && p.connections.start.blockIndex !== -1) {
                // ID yoksa veya bulunamadıysa, index kullan (fallback)
                startBlockId = restoredPlumbingBlocks[p.connections.start.blockIndex];
            }
        }

        // End connection için blockId bul (ID bazlı veya index bazlı)
        let endBlockId = null;
        if (p.connections.end) {
            if (p.connections.end.blockId) {
                // ID varsa (yeni sistem), ID ile bloğu bul
                endBlockId = restoredPlumbingBlocks.find(b => b.id === p.connections.end.blockId);
            }
            if (!endBlockId && p.connections.end.blockIndex !== -1) {
                // ID yoksa veya bulunamadıysa, index kullan (fallback)
                endBlockId = restoredPlumbingBlocks[p.connections.end.blockIndex];
            }
        }

        return {
            type: 'plumbingPipe',
            pipeType: p.pipeType,
            p1: { ...p.p1 },
            p2: { ...p.p2 },
            floorId: p.floorId,
            typeConfig: pipeConfig, // typeConfig'i geri yükle
            isConnectedToValve: p.isConnectedToValve,
            connections: {
                start: (startBlockId) ? {
                    blockId: startBlockId.id || startBlockId, // ID varsa ID, yoksa object
                    connectionIndex: p.connections.start.connectionIndex,
                    blockType: p.connections.start.blockType
                } : null,
                end: (endBlockId) ? {
                    blockId: endBlockId.id || endBlockId, // ID varsa ID, yoksa object
                    connectionIndex: p.connections.end.connectionIndex,
                    blockType: p.connections.end.blockType
                } : null
            }
        };
    });
    // --- YENİ GERİ YÜKLEME SONU ---

    // Floors'u geri yükle ve currentFloor'u bul
    const restoredFloors = snapshot.floors || [];
    const restoredCurrentFloor = snapshot.currentFloor
        ? restoredFloors.find(f => f.id === snapshot.currentFloor.id)
        : null;

    // State'i güncelle
    setState({
        nodes: restoredNodes,
        walls: restoredWalls,
        doors: restoredDoors,
        rooms: snapshot.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name,
            floorId: r.floorId, // FLOOR ISOLATION: floorId geri yükle
            centerOffset: r.centerOffset // centerOffset'ı da geri yükle
        })),
        columns: snapshot.columns || [], // Kolonları geri yükle (veya boş dizi ata)
        beams: snapshot.beams || [], // <-- YENİ SATIRI EKLEYİN
        stairs: (snapshot.stairs || []).map(s => ({ // <-- YENİ SATIRI EKLEYİN (ve içeriğini güncelle)
            type: s.type,
            id: s.id,
            name: s.name,
            center: s.center,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            stepCount: s.stepCount,
            bottomElevation: s.bottomElevation,
            topElevation: s.topElevation,
            connectedStairId: s.connectedStairId,
            isLanding: s.isLanding,
            showRailing: s.showRailing || false, // <-- DÜZELTME: Korkuluk bilgisi okundu
            floorId: s.floorId // FLOOR ISOLATION: floorId geri yükle
        })),

        // --- YENİ EKLENEN STATE GÜNCELLEMESİ ---
        plumbingBlocks: restoredPlumbingBlocks,
        plumbingPipes: restoredPlumbingPipes,
        // --- YENİ GÜNCELLEME SONU ---

        guides: snapshot.guides || [], // <-- REFERANS ÇİZGİSİ EKLENDİ
        floors: restoredFloors, // FLOOR ISOLATION: floors geri yükle
        currentFloor: restoredCurrentFloor // FLOOR ISOLATION: currentFloor geri yükle
    });
}

// undo ve redo fonksiyonlarında değişiklik yok
export function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreState(state.history[state.historyIndex]);
        // Plumbing v2 manager'ı state'den yeniden yükle
        if (plumbingManager) {
            plumbingManager.loadFromState();
        }
    }
}

export function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreState(state.history[state.historyIndex]);
        // Plumbing v2 manager'ı state'den yeniden yükle
        if (plumbingManager) {
            plumbingManager.loadFromState();
        }
    }
}