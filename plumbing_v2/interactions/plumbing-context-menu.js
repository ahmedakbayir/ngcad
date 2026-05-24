/**
 * plumbing-context-menu.js
 * Tesisat sağ tık bağlam menüsü
 */

import { saveState } from '../../general-files/history.js';
import { handlePipeCopy, handlePipeCut } from './keyboard-handler.js';
import { findBoruGovdeAt, findObjectAt } from './finders.js';
import { Boru } from '../objects/pipe.js';
import { setMode, setDrawingMode, state } from '../../general-files/main.js';
import { draw2D } from '../../draw/draw2d.js';
import { relayoutAllLabels } from '../renderer/renderer-labels.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';

let menuEl = null;
let menuState = null; // { worldPos, pipe, nokta, t, interactionManager }
let clickOutsideListener = null;

// ─── Yardımcı: borudaki t parametresini hesapla ───────────────────────────

function calcT(pipe, nokta) {
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return 0;
    const px = nokta.x - pipe.p1.x;
    const py = nokta.y - pipe.p1.y;
    const pz = (nokta.z || 0) - (pipe.p1.z || 0);
    return Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (len * len)));
}

// ─── Yardımcı: hedef boruyu döndür (sağ tıklanan veya seçili) ─────────────

function getPipeTarget(menuState) {
    if (menuState.pipe) return menuState.pipe;
    const sel = menuState.interactionManager?.selectedObject;
    if (sel && sel.type === 'boru') return sel;
    return null;
}

// ─── Ghost mod başlatma: Sayaç ────────────────────────────────────────────

function autoPlaceSayac(interactionManager) {
    interactionManager.cancelCurrentAction();
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    interactionManager.manager.startPlacement('sayac');
    setMode("plumbingV2", true);
}

// ─── İniş + Otomatik yerleştirme: Sayaç ──────────────────────────────────

function placeInisVeSayac(interactionManager, pipe) {
    saveState();
    const manager = interactionManager.manager;
    const INIS_CM = 30;
    const junctionNode = pipe.p2;

    const inisBoru = new Boru(
        junctionNode,
        { x: junctionNode.x, y: junctionNode.y, z: (junctionNode.z || 0) - INIS_CM },
        pipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = pipe.colorGroup || 'YELLOW';
    inisBoru.floorId = pipe.floorId;
    manager.pipes.push(inisBoru);
    manager.registerPipeNodes(inisBoru);
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    pipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    manager.recomputePipeParents();

    // İniş eklendi → sayacı doğrudan iniş borusunun p2 (boş ucu) ucuna yerleştir.
    // placeMeterAtOpenEnd vana/fleks ve yönü (son yatay segment) otomatik kurar.
    manager.placeMeterAtOpenEnd({
        pipe: inisBoru,
        end: 'p2',
        point: inisBoru.p2
    });
    manager.saveToState();

    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    setMode("plumbingV2", true);
}

// ─── Ghost mod başlatma: Cihaz ────────────────────────────────────────────

function autoPlaceCihaz(interactionManager, cihazTipi) {
    interactionManager.cancelCurrentAction();
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    interactionManager.manager.startPlacement('cihaz', { cihazTipi });
    setMode("plumbingV2", true);
}

// ─── İniş + Otomatik yerleştirme: Cihaz ──────────────────────────────────

function placeInisVeCihaz(interactionManager, pipe, cihazTipi) {
    saveState();
    const manager = interactionManager.manager;
    const INIS_CM = 100;
    const junctionNode = pipe.p2;

    const inisBoru = new Boru(
        junctionNode,
        { x: junctionNode.x, y: junctionNode.y, z: (junctionNode.z || 0) - INIS_CM },
        pipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = pipe.colorGroup || 'YELLOW';
    inisBoru.floorId = pipe.floorId;
    manager.pipes.push(inisBoru);
    manager.registerPipeNodes(inisBoru);
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    pipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    manager.recomputePipeParents();

    // İniş eklendi → cihazı doğrudan iniş borusunun p2 ucuna yerleştir.
    // Yön: iniş öncesindeki son yatay segmentin "dışa" yönü (continuation).
    // placeDeviceAtOpenEnd başarılı olunca setMode("select") yapar — cihaz
    // terminaldir, çizim DEVAM ETMEZ. Burada üstüne setMode("plumbingV2")
    // YAZMA, kullanıcıyı yanlışlıkla çizim moduna geri sokar.
    manager.placeDeviceAtOpenEnd(cihazTipi, {
        pipe: inisBoru,
        end: 'p2',
        point: inisBoru.p2
    });
    manager.saveToState();
}

// ─── Silme yardımcısı: pipe.p2'den BFS ile tüm downstream borular + bileşenler ──

const TOPO_TOL = 1; // cm

function collectDownstreamFromP2(startPipe, manager) {
    const pipeIds = new Set();
    const compIds = new Set();
    const comps   = [];

    const addComp = (c) => { if (!compIds.has(c.id)) { compIds.add(c.id); comps.push(c); } };

    const pipeQueue = [];
    const addPipe = (p) => {
        if (!pipeIds.has(p.id)) { pipeIds.add(p.id); pipeQueue.push(p); }
    };

    // İlk tohum: startPipe.p2'ye p1'i ile bağlı borular
    for (const p of manager.pipes) {
        if (p.id === startPipe.id) continue;
        const dz = (p.p1.z || 0) - (startPipe.p2.z || 0);
        if (Math.hypot(p.p1.x - startPipe.p2.x, p.p1.y - startPipe.p2.y, dz) < TOPO_TOL) addPipe(p);
    }
    // startPipe.p2 ucunda sayaç var mı?
    for (const c of manager.components) {
        if (c.type === 'sayac' && c.fleksBaglanti?.boruId === startPipe.id && c.fleksBaglanti?.endpoint === 'p2') {
            addComp(c);
            if (c.cikisBagliBoruId) { const np = manager.pipes.find(p => p.id === c.cikisBagliBoruId); if (np) addPipe(np); }
        }
    }

    while (pipeQueue.length > 0) {
        const curr = pipeQueue.shift();

        // Bu boruya bağlı bileşenler
        for (const c of manager.components) {
            if ((c.type === 'vana' || c.type === 'regulator' || c.type === 'filtre' || c.type === 'izolasyon_flansi' || c.type === 'kompansator' || c.type === 'manometre' || c.type === 'topraklama') && c.bagliBoruId === curr.id) { addComp(c); }
            else if ((c.type === 'sayac' || c.type === 'cihaz') && c.fleksBaglanti?.boruId === curr.id) {
                addComp(c);
                if (c.type === 'sayac' && c.cikisBagliBoruId) {
                    const np = manager.pipes.find(p => p.id === c.cikisBagliBoruId); if (np) addPipe(np);
                }
            }
        }
        // Downstream borular
        for (const p of manager.pipes) {
            if (pipeIds.has(p.id)) continue;
            const dz = (p.p1.z || 0) - (curr.p2.z || 0);
            if (Math.hypot(p.p1.x - curr.p2.x, p.p1.y - curr.p2.y, dz) < TOPO_TOL) addPipe(p);
        }
    }

    // Silinen cihazların bacaları
    const deletedCihazIds = new Set(comps.filter(c => c.type === 'cihaz').map(c => c.id));
    for (const c of manager.components) {
        if (c.type === 'baca' && deletedCihazIds.has(c.parentCihazId)) addComp(c);
    }

    return { pipeIds, compIds, comps };
}

// ─── Sayaç önündeki vananın tipini BRANSMAN yap ───────────────────────────

function sayacVanasiniDonustur(sayaclar, manager, excludeCompIds = new Set()) {
    for (const sayac of sayaclar) {
        if (!sayac.iliskiliVanaId) continue;
        const vana = manager.components.find(c => c.id === sayac.iliskiliVanaId);
        if (!vana || excludeCompIds.has(vana.id)) continue;
        vana.vanaTipi = 'BRANSMAN';
        // Sayacın iliskiliVana'sı EMNIYET olarak yaratıldığı için bransmanDebi
        // hiç set edilmemiş olabilir; computePipeDebileri parseFloat(undefined) =
        // NaN nedeniyle bu vanayı yok sayar ve hat debisi 0 görünür.
        if (vana.bransmanDebi === undefined || vana.bransmanDebi === null || vana.bransmanDebi === '') {
            vana.bransmanDebi = '3.5';
        }
    }
}

// ─── 1. Buradan Sonrasını Sil ─────────────────────────────────────────────

function deleteDownstreamFrom(pipe, manager) {
    saveState();
    const { pipeIds, compIds, comps } = collectDownstreamFromP2(pipe, manager);

    // Silinen sayaçların önündeki vanaları BRANSMAN'a çevir
    const deletedSayaclar = comps.filter(c => c.type === 'sayac');
    sayacVanasiniDonustur(deletedSayaclar, manager, compIds);

    manager.pipes      = manager.pipes.filter(p => !pipeIds.has(p.id));
    manager.components = manager.components.filter(c => !compIds.has(c.id));
    manager.recomputePipeParents();
    recomputeAllPressures(manager);
    manager.saveToState();
    draw2D();
}

// ─── 2. Kolon Tesisatını Sil ──────────────────────────────────────────────

function deleteKolonTesisati(manager) {
    saveState();

    // İç tesisat borularını belirle: her sayacın çıkış borusundan BFS
    const innerPipeIds = new Set();
    const innerCompIds = new Set();

    const sayaclar = manager.components.filter(c => c.type === 'sayac');

    for (const sayac of sayaclar) {
        innerCompIds.add(sayac.id);
        if (!sayac.cikisBagliBoruId) continue;

        const visited = new Set();
        const queue   = [];
        const addP = (p) => { if (!visited.has(p.id)) { visited.add(p.id); innerPipeIds.add(p.id); queue.push(p); } };

        const startPipe = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
        if (startPipe) addP(startPipe);

        while (queue.length > 0) {
            const curr = queue.shift();

            for (const c of manager.components) {
                if ((c.type === 'vana' || c.type === 'regulator' || c.type === 'filtre' || c.type === 'izolasyon_flansi' || c.type === 'kompansator' || c.type === 'manometre' || c.type === 'topraklama') && c.bagliBoruId === curr.id) { innerCompIds.add(c.id); }
                else if ((c.type === 'sayac' || c.type === 'cihaz') && c.fleksBaglanti?.boruId === curr.id) {
                    innerCompIds.add(c.id);
                    if (c.type === 'sayac' && c.cikisBagliBoruId) {
                        const np = manager.pipes.find(p => p.id === c.cikisBagliBoruId); if (np) addP(np);
                    }
                }
                else if (c.type === 'baca' && innerCompIds.has(c.parentCihazId)) { innerCompIds.add(c.id); }
            }
            for (const p of manager.pipes) {
                if (!visited.has(p.id)) {
                    const dz = (p.p1.z||0) - (curr.p2.z||0);
                    if (Math.hypot(p.p1.x - curr.p2.x, p.p1.y - curr.p2.y, dz) < TOPO_TOL) addP(p);
                }
            }
        }

        // Sayacın iliskiliVanaId'sini iç tesisata dahil et (BRANSMAN olarak kalacak)
        if (sayac.iliskiliVanaId) innerCompIds.add(sayac.iliskiliVanaId);

        // Sayacın giriş (fleks) borusunu kısalt ya da olduğu gibi bırak
        // Kural: ≤ 100cm ise dokunma, > 100cm ise p1'i p2'ye doğru 100cm bırakacak şekilde kes.
        if (sayac.fleksBaglanti?.boruId) {
            const inputPipe = manager.pipes.find(p => p.id === sayac.fleksBaglanti.boruId);
            if (inputPipe) {
                innerPipeIds.add(inputPipe.id); // kolonu silse bile bu boru kalacak

                const dx  = inputPipe.p2.x - inputPipe.p1.x;
                const dy  = inputPipe.p2.y - inputPipe.p1.y;
                const dz  = (inputPipe.p2.z || 0) - (inputPipe.p1.z || 0);
                const len = Math.hypot(dx, dy, dz);

                if (len > 100) {
                    // P2 (sayaç tarafı) sabit; P1'i 100cm geride konumlandır
                    const f = 100 / len;
                    inputPipe.p1.x = inputPipe.p2.x - dx * f;
                    inputPipe.p1.y = inputPipe.p2.y - dy * f;
                    if (Math.abs(dz) > 0.001) inputPipe.p1.z = (inputPipe.p2.z || 0) - dz * f;
                }

                // Üst kolona olan bağlantıyı temizle (kolun borusu silindi)
                inputPipe.baslangicBaglanti = null;
                // fleksBaglanti.boruId aynı kalır — sayaç hâlâ bu boruya bağlı
            }
        }
    }

    // İç tesisata ait bacalar (cihazlar zaten innerCompIds'te)
    for (const c of manager.components) {
        if (c.type === 'baca' && innerCompIds.has(c.parentCihazId)) innerCompIds.add(c.id);
    }

    manager.pipes      = manager.pipes.filter(p => innerPipeIds.has(p.id));
    manager.components = manager.components.filter(c => innerCompIds.has(c.id));
    manager.recomputePipeParents();
    recomputeAllPressures(manager);
    manager.saveToState();
    draw2D();
}

// ─── 3a. Verilen sayaçların iç tesisatlarını sil (sayaç + downstream) ─────
// İlişkili vana BRANSMAN olarak kalır (sayaç önündeki tek parça).

function deleteIcTesisatForSayaclar(sayaclar, manager) {
    if (!sayaclar || sayaclar.length === 0) return;
    saveState();

    const toDeletePipeIds = new Set();
    const toDeleteCompIds = new Set();

    for (const sayac of sayaclar) {
        toDeleteCompIds.add(sayac.id);

        if (!sayac.cikisBagliBoruId) continue;
        const visited = new Set();
        const queue   = [];
        const addP = (p) => { if (!visited.has(p.id)) { visited.add(p.id); toDeletePipeIds.add(p.id); queue.push(p); } };
        const startPipe = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
        if (startPipe) addP(startPipe);

        while (queue.length > 0) {
            const curr = queue.shift();
            for (const c of manager.components) {
                if ((c.type === 'vana' || c.type === 'regulator' || c.type === 'filtre' || c.type === 'izolasyon_flansi' || c.type === 'kompansator' || c.type === 'manometre' || c.type === 'topraklama') && c.bagliBoruId === curr.id) { toDeleteCompIds.add(c.id); }
                else if (c.type === 'cihaz' && c.fleksBaglanti?.boruId === curr.id) {
                    toDeleteCompIds.add(c.id);
                }
            }
            for (const p of manager.pipes) {
                if (!visited.has(p.id)) {
                    const dz = (p.p1.z||0) - (curr.p2.z||0);
                    if (Math.hypot(p.p1.x - curr.p2.x, p.p1.y - curr.p2.y, dz) < TOPO_TOL) addP(p);
                }
            }
        }
    }

    // Bacalar (silinen cihazların)
    const deletedCihazIds = new Set(
        manager.components.filter(c => c.type === 'cihaz' && toDeleteCompIds.has(c.id)).map(c => c.id)
    );
    for (const c of manager.components) {
        if (c.type === 'baca' && deletedCihazIds.has(c.parentCihazId)) toDeleteCompIds.add(c.id);
    }

    // İlişkili vanaları BRANSMAN'a çevir (silmiyoruz)
    sayacVanasiniDonustur(sayaclar, manager, toDeleteCompIds);

    manager.pipes      = manager.pipes.filter(p => !toDeletePipeIds.has(p.id));
    manager.components = manager.components.filter(c => !toDeleteCompIds.has(c.id));
    manager.recomputePipeParents();
    recomputeAllPressures(manager);
    manager.saveToState();
    draw2D();
}

// ─── Yardımcı: bileşenin bağlı olduğu boruyu bul ──────────────────────────
function componentPipeId(comp) {
    if (!comp) return null;
    if (comp.type === 'vana' || comp.type === 'regulator'
        || comp.type === 'filtre' || comp.type === 'izolasyon_flansi'
        || comp.type === 'kompansator' || comp.type === 'manometre'
        || comp.type === 'topraklama') return comp.bagliBoruId || null;
    if (comp.type === 'cihaz' || comp.type === 'sayac')   return comp.fleksBaglanti?.boruId || null;
    return null;
}

// ─── Yardımcı: bir borunun p2 ucundan downstream'deki sayaçları topla ─────
function collectDownstreamSayaclar(startPipe, manager) {
    const sayaclar = [];
    const sayacIds = new Set();
    const visitedPipes = new Set([startPipe.id]);
    const queue = [];

    const addPipe = (p) => { if (!visitedPipes.has(p.id)) { visitedPipes.add(p.id); queue.push(p); } };
    const addSayac = (s) => {
        if (sayacIds.has(s.id)) return;
        sayacIds.add(s.id); sayaclar.push(s);
        if (s.cikisBagliBoruId) {
            const np = manager.pipes.find(p => p.id === s.cikisBagliBoruId);
            if (np) addPipe(np);
        }
    };

    // Tohum: startPipe.p2 noktasından çıkan borular
    for (const p of manager.pipes) {
        if (p.id === startPipe.id) continue;
        const dz = (p.p1.z || 0) - (startPipe.p2.z || 0);
        if (Math.hypot(p.p1.x - startPipe.p2.x, p.p1.y - startPipe.p2.y, dz) < TOPO_TOL) addPipe(p);
    }
    // startPipe.p2 ucunda sayaç var mı?
    for (const c of manager.components) {
        if (c.type === 'sayac' && c.fleksBaglanti?.boruId === startPipe.id && c.fleksBaglanti?.endpoint === 'p2') {
            addSayac(c);
        }
    }

    while (queue.length > 0) {
        const curr = queue.shift();
        for (const c of manager.components) {
            if (c.type === 'sayac' && c.fleksBaglanti?.boruId === curr.id) addSayac(c);
        }
        for (const p of manager.pipes) {
            if (visitedPipes.has(p.id)) continue;
            const dz = (p.p1.z || 0) - (curr.p2.z || 0);
            if (Math.hypot(p.p1.x - curr.p2.x, p.p1.y - curr.p2.y, dz) < TOPO_TOL) addPipe(p);
        }
    }

    return sayaclar;
}

// ─── Yardımcı: "İç Tesisatı Sil" için hedef sayaç(lar)ı belirle ───────────
// Dönüş: sayaç dizisi (boş ise buton disabled).
function resolveTargetSayaclarForIcTesisat(menuState) {
    const manager = menuState.interactionManager?.manager;
    if (!manager) return [];
    // ÖNCELİK: sağ tıklanan komponent (menuState.clickedComponent).
    // Aksi takdirde stale selectedObject hedef olur ve "A'ya sağ tık → B'nin
    // iç tesisatı silinir" bug'ı ortaya çıkar.
    const sel = menuState.clickedComponent || menuState.interactionManager?.selectedObject;

    // 1) Doğrudan sayaç seçili
    if (sel && sel.type === 'sayac') return [sel];

    // 2) İç tesisat bileşeni seçili (vana/regulator/cihaz/baca)
    if (sel && sel.type !== 'boru' && sel.type !== 'sayac' && sel.type !== 'servis_kutusu') {
        let pipeId = componentPipeId(sel);
        if (!pipeId && sel.type === 'baca' && sel.parentCihazId) {
            const cihaz = manager.components.find(c => c.id === sel.parentCihazId);
            pipeId = componentPipeId(cihaz);
        }
        if (pipeId) {
            const pipe = manager.findPipeById(pipeId);
            if (pipe && pipe.parent?.tip === 'sayac') {
                const s = manager.components.find(c => c.id === pipe.parent.hedefId);
                return s ? [s] : [];
            }
        }
    }

    // 3) Boru hedefi (sağ tıklananda body hit ya da boru seçili)
    const pipe = menuState.pipe || (sel && sel.type === 'boru' ? sel : null);
    if (!pipe) return [];

    // 3a) TURQUAZ → sahibi sayaç
    if (pipe.colorGroup === 'TURQUAZ' && pipe.parent?.tip === 'sayac') {
        const s = manager.components.find(c => c.id === pipe.parent.hedefId);
        return s ? [s] : [];
    }

    // 3b) YELLOW → downstream'deki tüm sayaçlar
    if (pipe.colorGroup === 'YELLOW') {
        return collectDownstreamSayaclar(pipe, manager);
    }

    return [];
}

// ─── 4. İç Tesisatları Sil ───────────────────────────────────────────────

function deleteIcTesisatlar(manager) {
    saveState();

    const toDeletePipeIds = new Set();
    const toDeleteCompIds = new Set();

    const sayaclar = manager.components.filter(c => c.type === 'sayac');

    for (const sayac of sayaclar) {
        toDeleteCompIds.add(sayac.id);

        // Sayacın çıkış borusundan BFS ile iç tesisat borularını topla
        if (sayac.cikisBagliBoruId) {
            const visited = new Set();
            const queue   = [];
            const addP = (p) => { if (!visited.has(p.id)) { visited.add(p.id); toDeletePipeIds.add(p.id); queue.push(p); } };
            const startPipe = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
            if (startPipe) addP(startPipe);

            while (queue.length > 0) {
                const curr = queue.shift();
                for (const c of manager.components) {
                    if ((c.type === 'vana' || c.type === 'regulator' || c.type === 'filtre' || c.type === 'izolasyon_flansi' || c.type === 'kompansator' || c.type === 'manometre' || c.type === 'topraklama') && c.bagliBoruId === curr.id) { toDeleteCompIds.add(c.id); }
                    else if ((c.type === 'cihaz') && c.fleksBaglanti?.boruId === curr.id) {
                        toDeleteCompIds.add(c.id);
                    }
                }
                for (const p of manager.pipes) {
                    if (!visited.has(p.id)) {
                        const dz = (p.p1.z||0) - (curr.p2.z||0);
                        if (Math.hypot(p.p1.x - curr.p2.x, p.p1.y - curr.p2.y, dz) < TOPO_TOL) addP(p);
                    }
                }
            }
        }
    }

    // Bacalar (silinen cihazların)
    const deletedCihazIds = new Set(
        manager.components.filter(c => c.type === 'cihaz' && toDeleteCompIds.has(c.id)).map(c => c.id)
    );
    for (const c of manager.components) {
        if (c.type === 'baca' && deletedCihazIds.has(c.parentCihazId)) toDeleteCompIds.add(c.id);
    }

    // Sayaç önündeki vanaları BRANSMAN'a çevir
    sayacVanasiniDonustur(sayaclar, manager, toDeleteCompIds);

    manager.pipes      = manager.pipes.filter(p => !toDeletePipeIds.has(p.id));
    manager.components = manager.components.filter(c => !toDeleteCompIds.has(c.id));
    manager.recomputePipeParents();
    recomputeAllPressures(manager);
    manager.saveToState();
    draw2D();
}

// ─── Menü init ─────────────────────────────────────────────────────────────

function initMenu() {
    menuEl = document.getElementById('plumbing-context-menu');
    if (!menuEl) return;

    // ── Kes ────────────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-cut').addEventListener('click', () => {
        if (!menuState) return;
        const { interactionManager } = menuState;
        const pipe = getPipeTarget(menuState);
        if (pipe) {
            interactionManager.selectedObject = pipe;
            handlePipeCut.call(interactionManager);
        }
        hide();
    });

    // ── Kopyala ────────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-copy').addEventListener('click', () => {
        if (!menuState) return;
        const { interactionManager } = menuState;
        const pipe = getPipeTarget(menuState);
        if (pipe) {
            interactionManager.selectedObject = pipe;
            handlePipeCopy.call(interactionManager);
        }
        hide();
    });

    // ── Hattı Böl ──────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-split').addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, interactionManager } = menuState;
        if (pipe && nokta) interactionManager.handlePipeSplit(pipe, nokta, false);
        hide();
    });

    // ── İniş Çıkış Ekle (düşey panel) ───────────────────────────────────────
    document.getElementById('plumbing-btn-inis-cikis')?.addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, interactionManager } = menuState;
        if (pipe && nokta) {
            // Sağ tık konumu lastMousePoint'e değil, paneli orada açmak için
            // doğrudan opts ile geçiriyoruz — pipe + point bağlamı 'araya' modunu açar.
            interactionManager.toggleVerticalPanel({ pipe, point: nokta, mode: 'araya' });
        }
        hide();
    });

    // ── Vana: AKV / EMNIYET / CIHAZ / SELENOID — tıklanan noktaya ─────────
    ['AKV', 'EMNIYET', 'CIHAZ', 'SELENOID'].forEach(tip => {
        document.getElementById(`plumbing-vana-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const { pipe, nokta, t, interactionManager } = menuState;
            if (pipe && nokta) interactionManager.handleVanaPlacement({ pipe, point: nokta, t, vanaTipi: tip });
            hide();
        });
    });

    // ── Vana: BRANSMAN / YANBINA — hattın P2 ucuna ────────────────────────
    ['BRANSMAN', 'YANBINA'].forEach(tip => {
        document.getElementById(`plumbing-vana-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const pipe = getPipeTarget(menuState);
            if (pipe) menuState.interactionManager.handleVanaPlacement({ pipe, point: pipe.p2, t: 1.0, vanaTipi: tip });
            hide();
        });
    });

    // ── Regülatör — tıklanan noktaya ───────────────────────────────────────
    document.getElementById('plumbing-regulator-add')?.addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, t, interactionManager } = menuState;
        if (pipe && nokta) interactionManager.handleRegulatorPlacement({ pipe, point: nokta, t });
        hide();
    });

    // ── Sayaç — ghost mod başlat ───────────────────────────────────────────
    document.getElementById('plumbing-sayac-DIREKT')?.addEventListener('click', () => {
        if (!menuState) return;
        autoPlaceSayac(menuState.interactionManager);
        hide();
    });

    // ── İniş + Sayaç — iniş ekle, sonra ghost mod ─────────────────────────
    document.getElementById('plumbing-inis-SAYAC')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) placeInisVeSayac(menuState.interactionManager, pipe);
        hide();
    });

    // ── Cihaz — ghost mod başlat ───────────────────────────────────────────
    ['KOMBI', 'OCAK'].forEach(tip => {
        document.getElementById(`plumbing-cihaz-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            autoPlaceCihaz(menuState.interactionManager, tip);
            hide();
        });
    });

    // ── İniş + Cihaz — iniş ekle, sonra ghost mod ─────────────────────────
    ['KOMBI', 'OCAK'].forEach(tip => {
        document.getElementById(`plumbing-inis-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const pipe = getPipeTarget(menuState);
            if (pipe) placeInisVeCihaz(menuState.interactionManager, pipe, tip);
            hide();
        });
    });

    // ── Buradan Sonrasını Sil ───────────────────────────────────────────────
    document.getElementById('plumbing-btn-delete-after')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) deleteDownstreamFrom(pipe, menuState.interactionManager.manager);
        hide();
    });

    // ── Kolon Tesisatını Sil ────────────────────────────────────────────────
    document.getElementById('plumbing-btn-delete-kolon')?.addEventListener('click', () => {
        if (!menuState) return;
        deleteKolonTesisati(menuState.interactionManager.manager);
        hide();
    });

    // ── İç Tesisatı Sil (hedeflenmiş) ───────────────────────────────────────
    document.getElementById('plumbing-btn-delete-ic-single')?.addEventListener('click', () => {
        if (!menuState) return;
        const sayaclar = resolveTargetSayaclarForIcTesisat(menuState);
        if (sayaclar.length) deleteIcTesisatForSayaclar(sayaclar, menuState.interactionManager.manager);
        hide();
    });

    // ── İç Tesisatları Sil ──────────────────────────────────────────────────
    document.getElementById('plumbing-btn-delete-ic')?.addEventListener('click', () => {
        if (!menuState) return;
        deleteIcTesisatlar(menuState.interactionManager.manager);
        hide();
    });

    // ── Etiketleri Yeniden Yerleştir — tek tuş, "hat etiketlerini sona bırak" modunda
    document.getElementById('plumbing-relayout-labels')?.addEventListener('click', async () => {
        if (!menuState) return;
        const manager = menuState.interactionManager?.manager;
        hide();
        if (!manager) return;
        const toast = document.getElementById('label-relayout-toast');
        const toastText = document.getElementById('label-relayout-toast-text');
        const showToast = (msg) => { if (toast && toastText) { toastText.textContent = msg; toast.style.display = 'block'; } };
        const hideToast = () => { if (toast) toast.style.display = 'none'; };

        try {
            saveState();
            showToast('Etiketler yerleştiriliyor…');
            // Toast'un gerçekten render edilmesi için bir frame bekle, sonra ilk draw
            await new Promise(res => requestAnimationFrame(() => res()));
            draw2D();
            // Yerleşim SENKRON çalışır (ara kare çizilmez) → titreşim yok
            await relayoutAllLabels(manager, 'pipes-last');
            manager.saveToState?.();
            draw2D();
            showToast('Etiketler yerleştirildi');
            setTimeout(hideToast, 800);
        } catch (e) {
            console.error('Etiket yerleşimi hatası:', e);
            hideToast();
        }
    });
}

// ─── Göster / Gizle ────────────────────────────────────────────────────────

export function showPlumbingContextMenu(screenX, screenY, worldPos, interactionManager) {
    if (!menuEl) initMenu();
    if (!menuEl) return;

    const manager = interactionManager.manager;

    const hitResult = findBoruGovdeAt(manager, worldPos, 8);
    const pipe = hitResult ? manager.findPipeById(hitResult.boruId) : null;
    const nokta = hitResult ? hitResult.nokta : null;
    const t = (pipe && nokta) ? calcT(pipe, nokta) : 0;

    // Sağ tıklanan KOMPONENT — boru olmayan herhangi bir nesne (sayaç, vana,
    // regülatör, cihaz, baca, servis_kutusu). resolveTargetSayaclarForIcTesisat
    // bunu öncelikle kullanır; aksi takdirde stale selectedObject hedef olur ve
    // "A'ya sağ tık → B'nin iç tesisatı silinir" bug'ı oluşur.
    const hitObject = findObjectAt(manager, worldPos);
    const clickedComponent = (hitObject && hitObject.type && hitObject.type !== 'boru') ? hitObject : null;

    menuState = { worldPos, pipe, nokta, t, interactionManager, clickedComponent };

    const hasPipe = !!getPipeTarget(menuState);

    document.getElementById('plumbing-btn-cut').disabled = !hasPipe;
    document.getElementById('plumbing-btn-copy').disabled = !hasPipe;
    document.getElementById('plumbing-btn-split').disabled = !pipe; // Böl sadece gövdeye tıklanınca
    const btnInisCikis = document.getElementById('plumbing-btn-inis-cikis');
    if (btnInisCikis) btnInisCikis.disabled = !pipe; // İniş çıkış da gövde gerektirir
    document.getElementById('plumbing-btn-delete-after').disabled = !hasPipe;

    // İç Tesisatı Sil: hedef sayaç(lar) çözülebiliyorsa aktif
    const btnDeleteIcSingle = document.getElementById('plumbing-btn-delete-ic-single');
    if (btnDeleteIcSingle) {
        btnDeleteIcSingle.disabled = resolveTargetSayaclarForIcTesisat(menuState).length === 0;
    }

    menuEl.style.left = `${screenX + 5}px`;
    menuEl.style.top  = `${screenY + 5}px`;
    menuEl.style.display = 'block';

    requestAnimationFrame(() => {
        if (!menuEl) return;
        const r = menuEl.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8) menuEl.style.left = `${window.innerWidth  - r.width  - 8}px`;
        if (r.bottom > window.innerHeight - 8) menuEl.style.top  = `${window.innerHeight - r.height - 8}px`;

        // Alt menülerin ekran dışına çıkmaması: menü sağ yarıdaysa solda aç
        const r2 = menuEl.getBoundingClientRect();
        if (r2.left + r2.width / 2 > window.innerWidth / 2) {
            menuEl.classList.add('submenu-flip-left');
        } else {
            menuEl.classList.remove('submenu-flip-left');
        }
    });

    // click-outside: once:true kullanmıyoruz; menü içi tıklamalarda listener kaybolmasın
    if (clickOutsideListener) {
        window.removeEventListener('pointerdown', clickOutsideListener, { capture: true });
    }
    setTimeout(() => {
        clickOutsideListener = (ev) => {
            if (menuEl && !menuEl.contains(ev.target)) hide();
        };
        window.addEventListener('pointerdown', clickOutsideListener, { capture: true });
    }, 0);
}

function hide() {
    if (menuEl) menuEl.style.display = 'none';
    if (clickOutsideListener) {
        window.removeEventListener('pointerdown', clickOutsideListener, { capture: true });
        clickOutsideListener = null;
    }
    menuState = null;
}

export function hidePlumbingContextMenu() {
    hide();
}
