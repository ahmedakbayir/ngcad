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
import { dom, state } from '../../general-files/main.js';

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

        // 3. Sürükleme
        if (this.isDragging && this.dragObject) {
            this.handleDrag(targetPoint);
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

        // 3. Nesne seçme/sürükleme
        const hitObject = this.findObjectAt(point);
        if (hitObject) {
            this.selectObject(hitObject);
            this.startDrag(hitObject, point);
            return true;
        }

        // 4. Boş alana tıklama - seçimi kaldır
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
        // ESC - iptal
        if (e.key === 'Escape') {
            this.cancelCurrentAction();
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

        const component = this.manager.tempComponent;

        // Listeye ekle
        this.manager.components.push(component);

        // Özel işlemler
        switch (component.type) {
            case 'servis_kutusu':
                this.startBoruCizim(component.getCikisNoktasi(), component.id);
                break;

            case 'sayac':
                this.handleSayacEkleme(component);
                break;

            case 'cihaz':
                if (component.bacaGerekliMi()) {
                    console.log('Baca modu başlatılabilir');
                }
                break;
        }

        // Temizle
        this.manager.tempComponent = null;
        this.manager.activeTool = null;
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

        const boru = createBoru(this.boruBaslangic.nokta, point, 'STANDART');
        boru.floorId = state.currentFloorId;

        if (this.boruBaslangic.kaynakId) {
            boru.setBaslangicBaglanti(
                this.boruBaslangic.kaynakTip,
                this.boruBaslangic.kaynakId
            );
        }

        this.manager.pipes.push(boru);

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

        const obj = this.selectedObject;

        if (obj.type === 'servis_kutusu') {
            if (confirm(obj.getDeleteInfo().uyari)) {
                this.removeObject(obj);
            }
        } else {
            this.removeObject(obj);
        }

        this.deselectObject();
    }

    findObjectAt(point) {
        // Önce boru uçlarını kontrol et (öncelikli)
        const boruUcu = this.findBoruUcuAt(point, 8);
        if (boruUcu) {
            const boru = this.manager.pipes.find(p => p.id === boruUcu.boruId);
            if (boru) {
                return {
                    type: 'boru_ucu',
                    boru: boru,
                    uc: boruUcu.uc, // 'p1' veya 'p2'
                    // move metodu endpoint için
                    move: (x, y) => {
                        if (boruUcu.uc === 'p1') {
                            boru.p1.x = x;
                            boru.p1.y = y;
                        } else {
                            boru.p2.x = x;
                            boru.p2.y = y;
                        }
                        return null;
                    }
                };
            }
        }

        for (const comp of this.manager.components) {
            if (comp.containsPoint && comp.containsPoint(point)) {
                return comp;
            }
        }

        for (const pipe of this.manager.pipes) {
            if (pipe.containsPoint && pipe.containsPoint(point)) {
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

    startDrag(obj, point) {
        this.isDragging = true;
        this.dragObject = obj;
        this.dragStart = { ...point };
    }

    handleDrag(point) {
        if (!this.dragObject) return;
        const result = this.dragObject.move(point.x, point.y);
        this.updateConnectedPipe(result);
    }

    endDrag() {
        this.isDragging = false;
        this.dragObject = null;
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
