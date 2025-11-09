// floor-operations-menu.js
import { state, setState } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { getOrCreateNode } from './geometry.js';
import { processWalls } from '../wall/wall-processor.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { getNextStairLetter } from '../architectural-objects/stairs.js';

let floorClipboard = null;

export function initFloorOperationsMenu() {
    const copyBtn = document.getElementById('floor-btn-copy');
    const pasteBtn = document.getElementById('floor-btn-paste');
    const pasteAllBtn = document.getElementById('floor-btn-paste-all');
    const clearBtn = document.getElementById('floor-btn-clear');

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            copyFloorArchitecture();
        });
    }

    if (pasteBtn) {
        pasteBtn.addEventListener('click', () => {
            pasteFloorArchitecture();
        });
    }

    if (pasteAllBtn) {
        pasteAllBtn.addEventListener('click', () => {
            pasteToAllFloors();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearFloorArchitecture();
        });
    }
}

// Mevcut kattaki tüm mimariyi kopyala
export function copyFloorArchitecture() {
    if (!state.currentFloor) {
        alert('Aktif kat bulunamadı!');
        return;
    }

    const currentFloorId = state.currentFloor.id;

    // Kattaki tüm elemanları topla
    const floorData = {
        walls: state.walls.filter(w => w.floorId === currentFloorId),
        doors: state.doors.filter(d => d.wall && state.walls.find(w => w === d.wall && w.floorId === currentFloorId)),
        columns: state.columns.filter(c => c.floorId === currentFloorId),
        beams: state.beams.filter(b => b.floorId === currentFloorId),
        stairs: state.stairs.filter(s => s.floorId === currentFloorId),
        rooms: state.rooms.filter(r => r.floorId === currentFloorId)
    };

    // Derin kopyalama yap
    floorClipboard = JSON.parse(JSON.stringify(floorData));

    const totalItems = floorClipboard.walls.length +
                      floorClipboard.doors.length +
                      floorClipboard.columns.length +
                      floorClipboard.beams.length +
                      floorClipboard.stairs.length +
                      floorClipboard.rooms.length;

    console.log(`Mimari plan kopyalandı: ${totalItems} eleman`);
}

// Kopyalanan mimariyi mevcut kata yapıştır
export function pasteFloorArchitecture() {
    if (!floorClipboard) {
        alert('Önce bir mimari plan kopyalamalısınız!');
        return;
    }

    if (!state.currentFloor) {
        alert('Aktif kat bulunamadı!');
        return;
    }

    const currentFloorId = state.currentFloor.id;

    // Önce mevcut kattaki mimariyi temizle
    state.walls = state.walls.filter(w => w.floorId !== currentFloorId);
    state.doors = state.doors.filter(d => !d.wall || !state.walls.find(w => w === d.wall && w.floorId === currentFloorId));
    state.columns = state.columns.filter(c => c.floorId !== currentFloorId);
    state.beams = state.beams.filter(b => b.floorId !== currentFloorId);
    state.stairs = state.stairs.filter(s => s.floorId !== currentFloorId);
    state.rooms = state.rooms.filter(r => r.floorId !== currentFloorId);

    // Node mapping için (duvarların node referanslarını korumak için)
    const nodeMap = new Map();

    // Duvarları yapıştır
    const newWalls = [];
    floorClipboard.walls.forEach(wallData => {
        // Node'ları oluştur veya mevcut olanı kullan
        const p1Key = `${wallData.p1.x},${wallData.p1.y}`;
        const p2Key = `${wallData.p2.x},${wallData.p2.y}`;

        let p1 = nodeMap.get(p1Key);
        if (!p1) {
            p1 = getOrCreateNode(wallData.p1.x, wallData.p1.y);
            nodeMap.set(p1Key, p1);
        }

        let p2 = nodeMap.get(p2Key);
        if (!p2) {
            p2 = getOrCreateNode(wallData.p2.x, wallData.p2.y);
            nodeMap.set(p2Key, p2);
        }

        const newWall = {
            type: 'wall',
            p1: p1,
            p2: p2,
            thickness: wallData.thickness,
            wallType: wallData.wallType || 'normal',
            floorId: currentFloorId,
            windows: [],
            vents: []
        };

        // Pencereleri kopyala
        if (wallData.windows && wallData.windows.length > 0) {
            newWall.windows = JSON.parse(JSON.stringify(wallData.windows));
        }

        // Menfezleri kopyala
        if (wallData.vents && wallData.vents.length > 0) {
            newWall.vents = JSON.parse(JSON.stringify(wallData.vents));
        }

        newWalls.push(newWall);
        state.walls.push(newWall);
    });

    // Kapıları yapıştır (duvar referanslarını güncelle)
    floorClipboard.doors.forEach((doorData, index) => {
        // Orijinal duvarın indeksini bul
        const originalWallIndex = floorClipboard.walls.findIndex(w => {
            // Duvar referansını bulmak için pozisyon karşılaştırması
            return doorData.wall &&
                   w.p1 && doorData.wall.p1 &&
                   w.p1.x === doorData.wall.p1.x &&
                   w.p1.y === doorData.wall.p1.y &&
                   w.p2 && doorData.wall.p2 &&
                   w.p2.x === doorData.wall.p2.x &&
                   w.p2.y === doorData.wall.p2.y;
        });

        if (originalWallIndex !== -1 && newWalls[originalWallIndex]) {
            const newDoor = {
                ...doorData,
                wall: newWalls[originalWallIndex],
                floorId: currentFloorId
            };
            state.doors.push(newDoor);
        }
    });

    // Kolonları yapıştır
    floorClipboard.columns.forEach(columnData => {
        const newColumn = {
            ...columnData,
            center: { x: columnData.center.x, y: columnData.center.y }, // Deep copy
            floorId: currentFloorId
        };
        state.columns.push(newColumn);
    });

    // Kirişleri yapıştır
    floorClipboard.beams.forEach(beamData => {
        const newBeam = {
            ...beamData,
            center: { x: beamData.center.x, y: beamData.center.y }, // Deep copy
            floorId: currentFloorId
        };
        state.beams.push(newBeam);
    });

    // Merdivenleri yapıştır (yeni ID ve isim ver)
    floorClipboard.stairs.forEach(stairData => {
        const newStair = {
            ...stairData,
            center: { x: stairData.center.x, y: stairData.center.y }, // Deep copy
            id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            name: getNextStairLetter(),
            connectedStairId: null,
            floorId: currentFloorId
        };
        state.stairs.push(newStair);
    });

    // Odaları yapıştır
    floorClipboard.rooms.forEach(roomData => {
        const newRoom = {
            ...roomData,
            center: roomData.center ? [...roomData.center] : undefined, // Deep copy array
            centerOffset: roomData.centerOffset ? { ...roomData.centerOffset } : undefined, // Deep copy object
            floorId: currentFloorId
        };
        state.rooms.push(newRoom);
    });

    processWalls();
    saveState();
    update3DScene();

    const totalItems = floorClipboard.walls.length +
                      floorClipboard.doors.length +
                      floorClipboard.columns.length +
                      floorClipboard.beams.length +
                      floorClipboard.stairs.length +
                      floorClipboard.rooms.length;

    console.log(`Mimari plan yapıştırıldı: ${totalItems} eleman`);
}

// Kopyalanan mimariyi diğer tüm katlara yapıştır
function pasteToAllFloors() {
    // Eğer clipboard boşsa, önce mevcut katı kopyala
    if (!floorClipboard) {
        copyFloorArchitecture();
        // Eğer hala boşsa (kopyalama başarısızsa), çık
        if (!floorClipboard) {
            return;
        }
    }

    if (!state.floors || state.floors.length === 0) {
        alert('Başka kat bulunamadı!');
        return;
    }

    // Mevcut katı hariç tut
    const currentFloorId = state.currentFloor?.id;
    const targetFloors = state.floors.filter(f =>
        !f.isPlaceholder &&
        f.id !== currentFloorId &&
        f.visible !== false
    );

    if (targetFloors.length === 0) {
        alert('Yapıştırılacak başka kat bulunamadı!');
        return;
    }

    const confirmMsg = `Mimari plan ${targetFloors.length} kata yapıştırılacak. Emin misiniz?\n\nKatlar: ${targetFloors.map(f => f.name).join(', ')}`;
    if (!confirm(confirmMsg)) {
        return;
    }

    let pastedFloorCount = 0;

    targetFloors.forEach(floor => {
        const floorId = floor.id;

        // Önce mevcut kattaki mimariyi temizle (normal yapıştırmadaki gibi)
        state.walls = state.walls.filter(w => w.floorId !== floorId);
        state.doors = state.doors.filter(d => !d.wall || !state.walls.find(w => w === d.wall && w.floorId === floorId));
        state.columns = state.columns.filter(c => c.floorId !== floorId);
        state.beams = state.beams.filter(b => b.floorId !== floorId);
        state.stairs = state.stairs.filter(s => s.floorId !== floorId);
        state.rooms = state.rooms.filter(r => r.floorId !== floorId);

        // Her kat için node mapping
        const nodeMap = new Map();

        // Duvarları yapıştır
        const newWalls = [];
        floorClipboard.walls.forEach(wallData => {
            const p1Key = `${wallData.p1.x},${wallData.p1.y}`;
            const p2Key = `${wallData.p2.x},${wallData.p2.y}`;

            let p1 = nodeMap.get(p1Key);
            if (!p1) {
                p1 = getOrCreateNode(wallData.p1.x, wallData.p1.y);
                nodeMap.set(p1Key, p1);
            }

            let p2 = nodeMap.get(p2Key);
            if (!p2) {
                p2 = getOrCreateNode(wallData.p2.x, wallData.p2.y);
                nodeMap.set(p2Key, p2);
            }

            const newWall = {
                type: 'wall',
                p1: p1,
                p2: p2,
                thickness: wallData.thickness,
                wallType: wallData.wallType || 'normal',
                floorId: floorId,
                windows: [],
                vents: []
            };

            if (wallData.windows && wallData.windows.length > 0) {
                newWall.windows = JSON.parse(JSON.stringify(wallData.windows));
            }

            if (wallData.vents && wallData.vents.length > 0) {
                newWall.vents = JSON.parse(JSON.stringify(wallData.vents));
            }

            newWalls.push(newWall);
            state.walls.push(newWall);
        });

        // Kapıları yapıştır
        floorClipboard.doors.forEach((doorData) => {
            const originalWallIndex = floorClipboard.walls.findIndex(w => {
                return doorData.wall &&
                       w.p1 && doorData.wall.p1 &&
                       w.p1.x === doorData.wall.p1.x &&
                       w.p1.y === doorData.wall.p1.y &&
                       w.p2 && doorData.wall.p2 &&
                       w.p2.x === doorData.wall.p2.x &&
                       w.p2.y === doorData.wall.p2.y;
            });

            if (originalWallIndex !== -1 && newWalls[originalWallIndex]) {
                const newDoor = {
                    ...doorData,
                    wall: newWalls[originalWallIndex],
                    floorId: floorId
                };
                state.doors.push(newDoor);
            }
        });

        // Kolonları yapıştır
        floorClipboard.columns.forEach(columnData => {
            const newColumn = {
                ...columnData,
                center: { x: columnData.center.x, y: columnData.center.y }, // Deep copy
                floorId: floorId
            };
            state.columns.push(newColumn);
        });

        // Kirişleri yapıştır
        floorClipboard.beams.forEach(beamData => {
            const newBeam = {
                ...beamData,
                center: { x: beamData.center.x, y: beamData.center.y }, // Deep copy
                floorId: floorId
            };
            state.beams.push(newBeam);
        });

        // Merdivenleri yapıştır
        floorClipboard.stairs.forEach(stairData => {
            const newStair = {
                ...stairData,
                center: { x: stairData.center.x, y: stairData.center.y }, // Deep copy
                id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                name: getNextStairLetter(),
                connectedStairId: null,
                floorId: floorId
            };
            state.stairs.push(newStair);
        });

        // Odaları yapıştır
        floorClipboard.rooms.forEach(roomData => {
            const newRoom = {
                ...roomData,
                center: roomData.center ? [...roomData.center] : undefined, // Deep copy array
                centerOffset: roomData.centerOffset ? { ...roomData.centerOffset } : undefined, // Deep copy object
                floorId: floorId
            };
            state.rooms.push(newRoom);
        });

        pastedFloorCount++;
    });

    // Tüm katları işle (processAllFloors = true)
    processWalls(false, false, true);
    saveState();
    update3DScene();

    console.log(`Mimari plan ${pastedFloorCount} kata yapıştırıldı`);
}

// Mevcut kattaki tüm mimariyi sil
function clearFloorArchitecture() {
    if (!state.currentFloor) {
        alert('Aktif kat bulunamadı!');
        return;
    }

    const currentFloorId = state.currentFloor.id;

    // Kaç eleman silineceğini hesapla
    const wallCount = state.walls.filter(w => w.floorId === currentFloorId).length;
    const doorCount = state.doors.filter(d => d.wall && state.walls.find(w => w === d.wall && w.floorId === currentFloorId)).length;
    const columnCount = state.columns.filter(c => c.floorId === currentFloorId).length;
    const beamCount = state.beams.filter(b => b.floorId === currentFloorId).length;
    const stairCount = state.stairs.filter(s => s.floorId === currentFloorId).length;
    const roomCount = state.rooms.filter(r => r.floorId === currentFloorId).length;

    const totalItems = wallCount + doorCount + columnCount + beamCount + stairCount + roomCount;

    if (totalItems === 0) {
        alert('Bu katta silinecek mimari eleman yok!');
        return;
    }

    const confirmMsg = `${state.currentFloor.name} katındaki tüm mimari silinecek!\n\n${wallCount} duvar, ${doorCount} kapı, ${columnCount} kolon, ${beamCount} kiriş, ${stairCount} merdiven, ${roomCount} oda\n\nEmin misiniz?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    // Mimariyi temizle
    state.walls = state.walls.filter(w => w.floorId !== currentFloorId);
    state.doors = state.doors.filter(d => !d.wall || !state.walls.find(w => w === d.wall && w.floorId === currentFloorId));
    state.columns = state.columns.filter(c => c.floorId !== currentFloorId);
    state.beams = state.beams.filter(b => b.floorId !== currentFloorId);
    state.stairs = state.stairs.filter(s => s.floorId !== currentFloorId);
    state.rooms = state.rooms.filter(r => r.floorId !== currentFloorId);

    // Seçimleri temizle
    setState({ selectedObject: null, selectedGroup: [] });

    processWalls();
    saveState();
    update3DScene();

    console.log(`${totalItems} mimari eleman silindi`);
}
