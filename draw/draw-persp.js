/**
 * 3D Perspektif Yan Panel Çizimi (2D canvas)
 *  - Arka plan: Katı Model (Three.js) gökyüzü rengi (#87CEEB / #282c36).
 *  - Zemin: Katı Model groundPlane rengi (#f8f5ee / #3d3d3d) — perspektif projeksiyonla çizilir.
 *  - Grid: Z=0 düzleminde gerçek 2-nokta perspektif projeksiyonla — Katı Model görsel stilinde.
 *  - Tesisat: izometrik transform (mevcut çizim/etkileşim altyapısı korunur).
 */

import { state, dom, setState, isLightMode, THEME_COLORS } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

const ANGLE = Math.PI / 6;
const ISO_COS = Math.cos(ANGLE);
const ISO_SIN = Math.sin(ANGLE);

function _matrix(t) {
    return {
        a: 1 + (ISO_COS - 1) * t,
        b: -ISO_SIN * t,
        c: ISO_COS * t,
        d: 1 + (ISO_SIN - 1) * t,
    };
}

// ─── ZOOM SYNC YARDIMCILARI (sadece zoom değişiminde kullanılır) ─────────────
function _worldAtCanvasCenter(canvas, zoom, pan, t) {
    const dpr = window.devicePixelRatio || 1;
    const cssCx = (canvas.width / dpr) / 2;
    const cssCy = (canvas.height / dpr) / 2;
    const m = _matrix(t);
    const det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < 1e-10) return null;
    const pX = (cssCx - pan.x) / zoom;
    const pY = (cssCy - pan.y) / zoom;
    return {
        x: (pX * m.d - pY * m.c) / det,
        y: (pY * m.a - pX * m.b) / det,
    };
}

function _panToCenterWorld(canvas, zoom, t, world) {
    const dpr = window.devicePixelRatio || 1;
    const cssCx = (canvas.width / dpr) / 2;
    const cssCy = (canvas.height / dpr) / 2;
    const m = _matrix(t);
    const pX = world.x * m.a + world.y * m.c;
    const pY = world.x * m.b + world.y * m.d;
    return { x: cssCx - pX * zoom, y: cssCy - pY * zoom };
}

let _syncing = false;

/**
 * Zoom sync: ana panelin merkezindeki dünya noktasını persp paneline taşır,
 * zoom'u eşitler. Pan bağımsız → kullanıcı her panelde özgürce pan yapar;
 * sadece zoom değiştiğinde iki taraf hizalanır.
 */
export function syncMainToPersp() {
    if (_syncing) return;
    if (!dom.mainContainer.classList.contains('show-persp')) return;
    if (!dom.c2d || !dom.cPersp || dom.cPersp.width === 0) return;
    const tMain = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    const tPersp = (typeof state.perspBlendFactor === 'number') ? state.perspBlendFactor : 1;
    const center = _worldAtCanvasCenter(dom.c2d, state.zoom, state.panOffset, tMain);
    if (!center) return;
    /*const newZoom = state.zoom;
    const newPan = _panToCenterWorld(dom.cPersp, newZoom, tPersp, center);
    _syncing = true;
    state.perspZoom = newZoom;
    state.perspPanOffset = newPan;
    _syncing = false;
    */
}

export function syncPerspToMain() {
    if (_syncing) return;
    if (!dom.mainContainer.classList.contains('show-persp')) return;
    if (!dom.c2d || !dom.cPersp || dom.cPersp.width === 0) return;
    const tMain = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    const tPersp = (typeof state.perspBlendFactor === 'number') ? state.perspBlendFactor : 1;
    const center = _worldAtCanvasCenter(dom.cPersp, state.perspZoom, state.perspPanOffset, tPersp);
    if (!center) return;
    /*const newZoom = state.perspZoom;
    const newPan = _panToCenterWorld(dom.c2d, newZoom, tMain, center);
    _syncing = true;
    setState({ zoom: newZoom, panOffset: newPan });
    _syncing = false;
    */
}

// ─── 3D PERSPEKTİF GRID + ZEMİN (Katı Model kamerasıyla aynı parametreler) ───
// Three.js: position (1500, 1800, 1500), target (0, WALL_HEIGHT/2, 0), FOV 75°
// Three.js'te Y = yukarı. Bizim 2D dünyamızda Z = yukarı (bu kod world.z'yi kullanır).
// Üç boyutlu nokta: [x, y, z] (z=0 zemin).
const _CAM_EYE = [1500, 1500, 1800];
const _CAM_TARGET = [0, 0, 140];
const _CAM_UP = [0, 0, 1];
const _CAM_FOV_DEG = 75;
const _GROUND_R = 5000;        // zemin polygon yarıçapı
const _GRID_R = 10000;         // grid yarıçapı (Three.js ile aynı)
const _GRID_DIV = 100;         // 100 bölme (Three.js ile aynı)
const _GRID_STEP = (_GRID_R * 2) / _GRID_DIV; // = 200

function _vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function _vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function _vcross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function _vnorm(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}

/**
 * Perspektif kamera: world → canvas pixels.
 * perspZoom: ekran-uzayı çarpanı (canvas merkezi etrafında ölçekler)
 * perspPan: ekran-uzayı pan (CSS px)
 */
function _makeProjector(canvas, perspZoom, perspPan) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;

    const fwd = _vnorm(_vsub(_CAM_TARGET, _CAM_EYE));
    const right = _vnorm(_vcross(fwd, _CAM_UP));
    const camUp = _vcross(right, fwd);
    const fovRad = _CAM_FOV_DEG * Math.PI / 180;
    const focal = (cssH / 2) / Math.tan(fovRad / 2);

    const z = perspZoom || 1;
    const px = perspPan ? (perspPan.x || 0) : 0;
    const py = perspPan ? (perspPan.y || 0) : 0;

    return function project(p) {
        const cp = _vsub(p, _CAM_EYE);
        const cx = _vdot(cp, right);
        const cy = _vdot(cp, camUp);
        const cz = -_vdot(cp, fwd);
        if (cz <= 0.5) return null; // kameranın arkasında / çok yakın
        const sx = cssW / 2 + focal * cx / cz;
        const sy = cssH / 2 - focal * cy / cz;
        // Kullanıcı zoom/pan'i: canvas merkezi etrafında ölçek + pan
        const fx = cssW / 2 + (sx - cssW / 2) * z + px;
        const fy = cssH / 2 + (sy - cssH / 2) * z + py;
        return [fx * dpr, fy * dpr];
    };
}

function _drawPerspectiveBackground(ctx, canvas, project, light) {
    // 1) Arkaplan — 2D ana panelle aynı radial gradient (THEME_COLORS.canvasGradient)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = Math.max(canvas.width, canvas.height) * 0.7;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const colors = light ? THEME_COLORS.light.canvasGradient : THEME_COLORS.dark.canvasGradient;
    grad.addColorStop(0, colors.center);
    grad.addColorStop(0.5, colors.mid);
    grad.addColorStop(1, colors.edge);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2) Zemin polygon (Katı Model groundPlane rengi ile aynı), perspektifte projekte
    const GR = _GROUND_R;
    const corners = [
        [-GR, -GR, 0], [GR, -GR, 0],
        [GR, GR, 0], [-GR, GR, 0],
    ];
    const proj = corners.map(project);
    if (proj.every(p => p)) {
        ctx.fillStyle = light ? '#f8f5ee' : '#3d3d3d';
        ctx.beginPath();
        ctx.moveTo(proj[0][0], proj[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(proj[i][0], proj[i][1]);
        ctx.closePath();
        ctx.fill();
    }
}

function _drawPerspectiveGrid(ctx, project) {
    const dpr = window.devicePixelRatio || 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.lineCap = 'butt';

    // Y-yönündeki çizgiler (sabit X)
    for (let x = -_GRID_R; x <= _GRID_R; x += _GRID_STEP) {
        const a = project([x, -_GRID_R, 0]);
        const b = project([x, _GRID_R, 0]);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
    }
    // X-yönündeki çizgiler (sabit Y)
    for (let y = -_GRID_R; y <= _GRID_R; y += _GRID_STEP) {
        const a = project([-_GRID_R, y, 0]);
        const b = project([_GRID_R, y, 0]);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
    }
}

// ─── ANA RENDER ─────────────────────────────────────────────────────────────
export function drawPerspView() {
    if (!dom.mainContainer.classList.contains('show-persp')) return;
    const ctx = dom.ctxPersp;
    const c = dom.cPersp;
    if (!ctx || !c || c.width === 0 || c.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const zoom = state.perspZoom || 1;
    const pan = state.perspPanOffset || { x: 0, y: 0 };
    let t = (typeof state.perspBlendFactor === 'number') ? state.perspBlendFactor : 1;
    t = Math.max(0, Math.min(1, t));

    const light = isLightMode();

    // 1) Perspektif arkaplan + zemin
    const project = _makeProjector(c, zoom, pan);
    _drawPerspectiveBackground(ctx, c, project, light);

    // 2) Perspektif grid
    _drawPerspectiveGrid(ctx, project);

    // 3) Tesisat — izometrik transform (mevcut çizim/etkileşim altyapısı)
    const m = _matrix(t);
    ctx.save();
    ctx.setTransform(
        dpr * zoom * m.a,
        dpr * zoom * m.b,
        dpr * zoom * m.c,
        dpr * zoom * m.d,
        dpr * pan.x,
        dpr * pan.y
    );
    ctx.lineWidth = 1 / zoom;

    const _saveBlend = state.viewBlendFactor;
    const _saveActive = state.is3DPerspectiveActive;
    const _saveZoom = state.zoom;
    const _savePan = state.panOffset;
    state.viewBlendFactor = t;
    state.is3DPerspectiveActive = (t >= 0.5);
    state.zoom = zoom;
    state.panOffset = pan;
    try {
        plumbingManager.render(ctx);
    } finally {
        state.viewBlendFactor = _saveBlend;
        state.is3DPerspectiveActive = _saveActive;
        state.zoom = _saveZoom;
        state.panOffset = _savePan;
    }

    ctx.restore();
}

// ─── BAĞIMSIZ MIDDLE/RIGHT MOUSE PAN (sync ÇAĞIRMAZ — pan bağımsızdır) ──────
let _perspPanState = null;

export function setupPerspControls() {
    if (!dom.cPersp) return;
    dom.cPersp.addEventListener('mouseenter', () => { state.perspHover = true; });
    dom.cPersp.addEventListener('mouseleave', () => { state.perspHover = false; });

    dom.cPersp.addEventListener('mousedown', (e) => {
        if (!dom.mainContainer.classList.contains('show-persp')) return;
        if (e.button !== 1 && e.button !== 2) return;
        e.preventDefault();
        e.stopPropagation();
        _perspPanState = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startPanX: (state.perspPanOffset && state.perspPanOffset.x) || 0,
            startPanY: (state.perspPanOffset && state.perspPanOffset.y) || 0,
        };
        if (dom.cPersp.setPointerCapture && e.pointerId !== undefined) {
            try { dom.cPersp.setPointerCapture(e.pointerId); } catch (_) { }
        }
        if (dom.pPersp) dom.pPersp.classList.add('panning');
    }, { capture: true });

    window.addEventListener('mousemove', (e) => {
        if (!_perspPanState) return;
        const dx = e.clientX - _perspPanState.startClientX;
        const dy = e.clientY - _perspPanState.startClientY;
        state.perspPanOffset = {
            x: _perspPanState.startPanX + dx,
            y: _perspPanState.startPanY + dy,
        };
        // Pan sync YAPILMAZ — pan bağımsız.
    });

    window.addEventListener('mouseup', (e) => {
        if (!_perspPanState) return;
        if (e.button !== 1 && e.button !== 2) return;
        _perspPanState = null;
        if (dom.pPersp) dom.pPersp.classList.remove('panning');
    });

    dom.cPersp.addEventListener('contextmenu', (e) => {
        if (dom.mainContainer.classList.contains('show-persp')) e.preventDefault();
    });
}
