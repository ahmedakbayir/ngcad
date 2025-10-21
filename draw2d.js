// ahmedakbayir/ngcad/ngcad-57ad1e9e29c68ba90143525c3fd3ac20a130f44e/draw2d.js

// 'getObjectAtPoint' artık 'actions.js' dosyasından geliyor
import { getObjectAtPoint } from './actions.js';
import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared, findNodeAt, snapTo15DegreeAngle } from './geometry.js';
// 'getDoorPlacement' ve 'isSpaceForDoor' artık 'door-handler.js' dosyasından geliyor
import { getDoorPlacement, isSpaceForDoor } from './door-handler.js';
// 'getWindowPlacement' ve 'isSpaceForWindow' artık 'window-handler.js' dosyasından geliyor
import { getWindowPlacement, isSpaceForWindow } from './window-handler.js';
import { drawDoorSymbol, drawGrid, isMouseOverWall, drawWindowSymbol, drawVentSymbol, drawColumnSymbol, drawNodeWallCount, drawColumn } from './renderer2d.js';
import { drawDimension, drawTotalDimensions, drawOuterDimensions } from './dimensions.js';
import { drawWallGeometry } from './draw-walls.js';
import { drawRoomPolygons, drawRoomNames } from './draw-rooms.js';
// getColumnCorners eskiden renderer2d'deydi, şimdi columns.js'den gelmeli (eğer orada değilse oraya taşınmalı)
// Eğer columns.js'de getColumnCorners yoksa, bu importu kaldırıp renderer2d'den almanız gerekir.
// Ancak refactoring sonrası columns.js'de olması daha mantıklı.
import { getColumnCorners } from './columns.js';
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

    // 1. Grid
    drawGrid();
    
    // 2. Mahaller (Poligonlar)
    drawRoomPolygons(ctx2d, state);

    // 3. Duvar Geometrisi
    drawWallGeometry(ctx2d, state, BG);

    // 4. KOLONLAR (Duvarlardan sonra, kapı/pencereden önce)
    state.columns.forEach(column => {
        const isSelected = selectedObject?.type === "column" && selectedObject.object === column;
        drawColumn(column, isSelected);
    });

    // 5. Atomik Semboller
    nodes.forEach(node => {
        drawNodeWallCount(node);
    });

    // 6. Açı Sembolleri
    const nodesToDrawAngle = new Set();
    if (isDragging && selectedObject?.handle !== 'body') {
        const nodeToDrag = selectedObject.object[selectedObject.handle];
        nodesToDrawAngle.add(nodeToDrag);
    }
    else if (selectedObject?.type === 'wall') {
        nodesToDrawAngle.add(selectedObject.object.p1);
        nodesToDrawAngle.add(selectedObject.object.p2);
    }

    // 7. Mahal Etiketleri
    drawRoomNames(ctx2d, state, getObjectAtPoint);

    // 8. Kapılar, Pencereler, Menfezler, Kolonlar (eski)
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

    // 9. Obj. Yerleştirme Önizlemeleri
    drawObjectPlacementPreviews(ctx2d, state, getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, drawDoorSymbol, drawWindowSymbol);

    // 10. Ölçülendirmeler
    if (dimensionMode === 1) {
        drawTotalDimensions();
    } else if (dimensionMode === 2) {
        walls.forEach((w) => { 
            drawDimension(w.p1, w.p2, false, 'single'); 
        }); 
    }
    
    drawOuterDimensions();

    if (isDragging && affectedWalls.length > 0 && (dimensionMode === 0 || dimensionMode === 1)) {
        affectedWalls.forEach((wall) => {
            drawDimension(wall.p1, wall.p2, true, 'single');
        });
    } else if (!isDragging && selectedObject?.type === "wall") {
        const selectedWall = selectedObject.object;
        const adjacency = wallAdjacency.get(selectedWall);
        const isInteriorWall = adjacency > 1;

        const node1 = selectedWall.p1;
        const node2 = selectedWall.p2;

        walls.forEach(wall => {
            if (wall === selectedWall) return;
            if (wall.p1 === node1 || wall.p2 === node1 || wall.p1 === node2 || wall.p2 === node2) {
                drawDimension(wall.p1, wall.p2, true, 'single');
            }
        });

        if (dimensionMode === 0 || (dimensionMode === 1 && isInteriorWall)) {
             drawDimension(selectedWall.p1, selectedWall.p2, true, 'single');
        }
    // --- YENİ EKLENDİ: Seçili kapı/pencere ölçüsünü çiz ---
    } else if (!isDragging && (selectedObject?.type === "door" || selectedObject?.type === "window")) {
        const item = selectedObject.object;
        const wall = (selectedObject.type === 'door') ? item.wall : selectedObject.wall;
        if (wall && wall.p1 && wall.p2) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen > 0.1) {
                const dx = (wall.p2.x - wall.p1.x) / wallLen;
                const dy = (wall.p2.y - wall.p1.y) / wallLen;
                const startPos = item.pos - item.width / 2;
                const endPos = item.pos + item.width / 2;
                const p1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
                const p2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
                drawDimension(p1, p2, true, 'single');
            }
        }
    
    // --- YENİ KOLON ÖLÇÜ BLOĞU BAŞLANGICI ---
    } else if (!isDragging && selectedObject?.type === "column") {
        const column = selectedObject.object;
        const corners = getColumnCorners(column); //
        
        // Köşeler [0:sol-üst, 1:sağ-üst, 2:sağ-alt, 3:sol-alt] (genellikle)
        // "En" (Genişlik) için 0-1 arası
        drawDimension(corners[0], corners[1], true, 'single'); //
        // "Boy" (Yükseklik/Derinlik) için 1-2 arası
        drawDimension(corners[1], corners[2], true, 'single'); //
    }
    // --- YENİ KOLON ÖLÇÜ BLOĞU SONU ---


    // 11. Sürükleme/Çizim Geri Bildirimleri
    drawDragPreviews(ctx2d, state, drawDimension);
    drawSelectionFeedback(ctx2d, state);
    drawDrawingPreviews(ctx2d, state, snapTo15DegreeAngle, drawDimension);
    drawSnapFeedback(ctx2d, state, isMouseOverWall);

    ctx2d.restore();
}