// ahmedakbayir/ngcad/ngcad-1155ed0bac43291d5fa09dccd1aecb0c8570a287/general-files/file-io.js
// DÜZELTME: importFromXML fonksiyon adı düzeltildi.

import { state, setState, dom } from './main.js';
import { saveState } from './history.js';
import { processWalls } from '../wall/wall-processor.js';
import { importFromXML } from './xml-io.js'; // <-- HATA BURADAYDI (Satır 5)
import { renderMiniPanel } from '../floor/floor-panel.js'; // <-- KAT PANELİ İÇİN EKLENDİ

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
        dimensionOptions: state.dimensionOptions, // EKLENDİ
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
            vents: w.vents || [],
            isArc: w.isArc, // EKLENDİ
            arcControl1: w.arcControl1, // EKLENDİ
            arcControl2: w.arcControl2,  // EKLENDİ
            floorId: w.floorId // floorId ekle
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type,
            isWidthManuallySet: d.isWidthManuallySet // EKLENDİ
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name,
            centerOffset: r.centerOffset, // EKLENDİ
            floorId: r.floorId // EKLENDİ
        })),
        columns: state.columns, // <-- GÜNCELLENDİ/EKLENDİ
        beams: state.beams, 
        stairs: state.stairs.map(s => ({ // <-- MERDİVEN GÜNCELLENDİ
            type: s.type,
            id: s.id, // ID eklendi
            name: s.name, // name eklendi
            center: s.center,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            stepCount: s.stepCount,
            bottomElevation: s.bottomElevation, // eklendi
            topElevation: s.topElevation, // eklendi
            connectedStairId: s.connectedStairId, // eklendi
            isLanding: s.isLanding, // eklendi
            showRailing: s.showRailing // <-- DÜZELTME: Korkuluk bilgisi eklendi
        })),
        guides: state.guides || [], // <-- REFERANS ÇİZGİSİ EKLENDİ
        floors: state.floors || [], // <-- KAT BİLGİLERİ EKLENDİ
        currentFloor: state.currentFloor || null, // <-- AKTİF KAT EKLENDİ
        defaultFloorHeight: state.defaultFloorHeight || 270 // <-- VARSAYILAN KAT YÜKSEKLİĞİ EKLENDİ
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

// --- BU FONKSİYON GÜNCELLENDİ ---
function openProject(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const fileContent = event.target.result;
        const fileName = file.name.toLowerCase();

        try {
            // YENİ: Dosya uzantısına göre yönlendir
            if (fileName.endsWith('.xml')) {
                console.log("XML dosyası okunuyor...");
                // XML import fonksiyonunu (xml-io.js'den) çağır
                importFromXML(fileContent); // <-- HATA BURADAYDI (Satır 107)

            } else if (fileName.endsWith('.json')) {
                console.log("JSON dosyası okunuyor...");
                // Mevcut JSON yükleme mantığı
                const projectData = JSON.parse(fileContent);

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
                
                if (projectData.dimensionOptions) {
                    setState({ dimensionOptions: projectData.dimensionOptions });
                    dom.dimensionFontSizeInput.value = projectData.dimensionOptions.fontSize;
                    dom.dimensionColorInput.value = projectData.dimensionOptions.color;
                    dom.dimensionDefaultViewSelect.value = projectData.dimensionOptions.defaultView;
                    dom.dimensionShowAreaSelect.value = projectData.dimensionOptions.showArea;
                    dom.dimensionShowOuterSelect.value = projectData.dimensionOptions.showOuter;
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
                    thickness: w.thickness || 20,
                    wallType: w.wallType || 'normal',
                    windows: w.windows || [],
                    vents: w.vents || [],
                    isArc: w.isArc,
                    arcControl1: w.arcControl1,
                    arcControl2: w.arcControl2,
                    floorId: w.floorId // floorId geri yükle
                }));

                // Kapıları geri yükle
                const restoredDoors = projectData.doors.map(d => ({
                    wall: restoredWalls[d.wallIndex],
                    pos: d.pos,
                    width: d.width,
                    type: d.type || 'door',
                    isWidthManuallySet: d.isWidthManuallySet
                }));

                // Odaları geri yükle
                const restoredRooms = projectData.rooms.map(r => ({
                    polygon: r.polygon,
                    area: r.area,
                    center: r.center,
                    name: r.name,
                    centerOffset: r.centerOffset,
                    floorId: r.floorId
                }));

                // Kolonları, Kirişleri ve Merdivenleri geri yükle
                const restoredColumns = projectData.columns || [];
                const restoredBeams = projectData.beams || [];
                const restoredStairs = (projectData.stairs || []).map(s => ({ 
                     type: s.type || 'stairs',
                     id: s.id || `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                     name: s.name || 'Merdiven',
                     center: s.center,
                     width: s.width,
                     height: s.height,
                     rotation: s.rotation,
                     stepCount: s.stepCount || 1,
                     bottomElevation: s.bottomElevation || 0,
                     topElevation: s.topElevation || 270,
                     connectedStairId: s.connectedStairId || null,
                     isLanding: s.isLanding || false,
                     showRailing: s.showRailing || false
                }));
                const restoredGuides = projectData.guides || [];

                // Katları geri yükle
                const restoredFloors = projectData.floors || [];
                const restoredCurrentFloor = projectData.currentFloor ?
                    restoredFloors.find(f => f.id === projectData.currentFloor.id) : null;
                const restoredDefaultFloorHeight = projectData.defaultFloorHeight || 270;

                // State'i güncelle
                setState({
                    nodes: restoredNodes,
                    walls: restoredWalls,
                    doors: restoredDoors,
                    rooms: restoredRooms,
                    columns: restoredColumns,
                    beams: restoredBeams,
                    stairs: restoredStairs,
                    guides: restoredGuides,
                    floors: restoredFloors,
                    currentFloor: restoredCurrentFloor,
                    defaultFloorHeight: restoredDefaultFloorHeight,
                    selectedObject: null,
                    selectedGroup: [],
                    startPoint: null
                });

                // Kat panelini güncelle
                if (restoredFloors.length > 0) {
                    renderMiniPanel();
                }

                // Duvarları işle ve history'ye kaydet - TÜM KATLARI İŞLE
                processWalls(false, false, true);
                saveState();

                console.log('JSON Proje başarıyla yüklendi!');

            } else if (fileName.endsWith('.vdcl')) {
                // KULLANICIYA UYARI VER
                alert("HATA: .vdcl dosyası sıkıştırılmış bir dosyadır.\n\Lütfen bu dosyayı 7zip veya WinRAR gibi bir programla açıp içindeki .xml dosyasını çıkarın ve o dosyayı 'Aç' butonuyla seçin.");
            
            } else {
                alert("Desteklenmeyen dosya formatı: " + fileName);
            }

        } catch (error) {
            console.error('Proje yükleme hatası:', error);
            alert('Proje dosyası açılırken bir hata oluştu! Dosya formatı bozuk olabilir. Hata: ' + error.message);
        }
    };

    reader.readAsText(file); // Metin olarak oku (JSON veya XML için)

    e.target.value = ''; // Input'u temizle
}