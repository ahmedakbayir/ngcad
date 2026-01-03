/**
 * Selection Manager
 * Seçim işlemlerini yönetir
 */

import { setState } from '../../../general-files/main.js';
import { saveState } from '../../../general-files/history.js';

/**
 * Seçilen borunun kaynaktan o boruya kadar olan yolunu bulur
 * @param {Object} pipe - Seçilen boru
 * @param {Object} manager - PlumbingManager instance
 * @returns {Array} Yol (label dizisi) örn: ['A', 'B', 'D']
 */
function getPipePath(pipe, manager) {
    if (!pipe || !manager || !manager.pipes || !manager.components) {
        return [];
    }

    // Hierarchy'yi al (window'da cache'lenmiş olabilir)
    let hierarchy = window._pipeHierarchy;

    // Yoksa yeniden oluştur
    if (!hierarchy) {
        // buildPipeHierarchy'yi çağırmak için basit bir implementasyon
        // (Bu fonksiyon plumbing-renderer.js'te var, ama import etmek yerine burada da yazabiliriz)
        hierarchy = new Map();
    }

    // Seçilen borunun data'sını al
    const pipeData = hierarchy.get(pipe.id);
    if (!pipeData) {
        return [];
    }

    // Parent zincirini takip et
    const path = [pipeData.label];
    let currentLabel = pipeData.parent;

    while (currentLabel) {
        path.unshift(currentLabel); // Başa ekle

        // Bu label'a sahip pipe'ı bul
        const parentPipe = manager.pipes.find(p => {
            const data = hierarchy.get(p.id);
            return data && data.label === currentLabel;
        });

        if (!parentPipe) break;

        const parentData = hierarchy.get(parentPipe.id);
        currentLabel = parentData ? parentData.parent : null;
    }

    return path;
}

/**
 * Belirtilen nesneyi seç
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} obj - Seçilecek nesne
 */
export function selectObject(interactionManager, obj) {
    // Önceki seçimi temizle
    if (interactionManager.selectedObject && interactionManager.selectedObject !== obj) {
        interactionManager.selectedObject.isSelected = false;

        // Eğer önceki seçim cihaz ise, onun bacasının seçimini de temizle
        if (interactionManager.selectedObject.type === 'cihaz') {
            const prevBaca = interactionManager.manager.components.find(c =>
                c.type === 'baca' && c.parentCihazId === interactionManager.selectedObject.id
            );
            if (prevBaca) {
                prevBaca.isSelected = false;
            }
        }
    }
    // Vana seçimi temizle
    if (interactionManager.selectedValve) {
        // DÜZELTME: pipe.vana yerine doğrudan vana bileşenini hedefle
        if (interactionManager.selectedValve.vana) {
            interactionManager.selectedValve.vana.isSelected = false;
        }
        interactionManager.selectedValve = null;
    }
    interactionManager.selectedObject = obj;
    obj.isSelected = true;

    // Eğer seçilen nesne boru ise, yolunu hesapla ve sakla
    if (obj.type === 'boru') {
        const path = getPipePath(obj, interactionManager.manager);
        window._selectedPipePath = path;
    } else {
        // Boru değilse yolu temizle
        window._selectedPipePath = null;
    }

    // Eğer seçilen nesne cihaz ise, bağlı bacayı da seç
    if (obj.type === 'cihaz') {
        const baca = interactionManager.manager.components.find(c =>
            c.type === 'baca' && c.parentCihazId === obj.id
        );
        if (baca) {
            baca.isSelected = true;
        }
    }
    // Eğer seçilen nesne baca ise, bağlı cihazı da seç
    else if (obj.type === 'baca' && obj.parentCihazId) {
        const cihaz = interactionManager.manager.components.find(c =>
            c.type === 'cihaz' && c.id === obj.parentCihazId
        );
        if (cihaz) {
            cihaz.isSelected = true;
        }
    }

    // state.selectedObject'i de set et (DELETE tuşu için)
    setState({
        selectedObject: {
            type: obj.type === 'boru' ? 'pipe' : obj.type,
            object: obj,
            handle: 'body'
        }
    });
}

/**
 * Boru üzerindeki vanayı seç
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} pipe - Boru nesnesi
 * @param {Object} vana - Vana nesnesi
 */
export function selectValve(interactionManager, pipe, vana) {
    // Önceki seçimi temizle
    if (interactionManager.selectedObject) {
        interactionManager.selectedObject.isSelected = false;
        interactionManager.selectedObject = null;
    }
    // Önceki vana seçimini temizle
    if (interactionManager.selectedValve) {
        // DÜZELTME: pipe.vana.isSelected yerine vana.isSelected
        if (interactionManager.selectedValve.vana) {
            interactionManager.selectedValve.vana.isSelected = false;
        }
    }

    // Yolu temizle (vana seçildiğinde)
    window._selectedPipePath = null;

    interactionManager.selectedValve = { pipe, vana };
    if (vana) vana.isSelected = true;

    // state.selectedObject'i de set et (DELETE tuşu için)
    setState({
        selectedObject: {
            type: 'vana',
            object: vana,
            pipe: pipe,
            handle: 'body'
        }
    });
}

/**
 * Seçili nesneyi kaldır
 * @param {Object} interactionManager - InteractionManager instance
 */
export function deselectObject(interactionManager) {
    if (interactionManager.selectedObject) {
        interactionManager.selectedObject.isSelected = false;

        // Eğer seçim cihaz ise, bağlı bacayı da seçimden çıkar
        if (interactionManager.selectedObject.type === 'cihaz') {
            const baca = interactionManager.manager.components.find(c =>
                c.type === 'baca' && c.parentCihazId === interactionManager.selectedObject.id
            );
            if (baca) {
                baca.isSelected = false;
            }
        }
        // Eğer seçim baca ise, bağlı cihazı da seçimden çıkar
        else if (interactionManager.selectedObject.type === 'baca' && interactionManager.selectedObject.parentCihazId) {
            const cihaz = interactionManager.manager.components.find(c =>
                c.type === 'cihaz' && c.id === interactionManager.selectedObject.parentCihazId
            );
            if (cihaz) {
                cihaz.isSelected = false;
            }
        }

        interactionManager.selectedObject = null;
    }
    if (interactionManager.selectedValve) {
        // DÜZELTME: Kilitlenmeye neden olan hatalı referans düzeltildi
        if (interactionManager.selectedValve.vana) {
            interactionManager.selectedValve.vana.isSelected = false;
        }
        interactionManager.selectedValve = null;
    }

    // Yolu temizle
    window._selectedPipePath = null;

    // state.selectedObject'i de temizle
    setState({ selectedObject: null });
}

/**
 * Seçili nesneyi sil
 * @param {Object} interactionManager - InteractionManager instance
 */
export function deleteSelectedObject(interactionManager) {
    // Vana silinmesi
    if (interactionManager.selectedValve) {
        saveState();
        // Güvenli silme işlemi
        const { pipe, vana } = interactionManager.selectedValve;

        // Legacy uyumluluğu için pipe üzerindeki referansı temizle
        if (pipe) {
            pipe.vanaKaldir();
        }

        // Bileşen listesinden vanayı sil (görünümden kalkması için şart)
        if (vana) {
            const idx = interactionManager.manager.components.indexOf(vana);
            if (idx !== -1) interactionManager.manager.components.splice(idx, 1);
        }

        interactionManager.manager.saveToState();
        deselectObject(interactionManager);
        return;
    }

    if (!interactionManager.selectedObject) return;

    const obj = interactionManager.selectedObject;

    // Servis kutusuna bağlı ilk boru silinemesin
    if (obj.type === 'boru') {
        const pipe = obj;

        // --- YENİ KURAL: En az 2 çocuğu varsa silinemesin ---
        const hierarchy = window._pipeHierarchy;
        if (hierarchy) {
            const pipeData = hierarchy.get(pipe.id);
            // Eğer hiyerarşi verisi varsa ve çocuk sayısı 2 veya daha fazlaysa
            if (pipeData && pipeData.children && pipeData.children.length >= 2) {
                //alert('⚠️ Bu borunun 2 veya daha fazla alt hattı var (T-bağlantı veya dağıtıcı), silinemez!\n\nLütfen önce bağlı alt hatları siliniz.');
                return; // Silme işlemini iptal et
            }
        }

         //Başlangıcı servis kutusuna bağlı mı kontrol et
        // if (pipe.baslangicBaglanti && pipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) { alert('⚠️ Servis kutusuna bağlı ilk boru silinemez!\n\nÖnce servis kutusunu silin veya başka bir boru ekleyin.'); return; } 

    }

    // Undo için state kaydet
    saveState();

    if (obj.type === 'servis_kutusu') {
        if (confirm(obj.getDeleteInfo().uyari)) {
            interactionManager.removeObject(obj);
            interactionManager.manager.saveToState();
            deselectObject(interactionManager); // Servis kutusu için seçimi kaldır
        } else {
            // İptal edildi, return
            return;
        }
    } else {
        const pipeToSelect = interactionManager.removeObject(obj);
        interactionManager.manager.saveToState();

        // Boru silindiyse ve parent varsa onu seç
        if (obj.type === 'boru' && pipeToSelect) {
            selectObject(interactionManager, pipeToSelect);
        } else if (obj.type !== 'boru') {
            deselectObject(interactionManager);
        } else {
            // Boru silindi ama seçilecek parent yok
            deselectObject(interactionManager);
        }
    }
}
