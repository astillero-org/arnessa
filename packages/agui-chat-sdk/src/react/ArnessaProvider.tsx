import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ArnessaClient, ArnessaEvent } from "../core/ArnessaClient";

interface ArnessaContextType {
  client: ArnessaClient;
  status: "idle" | "running" | "error";
  events: ArnessaEvent[];
  sessionId: string | null;
}

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
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [events, setEvents] = useState<ArnessaEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);

  useEffect(() => {
    const statusSub = client.status$.subscribe(setStatus);
    const eventSub = client.events$.subscribe((event) => {
      setEvents((prev) => [...prev, event]);
      if (!sessionId && event.session_id) {
        setSessionId(event.session_id);
      }
    });

    return () => {
      statusSub.unsubscribe();
      eventSub.unsubscribe();
    };
  }, [client, sessionId]);

  const overrides = useMemo(() => ({ labels, components, renderers }), [labels, components, renderers]);

  return (
    <ArnessaContext.Provider value={{ client, status, events, sessionId }}>
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
  const { status, events, sessionId } = useArnessa();
  return {
    timeline: events.map((e, index) => ({ 
      kind: 'custom' as const, 
      name: e.kind, 
      value: e.payload, 
      timestamp: e.timestamp, 
      id: `e-${index}`, 
      order: index 
    })),
    runStatus: status,
    lastError: null,
    threadId: sessionId,
  };
};

export const useChatActions = () => {
  const { client } = useArnessa();
  return {
    sendMessage: (payload: any) => client.send(typeof payload === "string" ? payload : payload.text),
    controller: {
      sendUserMessage: (msg: string) => client.send(msg),
      resetConversation: () => { /* TBD */ },
      hydrateConversation: (snap: any) => { /* TBD */ },
    }
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
      placeholder: 'Escribe un mensaje...',
      attachLabel: 'Adjuntar archivos',
      ...overrides.labels
    }, 
    components: overrides.components, 
    renderers: overrides.renderers 
  };
};

// New API
export const useHarness = () => {
  const { client, status, events } = useArnessa();
  const send = (message: string, deps?: any) => client.send(message, deps);
  return { send, status, messages: events };
};

export const useAgentState = <T,>() => {
  const { client, events } = useArnessa();
  const [state, setState] = useState<T | null>(null);
  const [writableFields, setWritableFields] = useState<string[]>([]);

  useEffect(() => {
    const lastStateEvent = [...events].reverse().find((e) => e.kind === "state_changed");
    if (lastStateEvent) {
      setState(lastStateEvent.payload.state);
      setWritableFields(lastStateEvent.payload.writable_fields || []);
    }
  }, [events]);

  const patchState = (patch: Partial<T>) => {
    return client.patch(patch);
  };

  return { state, patchState, writableFields };
};

export const useDeferredTool = (name: string) => {
  const { client, events } = useArnessa();
  const [pending, setPending] = useState<any | null>(null);

  useEffect(() => {
    const lastDeferred = [...events].reverse().find(
      (e) => e.kind === "tool_deferred" && e.payload.tool_name === name
    );
    if (lastDeferred) {
      setPending(lastDeferred.payload);
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
      if (event.kind === "ui_mount" && event.payload.slot === name) {
        if (event.payload.mode === "replace") {
          components = [event.payload];
        } else {
          components.push(event.payload);
        }
      } else if (event.kind === "ui_update") {
        components = components.map((c) =>
          c.component_id === event.payload.component_id
            ? { ...c, props: { ...c.props, ...event.payload.props } }
            : c
        );
      } else if (event.kind === "ui_unmount") {
        components = components.filter((c) => c.component_id !== event.payload.component_id);
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
