// onboarding-schematic.js
// Canvas-based interactive schematic for the onboarding panel.
// Shows ground line, service box (if column=yes), and stacked floors.
// Supports drag of ground floor offset (0 line ↔ ground floor bottom)
// and per-floor height resizing via bottom-edge handle.

const COLOR = {
    ground: '#bdbdbd',
    groundLabel: '#9aa0a6',
    floorFill: 'rgba(138, 180, 248, 0.85)',
    floorStroke: '#5c8be0',
    floorText: '#0a1428',
    dimText: '#cfd6e0',
    serviceBox: '#f5c542',
    serviceBoxStroke: '#b88a1a',
    canliHat: '#f5c542',
    earth: '#7a6f5e',
    earthText: '#e8e0d0',
};

// Schematic canvas controller
export class OnboardingSchematic {
    constructor(canvas, getState, onStateChange) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.getState = getState;
        this.onStateChange = onStateChange;
        // viewport
        this.dpr = window.devicePixelRatio || 1;
        this.W = 0;
        this.H = 0;
        this.scale = 1; // px per cm
        this.originX = 0;
        this.originY = 0; // y-pixel for ground (0) line
        // interaction
        this.hover = null;   // { kind, idx? }
        this.drag = null;    // { kind, idx?, startY, startVal }
        this.hitRegions = [];
        // events
        this._bindEvents();
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(canvas.parentElement || canvas);
        this._resize();
    }

    destroy() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
    }

    _resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.W = rect.width;
        this.H = rect.height;
        this.canvas.width = this.W * this.dpr;
        this.canvas.height = this.H * this.dpr;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.render();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', e => this._onDown(e));
        this.canvas.addEventListener('mousemove', e => this._onMove(e));
        window.addEventListener('mouseup',   e => this._onUp(e));
        this.canvas.addEventListener('mouseleave', () => {
            if (!this.drag) { this.hover = null; this.render(); }
        });
    }

    _localPos(e) {
        const r = this.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _hitAt(x, y) {
        for (let i = this.hitRegions.length - 1; i >= 0; i--) {
            const h = this.hitRegions[i];
            if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
        }
        return null;
    }

    _onDown(e) {
        const { x, y } = this._localPos(e);
        const hit = this._hitAt(x, y);
        if (!hit) return;
        const s = this.getState();
        if (hit.kind === 'groundOffset') {
            this.drag = { kind: 'groundOffset', startY: e.clientY, startVal: s.zeminKat0Offset || 0 };
        } else {
            return;
        }
        this.canvas.classList.add('ob-dragging');
        e.preventDefault();
    }

    _onMove(e) {
        const { x, y } = this._localPos(e);
        if (this.drag) {
            const dy = e.clientY - this.drag.startY;
            const dCm = -dy / this.scale; // up = positive
            if (this.drag.kind === 'groundOffset') {
                let next = Math.round((this.drag.startVal + dCm) / 5) * 5;
                next = Math.max(-300, Math.min(300, next));
                this.onStateChange({ zeminKat0Offset: next });
            }
            return;
        }
        const hit = this._hitAt(x, y);
        const prev = this.hover && (this.hover.kind + (this.hover.idx ?? ''));
        const next = hit && (hit.kind + (hit.idx ?? ''));
        if (prev !== next) {
            this.hover = hit;
            this.canvas.style.cursor = hit ? 'ns-resize' : 'default';
            this.render();
        }
    }

    _onUp() {
        if (!this.drag) return;
        this.drag = null;
        this.canvas.classList.remove('ob-dragging');
        this.render();
    }

    // ── RENDER ───────────────────────────────────────────────────
    render() {
        const ctx = this.ctx;
        const s = this.getState();
        ctx.clearRect(0, 0, this.W, this.H);
        this.hitRegions = [];

        // Build full floor list (bodrum + zemin + normal)
        const floors = this._buildFloors(s);

        // Determine total height (cm) used: from lowest bottom to highest top, plus margins
        let minCm = 0, maxCm = 0;
        if (floors.length) {
            minCm = Math.min(...floors.map(f => f.bottomCm));
            maxCm = Math.max(...floors.map(f => f.topCm));
        }
        // padding around ground line
        minCm = Math.min(minCm, -80);
        maxCm = Math.max(maxCm, 50);

        const padTop = 36, padBottom = 36, padLeft = 110, padRight = 80;
        const usableH = this.H - padTop - padBottom;
        const usableW = this.W - padLeft - padRight;
        const rangeCm = maxCm - minCm || 1;
        const scaleY = usableH / rangeCm;
        // shrink width too to keep things tidy; use a target box width
        const boxW = Math.min(220, usableW * 0.55);
        this.scale = scaleY;
        // origin: cm 0 in canvas y
        this.originY = padTop + (maxCm) * scaleY;
        this.originX = padLeft + usableW / 2;

        const xLeft  = this.originX - boxW / 2;
        const xRight = this.originX + boxW / 2;

        // ── earth fill (behind floors, with cutouts for floor rects) ─
        let earthTopY = this.originY;
        if (floors.length) {
            const lowestBottomCm = Math.min(...floors.map(f => f.bottomCm));
            const lowestBottomY  = this.originY - lowestBottomCm * scaleY;
            earthTopY = Math.min(earthTopY, lowestBottomY);
        }
        const earthLeftX  = padLeft - 20;
        const earthRightX = this.W - padRight + 20;
        // solid earth fill
        //   - Below ground line: full width (real underground earth)
        //   - Above ground line (when zemin is elevated): only under the building (pedestal)
        ctx.save();
        ctx.fillStyle = COLOR.earth;
        ctx.beginPath();
        const groundY = this.originY;
        const belowTop = Math.max(earthTopY, groundY);
        if (this.H > belowTop) {
            ctx.rect(earthLeftX, belowTop, earthRightX - earthLeftX, this.H - belowTop);
        }
        if (earthTopY < groundY) {
            ctx.rect(xLeft, earthTopY, boxW, groundY - earthTopY);
        }
        // cut out floor rectangles inside the earth area
        floors.forEach(f => {
            const yT = this.originY - f.topCm * scaleY;
            const yB = this.originY - f.bottomCm * scaleY;
            const cT = Math.max(yT, earthTopY);
            const cB = Math.min(yB, this.H);
            if (cB > cT) ctx.rect(xLeft, cT, boxW, cB - cT);
        });
        ctx.fill('evenodd');
        ctx.restore();

        // ── ground line (steps up under the building when zemin is elevated) ─
        ctx.strokeStyle = COLOR.ground;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const lineLeft  = padLeft - 16;
        const lineRight = this.W - padRight + 16;
        if (earthTopY < this.originY) {
            ctx.moveTo(lineLeft,    this.originY);
            ctx.lineTo(xLeft,       this.originY);
            ctx.lineTo(xLeft,       earthTopY);
            ctx.lineTo(xRight,      earthTopY);
            ctx.lineTo(xRight,      this.originY);
            ctx.lineTo(lineRight,   this.originY);
        } else {
            ctx.moveTo(lineLeft,  this.originY);
            ctx.lineTo(lineRight, this.originY);
        }
        ctx.stroke();

        // ── TOPRAK label inside earth fill, near canvas bottom ─────
        ctx.fillStyle = COLOR.earthText;
        ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOPRAK', this.originX, this.H - 20);

        // ── draw floors ──────────────────────────────────────────

        floors.forEach((f, i) => {
            const yTop    = this.originY - f.topCm * scaleY;
            const yBottom = this.originY - f.bottomCm * scaleY;
            const h = yBottom - yTop;

            ctx.fillStyle   = COLOR.floorFill;
            ctx.strokeStyle = COLOR.floorStroke;
            ctx.lineWidth = 1;
            ctx.fillRect(xLeft, yTop, boxW, h);
            ctx.strokeRect(xLeft, yTop, boxW, h);

            // floor name centered inside (hidden if too thin to fit)
            if (h >= 14) {
                ctx.fillStyle = COLOR.floorText;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
                ctx.fillText(f.name, this.originX, yTop + h / 2);
            }

            // height (cm) outside right edge, at the floor's top
            ctx.fillStyle = COLOR.dimText;
            ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(f.heightCm + ' cm', xRight + 6, yTop + 7);
        });

        // ── draw ground floor offset drag handle on right edge ──
        const groundFloor = floors.find(f => f.isGround);
        if (groundFloor) {
            const yBottom = this.originY - groundFloor.bottomCm * scaleY;
            // small arrow icon at right edge of ground floor
            const ax = xRight + 14;
            const ay = yBottom;
            ctx.strokeStyle = '#8ab4f8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ax, ay - 7);
            ctx.lineTo(ax, ay + 7);
            ctx.moveTo(ax - 4, ay - 3);
            ctx.lineTo(ax, ay - 7);
            ctx.lineTo(ax + 4, ay - 3);
            ctx.moveTo(ax - 4, ay + 3);
            ctx.lineTo(ax, ay + 7);
            ctx.lineTo(ax + 4, ay + 3);
            ctx.stroke();
            this.hitRegions.push({
                kind: 'groundOffset',
                x: ax - 10, y: ay - 12, w: 20, h: 24
            });
            // offset label next to arrow
            if (Math.abs(groundFloor.bottomCm) > 0.1) {
                ctx.fillStyle = COLOR.groundLabel;
                ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const off = groundFloor.bottomCm;
                ctx.fillText((off > 0 ? '+' : '') + off + ' cm', ax + 10, ay);
            }
        }

        // ── draw service box + outlet pipe (only when kolon var) ──
        if (s.kolonVar) {
            this._drawServiceBoxAndPipes(s, floors, xLeft, xRight, boxW, scaleY);
        }
    }

    _drawServiceBoxAndPipes(s, floors, xLeft, xRight, boxW, scaleY) {
        const ctx = this.ctx;
        // Service box position: to the LEFT of floors
        const sxRight = xLeft - 36; // right edge of service box
        let bx, by, bw, bh, outletX, outletY, outletDir;

        // Fixed pixel dimensions so box size doesn't scale with floor count
        if (s.kutuTipi === 'duvar') {
            bw = 26; bh = 44;
            bx = sxRight - bw;
            by = this.originY - bh;                // bottom of wall-mount box sits on ground line
            outletX = bx + bw;
            outletY = by + bh * 0.8;               // outlet near bottom right
            outletDir = 'right';
        } else {
            bw = 44; bh = 26;
            bx = sxRight - bw;
            by = this.originY + 6;                 // floor-mount box just below ground line
            outletX = bx + bw;
            outletY = by + bh / 2;                 // outlet at middle of right edge
            outletDir = 'right';
        }

        // Draw box
        ctx.fillStyle = COLOR.serviceBox;
        ctx.strokeStyle = COLOR.serviceBoxStroke;
        ctx.lineWidth = 1.5;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);

        // Label inside the box
        ctx.fillStyle = '#1e1f20';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        if (s.kutuTipi === 'duvar') {
            ctx.font = 'bold 8px -apple-system, "Segoe UI", sans-serif';
            ctx.fillText('DUVAR', cx, cy - 5);
            ctx.fillText('TİPİ',  cx, cy + 5);
        } else {
            ctx.font = 'bold 8px -apple-system, "Segoe UI", sans-serif';
            ctx.fillText('YER TİPİ', cx, cy);
        }

        // Short outlet pipe stub only — no kolon / branşman / meter / iç tesisat
        const stubLen = 28;
        ctx.strokeStyle = COLOR.canliHat;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(outletX, outletY);
        if (outletDir === 'right') ctx.lineTo(outletX + stubLen, outletY);
        else                       ctx.lineTo(outletX, outletY - stubLen);
        ctx.stroke();
    }

    _buildFloors(s) {
        const out = [];
        let idx = 0;
        // bodrum floors (count from -1 going down)
        const bodrumCount = s.bodrumSayisi || 0;
        // ground floor bottom at zeminKat0Offset
        const groundBottom = s.zeminKat0Offset || 0;
        // bodrum yukseklik per floor (use same logic)
        // Build bodrum list, stacked DOWN from groundBottom
        const bodrumHeights = [];
        for (let i = 0; i < bodrumCount; i++) {
            const h = s.tumKatlarAyniYukseklik ? s.zeminKatYukseklik
                : (s.katYukseklikleri[idx] ?? s.zeminKatYukseklik);
            bodrumHeights.push(h);
            idx++;
        }
        // bodrum floors: first (1.BODRUM) just below ground
        let cursor = groundBottom;
        for (let i = 0; i < bodrumCount; i++) {
            const h = bodrumHeights[i];
            const top = cursor;
            const bot = top - h;
            out.push({
                idx: out.length,
                name: (i + 1) + '. BODRUM',
                topCm: top,
                bottomCm: bot,
                heightCm: h,
                isGround: false
            });
            cursor = bot;
        }
        // ground floor
        const groundH = s.tumKatlarAyniYukseklik ? s.zeminKatYukseklik
            : (s.katYukseklikleri[idx] ?? s.zeminKatYukseklik);
        const gIdxInState = idx;
        out.push({
            idx: out.length,
            name: 'ZEMİN',
            topCm: groundBottom + groundH,
            bottomCm: groundBottom,
            heightCm: groundH,
            isGround: true
        });
        idx++;
        // normal floors above ground
        const normalCount = s.normalKatSayisi || 0;
        cursor = groundBottom + groundH;
        for (let i = 0; i < normalCount; i++) {
            const h = s.tumKatlarAyniYukseklik ? s.zeminKatYukseklik
                : (s.katYukseklikleri[idx] ?? s.zeminKatYukseklik);
            const bot = cursor;
            const top = bot + h;
            out.push({
                idx: out.length,
                name: (i + 1) + '. KAT',
                topCm: top,
                bottomCm: bot,
                heightCm: h,
                isGround: false
            });
            cursor = top;
            idx++;
        }
        return out;
    }
}
