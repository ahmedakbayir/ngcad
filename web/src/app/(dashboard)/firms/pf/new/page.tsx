import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FirmForm } from '@/components/firm-form';

export const dynamic = 'force-dynamic';

export default async function NewPFPage({
  searchParams,
}: {
  searchParams: Promise<{ parent_id?: string }>;
}) {
  const supabase = await supabaseServer();
  const [pf, df] = await Promise.all([
    supabase
      .from('proje_firmalari')
      .select('id, firma_adi, parent_id, ust_firma')
      .order('firma_adi'),
    supabase
      .from('dagitim_firmalari')
      .select('id, firma_adi, parent_id, ust_firma')
      .order('firma_adi'),
  ]);

  const { parent_id } = await searchParams;
  // Sadece ust_firma=true olan PF parent olarak kabul edilir; yanlış id sessizce yoksayılır.
  const parentValid =
    parent_id && (pf.data ?? []).some((p) => p.id === parent_id && p.ust_firma);
  const defaultParentId = parentValid ? parent_id : null;
  const parentAdi = defaultParentId
    ? (pf.data ?? []).find((p) => p.id === defaultParentId)?.firma_adi ?? null
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/firms/pf"><ArrowLeft className="h-3 w-3" /> Proje Firmaları</Link>
      </Button>
      <h1 className="text-2xl font-semibold">
        {parentAdi ? `${parentAdi} — Yeni Alt Firma` : 'Yeni Proje Firması'}
      </h1>

      <FirmForm
        kind="pf"
        mode="create"
        parentList={pf.data ?? []}
        dfList={df.data ?? []}
        yetkiliUsers={[]}
        defaultParentId={defaultParentId}
      />
    </div>
  );
}
