import { getDoorPlacement, isSpaceForDoor, getObjectAtPoint, getWindowPlacement, isSpaceForWindow } from './actions.js';
import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared, findNodeAt, snapTo15DegreeAngle } from './geometry.js';
// 'drawAngleSymbol' buradan kaldırıldı:
import { drawDoorSymbol, drawGrid, isMouseOverWall, drawWindowSymbol, drawVentSymbol, drawColumnSymbol, drawNodeWallCount } from './renderer2d.js';
import { drawDimension, drawTotalDimensions, drawOuterDimensions } from './dimensions.js';
import { drawWallGeometry } from './draw-walls.js';
import { drawRoomPolygons, drawRoomNames } from './draw-rooms.js';
import { 
    drawObjectPlacementPreviews, 
    drawDragPreviews, 
    drawSelectionFeedback, 
    drawDrawingPreviews, 
    drawSnapFeedback 
} from './draw-previews.js';


export function draw2D() {
    const { ctx2d, c2d } = dom;
    const {
        panOffset, zoom, rooms, walls, doors, selectedObject,
        isDragging, dimensionMode, affectedWalls, startPoint, nodes, 
        dimensionOptions, wallAdjacency,
    } = state;

    ctx2d.fillStyle = BG;
    ctx2d.fillRect(0, 0, c2d.width, c2d.height);
    ctx2d.save();
    ctx2d.translate(panOffset.x, panOffset.y);
    ctx2d.scale(zoom, zoom);
    ctx2d.lineWidth = 1 / zoom;

    // 1. Grid (renderer2d.js'den)
    drawGrid();
    
    // 2. Mahaller (Poligonlar) (draw-rooms.js'den)
    drawRoomPolygons(ctx2d, state);

    // 3. Duvar Geometrisi (draw-walls.js'den)
    drawWallGeometry(ctx2d, state, BG);

    // 4. Atomik Semboller (renderer2d.js'den)
    nodes.forEach(node => {
        drawNodeWallCount(node);
    });

    // 5. Açı Sembolleri (Seçim/Sürükleme anında) (renderer2d.js'den)
    const nodesToDrawAngle = new Set();
    if (isDragging && selectedObject?.handle !== 'body') {
        const nodeToDrag = selectedObject.object[selectedObject.handle];
        nodesToDrawAngle.add(nodeToDrag);
    }
    else if (selectedObject?.type === 'wall') {
        nodesToDrawAngle.add(selectedObject.object.p1);
        nodesToDrawAngle.add(selectedObject.object.p2);
    }   
    // Not: Orijinal kodda bu set oluşturuluyor ama drawAngleSymbol çağrılmıyor.
    // Eksik çağrıyı ekliyorum:
    // nodesToDrawAngle.forEach(node => {
    //     drawAngleSymbol(node);
    // });

    // 6. Mahal Etiketleri (İsim/Alan) (draw-rooms.js'den)
    drawRoomNames(ctx2d, state, getObjectAtPoint);

    // 7. Kapılar, Pencereler, Menfezler, Kolonlar (renderer2d.js'den)
    doors.forEach((door) => {
        const isSelected = selectedObject?.type === "door" && selectedObject.object === door;
        drawDoorSymbol(door, false, isSelected);
    });

    walls.forEach(wall => {
        if (wall.windows && wall.windows.length > 0) {
            wall.windows.forEach(window => {
                const isSelected = selectedObject?.type === "window" && selectedObject.object === window;
                drawWindowSymbol(wall, window, false, isSelected);
            });
        }
    });

    walls.forEach(wall => {
        if (wall.vents && wall.vents.length > 0) {
            wall.vents.forEach(vent => {
                drawVentSymbol(wall, vent);
            });
        }
    });

    nodes.forEach(node => {
        if (node.isColumn) {
            drawColumnSymbol(node);
        }
    });

    // 8. Obj. Yerleştirme Önizlemeleri (draw-previews.js'den)
    // (Gerekli fonksiyonlar import edilmeli)
    drawObjectPlacementPreviews(ctx2d, state, getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, drawDoorSymbol, drawWindowSymbol);

    // 9. Ölçülendirmeler (dimensions.js'den)
    if (dimensionMode === 1) {
        drawTotalDimensions();
    } else if (dimensionMode === 2) {
        walls.forEach((w) => { 
            drawDimension(w.p1, w.p2, false, 'single'); 
        }); 
    }
    
    drawOuterDimensions();

    // Seçili duvar ve komşu duvarların ölçüleri
    if (isDragging && affectedWalls.length > 0 && (dimensionMode === 0 || dimensionMode === 1)) {
        affectedWalls.forEach((wall) => {
            drawDimension(wall.p1, wall.p2, true, 'single');
        });
    } else if (!isDragging && selectedObject?.type === "wall") {
        const selectedWall = selectedObject.object;
        const adjacency = wallAdjacency.get(selectedWall); // wallAdjacency'nin state'te güncel olduğunu varsayar
        const isInteriorWall = adjacency > 1;

        const node1 = selectedWall.p1;
        const node2 = selectedWall.p2;

        // Komşu duvarları göster
        walls.forEach(wall => {
            if (wall === selectedWall) return;
            if (wall.p1 === node1 || wall.p2 === node1 || wall.p1 === node2 || wall.p2 === node2) {
                drawDimension(wall.p1, wall.p2, true, 'single');
            }
        });

        // Seçili duvarın kendi ölçüsü
        if (dimensionMode === 0 || (dimensionMode === 1 && isInteriorWall)) {
             drawDimension(selectedWall.p1, selectedWall.p2, true, 'single');
        }
    }

    // 10. Sürükleme/Çizim Geri Bildirimleri (draw-previews.js'den)
    
    // (Gerekli fonksiyonlar import edilmeli)
    drawDragPreviews(ctx2d, state, drawDimension);
    
    drawSelectionFeedback(ctx2d, state);
    
    // (Gerekli fonksiyonlar import edilmeli)
    drawDrawingPreviews(ctx2d, state, snapTo15DegreeAngle, drawDimension);
    
    // (Gerekli fonksiyonlar import edilmeli)
    drawSnapFeedback(ctx2d, state, isMouseOverWall);

    ctx2d.restore();
}