// plumbing_v2/renderer/renderer-labels.js
// Nesne etiket çizim sistemi — taşınabilir etiketler (KAT BAZLI)

import { computeHatGroups, getCizelge6Debi } from './renderer-utils.js';
import { SERVIS_KUTUSU_CONFIG } from '../objects/service-box.js';
import { SAYAC_CONFIG } from '../objects/meter.js';
import { CIHAZ_TIPLERI } from '../objects/device.js';
import { state, isLightMode } from '../../general-files/main.js';

// ─── Sayaç tür etiketi ───────────────────────────────────────────────────────
const SAYAC_TURU_LABEL = {
    'KÖRÜKLÜ': '',
    'ROTARY': 'Rotary Sayaç',
    'TÜRBİN': 'Türbin Sayaç',
};

// ─── Birim tipi kısaltması — her zaman satır dizisi döner ─────────────────
function getBirimLabelLines(birimTipi, birimNo) {
    const no = birimNo || '...';
    switch (birimTipi) {
        case 'KONUT': return [`D${no}`];
        case 'OFİS': return [`(Ofis) Dük${no}`];
        case 'TİCARİ': return [`(Ticari) Dük${no}`];
        case 'KAZAN DAİRESİ': return [`KD${no}`];
        default: return [`D${no}`];
    }
}

// ─── KAT BAZLI KALICI ETİKET OFFSETLERİ ──────────────────────────────────────
// floorId → Map(id → {ax, ay, dir})
const _labelOffsetsByFloor = new Map();

function _getFloorKey(floorId) {
    return floorId || '__default__';
}

function _getFloorOffsetsMap(floorId) {
    const key = _getFloorKey(floorId);
    if (!_labelOffsetsByFloor.has(key)) {
        _labelOffsetsByFloor.set(key, new Map());
    }
    return _labelOffsetsByFloor.get(key);
}

function _getOffset(id, floorId) {
    const floorMap = _getFloorOffsetsMap(floorId);
    return floorMap.get(id) || {};
}

function _setOffset(id, floorId, value) {
    const floorMap = _getFloorOffsetsMap(floorId);
    floorMap.set(id, value);
}

function _deleteOffset(id, floorId) {
    const floorMap = _getFloorOffsetsMap(floorId);
    floorMap.delete(id);
}

// ─── Oto-hesaplanan etiket konumları — kat bazlı cache ───────────────────────
const _labelAutoPosByFloor = new Map(); // floorId → Map(pipe.id → {ax, ay})

function _getAutoPosMap(floorId) {
    const key = _getFloorKey(floorId);
    if (!_labelAutoPosByFloor.has(key)) {
        _labelAutoPosByFloor.set(key, new Map());
    }
    return _labelAutoPosByFloor.get(key);
}

function _getAutoPos(id, floorId) {
    return _getAutoPosMap(floorId).get(id);
}

function _setAutoPos(id, floorId, value) {
    _getAutoPosMap(floorId).set(id, value);
}

function _deleteAutoPos(id, floorId) {
    _getAutoPosMap(floorId).delete(id);
}

export function clearLabelAutoPos(pipeId, floorId) {
    if (pipeId && floorId) {
        _deleteAutoPos(pipeId, floorId);
    } else if (pipeId) {
        // Tüm katlardan temizle
        for (const [_, map] of _labelAutoPosByFloor) {
            map.delete(pipeId);
        }
    } else {
        _labelAutoPosByFloor.clear();
    }
}

/**
 * Saklı etiket konumunu (dx, dy) kadar öteler (kat bazlı)
 * floorId verilmezse aktif katın id'sine düşer — çağıranlar 3bf7345'ten
 * sonra kat bazlı offset yapısına geçişle uyumlu olsun diye.
 */
export function translateLabel(id, dx, dy, floorId) {
    if (!dx && !dy) return;
    if (floorId === undefined) floorId = state.currentFloor?.id ?? null;

    const stored = _getOffset(id, floorId);
    if (stored && stored.ax != null) {
        _setOffset(id, floorId, { ax: stored.ax + dx, ay: stored.ay + dy, dir: stored.dir ?? 0 });
        return;
    }

    const auto = _getAutoPos(id, floorId);
    if (auto) {
        _setAutoPos(id, floorId, { ax: auto.ax + dx, ay: auto.ay + dy });
    }
}

/**
 * Segment (x1,y1)→(x2,y2) ile dikdörtgen (rx,ry,rw,rh) kesişiyor mu?
 */
function _segIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    const r = rx + rw, b = ry + rh;
    function inside(px, py) { return px >= rx && px <= r && py >= ry && py <= b; }
    if (inside(x1, y1) || inside(x2, y2)) return true;
    function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
        const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        if (Math.abs(d) < 1e-9) return false;
        const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
        const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    return segSeg(x1, y1, x2, y2, rx, ry, r, ry) || segSeg(x1, y1, x2, y2, r, ry, r, b) ||
        segSeg(x1, y1, x2, y2, r, b, rx, b) || segSeg(x1, y1, x2, y2, rx, b, rx, ry);
}

// ─── MAHAL adı AABB'leri (mimari etiketler) ───────────────────────────────────
function _buildRoomNameRects(floorId) {
    const rects = [];
    const rooms = state.rooms;
    if (!rooms || rooms.length === 0) return rects;
    
    for (const room of rooms) {
        const roomFloorId = room.floorId || null;
        if (roomFloorId !== floorId) continue;
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
        
        const name = room.name || 'MAHAL';
        const parts = name.split(' ');
        const lineCount = parts.length === 2 ? 2 : 1;
        const baseFontSize = 14;
        const charW = baseFontSize * 0.62;
        const maxWord = Math.max(...parts.map(s => s.length || 1));
        const extraLines = (typeof room.area === 'number' ? 1 : 0) +
            (room.description ? room.description.split('\n').filter(l => l.trim()).length : 0);
        const bw = Math.max(40, maxWord * charW + 16);
        const bh = (lineCount + extraLines) * baseFontSize * 1.3 + 14;
        rects.push({
            kind: 'room',
            bx: room.center[0] - bw / 2,
            by: room.center[1] - bh / 2,
            bw, bh,
        });
    }
    return rects;
}

// ─── Duvar segmentleri (kat bazlı) ────────────────────────────────────────────
function _buildWallSegments(floorId) {
    const segs = [];
    const walls = state.walls;
    if (!walls || walls.length === 0) return segs;
    
    for (const w of walls) {
        const wallFloorId = w.floorId || null;
        if (wallFloorId !== floorId) continue;
        if (!w.p1 || !w.p2) continue;
        segs.push({
            x1: w.p1.x, y1: w.p1.y,
            x2: w.p2.x, y2: w.p2.y,
            thickness: w.thickness || state.wallThickness || 20,
        });
    }
    return segs;
}

function _wallTouchesRect(wall, bx, by, bw, bh) {
    const half = wall.thickness / 2;
    return _segIntersectsRect(
        wall.x1, wall.y1, wall.x2, wall.y2,
        bx - half, by - half, bw + 2 * half, bh + 2 * half
    );
}

// ─── Render sırasında kaydedilen etiket sınırlayıcı kutuları ────────────────
let _labelBBoxes = [];

// ─── Sürükleme durumu ────────────────────────────────────────────────────────
let _drag = null;

// ─── API ─────────────────────────────────────────────────────────────────────

export function hitTestLabel(wx, wy) {
    for (const bb of _labelBBoxes) {
        if (wx >= bb.bx && wx <= bb.bx + bb.bw &&
            wy >= bb.by && wy <= bb.by + bb.bh) {
            return bb.id;
        }
    }
    return null;
}

export function startLabelDrag(id, startX, startY) {
    const bb = _labelBBoxes.find(b => b.id === id);
    let startAX = 0, startAY = 0;
    if (bb) {
        if (bb.style === 'top-center') {
            startAX = bb.bx + bb.bw / 2;
            startAY = bb.by;
        } else {
            startAX = bb.bx;
            startAY = bb.by + bb.bh / 2;
        }
    }
    _drag = { id, startX, startY, startAX, startAY, floorId: state.currentFloor?.id };
}

export function updateLabelDrag(curX, curY) {
    if (!_drag) return;
    const ax = _drag.startAX + (curX - _drag.startX);
    const ay = _drag.startAY + (curY - _drag.startY);
    const existing = _getOffset(_drag.id, _drag.floorId);
    _setOffset(_drag.id, _drag.floorId, { ax, ay, dir: existing.dir ?? 0 });
}

export function endLabelDrag() {
    _drag = null;
}

export function getLabelOffsetsJSON() {
    const out = {};
    for (const [floorId, floorMap] of _labelOffsetsByFloor) {
        const floorOut = {};
        for (const [id, val] of floorMap) {
            floorOut[id] = val;
        }
        out[floorId] = floorOut;
    }
    return out;
}

export function setLabelOffsetsJSON(data) {
    _labelOffsetsByFloor.clear();
    _labelAutoPosByFloor.clear();
    if (!data) return;
    for (const [floorId, floorData] of Object.entries(data)) {
        const floorMap = _getFloorOffsetsMap(floorId === '__default__' ? null : floorId);
        for (const [id, val] of Object.entries(floorData)) {
            floorMap.set(id, val);
        }
    }
}

// Yalnızca verilen katın manuel/auto etiket offsetlerini temizler.
// Diğer katların kullanıcı ayarladığı konumlarına dokunmaz.
export function clearLabelOffsetsForFloor(floorId) {
    const key = _getFloorKey(floorId);
    _labelOffsetsByFloor.get(key)?.clear();
    _labelAutoPosByFloor.get(key)?.clear();
}

export function rotateLabelDir(id, floorId) {
    const off = _getOffset(id, floorId);
    const newDir = ((off.dir ?? 0) + 1) % 4;
    _setOffset(id, floorId, { ax: off.ax, ay: off.ay, dir: newDir });
}

// ─── MIXIN ───────────────────────────────────────────────────────────────────
export const LabelMixin = {

    drawObjectLabels(ctx, manager) {
        if (!manager) return;
        if (state.is3DPerspectiveActive) return;

        _labelBBoxes = [];

        const currentFloorId = state.currentFloor?.id || null;
        
        // Mevcut kattaki aktif boru ID'leri için auto-cache temizliği
        if (manager.pipes) {
            const activePipeIds = new Set(manager.pipes.map(p => p.id));
            const autoMap = _getAutoPosMap(currentFloorId);
            for (const id of autoMap.keys()) {
                if (!activePipeIds.has(id)) autoMap.delete(id);
            }
        }

        const _sameFloor = (o) => !currentFloorId || !o.floorId || o.floorId === currentFloorId;
        const _pipesForLabels = manager.pipes ? manager.pipes.filter(_sameFloor) : [];
        const _compsForLabels = manager.components ? manager.components.filter(_sameFloor) : [];

        const zoom = state.zoom || 1;
        const t = state.viewBlendFactor || 0;
        const light = isLightMode();

        const fontSize = 10;
        const lineH = fontSize * 1.6;

        const roomNameRects = _buildRoomNameRects(currentFloorId);
        const wallSegs = _buildWallSegments(currentFloorId);

        const opts = {
            zoom, t, fontSize, lineH, manager, currentFloorId,
            roomNameRects, wallSegs,
            textColor: light ? '#0a0e16' : '#f3f4f8',
            subColor: light ? '#25272c' : '#c8ced8',
            accentColor: light ? '#153692' : '#a2cbfc',
            bgColor: light ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,35,0.10)',
            borderColor: light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)',
            connColor: light ? 'rgba(85, 85, 85, 0.65)' : 'rgba(182, 182, 182, 0.65)',
            accentBar: light ? 'rgba(29,78,216,0.50)' : 'rgba(96,165,250,0.50)',
        };

        const { hatMap } = computeHatGroups(manager.pipes, manager.components);
        window._hatMap = hatMap;

        // Boru etiketleri
        if (_pipesForLabels && _pipesForLabels.length > 0) {
            const pipeMap = new Map(_pipesForLabels.map(p => [p.id, p]));
            const childrenIdx = new Map();
            _pipesForLabels.forEach(p => {
                if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId) {
                    const par = p.baslangicBaglanti.hedefId;
                    if (!childrenIdx.has(par)) childrenIdx.set(par, []);
                    childrenIdx.get(par).push(p.id);
                }
            });

            const allPipes = manager.pipes || [];
            const allPipeMap = new Map(allPipes.map(p => [p.id, p]));
            const allChildrenIdx = new Map();
            allPipes.forEach(p => {
                if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId) {
                    const par = p.baslangicBaglanti.hedefId;
                    if (!allChildrenIdx.has(par)) allChildrenIdx.set(par, []);
                    allChildrenIdx.get(par).push(p.id);
                }
            });

            const visitedSec = new Set();
            const sections = [];

            _pipesForLabels.forEach(seedPipe => {
                if (visitedSec.has(seedPipe.id)) return;
                const hatNo = hatMap.get(seedPipe.id);
                if (hatNo == null) return;

                const group = [];
                const fullGroup = [];
                const localVisited = new Set();
                const queue = [seedPipe.id];
                while (queue.length > 0) {
                    const id = queue.shift();
                    if (localVisited.has(id)) continue;
                    if (hatMap.get(id) !== hatNo) continue;
                    const p = allPipeMap.get(id);
                    if (!p) continue;
                    localVisited.add(id);
                    fullGroup.push(p);
                    if (pipeMap.has(id)) {
                        visitedSec.add(id);
                        group.push(p);
                    }

                    const par = p.baslangicBaglanti?.tip === 'boru' ? p.baslangicBaglanti.hedefId : null;
                    if (par && hatMap.get(par) === hatNo) queue.push(par);
                    (allChildrenIdx.get(id) || []).forEach(cid => {
                        if (hatMap.get(cid) === hatNo) queue.push(cid);
                    });
                }

                if (group.length > 0) sections.push({ hatNo, pipes: group, fullPipes: fullGroup });
            });

            sections.forEach(({ hatNo, pipes, fullPipes }) => {
                let chosen = null;
                let totalLen = 0;

                fullPipes.forEach(pipe => {
                    if (!pipe.p1 || !pipe.p2) return;
                    totalLen += Math.hypot(
                        pipe.p2.x - pipe.p1.x,
                        pipe.p2.y - pipe.p1.y,
                        (pipe.p2.z || 0) - (pipe.p1.z || 0)
                    );
                });

                for (const pipe of pipes) {
                    const hasManual = _getOffset(pipe.id, currentFloorId)?.ax != null;
                    const hasAuto = _getAutoPos(pipe.id, currentFloorId) != null;
                    if (hasManual || hasAuto) {
                        chosen = pipe;
                        break;
                    }
                }

                if (!chosen) {
                    let fallback = pipes[0];
                    let maxLen = 0;
                    let horizBest = null;
                    let maxHorizLen = 0;

                    pipes.forEach(pipe => {
                        if (!pipe.p1 || !pipe.p2) return;
                        const dx = pipe.p2.x - pipe.p1.x;
                        const dy = pipe.p2.y - pipe.p1.y;
                        const len = Math.hypot(dx, dy);

                        if (len > maxLen) { maxLen = len; fallback = pipe; }
                        if (Math.abs(dx) > Math.abs(dy)) {
                            if (len > maxHorizLen) {
                                maxHorizLen = len;
                                horizBest = pipe;
                            }
                        }
                    });
                    chosen = horizBest || fallback;
                }

                if (chosen && chosen.p1 && chosen.p2)
                    this._drawPipeObjLabel(ctx, chosen, hatNo, totalLen, opts, manager.pipes);
            });
        }

        // Bileşen etiketleri
        if (_compsForLabels) {
            _compsForLabels.forEach(comp => {
                switch (comp.type) {
                    case 'sayac':
                        this._drawSayacObjLabel(ctx, comp, opts);
                        break;
                    case 'vana':
                        this._drawVanaObjLabel(ctx, comp, manager, opts);
                        break;
                    case 'servis_kutusu':
                        this._drawKutuObjLabel(ctx, comp, opts);
                        break;
                    case 'cihaz':
                        this._drawCihazObjLabel(ctx, comp, opts);
                        break;
                    case 'regulator':
                        this._drawRegulatorObjLabel(ctx, comp, manager, opts);
                        break;
                    case 'filtre':
                    case 'izolasyon_flansi':
                    case 'kompansator':
                    case 'manometre':
                    case 'topraklama':
                        this._drawFittingObjLabel(ctx, comp, manager, opts);
                        break;
                }
            });
        }
    },

    _scrPos(obj, t) {
        const z = (obj.z || 0) * t;
        return { x: obj.x + z, y: obj.y - z };
    },

    _scrPosForCihazPersp(comp, manager, t) {
        if (!manager || !comp.fleksBaglanti?.boruId || !comp.fleksBaglanti.endpoint) return null;
        const pipe = manager.pipes.find(p => p.id === comp.fleksBaglanti.boruId);
        if (!pipe) return null;
        const ep = comp.fleksBaglanti.endpoint;
        const endpoint = ep === 'p1' ? pipe.p1 : pipe.p2;
        const otherEnd = ep === 'p1' ? pipe.p2 : pipe.p1;
        const dx = endpoint.x - otherEnd.x;
        const dy = endpoint.y - otherEnd.y;
        const dz = (endpoint.z || 0) - (otherEnd.z || 0);
        if (Math.hypot(dx, dy, dz) < 0.1) return null;
        const su = dx + dz * t;
        const sv = dy - dz * t;
        const sLen = Math.hypot(su, sv);
        if (sLen < 0.1) return null;
        const ux = su / sLen;
        const uy = sv / sLen;
        const flexLen = comp.fleksBaglanti.uzunluk || 30;
        const halfW = (comp.config?.width || 30) / 2;
        const dist = flexLen + halfW;
        const persp = {
            x: endpoint.x + dist * ux,
            y: endpoint.y + dist * uy,
            z: endpoint.z || 0,
        };
        const z = persp.z * t;
        return { x: persp.x + z, y: persp.y - z };
    },

    _scrPosEffective(obj, t, manager) {
        if (obj?.type === 'cihaz' && state.is3DPerspectiveActive) {
            const persp = this._scrPosForCihazPersp(obj, manager, t);
            if (persp) return persp;
        }
        return this._scrPos(obj, t);
    },

    // ─── Leader line kesişme kontrolü ─────────────────────────────────────────
    _lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh, padding = 0) {
        const prx = rx - padding;
        const pry = ry - padding;
        const prw = rw + padding * 2;
        const prh = rh + padding * 2;
        return _segIntersectsRect(x1, y1, x2, y2, prx, pry, prw, prh);
    },

    _findBestConnectionPoint(objCenter, labelCenter, objHalfSize) {
        const dx = labelCenter.x - objCenter.x;
        const dy = labelCenter.y - objCenter.y;
        
        let edgeX = objCenter.x, edgeY = objCenter.y;
        
        if (Math.abs(dx) * objHalfSize.hh > Math.abs(dy) * objHalfSize.hw) {
            // Yatay çıkış
            edgeX = objCenter.x + (dx > 0 ? objHalfSize.hw : -objHalfSize.hw);
            edgeY = objCenter.y;
        } else {
            // Dikey çıkış
            edgeX = objCenter.x;
            edgeY = objCenter.y + (dy > 0 ? objHalfSize.hh : -objHalfSize.hh);
        }
        
        return { x: edgeX, y: edgeY };
    },

    _drawObjLabelBox(ctx, id, ax, ay, cx, cy, lines, opts, objClip = 0) {
        const { zoom, fontSize, lineH, currentFloorId,
            textColor, subColor, accentColor,
            connColor, bgColor, borderColor, accentBar } = opts;

        const visLines = lines.filter(l => l && l.text);
        if (visLines.length === 0) return;

        const pad = fontSize * 0.6;
        const r = 2.5 / zoom;

        ctx.save();
        ctx.font = `${fontSize}px "Segoe UI",sans-serif`;

        let maxW = 0;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
        });
        const boxW = maxW + pad * 2;
        const boxH = visLines.length * lineH + pad * 0.8;

        const bx = ax;
        const by = ay - boxH / 2;

        _labelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style: 'left-center' });

        const labelCenter = { x: bx + boxW / 2, y: by + boxH / 2 };
        const objCenter = { x: cx, y: cy };
        const objHalf = { hw: objClip, hh: objClip };
        
        const connectionPoint = this._findBestConnectionPoint(objCenter, labelCenter, objHalf);

        const startX = connectionPoint.x;
        const startY = connectionPoint.y;
        // Bitiş etiket kutusunun kenarında durmalı (merkeze değil); aksi takdirde
        // yarı şeffaf arka plandan altta kalan çizgi görünür.
        let endX = labelCenter.x;
        let endY = labelCenter.y;
        {
            const dxL = labelCenter.x - startX;
            const dyL = labelCenter.y - startY;
            const distL = Math.hypot(dxL, dyL);
            if (distL > 0.1) {
                const ux = dxL / distL;
                const uy = dyL / distL;
                const tLab = Math.min(
                    Math.abs(ux) > 1e-6 ? (boxW / 2) / Math.abs(ux) : Infinity,
                    Math.abs(uy) > 1e-6 ? (boxH / 2) / Math.abs(uy) : Infinity
                );
                if (isFinite(tLab)) {
                    endX = labelCenter.x - ux * tLab;
                    endY = labelCenter.y - uy * tLab;
                }
            }
        }

        const dist = Math.hypot(endX - startX, endY - startY);

        if (dist > 0.1) {
            ctx.strokeStyle = connColor;
            ctx.lineWidth = 0.5 / zoom;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, Math.max(0, r));
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = accentBar;
        ctx.lineWidth = 1.5 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + 0.75 / zoom, by + r);
        ctx.lineTo(bx + 0.75 / zoom, by + boxH - r);
        ctx.stroke();
        ctx.lineCap = 'butt';

        let ty = by + pad * 0.4 + fontSize;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.accent ? accentColor : (l.sub ? subColor : textColor);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(l.text, bx + pad, ty);
            ty += lineH;
        });

        ctx.restore();
    },

    _drawObjLabelBoxBelow(ctx, id, cx, cy, ox, oy, lines, opts, objClip = 0) {
        const { zoom, fontSize, lineH, currentFloorId,
            textColor, subColor, accentColor,
            connColor, bgColor, borderColor, accentBar } = opts;

        const visLines = lines.filter(l => l && l.text);
        if (visLines.length === 0) return;

        const pad = fontSize * 0.6;
        const gap = 10 / zoom;
        const r = 2.5 / zoom;

        ctx.save();

        let maxW = 0;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
        });
        const boxW = maxW + pad * 2;
        const boxH = visLines.length * lineH + pad * 0.8;

        const stored = _getOffset(id, currentFloorId);
        let topCX, topCY;
        if (stored && stored.ax != null) {
            topCX = stored.ax;
            topCY = stored.ay;
        } else {
            topCX = cx + ox;
            topCY = cy + objClip + gap + oy;
        }
        const bx = topCX - boxW / 2;
        const by = topCY;

        _labelBBoxes.push({ id, bx, by, bw: boxW, bh: boxH, style: 'top-center' });

        const labelCenter = { x: bx + boxW / 2, y: by + boxH / 2 };
        const objCenter = { x: cx, y: cy };
        const objHalf = { hw: objClip, hh: objClip };
        
        const connectionPoint = this._findBestConnectionPoint(objCenter, labelCenter, objHalf);

        const startX = connectionPoint.x;
        const startY = connectionPoint.y;
        // Bitiş etiket kutusunun kenarında durmalı (merkeze değil); aksi takdirde
        // yarı şeffaf arka plandan altta kalan çizgi görünür.
        let endX = labelCenter.x;
        let endY = labelCenter.y;
        {
            const dxL = labelCenter.x - startX;
            const dyL = labelCenter.y - startY;
            const distL = Math.hypot(dxL, dyL);
            if (distL > 0.1) {
                const ux = dxL / distL;
                const uy = dyL / distL;
                const tLab = Math.min(
                    Math.abs(ux) > 1e-6 ? (boxW / 2) / Math.abs(ux) : Infinity,
                    Math.abs(uy) > 1e-6 ? (boxH / 2) / Math.abs(uy) : Infinity
                );
                if (isFinite(tLab)) {
                    endX = labelCenter.x - ux * tLab;
                    endY = labelCenter.y - uy * tLab;
                }
            }
        }

        const dist = Math.hypot(endX - startX, endY - startY);

        if (dist > 0.1) {
            ctx.strokeStyle = connColor;
            ctx.lineWidth = 0.5 / zoom;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, Math.max(0, r));
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = accentBar;
        ctx.lineWidth = 1.5 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + r, by + 0.75 / zoom);
        ctx.lineTo(bx + boxW - r, by + 0.75 / zoom);
        ctx.stroke();
        ctx.lineCap = 'butt';

        let ty = by + pad * 0.4 + fontSize;
        visLines.forEach(l => {
            ctx.font = `${l.bold ? 'bold ' : ''}${fontSize}px "Segoe UI",sans-serif`;
            ctx.fillStyle = l.accent ? accentColor : (l.sub ? subColor : textColor);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(l.text, bx + pad, ty);
            ty += lineH;
        });

        ctx.restore();
    },

    _drawPipeObjLabel(ctx, pipe, pipeNum, totalLen, opts, allPipes) {
        const { t, zoom, fontSize, currentFloorId,
            subColor, accentColor, connColor, bgColor, borderColor, accentBar,
            roomNameRects, wallSegs } = opts;

        if (!pipe.p1 || !pipe.p2) return;

        const z1 = (pipe.p1.z || 0) * t, z2 = (pipe.p2.z || 0) * t;
        const sx1 = pipe.p1.x + z1, sy1 = pipe.p1.y - z1;
        const sx2 = pipe.p2.x + z2, sy2 = pipe.p2.y - z2;

        const midX = (sx1 + sx2) / 2;
        const midY = (sy1 + sy2) / 2;
        const angle = Math.atan2(sy2 - sy1, sx2 - sx1);

        const connDist = 1 / zoom;
        const cx = midX - Math.sin(angle) * connDist;
        const cy = midY + Math.cos(angle) * connDist;

        const stored = _getOffset(pipe.id, currentFloorId);
        const dir = stored?.dir ?? 0;

        let ax, ay;

        if (stored && stored.ax != null) {
            ax = stored.ax;
            ay = stored.ay;
        } else {
            const cached = _getAutoPos(pipe.id, currentFloorId);
            if (cached) {
                ax = cached.ax;
                ay = cached.ay;
            } else {
                // Otomatik yerleşim - daha akıllı
                const estW = fontSize * 8;
                const estH = fontSize * 3.5;
                const PIPE_LABEL_GAP = 15;
                
                const pLen = Math.hypot(sx2 - sx1, sy2 - sy1) || 1;
                const pdx = (sx2 - sx1) / pLen;
                const pdy = (sy2 - sy1) / pLen;
                
                // Boru yönüne dik açıları tercih et
                const perpX = -pdy;
                const perpY = pdx;
                
                const candidates = [
                    { ux: perpX, uy: perpY, off: estH / 2 + PIPE_LABEL_GAP, scoreAdj: 0 },      // dik sağ
                    { ux: -perpX, uy: -perpY, off: estH / 2 + PIPE_LABEL_GAP, scoreAdj: 5 },     // dik sol
                    { ux: pdx, uy: pdy, off: estW / 2 + PIPE_LABEL_GAP, scoreAdj: 30 },          // boru yönü
                    { ux: -pdx, uy: -pdy, off: estW / 2 + PIPE_LABEL_GAP, scoreAdj: 30 },        // ters yön
                    { ux: 0, uy: -1, off: estH / 2 + PIPE_LABEL_GAP, scoreAdj: 15 },
                    { ux: 0, uy: 1, off: estH / 2 + PIPE_LABEL_GAP, scoreAdj: 15 },
                    { ux: 1, uy: 0, off: estW / 2 + PIPE_LABEL_GAP, scoreAdj: 15 },
                    { ux: -1, uy: 0, off: estW / 2 + PIPE_LABEL_GAP, scoreAdj: 15 },
                ];

                let bestScore = Infinity, bestAx = 0, bestAy = 0;

                for (const cand of candidates) {
                    const centerX = midX + cand.ux * cand.off;
                    const centerY = midY + cand.uy * cand.off;
                    const cax = centerX - estW / 2;
                    const cay = centerY - estH / 2;
                    
                    let score = cand.scoreAdj;

                    // Diğer etiketlerle çakışma
                    for (const bb of _labelBBoxes) {
                        const ox = Math.max(0, Math.min(cax + estW, bb.bx + bb.bw) - Math.max(cax, bb.bx));
                        const oy = Math.max(0, Math.min(cay + estH, bb.by + bb.bh) - Math.max(cay, bb.by));
                        if (ox > 0 && oy > 0) score += 100 + ox * oy;
                    }

                    // MAHAL adları - kesin kaçınma
                    if (roomNameRects) {
                        for (const rr of roomNameRects) {
                            const ox = Math.max(0, Math.min(cax + estW, rr.bx + rr.bw) - Math.max(cax, rr.bx));
                            const oy = Math.max(0, Math.min(cay + estH, rr.by + rr.bh) - Math.max(cay, rr.by));
                            if (ox > 0 && oy > 0) score += 5000;
                        }
                    }

                    // Duvarlar - hafif kaçınma
                    if (wallSegs) {
                        for (const w of wallSegs) {
                            if (_wallTouchesRect(w, cax, cay, estW, estH)) score += 25;
                        }
                    }

                    // Mesafe cezası - daha yumuşak
                    const distFromPipe = Math.hypot(centerX - midX, centerY - midY);
                    score += distFromPipe * 2;

                    if (score < bestScore) {
                        bestScore = score;
                        bestAx = cax;
                        bestAy = cay;
                        if (score < 30) break;
                    }
                }

                ax = bestAx;
                ay = bestAy;
                _setAutoPos(pipe.id, currentFloorId, { ax, ay });
            }
        }

const uzunluk = (totalLen != null && totalLen > 0) ? (totalLen / 100).toFixed(2) : null;
        const debi = typeof pipe.debi === 'number' ? pipe.debi : null;
        const cap = pipe.boruCap || '';

        const infoLines = [
            debi != null ? `${debi.toFixed(2)} m³/h` : null,
            uzunluk != null ? `${uzunluk} m` : null,
            cap || null,
        ].filter(Boolean);

        if (pipe.description) {
            pipe.description.trimEnd().split('\n').forEach(line => infoLines.push(line.trimEnd()));
        }

        // ═══════════════════════════════════════════════════════════════
        // ─── İZOMETRİ ETİKET STİLİ KAT PLANINA UYARLANDI (YENİ KISIM) ───
        // ═══════════════════════════════════════════════════════════════
        const isLight = isLightMode();
        const isHigh = pipeNum >= 300;
        const hatColor = isHigh ? '#8d2121' : accentColor;
        const accentBarColor = isHigh
            ? (isLight ? 'rgba(141,33,33,0.55)' : 'rgba(220,90,90,0.55)')
            : (isLight ? 'rgba(29,78,216,0.55)' : 'rgba(96,165,250,0.55)');
        const bgBoxColor = isLight ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,35,0.12)';
        const borderBoxColor = isLight ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.20)';
        const sepBoxColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)';

        const numStr = String(pipeNum);
        const numFont = `bold ${fontSize * 1.4}px "Segoe UI",sans-serif`;
        const infoFont = `${fontSize * 0.78}px "Segoe UI",sans-serif`;
        const infoLineH = fontSize * 0.78 * 1.45;
        const pad = fontSize * 0.42;
        const sep = 1 / zoom;
        const r = 2.5 / zoom;

        ctx.save();

        ctx.font = numFont;
        const numW = ctx.measureText(numStr).width;
        ctx.font = infoFont;
        let maxInfoW = 0;
        infoLines.forEach(l => { maxInfoW = Math.max(maxInfoW, ctx.measureText(l).width); });

        const numCellW = pad + numW + pad;
        const numCellH = fontSize * 1.4 + pad * 0.7;
        const infoCellW = infoLines.length > 0 ? pad + maxInfoW + pad : 0;
        const infoCellH = infoLines.length > 0 ? infoLines.length * infoLineH + pad * 0.6 : 0;

        const isHoriz = (dir === 0 || dir === 2);
        let boxW, boxH;
        if (isHoriz) {
            boxW = numCellW + (infoCellW > 0 ? sep + infoCellW : 0);
            boxH = Math.max(numCellH, infoCellH);
        } else {
            boxW = Math.max(numCellW, infoCellW > 0 ? infoCellW : 0);
            boxH = numCellH + (infoCellH > 0 ? sep + infoCellH : 0);
        }

        const bx = ax;
        const by = ay - boxH / 2;

        let numBX, numBY, numBW, numBH, infoBX, infoBY;
        if (dir === 0) {
            numBX = bx; numBY = by; numBW = numCellW; numBH = boxH;
            infoBX = bx + numCellW + sep; infoBY = by;
        } else if (dir === 1) {
            numBX = bx; numBY = by; numBW = boxW; numBH = numCellH;
            infoBX = bx; infoBY = by + numCellH + sep;
        } else if (dir === 2) {
            infoBX = bx; infoBY = by;
            numBX = bx + infoCellW + sep; numBY = by; numBW = numCellW; numBH = boxH;
        } else {
            infoBX = bx; infoBY = by;
            numBX = bx; numBY = by + infoCellH + sep; numBW = boxW; numBH = numCellH;
        }

        _labelBBoxes.push({ id: pipe.id, bx, by, bw: boxW, bh: boxH, style: 'left-center' });

        const labelCenter = { x: bx + boxW / 2, y: by + boxH / 2 };
        const objCenter = { x: cx, y: cy };
        const objHalf = { hw: 5, hh: 5 };
        
        const connectionPoint = this._findBestConnectionPoint(objCenter, labelCenter, objHalf);

        // Bitiş etiket kutusunun kenarında durmalı (merkeze değil); aksi takdirde
        // yarı şeffaf arka plandan altta kalan çizgi görünür.
        let pipeLabelEndX = labelCenter.x;
        let pipeLabelEndY = labelCenter.y;
        {
            const dxL = labelCenter.x - connectionPoint.x;
            const dyL = labelCenter.y - connectionPoint.y;
            const distL = Math.hypot(dxL, dyL);
            if (distL > 0.1) {
                const ux = dxL / distL;
                const uy = dyL / distL;
                const tLab = Math.min(
                    Math.abs(ux) > 1e-6 ? (boxW / 2) / Math.abs(ux) : Infinity,
                    Math.abs(uy) > 1e-6 ? (boxH / 2) / Math.abs(uy) : Infinity
                );
                if (isFinite(tLab)) {
                    pipeLabelEndX = labelCenter.x - ux * tLab;
                    pipeLabelEndY = labelCenter.y - uy * tLab;
                }
            }
        }

        ctx.strokeStyle = connColor;
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(connectionPoint.x, connectionPoint.y);
        ctx.lineTo(pipeLabelEndX, pipeLabelEndY);
        ctx.stroke();

        // ─── YARI ŞEFFAF ARKA PLAN KUTUSU ───
        ctx.fillStyle = bgBoxColor;
        ctx.strokeStyle = borderBoxColor;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, Math.max(0, r));
        ctx.fill();
        ctx.stroke();

        // ─── İNCE AYRAÇ ÇİZGİSİ ───
        if (infoCellW > 0 || infoCellH > 0) {
            ctx.strokeStyle = sepBoxColor;
            ctx.lineWidth = 0.5 / zoom;
            ctx.beginPath();
            if (isHoriz) {
                const sepX = (dir === 0) ? bx + numCellW : bx + infoCellW;
                ctx.moveTo(sepX, by + pad * 0.5);
                ctx.lineTo(sepX, by + boxH - pad * 0.5);
            } else {
                const sepY = (dir === 1) ? by + numCellH : by + infoCellH;
                ctx.moveTo(bx + pad * 0.5, sepY);
                ctx.lineTo(bx + boxW - pad * 0.5, sepY);
            }
            ctx.stroke();
        }

        // ─── SOL KENAR KALIN ACCENT ÇUBUĞU ───
        ctx.strokeStyle = accentBarColor;
        ctx.lineWidth = 3 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (isHoriz) {
            ctx.moveTo(numBX + 0.75 / zoom, numBY + r);
            ctx.lineTo(numBX + 0.75 / zoom, numBY + numBH - r);
        } else {
            ctx.moveTo(numBX + r, numBY + 0.75 / zoom);
            ctx.lineTo(numBX + numBW - r, numBY + 0.75 / zoom);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';

        // ─── HAT NUMARASI METNİ ───
        ctx.font = numFont;
        ctx.fillStyle = hatColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, numBX + numBW / 2, numBY + numBH / 2);

        // ─── DETAY SATIRLARI ───
        ctx.font = infoFont;
        ctx.fillStyle = subColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const infoH = infoLines.length * infoLineH;
        const infoStartY = infoBY + (infoCellH - infoH) / 2 + infoLineH / 2;

        infoLines.forEach((l, i) => {
            ctx.fillText(l, infoBX + pad, infoStartY + i * infoLineH);
        });

        ctx.restore();
    },
    
    _drawSayacObjLabel(ctx, comp, opts) {
        const { t, currentFloorId } = opts;
        const sc = this._scrPos(comp, t);
        const off = _getOffset(comp.id, currentFloorId);

        const lines = [];
        const birimLines = getBirimLabelLines(comp.birimTipi || '', comp.birimNo || '');
        birimLines.forEach(t => { if (t) lines.push({ text: t, bold: true }); });

        const turuLabel = SAYAC_TURU_LABEL[comp.sayacTuru || 'KÖRÜKLÜ'] || '';
        if (turuLabel) lines.push({ text: turuLabel, sub: true });

        const boruTipi = comp.birimBoruTipi || 'ÇELİK';
        if (boruTipi === 'ESNEK') {
            const marka = comp.esnekMarka || '';
            lines.push({ text: marka ? `Esnek Tesisat (${marka})` : 'Esnek Tesisat', sub: true });
        } else {
            const bagTipi = comp.birimBaglantiTipi || '';
            if (bagTipi) {
                const bagLabel = bagTipi === 'DİŞLİ' ? 'Dişli'
                    : bagTipi === 'KAYNAKLI' ? 'Kaynaklı'
                        : bagTipi;
                lines.push({ text: `${bagLabel} Tesisat`, sub: true });
            }
        }

        const aboneAdi = comp.aboneAdi || '';
        const aboneNo = comp.aboneNo || '';

        if (aboneAdi || aboneNo) {
            if (aboneAdi) lines.push({ text: aboneAdi, sub: true });
            if (aboneNo) lines.push({ text: aboneNo, sub: true });
        }

        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        if (lines.length === 0) return;

        const cx = sc.x;
        const cy = sc.y;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx || 0, off.dy || 0, lines, opts, 10);
    },

    _drawVanaObjLabel(ctx, comp, manager, opts) {
        const { t, zoom, currentFloorId } = opts;
        const sc = this._scrPos(comp, t);
        const off = _getOffset(comp.id, currentFloorId);

        const lines = [];
        const vt = comp.vanaTipi || '';

        if (vt === 'CIHAZ') {
            if (comp.flans) lines.push({ text: 'Flanşlı Cihaz Vanası', sub: true });
            if (comp.izolator) lines.push({ text: 'İzolatörlü', sub: true });
        } else if (vt === 'AKV') {
            if (!comp.flans) lines.push({ text: 'AKV', bold: true });
            if (comp.flans) lines.push({ text: 'Flanşlı AKV', bold: true });
            if (comp.vanaCap) lines.push({ text: comp.vanaCap, sub: true });
            lines.push({ text: 'h:1.9-2.1m', sub: true });
        } else if (vt === 'BRANSMAN') {
            if (comp.ilerdeKullanim) {
                lines.push({ text: 'ilerde kullanım amacıyla', sub: true });
                const n = parseInt(comp.birimSayisi, 10) || 0;
                const tipiLbl = (() => {
                    switch (comp.birimTipi) {
                        case 'OFİS': return 'dükkan';
                        case 'TİCARİ': return 'dükkan';
                        case 'KAZAN DAİRESİ': return 'kazan dairesi';
                        case 'KONUT':
                        default: return 'daire';
                    }
                })();
                if (n > 0) lines.push({ text: `${n} ${tipiLbl}`, bold: true });
            } else {
                let birimTipi = comp.birimTipi || '';
                if (!birimTipi && manager) {
                    const sayac = manager.components.find(c => c.type === 'sayac' && c.iliskiliVanaId === comp.id);
                    if (sayac?.birimTipi) birimTipi = sayac.birimTipi;
                }
                if (!birimTipi) birimTipi = 'KONUT';
                const lblLines = getBirimLabelLines(birimTipi, comp.birimNo || '');
                lblLines.forEach(t => { if (t) lines.push({ text: t, bold: true }); });
            }
            if (comp.flans) lines.push({ text: 'Flanşlı Vana', sub: true });
        } else if (vt === 'EMNIYET') {
            if (!comp.flans) lines.push({ text: 'Emn.V', sub: true });
            if (comp.flans) lines.push({ text: 'Flanşlı Emn.V', sub: true });
            if (comp.vanaCap) lines.push({ text: comp.vanaCap, sub: true });
        } else if (vt === 'SELENOID') {
            if (!comp.flans) lines.push({ text: 'Selenoid Vana', sub: true });
            if (comp.flans) lines.push({ text: 'Flanşlı Selenoid Vana', sub: true });
        } else if (vt === 'YANBINA' || vt === 'YAN_BINA') {
            if (!comp.flans) lines.push({ text: 'Yan Bina Vanası', bold: true });
            if (comp.flans) lines.push({ text: 'Flanşlı Yan Bina Vanası', bold: true });
            if (comp.tesisatNo) lines.push({ text: `Tesisat No: ${comp.tesisatNo}`, sub: true });
            const d = parseFloat(comp.daireSayisi) || 0;
            const dk = parseFloat(comp.dukkanSayisi) || 0;
            const ek = parseFloat(comp.ekDebi) || 0;
            if (d > 0) lines.push({ text: `Daire Sayısı: ${d}`, sub: true });
            if (dk > 0) lines.push({ text: `Dükkan Sayısı: ${dk}`, sub: true });
            const n = d + dk;
            const faktorluDebi = n > 0 ? getCizelge6Debi(n, 0, true) : 0;
            const toplamDebi = faktorluDebi + ek;
            if (ek > 0) lines.push({ text: `Ek Debi: ${ek.toFixed(2)} m³/h`, sub: true });
            if (toplamDebi > 0) lines.push({ text: `Toplam Debi: ${toplamDebi.toFixed(2)} m³/h`, sub: true });
        }

        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        if (lines.length === 0) return;

        const angle = (comp.rotation || 0) * Math.PI / 180;
        let nX = -Math.sin(angle);
        let nY = Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const hw = 10;
        const cx = sc.x;
        const cy = sc.y;

        let ax, ay;
        if (off.ax != null) {
            ax = off.ax;
            ay = off.ay;
        } else {
            ax = sc.x + nX * (hw + 12 / zoom);
            ay = sc.y + nY * (hw + 12 / zoom);
        }

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts, 3);
    },

    _drawRegulatorObjLabel(ctx, comp, manager, opts) {
        const { t, zoom, currentFloorId } = opts;
        const sc = this._scrPos(comp, t);
        const off = _getOffset(comp.id, currentFloorId);

        const lines = [];
        const baslik = comp.shutOff !== false ? 'Shut-Off Regülatör' : 'Regülatör';
        lines.push({ text: baslik, bold: true });

        const marka = (comp.marka ?? 'ESKA').toString().trim() || 'ESKA';
        const model = (comp.model ?? 'ERG').toString().trim() || 'ERG';
        lines.push({ text: `${marka} - ${model}`, sub: true });

        let girisBasinc = null;
        if (manager && comp.bagliBoruId) {
            const bagliBoru = manager.findPipeById(comp.bagliBoruId);
            if (bagliBoru?.basinc != null) girisBasinc = Math.round(Number(bagliBoru.basinc));
        }
        const cikis = comp.cikisBasinc || '21';
        const basincSatir = girisBasinc != null
            ? `${girisBasinc}►${cikis} mbar`
            : `${cikis} mbar`;
        lines.push({ text: basincSatir, sub: true });

        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        const angle = (comp.rotation || 0) * Math.PI / 180;
        let nX = -Math.sin(angle);
        let nY = Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const hw = 10;
        const cx = sc.x;
        const cy = sc.y;

        let ax, ay;
        if (off.ax != null) {
            ax = off.ax;
            ay = off.ay;
        } else {
            ax = sc.x + nX * (hw + 12 / zoom);
            ay = sc.y + nY * (hw + 12 / zoom);
        }

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts, 10);
    },

    _drawFittingObjLabel(ctx, comp, manager, opts) {
        const { t, zoom, currentFloorId } = opts;
        const sc = this._scrPos(comp, t);
        const off = _getOffset(comp.id, currentFloorId);

        const lines = [];
        let baslik;
        switch (comp.type) {
            case 'filtre':
                baslik = comp.konik ? 'Konik Filtre' : 'Filtre';
                break;
            case 'izolasyon_flansi': baslik = 'İzolasyon Flanşı'; break;
            case 'kompansator': baslik = 'Kompansatör'; break;
            case 'manometre': baslik = 'Manometre'; break;
            case 'topraklama': baslik = 'TOPRAKLAMA'; break;
            default: baslik = '';
        }
        if (baslik) lines.push({ text: baslik, bold: comp.type === 'topraklama' });

        if (comp.type === 'topraklama' && comp.topraklamaYontemi) {
            lines.push({ text: comp.topraklamaYontemi, sub: true });
        }

        const marka = (comp.marka ?? '').toString().trim();
        const model = (comp.model ?? '').toString().trim();
        if (marka || model) {
            const txt = [marka, model].filter(Boolean).join(' - ');
            lines.push({ text: txt, sub: true });
        }

        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        const angle = (comp.rotation || 0) * Math.PI / 180;
        let nX = -Math.sin(angle);
        let nY = Math.cos(angle);
        if (nY > 0) { nX = -nX; nY = -nY; }

        const hw = 10;
        const cx = sc.x;
        const cy = sc.y;

        let ax, ay;
        if (off.ax != null) {
            ax = off.ax;
            ay = off.ay;
        } else {
            ax = sc.x + nX * (hw + 12 / zoom);
            ay = sc.y + nY * (hw + 12 / zoom);
        }

        this._drawObjLabelBox(ctx, comp.id, ax, ay, cx, cy, lines, opts, 8);
    },

    _drawKutuObjLabel(ctx, comp, opts) {
        const { t, currentFloorId } = opts;
        const sc = this._scrPos(comp, t);
        const off = _getOffset(comp.id, currentFloorId);

        const lines = [];

        lines.push({ text: comp.kutuTipi || 'S.K.', bold: true });
        if (comp.kutuBasinc) lines.push({ text: `${comp.kutuBasinc} mbar`, sub: true });

        const yon = comp.cikisYonu || 'sag';
        const yonLabel = yon === 'sag' ? 'Yandan Çıkış'
            : yon === 'alt' ? 'Alttan Çıkış'
                : yon === 'ust' ? 'Üstten Çıkış'
                    : '';
        if (yonLabel) lines.push({ text: yonLabel, sub: true });

        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        const cx = sc.x;
        const cy = sc.y;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx || 0, off.dy || 0, lines, opts, 10);
    },

    _drawCihazObjLabel(ctx, comp, opts) {
        const { t, manager, currentFloorId } = opts;
        const sc = this._scrPosEffective(comp, t, manager);
        const off = _getOffset(comp.id, currentFloorId);

        const lines = [];

        if (comp.cihazTipi === 'KOMBI') {
            const yogusmali = comp.yogusmali !== false;
            const baca = comp.bacaTipi || 'Hermetik';
            lines.push({ text: yogusmali ? `Yoğuşmalı ${baca} Kombi` : `${baca} Kombi`, bold: true });
            if (comp.marka) lines.push({ text: comp.marka, sub: true });
            if (comp.model) lines.push({ text: comp.model, sub: true });
            const kcal = parseFloat(comp.kapasiteKcal);
            const kw = parseFloat(comp.kapasiteKW);
            if (!isNaN(kcal) && kcal > 0) {
                const kwStr = (!isNaN(kw) && kw > 0) ? ` (${kw} kW)` : '';
                lines.push({ text: `${Math.round(kcal).toLocaleString('tr-TR')} kcal/h${kwStr}`, sub: true });
            }
            if (comp.yedekCihaz) lines.push({ text: 'Yedek Cihaz', sub: true });
        } else if (comp.cihazTipi === 'OCAK') {
            lines.push({ text: 'Evsel Ocak', bold: true });
            if (comp.marka) lines.push({ text: comp.marka, sub: true });
            if (comp.model) lines.push({ text: comp.model, sub: true });
            if (comp.yedekCihaz) lines.push({ text: 'Yedek Cihaz', sub: true });
        } else if (['SOBA', 'SOFBEN', 'KAZAN', 'TICARI'].includes(comp.cihazTipi)) {
            const NAMES = { SOBA: 'Soba', SOFBEN: 'Şofben', KAZAN: 'Kazan', TICARI: 'Ticari Cihaz' };
            const baca = comp.bacaTipi ? `${comp.bacaTipi} ` : '';
            lines.push({ text: `${baca}${NAMES[comp.cihazTipi]}`, bold: true });
            if (comp.marka) lines.push({ text: comp.marka, sub: true });
            if (comp.model) lines.push({ text: comp.model, sub: true });
            const kcal = parseFloat(comp.kapasiteKcal);
            const kw = parseFloat(comp.kapasiteKW);
            if (!isNaN(kcal) && kcal > 0) {
                const kwStr = (!isNaN(kw) && kw > 0) ? ` (${kw} kW)` : '';
                lines.push({ text: `${Math.round(kcal).toLocaleString('tr-TR')} kcal/h${kwStr}`, sub: true });
            }
            if (comp.yedekCihaz) lines.push({ text: 'Yedek Cihaz', sub: true });
        } else {
            return;
        }

        if (comp.description) {
            comp.description.trimEnd().split('\n').forEach(line => {
                lines.push({ text: line.trimEnd() || ' ', sub: true });
            });
        }

        if (lines.length === 0) return;

        const config = CIHAZ_TIPLERI[comp.cihazTipi] || { width: 30, height: 30 };
        const _hCm = parseFloat(comp.heightCm);
        const actualH = (config.resizable && Number.isFinite(_hCm) && _hCm > 0) ? _hCm : (config.height || config.width);
        const hh = actualH / 2;

        const cx = sc.x;
        const cy = sc.y;

        this._drawObjLabelBoxBelow(ctx, comp.id, cx, cy, off.dx || 0, off.dy || 0, lines, opts, hh);
    },
};

// ─── YENİDEN YERLEŞİM FONKSİYONLARI (KAT BAZLI) ──────────────────────────────

function _rectsOverlap(a, b, pad) {
    return !(a.bx + a.bw + pad <= b.bx ||
        b.bx + b.bw + pad <= a.bx ||
        a.by + a.bh + pad <= b.by ||
        b.by + b.bh + pad <= a.by);
}

function _getLabelAnchor(obj, t, manager) {
    if (obj.type === 'boru' || (obj.p1 && obj.p2)) {
        const z1 = (obj.p1?.z || 0) * t, z2 = (obj.p2?.z || 0) * t;
        const sx1 = obj.p1.x + z1, sy1 = obj.p1.y - z1;
        const sx2 = obj.p2.x + z2, sy2 = obj.p2.y - z2;
        return { x: (sx1 + sx2) / 2, y: (sy1 + sy2) / 2 };
    }
    if (obj.type === 'cihaz' && state.is3DPerspectiveActive && manager
        && LabelMixin?._scrPosForCihazPersp) {
        const persp = LabelMixin._scrPosForCihazPersp(obj, manager, t);
        if (persp) return persp;
    }
    const zOff = (obj.z || 0) * t;
    return { x: (obj.x || 0) + zOff, y: (obj.y || 0) - zOff };
}

function _estimateBoxSize(id, fallbackW, fallbackH) {
    const bb = _labelBBoxes.find(b => b.id === id);
    if (bb) return { bw: bb.bw, bh: bb.bh, style: bb.style };
    return { bw: fallbackW, bh: fallbackH, style: 'left-center' };
}

function _bboxToStoredOffset(bx, by, bw, bh, style) {
    if (style === 'top-center') return { ax: bx + bw / 2, ay: by };
    return { ax: bx, ay: by + bh / 2 };
}

function _collectPipeLabelCandidates(manager, t, floorId) {
    const out = [];
    if (!manager?.pipes) return out;
    const { hatMap } = computeHatGroups(manager.pipes, manager.components);

    const pipeMap = new Map(manager.pipes.filter(p => p.floorId === floorId).map(p => [p.id, p]));
    const childrenIdx = new Map();
    manager.pipes.forEach(p => {
        if (p.floorId !== floorId) return;
        if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId) {
            const par = p.baslangicBaglanti.hedefId;
            if (!childrenIdx.has(par)) childrenIdx.set(par, []);
            childrenIdx.get(par).push(p.id);
        }
    });

    const visitedSec = new Set();
    manager.pipes.forEach(seedPipe => {
        if (seedPipe.floorId !== floorId) return;
        if (!seedPipe.p1 || !seedPipe.p2) return;
        if (visitedSec.has(seedPipe.id)) return;
        const hatNo = hatMap.get(seedPipe.id);
        if (hatNo == null) return;

        const group = [];
        const queue = [seedPipe.id];
        while (queue.length > 0) {
            const id = queue.shift();
            if (visitedSec.has(id)) continue;
            if (hatMap.get(id) !== hatNo) continue;
            const p = pipeMap.get(id);
            if (!p) continue;
            visitedSec.add(id);
            group.push(p);

            const par = p.baslangicBaglanti?.tip === 'boru' ? p.baslangicBaglanti.hedefId : null;
            if (par && hatMap.get(par) === hatNo) queue.push(par);
            (childrenIdx.get(id) || []).forEach(cid => {
                if (hatMap.get(cid) === hatNo) queue.push(cid);
            });
        }

        if (group.length === 0) return;

        group.sort((a, b) => {
            const dxa = a.p2.x - a.p1.x, dya = a.p2.y - a.p1.y;
            const dxb = b.p2.x - b.p1.x, dyb = b.p2.y - b.p1.y;
            const lenA = Math.hypot(dxa, dya);
            const lenB = Math.hypot(dxb, dyb);
            const isHorizA = Math.abs(dxa) > Math.abs(dya) ? 1 : 0;
            const isHorizB = Math.abs(dxb) > Math.abs(dyb) ? 1 : 0;

            if (isHorizA !== isHorizB) return isHorizB - isHorizA;
            return lenB - lenA;
        });

        out.push({ obj: group[0], type: 'boru', hatNo, pipeGroup: group });
    });
    return out;
}

function _collectAllCandidates(manager, floorId) {
    const cands = [];
    const pipeCands = _collectPipeLabelCandidates(manager, 0, floorId);
    pipeCands.forEach(c => cands.push(c));
    if (manager?.components) {
        manager.components.forEach(c => {
            if (c.floorId !== floorId) return;
            if (c.type === 'vana') cands.push({ obj: c, type: 'vana' });
            else if (c.type === 'cihaz') cands.push({ obj: c, type: 'cihaz' });
            else if (c.type === 'sayac') cands.push({ obj: c, type: 'sayac' });
            else if (c.type === 'servis_kutusu') cands.push({ obj: c, type: 'servis_kutusu' });
            else if (c.type === 'regulator') cands.push({ obj: c, type: 'regulator' });
            else if (c.type === 'filtre' || c.type === 'izolasyon_flansi'
                || c.type === 'kompansator' || c.type === 'manometre'
                || c.type === 'topraklama') {
                cands.push({ obj: c, type: c.type });
            }
        });
    }
    return cands;
}

function _buildObstacleRects(manager, t, floorId) {
    const rects = [];
    if (manager?.components) {
        for (const c of manager.components) {
            if (c.floorId !== floorId) continue;
            
            if (c.type === 'baca') {
                if (typeof c.getBoundingBox === 'function') {
                    const bb = c.getBoundingBox();
                    if (isFinite(bb.minX) && isFinite(bb.maxX)) {
                        const zOff = (c.z || 0) * t;
                        rects.push({
                            id: c.id,
                            bx: bb.minX + zOff,
                            by: bb.minY - zOff,
                            bw: bb.maxX - bb.minX,
                            bh: bb.maxY - bb.minY,
                        });
                    }
                }
                continue;
            }
            const zOff = (c.z || 0) * t;
            const sx = (c.x || 0) + zOff, sy = (c.y || 0) - zOff;
            let bw = 0, bh = 0;
            if (c.type === 'sayac') { bw = SAYAC_CONFIG.width; bh = SAYAC_CONFIG.height; }
            else if (c.type === 'servis_kutusu') { bw = SERVIS_KUTUSU_CONFIG.width; bh = SERVIS_KUTUSU_CONFIG.height; }
            else if (c.type === 'cihaz') {
                const cfg = CIHAZ_TIPLERI[c.cihazTipi] || { width: 40, height: 40 };
                bw = cfg.width; bh = cfg.height;
            }
            else if (c.type === 'vana' || c.type === 'regulator'
                || c.type === 'filtre' || c.type === 'izolasyon_flansi'
                || c.type === 'kompansator' || c.type === 'manometre'
                || c.type === 'topraklama') { bw = 18; bh = 18; }
            
            if (bw > 0) rects.push({ id: c.id, bx: sx - bw / 2, by: sy - bh / 2, bw, bh });
        }
    }
    return rects;
}

function _buildPipeSegments(manager, t, floorId) {
    const segs = [];
    if (!manager?.pipes) return segs;
    for (const p of manager.pipes) {
        if (p.floorId !== floorId || !p.p1 || !p.p2) continue;
        const z1 = (p.p1.z || 0) * t, z2 = (p.p2.z || 0) * t;
        segs.push({
            x1: p.p1.x + z1, y1: p.p1.y - z1,
            x2: p.p2.x + z2, y2: p.p2.y - z2,
            pipeId: p.id
        });
    }
    return segs;
}

function _segOverlapsSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax, d1y = by - ay;
    const d2x = dx - cx, d2y = dy - cy;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return false;
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function _segmentIntersectsRect(seg, bx, by, bw, bh, ignoreId) {
    if (ignoreId && seg.pipeId === ignoreId) return false;
    const { x1, y1, x2, y2 } = seg;
    if (Math.max(x1, x2) < bx || Math.min(x1, x2) > bx + bw ||
        Math.max(y1, y2) < by || Math.min(y1, y2) > by + bh) return false;
    const inside = (px, py) => px >= bx && px <= bx + bw && py >= by && py <= by + bh;
    if (inside(x1, y1) || inside(x2, y2)) return true;
    return (
        _segOverlapsSeg(x1, y1, x2, y2, bx, by, bx + bw, by) ||
        _segOverlapsSeg(x1, y1, x2, y2, bx + bw, by, bx + bw, by + bh) ||
        _segOverlapsSeg(x1, y1, x2, y2, bx + bw, by + bh, bx, by + bh) ||
        _segOverlapsSeg(x1, y1, x2, y2, bx, by + bh, bx, by)
    );
}

function _getHostPipeDir(obj, manager, t) {
    if (!obj) return null;
    if (obj.type === 'cihaz' || obj.type === 'sayac' || obj.type === 'servis_kutusu') {
        return null;
    }
    if (obj.type === 'boru' && obj.p1 && obj.p2) {
        const z1 = (obj.p1.z || 0) * t, z2 = (obj.p2.z || 0) * t;
        const dx = (obj.p2.x + z2) - (obj.p1.x + z1);
        const dy = (obj.p2.y - z2) - (obj.p1.y - z1);
        const L = Math.hypot(dx, dy);
        if (L < 0.01) return null;
        return { ux: dx / L, uy: dy / L };
    }
    if (obj.bagliBoruId && manager?.findPipeById) {
        const p = manager.findPipeById(obj.bagliBoruId);
        if (p && p.p1 && p.p2) {
            const z1 = (p.p1.z || 0) * t, z2 = (p.p2.z || 0) * t;
            const dx = (p.p2.x + z2) - (p.p1.x + z1);
            const dy = (p.p2.y - z2) - (p.p1.y - z1);
            const L = Math.hypot(dx, dy);
            if (L > 0.01) return { ux: dx / L, uy: dy / L };
        }
    }
    if (obj.rotation != null) {
        const rad = ((obj.rotation || 0) * Math.PI) / 180;
        return { ux: -Math.sin(rad), uy: Math.cos(rad) };
    }
    return null;
}

function _getObjectHalfSize(obj) {
    if (obj.type === 'sayac') return { hw: (SAYAC_CONFIG?.width || 40) / 2, hh: (SAYAC_CONFIG?.height || 40) / 2 };
    if (obj.type === 'servis_kutusu') return { hw: (SERVIS_KUTUSU_CONFIG?.width || 40) / 2, hh: (SERVIS_KUTUSU_CONFIG?.height || 40) / 2 };
    if (obj.type === 'cihaz') {
        const cfg = CIHAZ_TIPLERI[obj.cihazTipi] || { width: 40, height: 40 };
        return { hw: cfg.width / 2, hh: cfg.height / 2 };
    }
    if (obj.type === 'vana' || obj.type === 'regulator'
        || obj.type === 'filtre' || obj.type === 'izolasyon_flansi'
        || obj.type === 'kompansator' || obj.type === 'manometre'
        || obj.type === 'topraklama') return { hw: 9, hh: 9 };
    return { hw: 4, hh: 4 };
}

function _computeSceneCenter(manager, t, floorId) {
    let sx = 0, sy = 0, n = 0;
    if (manager?.components) {
        manager.components.forEach(c => {
            if (c.floorId !== floorId) return;
            if (c.x == null || c.y == null) return;
            const zOff = (c.z || 0) * t;
            sx += c.x + zOff;
            sy += c.y - zOff;
            n++;
        });
    }
    const walls = state.walls || [];
    for (const w of walls) {
        if (w.floorId !== floorId) continue;
        if (!w.p1 || !w.p2) continue;
        sx += (w.p1.x + w.p2.x) / 2;
        sy += (w.p1.y + w.p2.y) / 2;
        n++;
    }
    if (n === 0) return { x: 0, y: 0 };
    return { x: sx / n, y: sy / n };
}

function _findBestLocalPosition(c, obstacleRects, pipeSegments, neighborAnchors, archObstacles) {
    const roomRects = archObstacles?.roomNameRects || null;
    const wallSegs = archObstacles?.wallSegs || null;
    const GAP = 20;

    const objHalf = _getObjectHalfSize(c.obj);
    const lblHW = c.bw / 2;
    const lblHH = c.bh / 2;

    const baseOffY = objHalf.hh + GAP + lblHH;
    const baseOffX = objHalf.hw + GAP + lblHW;

    const directions = [
        { id: 'bottom', nx: 0, ny: 1, align: 'vertical', pref: ['cihaz', 'sayac', 'servis_kutusu'], dirPenalty: 0 },
        { id: 'right', nx: 1, ny: 0, align: 'horizontal', pref: ['vana', 'regulator', 'filtre', 'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama', 'cihaz', 'sayac'], dirPenalty: 0 },
        { id: 'top', nx: 0, ny: -1, align: 'vertical', pref: ['cihaz', 'sayac', 'servis_kutusu'], dirPenalty: 10 },
        { id: 'left', nx: -1, ny: 0, align: 'horizontal', pref: ['cihaz', 'sayac'], dirPenalty: 20 },
        { id: 'top-rs', nx: 0.45, ny: -0.89, align: 'free', pref: [], dirPenalty: 80 },
        { id: 'bottom-rs', nx: 0.45, ny: 0.89, align: 'free', pref: [], dirPenalty: 80 },
        { id: 'right-us', nx: 0.89, ny: -0.45, align: 'free', pref: [], dirPenalty: 80 },
        { id: 'right-ds', nx: 0.89, ny: 0.45, align: 'free', pref: [], dirPenalty: 80 },
        { id: 'br', nx: 0.7071, ny: 0.7071, align: 'free', pref: [], dirPenalty: 150 },
        { id: 'tr', nx: 0.7071, ny: -0.7071, align: 'free', pref: [], dirPenalty: 150 },
        { id: 'bl', nx: -0.7071, ny: 0.7071, align: 'free', pref: [], dirPenalty: 150 },
        { id: 'tl', nx: -0.7071, ny: -0.7071, align: 'free', pref: [], dirPenalty: 150 },
    ];

    const ignorePipeId = c.obj.type === 'boru' ? c.obj.id : null;
    const distances = [1.0, 1.3, 1.7, 2.2, 3.0];

    let bestScore = Infinity;
    let bestSpot = { cx: c.anchor.x + baseOffX, cy: c.anchor.y + baseOffY, align: 'vertical' };

    for (const d of distances) {
        for (const dir of directions) {
            const candCX = c.anchor.x + dir.nx * baseOffX * d;
            const candCY = c.anchor.y + dir.ny * baseOffY * d;
            const candBx = candCX - lblHW;
            const candBy = candCY - lblHH;

            let penalty = dir.dirPenalty;
            // Çok daha yumuşak mesafe cezası
            penalty += (d - 1.0) * 25;

            let isPref = dir.pref.includes(c.obj.type);

            if (c.hostPipeDir) {
                const par = Math.abs(dir.nx * c.hostPipeDir.ux + dir.ny * c.hostPipeDir.uy);
                if (par > 0.85) penalty += 8000;
                else if (par < 0.2) { penalty -= 60; if (c.obj.type !== 'boru') isPref = true; }
                else penalty += par * 150;
            }

            if (!isPref) penalty += 60;

            if (neighborAnchors && neighborAnchors.length) {
                const NEAR = 100;
                for (const na of neighborAnchors) {
                    const ndx = na.x - c.anchor.x;
                    const ndy = na.y - c.anchor.y;
                    const dist = Math.hypot(ndx, ndy);
                    if (dist < 1 || dist > NEAR) continue;
                    const ux = ndx / dist;
                    const uy = ndy / dist;
                    const toward = dir.nx * ux + dir.ny * uy;
                    const w = (NEAR - dist) / NEAR;
                    penalty += toward * w * 200;
                }
            }

            for (const obs of obstacleRects) {
                if (obs.id && c.obj && obs.id === c.obj.id) continue;
                if (!(candBx + c.bw <= obs.bx || candBx >= obs.bx + obs.bw || candBy + c.bh <= obs.by || candBy >= obs.by + obs.bh)) {
                    penalty += 8000;
                }
            }

            const lineStartX = c.anchor.x + dir.nx * (objHalf.hw + 3);
            const lineStartY = c.anchor.y + dir.ny * (objHalf.hh + 3);
            
            for (const obs of obstacleRects) {
                if (obs.id && c.obj && obs.id === c.obj.id) continue;
                if (_segIntersectsRect(lineStartX, lineStartY, candCX, candCY, obs.bx, obs.by, obs.bw, obs.bh)) {
                    penalty += 8000;
                    break;
                }
            }

            if (pipeSegments && pipeSegments.length) {
                for (const seg of pipeSegments) {
                    if (_segmentIntersectsRect(seg, candBx, candBy, c.bw, c.bh, ignorePipeId)) {
                        penalty += 8000;
                    }
                    if (ignorePipeId !== seg.pipeId) {
                        if (_segOverlapsSeg(lineStartX, lineStartY, candCX, candCY, seg.x1, seg.y1, seg.x2, seg.y2)) {
                            penalty += 8000;
                        }
                    }
                }
            }

            if (roomRects) {
                for (const rr of roomRects) {
                    const ox = Math.max(0, Math.min(candBx + c.bw, rr.bx + rr.bw) - Math.max(candBx, rr.bx));
                    const oy = Math.max(0, Math.min(candBy + c.bh, rr.by + rr.bh) - Math.max(candBy, rr.by));
                    if (ox > 0 && oy > 0) penalty += 9000 + ox * oy;
                }
            }

            if (wallSegs) {
                for (const w of wallSegs) {
                    if (_wallTouchesRect(w, candBx, candBy, c.bw, c.bh)) penalty += 20;
                }
            }

            if (penalty < bestScore) {
                bestScore = penalty;
                bestSpot = { cx: candCX, cy: candCY, align: dir.align };
            }
            if (penalty < 200) break;
        }
        if (bestScore < 200) break;
    }

    bestSpot.score = bestScore;
    return bestSpot;
}

function _sign(val) { return val >= 0 ? 1 : -1; }

// FNV-1a 32-bit string hash — kararlı sapma yönü üretmek için
function _hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}

function _rectKey(r) {
    return r.id || r.obj?.id || `@${r.bx.toFixed(2)},${r.by.toFixed(2)}`;
}

// İki rect tam üst üste düştüğünde Math.random yerine kimlik temelli
// deterministik + antisimetrik bir yön ver — relayout her çağrıda aynı sonucu üretsin.
function _stableTieBreak(r1, r2) {
    const k1 = _rectKey(r1);
    const k2 = _rectKey(r2);
    const k1First = k1 < k2;
    const seed = _hashStr(k1First ? `${k1}|${k2}` : `${k2}|${k1}`);
    const angle = (seed % 3600) / 3600 * Math.PI * 2;
    const sign = k1First ? 1 : -1;
    return { dx: Math.cos(angle) * 2.5 * sign, dy: Math.sin(angle) * 2.5 * sign };
}

function _getPushVector(r1, r2, pad) {
    const cx1 = r1.bx + r1.bw / 2;
    const cy1 = r1.by + r1.bh / 2;
    const cx2 = r2.bx + r2.bw / 2;
    const cy2 = r2.by + r2.bh / 2;

    let dx = cx1 - cx2;
    let dy = cy1 - cy2;

    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        const tie = _stableTieBreak(r1, r2);
        dx = tie.dx;
        dy = tie.dy;
    }

    const minHDist = (r1.bw + r2.bw) / 2 + pad;
    const minVDist = (r1.bh + r2.bh) / 2 + pad;

    if (Math.abs(dx) < minHDist && Math.abs(dy) < minVDist) {
        const overlapX = minHDist - Math.abs(dx);
        const overlapY = minVDist - Math.abs(dy);

        if (r1.align === 'vertical' && r2.align === 'vertical') {
            return { x: dx * 0.05, y: _sign(dy) * overlapY };
        }

        if (overlapX < overlapY) {
            return { x: _sign(dx) * overlapX, y: dy * 0.1 };
        } else {
            return { x: dx * 0.1, y: _sign(dy) * overlapY };
        }
    }
    return { x: 0, y: 0 };
}

function _strictSeparation(cands, obstacleRects, pad, archObstacles) {
    const roomRects = archObstacles?.roomNameRects || null;
    const MAX_PASS = 60;
    for (let pass = 0; pass < MAX_PASS; pass++) {
        let anyOverlap = false;

        for (let i = 0; i < cands.length; i++) {
            const c = cands[i];
            for (const obs of obstacleRects) {
                if (obs.id && c.obj && obs.id === c.obj.id) continue;
                const push = _getPushVector(c, obs, pad);
                if (push.x !== 0 || push.y !== 0) {
                    c.bx += push.x; c.by += push.y;
                    anyOverlap = true;
                }
            }
            if (roomRects) {
                for (const rr of roomRects) {
                    const push = _getPushVector(c, rr, pad * 1.5);
                    if (push.x !== 0 || push.y !== 0) {
                        c.bx += push.x; c.by += push.y;
                        anyOverlap = true;
                    }
                }
            }
            for (let j = 0; j < cands.length; j++) {
                if (i === j) continue;
                const other = cands[j];
                const push = _getPushVector(c, other, pad);
                if (push.x !== 0 || push.y !== 0) {
                    c.bx += push.x * 0.5; c.by += push.y * 0.5;
                    other.bx -= push.x * 0.5; other.by -= push.y * 0.5;
                    anyOverlap = true;
                }
            }
        }
        if (!anyOverlap) break;
    }
}

async function _relaxSystem(cands, obstacleRects, iterCount, onProgress, isAnimated, pipeSegments, archObstacles) {
    const PAD = 8;
    const roomRects = archObstacles?.roomNameRects || null;

    for (let iter = 0; iter < iterCount; iter++) {
        for (let i = 0; i < cands.length; i++) {
            const c = cands[i];
            let forceX = 0, forceY = 0;
            const cx = c.bx + c.bw / 2;
            const cy = c.by + c.bh / 2;

            if (pipeSegments && pipeSegments.length) {
                const ignoreId = c.obj.type === 'boru' ? c.obj.id : null;
                const halfDiag = Math.hypot(c.bw, c.bh) / 2;
                const safeDist = halfDiag + 4;
                for (const seg of pipeSegments) {
                    if (ignoreId && seg.pipeId === ignoreId) continue;
                    const sdx = seg.x2 - seg.x1;
                    const sdy = seg.y2 - seg.y1;
                    const segLen2 = sdx * sdx + sdy * sdy;
                    if (segLen2 < 0.01) continue;
                    let tt = ((cx - seg.x1) * sdx + (cy - seg.y1) * sdy) / segLen2;
                    if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
                    const px = seg.x1 + tt * sdx;
                    const py = seg.y1 + tt * sdy;
                    const ddx = cx - px;
                    const ddy = cy - py;
                    const dist = Math.hypot(ddx, ddy);
                    if (dist > 0.01 && dist < safeDist) {
                        const k = (safeDist - dist) / dist * 0.4;
                        forceX += ddx * k;
                        forceY += ddy * k;
                    }
                }
            }

            let dx = c.idealCX - cx;
            let dy = c.idealCY - cy;

            if (c.align === 'vertical') {
                forceX += dx * 0.7;
                forceY += dy * 0.15;
            } else if (c.align === 'horizontal') {
                forceX += dx * 0.15;
                forceY += dy * 0.7;
            } else {
                forceX += dx * 0.3;
                forceY += dy * 0.3;
            }

            for (const obs of obstacleRects) {
                if (obs.id && c.obj && obs.id === c.obj.id) continue;
                const push = _getPushVector(c, obs, PAD);
                forceX += push.x * 0.6;
                forceY += push.y * 0.6;
            }

            if (roomRects) {
                for (const rr of roomRects) {
                    const push = _getPushVector(c, rr, PAD * 1.5);
                    forceX += push.x * 1.2;
                    forceY += push.y * 1.2;
                }
            }

            for (let j = 0; j < cands.length; j++) {
                if (i === j) continue;
                const other = cands[j];
                const push = _getPushVector(c, other, PAD);
                forceX += push.x * 0.5;
                forceY += push.y * 0.5;
            }

            const maxSpeed = 25;
            const speed = Math.hypot(forceX, forceY);
            if (speed > maxSpeed) {
                forceX = (forceX / speed) * maxSpeed;
                forceY = (forceY / speed) * maxSpeed;
            }

            c.bx += forceX; c.by += forceY;
        }

        if (isAnimated && iter % 2 === 0) {
            cands.forEach(c => {
                const off = _bboxToStoredOffset(c.bx, c.by, c.bw, c.bh, c.style);
                const prev = _getOffset(c.obj.id, c.floorId);
                _setOffset(c.obj.id, c.floorId, { ax: off.ax, ay: off.ay, dir: prev.dir ?? 0 });
            });
            if (onProgress) onProgress(iter + 1, iterCount);
            await new Promise(res => setTimeout(res, 12));
        }
    }

    _strictSeparation(cands, obstacleRects, PAD, archObstacles);
}

export async function relayoutAllLabels(manager, mode, onProgress) {
    if (!manager) return;
    
    const currentFloorId = state.currentFloor?.id || null;
    if (!currentFloorId) return;
    
    const t = state.viewBlendFactor || 0;

    let cands = _collectAllCandidates(manager, currentFloorId);
    if (cands.length === 0) return;

    // Her adaya floorId ekle
    cands.forEach(c => c.floorId = currentFloorId);

    const obstacleRects = _buildObstacleRects(manager, t, currentFloorId);
    const pipeSegments = _buildPipeSegments(manager, t, currentFloorId);
    const sceneCenter = _computeSceneCenter(manager, t, currentFloorId);
    const archObstacles = {
        roomNameRects: _buildRoomNameRects(currentFloorId),
        wallSegs: _buildWallSegments(currentFloorId),
    };

    cands.forEach(c => {
        c.anchor = _getLabelAnchor(c.obj, t, manager);
        const sz = _estimateBoxSize(c.obj.id, 80, 40);
        c.bw = sz.bw; c.bh = sz.bh; c.style = sz.style;
        c.hostPipeDir = _getHostPipeDir(c.obj, manager, t);
    });

    const _typeOrder = { sayac: 0, servis_kutusu: 0, vana: 1, regulator: 1, cihaz: 1, filtre: 1, izolasyon_flansi: 1, kompansator: 1, manometre: 1, topraklama: 1, boru: 2 };
    cands.sort((a, b) => (_typeOrder[a.obj.type] ?? 3) - (_typeOrder[b.obj.type] ?? 3));

    const runningObstacles = obstacleRects.slice();
    const _neighborAnchorsAll = cands
        .filter(n => n.obj.type !== 'boru' && n.anchor)
        .map(n => ({ x: n.anchor.x, y: n.anchor.y, _src: n }));

    cands.forEach(c => {
        const neighborAnchors = c.obj.type === 'boru' ? null : _neighborAnchorsAll.filter(na => na._src !== c);

        if (c.obj.type === 'boru' && c.pipeGroup && c.pipeGroup.length > 0) {
            let bestPipe = c.pipeGroup[0];
            let bestSpot = null;
            let minScore = Infinity;

            for (let i = 0; i < Math.min(c.pipeGroup.length, 5); i++) {
                const p = c.pipeGroup[i];
                c.obj = p;
                c.anchor = _getLabelAnchor(p, t, manager);
                c.hostPipeDir = _getHostPipeDir(p, manager, t);
                const spot = _findBestLocalPosition(c, runningObstacles, pipeSegments, neighborAnchors, archObstacles);

                spot.score += i * 50;

                if (spot.score < minScore) {
                    minScore = spot.score;
                    bestSpot = spot;
                    bestPipe = p;
                }

                if (minScore < 100) break;
            }

            c.obj = bestPipe;
            c.anchor = _getLabelAnchor(bestPipe, t, manager);
            c.hostPipeDir = _getHostPipeDir(bestPipe, manager, t);
            c.align = bestSpot.align;
            c.idealCX = bestSpot.cx;
            c.idealCY = bestSpot.cy;
        } else {
            const bestSpot = _findBestLocalPosition(c, runningObstacles, pipeSegments, neighborAnchors, archObstacles);
            c.align = bestSpot.align;
            c.idealCX = bestSpot.cx;
            c.idealCY = bestSpot.cy;
        }

        c.bx = c.idealCX - c.bw / 2;
        c.by = c.idealCY - c.bh / 2;
        runningObstacles.push({ id: c.obj.id + '_label', bx: c.bx, by: c.by, bw: c.bw, bh: c.bh });
    });

    const isAnimated = mode === 'free';
    const iterCount = 35;

    await _relaxSystem(cands, obstacleRects, iterCount, onProgress, isAnimated, pipeSegments, archObstacles);

    const _chosenPipeIds = new Set();
    cands.forEach(c => {
        if (c.obj?.type === 'boru') _chosenPipeIds.add(c.obj.id);
    });
    cands.forEach(c => {
        if (c.obj?.type !== 'boru' || !c.pipeGroup) return;
        for (const p of c.pipeGroup) {
            if (p.id === c.obj.id) continue;
            if (_chosenPipeIds.has(p.id)) continue;
            _deleteOffset(p.id, currentFloorId);
            _deleteAutoPos(p.id, currentFloorId);
        }
    });

    cands.forEach(c => {
        const off = _bboxToStoredOffset(c.bx, c.by, c.bw, c.bh, c.style);
        const prev = _getOffset(c.obj.id, currentFloorId);
        _setOffset(c.obj.id, currentFloorId, { ax: off.ax, ay: off.ay, dir: prev.dir ?? 0 });
        _deleteAutoPos(c.obj.id, currentFloorId);
    });

    if (onProgress && !isAnimated) onProgress('done', 0);
    
    // Render'ı tetikle
    if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
            if (state.renderCallback) state.renderCallback();
        });
    }
    
    await new Promise(res => setTimeout(res, 0));
}