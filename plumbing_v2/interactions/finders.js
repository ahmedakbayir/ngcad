/**
 * Finder and Helper Methods
 * Boru ve bileşen bulma yardımcı fonksiyonları
 */

import { BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { saveState } from '../../../general-files/history.js';
import { setState, state } from '../../../general-files/main.js';

/**
 * Bir noktada nesne bul (bileşen veya boru)
 * Öncelik sırası: 1) Bileşenler, 2) Borular (2cm), 3) Borular (5cm)
 */
export function findObjectAt(manager, point) {
    // ÖNCELİK 1: Bileşenler (Vana, servis kutusu, sayaç, cihaz)
    // Vana tam boyutunda (tolerance 0) burada kontrol edilir.
    // Eğer fare tam vana üzerindeyse bu döngü onu bulur ve döndürür.
    for (const comp of manager.components) {
        if (comp.containsPoint && comp.containsPoint(point)) {
            return comp;
        }
    }

    // // ÖNCELİK 2: Borular (2cm tolerance - kesin tıklama)
    // // Vana bulunamadıysa (yani 1mm bile dışındaysa), buraya düşer ve boruyu arar.
    // for (const pipe of manager.pipes) {
    //     if (pipe.containsPoint && pipe.containsPoint(point, 2)) {
    //         return pipe;
    //     }
    // }

    // ÖNCELİK 3: Borular (daha geniş tolerance - 5cm)
    for (const pipe of manager.pipes) {
        if (pipe.containsPoint && pipe.containsPoint(point, 8)) {
            return pipe;
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
        // Sadece aktif kattaki boruları kontrol et
        if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
            continue;
        }

        const distP1 = Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y);
        const distP2 = Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y);

        if (distP1 < tolerance || distP2 < tolerance) {
            pipeCount++;
        }

        // Erken çıkış: 2+ boru = dirsek veya TE
        if (pipeCount >= 2) {
            return false;
        }
    }

    // SADECE 1 boru varsa gerçek boş uç
    // 2 boru = dirsek, 3+ boru = TE → DOLU UÇ
    return pipeCount === 1;
}

/**
 * Bir boru ucunda cihaz olup olmadığını kontrol et
 * @param {object} manager - Manager instance
 * @param {string} boruId - Boru ID'si
 * @param {string} endpoint - 'p1' veya 'p2'
 * @returns {object|null} - Varsa cihaz, yoksa null
 */
export function hasDeviceAtEndpoint(manager, boruId, endpoint) {
    const currentFloorId = state.currentFloor?.id;

    for (const comp of manager.components) {
        // Sadece cihazları kontrol et
        if (comp.type !== 'cihaz') continue;

        // Sadece aktif kattaki cihazları kontrol et
        if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) {
            continue;
        }

        // Fleks bağlantısı bu boru ucuna mı?
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
 * @param {object} manager - Manager instance
 * @param {string} boruId - Boru ID'si
 * @param {string} endpoint - 'p1' veya 'p2'
 * @returns {object|null} - Varsa sayaç, yoksa null
 */
export function hasMeterAtEndpoint(manager, boruId, endpoint) {
    const currentFloorId = state.currentFloor?.id;

    for (const comp of manager.components) {
        // Sadece sayaçları kontrol et
        if (comp.type !== 'sayac') continue;

        // Sadece aktif kattaki sayaçları kontrol et
        if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) {
            continue;
        }

        // Fleks bağlantısı bu boru ucuna mı?
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
 * Metafor: K→D→B→A şeklinde ataları takip et, A sayaç mı kontrol et
 * @param {object} manager - Manager instance
 * @param {string} componentId - Boru veya bileşen ID'si
 * @param {string} componentType - 'boru', 'servis_kutusu', 'sayac' vb.
 * @returns {boolean} - Atalarda sayaç varsa true (İç Tesisat = TURQUAZ)
 */
export function hasAncestorMeter(manager, componentId, componentType) {
    // Ziyaret edilen ID'leri takip et (sonsuz döngü önleme)
    const visited = new Set();
    const MAX_DEPTH = 100; // Maksimum derinlik
    let depth = 0;

    let currentId = componentId;
    let currentType = componentType;

    while (currentId && !visited.has(currentId) && depth < MAX_DEPTH) {
        visited.add(currentId);
        depth++;

        // Eğer sayaca ulaştıysak, iç tesisat!
        if (currentType === BAGLANTI_TIPLERI.SAYAC || currentType === 'sayac') {
            return true;
        }

        // Eğer servis kutusuna ulaştıysak, kolon tesisat (sayaç yok)
        if (currentType === BAGLANTI_TIPLERI.SERVIS_KUTUSU || currentType === 'servis_kutusu') {
            return false;
        }

        // Boru ise, başlangıç bağlantısını takip et
        if (currentType === BAGLANTI_TIPLERI.BORU || currentType === 'boru') {
            const pipe = manager.pipes.find(p => p.id === currentId);
            if (!pipe) break;

            // Başlangıç bağlantısını kontrol et (borunun nereden geldiği)
            const baglanti = pipe.baslangicBaglanti;
            if (!baglanti || !baglanti.hedefId || !baglanti.tip) {
                // Bağlantı bilgisi yok, dur
                break;
            }

            // Bir üst seviyeye çık (baba)
            currentId = baglanti.hedefId;
            currentType = baglanti.tip;
        } else {
            // Bilinmeyen tip, dur
            break;
        }
    }

    // Sayaç bulunamadı, kolon tesisat
    return false;
}

/**
 * Bir noktada boru ucu bul
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @param {boolean} onlyFreeEndpoints - Sadece serbest uçları mı bul
 * @returns {object|null} - {boruId, nokta, uc, boru}
 */
export function findBoruUcuAt(manager, point, tolerance = 5, onlyFreeEndpoints = false) {
    const currentFloorId = state.currentFloor?.id;
    const candidates = [];

    for (const boru of manager.pipes) {
        // Sadece aktif kattaki boruları kontrol et
        if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
            continue;
        }

        const distP1 = Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y);
        const distP2 = Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y);

        if (distP1 < tolerance) {
            // SADECE gerçek boş uçlar (dirsek, T-junction, cihaz ve sayaç olan uçlar hariç)
            if (!onlyFreeEndpoints ||
                (manager.isTrulyFreeEndpoint(boru.p1, 1) &&
                    !hasDeviceAtEndpoint(manager, boru.id, 'p1') &&
                    !hasMeterAtEndpoint(manager, boru.id, 'p1'))) {

                candidates.push({ boruId: boru.id, nokta: boru.p1, uc: 'p1', boru: boru });
            }
        }
        if (distP2 < tolerance) {
            // SADECE gerçek boş uçlar (dirsek, T-junction, cihaz ve sayaç olan uçlar hariç)
            if (!onlyFreeEndpoints ||
                (manager.isTrulyFreeEndpoint(boru.p2, 1) &&
                    !hasDeviceAtEndpoint(manager, boru.id, 'p2') &&
                    !hasMeterAtEndpoint(manager, boru.id, 'p2'))) {
                candidates.push({ boruId: boru.id, nokta: boru.p2, uc: 'p2', boru: boru });
            }
        }
    }

    // Hiç aday yoksa null dön
    if (candidates.length === 0) {
        return null;
    }

    // Tek aday varsa direkt dön
    if (candidates.length === 1) {
        const c = candidates[0];
        return { boruId: c.boruId, nokta: c.nokta, uc: c.uc, boru: c.boru };
    }

    // Birden fazla aday varsa, tıklama noktasına en yakın BORU GÖVDESİNİ seç
    // Bu sayede aynı noktayı paylaşan iki borudan tıkladığınız boru seçilir
    let closest = candidates[0];
    let minBodyDist = Infinity;

    for (const candidate of candidates) {
        const proj = candidate.boru.projectPoint(point);
        if (proj && proj.onSegment) {
            const bodyDist = proj.distance;
            if (bodyDist < minBodyDist) {
                minBodyDist = bodyDist;
                closest = candidate;
            }
        }
    }

    return { boruId: closest.boruId, nokta: closest.nokta, uc: closest.uc, boru: closest.boru };
}

/**
 * Bir noktada boru gövdesi bul
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object|null} - {boruId, nokta}
 */
export function findBoruGovdeAt(manager, point, tolerance = 5) {
    for (const boru of manager.pipes) {
        const proj = boru.projectPoint(point);
        if (proj && proj.onSegment && proj.distance < tolerance) {
            return { boruId: boru.id, nokta: { x: proj.x, y: proj.y } };
        }
    }
    return null;
}

/**
 * Mouse altındaki boruyu bul (pipe splitting için)
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object|null} - Boru nesnesi
 */
export function findPipeAt(manager, point, tolerance = 2) {
    for (const pipe of manager.pipes) {
        if (pipe.containsPoint && pipe.containsPoint(point, tolerance)) {
            return pipe;
        }
    }
    return null;
}

/**
 * Bileşen çıkış noktasını bul (servis kutusu, sayaç vb.)
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object|null} - {bilesenId, nokta, tip}
 */
export function findBilesenCikisAt(manager, point, tolerance = 2) {
    for (const comp of manager.components) {
        // Servis kutusu - getCikisNoktasi metodu var ve çıkış kullanılmamışsa
        if (comp.type === 'servis_kutusu' && comp.getCikisNoktasi && !comp.cikisKullanildi) {
            const cikis = comp.getCikisNoktasi();
            if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
            }
        }
        // Sayaç - çıkış noktası
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
 * @param {object} manager - Manager instance
 * @param {object} point - Nokta {x, y}
 * @param {number} tolerance - Tolerans (cm)
 * @returns {object|null} - Vana nesnesi
 */
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

/**
 * Boru uç noktasını bul
 * @param {object} pipe - Boru nesnesi
 * @param {object} point - Nokta {x, y}
 * @returns {string|null} - 'p1', 'p2' veya null
 */
export function findPipeEndpoint(pipe, point) {
    const tolerance = 2; // cm
    const distToP1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y);
    const distToP2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y);

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
 * @param {object} manager - Manager instance
 * @param {object} obj - Silinecek nesne
 * @returns {object|null} - Seçilecek boru (varsa)
 */
export function removeObject(manager, obj) {
    let pipeToSelect = null;

    if (obj.type === 'boru') {
        // Bağlı boruları bul ve bağlantıyı güncelle
        const deletedPipe = obj;

        // Silme sonrası seçilecek boruyu belirle
        // p2'ye bağlı boruyu/boruları bul (silinecek borunun devamı)
        const tolerance = 1;
        const nextPipes = manager.pipes.filter(p =>
            p.id !== deletedPipe.id &&
            Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < tolerance
        );

        // Eğer tek bir sonraki boru varsa onu seç
        if (nextPipes.length === 1) {
            pipeToSelect = nextPipes[0];
        } else {
            // Sonraki boru yoksa veya birden fazla varsa, önceki boruyu seç
            const prevPipe = manager.pipes.find(p =>
                p.id !== deletedPipe.id &&
                Math.hypot(p.p2.x - deletedPipe.p1.x, p.p2.y - deletedPipe.p1.y) < tolerance
            );
            if (prevPipe) {
                pipeToSelect = prevPipe;
            }
        }

        // p2'ye bağlı boruyu bul (silinecek borunun devamı)
        const nextPipe = manager.pipes.find(p =>
            p.id !== deletedPipe.id &&
            Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < 1
        );

        // Eğer devam eden boru varsa, başlangıcını silinecek borunun başlangıcına bağla
        if (nextPipe) {
            const oldP1 = { x: nextPipe.p1.x, y: nextPipe.p1.y };
            const newP1 = { x: deletedPipe.p1.x, y: deletedPipe.p1.y };

            // İlerdeki noktayı gerideki noktaya taşı
            nextPipe.p1.x = newP1.x;
            nextPipe.p1.y = newP1.y;

            // ÖNEMLI: Silinen borunun vanası varsa ve nextPipe'ın başında (t=0) vanası varsa,
            // nextPipe'ın vanasını da sil (çünkü aynı noktada iki vana olamaz)
            if (deletedPipe.vana && nextPipe.vana && nextPipe.vana.t === 0) {
                nextPipe.vanaKaldir();
            }

            // Bağlantı bilgisini aktar
            if (deletedPipe.baslangicBaglanti.hedefId) {
                nextPipe.setBaslangicBaglanti(
                    deletedPipe.baslangicBaglanti.tip,
                    deletedPipe.baslangicBaglanti.hedefId,
                    deletedPipe.baslangicBaglanti.noktaIndex
                );

                // Servis kutusu bağlantısını güncelle
                if (deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                    const servisKutusu = manager.components.find(
                        c => c.id === deletedPipe.baslangicBaglanti.hedefId
                    );
                    if (servisKutusu) {
                        // DÜZELTME: baglaBoru() çıkış dolu ise false döner, doğrudan ID ata
                        servisKutusu.bagliBoruId = nextPipe.id;

                        // Kutu çıkışını nextPipe.p1'e eşitle (bağlantıyı koru)
                        const cikis = servisKutusu.getCikisNoktasi();
                        nextPipe.p1.x = cikis.x;
                        nextPipe.p1.y = cikis.y;
                    }
                }

                // Sayaç bağlantısını güncelle
                if (deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                    const sayac = manager.components.find(
                        c => c.id === deletedPipe.baslangicBaglanti.hedefId
                    );
                    if (sayac) {
                        // DÜZELTME: baglaCikis() çıkış dolu ise false döner, doğrudan ID ata
                        sayac.cikisBagliBoruId = nextPipe.id;

                        // Sayaç çıkışını nextPipe.p1'e eşitle (bağlantıyı koru)
                        const cikis = sayac.getCikisNoktasi();
                        nextPipe.p1.x = cikis.x;
                        nextPipe.p1.y = cikis.y;
                    }
                }
            }

            // Bağlı boru zincirini güncelle (ilerdeki tüm borular)
            // Note: updateConnectedPipesChain needs to be called externally
            // or imported if moved to a separate helper
        } else {
            // nextPipe yok - servis kutusu/sayaç bağlantısını temizle
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

        // Boru silindiğinde, bu boruya fleks ile bağlı cihazların bağlantısını güncelle
        manager.components.forEach(comp => {
            if (comp.type === 'cihaz' && comp.fleksBaglanti && comp.fleksBaglanti.boruId === deletedPipe.id) {
                // Eğer nextPipe varsa, fleks bağlantısını nextPipe'a aktar
                if (nextPipe) {
                    // Silinen borunun p2'sine bağlıydı, şimdi nextPipe'ın p2'sine bağla
                    comp.fleksBaglanti.boruId = nextPipe.id;
                    comp.fleksBaglanti.endpoint = 'p2';
                } else {
                    // nextPipe yoksa, en yakın boru ucunu bul ve bağla
                    const cihazPos = { x: comp.x, y: comp.y };
                    let minDist = Infinity;
                    let closestPipe = null;
                    let closestEndpointName = null;

                    manager.pipes.forEach(pipe => {
                        if (pipe.id === deletedPipe.id) return;

                        const dist1 = Math.hypot(pipe.p1.x - cihazPos.x, pipe.p1.y - cihazPos.y);
                        const dist2 = Math.hypot(pipe.p2.x - cihazPos.x, pipe.p2.y - cihazPos.y);

                        if (dist2 < minDist) {
                            minDist = dist2;
                            closestPipe = pipe;
                            closestEndpointName = 'p2';
                        }
                        if (dist1 < minDist) {
                            minDist = dist1;
                            closestPipe = pipe;
                            closestEndpointName = 'p1';
                        }
                    });

                    if (closestPipe && minDist < 200) {
                        comp.fleksBaglanti.boruId = closestPipe.id;
                        comp.fleksBaglanti.endpoint = closestEndpointName;
                    } else {
                        // Yakın boru yoksa bağlantıyı temizle
                        comp.fleksBaglanti.boruId = null;
                        comp.fleksBaglanti.endpoint = null;
                    }
                }
            }
        });

        // Bu boruda bağlı vanaları da sil (bağımsız vana nesneleri)
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
        // Servis kutusu silinirken bağlı tüm boruları da sil
        const bagliBoruId = obj.bagliBoruId;
        if (bagliBoruId) {
            // Bağlı boruyu bul
            const bagliBoruIndex = manager.pipes.findIndex(p => p.id === bagliBoruId);
            if (bagliBoruIndex !== -1) {
                const bagliBoruZinciri = findConnectedPipesChain(manager, manager.pipes[bagliBoruIndex]);
                // Tüm zinciri sil
                bagliBoruZinciri.forEach(pipe => {
                    const idx = manager.pipes.findIndex(p => p.id === pipe.id);
                    if (idx !== -1) manager.pipes.splice(idx, 1);
                });
            }
        }

        // Servis kutusunu sil
        const index = manager.components.findIndex(c => c.id === obj.id);
        if (index !== -1) manager.components.splice(index, 1);
    } else if (obj.type === 'sayac') {
        // 1. Bağlı boruları bul
        const girisBoruId = obj.fleksBaglanti?.boruId;
        const cikisBoruId = obj.cikisBagliBoruId;

        // 2. Hem giriş hem çıkış borusu varsa birleştir
        if (girisBoruId && cikisBoruId) {
            const girisBoru = manager.pipes.find(p => p.id === girisBoruId);
            const cikisBoru = manager.pipes.find(p => p.id === cikisBoruId);

            if (girisBoru && cikisBoru) {
                // Giriş borusunun ucu (vananın olduğu yer)
                const targetPoint = obj.fleksBaglanti.endpoint === 'p1' ? girisBoru.p1 : girisBoru.p2;

                // Çıkış borusunun başlangıcını (p1) giriş borusunun ucuna taşı
                cikisBoru.moveP1(targetPoint);

                // Bağlantı tiplerini güncelle (Artık birbirlerine bağlılar)
                cikisBoru.setBaslangicBaglanti('boru', girisBoru.id);
                // Giris borusunun bitiş bağlantısını güncelle
                if (obj.fleksBaglanti.endpoint === 'p2') {
                    girisBoru.setBitisBaglanti('boru', cikisBoru.id);
                } else {
                    girisBoru.setBaslangicBaglanti('boru', cikisBoru.id);
                }
            }
        }

        // Vanayı (iliskiliVanaId) silmiyoruz, kullanıcı isterse manuel silsin.

        // 3. Sayacı components dizisinden sil
        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);
    }
    else {
        const idx = manager.components.findIndex(c => c.id === obj.id);
        if (idx !== -1) manager.components.splice(idx, 1);

        const pIdx = manager.pipes.findIndex(p => p.id === obj.id);
        if (pIdx !== -1) manager.pipes.splice(pIdx, 1);
    }

    return pipeToSelect;
}

/**
 * Bağlı boru ağını bul (BFS - tüm dalları takip eder, T-bağlantıları dahil)
 * @param {object} manager - Manager instance
 * @param {object} startPipe - Başlangıç borusu
 * @returns {Array} - Bağlı borular dizisi
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

        // currentPipe'ın her iki ucuna bağlı boruları bul
        manager.pipes.forEach(otherPipe => {
            if (visited.has(otherPipe.id)) return;

            // p1'e bağlı mı?
            const p1ToCurrentP1 = Math.hypot(otherPipe.p1.x - currentPipe.p1.x, otherPipe.p1.y - currentPipe.p1.y);
            const p1ToCurrentP2 = Math.hypot(otherPipe.p1.x - currentPipe.p2.x, otherPipe.p1.y - currentPipe.p2.y);
            const p2ToCurrentP1 = Math.hypot(otherPipe.p2.x - currentPipe.p1.x, otherPipe.p2.y - currentPipe.p1.y);
            const p2ToCurrentP2 = Math.hypot(otherPipe.p2.x - currentPipe.p2.x, otherPipe.p2.y - currentPipe.p2.y);

            // Herhangi bir ucu bağlı mı kontrol et
            if (p1ToCurrentP1 < tolerance || p1ToCurrentP2 < tolerance ||
                p2ToCurrentP1 < tolerance || p2ToCurrentP2 < tolerance) {
                visited.add(otherPipe.id);
                queue.push(otherPipe);
            }
        });
    }

    return allConnected;
}
