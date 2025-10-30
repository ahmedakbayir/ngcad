// symmetry.js
import { state, setState, dom } from './main.js';
import { reflectPoint, getOrCreateNode } from './geometry.js';
import { wallExists } from './wall-handler.js'; // Veya geometry.js'den
import { createColumn } from './columns.js';
import { createBeam } from './beams.js';
import { createStairs } from './stairs.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { update3DScene } from './scene3d.js';
// Gerekirse turf import'u da buraya eklenebilir
// import * as turf from '@turf/turf'; // Eğer @turf/turf import ediliyorsa

// symmetry.js - calculateCopyPreview fonksiyonunu EXPORT EDİN

/**
 * Ctrl ile birebir kopya önizlemesini hesaplar
 * @param {object} axisP1 - Eksen başlangıç noktası {x, y}
 * @param {object} axisP2 - Eksen bitiş noktası {x, y}
 */
export function calculateCopyPreview(axisP1, axisP2) {
    if (!axisP1 || !axisP2) {
        setState({ symmetryPreviewElements: { 
            nodes: [], walls: [], doors: [], windows: [], vents: [], 
            columns: [], beams: [], stairs: [], rooms: [] 
        }});
        return;
    }

    const preview = {
        nodes: [], walls: [], doors: [], windows: [], vents: [], 
        columns: [], beams: [], stairs: [], rooms: []
    };
    
    // Çeviri vektörü
    const translationX = axisP2.x - axisP1.x;
    const translationY = axisP2.y - axisP1.y;
    
    const nodeMap = new Map();

    // 1. Nodeları kopyala
    state.nodes.forEach(node => {
        const copied = {
            x: node.x + translationX,
            y: node.y + translationY
        };
        nodeMap.set(node, copied);
        preview.nodes.push(copied);
    });

    // 2. Duvarları kopyala
    state.walls.forEach(wall => {
        const copiedP1 = nodeMap.get(wall.p1);
        const copiedP2 = nodeMap.get(wall.p2);
        if (copiedP1 && copiedP2) {
            preview.walls.push({
                p1: copiedP1,
                p2: copiedP2,
                thickness: wall.thickness || state.wallThickness,
                wallType: wall.wallType || 'normal'
            });
        }
    });

    // 3. Kapıları kopyala
    state.doors.forEach(door => {
        const wall = door.wall;
        const copiedP1 = nodeMap.get(wall.p1);
        const copiedP2 = nodeMap.get(wall.p2);
        if (copiedP1 && copiedP2) {
            const previewWall = { p1: copiedP1, p2: copiedP2 };
            preview.doors.push({
                wall: previewWall,
                pos: door.pos,
                width: door.width,
                type: door.type
            });
        }
    });

    // 4. Pencereleri kopyala
    state.walls.forEach(wall => {
        const copiedP1 = nodeMap.get(wall.p1);
        const copiedP2 = nodeMap.get(wall.p2);
        if (copiedP1 && copiedP2) {
            const previewWall = { p1: copiedP1, p2: copiedP2 };
            
            (wall.windows || []).forEach(window => {
                preview.windows.push({
                    wall: previewWall,
                    pos: window.pos,
                    width: window.width,
                    type: window.type,
                    roomName: window.roomName
                });
            });
            
            (wall.vents || []).forEach(vent => {
                preview.vents.push({
                    wall: previewWall,
                    pos: vent.pos,
                    width: vent.width,
                    type: vent.type
                });
            });
        }
    });

    // 5. Kolonları kopyala
    state.columns.forEach(col => {
        const copiedCenter = {
            x: col.center.x + translationX,
            y: col.center.y + translationY
        };
        preview.columns.push({
            ...col, 
            center: copiedCenter, 
            rotation: col.rotation || 0
        });
    });

    // 6. Kirişleri kopyala
    state.beams.forEach(beam => {
        const copiedCenter = {
            x: beam.center.x + translationX,
            y: beam.center.y + translationY
        };
        preview.beams.push({
            ...beam, 
            center: copiedCenter, 
            rotation: beam.rotation || 0
        });
    });

    // 7. Merdivenleri kopyala
    state.stairs.forEach(stair => {
        const copiedCenter = {
            x: stair.center.x + translationX,
            y: stair.center.y + translationY
        };
        preview.stairs.push({
            ...stair, 
            center: copiedCenter, 
            rotation: stair.rotation || 0
        });
    });

    // 8. Odaları kopyala
    state.rooms.forEach(room => {
        if (room.polygon?.geometry?.coordinates) {
            const coords = room.polygon.geometry.coordinates[0];
            const copiedCoords = coords.map(p => [p[0] + translationX, p[1] + translationY]);

            if (copiedCoords.length >= 3) {
                // Poligonu kapat
                if (copiedCoords[0][0] !== copiedCoords[copiedCoords.length - 1][0] ||
                    copiedCoords[0][1] !== copiedCoords[copiedCoords.length - 1][1]) {
                    copiedCoords.push([...copiedCoords[0]]);
                }
                
                let copiedCenter = null;
                if (room.center) {
                    copiedCenter = [
                        room.center[0] + translationX,
                        room.center[1] + translationY
                    ];
                }
                
                try {
                    const copiedPolygon = turf.polygon([copiedCoords]);
                    preview.rooms.push({
                        polygon: copiedPolygon, 
                        name: room.name, 
                        center: copiedCenter
                    });
                } catch (e) {
                    console.error("Kopya önizleme poligonu oluşturulamadı:", e);
                }
            }
        }
    });

    setState({ symmetryPreviewElements: preview });
}

/**
 * Verilen eksene göre tüm elemanların simetri önizlemesini hesaplar ve state'i günceller.
 * @param {object} axisP1 - Eksen başlangıç noktası {x, y}
 * @param {object} axisP2 - Eksen bitiş noktası {x, y}
 */
export function calculateSymmetryPreview(axisP1, axisP2) {
    if (!axisP1 || !axisP2) {
        setState({ symmetryPreviewElements: { nodes: [], walls: [], doors: [], windows: [], vents: [], columns: [], beams: [], stairs: [], rooms: [] } });
        return;
    }

    const preview = {
        nodes: [], walls: [], doors: [], windows: [], vents: [], columns: [], beams: [], stairs: [], rooms: []
    };
    const nodeMap = new Map(); // Orijinal node -> Yansıyan node koordinatı eşlemesi

    // 1. Nodeları yansıt (sadece koordinatları)
    state.nodes.forEach(node => {
        const reflected = reflectPoint(node, axisP1, axisP2);
        if (reflected) {
            nodeMap.set(node, reflected);
            preview.nodes.push(reflected);
        }
    });

    const axisAngleRad = Math.atan2(axisP2.y - axisP1.y, axisP2.x - axisP1.x);

    // 2. Duvarları yansıt
    state.walls.forEach(wall => {
        const reflectedP1 = nodeMap.get(wall.p1);
        const reflectedP2 = nodeMap.get(wall.p2);
        if (reflectedP1 && reflectedP2) {
            preview.walls.push({
                p1: reflectedP1,
                p2: reflectedP2,
                thickness: wall.thickness || state.wallThickness,
                wallType: wall.wallType || 'normal'
            });
        }
    });

    // 3. Kapıları yansıt
    state.doors.forEach(door => {
        const wall = door.wall;
        const reflectedP1 = nodeMap.get(wall.p1);
        const reflectedP2 = nodeMap.get(wall.p2);
        if (reflectedP1 && reflectedP2) {
            const previewWall = { p1: reflectedP1, p2: reflectedP2 };
            const reflectedWallLen = Math.hypot(reflectedP2.x - reflectedP1.x, reflectedP2.y - reflectedP1.y);
            const originalWallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            // Orijinal duvar uzunluğu sıfıra çok yakınsa veya sıfırsa NaN hatasını önle
             if (originalWallLen < 1e-6) {
                 console.warn("calculateSymmetryPreview: Orijinal duvar uzunluğu çok küçük.", wall);
                 return; // Bu kapıyı atla
             }
            // DÜZELTME: (1 - door.pos / ...) yerine (door.pos / ...) kullanıldı
            const reflectedPos = reflectedWallLen > 0.1 ? (reflectedWallLen * (door.pos / originalWallLen)) : reflectedWallLen / 2;

            preview.doors.push({
                wall: previewWall,
                pos: reflectedPos,
                width: door.width,
                type: door.type
            });
        }
    });

    // 4. Pencereleri ve Menfezleri yansıt
    state.walls.forEach(wall => {
        const reflectedP1 = nodeMap.get(wall.p1);
        const reflectedP2 = nodeMap.get(wall.p2);
        if (reflectedP1 && reflectedP2) {
            const previewWall = { p1: reflectedP1, p2: reflectedP2 };
            const reflectedWallLen = Math.hypot(reflectedP2.x - reflectedP1.x, reflectedP2.y - reflectedP1.y);
            const originalWallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
             if (originalWallLen < 1e-6) return; // Sıfıra bölme hatasını önle

            (wall.windows || []).forEach(window => {
                // DÜZELTME: (1 - window.pos / ...) yerine (window.pos / ...) kullanıldı
                const reflectedPos = reflectedWallLen > 0.1 ? (reflectedWallLen * (window.pos / originalWallLen)) : reflectedWallLen / 2;
                preview.windows.push({
                    wall: previewWall, pos: reflectedPos, width: window.width, type: window.type, roomName: window.roomName
                });
            });
            (wall.vents || []).forEach(vent => {
                // DÜZELTME: (1 - vent.pos / ...) yerine (vent.pos / ...) kullanıldı
                const reflectedPos = reflectedWallLen > 0.1 ? (reflectedWallLen * (vent.pos / originalWallLen)) : reflectedWallLen / 2;
                preview.vents.push({
                    wall: previewWall, pos: reflectedPos, width: vent.width, type: vent.type
                });
            });
        }
    });

    // 5. Kolonları yansıt
    state.columns.forEach(col => {
        const reflectedCenter = reflectPoint(col.center, axisP1, axisP2);
        if (reflectedCenter) {
            const originalRotationRad = (col.rotation || 0) * Math.PI / 180;
            const reflectedRotationRad = 2 * axisAngleRad - originalRotationRad;
            preview.columns.push({
                ...col, center: reflectedCenter, rotation: reflectedRotationRad * 180 / Math.PI
            });
        }
    });

    // 6. Kirişleri yansıt
    state.beams.forEach(beam => {
        const reflectedCenter = reflectPoint(beam.center, axisP1, axisP2);
        if (reflectedCenter) {
            const originalRotationRad = (beam.rotation || 0) * Math.PI / 180;
            const reflectedRotationRad = 2 * axisAngleRad - originalRotationRad;
            preview.beams.push({
                ...beam, center: reflectedCenter, rotation: reflectedRotationRad * 180 / Math.PI
            });
        }
    });

    // 7. Merdivenleri yansıt
    state.stairs.forEach(stair => {
        const reflectedCenter = reflectPoint(stair.center, axisP1, axisP2);
        if (reflectedCenter) {
            const originalRotationRad = (stair.rotation || 0) * Math.PI / 180;
            const reflectedRotationRad = 2 * axisAngleRad - originalRotationRad;
            preview.stairs.push({
                ...stair, center: reflectedCenter, rotation: reflectedRotationRad * 180 / Math.PI
            });
        }
    });

    // 8. Odaları yansıt
    state.rooms.forEach(room => {
        if (room.polygon?.geometry?.coordinates) {
            const coords = room.polygon.geometry.coordinates[0];
            const reflectedCoords = coords.map(p => {
                const reflected = reflectPoint({ x: p[0], y: p[1] }, axisP1, axisP2);
                return reflected ? [reflected.x, reflected.y] : null;
            }).filter(p => p !== null);

            if (reflectedCoords.length >= 3) {
                 if (reflectedCoords[0][0] !== reflectedCoords[reflectedCoords.length - 1][0] ||
                     reflectedCoords[0][1] !== reflectedCoords[reflectedCoords.length - 1][1]) {
                     reflectedCoords.push([...reflectedCoords[0]]);
                 }
                let reflectedCenter = null;
                if (room.center) {
                    reflectedCenter = reflectPoint({ x: room.center[0], y: room.center[1] }, axisP1, axisP2);
                }
                try {
                    const reflectedPolygon = turf.polygon([reflectedCoords]);
                    preview.rooms.push({
                        polygon: reflectedPolygon, name: room.name, center: reflectedCenter ? [reflectedCenter.x, reflectedCenter.y] : null
                    });
                } catch (e) { console.error("Önizleme poligonu oluşturulamadı:", e); }
            }
        }
    });

    setState({ symmetryPreviewElements: preview });
}



/**
 * Ctrl ile birebir kopya oluşturur (simetri değil, düz çeviri/translasyon)
 * @param {object} axisP1 - Eksen başlangıç noktası {x, y}
 * @param {object} axisP2 - Eksen bitiş noktası {x, y}
 */
export function applyCopy(axisP1, axisP2) {
    if (!axisP1 || !axisP2) return;

    // DÜZELTİLMİŞ: Çeviri vektörü - 2x kaldırıldı
    const translationX = axisP2.x - axisP1.x;  // ÖNCEKİ: * 2
    const translationY = axisP2.y - axisP1.y;  // ÖNCEKİ: * 2

    const nodeMap = new Map();
    const newWalls = [];
    const newDoors = [];
    const newWindowsMap = new Map();
    const newVentsMap = new Map();
    const newColumns = [];
    const newBeams = [];
    const newStairs = [];
    const copiedRoomNames = new Map();

    // 1. Nodeları Kopyala (çeviri uygula)
    state.nodes.forEach(node => {
        const copiedCoord = {
            x: node.x + translationX,
            y: node.y + translationY
        };
        const newNode = getOrCreateNode(copiedCoord.x, copiedCoord.y);
        nodeMap.set(node, newNode);
    });

    // 2. Duvarları Oluştur
    state.walls.forEach(wall => {
        const newP1 = nodeMap.get(wall.p1);
        const newP2 = nodeMap.get(wall.p2);
        if (newP1 && newP2 && newP1 !== newP2 && !wallExists(newP1, newP2)) {
            const newWall = {
                type: 'wall', p1: newP1, p2: newP2,
                thickness: wall.thickness || state.wallThickness,
                wallType: wall.wallType || 'normal', windows: [], vents: []
            };
            newWalls.push(newWall);
            newWindowsMap.set(newWall, []);
            newVentsMap.set(newWall, []);

            // Pencereleri ve menfezleri aynı pozisyonda kopyala
            (wall.windows || []).forEach(window => {
                newWindowsMap.get(newWall).push({ ...window });
            });
            (wall.vents || []).forEach(vent => {
                newVentsMap.get(newWall).push({ ...vent });
            });
        }
    });

    // 3. Kapıları Oluştur
    state.doors.forEach(door => {
        const wall = door.wall;
        const newP1 = nodeMap.get(wall.p1);
        const newP2 = nodeMap.get(wall.p2);
        const newWallRef = newWalls.find(nw => (nw.p1 === newP1 && nw.p2 === newP2) || (nw.p1 === newP2 && nw.p2 === newP1));

        if (newWallRef) {
            newDoors.push({ ...door, wall: newWallRef });
        }
    });

    // 4. Kolonları Oluştur (rotasyon aynı kalır)
    state.columns.forEach(col => {
        const copiedCenter = {
            x: col.center.x + translationX,
            y: col.center.y + translationY
        };
        const newCol = createColumn(copiedCenter.x, copiedCenter.y, 0);
        Object.assign(newCol, {
            width: col.width || col.size, height: col.height || col.size,
            size: Math.max(col.width || col.size, col.height || col.size),
            rotation: col.rotation || 0, // Rotasyon aynı kalır
            hollowWidth: col.hollowWidth, hollowHeight: col.hollowHeight,
            hollowOffsetX: col.hollowOffsetX, hollowOffsetY: col.hollowOffsetY
        });
        newColumns.push(newCol);
    });

    // 5. Kirişleri Oluştur (rotasyon aynı kalır)
    state.beams.forEach(beam => {
        const copiedCenter = {
            x: beam.center.x + translationX,
            y: beam.center.y + translationY
        };
        const newBeam = createBeam(copiedCenter.x, copiedCenter.y, beam.width, beam.height, beam.rotation || 0);
        Object.assign(newBeam, {
            depth: beam.depth, hollowWidth: beam.hollowWidth, hollowHeight: beam.hollowHeight,
            hollowOffsetX: beam.hollowOffsetX, hollowOffsetY: beam.hollowOffsetY
        });
        newBeams.push(newBeam);
    });

    // 6. Merdivenleri Oluştur (rotasyon aynı kalır)
    state.stairs.forEach(stair => {
        const copiedCenter = {
            x: stair.center.x + translationX,
            y: stair.center.y + translationY
        };
        // --- DÜZELTME: isLanding bilgisi eklendi ---
        const newStair = createStairs(copiedCenter.x, copiedCenter.y, stair.width, stair.height, stair.rotation || 0, stair.isLanding);
        newStairs.push(newStair);
    });

    // 7. Oda İsimlerini Kopyala
    state.rooms.forEach(room => {
        if (room.center) {
            const copiedCenter = {
                x: room.center[0] + translationX,
                y: room.center[1] + translationY
            };
            const key = `${copiedCenter.x.toFixed(3)},${copiedCenter.y.toFixed(3)}`;
            copiedRoomNames.set(key, room.name);
        }
    });

    // 8. Yeni Elemanları State'e Ekle
    state.walls.push(...newWalls);
    state.doors.push(...newDoors);
    newWindowsMap.forEach((windows, wall) => wall.windows = windows);
    newVentsMap.forEach((vents, wall) => wall.vents = vents);
    state.columns.push(...newColumns);
    state.beams.push(...newBeams);
    state.stairs.push(...newStairs);

    // 9. Duvarları İşle
    processWalls();

    // 10. Yeni Odalara İsim Ata
    state.rooms.forEach(newRoom => {
        if (newRoom.name === 'MAHAL' && newRoom.center) {
            const key = `${newRoom.center[0].toFixed(3)},${newRoom.center[1].toFixed(3)}`;
            const copiedName = copiedRoomNames.get(key);
            if (copiedName) newRoom.name = copiedName;
        }
    });

    // 11. Kaydet ve Güncelle
    saveState();
    if (dom.mainContainer.classList.contains('show-3d')) {
        setTimeout(update3DScene, 0);
    }
}


/**
 * Simetri eksenine göre mevcut planı kopyalar ve yansıtır.
 * @param {object} axisP1 - Eksen başlangıç noktası {x, y}
 * @param {object} axisP2 - Eksen bitiş noktası {x, y}
 */
export function applySymmetry(axisP1, axisP2) {
    if (!axisP1 || !axisP2) return;

    const nodeMap = new Map();
    const newWalls = [];
    const newDoors = [];
    const newWindowsMap = new Map();
    const newVentsMap = new Map();
    const newColumns = [];
    const newBeams = [];
    const newStairs = [];
    // DÜZELTME: Sadece isim değil, offset bilgisini de saklamak için Map'in değerini obje yap
    const reflectedRoomDataMap = new Map();

    const axisAngleRad = Math.atan2(axisP2.y - axisP1.y, axisP2.x - axisP1.x);

    // 1. Nodeları Yansıt
    state.nodes.forEach(node => {
        const reflectedCoord = reflectPoint(node, axisP1, axisP2);
        if (reflectedCoord) {
            const newNode = getOrCreateNode(reflectedCoord.x, reflectedCoord.y);
            nodeMap.set(node, newNode);
        }
    });

    // 2. Duvarları Oluştur
    state.walls.forEach(wall => {
        const newP1 = nodeMap.get(wall.p1);
        const newP2 = nodeMap.get(wall.p2);
        if (newP1 && newP2 && newP1 !== newP2 && !wallExists(newP1, newP2)) {
            const newWall = {
                type: 'wall', p1: newP1, p2: newP2,
                thickness: wall.thickness || state.wallThickness,
                wallType: wall.wallType || 'normal', windows: [], vents: []
            };
            newWalls.push(newWall);
            newWindowsMap.set(newWall, []);
            newVentsMap.set(newWall, []);

            const originalWallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            const newWallLen = Math.hypot(newP2.x - newP1.x, newP2.y - newP1.y);
             if (originalWallLen < 1e-6) return; // Sıfıra bölme hatasını önle

            (wall.windows || []).forEach(window => {
                // DÜZELTME: (1 - window.pos / ...) yerine (window.pos / ...) kullanıldı
                const reflectedPos = newWallLen > 0.1 ? (newWallLen * (window.pos / originalWallLen)) : newWallLen / 2;
                newWindowsMap.get(newWall).push({ ...window, pos: reflectedPos }); // Kopyala ve pos'u güncelle
            });
            (wall.vents || []).forEach(vent => {
                // DÜZELTME: (1 - vent.pos / ...) yerine (vent.pos / ...) kullanıldı
                const reflectedPos = newWallLen > 0.1 ? (newWallLen * (vent.pos / originalWallLen)) : newWallLen / 2;
                newVentsMap.get(newWall).push({ ...vent, pos: reflectedPos }); // Kopyala ve pos'u güncelle
            });
        }
    });

    // 3. Kapıları Oluştur
    state.doors.forEach(door => {
        const wall = door.wall;
        const newP1 = nodeMap.get(wall.p1);
        const newP2 = nodeMap.get(wall.p2);
        const newWallRef = newWalls.find(nw => (nw.p1 === newP1 && nw.p2 === newP2) || (nw.p1 === newP2 && nw.p2 === newP1));

        if (newWallRef) {
            const originalWallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            const newWallLen = Math.hypot(newWallRef.p2.x - newWallRef.p1.x, newWallRef.p2.y - newWallRef.p1.y);
             if (originalWallLen < 1e-6) return; // Sıfıra bölme hatasını önle
            // DÜZELTME: (1 - door.pos / ...) yerine (door.pos / ...) kullanıldı
            const reflectedPos = newWallLen > 0.1 ? (newWallLen * (door.pos / originalWallLen)) : newWallLen / 2;
            newDoors.push({ ...door, wall: newWallRef, pos: reflectedPos }); // Kopyala, wall ve pos'u güncelle
        }
    });

    // 4. Kolonları Oluştur
    state.columns.forEach(col => {
        const reflectedCenter = reflectPoint(col.center, axisP1, axisP2);
        if (reflectedCenter) {
            const originalRotationRad = (col.rotation || 0) * Math.PI / 180;
            const reflectedRotationRad = 2 * axisAngleRad - originalRotationRad;
            const newCol = createColumn(reflectedCenter.x, reflectedCenter.y, 0);
            Object.assign(newCol, { // Orijinal özellikleri kopyala, center ve rotation hariç
                width: col.width || col.size, height: col.height || col.size,
                size: Math.max(col.width || col.size, col.height || col.size),
                hollowWidth: col.hollowWidth, hollowHeight: col.hollowHeight,
                hollowOffsetX: col.hollowOffsetX, hollowOffsetY: col.hollowOffsetY
            });
            newCol.rotation = reflectedRotationRad * 180 / Math.PI;
            newColumns.push(newCol);
        }
    });

    // 5. Kirişleri Oluştur
    state.beams.forEach(beam => {
        const reflectedCenter = reflectPoint(beam.center, axisP1, axisP2);
        if (reflectedCenter) {
            const originalRotationRad = (beam.rotation || 0) * Math.PI / 180;
            const reflectedRotationRad = 2 * axisAngleRad - originalRotationRad;
            const newBeam = createBeam(reflectedCenter.x, reflectedCenter.y, beam.width, beam.height, reflectedRotationRad * 180 / Math.PI);
            Object.assign(newBeam, { // Orijinal özellikleri kopyala, center, rotation, width, height hariç
                 depth: beam.depth, hollowWidth: beam.hollowWidth, hollowHeight: beam.hollowHeight,
                 hollowOffsetX: beam.hollowOffsetX, hollowOffsetY: beam.hollowOffsetY
            });
            newBeams.push(newBeam);
        }
    });

    // 6. Merdivenleri Oluştur
    state.stairs.forEach(stair => {
        const reflectedCenter = reflectPoint(stair.center, axisP1, axisP2);
        if (reflectedCenter) {
            const originalRotationRad = (stair.rotation || 0) * Math.PI / 180;
            const reflectedRotationRad = 2 * axisAngleRad - originalRotationRad;
            // --- DÜZELTME: isLanding bilgisi eklendi ---
            const newStair = createStairs(reflectedCenter.x, reflectedCenter.y, stair.width, stair.height, reflectedRotationRad * 180 / Math.PI, stair.isLanding);
            // stepCount zaten createStairs içinde hesaplanır
            newStairs.push(newStair);
        }
    });

    // 7. Oda İsimlerini ve Göreceli Konumlarını Yansıt (DÜZELTİLMİŞ)
    state.rooms.forEach(room => {
        if (room.center && room.centerOffset) { // centerOffset olduğundan emin ol
            const reflectedCenter = reflectPoint({ x: room.center[0], y: room.center[1] }, axisP1, axisP2);
            if (reflectedCenter) {
                // BBox'a göre yansıtma (Ayna ekseni dikeye yakınsa X offset'i ters çevir, yataya yakınsa Y'yi)
                const axisAngleDeg = (axisAngleRad * 180 / Math.PI) % 180;
                let reflectedOffsetX = room.centerOffset.x;
                let reflectedOffsetY = room.centerOffset.y;
                
                // Eğer eksen çoğunlukla dikeyse (örn. 45-135 derece arası)
                const isAxisVerticalish = (Math.abs(axisAngleDeg) > 45 && Math.abs(axisAngleDeg) < 135);
                
                if (isAxisVerticalish) {
                    reflectedOffsetX = 1.0 - reflectedOffsetX;
                } else { // Çoğunlukla yatay
                    reflectedOffsetY = 1.0 - reflectedOffsetY;
                }

                // Yansıtılmış merkezi ve yansıtılmış offset'i sakla
                reflectedRoomDataMap.set(JSON.stringify(reflectedCenter), { 
                    name: room.name, 
                    centerOffset: { x: reflectedOffsetX, y: reflectedOffsetY },
                    originalCenter: reflectedCenter // Eşleştirme için yansıtılmış merkezi de sakla
                });
            }
        }
    });
    // --- DÜZELTME SONU (Adım 7) ---

    // 8. Yeni Elemanları State'e Ekle
    state.walls.push(...newWalls);
    state.doors.push(...newDoors);
    newWindowsMap.forEach((windows, wall) => wall.windows = windows);
    newVentsMap.forEach((vents, wall) => wall.vents = vents);
    state.columns.push(...newColumns);
    state.beams.push(...newBeams);
    state.stairs.push(...newStairs);

    // 9. Duvarları İşle
    processWalls(); // Bu işlem detectRooms'u çağırır ve yeni odalar 'MAHAL' ismiyle oluşur

    // 10. Yeni Odalara İsim Ata (DÜZELTİLMİŞ)
    const reflectedCenters = Array.from(reflectedRoomDataMap.keys()).map(k => JSON.parse(k));

    state.rooms.forEach(newRoom => {
        // Sadece 'MAHAL' olanları ve merkezi olanları işle
        if (newRoom.name === 'MAHAL' && newRoom.center) {
            
            let bestMatchData = null;
            let minCenterDist = Infinity;
            
            // Yeni odanın (detectRooms tarafından bulunan) merkezine en yakın yansıtılmış merkezi bul
            reflectedRoomDataMap.forEach((data, centerKey) => {
                const refCenter = data.originalCenter; // Sakladığımız yansıtılmış merkezi al
                const dist = Math.hypot(newRoom.center[0] - refCenter.x, newRoom.center[1] - refCenter.y);
                
                // Eğer merkezler 100cm'den (keyfi tolerans) yakınsa ve en yakınıysa
                if (dist < 100 && dist < minCenterDist) { 
                    minCenterDist = dist;
                    bestMatchData = { data: data, key: centerKey };
                }
            });

            // Eşleşme bulunduysa
            if (bestMatchData) {
                const matchData = bestMatchData.data;
                
                newRoom.name = matchData.name; // İsmi ata
                newRoom.centerOffset = matchData.centerOffset; // Yansıtılmış centerOffset'i ata

                // Yeni merkezin, devralınan offset'e göre olması gereken yeri hesapla
                try {
                    const bbox = turf.bbox(newRoom.polygon);
                    const bboxWidth = bbox[2] - bbox[0];
                    const bboxHeight = bbox[3] - bbox[1];

                    if (bboxWidth > 0 && bboxHeight > 0) {
                        let expectedCenterX = bbox[0] + bboxWidth * newRoom.centerOffset.x;
                        let expectedCenterY = bbox[1] + bboxHeight * newRoom.centerOffset.y;

                        // Eğer beklenen merkez poligon içindeyse onu kullan
                        if (turf.booleanPointInPolygon([expectedCenterX, expectedCenterY], newRoom.polygon)) {
                            newRoom.center = [expectedCenterX, expectedCenterY];
                        }
                        // Değilse, detectRooms'un bulduğu (muhtemelen pointOnFeature) merkez kalsın.
                    }
                } catch(e) {
                     console.error("Simetri mahal merkezi ayarlarken BBox hatası:", e, newRoom);
                     // Hata olursa detectRooms'un merkezini kullanmaya devam et
                }
                
                // Eşleşen odayı Map'ten sil
                reflectedRoomDataMap.delete(bestMatchData.key);
            }
        }
    });
    // --- DÜZELTME SONU (Adım 10) ---

    // 11. Kaydet ve Güncelle
    saveState();
    if (dom.mainContainer.classList.contains('show-3d')) {
        setTimeout(update3DScene, 0);
    }
}