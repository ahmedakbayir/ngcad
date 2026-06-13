// onboarding-schematic.js
// Canvas-based interactive schematic for the onboarding panel.
// Shows ground line, service box (if column=yes), and stacked floors.
// Supports drag of ground floor offset (0 line ↔ ground floor bottom)
// and per-floor height resizing via bottom-edge handle.

const COLOR = {
    // Background regions painted onto the canvas (panel-independent).
    sky:               '#87ceea', // air above ground line
    earth:             '#5a4d3e', // underground earth fill
    earthLine:         '#8d8478', // ground line (sky/earth boundary)
    earthLabel:        '#f3e8d4', // "TOPRAK SEVİYESİ" text on earth

    // Dolgu (fill embankment between toprak line and zemin's base when zemin is elevated)
    dolguFill:         '#9a978f', // warm light gray, distinct from earth's brown
    dolguStroke:       '#5e5b54',
    dolguText:         '#1a1a1a',

    // Floor box (active = iç tesisat var)
    floorFill:         '#c9d9f5', // opaque soft blue
    floorStroke:       '#3b5db5',
    floorNameText:     '#1a2236',
    floorHeightText:   '#52617f',

    // Passive floor (kolonVar=false ve iç tesisat işaretlenmemiş) — gri ton.
    // Toprak/dolgu griliklerinden ayırmak için maviye çalan soğuk gri.
    floorFillPasif:       '#cdd3da',
    floorStrokePasif:     '#7d848e',
    floorNameTextPasif:   '#3e4754',
    floorHeightTextPasif: '#6a727d',

    // Ellipsis floor (dashed) — gökyüzünden ayrılması için hafif dolgu
    ellipsisStroke:    '#5d6e8f',
    ellipsisText:      '#5d6e8f',
    ellipsisFill:      'rgba(236, 240, 247, 0.56)',

    // Service box (sayaç) + canlı hat
    serviceBox:        '#f5c542',
    serviceBoxStroke:  '#a47a17',
    serviceBoxText:    '#1e1f20',
    canliHat:          '#e0a830',

    // Offset arrow + label (in sky)
    arrowStroke:       '#1f3a8a',
    valueText:         '#1a2236',
    descriptionText:   '#4a5570',

    // Window (pencere) — small framed glass on each floor
    windowFrame:       '#6b4d2a',
    windowFrameStroke: '#3a2810',
    windowGlass:       '#a9d5e8',
    windowGlassShade:  '#7fb6cc',

    // Door (kapı) — only on the ground floor
    doorFill:          '#5e5e5e',
    doorStroke:        '#262626',
    doorHandle:        '#d6c25a',

    // Roof (çatı) — koyu, siyaha çalan kırmızı
    roofFill:          '#6a0e0e',
    roofShade:         '#3a0606',
    roofStroke:        '#180202',
    roofRidgeShade:    '#9a2020',
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
        // Sky background paints the entire canvas so the dark panel doesn't
        // bleed through. Earth + everything else is layered on top.
        ctx.fillStyle = COLOR.sky;
        ctx.fillRect(0, 0, this.W, this.H);
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

        const padTop = 36, padBottom = 40, padLeft = 230, padRight = 8;
        // Reserve vertical room for the roof so tall buildings (10+ floors)
        // never squeeze the roof out of view.
        const roofRoomPx = 80;
        const usableH = this.H - padTop - padBottom;
        const usableW = this.W - padLeft - padRight;
        const rangeCm = maxCm - minCm || 1;
        // Cap the vertical scale so a single-zemin building does not get
        // stretched to fill the whole canvas. Tall buildings stay constrained
        // by the natural (usableH - roofRoomPx)/rangeCm formula.
        const scaleY = Math.min((usableH - roofRoomPx) / rangeCm, 1.0);
        // The building is rendered as a HALF cross-section: its left edge is
        // visible, its true right edge sits OFF the canvas, and the roof apex
        // sits right at the canvas right boundary so the right-side slope is
        // clipped naturally. We compute a virtual full-width box for geometry
        // and a separate "visible" width for laying out decorations.
        this.scale = scaleY;
        this.originY = (this.H - padBottom) + minCm * scaleY;

        const xLeft       = padLeft;
        const visibleRight = this.W - padRight;
        const visibleW    = visibleRight - xLeft;
        const boxW        = visibleW * 2;     // virtual full building width
        const xRight      = xLeft + boxW;     // OFF canvas (clipped)
        this.originX     = (xLeft + xRight) / 2; // at visibleRight (= roof apex X)

        // ── earth fill (behind floors, with cutouts for floor rects) ─
        let earthTopY = this.originY;
        if (floors.length) {
            const lowestBottomCm = Math.min(...floors.map(f => f.bottomCm));
            const lowestBottomY  = this.originY - lowestBottomCm * scaleY;
            earthTopY = Math.min(earthTopY, lowestBottomY);
        }
        const earthLeftX  = 0;
        const earthRightX = this.W;
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
        ctx.strokeStyle = COLOR.earthLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const lineLeft  = 0;
        const lineRight = this.W;
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

        // TOPRAK SEVİYESİ tag is drawn AT THE END of render (after service box)
        // so it sits on top of everything along the left edge of the line.

        // ── DOLGU area (only when the ground floor is elevated above toprak) ──
        // It's the embankment material that supports the building above earth
        // zero. Distinguished from regular underground earth with its own color.
        {
            const gf = floors.find(f => f.isGround);
            if (gf && gf.bottomCm > 0) {
                const dolguTop = this.originY - gf.bottomCm * scaleY;
                const dolguBottom = this.originY;
                const dolguH = dolguBottom - dolguTop;
                if (dolguH > 4) {
                    ctx.fillStyle = COLOR.dolguFill;
                    ctx.fillRect(xLeft, dolguTop, boxW, dolguH);
                    ctx.strokeStyle = COLOR.dolguStroke;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(xLeft, dolguTop, boxW, dolguH);
                    if (dolguH >= 18) {
                        ctx.fillStyle = COLOR.dolguText;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
                        ctx.fillText('DOLGU', (xLeft + visibleRight) / 2, dolguTop + dolguH / 2);
                    }
                }
            }
        }

        // ── draw floors ──────────────────────────────────────────

        floors.forEach((f, i) => {
            const yTop    = this.originY - f.topCm * scaleY;
            const yBottom = this.originY - f.bottomCm * scaleY;
            const h = yBottom - yTop;

            if (f.isCollapsed) {
                // Dashed box with big ellipsis to indicate skipped floors.
                // Gökyüzü ile aynı görünmesin diye soluk koyu mavi dolgu uygula.
                ctx.fillStyle = COLOR.ellipsisFill;
                ctx.fillRect(xLeft, yTop, boxW, h);
                ctx.strokeStyle = COLOR.ellipsisStroke;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(xLeft, yTop, boxW, h);
                ctx.setLineDash([]);
                if (h >= 18) {
                    ctx.fillStyle = COLOR.ellipsisText;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 24px -apple-system, "Segoe UI", sans-serif';
                    ctx.fillText('···', (xLeft + visibleRight) / 2, yTop + h / 2);
                }
                return;
            }

            // Kolon yok modunda iç tesisat işaretlenmemiş katlar gri ("pasif").
            // Kolon var modunda tüm katlar mavidir — eski davranış.
            const isPasif = !s.kolonVar && !f.icTesisatVar;
            ctx.fillStyle   = isPasif ? COLOR.floorFillPasif   : COLOR.floorFill;
            ctx.strokeStyle = isPasif ? COLOR.floorStrokePasif : COLOR.floorStroke;
            ctx.lineWidth = 1.5;
            ctx.fillRect(xLeft, yTop, boxW, h);
            ctx.strokeRect(xLeft, yTop, boxW, h);

            // Decoration layout uses the VISIBLE portion of the floor.
            // Three columns: door on the LEFT, floor info in the MIDDLE, window
            // on the RIGHT — door and window pushed near the edges, the floor
            // name+height label centred between them.
            const doorCx = xLeft + visibleW * 0.18;
            const infoCx = xLeft + visibleW * 0.5;
            const winCx  = xLeft + visibleW * 0.78;

            // ── Window: top aligns with door top (yBottom - 0.7*h), bottom at
            //    30% above the floor bottom (yBottom - 0.3*h). Total = 0.4*h. ──
            if (h >= 36 && visibleW >= 80) {
                const winYTop = yBottom - 0.7 * h;
                const winYBot = yBottom - 0.3 * h;
                const winH = winYBot - winYTop;
                const winW = Math.min(visibleW * 0.3, winH * 1.1);
                const winX = winCx - winW / 2;
                const winY = winYTop;
                ctx.fillStyle = COLOR.windowFrame;
                ctx.fillRect(winX, winY, winW, winH);
                ctx.strokeStyle = COLOR.windowFrameStroke;
                ctx.lineWidth = 1;
                ctx.strokeRect(winX, winY, winW, winH);
                const paneW = (winW - 6) / 2;
                const paneH = (winH - 6) / 2;
                for (let row = 0; row < 2; row++) {
                    for (let col = 0; col < 2; col++) {
                        const px = winX + 2 + col * (paneW + 2);
                        const py = winY + 2 + row * (paneH + 2);
                        ctx.fillStyle = row === 0 ? COLOR.windowGlass : COLOR.windowGlassShade;
                        ctx.fillRect(px, py, paneW, paneH);
                    }
                }
            }

            // ── Door on zemin floor: 70% of floor height, near the LEFT edge ──
            if (f.isGround && h >= 40) {
                const doorH = h * 0.7;
                const doorW = Math.min(visibleW * 0.22, doorH * 0.5);
                const doorX = doorCx - doorW / 2;
                const doorY = yBottom - doorH;
                ctx.fillStyle = COLOR.doorFill;
                ctx.strokeStyle = COLOR.doorStroke;
                ctx.lineWidth = 1.5;
                ctx.fillRect(doorX, doorY, doorW, doorH);
                ctx.strokeRect(doorX, doorY, doorW, doorH);
                ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                ctx.lineWidth = 1;
                ctx.strokeRect(doorX + 3, doorY + 5, doorW - 6, doorH - 10);
                ctx.fillStyle = COLOR.doorHandle;
                ctx.beginPath();
                ctx.arc(doorX + doorW - 4, doorY + doorH * 0.55, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }

            // Floor info centred between door and window. Even on zemin we
            // keep it vertically centred — door is on the left, window on the
            // right, so they don't collide with the centred label.
            const textCy = yTop + h / 2;
            if (h >= 30) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isPasif ? COLOR.floorNameTextPasif : COLOR.floorNameText;
                ctx.font = 'bold 14px -apple-system, "Segoe UI", sans-serif';
                ctx.fillText(f.name, infoCx, textCy - 9);
                ctx.fillStyle = isPasif ? COLOR.floorHeightTextPasif : COLOR.floorHeightText;
                ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
                ctx.fillText(f.heightCm + ' cm', infoCx, textCy + 9);
            } else if (h >= 14) {
                ctx.fillStyle = isPasif ? COLOR.floorNameTextPasif : COLOR.floorNameText;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
                ctx.fillText(f.name, infoCx, yTop + h / 2);
            }

        });

        // ── ROOF — symmetric gable, apex visible inside the canvas ──
        {
            let topF = null;
            for (const f of floors) {
                if (f.isCollapsed) continue;
                if (!topF || f.topCm > topF.topCm) topF = f;
            }
            if (topF) {
                const roofBaseY = this.originY - topF.topCm * scaleY;
                // Single-pitch roof: hypotenuse from lower-left to the upper-
                // right corner of the canvas. xL sits exactly on the building
                // left wall (no overhang) so no stub appears next to it; xR
                // sits on x = W so the canvas clips the vertical edge.
                const xL = xLeft;
                const xR = this.W;
                const peakX = xR;
                const idealRoofH = Math.min(140, (xR - xL) * 0.30);
                const maxRoofH = Math.max(0, roofBaseY - padTop + 8);
                const roofH = Math.min(idealRoofH, maxRoofH);
                const peakY = roofBaseY - roofH;
              if (roofH >= 4) {
                // Eave geometry — slope continues smoothly past the wall to
                // the eave tip; the EAVE BOTTOM is horizontal (parallel to the
                // ground) and the eave right edge is vertical (perpendicular
                // to the building wall) like a regular roof overhang.
                const eaveOut  = 18;
                const slope    = (roofBaseY - peakY) / (xR - xLeft);
                const eaveDrop = eaveOut * slope; // keeps the hypotenuse straight
                const eaveX    = xLeft - eaveOut;
                const eaveBotY = roofBaseY + eaveDrop;

                // Lift only the top line (hypotenuse) by liftTop — both ends
                // move up the same amount so the line stays straight, but the
                // eave bottom and the wall corner stay put. Roof fill grows
                // to cover the new gap between the lifted top and the old
                // bottom.
                const liftTop  = 3;
                const eaveTopY = eaveBotY - liftTop;
                const peakTopY = peakY    - liftTop;

                // Hexagonal fill — eave tip top → apex (lifted top line),
                // down the right edge, across the wall top, up the eave's
                // vertical right side, across the eave's horizontal bottom,
                // close back up the eave-tip vertical face.
                ctx.fillStyle = COLOR.roofFill;
                ctx.beginPath();
                ctx.moveTo(eaveX, eaveTopY);
                ctx.lineTo(xR, peakTopY);
                ctx.lineTo(xR, roofBaseY);
                ctx.lineTo(xLeft, roofBaseY);
                ctx.lineTo(xLeft, eaveBotY);
                ctx.lineTo(eaveX, eaveBotY);
                ctx.closePath();
                ctx.fill();

                // Tile rows clipped to the roof shape — gives the "skin" feel
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(eaveX, eaveTopY);
                ctx.lineTo(xR, peakTopY);
                ctx.lineTo(xR, roofBaseY);
                ctx.lineTo(xLeft, roofBaseY);
                ctx.lineTo(xLeft, eaveBotY);
                ctx.lineTo(eaveX, eaveBotY);
                ctx.closePath();
                ctx.clip();
                ctx.strokeStyle = COLOR.roofShade;
                ctx.lineWidth = 0.6;
                for (let y = roofBaseY - 6; y > peakTopY + 2; y -= 5) {
                    ctx.beginPath();
                    ctx.moveTo(eaveX, y);
                    ctx.lineTo(xR, y);
                    ctx.stroke();
                }
                ctx.restore();

                // Lifted top line — ONE smooth stroke from the eave tip top
                // up to the apex.
                ctx.strokeStyle = COLOR.roofStroke;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(eaveX, eaveTopY);
                ctx.lineTo(xR, peakTopY);
                ctx.stroke();

                // Eave outline — small vertical face at the eave tip,
                // horizontal bottom, and the vertical right edge at the wall.
                ctx.lineJoin = 'miter';
                ctx.beginPath();
                ctx.moveTo(eaveX, eaveTopY);
                ctx.lineTo(eaveX, eaveBotY);
                ctx.lineTo(xLeft, eaveBotY);
                ctx.lineTo(xLeft, roofBaseY);
                ctx.stroke();
              }
            }
        }

        // ── ground floor offset drag handle + value panel INSIDE the zemin ──
        // Building is now flush with the right edge so the arrow + Toprak kotu
        // panel sit in the bottom-right corner of the zemin floor (below the
        // window). The drag math stays the same — it operates on cursor dy.
        const groundFloor = floors.find(f => f.isGround);
        if (groundFloor) {
            const yTopG    = this.originY - groundFloor.topCm * scaleY;
            const yBottomG = this.originY - groundFloor.bottomCm * scaleY;
            const hG       = yBottomG - yTopG;
            // arrow sits just inside the VISIBLE right edge, exactly at the
            // zemin floor's bottom — for offset = 0 this lands on the toprak
            // line, making the "0 cm" reading match the visual.
            const ax = visibleRight - 14;
            const ay = yBottomG;
            ctx.strokeStyle = COLOR.arrowStroke;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(ax, ay - 9);
            ctx.lineTo(ax, ay + 9);
            ctx.moveTo(ax - 5, ay - 4);
            ctx.lineTo(ax, ay - 9);
            ctx.lineTo(ax + 5, ay - 4);
            ctx.moveTo(ax - 5, ay + 4);
            ctx.lineTo(ax, ay + 9);
            ctx.lineTo(ax + 5, ay + 4);
            ctx.stroke();
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            this.hitRegions.push({
                kind: 'groundOffset',
                x: ax - 11, y: ay - 14, w: 22, h: 28
            });
            // Value + description panel sits to the LEFT of the arrow, still
            // inside the zemin floor box.
            const off = groundFloor.bottomCm;
            const offStr = (off > 0 ? '+' : '') + off + ' cm';
            const desc = 'Zemin kotu';
            ctx.font = 'bold 15px -apple-system, "Segoe UI", sans-serif';
            const wVal = ctx.measureText(offStr).width;
            ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
            const wDesc = ctx.measureText(desc).width;
            const panelW = Math.max(wVal, wDesc) + 14;
            const panelH = 42;
            // Panel above the arrow inside the zemin floor, with a small
            // breathing gap. Right-aligned with the arrow column.
            const panelX = ax + 12 - panelW;
            const panelY = ay - panelH - 8;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeStyle = 'rgba(31, 58, 138, 0.35)';
            ctx.lineWidth = 1;
            ctx.fillRect(panelX, panelY, panelW, panelH);
            ctx.strokeRect(panelX, panelY, panelW, panelH);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLOR.valueText;
            ctx.font = 'bold 15px -apple-system, "Segoe UI", sans-serif';
            ctx.fillText(offStr, panelX + 7, panelY + 13);
            ctx.fillStyle = COLOR.descriptionText;
            ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
            ctx.fillText(desc, panelX + 7, panelY + 30);
        }

        // ── draw service box + outlet pipe (only when kolon var) ──
        if (s.kolonVar) {
            this._drawServiceBoxAndPipes(s, floors, xLeft, xRight, boxW, scaleY);
        }

        // ── TOPRAK SEVİYESİ tag sits ON the ground line, two lines stacked ──
        // Position depends only on the line itself, never on the service box.
        {
            const line1 = 'TOPRAK';
            const line2 = 'SEVİYESİ';
            ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
            const tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
            const tagPadX = 8;
            const tagPadY = 5;
            const tagW = tw + tagPadX * 2;
            const tagH = 14 * 2 + tagPadY * 2; // two lines of ~14px line-height
            const tagX = 6;
            const tagY = this.originY - tagH / 2;
            ctx.fillStyle = '#3a2f24';
            ctx.fillRect(tagX, tagY, tagW, tagH);
            ctx.strokeStyle = COLOR.earthLabel;
            ctx.lineWidth = 1;
            ctx.strokeRect(tagX, tagY, tagW, tagH);
            ctx.fillStyle = COLOR.earthLabel;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const cx = tagX + tagW / 2;
            ctx.fillText(line1, cx, this.originY - 8);
            ctx.fillText(line2, cx, this.originY + 8);
        }
    }

    _drawServiceBoxAndPipes(s, floors, xLeft, xRight, boxW, scaleY) {
        const ctx = this.ctx;
        // Service box position: to the LEFT of floors
        const sxRight = xLeft - 36; // right edge of service box
        let bx, by, bw, bh, outletX, outletY, outletDir;

        // Fixed pixel dimensions so box size doesn't scale with floor count
        if (s.kutuTipi === 'duvar') {
            bw = 52; bh = 56;
            bx = sxRight - bw;
            by = this.originY - bh;                // bottom of wall-mount box sits on ground line
            outletX = bx + bw;
            outletY = by + bh * 0.78;              // outlet near bottom right
            outletDir = 'right';
        } else {
            bw = 64; bh = 36;
            bx = sxRight - bw;
            by = this.originY + 16;                // sit clear of the TOPRAK SEVİYESİ tag
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
        ctx.fillStyle = COLOR.serviceBoxText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        if (s.kutuTipi === 'duvar') {
            ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
            ctx.fillText('DUVAR', cx, cy - 8);
            ctx.fillText('TİPİ',  cx, cy + 8);
        } else {
            ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
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
                isGround: false,
                icTesisatVar: !!(s.katIcTesisatVar && s.katIcTesisatVar[i]),
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
            isGround: true,
            icTesisatVar: !!(s.katIcTesisatVar && s.katIcTesisatVar[gIdxInState]),
        });
        idx++;
        // normal floors above ground
        // Layout rule: when all floors share the same height, collapse the middle
        // floors once we have more than 3 normal floors (so the schematic stays
        // compact). When per-floor heights differ, show every floor so the user
        // can see each individual height.
        const normalCount = s.normalKatSayisi || 0;
        cursor = groundBottom + groundH;
        const pushNormal = (numberLabel, floorIdxInState) => {
            const h = s.tumKatlarAyniYukseklik ? s.zeminKatYukseklik
                : (s.katYukseklikleri[floorIdxInState] ?? s.zeminKatYukseklik);
            const bot = cursor;
            const top = bot + h;
            out.push({
                idx: out.length,
                name: numberLabel + '. KAT',
                topCm: top,
                bottomCm: bot,
                heightCm: h,
                isGround: false,
                icTesisatVar: !!(s.katIcTesisatVar && s.katIcTesisatVar[floorIdxInState]),
            });
            cursor = top;
        };
        const shouldCollapse = s.tumKatlarAyniYukseklik && normalCount > 4;
        if (!shouldCollapse) {
            for (let i = 0; i < normalCount; i++) {
                pushNormal(i + 1, idx);
                idx++;
            }
        } else {
            // 1.kat, 2.kat
            pushNormal(1, idx); idx++;
            pushNormal(2, idx); idx++;
            // Ellipsis placeholder (single floor's worth of height)
            const hEll = s.zeminKatYukseklik;
            out.push({
                idx: out.length,
                name: '…',
                topCm: cursor + hEll,
                bottomCm: cursor,
                heightCm: hEll,
                isGround: false,
                isCollapsed: true,
            });
            cursor += hEll;
            // Top floor (uses state idx of the actual last floor)
            const topStateIdx = bodrumCount + 1 + (normalCount - 1);
            pushNormal(normalCount, topStateIdx);
        }
        return out;
    }
}
