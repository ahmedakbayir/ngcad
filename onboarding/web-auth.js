// onboarding/web-auth.js
// CAD ↔ Supabase auth singleton. Web ile aynı origin'de çalıştığından @supabase/ssr
// browser client kullanıyoruz — cookie tabanlı session web Next middleware'i tarafından
// da görülür (createServerClient ile aynı cookie formatı).
//
// Public API:
//   import { getSupabase, getCurrentUser, signIn, signOut } from './web-auth.js';

import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL  = 'https://wwiwduqihaiidzaqvoqq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3aXdkdXFpaGFpaWR6YXF2b3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTI5NzIsImV4cCI6MjA5NzAyODk3Mn0.mXDB7pHWKwyhoVBg6NFCtVWAJTQAFLRBuxp7UetT_c8';

let _client = null;
let _channel = null;

export function getSupabase() {
    if (_client) return _client;
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
    return _client;
}

function getChannel() {
    if (_channel) return _channel;
    try { _channel = new BroadcastChannel('aangcad:auth'); } catch { _channel = null; }
    return _channel;
}

function broadcast(type, payload) {
    const ch = getChannel();
    if (!ch) return;
    try { ch.postMessage({ type, payload, ts: Date.now() }); } catch {}
}

export async function getCurrentUser() {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
}

export async function getCurrentUserProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('users')
        .select(`
            id, adi, email, unvan, gsm, is_admin,
            proje_muh_oda_sicil_no, proje_muh_kayit_no, proje_muh_yetki_durumu,
            firma_kullanicisi, firma_yonetici, firma_yonetici_kademe,
            firma_proje_muhendisi, firma_cizim_sorumlusu, firma_tesisat_ustasi,
            gdf_kullanicisi, gdf_yonetici, gdf_yonetici_kademe,
            gdf_onay_muhendisi, gdf_gaz_acma_muhendisi, gdf_on_buro_yetkilisi
        `)
        .eq('id', user.id)
        .maybeSingle();
    if (error) console.warn('public.users çekilemedi:', error.message);

    const u = data || {};
    return {
        id: user.id,
        adi:   u.adi   ?? null,
        email: u.email ?? user.email ?? null,
        gsm:   u.gsm   ?? null,
        authEmail: user.email ?? null,
        unvan: u.unvan ?? deriveUnvan(u),
        channel: deriveChannel(u),
        // Mühendis bilgileri (kapakta kullanılır)
        proje_muh_oda_sicil_no: u.proje_muh_oda_sicil_no ?? null,
        proje_muh_kayit_no:     u.proje_muh_kayit_no     ?? null,
        proje_muh_yetki_durumu: u.proje_muh_yetki_durumu ?? null,
        // Ham flag'ler (rozet/yetki için)
        is_admin: !!u.is_admin,
        firma_kullanicisi:     !!u.firma_kullanicisi,
        firma_yonetici:        !!u.firma_yonetici,
        firma_yonetici_kademe: u.firma_yonetici_kademe ?? null,
        firma_proje_muhendisi: !!u.firma_proje_muhendisi,
        firma_cizim_sorumlusu: !!u.firma_cizim_sorumlusu,
        firma_tesisat_ustasi:  !!u.firma_tesisat_ustasi,
        gdf_kullanicisi:       !!u.gdf_kullanicisi,
        gdf_yonetici:          !!u.gdf_yonetici,
        gdf_yonetici_kademe:   u.gdf_yonetici_kademe ?? null,
        gdf_onay_muhendisi:    !!u.gdf_onay_muhendisi,
        gdf_gaz_acma_muhendisi:!!u.gdf_gaz_acma_muhendisi,
        gdf_on_buro_yetkilisi: !!u.gdf_on_buro_yetkilisi,
    };
}

function deriveUnvan(u) {
    if (u.firma_yonetici) return u.firma_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici';
    if (u.firma_proje_muhendisi) return 'Proje Mühendisi';
    if (u.firma_cizim_sorumlusu) return 'Çizim Sorumlusu';
    if (u.firma_tesisat_ustasi)  return 'Tesisat Ustası';
    if (u.gdf_yonetici) return u.gdf_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici';
    if (u.gdf_onay_muhendisi)     return 'Onay Mühendisi';
    if (u.gdf_gaz_acma_muhendisi) return 'Gaz Açma Mühendisi';
    if (u.gdf_on_buro_yetkilisi)  return 'Ön Büro Yetkilisi';
    return '';
}

function deriveChannel(u) {
    if (u.is_admin) return 'Admin';
    const pf = !!u.firma_kullanicisi;
    const df = !!u.gdf_kullanicisi;
    if (pf && df) return 'PF/DF';
    if (pf) return 'PF';
    if (df) return 'DF';
    return '';
}

export async function signIn(email, password) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    broadcast('sign-in', { userId: data.user?.id ?? null });
    return data.user;
}

export async function signOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    try { localStorage.removeItem('aangcad:active-firm'); } catch {}
    broadcast('sign-out', null);
}

// Aynı sekmede veya başka bir sekmede oturum değişimini izler.
// callback(user|null) — user değiştiğinde çağrılır.
// Sinyaller: BroadcastChannel(aangcad:auth) + onAuthStateChange + visibilitychange.
// Re-check için getSession (cookie storage'ı tekrar okur) kullanılır; getUser in-memory
// access token ile gidip eski user'ı döndürebiliyor.
export function onAuthChange(callback) {
    const supabase = getSupabase();
    let lastUserId = null;

    const fire = (user) => {
        const id = user?.id ?? null;
        if (id === lastUserId) return;
        lastUserId = id;
        try { callback(user); } catch (e) { console.error('onAuthChange callback:', e); }
    };

    const recheck = async () => {
        const { data } = await supabase.auth.getSession();
        fire(data?.session?.user ?? null);
    };

    // İlk durum — getSession kullan ki cookie'den taze oku.
    recheck();

    // Aynı tab Supabase event'i
    const sub = supabase.auth.onAuthStateChange((_event, session) => fire(session?.user ?? null));

    // Başka tabtaki değişim için BroadcastChannel
    const ch = getChannel();
    const onMsg = () => recheck();
    if (ch) ch.addEventListener('message', onMsg);

    // Yedek: tab tekrar görünür olunca da kontrol et
    const onVis = () => { if (document.visibilityState === 'visible') recheck(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
        try { sub.data.subscription.unsubscribe(); } catch {}
        if (ch) ch.removeEventListener('message', onMsg);
        document.removeEventListener('visibilitychange', onVis);
    };
}
