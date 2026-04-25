'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { MessageList, ChatComposer, SideAssistantWidget, useChatState, useChatActions } from '@arnessa/react/react';
import type { ConversationSnapshot, TimelineItem } from '@arnessa/react';
import { History, MessageCircle, MoonStar, PanelRight, Plus, Settings, SunMedium } from 'lucide-react';
import { useTheme } from './theme-provider';

type Snapshot = ConversationSnapshot;
const KEY = 'arnessa-conversations';
const MAX_SNAPSHOTS = 12;
const load = (): Snapshot[] => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

function compactContent(content: unknown) {
  if (typeof content === 'string') return content.slice(0, 1200);
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const value = item as { type?: string; text?: string; name?: string; source?: { mimeType?: string } };
      if (value.type === 'text') return { type: 'text', text: (value.text || '').slice(0, 1200) };
      return { type: value.type, name: value.name, source: value.source ? { mimeType: value.source.mimeType } : undefined };
    });
  }
  return content;
}

function compactSnapshots(snapshots: Snapshot[]) {
  return snapshots.slice(0, MAX_SNAPSHOTS).map((snapshot) => ({
    ...snapshot,
    timeline: snapshot.timeline.slice(-20).map((item) =>
      item.kind === 'message'
        ? { ...item, message: { ...item.message, content: compactContent(item.message.content) } }
        : item
    ),
  }));
}

function persistSnapshots(snapshots: Snapshot[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(compactSnapshots(snapshots)));
  } catch {
    try {
      const reduced = compactSnapshots(snapshots).slice(0, 6).map((s) => ({ ...s, timeline: s.timeline.slice(-8) }));
      localStorage.setItem(KEY, JSON.stringify(reduced));
    } catch {
      localStorage.removeItem(KEY);
    }
  }
}

function ChatSurface() {
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-0">
        <MessageList />
        <Separator />
        <ChatComposer className="shrink-0 p-3" />
      </CardContent>
    </Card>
  );
}

function AssistantDemoCanvas() {
  return (
    <div className="grid h-full min-h-[38rem] gap-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted via-background to-primary/10 p-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-h-0 flex-col justify-between">
        <div className="max-w-2xl space-y-5">
          <Badge variant="secondary" className="w-fit">Bubble / side assistant mode</Badge>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance">Keep the assistant nearby without letting it take over the workspace.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              The bubble opens a contained assistant rail inside this frame. It reuses the exact same timeline, deferred approvals, uploads, generated images, and composer from the shared TypeScript SDK.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              'Bubble launcher and contained panel',
              'Compact message density for long answers',
              'Deferred approval cards and tool results',
              'Shared uploads and generated image previews',
            ].map((item) => (
              <div key={item} className="rounded-2xl border bg-background/80 px-4 py-3 text-sm shadow-sm backdrop-blur">{item}</div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="rounded-full border bg-background/70 px-3 py-1.5">1. Click the bubble</span>
          <span className="rounded-full border bg-background/70 px-3 py-1.5">2. Ask something</span>
          <span className="rounded-full border bg-background/70 px-3 py-1.5">3. Hide it again</span>
        </div>
      </div>

      <div className="relative min-h-[30rem] rounded-[2rem] border border-white/60 bg-white/70 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="pointer-events-none absolute inset-x-5 top-5 rounded-full border bg-background/80 px-4 py-2 text-xs text-muted-foreground shadow-sm">
          Click the bubble to open the assistant.
        </div>
        <SideAssistantWidget
          placement="contained"
          title="Assistant"
          subtitle="Shared SDK timeline, approvals, images, and composer"
          launcherLabel="Ask Assistant"
          hideLabel="Hide assistant"
          panelClassName="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[1.75rem] border bg-card shadow-2xl"
        />
      </div>
    </div>
  );
}

export function StudioShell() {
  const state = useChatState();
  const { controller } = useChatActions();
  const { theme, setTheme } = useTheme();
  const [items, setItems] = useState<Snapshot[]>(() => load());
  const [open, setOpen] = useState(false);
  const [createdAt] = useState(() => Date.now());

  const currentId = state.threadId || 'current';
  const currentSnapshot = useMemo<Snapshot>(() => {
    const lastUser = [...state.timeline].reverse().find(
      (item): item is Extract<TimelineItem, { kind: 'message' }> => item.kind === 'message' && item.message.role === 'user'
    );
    const titleContent = lastUser?.message.content;
    return {
      id: currentId,
      title: (typeof titleContent === 'string' ? titleContent : String(titleContent ?? '')).slice(0, 40) || 'New conversation',
      threadId: state.threadId,
      timeline: state.timeline,
      updatedAt: items.find((item) => item.id === currentId)?.updatedAt ?? createdAt,
    };
  }, [createdAt, currentId, state.threadId, state.timeline, items]);

  const persisted = useMemo(
    () => [currentSnapshot, ...items.filter((item) => item.id !== currentSnapshot.id)],
    [currentSnapshot, items]
  );
  const history = useMemo(
    () => persisted.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: new Date(item.updatedAt).toLocaleString(),
      active: item.id === currentId,
    })),
    [persisted, currentId]
  );

  useEffect(() => { persistSnapshots(persisted); }, [persisted]);

  const hydrate = (id: string) => {
    const snap = persisted.find((i) => i.id === id);
    if (snap) controller.hydrateConversation(snap);
    setOpen(false);
  };

  const rename = (id: string) => {
    const title = prompt('New name');
    if (!title) return;
    const next = items.map((item) => item.id === id ? { ...item, title } : item);
    setItems(next);
    persistSnapshots(next);
  };

  const del = (id: string) => {
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    persistSnapshots(next);
  };

  const clear = () => {
    controller.resetConversation();
    setItems([]);
    localStorage.removeItem(KEY);
  };

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 p-4">
          <div>
            <div className="text-lg font-semibold">Arnessa Studio</div>
            <div className="text-xs text-muted-foreground">Furniture design with AG-UI</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={state.runStatus === 'running' ? 'default' : 'secondary'}>
              {state.runStatus}
            </Badge>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger className="group/button inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground">
                <History className="h-4 w-4" />
                History
              </SheetTrigger>
              <SheetContent>
                <Tabs defaultValue="history" className="mt-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                  </TabsList>
                  <TabsContent value="history">
                    <div className="mt-4 space-y-2">
                      {history.map((item) => (
                        <Card key={item.id} className={item.active ? 'border-primary/40' : ''}>
                          <CardContent className="flex items-center justify-between p-3">
                            <button type="button" className="text-left" onClick={() => hydrate(item.id)}>
                              <div className="text-sm font-medium">{item.title}</div>
                              <div className="text-xs text-muted-foreground">{item.subtitle}</div>
                            </button>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => rename(item.id)}>
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => del(item.id)}>
                                <History className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      <Button variant="outline" className="w-full" onClick={clear}>Clear</Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="activity">
                    <div className="mt-4 text-sm text-muted-foreground">
                      {state.timeline.slice(-8).map((item) => {
                        const label = item.kind === 'custom'
                          ? item.name
                          : item.kind === 'activity'
                            ? item.message.activityType
                            : item.message.role;
                        const key = item.kind + (item.id);
                        return (
                          <div key={key} className="py-2">
                            <div className="font-medium text-foreground">{item.kind}</div>
                            <div className="text-xs">{label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                </Tabs>
              </SheetContent>
            </Sheet>
            <DropdownMenu>
              <DropdownMenuTrigger className="group/button inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground">
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <SunMedium className="mr-2 h-4 w-4" /> : <MoonStar className="mr-2 h-4 w-4" />}
                  Theme
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={clear}>
              <Plus className="mr-2 h-4 w-4" />
              New
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto h-full min-h-0 w-full max-w-none flex-1 overflow-hidden p-4">
        <Tabs defaultValue="studio" className="flex h-full min-h-0 flex-col gap-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="studio" className="gap-2">
              <PanelRight className="h-4 w-4" />
              Studio
            </TabsTrigger>
            <TabsTrigger value="assistant" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Side assistant
            </TabsTrigger>
          </TabsList>

          <TabsContent value="studio" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ChatSurface />
          </TabsContent>

          <TabsContent value="assistant" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <div className="relative h-full min-h-0 overflow-hidden">
              <AssistantDemoCanvas />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
