/**
 * Cihaz Bileşeni
 * Gaz cihazları - kullanıcı kurallarına göre tasarlanmış
 *
 * KURALLAR:
 * - Tek giriş, çıkış yok
 * - Daima hat ucunda, boşta olamaz
 * - Fleks ile bağlanır (en yakın noktadan temas)
 * - Vana yoksa cihaz vanası otomatik eklenir
 * - Cihaz tipine göre baca moduna geçilebilir
 * - Taşınabilir/döndürülebilir, fleks uzar/kısalır
 * - Sayaç sonrası hatta eklenebilir
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Cihaz Tipleri
export const CIHAZ_TIPLERI = {
    KOMBI: {
        id: 'KOMBI',
        name: 'Kombi',
        width: 40,
        height: 40,
        depth: 29,
        mountType: 'wall',
        bacaGerekli: true,
        color: 0xC0C0C0
    },
    OCAK: {
        id: 'OCAK',
        name: 'Ocak',
        width: 40,
        height: 40,
        depth: 59,
        mountType: 'floor',
        bacaGerekli: false,
        color: 0x808080
    },
    SOBA: {
        id: 'SOBA',
        name: 'Soba',
        width: 40,
        height: 40,
        depth: 60,
        mountType: 'floor',
        bacaGerekli: true,
        color: 0x8B4513
    },
    SOFBEN: {
        id: 'SOFBEN',
        name: 'Şofben',
        width: 35,
        height: 60,
        depth: 25,
        mountType: 'wall',
        bacaGerekli: true,
        color: 0xF5F5F5
    },
    KAZAN: {
        id: 'KAZAN',
        name: 'Kazan',
        width: 80,
        height: 100,
        depth: 80,
        mountType: 'floor',
        bacaGerekli: true,
        color: 0x696969
    },
    TICARI: {
        id: 'TICARI',
        name: 'Ticari Cihaz',
        width: 100,
        height: 100,
        depth: 100,
        mountType: 'floor',
        bacaGerekli: true,
        color: 0x4682B4
    }
};

// Fleks Sabitleri
export const FLEKS_CONFIG = {
    minUzunluk: 10,     // cm
    maxUzunluk: 150,    // cm
    defaultUzunluk: 30, // cm
    renk: 0xFFD700,     // Sarı
    kalinlik: 2
};

export class Cihaz {
    constructor(x, y, tip = 'KOMBI', options = {}) {
        this.id = `cihaz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'cihaz';

        // Pozisyon
        this.x = x;
        this.y = y;
        this.rotation = 0; // derece

        // Cihaz tipi
        this.cihazTipi = tip;
        this.config = CIHAZ_TIPLERI[tip] || CIHAZ_TIPLERI.KOMBI;
        this.floorId = options.floorId || null;

        // Fleks bağlantısı
        this.fleksBaglanti = {
            boruId: null,
            baglantiNoktasi: null, // Boru ucundaki nokta
            uzunluk: FLEKS_CONFIG.defaultUzunluk
        };

        // İlişkili vana (cihaz vanası)
        this.iliskiliVanaId = null;

        // Giriş noktası offset (cihazın en yakın kenarı)
        this.girisOffset = this.hesaplaGirisOffset();
    }

    /**
     * Giriş offset hesapla (fleks bağlantı noktası)
     */
    hesaplaGirisOffset() {
        // Default: sol kenar ortası
        return {
            x: -this.config.width / 2,
            y: 0
        };
    }

    /**
     * Giriş noktası (local)
     */
    getGirisLocalKoordinat() {
        return this.girisOffset;
    }

    /**
     * Local to world
     */
    localToWorld(local) {
        const rad = this.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        return {
            x: this.x + local.x * cos - local.y * sin,
            y: this.y + local.x * sin + local.y * cos
        };
    }

    /**
     * Giriş noktası (world)
     */
    getGirisNoktasi() {
        return this.localToWorld(this.getGirisLocalKoordinat());
    }

    /**
     * Cihaz köşeleri
     */
    getKoseler() {
        const { width, height } = this.config;
        const halfW = width / 2;
        const halfH = height / 2;

        const localKoseler = [
            { x: -halfW, y: -halfH },
            { x: halfW, y: -halfH },
            { x: halfW, y: halfH },
            { x: -halfW, y: halfH }
        ];

        return localKoseler.map(k => this.localToWorld(k));
    }

    /**
     * Cihazın en yakın kenarını bul (fleks bağlantı için)
     */
    getEnYakinKenar(nokta) {
        const koseler = this.getKoseler();
        let minDist = Infinity;
        let enYakinNokta = null;

        // Her kenar için
        for (let i = 0; i < 4; i++) {
            const p1 = koseler[i];
            const p2 = koseler[(i + 1) % 4];

            // Noktanın kenara izdüşümü
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len2 = dx * dx + dy * dy;

            if (len2 === 0) continue;

            const t = Math.max(0, Math.min(1,
                ((nokta.x - p1.x) * dx + (nokta.y - p1.y) * dy) / len2
            ));

            const projX = p1.x + t * dx;
            const projY = p1.y + t * dy;
            const dist = Math.hypot(nokta.x - projX, nokta.y - projY);

            if (dist < minDist) {
                minDist = dist;
                enYakinNokta = { x: projX, y: projY };
            }
        }

        return enYakinNokta;
    }

    /**
     * Fleks bağlantısı yap
     */
    fleksBagla(boruId, baglantiNoktasi) {
        this.fleksBaglanti.boruId = boruId;
        this.fleksBaglanti.baglantiNoktasi = { ...baglantiNoktasi };
        this.fleksGuncelle();
    }

    /**
     * Fleks uzunluğunu güncelle
     */
    fleksGuncelle() {
        if (!this.fleksBaglanti.baglantiNoktasi) return;

        const giris = this.getGirisNoktasi();
        const baglanti = this.fleksBaglanti.baglantiNoktasi;

        this.fleksBaglanti.uzunluk = Math.hypot(
            giris.x - baglanti.x,
            giris.y - baglanti.y
        );

        // Sınırla
        this.fleksBaglanti.uzunluk = Math.max(
            FLEKS_CONFIG.minUzunluk,
            Math.min(FLEKS_CONFIG.maxUzunluk, this.fleksBaglanti.uzunluk)
        );
    }

    /**
     * Fleks çizgi noktaları
     */
    getFleksCizgi() {
        if (!this.fleksBaglanti.baglantiNoktasi) return null;

        return {
            baslangic: this.fleksBaglanti.baglantiNoktasi,
            bitis: this.getGirisNoktasi()
        };
    }

    /**
     * Taşı (fleks uzar/kısalır)
     */
    move(newX, newY) {
        this.x = newX;
        this.y = newY;
        this.fleksGuncelle();

        return {
            fleksBaglanti: this.fleksBaglanti
        };
    }

    /**
     * Döndür
     */
    rotate(deltaDerece) {
        this.rotation = (this.rotation + deltaDerece) % 360;
        this.fleksGuncelle();

        return {
            yeniGiris: this.getGirisNoktasi(),
            fleksBaglanti: this.fleksBaglanti
        };
    }

    /**
     * Vana ilişkilendir
     */
    vanaIliskilendir(vanaId) {
        this.iliskiliVanaId = vanaId;
    }

    /**
     * Baca gerekli mi?
     */
    bacaGerekliMi() {
        return this.config.bacaGerekli;
    }

    /**
     * Mount tipi
     */
    getMountType() {
        return this.config.mountType;
    }

    /**
     * Bounding box
     */
    getBoundingBox() {
        const koseler = this.getKoseler();
        const xs = koseler.map(k => k.x);
        const ys = koseler.map(k => k.y);

        return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys)
        };
    }

    /**
     * Hit test
     */
    containsPoint(point) {
        const bbox = this.getBoundingBox();
        return (
            point.x >= bbox.minX &&
            point.x <= bbox.maxX &&
            point.y >= bbox.minY &&
            point.y <= bbox.maxY
        );
    }

    /**
     * Silindiğinde yapılacaklar
     */
    getDeleteInfo() {
        return {
            fleksBaglanti: this.fleksBaglanti,
            iliskiliVanaId: this.iliskiliVanaId
        };
    }

    /**
     * Serialize
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            cihazTipi: this.cihazTipi,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            fleksBaglanti: { ...this.fleksBaglanti },
            iliskiliVanaId: this.iliskiliVanaId,
            floorId: this.floorId
        };
    }

    /**
     * Deserialize
     */
    static fromJSON(data) {
        const cihaz = new Cihaz(data.x, data.y, data.cihazTipi, {
            floorId: data.floorId
        });

        cihaz.id = data.id;
        cihaz.rotation = data.rotation;
        cihaz.fleksBaglanti = data.fleksBaglanti || {
            boruId: null,
            baglantiNoktasi: null,
            uzunluk: FLEKS_CONFIG.defaultUzunluk
        };
        cihaz.iliskiliVanaId = data.iliskiliVanaId;

        return cihaz;
    }
}

/**
 * Factory fonksiyon
 */
export function createCihaz(x, y, tip = 'KOMBI', options = {}) {
    return new Cihaz(x, y, tip, options);
}
