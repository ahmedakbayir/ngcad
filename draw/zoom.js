import { screenToWorld } from './geometry.js';
import { getColumnCorners } from '../architectural-objects/columns.js';
import { getBeamCorners } from '../architectural-objects/beams.js';
import { getStairCorners } from '../architectural-objects/stairs.js';
import { state, setState, dom } from '../general-files/main.js';
import { positionLengthInput } from '../general-files/ui.js';
// Gerekli importları ekle:

export function onWheel(e) {
    e.preventDefault();

    const rect = dom.c2d.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Eski zoom ve pan değerleri
    const oldZoom = state.zoom;
    const oldPanOffset = state.panOffset;

    // Zoom faktörü
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9; 
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * zoomFactor));

    // YENİ HESAPLAMA: Projeksiyondan bağımsız offset hesabı
    // Formül: newOffset = mouse - (mouse - oldOffset) * (newZoom / oldZoom)
    // Bu formül, mouse'un altındaki dünya noktasının ekran üzerindeki yerini korur.
    const ratio = newZoom / oldZoom;
    
    const newPanOffset = {
        x: mouseX - (mouseX - oldPanOffset.x) * ratio,
        y: mouseY - (mouseY - oldPanOffset.y) * ratio
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
    const { nodes, walls, columns, beams, stairs } = state; 
    const { c2d } = dom;
    const PADDING = 50; 

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

    (columns || []).forEach(col => checkItemBounds(getColumnCorners(col))); 
    (beams || []).forEach(beam => checkItemBounds(getBeamCorners(beam))); 
    (stairs || []).forEach(stair => checkItemBounds(getStairCorners(stair))); 


    // Eğer hiç çizim yoksa veya sınırlar geçersizse varsayılan zoom ve pan ayarına dön
    if (!hasContent || !isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        setState({ zoom: 1.2, panOffset: { x: c2d.width / 2, y: c2d.height / 2 } });
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
    const zoomX = drawingWidth > 1 ? availableWidth / drawingWidth : 1; 
    const zoomY = drawingHeight > 1 ? availableHeight / drawingHeight : 1; 
    const newZoom = Math.min(zoomX, zoomY, 5); // Maksimum zoom sınırı 

    // Çizimin merkezini dünya koordinatlarında bul
    const centerX = minX + drawingWidth / 2;
    const centerY = minY + drawingHeight / 2;

    // 3D Perspektif (İzometrik) modunda mıyız?
    // Eğer öyleyse, merkeze alma işlemi izometrik projeksiyona göre yapılmalı
    let newPanOffsetX, newPanOffsetY;

    if (state.is3DPerspectiveActive) {
        // İzometrik projeksiyon katsayıları
        const angle = Math.PI / 6; // 30 derece
        // Projeksiyon: isoX = (x+y)*cos(30), isoY = (y-x)*sin(30)
        // Merkez noktasının projeksiyonunu bul
        const isoCenterX = (centerX + centerY) * Math.cos(angle);
        const isoCenterY = (centerY - centerX) * Math.sin(angle);
        
        newPanOffsetX = c2d.width / 2 - isoCenterX * newZoom;
        newPanOffsetY = c2d.height / 2 - isoCenterY * newZoom;
    } else {
        // Normal 2D
        newPanOffsetX = c2d.width / 2 - centerX * newZoom;
        newPanOffsetY = c2d.height / 2 - centerY * newZoom;
    }

    setState({
        zoom: newZoom,
        panOffset: { x: newPanOffsetX, y: newPanOffsetY }
    });

    // Eğer uzunluk girişi açıksa pozisyonunu güncelle
    if (state.isEditingLength) {
        positionLengthInput();
    }
}