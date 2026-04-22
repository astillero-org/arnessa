import React, { useState } from 'react';
import { HistoryList, HistoryEmpty } from './HistoryList';
import { useChatState } from './ArnessaProvider';
import { ActivityIndicator } from './message-renderers';

export interface SideChatWidgetProps { isOpen?: boolean; onClose?: () => void; onSelectHistory?: (id: string) => void; }

export const SideChatWidget: React.FC<SideChatWidgetProps> = ({ isOpen: controlled, onClose, onSelectHistory }) => {
  const [open, setOpen] = useState(false);
  const state = useChatState();
  const isOpen = controlled ?? open;
  const toggle = () => controlled === undefined && setOpen(v => !v);
  const historyItems = [{ id: state.threadId || 'current', title: 'Conversación actual', subtitle: `${state.timeline.length} eventos`, active: true }];
  return <>{!isOpen ? <button type="button" className="fixed bottom-4 right-4 rounded-full border bg-background px-4 py-3 shadow-lg" onClick={toggle}>Historial</button> : null}{isOpen ? <div className="fixed inset-y-0 right-0 w-[22rem] border-l bg-background p-4 shadow-2xl"><div className="flex items-center justify-between"><div className="text-sm font-semibold">Actividad</div><button type="button" onClick={() => { onClose?.(); toggle(); }}>Cerrar</button></div><div className="mt-4 space-y-4"><HistoryList items={historyItems} onSelect={onSelectHistory} /></div><div className="mt-6"><ActivityIndicator label={state.runStatus === 'running' ? 'Procesando' : 'Sin actividad'} /></div>{state.timeline.length === 0 ? <HistoryEmpty /> : null}</div> : null}</>;
};
