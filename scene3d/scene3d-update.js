// scene3d-update.js
// Ana 3D güncelleme döngüsünü (update3DScene) yönetir.

import * as THREE from "three";
import {
    scene, camera, renderer, controls, sceneObjects,orbitControls,
    wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial,
    mullionMaterial, sillMaterial, handleMaterial, floorMaterial,
    stairMaterial, stairMaterialTop, ventMaterial, trimMaterial,
    balconyRailingMaterial, glassMaterial, halfWallCapMaterial,
    handrailWoodMaterial, balusterMaterial, stepNosingMaterial,
    textureLoader, pictureFrameMaterial // İsim hatası da düzeltildi
    } from "./scene3d-core.js";

// Mesh oluşturma fonksiyonlarını import et
import {createWallSegmentMesh, createDoorMesh, createLintelMesh,
    createComplexWindow, createWallPieceMesh, createVentMesh} 
    from "./scene3d-walls.js";
import {createColumnMesh, createBeamMesh, createStairMesh} from "./scene3d-structures.js";
import {getArcWallPoints } from "../draw/geometry.js";
import {state, setState, dom, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT,
    BATHROOM_WINDOW_BOTTOM_HEIGHT, BATHROOM_WINDOW_TOP_HEIGHT } from "../general-files/main.js";
import { findLargestAvailableSegment } from "../wall/wall-item-utils.js";

/**
 * 2D veriye (state) dayanarak 3D sahneyi temizler ve yeniden oluşturur.
 */
export function update3DScene() {
    if (!dom.mainContainer.classList.contains('show-3d') || !sceneObjects) return;
    sceneObjects.clear(); // Sahnedeki eski objeleri temizle

    const solidOpacity = 1; // 0.75;

    // Malzemelerin opaklık/şeffaflık ayarlarını güncelle
    wallMaterial.transparent = true; wallMaterial.opacity = solidOpacity; wallMaterial.needsUpdate = true;
    doorMaterial.transparent = true; doorMaterial.opacity = solidOpacity; doorMaterial.needsUpdate = true;
    windowMaterial.opacity = 0.3; windowMaterial.transparent = true; windowMaterial.needsUpdate = true;
    columnMaterial.transparent = true; columnMaterial.opacity = solidOpacity; columnMaterial.needsUpdate = true;
    beamMaterial.transparent = true; beamMaterial.opacity = solidOpacity; beamMaterial.needsUpdate = true;
    mullionMaterial.transparent = true; mullionMaterial.opacity = solidOpacity; mullionMaterial.needsUpdate = true;
    sillMaterial.transparent = true; sillMaterial.opacity = solidOpacity + 0.1; sillMaterial.needsUpdate = true;
    handleMaterial.transparent = false; handleMaterial.opacity = 1.0; handleMaterial.needsUpdate = true;
    floorMaterial.transparent = true; floorMaterial.opacity = 0.8; floorMaterial.needsUpdate = true;
    stairMaterial.transparent = true; stairMaterial.opacity = solidOpacity; stairMaterial.needsUpdate = true;
    stairMaterialTop.transparent = false; stairMaterialTop.opacity = 1.0; stairMaterialTop.needsUpdate = true;
    ventMaterial.transparent = true; ventMaterial.opacity = solidOpacity; ventMaterial.needsUpdate = true;
    trimMaterial.transparent = true; trimMaterial.opacity = solidOpacity; trimMaterial.needsUpdate = true;
    balconyRailingMaterial.transparent = true; balconyRailingMaterial.opacity = 0.85; balconyRailingMaterial.needsUpdate = true;
    glassMaterial.transparent = true; glassMaterial.opacity = 0.4; glassMaterial.needsUpdate = true;
    halfWallCapMaterial.transparent = true; halfWallCapMaterial.opacity = solidOpacity; halfWallCapMaterial.needsUpdate = true;
    handrailWoodMaterial.transparent = true; handrailWoodMaterial.opacity = solidOpacity; handrailWoodMaterial.needsUpdate = true;
    balusterMaterial.transparent = true; balusterMaterial.opacity = solidOpacity; balusterMaterial.needsUpdate = true;
    stepNosingMaterial.transparent = true; stepNosingMaterial.opacity = solidOpacity + 0.1; stepNosingMaterial.needsUpdate = true;
    // Çerçeve malzemesi için opaklık (eğer gerekirse)
    if (pictureFrameMaterial) {
        pictureFrameMaterial.transparent = true; pictureFrameMaterial.opacity = solidOpacity; pictureFrameMaterial.needsUpdate = true;
    }

    // 3D görünüm moduna göre filtreleme
    const currentFloorId = state.currentFloor?.id;
    const viewMode = state.viewMode3D || 'floor';

    // 'floor' modunda sadece aktif kat, 'building' modunda tüm katlar görünür
    const shouldShowFloor = (floorId) => {
        if (viewMode === 'building') return true; // Tüm katlar
        // Sadece currentFloorId ve floorId eşleşiyorsa göster (floorId olmayan öğeleri gösterme!)
        return currentFloorId && floorId === currentFloorId;
    };

    const walls = (state.walls || []).filter(w => shouldShowFloor(w.floorId));
    // DÜZELTME: Kapılar duvar üzerinden filtrelenmeli (d.wall.floorId)
    const doors = (state.doors || []).filter(d => d.wall && shouldShowFloor(d.wall.floorId));
    const columns = (state.columns || []).filter(c => shouldShowFloor(c.floorId));
    const beams = (state.beams || []).filter(b => shouldShowFloor(b.floorId));
    const rooms = (state.rooms || []).filter(r => shouldShowFloor(r.floorId));
    const stairs = (state.stairs || []).filter(s => shouldShowFloor(s.floorId));

    // Kat yüksekliklerini Map'te sakla (floorId -> elevation in cm)
    const floorElevations = new Map();
    (state.floors || []).forEach(floor => {
        if (!floor.isPlaceholder) {
            // bottomElevation zaten cm cinsinden, olduğu gibi kullan
            floorElevations.set(floor.id, floor.bottomElevation || 0);
        }
    });

    // Bir elementin kat yüksekliğini döndüren helper fonksiyon
    const getFloorElevation = (floorId) => {
        if (!floorId) return 0;
        return floorElevations.get(floorId) || 0;
    };

    // --- Duvarları, Kapıları, Pencereleri ve Menfezleri Oluştur ---
    walls.forEach(w => {
        if (!w.p1 || !w.p2) return;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 1) return;
        const wallThickness = w.thickness || state.wallThickness;
        const wallType = w.wallType || 'normal';
        const floorElevation = getFloorElevation(w.floorId);

        if (w.isArc && w.arcControl1 && w.arcControl2) {
            const arcPoints = getArcWallPoints(w, 30);
            for (let i = 0; i < arcPoints.length - 1; i++) {
                const p1 = arcPoints[i];
                const p2 = arcPoints[i + 1];
                const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial, false, false);
                if (segMesh) {
                    segMesh.position.y = floorElevation;
                    sceneObjects.add(segMesh);
                }
            }
            return; // Arc duvarlarda kapı/pencere desteği şimdilik yok
        }

        const segmentBreakingItems = []; 
        (doors.filter(d => d.wall === w)).forEach(d => segmentBreakingItems.push({ item: d, type: 'door', pos: d.pos, width: d.width }));
        (w.windows || []).forEach(win => segmentBreakingItems.push({ item: { ...win, roomName: win.roomName }, type: 'window', pos: win.pos, width: win.width }));
        segmentBreakingItems.sort((a, b) => a.pos - b.pos);
        
        let lastPos = 0;
        let lastPosIsNode = true; 
        const dx = (w.p2.x - w.p1.x) / wallLen; const dy = (w.p2.y - w.p1.y) / wallLen;

        segmentBreakingItems.forEach(itemData => {
            const itemStart = itemData.pos - itemData.width / 2;
            if (itemStart > lastPos + 0.1) {
                const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos};
                const p2={x:w.p1.x+dx*itemStart, y:w.p1.y+dy*itemStart};
                const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial, lastPosIsNode, false);
                if(segMesh) {
                    segMesh.position.y = floorElevation;
                    sceneObjects.add(segMesh);
                }
            }

            if (itemData.type === 'door') {
                const doorGroup = createDoorMesh(itemData.item);
                if(doorGroup) {
                    doorGroup.position.y = floorElevation;
                    sceneObjects.add(doorGroup);
                }
                if (wallType === 'normal' || wallType === 'half') {
                    const lintelMesh = createLintelMesh(itemData.item, wallThickness, wallMaterial);
                    if(lintelMesh) {
                        lintelMesh.position.y = floorElevation;
                        sceneObjects.add(lintelMesh);
                    }
                }
            }
            else if (itemData.type === 'window') {
                const windowGroup = createComplexWindow(w, itemData.item, wallThickness);
                if(windowGroup) {
                    windowGroup.position.y = floorElevation;
                    sceneObjects.add(windowGroup);
                }
                const isBathroom = itemData.item.roomName === 'BANYO';
                const bottomHeight = isBathroom ? BATHROOM_WINDOW_BOTTOM_HEIGHT : WINDOW_BOTTOM_HEIGHT;
                const topHeight = isBathroom ? BATHROOM_WINDOW_TOP_HEIGHT : WINDOW_TOP_HEIGHT;
                if (wallType === 'normal' || wallType === 'half') {
                    const lintelHeight = WALL_HEIGHT - topHeight;
                    const lintelMesh = createWallPieceMesh(w, itemData.item, topHeight, lintelHeight, wallThickness, wallMaterial);
                    if(lintelMesh) {
                        lintelMesh.position.y = floorElevation;
                        sceneObjects.add(lintelMesh);
                    }
                    const sillHeight = bottomHeight;
                    const sillMesh = createWallPieceMesh(w, itemData.item, 0, sillHeight, wallThickness, wallMaterial);
                    if(sillMesh) {
                        sillMesh.position.y = floorElevation;
                        sceneObjects.add(sillMesh);
                    }
                }
            }

            if (itemData.type === 'door' || itemData.type === 'window') {
                 lastPos = itemData.pos + itemData.width / 2;
                 lastPosIsNode = false;
            }
        });

        if (wallLen - lastPos > 0.1) {
            const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos};
            const p2={x:w.p1.x+dx*wallLen, y:w.p1.y+dy*wallLen};
            const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial, lastPosIsNode, true);
            if(segMesh) {
                segMesh.position.y = floorElevation;
                sceneObjects.add(segMesh);
            }
        }

        (w.vents || []).forEach(v => {
            const ventMeshGroup = createVentMesh(w, v);
            if (ventMeshGroup) {
                ventMeshGroup.position.y = floorElevation;
                sceneObjects.add(ventMeshGroup);
            }
        });
    });

    // --- Kolonları Ekle ---
    if (columns) {
        columns.forEach(column => {
            const m = createColumnMesh(column, columnMaterial);
            if (m) {
                m.position.y = getFloorElevation(column.floorId);
                sceneObjects.add(m);
            }
        });
    }

    // --- Kirişleri Ekle ---
    if (beams) {
        beams.forEach(beam => {
            const m = createBeamMesh(beam, beamMaterial);
            if (m) {
                // Kirişler katın içinde, üst sınırı tavan seviyesinde (tavana yapışık)
                const floorElevation = getFloorElevation(beam.floorId);
                const beamDepth = beam.depth || 20;
                m.position.y = floorElevation + WALL_HEIGHT - (beamDepth / 2);
                sceneObjects.add(m);
            }
        });
    }

    // --- Merdivenleri Ekle ---
    if (stairs) {
        stairs.forEach(stair => {
            const m = createStairMesh(stair);
            if (m) {
                m.position.y = getFloorElevation(stair.floorId);
                sceneObjects.add(m);
            }
        });
    }

    // --- Zeminleri Ekle ---
    if (rooms) {
        rooms.forEach(room => {
            if (room.polygon?.geometry?.coordinates) {
                const coords = room.polygon.geometry.coordinates[0];
                if (coords.length >= 3) {
                    try {
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        coords.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
                        const centerX = (minX + maxX) / 2; const centerZ = (minY + maxY) / 2;
                        const shapePoints = coords.map(p => new THREE.Vector2(p[0] - centerX, -(p[1] - centerZ)) );
                        const roomShape = new THREE.Shape(shapePoints);
                        const geometry = new THREE.ShapeGeometry(roomShape);
                        const floorMesh = new THREE.Mesh(geometry, floorMaterial);
                        floorMesh.rotation.x = -Math.PI / 2;
                        const roomFloorElevation = getFloorElevation(room.floorId);
                        floorMesh.position.set(centerX, 0.1 + roomFloorElevation, centerZ);
                        sceneObjects.add(floorMesh);
                    } catch (error) {
                        console.error("Zemin oluşturulurken hata:", error, room);
                    }
                }
            }
        });
    }

    // --- YENİ: Resim Çerçevelerini Ekle ---
    try {
        // Filtrelenmiş rooms ve walls'u picture frame fonksiyonuna geç
        buildPictureFrames(sceneObjects, getFloorElevation, rooms, walls);
    } catch (error) {
        console.error("Resim çerçeveleri oluşturulurken bir hata oluştu:", error);
    }
    // --- YENİ SONU ---


    // --- Orbit Hedefini Ayarla ---
    if (controls === orbitControls) { // Sadece orbit modundaysa hedefi ayarla
        if (sceneObjects.children.length > 0) {
            const boundingBox = new THREE.Box3();
            sceneObjects.children.forEach(obj => { if (obj.material !== floorMaterial) boundingBox.expandByObject(obj); });
            if (!boundingBox.isEmpty()) {
                const center = new THREE.Vector3();
                boundingBox.getCenter(center);
                controls.target.copy(center);
            } else {
                 controls.target.set(0, WALL_HEIGHT/2, 0);
            }
        } else {
             controls.target.set(0, WALL_HEIGHT/2, 0);
        }
        controls.update();
    }
}


// ===================================================================
// AŞAĞIDAKİ YENİ FONKSİYONLAR (Dosyanın en altına)
// ===================================================================

/**
 * Verilen bir URL için bir picture material oluşturur veya state'teki cache'den döndürür.
 * (state.pictureFrameMaterials kullanır, textureLoader'ı scene3d-core'dan alır)
 */
function getPictureMaterial(url) {
    if (state.pictureFrameMaterials[url]) {
        return state.pictureFrameMaterials[url];
    }
    // textureLoader'ın scene3d-core.js'de başlatıldığını varsayıyoruz
    const newMaterial = new THREE.MeshStandardMaterial({
        map: textureLoader.load(url), // textureLoader'ı globalden kullan
        color: 0xffffff,
        roughness: 0.9, // Mat resim
        metalness: 0.1
    });
    // Malzemeyi state'te cache'le
    // --- HATA DÜZELTMESİ BURADA ---
    // setState'i global scope'tan (main.js'den import edildi) kullan
    setState({
        pictureFrameMaterials: { ...state.pictureFrameMaterials, [url]: newMaterial }
    });
    // --- HATA DÜZELTMESİ SONU ---
    return newMaterial;
}

/**
 * Bir odayı oluşturan duvarları ve "içeri" bakan normal vektörlerini bulur.
 * (wall-processor.js / geometry.js'deki oda tespit mantığını kullanır)
 */
function getWallsForRoom(room, allWalls) {
    const roomWalls = [];
    // --- DÜZELTME: Turf.js'nin (index.html'den) yüklendiğini kontrol et ---
    if (!room.polygon?.geometry?.coordinates || typeof turf === 'undefined') {
        if (typeof turf === 'undefined') console.warn("Turf.js bulunamadı, çerçeveler için iç/dış yönü hesaplanamıyor.");
        return roomWalls;
    }
    
    const coords = room.polygon.geometry.coordinates[0];
    const TOLERANCE = 1; // 1 cm tolerans

    for (let i = 0; i < coords.length - 1; i++) {
        const p1Coord = coords[i];
        const p2Coord = coords[i + 1];

        // Bu poligonal segmentle eşleşen duvarı bul
        const wall = allWalls.find(w => { // 'w' burada tanımlanır
            if (!w || !w.p1 || !w.p2) return false;
            // İki yönlü kontrol (p1->p2 veya p2->p1)
            const d1_find = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
            const d2_find = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
            return Math.min(d1_find, d2_find) < TOLERANCE;
        });

        if (wall) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;

            // --- DÜZELTİLMİŞ "İÇERİ" NORMAL HESAPLAMASI ---
            const dx = wall.p2.x - wall.p1.x; // Duvarın 2D X yönü
            const dy = wall.p2.y - wall.p1.y; // Duvarın 2D Y yönü

            const dirX = dx / wallLen; // Duvar yönü (p1->p2) X
            const dirZ = dy / wallLen; // Duvar yönü (p1->p2) Z (2D Y)

            // İki olası "içeri" normal (biri sol, biri sağ)
            const leftNormal = { x: -dirZ, z: dirX }; // Sol normal
            const rightNormal = { x: dirZ, z: -dirX }; // Sağ normal

            // Duvarın orta noktasını test et
            const midX = (wall.p1.x + wall.p2.x) / 2;
            const midZ = (wall.p1.y + wall.p2.y) / 2; // 2D y -> 3D z

            // Sol normal yönünde 1cm içeri gir
            // 'turf.point' için koordinatlar [x, y] olmalı
            const testPointLeft = turf.point([midX + leftNormal.x * 1, midZ + leftNormal.z * 1]); 
            
            let insideNormal;
            // Test noktasının oda poligonunun içinde olup olmadığını kontrol et
            if (turf.booleanPointInPolygon(testPointLeft, room.polygon)) {
                insideNormal = leftNormal; // Sol normal içeride
            } else {
                // Teste gerek yok, diğeri olmalı
                insideNormal = rightNormal; // Sağ normal içeride
            }
            
            roomWalls.push({ wall, insideNormal });
            // --- HESAPLAMA SONU ---
        }
    }
    return roomWalls;
}

/**
 * Resim çerçevesi (resim + kenarlıklar) için 3D mesh oluşturur
 */
function createPictureFrameMesh(wall, posOnWall, width, height, picMaterial, borderMaterial, insideNormal_3D, yPosition) {
    
    const frameGroup = new THREE.Group();
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;

    const dx_wall = (wall.p2.x - wall.p1.x) / wallLen; // Duvarın 2D X yönü
    const dy_wall = (wall.p2.y - wall.p1.y) / wallLen; // Duvarın 2D Y yönü (3D Z yönü)
    
    const wallThickness = wall.thickness || state.wallThickness;
    const borderWidth = 4; // 4cm çerçeve kalınlığı
    const frameDepth = 3;  // 3cm çerçeve derinliği (duvardan çıkıntı)

    // 1. Resim Düzlemi (Plane)
    const picWidth = width - (borderWidth * 2);
    const picHeight = height - (borderWidth * 2);
    if (picWidth <= 0 || picHeight <= 0) return null; // Çok küçük

    // PlaneGeometry (Genişlik=X, Yükseklik=Y)
    const picGeom = new THREE.PlaneGeometry(picWidth, picHeight); 
    const picMesh = new THREE.Mesh(picGeom, picMaterial);
    picMesh.position.y = yPosition; // İstenen Y yüksekliği (merkez)
    frameGroup.add(picMesh);

    // 2. Çerçeve Kenarlıkları (4 adet Box)
    // Üst
    const topBorderGeom = new THREE.BoxGeometry(width, borderWidth, frameDepth);
    const topBorder = new THREE.Mesh(topBorderGeom, borderMaterial);
    topBorder.position.y = yPosition + (picHeight / 2) + (borderWidth / 2); // Resmin üstü + yarım kenarlık
    frameGroup.add(topBorder);
    // Alt
    const bottomBorderGeom = new THREE.BoxGeometry(width, borderWidth, frameDepth);
    const bottomBorder = new THREE.Mesh(bottomBorderGeom, borderMaterial);
    bottomBorder.position.y = yPosition - (picHeight / 2) - (borderWidth / 2); // Resmin altı - yarım kenarlık
    frameGroup.add(bottomBorder);
    // Sol
    const leftBorderGeom = new THREE.BoxGeometry(borderWidth, picHeight, frameDepth); // picHeight (iç yükseklik)
    const leftBorder = new THREE.Mesh(leftBorderGeom, borderMaterial);
    leftBorder.position.x = - (picWidth / 2) - (borderWidth / 2); // Resmin solu - yarım kenarlık
    leftBorder.position.y = yPosition;
    frameGroup.add(leftBorder);
    // Sağ
    const rightBorderGeom = new THREE.BoxGeometry(borderWidth, picHeight, frameDepth);
    const rightBorder = new THREE.Mesh(rightBorderGeom, borderMaterial);
    rightBorder.position.x = (picWidth / 2) + (borderWidth / 2); // Resmin sağı + yarım kenarlık
    rightBorder.position.y = yPosition;
    frameGroup.add(rightBorder);

    // Grubu XZ düzlemindeki (duvar üzerindeki) pozisyonuna taşı
    const centerPos_x = wall.p1.x + dx_wall * posOnWall;
    const centerPos_z = wall.p1.y + dy_wall * posOnWall; // 2D y -> 3D z

    // Grubu duvardan "içeri" normale göre yarım duvar kalınlığı + yarım çerçeve derinliği kadar ötele
    const offsetX = insideNormal_3D.x * (wallThickness / 2 + frameDepth / 2);
    const offsetZ = insideNormal_3D.z * (wallThickness / 2 + frameDepth / 2);

    frameGroup.position.set(centerPos_x + offsetX, 0, centerPos_z + offsetZ);

    // Grubu "içeri" normale bakacak şekilde Y ekseni etrafında döndür
    // Normalin XZ düzlemindeki açısı (atan2(x, z) X ekseninden başlar, Z'ye doğru)
    const finalAngle = Math.atan2(insideNormal_3D.x, insideNormal_3D.z);
    frameGroup.rotation.y = finalAngle;

    return frameGroup;
}


/**
 * 3D sahnede, kurallara göre resim çerçevelerini oluşturur ve ekler.
 * @param {THREE.Group} sceneObjects - 3D sahne nesneleri grubu
 * @param {Function} getFloorElevation - Kat yüksekliğini döndüren fonksiyon
 * @param {Array} rooms - Filtrelenmiş oda listesi (floorId'ye göre)
 * @param {Array} walls - Filtrelenmiş duvar listesi (floorId'ye göre)
 */
let picFrameCacheIndex = 0; // Rastgele resimler için global index (state dışında tutulabilir)

function buildPictureFrames(sceneObjects, getFloorElevation, rooms, walls) {
    // Cache'den resim URL'lerini al
    const imageUrls = state.pictureFrameCache;
    if (!imageUrls || imageUrls.length === 0) return; // Resim yoksa çık

    // --- DÜZELTME: Duvar kullanımını takip etmek için Set ---
    // Bu Set, bir duvarın (iki tarafı da dahil) çerçeve için SADECE BİR KEZ kullanılmasını sağlar.
    const usedWalls = new Set();
    // --- DÜZELTME SONU ---

    // Kurallar (cm)
    const MAX_WIDTH = 150;
    const MAX_HEIGHT = 80;
    const MIN_WIDTH = 50; // Minimum çerçeve genişliği
    const WALL_PADDING = 20; // Boşluğun kenarlarından bırakılacak toplam pay
    const FRAME_Y_POSITION = 180; // Çerçevenin MERKEZİNİN yerden yüksekliği (115cm alt + 80/2 = 155cm)

    // Odaya göre duvarları bul ve çerçeveleri yerleştir
    for (const room of rooms) {
        // Odanın kat yüksekliğini al
        const roomFloorElevation = getFloorElevation(room.floorId);

        // 1. Bu odaya ait duvarları ve "içeri" normalini bul
        const roomWalls = getWallsForRoom(room, walls);
        
        // --- YENİ KURAL: Özel duvar tipine sahip mahallere EKLEME ---
        let hasSpecialWall = false;
        for (const { wall } of roomWalls) {
            const wallType = wall.wallType || 'normal';
            if (wallType === 'balcony' || wallType === 'glass' || wallType === 'half') {
                hasSpecialWall = true;
                break;
            }
        }
        // Eğer mahalde bu duvar tiplerinden biri varsa, o mahale hiç resim ekleme
        if (hasSpecialWall) {
            continue; 
        }
        // --- YENİ KURAL SONU ---

        const segments = [];

        // 2. Bu odaya ait duvarlardaki en büyük boşlukları bul
        for (const { wall, insideNormal } of roomWalls) {
            
            // --- DÜZELTME: Duvar daha önce kullanıldıysa atla ---
            if (usedWalls.has(wall)) continue;
            // --- DÜZELTME SONU ---

            // Sadece 'normal' tipteki duvarlara ekle
            // (Yukarıdaki kural zaten odayı filtreledi ama bu yine de kalsın)
            const wallType = wall.wallType || 'normal';
            if (wallType !== 'normal') continue;

            // Duvardaki en büyük *kullanılabilir* boşluğu bul
            // (wall-item-utils.js'den import edilen fonksiyonu kullanıyoruz)
            // Bu fonksiyon zaten kapı/pencere/menfezleri hesaba katar.
            const largestSegment = findLargestAvailableSegment(wall); 
            
            if (largestSegment && largestSegment.length >= (MIN_WIDTH + WALL_PADDING)) {
                segments.push({
                    wall,
                    segment: largestSegment,
                    insideNormal // {x, z} 3D normali
                });
            }
        }

        // 3. Boşlukları büyüklüğe göre sırala ve en fazla 2 tanesini al (KURAL)
        segments.sort((a, b) => b.segment.length - a.segment.length);
        const wallsToPlace = segments.slice(0, 2);

        // 4. Seçilen duvarlara çerçeveleri oluştur ve sahneye ekle
        for (const { wall, segment, insideNormal } of wallsToPlace) {
            
            // Boyutları belirle (KURAL: max 150x80)
            let frameWidth = Math.min(MAX_WIDTH, segment.length - WALL_PADDING);
            let frameHeight = MAX_HEIGHT; // Önce maksimum yüksekliği dene
            
            // Oran (Genişlik / Yükseklik), örn: 150/80 = 1.875
            // Eğer hesaplanan genişlik, bu oranı koruyarak max yükseklikten daha azını gerektiriyorsa yüksekliği azalt
            // (Yani genişlik, yüksekliğin 1.875 katından küçükse)
            if (frameWidth < MAX_HEIGHT * (MAX_WIDTH / MAX_HEIGHT)) {
                frameHeight = frameWidth / (MAX_WIDTH / MAX_HEIGHT); // Genişliğe göre yüksekliği ayarla
            } else {
                // Yükseklik 80'de kaldı, şimdi genişliği de bu orana göre (gerekirse) küçült
                frameWidth = frameHeight * (MAX_WIDTH / MAX_HEIGHT);
            }


            if (frameWidth < MIN_WIDTH) continue; // Çok küçükse atla

            // Pozisyonu belirle (boşluğun ortası)
            const posOnWall = segment.start + segment.length / 2;

            // Resmi cache'den al
            const picURL = imageUrls[picFrameCacheIndex % imageUrls.length];
            const picMaterial = getPictureMaterial(picURL);
            picFrameCacheIndex++;

            // Mesh'i oluştur
            const frameMesh = createPictureFrameMesh(
                wall, posOnWall, frameWidth, frameHeight,
                picMaterial, 
                pictureFrameMaterial, // Kenarlık malzemesi (adı düzeltildi)
                insideNormal, FRAME_Y_POSITION
            );

            if (frameMesh) {
                frameMesh.position.y = roomFloorElevation;
                sceneObjects.add(frameMesh);
                // --- DÜZELTME: Duvarı kullanıldı olarak işaretle ---
                usedWalls.add(wall);
                // --- DÜZELTME SONU ---
            }
        }
    }
}