// interactions/dxf-edit-handler.js
// DXF'i ana 2D canvas üzerinde:
//   - bbox içinden tutup sürükleyerek taşıma
//   - köşe handle'larından çekerek uniform scale (mm hassas)
//   - Esc ile çıkış
//
// Sağ-tık komutları (DXF Düzenle / Sığdır / Göster/Gizle / Kaldır) AYRI bir
// popup'ta DEĞİL — projedeki normal sağ-tık (plumbing) menüsünün üst bölümünde
// DXF varken görünür. Index.html'deki #dxf-context-section blokunu plumbing
// context menü her açıldığında visibility toggle eder.

import { state, setState, dom } from '../general-files/main.js';
import { draw2D } from '../draw/draw2d.js';
import { hitTestDxfEdit, getDxfSceneBBox } from '../draw/draw-dxf-edit.js';
import { screenToWorld } from '../draw/geometry.js';

let installed = false;
let tooltipEl = null;

function getTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'dxf-edit-tooltip';
    const s = tooltipEl.style;
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('pointer-events', 'none', 'important');
    s.setProperty('background', 'rgba(15, 20, 30, 0.92)', 'important');
    s.setProperty('color', '#fff', 'important');
    s.setProperty('padding', '5px 11px', 'important');
    s.setProperty('border-radius', '4px', 'important');
    s.setProperty('font-size', '11px', 'important');
    s.setProperty('font-weight', '700', 'important');
    s.setProperty('letter-spacing', '0.6px', 'important');
    s.setProperty('font-family', 'system-ui, -apple-system, "Segoe UI", sans-serif', 'important');
    s.setProperty('z-index', '999999', 'important');
    s.setProperty('display', 'none', 'important');
    s.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.4)', 'important');
    document.documentElement.appendChild(tooltipEl);
    return tooltipEl;
}

function showTooltip(text, clientX, clientY) {
    const t = getTooltip();
    t.textContent = text;
    t.style.setProperty('left', (clientX + 14) + 'px', 'important');
    t.style.setProperty('top', (clientY + 18) + 'px', 'important');
    t.style.setProperty('display', 'block', 'important');
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.setProperty('display', 'none', 'important');
}

function tooltipFromHandle(handle) {
    if (!handle) return null;
    if (handle === 'body') return 'TAŞI';
    if (handle.startsWith('rot-')) return 'DÖNDÜR';
    return 'YENİDEN BOYUTLANDIR'; // nw / ne / sw / se
}

export function installDxfEditHandlers() {
    if (installed) return;
    installed = true;

    const canvas = dom.p2d || document.getElementById('p2d');
    if (canvas) {
        canvas.addEventListener('pointerdown', onPointerDown, true);
        canvas.addEventListener('pointermove', onPointerMove, true);
        canvas.addEventListener('pointerup', onPointerUp, true);
        canvas.addEventListener('pointercancel', onPointerUp, true);
        // Çift tık = DXF Düzenle moduna giriş/çıkış (DXF varsa ve fare DXF üzerindeyse)
        canvas.addEventListener('dblclick', onDblClick, true);
    }

    // Edit modu klavye kısayolları:
    //   Esc    → modu kapat
    //   Delete → DXF'i tamamen kaldır
    window.addEventListener('keydown', (e) => {
        if (!state.dxfEditMode) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            exitDxfEditMode();
        } else if (e.key === 'Delete' || e.key === 'Del') {
            e.preventDefault();
            if (confirm('DXF arka planı tamamen kaldırılsın mı?')) {
                setState({ dxfImport: null, dxfEditMode: false, dxfEditDrag: null });
                draw2D();
            }
        }
    }, true);

    // Plumbing context menüsündeki DXF butonlarına bağlan
    const bind = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hidePlumbingMenuIfOpen();
            handler();
        });
    };
    bind('dxf-ctx-edit',    () => state.dxfEditMode ? exitDxfEditMode() : enterDxfEditMode());
    bind('dxf-ctx-toggle',  toggleDxfVisibility);
}

function hidePlumbingMenuIfOpen() {
    const menu = document.getElementById('plumbing-context-menu');
    if (menu) menu.style.display = 'none';
}

/**
 * Plumbing context menüsü her açıldığında çağrılır:
 * DXF varsa DXF section'ını görünür yapar, yoksa gizler.
 * Edit modundaysa "DXF Düzenle" item'inin metnini "Bitir"e çevirir.
 */
export function updateDxfContextSection() {
    const sec = document.getElementById('dxf-context-section');
    if (!sec) return;
    if (!state.dxfImport) {
        sec.style.display = 'none';
        return;
    }
    sec.style.display = '';
    const editBtn = document.getElementById('dxf-ctx-edit');
    if (editBtn) {
        editBtn.textContent = state.dxfEditMode
            ? '🟠 DXF Düzenlemeyi Bitir'
            : '🟠 DXF Düzenle (Taşı / Boyutlandır)';
    }
    const toggleBtn = document.getElementById('dxf-ctx-toggle');
    if (toggleBtn) {
        const vis = state.tempVisibility?.showDxf !== false;
        toggleBtn.textContent = vis ? '👁 DXF Gizle' : '👁 DXF Göster';
    }
}

// --- Edit mode aktif/pasif ---

export function enterDxfEditMode() {
    if (!state.dxfImport) return;
    setState({ dxfEditMode: true, dxfEditDrag: null });
    if (dom.p2d) dom.p2d.style.cursor = 'move';
    draw2D();
}

export function exitDxfEditMode() {
    setState({ dxfEditMode: false, dxfEditDrag: null, dxfHoveredHandle: null });
    if (dom.p2d) dom.p2d.style.cursor = '';
    hideTooltip();
    draw2D();
}

function toggleDxfVisibility() {
    if (!state.tempVisibility) return;
    const next = !(state.tempVisibility.showDxf !== false);
    state.tempVisibility.showDxf = next;
    const chk = document.getElementById('vis-chk-dxf');
    if (chk) chk.checked = next;
    draw2D();
}

function fitDxfToCanvas() {
    if (!state.dxfImport || !state.dxfImport.bbox) return;
    const bb = state.dxfImport.bbox;
    const sceneW = (bb.maxX - bb.minX) * state.dxfImport.scale;
    const sceneH = (bb.maxY - bb.minY) * state.dxfImport.scale;
    if (sceneW <= 0 || sceneH <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = dom.c2d.width / dpr, cssH = dom.c2d.height / dpr;
    const newZoom = Math.min(cssW / sceneW, cssH / sceneH) * 0.8;
    const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
    const offset = { x: -cx * state.dxfImport.scale, y: cy * state.dxfImport.scale };
    setState({
        dxfImport: { ...state.dxfImport, offset },
        zoom: newZoom,
        panOffset: { x: cssW / 2, y: cssH / 2 },
    });
    draw2D();
}

// --- Pointer / drag (edit modunda) ---

function onPointerDown(e) {
    if (!state.dxfEditMode) return;
    if (e.button !== 0) return;
    const world = screenToWorld(e.clientX, e.clientY);
    let hit = hitTestDxfEdit(world.x, world.y, state.zoom);
    // YEDEK: Ctrl basılıysa nerede olursa olsun scale moduna gir.
    // Anchor olarak en uzak köşeyi al (cursor karşı köşeden çekiliyormuş gibi).
    if (e.ctrlKey || e.metaKey) {
        const bb = getDxfSceneBBox();
        if (bb) {
            // En uzak köşeyi anchor seç → karşı köşeyi sanal "drag corner" yap
            const corners = [
                { id: 'nw', x: bb.minX, y: bb.minY },
                { id: 'ne', x: bb.maxX, y: bb.minY },
                { id: 'sw', x: bb.minX, y: bb.maxY },
                { id: 'se', x: bb.maxX, y: bb.maxY },
            ];
            let far = corners[0], farD = -1;
            for (const c of corners) {
                const d = Math.hypot(c.x - world.x, c.y - world.y);
                if (d > farD) { farD = d; far = c; }
            }
            // far = anchor → karşıt köşe drag corner
            const oppMap = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };
            hit = oppMap[far.id];
        }
    }
    const bb = getDxfSceneBBox();
    console.log('[DXF edit] pointerDown world:', world, 'bbox:', bb, 'zoom:', state.zoom, 'ctrl:', !!(e.ctrlKey||e.metaKey), 'HIT:', hit);
    if (!hit) return;

    e.preventDefault();
    e.stopPropagation();

    const dxf = state.dxfImport;
    const sbb = getDxfSceneBBox();
    const drag = {
        handle: hit,
        startScene: { x: world.x, y: world.y },
        baseOffset: { ...dxf.offset },
        baseScale: dxf.scale,
        baseRotation: dxf.rotation || 0,
        baseBBox: sbb,
    };
    if (hit.startsWith('rot-') && sbb) {
        const pivotX = (sbb.minX + sbb.maxX) / 2;
        const pivotY = (sbb.minY + sbb.maxY) / 2;
        drag.pivotScene = { x: pivotX, y: pivotY };
        drag.startAngle = Math.atan2(world.y - pivotY, world.x - pivotX);
    }
    setState({ dxfEditDrag: drag });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
}

/**
 * Edit modunda drag YOK iken cursor'u hit'e göre güncelle.
 * Köşede 'nwse-resize' / 'nesw-resize', body'de 'move', dışta 'default'.
 */
function updateCursorOnHover(e) {
    if (!state.dxfEditMode || state.dxfEditDrag) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = hitTestDxfEdit(world.x, world.y, state.zoom);
    const p2d = dom.p2d;
    if (!p2d) return;
    let cur = '';
    if (hit && hit.startsWith('rot-')) cur = 'grab';
    else if (hit === 'nw' || hit === 'se') cur = 'nwse-resize';
    else if (hit === 'ne' || hit === 'sw') cur = 'nesw-resize';
    else if (hit === 'body') cur = 'move';
    else cur = 'default';
    if (p2d.style.cursor !== cur) p2d.style.cursor = cur;
    // Hover handle state'i — kenarlık rengi köşede yeşile döner
    if (state.dxfHoveredHandle !== hit) {
        state.dxfHoveredHandle = hit;
        draw2D();
    }
    // Cursor altı etiketi
    const label = tooltipFromHandle(hit);
    if (label) showTooltip(label, e.clientX, e.clientY);
    else hideTooltip();
}

function onPointerMove(e) {
    if (!state.dxfEditMode) return;
    if (!state.dxfEditDrag) {
        // Drag yok → hover cursor + etiket
        updateCursorOnHover(e);
        return;
    }
    e.preventDefault();
    e.stopPropagation();

    // Drag sırasında etiket fareyle birlikte
    const label = tooltipFromHandle(state.dxfEditDrag.handle);
    if (label) showTooltip(label, e.clientX, e.clientY);

    const world = screenToWorld(e.clientX, e.clientY);
    const drag = state.dxfEditDrag;
    const dxf = state.dxfImport;

    if (drag.handle === 'body') {
        const dx = world.x - drag.startScene.x;
        const dy = world.y - drag.startScene.y;
        setState({
            dxfImport: {
                ...dxf,
                offset: { x: drag.baseOffset.x + dx, y: drag.baseOffset.y + dy },
            },
        });
    } else if (drag.handle.startsWith('rot-')) {
        // DÖNDÜR — pivot etrafında açı farkı, 5° kademeli snap
        const pivot = drag.pivotScene;
        if (!pivot) return;
        const curAngle = Math.atan2(world.y - pivot.y, world.x - pivot.x);
        const delta = curAngle - drag.startAngle;
        const raw = drag.baseRotation + delta;
        const STEP = Math.PI / 36; // 5° = π/36 rad
        const snapped = Math.round(raw / STEP) * STEP;
        setState({
            dxfImport: { ...dxf, rotation: snapped },
        });
    } else {
        // Köşeden çek → uniform scale. Anchor: karşı köşe (sahnede sabit kalır).
        const bb = drag.baseBBox;
        if (!bb) return;
        let anchorX, anchorY, draggedBaseX, draggedBaseY;
        if (drag.handle === 'nw') { anchorX = bb.maxX; anchorY = bb.maxY; draggedBaseX = bb.minX; draggedBaseY = bb.minY; }
        else if (drag.handle === 'ne') { anchorX = bb.minX; anchorY = bb.maxY; draggedBaseX = bb.maxX; draggedBaseY = bb.minY; }
        else if (drag.handle === 'sw') { anchorX = bb.maxX; anchorY = bb.minY; draggedBaseX = bb.minX; draggedBaseY = bb.maxY; }
        else if (drag.handle === 'se') { anchorX = bb.minX; anchorY = bb.minY; draggedBaseX = bb.maxX; draggedBaseY = bb.maxY; }
        else return;

        const baseDx = draggedBaseX - anchorX;
        const baseDy = draggedBaseY - anchorY;
        const newDx  = world.x - anchorX;
        const newDy  = world.y - anchorY;

        // Uniform scale = anchor → köşe radial mesafe oranı (yön bağımsız)
        const baseLen = Math.hypot(baseDx, baseDy);
        const newLen  = Math.hypot(newDx, newDy);
        console.log('[DXF edit] move handle:', drag.handle,
            'anchor:', anchorX.toFixed(1), anchorY.toFixed(1),
            'baseLen:', baseLen.toFixed(2), 'newLen:', newLen.toFixed(2),
            'ratio:', (newLen/baseLen).toFixed(4));
        if (baseLen < 1) return;
        const ratio = newLen / baseLen;
        if (!isFinite(ratio) || ratio < 0.01) return;
        const newScale = drag.baseScale * ratio;
        if (newScale < 1e-6) return;

        // Anchor (karşı köşe) sahnede aynı yerde kalsın → offset'i ayarla.
        const anchorDxfX = (anchorX - drag.baseOffset.x) / drag.baseScale;
        const anchorDxfY = -(anchorY - drag.baseOffset.y) / drag.baseScale;
        const newOffsetX = anchorX - anchorDxfX * newScale;
        const newOffsetY = anchorY + anchorDxfY * newScale;

        setState({
            dxfImport: {
                ...dxf,
                scale: newScale,
                offset: { x: newOffsetX, y: newOffsetY },
                unitsConfirmed: true,
            },
        });
    }
    draw2D();
}

function onDblClick(e) {
    if (!state.dxfImport) return;
    // Edit modu açıkken her çift tık = çık
    if (state.dxfEditMode) {
        e.preventDefault(); e.stopPropagation();
        exitDxfEditMode();
        return;
    }
    // Edit modu kapalıyken: fare DXF bbox'ı içindeyse → moda gir
    const world = screenToWorld(e.clientX, e.clientY);
    const sbb = getDxfSceneBBox();
    if (!sbb) return;
    // Rotation'lı bbox testi için hitTestDxfEdit kullanamayız (edit mode kapalı).
    // Direkt sahnede AABB içinde mi diye bak — rotation'lı plan için biraz geniş,
    // ama yeterli (kullanıcı zaten DXF üzerine çift tıklıyor).
    if (world.x >= sbb.minX && world.x <= sbb.maxX &&
        world.y >= sbb.minY && world.y <= sbb.maxY) {
        e.preventDefault(); e.stopPropagation();
        enterDxfEditMode();
    }
}

function onPointerUp(e) {
    if (!state.dxfEditMode || !state.dxfEditDrag) return;
    e.preventDefault();
    e.stopPropagation();
    setState({ dxfEditDrag: null });
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ok */ }
}
