import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// CAD ↔ Web köprüsü. Browser session (cookie) ile auth.
// Sadece RLS izin verirse veri döner / yazılır.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, no, proje_adi, cad_data, durum, updated_at,
      pf:proje_firmalari(id, firma_adi),
      df:dagitim_firmalari(id, firma_adi),
      owner:users(id, adi, email)
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: CORS });
  if (!data)  return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404, headers: CORS });
  return NextResponse.json(data, { headers: CORS });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('projects')
    .update({ cad_data: body.cad_data, proje_adi: body.proje_adi })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: CORS });
  return NextResponse.json({ ok: true }, { headers: CORS });
}
