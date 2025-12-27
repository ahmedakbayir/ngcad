/**
 * Nesne Yerleştirme Yardımcı Fonksiyonları
 * Vana ve diğer nesnelerin boru üzerine eklenmesi için mesafe kontrolü
 */

import { PLUMBING_CONSTANTS } from '../../plumbing-types.js';

/**
 * Boru üzerine nesne yerleştirme kontrolü
 * @param {Boru} pipe - Hedef boru
 * @param {object} clickPoint - Tıklanan nokta {x, y}
 * @param {number} objectWidth - Nesne genişliği (cm)
 * @param {Array} existingObjects - Boru üzerindeki mevcut nesneler [{t, width}, ...]
 * @returns {object|null} - {t, x, y, adjusted} veya null (eklenemez)
 */
export function canPlaceObjectOnPipe(pipe, clickPoint, objectWidth, existingObjects = []) {
    if (!pipe || !clickPoint) {
        console.log('canPlaceObjectOnPipe: pipe veya clickPoint yok');
        return null;
    }

    const { MIN_EDGE_DISTANCE, OBJECT_MARGIN } = PLUMBING_CONSTANTS;

    // Tıklanan noktayı boru üzerine projekte et
    const proj = pipe.projectPoint(clickPoint);
    if (!proj || !proj.onSegment) {
        console.log('canPlaceObjectOnPipe: projeksiyon başarısız');
        return null;
    }

    const pipeLength = pipe.uzunluk;
    const clickT = proj.t;
    const halfObjectWidth = objectWidth / 2;

    console.log(`canPlaceObjectOnPipe: pipeLength=${pipeLength}, clickT=${clickT}, objectWidth=${objectWidth}`);

    // Nesne için gereken minimum toplam mesafe (margin dahil)
    const requiredSpace = OBJECT_MARGIN + objectWidth + OBJECT_MARGIN; // 2cm + width + 2cm

    // Boru uçlarından minimum mesafe için t değerleri
    const minT = MIN_EDGE_DISTANCE / pipeLength;
    const maxT = 1 - (MIN_EDGE_DISTANCE / pipeLength);

    // Nesnenin yerleşebileceği alan
    const availableLength = (maxT - minT) * pipeLength;

    console.log(`Gerekli alan: ${requiredSpace} cm, Mevcut alan: ${availableLength} cm`);

    // Boru çok kısa mı? (Nesne + margin'ler sığmıyor)
    if (availableLength < requiredSpace) {
        return {
            error: true,
            message: `Boru çok kısa! Gerekli: ${requiredSpace.toFixed(1)} cm, Mevcut: ${availableLength.toFixed(1)} cm`
        };
    }

    // İdeal pozisyon: Tıklanan nokta (nesne merkezi olarak)
    let idealT = clickT;

    // KURAL UYGULAMASI:
    // "Tıklanan nokta boş ama yeterli alan yoksa, toplam genişlik yeterli ise kaydır"

    // 1. Tıklanan noktanın nesne merkezinde olduğunu varsayarak sol ve sağ uçları hesapla
    let leftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
    let rightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;

    console.log(`İlk hesaplama - leftT: ${leftT}, rightT: ${rightT}, minT: ${minT}, maxT: ${maxT}`);

    // 2. Boru sınırlarını kontrol et ve gerekirse kaydır
    if (leftT < minT) {
        // Sol tarafa taşıyor - sağa kaydır
        console.log('Sol tarafa taşıyor, sağa kaydırılıyor');
        idealT = minT + (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
        leftT = minT;
        rightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;
    }

    if (rightT > maxT) {
        // Sağ tarafa taşıyor - sola kaydır
        console.log('Sağ tarafa taşıyor, sola kaydırılıyor');
        idealT = maxT - (halfObjectWidth + OBJECT_MARGIN) / pipeLength;
        leftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
        rightT = maxT;
    }

    // 3. Kaydırma sonrası tekrar kontrol - hala sınır dışındaysa hata
    if (leftT < minT || rightT > maxT) {
        console.log('Kaydırma sonrası hala sınır dışında!');
        return {
            error: true,
            message: `Nesne boru sınırları içine sığmıyor. Gerekli: ${requiredSpace.toFixed(1)} cm`
        };
    }

    console.log(`Kaydırma sonrası - idealT: ${idealT}, leftT: ${leftT}, rightT: ${rightT}`);

    // 4. Mevcut nesnelerle çakışma kontrolü ve kaydırma
    const MAX_ATTEMPTS = 20;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        let hasCollision = false;

        // Sol ve sağ uçları yeniden hesapla
        leftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
        rightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;

        console.log(`Deneme ${attempts}: idealT=${idealT}, leftT=${leftT}, rightT=${rightT}`);

        // Her nesne ile çakışma kontrolü
        for (const obj of existingObjects) {
            const objLeftT = obj.t - (OBJECT_MARGIN + obj.width / 2) / pipeLength;
            const objRightT = obj.t + (obj.width / 2 + OBJECT_MARGIN) / pipeLength;

            console.log(`  Nesne kontrol: objLeftT=${objLeftT}, objRightT=${objRightT}`);

            // Çakışma var mı?
            const overlap = !(rightT <= objLeftT || leftT >= objRightT);

            if (overlap) {
                hasCollision = true;
                console.log(`  ÇAKIŞMA! Sol tarafa mı sağ tarafa mı kaydır?`);

                // Tıklanan noktaya göre hangi tarafa kaydırmalı?
                const distToLeft = Math.abs(clickT - objLeftT);
                const distToRight = Math.abs(clickT - objRightT);

                console.log(`    distToLeft=${distToLeft}, distToRight=${distToRight}`);

                if (distToLeft < distToRight) {
                    // Sol tarafa kaydır (nesnenin soluna)
                    idealT = objLeftT - (halfObjectWidth + OBJECT_MARGIN) / pipeLength;
                    console.log(`    Sol tarafa kaydırıldı: yeni idealT=${idealT}`);
                } else {
                    // Sağ tarafa kaydır (nesnenin sağına)
                    idealT = objRightT + (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
                    console.log(`    Sağ tarafa kaydırıldı: yeni idealT=${idealT}`);
                }

                // Kaydırma sonrası sınır kontrolü
                const newLeftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
                const newRightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;

                if (newLeftT < minT || newRightT > maxT) {
                    console.log(`    Kaydırma sonrası sınır dışında! Uygun alan yok.`);
                    return {
                        error: true,
                        message: 'Bu bölgede başka nesneler var ve uygun boş alan bulunamadı.'
                    };
                }

                // Bu nesneyle çakışma çözüldü ama başka nesnelerle çakışma olabilir
                break;
            }
        }

        // Hiç çakışma yoksa çık
        if (!hasCollision) {
            console.log(`Çakışma yok! Uygun pozisyon bulundu: idealT=${idealT}`);
            break;
        }

        attempts++;
    }

    // Maksimum deneme aşıldıysa hata
    if (attempts >= MAX_ATTEMPTS) {
        console.log('Maksimum deneme sayısı aşıldı!');
        return {
            error: true,
            message: 'Uygun pozisyon bulunamadı (çok fazla nesne).'
        };
    }

    // Son kontrol: idealT sınırlar içinde mi?
    const finalLeftT = idealT - (OBJECT_MARGIN + halfObjectWidth) / pipeLength;
    const finalRightT = idealT + (halfObjectWidth + OBJECT_MARGIN) / pipeLength;

    if (finalLeftT < minT || finalRightT > maxT) {
        console.log('Final kontrol başarısız!');
        return {
            error: true,
            message: 'Nesne boru sınırları içine yerleştirilemedi.'
        };
    }

    // Pozisyonu hesapla
    const position = pipe.getPointAt(idealT);

    console.log(`BAŞARILI! idealT=${idealT}, position=(${position.x}, ${position.y})`);

    return {
        error: false,
        t: idealT,
        x: position.x,
        y: position.y,
        adjusted: Math.abs(idealT - clickT) > 0.001 // Kaydırma yapıldı mı?
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

    const objects = components
        .filter(comp => comp.bagliBoruId === pipeId && comp.boruPozisyonu !== null && comp.boruPozisyonu !== undefined)
        .map(comp => ({
            id: comp.id,
            t: comp.boruPozisyonu,
            width: comp.config?.width || 6 // Varsayılan genişlik
        }));

    console.log(`getObjectsOnPipe: pipeId=${pipeId}, found ${objects.length} objects`, objects);
    return objects;
}

/**
 * Vana için özel yerleştirme kontrolü
 * Vana boyutu: 6cm x 6cm (kare)
 */
export function canPlaceValveOnPipe(pipe, clickPoint, existingObjects = []) {
    const VALVE_WIDTH = 6; // cm
    console.log('=== canPlaceValveOnPipe BAŞLADI ===');
    const result = canPlaceObjectOnPipe(pipe, clickPoint, VALVE_WIDTH, existingObjects);
    console.log('=== canPlaceValveOnPipe BİTTİ ===', result);
    return result;
}
