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
    // ÖNCELİK 1: Bileşenler (Vana, Sayaç, Cihaz vb.)
    const t = state.viewBlendFactor || 0;

    for (const comp of manager.components) {
        let hit = false;
        const z = comp.z || 0;

        if (state.is3DPerspectiveActive && Math.abs(z) > 0.1) {
            const visualX = comp.x + z * t;
            const visualY = comp.y - z * t;
            const dist = Math.hypot(point.x - visualX, point.y - visualY);
            if (dist < 10) { 
                hit = true;
            }
        } else {
            if (comp.containsPoint && comp.containsPoint(point)) {
                hit = true;
            }
        }

        if (hit) {
            return comp;
        }
    }

    // ÖNCELİK 2: Borular
    const worldTolerance = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
    
    for (const pipe of manager.pipes) {
        const p1Screen = getScreenPoint(pipe.p1);
        const p2Screen = getScreenPoint(pipe.p2);

        const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

        if (distP1 < worldTolerance || distP2 < worldTolerance) {
            return pipe;
        }

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
        }
    }

    return null;
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
    const currentFloorId = state.currentFloor?.id;
    const candidates = [];

    for (const boru of manager.pipes) {
        if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) continue;

        const p1Screen = getScreenPoint(boru.p1);
        const p2Screen = getScreenPoint(boru.p2);

        const distP1 = Math.hypot(point.x - p1Screen.x, point.y - p1Screen.y);
        const distP2 = Math.hypot(point.x - p2Screen.x, point.y - p2Screen.y);

        if (distP1 < tolerance) {
            if (!onlyFreeEndpoints || (manager.isTrulyFreeEndpoint(boru.p1, 1) && !hasDeviceAtEndpoint(manager, boru.id, 'p1') && !hasMeterAtEndpoint(manager, boru.id, 'p1'))) {
                candidates.push({ boruId: boru.id, nokta: boru.p1, uc: 'p1', boru: boru });
            }
        }
        if (distP2 < tolerance) {
            if (!onlyFreeEndpoints || (manager.isTrulyFreeEndpoint(boru.p2, 1) && !hasDeviceAtEndpoint(manager, boru.id, 'p2') && !hasMeterAtEndpoint(manager, boru.id, 'p2'))) {
                candidates.push({ boruId: boru.id, nokta: boru.p2, uc: 'p2', boru: boru });
            }
        }
    }

    if (candidates.length === 0) return null;

    // Eğer tercih edilen boru adaylar arasındaysa, onu döndür
    if (preferredPipeId) {
        const preferredCandidate = candidates.find(c => c.boruId === preferredPipeId);
        if (preferredCandidate) return preferredCandidate;
    }

    return candidates[0]; // İlk bulunanı döndür
}

export function findBoruGovdeAt(manager, point, tolerance = 5) {
    for (const boru of manager.pipes) {
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
        const p1Location = { x: pipeToDelete.p1.x, y: pipeToDelete.p1.y, z: pipeToDelete.p1.z };

        // 3. BİRLEŞTİRME (HEAL) MANTIĞI
        // Eğer 1 çocuk ve geçerli bir kaynak varsa
        if (childPipe && parentConn && parentConn.hedefId) {
            
            // Çocuğun başlangıç noktasını, silinen borunun başlangıç noktasına taşı
            if (childPipe.moveP1) {
                childPipe.moveP1(p1Location);
            } else {
                childPipe.p1 = { ...p1Location };
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
        
        // Bu boru üzerindeki bileşenleri sil
        const componentsToDelete = manager.components.filter(c => 
            (c.type === 'vana' && c.bagliBoruId === pipeId) ||
            (c.fleksBaglanti && c.fleksBaglanti.boruId === pipeId)
        );
        componentsToDelete.forEach(c => {
             const idx = manager.components.indexOf(c);
             if (idx !== -1) manager.components.splice(idx, 1);
        });

        const index = manager.pipes.findIndex(p => p.id === obj.id);
        if (index !== -1) manager.pipes.splice(index, 1);

    } else if (obj.type === 'servis_kutusu') {
        const index = manager.components.findIndex(c => c.id === obj.id);
        if (index !== -1) manager.components.splice(index, 1);
    } else if (obj.type === 'sayac') {
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
    } else {
        if (obj.type === 'cihaz') {
            const bacalar = manager.components.filter(c => c.type === 'baca' && c.parentCihazId === obj.id);
            bacalar.forEach(baca => {
                const bacaIdx = manager.components.findIndex(c => c.id === baca.id);
                if (bacaIdx !== -1) manager.components.splice(bacaIdx, 1);
            });
        }
        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
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

    // Sadece 2D modunda (t < 0.99) düşey semboller gösterilir
    if (t >= 0.99) return null;

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
            // Çember merkezi: p1'in ekran koordinatları
            const zOffset = (pipe.p1.z || 0) * t;
            const centerX = pipe.p1.x + zOffset;
            const centerY = pipe.p1.y - zOffset;

            const dist = Math.hypot(point.x - centerX, point.y - centerY);

            // Çember yarıçapı + tolerans (renderer'da 5 px yarıçap + ok uzunluğu ~17 px)
            if (dist < tolerance) {
                return {
                    pipe: pipe,
                    point: { x: pipe.p1.x, y: pipe.p1.y, z: pipe.p1.z || 0 }
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

                if (distToP1 < tolerance || distToP2 < tolerance) {
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

/**
 * CTRL ile sürükleme: Bir endpoint'ten itibaren devam eden tüm boru ağacını bulur
 * @param {Object} manager - Plumbing manager
 * @param {Object} startPipe - Başlangıç borusu
 * @param {string} startEndpoint - Başlangıç endpoint'i ('p1' veya 'p2')
 * @returns {Array} - {pipe, endpoint, delta} şeklinde nesnelerin listesi
 */
export function findPipeTreeFromEndpoint(manager, startPipe, startEndpoint) {
    const result = [];
    const visited = new Set([startPipe.id]);
    const tolerance = TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE || 1;

    // Başlangıç noktası
    const startPoint = startPipe[startEndpoint];

    // BFS ile bu noktadan devam eden tüm boruları bul
    const queue = [{ point: startPoint, excludePipeId: startPipe.id }];

    while (queue.length > 0) {
        const { point, excludePipeId } = queue.shift();

        // Bu noktaya bağlı tüm boruları bul
        for (const otherPipe of manager.pipes) {
            if (visited.has(otherPipe.id)) continue;
            if (otherPipe.id === excludePipeId) continue;

            // p1'e bağlı mı?
            const distToP1 = Math.hypot(
                otherPipe.p1.x - point.x,
                otherPipe.p1.y - point.y,
                (otherPipe.p1.z || 0) - (point.z || 0)
            );

            // p2'ye bağlı mı?
            const distToP2 = Math.hypot(
                otherPipe.p2.x - point.x,
                otherPipe.p2.y - point.y,
                (otherPipe.p2.z || 0) - (point.z || 0)
            );

            if (distToP1 < tolerance) {
                // p1 bağlı -> p2'den devam et
                visited.add(otherPipe.id);
                result.push({
                    pipe: otherPipe,
                    connectedEndpoint: 'p1', // Hangi ucu bağlı
                    otherEndpoint: 'p2'      // Diğer uç
                });
                queue.push({ point: otherPipe.p2, excludePipeId: otherPipe.id });
            } else if (distToP2 < tolerance) {
                // p2 bağlı -> p1'den devam et
                visited.add(otherPipe.id);
                result.push({
                    pipe: otherPipe,
                    connectedEndpoint: 'p2', // Hangi ucu bağlı
                    otherEndpoint: 'p1'      // Diğer uç
                });
                queue.push({ point: otherPipe.p1, excludePipeId: otherPipe.id });
            }
        }
    }

    return result;
}
}