// onboarding/web-bootstrap.js
// CAD açılış akışı:
//   1) Supabase session var mı? Yoksa native login dialog.
//   2) Aktif firma (PF/DF) seçimi: tek seçenek varsa otomatik, çoksa picker.
//   3) URL'de ?project=ID varsa projeyi web'ten yükle.
//   4) Topbar rozeti: 👤 kullanıcı · PF · DF · 📁 proje  +  Firma değiştir / Çıkış.

import { getProjectIdFromUrl, loadProjectFromWeb, openWebPanel, openProjectInPanel } from './web-bridge.js';
import { loadJSONProject, saveProject } from '../general-files/file-io.js';
import { getCurrentUser, getCurrentUserProfile, signOut, onAuthChange } from './web-auth.js';
import { showLoginDialog } from './login-dialog.js';
import { ensureActiveFirm, openFirmPicker, getActiveFirm, clearActiveFirm, ERR_NO_FIRM_MEMBERSHIP, ERR_USER_CANCELED } from './firm-picker.js';

// ─── Akış orchestration ────────────────────────────────────────────────────

function setHeader({ projectName, projectId }) {
    if (projectName) {
        window.currentProjectName = projectName;
        document.title = `${projectName} - AangCAD (web)`;
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) nameInput.value = projectName;
    }
    if (projectId) {
        window.AANGCAD_WEB_PROJECT_ID = projectId;
        // Web'ten yüklendi → sonraki "Kaydet" web projesinin üzerine yazsın.
        window.saveTarget = 'web';
    }
    window.dispatchEvent(new CustomEvent('aangcad:web-load-ok', {
        detail: { projectId, projectName },
    }));
}

async function loadProjectIfRequested() {
    const pid = getProjectIdFromUrl();
    if (!pid) {
        window.dispatchEvent(new CustomEvent('aangcad:web-ready', { detail: { projectId: null } }));
        return false;
    }
    try {
        const data = await loadProjectFromWeb(pid);
        const cad = data.cad_data;
        if (cad && typeof cad === 'object' && (cad.nodes || cad.walls)) {
            try {
                loadJSONProject(cad);
            } catch (err) {
                console.error('Web projesi state\'e yüklenemedi:', err);
                alert('Web projesi çiziminin formatı geçersiz: ' + err.message);
            }
        }
        // Projenin gerçek PF/DF'sini badge'e ilet — aktif seçimle eşleşmeyebilir.
        const projectFirm = (data.pf && data.df)
            ? { pf_id: data.pf.id, pf_adi: data.pf.firma_adi, df_id: data.df.id, df_adi: data.df.firma_adi }
            : null;
        window.AANGCAD_PROJECT_FIRM = projectFirm;
        window.AANGCAD_PROJECT_OWNER = data.owner || null;
        setHeader({ projectName: data.proje_adi, projectId: pid });
        if (projectFirm) {
            window.dispatchEvent(new CustomEvent('aangcad:project-firm', { detail: projectFirm }));
        }
        return true;
    } catch (err) {
        if (!/Oturum/i.test(err.message)) {
            console.error('Web projesi yüklenirken hata:', err);
            alert('Proje yüklenemedi: ' + err.message);
        }
        return false;
    }
}

// Çevrimdışı moda geç. CAD lokal dosya kayıt/yükleme ile çalışır; cookie/active firm yok.
function enterOfflineMode() {
    window.AANGCAD_OFFLINE_MODE = true;
    window.AANGCAD_USER_PROFILE = null;
    window.AANGCAD_ACTIVE_FIRM  = null;
    try { localStorage.removeItem('aangcad:active-firm'); } catch {}
    window.dispatchEvent(new CustomEvent('aangcad:offline-mode'));
}

// Demo/statik hosting (ör. GitHub Pages) — Supabase backend'i yok, login modal'ı
// hiç gösterme, doğrudan çevrimdışı moda geç.
function isDemoHost() {
    try {
        return /\.github\.io$/.test(location.hostname);
    } catch {
        return false;
    }
}

export async function bootstrapFromWeb(opts = {}) {
    const { allowOffline = true, forceLogin = false } = opts;

    if (!forceLogin && isDemoHost()) {
        enterOfflineMode();
        return false;
    }

    // Login + firma seçimi başarılı olana kadar dön. Kullanıcı her kapatma sinyalinde
    // (PF üyesi değil, picker'da X, çevrimdışı seçimi) buna göre dallanır.
    let user = null;
    let firm = null;

    for (;;) {
        // 1) Auth — oturum varsa kullan, yoksa login modal aç
        user = forceLogin ? null : await getCurrentUser();
        if (!user) {
            const result = await showLoginDialog({ allowOffline });
            if (result?.offline) {
                enterOfflineMode();
                return false;
            }
            user = result?.user || null;
            if (!user) {
                // Boş resolve gelirse çevrimdışı say (defensive)
                enterOfflineMode();
                return false;
            }
        }

        // 2) Firma seçimi
        try {
            firm = await ensureActiveFirm();
            break;
        } catch (err) {
            const code = err?.message;
            if (code === ERR_NO_FIRM_MEMBERSHIP) {
                alert('Bu hesabın hiçbir PF üyeliği yok. Lütfen yetkili bir hesapla giriş yapın.');
                await signOut();
                user = null;
                continue;
            }
            if (code === ERR_USER_CANCELED) {
                // Picker'ı X ile kapattı → çıkış yap, tekrar login modal aç.
                await signOut();
                user = null;
                continue;
            }
            console.error('Firm picker hatası:', err);
            await signOut();
            return false;
        }
    }

    // 3) Profil ve session-ready event
    window.AANGCAD_OFFLINE_MODE = false;
    const profile = await getCurrentUserProfile();
    window.AANGCAD_USER_PROFILE = profile;
    window.dispatchEvent(new CustomEvent('aangcad:session-ready', { detail: { user, profile, firm } }));

    // 4) URL'de proje varsa yükle
    await loadProjectIfRequested();
    return true;
}

// Menüden "Web'e Bağlan" tıklandığında veya offline'dan online'a geçişte çağrılır.
// allowOffline true bırakıldı: kullanıcı yanlış hesapla giriş yaparsa (örn. PF
// üyesi değil) yeniden açılan login modal'dan çevrimdışına dönebilsin.
export async function connectToWeb() {
    return bootstrapFromWeb({ forceLogin: true });
}

if (typeof window !== 'undefined') {
    window.__aangcadConnectToWeb = connectToWeb;
}

function installAuthSync() {
    // Bootstrap'in başlangıçta kullandığı user — sonraki değişimde reload.
    let initialized = false;
    let initialUserId = null;
    onAuthChange((user) => {
        const id = user?.id ?? null;
        if (!initialized) {
            initialized   = true;
            initialUserId = id;
            return;
        }
        if (id !== initialUserId) {
            // Başka bir sekmede / aynı sekmede oturum değişti → CAD'i yenile.
            try { localStorage.removeItem('aangcad:active-firm'); } catch {}
            location.reload();
        }
    });
}

function runWhenReady() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            installWebStatusBadge();
            installAuthSync();
            bootstrapFromWeb();
        });
    } else {
        installWebStatusBadge();
        installAuthSync();
        bootstrapFromWeb();
    }
}

runWhenReady();

// ─── Topbar rozeti ─────────────────────────────────────────────────────────

function installWebStatusBadge() {
    if (document.getElementById('aangcadWebBadge')) return;

    const css = `
        #aangcadWebBadge {
            position: fixed; bottom: 8px; right: 12px; z-index: 100001;
            display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
            background: rgba(255,255,255,0.96); border: 1px solid #d1d5db;
            border-radius: 8px; padding: 5px 10px; font: 12px/1.4 system-ui, sans-serif;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08); color: #1f2937;
            max-width: calc(100vw - 24px);
        }
        #aangcadWebBadge .ab-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; flex-shrink: 0; }
        #aangcadWebBadge .ab-dot.ok      { background: #16a34a; }
        #aangcadWebBadge .ab-dot.warn    { background: #f59e0b; }
        #aangcadWebBadge .ab-dot.danger  { background: #ef4444; }
        #aangcadWebBadge .ab-sep {
            width: 1px; height: 14px; background: #e5e7eb;
        }
        #aangcadWebBadge .ab-chip {
            display: inline-flex; align-items: center; gap: 4px;
            max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #aangcadWebBadge .ab-chip .ico { opacity: 0.6; }
        #aangcadWebBadge .ab-chip strong { font-weight: 600; color: #0f172a; }
        #aangcadWebBadge .ab-pf { color: #1d4ed8; }
        #aangcadWebBadge .ab-df { color: #047857; }
        #aangcadWebBadge button {
            border: 1px solid #d1d5db; background: white; padding: 3px 8px;
            border-radius: 6px; cursor: pointer; font: 12px/1.2 system-ui, sans-serif;
            color: #1f2937;
        }
        #aangcadWebBadge button:hover { background: #f3f4f6; }
        #aangcadWebBadge button.danger:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'aangcadWebBadge';
    root.innerHTML = `<span class="ab-dot" id="abDot"></span><span id="abStatus">Yükleniyor…</span>`;
    document.body.appendChild(root);

    function setDot(klass) {
        const dot = root.querySelector('#abDot');
        dot.className = 'ab-dot' + (klass ? ' ' + klass : '');
    }

    function clearChips() {
        root.querySelectorAll('.ab-chip, .ab-sep, button, #abStatus').forEach((el) => el.remove());
    }

    function appendStatus(text) {
        const span = document.createElement('span');
        span.id = 'abStatus';
        span.textContent = text;
        root.appendChild(span);
    }

    function appendSep() {
        const s = document.createElement('span');
        s.className = 'ab-sep';
        root.appendChild(s);
    }

    function appendChip(html, extraCls = '') {
        const span = document.createElement('span');
        span.className = 'ab-chip ' + extraCls;
        span.innerHTML = html;
        root.appendChild(span);
    }

    function appendButton(text, onClick, cls = '') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.className = cls;
        btn.addEventListener('click', onClick);
        root.appendChild(btn);
        return btn;
    }

    function renderSession({ profile, firm, projectName, projectId }) {
        clearChips();
        setDot('ok');
        const userLabel = profile?.adi || profile?.authEmail || 'Kullanıcı';
        appendChip(`<span class="ico">👤</span><strong>${escapeHtml(userLabel)}</strong>`);
        if (firm) {
            appendSep();
            appendChip(`<span class="ico">🏢</span><span class="ab-pf">${escapeHtml(firm.pf_adi)}</span>`);
            appendChip(`<span class="ico">⚡</span><span class="ab-df">${escapeHtml(firm.df_adi)}</span>`);
        }
        if (projectName) {
            appendSep();
            appendChip(`<span class="ico">📁</span><strong>${escapeHtml(projectName)}</strong>`);
        }
        appendSep();
        if (projectId) {
            appendButton('Web\'e Kaydet', () => { try { saveProject(); } catch (e) { console.error(e); } });
            appendButton('Panelde Aç', () => openProjectInPanel(projectId));
        } else {
            appendButton('Panel', openWebPanel);
        }
        appendButton('Firma', async () => {
            try { await openFirmPicker(); } catch {}
        });
        appendButton('Çıkış', async () => {
            await signOut();
            clearActiveFirm();
            location.reload();
        }, 'danger');
    }

    function renderError(msg) {
        clearChips();
        setDot('danger');
        appendStatus(msg);
    }

    function renderOffline() {
        clearChips();
        setDot('warn');
        appendStatus('Lokal mod');
        appendButton('Web\'e Bağlan', async () => {
            try { await connectToWeb(); } catch (e) { console.error(e); }
        });
    }

    // Başlangıç durumu
    setDot('warn');

    let lastDetail = { profile: null, firm: null, projectName: null, projectId: null };

    window.addEventListener('aangcad:session-ready', (e) => {
        lastDetail = { ...lastDetail, profile: e.detail.profile, firm: e.detail.firm };
        renderSession(lastDetail);
    });

    window.addEventListener('aangcad:active-firm-changed', (e) => {
        if (!e.detail) return;
        lastDetail = { ...lastDetail, firm: e.detail };
        renderSession(lastDetail);
    });

    window.addEventListener('aangcad:web-load-ok', (e) => {
        lastDetail = { ...lastDetail, projectName: e.detail.projectName, projectId: e.detail.projectId };
        renderSession(lastDetail);
    });

    window.addEventListener('aangcad:web-save-ok', (e) => {
        lastDetail = { ...lastDetail, projectName: e.detail.projectName || e.detail.name, projectId: e.detail.projectId };
        renderSession(lastDetail);
    });

    // Mevcut proje yüklendiğinde projenin PF/DF'si badge'e basılır (aktif firmadan farklı olabilir).
    window.addEventListener('aangcad:project-firm', (e) => {
        if (!e.detail) return;
        lastDetail = { ...lastDetail, firm: e.detail };
        renderSession(lastDetail);
    });

    window.addEventListener('aangcad:web-auth-err', () => renderError('Oturum gerekli'));
    window.addEventListener('aangcad:offline-mode', () => renderOffline());
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}
