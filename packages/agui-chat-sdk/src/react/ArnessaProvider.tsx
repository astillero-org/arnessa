import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ArnessaClient, ArnessaEvent } from "../core/ArnessaClient";
import { ChatController } from "../core/ChatController";
import { ChatStore } from "../core/ChatStore";
import { attachmentToInputContent } from "../core/attachment-utils";
import type { ChatState } from "../core/types";

interface ArnessaContextType {
  client?: ArnessaClient;
  controller?: ChatController;
  chatStore?: ChatStore;
  chatState?: ChatState;
  status: "idle" | "running" | "error";
  events: ArnessaEvent[];
  sessionId: string | null;
}

const isAgUiEvent = (event: ArnessaEvent): event is ArnessaEvent & { type: string } => typeof event.type === 'string';
const isLegacyEvent = (event: ArnessaEvent): event is ArnessaEvent & { kind: string; payload?: any } => typeof event.kind === 'string';
const isAgUiCustomEvent = (event: ArnessaEvent): event is ArnessaEvent & { type: 'CUSTOM'; name: string; value: any } => event.type === 'CUSTOM' && typeof event.name === 'string';

const getCustomEvent = (event: ArnessaEvent) => {
  if (isAgUiCustomEvent(event)) return { name: event.name, value: event.value, timestamp: event.timestamp };
  if (isLegacyEvent(event)) return { name: event.kind, value: event.payload, timestamp: event.timestamp };
  return null;
};

const shouldIncludeCustomEventInTimeline = (event: ArnessaEvent) => {
  if (!isAgUiCustomEvent(event)) return true;
  return !['arnessa.stateChanged', 'arnessa.uiMount', 'arnessa.uiUpdate', 'arnessa.uiUnmount', 'arnessa.toolResolutionAck'].includes(event.name);
};

const ArnessaContext = createContext<ArnessaContextType | null>(null);

export interface ArnessaProviderProps {
  endpoint: string;
  sessionId?: string;
  labels?: Record<string, string>;
  components?: Record<string, React.ComponentType<any>>;
  renderers?: Record<string, React.ComponentType<any>>;
  children: React.ReactNode;
}

const ArnessaOverridesContext = createContext<{
  labels: Record<string, string>;
  components: Record<string, React.ComponentType<any>>;
  renderers: Record<string, React.ComponentType<any>>;
} | null>(null);

export const ArnessaProvider: React.FC<ArnessaProviderProps> = ({ 
  endpoint, 
  sessionId: initialSessionId, 
  labels = {},
  components = {},
  renderers = {},
  children 
}) => {
  const client = useMemo(() => new ArnessaClient(endpoint, initialSessionId), [endpoint, initialSessionId]);
  const [chatStore] = useState(() => new ChatStore());
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [events, setEvents] = useState<ArnessaEvent[]>([]);
  const [chatState, setChatState] = useState<ChatState>(() => chatStore.getState());
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);

  useEffect(() => chatStore.subscribe(setChatState), [chatStore]);

  useEffect(() => {
    const statusSub = client.status$.subscribe(setStatus);
    const eventSub = client.events$.subscribe((event) => {
      setEvents((prev) => [...prev, event]);
      const nextSessionId = event.session_id || event.threadId || null;
      if (nextSessionId) {
        setSessionId(nextSessionId);
      }
      if (isAgUiEvent(event) && (event.type !== 'CUSTOM' || shouldIncludeCustomEventInTimeline(event))) {
        chatStore.applyEvent(event as any);
      }
    });

    return () => {
      statusSub.unsubscribe();
      eventSub.unsubscribe();
    };
  }, [chatStore, client]);

  const overrides = useMemo(() => ({ labels, components, renderers }), [labels, components, renderers]);

  return (
    <ArnessaContext.Provider value={{ client, chatStore, chatState, status, events, sessionId }}>
      <ArnessaOverridesContext.Provider value={overrides}>
        {children}
      </ArnessaOverridesContext.Provider>
    </ArnessaContext.Provider>
  );
};

export interface ChatProviderProps {
  controller: ChatController;
  labels?: Record<string, string>;
  components?: Record<string, React.ComponentType<any>>;
  renderers?: Record<string, React.ComponentType<any>>;
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  controller,
  labels = {},
  components = {},
  renderers = {},
  children,
}) => {
  const [chatState, setChatState] = useState<ChatState>(() => controller.store.getState());

  useEffect(() => controller.store.subscribe(setChatState), [controller]);

  const overrides = useMemo(() => ({ labels, components, renderers }), [labels, components, renderers]);

  return (
    <ArnessaContext.Provider
      value={{
        controller,
        chatState,
        status: chatState.runStatus,
        events: [],
        sessionId: chatState.threadId,
      }}
    >
      <ArnessaOverridesContext.Provider value={overrides}>
        {children}
      </ArnessaOverridesContext.Provider>
    </ArnessaContext.Provider>
  );
};

export const useArnessa = () => {
  const context = useContext(ArnessaContext);
  if (!context) throw new Error("useArnessa must be used within ArnessaProvider");
  return context;
};

export const useArnessaOverrides = () => {
  const context = useContext(ArnessaOverridesContext);
  if (!context) throw new Error("useArnessaOverrides must be used within ArnessaProvider");
  return context;
};

// Legacy compatibility hooks
export const useChatState = () => {
  const { chatState } = useArnessa();
  if (!chatState) throw new Error("useChatState requires ArnessaProvider or ChatProvider");
  return chatState;
};

export const useChatActions = () => {
  const { client, controller, chatStore } = useArnessa();
  if (controller) {
    return {
      sendMessage: (payload: any) => controller.sendUserMessage(payload),
      controller,
      abort: () => controller.abort(),
    };
  }
  if (!client || !chatStore) throw new Error("useChatActions requires ArnessaProvider or ChatProvider");
  const localController = {
    sendUserMessage: async (payload: any) => {
      const text = typeof payload === 'string' ? payload : payload?.text || '';
      const attachments = typeof payload === 'string' ? [] : payload?.attachments || [];
      const threadId = chatStore.getState().threadId || client.currentSessionId || Math.random().toString(36).substring(2, 10);
      if (!chatStore.getState().threadId) chatStore.setThreadId(threadId);
      const content = attachments.length > 0
        ? [
            ...(text.trim() ? [{ type: 'text' as const, text }] : []),
            ...attachments.map(attachmentToInputContent),
          ]
        : text;
      chatStore.addUserMessage({
        id: Math.random().toString(36).substring(2, 10),
        role: 'user',
        content,
        timestamp: Date.now(),
      });
      const deps = attachments.length > 0
        ? {
            metadata: {
              artifacts: attachments.map((attachment: any) => ({
                name: attachment.name,
                path: attachment.name,
                mime_type: attachment.mimeType || attachment.type || 'application/octet-stream',
                data: `data:${attachment.mimeType || attachment.type || 'application/octet-stream'};base64,${attachment.base64}`,
              })),
            },
          }
        : undefined;
      return client.send(text, deps);
    },
    resetConversation: () => chatStore.clearCurrentThread(),
    hydrateConversation: (snap: any) => chatStore.hydrateConversation(snap),
  };
  return {
    sendMessage: (payload: any) => localController.sendUserMessage(payload),
    abort: () => { /* TBD */ },
    controller: localController,
  };
};

export const useChat = () => {
  const actions = useChatActions();
  return { controller: actions.controller };
};

export const useChatOverrides = () => {
  const overrides = useArnessaOverrides();
  return { 
    labels: {
      emptyTitle: 'Start a conversation',
      emptySubtitle: 'Ask a question or describe what you need help with.',
      placeholder: 'Escribe un mensaje...',
      attachLabel: 'Adjuntar archivos',
      dragHint: 'Drag files here or attach them',
      sendLabel: 'Send message',
      closeImageLabel: 'Close image',
      toolResultDefault: 'Tool result',
      ...overrides.labels
    }, 
    components: overrides.components, 
    renderers: overrides.renderers 
  };
};

// New API
export const useHarness = () => {
  const { client, status, events } = useArnessa();
  if (!client) throw new Error("useHarness must be used within ArnessaProvider");
  const send = (message: string, deps?: any) => client.send(message, deps);
  return { send, status, messages: events };
};

export const useAgentState = <T,>() => {
  const { client, events } = useArnessa();
  if (!client) throw new Error("useAgentState must be used within ArnessaProvider");
  const [state, setState] = useState<T | null>(null);
  const [writableFields, setWritableFields] = useState<string[]>([]);

  useEffect(() => {
    const lastStateEvent = [...events].reverse().find((e) => {
      const custom = getCustomEvent(e);
      return custom?.name === "arnessa.stateChanged" || custom?.name === "state_changed" || e.type === 'STATE_SNAPSHOT';
    });
    if (lastStateEvent) {
      if (lastStateEvent.type === 'STATE_SNAPSHOT') {
        setState(lastStateEvent.snapshot);
      } else {
        const custom = getCustomEvent(lastStateEvent);
        setState(custom?.value?.state ?? null);
        setWritableFields(custom?.value?.writable_fields || []);
      }
    }
  }, [events]);

  const patchState = (patch: Partial<T>) => {
    return client.patch(patch);
  };

  return { state, patchState, writableFields };
};

export const useDeferredTool = (name: string) => {
  const { client, events } = useArnessa();
  if (!client) throw new Error("useDeferredTool must be used within ArnessaProvider");
  const [pending, setPending] = useState<any | null>(null);

  useEffect(() => {
    const lastDeferred = [...events].reverse().find((e) => {
      const custom = getCustomEvent(e);
      return (custom?.name === "arnessa.toolDeferred" || custom?.name === "tool_deferred") && custom?.value?.tool_name === name;
    });
    if (lastDeferred) {
      setPending(getCustomEvent(lastDeferred)?.value ?? null);
    } else {
      setPending(null);
    }
  }, [events, name]);

  const resolve = (result: any) => {
    if (pending) {
      return client.resolve(pending.call_id, result);
    }
  };

  return { pending, resolve };
};

const componentRegistry: Record<string, React.ComponentType<any>> = {};

export const registerComponent = (name: string, component: React.ComponentType<any>) => {
  componentRegistry[name] = component;
};

export const createRegistry = (components: Record<string, React.ComponentType<any>>) => {
  Object.assign(componentRegistry, components);
};

export const DynamicSlot: React.FC<{ name: string }> = ({ name }) => {
  const { events } = useArnessa();
  
  const mountedComponents = useMemo(() => {
    let components: any[] = [];
    for (const event of events) {
      const custom = getCustomEvent(event);
      if ((custom?.name === "arnessa.uiMount" || custom?.name === "ui_mount") && custom.value.slot === name) {
        if (custom.value.mode === "replace") {
          components = [custom.value];
        } else {
          components.push(custom.value);
        }
      } else if (custom?.name === "arnessa.uiUpdate" || custom?.name === "ui_update") {
        components = components.map((c) =>
          c.component_id === custom.value.component_id
            ? { ...c, props: { ...c.props, ...custom.value.props } }
            : c
        );
      } else if (custom?.name === "arnessa.uiUnmount" || custom?.name === "ui_unmount") {
        components = components.filter((c) => c.component_id !== custom.value.component_id);
      }
    }
    return components;
  }, [events, name]);

  return (
    <>
      {mountedComponents.map((c) => {
        const Component = componentRegistry[c.component];
        if (!Component) {
          console.warn(`Component ${c.component} not registered`);
          return null;
        }
        return <Component key={c.component_id} {...c.props} />;
      })}
    </>
  );
};
