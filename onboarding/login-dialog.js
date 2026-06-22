// onboarding/login-dialog.js
// CAD'in native login modal'ı. Supabase auth ile e-posta + şifre.
//
// Public API:
//   import { showLoginDialog } from './login-dialog.js';
//   const r = await showLoginDialog({ allowOffline });
//     r = { user } → giriş başarılı
//     r = { offline: true } → kullanıcı çevrimdışı çalışmayı seçti

import { signIn } from './web-auth.js';

let _styleInstalled = false;

function installStyle() {
    if (_styleInstalled) return;
    _styleInstalled = true;
    const css = `
        #aangcadLoginBackdrop {
            position: fixed; inset: 0; z-index: 1000010;
            background: rgba(15, 23, 42, 0.55);
            display: flex; align-items: center; justify-content: center;
            font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        #aangcadLoginCard {
            width: 360px; max-width: calc(100vw - 32px);
            background: #fff; border-radius: 12px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.25);
            padding: 24px;
        }
        #aangcadLoginCard h2 {
            margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #0f172a;
        }
        #aangcadLoginCard p.sub {
            margin: 0 0 16px; color: #64748b; font-size: 12px;
        }
        #aangcadLoginCard label {
            display: block; margin-top: 12px; font-size: 12px;
            font-weight: 500; color: #334155;
        }
        #aangcadLoginCard input {
            width: 100%; box-sizing: border-box; margin-top: 4px;
            padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px;
            font-size: 13px; outline: none;
        }
        #aangcadLoginCard input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
        #aangcadLoginCard .err {
            margin-top: 12px; color: #b91c1c; font-size: 12px; min-height: 16px;
        }
        #aangcadLoginCard .actions {
            margin-top: 18px; display: flex; gap: 8px; justify-content: space-between; align-items: center;
        }
        #aangcadLoginCard button {
            border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
            padding: 8px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
        }
        #aangcadLoginCard button.primary {
            background: #2563eb; border-color: #2563eb; color: #fff;
        }
        #aangcadLoginCard button.link {
            border: none; background: none; padding: 4px 0; color: #64748b;
            text-decoration: underline; font-size: 12px;
        }
        #aangcadLoginCard button.link:hover { color: #0f172a; }
        #aangcadLoginCard button:disabled { opacity: 0.6; cursor: not-allowed; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

export function showLoginDialog({ allowOffline = true } = {}) {
    installStyle();

    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.id = 'aangcadLoginBackdrop';
        const offlineHtml = allowOffline
            ? `<button type="button" class="link" id="aangcadLoginOffline">Çevrimdışı Çalış</button>`
            : `<span></span>`;
        backdrop.innerHTML = `
            <div id="aangcadLoginCard" role="dialog" aria-modal="true">
                <h2>AangCAD</h2>
                <p class="sub">Devam etmek için giriş yapın.</p>
                <form id="aangcadLoginForm" autocomplete="on">
                    <label for="aangcadLoginEmail">E-posta</label>
                    <input id="aangcadLoginEmail" name="email" type="email" required autocomplete="username" />
                    <label for="aangcadLoginPass">Şifre</label>
                    <input id="aangcadLoginPass" name="password" type="password" required autocomplete="current-password" />
                    <div class="err" id="aangcadLoginErr"></div>
                    <div class="actions">
                        ${offlineHtml}
                        <button type="submit" class="primary" id="aangcadLoginSubmit">Giriş Yap</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(backdrop);

        const form    = backdrop.querySelector('#aangcadLoginForm');
        const email   = backdrop.querySelector('#aangcadLoginEmail');
        const pass    = backdrop.querySelector('#aangcadLoginPass');
        const errEl   = backdrop.querySelector('#aangcadLoginErr');
        const submit  = backdrop.querySelector('#aangcadLoginSubmit');
        const offline = backdrop.querySelector('#aangcadLoginOffline');

        setTimeout(() => email.focus(), 50);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errEl.textContent = '';
            submit.disabled = true;
            const originalText = submit.textContent;
            submit.textContent = 'Giriş yapılıyor…';
            try {
                const user = await signIn(email.value.trim(), pass.value);
                backdrop.remove();
                resolve({ user });
            } catch (err) {
                errEl.textContent = err?.message || 'Giriş başarısız.';
                submit.disabled = false;
                submit.textContent = originalText;
            }
        });

        offline?.addEventListener('click', () => {
            backdrop.remove();
            resolve({ offline: true });
        });
    });
}
