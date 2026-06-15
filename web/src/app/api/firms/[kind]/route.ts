import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';

function tableFor(kind: string) {
  if (kind === 'pf') return 'proje_firmalari';
  if (kind === 'df') return 'dagitim_firmalari';
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { kind } = await params;
  const table = tableFor(kind);
  if (!table) return NextResponse.json({ error: 'Geçersiz tip' }, { status: 400 });

  const body = await req.json();
  const { df_ids = [], alt_firma_ids = [], ...firmData } = body;

  const admin = supabaseAdmin();
  const { data, error } = await admin.from(table).insert(firmData).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (kind === 'pf') {
    if (firmData.ust_firma) {
      if (Array.isArray(alt_firma_ids) && alt_firma_ids.length > 0) {
        await admin
          .from('proje_firmalari')
          .update({ parent_id: data.id })
          .in('id', alt_firma_ids);
      }
    } else if (Array.isArray(df_ids) && df_ids.length > 0) {
      await admin
        .from('pf_df')
        .insert(df_ids.map((df_id: string) => ({ pf_id: data.id, df_id })));
    }
  } else if (kind === 'df') {
    if (firmData.ust_firma && Array.isArray(alt_firma_ids) && alt_firma_ids.length > 0) {
      // Seçilen alt DF'lerin parent_id'sini bu üst firmaya çevir.
      await admin
        .from('dagitim_firmalari')
        .update({ parent_id: data.id })
        .in('id', alt_firma_ids);
    }
  }

  return NextResponse.json({ id: data.id });
}
