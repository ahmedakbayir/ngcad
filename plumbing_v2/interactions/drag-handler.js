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
        console.log('[PROTECTED] Servis kutusu çıkışı');
        return true;
    }

    // 2. Sayaç giriş kontrolü (fleks bağlantısı)
    const sayacGirisi = manager.components.some(c => {
        if (c.type !== 'sayac' || !c.fleksBaglanti) return false;
        if (excludeComponentId && c.id === excludeComponentId) return false; // Yeni eklenen sayacı atla

        // Fleks bağlantı varsa, BORUNUN UCUNU koru
        if (c.fleksBaglanti.boruId && c.fleksBaglanti.endpoint) {
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
    if (sayacGirisi) {
        console.log('[PROTECTED] Sayaç girişi (fleks bağlantı)');
        return true;
    }

    // 3. Sayaç çıkışı kontrolü
    const sayacCikisi = manager.components.some(c => {
        if (c.type !== 'sayac') return false;
        if (excludeComponentId && c.id === excludeComponentId) return false; // Yeni eklenen sayacı atla
        const cikis = c.getCikisNoktasi();
        if (!cikis) return false;
        const dist = Math.hypot(point.x - cikis.x, point.y - cikis.y);
        return dist < TOLERANCE;
    });
    if (sayacCikisi) {
        console.log('[PROTECTED] Sayaç çıkışı');
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
        console.log('[PROTECTED] Cihaz fleks bağlantısı');
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
        console.log('[PROTECTED] Dirsek (2+ boru bağlı nokta)');
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
            console.log('[PROTECTED] Boşta boru ucu (bağlantısı olmayan serbest uç)');
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

    console.log(`[SHARED VERTEX] ${pipesAtPoint.length} boru ucu güncellendi: (${oldPoint.x},${oldPoint.y}) -> (${newPoint.x},${newPoint.y})`);
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
        c.fleksBaglanti.boruId === pipe.id
    );

    let excludePipes = [pipe];
    if (connectedMeter && connectedMeter.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
        if (cikisBoru) {
            excludePipes.push(cikisBoru);
            console.log('[ENDPOINT DRAG] Sayaç giriş borusu - çıkış borusu exclude edildi');
        }
    }

    // Bağlı boruları bul (çıkış borusu exclude edilmiş)
    const connectedPipes = [];
    interactionManager.manager.pipes.forEach(p => {
        if (excludePipes.includes(p)) return;

        const distToP1 = Math.hypot(p.p1.x - draggedPoint.x, p.p1.y - draggedPoint.y);
        const distToP2 = Math.hypot(p.p2.x - draggedPoint.x, p.p2.y - draggedPoint.y);

        if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
            connectedPipes.push({ pipe: p, endpoint: 'p1' });
        }
        if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
            connectedPipes.push({ pipe: p, endpoint: 'p2' });
        }
    });

    interactionManager.connectedPipesAtEndpoint = connectedPipes;

    console.log(`[ENDPOINT DRAG START] ${interactionManager.connectedPipesAtEndpoint.length} bağlı boru tespit edildi (tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)`);
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
            console.log(`[SERVIS KUTUSU START] ${interactionManager.servisKutusuConnectedPipes.length} bağlı boru tespit edildi (tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)`);
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
            console.log(`[SAYAC START] ${interactionManager.sayacConnectedPipes.length} bağlı boru tespit edildi (giriş hattı exclude edildi)`);
        }
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

    // CRITICAL DEBUG: Check if mouse position matches pipe position
    const mouseDistanceFromPipe = Math.min(
        Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y),
        Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y)
    );

    // DEBUG: Sürüklenen borunun detaylarını yazdır
    console.log(`[BODY DRAG START] Boru ID: ${pipe.id}`);
    console.log(`  BORU P1: (${pipe.p1.x.toFixed(1)}, ${pipe.p1.y.toFixed(1)})`);
    console.log(`  BORU P2: (${pipe.p2.x.toFixed(1)}, ${pipe.p2.y.toFixed(1)})`);
    console.log(`  FARE POS: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
    console.log(`  🎯 FARE ↔ BORU MESAFE: ${mouseDistanceFromPipe.toFixed(1)} cm`);
    if (mouseDistanceFromPipe > 5) {
        console.log(`  ⚠️⚠️⚠️  UYARI: Fare borudan ${mouseDistanceFromPipe.toFixed(1)} cm uzakta! (>5cm)`);
    }
    console.log(`  Toplam boru sayısı: ${interactionManager.manager.pipes.length}`);

    // CRITICAL DEBUG: Track if pipe object is being replaced between drags
    if (!window.__lastDraggedPipe) {
        window.__lastDraggedPipe = { pipe: null, positions: null };
    }
    if (window.__lastDraggedPipe.pipe === pipe) {
        console.log(`  ✓ Same pipe object as last drag`);
    } else if (window.__lastDraggedPipe.pipe && window.__lastDraggedPipe.pipe.id === pipe.id) {
        console.log(`  ⚠️ DIFFERENT pipe object with same ID! (OBJECT WAS REPLACED!)`);
        if (window.__lastDraggedPipe.positions) {
            const lastP1 = window.__lastDraggedPipe.positions.p1;
            const jumpX = Math.abs(pipe.p1.x - lastP1.x);
            const jumpY = Math.abs(pipe.p1.y - lastP1.y);
            console.log(`  ⚠️ Position jump from last exit: X=${jumpX.toFixed(1)} cm, Y=${jumpY.toFixed(1)} cm`);
        }
    }

    // DEBUG: Check for duplicate pipes with same ID
    const duplicates = interactionManager.manager.pipes.filter(p => p.id === pipe.id);
    if (duplicates.length > 1) {
        console.log(`  ⚠️ UYARI: ${duplicates.length} adet aynı ID'li boru bulundu!`);
        duplicates.forEach((dup, idx) => {
            console.log(`    [${idx}] P1: (${dup.p1.x.toFixed(1)}, ${dup.p1.y.toFixed(1)}), P2: (${dup.p2.x.toFixed(1)}, ${dup.p2.y.toFixed(1)})`);
        });
    }

    // 🚨 KRİTİK: Bu boru bir sayacın GİRİŞ borusuysa, ÇIKIŞ borusunu EXCLUDE et!
    // Aksi halde çıkış borusu da "bağlı boru" olarak algılanır ve giriş borusuyla birlikte hareket eder
    const connectedMeterForBody = interactionManager.manager.components.find(c =>
        c.type === 'sayac' &&
        c.fleksBaglanti &&
        c.fleksBaglanti.boruId === pipe.id
    );

    let excludePipesForBody = [pipe];
    if (connectedMeterForBody && connectedMeterForBody.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeterForBody.cikisBagliBoruId);
        if (cikisBoru) {
            excludePipesForBody.push(cikisBoru);
            console.log('[BODY DRAG] Sayaç giriş borusu - çıkış borusu exclude edildi');
        }
    }

    // SHARED VERTEX: P1 ve P2 noktalarındaki tüm boruları ÖNCEDENtespit et ve kaydet (çıkış borusu exclude)
    const connectedPipesAtP1 = [];
    const connectedPipesAtP2 = [];

    interactionManager.manager.pipes.forEach(p => {
        if (excludePipesForBody.includes(p)) return;

        // P1 kontrolü
        const distToP1FromP1 = Math.hypot(p.p1.x - pipe.p1.x, p.p1.y - pipe.p1.y);
        const distToP2FromP1 = Math.hypot(p.p2.x - pipe.p1.x, p.p2.y - pipe.p1.y);
        if (distToP1FromP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
            connectedPipesAtP1.push({ pipe: p, endpoint: 'p1' });
        }
        if (distToP2FromP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
            connectedPipesAtP1.push({ pipe: p, endpoint: 'p2' });
        }

        // P2 kontrolü
        const distToP1FromP2 = Math.hypot(p.p1.x - pipe.p2.x, p.p1.y - pipe.p2.y);
        const distToP2FromP2 = Math.hypot(p.p2.x - pipe.p2.x, p.p2.y - pipe.p2.y);
        if (distToP1FromP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
            connectedPipesAtP2.push({ pipe: p, endpoint: 'p1' });
        }
        if (distToP2FromP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
            connectedPipesAtP2.push({ pipe: p, endpoint: 'p2' });
        }
    });

    interactionManager.connectedPipesAtP1 = connectedPipesAtP1;
    interactionManager.connectedPipesAtP2 = connectedPipesAtP2;

    console.log(`  P1: ${interactionManager.connectedPipesAtP1.length} bağlı, P2: ${interactionManager.connectedPipesAtP2.length} bağlı boru (tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)`);

    // 🔧 FIX: Bu boruya bağlı sayaç varsa, sayacın ÇIKIŞ hattındaki bağlı boruları da cache'le
    // Sorun: Sayaç GİRİŞ hattı hareket edince, sayaç hareket ediyor ama ÇIKIŞ hattı güncellenmiyor
    interactionManager.meterConnectedPipesAtOutput = null;

    // Bu boru bir sayacın giriş fleks bağlantısı mı kontrol et
    const connectedMeter = interactionManager.manager.components.find(c =>
        c.type === 'sayac' &&
        c.fleksBaglanti &&
        c.fleksBaglanti.boruId === pipe.id
    );

    if (connectedMeter && connectedMeter.cikisBagliBoruId) {
        const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
        if (cikisBoru) {
            // 🚨 KRİTİK: Çıkış hattını cache'lerken GİRİŞ hattını (şu an sürüklenen boru) EXCLUDE et
            // Aksi halde giriş ve çıkış hatları birbirine yapışır (aralarında sadece 10 cm var!)
            const excludePipes = [cikisBoru, pipe]; // Hem çıkış borusu hem giriş borusu exclude

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

            interactionManager.meterConnectedPipesAtOutput = outputConnectedPipes;
            console.log(`  [SAYAÇ ÇIKIŞ] ${interactionManager.meterConnectedPipesAtOutput.length} bağlı boru tespit edildi (giriş hattı exclude edildi)`);
        }
    }

    // DEBUG: Bağlı boruların mesafelerini yazdır
    if (interactionManager.connectedPipesAtP1.length > 0) {
        interactionManager.connectedPipesAtP1.forEach(({ pipe: connectedPipe, endpoint }) => {
            const dist = Math.hypot(pipe.p1.x - connectedPipe[endpoint].x, pipe.p1.y - connectedPipe[endpoint].y);
            console.log(`    [P1] Bağlı boru ${connectedPipe.id.substring(0,12)}... mesafe: ${dist.toFixed(2)} cm`);
        });
    }
    if (interactionManager.connectedPipesAtP2.length > 0) {
        interactionManager.connectedPipesAtP2.forEach(({ pipe: connectedPipe, endpoint }) => {
            const dist = Math.hypot(pipe.p2.x - connectedPipe[endpoint].x, pipe.p2.y - connectedPipe[endpoint].y);
            console.log(`    [P2] Bağlı boru ${connectedPipe.id.substring(0,12)}... mesafe: ${dist.toFixed(2)} cm`);
        });
    }

    // DEBUG: Eğer bağlı boru bulunamadıysa, tüm boruları kontrol et
    if (interactionManager.connectedPipesAtP1.length === 0 && interactionManager.connectedPipesAtP2.length === 0) {
        console.log(`  [WARNING] Hiç bağlı boru bulunamadı! P1/P2 yakınındaki tüm boruları kontrol ediyorum:`);
        interactionManager.manager.pipes.forEach(otherPipe => {
            if (otherPipe === pipe) return;
            const distP1toP1 = Math.hypot(pipe.p1.x - otherPipe.p1.x, pipe.p1.y - otherPipe.p1.y);
            const distP1toP2 = Math.hypot(pipe.p1.x - otherPipe.p2.x, pipe.p1.y - otherPipe.p2.y);
            const distP2toP1 = Math.hypot(pipe.p2.x - otherPipe.p1.x, pipe.p2.y - otherPipe.p1.y);
            const distP2toP2 = Math.hypot(pipe.p2.x - otherPipe.p2.x, pipe.p2.y - otherPipe.p2.y);

            const minDist = Math.min(distP1toP1, distP1toP2, distP2toP1, distP2toP2);
            if (minDist < 50) { // 50 cm içindeki boruları göster
                console.log(`    Boru ${otherPipe.id.substring(0,12)}... en yakın mesafe: ${minDist.toFixed(2)} cm`);
            }
        });
    }

    // ⚠️ DOĞRUSALLIK KONTROLÜ: Sadece 3 boru aynı doğrultudaysa ara boru modu
    interactionManager.useBridgeMode = false; // Varsayılan: normal mod

    if (interactionManager.connectedPipesAtP1.length === 1 && interactionManager.connectedPipesAtP2.length === 1) {
        // 3 boru var: A - B - C (B = sürüklenen boru)
        const pipeA = interactionManager.connectedPipesAtP1[0].pipe;
        const pipeC = interactionManager.connectedPipesAtP2[0].pipe;

        // pipeA'nın DİĞER ucunu bul (pipe.p1'e bağlı olmayan uç)
        const p1OfA = (Math.hypot(pipeA.p1.x - pipe.p1.x, pipeA.p1.y - pipe.p1.y) < 1) ? pipeA.p2 : pipeA.p1;

        // pipeC'nin DİĞER ucunu bul (pipe.p2'ye bağlı olmayan uç)
        const p2OfC = (Math.hypot(pipeC.p1.x - pipe.p2.x, pipeC.p1.y - pipe.p2.y) < 1) ? pipeC.p2 : pipeC.p1;

        const p1 = p1OfA;        // A'nın uzak ucu
        const p2 = pipe.p1;      // A-B bağlantı noktası
        const p3 = pipe.p2;      // B-C bağlantı noktası
        const p4 = p2OfC;        // C'nin uzak ucu

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

        // ⚠️ KRİTİK: Korumalı noktalara taşımayı engelle
        // (Servis kutusu çıkışı, sayaç giriş/çıkışı, cihaz fleksi, dirsek, boşta boru ucu)
        const isProtected = isProtectedPoint(finalPos, interactionManager.manager, pipe, oldPoint);
        if (isProtected) {
            console.warn('🚫 ENGEL: Boru ucu korumalı noktaya taşınamaz!', finalPos);
            return; // Taşımayı engelle - sessizce geri dön
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

            // Borunun kendi ucunu güncelle
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

            // SHARED VERTEX GÜNCELLEME - CACHED SİSTEM (KOPMA SORUNU ÇÖZÜLDÜ!)
            // startEndpointDrag içinde kaydettiğimiz listeyi kullanıyoruz.
            // Tekrar findPipesAtPoint çağırmıyoruz!
            if (interactionManager.connectedPipesAtEndpoint && interactionManager.connectedPipesAtEndpoint.length > 0) {
                interactionManager.connectedPipesAtEndpoint.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                    connectedPipe[connectedEndpoint].x = finalPos.x;
                    connectedPipe[connectedEndpoint].y = finalPos.y;
                });
            }
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

        // Kutu hareket etmeden ÖNCEKİ pozisyonunu kaydet
        const oldBoxX = interactionManager.dragObject.x;
        const oldBoxY = interactionManager.dragObject.y;
        const oldBoxRotation = interactionManager.dragObject.rotation;

        // Yakın duvara snap yap, yoksa serbest yerleştir
        // useBoxPosition=false ile mouse pozisyonuna göre snap yap (sürüklerken)
        if (closestWall && minDist < snapDistance) {
            interactionManager.dragObject.snapToWall(closestWall, point, false);
        } else {
            interactionManager.dragObject.placeFree(point);
        }

        // YENİ çıkış noktasını hesapla
        const newCikis = interactionManager.dragObject.getCikisNoktasi();

        // DİRSEK KORUMA: Yeni çıkış noktasının dirseklere olan mesafesini kontrol et
        const ELBOW_TOLERANCE = 8; // cm - dirsekler arası minimum mesafe
        const elbowConnectionTolerance = 1;
        let tooCloseToElbow = false;

        // Bağlı boruyu bul
        const bagliBoruId = interactionManager.dragObject.bagliBoruId;

        // Tüm boru uçlarını kontrol et
        for (const otherPipe of interactionManager.manager.pipes) {
            // Kendi bağlı borusunu atla
            if (bagliBoruId && otherPipe.id === bagliBoruId) continue;

            // Her iki ucunu kontrol et
            for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                const dist = Math.hypot(endpoint.x - newCikis.x, endpoint.y - newCikis.y);

                // Bu uç bir dirsek mi? (başka borulara bağlı mı?)
                const isElbow = interactionManager.manager.pipes.some(p => {
                    if (p === otherPipe) return false;
                    const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                    const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                    return d1 < elbowConnectionTolerance || d2 < elbowConnectionTolerance;
                });

                // Eğer dirsekse ve çok yakınsa, hareketi engelle
                if (isElbow && dist < ELBOW_TOLERANCE) {
                    tooCloseToElbow = true;
                    break;
                }
            }
            if (tooCloseToElbow) break;
        }

        // Eğer dirseğe çok yakınsa, kutuyu eski pozisyonuna geri al
        if (tooCloseToElbow) {
            interactionManager.dragObject.x = oldBoxX;
            interactionManager.dragObject.y = oldBoxY;
            interactionManager.dragObject.rotation = oldBoxRotation;
            return; // Hareketi engelle
        }

        // Bağlı boru zincirini güncelle - CACHED SİSTEM (KOPMA SORUNU ÇÖZÜLDÜ!)
        if (interactionManager.dragObject.bagliBoruId) {
            const boru = interactionManager.manager.pipes.find(p => p.id === interactionManager.dragObject.bagliBoruId);
            if (boru) {
                // Ana borunun ucunu yeni noktaya taşı (KUTU -> BORU)
                boru.p1.x = newCikis.x;
                boru.p1.y = newCikis.y;

                // O noktaya bağlı DİĞER boruları taşı (startDrag'da kaydettiklerimiz)
                // Her frame yeniden arama YAPMA! startDrag'da bulunanları kullan.
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

        // 🚨 GİRİŞ BORUSUNUN ESKİ POZİSYONUNU KAYDET
        // Sayaç hareket edince giriş borusu SABİT kalmalı (fleks uzasın/kısalsın)
        let inputPipeOldEndpoint = null;
        if (sayac.fleksBaglanti?.boruId && sayac.fleksBaglanti?.endpoint) {
            const girisBoru = interactionManager.manager.pipes.find(p => p.id === sayac.fleksBaglanti.boruId);
            if (girisBoru) {
                const endpoint = sayac.fleksBaglanti.endpoint;
                // Eski pozisyonu kaydet
                inputPipeOldEndpoint = {
                    pipe: girisBoru,
                    endpoint: endpoint,
                    x: girisBoru[endpoint].x,
                    y: girisBoru[endpoint].y
                };
            }
        }

        // Sayacı axis-locked pozisyona taşı (SMOOTH!)
        sayac.move(newX, newY);

        // 🚨 GİRİŞ BORUSUNU ESKİ POZİSYONUNA GERİ DÖNDÜR
        // Sayaç hareket etti ama giriş borusu sabit kalmalı
        if (inputPipeOldEndpoint) {
            inputPipeOldEndpoint.pipe[inputPipeOldEndpoint.endpoint].x = inputPipeOldEndpoint.x;
            inputPipeOldEndpoint.pipe[inputPipeOldEndpoint.endpoint].y = inputPipeOldEndpoint.y;
        }

        // Çıkış borusunu güncelle - CACHED SİSTEM (KOPMA SORUNU ÇÖZÜLDÜ!)
        // Sadece çıkış borusunun p1 ucunu güncelle, p2 ve bağlı borular sabit
        if (sayac.cikisBagliBoruId) {
            const cikisBoru = interactionManager.manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
            if (cikisBoru) {
                // Çıkış boru ucunu DELTA kadar taşı (giriş ile aynı mantık)
                cikisBoru.p1.x += dx;
                cikisBoru.p1.y += dy;

                // Yeni p1 pozisyonu
                const newP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                // O noktaya bağlı DİĞER boruları taşı (startDrag'da kaydettiklerimiz)
                // Her frame yeniden arama YAPMA! startDrag'da bulunanları kullan.
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

        // SHARED VERTEX: Bağlı borular (collision check için) - CACHED değerleri kullan
        const connectedPipes = [
            ...(interactionManager.connectedPipesAtP1 || []).map(c => c.pipe),
            ...(interactionManager.connectedPipesAtP2 || []).map(c => c.pipe)
        ];

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
        const p1Blocked = checkEndpointDistance(newP1, interactionManager.bodyDragInitialP1);
        const p2Blocked = checkEndpointDistance(newP2, interactionManager.bodyDragInitialP2);

        if (p1Blocked || p2Blocked) {
            console.log(`  [BODY DRAG] Hareket engellendi! P1: ${p1Blocked}, P2: ${p2Blocked}`);
            return; // Taşımayı engelle
        }

        console.log(`  [BODY DRAG] Pozisyon güncelleniyor...`);

        // Nokta boşsa pozisyonları uygula
        pipe.p1.x = newP1.x;
        pipe.p1.y = newP1.y;
        pipe.p2.x = newP2.x;
        pipe.p2.y = newP2.y;

        // Mod kontrolü: ARA BORU modu mu NORMAL mod mu?
        console.log(`  [BODY DRAG] Bridge Mode: ${interactionManager.useBridgeMode}`);

        if (interactionManager.useBridgeMode) {
            console.log(`  [BODY DRAG] ARA BORU MODU aktif - bağlı borular taşınmayacak`);
            // ✅ ARA BORU MODU: Bağlı boruları TAŞIMA, ara borular oluştur
            // Ghost ara boruları oluştur (preview için)
            interactionManager.ghostBridgePipes = [];
            const MIN_BRIDGE_LENGTH = 5; // 5 cm minimum (kısa hatlar için daha esnek)

            // p1 tarafı için ghost boru
            if (connectionsAtP1.length > 0) {
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
            if (connectionsAtP2.length > 0) {
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
            console.log(`  [BODY DRAG] NORMAL MOD aktif - bağlı borular cache'den taşınacak`);
            // ✅ NORMAL MOD: SHARED VERTEX mantığı ile güncelle - CACHED SİSTEM (KOPMA SORUNU ÇÖZÜLDÜ!)
            interactionManager.ghostBridgePipes = []; // Ghost yok

            // P1: startBodyDrag'da bulduğumuz bağlı boruları güncelle (cached yaklaşım!)
            if (interactionManager.connectedPipesAtP1 && interactionManager.connectedPipesAtP1.length > 0) {
                console.log(`  [BODY DRAG] P1: ${interactionManager.connectedPipesAtP1.length} bağlı boru güncelleniyor...`);
                interactionManager.connectedPipesAtP1.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                    const oldX = connectedPipe[connectedEndpoint].x;
                    const oldY = connectedPipe[connectedEndpoint].y;
                    connectedPipe[connectedEndpoint].x = newP1.x;
                    connectedPipe[connectedEndpoint].y = newP1.y;
                    console.log(`    Boru ${connectedPipe.id.substring(0,12)}... ${connectedEndpoint}: (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) → (${newP1.x.toFixed(1)}, ${newP1.y.toFixed(1)})`);
                });
            } else {
                console.log(`  [BODY DRAG] P1: Bağlı boru yok veya cache boş!`);
            }

            // P2: startBodyDrag'da bulduğumuz bağlı boruları güncelle (cached yaklaşım!)
            if (interactionManager.connectedPipesAtP2 && interactionManager.connectedPipesAtP2.length > 0) {
                console.log(`  [BODY DRAG] P2: ${interactionManager.connectedPipesAtP2.length} bağlı boru güncelleniyor...`);
                interactionManager.connectedPipesAtP2.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                    const oldX = connectedPipe[connectedEndpoint].x;
                    const oldY = connectedPipe[connectedEndpoint].y;
                    connectedPipe[connectedEndpoint].x = newP2.x;
                    connectedPipe[connectedEndpoint].y = newP2.y;
                    console.log(`    Boru ${connectedPipe.id.substring(0,12)}... ${connectedEndpoint}: (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) → (${newP2.x.toFixed(1)}, ${newP2.y.toFixed(1)})`);
                });
            } else {
                console.log(`  [BODY DRAG] P2: Bağlı boru yok veya cache boş!`);
            }

            // 🔧 FIX: Bu boru sayaç giriş hattıysa, sayacın ÇIKIŞ hattını da güncelle
            if (interactionManager.meterConnectedPipesAtOutput && interactionManager.meterConnectedPipesAtOutput.length > 0) {
                // Sayacı bul
                const connectedMeter = interactionManager.manager.components.find(c =>
                    c.type === 'sayac' &&
                    c.fleksBaglanti &&
                    c.fleksBaglanti.boruId === pipe.id
                );

                if (connectedMeter && connectedMeter.cikisBagliBoruId) {
                    const cikisBoru = interactionManager.manager.pipes.find(p => p.id === connectedMeter.cikisBagliBoruId);
                    if (cikisBoru) {
                        console.log(`  [SAYAÇ ÇIKIŞ] Sayaç çıkış hattı güncelleniyor (delta: ${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})...`);

                        // Çıkış borusunun p1'ini delta kadar taşı
                        cikisBoru.p1.x += offsetX;
                        cikisBoru.p1.y += offsetY;

                        const newOutputP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                        // O noktaya bağlı DİĞER boruları taşı (startBodyDrag'da kaydettiklerimiz)
                        interactionManager.meterConnectedPipesAtOutput.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                            const oldX = connectedPipe[connectedEndpoint].x;
                            const oldY = connectedPipe[connectedEndpoint].y;
                            connectedPipe[connectedEndpoint].x = newOutputP1.x;
                            connectedPipe[connectedEndpoint].y = newOutputP1.y;
                            console.log(`    [ÇIKIŞ] Boru ${connectedPipe.id.substring(0,12)}... ${connectedEndpoint}: (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) → (${newOutputP1.x.toFixed(1)}, ${newOutputP1.y.toFixed(1)})`);
                        });
                    }
                }
            }
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
    // CRITICAL DEBUG: Track pipe positions throughout endDrag
    const isBodyDragPipe = interactionManager.isBodyDrag && interactionManager.dragObject && interactionManager.dragObject.type === 'boru';
    if (isBodyDragPipe) {
        const pipe = interactionManager.dragObject;
        console.log(`[END DRAG] START - Boru ${pipe.id.substring(0,12)}...`);
        console.log(`  P1: (${pipe.p1.x.toFixed(1)}, ${pipe.p1.y.toFixed(1)}), P2: (${pipe.p2.x.toFixed(1)}, ${pipe.p2.y.toFixed(1)})`);
    }

    // Body drag bittiğinde ara borular oluştur
    if (interactionManager.isBodyDrag && interactionManager.dragObject && interactionManager.dragObject.type === 'boru') {
        const draggedPipe = interactionManager.dragObject;
        const oldP1 = interactionManager.bodyDragInitialP1;
        const oldP2 = interactionManager.bodyDragInitialP2;
        const newP1 = draggedPipe.p1;
        const newP2 = draggedPipe.p2;

        // DEBUG: Before bridge mode logic
        if (isBodyDragPipe) {
            console.log(`[END DRAG] BEFORE BRIDGE MODE - Boru ${draggedPipe.id.substring(0,12)}...`);
            console.log(`  P1: (${draggedPipe.p1.x.toFixed(1)}, ${draggedPipe.p1.y.toFixed(1)}), P2: (${draggedPipe.p2.x.toFixed(1)}, ${draggedPipe.p2.y.toFixed(1)})`);
            console.log(`  Bridge Mode: ${interactionManager.useBridgeMode ? 'ENABLED' : 'DISABLED'}`);
        }

        // ⚠️ Sadece BRIDGE MODE ise ara borular oluştur
        if (!interactionManager.useBridgeMode) {
            // Normal modda zaten updateSharedVertex çağrıldı
            // Hiçbir şey yapma
        } else {
            // Minimum mesafe kontrolü (ara boru oluşturmaya değer mi?)
            const MIN_BRIDGE_LENGTH = 5; // 5 cm minimum (kısa hatlar için daha esnek)

            // SHARED VERTEX: Başlangıçta kaydedilmiş bağlantıları kullan
            const p1Connections = interactionManager.connectedPipesAtP1 || [];
            const p2Connections = interactionManager.connectedPipesAtP2 || [];

            // p1 tarafına ara boru ekle
            if (p1Connections.length > 0) {
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
            if (p2Connections.length > 0) {
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

        // DEBUG: After bridge mode logic
        if (isBodyDragPipe) {
            console.log(`[END DRAG] AFTER BRIDGE MODE - Boru ${draggedPipe.id.substring(0,12)}...`);
            console.log(`  P1: (${draggedPipe.p1.x.toFixed(1)}, ${draggedPipe.p1.y.toFixed(1)}), P2: (${draggedPipe.p2.x.toFixed(1)}, ${draggedPipe.p2.y.toFixed(1)})`);
        }
    }

    // DEBUG: Before state cleanup (save pipe reference for later logging)
    let debugPipe = null;
    if (isBodyDragPipe) {
        debugPipe = interactionManager.dragObject;
        console.log(`[END DRAG] BEFORE STATE CLEANUP - Boru ${debugPipe.id.substring(0,12)}...`);
        console.log(`  P1: (${debugPipe.p1.x.toFixed(1)}, ${debugPipe.p1.y.toFixed(1)}), P2: (${debugPipe.p2.x.toFixed(1)}, ${debugPipe.p2.y.toFixed(1)})`);
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

    // SHARED VERTEX: Bağlantı referanslarını temizle
    interactionManager.connectedPipesAtEndpoint = null;
    interactionManager.connectedPipesAtP1 = null;
    interactionManager.connectedPipesAtP2 = null;
    interactionManager.servisKutusuConnectedPipes = null;
    interactionManager.sayacConnectedPipes = null;
    interactionManager.meterConnectedPipesAtOutput = null; // Sayaç çıkış hattı cache'i

    // Ghost borular ve snap verilerini temizle
    interactionManager.ghostBridgePipes = [];
    interactionManager.pipeEndpointSnapLock = null;
    interactionManager.pipeSnapMouseStart = null;

    // DEBUG: Before saveToState()
    if (debugPipe) {
        console.log(`[END DRAG] BEFORE saveToState() - Boru ${debugPipe.id.substring(0,12)}...`);
        console.log(`  P1: (${debugPipe.p1.x.toFixed(1)}, ${debugPipe.p1.y.toFixed(1)}), P2: (${debugPipe.p2.x.toFixed(1)}, ${debugPipe.p2.y.toFixed(1)})`);
    }

    interactionManager.manager.saveToState();

    // DEBUG: After saveToState()
    if (debugPipe) {
        console.log(`[END DRAG] AFTER saveToState() - Boru ${debugPipe.id.substring(0,12)}...`);
        console.log(`  P1: (${debugPipe.p1.x.toFixed(1)}, ${debugPipe.p1.y.toFixed(1)}), P2: (${debugPipe.p2.x.toFixed(1)}, ${debugPipe.p2.y.toFixed(1)})`);
    }

    // DEBUG: Before saveState() (undo history)
    if (debugPipe) {
        console.log(`[END DRAG] BEFORE saveState() - Boru ${debugPipe.id.substring(0,12)}...`);
        console.log(`  P1: (${debugPipe.p1.x.toFixed(1)}, ${debugPipe.p1.y.toFixed(1)}), P2: (${debugPipe.p2.x.toFixed(1)}, ${debugPipe.p2.y.toFixed(1)})`);
    }

    saveState(); // Save to undo history

    // DEBUG: Function exit
    if (debugPipe) {
        console.log(`[END DRAG] EXIT - Boru ${debugPipe.id.substring(0,12)}...`);
        console.log(`  P1: (${debugPipe.p1.x.toFixed(1)}, ${debugPipe.p1.y.toFixed(1)}), P2: (${debugPipe.p2.x.toFixed(1)}, ${debugPipe.p2.y.toFixed(1)})`);
        console.log('─'.repeat(80));

        // CRITICAL: Save pipe reference and positions for next drag comparison
        if (!window.__lastDraggedPipe) {
            window.__lastDraggedPipe = {};
        }
        window.__lastDraggedPipe.pipe = debugPipe;
        window.__lastDraggedPipe.positions = {
            p1: { x: debugPipe.p1.x, y: debugPipe.p1.y },
            p2: { x: debugPipe.p2.x, y: debugPipe.p2.y }
        };
    }
}
