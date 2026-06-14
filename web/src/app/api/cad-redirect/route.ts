import { NextResponse, type NextRequest } from 'next/server';

// CAD uygulamasının URL'i (env'den). Yoksa relative (../index.html) — geliştirme için.
const CAD_URL =
  process.env.NEXT_PUBLIC_CAD_URL ||
  process.env.CAD_URL ||
  '/../index.html';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const url = new URL(CAD_URL, req.url);
  if (project) url.searchParams.set('project', project);
  return NextResponse.redirect(url);
}
