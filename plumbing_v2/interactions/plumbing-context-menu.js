/**
 * plumbing-context-menu.js
 * Tesisat sağ tık bağlam menüsü
 */

import { saveState } from '../../general-files/history.js';
import { handlePipeCopy, handlePipeCut, handleSayacIcTesisatCopy, handlePipePaste } from './keyboard-handler.js';
import { findBoruGovdeAt, findObjectAt } from './finders.js';
import { Boru } from '../objects/pipe.js';
import { setMode, setDrawingMode, setState, state } from '../../general-files/main.js';
import { draw2D } from '../../draw/draw2d.js';
import { getOrCreateNode } from '../../draw/geometry.js';
import { relayoutAllLabels } from '../renderer/renderer-labels.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';
import { getStandardBirimDebi } from '../renderer/renderer-utils.js';
import { placeMenuInViewport, setupSubmenuPositioning } from '../../menu/menu-positioning.js';
import { drawColumnToAdjacentFloor, drawColumnAllFloors, pasteFloorPlumbingToAllFloors } from './kolon-operations.js';
import { BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { ARCH_DEVICE_KINDS } from '../../architectural-objects/arch-devices.js';

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

// Sayaç hedefini bul — sağ tıklanan komponent veya seçili sayaç
function getSayacTarget(menuState) {
    if (menuState.clickedComponent && menuState.clickedComponent.type === 'sayac') {
        return menuState.clickedComponent;
    }
    const sel = menuState.interactionManager?.selectedObject;
    if (sel && sel.type === 'sayac') return sel;
    return null;
}

// ─── Yardımcı: aktif çizimde SON çizilen (commit edilmiş) borunun açık ucu
// boruBaslangic.kaynakId her tıklamadan sonra en son borunun id'sine güncellenir
// (handleBoruClick içinde); nokta o borunun çizime devam ettiği UCUDUR (genelde
// p2). Sağ-tıkla menüden vana/regülatör seçildiğinde preview/ghost segmenti
// commit ETMEZ — sadece bu son borunun ucunu döndürür ki yerleştirme oraya
// otursun, kullanıcı sonraki tıklamayla çizime kaldığı yerden devam etsin.
function lastDrawnOpenEnd(menuState) {
    const im = menuState?.interactionManager;
    if (!im || !im.boruCizimAktif || !im.boruBaslangic) return null;
    const { kaynakTip, kaynakId, nokta } = im.boruBaslangic;
    if (kaynakTip !== BAGLANTI_TIPLERI.BORU || !kaynakId || !nokta) return null;
    const pipe = im.manager.pipes.find(p => p.id === kaynakId);
    if (!pipe) return null;
    // Nokta hangi uca yakınsa o uçtan devam ediliyor demektir
    const d1 = Math.hypot(pipe.p1.x - nokta.x, pipe.p1.y - nokta.y, (pipe.p1.z || 0) - (nokta.z || 0));
    const d2 = Math.hypot(pipe.p2.x - nokta.x, pipe.p2.y - nokta.y, (pipe.p2.z || 0) - (nokta.z || 0));
    const end = d1 < d2 ? 'p1' : 'p2';
    return { pipe, end, point: pipe[end] };
}

// ─── Yardımcı: mid-line yerleştirme sonrası çizimi aynı uçtan sürdür.
// handleVanaPlacement / handleRegulatorPlacement içlerinde cancelCurrentAction
// + setMode("select") yaptığı için yerleştirme bittiğinde çizim modu kapanır;
// bunu telafi edip kullanıcının "ekleyip devam etsin" niyetine uyalım.
// Sonlanma vana / cihaz için bu çağrılmaz.
function resumeDrawingFromOpenEnd(im, openEnd) {
    if (!im || !openEnd?.pipe || !openEnd.point) return;
    if (state.currentDrawingMode !== 'KARMA') setDrawingMode('TESİSAT');
    im.startBoruCizim(
        { x: openEnd.point.x, y: openEnd.point.y, z: openEnd.point.z || 0 },
        openEnd.pipe.id,
        BAGLANTI_TIPLERI.BORU,
        openEnd.pipe.colorGroup || 'YELLOW'
    );
    im.manager.activeTool = 'boru';
    setMode('plumbingV2', true);
}

// ─── Yardımcı: kolon komutları için boru + (boru üzerinde) nokta çöz ─────
// Önce sağ tıklanan boru gövdesindeki nokta; yoksa seçili boru varsa onun
// orta noktası fallback olarak kullanılır.
function resolvePipeAndPoint(menuState) {
    if (menuState.pipe && menuState.nokta) {
        return { pipe: menuState.pipe, point: menuState.nokta };
    }
    const sel = menuState.interactionManager?.selectedObject;
    if (sel && sel.type === 'boru') {
        const mid = {
            x: (sel.p1.x + sel.p2.x) / 2,
            y: (sel.p1.y + sel.p2.y) / 2,
            z: ((sel.p1.z || 0) + (sel.p2.z || 0)) / 2,
        };
        return { pipe: sel, point: mid };
    }
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
            vana.bransmanDebi = String(getStandardBirimDebi(state.isinmaTipi));
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

// ─── 5. Seçili İç Tesisat Hariç Tüm Tesisatı Sil ──────────────────────────
function deleteExceptSelectedIcTesisat(menuState, manager) {
    const sayaclar = resolveTargetSayaclarForIcTesisat(menuState);
    if (sayaclar.length === 0) return;

    saveState();

    const keepPipeIds = new Set();
    const keepCompIds = new Set();

    // Seçili olan iç tesisat(lar)ın tüm elemanlarını koruma listesine ekle
    for (const sayac of sayaclar) {
        keepCompIds.add(sayac.id);
        if (sayac.iliskiliVanaId) {
            keepCompIds.add(sayac.iliskiliVanaId);
        }
        if (sayac.fleksBaglanti?.boruId) {
            keepPipeIds.add(sayac.fleksBaglanti.boruId);
        }

        if (!sayac.cikisBagliBoruId) continue;
        const visited = new Set();
        const queue   = [];
        const addP = (p) => { 
            if (!visited.has(p.id)) { 
                visited.add(p.id); 
                keepPipeIds.add(p.id); 
                queue.push(p); 
            } 
        };
        const startPipe = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
        if (startPipe) addP(startPipe);

        while (queue.length > 0) {
            const curr = queue.shift();
            for (const c of manager.components) {
                if ((c.type === 'vana' || c.type === 'regulator' || c.type === 'filtre' || c.type === 'izolasyon_flansi' || c.type === 'kompansator' || c.type === 'manometre' || c.type === 'topraklama') && c.bagliBoruId === curr.id) { 
                    keepCompIds.add(c.id); 
                }
                else if (c.type === 'cihaz' && c.fleksBaglanti?.boruId === curr.id) {
                    keepCompIds.add(c.id);
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

    // Korunan cihazlara bağlı bacaları da koru
    const keptCihazIds = new Set(
        manager.components.filter(c => c.type === 'cihaz' && keepCompIds.has(c.id)).map(c => c.id)
    );
    for (const c of manager.components) {
        if (c.type === 'baca' && keptCihazIds.has(c.parentCihazId)) keepCompIds.add(c.id);
    }

    // Silinen kolon/ana borularla olan bağlantı referanslarını temizle
    for (const pipe of manager.pipes) {
        if (keepPipeIds.has(pipe.id)) {
            if (pipe.baslangicBaglanti && pipe.baslangicBaglanti.tip === 'boru' && !keepPipeIds.has(pipe.baslangicBaglanti.hedefId)) {
                pipe.baslangicBaglanti = null;
            }
            if (pipe.bitisBaglanti && pipe.bitisBaglanti.tip === 'boru' && !keepPipeIds.has(pipe.bitisBaglanti.hedefId)) {
                pipe.bitisBaglanti = null;
            }
        }
    }

    // Listede olmayan her şeyi filtrele/sil
    manager.pipes      = manager.pipes.filter(p => keepPipeIds.has(p.id));
    manager.components = manager.components.filter(c => keepCompIds.has(c.id));
    
    // Değişiklikleri kaydet ve sahneyi yenile
    manager.recomputePipeParents();
    recomputeAllPressures(manager);
    manager.saveToState();
    draw2D();
}

// ─── 6. Tüm Tesisatı Sil ──────────────────────────────────────────────────
function deleteAllPlumbing(manager) {
    saveState();
    manager.clearAll(); // PlumbingManager içindeki hazır temizleme fonksiyonu
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
    // Sayaç → iç tesisat kopyala (downstream + sayaç + bağlantı bilgileri)
    // Boru   → klasik boru/zincir kopyala
    document.getElementById('plumbing-btn-copy').addEventListener('click', () => {
        if (!menuState) return;
        const { interactionManager } = menuState;
        const sayac = getSayacTarget(menuState);
        if (sayac) {
            interactionManager.selectedObject = sayac;
            handleSayacIcTesisatCopy.call(interactionManager);
            hide();
            return;
        }
        const pipe = getPipeTarget(menuState);
        if (pipe) {
            interactionManager.selectedObject = pipe;
            handlePipeCopy.call(interactionManager);
        }
        hide();
    });

    // ── Yapıştır ───────────────────────────────────────────────────────────
    // Hedef boru ucuna kopya yerleştirir. Sayaç-paste modunda boru ucundaki
    // BRANSMAN vana otomatik EMNIYET'e dönüşür, vana yoksa yeni EMNIYET eklenir.
    const btnPaste = document.getElementById('plumbing-btn-paste');
    if (btnPaste) {
        btnPaste.addEventListener('click', () => {
            if (!menuState) return;
            const { interactionManager: im, pipe, nokta, worldPos } = menuState;
            if (!im?.copiedPipes && !im?.cutPipes) { hide(); return; }
            const targetPipe = pipe || getPipeTarget(menuState);
            if (!targetPipe) { hide(); return; }
            // Sağ tıklanan noktayı boru uçlarından yakın olana snap'le; aksi takdirde
            // tıklama noktası kullanılır. Sayaç-paste yakın uca tutunmak ister.
            const refPt = nokta || worldPos;
            const ep1 = targetPipe.p1, ep2 = targetPipe.p2;
            const dP1 = Math.hypot(ep1.x - refPt.x, ep1.y - refPt.y, (ep1.z || 0) - (refPt.z || 0));
            const dP2 = Math.hypot(ep2.x - refPt.x, ep2.y - refPt.y, (ep2.z || 0) - (refPt.z || 0));
            const targetEnd = dP1 <= dP2 ? ep1 : ep2;
            im._pasteSnapOverride = {
                snapPipeId: targetPipe.id,
                x: targetEnd.x,
                y: targetEnd.y,
                z: targetEnd.z || 0,
            };
            im.lastMousePoint = { x: targetEnd.x, y: targetEnd.y, z: targetEnd.z || 0 };
            try { handlePipePaste.call(im); } finally { im._pasteSnapOverride = null; }
            hide();
        });
    }

    // ── Hattı Böl ──────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-split').addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, interactionManager } = menuState;
        if (pipe && nokta) interactionManager.handlePipeSplit(pipe, nokta, false);
        hide();
    });

    // ── İniş Çıkış Ekle (düşey panel) ───────────────────────────────────────
    // Referans = hattın UÇ noktası (pipe.p2). Tıklama konumu yerine boru ucundan
    // iniş/çıkış eklenir. _applyArayaInisCikis köşe kontrolünü görüp uç-noktası
    // tabanlı applyVerticalPipeInsert'e delege eder.
    document.getElementById('plumbing-btn-inis-cikis')?.addEventListener('click', () => {
        if (!menuState) return;
        const { interactionManager } = menuState;
        const pipe = getPipeTarget(menuState);
        if (pipe) {
            interactionManager.toggleVerticalPanel({ pipe, point: pipe.p2, mode: 'araya' });
        }
        hide();
    });

    // ── Vana: AKV / EMNIYET / CIHAZ / SELENOID / SISMIK — tıklanan noktaya ──
    // Aktif çizimde: sağ tık başka bir mevcut boruya rast gelse bile ÇİZİLEN
    // hattın sonuna git (kullanıcının niyeti çizimi sürdürmek). Çizim yoksa
    // sağ-tıklanan boru veya seçili boru hedeflenir.
    ['AKV', 'EMNIYET', 'CIHAZ', 'SELENOID', 'SISMIK'].forEach(tip => {
        document.getElementById(`plumbing-vana-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const { pipe, nokta, interactionManager: im } = menuState;
            const open = lastDrawnOpenEnd(menuState);
            if (open) {
                im.handleVanaPlacement({ pipe: open.pipe, point: open.point, vanaTipi: tip });
                // Mid-line vana → çizim devam etsin (handleVanaPlacement içinde
                // cancelCurrentAction çağrıldığı için aynı uçtan yeniden başlat)
                resumeDrawingFromOpenEnd(im, open);
            } else if (pipe && nokta) {
                im.handleVanaPlacement({ pipe, point: nokta, t: menuState.t, vanaTipi: tip });
            }
            hide();
        });
    });

    // ── Vana: BRANSMAN / YANBINA — sonlanma; aktif çizim varsa sonlandır
    ['BRANSMAN', 'YANBINA'].forEach(tip => {
        document.getElementById(`plumbing-vana-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const im = menuState.interactionManager;
            const open = lastDrawnOpenEnd(menuState);
            if (open) {
                im.handleVanaPlacement({ pipe: open.pipe, point: open.point, vanaTipi: tip });
                if (im.boruCizimAktif) im.cancelCurrentAction();
            } else {
                const pipe = getPipeTarget(menuState);
                if (pipe) im.handleVanaPlacement({ pipe, point: pipe.p2, vanaTipi: tip });
            }
            hide();
        });
    });

    // ── Regülatör — tıklanan noktaya (yalnız regülatör) ───────────────────
    document.getElementById('plumbing-regulator-add')?.addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, t, interactionManager: im } = menuState;
        const open = lastDrawnOpenEnd(menuState);
        if (open) {
            im.handleRegulatorPlacement({ pipe: open.pipe, point: open.point }, { addAccessories: false });
            resumeDrawingFromOpenEnd(im, open);
        } else if (pipe && nokta) {
            im.handleRegulatorPlacement({ pipe, point: nokta, t }, { addAccessories: false });
        }
        hide();
    });

    // ── Regülatör Grubu — tıklanan noktaya (vana + manometre dahil) ───────
    document.getElementById('plumbing-regulator-add-Group')?.addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, t, interactionManager: im } = menuState;
        const open = lastDrawnOpenEnd(menuState);
        if (open) {
            im.handleRegulatorPlacement({ pipe: open.pipe, point: open.point }, { addAccessories: true });
            resumeDrawingFromOpenEnd(im, open);
        } else if (pipe && nokta) {
            im.handleRegulatorPlacement({ pipe, point: nokta, t }, { addAccessories: true });
        }
        hide();
    });

    // ── Sayaç — aktif çizimde son çizilen borunun açık ucuna otomatik
    // sayaç yerleştir. placeMeterAtOpenEnd sayacın ÇIKIŞINDAN yeni çizim
    // başlatır → kullanıcı oradan devam eder. Çizim yoksa ghost mod.
    document.getElementById('plumbing-sayac-DIREKT')?.addEventListener('click', () => {
        if (!menuState) return;
        const im = menuState.interactionManager;
        const open = lastDrawnOpenEnd(menuState);
        if (open) {
            im.manager.placeMeterAtOpenEnd(open);
        } else {
            autoPlaceSayac(im);
        }
        hide();
    });

    // ── İniş + Sayaç — aktif çizimde son boruya iniş, sonra sayaç
    document.getElementById('plumbing-inis-SAYAC')?.addEventListener('click', () => {
        if (!menuState) return;
        const open = lastDrawnOpenEnd(menuState);
        const pipe = open ? open.pipe : getPipeTarget(menuState);
        if (pipe) placeInisVeSayac(menuState.interactionManager, pipe);
        hide();
    });

    // ── Cihaz — aktif çizimde son borunun açık ucuna otomatik yerleştir.
    // Cihaz terminal; placeDeviceAtOpenEnd setMode("select") yapıp çizimi
    // sonlandırır. Aksi halde ghost mod.
    ['KOMBI', 'OCAK', 'SOBA', 'SOFBEN', 'KAZAN', 'TICARI'].forEach(tip => {
        document.getElementById(`plumbing-cihaz-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const im = menuState.interactionManager;
            const open = lastDrawnOpenEnd(menuState);
            if (open) {
                im.manager.placeDeviceAtOpenEnd(tip, open);
                // Cihaz terminal; aktif boru çizimi varsa kesin sonlandır.
                try { im.cancelCurrentAction?.(); } catch { /* sessiz */ }
            } else {
                autoPlaceCihaz(im, tip);
            }
            hide();
        });
    });

    // ── İniş + Cihaz — aktif çizimde son boruya iniş, sonra cihaz
    ['KOMBI', 'OCAK', 'SOBA', 'SOFBEN', 'KAZAN', 'TICARI'].forEach(tip => {
        document.getElementById(`plumbing-inis-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const im = menuState.interactionManager;
            const open = lastDrawnOpenEnd(menuState);
            const pipe = open ? open.pipe : getPipeTarget(menuState);
            if (pipe) placeInisVeCihaz(im, pipe, tip);
            // İniş + cihaz da terminal: aktif çizimi sonlandır.
            try { im.cancelCurrentAction?.(); } catch { /* sessiz */ }
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
// ── Seçili İç Tesisat Hariç Tüm Tesisatı Sil ────────────────────────────
    document.getElementById('ctx-tesisat-eksilt-haric')?.addEventListener('click', () => {
        if (!menuState) return;
        deleteExceptSelectedIcTesisat(menuState, menuState.interactionManager.manager);
        hide();
    });

    // ── Tüm Tesisatı Sil ────────────────────────────────────────────────────
    document.getElementById('ctx-tesisat-eksilt-tumu')?.addEventListener('click', () => {
        if (!menuState) return;
        deleteAllPlumbing(menuState.interactionManager.manager);
        hide();
    });

    // ── Referans Ekle: Nokta / Yatay / Düşey / Açısal / Serbest / Temizle ──
    document.getElementById('plumbing-ref-point')?.addEventListener('click', () => {
        if (!menuState?.worldPos) { hide(); return; }
        if (!state.guides) state.guides = [];
        state.guides.push({ type: 'guide', subType: 'point', x: menuState.worldPos.x, y: menuState.worldPos.y });
        saveState();
        hide();
    });

    document.getElementById('plumbing-ref-horizontal')?.addEventListener('click', () => {
        if (!menuState?.worldPos) { hide(); return; }
        if (!state.guides) state.guides = [];
        state.guides.push({ type: 'guide', subType: 'horizontal', y: menuState.worldPos.y });
        saveState();
        hide();
    });

    document.getElementById('plumbing-ref-vertical')?.addEventListener('click', () => {
        if (!menuState?.worldPos) { hide(); return; }
        if (!state.guides) state.guides = [];
        state.guides.push({ type: 'guide', subType: 'vertical', x: menuState.worldPos.x });
        saveState();
        hide();
    });

    document.getElementById('plumbing-ref-angular')?.addEventListener('click', () => {
        if (!menuState?.worldPos) { hide(); return; }
        setMode('drawGuideAngular', true);
        setState({ startPoint: getOrCreateNode(menuState.worldPos.x, menuState.worldPos.y) });
        hide();
    });

    document.getElementById('plumbing-ref-free')?.addEventListener('click', () => {
        if (!menuState?.worldPos) { hide(); return; }
        setMode('drawGuideFree', true);
        setState({ startPoint: getOrCreateNode(menuState.worldPos.x, menuState.worldPos.y) });
        hide();
    });

    document.getElementById('plumbing-ref-clear-all')?.addEventListener('click', () => {
        if (state.guides && state.guides.length > 0) {
            if (confirm(`${state.guides.length} adet referans çizgisi silinecek. Emin misiniz?`)) {
                state.guides = [];
                saveState();
            }
        }
        hide();
    });

    // ── YENİ: Tesisat Çoğalt — Üst/Alt Kata Kolon Çiz ─────────────────────
    // Referans = seçili borunun UÇ noktası (pipe.p2). Boş uç kontrolü yok;
    // anchor zaten dolu ise paylaşılan T-bağlantı oluşur.
    document.getElementById('ctx-tesisat-cogalt-ust-kolon')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) drawColumnToAdjacentFloor(menuState.interactionManager, pipe, 'up');
        hide();
    });

    document.getElementById('ctx-tesisat-cogalt-alt-kolon')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) drawColumnToAdjacentFloor(menuState.interactionManager, pipe, 'down');
        hide();
    });

    document.getElementById('ctx-tesisat-cogalt-tum-kolon')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) drawColumnAllFloors(menuState.interactionManager, pipe);
        hide();
    });

    // ── Kattaki Branşman / Branşman+İç — Tüm Katlara Yapıştır ─────────────
    document.getElementById('ctx-tesisat-cogalt-bransman')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) pasteFloorPlumbingToAllFloors(menuState.interactionManager, pipe, false);
        hide();
    });

    document.getElementById('ctx-tesisat-cogalt-bransman-ic')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) pasteFloorPlumbingToAllFloors(menuState.interactionManager, pipe, true);
        hide();
    });

    // ── Mimariye Nesne Ekle — sağ tık menüsünden mimari yerleştirme moduna geç
    // Toolbar butonlarıyla aynı akış: tesisat boru çizimini iptal et, MİMARİ
    // çizim moduna geç ve uygun draw* modunu zorla ayarla. Kullanıcı bir
    // sonraki tıklamasında nesneyi yerleştirir (kapı/pencere/menfez bir
    // duvarı, kolon/cihaz serbest noktayı, kiriş iki uç hedefler).
    const _enterMimariMode = (modeName) => {
        if (!menuState) return;
        if (menuState.interactionManager) menuState.interactionManager.boruCizimAktif = false;
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("MİMARİ");
        }
        setMode(modeName, true);
        hide();
    };

    document.getElementById('mimari-nesne-kapi')?.addEventListener('click', () => _enterMimariMode('drawDoor'));
    document.getElementById('mimari-nesne-pencere')?.addEventListener('click', () => _enterMimariMode('drawWindow'));
    document.getElementById('mimari-nesne-kolon')?.addEventListener('click', () => _enterMimariMode('drawColumn'));
    document.getElementById('mimari-nesne-kiris')?.addEventListener('click', () => _enterMimariMode('drawBeam'));
    document.getElementById('mimari-nesne-menfez')?.addEventListener('click', () => _enterMimariMode('drawVent'));

    const _startArchDeviceCtx = (kind) => {
        if (!menuState) return;
        if (menuState.interactionManager) menuState.interactionManager.boruCizimAktif = false;
        if (state.currentDrawingMode !== "KARMA") {
            setDrawingMode("MİMARİ");
        }
        state.archDevicePlacementKind = kind;
        setMode("drawArchDevice", true);
        hide();
    };

    document.getElementById('mimari-nesne-alarm')?.addEventListener('click', () => _startArchDeviceCtx(ARCH_DEVICE_KINDS.GAS_ALARM));
    document.getElementById('mimari-nesne-co')?.addEventListener('click', () => _startArchDeviceCtx(ARCH_DEVICE_KINDS.CO_ALARM));
    document.getElementById('mimari-nesne-deprem')?.addEventListener('click', () => _startArchDeviceCtx(ARCH_DEVICE_KINDS.EARTHQUAKE));

    // ── Hâlâ işlerliği eklenmemiş diğer yeni butonlar (stub) ──────────────
    [

        'ctx-mimari-cogalt-kopyala',
        'ctx-mimari-cogalt-alan-kopyala',
        'ctx-mimari-cogalt-yapistir-sil',
        'ctx-mimari-cogalt-yapistir-kal',
        'ctx-mimari-cogalt-tum-katlar',
        'ctx-mimari-eksilt-kat',
        'ctx-mimari-eksilt-ic-duvar',
        'ctx-mimari-eksilt-bolge',
        'ctx-mimari-eksilt-tum-katlar',
    ].forEach(btnId => {
        document.getElementById(btnId)?.addEventListener('click', () => {
            console.log(`[context-menu stub] ${btnId} tıklandı (işlerlik henüz bağlanmadı)`);
            hide();
        });
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
    const hasSayac = !!getSayacTarget(menuState);
    const hasClipboard = !!(interactionManager?.copiedPipes || interactionManager?.cutPipes);

    document.getElementById('plumbing-btn-cut').disabled = !hasPipe;
    document.getElementById('plumbing-btn-copy').disabled = !(hasPipe || hasSayac);
    const btnPaste = document.getElementById('plumbing-btn-paste');
    if (btnPaste) btnPaste.disabled = !(hasClipboard && hasPipe);
    document.getElementById('plumbing-btn-split').disabled = !pipe; // Böl sadece gövdeye tıklanınca
    const btnInisCikis = document.getElementById('plumbing-btn-inis-cikis');
    if (btnInisCikis) btnInisCikis.disabled = !hasPipe; // Boru ucu için boru hedefi yeter
    document.getElementById('plumbing-btn-delete-after').disabled = !hasPipe;

    // İç Tesisatı Sil: hedef sayaç(lar) çözülebiliyorsa aktif
    const btnDeleteIcSingle = document.getElementById('plumbing-btn-delete-ic-single');
    if (btnDeleteIcSingle) {
        btnDeleteIcSingle.disabled = resolveTargetSayaclarForIcTesisat(menuState).length === 0;
    }

    // ── YENİ: Bir tesisat nesnesi seçili/sağ tıklanmış mı? ────────────────
    // Boru hedefi VEYA bir tesisat komponenti varsa "tesisat nesnesi mevcut".
    const PLUMBING_TYPES = new Set([
        'boru', 'sayac', 'vana', 'regulator', 'filtre',
        'izolasyon_flansi', 'kompansator', 'manometre',
        'topraklama', 'cihaz', 'baca', 'servis_kutusu'
    ]);
    const selObj = interactionManager?.selectedObject;
    const hasPlumbingTarget = hasPipe
        || !!clickedComponent
        || !!(selObj && PLUMBING_TYPES.has(selObj.type));

    // Seçim gerektiren butonlar — disabled = !hasPlumbingTarget
    [
        'ctx-tesisat-cogalt-ust-kolon',
        'ctx-tesisat-cogalt-alt-kolon',
        'ctx-tesisat-cogalt-tum-kolon',
        'ctx-tesisat-cogalt-bransman',
        'ctx-tesisat-cogalt-bransman-ic',
        'ctx-tesisat-eksilt-haric',
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !hasPlumbingTarget;
    });

    // Seçim gerektirmeyen butonlar — her zaman aktif
    [
        'ctx-tesisat-eksilt-tumu',
        'ctx-mimari-cogalt-kopyala',
        'ctx-mimari-cogalt-alan-kopyala',
        'ctx-mimari-cogalt-yapistir-sil',
        'ctx-mimari-cogalt-yapistir-kal',
        'ctx-mimari-cogalt-tum-katlar',
        'ctx-mimari-eksilt-kat',
        'ctx-mimari-eksilt-ic-duvar',
        'ctx-mimari-eksilt-bolge',
        'ctx-mimari-eksilt-tum-katlar',
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });

    menuEl.style.display = 'block';
    placeMenuInViewport(menuEl, screenX, screenY);
    setupSubmenuPositioning(menuEl);

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
