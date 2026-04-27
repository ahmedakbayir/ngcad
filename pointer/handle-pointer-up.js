/**
 * Pointer Up Handler
 * Mouse bırakma işlemlerini yönetir
 */

import { endLabelDrag } from '../plumbing_v2/renderer/renderer-labels.js';
import { saveState } from '../general-files/history.js';

export function handlePointerUp(e) {
    // --- EKRAN KAYDIRMA (PAN) KİLİTLENMESİNİ ÖNLEYEN DÜZELTME ---
    // Eğer farenin sol tuşu (0) dışındaki bir tuşla (örneğin orta tekerlek=1) işlem yapılıyorsa,
    // tesisat motoru bu tıklamayı yutmamalıdır. Yoksa ekran kaydırma modu takılı kalır!
    if (e && e.button !== 0) {
        return false;
    }

    if (this.isDraggingLabel) {
        // Sürükleme eşiğine ulaşılmadıysa: etiket "tıklaması" sayılır.
        // Hat etiketinde tüm hattı, diğerlerinde nesnenin kendisini seç.
        if (this._pendingLabelClick) {
            const obj = this._pendingLabelClick.obj;
            this._pendingLabelClick = null;
            this.isDraggingLabel = false;
            if (obj) {
                if (obj.type === 'boru') this.selectHat(obj);
                else this.selectObject(obj);
            }
            return true;
        }
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
    
    // Sürükleme (drag) kilitli/yapılmamış olsa bile (örn: sayaca bağlı ilk boru),
    // eğer bir tesisat nesnesi başarıyla seçilmişse bu tıklamayı tesisatın 
    // üstlendiğini belirtmek için true dönmeliyiz. Aksi takdirde mimari sistem 
    // (pointer-up.js) tıklamayı boşluğa yapılmış sayıp seçimi ve paneli kapatır.
    if (this.selectedObject) {
        return true;
    }

    return false;
}