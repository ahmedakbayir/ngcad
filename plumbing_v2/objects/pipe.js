/**
 * Boru Bileşeni
 * Tesisat bağlantı elemanı - kullanıcı kurallarına göre tasarlanmış
 *
 * KURALLAR:
 * - Tüm bağlantılar borularla sağlanır
 * - Tesisat hattına snap olmalı
 * - Duvardan uzakta düz çizilir
 * - Süreklilik esastır (kesinti olmaz)
 * - Grid snap yok, atlama yok
 * - Gaz sadece boru ve sayaçtan geçer
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Renk Grupları (Sayaç Öncesi/Sonrası) - TEMAya GÖRE DİNAMİK
export function getRenkGruplari() {
    const isLightMode = document.body.classList.contains('light-mode');

    if (isLightMode) {
        // AÇIK MOD - Koyu turuncu ve koyu mavi (beyaz zeminde görünür)
        return {
            YELLOW: {
                id: 'yellow',
                name: 'Turuncu (Sayaç Öncesi)',
                boru: 'rgba(255, 128, 0, {opacity})',      // Koyu turuncu
                dirsek: 'rgba(255, 128, 0, {opacity})',    // Koyu turuncu
                fleks: '#ff8000'                            // Koyu turuncu
            },
            TURQUAZ: {
                id: 'turquaz',
                name: 'Mavi (Sayaç Sonrası)',
                boru: 'rgba(0, 102, 204, {opacity})',      // Koyu mavi
                dirsek: 'rgba(0, 102, 204, {opacity})',    // Koyu mavi
                fleks: '#0066CC'                            // Koyu mavi
            },
            GREEN: {
                id: 'green',
                name: 'Yeşil (Düşey Borular)',
                boru: 'rgba(0, 100, 0, {opacity})',        // Koyu yeşil
                dirsek: 'rgba(0, 100, 0, {opacity})',      // Koyu yeşil
                fleks: '#006400'                            // Koyu yeşil
            },
            INCLINED: {
                id: 'inclined',
                name: 'Turuncu-Yeşil (Eğimli Borular)',
                boru: 'rgba(180, 140, 0, {opacity})',      // Zeytin sarısı
                dirsek: 'rgba(180, 140, 0, {opacity})',    // Zeytin sarısı
                fleks: '#b48c00'                            // Zeytin sarısı
            }
        };
    } else {
        // KOYU MOD - Sarı ve turquaz (orijinal)
        return {
            YELLOW: {
                id: 'yellow',
                name: 'Sarı (Sayaç Öncesi)',
                boru: 'rgba(255, 255, 0, {opacity})',      // Sarı
                dirsek: 'rgba(255, 255, 0, {opacity})',    // Sarı
                fleks: '#FFD700'                            // Altın sarısı
            },
            TURQUAZ: {
                id: 'turquaz',
                name: 'Turquaz (Sayaç Sonrası)',
                boru: 'rgba(39, 210, 240, {opacity})',     // Turquaz
                dirsek: 'rgba(39, 210, 240, {opacity})',   // Turquaz
                fleks: '#27d2f0'                            // Turquaz
            },
            GREEN: {
                id: 'green',
                name: 'Yeşil (Düşey Borular)',
                boru: 'rgba(57, 255, 20, {opacity})',      // Neon yeşil
                dirsek: 'rgba(57, 255, 20, {opacity})',    // Neon yeşil
                fleks: '#39ff14'                            // Neon yeşil
            },
            INCLINED: {
                id: 'inclined',
                name: 'Limon Yeşili (Eğimli Borular)',
                boru: 'rgba(200, 255, 0, {opacity})',      // Limon yeşili
                dirsek: 'rgba(200, 255, 0, {opacity})',    // Limon yeşili
                fleks: '#c8ff00'                            // Limon yeşili
            }
        };
    }
}

// Geriye uyumluluk için export (deprecated - getRenkGruplari() kullanın)
export const RENK_GRUPLARI = getRenkGruplari();

// Boru Tipleri
export const BORU_TIPLERI = {
    STANDART: {
        id: 'standart',
        name: 'Standart Boru',
        diameter: 2,        // cm
        color: 0xFFFF00,    // Sarı (doğalgaz) - deprecated, colorGroup kullan
        lineWidth: 4
    },
    KALIN: {
        id: 'kalin',
        name: 'Kalın Boru',
        diameter: 4,
        color: 0xFFCC00,    // Koyu sarı - deprecated, colorGroup kullan
        lineWidth: 6
    }
};

// Bağlantı Tipleri
export const BAGLANTI_TIPLERI = {
    SERVIS_KUTUSU: 'servis_kutusu',
    BRANSMAN: 'bransman',
    SAYAC: 'sayac',
    BORU: 'boru',           // T-bağlantı
    VANA: 'vana',
    CIHAZ: 'cihaz'
};

export class Boru {
    constructor(p1, p2, tip = 'STANDART') {
        this.id = `boru_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'boru';
        this.boruTipi = tip;

        // Uç noktalar
        this.p1 = { x: p1.x, y: p1.y, z: p1.z || 0 };
        this.p2 = { x: p2.x, y: p2.y, z: p2.z || 0 };

        // Z koordinatı kontrolü (debug)
        if (this.p1.z !== 0 || this.p2.z !== 0) {
            console.log(`📐 BORU OLUŞTURULDU (Z koordinatlı):`, {
                id: this.id.substring(0, 20) + '...',
                p1: this.p1,
                p2: this.p2,
                zFarkı: Math.abs(this.p2.z - this.p1.z)
            });
        }

        // Renk Grubu (Sayaç Öncesi/Sonrası)
        this.colorGroup = 'YELLOW'; // Varsayılan: Sarı (Sayaç Öncesi)

        // Kat bilgisi
        this.floorId = null;

        // Bağlantı bilgileri
        this.baslangicBaglanti = {
            tip: null,          // BAGLANTI_TIPLERI
            hedefId: null,      // Bağlı objenin ID'si
            noktaIndex: null    // Bağlantı noktası indeksi
        };

        this.bitisBaglanti = {
            tip: null,
            hedefId: null,
            noktaIndex: null
        };

        // Üzerine takılı elemanlar
        this.uzerindekiElemanlar = []; // { id, tip, pozisyon (0-1) }

        // T-bağlantı noktaları
        this.tBaglantilar = []; // { pozisyon, boruId }

        // Vana (sadece 1 adet olabilir)
        this.vana = null; // { t: 0-1, vanaTipi: 'AKV'|'KKV'|... }
    }

    /**
     * Boru uzunluğu
     */
    get uzunluk() {
        return Math.hypot(
            this.p2.x - this.p1.x,
            this.p2.y - this.p1.y
        );
    }

    /**
     * Boru açısı (radyan)
     */
    get aci() {
        return Math.atan2(
            this.p2.y - this.p1.y,
            this.p2.x - this.p1.x
        );
    }

    /**
     * Boru açısı (derece)
     */
    get aciDerece() {
        return this.aci * 180 / Math.PI;
    }

    /**
     * Boru konfigürasyonu
     */
    get config() {
        return BORU_TIPLERI[this.boruTipi] || BORU_TIPLERI.STANDART;
    }

    /**
     * Nokta boru üzerinde mi?
     */
    containsPoint(point, tolerance = TESISAT_CONSTANTS.SNAP_MESAFESI) {
        const proj = this.projectPoint(point);
        if (!proj || !proj.onSegment) return false;
        return proj.distance < tolerance;
    }

    /**
     * Boruyu taşı (tüm boruyu)
     */
    move(newX, newY) {
        // Boru merkezini hesapla
        const centerX = (this.p1.x + this.p2.x) / 2;
        const centerY = (this.p1.y + this.p2.y) / 2;

        // Delta hesapla
        const dx = newX - centerX;
        const dy = newY - centerY;

        // Her iki ucu da taşı
        this.p1.x += dx;
        this.p1.y += dy;
        this.p2.x += dx;
        this.p2.y += dy;

        return null;
    }

    /**
     * Noktanın boru üzerine izdüşümü (3D destekli)
     */
    projectPoint(point) {
        const { p1, p2 } = this;

        // 3D mesafe hesaplama
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = (p2.z || 0) - (p1.z || 0);
        const len2 = dx * dx + dy * dy + dz * dz;

        if (len2 === 0) {
            const dist = Math.hypot(point.x - p1.x, point.y - p1.y, (point.z || 0) - (p1.z || 0));
            return { x: p1.x, y: p1.y, z: p1.z || 0, t: 0, onSegment: true, distance: dist };
        }

        // 3D projeksiyon
        const px = (point.x || 0) - p1.x;
        const py = (point.y || 0) - p1.y;
        const pz = (point.z || 0) - (p1.z || 0);

        const t = (px * dx + py * dy + pz * dz) / len2;
        const clampedT = Math.max(0, Math.min(1, t));

        const projX = p1.x + clampedT * dx;
        const projY = p1.y + clampedT * dy;
        const projZ = (p1.z || 0) + clampedT * dz;

        // 3D mesafe
        const distance = Math.hypot(
            (point.x || 0) - projX,
            (point.y || 0) - projY,
            (point.z || 0) - projZ
        );

        return {
            x: projX,
            y: projY,
            z: projZ,
            t: clampedT,
            onSegment: t >= 0 && t <= 1,
            distance: distance
        };
    }

    /**
     * Pozisyondaki noktayı al (t: 0-1)
     */
    getPointAt(t) {
        return {
            x: this.p1.x + (this.p2.x - this.p1.x) * t,
            y: this.p1.y + (this.p2.y - this.p1.y) * t,
            z: this.p1.z + (this.p2.z - this.p1.z) * t
        };
    }

    /**
     * Başlangıç noktasını taşı
     */
    moveP1(newPoint) {
        this.p1.x = newPoint.x;
        this.p1.y = newPoint.y;
        if (newPoint.z !== undefined) this.p1.z = newPoint.z;
    }

    /**
     * Bitiş noktasını taşı
     */
    moveP2(newPoint) {
        this.p2.x = newPoint.x;
        this.p2.y = newPoint.y;
        if (newPoint.z !== undefined) this.p2.z = newPoint.z;
    }

    /**
     * Boruyu belirli bir noktadan böl (3D destekli)
     */
    splitAt(point) {
        const proj = this.projectPoint(point);
        if (!proj || !proj.onSegment) return null;

        // Z değeri interpolate ediliyor (3D destek)
        const splitPoint = { x: proj.x, y: proj.y, z: proj.z };

        // İki yeni boru oluştur
        const boru1 = new Boru(this.p1, splitPoint, this.boruTipi);
        const boru2 = new Boru(splitPoint, this.p2, this.boruTipi);

        // Özellikleri kopyala
        boru1.floorId = this.floorId;
        boru2.floorId = this.floorId;

        // ✨ RENGİ KOPYALA (Sayaç sonrası renkler korunsun!)
        boru1.colorGroup = this.colorGroup;
        boru2.colorGroup = this.colorGroup;

        // Bağlantıları aktar
        boru1.baslangicBaglanti = { ...this.baslangicBaglanti };
        boru2.bitisBaglanti = { ...this.bitisBaglanti };

        // Boru1'in bitiş bağlantısını boru2'ye ayarla
        boru1.bitisBaglanti = {
            tip: 'boru',
            hedefId: boru2.id,
            noktaIndex: null
        };

        // Boru2'nin başlangıç bağlantısını boru1'e ayarla
        boru2.baslangicBaglanti = {
            tip: 'boru',
            hedefId: boru1.id,
            noktaIndex: null
        };

        // Üzerindeki elemanları paylaştır
        this.uzerindekiElemanlar.forEach(eleman => {
            if (eleman.pozisyon <= proj.t) {
                // Yeni pozisyonu hesapla
                const yeniPoz = proj.t > 0 ? eleman.pozisyon / proj.t : 0;
                boru1.uzerindekiElemanlar.push({
                    ...eleman,
                    pozisyon: yeniPoz
                });
            } else {
                // Yeni pozisyonu hesapla
                const yeniPoz = (eleman.pozisyon - proj.t) / (1 - proj.t);
                boru2.uzerindekiElemanlar.push({
                    ...eleman,
                    pozisyon: yeniPoz
                });
            }
        });

        // Vana'yı paylaştır
        if (this.vana) {
            if (this.vana.t <= proj.t) {
                // Vana boru1'de kalır
                const yeniT = proj.t > 0 ? this.vana.t / proj.t : 0;
                boru1.vana = { ...this.vana, t: yeniT };
            } else {
                // Vana boru2'ye geçer
                const yeniT = (this.vana.t - proj.t) / (1 - proj.t);
                boru2.vana = { ...this.vana, t: yeniT };
            }
        }

        return { boru1, boru2, splitPoint, splitT: proj.t };
    }

    /**
     * Başlangıç bağlantısını ayarla
     */
    setBaslangicBaglanti(tip, hedefId, noktaIndex = null) {
        this.baslangicBaglanti = { tip, hedefId, noktaIndex };
    }

    /**
     * Bitiş bağlantısını ayarla
     */
    setBitisBaglanti(tip, hedefId, noktaIndex = null) {
        this.bitisBaglanti = { tip, hedefId, noktaIndex };
    }

    /**
     * Eleman ekle
     */
    elemanEkle(elemanId, tip, pozisyon) {
        // Pozisyon sıralamasını koru
        this.uzerindekiElemanlar.push({ id: elemanId, tip, pozisyon });
        this.uzerindekiElemanlar.sort((a, b) => a.pozisyon - b.pozisyon);
    }

    /**
     * Eleman kaldır
     */
    elemanKaldir(elemanId) {
        const index = this.uzerindekiElemanlar.findIndex(e => e.id === elemanId);
        if (index !== -1) {
            this.uzerindekiElemanlar.splice(index, 1);
        }
    }

    /**
     * T-bağlantı ekle
     */
    tBaglantiEkle(pozisyon, boruId) {
        this.tBaglantilar.push({ pozisyon, boruId });
        this.tBaglantilar.sort((a, b) => a.pozisyon - b.pozisyon);
    }

    /**
     * T-bağlantı kaldır
     */
    tBaglantiKaldir(boruId) {
        const index = this.tBaglantilar.findIndex(t => t.boruId === boruId);
        if (index !== -1) {
            this.tBaglantilar.splice(index, 1);
        }
    }

    /**
     * Vana ekle
     * @param {number} t - Boru üzerinde pozisyon (0-1)
     * @param {string} vanaTipi - Vana tipi (AKV, KKV, vb.)
     * @param {object} options - Opsiyonel ayarlar { fromEnd: 'p1'|'p2', fixedDistance: number }
     * @returns {boolean} - Başarılı mı?
     */
    vanaEkle(t, vanaTipi = 'AKV', options = {}) {
        // Her boruda sadece 1 vana olabilir
        if (this.vana !== null) {
            return false;
        }

        // t değeri 0-1 arasında olmalı
        if (t < 0 || t > 1) {
            return false;
        }

        this.vana = {
            t,
            vanaTipi,
            fromEnd: options.fromEnd || null,  // Hangi uçtan (p1 veya p2)
            fixedDistance: options.fixedDistance || null  // Uçtan sabit mesafe (cm)
        };
        return true;
    }

    /**
     * Vana kaldır
     */
    vanaKaldir() {
        this.vana = null;
    }

    /**
     * Vana pozisyonunu hesapla (world koordinatlarında)
     */
    getVanaPozisyon() {
        if (!this.vana) return null;

        // Eğer fixedDistance varsa, uçtan sabit mesafe olarak hesapla
        if (this.vana.fixedDistance !== undefined && this.vana.fixedDistance !== null && this.vana.fromEnd) {
            const length = this.uzunluk;
            let t;

            if (this.vana.fromEnd === 'p1') {
                // p1'den fixedDistance kadar içerde
                t = Math.min(this.vana.fixedDistance / length, 0.95);
            } else {
                // p2'den fixedDistance kadar içerde
                t = Math.max(1 - (this.vana.fixedDistance / length), 0.05);
            }

            return this.getPointAt(t);
        }

        // Geriye dönük uyumluluk: eski t modunda
        return this.getPointAt(this.vana.t);
    }

    /**
     * Süreklilik kontrolü (başlangıç veya bitiş bağlı mı?)
     */
    isBagli(ucTipi = 'baslangic') {
        if (ucTipi === 'baslangic') {
            return this.baslangicBaglanti.hedefId !== null;
        }
        return this.bitisBaglanti.hedefId !== null;
    }

    /**
     * Bounding box
     */
    getBoundingBox() {
        return {
            minX: Math.min(this.p1.x, this.p2.x),
            maxX: Math.max(this.p1.x, this.p2.x),
            minY: Math.min(this.p1.y, this.p2.y),
            maxY: Math.max(this.p1.y, this.p2.y)
        };
    }

    /**
     * Serialize
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            boruTipi: this.boruTipi,
            colorGroup: this.colorGroup,
            p1: { ...this.p1 },
            p2: { ...this.p2 },
            floorId: this.floorId,
            baslangicBaglanti: { ...this.baslangicBaglanti },
            bitisBaglanti: { ...this.bitisBaglanti },
            uzerindekiElemanlar: [...this.uzerindekiElemanlar],
            tBaglantilar: [...this.tBaglantilar],
            vana: this.vana ? { ...this.vana } : null
        };
    }

    /**
     * Deserialize
     */
    static fromJSON(data) {
        const boru = new Boru(data.p1, data.p2, data.boruTipi);
        boru.id = data.id;
        boru.colorGroup = data.colorGroup || 'YELLOW'; // Varsayılan: Sarı (geriye dönük uyumluluk)
        boru.floorId = data.floorId;
        boru.baslangicBaglanti = data.baslangicBaglanti || { tip: null, hedefId: null, noktaIndex: null };
        boru.bitisBaglanti = data.bitisBaglanti || { tip: null, hedefId: null, noktaIndex: null };
        boru.uzerindekiElemanlar = data.uzerindekiElemanlar || [];
        boru.tBaglantilar = data.tBaglantilar || [];
        boru.vana = data.vana || null;
        return boru;
    }
}

/**
 * Factory fonksiyon
 */
export function createBoru(p1, p2, tip = 'STANDART') {
    return new Boru(p1, p2, tip);
}
