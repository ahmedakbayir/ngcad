/**
 * Pipe Drawing Handler
 * Boru çizim işlemlerini yönetir
 */

import { createBoru, BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { createVana } from '../objects/valve.js';
import { saveState } from '../../general-files/history.js';
import { setMode } from '../../general-files/main.js';
import { getObjectsOnPipe, canPlaceValveOnPipe } from './placement-utils.js';
import { state } from '../../general-files/main.js';
import { isProtectedPoint } from './drag-handler.js';

/**
 * Boru çizim modunu başlat
 */
export function startBoruCizim(interactionManager, baslangicNoktasi, kaynakId = null, kaynakTip = null, colorGroup = null) {
    // ⚠️ SADECE 1 HAT KURALI: Başlangıç noktası kullanılmış bir servis kutusu/sayaç çıkışına yakın mı?
    const tolerance = 10;
    const problematicServisKutusu = interactionManager.manager.components.find(c => {
        if (c.type !== 'servis_kutusu' || !c.bagliBoruId) return false;
        const cikisNoktasi = c.getCikisNoktasi();
        if (!cikisNoktasi) return false;
        const dist = Math.hypot(baslangicNoktasi.x - cikisNoktasi.x, baslangicNoktasi.y - cikisNoktasi.y);
        return dist < tolerance;
    });

    const problematicSayac = interactionManager.manager.components.find(c => {
        if (c.type !== 'sayac' || !c.cikisBagliBoruId) return false;
        const cikisNoktasi = c.getCikisNoktasi();
        if (!cikisNoktasi) return false;
        const dist = Math.hypot(baslangicNoktasi.x - cikisNoktasi.x, baslangicNoktasi.y - cikisNoktasi.y);
        return dist < tolerance;
    });

    if (problematicServisKutusu || problematicSayac) {
        return; 
    }

    // ✨✨✨ GELİŞMİŞ PARENT SEÇİMİ (SMART PARENT SELECTION) ✨✨✨
    // Eğer kaynak bir boruysa, o noktada BİTEN (Akışın geldiği) başka bir boru var mı diye kontrol et.
    // Çünkü T-bağlantı her zaman "Gelen Hattan" (Upstream) alınmalıdır.
    // Mevcut seçim "Giden Hat" (Downstream) olabilir, bunu düzeltmeliyiz.
    
    let finalKaynakId = kaynakId;
    let finalKaynakTip = kaynakTip;

    if (kaynakTip === BAGLANTI_TIPLERI.BORU && kaynakId) {
        // O noktadaki (tolerance dahilinde) tüm boru uçlarını bul
        const CHECK_RADIUS = 2.0; // cm
        const currentPipe = interactionManager.manager.pipes.find(p => p.id === kaynakId);
        
        if (currentPipe) {
            // Tıklanan noktanın mevcut borunun BAŞLANGICI (P1) olup olmadığını kontrol et
            // Eğer P1 ise, bu boru buradan "başlıyordur" (Child).
            // Biz burada "biten" (Parent) bir boru arıyoruz.
            const distToP1 = Math.hypot(
                baslangicNoktasi.x - currentPipe.p1.x,
                baslangicNoktasi.y - currentPipe.p1.y,
                (baslangicNoktasi.z || 0) - (currentPipe.p1.z || 0)
            );

            if (distToP1 < CHECK_RADIUS) {
                // Evet, seçili borunun başlangıç noktasındayız.
                // Acaba bu noktada BİTEN (P2'si burası olan) başka bir boru var mı?
                const potentialParent = interactionManager.manager.pipes.find(p => {
                    if (p.id === kaynakId) return false; // Kendisi hariç
                    const distToP2 = Math.hypot(
                        baslangicNoktasi.x - p.p2.x,
                        baslangicNoktasi.y - p.p2.y,
                        (baslangicNoktasi.z || 0) - (p.p2.z || 0)
                    );
                    return distToP2 < CHECK_RADIUS;
                });

                if (potentialParent) {
                    // console.log(`🔄 Hiyerarşi Düzeltmesi: ${currentPipe.id} yerine ${potentialParent.id} (Parent) seçildi.`);
                    finalKaynakId = potentialParent.id;
                    // Kaynak tipi zaten 'boru'
                }
            }
        }
    }
    // ✨✨✨ SON ✨✨✨


    // Kaynak borunun renk grubunu belirle
    let kaynakColorGroup = 'YELLOW'; 

    if (colorGroup) {
        kaynakColorGroup = colorGroup;
    } else if (finalKaynakId && finalKaynakTip) {
        if (interactionManager.hasAncestorMeter(finalKaynakId, finalKaynakTip)) {
            kaynakColorGroup = 'TURQUAZ'; 
        } else {
            kaynakColorGroup = 'YELLOW';
        }
    }

    // Kaynak boru varsa cihaz/sayaç engelleme kontrolü
    if (finalKaynakTip === BAGLANTI_TIPLERI.BORU && finalKaynakId) {
        const kaynakBoru = interactionManager.manager.pipes.find(p => p.id === finalKaynakId);
        if (kaynakBoru) {
            let hedefUc = null;
            if (Math.hypot(baslangicNoktasi.x - kaynakBoru.p1.x, baslangicNoktasi.y - kaynakBoru.p1.y) < 1) {
                hedefUc = 'p1';
            } else if (Math.hypot(baslangicNoktasi.x - kaynakBoru.p2.x, baslangicNoktasi.y - kaynakBoru.p2.y) < 1) {
                hedefUc = 'p2';
            }

            if (hedefUc) {
                const cihazVar = interactionManager.hasDeviceAtEndpoint(finalKaynakId, hedefUc);
                const sayacVar = interactionManager.hasMeterAtEndpoint(finalKaynakId, hedefUc);

                if (cihazVar || sayacVar) {
                    return;
                }
            }
        }
    }

    interactionManager.boruCizimAktif = true;
    interactionManager.boruBaslangic = {
        nokta: baslangicNoktasi,
        kaynakId: finalKaynakId,
        kaynakTip: finalKaynakTip || BAGLANTI_TIPLERI.SERVIS_KUTUSU,
        kaynakColorGroup: kaynakColorGroup 
    };
    interactionManager.snapSystem.setStartPoint(baslangicNoktasi);
    interactionManager.manager.activeTool = 'boru';
}

/**
 * Boruyu belirtilen noktadan böl ve çizime devam et
 */
export function handlePipeSplit(interactionManager, pipe, splitPoint, startDrawing = true) {
    // 1. Köşe kontrolü
    const CORNER_THRESHOLD = 0.1;
    const distToP1 = Math.hypot(splitPoint.x - pipe.p1.x, splitPoint.y - pipe.p1.y);
    const distToP2 = Math.hypot(splitPoint.x - pipe.p2.x, splitPoint.y - pipe.p2.y);

    if (distToP1 < CORNER_THRESHOLD) {
        if (startDrawing) startBoruCizim(interactionManager, pipe.p1, pipe.id, BAGLANTI_TIPLERI.BORU);
        interactionManager.pipeSplitPreview = null;
        return;
    }
    if (distToP2 < CORNER_THRESHOLD) {
        if (startDrawing) startBoruCizim(interactionManager, pipe.p2, pipe.id, BAGLANTI_TIPLERI.BORU);
        interactionManager.pipeSplitPreview = null;
        return;
    }

    // --- SNAPSHOT ALMA (Vana, Fleks vs.) ---
    const itemsToReattach = [];
    const valves = interactionManager.manager.components.filter(c => c.type === 'vana' && c.bagliBoruId === pipe.id);
    valves.forEach(v => {
        const pos = (pipe.getVanaPozisyon && pipe.getVanaPozisyon()) || pipe.getPointAt(v.boruPozisyonu !== undefined ? v.boruPozisyonu : 0.5);
        itemsToReattach.push({ comp: v, type: 'vana', worldPos: { x: pos.x, y: pos.y } });
    });

    const flexComponents = interactionManager.manager.components.filter(c => (c.type === 'cihaz' || c.type === 'sayac') && c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id);
    flexComponents.forEach(c => {
        let pos;
        if (c.fleksBaglanti.endpoint === 'p1') pos = pipe.p1;
        else if (c.fleksBaglanti.endpoint === 'p2') pos = pipe.p2;
        else {
            const d1 = Math.hypot(c.x - pipe.p1.x, c.y - pipe.p1.y);
            const d2 = Math.hypot(c.x - pipe.p2.x, c.y - pipe.p2.y);
            pos = d1 < d2 ? pipe.p1 : pipe.p2;
        }
        itemsToReattach.push({ comp: c, type: 'fleks', worldPos: { x: pos.x, y: pos.y } });
    });

    saveState();

    // --- BÖLME ---
    const result = pipe.splitAt(splitPoint);
    if (!result) return;
    const { boru1, boru2 } = result;

    // Bağlantı: boru1 (gelen) -> boru2 (giden)
    boru1.setBitisBaglanti('boru', boru2.id);
    boru2.setBaslangicBaglanti('boru', boru1.id);

    // Listeyi güncelle
    const idx = interactionManager.manager.pipes.findIndex(p => p.id === pipe.id);
    if (idx !== -1) interactionManager.manager.pipes.splice(idx, 1);
    interactionManager.manager.pipes.push(boru1, boru2);

    // --- ÇOCUKLARI KURTARMA (ÖNEMLİ!) ---
    // Silinen boruya bağlı diğer boruları, uygun yeni parçaya bağla
    interactionManager.manager.pipes.forEach(childPipe => {
        if (childPipe.baslangicBaglanti && childPipe.baslangicBaglanti.tip === 'boru' && childPipe.baslangicBaglanti.hedefId === pipe.id) {
            // Hangisine daha yakın? (3D mesafe ile)
            const d1 = Math.hypot(
                childPipe.p1.x - boru1.p2.x,
                childPipe.p1.y - boru1.p2.y,
                (childPipe.p1.z || 0) - (boru1.p2.z || 0)
            ); // boru1 sonuna
            const d2 = Math.hypot(
                childPipe.p1.x - boru2.p1.x,
                childPipe.p1.y - boru2.p1.y,
                (childPipe.p1.z || 0) - (boru2.p1.z || 0)
            ); // boru2 başına

            // Eğer boru1'in üzerine denk geliyorsa
            const proj1 = boru1.projectPoint(childPipe.p1);
            const proj2 = boru2.projectPoint(childPipe.p1);

            if (proj1.distance < proj2.distance) {
                 childPipe.baslangicBaglanti.hedefId = boru1.id;
            } else {
                 childPipe.baslangicBaglanti.hedefId = boru2.id;
            }
        }
    });

    // Kutu/Sayaç bağlantılarını taşı (ilk parçaya)
    if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
        const sk = interactionManager.manager.components.find(c => c.id === pipe.baslangicBaglanti.hedefId);
        if (sk && sk.bagliBoruId === pipe.id) {
            sk.bagliBoruId = boru1.id;
            const cikis = sk.getCikisNoktasi();
            boru1.p1.x = cikis.x; boru1.p1.y = cikis.y;
        }
    }
    if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
        const meter = interactionManager.manager.components.find(c => c.id === pipe.baslangicBaglanti.hedefId);
        if (meter && meter.cikisBagliBoruId === pipe.id) {
            meter.cikisBagliBoruId = boru1.id;
            const cikis = meter.getCikisNoktasi();
            boru1.p1.x = cikis.x; boru1.p1.y = cikis.y;
        }
    }

    // Bileşenleri yerleştir
    itemsToReattach.forEach(item => {
        const { comp, type, worldPos } = item;
        const proj1 = boru1.projectPoint(worldPos);
        const proj2 = boru2.projectPoint(worldPos);
        let targetPipe = (proj1.distance < proj2.distance - 0.001) ? boru1 : boru2;
        let targetProj = (targetPipe === boru1) ? proj1 : proj2;

        if (type === 'vana') {
            comp.bagliBoruId = targetPipe.id;
            comp.boruPozisyonu = targetProj.t;
            if (comp.updatePositionFromPipe) comp.updatePositionFromPipe(targetPipe);
        } else if (type === 'fleks') {
            comp.fleksBaglanti.boruId = targetPipe.id;
            const dP1 = Math.hypot(worldPos.x - targetPipe.p1.x, worldPos.y - targetPipe.p1.y);
            const dP2 = Math.hypot(worldPos.x - targetPipe.p2.x, worldPos.y - targetPipe.p2.y);
            comp.fleksBaglanti.endpoint = dP1 < dP2 ? 'p1' : 'p2';
        }
    });

    interactionManager.manager.saveToState();

    // --- TE BAĞLANTISI (UPSTREAM PARÇAYA) ---
    // Yeni çizilen hat, akışın geldiği parçaya (boru1) bağlanmalı.
    if (startDrawing) {
        startBoruCizim(interactionManager, splitPoint, boru1.id, BAGLANTI_TIPLERI.BORU);
    }
    interactionManager.pipeSplitPreview = null;
}

// ... handleBoruClick, applyMeasurement, cancelCurrentAction vb. (değişmedi) ...
export function handleBoruClick(interactionManager, point) {
    if (!interactionManager.boruBaslangic) return;

    // Dikey boru kontrolü (aynı x,y, farklı z)
    const isVerticalPipe = (
        Math.abs(point.x - interactionManager.boruBaslangic.nokta.x) < 0.1 &&
        Math.abs(point.y - interactionManager.boruBaslangic.nokta.y) < 0.1 &&
        Math.abs((point.z || 0) - (interactionManager.boruBaslangic.nokta.z || 0)) > 0.1
    );

    // Dikey boru değilse normal koruma kontrolü
    if (!isVerticalPipe && isProtectedPoint(point, interactionManager.manager, null, null, null, false)) {
        return;
    }

    // ... Kalan kod aynı ...
    // NOT: handleBoruClick içinde değişiklik gerekmez, çünkü kaynakId zaten startBoruCizim ile doğru set edildi.

    // Sadece referans olması için (Dosyanın geri kalanı aynı)
    // Dikey boru değilse servis kutusu kontrolü
    if (!isVerticalPipe) {
        const tolerance = 10;
        const problematicServisKutusu = interactionManager.manager.components.find(c => {
            if (c.type !== 'servis_kutusu' || !c.bagliBoruId) return false;
            const cikisNoktasi = c.getCikisNoktasi();
            if (!cikisNoktasi) return false;
            const dist = Math.hypot(interactionManager.boruBaslangic.nokta.x - cikisNoktasi.x,
                                    interactionManager.boruBaslangic.nokta.y - cikisNoktasi.y);
            return dist < tolerance;
        });
        // ...
        if (problematicServisKutusu) return;
    }
    // ...

    console.log('🔧 createBoru çağrılıyor:', { p1: interactionManager.boruBaslangic.nokta, p2: point });
    const boru = createBoru(interactionManager.boruBaslangic.nokta, point, 'STANDART');
    boru.floorId = state.currentFloorId;
    boru.colorGroup = interactionManager.boruBaslangic.kaynakColorGroup || 'YELLOW';

    if (interactionManager.boruBaslangic.kaynakId) {
        boru.setBaslangicBaglanti(
            interactionManager.boruBaslangic.kaynakTip,
            interactionManager.boruBaslangic.kaynakId
        );
        // ... bağlantı kodları ...
        if (interactionManager.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
             const servisKutusu = interactionManager.manager.components.find(c => c.id === interactionManager.boruBaslangic.kaynakId);
             if (servisKutusu) servisKutusu.baglaBoru(boru.id);
        }
        if (interactionManager.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
             const sayac = interactionManager.manager.components.find(c => c.id === interactionManager.boruBaslangic.kaynakId);
             if (sayac) sayac.baglaCikis(boru.id);
        }
    }

    interactionManager.manager.pipes.push(boru);

    if (interactionManager.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
        const sayac = interactionManager.manager.components.find(c => c.id === interactionManager.boruBaslangic.kaynakId);
        if (sayac) interactionManager.manager.updatePipeColorsAfterMeter(sayac.id);
    }

    interactionManager.manager.saveToState();

    interactionManager.boruBaslangic = {
        nokta: point,
        kaynakId: boru.id,
        kaynakTip: BAGLANTI_TIPLERI.BORU,
        kaynakColorGroup: boru.colorGroup 
    };
    interactionManager.snapSystem.setStartPoint(point);

    saveState();

}

// ... Diğer fonksiyonlar (applyMeasurement, cancelCurrentAction vb.) olduğu gibi kalabilir ...
export function applyMeasurement(interactionManager) {
    // ... existing code ...
    if (!interactionManager.boruBaslangic) return;

    // Düşey ölçüm kontrolü (+/- ile başlıyorsa)
    if (interactionManager.isVerticalMeasurement) {
        const height = parseFloat(interactionManager.measurementInput);
        if (isNaN(height) || height === 0) {
            interactionManager.measurementInput = '';
            interactionManager.measurementActive = false;
            interactionManager.isVerticalMeasurement = false;
            return;
        }

        // Düşey boru oluştur
        const startPoint = interactionManager.boruBaslangic.nokta;
        const endPoint = {
            x: startPoint.x,
            y: startPoint.y,
            z: (startPoint.z || 0) + height
        };

        handleBoruClick(interactionManager, endPoint);
        interactionManager.measurementInput = '';
        interactionManager.measurementActive = false;
        interactionManager.isVerticalMeasurement = false;
        return;
    }

    // Normal yatay ölçüm
    const measurement = parseFloat(interactionManager.measurementInput);
    if (isNaN(measurement) || measurement <= 0) {
        interactionManager.measurementInput = '';
        interactionManager.measurementActive = false;
        return;
    }
    let targetPoint = interactionManager.geciciBoruBitis;
    if (!targetPoint) {
        targetPoint = { x: interactionManager.boruBaslangic.nokta.x + measurement, y: interactionManager.boruBaslangic.nokta.y };
    } else {
        const dx = targetPoint.x - interactionManager.boruBaslangic.nokta.x;
        const dy = targetPoint.y - interactionManager.boruBaslangic.nokta.y;
        const currentLength = Math.hypot(dx, dy);
        if (currentLength > 0.1) {
            const dirX = dx / currentLength;
            const dirY = dy / currentLength;
            targetPoint = { x: interactionManager.boruBaslangic.nokta.x + dirX * measurement, y: interactionManager.boruBaslangic.nokta.y + dirY * measurement };
        } else {
             targetPoint = { x: interactionManager.boruBaslangic.nokta.x + measurement, y: interactionManager.boruBaslangic.nokta.y };
        }
    }
    handleBoruClick(interactionManager, targetPoint);
    interactionManager.measurementInput = '';
    interactionManager.measurementActive = false;
}

export function cancelCurrentAction(interactionManager) {
     // ... existing code ...
    if (interactionManager.boruCizimAktif) {
        interactionManager.boruCizimAktif = false;
        interactionManager.boruBaslangic = null;
        interactionManager.geciciBoruBitis = null;
        interactionManager.snapSystem.clearStartPoint();
    }
    interactionManager.measurementInput = '';
    interactionManager.measurementActive = false;
    if (interactionManager.manager.tempComponent) interactionManager.manager.tempComponent = null;
    interactionManager.manager.activeTool = null;
    interactionManager.meterPlacementState = null;
    interactionManager.meterStartPoint = null;
    interactionManager.meterPreviewEndPoint = null;
    interactionManager.deselectObject();
}

export function hasServisKutusu(interactionManager) {
    return interactionManager.manager.components.some(c => c.type === 'servis_kutusu');
}

export function getGeciciBoruCizgisi(interactionManager) {
    if (!interactionManager.boruCizimAktif || !interactionManager.boruBaslangic || !interactionManager.geciciBoruBitis) return null;
    return { p1: interactionManager.boruBaslangic.nokta, p2: interactionManager.geciciBoruBitis };
}