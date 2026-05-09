// calc-table-helpers.js
// Hesap tablolarından (boru çapı, lokal kayıp) bir hat satırına veya
// "yol" satırına çift tıklayınca; ilgili hattı/yolu projede seçili duruma
// getirmek için kullanılan yardımcılar.

import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { selectHat } from '../plumbing_v2/interactions/selection-manager.js';
import { switchToFloor } from '../floor/floor-handler.js';
import { state, dom } from '../general-files/main.js';
import { toggle3DPerspective } from '../general-files/ui.js';
import { draw2D } from '../draw/draw2d.js';

function getManager() {
    return window.plumbingManager || plumbingManager || null;
}

function ensure3DPerspective() {
    if (!dom?.mainContainer) return;
    if (!dom.mainContainer.classList.contains('show-persp')) {
        toggle3DPerspective();
    }
}

function pickRepresentative(pipes) {
    const curId = state.currentFloor?.id;
    return pipes.find(p => p.floorId === curId) || pipes[0];
}

/**
 * Verilen hat numarasını projede seçili hâle getirir.
 * Hat birden fazla katta ise 3D perspektif panelini açar.
 */
export function selectHatInProject(hatNo) {
    const manager = getManager();
    if (!manager?.pipes) return;
    const im = manager.interactionManager;
    if (!im) return;

    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    const pipes = manager.pipes.filter(p => hatMap.get(p.id) === hatNo);
    if (pipes.length === 0) return;

    const target = pickRepresentative(pipes);

    if (target.floorId && target.floorId !== state.currentFloor?.id) {
        switchToFloor(target.floorId);
    }

    selectHat(im, target, { openPanel: false });

    const floorIds = new Set(pipes.map(p => p.floorId).filter(Boolean));
    if (floorIds.size > 1) ensure3DPerspective();

    try { draw2D(); } catch (_) {}
}

/**
 * Bir "yol" — birbirine bağlı hat numaraları zinciri — seçili hâle getirir.
 * Yola dahil borular birden fazla katta ise 3D perspektif panelini açar.
 */
export function selectPathInProject(hatNos) {
    const manager = getManager();
    if (!manager?.pipes || !hatNos?.length) return;
    const im = manager.interactionManager;
    if (!im) return;

    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    const set = new Set(hatNos.map(n => Number(n)));
    const pathPipes = manager.pipes.filter(p => set.has(hatMap.get(p.id)));
    if (pathPipes.length === 0) return;

    // Yolun başındaki hatın temsilcisini odakla — selectHat üzerinden seçim
    // ve state senkronizasyonu yapılır.
    const headHat = Number(hatNos[0]);
    const headPipes = pathPipes.filter(p => hatMap.get(p.id) === headHat);
    const representative = pickRepresentative(headPipes.length ? headPipes : pathPipes);

    if (representative.floorId && representative.floorId !== state.currentFloor?.id) {
        switchToFloor(representative.floorId);
    }

    selectHat(im, representative, { openPanel: false });

    // Yolun tüm hatlarındaki boruları seçili hâle getir (selectHat sadece
    // tek hattı işaretler — burada yol genişletmesini elle yapıyoruz).
    pathPipes.forEach(p => { p.isSelected = true; });
    im.selectedHatPipes = pathPipes;
    window._selectedPipePath = hatNos.map(n => Number(n));

    const floorIds = new Set(pathPipes.map(p => p.floorId).filter(Boolean));
    if (floorIds.size > 1) ensure3DPerspective();

    try { draw2D(); } catch (_) {}
}
