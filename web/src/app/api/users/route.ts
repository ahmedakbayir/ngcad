import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';
import { syncFirmaJunctions } from '@/lib/user-junctions';
import { fillUnvanIfBlank } from '@/lib/user-roles';

// Yeni kullanıcı: admin parolayı doğrudan belirler; e-posta doğrulaması yok.
// Kullanıcı verilen e-posta + şifre ile /login'den girer.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { yetkili_firma_ids = [], auto_inherit_firma_ids = [], password, ...userData } = body;
  // Ünvan boş gelirse rol flag'lerinden otomatik doldur (admin elle değer
  // girdiyse dokunma).
  fillUnvanIfBlank(userData);

  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json(
      { error: 'Şifre en az 6 karakter olmalı.' },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  // Email tekillik: DB unique constraint zaten var ama önce kontrol edip
  // anlamlı bir mesaj döneriz (Supabase auth tarafı opak hata verir).
  if (userData.email) {
    const { data: clash } = await admin
      .from('users')
      .select('id')
      .eq('email', userData.email)
      .limit(1)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { error: `Bu e-posta zaten kayıtlı: ${userData.email}` },
        { status: 409 },
      );
    }
  }

  // 1) Auth kullanıcısı — parola atanmış, e-posta doğrulanmış.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: userData.email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    return NextResponse.json({ error: `Auth oluşturma hatası: ${createErr.message}` }, { status: 400 });
  }
  const userId = created.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Auth kullanıcısı oluşturulamadı.' }, { status: 500 });
  }

  // 2) public.users satırı + junction'lar.
  const { error: insertErr } = await admin.from('users').insert({ id: userId, ...userData });
  if (insertErr) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }
  await syncFirmaJunctions(
    userId,
    !!userData.firma_kullanicisi,
    !!userData.gdf_kullanicisi,
    yetkili_firma_ids,
    auto_inherit_firma_ids,
  );

  return NextResponse.json({ id: userId });
}
