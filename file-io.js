import { state, setState, dom } from './main.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { update3DScene } from './scene3d.js';

export function setupFileIOListeners() {
    dom.bSave.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
            nodes: state.nodes,
            walls: state.walls,
            doors: state.doors,
            rooms: state.rooms,
            arcWalls: state.arcWalls || [],
            wallBorderColor: state.wallBorderColor,
            roomFillColor: state.roomFillColor,
            lineThickness: state.lineThickness,
            snapOptions: state.snapOptions,
            gridOptions: state.gridOptions,
        }));
        
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "plan.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    dom.bOpen.addEventListener('click', () => {
        dom.fileInput.click();
    });

    dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // Duvarları yüklerken thickness ve wallType'ı koru
                const loadedWalls = (data.walls || []).map(wall => ({
                    ...wall,
                    thickness: wall.thickness || 20,
                    wallType: wall.wallType || 'normal'
                }));
                
                // Yay duvarları yüklerken thickness ve wallType'ı koru
                const loadedArcWalls = (data.arcWalls || []).map(arcWall => ({
                    ...arcWall,
                    thickness: arcWall.thickness || 20,
                    wallType: arcWall.wallType || 'normal'
                }));
                
                setState({
                    nodes: data.nodes || [],
                    walls: loadedWalls,
                    doors: data.doors || [],
                    rooms: data.rooms || [],
                    arcWalls: loadedArcWalls,
                    wallBorderColor: data.wallBorderColor || "#e7e6d0",
                    roomFillColor: data.roomFillColor || "#1e1f20",
                    lineThickness: data.lineThickness || 2,
                    snapOptions: data.snapOptions || {
                        endpoint: true,
                        midpoint: true,
                        endpointExtension: true,
                        midpointExtension: false,
                        nearestOnly: true,
                    },
                    gridOptions: data.gridOptions || {
                        visible: true,
                        spacing: 10,
                        color: "#2d3134",
                        weight: 0.5,
                    },
                    selectedObject: null,
                    selectedGroup: [],
                    startPoint: null,
                });

                // UI'yi güncelle
                if (dom.borderPicker) dom.borderPicker.value = state.wallBorderColor;
                if (dom.roomPicker) dom.roomPicker.value = state.roomFillColor;
                if (dom.lineThicknessInput) dom.lineThicknessInput.value = state.lineThickness;
                if (dom.gridVisibleInput) dom.gridVisibleInput.checked = state.gridOptions.visible;
                if (dom.gridColorInput) dom.gridColorInput.value = state.gridOptions.color;
                if (dom.gridWeightInput) dom.gridWeightInput.value = state.gridOptions.weight;
                if (dom.gridSpaceInput) dom.gridSpaceInput.value = state.gridOptions.spacing;
                if (dom.snapEndpointInput) dom.snapEndpointInput.checked = state.snapOptions.endpoint;
                if (dom.snapMidpointInput) dom.snapMidpointInput.checked = state.snapOptions.midpoint;
                if (dom.snapEndpointExtInput) dom.snapEndpointExtInput.checked = state.snapOptions.endpointExtension;
                if (dom.snapMidpointExtInput) dom.snapMidpointExtInput.checked = state.snapOptions.midpointExtension;
                if (dom.snapNearestOnlyInput) dom.snapNearestOnlyInput.checked = state.snapOptions.nearestOnly;

                processWalls();
                update3DScene();
                saveState();
                
                console.log('Plan yüklendi:', {
                    duvarSayisi: state.walls.length,
                    yayDuvarSayisi: state.arcWalls.length,
                    kapiSayisi: state.doors.length,
                    mahalSayisi: state.rooms.length
                });
            } catch (err) {
                console.error('Dosya yükleme hatası:', err);
                alert('Dosya yüklenirken hata oluştu!');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}