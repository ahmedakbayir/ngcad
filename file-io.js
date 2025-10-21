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
        wallThickness: state.wallThickness, // YENİ EKLENDİ
        drawingAngle: state.drawingAngle, // YENİ EKLENDİ
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
            thickness: w.thickness || state.wallThickness, // GÜNCELLENDİ
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
        }))
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

function openProject(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const projectData = JSON.parse(event.target.result);
            
            if (!projectData.version || !projectData.nodes || !projectData.walls) {
                alert('Geçersiz proje dosyası formatı!');
                return;
            }

            // Ayarları geri yükle
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
            
            // YENİ EKLENEN AYARLAR
            if (projectData.wallThickness) {
                setState({ wallThickness: projectData.wallThickness });
                dom.wallThicknessInput.value = projectData.wallThickness;
            }
            if (projectData.drawingAngle) {
                setState({ drawingAngle: projectData.drawingAngle });
                dom.drawingAngleInput.value = projectData.drawingAngle;
            }

            // Node'ları geri yükle
            const restoredNodes = projectData.nodes.map(n => ({
                x: n.x,
                y: n.y,
                isColumn: n.isColumn || false,
                columnSize: n.columnSize || 30
            }));

            // Duvarları geri yükle
            const restoredWalls = projectData.walls.map(w => ({
                type: w.type || 'wall',
                p1: restoredNodes[w.p1Index],
                p2: restoredNodes[w.p2Index],
                thickness: w.thickness || 20, // 20 varsayılan olarak kalsın
                wallType: w.wallType || 'normal',
                windows: w.windows || [],
                vents: w.vents || []
            }));

            // Kapıları geri yükle
            const restoredDoors = projectData.doors.map(d => ({
                wall: restoredWalls[d.wallIndex],
                pos: d.pos,
                width: d.width,
                type: d.type || 'door'
            }));

            // Odaları geri yükle
            const restoredRooms = projectData.rooms.map(r => ({
                polygon: r.polygon,
                area: r.area,
                center: r.center,
                name: r.name
            }));

            // State'i güncelle
            setState({
                nodes: restoredNodes,
                walls: restoredWalls,
                doors: restoredDoors,
                rooms: restoredRooms,
                selectedObject: null,
                selectedGroup: [],
                startPoint: null
            });

            // Duvarları işle ve history'ye kaydet
            processWalls();
            saveState();

            console.log('Proje başarıyla yüklendi!');
        } catch (error) {
            console.error('Proje yükleme hatası:', error);
            alert('Proje dosyası açılırken bir hata oluştu!');
        }
    };

    reader.readAsText(file);
    e.target.value = ''; // Input'u temizle
}