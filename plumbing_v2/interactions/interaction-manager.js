/**
 * Interaction Manager (v2)
 * Kullanıcı etkileşimlerini (Mouse/Klavye) yönetir.
 */

// import { plumbingManager } from '../plumbing-manager.js'; // Removed circular dependency
import { SnapSystem } from './snap-system.js';
import { createPlumbingPipe } from '../objects/pipe.js'; // Factory fonksiyonları eklenecek
import { PLUMBING_COMPONENT_TYPES } from '../plumbing-types.js';
import { screenToWorld } from '../../draw/geometry.js'; // Import screenToWorld
import { dom, state } from '../../general-files/main.js'; // Import dom and state

export class InteractionManager {
    constructor(manager) {
        this.manager = manager;
        this.snapSystem = new SnapSystem(manager);
        this.activeSnap = null;
        this.isDragging = false;
        this.dragStart = null;
        this.dragObject = null;
    }

    /**
     * Mouse hareketini işler (Main loop'tan çağrılır)
     * @param {PointerEvent} e
     * @returns {boolean} - Olay işlendiyse true
     */
    handlePointerMove(e) {
        if (!this.manager.activeTool && !this.isDragging) return false;

        const rect = dom.c2d.getBoundingClientRect();
        const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const walls = state.walls; // Duvarları state'den al

        // 1. Snap Hesapla
        this.activeSnap = this.snapSystem.getSnapPoint(point, walls);
        const targetPoint = this.activeSnap ? { x: this.activeSnap.x, y: this.activeSnap.y } : point;

        // 2. Eğer bir eleman yerleştiriliyorsa (Ghost) onu güncelle
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.updateGhostPosition(this.manager.tempComponent, targetPoint, this.activeSnap);
            return true; // Olayı tükettik
        }

        // 3. Eğer sürükleme yapılıyorsa
        if (this.isDragging && this.dragObject) {
            this.handleDrag(targetPoint);
            return true; // Olayı tükettik
        }

        return false;
    }

    /**
     * Mouse tıklamasını işler
     * @param {PointerEvent} e
     * @returns {boolean} - Olay işlendiyse true
     */
    handlePointerDown(e) {
        if (!this.manager.activeTool && !this.isDragging) {
            // Eğer aktif tool yoksa, belki bir tesisat objesi seçilmek isteniyordur?
            // Şimdilik sadece aktif tool varsa veya sürükleme varsa müdahale edelim.
            // Ancak seçim mantığı da buraya eklenebilir.
            const rect = dom.c2d.getBoundingClientRect();
            const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            const hitObject = this.findObjectAt(point);
            if (hitObject) {
                this.startDrag(hitObject, point);
                return true;
            }
            return false;
        }

        const rect = dom.c2d.getBoundingClientRect();
        const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const targetPoint = this.activeSnap ? { x: this.activeSnap.x, y: this.activeSnap.y } : point;

        // 1. Yerleştirme Modu
        if (this.manager.activeTool) {
            this.placeComponent(targetPoint);
            return true;
        }

        return false;
    }

    handlePointerUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.dragObject = null;
            this.dragStart = null;
            return true;
        }
        return false;
    }

    /**
     * Ghost eleman pozisyonunu günceller
     */
    updateGhostPosition(ghost, point, snap) {
        ghost.x = point.x;
        ghost.y = point.y;

        // Özel durumlar:
        // Servis Kutusu: Duvara snap olduysa açısını ayarla
        if (ghost.type === 'service_box' && snap && snap.target && snap.target.angle !== undefined) {
            ghost.rotation = snap.target.angle;
        }

        // Sayaç/Vana: Boruya snap olduysa açısını ayarla
        if ((ghost.type === 'meter' || ghost.type === 'valve') && snap && snap.target && snap.target.type === 'pipe') {
            // Boru açısını al
            const pipe = snap.target;
            const angle = Math.atan2(pipe.p2.y - pipe.p1.y, pipe.p2.x - pipe.p1.x) * 180 / Math.PI;
            ghost.rotation = angle;
        }
    }

    /**
     * Bileşeni sahneye kalıcı olarak ekler
     */
    placeComponent(point) {
        if (!this.manager.tempComponent) return;

        const component = this.manager.tempComponent;

        // 1. Listeye ekle
        this.manager.components.push(component);

        // 2. Özel Mantıklar (Zincirleme Aksiyonlar)
        if (component.type === 'service_box') {
            // Otomatik Boru Moduna Geç
            console.log('📦 Servis kutusu eklendi -> Boru moduna geçiliyor');
            // this.manager.startPlacement('PIPE'); // TODO: Pipe modu eklenecek
        }
        else if (component.type === 'meter') {
            // Otomatik Vana Kontrolü
            this.checkAndAddAutoValve(component);
        }

        // 3. Geçici elemanı temizle
        this.manager.tempComponent = null;
        this.manager.activeTool = null;
    }

    /**
     * Sayaç eklendiğinde gerekirse önüne vana ekler
     */
    checkAndAddAutoValve(meter) {
        // Eğer sayaç bir boru ucuna eklendiyse ve orada vana yoksa...
        // Bu mantık daha detaylı implemente edilecek
        console.log('🔍 Otomatik vana kontrolü yapılıyor...');
    }

    findObjectAt(point) {
        // Basit hit test
        // Tüm bileşenleri ve boruları tara
        return null;
    }

    startDrag(object, point) {
        this.isDragging = true;
        this.dragObject = object;
        this.dragStart = point;
    }

    handleDrag(point) {
        // Objeyi taşı
        this.dragObject.x = point.x;
        this.dragObject.y = point.y;

        // Bağlı boruları güncelle (Servis kutusu vb.)
        if (this.dragObject.type === 'service_box') {
            // Bağlı boruyu sürükle
        }
    }
}
