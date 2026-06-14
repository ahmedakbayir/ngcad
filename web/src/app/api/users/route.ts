import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';
import { syncFirmaJunctions } from '@/lib/user-junctions';

// Yeni kullanıcı: önce auth.users davet, sonra public.users + junction kayıtları.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { yetkili_firma_ids = [], ...userData } = body;

  const admin = supabaseAdmin();

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    userData.email,
  );
  if (inviteErr) {
    return NextResponse.json({ error: `Davet hatası: ${inviteErr.message}` }, { status: 400 });
  }

  const userId = invited.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Auth kullanıcısı oluşturulamadı.' }, { status: 500 });
  }

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
  );

  return NextResponse.json({ id: userId });
}
