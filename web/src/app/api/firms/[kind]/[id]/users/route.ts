import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';
import {
  autoAssignBagliYoneticiFromFirma,
  reconcileUstFirmaInherits,
} from '@/lib/user-junctions';

// Mevcut bir kullanıcıyı bir firmaya bağla (user_pf veya user_df junction satırı).
// PF/DF detayındaki "Mevcut Kullanıcı Ekle" akışı bu endpoint'i kullanır.
// Yeni kullanıcı oluşturmaz; sadece var olanı junction'a iliştirir + parent/
// child cascade ve bağlı yönetici atamasını idempotent çalıştırır.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { kind, id } = await params;
  if (kind !== 'pf' && kind !== 'df') {
    return NextResponse.json({ error: 'Geçersiz tip' }, { status: 400 });
  }

  const body = (await req.json()) as { user_id?: string };
  const userId = body?.user_id;
  if (!userId) return NextResponse.json({ error: 'user_id gerekli' }, { status: 400 });

  const admin = supabaseAdmin();
  const table = kind === 'pf' ? 'proje_firmalari' : 'dagitim_firmalari';
  const junction = kind === 'pf' ? 'user_pf' : 'user_df';
  const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';

  // Firma context: parent + ust_firma. Cascade davranışı buna göre belirlenir.
  const { data: firmRow } = await admin
    .from(table)
    .select('parent_id, ust_firma')
    .eq('id', id)
    .single();
  if (!firmRow) {
    return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 404 });
  }
  const parentId = (firmRow as { parent_id?: string | null }).parent_id ?? null;
  const ustFirma = (firmRow as { ust_firma?: boolean }).ust_firma ?? false;

  // Bu firma için junction satırı — varsa auto_inherit değerine dokunma.
  await admin.from(junction).upsert(
    [{ user_id: userId, [firmCol]: id, auto_inherit: false }],
    { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
  );

  // Parent firmaya da bağla (PARENT ↳ child düzeninin korunması için).
  if (parentId) {
    await admin.from(junction).upsert(
      [{ user_id: userId, [firmCol]: parentId, auto_inherit: false }],
      { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
    );
  }

  // ÜST FİRMA ise mevcut tüm child'lara da iliştir + auto-inherit cascade.
  if (ustFirma) {
    const { data: children } = await admin
      .from(table)
      .select('id')
      .eq('parent_id', id);
    const childIds = ((children ?? []) as { id: string }[]).map((c) => c.id);
    if (childIds.length > 0) {
      await admin.from(junction).upsert(
        childIds.map((cid) => ({ user_id: userId, [firmCol]: cid, auto_inherit: false })),
        { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
      );
    }
    await reconcileUstFirmaInherits(admin, kind as 'pf' | 'df', id);
  }

  // Bağlı yönetici otomatik ata (helper Üst Yönetici / dolu bagli durumunda no-op).
  await autoAssignBagliYoneticiFromFirma(admin, userId, kind as 'pf' | 'df', id);
  if (parentId) {
    await autoAssignBagliYoneticiFromFirma(admin, userId, kind as 'pf' | 'df', parentId);
  }

  return NextResponse.json({ ok: true });
}
