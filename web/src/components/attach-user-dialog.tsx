'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus, UserPlus } from 'lucide-react';

export interface AttachUserOption {
  id: string;
  adi: string;
  unvan?: string | null;
  rolEtiketi?: string | null;
  // Bu kullanıcının yetkilisi olduğu (firma.yetkili_user_id eşleşen) firma adları.
  // Combobox satırında "→ FirmA, FirmB" şeklinde gösterilir; boşsa yer kaplamaz.
  yetkiliFirmalar?: string[];
}

interface Props {
  kind: 'pf' | 'df';
  firmaId: string;
  firmaAdi: string;
  availableUsers: AttachUserOption[];
}

// Mevcut bir kullanıcıyı bu firmaya iliştirir — PF/DF detayında "Mevcut Kullanıcı
// Ekle" butonu + dialog'unu sarar. Server endpoint cascade'i çalıştırır
// (parent/child junction + bağlı yönetici otomatik atama).
export function AttachUserButton({ kind, firmaId, firmaAdi, availableUsers }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState<string>('');
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setUserId('');
      setErr(null);
    }
  }, [open]);

  async function handleSubmit() {
    if (!userId) {
      setErr('Bir kullanıcı seçin.');
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/firms/${kind}/${firmaId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Eklenemedi.');
    } finally {
      setPending(false);
    }
  }

  const empty = availableUsers.length === 0;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={empty}
        title={empty ? 'Eklenebilecek mevcut kullanıcı yok' : undefined}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Mevcut Kullanıcı Ekle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mevcut Kullanıcı Ekle</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{firmaAdi}</span> firmasına mevcut bir
              {kind === 'pf' ? ' PF' : ' DF'} kullanıcısı bağla.
            </DialogDescription>
          </DialogHeader>

          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Kullanıcı</Label>
            <Select value={userId || undefined} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Kullanıcı seçin…" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                      <span className="font-medium text-foreground">{u.adi}</span>
                      {u.unvan && (
                        <span className="text-[10px] italic text-muted-foreground">
                          {u.unvan}
                        </span>
                      )}
                      {u.rolEtiketi && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                          {u.rolEtiketi}
                        </span>
                      )}
                      {u.yetkiliFirmalar && u.yetkiliFirmalar.length > 0 && (
                        <span className="text-[10px] font-medium text-emerald-700">
                          → {u.yetkiliFirmalar.join(', ')}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              İptal
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={pending || !userId}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
