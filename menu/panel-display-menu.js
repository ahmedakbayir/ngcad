// panel-display-menu.js
// Sol panel için görüntüleme modu menüsü

/**
 * Panel görüntüleme modunu ayarlar ve localStorage'a kaydeder
 * @param {string} mode - 'small-icon' | 'small-icon-text' | 'big-icon' | 'big-icon-text'
 */
function setPanelDisplayMode(mode) {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;

    // Tüm mod sınıflarını kaldır
    toolbar.classList.remove('display-small-icon', 'display-small-icon-text', 'display-big-icon', 'display-big-icon-text');

    // Yeni modu ekle
    toolbar.classList.add(`display-${mode}`);

    // Tercihi localStorage'a kaydet
    localStorage.setItem('panelDisplayMode', mode);

    // Menüyü kapat
    hidePanelDisplayMenu();

    console.log(`Panel görüntüleme modu değiştirildi: ${mode}`);
}

/**
 * Panel display menüsünü gösterir
 */
export function showPanelDisplayMenu(clientX, clientY) {
    const menu = document.getElementById('panel-display-menu');
    if (!menu) return;

    // Menüyü konumlandır
    const menuWidth = 200;
    const menuHeight = 150;
    let left = clientX;
    let top = clientY;

    // Ekran sınırlarını kontrol et
    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }
    if (top + menuHeight > window.innerHeight) {
        top = window.innerHeight - menuHeight - 10;
    }
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block';

    // Aktif modu vurgula
    const currentMode = localStorage.getItem('panelDisplayMode') || 'big-icon';
    document.querySelectorAll('.display-mode-option').forEach(btn => {
        const btnMode = btn.getAttribute('data-mode');
        if (btnMode === currentMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Dışarı tıklama dinleyicisini ayarla
    setTimeout(() => {
        const clickListener = (event) => {
            if (!menu.contains(event.target)) {
                hidePanelDisplayMenu();
            }
        };
        window.addEventListener('pointerdown', clickListener, { capture: true, once: true });
    }, 0);
}

/**
 * Panel display menüsünü gizler
 */
export function hidePanelDisplayMenu() {
    const menu = document.getElementById('panel-display-menu');
    if (menu) {
        menu.style.display = 'none';
    }
}

/**
 * Menü başlatma fonksiyonu
 */
export function initPanelDisplayMenu() {
    // Buton event listener'larını ayarla
    const buttons = document.querySelectorAll('.display-mode-option');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = btn.getAttribute('data-mode');
            setPanelDisplayMode(mode);
        });
    });

    // #toolbar elementine sağ tık event listener'ı ekle
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        toolbar.addEventListener('contextmenu', (e) => {
            // Sadece #toolbar div'inin kendisine tıklandığında aç, butonlara değil
            if (e.target.id === 'toolbar' || e.target.closest('#toolbar') === toolbar) {
                e.preventDefault();
                e.stopPropagation();
                showPanelDisplayMenu(e.clientX, e.clientY);
            }
        });
    }

    // Sayfa yüklendiğinde kaydedilmiş modu uygula
    const savedMode = localStorage.getItem('panelDisplayMode') || 'big-icon';
    if (toolbar) {
        toolbar.classList.remove('display-small-icon', 'display-small-icon-text', 'display-big-icon', 'display-big-icon-text');
        // Varsayılan mod artık big-icon olduğu için herzaman sınıfı ekle
        toolbar.classList.add(`display-${savedMode}`);
    }

    //console.log('Panel display menü başlatıldı. Aktif mod:', savedMode);
}
