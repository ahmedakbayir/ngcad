/**
 * Pointer Move Handler
 * Mouse hareket işlemlerini yönetir
 */

import { screenToWorld } from '../draw/geometry.js';
import { dom, state } from '../general-files/main.js';

// YENİ IMPORT
import { calculate3DSnap } from '../plumbing_v2/interactions/pipe-drawing.js';

export function handlePointerMove(e) {
    if (!this.manager.activeTool && !this.isDragging && !this.isRotating && !this.boruCizimAktif) {
        return false;
    }

    const rect = dom.c2d.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;
    const point = screenToWorld(mouseScreenX, mouseScreenY);
    const walls = state.walls || [];

    // Son mouse pozisyonunu kaydet
    this.lastMousePoint = {
        ...point,
        screenX: mouseScreenX,
        screenY: mouseScreenY
    };

    // Debug...
    if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && !this._mouseDebugCount) {
        this._mouseDebugCount = 0;
    }
    if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && this._mouseDebugCount < 3) {
        this._mouseDebugCount++;
    }

    // Snap hesapla
    if (this.isDragging && this.dragObject && this.dragObject.type === 'servis_kutusu') {
        this.activeSnap = null;
    } else {
        this.activeSnap = this.snapSystem.getSnapPoint(point, walls);
    }

    let targetPoint = this.activeSnap
        ? { x: this.activeSnap.x, y: this.activeSnap.y }
        : point;

    // 0. İç tesisat sayaç ekleme - kesikli boru çizim modu
    if (this.meterPlacementState === 'drawing_start_pipe' && this.meterStartPoint) {
        // ... (Bu blok değişmedi) ...
        let snappedPoint = targetPoint;
        const dx = targetPoint.x - this.meterStartPoint.x;
        const dy = targetPoint.y - this.meterStartPoint.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            const angles = [0, 90, 180, -90];
            let closestAngle = 0;
            let minAngleDiff = 360;

            angles.forEach(angle => {
                let diff = Math.abs(currentAngle - angle);
                while (diff > 180) diff = Math.abs(360 - diff);
                if (diff < minAngleDiff) {
                    minAngleDiff = diff;
                    closestAngle = angle;
                }
            });

            if (minAngleDiff <= 3) {
                const rad = closestAngle * Math.PI / 180;
                snappedPoint = {
                    x: this.meterStartPoint.x + Math.cos(rad) * distance,
                    y: this.meterStartPoint.y + Math.sin(rad) * distance
                };
            }
        }
        this.meterPreviewEndPoint = snappedPoint;

        if (this.manager.tempComponent && this.manager.tempComponent.type === 'sayac') {
            // ... (Ghost kodları değişmedi) ...
            const p1 = this.meterStartPoint;
            const p2 = snappedPoint;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.hypot(dx, dy);
            const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;
            this.manager.tempComponent.rotation = boruAci;
            const girisLocal = this.manager.tempComponent.getGirisLocalKoordinat();
            const rad = this.manager.tempComponent.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
            const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;
            this.manager.tempComponent.x = p2.x - girisRotatedX;
            this.manager.tempComponent.y = p2.y - girisRotatedY;
        }
        return true;
    }

    // 1. Boru çizim modunda
    if (this.boruCizimAktif) {
        // 3D Snap Uygula (Z yüksekliğini korur)
        targetPoint = calculate3DSnap(this, targetPoint, e.shiftKey);

        // Sayaç öncesi (YELLOW) hatlar için açı snap'i (3° tolerans)
        let finalTargetPoint = targetPoint;
        if (this.boruBaslangic && this.boruBaslangic.kaynakColorGroup === 'YELLOW') {
            const dx = targetPoint.x - this.boruBaslangic.nokta.x;
            const dy = targetPoint.y - this.boruBaslangic.nokta.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0) {
                const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                const angles = [0, 90, 180, -90];
                let closestAngle = 0;
                let minAngleDiff = 360;

                angles.forEach(angle => {
                    let diff = Math.abs(currentAngle - angle);
                    while (diff > 180) diff = Math.abs(360 - diff);
                    if (diff < minAngleDiff) {
                        minAngleDiff = diff;
                        closestAngle = angle;
                    }
                });

                if (minAngleDiff <= 3) {
                    const rad = closestAngle * Math.PI / 180;
                    // DÜZELTME 1: Z koordinatını koru (targetPoint.z)
                    finalTargetPoint = {
                        x: this.boruBaslangic.nokta.x + Math.cos(rad) * distance,
                        y: this.boruBaslangic.nokta.y + Math.sin(rad) * distance,
                        z: targetPoint.z || 0
                    };
                }
            }
        }

        // Eğer ölçü girişi aktifse, o ölçüye göre hedef noktayı ayarla
        if (this.measurementActive && this.measurementInput.length > 0) {
            const measurement = parseFloat(this.measurementInput);
            if (!isNaN(measurement) && measurement > 0) {
                const dx = finalTargetPoint.x - this.boruBaslangic.nokta.x;
                const dy = finalTargetPoint.y - this.boruBaslangic.nokta.y;
                const currentLength = Math.hypot(dx, dy);

                if (currentLength > 0) {
                    const dirX = dx / currentLength;
                    const dirY = dy / currentLength;
                    // DÜZELTME 2: Z koordinatını koru (targetPoint.z)
                    this.geciciBoruBitis = {
                        x: this.boruBaslangic.nokta.x + dirX * measurement,
                        y: this.boruBaslangic.nokta.y + dirY * measurement,
                        z: targetPoint.z || 0
                    };
                } else {
                    this.geciciBoruBitis = finalTargetPoint;
                }
            } else {
                this.geciciBoruBitis = finalTargetPoint;
            }
        } else {
            this.geciciBoruBitis = finalTargetPoint;
        }
        return true;
    }

    // ... (Kalan kodlar aynı) ...
    // 1.5 Pipe splitting preview
    if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
        const hoveredPipe = this.findPipeAt(point, 10);
        if (hoveredPipe) {
            const proj = hoveredPipe.projectPoint(point);
            if (proj && proj.onSegment) {
                // projectPoint artık Z döndürüyor (3D interpolate edilmiş)
                let splitPoint = { x: proj.x, y: proj.y, z: proj.z };
                const CORNER_SNAP_DISTANCE = 10;

                // 2D mesafe (ekranda)
                const distToP1 = Math.hypot(splitPoint.x - hoveredPipe.p1.x, splitPoint.y - hoveredPipe.p1.y);
                const distToP2 = Math.hypot(splitPoint.x - hoveredPipe.p2.x, splitPoint.y - hoveredPipe.p2.y);

                if (distToP1 < CORNER_SNAP_DISTANCE) {
                    splitPoint = { x: hoveredPipe.p1.x, y: hoveredPipe.p1.y, z: hoveredPipe.p1.z || 0 };
                } else if (distToP2 < CORNER_SNAP_DISTANCE) {
                    splitPoint = { x: hoveredPipe.p2.x, y: hoveredPipe.p2.y, z: hoveredPipe.p2.z || 0 };
                }

                this.pipeSplitPreview = { pipe: hoveredPipe, point: splitPoint };
            } else this.pipeSplitPreview = null;
        } else this.pipeSplitPreview = null;
        return true;
    } else {
        this.pipeSplitPreview = null;
    }

    // 1.6 Vana preview
    if (this.manager.activeTool === 'vana' && !this.boruCizimAktif) {
        // Varsayılan olarak mouse pozisyonuna getir (eğer boru yoksa)
        if (this.manager.tempComponent) {
            this.manager.tempComponent.x = point.x;
            this.manager.tempComponent.y = point.y;
            this.manager.tempComponent.rotation = 0; // Boru yoksa açıyı sıfırla
        }

        const hoveredPipe = this.findPipeAt(point, 5);
        if (hoveredPipe) {
            const proj = hoveredPipe.projectPoint(point);
            if (proj && proj.onSegment) {
                // projectPoint artık Z döndürüyor (3D interpolate edilmiş)
                let vanaPoint = { x: proj.x, y: proj.y, z: proj.z };
                let vanaT = proj.t;
                let snapToEnd = false;
                const END_SNAP_DISTANCE = 10;

                // 2D mesafe (ekranda)
                const distToP1 = Math.hypot(proj.x - hoveredPipe.p1.x, proj.y - hoveredPipe.p1.y);
                const distToP2 = Math.hypot(proj.x - hoveredPipe.p2.x, proj.y - hoveredPipe.p2.y);
                const VANA_GENISLIGI = 8;
                const BORU_UCU_BOSLUK = 1;
                const vanaMesafesi = VANA_GENISLIGI / 2 + BORU_UCU_BOSLUK;
                const pipeLength = hoveredPipe.uzunluk;

                if (distToP1 < END_SNAP_DISTANCE) {
                    const adjustedT = Math.min(vanaMesafesi / pipeLength, 0.95);
                    vanaPoint = hoveredPipe.getPointAt(adjustedT);
                    vanaT = 0; snapToEnd = true;
                } else if (distToP2 < END_SNAP_DISTANCE) {
                    const adjustedT = Math.max(1 - (vanaMesafesi / pipeLength), 0.05);
                    vanaPoint = hoveredPipe.getPointAt(adjustedT);
                    vanaT = 1; snapToEnd = true;
                }

                this.vanaPreview = { pipe: hoveredPipe, point: vanaPoint, t: vanaT, snapToEnd: snapToEnd };

                // DEĞİŞİKLİK: Ghost (tempComponent) vanayı boruya tam hizala
                if (this.manager.tempComponent) {
                    // Pozisyonu snap noktasına taşı (Z dahil)
                    this.manager.tempComponent.x = vanaPoint.x;
                    this.manager.tempComponent.y = vanaPoint.y;
                    this.manager.tempComponent.z = vanaPoint.z || 0;

                    // Açıyı boru açısına eşitle
                    this.manager.tempComponent.rotation = hoveredPipe.aciDerece;
                }

            } else this.vanaPreview = null;
        } else this.vanaPreview = null;
        return true;
    } else {
        this.vanaPreview = null;
    }

    // 1.7 Sayaç/Cihaz boru üzerine ekleme preview (boru ortasına ekleme)
    if ((this.manager.activeTool === 'sayac' || this.manager.activeTool === 'cihaz') &&
        this.manager.tempComponent && !this.manager.tempComponent.ghostConnectionInfo) {
        const hoveredPipe = this.findPipeAt(point, 10);
        if (hoveredPipe) {
            const proj = hoveredPipe.projectPoint(point);
            if (proj && proj.onSegment) {
                // projectPoint artık Z döndürüyor (3D interpolate edilmiş)
                let splitPoint = { x: proj.x, y: proj.y, z: proj.z };
                const CORNER_SNAP_DISTANCE = 10;

                // 2D mesafe (ekranda)
                const distToP1 = Math.hypot(splitPoint.x - hoveredPipe.p1.x, splitPoint.y - hoveredPipe.p1.y);
                const distToP2 = Math.hypot(splitPoint.x - hoveredPipe.p2.x, splitPoint.y - hoveredPipe.p2.y);

                if (distToP1 < CORNER_SNAP_DISTANCE) {
                    splitPoint = { x: hoveredPipe.p1.x, y: hoveredPipe.p1.y, z: hoveredPipe.p1.z || 0 };
                } else if (distToP2 < CORNER_SNAP_DISTANCE) {
                    splitPoint = { x: hoveredPipe.p2.x, y: hoveredPipe.p2.y, z: hoveredPipe.p2.z || 0 };
                }

                this.componentOnPipePreview = {
                    pipe: hoveredPipe,
                    point: splitPoint,
                    componentType: this.manager.activeTool
                };
            } else {
                this.componentOnPipePreview = null;
            }
        } else {
            this.componentOnPipePreview = null;
        }
    } else {
        this.componentOnPipePreview = null;
    }

    // 2. Ghost eleman
    if (this.manager.activeTool && this.manager.tempComponent) {
        this.updateGhostPosition(this.manager.tempComponent, targetPoint, this.activeSnap);
        return true;
    }

    // 3. Döndürme
    if (this.isRotating && this.dragObject) {
        this.handleRotation(point);
        return true;
    }

    // 4. Sürükleme
    if (this.isDragging && this.dragObject) {
        this.handleDrag(point, e);
        return true;
    }

    return false;
}