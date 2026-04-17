import React from 'react';
import { Clock, History, Trash2 } from 'lucide-react';

export type HistoryItem = { id: string; title: string; subtitle?: string; active?: boolean; updatedAt?: string };

export function HistoryList({ items, onSelect, onRename, onDelete, onClear, activeId }: { items: HistoryItem[]; onSelect?: (id: string) => void; onRename?: (id: string) => void; onDelete?: (id: string) => void; onClear?: () => void; activeId?: string | null; }) {
  return <div className="space-y-3 p-4">{onClear ? <button type="button" className="text-xs uppercase tracking-wide text-muted-foreground" onClick={onClear}>Limpiar historial</button> : null}{items.map(item => <div key={item.id} className={`rounded-2xl border p-4 ${activeId === item.id || item.active ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}><button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => onSelect?.(item.id)}><Clock className="h-4 w-4" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.subtitle || item.updatedAt || 'Reciente'}</div></div></button><div className="mt-3 flex gap-2">{onRename ? <button type="button" className="text-xs" onClick={() => onRename(item.id)}>Renombrar</button> : null}{onDelete ? <button type="button" className="text-xs text-destructive" onClick={() => onDelete(item.id)}><Trash2 className="inline h-3 w-3" /> Borrar</button> : null}</div></div>)}</div>;
}

export function HistoryEmpty() { return <div className="p-6 text-center text-sm text-muted-foreground"><History className="mx-auto mb-2 h-5 w-5" />No hay conversaciones guardadas</div>; }
