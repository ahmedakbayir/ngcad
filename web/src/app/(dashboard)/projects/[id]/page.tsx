import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const TABS = [
  { value: 'infos',        label: 'Infos' },
  { value: 'docs',         label: 'Docs' },
  { value: 'insurances',   label: 'Insurances' },
  { value: 'units',        label: 'Units' },
  { value: 'unitDevices',  label: 'UnitDevices' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'histories',    label: 'Histories' },
  { value: 'states',       label: 'States' },
];

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: project } = await supabase
    .from('projects')
    .select('*, pf:proje_firmalari(id, firma_adi), df:dagitim_firmalari(id, firma_adi), owner:users(id, adi)')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  const cadHref = `/api/cad-redirect?project=${project.id}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/projects"><ArrowLeft className="h-3 w-3" /> Projeler</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.proje_adi}</h1>
            <Badge variant="outline">#{project.no}</Badge>
            <Badge variant="secondary">{project.durum ?? 'taslak'}</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {project.pf && (
              <Link href={`/firms/pf/${project.pf.id}`} className="hover:underline">{project.pf.firma_adi}</Link>
            )}
            {project.pf && project.df && ' · '}
            {project.df && (
              <Link href={`/firms/df/${project.df.id}`} className="hover:underline">{project.df.firma_adi}</Link>
            )}
            {project.owner && (
              <>
                {' · '}
                <Link href={`/users/${project.owner.id}`} className="hover:underline">{project.owner.adi}</Link>
              </>
            )}
          </div>
        </div>
        <Button asChild>
          <a href={cadHref} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> CAD'de Aç
          </a>
        </Button>
      </div>

      <Tabs defaultValue="infos">
        <TabsList className="flex h-auto flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Bu sekme şu an boş. Şema sonradan doldurulacak.
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
