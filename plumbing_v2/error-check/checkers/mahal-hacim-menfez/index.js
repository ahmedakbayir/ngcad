// mahal-hacim-menfez / index.js
// PDF Md:6.1.1 ve Md:6.1.3 — A tipi (bacasız) cihazlar için iki kontrol:
//   1. Mahal hacmi en az 12 m³ olmalı.
//   2. Mahalde en az 150 cm² serbest en kesite sahip havalandırma menfezi
//      bulunmalı.
//
// Burada "A tipi" cihaz olarak Ocak ele alınır (en yaygın bacasız cihaz). PDF
// listesinin Ocak satırı bu kuralı temsil eder. İlerleyen sürümlerde bacasız
// şofben/şofben-A için ek kontrol eklenebilir.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { state } from '../../../../general-files/main.js';
import { daireLabel, cihazAdBig, locInBirim, findMeterUpstream } from '../../checker-utils.js';

const MIN_HACIM_M3   = 12;
const A_TIPI_CIHAZ   = new Set(['OCAK']);


function pointInRoom(pt, room) {
    if (!pt || !room?.polygon) return false;
    try {
        return turf.booleanPointInPolygon(turf.point([pt.x, pt.y]), room.polygon);
    } catch { return false; }
}

function floorHeightCm(floorId) {
    const f = (state.floors || []).find(x => x.id === floorId);
    if (!f) return 0;
    const h = (f.topElevation || 0) - (f.bottomElevation || 0);
    return h > 0 ? h : 0;
}

function roomVolumeM3(room) {
    const areaM2 = Number(room.area) || 0;
    const heightCm = floorHeightCm(room.floorId);
    return areaM2 * (heightCm / 100);
}

// TOL ile duvar-mahal eşleştirme (auto-name.js'deki ile aynı mantık)
const WALL_TOL = 2; // cm
function roomWalls(room, walls) {
    const out = [];
    const coords = room.polygon?.geometry?.coordinates?.[0];
    if (!coords) return out;
    for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i];
        const [bx, by] = coords[i + 1];
        for (const w of walls) {
            if (!w.p1 || !w.p2) continue;
            const d1 = Math.hypot(w.p1.x - ax, w.p1.y - ay) + Math.hypot(w.p2.x - bx, w.p2.y - by);
            const d2 = Math.hypot(w.p1.x - bx, w.p1.y - by) + Math.hypot(w.p2.x - ax, w.p2.y - ay);
            if (Math.min(d1, d2) < WALL_TOL) { out.push(w); break; }
        }
    }
    return out;
}

function roomHasVent(room, walls) {
    const rWalls = roomWalls(room, walls);
    return rWalls.some(w => Array.isArray(w.vents) && w.vents.length > 0);
}

function mahalHacimMenfezChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    const cihazlar = (manager.components || []).filter(c =>
        c.type === 'cihaz' && A_TIPI_CIHAZ.has(c.cihazTipi)
    );
    if (!cihazlar.length) return [];

    const rooms = state.rooms || [];
    const walls = state.walls || [];
    if (!rooms.length) return [];

    cihazlar.forEach(c => {
        // Cihazın bulunduğu mahali bul
        const room = rooms.find(r =>
            (r.floorId ?? null) === (c.floorId ?? null) &&
            pointInRoom({ x: c.x, y: c.y }, r)
        );
        if (!room) return;

        const sayac = findMeterUpstream(manager, c.fleksBaglanti?.boruId || c.bagliBoruId);
        const loc = locInBirim(c.floorId, daireLabel(sayac));
        const ad = cihazAdBig(c.cihazTipi);

        // 1) Hacim kontrolü
        const hacim = roomVolumeM3(room);
        if (hacim > 0 && hacim < MIN_HACIM_M3) {
            // PDF: "Zemin Kat, D2 biriminde Ocak, 12 m³'ten daha küçük hacimli
            //       mekanlara yerleştirilemez"
            out.push({
                group:   ERROR_GROUP_IDS.TASARIM,
                errorId: `mahal-hacim-${c.id}`,
                message: `${loc ? loc + ' ' : ''}${ad}, ${MIN_HACIM_M3} m³'ten daha küçük hacimli mekanlara yerleştirilemez`,
                source:  'TS7363 Md:6.1.1',
                detail:  'A tipi (bacasız) cihazlar 12 m³\'ten daha küçük hacimli mekanlara yerleştirilmemelidir.',
                targets: [{ type: 'comp', id: c.id }],
                fix: null,
            });
        }

        // 2) Menfez kontrolü
        if (!roomHasVent(room, walls.filter(w => (w.floorId ?? null) === (c.floorId ?? null) || (w.floorId == null)))) {
            // PDF: "Zemin Kat, D2 biriminde Ocak mahalinde menfez gerekli"
            out.push({
                group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
                errorId: `mahal-menfez-${c.id}`,
                message: `${loc ? loc + ' ' : ''}${ad} mahalinde menfez gerekli`,
                source:  'TS7363 Md:6.1.3',
                detail:  'A tipi (bacasız) cihazların yerleştirildiği mahalde en az 150 cm² serbest en kesite sahip havalandırma menfezi bulunmalıdır.',
                targets: [{ type: 'comp', id: c.id }],
                fix: null,
            });
        }
    });

    return out;
}

errorCheckManager.register('mahal-hacim-menfez', mahalHacimMenfezChecker);
