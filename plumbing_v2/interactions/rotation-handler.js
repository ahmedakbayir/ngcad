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
