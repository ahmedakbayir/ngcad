/**
 * menu-positioning.js
 * Sağ tık menüleri için viewport-safe konumlandırma yardımcıları.
 *  - placeMenuInViewport: top-level menüyü ekrana sığacak şekilde konumlandırır.
 *  - setupSubmenuPositioning: her .context-menu-item-with-submenu öğesi için
 *    alt menünün açılış yönünü (sağ/sol, yukarı/aşağı) viewport'a göre seçer.
 */

const MARGIN = 8;

export function placeMenuInViewport(menuEl, x, y) {
    if (!menuEl) return;
    menuEl.style.left = `${x + 5}px`;
    menuEl.style.top  = `${y + 5}px`;
    // Boyut hesaplandıktan sonra düzeltme — sağ/alt taşmayı kes, sonra sol/üst kenarı garanti et.
    requestAnimationFrame(() => {
        if (!menuEl) return;
        const r  = menuEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = parseFloat(menuEl.style.left) || 0;
        let top  = parseFloat(menuEl.style.top)  || 0;
        if (r.right  > vw - MARGIN) left = vw - r.width  - MARGIN;
        if (r.bottom > vh - MARGIN) top  = vh - r.height - MARGIN;
        if (left < MARGIN) left = MARGIN;
        if (top  < MARGIN) top  = MARGIN;
        menuEl.style.left = `${left}px`;
        menuEl.style.top  = `${top}px`;
    });
}

export function setupSubmenuPositioning(menuEl) {
    if (!menuEl || menuEl._submenuPosInitialized) return;
    menuEl._submenuPosInitialized = true;

    const items = menuEl.querySelectorAll('.context-menu-item-with-submenu');
    items.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const submenu = item.querySelector(':scope > .context-submenu');
            if (!submenu) return;

            const itemRect = item.getBoundingClientRect();
            const subRect  = submenu.getBoundingClientRect();
            const subW = subRect.width  || 200;
            const subH = subRect.height || 280;

            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Yatay: önce sağa dene; sığmıyorsa ve sola yer varsa sola çevir
            const wouldClipRight = itemRect.right + subW > vw - MARGIN;
            const fitsOnLeft     = itemRect.left  - subW >= MARGIN;
            item.classList.toggle('submenu-open-left', wouldClipRight && fitsOnLeft);

            // Dikey: önce üstten itemRect.top hizasına; sığmıyorsa yukarı doğru aç
            const wouldClipBottom = itemRect.top    + subH > vh - MARGIN;
            const fitsAbove       = itemRect.bottom - subH >= MARGIN;
            item.classList.toggle('submenu-open-up', wouldClipBottom && fitsAbove);
        });
    });
}
