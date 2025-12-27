/**
 * Drag Handler
 * Sürükleme işlemlerini yönetir
 */

import { BAGLANTI_TIPLERI } from '../../objects/pipe.js';
import { saveState } from '../../../general-files/history.js';
import { getObjectsOnPipe } from '../../utils/placement-utils.js';
import { Boru } from '../../objects/pipe.js';
import { state } from '../../../general-files/main.js';

/**
 * Bir noktaya bağlı parent ve children borularını bulur
 * PARENT: O noktaya p2 ile bağlanan boru (1 tane)
 * CHILDREN: O noktadan p1 ile çıkan borular (N tane)
 *
 * @param {Array} pipes - Tüm borular
 * @param {Object} point - Nokta {x, y}
 * @param {Object} excludePipe - Hariç tutulacak boru (opsiyonel)
 * @returns {Object} { parent: {pipe, endpoint}, children: [{pipe, endpoint}, ...] }
 */
function getNodeConnections(pipes, point, excludePipe = null) {
    const TOLERANCE = 1.0;
    let parent = null;
    const children = [];

    pipes.forEach(pipe => {
        if (pipe === excludePipe) return;

        const distToP1 = Math.hypot(pipe.p1.x - point.x, pipe.p1.y - point.y);
        const distToP2 = Math.hypot(pipe.p2.x - point.x, pipe.p2.y - point.y);

        // Parent: Bu boru bu noktaya p2 ile bağlanıyor
        if (distToP2 < TOLERANCE && !parent) {
            parent = { pipe, endpoint: 'p2' };
        }

        // Children: Bu boru bu noktadan p1 ile çıkıyor
        if (distToP1 < TOLERANCE) {
            children.push({ pipe, endpoint: 'p1' });
        }
    });

    return { parent, children };
}

/**
 * Bir noktanın parent ve children'larını yeni pozisyona güncelle
 * RECURSIVE: Tüm zincir boyunca günceller
 *
 * @param {Array} pipes - Tüm borular
 * @param {Object} oldPoint - Eski nokta {x, y}
 * @param {Object} newPoint - Yeni nokta {x, y}
 */
export function updateNodeConnections(pipes, oldPoint, newPoint) {
    const connections = getNodeConnections(pipes, oldPoint);
    const updatedPipes = new Set(); // Güncellenen boruları takip et (sonsuz loop önleme)

    // Parent'ı güncelle
    if (connections.parent) {
        const parentPipe = connections.parent.pipe;
        const parentEndpoint = connections.parent.endpoint;
        const oldParentPos = { ...parentPipe[parentEndpoint] };

        parentPipe[parentEndpoint].x = newPoint.x;
        parentPipe[parentEndpoint].y = newPoint.y;
        updatedPipes.add(parentPipe.id);

        // Parent'ın diğer ucundaki bağlantıları da güncelle (recursive)
        const otherEndpoint = parentEndpoint === 'p1' ? 'p2' : 'p1';
        const otherPos = parentPipe[otherEndpoint];
        updateNodeConnectionsRecursive(pipes, otherPos, otherPos, updatedPipes);
    }

    // Tüm children'ları güncelle
    connections.children.forEach(child => {
        const childPipe = child.pipe;
        const childEndpoint = child.endpoint;
        const oldChildPos = { ...childPipe[childEndpoint] };

        childPipe[childEndpoint].x = newPoint.x;
        childPipe[childEndpoint].y = newPoint.y;
        updatedPipes.add(childPipe.id);

        // Child'ın diğer ucundaki bağlantıları da güncelle (recursive)
        const otherEndpoint = childEndpoint === 'p1' ? 'p2' : 'p1';
        const otherPos = childPipe[otherEndpoint];
        updateNodeConnectionsRecursive(pipes, otherPos, otherPos, updatedPipes);
    });
}

/**
 * Recursive helper - zincir boyunca tüm bağlantıları güncelle
 */
function updateNodeConnectionsRecursive(pipes, oldPoint, newPoint, updatedPipes) {
    const connections = getNodeConnections(pipes, oldPoint);

    // Parent'ı güncelle
    if (connections.parent && !updatedPipes.has(connections.parent.pipe.id)) {
        const parentPipe = connections.parent.pipe;
        const parentEndpoint = connections.parent.endpoint;

        parentPipe[parentEndpoint].x = newPoint.x;
        parentPipe[parentEndpoint].y = newPoint.y;
        updatedPipes.add(parentPipe.id);

        // Devam et
        const otherEndpoint = parentEndpoint === 'p1' ? 'p2' : 'p1';
        const otherPos = parentPipe[otherEndpoint];
        updateNodeConnectionsRecursive(pipes, otherPos, otherPos, updatedPipes);
    }

    // Children'ları güncelle
    connections.children.forEach(child => {
        if (!updatedPipes.has(child.pipe.id)) {
            const childPipe = child.pipe;
            const childEndpoint = child.endpoint;

            childPipe[childEndpoint].x = newPoint.x;
            childPipe[childEndpoint].y = newPoint.y;
            updatedPipes.add(childPipe.id);

            // Devam et
            const otherEndpoint = childEndpoint === 'p1' ? 'p2' : 'p1';
            const otherPos = childPipe[otherEndpoint];
            updateNodeConnectionsRecursive(pipes, otherPos, otherPos, updatedPipes);
        }
    });
}

/**
 * Uç nokta sürüklemeyi başlat
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} pipe - Boru nesnesi
 * @param {string} endpoint - Uç nokta ('p1' veya 'p2')
 * @param {Object} point - Başlangıç noktası {x, y}
 */
export function startEndpointDrag(interactionManager, pipe, endpoint, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = pipe;
    interactionManager.dragEndpoint = endpoint;
    interactionManager.dragStart = { ...point };

    // Sürüklenen uç nokta için parent ve children'ları bul
    const draggedPoint = endpoint === 'p1' ? pipe.p1 : pipe.p2;
    const connections = getNodeConnections(interactionManager.manager.pipes, draggedPoint, pipe);
    interactionManager.endpointParent = connections.parent;
    interactionManager.endpointChildren = connections.children;
}

/**
 * Normal sürüklemeyi başlat
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} obj - Sürüklenecek nesne
 * @param {Object} point - Başlangıç noktası {x, y}
 */
export function startDrag(interactionManager, obj, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = obj;
    interactionManager.dragEndpoint = null;
    interactionManager.dragStart = { ...point };

    // Vana için bağlı boruyu önceden kaydet (performans optimizasyonu)
    if (obj.type === 'vana' && obj.bagliBoruId) {
        interactionManager.dragObjectPipe = interactionManager.manager.pipes.find(p => p.id === obj.bagliBoruId);
        interactionManager.dragObjectsOnPipe = getObjectsOnPipe(interactionManager.manager.components, obj.bagliBoruId);
        console.log('Vana sürükleme başladı - Bağlı boru:', interactionManager.dragObjectPipe?.id);
    } else {
        interactionManager.dragObjectPipe = null;
        interactionManager.dragObjectsOnPipe = null;
    }
}

/**
 * Boru body sürüklemeyi başlat (sadece x veya y yönünde)
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} pipe - Boru nesnesi
 * @param {Object} point - Başlangıç noktası {x, y}
 */
export function startBodyDrag(interactionManager, pipe, point) {
    interactionManager.isDragging = true;
    interactionManager.dragObject = pipe;
    interactionManager.dragEndpoint = null;
    interactionManager.dragStart = { ...point };
    interactionManager.isBodyDrag = true; // Body drag flag
    // Başlangıç noktalarını kaydet
    interactionManager.bodyDragInitialP1 = { ...pipe.p1 };
    interactionManager.bodyDragInitialP2 = { ...pipe.p2 };

    // P1 noktası için parent ve children'ları bul
    const p1Connections = getNodeConnections(interactionManager.manager.pipes, pipe.p1, pipe);
    interactionManager.p1Parent = p1Connections.parent;
    interactionManager.p1Children = p1Connections.children;

    // P2 noktası için parent ve children'ları bul
    const p2Connections = getNodeConnections(interactionManager.manager.pipes, pipe.p2, pipe);
    interactionManager.p2Parent = p2Connections.parent;
    interactionManager.p2Children = p2Connections.children;

    // ⚠️ DOĞRUSALLIK KONTROLÜ: Sadece 3 boru aynı doğrultudaysa ara boru modu
    interactionManager.useBridgeMode = false; // Varsayılan: normal mod

    if (interactionManager.p1Parent && interactionManager.p2Children.length === 1) {
        // 3 boru var: A - B - C
        // A.p1 - A.p2(=B.p1) - B.p2(=C.p1) - C.p2 (4 nokta)
        const pipeA = interactionManager.p1Parent.pipe;
        const pipeC = interactionManager.p2Children[0].pipe;

        const p1 = pipeA.p1;
        const p2 = pipeA.p2; // = pipe.p1
        const p3 = pipe.p2; // = pipeC.p1
        const p4 = pipeC.p2;

        // İlk ve son vektörleri hesapla
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y }; // A borusu
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y }; // B borusu (sürüklenen)
        const v3 = { x: p4.x - p3.x, y: p4.y - p3.y }; // C borusu

        // Normalize edilmiş yönler
        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        const len3 = Math.hypot(v3.x, v3.y);

        if (len1 > 0.1 && len2 > 0.1 && len3 > 0.1) {
            const dir1 = { x: v1.x / len1, y: v1.y / len1 };
            const dir2 = { x: v2.x / len2, y: v2.y / len2 };
            const dir3 = { x: v3.x / len3, y: v3.y / len3 };

            // Dot product kontrolü (paralel mi?)
            const dot12 = dir1.x * dir2.x + dir1.y * dir2.y;
            const dot23 = dir2.x * dir3.x + dir2.y * dir3.y;

            // Aynı yönde mi? (dot product ~1)
            const ANGLE_TOLERANCE = 0.94; // ~20 derece tolerans (daha esnek)
            const isColinear = Math.abs(dot12) > ANGLE_TOLERANCE &&
                Math.abs(dot23) > ANGLE_TOLERANCE &&
                Math.sign(dot12) === Math.sign(dot23);

            interactionManager.useBridgeMode = isColinear;
        }
    }

    // Borunun açısını hesapla ve drag axis'i belirle (duvar mantığı)
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    let dragAxis = null;
    if (Math.abs(angle - 45) < 1) {
        dragAxis = null; // 45 derece ise serbest
    } else if (angle < 45) {
        dragAxis = 'y'; // Yatay boru, sadece Y yönünde taşı
    } else {
        dragAxis = 'x'; // Dikey boru, sadece X yönünde taşı
    }
    interactionManager.dragAxis = dragAxis;
}

/**
 * Sürükleme işlemini gerçekleştir
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} point - Güncel mouse pozisyonu {x, y}
 */
export function handleDrag(interactionManager, point) {
    if (!interactionManager.dragObject) return;

    // Uç nokta sürükleme
    if (interactionManager.dragEndpoint && interactionManager.dragObject.type === 'boru') {
        const pipe = interactionManager.dragObject;

        // Servis kutusuna veya sayaca bağlı uç taşınamaz - ekstra güvenlik kontrolü
        const ucBaglanti = interactionManager.dragEndpoint === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
        if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU || ucBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
            return; // Taşıma işlemini engelle
        }

        const oldPoint = interactionManager.dragEndpoint === 'p1' ? { ...pipe.p1 } : { ...pipe.p2 };

        // DUVAR SNAP SİSTEMİ - Boru açıklığı ile
        const SNAP_DISTANCE = 15; // İlk yakalama mesafesi (cm)
        const SNAP_RELEASE_DISTANCE = 40; // Snap'ten çıkma mesafesi (cm)
        const BORU_CLEARANCE = 5; // Boru-duvar arası minimum mesafe (cm)
        const MAX_WALL_DISTANCE = 20; // 1 metre - bu mesafeden uzak snap noktalarını göz ardı et
        const walls = state.walls || [];
        let finalPos = { x: point.x, y: point.y };


        // Her zaman yeni snap ara (sürekli snap)
        // Maksimum snap mesafesi 1 metre (100 cm)
        let bestSnapX = { diff: MAX_WALL_DISTANCE, value: null };
        let bestSnapY = { diff: MAX_WALL_DISTANCE, value: null };

        // Tüm duvar yüzeylerine snap kontrolü - Boru clearance ekleyerek
        // ÖNCE: Sadece yakındaki ve aynı kattaki duvarları filtrele
        const pipeFloorId = pipe.floorId; // Borunun bulunduğu kat

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;

            // Sadece aynı kattaki duvarları kontrol et
            if (pipeFloorId && wall.floorId && wall.floorId !== pipeFloorId) {
                return; // Farklı kattaki duvarı atla
            }

            // Duvara olan minimum mesafeyi hesapla (nokta-çizgi mesafesi)
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const lengthSq = dx * dx + dy * dy;
            let wallDistance;

            if (lengthSq === 0) {
                // Duvar bir nokta (dejenere durum)
                wallDistance = Math.hypot(finalPos.x - wall.p1.x, finalPos.y - wall.p1.y);
            } else {
                // Nokta-çizgi mesafesi hesabı
                const t = Math.max(0, Math.min(1, ((finalPos.x - wall.p1.x) * dx + (finalPos.y - wall.p1.y) * dy) / lengthSq));
                const projX = wall.p1.x + t * dx;
                const projY = wall.p1.y + t * dy;
                wallDistance = Math.hypot(finalPos.x - projX, finalPos.y - projY);
            }


            const wallThickness = wall.thickness || state.wallThickness || 20;
            const halfThickness = wallThickness / 2;

            // Snap noktası duvar yüzeyinden offset olduğu için tolerans ekle
            const maxOffset = halfThickness + BORU_CLEARANCE;
            if (wallDistance > MAX_WALL_DISTANCE + maxOffset) return;

            const dxW = wall.p2.x - wall.p1.x;
            const dyW = wall.p2.y - wall.p1.y;
            const isVertical = Math.abs(dxW) < 0.1;
            const isHorizontal = Math.abs(dyW) < 0.1;

            if (isVertical) {
                const wallX = wall.p1.x;
                // Boru duvar yüzeyinden CLEARANCE kadar uzakta olmalı
                const snapXPositions = [
                    wallX - halfThickness - BORU_CLEARANCE,  // Sol yüzeyden clearance kadar uzak
                    wallX + halfThickness + BORU_CLEARANCE   // Sağ yüzeyden clearance kadar uzak
                ];
                for (const snapX of snapXPositions) {
                    const diff = Math.abs(finalPos.x - snapX);
                    if (diff < bestSnapX.diff) {
                        bestSnapX = { diff, value: snapX };
                    }
                }
            } else if (isHorizontal) {
                const wallY = wall.p1.y;
                // Boru duvar yüzeyinden CLEARANCE kadar uzakta olmalı
                const snapYPositions = [
                    wallY - halfThickness - BORU_CLEARANCE,  // Üst yüzeyden clearance kadar uzak
                    wallY + halfThickness + BORU_CLEARANCE   // Alt yüzeyden clearance kadar uzak
                ];
                for (const snapY of snapYPositions) {
                    const diff = Math.abs(finalPos.y - snapY);
                    if (diff < bestSnapY.diff) {
                        bestSnapY = { diff, value: snapY };
                    }
                }
            }
        });

        // Snap bulunduysa uygula
        if (bestSnapX.value !== null || bestSnapY.value !== null) {
            // Snap lock'u güncelle
            interactionManager.pipeEndpointSnapLock = {
                x: bestSnapX.value,
                y: bestSnapY.value
            };
            interactionManager.pipeSnapMouseStart = { x: point.x, y: point.y };

            if (bestSnapX.value !== null) finalPos.x = bestSnapX.value;
            if (bestSnapY.value !== null) finalPos.y = bestSnapY.value;
        } else {
            // Snap bulunamadıysa lock'u temizle
            interactionManager.pipeEndpointSnapLock = null;
            interactionManager.pipeSnapMouseStart = null;
        }

        // BAĞLI BORULARIN DİĞER UÇLARINA VE AYNI BORUNUN DİĞER UCUNA SNAP
        // ÖNCELİKLE: Bağlı boruları tespit et (occupation check için de kullanılacak)
        const connectionTolerance = 1; // Bağlantı tespit toleransı
        const connectedPipes = interactionManager.manager.pipes.filter(p => {
            if (p === pipe) return false;
            // p1'e veya p2'ye bağlı mı kontrol et
            const distToP1 = Math.hypot(p.p1.x - oldPoint.x, p.p1.y - oldPoint.y);
            const distToP2 = Math.hypot(p.p2.x - oldPoint.x, p.p2.y - oldPoint.y);
            return distToP1 < connectionTolerance || distToP2 < connectionTolerance;
        });

        // SNAP SİSTEMİ: X-Y hizalaması için snap (üst üste bindirmek değil!)
        const PIPE_ENDPOINT_SNAP_DISTANCE = 10; // cm
        let pipeSnapX = null;
        let pipeSnapY = null;
        let minPipeSnapDistX = PIPE_ENDPOINT_SNAP_DISTANCE;
        let minPipeSnapDistY = PIPE_ENDPOINT_SNAP_DISTANCE;

        // 1) Aynı borunun DİĞER ucunun X ve Y koordinatlarına snap
        const ownOtherEndpoint = interactionManager.dragEndpoint === 'p1' ? pipe.p2 : pipe.p1;

        // X hizasına snap
        const ownXDiff = Math.abs(finalPos.x - ownOtherEndpoint.x);
        if (ownXDiff < minPipeSnapDistX) {
            minPipeSnapDistX = ownXDiff;
            pipeSnapX = ownOtherEndpoint.x;
        }

        // Y hizasına snap
        const ownYDiff = Math.abs(finalPos.y - ownOtherEndpoint.y);
        if (ownYDiff < minPipeSnapDistY) {
            minPipeSnapDistY = ownYDiff;
            pipeSnapY = ownOtherEndpoint.y;
        }

        // 2) Bağlı boruların DİĞER uçlarına snap (X-Y hizalaması için)
        connectedPipes.forEach(connectedPipe => {
            // Bağlı borunun DİĞER ucunu bul
            const distToP1 = Math.hypot(connectedPipe.p1.x - oldPoint.x, connectedPipe.p1.y - oldPoint.y);
            const distToP2 = Math.hypot(connectedPipe.p2.x - oldPoint.x, connectedPipe.p2.y - oldPoint.y);

            // Hangi uç bağlı değilse o ucu al
            const otherEndpoint = distToP1 < connectionTolerance ? connectedPipe.p2 : connectedPipe.p1;

            // X hizasına snap kontrolü
            const xDiff = Math.abs(finalPos.x - otherEndpoint.x);
            if (xDiff < minPipeSnapDistX) {
                minPipeSnapDistX = xDiff;
                pipeSnapX = otherEndpoint.x;
            }

            // Y hizasına snap kontrolü
            const yDiff = Math.abs(finalPos.y - otherEndpoint.y);
            if (yDiff < minPipeSnapDistY) {
                minPipeSnapDistY = yDiff;
                pipeSnapY = otherEndpoint.y;
            }
        });

        // Boru uç snap'i uygula (duvar snap'inden sonra)
        if (pipeSnapX !== null || pipeSnapY !== null) {
            if (pipeSnapX !== null) finalPos.x = pipeSnapX;
            if (pipeSnapY !== null) finalPos.y = pipeSnapY;
        }

        // NOKTA TAŞIMA KISITLAMASI: Hedef noktada başka bir boru ucu var mı kontrol et
        // Bağlı borular hariç (zaten bağlı oldukları için aynı noktada olabilirler)
        const POINT_OCCUPATION_TOLERANCE = 1.5; // cm - sadece gerçek çakışmaları engelle
        const ELBOW_TOLERANCE = 8; // cm - dirsekler (köşe noktaları) arası minimum mesafe
        const elbowConnectionTolerance = 1;

        // Eski pozisyonu al (sürüklenen ucun şu anki pozisyonu)
        //const oldPoint = this.dragEndpoint === 'p1' ? pipe.p1 : pipe.p2;

        // Basit yaklaşım: Her boru ucunu kontrol et
        let occupiedByOtherPipe = false;
        for (const otherPipe of interactionManager.manager.pipes) {
            if (otherPipe === pipe) continue;
            if (connectedPipes.includes(otherPipe)) continue;

            // Her iki ucunu kontrol et
            for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                // Eğer bu uç bizim eski bağlantımızsa atla
                const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                if (distToOld < elbowConnectionTolerance) continue;

                const dist = Math.hypot(endpoint.x - finalPos.x, endpoint.y - finalPos.y);

                // Bu uç bir dirsek mi?
                const isElbow = interactionManager.manager.pipes.some(p => {
                    if (p === otherPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < elbowConnectionTolerance || d2 < elbowConnectionTolerance;
                });

                const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;
                if (dist < tolerance) {
                    occupiedByOtherPipe = true;
                    break;
                }
            }
            if (occupiedByOtherPipe) break;
        }

        // Boru üzerindeki vanaları bul
        const valvesOnPipe = interactionManager.manager.components.filter(comp =>
            comp.type === 'vana' && comp.bagliBoruId === pipe.id
        );

        // Minimum uzunluk kontrolü (vanaları dikkate al)
        const MIN_EDGE_DISTANCE = 4; // cm - boru uçlarından minimum mesafe
        const OBJECT_MARGIN = 2; // cm - nesne marginleri
        const VALVE_WIDTH = 6; // cm

        // Her vana için gereken minimum mesafe
        const spacePerValve = OBJECT_MARGIN + VALVE_WIDTH + OBJECT_MARGIN; // 10 cm
        const totalValveSpace = valvesOnPipe.length * spacePerValve;

        // Minimum boru uzunluğu = 2 * uç mesafesi + tüm vanaların gerektirdiği alan
        const minLength = (2 * MIN_EDGE_DISTANCE) + totalValveSpace;

        // Yeni uzunluğu hesapla
        let newLength;
        if (interactionManager.dragEndpoint === 'p1') {
            newLength = Math.hypot(finalPos.x - pipe.p2.x, finalPos.y - pipe.p2.y);
        } else {
            newLength = Math.hypot(pipe.p1.x - finalPos.x, pipe.p1.y - finalPos.y);
        }

        // Eğer nokta dolu değilse VE minimum uzunluk sağlanıyorsa pozisyonu uygula
        if (!occupiedByOtherPipe && newLength >= minLength) {
            const oldLength = pipe.uzunluk;

            if (interactionManager.dragEndpoint === 'p1') {
                pipe.p1.x = finalPos.x;
                pipe.p1.y = finalPos.y;
            } else {
                pipe.p2.x = finalPos.x;
                pipe.p2.y = finalPos.y;
            }

            // Boru uzunluğu değişti - vana pozisyonlarını güncelle
            // ✨ Vanalar HER ZAMAN p2 (ileri uç) ucundan sabit mesafede kalmalı
            valvesOnPipe.forEach(valve => {
                // P2'den sabit mesafe hesapla
                const distanceFromP2 = (1 - valve.boruPozisyonu) * oldLength;
                valve.boruPozisyonu = 1 - (distanceFromP2 / pipe.uzunluk);
                valve.fromEnd = 'p2';
                valve.fixedDistance = distanceFromP2;

                // Pozisyonu güncelle
                valve.updatePositionFromPipe(pipe);
            });

            // Fleks artık otomatik olarak boru ucundan koordinat alıyor
            // Ekstra güncelleme gerekmiyor

            // Bağlı boruları güncelle - Parent ve Children'ları güncelle
            if (interactionManager.endpointParent) {
                const parentPipe = interactionManager.endpointParent.pipe;
                const parentEndpoint = interactionManager.endpointParent.endpoint;
                parentPipe[parentEndpoint].x = finalPos.x;
                parentPipe[parentEndpoint].y = finalPos.y;
            }
            interactionManager.endpointChildren.forEach(child => {
                child.pipe[child.endpoint].x = finalPos.x;
                child.pipe[child.endpoint].y = finalPos.y;
            });
        } else {
            // Nokta doluysa veya minimum uzunluk sağlanmıyorsa eski pozisyonda kalır (sessizce engelle)
        }
        return;
    }

    // Vana için boru üzerinde kayma (PERFORMANS OPTİMİZASYONU)
    if (interactionManager.dragObject.type === 'vana') {
        const vana = interactionManager.dragObject;

        // Başlangıçta kaydedilmiş boruyu kullan (her frame tüm boruları taramak yerine)
        let targetPipe = interactionManager.dragObjectPipe;
        let objectsOnPipe = interactionManager.dragObjectsOnPipe;

        // Boru yoksa veya geçersizse hareket etme
        if (!targetPipe) {
            // console.log('Vana sürüklerken boru bulunamadı - hareket engellendi');
            return;
        }

        // Vana'yı boru üzerinde kaydır (margin kontrolü ile)
        const success = vana.moveAlongPipe(targetPipe, point, objectsOnPipe);

        if (!success) {
            //console.log('Vana boru üzerinde kaydırılamadı - yetersiz mesafe veya sınır dışı');
        }

        return;
    }

    // Servis kutusu için duvara snap
    if (interactionManager.dragObject.type === 'servis_kutusu') {
        const walls = state.walls;

        // Snap mesafesi - sabit
        const snapDistance = 30; // 30cm

        // En yakın duvarı bul - MOUSE POZİSYONUNA GÖRE
        let closestWall = null;
        let minDist = Infinity;

        // Mouse pozisyonunu kullan (kutu pozisyonu değil!)
        const mousePos = point;

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;

            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return;

            // Mouse'u duvara projeksiyon yap
            const t = Math.max(0, Math.min(1,
                ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (len * len)
            ));
            const projX = wall.p1.x + t * dx;
            const projY = wall.p1.y + t * dy;

            const dist = Math.hypot(mousePos.x - projX, mousePos.y - projY);

            if (dist < minDist) {
                minDist = dist;
                closestWall = wall;
            }
        });

        // Yakın duvara snap yap, yoksa serbest yerleştir
        // useBoxPosition=false ile mouse pozisyonuna göre snap yap (sürüklerken)
        if (closestWall && minDist < snapDistance) {
            interactionManager.dragObject.snapToWall(closestWall, point, false);
        } else {
            interactionManager.dragObject.placeFree(point);
        }

        // Bağlı boru zincirini güncelle
        if (interactionManager.dragObject.bagliBoruId) {
            const boru = interactionManager.manager.pipes.find(p => p.id === interactionManager.dragObject.bagliBoruId);
            if (boru) {
                // Kutu hareket etmeden ÖNCEKİ çıkış noktası
                const oldP1 = { ...boru.p1 };

                // Kutu hareket ettikten SONRAKİ çıkış noktası
                const newCikis = interactionManager.dragObject.getCikisNoktasi();

                // Tüm zinciri güncelle - updateNodeConnections boru.p1'i de güncelleyecek
                updateNodeConnections(interactionManager.manager.pipes, oldP1, newCikis);
            }
        }
        return;
    }

    // Cihaz taşıma (KOMBI, OCAK, vb.)
    if (interactionManager.dragObject.type === 'cihaz') {
        // Cihazı yeni pozisyona taşı
        interactionManager.dragObject.move(point.x, point.y);
        // Fleks otomatik güncellenir (move metodu içinde)
        return;
    }

    // Sayaç taşıma - vana + fleks bağlantı noktası + sayaç birlikte taşınır
    if (interactionManager.dragObject.type === 'sayac') {
        const sayac = interactionManager.dragObject;

        // İlk drag frame'inde sayacın başlangıç pozisyonunu kaydet
        if (!interactionManager.dragStartObjectPos) {
            interactionManager.dragStartObjectPos = { x: sayac.x, y: sayac.y };
        }

        // Sayacın BAŞLANGIÇ pozisyonu (mouse ile tuttuğum andaki)
        const startX = interactionManager.dragStartObjectPos.x;
        const startY = interactionManager.dragStartObjectPos.y;

        // ✨ AXIS-LOCK with THRESHOLD: 10cm'den fazla sapma olursa serbest bırak

        const AXIS_LOCK_THRESHOLD = 0; // cm
        const totalDx = Math.abs(point.x - startX);
        const totalDy = Math.abs(point.y - startY);
        let newX, newY;
        // Her iki eksenden de 10cm'den fazla sapmışsa → SERBEST HAREKET
        if (totalDx > AXIS_LOCK_THRESHOLD && totalDy > AXIS_LOCK_THRESHOLD) {
            newX = point.x;
            newY = point.y;
        } else if (totalDx > totalDy) {
            // Yatay hareket → X ekseninde kaydır, Y başlangıçta sabit
            newX = point.x;
            newY = startY;
        } else {
            // Dikey hareket → Y ekseninde kaydır, X başlangıçta sabit
            newX = startX;
            newY = point.y;
        }

        // Delta hesapla
        const dx = newX - sayac.x;
        const dy = newY - sayac.y;

        // Sayacı axis-locked pozisyona taşı (SMOOTH!)
        sayac.move(newX, newY);
        // Çıkış borusunu güncelle (GİRİŞ GİBİ DELTA KADAR TAŞI!)
        // Sadece çıkış borusunun p1 ucunu güncelle, p2 ve bağlı borular sabit
        if (sayac.cikisBagliBoruId) {
            const cikisBoru = interactionManager.manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
            if (cikisBoru) {
                // Eski p1 pozisyonunu kaydet
                const oldP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                // Çıkış boru ucunu DELTA kadar taşı (giriş ile aynı mantık)
                cikisBoru.p1.x += dx;
                cikisBoru.p1.y += dy;

                // Yeni p1 pozisyonu
                const newP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                // Parent ve children'ları güncelle (cihazların fleks bağlantıları için kritik!)
                updateNodeConnections(interactionManager.manager.pipes, oldP1, newP1);
            }
        }

        return;
    }

    // Boru gövdesi taşıma - sadece x veya y yönünde (duvar mantığı)
    if (interactionManager.dragObject.type === 'boru' && interactionManager.isBodyDrag) {
        const pipe = interactionManager.dragObject;
        const dx = point.x - interactionManager.dragStart.x;
        const dy = point.y - interactionManager.dragStart.y;

        // Drag axis'e göre hareketi kısıtla (duvar gibi)
        let offsetX = dx;
        let offsetY = dy;

        if (interactionManager.dragAxis === 'x') {
            offsetY = 0; // Sadece X yönünde taşı
        } else if (interactionManager.dragAxis === 'y') {
            offsetX = 0; // Sadece Y yönünde taşı
        }
        // dragAxis === null ise her iki yönde de taşınabilir

        // ŞU ANKİ pozisyonları kaydet (henüz güncellenmeden önce)
        const oldP1 = { x: pipe.p1.x, y: pipe.p1.y };
        const oldP2 = { x: pipe.p2.x, y: pipe.p2.y };

        // Yeni pozisyonları hesapla (henüz uygulamadan)
        const newP1 = {
            x: interactionManager.bodyDragInitialP1.x + offsetX,
            y: interactionManager.bodyDragInitialP1.y + offsetY
        };
        const newP2 = {
            x: interactionManager.bodyDragInitialP2.x + offsetX,
            y: interactionManager.bodyDragInitialP2.y + offsetY
        };

        // NOKTA DOLULUK KONTROLÜ: Yeni pozisyonlarda başka boru uçları var mı?
        const POINT_OCCUPATION_TOLERANCE = 1.5; // cm - sadece gerçek çakışmaları engelle
        const ELBOW_TOLERANCE = 8; // cm - dirsekler (köşe noktaları) arası minimum mesafe
        const connectionTolerance = 1; // Bağlantı tespit toleransı

        // Bağlı borular listesi (bridge mode için)
        const connectedPipes = [];
        if (interactionManager.p1Parent) connectedPipes.push(interactionManager.p1Parent.pipe);
        interactionManager.p1Children.forEach(child => connectedPipes.push(child.pipe));
        if (interactionManager.p2Parent) connectedPipes.push(interactionManager.p2Parent.pipe);
        interactionManager.p2Children.forEach(child => connectedPipes.push(child.pipe));

        // Basit yaklaşım: Her boru ucunu kontrol et, eğer o uç bir dirsekse 4cm, değilse 1.5cm tolerans
        const checkEndpointDistance = (newPos, checkAgainstOldPos = null) => {
            for (const otherPipe of interactionManager.manager.pipes) {
                if (otherPipe === pipe) continue;
                if (connectedPipes.includes(otherPipe)) continue;

                // Her iki ucunu kontrol et
                for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                    // Eğer checkAgainstOldPos verilmişse ve bu noktaya çok yakınsa (kendi eski pozisyonu), atla
                    if (checkAgainstOldPos) {
                        const distToOld = Math.hypot(endpoint.x - checkAgainstOldPos.x, endpoint.y - checkAgainstOldPos.y);
                        if (distToOld < connectionTolerance) continue; // Bu bizim eski bağlantımız
                    }

                    const dist = Math.hypot(endpoint.x - newPos.x, endpoint.y - newPos.y);

                    // Bu uç bir dirsek mi? (başka borulara bağlı mı?)
                    const isElbow = interactionManager.manager.pipes.some(p => {
                        if (p === otherPipe) return false;
                        const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                        const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                        return d1 < connectionTolerance || d2 < connectionTolerance;
                    });

                    const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;
                    if (dist < tolerance) {
                        return true; // Çok yakın
                    }
                }
            }
            return false; // Sorun yok
        };

        // p1 ve p2 kontrolü
        if (checkEndpointDistance(newP1, oldP1) || checkEndpointDistance(newP2, oldP2)) {
            return; // Taşımayı engelle
        }

        // Nokta boşsa pozisyonları uygula
        pipe.p1.x = newP1.x;
        pipe.p1.y = newP1.y;
        pipe.p2.x = newP2.x;
        pipe.p2.y = newP2.y;

        // Mod kontrolü: ARA BORU modu mu NORMAL mod mu?
        if (interactionManager.useBridgeMode) {
            // ✅ ARA BORU MODU: Bağlı boruları TAŞIMA, ara borular oluştur
            // Ghost ara boruları oluştur (preview için)
            interactionManager.ghostBridgePipes = [];
            const MIN_BRIDGE_LENGTH = 5; // 5 cm minimum (kısa hatlar için daha esnek)

            // p1 tarafı için ghost boru
            if (interactionManager.p1Parent) {
                const dist = Math.hypot(pipe.p1.x - interactionManager.bodyDragInitialP1.x, pipe.p1.y - interactionManager.bodyDragInitialP1.y);
                if (dist >= MIN_BRIDGE_LENGTH) {
                    interactionManager.ghostBridgePipes.push({
                        p1: { ...interactionManager.bodyDragInitialP1 },
                        p2: { ...pipe.p1 },
                        type: 'ghost_bridge'
                    });
                }
            }

            // p2 tarafı için ghost boru
            if (interactionManager.p2Children.length > 0) {
                const dist = Math.hypot(pipe.p2.x - interactionManager.bodyDragInitialP2.x, pipe.p2.y - interactionManager.bodyDragInitialP2.y);
                if (dist >= MIN_BRIDGE_LENGTH) {
                    interactionManager.ghostBridgePipes.push({
                        p1: { ...pipe.p2 },
                        p2: { ...interactionManager.bodyDragInitialP2 },
                        type: 'ghost_bridge'
                    });
                }
            }
        } else {
            // ⚠️ NORMAL MOD: Parent ve Children'ları güncelle
            interactionManager.ghostBridgePipes = []; // Ghost yok

            // P1 noktası hareket etti → Parent ve Children'ları güncelle
            if (interactionManager.p1Parent) {
                const parentPipe = interactionManager.p1Parent.pipe;
                const parentEndpoint = interactionManager.p1Parent.endpoint;
                parentPipe[parentEndpoint].x = pipe.p1.x;
                parentPipe[parentEndpoint].y = pipe.p1.y;
            }
            interactionManager.p1Children.forEach(child => {
                child.pipe[child.endpoint].x = pipe.p1.x;
                child.pipe[child.endpoint].y = pipe.p1.y;
            });

            // P2 noktası hareket etti → Parent ve Children'ları güncelle
            if (interactionManager.p2Parent) {
                const parentPipe = interactionManager.p2Parent.pipe;
                const parentEndpoint = interactionManager.p2Parent.endpoint;
                parentPipe[parentEndpoint].x = pipe.p2.x;
                parentPipe[parentEndpoint].y = pipe.p2.y;
            }
            interactionManager.p2Children.forEach(child => {
                child.pipe[child.endpoint].x = pipe.p2.x;
                child.pipe[child.endpoint].y = pipe.p2.y;
            });
        }

        return;
    }

    // Diğer objeler için normal taşıma
    if (interactionManager.dragObject.type !== 'boru') {
        const result = interactionManager.dragObject.move(point.x, point.y);
        interactionManager.updateConnectedPipe(result);
    }
}

/**
 * Bağlı boru zincirini günceller - sadece taşınan noktaları güncelle
 * @param {Object} interactionManager - InteractionManager instance
 * @param {Object} oldPoint - Eski nokta pozisyonu {x, y}
 * @param {Object} newPoint - Yeni nokta pozisyonu {x, y}
 */
export function updateConnectedPipesChain(interactionManager, oldPoint, newPoint) {
    const tolerance = 0.5; // cm - floating point hataları için yeterince büyük

    // Basit iterative güncelleme - tüm boruları tek geçişte güncelle
    interactionManager.manager.pipes.forEach(pipe => {
        // p1'i güncelle
        const distP1 = Math.hypot(pipe.p1.x - oldPoint.x, pipe.p1.y - oldPoint.y);
        if (distP1 < tolerance) {
            pipe.p1.x = newPoint.x;
            pipe.p1.y = newPoint.y;
        }

        // p2'yi güncelle
        const distP2 = Math.hypot(pipe.p2.x - oldPoint.x, pipe.p2.y - oldPoint.y);
        if (distP2 < tolerance) {
            pipe.p2.x = newPoint.x;
            pipe.p2.y = newPoint.y;
        }
    });

    // Fleks artık boruId ve endpoint ('p1'/'p2') saklıyor
    // Koordinatlar her zaman borudan okunuyor, ekstra güncelleme gerekmiyor
}

/**
 * Sürüklemeyi sonlandır
 * @param {Object} interactionManager - InteractionManager instance
 */
export function endDrag(interactionManager) {
    // Body drag bittiğinde ara borular oluştur
    if (interactionManager.isBodyDrag && interactionManager.dragObject && interactionManager.dragObject.type === 'boru') {
        const draggedPipe = interactionManager.dragObject;
        const oldP1 = interactionManager.bodyDragInitialP1;
        const oldP2 = interactionManager.bodyDragInitialP2;
        const newP1 = draggedPipe.p1;
        const newP2 = draggedPipe.p2;

        // ⚠️ Sadece BRIDGE MODE ise ara borular oluştur
        if (!interactionManager.useBridgeMode) {
            // Normal modda zaten updateConnectedPipesChain çağrıldı
            // Hiçbir şey yapma
        } else {
            // Minimum mesafe kontrolü (ara boru oluşturmaya değer mi?)
            const MIN_BRIDGE_LENGTH = 5; // 5 cm minimum (kısa hatlar için daha esnek)

            // Başlangıçta tespit edilen bağlantıları kullan
            const connectedAtP1 = interactionManager.p1Parent;
            const connectedAtP2 = interactionManager.p2Children.length > 0 ? interactionManager.p2Children[0] : null;

            // p1 tarafına ara boru ekle
            if (connectedAtP1) {
                const distP1 = Math.hypot(newP1.x - oldP1.x, newP1.y - oldP1.y);
                if (distP1 >= MIN_BRIDGE_LENGTH) {
                    const bridgePipe1 = new Boru(
                        { x: oldP1.x, y: oldP1.y, z: oldP1.z || 0 },
                        { x: newP1.x, y: newP1.y, z: newP1.z || 0 },
                        draggedPipe.boruTipi
                    );
                    bridgePipe1.floorId = draggedPipe.floorId;

                    // ✨ DÜZELTME: Rengi kopyala (TURQUAZ ise TURQUAZ kalsın)
                    bridgePipe1.colorGroup = draggedPipe.colorGroup;

                    interactionManager.manager.pipes.push(bridgePipe1);
                }
            }

            // p2 tarafına ara boru ekle
            if (connectedAtP2) {
                const distP2 = Math.hypot(newP2.x - oldP2.x, newP2.y - oldP2.y);
                if (distP2 >= MIN_BRIDGE_LENGTH) {
                    const bridgePipe2 = new Boru(
                        { x: newP2.x, y: newP2.y, z: newP2.z || 0 },
                        { x: oldP2.x, y: oldP2.y, z: oldP2.z || 0 },
                        draggedPipe.boruTipi
                    );
                    bridgePipe2.floorId = draggedPipe.floorId;

                    // ✨ DÜZELTME: Rengi kopyala (TURQUAZ ise TURQUAZ kalsın)
                    bridgePipe2.colorGroup = draggedPipe.colorGroup;

                    interactionManager.manager.pipes.push(bridgePipe2);
                }
            }
        } // useBridgeMode if bloğu kapanışı
    }

    interactionManager.isDragging = false;
    interactionManager.dragObject = null;
    interactionManager.dragEndpoint = null;
    interactionManager.dragStart = null;
    interactionManager.dragStartObjectPos = null;
    interactionManager.isBodyDrag = false;
    interactionManager.bodyDragInitialP1 = null;
    interactionManager.bodyDragInitialP2 = null;
    interactionManager.dragAxis = null;

    // Parent-children referanslarını temizle
    interactionManager.p1Parent = null;
    interactionManager.p1Children = [];
    interactionManager.p2Parent = null;
    interactionManager.p2Children = [];
    interactionManager.endpointParent = null;
    interactionManager.endpointChildren = [];

    interactionManager.ghostBridgePipes = [];
    interactionManager.pipeEndpointSnapLock = null;
    interactionManager.pipeSnapMouseStart = null;
    interactionManager.manager.saveToState();
    saveState(); // Save to undo history
}
