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
  const { alt_firma_ids, ...firmData } = body;

  const admin = supabaseAdmin();
  const { error } = await admin.from(table).update(firmData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (kind === 'pf') {
    if (firmData.ust_firma) {
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
    } else {
      // Klasik PF: alt birimlik ilişkilerini temizle (üst firma değilse alt birim sahibi olamaz).
      await admin
        .from('proje_firmalari')
        .update({ parent_id: null })
        .eq('parent_id', id);
    }
  } else if (kind === 'df') {
    if (firmData.ust_firma) {
      // ÜST FİRMA DF: bu DF'ye doğrudan bağlı PF'lerin df_id'si null'a çekilir.
      await admin
        .from('proje_firmalari')
        .update({ df_id: null })
        .eq('df_id', id);
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
