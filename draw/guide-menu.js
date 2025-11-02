// guide-menu.js
import { getOrCreateNode } from './geometry.js';
import { state, setState, dom, setMode } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';

let guideMenuEl = null;
let menuWorldPos = null;
let clickOutsideListener = null;

export function initGuideContextMenu() {
    guideMenuEl = document.getElementById('guide-context-menu');
    
    if (!guideMenuEl) {
        console.error("Guide context menu element not found!");
        return;
    }

    document.getElementById('guide-btn-point').addEventListener('click', () => {
        if (menuWorldPos) {
            if (!state.guides) state.guides = [];
            state.guides.push({ type: 'guide', subType: 'point', x: menuWorldPos.x, y: menuWorldPos.y });
            saveState();
        }
        hideGuideContextMenu();
    });

    document.getElementById('guide-btn-horizontal').addEventListener('click', () => {
        if (menuWorldPos) {
            if (!state.guides) state.guides = [];
            state.guides.push({ type: 'guide', subType: 'horizontal', y: menuWorldPos.y });
            saveState();
        }
        hideGuideContextMenu();
    });

    document.getElementById('guide-btn-vertical').addEventListener('click', () => {
        if (menuWorldPos) {
            if (!state.guides) state.guides = [];
            state.guides.push({ type: 'guide', subType: 'vertical', x: menuWorldPos.x });
            saveState();
        }
        hideGuideContextMenu();
    });

    document.getElementById('guide-btn-angular').addEventListener('click', () => {
        if (menuWorldPos) {
            setMode('drawGuideAngular', true);
            // Use getOrCreateNode to be consistent with other drawing modes
            setState({ startPoint: getOrCreateNode(menuWorldPos.x, menuWorldPos.y) });
        }
        hideGuideContextMenu();
    });
    
    document.getElementById('guide-btn-free').addEventListener('click', () => {
        if (menuWorldPos) {
            setMode('drawGuideFree', true);
            setState({ startPoint: getOrCreateNode(menuWorldPos.x, menuWorldPos.y) });
        }
        hideGuideContextMenu();
    });
}

export function showGuideContextMenu(screenX, screenY, worldPos) {
    if (!guideMenuEl) initGuideContextMenu();
    if (!guideMenuEl) return; // Still not found
    
    menuWorldPos = worldPos;
    
    guideMenuEl.style.left = `${screenX + 5}px`;
    guideMenuEl.style.top = `${screenY + 5}px`;
    guideMenuEl.style.display = 'block';

    // Adjust position if it goes off-screen
    setTimeout(() => {
        const rect = guideMenuEl.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            guideMenuEl.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            guideMenuEl.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }, 0);

    // Add click outside listener
    clickOutsideListener = (event) => {
        if (guideMenuEl && !guideMenuEl.contains(event.target)) {
            hideGuideContextMenu();
        }
    };
    // Use setTimeout to avoid capturing the same click that opened the menu
    setTimeout(() => window.addEventListener('pointerdown', clickOutsideListener, { capture: true, once: true }), 0);
}

export function hideGuideContextMenu() {
    if (guideMenuEl) {
        guideMenuEl.style.display = 'none';
    }
    if (clickOutsideListener) {
        window.removeEventListener('pointerdown', clickOutsideListener, { capture: true });
        clickOutsideListener = null;
    }
    menuWorldPos = null;
}