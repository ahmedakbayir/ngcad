/**
 * kolon-operations.js
 *
 * Sağ tık menüsünden çağrılan "Tesisat Çoğalt" komutları.
 * MİMARİ MANTIK: "İşin temeli kopyalamadır" kuralına göre çalışan,
 * konumsal ve sınıfsal Clipboard Copy-Paste motoru.
 */

import { state } from '../../general-files/main.js';
import { ensureFloorForElevation } from '../../floor/floor-panel.js';
import { switchToFloor } from '../../floor/floor-handler.js';
import { saveState } from '../../general-files/history.js';
import { Boru } from '../objects/pipe.js';
import { syncAllFloorAssignments } from '../floor-sync.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';
import { draw2D } from '../../draw/draw2d.js';

// handlePipeCopy fonksiyonunu .call() ile tetiklemek için import ediyoruz
import { handlePipeCopy } from './keyboard-handler.js';

// Klonlanan ekipmanların sınıf fonksiyonlarını korumak için importlar
import { Vana } from '../objects/valve.js';
import { Sayac } from '../objects/meter.js';
import { Regulator } from '../objects/regulator.js';
import { Cihaz } from '../objects/device.js';
import { Baca } from '../objects/chimney.js';
import { PipeFitting } from '../objects/pipe-fitting.js';

const TOL_NODE = 0.5;

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

function makeComponent(data) {
    switch (data.type) {
        case 'vana': return Vana.fromJSON(data);
        case 'sayac': return Sayac.fromJSON(data);
        case 'regulator': return Regulator.fromJSON(data);
        case 'cihaz': return Cihaz.fromJSON(data);
        case 'baca': return Baca.fromJSON(data);
        default: return PipeFitting.fromJSON(data);
    }
}

/**
 * 🌟 ORTAK DİKEY KOLON İNŞA MOTORU
 * Verilen (x,y) koordinatında, projenin kat dilimleme mimarisine tam uyumlu,
 * kat kat bölünmüş kesintisiz dikey kolon dikmesi oluşturur.
 */
function buildFullRiserColumn(manager, x, y, zOffset, sourcePipe) {
    const floors = realFloorsSorted();
    const riserNodes = floors.map(f => {
        const z = f.bottomElevation + zOffset;
        return { floorId: f.id, node: manager.getOrCreateNodeAt(x, y, z, 0.5) };
    }).sort((a, b) => a.node.z - b.node.z);

    for (let i = 0; i < riserNodes.length - 1; i++) {
        const lower = riserNodes[i].node;
        const upper = riserNodes[i + 1].node;

        const exists = manager.pipes.some(p => isKolonPipe(p) && 
            ((p.p1NodeId === lower._nodeId && p.p2NodeId === upper._nodeId) || 
             (p.p2NodeId === lower._nodeId && p.p1NodeId === upper._nodeId))
        );
        if (exists) continue;

        const kolon = new Boru(lower, upper, sourcePipe?.boruTipi || 'STANDART');
        kolon.colorGroup = 'YELLOW';
        kolon.boruCap    = sourcePipe?.boruCap || 'DN25';
        kolon.floorId    = riserNodes[i + 1].floorId;

        const lowerPipe = manager.pipes.find(p => (p.p2NodeId === lower._nodeId || p.p1NodeId === lower._nodeId) && p.id !== kolon.id);
        if (lowerPipe) {
            kolon.baslangicBaglanti = { tip: 'boru', hedefId: lowerPipe.id };
        }

        manager.pipes.push(kolon);
        manager.registerPipeNodes(kolon);
    }
}

// ─── 1. Üst/Alt Kata Kolon Çiz ───────────────────────────────────────────
export function drawColumnToAdjacentFloor(interactionManager, pipe, direction) {
    if (!pipe) return;
    const manager = interactionManager.manager;
    const floors  = realFloorsSorted();
    if (floors.length === 0) return;

    const anchorNode = pipe.p2; 
    const currentZ   = anchorNode.z || 0;
    const currentFloor = floorContainingZ(currentZ) || floors[0];
    const relativeOffset = currentZ - currentFloor.bottomElevation;

    let targetFloor = null;
    if (direction === 'up') {
        targetFloor = floors.find(f => f.bottomElevation === currentFloor.topElevation) || null;
    } else {
        targetFloor = floors.find(f => f.topElevation === currentFloor.bottomElevation) || null;
    }

    const targetZ = targetFloor ? (targetFloor.bottomElevation + relativeOffset) : (direction === 'up' ? currentFloor.topElevation + relativeOffset : currentFloor.bottomElevation - 300 + relativeOffset);

    saveState();

    if (!targetFloor) {
        ensureFloorForElevation(targetZ);
        targetFloor = floorContainingZ(targetZ);
    }
    if (!targetFloor) return;

    const farNode = manager.createNode(anchorNode.x, anchorNode.y, targetZ);
    const kolon = new Boru(anchorNode, farNode, pipe.boruTipi || 'STANDART');
    kolon.colorGroup = pipe.colorGroup || 'YELLOW';
    kolon.boruCap    = pipe.boruCap    || 'DN25';
    kolon.floorId    = targetFloor.id;
    
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

    switchToFloor(targetFloor.id);
    if (typeof interactionManager.startBoruCizim === 'function') {
        interactionManager.startBoruCizim(farNode, kolon.id, 'boru', kolon.colorGroup);
    }
    draw2D();
}

// ─── 2. Tüm Katlara Kolon Dikmesi Çiz ─────────────────────────────────────
export function drawColumnAllFloors(interactionManager, pipe) {
    if (!pipe) return;
    const manager = interactionManager.manager;
    const floors  = realFloorsSorted();
    if (floors.length < 2) return;

    const anchorNode = pipe.p2;
    const currentFloor = floors.find(f => f.id === pipe.floorId) || floors[0];
    const zOffset = anchorNode.z - currentFloor.bottomElevation;

    saveState();
    buildFullRiserColumn(manager, anchorNode.x, anchorNode.y, zOffset, pipe);

    manager.recomputePipeParents?.();
    syncAllFloorAssignments(manager);
    recomputeAllPressures(manager);
    manager.saveToState?.();
    draw2D();
}

// ─── 3. Branşman / Branşman + İç Tesisatı Tüm Katlara Yapıştır ───────────
export function pasteFloorPlumbingToAllFloors(interactionManager, anchorPipe, includeInterior) {
    if (!anchorPipe) return;
    const manager = interactionManager.manager;
    const floors  = realFloorsSorted();
    const currentFloor = floors.find(f => f.id === anchorPipe.floorId) || floors[0];

    // Projenin kendi dahili clipboard kopyalama motorunu çalıştırıyoruz
    interactionManager.selectedObject = anchorPipe;
    handlePipeCopy.call(interactionManager);
    
    const baseClipboard = interactionManager.copiedPipes;
    if (!baseClipboard || !baseClipboard.pipes || baseClipboard.pipes.length === 0) return;

    saveState();

    // 🌟 KURAL: "Kolon yoksa seçili hattın P1 noktasından dikme çıkarsın"
    // Döngüye başlamadan önce, seçili hattın P1 koordinatında tüm katlar boyunca dikey riser kolonunu eksiksiz inşa ediyoruz.
    const zOffset = anchorPipe.p1.z - currentFloor.bottomElevation;
    buildFullRiserColumn(manager, anchorPipe.p1.x, anchorPipe.p1.y, zOffset, anchorPipe);

    // Çoklu yapıştırma döngüsü (Tık tık kopyayı ardı ardına basar gibi)
    for (const tFloor of floors) {
        if (tFloor.id === currentFloor.id) continue;
        const offset = tFloor.bottomElevation - currentFloor.bottomElevation;

        // Her kat için panodaki kopyalama verisinin izole bir kopyasını alıyoruz
        const pasteData = JSON.parse(JSON.stringify(baseClipboard));

        // "Sayaç silindiğinde geriye ne kalıyorsa o" Kuralı (Filtreleme)
        if (!includeInterior) {
            pasteData.pipes = pasteData.pipes.filter(p => p.colorGroup !== 'TURQUAZ');
            pasteData.components = pasteData.components.filter(c => PRE_SAYAC_TYPES.has(c.type));
        }

        // Üst üste binmeleri engellemek için hedef bölgedeki eski kopyaları süpür
        const oldPipes = manager.pipes.filter(p => p.floorId === tFloor.id && !isKolonPipe(p) && pasteData.pipes.some(src => Math.abs(p.p1.x - src.p1.x) < 2.0 && Math.abs(p.p1.y - src.p1.y) < 2.0));
        const oldPipeIds = new Set(oldPipes.map(p => p.id));
        manager.components = manager.components.filter(c => c.floorId !== tFloor.id || (!oldPipeIds.has(c.bagliBoruId) && !oldPipeIds.has(c.fleksBaglanti?.boruId)));
        manager.pipes = manager.pipes.filter(p => !oldPipes.includes(p));

        const pipeIdMap = new Map();
        const compIdMap = new Map();
        const nodeMap   = new Map();

        // Hedef katın dikey kolon Z koordinatını alıp düğümü eşliyoruz
        const targetExitZ = pasteData.referencePoint.z + offset;
        const targetExitNode = manager.getOrCreateNodeAt(pasteData.referencePoint.x, pasteData.referencePoint.y, targetExitZ, 0.5);

        // Yukarıda buildFullRiserColumn ile dikey kolon garanti oluşturulduğu için hedef kolon segmentini tam konumuyla buluyoruz
        const targetKolon = manager.pipes.find(p => isKolonPipe(p) && (
            (Math.abs(p.p1.x - pasteData.referencePoint.x) < 1.0 && Math.abs(p.p1.y - pasteData.referencePoint.y) < 1.0 && Math.abs((p.p1.z || 0) - targetExitZ) < TOL_NODE) ||
            (Math.abs(p.p2.x - pasteData.referencePoint.x) < 1.0 && Math.abs(p.p2.y - pasteData.referencePoint.y) < 1.0 && Math.abs((p.p2.z || 0) - targetExitZ) < TOL_NODE)
        ));

        // İlk borunun başlangıç ucunu hedef katın kolon düğümüne kilitliyoruz
        const originalAnchorPipe = baseClipboard.pipes[0];
        if (originalAnchorPipe) {
            nodeMap.set(originalAnchorPipe.p1._nodeId, targetExitNode);
        }

        const getClonedNode = (origNode) => {
            if (nodeMap.has(origNode._nodeId)) return nodeMap.get(origNode._nodeId);
            const n = manager.createNode(origNode.x, origNode.y, (origNode.z || 0) + offset);
            nodeMap.set(origNode._nodeId, n);
            return n;
        };

        // a) Sınıfsal Boru Yapıştırması (Boru.fromJSON)
        const createdPipes = [];
        for (let i = 0; i < pasteData.pipes.length; i++) {
            const pipeJson = pasteData.pipes[i];
            const originalId = baseClipboard.pipes[i].id;
            const p1c = getClonedNode(pipeJson.p1);
            const p2c = getClonedNode(pipeJson.p2);
            
            pipeJson.id = `pipe_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
            pipeJson.floorId = tFloor.id;
            
            const clone = Boru.fromJSON(pipeJson, p1c, p2c);
            pipeIdMap.set(originalId, clone.id);
            createdPipes.push(clone);
            manager.pipes.push(clone);
            manager.registerPipeNodes(clone);
        }

        // b) Topolojik hat bağlarının klonlanan yeni boru ID'lerine map edilmesi
        for (let i = 0; i < createdPipes.length; i++) {
            const clone = createdPipes[i];
            const pipeJson = pasteData.pipes[i];
            
            if (pipeJson.baslangicBaglanti?.tip === 'boru') {
                const newTargetId = pipeIdMap.get(pipeJson.baslangicBaglanti.hedefId);
                clone.baslangicBaglanti = newTargetId ? { tip: 'boru', hedefId: newTargetId } : (targetKolon ? { tip: 'boru', hedefId: targetKolon.id } : null);
            }
            if (pipeJson.bitisBaglanti?.tip === 'boru') {
                const newTargetId = pipeIdMap.get(pipeJson.bitisBaglanti.hedefId);
                clone.bitisBaglanti = newTargetId ? { tip: 'boru', hedefId: newTargetId } : null;
            }
            
            // Kolona kilitlenen ilk kopyanın girişini yeni dikmeye sımsıkı bağlıyoruz
            if (i === 0 && targetKolon && (!clone.baslangicBaglanti || !clone.baslangicBaglanti.hedefId)) {
                clone.baslangicBaglanti = { tip: 'boru', gateway: true, hedefId: targetKolon.id };
            }
        }

        // c) Sınıfsal Ekipman Yapıştırması (Vana.fromJSON, Sayac.fromJSON vb.)
        const currentFloorComps = [];
        for (let i = 0; i < pasteData.components.length; i++) {
            const compWrapper = pasteData.components[i];
            const originalCompId = baseClipboard.components[i].data.id;
            const compData = compWrapper.data;
            
            compData.id = `${compWrapper.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            compData.floorId = tFloor.id;
            compData.z = (compData.z || 0) + offset;
            if (compData.center) compData.center.z = compData.z;

            if (compData.bagliBoruId) {
                const newPipeId = pipeIdMap.get(compData.bagliBoruId);
                compData.bagliBoruId = newPipeId ? newPipeId : (targetKolon ? targetKolon.id : null);
            }
            if (compData.fleksBaglanti?.boruId) {
                const newPipeId = pipeIdMap.get(compData.fleksBaglanti.boruId);
                if (newPipeId) compData.fleksBaglanti.boruId = newPipeId;
            }
            if (compData.cikisBagliBoruId) {
                const newPipeId = pipeIdMap.get(compData.cikisBagliBoruId);
                if (newPipeId) compData.cikisBagliBoruId = newPipeId;
            }

            const cloneComp = makeComponent(compData);
            compIdMap.set(originalCompId, cloneComp);
            currentFloorComps.push(cloneComp);
            manager.components.push(cloneComp);
        }

        // d) Nesnelerin kendi içindeki bağımlılık referans ID'lerinin güncellenmesi
        for (const cloneComp of currentFloorComps) {
            if (cloneComp.iliskiliVanaId && compIdMap.has(cloneComp.iliskiliVanaId)) {
                cloneComp.iliskiliVanaId = compIdMap.get(cloneComp.iliskiliVanaId).id;
            }
            if (cloneComp.parentCihazId && compIdMap.has(cloneComp.parentCihazId)) {
                cloneComp.parentCihazId = compIdMap.get(cloneComp.parentCihazId).id;
            }
        }
    }

    // Vanaların yeni konuma tam yapışması ve hidroliklerin yenilenmesi için tetikleyiciler
    manager.updateAllValvePositions?.();
    manager.recomputePipeParents();
    syncAllFloorAssignments(manager);
    recomputeAllPressures(manager);
    manager.saveToState();
    draw2D();
}