// guide-handler.js
import { distToSegmentSquared, screenToWorld } from '../draw/geometry.js';
import { state, setState, dom } from '../general-files/main.js';

/**
 * Verilen noktaya (pos) en yakın rehber çizgisini (guide) bulur.
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {number} tolerance - Yakalama toleransı (dünya biriminde)
 * @returns {object | null} - Bulunan rehber nesnesi (seçim için) veya null
 */
export function getGuideAtPoint(pos, tolerance) {
    const { guides } = state;
    if (!guides || guides.length === 0) return null;

    const pointTolerance = tolerance * 1.5; // Noktalar için daha büyük tolerans

    for (const guide of [...guides].reverse()) {
        switch (guide.subType) {
            case 'point': {
                const dist = Math.hypot(pos.x - guide.x, pos.y - guide.y);
                if (dist < pointTolerance) {
                    return { type: 'guide', object: guide, handle: 'body' };
                }
                break;
            }
            case 'horizontal': {
                const dist = Math.abs(pos.y - guide.y);
                // Ekran sınırları içinde mi diye kontrol et (sonsuz çizgiler için)
                const dpr = window.devicePixelRatio || 1;
                const { x: worldLeft } = screenToWorld(0, 0);
                const { x: worldRight } = screenToWorld(dom.c2d.width / dpr, 0);
                if (dist < tolerance && pos.x >= worldLeft && pos.x <= worldRight) {
                    return { type: 'guide', object: guide, handle: 'body' };
                }
                break;
            }
            case 'vertical': {
                const dist = Math.abs(pos.x - guide.x);
                const dpr = window.devicePixelRatio || 1;
                const { y: worldTop } = screenToWorld(0, 0);
                const { y: worldBottom } = screenToWorld(0, dom.c2d.height / dpr);
                if (dist < tolerance && pos.y >= worldTop && pos.y <= worldBottom) {
                    return { type: 'guide', object: guide, handle: 'body' };
                }
                break;
            }
            case 'free':
            case 'angular': {
                // Önce P1 ve P2 uçlarını kontrol et
                const d1 = Math.hypot(pos.x - guide.p1.x, pos.y - guide.p1.y);
                if (d1 < pointTolerance) {
                    return { type: 'guide', object: guide, handle: 'p1' };
                }
                const d2 = Math.hypot(pos.x - guide.p2.x, pos.y - guide.p2.y);
                if (d2 < pointTolerance) {
                    return { type: 'guide', object: guide, handle: 'p2' };
                }
                
                // Sonra gövdeyi kontrol et
                let distSq;
                if (guide.subType === 'free') {
                    // Serbest: Sadece segmenti kontrol et
                    distSq = distToSegmentSquared(pos, guide.p1, guide.p2);
                } else {
                    // Açısal: Sonsuz çizgiyi kontrol et
                    const dx = guide.p2.x - guide.p1.x;
                    const dy = guide.p2.y - guide.p1.y;
                    const lenSq = dx * dx + dy * dy;
                    if (lenSq < 0.1) break;
                    // Noktanın çizgiye dik mesafesinin karesi
                    const det = dx * (pos.y - guide.p1.y) - dy * (pos.x - guide.p1.x);
                    distSq = (det * det) / lenSq;
                }
                
                if (distSq < tolerance * tolerance) {
                    return { type: 'guide', object: guide, handle: 'body' };
                }
                break;
            }
        }
    }
    return null; // Hiçbir rehber bulunamadı
}

/**
 * Bir rehber seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen rehber nesnesi
 * @param {object} pos - Dünya koordinatları {x, y} (snaplenmemiş)
 * @param {object} snappedPos - Dünya koordinatları {x, y} (snaplenmiş)
 * @param {Event} e - PointerDown olayı
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset, additionalState }
 */
export function onPointerDownGuide(selectedObject, pos, snappedPos, e) {
    let guide = selectedObject.object;
    const handle = selectedObject.handle;

    // CTRL basılıysa kopyalama flag'i koy (gerçek kopyalama pointer-move'da yapılacak)
    if (e.ctrlKey) {
        state.guideCopyPending = true;
        state.originalGuideForCopy = guide;
        state.copyHandleForGuide = handle;
    } else {
        state.guideCopyPending = false;
        state.originalGuideForCopy = null;
    }

    // Sürükleme öncesi state'i kaydet (pointer-up.js'de saveState() çağrılacak)
    // Önemli: preDragNodeStates, key olarak nesne referansı bekler
    if (handle === 'p1') {
        state.preDragNodeStates.set(guide.p1, { x: guide.p1.x, y: guide.p1.y });
    } else if (handle === 'p2') {
        state.preDragNodeStates.set(guide.p2, { x: guide.p2.x, y: guide.p2.y });
    } else { // body
        // 'body' sürüklemesi için tüm ilgili noktaları kaydet
        if (guide.subType === 'point' || guide.subType === 'vertical') {
            state.preDragNodeStates.set(guide, { x: guide.x }); // x'i kaydet
        }
        if (guide.subType === 'point' || guide.subType === 'horizontal') {
            state.preDragNodeStates.set(guide, { ...state.preDragNodeStates.get(guide), y: guide.y }); // y'yi kaydet
        }
        if (guide.subType === 'free' || guide.subType === 'angular') {
            state.preDragNodeStates.set(guide.p1, { x: guide.p1.x, y: guide.p1.y });
            state.preDragNodeStates.set(guide.p2, { x: guide.p2.x, y: guide.p2.y });
        }
    }

    let startPointForDragging = { x: pos.x, y: pos.y };
    let dragOffset = { x: 0, y: 0 };

    // Sürüklenecek referans noktasını ve offset'i hesapla
    let refPoint = { x: pos.x, y: pos.y };
    if (handle === 'p1') {
        refPoint = guide.p1;
    } else if (handle === 'p2') {
        refPoint = guide.p2;
    } else if (guide.subType === 'point') {
        refPoint = { x: guide.x, y: guide.y };
    } else if (guide.subType === 'horizontal') {
        refPoint = { x: pos.x, y: guide.y }; // X'i farede tut, Y'yi kilitle
    } else if (guide.subType === 'vertical') {
        refPoint = { x: guide.x, y: pos.y }; // Y'yi farede tut, X'i kilitle
    } else if (guide.subType === 'free' || guide.subType === 'angular') {
        // 'body' sürüklemesi için en yakın noktayı bul
        // (Şimdilik p1'i referans alalım - daha sonra geliştirilebilir)
        refPoint = guide.p1;
    }

    startPointForDragging = refPoint;
    dragOffset = { x: refPoint.x - pos.x, y: refPoint.y - pos.y };

    return { startPointForDragging, dragOffset, additionalState: {} };
}

/**
 * Seçili bir rehberi sürüklerken çağrılır.
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu (getSmartSnapPoint'ten gelen)
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMoveGuide(snappedPos, unsnappedPos) {
    // CTRL ile kopyalama: İlk hareket anında kopyala
    if (state.guideCopyPending && state.originalGuideForCopy) {
        let copiedGuide = null;
        const originalGuide = state.originalGuideForCopy;
        const handle = state.copyHandleForGuide;

        // Rehber türüne göre kopyala
        if (originalGuide.subType === 'point') {
            copiedGuide = { type: 'guide', subType: 'point', x: originalGuide.x, y: originalGuide.y };
        } else if (originalGuide.subType === 'horizontal') {
            copiedGuide = { type: 'guide', subType: 'horizontal', y: originalGuide.y };
        } else if (originalGuide.subType === 'vertical') {
            copiedGuide = { type: 'guide', subType: 'vertical', x: originalGuide.x };
        } else if (originalGuide.subType === 'angular' || originalGuide.subType === 'free') {
            copiedGuide = {
                type: 'guide',
                subType: originalGuide.subType,
                p1: { x: originalGuide.p1.x, y: originalGuide.p1.y },
                p2: { x: originalGuide.p2.x, y: originalGuide.p2.y }
            };
        }

        // Kopyalanan rehberi state'e ekle
        if (copiedGuide) {
            if (!state.guides) state.guides = [];
            state.guides.push(copiedGuide);

            // Kopyalanan rehberi seç ve preDragNodeStates'i yeniden ayarla
            setState({
                selectedObject: { type: 'guide', object: copiedGuide, handle: handle }
            });

            // preDragNodeStates'i kopyalanan rehber için ayarla
            state.preDragNodeStates.clear();
            if (handle === 'p1' && copiedGuide.p1) {
                state.preDragNodeStates.set(copiedGuide.p1, { x: copiedGuide.p1.x, y: copiedGuide.p1.y });
            } else if (handle === 'p2' && copiedGuide.p2) {
                state.preDragNodeStates.set(copiedGuide.p2, { x: copiedGuide.p2.x, y: copiedGuide.p2.y });
            } else if (handle === 'body') {
                if (copiedGuide.subType === 'point' || copiedGuide.subType === 'vertical') {
                    state.preDragNodeStates.set(copiedGuide, { x: copiedGuide.x });
                }
                if (copiedGuide.subType === 'point' || copiedGuide.subType === 'horizontal') {
                    state.preDragNodeStates.set(copiedGuide, { ...state.preDragNodeStates.get(copiedGuide), y: copiedGuide.y });
                }
                if (copiedGuide.subType === 'free' || copiedGuide.subType === 'angular') {
                    state.preDragNodeStates.set(copiedGuide.p1, { x: copiedGuide.p1.x, y: copiedGuide.p1.y });
                    state.preDragNodeStates.set(copiedGuide.p2, { x: copiedGuide.p2.x, y: copiedGuide.p2.y });
                }
            }

            // Flag'i temizle
            state.guideCopyPending = false;
            state.originalGuideForCopy = null;
        }
    }

    const guide = state.selectedObject.object;
    const handle = state.selectedObject.handle;
    
    // getSmartSnapPoint'ten gelen snaplenmiş pozisyonu kullan
    // snap.js zaten mimari elemanlara kenetlemeyi yapıyor.
    const targetX = snappedPos.x;
    const targetY = snappedPos.y;
    
    // Offset'i snaplenmemiş pozisyona değil, snaplenmiş pozisyona uygula
    // (veya offset'i snaplenmemiş'e uygulayıp sonra tekrar snap'e mi zorlamalı?)
    // getSmartSnapPoint zaten en iyi snap'i veriyor, offset'e gerek yok.
    // Fare imlecinin olduğu yer (snaplenmiş) = yeni pozisyon olmalı.
    
    // Offset'i kullanarak hedefi bul
    const newX = unsnappedPos.x + state.dragOffset.x;
    const newY = unsnappedPos.y + state.dragOffset.y;
    
    // Snaplenmiş pozisyonu (snappedPos) hedef olarak kullan
    // Bu, noktanın mimari snap'lere kenetlenmesini sağlar.
    const finalX = snappedPos.x;
    const finalY = snappedPos.y;

    switch (guide.subType) {
        case 'point':
            if (handle === 'body') {
                guide.x = finalX;
                guide.y = finalY;
            }
            break;
        case 'horizontal':
            if (handle === 'body') {
                guide.y = finalY; // Sadece Y ekseninde hareket et
            }
            break;
        case 'vertical':
            if (handle === 'body') {
                guide.x = finalX; // Sadece X ekseninde hareket et
            }
            break;
        case 'free':
        case 'angular':
            if (handle === 'p1') {
                guide.p1.x = finalX;
                guide.p1.y = finalY;
            } else if (handle === 'p2') {
                guide.p2.x = finalX;
                guide.p2.y = finalY;
            } else if (handle === 'body') {
                // 'body' sürüklendiğinde tüm rehberi taşı
                const p1_orig = state.preDragNodeStates.get(guide.p1);
                const p2_orig = state.preDragNodeStates.get(guide.p2);
                
                // Offset'i snaplenmemiş pozisyona göre hesapla (daha pürüzsüz taşıma)
                const deltaX = unsnappedPos.x - state.initialDragPoint.x;
                const deltaY = unsnappedPos.y - state.initialDragPoint.y;

                guide.p1.x = p1_orig.x + deltaX;
                guide.p1.y = p1_orig.y + deltaY;
                guide.p2.x = p2_orig.x + deltaX;
                guide.p2.y = p2_orig.y + deltaY;
            }
            break;
    }
}