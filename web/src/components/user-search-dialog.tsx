'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus, Search } from 'lucide-react';

interface FoundUser {
  id: string;
  adi: string;
  email: string | null;
  unvan: string | null;
}

// Komponent dışında sabit boş referans — default `[]` her render'da yeni nesne
// olurdu; useEffect dep'inde sonsuz tetiklenmeye yol açıyordu.
const EMPTY_IDS: string[] = [];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'pf' | 'df';
  firmaId: string;
  firmaAdi: string;
  // Halihazırda firmaya doğrudan bağlı olan kullanıcı id'leri — listeden gizlenir.
  excludeUserIds?: string[];
  // Kullanıcı seçilip eklendikten sonra çalışır. mode="select" ise bu callback
  // tetiklenir ve dialog kendiliğinden kapanır; junction kayıtlarını çağıran
  // sayfa yönetir. mode="attach" varsayılan davranış — API'ye POST atar.
  mode?: 'attach' | 'select';
  onSelected?: (userId: string) => void;
}

// Mail (veya ad) ile firma_kullanicisi / gdf_kullanicisi olan, henüz bu firmaya
// bağlanmamış kullanıcıları arar. Kapsam tip filtresine UYAR: PF için yalnız
// firma_kullanicisi=true, DF için yalnız gdf_kullanicisi=true (kullanıcı kuralı:
// "biri diğerine dönüşmez, listeye gelmez").
export function UserSearchDialog({
  open,
  onOpenChange,
  kind,
  firmaId,
  firmaAdi,
  excludeUserIds = EMPTY_IDS,
  mode = 'attach',
  onSelected,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<FoundUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Sonuç modu — sadece UI başlığı için: 'idle' = boşta kullanıcılar listesi,
  // 'search' = aktif arama eşleşmeleri.
  const [resultMode, setResultMode] = React.useState<'idle' | 'search'>('idle');
  const [attachingId, setAttachingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setErr(null);
    }
  }, [open]);

  // excludeUserIds prop'u parent her render'da yeni array verirse useEffect dep'i
  // sürekli "değişmiş" görünür ve sonsuz loop'a yol açar. Ref ile en güncel
  // değeri okuyup dep array'inden çıkarıyoruz.
  const excludeRef = React.useRef(excludeUserIds);
  React.useEffect(() => {
    excludeRef.current = excludeUserIds;
  }, [excludeUserIds]);

  // Dialog açıkken: query boş ise BOŞTA olanları (junction'da kayıtsız) getir.
  // 2+ karakter girilirse 250ms debounce ile mail/ad araması yap. İki mod da
  // tip filtresine UYAR (PF için firma_kullanicisi, DF için gdf_kullanicisi).
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const isSearch = q.length >= 2;
    let cancelled = false;
    setLoading(true);
    setResultMode(isSearch ? 'search' : 'idle');
    const handle = setTimeout(async () => {
      try {
        const supabase = supabaseBrowser();
        const flag = kind === 'pf' ? 'firma_kullanicisi' : 'gdf_kullanicisi';
        if (isSearch) {
          const { data } = await supabase
            .from('users')
            .select('id, adi, email, unvan')
            .eq(flag, true)
            .or(`email.ilike.%${q}%,adi.ilike.%${q}%`)
            .limit(20);
          if (cancelled) return;
          const exclude = new Set(excludeRef.current);
          setResults(((data ?? []) as FoundUser[]).filter((u) => !exclude.has(u.id)));
        } else {
          // Boşta olanlar: kanal junction'da hiç kaydı olmayan + tip flag'i taşıyan.
          const junction = kind === 'pf' ? 'user_pf' : 'user_df';
          const { data: linked } = await supabase.from(junction).select('user_id');
          if (cancelled) return;
          const linkedSet = new Set(
            ((linked ?? []) as { user_id: string }[]).map((r) => r.user_id),
          );
          const { data } = await supabase
            .from('users')
            .select('id, adi, email, unvan')
            .eq(flag, true)
            .order('adi')
            .limit(50);
          if (cancelled) return;
          const exclude = new Set(excludeRef.current);
          setResults(
            ((data ?? []) as FoundUser[]).filter(
              (u) => !exclude.has(u.id) && !linkedSet.has(u.id),
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, isSearch ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open, kind]);

  async function handlePick(uid: string) {
    setErr(null);
    if (mode === 'select') {
      onSelected?.(uid);
      onOpenChange(false);
      return;
    }
    setAttachingId(uid);
    try {
      const res = await fetch(`/api/firms/${kind}/${firmaId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSelected?.(uid);
      onOpenChange(false);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Eklenemedi.');
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Diğer Kullanıcılardan Seç</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{firmaAdi}</span> firmasına e-posta veya
            ad ile {kind === 'pf' ? 'bir PF' : 'bir DF'} kullanıcısı bağla.
          </DialogDescription>
        </DialogHeader>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">E-posta veya ad</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ornek@mail.com veya ad soyad"
              className="pl-7"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loading && (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />{' '}
                {resultMode === 'search' ? 'Aranıyor…' : 'Boştaki kullanıcılar yükleniyor…'}
              </div>
            )}
            {!loading && results.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {resultMode === 'search'
                  ? 'Eşleşen kullanıcı bulunamadı.'
                  : 'Boşta kullanıcı yok — aramak için yazmaya başlayın.'}
              </p>
            )}
            {!loading && results.length > 0 && (
              <>
                {resultMode === 'idle' && (
                  <p className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Boştaki Kullanıcılar ({results.length})
                  </p>
                )}
                <ul className="divide-y">
                {results.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 leading-tight">
                      <div className="truncate font-medium">{u.adi}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {u.email}
                        {u.unvan && <span className="ml-1 italic">· {u.unvan}</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={attachingId !== null}
                      onClick={() => handlePick(u.id)}
                    >
                      {attachingId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {mode === 'select' ? 'Seç' : 'Ekle'}
                    </Button>
                  </li>
                ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
