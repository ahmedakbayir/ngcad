import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { UserForm } from '../user-form';
import { loadUserFormOptions } from '../user-form-data';

export const dynamic = 'force-dynamic';

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ pf_id?: string; df_id?: string }>;
}) {
  const supabase = await supabaseServer();
  const opts = await loadUserFormOptions(supabase);

  // PF/DF detayından "Kullanıcı Ekle" akışı: ilgili firma id query ile gelir,
  // form kanal + yetkili firma listesini önceden doldurarak açılır. Geçersiz id
  // sessizce yoksayılır.
  const { pf_id, df_id } = await searchParams;
  const prefillPfId = pf_id && opts.pfList.some((p) => p.id === pf_id) ? pf_id : null;
  const prefillDfId =
    !prefillPfId && df_id && opts.dfList.some((d) => d.id === df_id) ? df_id : null;
  const prefillFirma = prefillPfId
    ? opts.pfList.find((p) => p.id === prefillPfId) ?? null
    : prefillDfId
      ? opts.dfList.find((d) => d.id === prefillDfId) ?? null
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link
            href={
              prefillPfId
                ? `/firms/pf/${prefillPfId}`
                : prefillDfId
                  ? `/firms/df/${prefillDfId}`
                  : '/users'
            }
          >
            <ArrowLeft className="h-3 w-3" />
            {prefillFirma ? prefillFirma.firma_adi : 'Kullanıcılar'}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {prefillFirma ? `${prefillFirma.firma_adi} — Yeni Kullanıcı` : 'Yeni Kullanıcı'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Davet e-postası gönderilecek; kullanıcı şifresini kendisi belirler.
        </p>
      </div>

      <UserForm
        mode="create"
        pfList={opts.pfList}
        dfList={opts.dfList}
        candidateYoneticiler={opts.yoneticiler}
        prefillPfId={prefillPfId}
        prefillDfId={prefillDfId}
      />
    </div>
  );
}
