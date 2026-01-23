// general-files/xml-io.js
// GÜNCELLENDİ: X eksenindeki simetri (aynalama) sorununu çözmek için tüm Y koordinatları (-1) ile çarpıldı.
// GÜNCELLENDİ: Merdiven rotasyonu 90° CCW (-90) olarak ayarlandı ve boyutları (en/boy) buna göre düzeltildi.

import { state, setState, dom, VECTORDRAW_AREA_TYPES } from './main.js';
import { getOrCreateNode, distToSegmentSquared, calculatePlanarArea } from '../draw/geometry.js';
import { wallExists } from '../wall/wall-handler.js';
import { createColumn } from '../architectural-objects/columns.js';
import { createBeam } from '../architectural-objects/beams.js';
import { createStairs } from '../architectural-objects/stairs.js';
import { processWalls } from '../wall/wall-processor.js';
import { saveState } from './history.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { fitDrawingToScreen } from '../draw/zoom.js';

// turf.js global olarak index.html'den yükleniyor (CDN)

// XML'deki koordinatları cm'ye çevirmek için ölçek
const SCALE = 100;

/**
 * Verilen bir mutlak X,Y koordinatına en yakın duvarı ve o duvar üzerindeki
 * göreceli pozisyonu (pos) bulan yardımcı fonksiyon.
 */
function findClosestWallAndPosition(origin) {
    let bestWall = null;
    let bestPos = 0;
    let minDisSq = Infinity;
    
    // Duvar kalınlığının iki katı kadar bir tolerans (cm cinsinden)
    const toleranceSq = Math.pow(state.wallThickness * 2, 2); 

    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue;

        const disSq = distToSegmentSquared(origin, wall.p1, wall.p2);

        if (disSq < toleranceSq && disSq < minDisSq) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;

            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            
            // Noktanın segment üzerindeki izdüşümünü bul (0-1 arası)
            let t = ((origin.x - wall.p1.x) * dx + (origin.y - wall.p1.y) * dy) / (dx * dx + dy * dy);
            t = Math.max(0, Math.min(1, t)); // 0-1 arasında kalmasını sağla
            
            bestPos = t * wallLen; // cm cinsinden pozisyon
            bestWall = wall;
            minDisSq = disSq;
        }
    }
    return { wall: bestWall, pos: bestPos };
}


/**
 * Verilen XML metnini ayrıştırır ve ngcad state'ine ekler.
 * @param {string} xmlString - Import edilecek XML içeriği
 */
export function importFromXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Hata ayıklama: XML doğru okundu mu?
    const entities = xmlDoc.querySelector("O[F='Entities']");
    if (!entities) {
        console.error("XML ayrıştırması başarısız oldu veya 'Entities' bulunamadı.");
        alert("XML ayrıştırması başarısız oldu veya 'Entities' bulunamadı.");
        return;
    }

    console.log("XML Import başlatılıyor...");
    console.log("Entities bulundu:", entities);
    console.log("Entities children count:", entities.children.length);

    // TÜM XML'deki element tiplerini topla
    const allElements = xmlDoc.querySelectorAll("O[T]");
    const elementTypes = new Map();
    allElements.forEach(el => {
        const type = el.getAttribute('T');
        elementTypes.set(type, (elementTypes.get(type) || 0) + 1);
    });

    console.log("\n=== XML'DEKİ TÜM ELEMENT TİPLERİ ===");
    console.log("Toplam O elementi:", allElements.length);
    elementTypes.forEach((count, type) => {
        console.log(`  ${type}: ${count} adet`);
    });
    console.log("====================================\n");

    console.log("Entities first 5 children:");
    for (let i = 0; i < Math.min(5, entities.children.length); i++) {
        const child = entities.children[i];
        console.log(`  ${i}: tagName=${child.tagName}, F=${child.getAttribute('F')}, T=${child.getAttribute('T')}`);

        // vdPolyhatch içini kontrol et
        if (child.getAttribute('T') === 'vdPolyhatch') {
            console.log(`    vdPolyhatch içindeki child count: ${child.children.length}`);
            console.log(`    vdPolyhatch içindeki ilk 10 child:`);
            for (let j = 0; j < Math.min(10, child.children.length); j++) {
                const subchild = child.children[j];
                console.log(`      ${j}: tagName=${subchild.tagName}, F=${subchild.getAttribute('F')}, T=${subchild.getAttribute('T')}`);
            }
        }
    }

    // --- ÖNEMLİ: Import öncesi mevcut state'i temizle ---
    setState({
        nodes: [],
        walls: [],
        doors: [],
        rooms: [],
        columns: [],
        beams: [],
        stairs: [],
        guides: [],
        selectedObject: null,
        selectedGroup: [],
        startPoint: null,
        plumbingBlocks: [],
        plumbingPipes: []
    });
    // --- TEMİZLİK SONU ---


    // 1. Duvarları (VdWall) oluştur ve nodeları kaydet
    // Yeni yapı: CloseArea içindeki Walls dizisini kontrol et
    // DÜZELTME: entities içinde değil, xmlDoc'un her yerinde ara
    const closeAreas = xmlDoc.querySelectorAll("O[F='_Item'][T='CloseArea']");
    console.log(`${closeAreas.length} CloseArea bulundu (tüm XML'de arama yapıldı)`);

    closeAreas.forEach((closeArea, idx) => {
        try {
            // AreaType'ı al (mahal tipi)
            const areaTypeEl = closeArea.querySelector("P[F='AreaType']");
            const areaTypeValue = areaTypeEl ? parseInt(areaTypeEl.getAttribute('V')) : null;
            const roomName = areaTypeValue ? (VECTORDRAW_AREA_TYPES[areaTypeValue] || `MAHAL`) : `MAHAL`;

            console.log(`\nCloseArea ${idx} - AreaType: ${areaTypeValue}, İsim: ${roomName}`);

            // VertexList'ten köşe noktalarını al
            const vertexListEl = closeArea.querySelector("O[F='VertexList']");
            const vertices = [];
            if (vertexListEl) {
                console.log(`  -> VertexList bulundu`);

                // Önce P[F='_Item'] formatını dene (eski format)
                let vertexElements = vertexListEl.querySelectorAll("P[F='_Item']");

                if (vertexElements.length === 0) {
                    // Yeni format: P[F='streamed'] - base64 encoded binary data
                    const streamedEl = vertexListEl.querySelector("P[F='streamed']");
                    if (streamedEl) {
                        console.log(`  -> Streamed format bulundu, decode ediliyor...`);
                        const base64Data = streamedEl.getAttribute('V');

                        try {
                            // Base64 decode
                            const binaryString = atob(base64Data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }

                            console.log(`  -> Toplam byte sayısı: ${bytes.length}`);

                            // İlk 4 byte vertex sayısını içerir (int32)
                            const dataView = new DataView(bytes.buffer);
                            const vertexCount = dataView.getInt32(0, true); // little-endian
                            console.log(`  -> Vertex sayısı: ${vertexCount}`);

                            // Byte per vertex hesapla
                            const bytesPerVertex = (bytes.length - 4) / vertexCount;
                            console.log(`  -> Byte per vertex: ${bytesPerVertex} (${(bytes.length - 4)} / ${vertexCount})`);

                            // Vertex'leri oku - her vertex için uygun byte sayısını kullan
                            let offset = 4; // İlk 4 byte'ı atla (vertex count)
                            for (let i = 0; i < vertexCount; i++) {
                                if (offset + 16 > bytes.length) {
                                    console.warn(`  -> Offset ${offset} aralık dışında, vertex ${i} atlandı`);
                                    break;
                                }

                                const x = dataView.getFloat64(offset, true);
                                const y = dataView.getFloat64(offset + 8, true);

                                // Kalan byte'ları atla (Z, bulge, width vs.)
                                offset += bytesPerVertex;

                                // DÜZELTME: Y eksenini ters çevir
                                vertices.push({ x: x * SCALE, y: -y * SCALE });
                            }
                            console.log(`  -> ${vertices.length} köşe noktası decode edildi`);
                        } catch (e) {
                            console.error(`  -> Streamed data decode hatası:`, e);
                        }
                    }
                } else {
                    // Eski format: P[F='_Item'] elementleri
                    vertexElements.forEach(vertexEl => {
                        const coords = vertexEl.getAttribute('V').split(',').map(Number);
                        // DÜZELTME: Y eksenini ters çevir
                        vertices.push({ x: coords[0] * SCALE, y: -coords[1] * SCALE });
                    });
                    console.log(`  -> ${vertices.length} köşe noktası bulundu (eski format)`);
                }
            } else {
                console.log(`  -> VertexList bulunamadı!`);
            }

            const wallsContainer = closeArea.querySelector("O[F='Walls']");
            console.log(`  -> Walls container:`, wallsContainer ? "bulundu" : "bulunamadı");

            if (wallsContainer) {
                const wallElements = wallsContainer.querySelectorAll("O[F='_Item'][T='VdWall']");
                console.log(`  -> ${wallElements.length} VdWall bulundu`);

                wallElements.forEach((wallEl, wallIdx) => {
                    console.log(`    -> Wall ${wallIdx} işleniyor...`);
                    processWallElement(wallEl);
                });
            }

            // Room objesini oluştur ve state.rooms'a ekle
            // Eğer vertices parse edilemedi ise, duvarlardan vertices'leri çıkar
            if (vertices.length === 0 && wallsContainer) {
                console.log(`  -> Vertices bulunamadı, duvarlardan köşe noktaları çıkarılıyor...`);
                const wallElements = wallsContainer.querySelectorAll("O[F='_Item'][T='VdWall']");
                const nodeSet = new Set();

                wallElements.forEach(wallEl => {
                    const startPointEl = wallEl.querySelector("P[F='StartPoint']");
                    const endPointEl = wallEl.querySelector("P[F='EndPoint']");

                    if (startPointEl && endPointEl) {
                        const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                        const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                        // Node'ları string key olarak sakla (köşeleri unique yapmak için)
                        const p1Key = `${(startCoords[0] * SCALE).toFixed(2)},${(-startCoords[1] * SCALE).toFixed(2)}`;
                        const p2Key = `${(endCoords[0] * SCALE).toFixed(2)},${(-endCoords[1] * SCALE).toFixed(2)}`;

                        nodeSet.add(p1Key);
                        nodeSet.add(p2Key);
                    }
                });

                // Set'ten vertices array'e çevir
                nodeSet.forEach(key => {
                    const [x, y] = key.split(',').map(Number);
                    vertices.push({ x, y });
                });

                console.log(`  -> Duvarlardan ${vertices.length} unique köşe noktası çıkarıldı`);
            }

            if (vertices.length > 0) {
                const room = {
                    type: 'room',
                    name: roomName,
                    vertices: vertices,
                    areaType: areaTypeValue
                };
                state.rooms.push(room);
                console.log(`  -> Room eklendi: ${roomName} (${vertices.length} köşe)`);
            } else {
                console.warn(`  -> Room eklenemedi: ${roomName} (vertices bulunamadı)`);
            }
        } catch (e) {
            console.error("CloseArea işlenirken hata:", e, closeArea);
        }
    });

    // Eski yapı için backward compatibility: Doğrudan VdWall elemanlarını kontrol et
    // DÜZELTME: Tüm VdWall elemanlarını bul, sonra CloseArea içinde olanları filtrele
    const allWallElements = xmlDoc.querySelectorAll("O[T='VdWall']");
    console.log(`${allWallElements.length} toplam VdWall bulundu (tüm XML'de)`);

    // CloseArea içindeki duvarları bul
    const wallsInCloseAreas = new Set();
    closeAreas.forEach(closeArea => {
        const wallsInThisArea = closeArea.querySelectorAll("O[T='VdWall']");
        wallsInThisArea.forEach(wall => wallsInCloseAreas.add(wall));
    });

    // CloseArea içinde OLMAYAN duvarları filtrele
    const directWallElements = Array.from(allWallElements).filter(wall => !wallsInCloseAreas.has(wall));
    console.log(`${directWallElements.length} doğrudan VdWall bulundu (CloseArea dışı)`);

    directWallElements.forEach((wallEl, idx) => {
        console.log(`  -> Doğrudan wall ${idx} işleniyor...`);
        processWallElement(wallEl);
    });

    // Duvar işleme fonksiyonu
    function processWallElement(wallEl) {
        try {
            const startPointEl = wallEl.querySelector("P[F='StartPoint']");
            const endPointEl = wallEl.querySelector("P[F='EndPoint']");
            const widthEl = wallEl.querySelector("P[F='Width']"); // Kalınlık

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                // DÜZELTME: Y eksenini ters çevir (Y -> -Y)
                const p1 = { x: startCoords[0] * SCALE, y: -startCoords[1] * SCALE };
                const p2 = { x: endCoords[0] * SCALE, y: -endCoords[1] * SCALE };

                console.log(`      StartPoint: (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)})`);
                console.log(`      EndPoint: (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`);

                const node1 = getOrCreateNode(p1.x, p1.y);
                const node2 = getOrCreateNode(p2.x, p2.y);

                if (node1 !== node2 && !wallExists(node1, node2)) {
                    // Kalınlığı XML'den al, yoksa varsayılanı kullan
                    const thickness = widthEl ? (parseFloat(widthEl.getAttribute('V')) * SCALE) : state.wallThickness;

                    state.walls.push({
                        type: "wall",
                        p1: node1,
                        p2: node2,
                        thickness: thickness, // XML'den gelen kalınlık
                        wallType: 'normal',
                        windows: [],
                        vents: [],
                        floorId: state.currentFloor?.id // XML import edilirken aktif kata ekle
                    });
                    console.log(`      -> Duvar eklendi (kalınlık: ${thickness})`);
                } else {
                    console.log(`      -> Duvar atlandı (duplicate veya aynı node)`);
                }
            } else {
                console.log(`      -> StartPoint veya EndPoint bulunamadı`);
            }
        } catch (e) {
            console.error("Duvar işlenirken hata:", e, wallEl);
        }
    }

    // 2. Kolonları (KolonHavalandirmasi) oluştur
    const kolonElements = xmlDoc.querySelectorAll("O[T='KolonHavalandirmasi']");
    console.log(`\n${kolonElements.length} KolonHavalandirmasi bulundu (tüm XML'de)`);

    kolonElements.forEach((kolonEl, idx) => {
        console.log(`  -> Kolon ${idx} işleniyor...`);
        try {
            const insertionPointEl = kolonEl.querySelector("P[F='InsertionPoint']");
            const widthEl = kolonEl.querySelector("P[F='Width']");
            const heightEl = kolonEl.querySelector("P[F='Height']");
            const rotationEl = kolonEl.querySelector("P[F='Rotation']"); // Rotasyon eklendi

            if (insertionPointEl && widthEl && heightEl) {
                const centerCoords = insertionPointEl.getAttribute('V').split(',').map(Number);
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const height = parseFloat(heightEl.getAttribute('V')) * SCALE;
                let rotationDeg = 0;
                if (rotationEl) {
                    const rotationRad = parseFloat(rotationEl.getAttribute('V'));
                    rotationDeg = rotationRad * (180 / Math.PI);
                }

                // DÜZELTME: Y eksenini ters çevir
                const newCol = createColumn(centerCoords[0] * SCALE, -centerCoords[1] * SCALE, 0);
                newCol.width = width;
                newCol.height = height;
                newCol.size = Math.max(width, height);
                newCol.rotation = rotationDeg;

                if (!state.columns) state.columns = [];
                state.columns.push(newCol);
            }
        } catch (e) {
            console.error("Kolon işlenirken hata:", e, kolonEl);
        }
    });

    // 3. Kapıları (Door) işle
    const doorElements = xmlDoc.querySelectorAll("O[T='Door']");
    console.log(`\n${doorElements.length} Door bulundu (tüm XML'de)`);

    doorElements.forEach((doorEl, idx) => {
        console.log(`  -> Door ${idx} işleniyor...`);

        try {
            const originEl = doorEl.querySelector("P[F='Origin']");
            const widthEl = doorEl.querySelector("P[F='En']");

            if (originEl && widthEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                // DÜZELTME: Y eksenini ters çevir
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;

                const { wall, pos } = findClosestWallAndPosition(origin);
                
                if (wall) {
                    state.doors.push({
                        wall: wall,
                        pos: pos,
                        width: width,
                        type: 'door'
                    });
                } else {
                    console.warn("Kapı için yakın duvar bulunamadı:", origin);
                }
            }
        } catch (e) {
            console.error("Kapı işlenirken hata:", e, doorEl);
        }
    });

    // 4. Pencereleri (Window) işle
    const windowElements = xmlDoc.querySelectorAll("O[T='Window']");
    console.log(`\n${windowElements.length} Window bulundu (tüm XML'de)`);

    windowElements.forEach((winEl, idx) => {
        console.log(`  -> Window ${idx} işleniyor...`);
        try {
            const originEl = winEl.querySelector("P[F='Origin']");
            const widthEl = winEl.querySelector("P[F='En']");

            if (originEl && widthEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                // DÜZELTME: Y eksenini ters çevir
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;

                const { wall, pos } = findClosestWallAndPosition(origin);
                
                if (wall) {
                    if (!wall.windows) wall.windows = [];
                    wall.windows.push({
                        pos: pos,
                        width: width,
                        type: 'window'
                    });
                } else {
                    console.warn("Pencere için yakın duvar bulunamadı:", origin);
                }
            }
        } catch (e) {
            console.error("Pencere işlenirken hata:", e, winEl);
        }
    });

    // 5. Menfezleri (Menfez) işle
    const ventElements = xmlDoc.querySelectorAll("O[T='Menfez']");
    console.log(`\n${ventElements.length} Menfez bulundu (tüm XML'de)`);
    ventElements.forEach((ventEl, idx) => {
        console.log(`  -> Menfez ${idx} işleniyor...`);
        try {
            const originEl = ventEl.querySelector("P[F='Origin']");
            if (originEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                // DÜZELTME: Y eksenini ters çevir
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const width = 30; // Varsayılan menfez çapı

                const { wall, pos } = findClosestWallAndPosition(origin);
                
                if (wall) {
                    if (!wall.vents) wall.vents = [];
                    wall.vents.push({
                        pos: pos,
                        width: width,
                        type: 'vent'
                    });
                } else {
                    console.warn("Menfez için yakın duvar bulunamadı:", origin);
                }
            }
        } catch (e) {
            console.error("Menfez işlenirken hata:", e, ventEl);
        }
    });
    
    // 6. Merdivenleri (clsmerdiven) işle
    const stairElements = xmlDoc.querySelectorAll("O[T='clsmerdiven']");
    console.log(`\n${stairElements.length} clsmerdiven bulundu (tüm XML'de)`);
    stairElements.forEach((stairEl, idx) => {
        console.log(`  -> Merdiven ${idx} işleniyor...`);
        try {
            const insertionPointEl = stairEl.querySelector("P[F='InsertionPoint']");
            const widthEl = stairEl.querySelector("P[F='Width']"); // XML'deki Width (X boyutu)
            const heightEl = stairEl.querySelector("P[F='Height']"); // XML'deki Height (Y boyutu)
            const lines = stairEl.querySelectorAll("O[T='vdLine']"); // Basamak sayısı için

            if (insertionPointEl && widthEl && heightEl && lines.length > 0) {

                // DÜZELTME: Y eksenini ters çevir (InsertionPoint)
                const cornerCoords = insertionPointEl.getAttribute('V').split(',').map(Number);
                const ipX = cornerCoords[0] * SCALE;
                const ipY = -cornerCoords[1] * SCALE;

                // XML Height değerinin orijinal işaretini koru (yön tespiti için)
                const xml_w = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const xml_h_original = parseFloat(heightEl.getAttribute('V'));
                const xml_h = -(xml_h_original * SCALE);

                // Bizim 'width'imiz (uzunluk) X eksenindedir.
                // Bizim 'height'imiz (en) Y eksenindedir.

                // XML merdiveni Y eksenine paralel (XML'de Height, bizde app_length)
                // XML merdiven eni X eksenine paralel (XML'de Width, bizde app_thickness)
                let app_length = Math.abs(xml_h);
                let app_thickness = Math.abs(xml_w);

                // Merkezi Y-terslenmiş koordinatlara göre hesapla
                const centerX = ipX + (xml_w / 2);
                const centerY = ipY + (xml_h / 2);

                // DÜZELTME: 90° CCW = -90 derece (veya 270)
                // Bu, merdivenin "yukarı" (negatif Y) yönlü olmasını sağlar
                const app_rotation = 90;

                // Basamak sayısını çizgilerden al
                const stepCount = lines.length > 0 ? (lines.length - 1) : 12; // 13 çizgi = 12 basamak

                // DÜZELTME: -90 derece rotasyon için,
                // createStairs 'width' (X-ekseni) parametresi merdivenin Y-eksenindeki uzunluğu olmalı (app_length)
                // createStairs 'height' (Y-ekseni) parametresi merdivenin X-eksenindeki eni olmalı (app_thickness)
                const newStair = createStairs(centerX, centerY, app_length, app_thickness, app_rotation, false);

                newStair.stepCount = stepCount;

                // Merdiven yönünü XML Height işaretinden belirle
                // Negatif Height = Aşağı inen merdiven (topElevation < bottomElevation)
                if (xml_h_original < 0) {
                    // Swap elevations to make it go DOWN
                    const temp = newStair.bottomElevation;
                    newStair.bottomElevation = newStair.topElevation;
                    newStair.topElevation = temp;
                } 

                if (!state.stairs) state.stairs = [];
                state.stairs.push(newStair);
            }
        } catch (e) {
            console.error("Merdiven işlenirken hata:", e, stairEl);
        }
    });


    // 7. Kirişleri (clskiris) işle
    const kirisElements = xmlDoc.querySelectorAll("O[T='clskiris']");
    console.log(`\n${kirisElements.length} clskiris bulundu (tüm XML'de)`);
    kirisElements.forEach((kirisEl, idx) => {
        console.log(`  -> Kiriş ${idx} işleniyor...`);
        try {
            const insertionPointEl = kirisEl.querySelector("P[F='InsertionPoint']");
            const widthEl = kirisEl.querySelector("P[F='Width']"); // Kiriş eni (thickness)
            const heightEl = kirisEl.querySelector("P[F='Height']"); // Kiriş uzunluğu (length)
            const rotationEl = kirisEl.querySelector("P[F='Rotation']");

            if (insertionPointEl && widthEl && heightEl && rotationEl) {
                const centerCoords = insertionPointEl.getAttribute('V').split(',').map(Number);
                const width_xml = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const height_xml = parseFloat(heightEl.getAttribute('V')) * SCALE;
                const rotationRad = parseFloat(rotationEl.getAttribute('V'));
                const rotationDeg = rotationRad * (180 / Math.PI);

                // Bizim createBeam fonksiyonumuz: (centerX, centerY, length, thickness, rotation)
                // XML'deki 'Height' bizim 'width' (uzunluk)
                // XML'deki 'Width' bizim 'height' (kalınlık)

                // DÜZELTME: Y eksenini ters çevir
                // Y-ekseni terslendiğinde rotasyon da tersine dönmeli (ayna efekti)
                const newBeam = createBeam(
                    centerCoords[0] * SCALE,
                    -centerCoords[1] * SCALE,
                    height_xml, // length
                    width_xml,  // thickness
                    -rotationDeg  // Negatif rotasyon (Y-ekseni ters çevrildiği için)
                );

                if (!state.beams) state.beams = [];
                state.beams.push(newBeam);
            }
        } catch (e) {
            console.error("Kiriş işlenirken hata:", e, kirisEl);
        }
    });


    // 8. Tesisat elementlerini parse et
    console.log("\n=== TESİSAT ELEMENTLERİ PARSE EDİLİYOR ===");

    // 8.1. Sayaçlar (clssayac)
    const sayacElements = xmlDoc.querySelectorAll("O[T='clssayac']");
    console.log(`\n${sayacElements.length} clssayac bulundu (tüm XML'de)`);

    sayacElements.forEach((sayacEl, idx) => {
        console.log(`  -> Sayaç ${idx} işleniyor...`);
        try {
            const startPointEl = sayacEl.querySelector("P[F='StartPoint']");
            const endPointEl = sayacEl.querySelector("P[F='EndPoint']");

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                // Merkez koordinatı hesapla (start ve end ortası)
                const centerX = ((startCoords[0] + endCoords[0]) / 2) * SCALE;
                const centerY = -((startCoords[1] + endCoords[1]) / 2) * SCALE;
                const z = startCoords[2] ? startCoords[2] * SCALE : 0;

                // Sayaç objesi oluştur
                const sayacData = {
                    id: `sayac_xml_${idx}_${Date.now()}`,
                    type: 'sayac',
                    x: centerX,
                    y: centerY,
                    z: z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: null,
                        endpoint: null,
                        uzunluk: 30 // Varsayılan fleks uzunluğu
                    },
                    cikisBagliBoruId: null,
                    iliskiliVanaId: null
                };

                state.plumbingBlocks.push(sayacData);
                console.log(`    -> Sayaç eklendi: (${centerX.toFixed(2)}, ${centerY.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Sayaç işlenirken hata:", e, sayacEl);
        }
    });

    // 8.2. Vanalar (clsvana)
    const vanaElements = xmlDoc.querySelectorAll("O[T='clsvana']");
    console.log(`\n${vanaElements.length} clsvana bulundu (tüm XML'de)`);

    vanaElements.forEach((vanaEl, idx) => {
        console.log(`  -> Vana ${idx} işleniyor...`);
        try {
            const originEl = vanaEl.querySelector("P[F='origin']");
            const vanaTipiEl = vanaEl.querySelector("P[F='GLVANATIPI']");

            if (originEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const x = originCoords[0] * SCALE;
                const y = -originCoords[1] * SCALE;
                const z = originCoords[2] ? originCoords[2] * SCALE : 0;

                // Vana tipi mapping (XML'deki tip numarası -> Uygulama vana tipi)
                const xmlVanaTipi = vanaTipiEl ? parseInt(vanaTipiEl.getAttribute('V')) : 1;
                let vanaTipi = 'AKV'; // Varsayılan

                // XML vana tipi mapping (tahmine dayalı - gerçek mapping'i bilmiyoruz)
                if (xmlVanaTipi === 4) vanaTipi = 'KKV';
                else if (xmlVanaTipi === 5) vanaTipi = 'EMNIYET';

                const vanaData = {
                    id: `vana_xml_${idx}_${Date.now()}`,
                    type: 'vana',
                    x: x,
                    y: y,
                    z: z,
                    rotation: 0,
                    vanaTipi: vanaTipi,
                    floorId: state.currentFloor?.id,
                    bagliBoruId: null,
                    boruPozisyonu: 0.5,
                    fromEnd: false,
                    fixedDistance: null,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false
                };

                state.plumbingBlocks.push(vanaData);
                console.log(`    -> Vana eklendi: (${x.toFixed(2)}, ${y.toFixed(2)}) tip: ${vanaTipi}`);
            }
        } catch (e) {
            console.error("Vana işlenirken hata:", e, vanaEl);
        }
    });

    // 8.3. Borular (clsboru)
    const boruElements = xmlDoc.querySelectorAll("O[T='clsboru']");
    console.log(`\n${boruElements.length} clsboru bulundu (tüm XML'de)`);

    boruElements.forEach((boruEl, idx) => {
        console.log(`  -> Boru ${idx} işleniyor...`);
        try {
            const startPointEl = boruEl.querySelector("P[F='StartPoint']");
            const endPointEl = boruEl.querySelector("P[F='EndPoint']");
            const boruCapEl = boruEl.querySelector("P[F='GLBORUCAP']");

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                const p1 = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                const p2 = {
                    x: endCoords[0] * SCALE,
                    y: -endCoords[1] * SCALE,
                    z: endCoords[2] ? endCoords[2] * SCALE : 0
                };

                // Boru çapından tipi belirle
                const boruCap = boruCapEl ? parseInt(boruCapEl.getAttribute('V')) : 25;
                const boruTipi = boruCap > 30 ? 'KALIN' : 'STANDART';

                const boruData = {
                    id: `boru_xml_${idx}_${Date.now()}`,
                    type: 'boru',
                    boruTipi: boruTipi,
                    p1: p1,
                    p2: p2,
                    colorGroup: 'YELLOW', // Varsayılan renk
                    floorId: state.currentFloor?.id,
                    baslangicBaglanti: {
                        tip: null,
                        hedefId: null,
                        noktaIndex: null
                    },
                    bitisBaglanti: {
                        tip: null,
                        hedefId: null,
                        noktaIndex: null
                    },
                    uzerindekiElemanlar: [],
                    tBaglantilar: []
                };

                state.plumbingPipes.push(boruData);
                console.log(`    -> Boru eklendi: (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) -> (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Boru işlenirken hata:", e, boruEl);
        }
    });

    // 8.4. Kombiler (clskombi)
    const kombiElements = xmlDoc.querySelectorAll("O[T='clskombi']");
    console.log(`\n${kombiElements.length} clskombi bulundu (tüm XML'de)`);

    kombiElements.forEach((kombiEl, idx) => {
        console.log(`  -> Kombi ${idx} işleniyor...`);
        try {
            const startPointEl = kombiEl.querySelector("P[F='StartPoint']");
            const endPointEl = kombiEl.querySelector("P[F='EndPoint']");

            if (startPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const x = startCoords[0] * SCALE;
                const y = -startCoords[1] * SCALE;
                const z = startCoords[2] ? startCoords[2] * SCALE : 0;

                const cihazData = {
                    id: `cihaz_xml_${idx}_${Date.now()}`,
                    type: 'cihaz',
                    cihazTipi: 'KOMBI',
                    x: x,
                    y: y,
                    z: z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: null,
                        endpoint: null,
                        uzunluk: 30
                    },
                    iliskiliVanaId: null
                };

                state.plumbingBlocks.push(cihazData);
                console.log(`    -> Kombi eklendi: (${x.toFixed(2)}, ${y.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Kombi işlenirken hata:", e, kombiEl);
        }
    });

    // 8.5. Ocaklar (clsocak)
    const ocakElements = xmlDoc.querySelectorAll("O[T='clsocak']");
    console.log(`\n${ocakElements.length} clsocak bulundu (tüm XML'de)`);

    ocakElements.forEach((ocakEl, idx) => {
        console.log(`  -> Ocak ${idx} işleniyor...`);
        try {
            const startPointEl = ocakEl.querySelector("P[F='StartPoint']");

            if (startPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const x = startCoords[0] * SCALE;
                const y = -startCoords[1] * SCALE;
                const z = startCoords[2] ? startCoords[2] * SCALE : 0;

                const cihazData = {
                    id: `cihaz_xml_${idx}_${Date.now()}`,
                    type: 'cihaz',
                    cihazTipi: 'OCAK',
                    x: x,
                    y: y,
                    z: z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: null,
                        endpoint: null,
                        uzunluk: 30
                    },
                    iliskiliVanaId: null
                };

                state.plumbingBlocks.push(cihazData);
                console.log(`    -> Ocak eklendi: (${x.toFixed(2)}, ${y.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Ocak işlenirken hata:", e, ocakEl);
        }
    });

    console.log("=========================================\n");

    // 9. Son işlemler
    console.log("\n=== İMPORT ÖZETİ ===");
    console.log(`Duvarlar: ${state.walls.length}`);
    console.log(`Node'lar: ${state.nodes.length}`);
    console.log(`Odalar: ${state.rooms.length}`);
    console.log(`Kapılar: ${state.doors.length}`);
    console.log(`Kolonlar: ${state.columns ? state.columns.length : 0}`);
    console.log(`Kirişler: ${state.beams ? state.beams.length : 0}`);
    console.log(`Merdivenler: ${state.stairs ? state.stairs.length : 0}`);
    console.log(`Tesisat Borular: ${state.plumbingPipes ? state.plumbingPipes.length : 0}`);
    console.log(`Tesisat Bileşenler: ${state.plumbingBlocks ? state.plumbingBlocks.length : 0}`);
    console.log("===================\n");

    // Room'lar için polygon ve center hesapla (turf.js kullanarak) - processWalls'tan ÖNCE
    if (state.rooms && state.rooms.length > 0) {
        console.log("\n=== ROOM POLYGON VE CENTER HESAPLANIYOR ===");
        console.log(`state.rooms.length: ${state.rooms.length}`);
        state.rooms.forEach((room, idx) => {
            console.log(`  forEach room ${idx}:`, room);
            console.log(`  room.vertices:`, room.vertices);
            console.log(`  room.vertices?.length:`, room.vertices?.length);
            if (room.vertices && room.vertices.length >= 3) {
                console.log(`  --> IF BLOĞUNA GİRDİ room ${idx}`);
                try {
                    // turf undefined check
                    if (typeof turf === 'undefined') {
                        console.error(`  Room ${idx} (${room.name}): turf undefined! CDN yüklenmemiş olabilir.`);
                        return;
                    }

                    // Turf.js için koordinat formatı: [[x, y], [x, y], ...]
                    const turfCoords = room.vertices.map(v => [v.x, v.y]);
                    // İlk ve son nokta aynı olmalı (kapalı polygon)
                    turfCoords.push(turfCoords[0]);

                    console.log(`  Room ${idx} (${room.name}): ${turfCoords.length} koordinat`);

                    // Turf polygon oluştur
                    room.polygon = turf.polygon([turfCoords]);

                    // Center hesapla
                    const centerPoint = turf.center(room.polygon);
                    room.center = centerPoint.geometry.coordinates;

                    // Alan hesapla (m²) - Planar area calculation (Shoelace formula)
                    room.area = calculatePlanarArea(room.polygon.geometry.coordinates) / 10000; // cm² to m²

                    console.log(`  Room ${idx} (${room.name}): center=[${room.center[0].toFixed(2)}, ${room.center[1].toFixed(2)}], area=${room.area.toFixed(2)} m²`);
                } catch (e) {
                    console.error(`  Room ${idx} (${room.name}) polygon hesaplama hatası:`, e);
                    console.error(`  Error name: ${e.name}, message: ${e.message}`);
                    console.error(`  Stack:`, e.stack);
                }
            }
        });
        console.log("==========================================\n");
    }

    // Duvarları process et ama room detection'ı skip et (room'lar XML'den geldi)
    console.log("\nprocessWalls çağrılıyor (skipRoomDetection=true, processAllFloors=true)...");
    processWalls(false, true, true); // skipMerge=false, skipRoomDetection=true, processAllFloors=true

    saveState();

    // Tesisat verilerini yükle
    if (state.plumbingBlocks?.length > 0 || state.plumbingPipes?.length > 0) {
        console.log("\n=== TESİSAT VERİLERİ YÜKLENMEK ÜZERE ===");
        console.log(`plumbingBlocks: ${state.plumbingBlocks.length}`);
        console.log(`plumbingPipes: ${state.plumbingPipes.length}`);

        // PlumbingManager'ı dinamik import ile yükle
        if (window.plumbingManager) {
            window.plumbingManager.loadFromState();
            console.log("PlumbingManager.loadFromState() çağrıldı!");
        } else {
            console.warn("PlumbingManager bulunamadı! Tesisat verileri yüklenemedi.");
        }
    }

    // 'dom' artık import edildiği için bu kontrol çalışacaktır
    if (dom.mainContainer.classList.contains('show-3d')) {
         setTimeout(update3DScene, 0);
    }
    // Ekrana sığdır
    setTimeout(fitDrawingToScreen, 100);

    console.log("XML başarıyla import edildi!", state);
}