/**
 * Geometri rotalama (v3 — minimal)
 * "Geometriye göre" çizim modunda iki nokta arası hattın üzerine denk gelen
 *   - KOLON'ları YANLARINDAN (sol/sağ)
 *   - KİRİŞ'leri ALT/ÜST yüzeyinden
 * dolaşan, DİK AÇILI (orthogonal) waypoint dizisi üretir.
 *
 * Duvar/oda engel olarak ele alınmaz — kullanıcı talebi.
 */

import { state, WALL_HEIGHT } from '../../general-files/main.js';
import { getColumnCorners } from '../../architectural-objects/columns.js';
import { getBeamCorners } from '../../architectural-objects/beams.js';

const PIPE_CLEARANCE = 4;       // cm — engelden boruyu hafifçe ayır (2D)
const BEAM_DIP_CLEARANCE = 4;   // cm — kirişin altından bu kadar aşağıda Z-dip
const MAX_DETOUR_STEPS = 6;     // güvenlik tavanı
const EPS = 1e-6;

// ─── Engel toplama ─────────────────────────────────────────────────

function getActiveColumns() {
    const floorId = state.currentFloor?.id;
    return (state.columns || []).filter(c => !floorId || !c.floorId || c.floorId === floorId);
}
function getActiveBeams() {
    const floorId = state.currentFloor?.id;
    return (state.beams || []).filter(b => !floorId || !b.floorId || b.floorId === floorId);
}
function getActiveWalls() {
    const floorId = state.currentFloor?.id;
    return (state.walls || []).filter(w =>
        w && w.p1 && w.p2 &&
        (!floorId || !w.floorId || w.floorId === floorId)
    );
}

/** Bir noktanın herhangi bir duvar GÖVDESİ içinde olup olmadığı (duvar kalınlığı kadar tolerans) */
function pointInsideAnyWall(pt, walls) {
    for (const w of walls) {
        const thick = (w.thickness || 10);
        const half = thick / 2;
        const dx = w.p2.x - w.p1.x;
        const dy = w.p2.y - w.p1.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-6) continue;
        let t = ((pt.x - w.p1.x) * dx + (pt.y - w.p1.y) * dy) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = w.p1.x + t * dx;
        const py = w.p1.y + t * dy;
        const distSq = (pt.x - px) ** 2 + (pt.y - py) ** 2;
        if (distSq < half * half) return true;
    }
    return false;
}

function bboxFromPoints(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
}
function inflateBBox(b, pad) {
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

/**
 * Aktif kattaki kolon ve kirişleri AABB + tür ile döndür.
 *   kind === 'column' → yanlarından (sol/sağ) dolaşılır
 *   kind === 'beam'   → alt/üstünden dolaşılır
 */
function getObstacles() {
    const out = [];
    for (const col of getActiveColumns()) {
        out.push({
            kind: 'column',
            ref: col,
            bbox: inflateBBox(bboxFromPoints(getColumnCorners(col)), PIPE_CLEARANCE)
        });
    }
    for (const beam of getActiveBeams()) {
        out.push({
            kind: 'beam',
            ref: beam,
            bbox: inflateBBox(bboxFromPoints(getBeamCorners(beam)), PIPE_CLEARANCE)
        });
    }
    console.log('[geometri] engel sayısı:', out.length,
        'kolon:', out.filter(o => o.kind === 'column').length,
        'kiriş:', out.filter(o => o.kind === 'beam').length,
        'currentFloorId:', state.currentFloor?.id,
        'state.columns:', (state.columns || []).length,
        'state.beams:',   (state.beams   || []).length);
    if (out.length) {
        out.forEach(o => console.log(`  ${o.kind}`, o.bbox, 'floorId:', o.ref.floorId));
    }
    return out;
}

// ─── Segment vs AABB çakışma ────────────────────────────────────────

function pointInBBox(p, b) {
    return p.x >= b.minX - EPS && p.x <= b.maxX + EPS &&
           p.y >= b.minY - EPS && p.y <= b.maxY + EPS;
}

function segmentHitsBBox(p0, p1, b) {
    // Hızlı dış-sınır reddi
    if (Math.max(p0.x, p1.x) < b.minX - EPS) return false;
    if (Math.min(p0.x, p1.x) > b.maxX + EPS) return false;
    if (Math.max(p0.y, p1.y) < b.minY - EPS) return false;
    if (Math.min(p0.y, p1.y) > b.maxY + EPS) return false;

    // Tam içerme (her iki uç da KENAR'da değil → gerçekten içeride)
    if (pointInBBox(p0, b) && pointInBBox(p1, b)) {
        const strictlyIn = (pt) => pt.x > b.minX + EPS && pt.x < b.maxX - EPS
                                && pt.y > b.minY + EPS && pt.y < b.maxY - EPS;
        if (strictlyIn(p0) || strictlyIn(p1)) return true;
        return false; // her iki uç da kenarda → yüzeyden yürüme, çakışma sayma
    }

    // Parametrik clip (Liang–Barsky)
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    let tMin = 0, tMax = 1;
    const ps = [-dx, dx, -dy, dy];
    const qs = [p0.x - b.minX, b.maxX - p0.x, p0.y - b.minY, b.maxY - p0.y];
    for (let i = 0; i < 4; i++) {
        const p = ps[i], q = qs[i];
        if (Math.abs(p) < EPS) {
            if (q < 0) return false;
            continue;
        }
        const t = q / p;
        if (p < 0) { if (t > tMin) tMin = t; }
        else       { if (t < tMax) tMax = t; }
        if (tMin > tMax) return false;
    }
    if ((tMax - tMin) <= 1e-4) return false;

    // Bbox kenarında YÜRÜME yanlış pozitif vermesin: clipped portion'un
    // orta noktası kutunun gerçekten İÇİNDE olmalı (kenarda değil).
    const tMid = (tMin + tMax) / 2;
    const midX = p0.x + dx * tMid;
    const midY = p0.y + dy * tMid;
    const strictlyInside =
        midX > b.minX + EPS && midX < b.maxX - EPS &&
        midY > b.minY + EPS && midY < b.maxY - EPS;
    return strictlyInside;
}

/** Bir polyline'ın HİÇBİR segmenti bbox'un içinden geçmiyor mu? */
function validatePath(pts, bbox) {
    for (let i = 1; i < pts.length; i++) {
        if (segmentHitsBBox(pts[i - 1], pts[i], bbox)) return false;
    }
    return true;
}

// ─── Dik açılı detour ──────────────────────────────────────────────

function pathLen(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
        s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return s;
}

/**
 * KÖŞE-SARMA detour: diyagonal hattın doğal istikametini koruyarak
 * yalnızca engelin köşesinde dik açılı küçük bir Z yapar.
 * Path biçimi (TR köşesi sarma):
 *   start → (xEntry, minY) → (maxX, minY) → (maxX, yExit) → end
 *           [tepe kenarına in] [köşe]      [sağ kenardan çık]
 *
 * Köşenin geçerli olması: hat hem (x=cx) hem (y=cy) çizgisini bbox
 * sınırları içinde keser; yani köşeyi gerçekten "kırpıyor".
 */
function tryCornerWrap(start, end, bbox, cornerName) {
    const { minX, minY, maxX, maxY } = bbox;
    const dx = end.x - start.x, dy = end.y - start.y;
    if (Math.abs(dx) < EPS || Math.abs(dy) < EPS) return null;

    let cx, cy;
    if      (cornerName === 'TL') { cx = minX; cy = minY; }
    else if (cornerName === 'TR') { cx = maxX; cy = minY; }
    else if (cornerName === 'BL') { cx = minX; cy = maxY; }
    else if (cornerName === 'BR') { cx = maxX; cy = maxY; }
    else return null;

    const tX = (cx - start.x) / dx;
    const tY = (cy - start.y) / dy;

    if (tX < EPS || tX > 1 - EPS) return null;
    if (tY < EPS || tY > 1 - EPS) return null;

    // Çapraz: hat (x=cx) ve (y=cy) çizgilerini bbox içinde kesmeli — yani
    // bu köşeyi gerçekten kırpıyor olmalı. Aksi takdirde sarmak yanlış tarafı dolanır.
    const yAtX = start.y + dy * tX;
    const xAtY = start.x + dx * tY;
    if (yAtX < minY - EPS || yAtX > maxY + EPS) return null;
    if (xAtY < minX - EPS || xAtY > maxX + EPS) return null;

    const z = start.z || 0;
    const firstCross = (tY < tX)
        ? { x: xAtY, y: cy, z }   // önce yatay kenarı keser
        : { x: cx,   y: yAtX, z }; // önce dikey kenarı keser
    const lastCross  = (tY < tX)
        ? { x: cx,   y: yAtX, z }
        : { x: xAtY, y: cy, z };
    const cornerPt = { x: cx, y: cy, z };

    return [start, firstCross, cornerPt, lastCross, end];
}

/**
 * TIGHT-WRAP yatay: yatay (start.y ≈ end.y) hatlarda kolona kadar düz git,
 * kolonun yanından dik açıyla yukarı/aşağı dön, tepesini/altını geç, dönüp devam et.
 * Path: [start, (enterX, start.y), (enterX, wrapY), (exitX, wrapY), (exitX, end.y), end]
 */
function tryTightWrapH(start, end, bbox, side) {
    const { minX, minY, maxX, maxY } = bbox;
    const z = start.z || 0;
    const wrapY  = (side === 'TOP') ? minY : maxY;
    const enterX = (start.x < end.x) ? minX : maxX;
    const exitX  = (start.x < end.x) ? maxX : minX;
    return [
        start,
        { x: enterX, y: start.y, z },
        { x: enterX, y: wrapY,   z },
        { x: exitX,  y: wrapY,   z },
        { x: exitX,  y: end.y,   z },
        end
    ];
}

/**
 * TIGHT-WRAP dikey: dikey (start.x ≈ end.x) hatlarda yan yüzeyden dolanır.
 */
function tryTightWrapV(start, end, bbox, side) {
    const { minX, minY, maxX, maxY } = bbox;
    const z = start.z || 0;
    const wrapX  = (side === 'LEFT') ? minX : maxX;
    const enterY = (start.y < end.y) ? minY : maxY;
    const exitY  = (start.y < end.y) ? maxY : minY;
    return [
        start,
        { x: start.x, y: enterY, z },
        { x: wrapX,   y: enterY, z },
        { x: wrapX,   y: exitY,  z },
        { x: start.x, y: exitY,  z },
        end
    ];
}

/**
 * Engelin tipine göre detour üret. Tüm adaylar validate edilir
 * (hiçbir segment bbox içinden geçemez). Öncelik:
 *   column → KÖŞE-SARMA (0) > L-SOL/SAĞ (1) > TIGHT-H (2) > U-TOP/BOT (3)
 *   beam   → KÖŞE-SARMA (0) > TIGHT-H-BOT (1) > TIGHT-V (2) > U-BOT (3) > diğerleri
 */
function buildDetour(start, end, ob) {
    const z = start.z || 0;
    const { minX, minY, maxX, maxY } = ob.bbox;
    const walls = getActiveWalls();
    const all = []; // { pts, prio }

    const tryAdd = (pts, prio) => {
        if (!pts) return;
        const p = simplifyCollinear(pts);
        if (p.length < 3) return;
        if (!validatePath(p, ob.bbox)) return;
        // Duvar penaltı: bir ara waypoint duvarın içine düşüyorsa o aday ağır cezalı.
        // Böylece duvarsız tarafa yönlenen aday öne çıkar.
        const WALL_PENALTY = 100;
        let pen = 0;
        for (let i = 1; i < p.length - 1; i++) {
            if (pointInsideAnyWall(p[i], walls)) pen += WALL_PENALTY;
        }
        all.push({ pts: p, prio: prio + pen });
    };

    // 1) Köşe-sarma adayları (diyagonal hatlar)
    for (const c of ['TL', 'TR', 'BL', 'BR']) {
        tryAdd(tryCornerWrap(start, end, ob.bbox, c), 0);
    }

    if (ob.kind === 'column') {
        // TIGHT-WRAP (kolona kadar düz, kenardan dik dönüş) — hem yatay hem dikey için öncelikli
        tryAdd(tryTightWrapH(start, end, ob.bbox, 'TOP'), 1);
        tryAdd(tryTightWrapH(start, end, ob.bbox, 'BOT'), 1);
        tryAdd(tryTightWrapV(start, end, ob.bbox, 'LEFT'),  1);
        tryAdd(tryTightWrapV(start, end, ob.bbox, 'RIGHT'), 1);
        // L-şekli fallback (tight-wrap geçersiz/uzun olursa)
        tryAdd([start, { x: minX, y: start.y, z }, { x: minX, y: end.y, z }, end], 2);
        tryAdd([start, { x: maxX, y: start.y, z }, { x: maxX, y: end.y, z }, end], 2);
        // U-şekli (legacy fallback)
        tryAdd([start, { x: start.x, y: minY, z }, { x: end.x, y: minY, z }, end], 3);
        tryAdd([start, { x: start.x, y: maxY, z }, { x: end.x, y: maxY, z }, end], 3);
    }
    // NOT: beam buildDetour'da işlenmez — routePath beam'i Z-dip ile dispatch eder.

    if (!all.length) return null;
    all.sort((a, b) => a.prio - b.prio || pathLen(a.pts) - pathLen(b.pts));
    return all[0].pts;
}

// ─── Kiriş Z-dip detour ────────────────────────────────────────────

/**
 * Kiriş TAVANDAN AŞAĞI sarkar:
 *   top    = WALL_HEIGHT             (tavan kotu)
 *   bottom = WALL_HEIGHT - depth     (kirişin görünen alt yüzeyi)
 * Pipe Z bu aralıkta kalıyorsa kirişi deler → Z-dip gerekli.
 */
function beamConflictsZ(pipeZ, beam) {
    const top    = WALL_HEIGHT;
    const bottom = WALL_HEIGHT - (beam.depth || 20);
    return pipeZ > bottom - 1e-3 && pipeZ < top + 1e-3;
}

/**
 * Kirişe çakışan pipe için Z'de aşağı inip altından geçen dip detour.
 * Path: start → (entry, startZ) → (entry, dipZ) → (exit, dipZ) → (exit, startZ) → end
 * dipZ = kirişin alt yüzeyi - clearance
 */
function buildBeamZDip(start, end, bbox, beam) {
    const dx = end.x - start.x, dy = end.y - start.y;
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return null;

    // 2D line giriş/çıkış (Liang–Barsky)
    let tEnter = 0, tExit = 1;
    const ps = [-dx, dx, -dy, dy];
    const qs = [start.x - bbox.minX, bbox.maxX - start.x,
                start.y - bbox.minY, bbox.maxY - start.y];
    for (let i = 0; i < 4; i++) {
        const p = ps[i], q = qs[i];
        if (Math.abs(p) < EPS) {
            if (q < 0) return null;
            continue;
        }
        const t = q / p;
        if (p < 0) { if (t > tEnter) tEnter = t; }
        else       { if (t < tExit) tExit = t; }
        if (tEnter > tExit) return null;
    }
    if (tEnter >= tExit) return null;

    const startZ = start.z || 0;
    // Dip: kirişin alt yüzeyinden BEAM_DIP_CLEARANCE kadar aşağı
    const beamBottom = WALL_HEIGHT - (beam.depth || 20);
    const dipZ = beamBottom - BEAM_DIP_CLEARANCE;
    // Dip Z mevcut Z'den AŞAĞI olmak zorunda
    if (dipZ >= startZ - 1e-3) return null;

    const entryX = start.x + dx * tEnter;
    const entryY = start.y + dy * tEnter;
    const exitX  = start.x + dx * tExit;
    const exitY  = start.y + dy * tExit;

    return [
        start,
        { x: entryX, y: entryY, z: startZ },
        { x: entryX, y: entryY, z: dipZ   },
        { x: exitX,  y: exitY,  z: dipZ   },
        { x: exitX,  y: exitY,  z: startZ },
        end
    ];
}

function simplifyCollinear(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
        const last = out[out.length - 1];
        const dx = pts[i].x - last.x;
        const dy = pts[i].y - last.y;
        const dz = (pts[i].z || 0) - (last.z || 0);
        if (Math.hypot(dx, dy, dz) < 1e-3) continue; // 3D olarak aynı nokta
        out.push(pts[i]);
    }
    const out2 = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
        const a = out2[out2.length - 1], b = out[i], c = out[i + 1];
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        // Z farkı varsa "collinear" (2D) sayma — Z-dip ara waypoint'i korunmalı
        const aZ = a.z || 0, bZ = b.z || 0, cZ = c.z || 0;
        const zVaries = Math.abs(bZ - aZ) > 1e-3 || Math.abs(cZ - bZ) > 1e-3;
        if (Math.abs(cross) < 1e-3 && !zVaries) continue;
        out2.push(b);
    }
    out2.push(out[out.length - 1]);
    return out2;
}

// ─── Ana rota ──────────────────────────────────────────────────────

export function routePath(start, end) {
    const obstacles = getObstacles();
    if (!obstacles.length) return [start, end];

    const waypoints = [start];
    let current = start;
    const ignored = new Set();

    for (let step = 0; step < MAX_DETOUR_STEPS; step++) {
        const blocker = findFirstBlocker(current, end, obstacles, ignored);
        if (!blocker) break;

        let detour = null;
        if (blocker.kind === 'beam') {
            const pipeZ = current.z || 0;
            if (!beamConflictsZ(pipeZ, blocker.ref)) {
                // Z çakışması yok → kiriş 2D'de engel değil, atla
                ignored.add(blocker);
                continue;
            }
            detour = buildBeamZDip(current, end, blocker.bbox, blocker.ref);
        } else {
            // column
            detour = buildDetour(current, end, blocker);
        }

        if (!detour || detour.length <= 2) {
            ignored.add(blocker);
            continue;
        }

        const via = detour.slice(1, -1);
        for (const w of via) waypoints.push(w);
        current = via[via.length - 1];
        ignored.add(blocker);
    }

    waypoints.push(end);
    return simplifyCollinear(waypoints);
}

function findFirstBlocker(start, end, obstacles, ignored) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return null;

    let best = null;
    let bestT = Infinity;
    for (const o of obstacles) {
        if (ignored && ignored.has(o)) continue;
        if (!segmentHitsBBox(start, end, o.bbox)) continue;
        const cx = (o.bbox.minX + o.bbox.maxX) / 2;
        const cy = (o.bbox.minY + o.bbox.maxY) / 2;
        const t = ((cx - start.x) * dx + (cy - start.y) * dy) / len2;
        if (t < bestT) { bestT = t; best = o; }
    }
    return best;
}
