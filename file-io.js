// file-io.js - TAM ÇALIŞAN VERSİYON + SÜRÜKLE-BIRAK
import { state, setState, dom } from './main.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';

export function setupFileIOListeners() {
    dom.bSave.addEventListener('click', saveProject);
    dom.bOpen.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', openProject);
    
    // Sürükle-bırak desteği
    setupDragAndDrop();
}

// Sürükle-bırak desteği
function setupDragAndDrop() {
    const dropZone = document.getElementById('canvas-container') || document.body;
    
    // Dosya sürüklendiğinde
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#f0f8ff';
        dropZone.style.border = '2px dashed #007bff';
    });
    
    // Dosya bırakıldığında
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '';
        dropZone.style.border = '';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleDroppedFile(files[0]);
        }
    });
    
    // Sürükleme bittiğinde
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '';
        dropZone.style.border = '';
    });
}

// Bırakılan dosyayı işle
function handleDroppedFile(file) {
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isJson = fileName.endsWith('.json');
    
    if (!isPdf && !isJson) {
        alert('❌ Lütfen .json veya .pdf uzantılı bir dosya seçin!');
        return;
    }
    
    console.log('📁 Sürükle-bırak ile dosya açılıyor:', file.name);
    openFile(file);
}

// Dosya açma işlemi (hem click hem sürükle-bırak için)
async function openFile(file) {
    try {
        console.clear();
        console.log('📁 Dosya açılıyor:', file.name);
        
        let rawData;
        const fileName = file.name.toLowerCase();
        const isPdf = fileName.endsWith('.pdf');
        const isJson = fileName.endsWith('.json');

        if (isJson) {
            const fileContent = await readFileAsText(file);
            rawData = JSON.parse(fileContent);
            console.log('✅ JSON dosyası okundu');
        } else if (isPdf) {
            console.log('🔍 PDF EKLERİ (attachments) aranıyor...');
            const pdfData = await readFileAsArrayBuffer(file);
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
            
            // PDF'ten ekleri çıkar
            const attachments = await extractAllAttachments(pdf, pdfData);
            
            if (attachments.length > 0) {
                console.log(`✅ ${attachments.length} ek bulundu`);
                
                // Debug: Tüm eklerin içeriğini göster
                console.log('🔍 EKLERİN İÇERİĞİ:');
                attachments.forEach((att, index) => {
                    console.log(`📎 Ek ${index} (${att.filename}):`, 
                        typeof att.content === 'string' ? 
                        att.content.substring(0, 200) + '...' : 
                        'Binary data'
                    );
                });
                
                // Tüm ekleri dene
                for (const attachment of attachments) {
                    console.log(`🔍 Ek kontrol ediliyor: ${attachment.filename}`);
                    
                    try {
                        let content;
                        if (typeof attachment.content === 'string') {
                            content = attachment.content;
                        } else if (attachment.content instanceof Uint8Array) {
                            content = new TextDecoder('utf-8').decode(attachment.content);
                        } else {
                            continue;
                        }
                        
                        // JSON olup olmadığını kontrol et
                        if (content.trim().startsWith('{') && (content.includes('projectData') || content.includes('solidModel'))) {
                            console.log(`✅ JSON bulundu: ${attachment.filename}`);
                            rawData = JSON.parse(content);
                            console.log('🎯 JSON YAPISI:', Object.keys(rawData));
                            
                            // SolidModel kontrolü
                            if (rawData.projectData && rawData.projectData.projectInfo) {
                                console.log('📊 projectInfo:', Object.keys(rawData.projectData.projectInfo));
                            }
                            if (rawData.projectData && rawData.projectData.solidModel) {
                                console.log('✅ solidModel var!');
                            }
                            
                            console.log('✅ JSON parse edildi');
                            break; // Bulduk, döngüden çık
                        }
                    } catch (e) {
                        console.log(`❌ ${attachment.filename} parse edilemedi:`, e.message);
                        continue;
                    }
                }
                
                if (!rawData) {
                    throw new Error('Hiçbir ekte JSON verisi bulunamadı');
                }
            } else {
                throw new Error('PDF içinde hiç ek (attachment) bulunamadı');
            }
        }

        // Veriyi işle
        if (rawData.version && rawData.nodes && rawData.walls) {
            console.log('✅ Yerel format algılandı');
            loadOurFormat(rawData);
        } else {
            console.log('🔧 ZetaCAD formatı dönüştürülüyor...');
            const convertedData = parseZetaCadFormat(rawData);
            if (convertedData) {
                loadConvertedData(convertedData);
            } else {
                // JSON yapısını debug et
                console.log('🔍 RAW DATA YAPISI:', Object.keys(rawData));
                if (rawData.projectData) {
                    console.log('🔍 PROJECT DATA:', Object.keys(rawData.projectData));
                    if (rawData.projectData.projectInfo) {
                        console.log('🔍 PROJECT INFO:', Object.keys(rawData.projectData.projectInfo));
                    }
                }
                throw new Error('Geçersiz dosya formatı - ZetaCAD verisi bulunamadı');
            }
        }

    } catch (error) {
        console.error('💥 HATA:', error);
        alert('❌ Hata: ' + error.message + '\n\nConsole\'u kontrol edin!');
    }
}

// Mevcut openProject fonksiyonunu güncelle
async function openProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    await openFile(file);
    e.target.value = ''; // Input'u temizle
}

// Kalan kodlar aynı kalacak...
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

// Tüm ekleri çıkar
async function extractAllAttachments(pdf, pdfData) {
    const attachments = [];
    
    try {
        // 1. PDF.js 3.x+ getAttachments metodu
        if (pdf.getAttachments) {
            console.log('🔍 PDF.js getAttachments() deneniyor...');
            const attachmentMap = await pdf.getAttachments();
            if (attachmentMap) {
                for (const [filename, attachment] of Object.entries(attachmentMap)) {
                    const content = await getAttachmentContent(attachment);
                    attachments.push({
                        filename: filename,
                        content: content,
                        source: 'getAttachments'
                    });
                }
            }
        }
        
        // 2. PDF.js 2.x annotations
        if (attachments.length === 0) {
            console.log('🔍 Annotations aranıyor...');
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const annotations = await page.getAnnotations();
                
                for (const annotation of annotations) {
                    if (annotation.file) {
                        const content = await getAttachmentContent(annotation.file);
                        attachments.push({
                            filename: annotation.file.filename,
                            content: content,
                            source: 'annotations'
                        });
                    }
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Ek çıkarma hatası:', error);
    }
    
    return attachments;
}

// Attachment içeriğini al
async function getAttachmentContent(attachment) {
    try {
        if (attachment.content) {
            if (typeof attachment.content === 'string') {
                return attachment.content;
            } else if (attachment.content instanceof Uint8Array) {
                return new TextDecoder('utf-8').decode(attachment.content);
            } else if (attachment.content instanceof ArrayBuffer) {
                return new TextDecoder('utf-8').decode(new Uint8Array(attachment.content));
            }
        }
        
        // Eğer content yoksa, diğer alanlara bak
        if (attachment.data) {
            return new TextDecoder('utf-8').decode(attachment.data);
        }
    } catch (error) {
        console.log('❌ Attachment içerik okuma hatası:', error);
    }
    
    return '';
}

function parseZetaCadFormat(rawData) {
    console.log('🔍 ZetaCAD formatı analiz ediliyor...');
    console.log('📊 RAW DATA KEYS:', Object.keys(rawData));
    
    let solidModel;
    
    // Format 1: projectData > projectInfo > solidModel
    if (rawData.projectData && rawData.projectData.projectInfo && rawData.projectData.projectInfo.solidModel) {
        console.log('✅ projectData > projectInfo > solidModel bulundu');
        solidModel = rawData.projectData.projectInfo.solidModel;
    } 
    // Format 2: Doğrudan solidModel
    else if (rawData.solidModel) {
        console.log('✅ solidModel bulundu');
        solidModel = rawData.solidModel;
    }
    // Format 3: projectData içinde solidModel
    else if (rawData.projectData && rawData.projectData.solidModel) {
        console.log('✅ projectData > solidModel bulundu');
        solidModel = rawData.projectData.solidModel;
    }
    // Format 4: Doğrudan floors
    else if (rawData.floors) {
        console.log('✅ floors bulundu');
        return convertZetaCadToOurFormat(rawData.floors[0]);
    }
    // Format 5: Doğrudan points ve walls
    else if (rawData.points && rawData.walls) {
        console.log('✅ doğrudan points/walls bulundu');
        return convertZetaCadToOurFormat(rawData);
    }
    // Format 6: zcjson
    else if (rawData.zcjson) {
        console.log('✅ zcjson bulundu');
        return convertZetaCadToOurFormat(rawData.zcjson);
    } else {
        console.log('❌ ZetaCAD verisi bulunamadı');
        console.log('🔍 Detaylı analiz:');
        if (rawData.projectData) {
            console.log('   projectData keys:', Object.keys(rawData.projectData));
            if (rawData.projectData.projectInfo) {
                console.log('   projectInfo keys:', Object.keys(rawData.projectData.projectInfo));
            }
        }
        return null;
    }

    // solidModel string ise parse et
    if (typeof solidModel === 'string') {
        try {
            console.log('🔧 solidModel string parse ediliyor...');
            solidModel = JSON.parse(solidModel);
        } catch (e) {
            console.error('❌ solidModel parse hatası:', e);
            return null;
        }
    }

    if (solidModel && solidModel.floors && solidModel.floors.length > 0) {
        console.log('✅ Kat verisi bulundu');
        return convertZetaCadToOurFormat(solidModel.floors[0]);
    }

    console.log('❌ solidModel içinde floors bulunamadı');
    if (solidModel) {
        console.log('🔍 solidModel keys:', Object.keys(solidModel));
    }
    
    return null;
}

function convertZetaCadToOurFormat(floorData) {
    console.log('═══════════════════════════════════════════');
    console.log('🏗️  ZETA-CAD → BİZİM FORMAT DÖNÜŞÜMÜ');
    console.log('═══════════════════════════════════════════');
    
    console.log('📊 FLOOR DATA:', floorData);
    console.log('📊 FLOOR DATA KEYS:', Object.keys(floorData));
    
    const SCALE_FACTOR = 4.8;
    console.log(`📏 Ölçek faktörü: ${SCALE_FACTOR}`);

    // Noktaları oluştur
    const nodes = floorData.points ? floorData.points.map((p, i) => ({
        x: (p.x || 0) * SCALE_FACTOR,
        y: (p.y || 0) * SCALE_FACTOR,
        isColumn: false,
        columnSize: 30,
        originalIndex: i
    })) : [];

    console.log(`📍 ${nodes.length} nokta oluşturuldu`);

    // Duvarları oluştur
    const walls = [];
    const doors = [];
    let windowCount = 0;
    let ventCount = 0;

    if (floorData.walls) {
        console.log('\n🧱 DUVARLAR İŞLENİYOR:');
        
        floorData.walls.forEach((wall, wallIdx) => {
            const p1 = nodes[wall.startIndex];
            const p2 = nodes[wall.endIndex];
            
            if (!p1 || !p2) {
                console.warn(`⚠️ Duvar ${wallIdx}: Geçersiz nokta indeksi`);
                return;
            }

            const newWall = {
                type: 'wall',
                p1: p1,
                p2: p2,
                thickness: (wall.thickness || 20) * SCALE_FACTOR,
                wallType: wall.type === 2 ? 'exterior' : 'normal',
                windows: [],
                vents: [],
                originalData: wall
            };

            // Kapı ve pencereleri işle
            if (wall.doors && wall.doors.length > 0) {
                console.log(`🚪 Duvar ${wallIdx} kapıları:`, wall.doors.length);
                
                wall.doors.forEach((door, doorIdx) => {
                    const scaledPos = (door.start || 0) * SCALE_FACTOR;
                    const scaledLength = (door.length || 80) * SCALE_FACTOR;
                    
                    const wallVector = { x: p2.x - p1.x, y: p2.y - p1.y };
                    const wallAngle = Math.atan2(wallVector.y, wallVector.x);
                    
                    if (door.isWindow) {
                        // PENCERE
                        const window = {
                            start: scaledPos,
                            length: scaledLength,
                            height: (door.height || 120) * SCALE_FACTOR,
                            offset: (door.offset || 80) * SCALE_FACTOR,
                            angle: wallAngle
                        };
                        newWall.windows.push(window);
                        windowCount++;
                        console.log(`   🪟 Pencere ${doorIdx}: ${scaledPos.toFixed(1)}px, ${scaledLength.toFixed(1)}px`);
                    } else if (door.isVent) {
                        // MENFEZ
                        const vent = {
                            start: scaledPos,
                            length: scaledLength,
                            height: (door.height || 40) * SCALE_FACTOR,
                            offset: (door.offset || 20) * SCALE_FACTOR,
                            angle: wallAngle
                        };
                        newWall.vents.push(vent);
                        ventCount++;
                        console.log(`   💨 Menfez ${doorIdx}: ${scaledPos.toFixed(1)}px, ${scaledLength.toFixed(1)}px`);
                    } else {
                        // KAPI
                        const doorObj = {
                            wall: newWall,
                            pos: scaledPos,
                            width: scaledLength,
                            type: 'door',
                            angle: wallAngle
                        };
                        doors.push(doorObj);
                        console.log(`   🚪 Kapı ${doorIdx}: ${scaledPos.toFixed(1)}px, ${scaledLength.toFixed(1)}px`);
                    }
                });
            }
            
            walls.push(newWall);
        });
    }

    console.log(`📊 DUVAR ÖZET: ${walls.length} duvar, ${doors.length} kapı, ${windowCount} pencere, ${ventCount} menfez`);

    // ODALAR - GELİŞMİŞ VERSİYON
    const rooms = [];
    console.log('\n🏠 ODALAR İŞLENİYOR:');
    
    if (floorData.units) {
        floorData.units.forEach((unit, unitIdx) => {
            if (unit.regions) {
                unit.regions.forEach((region, regionIdx) => {
                    if (region.points && region.points.length >= 3) {
                        const polygon = region.points
                            .map(idx => nodes[idx])
                            .filter(n => n !== undefined);
                        
                        if (polygon.length >= 3) {
                            const center = {
                                x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
                                y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
                            };
                            
                            // Oda ismini daha iyi bul
                            let roomName = region.name;
                            
                            // Eğer isim yoksa, unit'ten veya diğer alanlardan al
                            if (!roomName && unit.name) {
                                roomName = unit.name;
                            }
                            
                            // Hala yoksa generic isim ver
                            if (!roomName) {
                                roomName = `Oda_${unitIdx}_${regionIdx}`;
                            }
                            
                            // Oda tipini belirle (mutfak, banyo, salon vb.)
                            const roomType = determineRoomType(roomName);
                            
                            const room = {
                                polygon: polygon,
                                area: (region.area || 0) * SCALE_FACTOR * SCALE_FACTOR,
                                center: center,
                                name: roomName,
                                type: roomType,
                                originalName: region.name
                            };
                            
                            rooms.push(room);
                            console.log(`   ✅ "${roomName}" (${roomType}) - ${polygon.length} kenar, ${room.area.toFixed(1)}px²`);
                        }
                    }
                });
            }
        });
    }

    // KOLONLAR - GELİŞMİŞ VERSİYON
    const columns = [];
    console.log('\n🏛️  KOLONLAR İŞLENİYOR:');
    
    if (floorData.columns) {
        floorData.columns.forEach((col, colIdx) => {
            const column = {
                x: (col.x || 0) * SCALE_FACTOR,
                y: (col.y || 0) * SCALE_FACTOR,
                width: (col.width || 30) * SCALE_FACTOR,
                height: (col.height || 30) * SCALE_FACTOR,
                type: 'column',
                name: col.name || `Kolon_${colIdx}`,
                originalData: col
            };
            columns.push(column);
            console.log(`   ✅ ${column.name}: (${column.x.toFixed(1)}, ${column.y.toFixed(1)}) ${column.width}x${column.height}`);
        });
    } else {
        // Kolon verisi yoksa, duvar kesişimlerinden kolon oluştur
        console.log('🔍 Duvarlardan kolonlar türetiliyor...');
        const derivedColumns = deriveColumnsFromWalls(nodes, walls);
        columns.push(...derivedColumns);
        console.log(`   ✅ ${derivedColumns.length} kolon türetildi`);
    }

    // KİRİŞLER - GELİŞMİŞ VERSİYON
    const beams = [];
    console.log('\n📏 KİRİŞLER İŞLENİYOR:');
    
    if (floorData.beams) {
        floorData.beams.forEach((beam, beamIdx) => {
            const beamObj = {
                start: { 
                    x: (beam.startX || beam.start?.x || 0) * SCALE_FACTOR, 
                    y: (beam.startY || beam.start?.y || 0) * SCALE_FACTOR 
                },
                end: { 
                    x: (beam.endX || beam.end?.x || 0) * SCALE_FACTOR, 
                    y: (beam.endY || beam.end?.y || 0) * SCALE_FACTOR 
                },
                thickness: (beam.thickness || 20) * SCALE_FACTOR,
                height: (beam.height || 30) * SCALE_FACTOR,
                type: 'beam',
                name: beam.name || `Kiriş_${beamIdx}`,
                originalData: beam
            };
            beams.push(beamObj);
            console.log(`   ✅ ${beamObj.name}: ${beamObj.start.x.toFixed(1)}→${beamObj.end.x.toFixed(1)}`);
        });
    }

    // PENCERELER - BAĞIMSIZ OLANLARI BUL
    console.log('\n🪟 BAĞIMSIZ PENCERELER İŞLENİYOR:');
    if (floorData.windows) {
        floorData.windows.forEach((window, windowIdx) => {
            console.log(`   ✅ Bağımsız pencere ${windowIdx}:`, window);
            // Bağımsız pencere işleme kodu buraya
        });
    }

    // MENFEZLER - BAĞIMSIZ OLANLARI BUL
    console.log('\n💨 BAĞIMSIZ MENFEZLER İŞLENİYOR:');
    if (floorData.vents) {
        floorData.vents.forEach((vent, ventIdx) => {
            console.log(`   ✅ Bağımsız menfez ${ventIdx}:`, vent);
            // Bağımsız menfez işleme kodu buraya
        });
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('🎉 DÖNÜŞÜM TAMAMLANDI!');
    console.log(`📍 ${nodes.length} nokta`);
    console.log(`🧱 ${walls.length} duvar`);
    console.log(`🚪 ${doors.length} kapı`);
    console.log(`🪟 ${windowCount} pencere (duvarlarda)`);
    console.log(`💨 ${ventCount} menfez (duvarlarda)`);
    console.log(`🏠 ${rooms.length} oda`);
    console.log(`🏛️  ${columns.length} kolon`);
    console.log(`📏 ${beams.length} kiriş`);
    console.log('═══════════════════════════════════════════\n');

    return {
        nodes: nodes,
        walls: walls,
        doors: doors,
        rooms: rooms,
        columns: columns,
        beams: beams,
        stairs: []
    };
}

// Oda tipini belirleme fonksiyonu
function determineRoomType(roomName) {
    if (!roomName) return 'other';
    
    const name = roomName.toLowerCase();
    
    if (name.includes('mutfak') || name.includes('kitchen')) return 'kitchen';
    if (name.includes('banyo') || name.includes('wc') || name.includes('tuvalet') || name.includes('bath')) return 'bathroom';
    if (name.includes('yatak') || name.includes('bedroom')) return 'bedroom';
    if (name.includes('salon') || name.includes('living')) return 'living';
    if (name.includes('hol') || name.includes('koridor') || name.includes('hall')) return 'hall';
    if (name.includes('balkon') || name.includes('balcony')) return 'balcony';
    if (name.includes('giyinme') || name.includes('dressing')) return 'dressing';
    if (name.includes('çocuk') || name.includes('child')) return 'children';
    if (name.includes('çalışma') || name.includes('study')) return 'study';
    if (name.includes('misafir') || name.includes('guest')) return 'guest';
    
    return 'other';
}

// Duvarlardan kolon türetme
function deriveColumnsFromWalls(nodes, walls) {
    const columns = [];
    const intersectionPoints = new Set();
    
    // Duvar kesişim noktalarını bul
    walls.forEach((wall1, i) => {
        walls.forEach((wall2, j) => {
            if (i >= j) return; // Aynı çifti tekrar işleme
            
            const intersection = findIntersection(wall1, wall2);
            if (intersection) {
                const key = `${intersection.x.toFixed(2)},${intersection.y.toFixed(2)}`;
                intersectionPoints.add(key);
            }
        });
    });
    
    // Kesişim noktalarından kolon oluştur
    intersectionPoints.forEach(pointStr => {
        const [x, y] = pointStr.split(',').map(Number);
        columns.push({
            x: x,
            y: y,
            width: 30,
            height: 30,
            type: 'column',
            name: `Kolon_${columns.length}`,
            derived: true
        });
    });
    
    return columns;
}

// İki doğrunun kesişim noktasını bul
function findIntersection(wall1, wall2) {
    const x1 = wall1.p1.x, y1 = wall1.p1.y;
    const x2 = wall1.p2.x, y2 = wall1.p2.y;
    const x3 = wall2.p1.x, y3 = wall2.p1.y;
    const x4 = wall2.p2.x, y4 = wall2.p2.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.001) return null; // Paralel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }
    
    return null;
}

function loadOurFormat(projectData) {
    console.log('📦 Yerel format yükleniyor...');
    
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
    console.log('✅ Yerel format yüklendi!');
}

function loadConvertedData(convertedData) {
    console.log('📦 Dönüştürülmüş veri yükleniyor...');
    
    setState({
        nodes: convertedData.nodes,
        walls: convertedData.walls,
        doors: convertedData.doors,
        rooms: convertedData.rooms,
        columns: convertedData.columns,
        beams: convertedData.beams,
        stairs: convertedData.stairs,
        selectedObject: null,
        selectedGroup: [],
        startPoint: null
    });

    processWalls();
    setTimeout(() => processWalls(), 100);
    
    saveState();

    console.log('🎉 PROJE YÜKLENDİ!');
    
    alert(`✅ Proje Başarıyla Yüklendi!\n\n` +
          `🧱 ${convertedData.walls.length} duvar\n` +
          `🚪 ${convertedData.doors.length} kapı\n` +
          `🪟 ${convertedData.walls.reduce((sum, w) => sum + (w.windows?.length || 0), 0)} pencere\n` +
          `🏠 ${convertedData.rooms.length} oda\n` +
          `📏 Ölçek: 4.8x`);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}