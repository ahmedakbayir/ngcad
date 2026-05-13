/**
 * Finder and Helper Methods
 * Boru ve bileşen bulma yardımcı fonksiyonları
 */

import { BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { saveState } from '../../general-files/history.js';
import { setState, state } from '../../general-files/main.js';
import { TESISAT_CONSTANTS } from './tesisat-snap.js';

/**
 * 3D Görünüm için Ekran Koordinatı Hesaplayıcı
 * Renderer'daki mantığın aynısını kullanır: (x+z*t, y-z*t)
 */
function getScreenPoint(point) {
    if (!state.is3DPerspectiveActive) return { x: point.x, y: point.y };
    // Z değeri yoksa 0 kabul et
    const z = point.z || 0;
    const t = state.viewBlendFactor || 0;
    return {
        x: point.x + (z * t),
        y: point.y - (z * t)
    };
}

/**
 * Piksel toleransını world coordinates'e çevirir (zoom-aware)
 * @param {number} pixelTolerance - Piksel cinsinden tolerance
 * @returns {number} - World coordinates cinsinden tolerance (cm)
 */
export function pixelsToWorld(pixelTolerance) {
    const zoom = state.zoom || 1.0;
    return pixelTolerance / zoom;
}

/**
 * Bir noktada nesne bul (bileşen veya boru)
 * Öncelik sırası: 1) Bileşenler (3D Destekli), 2) Borular
 */
export function findObjectAt(manager, point) {
    const t = state.viewBlendFactor || 0;
    const is3D = t >= 0.5;
    const currentFloorId = state.currentFloor?.id || null;
    const currentFloor = state.currentFloor || null;
    const sameFloor = (o) => is3D || !currentFloorId || !o.floorId || o.floorId === currentFloorId;
    const pipeVisibleOnFloor = (pipe) => {
        if (is3D) return true;
        if (!currentFloorId || !pipe.floorId || pipe.floorId === currentFloorId) return true;
        if (!currentFloor) return true;
        const z1 = pipe.p1?.z || 0, z2 = pipe.p2?.z || 0;
        const zMin = Math.min(z1, z2), zMax = Math.max(z1, z2);
        return zMax > currentFloor.bottomElevation && zMin < currentFloor.topElevation;
    };

    // 2D / hafif blend (t<=0.1): eski tip-öncelikli davranış (komponent → boru, ilk bulunan döner)
    if (t <= 0.1) {
        for (const comp of manager.components) {
            if (!sameFloor(comp)) continue;
            if (comp.containsPoint && comp.containsPoint(point)) return comp;
        }
        const worldToleranceLegacy = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
        for (const pipe of manager.pipes) {
            if (!pipeVisibleOnFloor(pipe)) continue;
            const p1Screen = getScreenPoint(pipe.p1);
            const p2Screen = getScreenPoint(pipe.p2);
            const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
            const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);
            if (distP1 < worldToleranceLegacy || distP2 < worldToleranceLegacy) return pipe;
            const dx = p2Screen.x - p1Screen.x;
            const dy = p2Screen.y - p1Screen.y;
            const length = Math.hypot(dx, dy);
            if (length > 0.1) {
                const u = ((point.x - p1Screen.x) * dx + (point.y - p1Screen.y) * dy) / (length * length);
                if (u >= 0 && u <= 1) {
                    const projX = p1Screen.x + u * dx;
                    const projY = p1Screen.y + u * dy;
                    const d = Math.hypot(point.x - projX, point.y - projY);
                    if (d < worldToleranceLegacy) return pipe;
                }
            }
        }
        return null;
    }

    // 3D / blend modu: tüm adayları (komponentler + borular) topla, fareye en yakın
    // (yani ekrana en yakın çizilmiş) olanı seç. Mesafe = world-space (cm) tolerans
    // bandı içindeki en küçük mesafe; eşitlikte sahnede daha "öne" çizilen tercih
    // edilir (yüksek z-tabanlı komponent → yüksek z taşıyan boru). Fare doğrudan
    // ne üzerindeyse o seçilir.

    const candidates = [];
    const worldTolerance = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);

    // --- Komponentler ---
    for (const comp of manager.components) {
        if (!sameFloor(comp)) continue;
        const zBase = comp.z || 0;

        // Tıklama alanı, gerçek görünür gövdenin boyutuna mümkün olduğunca yakın olsun.
        // Sayaç: 22×24 cm (flat), Cihaz: comp.config.width/height, Servis Kutusu: ~50×30,
        // Vana: küçük. Önceki sürüm sayaç için 70×70 cm + 10 cm margin kullanıyordu;
        // bu, gövdenin çok dışında tıklamayla seçim yapılmasına yol açıyordu.
        let halfW, halfH, zHeight;
        if (comp.type === 'sayac') {
            const cfg = comp.config || {};
            halfW = (cfg.width  || 22) / 2 + 2;  // ~13 cm yarıçap
            halfH = (cfg.height || 24) / 2 + 2;  // ~14 cm yarıçap
            zHeight = 0;                          // gövde flat çiziliyor
        } else if (comp.type === 'cihaz') {
            const cfg = comp.config || {};
            halfW = (cfg.width  || 30) / 2 + 3;
            halfH = (cfg.height || 30) / 2 + 3;
            zHeight = cfg.height || 72;
        } else if (comp.type === 'servis_kutusu') {
            halfW = 25; halfH = 25; zHeight = 35;
        } else {
            // vana ve diğerleri
            halfW = 8; halfH = 8; zHeight = 15;
        }

        // Rotasyonu kabaca dahil et: dönmüş eksen-hizalı kutu yerine rotated bbox'un
        // eksen-hizalı kabuğunu kullan (basit ama güvenli).
        const rad = ((comp.rotation || 0) * Math.PI) / 180;
        const aw = Math.abs(halfW * Math.cos(rad)) + Math.abs(halfH * Math.sin(rad));
        const ah = Math.abs(halfW * Math.sin(rad)) + Math.abs(halfH * Math.cos(rad));

        const minX = comp.x - aw, maxX = comp.x + aw;
        const minY = comp.y - ah, maxY = comp.y + ah;

        const shiftX_bot = zBase * t;
        const shiftY_bot = -(zBase * t);
        const shiftX_top = (zBase + zHeight) * t;
        const shiftY_top = -(zBase + zHeight) * t;

        const vMinX = Math.min(minX + shiftX_bot, minX + shiftX_top);
        const vMaxX = Math.max(maxX + shiftX_bot, maxX + shiftX_top);
        const vMinY = Math.min(minY + shiftY_bot, minY + shiftY_top);
        const vMaxY = Math.max(maxY + shiftY_bot, maxY + shiftY_top);

        // Hit testi: sadece görünür kutunun KENDİ İÇİNDE — fazladan margin yok.
        const inside = point.x >= vMinX && point.x <= vMaxX &&
                       point.y >= vMinY && point.y <= vMaxY;
        if (!inside) continue;

        // Adayın "merkez" ekran konumuna mesafesi (kutu içi tıklamalar için 0'a yakın)
        const cx = (vMinX + vMaxX) / 2;
        const cy = (vMinY + vMaxY) / 2;
        const dx = Math.max(0, Math.max(vMinX - point.x, point.x - vMaxX));
        const dy = Math.max(0, Math.max(vMinY - point.y, point.y - vMaxY));
        const distEdge = Math.hypot(dx, dy);
        const distCenter = Math.hypot(cx - point.x, cy - point.y);

        // Önde olma puanı: yükseklik (zBase + zHeight) ne kadar büyükse o kadar önde sayılır
        const frontScore = zBase + zHeight;

        candidates.push({
            obj: comp,
            kind: 'component',
            distEdge,
            distCenter,
            frontScore
        });
    }

    // --- Borular ---
    for (const pipe of manager.pipes) {
        if (!pipeVisibleOnFloor(pipe)) continue;
        const p1Screen = getScreenPoint(pipe.p1);
        const p2Screen = getScreenPoint(pipe.p2);

        const dx = p2Screen.x - p1Screen.x;
        const dy = p2Screen.y - p1Screen.y;
        const lenSq = dx * dx + dy * dy;

        let distEdge;
        let uClamp = 0.5;
        if (lenSq < 0.0001) {
            // Pür düşey görünen boru: tek noktaya mesafe
            distEdge = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        } else {
            let u = ((point.x - p1Screen.x) * dx + (point.y - p1Screen.y) * dy) / lenSq;
            if (u < 0) u = 0;
            if (u > 1) u = 1;
            uClamp = u;
            const projX = p1Screen.x + u * dx;
            const projY = p1Screen.y + u * dy;
            distEdge = Math.hypot(point.x - projX, point.y - projY);
        }

        if (distEdge >= worldTolerance) continue;

        // Tıklanan noktadaki dünya z'si — borunun hangi seviyede olduğu (önde-arkada)
        const zAtClick = (pipe.p1.z || 0) + uClamp * ((pipe.p2.z || 0) - (pipe.p1.z || 0));

        candidates.push({
            obj: pipe,
            kind: 'pipe',
            distEdge,
            distCenter: distEdge,
            frontScore: zAtClick
        });
    }

    if (candidates.length === 0) return null;

    // Sıralama: önce en yakın (distEdge), eşitlikte en önde (frontScore büyük), eşitlikte
    // tipe göre belirleyici davranış (komponentler boru üstüne çakışıyorsa komponent öncelikli).
    candidates.sort((a, b) => {
        if (a.distEdge !== b.distEdge) return a.distEdge - b.distEdge;
        if (b.frontScore !== a.frontScore) return b.frontScore - a.frontScore;
        if (a.kind !== b.kind) return a.kind === 'component' ? -1 : 1;
        return a.distCenter - b.distCenter;
    });

    return candidates[0].obj;
}

/**
 * Bir noktanın serbest uç olup olmadığını kontrol et
 */
export function isFreeEndpoint(manager, point, tolerance = 5) {
    const currentFloorId = state.currentFloor?.id;
    let pipeCount = 0;
    const pointScreen = getScreenPoint(point);

    for (const boru of manager.pipes) {
        if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
            continue;
        }
        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);
        const distP1 = Math.hypot(pointScreen.x - p1Screen.x, pointScreen.y - p1Screen.y);
        const distP2 = Math.hypot(pointScreen.x - p2Screen.x, pointScreen.y - p2Screen.y);

        if (distP1 < tolerance || distP2 < tolerance) {
            pipeCount++;
        }
        if (pipeCount >= 2) {
            return false;
        }
    }
    return pipeCount === 1;
}

export function hasDeviceAtEndpoint(manager, boruId, endpoint) {
    const currentFloorId = state.currentFloor?.id;
    for (const comp of manager.components) {
        if (comp.type !== 'cihaz') continue;
        if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) continue;
        if (comp.fleksBaglanti && comp.fleksBaglanti.boruId === boruId && comp.fleksBaglanti.endpoint === endpoint) {
            return comp;
        }
    }
    return null;
}

export function hasMeterAtEndpoint(manager, boruId, endpoint) {
    const currentFloorId = state.currentFloor?.id;
    for (const comp of manager.components) {
        if (comp.type !== 'sayac') continue;
        if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) continue;
        if (comp.fleksBaglanti && comp.fleksBaglanti.boruId === boruId && comp.fleksBaglanti.endpoint === endpoint) {
            return comp;
        }
    }
    return null;
}

export function hasAncestorMeter(manager, componentId, componentType) {
    const visited = new Set();
    const MAX_DEPTH = 100;
    let depth = 0;
    let currentId = componentId;
    let currentType = componentType;

    while (currentId && !visited.has(currentId) && depth < MAX_DEPTH) {
        visited.add(currentId);
        depth++;
        if (currentType === BAGLANTI_TIPLERI.SAYAC || currentType === 'sayac') return true;
        if (currentType === BAGLANTI_TIPLERI.SERVIS_KUTUSU || currentType === 'servis_kutusu') return false;
        if (currentType === BAGLANTI_TIPLERI.BORU || currentType === 'boru') {
            const pipe = manager.pipes.find(p => p.id === currentId);
            if (!pipe) break;
            const baglanti = pipe.baslangicBaglanti;
            if (!baglanti || !baglanti.hedefId || !baglanti.tip) break;
            currentId = baglanti.hedefId;
            currentType = baglanti.tip;
        } else {
            break;
        }
    }
    return false;
}

export function findBoruUcuAt(manager, point, tolerance = 5, onlyFreeEndpoints = false, preferredPipeId = null) {
    const currentFloor = state.currentFloor || null;
    const t = state.viewBlendFactor || 0;
    const is3D = t >= 0.5;
    const endpointVisible = (pt) => {
        if (is3D || !currentFloor) return true;
        const z = pt.z || 0;
        return z >= currentFloor.bottomElevation && z < currentFloor.topElevation;
    };

    // İki kategoriye ayır: serbest uçlar (öncelikli) ve dolu uçlar (yedek).
    // onlyFreeEndpoints=true ise dolu uçlar hiç döndürülmez.
    const freeCandidates = [];
    const occupiedCandidates = [];

    const isFreeUc = (boru, uc) => {
        const pt = uc === 'p1' ? boru.p1 : boru.p2;
        return manager.isTrulyFreeEndpoint(pt, 1)
            && !hasDeviceAtEndpoint(manager, boru.id, uc)
            && !hasMeterAtEndpoint(manager, boru.id, uc);
    };

    for (const boru of manager.pipes) {
        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);
        const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

        if (distP1 < tolerance && endpointVisible(boru.p1)) {
            const cand = { boruId: boru.id, nokta: boru.p1, uc: 'p1', boru, dist: distP1 };
            if (isFreeUc(boru, 'p1')) freeCandidates.push(cand);
            else if (!onlyFreeEndpoints) occupiedCandidates.push(cand);
        }
        if (distP2 < tolerance && endpointVisible(boru.p2)) {
            const cand = { boruId: boru.id, nokta: boru.p2, uc: 'p2', boru, dist: distP2 };
            if (isFreeUc(boru, 'p2')) freeCandidates.push(cand);
            else if (!onlyFreeEndpoints) occupiedCandidates.push(cand);
        }
    }

    // ÖNCELİK: serbest uç varsa o havuzdan seç. Yoksa (sadece onlyFreeEndpoints=false ise)
    // dolu uçlardan seç.
    const pool = freeCandidates.length > 0 ? freeCandidates : occupiedCandidates;
    if (pool.length === 0) return null;

    // Tercih edilen boru havuzdaysa onu döndür
    if (preferredPipeId) {
        const pref = pool.find(c => c.boruId === preferredPipeId);
        if (pref) return pref;
    }

    // En yakın adayı döndür
    let nearest = pool[0];
    for (let i = 1; i < pool.length; i++) {
        if (pool[i].dist < nearest.dist) nearest = pool[i];
    }
    return nearest;
}

export function findBoruGovdeAt(manager, point, tolerance = 5) {
    const currentFloor = state.currentFloor || null;
    const t = state.viewBlendFactor || 0;
    const is3D = t >= 0.5;
    // Boru gövdesi aktif katta görünüyor mu (z aralığı kesişiyor mu)
    const pipeVisible = (pipe) => {
        if (is3D || !currentFloor) return true;
        const z1 = pipe.p1?.z || 0, z2 = pipe.p2?.z || 0;
        const zMin = Math.min(z1, z2), zMax = Math.max(z1, z2);
        return zMax > currentFloor.bottomElevation && zMin < currentFloor.topElevation;
    };
    for (const boru of manager.pipes) {
        if (!pipeVisible(boru)) continue;
        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);
        const dx = p2Screen.x - p1Screen.x;
        const dy = p2Screen.y - p1Screen.y;
        const length = Math.hypot(dx, dy);

        if (length > 0.01) {
            // Normal (uzunluğu olan) borular için mesafe kontrolü
            const t = ((point.x - p1Screen.x) * dx + (point.y - p1Screen.y) * dy) / (length * length);
            if (t >= 0 && t <= 1) {
                const projX = p1Screen.x + t * dx;
                const projY = p1Screen.y + t * dy;
                const dist = Math.hypot(point.x - projX, point.y - projY);
                if (dist < tolerance) {
                    const worldX = boru.p1.x + t * (boru.p2.x - boru.p1.x);
                    const worldY = boru.p1.y + t * (boru.p2.y - boru.p1.y);
                    const worldZ = (boru.p1.z || 0) + t * ((boru.p2.z || 0) - (boru.p1.z || 0));
                    return { boruId: boru.id, nokta: { x: worldX, y: worldY, z: worldZ } };
                }
            }
        } else {
            // YENİ: Düşey borular (2D'de nokta/çember gibi görünenler)
            // Uzunluk çok küçükse, doğrudan noktaya olan mesafeye bak
            const dist = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
            if (dist < tolerance) {
                // Tıklanan nokta borunun kendisidir (p1 veya p2 fark etmez)
                return { boruId: boru.id, nokta: { ...boru.p1 } };
            }
        }
    }
    return null;
}

export function findPipeAt(manager, point, tolerance = 2) {
    const result = findBoruGovdeAt(manager, point, tolerance);
    if (result) {
        return manager.findPipeById(result.boruId);
    }
    return null;
}

export function findBilesenCikisAt(manager, point, tolerance = 2) {
    for (const comp of manager.components) {
        if (comp.type === 'servis_kutusu' && comp.getCikisNoktasi && !comp.cikisKullanildi) {
            const cikis = comp.getCikisNoktasi();
            if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
            }
        }
        if (comp.type === 'sayac' && comp.getCikisNoktasi) {
            const cikis = comp.getCikisNoktasi();
            if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
            }
        }
    }
    return null;
}

export function checkVanaAtPoint(manager, point, tolerance = 2) {
    for (const comp of manager.components) {
        if (comp.type === 'vana') {
            if (Math.hypot(point.x - comp.x, point.y - comp.y) < tolerance) {
                return comp;
            }
        }
    }
    return null;
}

export function findPipeEndpoint(pipe, point) {
    const tolerance = 2;
    const p1Screen = getScreenPoint(pipe.p1);
    const p2Screen = getScreenPoint(pipe.p2);
    const distToP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
    const distToP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

    if (distToP1 <= tolerance && distToP1 <= distToP2) return 'p1';
    if (distToP2 <= tolerance) return 'p2';
    return null;
}

/**
 * Nesne sil (Boru silindiğinde BİRLEŞTİRME işlemi yapar)
 */
export function removeObject(manager, obj) {
    let pipeToSelect = null;

    if (obj.type === 'boru') {
        const pipeToDelete = obj;
        const pipeId = pipeToDelete.id;

        // 1. Çocukları bul (Bu borunun BİTİŞİNE bağlı olan tek hat)
        // Eğer birden fazla hat varsa T-junction'dır, birleştirme yapılmaz.
        const children = manager.pipes.filter(p =>
            p.baslangicBaglanti &&
            p.baslangicBaglanti.hedefId === pipeId &&
            p.baslangicBaglanti.tip === BAGLANTI_TIPLERI.BORU
        );

        const childPipe = children.length === 1 ? children[0] : null;

        // 2. Parent bilgisini al (Bu borunun BAŞLANGICINDAKİ kaynak)
        const parentConn = pipeToDelete.baslangicBaglanti;

        // 3. BİRLEŞTİRME (HEAL) MANTIĞI
        // Eğer 1 çocuk ve geçerli bir kaynak varsa
        if (childPipe && parentConn && parentConn.hedefId) {

            // Çocuğun başlangıç noktasını, silinen borunun p1 NODE'una bağla.
            // { ...p1Location } KULLANMA — düz obje _nodeId içermez ve node sharing'i kırar.
            // pipeToDelete.p1, parent boruyla zaten paylaşılan node nesnesidir;
            // childPipe.p1'i aynı nesneye bağlamak bağlantıyı korur.
            const oldChildP1NodeId = childPipe.p1NodeId;
            childPipe.p1 = pipeToDelete.p1;
            childPipe.p1NodeId = pipeToDelete.p1NodeId;
            // Artık kullanılmayan eski node'u temizle
            if (oldChildP1NodeId && oldChildP1NodeId !== pipeToDelete.p1NodeId) {
                manager.nodes.delete(oldChildP1NodeId);
            }

            // Çocuğun bağlantısını güncelle (Silinen borunun parent'ına bağla)
            childPipe.setBaslangicBaglanti(parentConn.tip, parentConn.hedefId, parentConn.noktaIndex);

            // Parent'ın referansını güncelle
            if (parentConn.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                const box = manager.findComponentById(parentConn.hedefId);
                if (box && box.bagliBoruId === pipeId) {
                    box.bagliBoruId = childPipe.id;
                }
            } else if (parentConn.tip === BAGLANTI_TIPLERI.SAYAC) {
                const meter = manager.findComponentById(parentConn.hedefId);
                if (meter && meter.cikisBagliBoruId === pipeId) {
                    meter.cikisBagliBoruId = childPipe.id;
                }
            } else if (parentConn.tip === BAGLANTI_TIPLERI.BORU) {
                const parentPipe = manager.findPipeById(parentConn.hedefId);
                if (parentPipe) {
                    // T-bağlantı listesini güncelle
                    const tIndex = parentPipe.tBaglantilar.findIndex(t => t.boruId === pipeId);
                    if (tIndex !== -1) {
                        parentPipe.tBaglantilar[tIndex].boruId = childPipe.id;
                    }
                    // Bitiş bağlantısıysa güncelle
                    if (parentPipe.bitisBaglanti.hedefId === pipeId) {
                        parentPipe.bitisBaglanti.hedefId = childPipe.id;
                    }
                    // Parent'ı seç (heal durumunda da parent seçilsin)
                    pipeToSelect = parentPipe;
                }
            }

            // Rengi kopyala
            if (pipeToDelete.colorGroup) {
                childPipe.colorGroup = pipeToDelete.colorGroup;
            }

        } else {
            // HEAL YOKSA - Bağlantıları temizle
            children.forEach(child => {
                child.baslangicBaglanti = { tip: null, hedefId: null, noktaIndex: null };
            });

            if (parentConn && parentConn.hedefId) {
                if (parentConn.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                    const box = manager.findComponentById(parentConn.hedefId);
                    if (box && box.bagliBoruId === pipeId) box.bagliBoruId = null;
                } else if (parentConn.tip === BAGLANTI_TIPLERI.SAYAC) {
                    const meter = manager.findComponentById(parentConn.hedefId);
                    if (meter && meter.cikisBagliBoruId === pipeId) meter.cikisBagliBoruId = null;
                } else if (parentConn.tip === BAGLANTI_TIPLERI.BORU) {
                    const parentPipe = manager.findPipeById(parentConn.hedefId);
                    if (parentPipe) {
                        parentPipe.tBaglantiKaldir(pipeId);
                        if (parentPipe.bitisBaglanti.hedefId === pipeId) {
                            parentPipe.bitisBaglanti = { tip: null, hedefId: null, noktaIndex: null };
                        }
                        // Parent boru varsa onu seç (heal yapılmadığında)
                        pipeToSelect = parentPipe;
                    }
                }
            }
        }

        // Bu boru üzerindeki bileşenleri sil (vana + regülatör + fleks)
        const componentsToDelete = manager.components.filter(c =>
            ((c.type === 'vana' || c.type === 'regulator') && c.bagliBoruId === pipeId) ||
            (c.fleksBaglanti && c.fleksBaglanti.boruId === pipeId)
        );
        componentsToDelete.forEach(c => {
            // YENİ EKLENEN KISIM: Boru silinirken cihaz siliniyorsa, bacasını ve vanasını da temizle
            if (c.type === 'cihaz') {
                // Bacasını bul ve sil
                const bacalar = manager.components.filter(b => b.type === 'baca' && b.parentCihazId === c.id);
                bacalar.forEach(baca => {
                    const bacaIdx = manager.components.indexOf(baca);
                    if (bacaIdx !== -1) manager.components.splice(bacaIdx, 1);
                });
                // Cihazın kendi vanasını garanti olarak sil
                if (c.iliskiliVanaId) {
                    const vanaIdx = manager.components.findIndex(v => v.id === c.iliskiliVanaId);
                    if (vanaIdx !== -1) manager.components.splice(vanaIdx, 1);
                }
            }

            const idx = manager.components.indexOf(c);
            if (idx !== -1) manager.components.splice(idx, 1);
        });
        const index = manager.pipes.findIndex(p => p.id === obj.id);
        if (index !== -1) manager.pipes.splice(index, 1);

    } else if (obj.type === 'servis_kutusu') {
        // BFS: kutuya bağlı tüm boru ve bileşenleri topla
        const pipeIds = new Set();
        const sayacIds = new Set();
        const sourceIds = new Set([obj.id]); // başlangıç: kutu id'si

        let changed = true;
        while (changed) {
            changed = false;
            // Başlangıç noktası sourceIds içinde olan boruları topla
            manager.pipes.forEach(pipe => {
                if (pipeIds.has(pipe.id)) return;
                const bag = pipe.baslangicBaglanti;
                if (bag?.hedefId && sourceIds.has(bag.hedefId)) {
                    pipeIds.add(pipe.id);
                    sourceIds.add(pipe.id);
                    changed = true;
                }
            });
            // Bu borulara fleks bağlı sayaçları topla
            manager.components.forEach(c => {
                if (c.type !== 'sayac' || sayacIds.has(c.id)) return;
                if (c.fleksBaglanti?.boruId && pipeIds.has(c.fleksBaglanti.boruId)) {
                    sayacIds.add(c.id);
                    sourceIds.add(c.id); // sayaç çıkışındaki borular da bulunabilsin
                    changed = true;
                }
            });
        }

        // Cihaz ID'lerini topla (bacaları da silebilmek için)
        const cihazIds = new Set(
            manager.components
                .filter(c => c.type === 'cihaz' && c.fleksBaglanti?.boruId && pipeIds.has(c.fleksBaglanti.boruId))
                .map(c => c.id)
        );

        // Bileşenleri geriden silerek temizle
        for (let i = manager.components.length - 1; i >= 0; i--) {
            const c = manager.components[i];
            const remove =
                c.id === obj.id ||                                                   // servis kutusu
                sayacIds.has(c.id) ||                                                // sayaç
                cihazIds.has(c.id) ||                                                // cihaz
                (c.type === 'baca' && cihazIds.has(c.parentCihazId)) ||            // baca
                ((c.type === 'vana' || c.type === 'regulator') && pipeIds.has(c.bagliBoruId)) || // boru vanası / regülatör
                (c.fleksBaglanti?.boruId && pipeIds.has(c.fleksBaglanti.boruId));   // fleks bağlı
            if (remove) manager.components.splice(i, 1);
        }

        // Boruların node'larını ve kendilerini temizle
        for (let i = manager.pipes.length - 1; i >= 0; i--) {
            const pipe = manager.pipes[i];
            if (!pipeIds.has(pipe.id)) continue;
            if (pipe.p1NodeId) manager.nodes?.delete(pipe.p1NodeId);
            if (pipe.p2NodeId) manager.nodes?.delete(pipe.p2NodeId);
            manager.pipes.splice(i, 1);
        }

    } else if (obj.type === 'sayac') {
        const sayac = obj;
        const girisPipe = sayac.fleksBaglanti?.boruId ? manager.findPipeById(sayac.fleksBaglanti.boruId) : null;
        const cikisPipe = sayac.cikisBagliBoruId ? manager.findPipeById(sayac.cikisBagliBoruId) : null;
        const girisEndpoint = sayac.fleksBaglanti?.endpoint; // 'p1' veya 'p2' — kolonun sayaca bakan ucu

        // Sayaç silindiğinde iç tesisat KOLONUN DEVAMI olur:
        //  • TOPOLOJİK: baslangicBaglanti / bitisBaglanti ile boru zincirini kapa.
        //  • GEOMETRİK: kolonun sayaca bakan ucu ile çıkış borusunun ilk ucu aynı NODE
        //    olsun (aksi takdirde sayacın boşluğu (~20cm) "Buradan Sonrasını Sil",
        //    servis kutusu BFS'i ve renderer komşuluk taramalarını keser).
        //  • RENK: çıkış borusu ve downstream YELLOW (pre-meter) olur.
        if (cikisPipe) {
            if (girisPipe) {
                // Kolonun "sayaç tarafı" ucu (default: p2). Burada paylaşılacak node.
                const girisUcu = (girisEndpoint === 'p1') ? 'p1' : 'p2';
                const girisNode = girisUcu === 'p1' ? girisPipe.p1 : girisPipe.p2;
                const girisNodeId = girisUcu === 'p1' ? girisPipe.p1NodeId : girisPipe.p2NodeId;

                // Çıkış borusunun p1'ini kolon ucuyla aynı NODE'a bağla.
                const oldNode = cikisPipe.p1;
                const oldNodeId = cikisPipe.p1NodeId;
                cikisPipe.p1 = girisNode;
                cikisPipe.p1NodeId = girisNodeId;
                // Artık kullanılmayan eski node'u temizle (başka boru paylaşmıyorsa).
                if (oldNodeId && oldNodeId !== girisNodeId) {
                    const stillUsed = manager.pipes.some(p =>
                        p.id !== cikisPipe.id &&
                        (p.p1NodeId === oldNodeId || p.p2NodeId === oldNodeId)
                    );
                    if (!stillUsed) manager.nodes?.delete(oldNodeId);
                }

                cikisPipe.baslangicBaglanti = {
                    tip: BAGLANTI_TIPLERI.BORU,
                    hedefId: girisPipe.id,
                    noktaIndex: null,
                };
                if (!girisPipe.bitisBaglanti?.tip) {
                    girisPipe.bitisBaglanti = {
                        tip: BAGLANTI_TIPLERI.BORU,
                        hedefId: cikisPipe.id,
                        noktaIndex: null,
                    };
                }
            } else {
                cikisPipe.baslangicBaglanti = { tip: null, hedefId: null, noktaIndex: null };
            }
        }

        // Sayaç vanasını BRANSMAN'a çevir (sayaç yok, normal kolon vanası gibi davransın)
        if (sayac.iliskiliVanaId) {
            const vana = manager.findComponentById(sayac.iliskiliVanaId);
            if (vana) vana.vanaTipi = 'BRANSMAN';
        }

        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
    } else if (obj.type === 'vana') {
        if (obj.bagliBoruId) {
            const pipe = manager.findPipeById(obj.bagliBoruId);
            if (pipe && pipe.vana && pipe.vana.id === obj.id) {
                pipe.vana = null;
            }
        }
        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
    } else if (obj.type === 'regulator') {
        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
    } else {
        if (obj.type === 'cihaz') {
            const bacalar = manager.components.filter(c => c.type === 'baca' && c.parentCihazId === obj.id);
            bacalar.forEach(baca => {
                const bacaIdx = manager.components.findIndex(c => c.id === baca.id);
                if (bacaIdx !== -1) manager.components.splice(bacaIdx, 1);
            });

            // YENİ EKLENEN KISIM: Cihazı sildiğimizde borudaki cihaz vanasını da otomatik sil
            if (obj.iliskiliVanaId) {
                const vanaIdx = manager.components.findIndex(c => c.id === obj.iliskiliVanaId);
                if (vanaIdx !== -1) manager.components.splice(vanaIdx, 1);
            }
        }
        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
    }

    // Topoloji değişti — her borunun parent'ını (kök kaynağını) ve
    // colorGroup'unu yeniden hesapla. Bu, sayaç silindiğinde T-listesinde
    // olmayan çocuk dalların eski TURQUAZ rengini taşımasını engeller.
    if (typeof manager.recomputePipeParents === 'function') {
        manager.recomputePipeParents();
    }

    return pipeToSelect;
}

export function findConnectedPipesChain(manager, startPipe) {
    const allConnected = [];
    const visited = new Set();
    const queue = [startPipe];
    const tolerance = 1;

    visited.add(startPipe.id);

    while (queue.length > 0) {
        const currentPipe = queue.shift();
        allConnected.push(currentPipe);

        manager.pipes.forEach(otherPipe => {
            if (visited.has(otherPipe.id)) return;
            const p1ToCurrentP1 = Math.hypot(otherPipe.p1.x - currentPipe.p1.x, otherPipe.p1.y - currentPipe.p1.y);
            const p1ToCurrentP2 = Math.hypot(otherPipe.p1.x - currentPipe.p2.x, otherPipe.p1.y - currentPipe.p2.y);
            const p2ToCurrentP1 = Math.hypot(otherPipe.p2.x - currentPipe.p1.x, otherPipe.p2.y - currentPipe.p1.y);
            const p2ToCurrentP2 = Math.hypot(otherPipe.p2.x - currentPipe.p2.x, otherPipe.p2.y - currentPipe.p2.y);

            if (p1ToCurrentP1 < tolerance || p1ToCurrentP2 < tolerance || p2ToCurrentP1 < tolerance || p2ToCurrentP2 < tolerance) {
                visited.add(otherPipe.id);
                queue.push(otherPipe);
            }
        });
    }
    return allConnected;
}

/**
 * 2D sahnede (t < 0.99) düşey boru sembolü (çember) tıklandığında boruyu bulur
 * @param {*} manager
 * @param {*} point - Tıklanan nokta (world coordinates)
 * @param {number} tolerance - Tıklama toleransı
 * @returns {Object|null} - { pipe, point } veya null
 */
export function findVerticalPipeSymbolAt(manager, point, tolerance = 10) {
    const t = state.viewBlendFactor || 0;
    // 3D perspektifte düşey-sembol erken yakalaması yapılmaz: 3D seçim,
    // findObjectAt içindeki "en yakın aday" mantığıyla yürür.
    if (state.is3DPerspectiveActive || t >= 0.99) return null;
    const effectiveTolerance = tolerance;

    for (const pipe of manager.pipes) {
        const rawZDiff = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));
        const rawDx = pipe.p2.x - pipe.p1.x;
        const rawDy = pipe.p2.y - pipe.p1.y;
        const rawLen2d = Math.hypot(rawDx, rawDy);

        let elevationAngle = 90;
        if (rawLen2d > 0.001) {
            elevationAngle = Math.atan2(rawZDiff, rawLen2d) * 180 / Math.PI;
        }

        // Düşey boru kontrolü (renderer-pipes.js'deki mantıkla aynı)
        if (rawZDiff > 0.1 && elevationAngle > 85) {
            // P1 ekran konumu (alt uç — sembol/çember burada çizilir)
            const z1Off = (pipe.p1.z || 0) * t;
            const c1X = pipe.p1.x + z1Off;
            const c1Y = pipe.p1.y - z1Off;

            const dist1 = Math.hypot(point.x - c1X, point.y - c1Y);
            if (dist1 < effectiveTolerance) {
                return {
                    pipe: pipe,
                    point: { x: pipe.p1.x, y: pipe.p1.y, z: pipe.p1.z || 0 }
                };
            }

            // P2 ekran konumu (üst uç — blended görünümde z-offset kadar kayar).
            // Üstten tıklamada P2'de bir komponent (vana/cihaz) olsa dahi düşey
            // boru sembolünün öncelikli yakalanması için P2 de hit-test edilir.
            const z2Off = (pipe.p2.z || 0) * t;
            const c2X = pipe.p2.x + z2Off;
            const c2Y = pipe.p2.y - z2Off;

            const dist2 = Math.hypot(point.x - c2X, point.y - c2Y);
            if (dist2 < effectiveTolerance) {
                return {
                    pipe: pipe,
                    point: { x: pipe.p2.x, y: pipe.p2.y, z: pipe.p2.z || 0 }
                };
            }
        }
    }

    return null;
}

/**
 * Aynı noktaya (aynı X,Y koordinatları) bağlı zincir halindeki düşey boruları bulur
 * @param {*} manager
 * @param {*} basePipe - Başlangıç borusu
 * @returns {Array} - Zincirdeki tüm düşey borular
 */
export function findVerticalPipeChain(manager, basePipe) {
    const chain = [];
    const tolerance = 1; // cm

    // Baz borunun X,Y koordinatlarını al
    const baseX = basePipe.p1.x;
    const baseY = basePipe.p1.y;

    // Tüm boruları tara
    for (const pipe of manager.pipes) {
        // Düşey boru kontrolü
        const rawZDiff = Math.abs((pipe.p2.z || 0) - (pipe.p1.z || 0));
        const rawDx = pipe.p2.x - pipe.p1.x;
        const rawDy = pipe.p2.y - pipe.p1.y;
        const rawLen2d = Math.hypot(rawDx, rawDy);

        let elevationAngle = 90;
        if (rawLen2d > 0.001) {
            elevationAngle = Math.atan2(rawZDiff, rawLen2d) * 180 / Math.PI;
        }

        // Düşey boru mu?
        if (rawZDiff > 0.1 && elevationAngle > 85) {
            // Aynı X,Y noktasında mı?
            const distXY = Math.hypot(pipe.p1.x - baseX, pipe.p1.y - baseY);

            if (distXY < tolerance) {
                chain.push(pipe);
            }
        }
    }

    return chain;
}

/**
 * Aynı eksende uzanan ve uç-uca bağlı boru zincirini bulur (yatay/düşey)
 * @param {*} manager
 * @param {*} basePipe - Başlangıç borusu
 * @param {string} primaryAxis - 'X', 'Y' veya 'Z' - borunun uzandığı eksen
 * @returns {Array} - Zincirdeki tüm borular
 */
export function findAlignedPipeChain(manager, basePipe, primaryAxis) {
    const chain = [basePipe];
    const visited = new Set([basePipe.id]);
    const tolerance = 1; // cm
    const angleTolerance = 10; // derece

    // BFS ile bağlı boruları bul
    const queue = [basePipe];

    while (queue.length > 0) {
        const currentPipe = queue.shift();

        // p1 ve p2'ye bağlı boruları kontrol et
        for (const endpoint of ['p1', 'p2']) {
            const point = currentPipe[endpoint];

            // Bu noktaya bağlı diğer boruları bul
            for (const otherPipe of manager.pipes) {
                if (visited.has(otherPipe.id)) continue;

                // Bağlantı kontrolü
                const distToP1 = Math.hypot(
                    otherPipe.p1.x - point.x,
                    otherPipe.p1.y - point.y,
                    (otherPipe.p1.z || 0) - (point.z || 0)
                );
                const distToP2 = Math.hypot(
                    otherPipe.p2.x - point.x,
                    otherPipe.p2.y - point.y,
                    (otherPipe.p2.z || 0) - (point.z || 0)
                );

                // Düğüm paylaşımı (referans eşitliği) birincil kontrol; koordinat mesafesi fallback
                const connected = (otherPipe.p1 === point || otherPipe.p2 === point) || distToP1 < tolerance || distToP2 < tolerance;
                if (connected) {
                    // Bağlı! Şimdi aynı yönde mi kontrol et
                    const otherDx = Math.abs(otherPipe.p2.x - otherPipe.p1.x);
                    const otherDy = Math.abs(otherPipe.p2.y - otherPipe.p1.y);
                    const otherDz = Math.abs((otherPipe.p2.z || 0) - (otherPipe.p1.z || 0));

                    let otherPrimaryAxis = 'X';
                    if (otherDy >= otherDx && otherDy >= otherDz) {
                        otherPrimaryAxis = 'Y';
                    } else if (otherDz >= otherDx && otherDz >= otherDy) {
                        otherPrimaryAxis = 'Z';
                    }

                    // Aynı primary axis'e sahip mi?
                    if (otherPrimaryAxis === primaryAxis) {
                        chain.push(otherPipe);
                        visited.add(otherPipe.id);
                        queue.push(otherPipe);
                    }
                }
            }
        }
    }

    return chain;
}

/**
 * Gizmo eksenine tıklama kontrolü (hit detection)
 * @param {Object} gizmoCenter - Gizmo merkez noktası {x, y, z}
 * @param {Object} mousePoint - Mouse pozisyonu {x, y}
 * @param {Array} allowedAxes - İzin verilen eksenler ['X', 'Y', 'Z']
 * @returns {string|null} - Tıklanan eksen ('X', 'Y', 'Z') veya null
 */
export function findGizmoAxisAt(gizmoCenter, mousePoint, allowedAxes = ['X', 'Y', 'Z']) {
    if (!gizmoCenter || !mousePoint) return null;

    const t = state.viewBlendFactor || 0;

    // 2D modda gizmo yok
    if (t < 0.1) return null;

    const zoom = state.zoom || 1;
    const axisLength = 60 / zoom;
    const hitTolerance = 10 / zoom; // Hit detection toleransı

    // Gizmo merkez noktasının ekran koordinatları
    const z = gizmoCenter.z || 0;
    const screenX = gizmoCenter.x + (z * t);
    const screenY = gizmoCenter.y - (z * t);

    // Mouse'un ekran koordinatları (zaten world space'te, ama 3D offset yok)
    const mouseScreenX = mousePoint.x;
    const mouseScreenY = mousePoint.y;

    let closestAxis = null;
    let closestDist = Infinity;

    // X ekseni kontrolü (sağa doğru)
    if (allowedAxes.includes('X')) {
        const xEndX = screenX + axisLength;
        const xEndY = screenY;

        // Çizgi segment'ine nokta-segment mesafesi
        const dist = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            xEndX, xEndY
        );

        if (dist < hitTolerance && dist < closestDist) {
            closestDist = dist;
            closestAxis = 'X';
        }
    }

    // Y ekseni kontrolü (aşağı doğru)
    if (allowedAxes.includes('Y')) {
        const yEndX = screenX;
        const yEndY = screenY + axisLength;

        const dist = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            yEndX, yEndY
        );

        if (dist < hitTolerance && dist < closestDist) {
            closestDist = dist;
            closestAxis = 'Y';
        }
    }

    // Z ekseni kontrolü (çapraz yukarı-sol)
    if (allowedAxes.includes('Z')) {
        const zEndX = screenX - (axisLength * t);
        const zEndY = screenY + (axisLength * t);

        const dist = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            zEndX, zEndY
        );

        if (dist < hitTolerance && dist < closestDist) {
            closestDist = dist;
            closestAxis = 'Z';
        }
    }

    return closestAxis;
}

/**
 * Translate gizmo kollarına tıklama/hover kontrolü (50px kısa kollar için)
 * Hem + hem - yönleri kontrol eder
 * @param {Object} gizmoCenter - Gizmo merkez noktası {x, y, z}
 * @param {Object} mousePoint - Mouse pozisyonu {x, y}
 * @param {Array} allowedAxes - İzin verilen eksenler ['X', 'Y', 'Z']
 * @returns {string|null} - Hover edilen eksen ('X', 'Y', 'Z') veya null
 */
export function findTranslateGizmoAxisAt(gizmoCenter, mousePoint, allowedAxes = ['X', 'Y', 'Z']) {
    if (!gizmoCenter || !mousePoint) return null;

    const t = state.viewBlendFactor || 0;

    // 2D modda gizmo yok
    if (t < 0.1) return null;

    const zoom = state.zoom || 1;
    const armLength = 30 * Math.min(1, zoom); // Uzaklaşınca küçülür, yaklaşınca büyümez
    const hitTolerance = 12 / zoom; // Biraz daha geniş tolerans (tutulabilmesi için)

    // Gizmo merkez noktasının ekran koordinatları
    const z = gizmoCenter.z || 0;
    const screenX = gizmoCenter.x + (z * t);
    const screenY = gizmoCenter.y - (z * t);

    // Mouse'un ekran koordinatları (zaten world space'te, ama 3D offset yok)
    const mouseScreenX = mousePoint.x;
    const mouseScreenY = mousePoint.y;

    let closestAxis = null;
    let closestDist = Infinity;

    // X ekseni kontrolü (hem + hem - yönde)
    if (allowedAxes.includes('X')) {
        // + yönü (sağa)
        const xPlusEndX = screenX + armLength;
        const xPlusEndY = screenY;
        const distXPlus = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            xPlusEndX, xPlusEndY
        );

        // - yönü (sola)
        const xMinusEndX = screenX - armLength;
        const xMinusEndY = screenY;
        const distXMinus = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            xMinusEndX, xMinusEndY
        );

        const distX = Math.min(distXPlus, distXMinus);
        if (distX < hitTolerance && distX < closestDist) {
            closestDist = distX;
            closestAxis = 'X';
        }
    }

    // Y ekseni kontrolü (hem + hem - yönde)
    if (allowedAxes.includes('Y')) {
        // + yönü (aşağı)
        const yPlusEndX = screenX;
        const yPlusEndY = screenY + armLength;
        const distYPlus = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            yPlusEndX, yPlusEndY
        );

        // - yönü (yukarı)
        const yMinusEndX = screenX;
        const yMinusEndY = screenY - armLength;
        const distYMinus = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            yMinusEndX, yMinusEndY
        );

        const distY = Math.min(distYPlus, distYMinus);
        if (distY < hitTolerance && distY < closestDist) {
            closestDist = distY;
            closestAxis = 'Y';
        }
    }

    // Z ekseni kontrolü (hem + hem - yönde)
    if (allowedAxes.includes('Z')) {
        // + yönü (yukarı-sağ)
        const zPlusEndX = screenX + (armLength * t);
        const zPlusEndY = screenY - (armLength * t);
        const distZPlus = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            zPlusEndX, zPlusEndY
        );

        // - yönü (aşağı-sol)
        const zMinusEndX = screenX - (armLength * t);
        const zMinusEndY = screenY + (armLength * t);
        const distZMinus = pointToSegmentDistance(
            mouseScreenX, mouseScreenY,
            screenX, screenY,
            zMinusEndX, zMinusEndY
        );

        const distZ = Math.min(distZPlus, distZMinus);
        if (distZ < hitTolerance && distZ < closestDist) {
            closestDist = distZ;
            closestAxis = 'Z';
        }
    }

    return closestAxis;
}

/**
 * Nokta-segment arası en kısa mesafe
 * @param {number} px - Nokta x
 * @param {number} py - Nokta y
 * @param {number} x1 - Segment başlangıç x
 * @param {number} y1 - Segment başlangıç y
 * @param {number} x2 - Segment bitiş x
 * @param {number} y2 - Segment bitiş y
 * @returns {number} - Mesafe
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        // Segment bir nokta
        return Math.hypot(px - x1, py - y1);
    }

    // Parametrik t değeri (0-1 arası projeksiyon)
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    // En yakın nokta segment üzerinde
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return Math.hypot(px - closestX, py - closestY);
}