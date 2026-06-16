'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Save } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Türkçe karakterleri ASCII'ye düşürüp e-posta yerel kısmı için temiz slug üretir.
function trSlug(s: string): string {
  const map: Record<string, string> = {
    'ş': 's', 'Ş': 's', 'ı': 'i', 'İ': 'i', 'ç': 'c', 'Ç': 'c',
    'ğ': 'g', 'Ğ': 'g', 'ö': 'o', 'Ö': 'o', 'ü': 'u', 'Ü': 'u',
  };
  return s
    .replace(/[şŞıİçÇğĞöÖüÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function deriveEmailFromAdi(adi: string): string {
  const parts = adi.trim().split(/\s+/).filter(Boolean).map(trSlug).filter(Boolean);
  if (parts.length === 0) return 'ad@soyad.com';
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : 'soyad';
  return `${first}@${last}.com`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'pf' | 'df';
  firmaId: string;
  firmaAdi: string;
  // Eğer bu firma bir alt birim ise üst firmasının id'si. Junction'a parent da
  // eklenir ki kullanıcı detayında "PARENT ↳ child" görünümü doğru çıksın.
  firmaParentId?: string | null;
  onCreated?: (userId: string) => void;
}

export function QuickUserDialog({
  open,
  onOpenChange,
  kind,
  firmaId,
  firmaAdi,
  firmaParentId,
  onCreated,
}: Props) {
  const router = useRouter();
  const [adi, setAdi] = React.useState('');
  const [email, setEmail] = React.useState('ad@soyad.com');
  const [gsm, setGsm] = React.useState('0212 255 55 55');
  const [unvan, setUnvan] = React.useState('');
  const [kademe, setKademe] = React.useState<'ust' | 'orta'>('orta');
  const [bagliYoneticiId, setBagliYoneticiId] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<{ id: string; adi: string }[]>([]);
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Dialog ilk açıldığında ünvanı firma adıyla doldur.
  const lastAutoUnvan = React.useRef<string>('');
  React.useEffect(() => {
    if (!open) return;
    const auto = `${firmaAdi.trim().toLocaleUpperCase('tr')} YÖNETİCİSİ`;
    // Boşsa veya son auto ile uyumluysa yeniden ata; admin değiştirdiyse dokunma.
    setUnvan((cur) => (cur === '' || cur === lastAutoUnvan.current ? auto : cur));
    lastAutoUnvan.current = auto;
  }, [open, firmaAdi]);

  // Email kullanıcı tarafından elle düzenlendi mi?
  const userEditedEmail = React.useRef(false);

  // Açıldığında diğer alanları sıfırla.
  React.useEffect(() => {
    if (!open) return;
    setAdi('');
    setGsm('0212 255 55 55');
    setKademe('orta');
    setBagliYoneticiId(null);
    setErr(null);
    setEmail('ad@soyad.com');
    userEditedEmail.current = false;
  }, [open]);

  // Bağlı yönetici adayları + parent yetkili user'ı pre-select.
  React.useEffect(() => {
    if (!open) return;
    const supabase = supabaseBrowser();
    const junction = kind === 'pf' ? 'user_pf' : 'user_df';
    const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
    const yonFlag = kind === 'pf' ? 'firma_yonetici' : 'gdf_yonetici';
    const firmTable = kind === 'pf' ? 'proje_firmalari' : 'dagitim_firmalari';
    const lookupIds = firmaParentId ? [firmaId, firmaParentId] : [firmaId];
    (async () => {
      // 1) Adayları: bu firma + parent'a bağlı yönetici flag'li kullanıcılar
      const { data } = await supabase
        .from(junction)
        .select(`users:users!inner(id, adi, ${yonFlag})`)
        .in(firmCol, lookupIds);
      const seen = new Set<string>();
      const list: { id: string; adi: string }[] = [];
      ((data ?? []) as unknown as { users: { id: string; adi: string; [k: string]: unknown } }[])
        .map((r) => r.users)
        .filter((u) => u && (u as Record<string, unknown>)[yonFlag])
        .forEach((u) => {
          if (seen.has(u.id)) return;
          seen.add(u.id);
          list.push({ id: u.id, adi: u.adi });
        });
      list.sort((a, b) => a.adi.localeCompare(b.adi, 'tr'));
      setCandidates(list);

      // 2) Parent firmanın yetkili_user_id'sini bağlı yönetici olarak pre-select
      if (firmaParentId) {
        const { data: parent } = await supabase
          .from(firmTable)
          .select('yetkili_user_id')
          .eq('id', firmaParentId)
          .single();
        const py = (parent as { yetkili_user_id?: string | null } | null)?.yetkili_user_id ?? null;
        if (py) setBagliYoneticiId(py);
      }
    })();
  }, [open, kind, firmaId, firmaParentId]);

  // Ad değiştikçe email otomatik türetilir (admin elle değiştirmediyse).
  React.useEffect(() => {
    if (!open) return;
    if (userEditedEmail.current) return;
    setEmail(deriveEmailFromAdi(adi));
  }, [adi, open]);

  async function handleSubmit() {
    setErr(null);
    if (adi.trim().length < 2) {
      setErr('Ad Soyad en az 2 karakter olmalı.');
      return;
    }
    if (!email || !/.+@.+\..+/.test(email)) {
      setErr('Geçerli bir e-posta girin.');
      return;
    }
    setPending(true);
    try {
      const isPf = kind === 'pf';
      const payload: Record<string, unknown> = {
        adi: adi.trim(),
        unvan: unvan.trim() || null,
        email: email.trim(),
        password: '123456',
        gsm: gsm.trim() || null,
        is_admin: false,
        firma_kullanicisi: isPf,
        firma_yonetici: isPf,
        firma_yonetici_kademe: isPf ? kademe : null,
        firma_proje_muhendisi: false,
        firma_cizim_sorumlusu: false,
        firma_tesisat_ustasi: false,
        usta_montaj: false,
        usta_celik_kaynak: false,
        usta_pe_kaynak: false,
        gdf_kullanicisi: !isPf,
        gdf_yonetici: !isPf,
        gdf_yonetici_kademe: !isPf ? kademe : null,
        gdf_onay_muhendisi: false,
        gdf_gaz_acma_muhendisi: false,
        gdf_on_buro_yetkilisi: false,
        bagli_oldugu_yonetici_id: kademe === 'ust' ? null : bagliYoneticiId,
        proje_muh_oda_sicil_no: null,
        proje_muh_kayit_no: null,
        proje_muh_yetki_durumu: null,
        onay_muh_gdf_sicil_no: null,
        gaz_acma_muh_ekip_no: null,
        yetkili_firma_ids: firmaParentId ? [firmaParentId, firmaId] : [firmaId],
        auto_inherit_firma_ids: [],
      };

      const userRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!userRes.ok) {
        const body = await userRes.json().catch(() => ({}));
        throw new Error(body.error || `Kullanıcı oluşturulamadı (${userRes.status})`);
      }
      const userData = (await userRes.json()) as { id: string };

      // Firmaya yetkili kullanıcı olarak bağla.
      const firmRes = await fetch(`/api/firms/${kind}/${firmaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yetkili_user_id: userData.id }),
      });
      if (!firmRes.ok) {
        const body = await firmRes.json().catch(() => ({}));
        throw new Error(body.error || `Firmaya yetkili atanamadı (${firmRes.status})`);
      }

      onCreated?.(userData.id);
      onOpenChange(false);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Yetkili Kullanıcı</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{firmaAdi}</span> için
            yeni bir yönetici tanımla. Şifre varsayılan olarak{' '}
            <span className="font-mono text-foreground">123456</span>.
          </DialogDescription>
        </DialogHeader>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        <div className="space-y-3">
          <Row label="Adı Soyadı">
            <Input value={adi} onChange={(e) => setAdi(e.target.value)} placeholder="Ahmet Yılmaz" />
          </Row>
          <Row label="E-posta">
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                userEditedEmail.current = true;
              }}
              placeholder="ad@soyad.com"
            />
          </Row>
          <Row label="GSM / Tel">
            <Input value={gsm} onChange={(e) => setGsm(e.target.value)} placeholder="0212 255 55 55" />
          </Row>
          <Row label="Ünvan">
            <Input value={unvan} onChange={(e) => setUnvan(e.target.value)} />
          </Row>
          <Row label="Kademe">
            <div className="flex flex-col gap-2 text-sm">
              <KademeBtn active={kademe === 'ust'} onClick={() => setKademe('ust')}>
                Üst Yönetici
              </KademeBtn>
              <KademeBtn active={kademe === 'orta'} onClick={() => setKademe('orta')}>
                Orta Kademe Yönetici
              </KademeBtn>
            </div>
          </Row>
          {kademe === 'orta' && (
            <Row label="Bağlı Yönetici">
              <Select
                value={bagliYoneticiId ?? '__none__'}
                onValueChange={(v) => setBagliYoneticiId(v === '__none__' ? null : v)}
                disabled={candidates.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      candidates.length === 0
                        ? 'Bu firmada henüz yönetici yok'
                        : 'Seçilmedi'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.adi}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            İptal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Tamam
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="w-28 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function KademeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'flex w-full cursor-pointer items-center justify-start gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {/* Radyo-stili görsel gösterge (button içinde değil — nested button olmaz). */}
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full border',
          active ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      {children}
    </div>
  );
}
