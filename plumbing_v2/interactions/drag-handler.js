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

/**
 * Bir noktanın korumalı (taşınamaz) olup olmadığını kontrol eder
 * Korumalı noktalar:
 * - Servis kutusu çıkışı
 * - Sayaç giriş/çıkış noktası
 * - Cihaz fleks bağlantısı
 * - Dirsek (2+ boru bağlı)
 * - Boşta boru ucu (başka bir borunun ucu) - SADECE endpoint drag için
 *
 * @param {Object} point - Kontrol edilecek nokta {x, y}
 * @param {Object} manager - PlumbingManager instance
 * @param {Object} currentPipe - Şu an sürüklenen boru (hariç tutulacak)
 * @param {Object} oldPoint - Sürüklenen ucun eski pozisyonu (hariç tutulacak)
 * @param {string} excludeComponentId - Hariç tutulacak component ID (yeni eklenen component için)
 * @param {boolean} skipBostaUcCheck - Boşta boru ucu kontrolünü atla (boru çizerken true)
 * @returns {boolean} - Nokta korumalı mı?
 */
export function isProtectedPoint(point, manager, currentPipe, oldPoint, excludeComponentId = null, skipBostaUcCheck = false) {
    const TOLERANCE = 10; // 10 cm içinde korumalı nokta varsa engelle

    // 1. Servis kutusu çıkışı kontrolü
    const servisKutusuCikisi = manager.components.some(c => {
        if (c.type !== 'servis_kutusu') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false; // Yeni eklenen kutuyu atla
        const cikis = c.getCikisNoktasi();
        if (!cikis) return false;
        const dist = Math.hypot(point.x - cikis.x, point.y - cikis.y);
        return dist < TOLERANCE;
    });
    if (servisKutusuCikisi) {
        //  console.log('[PROTECTED] Servis kutusu çıkışı');
        return true;
    }

    // 2. Sayaç giriş kontrolü (MANTIKSAL - başka boru bağlanamaz!)
    const sayacGirisi = manager.components.some(c => {
        if (c.type !== 'sayac') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;

        // 🚨 MANTIKSAL KONTROL: Sayaç girişinde zaten bir boru varsa, başka boru bağlanamaz!
        if (c.fleksBaglanti?.boruId) {
            const girisBoru = manager.pipes.find(p => p.id === c.fleksBaglanti.boruId);

            // Eğer sürüklenen boru GİRİŞ borusunun KENDİSİ ise izin ver
            if (currentPipe && girisBoru && currentPipe.id === girisBoru.id) {
                return false; // Kendi borusu - izin ver
            }

            // Başka bir boru sayaç girişine yaklaşmaya çalışıyor
            const girisPoint = girisBoru[c.fleksBaglanti.endpoint];
            const dist = Math.hypot(point.x - girisPoint.x, point.y - girisPoint.y);
            if (dist < TOLERANCE) {
                // console.log('[PROTECTED] Sayaç girişi - başka boru bağlanamaz!');
                return true;
            }
        }

        return false;
    });
    if (sayacGirisi) {
        return true;
    }

    // 3. Sayaç çıkışı kontrolü (MANTIKSAL - başka boru bağlanamaz!)
    const sayacCikisi = manager.components.some(c => {
        if (c.type !== 'sayac') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false;

        // 🚨 MANTIKSAL KONTROL: Sayaç çıkışında zaten bir boru varsa, başka boru bağlanamaz!
        if (c.cikisBagliBoruId) {
            const cikisBoru = manager.pipes.find(p => p.id === c.cikisBagliBoruId);

            // Eğer sürüklenen boru ÇIKIŞ borusunun KENDİSİ ise izin ver
            if (currentPipe && cikisBoru && currentPipe.id === cikisBoru.id) {
                return false; // Kendi borusu - izin ver
            }

            // Başka bir boru sayaç çıkışına yaklaşmaya çalışıyor
            const cikisPoint = c.getCikisNoktasi();
            const dist = Math.hypot(point.x - cikisPoint.x, point.y - cikisPoint.y);
            if (dist < TOLERANCE) {
                //   // console.log('[PROTECTED] Sayaç çıkışı - başka boru bağlanamaz!');
                return true;
            }
        }

        return false;
    });
    if (sayacCikisi) {
        //   // console.log('[PROTECTED] Sayaç çıkışı');
        return true;
    }

    // 4. Cihaz fleks bağlantısı kontrolü
    const cihazFleksi = manager.components.some(c => {
        if (c.type !== 'cihaz') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false; // Yeni eklenen cihazı atla

        // Fleks bağlantı varsa, BORUNUN UCUNU koru
        if (c.fleksBaglanti && c.fleksBaglanti.boruId && c.fleksBaglanti.endpoint) {
            const boru = manager.pipes.find(p => p.id === c.fleksBaglanti.boruId);
            if (boru) {
                const boruUcu = boru[c.fleksBaglanti.endpoint]; // p1 veya p2
                const dist = Math.hypot(point.x - boruUcu.x, point.y - boruUcu.y);
                return dist < TOLERANCE;
            }
        }

        // Fleks bağlantı henüz yapılmamışsa, giriş noktasını koru
        const giris = c.getGirisNoktasi();
        if (!giris) return false;
        const dist = Math.hypot(point.x - giris.x, point.y - giris.y);
        return dist < TOLERANCE;
    });
    if (cihazFleksi) {
        // // console.log('[PROTECTED] Cihaz fleks bağlantısı');
        return true;
    }

    // 5. Dirsek kontrolü (2+ boru bağlı nokta) - daha sıkı tolerance
    const DIRSEK_TOLERANCE = 10; // 10 cm
    const elbowConnectionTol = 1;
    const isDirsek = manager.pipes.some(otherPipe => {
        if (otherPipe === currentPipe) return false;

        for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
            // Eski pozisyonumuzsa atla
            if (oldPoint) {
                const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                if (distToOld < elbowConnectionTol) continue;
            }

            // Bu endpoint'e çok yakın mıyız?
            const distToEndpoint = Math.hypot(point.x - endpoint.x, point.y - endpoint.y);
            if (distToEndpoint >= DIRSEK_TOLERANCE) continue;

            // Bu endpoint bir dirsek mi? (2+ boru bağlı)
            const bagliBoruSayisi = manager.pipes.filter(p => {
                if (p === otherPipe) return false;
                const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                return d1 < elbowConnectionTol || d2 < elbowConnectionTol;
            }).length;

            if (bagliBoruSayisi >= 1) return true; // 2+ boru (otherPipe + en az 1 tane daha)
        }
        return false;
    });
    if (isDirsek) {
        // // console.log('[PROTECTED] Dirsek (2+ boru bağlı nokta)');
        return true;
    }

    // 6. Boşta boru ucu kontrolü - başka hiçbir boruya bağlı olmayan serbest uçlar
    // NOT: Bu kontrol SADECE endpoint drag için geçerli (boru çizerken atlanır)
    if (!skipBostaUcCheck) {
        const BOSTA_UC_TOLERANCE = 10; // 10 cm
        const bostaUc = manager.pipes.some(otherPipe => {
            if (otherPipe === currentPipe) return false;

            for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                // Eski bağlantımızsa atla
                if (oldPoint) {
                    const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                    if (distToOld < 1) continue;
                }

                // Bu endpoint'e yakın mıyız?
                const dist = Math.hypot(point.x - endpoint.x, point.y - endpoint.y);
                if (dist >= BOSTA_UC_TOLERANCE) continue;

                // Bu endpoint başka bir boruya bağlı mı kontrol et
                const connectedPipeCount = manager.pipes.filter(p => {
                    if (p === otherPipe || p === currentPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < 1 || d2 < 1;
                }).length;

                // Bağlı boru sayısı 0 ise (boştaysa), engelle
                if (connectedPipeCount === 0) return true;
            }
            return false;
        });
        if (bostaUc) {
            //  // console.log('[PROTECTED] Boşta boru ucu (bağlantısı olmayan serbest uç)');
            return true;
        }
    }

    return false;
}

/**
 * SHARED VERTEX (ORTAK KÖŞE) MANTIĞI
 * Bir noktada ucu bulunan TÜM boruları bulur (parent/child ayrımı yok!)
 *
 * @param {Array} pipes - Tüm borular
 * @param {Object} point - Nokta {x, y}
 * @param {Object} excludePipe - Hariç tutulacak boru (opsiyonel)
 * @param {number} tolerance - Mesafe toleransı (cm) - varsayılan olarak CONNECTED_PIPES_TOLERANCE kullanılır
 * @returns {Array} [{pipe, endpoint}, ...] - Bu noktada ucu olan tüm borular
 */
export function findPipesAtPoint(pipes, point, excludePipe = null, tolerance = TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
    const pipesAtPoint = [];

    pipes.forEach(pipe => {
        if (pipe === excludePipe) return;

        const distToP1 = Math.hypot(pipe.p1.x - point.x, pipe.p1.y - point.y);
        const distToP2 = Math.hypot(pipe.p2.x - point.x, pipe.p2.y - point.y);

        // P1 bu noktada mı?
        if (distToP1 < tolerance) {
            pipesAtPoint.push({ pipe, endpoint: 'p1' });
        }

        // P2 bu noktada mı?
        if (distToP2 < tolerance) {
            pipesAtPoint.push({ pipe, endpoint: 'p2' });
        }
    });

    return pipesAtPoint;
}

/**
 * SHARED VERTEX (ORTAK KÖŞE) GÜNCELLEME
 * Eski noktadaki TÜM boru uçlarını yeni noktaya taşır
 *
 * ÖNEMLİ:
 * - SADECE eski noktadaki uçları taşır (recursive değil!)
 * - Bağlı boruların DİĞER uçları sabit kalır
 * - Böylece zincirleme bozulma olmaz
 *
 * @param {Array} pipes - Tüm borular
 * @param {Object} oldPoint - Eski nokta {x, y}
 * @param {Object} newPoint - Yeni nokta {x, y}
 * @param {Object} excludePipe - Hariç tutulacak boru (opsiyonel)
 */
export function updateSharedVertex(pipes, oldPoint, newPoint, excludePipe = null) {
    // Eski noktada ucu olan tüm boruları bul - SENKRON tolerance kullan
    const pipesAtPoint = findPipesAtPoint(pipes, oldPoint, excludePipe, TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE);

    // Her borunun sadece o ucunu yeni noktaya taşı
    pipesAtPoint.forEach(({ pipe, endpoint }) => {
        pipe[endpoint].x = newPoint.x;
        pipe[endpoint].y = newPoint.y;
    });

    // // console.log(`[SHARED VERTEX] ${pipesAtPoint.length} boru ucu güncellendi: (${oldPoint.x},${oldPoint.y}) -> (${newPoint.x},${newPoint.y})`);
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

    // SHARED VERTEX: Bağlı boruları ÖNCEDENtespit et ve kaydet (hızlı drag için)
    // Sürüklenen uç noktadaki TÜM bağlı boruları bul ve referanslarını sakla
    const draggedPoint = endpoint === 'p1' ? pipe.p1 : pipe.p2;

    // 🚨 KRİTİK: Bu boru bir sayacın GİRİŞ borusuysa, ÇIKIŞ borusunu EXCLUDE et!
    // Aksi halde çıkış borusu da "bağlı boru" olarak algılanır ve giriş borusuyla birlikte hareket eder
    const connectedMeter = interactionManager.manager.components.find(c =>
        c.type === 'sayac' &&
        c.fleksBaglanti &&
        c.fleksBaglanti.boruId === pipe.id &&
        c.fleksBaglanti.endpoint === endpoint
    );

    // 🚨 KRİTİK: Bu boru bir cihazın GİRİŞ borusuysa da aynı mantık!
    const connectedDevice = interactionManager.manager.components.find(c =>
        c.type === 'cihaz' &&
        c.fleksBaglanti &&
        c.fleksBaglanti.boruId === pipe.id &&
        c.fleksBaglanti.endpoint === endpoint
    );

    let excludePipes = [pipe];
    if (connectedMeter && connectedMeter.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
        if (cikisBoru) {
            excludePipes.push(cikisBoru);
            // // console.log('[ENDPOINT DRAG] Sayaç giriş borusu - çıkış borusu exclude edildi');
        }
    }

    // Cihaz için exclude mantığı yok çünkü cihazların çıkış borusu yok (sadece giriş var)

    // Bağlı boruları bul (çıkış borusu exclude edilmiş)
    // --- Daha sağlam connected pipes tespiti: sürüklenen borunun HER İKİ ucunu referans al ---
    const connectedPipes = [];
    const seen = new Set();
    const referencePoints = [
        { x: pipe.p1.x, y: pipe.p1.y },
        { x: pipe.p2.x, y: pipe.p2.y }
    ];

    interactionManager.manager.pipes.forEach(p => {
        if (excludePipes.includes(p)) return;

        for (const ref of referencePoints) {
            const distToP1 = Math.hypot(p.p1.x - ref.x, p.p1.y - ref.y);
            const distToP2 = Math.hypot(p.p2.x - ref.x, p.p2.y - ref.y);

            if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
                const key = `${p.id}-p1`;
                if (!seen.has(key)) {
                    connectedPipes.push({ pipe: p, endpoint: 'p1' });
                    seen.add(key);
                }
                break;
            }
            if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
                const key = `${p.id}-p2`;
                if (!seen.has(key)) {
                    connectedPipes.push({ pipe: p, endpoint: 'p2' });
                    seen.add(key);
                }
                break;
            }
        }
    });

    interactionManager.connectedPipesAtEndpoint = connectedPipes;

    // // console.log(`[ENDPOINT DRAG START] ${interactionManager.connectedPipesAtEndpoint.length} bağlı boru tespit edildi (tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)`);
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
        // // console.log('Vana sürükleme başladı - Bağlı boru:', interactionManager.dragObjectPipe?.id);
    } else {
        interactionManager.dragObjectPipe = null;
        interactionManager.dragObjectsOnPipe = null;
    }

    // SHARED VERTEX: Servis kutusu için bağlı boruları ÖNCEDEN tespit et (lazy değil!)
    if (obj.type === 'servis_kutusu' && obj.bagliBoruId) {
        const boru = interactionManager.manager.pipes.find(p => p.id === obj.bagliBoruId);
        if (boru) {
            interactionManager.servisKutusuConnectedPipes = findPipesAtPoint(
                interactionManager.manager.pipes,
                boru.p1,  // ŞU ANKİ pozisyon (henüz hareket etmedi)
                boru,
                TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE  // SENKRON tolerance
            );
            // console.log(`[SERVIS KUTUSU START] ${interactionManager.servisKutusuConnectedPipes.length} bağlı boru tespit edildi (tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)[...]
        }
    }

    // SHARED VERTEX: Sayaç için bağlı boruları ÖNCEDEN tespit et (lazy değil!)
    if (obj.type === 'sayac' && obj.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
        if (cikisBoru) {
            // 🚨 KRİTİK: Çıkış hattını cache'lerken GİRİŞ hattını EXCLUDE et
            // Aksi halde sayaç hareket edince giriş ve çıkış hatları birbirine yapışır!
            const girisBoru = obj.fleksBaglanti?.boruId
                ? interactionManager.manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId)
                : null;

            const excludePipes = [cikisBoru];
            if (girisBoru) excludePipes.push(girisBoru);

            const outputConnectedPipes = [];
            interactionManager.manager.pipes.forEach(p => {
                if (excludePipes.includes(p)) return;

                const distToP1 = Math.hypot(p.p1.x - cikisBoru.p1.x, p.p1.y - cikisBoru.p1.y);
                const distToP2 = Math.hypot(p.p2.x - cikisBoru.p1.x, p.p2.y - cikisBoru.p1.y);

                if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
                    outputConnectedPipes.push({ pipe: p, endpoint: 'p1' });
                }
                if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
                    outputConnectedPipes.push({ pipe: p, endpoint: 'p2' });
                }
            });

            interactionManager.sayacConnectedPipes = outputConnectedPipes;
            // console.log(`[SAYAC START] ${interactionManager.sayacConnectedPipes.length} bağlı boru tespit edildi (giriş hattı exclude edildi)`);
        }
    }
}

[...] 

// Note: remaining file content is unchanged from the original. (Kept here for clarity when applying patch.)
