// stairs.js
// Son Güncelleme: Normal merdivenler için varsayılan yüksekliği WALL_HEIGHT / 2 olarak ayarlama.

import { state, setState, WALL_HEIGHT } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { update3DScene } from './scene3d.js';
import { currentModifierKeys } from './input.js';
// recalculateStepCount ve updateConnectedStairElevations bu dosyada tanımlı

// Sıradaki merdiven ismini verir
function getNextStairLetter() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let highestCharIndex = -1;
    (state.stairs || []).forEach(s => {
        if (s.name && s.name.length === 1 && letters.includes(s.name)) {
            highestCharIndex = Math.max(highestCharIndex, letters.indexOf(s.name));
        }
    });
    if (highestCharIndex < letters.length - 1) {
        return letters[highestCharIndex + 1];
    } else {
        // Eğer Z harfi kullanılmışsa, Merdiven X şeklinde devam et
        let nextNum = highestCharIndex + 2; // Z'den sonraki sayı (27)
        while ((state.stairs || []).some(s => s.name === `Merdiven ${nextNum}`)) {
            nextNum++; // Kullanılmayan bir numara bulana kadar artır
        }
        return `Merdiven ${nextNum}`;
    }
}

/**
 * Bir merdivenin kotları değiştiğinde ONA BAĞLANAN (altındaki) merdivenlerin kotlarını günceller.
 * @param {string} changedStairId - Kotları değişen merdivenin ID'si
 * @param {Set<string>} visited - Döngüleri önlemek için ziyaret edilen ID'ler kümesi
 */
export function updateConnectedStairElevations(changedStairId, visited = new Set()) {
    if (visited.has(changedStairId)) {
        return; // Sonsuz döngüleri önle
    }
    visited.add(changedStairId);

    const stairMap = new Map((state.stairs || []).map(s => [s.id, s]));
    const changedStair = stairMap.get(changedStairId);

    if (!changedStair) {
        console.error("updateConnectedStairElevations: Değişen merdiven bulunamadı:", changedStairId);
        return;
    }

    const stairsBelow = (state.stairs || []).filter(s => s.connectedStairId === changedStairId);
    stairsBelow.forEach(stairBelow => {
        // Alttaki merdivenin ALT kotu, değişen (üstteki) merdivenin ÜST kotuna eşitlenmeli.
        if (stairBelow.bottomElevation !== changedStair.topElevation) {
            console.log(`Alttaki güncelleniyor (${stairBelow.id}): altKot ${stairBelow.bottomElevation} -> ${changedStair.topElevation}`);
            stairBelow.bottomElevation = changedStair.topElevation;

            // Alttaki merdivenin üst kotunu da güncelle
            if (stairBelow.isLanding) {
                // Sahanlığın üst kotu, bağlandığı merdivenin üst kotu olmalıydı ZATEN.
                // Eğer sahanlık, değişen merdivene bağlıysa, üst kotu değişmez. Alt kotu değişir.
                // Üst kotu tekrar hesaplamak yerine, alt kota göre ayarlarız.
                const LANDING_THICKNESS = 10;
                stairBelow.topElevation = stairBelow.bottomElevation + LANDING_THICKNESS; // Alt kot + kalınlık
            } else {
                // Normal merdivenin üst kotu sabit kalır, sadece alt kot değişir.
                // Yükseklik değiştiği için basamak sayısı yeniden hesaplanır.
                const newRise = stairBelow.topElevation - stairBelow.bottomElevation;
                if (newRise <= 0) {
                    console.warn(`Merdiven ${stairBelow.id} yüksekliği <= 0 oldu.`);
                    // İsteğe bağlı: Üst kotu da minimum yüksekliği sağlayacak şekilde ayarla
                    stairBelow.topElevation = stairBelow.bottomElevation + 10; // Min 10cm yükseklik
                }
                recalculateStepCount(stairBelow); // Basamakları yeni yükseklik/uzunluk oranına göre yeniden hesapla
            }
            // Değişikliği aşağı doğru yay
            updateConnectedStairElevations(stairBelow.id, visited);
        }
    });
}


// Merdiven nesnesi oluşturur - GÜNCELLENDİ (Normal merdiven yüksekliği WALL_HEIGHT / 2)
export function createStairs(centerX, centerY, width, height, rotation, isLanding = false) {
    const nextName = getNextStairLetter();
    const LANDING_THICKNESS = 10; // Sahanlık kalınlığı

    let defaultBottomElevation = 0;
    let defaultTopElevation; // = WALL_HEIGHT; // Varsayılanı kaldır, aşağıda hesaplanacak
    let connectedStairId = null;
    let connectedStairTopElevation = null; // Bağlı merdivenin üst kotunu saklamak için

    // Önceki merdiveni bul (varsa)
    if (state.stairs && state.stairs.length > 0) {
        const lastStairWithId = [...state.stairs].reverse().find(s => s.id);
        if (lastStairWithId) {
            connectedStairId = lastStairWithId.id;
            connectedStairTopElevation = lastStairWithId.topElevation || 0; // Bağlı merdivenin üst kotunu al
        }
    }

    // Kotları hesapla
    if (connectedStairId !== null) { // Bağlı bir merdiven varsa
        defaultBottomElevation = connectedStairTopElevation; // Alt kot = Bağlı merdivenin üst kotu
        if (isLanding) {
            // Sahanlık: Üst kot = Bağlı merdivenin üst kotu, Alt kot = Üst kot - kalınlık
            defaultTopElevation = connectedStairTopElevation;
            defaultBottomElevation = defaultTopElevation - LANDING_THICKNESS;
        } else {
            // --- YENİ KURAL ---
            // Normal merdiven: Üst kot = Alt kot + KAT YÜKSEKLİĞİ / 2
            defaultTopElevation = defaultBottomElevation + WALL_HEIGHT / 2;
            // --- YENİ KURAL SONU ---
        }
    } else {
        // İlk merdiven ise (bağlantı yok)
        defaultBottomElevation = 0; // Yerden başla
        if (isLanding) {
            // İlk eleman sahanlıksa, üst kotu kalınlık kadar yukarıda
            defaultTopElevation = LANDING_THICKNESS;
        } else {
            // --- YENİ KURAL ---
            // İlk eleman normal merdivense, yarım kat çıksın
            defaultTopElevation = WALL_HEIGHT / 2;
            // --- YENİ KURAL SONU ---
        }
    }

    // Yeni merdiven nesnesini oluştur
    const newStair = {
        type: 'stairs',
        id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: nextName,
        center: { x: centerX, y: centerY },
        width: width,   // Merdiven uzunluğu (X ekseni)
        height: height,  // Merdiven eni (Y ekseni -> 3D'de Z)
        rotation: rotation,
        stepCount: 1, // recalculate ile hesaplanacak
        bottomElevation: defaultBottomElevation, // Hesaplanan alt kot
        topElevation: defaultTopElevation,     // Hesaplanan üst kot
        connectedStairId: connectedStairId,    // Bağlantı ID'si
        isLanding: isLanding, // Parametreden gelen değeri ata
        showRailing: true // Varsayılan korkuluk açık
    };

    // Basamak sayısını hesapla (sahanlık değilse veya kotlar farklıysa)
    // Sahanlıklar için de stepCount=1 olmalı
    if (isLanding) {
        newStair.stepCount = 1;
    } else {
        recalculateStepCount(newStair); // Normal merdiven için hesapla
    }

    return newStair;
}


// Merdivenin uzunluğuna göre basamak sayısını hesaplar (sahanlık durumunu dikkate alır)
export function recalculateStepCount(stair) {
    if (stair.isLanding) {
        stair.stepCount = 1; // Sahanlıkta her zaman 1 basamak (görsel olarak)
        return;
    }
    const totalRun = stair.width; // Merdiven uzunluğu
    const minStepRun = 25; // Minimum basamak derinliği
    const maxStepRun = 30; // Maksimum basamak derinliği

    // Geçersiz uzunluk veya yükseklik durumunda 1 basamak ata
    const totalRise = stair.topElevation - stair.bottomElevation;
    // DİKKAT: Yükseklik sıfır veya negatif olabilir (örn. aşağı inen merdiven), bu yüzden sadece uzunluğu kontrol et
    if (!totalRun || totalRun <= 0) {
        stair.stepCount = 1;
        return;
    }
    // Eğer yükseklik çok küçükse (örn. < 1cm), yine 1 basamak yap
    if (Math.abs(totalRise) < 1) {
         stair.stepCount = 1;
         return;
    }

    // İdeal basamak derinliğine göre basamak sayısını tahmin et
    const idealStepRun = (minStepRun + maxStepRun) / 2;
    // Basamak sayısı = Toplam Uzunluk / İdeal Derinlik
    let idealStepCount = totalRun / idealStepRun;

    // Tam sayıya yuvarla (en az 1)
    let calculatedStepCount = Math.max(1, Math.round(idealStepCount));

    // Hesaplanan basamak derinliğini kontrol et
    let currentStepRun = totalRun / calculatedStepCount;

    // Eğer min/max sınırları dışındaysa, sınır değerlerine göre yeniden hesapla
    // 0.5 cm tolerans ekleyerek gereksiz düzeltmeleri önle
    if (currentStepRun < minStepRun - 0.5 && calculatedStepCount > 1) {
        // Çok darsa (min'den küçükse), basamak sayısını azalt (derinliği artır)
        // En az minStepRun derinliği sağlayacak max basamak sayısı
        calculatedStepCount = Math.max(1, Math.floor(totalRun / minStepRun));
    } else if (currentStepRun > maxStepRun + 0.5) {
        // Çok genişse (max'tan büyükse), basamak sayısını artır (derinliği azalt)
        // En fazla maxStepRun derinliği ile gereken min basamak sayısı
        calculatedStepCount = Math.max(1, Math.ceil(totalRun / maxStepRun));
    }

    // Son bir kontrol (nadiren gerekli olabilir, eğer yuvarlama sınırda kaldıysa)
    currentStepRun = totalRun / calculatedStepCount;
    if (currentStepRun < minStepRun - 0.5 && calculatedStepCount > 1) {
        calculatedStepCount--; // Bir azalt
    } else if (currentStepRun > maxStepRun + 0.5) {
        calculatedStepCount++; // Bir artır
    }

    stair.stepCount = Math.max(1, calculatedStepCount); // Sonuç her zaman en az 1 olmalı
}

// Merdivenin dünya koordinatlarındaki köşe noktalarını hesaplar
export function getStairCorners(stair) {
    const halfWidth = (stair.width || 0) / 2; // Uzunluk (X ekseni yarısı)
    const halfHeight = (stair.height || 0) / 2; // En (Y ekseni yarısı -> 3D'de Z)
    const cx = stair.center.x; // Merkez X
    const cy = stair.center.y; // Merkez Y (3D'de Z)
    const rot = (stair.rotation || 0) * Math.PI / 180; // Döndürme açısı (radyan)

    // Lokal köşe koordinatları (merkeze göre)
    const corners = [
        { x: -halfWidth, y: -halfHeight },  // Sol üst
        { x: halfWidth, y: -halfHeight },   // Sağ üst
        { x: halfWidth, y: halfHeight },    // Sağ alt
        { x: -halfWidth, y: halfHeight }    // Sol alt
    ];

    // Köşeleri döndür ve merkeze göre ötele
    return corners.map(corner => {
        const rotatedX = corner.x * Math.cos(rot) - corner.y * Math.sin(rot); // Döndürülmüş X
        const rotatedY = corner.x * Math.sin(rot) + corner.y * Math.cos(rot); // Döndürülmüş Y
        return {
            x: cx + rotatedX, // Dünya X
            y: cy + rotatedY  // Dünya Y (3D'de Z)
        };
    });
}

// Verilen noktanın, merdivenin hangi kenarına veya köşesine denk geldiğini belirler.
export function getStairHandleAtPoint(point, stair, tolerance) {
    const cx = stair.center.x;
    const cy = stair.center.y;
    // Dünya koordinatlarındaki köşeleri al
    const corners = getStairCorners(stair);
    const cornerTolerance = tolerance * 1.5; // Köşeler için biraz daha fazla tolerans
    // Köşeleri kontrol et
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) { return `corner_${i}`; } // Köşe bulunduysa ismini döndür (örn: "corner_0")
    }
    // Noktayı merdivenin lokal koordinat sistemine çevir (dünyadan lokale)
    const rot = -(stair.rotation || 0) * Math.PI / 180; // Negatif açı ile ters döndürme
    const dx = point.x - cx; // Merkeze göre fark X
    const dy = point.y - cy; // Merkeze göre fark Y
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot); // Lokal X
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot); // Lokal Y
    const halfWidth = (stair.width || 0) / 2; // Yarım uzunluk
    const halfHeight = (stair.height || 0) / 2; // Yarım en
    // Lokal koordinatlara göre kenarları kontrol et (tolerans dahilinde)
    if (Math.abs(localY + halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_top';    // Üst kenar (local -Y)
    if (Math.abs(localY - halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) return 'edge_bottom'; // Alt kenar (local +Y)
    if (Math.abs(localX + halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_left';   // Sol kenar (local -X)
    if (Math.abs(localX - halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) return 'edge_right';  // Sağ kenar (local +X)
    return null; // Handle bulunamadı
}

// Verilen noktada hangi nesnenin (merdiven, kenar, köşe, gövde) olduğunu belirler
export function getStairAtPoint(point) {
    const { stairs, zoom } = state;
    if (!stairs) return null; // stairs dizisi yoksa null dön
    const handleTolerance = 8 / zoom; // Handle yakalama toleransı (zoom'a bağlı)
    // Önce handle'ları kontrol et (daha küçük hedef alan, daha öncelikli)
    for (const stair of [...stairs].reverse()) { // Sondan başa doğru kontrol (üstteki önce bulunur)
        const handle = getStairHandleAtPoint(point, stair, handleTolerance);
        if (handle) { return { type: 'stairs', object: stair, handle: handle }; } // Handle bulunduysa hemen döndür
    }
    // Sonra gövdeyi kontrol et
    for (const stair of [...stairs].reverse()) {
        if (isPointInStair(point, stair)) { return { type: 'stairs', object: stair, handle: 'body' }; } // Gövde bulunduysa döndür
    }
    return null; // Hiçbir şey bulunamadı
}

// Noktanın merdiven içinde olup olmadığını kontrol eder
export function isPointInStair(point, stair) {
    const cx = stair.center.x;
    const cy = stair.center.y;
    const rot = -(stair.rotation || 0) * Math.PI / 180; // Dünya'dan lokale dönüşüm için negatif açı
    const dx = point.x - cx;
    const dy = point.y - cy;
    // Noktayı merdivenin lokal koordinat sistemine çevir
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    const halfWidth = (stair.width || 0) / 2;
    const halfHeight = (stair.height || 0) / 2;
    // Lokal koordinatların sınırlar içinde olup olmadığını kontrol et
    // Küçük bir tolerans ekleyebiliriz (opsiyonel, kenarlara tıklamayı kolaylaştırır)
    const tolerance = 0.1;
    return Math.abs(localX) <= halfWidth + tolerance && Math.abs(localY) <= halfHeight + tolerance;
}

/**
 * Bir merdiven seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen merdiven nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {Event} e - PointerDown olayı
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset, additionalState }
 */
export function onPointerDown(selectedObject, pos, snappedPos, e) {
    const stair = selectedObject.object;
    // Kopyalama sadece gövdeye tıklandığında ve sadece Ctrl basılıysa
    const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey && selectedObject.handle === 'body';
    let effectiveStair = stair; // Üzerinde işlem yapılacak merdiven

    if (isCopying) {
        const newStair = JSON.parse(JSON.stringify(stair)); // Derin kopya
        newStair.name = getNextStairLetter(); // Kopyaya yeni bir isim ver
        newStair.id = `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`; // Yeni ID ata
        newStair.connectedStairId = null; // Kopyanın bağlantısını kaldır
        state.stairs = state.stairs || []; // Dizi yoksa oluştur
        state.stairs.push(newStair); // Yeni merdiveni listeye ekle
        effectiveStair = newStair; // Bundan sonra kopya üzerinde işlem yap
        // Seçili nesneyi kopya ile güncelle (önemli!)
        setState({ selectedObject: { ...selectedObject, object: newStair } });
    }

    // Sürükleme öncesi state'i kaydet (orijinal veya kopyanın)
    state.preDragNodeStates.set('center_x', effectiveStair.center.x);
    state.preDragNodeStates.set('center_y', effectiveStair.center.y);
    state.preDragNodeStates.set('width', effectiveStair.width || 0);
    state.preDragNodeStates.set('height', effectiveStair.height || 0);
    state.preDragNodeStates.set('rotation', effectiveStair.rotation || 0);

    let startPointForDragging; // Sürüklemenin başladığı referans nokta
    let dragOffset = { x: 0, y: 0 }; // Fare ile nesne merkezi arasındaki fark
    let additionalState = { columnRotationOffset: null }; // Döndürme için açı farkı (kolon/kiriş ile aynı isim)

    // Handle tipine göre başlangıç ayarlarını yap
    if (selectedObject.handle === 'body' || selectedObject.handle === 'center') {
        // Taşıma: Sürükleme başlangıcı fare pozisyonu, offset hesaplanır
        startPointForDragging = { x: pos.x, y: pos.y }; // Snaplenmemiş pozisyon
        dragOffset = { x: effectiveStair.center.x - pos.x, y: effectiveStair.center.y - pos.y };
    } else if (selectedObject.handle.startsWith('corner_')) {
        // Döndürme: Sürükleme başlangıcı merdiven merkezi, açı offset'i hesaplanır
        startPointForDragging = { x: effectiveStair.center.x, y: effectiveStair.center.y }; // Merkezden döndür
        const initialAngle = Math.atan2(pos.y - effectiveStair.center.y, pos.x - effectiveStair.center.x); // Başlangıç fare açısı
        const initialRotationRad = (effectiveStair.rotation || 0) * Math.PI / 180; // Merdivenin başlangıç açısı
        additionalState.columnRotationOffset = initialRotationRad - initialAngle; // Başlangıç açısı farkı (offset)
    } else {
        // Kenar (Boyutlandırma): Sürükleme başlangıcı snaplenmiş fare pozisyonu
        startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
    }
    return { startPointForDragging, dragOffset, additionalState };
}

/**
 * Seçili bir merdiveni sürüklerken çağrılır.
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const stair = state.selectedObject.object; // Kopyalanmışsa güncel olanı alır
    const handle = state.selectedObject.handle;

    if (handle.startsWith('corner_')) {
        // Döndürme
        const center = stair.center;
        const mouseAngle = Math.atan2(unsnappedPos.y - center.y, unsnappedPos.x - center.x); // Farenin merkez etrafındaki açısı
        let newRotationRad = mouseAngle + state.columnRotationOffset; // state'deki başlangıç açı farkını ekle

        // Açı snap'i (1 derece ve 90 derece)
        const snapAngleRad1 = (1 * Math.PI / 180); // 1 derecelik snap adımı
        newRotationRad = Math.round(newRotationRad / snapAngleRad1) * snapAngleRad1; // En yakın 1 dereceye yuvarla
        let newRotationDeg = newRotationRad * 180 / Math.PI; // Dereceye çevir
        const remainder = newRotationDeg % 90; // 90 dereceye göre kalan
        const snapThreshold = 5; // 90 dereceye snap için tolerans (derece)
        // 90 derecenin katlarına yakınsa oraya snap yap
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
        }
        stair.rotation = newRotationDeg; // Yeni açıyı ata

    } else if (handle === 'body' || handle === 'center') {
        // Taşıma
        // Yeni merkezi, farenin snaplenmemiş pozisyonu + başlangıç offset'i ile hesapla
        let newCenterX = unsnappedPos.x + state.dragOffset.x;
        let newCenterY = unsnappedPos.y + state.dragOffset.y;

        // --- GÜNCELLENMİŞ SNAP MANTIĞI (Duvar Yüzeyleri ve Diğer Merdivenler) ---
        const SNAP_DISTANCE_WALL_SURFACE = 5; // Duvar yüzeyine snap mesafesi (cm)
        const SNAP_DISTANCE_OTHER = 15; // Diğer snap türleri için mesafe (cm)
        let bestSnapX = { diff: SNAP_DISTANCE_OTHER, delta: 0, type: 'other' }; // X ekseni için en iyi snap bilgisi
        let bestSnapY = { diff: SNAP_DISTANCE_OTHER, delta: 0, type: 'other' }; // Y ekseni için en iyi snap bilgisi

        // Sürüklenen merdivenin geçici köşe ve merkez noktaları (snap kontrolü için)
        const tempCorners = getStairCorners({ ...stair, center: { x: newCenterX, y: newCenterY } });
        const dragPoints = [ ...tempCorners, { x: newCenterX, y: newCenterY } ]; // Kontrol edilecek noktalar

        // 1. Duvar Yüzeylerine Snap
        state.walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return; // Geçersiz duvarı atla
            const wallThickness = wall.thickness || state.wallThickness;
            const halfThickness = wallThickness / 2;
            const dxW = wall.p2.x - wall.p1.x;
            const dyW = wall.p2.y - wall.p1.y;
            const isVertical = Math.abs(dxW) < 0.1; // Duvar dikey mi?
            const isHorizontal = Math.abs(dyW) < 0.1; // Duvar yatay mı?

            if (isVertical) {
                // Dikey duvar: Sol ve Sağ yüzeylere (X) snap kontrolü
                const wallX = wall.p1.x;
                const snapXPositions = [ wallX - halfThickness, wallX + halfThickness ]; // Duvarın sol ve sağ yüzeyi X koordinatları
                for (const snapX of snapXPositions) { // Her iki yüzey için
                    for (const dP of dragPoints) { // Merdivenin her noktası için (köşeler + merkez)
                        const diff = Math.abs(dP.x - snapX); // X eksenindeki fark
                        // Eğer mesafe tolerans içinde VE önceki en iyi snap'ten daha iyiyse
                        if (diff < SNAP_DISTANCE_WALL_SURFACE && diff < bestSnapX.diff) {
                            // En iyi snap'i güncelle (fark, düzeltme miktarı, tip)
                            bestSnapX = { diff, delta: snapX - dP.x, type: 'wall_surface' };
                        }
                    }
                }
            } else if (isHorizontal) {
                // Yatay duvar: Üst ve Alt yüzeylere (Y) snap kontrolü
                const wallY = wall.p1.y;
                const snapYPositions = [ wallY - halfThickness, wallY + halfThickness ]; // Duvarın üst ve alt yüzeyi Y koordinatları
                for (const snapY of snapYPositions) { // Her iki yüzey için
                    for (const dP of dragPoints) { // Merdivenin her noktası için
                        const diff = Math.abs(dP.y - snapY); // Y eksenindeki fark
                        // Eğer mesafe tolerans içinde VE önceki en iyi snap'ten daha iyiyse
                        if (diff < SNAP_DISTANCE_WALL_SURFACE && diff < bestSnapY.diff) {
                            // En iyi snap'i güncelle
                            bestSnapY = { diff, delta: snapY - dP.y, type: 'wall_surface' };
                        }
                    }
                }
            }
            // Açılı duvar snap'i şimdilik atlandı (daha karmaşık)
        });

        // 2. Diğer Merdivenlere Snap (Eğer daha iyi duvar yüzeyi snap'i yoksa veya mesafe uygunsa)
        // Eğer X veya Y ekseninde hala duvar yüzeyine snap yapılmadıysa VEYA
        // duvar yüzeyine snap yapılmış olsa bile diğer merdivene olan mesafe daha KISA ise (SNAP_DISTANCE_OTHER içinde)
        if (bestSnapX.type !== 'wall_surface' || bestSnapY.type !== 'wall_surface' || bestSnapX.diff > SNAP_DISTANCE_OTHER || bestSnapY.diff > SNAP_DISTANCE_OTHER) {
            (state.stairs || []).forEach(otherStair => {
                if (otherStair === stair) return; // Kendisine snap yapma
                const otherCorners = getStairCorners(otherStair);
                const otherPoints = [ ...otherCorners, otherStair.center ]; // Diğer merdivenin köşe ve merkez noktaları
                otherPoints.forEach(oP => { // Diğer merdivenin her noktası için
                    for (const dP of dragPoints) { // Sürüklenen merdivenin her noktası için
                        const diffX = Math.abs(dP.x - oP.x); // X farkı
                        // Eğer mevcut X snap'i duvar yüzeyi DEĞİLSE VE bu fark daha iyiyse VEYA
                        // mevcut X snap'i duvar yüzeyi AMA bu fark SNAP_DISTANCE_OTHER içinde VE daha iyiyse
                        if ((bestSnapX.type !== 'wall_surface' && diffX < bestSnapX.diff) || (bestSnapX.type === 'wall_surface' && diffX < SNAP_DISTANCE_OTHER && diffX < bestSnapX.diff)) {
                            bestSnapX = { diff: diffX, delta: oP.x - dP.x, type: 'stair' }; // X snap'ini güncelle
                        }
                        const diffY = Math.abs(dP.y - oP.y); // Y farkı
                        // Aynı kontrol Y ekseni için
                        if ((bestSnapY.type !== 'wall_surface' && diffY < bestSnapY.diff) || (bestSnapY.type === 'wall_surface' && diffY < SNAP_DISTANCE_OTHER && diffY < bestSnapY.diff)) {
                            bestSnapY = { diff: diffY, delta: oP.y - dP.y, type: 'stair' }; // Y snap'ini güncelle
                        }
                    }
                });
            });
        }

        // Bulunan en iyi snap farklarını (delta) uygula
        newCenterX += bestSnapX.delta;
        newCenterY += bestSnapY.delta;
        // --- SNAP MANTIĞI SONU ---

        // Hesaplanan yeni merkezi ata
        stair.center.x = newCenterX;
        stair.center.y = newCenterY;

    } else if (handle.startsWith('edge_')) {
        // Boyutlandırma
        let fixedEdgeHandle; // Sabit kalan karşı kenar
        // Sürüklenen kenara göre sabit kenarı belirle
        if (handle === 'edge_top') fixedEdgeHandle = 'edge_bottom';
        else if (handle === 'edge_bottom') fixedEdgeHandle = 'edge_top';
        else if (handle === 'edge_left') fixedEdgeHandle = 'edge_right';
        else if (handle === 'edge_right') fixedEdgeHandle = 'edge_left';
        else return; // Geçersiz handle

        // Başlangıç boyutlarını ve merkezini al (sürükleme öncesi kaydedilen)
        const initialWidth = state.preDragNodeStates.get('width');
        const initialHeight = state.preDragNodeStates.get('height');
        const initialCenterX = state.preDragNodeStates.get('center_x');
        const initialCenterY = state.preDragNodeStates.get('center_y');
        if (initialWidth === undefined || initialHeight === undefined) return; // Başlangıç state yoksa çık

         // Başlangıçtaki köşe noktalarını hesapla
         const initialCorners = getStairCorners({
             center: { x: initialCenterX, y: initialCenterY },
             width: initialWidth,
             height: initialHeight,
             rotation: stair.rotation || 0
         });

         // Sabit kalan kenarın başlangıç ve bitiş noktalarını bul
         let fixedPoint1, fixedPoint2;
         if (fixedEdgeHandle === 'edge_top') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[1]; }       // Sol üst, Sağ üst
         else if (fixedEdgeHandle === 'edge_bottom') { fixedPoint1 = initialCorners[3]; fixedPoint2 = initialCorners[2]; } // Sol alt, Sağ alt
         else if (fixedEdgeHandle === 'edge_left') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[3]; }   // Sol üst, Sol alt
         else if (fixedEdgeHandle === 'edge_right') { fixedPoint1 = initialCorners[1]; fixedPoint2 = initialCorners[2]; }  // Sağ üst, Sağ alt
         else return; // Hata durumu
         // Sabit kenarın orta noktası (boyutlandırmanın referans noktası)
         const fixedEdgeMidPoint = { x: (fixedPoint1.x + fixedPoint2.x) / 2, y: (fixedPoint1.y + fixedPoint2.y) / 2 };

         // Merdivenin rotasyonunu ve boyutlandırma eksenini belirle
         const rotRad = (stair.rotation || 0) * Math.PI / 180;
         const cosRot = Math.cos(rotRad);
         const sinRot = Math.sin(rotRad);
         let axisVector; // Boyutlandırmanın yapıldığı eksen vektörü (sabit kenara dik)
         // Hangi kenar sürüklendiğine göre ekseni belirle
         if (handle === 'edge_top' || handle === 'edge_bottom') {
             // Üst/Alt kenar sürüklendi -> Y ekseninde boyutlandırma (height değişir)
             axisVector = { x: -sinRot, y: cosRot }; // Lokal Y ekseni yönü (dünya koordinatlarında)
         } else {
             // Sol/Sağ kenar sürüklendi -> X ekseninde boyutlandırma (width değişir)
             axisVector = { x: cosRot, y: sinRot }; // Lokal X ekseni yönü (dünya koordinatlarında)
         }

         // Fare pozisyonunun (snaplenmiş) sabit kenar orta noktasına göre vektörü
         const mouseVec = { x: snappedPos.x - fixedEdgeMidPoint.x, y: snappedPos.y - fixedEdgeMidPoint.y };
         // Farenin boyutlandırma ekseni üzerindeki izdüşümü (yeni toplam boyutun işaretli değerini verir)
         const projection = mouseVec.x * axisVector.x + mouseVec.y * axisVector.y;

         // Sürüklenen kenarın snap öncesi hedef konumu (izdüşüme göre)
         const draggedEdgePoint = {
             x: fixedEdgeMidPoint.x + axisVector.x * projection,
             y: fixedEdgeMidPoint.y + axisVector.y * projection
         };

         // --- KENAR SNAP MANTIĞI (Duvar Yüzeylerine) ---
         const SNAP_DISTANCE_WALL_SURFACE = 5; // Duvar yüzeyine snap mesafesi (cm)
         let bestSnapDelta = 0; // Uygulanacak snap mesafesi (projection cinsinden)
         let bestSnapDiff = SNAP_DISTANCE_WALL_SURFACE; // Bulunan en iyi snap farkı

         // Duvarları kontrol et
         state.walls.forEach(wall => {
             if (!wall.p1 || !wall.p2) return; // Geçersiz duvarı atla
             const wallThickness = wall.thickness || state.wallThickness;
             const halfThickness = wallThickness / 2;
             const dxW = wall.p2.x - wall.p1.x;
             const dyW = wall.p2.y - wall.p1.y;
             const isVertical = Math.abs(dxW) < 0.1; // Duvar dikey mi?
             const isHorizontal = Math.abs(dyW) < 0.1; // Duvar yatay mı?

             // Eğer X ekseninde boyutlandırma yapılıyorsa (sol/sağ handle) VE duvar dikeys:
             if (isVertical && (handle === 'edge_left' || handle === 'edge_right')) {
                 const wallX = wall.p1.x;
                 const snapXPositions = [ wallX - halfThickness, wallX + halfThickness ]; // Duvarın yüzeyleri
                 for (const snapX of snapXPositions) { // Her iki yüzey için
                     const diff = Math.abs(draggedEdgePoint.x - snapX); // Hedeflenen X ile duvar yüzeyi X arasındaki fark
                     if (diff < bestSnapDiff) { // Daha iyi bir snap bulunduysa
                         bestSnapDiff = diff;
                         // Snap mesafesini X'teki farktan projection'a çevir (deltaX / axisVector.x)
                         const deltaX = snapX - draggedEdgePoint.x; // Düzeltme miktarı (X ekseninde)
                         // Eğer axisVector.x sıfıra çok yakınsa (örn. 90 derece dönmüş merdiven), bölme hatası olur.
                         bestSnapDelta = Math.abs(axisVector.x) > 1e-6 ? (deltaX / axisVector.x) : 0;
                     }
                 }
             }
             // Eğer Y ekseninde boyutlandırma yapılıyorsa (üst/alt handle) VE duvar yataysa:
             else if (isHorizontal && (handle === 'edge_top' || handle === 'edge_bottom')) {
                 const wallY = wall.p1.y;
                 const snapYPositions = [ wallY - halfThickness, wallY + halfThickness ]; // Duvarın yüzeyleri
                 for (const snapY of snapYPositions) { // Her iki yüzey için
                     const diff = Math.abs(draggedEdgePoint.y - snapY); // Hedeflenen Y ile duvar yüzeyi Y arasındaki fark
                     if (diff < bestSnapDiff) { // Daha iyi bir snap bulunduysa
                         bestSnapDiff = diff;
                         // Snap mesafesini Y'deki farktan projection'a çevir (deltaY / axisVector.y)
                         const deltaY = snapY - draggedEdgePoint.y; // Düzeltme miktarı (Y ekseninde)
                         // Eğer axisVector.y sıfıra çok yakınsa (örn. 0 derece dönmüş merdiven), bölme hatası olur.
                         bestSnapDelta = Math.abs(axisVector.y) > 1e-6 ? (deltaY / axisVector.y) : 0;
                     }
                 }
             }
         });

         // Hesaplanan en iyi snap mesafesini izdüşüme ekle
         const finalProjection = projection + bestSnapDelta;
         // --- KENAR SNAP MANTIĞI SONU ---

         // Yeni boyutu hesapla (minimum 10cm, mutlak değer)
         let newSize = Math.max(10, Math.abs(finalProjection));

         // Yeni merkezi hesapla (sabit kenarın ortası + eksen yönünde yeni boyutun yarısı kadar)
         // finalProjection işaretli olduğu için yönü doğru verir (negatifse ters yönde yarısı kadar gider)
         const halfSizeVector = { x: axisVector.x * finalProjection / 2, y: axisVector.y * finalProjection / 2 };
         const newCenterX = fixedEdgeMidPoint.x + halfSizeVector.x;
         const newCenterY = fixedEdgeMidPoint.y + halfSizeVector.y;

         // Hangi boyutun değiştiğini belirle ve ata
         if (handle === 'edge_top' || handle === 'edge_bottom') {
             stair.height = newSize; // 'height' (en) değişti
         } else {
             stair.width = newSize; // 'width' (uzunluk) değişti
             recalculateStepCount(stair); // Uzunluk değiştiyse basamak sayısını yeniden hesapla
         }
        // Yeni merkezi ata
        stair.center.x = newCenterX;
        stair.center.y = newCenterY;
        // İçi boş özelliklerini sıfırla (varsa, boyut değişince anlamsız kalır)
        stair.hollowWidth = 0; stair.hollowHeight = 0; stair.hollowOffsetX = 0; stair.hollowOffsetY = 0;
    }

    // 3D sahneyi güncelle (her hareket sonrası)
    if (dom.mainContainer.classList.contains('show-3d')) {
       update3DScene();
    }
}