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
import { initObjectDefaults } from '../properties/properties-panel.js';
import { syncBirimState, seedSayacFromRooms } from '../../draw/draw-birim-labels.js';
import { getFloorAtElevation, switchToFloor } from '../../floor/floor-handler.js';
import { ensureFloorForElevation } from '../../floor/floor-panel.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';

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
        const dist = Math.hypot(
            baslangicNoktasi.x - cikisNoktasi.x,
            baslangicNoktasi.y - cikisNoktasi.y,
            (baslangicNoktasi.z || 0) - (cikisNoktasi.z || 0)
        );
        return dist < tolerance;
    });

    const problematicSayac = interactionManager.manager.components.find(c => {
        if (c.type !== 'sayac' || !c.cikisBagliBoruId) return false;
        const cikisNoktasi = c.getCikisNoktasi();
        if (!cikisNoktasi) return false;
        const dist = Math.hypot(
            baslangicNoktasi.x - cikisNoktasi.x,
            baslangicNoktasi.y - cikisNoktasi.y,
            (baslangicNoktasi.z || 0) - (cikisNoktasi.z || 0)
        );
        return dist < tolerance;
    });

    if (problematicServisKutusu) {
        console.warn('⚠️ Servis kutusundan sadece bir çıkış olabilir!');
        return;
    }

    if (problematicSayac) {
        console.warn('⚠️ Sayaçtan sadece bir çıkış olabilir!');
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

    // Ayrılan noktadaki kaynak borunun BASINÇ ve ÇAP bilgilerini yakala.
    // Yeni dal hattı, ayrıldığı noktanın özelliklerini miras alır
    // (örn. 300 mbar / DN40 bir hattın ortasından T açılırsa yeni hat da 300 mbar / DN40).
    let kaynakBasinc = null;
    let kaynakBoruCap = null;
    if (finalKaynakTip === BAGLANTI_TIPLERI.BORU && finalKaynakId) {
        const parentPipe = interactionManager.manager.pipes.find(p => p.id === finalKaynakId);
        if (parentPipe) {
            if (parentPipe.basinc != null) kaynakBasinc = parentPipe.basinc;
            if (parentPipe.boruCap) kaynakBoruCap = parentPipe.boruCap;
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
        kaynakColorGroup: kaynakColorGroup,
        kaynakBasinc: kaynakBasinc,
        kaynakBoruCap: kaynakBoruCap
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
    const distToP1 = Math.hypot(
        splitPoint.x - pipe.p1.x,
        splitPoint.y - pipe.p1.y,
        (splitPoint.z || 0) - (pipe.p1.z || 0)
    );
    const distToP2 = Math.hypot(
        splitPoint.x - pipe.p2.x,
        splitPoint.y - pipe.p2.y,
        (splitPoint.z || 0) - (pipe.p2.z || 0)
    );

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
    const valves = interactionManager.manager.components.filter(c => (c.type === 'vana' || c.type === 'regulator') && c.bagliBoruId === pipe.id);
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
    console.log('[SPLIT-DBG] splitAt result=', result ? { boru1: result.boru1?.id, boru2: result.boru2?.id } : null);
    if (!result) {
        console.warn('[SPLIT-DBG] splitAt returned null — onSegment check failed. point=', splitPoint, 'proj=', pipe.projectPoint(splitPoint));
        return;
    }
    const { boru1, boru2 } = result;

    // Bağlantı: boru1 (gelen) -> boru2 (giden)
    boru1.setBitisBaglanti('boru', boru2.id);
    boru2.setBaslangicBaglanti('boru', boru1.id);

    // Listeyi güncelle
    const idx = interactionManager.manager.pipes.findIndex(p => p.id === pipe.id);
    if (idx !== -1) interactionManager.manager.pipes.splice(idx, 1);
    interactionManager.manager.registerPipeNodes(boru1);
    interactionManager.manager.registerPipeNodes(boru2);
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

    // Parent / colorGroup zinciri sayaç/kutu açısından güncellenmiş
    // olsun (split sonrası çocuk dallar yeni parçaya bağlanmış olabilir).
    interactionManager.manager.recomputePipeParents();

    // Tüm boruların basıncını zincirden yeniden hesapla
    recomputeAllPressures(interactionManager.manager);

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
            const dist = Math.hypot(
                interactionManager.boruBaslangic.nokta.x - cikisNoktasi.x,
                interactionManager.boruBaslangic.nokta.y - cikisNoktasi.y,
                (interactionManager.boruBaslangic.nokta.z || 0) - (cikisNoktasi.z || 0)
            );
            return dist < tolerance;
        });
        // ...
        if (problematicServisKutusu) return;
    }
    // ...

    // Düğüm paylaşımı: başlangıç ve bitiş noktalarında mevcut düğüm varsa onu kullan.
    // Bu sayede borular ortak köşe noktasını paylaşır — tolerans taramasına gerek kalmaz.
    const mgr = interactionManager.manager;
    const startNode = mgr.getOrCreateNodeAt(
        interactionManager.boruBaslangic.nokta.x,
        interactionManager.boruBaslangic.nokta.y,
        interactionManager.boruBaslangic.nokta.z || 0
    );
    const endNode = mgr.getOrCreateNodeAt(point.x, point.y, point.z || 0);
    const boru = createBoru(startNode, endNode, 'STANDART');
    // Kat ataması: borunun başlangıç (p1) Z kotunun düştüğü katı kullan.
    // Dikey riser için bile başlangıç katı referans alınır (p2 üst katta olabilir).
    const startZ = boru.p1.z || 0;
    const endZ = boru.p2.z || 0;
    // Üst uç mevcut katlarını aşıyorsa otomatik üst kat oluştur
    ensureFloorForElevation(endZ);
    ensureFloorForElevation(startZ);
    const startFloor = getFloorAtElevation(startZ) || state.currentFloor;
    boru.floorId = startFloor?.id || null;
    boru.colorGroup = interactionManager.boruBaslangic.kaynakColorGroup || 'YELLOW';

    // Ayrılan noktadan basınç ve çap miras al — initObjectDefaults sadece undefined
    // alanları doldurduğundan, buradaki atama varsayılan DN25 ve boş basıncı override eder.
    if (interactionManager.boruBaslangic.kaynakBasinc != null) {
        boru.basinc = interactionManager.boruBaslangic.kaynakBasinc;
    }
    if (interactionManager.boruBaslangic.kaynakBoruCap) {
        boru.boruCap = interactionManager.boruBaslangic.kaynakBoruCap;
    }

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

    mgr.registerPipeNodes(boru);
    initObjectDefaults(boru, interactionManager.manager);
    interactionManager.manager.pipes.push(boru);

    // Boru zincire eklendi — kök kaynak (parent) ve colorGroup'u tüm
    // borular için yeniden türet. Sayaç'tan başlayan hat TURQUAZ, kutudan
    // başlayan hat YELLOW olur; sayaç yoksa default zaten YELLOW.
    interactionManager.manager.recomputePipeParents();

    // Boru birime ulaştıysa: sayaç boşsa mahallerden tohumla, sonra sayaç→oda yay
    seedSayacFromRooms();
    syncBirimState();

    // Üst/alt kata geçildiyse aktif katı otomatik değiştir — sonraki borular yeni katta çizilir
    const endFloor = getFloorAtElevation(endZ);
    if (endFloor && endFloor.id !== state.currentFloor?.id) {
        switchToFloor(endFloor.id);
    }

    interactionManager.manager.saveToState();

    interactionManager.boruBaslangic = {
        nokta: point,
        kaynakId: boru.id,
        kaynakTip: BAGLANTI_TIPLERI.BORU,
        kaynakColorGroup: boru.colorGroup,
        kaynakBasinc: boru.basinc != null ? boru.basinc : null,
        kaynakBoruCap: boru.boruCap || null
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

        // DÜZELTİLDİ: Düşey modda SADECE Z ekseni değişmeli, X-Y sabit kalmalı
        const startPt = interactionManager.boruBaslangic.nokta;
        const startZ = startPt.z || 0;

        // Hedef nokta: X ve Y aynı, sadece Z değişir
        const targetPt = {
            x: startPt.x,
            y: startPt.y,
            z: startZ + height
        };

        handleBoruClick(interactionManager, targetPt);
        interactionManager.measurementInput = '';
        interactionManager.measurementActive = false;
        interactionManager.isVerticalMeasurement = false;
        return;
    }

    // Normal ölçüm (3D - X, Y, Z fark etmez)
    const measurement = parseFloat(interactionManager.measurementInput);
    if (isNaN(measurement) || measurement <= 0) {
        interactionManager.measurementInput = '';
        interactionManager.measurementActive = false;
        return;
    }
    const startPt = interactionManager.boruBaslangic.nokta;
    const startZ = startPt.z || 0;

    let targetPoint = interactionManager.geciciBoruBitis;
    if (!targetPoint) {
        // Fare hiç hareket etmediyse X+ yönünde ekle (varsayılan)
        targetPoint = {
            x: startPt.x + measurement,
            y: startPt.y,
            z: startZ
        };
    } else {
        // 3D vektör hesaplama - Mouse'un baktığı yöne göre
        const dx = targetPoint.x - startPt.x;
        const dy = targetPoint.y - startPt.y;
        // z undefined ise (2D modda screenToWorld z döndürmez) z değişimi yok demektir
        const dz = (targetPoint.z !== undefined ? targetPoint.z : startZ) - startZ;

        // 3D uzunluk hesapla (X, Y, Z dahil)
        const currentLength = Math.hypot(dx, dy, dz);

        if (currentLength > 0.001) {
            // Yönü normalize et ve ölçüm uzunluğu kadar çarp
            const factor = measurement / currentLength;
            targetPoint = {
                x: startPt.x + dx * factor,
                y: startPt.y + dy * factor,
                z: startZ + dz * factor
            };
        } else {
            // Yön yoksa X+ varsay
            targetPoint = {
                x: startPt.x + measurement,
                y: startPt.y,
                z: startZ
            };
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
    interactionManager.pipeResizeInput = '';
    interactionManager.pipeResizeActive = false;
    if (interactionManager.manager.tempComponent) interactionManager.manager.tempComponent = null;
    interactionManager.manager.activeTool = null;
    interactionManager.meterPlacementState = null;
    interactionManager.meterStartPoint = null;
    interactionManager.meterPreviewEndPoint = null;
    // Kes/Kopyala durumunu temizle
    interactionManager.cutPipes = null;
    interactionManager.cutPipesOriginalIds = null;
    interactionManager.copiedPipes = null;
    interactionManager.pasteSnapPoint = null;
    // V→B/V→Y chord context'i de temizle (ESC/diğer iptaller chord'u öldürür)
    interactionManager._vanaChordContext = null;
    // K/O double-press timer'ı da temizle — bekleyen tek-tuş aksiyonu kalmasın.
    if (interactionManager._doubleKeyTimer) {
        clearTimeout(interactionManager._doubleKeyTimer);
        interactionManager._doubleKeyTimer = null;
        interactionManager._doubleKeyChar = null;
    }
    interactionManager.deselectObject();
}

export function hasServisKutusu(interactionManager) {
    return interactionManager.manager.components.some(c => c.type === 'servis_kutusu');
}

export function getGeciciBoruCizgisi(interactionManager) {
    if (!interactionManager.boruCizimAktif || !interactionManager.boruBaslangic || !interactionManager.geciciBoruBitis) return null;
    return { p1: interactionManager.boruBaslangic.nokta, p2: interactionManager.geciciBoruBitis };
}
/**
 * 3D Snap Hesaplama (Eksen Kilitleme)
 * X, Y ve Z eksenlerine akıllı kilitleme yapar.
 */
export function calculate3DSnap(interactionManager, mouseWorldPoint, isShiftPressed) {
    if (!interactionManager.boruCizimAktif || !interactionManager.boruBaslangic) {
        interactionManager.axisSnapMode = null;
        return mouseWorldPoint;
    }

    // 3D modunda değilsek (t < 0.5) işlem yapma
    const t = state.viewBlendFactor || 0;
    if (t < 0.5) {
        interactionManager.axisSnapMode = null;
        return mouseWorldPoint;
    }

    const startPt = interactionManager.boruBaslangic.nokta;
    // Z değerini sayısal olarak garantiye al
    const startZ = parseFloat(startPt.z || 0);

    // Başlangıç noktasının ekrandaki izdüşümü (Screen Coordinates)
    // x' = x + z*t, y' = y - z*t formülü
    const screenStartX = startPt.x + startZ * t;
    const screenStartY = startPt.y - startZ * t;

    // Mouse'un ekrandaki konumu
    const mouseX = mouseWorldPoint.x;
    const mouseY = mouseWorldPoint.y;

    // Başlangıç noktasına göre mouse farkı (Delta)
    const dx = mouseX - screenStartX;
    const dy = mouseY - screenStartY;

    let snappedPoint = { ...mouseWorldPoint, z: startZ };

    // --- EKSEN SEÇİMİ ---
    // Hangi eksene daha yakın olduğumuzu bulalım.

    // X Ekseni (y=0 doğrusu): Ekranda yatay. Uzaklık = |dy|
    const distX = Math.abs(dy);

    // Y Ekseni (x=0 doğrusu): Ekranda dikey. Uzaklık = |dx|
    const distY = Math.abs(dx);

    // Z Ekseni (y = -x doğrusu): Ekranda 45 derece çapraz.
    // Vektör (t, -t). Normali (t, t). Projeksiyon formülü ile uzaklık: |dx + dy| / sqrt(2)
    const distZ = Math.abs(dx + dy) / 1.414; // sqrt(2) yaklaşık değeri

    // En yakın ekseni belirle
    let bestAxis = 'X';
    let minDiff = distX;

    if (distY < minDiff) {
        bestAxis = 'Y';
        minDiff = distY;
    }

    // Z eksenini de adaylara ekle (Otomatik Z algılama)
    // Görsel olarak Z yönüne hareket ediliyorsa Shift'e gerek kalmadan algılar
    if (distZ < minDiff) {
        bestAxis = 'Z';
        minDiff = distZ;
    }

    // SHIFT basılıysa Z eksenini zorla (Kullanıcı manuel override yapabilir)
    if (isShiftPressed) {
        bestAxis = 'Z';
    }

    interactionManager.axisSnapMode = bestAxis;

    // --- KOORDİNAT HESAPLAMA ---
    if (bestAxis === 'X') {
        // X KİLİDİ: Y ve Z sabit kalır, sadece X değişir.
        // Mouse'un X koordinatından Z etkisini çıkararak ham X'i buluyoruz.
        // Formül: screenX = worldX + worldZ*t  => worldX = screenX - worldZ*t
        snappedPoint = {
            x: mouseX - (startZ * t),
            y: startPt.y,
            z: startZ
        };
    }
    else if (bestAxis === 'Y') {
        // Y KİLİDİ: X ve Z sabit kalır, sadece Y değişir.
        // Formül: screenY = worldY - worldZ*t => worldY = screenY + worldZ*t
        snappedPoint = {
            x: startPt.x,
            y: mouseY + (startZ * t),
            z: startZ
        };
    }
    else { // bestAxis === 'Z'
        // Z KİLİDİ: X ve Y sabit kalır, sadece Z değişir.
        // Z eksenindeki hareket ekranda (dx, dy) = (dz*t, -dz*t) yaratır.
        // En iyi dz tahmini için dx ve dy değişimlerinin ortalamasını alıyoruz.
        // dz = (dx - dy) / (2*t)

        // Sıçramayı önlemek için 't' kontrolü (zaten t >= 0.5 şartı var ama yine de)
        const safeT = Math.max(0.1, t);
        const deltaZ = (dx - dy) / (2 * safeT);

        snappedPoint = {
            x: startPt.x,
            y: startPt.y,
            z: startZ + deltaZ
        };
    }

    // Geçici boru bitişini güncelle (Renderer için)
    interactionManager.geciciBoruBitis = snappedPoint;

    return snappedPoint;
}