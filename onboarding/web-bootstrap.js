// onboarding/web-bootstrap.js
// CAD açılış akışı için web entegrasyonu.
// 1) URL'de ?project=ID varsa web'ten state'i yükle.
// 2) Hata 401 ise web-bridge zaten login'e yönlendirir.
// 3) Başarıda topbar göstergesini günceller.

import { getProjectIdFromUrl, loadProjectFromWeb, openWebPanel, openProjectInPanel, redirectToLogin } from './web-bridge.js';
import { loadJSONProject, saveProject } from '../general-files/file-io.js';

function setHeader({ projectName, projectId }) {
    if (projectName) {
        window.currentProjectName = projectName;
        document.title = `${projectName} - AangCAD (web)`;
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) nameInput.value = projectName;
    }
    if (projectId) {
        window.AANGCAD_WEB_PROJECT_ID = projectId;
    }
    window.dispatchEvent(new CustomEvent('aangcad:web-load-ok', {
        detail: { projectId, projectName },
    }));
}

export async function bootstrapFromWeb() {
    const pid = getProjectIdFromUrl();
    if (!pid) return false;

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
        // İsim ve id'yi her durumda göster — boş proje için de.
        setHeader({ projectName: data.proje_adi, projectId: pid });
        return true;
    } catch (err) {
        // 401 olursa redirect zaten tetiklenir; diğer hatalar için kullanıcıya bilgi ver.
        if (!/Oturum/i.test(err.message)) {
            console.error('Web projesi yüklenirken hata:', err);
            alert('Proje yüklenemedi: ' + err.message);
        }
        return false;
    }
}

function runWhenReady() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            installWebStatusBadge();
            bootstrapFromWeb();
        });
    } else {
        installWebStatusBadge();
        bootstrapFromWeb();
    }
}

runWhenReady();

// ─── Topbar gösterge ──────────────────────────────────────────────────────
// Sağ üstte küçük bir rozet: oturum durumu + bağlı proje + hızlı eylemler.

function installWebStatusBadge() {
    if (document.getElementById('aangcadWebBadge')) return;

    const css = `
        #aangcadWebBadge {
            position: fixed; top: 8px; right: 12px; z-index: 100001;
            display: flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,0.95); border: 1px solid #d1d5db;
            border-radius: 8px; padding: 4px 8px; font: 12px/1.4 system-ui, sans-serif;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08); color: #1f2937;
        }
        #aangcadWebBadge .ab-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; }
        #aangcadWebBadge .ab-dot.ok      { background: #16a34a; }
        #aangcadWebBadge .ab-dot.warn    { background: #f59e0b; }
        #aangcadWebBadge .ab-dot.danger  { background: #ef4444; }
        #aangcadWebBadge button {
            border: 1px solid #d1d5db; background: white; padding: 2px 8px;
            border-radius: 6px; cursor: pointer; font: 12px/1.2 system-ui, sans-serif;
        }
        #aangcadWebBadge button:hover { background: #f3f4f6; }
        #aangcadWebBadge .ab-name { font-weight: 500; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'aangcadWebBadge';
    root.innerHTML = `
        <span class="ab-dot" id="abDot"></span>
        <span id="abText">Lokal mod</span>
        <span class="ab-name" id="abProject"></span>
        <button type="button" id="abAction">Panel</button>
    `;
    document.body.appendChild(root);

    const dot      = root.querySelector('#abDot');
    const text     = root.querySelector('#abText');
    const projName = root.querySelector('#abProject');
    const action   = root.querySelector('#abAction');

    const pid = getProjectIdFromUrl();

    function showLocal() {
        dot.className = 'ab-dot';
        text.textContent = 'Lokal mod';
        projName.textContent = '';
        action.textContent = 'Panel\'i Aç';
        action.onclick = openWebPanel;
    }

    function showWebLoading() {
        dot.className = 'ab-dot warn';
        text.textContent = 'Web bağlanıyor…';
        projName.textContent = '';
        action.textContent = 'Panel';
        action.onclick = openWebPanel;
    }

    function showWebOk(detail) {
        dot.className = 'ab-dot ok';
        text.textContent = 'Web modu';
        projName.textContent = detail.projectName || '';
        action.textContent = 'Web\'e Kaydet';
        action.onclick = () => { try { saveProject(); } catch (e) { console.error(e); } };
        const second = document.createElement('button');
        second.type = 'button';
        second.textContent = 'Panelde Aç';
        second.onclick = () => openProjectInPanel(detail.projectId);
        if (!root.querySelector('#abAction2')) {
            second.id = 'abAction2';
            action.after(second);
        }
    }

    function showWebError() {
        dot.className = 'ab-dot danger';
        text.textContent = 'Oturum gerekli';
        projName.textContent = '';
        action.textContent = 'Giriş Yap';
        action.onclick = () => redirectToLogin(pid);
    }

    if (pid) showWebLoading();
    else showLocal();

    window.addEventListener('aangcad:web-load-ok',  (e) => showWebOk(e.detail));
    window.addEventListener('aangcad:web-save-ok',  (e) => showWebOk(e.detail));
    window.addEventListener('aangcad:web-auth-err', () => showWebError());
}
