// general-files/dxf-import-panel.js
// DXF içe aktarma modal'ı: layer seçimi, ölçek onayı/kalibrasyonu, önizleme.
//
// Akış (sağlam yol):
//   1) Modal açıldığında, parser çıktısı zaten state.dxfImport içinde.
//   2) Kullanıcı layer'ları ayıklar (göster/gizle), boş layer'ları gizleyebilir.
//   3) Ölçek bölümü: $INSUNITS otomatik değerini gösterir; kullanıcı "Doğru"
//      derse hazır; "Manuel" derse iki-nokta kalibrasyonu açılır.
//   4) "Uygula" basılınca:
//        - dropDxfHiddenLayers() ile gizli layer'lar atılır
//        - kalibrasyon kalıcı kaydedilir
//        - modal kapanır
//        - 2D canvas yeniden çizilir (overlay artık görünür)

import { state, setState, dom } from './main.js';
import {
    setDxfLayerVisible,
    dropDxfHiddenLayers,
    updateDxfCalibration,
    clearDxfImport,
    deleteDxfEntitiesInRect,
} from './dxf-io.js';

// Modal singleton — DOM'a bir kez eklenir, sonra style.display ile aç/kapa.
let panelEl = null;
let previewCanvas = null;
let lineCalibrationMode = false;          // tek-çizgi seçimli kalibrasyon
let hoveredLineSegment = null;            // { x1, y1, x2, y2 } DXF birimi
// Önizleme kullanıcı zoom/pan durumu — bbox-fit'in ÜZERİNE uygulanan ek dönüşüm.
let previewZoom = 1;
let previewPan = { x: 0, y: 0 };
let previewPanDrag = null; // { startX, startY, basePan }
// Bölge silme modu
let deleteMode = false;
let deleteRectDrag = null; // { startCss:{x,y}, currentCss:{x,y} }
// Undo stack — modal lifecycle'a bağlı. Sadece destructive işlemler (silme).
const DXF_UNDO_LIMIT = 30;
let dxfUndoStack = [];

// Helper: bir element'e cssText'i HER kuralı !important ile uygular.
// Bu, projedeki global !important CSS kurallarının (style.css'de 126 adet)
// modal'ı ezmesini engeller.
function applyImportantStyles(el, cssText) {
    const rules = cssText.split(';');
    for (const rule of rules) {
        const idx = rule.indexOf(':');
        if (idx === -1) continue;
        const prop = rule.slice(0, idx).trim();
        const value = rule.slice(idx + 1).trim();
        if (prop && value) {
            try { el.style.setProperty(prop, value, 'important'); }
            catch { /* geçersiz değerler için sessizce geç */ }
        }
    }
}

export function showDxfImportPanel() {
    if (!state.dxfImport) return;
    if (!panelEl) buildPanelDOM();
    panelEl.style.setProperty('display', 'flex', 'important');
    dxfUndoStack = []; // yeni oturum
    refreshPanel();
    updateUndoButton();
}

export function hideDxfImportPanel() {
    if (panelEl) panelEl.style.setProperty('display', 'none', 'important');
    calibrationMode = null;
    dxfUndoStack = []; // modal kapanırken undo geçmişini sil
}

// --- DXF Undo ---

function pushDxfUndo() {
    if (!state.dxfImport) return;
    const snap = {
        entities: [...state.dxfImport.entities],
        layers: state.dxfImport.layers.map(l => ({ ...l })),
        bbox: state.dxfImport.bbox ? { ...state.dxfImport.bbox } : null,
    };
    dxfUndoStack.push(snap);
    if (dxfUndoStack.length > DXF_UNDO_LIMIT) dxfUndoStack.shift();
    updateUndoButton();
}

function dxfUndoLast() {
    if (dxfUndoStack.length === 0 || !state.dxfImport) return;
    const snap = dxfUndoStack.pop();
    setState({
        dxfImport: {
            ...state.dxfImport,
            entities: snap.entities,
            layers: snap.layers,
            bbox: snap.bbox,
        },
    });
    refreshLayerList();
    requestPreviewDraw();
    updateUndoButton();
}

function updateUndoButton() {
    const btn = panelEl?.querySelector('#dxf-tool-undo');
    if (!btn) return;
    const has = dxfUndoStack.length > 0;
    btn.disabled = !has;
    if (has) {
        btn.style.setProperty('background', '#2563eb', 'important');
        btn.style.setProperty('color', '#fff', 'important');
        btn.style.setProperty('border-color', '#2563eb', 'important');
        btn.style.setProperty('opacity', '1', 'important');
        btn.style.setProperty('cursor', 'pointer', 'important');
    } else {
        btn.style.removeProperty('background');
        btn.style.removeProperty('color');
        btn.style.removeProperty('border-color');
        btn.style.setProperty('opacity', '0.4', 'important');
        btn.style.setProperty('cursor', 'default', 'important');
    }
}

// --- DOM kurulumu ---

function buildPanelDOM() {
    panelEl = document.createElement('div');
    panelEl.id = 'dxf-import-panel';
    applyImportantStyles(panelEl, `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 18, 22, 0.78);
        display: none; align-items: center; justify-content: center;
        z-index: 2147483646;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        margin: 0; padding: 0; border: 0;
        isolation: isolate;
    `);

    const card = document.createElement('div');
    applyImportantStyles(card, `
        width: 96vw; height: 95vh;
        background: #1f2530; color: #e6e6e6; border-radius: 10px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        display: flex; flex-direction: column;
        overflow: hidden;
        border: 1px solid #2c3340;
        margin: 0; padding: 0;
    `);

    // --- TEK ÜST BAR: tüm bilgi + tüm butonlar sıralı ---
    const header = document.createElement('div');
    applyImportantStyles(header, `
        flex: 0 0 auto;
        padding: 10px 14px;
        border-bottom: 1px solid #2c3340; background: #232a36;
        color: #e6e6e6;
    `);
    header.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="min-width:0;">
                <div style="font-size:14px; font-weight:600; line-height:1.2;">DXF</div>
                <div id="dxf-file-label" style="font-size:11px; opacity:0.7; line-height:1.2;"></div>
            </div>
            <div style="flex:1;"></div>
            <button id="dxf-units-manual" class="dxf-btn-secondary" style="padding:5px 12px; font-size:12px;">Bir çizginin gerçek uzunluğunu söyle</button>
            <button id="dxf-tool-delete" class="dxf-btn-secondary" style="padding:5px 12px; font-size:12px;">Nesne sil</button>
            <button id="dxf-tool-undo" class="dxf-btn-secondary" style="padding:5px 12px; font-size:12px;" title="Ctrl+Z" disabled>↶ Geri Al</button>
            <button id="dxf-apply" class="dxf-btn-confirm" style="padding:6px 14px; font-size:13px;">Resim olarak projeye aktar</button>
            <button id="dxf-close" title="Kapat" style="background:transparent; border:none; color:#bbb; font-size:22px; cursor:pointer; padding:0 6px;">×</button>
        </div>
    `;

    // --- İçerik: sol layer listesi, sağ önizleme ---
    const content = document.createElement('div');
    applyImportantStyles(content, `
        flex: 1 1 auto; min-height: 0;
        display: flex; flex-direction: row;
        overflow: hidden;
        background: #1f2530;
    `);

    const leftPane = document.createElement('div');
    applyImportantStyles(leftPane, `
        flex: 0 0 270px;
        border-right: 1px solid #2c3340; display: flex; flex-direction: column; overflow: hidden;
        background: #1f2530; color: #e6e6e6;
    `);
    leftPane.innerHTML = `
        <div style="padding:10px 14px; border-bottom:1px solid #2c3340; display:flex; align-items:center; gap:8px;">
            <div style="font-size:13px; font-weight:600; flex:1;">Layer'lar</div>
            <button id="dxf-layers-all" class="dxf-btn-mini" title="Hepsini seç">tümü</button>
            <button id="dxf-layers-none" class="dxf-btn-mini" title="Hepsini kaldır">hiçbiri</button>
        </div>
        <div id="dxf-layers-list" style="flex:1; overflow-y:auto; padding:6px 0;"></div>
        <div style="padding:8px 14px; border-top:1px solid #2c3340; font-size:11px; opacity:0.7;">
            Onayladığınızda gizli layer'lar kalıcı atılır.
        </div>
    `;

    const rightPane = document.createElement('div');
    applyImportantStyles(rightPane, `
        flex: 1 1 auto; min-width: 0;
        display: flex; flex-direction: column; overflow: hidden; background: #15191f;
        color: #e6e6e6;
    `);
    // rightPane'i position:relative yap ki canvas (global CSS'te position:absolute)
    // viewport'a değil rightPane'e göre konumlansın (kaçışı engelle).
    rightPane.style.setProperty('position', 'relative', 'important');
    rightPane.innerHTML = `
        <div style="flex:0 0 auto; padding:6px 14px; font-size:11px; opacity:0.6; border-bottom:1px solid #2c3340; display:flex; justify-content:space-between; align-items:center;">
        </div>
        <canvas id="dxf-preview-canvas"></canvas>
    `;

    // Resize handle — sol ve sağ paneller arası
    const resizeHandle = document.createElement('div');
    applyImportantStyles(resizeHandle, `
        flex: 0 0 5px;
        background: #2c3340; cursor: col-resize;
        position: relative; user-select: none;
    `);
    resizeHandle.title = 'Layer panelini genişlet/daralt';
    resizeHandle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = leftPane.getBoundingClientRect().width;
        const onMove = (ev) => {
            const w = Math.max(160, Math.min(700, startWidth + (ev.clientX - startX)));
            leftPane.style.setProperty('flex', `0 0 ${w}px`, 'important');
            requestPreviewDraw();
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    });

    content.appendChild(leftPane);
    content.appendChild(resizeHandle);
    content.appendChild(rightPane);

    card.appendChild(header);
    card.appendChild(content);
    panelEl.appendChild(card);

    // Ortak buton stilleri — global !important kuralları ezmesin diye hepsi !important.
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        #dxf-import-panel .dxf-btn-confirm {
            background:#2563eb !important; color:#fff !important; border:none !important; border-radius:6px !important;
            padding:7px 16px !important; cursor:pointer !important; font-size:13px !important;
            display:inline-block !important; visibility:visible !important; opacity:1 !important;
        }
        #dxf-import-panel .dxf-btn-confirm:hover { background:#1d4ed8 !important; }
        #dxf-import-panel .dxf-btn-secondary {
            background:#374151 !important; color:#e6e6e6 !important; border:1px solid #4b5563 !important;
            border-radius:6px !important; padding:6px 14px !important; cursor:pointer !important; font-size:12px !important;
            display:inline-block !important; visibility:visible !important; opacity:1 !important;
        }
        #dxf-import-panel .dxf-btn-secondary:hover { background:#4b5563 !important; }
        #dxf-import-panel .dxf-btn-mini {
            background:transparent !important; color:#9ca3af !important; border:1px solid #374151 !important;
            border-radius:4px !important; padding:2px 8px !important; cursor:pointer !important; font-size:11px !important;
            display:inline-block !important; visibility:visible !important; opacity:1 !important;
        }
        #dxf-import-panel .dxf-btn-mini:hover { color:#e6e6e6 !important; border-color:#6b7280 !important; }
        #dxf-import-panel .dxf-layer-row {
            display:flex !important; align-items:center !important; gap:8px !important; padding:5px 14px !important;
            cursor:pointer !important; font-size:12px !important; color:#e6e6e6 !important;
            visibility:visible !important; opacity:1 !important;
        }
        #dxf-import-panel .dxf-layer-row:hover { background:#252b36 !important; }
        #dxf-import-panel .dxf-layer-swatch {
            width:14px !important; height:14px !important; border-radius:2px !important; border:1px solid rgba(255,255,255,0.15) !important;
            display:inline-block !important; flex-shrink:0 !important;
        }
        #dxf-import-panel .dxf-layer-name { flex:1 !important; color:#e6e6e6 !important; }
        #dxf-import-panel .dxf-layer-count { opacity:0.55 !important; font-size:11px !important; color:#e6e6e6 !important; }
        #dxf-import-panel div, #dxf-import-panel span, #dxf-import-panel label, #dxf-import-panel button {
            box-sizing: border-box !important;
        }
        /* KRİTİK: Global canvas{position:absolute} kuralını ezmek için.
           ID + ID + tag özgüllüğü (1,1,1) global "canvas" (0,0,1)'i geçer. */
        #dxf-import-panel canvas#dxf-preview-canvas {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            width: 100% !important;
            height: auto !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            display: block !important;
            box-sizing: border-box !important;
        }
    `;
    panelEl.appendChild(styleEl);
    // body değil documentElement (<html>) — body üzerindeki stacking/transform
    // context'ler position:fixed'i bozabiliyor. Test banner'ı da burada çalıştı.
    document.documentElement.appendChild(panelEl);

    // --- Listener'lar ---
    // × kapat = İPTAL: DXF'i state'ten kaldır (modal'da yapılan değişiklikler
    // de yok sayılır). DXF'i kalıcılaştırmak için "Resim olarak projeye aktar".
    panelEl.querySelector('#dxf-close').addEventListener('click', () => {
        setState({ dxfImport: null, dxfEditMode: false, dxfEditDrag: null });
        hideDxfImportPanel();
        requestRedraw();
    });
    panelEl.querySelector('#dxf-apply').addEventListener('click', () => {
        dropDxfHiddenLayers();
        updateDxfCalibration({ unitsConfirmed: true });
        fitDxfToView();
        hideDxfImportPanel();
        requestRedraw();
    });
    panelEl.querySelector('#dxf-units-manual').addEventListener('click', toggleLineCalibration);
    panelEl.querySelector('#dxf-layers-all').addEventListener('click', () => toggleAllLayers(true));
    panelEl.querySelector('#dxf-layers-none').addEventListener('click', () => toggleAllLayers(false));

    previewCanvas = panelEl.querySelector('#dxf-preview-canvas');
    previewCanvas.addEventListener('click', onPreviewClick);
    previewCanvas.addEventListener('wheel', onPreviewWheel, { passive: false });
    previewCanvas.addEventListener('mousedown', onPreviewMouseDown);
    previewCanvas.addEventListener('dblclick', onPreviewDblClick);
    window.addEventListener('mousemove', onPreviewMouseMove);
    window.addEventListener('mouseup', onPreviewMouseUp);
    panelEl.querySelector('#dxf-tool-delete').addEventListener('click', toggleDeleteMode);
    panelEl.querySelector('#dxf-tool-undo').addEventListener('click', dxfUndoLast);
    window.addEventListener('keydown', (e) => {
        const modalOpen = panelEl && panelEl.style.display !== 'none';
        if (!modalOpen) return;
        if (e.key === 'Escape') {
            if (deleteMode || deleteRectDrag) {
                deleteMode = false; deleteRectDrag = null;
                updateDeleteToolButton(); requestPreviewDraw();
            }
            if (lineCalibrationMode) cancelLineCalibration();
        }
        // Ctrl+Z → DXF undo (modal açıkken ana proje undo'sunu yutar)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            dxfUndoLast();
        }
    }, true); // capture: ana app keydown'undan önce yakalansın
}

function toggleDeleteMode() {
    if (lineCalibrationMode) cancelLineCalibration();
    deleteMode = !deleteMode;
    deleteRectDrag = null;
    updateDeleteToolButton();
    if (previewCanvas) previewCanvas.style.cursor = deleteMode ? 'crosshair' : '';
}

function updateDeleteToolButton() {
    const btn = panelEl?.querySelector('#dxf-tool-delete');
    if (!btn) return;
    if (deleteMode) {
        btn.style.setProperty('background', '#2563eb', 'important');
        btn.style.setProperty('color', '#fff', 'important');
        btn.style.setProperty('border-color', '#2563eb', 'important');
    } else {
        btn.style.removeProperty('background');
        btn.style.removeProperty('color');
        btn.style.removeProperty('border-color');
    }
}

// --- Önizleme zoom + pan ---

function onPreviewWheel(e) {
    if (!previewCanvas) return;
    e.preventDefault();
    const rect = previewCanvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.2, Math.min(20, previewZoom * factor));
    // Cursor altındaki nokta sabit kalsın: pan ayarla.
    // Görünür pozisyon = (cssX - canvasW/2) - (cssY - canvasH/2) tipi karmaşa yerine
    // basit yaklaşım: pan'i yakınlaşma oranına göre cursor'a kaydır.
    const cx = rect.width / 2, cy = rect.height / 2;
    const dx = cssX - cx, dy = cssY - cy;
    // Cursor'dan merkeze olan vektör previewPan'e dahildir; zoom değişince ölçeklemek
    // için: pan += (1 - factor) * (cursor - mevcut pan'a göre sahnedeki konum)
    const ratio = newZoom / previewZoom;
    previewPan.x = (previewPan.x - dx) * ratio + dx;
    previewPan.y = (previewPan.y - dy) * ratio + dy;
    previewZoom = newZoom;
    requestPreviewDraw();
}

function onPreviewMouseDown(e) {
    // Bölge sil modu: sol tık → dikdörtgen başlat
    if (deleteMode && e.button === 0) {
        e.preventDefault();
        const rect = previewCanvas.getBoundingClientRect();
        deleteRectDrag = {
            startCss: { x: e.clientX - rect.left, y: e.clientY - rect.top },
            currentCss: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        };
        return;
    }
    // Orta tık veya Shift+Sol tık → pan
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        previewPanDrag = { startX: e.clientX, startY: e.clientY, basePan: { ...previewPan } };
    }
}

function onPreviewMouseMove(e) {
    if (deleteRectDrag) {
        const rect = previewCanvas.getBoundingClientRect();
        deleteRectDrag.currentCss = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        requestPreviewDraw();
        return;
    }
    if (previewPanDrag) {
        previewPan.x = previewPanDrag.basePan.x + (e.clientX - previewPanDrag.startX);
        previewPan.y = previewPanDrag.basePan.y + (e.clientY - previewPanDrag.startY);
        requestPreviewDraw();
        return;
    }
    if (lineCalibrationMode) {
        const rect = previewCanvas.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        const prev = hoveredLineSegment;
        hoveredLineSegment = findHoveredSegment(cssX, cssY);
        // Sadece değişim olduysa yeniden çiz
        if (segChanged(prev, hoveredLineSegment)) requestPreviewDraw();
    }
}

function segChanged(a, b) {
    if (!a && !b) return false;
    if (!a || !b) return true;
    return a.x1 !== b.x1 || a.y1 !== b.y1 || a.x2 !== b.x2 || a.y2 !== b.y2;
}

function onPreviewMouseUp(e) {
    if (deleteRectDrag) {
        const drag = deleteRectDrag;
        deleteRectDrag = null;
        finalizeDeleteRect(drag);
        return;
    }
    previewPanDrag = null;
}

function finalizeDeleteRect(drag) {
    // CSS px → DXF birim
    const proj = previewCanvas.__projForCalibration;
    if (!proj) return;
    const dpr = window.devicePixelRatio || 1;
    const cssToDxf = (cssX, cssY) => {
        const px = cssX * dpr, py = cssY * dpr;
        const origin = proj(0, 0);
        const xAxis = proj(1, 0);
        const fit = xAxis.px - origin.px;
        if (!fit) return null;
        return {
            x: (px - origin.px) / fit,
            y: -(py - origin.py) / fit,
        };
    };
    const a = cssToDxf(drag.startCss.x, drag.startCss.y);
    const b = cssToDxf(drag.currentCss.x, drag.currentCss.y);
    if (!a || !b) return;
    // Çok küçük dikdörtgen → iptal (yanlışlıkla tıklama)
    if (Math.abs(drag.startCss.x - drag.currentCss.x) < 5 ||
        Math.abs(drag.startCss.y - drag.currentCss.y) < 5) return;

    // AutoCAD davranışı: yön CSS x'te belirlenir.
    //   sağa sürükleme (startX < currentX) → window: tamamen içeride olanlar
    //   sola sürükleme (startX > currentX) → crossing: dokunan da silinir
    const crossing = drag.currentCss.x < drag.startCss.x;

    const rect = {
        minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
    };
    // Silmeden önce snapshot al ki Ctrl+Z geri alabilsin
    pushDxfUndo();
    const removed = deleteDxfEntitiesInRect(rect, crossing);
    if (removed === 0) {
        // Hiçbir şey silinmediyse boş snapshot'ı stack'ten çıkar
        dxfUndoStack.pop();
        updateUndoButton();
        const msg = crossing
            ? 'Bu bölgede dokunan çizim bulunamadı.'
            : 'Bu bölgede tamamen içeride kalan çizim yok.\n(Daha geniş seç ya da SAĞDAN SOLA sürükleyerek dokunan çizimleri de silebilirsin.)';
        alert(msg);
    } else {
        refreshLayerList();
    }
    requestPreviewDraw();
}

function onPreviewDblClick() {
    previewZoom = 1;
    previewPan = { x: 0, y: 0 };
    requestPreviewDraw();
}

// --- içeriği güncelleme ---

function refreshPanel() {
    if (!panelEl || !state.dxfImport) return;
    const dxf = state.dxfImport;
    panelEl.querySelector('#dxf-file-label').textContent =
        `${dxf.fileName}.dxf — ${dxf.entities.length} öğe, ${dxf.layers.length} layer`;
    refreshLayerList();
    requestPreviewDraw();
}

function refreshLayerList() {
    if (!panelEl || !state.dxfImport) return;
    const list = panelEl.querySelector('#dxf-layers-list');
    list.innerHTML = '';

    state.dxfImport.layers.forEach(layer => {
        const row = document.createElement('label');
        row.className = 'dxf-layer-row';
        row.innerHTML = `
            <input type="checkbox" ${layer.visible ? 'checked' : ''} data-layer="${escapeAttr(layer.name)}">
            <span class="dxf-layer-swatch" style="background:${layer.color};"></span>
            <span class="dxf-layer-name">${escapeHtml(layer.name)}</span>
            <span class="dxf-layer-count">${layer.entityCount}</span>
        `;
        row.querySelector('input').addEventListener('change', (e) => {
            setDxfLayerVisible(layer.name, e.target.checked);
            requestPreviewDraw();
        });
        list.appendChild(row);
    });
}

function toggleAllLayers(visible) {
    if (!state.dxfImport) return;
    state.dxfImport.layers.forEach(l => setDxfLayerVisible(l.name, visible));
    refreshLayerList();
    requestPreviewDraw();
}

// --- Önizleme çizimi ---

function requestPreviewDraw() {
    if (!previewCanvas) return;
    requestAnimationFrame(drawPreview);
}

function drawPreview() {
    if (!previewCanvas || !state.dxfImport) return;
    const dxf = state.dxfImport;

    const dpr = window.devicePixelRatio || 1;
    const rect = previewCanvas.getBoundingClientRect();
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    // Canvas.width set'i RESET + reallocate eder → flicker.
    // Sadece değişmişse uygula.
    if (previewCanvas.width !== targetW) previewCanvas.width = targetW;
    if (previewCanvas.height !== targetH) previewCanvas.height = targetH;

    const ctx = previewCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.fillStyle = '#15191f';
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    if (!dxf.bbox) return;

    // Görünür layer'ların entity'lerini bul
    const visibleLayers = new Set(dxf.layers.filter(l => l.visible).map(l => l.name));
    const visibleEntities = dxf.entities.filter(e => visibleLayers.has(e.layer));
    if (visibleEntities.length === 0) return;

    // BBox'a fit et — kullanıcının zoom + pan'ı bunun ÜZERİNE uygulanır.
    const padding = 20 * dpr;
    const w = previewCanvas.width - padding * 2;
    const h = previewCanvas.height - padding * 2;
    const bb = dxf.bbox;
    const bw = bb.maxX - bb.minX || 1;
    const bh = bb.maxY - bb.minY || 1;
    const baseFit = Math.min(w / bw, h / bh);
    const fit = baseFit * previewZoom;
    // pan değerleri CSS px cinsinden; buffer pixel için dpr ile çarp.
    const panBufX = previewPan.x * dpr;
    const panBufY = previewPan.y * dpr;
    const offX = padding + (w - bw * fit) / 2 - bb.minX * fit + panBufX;
    const offY = padding + (h - bh * fit) / 2 + bb.maxY * fit + panBufY; // Y-flip

    const proj = (x, y) => ({ px: x * fit + offX, py: -y * fit + offY });

    ctx.lineWidth = 1;
    for (const e of visibleEntities) {
        ctx.strokeStyle = e.color || '#cccccc';
        drawEntityPreview(ctx, e, proj);
    }

    // Manuel ölç — hover edilen segmenti sarı vurgu ile çiz
    if (lineCalibrationMode && hoveredLineSegment) {
        const a = proj(hoveredLineSegment.x1, hoveredLineSegment.y1);
        const b = proj(hoveredLineSegment.x2, hoveredLineSegment.y2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 4 * dpr;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py);
        ctx.stroke();
        // Uçlarda küçük daireler — net bir seçim hissi
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(a.px, a.py, 4 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.arc(b.px, b.py, 4 * dpr, 0, Math.PI * 2); ctx.fill();
    }

    previewCanvas.__projForCalibration = proj;
    previewCanvas.__bboxForCalibration = bb;

    // Bölge silme dikdörtgeni — yöne göre renk: sağa pencere (mavi), sola crossing (yeşil)
    if (deleteRectDrag) {
        const sx = deleteRectDrag.startCss.x * dpr;
        const sy = deleteRectDrag.startCss.y * dpr;
        const cx = deleteRectDrag.currentCss.x * dpr;
        const cy = deleteRectDrag.currentCss.y * dpr;
        const x = Math.min(sx, cx), y = Math.min(sy, cy);
        const w2 = Math.abs(cx - sx), h2 = Math.abs(cy - sy);
        const crossing = cx < sx; // sola sürükleme
        if (crossing) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.16)';
            ctx.strokeStyle = '#22c55e';
        } else {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.16)';
            ctx.strokeStyle = '#3b82f6';
        }
        ctx.fillRect(x, y, w2, h2);
        ctx.lineWidth = 2 * dpr;
        // Pencere: düz çizgi; crossing: kesik çizgi (AutoCAD geleneği)
        if (crossing) ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeRect(x, y, w2, h2);
        ctx.setLineDash([]);
    }
}

function drawEntityPreview(ctx, e, proj) {
    switch (e.type) {
        case 'LINE': {
            const a = proj(e.x1, e.y1), b = proj(e.x2, e.y2);
            ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
            break;
        }
        case 'POLYLINE': {
            ctx.beginPath();
            const first = proj(e.vertices[0].x, e.vertices[0].y);
            ctx.moveTo(first.px, first.py);
            for (let i = 1; i < e.vertices.length; i++) {
                const p = proj(e.vertices[i].x, e.vertices[i].y);
                ctx.lineTo(p.px, p.py);
            }
            if (e.closed) ctx.closePath();
            ctx.stroke();
            break;
        }
        case 'CIRCLE': {
            const c = proj(e.cx, e.cy);
            const r2 = proj(e.cx + e.r, e.cy);
            const rr = Math.abs(r2.px - c.px);
            ctx.beginPath(); ctx.arc(c.px, c.py, rr, 0, Math.PI * 2); ctx.stroke();
            break;
        }
        case 'ARC': {
            const c = proj(e.cx, e.cy);
            const r2 = proj(e.cx + e.r, e.cy);
            const rr = Math.abs(r2.px - c.px);
            // DXF arc açıları CCW (Y-up); Y-flip sonrası ekranda CW görünür.
            ctx.beginPath();
            ctx.arc(c.px, c.py, rr, -e.a2, -e.a1, false);
            ctx.stroke();
            break;
        }
        case 'TEXT':
            // Önizlemede metni atlıyoruz; gerçek render'da boyutlu çizilir.
            break;
    }
}

// --- Manuel ölç: önizleme üzerinde çizgi seçimi ---

function toggleLineCalibration() {
    if (lineCalibrationMode) cancelLineCalibration();
    else startLineCalibration();
}

function startLineCalibration() {
    if (!state.dxfImport) return;
    if (deleteMode) toggleDeleteMode(); // çakışmasın
    lineCalibrationMode = true;
    hoveredLineSegment = null;
    updateManualMeasureButton();
    if (previewCanvas) previewCanvas.style.cursor = 'crosshair';
    requestPreviewDraw();
}

function cancelLineCalibration() {
    lineCalibrationMode = false;
    hoveredLineSegment = null;
    updateManualMeasureButton();
    if (previewCanvas) previewCanvas.style.cursor = '';
    requestPreviewDraw();
}

function updateManualMeasureButton() {
    const btn = panelEl?.querySelector('#dxf-units-manual');
    if (!btn) return;
    if (lineCalibrationMode) {
        btn.style.setProperty('background', '#2563eb', 'important');
        btn.style.setProperty('color', '#fff', 'important');
        btn.style.setProperty('border-color', '#2563eb', 'important');
    } else {
        btn.style.removeProperty('background');
        btn.style.removeProperty('color');
        btn.style.removeProperty('border-color');
    }
}

function onPreviewClick(e) {
    if (!lineCalibrationMode) return;
    if (!hoveredLineSegment) return;
    const seg = hoveredLineSegment;
    const dxfLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (dxfLen <= 0) return;

    // Default değer YOK — kullanıcı sıfırdan gerçek değeri girsin.
    const input = prompt(`Seçilen çizgi gerçekte kaç cm?`, '');
    const realCm = parseFloat(input);
    if (!isNaN(realCm) && realCm > 0) {
        const newScale = realCm / dxfLen;
        updateDxfCalibration({ scale: newScale, unitsConfirmed: true });
    }
    cancelLineCalibration();
}

/**
 * CSS pixel (önizleme rect içi) → DXF birim
 */
function cssToDxf(cssX, cssY) {
    const proj = previewCanvas?.__projForCalibration;
    if (!proj) return null;
    const dpr = window.devicePixelRatio || 1;
    const px = cssX * dpr, py = cssY * dpr;
    const origin = proj(0, 0);
    const xAxis = proj(1, 0);
    const fit = xAxis.px - origin.px;
    if (!fit) return null;
    return { x: (px - origin.px) / fit, y: -(py - origin.py) / fit, fit };
}

/**
 * Cursor altında en yakın segment'i bul (görünür entity'lerden).
 * Mesafe eşiği: ekran üzerinde 12 CSS px karşılığı DXF birim.
 */
function findHoveredSegment(cssX, cssY) {
    if (!state.dxfImport) return null;
    const map = cssToDxf(cssX, cssY);
    if (!map) return null;
    const { x: cx, y: cy, fit } = map;
    const dpr = window.devicePixelRatio || 1;
    const thresholdDxf = (12 * dpr) / fit; // 12 css px → DXF unit

    const visible = new Set(state.dxfImport.layers.filter(l => l.visible).map(l => l.name));
    let best = null;
    let bestDist = thresholdDxf;

    const consider = (x1, y1, x2, y2, src) => {
        const d = pointToSegmentDistance(cx, cy, x1, y1, x2, y2);
        if (d < bestDist) {
            bestDist = d;
            best = { x1, y1, x2, y2, src };
        }
    };

    for (const e of state.dxfImport.entities) {
        if (!visible.has(e.layer)) continue;
        if (e.type === 'LINE') {
            consider(e.x1, e.y1, e.x2, e.y2, e);
        } else if (e.type === 'POLYLINE') {
            for (let i = 0; i < e.vertices.length - 1; i++) {
                const a = e.vertices[i], b = e.vertices[i + 1];
                consider(a.x, a.y, b.x, b.y, e);
            }
            if (e.closed && e.vertices.length >= 2) {
                const a = e.vertices[e.vertices.length - 1], b = e.vertices[0];
                consider(a.x, a.y, b.x, b.y, e);
            }
        }
    }
    return best;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const fx = x1 + t * dx, fy = y1 + t * dy;
    return Math.hypot(px - fx, py - fy);
}

// --- yardımcılar ---

/**
 * DXF bbox'ını ana 2D canvas viewport'una sığdırır:
 *   - offset'i bbox merkezini sahne (0,0)'a taşıyacak şekilde ayarlar
 *   - state.zoom'u bbox sahnede %80 doluluğa getirecek değere set eder
 *   - state.panOffset'i sahne (0,0)'ı canvas merkezine getirecek şekilde ayarlar
 * Böylece kalibrasyondan bağımsız olarak kullanıcı DXF'i her zaman görür.
 */
function fitDxfToView() {
    const dxf = state.dxfImport;
    if (!dxf || !dxf.bbox) return;

    const bb = dxf.bbox;
    const scale = dxf.scale || 1;

    // bbox merkezi DXF koord
    const bbCenterX = (bb.minX + bb.maxX) / 2;
    const bbCenterY = (bb.minY + bb.maxY) / 2;

    // Offset: bbox merkezi sahne (0,0)'a düşsün
    // dxfToScene: x*scale + offset.x, -y*scale + offset.y
    const newOffset = {
        x: -bbCenterX * scale,
        y: bbCenterY * scale,
    };

    // DXF sahne boyutları (cm)
    const sceneW = (bb.maxX - bb.minX) * scale;
    const sceneH = (bb.maxY - bb.minY) * scale;
    if (sceneW <= 0 || sceneH <= 0) {
        // tek nokta veya bozuk bbox
        setState({ dxfImport: { ...dxf, offset: newOffset } });
        return;
    }

    // Canvas ölçüleri (CSS px)
    const canvas = dom.c2d;
    const dpr = window.devicePixelRatio || 1;
    const canvasCssW = canvas.width / dpr;
    const canvasCssH = canvas.height / dpr;
    if (canvasCssW <= 0 || canvasCssH <= 0) {
        setState({ dxfImport: { ...dxf, offset: newOffset } });
        return;
    }

    // %80 doluluk için zoom
    const newZoom = Math.min(canvasCssW / sceneW, canvasCssH / sceneH) * 0.8;

    // panOffset: sahne (0,0)'ın canvas merkezinde durması için.
    // Transform: screenPx = dpr*zoom*scenePos + dpr*panOffset
    // scenePos=0 → screenPx = dpr*panOffset → bunun canvas merkezinde olması:
    //   dpr*panOffset = canvas.width/2 → panOffset.x = canvas.width/2/dpr = canvasCssW/2
    const newPan = { x: canvasCssW / 2, y: canvasCssH / 2 };

    setState({
        dxfImport: { ...dxf, offset: newOffset },
        zoom: newZoom,
        panOffset: newPan,
    });
}

function requestRedraw() {
    // draw2D modülünü dinamik import etmek bağımlılığı azaltır.
    import('../draw/draw2d.js').then(m => m.draw2D && m.draw2D()).catch(() => {});
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
