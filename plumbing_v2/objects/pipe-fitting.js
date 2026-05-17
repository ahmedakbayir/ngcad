/**
 * Tesisat Aksesuarları (Pipe Fittings)
 * Filtre, İzolasyon Flanşı, Kompansatör, Manometre
 *
 * Vana/Regülatör ile aynı şekilde boru üzerine yerleşirler ama
 * basınç hesaplarına dahil değildirler — sadece görsel/etiket.
 */

export const FITTING_CONFIG = {
    width: 6,    // cm — vana ile aynı
    height: 12,  // cm
};

// Tipler ve etiket bilgileri
export const FITTING_DEFS = {
    filtre: {
        type: 'filtre',
        label: 'Filtre',
        defaultMarka: '',
        defaultModel: '',
    },
    izolasyon_flansi: {
        type: 'izolasyon_flansi',
        label: 'İzolasyon Flanşı',
        defaultMarka: '',
        defaultModel: '',
    },
    kompansator: {
        type: 'kompansator',
        label: 'Kompansatör',
        defaultMarka: '',
        defaultModel: '',
    },
    manometre: {
        type: 'manometre',
        label: 'Manometre',
        defaultMarka: '',
        defaultModel: '',
    },
    topraklama: {
        type: 'topraklama',
        label: 'Topraklama',
        defaultMarka: '',
        defaultModel: '',
    },
};

export const TOPRAKLAMA_YONTEMLERI = [
    'Bakır Çubuk: ø16-L:1.5m',
    'Bakır Çubuk: ø20-L:1.25m',
    'Bakır Levha: 0.5m²-Kalınlık:2mm',
];

/**
 * Vana stili — boru üzerinde serbest kayar, basınç değiştirmez.
 */
export class PipeFitting {
    constructor(type, x, y, options = {}) {
        const def = FITTING_DEFS[type];
        if (!def) throw new Error(`Bilinmeyen tesisat aksesuarı tipi: ${type}`);

        this.id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = type;

        this.x = x;
        this.y = y;
        this.z = options.z || 0;
        this.rotation = 0;

        this.config = { ...FITTING_CONFIG };
        this.floorId = options.floorId || null;

        // Boru üzerindeki pozisyon
        this.boruPozisyonu = options.boruPozisyonu !== undefined ? options.boruPozisyonu : null;
        this.bagliBoruId = options.bagliBoruId || null;
        this.fromEnd = options.fromEnd || null;
        this.fixedDistance = options.fixedDistance || null;

        // Ortak property'ler
        this.marka = options.marka !== undefined ? options.marka : def.defaultMarka;
        this.model = options.model !== undefined ? options.model : def.defaultModel;
        this.muhafaza = options.muhafaza !== undefined ? !!options.muhafaza : false;
        // Muhafaza açıldığında varsayılan olarak komşu nesnelerle grupla
        this.muhafazaGrupla = options.muhafazaGrupla !== undefined ? !!options.muhafazaGrupla : true;
        this.description = options.description ?? '';

        // Filtreye özel: konik
        if (type === 'filtre') {
            this.konik = options.konik !== undefined ? !!options.konik : false;
        }

        // Topraklamaya özel: yöntem + yön (1 = pipe'ın bir yanı, -1 = öbür yanı)
        if (type === 'topraklama') {
            this.topraklamaYontemi = options.topraklamaYontemi !== undefined
                ? options.topraklamaYontemi
                : TOPRAKLAMA_YONTEMLERI[0];
            this.direction = options.direction === -1 ? -1 : 1;
        }

        this.isSelected = false;
    }

    getGirisLocalKoordinat() { return { x: -this.config.width / 2, y: 0 }; }
    getCikisLocalKoordinat() { return { x: this.config.width / 2, y: 0 }; }

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

    updatePositionFromPipe(pipe) {
        if (!pipe || !this.bagliBoruId || pipe.id !== this.bagliBoruId) return null;

        let t = this.boruPozisyonu;
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const length = Math.hypot(dx, dy, dz);

        if (this.fixedDistance !== null && this.fromEnd && length > 0) {
            if (this.fromEnd === 'p1') t = Math.min(this.fixedDistance / length, 0.95);
            else if (this.fromEnd === 'p2') t = Math.max(1 - (this.fixedDistance / length), 0.05);
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

    moveAlongPipe(pipe, point, otherObjects = []) {
        if (!pipe || !this.bagliBoruId || pipe.id !== this.bagliBoruId) return false;
        const proj = pipe.projectPoint(point);
        if (!proj || !proj.onSegment) return false;

        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
        const pipeLength = Math.hypot(dx, dy, dz);
        if (pipeLength < 0.1) return false;

        const MIN_EDGE_DISTANCE = 1;
        const OBJECT_MARGIN = 1;
        const minT = MIN_EDGE_DISTANCE / pipeLength;
        const maxT = 1 - (MIN_EDGE_DISTANCE / pipeLength);

        let newT = Math.max(minT, Math.min(maxT, proj.t));
        const width = this.config.width || 6;
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

        // Boru ucuna yakınsa fixedDistance ayarla (vana mantığı)
        const END_THRESHOLD_CM = 10;
        const fixedDistanceFromEnd = (this.config.width || 6) / 2;
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
        const out = {
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
            marka: this.marka,
            model: this.model,
            muhafaza: this.muhafaza,
            muhafazaGrupla: this.muhafazaGrupla,
            description: this.description ?? '',
        };
        if (this.type === 'filtre') out.konik = !!this.konik;
        if (this.type === 'topraklama') {
            out.topraklamaYontemi = this.topraklamaYontemi;
            out.direction = this.direction;
        }
        return out;
    }

    static fromJSON(data) {
        const f = new PipeFitting(data.type, data.x, data.y, {
            floorId: data.floorId,
            boruPozisyonu: data.boruPozisyonu,
            bagliBoruId: data.bagliBoruId,
            fromEnd: data.fromEnd,
            fixedDistance: data.fixedDistance,
            marka: data.marka,
            model: data.model,
            muhafaza: data.muhafaza,
            muhafazaGrupla: data.muhafazaGrupla,
            description: data.description,
            konik: data.konik,
            topraklamaYontemi: data.topraklamaYontemi,
            direction: data.direction,
        });
        f.z = data.z || 0;
        f.id = data.id;
        f.rotation = data.rotation || 0;
        return f;
    }
}

export function createPipeFitting(type, x, y, options = {}) {
    return new PipeFitting(type, x, y, options);
}
