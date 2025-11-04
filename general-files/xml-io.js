// general-files/xml-io.js
// GÜNCELLENDİ: X eksenindeki simetri (aynalama) sorununu çözmek için tüm Y koordinatları (-1) ile çarpıldı.
// GÜNCELLENDİ: Merdiven rotasyonu 90° CCW (-90) olarak ayarlandı ve boyutları (en/boy) buna göre düzeltildi.

import { state, setState, dom } from './main.js';
import { getOrCreateNode, distToSegmentSquared } from '../draw/geometry.js';
import { wallExists } from '../wall/wall-handler.js';
import { createColumn } from '../architectural-objects/columns.js';
import { createBeam } from '../architectural-objects/beams.js'; 
import { createStairs } from '../architectural-objects/stairs.js';
import { processWalls } from '../wall/wall-processor.js';
import { saveState } from './history.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { fitDrawingToScreen } from '../draw/zoom.js';

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
        startPoint: null
    });
    // --- TEMİZLİK SONU ---


    // 1. Duvarları (VdWall) oluştur ve nodeları kaydet
    // Yeni yapı: CloseArea içindeki Walls dizisini kontrol et
    const closeAreas = entities.querySelectorAll("O[F='_Item'][T='CloseArea']");
    console.log(`${closeAreas.length} CloseArea bulundu`);

    closeAreas.forEach((closeArea, idx) => {
        try {
            const wallsContainer = closeArea.querySelector("O[F='Walls']");
            console.log(`CloseArea ${idx}: Walls container:`, wallsContainer ? "bulundu" : "bulunamadı");

            if (wallsContainer) {
                const wallElements = wallsContainer.querySelectorAll("O[F='_Item'][T='VdWall']");
                console.log(`  -> ${wallElements.length} VdWall bulundu`);

                wallElements.forEach((wallEl, wallIdx) => {
                    console.log(`    -> Wall ${wallIdx} işleniyor...`);
                    processWallElement(wallEl);
                });
            }
        } catch (e) {
            console.error("CloseArea işlenirken hata:", e, closeArea);
        }
    });

    // Eski yapı için backward compatibility: Doğrudan VdWall elemanlarını kontrol et
    const directWallElements = entities.querySelectorAll("O[T='VdWall']");
    console.log(`${directWallElements.length} doğrudan VdWall bulundu`);

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
                        vents: []
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
    const kolonElements = entities.querySelectorAll("O[T='KolonHavalandirmasi'], O[F='_Item'][T='KolonHavalandirmasi']");
    console.log(`\n${kolonElements.length} KolonHavalandirmasi bulundu`);

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
    const doorElements = entities.querySelectorAll("O[T='Door'], O[F='_Item'][T='Door']");
    console.log(`\n${doorElements.length} Door bulundu`);

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
    const windowElements = entities.querySelectorAll("O[T='Window'], O[F='_Item'][T='Window']");
    console.log(`\n${windowElements.length} Window bulundu`);

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
    const ventElements = entities.querySelectorAll("O[T='Menfez']");
    ventElements.forEach(ventEl => {
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
    const stairElements = entities.querySelectorAll("O[T='clsmerdiven']");
    stairElements.forEach(stairEl => {
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

                // DÜZELTME: Y boyutunu ters çevir
                const xml_w = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const xml_h = -(parseFloat(heightEl.getAttribute('V')) * SCALE);

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

                if (!state.stairs) state.stairs = [];
                state.stairs.push(newStair);
            }
        } catch (e) {
            console.error("Merdiven işlenirken hata:", e, stairEl);
        }
    });


    // 7. Kirişleri (clskiris) işle
    const kirisElements = entities.querySelectorAll("O[T='clskiris']");
    kirisElements.forEach(kirisEl => {
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
                const newBeam = createBeam(
                    centerCoords[0] * SCALE, 
                    -centerCoords[1] * SCALE, 
                    height_xml, // length
                    width_xml,  // thickness
                    rotationDeg
                );

                if (!state.beams) state.beams = [];
                state.beams.push(newBeam);
            }
        } catch (e) {
            console.error("Kiriş işlenirken hata:", e, kirisEl);
        }
    });


    // 8. Son işlemler
    console.log("\n=== İMPORT ÖZETİ ===");
    console.log(`Duvarlar: ${state.walls.length}`);
    console.log(`Node'lar: ${state.nodes.length}`);
    console.log(`Kapılar: ${state.doors.length}`);
    console.log(`Kolonlar: ${state.columns ? state.columns.length : 0}`);
    console.log(`Kirişler: ${state.beams ? state.beams.length : 0}`);
    console.log(`Merdivenler: ${state.stairs ? state.stairs.length : 0}`);
    console.log("===================\n");

    processWalls();
    saveState();
    // 'dom' artık import edildiği için bu kontrol çalışacaktır
    if (dom.mainContainer.classList.contains('show-3d')) {
         setTimeout(update3DScene, 0);
    }
    // Ekrana sığdır
    setTimeout(fitDrawingToScreen, 100);

    console.log("XML başarıyla import edildi!", state);
}