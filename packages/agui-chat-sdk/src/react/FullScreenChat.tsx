'use client';

import React from 'react';
import { MessageList } from './MessageList';
import { ChatComposer } from './ChatComposer';
import { useChatActions, useChatState } from './ArnessaProvider';

export interface FullScreenChatProps {
  className?: string;
}

export const FullScreenChat: React.FC<FullScreenChatProps> = ({ className }) => {
  const { runStatus } = useChatState();
  const { abort } = useChatActions();

  return (
    <div className={className ?? 'flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-sm'}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Chat</div>
          <div className="text-xs text-muted-foreground">{runStatus === 'running' ? 'Generating…' : 'Ready'}</div>
        </div>
        {runStatus === 'running' ? (
          <button
            type="button"
            onClick={abort}
            className="inline-flex h-9 items-center rounded-md border bg-secondary px-3 text-sm font-medium shadow-sm hover:bg-secondary/80"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <MessageList />
      <ChatComposer />
    </div>
  );
};
