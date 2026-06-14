import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FirmForm } from '@/components/firm-form';

export const dynamic = 'force-dynamic';

export default async function NewDFPage() {
  const supabase = await supabaseServer();
  const { data: df } = await supabase
    .from('dagitim_firmalari')
    .select('id, firma_adi')
    .order('firma_adi');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/firms/df"><ArrowLeft className="h-3 w-3" /> Dağıtım Firmaları</Link>
      </Button>
      <h1 className="text-2xl font-semibold">Yeni Dağıtım Firması</h1>

      <FirmForm
        kind="df"
        mode="create"
        parentList={df ?? []}
        yetkiliUsers={[]}
      />
    </div>
  );
}
