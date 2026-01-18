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

export function findBoruUcuAt(manager, point, tolerance = 5, onlyFreeEndpoints = false) {
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
                }
            }

            // Rengi kopyala
            if (pipeToDelete.colorGroup) {
                childPipe.colorGroup = pipeToDelete.colorGroup;
            }

            pipeToSelect = childPipe;
            
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