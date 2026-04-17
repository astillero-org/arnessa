import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ChatController } from '../core/ChatController';
import { ChatState } from '../core/ChatStore';
import { AttachmentDraft } from '../core/attachment-utils';

interface ChatContextValue {
  controller: ChatController;
  state: ChatState;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export interface ChatProviderProps {
  controller: ChatController;
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ controller, children }) => {
  const [state, setState] = useState<ChatState>(controller.store.getState());

  useEffect(() => {
    const unsubscribe = controller.store.subscribe((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, [controller]);

  const value = useMemo(() => ({ controller, state }), [controller, state]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const useChatState = () => useChat().state;
export const useChatActions = () => {
  const { controller } = useChat();
  return useMemo(() => ({
    sendMessage: (text: string | { text: string; attachments?: AttachmentDraft[] }) => controller.sendUserMessage(text as any),
    run: (params?: any) => controller.run(params),
    abort: () => controller.abort(),
  }), [controller]);
};
