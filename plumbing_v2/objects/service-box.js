/**
 * Servis Kutusu Bileşeni
 * Tesisat başlangıç noktası - kullanıcı kurallarına göre tasarlanmış
 *
 * KURALLAR:
 * - Uzun kenar duvar yüzeyine snap olur
 * - Duvara yaklaşınca otomatik hizalanır
 * - Duvar dışında yatay yerleşir
 * - Taşınabilir, döndürülebilir
 * - Taşındığında bağlı boru ucu da taşınır
 * - Döndürüldüğünde boru bağlantı noktası merkez alınır
 * - Çıkış: sağdan (default), üstten, alttan
 * - Tek çıkış, giriş yok
 * - Silinince tüm bağlı tesisat silinir
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Servis Kutusu Sabitleri
export const SERVIS_KUTUSU_CONFIG = {
    width: 40,          // cm - uzun kenar
    height: 20,         // cm - kısa kenar
    depth: 70,          // cm - derinlik (3D için)
    color: 0xA8A8A8,
    mountType: 'wall',
};

// Çıkış Yönleri
export const CIKIS_YONLERI = {
    SAG: 'sag',
    UST: 'ust',
    ALT: 'alt'
};

export class ServisKutusu {
    constructor(x, y, options = {}) {
        this.id = `servis_kutusu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'servis_kutusu';

        // Pozisyon
        this.x = x;
        this.y = y;
        this.rotation = 0; // derece

        // Konfigürasyon
        this.config = { ...SERVIS_KUTUSU_CONFIG };
        this.floorId = options.floorId || null;

        // Çıkış yönü (default: sağ)
        this.cikisYonu = options.cikisYonu || CIKIS_YONLERI.SAG;

        // Bağlı boru (tek çıkış)
        this.bagliBoruId = null;
        this.cikisKullanildi = false; // Çıkış dolu mu?

        // Duvar bilgisi (snap için)
        this.snapliDuvar = null;
    }

    /**
     * Çıkış noktasının local koordinatını hesapla
     */
    getCikisLocalKoordinat() {
        const { width, height } = this.config;
        const boruAcikligi = TESISAT_CONSTANTS.BORU_ACIKLIGI;

        switch (this.cikisYonu) {
            case CIKIS_YONLERI.SAG:
                // Sağdan çıkış: üst kenardan boru_açıklığı kadar içeride
                return {
                    x: width / 2,
                    y: -height / 2 + boruAcikligi
                };

            case CIKIS_YONLERI.UST:
                // Üstten çıkış: tam ortadan
                return {
                    x: 0,
                    y: -height / 2
                };

            case CIKIS_YONLERI.ALT:
                // Alttan çıkış: tam ortadan
                return {
                    x: 0,
                    y: height / 2
                };

            default:
                return { x: width / 2, y: 0 };
        }
    }

    /**
     * Çıkış noktasının dünya koordinatlarını döndürür
     */
    getCikisNoktasi() {
        const local = this.getCikisLocalKoordinat();
        return this.localToWorld(local);
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
     * Kutu köşelerini dünya koordinatlarında döndür
     */
    getKoseler() {
        const { width, height } = this.config;
        const halfW = width / 2;
        const halfH = height / 2;

        const localKoseler = [
            { x: -halfW, y: -halfH }, // sol üst
            { x: halfW, y: -halfH },  // sağ üst
            { x: halfW, y: halfH },   // sağ alt
            { x: -halfW, y: halfH }   // sol alt
        ];

        return localKoseler.map(k => this.localToWorld(k));
    }

    /**
     * Duvara snap ol
     */
    snapToWall(wall, point) {
        this.snapliDuvar = wall;

        if (wall.p1 && wall.p2) {
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);

            // Duvar normal vektörü (sağ tarafa dik)
            const nx = -dy / len;
            const ny = dx / len;

            // Duvar kalınlığı
            const wallThickness = wall.thickness || 20; // varsayılan 20cm

            // Offset: sadece duvar yüzeyine kadar
            const offset = wallThickness / 2;

            // Pozisyonu offset ile ayarla
            this.x = point.x + nx * offset;
            this.y = point.y + ny * offset;

            // Duvar açısına dön (+180° ile çıkış yönü içeri bakacak şekilde)
            this.rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 180;
        } else {
            this.x = point.x;
            this.y = point.y;
        }
    }

    /**
     * Serbest yerleştir (duvar dışı - yatay)
     */
    placeFree(point) {
        this.x = point.x;
        this.y = point.y;
        this.rotation = 0; // Yatay
        this.snapliDuvar = null;
    }

    /**
     * Taşı - bağlı boruyu da taşır
     */
    move(newX, newY) {
        const deltaX = newX - this.x;
        const deltaY = newY - this.y;

        this.x = newX;
        this.y = newY;

        // Bağlı boru bilgisini döndür (manager tarafından işlenecek)
        return {
            bagliBoruId: this.bagliBoruId,
            delta: { x: deltaX, y: deltaY }
        };
    }

    /**
     * Döndür - çıkış noktası merkez alınarak
     */
    rotate(deltaDerece) {
        // Döndürme merkezi: çıkış noktası
        const eskiCikis = this.getCikisNoktasi();

        // Rotasyonu uygula
        this.rotation = (this.rotation + deltaDerece) % 360;

        // Yeni çıkış noktasını hesapla
        const yeniCikis = this.getCikisNoktasi();

        // Merkez pozisyonunu ayarla (çıkış noktası sabit kalsın)
        this.x += eskiCikis.x - yeniCikis.x;
        this.y += eskiCikis.y - yeniCikis.y;

        return {
            bagliBoruId: this.bagliBoruId,
            yeniCikis: this.getCikisNoktasi()
        };
    }

    /**
     * Çıkış yönünü değiştir
     */
    setCikisYonu(yon) {
        if (Object.values(CIKIS_YONLERI).includes(yon)) {
            const eskiCikis = this.getCikisNoktasi();
            this.cikisYonu = yon;
            const yeniCikis = this.getCikisNoktasi();

            return {
                bagliBoruId: this.bagliBoruId,
                eskiCikis: eskiCikis,
                yeniCikis: yeniCikis
            };
        }
        return null;
    }

    /**
     * Boru bağla
     */
    baglaBoru(boruId) {
        if (this.cikisKullanildi) {
            console.warn('Servis kutusu çıkışı zaten kullanımda');
            return false;
        }

        this.bagliBoruId = boruId;
        this.cikisKullanildi = true;
        return true;
    }

    /**
     * Boru bağlantısını kaldır
     */
    boruBaglantisinKaldir() {
        this.bagliBoruId = null;
        this.cikisKullanildi = false;
    }

    /**
     * Silinebilir mi kontrolü
     */
    canDelete() {
        return true; // Her zaman silinebilir (uyarı ile)
    }

    /**
     * Silme işlemi için bilgi döndür
     */
    getDeleteInfo() {
        return {
            uyari: 'Servis kutusuna bağlı tüm tesisat silinecek!',
            bagliBoruId: this.bagliBoruId,
            silinecekler: [] // Manager tarafından doldurulacak
        };
    }

    /**
     * Bounding box (seçim için)
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
     * Nokta içinde mi (hit test)
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
     * Serialize (kaydetme için)
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            cikisYonu: this.cikisYonu,
            bagliBoruId: this.bagliBoruId,
            cikisKullanildi: this.cikisKullanildi,
            floorId: this.floorId
        };
    }

    /**
     * Deserialize (yüklemek için)
     */
    static fromJSON(data) {
        const kutu = new ServisKutusu(data.x, data.y, {
            cikisYonu: data.cikisYonu,
            floorId: data.floorId
        });

        kutu.id = data.id;
        kutu.rotation = data.rotation;
        kutu.bagliBoruId = data.bagliBoruId;
        kutu.cikisKullanildi = data.cikisKullanildi;

        return kutu;
    }
}
