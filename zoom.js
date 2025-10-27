import { state, setState, dom } from './main.js';
import { screenToWorld } from './geometry.js';
import { positionLengthInput } from './ui.js';
// Gerekli importları ekle:
import { getColumnCorners } from './columns.js';
import { getBeamCorners } from './beams.js';
import { getStairCorners } from './stairs.js';

export function onWheel(e) {
    e.preventDefault();

    const rect = dom.c2d.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom öncesi fare konumunun dünya koordinatları
    const worldBeforeZoom = screenToWorld(mouseX, mouseY);

    // Zoom faktörü
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9; // 1/1.1 yerine 0.9 kullanıldı
    const newZoom = Math.max(0.1, Math.min(10, state.zoom * zoomFactor));

    // Zoom sonrası fare konumunun dünya koordinatları (yeni zoom ile)
    const worldAfterZoom = {
        x: (mouseX - state.panOffset.x) / newZoom,
        y: (mouseY - state.panOffset.y) / newZoom
    };

    // Pan offset'i ayarla ki fare dünya üzerinde aynı noktayı göstersin
    const newPanOffset = {
        x: state.panOffset.x + (worldAfterZoom.x - worldBeforeZoom.x) * newZoom,
        y: state.panOffset.y + (worldAfterZoom.y - worldBeforeZoom.y) * newZoom
    };

    setState({
        zoom: newZoom,
        panOffset: newPanOffset
    });

    // Eğer uzunluk girişi açıksa pozisyonunu güncelle
    if (state.isEditingLength) {
        positionLengthInput();
    }
}

export function fitDrawingToScreen() {
    const { nodes, walls, columns, beams, stairs } = state; // columns, beams, stairs eklendi
    const { c2d } = dom;
    const PADDING = 50; // Kenarlarda bırakılacak piksel boşluk

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    // Tüm node'ların koordinatlarını al
    nodes.forEach(n => {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
        hasContent = true;
    });

    // Duvar node'larını da dahil et
    walls.forEach(w => {
        if (w.p1) {
            minX = Math.min(minX, w.p1.x); minY = Math.min(minY, w.p1.y);
            maxX = Math.max(maxX, w.p1.x); maxY = Math.max(maxY, w.p1.y);
            hasContent = true;
        }
        if (w.p2) {
            minX = Math.min(minX, w.p2.x); minY = Math.min(minY, w.p2.y);
            maxX = Math.max(maxX, w.p2.x); maxY = Math.max(maxY, w.p2.y);
            hasContent = true;
        }
    });

    // Kolon, Kiriş, Merdiven sınırlarını dahil et (köşeleri kullanarak)
    const checkItemBounds = (itemCorners) => {
        if (itemCorners && itemCorners.length > 0) {
            itemCorners.forEach(corner => {
                minX = Math.min(minX, corner.x); minY = Math.min(minY, corner.y);
                maxX = Math.max(maxX, corner.x); maxY = Math.max(maxY, corner.y);
            });
            hasContent = true;
        }
    };

    (columns || []).forEach(col => checkItemBounds(getColumnCorners(col))); //
    (beams || []).forEach(beam => checkItemBounds(getBeamCorners(beam))); //
    (stairs || []).forEach(stair => checkItemBounds(getStairCorners(stair))); //


    // Eğer hiç çizim yoksa veya sınırlar geçersizse varsayılan zoom ve pan ayarına dön
    if (!hasContent || !isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        setState({ zoom: 0.75, panOffset: { x: c2d.width / 2, y: c2d.height / 2 } });
        return;
    }

    // Çizimin dünya koordinatlarındaki genişlik ve yüksekliği
    const drawingWidth = maxX - minX;
    const drawingHeight = maxY - minY;

    // Canvas'ın kullanılabilir alanı (padding düşülmüş)
    const availableWidth = c2d.width - 2 * PADDING;
    const availableHeight = c2d.height - 2 * PADDING;

    // Gerekli zoom seviyesini hesapla (hem yatay hem dikey sığacak şekilde)
    // Eğer genişlik veya yükseklik sıfırsa (tek nokta vb.), zoom'u 1 yap
    const zoomX = drawingWidth > 1 ? availableWidth / drawingWidth : 1; // 0 yerine 1 gibi küçük bir değer kontrolü
    const zoomY = drawingHeight > 1 ? availableHeight / drawingHeight : 1; // 0 yerine 1 gibi küçük bir değer kontrolü
    const newZoom = Math.min(zoomX, zoomY, 5); // Maksimum zoom sınırı (örneğin 5x)

    // Çizimin merkezini dünya koordinatlarında bul
    const centerX = minX + drawingWidth / 2;
    const centerY = minY + drawingHeight / 2;

    // Yeni pan offset'ini hesapla (çizim merkezini canvas merkezine getirecek şekilde)
    const newPanOffsetX = c2d.width / 2 - centerX * newZoom;
    const newPanOffsetY = c2d.height / 2 - centerY * newZoom;

    setState({
        zoom: newZoom,
        panOffset: { x: newPanOffsetX, y: newPanOffsetY }
    });

    // Eğer uzunluk girişi açıksa pozisyonunu güncelle
    if (state.isEditingLength) {
        positionLengthInput();
    }
}