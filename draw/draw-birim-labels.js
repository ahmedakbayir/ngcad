/**
 * draw-birim-labels.js
 * Kapı önüne birim tipi etiketi çizer (KONUT / OFİS / TİCARİ / KAZAN DAİRESİ).
 *
 * MANTIK:
 *  1. SAHANLIK / AÇIK SAHANLIK / BAHÇE mahalleri tespit edilir.
 *  2. Bu mahallerin duvarlarındaki her kapı incelenir.
 *  3. Kapının "diğer taraf" mahalinden BFS ile birime ait tüm mahaller toplanır.
 *  4. Mahal adları sınıflandırma ağacına göre birim tipine dönüştürülür.
 *  5. Kapı merkezinin duvara dik yönde, birim tarafına kaydırılmış noktasına
 *     duvara paralel metin yazılır.
 */

import { isLightMode, state } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

// ── Separator mahaller (bunlar birim ayırır) ─────────────────────────────────
const SEPARATOR_NAMES = new Set(['SAHANLIK', 'AÇIK SAHANLIK', 'BAHÇE']);

// ── Sınıflandırma listeleri (öncelik sırasıyla) ──────────────────────────────
const KONUT_T1 = new Set(['YATAK ODASI', 'ÇOCUK ODASI', 'DAİRE']);

const TICARI = new Set([
    'ÇAY OCAĞİ', 'LOKANTA', 'KAHVEHANE', 'KAFE', 'FIRIN',
    'İMALATHANE', 'ENDÜSTRİYEL MUTFAK', 'FABRİKA', 'ATÖLYE'
]);

const OFIS = new Set([
    'OFİS', 'BEKLEME ODASI', 'TOPLANTI ODASI', 'DÜKKAN', 'BAKKAL',
    'MARKET', 'REVİR', 'MESCİD', 'CAMİ', 'OKUL', 'DANIŞMA', 'BÜFE',
    'YEMEKHANE', 'SINIF', 'SAĞLIK OCAĞI', 'SHOWROOM', 'MAĞAZA',
    'LABARATUVAR', 'SPOR SALONU', 'MUAYENEHANE', 'KANTİN', 'ARŞİV',
    'HAMAM', 'SOSYAL TESİS'
]);

const KAZAN = new Set(['KAZAN DAİRESİ', 'CİHAZ ODASI', 'ISI MERKEZİ']);

const KONUT_T2 = new Set([
    'ODA', 'MUTFAK', 'SALON', 'OTURMA ODASI', 'BANYO', 'AÇIK BALKON',
    'KAPALI BALKON', 'KORİDOR', 'ANTRE', 'AÇIK MUTFAK', 'YEMEK ODASI',
    'ÇALIŞMA ODASI', 'DUBLEKS ANTRE', 'HOL', 'WC', 'LAVABO', 'KİLER', 'TERAS'
]);

// Bunların HEPSİ bu ise birim dışı (etiket yok)
const BIRIM_DISI = new Set([
    'MAHAL', 'ASANSÖR', 'YAN BİNA', 'DEPO', 'AYDINLIK', 'GARAJ', 'BODRUM',
    'AÇIK OTOPARK', 'KAPALI OTOPARK', 'BACA', 'TEKNİK HACİM', 'AÇIK AYDINLIK',
    'ÇATI ARASI', 'YANGIN MERDİVENİ', 'TESİSAT ŞAFTI', 'BACA ŞAFTI',
    'SAYAÇ ODASI', 'SAYAÇ ŞAFTI', 'KURANGLEZ', 'SIĞINAK', 'HAVALANDIRMA',
    'TOPRAK DOLGU', 'KÖMÜRLÜK', 'ORTAK ALAN'
]);

// ── Yardımcı: bir mahale bitişik duvarları döndür ─────────────────────────────
function getWallsBorderingRoom(room, walls) {
    const TOLS = 2; // cm tolerans
    const found = [];
    const coords = room.polygon.geometry.coordinates[0];
    for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i];
        const [bx, by] = coords[i + 1];
        for (const wall of walls) {
            if (!wall.p1 || !wall.p2) continue;
            const d1 = Math.hypot(wall.p1.x - ax, wall.p1.y - ay) +
                Math.hypot(wall.p2.x - bx, wall.p2.y - by);
            const d2 = Math.hypot(wall.p1.x - bx, wall.p1.y - by) +
                Math.hypot(wall.p2.x - ax, wall.p2.y - ay);
            if (Math.min(d1, d2) < TOLS) { found.push(wall); break; }
        }
    }
    return found;
}

// ── Yardımcı: bir duvara bitişik mahalleri döndür ─────────────────────────────
function getRoomsAdjacentToWall(wall, rooms) {
    const TOLS = 2;
    const found = [];
    for (const room of rooms) {
        const coords = room.polygon.geometry.coordinates[0];
        for (let i = 0; i < coords.length - 1; i++) {
            const [ax, ay] = coords[i];
            const [bx, by] = coords[i + 1];
            const d1 = Math.hypot(wall.p1.x - ax, wall.p1.y - ay) +
                Math.hypot(wall.p2.x - bx, wall.p2.y - by);
            const d2 = Math.hypot(wall.p1.x - bx, wall.p1.y - by) +
                Math.hypot(wall.p2.x - ax, wall.p2.y - ay);
            if (Math.min(d1, d2) < TOLS) { found.push(room); break; }
        }
    }
    return found;
}

// ── Yardımcı: kapılar aracılığıyla birbirine bağlı tüm mahalleri BFS ile bul ─
function traverseUnit(startRoom, separatorRooms, walls, doors, allRooms) {
    const visited = new Set([startRoom]);
    const queue = [startRoom];
    while (queue.length > 0) {
        const cur = queue.shift();
        for (const wall of getWallsBorderingRoom(cur, walls)) {
            if (!doors.some(d => d.wall === wall)) continue; // kapısız duvar atla
            for (const neighbor of getRoomsAdjacentToWall(wall, allRooms)) {
                if (!visited.has(neighbor) && !separatorRooms.includes(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    return [...visited];
}

// ── Sınıflandırma ─────────────────────────────────────────────────────────────
function classifyUnit(unitRooms) {
    const names = unitRooms.map(r => (r.name || '').toUpperCase().trim());
    if (names.some(n => KONUT_T1.has(n))) return 'KONUT';
    if (names.some(n => TICARI.has(n))) return 'TİCARİ';
    if (names.some(n => OFIS.has(n))) return 'OFİS';
    if (names.some(n => KAZAN.has(n))) return 'KAZAN D.';
    if (names.some(n => KONUT_T2.has(n))) return 'KONUT';
    // Tamamı birim-dışı mı?
    if (names.every(n => BIRIM_DISI.has(n) || n === '' || n === 'MAHAL')) return null;
    return null; // BİRİM HARİCİ
}

// ── Cache (per-floor) ─────────────────────────────────────────────────────────
const _cache = new Map(); // floorId → { rooms, doors, walls, namesKey, result }

function _roomNamesKey(rooms) {
    // Mahal adları / birim no değiştiğinde cache'i geçersiz kılmak için anahtar
    return rooms.map(r => (r.name || '') + (r.id ?? '') + ':' + (r.birimNo ?? '')).join('|');
}

// ── Ana hesaplama fonksiyonu ──────────────────────────────────────────────────
export function computeUnitBirims(overrideFloorId) {
    const { rooms = [], doors = [], walls = [] } = state;
    const floorId = overrideFloorId !== undefined
        ? overrideFloorId
        : (state.currentFloor?.id ?? null);
    const namesKey = _roomNamesKey(rooms);

    const cached = _cache.get(floorId);
    if (
        cached &&
        cached.rooms === rooms &&
        cached.doors === doors &&
        cached.walls === walls &&
        cached.namesKey === namesKey
    ) {
        return cached.result;
    }

    // Kat filtrele
    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);

    // Separator mahalleri (sahanlık / bahçe vb.)
    const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));

    const result = [];
    const seen = new Set(); // aynı kapıyı çift işleme

    // Tek döngü: hem sahanlık/bahçe kapıları hem de dış cephe kapıları
    for (const door of fDoors) {
        if (seen.has(door)) continue;
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) continue;

        const adjacent = getRoomsAdjacentToWall(wall, fRooms);

        // Birim mahali belirle:
        //  • 2 komşu: biri separator (sahanlık vb.), diğeri birim mahali → sahanlık kapısı
        //  • 1 komşu: dış cephe kapısı, o komşu birim mahali olmalı
        let startRoom = null;
        if (adjacent.length === 2) {
            const sepAdj = adjacent.filter(r => separators.includes(r));
            const nonSepAdj = adjacent.filter(r => !separators.includes(r));
            if (sepAdj.length === 1 && nonSepAdj.length === 1) {
                startRoom = nonSepAdj[0];
            }
        } else if (adjacent.length === 1 && !separators.includes(adjacent[0])) {
            startRoom = adjacent[0];
        }
        if (!startRoom) continue;

        const unitRooms = traverseUnit(startRoom, separators, fWalls, fDoors, fRooms);
        const birimTipi = classifyUnit(unitRooms);
        if (!birimTipi) continue; // BİRİM HARİCİ → etiket yok

        seen.add(door);

        // Kapı merkezi (dünya koordinatı)
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.01) continue;
        const wdx = (wall.p2.x - wall.p1.x) / wallLen;
        const wdy = (wall.p2.y - wall.p1.y) / wallLen;

        const dcx = wall.p1.x + wdx * door.pos;
        const dcy = wall.p1.y + wdy * door.pos;

        // Duvara dik vektör (normal)
        const nx = -wdy;
        const ny = wdx;

        // Birim mahali hangi tarafta? → startRoom merkezi
        const toRx = startRoom.center[0] - dcx;
        const toRy = startRoom.center[1] - dcy;
        const sign = (toRx * nx + toRy * ny) >= 0 ? 1 : -1;

        // Duvar kalınlığı yarısı + küçük boşluk kadar öteliyoruz
        const halfWall = (wall.thickness || state.wallThickness || 20) / 2;
        const offset = halfWall + 10; // kapıdan 10cm ötede

        const labelX = dcx + nx * sign * offset;
        const labelY = dcy + ny * sign * offset;
        const outerLabelX = dcx - nx * sign * offset;
        const outerLabelY = dcy - ny * sign * offset;

        // Dış yöne (sahanlık/bahçe) birim vektör (3D kapı etiketi için)
        const outerDirX = -nx * sign;
        const outerDirY = -ny * sign;

        // Metin açısı: duvara paralel, ama ters çevrilmiş olmaması için normalize
        let angle = Math.atan2(wdy, wdx);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

        // Birim toplam alanı (m²)
        const unitArea = unitRooms.reduce((sum, r) => sum + (r.area || 0), 0);

        // Birim no: unitRooms içinden birimNo girilmiş olanı al (öncelik)
        const roomWithNo = unitRooms.find(r => r.birimNo != null && String(r.birimNo).trim() !== '');
        const roomBirimNo = roomWithNo ? String(roomWithNo.birimNo).trim() : '';

        result.push({
            door, birimTipi, labelX, labelY, angle, unitArea,
            outerLabelX, outerLabelY,
            outerDirX, outerDirY,
            floorId: door.floorId ?? wall.floorId ?? floorId,
            unitRooms,
            roomBirimNo,
        });
    }

    _cache.set(floorId, { rooms, doors, walls, namesKey, result });
    return result;
}

// Cache'i dışarıdan temizlemek için (duvar/kapı değiştiğinde state referansı zaten değişir)
export function invalidateBirimCache() {
    _cache.clear();
}

// ── Birim için sayaç bul (tip uyumlu + dış etikete en yakın) ─────────────────
export function findBirimSayac(entry, sayaclar) {
    if (!entry || !Array.isArray(sayaclar) || !sayaclar.length) return null;
    const { birimTipi, outerLabelX, outerLabelY, floorId } = entry;
    let best = null, bestDist = Infinity;
    for (const s of sayaclar) {
        if (s.floorId != null && floorId != null && s.floorId !== floorId) continue;
        if (s.birimTipi && birimTipi && s.birimTipi !== birimTipi
            && !(birimTipi === 'KAZAN D.' && s.birimTipi === 'KAZAN DAİRESİ')) {
            continue;
        }
        const d = Math.hypot(s.x - outerLabelX, s.y - outerLabelY);
        if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
}

// ── Birim için etiket numarasını çöz: önce oda, sonra sayaç ──────────────────
export function resolveBirimNo(entry) {
    if (!entry) return '';
    if (entry.roomBirimNo) return entry.roomBirimNo;
    const sayaclar = (plumbingManager?.components || []).filter(c => c.type === 'sayac');
    const s = findBirimSayac(entry, sayaclar);
    return (s?.birimNo ?? '') + '';
}

// ── Birim tipi kısaltması (ör. "D2", "Dük3 (Ofis)", "KD1") ───────────────────
export function getBirimShortLabel(birimTipi, birimNo) {
    const no = birimNo || '';
    switch (birimTipi) {
        case 'KONUT': return `D${no}`;
        case 'OFİS': return `Dük${no} (Ofis)`;
        case 'TİCARİ': return `Dük${no} (Ticari)`;
        case 'KAZAN D.':
        case 'KAZAN DAİRESİ': return `KD${no}`;
        default: return `D${no}`;
    }
}

// ── Renk paleti ───────────────────────────────────────────────────────────────
const BIRIM_COLOR = {

    'KONUT': '#d1a96e',
    'OFİS': '#65c968',
    'TİCARİ': '#7295d6',
    'KAZAN D.': '#cc7592'



};

// ── Çizim fonksiyonu (etiket – sadece metin, çerçeve yok) ────────────────────
export function drawBirimLabels(ctx2d, st) {
    if (!st.tempVisibility?.showRoomNames) return; // mahal adları kapalıysa atla

    const labels = computeUnitBirims();
    if (!labels.length) return;

    const zoom = st.zoom || 1;
    const ZOOM_EXP = -0.1;
    const BASE_SIZE = 13;
    const fontSize = Math.max(4, BASE_SIZE * Math.pow(zoom, ZOOM_EXP));

    ctx2d.save();
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'bottom';
    ctx2d.font = `bold ${fontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;

    const showArea = !!st.tempVisibility?.showArchDimensions;
    const areaFontSize = fontSize * 0.9;

    for (const entry of labels) {
        const { labelX, labelY, angle, birimTipi, unitArea } = entry;
        const color = isLightMode() ? 'rgb(50, 50, 50)' : 'rgb(205, 205, 205)';
        const birimNo = resolveBirimNo(entry);
        const labelText = birimNo ? getBirimShortLabel(birimTipi, birimNo) : birimTipi;

        ctx2d.save();
        ctx2d.translate(labelX, labelY);
        ctx2d.rotate(angle);

        ctx2d.fillStyle = color;
        ctx2d.font = `bold ${fontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;
        ctx2d.globalAlpha = 0.8;
        ctx2d.fillText(labelText, 0, 0);

        if (showArea && unitArea > 0) {
            ctx2d.font = `${areaFontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;
            ctx2d.fillText(unitArea.toFixed(0) + ' m2', 0, fontSize);
        }

        ctx2d.restore();
    }

    ctx2d.restore();
}

// ── Birim sınır çizgileri ─────────────────────────────────────────────────────
export function drawBirimBoundaries(ctx2d, st) {
    if (!st.tempVisibility?.showBirimBoundaries) return;

    const { rooms = [], doors = [], walls = [] } = st;
    const floorId = st.currentFloor?.id ?? null;

    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);

    // Birim listesini hesapla
    const labels = computeUnitBirims();
    if (!labels.length) return;

    // Seçili oda varsa hangi birime ait bul (oda seçimi selectedRoom üzerinden gelir)
    const selRoom = st.selectedRoom ?? null;
    let selectedUnitRooms = null;
    let selectedSeparatorWalls = null; // SAHANLIK gibi ayrıcı mahal seçilince
    if (selRoom) {
        const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));
        const isSeparator = separators.includes(selRoom);
        if (isSeparator) {
            selectedSeparatorWalls = new Set(getWallsBorderingRoom(selRoom, fWalls));
        } else {
            const startRoom = fRooms.find(r => r === selRoom);
            if (startRoom) {
                selectedUnitRooms = new Set(traverseUnit(startRoom, separators, fWalls, fDoors, fRooms));
            }
        }
    }

    // Her duvar için: bir tarafı birim içinde, diğer tarafı birim dışında veya ayrıcı ise sınır duvarı
    // Tüm birim odası kümesini birleştir
    const allUnitRoomSets = [];
    const seenDoors = new Set();
    const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));

    for (const { door, birimTipi } of labels) {
        if (seenDoors.has(door)) continue;
        seenDoors.add(door);

        const wall = door.wall;
        const adjacent = getRoomsAdjacentToWall(wall, fRooms);
        const startRoom = adjacent.find(r => !separators.includes(r));
        if (!startRoom) continue;

        const unitRooms = new Set(traverseUnit(startRoom, separators, fWalls, fDoors, fRooms));
        allUnitRoomSets.push({ unitRooms, birimTipi });
    }

    const zoom = st.zoom || 1;
    const thinW = 1 / zoom;    // ~6px – normal sınır
    const thickW = 2 / zoom;   // ~16px – seçili birim sınırı

    // İki geçiş: önce normal birimler, sonra seçili birim (üstte görünsün)
    ctx2d.save();
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    // Geçiş 1: seçili olmayan birimler
    for (const { unitRooms, birimTipi } of allUnitRoomSets) {
        const isSelUnit = selectedUnitRooms && [...unitRooms].some(r => selectedUnitRooms.has(r));
        if (isSelUnit) continue;

        const color = BIRIM_COLOR[birimTipi] || 'rgb(255, 255, 255)';
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = thinW;
        ctx2d.shadowColor = color + 'aa';
        ctx2d.shadowBlur = 5 / zoom;

        for (const wall of fWalls) {
            if (!wall.p1 || !wall.p2) continue;
            const adjacent = getRoomsAdjacentToWall(wall, fRooms);
            const insideCount = adjacent.filter(r => unitRooms.has(r)).length;
            const outsideCount = adjacent.filter(r => !unitRooms.has(r)).length;
            // İç duvar (her iki komşu da birim içi) → atla; dış cephe veya sınır duvarı → çiz
            // if (insideCount === 0) continue;
            // if (insideCount >= 2 && outsideCount === 0) continue;
            if (insideCount === 0 || outsideCount === 0) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }

        ctx2d.shadowColor = 'transparent';
        ctx2d.shadowBlur = 0;
    }

    // Geçiş 2: seçili birim – kalın + glow
    if (selectedUnitRooms) {
        for (const { unitRooms, birimTipi } of allUnitRoomSets) {
            const isSelUnit = [...unitRooms].some(r => selectedUnitRooms.has(r));
            if (!isSelUnit) continue;

            const color = BIRIM_COLOR[birimTipi] || '#ffcc80';
            ctx2d.shadowColor = color;
            ctx2d.shadowBlur = 12 / zoom;
            ctx2d.strokeStyle = color;
            ctx2d.lineWidth = thickW;

            for (const wall of fWalls) {
                if (!wall.p1 || !wall.p2) continue;
                const adjacent = getRoomsAdjacentToWall(wall, fRooms);
                const insideCount = adjacent.filter(r => unitRooms.has(r)).length;
                const outsideCount = adjacent.filter(r => !unitRooms.has(r)).length;
                // İç duvar (her iki komşu da birim içi) → atla; dış cephe veya sınır duvarı → çiz
                // if (insideCount === 0) continue;
                // if (insideCount >= 2 && outsideCount === 0) continue;
                if (insideCount === 0 || outsideCount === 0) continue;
                ctx2d.beginPath();
                ctx2d.moveTo(wall.p1.x, wall.p1.y);
                ctx2d.lineTo(wall.p2.x, wall.p2.y);
                ctx2d.stroke();
            }

            ctx2d.shadowColor = 'transparent';
            ctx2d.shadowBlur = 0;
            break;
        }
    }

    // Geçiş 3: seçili ayrıcı mahal (SAHANLIK vb.) – çevresi kalın beyaz
    if (selectedSeparatorWalls) {
        ctx2d.strokeStyle = '#ffffff';
        ctx2d.lineWidth = thickW;
        ctx2d.shadowColor = 'rgba(255,255,255,0.6)';
        ctx2d.shadowBlur = 8 / zoom;

        for (const wall of selectedSeparatorWalls) {
            if (!wall.p1 || !wall.p2) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }

        ctx2d.shadowColor = 'transparent';
        ctx2d.shadowBlur = 0;
    }

    ctx2d.restore();
}
