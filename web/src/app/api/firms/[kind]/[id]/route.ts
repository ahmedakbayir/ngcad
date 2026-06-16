import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guards';

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
  await admin
    .from(junction)
    .upsert(
      userIds.map((uid) => ({ user_id: uid, [firmCol]: parentId, auto_inherit: false })),
      { onConflict: `user_id,${firmCol}` },
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
  const { alt_firma_ids, ...firmData } = body;

  const admin = supabaseAdmin();
  const { error } = await admin.from(table).update(firmData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
    const rows: Record<string, unknown>[] = [
      { user_id: firmData.yetkili_user_id, [firmCol]: id, auto_inherit: curUstFirma },
    ];
    if (curParentId) {
      rows.push({ user_id: firmData.yetkili_user_id, [firmCol]: curParentId, auto_inherit: false });
    }
    await admin.from(junctionTable).upsert(rows, { onConflict: `user_id,${firmCol}` });

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
      await admin.from(junctionTable).upsert(
        (inherits as { user_id: string }[]).map((r) => ({
          user_id: r.user_id,
          [firmCol]: id,
          auto_inherit: false,
        })),
        { onConflict: `user_id,${firmCol}` },
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
        await admin.from(junctionTable).upsert(rows, { onConflict: `user_id,${firmCol}` });
      }
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
