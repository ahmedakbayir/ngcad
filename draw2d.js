// ahmedakbayir/ngcad/ngcad-57ad1e9e29c68ba90143525c3fd3ac20a130f44e/draw2d.js

// 'getObjectAtPoint' artık 'actions.js' dosyasından geliyor
import { getObjectAtPoint } from './actions.js';
import { state, dom, BG } from './main.js';
import { screenToWorld, distToSegmentSquared, findNodeAt, snapTo15DegreeAngle } from './geometry.js';
// 'getDoorPlacement' ve 'isSpaceForDoor' artık 'door-handler.js' dosyasından geliyor
import { getDoorPlacement, isSpaceForDoor } from './door-handler.js';
// 'getWindowPlacement' ve 'isSpaceForWindow' artık 'window-handler.js' dosyasından geliyor
import { getWindowPlacement, isSpaceForWindow } from './window-handler.js';
// drawStairs import edildiğinden emin olun
import { drawDoorSymbol, drawGrid, isMouseOverWall, drawWindowSymbol, drawVentSymbol, drawColumnSymbol, drawNodeWallCount, drawColumn, drawBeam, drawStairs } from './renderer2d.js'; // <-- drawStairs EKLEYİN
import { drawDimension, drawTotalDimensions, drawOuterDimensions } from './dimensions.js';
import { drawWallGeometry } from './draw-walls.js';
import { drawRoomPolygons, drawRoomNames } from './draw-rooms.js';
// getColumnCorners eskiden renderer2d'deydi, şimdi columns.js'den gelmeli (eğer orada değilse oraya taşınmalı)
// Eğer columns.js'de getColumnCorners yoksa, bu importu kaldırıp renderer2d'den almanız gerekir.
// Ancak refactoring sonrası columns.js'de olması daha mantıklı.
import { getColumnCorners } from './columns.js';
import { getBeamCorners } from './beams.js'; // <-- YENİ SATIRI EKLEYİN
import { getStairCorners } from './stairs.js'; // <-- MERDİVEN EKLENDİ
import {
    drawObjectPlacementPreviews,
    drawDragPreviews,
    drawSelectionFeedback,
    drawDrawingPreviews,
    drawSnapFeedback
} from './draw-previews.js';

import { drawSymmetryPreview } from './draw-previews.js';

function getStairStartPoint(stair) {
    if (!stair || !stair.center) return null;
    const corners = getStairCorners(stair);
    // Başlangıç kenarı sol kenardır (corners[0] ve corners[3] arası)
    return {
        x: (corners[0].x + corners[3].x) / 2,
        y: (corners[0].y + corners[3].y) / 2
    };
}

// Verilen bir merdivenin bitiş kenarının orta noktasını döndürür
function getStairEndPoint(stair) {
    if (!stair || !stair.center) return null;
    const corners = getStairCorners(stair);
    // Bitiş kenarı sağ kenardır (corners[1] ve corners[2] arası)
    return {
        x: (corners[1].x + corners[2].x) / 2,
        y: (corners[1].y + corners[2].y) / 2
    };
}

// Bağlı merdiven zincirlerini bulur ve okları çizer
function drawStairSequenceArrows(ctx2d, state) {
    const { stairs, zoom, lineThickness, wallBorderColor } = state;
    if (!stairs || stairs.length === 0) return;

    const stairMap = new Map(stairs.map(s => [s.id, s]));
    const visited = new Set(); // Zincirleri tekrar çizmemek için

    stairs.forEach(startStair => {
        // Eğer bu merdiven zaten bir zincirin parçasıysa veya altında normal bir merdiven varsa başlama noktası değildir
        if (visited.has(startStair.id) || (startStair.connectedStairId && stairMap.get(startStair.connectedStairId))) {
            return;
        }

        // Zinciri bul
        const sequence = [];
        let currentStair = startStair;
        while (currentStair) {
            sequence.push(currentStair);
            visited.add(currentStair.id);
            // Bir sonraki bağlı merdiveni bul
            const nextStair = stairs.find(s => s.connectedStairId === currentStair.id);
            currentStair = nextStair;
        }

        // Zincirde en az bir normal merdiven var mı?
        const hasNormalStair = sequence.some(s => !s.isLanding);
        if (!hasNormalStair) return; // Sadece sahanlıklardan oluşan zincir için ok çizme

        // Zincirin başlangıç ve bitiş noktalarını al
        const firstStairInSequence = sequence[0];
        const lastStairInSequence = sequence[sequence.length - 1];

        const overallStartPoint = getStairStartPoint(firstStairInSequence);
        const overallEndPoint = getStairEndPoint(lastStairInSequence);

        if (!overallStartPoint || !overallEndPoint) return; // Noktalar hesaplanamadıysa atla

        // Ok çizgisini çiz
        ctx2d.beginPath();
        ctx2d.moveTo(overallStartPoint.x, overallStartPoint.y);
        ctx2d.lineTo(overallEndPoint.x, overallEndPoint.y);
        ctx2d.lineWidth = (lineThickness / 1.5) / zoom;
        ctx2d.strokeStyle = wallBorderColor; // Şimdilik duvar rengiyle aynı
        ctx2d.stroke();

        // Ok başını SADECE zincirin sonuna çiz
        const arrowHeadSize = Math.min(lastStairInSequence.height * 0.3, 15 / zoom); // Son merdivenin genişliğine göre boyut
        const lastStairRotRad = (lastStairInSequence.rotation || 0) * Math.PI / 180;
        const dirX = Math.cos(lastStairRotRad); // Son merdivenin yönü
        const dirY = Math.sin(lastStairRotRad);
        const perpXArrow = -dirY; // Ok başına dik vektör
        const perpYArrow = dirX;

        // Ok başının tabanını hesapla (overallEndPoint'ten geri gelerek)
        const headBase = {
            x: overallEndPoint.x - dirX * arrowHeadSize,
            y: overallEndPoint.y - dirY * arrowHeadSize
        };
        // Ok başının köşe noktaları
        const headP1 = {
            x: headBase.x + perpXArrow * arrowHeadSize * 0.3,
            y: headBase.y + perpYArrow * arrowHeadSize * 0.5
        };
        const headP2 = {
            x: headBase.x - perpXArrow * arrowHeadSize * 0.3,
            y: headBase.y - perpYArrow * arrowHeadSize * 0.5
        };

        ctx2d.fillStyle = wallBorderColor;
        ctx2d.beginPath();
        ctx2d.moveTo(overallEndPoint.x, overallEndPoint.y); // Okun ucu
        ctx2d.lineTo(headP1.x, headP1.y);
        ctx2d.lineTo(headP2.x, headP2.y);
        ctx2d.closePath();
        ctx2d.fill();
    });
}


export function draw2D() {
    const { ctx2d, c2d } = dom;
    const {
        panOffset, zoom, rooms, walls, doors, beams, stairs, selectedObject, // <-- stairs EKLEYİN
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
        // Her kolon için isSelected durumunu kontrol et
        const isSelected = selectedObject?.type === "column" && selectedObject.object === column;
        drawColumn(column, isSelected);
    });

    // 4.5. KİRİŞLER
    (state.beams || []).forEach(beam => {
        // Her kiriş için isSelected durumunu kontrol et
        const isSelected = selectedObject?.type === "beam" && selectedObject.object === beam;
        drawBeam(beam, isSelected);
    });

    // 4.7. MERDİVENLER
    (state.stairs || []).forEach(stair => {
        // Her bir merdiven için seçili olup olmadığını kontrol et
        const isSelected = !!(
            selectedObject &&
            selectedObject.type === "stairs" &&
            selectedObject.object === stair
        );
        drawStairs(stair, isSelected);
    });

    // 5. Atomik Semboller
    nodes.forEach(node => {
        drawNodeWallCount(node);
    });

    // 6. Açı Sembolleri (Bu kısım merdivenlerle doğrudan ilgili değil)
    const nodesToDrawAngle = new Set();
    if (isDragging && selectedObject?.handle !== 'body' && selectedObject?.type === 'wall') { // Sadece duvar node'ları için
        const nodeToDrag = selectedObject.object[selectedObject.handle];
        nodesToDrawAngle.add(nodeToDrag);
    }
    else if (selectedObject?.type === 'wall') {
        nodesToDrawAngle.add(selectedObject.object.p1);
        nodesToDrawAngle.add(selectedObject.object.p2);
    }
    // Açı çizim mantığı buraya gelebilir (şu an yorumlu veya eksik)


    // 7. Mahal Etiketleri
    drawRoomNames(ctx2d, state, getObjectAtPoint);

    // 8. Kapılar, Pencereler, Menfezler
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
        if (wall.vents && wall.vents.length > 0) {
             wall.vents.forEach(vent => {
                 // Menfezler için özel seçim vurgusu eklenmemiş olabilir
                 const isSelected = selectedObject?.type === "vent" && selectedObject.object === vent;
                 drawVentSymbol(wall, vent, isSelected); // isSelected flag'i eklendi (drawVentSymbol güncellenmeli)
             });
        }
    });

    // Eski kolon sembolleri (node tabanlı) - Muhtemelen artık kullanılmıyor
    // nodes.forEach(node => {
    //     if (node.isColumn) {
    //         drawColumnSymbol(node);
    //     }
    // });

    // 9. Obj. Yerleştirme Önizlemeleri
    drawObjectPlacementPreviews(ctx2d, state, getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, drawDoorSymbol, drawWindowSymbol);

    // 10. Ölçülendirmeler
    if (dimensionMode === 1) {
        drawTotalDimensions();
    } else if (dimensionMode === 2) {
        walls.forEach((w) => {
            if (w.p1 && w.p2) drawDimension(w.p1, w.p2, false, 'single'); // Check added
        });
    }

    drawOuterDimensions(); // Dış ölçüler

    // Seçili nesne veya sürüklenen duvarlar için geçici ölçüler
    if (isDragging && affectedWalls.length > 0 && (dimensionMode === 0 || dimensionMode === 1) && selectedObject?.type === 'wall') {
        affectedWalls.forEach((wall) => {
             if (wall.p1 && wall.p2) drawDimension(wall.p1, wall.p2, true, 'single'); // Check added
        });
    } else if (!isDragging && selectedObject) { // Sürükleme yokken seçili nesne varsa
        if (selectedObject.type === "wall") {
            const selectedWall = selectedObject.object;
            const adjacency = wallAdjacency.get(selectedWall);
            const isInteriorWall = adjacency > 1;

            const node1 = selectedWall.p1;
            const node2 = selectedWall.p2;

            walls.forEach(wall => {
                if (wall === selectedWall || !wall.p1 || !wall.p2) return; // Kendisini ve geçersizleri atla
                if (wall.p1 === node1 || wall.p2 === node1 || wall.p1 === node2 || wall.p2 === node2) {
                    drawDimension(wall.p1, wall.p2, true, 'single');
                }
            });

            if (dimensionMode === 0 || (dimensionMode === 1 && isInteriorWall)) {
                 if (selectedWall.p1 && selectedWall.p2) drawDimension(selectedWall.p1, selectedWall.p2, true, 'single'); // Check added
            }
        } else if (selectedObject.type === "door" || selectedObject.type === "window") {
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
        } else if (selectedObject.type === "column") {
            const column = selectedObject.object;
            const corners = getColumnCorners(column);
            if (corners && corners.length === 4) { // Köşeler hesaplandıysa
                 drawDimension(corners[0], corners[1], false, 'columnBeam');
                 drawDimension(corners[1], corners[2], false, 'columnBeam');
            }
        } else if (selectedObject.type === "beam") {
            const beam = selectedObject.object;
            const corners = getBeamCorners(beam);
             if (corners && corners.length === 4) { // Köşeler hesaplandıysa
                 drawDimension(corners[0], corners[1], false, 'columnBeam');
                 drawDimension(corners[1], corners[2], false, 'columnBeam');
             }
        } else if (selectedObject.type === "stairs") { // <-- MERDİVEN EKLENDİ
            const stair = selectedObject.object;
            const corners = getStairCorners(stair);
             if (corners && corners.length === 4) { // Köşeler hesaplandıysa
                 drawDimension(corners[0], corners[1], false, 'columnBeam'); // Kiriş/Kolon ile aynı ölçü stilini kullan
                 drawDimension(corners[1], corners[2], false, 'columnBeam');
             }
        }
    }

    // --- YENİ: Duvar sürüklerken komşu duvar ölçüleri ---
    if (state.isDragging && state.tempNeighborWallsToDimension?.size > 0 && (state.selectedObject?.type === 'wall')) {
        ctx2d.globalAlpha = 0.7; // Ölçüleri biraz soluk göster
        state.tempNeighborWallsToDimension.forEach(neighborWall => {
            if (neighborWall && neighborWall.p1 && neighborWall.p2) { // Duvarın hala geçerli olup olmadığını kontrol et
                drawDimension(neighborWall.p1, neighborWall.p2, true, 'single'); // Önizleme olarak çiz
            }
        });
        ctx2d.globalAlpha = 1.0; // Alpha değerini sıfırla
    }
    // --- YENİ KOD SONU ---

    // 11. Sürükleme/Çizim Geri Bildirimleri
    drawDragPreviews(ctx2d, state, drawDimension);
    drawSelectionFeedback(ctx2d, state); // Bu fonksiyon seçili nesnenin ne olduğuna göre farklı şeyler çizebilir
    drawDrawingPreviews(ctx2d, state, snapTo15DegreeAngle, drawDimension);
    drawSnapFeedback(ctx2d, state, isMouseOverWall);
    drawSymmetryPreview(ctx2d, state);
    
    ctx2d.restore();
}