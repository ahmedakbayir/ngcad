/**
 * Component Placement Handler
 * Bileşen yerleştirme işlemlerini yönetir
 */

import { setMode, setDrawingMode, dom, state, setState } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { BAGLANTI_TIPLERI, createBoru } from '../objects/pipe.js';
import { createSayac } from '../objects/meter.js';
import { createVana } from '../objects/valve.js';
import { createBaca } from '../objects/chimney.js';
import { canPlaceValveOnPipe, getObjectsOnPipe } from './placement-utils.js';
import { TESISAT_MODLARI } from './interaction-manager.js';

/**
 * Bileşeni yerleştir
 */
export function placeComponent(point) {
    if (!this.manager.tempComponent) return;
    const component = this.manager.tempComponent;
    const prevMode = this.previousMode;
    const prevDrawMode = this.previousDrawingMode;
    const prevTool = this.previousActiveTool;

    switch (component.type) {
        case 'servis_kutusu':
            // ... (Mevcut kod) ...
            saveState();
            this.manager.components.push(component);
            this.startBoruCizim(component.getCikisNoktasi(), component.id);
            this.manager.activeTool = 'boru';
            setMode("plumbingV2", true);
            break;

        case 'sayac':
            // Eğer ghost bağlantısı varsa (boru ucuna snap olmuşsa), normal sayaç ekleme
            if (component.ghostConnectionInfo && component.ghostConnectionInfo.boruUcu) {
                saveState();
                const successSayac = this.handleSayacEndPlacement(component);
                if (successSayac) {
                    // Sayacın çıkış noktasından boru çizimi başlat
                    const cikisNoktasi = component.getCikisNoktasi();
                    this.startBoruCizim(cikisNoktasi, component.id, BAGLANTI_TIPLERI.SAYAC);
                    // Sayaç eklendikten sonra boru çizme modunda kal (icon doğru görünsün)
                    this.manager.activeTool = 'boru';
                    setMode("plumbingV2", true);
                }
            }
            // Eğer ghost bağlantısı yoksa VE servis kutusu yoksa (İÇ TESİSAT modu)
            else if (!this.hasServisKutusu()) {
                // İÇ TESİSAT MODU: 2 nokta ile kesikli boru + sayaç ekleme
                // İlk tıklama: Kesikli borunun başlangıç noktası
                saveState();

                this.meterPlacementState = 'drawing_start_pipe';
                this.meterStartPoint = { x: point.x, y: point.y };
                // tempComponent'i TUTUYORUZ - mevcut ghost sistemi kullanacak

                // console.log('✅ İÇ TESİSAT: Kesikli boru başlangıç noktası belirlendi. İkinci nokta için tıklayın.');
            }
            // Eğer ghost bağlantısı yoksa VE servis kutusu varsa, uyarı ver
            else {
                // console.warn('⚠️ Sayaç sadece boru ucuna eklenebilir!');
                // alert('⚠️ Sayaç sadece boru ucuna eklenebilir!\n\nLütfen sayacı bir boru ucuna yerleştirin.');
            }
            break;

        case 'vana':
            if (this.vanaPreview) {
                this.handleVanaPlacement(this.vanaPreview);
                return;
            }
            // Vana pozisyonunu tıklanan noktaya ayarla (tempComponent başta 0,0'da oluşturuluyor)
            component.x = point.x;
            component.y = point.y;
            saveState();
            this.manager.components.push(component);
            break;

        case 'cihaz':
            // Cihaz ekleme - Seç moduna geç
            const successCihaz = this.handleCihazEkleme(component);
            if (successCihaz) {
                // Cihaz eklendikten sonra seç moduna geç
                setMode("select", true);
                // if (this.previousMode) {
                //     console.log(`[MODE] Cihaz eklendi, önceki moda dönülüyor: ${this.previousMode}`);
                //     setTimeout(() => {
                //         if (this.previousDrawingMode) {
                //             console.log(`[MODE] Drawing mode restore: ${this.previousDrawingMode}`);
                //             setDrawingMode(this.previousDrawingMode);
                //         }
                //         console.log(`[MODE] Mode restore: ${this.previousMode}`);
                //         setMode(this.previousMode);

                //         // activeTool'u kaydettiğimiz önceki değere geri yükle
                //         console.log(`[MODE] ActiveTool restore: ${this.previousActiveTool}`);
                //         this.manager.activeTool = this.previousActiveTool;

                //         this.previousMode = null;
                //         this.previousDrawingMode = null;
                //         this.previousActiveTool = null;
                //     }, 10);
                // } else {
                //     // Önceki mod yoksa, normal boru çizme moduna geç
                //     this.manager.activeTool = 'boru';
                //     setMode("plumbingV2", true);
                // }
            }
            break;

        case 'baca':
            // Baca ekleme - sadece cihaz üzerinde
            if (component.ghostSnapCihaz) {
                // İlk tıklama: Baca yerleştir ve çizim moduna geç
                if (!component.parentCihazId) {
                    // VALIDASYON: Bir cihaza max 1 baca
                    const existingBaca = this.manager.components.find(c =>
                        c.type === 'baca' && c.parentCihazId === component.ghostSnapCihazId
                    );
                    if (existingBaca) {
                        console.warn('⚠️ Bu cihaza zaten baca eklenmiş! Bir cihaza maksimum 1 baca eklenebilir.');
                        // Ghost'ı temizle ve moddan çık
                        this.manager.tempComponent = null;
                        this.manager.activeTool = null;
                        return;
                    }

                    saveState();
                    component.parentCihazId = component.ghostSnapCihazId;
                    this.manager.components.push(component);
                    this.manager.saveToState();
                    // tempComponent'i tutuyoruz - çizim devam edecek
                    // Fonksiyon sonundaki tempComponent = null'u atlamak için return
                    return;
                }
                // Sonraki tıklamalar: Segment ekle
                else if (component.isDrawing) {
                    saveState();
                    const success = component.addSegment(point.x, point.y);
                    if (success) {
                        this.manager.saveToState();
                        // tempComponent'i tutuyoruz - çizim devam edecek
                        return;
                    } else {
                        // Minimum uzunluk yok, uyarı ver
                        console.warn('⚠️ Segment çok kısa! En az 10cm olmalı.');
                        return;
                    }
                }
            } else {
                // Cihaz yoksa - ghost görünmez olduğu için buraya gelmemeli
                console.warn('⚠️ Baca sadece cihaz üzerine eklenebilir!');
            }
            break;

        default:
            saveState();
            this.manager.components.push(component);
            break;
    }

    this.manager.tempComponent = null;
    //if (!this.boruCizimAktif) this.manager.activeTool = null;
    this.manager.saveToState();
}

/**
 * İşlem tamamlandıktan sonra önceki modu geri yükleyen yardımcı fonksiyon
 */
export function restorePreviousMode(prevMode, prevDrawMode, prevTool) {
    const targetMode = prevMode || "select";
    const targetDrawMode = prevDrawMode || "KARMA";
    const targetTool = prevTool;

    setTimeout(() => {
        // 1. Çizim modunu (MİMARİ/TESİSAT) geri yükle
        setDrawingMode(targetDrawMode);

        // 2. Ana etkileşim modunu (select/plumbingV2) zorlayarak geri yükle
        setMode(targetMode, true);

        // 3. Tesisat aracını ikon seviyesinde aktif et
        this.manager.activeTool = targetTool;

        // 4. Eğer boru moduna dönüldüyse, çizimi sıfırla ama modu koru
        if (targetTool === 'boru') {
            this.boruCizimAktif = false;
            this.boruBaslangic = null;
        }

        // 5. UI ikonunun mavi yanması için setMode içindeki mantığı manuel tetikle
        if (targetMode === "plumbingV2") {
            const activeTool = targetTool;
            dom.bBoru.classList.toggle("active", activeTool === 'boru');
            // Diğer tesisat butonlarını da burada senkronize edebilirsiniz
        }

        this.previousMode = null;
        this.previousDrawingMode = null;
        this.previousActiveTool = null;
    }, 50); // Zamanlamayı biraz artırmak UI çakışmalarını önler
}

/**
 * Vana yerleştir - YENİ STRATEJI
 * Vana boruyu bölmez, boru üzerinde serbest kayabilir bir nesne olarak eklenir
 */
export function handleVanaPlacement(vanaPreview) {
    const { pipe, point } = vanaPreview;

    // Undo için state kaydet
    saveState();

    // Boru üzerindeki mevcut nesneleri al
    const existingObjects = getObjectsOnPipe(this.manager.components, pipe.id);

    // Yerleştirme kontrolü yap
    const placementResult = canPlaceValveOnPipe(pipe, point, existingObjects);

    if (!placementResult || placementResult.error) {
        // Hata durumu - mesaj göster
        //alert(placementResult?.message || 'Vana eklenemedi!');
        this.vanaPreview = null;
        return;
    }

    const { t, x, y, adjusted } = placementResult;

    // Kullanıcıya bilgi ver (kaydırma yapıldıysa)
    if (adjusted) {
        // console.log('Vana pozisyonu mesafe kurallarına göre ayarlandı.');
    }

    // ✨ P2 (ileri uç) ucundan sabit mesafe hesapla
    const pipeLength = pipe.uzunluk;
    const distanceFromP2 = pipeLength * (1 - t); // cm cinsinden

    // Bağımsız Vana nesnesi oluştur
    const vana = createVana(x, y, 'AKV', {
        floorId: state.currentFloorId,
        bagliBoruId: pipe.id,
        boruPozisyonu: t,
        fromEnd: 'p2',              // İleri uçtan (p2)
        fixedDistance: distanceFromP2 // Sabit cm mesafe
    });

    // Rotasyonu boru açısına göre ayarla
    vana.rotation = pipe.aciDerece;

    // Manager'ın components dizisine ekle
    this.manager.components.push(vana);

    // State'i senkronize et
    this.manager.saveToState();

    // Preview'ı temizle
    this.vanaPreview = null;

    // Vana eklendikten sonra SEÇ moduna geç
    this.manager.activeTool = null;
    this.cancelCurrentAction();
    setMode("select");
}

/**
 * Sayaç ekleme işlemleri
 * KURALLAR:
 * - Sayaç SADECE boru uç noktasına eklenebilir
 * - Fleks ile bağlanır
 * - Boru ucunda vana yoksa otomatik vana eklenir
 */
export function handleSayacEndPlacement(meter) {
    //console.log('[handleSayacEndPlacement] Başlıyor');

    // Ghost'tan boru ucu bilgisini al (ghost gösterimde doğru pozisyon belirlendi)
    // Eğer ghost bilgisi yoksa, mevcut pozisyondan bul
    let boruUcu;
    if (meter.ghostConnectionInfo && meter.ghostConnectionInfo.boruUcu) {
        boruUcu = meter.ghostConnectionInfo.boruUcu;
        //console.log('[handleSayacEndPlacement] Ghost connection info bulundu:', boruUcu);
    } else {
        // Fallback: mevcut pozisyondan bul
        const girisNoktasi = meter.getGirisNoktasi();
        boruUcu = this.findBoruUcuAt(girisNoktasi, 50);
        //console.log('[handleSayacEndPlacement] Fallback ile boru ucu bulundu:', boruUcu);
    }

    if (!boruUcu) {
        //console.error('[handleSayacEndPlacement] ✗ Boru ucu bulunamadı!');
        // alert('Sayaç bir boru ucuna yerleştirilmelidir! Lütfen bir boru ucunun yakınına yerleştirin.');
        return false;
    }

    // T JUNCTION KONTROLÜ: Sayaç sadece gerçek uçlara bağlanabilir, T noktasına değil
    if (!this.isFreeEndpoint(boruUcu.nokta, 1)) {
        // console.error('[handleSayacEndPlacement] ✗ T-junction kontrolü başarısız!');
        // alert('⚠️ Sayaç T-bağlantısına yerleştirilemez!\n\nLütfen serbest bir hat ucuna yerleştirin.');
        return false;
    }

    // SAYAÇ VAR MI KONTROLÜ: Bir boru ucunda zaten sayaç varsa başka sayaç eklenemez
    const mevcutSayac = this.hasMeterAtEndpoint(boruUcu.boruId, boruUcu.uc);
    if (mevcutSayac) {
        //console.error('[handleSayacEndPlacement] ✗ Bu boru ucunda zaten sayaç var!');
        // alert('⚠️ Bu boru ucunda zaten bir sayaç var!\n\nBir boru ucuna sadece bir sayaç eklenebilir.');
        return false;
    }

    //console.log('[handleSayacEndPlacement] ✓ Kontroller geçti, vana ve sayaç ekleniyor...');

    // Not: saveState() artık placeComponent'ta çağrılıyor (tüm işlemlerden önce)

    // Boru ucunda vana var mı kontrol et
    const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

    // Vana yoksa otomatik ekle
    if (!vanaVar) {
        // Vana pozisyonunu hesapla - vananın KENARI boru ucundan 4 cm içeride olmalı
        const boru = boruUcu.boru;
        const edgeMargin = 4;      // cm - kenar için margin
        const vanaRadius = 4;      // cm - vana yarıçapı (8cm / 2)
        const centerMargin = edgeMargin + vanaRadius; // 8 cm - merkez için toplam

        // Boru yönünü hesapla (boru ucundan içeriye doğru)
        const dx = boru.p2.x - boru.p1.x;
        const dy = boru.p2.y - boru.p1.y;
        const length = Math.hypot(dx, dy);

        let vanaX, vanaY;
        if (boruUcu.uc === 'p1') {
            // p1 ucundayız, p2'ye doğru centerMargin kadar ilerle
            vanaX = boruUcu.nokta.x + (dx / length) * centerMargin;
            vanaY = boruUcu.nokta.y + (dy / length) * centerMargin;
        } else {
            // p2 ucundayız, p1'e doğru centerMargin kadar ilerle
            vanaX = boruUcu.nokta.x - (dx / length) * centerMargin;
            vanaY = boruUcu.nokta.y - (dy / length) * centerMargin;
        }

        const vana = createVana(vanaX, vanaY, 'SAYAC');
        vana.rotation = boruUcu.boru.aciDerece;
        vana.floorId = meter.floorId;

        // Vana'yı boru üzerindeki pozisyona bağla
        vana.bagliBoruId = boruUcu.boruId;
        // Pozisyonu hesapla (0.0 - 1.0 arası)
        const vanaToP1Dist = Math.hypot(vanaX - boru.p1.x, vanaY - boru.p1.y);
        vana.boruPozisyonu = vanaToP1Dist / length;

        this.manager.components.push(vana);
        meter.iliskiliVanaId = vana.id;
    } else {
        meter.iliskiliVanaId = vanaVar.id;
    }

    // Sayaç pozisyonu ve rotation ghost'tan geliyor (mouse konumuna göre ayarlanmış)
    // Ghost'ta zaten doğru pozisyon ve yön belirlendi, burada yeniden hesaplamaya gerek yok
    // meter.x, meter.y ve meter.rotation zaten ghost positioning'den doğru değerlerde

    const fleksUzunluk = 15; // cm
    meter.config.rijitUzunluk = fleksUzunluk;

    // SON OLARAK: Tüm pozisyon/rotation ayarları bittikten sonra fleks bağla
    meter.fleksBagla(boruUcu.boruId, boruUcu.uc);

    // Sayacı components'a ekle (eğer henüz eklenmemişse)
    if (!this.manager.components.includes(meter)) {
        this.manager.components.push(meter);
    }

    return true;
}

/**
 * Cihaz ekleme (Kombi, Ocak, vb.)
 * KURALLAR:
 * - Cihaz SADECE boru uç noktasına eklenebilir
 * - Fleks ile bağlanır
 * - Boru ucunda vana yoksa otomatik vana eklenir
 */
export function handleCihazEkleme(cihaz) {
    //console.log('[handleCihazEkleme] Başlıyor. Cihaz tipi:', cihaz.cihazTipi);

    // Ghost'tan boru ucu bilgisini al (ghost gösterimde doğru pozisyon belirlendi)
    // Eğer ghost bilgisi yoksa, mevcut pozisyondan bul
    let boruUcu;
    if (cihaz.ghostConnectionInfo && cihaz.ghostConnectionInfo.boruUcu) {
        boruUcu = cihaz.ghostConnectionInfo.boruUcu;
        //console.log('[handleCihazEkleme] Ghost connection info bulundu:', boruUcu);
    } else {
        // Fallback: mevcut pozisyondan bul
        const girisNoktasi = cihaz.getGirisNoktasi();
        boruUcu = this.findBoruUcuAt(girisNoktasi, 50);
        //console.log('[handleCihazEkleme] Fallback ile boru ucu bulundu:', boruUcu);
    }

    if (!boruUcu) {
        // console.error('[handleCihazEkleme] ✗ Boru ucu bulunamadı!');
        //alert('Cihaz bir boru ucuna yerleştirilmelidir! Lütfen bir boru ucunun yakınına yerleştirin.');
        // Cihazı components'a ekleme, sadece iptal et
        return false;
    }

    // T JUNCTION KONTROLÜ: Cihaz sadece gerçek uçlara bağlanabilir, T noktasına değil
    if (!this.isFreeEndpoint(boruUcu.nokta, 1)) {
        // console.error('[handleCihazEkleme] ✗ T-junction kontrolü başarısız!');
        // alert('⚠️ Cihaz T-bağlantısına yerleştirilemez!\n\nLütfen serbest bir hat ucuna yerleştirin.');
        return false;
    }

    // CİHAZ VAR MI KONTROLÜ: Bir boru ucunda zaten cihaz varsa başka cihaz eklenemez
    const mevcutCihaz = this.hasDeviceAtEndpoint(boruUcu.boruId, boruUcu.uc);
    if (mevcutCihaz) {
        // console.error('[handleCihazEkleme] ✗ Bu boru ucunda zaten cihaz var!');
        // alert('⚠️ Bu boru ucunda zaten bir cihaz var!\n\nBir boru ucuna sadece bir cihaz eklenebilir.');
        return false;
    }

    // console.log('[handleCihazEkleme] ✓ Kontroller geçti, vana ve cihaz ekleniyor...');

    // Undo için state kaydet
    saveState();

    // Boru ucunda vana var mı kontrol et
    const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

    // Vana yoksa otomatik ekle
    if (!vanaVar) {
        // Vana pozisyonunu hesapla - vananın KENARI boru ucundan 4 cm içeride olmalı
        const boru = boruUcu.boru;
        const edgeMargin = 4;      // cm - kenar için margin
        const vanaRadius = 4;      // cm - vana yarıçapı (8cm / 2)
        const centerMargin = edgeMargin + vanaRadius; // 8 cm - merkez için toplam

        // Boru yönünü hesapla (boru ucundan içeriye doğru)
        const dx = boru.p2.x - boru.p1.x;
        const dy = boru.p2.y - boru.p1.y;
        const length = Math.hypot(dx, dy);

        let vanaX, vanaY;
        if (boruUcu.uc === 'p1') {
            // p1 ucundayız, p2'ye doğru centerMargin kadar ilerle
            vanaX = boruUcu.nokta.x + (dx / length) * centerMargin;
            vanaY = boruUcu.nokta.y + (dy / length) * centerMargin;
        } else {
            // p2 ucundayız, p1'e doğru centerMargin kadar ilerle
            vanaX = boruUcu.nokta.x - (dx / length) * centerMargin;
            vanaY = boruUcu.nokta.y - (dy / length) * centerMargin;
        }

        const vana = createVana(vanaX, vanaY, 'AKV');
        vana.rotation = boruUcu.boru.aciDerece;
        vana.floorId = cihaz.floorId;

        // Vana'yı boru üzerindeki pozisyona bağla
        vana.bagliBoruId = boruUcu.boruId;
        // Pozisyonu hesapla (0.0 - 1.0 arası)
        const vanaToP1Dist = Math.hypot(vanaX - boru.p1.x, vanaY - boru.p1.y);
        vana.boruPozisyonu = vanaToP1Dist / length;

        this.manager.components.push(vana);
        cihaz.vanaIliskilendir(vana.id);
    } else {
        cihaz.vanaIliskilendir(vanaVar.id);
    }

    // Cihaz rotation'unu sabit tut - tutamacı her zaman kuzeyde
    // Fleks bağlantısı cihazın en yakın noktasından otomatik ayarlanacak
    cihaz.rotation = 0;

    // Cihaz pozisyonu ghost'tan geliyor (mouse konumuna göre ayarlanmış)
    // Ghost'ta zaten doğru pozisyon belirlendi, burada yeniden hesaplamaya gerek yok
    // cihaz.x ve cihaz.y zaten ghost positioning'den doğru değerlerde

    // SON OLARAK: Tüm pozisyon/rotation ayarları bittikten sonra fleks bağla
    // boruUcu.uc = 'p1' veya 'p2'
    cihaz.fleksBagla(boruUcu.boruId, boruUcu.uc);

    // Cihazı components'a ekle (eğer henüz eklenmemişse)
    // Normal icon click workflow'unda placeComponent() ekler,
    // ama K/O shortcuts gibi direkt çağrılarda burada eklemeliyiz
    if (!this.manager.components.includes(cihaz)) {
        //   console.log('[handleCihazEkleme] Cihaz components\'a ekleniyor:', cihaz.cihazTipi);
        this.manager.components.push(cihaz);
    }

    // State'e kaydet
    this.manager.saveToState();

    // Baca gerektiren cihazlar için otomatik baca oluştur
    if (cihaz.bacaGerekliMi()) {
        // Baca oluştur - cihaz merkezinden başlayarak sağa doğru 100cm
        const baca = createBaca(cihaz.x, cihaz.y, cihaz.id, {
            floorId: cihaz.floorId
        });

        // İlk segment: Sağa doğru 100cm (1m)
        const ilkSegmentBitis = {
            x: cihaz.x + 100, // 1m = 100cm
            y: cihaz.y
        };
        baca.addSegment(ilkSegmentBitis.x, ilkSegmentBitis.y);

        // Çizimi bitir - böylece baca seçilebilir ve düzenlenebilir olur
        baca.finishDrawing();

        // Bileşenlere ekle
        this.manager.components.push(baca);
    }

    // console.log('[handleCihazEkleme] ✓ Cihaz başarıyla eklendi. Toplam components:', this.manager.components.length);
    return true;
}

/**
 * İç tesisat sayaç ekleme - ikinci nokta tıklaması
 * Kesikli boru oluştur + sayacı boru ucuna ekle
 */
export function handleMeterStartPipeSecondClick(endPoint) {
    if (!this.meterStartPoint) return;

    const p1 = this.meterStartPoint;
    const p2 = endPoint;

    // Minimum mesafe kontrolü (çok kısa borular olmasın)
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (distance < 10) {
        // console.warn('⚠️ Boru çok kısa! En az 10cm olmalı.');
        return;
    }

    // Kesikli temsili boru oluştur
    const temsiliBoru = createBoru(p1, p2);
    temsiliBoru.dagitimTuru = 'KOLON'; // Kolon rengi
    temsiliBoru.lineStyle = 'dashed'; // Kesikli çizim
    temsiliBoru.isTemsiliBoru = true; // Temsili boru işareti

    this.manager.pipes.push(temsiliBoru);

    // Sayaç pozisyon ve rotation hesapla (updateGhostPosition mantığını kullan)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);

    // Sayaç her zaman p2 ucunda, p1'e dik konumda
    const fleksUzunluk = 15; // cm

    // Boru açısı
    const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;

    // Sayaç rotasyonu: Boru yönü (p2'den p1'e bakan yön + 90 derece)
    // Sayaç boru hattına dik olacak
    const sayacRotation = boruAci;

    // Geçici sayaç oluştur - POZİSYON ve ROTATION AYARLI
    const tempMeter = createSayac(p2.x, p2.y, {
        floorId: state.currentFloorId
    });
    tempMeter.rotation = sayacRotation;

    // Sayacın giriş noktasını hesapla (rotation uygulanmış)
    const girisLocal = tempMeter.getGirisLocalKoordinat();
    const rad = tempMeter.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Giriş noktası boru ucuna (p2) denk gelecek şekilde sayaç merkezini ayarla
    const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
    const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

    // Sayaç merkezi = p2 - giriş_offset - fleks_uzunluk (dik yönde)
    // Perpendicular yön: (-dy/length, dx/length)
    const perpX = -dy / length;
    const perpY = dx / length;

    tempMeter.x = p2.x - girisRotatedX + perpX * fleksUzunluk;
    tempMeter.y = p2.y - girisRotatedY + perpY * fleksUzunluk;

    // Boru p2 ucuna sayaç eklemek için ghost connection bilgisi oluştur
    tempMeter.ghostConnectionInfo = {
        boruUcu: {
            boruId: temsiliBoru.id,
            boru: temsiliBoru,
            uc: 'p2',
            nokta: { x: p2.x, y: p2.y }
        }
    };

    // Sayacı boru ucuna ekle (mevcut handleSayacEndPlacement kullan)
    // Bu fonksiyon VANA + FLEKS + SAYAÇ + ÇIKIŞ RİJİT otomatik ekleyecek
    const success = this.handleSayacEndPlacement(tempMeter);

    if (success) {
        // Sayacın çıkış noktasından boru çizimi başlat
        const cikisNoktasi = tempMeter.getCikisNoktasi();
        this.startBoruCizim(cikisNoktasi, tempMeter.id, BAGLANTI_TIPLERI.SAYAC);

        // Durumu sıfırla
        this.meterPlacementState = null;
        this.meterStartPoint = null;
        this.meterPreviewEndPoint = null;

        // Boru modunda kal
        this.manager.activeTool = 'boru';
        setMode("plumbingV2", true);

        // console.log('✅ İÇ TESİSAT: Kesikli boru + sayaç başarıyla eklendi.');
    } else {
        // Başarısız olursa temsili boruyu sil
        const index = this.manager.pipes.indexOf(temsiliBoru);
        if (index > -1) {
            this.manager.pipes.splice(index, 1);
        }

        // Durumu sıfırla
        this.meterPlacementState = null;
        this.meterStartPoint = null;
        this.meterPreviewEndPoint = null;

        // console.error('❌ Sayaç eklenemedi!');
    }
}
