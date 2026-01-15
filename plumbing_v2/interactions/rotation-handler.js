/**
 * Rotation Handler
 * Döndürme işlemlerini yönetir
 */

import { saveState } from '../../general-files/history.js';
import { findPipesAtPoint } from './drag-handler.js';
import { TESISAT_CONSTANTS } from './tesisat-snap.js';

/**
 * Döndürme tutamacını bul (çubuğun ucundaki daire) - yukarı yönde
 */
export function findRotationHandleAt(obj, point, tolerance = 8) {
    if (!obj) return false;
    if (obj.type !== 'servis_kutusu' && obj.type !== 'cihaz' && obj.type !== 'sayac') return false;

    let handleLength;
    if (obj.type === 'servis_kutusu') {
        const SERVIS_KUTUSU_CONFIG = { width: 40, height: 20 };
        handleLength = SERVIS_KUTUSU_CONFIG.height / 2 + 20;
    } else if (obj.type === 'cihaz') {
        // Cihaz için: 30 cm çapında, handle 20 cm yukarıda (yarıya düşürüldü)
        handleLength = 15 + 20; // radius + 20cm = 35cm
    } else if (obj.type === 'sayac') {
        // Sayaç için: handle merkezden yukarıda
        handleLength = - 20; // 12 + 20 = 32cm
    }

    // Tutamacın world pozisyonunu hesapla (yukarı yönde, rotation dikkate alınarak)
    // Local: (0, -handleLength) → World: dönüşüm matrisi uygula
    const rad = (obj.rotation || 0) * Math.PI / 180;
    const handleX = obj.x + handleLength * Math.sin(rad);
    const handleY = obj.y - handleLength * Math.cos(rad);

    const dist = Math.hypot(point.x - handleX, point.y - handleY);
    return dist < tolerance;
}

/**
 * Döndürme başlat
 */
export function startRotation(context, obj, point, manager) {
    saveState();
    context.isRotating = true;
    context.dragObject = obj;

    // Merkez noktası
    const center = { x: obj.x, y: obj.y };

    // Başlangıç açısını hesapla
    const initialAngle = Math.atan2(point.y - center.y, point.x - center.x);
    const initialRotationRad = (obj.rotation || 0) * Math.PI / 180;
    context.rotationOffset = initialRotationRad - initialAngle;

    // SHARED VERTEX: Bağlı boruları ÖNCEDENtespit et ve kaydet (hızlı rotation için)
    context.rotationConnectedPipes = null;
    if (obj.type === 'sayac' && obj.cikisBagliBoruId) {
        const cikisBoru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
        if (cikisBoru) {
            // 🚨 KRİTİK: Giriş borusunu EXCLUDE et, aksi halde döndürme sırasında
            // giriş ve çıkış boruları birbirine yapışır (sadece 10cm aralık var, tolerance 20cm!)
            const girisBoru = obj.fleksBaglanti?.boruId
                ? manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId)
                : null;

            const excludePipes = [cikisBoru];
            if (girisBoru) excludePipes.push(girisBoru);

            // Çıkış noktasındaki bağlı boruları bul (giriş ve çıkış boruları hariç)
            const outputConnectedPipes = [];
            manager.pipes.forEach(p => {
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

            context.rotationConnectedPipes = outputConnectedPipes;
            console.log(`[ROTATION START] ${context.rotationConnectedPipes.length} bağlı boru tespit edildi (giriş hattı exclude edildi, tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)`);
        }
    }
}

/**
 * Döndürme işle
 */
export function handleRotation(context, point, manager) {
    if (!context.dragObject) return;

    const obj = context.dragObject;
    const center = { x: obj.x, y: obj.y };

    // Yeni açıyı hesapla
    const mouseAngle = Math.atan2(point.y - center.y, point.x - center.x);
    let newRotationRad = mouseAngle + context.rotationOffset;

    // 1 derecelik snap
    const snapAngleRad = (1 * Math.PI / 180);
    newRotationRad = Math.round(newRotationRad / snapAngleRad) * snapAngleRad;
    let newRotationDeg = newRotationRad * 180 / Math.PI;

    // 90 dereceye snap (5 derece threshold)
    const remainder = newRotationDeg % 90;
    const snapThreshold = 5;
    if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
        newRotationDeg = Math.round(newRotationDeg / 90) * 90;
    }

    if (obj.type === 'servis_kutusu') {
        // ÖNEMLI: Çıkış noktası sabit kalmalı, kutu merkezi hareket etmeli
        // Eski çıkış noktasını kaydet
        const eskiCikis = obj.getCikisNoktasi();

        // Rotasyonu değiştir
        obj.rotation = newRotationDeg;

        // Yeni çıkış noktasını hesapla
        const yeniCikis = obj.getCikisNoktasi();

        // Kutu merkezini ayarla (çıkış noktası sabit kalsın)
        obj.x += eskiCikis.x - yeniCikis.x;
        obj.y += eskiCikis.y - yeniCikis.y;

        // Bağlı boruyu güncelle (çıkış noktası değişmedi, güncellemeye gerek yok)
        // Ama yine de çağıralım, emin olmak için
        if (obj.bagliBoruId) {
            const boru = manager.pipes.find(p => p.id === obj.bagliBoruId);
            if (boru) {
                boru.moveP1(obj.getCikisNoktasi());
            }
        }
    } else if (obj.type === 'cihaz') {
        // Cihaz: Merkez sabit, sadece rotation değişir
        // Açıyı 0-360 aralığına normalize et
        let normalizedRotation = newRotationDeg % 360;
        if (normalizedRotation < 0) normalizedRotation += 360;
        obj.rotation = normalizedRotation;

        // Fleks artık her render'da borudan koordinat okuyor
        // Döndürme sonrası ekstra güncelleme gerekmiyor
    } else if (obj.type === 'sayac') {
        // Sayaç: Merkez sabit, rotation değişir
        let normalizedRotation = newRotationDeg % 360;
        if (normalizedRotation < 0) normalizedRotation += 360;
        obj.rotation = normalizedRotation;

        // Çıkış borusunu güncelle (çıkış noktası döndükçe değişir)
        if (obj.cikisBagliBoruId) {
            const cikisBoru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
            if (cikisBoru) {
                // Sayaç çıkışı boru p1'e bağlı
                const yeniCikis = obj.getCikisNoktasi();
                cikisBoru.moveP1(yeniCikis);

                // SHARED VERTEX: Başlangıçta tespit edilen bağlı boruları güncelle (HIZLI ROTATION!)
                if (context.rotationConnectedPipes) {
                    context.rotationConnectedPipes.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                        connectedPipe[connectedEndpoint].x = yeniCikis.x;
                        connectedPipe[connectedEndpoint].y = yeniCikis.y;
                    });
                }
            }
        }
    }
}

/**
 * Döndürme bitir
 */
export function endRotation(context, manager) {
    context.isRotating = false;
    context.dragObject = null;
    context.rotationOffset = 0;
    context.rotationConnectedPipes = null; // Bağlantı referanslarını temizle
    manager.saveToState();
    saveState(); // Save to undo history
}

/**
 * Bağlı boruyu güncelle
 * NOT: Bu fonksiyon artık kullanılmıyor, rotation-handler içinde direkt yapılıyor
 */
export function updateConnectedPipe(result, manager) {
    if (!result) return;

    // Bu fonksiyon eski implementasyondan kaldı
    // Şimdilik boş bırakıyoruz, gerekirse silinebilir
    console.warn('[DEPRECATED] updateConnectedPipe kullanılıyor, yeni implementasyonu kullanın');
}

/**
 * Helper: Bir noktayı origin etrafında döndür
 */
function rotatePoint(point, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos
    };
}

/**
 * Boru bağlantı noktalarını SABİT tutarak bileşeni döndür
 * "ÇAMAŞIR MANDAL" rotasyonu: İki uç nokta (boru bağlantıları) sabit kalır,
 * ortadaki parça (sayaç/cihaz + fleks) bu iki nokta arasında döner.
 *
 * @param {Object} obj - Döndürülecek nesne (sayac veya cihaz)
 * @param {Object} manager - PlumbingManager instance
 * @param {number} angleDelta - Döndürme açısı (derece, varsayılan: 90)
 */
export function rotateComponentFixedPivots(obj, manager, angleDelta = 90) {
    if (!obj || (obj.type !== 'sayac' && obj.type !== 'cihaz')) {
        console.warn('[FIXED PIVOT] Sadece sayaç ve cihaz döndürülebilir');
        return;
    }

    saveState();

    // Mevcut giriş ve çıkış noktalarını kaydet
    const P1 = obj.getGirisNoktasi(); // Giriş (fleks bağlantısı)

    if (obj.type === 'sayac') {
        // SAYAÇ: İki noktalı rotasyon (giriş ve çıkış sabit)
        const P2 = obj.getCikisNoktasi(); // Çıkış (rijit boru)

        console.log(`[FIXED PIVOT] Sayaç döndürülüyor: ${angleDelta}°`);
        console.log(`  P1 (giriş): (${P1.x.toFixed(1)}, ${P1.y.toFixed(1)})`);
        console.log(`  P2 (çıkış): (${P2.x.toFixed(1)}, ${P2.y.toFixed(1)})`);

        // Eski ve yeni rotasyon (radyan)
        const oldRotRad = obj.rotation * Math.PI / 180;
        const newRotRad = (obj.rotation + angleDelta) * Math.PI / 180;

        // Local koordinatlar (sayaç merkezine göre)
        const girisLocal = obj.getGirisLocalKoordinat();
        const cikisLocal = obj.getCikisLocalKoordinat();

        // Yeni rotasyonda local koordinatların world pozisyonları (merkez 0,0'da)
        const newGirisWorld = rotatePoint(girisLocal, newRotRad);
        const newCikisWorld = rotatePoint(cikisLocal, newRotRad);

        // Yeni merkezi hesapla
        // Kısıt: P1 = newCenter + newGirisWorld
        // Kısıt: P2 = newCenter + newCikisWorld
        // İlk kısıttan: newCenter = P1 - newGirisWorld
        const newCenterFromP1 = {
            x: P1.x - newGirisWorld.x,
            y: P1.y - newGirisWorld.y
        };

        // İkinci kısıttan: newCenter = P2 - newCikisWorld
        const newCenterFromP2 = {
            x: P2.x - newCikisWorld.x,
            y: P2.y - newCikisWorld.y
        };

        // İki merkez hesabı arasındaki fark (ideal durumda sıfır olmalı)
        const centerDiff = Math.hypot(
            newCenterFromP1.x - newCenterFromP2.x,
            newCenterFromP1.y - newCenterFromP2.y
        );

        if (centerDiff > 1) {
            console.warn(`[FIXED PIVOT] Merkez hesapları arasında ${centerDiff.toFixed(2)} cm fark var!`);
            console.warn('  P1 ve P2 arası mesafe sayaç geometrisi ile uyumsuz olabilir');
            console.warn('  Yine de P1 bazlı merkez kullanılacak (fleks esnek)');
        }

        // P1 bazlı merkezi kullan (fleks esnek olduğu için uzayabilir)
        obj.x = newCenterFromP1.x;
        obj.y = newCenterFromP1.y;

        // Rotasyonu güncelle
        obj.rotation = (obj.rotation + angleDelta) % 360;
        if (obj.rotation < 0) obj.rotation += 360;

        console.log(`  Yeni merkez: (${obj.x.toFixed(1)}, ${obj.y.toFixed(1)})`);
        console.log(`  Yeni rotasyon: ${obj.rotation.toFixed(1)}°`);

        // Çıkış noktasını kontrol et
        const newCikisCheck = obj.getCikisNoktasi();
        const distToP2 = Math.hypot(newCikisCheck.x - P2.x, newCikisCheck.y - P2.y);

        if (distToP2 > 0.1) {
            console.log(`  ⚠ Çıkış noktası ${distToP2.toFixed(2)} cm kaydı (fleks telafi eder)`);
        }

        // Çıkış borusunu güncelle
        if (obj.cikisBagliBoruId) {
            const cikisBoru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
            if (cikisBoru) {
                cikisBoru.moveP1(newCikisCheck);
                console.log('  ✓ Çıkış borusu güncellendi');
            }
        }

        // Fleks uzunluğunu güncelle
        if (obj.fleksBaglanti?.boruId) {
            const girisBoru = manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId);
            if (girisBoru) {
                const baglantiNoktasi = obj.getFleksBaglantiNoktasi(girisBoru);
                const yeniFleksUzunluk = Math.hypot(
                    P1.x - baglantiNoktasi.x,
                    P1.y - baglantiNoktasi.y
                );
                obj.fleksBaglanti.uzunluk = yeniFleksUzunluk;
                console.log(`  ✓ Fleks uzunluğu güncellendi: ${yeniFleksUzunluk.toFixed(1)} cm`);
            }
        }

    } else if (obj.type === 'cihaz') {
        // CİHAZ: Tek noktalı rotasyon (sadece giriş var, giriş sabit kalır)
        console.log(`[FIXED PIVOT] Cihaz döndürülüyor: ${angleDelta}°`);
        console.log(`  P1 (giriş): (${P1.x.toFixed(1)}, ${P1.y.toFixed(1)})`);

        // Eski giriş pozisyonu
        const oldGirisWorld = obj.localToWorld(obj.getGirisLocalKoordinat());

        // Rotasyonu güncelle
        obj.rotation = (obj.rotation + angleDelta) % 360;
        if (obj.rotation < 0) obj.rotation += 360;

        // Yeni giriş pozisyonunu hesapla (merkez henüz eski)
        const newGirisWorld = obj.localToWorld(obj.getGirisLocalKoordinat());

        // Merkezi ayarla (giriş noktası sabit kalsın)
        obj.x += (oldGirisWorld.x - newGirisWorld.x);
        obj.y += (oldGirisWorld.y - newGirisWorld.y);

        console.log(`  Yeni merkez: (${obj.x.toFixed(1)}, ${obj.y.toFixed(1)})`);
        console.log(`  Yeni rotasyon: ${obj.rotation.toFixed(1)}°`);

        // Giriş offset'ini yeniden hesapla (en yakın kenar)
        if (obj.fleksBaglanti?.boruId) {
            const girisBoru = manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId);
            if (girisBoru) {
                const baglantiNoktasi = obj.getFleksBaglantiNoktasi(girisBoru);
                obj.yenidenHesaplaGirisOffset(baglantiNoktasi);
                obj.fleksGuncelle(baglantiNoktasi);
                console.log(`  ✓ Fleks güncellendi: ${obj.fleksBaglanti.uzunluk.toFixed(1)} cm`);
            }
        }
    }

    manager.saveToState();
    saveState();
    console.log('[FIXED PIVOT] ✓ Döndürme tamamlandı');
}
