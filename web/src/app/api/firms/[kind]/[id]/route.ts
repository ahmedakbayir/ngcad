import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';

function tableFor(kind: string) {
  if (kind === 'pf') return 'proje_firmalari';
  if (kind === 'df') return 'dagitim_firmalari';
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { kind, id } = await params;
  const table = tableFor(kind);
  if (!table) return NextResponse.json({ error: 'Geçersiz tip' }, { status: 400 });

  const body = await req.json();
  const { df_ids, alt_firma_ids, ...firmData } = body;

  const admin = supabaseAdmin();
  const { error } = await admin.from(table).update(firmData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (kind === 'pf') {
    if (firmData.ust_firma) {
      // ÜST FİRMA: DF junction'ı temizle.
      await admin.from('pf_df').delete().eq('pf_id', id);
      // Alt PF parent_id senkron: mevcut altları sıfırla, gelen listeyi ata.
      if (Array.isArray(alt_firma_ids)) {
        const { data: currentChildren } = await admin
          .from('proje_firmalari')
          .select('id')
          .eq('parent_id', id);
        const currentIds = (currentChildren ?? []).map((r) => r.id as string);
        const targetSet = new Set(alt_firma_ids as string[]);
        const toClear = currentIds.filter((cid) => !targetSet.has(cid));
        if (toClear.length > 0) {
          await admin
            .from('proje_firmalari')
            .update({ parent_id: null })
            .in('id', toClear);
        }
        if (alt_firma_ids.length > 0) {
          await admin
            .from('proje_firmalari')
            .update({ parent_id: id })
            .in('id', alt_firma_ids as string[]);
        }
      }
    } else if (Array.isArray(df_ids)) {
      await admin.from('pf_df').delete().eq('pf_id', id);
      if (df_ids.length > 0) {
        await admin.from('pf_df').insert(df_ids.map((df_id: string) => ({ pf_id: id, df_id })));
      }
      await admin
        .from('proje_firmalari')
        .update({ parent_id: null })
        .eq('parent_id', id);
    }
  } else if (kind === 'df') {
    if (firmData.ust_firma) {
      // ÜST FİRMA DF: PF-DF junction satırları (bu üst firmaya gidenler) koparılır.
      await admin.from('pf_df').delete().eq('df_id', id);
      // Alt DF parent_id senkron.
      if (Array.isArray(alt_firma_ids)) {
        const { data: currentChildren } = await admin
          .from('dagitim_firmalari')
          .select('id')
          .eq('parent_id', id);
        const currentIds = (currentChildren ?? []).map((r) => r.id as string);
        const targetSet = new Set(alt_firma_ids as string[]);
        const toClear = currentIds.filter((cid) => !targetSet.has(cid));
        if (toClear.length > 0) {
          await admin
            .from('dagitim_firmalari')
            .update({ parent_id: null })
            .in('id', toClear);
        }
        if (alt_firma_ids.length > 0) {
          await admin
            .from('dagitim_firmalari')
            .update({ parent_id: id })
            .in('id', alt_firma_ids as string[]);
        }
      }
    } else {
      // Klasik DF: çocukluk ilişkilerini temizle (üst firma değilse alt birim sahibi olamaz).
      await admin
        .from('dagitim_firmalari')
        .update({ parent_id: null })
        .eq('parent_id', id);
    }
  }

  return NextResponse.json({ id });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { kind, id } = await params;
  const table = tableFor(kind);
  if (!table) return NextResponse.json({ error: 'Geçersiz tip' }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from(table).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
