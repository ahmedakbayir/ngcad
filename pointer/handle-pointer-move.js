/**
 * Pointer Move Handler
 * Mouse hareket işlemlerini yönetir
 */

import { screenToWorld } from '../draw/geometry.js';
import { dom, state } from '../general-files/main.js';

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
    this.lastMousePoint = point;

    // Debug: Mouse koordinatları (sadece cihaz ghost için, ilk 3 kez)
    if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && !this._mouseDebugCount) {
        this._mouseDebugCount = 0;
    }
    if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && this._mouseDebugCount < 3) {
        console.log('🖱️ MOUSE DEBUG:', {
            'screen (CSS px)': `(${mouseScreenX.toFixed(1)}, ${mouseScreenY.toFixed(1)})`,
            'world': `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`,
            'canvas size': `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`
        });
        this._mouseDebugCount++;
    }

    // Snap hesapla
    // ✨ FIX: Servis kutusu taşınırken snap sistemini devre dışı bırak
    // Böylece dirseklerin veya uçların üzerinden geçerken "yutma" (yapışma) yapmaz
    if (this.isDragging && this.dragObject && this.dragObject.type === 'servis_kutusu') {
        this.activeSnap = null;
    } else {
        this.activeSnap = this.snapSystem.getSnapPoint(point, walls);
    }

    const targetPoint = this.activeSnap
        ? { x: this.activeSnap.x, y: this.activeSnap.y }
        : point;

    // 0. İç tesisat sayaç ekleme - kesikli boru çizim modu
    if (this.meterPlacementState === 'drawing_start_pipe' && this.meterStartPoint) {
        // Preview için bitiş noktasını güncelle
        this.meterPreviewEndPoint = targetPoint;

        // Sayaç ghost'unu güncelle (mevcut ghost sistemi)
        if (this.manager.tempComponent && this.manager.tempComponent.type === 'sayac') {
            const p1 = this.meterStartPoint;
            const p2 = targetPoint;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.hypot(dx, dy);

            // Boru açısı
            const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;
            const fleksUzunluk = 15; // cm

            // Perpendicular yön
            const perpX = -dy / length;
            const perpY = dx / length;

            // Sayaç rotation
            this.manager.tempComponent.rotation = boruAci;

            // Sayaç pozisyon (giriş noktası p2'de olacak)
            const girisLocal = this.manager.tempComponent.getGirisLocalKoordinat();
            const rad = this.manager.tempComponent.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
            const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

            // Mouse pozisyonu = fleks ucu (giriş noktası)
            this.manager.tempComponent.x = p2.x - girisRotatedX;
            this.manager.tempComponent.y = p2.y - girisRotatedY;
        }

        return true;
    }

    // 1. Boru çizim modunda
    if (this.boruCizimAktif) {
        // Sayaç öncesi (YELLOW) hatlar için açı snap'i (3° tolerans)
        let finalTargetPoint = targetPoint;
        console.log('🔍 DEBUG - kaynakColorGroup:', this.boruBaslangic?.kaynakColorGroup);
        if (this.boruBaslangic && this.boruBaslangic.kaynakColorGroup === 'YELLOW') {
            console.log('✅ YELLOW hat tespit edildi - açı snap aktif');
            const dx = targetPoint.x - this.boruBaslangic.nokta.x;
            const dy = targetPoint.y - this.boruBaslangic.nokta.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0) {
                // Mevcut açıyı hesapla
                const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;

                // En yakın dik açıyı bul (0°, 90°, 180°, -90°)
                const angles = [0, 90, 180, -90];
                let closestAngle = 0;
                let minAngleDiff = 360;

                angles.forEach(angle => {
                    let diff = Math.abs(currentAngle - angle);
                    // Açı farkını 0-180 aralığına normalize et
                    while (diff > 180) diff = Math.abs(360 - diff);
                    if (diff < minAngleDiff) {
                        minAngleDiff = diff;
                        closestAngle = angle;
                    }
                });

                // 3° tolerans içinde mi?
                if (minAngleDiff <= 3) {
                    const rad = closestAngle * Math.PI / 180;
                    finalTargetPoint = {
                        x: this.boruBaslangic.nokta.x + Math.cos(rad) * distance,
                        y: this.boruBaslangic.nokta.y + Math.sin(rad) * distance
                    };
                }
            }
        }

        // Eğer ölçü girişi aktifse, o ölçüye göre hedef noktayı ayarla
        if (this.measurementActive && this.measurementInput.length > 0) {
            const measurement = parseFloat(this.measurementInput);
            if (!isNaN(measurement) && measurement > 0) {
                // Yönü hesapla (başlangıçtan finalTargetPoint'e doğru)
                const dx = finalTargetPoint.x - this.boruBaslangic.nokta.x;
                const dy = finalTargetPoint.y - this.boruBaslangic.nokta.y;
                const currentLength = Math.hypot(dx, dy);

                if (currentLength > 0) {
                    // Normalize et ve ölçü kadar uzat
                    const dirX = dx / currentLength;
                    const dirY = dy / currentLength;

                    this.geciciBoruBitis = {
                        x: this.boruBaslangic.nokta.x + dirX * measurement,
                        y: this.boruBaslangic.nokta.y + dirY * measurement
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

    // 1.5 Boru tool aktif ama çizim modu değil - Pipe splitting preview
    if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
        // Mouse altında boru var mı kontrol et
        const hoveredPipe = this.findPipeAt(point, 10);
        if (hoveredPipe) {
            // Split noktasını hesapla
            const proj = hoveredPipe.projectPoint(point);
            if (proj && proj.onSegment) {
                let splitPoint = { x: proj.x, y: proj.y };

                // Köşelere snap - boru uçlarına yakınsa
                const CORNER_SNAP_DISTANCE = 10; // 10 cm
                const distToP1 = Math.hypot(splitPoint.x - hoveredPipe.p1.x, splitPoint.y - hoveredPipe.p1.y);
                const distToP2 = Math.hypot(splitPoint.x - hoveredPipe.p2.x, splitPoint.y - hoveredPipe.p2.y);

                if (distToP1 < CORNER_SNAP_DISTANCE) {
                    // p1'e snap
                    splitPoint = { x: hoveredPipe.p1.x, y: hoveredPipe.p1.y };
                } else if (distToP2 < CORNER_SNAP_DISTANCE) {
                    // p2'ye snap
                    splitPoint = { x: hoveredPipe.p2.x, y: hoveredPipe.p2.y };
                }

                this.pipeSplitPreview = {
                    pipe: hoveredPipe,
                    point: splitPoint
                };
            } else {
                this.pipeSplitPreview = null;
            }
        } else {
            this.pipeSplitPreview = null;
        }
        return true;
    } else {
        // Boru tool aktif değilse preview'ı temizle
        this.pipeSplitPreview = null;
    }

    // 1.6 Vana tool aktif - Vana preview
    if (this.manager.activeTool === 'vana' && !this.boruCizimAktif) {
        // Ghost pozisyonunu güncelle (tempComponent mouse'u takip etmeli)
        if (this.manager.tempComponent) {
            this.manager.tempComponent.x = point.x;
            this.manager.tempComponent.y = point.y;
        }

        // Mouse altında boru var mı kontrol et (5 cm yakalama mesafesi)
        const hoveredPipe = this.findPipeAt(point, 5);
        if (hoveredPipe) {
            // Boruda vana varsa da preview göster (boru bölünecek)
            // Boru üzerindeki pozisyonu hesapla
            const proj = hoveredPipe.projectPoint(point);
            if (proj && proj.onSegment) {
                let vanaPoint = { x: proj.x, y: proj.y };
                let vanaT = proj.t;
                let snapToEnd = false;

                // Boru uçlarına snap - 10 cm tolerance
                const END_SNAP_DISTANCE = 10;
                const distToP1 = Math.hypot(proj.x - hoveredPipe.p1.x, proj.y - hoveredPipe.p1.y);
                const distToP2 = Math.hypot(proj.x - hoveredPipe.p2.x, proj.y - hoveredPipe.p2.y);

                // Vana mesafesi hesapla (armLength + vana genişliği/2)
                const DIRSEK_KOL_UZUNLUGU = 4; // cm
                const VANA_GENISLIGI = 8; // cm (vana kare boyutu)
                const vanaMesafesi = DIRSEK_KOL_UZUNLUGU + VANA_GENISLIGI / 2; // 7 cm
                const pipeLength = hoveredPipe.uzunluk;

                if (distToP1 < END_SNAP_DISTANCE) {
                    // p1'e snap - vana içeri alınmış pozisyonda göster
                    const adjustedT = Math.min(vanaMesafesi / pipeLength, 0.95);
                    vanaPoint = hoveredPipe.getPointAt(adjustedT);
                    vanaT = 0; // Snap için t=0 (uç nokta)
                    snapToEnd = true;
                } else if (distToP2 < END_SNAP_DISTANCE) {
                    // p2'ye snap - vana içeri alınmış pozisyonda göster
                    const adjustedT = Math.max(1 - (vanaMesafesi / pipeLength), 0.05);
                    vanaPoint = hoveredPipe.getPointAt(adjustedT);
                    vanaT = 1; // Snap için t=1 (uç nokta)
                    snapToEnd = true;
                }

                this.vanaPreview = {
                    pipe: hoveredPipe,
                    point: vanaPoint,
                    t: vanaT,
                    snapToEnd: snapToEnd
                };
            } else {
                this.vanaPreview = null;
            }
        } else {
            this.vanaPreview = null;
        }
        return true;
    } else {
        // Vana tool aktif değilse preview'ı temizle
        this.vanaPreview = null;
    }

    // 2. Ghost eleman yerleştirme
    if (this.manager.activeTool && this.manager.tempComponent) {
        this.updateGhostPosition(this.manager.tempComponent, targetPoint, this.activeSnap);
        return true;
    }

    // 3. Döndürme
    if (this.isRotating && this.dragObject) {
        this.handleRotation(point);
        return true;
    }

    // 4. Sürükleme - raw point kullan (handleDrag içinde gerekli snap yapılır)
    if (this.isDragging && this.dragObject) {
        this.handleDrag(point);
        return true;
    }

    return false;
}