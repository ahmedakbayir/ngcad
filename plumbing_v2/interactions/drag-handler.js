/**
 * Drag Handler
 * Sürükleme işlemlerini yönetir
 */

import { BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { saveState } from '../../general-files/history.js';
import { getObjectsOnPipe } from './placement-utils.js';
import { Boru } from '../objects/pipe.js';
import { state } from '../../general-files/main.js';
import { TESISAT_CONSTANTS } from './tesisat-snap.js';
import { findConnectedPipesChain } from './finders.js';

/**
 * Bir noktanın korumalı (taşınamaz) olup olmadığını kontrol eder
 * (Aynen korundu)
 */

export function isProtectedPoint(point, manager, currentPipe, oldPoint, excludeComponentId = null, skipBostaUcCheck = false) {
    const TOLERANCE = 10;
    const Z_TOLERANCE = 8; // Kullanıcının isteği üzerine Z toleransı (cm)
    
    // Noktanın Z değerini al (yoksa 0 kabul et)
    const pointZ = point.z !== undefined ? point.z : 0;

    // 1. Servis kutusu çıkışı kontrolü
    const servisKutusuCikisi = manager.components.some(c => {
        if (c.type !== 'servis_kutusu') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;
        const cikis = c.getCikisNoktasi();
        if (!cikis) return false;
        
        const dist = Math.hypot(point.x - cikis.x, point.y - cikis.y);
        const distZ = Math.abs(pointZ - (c.z || 0)); // Servis kutusu Z'si

        // Hem yatayda hem dikeyde yakınsa korumalıdır
        return dist < TOLERANCE && distZ < Z_TOLERANCE;
    });
    if (servisKutusuCikisi) return true;

    // 2. Sayaç giriş kontrolü
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

    // 3. Sayaç çıkışı kontrolü
    const sayacCikisi = manager.components.some(c => {
        if (c.type !== 'sayac') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;

        if (c.cikisBagliBoruId) {
            const cikisBoru = manager.pipes.find(p => p.id === c.cikisBagliBoruId);
            if (currentPipe && cikisBoru && currentPipe.id === cikisBoru.id) return false;

            const cikisPoint = c.getCikisNoktasi();
            const dist = Math.hypot(point.x - cikisPoint.x, point.y - cikisPoint.y);
            const distZ = Math.abs(pointZ - (c.z || 0)); // Sayaç Z'si

            if (dist < TOLERANCE && distZ < Z_TOLERANCE) return true;
        }
        return false;
    });
    if (sayacCikisi) return true;

    // 4. Cihaz fleks bağlantısı kontrolü
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

    // 5. Dirsek kontrolü
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

            // Z farkı büyükse dirsek kontrolüne takılma
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

    // 6. Boşta boru ucu kontrolü
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


/**
 * SHARED VERTEX (ORTAK KÖŞE) MANTIĞI
 * (Aynen korundu)
 */
export function findPipesAtPoint(pipes, point, excludePipe = null, tolerance = TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
    const pipesAtPoint = [];
    pipes.forEach(pipe => {
        if (pipe === excludePipe) return;

        // DÜZELTME: 3D Mesafe (Z Dahil)
        const distToP1 = Math.hypot(
            pipe.p1.x - point.x,
            pipe.p1.y - point.y,
            (pipe.p1.z || 0) - (point.z || 0)
        );
        const distToP2 = Math.hypot(
            pipe.p2.x - point.x,
            pipe.p2.y - point.y,
            (pipe.p2.z || 0) - (point.z || 0)
        );

        if (distToP1 < tolerance) pipesAtPoint.push({ pipe, endpoint: 'p1' });
        if (distToP2 < tolerance) pipesAtPoint.push({ pipe, endpoint: 'p2' });
    });
    return pipesAtPoint;
}

/**
 * Uç nokta sürüklemeyi başlat
 * (Aynen korundu)
 */
export function startEndpointDrag(interactionManager, pipe, endpoint, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = pipe;
    interactionManager.dragEndpoint = endpoint;
    interactionManager.dragStart = { ...point };

    const draggedPoint = endpoint === 'p1' ? pipe.p1 : pipe.p2;

    const connectedMeter = interactionManager.manager.components.find(c =>
        c.type === 'sayac' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id && c.fleksBaglanti.endpoint === endpoint
    );

    let excludePipes = [pipe];
    if (connectedMeter && connectedMeter.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
        if (cikisBoru) excludePipes.push(cikisBoru);
    }

    const connectedPipes = [];
    interactionManager.manager.pipes.forEach(p => {
        if (excludePipes.includes(p)) return;

        // DÜZELTME: 3D Mesafe (Z Dahil) - Böylece düşey hattın diğer ucundaki boru seçilmez
        const distToP1 = Math.hypot(
            p.p1.x - draggedPoint.x,
            p.p1.y - draggedPoint.y,
            (p.p1.z || 0) - (draggedPoint.z || 0)
        );
        const distToP2 = Math.hypot(
            p.p2.x - draggedPoint.x,
            p.p2.y - draggedPoint.y,
            (p.p2.z || 0) - (draggedPoint.z || 0)
        );

        if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) connectedPipes.push({ pipe: p, endpoint: 'p1' });
        if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) connectedPipes.push({ pipe: p, endpoint: 'p2' });
    });

    interactionManager.connectedPipesAtEndpoint = connectedPipes;
}

/**
 * Normal sürüklemeyi başlat
 * (Aynen korundu)
 */
export function startDrag(interactionManager, obj, point) {
    if (obj.type === 'baca' && obj.parentCihazId) {
        const parentCihaz = interactionManager.manager.components.find(c => c.id === obj.parentCihazId);
        if (parentCihaz) {
            obj = parentCihaz;
        }
    }

    interactionManager.isDragging = true;
    interactionManager.dragObject = obj;
    interactionManager.dragEndpoint = null;
    interactionManager.dragStart = { ...point };

    if (obj.type === 'vana' && obj.bagliBoruId) {
        interactionManager.dragObjectPipe = interactionManager.manager.pipes.find(p => p.id === obj.bagliBoruId);
        interactionManager.dragObjectsOnPipe = getObjectsOnPipe(interactionManager.manager.components, obj.bagliBoruId);
        interactionManager.dragStartZ = obj.z || 0;
    } else {
        interactionManager.dragObjectPipe = null;
        interactionManager.dragObjectsOnPipe = null;
        interactionManager.dragStartZ = null;
    }

    if (obj.type === 'servis_kutusu' && obj.bagliBoruId) {
        const boru = interactionManager.manager.pipes.find(p => p.id === obj.bagliBoruId);
        if (boru) {
            interactionManager.servisKutusuConnectedPipes = findPipesAtPoint(
                interactionManager.manager.pipes, boru.p1, boru, TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE
            );
        }
    }

    if (obj.type === 'sayac' && obj.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
        if (cikisBoru) {
            const girisBoru = obj.fleksBaglanti?.boruId
                ? interactionManager.manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId)
                : null;
            const excludePipes = [cikisBoru];
            if (girisBoru) excludePipes.push(girisBoru);

            const outputConnectedPipes = [];
            interactionManager.manager.pipes.forEach(p => {
                if (excludePipes.includes(p)) return;

                // DÜZELTME: 3D Mesafe (Z Dahil)
                const distToP1 = Math.hypot(
                    p.p1.x - cikisBoru.p1.x,
                    p.p1.y - cikisBoru.p1.y,
                    (p.p1.z || 0) - (cikisBoru.p1.z || 0)
                );
                const distToP2 = Math.hypot(
                    p.p2.x - cikisBoru.p1.x,
                    p.p2.y - cikisBoru.p1.y,
                    (p.p2.z || 0) - (cikisBoru.p1.z || 0)
                );

                if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) outputConnectedPipes.push({ pipe: p, endpoint: 'p1' });
                if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) outputConnectedPipes.push({ pipe: p, endpoint: 'p2' });
            });
            interactionManager.sayacConnectedPipes = outputConnectedPipes;
        }
    }
}

/**
 * Boru body sürüklemeyi başlat
 * GÜNCELLENDİ: Z ekseni kontrolü eklendi
 */
export function startBodyDrag(interactionManager, pipe, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = pipe;
    interactionManager.dragEndpoint = null;
    interactionManager.dragStart = { ...point };
    interactionManager.isBodyDrag = true;
    interactionManager.bodyDragInitialP1 = { ...pipe.p1 };
    interactionManager.bodyDragInitialP2 = { ...pipe.p2 };

    if (!window.__lastDraggedPipe) window.__lastDraggedPipe = { pipe: null, positions: null };

    const connectedMeterForBody = interactionManager.manager.components.find(c =>
        c.type === 'sayac' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id
    );

    let excludePipesForBody = [pipe];
    if (connectedMeterForBody && connectedMeterForBody.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeterForBody.cikisBagliBoruId);
        if (cikisBoru) excludePipesForBody.push(cikisBoru);
    }

    const connectedPipesAtP1 = [];
    const connectedPipesAtP2 = [];

    interactionManager.manager.pipes.forEach(p => {
        if (excludePipesForBody.includes(p)) return;

        // P1 KONTROLLERİ (Z DAHİL)
        const distToP1FromP1 = Math.hypot(
            p.p1.x - pipe.p1.x,
            p.p1.y - pipe.p1.y,
            (p.p1.z || 0) - (pipe.p1.z || 0)
        );
        const distToP2FromP1 = Math.hypot(
            p.p2.x - pipe.p1.x,
            p.p2.y - pipe.p1.y,
            (p.p2.z || 0) - (pipe.p1.z || 0)
        );
        if (distToP1FromP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) connectedPipesAtP1.push({ pipe: p, endpoint: 'p1' });
        if (distToP2FromP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) connectedPipesAtP1.push({ pipe: p, endpoint: 'p2' });

        // P2 KONTROLLERİ (Z DAHİL)
        const distToP1FromP2 = Math.hypot(
            p.p1.x - pipe.p2.x,
            p.p1.y - pipe.p2.y,
            (p.p1.z || 0) - (pipe.p2.z || 0)
        );
        const distToP2FromP2 = Math.hypot(
            p.p2.x - pipe.p2.x,
            p.p2.y - pipe.p2.y,
            (p.p2.z || 0) - (pipe.p2.z || 0)
        );
        if (distToP1FromP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) connectedPipesAtP2.push({ pipe: p, endpoint: 'p1' });
        if (distToP2FromP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) connectedPipesAtP2.push({ pipe: p, endpoint: 'p2' });
    });

    interactionManager.connectedPipesAtP1 = connectedPipesAtP1;
    interactionManager.connectedPipesAtP2 = connectedPipesAtP2;
    interactionManager.meterConnectedPipesAtOutput = null;

    if (connectedMeterForBody && connectedMeterForBody.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeterForBody.cikisBagliBoruId);
        if (cikisBoru) {
            const excludePipes = [cikisBoru, pipe];
            const outputConnectedPipes = [];
            interactionManager.manager.pipes.forEach(p => {
                if (excludePipes.includes(p)) return;
                // DÜZELTME: Z Dahil
                const distToP1 = Math.hypot(
                    p.p1.x - cikisBoru.p1.x,
                    p.p1.y - cikisBoru.p1.y,
                    (p.p1.z || 0) - (cikisBoru.p1.z || 0)
                );
                const distToP2 = Math.hypot(
                    p.p2.x - cikisBoru.p1.x,
                    p.p2.y - cikisBoru.p1.y,
                    (p.p2.z || 0) - (cikisBoru.p1.z || 0)
                );
                if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) outputConnectedPipes.push({ pipe: p, endpoint: 'p1' });
                if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) outputConnectedPipes.push({ pipe: p, endpoint: 'p2' });
            });
            interactionManager.meterConnectedPipesAtOutput = outputConnectedPipes;
        }
    }

    interactionManager.useBridgeMode = false;

    if (interactionManager.connectedPipesAtP1.length === 1 && interactionManager.connectedPipesAtP2.length === 1) {
        const pipeA = interactionManager.connectedPipesAtP1[0].pipe;
        const pipeC = interactionManager.connectedPipesAtP2[0].pipe;

        // DÜZELTME: Bridge check için Z kontrolü
        const p1OfA = (Math.hypot(
            pipeA.p1.x - pipe.p1.x,
            pipeA.p1.y - pipe.p1.y,
            (pipeA.p1.z || 0) - (pipe.p1.z || 0)
        ) < 1) ? pipeA.p2 : pipeA.p1;

        const p2OfC = (Math.hypot(
            pipeC.p1.x - pipe.p2.x,
            pipeC.p1.y - pipe.p2.y,
            (pipeC.p1.z || 0) - (pipe.p2.z || 0)
        ) < 1) ? pipeC.p2 : pipeC.p1;

        const p1 = p1OfA;
        const p2 = pipe.p1;
        const p3 = pipe.p2;
        const p4 = p2OfC;
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const v3 = { x: p4.x - p3.x, y: p4.y - p3.y };
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
            const isColinear = Math.abs(dot12) > ANGLE_TOLERANCE && Math.abs(dot23) > ANGLE_TOLERANCE && Math.sign(dot12) === Math.sign(dot23);
            interactionManager.useBridgeMode = isColinear;
        }
    }

    // Borunun hangi yönde uzandığını tespit et
    const dx = Math.abs(pipe.p2.x - pipe.p1.x);
    const dy = Math.abs(pipe.p2.y - pipe.p1.y);
    const dz = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));

    const AXIS_THRESHOLD = 2; // 2cm'den küçük farklar benzer kabul edilir

    // Borunun uzandığı ekseni tespit et (taşınamaz eksen)
    let pipeLockAxis = null; // Borunun uzandığı eksen (bu eksen kilitli)

    if (dx > dy + AXIS_THRESHOLD && dx > dz + AXIS_THRESHOLD) {
        pipeLockAxis = 'x'; // X yönünde uzanıyor
    } else if (dy > dx + AXIS_THRESHOLD && dy > dz + AXIS_THRESHOLD) {
        pipeLockAxis = 'y'; // Y yönünde uzanıyor
    } else if (dz > dx + AXIS_THRESHOLD && dz > dy + AXIS_THRESHOLD) {
        pipeLockAxis = 'z'; // Z yönünde uzanıyor
    }
    // Diagonal veya çok kısa boru ise null

    interactionManager.pipeLockAxis = pipeLockAxis;
    interactionManager.dragAxis = null; // İlk başta null, handleDrag'de mouse hareketine göre belirlenecek
}

/**
 * Sürükleme işlemini gerçekleştir
 */
export function handleDrag(interactionManager, point, event = null) {
    if (!interactionManager.dragObject) return;

    const obj = interactionManager.dragObject;
    const t = state.viewBlendFactor || 0;

    // --- 3D Z-KOORDİNAT DÜZELTMESİ ---
    let zOffset = obj.z || 0;
    let isVerticalDrag = false;
    let verticalPipeBase = null; // {x, y, z, p2z}

    // Eğer boruya bağlı bir nesne ise, borunun durumunu kontrol et
    if (obj.bagliBoruId) {
        const pipe = interactionManager.manager.findPipeById(obj.bagliBoruId);
        if (pipe) {
            // Borunun geometrisini analiz et
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
            const len2d = Math.hypot(dx, dy);

            // Düşey boru tespiti (3D modunda ve dik boru)
            if (t > 0.1 && (len2d < 2.0 || Math.abs(dz) > len2d)) {
                isVerticalDrag = true;
                verticalPipeBase = {
                    x: pipe.p1.x,
                    y: pipe.p1.y,
                    z: pipe.p1.z || 0,
                    p2z: pipe.p2.z || 0
                };
                // Düşey sürüklemede Z'yi mouse hareketinden hesaplayacağız, o yüzden şimdilik offset 0 alıyoruz
                // (Hesaplama aşağıda correctedPoint içinde yapılacak)
            } else {
                // Yatay/Eğik boru: Vana için t parametresine göre Z interpolasyonu yap
                if (obj.type === 'vana') {
                    // DÜZELTME: Mouse pozisyonunu boruya projekte edip gerçek t değerini bul
                    // Bu sayede vana farklı yüksekliklere geçerken de doğru Z offseti kullanılır
                    const proj = pipe.projectPoint(point);
                    const currentT = (proj && proj.onSegment) ? proj.t : (obj.vanaT || 0);

                    const z1 = pipe.p1.z || 0;
                    const z2 = pipe.p2.z || 0;
                    zOffset = z1 + currentT * (z2 - z1);
                } else {
                    // Diğer objeler: Başlangıç yüksekliğini baz al
                    zOffset = obj.z !== undefined ? obj.z : (pipe.p1.z || 0);
                }
            }
        }
    }
    // Boru ucu sürükleme durumunda Z tespiti
    else if (obj.type === 'boru' && interactionManager.dragEndpoint) {
        zOffset = (interactionManager.dragEndpoint === 'p1' ? obj.p1.z : obj.p2.z) || 0;
    }

    let correctedPoint;

    if (isVerticalDrag && verticalPipeBase) {
        // --- DÜŞEY BORU İÇİN ÖZEL HESAPLAMA (DELTA BAZLI) ---
        // İzometrik projeksiyonda Z artarken ekranda sağ-üst diagonal hareket olur:
        //   screen_x += z * t
        //   screen_y -= z * t
        // Diagonal bileşen: (dx - dy) bize Z yönündeki hareketi verir
        // deltaZ = (screen_dx - screen_dy) / (2 * t)

        const startZ = interactionManager.dragStartZ || 0;

        // Mouse'un ekran koordinatındaki delta (başlangıç pozisyonundan)
        const screenDx = point.x - interactionManager.dragStart.x;
        const screenDy = point.y - interactionManager.dragStart.y;

        // Z delta hesapla (sağ-üst diagonal hareket = pozitif Z)
        const deltaZ = (screenDx - screenDy) / (2 * t);

        // Yeni Z pozisyonu
        const newZ = startZ + deltaZ;

        // Boru sınırlarını kontrol et
        const minZ = Math.min(verticalPipeBase.z, verticalPipeBase.p2z);
        const maxZ = Math.max(verticalPipeBase.z, verticalPipeBase.p2z);
        const clampedZ = Math.max(minZ, Math.min(maxZ, newZ));

        correctedPoint = {
            x: verticalPipeBase.x, // X sabit
            y: verticalPipeBase.y, // Y sabit
            z: clampedZ // Z dinamik ve sınırlı
        };
    } else {
        // --- STANDART 3D DÜZELTME (Yatay/Eğik/Serbest) ---
        // Farenin bulunduğu yerden Z etkisi kadar ters yöne giderek "gerçek" konumu buluyoruz.
        correctedPoint = {
            x: point.x - (zOffset * t),
            y: point.y + (zOffset * t),
            z: zOffset
        };
    }
    // -----------------------------------------

    // 1. Baca Sürükleme
    if (interactionManager.dragBacaEndpoint && interactionManager.dragObject.type === 'baca') {
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
        endpoint.x = snappedX;
        endpoint.y = snappedY;
        return;
    }

    // 2. Boru Ucu Sürükleme
    if (interactionManager.dragEndpoint && interactionManager.dragObject.type === 'boru') {
        const pipe = interactionManager.dragObject;

        // Servis kutusuna veya sayaca bağlı uç taşınamaz
        const ucBaglanti = interactionManager.dragEndpoint === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
        if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU || ucBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
            return;
        }

        const oldPoint = interactionManager.dragEndpoint === 'p1' ? { ...pipe.p1 } : { ...pipe.p2 };

        // 3D Düzeltilmiş nokta kullanılıyor
        let finalPos = { x: correctedPoint.x, y: correctedPoint.y, z: correctedPoint.z };

        // DUVAR SNAP SİSTEMİ
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

            if (lengthSq === 0) {
                wallDistance = Math.hypot(finalPos.x - wall.p1.x, finalPos.y - wall.p1.y);
            } else {
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
                const snapXPositions = [
                    wall.p1.x - halfThickness - BORU_CLEARANCE,
                    wall.p1.x + halfThickness + BORU_CLEARANCE
                ];
                for (const snapX of snapXPositions) {
                    const diff = Math.abs(finalPos.x - snapX);
                    if (diff < bestSnapX.diff) bestSnapX = { diff, value: snapX };
                }
            } else if (isHorizontal) {
                const snapYPositions = [
                    wall.p1.y - halfThickness - BORU_CLEARANCE,
                    wall.p1.y + halfThickness + BORU_CLEARANCE
                ];
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

        // Boru hizalama snap'i
        const connectionTolerance = 1;
        const connectedPipes = interactionManager.manager.pipes.filter(p => {
            if (p === pipe) return false;
            const distToP1 = Math.hypot(p.p1.x - oldPoint.x, p.p1.y - oldPoint.y);
            const distToP2 = Math.hypot(p.p2.x - oldPoint.x, p.p2.y - oldPoint.y);
            return distToP1 < connectionTolerance || distToP2 < connectionTolerance;
        });

        const PIPE_ENDPOINT_SNAP_DISTANCE = 10;
        let pipeSnapX = null;
        let pipeSnapY = null;
        let minPipeSnapDistX = PIPE_ENDPOINT_SNAP_DISTANCE;
        let minPipeSnapDistY = PIPE_ENDPOINT_SNAP_DISTANCE;

        const ownOtherEndpoint = interactionManager.dragEndpoint === 'p1' ? pipe.p2 : pipe.p1;
        const ownXDiff = Math.abs(finalPos.x - ownOtherEndpoint.x);
        if (ownXDiff < minPipeSnapDistX) { minPipeSnapDistX = ownXDiff; pipeSnapX = ownOtherEndpoint.x; }
        const ownYDiff = Math.abs(finalPos.y - ownOtherEndpoint.y);
        if (ownYDiff < minPipeSnapDistY) { minPipeSnapDistY = ownYDiff; pipeSnapY = ownOtherEndpoint.y; }

        connectedPipes.forEach(connectedPipe => {
            const distToP1 = Math.hypot(connectedPipe.p1.x - oldPoint.x, connectedPipe.p1.y - oldPoint.y);
            const otherEndpoint = distToP1 < connectionTolerance ? connectedPipe.p2 : connectedPipe.p1;
            const xDiff = Math.abs(finalPos.x - otherEndpoint.x);
            if (xDiff < minPipeSnapDistX) { minPipeSnapDistX = xDiff; pipeSnapX = otherEndpoint.x; }
            const yDiff = Math.abs(finalPos.y - otherEndpoint.y);
            if (yDiff < minPipeSnapDistY) { minPipeSnapDistY = yDiff; pipeSnapY = otherEndpoint.y; }
        });

        if (pipeSnapX !== null) finalPos.x = pipeSnapX;
        if (pipeSnapY !== null) finalPos.y = pipeSnapY;

        // Korumalı nokta kontrolü
        const isProtected = isProtectedPoint(finalPos, interactionManager.manager, pipe, oldPoint);
        if (isProtected) return;

        // Doluluk kontrolü
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

                // 2D Mesafe
                const dist = Math.hypot(endpoint.x - finalPos.x, endpoint.y - finalPos.y);

                // DEĞİŞİKLİK: Z Mesafesi Kontrolü
                // Mevcut boru ucunun yeni Z'si (correctedPoint.z) ile diğer boru ucunun Z'si karşılaştırılır
                const distZ = Math.abs((endpoint.z || 0) - (correctedPoint.z || 0));

                const isElbow = interactionManager.manager.pipes.some(p => {
                    if (p === otherPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < elbowConnectionTolerance || d2 < elbowConnectionTolerance;
                });

                const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;

                // DEĞİŞİKLİK: Hem yatayda (dist) hem de düşeyde (distZ) yakınsa engelle.
                // Eğer Z farkı toleranstan büyükse, üst üste gelebilirler (occupied = false kalır).
                if (dist < tolerance && distZ < tolerance) {
                    occupiedByOtherPipe = true;
                    break;
                }
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

        let newLength;
        if (interactionManager.dragEndpoint === 'p1') {
            newLength = Math.hypot(finalPos.x - pipe.p2.x, finalPos.y - pipe.p2.y);
        } else {
            newLength = Math.hypot(pipe.p1.x - finalPos.x, pipe.p1.y - finalPos.y);
        }

        if (!occupiedByOtherPipe && newLength >= minLength) {
            const oldLength = pipe.uzunluk;
            if (interactionManager.dragEndpoint === 'p1') {
                pipe.p1.x = finalPos.x;
                pipe.p1.y = finalPos.y;
            } else {
                pipe.p2.x = finalPos.x;
                pipe.p2.y = finalPos.y;
            }

            valvesOnPipe.forEach(valve => {
                const distanceFromP2 = (1 - valve.boruPozisyonu) * oldLength;
                valve.boruPozisyonu = 1 - (distanceFromP2 / pipe.uzunluk);
                valve.fromEnd = 'p2';
                valve.fixedDistance = distanceFromP2;
                valve.updatePositionFromPipe(pipe);
            });

            // Bağlı diğer bileşenleri de güncelle
            // (Sayac, cihaz vb.)
            const connectedMeter = interactionManager.manager.components.find(c =>
                c.type === 'sayac' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id && c.fleksBaglanti.endpoint === interactionManager.dragEndpoint
            );
            if (connectedMeter) {
                const dx = finalPos.x - oldPoint.x;
                const dy = finalPos.y - oldPoint.y;
                connectedMeter.x += dx;
                connectedMeter.y += dy;
                if (connectedMeter.cikisBagliBoruId) {
                    const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
                    if (cikisBoru) {
                        cikisBoru.p1.x += dx;
                        cikisBoru.p1.y += dy;
                    }
                }
            }

            const connectedDevice = interactionManager.manager.components.find(c =>
                c.type === 'cihaz' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id && c.fleksBaglanti.endpoint === interactionManager.dragEndpoint
            );
            if (connectedDevice) {
                const dx = finalPos.x - oldPoint.x;
                const dy = finalPos.y - oldPoint.y;
                connectedDevice.x += dx;
                connectedDevice.y += dy;
                const bacalar = interactionManager.manager.components.filter(c => c.type === 'baca' && c.parentCihazId === connectedDevice.id);
                bacalar.forEach(baca => {
                    baca.startX += dx;
                    baca.startY += dy;
                    baca.currentSegmentStart.x += dx;
                    baca.currentSegmentStart.y += dy;
                    baca.segments.forEach(seg => { seg.x1 += dx; seg.y1 += dy; seg.x2 += dx; seg.y2 += dy; });
                    if (baca.havalandirma) { baca.havalandirma.x += dx; baca.havalandirma.y += dy; }
                });
            }

            if (interactionManager.connectedPipesAtEndpoint && interactionManager.connectedPipesAtEndpoint.length > 0) {
                interactionManager.connectedPipesAtEndpoint.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                    connectedPipe[connectedEndpoint].x = finalPos.x;
                    connectedPipe[connectedEndpoint].y = finalPos.y;
                });
            }

            if (event && event.ctrlKey) {
                const dx = finalPos.x - oldPoint.x;
                const dy = finalPos.y - oldPoint.y;
                const downstreamChain = [];
                const visited = new Set([pipe.id]);
                const queue = [];
                const tolerance = 1;

                interactionManager.manager.pipes.forEach(otherPipe => {
                    if (otherPipe.id === pipe.id) return;
                    const p1Dist = Math.hypot(otherPipe.p1.x - finalPos.x, otherPipe.p1.y - finalPos.y);
                    const p2Dist = Math.hypot(otherPipe.p2.x - finalPos.x, otherPipe.p2.y - finalPos.y);
                    if (p1Dist < tolerance || p2Dist < tolerance) { visited.add(otherPipe.id); queue.push(otherPipe); }
                });

                while (queue.length > 0) {
                    const currentPipe = queue.shift();
                    downstreamChain.push(currentPipe);
                    interactionManager.manager.pipes.forEach(otherPipe => {
                        if (visited.has(otherPipe.id)) return;
                        const p1ToP1 = Math.hypot(otherPipe.p1.x - currentPipe.p1.x, otherPipe.p1.y - currentPipe.p1.y);
                        const p1ToP2 = Math.hypot(otherPipe.p1.x - currentPipe.p2.x, otherPipe.p1.y - currentPipe.p2.y);
                        const p2ToP1 = Math.hypot(otherPipe.p2.x - currentPipe.p1.x, otherPipe.p2.y - currentPipe.p1.y);
                        const p2ToP2 = Math.hypot(otherPipe.p2.x - currentPipe.p2.x, otherPipe.p2.y - currentPipe.p2.y);
                        if (p1ToP1 < tolerance || p1ToP2 < tolerance || p2ToP1 < tolerance || p2ToP2 < tolerance) { visited.add(otherPipe.id); queue.push(otherPipe); }
                    });
                }

                downstreamChain.forEach(chainPipe => {
                    chainPipe.p1.x += dx; chainPipe.p1.y += dy;
                    chainPipe.p2.x += dx; chainPipe.p2.y += dy;
                    const vanaListesi = interactionManager.manager.components.filter(c => c.type === 'vana' && c.bagliBoruId === chainPipe.id);
                    vanaListesi.forEach(vana => { vana.x += dx; vana.y += dy; });
                    const componentListesi = interactionManager.manager.components.filter(c => (c.type === 'sayac' || c.type === 'cihaz') && c.fleksBaglanti && c.fleksBaglanti.boruId === chainPipe.id);
                    componentListesi.forEach(comp => {
                        comp.x += dx; comp.y += dy;
                        if (comp.type === 'sayac' && comp.cikisBagliBoruId) {
                            const cikisBoru = interactionManager.manager.pipes.find(p => p.id === comp.cikisBagliBoruId);
                            if (cikisBoru && !visited.has(cikisBoru.id)) { cikisBoru.p1.x += dx; cikisBoru.p1.y += dy; }
                        }
                        if (comp.type === 'cihaz') {
                            const bacalar = interactionManager.manager.components.filter(c => c.type === 'baca' && c.parentCihazId === comp.id);
                            bacalar.forEach(baca => {
                                baca.startX += dx; baca.startY += dy;
                                baca.currentSegmentStart.x += dx; baca.currentSegmentStart.y += dy;
                                baca.segments.forEach(seg => { seg.x1 += dx; seg.y1 += dy; seg.x2 += dx; seg.y2 += dy; });
                                if (baca.havalandirma) { baca.havalandirma.x += dx; baca.havalandirma.y += dy; }
                            });
                        }
                    });
                });
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
            }
        }
        return;
    }

    // 7. Boru Gövdesi Taşıma
    if (interactionManager.dragObject.type === 'boru' && interactionManager.isBodyDrag) {
        const pipe = interactionManager.dragObject;
        const t = state.viewBlendFactor || 0;

        const deltaX = point.x - interactionManager.dragStart.x;
        const deltaY = point.y - interactionManager.dragStart.y;

        let offsetX = deltaX;
        let offsetY = deltaY;
        let offsetZ = 0;

        // 3D Mod aktifse Z ekseni için hesaplama yap
        if (t > 0.1) {
            // İzometrik projeksiyonda Z hareketi: diagonal (sağ-üst) hareket
            // screen_x += z * t
            // screen_y -= z * t
            // deltaZ = (screen_dx - screen_dy) / (2 * t)
            offsetZ = (deltaX - deltaY) / (2 * t);
        }

        // Mouse hareketine göre hangi eksende taşınacağını belirle
        const pipeLockAxis = interactionManager.pipeLockAxis;
        let dragAxis = null;

        if (pipeLockAxis === null) {
            // Diagonal veya kısa boru - serbest taşıma
            dragAxis = null;
        } else {
            // Borunun uzandığı eksen kilitli, diğer eksenlerden en büyük hareketi seç
            if (pipeLockAxis === 'x') {
                // X kilitli, Y veya Z'de taşınabilir
                if (Math.abs(offsetY) > Math.abs(offsetZ)) {
                    dragAxis = 'y';
                } else if (Math.abs(offsetZ) > 0.5) { // Z için minimum threshold
                    dragAxis = 'z';
                } else {
                    dragAxis = 'y'; // Default olarak Y
                }
            } else if (pipeLockAxis === 'y') {
                // Y kilitli, X veya Z'de taşınabilir
                if (Math.abs(offsetX) > Math.abs(offsetZ)) {
                    dragAxis = 'x';
                } else if (Math.abs(offsetZ) > 0.5) {
                    dragAxis = 'z';
                } else {
                    dragAxis = 'x';
                }
            } else if (pipeLockAxis === 'z') {
                // Z kilitli, X veya Y'de taşınabilir
                if (Math.abs(offsetX) > Math.abs(offsetY)) {
                    dragAxis = 'x';
                } else {
                    dragAxis = 'y';
                }
            }
        }

        // Seçilen eksene göre diğer eksenleri sıfırla
        if (dragAxis === 'x') {
            offsetY = 0;
            offsetZ = 0;
        } else if (dragAxis === 'y') {
            offsetX = 0;
            offsetZ = 0;
        } else if (dragAxis === 'z') {
            offsetX = 0;
            offsetY = 0;
        }

        // dragAxis'i kaydet (görsel feedback için)
        interactionManager.dragAxis = dragAxis;

        const newP1 = {
            x: interactionManager.bodyDragInitialP1.x + offsetX,
            y: interactionManager.bodyDragInitialP1.y + offsetY,
            z: (interactionManager.bodyDragInitialP1.z || 0) + offsetZ
        };
        const newP2 = {
            x: interactionManager.bodyDragInitialP2.x + offsetX,
            y: interactionManager.bodyDragInitialP2.y + offsetY,
            z: (interactionManager.bodyDragInitialP2.z || 0) + offsetZ
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

        pipe.p1.x = newP1.x; pipe.p1.y = newP1.y; pipe.p1.z = newP1.z;
        pipe.p2.x = newP2.x; pipe.p2.y = newP2.y; pipe.p2.z = newP2.z;

        if (interactionManager.useBridgeMode) {
            interactionManager.ghostBridgePipes = [];
            const MIN_BRIDGE_LENGTH = 5;
            if (interactionManager.connectedPipesAtP1.length > 0) {
                const dist = Math.hypot(pipe.p1.x - interactionManager.bodyDragInitialP1.x, pipe.p1.y - interactionManager.bodyDragInitialP1.y);
                if (dist >= MIN_BRIDGE_LENGTH) interactionManager.ghostBridgePipes.push({ p1: { ...interactionManager.bodyDragInitialP1 }, p2: { ...pipe.p1 }, type: 'ghost_bridge' });
            }
            if (interactionManager.connectedPipesAtP2.length > 0) {
                const dist = Math.hypot(pipe.p2.x - interactionManager.bodyDragInitialP2.x, pipe.p2.y - interactionManager.bodyDragInitialP2.y);
                if (dist >= MIN_BRIDGE_LENGTH) interactionManager.ghostBridgePipes.push({ p1: { ...pipe.p2 }, p2: { ...interactionManager.bodyDragInitialP2 }, type: 'ghost_bridge' });
            }
        } else {
            interactionManager.ghostBridgePipes = [];
            if (interactionManager.connectedPipesAtP1 && interactionManager.connectedPipesAtP1.length > 0) {
                interactionManager.connectedPipesAtP1.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                    connectedPipe[connectedEndpoint].x = newP1.x;
                    connectedPipe[connectedEndpoint].y = newP1.y;
                    connectedPipe[connectedEndpoint].z = newP1.z;
                });
            }
            if (interactionManager.connectedPipesAtP2 && interactionManager.connectedPipesAtP2.length > 0) {
                interactionManager.connectedPipesAtP2.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                    connectedPipe[connectedEndpoint].x = newP2.x;
                    connectedPipe[connectedEndpoint].y = newP2.y;
                    connectedPipe[connectedEndpoint].z = newP2.z;
                });
            }
            if (interactionManager.meterConnectedPipesAtOutput && interactionManager.meterConnectedPipesAtOutput.length > 0) {
                const connectedMeter = interactionManager.manager.components.find(c => c.type === 'sayac' && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id);
                if (connectedMeter) {
                    connectedMeter.x += offsetX;
                    connectedMeter.y += offsetY;
                    if (connectedMeter.z !== undefined) connectedMeter.z += offsetZ;
                    if (connectedMeter.cikisBagliBoruId) {
                        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
                        if (cikisBoru) {
                            cikisBoru.p1.x += offsetX;
                            cikisBoru.p1.y += offsetY;
                            if (cikisBoru.p1.z !== undefined) cikisBoru.p1.z += offsetZ;
                            const newOutputP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y, z: cikisBoru.p1.z || 0 };
                            interactionManager.meterConnectedPipesAtOutput.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                                connectedPipe[connectedEndpoint].x = newOutputP1.x;
                                connectedPipe[connectedEndpoint].y = newOutputP1.y;
                                connectedPipe[connectedEndpoint].z = newOutputP1.z;
                            });
                        }
                    }
                }
            }
        }
        return;
    }

    // Diğer nesneler
    if (interactionManager.dragObject.type !== 'boru') {
        const result = interactionManager.dragObject.move(point.x, point.y);
        interactionManager.updateConnectedPipe(result);
    }
}

/**
 * Bağlı boru zincirini günceller
 * GÜNCELLENDİ: Z ekseni kontrolü eklendi
 */
export function updateConnectedPipesChain(interactionManager, oldPoint, newPoint) {
    const tolerance = 0.5;
    interactionManager.manager.pipes.forEach(pipe => {
        // P1 KONTROLÜ (Z DAHİL)
        const distP1 = Math.hypot(
            pipe.p1.x - oldPoint.x,
            pipe.p1.y - oldPoint.y,
            (pipe.p1.z || 0) - (oldPoint.z || 0)
        );
        if (distP1 < tolerance) {
            pipe.p1.x = newPoint.x;
            pipe.p1.y = newPoint.y;
            // Opsiyonel: Eğer newPoint'te Z bilgisi varsa Z'yi de güncelle
            // if(newPoint.z !== undefined) pipe.p1.z = newPoint.z;
        }

        // P2 KONTROLÜ (Z DAHİL)
        const distP2 = Math.hypot(
            pipe.p2.x - oldPoint.x,
            pipe.p2.y - oldPoint.y,
            (pipe.p2.z || 0) - (oldPoint.z || 0)
        );
        if (distP2 < tolerance) {
            pipe.p2.x = newPoint.x;
            pipe.p2.y = newPoint.y;
            // Opsiyonel: if(newPoint.z !== undefined) pipe.p2.z = newPoint.z;
        }
    });
}

/**
 * Sürüklemeyi sonlandır
 * (Aynen korundu)
 */
export function endDrag(interactionManager) {
    if (interactionManager.isBodyDrag && interactionManager.dragObject && interactionManager.dragObject.type === 'boru') {
        const draggedPipe = interactionManager.dragObject;
        const oldP1 = interactionManager.bodyDragInitialP1;
        const oldP2 = interactionManager.bodyDragInitialP2;
        const newP1 = draggedPipe.p1;
        const newP2 = draggedPipe.p2;

        if (interactionManager.useBridgeMode) {
            const MIN_BRIDGE_LENGTH = 5;
            const p1Connections = interactionManager.connectedPipesAtP1 || [];
            const p2Connections = interactionManager.connectedPipesAtP2 || [];

            if (p1Connections.length > 0) {
                const distP1 = Math.hypot(newP1.x - oldP1.x, newP1.y - oldP1.y);
                if (distP1 >= MIN_BRIDGE_LENGTH) {
                    const bridgePipe1 = new Boru({ x: oldP1.x, y: oldP1.y, z: oldP1.z || 0 }, { x: newP1.x, y: newP1.y, z: newP1.z || 0 }, draggedPipe.boruTipi);
                    bridgePipe1.floorId = draggedPipe.floorId;
                    bridgePipe1.colorGroup = draggedPipe.colorGroup;
                    interactionManager.manager.pipes.push(bridgePipe1);
                    const parentAtP1 = p1Connections.find(c => draggedPipe.baslangicBaglanti && draggedPipe.baslangicBaglanti.hedefId === c.pipe.id);
                    if (parentAtP1) { bridgePipe1.setBaslangicBaglanti('boru', parentAtP1.pipe.id); draggedPipe.setBaslangicBaglanti('boru', bridgePipe1.id); }
                    const childrenAtP1 = p1Connections.filter(c => c.pipe.baslangicBaglanti && c.pipe.baslangicBaglanti.hedefId === draggedPipe.id);
                    if (childrenAtP1.length > 0) { bridgePipe1.setBaslangicBaglanti('boru', draggedPipe.id); childrenAtP1.forEach(c => { c.pipe.setBaslangicBaglanti('boru', bridgePipe1.id); }); }
                }
            }

            if (p2Connections.length > 0) {
                const distP2 = Math.hypot(newP2.x - oldP2.x, newP2.y - oldP2.y);
                if (distP2 >= MIN_BRIDGE_LENGTH) {
                    const bridgePipe2 = new Boru({ x: newP2.x, y: newP2.y, z: newP2.z || 0 }, { x: oldP2.x, y: oldP2.y, z: oldP2.z || 0 }, draggedPipe.boruTipi);
                    bridgePipe2.floorId = draggedPipe.floorId;
                    bridgePipe2.colorGroup = draggedPipe.colorGroup;
                    interactionManager.manager.pipes.push(bridgePipe2);
                    const parentAtP2 = p2Connections.find(c => draggedPipe.baslangicBaglanti && draggedPipe.baslangicBaglanti.hedefId === c.pipe.id);
                    if (parentAtP2) { bridgePipe2.setBaslangicBaglanti('boru', parentAtP2.pipe.id); draggedPipe.setBaslangicBaglanti('boru', bridgePipe2.id); }
                    const childrenAtP2 = p2Connections.filter(c => c.pipe.baslangicBaglanti && c.pipe.baslangicBaglanti.hedefId === draggedPipe.id);
                    if (childrenAtP2.length > 0) { bridgePipe2.setBaslangicBaglanti('boru', draggedPipe.id); childrenAtP2.forEach(c => { c.pipe.setBaslangicBaglanti('boru', bridgePipe2.id); }); }
                }
            }
        }
    }

    interactionManager.isDragging = false;
    interactionManager.dragObject = null;
    interactionManager.dragEndpoint = null;
    interactionManager.dragBacaEndpoint = null;
    interactionManager.dragStart = null;
    interactionManager._bacaDragLogged = false;
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
    interactionManager.dragStartZ = null; // DÜZELTME: dragStartZ'yi de temizle

    interactionManager.manager.saveToState();
    saveState();
}