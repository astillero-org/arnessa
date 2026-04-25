'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useChatState } from '@arnessa/react/react';

type TimelineItem = { kind: string; message?: { id?: string; activityType?: string; content?: unknown }; name?: string; value?: unknown };
type PreviewContentItem = { type?: string; text?: string; source?: { value?: string; mimeType?: string }; data?: string; mime_type?: string; path?: string };

function pickSummary(timeline: TimelineItem[]) { return [...timeline].reverse().find(item => item.kind === 'custom' || item.kind === 'message'); }

function normalizeContent(content: unknown) {
  if (typeof content === 'string') return { text: content, images: [] as Array<{ url: string; name: string }> };
  if (Array.isArray(content)) {
    const items = content as PreviewContentItem[];
    const text = items.filter((item) => item?.type === 'text').map((item) => item.text || '').join(' ');
    const images = items
      .filter((item) => item?.type === 'image' && item?.source?.value)
      .map((item, index) => ({
        url: `data:${item.source?.mimeType || 'image/png'};base64,${item.source?.value || ''}`,
        name: item.path || `Imagen ${index + 1}`,
      }));
    return {
      text,
      images,
    };
  }
  if (content && typeof content === 'object') {
    const value = content as PreviewContentItem;
    if (typeof value.data === 'string') {
      return {
        text: '',
        images: [{ url: value.data, name: value.path || 'Imagen generada' }],
      };
    }
    return { text: JSON.stringify(content), images: [] as Array<{ url: string; name: string }> };
  }
  return { text: '', images: [] as Array<{ url: string; name: string }> };
}

export function PreviewPanel() {
  const { timeline, runStatus, lastError } = useChatState();
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const latest = pickSummary(timeline as TimelineItem[]);
  const activity = (timeline as TimelineItem[]).filter(item => item.kind === 'activity').slice(-4);
  const progress = Math.min(100, activity.length * 25);
  const latestContent = normalizeContent(latest?.kind === 'custom' ? latest.value : latest?.message?.content);

  if (runStatus === 'error' && lastError) return <div className="w-full min-w-0 lg:w-96"><Alert variant="destructive"><AlertTitle>Error de generación</AlertTitle><AlertDescription>{(lastError as any).message}</AlertDescription></Alert></div>;

  if (!latest) return <Card className="w-full min-w-0 lg:w-96"><CardHeader><CardTitle>Preview</CardTitle></CardHeader><CardContent className="space-y-3"><Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>;

  return <><Card className="w-full min-w-0 lg:w-96"><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle className="min-w-0 truncate">Canvas / Preview</CardTitle><Badge variant="secondary">{runStatus === 'running' ? 'Generando' : 'Listo'}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-muted p-5">{latestContent.images.length > 0 ? <div className="mb-4 grid gap-3 sm:grid-cols-2">{latestContent.images.map((image, index) => <button key={`${image.name}-${index}`} type="button" className="overflow-hidden rounded-2xl border bg-background p-2 text-left transition hover:border-primary/40" onClick={() => setSelectedImage(image)}><div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted"><Image src={image.url} alt={image.name} fill className="object-contain" unoptimized /></div><p className="mt-2 truncate text-xs text-muted-foreground">{image.name}</p></button>)}</div> : null}<div className="min-w-0 text-sm font-medium">{latest.kind === 'custom' ? latest.name : 'Última respuesta'}</div><div className="mt-2 max-w-full overflow-x-auto"><pre className="text-sm text-muted-foreground whitespace-pre">{latestContent.text.slice(0, 220) || 'Sin contenido aún.'}</pre></div></div><Separator /><div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Progreso</span><span>{progress}%</span></div><Progress value={progress} /></div><div className="space-y-2">{activity.length ? activity.map((item) => <div key={item.message?.id || item.kind} className="max-w-full overflow-x-auto text-sm whitespace-pre">{String(item.message?.activityType || 'Actividad')}</div>) : <div className="text-sm text-muted-foreground">Esperando eventos de actividad.</div>}</div></CardContent></Card><Dialog open={Boolean(selectedImage)} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}><DialogContent className="w-[min(30vw,30rem)] max-w-[30vw] min-w-[18rem]"><DialogHeader className="flex-row items-center justify-between gap-3 space-y-0"><DialogTitle className="truncate">{selectedImage?.name || 'Imagen'}</DialogTitle><button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium transition hover:bg-muted" onClick={() => setSelectedImage(null)}>Cerrar</button></DialogHeader>{selectedImage ? <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-muted p-4"><Image src={selectedImage.url} alt={selectedImage.name} width={640} height={360} className="h-auto max-h-[30vh] w-auto max-w-full object-contain" unoptimized /></div> : null}</DialogContent></Dialog></>;
}
