/**
 * Sayaç Bileşeni
 * Gaz sayacı - kullanıcı kurallarına göre tasarlanmış
 *
 * KURALLAR:
 * - Giriş ucu esnek (fleks), çıkış ucu rijit
 * - Daima hat ucunda veya boru üzerinde (split)
 * - Vana yoksa sayaç vanası otomatik eklenir (Manager tarafından)
 * - Eklenince BORU moduna geçer
 * - Giriş noktası etrafında döner
 * - Taşınırken giriş noktasına olan fleks bağlantısı görsel olarak güncellenir
 * - Silinince ilişkili vana ve borular yönetilir
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Sayaç Sabitleri
export const SAYAC_CONFIG = {
    width: 25,          // cm - Gövde genişliği
    height: 30,         // cm - Gövde yüksekliği
    depth: 20,          // cm - 3D Derinlik
    color: 0xA8A8A8,
    rijitUzunluk: 10,   // Sağ çıkış kolu uzunluğu (sabit)
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

        // Giriş bağlantısı (Esnek/Fleks)
        // Cihazlarda olduğu gibi boru ID'si ve uç noktası ('p1'/'p2') tutulur
        this.fleksBaglanti = {
            boruId: null,
            endpoint: null // 'p1' veya 'p2'
        };

        // Çıkış bağlantısı (Rijit)
        // Buraya bağlanan borunun ID'si
        this.cikisBagliBoruId = null;

        // İlişkili vana (sayaç vanası) ID'si
        this.iliskiliVanaId = null;
    }

    /**
     * Giriş noktasının local koordinatı (Sol kenar)
     * Fleks buradan bağlanır.
     */
    getGirisLocalKoordinat() {
        return {
            x: -this.config.width / 2,
            y: 0
        };
    }

    /**
     * Çıkış noktasının local koordinatı (Sağ kenar + Rijit Uzunluk)
     * Yeni tesisat buradan başlar.
     */
    getCikisLocalKoordinat() {
        const totalRightOffset = (this.config.width / 2) + this.config.rijitUzunluk;
        return {
            x: totalRightOffset,
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
     * Sayaç köşeleri (Bounding Box hesaplaması için)
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
     * (Eski versiyondaki gibi giriş sabit kalır, gövde döner)
     */
    rotate(deltaDerece) {
        const girisNoktasi = this.getGirisNoktasi();

        // Rotasyonu uygula
        this.rotation = (this.rotation + deltaDerece) % 360;

        // Merkezi giriş noktasına göre yeniden hesapla (giriş sabit kalsın diye)
        const yeniGiris = this.getGirisNoktasi();
        this.x += girisNoktasi.x - yeniGiris.x;
        this.y += girisNoktasi.y - yeniGiris.y;

        return {
            cikisBagliBoruId: this.cikisBagliBoruId,
            yeniCikis: this.getCikisNoktasi()
        };
    }

    /**
     * Sayacı taşı
     * Artık kol uzatmıyor, tüm gövdeyi taşıyor.
     * Fleks bağlantısı renderer tarafından dinamik çizilir.
     */
    move(newX, newY) {
        this.x = newX;
        this.y = newY;

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
     * Giriş bağlantısını kur (Fleks)
     * @param {string} boruId - Bağlanılacak borunun ID'si
     * @param {string} endpoint - 'p1' veya 'p2'
     */
    baglaGiris(boruId, endpoint) {
        this.fleksBaglanti.boruId = boruId;
        this.fleksBaglanti.endpoint = endpoint;
    }

    /**
     * Fleks bağlantı noktasını borudan al (Renderer için gerekli)
     */
    getFleksBaglantiNoktasi(pipe) {
        if (!pipe || !this.fleksBaglanti.endpoint) return null;
        return this.fleksBaglanti.endpoint === 'p1' ? pipe.p1 : pipe.p2;
    }

    /**
     * Çıkışa boru bağla (Rijit)
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
     * Tesisat hattı üzerinde mi kontrolü (Snap için)
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
     * Silindiğinde yapılacaklar (Bilgi döndürür)
     */
    getDeleteInfo() {
        return {
            girisBagliBoruId: this.fleksBaglanti.boruId, // Artık fleksBaglanti üzerinden
            cikisBagliBoruId: this.cikisBagliBoruId,
            iliskiliVanaId: this.iliskiliVanaId,
            girisNoktasi: this.getGirisNoktasi(),
            cikisNoktasi: this.getCikisNoktasi()
        };
    }

    /**
     * Bounding box (Seçim kutusu için)
     */
    getBoundingBox() {
        const koseler = this.getKoseler();
        // Giriş noktasını bounding box'a dahil etmeye gerek yok, gövde yeterli
        // Ancak rijit çıkış ucunu dahil etmek iyi olabilir
        const cikisUcu = this.getCikisNoktasi();

        const allPoints = [...koseler, cikisUcu];
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
     * Hit test (Tıklama kontrolü)
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
     * Serialize (Kaydetme)
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            fleksBaglanti: { ...this.fleksBaglanti }, // Fleks bilgisini kaydet
            cikisBagliBoruId: this.cikisBagliBoruId,
            iliskiliVanaId: this.iliskiliVanaId,
            floorId: this.floorId
        };
    }

    /**
     * Deserialize (Yükleme)
     */
    static fromJSON(data) {
        const sayac = new Sayac(data.x, data.y, {
            floorId: data.floorId
        });

        sayac.id = data.id;
        sayac.rotation = data.rotation;
        
        // Fleks bağlantısını yükle
        if (data.fleksBaglanti) {
            sayac.fleksBaglanti = { ...data.fleksBaglanti };
        } else if (data.girisBagliBoruId) { 
            // Eski format desteği (girisBagliBoruId varsa)
            sayac.fleksBaglanti.boruId = data.girisBagliBoruId;
            // endpoint'i tahmin etmek zor olabilir, null bırakıyoruz
        }

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