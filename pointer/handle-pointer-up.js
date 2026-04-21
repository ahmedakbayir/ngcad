/**
 * Pointer Up Handler
 * Mouse bırakma işlemlerini yönetir
 */

import { endLabelDrag } from '../plumbing_v2/renderer/renderer-labels.js';
import { saveState } from '../general-files/history.js';

export function handlePointerUp(e) {
    if (this.isDraggingLabel) {
        endLabelDrag();
        this.isDraggingLabel = false;
        // Etiket konumunu kaydet — proje kaydında korunsun
        this.manager?.saveToState();
        saveState();
        return true;
    }
    if (this.isRotating) {
        this.endRotation();
        return true;
    }
    if (this.isDragging) {
        this.endDrag();
        return true;
    }
    
    // YENİ EKLENEN KISIM:
    // Sürükleme (drag) kilitli/yapılmamış olsa bile (örn: sayaca bağlı ilk boru),
    // eğer bir tesisat nesnesi başarıyla seçilmişse bu tıklamayı tesisatın 
    // üstlendiğini belirtmek için true dönmeliyiz. Aksi takdirde mimari sistem 
    // (pointer-up.js) tıklamayı boşluğa yapılmış sayıp seçimi ve paneli kapatır.
    if (this.selectedObject) {
        return true;
    }

    return false;
}