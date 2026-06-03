/**
 * Pointer Up Handler
 * Mouse bırakma işlemlerini yönetir
 */

import { endLabelDrag } from '../plumbing_v2/renderer/renderer-labels.js';
import { saveState } from '../general-files/history.js';

const CTRL_CLICK_MOVE_TOLERANCE_PX = 5;

function _maybeCtrlClickSelectVana(self, e) {
    const down = self._ctrlClickDownScreen;
    self._ctrlClickDownScreen = null;
    if (!down) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > CTRL_CLICK_MOVE_TOLERANCE_PX) return;
    const vana = self.findObjectAt(down.world, { onlyVana: true });
    if (vana && vana.type === 'vana' && vana !== self.selectedObject) {
        self.selectObject(vana);
    }
}

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
    if (this.isResizing) {
        this.endResize();
        return true;
    }
    if (this.isDragging) {
        this.endDrag();
        // CTRL+kısa-tık (sürükleme eşiği aşılmamışsa) altta vana varsa
        // seçimi vana'ya çevir. startBodyDrag pointer-down'da CTRL ile arm
        // edildiyse bile, mouse hareket etmediğinde click niyeti vana'dır.
        _maybeCtrlClickSelectVana(this, e);
        return true;
    }

    // CTRL+kısa-tık vana geçişi (drag armlanmamış akışlar için)
    _maybeCtrlClickSelectVana(this, e);

    // Sürükleme (drag) kilitli/yapılmamış olsa bile (örn: sayaca bağlı ilk boru),
    // eğer bir tesisat nesnesi başarıyla seçilmişse bu tıklamayı tesisatın
    // üstlendiğini belirtmek için true dönmeliyiz. Aksi takdirde mimari sistem
    // (pointer-up.js) tıklamayı boşluğa yapılmış sayıp seçimi ve paneli kapatır.
    if (this.selectedObject) {
        return true;
    }

    return false;
}