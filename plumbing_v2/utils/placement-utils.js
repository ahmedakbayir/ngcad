/**
 * Nesne Yerleştirme Yardımcı Fonksiyonları
 * Vana ve diğer nesnelerin boru üzerine eklenmesi için mesafe kontrolü
 */

import { PLUMBING_CONSTANTS } from '../plumbing-types.js';

/**
 * Boru üzerine nesne yerleştirme kontrolü
 * @param {Boru} pipe - Hedef boru
 * @param {object} clickPoint - Tıklanan nokta {x, y}
 * @param {number} objectWidth - Nesne genişliği (cm)
 * @param {Array} existingObjects - Boru üzerindeki mevcut nesneler [{t, width}, ...]
 * @returns {object|null} - {t, x, y, adjusted} veya null (eklenemez)
 */
export function canPlaceObjectOnPipe(pipe, clickPoint, objectWidth, existingObjects = []) {
    if (!pipe || !clickPoint) return null;

    const { MIN_EDGE_DISTANCE, OBJECT_MARGIN } = PLUMBING_CONSTANTS;

    // Tıklanan noktayı boru üzerine projekte et
    const proj = pipe.projectPoint(clickPoint);
    if (!proj || !proj.onSegment) {
        return null;
    }

    const pipeLength = pipe.uzunluk;
    const clickT = proj.t;

    // Nesne için gereken minimum toplam mesafe
    const requiredSpace = OBJECT_MARGIN + objectWidth + OBJECT_MARGIN; // 2cm + width + 2cm

    // Boru uçlarından minimum mesafe kontrolü
    const minT = MIN_EDGE_DISTANCE / pipeLength;
    const maxT = 1 - (MIN_EDGE_DISTANCE / pipeLength);

    // Boru çok kısa mı?
    if (pipeLength < (2 * MIN_EDGE_DISTANCE + requiredSpace)) {
        return {
            error: true,
            message: `Nesne eklemek için yeterli mesafe yok. Gerekli mesafe: ${(2 * MIN_EDGE_DISTANCE + requiredSpace).toFixed(1)} cm`
        };
    }

    // İdeal pozisyon hesapla (tıklanan nokta merkez olacak şekilde)
    let idealT = clickT;
    const halfObjectWidth = objectWidth / 2;

    // Nesnenin sol ve sağ uçları için t değerleri
    const leftEdgeT = Math.max(0, clickT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength);
    const rightEdgeT = Math.min(1, clickT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength);

    // Uçlardan minimum mesafe kontrolü
    if (leftEdgeT < minT || rightEdgeT > maxT) {
        // Kaydırma gerekiyor mu?
        const availableStart = minT;
        const availableEnd = maxT;
        const requiredT = requiredSpace / pipeLength;

        if (requiredT > (availableEnd - availableStart)) {
            return {
                error: true,
                message: `Nesne eklemek için yeterli mesafe yok. Gerekli mesafe: ${requiredSpace.toFixed(1)} cm`
            };
        }

        // Tıklanan noktaya yakın bir yer bul
        if (clickT < minT + requiredT / 2) {
            // Sol tarafa çok yakın, sağa kaydır
            idealT = minT + requiredT / 2;
        } else if (clickT > maxT - requiredT / 2) {
            // Sağ tarafa çok yakın, sola kaydır
            idealT = maxT - requiredT / 2;
        } else {
            // Orta bölgede, tıklanan noktayı kullan
            idealT = clickT;
        }
    }

    // Mevcut nesnelerle çakışma kontrolü ve otomatik kaydırma
    let attempts = 0;
    const MAX_ATTEMPTS = 10; // Sonsuz döngüyü önlemek için

    while (attempts < MAX_ATTEMPTS) {
        let hasCollision = false;

        // Nesnenin sol ve sağ uçlarını hesapla (margin dahil)
        let newLeftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
        let newRightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;

        // Önce boru sınırlarını kontrol et - sınır dışındaysa içeri kaydır
        if (newLeftT < minT) {
            // Sol tarafa taşıyor, sağa kaydır
            idealT = minT + (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
            newLeftT = minT;
            newRightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;
        }
        if (newRightT > maxT) {
            // Sağ tarafa taşıyor, sola kaydır
            idealT = maxT - (halfObjectWidth + OBJECT_MARGIN) / pipeLength;
            newLeftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
            newRightT = maxT;
        }

        // Tekrar sınır kontrolü - kaydırma sonrası hala sınır dışındaysa hata ver
        if (newLeftT < minT || newRightT > maxT) {
            return {
                error: true,
                message: 'Nesne boru sınırları içine sığmıyor. Gerekli mesafe: ' + requiredSpace.toFixed(1) + ' cm'
            };
        }

        // Mevcut nesnelerle çakışma kontrolü
        for (const obj of existingObjects) {
            const objLeftT = obj.t - (OBJECT_MARGIN + obj.width / 2) / pipeLength;
            const objRightT = obj.t + (obj.width / 2 + OBJECT_MARGIN) / pipeLength;

            // Çakışma var mı?
            if (!(newRightT < objLeftT || newLeftT > objRightT)) {
                // Çakışma var! En yakın uygun pozisyonu bul
                hasCollision = true;

                // Sol tarafına mı yoksa sağ tarafına mı daha yakınız?
                const distToLeft = Math.abs(idealT - objLeftT);
                const distToRight = Math.abs(idealT - objRightT);

                if (distToLeft < distToRight) {
                    // Sol tarafa kaydır (nesnenin soluna)
                    idealT = objLeftT - (halfObjectWidth + OBJECT_MARGIN) / pipeLength;
                } else {
                    // Sağ tarafa kaydır (nesnenin sağına)
                    idealT = objRightT + (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
                }

                // Bu nesneyle çakışma çözüldü, ama başka nesnelerle çakışma olabilir
                // Döngüyü tekrarla
                break;
            }
        }

        // Hiç çakışma yoksa döngüden çık
        if (!hasCollision) {
            break;
        }

        attempts++;
    }

    // Maksimum deneme sayısına ulaşıldıysa hata ver
    if (attempts >= MAX_ATTEMPTS) {
        return {
            error: true,
            message: 'Uygun pozisyon bulunamadı. Lütfen daha geniş bir boru seçin veya başka bir konum deneyin.'
        };
    }

    // Son kontrol: idealT hala sınırlar içinde mi?
    const finalLeftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
    const finalRightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;

    if (finalLeftT < minT || finalRightT > maxT) {
        return {
            error: true,
            message: 'Nesne boru sınırları içine yerleştirilemedi.'
        };
    }

    // Pozisyonu hesapla
    const position = pipe.getPointAt(idealT);

    return {
        error: false,
        t: idealT,
        x: position.x,
        y: position.y,
        adjusted: Math.abs(idealT - clickT) > 0.01 // Kaydırma yapıldı mı?
    };
}

/**
 * Boru üzerindeki mevcut nesneleri al
 * @param {Array} components - Tüm bileşenler
 * @param {string} pipeId - Boru ID
 * @returns {Array} - [{t, width}, ...]
 */
export function getObjectsOnPipe(components, pipeId) {
    if (!components || !pipeId) return [];

    return components
        .filter(comp => comp.bagliBoruId === pipeId && comp.boruPozisyonu !== null)
        .map(comp => ({
            id: comp.id,
            t: comp.boruPozisyonu,
            width: comp.config?.width || 6 // Varsayılan genişlik
        }));
}

/**
 * Vana için özel yerleştirme kontrolü
 * Vana boyutu: 6cm x 6cm (kare)
 */
export function canPlaceValveOnPipe(pipe, clickPoint, existingObjects = []) {
    const VALVE_WIDTH = 6; // cm
    return canPlaceObjectOnPipe(pipe, clickPoint, VALVE_WIDTH, existingObjects);
}
