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
import { dom, state, setMode } from '../../general-files/main.js';
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

        // Sürükleme durumu
        this.isDragging = false;
        this.dragStart = null;
        this.dragObject = null;

        // Seçili nesne
        this.selectedObject = null;
    }

    /**
     * Mouse hareketi
     */
    handlePointerMove(e) {
        if (!this.manager.activeTool && !this.isDragging && !this.boruCizimAktif) {
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
            this.geciciBoruBitis = targetPoint;
            return true;
        }

        // 2. Ghost eleman yerleştirme
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.updateGhostPosition(this.manager.tempComponent, targetPoint, this.activeSnap);
            return true;
        }

        // 3. Sürükleme - raw point kullan (handleDrag içinde gerekli snap yapılır)
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

        // 2. Yerleştirme modu
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.placeComponent(targetPoint);
            return true;
        }

        // 3. Boru uç noktası sürükleme - seçim gerektirmez
        // Herhangi bir modda boru uç noktalarından doğrudan tutulup sürüklenebilir
        if (state.currentMode === 'select' || !this.boruCizimAktif) {
            // Önce boru uç noktası kontrolü yap
            const boruUcu = this.findBoruUcuAt(point, 8);
            if (boruUcu) {
                const pipe = this.manager.pipes.find(p => p.id === boruUcu.boruId);
                if (pipe) {
                    // Seçim yapmadan doğrudan uç nokta sürüklemesi başlat
                    this.startEndpointDrag(pipe, boruUcu.uc, point);
                    return true;
                }
            }

            // Sonra bileşen seçimi (sadece bileşenler seçilebilir, borular değil)
            const hitObject = this.findObjectAt(point);
            if (hitObject && hitObject.type !== 'boru') {
                // Araç aktifken ghost varsa seçim yapma
                if (this.manager.activeTool && this.manager.tempComponent) {
                    // Ghost yerleştirme modu - seçim yapma
                } else {
                    this.selectObject(hitObject);
                    this.startDrag(hitObject, point);
                    return true;
                }
            }
        }

        // Seç modunda çizim başlatma
        if (state.currentMode === 'select') {
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

        return false;
    }

    /**
     * Ghost pozisyon güncelleme
     */
    updateGhostPosition(ghost, point, snap) {
        ghost.x = point.x;
        ghost.y = point.y;

        // Servis kutusu - duvara snap
        if (ghost.type === 'servis_kutusu' && snap && snap.target) {
            if (snap.target.wall) {
                ghost.snapToWall(snap.target.wall, point);
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

        // Undo için state kaydet
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
     * Mevcut işlemi iptal et
     */
    cancelCurrentAction() {
        if (this.boruCizimAktif) {
            this.boruCizimAktif = false;
            this.boruBaslangic = null;
            this.geciciBoruBitis = null;
            this.snapSystem.clearStartPoint();
        }

        if (this.manager.tempComponent) {
            this.manager.tempComponent = null;
        }

        this.manager.activeTool = null;
    }

    selectObject(obj) {
        this.selectedObject = obj;
        obj.isSelected = true;
    }

    deselectObject() {
        if (this.selectedObject) {
            this.selectedObject.isSelected = false;
            this.selectedObject = null;
        }
    }

    deleteSelectedObject() {
        if (!this.selectedObject) return;

        // Undo için state kaydet
        saveState();
        this.manager.saveToState();

        const obj = this.selectedObject;

        if (obj.type === 'servis_kutusu') {
            if (confirm(obj.getDeleteInfo().uyari)) {
                this.removeObject(obj);
                this.manager.saveToState();
            }
        } else {
            this.removeObject(obj);
            this.manager.saveToState();
        }

        this.deselectObject();
    }

    findObjectAt(point) {
        // Sadece bileşenler seçilebilir (servis kutusu, sayaç, vana, cihaz)
        // Borular seçilemez - sadece uç noktalarından sürüklenebilir
        for (const comp of this.manager.components) {
            if (comp.containsPoint && comp.containsPoint(point)) {
                return comp;
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

    handleDrag(point) {
        if (!this.dragObject) return;

        // Uç nokta sürükleme
        if (this.dragEndpoint && this.dragObject.type === 'boru') {
            const pipe = this.dragObject;
            const oldPoint = this.dragEndpoint === 'p1' ? { ...pipe.p1 } : { ...pipe.p2 };

            if (this.dragEndpoint === 'p1') {
                pipe.p1.x = point.x;
                pipe.p1.y = point.y;
            } else {
                pipe.p2.x = point.x;
                pipe.p2.y = point.y;
            }

            // Bağlı boruları güncelle
            this.manager.pipes.forEach(otherPipe => {
                if (otherPipe.id === pipe.id) return;

                if (Math.abs(otherPipe.p1.x - oldPoint.x) < 0.1 && Math.abs(otherPipe.p1.y - oldPoint.y) < 0.1) {
                    otherPipe.p1.x = point.x;
                    otherPipe.p1.y = point.y;
                }
                if (Math.abs(otherPipe.p2.x - oldPoint.x) < 0.1 && Math.abs(otherPipe.p2.y - oldPoint.y) < 0.1) {
                    otherPipe.p2.x = point.x;
                    otherPipe.p2.y = point.y;
                }
            });
            return;
        }

        // Servis kutusu için snap uygula (ilk yerleştirildiği gibi)
        if (this.dragObject.type === 'servis_kutusu') {
            const walls = state.walls;
            const snap = this.snapSystem.getSnapPoint(point, walls);

            if (snap && snap.target && snap.target.wall) {
                this.dragObject.snapToWall(snap.target.wall, point);
            } else {
                this.dragObject.x = point.x;
                this.dragObject.y = point.y;
            }

            // Bağlı boruyu güncelle
            if (this.dragObject.bagliBoruId) {
                const boru = this.manager.pipes.find(p => p.id === this.dragObject.bagliBoruId);
                if (boru) {
                    boru.moveP1(this.dragObject.getCikisNoktasi());
                }
            }
            return;
        }

        // Boru gövdesi olarak taşınmaz - sadece uç noktalar taşınır
        if (this.dragObject.type === 'boru') {
            return;
        }

        const result = this.dragObject.move(point.x, point.y);
        this.updateConnectedPipe(result);
    }

    endDrag() {
        this.isDragging = false;
        this.dragObject = null;
        this.dragEndpoint = null;
        this.dragStart = null;
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
                nextPipe.p1.x = deletedPipe.p1.x;
                nextPipe.p1.y = deletedPipe.p1.y;

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
                            servisKutusu.boruBagla(nextPipe.id);
                        }
                    }
                }
            }

            const index = this.manager.pipes.findIndex(p => p.id === obj.id);
            if (index !== -1) this.manager.pipes.splice(index, 1);
        } else {
            const index = this.manager.components.findIndex(c => c.id === obj.id);
            if (index !== -1) this.manager.components.splice(index, 1);
        }
    }

    getGeciciBoruCizgisi() {
        if (!this.boruCizimAktif || !this.boruBaslangic || !this.geciciBoruBitis) {
            return null;
        }
        return { p1: this.boruBaslangic.nokta, p2: this.geciciBoruBitis };
    }
}
