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
 * Renderer'daki mantığın aynısını kullanır: (x+z, y-z)
 */
function getScreenPoint(point) {
    if (!state.is3DPerspectiveActive) return { x: point.x, y: point.y };
    // Z değeri yoksa 0 kabul et
    const z = point.z || 0;
    return {
        x: point.x + z,
        y: point.y - z
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
 * Öncelik sırası: 1) Bileşenler, 2) Borular (2cm), 3) Borular (5cm)
 */
export function findObjectAt(manager, point) {
    // ÖNCELİK 1: Bileşenler
    // Bileşenler şu an için Z ekseninden etkilenmiyor (Renderer'da translate kullanılmıyor)
    // Eğer ilerde bileşenlere de Z eklenirse buraya getScreenPoint eklenmeli.
    for (const comp of manager.components) {
        if (comp.containsPoint && comp.containsPoint(point)) {
            return comp;
        }
    }

    // ÖNCELİK 3: Borular (Piksel bazlı tolerance - zoom bağımsız)
    const worldTolerance = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
    
    for (const pipe of manager.pipes) {
        // Boru uçlarının ve gövdesinin izdüşümünü kontrol et
        
        // 1. Uç Noktalar (3D İzdüşümlü)
        const p1Screen = getScreenPoint(pipe.p1);
        const p2Screen = getScreenPoint(pipe.p2);

        const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

        if (distP1 < worldTolerance || distP2 < worldTolerance) {
            return pipe;
        }

        // 2. Boru Gövdesi (3D İzdüşümlü)
        // Noktanın doğru parçasına (p1Screen -> p2Screen) olan uzaklığı
        const dx = p2Screen.x - p1Screen.x;
        const dy = p2Screen.y - p1Screen.y;
        const length = Math.hypot(dx, dy);

        if (length > 0.1) {
            const t = ((point.x - p1Screen.x) * dx + (point.y - p1Screen.y) * dy) / (length * length);
            if (t >= 0 && t <= 1) {
                const projX = p1Screen.x + t * dx;
                const projY = p1Screen.y + t * dy;
                const dist = Math.hypot(point.x - projX, point.y - projY);
                if (dist < worldTolerance) {
                    return pipe;
                }
            }
        } else {
            // Çok kısa boru, zaten uç nokta kontrolünde yakalanmıştır
        }
    }

    return null;
}

/**
 * Bir noktanın serbest uç olup olmadığını kontrol et (T-junction, dirsek değil)
 * KRITIK: Cihazlar SADECE gerçek boş uçlara (1 borulu) bağlanabilir
 * Dirsek (2 boru), TE (3+ boru) = DOLU UÇ
 */
export function isFreeEndpoint(manager, point, tolerance = 1) {
    const currentFloorId = state.currentFloor?.id;
    let pipeCount = 0;

    for (const boru of manager.pipes) {
        if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
            continue;
        }

        // 3D İzdüşüm Kontrolü
        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);

        const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

        if (distP1 < tolerance || distP2 < tolerance) {
            pipeCount++;
        }

        if (pipeCount >= 2) {
            return false;
        }
    }

    return pipeCount === 1;
}

/**
 * Bir boru ucunda cihaz olup olmadığını kontrol et
 */
export function hasDeviceAtEndpoint(manager, boruId, endpoint) {
    const currentFloorId = state.currentFloor?.id;

    for (const comp of manager.components) {
        if (comp.type !== 'cihaz') continue;
        if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) {
            continue;
        }
        if (comp.fleksBaglanti &&
            comp.fleksBaglanti.boruId === boruId &&
            comp.fleksBaglanti.endpoint === endpoint) {
            return comp;
        }
    }
    return null;
}

/**
 * Bir boru ucunda sayaç olup olmadığını kontrol et
 */
export function hasMeterAtEndpoint(manager, boruId, endpoint) {
    const currentFloorId = state.currentFloor?.id;

    for (const comp of manager.components) {
        if (comp.type !== 'sayac') continue;
        if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) {
            continue;
        }
        if (comp.fleksBaglanti &&
            comp.fleksBaglanti.boruId === boruId &&
            comp.fleksBaglanti.endpoint === endpoint) {
            return comp;
        }
    }
    return null;
}

/**
 * Bir borunun atalarını takip ederek en başta sayaç var mı kontrol et
 */
export function hasAncestorMeter(manager, componentId, componentType) {
    const visited = new Set();
    const MAX_DEPTH = 100;
    let depth = 0;

    let currentId = componentId;
    let currentType = componentType;

    while (currentId && !visited.has(currentId) && depth < MAX_DEPTH) {
        visited.add(currentId);
        depth++;

        if (currentType === BAGLANTI_TIPLERI.SAYAC || currentType === 'sayac') {
            return true;
        }
        if (currentType === BAGLANTI_TIPLERI.SERVIS_KUTUSU || currentType === 'servis_kutusu') {
            return false;
        }
        if (currentType === BAGLANTI_TIPLERI.BORU || currentType === 'boru') {
            const pipe = manager.pipes.find(p => p.id === currentId);
            if (!pipe) break;

            const baglanti = pipe.baslangicBaglanti;
            if (!baglanti || !baglanti.hedefId || !baglanti.tip) {
                break;
            }
            currentId = baglanti.hedefId;
            currentType = baglanti.tip;
        } else {
            break;
        }
    }
    return false;
}

/**
 * Bir noktada boru ucu bul (3D Destekli)
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y} (Mouse koordinatı)
 * @param {number} tolerance - Tolerans (cm)
 * @param {boolean} onlyFreeEndpoints - Sadece serbest uçları mı bul
 * @returns {object|null} - {boruId, nokta, uc, boru}
 */
export function findBoruUcuAt(manager, point, tolerance = 5, onlyFreeEndpoints = false) {
    const currentFloorId = state.currentFloor?.id;
    const candidates = [];

    for (const boru of manager.pipes) {
        if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
            continue;
        }

        // 3D İzdüşüm Koordinatlarını Al
        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);

        // Mesafeyi izdüşümler üzerinden ölç (Görsel tutarlılık için)
        const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

        if (distP1 < tolerance) {
            // SADECE gerçek boş uçlar kontrolü
            // Not: isTrulyFreeEndpoint içinde de getScreenPoint kullanıldığı için uyumludur
            if (!onlyFreeEndpoints ||
                (manager.isTrulyFreeEndpoint(boru.p1, 1) &&
                    !hasDeviceAtEndpoint(manager, boru.id, 'p1') &&
                    !hasMeterAtEndpoint(manager, boru.id, 'p1'))) {

                candidates.push({ boruId: boru.id, nokta: boru.p1, uc: 'p1', boru: boru, screenPoint: p1Screen });
            }
        }
        if (distP2 < tolerance) {
            if (!onlyFreeEndpoints ||
                (manager.isTrulyFreeEndpoint(boru.p2, 1) &&
                    !hasDeviceAtEndpoint(manager, boru.id, 'p2') &&
                    !hasMeterAtEndpoint(manager, boru.id, 'p2'))) {
                candidates.push({ boruId: boru.id, nokta: boru.p2, uc: 'p2', boru: boru, screenPoint: p2Screen });
            }
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    if (candidates.length === 1) {
        const c = candidates[0];
        return { boruId: c.boruId, nokta: c.nokta, uc: c.uc, boru: c.boru };
    }

    // Birden fazla aday varsa, tıklama noktasına en yakın olanı seç
    // (Önceki kod boru gövdesine bakıyordu, ama uç nokta aradığımız için doğrudan noktaya bakmak daha doğru olabilir)
    // Yine de tutarlılık için gövde izdüşümüne bakalım
    let closest = candidates[0];
    let minBodyDist = Infinity;

    for (const candidate of candidates) {
        // Aday borunun gövde izdüşümüne olan mesafeyi hesapla
        const p1s = getScreenPoint(candidate.boru.p1);
        const p2s = getScreenPoint(candidate.boru.p2);
        
        const dx = p2s.x - p1s.x;
        const dy = p2s.y - p1s.y;
        const len = Math.hypot(dx, dy);
        
        let bodyDist = Infinity;
        
        if (len > 0.01) {
             const t = ((point.x - p1s.x) * dx + (point.y - p1s.y) * dy) / (len * len);
             // t'yi 0-1 arasına sıkıştır (segment distance)
             const tClamped = Math.max(0, Math.min(1, t));
             const projX = p1s.x + tClamped * dx;
             const projY = p1s.y + tClamped * dy;
             bodyDist = Math.hypot(point.x - projX, point.y - projY);
        } else {
             bodyDist = Math.hypot(point.x - p1s.x, point.y - p1s.y);
        }
        
        if (bodyDist < minBodyDist) {
            minBodyDist = bodyDist;
            closest = candidate;
        }
    }

    return { boruId: closest.boruId, nokta: closest.nokta, uc: closest.uc, boru: closest.boru };
}

/**
 * Bir noktada boru gövdesi bul (3D Destekli)
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object|null} - {boruId, nokta} (Nokta 2D world koordinatıdır)
 */
export function findBoruGovdeAt(manager, point, tolerance = 5) {
    for (const boru of manager.pipes) {
        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);

        const dx = p2Screen.x - p1Screen.x;
        const dy = p2Screen.y - p1Screen.y;
        const length = Math.hypot(dx, dy);

        if (length > 0.01) {
            const t = ((point.x - p1Screen.x) * dx + (point.y - p1Screen.y) * dy) / (length * length);
            
            if (t >= 0 && t <= 1) {
                const projX = p1Screen.x + t * dx;
                const projY = p1Screen.y + t * dy;
                const dist = Math.hypot(point.x - projX, point.y - projY);
                
                if (dist < tolerance) {
                    // Bulunan nokta ekran koordinatında (projX, projY).
                    // Bunu geri world koordinatına çevirmek zor olabilir (z bilinmiyor).
                    // Ancak boru üzerindeki t oranını bildiğimiz için, 
                    // borunun orijinal 3D koordinatları üzerinde interpolasyon yapabiliriz.
                    
                    const worldX = boru.p1.x + t * (boru.p2.x - boru.p1.x);
                    const worldY = boru.p1.y + t * (boru.p2.y - boru.p1.y);
                    const worldZ = (boru.p1.z || 0) + t * ((boru.p2.z || 0) - (boru.p1.z || 0));

                    return { 
                        boruId: boru.id, 
                        nokta: { x: worldX, y: worldY, z: worldZ } // Z bilgisini de ekleyelim
                    };
                }
            }
        }
    }
    return null;
}

/**
 * Mouse altındaki boruyu bul (pipe splitting için) - 3D Destekli
 */
export function findPipeAt(manager, point, tolerance = 2) {
    // findBoruGovdeAt mantığının aynısını kullanır, sadece boruyu döner
    const result = findBoruGovdeAt(manager, point, tolerance);
    if (result) {
        return manager.findPipeById(result.boruId);
    }
    return null;
}

/**
 * Bileşen çıkış noktasını bul
 */
export function findBilesenCikisAt(manager, point, tolerance = 2) {
    for (const comp of manager.components) {
        // Bileşenlerin Z etkisi olmadığını varsayıyoruz (Renderer'a göre)
        // Eğer bileşenlerin de Z'si varsa burası da getScreenPoint kullanmalı
        
        if (comp.type === 'servis_kutusu' && comp.getCikisNoktasi && !comp.cikisKullanildi) {
            const cikis = comp.getCikisNoktasi();
            // Servis kutusu çıkışı 3D'de kaymalı mı? 
            // Şimdilik 2D kabul ediyoruz çünkü bileşenler kaymıyor.
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

/**
 * Bir noktada vana var mı kontrol et
 */
export function checkVanaAtPoint(manager, point, tolerance = 2) {
    for (const comp of manager.components) {
        if (comp.type === 'vana') {
            // Vana 2D koordinatta mı çiziliyor? Evet (şimdilik)
            if (Math.hypot(point.x - comp.x, point.y - comp.y) < tolerance) {
                return comp;
            }
        }
    }
    return null;
}

/**
 * Boru uç noktasını bul (3D Destekli)
 */
export function findPipeEndpoint(pipe, point) {
    const tolerance = 2; // cm
    
    const p1Screen = getScreenPoint(pipe.p1);
    const p2Screen = getScreenPoint(pipe.p2);
    
    const distToP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
    const distToP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

    if (distToP1 <= tolerance && distToP1 <= distToP2) {
        return 'p1';
    }
    if (distToP2 <= tolerance) {
        return 'p2';
    }
    return null;
}

/**
 * Nesne sil (boru, bileşen vb.)
 * (Logic değişmedi, aynen korundu)
 */
export function removeObject(manager, obj) {
    let pipeToSelect = null;

    if (obj.type === 'boru') {
        const deletedPipe = obj;
        const hierarchy = window._pipeHierarchy;
        if (hierarchy) {
            const pipeData = hierarchy.get(deletedPipe.id);
            if (pipeData && pipeData.parent) {
                const parentPipe = manager.pipes.find(p => {
                    const data = hierarchy.get(p.id);
                    return data && data.label === pipeData.parent;
                });
                if (parentPipe) {
                    pipeToSelect = parentPipe;
                }
            }
        }

        if (!pipeToSelect) {
            const tolerance = 1;
            const nextPipes = manager.pipes.filter(p =>
                p.id !== deletedPipe.id &&
                Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < tolerance
            );

            if (nextPipes.length === 1) {
                pipeToSelect = nextPipes[0];
            } else {
                const prevPipe = manager.pipes.find(p =>
                    p.id !== deletedPipe.id &&
                    Math.hypot(p.p2.x - deletedPipe.p1.x, p.p2.y - deletedPipe.p1.y) < tolerance
                );
                if (prevPipe) {
                    pipeToSelect = prevPipe;
                }
            }
        }

        const nextPipe = manager.pipes.find(p =>
            p.id !== deletedPipe.id &&
            Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < 1
        );

        if (nextPipe) {
            const oldP1 = { x: nextPipe.p1.x, y: nextPipe.p1.y };
            const newP1 = { x: deletedPipe.p1.x, y: deletedPipe.p1.y };

            nextPipe.p1.x = newP1.x;
            nextPipe.p1.y = newP1.y;

            if (deletedPipe.vana && nextPipe.vana && nextPipe.vana.t === 0) {
                nextPipe.vanaKaldir();
            }

            if (deletedPipe.baslangicBaglanti.hedefId) {
                nextPipe.setBaslangicBaglanti(
                    deletedPipe.baslangicBaglanti.tip,
                    deletedPipe.baslangicBaglanti.hedefId,
                    deletedPipe.baslangicBaglanti.noktaIndex
                );

                if (deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                    const servisKutusu = manager.components.find(
                        c => c.id === deletedPipe.baslangicBaglanti.hedefId
                    );
                    if (servisKutusu) {
                        servisKutusu.bagliBoruId = nextPipe.id;
                        const cikis = servisKutusu.getCikisNoktasi();
                        nextPipe.p1.x = cikis.x;
                        nextPipe.p1.y = cikis.y;
                    }
                }

                if (deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                    const sayac = manager.components.find(
                        c => c.id === deletedPipe.baslangicBaglanti.hedefId
                    );
                    if (sayac) {
                        sayac.cikisBagliBoruId = nextPipe.id;
                        const cikis = sayac.getCikisNoktasi();
                        nextPipe.p1.x = cikis.x;
                        nextPipe.p1.y = cikis.y;
                    }
                }
            }
        } else {
            if (deletedPipe.baslangicBaglanti && deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                const servisKutusu = manager.components.find(
                    c => c.id === deletedPipe.baslangicBaglanti.hedefId
                );
                if (servisKutusu) {
                    servisKutusu.bagliBoruId = null;
                }
            }

            if (deletedPipe.baslangicBaglanti && deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                const sayac = manager.components.find(
                    c => c.id === deletedPipe.baslangicBaglanti.hedefId
                );
                if (sayac) {
                    sayac.cikisBagliBoruId = null;
                }
            }
        }

        const devicesToDelete = [];

        manager.components.forEach(comp => {
            if (comp.type === 'cihaz' && comp.fleksBaglanti && comp.fleksBaglanti.boruId === deletedPipe.id) {
                if (nextPipe) {
                    comp.fleksBaglanti.boruId = nextPipe.id;
                    comp.fleksBaglanti.endpoint = 'p2';
                } else {
                    devicesToDelete.push(comp);
                }
            }
        });

        devicesToDelete.forEach(device => {
            const bacalar = manager.components.filter(c => c.type === 'baca' && c.parentCihazId === device.id);
            bacalar.forEach(baca => {
                const bIdx = manager.components.indexOf(baca);
                if (bIdx !== -1) manager.components.splice(bIdx, 1);
            });

            const dIdx = manager.components.indexOf(device);
            if (dIdx !== -1) manager.components.splice(dIdx, 1);
        });

        const valvesToRemove = manager.components.filter(comp =>
            comp.type === 'vana' && comp.bagliBoruId === deletedPipe.id
        );
        valvesToRemove.forEach(vana => {
            const idx = manager.components.findIndex(c => c.id === vana.id);
            if (idx !== -1) manager.components.splice(idx, 1);
        });

        const index = manager.pipes.findIndex(p => p.id === obj.id);
        if (index !== -1) manager.pipes.splice(index, 1);

    } else if (obj.type === 'servis_kutusu') {
        const allPipes = [...manager.pipes];
        const allComponents = manager.components.filter(c =>
            c.type === 'vana' || c.type === 'cihaz' || c.type === 'sayac'
        );

        for (let i = allComponents.length - 1; i >= 0; i--) {
            const idx = manager.components.indexOf(allComponents[i]);
            if (idx !== -1) manager.components.splice(idx, 1);
        }

        for (let i = allPipes.length - 1; i >= 0; i--) {
            const idx = manager.pipes.indexOf(allPipes[i]);
            if (idx !== -1) manager.pipes.splice(idx, 1);
        }

        const index = manager.components.findIndex(c => c.id === obj.id);
        if (index !== -1) manager.components.splice(index, 1);
    } else if (obj.type === 'sayac') {
        const girisBoruId = obj.fleksBaglanti?.boruId;
        const cikisBoruId = obj.cikisBagliBoruId;

        if (girisBoruId && cikisBoruId) {
            const girisBoru = manager.pipes.find(p => p.id === girisBoruId);
            const cikisBoru = manager.pipes.find(p => p.id === cikisBoruId);

            if (girisBoru && cikisBoru) {
                const targetPoint = obj.fleksBaglanti.endpoint === 'p1' ? girisBoru.p1 : girisBoru.p2;
                cikisBoru.moveP1(targetPoint);
                cikisBoru.setBaslangicBaglanti('boru', girisBoru.id);
                if (obj.fleksBaglanti.endpoint === 'p2') {
                    girisBoru.setBitisBaglanti('boru', cikisBoru.id);
                } else {
                    girisBoru.setBaslangicBaglanti('boru', cikisBoru.id);
                }
            }
        }

        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
    }
    else {
        if (obj.type === 'cihaz') {
            const bacalar = manager.components.filter(c =>
                c.type === 'baca' && c.parentCihazId === obj.id
            );
            bacalar.forEach(baca => {
                const bacaIdx = manager.components.findIndex(c => c.id === baca.id);
                if (bacaIdx !== -1) manager.components.splice(bacaIdx, 1);
            });
        }

        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);

        const pIdx = manager.pipes.findIndex(p => p.id === obj.id);
        if (pIdx !== -1) manager.pipes.splice(pIdx, 1);
    }

    return pipeToSelect;
}

/**
 * Bağlı boru ağını bul
 * (Logic değişmedi)
 */
export function findConnectedPipesChain(manager, startPipe) {
    const allConnected = [];
    const visited = new Set();
    const queue = [startPipe];
    const tolerance = 1; // 1 cm

    visited.add(startPipe.id);

    while (queue.length > 0) {
        const currentPipe = queue.shift();
        allConnected.push(currentPipe);

        manager.pipes.forEach(otherPipe => {
            if (visited.has(otherPipe.id)) return;

            // Burada Z'yi ihmal edip mantıksal bağlantıyı (world coordinates) kullanıyoruz
            // Çünkü bu fonksiyon mantıksal ağ takibi içindir, görsel seçim için değil.
            
            const p1ToCurrentP1 = Math.hypot(otherPipe.p1.x - currentPipe.p1.x, otherPipe.p1.y - currentPipe.p1.y);
            const p1ToCurrentP2 = Math.hypot(otherPipe.p1.x - currentPipe.p2.x, otherPipe.p1.y - currentPipe.p2.y);
            const p2ToCurrentP1 = Math.hypot(otherPipe.p2.x - currentPipe.p1.x, otherPipe.p2.y - currentPipe.p1.y);
            const p2ToCurrentP2 = Math.hypot(otherPipe.p2.x - currentPipe.p2.x, otherPipe.p2.y - currentPipe.p2.y);

            if (p1ToCurrentP1 < tolerance || p1ToCurrentP2 < tolerance ||
                p2ToCurrentP1 < tolerance || p2ToCurrentP2 < tolerance) {
                visited.add(otherPipe.id);
                queue.push(otherPipe);
            }
        });
    }

    return allConnected;
}