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
  const { df_ids, ...firmData } = body;

  const admin = supabaseAdmin();
  const { error } = await admin.from(table).update(firmData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // PF için DF junction senkron
  if (kind === 'pf' && Array.isArray(df_ids)) {
    await admin.from('pf_df').delete().eq('pf_id', id);
    if (df_ids.length > 0) {
      await admin.from('pf_df').insert(df_ids.map((df_id: string) => ({ pf_id: id, df_id })));
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
