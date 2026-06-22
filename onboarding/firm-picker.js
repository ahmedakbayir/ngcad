// onboarding/firm-picker.js
// Login sonrası aktif firma seçimi. Kullanıcının üye olduğu PF'leri çeker ve
// her PF'nin bağlı olduğu DF'yi (proje_firmalari.df_id 1-N) birlikte gösterir.
//
//   1 satır  → otomatik seçilir, modal hiç açılmaz.
//   >1 satır → radio listli modal.
//
// Seçim hem localStorage'a (`aangcad:active-firm`) hem window.AANGCAD_ACTIVE_FIRM'e yazılır.
//
// Public API:
//   import { ensureActiveFirm, getActiveFirm, clearActiveFirm, openFirmPicker } from './firm-picker.js';

import { getSupabase, getCurrentUser } from './web-auth.js';

const STORAGE_KEY = 'aangcad:active-firm';

let _styleInstalled = false;

function installStyle() {
    if (_styleInstalled) return;
    _styleInstalled = true;
    const css = `
        #aangcadFirmBackdrop {
            position: fixed; inset: 0; z-index: 1000010;
            background: rgba(15, 23, 42, 0.55);
            display: flex; align-items: center; justify-content: center;
            font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        #aangcadFirmCard {
            width: 460px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px);
            background: #fff; border-radius: 12px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.25);
            padding: 24px; display: flex; flex-direction: column;
        }
        #aangcadFirmCard h2 {
            margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #0f172a;
        }
        #aangcadFirmCard p.sub {
            margin: 0 0 16px; color: #64748b; font-size: 12px;
        }
        #aangcadFirmList {
            overflow: auto; max-height: 50vh; border: 1px solid #e2e8f0;
            border-radius: 8px; padding: 4px;
        }
        #aangcadFirmList label.row {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 12px; border-radius: 6px; cursor: pointer;
        }
        #aangcadFirmList label.row:hover { background: #f1f5f9; }
        #aangcadFirmList label.row.selected { background: #dbeafe; }
        #aangcadFirmList .col { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        #aangcadFirmList .pf-name { font-weight: 600; color: #0f172a; }
        #aangcadFirmList .df-name { font-size: 12px; color: #64748b; }
        #aangcadFirmEmpty { color: #b91c1c; font-size: 13px; padding: 12px; }
        #aangcadFirmCard .actions {
            margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;
        }
        #aangcadFirmCard button {
            border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
            padding: 8px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
        }
        #aangcadFirmCard button.primary {
            background: #2563eb; border-color: #2563eb; color: #fff;
        }
        #aangcadFirmCard button:disabled { opacity: 0.6; cursor: not-allowed; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

export function getActiveFirm() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj && obj.pf_id && obj.df_id) {
            window.AANGCAD_ACTIVE_FIRM = obj;
            return obj;
        }
    } catch {}
    return null;
}

export function setActiveFirm(firm) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(firm)); } catch {}
    window.AANGCAD_ACTIVE_FIRM = firm;
    window.dispatchEvent(new CustomEvent('aangcad:active-firm-changed', { detail: firm }));
}

export function clearActiveFirm() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.AANGCAD_ACTIVE_FIRM = null;
    window.dispatchEvent(new CustomEvent('aangcad:active-firm-changed', { detail: null }));
}

async function fetchUserFirms() {
    const user = await getCurrentUser();
    if (!user) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('user_pf')
        .select(`
            pf_id,
            proje_firmalari!inner(
                id, firma_adi, firma_tel, firma_email,
                vergi_dairesi, vergi_no, adres, yeterlilik_no,
                df_id,
                dagitim_firmalari(id, firma_adi)
            )
        `)
        .eq('user_id', user.id);
    if (error) {
        console.error('user_pf çekilemedi:', error);
        return [];
    }
    return (data ?? [])
        .map((row) => {
            const pf = row.proje_firmalari;
            if (!pf) return null;
            // DF opsiyonel — TEKİL/ÜST FİRMA PF'leri df_id NULL olabilir.
            const df = pf.dagitim_firmalari;
            return {
                pf_id:            pf.id,
                pf_adi:           pf.firma_adi,
                pf_tel:           pf.firma_tel      ?? null,
                pf_email:         pf.firma_email    ?? null,
                pf_vergi_dairesi: pf.vergi_dairesi  ?? null,
                pf_vergi_no:      pf.vergi_no       ?? null,
                pf_adres:         pf.adres          ?? null,
                pf_yeterlilik_no: pf.yeterlilik_no  ?? null,
                df_id:  df?.id        ?? null,
                df_adi: df?.firma_adi ?? null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.pf_adi.localeCompare(b.pf_adi, 'tr'));
}

function renderPicker(firms, preselectedKey) {
    installStyle();
    return new Promise((resolve, reject) => {
        const backdrop = document.createElement('div');
        backdrop.id = 'aangcadFirmBackdrop';
        backdrop.innerHTML = `
            <div id="aangcadFirmCard" role="dialog" aria-modal="true">
                <h2>Firma Seçimi</h2>
                <p class="sub">Hangi PF / DF eşleşmesiyle çalışacaksınız?</p>
                <div id="aangcadFirmList"></div>
                <div class="actions">
                    <button type="button" id="aangcadFirmCancel">Vazgeç</button>
                    <button type="button" class="primary" id="aangcadFirmOk" disabled>Devam Et</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const list   = backdrop.querySelector('#aangcadFirmList');
        const okBtn  = backdrop.querySelector('#aangcadFirmOk');
        const cancel = backdrop.querySelector('#aangcadFirmCancel');

        if (!firms || firms.length === 0) {
            list.innerHTML = `<div id="aangcadFirmEmpty">Hiçbir PF'ye üye değilsiniz. Lütfen yönetici ile iletişime geçin.</div>`;
            okBtn.disabled = true;
        } else {
            let selectedKey = preselectedKey || null;
            for (const f of firms) {
                const key = `${f.pf_id}::${f.df_id}`;
                const row = document.createElement('label');
                row.className = 'row';
                row.innerHTML = `
                    <input type="radio" name="aangcadFirm" value="${key}" />
                    <div class="col">
                        <span class="pf-name">${f.pf_adi}</span>
                        <span class="df-name">${f.df_adi || 'DF bağlı değil'}</span>
                    </div>
                `;
                const input = row.querySelector('input');
                if (key === selectedKey) { input.checked = true; row.classList.add('selected'); okBtn.disabled = false; }
                input.addEventListener('change', () => {
                    selectedKey = key;
                    list.querySelectorAll('label.row').forEach((r) => r.classList.remove('selected'));
                    row.classList.add('selected');
                    okBtn.disabled = false;
                });
                list.appendChild(row);
            }

            okBtn.addEventListener('click', () => {
                const chosen = firms.find((f) => `${f.pf_id}::${f.df_id}` === selectedKey);
                if (!chosen) return;
                backdrop.remove();
                resolve(chosen);
            });
        }

        cancel.addEventListener('click', () => {
            backdrop.remove();
            reject(new Error(ERR_USER_CANCELED));
        });
    });
}

export const ERR_NO_FIRM_MEMBERSHIP = 'NO_FIRM_MEMBERSHIP';
export const ERR_USER_CANCELED      = 'USER_CANCELED_FIRM_PICK';

// Login sonrası akışta çağrılır. Aktif firma yoksa veya force=true ise picker açar.
// 1 firma varsa otomatik seçer. PF üyeliği hiç yoksa Error(ERR_NO_FIRM_MEMBERSHIP) fırlatır.
export async function ensureActiveFirm({ force = false } = {}) {
    if (!force) {
        const cached = getActiveFirm();
        if (cached) return cached;
    }

    const firms = await fetchUserFirms();
    if (firms.length === 0) {
        throw new Error(ERR_NO_FIRM_MEMBERSHIP);
    }
    if (firms.length === 1 && !force) {
        setActiveFirm(firms[0]);
        return firms[0];
    }
    const current = getActiveFirm();
    const preselected = current ? `${current.pf_id}::${current.df_id}` : null;
    const chosen = await renderPicker(firms, preselected);
    setActiveFirm(chosen);
    return chosen;
}

// "Firma değiştir" butonundan tetiklenir — her durumda picker açılır.
export async function openFirmPicker() {
    return ensureActiveFirm({ force: true });
}
