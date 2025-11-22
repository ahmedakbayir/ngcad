/**
 * Sayaç Bileşeni
 * Gaz sayacı - kullanıcı kurallarına göre tasarlanmış
 *
 * KURALLAR:
 * - Giriş ucu esnek (kol uzar), çıkış ucu rijit
 * - Daima hat ucunda, boşta olamaz
 * - Vana yoksa sayaç vanası otomatik eklenir
 * - Branşman vanası → sayaç vanasına dönüşür
 * - Eklenince BORU moduna geçer
 * - Giriş noktası etrafında döner
 * - Taşınırken giriş sabit, kol uzar
 * - Sayaç sonrası tekrar sayaç eklenemez
 * - Boru üzerine eklenebilir
 * - Silinince çıkış girişe taşınır
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Sayaç Sabitleri
export const SAYAC_CONFIG = {
    width: 18,          // cm
    height: 18,         // cm
    depth: 40,          // cm
    color: 0xA8A8A8,
    minKolUzunlugu: 5,  // cm - minimum bağlantı kolu
    maxKolUzunlugu: 50, // cm - maximum bağlantı kolu
    defaultKolUzunlugu: 10, // cm
};

export class Sayac {
    constructor(x, y, options = {}) {
        this.id = `sayac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'sayac';

        // Sayaç merkez pozisyonu
        this.x = x;
        this.y = y;
        this.rotation = 0; // derece

        // Konfigürasyon
        this.config = { ...SAYAC_CONFIG };
        this.floorId = options.floorId || null;

        // Giriş bağlantısı (esnek kol)
        this.girisKolUzunlugu = options.kolUzunlugu || SAYAC_CONFIG.defaultKolUzunlugu;
        this.girisBagliBoruId = null;
        this.girisNoktasi = null; // Boruya bağlandığı nokta

        // Çıkış bağlantısı (rijit)
        this.cikisBagliBoruId = null;

        // İlişkili vana (sayaç vanası)
        this.iliskiliVanaId = null;
    }

    /**
     * Giriş noktasının local koordinatı (esnek kol ucu)
     */
    getGirisLocalKoordinat() {
        return {
            x: -this.config.width / 2 - this.girisKolUzunlugu,
            y: 0
        };
    }

    /**
     * Çıkış noktasının local koordinatı (rijit)
     */
    getCikisLocalKoordinat() {
        return {
            x: this.config.width / 2,
            y: 0
        };
    }

    /**
     * Local koordinatı dünya koordinatına çevir
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
     * Giriş noktasının dünya koordinatları
     */
    getGirisNoktasi() {
        return this.localToWorld(this.getGirisLocalKoordinat());
    }

    /**
     * Çıkış noktasının dünya koordinatları
     */
    getCikisNoktasi() {
        return this.localToWorld(this.getCikisLocalKoordinat());
    }

    /**
     * Sayaç gövde merkezi
     */
    getGovdeMerkezi() {
        return { x: this.x, y: this.y };
    }

    /**
     * Sayaç köşeleri
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
     * Giriş noktası etrafında döndür
     */
    rotate(deltaDerece) {
        const girisNoktasi = this.getGirisNoktasi();

        // Rotasyonu uygula
        this.rotation = (this.rotation + deltaDerece) % 360;

        // Merkezi giriş noktasına göre yeniden hesapla
        const yeniGiris = this.getGirisNoktasi();
        this.x += girisNoktasi.x - yeniGiris.x;
        this.y += girisNoktasi.y - yeniGiris.y;

        return {
            cikisBagliBoruId: this.cikisBagliBoruId,
            yeniCikis: this.getCikisNoktasi()
        };
    }

    /**
     * Sayacı taşı (giriş noktası sabit, kol uzar)
     */
    move(newX, newY) {
        if (!this.girisNoktasi) {
            // Giriş noktası yoksa normal taşı
            this.x = newX;
            this.y = newY;
            return { cikisBagliBoruId: this.cikisBagliBoruId };
        }

        // Giriş noktası sabit, kol uzunluğunu hesapla
        const rad = this.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Kol yönündeki bileşen
        const dx = newX - this.girisNoktasi.x;
        const dy = newY - this.girisNoktasi.y;
        const yeniKolUzunlugu = dx * cos + dy * sin - this.config.width / 2;

        // Kol uzunluğunu sınırla
        this.girisKolUzunlugu = Math.max(
            SAYAC_CONFIG.minKolUzunlugu,
            Math.min(SAYAC_CONFIG.maxKolUzunlugu, yeniKolUzunlugu)
        );

        // Yeni pozisyonu hesapla (giriş noktası sabit kalacak şekilde)
        const hesaplananX = this.girisNoktasi.x + (this.config.width / 2 + this.girisKolUzunlugu) * cos;
        const hesaplananY = this.girisNoktasi.y + (this.config.width / 2 + this.girisKolUzunlugu) * sin;

        this.x = hesaplananX;
        this.y = hesaplananY;

        return {
            cikisBagliBoruId: this.cikisBagliBoruId,
            yeniCikis: this.getCikisNoktasi()
        };
    }

    /**
     * Ok tuşlarıyla hareket (1cm)
     */
    moveByKey(direction) {
        const step = 1; // cm
        let dx = 0, dy = 0;

        switch (direction) {
            case 'up': dy = -step; break;
            case 'down': dy = step; break;
            case 'left': dx = -step; break;
            case 'right': dx = step; break;
        }

        return this.move(this.x + dx, this.y + dy);
    }

    /**
     * Boruya bağlan (giriş tarafı)
     */
    baglaGiris(boruId, nokta) {
        this.girisBagliBoruId = boruId;
        this.girisNoktasi = { x: nokta.x, y: nokta.y };
    }

    /**
     * Çıkışa boru bağla
     */
    baglaCikis(boruId) {
        this.cikisBagliBoruId = boruId;
    }

    /**
     * Vana ilişkilendir
     */
    vanaIliskilendir(vanaId) {
        this.iliskiliVanaId = vanaId;
    }

    /**
     * Tesisat hattı üzerinde mi kontrolü
     */
    isTesisatHattiUzerinde(tesisatHatlari) {
        const merkez = this.getGovdeMerkezi();

        for (const hat of tesisatHatlari) {
            const dx = hat.p2.x - hat.p1.x;
            const dy = hat.p2.y - hat.p1.y;
            const len2 = dx * dx + dy * dy;

            if (len2 === 0) continue;

            const t = ((merkez.x - hat.p1.x) * dx + (merkez.y - hat.p1.y) * dy) / len2;
            if (t < 0 || t > 1) continue;

            const projX = hat.p1.x + t * dx;
            const projY = hat.p1.y + t * dy;
            const dist = Math.hypot(merkez.x - projX, merkez.y - projY);

            if (dist < TESISAT_CONSTANTS.SNAP_MESAFESI) {
                return { hat, t, projX, projY };
            }
        }

        return null;
    }

    /**
     * Silindiğinde yapılacaklar
     */
    getDeleteInfo() {
        return {
            girisBagliBoruId: this.girisBagliBoruId,
            cikisBagliBoruId: this.cikisBagliBoruId,
            iliskiliVanaId: this.iliskiliVanaId,
            girisNoktasi: this.girisNoktasi,
            cikisNoktasi: this.getCikisNoktasi()
        };
    }

    /**
     * Bounding box
     */
    getBoundingBox() {
        const koseler = this.getKoseler();
        const giris = this.getGirisNoktasi();

        const allPoints = [...koseler, giris];
        const xs = allPoints.map(p => p.x);
        const ys = allPoints.map(p => p.y);

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
     * Serialize
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            girisKolUzunlugu: this.girisKolUzunlugu,
            girisBagliBoruId: this.girisBagliBoruId,
            girisNoktasi: this.girisNoktasi,
            cikisBagliBoruId: this.cikisBagliBoruId,
            iliskiliVanaId: this.iliskiliVanaId,
            floorId: this.floorId
        };
    }

    /**
     * Deserialize
     */
    static fromJSON(data) {
        const sayac = new Sayac(data.x, data.y, {
            kolUzunlugu: data.girisKolUzunlugu,
            floorId: data.floorId
        });

        sayac.id = data.id;
        sayac.rotation = data.rotation;
        sayac.girisBagliBoruId = data.girisBagliBoruId;
        sayac.girisNoktasi = data.girisNoktasi;
        sayac.cikisBagliBoruId = data.cikisBagliBoruId;
        sayac.iliskiliVanaId = data.iliskiliVanaId;

        return sayac;
    }
}

/**
 * Factory fonksiyon
 */
export function createSayac(x, y, options = {}) {
    return new Sayac(x, y, options);
}
