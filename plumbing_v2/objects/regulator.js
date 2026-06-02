/**
 * Regülatör Bileşeni
 * Hat üzerinde vana gibi konumlanır. Çıkış noktasında basıncı düşürür.
 *
 * Çıkış basıncı seçenekleri: 21 / 50 mbar (default 21)
 */

export const REGULATOR_CONFIG = {
    width: 6,    // cm — vana ile aynı
    height: 12,  // cm
    color: 0xA0A0A0,
};

export const REGULATOR_CIKIS_BASINCLARI = ['21', '50'];

export class Regulator {
    constructor(x, y, options = {}) {
        this.id = `regulator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'regulator';

        // Pozisyon
        this.x = x;
        this.y = y;
        this.z = options.z || 0;
        this.rotation = 0;

        this.config = { ...REGULATOR_CONFIG };
        this.floorId = options.floorId || null;

        // Boru üzerindeki pozisyon (0-1 arası)
        this.boruPozisyonu = options.boruPozisyonu !== undefined ? options.boruPozisyonu : null;
        this.bagliBoruId = options.bagliBoruId || null;

        // Uçtan sabit mesafe (cm)
        this.fromEnd = options.fromEnd || null; // 'p1' veya 'p2'
        this.fixedDistance = options.fixedDistance || null;

        // Çıkış basıncı (mbar) — '21' veya '50'
        this.cikisBasinc = options.cikisBasinc || '21';

        // Shut-Off (otomatik gaz kesme) özelliği
        this.shutOff = options.shutOff !== undefined ? !!options.shutOff : true;

        // Ürün bilgisi — varsayılan boş; kullanıcı kataloğdan seçer.
        this.marka = options.marka !== undefined ? options.marka : '';
        this.model = options.model !== undefined ? options.model : '';

        // Otomatik aksesuarlar (default true)
        this.girisVana = options.girisVana !== undefined ? !!options.girisVana : true;
        this.girisManometre = options.girisManometre !== undefined ? !!options.girisManometre : true;
        this.cikisManometre = options.cikisManometre !== undefined ? !!options.cikisManometre : true;
        this.cikisVana = options.cikisVana !== undefined ? !!options.cikisVana : true;

        // Aksesuar referansları (ekle/sil için)
        this.iliskiliGirisVanaId = options.iliskiliGirisVanaId || null;
        this.iliskiliGirisManometreId = options.iliskiliGirisManometreId || null;
        this.iliskiliCikisManometreId = options.iliskiliCikisManometreId || null;
        this.iliskiliCikisVanaId = options.iliskiliCikisVanaId || null;

        this.isSelected = false;
    }

    getGirisLocalKoordinat() {
        return { x: -this.config.width / 2, y: 0 };
    }

    getCikisLocalKoordinat() {
        return { x: this.config.width / 2, y: 0 };
    }

    localToWorld(local) {
        const rad = this.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: this.x + local.x * cos - local.y * sin,
            y: this.y + local.x * sin + local.y * cos,
            z: this.z || 0,
        };
    }

    getGirisNoktasi() { return this.localToWorld(this.getGirisLocalKoordinat()); }
    getCikisNoktasi() { return this.localToWorld(this.getCikisLocalKoordinat()); }

    getKoseler() {
        const { width, height } = this.config;
        const halfW = width / 2;
        const halfH = height / 2;
        return [
            { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
            { x: halfW, y: halfH }, { x: -halfW, y: halfH },
        ].map(k => this.localToWorld(k));
    }

    /**
     * Boru referansı ile pozisyonu güncelle
     */
    updatePositionFromPipe(pipe) {
        if (!pipe || !this.bagliBoruId || pipe.id !== this.bagliBoruId) return null;

        let t = this.boruPozisyonu;

        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const length = Math.hypot(dx, dy, dz);

        if (this.fixedDistance !== null && this.fromEnd && length > 0) {
            if (this.fromEnd === 'p1') {
                t = Math.min(this.fixedDistance / length, 0.95);
            } else if (this.fromEnd === 'p2') {
                t = Math.max(1 - (this.fixedDistance / length), 0.05);
            }
            this.boruPozisyonu = t;
        }

        const pos = pipe.getPointAt(t);
        this.x = pos.x;
        this.y = pos.y;
        this.z = pos.z;

        const len2d = Math.hypot(dx, dy);
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;
        this.rotation = isVertical ? -45 : pipe.aciDerece;

        return { x: this.x, y: this.y };
    }

    /**
     * Boru üzerinde konumu değiştir (sürükleme)
     */
    moveAlongPipe(pipe, point, otherObjects = []) {
        if (!pipe || !this.bagliBoruId || pipe.id !== this.bagliBoruId) return false;

        const proj = pipe.projectPoint(point);
        if (!proj || !proj.onSegment) return false;

        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const pipeLength = Math.hypot(dx, dy, dz);
        if (pipeLength < 0.1) return false;

        const MIN_EDGE_DISTANCE = 1; // cm
        const OBJECT_MARGIN = 1;
        const minT = MIN_EDGE_DISTANCE / pipeLength;
        const maxT = 1 - (MIN_EDGE_DISTANCE / pipeLength);

        let newT = Math.max(minT, Math.min(maxT, proj.t));

        const width = this.config.width || 8;
        const halfWidth = width / 2;
        let newLeftT = newT - (OBJECT_MARGIN + halfWidth) / pipeLength;
        let newRightT = newT + (halfWidth + OBJECT_MARGIN) / pipeLength;

        if (newLeftT < minT) {
            newT = minT + (OBJECT_MARGIN + halfWidth) / pipeLength;
            newLeftT = minT;
            newRightT = newT + (halfWidth + OBJECT_MARGIN) / pipeLength;
        }
        if (newRightT > maxT) {
            newT = maxT - (halfWidth + OBJECT_MARGIN) / pipeLength;
            newLeftT = newT - (OBJECT_MARGIN + halfWidth) / pipeLength;
            newRightT = maxT;
        }
        if (newLeftT < 0 || newRightT > 1) return false;

        const others = otherObjects.filter(obj => obj.id !== this.id);
        for (const obj of others) {
            const objLeftT = obj.t - (OBJECT_MARGIN + obj.width / 2) / pipeLength;
            const objRightT = obj.t + (obj.width / 2 + OBJECT_MARGIN) / pipeLength;
            if (!(newRightT < objLeftT || newLeftT > objRightT)) {
                const distToLeft = Math.abs(newT - objLeftT);
                const distToRight = Math.abs(newT - objRightT);
                if (distToLeft < distToRight) {
                    newT = objLeftT - (halfWidth + OBJECT_MARGIN) / pipeLength;
                } else {
                    newT = objRightT + (OBJECT_MARGIN + halfWidth) / pipeLength;
                }
                newLeftT = newT - (OBJECT_MARGIN + halfWidth) / pipeLength;
                newRightT = newT + (halfWidth + OBJECT_MARGIN) / pipeLength;
                if (newLeftT < minT || newRightT > maxT) return false;
            }
        }

        const newPos = pipe.getPointAt(newT);
        this.boruPozisyonu = newT;
        this.x = newPos.x;
        this.y = newPos.y;
        this.z = newPos.z;

        const len2d = Math.hypot(dx, dy);
        const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;
        this.rotation = isVertical ? -45 : pipe.aciDerece;

        // Boru ucuna yakınsa fixedDistance ayarla
        const END_THRESHOLD_CM = 10;
        const REG_GENISLIGI = this.config.width || 6;
        const fixedDistanceFromEnd = REG_GENISLIGI / 2;
        const distToP1 = newT * pipeLength;
        const distToP2 = (1 - newT) * pipeLength;

        if (distToP2 < END_THRESHOLD_CM) {
            this.fromEnd = 'p2';
            this.fixedDistance = fixedDistanceFromEnd;
        } else if (distToP1 < END_THRESHOLD_CM) {
            this.fromEnd = 'p1';
            this.fixedDistance = fixedDistanceFromEnd;
        } else {
            this.fixedDistance = null;
            this.fromEnd = null;
        }

        return true;
    }

    attachToPipe(pipeId, t, options = {}) {
        this.bagliBoruId = pipeId;
        this.boruPozisyonu = t;
        this.fromEnd = options.fromEnd || null;
        this.fixedDistance = options.fixedDistance || null;
    }

    detachFromPipe() {
        this.bagliBoruId = null;
        this.boruPozisyonu = null;
        this.fromEnd = null;
        this.fixedDistance = null;
    }

    getBoundingBox() {
        const koseler = this.getKoseler();
        const xs = koseler.map(k => k.x);
        const ys = koseler.map(k => k.y);
        return {
            minX: Math.min(...xs), maxX: Math.max(...xs),
            minY: Math.min(...ys), maxY: Math.max(...ys),
        };
    }

    containsPoint(point) {
        const bbox = this.getBoundingBox();
        const tolerance = 8;
        return (
            point.x >= bbox.minX - tolerance &&
            point.x <= bbox.maxX + tolerance &&
            point.y >= bbox.minY - tolerance &&
            point.y <= bbox.maxY + tolerance
        );
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            z: this.z,
            rotation: this.rotation,
            boruPozisyonu: this.boruPozisyonu,
            bagliBoruId: this.bagliBoruId,
            fromEnd: this.fromEnd,
            fixedDistance: this.fixedDistance,
            floorId: this.floorId,
            cikisBasinc: this.cikisBasinc,
            muhafaza: this.muhafaza,
            muhafazaGrupla: this.muhafazaGrupla,
            shutOff: this.shutOff,
            marka: this.marka,
            model: this.model,
            girisVana: this.girisVana,
            girisManometre: this.girisManometre,
            cikisManometre: this.cikisManometre,
            cikisVana: this.cikisVana,
            iliskiliGirisVanaId: this.iliskiliGirisVanaId,
            iliskiliGirisManometreId: this.iliskiliGirisManometreId,
            iliskiliCikisManometreId: this.iliskiliCikisManometreId,
            iliskiliCikisVanaId: this.iliskiliCikisVanaId,
            description: this.description ?? '',
        };
    }

    static fromJSON(data) {
        const reg = new Regulator(data.x, data.y, {
            floorId: data.floorId,
            boruPozisyonu: data.boruPozisyonu,
            bagliBoruId: data.bagliBoruId,
            fromEnd: data.fromEnd,
            fixedDistance: data.fixedDistance,
            cikisBasinc: data.cikisBasinc,
            shutOff: data.shutOff,
            marka: data.marka,
            model: data.model,
            girisVana: data.girisVana,
            girisManometre: data.girisManometre,
            cikisManometre: data.cikisManometre,
            cikisVana: data.cikisVana,
            iliskiliGirisVanaId: data.iliskiliGirisVanaId,
            iliskiliGirisManometreId: data.iliskiliGirisManometreId,
            iliskiliCikisManometreId: data.iliskiliCikisManometreId,
            iliskiliCikisVanaId: data.iliskiliCikisVanaId,
        });
        reg.z = data.z || 0;
        reg.id = data.id;
        reg.rotation = data.rotation || 0;
        if (data.cikisBasinc !== undefined) reg.cikisBasinc = data.cikisBasinc;
        if (data.muhafaza !== undefined) reg.muhafaza = data.muhafaza;
        if (data.muhafazaGrupla !== undefined) reg.muhafazaGrupla = data.muhafazaGrupla;
        reg.description = data.description ?? '';
        return reg;
    }
}

export function createRegulator(x, y, options = {}) {
    return new Regulator(x, y, options);
}
