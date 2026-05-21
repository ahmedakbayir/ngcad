// mahal-tanim / index.js
// "Mahal Tanım Hatası" grubu — adı "MAHAL" veya boş olan mahalleri tespit eder.
//
// Hata satırı: kat başına, eksik mahal sayısıyla.
// Çözüm: o katta auto-name kurallarını çalıştırır. Kullanıcının atadığı isimler
// (≠ "MAHAL" ve ≠ boş) korunur; sadece eksikler tamamlanır.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { nameFloor, countUnnamedByFloor } from './auto-name.js';
import { saveState } from '../../../../general-files/history.js';
import { draw2D } from '../../../../draw/draw2d.js';

function mahalTanimChecker() {
    const buckets = countUnnamedByFloor();
    if (!buckets.length) return [];

    return buckets.map(b => ({
        group:   ERROR_GROUP_IDS.MAHAL_TANIM,
        errorId: `mahal-tanim-${b.floorId ?? 'na'}`,
        message: `${b.floorName}: ${b.count} mahalin tanımı eksik`,
        source:  'proje gereği',
        detail:  'Tüm mahaller için mahal isimleri listeden seçilmeli (MUTFAK, SALON, ANTRE, YATAK ODASI vb.)  atanmalıdır.',
        targets: [], // Kat hedefi — şu an navigasyon yok; çözüm uygulanır.
        fix: {
            description: `${b.floorName}: eksik mahallere otomatik isim atanacak (kullanıcı atamaları korunur)`,
            apply: () => {
                try { saveState(); } catch (_) {}
                const n = nameFloor(b.floorId);
                if (n > 0) {
                    try { draw2D(); } catch (_) {}
                }
                return n > 0;
            },
        },
    }));
}

errorCheckManager.register('mahal-tanim', mahalTanimChecker);
