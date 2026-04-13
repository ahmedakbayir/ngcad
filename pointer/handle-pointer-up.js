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
    return false;
}
