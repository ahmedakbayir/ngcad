// ahmedakbayir/ngcad/ngcad-1155ed0bac43291d5fa09dccd1aecb0c8570a287/general-files/file-io.js
// DÜZELTME: importFromXML fonksiyon adı düzeltildi.

import { state, setState, dom } from './main.js';
import { saveState } from './history.js';
import { processWalls } from '../wall/wall-processor.js';
import { importFromXML } from './xml-io.js'; // <-- HATA BURADAYDI (Satır 5)
import { renderMiniPanel } from '../floor/floor-panel.js'; // <-- KAT PANELİ İÇİN EKLENDİ
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

export function setupFileIOListeners() {
    dom.bSave.addEventListener('click', saveProject);
    dom.bOpen.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', openProject);

    // Sürükle-bırak desteği ekle
    setupDragAndDrop();
}

/**
 * Canvas'a sürükle-bırak desteği ekle
 */
function setupDragAndDrop() {
    const dropZone = dom.mainContainer;

    // Sürükleme sırasında varsayılan davranışı engelle
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Sürüklerken görsel feedback
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropZone.style.opacity = '0.7';
        dropZone.style.border = '3px dashed #4CAF50';
    }

    function unhighlight() {
        dropZone.style.opacity = '1';
        dropZone.style.border = '';
    }

    // Dosya bırakıldığında
    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            const file = files[0];
            const fileName = file.name.toLowerCase();

            // Sadece desteklenen dosya formatlarını kabul et
            if (fileName.endsWith('.xml') || fileName.endsWith('.json') || fileName.endsWith('.vdcl')) {
                // FileReader ile dosyayı oku ve openProject benzeri işle
                const reader = new FileReader();
                reader.onload = (event) => {
                    const fileContent = event.target.result;
                    const originalName = file.name.replace(/\.[^.]+$/, '');

                    try {
                        if (fileName.endsWith('.xml')) {
                            console.log("XML dosyası sürükle-bırak ile yükleniyor...");
                            importFromXML(fileContent, { fileName: originalName });
                        } else if (fileName.endsWith('.json')) {
                            console.log("JSON dosyası sürükle-bırak ile yükleniyor...");
                            // JSON yükleme mantığı - openProject fonksiyonundan kopyala
                            loadJSONProject(fileContent);
                        } else if (fileName.endsWith('.vdcl')) {
                            alert("HATA: .vdcl dosyası sıkıştırılmış bir dosyadır.\n\nLütfen bu dosyayı 7zip veya WinRAR gibi bir programla açıp içindeki .xml dosyasını çıkarın ve o dosyayı sürükleyip bırakın.");
                        }
                    } catch (error) {
                        console.error('Dosya yükleme hatası:', error);
                        alert('Dosya yüklenirken bir hata oluştu! Hata: ' + error.message);
                    }
                };

                reader.readAsText(file);
            } else {
                alert("Desteklenmeyen dosya formatı: " + fileName + "\n\nSadece .xml, .json veya .vdcl dosyaları desteklenmektedir.");
            }
        }
    }
}

function saveProject() {
    const projectData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        gridOptions: state.gridOptions,
        snapOptions: state.snapOptions,
        dimensionOptions: state.dimensionOptions,
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
            vents: w.vents || [],
            isArc: w.isArc,
            arcControl1: w.arcControl1,
            arcControl2: w.arcControl2,
            floorId: w.floorId,
            description: w.description || ''
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type,
            isWidthManuallySet: d.isWidthManuallySet,
            description: d.description || ''
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name,
            centerOffset: r.centerOffset,
            floorId: r.floorId,
            description: r.description || ''
        })),
        columns: state.columns,
        beams: state.beams, 
        stairs: state.stairs.map(s => ({
            type: s.type,
            id: s.id,
            name: s.name,
            center: s.center,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            stepCount: s.stepCount,
            bottomElevation: s.bottomElevation,
            topElevation: s.topElevation,
            connectedStairId: s.connectedStairId,
            isLanding: s.isLanding,
            showRailing: s.showRailing,
            floorId: s.floorId
        })),
        guides: state.guides || [],
        textAnnotations: (state.textAnnotations || []).map(t => ({
            type: 'textAnnotation',
            id: t.id,
            x: t.x,
            y: t.y,
            text: t.text || '',
            size: t.size || 'medium',
            floorId: t.floorId
        })),
        floors: state.floors || [],
        currentFloor: state.currentFloor || null,
        defaultFloorHeight: state.defaultFloorHeight || 300,
        plumbingNodes: state.plumbingNodes || [],
        plumbingPipes: state.plumbingPipes || [],
        plumbingBlocks: state.plumbingBlocks || [],
        plumbingLabelOffsets: state.plumbingLabelOffsets || {},

        // İzometri görünüm düzenlemeleri
        isoPipeOffsets: state.isoPipeOffsets || {},
        isoComponentOffsets: state.isoComponentOffsets || {},
        isoLabelOffsets: state.isoLabelOffsets || {}
    };

    const dataStr = JSON.stringify(projectData, null, 2);

    // =================================================================
    // TARİH FORMATLAMA VE İSİM GÜNCELLEME MANTIĞI
    // =================================================================
    
    // YYYYMMDD formatında tarih üret (Örn: 20260415)
    const getFormattedDate = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    };

    let baseName = window.currentProjectName || "Ahmet Akbayir";
    const dateSuffix = getFormattedDate();

    // Eğer ismin sonunda zaten bugünün tarihi yoksa ekle
    // Regex, ismin sonunda " 20260415" gibi bir kalıp olup olmadığını kontrol eder
    const datePattern = new RegExp(`\\s${dateSuffix}$`);
    
    if (!datePattern.test(baseName)) {
        // Eski tarihli bir isimse (başka bir günün tarihi varsa) onu temizleyip yenisini ekle
        // Bu satır "İsim 20260414" -> "İsim 20260415" dönüşümünü sağlar
        baseName = baseName.replace(/\s\d{8}$/, ""); 
        baseName = `${baseName} ${dateSuffix}`;
        
        // UI ve Global değişkenleri güncelle
        window.currentProjectName = baseName;
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) nameInput.value = baseName;
        document.title = `${baseName} - AangCAD`;
    }

    let fileName = `${baseName}.json`;

    // =================================================================
    // KAYDETME İŞLEMİ (ASENKRON)
    // =================================================================
    
    (async () => {
        try {
            if ('showSaveFilePicker' in window) {
                let fileHandle = window.currentFileHandle;

                // Farklı Kaydet veya yeni dosya durumu
                if (window.saveAsNewFile || !fileHandle) {
                    fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{
                            description: 'AangCAD Proje Dosyası',
                            accept: { 'application/json': ['.json'] },
                        }],
                    });
                    window.currentFileHandle = fileHandle; 
                    
                    // Dosya isminden uzantıyı çıkarıp son hali UI'a yansıt
                    const actualName = fileHandle.name.replace(/\.json$/i, '');
                    window.currentProjectName = actualName;
                    const nameInput = document.getElementById('projectNameInput');
                    if (nameInput) nameInput.value = actualName;
                    document.title = `${actualName} - AangCAD`;
                }

                const writable = await fileHandle.createWritable();
                await writable.write(dataStr);
                await writable.close();
                console.log(`Proje kaydedildi: ${window.currentProjectName}`);

            } else {
                // Tarayıcı desteği yoksa standart indirme
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Kaydetme hatası:", error);
            }
        }
    })();
}

/**
 * JSON proje dosyasını yükle (openProject ve drag-and-drop için ortak fonksiyon)
 */
function loadJSONProject(fileContent) {
    const projectData = JSON.parse(fileContent);

    if (!projectData.version || !projectData.nodes || !projectData.walls) {
        alert('Geçersiz proje dosyası formatı!');
        return;
    }

    // // Ayarları geri yükle
    // if (projectData.gridOptions) {
    //     setState({ gridOptions: projectData.gridOptions });
    //     dom.gridVisibleInput.checked = projectData.gridOptions.visible;
    //     dom.gridColorInput.value = projectData.gridOptions.color;
    //     dom.gridWeightInput.value = projectData.gridOptions.weight;
    //     dom.gridSpaceInput.value = projectData.gridOptions.spacing;
    // }

    // if (projectData.snapOptions) {
    //     setState({ snapOptions: projectData.snapOptions });
    //     dom.snapEndpointInput.checked = projectData.snapOptions.endpoint;
    //     dom.snapMidpointInput.checked = projectData.snapOptions.midpoint;
    //     dom.snapEndpointExtInput.checked = projectData.snapOptions.endpointExtension;
    //     dom.snapMidpointExtInput.checked = projectData.snapOptions.midpointExtension;
    //     dom.snapNearestOnlyInput.checked = projectData.snapOptions.nearestOnly;
    // }

    // if (projectData.dimensionOptions) {
    //     setState({ dimensionOptions: projectData.dimensionOptions });
    //     dom.dimensionFontSizeInput.value = projectData.dimensionOptions.fontSize;
    //     dom.dimensionColorInput.value = projectData.dimensionOptions.color;
    //     dom.dimensionDefaultViewSelect.value = projectData.dimensionOptions.defaultView;
    //     dom.dimensionShowAreaSelect.value = projectData.dimensionOptions.showArea;
    //     dom.dimensionShowOuterSelect.value = projectData.dimensionOptions.showOuter;
    // }

    // if (projectData.wallBorderColor) {
    //     setState({ wallBorderColor: projectData.wallBorderColor });
    //     dom.borderPicker.value = projectData.wallBorderColor;
    // }

    // if (projectData.roomFillColor) {
    //     setState({ roomFillColor: projectData.roomFillColor });
    //     dom.roomPicker.value = projectData.roomFillColor;
    // }

    // if (projectData.lineThickness) {
    //     setState({ lineThickness: projectData.lineThickness });
    //     dom.lineThicknessInput.value = projectData.lineThickness;
    // }

    // if (projectData.wallThickness) {
    //     setState({ wallThickness: projectData.wallThickness });
    //     dom.wallThicknessInput.value = projectData.wallThickness;
    // }
    // if (projectData.drawingAngle) {
    //     setState({ drawingAngle: projectData.drawingAngle });
    //     dom.drawingAngleInput.value = projectData.drawingAngle;
    // }

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
        floorId: w.floorId, // floorId geri yükle
        description: w.description || ''
    }));

    // Kapıları geri yükle
    const restoredDoors = projectData.doors.map(d => ({
        wall: restoredWalls[d.wallIndex],
        pos: d.pos,
        width: d.width,
        type: d.type || 'door',
        isWidthManuallySet: d.isWidthManuallySet,
        description: d.description || ''
    }));

    // Odaları geri yükle
    const restoredRooms = projectData.rooms.map(r => ({
        polygon: r.polygon,
        area: r.area,
        center: r.center,
        name: r.name,
        centerOffset: r.centerOffset,
        floorId: r.floorId,
        description: r.description || ''
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
         topElevation: s.topElevation || 300,
         connectedStairId: s.connectedStairId || null,
         isLanding: s.isLanding || false,
         showRailing: s.showRailing || false,
         floorId: s.floorId // <-- DÜZELTME: Kat bilgisi geri yükleniyor
    }));
    const restoredGuides = projectData.guides || [];
    const restoredTextAnnotations = (projectData.textAnnotations || []).map(t => ({
        type: 'textAnnotation',
        id: t.id || `text_${Date.now()}_${Math.random().toString(16).slice(2,8)}`,
        x: t.x,
        y: t.y,
        text: t.text || '',
        size: t.size || 'medium',
        floorId: t.floorId
    }));

    // Katları geri yükle
    const restoredFloors = projectData.floors || [];
    const restoredCurrentFloor = projectData.currentFloor ?
        restoredFloors.find(f => f.id === projectData.currentFloor.id) : null;
    const restoredDefaultFloorHeight = projectData.defaultFloorHeight || 300

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
        textAnnotations: restoredTextAnnotations,
        floors: restoredFloors,
        currentFloor: restoredCurrentFloor,
        defaultFloorHeight: restoredDefaultFloorHeight,
        selectedObject: null,
        selectedGroup: [],
        startPoint: null,
        // Tesisat verileri
        plumbingNodes: projectData.plumbingNodes || [],
        plumbingPipes: projectData.plumbingPipes || [],
        plumbingBlocks: projectData.plumbingBlocks || [],
        plumbingLabelOffsets: projectData.plumbingLabelOffsets || {},

        // İzometri görünüm düzenlemeleri
        isoPipeOffsets: projectData.isoPipeOffsets || {},
        isoComponentOffsets: projectData.isoComponentOffsets || {},
        isoLabelOffsets: projectData.isoLabelOffsets || {}
    });

    // Tesisat yöneticisini güncelle
    if (plumbingManager) {
        plumbingManager.loadFromState();
    }

    // Kat panelini güncelle
    if (restoredFloors.length > 0) {
        renderMiniPanel();
    }

    // Duvarları işle, sonra history'yi SIFIRLA ve yüklenmiş halini taban (baseline) snapshot yap
    processWalls(false, false, true);
    // Açılan proje undo baseline'ı: önceki history sıfırlanır → undo, ilk açılış halinden daha geriye gidemez
    state.history = [];
    state.historyIndex = -1;
    saveState();

    console.log('JSON Proje başarıyla yüklendi!');

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
                const originalName = file.name.replace(/\.[^.]+$/, '');
                // XML import fonksiyonunu (xml-io.js'den) çağır
                importFromXML(fileContent, { fileName: originalName });

            } else if (fileName.endsWith('.json')) {
                console.log("JSON dosyası okunuyor...");
                // JSON yükleme fonksiyonunu çağır
                loadJSONProject(fileContent);

            } else if (fileName.endsWith('.vdcl')) {
                // KULLANICIYA UYARI VER
                alert("HATA: .vdcl dosyası sıkıştırılmış bir dosyadır.\n\nLütfen bu dosyayı 7zip veya WinRAR gibi bir programla açıp içindeki .xml dosyasını çıkarın ve o dosyayı 'Aç' butonuyla seçin.");

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