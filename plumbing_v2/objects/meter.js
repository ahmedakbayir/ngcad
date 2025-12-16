/**
 * Sayaç Bileşeni (G4)
 *
 * KURALLAR:
 * - Giriş: ÜST SOL (Fleks buraya bağlanır)
 * - Çıkış: ÜST SAĞ (Rijit boru buradan çıkar)
 * - Sayaç gövdesi boru hattının altında durur.
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';
import { FLEKS_CONFIG } from './device.js';

// Sayaç Sabitleri
export const SAYAC_CONFIG = {
    width: 22,          // cm - Gövde genişliği
    height: 24,         // cm - Gövde yüksekliği
    depth: 16,          // cm - 3D Derinlik
    color: 0xA8A8A8,    // Metalik gri
    rijitUzunluk: 10,   // Çıkış borusu uzunluğu (Sayacın üstünden boru hattına kadar)
    connectionOffset: 5, // Merkezden sağa/sola sapma miktarı (giriş/çıkış arası 10cm)
    fleksBaglantiNoktasi: {
        offsetX: -5,    // cm - Gövde merkezinden sola
        offsetY: -20    // cm - Gövde üstünden yukarı
    }
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
        // Giriş tarafı bir boruya veya vanaya esnek olarak bağlıdır
        this.fleksBaglanti = {
            boruId: null,
            endpoint: null, // 'p1' veya 'p2'
            uzunluk: FLEKS_CONFIG.defaultUzunluk // 30 cm
        };

        // Çıkış bağlantısı (Rijit)
        // Çıkış tarafı yeni bir boru hattının başlangıcıdır
        this.cikisBagliBoruId = null;

        // İlişkili vana (sayaç vanası) ID'si
        this.iliskiliVanaId = null;
    }

    /**
     * Giriş noktasının local koordinatı
     * KURAL: ÜST SOL (Gövdenin üst kenarı, sol taraf)
     */
    getGirisLocalKoordinat() {
        return {
            x: -this.config.connectionOffset, 
            y: -this.config.height / 2
        };
    }

    /**
     * Çıkış noktasının local koordinatı
     * KURAL: ÜST SAĞ + RİJİT UZUNLUK
     * Burası rijit borunun bittiği ve tesisatın devam ettiği yerdir.
     * Genelde sayacın asıldığı kotun (boru hattının) hizasına denk gelir.
     */
    getCikisLocalKoordinat() {
        return {
            x: this.config.connectionOffset, 
            y: -this.config.height / 2 - this.config.rijitUzunluk 
        };
    }
    
    /**
     * Rijit borunun sayaç üzerindeki başlangıç noktası
     * (Çizim için kullanılır)
     */
    getRijitBaslangicLocal() {
        return {
            x: this.config.connectionOffset,
            y: -this.config.height / 2
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
     * Çıkış noktasının dünya koordinatları (Rijit borunun ucu)
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
     * Sayaç köşeleri (Bounding Box için)
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

        // Merkezi giriş noktasına göre yeniden hesapla (giriş sabit kalsın)
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
     * Ok tuşlarıyla hareket
     */
    moveByKey(direction) {
        const step = 1;
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
     */
    fleksBagla(boruId, endpoint) {
        this.fleksBaglanti.boruId = boruId;
        this.fleksBaglanti.endpoint = endpoint;
    }

    /**
     * Fleks bağlantı noktasını borudan al
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
     * Silindiğinde yapılacaklar
     */
    getDeleteInfo() {
        return {
            girisBagliBoruId: this.fleksBaglanti.boruId,
            cikisBagliBoruId: this.cikisBagliBoruId,
            iliskiliVanaId: this.iliskiliVanaId,
            girisNoktasi: this.getGirisNoktasi(),
            cikisNoktasi: this.getCikisNoktasi()
        };
    }

    /**
     * Bounding box
     */
    getBoundingBox() {
        const koseler = this.getKoseler();
        const xs = koseler.map(p => p.x);
        const ys = koseler.map(p => p.y);
        
        // Çıkış ucunu da dahil et (seçim kolaylığı için)
        const cikisUcu = this.getCikisNoktasi();

        return {
            minX: Math.min(...xs, cikisUcu.x),
            maxX: Math.max(...xs, cikisUcu.x),
            minY: Math.min(...ys, cikisUcu.y),
            maxY: Math.max(...ys, cikisUcu.y)
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
            fleksBaglanti: { ...this.fleksBaglanti },
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
            floorId: data.floorId
        });

        sayac.id = data.id;
        sayac.rotation = data.rotation;
        
        if (data.fleksBaglanti) {
            sayac.fleksBaglanti = { ...data.fleksBaglanti };
        } else if (data.girisBagliBoruId) { 
            sayac.fleksBaglanti.boruId = data.girisBagliBoruId;
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