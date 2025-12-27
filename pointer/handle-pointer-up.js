/**
 * Pointer Up Handler
 * Mouse bırakma işlemlerini yönetir
 */

export function handlePointerUp(e) {
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
