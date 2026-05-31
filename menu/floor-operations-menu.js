// floor-operations-menu.js
import { state, setState } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { getOrCreateNode } from '../draw/geometry.js';
import { processWalls } from '../wall/wall-processor.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { getNextStairLetter } from '../architectural-objects/stairs.js';

let floorClipboard = null;

export function initFloorOperationsMenu() {
    // Üst/Kılavuz Menü Butonları
    const copyBtn = document.getElementById('floor-btn-copy');
    const pasteBtn = document.getElementById('floor-btn-paste');
    const pasteAllBtn = document.getElementById('floor-btn-paste-all');
    const clearBtn = document.getElementById('floor-btn-clear');

    // Sağ Tık (Context) Menü Butonları
    const ctxCopyBtn = document.getElementById('ctx-mimari-cogalt-kopyala');
    const ctxPasteDeleteBtn = document.getElementById('ctx-mimari-cogalt-yapistir-sil');
    const ctxPasteKeepBtn = document.getElementById('ctx-mimari-cogalt-yapistir-kal');
    const ctxPasteAllBtn = document.getElementById('ctx-mimari-cogalt-tum-katlar');
    const ctxClearBtn = document.getElementById('ctx-mimari-eksilt-kat');
    const ctxClearAllBtn = document.getElementById('ctx-mimari-eksilt-tum-katlar');

    // Olay Dinleyicileri Tanımlamaları
    if (copyBtn) copyBtn.addEventListener('click', () => { copyFloorArchitecture(); showFloorToast('✓ Kat mimarisi kopyalandı'); });
    if (ctxCopyBtn) ctxCopyBtn.addEventListener('click', () => { copyFloorArchitecture(); showFloorToast('✓ Kat mimarisi kopyalandı'); });

    if (pasteBtn) pasteBtn.addEventListener('click', () => { pasteFloorArchitecture(true); showFloorToast('✓ Kat mimarisi yapıştırıldı'); });
    if (ctxPasteDeleteBtn) ctxPasteDeleteBtn.addEventListener('click', () => { pasteFloorArchitecture(true); showFloorToast('✓ Kat mimarisi yapıştırıldı (Eski silindi)'); });
    if (ctxPasteKeepBtn) ctxPasteKeepBtn.addEventListener('click', () => { pasteFloorArchitecture(false); showFloorToast('✓ Kat mimarisi mevcut plana eklendi'); });

    if (pasteAllBtn) pasteAllBtn.addEventListener('click', () => { pasteToAllFloors(); });
    if (ctxPasteAllBtn) ctxPasteAllBtn.addEventListener('click', () => { pasteToAllFloors(); });

    if (clearBtn) clearBtn.addEventListener('click', () => { clearFloorArchitecture(); });
    if (ctxClearBtn) ctxClearBtn.addEventListener('click', () => { clearFloorArchitecture(); });
    if (ctxClearAllBtn) ctxClearAllBtn.addEventListener('click', () => { clearAllFloorsArchitecture(); });

    // Global Klavye Kısayolları Entegrasyonu (CTRL+C, CTRL+V, CTRL+SHIFT+V)
    document.addEventListener('keydown', (e) => {
        // Kullanıcı o sırada bir girdi alanındaysa (Input, Textarea vb.) kısayolları tetikleme
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

        // Herhangi bir nesnenin (Mimari veya Tesisat) seçili olup olmadığını denetle
        const hasArchSelection = !!state.selectedObject || (state.selectedGroup && state.selectedGroup.length > 0);
        const im = window.plumbingManager?.interactionManager;
        const hasPlumbingSelection = !!(im?.selectedObject || (im?.selectedObjects && im.selectedObjects.length > 0));
        
        const hasSelection = hasArchSelection || hasPlumbingSelection;

        // HERHANGİ BİR NESNE SEÇİLİ DEĞİLKEN ÇALIŞACAK MANTIK
        if (!hasSelection && (e.ctrlKey || e.metaKey)) {
            const key = e.key.toLowerCase();

            // CTRL + SHIFT + V : Tüm katlara yapıştır
            if (e.shiftKey && key === 'v') {
                e.preventDefault();
                pasteToAllFloors();
                return;
            }

            // CTRL + C : Kat planını kopyala
            if (key === 'c') {
                e.preventDefault();
                copyFloorArchitecture();
                showFloorToast('✓ Kat mimarisi kopyalandı');
                return;
            }

            // CTRL + V : Bulunulan kata yapıştır (Önceki plan silinerek temiz kurulum yapar)
            if (key === 'v') {
                e.preventDefault();
                pasteFloorArchitecture(true);
                showFloorToast('✓ Kat mimarisi yapıştırıldı');
                return;
            }
        }
    });
}

// UI üzerinde kullanıcıya hızlı bilgi vermek için Toast mesajı tetikleyici
function showFloorToast(msg) {
    const toast = document.getElementById('label-relayout-toast');
    const text = document.getElementById('label-relayout-toast-text');
    if (toast && text) {
        text.textContent = msg;
        toast.style.display = 'block';
        // 1.5 saniye sonra otomatik kapatır
        setTimeout(() => { toast.style.display = 'none'; }, 1500);
    }
}

// Tesisat clipboard'unu temizle — mimari kopyala/yapıştır Ctrl+V ile çakışmasın
function clearPlumbingClipboard() {
    const im = window.plumbingManager?.interactionManager;
    if (!im) return;
    im.copiedPipes = null;
    im.cutPipes = null;
    im.cutPipesOriginalIds = null;
}

// Mevcut kattaki tüm mimariyi kopyala
export function copyFloorArchitecture() {
    if (!state.currentFloor) {
        alert('Aktif kat bulunamadı!');
        return;
    }

    clearPlumbingClipboard();

    const currentFloorId = state.currentFloor.id;
    console.log('Kopyalama başladı, kaynak kat:', currentFloorId, 'isPlaceholder:', state.currentFloor.isPlaceholder);

    // Kattaki tüm elemanları topla
    const floorData = {
        walls: state.walls.filter(w => w.floorId === currentFloorId),
        doors: state.doors.filter(d => d.wall && (!d.wall.floorId || d.wall.floorId === currentFloorId)),
        columns: state.columns.filter(c => c.floorId === currentFloorId),
        beams: state.beams.filter(b => b.floorId === currentFloorId),
        stairs: state.stairs.filter(s => s.floorId === currentFloorId),
        rooms: state.rooms.filter(r => r.floorId === currentFloorId),
        archDevices: (state.archDevices || []).filter(d => !d.floorId || d.floorId === currentFloorId),
        textAnnotations: (state.textAnnotations || []).filter(t => !t.floorId || t.floorId === currentFloorId)
    };

    // Derin kopyalama yap
    floorClipboard = JSON.parse(JSON.stringify(floorData));

    const totalItems = floorClipboard.walls.length +
                      floorClipboard.doors.length +
                      floorClipboard.columns.length +
                      floorClipboard.beams.length +
                      floorClipboard.stairs.length +
                      floorClipboard.rooms.length;

    console.log(`✓ Mimari plan kopyalandı: ${totalItems} eleman`);
}

// Kopyalanan mimariyi mevcut kata yapıştır (clearExisting parametresi eklendi)
export function pasteFloorArchitecture(clearExisting = true) {
    if (!floorClipboard) {
        alert('Önce bir mimari plan kopyalamalısınız!');
        return;
    }

    if (!state.currentFloor) {
        alert('Aktif kat bulunamadı!');
        return;
    }

    clearPlumbingClipboard();

    const currentFloorId = state.currentFloor.id;
    console.log('Yapıştırma başladı, hedef kat:', currentFloorId);

    // Seçime göre mevcut kattaki eski mimariyi temizle
    if (clearExisting) {
        const wallsToDelete = state.walls.filter(w => w.floorId === currentFloorId);
        state.doors = state.doors.filter(d => !d.wall || !wallsToDelete.includes(d.wall));
        state.walls = state.walls.filter(w => w.floorId !== currentFloorId);
        state.columns = state.columns.filter(c => c.floorId !== currentFloorId);
        state.beams = state.beams.filter(b => b.floorId !== currentFloorId);
        state.stairs = state.stairs.filter(s => s.floorId !== currentFloorId);
        state.rooms = state.rooms.filter(r => r.floorId !== currentFloorId);
        if (state.archDevices) {
            state.archDevices = state.archDevices.filter(d => d.floorId !== currentFloorId);
        }
        if (state.textAnnotations) {
            state.textAnnotations = state.textAnnotations.filter(t => t.floorId && t.floorId !== currentFloorId);
        }
    }

    // Node mapping için (duvarların node referanslarını korumak için)
    const nodeMap = new Map();

    // Duvarları yapıştır
    const newWalls = [];
    floorClipboard.walls.forEach(wallData => {
        const p1Key = `${wallData.p1.x},${wallData.p1.y}`;
        const p2Key = `${wallData.p2.x},${wallData.p2.y}`;

        let p1 = nodeMap.get(p1Key);
        if (!p1) {
            p1 = { x: wallData.p1.x, y: wallData.p1.y };
            nodeMap.set(p1Key, p1);
        }

        let p2 = nodeMap.get(p2Key);
        if (!p2) {
            p2 = { x: wallData.p2.x, y: wallData.p2.y };
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
            vents: [],
            description: wallData.description || ''
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

    const newNodes = Array.from(nodeMap.values());
    newNodes.forEach(node => {
        if (!state.nodes.includes(node)) {
            state.nodes.push(node);
        }
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
                floorId: currentFloorId
            };
            state.doors.push(newDoor);
        }
    });

    // Kolonları yapıştır
    floorClipboard.columns.forEach(columnData => {
        const newColumn = {
            ...columnData,
            center: { x: columnData.center.x, y: columnData.center.y },
            floorId: currentFloorId
        };
        state.columns.push(newColumn);
    });

    // Kirişleri yapıştır
    floorClipboard.beams.forEach(beamData => {
        const newBeam = {
            ...beamData,
            center: { x: beamData.center.x, y: beamData.center.y },
            floorId: currentFloorId
        };
        state.beams.push(newBeam);
    });

    // Merdivenleri yapıştır
    floorClipboard.stairs.forEach(stairData => {
        const newStair = {
            ...stairData,
            center: { x: stairData.center.x, y: stairData.center.y },
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
            center: roomData.center ? [...roomData.center] : undefined,
            centerOffset: roomData.centerOffset ? { ...roomData.centerOffset } : undefined,
            polygon: roomData.polygon ? JSON.parse(JSON.stringify(roomData.polygon)) : undefined,
            floorId: currentFloorId,
            birimNo: ''
        };
        state.rooms.push(newRoom);
    });

    // Mimari cihazları (alarm + yangın tüpü) yapıştır
    if (floorClipboard.archDevices && floorClipboard.archDevices.length > 0) {
        if (!state.archDevices) state.archDevices = [];
        floorClipboard.archDevices.forEach(devData => {
            state.archDevices.push({
                ...devData,
                center: { x: devData.center.x, y: devData.center.y },
                floorId: currentFloorId
            });
        });
    }

    // Metin notlarını yapıştır
    if (floorClipboard.textAnnotations && floorClipboard.textAnnotations.length > 0) {
        if (!state.textAnnotations) state.textAnnotations = [];
        floorClipboard.textAnnotations.forEach(tData => {
            state.textAnnotations.push({
                ...tData,
                id: `text_${Date.now()}_${Math.random().toString(16).slice(2,8)}`,
                floorId: currentFloorId
            });
        });
    }

    processWalls();
    saveState();
    update3DScene();
}

// Kopyalanan mimariyi diğer tüm katlara yapıştır
function pasteToAllFloors() {
    console.log('pasteToAllFloors başladı');
    
    // 🌟 HATA DÜZELTMESİ: Hafızadaki eski/bayat planın yapıştırılmasını önlemek için,
    // her "Tüm Katlara Yapıştır" tetiklendiğinde ÖNCE mevcut katın EN GÜNCEL halini otomatik kopyalıyoruz.
    copyFloorArchitecture();
    
    if (!floorClipboard) {
        console.error('Kopyalama başarısız, clipboard hala boş!');
        return;
    }
    console.log('Clipboard içeriği (Güncel):', floorClipboard);

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

        // Önce hedef kattaki mimariyi temizle
        const wallsToDelete = state.walls.filter(w => w.floorId === floorId);
        state.doors = state.doors.filter(d => !d.wall || !wallsToDelete.includes(d.wall));
        state.walls = state.walls.filter(w => w.floorId !== floorId);
        state.columns = state.columns.filter(c => c.floorId !== floorId);
        state.beams = state.beams.filter(b => b.floorId !== floorId);
        state.stairs = state.stairs.filter(s => s.floorId !== floorId);
        state.rooms = state.rooms.filter(r => r.floorId !== floorId);
        if (state.archDevices) {
            state.archDevices = state.archDevices.filter(d => d.floorId !== floorId);
        }

        // Her kat için node mapping
        const nodeMap = new Map();

        // Duvarları yapıştır
        const newWalls = [];
        floorClipboard.walls.forEach(wallData => {
            const p1Key = `${wallData.p1.x},${wallData.p1.y}`;
            const p2Key = `${wallData.p2.x},${wallData.p2.y}`;

            let p1 = nodeMap.get(p1Key);
            if (!p1) {
                p1 = { x: wallData.p1.x, y: wallData.p1.y };
                nodeMap.set(p1Key, p1);
            }

            let p2 = nodeMap.get(p2Key);
            if (!p2) {
                p2 = { x: wallData.p2.x, y: wallData.p2.y };
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

        const newNodes = Array.from(nodeMap.values());
        newNodes.forEach(node => {
            if (!state.nodes.includes(node)) {
                state.nodes.push(node);
            }
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
                center: { x: columnData.center.x, y: columnData.center.y },
                floorId: floorId
            };
            state.columns.push(newColumn);
        });

        // Kirişleri yapıştır
        floorClipboard.beams.forEach(beamData => {
            const newBeam = {
                ...beamData,
                center: { x: beamData.center.x, y: beamData.center.y },
                floorId: floorId
            };
            state.columns.push(newBeam); // Orijinal koddaki push hedefi korunmuştur
        });

        // Merdivenleri yapıştır
        floorClipboard.stairs.forEach(stairData => {
            const newStair = {
                ...stairData,
                center: { x: stairData.center.x, y: stairData.center.y },
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
                center: roomData.center ? [...roomData.center] : undefined,
                centerOffset: roomData.centerOffset ? { ...roomData.centerOffset } : undefined,
                polygon: roomData.polygon ? JSON.parse(JSON.stringify(roomData.polygon)) : undefined,
                floorId: floorId,
                birimNo: ''
            };
            state.rooms.push(newRoom);
        });

        // Mimari cihazları yapıştır
        if (floorClipboard.archDevices && floorClipboard.archDevices.length > 0) {
            if (!state.archDevices) state.archDevices = [];
            floorClipboard.archDevices.forEach(devData => {
                state.archDevices.push({
                    ...devData,
                    center: { x: devData.center.x, y: devData.center.y },
                    floorId: floorId
                });
            });
        }

        pastedFloorCount++;
    });

    if (window.renderMiniPanel) window.renderMiniPanel();

    processWalls(false, false, true); // Tüm katları baştan işler
    saveState();
    update3DScene();
    showFloorToast(`✓ Mimari plan ${pastedFloorCount} kata başarıyla yapıştırıldı`);
}
// Mevcut kattaki tüm mimariyi sil
function clearFloorArchitecture() {
    if (!state.currentFloor) {
        alert('Aktif kat bulunamadı!');
        return;
    }

    const currentFloorId = state.currentFloor.id;

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

    const confirmMsg = `${state.currentFloor.name} katındaki tüm mimari silinecek!\n\nEmin misiniz?`;
    if (!confirm(confirmMsg)) return;

    const wallsToDelete = state.walls.filter(w => w.floorId === currentFloorId);
    state.doors = state.doors.filter(d => !d.wall || !wallsToDelete.includes(d.wall));
    state.walls = state.walls.filter(w => w.floorId !== currentFloorId);
    state.columns = state.columns.filter(c => c.floorId !== currentFloorId);
    state.beams = state.beams.filter(b => b.floorId !== currentFloorId);
    state.stairs = state.stairs.filter(s => s.floorId !== currentFloorId);
    state.rooms = state.rooms.filter(r => r.floorId !== currentFloorId);
    if (state.archDevices) {
        state.archDevices = state.archDevices.filter(d => d.floorId !== currentFloorId);
    }

    setState({ selectedObject: null, selectedGroup: [] });

    processWalls();
    saveState();
    update3DScene();
    showFloorToast('× Kat mimarisi temizlendi');
}

// TÜM KATLARIN mimarisini siler (ctx-mimari-eksilt-tum-katlar bağlantısı)
function clearAllFloorsArchitecture() {
    const confirmMsg = `PROJEDEKİ TÜM KATLARIN mimari planı tamamen silinecek!\n\nEmin misiniz?`;
    if (!confirm(confirmMsg)) return;

    state.walls = [];
    state.doors = [];
    state.columns = [];
    state.beams = [];
    state.stairs = [];
    state.rooms = [];
    state.nodes = [];
    state.archDevices = [];
    if (state.textAnnotations) state.textAnnotations = [];

    setState({ selectedObject: null, selectedGroup: [] });

    processWalls(false, false, true); // Tüm kat topolojisini sıfırlar
    saveState();
    update3DScene();
    if (window.renderMiniPanel) window.renderMiniPanel();
    showFloorToast('× Tüm projenin mimarisi silindi');
}