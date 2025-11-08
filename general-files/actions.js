// ahmedakbayir/ngcad/ngcad-1fde862049234ed29ab17f348568a2e3a4540854/actions.js
// GÜNCELLENMİŞ: Bu dosya artık sadece bir "hit testing" yönlendiricisi
// ve birkaç genel yardımcı fonksiyon içeriyor.

import { state } from './main.js';
import { getColumnAtPoint } from '../architectural-objects/columns.js';
import { getBeamAtPoint } from '../architectural-objects/beams.js'; 
import { getStairAtPoint } from '../architectural-objects/stairs.js'; 
import { getDoorAtPoint } from '../architectural-objects/door-handler.js';
import { getGuideAtPoint } from '../architectural-objects/guide-handler.js'; 
import { getWindowAtPoint } from '../architectural-objects/window-handler.js';
import { distToSegmentSquared } from '../draw/geometry.js';
import { getCameraViewInfo } from '../scene3d/scene3d-camera.js'; 
import { getWallAtPoint } from '../wall/wall-handler.js';

/**
 * Verilen noktadaki (pos) en üstteki nesneyi bulur.
 * @param {object} pos - Dünya koordinatları {x, y}
 * @returns {object | null} - Bulunan nesne (seçim için) veya null
 */
export function getObjectAtPoint(pos) {
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;

    // DEBUG: Log floor filtering info
    if (currentFloorId) {
        console.log('🔍 getObjectAtPoint - Current Floor:', currentFloorId);
        console.log('📊 Total walls:', state.walls?.length, 'Filtered walls:', (state.walls || []).filter(w => w.floorId === currentFloorId).length);
        const wallsWithoutFloor = (state.walls || []).filter(w => !w.floorId);
        if (wallsWithoutFloor.length > 0) {
            console.warn('⚠️ Found', wallsWithoutFloor.length, 'walls WITHOUT floorId!', wallsWithoutFloor);
        }
    }

    // Sadece aktif kata ait elemanları filtrele
    const walls = (state.walls || []).filter(w => !currentFloorId || w.floorId === currentFloorId);
    const doors = (state.doors || []).filter(d => !currentFloorId || d.floorId === currentFloorId);
    const rooms = (state.rooms || []).filter(r => !currentFloorId || r.floorId === currentFloorId);

    const tolerance = 8 / zoom;

    // 0. KAMERA KONTROLLERİ (En yüksek öncelik - FPS modunda)
    const cameraInfo = getCameraViewInfo();
    if (cameraInfo && cameraInfo.isFPS) {
        const camX = cameraInfo.position.x;
        const camZ = cameraInfo.position.z;
        const yaw = cameraInfo.yaw;

        // Kamera parametreleri (draw2d.js ile aynı değerler)
        const eyeRadius = 30;
        const viewLineLength = 80;

        // Bakış yönü
        const dirX = Math.sin(yaw);
        const dirZ = Math.cos(yaw);

        // Yön handle'ı (bakış yönü ucundaki nokta)
        const dirHandleX = camX + dirX * viewLineLength;
        const dirHandleZ = camZ + dirZ * viewLineLength;
        const distToDirection = Math.hypot(pos.x - dirHandleX, pos.y - dirHandleZ);

        if (distToDirection < tolerance * 2) {
            return { type: "camera", handle: "direction", object: cameraInfo };
        }

        // Pozisyon handle'ı (göz merkezi)
        const distToCamera = Math.hypot(pos.x - camX, pos.y - camZ);
        if (distToCamera < eyeRadius) {
            return { type: "camera", handle: "position", object: cameraInfo };
        }
    }

    // 1. Handle Kontrolleri (Öncelikli)
    // 1.0 Arc Duvar Kontrol Noktaları (En yüksek öncelik)
    for (const wall of [...walls].reverse()) {
        if (wall.isArc && wall.arcControl1 && wall.arcControl2) {
            const d1 = Math.hypot(pos.x - wall.arcControl1.x, pos.y - wall.arcControl1.y);
            const d2 = Math.hypot(pos.x - wall.arcControl2.x, pos.y - wall.arcControl2.y);
            if (d1 < tolerance) {
                return { type: "arcControl", object: wall, handle: "control1" };
            }
            if (d2 < tolerance) {
                return { type: "arcControl", object: wall, handle: "control2" };
            }
        }
    }

    // 1.1 Kolon Handle
    const columnHandleHit = getColumnAtPoint(pos);
    if (columnHandleHit && columnHandleHit.handle !== 'body') return columnHandleHit;

    // 1.2 Kiriş Handle
    const beamHandleHit = getBeamAtPoint(pos);
    if (beamHandleHit && beamHandleHit.handle !== 'body') return beamHandleHit;

    // 1.3 Merdiven Handle - SADECE BİR KEZ ÇAĞIR
    const stairHit = getStairAtPoint(pos); // ← BURADA ÇAĞIR
    if (stairHit && stairHit.handle !== 'body') return stairHit; // ← Handle ise döndür

    // 1.4 Duvar Ucu (Node)
    const wallNodeHit = getWallAtPoint(pos, tolerance);
    if (wallNodeHit && wallNodeHit.handle !== 'body') return wallNodeHit;
    
    // 2.0 REHBER ÇİZGİLERİ (Handle'lardan sonra, gövdelerden önce)
    const guideHit = getGuideAtPoint(pos, tolerance); 
    if (guideHit) return guideHit; 


    // 2. Gövde Kontrolleri (Handle'lardan sonra)
    // 2.1 Kapı
    const doorHit = getDoorAtPoint(pos, tolerance);
    if (doorHit) return doorHit;

    // 2.2 Pencere
    const windowHit = getWindowAtPoint(pos, tolerance);
    if (windowHit) return windowHit;

    // 2.3 Menfez
    for (const wall of [...walls].reverse()) {
        if (!wall.vents || wall.vents.length === 0 || !wall.p1 || !wall.p2) continue;
        for (const vent of wall.vents) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            const wallPx = wall.thickness || state.wallThickness;
            const dx_p = pos.x - ventCenterX;
            const dy_p = pos.y - ventCenterY;
            const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
            const distParallel = Math.abs(dx_p * dx + dy_p * dy);

            // Toleransı biraz küçülttük menfez için
            if (distPerpendicular < wallPx / 2 + tolerance / 2 && distParallel < vent.width / 2 + tolerance / 2) {
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }

    // 2.4 Merdiven Gövdesi - ZATEn YUKARIDA ÇAĞRILDI, stairHit'i kontrol et
    if (stairHit && stairHit.handle === 'body') return stairHit; // ← Body ise döndür

    // 2.5 Kiriş Gövdesi
    if (beamHandleHit && beamHandleHit.handle === 'body') return beamHandleHit;

    // 2.6 Kolon Gövdesi
    if (columnHandleHit && columnHandleHit.handle === 'body') return columnHandleHit;

    // 2.7 Mahal İsmi/Alanı
    // Mahal alanı kontrolünden ÖNCE çalışmalı ki isim/alan daha öncelikli olsun
    for (const room of [...rooms].reverse()) {
        // Mahal merkezinin geçerli olup olmadığını kontrol et
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2 || typeof room.center[0] !== 'number' || typeof room.center[1] !== 'number') continue;
        // Pos koordinatlarının geçerli olup olmadığını kontrol et
        if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || !isFinite(pos.x) || !isFinite(pos.y)) continue; // Pozisyon geçersizse bu odayı atla

        const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
        
        // DEĞİŞTİ: 40 -> (40 / 3)
        const nameTolerance = 25 / zoom; // Mahal adı yakalama toleransı
        
        if (distToCenter < nameTolerance) {
             // Mahal adı/alanına tıklandıysa bunu döndür
             return { type: 'roomName', object: room }; // 'roomArea' yerine 'roomName' döndürelim, ikisi de aynı şekilde ele alınabilir
        }
    }


    // 2.8 Duvar Gövdesi
    // Mahal adı kontrolünden SONRA çalışmalı
    if (wallNodeHit && wallNodeHit.handle === 'body') return wallNodeHit;


    // 2.9 Mahal Alanı (İsim/Alan hariç)
    for (const room of [...rooms].reverse()) {
        // Poligonun ve koordinatlarının geçerli olup olmadığını kontrol et
        if (!room.polygon?.geometry?.coordinates || !Array.isArray(room.polygon.geometry.coordinates[0]) || room.polygon.geometry.coordinates[0].length < 3) {
            // console.warn("getObjectAtPoint: Invalid room polygon skipped:", room); // Opsiyonel: Hata ayıklama için
            continue; // Geçersiz poligonu atla
        }
        // pos koordinatlarının geçerli (sayı) olup olmadığını kontrol et
        if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || !isFinite(pos.x) || !isFinite(pos.y)) {
             console.error("getObjectAtPoint: Invalid mouse position received:", pos); // Hata ayıklama
             continue; // Geçersiz pozisyonu atla (aslında yukarıda yapıldı ama tekrar kontrol edelim)
        }
        // Mahal merkezi koordinatlarının geçerli olup olmadığını kontrol et (isim/alan kontrolü için)
        const hasValidCenter = room.center && Array.isArray(room.center) && room.center.length >= 2 && typeof room.center[0] === 'number' && typeof room.center[1] === 'number';


        try {
            const point = turf.point([pos.x, pos.y]);
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                 // Poligonun içindeyiz. Şimdi isim/alan üzerinde olup olmadığımızı kontrol edelim.
                 let isOverName = false;
                 if (hasValidCenter) {
                    const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
                    
                    // DEĞİŞTİ: 40 -> (40 / 3)
                    const nameTolerance = (75 / 3) / zoom; // Mahal adı yakalama toleransı
                    
                    if (distToCenter < nameTolerance) {
                        isOverName = true; // Evet, isim/alan üzerindeyiz
                    }
                 }
                 // Eğer isim/alan üzerinde DEĞİLSEK, o zaman oda alanıdır.
                 if (!isOverName) {
                    return { type: 'room', object: room };
                 }
                 // İsim/alan üzerindeysek, bu döngüyü atlayıp bir sonraki odaya geç (çünkü isim/alan daha önce handle edildi)
            }
        } catch (e) {
            // Turf fonksiyonlarında hala bir hata olursa logla ve devam et
            console.error("Error in turf.booleanPointInPolygon:", e, "Position:", pos, "Polygon structure (simplified):", room.polygon?.geometry?.type);
            continue; // Hata durumunda bu odayı atla
        }
    }


    return null; // Hiçbir şey bulunamadı
}

/**
 * Bir duvarın sahip olabileceği minimum uzunluğu hesaplar.
 * (Diğer modüller buna ihtiyaç duyduğu için şimdilik burada kalabilir)
 * @param {object} wall - Duvar nesnesi
 * @returns {number} - Minimum uzunluk (cm)
 */
export function getMinWallLength(wall) {
    if (!wall || !wall.p1 || !wall.p2) return 10; // Geçersiz duvar için varsayılan min
    const wallThickness = wall.thickness || state.wallThickness;
    const UM = (wallThickness / 2) + 5; // Uç marjı
    const MIN_ITEM_WIDTH = 20; // Yerleştirilebilecek en küçük eleman genişliği
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk
    const minLengthFromMargins = 2 * UM; // Sadece marjlar için gereken min uzunluk

    let requiredByItems = 0;
    const items = [
        ...(state.doors.filter(d => d.wall === wall)),
        ...(wall.windows || []),
        ...(wall.vents || [])
    ];
    if (items.length > 0) {
        // Öğeleri pozisyonlarına göre sırala
        items.sort((a,b)=> a.pos - b.pos);
        // İlk öğenin başlangıcı ile duvar başlangıcı arasındaki boşluk
        const spaceBeforeFirst = items[0].pos - items[0].width / 2;
        // Son öğenin bitişi ile duvar bitişi arasındaki boşluk
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        // Duvar uzunluğu sıfırsa veya çok küçükse devam etme
        if (wallLen < 0.1) return Math.max(10, minLengthFromMargins);

        const spaceAfterLast = wallLen - (items[items.length - 1].pos + items[items.length - 1].width / 2);

        // Öğelerin kapladığı toplam genişlik (boşluklar hariç)
        const totalItemWidth = items.reduce((sum, item) => sum + item.width, 0);

        // Daha doğru hesaplama: İlk öğenin başlangıcı ile son öğenin bitişi arasındaki mesafe + 2 * marj
        requiredByItems = (items[items.length - 1].pos + items[items.length - 1].width / 2) - (items[0].pos - items[0].width / 2) + 2 * UM;

        // Eğer tek eleman varsa, onun genişliği + 2 * marj
        if(items.length === 1){
            requiredByItems = items[0].width + 2 * UM;
        }

    }

    // Gerekli minimum uzunluk, sadece marjlar için gerekenden veya öğelerle birlikte gerekenden büyük olanıdır.
    // Ayrıca en az 10 gibi mutlak bir minimum da olabilir.
    return Math.max(10, minLengthFromMargins, requiredByItems);
}