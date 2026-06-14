// onboarding/web-bridge.js
// CAD ↔ Web yönetim paneli köprüsü.
// Web app: ../web/ (Next.js, http://localhost:3001 dev'de).
//
// API:
//   import { saveProjectToWeb, loadProjectFromWeb, getProjectIdFromUrl } from './web-bridge.js';
//
//   const id = getProjectIdFromUrl();          // URL'de ?project=ID varsa döner
//   const data = await loadProjectFromWeb(id); // { proje_adi, cad_data, ... }
//   await saveProjectToWeb(id, state, name);   // state = JSON.stringify edilebilir herhangi bir şey

const WEB_URL = (typeof window !== 'undefined' && window.AANGCAD_WEB_URL) || 'http://localhost:3001';

export function getProjectIdFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('project') || null;
}

export async function loadProjectFromWeb(projectId) {
    if (!projectId) throw new Error('projectId gerekli');
    const res = await fetch(`${WEB_URL}/api/projects/${projectId}/cad-data`, {
        credentials: 'include',
    });
    if (!res.ok) {
        if (res.status === 401) {
            redirectToLogin(projectId);
            throw new Error('Oturum gerekli — web paneline yönlendiriliyor');
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export async function saveProjectToWeb(projectId, state, projeAdi) {
    if (!projectId) throw new Error('projectId gerekli');
    const res = await fetch(`${WEB_URL}/api/projects/${projectId}/cad-data`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cad_data: state, proje_adi: projeAdi }),
    });
    if (!res.ok) {
        if (res.status === 401) {
            redirectToLogin(projectId);
            throw new Error('Oturum gerekli');
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export function redirectToLogin(projectId) {
    const next = projectId ? `/projects/${projectId}` : '/dashboard';
    window.location.href = `${WEB_URL}/login?next=${encodeURIComponent(next)}`;
}

export function openWebPanel() {
    window.open(`${WEB_URL}/dashboard`, '_blank');
}

export function openProjectInPanel(projectId) {
    window.open(`${WEB_URL}/projects/${projectId}`, '_blank');
}
