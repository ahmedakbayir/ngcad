import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';
import { autoAssignBagliYoneticiFromFirma, reconcileUstFirmaInherits } from '@/lib/user-junctions';

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
  const { alt_firma_ids = [], ...firmData } = body;

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
        // VERGİ CASCADE: yeni üst PF'nin vergi alanları varsa alt'lara SET.
        // Spec: "üst firmanın vergi dairesi ve vergi nosu alt firmaya atanmalı".
        const vergiCascade: Record<string, unknown> = {};
        if (firmData.vergi_dairesi != null) vergiCascade.vergi_dairesi = firmData.vergi_dairesi;
        if (firmData.vergi_no != null) vergiCascade.vergi_no = firmData.vergi_no;
        if (Object.keys(vergiCascade).length > 0) {
          await admin
            .from('proje_firmalari')
            .update(vergiCascade)
            .in('id', alt_firma_ids);
        }
      }
    }
    // df_id zaten firmData içinde — junction tablo yok.
  } else if (kind === 'df') {
    if (firmData.ust_firma && Array.isArray(alt_firma_ids) && alt_firma_ids.length > 0) {
      // Seçilen alt DF'lerin parent_id'sini bu üst firmaya çevir.
      await admin
        .from('dagitim_firmalari')
        .update({ parent_id: data.id })
        .in('id', alt_firma_ids);
    }
  }

  // AUTO-INHERIT CASCADE: Yeni firma bir parent altına eklendiyse, parent'ta
  // auto_inherit=true bayraklı user_pf/user_df sahiplerine bu yeni firmayı da
  // (auto_inherit=false ile) bind et.
  if (firmData.parent_id) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const { data: inherits } = await admin
      .from(junctionTable)
      .select('user_id')
      .eq(firmCol, firmData.parent_id)
      .eq('auto_inherit', true);
    if (inherits && inherits.length > 0) {
      // upsert + ignoreDuplicates: hem mevcut yetkili (POST yetkili upsert'iyle
      // çakışırsa) overwrite olmasın hem de aynı user için tekrar denemesi
      // güvenli olsun.
      await admin.from(junctionTable).upsert(
        inherits.map((r: { user_id: string }) => ({
          user_id: r.user_id,
          [firmCol]: data.id,
          auto_inherit: false,
        })),
        { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
      );
    }
  }

  // BACKFILL: ÜST FİRMA modunda alt_firma_ids ile var olan child'ları aldıysak,
  // her child'a bağlı kullanıcıları bu yeni parent'a da bağla.
  if (firmData.ust_firma && Array.isArray(alt_firma_ids) && alt_firma_ids.length > 0) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    for (const childId of alt_firma_ids as string[]) {
      const { data: links } = await admin
        .from(junctionTable)
        .select('user_id')
        .eq(firmCol, childId);
      const userIds = ((links ?? []) as { user_id: string }[]).map((r) => r.user_id);
      if (userIds.length > 0) {
        // ignoreDuplicates: yeni parent'ın yetkili upsert'iyle çakışırsa
        // (POST'ta yetkili daha sonra geliyor ama yine de güvenli olalım)
        // auto_inherit overwrite olmasın.
        await admin.from(junctionTable).upsert(
          userIds.map((uid) => ({ user_id: uid, [firmCol]: data.id, auto_inherit: false })),
          { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
        );
      }
    }
  }

  // Yetkili kullanıcı seçildiyse junction'ı garanti et. Üst firma yetkililerinde
  // auto_inherit=true varsayılan; parent varsa parent için de ekle.
  if (firmData.yetkili_user_id) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    // BU firma: auto_inherit'i firmData.ust_firma'ya göre AYARLA.
    await admin.from(junctionTable).upsert(
      [{ user_id: firmData.yetkili_user_id, [firmCol]: data.id, auto_inherit: !!firmData.ust_firma }],
      { onConflict: `user_id,${firmCol}` },
    );
    // Parent (varsa): satır yoksa ekle; mevcut auto_inherit değerini KORU.
    if (firmData.parent_id) {
      await admin.from(junctionTable).upsert(
        [{ user_id: firmData.yetkili_user_id, [firmCol]: firmData.parent_id, auto_inherit: false }],
        { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
      );
    }

    // Bağlı yönetici otomatik ata: child firmada yetkili belirleniyorsa parent'ın
    // yetkili user'ı bu kullanıcının üst yöneticisi olur (mevcut null ise).
    if (firmData.parent_id) {
      const { data: parentRow } = await admin
        .from(table)
        .select('yetkili_user_id')
        .eq('id', firmData.parent_id)
        .single();
      const parentYetkili = (parentRow as { yetkili_user_id?: string | null } | null)?.yetkili_user_id;
      if (parentYetkili && parentYetkili !== firmData.yetkili_user_id) {
        const { data: userRow } = await admin
          .from('users')
          .select('bagli_oldugu_yonetici_id')
          .eq('id', firmData.yetkili_user_id)
          .single();
        const curMgr = (userRow as { bagli_oldugu_yonetici_id?: string | null } | null)?.bagli_oldugu_yonetici_id;
        if (!curMgr) {
          await admin
            .from('users')
            .update({ bagli_oldugu_yonetici_id: parentYetkili })
            .eq('id', firmData.yetkili_user_id);
        }
      }
    }
  }

  // GÜVENLİK AĞI: cascade adımları unutulsa/sıralama sorunu yaşansa bile
  // idempotent reconcile çalıştır. Yeni firma üst firmaysa kendi child'larına,
  // bir alt birimse parent'ının auto_inherit user'larından kendisine cascade.
  if (firmData.ust_firma) {
    await reconcileUstFirmaInherits(admin, kind as 'pf' | 'df', data.id);
  }
  if (firmData.parent_id) {
    await reconcileUstFirmaInherits(admin, kind as 'pf' | 'df', firmData.parent_id);
  }

  // BAĞLI YÖNETİCİ OTOMATİK ATAMA: yeni firma yetkili ile geldiyse veya parent
  // üzerinden cascade'le user_pf/user_df satırı oluştuysa, bu firmaya bağlı tüm
  // user'ları firma yetkilisine bağla (idempotent helper).
  {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const { data: members } = await admin
      .from(junctionTable)
      .select('user_id')
      .eq(firmCol, data.id);
    for (const m of (members ?? []) as { user_id: string }[]) {
      await autoAssignBagliYoneticiFromFirma(admin, m.user_id, kind as 'pf' | 'df', data.id);
    }
  }

  return NextResponse.json({ id: data.id });
}
