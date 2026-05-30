/**
 * Quick Action Button
 * 2D sahnede son tıklanan boru üzerinde küçük bir "iniş çıkış" hızlı
 * eylem butonu gösterir. Butona basılınca interactionManager üzerinden
 * düşey yükseklik panelini açar.
 *
 * İki mod:
 *   'pipe'    — seçili boru üzerinde; toggleVerticalPanel({pipe, p2, 'araya'})
 *   'drawing' — aktif çizim ucu üzerinde; toggleVerticalPanel() (drawing context)
 *
 * Hide tetikleyicileri (updatePosition içinde kontrol edilir):
 *   - 'pipe'  modunda: aktif tool, boru çizimi, hedef borunun yokluğu/kat değişimi
 *   - 'drawing' modunda: çizim sona ermesi (boruCizimAktif=false)
 *   - Her iki modda: açık düşey panel, 2D dışı görünüm (viewBlendFactor > 0)
 */

import { dom, state } from '../../general-files/main.js';
import { worldToScreen } from '../../draw/geometry.js';
import { findBoruGovdeAt } from './finders.js';

let _btn = null;
let _interactionManager = null;
let _anchorWorld = null;
let _pipeId = null;
let _mode = 'pipe';
let _initialized = false;

function _btnEl() {
    if (_btn) return _btn;
    _btn = document.getElementById('plumbing-quick-inis-cikis');
    return _btn;
}

function _initOnce(interactionManager) {
    _interactionManager = interactionManager;
    if (_initialized) return;
    const el = _btnEl();
    if (!el) return;
    _initialized = true;

    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        const im = _interactionManager;
        if (!im) { hideQuickActionButton(); return; }

        if (_mode === 'drawing') {
            // Aktif çizim ucundan iniş çıkış: keyboard-handler'daki TAB akışı
            // ile aynı yol — toggleVerticalPanel() argümansız çağrılır,
            // _resolveVerticalContext 'drawing' kindini seçer.
            hideQuickActionButton();
            im.toggleVerticalPanel();
            return;
        }

        if (!_pipeId) { hideQuickActionButton(); return; }
        const pipe = im.manager?.findPipeById(_pipeId);
        if (!pipe) { hideQuickActionButton(); return; }
        const point = { x: pipe.p2.x, y: pipe.p2.y, z: pipe.p2.z || 0 };
        hideQuickActionButton();
        im.toggleVerticalPanel({ pipe, point, mode: 'araya' });
    });
}

/**
 * Pipe modunda göster — seçilen/altında bulunan boru için.
 */
export function maybeShowQuickActionButton(interactionManager, worldPoint, hintPipe = null) {
    if (!interactionManager) return;
    _initOnce(interactionManager);

    const el = _btnEl();
    if (!el) return;

    const manager = interactionManager.manager;
    if (!manager || manager.activeTool || interactionManager.boruCizimAktif) {
        hideQuickActionButton();
        return;
    }

    const t = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    if (t > 0.01) { hideQuickActionButton(); return; }

    let pipe = hintPipe;
    if (!pipe) {
        const hit = findBoruGovdeAt(manager, worldPoint, 8);
        pipe = hit ? manager.findPipeById(hit.boruId) : null;
    }
    if (!pipe) { hideQuickActionButton(); return; }

    _mode = 'pipe';
    _pipeId = pipe.id;
    _anchorWorld = { x: worldPoint.x, y: worldPoint.y };
    el.style.display = 'flex';
    updateQuickActionButtonPosition();
}

/**
 * Drawing modunda göster — aktif çizim ucu (boruBaslangic.nokta) üzerinde.
 * startBoruCizim ve handleBoruClick sonunda çağrılır.
 */
export function showQuickActionButtonForDrawing(interactionManager) {
    if (!interactionManager) return;
    _initOnce(interactionManager);

    const el = _btnEl();
    if (!el) return;

    const im = interactionManager;
    if (!im.boruCizimAktif || !im.boruBaslangic?.nokta) {
        hideQuickActionButton();
        return;
    }

    const t = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    if (t > 0.01) { hideQuickActionButton(); return; }

    _mode = 'drawing';
    _pipeId = null;
    _anchorWorld = { x: im.boruBaslangic.nokta.x, y: im.boruBaslangic.nokta.y };
    el.style.display = 'flex';
    updateQuickActionButtonPosition();
}

export function hideQuickActionButton() {
    const el = _btnEl();
    if (el) el.style.display = 'none';
    _pipeId = null;
    _anchorWorld = null;
}

/**
 * Pan/zoom/redraw sonrasında butonu world koordinatına göre konumlandır.
 * draw2D sonunda çağrılır.
 */
export function updateQuickActionButtonPosition() {
    const el = _btnEl();
    if (!el || !_anchorWorld) return;
    if (el.style.display === 'none') return;

    const im = _interactionManager;
    if (!im) return;

    if (im.verticalModeActive) { hideQuickActionButton(); return; }

    const t = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    if (t > 0.01) { hideQuickActionButton(); return; }

    if (_mode === 'drawing') {
        if (!im.boruCizimAktif || !im.boruBaslangic?.nokta) {
            hideQuickActionButton();
            return;
        }
        // Çizim ilerledikçe anchor'ı en son boruBaslangic.nokta'ya senkronla
        _anchorWorld = { x: im.boruBaslangic.nokta.x, y: im.boruBaslangic.nokta.y };
    } else {
        if (im.manager?.activeTool || im.boruCizimAktif) {
            hideQuickActionButton();
            return;
        }
        const pipe = im.manager?.findPipeById(_pipeId);
        if (!pipe) { hideQuickActionButton(); return; }
        const curFloorId = state.currentFloor?.id;
        if (curFloorId && pipe.floorId && pipe.floorId !== curFloorId) {
            hideQuickActionButton();
            return;
        }
    }

    const screen = worldToScreen(_anchorWorld.x, _anchorWorld.y);
    const rect = dom.c2d.getBoundingClientRect();
    const baseClientX = screen.x + rect.left;
    const baseClientY = screen.y + rect.top;

    // "Hattın gerisinde" yönü: butonu KAYNAK hattın anchor'dan uzak ucuna
    // doğru konumlandır — yani çizimi getirdiğimiz yöne. Böylece fare yeni
    // segmenti çizerken buton sabit kalır, elimize dolaşmaz.
    let dirX, dirY;
    const SQRT1_2 = 0.7071067811865476;

    if (_mode === 'drawing') {
        let used = false;
        const kaynakId = im.boruBaslangic?.kaynakId;
        const prevPipe = kaynakId ? im.manager?.findPipeById(kaynakId) : null;
        if (prevPipe && prevPipe.p1 && prevPipe.p2) {
            // Anchor genelde kaynak borunun p2'sidir; geri yön = anchor → p1
            const d1 = Math.hypot(prevPipe.p1.x - _anchorWorld.x, prevPipe.p1.y - _anchorWorld.y);
            const d2 = Math.hypot(prevPipe.p2.x - _anchorWorld.x, prevPipe.p2.y - _anchorWorld.y);
            const farEnd = d1 > d2 ? prevPipe.p1 : prevPipe.p2;
            const bdx = farEnd.x - _anchorWorld.x;
            const bdy = farEnd.y - _anchorWorld.y;
            const blen = Math.hypot(bdx, bdy);
            if (blen > 0.5) { dirX = bdx / blen; dirY = bdy / blen; used = true; }
        }
        if (!used) { dirX = -SQRT1_2; dirY = -SQRT1_2; }
    } else {
        // Pipe modu: hattın p1 ucuna doğru (akışın gerisine) yerleştir
        let pipe = null;
        if (_pipeId) pipe = im.manager?.findPipeById(_pipeId);
        if (pipe) {
            const pdx = pipe.p1.x - _anchorWorld.x;
            const pdy = pipe.p1.y - _anchorWorld.y;
            const plen = Math.hypot(pdx, pdy);
            if (plen > 0.5) {
                dirX = pdx / plen;
                dirY = pdy / plen;
            } else {
                // Çok kısa boru — p2 yönünün tersi
                const qdx = pipe.p2.x - _anchorWorld.x;
                const qdy = pipe.p2.y - _anchorWorld.y;
                const qlen = Math.hypot(qdx, qdy);
                if (qlen > 0.5) { dirX = -qdx / qlen; dirY = -qdy / qlen; }
                else { dirX = -SQRT1_2; dirY = -SQRT1_2; }
            }
        } else {
            dirX = -SQRT1_2; dirY = -SQRT1_2;
        }
    }

    // Boru üzerine düşmesin diye geri yöne (dirX,dirY) + dik yöne perp offset
    // Perp her zaman yukarı (negatif Y) tarafa baksın → tutarlı yerleşim.
    let perpX = -dirY;
    let perpY = dirX;
    if (perpY > 0) { perpX = -perpX; perpY = -perpY; }

    const BACK = 50; // px — hat boyunca geriye
    const SIDE = 30; // px — hattan yana kayma
    const bw = el.offsetWidth  || 22;
    const bh = el.offsetHeight || 22;
    el.style.left = `${baseClientX + dirX * BACK + perpX * SIDE - bw / 2}px`;
    el.style.top  = `${baseClientY + dirY * BACK + perpY * SIDE - bh / 2}px`;
}
