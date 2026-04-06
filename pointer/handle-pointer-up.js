/**
 * Pointer Up Handler
 * Mouse bırakma işlemlerini yönetir
 */

import { endLabelDrag } from '../plumbing_v2/renderer/renderer-labels.js';

export function handlePointerUp(e) {
    if (this.isDraggingLabel) {
        endLabelDrag();
        this.isDraggingLabel = false;
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
