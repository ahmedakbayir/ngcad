/**
 * Rotation Handler
 * Döndürme işlemlerini yönetir
 */

import { saveState } from '../../general-files/history.js';
import { findPipesAtPoint } from './drag-handler.js';
import { TESISAT_CONSTANTS } from './tesisat-snap.js';

/**
 * Döndürme tutamacını bul (çubuğun ucundaki daire) - yukarı yönde
 */
export function findRotationHandleAt(obj, point, tolerance = 8) {
    if (!obj) return false;
    if (obj.type !== 'servis_kutusu' && obj.type !== 'cihaz' && obj.type !== 'sayac') return false;

    let handleLength;
    if (obj.type === 'servis_kutusu') {
        const SERVIS_KUTUSU_CONFIG = { width: 40, height: 20 };
        handleLength = SERVIS_KUTUSU_CONFIG.height / 2 + 20;
    } else if (obj.type === 'cihaz') {
        // Cihaz için: 30 cm çapında, handle 20 cm yukarıda (yarıya düşürüldü)
        handleLength = 15 + 20; // radius + 20cm = 35cm
    } else if (obj.type === 'sayac') {
        // Sayaç için: handle merkezden yukarıda
        handleLength = - 20; // 12 + 20 = 32cm
    }

    // Tutamacın world pozisyonunu hesapla (yukarı yönde, rotation dikkate alınarak)
    // Local: (0, -handleLength) → World: dönüşüm matrisi uygula
    const rad = (obj.rotation || 0) * Math.PI / 180;
    const handleX = obj.x + handleLength * Math.sin(rad);
    const handleY = obj.y - handleLength * Math.cos(rad);

    const dist = Math.hypot(point.x - handleX, point.y - handleY);
    return dist < tolerance;
}

/**
 * Döndürme başlat
 */
export function startRotation(context, obj, point, manager) {
    saveState();
    context.isRotating = true;
    context.dragObject = obj;

    // Merkez noktası
    const center = { x: obj.x, y: obj.y };

    // Başlangıç açısını hesapla
    const initialAngle = Math.atan2(point.y - center.y, point.x - center.x);
    const initialRotationRad = (obj.rotation || 0) * Math.PI / 180;
    context.rotationOffset = initialRotationRad - initialAngle;

    // SHARED VERTEX: Bağlı boruları ÖNCEDENtespit et ve kaydet (hızlı rotation için)
    context.rotationConnectedPipes = null;
    if (obj.type === 'sayac' && obj.cikisBagliBoruId) {
        const cikisBoru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
        if (cikisBoru) {
            // 🚨 KRİTİK: Giriş borusunu EXCLUDE et, aksi halde döndürme sırasında
            // giriş ve çıkış boruları birbirine yapışır (sadece 10cm aralık var, tolerance 20cm!)
            const girisBoru = obj.fleksBaglanti?.boruId
                ? manager.pipes.find(p => p.id === obj.fleksBaglanti.boruId)
                : null;

            const excludePipes = [cikisBoru];
            if (girisBoru) excludePipes.push(girisBoru);

            // Çıkış noktasındaki bağlı boruları bul (giriş ve çıkış boruları hariç)
            const outputConnectedPipes = [];
            manager.pipes.forEach(p => {
                if (excludePipes.includes(p)) return;

                const distToP1 = Math.hypot(p.p1.x - cikisBoru.p1.x, p.p1.y - cikisBoru.p1.y);
                const distToP2 = Math.hypot(p.p2.x - cikisBoru.p1.x, p.p2.y - cikisBoru.p1.y);

                if (distToP1 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
                    outputConnectedPipes.push({ pipe: p, endpoint: 'p1' });
                }
                if (distToP2 < TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE) {
                    outputConnectedPipes.push({ pipe: p, endpoint: 'p2' });
                }
            });

            context.rotationConnectedPipes = outputConnectedPipes;
            console.log(`[ROTATION START] ${context.rotationConnectedPipes.length} bağlı boru tespit edildi (giriş hattı exclude edildi, tolerance: ${TESISAT_CONSTANTS.CONNECTED_PIPES_TOLERANCE} cm)`);
        }
    }
}

/**
 * Döndürme işle
 */
export function handleRotation(context, point, manager) {
    if (!context.dragObject) return;

    const obj = context.dragObject;
    const center = { x: obj.x, y: obj.y };

    // Yeni açıyı hesapla
    const mouseAngle = Math.atan2(point.y - center.y, point.x - center.x);
    let newRotationRad = mouseAngle + context.rotationOffset;

    // 1 derecelik snap
    const snapAngleRad = (1 * Math.PI / 180);
    newRotationRad = Math.round(newRotationRad / snapAngleRad) * snapAngleRad;
    let newRotationDeg = newRotationRad * 180 / Math.PI;

    // 90 dereceye snap (5 derece threshold)
    const remainder = newRotationDeg % 90;
    const snapThreshold = 5;
    if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
        newRotationDeg = Math.round(newRotationDeg / 90) * 90;
    }

    if (obj.type === 'servis_kutusu') {
        // ÖNEMLI: Çıkış noktası sabit kalmalı, kutu merkezi hareket etmeli
        // Eski çıkış noktasını kaydet
        const eskiCikis = obj.getCikisNoktasi();

        // Rotasyonu değiştir
        obj.rotation = newRotationDeg;

        // Yeni çıkış noktasını hesapla
        const yeniCikis = obj.getCikisNoktasi();

        // Kutu merkezini ayarla (çıkış noktası sabit kalsın)
        obj.x += eskiCikis.x - yeniCikis.x;
        obj.y += eskiCikis.y - yeniCikis.y;

        // Bağlı boruyu güncelle (çıkış noktası değişmedi, güncellemeye gerek yok)
        // Ama yine de çağıralım, emin olmak için
        if (obj.bagliBoruId) {
            const boru = manager.pipes.find(p => p.id === obj.bagliBoruId);
            if (boru) {
                boru.moveP1(obj.getCikisNoktasi());
            }
        }
    } else if (obj.type === 'cihaz') {
        // Cihaz: Merkez sabit, sadece rotation değişir
        // Açıyı 0-360 aralığına normalize et
        let normalizedRotation = newRotationDeg % 360;
        if (normalizedRotation < 0) normalizedRotation += 360;
        const eskiRotation = obj.rotation || 0;
        obj.rotation = normalizedRotation;

        // Bağlı baca(lar)ı cihazın merkezi etrafında rijit döndür.
        // Aksi takdirde cihaz döner ama baca eski yerinde kalır → cihazın
        // yanından dışarı sarkıyormuş gibi görünür.
        const deltaRad = (normalizedRotation - eskiRotation) * Math.PI / 180;
        if (Math.abs(deltaRad) > 1e-6) {
            const cosD = Math.cos(deltaRad);
            const sinD = Math.sin(deltaRad);
            const cx = obj.x, cy = obj.y;
            const rotatePt = (p) => {
                const dx = p.x - cx;
                const dy = p.y - cy;
                p.x = cx + dx * cosD - dy * sinD;
                p.y = cy + dx * sinD + dy * cosD;
            };
            const bacalar = (manager.components || []).filter(c => c.type === 'baca' && c.parentCihazId === obj.id);
            for (const baca of bacalar) {
                const startPt = { x: baca.startX, y: baca.startY };
                rotatePt(startPt);
                baca.startX = startPt.x;
                baca.startY = startPt.y;
                if (baca.currentSegmentStart) rotatePt(baca.currentSegmentStart);
                if (Array.isArray(baca.segments)) {
                    for (const seg of baca.segments) {
                        const p1 = { x: seg.x1, y: seg.y1 };
                        const p2 = { x: seg.x2, y: seg.y2 };
                        rotatePt(p1); rotatePt(p2);
                        seg.x1 = p1.x; seg.y1 = p1.y;
                        seg.x2 = p2.x; seg.y2 = p2.y;
                    }
                }
                if (baca.havalandirma) {
                    rotatePt(baca.havalandirma);
                    // Havalandırma kendi açısına da delta uygula
                    if (typeof baca.havalandirma.angle === 'number') {
                        baca.havalandirma.angle += deltaRad;
                    }
                }
            }
        }

        // Fleks artık her render'da borudan koordinat okuyor
    } else if (obj.type === 'sayac') {
        // Sayaç: Merkez sabit, rotation değişir
        let normalizedRotation = newRotationDeg % 360;
        if (normalizedRotation < 0) normalizedRotation += 360;
        obj.rotation = normalizedRotation;

        // Çıkış borusunu güncelle (çıkış noktası döndükçe değişir)
        if (obj.cikisBagliBoruId) {
            const cikisBoru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
            if (cikisBoru) {
                // Sayaç çıkışı boru p1'e bağlı
                const yeniCikis = obj.getCikisNoktasi();
                cikisBoru.moveP1(yeniCikis);

                // SHARED VERTEX: Başlangıçta tespit edilen bağlı boruları güncelle (HIZLI ROTATION!)
                if (context.rotationConnectedPipes) {
                    context.rotationConnectedPipes.forEach(({ pipe: connectedPipe, endpoint: connectedEndpoint }) => {
                        connectedPipe[connectedEndpoint].x = yeniCikis.x;
                        connectedPipe[connectedEndpoint].y = yeniCikis.y;
                    });
                }
            }
        }
    }
}

/**
 * Döndürme bitir
 */
export function endRotation(context, manager) {
    context.isRotating = false;
    context.dragObject = null;
    context.rotationOffset = 0;
    context.rotationConnectedPipes = null; // Bağlantı referanslarını temizle
    manager.saveToState();
    saveState(); // Save to undo history
}

// ─── KAZAN/TICARI köşe yeniden boyutlandırma ────────────────────────────────
// Cihaz seçili ve config.resizable ise; 4 köşede küçük tutamaçlar gösterilir.
// Mouse bu kareye yakınsa drag yerine resize başlatılır.

const RESIZE_HANDLE_TOLERANCE = 8; // cm
const RESIZE_MIN_SIZE = 20;        // cm

/**
 * Cihazın 4 köşesinden hangisi tıklandı? Dönen değer: 'tl'|'tr'|'br'|'bl'|null
 */
export function findResizeHandleCorner(obj, point, tolerance = RESIZE_HANDLE_TOLERANCE) {
    if (!obj || obj.type !== 'cihaz' || !obj.config?.resizable) return null;
    if (typeof obj.getBoyut !== 'function') return null;
    const { width, height } = obj.getBoyut();
    const halfW = width / 2;
    const halfH = height / 2;
    const rad = (obj.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const localCorners = {
        tl: { x: -halfW, y: -halfH },
        tr: { x:  halfW, y: -halfH },
        br: { x:  halfW, y:  halfH },
        bl: { x: -halfW, y:  halfH },
    };
    let best = null;
    let bestDist = Infinity;
    for (const [key, c] of Object.entries(localCorners)) {
        const wx = obj.x + c.x * cos - c.y * sin;
        const wy = obj.y + c.x * sin + c.y * cos;
        const d = Math.hypot(point.x - wx, point.y - wy);
        if (d < tolerance && d < bestDist) {
            best = key;
            bestDist = d;
        }
    }
    return best;
}

export function startResize(context, obj, corner, point) {
    saveState();
    context.isResizing = true;
    context.dragObject = obj;
    context.resizeCorner = corner;
    const { width, height } = obj.getBoyut();
    const rotRad = (obj.rotation || 0) * Math.PI / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    // Bağlı baca(lar) için: world anchor'larını local koordinata çevir ki resize
    // sırasında oransal olarak yeniden konumlandırılabilsinler. Tüm baca dünya
    // noktalarının snapshot'ı; her update'te snapshot + (deltaWorld) ile rijit
    // şekilde shift edilir.
    const bacas = (context.manager?.components || [])
        .filter(c => c.type === 'baca' && c.parentCihazId === obj.id)
        .map(b => {
            // inverse rotate (startX - cx, startY - cy)
            const dx = b.startX - obj.x;
            const dy = b.startY - obj.y;
            const lx = dx * cosR + dy * sinR;
            const ly = -dx * sinR + dy * cosR;
            return {
                baca: b,
                localAnchor: { x: lx, y: ly },
                snapshot: {
                    startX: b.startX,
                    startY: b.startY,
                    segments: (b.segments || []).map(s => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
                    currentSegmentStart: b.currentSegmentStart ? { x: b.currentSegmentStart.x, y: b.currentSegmentStart.y } : null,
                    havalandirma: b.havalandirma ? { x: b.havalandirma.x, y: b.havalandirma.y } : null,
                },
            };
        });

    context.resizeStart = {
        widthCm: width,
        heightCm: height,
        cx: obj.x,
        cy: obj.y,
        pointer: { x: point.x, y: point.y },
        rotation: obj.rotation || 0,
        girisOffset: obj.girisOffset ? { x: obj.girisOffset.x, y: obj.girisOffset.y } : null,
        bacas,
    };
}

export function updateResize(context, point) {
    if (!context.isResizing || !context.dragObject) return;
    const obj = context.dragObject;
    const start = context.resizeStart;
    if (!start) return;

    // Mouse delta'yı cihazın yerel eksenine projeksiyonla (rotation çıkar)
    const rad = -start.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = (point.x - start.pointer.x) * cos - (point.y - start.pointer.y) * sin;
    const dy = (point.x - start.pointer.x) * sin + (point.y - start.pointer.y) * cos;

    // Köşeye göre genişlik/yükseklik değişim yönü
    let signX, signY;
    switch (context.resizeCorner) {
        case 'tl': signX = -1; signY = -1; break;
        case 'tr': signX =  1; signY = -1; break;
        case 'br': signX =  1; signY =  1; break;
        case 'bl': signX = -1; signY =  1; break;
        default: return;
    }

    const newW = Math.max(RESIZE_MIN_SIZE, start.widthCm  + signX * dx);
    const newH = Math.max(RESIZE_MIN_SIZE, start.heightCm + signY * dy);

    obj.widthCm  = Math.round(newW);
    obj.heightCm = Math.round(newH);

    // Fleks giriş offset'i, baca anchor'ı vb. cihazın yeni boyutuyla orantılı
    // şekilde güncellensin ki cihaz resize edilirken fleks/baca KOPMAsın.
    const scaleX = newW / Math.max(1, start.widthCm);
    const scaleY = newH / Math.max(1, start.heightCm);

    // 1) Fleks giriş offset'i (girisOffset) — local koordinatta orantılı kaydır
    if (obj.girisOffset && start.girisOffset) {
        obj.girisOffset.x = start.girisOffset.x * scaleX;
        obj.girisOffset.y = start.girisOffset.y * scaleY;
    }

    // 2) Bağlı baca(lar): snapshot'tan rijit shift uygulanır. Anchor'ın yeni
    //    yerel konumu start.localAnchor × scale ile bulunur; rotasyon delta'sı
    //    sıfır olduğundan sadece eksen ölçekleme uygulanır.
    if (Array.isArray(start.bacas) && start.bacas.length) {
        const rotForward = start.rotation * Math.PI / 180;
        const cF = Math.cos(rotForward);
        const sF = Math.sin(rotForward);
        for (const bs of start.bacas) {
            const nlx = bs.localAnchor.x * scaleX;
            const nly = bs.localAnchor.y * scaleY;
            const newWorldX = obj.x + nlx * cF - nly * sF;
            const newWorldY = obj.y + nlx * sF + nly * cF;
            const ddx = newWorldX - bs.snapshot.startX;
            const ddy = newWorldY - bs.snapshot.startY;
            const baca = bs.baca;
            baca.startX = bs.snapshot.startX + ddx;
            baca.startY = bs.snapshot.startY + ddy;
            if (baca.currentSegmentStart && bs.snapshot.currentSegmentStart) {
                baca.currentSegmentStart.x = bs.snapshot.currentSegmentStart.x + ddx;
                baca.currentSegmentStart.y = bs.snapshot.currentSegmentStart.y + ddy;
            }
            if (Array.isArray(baca.segments) && Array.isArray(bs.snapshot.segments)) {
                for (let i = 0; i < baca.segments.length && i < bs.snapshot.segments.length; i++) {
                    const seg = baca.segments[i];
                    const snap = bs.snapshot.segments[i];
                    seg.x1 = snap.x1 + ddx;
                    seg.y1 = snap.y1 + ddy;
                    seg.x2 = snap.x2 + ddx;
                    seg.y2 = snap.y2 + ddy;
                }
            }
            if (baca.havalandirma && bs.snapshot.havalandirma) {
                baca.havalandirma.x = bs.snapshot.havalandirma.x + ddx;
                baca.havalandirma.y = bs.snapshot.havalandirma.y + ddy;
            }
        }
    }
}

export function endResize(context, manager) {
    context.isResizing = false;
    context.dragObject = null;
    context.resizeCorner = null;
    context.resizeStart = null;
    manager.saveToState();
    saveState();
}

/**
 * Bağlı boruyu güncelle
 * NOT: Bu fonksiyon artık kullanılmıyor, rotation-handler içinde direkt yapılıyor
 */
export function updateConnectedPipe(result, manager) {
    if (!result) return;

    // Bu fonksiyon eski implementasyondan kaldı
    // Şimdilik boş bırakıyoruz, gerekirse silinebilir
    console.warn('[DEPRECATED] updateConnectedPipe kullanılıyor, yeni implementasyonu kullanın');
}
