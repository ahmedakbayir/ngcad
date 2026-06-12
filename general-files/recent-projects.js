// recent-projects.js
// Son açılan/kaydedilen 8 projeyi IndexedDB'de tutar (FileSystemHandle structured-clone gerektirir).

const DB_NAME = 'aangcad-recents';
const STORE = 'recents';
const MAX_RECENTS = 8;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function txStore(db, mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
}

async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = txStore(db, 'readonly').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function putRecord(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = txStore(db, 'readwrite').put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteById(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = txStore(db, 'readwrite').delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function recordRecent(handle, name) {
    if (!handle || typeof handle.isSameEntry !== 'function') return;
    try {
        const existing = await getAll();
        for (const r of existing) {
            try {
                if (r.handle && await r.handle.isSameEntry(handle)) {
                    await deleteById(r.id);
                }
            } catch (e) { /* stale entry */ }
        }
        const remaining = (await getAll()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        for (const r of remaining.slice(MAX_RECENTS - 1)) {
            try { await deleteById(r.id); } catch (e) {}
        }
        await putRecord({
            handle,
            name: name || handle.name || 'Proje',
            savedAt: Date.now(),
        });
    } catch (e) {
        console.warn('recordRecent failed:', e);
    }
}

export async function getRecents() {
    try {
        const all = await getAll();
        return all.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    } catch (e) {
        return [];
    }
}

async function openRecentById(id) {
    let rec = null;
    try {
        const all = await getAll();
        rec = all.find(r => r.id === id);
    } catch (e) {}
    if (!rec || !rec.handle) {
        alert('Bu proje listede bulunamadı.');
        return;
    }

    try {
        // Açışta yalnızca okuma izni — Chromium "değişiklikleri kaydet" diyaloğunu açmasın.
        // Yazma izni ilk Kaydet anında ayrıca istenir.
        const queryFn = rec.handle.queryPermission?.bind(rec.handle);
        const requestFn = rec.handle.requestPermission?.bind(rec.handle);
        let perm = queryFn ? await queryFn({ mode: 'read' }) : 'prompt';
        if (perm !== 'granted' && requestFn) {
            perm = await requestFn({ mode: 'read' });
        }
        if (perm !== 'granted') {
            alert('Dosyaya erişim izni verilmedi.');
            return;
        }

        const { openProjectFromHandle } = await import('./file-io.js');
        await openProjectFromHandle(rec.handle, rec.name);
    } catch (err) {
        console.error('Recent open failed:', err);
        if (err && (err.name === 'NotFoundError' || err.name === 'NotAllowedError')) {
            if (confirm(`"${rec.name}" açılamadı. Listeden kaldırılsın mı?`)) {
                try { await deleteById(rec.id); } catch (e) {}
            }
        } else {
            alert('Proje açılamadı: ' + (err?.message || err));
        }
    }
}

function timeAgoTr(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'az önce';
    if (min < 60) return `${min} dk`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} sa`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} g`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk} hf`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo} ay`;
    return `${Math.floor(day / 365)} yıl`;
}

export async function renderRecentMenu(containerEl, separatorEl) {
    if (!containerEl) return;
    const recents = await getRecents();
    containerEl.innerHTML = '';
    if (!recents.length) {
        if (separatorEl) separatorEl.style.display = 'none';
        return;
    }
    if (separatorEl) separatorEl.style.display = '';

    const header = document.createElement('div');
    header.className = 'menu-recent-header';
    header.textContent = 'SON AÇILANLAR';
    containerEl.appendChild(header);

    for (const r of recents) {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'menu-recent-item';
        a.title = r.name;
        a.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span class="menu-recent-name"></span>
            <span class="menu-recent-time"></span>
        `;
        a.querySelector('.menu-recent-name').textContent = r.name;
        a.querySelector('.menu-recent-time').textContent = timeAgoTr(r.savedAt);
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            document.getElementById('mainMenuContent')?.parentElement.classList.remove('show');
            await openRecentById(r.id);
        });
        a.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            if (confirm(`"${r.name}" listeden kaldırılsın mı?`)) {
                try { await deleteById(r.id); } catch (err) {}
                await renderRecentMenu(containerEl, separatorEl);
            }
        });
        containerEl.appendChild(a);
    }
}
