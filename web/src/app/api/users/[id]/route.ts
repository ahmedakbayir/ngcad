import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';
import { syncFirmaJunctions } from '@/lib/user-junctions';
import { fillUnvanIfBlank } from '@/lib/user-roles';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json();
  const { yetkili_firma_ids = [], auto_inherit_firma_ids = [], password, ...userData } = body;
  // Ünvan boş gelirse rol flag'lerinden otomatik doldur (admin elle değer
  // girdiyse dokunma). Form tam payload gönderdiği için rol flag'leri burada
  // mevcut olur; partial PATCH'te flag yoksa türetme '' kalır ve unvan değişmez.
  fillUnvanIfBlank(userData);

  const admin = supabaseAdmin();

  // Email tekillik: PATCH'te email değiştiriliyorsa başka user kullanıyor mu?
  if (userData.email) {
    const { data: clash } = await admin
      .from('users')
      .select('id')
      .eq('email', userData.email)
      .neq('id', id)
      .limit(1)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { error: `Bu e-posta başka bir kullanıcıda zaten kayıtlı: ${userData.email}` },
        { status: 409 },
      );
    }
    // auth.users tarafında da senkron olsun (aksi halde login email eski kalır).
    const { error: emailErr } = await admin.auth.admin.updateUserById(id, {
      email: userData.email,
    });
    if (emailErr) {
      return NextResponse.json(
        { error: `Auth e-posta güncellenemedi: ${emailErr.message}` },
        { status: 400 },
      );
    }
  }

  // Parola gönderildiyse auth.users üzerinde güncelle.
  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Şifre en az 6 karakter olmalı.' },
        { status: 400 },
      );
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(id, { password });
    if (pwErr) {
      return NextResponse.json({ error: `Şifre güncellenemedi: ${pwErr.message}` }, { status: 400 });
    }
  }

  const { error: updErr } = await admin.from('users').update(userData).eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  await syncFirmaJunctions(
    id,
    !!userData.firma_kullanicisi,
    !!userData.gdf_kullanicisi,
    yetkili_firma_ids,
    auto_inherit_firma_ids,
  );

  return NextResponse.json({ id });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = supabaseAdmin();

  // public.users CASCADE ile auth.users'a bağlı (FK on delete cascade)
  // ama biz auth.users'tan da silelim ki orphan kalmasın.
  await admin.from('users').delete().eq('id', id);
  await admin.auth.admin.deleteUser(id).catch(() => {});

  return NextResponse.json({ ok: true });
}
