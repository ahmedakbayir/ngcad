// icon-container-manager.js
// Gelişmiş İkon Container Yönetim Sistemi

/**
 * İkon containerları için boyutlandırma, grid düzeni ve sürükle-bırak özellikleri
 */

export class IconContainerManager {
    constructor() {
        this.containers = new Map(); // container ID -> config
        this.dragging = null;
        this.resizing = null;
        this.iconDragging = null;
    }

    /**
     * Tüm containerları başlat
     */
    initialize() {
        const groups = document.querySelectorAll('.draggable-group');
        groups.forEach(group => this.initializeContainer(group));
    }

    /**
     * Tek bir container'ı başlat
     */
    initializeContainer(container) {
        const id = container.id;

        // Varsayılan config
        const defaultConfig = {
            layout: 'column', // 'row', 'column', 'grid'
            gridColumns: 1,
            iconSize: 'normal', // 'normal' veya '2x'
            minWidth: 120,
            minHeight: 60
        };

        // localStorage'dan config yükle
        const savedConfig = localStorage.getItem(`container-config-${id}`);
        const config = savedConfig ? JSON.parse(savedConfig) : defaultConfig;

        this.containers.set(id, config);

        // Resize handle ekle
        this.addResizeHandle(container);

        // Layout uygula
        this.applyLayout(container, config);

        // Sağ tık menüsü ekle
        this.addContextMenu(container);

        // İkonları sürüklenebilir yap
        this.makeIconsDraggable(container);

        // Kayıtlı boyutları yükle
        this.loadSize(container);
    }

    /**
     * Resize handle ekle (sağ alt köşe)
     */
    addResizeHandle(container) {
        // Var olan handle'ı kaldır
        const existingHandle = container.querySelector('.resize-handle');
        if (existingHandle) existingHandle.remove();

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12">
                <path d="M21 11L13 3M21 19L19 21M13 21L21 13" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" fill="none"/>
            </svg>
        `;
        container.appendChild(handle);

        // Resize event listeners
        let startX, startY, startWidth, startHeight;

        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();

            this.resizing = container;
            startX = e.clientX;
            startY = e.clientY;

            const rect = container.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            container.classList.add('resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.resizing || this.resizing !== container) return;

            e.preventDefault();

            const config = this.containers.get(container.id);
            const buttons = container.querySelectorAll('.btn');

            // Minimum ve maksimum boyutları hesapla
            let minWidth = config.minWidth || 120;
            let minHeight = config.minHeight || 60;
            let maxWidth = 800; // Maksimum genişlik
            let maxHeight = 600; // Maksimum yükseklik

            if (buttons.length > 0) {
                const firstBtn = buttons[0];
                const btnRect = firstBtn.getBoundingClientRect();
                const gap = 6; // CSS'teki gap değeri
                const padding = 16; // Container padding (8px * 2)
                const labelHeight = 30; // Label yüksekliği (yaklaşık)

                if (config.layout === 'row') {
                    // Yatay: minimum = tüm ikonlar yan yana sığmalı
                    minWidth = (btnRect.width + gap) * buttons.length - gap + padding;
                    minHeight = btnRect.height + labelHeight + padding;
                    // Maksimum: tek satırda mantıklı genişlik
                    maxWidth = minWidth + 200; // Biraz ekstra alan
                    maxHeight = minHeight + 50;
                } else if (config.layout === 'column') {
                    // Dikey: minimum = en geniş ikon + padding
                    minWidth = btnRect.width + padding;
                    minHeight = (btnRect.height + gap) * buttons.length - gap + labelHeight + padding;
                    // Maksimum: tek sütunda mantıklı yükseklik
                    maxWidth = minWidth + 100;
                    maxHeight = minHeight + 100;
                } else if (config.layout === 'grid') {
                    const cols = config.gridColumns || 2;
                    const rows = Math.ceil(buttons.length / cols);
                    // Grid: minimum = grid'e sığacak kadar
                    minWidth = (btnRect.width + gap) * cols - gap + padding;
                    minHeight = (btnRect.height + gap) * rows - gap + labelHeight + padding;
                    // Maksimum: grid + biraz ekstra
                    maxWidth = minWidth + 100;
                    maxHeight = minHeight + 100;
                }
            }

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Yeni boyutları hesapla
            let newWidth = startWidth + deltaX;
            let newHeight = startHeight + deltaY;

            // SNAP TO GRID: İkon boyutlarına hizala (daha düzenli görünüm)
            if (buttons.length > 0 && config.layout === 'grid') {
                const firstBtn = buttons[0];
                const btnRect = firstBtn.getBoundingClientRect();
                const gap = 6;
                const snapSize = btnRect.width + gap;

                // En yakın grid boyutuna yuvarla
                const cols = Math.max(1, Math.round((newWidth - 16) / snapSize));
                newWidth = cols * snapSize + 16 - gap;
            }

            // Min/max sınırlarına uygula
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

            // Viewport sınırlarını kontrol et
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const containerRect = container.getBoundingClientRect();

            if (containerRect.left + newWidth > viewportWidth - 20) {
                newWidth = viewportWidth - containerRect.left - 20;
            }
            if (containerRect.top + newHeight > viewportHeight - 20) {
                newHeight = viewportHeight - containerRect.top - 20;
            }

            container.style.width = newWidth + 'px';
            container.style.height = newHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.resizing === container) {
                this.resizing = null;
                container.classList.remove('resizing');
                this.saveSize(container);
            }
        });
    }

    /**
     * Layout uygula
     */
    applyLayout(container, config) {
        const buttonsContainer = container.querySelector('.buttons-container') || container;

        if (config.layout === 'row') {
            buttonsContainer.style.flexDirection = 'row';
            buttonsContainer.style.flexWrap = 'wrap';
            buttonsContainer.style.display = 'flex';
            buttonsContainer.style.gridTemplateColumns = '';
        } else if (config.layout === 'column') {
            buttonsContainer.style.flexDirection = 'column';
            buttonsContainer.style.flexWrap = 'nowrap';
            buttonsContainer.style.display = 'flex';
            buttonsContainer.style.gridTemplateColumns = '';
        } else if (config.layout === 'grid') {
            buttonsContainer.style.display = 'grid';
            buttonsContainer.style.gridTemplateColumns = `repeat(${config.gridColumns || 2}, 1fr)`;
            buttonsContainer.style.flexDirection = '';
            buttonsContainer.style.flexWrap = '';
        }
    }

    /**
     * Sağ tık menüsü ekle
     */
    addContextMenu(container) {
        const label = container.querySelector('.group-label');
        if (!label) return;

        label.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(container, e.clientX, e.clientY);
        });
    }

    /**
     * Context menü göster
     */
    showContextMenu(container, x, y) {
        // Var olan menüyü kaldır
        const existingMenu = document.querySelector('.container-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'container-context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        const config = this.containers.get(container.id);

        menu.innerHTML = `
            <div class="menu-section">
                <div class="menu-title">Düzen</div>
                <button class="menu-item ${config.layout === 'row' ? 'active' : ''}" data-action="layout-row">
                    ➡️ Yatay Dizi
                </button>
                <button class="menu-item ${config.layout === 'column' ? 'active' : ''}" data-action="layout-column">
                    ⬇️ Dikey Dizi
                </button>
                <button class="menu-item ${config.layout === 'grid' ? 'active' : ''}" data-action="layout-grid">
                    ⊞ Grid Düzeni
                </button>
            </div>
            ${config.layout === 'grid' ? `
                <div class="menu-section">
                    <div class="menu-title">Grid Sütun Sayısı</div>
                    <div class="grid-columns-control">
                        <button class="menu-item" data-action="grid-cols-2">2 Sütun</button>
                        <button class="menu-item" data-action="grid-cols-3">3 Sütun</button>
                        <button class="menu-item" data-action="grid-cols-4">4 Sütun</button>
                        <button class="menu-item" data-action="grid-cols-5">5 Sütun</button>
                    </div>
                </div>
            ` : ''}
            <div class="menu-section">
                <div class="menu-title">Boyut Sıfırla</div>
                <button class="menu-item" data-action="reset-size">
                    ↺ Varsayılan Boyut
                </button>
            </div>
        `;

        document.body.appendChild(menu);

        // Menu item click handlers
        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.getAttribute('data-action');
                this.handleMenuAction(container, action);
                menu.remove();
            });
        });

        // Close menu on outside click
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * Menu aksiyonlarını handle et
     */
    handleMenuAction(container, action) {
        const config = this.containers.get(container.id);

        if (action.startsWith('layout-')) {
            const layout = action.replace('layout-', '');
            config.layout = layout;
            if (layout === 'grid' && !config.gridColumns) {
                config.gridColumns = 2;
            }
            this.applyLayout(container, config);
            this.saveConfig(container);
        } else if (action.startsWith('grid-cols-')) {
            const cols = parseInt(action.replace('grid-cols-', ''));
            config.gridColumns = cols;
            this.applyLayout(container, config);
            this.saveConfig(container);
        } else if (action === 'reset-size') {
            container.style.width = '';
            container.style.height = '';
            this.saveSize(container);
        }
    }

    /**
     * İkonları sürüklenebilir yap
     */
    makeIconsDraggable(container) {
        const buttons = container.querySelectorAll('.btn');

        buttons.forEach((button, index) => {
            // 2x boyut toggle için double-click
            button.addEventListener('dblclick', (e) => {
                if (e.target.closest('.drag-handle')) return;
                e.stopPropagation();
                this.toggleIconSize(button, container);
            });

            // Sürükleme için icon area (SVG ve text hariç handle)
            button.setAttribute('draggable', 'false'); // HTML5 drag'i devre dışı

            let dragStartX, dragStartY, draggedElement;

            button.addEventListener('mousedown', (e) => {
                // Eğer drag-handle'a tıklanmışsa veya resize-handle'a tıklanmışsa ignore et
                if (e.target.closest('.drag-handle') || e.target.closest('.resize-handle')) return;

                // Sadece sol tık
                if (e.button !== 0) return;

                dragStartX = e.clientX;
                dragStartY = e.clientY;
                draggedElement = button;

                const moveThreshold = 5; // 5px hareket etmeden drag başlamasın

                const moveHandler = (moveEvent) => {
                    const deltaX = Math.abs(moveEvent.clientX - dragStartX);
                    const deltaY = Math.abs(moveEvent.clientY - dragStartY);

                    if (deltaX > moveThreshold || deltaY > moveThreshold) {
                        // Drag başladı
                        this.startIconDrag(button, container, moveEvent);
                        document.removeEventListener('mousemove', moveHandler);
                    }
                };

                const upHandler = () => {
                    document.removeEventListener('mousemove', moveHandler);
                    document.removeEventListener('mouseup', upHandler);
                };

                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('mouseup', upHandler);
            });
        });
    }

    /**
     * İkon sürüklemeyi başlat
     */
    startIconDrag(button, container, e) {
        e.preventDefault();

        // Placeholder oluştur
        const placeholder = document.createElement('div');
        placeholder.className = 'icon-drag-placeholder btn';
        placeholder.style.width = button.offsetWidth + 'px';
        placeholder.style.height = button.offsetHeight + 'px';
        placeholder.style.visibility = 'hidden';

        // Dragging clone oluştur
        const clone = button.cloneNode(true);
        clone.className = 'icon-dragging btn';
        clone.style.position = 'fixed';
        clone.style.zIndex = '10000';
        clone.style.pointerEvents = 'none';
        clone.style.opacity = '0.8';

        // Mouse pozisyonuna göre clone'u yerleştir
        const updateClonePosition = (mouseX, mouseY) => {
            clone.style.left = (mouseX - button.offsetWidth / 2) + 'px';
            clone.style.top = (mouseY - button.offsetHeight / 2) + 'px';
        };

        updateClonePosition(e.clientX, e.clientY);

        // Button'un yerine placeholder koy
        button.parentNode.insertBefore(placeholder, button);
        button.style.display = 'none';

        document.body.appendChild(clone);

        this.iconDragging = {
            button,
            placeholder,
            clone,
            container
        };

        // Mouse move handler
        const moveHandler = (moveEvent) => {
            if (!this.iconDragging) return;

            updateClonePosition(moveEvent.clientX, moveEvent.clientY);

            // Hangi button üzerindeyiz?
            const buttons = Array.from(container.querySelectorAll('.btn:not(.icon-dragging)'));
            const overButton = buttons.find(btn => {
                if (btn === placeholder) return false;
                const rect = btn.getBoundingClientRect();
                return moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right &&
                       moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom;
            });

            if (overButton) {
                // Placeholder'ı bu button'un önüne veya arkasına taşı
                const rect = overButton.getBoundingClientRect();
                const config = this.containers.get(container.id);

                if (config.layout === 'row' || config.layout === 'grid') {
                    // Yatay veya grid: sağ/sol
                    if (moveEvent.clientX < rect.left + rect.width / 2) {
                        overButton.parentNode.insertBefore(placeholder, overButton);
                    } else {
                        overButton.parentNode.insertBefore(placeholder, overButton.nextSibling);
                    }
                } else {
                    // Dikey: üst/alt
                    if (moveEvent.clientY < rect.top + rect.height / 2) {
                        overButton.parentNode.insertBefore(placeholder, overButton);
                    } else {
                        overButton.parentNode.insertBefore(placeholder, overButton.nextSibling);
                    }
                }
            }
        };

        // Mouse up handler
        const upHandler = () => {
            if (!this.iconDragging) return;

            // Placeholder'ın yerine gerçek button'u koy
            placeholder.parentNode.insertBefore(button, placeholder);
            placeholder.remove();
            button.style.display = '';
            clone.remove();

            // Icon sırasını kaydet
            this.saveIconOrder(container);

            this.iconDragging = null;

            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }

    /**
     * İkon boyutunu toggle et (normal <-> 2x)
     */
    toggleIconSize(button, container) {
        const is2x = button.classList.contains('icon-2x');

        if (is2x) {
            button.classList.remove('icon-2x');
        } else {
            button.classList.add('icon-2x');
        }

        this.saveIconSizes(container);
    }

    /**
     * Config kaydet
     */
    saveConfig(container) {
        const config = this.containers.get(container.id);
        localStorage.setItem(`container-config-${container.id}`, JSON.stringify(config));
    }

    /**
     * Boyut kaydet
     */
    saveSize(container) {
        const data = {
            width: container.style.width,
            height: container.style.height
        };
        localStorage.setItem(`container-size-${container.id}`, JSON.stringify(data));
    }

    /**
     * Boyut yükle
     */
    loadSize(container) {
        const saved = localStorage.getItem(`container-size-${container.id}`);
        if (saved) {
            const { width, height } = JSON.parse(saved);
            if (width) container.style.width = width;
            if (height) container.style.height = height;
        }
    }

    /**
     * İkon sırasını kaydet
     */
    saveIconOrder(container) {
        const buttons = Array.from(container.querySelectorAll('.btn'));
        const order = buttons.map(btn => btn.id);
        localStorage.setItem(`container-icon-order-${container.id}`, JSON.stringify(order));
    }

    /**
     * İkon boyutlarını kaydet
     */
    saveIconSizes(container) {
        const buttons = Array.from(container.querySelectorAll('.btn'));
        const sizes = buttons.map(btn => ({
            id: btn.id,
            is2x: btn.classList.contains('icon-2x')
        }));
        localStorage.setItem(`container-icon-sizes-${container.id}`, JSON.stringify(sizes));
    }

    /**
     * İkon sırasını yükle
     */
    loadIconOrder(container) {
        const saved = localStorage.getItem(`container-icon-order-${container.id}`);
        if (!saved) return;

        const order = JSON.parse(saved);
        const buttons = new Map();

        container.querySelectorAll('.btn').forEach(btn => {
            buttons.set(btn.id, btn);
        });

        // Sıralamayı uygula
        const parent = container.querySelector('.buttons-container') || container;
        const label = container.querySelector('.group-label');
        const resizeHandle = container.querySelector('.resize-handle');

        order.forEach(id => {
            const btn = buttons.get(id);
            if (btn) {
                parent.appendChild(btn);
            }
        });

        // Label ve resize handle'ı en sona taşı
        if (label) parent.insertBefore(label, parent.firstChild);
        if (resizeHandle) parent.appendChild(resizeHandle);
    }

    /**
     * İkon boyutlarını yükle
     */
    loadIconSizes(container) {
        const saved = localStorage.getItem(`container-icon-sizes-${container.id}`);
        if (!saved) return;

        const sizes = JSON.parse(saved);
        sizes.forEach(({ id, is2x }) => {
            const btn = container.querySelector(`#${id}`);
            if (btn && is2x) {
                btn.classList.add('icon-2x');
            }
        });
    }
}

// Export singleton instance
export const iconContainerManager = new IconContainerManager();
