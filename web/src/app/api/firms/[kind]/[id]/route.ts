import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';
import { autoAssignBagliYoneticiFromFirma, reconcileUstFirmaInherits } from '@/lib/user-junctions';

function tableFor(kind: string) {
  if (kind === 'pf') return 'proje_firmalari';
  if (kind === 'df') return 'dagitim_firmalari';
  return null;
}

// Child firmaya bağlı kullanıcıları üst firmaya da bağlar (junction'a parent
// satırını upsert eder). Listbox'ta "PARENT ↳ child" düzeninin görünmesini
// sağlar. auto_inherit=false ile insert edilir (parent için varsayılan).
async function backfillParentJunction(
  admin: SupabaseClient,
  kind: 'pf' | 'df',
  childId: string,
  parentId: string,
) {
  const junction = kind === 'pf' ? 'user_pf' : 'user_df';
  const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
  const { data: links } = await admin
    .from(junction)
    .select('user_id')
    .eq(firmCol, childId);
  const userIds = (links ?? []).map((r: { user_id: string }) => r.user_id);
  if (userIds.length === 0) return;
  // ignoreDuplicates: parent satırının auto_inherit=true değerini SAKIN ezme;
  // yalnız EKSİK olan satırlar eklenir.
  await admin
    .from(junction)
    .upsert(
      userIds.map((uid) => ({ user_id: uid, [firmCol]: parentId, auto_inherit: false })),
      { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
    );
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
  const { alt_firma_ids, yetkili_change_action, ...firmData } = body as {
    alt_firma_ids?: string[];
    yetkili_change_action?: 'transfer' | 'keep' | 'clear';
    [k: string]: unknown;
  };

  const admin = supabaseAdmin();

  // Yetkili değişikliği için eski yetkili'yi update'ten ÖNCE oku ki sonradan
  // bagli_oldugu_yonetici_id eşleştirmesi doğru çalışsın.
  let oldYetkiliId: string | null = null;
  if (yetkili_change_action) {
    const { data: cur } = await admin
      .from(table)
      .select('yetkili_user_id')
      .eq('id', id)
      .single();
    oldYetkiliId = (cur as { yetkili_user_id?: string | null } | null)?.yetkili_user_id ?? null;
  }

  const { error } = await admin.from(table).update(firmData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Yetkili değişikliği sonrası eski yetkilinin BU firmadaki astlarına aksiyon
  // uygula. Scope: yalnız bu firmaya üye (user_pf/user_df) kullanıcılar; admin
  // başka firmalarda bu kişiyi yönetici olarak tutmuş olabilir.
  if (yetkili_change_action && oldYetkiliId) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const { data: members } = await admin
      .from(junctionTable)
      .select('user_id')
      .eq(firmCol, id);
    const memberIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
    if (memberIds.length > 0) {
      if (yetkili_change_action === 'transfer' && firmData.yetkili_user_id) {
        await admin
          .from('users')
          .update({ bagli_oldugu_yonetici_id: firmData.yetkili_user_id })
          .in('id', memberIds)
          .eq('bagli_oldugu_yonetici_id', oldYetkiliId);
      } else if (yetkili_change_action === 'clear') {
        await admin
          .from('users')
          .update({ bagli_oldugu_yonetici_id: null })
          .in('id', memberIds)
          .eq('bagli_oldugu_yonetici_id', oldYetkiliId);
      }
      // 'keep' = no-op (bagli_oldugu_yonetici_id eski yetkiliyi gösterirse kalsın)
    }
  }

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

  // Güncel durum (parent_id + ust_firma) — PATCH partial payload geldiyse de
  // DB'den alalım.
  const { data: cur } = await admin
    .from(table)
    .select('parent_id, ust_firma')
    .eq('id', id)
    .single();
  const curParentId = (cur as { parent_id?: string | null } | null)?.parent_id;
  const curUstFirma = (cur as { ust_firma?: boolean } | null)?.ust_firma ?? false;

  // SAHİP TEMİZLEME (DF Üst → alt DF): Alt DF'lerde sahip bilgisi olmamalı
  // (kullanıcı kuralı). PATCH her çağrıldığında child'ların sahip'i null'a
  // çekilir — mevcut stale veriyi de tek geçişte temizler.
  if (kind === 'df' && curUstFirma) {
    await admin
      .from('dagitim_firmalari')
      .update({ sahip: null })
      .eq('parent_id', id);
  }

  // VERGİ CASCADE (PF Üst → alt PF): üst firmanın vergi_dairesi / vergi_no'su
  // alt PF'lere SET edilir. Spec: "üst firmada bu veriler değişirse alt firmada
  // da otomatik değişmiş olmalı". Hem PATCH'te vergi alanı geldiyse hem alt_firma_ids
  // ile yeni child eklendiyse senkron olsun diye, mevcut DB değerini okuyup
  // tüm alt'lara idempotent SET ederiz.
  if (kind === 'pf' && curUstFirma) {
    const { data: parentRow } = await admin
      .from('proje_firmalari')
      .select('vergi_dairesi, vergi_no')
      .eq('id', id)
      .single();
    const vd = (parentRow as { vergi_dairesi?: string | null } | null)?.vergi_dairesi ?? null;
    const vn = (parentRow as { vergi_no?: string | null } | null)?.vergi_no ?? null;
    await admin
      .from('proje_firmalari')
      .update({ vergi_dairesi: vd, vergi_no: vn })
      .eq('parent_id', id);
  }

  // BACKFILL: Bu firmanın güncel parent_id'si varsa, kendisine bağlı kullanıcıları
  // o parent'a da bağla.
  if (curParentId) {
    await backfillParentJunction(admin, kind as 'pf' | 'df', id, curParentId);
  }
  // Yetkili kullanıcı seçildiyse junction'ı garanti et + üst firma yetkililerinde
  // auto_inherit=true varsayılan (yeni alt birimleri otomatik miras alsınlar).
  if (firmData.yetkili_user_id) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    // BU firma: auto_inherit'i curUstFirma ile (üst firma yetkilisi → true) AYARLA.
    await admin.from(junctionTable).upsert(
      [{ user_id: firmData.yetkili_user_id, [firmCol]: id, auto_inherit: curUstFirma }],
      { onConflict: `user_id,${firmCol}` },
    );
    // Parent (varsa): satır yoksa ekle ama mevcut auto_inherit değerini KORU.
    // Why: child PATCH'inde parent'ın true bayrağı yanlışlıkla false'a düşmesin.
    if (curParentId) {
      await admin.from(junctionTable).upsert(
        [{ user_id: firmData.yetkili_user_id, [firmCol]: curParentId, auto_inherit: false }],
        { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
      );
    }

    // ÜST FİRMA yetkili user'ı seçildiyse mevcut tüm alt birimlere de bağla
    // (eskiden eklenmiş child firmaları da yetkilinin junction'ına yaz).
    if (curUstFirma) {
      const { data: existingChildren } = await admin
        .from(table)
        .select('id')
        .eq('parent_id', id);
      const childIds = ((existingChildren ?? []) as { id: string }[]).map((c) => c.id);
      if (childIds.length > 0) {
        await admin.from(junctionTable).upsert(
          childIds.map((cid) => ({
            user_id: firmData.yetkili_user_id,
            [firmCol]: cid,
            auto_inherit: false,
          })),
          { onConflict: `user_id,${firmCol}` },
        );
      }
    }

    // Bağlı yönetici otomatik ata: child firmada yetkili belirleniyorsa parent
    // firmanın yetkili user'ını bu kullanıcının üst yöneticisi yap (yalnız
    // mevcut bağlı yönetici null ise — admin manuel atamasını ezme).
    if (curParentId) {
      const { data: parentRow } = await admin
        .from(table)
        .select('yetkili_user_id')
        .eq('id', curParentId)
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
  // 2) ÜST FİRMA modunda alt_firma_ids ile eklenen her child için, child'a bağlı
  //    kullanıcıları bu firmaya (parent=id) da bağla.
  if (firmData.ust_firma && Array.isArray(alt_firma_ids) && alt_firma_ids.length > 0) {
    for (const childId of alt_firma_ids as string[]) {
      await backfillParentJunction(admin, kind as 'pf' | 'df', childId, id);
    }
  }

  // 3) AUTO-INHERIT CASCADE (parent → child): Bu firma bir parent altındaysa,
  //    parent'taki auto_inherit=true kullanıcılarına bu firmayı da bağla.
  //    Üst firmaya sonradan eklenen alt birimler için kritik.
  if (curParentId) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const { data: inherits } = await admin
      .from(junctionTable)
      .select('user_id')
      .eq(firmCol, curParentId)
      .eq('auto_inherit', true);
    if (inherits && inherits.length > 0) {
      // ignoreDuplicates: bu firma kendi yetkilisinin auto_inherit'ine sahipse
      // (örn. üst firma + parent altında — nadir ama mümkün) overwrite olmasın.
      await admin.from(junctionTable).upsert(
        (inherits as { user_id: string }[]).map((r) => ({
          user_id: r.user_id,
          [firmCol]: id,
          auto_inherit: false,
        })),
        { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true },
      );
    }
  }
  // 3b) ÜST FİRMA modunda alt_firma_ids ile eklenen her child için, BU firmadaki
  //     auto_inherit=true kullanıcılarına child'ı da bağla.
  if (firmData.ust_firma && Array.isArray(alt_firma_ids) && alt_firma_ids.length > 0) {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const { data: inherits } = await admin
      .from(junctionTable)
      .select('user_id')
      .eq(firmCol, id)
      .eq('auto_inherit', true);
    if (inherits && inherits.length > 0) {
      const userIds = (inherits as { user_id: string }[]).map((r) => r.user_id);
      const rows: Record<string, unknown>[] = [];
      for (const childId of alt_firma_ids as string[]) {
        for (const uid of userIds) {
          rows.push({ user_id: uid, [firmCol]: childId, auto_inherit: false });
        }
      }
      if (rows.length > 0) {
        // ignoreDuplicates: child'ın kendi yetkilisinin auto_inherit'i varsa ezme.
        await admin.from(junctionTable).upsert(rows, {
          onConflict: `user_id,${firmCol}`,
          ignoreDuplicates: true,
        });
      }
    }
  }

  // 4) GÜVENLİK AĞI: Yukarıdaki adımların herhangi biri unutulsa/sıralama
  //    sorunu yaşansa bile, BU firma üst firmaysa tüm child'lar için cascade'i
  //    son bir kez idempotent çalıştır. Bu olmadan "üst firmaya yetkili eklendi
  //    ama alt firmalar görünmüyor" şikayetinin önüne geçemiyoruz.
  if (curUstFirma) {
    await reconcileUstFirmaInherits(admin, kind as 'pf' | 'df', id);
  }
  // 5) Bu firma bir parent altındaysa, parent'taki auto_inherit users için BU
  //    firmanın junction'ını garanti et (üst firmaya child eklenince).
  if (curParentId) {
    await reconcileUstFirmaInherits(admin, kind as 'pf' | 'df', curParentId);
  }

  // 6) BAĞLI YÖNETİCİ OTOMATİK ATAMA: BU firmanın yetkili'si varsa, firmaya
  //    bağlı tüm kullanıcılar (yetkili hariç + Üst Yönetici hariç + bagli boş
  //    olanlar) yetkiliye bağlanır. Helper idempotent.
  {
    const junctionTable = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const { data: members } = await admin
      .from(junctionTable)
      .select('user_id')
      .eq(firmCol, id);
    for (const m of (members ?? []) as { user_id: string }[]) {
      await autoAssignBagliYoneticiFromFirma(admin, m.user_id, kind as 'pf' | 'df', id);
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
