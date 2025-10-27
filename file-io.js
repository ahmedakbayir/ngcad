// FIX VERSION - Kapı pozisyonu düzeltmesi
import { state, setState, dom } from './main.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';

export function setupFileIOListeners() {
    dom.bSave.addEventListener('click', saveProject);
    dom.bOpen.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', openProject);
}

function saveProject() {
    const projectData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        gridOptions: state.gridOptions,
        snapOptions: state.snapOptions,
        wallBorderColor: state.wallBorderColor,
        roomFillColor: state.roomFillColor,
        lineThickness: state.lineThickness,
        wallThickness: state.wallThickness,
        drawingAngle: state.drawingAngle,
        nodes: state.nodes.map(n => ({
            x: n.x,
            y: n.y,
            isColumn: n.isColumn,
            columnSize: n.columnSize
        })),
        walls: state.walls.map(w => ({
            type: w.type,
            p1Index: state.nodes.indexOf(w.p1),
            p2Index: state.nodes.indexOf(w.p2),
            thickness: w.thickness || state.wallThickness,
            wallType: w.wallType || 'normal',
            windows: w.windows || [],
            vents: w.vents || []
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name
        })),
        columns: state.columns,
        beams: state.beams,
        stairs: state.stairs
    };

    const dataStr = JSON.stringify(projectData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `floorplan_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function parseZetaCadFormat(rawData) {
    if (rawData.projectData && rawData.projectData.projectInfo) {
        if (rawData.projectData.projectInfo.solidModel) {
            const solidModelStr = rawData.projectData.projectInfo.solidModel;
            try {
                const solidModel = JSON.parse(solidModelStr);
                if (solidModel.floors && solidModel.floors.length > 0) {
                    return convertZetaCadToOurFormat(solidModel.floors[0]);
                }
            } catch (parseError) {
                throw new Error('solidModel parse hatası: ' + parseError.message);
            }
        } else {
            alert('❌ Bu dosyada çizim verisi yok!');
            return null;
        }
    }
    
    if (rawData.floors && rawData.floors.length > 0) {
        return convertZetaCadToOurFormat(rawData.floors[0]);
    }
    
    return null;
}

function convertZetaCadToOurFormat(floorData) {
    console.log('═══════════════════════════════════════════');
    console.log('🔧 KAPΙ POZİSYONU DÜZELTMESİ');
    console.log('═══════════════════════════════════════════');
    
    const SCALE_FACTOR = 4.8;
    console.log(`📏 SCALE_FACTOR: ${SCALE_FACTOR}`);
    
    const nodes = floorData.points.map(p => ({
        x: p.x * SCALE_FACTOR,
        y: p.y * SCALE_FACTOR,
        isColumn: false,
        columnSize: 30
    }));

    const walls = [];
    const doors = [];
    let windowCount = 0;
    
    console.log('\n🚪 Duvar ve açıklık analizi:\n');
    
    floorData.walls.forEach((wall, wallIdx) => {
        const p1 = nodes[wall.startIndex];
        const p2 = nodes[wall.endIndex];
        
        if (!p1 || !p2) return;
        
        // Duvar uzunluğunu hesapla
        const wallLength = Math.sqrt(
            Math.pow(p2.x - p1.x, 2) + 
            Math.pow(p2.y - p1.y, 2)
        );
        
        const newWall = {
            type: 'wall',
            p1: p1,
            p2: p2,
            thickness: (wall.thickness || 20) * SCALE_FACTOR,
            wallType: wall.type === 2 ? 'exterior' : 'normal',
            windows: [],
            vents: []
        };
        
        // Kapı ve pencereleri işle
        if (wall.doors && wall.doors.length > 0) {
            console.log(`Duvar ${wallIdx} (uzunluk: ${wallLength.toFixed(1)}):`);
            
            wall.doors.forEach((door, doorIdx) => {
                // ZetaCAD'deki pozisyon muhtemelen ölçeksiz
                const originalPos = door.start;
                const originalLength = door.length;
                
                // Pozisyonu ölçeklendir
                const scaledPos = originalPos * SCALE_FACTOR;
                const scaledLength = originalLength * SCALE_FACTOR;
                
                // Pozisyonun duvar uzunluğuna oranını hesapla (0-1 arası)
                const ratio = originalPos / (p2.x - p1.x !== 0 ? Math.abs(p2.x - p1.x) / SCALE_FACTOR : Math.abs(p2.y - p1.y) / SCALE_FACTOR);
                
                if (door.isWindow) {
                    // PENCERE
                    const window = {
                        start: scaledPos,
                        length: scaledLength,
                        height: (door.height || 26) * SCALE_FACTOR,
                        offset: (door.offset || 14) * SCALE_FACTOR
                    };
                    newWall.windows.push(window);
                    windowCount++;
                    console.log(`  ✅ Pencere ${doorIdx}: pos=${scaledPos.toFixed(1)} (${(ratio*100).toFixed(0)}%), len=${scaledLength.toFixed(1)}`);
                } else {
                    // KAPI
                    const doorObj = {
                        wall: newWall,
                        pos: scaledPos,
                        width: scaledLength,
                        type: 'door'
                    };
                    doors.push(doorObj);
                    console.log(`  ✅ Kapı ${doorIdx}: pos=${scaledPos.toFixed(1)} (${(ratio*100).toFixed(0)}%), width=${scaledLength.toFixed(1)}`);
                }
            });
        }
        
        walls.push(newWall);
    });

    console.log(`\n📊 Toplam: ${walls.length} duvar, ${doors.length} kapı, ${windowCount} pencere\n`);

    // ODALAR
    const rooms = [];
    console.log('🏠 Oda analizi:\n');
    
    if (floorData.units) {
        floorData.units.forEach((unit, unitIdx) => {
            if (unit.regions) {
                unit.regions.forEach((region, regionIdx) => {
                    const polygon = region.points
                        .map(idx => nodes[idx])
                        .filter(n => n !== undefined);
                    
                    if (polygon.length >= 3) {
                        const center = {
                            x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
                            y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
                        };
                        
                        const room = {
                            polygon: polygon,
                            area: region.area * SCALE_FACTOR * SCALE_FACTOR,
                            center: center,
                            name: region.name
                        };
                        
                        rooms.push(room);
                        console.log(`  ✅ "${region.name}" @ (${center.x.toFixed(0)}, ${center.y.toFixed(0)})`);
                    }
                });
            }
        });
    }
    
    console.log(`\n📊 Toplam: ${rooms.length} oda`);
    console.log('═══════════════════════════════════════════\n');

    return {
        nodes: nodes,
        walls: walls,
        doors: doors,
        rooms: rooms,
        columns: [],
        beams: [],
        stairs: []
    };
}

function openProject(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            console.clear();
            const rawData = JSON.parse(event.target.result);

            if (rawData.version && rawData.nodes && rawData.walls) {
                loadOurFormat(rawData);
                return;
            }

            const convertedData = parseZetaCadFormat(rawData);
            if (convertedData) {
                loadConvertedData(convertedData);
                return;
            }

            alert('❌ Geçersiz dosya formatı!');
        } catch (error) {
            console.error('💥 HATA:', error);
            alert('❌ Hata: ' + error.message);
        }
    };

    reader.readAsText(file);
    e.target.value = '';
}

function loadOurFormat(projectData) {
    if (projectData.gridOptions) {
        setState({ gridOptions: projectData.gridOptions });
        dom.gridVisibleInput.checked = projectData.gridOptions.visible;
        dom.gridColorInput.value = projectData.gridOptions.color;
        dom.gridWeightInput.value = projectData.gridOptions.weight;
        dom.gridSpaceInput.value = projectData.gridOptions.spacing;
    }

    if (projectData.snapOptions) {
        setState({ snapOptions: projectData.snapOptions });
        dom.snapEndpointInput.checked = projectData.snapOptions.endpoint;
        dom.snapMidpointInput.checked = projectData.snapOptions.midpoint;
        dom.snapEndpointExtInput.checked = projectData.snapOptions.endpointExtension;
        dom.snapMidpointExtInput.checked = projectData.snapOptions.midpointExtension;
        dom.snapNearestOnlyInput.checked = projectData.snapOptions.nearestOnly;
    }

    if (projectData.wallBorderColor) {
        setState({ wallBorderColor: projectData.wallBorderColor });
        dom.borderPicker.value = projectData.wallBorderColor;
    }

    if (projectData.roomFillColor) {
        setState({ roomFillColor: projectData.roomFillColor });
        dom.roomPicker.value = projectData.roomFillColor;
    }

    if (projectData.lineThickness) {
        setState({ lineThickness: projectData.lineThickness });
        dom.lineThicknessInput.value = projectData.lineThickness;
    }

    if (projectData.wallThickness) {
        setState({ wallThickness: projectData.wallThickness });
        dom.wallThicknessInput.value = projectData.wallThickness;
    }
    
    if (projectData.drawingAngle) {
        setState({ drawingAngle: projectData.drawingAngle });
        dom.drawingAngleInput.value = projectData.drawingAngle;
    }

    const restoredNodes = projectData.nodes.map(n => ({
        x: n.x,
        y: n.y,
        isColumn: n.isColumn || false,
        columnSize: n.columnSize || 30
    }));

    const restoredWalls = projectData.walls.map(w => ({
        type: w.type || 'wall',
        p1: restoredNodes[w.p1Index],
        p2: restoredNodes[w.p2Index],
        thickness: w.thickness || 20,
        wallType: w.wallType || 'normal',
        windows: w.windows || [],
        vents: w.vents || []
    }));

    const restoredDoors = projectData.doors.map(d => ({
        wall: restoredWalls[d.wallIndex],
        pos: d.pos,
        width: d.width,
        type: d.type || 'door'
    }));

    const restoredRooms = projectData.rooms.map(r => ({
        polygon: r.polygon,
        area: r.area,
        center: r.center,
        name: r.name
    }));

    const restoredColumns = projectData.columns || [];
    const restoredBeams = projectData.beams || [];
    const restoredStairs = projectData.stairs || [];

    setState({
        nodes: restoredNodes,
        walls: restoredWalls,
        doors: restoredDoors,
        rooms: restoredRooms,
        columns: restoredColumns,
        beams: restoredBeams,
        stairs: restoredStairs,
        selectedObject: null,
        selectedGroup: [],
        startPoint: null
    });

    processWalls();
    saveState();
}

function loadConvertedData(convertedData) {
    console.log('\n📦 State yükleniyor...\n');
    
    // Duvarları kontrol et - pencereler var mı?
    let totalWindows = 0;
    convertedData.walls.forEach((wall, idx) => {
        if (wall.windows && wall.windows.length > 0) {
            totalWindows += wall.windows.length;
            console.log(`Duvar ${idx}: ${wall.windows.length} pencere`);
        }
    });
    
    console.log(`\n✅ Toplam ${totalWindows} pencere duvarlara eklendi`);
    console.log(`✅ Toplam ${convertedData.doors.length} kapı state'e eklendi`);
    console.log(`✅ Toplam ${convertedData.rooms.length} oda state'e eklendi\n`);
    
    setState({
        nodes: convertedData.nodes,
        walls: convertedData.walls,
        doors: convertedData.doors,
        rooms: convertedData.rooms,
        columns: [],
        beams: [],
        stairs: [],
        selectedObject: null,
        selectedGroup: [],
        startPoint: null
    });

    // processWalls() birkaç kez çağır - kapı pozisyonlarını düzeltir
    processWalls();
    processWalls(); // İkinci kez
    saveState();
    
    // Biraz bekleyip tekrar process et (async render fix)
    setTimeout(() => {
        processWalls();
        console.log('🔄 processWalls() tekrar çağrıldı (async fix)');
    }, 100);

    console.log('═══════════════════════════════════════════');
    console.log('💡 RENDER KONTROL:');
    console.log('═══════════════════════════════════════════');
    
    // Pencere kontrolü
    let windowWalls = 0;
    totalWindows = 0;
    state.walls.forEach((wall, idx) => {
        if (wall.windows && wall.windows.length > 0) {
            windowWalls++;
            totalWindows += wall.windows.length;
        }
    });
    
    console.log(`✅ ${windowWalls} duvarda toplam ${totalWindows} pencere VAR`);
    console.log(`✅ ${state.rooms.length} oda VAR (isimli)`);
    
    if (totalWindows > 0) {
        console.log('\n⚠️ Pencereler state\'de VAR ama GÖRÜNMÜYOR!');
        console.log('   → Render sisteminiz wall.windows array\'ini çizmiyor');
        console.log('   → renderer2d.js veya draw2d.js\'e pencere çizim kodu ekleyin');
    }
    
    if (state.rooms.length > 0) {
        console.log('\n⚠️ Oda isimleri state\'de VAR ama GÖRÜNMÜYOR!');
        console.log('   → Render sisteminiz room.name\'i çizmiyor');
        console.log('   → Oda render fonksiyonuna text çizimi ekleyin');
        console.log('\nÖrnek oda:', state.rooms[0]);
    }
    
    console.log('═══════════════════════════════════════════\n');
    
    alert(`✅ Proje Yüklendi!\n\n` +
          `📐 ${convertedData.walls.length} duvar\n` +
          `🚪 ${convertedData.doors.length} kapı\n` +
          `🪟 ${totalWindows} pencere (wall.windows içinde)\n` +
          `🏠 ${convertedData.rooms.length} oda\n\n` +
          `📏 Ölçek: 4.8x\n\n` +
          `Console'u kontrol edin!`);
}