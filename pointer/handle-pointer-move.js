/**
 * Pointer Move Handler
 * Mouse hareket işlemlerini yönetir
 */

import { screenToWorld } from '../draw/geometry.js';
import { dom, state } from '../general-files/main.js';

// YENİ IMPORT
import { calculate3DSnap } from '../plumbing_v2/interactions/pipe-drawing.js';
import { findGizmoAxisAt, findTranslateGizmoAxisAt } from '../plumbing_v2/interactions/finders.js';

export function handlePointerMove(e) {
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

    // Gizmo hover kontrolü (seçili nesne varsa ve sürüklenmiyorsa)
    if (this.selectedObject && !this.isDragging) {
        if (this.selectedObject.type === 'boru') {
            // Endpoint seçiliyse sadece o noktayı kontrol et
            if (this.selectedEndpoint) {
                const gizmoCenter = this.selectedEndpoint === 'p1' ? this.selectedObject.p1 : this.selectedObject.p2;
                const allowedAxes = ['X', 'Y', 'Z']; // Endpoint için tüm eksenler kullanılabilir
                this.hoveredGizmoAxis = findTranslateGizmoAxisAt(gizmoCenter, point, allowedAxes);
            } else {
                // Boru gövdesi seçili: merkez + p1 + p2 gizmo'larını kontrol et

                // Borunun uzandığı ekseni hesapla
                const dx = Math.abs(this.selectedObject.p2.x - this.selectedObject.p1.x);
                const dy = Math.abs(this.selectedObject.p2.y - this.selectedObject.p1.y);
                const dz = Math.abs((this.selectedObject.p2.z || 0) - (this.selectedObject.p1.z || 0));

                let bodyAllowedAxes = ['X', 'Y', 'Z'];
                if (dx > dy && dx > dz) {
                    bodyAllowedAxes = ['Y', 'Z'];
                } else if (dy > dx && dy > dz) {
                    bodyAllowedAxes = ['X', 'Z'];
                } else if (dz > dx && dz > dy) {
                    bodyAllowedAxes = ['X', 'Y'];
                }

                // Merkez gizmo kontrolü
                const centerPoint = {
                    x: (this.selectedObject.p1.x + this.selectedObject.p2.x) / 2,
                    y: (this.selectedObject.p1.y + this.selectedObject.p2.y) / 2,
                    z: ((this.selectedObject.p1.z || 0) + (this.selectedObject.p2.z || 0)) / 2
                };
                const centerAxis = findTranslateGizmoAxisAt(centerPoint, point, bodyAllowedAxes);

                // p1 gizmo kontrolü
                const p1Axis = findTranslateGizmoAxisAt(this.selectedObject.p1, point, ['X', 'Y', 'Z']);

                // p2 gizmo kontrolü
                const p2Axis = findTranslateGizmoAxisAt(this.selectedObject.p2, point, ['X', 'Y', 'Z']);

                // Sadece mouse'un gerçekten üzerinde olduğu gizmoda eksen aktif olsun
                if (p1Axis) {
                    this.hoveredGizmoAxis = p1Axis;
                    this.hoveredGizmoId = 'p1';
                } else if (p2Axis) {
                    this.hoveredGizmoAxis = p2Axis;
                    this.hoveredGizmoId = 'p2';
                } else if (centerAxis) {
                    this.hoveredGizmoAxis = centerAxis;
                    this.hoveredGizmoId = 'center';
                } else {
                    this.hoveredGizmoAxis = null;
                    this.hoveredGizmoId = null;
                }
            }
        } else if (this.selectedObject.type === 'vana' || this.selectedObject.type === 'sayac' ||
                   this.selectedObject.type === 'cihaz' || this.selectedObject.type === 'servis_kutusu') {
            const gizmoCenter = { x: this.selectedObject.x, y: this.selectedObject.y, z: this.selectedObject.z || 0 };
            this.hoveredGizmoAxis = findTranslateGizmoAxisAt(gizmoCenter, point, ['X', 'Y', 'Z']);
        } else {
            this.hoveredGizmoAxis = null;
        }
    } else {
        this.hoveredGizmoAxis = null;
    }

    if (!this.manager.activeTool && !this.isDragging && !this.isRotating && !this.boruCizimAktif) {
        return false;
    }

    // Debug...
    if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && !this._mouseDebugCount) {
        this._mouseDebugCount = 0;
    }
    if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && this._mouseDebugCount < 3) {
        this._mouseDebugCount++;
    }

    // Snap hesapla
    // 3D modda boru çizim sırasında endpoint snap'i devre dışı bırak
    const t = state.viewBlendFactor || 0;
    const is3DMode = t > 0.5;

    if (this.isDragging && this.dragObject && this.dragObject.type === 'servis_kutusu') {
        this.activeSnap = null;
    } else if (this.boruCizimAktif && is3DMode) {
        // 3D modda boru çizerken endpoint snap kullanma
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
        // findBoruGovdeAt kullan - hem boruyu hem 3D noktayı döndürür
        // Tolerance 15 (düşey borular için daha büyük)
        const boruGovde = this.manager.interactionManager.findBoruGovdeAt(point, 15);
        if (boruGovde) {
            const hoveredPipe = this.manager.findPipeById(boruGovde.boruId);
            if (hoveredPipe) {
                // boruGovde.nokta zaten 3D (x, y, z)
                let splitPoint = { x: boruGovde.nokta.x, y: boruGovde.nokta.y, z: boruGovde.nokta.z };
                const CORNER_SNAP_DISTANCE = 10;

                // 2D mesafe (ekranda görünen)
                const distToP1 = Math.hypot(
                    splitPoint.x - hoveredPipe.p1.x,
                    splitPoint.y - hoveredPipe.p1.y,
                    (splitPoint.z || 0) - (hoveredPipe.p1.z || 0)
                );
                const distToP2 = Math.hypot(
                    splitPoint.x - hoveredPipe.p2.x,
                    splitPoint.y - hoveredPipe.p2.y,
                    (splitPoint.z || 0) - (hoveredPipe.p2.z || 0)
                );

                if (distToP1 < CORNER_SNAP_DISTANCE) {
                    splitPoint = { x: hoveredPipe.p1.x, y: hoveredPipe.p1.y, z: hoveredPipe.p1.z || 0 };
                } else if (distToP2 < CORNER_SNAP_DISTANCE) {
                    splitPoint = { x: hoveredPipe.p2.x, y: hoveredPipe.p2.y, z: hoveredPipe.p2.z || 0 };
                }

                this.pipeSplitPreview = { pipe: hoveredPipe, point: splitPoint };
            } else {
                this.pipeSplitPreview = null;
            }
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
            this.manager.tempComponent.rotation = 0; 
        }

        const boruGovde = this.manager.interactionManager.findBoruGovdeAt(point, 10);
        if (boruGovde) {
            const hoveredPipe = this.manager.findPipeById(boruGovde.boruId);
            if (hoveredPipe) {
                // 3D nokta (Z dahil)
                let vanaPoint = { x: boruGovde.nokta.x, y: boruGovde.nokta.y, z: boruGovde.nokta.z };

                // Boru 3D uzunluğu ve VanaT hesabı
                const dx = hoveredPipe.p2.x - hoveredPipe.p1.x;
                const dy = hoveredPipe.p2.y - hoveredPipe.p1.y;
                const dz = (hoveredPipe.p2.z || 0) - (hoveredPipe.p1.z || 0);
                const totalLen = Math.hypot(dx, dy, dz);

                // Noktanın P1'e olan 3D mesafesi
                const vdx = vanaPoint.x - hoveredPipe.p1.x;
                const vdy = vanaPoint.y - hoveredPipe.p1.y;
                const vdz = (vanaPoint.z || 0) - (hoveredPipe.p1.z || 0);
                const distToP1_3D = Math.hypot(vdx, vdy, vdz);

                // vanaT (0-1 arası oran)
                let vanaT = totalLen > 0 ? distToP1_3D / totalLen : 0.5;
                
                // Sınırlandırma
                vanaT = Math.max(0, Math.min(1, vanaT));

                // Uçlara yapışma (Snap to End) Kontrolü
                // KRITIK: 3D modda snap kontrolü T parametresine göre yapılmalı (ekran mesafesi değil)
                let snapToEnd = false;
                const END_SNAP_T_THRESHOLD = 0.05; // Boru uzunluğunun %5'i
                const VANA_GENISLIGI = 6;
                const BORU_UCU_BOSLUK = 0;
                const vanaMesafesi = VANA_GENISLIGI / 2 + BORU_UCU_BOSLUK; // ~5cm

                // T parametresine göre snap kontrolü (0'a yakın = P1, 1'e yakın = P2)
                if (vanaT < END_SNAP_T_THRESHOLD) {
                    // P1'e çok yakın
                    const adjustedT = totalLen > 0 ? Math.min(vanaMesafesi / totalLen, 0.95) : 0;
                    vanaPoint = hoveredPipe.getPointAt(adjustedT);
                    vanaT = 0; // Mantıksal olarak uçta
                    snapToEnd = true;
                } else if (vanaT > (1 - END_SNAP_T_THRESHOLD)) {
                    // P2'ye çok yakın
                    const adjustedT = totalLen > 0 ? Math.max(1 - (vanaMesafesi / totalLen), 0.05) : 1;
                    vanaPoint = hoveredPipe.getPointAt(adjustedT);
                    vanaT = 1; // Mantıksal olarak uçta
                    snapToEnd = true;
                }

                // Preview nesnesini güncelle
                this.vanaPreview = { pipe: hoveredPipe, point: vanaPoint, t: vanaT, snapToEnd: snapToEnd };

                // --- GHOST NESNE GÜNCELLEMESİ ---
                if (this.manager.tempComponent) {
                    const t = state.viewBlendFactor || 0;
                    const z = vanaPoint.z || 0;
                    
                    // 1. KONUM: Z etkisini X ve Y'ye ekle (Ekranda doğru yerde görünsün)
                    this.manager.tempComponent.x = vanaPoint.x + (z * t);
                    this.manager.tempComponent.y = vanaPoint.y - (z * t);
                    this.manager.tempComponent.z = 0; // Renderer'a Z göndermiyoruz, manuel işledik

                    // 2. AÇI: Düşey boru kontrolü
                    const len2d = Math.hypot(dx, dy);

                    // Boru düşey mi? (Z farkı baskınsa veya 2D uzunluk kısaysa)
                    const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

                    if (isVertical && t > 0.1) {
                        // 3D modunda düşey boru -45 derece görünür
                        this.manager.tempComponent.rotation = -45;
                    } else {
                        // Yatay boru normal açısında
                        this.manager.tempComponent.rotation = hoveredPipe.aciDerece;
                    }
                }
            } else {
                this.vanaPreview = null;
            }
        } else this.vanaPreview = null;
        return true;
    } else {
        this.vanaPreview = null;
    }


    // 1.7 Sayaç/Cihaz boru üzerine ekleme preview (boru ortasına ekleme)
    if ((this.manager.activeTool === 'sayac' || this.manager.activeTool === 'cihaz') &&
        this.manager.tempComponent && !this.manager.tempComponent.ghostConnectionInfo) {
        // findBoruGovdeAt kullan - hem boruyu hem 3D noktayı döndürür
        // Tolerance 15 (düşey borular için daha büyük)
        const boruGovde = this.manager.interactionManager.findBoruGovdeAt(point, 15);
        if (boruGovde) {
            const hoveredPipe = this.manager.findPipeById(boruGovde.boruId);
            if (hoveredPipe) {
                // boruGovde.nokta zaten 3D (x, y, z)
                let splitPoint = { x: boruGovde.nokta.x, y: boruGovde.nokta.y, z: boruGovde.nokta.z };
                const CORNER_SNAP_DISTANCE = 10;

                // 2D mesafe (ekranda görünen)
                const distToP1 = Math.hypot(
                    splitPoint.x - hoveredPipe.p1.x,
                    splitPoint.y - hoveredPipe.p1.y,
                    (splitPoint.z || 0) - (hoveredPipe.p1.z || 0)
                );
                const distToP2 = Math.hypot(
                    splitPoint.x - hoveredPipe.p2.x,
                    splitPoint.y - hoveredPipe.p2.y,
                    (splitPoint.z || 0) - (hoveredPipe.p2.z || 0)
                );

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