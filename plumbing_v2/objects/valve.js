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
    height: 12,          // cm
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
    SISMIK: {
        id: 'SISMIK',
        name: 'Sismik Vana',
        kategori: 'ara',
        sembol: 'elektrik'
    },
    // Sonlanma Vanaları
    BRANSMAN: {
        id: 'BRANSMAN',
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
};

// Kategori listesi
export const ARA_VANALAR = ['AKV', 'EMNIYET', 'CIHAZ', 'SELENOID', 'SISMIK'];
export const SONLANMA_VANALARI = ['BRANSMAN', 'YAN_BINA'];

export class Vana {
    constructor(x, y, tip = 'AKV', options = {}) {
        this.id = `vana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'vana';

        // Pozisyon
        this.x = x;
        this.y = y;
        this.z = options.z || 0; // Z değeri
        this.rotation = 0; // derece

        // Vana tipi
        this.vanaTipi = tip;
        this.config = { ...VANA_CONFIG };
        this.floorId = options.floorId || null;

        // Bağlantılar (deprecated - artık kullanılmıyor)
        this.girisBagliBoruId = null;
        this.cikisBagliBoruId = null;

        // *** YENİ YAPI: Boru üzerinde serbest kayabilir vana ***
        // Boru üzerindeki pozisyon (0-1 arası normalized değer)
        this.boruPozisyonu = options.boruPozisyonu !== undefined ? options.boruPozisyonu : null;

        // Bağlı olduğu boru
        this.bagliBoruId = options.bagliBoruId || null;

        // Uçtan sabit mesafe (cm) - borunun uzunluğu değişse bile bu mesafe korunur
        this.fromEnd = options.fromEnd || null; // 'p1' veya 'p2'
        this.fixedDistance = options.fixedDistance || null; // cm cinsinden mesafe

        // Kapama sembolü (end cap) gösterilmeli mi?
        // Vana boru ucunda ve boru ucu boştaysa true
        this.showEndCap = false;

        // Seçim durumu
        this.isSelected = false;
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
            y: this.y + local.x * sin + local.y * cos,
            z: this.z || 0 // Z değerini ekle
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
     * Branşman vanasını emniyet vanasına dönüştür (sayaç bağlandığında)
     */
    bransmandanSayacVanasiyaDonustur() {
        if (this.vanaTipi === 'BRANSMAN') {
            this.vanaTipi = 'EMNIYET';
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
     * Taşı (serbest taşıma)
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
     * Boru referansı ile pozisyonu güncelle
     * @param {Boru} pipe - Bağlı olduğu boru
     * @returns {object} - Hesaplanan pozisyon {x, y}
     */
    /**
         * Boru referansı ile pozisyonu güncelle
         */
    updatePositionFromPipe(pipe) {
        if (!pipe || !this.bagliBoruId || pipe.id !== this.bagliBoruId) {
            return null;
        }

        let t = this.boruPozisyonu;

const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const length = Math.hypot(dx, dy, dz); // 3D Uzunluk

        // Eğer fixedDistance varsa, uçtan sabit mesafe olarak hesapla
        if (this.fixedDistance !== null && this.fromEnd && length > 0) {
            
            if (this.fromEnd === 'p1') {
                t = Math.min(this.fixedDistance / length, 0.95);
            } else if (this.fromEnd === 'p2') {
                t = Math.max(1 - (this.fixedDistance / length), 0.05);
            }
            this.boruPozisyonu = t;
        }

        // Pozisyonu hesapla
        const pos = pipe.getPointAt(t);
        this.x = pos.x;
        this.y = pos.y;
        this.z = pos.z; // Z değerini güncelle
        
        // Düşey Boru Açı Kontrolü
        const len2d = Math.hypot(dx, dy);
        // Boru düşey mi? (Z farkı baskın veya 2D boy çok kısa)
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

        if (isVertical) {
            this.rotation = -45; // Düşey boruda sabit açı
        } else {
            this.rotation = pipe.aciDerece; // Yatay boruda normal açı
        }

        return { x: this.x, y: this.y };
    }

    /**
     * Bir borunun verilen ucunun sonlanma vanası için müsait olup olmadığını döner.
     * Müsait = o ucta başka boru, fleks (cihaz/sayaç) veya başka sonlanma vana yok.
     */
    static isPipeEndAvailableForSonlanma(manager, pipe, endpoint, excludeVanaId = null) {
        if (!manager || !pipe || !endpoint) return false;
        const node = pipe[endpoint];
        if (!node) return false;
        const TOL = 1; // cm

        for (const other of (manager.pipes || [])) {
            if (other.id === pipe.id) continue;
            const d1 = Math.hypot(node.x - other.p1.x, node.y - other.p1.y, (node.z || 0) - (other.p1.z || 0));
            const d2 = Math.hypot(node.x - other.p2.x, node.y - other.p2.y, (node.z || 0) - (other.p2.z || 0));
            if (d1 < TOL || d2 < TOL) return false;
        }

        for (const c of (manager.components || [])) {
            if ((c.type === 'cihaz' || c.type === 'sayac') && c.fleksBaglanti
                && c.fleksBaglanti.boruId === pipe.id && c.fleksBaglanti.endpoint === endpoint) {
                return false;
            }
        }

        for (const c of (manager.components || [])) {
            if (c.type !== 'vana' || c.id === excludeVanaId) continue;
            if (!SONLANMA_VANALARI.includes(c.vanaTipi)) continue;
            if (c.bagliBoruId === pipe.id && c.fromEnd === endpoint) return false;
        }
        return true;
    }

    /**
     * Vanayı bağlı olduğu borunun en uygun boş ucuna taşır (sonlanma için).
     * Önce p2, sonra p1 denenir. Hiçbiri uygun değilse false döner ve vana değişmez.
     */
    snapToFreeEnd(manager) {
        if (!manager || !this.bagliBoruId) return false;
        const pipe = (manager.pipes || []).find(p => p.id === this.bagliBoruId);
        if (!pipe) return false;

        const SONLANMA_FIXED_CM = 1;
        if (this.fromEnd && this.fixedDistance != null && this.fixedDistance <= 3
            && Vana.isPipeEndAvailableForSonlanma(manager, pipe, this.fromEnd, this.id)) {
            this.fixedDistance = SONLANMA_FIXED_CM;
            this.updatePositionFromPipe(pipe);
            return true;
        }

        for (const end of ['p2', 'p1']) {
            if (Vana.isPipeEndAvailableForSonlanma(manager, pipe, end, this.id)) {
                this.fromEnd = end;
                this.fixedDistance = SONLANMA_FIXED_CM;
                this.updatePositionFromPipe(pipe);
                return true;
            }
        }
        return false;
    }

    /**
     * Boru üzerinde pozisyonu değiştir (sürüklenirken)
     * @param {Boru} pipe - Bağlı olduğu boru
     * @param {object} point - Hedef nokta {x, y}
     * @param {Array} otherObjects - Boru üzerindeki diğer nesneler [{t, width}, ...]
     * @param {object} [manager] - PlumbingManager (sonlanma vanasının uç müsaitlik kontrolü için)
     * @returns {boolean} - Başarılı mı?
     */
    moveAlongPipe(pipe, point, otherObjects = [], manager = null) {
        if (!pipe || !this.bagliBoruId || pipe.id !== this.bagliBoruId) {
            return false;
        }

        // Noktayı boru üzerine projeksiyonla (3D destekli pipe.projectPoint kullanır)
        const proj = pipe.projectPoint(point);
        if (!proj || !proj.onSegment) {
            return false;
        }

        // --- DÜZELTME BAŞLANGIÇ: 3D Uzunluk Hesabı ---
        // pipe.uzunluk sadece 2D (hypot(dx, dy)) verir. Düşey boruda 0 olur.
        // Z farkını da katarak gerçek 3D uzunluğu hesaplıyoruz.
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const pipeLength = Math.hypot(dx, dy, dz); // 3D Uzunluk

        // Boru çok kısaysa işlem yapma
        if (pipeLength < 0.1) return false;
        // --- DÜZELTME BİTİŞ ---

        // Mesafe kontrolü: uçlardan 1cm (ara vanalar), sonlanma vanaları için 0.5cm
        const MIN_EDGE_DISTANCE = this.isSonlanma() ? 0.5 : 1; // cm
        const OBJECT_MARGIN = 1; // cm - Her nesnenin sağında ve solunda

        const minT = MIN_EDGE_DISTANCE / pipeLength;
        const maxT = 1 - (MIN_EDGE_DISTANCE / pipeLength);

        // t değerini sınırla
        let newT = Math.max(minT, Math.min(maxT, proj.t));

        // Vana genişliği
        const vanaWidth = this.config.width || 8; // cm
        const halfWidth = vanaWidth / 2;

        // Nesnenin sol ve sağ uçlarını hesapla (margin dahil)
        let newLeftT = newT - (OBJECT_MARGIN + halfWidth) / pipeLength;
        let newRightT = newT + (halfWidth + OBJECT_MARGIN) / pipeLength;

        // Önce boru sınırlarını kontrol et - sınır dışındaysa içeri kaydır
        if (newLeftT < minT) {
            // Sol tarafa taşıyor, sağa kaydır
            newT = minT + (OBJECT_MARGIN + halfWidth) / pipeLength;
            newLeftT = minT;
            newRightT = newT + (halfWidth + OBJECT_MARGIN) / pipeLength;
        }
        if (newRightT > maxT) {
            // Sağ tarafa taşıyor, sola kaydır
            newT = maxT - (halfWidth + OBJECT_MARGIN) / pipeLength;
            newLeftT = newT - (OBJECT_MARGIN + halfWidth) / pipeLength;
            newRightT = maxT;
        }

        // Tekrar sınır kontrolü - kaydırma sonrası hala sınır dışındaysa hareket etme
        // (Boru çok kısaysa ve vana sığmıyorsa buraya düşer)
        if (newLeftT < 0 || newRightT > 1) { // minT/maxT yerine 0/1 ile genel kontrol
            console.log('Vana boru sınırları içine sığmıyor');
            return false;
        }

        // Diğer nesnelerle çakışma kontrolü
        // Kendini filtrele (kendi id'si hariç)
        const others = otherObjects.filter(obj => obj.id !== this.id);

        for (const obj of others) {
            const objLeftT = obj.t - (OBJECT_MARGIN + obj.width / 2) / pipeLength;
            const objRightT = obj.t + (obj.width / 2 + OBJECT_MARGIN) / pipeLength;

            // Çakışma var mı kontrol et
            if (!(newRightT < objLeftT || newLeftT > objRightT)) {
                // Çakışma var! En yakın uygun pozisyonu bul
                // Sol tarafına mı yoksa sağ tarafına mı daha yakınız?
                const distToLeft = Math.abs(newT - objLeftT);
                const distToRight = Math.abs(newT - objRightT);

                if (distToLeft < distToRight) {
                    // Sol tarafa kaydır
                    newT = objLeftT - (halfWidth + OBJECT_MARGIN) / pipeLength;
                } else {
                    // Sağ tarafa kaydır
                    newT = objRightT + (OBJECT_MARGIN + halfWidth) / pipeLength;
                }

                // Kaydırma sonrası sınırları kontrol et
                newLeftT = newT - (OBJECT_MARGIN + halfWidth) / pipeLength;
                newRightT = newT + (halfWidth + OBJECT_MARGIN) / pipeLength;

                if (newLeftT < minT || newRightT > maxT) {
                    // Uygun yer yok, hareket etme
                    return false;
                }
            }
        }

        // Pozisyonu hesapla ve güncelle
        const newPos = pipe.getPointAt(newT);
        this.boruPozisyonu = newT;
        this.x = newPos.x;
        this.y = newPos.y;
        this.z = newPos.z; // Z değerini de güncelle

        // --- DÜZELTME: AÇI KONTROLÜ (Düşey boru için) ---
        // Düşey boruda açıyı korumak için kontrol (önceki düzeltmelerle uyumlu)
        const len2d = Math.hypot(dx, dy);
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

        if (isVertical) {
            this.rotation = -45;
        } else {
            this.rotation = pipe.aciDerece;
        }
        // ------------------------------------------------

        // Boru ucuna yakınsa fromEnd ve fixedDistance'ı tekrar set et
        // DÜZELTME: Threshold'u 10cm'den 3cm'e düşürdük - vana daha az atlayacak
        const END_THRESHOLD_CM = 10; // 3 cm içindeyse uç sayılır (eski: 10)
        const VANA_GENISLIGI = 8;
        const BORU_UCU_BOSLUK = 0; // Ara vanalar için boşluk
        const fixedDistanceFromEnd = this.isSonlanma() ? 1 : (VANA_GENISLIGI / 2 + BORU_UCU_BOSLUK); // Sonlanma: 1cm, Ara: 5cm

        const distToP1 = newT * pipeLength; // 3D Uzunluk kullanılıyor
        const distToP2 = (1 - newT) * pipeLength;

        // *** SONLANMA VANALARI İÇİN ÖZEL MANTIK ***
        // Sonlanma vanası (BRANSMAN, YAN_BINA) hat ucunda sonlandırma görevindedir.
        // Asla orta yere kayamaz; sürüklenirken hep MÜSAİT en yakın uca snap olur.
        // Diğer uçta başka boru, fleks veya sonlanma vana varsa o uç kapalıdır;
        // vana o tarafa kaydırılamaz.
        if (this.isSonlanma()) {
            // Manager verilmişse her uç için müsaitlik kontrolü yap; yoksa
            // (eski çağrılar) ikisi de müsait kabul edilir.
            const p2Avail = !manager || Vana.isPipeEndAvailableForSonlanma(manager, pipe, 'p2', this.id);
            const p1Avail = !manager || Vana.isPipeEndAvailableForSonlanma(manager, pipe, 'p1', this.id);

            const STICKY_THRESHOLD = 15; // mevcut uca daha yakınsa onu bırakma
            let target;
            if (this.fromEnd === 'p2' && p2Avail && distToP2 < STICKY_THRESHOLD) {
                target = 'p2';
            } else if (this.fromEnd === 'p1' && p1Avail && distToP1 < STICKY_THRESHOLD) {
                target = 'p1';
            } else if (p2Avail && p1Avail) {
                target = (distToP2 <= distToP1) ? 'p2' : 'p1';
            } else if (p2Avail) {
                target = 'p2';
            } else if (p1Avail) {
                target = 'p1';
            } else {
                // Hiç müsait uç yok — mevcut bağlılığı koru (kuralın bir
                // şekilde ihlal edilmiş olduğu kalıntı durum için emniyet).
                target = this.fromEnd || 'p2';
            }
            this.fromEnd = target;
            this.fixedDistance = fixedDistanceFromEnd;

            // Pozisyonu seçilen uca göre yeniden hesapla — orta yerde kalmasın.
            const endT = this.fromEnd === 'p2'
                ? Math.max(1 - fixedDistanceFromEnd / pipeLength, 0.05)
                : Math.min(fixedDistanceFromEnd / pipeLength, 0.95);
            const endPos = pipe.getPointAt(endT);
            this.boruPozisyonu = endT;
            this.x = endPos.x;
            this.y = endPos.y;
            this.z = endPos.z;
        } else {
            // *** ARA VANALAR İÇİN MEVCUT MANTIK ***
            if (distToP2 < END_THRESHOLD_CM) {
                // p2 ucuna yakın
                this.fromEnd = 'p2';
                this.fixedDistance = fixedDistanceFromEnd;
            } else if (distToP1 < END_THRESHOLD_CM) {
                // p1 ucuna yakın
                this.fromEnd = 'p1';
                this.fixedDistance = fixedDistanceFromEnd;
            } else {
                // Ortada, serbest
                this.fixedDistance = null;
                this.fromEnd = null;
            }
        }

        return true;
    }

    /**
     * Vana'yı bir boruya bağla
     * @param {string} pipeId - Boru ID
     * @param {number} t - Boru üzerindeki pozisyon (0-1)
     * @param {object} options - {fromEnd, fixedDistance}
     */
    attachToPipe(pipeId, t, options = {}) {
        this.bagliBoruId = pipeId;
        this.boruPozisyonu = t;
        this.fromEnd = options.fromEnd || null;
        this.fixedDistance = options.fixedDistance || null;
    }

    /**
     * Vana'yı borudan ayır
     */
    detachFromPipe() {
        this.bagliBoruId = null;
        this.boruPozisyonu = null;
        this.fromEnd = null;
        this.fixedDistance = null;
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
        const tolerance = 8; // cm — seçim alanı genişletildi

        return (
            point.x >= bbox.minX - tolerance &&
            point.x <= bbox.maxX + tolerance &&
            point.y >= bbox.minY - tolerance &&
            point.y <= bbox.maxY + tolerance
        );
    }

    /**
     * Vana çıkışına kapama sembolü eklenip eklenmeyeceğini kontrol et
     * KURALLAR:
     * - Sonlanma vanaları (BRANSMAN, YAN_BINA, DOMESTIK): Boruya bağlı ise DAIMA göster
     * - Ara vanalar: Vana boru ucunda olmalı VE boru ucu boş olmalı
     * @param {object} manager - PlumbingManager instance
     * @returns {boolean} - Kapama sembolü gösterilmeli mi?
     */
    checkEndCap(manager) {
        if (!manager) return false;
        // KURAL: Kapama sembolü yalnızca SONLANMA vanaları (BRANŞMAN, YAN_BİNA)
        // için gösterilir. AKV/EMNIYET/CIHAZ/SELENOID gibi ara vanalar hiçbir
        // koşulda kapama göstermez.
        if (!this.isSonlanma()) return false;

        // Boruya bağlı ve bir uca yapışık olmalı
        if (!this.bagliBoruId || !this.fromEnd) return false;

        const pipe = manager.findPipeById(this.bagliBoruId);
        if (!pipe) return false;

        // Vananın yapışık olduğu uç gerçekten boş mu? (hat orada sonlanıyor mu?)
        // Köşe yapıp devam eden hatlarda kapama gösterilmemeli.
        const endpoint = this.fromEnd; // 'p1' veya 'p2'
        const endPoint = pipe[endpoint];
        const tolerance = 1; // cm
        let pipeCount = 0;

        for (const otherPipe of manager.pipes) {
            if (otherPipe.floorId && pipe.floorId && otherPipe.floorId !== pipe.floorId) continue;
            const distP1 = Math.hypot(endPoint.x - otherPipe.p1.x, endPoint.y - otherPipe.p1.y);
            const distP2 = Math.hypot(endPoint.x - otherPipe.p2.x, endPoint.y - otherPipe.p2.y);
            if (distP1 < tolerance || distP2 < tolerance) pipeCount++;
            if (pipeCount >= 2) return false; // başka boru var → hat devam ediyor
        }
        if (pipeCount !== 1) return false; // kendisi bile yoksa anomali

        // O uca cihaz/sayaç fleksi bağlıysa hat sonu değil
        for (const comp of manager.components) {
            if ((comp.type === 'cihaz' || comp.type === 'sayac') && comp.fleksBaglanti) {
                if (comp.fleksBaglanti.boruId === pipe.id && comp.fleksBaglanti.endpoint === endpoint) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Kapama sembolü durumunu güncelle
     * Pozisyon güncellemelerinde çağrılmalı
     * @param {object} manager - PlumbingManager instance
     */
    updateEndCapStatus(manager) {
        // Tek kural: checkEndCap (yalnızca sonlanma vanası + gerçekten boş uç).
        // "Sonlanma → daima true" kestirmesi, köşe yapıp devam eden hatlarda ve
        // ara vana yanlışlıkla sonlanma sınıfında kalmışsa kapamayı yanlış
        // gösteriyordu.
        this.showEndCap = this.checkEndCap(manager);
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
            z: this.z, // Z değerini kaydet
            rotation: this.rotation,
            girisBagliBoruId: this.girisBagliBoruId,
            cikisBagliBoruId: this.cikisBagliBoruId,
            boruPozisyonu: this.boruPozisyonu,
            bagliBoruId: this.bagliBoruId,
            fromEnd: this.fromEnd,
            fixedDistance: this.fixedDistance,
            floorId: this.floorId,
            showEndCap: this.showEndCap, // Kapama sembolü durumu
            // Panel özellikleri
            vanaCap: this.vanaCap,
            izolator: this.izolator,
            flans: this.flans,
            muhafaza: this.muhafaza,
            muhafazaGrupla: this.muhafazaGrupla,
            birimNo: this.birimNo,
            tesisatNo: this.tesisatNo,
            daireSayisi: this.daireSayisi,
            dukkanSayisi: this.dukkanSayisi,
            ekDebi: this.ekDebi,
            bransmanDebi: this.bransmanDebi,
            ilerdeKullanim: this.ilerdeKullanim,
            birimSayisi: this.birimSayisi,
            birimTipi: this.birimTipi,
            aboneAdi: this.aboneAdi,
            aboneNo: this.aboneNo,
            description: this.description ?? ''
        };
    }

    /**
     * Deserialize
     */
    static fromJSON(data) {
        const vana = new Vana(data.x, data.y, data.vanaTipi, {
            floorId: data.floorId,
            boruPozisyonu: data.boruPozisyonu,
            bagliBoruId: data.bagliBoruId,
            fromEnd: data.fromEnd,
            fixedDistance: data.fixedDistance
        });
        vana.z = data.z || 0; // Z değerini yükle
        vana.id = data.id;
        vana.rotation = data.rotation;
        vana.girisBagliBoruId = data.girisBagliBoruId;
        vana.cikisBagliBoruId = data.cikisBagliBoruId;
        vana.showEndCap = data.showEndCap || false; // Kapama sembolü durumunu yükle
        // Panel özellikleri
        if (data.vanaCap !== undefined) vana.vanaCap = data.vanaCap;
        if (data.izolator !== undefined) vana.izolator = data.izolator;
        if (data.flans !== undefined) vana.flans = data.flans;
        if (data.muhafaza !== undefined) vana.muhafaza = data.muhafaza;
        if (data.muhafazaGrupla !== undefined) vana.muhafazaGrupla = data.muhafazaGrupla;
        if (data.birimNo !== undefined) vana.birimNo = data.birimNo;
        if (data.tesisatNo !== undefined) vana.tesisatNo = data.tesisatNo;
        if (data.daireSayisi !== undefined) vana.daireSayisi = data.daireSayisi;
        if (data.dukkanSayisi !== undefined) vana.dukkanSayisi = data.dukkanSayisi;
        if (data.ekDebi !== undefined) vana.ekDebi = data.ekDebi;
        if (data.bransmanDebi !== undefined) vana.bransmanDebi = data.bransmanDebi;
        if (data.ilerdeKullanim !== undefined) vana.ilerdeKullanim = data.ilerdeKullanim;
        if (data.birimSayisi !== undefined) vana.birimSayisi = data.birimSayisi;
        if (data.birimTipi !== undefined) vana.birimTipi = data.birimTipi;
        if (data.aboneAdi !== undefined) vana.aboneAdi = data.aboneAdi;
        if (data.aboneNo !== undefined) vana.aboneNo = data.aboneNo;
        vana.description = data.description ?? '';
        return vana;
    }
}

/**
 * Factory fonksiyon
 */
export function createVana(x, y, tip = 'AKV', options = {}) {
    return new Vana(x, y, tip, options);
}