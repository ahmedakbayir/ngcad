/**
 * Selection Manager
 * Seçim işlemlerini yönetir
 */

import { setState, state } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { openPropertiesPanel, closePropertiesPanel, onDeselect, isPanelOpen, isPinned } from '../properties/properties-panel.js';
import { computeHatGroups } from '../renderer/renderer-utils.js';
import { switchToFloor } from '../../floor/floor-handler.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';

/**
 * Seçilen borunun kaynaktan o boruya kadar olan hat yolunu bulur.
 * Hat numaralarını tekrarsız sıralı döndürür: [1, 3, 5] gibi.
 */
function getPipePath(pipe, manager) {
    if (!pipe || !manager?.pipes) return [];

    const { hatMap } = computeHatGroups(manager.pipes, manager.components);

    const myHat = hatMap.get(pipe.id);
    if (myHat == null) return [];

    const pipeById = new Map(manager.pipes.map(p => [p.id, p]));
    const path = [];
    let current = pipe;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const hat = hatMap.get(current.id);
        if (hat != null && (path.length === 0 || path[0] !== hat)) {
            path.unshift(hat);
        }
        const bag = current.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            current = pipeById.get(bag.hedefId) || null;
        } else {
            break;
        }
    }

    return path.filter((v, i) => i === 0 || v !== path[i - 1]);
}

/**
 * Belirtilen nesneyi seç
 */
export function selectObject(interactionManager, obj, opts = {}) {
    const openPanel = !!opts.openPanel;
    const noNavigate = !!opts.noNavigate; // tek tık → kat değiştirme, panel switch yok

    const vbf = state.viewBlendFactor || 0;
    const targetFloorId = opts.preferredFloorId || (obj && obj.floorId) || null;
    // Yalnızca "Diğer Katları Gizle" aktifse görünmeyen kata otomatik geçme.
    // Silik (faded) görünüyorsa kullanıcı kasıtlı olarak diğer katlardaki
    // tesisata tıklamış olabilir; floor switch normal akış.
    const hideOtherFloors3D = !!(state.tempVisibility?.hideOtherFloors3D);
    if (!noNavigate && vbf >= 0.5 && targetFloorId && targetFloorId !== state.currentFloor?.id && !hideOtherFloors3D) {
        switchToFloor(targetFloorId);
    }

    // Önceki genel seçimi temizle
    if (interactionManager.selectedObject && interactionManager.selectedObject !== obj) {
        interactionManager.selectedObject.isSelected = false;

        if (interactionManager.selectedObject.type === 'cihaz') {
            const prevBaca = interactionManager.manager.components.find(c =>
                c.type === 'baca' && c.parentCihazId === interactionManager.selectedObject.id
            );
            if (prevBaca) prevBaca.isSelected = false;
        }
    }
    
    // Önceki hat seçimini temizle
    if (interactionManager.selectedHatPipes) {
        interactionManager.selectedHatPipes.forEach(p => { if (p !== obj) p.isSelected = false; });
        interactionManager.selectedHatPipes = null;
    }
    
    // Önceki vana seçimini temizle (Eğer seçilen nesne yeni bir şeyse)
    if (interactionManager.selectedValve && interactionManager.selectedValve.vana !== obj) {
        if (interactionManager.selectedValve.vana) {
            interactionManager.selectedValve.vana.isSelected = false;
        }
        interactionManager.selectedValve = null;
    }

    if (!interactionManager.isDragging || !interactionManager.dragEndpoint) {
        interactionManager.selectedEndpoint = null;
    }

    interactionManager.pipeResizeInput = '';
    interactionManager.pipeResizeActive = false;
    
    // 1. GENEL SEÇİMİ (selectedObject) HER ZAMAN DOLDUR
    interactionManager.selectedObject = obj;
    obj.isSelected = true;

    // 2. ÖZEL SEÇİMİ (selectedValve) SENKRONİZE ET
    // Çizim motoru veya panel vanayı özel değişkende ararsa diye ikisini eşitliyoruz
    if (obj.type === 'vana' || obj.type === 'regulator'
        || obj.type === 'filtre' || obj.type === 'izolasyon_flansi'
        || obj.type === 'kompansator' || obj.type === 'manometre'
        || obj.type === 'topraklama') {
        let pipe = null;
        if (interactionManager.manager && interactionManager.manager.pipes) {
            pipe = interactionManager.manager.pipes.find(p => 
                p.id === obj.bagliBoruId || 
                p.id === obj.iliskiliBoruId || 
                p.id === obj.boruId ||
                p.vana === obj
            );
        }
        interactionManager.selectedValve = { pipe, vana: obj };
    }

    if (obj.type === 'boru') {
        const path = getPipePath(obj, interactionManager.manager);
        window._selectedPipePath = path;
    } else {
        window._selectedPipePath = null;
    }

    if (obj.type === 'cihaz') {
        const baca = interactionManager.manager.components.find(c =>
            c.type === 'baca' && c.parentCihazId === obj.id
        );
        if (baca) baca.isSelected = true;
    } else if (obj.type === 'baca' && obj.parentCihazId) {
        const cihaz = interactionManager.manager.components.find(c =>
            c.type === 'cihaz' && c.id === obj.parentCihazId
        );
        if (cihaz) cihaz.isSelected = true;
    }

    setState({
        selectedObject: {
            type: obj.type === 'boru' ? 'pipe' : obj.type,
            object: obj,
            handle: 'body'
        }
    });

    if (['boru', 'sayac', 'vana', 'regulator', 'servis_kutusu', 'cihaz', 'filtre', 'izolasyon_flansi', 'kompansator', 'manometre', 'topraklama'].includes(obj.type)) {
        if (!noNavigate && (isPinned() || isPanelOpen() || openPanel)) {
            openPropertiesPanel(obj, interactionManager.manager);
        }
    }
}

/**
 * Hat etiketine tıklanınca aynı hat numarasına sahip tüm boruları seç.
 */
export function selectHat(interactionManager, pipe, opts = {}) {
    if (!pipe || pipe.type !== 'boru') return;
    const manager = interactionManager.manager;
    const { hatMap } = computeHatGroups(manager.pipes, manager.components);
    const hatNo = hatMap.get(pipe.id);

    selectObject(interactionManager, pipe, opts);

    if (hatNo == null) return;
    const siblings = manager.pipes.filter(p => hatMap.get(p.id) === hatNo);
    siblings.forEach(p => { p.isSelected = true; });
    interactionManager.selectedHatPipes = siblings;
}

/**
 * Boru üzerindeki vanayı seç
 */
export function selectValve(interactionManager, pipe, vana, opts = {}) {
    const openPanel = !!opts.openPanel;
    
    // Önceki seçimi temizle
    if (interactionManager.selectedObject && interactionManager.selectedObject !== vana) {
        interactionManager.selectedObject.isSelected = false;
    }
    if (interactionManager.selectedHatPipes) {
        interactionManager.selectedHatPipes.forEach(p => { p.isSelected = false; });
        interactionManager.selectedHatPipes = null;
    }
    if (interactionManager.selectedValve && interactionManager.selectedValve.vana !== vana) {
        if (interactionManager.selectedValve.vana) {
            interactionManager.selectedValve.vana.isSelected = false;
        }
    }

    window._selectedPipePath = null;

    // HER İKİ DEĞİŞKENİ BURADA DA SENKRONİZE EDİYORUZ
    interactionManager.selectedObject = vana;
    interactionManager.selectedValve = { pipe, vana };
    if (vana) vana.isSelected = true;

    setState({
        selectedObject: {
            type: vana ? (vana.type || 'vana') : 'vana',
            object: vana,
            pipe: pipe,
            handle: 'body'
        }
    });

    if (vana && (isPinned() || isPanelOpen() || openPanel)) {
        openPropertiesPanel(vana, interactionManager.manager);
    }
}

/**
 * Seçili nesneyi kaldır.
 *
 * Görsel bayrak (isSelected) çeşitli yollardan set edilebiliyor:
 * selectObject / selectHat / selectValve / hata-kontrol selectObjects /
 * voice command / yeni boru oluşturma sonrası vb. Hangisi olursa olsun
 * iptal isteğinde manager içindeki tüm pipe ve component'lere bir tarama
 * yapılır → "sahte seçili rengi" sorunu giderilir.
 */
export function deselectObject(interactionManager) {
    const mgr = interactionManager?.manager;
    if (mgr) {
        (mgr.pipes || []).forEach(p => { if (p.isSelected) p.isSelected = false; });
        (mgr.components || []).forEach(c => { if (c.isSelected) c.isSelected = false; });
    }

    interactionManager.selectedObject = null;
    interactionManager.selectedEndpoint = null;
    interactionManager.selectedValve = null;
    interactionManager.selectedHatPipes = null;
    interactionManager.selectedObjects = null;
    interactionManager.lastSelectedObject = null;

    window._selectedPipePath = null;
    onDeselect();
    setState({ selectedObject: null });
}

/**
 * Seçili nesneyi sil
 */
export function deleteSelectedObject(interactionManager) {
    if (interactionManager.selectedValve) {
        saveState();
        const { pipe, vana } = interactionManager.selectedValve;

        if (pipe && typeof pipe.vanaKaldir === 'function') {
            pipe.vanaKaldir();
        }

        if (vana) {
            const idx = interactionManager.manager.components.indexOf(vana);
            if (idx !== -1) interactionManager.manager.components.splice(idx, 1);
        }

        recomputeAllPressures(interactionManager.manager);
        interactionManager.manager.saveToState();
        deselectObject(interactionManager);
        return;
    }

    if (!interactionManager.selectedObject) return;

    const obj = interactionManager.selectedObject;

    if (obj.type === 'boru') {
        const pipe = obj;
        const hierarchy = window._pipeHierarchy;
        if (hierarchy) {
            const pipeData = hierarchy.get(pipe.id);
            if (pipeData && pipeData.children && pipeData.children.length >= 2) {
                return; 
            }
        }
    }

    saveState();

    if (obj.type === 'servis_kutusu') {
        if (confirm(obj.getDeleteInfo().uyari)) {
            interactionManager.removeObject(obj);
            recomputeAllPressures(interactionManager.manager);
            interactionManager.manager.saveToState();
            deselectObject(interactionManager); 
        } else {
            return; 
        }
    } else {
        const pipeToSelect = interactionManager.removeObject(obj);
        recomputeAllPressures(interactionManager.manager);
        interactionManager.manager.saveToState();

        if (obj.type === 'boru' && pipeToSelect) {
            selectObject(interactionManager, pipeToSelect);
        } else if (obj.type !== 'boru') {
            deselectObject(interactionManager);
        } else {
            deselectObject(interactionManager);
        }
    }
}