/**
 * Interaction Manager (v2)
 * Kullanıcı etkileşimlerini yönetir - yeni bileşenlerle entegre
 */

import { TesisatSnapSystem } from './tesisat-snap.js';
import { ServisKutusu } from '../objects/service-box.js';
import { Boru, createBoru, BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { Sayac, createSayac } from '../objects/meter.js';
import { Vana, createVana } from '../objects/valve.js';
import { Cihaz, createCihaz } from '../objects/device.js';
import { screenToWorld } from '../../draw/geometry.js';
import { dom, state, setMode, setState } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';

// Tool modları
export const TESISAT_MODLARI = {
    NONE: null,
    SERVIS_KUTUSU: 'servis_kutusu',
    BORU: 'boru',
    SAYAC: 'sayac',
    VANA: 'vana',
    CIHAZ: 'cihaz'
};

export class InteractionManager {
    constructor(manager) {
        this.manager = manager;
        this.snapSystem = new TesisatSnapSystem(manager);
        this.activeSnap = null;

        // Boru çizim durumu
        this.boruCizimAktif = false;
        this.boruBaslangic = null;
        this.geciciBoruBitis = null;

        // Ölçü girişi
        this.measurementInput = '';
        this.measurementActive = false;

        // Sürükleme durumu
        this.isDragging = false;
        this.dragStart = null;
        this.dragObject = null;

        // Döndürme durumu
        this.isRotating = false;
        this.rotationOffset = 0;

        // Seçili nesne
        this.selectedObject = null;

        // Boru uç noktası snap lock (duvar node snap gibi)
        this.pipeEndpointSnapLock = null;
        this.pipeSnapMouseStart = null; // Snap başladığı andaki mouse pozisyonu
    }

    /**
     * Mouse hareketi
     */
    handlePointerMove(e) {
        if (!this.manager.activeTool && !this.isDragging && !this.isRotating && !this.boruCizimAktif) {
            return false;
        }

        const rect = dom.c2d.getBoundingClientRect();
        const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const walls = state.walls;

        // Snap hesapla
        this.activeSnap = this.snapSystem.getSnapPoint(point, walls);
        const targetPoint = this.activeSnap
            ? { x: this.activeSnap.x, y: this.activeSnap.y }
            : point;

        // 1. Boru çizim modunda
        if (this.boruCizimAktif) {
            // Eğer ölçü girişi aktifse, o ölçüye göre hedef noktayı ayarla
            if (this.measurementActive && this.measurementInput.length > 0) {
                const measurement = parseFloat(this.measurementInput);
                if (!isNaN(measurement) && measurement > 0) {
                    // Yönü hesapla (başlangıçtan mouse'a doğru)
                    const dx = targetPoint.x - this.boruBaslangic.nokta.x;
                    const dy = targetPoint.y - this.boruBaslangic.nokta.y;
                    const currentLength = Math.hypot(dx, dy);

                    if (currentLength > 0) {
                        // Normalize et ve ölçü kadar uzat
                        const dirX = dx / currentLength;
                        const dirY = dy / currentLength;

                        this.geciciBoruBitis = {
                            x: this.boruBaslangic.nokta.x + dirX * measurement,
                            y: this.boruBaslangic.nokta.y + dirY * measurement
                        };
                    } else {
                        this.geciciBoruBitis = targetPoint;
                    }
                } else {
                    this.geciciBoruBitis = targetPoint;
                }
            } else {
                this.geciciBoruBitis = targetPoint;
            }
            return true;
        }

        // 2. Ghost eleman yerleştirme
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.updateGhostPosition(this.manager.tempComponent, targetPoint, this.activeSnap);
            return true;
        }

        // 3. Döndürme
        if (this.isRotating && this.dragObject) {
            console.log('Döndürme modunda, handleRotation çağrılıyor');
            this.handleRotation(point);
            return true;
        }

        // 4. Sürükleme - raw point kullan (handleDrag içinde gerekli snap yapılır)
        if (this.isDragging && this.dragObject) {
            this.handleDrag(point);
            return true;
        }

        return false;
    }

    /**
     * Mouse tıklama
     */
    handlePointerDown(e) {
        const rect = dom.c2d.getBoundingClientRect();
        const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const targetPoint = this.activeSnap
            ? { x: this.activeSnap.x, y: this.activeSnap.y }
            : point;

        // 1. Boru çizim modunda tıklama
        if (this.boruCizimAktif) {
            this.handleBoruClick(targetPoint);
            return true;
        }

        // 2. Yerleştirme modu (ghost var ve araç aktif)
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.placeComponent(targetPoint);
            return true;
        }

        // 3. Nesne seçimi ve sürükleme - SEÇ, TESİSAT VE KARMA MODLARINDA
        const isSelectionMode = state.currentMode === 'select' ||
                                state.currentMode === 'plumbingV2' ||
                                state.currentMode === 'MİMARİ-TESİSAT';

        if (isSelectionMode) {
            // Önce seçili servis kutusunun döndürme tutamacını kontrol et
            if (this.selectedObject && this.selectedObject.type === 'servis_kutusu') {
                if (this.findRotationHandleAt(this.selectedObject, point, 12)) {
                    console.log('Döndürme tutamacı yakalandı');
                    this.startRotation(this.selectedObject, point);
                    return true;
                }
            }

            // Sonra boru uç noktası kontrolü yap (öncelik verilir)
            const boruUcu = this.findBoruUcuAt(point, 12); // Mesafeyi artırdık
            if (boruUcu) {
                const pipe = this.manager.pipes.find(p => p.id === boruUcu.boruId);
                if (pipe) {
                    // Eğer boru aracı aktifse, o uçtan boru çizimi başlat
                    if (this.manager.activeTool === 'boru') {
                        const ucNokta = boruUcu.uc === 'p1' ? pipe.p1 : pipe.p2;
                        this.startBoruCizim(ucNokta, pipe.id, BAGLANTI_TIPLERI.BORU);
                        return true;
                    }

                    // Servis kutusuna bağlı boru ucunun taşınmasını engelle
                    const ucBaglanti = boruUcu.uc === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
                    if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                        // Sadece seç, taşıma başlatma
                        this.selectObject(pipe);
                        return true;
                    }

                    // Yoksa boruyu seç ve uç nokta sürüklemesi başlat
                    this.selectObject(pipe);
                    this.startEndpointDrag(pipe, boruUcu.uc, point);
                    return true;
                }
            }

            // Sonra nesne seçimi
            const hitObject = this.findObjectAt(point);
            if (hitObject) {
                this.selectObject(hitObject);
                // Boru gövdesi için body sürükleme, diğerleri için normal sürükleme
                if (hitObject.type === 'boru') {
                    // Kutuya bağlı boruların gövdesi taşınmasın
                    const bagliKutu = this.manager.components.find(c =>
                        c.type === 'servis_kutusu' && c.bagliBoruId === hitObject.id
                    );

                    if (bagliKutu) {
                        // Kutuya bağlı boru, gövde sürükleme yapma (ama seçimi koru)
                        return true;
                    }

                    this.startBodyDrag(hitObject, point);
                } else {
                    this.startDrag(hitObject, point);
                }
                return true;
            }
        }

        // Seç modunda çizim başlatma - boş alana tıklandı
        if (isSelectionMode) {
            this.deselectObject();
            return false;
        }

        // 4. Bileşen çıkış noktasından çizim başlat (servis kutusu, sayaç vb.)
        const bilesenCikis = this.findBilesenCikisAt(point);
        if (bilesenCikis) {
            // Bileşen tipine göre bağlantı tipi belirle
            const baglantiTip = bilesenCikis.tip === 'servis_kutusu'
                ? BAGLANTI_TIPLERI.SERVIS_KUTUSU
                : bilesenCikis.tip === 'sayac'
                    ? BAGLANTI_TIPLERI.SAYAC
                    : BAGLANTI_TIPLERI.BORU;
            this.startBoruCizim(bilesenCikis.nokta, bilesenCikis.bilesenId, baglantiTip);
            return true;
        }

        // 5. Boru ucu veya gövdesinden çizim başlat
        const boruUcu = this.findBoruUcuAt(point, 8);
        if (boruUcu) {
            this.startBoruCizim(boruUcu.nokta, boruUcu.boruId, BAGLANTI_TIPLERI.BORU);
            return true;
        }

        // 6. Boru gövdesinden çizim başlat
        const boruGovde = this.findBoruGovdeAt(point);
        if (boruGovde) {
            this.startBoruCizim(boruGovde.nokta, boruGovde.boruId, BAGLANTI_TIPLERI.BORU);
            return true;
        }

        // 7. Boş alana tıklama - seçimi kaldır
        this.deselectObject();
        return false;
    }

    /**
     * Mouse bırakma
     */
    handlePointerUp(e) {
        if (this.isRotating) {
            this.endRotation();
            return true;
        }
        if (this.isDragging) {
            this.endDrag();
            return true;
        }
        return false;
    }

    /**
     * Klavye
     */
    handleKeyDown(e) {
        // Boru çizim modunda ölçü girişi
        if (this.boruCizimAktif && this.boruBaslangic) {
            // Rakam girişi (0-9)
            if (/^[0-9]$/.test(e.key)) {
                this.measurementInput += e.key;
                this.measurementActive = true;
                console.log('Ölçü girişi:', this.measurementInput);
                return true;
            }

            // Backspace - son rakamı sil
            if (e.key === 'Backspace' && this.measurementInput.length > 0) {
                this.measurementInput = this.measurementInput.slice(0, -1);
                if (this.measurementInput.length === 0) {
                    this.measurementActive = false;
                }
                console.log('Ölçü girişi:', this.measurementInput);
                return true;
            }

            // Enter - ölçüyü uygula
            if (e.key === 'Enter' && this.measurementInput.length > 0) {
                this.applyMeasurement();
                return true;
            }
        }

        // ESC - iptal ve seç moduna geç
        if (e.key === 'Escape') {
            this.cancelCurrentAction();
            setMode("select");
            return true;
        }

        // Delete - seçili nesneyi sil
        if (e.key === 'Delete' && this.selectedObject) {
            this.deleteSelectedObject();
            return true;
        }

        // Ok tuşları - seçili sayacı hareket ettir
        if (this.selectedObject && this.selectedObject.type === 'sayac') {
            const direction = {
                'ArrowUp': 'up',
                'ArrowDown': 'down',
                'ArrowLeft': 'left',
                'ArrowRight': 'right'
            }[e.key];

            if (direction) {
                const result = this.selectedObject.moveByKey(direction);
                this.updateConnectedPipe(result);
                return true;
            }
        }

        // R tuşu - seçili servis kutusunu döndür (çıkış noktası etrafında)
        if (this.selectedObject && this.selectedObject.type === 'servis_kutusu' && e.key === 'r') {
            saveState();
            const deltaDerece = e.shiftKey ? -15 : 15; // Shift ile ters yön
            const result = this.selectedObject.rotate(deltaDerece);
            this.updateConnectedPipe(result);
            this.manager.saveToState();
            return true;
        }

        return false;
    }

    /**
     * Ghost pozisyon güncelleme
     */
    updateGhostPosition(ghost, point, snap) {
        ghost.x = point.x;
        ghost.y = point.y;

        // Servis kutusu - duvara snap (yerleştirme için useBoxPosition=false)
        if (ghost.type === 'servis_kutusu') {
            const walls = state.walls;
            const snapDistance = 30; // 30cm içinde snap yap

            // En yakın duvarı bul
            let closestWall = null;
            let minDist = Infinity;

            walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;

                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const len = Math.hypot(dx, dy);
                if (len === 0) return;

                // Noktayı duvara projeksiyon yap
                const t = Math.max(0, Math.min(1,
                    ((point.x - wall.p1.x) * dx + (point.y - wall.p1.y) * dy) / (len * len)
                ));
                const projX = wall.p1.x + t * dx;
                const projY = wall.p1.y + t * dy;

                const dist = Math.hypot(point.x - projX, point.y - projY);

                if (dist < minDist) {
                    minDist = dist;
                    closestWall = wall;
                }
            });

            // Yakın duvara snap yap (yerleştirme - useBoxPosition=false, mouse pozisyonuna göre taraf belirlenir)
            if (closestWall && minDist < snapDistance) {
                ghost.snapToWall(closestWall, point, false);
            } else {
                ghost.placeFree(point);
            }
        }

        // Sayaç/Vana - boru açısına hizala
        if ((ghost.type === 'sayac' || ghost.type === 'vana') && snap && snap.target) {
            if (snap.target.isPipe) {
                ghost.rotation = snap.target.aciDerece || 0;
            }
        }
    }

    /**
     * Bileşeni yerleştir
     */
    placeComponent(point) {
        if (!this.manager.tempComponent) return;

        // Undo için state kaydet
        saveState();

        const component = this.manager.tempComponent;

        // Listeye ekle
        this.manager.components.push(component);

        // Özel işlemler
        switch (component.type) {
            case 'servis_kutusu':
                this.startBoruCizim(component.getCikisNoktasi(), component.id);
                // İkon güncellemesi için activeTool'u boru olarak ayarla
                this.manager.activeTool = 'boru';
                // İkonları güncelle
                setMode("plumbingV2", true);
                break;

            case 'sayac':
                this.handleSayacEkleme(component);
                // İkon güncellemesi için activeTool'u boru olarak ayarla
                this.manager.activeTool = 'boru';
                // İkonları güncelle
                setMode("plumbingV2", true);
                break;

            case 'cihaz':
                if (component.bacaGerekliMi()) {
                    console.log('Baca modu başlatılabilir');
                }
                break;
        }

        // Temizle
        this.manager.tempComponent = null;
        // activeTool'u sadece boru moduna geçmiyorsak temizle
        if (!this.boruCizimAktif) {
            this.manager.activeTool = null;
        }

        // State'i senkronize et
        this.manager.saveToState();
    }

    /**
     * Boru çizim modunu başlat
     */
    startBoruCizim(baslangicNoktasi, kaynakId = null, kaynakTip = null) {
        this.boruCizimAktif = true;
        this.boruBaslangic = {
            nokta: baslangicNoktasi,
            kaynakId: kaynakId,
            kaynakTip: kaynakTip || BAGLANTI_TIPLERI.SERVIS_KUTUSU
        };
        this.snapSystem.setStartPoint(baslangicNoktasi);
    }

    /**
     * Boru çizimde tıklama
     */
    handleBoruClick(point) {
        if (!this.boruBaslangic) return;

        // Undo için state kaydet (her boru için ayrı undo entry)
        saveState();

        const boru = createBoru(this.boruBaslangic.nokta, point, 'STANDART');
        boru.floorId = state.currentFloorId;

        if (this.boruBaslangic.kaynakId) {
            boru.setBaslangicBaglanti(
                this.boruBaslangic.kaynakTip,
                this.boruBaslangic.kaynakId
            );

            // Servis kutusu bağlantısını kur
            if (this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                const servisKutusu = this.manager.components.find(
                    c => c.id === this.boruBaslangic.kaynakId && c.type === 'servis_kutusu'
                );
                if (servisKutusu) {
                    servisKutusu.baglaBoru(boru.id);
                }
            }
        }

        this.manager.pipes.push(boru);

        // State'i senkronize et
        this.manager.saveToState();

        // Devam et
        this.boruBaslangic = {
            nokta: point,
            kaynakId: boru.id,
            kaynakTip: BAGLANTI_TIPLERI.BORU
        };
        this.snapSystem.setStartPoint(point);
    }

    /**
     * Sayaç ekleme işlemleri
     */
    handleSayacEkleme(sayac) {
        const boruUcu = this.findBoruUcuAt(sayac.getGirisNoktasi());

        if (boruUcu) {
            const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

            if (!vanaVar) {
                const vana = createVana(boruUcu.nokta.x, boruUcu.nokta.y, 'SAYAC');
                vana.rotation = sayac.rotation;
                vana.floorId = sayac.floorId;
                this.manager.components.push(vana);
                sayac.vanaIliskilendir(vana.id);
            }

            sayac.baglaGiris(boruUcu.boruId, boruUcu.nokta);
        }

        this.startBoruCizim(sayac.getCikisNoktasi(), sayac.id, BAGLANTI_TIPLERI.SAYAC);
    }

    /**
     * Ölçüyü uygula (Enter tuşuna basıldığında)
     */
    applyMeasurement() {
        if (!this.boruBaslangic) return;

        const measurement = parseFloat(this.measurementInput);
        if (isNaN(measurement) || measurement <= 0) {
            console.warn('Geçersiz ölçü:', this.measurementInput);
            this.measurementInput = '';
            this.measurementActive = false;
            return;
        }

        // Eğer geciciBoruBitis yoksa veya geçersizse, yönü hesapla
        let targetPoint = this.geciciBoruBitis;

        if (!targetPoint) {
            // Varsayılan yön: sağa doğru (pozitif X ekseni)
            targetPoint = {
                x: this.boruBaslangic.nokta.x + measurement,
                y: this.boruBaslangic.nokta.y
            };
        } else {
            // Mevcut yönü kullanarak ölçüyü uygula
            const dx = targetPoint.x - this.boruBaslangic.nokta.x;
            const dy = targetPoint.y - this.boruBaslangic.nokta.y;
            const currentLength = Math.hypot(dx, dy);

            if (currentLength > 0.1) {
                // Yönü normalize et ve ölçü kadar uzat
                const dirX = dx / currentLength;
                const dirY = dy / currentLength;

                targetPoint = {
                    x: this.boruBaslangic.nokta.x + dirX * measurement,
                    y: this.boruBaslangic.nokta.y + dirY * measurement
                };
            } else {
                // Çok kısa mesafe, varsayılan yön kullan
                targetPoint = {
                    x: this.boruBaslangic.nokta.x + measurement,
                    y: this.boruBaslangic.nokta.y
                };
            }
        }

        // Boruyu oluştur
        this.handleBoruClick(targetPoint);

        // Ölçü girişini sıfırla
        this.measurementInput = '';
        this.measurementActive = false;
    }

    /**
     * Mevcut işlemi iptal et
     */
    cancelCurrentAction() {
        if (this.boruCizimAktif) {
            this.boruCizimAktif = false;
            this.boruBaslangic = null;
            this.geciciBoruBitis = null;
            this.snapSystem.clearStartPoint();
        }

        // Ölçü girişini sıfırla
        this.measurementInput = '';
        this.measurementActive = false;

        if (this.manager.tempComponent) {
            this.manager.tempComponent = null;
        }

        this.manager.activeTool = null;

        // Seçimi temizle
        this.deselectObject();
    }

    selectObject(obj) {
        // Önceki seçimi temizle
        if (this.selectedObject && this.selectedObject !== obj) {
            this.selectedObject.isSelected = false;
        }
        this.selectedObject = obj;
        obj.isSelected = true;

        // state.selectedObject'i de set et (DELETE tuşu için)
        setState({
            selectedObject: {
                type: obj.type === 'boru' ? 'pipe' : obj.type,
                object: obj,
                handle: 'body'
            }
        });
    }

    deselectObject() {
        if (this.selectedObject) {
            this.selectedObject.isSelected = false;
            this.selectedObject = null;
        }

        // state.selectedObject'i de temizle
        setState({ selectedObject: null });
    }

    deleteSelectedObject() {
        if (!this.selectedObject) return;

        const obj = this.selectedObject;

        // Servis kutusuna bağlı ilk boru silinemesin
        if (obj.type === 'boru') {
            const pipe = obj;
            // Başlangıcı servis kutusuna bağlı mı kontrol et
            if (pipe.baslangicBaglanti && pipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                alert('⚠️ Servis kutusuna bağlı ilk boru silinemez!\n\nÖnce servis kutusunu silin veya başka bir boru ekleyin.');
                return;
            }
        }

        // Undo için state kaydet
        saveState();

        if (obj.type === 'servis_kutusu') {
            if (confirm(obj.getDeleteInfo().uyari)) {
                this.removeObject(obj);
                this.manager.saveToState();
            } else {
                // İptal edildi, return
                return;
            }
        } else {
            this.removeObject(obj);
            this.manager.saveToState();
        }

        this.deselectObject();
    }

    findObjectAt(point) {
        // Bileşenler (servis kutusu, sayaç, vana, cihaz)
        for (const comp of this.manager.components) {
            if (comp.containsPoint && comp.containsPoint(point)) {
                return comp;
            }
        }

        // Borular da seçilebilir (ama gövdeden taşınamaz)
        for (const pipe of this.manager.pipes) {
            if (pipe.containsPoint && pipe.containsPoint(point, 10)) {
                return pipe;
            }
        }

        return null;
    }

    findBoruUcuAt(point, tolerance = 5) {
        for (const boru of this.manager.pipes) {
            if (Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y) < tolerance) {
                return { boruId: boru.id, nokta: boru.p1, uc: 'p1' };
            }
            if (Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y) < tolerance) {
                return { boruId: boru.id, nokta: boru.p2, uc: 'p2' };
            }
        }
        return null;
    }

    findBoruGovdeAt(point, tolerance = 5) {
        for (const boru of this.manager.pipes) {
            const proj = boru.projectPoint(point);
            if (proj && proj.onSegment && proj.distance < tolerance) {
                return { boruId: boru.id, nokta: { x: proj.x, y: proj.y } };
            }
        }
        return null;
    }

    /**
     * Bileşen çıkış noktasını bul (servis kutusu, sayaç vb.)
     */
    findBilesenCikisAt(point, tolerance = 10) {
        for (const comp of this.manager.components) {
            // Servis kutusu - getCikisNoktasi metodu var ve çıkış kullanılmamışsa
            if (comp.type === 'servis_kutusu' && comp.getCikisNoktasi && !comp.cikisKullanildi) {
                const cikis = comp.getCikisNoktasi();
                if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                    return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
                }
            }
            // Sayaç - çıkış noktası
            if (comp.type === 'sayac' && comp.getCikisNoktasi) {
                const cikis = comp.getCikisNoktasi();
                if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                    return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
                }
            }
        }
        return null;
    }

    checkVanaAtPoint(point, tolerance = 5) {
        for (const comp of this.manager.components) {
            if (comp.type === 'vana') {
                if (Math.hypot(point.x - comp.x, point.y - comp.y) < tolerance) {
                    return comp;
                }
            }
        }
        return null;
    }

    /**
     * Boru uç noktasını bul
     */
    findPipeEndpoint(pipe, point) {
        const tolerance = 8; // cm
        const distToP1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y);
        const distToP2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y);

        if (distToP1 <= tolerance && distToP1 <= distToP2) {
            return 'p1';
        }
        if (distToP2 <= tolerance) {
            return 'p2';
        }
        return null;
    }

    /**
     * Uç nokta sürüklemeyi başlat
     */
    startEndpointDrag(pipe, endpoint, point) {
        this.isDragging = true;
        this.dragObject = pipe;
        this.dragEndpoint = endpoint;
        this.dragStart = { ...point };
    }

    startDrag(obj, point) {
        this.isDragging = true;
        this.dragObject = obj;
        this.dragEndpoint = null;
        this.dragStart = { ...point };
    }

    /**
     * Boru body sürüklemeyi başlat (sadece x veya y yönünde)
     */
    startBodyDrag(pipe, point) {
        this.isDragging = true;
        this.dragObject = pipe;
        this.dragEndpoint = null;
        this.dragStart = { ...point };
        this.isBodyDrag = true; // Body drag flag
        // Başlangıç noktalarını kaydet
        this.bodyDragInitialP1 = { ...pipe.p1 };
        this.bodyDragInitialP2 = { ...pipe.p2 };

        // Borunun açısını hesapla ve drag axis'i belirle (duvar mantığı)
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
        let dragAxis = null;
        if (Math.abs(angle - 45) < 1) {
            dragAxis = null; // 45 derece ise serbest
        } else if (angle < 45) {
            dragAxis = 'y'; // Yatay boru, sadece Y yönünde taşı
        } else {
            dragAxis = 'x'; // Dikey boru, sadece X yönünde taşı
        }
        this.dragAxis = dragAxis;
    }

    handleDrag(point) {
        if (!this.dragObject) return;

        // Uç nokta sürükleme
        if (this.dragEndpoint && this.dragObject.type === 'boru') {
            const pipe = this.dragObject;

            // Servis kutusuna bağlı uç taşınamaz - ekstra güvenlik kontrolü
            const ucBaglanti = this.dragEndpoint === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
            if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                return; // Taşıma işlemini engelle
            }

            const oldPoint = this.dragEndpoint === 'p1' ? { ...pipe.p1 } : { ...pipe.p2 };

            // DUVAR SNAP SİSTEMİ - Boru açıklığı ile
            const SNAP_DISTANCE = 25; // İlk yakalama mesafesi (cm)
            const SNAP_RELEASE_DISTANCE = 40; // Snap'ten çıkma mesafesi (cm)
            const BORU_CLEARANCE = 5; // Boru-duvar arası minimum mesafe (cm)
            const walls = state.walls || [];
            let finalPos = { x: point.x, y: point.y };

            // Her zaman yeni snap ara (sürekli snap)
            let bestSnapX = { diff: SNAP_DISTANCE, value: null };
            let bestSnapY = { diff: SNAP_DISTANCE, value: null };

            // Tüm duvar yüzeylerine snap kontrolü - Boru clearance ekleyerek
            walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;

                const wallThickness = wall.thickness || state.wallThickness || 20;
                const halfThickness = wallThickness / 2;
                const dxW = wall.p2.x - wall.p1.x;
                const dyW = wall.p2.y - wall.p1.y;
                const isVertical = Math.abs(dxW) < 0.1;
                const isHorizontal = Math.abs(dyW) < 0.1;

                if (isVertical) {
                    const wallX = wall.p1.x;
                    // Boru duvar yüzeyinden CLEARANCE kadar uzakta olmalı
                    const snapXPositions = [
                        wallX - halfThickness - BORU_CLEARANCE,  // Sol yüzeyden clearance kadar uzak
                        wallX + halfThickness + BORU_CLEARANCE   // Sağ yüzeyden clearance kadar uzak
                    ];
                    for (const snapX of snapXPositions) {
                        const diff = Math.abs(finalPos.x - snapX);
                        if (diff < bestSnapX.diff) {
                            bestSnapX = { diff, value: snapX };
                        }
                    }
                } else if (isHorizontal) {
                    const wallY = wall.p1.y;
                    // Boru duvar yüzeyinden CLEARANCE kadar uzakta olmalı
                    const snapYPositions = [
                        wallY - halfThickness - BORU_CLEARANCE,  // Üst yüzeyden clearance kadar uzak
                        wallY + halfThickness + BORU_CLEARANCE   // Alt yüzeyden clearance kadar uzak
                    ];
                    for (const snapY of snapYPositions) {
                        const diff = Math.abs(finalPos.y - snapY);
                        if (diff < bestSnapY.diff) {
                            bestSnapY = { diff, value: snapY };
                        }
                    }
                }
            });

            // Snap bulunduysa uygula
            if (bestSnapX.value !== null || bestSnapY.value !== null) {
                console.log('🎯 Boru uç snap bulundu! (clearance uygulanmış)', {
                    snapX: bestSnapX.value,
                    snapY: bestSnapY.value,
                    diffX: bestSnapX.diff,
                    diffY: bestSnapY.diff,
                    clearance: BORU_CLEARANCE
                });

                // Snap lock'u güncelle
                this.pipeEndpointSnapLock = {
                    x: bestSnapX.value,
                    y: bestSnapY.value
                };
                this.pipeSnapMouseStart = { x: point.x, y: point.y };

                if (bestSnapX.value !== null) finalPos.x = bestSnapX.value;
                if (bestSnapY.value !== null) finalPos.y = bestSnapY.value;
            } else {
                // Snap bulunamadıysa lock'u temizle
                console.log('❌ Snap bulunamadı, lock temizlendi');
                this.pipeEndpointSnapLock = null;
                this.pipeSnapMouseStart = null;
            }

            // Pozisyonu uygula
            if (this.dragEndpoint === 'p1') {
                pipe.p1.x = finalPos.x;
                pipe.p1.y = finalPos.y;
            } else {
                pipe.p2.x = finalPos.x;
                pipe.p2.y = finalPos.y;
            }

            // Bağlı boruları güncelle (tüm zinciri)
            this.updateConnectedPipesChain(oldPoint, finalPos);
            return;
        }

        // Servis kutusu için duvara snap
        if (this.dragObject.type === 'servis_kutusu') {
            const walls = state.walls;

            // Snap mesafesi - sabit
            const snapDistance = 30; // 30cm

            // En yakın duvarı bul - MOUSE POZİSYONUNA GÖRE
            let closestWall = null;
            let minDist = Infinity;

            // Mouse pozisyonunu kullan (kutu pozisyonu değil!)
            const mousePos = point;

            walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;

                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const len = Math.hypot(dx, dy);
                if (len === 0) return;

                // Mouse'u duvara projeksiyon yap
                const t = Math.max(0, Math.min(1,
                    ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (len * len)
                ));
                const projX = wall.p1.x + t * dx;
                const projY = wall.p1.y + t * dy;

                const dist = Math.hypot(mousePos.x - projX, mousePos.y - projY);

                if (dist < minDist) {
                    minDist = dist;
                    closestWall = wall;
                }
            });

            // Yakın duvara snap yap, yoksa serbest yerleştir
            // useBoxPosition=false ile mouse pozisyonuna göre snap yap (sürüklerken)
            if (closestWall && minDist < snapDistance) {
                this.dragObject.snapToWall(closestWall, point, false);
            } else {
                this.dragObject.placeFree(point);
            }

            // Bağlı boru zincirini güncelle
            if (this.dragObject.bagliBoruId) {
                const boru = this.manager.pipes.find(p => p.id === this.dragObject.bagliBoruId);
                if (boru) {
                    const oldP1 = { ...boru.p1 };
                    const newCikis = this.dragObject.getCikisNoktasi();
                    boru.moveP1(newCikis);
                    // Boru zincirini güncelle
                    this.updateConnectedPipesChain(oldP1, newCikis);
                }
            }
            return;
        }

        // Boru gövdesi taşıma - sadece x veya y yönünde (duvar mantığı)
        if (this.dragObject.type === 'boru' && this.isBodyDrag) {
            const pipe = this.dragObject;
            const dx = point.x - this.dragStart.x;
            const dy = point.y - this.dragStart.y;

            // Drag axis'e göre hareketi kısıtla (duvar gibi)
            let offsetX = dx;
            let offsetY = dy;

            if (this.dragAxis === 'x') {
                offsetY = 0; // Sadece X yönünde taşı
            } else if (this.dragAxis === 'y') {
                offsetX = 0; // Sadece Y yönünde taşı
            }
            // dragAxis === null ise her iki yönde de taşınabilir

            // ŞU ANKİ pozisyonları kaydet (henüz güncellenmeden önce)
            const oldP1 = { x: pipe.p1.x, y: pipe.p1.y };
            const oldP2 = { x: pipe.p2.x, y: pipe.p2.y };

            // Her iki ucu da yeni pozisyona taşı
            pipe.p1.x = this.bodyDragInitialP1.x + offsetX;
            pipe.p1.y = this.bodyDragInitialP1.y + offsetY;
            pipe.p2.x = this.bodyDragInitialP2.x + offsetX;
            pipe.p2.y = this.bodyDragInitialP2.y + offsetY;

            // Bağlı boruları güncelle (her iki uç için)
            // oldPoint = şu anki pozisyon, newPoint = yeni pozisyon
            this.updateConnectedPipesChain(oldP1, pipe.p1);
            this.updateConnectedPipesChain(oldP2, pipe.p2);
            return;
        }

        // Diğer objeler için normal taşıma
        if (this.dragObject.type !== 'boru') {
            const result = this.dragObject.move(point.x, point.y);
            this.updateConnectedPipe(result);
        }
    }

    /**
     * Bağlı boru zincirini günceller - sadece taşınan noktaları güncelle
     */
    updateConnectedPipesChain(oldPoint, newPoint) {
        const tolerance = 0.5; // cm

        // Basit iterative güncelleme - tüm boruları tek geçişte güncelle
        this.manager.pipes.forEach(pipe => {
            // p1'i güncelle
            if (Math.hypot(pipe.p1.x - oldPoint.x, pipe.p1.y - oldPoint.y) < tolerance) {
                pipe.p1.x = newPoint.x;
                pipe.p1.y = newPoint.y;
            }

            // p2'yi güncelle
            if (Math.hypot(pipe.p2.x - oldPoint.x, pipe.p2.y - oldPoint.y) < tolerance) {
                pipe.p2.x = newPoint.x;
                pipe.p2.y = newPoint.y;
            }
        });
    }

    endDrag() {
        // Body drag bittiğinde ara borular oluştur
        if (this.isBodyDrag && this.dragObject && this.dragObject.type === 'boru') {
            const draggedPipe = this.dragObject;
            const oldP1 = this.bodyDragInitialP1;
            const oldP2 = this.bodyDragInitialP2;
            const newP1 = draggedPipe.p1;
            const newP2 = draggedPipe.p2;

            // Minimum mesafe kontrolü (ara boru oluşturmaya değer mi?)
            const MIN_BRIDGE_LENGTH = 15; // 15 cm minimum
            const TOLERANCE = 15; // Bağlantı algılama toleransı

            // p1 tarafındaki bağlı boruları bul (oldP1 yakınında)
            const connectedAtP1 = this.manager.pipes.find(p =>
                p !== draggedPipe &&
                (Math.hypot(p.p2.x - oldP1.x, p.p2.y - oldP1.y) < TOLERANCE)
            );

            // p2 tarafındaki bağlı boruları bul (oldP2 yakınında)
            const connectedAtP2 = this.manager.pipes.find(p =>
                p !== draggedPipe &&
                (Math.hypot(p.p1.x - oldP2.x, p.p1.y - oldP2.y) < TOLERANCE)
            );

            // p1 tarafına ara boru ekle
            if (connectedAtP1) {
                const distP1 = Math.hypot(newP1.x - oldP1.x, newP1.y - oldP1.y);
                if (distP1 >= MIN_BRIDGE_LENGTH) {
                    console.log('🔗 p1 tarafına ara boru ekleniyor:', { oldP1, newP1 });
                    const bridgePipe1 = new Boru(
                        { x: oldP1.x, y: oldP1.y, z: oldP1.z || 0 },
                        { x: newP1.x, y: newP1.y, z: newP1.z || 0 },
                        draggedPipe.boruTipi
                    );
                    bridgePipe1.floorId = draggedPipe.floorId;
                    this.manager.pipes.push(bridgePipe1);
                }
            }

            // p2 tarafına ara boru ekle
            if (connectedAtP2) {
                const distP2 = Math.hypot(newP2.x - oldP2.x, newP2.y - oldP2.y);
                if (distP2 >= MIN_BRIDGE_LENGTH) {
                    console.log('🔗 p2 tarafına ara boru ekleniyor:', { oldP2, newP2 });
                    const bridgePipe2 = new Boru(
                        { x: newP2.x, y: newP2.y, z: newP2.z || 0 },
                        { x: oldP2.x, y: oldP2.y, z: oldP2.z || 0 },
                        draggedPipe.boruTipi
                    );
                    bridgePipe2.floorId = draggedPipe.floorId;
                    this.manager.pipes.push(bridgePipe2);
                }
            }
        }

        this.isDragging = false;
        this.dragObject = null;
        this.dragEndpoint = null;
        this.dragStart = null;
        this.isBodyDrag = false;
        this.bodyDragInitialP1 = null;
        this.bodyDragInitialP2 = null;
        this.dragAxis = null;
        this.pipeEndpointSnapLock = null; // Snap lock'u temizle
        this.pipeSnapMouseStart = null; // Mouse start pozisyonunu temizle
        this.manager.saveToState();
        saveState(); // Save to undo history
    }

    /**
     * Döndürme tutamacını bul (çubuğun ucundaki daire) - yukarı yönde
     */
    findRotationHandleAt(obj, point, tolerance = 8) {
        if (!obj || obj.type !== 'servis_kutusu') return false;

        const SERVIS_KUTUSU_CONFIG = { width: 40, height: 20 };
        const handleLength = SERVIS_KUTUSU_CONFIG.height / 2 + 10;

        // Tutamacın world pozisyonunu hesapla (yukarı yönde, rotation dikkate alınarak)
        // Local: (0, -handleLength) → World: dönüşüm matrisi uygula
        const rad = obj.rotation * Math.PI / 180;
        const handleX = obj.x + handleLength * Math.sin(rad);
        const handleY = obj.y - handleLength * Math.cos(rad);

        const dist = Math.hypot(point.x - handleX, point.y - handleY);
        return dist < tolerance;
    }

    /**
     * Döndürme başlat
     */
    startRotation(obj, point) {
        console.log('startRotation çağrıldı', obj.id);
        saveState();
        this.isRotating = true;
        this.dragObject = obj;

        // Merkez noktası
        const center = { x: obj.x, y: obj.y };

        // Başlangıç açısını hesapla
        const initialAngle = Math.atan2(point.y - center.y, point.x - center.x);
        const initialRotationRad = (obj.rotation || 0) * Math.PI / 180;
        this.rotationOffset = initialRotationRad - initialAngle;

        console.log('Döndürme başlatıldı, isRotating:', this.isRotating);
    }

    /**
     * Döndürme işle
     */
    handleRotation(point) {
        if (!this.dragObject || this.dragObject.type !== 'servis_kutusu') {
            console.log('handleRotation çağrıldı ama dragObject yok veya tip yanlış');
            return;
        }

        const obj = this.dragObject;
        const center = { x: obj.x, y: obj.y };

        // Yeni açıyı hesapla
        const mouseAngle = Math.atan2(point.y - center.y, point.x - center.x);
        let newRotationRad = mouseAngle + this.rotationOffset;

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

        console.log('Döndürülüyor, yeni açı:', newRotationDeg);

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
            const boru = this.manager.pipes.find(p => p.id === obj.bagliBoruId);
            if (boru) {
                boru.moveP1(obj.getCikisNoktasi());
            }
        }
    }

    /**
     * Döndürme bitir
     */
    endRotation() {
        this.isRotating = false;
        this.dragObject = null;
        this.rotationOffset = 0;
        this.manager.saveToState();
        saveState(); // Save to undo history
    }

    updateConnectedPipe(result) {
        if (!result) return;

        if (result.bagliBoruId && result.delta) {
            const boru = this.manager.pipes.find(p => p.id === result.bagliBoruId);
            if (boru) {
                boru.moveP1({
                    x: boru.p1.x + result.delta.x,
                    y: boru.p1.y + result.delta.y
                });
            }
        }

        if (result.cikisBagliBoruId && result.yeniCikis) {
            const boru = this.manager.pipes.find(p => p.id === result.cikisBagliBoruId);
            if (boru) {
                boru.moveP1(result.yeniCikis);
            }
        }
    }

    removeObject(obj) {
        if (obj.type === 'boru') {
            // Bağlı boruları bul ve bağlantıyı güncelle
            const deletedPipe = obj;

            // p2'ye bağlı boruyu bul (silinecek borunun devamı)
            const nextPipe = this.manager.pipes.find(p =>
                p.id !== deletedPipe.id &&
                Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < 1
            );

            // Eğer devam eden boru varsa, başlangıcını silinecek borunun başlangıcına bağla
            if (nextPipe) {
                const oldP1 = { x: nextPipe.p1.x, y: nextPipe.p1.y };
                const newP1 = { x: deletedPipe.p1.x, y: deletedPipe.p1.y };

                // İlerdeki noktayı gerideki noktaya taşı
                nextPipe.p1.x = newP1.x;
                nextPipe.p1.y = newP1.y;

                // Bağlantı bilgisini aktar
                if (deletedPipe.baslangicBaglanti.hedefId) {
                    nextPipe.setBaslangicBaglanti(
                        deletedPipe.baslangicBaglanti.tip,
                        deletedPipe.baslangicBaglanti.hedefId,
                        deletedPipe.baslangicBaglanti.noktaIndex
                    );

                    // Servis kutusu bağlantısını güncelle
                    if (deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                        const servisKutusu = this.manager.components.find(
                            c => c.id === deletedPipe.baslangicBaglanti.hedefId
                        );
                        if (servisKutusu) {
                            servisKutusu.baglaBoru(nextPipe.id);
                        }
                    }
                }

                // Bağlı boru zincirini güncelle (ilerdeki tüm borular)
                this.updateConnectedPipesChain(oldP1, newP1);
            }

            const index = this.manager.pipes.findIndex(p => p.id === obj.id);
            if (index !== -1) this.manager.pipes.splice(index, 1);
        } else if (obj.type === 'servis_kutusu') {
            // Servis kutusu silinirken bağlı tüm boruları da sil
            const bagliBoruId = obj.bagliBoruId;
            if (bagliBoruId) {
                // Bağlı boruyu bul
                const bagliBoruIndex = this.manager.pipes.findIndex(p => p.id === bagliBoruId);
                if (bagliBoruIndex !== -1) {
                    const bagliBoruZinciri = this.findConnectedPipesChain(this.manager.pipes[bagliBoruIndex]);
                    // Tüm zinciri sil
                    bagliBoruZinciri.forEach(pipe => {
                        const idx = this.manager.pipes.findIndex(p => p.id === pipe.id);
                        if (idx !== -1) this.manager.pipes.splice(idx, 1);
                    });
                }
            }

            // Servis kutusunu sil
            const index = this.manager.components.findIndex(c => c.id === obj.id);
            if (index !== -1) this.manager.components.splice(index, 1);
        } else {
            const index = this.manager.components.findIndex(c => c.id === obj.id);
            if (index !== -1) this.manager.components.splice(index, 1);
        }
    }

    /**
     * Bağlı boru zincirini bul (ileri yönde)
     */
    findConnectedPipesChain(startPipe) {
        const chain = [startPipe];
        const visited = new Set([startPipe.id]);

        let currentPipe = startPipe;
        const tolerance = 1; // 1 cm

        // İleri yönde zinciri takip et
        while (true) {
            const nextPipe = this.manager.pipes.find(p =>
                !visited.has(p.id) &&
                Math.hypot(p.p1.x - currentPipe.p2.x, p.p1.y - currentPipe.p2.y) < tolerance
            );

            if (!nextPipe) break;

            chain.push(nextPipe);
            visited.add(nextPipe.id);
            currentPipe = nextPipe;
        }

        return chain;
    }

    getGeciciBoruCizgisi() {
        if (!this.boruCizimAktif || !this.boruBaslangic || !this.geciciBoruBitis) {
            return null;
        }
        return { p1: this.boruBaslangic.nokta, p2: this.geciciBoruBitis };
    }
}
