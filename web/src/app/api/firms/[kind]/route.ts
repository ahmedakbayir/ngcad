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
  const { df_ids = [], ...firmData } = body;

  const admin = supabaseAdmin();
  const { data, error } = await admin.from(table).insert(firmData).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (kind === 'pf' && Array.isArray(df_ids) && df_ids.length > 0) {
    await admin
      .from('pf_df')
      .insert(df_ids.map((df_id: string) => ({ pf_id: data.id, df_id })));
  }

  return NextResponse.json({ id: data.id });
}
