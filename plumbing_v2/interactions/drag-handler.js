/**
 * Drag Handler - 3D LENGTH FIX + RECURSIVE MOVE (CTRL)
 * "Boru boyu 0 olamaz" kontrolüne Z ekseni eklendi.
 * Artık düşey borulara (X=0, Y=0, Z=100) izin verilir.
 * CTRL ile tam ağaç taşıma (Endpoint ve Body) eklendi.
 */

import { BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { saveState } from '../../general-files/history.js';
import { getObjectsOnPipe } from './placement-utils.js';
import { Boru } from '../objects/pipe.js';
import { state } from '../../general-files/main.js';
import { TESISAT_CONSTANTS } from './tesisat-snap.js';

export function isProtectedPoint(point, manager, currentPipe, oldPoint, excludeComponentId = null, skipBostaUcCheck = false) {
    const TOLERANCE = 10;
    const Z_TOLERANCE = 8;
    const pointZ = point.z !== undefined ? point.z : 0;

    const servisKutusuCikisi = manager.components.some(c => {
        if (c.type !== 'servis_kutusu') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;
        const cikis = c.getCikisNoktasi();
        if (!cikis) return false;
        const dist = Math.hypot(point.x - cikis.x, point.y - cikis.y);
        const distZ = Math.abs(pointZ - (c.z || 0));
        return dist < TOLERANCE && distZ < Z_TOLERANCE;
    });
    if (servisKutusuCikisi) return true;

    const sayacGirisi = manager.components.some(c => {
        if (c.type !== 'sayac') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;
        if (c.fleksBaglanti?.boruId) {
            const girisBoru = manager.pipes.find(p => p.id === c.fleksBaglanti.boruId);
            if (currentPipe && girisBoru && currentPipe.id === girisBoru.id) return false;
            const girisPoint = girisBoru[c.fleksBaglanti.endpoint];
            const dist = Math.hypot(point.x - girisPoint.x, point.y - girisPoint.y);
            const distZ = Math.abs(pointZ - (girisPoint.z || 0));
            if (dist < TOLERANCE && distZ < Z_TOLERANCE) return true;
        }
        return false;
    });
    if (sayacGirisi) return true;

    const sayacCikisi = manager.components.some(c => {
        if (c.type !== 'sayac') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;
        if (c.cikisBagliBoruId) {
            const cikisBoru = manager.pipes.find(p => p.id === c.cikisBagliBoruId);
            if (currentPipe && cikisBoru && currentPipe.id === cikisBoru.id) return false;
            const cikisPoint = c.getCikisNoktasi();
            const dist = Math.hypot(point.x - cikisPoint.x, point.y - cikisPoint.y);
            const distZ = Math.abs(pointZ - (c.z || 0));
            if (dist < TOLERANCE && distZ < Z_TOLERANCE) return true;
        }
        return false;
    });
    if (sayacCikisi) return true;

    const cihazFleksi = manager.components.some(c => {
        if (c.type !== 'cihaz') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;
        if (c.fleksBaglanti && c.fleksBaglanti.boruId && c.fleksBaglanti.endpoint) {
            const boru = manager.pipes.find(p => p.id === c.fleksBaglanti.boruId);
            if (boru) {
                const boruUcu = boru[c.fleksBaglanti.endpoint];
                const dist = Math.hypot(point.x - boruUcu.x, point.y - boruUcu.y);
                const distZ = Math.abs(pointZ - (boruUcu.z || 0));
                if (dist < TOLERANCE && distZ < Z_TOLERANCE) return true;
            }
        }
        const giris = c.getGirisNoktasi();
        if (!giris) return false;
        const dist = Math.hypot(point.x - giris.x, point.y - giris.y);
        const distZ = Math.abs(pointZ - (c.z || 0));
        return dist < TOLERANCE && distZ < Z_TOLERANCE;
    });
    if (cihazFleksi) return true;

    const DIRSEK_TOLERANCE = 10;
    const elbowConnectionTol = 1;
    const isDirsek = manager.pipes.some(otherPipe => {
        if (otherPipe === currentPipe) return false;
        for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
            if (oldPoint) {
                const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                if (distToOld < elbowConnectionTol) continue;
            }
            const distToEndpoint = Math.hypot(point.x - endpoint.x, point.y - endpoint.y);
            const distZ = Math.abs(pointZ - (endpoint.z || 0));
            if (distToEndpoint >= DIRSEK_TOLERANCE || distZ >= Z_TOLERANCE) continue;
            const bagliBoruSayisi = manager.pipes.filter(p => {
                if (p === otherPipe) return false;
                const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                return d1 < elbowConnectionTol || d2 < elbowConnectionTol;
            }).length;
            if (bagliBoruSayisi >= 1) return true;
        }
        return false;
    });
    if (isDirsek) return true;

    if (!skipBostaUcCheck) {
        const BOSTA_UC_TOLERANCE = 10;
        const bostaUc = manager.pipes.some(otherPipe => {
            if (otherPipe === currentPipe) return false;
            for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                if (oldPoint) {
                    const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                    if (distToOld < 1) continue;
                }
                const dist = Math.hypot(point.x - endpoint.x, point.y - endpoint.y);
                const distZ = Math.abs(pointZ - (endpoint.z || 0));
                if (dist >= BOSTA_UC_TOLERANCE || distZ >= Z_TOLERANCE) continue;
                const connectedPipeCount = manager.pipes.filter(p => {
                    if (p === otherPipe || p === currentPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < 1 || d2 < 1;
                }).length;
                if (connectedPipeCount === 0) return true;
            }
            return false;
        });
        if (bostaUc) return true;
    }
    return false;
}

export function findPipesAtPoint(pipes, point, excludePipe = null, tolerance = TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
    const pipesAtPoint = [];
    pipes.forEach(pipe => {
        if (pipe === excludePipe) return;
        const distToP1 = Math.hypot(pipe.p1.x - point.x, pipe.p1.y - point.y, (pipe.p1.z || 0) - (point.z || 0));
        const distToP2 = Math.hypot(pipe.p2.x - point.x, pipe.p2.y - point.y, (pipe.p2.z || 0) - (point.z || 0));
        if (distToP1 < tolerance) pipesAtPoint.push({ pipe, endpoint: 'p1' });
        if (distToP2 < tolerance) pipesAtPoint.push({ pipe, endpoint: 'p2' });
    });
    return pipesAtPoint;
}

export function startEndpointDrag(interactionManager, pipe, endpoint, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = pipe;
    interactionManager.dragEndpoint = endpoint;
    interactionManager.dragStart = { ...point };
    interactionManager.selectedDragAxis = null; // Otomatik belirlenecek
    interactionManager.dragStartWorldPos = null; // Başlangıç pozisyonunu sıfırla

    const draggedPoint = endpoint === 'p1' ? pipe.p1 : pipe.p2;

    // Endpoint'in başlangıç pozisyonunu kaydet (offset için)
    interactionManager.dragStartObjectPos = {
        x: draggedPoint.x,
        y: draggedPoint.y,
        z: draggedPoint.z || 0
    };

    interactionManager.snapSystem.setStartPoint(draggedPoint, pipe.id);

    // Düğüm paylaşımı sayesinde connectedPipesAtEndpoint taramasına gerek yok:
    // draggedPoint bir düğüm nesnesidir; taşındığında onu paylaşan tüm borular otomatik güncellenir.
    interactionManager.connectedPipesAtEndpoint = null;
}

export function startDrag(interactionManager, obj, point) {
    if (obj.type === 'baca' && obj.parentCihazId) {
        const parentCihaz = interactionManager.manager.components.find(c => c.id === obj.parentCihazId);
        if (parentCihaz) obj = parentCihaz;
    }

    interactionManager.isDragging = true;
    interactionManager.dragObject = obj;
    interactionManager.dragEndpoint = null;
    interactionManager.selectedEndpoint = null; // Endpoint drag olmayan durumlarda endpoint seçimi yok
    interactionManager.dragStart = { ...point };
    interactionManager.selectedDragAxis = null; // Otomatik belirlenecek
    interactionManager.dragStartWorldPos = null; // Başlangıç pozisyonunu sıfırla

    // Nesnenin başlangıç pozisyonunu kaydet (offset için)
    interactionManager.dragStartObjectPos = {
        x: obj.x,
        y: obj.y,
        z: obj.z || 0
    };

    if (obj.type === 'vana' && obj.bagliBoruId) {
        interactionManager.dragObjectPipe = interactionManager.manager.pipes.find(p => p.id === obj.bagliBoruId);
        interactionManager.dragObjectsOnPipe = getObjectsOnPipe(interactionManager.manager.components, obj.bagliBoruId);
        interactionManager.dragStartZ = obj.z || 0;
    } else {
        interactionManager.dragObjectPipe = null;
        interactionManager.dragObjectsOnPipe = null;
        interactionManager.dragStartZ = null;
    }

    interactionManager.verticalOtherEndsOutput = [];

    if (obj.type === 'servis_kutusu' && obj.bagliBoruId) {
        const boru = interactionManager.manager.pipes.find(p => p.id === obj.bagliBoruId);
        if (boru) {
            interactionManager.servisKutusuConnectedPipes = findPipesAtPoint(
                interactionManager.manager.pipes, boru.p1, boru, TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE
            );
            // Çıkış noktasına bağlı düşey boruların diğer uçları
            interactionManager.verticalOtherEndsOutput = findVerticalConnectedOtherEnds(interactionManager.manager, boru.p1, boru);
        }
    }

    if (obj.type === 'sayac' && obj.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
        if (cikisBoru) {
            // Sayacın çıkış node'una bağlı düşey boruların diğer uçları
            interactionManager.verticalOtherEndsOutput = findVerticalConnectedOtherEnds(interactionManager.manager, cikisBoru.p1, cikisBoru);
            const girisBoru = obj.fleksBaglanti?.boruId
                ? interactionManager.manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId)
                : null;
            const excludePipes = [cikisBoru];
            if (girisBoru) excludePipes.push(girisBoru);

            const outputConnectedPipes = [];
            interactionManager.manager.pipes.forEach(p => {
                if (excludePipes.includes(p)) return;
                const distToP1 = Math.hypot(p.p1.x - cikisBoru.p1.x, p.p1.y - cikisBoru.p1.y, (p.p1.z || 0) - (cikisBoru.p1.z || 0));
                const distToP2 = Math.hypot(p.p2.x - cikisBoru.p1.x, p.p2.y - cikisBoru.p1.y, (p.p2.z || 0) - (cikisBoru.p1.z || 0));
                if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) outputConnectedPipes.push({ pipe: p, endpoint: 'p1' });
                if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) outputConnectedPipes.push({ pipe: p, endpoint: 'p2' });
            });
            interactionManager.sayacConnectedPipes = outputConnectedPipes;
        }
    }
}

export function startBodyDrag(interactionManager, pipe, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = pipe;
    interactionManager.dragEndpoint = null;
    interactionManager.selectedEndpoint = null; // Body drag sırasında endpoint seçimi yok
    interactionManager.dragStart = { ...point };
    interactionManager.isBodyDrag = true;
    interactionManager.bodyDragInitialP1 = { ...pipe.p1 };
    interactionManager.bodyDragInitialP2 = { ...pipe.p2 };
    interactionManager.selectedDragAxis = null; // Otomatik belirlenecek
    interactionManager.dragStartWorldPos = null; // Başlangıç pozisyonunu sıfırla

    // Borunun merkez pozisyonunu kaydet (offset için)
    interactionManager.dragStartObjectPos = {
        x: (pipe.p1.x + pipe.p2.x) / 2,
        y: (pipe.p1.y + pipe.p2.y) / 2,
        z: ((pipe.p1.z || 0) + (pipe.p2.z || 0)) / 2
    };

    // Borunun hangi eksende uzandığını belirle
    const dx = Math.abs(pipe.p2.x - pipe.p1.x);
    const dy = Math.abs(pipe.p2.y - pipe.p1.y);
    const dz = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));

    // En uzun eksen = borunun uzandığı eksen = taşınamaz eksen
    if (dx >= dy && dx >= dz) {
        interactionManager.bodyDragPrimaryAxis = 'X'; // X'te uzanıyor, Y-Z'de taşınabilir
    } else if (dy >= dx && dy >= dz) {
        interactionManager.bodyDragPrimaryAxis = 'Y'; // Y'de uzanıyor, X-Z'de taşınabilir
    } else {
        interactionManager.bodyDragPrimaryAxis = 'Z'; // Z'de uzanıyor, X-Y'de taşınabilir
    }

 //   console.log(`🔧 Gövde taşıma: Boru ${interactionManager.bodyDragPrimaryAxis} ekseninde uzanıyor`);

    // Zincir mantığı kaldırıldı: sürüklenen borunun SADECE kendi p1/p2 düğümleri taşınır.
    // O düğümleri paylaşan komşu borular node sharing sayesinde otomatik gerilir;
    // komşu boruların dış uç noktaları hiç hareket etmez.
    interactionManager.alignedPipeChain = null;
    interactionManager.alignedChainConnections = null;

    if (!window.__lastDraggedPipe) window.__lastDraggedPipe = { pipe: null, positions: null };

    // Düğüm paylaşan komşu boruları bul — checkEndpointDistance'ın bunları
    // "çakışma" olarak saymaması için listeye ekliyoruz.
    const _connAtP1 = interactionManager.manager.getPipesAtNode(pipe.p1, pipe);
    const _connAtP2 = interactionManager.manager.getPipesAtNode(pipe.p2, pipe);
    interactionManager.connectedPipesAtP1 = _connAtP1.map(p => ({ pipe: p }));
    interactionManager.connectedPipesAtP2 = _connAtP2.map(p => ({ pipe: p }));
    interactionManager.meterConnectedPipesAtOutput = null;

    // Düşey boru tespiti: p1/p2'ye bağlı düşey boruların diğer uçlarını sakla
    interactionManager.verticalOtherEndsP1 = findVerticalConnectedOtherEnds(interactionManager.manager, pipe.p1, pipe);
    interactionManager.verticalOtherEndsP2 = findVerticalConnectedOtherEnds(interactionManager.manager, pipe.p2, pipe);

    // Kutu/sayaç bağlantısı olan ucu kilitle: o uç hareket etmemeli
    // p1 = baslangicBaglanti, p2 = bitisBaglanti
    const p1Tip = pipe.baslangicBaglanti?.tip;
    const p2Tip = pipe.bitisBaglanti?.tip;
    const LOCKED_TIPS = [BAGLANTI_TIPLERI.SERVIS_KUTUSU, BAGLANTI_TIPLERI.SAYAC];
    interactionManager.bodyDragLockedEndpoint = null;
    if (LOCKED_TIPS.includes(p1Tip)) interactionManager.bodyDragLockedEndpoint = 'p1';
    else if (LOCKED_TIPS.includes(p2Tip)) interactionManager.bodyDragLockedEndpoint = 'p2';

    // useBridgeMode: p1 ve p2'nin her birinde tam olarak 1 başka boru bağlıysa
    // ve üçü sıralı/hizalıysa köprü modu aktif olur.
    interactionManager.useBridgeMode = false;
    const connAtP1 = interactionManager.manager.getPipesAtNode(pipe.p1, pipe);
    const connAtP2 = interactionManager.manager.getPipesAtNode(pipe.p2, pipe);

    if (connAtP1.length === 1 && connAtP2.length === 1) {
        const pipeA = connAtP1[0];
        const pipeC = connAtP2[0];
        const p1OfA = (pipeA.p1 === pipe.p1) ? pipeA.p2 : pipeA.p1;
        const p2OfC = (pipeC.p1 === pipe.p2) ? pipeC.p2 : pipeC.p1;

        const v1 = { x: pipe.p1.x - p1OfA.x, y: pipe.p1.y - p1OfA.y };
        const v2 = { x: pipe.p2.x - pipe.p1.x, y: pipe.p2.y - pipe.p1.y };
        const v3 = { x: p2OfC.x - pipe.p2.x, y: p2OfC.y - pipe.p2.y };
        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        const len3 = Math.hypot(v3.x, v3.y);

        if (len1 > 0.1 && len2 > 0.1 && len3 > 0.1) {
            const dir1 = { x: v1.x / len1, y: v1.y / len1 };
            const dir2 = { x: v2.x / len2, y: v2.y / len2 };
            const dir3 = { x: v3.x / len3, y: v3.y / len3 };
            const dot12 = dir1.x * dir2.x + dir1.y * dir2.y;
            const dot23 = dir2.x * dir3.x + dir2.y * dir3.y;
            const ANGLE_TOLERANCE = 0.94;
            interactionManager.useBridgeMode = Math.abs(dot12) > ANGLE_TOLERANCE && Math.abs(dot23) > ANGLE_TOLERANCE && Math.sign(dot12) === Math.sign(dot23);
        }
    }

    const pipeDx = pipe.p2.x - pipe.p1.x;
    const pipeDy = pipe.p2.y - pipe.p1.y;
    let angle = Math.atan2(Math.abs(pipeDy), Math.abs(pipeDx)) * 180 / Math.PI;
    let dragAxis = null;
    if (Math.abs(angle - 45) < 1) dragAxis = null;
    else if (angle < 45) dragAxis = 'y';
    else dragAxis = 'x';
    interactionManager.dragAxis = dragAxis;
}

export function handleDrag(interactionManager, point, event = null) {
    if (!interactionManager.dragObject) return;

    const obj = interactionManager.dragObject;
    const t = state.viewBlendFactor || 0;

    let zOffset = obj.z || 0;
    let isVerticalDrag = false;
    let verticalPipeBase = null;

    if (obj.bagliBoruId) {
        const pipe = interactionManager.manager.findPipeById(obj.bagliBoruId);
        if (pipe) {
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
            const len2d = Math.hypot(dx, dy);

            if (t > 0.1 && (len2d < 2.0 || Math.abs(dz) > len2d)) {
                isVerticalDrag = true;
                verticalPipeBase = { x: pipe.p1.x, y: pipe.p1.y, z: pipe.p1.z || 0, p2z: pipe.p2.z || 0 };
            } else {
                if (obj.type === 'vana') {
                    const proj = pipe.projectPoint(point);
                    const currentT = (proj && proj.onSegment) ? proj.t : (obj.vanaT || 0);
                    const z1 = pipe.p1.z || 0;
                    const z2 = pipe.p2.z || 0;
                    zOffset = z1 + currentT * (z2 - z1);
                } else {
                    zOffset = obj.z !== undefined ? obj.z : (pipe.p1.z || 0);
                }
            }
        }
    }
    else if (obj.type === 'boru' && interactionManager.dragEndpoint) {
        // Endpoint drag: endpoint'in Z'si
        zOffset = (interactionManager.dragEndpoint === 'p1' ? obj.p1.z : obj.p2.z) || 0;
    }
    else if (obj.type === 'boru' && interactionManager.isBodyDrag) {
        // Body drag: merkez Z'yi kullan
        zOffset = ((obj.p1.z || 0) + (obj.p2.z || 0)) / 2;
    }

    // dragStartObjectPos varsa, z değerini oradan al (en güvenilir)
    // Böylece drag sırasında obj.p1.z/p2.z değişse bile tutarlı offset korunur
    if (interactionManager.dragStartObjectPos && interactionManager.dragStartObjectPos.z !== undefined) {
        zOffset = interactionManager.dragStartObjectPos.z;
    }

    // Mouse'un dragStart'tan farkını hesapla (offset korunması için)
    const mouseDx = point.x - interactionManager.dragStart.x;
    const mouseDy = point.y - interactionManager.dragStart.y;

    let correctedPoint;
    if (isVerticalDrag && verticalPipeBase) {
        const startZ = interactionManager.dragStartZ || 0;
        const deltaZ = (mouseDx - mouseDy) / (2 * t);
        const newZ = startZ + deltaZ;
        const minZ = Math.min(verticalPipeBase.z, verticalPipeBase.p2z);
        const maxZ = Math.max(verticalPipeBase.z, verticalPipeBase.p2z);
        const clampedZ = Math.max(minZ, Math.min(maxZ, newZ));
        correctedPoint = { x: verticalPipeBase.x, y: verticalPipeBase.y, z: clampedZ };
    } else {
        // Offset tabanlı hareket: başlangıç pozisyonu + mouse delta
        const startPos = interactionManager.dragStartObjectPos || { x: point.x, y: point.y, z: zOffset };

        // Mouse hareketi dünya koordinatlarına dönüştür
        // point zaten screenToWorld ile dönüştürülmüş, ama 3D offset içermiyor
        // dragStart da aynı şekilde
        // Bu yüzden mouseDx/mouseDy doğrudan world space delta
        correctedPoint = {
            x: startPos.x + mouseDx,
            y: startPos.y + mouseDy,
            z: startPos.z || 0
        };
    }

    // Otomatik eksen tespiti ve kilitli taşıma
    // dragStartWorldPos'u dragStartObjectPos'tan al (ilk kez çağrıldığında)
    if (!interactionManager.dragStartWorldPos && interactionManager.dragStartObjectPos) {
        interactionManager.dragStartWorldPos = { ...interactionManager.dragStartObjectPos };
    }

    const dragStartPos = interactionManager.dragStartWorldPos || correctedPoint;

    // Eksen kısıtlaması sadece 3D modda yapılmalı
    if (t > 0.1) {
        // Mouse hareketinden otomatik eksen belirleme (sadece 3D)
        const screenDx = point.x - interactionManager.dragStart.x;
        const screenDy = point.y - interactionManager.dragStart.y;

        // Minimum hareket eşiği - Body drag için daha yüksek
        const MIN_MOVEMENT = interactionManager.isBodyDrag ? 2 : 5;
        const totalMovement = Math.hypot(screenDx, screenDy);

        // Otomatik eksen belirleme sadece manuel kilit yoksa çalışmalı
        if (totalMovement > MIN_MOVEMENT && !interactionManager.axisLockDetermined) {
            // Çizim algoritması ile aynı: Her eksene olan uzaklığı hesapla

            // X Ekseni (y=0 doğrusu): Ekranda yatay. Uzaklık = |dy|
            const distX = Math.abs(screenDy);

            // Y Ekseni (x=0 doğrusu): Ekranda dikey. Uzaklık = |dx|
            const distY = Math.abs(screenDx);

            // Z Ekseni (y = -x doğrusu): Ekranda 45 derece çapraz.
            // Vektör (t, -t). Normali (t, t). Projeksiyon formülü ile uzaklık: |dx + dy| / sqrt(2)
            const distZ = Math.abs(screenDx + screenDy) / 1.414; // sqrt(2)

            // En yakın ekseni belirle
            let bestAxis = 'X';
            let minDist = distX;

            // Body drag için: Borunun uzandığı eksen hariç diğer 2 eksen arasından seç
            // Zincir de dahil — zincirdeki borular da kendi eksenlerine dik hareket eder
            if (interactionManager.isBodyDrag && interactionManager.bodyDragPrimaryAxis) {
                const primaryAxis = interactionManager.bodyDragPrimaryAxis;

                if (primaryAxis === 'X') {
                    // Boru X'te uzanıyor -> sadece Y ve Z arasından seç
                    bestAxis = distY < distZ ? 'Y' : 'Z';
                } else if (primaryAxis === 'Y') {
                    // Boru Y'de uzanıyor -> sadece X ve Z arasından seç
                    bestAxis = distX < distZ ? 'X' : 'Z';
                } else if (primaryAxis === 'Z') {
                    // Boru Z'de uzanıyor -> sadece X ve Y arasından seç
                    bestAxis = distX < distY ? 'X' : 'Y';
                }
            } else {
                // Endpoint drag için: Tüm 3 eksen arasından seç
                if (distY < minDist) {
                    bestAxis = 'Y';
                    minDist = distY;
                }

                // Z eksenini de adaylara ekle
                if (distZ < minDist) {
                    bestAxis = 'Z';
                }
            }

            interactionManager.selectedDragAxis = bestAxis;
        }

        // Seçili eksende kilitli taşıma uygula (sadece 3D)
        if (interactionManager.selectedDragAxis === 'X') {
            correctedPoint.y = dragStartPos.y;
            correctedPoint.z = dragStartPos.z;
        } else if (interactionManager.selectedDragAxis === 'Y') {
            correctedPoint.x = dragStartPos.x;
            correctedPoint.z = dragStartPos.z;
        } else if (interactionManager.selectedDragAxis === 'Z') {
            correctedPoint.x = dragStartPos.x;
            correctedPoint.y = dragStartPos.y;
            // Z değişimini diagonal hareketten hesapla
            const safeT = Math.max(0.1, t);
            const deltaZ = (screenDx - screenDy) / (2 * safeT);
            correctedPoint.z = dragStartPos.z + deltaZ;
        }
    } else {
        // D2 modda eksen kısıtlaması yok, serbest hareket
        interactionManager.selectedDragAxis = null;
    }

    if (interactionManager.dragBacaEndpoint && interactionManager.dragObject.type === 'baca') {
        // ... (Baca kodları aynı)
        const baca = interactionManager.dragObject;
        const endpoint = interactionManager.dragBacaEndpoint;
        const segment = baca.segments[endpoint.segmentIndex];
        let snappedX = point.x;
        let snappedY = point.y;
        if (segment) {
            const prevX = endpoint.endpoint === 'end' ? segment.x1 : segment.x2;
            const prevY = endpoint.endpoint === 'end' ? segment.y1 : segment.y2;
            const dx = point.x - prevX;
            const dy = point.y - prevY;
            const distance = Math.hypot(dx, dy);
            if (distance >= 10) {
                let angleRad = Math.atan2(dy, dx);
                let angleDeg = angleRad * 180 / Math.PI;
                const SNAP_TOLERANCE = 15;
                let snappedAngle = null;
                if (Math.abs(angleDeg) <= SNAP_TOLERANCE) snappedAngle = 0;
                else if (Math.abs(angleDeg - 90) <= SNAP_TOLERANCE) snappedAngle = 90;
                else if (Math.abs(Math.abs(angleDeg) - 180) <= SNAP_TOLERANCE) snappedAngle = 180;
                else if (Math.abs(angleDeg + 90) <= SNAP_TOLERANCE) snappedAngle = -90;
                if (snappedAngle !== null) {
                    const snappedAngleRad = snappedAngle * Math.PI / 180;
                    snappedX = prevX + distance * Math.cos(snappedAngleRad);
                    snappedY = prevY + distance * Math.sin(snappedAngleRad);
                }
            }
        }
        baca.moveEndpointRigid(endpoint.segmentIndex, endpoint.endpoint, snappedX, snappedY);
        endpoint.x = snappedX; endpoint.y = snappedY;
        return;
    }

    if (interactionManager.dragEndpoint && interactionManager.dragObject.type === 'boru') {
        const pipe = interactionManager.dragObject;
        const ucBaglanti = interactionManager.dragEndpoint === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
        if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU || ucBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) return;

        const oldPoint = interactionManager.dragEndpoint === 'p1' ? { ...pipe.p1 } : { ...pipe.p2 };
        let finalPos = { x: correctedPoint.x, y: correctedPoint.y, z: correctedPoint.z };

        // DUVAR SNAP
        const MAX_WALL_DISTANCE = 20;
        const BORU_CLEARANCE = 5;
        const walls = state.walls || [];
        const pipeFloorId = pipe.floorId;
        let bestSnapX = { diff: MAX_WALL_DISTANCE, value: null };
        let bestSnapY = { diff: MAX_WALL_DISTANCE, value: null };

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;
            if (pipeFloorId && wall.floorId && wall.floorId !== pipeFloorId) return;
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const lengthSq = dx * dx + dy * dy;
            let wallDistance;
            if (lengthSq === 0) wallDistance = Math.hypot(finalPos.x - wall.p1.x, finalPos.y - wall.p1.y);
            else {
                const t = Math.max(0, Math.min(1, ((finalPos.x - wall.p1.x) * dx + (finalPos.y - wall.p1.y) * dy) / lengthSq));
                const projX = wall.p1.x + t * dx;
                const projY = wall.p1.y + t * dy;
                wallDistance = Math.hypot(finalPos.x - projX, finalPos.y - projY);
            }
            const wallThickness = wall.thickness || state.wallThickness || 20;
            const halfThickness = wallThickness / 2;
            const maxOffset = halfThickness + BORU_CLEARANCE;
            if (wallDistance > MAX_WALL_DISTANCE + maxOffset) return;
            const isVertical = Math.abs(dx) < 0.1;
            const isHorizontal = Math.abs(dy) < 0.1;
            if (isVertical) {
                const snapXPositions = [wall.p1.x - halfThickness - BORU_CLEARANCE, wall.p1.x + halfThickness + BORU_CLEARANCE];
                for (const snapX of snapXPositions) {
                    const diff = Math.abs(finalPos.x - snapX);
                    if (diff < bestSnapX.diff) bestSnapX = { diff, value: snapX };
                }
            } else if (isHorizontal) {
                const snapYPositions = [wall.p1.y - halfThickness - BORU_CLEARANCE, wall.p1.y + halfThickness + BORU_CLEARANCE];
                for (const snapY of snapYPositions) {
                    const diff = Math.abs(finalPos.y - snapY);
                    if (diff < bestSnapY.diff) bestSnapY = { diff, value: snapY };
                }
            }
        });

        if (bestSnapX.value !== null || bestSnapY.value !== null) {
            interactionManager.pipeEndpointSnapLock = { x: bestSnapX.value, y: bestSnapY.value };
            interactionManager.pipeSnapMouseStart = { x: point.x, y: point.y };
            if (bestSnapX.value !== null) finalPos.x = bestSnapX.value;
            if (bestSnapY.value !== null) finalPos.y = bestSnapY.value;
        } else {
            interactionManager.pipeEndpointSnapLock = null;
            interactionManager.pipeSnapMouseStart = null;
        }

        // BORU HİZALAMA SNAP
        const connectionTolerance = 1;
        const connectedPipes = interactionManager.manager.pipes.filter(p => {
            if (p === pipe) return false;
            const distToP1 = Math.hypot(p.p1.x - oldPoint.x, p.p1.y - oldPoint.y);
            const distToP2 = Math.hypot(p.p2.x - oldPoint.x, p.p2.y - oldPoint.y);
            return distToP1 < connectionTolerance || distToP2 < connectionTolerance;
        });

        const PIPE_ENDPOINT_SNAP_DISTANCE = 10;
        const ALIGNMENT_ANGLE_TOLERANCE = 20;

        let pipeSnapX = null;
        let pipeSnapY = null;
        let pipeSnapZ = null;
        let minPipeSnapDistX = PIPE_ENDPOINT_SNAP_DISTANCE;
        let minPipeSnapDistY = PIPE_ENDPOINT_SNAP_DISTANCE;
        let minPipeSnapDistZ = PIPE_ENDPOINT_SNAP_DISTANCE;

        const processSnapCandidate = (targetPoint) => {
            const dx = finalPos.x - targetPoint.x;
            const dy = finalPos.y - targetPoint.y;
            const dz = (finalPos.z || 0) - (targetPoint.z || 0);
            const dist = Math.hypot(dx, dy);

            if (dist < PIPE_ENDPOINT_SNAP_DISTANCE) {
                if (Math.abs(dx) < minPipeSnapDistX) { minPipeSnapDistX = Math.abs(dx); pipeSnapX = targetPoint.x; }
                if (Math.abs(dy) < minPipeSnapDistY) { minPipeSnapDistY = Math.abs(dy); pipeSnapY = targetPoint.y; }
                if (Math.abs(dz) < minPipeSnapDistZ) { minPipeSnapDistZ = Math.abs(dz); pipeSnapZ = targetPoint.z || 0; }
                return;
            }

            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const isVertical = Math.abs(Math.abs(angle) - 90) < ALIGNMENT_ANGLE_TOLERANCE;
            if (isVertical && Math.abs(dx) < minPipeSnapDistX) {
                minPipeSnapDistX = Math.abs(dx);
                pipeSnapX = targetPoint.x;
            }
            const isHorizontal = Math.abs(angle) < ALIGNMENT_ANGLE_TOLERANCE || Math.abs(Math.abs(angle) - 180) < ALIGNMENT_ANGLE_TOLERANCE;
            if (isHorizontal && Math.abs(dy) < minPipeSnapDistY) {
                minPipeSnapDistY = Math.abs(dy);
                pipeSnapY = targetPoint.y;
            }
            // Z snap - 3D modda (t > 0.1)
            const t = state.viewBlendFactor || 0;
            if (t > 0.1 && Math.abs(dz) < minPipeSnapDistZ) {
                minPipeSnapDistZ = Math.abs(dz);
                pipeSnapZ = targetPoint.z || 0;
            }
        };

        const ownOtherEndpoint = interactionManager.dragEndpoint === 'p1' ? pipe.p2 : pipe.p1;
        processSnapCandidate(ownOtherEndpoint);

        connectedPipes.forEach(connectedPipe => {
            const distToP1 = Math.hypot(connectedPipe.p1.x - oldPoint.x, connectedPipe.p1.y - oldPoint.y);
            const otherEndpoint = distToP1 < connectionTolerance ? connectedPipe.p2 : connectedPipe.p1;
            processSnapCandidate(otherEndpoint);
        });

        if (pipeSnapX !== null) finalPos.x = pipeSnapX;
        if (pipeSnapY !== null) finalPos.y = pipeSnapY;
        if (pipeSnapZ !== null) finalPos.z = pipeSnapZ;

        const isProtected = isProtectedPoint(finalPos, interactionManager.manager, pipe, oldPoint);
        if (isProtected) return;

        const POINT_OCCUPATION_TOLERANCE = 1.5;
        const ELBOW_TOLERANCE = 8;
        const elbowConnectionTolerance = 1;
        let occupiedByOtherPipe = false;

        for (const otherPipe of interactionManager.manager.pipes) {
            if (otherPipe === pipe) continue;
            if (connectedPipes.includes(otherPipe)) continue;
            for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                if (distToOld < elbowConnectionTolerance) continue;
                const dist = Math.hypot(endpoint.x - finalPos.x, endpoint.y - finalPos.y);
                const distZ = Math.abs((endpoint.z || 0) - (correctedPoint.z || 0));
                const isElbow = interactionManager.manager.pipes.some(p => {
                    if (p === otherPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < elbowConnectionTolerance || d2 < elbowConnectionTolerance;
                });
                const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;
                if (dist < tolerance && distZ < tolerance) { occupiedByOtherPipe = true; break; }
            }
            if (occupiedByOtherPipe) break;
        }

        const valvesOnPipe = interactionManager.manager.components.filter(comp =>
            comp.type === 'vana' && comp.bagliBoruId === pipe.id
        );
        const MIN_EDGE_DISTANCE = 4;
        const OBJECT_MARGIN = 2;
        const VALVE_WIDTH = 6;
        const spacePerValve = OBJECT_MARGIN + VALVE_WIDTH + OBJECT_MARGIN;
        const totalValveSpace = valvesOnPipe.length * spacePerValve;
        const minLength = (2 * MIN_EDGE_DISTANCE) + totalValveSpace;

        // --- ⚡ 3D LENGTH FIX BURADA ⚡ ---
        let newLength;
        if (interactionManager.dragEndpoint === 'p1') {
            // Sadece X,Y değil, Z farkını da dahil et (Hypot 3 args)
            newLength = Math.hypot(
                finalPos.x - pipe.p2.x, 
                finalPos.y - pipe.p2.y,
                (finalPos.z || 0) - (pipe.p2.z || 0) 
            );
        } else {
            // Sadece X,Y değil, Z farkını da dahil et (Hypot 3 args)
            newLength = Math.hypot(
                pipe.p1.x - finalPos.x, 
                pipe.p1.y - finalPos.y,
                (pipe.p1.z || 0) - (finalPos.z || 0)
            );
        }
        // -------------------------------

        if (!occupiedByOtherPipe && newLength >= minLength) {
            const oldLength = pipe.uzunluk;
            if (interactionManager.dragEndpoint === 'p1') {
                pipe.p1.x = finalPos.x;
                pipe.p1.y = finalPos.y;
                pipe.p1.z = finalPos.z;
            }
            else {
                pipe.p2.x = finalPos.x;
                pipe.p2.y = finalPos.y;
                pipe.p2.z = finalPos.z;
            }

            valvesOnPipe.forEach(valve => {
                const distanceFromP2 = (1 - valve.boruPozisyonu) * oldLength;
                valve.boruPozisyonu = 1 - (distanceFromP2 / pipe.uzunluk);
                valve.fromEnd = 'p2';
                valve.fixedDistance = distanceFromP2;
                valve.updatePositionFromPipe(pipe);
            });

            // CTRL basılıysa downstream loop zaten sayaç/cihazı taşıyacak — burada atla
            if (!(event && event.ctrlKey)) {
                const connectedMeter = interactionManager.manager.components.find(c =>
                    c.type === 'sayac' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id && c.fleksBaglanti.endpoint === interactionManager.dragEndpoint
                );
                if (connectedMeter) {
                    const dx = finalPos.x - oldPoint.x;
                    const dy = finalPos.y - oldPoint.y;
                    const dz = (finalPos.z || 0) - (oldPoint.z || 0);
                    connectedMeter.x += dx; connectedMeter.y += dy;
                    connectedMeter.z = (connectedMeter.z || 0) + dz;
                    if (connectedMeter.cikisBagliBoruId) {
                        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
                        if (cikisBoru) { cikisBoru.p1.x += dx; cikisBoru.p1.y += dy; cikisBoru.p1.z = (cikisBoru.p1.z || 0) + dz; }
                    }
                }

                const connectedDevice = interactionManager.manager.components.find(c =>
                    c.type === 'cihaz' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id && c.fleksBaglanti.endpoint === interactionManager.dragEndpoint
                );
                if (connectedDevice) {
                    const dx = finalPos.x - oldPoint.x;
                    const dy = finalPos.y - oldPoint.y;
                    const dz = (finalPos.z || 0) - (oldPoint.z || 0);
                    connectedDevice.x += dx; connectedDevice.y += dy;
                    connectedDevice.z = (connectedDevice.z || 0) + dz;
                    const bacalar = interactionManager.manager.components.filter(c => c.type === 'baca' && c.parentCihazId === connectedDevice.id);
                    bacalar.forEach(baca => {
                        baca.startX += dx; baca.startY += dy;
                        baca.z = (baca.z || 0) + dz;
                        baca.currentSegmentStart.x += dx; baca.currentSegmentStart.y += dy;
                        baca.segments.forEach(seg => {
                            seg.x1 += dx; seg.y1 += dy; seg.z1 = (seg.z1 || 0) + dz;
                            seg.x2 += dx; seg.y2 += dy; seg.z2 = (seg.z2 || 0) + dz;
                        });
                        if (baca.havalandirma) { baca.havalandirma.x += dx; baca.havalandirma.y += dy; }
                    });
                }
            }

            // --- ⚡ CTRL İLE ENDPOINT TAŞIMA ⚡ ---
            if (event && event.ctrlKey) {
                const dx = finalPos.x - oldPoint.x;
                const dy = finalPos.y - oldPoint.y;
                const dz = (finalPos.z || 0) - (oldPoint.z || 0);

                // Taşınan düğüm (pipe.p1 veya pipe.p2) zaten finalPos'a taşındı.
                // O düğümden downstream ulaşılabilen tüm düğümleri aynı delta ile taşı.
                // "Öncesi" borular node sharing sayesinde otomatik gerilir — burada dokunmuyoruz.
                const draggedNode = interactionManager.dragEndpoint === 'p1' ? pipe.p1 : pipe.p2;
                const downstreamNodes = collectDownstreamNodes(interactionManager.manager, [draggedNode], pipe);
                downstreamNodes.forEach(node => {
                    node.x += dx; node.y += dy; node.z = (node.z || 0) + dz;
                });

                // Downstream pipe'ların üzerindeki component'leri taşı
                const downstreamPipes = collectDownstreamPipes(interactionManager.manager, [draggedNode], pipe);
                const movedComponents = new Set();
                downstreamPipes.forEach(p => {
                    interactionManager.manager.components.forEach(c => {
                        if (c.bagliBoruId !== p.id && c.fleksBaglanti?.boruId !== p.id && c.cikisBagliBoruId !== p.id) return;
                        if (movedComponents.has(c.id)) return;
                        movedComponents.add(c.id);
                        c.x += dx; c.y += dy; c.z = (c.z || 0) + dz;
                        if (c.type === 'cihaz') {
                            const bacalar = interactionManager.manager.components.filter(b => b.type === 'baca' && b.parentCihazId === c.id);
                            bacalar.forEach(baca => {
                                baca.startX += dx; baca.startY += dy;
                                baca.currentSegmentStart.x += dx; baca.currentSegmentStart.y += dy;
                                baca.segments.forEach(seg => { seg.x1 += dx; seg.y1 += dy; seg.x2 += dx; seg.y2 += dy; });
                                if (baca.havalandirma) { baca.havalandirma.x += dx; baca.havalandirma.y += dy; }
                            });
                        }
                    });
                });
            } else {
                // CTRL basılı DEĞİLSE standart esneme davranışı
                if (interactionManager.connectedPipesAtEndpoint && interactionManager.connectedPipesAtEndpoint.length > 0) {
                    interactionManager.connectedPipesAtEndpoint.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                        connectedPipe[connectedEndpoint].x = finalPos.x;
                        connectedPipe[connectedEndpoint].y = finalPos.y;
                        connectedPipe[connectedEndpoint].z = finalPos.z;
                    });
                }
            }
        }
        return;
    }

    // 3. Vana Taşıma (HATA BURADAYDI)
    if (interactionManager.dragObject.type === 'vana') {
        const vana = interactionManager.dragObject;
        let targetPipe = interactionManager.dragObjectPipe;
        let objectsOnPipe = interactionManager.dragObjectsOnPipe;
        if (!targetPipe) return;

        // 3D Düzeltilmiş nokta (correctedPoint) kullanarak taşı
        // Düşey boruysa correctedPoint içinde dinamik Z var
        // Yatay boruysa correctedPoint içinde düzeltilmiş X,Y ve sabit Z var
        vana.moveAlongPipe(targetPipe, correctedPoint, objectsOnPipe);

        vana.updateEndCapStatus(interactionManager.manager);
        return;
    }

    // 4. Servis Kutusu Taşıma
    if (interactionManager.dragObject.type === 'servis_kutusu') {
        // ... (Bu kısım aynen kalsın, duvar snap 2D çalışıyor)
        const walls = state.walls;
        const snapDistance = 30;
        let closestWall = null;
        let minDist = Infinity;
        const mousePos = point; // Servis kutusu zeminde (Z=0), düz point kullan

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return;
            const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (len * len)));
            const projX = wall.p1.x + t * dx;
            const projY = wall.p1.y + t * dy;
            const dist = Math.hypot(mousePos.x - projX, mousePos.y - projY);
            if (dist < minDist) { minDist = dist; closestWall = wall; }
        });

        const oldBoxX = interactionManager.dragObject.x;
        const oldBoxY = interactionManager.dragObject.y;
        const oldBoxRotation = interactionManager.dragObject.rotation;

        if (closestWall && minDist < snapDistance) {
            interactionManager.dragObject.snapToWall(closestWall, point, false);
        } else {
            interactionManager.dragObject.placeFree(point);
        }

        const newCikis = interactionManager.dragObject.getCikisNoktasi();
        const ELBOW_TOLERANCE = 8;
        const elbowConnectionTolerance = 1;
        let tooCloseToElbow = false;
        const bagliBoruId = interactionManager.dragObject.bagliBoruId;

        for (const otherPipe of interactionManager.manager.pipes) {
            if (bagliBoruId && otherPipe.id === bagliBoruId) continue;
            for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                const dist = Math.hypot(endpoint.x - newCikis.x, endpoint.y - newCikis.y);
                const isElbow = interactionManager.manager.pipes.some(p => {
                    if (p === otherPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < elbowConnectionTolerance || d2 < elbowConnectionTolerance;
                });
                if (isElbow && dist < ELBOW_TOLERANCE) { tooCloseToElbow = true; break; }
            }
            if (tooCloseToElbow) break;
        }

        if (tooCloseToElbow) {
            interactionManager.dragObject.x = oldBoxX;
            interactionManager.dragObject.y = oldBoxY;
            interactionManager.dragObject.rotation = oldBoxRotation;
            return;
        }

        if (interactionManager.dragObject.bagliBoruId) {
            const boru = interactionManager.manager.pipes.find(p => p.id === interactionManager.dragObject.bagliBoruId);
            if (boru) {
                boru.p1.x = newCikis.x;
                boru.p1.y = newCikis.y;
                if (interactionManager.servisKutusuConnectedPipes && interactionManager.servisKutusuConnectedPipes.length > 0) {
                    interactionManager.servisKutusuConnectedPipes.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                        connectedPipe[connectedEndpoint].x = newCikis.x;
                        connectedPipe[connectedEndpoint].y = newCikis.y;
                    });
                }
                // Düşey boru takibi: çıkış node'una bağlı düşey boruların diğer uçları
                (interactionManager.verticalOtherEndsOutput || []).forEach(({ otherNode }) => {
                    otherNode.x = newCikis.x; otherNode.y = newCikis.y;
                });
            }
        }
        return;
    }

    // 5. Cihaz Taşıma
    if (interactionManager.dragObject.type === 'cihaz') {
        const cihaz = interactionManager.dragObject;
        const oldPos = { x: cihaz.x, y: cihaz.y };
        let inputPipeOldEndpoint = null;
        if (cihaz.fleksBaglanti?.boruId && cihaz.fleksBaglanti?.endpoint) {
            const girisBoru = interactionManager.manager.pipes.find(p => p.id === cihaz.fleksBaglanti.boruId);
            if (girisBoru) {
                const endpoint = cihaz.fleksBaglanti.endpoint;
                inputPipeOldEndpoint = { pipe: girisBoru, endpoint: endpoint, x: girisBoru[endpoint].x, y: girisBoru[endpoint].y };
            }
        }
        // Cihaz da yüksekte olabilir, correctedPoint kullanmak daha doğal olur
        // Ancak cihazın move fonksiyonu 2D çalışıyor, şimdilik correctedPoint verelim
        cihaz.move(correctedPoint.x, correctedPoint.y);

        if (inputPipeOldEndpoint) {
            inputPipeOldEndpoint.pipe[inputPipeOldEndpoint.endpoint].x = inputPipeOldEndpoint.x;
            inputPipeOldEndpoint.pipe[inputPipeOldEndpoint.endpoint].y = inputPipeOldEndpoint.y;
        }
        const deltaX = correctedPoint.x - oldPos.x;
        const deltaY = correctedPoint.y - oldPos.y;
        const bacalar = interactionManager.manager.components.filter(c => c.type === 'baca' && c.parentCihazId === cihaz.id);
        bacalar.forEach(baca => {
            baca.startX += deltaX; baca.startY += deltaY;
            baca.currentSegmentStart.x += deltaX; baca.currentSegmentStart.y += deltaY;
            baca.segments.forEach(seg => { seg.x1 += deltaX; seg.y1 += deltaY; seg.x2 += deltaX; seg.y2 += deltaY; });
            if (baca.havalandirma) { baca.havalandirma.x += deltaX; baca.havalandirma.y += deltaY; }
        });
        return;
    }

    // 6. Sayaç Taşıma
    if (interactionManager.dragObject.type === 'sayac') {
        const sayac = interactionManager.dragObject;
        if (!interactionManager.dragStartObjectPos) interactionManager.dragStartObjectPos = { x: sayac.x, y: sayac.y };
        const startX = interactionManager.dragStartObjectPos.x;
        const startY = interactionManager.dragStartObjectPos.y;
        const AXIS_LOCK_THRESHOLD = 0;

        // 3D corrected point kullan
        const targetX = correctedPoint.x;
        const targetY = correctedPoint.y;

        const totalDx = Math.abs(targetX - startX);
        const totalDy = Math.abs(targetY - startY);
        let newX, newY;
        if (totalDx > AXIS_LOCK_THRESHOLD && totalDy > AXIS_LOCK_THRESHOLD) { newX = targetX; newY = targetY; }
        else if (totalDx > totalDy) { newX = targetX; newY = startY; }
        else { newX = startX; newY = targetY; }
        const dx = newX - sayac.x;
        const dy = newY - sayac.y;

        let inputPipeOldEndpoint = null;
        if (sayac.fleksBaglanti?.boruId && sayac.fleksBaglanti?.endpoint) {
            const girisBoru = interactionManager.manager.pipes.find(p => p.id === sayac.fleksBaglanti.boruId);
            if (girisBoru) {
                const endpoint = sayac.fleksBaglanti.endpoint;
                inputPipeOldEndpoint = { pipe: girisBoru, endpoint: endpoint, x: girisBoru[endpoint].x, y: girisBoru[endpoint].y };
            }
        }
        sayac.move(newX, newY);
        if (inputPipeOldEndpoint) {
            inputPipeOldEndpoint.pipe[inputPipeOldEndpoint.endpoint].x = inputPipeOldEndpoint.x;
            inputPipeOldEndpoint.pipe[inputPipeOldEndpoint.endpoint].y = inputPipeOldEndpoint.y;
        }
        if (sayac.cikisBagliBoruId) {
            const cikisBoru = interactionManager.manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
            if (cikisBoru) {
                cikisBoru.p1.x += dx; cikisBoru.p1.y += dy;
                const newP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };
                if (interactionManager.sayacConnectedPipes && interactionManager.sayacConnectedPipes.length > 0) {
                    interactionManager.sayacConnectedPipes.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                        connectedPipe[connectedEndpoint].x = newP1.x;
                        connectedPipe[connectedEndpoint].y = newP1.y;
                    });
                }
                // Düşey boru takibi: çıkış node'una bağlı düşey boruların diğer uçları
                (interactionManager.verticalOtherEndsOutput || []).forEach(({ otherNode }) => {
                    otherNode.x = newP1.x; otherNode.y = newP1.y;
                });
            }
        }
        return;
    }

    // 7. Boru Gövdesi Taşıma
    if (interactionManager.dragObject.type === 'boru' && interactionManager.isBodyDrag) {
        const pipe = interactionManager.dragObject;
        const t = state.viewBlendFactor || 0;

        // correctedPoint kullanarak delta hesapla (eksen kısıtlaması uygulanmış)
        const deltaX = correctedPoint.x - dragStartPos.x;
        const deltaY = correctedPoint.y - dragStartPos.y;
        const deltaZ = correctedPoint.z - dragStartPos.z;

        let offsetX = deltaX;
        let offsetY = deltaY;
        let offsetZ = deltaZ;

        // Eksen kısıtlaması: 2D modda CTRL'dan önce uygula (her iki durumu da kapsar).
        // 3D modda correctedPoint üzerinden zaten uygulandı.
        if (t < 0.1 && interactionManager.bodyDragPrimaryAxis) {
            const primary = interactionManager.bodyDragPrimaryAxis;
            if (primary === 'X') offsetX = 0;
            else if (primary === 'Y') offsetY = 0;
        }

        // Kutu/sayaç bağlantısı olan ucu kilitli tut: o uç için offset sıfır
        const lockedEndpoint = interactionManager.bodyDragLockedEndpoint;
        let offsetXp1 = offsetX, offsetYp1 = offsetY, offsetZp1 = offsetZ;
        let offsetXp2 = offsetX, offsetYp2 = offsetY, offsetZp2 = offsetZ;
        if (lockedEndpoint === 'p1') { offsetXp1 = 0; offsetYp1 = 0; offsetZp1 = 0; }
        else if (lockedEndpoint === 'p2') { offsetXp2 = 0; offsetYp2 = 0; offsetZp2 = 0; }

        // --- CTRL İLE GÖVDE TAŞIMA ---
        if (event && event.ctrlKey) {
            const newP1 = {
                x: interactionManager.bodyDragInitialP1.x + offsetXp1,
                y: interactionManager.bodyDragInitialP1.y + offsetYp1,
                z: (interactionManager.bodyDragInitialP1.z || 0) + offsetZp1
            };
            const newP2 = {
                x: interactionManager.bodyDragInitialP2.x + offsetXp2,
                y: interactionManager.bodyDragInitialP2.y + offsetYp2,
                z: (interactionManager.bodyDragInitialP2.z || 0) + offsetZp2
            };

            // Pipe henüz hareket etmeden ÖNCE downstream düğümleri topla.
            // Per-frame delta: pipe henüz hareket etmeden ÖNCE mevcut pozisyondan hesapla.
            // offsetX/offsetY total offset olduğu için her kareye eklenemez.
            const frameDx = newP1.x - pipe.p1.x;
            const frameDy = newP1.y - pipe.p1.y;
            const frameDz = newP1.z - (pipe.p1.z || 0);

            // Downstream düğümleri ve pipe'ları pipe taşınmadan ÖNCE topla
            const downstreamNodesFromP1 = collectDownstreamNodes(interactionManager.manager, [pipe.p1], pipe);
            const downstreamNodesFromP2 = collectDownstreamNodes(interactionManager.manager, [pipe.p2], pipe);
            const downstreamPipesFromP1 = collectDownstreamPipes(interactionManager.manager, [pipe.p1], pipe);
            const downstreamPipesFromP2 = collectDownstreamPipes(interactionManager.manager, [pipe.p2], pipe);

            // Sürüklenen boruyu taşı (node sharing: önceki borular gerilir)
            pipe.p1.x = newP1.x; pipe.p1.y = newP1.y; pipe.p1.z = newP1.z;
            pipe.p2.x = newP2.x; pipe.p2.y = newP2.y; pipe.p2.z = newP2.z;

            // Boru üzerindeki vanaları per-frame delta ile taşı
            interactionManager.manager.components.filter(c => c.type === 'vana' && c.bagliBoruId === pipe.id)
                .forEach(v => { v.x += frameDx; v.y += frameDy; v.z = (v.z || 0) + frameDz; });

            // Downstream düğümleri per-frame delta ile taşı
            const movedDownstreamNodeIds = new Set();
            [...downstreamNodesFromP1, ...downstreamNodesFromP2].forEach(node => {
                node.x += frameDx; node.y += frameDy; node.z = (node.z || 0) + frameDz;
                movedDownstreamNodeIds.add(node._nodeId);
            });

            // Düşey boru takibi (CTRL): her hareket eden node'a bağlı düşey boruların diğer uçları
            const allMovedNodes = [pipe.p1, pipe.p2, ...downstreamNodesFromP1, ...downstreamNodesFromP2];
            const verticalSyncedIds = new Set(allMovedNodes.map(n => n._nodeId));
            allMovedNodes.forEach(movedNode => {
                findVerticalConnectedOtherEnds(interactionManager.manager, movedNode, null).forEach(({ otherNode }) => {
                    if (verticalSyncedIds.has(otherNode._nodeId)) return; // zaten taşındı
                    verticalSyncedIds.add(otherNode._nodeId);
                    otherNode.x = movedNode.x; otherNode.y = movedNode.y;
                });
            });

            // Downstream pipe'ların componentlerini per-frame delta ile taşı
            // movedComponents: her component sadece bir kez taşınsın (sayaç vb. double-move önleme)
            const allDownstreamPipes = [...downstreamPipesFromP1, ...downstreamPipesFromP2];
            const movedComponents = new Set();
            // Sürüklenen boru dahil tüm ilgili boruların componentlerini tara
            [pipe, ...allDownstreamPipes].forEach(p => {
                interactionManager.manager.components.forEach(c => {
                    if (c.type === 'vana' && p === pipe) return; // Sürüklenen borudaki vanalar zaten yukarıda taşındı
                    if (c.bagliBoruId !== p.id && c.fleksBaglanti?.boruId !== p.id && c.cikisBagliBoruId !== p.id) return;
                    if (movedComponents.has(c.id)) return;
                    movedComponents.add(c.id);
                    c.x += frameDx; c.y += frameDy; c.z = (c.z || 0) + frameDz;
                    if (c.type === 'cihaz') {
                        interactionManager.manager.components.filter(b => b.type === 'baca' && b.parentCihazId === c.id).forEach(baca => {
                            baca.startX += frameDx; baca.startY += frameDy;
                            baca.currentSegmentStart.x += frameDx; baca.currentSegmentStart.y += frameDy;
                            baca.segments.forEach(seg => {
                                seg.x1 += frameDx; seg.y1 += frameDy; seg.x2 += frameDx; seg.y2 += frameDy;
                                if (seg.z1 !== undefined) seg.z1 += frameDz;
                                if (seg.z2 !== undefined) seg.z2 += frameDz;
                            });
                            baca.z = (baca.z || 0) + frameDz;
                            if (baca.havalandirma) { baca.havalandirma.x += frameDx; baca.havalandirma.y += frameDy; }
                        });
                    }
                });
            });

            return;
        }
        // ----------------------------------------------

        // --- BORU ZİNCİRİ TAŞIMA (DÜŞEY VE YATAY) ---
        if (interactionManager.alignedPipeChain && interactionManager.alignedPipeChain.length > 0) {
            // Zincir de aynı eksen kısıtlamasına tabi: borunun uzandığı yönde hareket yasak.
            if (t < 0.1 && interactionManager.bodyDragPrimaryAxis) {
                const primary = interactionManager.bodyDragPrimaryAxis;
                if (primary === 'X') offsetX = 0;
                else if (primary === 'Y') offsetY = 0;
            }

            // Zincirdeki tüm boruların düğümlerini birlikte taşı.
            // Paylaşılan düğümler (köşe noktaları) sadece bir kez güncellenir;
            // o düğümü kullanan bağlı borular otomatik takip eder.
            const movedNodes = new Set();
            interactionManager.alignedPipeChain.forEach(({ pipe: chainPipe, initialP1, initialP2 }) => {
                if (!movedNodes.has(chainPipe.p1NodeId)) {
                    chainPipe.p1.x = initialP1.x + offsetX;
                    chainPipe.p1.y = initialP1.y + offsetY;
                    chainPipe.p1.z = (initialP1.z || 0) + offsetZ;
                    movedNodes.add(chainPipe.p1NodeId);
                }
                if (!movedNodes.has(chainPipe.p2NodeId)) {
                    chainPipe.p2.x = initialP2.x + offsetX;
                    chainPipe.p2.y = initialP2.y + offsetY;
                    chainPipe.p2.z = (initialP2.z || 0) + offsetZ;
                    movedNodes.add(chainPipe.p2NodeId);
                }
            });

            return; // Boru zinciri işlemi bitti, normal mantık çalışmasın
        }
        // -----------------------------------

        const newP1 = {
            x: interactionManager.bodyDragInitialP1.x + offsetXp1,
            y: interactionManager.bodyDragInitialP1.y + offsetYp1,
            z: (interactionManager.bodyDragInitialP1.z || 0) + offsetZp1
        };
        const newP2 = {
            x: interactionManager.bodyDragInitialP2.x + offsetXp2,
            y: interactionManager.bodyDragInitialP2.y + offsetYp2,
            z: (interactionManager.bodyDragInitialP2.z || 0) + offsetZp2
        };
        // ... (Geri kalan boru gövdesi mantığı aynen kalabilir) ...
        const POINT_OCCUPATION_TOLERANCE = 1.5;
        const ELBOW_TOLERANCE = 8;
        const connectionTolerance = 1;
        const connectedPipes = [...(interactionManager.connectedPipesAtP1 || []).map(c => c.pipe), ...(interactionManager.connectedPipesAtP2 || []).map(c => c.pipe)];

        const checkEndpointDistance = (newPos, checkAgainstOldPos = null) => {
            for (const otherPipe of interactionManager.manager.pipes) {
                if (otherPipe === pipe) continue;
                if (connectedPipes.includes(otherPipe)) continue;
                for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                    if (checkAgainstOldPos) {
                        const distToOld = Math.hypot(endpoint.x - checkAgainstOldPos.x, endpoint.y - checkAgainstOldPos.y);
                        if (distToOld < connectionTolerance) continue;
                    }
                    const dist = Math.hypot(endpoint.x - newPos.x, endpoint.y - newPos.y);
                    const distZ = Math.abs((endpoint.z || 0) - (newPos.z || 0));
                    const isElbow = interactionManager.manager.pipes.some(p => {
                        if (p === otherPipe) return false;
                        const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                        const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                        return d1 < connectionTolerance || d2 < connectionTolerance;
                    });
                    const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;
                    if (dist < tolerance && distZ < tolerance) return true;
                }
            }
            return false;
        };

        const p1Blocked = checkEndpointDistance(newP1, interactionManager.bodyDragInitialP1);
        const p2Blocked = checkEndpointDistance(newP2, interactionManager.bodyDragInitialP2);
        if (p1Blocked || p2Blocked) return;

        // Düğüm nesnelerinin koordinatlarını güncelle.
        // pipe.p1 ve pipe.p2 birer düğüm nesnesidir; aynı düğümü paylaşan
        // tüm diğer borular otomatik olarak güncellenir — ayrı loop gerekmez.
        pipe.p1.x = newP1.x; pipe.p1.y = newP1.y; pipe.p1.z = newP1.z;
        pipe.p2.x = newP2.x; pipe.p2.y = newP2.y; pipe.p2.z = newP2.z;

        // Düşey boru takibi: bağlı düşey boruların diğer ucunu X/Y'de takip ettir
        const lockedEP = interactionManager.bodyDragLockedEndpoint;
        if (lockedEP !== 'p1') {
            (interactionManager.verticalOtherEndsP1 || []).forEach(({ otherNode }) => {
                otherNode.x = pipe.p1.x; otherNode.y = pipe.p1.y;
            });
        }
        if (lockedEP !== 'p2') {
            (interactionManager.verticalOtherEndsP2 || []).forEach(({ otherNode }) => {
                otherNode.x = pipe.p2.x; otherNode.y = pipe.p2.y;
            });
        }

        // Bridge (süpürme) modu: sadece SHIFT basılıysa ghost ara borular göster
        const shiftBridge = interactionManager.useBridgeMode && event && event.shiftKey;
        if (shiftBridge) {
            interactionManager.ghostBridgePipes = [];
            const MIN_BRIDGE_LENGTH = 5;
            const dist1 = Math.hypot(pipe.p1.x - interactionManager.bodyDragInitialP1.x, pipe.p1.y - interactionManager.bodyDragInitialP1.y);
            if (dist1 >= MIN_BRIDGE_LENGTH && interactionManager.manager.getPipesAtNode(pipe.p1, pipe).length > 0) {
                interactionManager.ghostBridgePipes.push({ p1: { ...interactionManager.bodyDragInitialP1 }, p2: { x: pipe.p1.x, y: pipe.p1.y, z: pipe.p1.z }, type: 'ghost_bridge' });
            }
            const dist2 = Math.hypot(pipe.p2.x - interactionManager.bodyDragInitialP2.x, pipe.p2.y - interactionManager.bodyDragInitialP2.y);
            if (dist2 >= MIN_BRIDGE_LENGTH && interactionManager.manager.getPipesAtNode(pipe.p2, pipe).length > 0) {
                interactionManager.ghostBridgePipes.push({ p1: { x: pipe.p2.x, y: pipe.p2.y, z: pipe.p2.z }, p2: { ...interactionManager.bodyDragInitialP2 }, type: 'ghost_bridge' });
            }
        } else {
            interactionManager.ghostBridgePipes = [];
        }
        return;
    }

    // Diğer nesneler
    if (interactionManager.dragObject.type !== 'boru') {
        const result = interactionManager.dragObject.move(point.x, point.y);
        interactionManager.updateConnectedPipe(result);
    }
}

export function updateConnectedPipesChain(interactionManager, oldPoint, newPoint) {
    const tolerance = 0.5;
    interactionManager.manager.pipes.forEach(pipe => {
        const distP1 = Math.hypot(pipe.p1.x - oldPoint.x, pipe.p1.y - oldPoint.y, (pipe.p1.z || 0) - (oldPoint.z || 0));
        if (distP1 < tolerance) { pipe.p1.x = newPoint.x; pipe.p1.y = newPoint.y; }
        const distP2 = Math.hypot(pipe.p2.x - oldPoint.x, pipe.p2.y - oldPoint.y, (pipe.p2.z || 0) - (oldPoint.z || 0));
        if (distP2 < tolerance) { pipe.p2.x = newPoint.x; pipe.p2.y = newPoint.y; }
    });
}

export function endDrag(interactionManager) {
    // ... (Kalan kodlar aynı)
    if (interactionManager.isBodyDrag && interactionManager.dragObject && interactionManager.dragObject.type === 'boru') {
        const draggedPipe = interactionManager.dragObject;
        const oldP1 = interactionManager.bodyDragInitialP1;
        const oldP2 = interactionManager.bodyDragInitialP2;
        const newP1 = draggedPipe.p1;
        const newP2 = draggedPipe.p2;

        // Bridge yalnızca SHIFT basılıyken aktifti (ghostBridgePipes doluysa)
        if (interactionManager.useBridgeMode && interactionManager.ghostBridgePipes && interactionManager.ghostBridgePipes.length > 0) {
            const MIN_BRIDGE_LENGTH = 5;
            const mgr = interactionManager.manager;
            // Bridge pipe'lar için düğüm referansı: köprü noktaları snapshot (başlangıç) koordinatları
            const p1Connections = mgr.getPipesAtNode(draggedPipe.p1, draggedPipe);
            const p2Connections = mgr.getPipesAtNode(draggedPipe.p2, draggedPipe);

            if (p1Connections.length > 0) {
                const distP1 = Math.hypot(newP1.x - oldP1.x, newP1.y - oldP1.y);
                if (distP1 >= MIN_BRIDGE_LENGTH) {
                    // oldP1 konumunda yeni bağımsız düğüm oluştur
                    const snapNode1 = mgr.createNode(oldP1.x, oldP1.y, oldP1.z || 0);
                    // Adjacent pipe'ların node'unu snapNode1'e geri döndür
                    // (node sharing ile sürüklenince adjacent pipe da newP1'e gitmiş)
                    p1Connections.forEach(connPipe => {
                        if (connPipe.p1 === draggedPipe.p1) {
                            connPipe.p1 = snapNode1;
                            connPipe.p1NodeId = snapNode1._nodeId;
                            mgr.nodes.set(snapNode1._nodeId, snapNode1);
                        } else if (connPipe.p2 === draggedPipe.p1) {
                            connPipe.p2 = snapNode1;
                            connPipe.p2NodeId = snapNode1._nodeId;
                            mgr.nodes.set(snapNode1._nodeId, snapNode1);
                        }
                    });
                    // Dikey köprü boru: snapNode1 (eski konum) → draggedPipe.p1 (yeni konum)
                    const bridgePipe1 = new Boru(snapNode1, draggedPipe.p1, draggedPipe.boruTipi);
                    bridgePipe1.floorId = draggedPipe.floorId;
                    bridgePipe1.colorGroup = draggedPipe.colorGroup;
                    mgr.registerPipeNodes(bridgePipe1);
                    mgr.pipes.push(bridgePipe1);
                }
            }

            if (p2Connections.length > 0) {
                const distP2 = Math.hypot(newP2.x - oldP2.x, newP2.y - oldP2.y);
                if (distP2 >= MIN_BRIDGE_LENGTH) {
                    const snapNode2 = mgr.createNode(oldP2.x, oldP2.y, oldP2.z || 0);
                    p2Connections.forEach(connPipe => {
                        if (connPipe.p1 === draggedPipe.p2) {
                            connPipe.p1 = snapNode2;
                            connPipe.p1NodeId = snapNode2._nodeId;
                            mgr.nodes.set(snapNode2._nodeId, snapNode2);
                        } else if (connPipe.p2 === draggedPipe.p2) {
                            connPipe.p2 = snapNode2;
                            connPipe.p2NodeId = snapNode2._nodeId;
                            mgr.nodes.set(snapNode2._nodeId, snapNode2);
                        }
                    });
                    // Dikey köprü boru: draggedPipe.p2 (yeni konum) → snapNode2 (eski konum)
                    const bridgePipe2 = new Boru(draggedPipe.p2, snapNode2, draggedPipe.boruTipi);
                    bridgePipe2.floorId = draggedPipe.floorId;
                    bridgePipe2.colorGroup = draggedPipe.colorGroup;
                    mgr.registerPipeNodes(bridgePipe2);
                    mgr.pipes.push(bridgePipe2);
                }
            }
        }
    }

    // Sürüklenen nesneyi seçili tut
    const draggedObject = interactionManager.dragObject;
    const draggedEndpoint = interactionManager.dragEndpoint;

    interactionManager.isDragging = false;
    interactionManager.dragObject = null;
    interactionManager.dragEndpoint = null;
    interactionManager.dragBacaEndpoint = null;
    interactionManager.dragStart = null;
    interactionManager._bacaDragLogged = false;
    interactionManager.selectedDragAxis = null; // Eksen seçimini sıfırla
    interactionManager.dragStartWorldPos = null; // Başlangıç pozisyonunu sıfırla
    interactionManager.dragStartObjectPos = null;
    interactionManager.isBodyDrag = false;
    interactionManager.bodyDragInitialP1 = null;
    interactionManager.bodyDragInitialP2 = null;
    interactionManager.dragAxis = null;
    interactionManager.connectedPipesAtEndpoint = null;
    interactionManager.connectedPipesAtP1 = null;
    interactionManager.connectedPipesAtP2 = null;
    interactionManager.servisKutusuConnectedPipes = null;
    interactionManager.sayacConnectedPipes = null;
    interactionManager.meterConnectedPipesAtOutput = null;
    interactionManager.ghostBridgePipes = [];
    interactionManager.pipeEndpointSnapLock = null;
    interactionManager.pipeSnapMouseStart = null;
    interactionManager.dragStartZ = null;
    interactionManager.alignedPipeChain = null; // Boru zinciri temizle
    interactionManager.alignedChainConnections = null; // Boru bağlantıları temizle

    // Sürüklenen nesneyi seçili tut
    if (draggedObject) {
        interactionManager.selectedObject = draggedObject;
        // Eğer endpoint sürüklenmişse, endpoint bilgisini de sakla
        if (draggedEndpoint) {
            interactionManager.selectedEndpoint = draggedEndpoint;
        } else {
            interactionManager.selectedEndpoint = null;
        }

        // Vana sürüklendiyse, kapama sembolü durumunu güncelle
        if (draggedObject.type === 'vana' && draggedObject.updateEndCapStatus) {
            draggedObject.updateEndCapStatus(interactionManager.manager);
        }
    }

    // TEMİZLİK
    if (interactionManager.snapSystem) interactionManager.snapSystem.clearStartPoint();

    interactionManager.manager.saveToState();
    saveState();
}

/**
 * Verilen düğümlerden AŞAĞI AKIŞ yönünde (p1→p2) ulaşılabilen
 * tüm ek düğümleri döndürür. fromNodes zaten taşınmış; dönen liste
 * aynı delta ile taşınacak ek (downstream) düğümlerdir.
 * fromNodes'un sahip olduğu pipe'lar hariç tutulur (excludePipe).
 */
/**
 * Verilen düğümlerden AŞAĞI AKIŞ yönünde (p1→p2) ulaşılabilen
 * tüm ek düğümleri döndürür. fromNodes zaten taşınmış; dönen liste
 * aynı delta ile taşınacak ek (downstream) düğümlerdir.
 * fromNodes'un sahip olduğu pipe'lar hariç tutulur (excludePipe).
 */
/**
 * Verilen node'a bağlı DÜŞEY boruları bulur ve her birinin DİĞER ucunu döndürür.
 * Düşey boru: iki uç arasındaki 2D mesafe VERTICAL_2D_THRESHOLD'dan küçük olan boru.
 * Bu fonksiyon drag başlangıcında çağrılır; dönen nesneler {otherNode, initialX, initialY} içerir.
 */
const VERTICAL_2D_THRESHOLD = 2;
function findVerticalConnectedOtherEnds(manager, node, excludePipe) {
    const result = [];
    manager.pipes.forEach(p => {
        if (p === excludePipe) return;
        let otherNode = null;
        if (p.p1 === node) otherNode = p.p2;
        else if (p.p2 === node) otherNode = p.p1;
        if (!otherNode) return;
        const dist2d = Math.hypot(p.p2.x - p.p1.x, p.p2.y - p.p1.y);
        if (dist2d < VERTICAL_2D_THRESHOLD) {
            result.push({ otherNode, initialX: otherNode.x, initialY: otherNode.y });
        }
    });
    return result;
}

function collectDownstreamNodes(manager, fromNodes, excludePipe = null) {
    const seenNodeIds = new Set(fromNodes.map(n => n._nodeId));
    const result = [];
    const queue = [...fromNodes];

    while (queue.length > 0) {
        const node = queue.shift();

        // Normal boru→boru traversal (p1→p2 yönü)
        manager.pipes.forEach(p => {
            if (p === excludePipe) return;
            if (p.p1 === node && !seenNodeIds.has(p.p2NodeId)) {
                seenNodeIds.add(p.p2NodeId);
                result.push(p.p2);
                queue.push(p.p2);
            }
        });

        // Sayaç üzerinden geçiş: bu node'a giriş yapan sayacın çıkış borusunu ekle
        manager.components.forEach(sayac => {
            if (sayac.type !== 'sayac') return;
            if (!sayac.fleksBaglanti?.boruId || !sayac.cikisBagliBoruId) return;
            const girisBoru = manager.pipes.find(p => p.id === sayac.fleksBaglanti.boruId);
            if (!girisBoru || girisBoru[sayac.fleksBaglanti.endpoint] !== node) return;
            const cikisBoru = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
            if (!cikisBoru) return;
            if (!seenNodeIds.has(cikisBoru.p1NodeId)) {
                seenNodeIds.add(cikisBoru.p1NodeId);
                result.push(cikisBoru.p1);
                queue.push(cikisBoru.p1);
            }
        });
    }
    return result;
}

/**
 * Düğümlerden ulaşılabilen downstream pipe'ları döndürür.
 */
function collectDownstreamPipes(manager, fromNodes, excludePipe = null) {
    const seenNodeIds = new Set(fromNodes.map(n => n._nodeId));
    const pipes = [];
    const queue = [...fromNodes];

    while (queue.length > 0) {
        const node = queue.shift();

        // Normal boru→boru traversal
        manager.pipes.forEach(p => {
            if (p === excludePipe || pipes.includes(p)) return;
            if (p.p1 === node) {
                pipes.push(p);
                if (!seenNodeIds.has(p.p2NodeId)) {
                    seenNodeIds.add(p.p2NodeId);
                    queue.push(p.p2);
                }
            }
        });

        // Sayaç üzerinden geçiş: çıkış borusunu da downstream pipe olarak ekle
        manager.components.forEach(sayac => {
            if (sayac.type !== 'sayac') return;
            if (!sayac.fleksBaglanti?.boruId || !sayac.cikisBagliBoruId) return;
            const girisBoru = manager.pipes.find(p => p.id === sayac.fleksBaglanti.boruId);
            if (!girisBoru || girisBoru[sayac.fleksBaglanti.endpoint] !== node) return;
            const cikisBoru = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
            if (!cikisBoru || pipes.includes(cikisBoru)) return;
            pipes.push(cikisBoru);
            if (!seenNodeIds.has(cikisBoru.p2NodeId)) {
                seenNodeIds.add(cikisBoru.p2NodeId);
                queue.push(cikisBoru.p2);
            }
        });
    }
    return pipes;
}

