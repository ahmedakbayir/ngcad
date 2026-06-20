'use client';

import * as React from 'react';
import Link from 'next/link';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2, Plus, UserPlus } from 'lucide-react';
import { UserSearchDialog } from '@/components/user-search-dialog';
import type { AttachUserOption } from '@/components/attach-user-dialog';

interface Props {
  kind: 'pf' | 'df';
  firmaId: string;
  firmaAdi: string;
  // "Kendi Firma Kullanıcılarından Seç" havuzu — firma ve parent firmadaki yetkili
  // (yönetici) kullanıcılar.
  selfFirmaUsers: AttachUserOption[];
  // Halihazırda doğrudan bağlı user_id'leri — "Diğer" araması bunları filtrelemek
  // için kullanır. (Self havuzu zaten dışlanmış geliyor.)
  excludeUserIds?: string[];
}

// PF/DF detay sayfalarında "Kullanıcı Ekle" akışını üç seçenekli SplitButton ile
// sunar:
//   - Default click  → "Yeni Oluştur" (/users/new?pf_id|df_id=X)
//   - Dropdown caret → Yeni Oluştur / Kendi Firma Kullanıcılarından Seç / Diğer
// Sağ caret kısmı küçük bir DropdownMenu ile açılır; "Kendi" mevcut select-dialog'u,
// "Diğer" mail-arama dialog'u açar.
export function AttachUserSplitButton({
  kind,
  firmaId,
  firmaAdi,
  selfFirmaUsers,
  excludeUserIds,
}: Props) {
  const router = useRouter();
  const [selfOpen, setSelfOpen] = React.useState(false);
  const [otherOpen, setOtherOpen] = React.useState(false);

  const newHref = `/users/new?${kind}_id=${firmaId}`;

  return (
    <>
      <div className="inline-flex">
        <Button asChild size="sm" className="rounded-r-none border-r border-primary/30">
          <Link href={newHref}>
            <Plus className="h-3.5 w-3.5" />
            Kullanıcı Ekle
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="rounded-l-none px-2"
              aria-label="Kullanıcı ekleme seçenekleri"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={newHref}>
                <UserPlus className="h-3.5 w-3.5" /> Yeni Oluştur
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setSelfOpen(true);
              }}
              disabled={selfFirmaUsers.length === 0}
            >
              <UserPlus className="h-3.5 w-3.5" /> Kendi Firma Kullanıcılarından Seç
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setOtherOpen(true);
              }}
            >
              <UserPlus className="h-3.5 w-3.5" /> Diğer Kullanıcılardan Seç
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SelfFirmaPickerDialog
        open={selfOpen}
        onOpenChange={setSelfOpen}
        kind={kind}
        firmaId={firmaId}
        firmaAdi={firmaAdi}
        availableUsers={selfFirmaUsers}
        onAdded={() => router.refresh()}
      />

      <UserSearchDialog
        open={otherOpen}
        onOpenChange={setOtherOpen}
        kind={kind}
        firmaId={firmaId}
        firmaAdi={firmaAdi}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}

// "Kendi Firma" iç dialog'u — eski AttachUserButton içinden devşirildi (UI ile
// API çağrısı). availableUsers boşsa dropdown disabled olur.
function SelfFirmaPickerDialog({
  open,
  onOpenChange,
  kind,
  firmaId,
  firmaAdi,
  availableUsers,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'pf' | 'df';
  firmaId: string;
  firmaAdi: string;
  availableUsers: AttachUserOption[];
  onAdded?: () => void;
}) {
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
      onOpenChange(false);
      onAdded?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Eklenemedi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kendi Firma Kullanıcılarından Seç</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{firmaAdi}</span> firmasına firma
            ailenden bir{kind === 'pf' ? ' PF' : ' DF'} yetkilisi bağla.
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
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-foreground">{u.adi}</span>
                    {u.unvan && (
                      <span className="text-[10px] italic text-muted-foreground">{u.unvan}</span>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            İptal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending || !userId}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
