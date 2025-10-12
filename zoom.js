import { state, setState, dom } from './main.js';
import { screenToWorld } from './geometry.js';
import { positionLengthInput } from './ui.js';

export function onWheel(e) {
    e.preventDefault();
    
    const rect = dom.c2d.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Zoom öncesi fare konumunun dünya koordinatları
    const worldBeforeZoom = screenToWorld(mouseX, mouseY);
    
    // Zoom faktörü
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(10, state.zoom * zoomFactor));
    
    // Zoom sonrası fare konumunun dünya koordinatları
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