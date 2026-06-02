// general-files/xml-io.js
// GÜNCELLENDİ: X eksenindeki simetri (aynalama) sorununu çözmek için tüm Y koordinatları (-1) ile çarpıldı.
// GÜNCELLENDİ: Merdiven rotasyonu 90° CCW (-90) olarak ayarlandı ve boyutları (en/boy) buna göre düzeltildi.

import { state, setState, dom, VECTORDRAW_AREA_TYPES } from './main.js';
import { getOrCreateNode, distToSegmentSquared, calculatePlanarArea, findBestLabelPosition } from '../draw/geometry.js';
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

// Gasline import varsayılan kat yüksekliği (cm). Sample dosyalardaki tüm projeler 300 cm.
const GASLINE_FLOOR_HEIGHT = 300;

// Standart DN çapları (boru-cap → DN string)
const STANDARD_DNS = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 400, 450];

// GLBORUCAP int (örn. 25) → "DN25". En yakın standart DN'e yuvarlar.
function _dnFromIntCap(intCap) {
    const v = Number(intCap);
    if (!Number.isFinite(v) || v <= 0) return 'DN25';
    const nearest = STANDARD_DNS.reduce((best, dn) =>
        Math.abs(dn - v) < Math.abs(best - v) ? dn : best
    );
    return `DN${nearest}`;
}

// ─── XML TOP-LEVEL PROP ARAMA YARDIMCISI ─────────────────────────────────
// querySelector deskendant taraması yapar; gasline XML'inde clsboru/clssayac/clsvana/
// clskombi gibi elemanların İÇİNDE (DrawEntities altında) ayrıca vdLine/vdRect bulunur
// ve bunların StartPoint/EndPoint/Origin'leri de "F=..." Pleridir. Doğrudan querySelector
// bu inner property'leri döndürür → asıl pipe/sayaç koordinatı yanlış parse edilir.
// Bu helper sadece DOĞRUDAN ÇOCUK P elementlerine bakar.
function _topProp(parentEl, fName) {
    if (!parentEl) return null;
    for (const child of parentEl.children) {
        if (child.tagName === 'P' && child.getAttribute('F') === fName) return child;
    }
    return null;
}

// --- GASLINE IMPORT HELPER'LARI ---------------------------------------------

// XML metin satırlarında \P ayracı veya gerçek yeni satır olabilir
function _splitTextLines(s) {
    if (!s) return [];
    return String(s).split(/\\P|\r?\n/).map(t => t.trim()).filter(Boolean);
}

// GLVANATIPI (int) + text → v2 vana tipi + izolator flag
function _mapVanaFromXML({ vanaTipiInt, textLines, muhafazali }) {
    const joined = (textLines || []).join(' ').toUpperCase();
    let tip = 'AKV';
    let izolator = false;
    if (joined.includes('SISMIK') || joined.includes('SİSMİK')) tip = 'SISMIK';
    else if (joined.includes('SELENOID') || joined.includes('SELENO')) tip = 'SELENOID';
    else if (joined.includes('BRAN')) tip = 'BRANSMAN';
    else if (joined.includes('YAN B') || joined.includes('YANB')) tip = 'YAN_BINA';
    else if (joined.includes('EMN')) tip = 'EMNIYET';
    else if (joined.includes('CİHAZ') || joined.includes('CIHAZ')) tip = 'CIHAZ';
    else {
        // GLVANATIPI int mapping
        switch (vanaTipiInt) {
            case 1: tip = 'AKV'; break;            // Açma-Kapama Vanası
            case 2: tip = 'BRANSMAN'; break;       // Daire branşmanı
            case 3: tip = 'AKV'; break;            // EKV → AKV
            case 4: tip = 'AKV'; izolator = true; break; // İzolatörlü
            case 5: tip = 'EMNIYET'; break;        // Emniyet vanası
            case 7: tip = 'AKV'; break;            // KKV yok → AKV
            default: tip = 'AKV';
        }
    }
    // "İzolatörlü" metni varsa izolator flag'ini set et
    if (joined.includes('İZOLAT') || joined.includes('IZOLAT')) izolator = true;
    return { tip, izolator, muhafaza: !!muhafazali };
}

// Birim no: "D3\PDaire" veya "AKV\PDN50\Ph:1.8m" → sadece D3 çıkar
function _extractBirimNo(textLines) {
    for (const line of textLines) {
        const m = /\b(D\d+|G\d+|K\d+)\b/.exec(line);
        if (m) return m[1];
    }
    return '';
}

// Çap: "DN50" / "DN32" → 50 / 32
function _extractVanaCap(textLines) {
    for (const line of textLines) {
        const m = /DN\s*(\d+)/i.exec(line);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

// Kombi/Ocak description text'ini parse et
function _parseCihazText(textLines) {
    const out = { bacaTipi: null, yogusmali: false, marka: null, model: null, kapasiteKcal: null, kapasiteKW: null };
    const joined = textLines.join(' ');
    const upperJoined = joined.toUpperCase();

    // Baca tipi
    if (/HERMET[İI]K/i.test(joined)) out.bacaTipi = 'Hermetik';
    else if (/BACASIZ/i.test(joined)) out.bacaTipi = 'Bacasız';
    else if (/ATMOSFER[İI]K/i.test(joined)) out.bacaTipi = 'Atmosferik';

    // Yoğuşmalı
    if (/YO[ĞG]U[ŞS]/i.test(joined)) out.yogusmali = true;

    // Kapasite: "20726Kcal/h", "20.726 Kcal/h", "87720Kcal/h" — hem küçük hem büyük harf
    const kcalM = /(\d[\d.,]*)\s*[Kk][Cc][Aa][Ll]\s*\/?\s*[Hh]/.exec(joined);
    if (kcalM) {
        const num = kcalM[1].replace(/\./g, '').replace(',', '.');
        const v = parseFloat(num);
        if (!isNaN(v)) out.kapasiteKcal = v;
    }
    // "(24,1KW)", "24 kW", "102 KW"
    const kwM = /(\d[\d.,]*)\s*[Kk][Ww]\b/.exec(joined);
    if (kwM) {
        const num = kwM[1].replace(/\./g, '').replace(',', '.');
        const v = parseFloat(num);
        if (!isNaN(v)) out.kapasiteKW = v;
    }

    // Kapasiteler birbirinden türetilebilir (1 kW ≈ 860 Kcal/h)
    if (out.kapasiteKcal && !out.kapasiteKW) out.kapasiteKW = parseFloat((out.kapasiteKcal / 860).toFixed(2));
    if (out.kapasiteKW && !out.kapasiteKcal) out.kapasiteKcal = Math.round(out.kapasiteKW * 860);

    // Marka / Model: açıklayıcı olmayan satırlar
    const stripped = textLines.filter(l => !/Kcal|KW|kW|Hermet|Bacas|Atmosfer|Yoğu|Yogus|Evsel|Duvar Tipi|Kazan|Kombi|Ocak|Cihaz|drenaj|Onayl|GAZMER|ATM|Dirsek|L=|\bG\b/i.test(l));
    if (stripped.length >= 1 && !out.marka) out.marka = stripped[0];
    if (stripped.length >= 2 && !out.model) out.model = stripped[1];

    return out;
}

// Z kotlarından kat tespit et ve state.floors'u kur.
// Gasline'da slab tepe kotları FLOOR_HEIGHT (=300 cm) katları halindedir: 0, 300, 600...
// Her Z için floor_idx = floor(z / FLOOR_HEIGHT) hesaplayarak içeriği barındıran tüm katları
// bulup üst üste binmeyecek şekilde 300 cm dilimlere ayırırız. Negatif idx bodrum katı olur.
// Kullanıcı önceden gerçek kat tanımladıysa hiç dokunulmaz.
function _ensureFloorsFromZValues(zValues, existingFloors) {
    const realFloors = (existingFloors || []).filter(f => !f.isPlaceholder);
    if (realFloors.length >= 2) return null;

    const zs = zValues.filter(v => Number.isFinite(v));
    if (zs.length === 0) return null;

    const FH = GASLINE_FLOOR_HEIGHT;

    // İçerikli kat indekslerini topla
    const occupied = new Set();
    zs.forEach(z => occupied.add(Math.floor(z / FH)));

    if (occupied.size === 0) return null;

    let minIdx = Infinity, maxIdx = -Infinity;
    occupied.forEach(i => { if (i < minIdx) minIdx = i; if (i > maxIdx) maxIdx = i; });

    // En alt görünür katı 0 sayalım → bodrum negatif kalır
    // (Önceki algoritma min'i Zemin yapıyordu; gasline'da Z=0 zaten Zemin olarak gelir)
    const floors = [];
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    for (let idx = minIdx; idx <= maxIdx; idx++) {
        const bottom = idx * FH;
        const top = bottom + FH;
        const name = idx === 0 ? 'Zemin'
            : idx > 0 ? `${idx}. Kat`
            : `Bodrum ${-idx}`;
        floors.push({
            id: `floor-xml-${idx >= 0 ? idx : 'b' + (-idx)}-${stamp}`,
            name,
            bottomElevation: bottom,
            topElevation: top,
            visible: occupied.has(idx),
            isPlaceholder: false
        });
    }

    return floors;
}

// Import sonrası boruları uçlarından birbirine bağla ve doğrultularını normalize et.
// Sayaç giriş/çıkış fleks segmentlerinden başlayan BFS ile her boru ziyaret edilir;
// her boru için "parent'a bakan uç = p1" konvansiyonu sağlanır (gerekirse p1/p2 takas).
// Böylece computePipeDebileri'nin baslangicBaglanti.tip='boru' zinciri kesintisiz olur.
function _linkPipeNetwork(pipes) {
    if (!pipes || pipes.length === 0) return;
    // 30 cm — _topProp düzeltmesi sonrası uç-uç eşleşmeleri 0.001 cm hassasiyetinde olsa da
    // gasline'ın bazı çizimlerinde fitting/dönüş noktaları 10-20 cm sapabiliyor. 60 cm fazla gevşek
    // (komşu hatları birleştiriyordu); 15 cm çok sıkı (chain kırılıyordu). 30 güvenli orta.
    const TOL = 30;
    const eq3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) <= TOL;
    const pipeMap = new Map(pipes.map(p => [p.id, p]));
    let _linkCount = 0;

    // 'next' borusunun p1'i 'parent' borusuna en yakın uca eşit olacak şekilde gerekirse takas et,
    // sonra baslangicBaglanti'yi parent'a 'boru' tipiyle ayarla.
    function _orientAndLink(next, parent, touchingEndOfNext) {
        if (!touchingEndOfNext) {
            const d1 = Math.min(
                Math.hypot(next.p1.x - parent.p1.x, next.p1.y - parent.p1.y, (next.p1.z||0)-(parent.p1.z||0)),
                Math.hypot(next.p1.x - parent.p2.x, next.p1.y - parent.p2.y, (next.p1.z||0)-(parent.p2.z||0))
            );
            const d2 = Math.min(
                Math.hypot(next.p2.x - parent.p1.x, next.p2.y - parent.p1.y, (next.p2.z||0)-(parent.p1.z||0)),
                Math.hypot(next.p2.x - parent.p2.x, next.p2.y - parent.p2.y, (next.p2.z||0)-(parent.p2.z||0))
            );
            touchingEndOfNext = d1 <= d2 ? 'p1' : 'p2';
        }
        if (touchingEndOfNext === 'p2') {
            [next.p1, next.p2] = [next.p2, next.p1];
            const tmp = next.baslangicBaglanti;
            next.baslangicBaglanti = next.bitisBaglanti;
            next.bitisBaglanti = tmp;
        }
        // Parent'ın hangi ucunda olduğumuzu da belirle (debugging + bazı renderer'lar için)
        const dToParentP1 = Math.hypot(next.p1.x - parent.p1.x, next.p1.y - parent.p1.y, (next.p1.z||0)-(parent.p1.z||0));
        const dToParentP2 = Math.hypot(next.p1.x - parent.p2.x, next.p1.y - parent.p2.y, (next.p1.z||0)-(parent.p2.z||0));
        const parentEnd = dToParentP1 <= dToParentP2 ? 'p1' : 'p2';
        next.baslangicBaglanti = { tip: 'boru', hedefId: parent.id, noktaIndex: parentEnd };
        _linkCount++;
    }

    // Yardımcı: nokta `pt` segmentin (segP1→segP2) GÖVDESİ üzerinde mi? (T-bağlantı)
    function _pointOnBody(pt, segP1, segP2) {
        const dx = segP2.x - segP1.x, dy = segP2.y - segP1.y, dz = (segP2.z||0) - (segP1.z||0);
        const len2 = dx*dx + dy*dy + dz*dz;
        if (len2 < 1) return null;
        const t = ((pt.x - segP1.x)*dx + (pt.y - segP1.y)*dy + ((pt.z||0)-(segP1.z||0))*dz) / len2;
        if (t < 0.05 || t > 0.95) return null; // uçları hariç tut
        const px = segP1.x + t*dx, py = segP1.y + t*dy, pz = (segP1.z||0) + t*dz;
        const d = Math.hypot(pt.x - px, pt.y - py, (pt.z||0) - pz);
        return d <= TOL ? t : null;
    }

    const visited = new Set();
    const queue = [];

    // Seed: bileşen-bağlı borular (sayaç giriş/çıkış fleks segmentleri, cihaz fleksleri,
    // servis kutusu çıkışı). Yalnızca sayaçtan seed verilirse, sayaç linki kurulamamış
    // dosyalarda BFS hiç başlamaz ve tüm chain kırılır.
    const SEED_TIPS = new Set(['sayac', 'cihaz', 'servis_kutusu']);
    pipes.forEach(p => {
        if (SEED_TIPS.has(p.baslangicBaglanti?.tip) || SEED_TIPS.has(p.bitisBaglanti?.tip)) {
            if (!visited.has(p.id)) { visited.add(p.id); queue.push(p.id); }
        }
    });

    while (queue.length) {
        const cur = pipeMap.get(queue.shift());
        if (!cur) continue;

        // (1) cur'un her iki tarafındaki mevcut 'boru' linklerini takip et — yön normalize et
        for (const f of ['baslangicBaglanti', 'bitisBaglanti']) {
            const bag = cur[f];
            if (bag?.tip === 'boru' && bag.hedefId) {
                const next = pipeMap.get(bag.hedefId);
                if (next && !visited.has(next.id)) {
                    _orientAndLink(next, cur, null);
                    visited.add(next.id);
                    queue.push(next.id);
                }
            }
        }

        // (2) cur'un AÇIK uçlarından komşu boru uçları ara
        for (const myEnd of ['p1', 'p2']) {
            const bag = myEnd === 'p1' ? cur.baslangicBaglanti : cur.bitisBaglanti;
            if (bag?.tip === 'boru' || bag?.tip === 'sayac' ||
                bag?.tip === 'cihaz' || bag?.tip === 'servis_kutusu') continue;

            const myPt = cur[myEnd];
            for (const other of pipes) {
                if (other.id === cur.id || visited.has(other.id)) continue;
                if (!other.p1 || !other.p2) continue;
                let touching = null;
                if (eq3(myPt, other.p1)) touching = 'p1';
                else if (eq3(myPt, other.p2)) touching = 'p2';
                if (!touching) continue;
                _orientAndLink(other, cur, touching);
                visited.add(other.id);
                queue.push(other.id);
            }
        }

        // (3) T-BAĞLANTI: cur'un GÖVDESİNE bir başka borunun ucu temas ediyor mu?
        // Bu boru cur'un "child"ı olur (debi onun üzerinden cur'a akar).
        for (const other of pipes) {
            if (other.id === cur.id || visited.has(other.id)) continue;
            if (!other.p1 || !other.p2) continue;
            // other'ın hangi ucu cur'un body'sinde? p1 öncelikli (zaten convention).
            const tP1 = _pointOnBody(other.p1, cur.p1, cur.p2);
            const tP2 = _pointOnBody(other.p2, cur.p1, cur.p2);
            if (tP1 == null && tP2 == null) continue;
            const touching = (tP1 != null && (tP2 == null || tP1 < tP2)) ? 'p1' : 'p2';
            _orientAndLink(other, cur, touching);
            visited.add(other.id);
            queue.push(other.id);
        }
    }

    console.log(`  -> _linkPipeNetwork: ${visited.size}/${pipes.length} boru zincire dahil edildi, ${_linkCount} link kuruldu`);

    // Seed yok ise (sayaç hiç parse edilmediyse) — yine de borular arasında uç-uç
    // eşleşmesi yapılır ki istemcide grafik bütünlüğü olsun (debi olmasa da hat çizilir).
    if (visited.size === 0) {
        // Herhangi bir boruyu kök olarak seç ve BFS yap
        const root = pipes[0];
        if (root) {
            visited.add(root.id);
            queue.push(root.id);
            while (queue.length) {
                const cur = pipeMap.get(queue.shift());
                if (!cur) continue;
                for (const myEnd of ['p1', 'p2']) {
                    const myPt = cur[myEnd];
                    for (const other of pipes) {
                        if (other.id === cur.id || visited.has(other.id)) continue;
                        if (!other.p1 || !other.p2) continue;
                        let touching = null;
                        if (eq3(myPt, other.p1)) touching = 'p1';
                        else if (eq3(myPt, other.p2)) touching = 'p2';
                        if (!touching) continue;
                        _orientAndLink(other, cur, touching);
                        visited.add(other.id);
                        queue.push(other.id);
                    }
                }
            }
        }
    }
}

function _findFloorIdForZ(z, floors) {
    if (!floors || !floors.length) return null;
    const v = Number.isFinite(z) ? z : 0;
    for (const f of floors) {
        if (f.isPlaceholder) continue;
        if (v >= f.bottomElevation && v < f.topElevation) return f.id;
    }
    // Range dışında ise en yakına at
    let best = null, bestD = Infinity;
    for (const f of floors) {
        if (f.isPlaceholder) continue;
        const d = Math.min(Math.abs(v - f.bottomElevation), Math.abs(v - f.topElevation));
        if (d < bestD) { bestD = d; best = f; }
    }
    return best ? best.id : null;
}

// --------------------------------------------------------------------------

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
export function importFromXML(xmlString, options = {}) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Proje adını input'a yaz (dosya adı öncelikli, yoksa bina/abone ünvanı)
    try {
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) {
            let pname = options.fileName;
            if (!pname) {
                // Bina yönetimi sayacı ya da ilk sayaç ünvanını dene
                const unvanEl = xmlDoc.querySelector("O[T='clssayac'] P[F='GLAboneUnvan']");
                if (unvanEl) pname = unvanEl.getAttribute('V');
            }
            if (pname) {
                nameInput.value = pname;
                window.currentProjectName = pname;
            }
        }
    } catch (e) { /* ignore */ }

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

    // --- ÖNEMLİ: Import öncesi mevcut state'i tamamen temizle ---
    // Eski katlar dahil her şey sıfırlansın ki yeni import temiz başlangıç yapsın.
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
        plumbingPipes: [],
        plumbingNodes: [],
        plumbingLabelOffsets: {},
        floors: [],
        currentFloor: null
    });
    // --- TEMİZLİK SONU ---

    // --- Z-FARKINDA DUVAR YARDIMCILARI ---
    // Gasline çoklu kat mimarisinde duvarlar farklı Z'lerde ama aynı X/Y'de gelebilir.
    // Global getOrCreateNode/wallExists Z'yi bilmediği için ayrı katların duvarlarını
    // birleştirip eziyorlardı. Bu yardımcılar her kat (Z grubu) için izole node havuzu tutar.
    const _wallNodesByFloorIdx = new Map();  // floorIdx → Array<{x,y}>
    const _wallsByFloorIdx     = new Map();  // floorIdx → Array<wall>
    const _wallFloorIdxFor = (z) => Math.floor((Number(z) || 0) / GASLINE_FLOOR_HEIGHT);
    function _getOrCreateWallNodeAtZ(x, y, z) {
        const fi = _wallFloorIdxFor(z);
        if (!_wallNodesByFloorIdx.has(fi)) _wallNodesByFloorIdx.set(fi, []);
        const nodes = _wallNodesByFloorIdx.get(fi);
        const SNAP = 1; // cm — XML koordinatları net olduğu için dar tolerans yeterli
        for (const n of nodes) {
            if (Math.hypot(n.x - x, n.y - y) < SNAP) return n;
        }
        const nn = { x, y };
        nodes.push(nn);
        state.nodes.push(nn); // global liste (legacy okumalar için)
        return nn;
    }
    function _wallExistsAtZ(p1, p2, z) {
        const fi = _wallFloorIdxFor(z);
        const arr = _wallsByFloorIdx.get(fi) || [];
        return arr.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
    }
    function _registerWallForZ(wall, z) {
        const fi = _wallFloorIdxFor(z);
        if (!_wallsByFloorIdx.has(fi)) _wallsByFloorIdx.set(fi, []);
        _wallsByFloorIdx.get(fi).push(wall);
    }
    // --- /Z-FARKINDA DUVAR YARDIMCILARI ---

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
                // İçindeki ilk duvardan Z (kat) bilgisini al — multi-floor mimari için kritik
                let roomZ = 0;
                if (wallsContainer) {
                    const firstWall = wallsContainer.querySelector("O[F='_Item'][T='VdWall']");
                    const spEl = firstWall?.querySelector("P[F='StartPoint']");
                    if (spEl) {
                        const coords = spEl.getAttribute('V').split(',').map(Number);
                        roomZ = (coords[2] || 0) * SCALE;
                    }
                }
                const room = {
                    type: 'room',
                    name: roomName,
                    vertices: vertices,
                    areaType: areaTypeValue,
                    _srcZ: roomZ
                };
                state.rooms.push(room);
                console.log(`  -> Room eklendi: ${roomName} (${vertices.length} köşe, srcZ=${roomZ})`);
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

    // Duvar işleme fonksiyonu (Z-farkında)
    function processWallElement(wallEl) {
        try {
            const startPointEl = wallEl.querySelector("P[F='StartPoint']");
            const endPointEl = wallEl.querySelector("P[F='EndPoint']");
            const widthEl = wallEl.querySelector("P[F='Width']"); // Kalınlık

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                // Z (3. koord) gasline'da kat slab tepesini gösterir (0=Zemin, 3=1.Kat, ...).
                const zStart = (startCoords[2] || 0) * SCALE;
                const zEnd = (endCoords[2] || 0) * SCALE;
                const wallZ = (zStart + zEnd) / 2;

                // DÜZELTME: Y eksenini ters çevir (Y -> -Y)
                const p1 = { x: startCoords[0] * SCALE, y: -startCoords[1] * SCALE };
                const p2 = { x: endCoords[0] * SCALE, y: -endCoords[1] * SCALE };

                const node1 = _getOrCreateWallNodeAtZ(p1.x, p1.y, wallZ);
                const node2 = _getOrCreateWallNodeAtZ(p2.x, p2.y, wallZ);

                if (node1 !== node2 && !_wallExistsAtZ(node1, node2, wallZ)) {
                    // Kalınlığı XML'den al, yoksa varsayılanı kullan
                    const thickness = widthEl ? (parseFloat(widthEl.getAttribute('V')) * SCALE) : state.wallThickness;

                    const newWall = {
                        type: "wall",
                        p1: node1,
                        p2: node2,
                        thickness: thickness,
                        wallType: 'normal',
                        windows: [],
                        vents: [],
                        floorId: null, // gerçek floorId, kat tespiti sonrasında _srcZ'ye göre atanır
                        _srcZ: wallZ
                    };
                    state.walls.push(newWall);
                    _registerWallForZ(newWall, wallZ);
                } else {
                    // duplicate veya aynı node (sessiz geç — multi-floor'da spam olmasın)
                }
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

    // Z-farkında en yakın duvar bulucu: kapı/pencere/menfez aynı kattaki duvarlara yapıştırılmalı.
    // Çoklu kat mimaride aynı X/Y'de farklı katlarda duvarlar var; XY-tek findClosestWallAndPosition
    // yanlış kata isabet ediyordu (kapılar başka katta görünüp aktif katta hiç görünmüyordu).
    function _closestWallAtZ(origin, z) {
        const targetFloorIdx = _wallFloorIdxFor(z);
        const candidates = state.walls.filter(w => {
            if (w._srcZ == null) return true; // legacy
            return _wallFloorIdxFor(w._srcZ) === targetFloorIdx;
        });
        let best = null, bestPos = 0, bestDsq = Infinity;
        const tolSq = Math.pow(state.wallThickness * 2, 2);
        for (const w of candidates) {
            if (!w.p1 || !w.p2) continue;
            const dsq = distToSegmentSquared(origin, w.p1, w.p2);
            if (dsq < tolSq && dsq < bestDsq) {
                const dx = w.p2.x - w.p1.x, dy = w.p2.y - w.p1.y;
                const len2 = dx * dx + dy * dy;
                if (len2 < 0.01) continue;
                let t = ((origin.x - w.p1.x) * dx + (origin.y - w.p1.y) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                bestPos = t * Math.sqrt(len2);
                bestDsq = dsq;
                best = w;
            }
        }
        return { wall: best, pos: bestPos };
    }

    // 3. Kapıları (Door) işle
    const doorElements = xmlDoc.querySelectorAll("O[T='Door']");
    console.log(`\n${doorElements.length} Door bulundu (tüm XML'de)`);

    doorElements.forEach((doorEl, idx) => {
        try {
            // Top-level Ps — descendant query Door içindeki vdRect'lerden yanlış değer alıyordu.
            const originEl = _topProp(doorEl, 'Origin') || _topProp(doorEl, 'origin');
            const widthEl = _topProp(doorEl, 'En') || _topProp(doorEl, 'Width');

            if (originEl && widthEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const doorZ = (originCoords[2] || 0) * SCALE;
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;

                const { wall, pos } = _closestWallAtZ(origin, doorZ);

                if (wall) {
                    state.doors.push({
                        wall: wall,
                        pos: pos,
                        width: width,
                        type: 'door',
                        floorId: wall.floorId || null
                    });
                } else {
                    console.warn(`Kapı ${idx} için yakın duvar bulunamadı (z=${doorZ}):`, origin);
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
        try {
            const originEl = _topProp(winEl, 'Origin') || _topProp(winEl, 'origin');
            const widthEl = _topProp(winEl, 'En') || _topProp(winEl, 'Width');

            if (originEl && widthEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const winZ = (originCoords[2] || 0) * SCALE;
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;

                const { wall, pos } = _closestWallAtZ(origin, winZ);

                if (wall) {
                    if (!wall.windows) wall.windows = [];
                    wall.windows.push({
                        pos: pos,
                        width: width,
                        type: 'window'
                    });
                } else {
                    console.warn(`Pencere ${idx} için yakın duvar bulunamadı (z=${winZ}):`, origin);
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
        try {
            const originEl = _topProp(ventEl, 'Origin') || _topProp(ventEl, 'origin');
            if (originEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const ventZ = (originCoords[2] || 0) * SCALE;
                const width = 30; // Varsayılan menfez çapı

                const { wall, pos } = _closestWallAtZ(origin, ventZ);

                if (wall) {
                    if (!wall.vents) wall.vents = [];
                    wall.vents.push({
                        pos: pos,
                        width: width,
                        type: 'vent'
                    });
                } else {
                    console.warn(`Menfez ${idx} için yakın duvar bulunamadı (z=${ventZ}):`, origin);
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

                // DÜZELTME: InsertionPoint merkez DEĞİL, köşe noktası
                // InsertionPoint'ten merkez koordinatına dönüştürme:
                // 1. InsertionPoint yerel koordinat sisteminde (rotation=0)
                // 2. Merkez offset = (width/2, height/2)
                // 3. Bu offset'i rotation kadar döndür
                // 4. InsertionPoint + rotated offset = gerçek merkez
                //
                // createBeam: (centerX, centerY, width=length, height=thickness, rotation)

                const insertionX = centerCoords[0] * SCALE;
                const insertionY = -centerCoords[1] * SCALE;

                // Merkez offset'i hesapla (local koordinatlarda)
                const halfWidth = width_xml / 2;
                const halfHeight = height_xml / 2;

                // Rotation uygula (InsertionPoint'ten merkeze giden vektörü döndür)
                const cos = Math.cos(rotationRad);
                const sin = Math.sin(rotationRad);

                // Rotated offset
                const offsetX = halfWidth * cos - halfHeight * sin;
                const offsetY = halfWidth * sin + halfHeight * cos;

                // Gerçek merkez = InsertionPoint + rotated offset
                const centerX = insertionX + offsetX;
                const centerY = insertionY - offsetY; // Y-eksen ters olduğu için -offsetY

                const newBeam = createBeam(
                    centerX,
                    centerY,
                    width_xml,    // length (XML Width)
                    height_xml,   // thickness (XML Height)
                    rotationDeg   // Rotation
                );

                if (!state.beams) state.beams = [];
                state.beams.push(newBeam);

                console.log(`    -> Kiriş eklendi: insertion=(${insertionX.toFixed(2)}, ${insertionY.toFixed(2)}), merkez=(${centerX.toFixed(2)}, ${centerY.toFixed(2)}), length=${width_xml.toFixed(1)}, thickness=${height_xml.toFixed(1)}, rotation=${rotationDeg.toFixed(1)}°`);
            }
        } catch (e) {
            console.error("Kiriş işlenirken hata:", e, kirisEl);
        }
    });


    // 8. Tesisat elementlerini parse et
    console.log("\n=== TESİSAT ELEMENTLERİ PARSE EDİLİYOR ===");

    // Yardımcı fonksiyon: İki nokta arasındaki mesafeyi hesapla
    function distance3D(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z || 0) - (p2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Yardımcı fonksiyon: Verilen noktaya en yakın boru ucunu bul
    function findClosestPipeEnd(point, pipes, tolerance = 10) {
        let closestPipe = null;
        let closestEnd = null;
        let minDistance = tolerance;

        for (const pipe of pipes) {
            // p1 ucuna olan mesafe
            const dist1 = distance3D(point, pipe.p1);
            if (dist1 < minDistance) {
                minDistance = dist1;
                closestPipe = pipe;
                closestEnd = 'p1';
            }

            // p2 ucuna olan mesafe
            const dist2 = distance3D(point, pipe.p2);
            if (dist2 < minDistance) {
                minDistance = dist2;
                closestPipe = pipe;
                closestEnd = 'p2';
            }
        }

        return closestPipe ? { pipe: closestPipe, end: closestEnd, distance: minDistance } : null;
    }

    // 8.1. ÖNCE TÜM BORULARI PARSE ET (Bağlantılar için gerekli)
    const boruElements = xmlDoc.querySelectorAll("O[T='clsboru']");
    console.log(`\n${boruElements.length} clsboru bulundu (tüm XML'de)`);

    boruElements.forEach((boruEl, idx) => {
        try {
            // ÖNEMLİ: top-level (doğrudan çocuk) Ps kullan — querySelector iç vdLine'lardan
            // yanlış StartPoint döndürüyor (clsboru içinde DrawEntities altında sketch çizgileri var).
            const startPointEl = _topProp(boruEl, 'StartPoint');
            const endPointEl   = _topProp(boruEl, 'EndPoint');
            const boruCapEl    = _topProp(boruEl, 'GLBORUCAP');

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

                // Boru çapı: XML int → DN string (DN15..DN450).
                // Eski kod boruCap'i sayı olarak hesaplıyor ama nesneye atamıyordu;
                // bu yüzden tüm borular varsayılan DN25 görünüyordu (hat numaralandırması da
                // diametre değişimini göremiyordu).
                const boruCapInt = boruCapEl ? parseInt(boruCapEl.getAttribute('V')) : 25;
                const boruCap = _dnFromIntCap(boruCapInt);
                const boruTipi = boruCapInt > 30 ? 'KALIN' : 'STANDART';

                const boruData = {
                    id: `boru_xml_${idx}_${Date.now()}`,
                    type: 'boru',
                    boruTipi: boruTipi,
                    boruCap: boruCap,
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

    // 8.1b. Branşman (clsbransman) → BRANSMAN vanası (sonlanma vanası)
    // Not: clsbransman gerçek servis kutusu değil, daire branşmanı vanasıdır.
    const bransmanElements = xmlDoc.querySelectorAll("O[T='clsbransman']");
    console.log(`\n${bransmanElements.length} clsbransman bulundu (daire branşmanı vana)`);

    bransmanElements.forEach((bransmanEl, idx) => {
        try {
            const sp = _topProp(bransmanEl, 'StartPoint') || _topProp(bransmanEl, 'origin');
            const ep = _topProp(bransmanEl, 'EndPoint');
            if (!sp) return;
            const sc = sp.getAttribute('V').split(',').map(Number);
            const ec = (ep ? ep.getAttribute('V') : sp.getAttribute('V')).split(',').map(Number);
            const topZ = Math.max((sc[2] || 0), (ec[2] || 0)) * SCALE;
            const point = { x: sc[0] * SCALE, y: -sc[1] * SCALE, z: topZ };

            // Branşman debisi: XML'de değer varsa onu, yoksa standart 3.5 m³/h
            const ekTukEl = _topProp(bransmanEl, 'GLEKTUKETIM');
            const xmlDebi = ekTukEl ? parseFloat(ekTukEl.getAttribute('V')) : 0;
            const bransmanDebi = (xmlDebi && xmlDebi > 0) ? xmlDebi : 3.5;

            const birimSayisiEl2 = _topProp(bransmanEl, 'GLBIRIMSAYISI');
            const dukkanSayisiEl2 = _topProp(bransmanEl, 'GLDUKKANSAYISI');
            const daireNoEl2 = _topProp(bransmanEl, 'GLDAIRENO');

            const yakin = findClosestPipeEnd(point, state.plumbingPipes, 80);
            const vanaData = {
                id: `vana_bransman_xml_${idx}_${Date.now()}`,
                type: 'vana',
                x: point.x, y: point.y, z: point.z,
                rotation: 0,
                vanaTipi: 'BRANSMAN',
                floorId: state.currentFloor?.id,
                bagliBoruId: yakin ? yakin.pipe.id : null,
                boruPozisyonu: 1.0,
                fromEnd: yakin ? yakin.end : null,
                fixedDistance: 0,
                girisBagliBoruId: null,
                cikisBagliBoruId: null,
                showEndCap: false,
                vanaCap: null,
                izolator: false,
                muhafaza: false,
                muhafazaGrupla: false,
                birimNo: daireNoEl2?.getAttribute('V') || '',
                tesisatNo: '',
                daireSayisi: birimSayisiEl2 ? parseInt(birimSayisiEl2.getAttribute('V')) || 0 : 0,
                dukkanSayisi: dukkanSayisiEl2 ? parseInt(dukkanSayisiEl2.getAttribute('V')) || 0 : 0,
                ekDebi: 0,
                bransmanDebi: bransmanDebi
            };
            if (yakin) {
                yakin.pipe.uzerindekiElemanlar = yakin.pipe.uzerindekiElemanlar || [];
                yakin.pipe.uzerindekiElemanlar.push({ tip: 'vana', elemanId: vanaData.id, pozisyon: 1.0 });
            }
            state.plumbingBlocks.push(vanaData);
        } catch (e) {
            console.error("Branşman vana işlenirken hata:", e, bransmanEl);
        }
    });

    // 8.2. Sayaçlar (clssayac) - Şimdi boru bağlantılarını da kur
    const sayacElements = xmlDoc.querySelectorAll("O[T='clssayac']");
    console.log(`\n${sayacElements.length} clssayac bulundu (tüm XML'de)`);

    sayacElements.forEach((sayacEl, idx) => {
        try {
            // top-level (doğrudan çocuk) StartPoint/EndPoint — querySelector iç vdLine'lardan
            // yanlış değer döndürüyor (clssayac içinde DrawEntities altında sketch çizgileri var).
            const startPointEl = _topProp(sayacEl, 'StartPoint');
            const endPointEl = _topProp(sayacEl, 'EndPoint');

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                // Giriş ve çıkış noktalarını hesapla
                const girisPoint = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                const cikisPoint = {
                    x: endCoords[0] * SCALE,
                    y: -endCoords[1] * SCALE,
                    z: endCoords[2] ? endCoords[2] * SCALE : 0
                };

                // Merkez koordinatı hesapla (start ve end ortası)
                const centerX = (girisPoint.x + cikisPoint.x) / 2;
                const centerY = (girisPoint.y + cikisPoint.y) / 2;
                const z = girisPoint.z;

                // Giriş ve çıkış borularını bul. Tolerance=80cm (varsayılan 10cm gasline'da
                // saymaç-pipe arası boşluk için yetersiz; null dönerse hiç fleks segment
                // oluşmuyor → sayaç havada kalıyor, debi propagasyonu için seed yok).
                const girisBoru = findClosestPipeEnd(girisPoint, state.plumbingPipes, 80);
                const cikisBoru = findClosestPipeEnd(cikisPoint, state.plumbingPipes, 80);

                // DÜZELTME: Sayaç girişine fleks segment ekle (tıpkı çıkış segment gibi)
                let girisBoruId = null;
                if (girisBoru) {
                    // Sayaç giriş noktasından boru ucuna doğru kısa bir fleks segment ekle
                    const girisFleksUzunluk = 30; // 30cm fleks segment

                    // Yön vektörü hesapla: sayaç giriş noktasından boru ucuna doğru
                    const boruUcu = girisBoru.end === 'p1' ? girisBoru.pipe.p1 : girisBoru.pipe.p2;
                    const dx = boruUcu.x - girisPoint.x;
                    const dy = boruUcu.y - girisPoint.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance > 0.1) {
                        // Normalize edilmiş yön vektörü
                        const nx = dx / distance;
                        const ny = dy / distance;

                        // Fleks segment bitiş noktası (boru ucuna doğru)
                        const girisFleksP2 = {
                            x: girisPoint.x + nx * Math.min(girisFleksUzunluk, distance),
                            y: girisPoint.y + ny * Math.min(girisFleksUzunluk, distance),
                            z: girisPoint.z
                        };

                        // Fleks segment borusu oluştur (esnek tip)
                        const girisFleksBoru = {
                            id: `boru_sayac_giris_fleks_${idx}_${Date.now()}`,
                            type: 'boru',
                            boruTipi: 'FLEKS', // Esnek boru
                            boruCap: girisBoru.pipe.boruCap || 'DN25', // upstream kolon çapı
                            p1: { ...girisPoint },
                            p2: girisFleksP2,
                            colorGroup: 'YELLOW',
                            floorId: state.currentFloor?.id,
                            baslangicBaglanti: {
                                tip: 'sayac',
                                hedefId: null, // Sayaç ID'si sonra eklenecek
                                baglananNokta: 'giris'
                            },
                            bitisBaglanti: {
                                tip: 'boru',
                                hedefId: girisBoru.pipe.id,
                                noktaIndex: girisBoru.end
                            },
                            uzerindekiElemanlar: [],
                            tBaglantilar: []
                        };

                        state.plumbingPipes.push(girisFleksBoru);
                        girisBoruId = girisFleksBoru.id;

                        // Giriş borusunun bağlantısını güncelle (orijinal boru fleks segment'e bağlan)
                        if (girisBoru.end === 'p1') {
                            girisBoru.pipe.baslangicBaglanti = {
                                tip: 'boru',
                                hedefId: girisFleksBoru.id,
                                noktaIndex: 'p2'
                            };
                        } else {
                            girisBoru.pipe.bitisBaglanti = {
                                tip: 'boru',
                                hedefId: girisFleksBoru.id,
                                noktaIndex: 'p2'
                            };
                        }

                        console.log(`    -> Sayaç giriş fleks segment eklendi: ${girisFleksUzunluk}cm fleks`);
                    }
                }

                // DÜZELTME: Sayaç çıkışına kısa bir rijit boru parçası ekle (sayaç çıkış parçası)
                // Eğer çıkış borusu varsa, araya çıkış parçası ekle
                let cikisBoruId = null;
                if (cikisBoru) {
                    // Sayaç çıkış noktasından direkt boruya doğru kısa bir segment ekle
                    const cikisSegmentUzunluk = 15; // 15cm rijit çıkış parçası

                    // Yön vektörü hesapla: sayaç çıkış noktasından boru ucuna doğru
                    const boruUcu = cikisBoru.end === 'p1' ? cikisBoru.pipe.p1 : cikisBoru.pipe.p2;
                    const dx = boruUcu.x - cikisPoint.x;
                    const dy = boruUcu.y - cikisPoint.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance > 0.1) {
                        // Normalize edilmiş yön vektörü
                        const nx = dx / distance;
                        const ny = dy / distance;

                        // Çıkış segment bitiş noktası
                        const cikisSegmentP2 = {
                            x: cikisPoint.x + nx * cikisSegmentUzunluk,
                            y: cikisPoint.y + ny * cikisSegmentUzunluk,
                            z: cikisPoint.z
                        };

                        // Çıkış segment borusu oluştur
                        const cikisSegmentBoru = {
                            id: `boru_sayac_cikis_${idx}_${Date.now()}`,
                            type: 'boru',
                            boruTipi: 'STANDART',
                            boruCap: cikisBoru.pipe.boruCap || 'DN25', // downstream tesisat çapı
                            p1: { ...cikisPoint },
                            p2: cikisSegmentP2,
                            colorGroup: 'YELLOW',
                            floorId: state.currentFloor?.id,
                            baslangicBaglanti: {
                                tip: 'sayac',
                                hedefId: null, // Sayaç ID'si sonra eklenecek
                                baglananNokta: 'cikis'
                            },
                            bitisBaglanti: {
                                tip: 'boru',
                                hedefId: cikisBoru.pipe.id,
                                noktaIndex: cikisBoru.end
                            },
                            uzerindekiElemanlar: [],
                            tBaglantilar: []
                        };

                        state.plumbingPipes.push(cikisSegmentBoru);
                        cikisBoruId = cikisSegmentBoru.id;

                        // Çıkış borusunun bağlantısını güncelle (orijinal boruda segment'e bağlan)
                        if (cikisBoru.end === 'p1') {
                            cikisBoru.pipe.baslangicBaglanti = {
                                tip: 'boru',
                                hedefId: cikisSegmentBoru.id,
                                noktaIndex: 'p2'
                            };
                        } else {
                            cikisBoru.pipe.bitisBaglanti = {
                                tip: 'boru',
                                hedefId: cikisSegmentBoru.id,
                                noktaIndex: 'p2'
                            };
                        }

                        console.log(`    -> Sayaç çıkış parçası eklendi: ${cikisSegmentUzunluk}cm rijit segment`);
                    }
                }

                // Sayaç panel alanlarını XML'den çek (top-level Ps; iç sketch'lere bakma)
                const glSayacTipi = parseInt(_topProp(sayacEl, 'GLSAYACTIPI')?.getAttribute('V') || '1', 10);
                const glAboneUnvan = _topProp(sayacEl, 'GLAboneUnvan')?.getAttribute('V') || '';
                const glAboneTesisatNo = _topProp(sayacEl, 'GLAboneTesisatNo')?.getAttribute('V') || '';
                const glAbonePoliceNo = _topProp(sayacEl, 'GLAbonePoliceNo')?.getAttribute('V') || '';
                const glKapiNoAdi = _topProp(sayacEl, 'GLAboneKapiNoAdi')?.getAttribute('V') || '';
                const glKullanimTipi = parseInt(_topProp(sayacEl, 'GLKULLANIMTIPI')?.getAttribute('V') || '1', 10);
                // Sayaç tipi mapping: 1→G4, 2→G6, 3→G10, 4→G16, 5→G25 (Gasline konvansiyonu)
                const sayacTipiStr = ({1:'G4',2:'G6',3:'G10',4:'G16',5:'G25',6:'G40'}[glSayacTipi]) || `G${glSayacTipi}`;
                const birimTipiStr = ({1:'Konut',2:'Dükkan',3:'Sanayi',4:'Kamu',5:'Isınma'}[glKullanimTipi]) || 'Konut';

                // Sayaç objesi oluştur
                const sayacData = {
                    id: `sayac_xml_${idx}_${Date.now()}`,
                    type: 'sayac',
                    x: centerX,
                    y: centerY,
                    z: z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    // Panel alanları
                    sayacTipi: sayacTipiStr,
                    birimTipi: birimTipiStr,
                    birimNo: glKapiNoAdi || '',
                    aboneAdi: glAboneUnvan,
                    aboneNo: glAboneTesisatNo || glAbonePoliceNo,
                    fleksBaglanti: {
                        boruId: girisBoruId, // Fleks segment ID'si
                        endpoint: 'p1', // Fleks segment'in başı (p1) sayaca bağlı
                        uzunluk: 30 // Fleks uzunluğu
                    },
                    cikisBagliBoruId: cikisBoruId, // Çıkış segmenti ID'si
                    iliskiliVanaId: null
                };

                // Çıkış segment borusunun sayaç ID'sini güncelle
                if (cikisBoruId) {
                    const cikisSegment = state.plumbingPipes.find(p => p.id === cikisBoruId);
                    if (cikisSegment) {
                        cikisSegment.baslangicBaglanti.hedefId = sayacData.id;
                    }
                }

                // Giriş fleks segment'in sayaç ID'sini güncelle
                if (girisBoruId) {
                    const girisFleksSegment = state.plumbingPipes.find(p => p.id === girisBoruId);
                    if (girisFleksSegment) {
                        girisFleksSegment.baslangicBaglanti.hedefId = sayacData.id;
                    }
                    console.log(`    -> Giriş fleks segment sayaca bağlandı: ${girisBoruId.substring(0, 20)}...`);
                }

                state.plumbingBlocks.push(sayacData);
                console.log(`    -> Sayaç eklendi: (${centerX.toFixed(2)}, ${centerY.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Sayaç işlenirken hata:", e, sayacEl);
        }
    });

    // 8.3. Vanalar (clsvana) - Boru bağlantılarını kur
    const vanaElements = xmlDoc.querySelectorAll("O[T='clsvana']");
    console.log(`\n${vanaElements.length} clsvana bulundu (tüm XML'de)`);

    vanaElements.forEach((vanaEl, idx) => {
        try {
            const originEl = _topProp(vanaEl, 'origin');
            const vanaTipiEl = _topProp(vanaEl, 'GLVANATIPI');
            const muhafazaEl = _topProp(vanaEl, 'GLMUHAFAZALI');
            const birimSayisiEl = _topProp(vanaEl, 'GLBIRIMSAYISI');
            const dukkanSayisiEl = _topProp(vanaEl, 'GLDUKKANSAYISI');
            const ekTuketimEl = _topProp(vanaEl, 'GLEKTUKETIM');
            const daireNoEl = _topProp(vanaEl, 'GLDAIRENO');

            if (originEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const vanaPoint = {
                    x: originCoords[0] * SCALE,
                    y: -originCoords[1] * SCALE,
                    z: originCoords[2] ? originCoords[2] * SCALE : 0
                };

                // Vana içindeki metin satırları (Tip, DN, İZOLATIRLI vb.)
                const textEls = vanaEl.querySelectorAll("O[T='vdMText'] P[F='TextString'], O[T='vdText'] P[F='TextString']");
                const textLines = [];
                textEls.forEach(te => { _splitTextLines(te.getAttribute('V') || '').forEach(l => textLines.push(l)); });

                // En yakın boruyu bul
                const yakinBoru = findClosestPipeEnd(vanaPoint, state.plumbingPipes, 50);

                // Vana tipi mapping
                const xmlVanaTipi = vanaTipiEl ? parseInt(vanaTipiEl.getAttribute('V')) : 1;
                const muhafazali = muhafazaEl ? (muhafazaEl.getAttribute('V') === 'True') : false;
                const { tip: vanaTipi, izolator, muhafaza } = _mapVanaFromXML({
                    vanaTipiInt: xmlVanaTipi, textLines, muhafazali
                });

                const vanaCap = _extractVanaCap(textLines);
                const birimNo = daireNoEl?.getAttribute('V') || _extractBirimNo(textLines) || '';

                const vanaData = {
                    id: `vana_xml_${idx}_${Date.now()}`,
                    type: 'vana',
                    x: vanaPoint.x,
                    y: vanaPoint.y,
                    z: vanaPoint.z,
                    rotation: 0,
                    vanaTipi: vanaTipi,
                    floorId: state.currentFloor?.id,
                    bagliBoruId: yakinBoru ? yakinBoru.pipe.id : null,
                    boruPozisyonu: 0.5,
                    fromEnd: false,
                    fixedDistance: null,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false,
                    // Panel alanları
                    vanaCap: vanaCap,
                    izolator: izolator,
                    muhafaza: muhafaza,
                    muhafazaGrupla: false,
                    birimNo: birimNo,
                    tesisatNo: '',
                    daireSayisi: birimSayisiEl ? parseInt(birimSayisiEl.getAttribute('V')) || 0 : 0,
                    dukkanSayisi: dukkanSayisiEl ? parseInt(dukkanSayisiEl.getAttribute('V')) || 0 : 0,
                    ekDebi: ekTuketimEl ? parseFloat(ekTuketimEl.getAttribute('V')) || 0 : 0,
                    // BRANSMAN vanaları: XML değeri varsa onu, yoksa 3.5 m³/h standart
                    bransmanDebi: vanaTipi === 'BRANSMAN'
                        ? ((ekTuketimEl && parseFloat(ekTuketimEl.getAttribute('V')) > 0)
                            ? parseFloat(ekTuketimEl.getAttribute('V'))
                            : 3.5)
                        : 0
                };

                // Borunun vanaya bağlantısını kur
                if (yakinBoru) {
                    // Vana borunun üzerinde, uzerindekiElemanlar dizisine ekle
                    yakinBoru.pipe.uzerindekiElemanlar.push({
                        tip: 'vana',
                        elemanId: vanaData.id,
                        pozisyon: 0.5
                    });
                    console.log(`    -> Vana boruya bağlandı: ${yakinBoru.pipe.id.substring(0, 20)}... (mesafe: ${yakinBoru.distance.toFixed(2)})`);
                }

                state.plumbingBlocks.push(vanaData);
                console.log(`    -> Vana eklendi: (${vanaPoint.x.toFixed(2)}, ${vanaPoint.y.toFixed(2)}) tip: ${vanaTipi}`);
            }
        } catch (e) {
            console.error("Vana işlenirken hata:", e, vanaEl);
        }
    });

    // 8.3b. Selenoid Vanalar (clsselenoid) → SELENOID vana
    const selenoidElements = xmlDoc.querySelectorAll("O[T='clsselenoid']");
    console.log(`\n${selenoidElements.length} clsselenoid bulundu`);
    selenoidElements.forEach((el, idx) => {
        try {
            const originEl = _topProp(el, 'origin') || _topProp(el, 'StartPoint');
            if (!originEl) return;
            const c = originEl.getAttribute('V').split(',').map(Number);
            const p = { x: c[0] * SCALE, y: -c[1] * SCALE, z: (c[2] || 0) * SCALE };
            const yakin = findClosestPipeEnd(p, state.plumbingPipes, 80);
            const vanaData = {
                id: `vana_selenoid_xml_${idx}_${Date.now()}`,
                type: 'vana',
                x: p.x, y: p.y, z: p.z,
                rotation: 0,
                vanaTipi: 'SELENOID',
                floorId: state.currentFloor?.id,
                bagliBoruId: yakin ? yakin.pipe.id : null,
                boruPozisyonu: 0.5,
                fromEnd: false,
                fixedDistance: null,
                girisBagliBoruId: null,
                cikisBagliBoruId: null,
                showEndCap: false,
                vanaCap: null,
                izolator: false,
                muhafaza: false,
                muhafazaGrupla: false,
                birimNo: '',
                tesisatNo: '',
                daireSayisi: 0,
                dukkanSayisi: 0,
                ekDebi: 0,
                bransmanDebi: 0
            };
            if (yakin) {
                yakin.pipe.uzerindekiElemanlar = yakin.pipe.uzerindekiElemanlar || [];
                yakin.pipe.uzerindekiElemanlar.push({ tip: 'vana', elemanId: vanaData.id, pozisyon: 0.5 });
            }
            state.plumbingBlocks.push(vanaData);
            console.log(`    -> SELENOID vana eklendi: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
        } catch (e) { console.error("Selenoid işlenirken hata:", e, el); }
    });

    // 8.4. Kombiler (clskombi) - Boru bağlantılarını kur VE BACA EKLE
    const kombiElements = xmlDoc.querySelectorAll("O[T='clskombi']");
    console.log(`\n${kombiElements.length} clskombi bulundu (tüm XML'de)`);

    kombiElements.forEach((kombiEl, idx) => {
        try {
            // Top-level çocuk Ps — clskombi içinde DrawEntities altındaki sketch vdLine'lardan
            // yanlış StartPoint okumamak için.
            const startPointEl = _topProp(kombiEl, 'StartPoint') || _topProp(kombiEl, 'Origin') || _topProp(kombiEl, 'origin');

            if (startPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const xmlCihazPoint = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                // En yakın boru ucunu bul
                const yakinBoru = findClosestPipeEnd(xmlCihazPoint, state.plumbingPipes, 50);

                // DÜZELTME: Cihazı DAIMA boru ucundan 40cm uzağa yerleştir (fleks hortum için)
                let cihazPoint = { ...xmlCihazPoint };
                if (yakinBoru) {
                    // Boru ucundan cihaza doğru vektör
                    const boruUcu = yakinBoru.end === 'p1' ? yakinBoru.pipe.p1 : yakinBoru.pipe.p2;
                    const dx = xmlCihazPoint.x - boruUcu.x;
                    const dy = xmlCihazPoint.y - boruUcu.y;
                    const distance = Math.hypot(dx, dy);

                    const targetDistance = 40; // cm - cihaz boru ucundan bu kadar uzakta olmalı (fleks hortum için)

                    if (distance > 0.1) {
                        // Normalize edilmiş yön vektörü
                        const nx = dx / distance;
                        const ny = dy / distance;

                        // Cihazı boru ucundan targetDistance kadar uzağa yerleştir
                        cihazPoint.x = boruUcu.x + nx * targetDistance;
                        cihazPoint.y = boruUcu.y + ny * targetDistance;

                        console.log(`    -> Kombi boru ucundan ${targetDistance}cm uzağa yerleştirildi (orijinal mesafe: ${distance.toFixed(2)}cm)`);
                    }
                }

                // Metin (marka/model/kapasite) parse et
                const textEls = kombiEl.querySelectorAll("O[T='vdMText'] P[F='TextString'], O[T='vdText'] P[F='TextString']");
                const textLines = [];
                textEls.forEach(te => { _splitTextLines(te.getAttribute('V') || '').forEach(l => textLines.push(l)); });
                const parsed = _parseCihazText(textLines);

                const cihazData = {
                    id: `cihaz_xml_${idx}_${Date.now()}`,
                    type: 'cihaz',
                    cihazTipi: 'KOMBI',
                    x: cihazPoint.x,
                    y: cihazPoint.y,
                    z: cihazPoint.z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: yakinBoru ? yakinBoru.pipe.id : null,
                        endpoint: yakinBoru ? yakinBoru.end : null,
                        uzunluk: 30
                    },
                    iliskiliVanaId: null,
                    // Panel alanları
                    marka: parsed.marka || '',
                    model: parsed.model || '',
                    bacaTipi: parsed.bacaTipi || 'Hermetik',
                    kapasiteKcal: parsed.kapasiteKcal || 0,
                    kapasiteKW: parsed.kapasiteKW || 0,
                    yogusmali: !!parsed.yogusmali,
                    verim: 100,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    yedekCihaz: false
                };

                // Borunun cihaza bağlantısını kur
                if (yakinBoru) {
                    if (yakinBoru.end === 'p1') {
                        yakinBoru.pipe.baslangicBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            baglananNokta: 'giris'
                        };
                    } else {
                        yakinBoru.pipe.bitisBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            baglananNokta: 'giris'
                        };
                    }
                    console.log(`    -> Kombi boruya bağlandı: ${yakinBoru.pipe.id.substring(0, 20)}... (${yakinBoru.end}, mesafe: ${yakinBoru.distance.toFixed(2)}, ${parsed.marka || '-'} ${parsed.model || '-'}, ${parsed.kapasiteKW || 0} kW)`);
                }

                state.plumbingBlocks.push(cihazData);
                console.log(`    -> Kombi eklendi: (${cihazPoint.x.toFixed(2)}, ${cihazPoint.y.toFixed(2)})`);
                // Not: Varsayılan baca OLUŞTURULMAZ. Gerçek baca elemanları (clshermetik/clsbaca)
                // ayrı adımda parse edilir ve cihaza bağlanır. Baca yoksa cihazın bacası olmaz.
            }
        } catch (e) {
            console.error("Kombi işlenirken hata:", e, kombiEl);
        }
    });

    // 8.5. Ocaklar (clsocak) - Boru bağlantılarını kur
    const ocakElements = xmlDoc.querySelectorAll("O[T='clsocak']");
    console.log(`\n${ocakElements.length} clsocak bulundu (tüm XML'de)`);

    ocakElements.forEach((ocakEl, idx) => {
        try {
            // Top-level (doğrudan çocuk) P; iç sketch'leri yok say.
            const startPointEl = _topProp(ocakEl, 'StartPoint') || _topProp(ocakEl, 'Origin') || _topProp(ocakEl, 'origin');

            if (startPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const xmlCihazPoint = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                // En yakın boru ucunu bul
                const yakinBoru = findClosestPipeEnd(xmlCihazPoint, state.plumbingPipes, 50);

                // DÜZELTME: Cihazı DAIMA boru ucundan 40cm uzağa yerleştir (fleks hortum için)
                let cihazPoint = { ...xmlCihazPoint };
                if (yakinBoru) {
                    // Boru ucundan cihaza doğru vektör
                    const boruUcu = yakinBoru.end === 'p1' ? yakinBoru.pipe.p1 : yakinBoru.pipe.p2;
                    const dx = xmlCihazPoint.x - boruUcu.x;
                    const dy = xmlCihazPoint.y - boruUcu.y;
                    const distance = Math.hypot(dx, dy);

                    const targetDistance = 40; // cm - cihaz boru ucundan bu kadar uzakta olmalı (fleks hortum için)

                    if (distance > 0.1) {
                        // Normalize edilmiş yön vektörü
                        const nx = dx / distance;
                        const ny = dy / distance;

                        // Cihazı boru ucundan targetDistance kadar uzağa yerleştir
                        cihazPoint.x = boruUcu.x + nx * targetDistance;
                        cihazPoint.y = boruUcu.y + ny * targetDistance;

                        console.log(`    -> Ocak boru ucundan ${targetDistance}cm uzağa yerleştirildi (orijinal mesafe: ${distance.toFixed(2)}cm)`);
                    }
                }

                // Metin parse et (marka/model)
                const textElsO = ocakEl.querySelectorAll("O[T='vdMText'] P[F='TextString'], O[T='vdText'] P[F='TextString']");
                const textLinesO = [];
                textElsO.forEach(te => { _splitTextLines(te.getAttribute('V') || '').forEach(l => textLinesO.push(l)); });
                const parsedO = _parseCihazText(textLinesO);
                const verimEl = ocakEl.querySelector("P[F='GLVerim']");
                const verim = verimEl ? parseInt(verimEl.getAttribute('V'), 10) || 100 : 100;

                const cihazData = {
                    id: `cihaz_xml_${idx}_${Date.now()}`,
                    type: 'cihaz',
                    cihazTipi: 'OCAK',
                    x: cihazPoint.x,
                    y: cihazPoint.y,
                    z: cihazPoint.z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: yakinBoru ? yakinBoru.pipe.id : null,
                        endpoint: yakinBoru ? yakinBoru.end : null,
                        uzunluk: 30
                    },
                    iliskiliVanaId: null,
                    // Panel alanları
                    marka: parsedO.marka || '',
                    model: parsedO.model || '',
                    bacaTipi: parsedO.bacaTipi || 'Bacasız',
                    // Ocak için TS standart kapasite 13200 kcal/h (parse edilmediyse)
                    kapasiteKcal: parsedO.kapasiteKcal || 13200,
                    kapasiteKW: parsedO.kapasiteKW || parseFloat((13200 / 860).toFixed(2)),
                    yogusmali: false,
                    verim: verim,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    yedekCihaz: false
                };

                // Borunun cihaza bağlantısını kur
                if (yakinBoru) {
                    if (yakinBoru.end === 'p1') {
                        yakinBoru.pipe.baslangicBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            noktaIndex: 0
                        };
                    } else {
                        yakinBoru.pipe.bitisBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            noktaIndex: 0
                        };
                    }
                    console.log(`    -> Ocak boruya bağlandı: ${yakinBoru.pipe.id.substring(0, 20)}... (${yakinBoru.end}, mesafe: ${yakinBoru.distance.toFixed(2)})`);
                }

                state.plumbingBlocks.push(cihazData);
                console.log(`    -> Ocak eklendi: (${cihazPoint.x.toFixed(2)}, ${cihazPoint.y.toFixed(2)}) ${parsedO.marka || '-'} ${parsedO.model || '-'} verim=${verim}%`);
            }
        } catch (e) {
            console.error("Ocak işlenirken hata:", e, ocakEl);
        }
    });

    // 8.5b. Hermetik baca (clshermetik) → baca bileşeni
    const hermetikElements = xmlDoc.querySelectorAll("O[T='clshermetik']");
    console.log(`\n${hermetikElements.length} clshermetik bulundu`);
    hermetikElements.forEach((el, idx) => {
        try {
            const lineEls = el.querySelectorAll("O[T='vdLine']");
            const segs = [];
            lineEls.forEach(ln => {
                const sp = ln.querySelector("P[F='StartPoint']");
                const ep = ln.querySelector("P[F='EndPoint']");
                if (!sp || !ep) return;
                const s = sp.getAttribute('V').split(',').map(Number);
                const e2 = ep.getAttribute('V').split(',').map(Number);
                segs.push({
                    x1: s[0] * SCALE, y1: -s[1] * SCALE, z1: (s[2] || 0) * SCALE,
                    x2: e2[0] * SCALE, y2: -e2[1] * SCALE, z2: (e2[2] || 0) * SCALE
                });
            });
            if (segs.length === 0) return;

            // Baca başlangıcı (ilk segment başı) ve en yakın cihazı bul
            const startPt = { x: segs[0].x1, y: segs[0].y1 };
            let best = null, bestD = 150;
            for (const b of state.plumbingBlocks) {
                if (b.type !== 'cihaz') continue;
                const d = Math.hypot(b.x - startPt.x, b.y - startPt.y);
                if (d < bestD) { bestD = d; best = b; }
            }
            if (!best) return;

            const last = segs[segs.length - 1];
            const bacaData = {
                id: `baca_hermetik_xml_${idx}_${Date.now()}`,
                type: 'baca',
                parentCihazId: best.id,
                floorId: best.floorId,
                startX: startPt.x, startY: startPt.y,
                z: segs[0].z1,
                segments: segs,
                isDrawing: false,
                currentSegmentStart: { x: last.x2, y: last.y2, z: last.z2 },
                havalandirma: {
                    x: last.x2, y: last.y2,
                    width: 10, height: 30,
                    angle: Math.atan2(last.y2 - last.y1, last.x2 - last.x1)
                }
            };
            state.plumbingBlocks.push(bacaData);
            // Cihaz bacaTipi = Hermetik
            if (!best.bacaTipi || best.bacaTipi !== 'Hermetik') best.bacaTipi = 'Hermetik';
            console.log(`    -> Hermetik baca eklendi (cihaz ${best.cihazTipi}): ${segs.length} segment`);
        } catch (e) { console.error('Hermetik baca hatası:', e, el); }
    });

    // 8.6. Bacaları (clsbaca veya benzeri) parse et ve cihazlara bağla
    // NOT: XML'de baca elemanları olabilir, eğer varsa parse edilmeli
    const bacaElements = xmlDoc.querySelectorAll("O[T='clsbaca']");
    console.log(`\n${bacaElements.length} clsbaca bulundu (tüm XML'de)`);

    // Eğer XML'de baca elemanları varsa parse et
    if (bacaElements.length > 0) {
        bacaElements.forEach((bacaEl, idx) => {
            console.log(`  -> Baca ${idx} işleniyor...`);
            try {
                // Baca başlangıç noktası
                const startPointEl = bacaEl.querySelector("P[F='StartPoint']");
                if (!startPointEl) return;

                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const bacaBaslangic = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                // En yakın cihazı bul (50cm tolerans)
                let enYakinCihaz = null;
                let minDistance = 50;

                for (const block of state.plumbingBlocks) {
                    if (block.type === 'cihaz') {
                        const distance = Math.hypot(
                            bacaBaslangic.x - block.x,
                            bacaBaslangic.y - block.y
                        );

                        if (distance < minDistance) {
                            minDistance = distance;
                            enYakinCihaz = block;
                        }
                    }
                }

                if (!enYakinCihaz) {
                    console.warn(`  -> Baca için yakın cihaz bulunamadı`);
                    return;
                }

                // Baca segment'lerini parse et (vdLine veya başka elemanlardan)
                const segments = [];
                const lineElements = bacaEl.querySelectorAll("O[T='vdLine']");

                if (lineElements.length > 0) {
                    lineElements.forEach(lineEl => {
                        const startPtEl = lineEl.querySelector("P[F='StartPoint']");
                        const endPtEl = lineEl.querySelector("P[F='EndPoint']");

                        if (startPtEl && endPtEl) {
                            const start = startPtEl.getAttribute('V').split(',').map(Number);
                            const end = endPtEl.getAttribute('V').split(',').map(Number);

                            segments.push({
                                x1: start[0] * SCALE,
                                y1: -start[1] * SCALE,
                                z1: start[2] ? start[2] * SCALE : 0,
                                x2: end[0] * SCALE,
                                y2: -end[1] * SCALE,
                                z2: end[2] ? end[2] * SCALE : 0
                            });
                        }
                    });
                }

                // Eğer segment yoksa basit dikey baca oluştur
                if (segments.length === 0) {
                    segments.push({
                        x1: bacaBaslangic.x,
                        y1: bacaBaslangic.y,
                        z1: bacaBaslangic.z,
                        x2: bacaBaslangic.x,
                        y2: bacaBaslangic.y - 100, // 100cm yukarı
                        z2: bacaBaslangic.z
                    });
                }

                // Son segment ucunu bul (havalandırma için)
                const sonSegment = segments[segments.length - 1];
                const sonUc = { x: sonSegment.x2, y: sonSegment.y2 };

                // Baca objesi oluştur
                const bacaData = {
                    id: `baca_xml_${idx}_${Date.now()}`,
                    type: 'baca',
                    parentCihazId: enYakinCihaz.id,
                    floorId: state.currentFloor?.id,
                    startX: bacaBaslangic.x,
                    startY: bacaBaslangic.y,
                    z: bacaBaslangic.z,
                    segments: segments,
                    isDrawing: false,
                    currentSegmentStart: {
                        x: sonUc.x,
                        y: sonUc.y,
                        z: sonSegment.z2
                    },
                    havalandirma: {
                        x: sonUc.x,
                        y: sonUc.y,
                        width: 10,
                        height: 30,
                        angle: Math.atan2(sonSegment.y2 - sonSegment.y1, sonSegment.x2 - sonSegment.x1)
                    }
                };

                state.plumbingBlocks.push(bacaData);
                console.log(`    -> Baca eklendi: ${segments.length} segment, cihaz: ${enYakinCihaz.cihazTipi}`);
            } catch (e) {
                console.error("Baca işlenirken hata:", e, bacaEl);
            }
        });
    } else {
        console.log("  -> XML'de ayrı baca elemanı yok, otomatik bacalar oluşturuldu");
    }

    console.log("=========================================\n");

    // --- 8.6b. BORU AĞINI BAĞLA: uç-uç eşleştirmesiyle baslangicBaglanti zincirini kur
    // Bu adım, computePipeDebileri'nin sayaç→cihaz BFS'inin tüm hatlara erişmesini
    // sağlar; aksi halde XML'den null bağlantılarla gelen borular debi propagasyonunu
    // kıracak ve tüm hatlar 0.00 görünecektir.
    try {
        _linkPipeNetwork(state.plumbingPipes);
        console.log('  -> Boru ağı uçlardan birbirine bağlandı (debi propagasyonu için)');
    } catch (e) {
        console.warn('Boru ağ bağlama hatası:', e);
    }

    // --- 8.6c. OTOMATİK SERVİS KUTUSU: gasline XML'inde clsservis tag'i yok; kullanıcı
    // tercihine göre kolon zincirinin en alttaki açık ucuna otomatik servis kutusu konur
    // ve o boru kutuya bağlanır. Böylece pre-meter zincir bir kaynaktan beslenmiş olur.
    try {
        if (!(state.plumbingBlocks || []).some(b => b.type === 'servis_kutusu')) {
            let lowest = null; // {pipe, endpoint, z, x, y}
            (state.plumbingPipes || []).forEach(pipe => {
                [
                    { end: 'p1', bag: pipe.baslangicBaglanti, pt: pipe.p1 },
                    { end: 'p2', bag: pipe.bitisBaglanti,     pt: pipe.p2 }
                ].forEach(({ end, bag, pt }) => {
                    if (!pt) return;
                    if (bag && bag.tip) return; // serbest uç değil
                    const z = pt.z || 0;
                    if (!lowest || z < lowest.z) {
                        lowest = { pipe, endpoint: end, z, x: pt.x, y: pt.y };
                    }
                });
            });

            if (lowest) {
                const kutuId = `servis_kutusu_xml_${Date.now()}`;
                const kutuData = {
                    id: kutuId,
                    type: 'servis_kutusu',
                    x: lowest.x, y: lowest.y, z: lowest.z,
                    rotation: 0,
                    floorId: null, // post-pass'te Z'ye göre atanır
                    cikisYonu: 'sag',
                    bagliBoruId: lowest.pipe.id,
                    cikisKullanildi: true,
                    kutuTipi: 'S.K.',
                    kutuBasinc: 21,
                    cikisCap: lowest.pipe.boruCap || 'DN25',
                    kutuBoruTipi: 'KAYNAKLI',
                    kutuBaglantiTipi: 'KAYNAK',
                    description: ''
                };
                const bagSet = { tip: 'servis_kutusu', hedefId: kutuId, baglananNokta: 'cikis' };
                if (lowest.endpoint === 'p1') lowest.pipe.baslangicBaglanti = bagSet;
                else                          lowest.pipe.bitisBaglanti     = bagSet;
                state.plumbingBlocks.push(kutuData);
                console.log(`  -> Otomatik servis kutusu: (${lowest.x.toFixed(2)}, ${lowest.y.toFixed(2)}, z=${lowest.z.toFixed(2)})`);
            }
        }
    } catch (e) {
        console.warn('Otomatik servis kutusu hatası:', e);
    }

    // --- 8.7. KAT YÖNETİMİ: Z kotlarından katları tespit et ve floorId ata ---
    try {
        const zPool = [];
        // Yatay borular: kot değeri = Z (p1.z ≈ p2.z). Her yatay boruyu zPool'a ekle.
        state.plumbingPipes.forEach(p => {
            const z1 = p.p1?.z || 0, z2 = p.p2?.z || 0;
            if (Math.abs(z1 - z2) < 20) {
                zPool.push((z1 + z2) / 2);
            }
        });
        // Bileşenler (sayaç, vana, cihaz, servis kutusu, baca) kat belirleyici
        state.plumbingBlocks.forEach(b => { if (b.z != null) zPool.push(b.z); });

        const newFloors = _ensureFloorsFromZValues(zPool, state.floors || []);
        if (newFloors && newFloors.length >= 1) {
            // currentFloor: ilk GÖRÜNÜR (yani projenin gerçekten başladığı) kat olsun.
            const firstVisible = newFloors.find(f => f.visible !== false) || newFloors[0];
            setState({ floors: newFloors, currentFloor: firstVisible });
            console.log(`\n=== KATLAR OLUŞTURULDU: ${newFloors.length} kat ===`);
            newFloors.forEach(f => console.log(`  ${f.name}: ${f.bottomElevation} - ${f.topElevation} cm  [${f.visible === false ? 'GİZLİ' : 'görünür'}]`));
        }

        const activeFloors = (state.floors || []).filter(f => !f.isPlaceholder);
        if (activeFloors.length >= 1) {
            // Borulara: kendi Z'sinin ortalamasına göre floorId
            state.plumbingPipes.forEach(p => {
                const zMid = ((p.p1?.z || 0) + (p.p2?.z || 0)) / 2;
                const fid = _findFloorIdForZ(zMid, activeFloors);
                if (fid) p.floorId = fid;
            });
            // Bileşenlere
            state.plumbingBlocks.forEach(b => {
                const fid = _findFloorIdForZ(b.z || 0, activeFloors);
                if (fid) b.floorId = fid;
            });

            // Mimari: walls/rooms _srcZ'ye göre kendi katlarına dağıtılır.
            // Birden fazla benzersiz Z varsa XML zaten multi-floor mimari içeriyor → klonlama YAPMA.
            const wallSrcZs = new Set((state.walls || []).map(w => Math.round(w._srcZ ?? -1e9)));
            wallSrcZs.delete(-1e9);
            const hasMultiFloorArch = wallSrcZs.size > 1;

            const projectFloor = (state.currentFloor && activeFloors.find(f => f.id === state.currentFloor.id))
                || activeFloors.find(f => f.visible !== false)
                || activeFloors[0];
            const projectFloorId = projectFloor.id;

            (state.walls || []).forEach(w => {
                const z = w._srcZ;
                w.floorId = (z != null)
                    ? (_findFloorIdForZ(z, activeFloors) || projectFloorId)
                    : projectFloorId;
            });
            (state.rooms || []).forEach(r => {
                const z = r._srcZ;
                r.floorId = (z != null)
                    ? (_findFloorIdForZ(z, activeFloors) || projectFloorId)
                    : projectFloorId;
            });
            // Kolon/kiriş/merdiven Z bilgisi import edilmiyor → projeye ata; multi-floor durumda
            // kloncuyu atlayacağız, dolayısıyla bunlar tek katta kalır (kullanıcı isterse ekler).
            (state.columns || []).forEach(c => { c.floorId = projectFloorId; });
            (state.beams || []).forEach(b => { b.floorId = projectFloorId; });
            (state.stairs || []).forEach(s => { s.floorId = projectFloorId; });
            (state.doors || []).forEach(d => {
                if (d.wall?.floorId) d.floorId = d.wall.floorId;
                else d.floorId = projectFloorId;
            });
            console.log(`  -> Mimari: ${state.walls.length} duvar, ${state.rooms.length} oda ${hasMultiFloorArch ? `${wallSrcZs.size} kata dağıtıldı (XML multi-floor)` : `"${projectFloor.name}" katına atandı (tek kat)`}`);

            // --- MİMARİ KLONLAMA (yalnızca XML tek-kat mimari verdiyse) ---
            // Gasline çoklu-kat dosyalarında walls zaten Z'ye göre dağıtıldı; klonlama
            // ek/yanlış katlara aynı mimariyi basıp döngüsel çakışma yaratır.
            const visibleFloors = activeFloors.filter(f => f.visible !== false && f.id !== projectFloorId);
            if (!hasMultiFloorArch && visibleFloors.length > 0) {
                const sourceWalls = (state.walls || []).filter(w => w.floorId === projectFloorId);
                const sourceRooms = (state.rooms || []).filter(r => r.floorId === projectFloorId);
                const sourceColumns = (state.columns || []).filter(c => c.floorId === projectFloorId);
                const sourceBeams = (state.beams || []).filter(b => b.floorId === projectFloorId);
                const sourceStairs = (state.stairs || []).filter(s => s.floorId === projectFloorId);
                const sourceDoors = (state.doors || []).filter(d => d.wall && d.wall.floorId === projectFloorId);

                visibleFloors.forEach(tf => {
                    const tfId = tf.id;
                    const nodeMap = new Map();
                    const wallMap = new Map(); // sourceWall -> newWall

                    sourceWalls.forEach(sw => {
                        const k1 = `${sw.p1.x},${sw.p1.y}`;
                        const k2 = `${sw.p2.x},${sw.p2.y}`;
                        let p1 = nodeMap.get(k1);
                        if (!p1) { p1 = { x: sw.p1.x, y: sw.p1.y }; nodeMap.set(k1, p1); }
                        let p2 = nodeMap.get(k2);
                        if (!p2) { p2 = { x: sw.p2.x, y: sw.p2.y }; nodeMap.set(k2, p2); }
                        const nw = {
                            type: 'wall', p1, p2,
                            thickness: sw.thickness,
                            wallType: sw.wallType || 'normal',
                            windows: sw.windows ? JSON.parse(JSON.stringify(sw.windows)) : [],
                            vents: sw.vents ? JSON.parse(JSON.stringify(sw.vents)) : [],
                            floorId: tfId
                        };
                        state.walls.push(nw);
                        wallMap.set(sw, nw);
                    });
                    nodeMap.forEach(n => { if (!state.nodes.includes(n)) state.nodes.push(n); });

                    sourceDoors.forEach(sd => {
                        const nw = wallMap.get(sd.wall);
                        if (!nw) return;
                        state.doors.push({ ...sd, wall: nw, floorId: tfId });
                    });

                    sourceColumns.forEach(sc => {
                        state.columns.push({ ...sc, center: sc.center ? { ...sc.center } : sc.center, floorId: tfId });
                    });
                    sourceBeams.forEach(sb => {
                        state.beams.push({ ...sb, center: sb.center ? { ...sb.center } : sb.center, floorId: tfId });
                    });
                    sourceStairs.forEach(ss => {
                        state.stairs.push({
                            ...ss,
                            center: ss.center ? { ...ss.center } : ss.center,
                            id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                            connectedStairId: null,
                            floorId: tfId
                        });
                    });
                    sourceRooms.forEach(sr => {
                        state.rooms.push({
                            ...sr,
                            center: sr.center ? [...sr.center] : sr.center,
                            centerOffset: sr.centerOffset ? { ...sr.centerOffset } : sr.centerOffset,
                            polygon: sr.polygon ? JSON.parse(JSON.stringify(sr.polygon)) : sr.polygon,
                            vertices: sr.vertices ? sr.vertices.map(v => ({ ...v })) : sr.vertices,
                            floorId: tfId
                        });
                    });
                });
                console.log(`  -> Mimari ${visibleFloors.length} ek görünür kata da klonlandı`);
            }
        }
    } catch (e) {
        console.warn('Kat tespiti hatası:', e);
    }

    // --- 8.8a. CİHAZ VANASI: Her kombi/ocak için CIHAZ vanası ilişkilendir/oluştur ---
    try {
        const cihazlar = state.plumbingBlocks.filter(b => b.type === 'cihaz');
        cihazlar.forEach((cihaz, i) => {
            if (cihaz.iliskiliVanaId) return;
            const fleksBoruId = cihaz.fleksBaglanti?.boruId;
            let candidate = null;
            if (fleksBoruId) {
                candidate = state.plumbingBlocks.find(b =>
                    b.type === 'vana' && b.bagliBoruId === fleksBoruId
                );
            }
            if (!candidate) {
                let bestD = 80;
                state.plumbingBlocks.forEach(b => {
                    if (b.type !== 'vana') return;
                    const d = Math.hypot(b.x - cihaz.x, b.y - cihaz.y);
                    if (d < bestD) { bestD = d; candidate = b; }
                });
            }
            if (candidate) {
                // Mevcut vanayı CIHAZ olarak işaretle (sonlanma vanaları korunur)
                if (!['EMNIYET', 'SELENOID', 'SISMIK', 'BRANSMAN', 'YAN_BINA'].includes(candidate.vanaTipi)) {
                    candidate.vanaTipi = 'CIHAZ';
                }
                cihaz.iliskiliVanaId = candidate.id;
            } else {
                const vanaId = `vana_auto_cihaz_${i}_${Date.now()}`;
                const vanaData = {
                    id: vanaId,
                    type: 'vana',
                    x: cihaz.x, y: cihaz.y + 20, // cihaz önünde boru üzerinde
                    z: cihaz.z || 0,
                    rotation: 0,
                    vanaTipi: 'CIHAZ',
                    floorId: cihaz.floorId,
                    bagliBoruId: fleksBoruId || null,
                    boruPozisyonu: 0.9,
                    fromEnd: cihaz.fleksBaglanti?.endpoint || null,
                    fixedDistance: null,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false,
                    vanaCap: null,
                    izolator: false,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    birimNo: '', tesisatNo: '',
                    daireSayisi: 0, dukkanSayisi: 0, ekDebi: 0, bransmanDebi: 0
                };
                state.plumbingBlocks.push(vanaData);
                cihaz.iliskiliVanaId = vanaId;
                console.log(`    -> Cihaz (${cihaz.cihazTipi}) için otomatik CIHAZ vanası eklendi`);
            }
        });
    } catch (e) { console.warn('Cihaz vana entegrasyonu hatası:', e); }

    // --- 8.8. SAYAÇ ENTEGRASYONU: Her sayaca bir CIHAZ vanası ilişkilendir ---
    // XML'de ayrı vana varsa en yakınını iliskiliVanaId olarak bağla, yoksa oluştur.
    try {
        const sayaclar = state.plumbingBlocks.filter(b => b.type === 'sayac');
        sayaclar.forEach((sayac, i) => {
            if (sayac.iliskiliVanaId) return;
            // Sayacın giriş fleks borusuna bağlı bir vana var mı?
            const girisBoruId = sayac.fleksBaglanti?.boruId;
            let candidate = null;
            if (girisBoruId) {
                candidate = state.plumbingBlocks.find(b =>
                    b.type === 'vana' && b.bagliBoruId === girisBoruId
                );
            }
            // Yoksa pozisyon bazlı en yakını dene (50cm)
            if (!candidate) {
                let bestD = 80;
                state.plumbingBlocks.forEach(b => {
                    if (b.type !== 'vana') return;
                    const d = Math.hypot((b.x - sayac.x), (b.y - sayac.y));
                    if (d < bestD) { bestD = d; candidate = b; }
                });
            }
            if (candidate) {
                sayac.iliskiliVanaId = candidate.id;
                // Cihaz kategorisindeyse işaretle (görsel + panel)
                if (!['EMNIYET', 'SELENOID', 'SISMIK', 'BRANSMAN', 'YAN_BINA'].includes(candidate.vanaTipi)) {
                    candidate.vanaTipi = 'CIHAZ';
                }
            } else {
                // Sayacın giriş noktasının hemen yanına CIHAZ vanası ekle
                const vanaId = `vana_auto_sayac_${i}_${Date.now()}`;
                const vanaData = {
                    id: vanaId,
                    type: 'vana',
                    x: sayac.x - 18, // sayacın giriş tarafı (sola)
                    y: sayac.y - 20, // biraz üstte (boru hattı yüksekliğinde)
                    z: sayac.z || 0,
                    rotation: 0,
                    vanaTipi: 'CIHAZ',
                    floorId: sayac.floorId,
                    bagliBoruId: sayac.fleksBaglanti?.boruId || null,
                    boruPozisyonu: 0.9,
                    fromEnd: null,
                    fixedDistance: null,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false,
                    vanaCap: null,
                    izolator: false,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    birimNo: sayac.birimNo || '',
                    tesisatNo: '',
                    daireSayisi: 0,
                    dukkanSayisi: 0,
                    ekDebi: 0,
                    bransmanDebi: 0
                };
                state.plumbingBlocks.push(vanaData);
                sayac.iliskiliVanaId = vanaId;
                console.log(`    -> Sayaç için otomatik CIHAZ vanası eklendi: ${sayac.birimNo || sayac.aboneAdi || sayac.id}`);
            }
        });
    } catch (e) {
        console.warn('Sayaç vana entegrasyonu hatası:', e);
    }

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

                    // Center hesapla - inscribed rectangle yöntemi
                    const bestPos = findBestLabelPosition(room.polygon);
                    if (bestPos) {
                        room.center = bestPos;
                    } else {
                        const centerPoint = turf.center(room.polygon);
                        room.center = centerPoint.geometry.coordinates;
                    }

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

    // DÜZELTME: Mahal isimlerini otomatik olarak göster (XML yüklendiğinde)
    if (!state.tempVisibility) {
        state.tempVisibility = {};
    }
    state.tempVisibility.showRoomNames = true;
    console.log("Mahal isimleri otomatik olarak aktif edildi (showRoomNames=true)");

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