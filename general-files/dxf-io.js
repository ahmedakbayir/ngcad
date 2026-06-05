// general-files/dxf-io.js
// DXF (AutoCAD) içe aktarma altyapısı.
//
// Tasarım kararı (sağlam + geliştirilebilir):
//   1) Parser ham veriyi normalize edilmiş entity dizisine indirger
//      (LINE / LWPOLYLINE / POLYLINE / ARC / CIRCLE / INSERT-burada patlatılmaz).
//      Her entity {layer, type, ...geometry} biçiminde.
//   2) Ölçek/öteleme/Y-flip ayrı tutulur; uygulanma her zaman render anında
//      yapılır → kullanıcı kalibrasyonu değiştirince yeniden parse gerekmez.
//   3) Veri state.dxfImport altında saklanır; JSON save/load'a aynen girer.
//   4) İleride: walls/doors üretici (transformer'lar) bu veri üzerinde
//      bağımsız modüller olarak çalışır; parser/render katmanı değişmez.

import { state, setState } from './main.js';

// AutoCAD $INSUNITS sabitleri → cm çarpan tablosu.
// Bilinmeyen / 0 = "Unitless" — kullanıcıya soracağız.
const INSUNITS_TABLE = {
    0:  { label: 'Birimsiz',     scale: null },  // Manuel kalibrasyon şart
    1:  { label: 'Inç',          scale: 2.54 },
    2:  { label: 'Feet',         scale: 30.48 },
    4:  { label: 'Milimetre',    scale: 0.1 },
    5:  { label: 'Santimetre',   scale: 1.0 },
    6:  { label: 'Metre',        scale: 100 },
    14: { label: 'Desimetre',    scale: 10 },
};

/**
 * dxf-parser kütüphanesini gerekirse CDN'den çeker (sadece ilk DXF açılışında).
 * Hem global (UMD) hem ESM yolunu destekler.
 */
let _ParserCtor = null;
async function getDxfParser() {
    if (_ParserCtor) return _ParserCtor;
    if (typeof window !== 'undefined' && window.DxfParser) {
        _ParserCtor = window.DxfParser;
        return _ParserCtor;
    }
    const mod = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/+esm');
    _ParserCtor = mod.default || mod.DxfParser || mod;
    return _ParserCtor;
}

/**
 * Bir DXF metnini parse edip normalize edilmiş bir nesne döner.
 * Bu fonksiyon state'i değiştirmez; sadece veriyi üretir.
 *
 * @param {string} dxfText
 * @param {{fileName?: string}} opts
 * @returns {Promise<object>}
 */
export async function parseDxfText(dxfText, opts = {}) {
    const Parser = await getDxfParser();
    const parser = new Parser();
    const dxf = parser.parseSync(dxfText);
    if (!dxf) throw new Error('DXF dosyası parse edilemedi.');

    // 1) Header'dan $INSUNITS oku
    const insUnits = (dxf.header && dxf.header['$INSUNITS']) ?? 0;
    const unitInfo = INSUNITS_TABLE[insUnits] || { label: `Bilinmeyen(${insUnits})`, scale: null };

    // 2) Layer tablosu
    const rawLayers = (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) || {};
    const layerMap = new Map();
    for (const [name, data] of Object.entries(rawLayers)) {
        layerMap.set(name, {
            name,
            color: aciToHex(data.color),
            visible: true,
            entityCount: 0,
        });
    }

    // 3) Entity normalizasyonu
    const entities = [];
    const ensureLayer = (lyrName) => {
        if (!layerMap.has(lyrName)) {
            layerMap.set(lyrName, { name: lyrName, color: '#cccccc', visible: true, entityCount: 0 });
        }
        return layerMap.get(lyrName);
    };

    for (const e of (dxf.entities || [])) {
        const layer = e.layer || '0';
        const lyrInfo = ensureLayer(layer);
        const colorHex = e.color !== undefined ? aciToHex(e.color) : null; // entity-level override
        const baseColor = colorHex || lyrInfo.color;

        let normalized = null;

        switch (e.type) {
            case 'LINE':
                if (e.vertices && e.vertices.length >= 2) {
                    normalized = {
                        type: 'LINE',
                        layer,
                        color: baseColor,
                        x1: e.vertices[0].x, y1: e.vertices[0].y,
                        x2: e.vertices[1].x, y2: e.vertices[1].y,
                    };
                }
                break;

            case 'LWPOLYLINE':
            case 'POLYLINE': {
                const verts = (e.vertices || []).map(v => ({ x: v.x, y: v.y }));
                if (verts.length >= 2) {
                    normalized = {
                        type: 'POLYLINE',
                        layer,
                        color: baseColor,
                        closed: !!e.shape || !!e.closed,
                        vertices: verts,
                    };
                }
                break;
            }

            case 'ARC':
                normalized = {
                    type: 'ARC',
                    layer,
                    color: baseColor,
                    cx: e.center.x, cy: e.center.y,
                    r: e.radius,
                    a1: e.startAngle, // radyan
                    a2: e.endAngle,   // radyan
                };
                break;

            case 'CIRCLE':
                normalized = {
                    type: 'CIRCLE',
                    layer,
                    color: baseColor,
                    cx: e.center.x, cy: e.center.y,
                    r: e.radius,
                };
                break;

            // TEXT / MTEXT: kullanıcı isteğiyle DXF'ten alınmıyor — gürültü oluşturuyor,
            // duvar tespitine katkısı yok. İlerde gerekirse option ile geri eklenebilir.

            // INSERT, SPLINE, HATCH vb. ileri sürümde eklenecek.
            default:
                break;
        }

        if (normalized) {
            entities.push(normalized);
            lyrInfo.entityCount++;
        }
    }

    // 4) Bounding box
    const bbox = computeBBox(entities);

    // 5) Layer listesi: boş layer'lar (entity sayısı = 0) default unchecked gelir.
    //    Görünür kalmaları gereksiz ekran kirliliği yaratır; kullanıcı isterse açar.
    const layers = Array.from(layerMap.values())
        .map(l => ({ ...l, visible: l.entityCount > 0 }))
        .sort((a, b) => b.entityCount - a.entityCount || a.name.localeCompare(b.name));

    return {
        fileName: opts.fileName || 'dxf',
        units: unitInfo.label,
        unitsConfirmed: false,
        scale: unitInfo.scale || 1.0,
        autoScale: unitInfo.scale,
        offset: { x: 0, y: 0 },
        rotation: 0, // radyan — DXF bbox merkezi etrafında dönüş
        bbox,
        layers,
        entities,
        visible: true,
        loadedAt: new Date().toISOString(),
    };
}

/**
 * Bir DXF dosyasını okur, parse eder, state'e yerleştirir ve modal'ı açar.
 * @param {File} file
 */
export async function loadDxfFile(file) {
    const text = await file.text();
    const originalName = file.name.replace(/\.[^.]+$/, '');
    const dxfData = await parseDxfText(text, { fileName: originalName });
    setState({ dxfImport: dxfData });
    const mod = await import('./dxf-import-panel.js');
    mod.showDxfImportPanel();
}

/**
 * Mevcut DXF üzerine yeni dosyanın entity ve layer'larını EKLER.
 * Ölçek/offset/unitsConfirmed mevcudundan korunur (iki DXF aynı koordinat
 * sistemindeymiş gibi davranır). Aynı isimde layer varsa entity sayısı toplanır.
 * Bbox yeniden hesaplanır.
 */
/**
 * Yeni DXF'i MEVCUDUN üstüne ek grup olarak ekler — modal AÇMAZ.
 * Eklenen entity'ler ana canvas'ta mevcut DXF ile aynı ölçek/offset kullanılarak
 * arka planda görünür. fileName birleştirilir, bbox yeniden hesaplanır.
 */
export async function appendDxfFile(file) {
    if (!state.dxfImport) {
        // Mevcut DXF yoksa ekleme yerine normal yükleme akışı (modal açılır)
        return loadDxfFile(file);
    }
    const text = await file.text();
    const originalName = file.name.replace(/\.[^.]+$/, '');
    const fresh = await parseDxfText(text, { fileName: originalName });

    // Layer birleştirme: isme göre. Yeni layer varsa eklenir.
    const layersByName = new Map();
    for (const l of state.dxfImport.layers) layersByName.set(l.name, { ...l });
    for (const l of fresh.layers) {
        if (layersByName.has(l.name)) {
            const exist = layersByName.get(l.name);
            exist.entityCount = (exist.entityCount || 0) + (l.entityCount || 0);
        } else {
            layersByName.set(l.name, { ...l });
        }
    }
    const mergedLayers = Array.from(layersByName.values());

    // Entity ve bbox birleştir
    const mergedEntities = [...state.dxfImport.entities, ...fresh.entities];
    const mergedBBox = computeBBox(mergedEntities);

    setState({
        dxfImport: {
            ...state.dxfImport,
            fileName: `${state.dxfImport.fileName}+${fresh.fileName}`,
            entities: mergedEntities,
            layers: mergedLayers,
            bbox: mergedBBox || state.dxfImport.bbox,
            // scale / offset / unitsConfirmed mevcudundan korunur
        },
    });

    // Modal AÇMA — direkt ana 2D canvas'ı yenile, kullanıcı sahnede görür
    try {
        const d = await import('../draw/draw2d.js');
        d.draw2D && d.draw2D();
    } catch {}
}

// --- yardımcılar ---

/**
 * AutoCAD Color Index → yaklaşık hex.
 * Tam ACI paleti devasa olduğundan, sık kullanılan renklerin yaklaşımı.
 * 7 = "BYLAYER varsayılan" — siyah/beyaz tema bağımsız orta gri verir.
 */
function aciToHex(aci) {
    if (aci === undefined || aci === null) return '#cccccc';
    const palette = {
        1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
        5: '#0000ff', 6: '#ff00ff', 7: '#cccccc', 8: '#808080',
        9: '#c0c0c0', 30: '#ff8000', 250: '#333333', 251: '#505050',
        252: '#696969', 253: '#828282', 254: '#bebebe', 255: '#ffffff',
    };
    return palette[aci] || '#cccccc';
}

function computeBBox(entities) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const consume = (x, y) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };
    for (const e of entities) {
        switch (e.type) {
            case 'LINE':
                consume(e.x1, e.y1); consume(e.x2, e.y2); break;
            case 'POLYLINE':
                for (const v of e.vertices) consume(v.x, v.y); break;
            case 'ARC':
            case 'CIRCLE':
                consume(e.cx - e.r, e.cy - e.r); consume(e.cx + e.r, e.cy + e.r); break;
        }
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
}

/**
 * DXF kalibrasyonunu (scale + offset + flipY) tek noktadan günceller.
 * Render zamanı bunları okur, entity verisi değişmez.
 */
export function updateDxfCalibration({ scale, offset, unitsConfirmed }) {
    if (!state.dxfImport) return;
    const next = { ...state.dxfImport };
    if (scale !== undefined) next.scale = scale;
    if (offset !== undefined) next.offset = offset;
    if (unitsConfirmed !== undefined) next.unitsConfirmed = unitsConfirmed;
    setState({ dxfImport: next });
}

/**
 * Bir layer'ın görünürlüğünü değiştirir.
 */
export function setDxfLayerVisible(layerName, visible) {
    if (!state.dxfImport) return;
    const next = { ...state.dxfImport, layers: state.dxfImport.layers.map(l => ({ ...l })) };
    const target = next.layers.find(l => l.name === layerName);
    if (target) target.visible = !!visible;
    setState({ dxfImport: next });
}

/**
 * Seçili layer'lar dışındaki tüm entity'leri ATAR (geri alınamaz).
 * "İstemediklerimi kaldır" davranışı için.
 */
export function dropDxfHiddenLayers() {
    if (!state.dxfImport) return;
    const keep = new Set(state.dxfImport.layers.filter(l => l.visible).map(l => l.name));
    const next = {
        ...state.dxfImport,
        entities: state.dxfImport.entities.filter(e => keep.has(e.layer)),
        layers: state.dxfImport.layers.filter(l => keep.has(l.name)),
    };
    setState({ dxfImport: next });
}

/**
 * DXF veri kümesini tamamen kaldır.
 */
export function clearDxfImport() {
    setState({ dxfImport: null });
}

/**
 * Bir DXF dikdörtgeniyle eşleşen entity'leri kaldırır.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} rect — DXF birimi
 * @param {boolean} crossing — true: dokunan da silinir (sağ→sol AutoCAD davranışı),
 *                              false: yalnızca tamamen içeride olanlar silinir (sol→sağ)
 * @returns {number} silinen entity sayısı
 */
export function deleteDxfEntitiesInRect(rect, crossing = false) {
    if (!state.dxfImport) return 0;
    const test = crossing ? isEntityCrossing : isEntityFullyInside;
    const before = state.dxfImport.entities.length;
    const kept = state.dxfImport.entities.filter(e => !test(e, rect));
    const removed = before - kept.length;
    if (removed === 0) return 0;

    // Layer entityCount güncelle
    const layerCounts = {};
    for (const e of kept) layerCounts[e.layer] = (layerCounts[e.layer] || 0) + 1;
    const newLayers = state.dxfImport.layers
        .map(l => ({ ...l, entityCount: layerCounts[l.name] || 0 }))
        .filter(l => l.entityCount > 0); // tamamen boşalan layer'ları çıkar

    const newBBox = computeBBox(kept);

    setState({
        dxfImport: {
            ...state.dxfImport,
            entities: kept,
            layers: newLayers,
            bbox: newBBox || state.dxfImport.bbox,
        },
    });
    return removed;
}

function isEntityFullyInside(e, rect) {
    const inside = (x, y) => x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
    switch (e.type) {
        case 'LINE':
            return inside(e.x1, e.y1) && inside(e.x2, e.y2);
        case 'POLYLINE':
            return e.vertices.every(v => inside(v.x, v.y));
        case 'CIRCLE':
        case 'ARC':
            return inside(e.cx - e.r, e.cy - e.r) && inside(e.cx + e.r, e.cy + e.r);
        case 'TEXT':
            return inside(e.x, e.y);
        default:
            return false;
    }
}

/**
 * Entity dikdörtgenle herhangi bir şekilde kesişiyor mu (crossing-selection).
 * Cohen-Sutherland'den uyarlanmış basit segment-rect testi.
 */
function isEntityCrossing(e, rect) {
    const inside = (x, y) => x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
    switch (e.type) {
        case 'LINE':
            return segIntersectsRect(e.x1, e.y1, e.x2, e.y2, rect);
        case 'POLYLINE':
            for (let i = 0; i < e.vertices.length - 1; i++) {
                const a = e.vertices[i], b = e.vertices[i + 1];
                if (segIntersectsRect(a.x, a.y, b.x, b.y, rect)) return true;
            }
            if (e.closed && e.vertices.length >= 2) {
                const a = e.vertices[e.vertices.length - 1], b = e.vertices[0];
                if (segIntersectsRect(a.x, a.y, b.x, b.y, rect)) return true;
            }
            return false;
        case 'CIRCLE':
        case 'ARC': {
            // Çember bounding box rect ile kesişiyorsa muhtemelen kesişir
            // (false positive olabilir — yay/çember tam köşede değilse)
            const cMinX = e.cx - e.r, cMaxX = e.cx + e.r;
            const cMinY = e.cy - e.r, cMaxY = e.cy + e.r;
            if (cMaxX < rect.minX || cMinX > rect.maxX) return false;
            if (cMaxY < rect.minY || cMinY > rect.maxY) return false;
            // Merkez içerideyse veya rect içinde herhangi bir köşe çemberden yakınsa kesişir.
            if (inside(e.cx, e.cy)) return true;
            // En yakın rect noktasını bul, çembere yakınlığı kontrol et
            const nx = Math.max(rect.minX, Math.min(e.cx, rect.maxX));
            const ny = Math.max(rect.minY, Math.min(e.cy, rect.maxY));
            return Math.hypot(nx - e.cx, ny - e.cy) <= e.r;
        }
        case 'TEXT':
            return inside(e.x, e.y);
        default:
            return false;
    }
}

function segIntersectsRect(x1, y1, x2, y2, rect) {
    // Liang-Barsky parametrik kırpma
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rect.minX, rect.maxX - x1, y1 - rect.minY, rect.maxY - y1];
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return false;
        } else {
            const r = q[i] / p[i];
            if (p[i] < 0) {
                if (r > t1) return false;
                if (r > t0) t0 = r;
            } else {
                if (r < t0) return false;
                if (r < t1) t1 = r;
            }
        }
    }
    return true;
}

/**
 * DXF (cm cinsinden) sahne koordinatına dönüştürür.
 * Her render call'unda çok kez çağrılacağı için ufak ve allocation'sız.
 */
export function dxfToScene(dxfX, dxfY, calib) {
    return {
        x: dxfX * calib.scale + calib.offset.x,
        y: -dxfY * calib.scale + calib.offset.y, // DXF Y-up → canvas Y-down
    };
}
