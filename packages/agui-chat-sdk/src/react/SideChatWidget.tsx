'use client';

import React, { useState } from 'react';
import { MessageList } from './MessageList';
import { ChatComposer } from './ChatComposer';
import { useChatActions, useChatState } from './ArnessaProvider';

export interface SideAssistantWidgetProps {
  className?: string;
  panelClassName?: string;
  title?: string;
  subtitle?: string;
  placement?: 'fixed' | 'contained';
  open?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  inline?: boolean;
  embedded?: boolean;
  launcherLabel?: string;
  hideLabel?: string;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

export const SideAssistantWidget: React.FC<SideAssistantWidgetProps> = ({
  className,
  panelClassName,
  title = 'Assistant',
  subtitle,
  placement = 'fixed',
  open,
  isOpen,
  defaultOpen = false,
  inline,
  embedded,
  launcherLabel = 'Assistant',
  hideLabel = 'Hide assistant',
  onOpenChange,
  onClose,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const { runStatus } = useChatState();
  const { abort } = useChatActions();
  const panelOnly = inline ?? embedded ?? false;
  const controlledOpen = open ?? isOpen;
  const visible = panelOnly || (controlledOpen ?? uncontrolledOpen);
  const statusText = subtitle ?? (runStatus === 'running' ? 'Working…' : 'Ready');

  const setVisible = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };

  const close = () => {
    onClose?.();
    setVisible(false);
  };

  const show = () => {
    setVisible(true);
  };

  const panel = (
    <aside className={panelClassName ?? className ?? 'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border bg-card shadow-xl'}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{statusText}</div>
        </div>
        <div className="flex items-center gap-2">
          {runStatus === 'running' ? (
            <button type="button" onClick={abort} className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted">
              Stop
            </button>
          ) : null}
          {!panelOnly ? (
            <button type="button" onClick={close} className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted">
              {hideLabel}
            </button>
          ) : null}
        </div>
      </div>
      <MessageList density="compact" className="h-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3" />
      <ChatComposer className="shrink-0 border-t bg-background/95 p-3" />
    </aside>
  );

  if (panelOnly) return panel;

  if (placement === 'contained') {
    return (
      <>
        {!visible ? (
          <button
            type="button"
            className="absolute bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xl transition hover:bg-primary/90"
            onClick={show}
          >
            {launcherLabel}
          </button>
        ) : null}
        {visible ? (
          <div className="absolute inset-y-4 right-4 z-30 w-[min(22rem,calc(100%-1rem))]">
            {panel}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {!visible ? (
        <button type="button" className="fixed bottom-5 right-5 z-50 rounded-full border bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-2xl" onClick={show}>
          {launcherLabel}
        </button>
      ) : null}
      {visible ? <div className="fixed inset-y-0 right-0 z-50 w-[min(24rem,100vw)] border-l bg-background p-3 shadow-2xl">{panel}</div> : null}
    </>
  );
};

export interface SideChatWidgetProps extends SideAssistantWidgetProps {
  onSelectHistory?: (id: string) => void;
}

export const SideChatWidget: React.FC<SideChatWidgetProps> = ({ onSelectHistory: _onSelectHistory, ...props }) => (
  <SideAssistantWidget {...props} title={props.title ?? 'Side assistant'} />
);
