/**
 * Vana Bileşeni
 * Ara ve sonlanma vanaları - kullanıcı kurallarına göre tasarlanmış
 *
 * ARA VANALAR: AKV, KKV, Emniyet, Cihaz, Selenoid, Sayaç
 * SONLANMA VANALARI: Branşman, YanBina, Domestik (kapama sembolü ile)
 *
 * KURALLAR:
 * - Sonlanma vanaları sabit konumlu + kapama sembolü
 * - Selenoid: artırılmış sembol (elektrik tetikli)
 * - YanBina/Domestik + yeni boru → Emniyet Vanasına dönüşür
 * - Branşman + sayaç → Sayaç Vanasına dönüşür
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Vana Sabitleri
export const VANA_CONFIG = {
    width: 6,           // cm
    height: 6,          // cm
    color: 0xA0A0A0,
};

// Vana Tipleri
export const VANA_TIPLERI = {
    // Ara Vanalar
    AKV: {
        id: 'AKV',
        name: 'Açma Kapama Vanası',
        kategori: 'ara',
        sembol: 'standart'
    },
    KKV: {
        id: 'KKV',
        name: 'Küresel Kapama Vanası',
        kategori: 'ara',
        sembol: 'standart'
    },
    EMNIYET: {
        id: 'EMNIYET',
        name: 'Emniyet Vanası',
        kategori: 'ara',
        sembol: 'standart'
    },
    CIHAZ: {
        id: 'CIHAZ',
        name: 'Cihaz Vanası',
        kategori: 'ara',
        sembol: 'standart'
    },
    SELENOID: {
        id: 'SELENOID',
        name: 'Selenoid Vana',
        kategori: 'ara',
        sembol: 'elektrik'  // Artırılmış sembol
    },
    SAYAC: {
        id: 'SAYAC',
        name: 'Sayaç Vanası',
        kategori: 'ara',
        sembol: 'standart'
    },

    // Sonlanma Vanaları
    BRANSEMAN: {
        id: 'BRANSEMAN',
        name: 'Branşman Vanası',
        kategori: 'sonlanma',
        sembol: 'kapama'
    },
    YAN_BINA: {
        id: 'YAN_BINA',
        name: 'Yan Bina Vanası',
        kategori: 'sonlanma',
        sembol: 'kapama'
    },
    DOMESTIK: {
        id: 'DOMESTIK',
        name: 'Domestik Vana',
        kategori: 'sonlanma',
        sembol: 'kapama'
    }
};

// Kategori listesi
export const ARA_VANALAR = ['AKV', 'KKV', 'EMNIYET', 'CIHAZ', 'SELENOID', 'SAYAC'];
export const SONLANMA_VANALARI = ['BRANSEMAN', 'YAN_BINA', 'DOMESTIK'];

export class Vana {
    constructor(x, y, tip = 'AKV', options = {}) {
        this.id = `vana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'vana';

        // Pozisyon
        this.x = x;
        this.y = y;
        this.rotation = 0; // derece

        // Vana tipi
        this.vanaTipi = tip;
        this.config = { ...VANA_CONFIG };
        this.floorId = options.floorId || null;

        // Bağlantılar
        this.girisBagliBoruId = null;
        this.cikisBagliBoruId = null;

        // Boru üzerindeki pozisyon (0-1)
        this.boruPozisyonu = options.boruPozisyonu || null;
        this.bagliBoruId = options.bagliBoruId || null;
    }

    /**
     * Vana tipi bilgisi
     */
    getTipBilgisi() {
        return VANA_TIPLERI[this.vanaTipi] || VANA_TIPLERI.AKV;
    }

    /**
     * Sonlanma vanası mı?
     */
    isSonlanma() {
        return SONLANMA_VANALARI.includes(this.vanaTipi);
    }

    /**
     * Ara vana mı?
     */
    isAra() {
        return ARA_VANALAR.includes(this.vanaTipi);
    }

    /**
     * Selenoid mi?
     */
    isSelenoid() {
        return this.vanaTipi === 'SELENOID';
    }

    /**
     * Giriş noktası (local)
     */
    getGirisLocalKoordinat() {
        return { x: -this.config.width / 2, y: 0 };
    }

    /**
     * Çıkış noktası (local)
     */
    getCikisLocalKoordinat() {
        return { x: this.config.width / 2, y: 0 };
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
     * Çıkış noktası (world)
     */
    getCikisNoktasi() {
        return this.localToWorld(this.getCikisLocalKoordinat());
    }

    /**
     * Vana köşeleri
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
     * Vana tipini değiştir
     */
    setTip(yeniTip) {
        if (VANA_TIPLERI[yeniTip]) {
            this.vanaTipi = yeniTip;
            return true;
        }
        return false;
    }

    /**
     * Sonlanma vanasını ara vanaya dönüştür
     * (YanBina/Domestik + yeni boru → Emniyet)
     */
    sonlanmadanArayaDonustur() {
        if (this.vanaTipi === 'YAN_BINA' || this.vanaTipi === 'DOMESTIK') {
            this.vanaTipi = 'EMNIYET';
            return true;
        }
        return false;
    }

    /**
     * Branşman vanasını sayaç vanasına dönüştür
     */
    bransemandanSayacVanasiyaDonustur() {
        if (this.vanaTipi === 'BRANSEMAN') {
            this.vanaTipi = 'SAYAC';
            return true;
        }
        return false;
    }

    /**
     * Boru bağla
     */
    baglaGiris(boruId) {
        this.girisBagliBoruId = boruId;
    }

    baglaCikis(boruId) {
        this.cikisBagliBoruId = boruId;
    }

    /**
     * Döndür
     */
    rotate(deltaDerece) {
        this.rotation = (this.rotation + deltaDerece) % 360;
        return {
            yeniGiris: this.getGirisNoktasi(),
            yeniCikis: this.getCikisNoktasi()
        };
    }

    /**
     * Taşı
     */
    move(newX, newY) {
        this.x = newX;
        this.y = newY;
        return {
            girisBagliBoruId: this.girisBagliBoruId,
            cikisBagliBoruId: this.cikisBagliBoruId
        };
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
     * Serialize
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            vanaTipi: this.vanaTipi,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            girisBagliBoruId: this.girisBagliBoruId,
            cikisBagliBoruId: this.cikisBagliBoruId,
            boruPozisyonu: this.boruPozisyonu,
            bagliBoruId: this.bagliBoruId,
            floorId: this.floorId
        };
    }

    /**
     * Deserialize
     */
    static fromJSON(data) {
        const vana = new Vana(data.x, data.y, data.vanaTipi, {
            floorId: data.floorId,
            boruPozisyonu: data.boruPozisyonu,
            bagliBoruId: data.bagliBoruId
        });

        vana.id = data.id;
        vana.rotation = data.rotation;
        vana.girisBagliBoruId = data.girisBagliBoruId;
        vana.cikisBagliBoruId = data.cikisBagliBoruId;

        return vana;
    }
}

/**
 * Factory fonksiyon
 */
export function createVana(x, y, tip = 'AKV', options = {}) {
    return new Vana(x, y, tip, options);
}
