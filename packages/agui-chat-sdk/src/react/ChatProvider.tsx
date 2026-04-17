'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChatController } from '../core/ChatController';
import { ChatState } from '../core/ChatStore';
import { AttachmentDraft } from '../core/attachment-utils';
import {
  ChatLabels,
  ChatComponentOverrides,
  ChatRendererOverrides,
} from '../core/types';

const DEFAULT_LABELS: Required<ChatLabels> = {
  placeholder: 'Type a message…',
  attachLabel: 'Attach',
  sendLabel: 'Send',
  emptyTitle: 'Start a conversation',
  emptySubtitle: 'Send a message to get started.',
  dragHint: 'Drag images or documents here',
  closeImageLabel: 'Close image',
  activityDefault: 'Activity',
  toolResultDefault: 'Result',
};

interface ChatStateContextValue {
  state: ChatState;
}

interface ChatActionsContextValue {
  controller: ChatController;
  sendMessage: (content: string | { text: string; attachments?: AttachmentDraft[] }) => Promise<unknown>;
  abort: () => void;
}

interface ChatOverridesContextValue {
  labels: Required<ChatLabels>;
  components: ChatComponentOverrides;
  renderers: ChatRendererOverrides;
}

const ChatStateContext = createContext<ChatStateContextValue | undefined>(undefined);
const ChatActionsContext = createContext<ChatActionsContextValue | undefined>(undefined);
const ChatOverridesContext = createContext<ChatOverridesContextValue | undefined>(undefined);

export interface ChatProviderProps {
  controller: ChatController;
  labels?: ChatLabels;
  components?: ChatComponentOverrides;
  renderers?: ChatRendererOverrides;
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  controller,
  labels,
  components = {},
  renderers = {},
  children,
}) => {
  const [state, setState] = useState<ChatState>(controller.store.getState());
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => {
    const unsubscribe = controller.store.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, [controller]);

  const actions = useMemo<ChatActionsContextValue>(() => ({
    controller,
    sendMessage: (content) => controllerRef.current.sendUserMessage(content as any),
    abort: () => controllerRef.current.abort(),
  }), [controller]);

  const overrides = useMemo<ChatOverridesContextValue>(() => ({
    labels: { ...DEFAULT_LABELS, ...labels },
    components,
    renderers,
  }), [labels, components, renderers]);

  return (
    <ChatStateContext.Provider value={{ state }}>
      <ChatActionsContext.Provider value={actions}>
        <ChatOverridesContext.Provider value={overrides}>
          {children}
        </ChatOverridesContext.Provider>
      </ChatActionsContext.Provider>
    </ChatStateContext.Provider>
  );
};

export const useChatState = (): ChatState => {
  const ctx = useContext(ChatStateContext);
  if (!ctx) throw new Error('useChatState must be used within a ChatProvider');
  return ctx.state;
};

export const useChatActions = () => {
  const ctx = useContext(ChatActionsContext);
  if (!ctx) throw new Error('useChatActions must be used within a ChatProvider');
  return ctx;
};

export const useChatOverrides = (): ChatOverridesContextValue => {
  const ctx = useContext(ChatOverridesContext);
  if (!ctx) throw new Error('useChatOverrides must be used within a ChatProvider');
  return ctx;
};

export const useChat = () => {
  const { state } = useContext(ChatStateContext) ?? (() => { throw new Error('useChat must be used within a ChatProvider'); })();
  const actions = useChatActions();
  return { state, controller: actions.controller };
};
