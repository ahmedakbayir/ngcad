/**
 * kolon-operations.js
 *
 * Sağ tık menüsünden çağrılan "Tesisat Çoğalt" komutları.
 *
 *  - drawColumnToAdjacentFloor(im, pipe, 'up'|'down'):
 *      Seçili borunun UÇ noktasını (pipe.p2) referans alarak komşu kata kolon
 *      çizer. Hedef kat yoksa placeholder → gerçek kata dönüştürerek oluşturur.
 *      Sonunda aktif katı yeni kata geçirir.
 *
 *  - drawColumnAllFloors(im, pipe, splitPoint):
 *      Tıklama noktasının z-relative ofsetini her gerçek katta uygulayarak
 *      mevcut tüm katları kolonla bağlar. YENİ KAT OLUŞTURMAZ. Her katın
 *      aynı (x,y) noktasında yatay boru bulunursa orada da split yapar.
 *
 *  - pasteFloorPlumbingToAllFloors(im, anchorPipe, includeInterior):
 *      Anchor borunun bulunduğu kattaki kolon HARİCİ tesisat desenini diğer
 *      tüm katlara z-ofseti ile yapıştırır.
 *        - includeInterior=false  → sadece YELLOW (branşman tarafı) borular
 *          + pre-sayaç bileşenler (vana, regülatör, filtre, …)
 *        - includeInterior=true   → YELLOW + TURQUAZ borular + tüm bileşenler
 *          (sayaç, cihaz, baca dahil)
 *      Kopyalanan birinci boru komşusu kolonun aynı (x,y,z+ofset) düğümüyle
 *      çakışıyorsa otomatik olarak orada bağlanır.
 */

import { state } from '../../general-files/main.js';
import { ensureFloorForElevation } from '../../floor/floor-panel.js';
import { switchToFloor } from '../../floor/floor-handler.js';
import { saveState } from '../../general-files/history.js';
import { Boru } from '../objects/pipe.js';
import { syncAllFloorAssignments } from '../floor-sync.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';
import { draw2D } from '../../draw/draw2d.js';

const TOL_SPLIT = 0.5;
const TOL_BODY  = 1.0;
const TOL_NODE  = 0.5;

const dist3D = (a, b) => Math.hypot(
    (a.x || 0) - (b.x || 0),
    (a.y || 0) - (b.y || 0),
    (a.z || 0) - (b.z || 0)
);

const newNodeId = () => `n_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const PRE_SAYAC_TYPES = new Set([
    'vana', 'regulator', 'filtre',
    'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama'
]);

function realFloorsSorted() {
    return (state.floors || [])
        .filter(f => !f.isPlaceholder)
        .sort((a, b) => a.bottomElevation - b.bottomElevation);
}

function floorContainingZ(z) {
    return realFloorsSorted().find(f => z >= f.bottomElevation && z < f.topElevation) || null;
}

function isKolonPipe(pipe) {
    return Math.abs((pipe.p1.z || 0) - (pipe.p2.z || 0)) > 1;
}

function makeKolon(p1Node, p2Node, sourcePipe) {
    const kolon = new Boru(p1Node, p2Node, sourcePipe?.boruTipi || 'STANDART');
    kolon.colorGroup = sourcePipe?.colorGroup || 'YELLOW';
    kolon.boruCap    = sourcePipe?.boruCap    || 'DN25';
    if (sourcePipe?.basinc != null) kolon.basinc = sourcePipe.basinc;
    return kolon;
}

/** splitAndLocate: handlePipeSplit'in sonucunda boru1/boru2'yi bulup döndürür. */
function splitAndLocate(interactionManager, pipe, splitPoint) {
    const manager = interactionManager.manager;
    const origP1 = { x: pipe.p1.x, y: pipe.p1.y, z: pipe.p1.z || 0 };
    const origP2 = { x: pipe.p2.x, y: pipe.p2.y, z: pipe.p2.z || 0 };
    interactionManager.handlePipeSplit(pipe, splitPoint, false);
    const boru1 = manager.pipes.find(p =>
        dist3D(p.p2, splitPoint) < TOL_SPLIT && dist3D(p.p1, origP1) < TOL_SPLIT
    );
    const boru2 = manager.pipes.find(p =>
        dist3D(p.p1, splitPoint) < TOL_SPLIT && dist3D(p.p2, origP2) < TOL_SPLIT
    );
    return { boru1, boru2 };
}

function findHorizontalPipeAt(manager, x, y, z, floorId) {
    for (const p of manager.pipes) {
        if (floorId && p.floorId !== floorId) continue;
        const z1 = p.p1.z || 0;
        const z2 = p.p2.z || 0;
        if (Math.abs(z1 - z) > TOL_BODY) continue;
        if (Math.abs(z2 - z) > TOL_BODY) continue;
        const proj = p.projectPoint ? p.projectPoint({ x, y, z }) : null;
        if (proj && proj.distance < TOL_BODY && proj.t > 0.001 && proj.t < 0.999) {
            return { pipe: p, projection: proj };
        }
    }
    return null;
}

// ─── 1. Üst/Alt Kata Kolon Çiz ───────────────────────────────────────────
/**
 * Seçili borunun UÇ (p2) noktasını anchor alarak komşu kata kolon çizer.
 * Hedef kat yoksa otomatik oluşturulur ve aktif kat hedef kata geçirilir.
 */
export function drawColumnToAdjacentFloor(interactionManager, pipe, direction) {
    if (!pipe) return;
    if (direction !== 'up' && direction !== 'down') return;

    const manager = interactionManager.manager;
    const floors  = realFloorsSorted();
    if (floors.length === 0) return;

    const anchorNode = pipe.p2; // "seçili hattın ucu" — referans p2
    const currentZ   = anchorNode.z || 0;
    const currentFloor = floorContainingZ(currentZ)
        || floors.find(f => f.id === pipe.floorId)
        || floors[0];
    const relativeOffset = currentZ - currentFloor.bottomElevation;
    const floorHeight    = currentFloor.topElevation - currentFloor.bottomElevation;

    let targetFloor = null;
    let targetZ;
    if (direction === 'up') {
        targetFloor = floors.find(f => f.bottomElevation === currentFloor.topElevation) || null;
        targetZ = (targetFloor ? targetFloor.bottomElevation : currentFloor.topElevation) + relativeOffset;
    } else {
        targetFloor = floors.find(f => f.topElevation === currentFloor.bottomElevation) || null;
        if (targetFloor) {
            targetZ = targetFloor.bottomElevation + relativeOffset;
        } else {
            const h = state.defaultFloorHeight || floorHeight;
            targetZ = currentFloor.bottomElevation - h + relativeOffset;
        }
    }

    saveState();

    if (!targetFloor) {
        ensureFloorForElevation(targetZ);
        targetFloor = floorContainingZ(targetZ);
    }
    if (!targetFloor) {
        console.warn('[kolon] hedef kat oluşturulamadı, targetZ=', targetZ);
        return;
    }

    const farNode = { _nodeId: newNodeId(), x: anchorNode.x, y: anchorNode.y, z: targetZ };
    const kolon = makeKolon(anchorNode, farNode, pipe);
    // Anchor pipe ile aynı düğümü paylaşıyor (p2 === anchorNode); upstream
    // referansını anchor pipe'a kuruyoruz. Anchor'ın bitisBaglanti'sini
    // boş ise kolon'a yönlendiriyoruz.
    kolon.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    if (!pipe.bitisBaglanti?.hedefId) {
        pipe.bitisBaglanti = { tip: 'boru', hedefId: kolon.id };
    }

    manager.pipes.push(kolon);
    manager.registerPipeNodes(kolon);
    manager.recomputePipeParents?.();

    syncAllFloorAssignments(manager);
    recomputeAllPressures(manager);
    manager.saveToState?.();

    // Tesisat hedef kata geçti — aktif katı güncelle ve çizimi yeni katın
    // hattın ucundan (kolonun açık ucu) başlatarak kullanıcı kalmadığı yerden
    // devam edebilsin.
    switchToFloor(targetFloor.id);
    if (typeof interactionManager.startBoruCizim === 'function') {
        interactionManager.startBoruCizim(farNode, kolon.id, 'boru', kolon.colorGroup);
    }
    draw2D();
}

// ─── 2. Tüm Katlara Kolon Dikmesi Çiz ─────────────────────────────────────
/**
 * Seçili borunun UÇ noktasını (pipe.p2) anchor alarak mevcut tüm katları
 * aynı z-relative ofsette kolonla bağlar. YENİ KAT OLUŞTURMAZ.
 * Diğer katların aynı (x,y)'sinde yatay boru varsa split eder.
 */
export function drawColumnAllFloors(interactionManager, pipe) {
    if (!pipe) return;
    const manager = interactionManager.manager;
    const floors  = realFloorsSorted();
    if (floors.length < 2) return;

    const anchorNode = pipe.p2; // "seçili hattın ucu"
    const currentZ   = anchorNode.z || 0;
    const currentFloor = floorContainingZ(currentZ)
        || floors.find(f => f.id === pipe.floorId)
        || floors[0];
    const relativeOffset = currentZ - currentFloor.bottomElevation;

    saveState();

    // Anchor #1: mevcut katın anchor'u doğrudan pipe.p2 (split YOK).
    const anchors = [{ floor: currentFloor, node: anchorNode }];

    for (const f of floors) {
        if (f.id === currentFloor.id) continue;
        const z = f.bottomElevation + relativeOffset;
        if (z >= f.topElevation || z < f.bottomElevation) continue;

        const hit = findHorizontalPipeAt(manager, anchorNode.x, anchorNode.y, z, f.id);
        if (hit) {
            const sp = { x: anchorNode.x, y: anchorNode.y, z };
            const { boru1: b1 } = splitAndLocate(interactionManager, hit.pipe, sp);
            if (b1) { anchors.push({ floor: f, node: b1.p2 }); continue; }
        }
        const free = { _nodeId: newNodeId(), x: anchorNode.x, y: anchorNode.y, z };
        anchors.push({ floor: f, node: free });
    }

    anchors.sort((a, b) => (a.node.z || 0) - (b.node.z || 0));

    for (let i = 0; i < anchors.length - 1; i++) {
        const lower = anchors[i].node;
        const upper = anchors[i + 1].node;
        if (Math.abs((lower.z || 0) - (upper.z || 0)) < 0.5) continue;
        const kolon = makeKolon(lower, upper, pipe);
        const upstreamHoriz = manager.pipes.find(p =>
            (p.p2NodeId === lower._nodeId || p.p1NodeId === lower._nodeId) &&
            Math.abs((p.p1.z || 0) - (p.p2.z || 0)) < 0.5
        );
        if (upstreamHoriz) {
            kolon.baslangicBaglanti = { tip: 'boru', hedefId: upstreamHoriz.id };
        }
        manager.pipes.push(kolon);
        manager.registerPipeNodes(kolon);
    }

    manager.recomputePipeParents?.();
    syncAllFloorAssignments(manager);
    recomputeAllPressures(manager);
    manager.saveToState?.();
    draw2D();
}

// ─── 3. Kattaki Branşman / Branşman+İç Tesisat — Tüm Katlara Yapıştır ────

/** Bir pipe'ın p1 veya p2 düğümü herhangi bir kolon ile paylaşılıyor mu?
 *  Eğer öyleyse { kolon, exitNode } döndürür. */
function _checkAdjacentKolon(manager, p) {
    for (const k of manager.pipes) {
        if (k === p || !isKolonPipe(k)) continue;
        if (k.p1NodeId === p.p1NodeId || k.p2NodeId === p.p1NodeId) {
            return { kolon: k, exitNode: p.p1 };
        }
        if (k.p1NodeId === p.p2NodeId || k.p2NodeId === p.p2NodeId) {
            return { kolon: k, exitNode: p.p2 };
        }
    }
    return null;
}

/** anchorPipe'ı, sonra upstream zincirini, sonra downstream zincirini gezer;
 *  herhangi bir adımda kolon ile düğüm paylaşan boru bulursa o kolonun
 *  exit node'u ile döndürür. */
function findKolonExitForAnchor(manager, anchorPipe) {
    let res = _checkAdjacentKolon(manager, anchorPipe);
    if (res) return res;

    // Upstream chain
    const upVisited = new Set([anchorPipe.id]);
    let curr = anchorPipe;
    while (true) {
        const upId = curr.baslangicBaglanti?.hedefId;
        if (!upId || upVisited.has(upId)) break;
        const next = manager.pipes.find(p => p.id === upId);
        if (!next) break;
        upVisited.add(next.id);
        res = _checkAdjacentKolon(manager, next);
        if (res) return res;
        curr = next;
    }

    // Downstream chain (anchor → children → grandchildren)
    const queue = [anchorPipe];
    const dsVisited = new Set([anchorPipe.id]);
    while (queue.length > 0) {
        const c = queue.shift();
        for (const p of manager.pipes) {
            if (dsVisited.has(p.id)) continue;
            if (p.baslangicBaglanti?.hedefId === c.id) {
                dsVisited.add(p.id);
                res = _checkAdjacentKolon(manager, p);
                if (res) return res;
                queue.push(p);
            }
        }
    }

    return null;
}

/** (x,y,z) civarında bir mevcut boru ucu (node) varsa onu döndürür. */
function findExistingNodeAt(manager, x, y, z) {
    for (const p of manager.pipes) {
        if (Math.abs(p.p1.x - x) < TOL_NODE
         && Math.abs(p.p1.y - y) < TOL_NODE
         && Math.abs((p.p1.z || 0) - z) < TOL_NODE) return p.p1;
        if (Math.abs(p.p2.x - x) < TOL_NODE
         && Math.abs(p.p2.y - y) < TOL_NODE
         && Math.abs((p.p2.z || 0) - z) < TOL_NODE) return p.p2;
    }
    return null;
}

/** Verilen exit node'undan başlayarak yatay borularla kolon-dışı downstream
 *  graf'ı toplar. includeInterior=false → sadece YELLOW; true → sayaç çıkış
 *  borusu üzerinden TURQUAZ tarafa da geçer. */
function collectDownstreamFromKolon(manager, kolon, exitNode, includeInterior) {
    const pipes = [];
    const components = [];
    const visitedPipes = new Set([kolon.id]);
    const visitedComps = new Set();
    const queue = [];

    const nodesEqual = (a, b) => a && b && (a._nodeId === b._nodeId
        || (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs((a.z || 0) - (b.z || 0)) < 0.5));

    const addPipe = (p) => {
        if (visitedPipes.has(p.id)) return;
        if (isKolonPipe(p)) return;
        if (!includeInterior && p.colorGroup !== 'YELLOW') return;
        visitedPipes.add(p.id);
        pipes.push(p);
        queue.push(p);
    };

    // Tohum: exitNode ile p1 veya p2'si çakışan yatay borular
    for (const p of manager.pipes) {
        if (nodesEqual(p.p1, exitNode) || nodesEqual(p.p2, exitNode)) addPipe(p);
    }

    while (queue.length > 0) {
        const curr = queue.shift();

        // Komşu yatay boruları ekle (paylaşılan düğüm)
        for (const p of manager.pipes) {
            if (visitedPipes.has(p.id)) continue;
            if (nodesEqual(p.p1, curr.p1) || nodesEqual(p.p1, curr.p2)
             || nodesEqual(p.p2, curr.p1) || nodesEqual(p.p2, curr.p2)) {
                addPipe(p);
            }
        }

        // Bileşenleri ekle
        for (const c of manager.components) {
            if (visitedComps.has(c.id)) continue;
            const onCurr = (c.bagliBoruId === curr.id) || (c.fleksBaglanti?.boruId === curr.id);
            if (!onCurr) continue;
            if (!includeInterior && !PRE_SAYAC_TYPES.has(c.type)) continue;
            visitedComps.add(c.id);
            components.push(c);
            // İç tesisat dahilse sayacın çıkış borusundan TURQUAZ tarafa devam
            if (includeInterior && c.type === 'sayac' && c.cikisBagliBoruId) {
                const cikis = manager.pipes.find(p => p.id === c.cikisBagliBoruId);
                if (cikis) addPipe(cikis);
            }
        }
    }
    return { pipes, components };
}

function clonedNode(nodeMap, origNode, offset) {
    const key = origNode._nodeId || `${origNode.x},${origNode.y},${origNode.z}`;
    if (nodeMap.has(key)) return nodeMap.get(key);
    const newNode = {
        _nodeId: newNodeId(),
        x: origNode.x,
        y: origNode.y,
        z: (origNode.z || 0) + offset,
    };
    nodeMap.set(key, newNode);
    return newNode;
}

/**
 * Anchor borunun bağlı olduğu kolon dikmesinden İLERİDEKİ (downstream)
 * tesisatı diğer tüm katlara yapıştırır. Kolonun kendisi kopyalanmaz.
 *   - includeInterior=false → sadece YELLOW (branşman vanasına kadar)
 *   - includeInterior=true  → sayaç + iç tesisat (TURQUAZ) dahil
 */
export function pasteFloorPlumbingToAllFloors(interactionManager, anchorPipe, includeInterior) {
    if (!anchorPipe) return;
    const manager = interactionManager.manager;
    const floors  = realFloorsSorted();
    const currentFloor = floors.find(f => f.id === anchorPipe.floorId)
        || floorContainingZ(anchorPipe.p1.z || 0);
    if (!currentFloor) return;

    // 1) Anchor'a komşu bir kolon bul. YOKSA önce drawColumnAllFloors ile ekle.
    let exitInfo = findKolonExitForAnchor(manager, anchorPipe);
    if (!exitInfo) {
        drawColumnAllFloors(interactionManager, anchorPipe);
        exitInfo = findKolonExitForAnchor(manager, anchorPipe);
    }
    if (!exitInfo) {
        console.warn('[paste-bransman] kolon bulunamadı/eklenemedi');
        return;
    }
    const { kolon, exitNode } = exitInfo;

    // 2) Kolon'dan downstream tesisatı topla (kolon hariç)
    const { pipes: srcPipes, components: srcComps } = collectDownstreamFromKolon(
        manager, kolon, exitNode, includeInterior
    );
    if (srcPipes.length === 0 && srcComps.length === 0) {
        console.warn('[paste-bransman] kopyalanacak tesisat yok');
        return;
    }

    // 3) Kolonun aynı (x,y)'de hedef kata erişip erişmediğini kontrol et.
    const hasKolonAtFloor = (tFloor) => {
        const targetZ = tFloor.bottomElevation + ((exitNode.z || 0) - currentFloor.bottomElevation);
        return manager.pipes.some(p => isKolonPipe(p) && [p.p1, p.p2].some(n =>
            Math.abs(n.x - exitNode.x) < TOL_NODE
         && Math.abs(n.y - exitNode.y) < TOL_NODE
         && Math.abs((n.z || 0) - targetZ) < TOL_NODE
        ));
    };

    saveState();

    for (const tFloor of floors) {
        if (tFloor.id === currentFloor.id) continue;
        if (!hasKolonAtFloor(tFloor)) continue; // Kolon bu kata gitmiyor → atla
        const offset = tFloor.bottomElevation - currentFloor.bottomElevation;

        const pipeIdMap = new Map(); // origId -> clone (Boru)
        const compIdMap = new Map(); // origId -> clone (component)
        const nodeMap   = new Map(); // origNode._nodeId -> clone node

        // Pre-populate: kaynak exitNode → hedef kattaki kolonun mevcut ucu.
        // Böylece klonlar oluşturulurken bu düğüm doğrudan paylaşılır;
        // sonradan yer değiştirmeye (ve sharing kırılmasına) gerek kalmaz.
        const targetExitZ   = (exitNode.z || 0) + offset;
        const targetExitNode = findExistingNodeAt(manager, exitNode.x, exitNode.y, targetExitZ);
        if (targetExitNode) {
            nodeMap.set(exitNode._nodeId, targetExitNode);
        }
        const targetKolon = targetExitNode && manager.pipes.find(p =>
            isKolonPipe(p) && (
                p.p1NodeId === targetExitNode._nodeId
             || p.p2NodeId === targetExitNode._nodeId
            )
        );

        // a) Boruları kopyala (paylaşılan iç düğümler korunur; exitNode → kolon ucu)
        for (const orig of srcPipes) {
            const p1c = clonedNode(nodeMap, orig.p1, offset);
            const p2c = clonedNode(nodeMap, orig.p2, offset);
            const clone = new Boru(p1c, p2c, orig.boruTipi);
            clone.colorGroup = orig.colorGroup;
            clone.boruCap    = orig.boruCap;
            if (orig.basinc != null) clone.basinc = orig.basinc;
            clone.floorId   = tFloor.id;
            clone.uzerindekiElemanlar = orig.uzerindekiElemanlar
                ? JSON.parse(JSON.stringify(orig.uzerindekiElemanlar)) : [];
            pipeIdMap.set(orig.id, clone);
            manager.pipes.push(clone);
            manager.registerPipeNodes(clone);
        }

        // b) Topolojiyi yeniden kur (klonlar arası referanslar + kolon ucu)
        for (const orig of srcPipes) {
            const clone = pipeIdMap.get(orig.id);
            if (!clone) continue;
            const bb = orig.baslangicBaglanti;
            const eb = orig.bitisBaglanti;
            if (bb?.tip === 'boru' && bb.hedefId) {
                const target = pipeIdMap.get(bb.hedefId);
                if (target) {
                    clone.baslangicBaglanti = { tip: 'boru', hedefId: target.id };
                } else if (bb.hedefId === kolon.id && targetKolon) {
                    // Kaynak kolon referansı → hedef kattaki kolon segmentine remap
                    clone.baslangicBaglanti = { tip: 'boru', hedefId: targetKolon.id };
                }
            }
            if (eb?.tip === 'boru' && eb.hedefId) {
                const target = pipeIdMap.get(eb.hedefId);
                if (target) clone.bitisBaglanti = { tip: 'boru', hedefId: target.id };
            }
            // Klonun p1/p2'si targetExitNode ile paylaşılıyorsa ve henüz upstream
            // referansı yoksa otomatik olarak hedef kolon segmentine bağla.
            if (targetKolon && !clone.baslangicBaglanti?.hedefId) {
                if (clone.p1NodeId === targetExitNode?._nodeId
                 || clone.p2NodeId === targetExitNode?._nodeId) {
                    clone.baslangicBaglanti = { tip: 'boru', hedefId: targetKolon.id };
                }
            }
        }

        // c) Bileşenleri kopyala ve referansları yeniden eşle
        for (const orig of srcComps) {
            const cloneComp = JSON.parse(JSON.stringify(orig));
            cloneComp.id = `${orig.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            cloneComp.z  = (orig.z || 0) + offset;
            cloneComp.floorId = tFloor.id;
            if (cloneComp.bagliBoruId) {
                const t = pipeIdMap.get(cloneComp.bagliBoruId);
                cloneComp.bagliBoruId = t ? t.id : null;
            }
            if (cloneComp.fleksBaglanti?.boruId) {
                const t = pipeIdMap.get(cloneComp.fleksBaglanti.boruId);
                if (t) cloneComp.fleksBaglanti.boruId = t.id;
                else   cloneComp.fleksBaglanti = null;
            }
            if (cloneComp.cikisBagliBoruId) {
                const t = pipeIdMap.get(cloneComp.cikisBagliBoruId);
                cloneComp.cikisBagliBoruId = t ? t.id : null;
            }
            if (cloneComp.iliskiliVanaId) {
                const t = compIdMap.get(cloneComp.iliskiliVanaId);
                cloneComp.iliskiliVanaId = t ? t.id : null;
            }
            if (cloneComp.parentCihazId) {
                const t = compIdMap.get(cloneComp.parentCihazId);
                cloneComp.parentCihazId = t ? t.id : null;
            }
            compIdMap.set(orig.id, cloneComp);
            manager.components.push(cloneComp);
        }
    }

    manager.recomputePipeParents?.();
    syncAllFloorAssignments(manager);
    recomputeAllPressures(manager);
    manager.saveToState?.();
    draw2D();
}
