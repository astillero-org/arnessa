import { BaseEvent, Message, ActivityMessage, EventType } from "@ag-ui/core";

export type SDKMessage = any; // Using any for now to avoid complex union issues with SDK-specific properties

export type TimelineItem =
  | { kind: "message"; id: string; timestamp: number; order: number; message: SDKMessage }
  | { kind: "activity"; id: string; timestamp: number; order: number; message: SDKMessage }
  | { kind: "custom"; name: string; value: unknown; timestamp: number; id: string; order: number };

export interface ChatState {
  timeline: TimelineItem[];
  runStatus: "idle" | "running" | "error";
  lastError: Error | null;
  threadId: string | null;
}

export interface ConversationSnapshot {
  id: string;
  title: string;
  threadId: string | null;
  timeline: TimelineItem[];
  updatedAt: number;
}

export type ChatListener = (state: ChatState) => void;

export type ChatEventHandler<T extends BaseEvent = any> = (
  event: T,
  state: ChatState
) => ChatState;

export class ChatStore {
  private state: ChatState = {
    timeline: [],
    runStatus: "idle",
    lastError: null,
    threadId: null,
  };

  private listeners: Set<ChatListener> = new Set();
  private handlers: Map<string, ChatEventHandler> = new Map();
  private toolNames: Map<string, string> = new Map();
  private readonly dedupeWindowMs = 10000;
  private nextOrder = 1;

  constructor() {
    this.registerDefaultHandlers();
  }

  private normalizeContentSignature(content: unknown): string {
    if (typeof content === "string") return content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  private getItemTimestamp(item: TimelineItem): number {
    return item.timestamp || ((item.kind === "message" || item.kind === "activity") ? item.message.timestamp || 0 : 0);
  }

  private getNextOrder(): number {
    const order = this.nextOrder;
    this.nextOrder += 1;
    return order;
  }

  private normalizeTimestamp(timestamp?: number): number {
    return timestamp || Date.now();
  }

  private createMessageItem(kind: "message" | "activity", message: SDKMessage, fallbackId: string, timestamp?: number): TimelineItem {
    const normalizedTimestamp = this.normalizeTimestamp(timestamp || message.timestamp);
    const id = message.id || fallbackId;
    message.id = id;
    message.timestamp = normalizedTimestamp;

    return {
      kind,
      id,
      timestamp: normalizedTimestamp,
      order: this.getNextOrder(),
      message,
    };
  }

  private createCustomItem(event: any): TimelineItem {
    return {
      kind: "custom",
      name: event.name,
      value: event.value,
      timestamp: this.normalizeTimestamp(event.timestamp),
      id: event.id || Math.random().toString(36).substring(7),
      order: this.getNextOrder(),
    };
  }

  private syncNextOrderFromTimeline(timeline: TimelineItem[]) {
    const maxOrder = timeline.reduce((max, item) => Math.max(max, item.order || 0), 0);
    this.nextOrder = maxOrder + 1;
  }

  private normalizeTimelineItems(items: TimelineItem[]): TimelineItem[] {
    const normalized = items.map((item, index) => {
      const fallbackOrder = index + 1;
      if (item.kind === "custom") {
        return {
          ...item,
          timestamp: this.normalizeTimestamp(item.timestamp),
          order: item.order || fallbackOrder,
          id: item.id || `custom-${fallbackOrder}`,
        };
      }

      const message = {
        ...item.message,
        id: item.message.id || item.id || `${item.kind}-${fallbackOrder}`,
        timestamp: this.normalizeTimestamp(item.timestamp || item.message.timestamp),
      };

      return {
        ...item,
        id: item.id || message.id,
        timestamp: this.normalizeTimestamp(item.timestamp || message.timestamp),
        order: item.order || fallbackOrder,
        message,
      };
    });

    this.syncNextOrderFromTimeline(normalized);
    return normalized.sort((a, b) => a.order - b.order);
  }

  private getItemSignature(item: TimelineItem): string {
    if (item.kind === "custom") {
      const value = item.value as any;
      return `custom:${item.name}:${value?.path || value?.data || this.normalizeContentSignature(item.value)}`;
    }

    const message = item.message as any;
    if (item.kind === "activity") {
      return `activity:${message.activityType}:${this.normalizeContentSignature(message.content)}`;
    }

    const toolKey = message.toolCallId || `${message.toolName || ""}:${this.normalizeContentSignature(message.content)}`;
    return `message:${message.role}:${toolKey}:${this.normalizeContentSignature(message.content)}`;
  }

  private dedupeTimeline(items: TimelineItem[]): TimelineItem[] {
    const seen = new Map<string, number>();
    const result: TimelineItem[] = [];

    for (const item of items) {
      const signature = this.getItemSignature(item);
      const timestamp = this.getItemTimestamp(item);
      const previousTimestamp = seen.get(signature);

      if (previousTimestamp !== undefined && Math.abs(timestamp - previousTimestamp) <= this.dedupeWindowMs) {
        continue;
      }

      seen.set(signature, timestamp);
      result.push(item);
    }

    return result;
  }

  private hasRenderableContent(content: unknown): boolean {
    if (typeof content === "string") return content.trim().length > 0;
    if (Array.isArray(content)) {
      return content.some((item: any) => {
        if (!item || typeof item !== "object") return false;
        if (item.type === "text") return Boolean(String(item.text || "").trim());
        return Boolean(item.source?.value || item.data || item.url || item.src);
      });
    }
    if (content && typeof content === "object") {
      const value = content as any;
      return Boolean(
        String(value.text || value.content || "").trim() ||
        value.data ||
        value.url ||
        value.src ||
        value.source?.value ||
        (Array.isArray(value.attachments) && value.attachments.length > 0) ||
        (Array.isArray(value.images) && value.images.length > 0)
      );
    }
    return false;
  }

  private pruneGhostMessages(items: TimelineItem[]): TimelineItem[] {
    return items.filter((item) => {
      if (item.kind !== "message") return true;
      const role = item.message.role;
      if (role !== "assistant") return true;
      return this.hasRenderableContent(item.message.content);
    });
  }

  private registerDefaultHandlers() {
    this.registerHandler(EventType.RUN_STARTED, (event, state) => ({
      ...state,
      runStatus: "running",
      lastError: null,
      threadId: state.threadId || (event as any).threadId || null,
    }));

    this.registerHandler(EventType.RUN_FINISHED, (event, state) => ({
      ...state,
      runStatus: "idle",
      timeline: this.pruneGhostMessages(state.timeline),
    }));

    this.registerHandler(EventType.RUN_ERROR, (event: any, state) => ({
      ...state,
      runStatus: "error",
      lastError: new Error(event.error || "Run failed"),
      timeline: this.pruneGhostMessages(state.timeline),
    }));

    this.registerHandler(EventType.TEXT_MESSAGE_START, (event: any, state) => {
      // Check if message already exists
      if (state.timeline.some(item => item.kind === 'message' && item.message.id === event.messageId)) {
        return state;
      }

      const newMessage: SDKMessage = {
        role: event.role || "assistant",
        content: event.content || "",
        id: event.messageId,
        timestamp: this.normalizeTimestamp(event.timestamp)
      };
      
      return {
        ...state,
        threadId: state.threadId || event.threadId || event.conversationId || null,
        timeline: [...state.timeline, this.createMessageItem("message", newMessage, event.messageId, event.timestamp)]
      };
    });

    this.registerHandler(EventType.TEXT_MESSAGE_CONTENT, (event: any, state) => {
      const exists = state.timeline.some(item => item.kind === "message" && item.message.id === event.messageId);
      const delta = event.delta || event.content || "";
      
      if (!exists) {
        // If it's pure whitespace and doesn't exist, ignore it until real content arrives
        if (!delta.trim()) return state;

        const newMessage: SDKMessage = {
          role: "assistant",
          content: delta,
          id: event.messageId,
          timestamp: this.normalizeTimestamp(event.timestamp)
        };
        return {
          ...state,
          threadId: state.threadId || event.threadId || event.conversationId || null,
          timeline: [...state.timeline, this.createMessageItem("message", newMessage, event.messageId, event.timestamp)]
        };
      }

      const newTimeline = state.timeline.map(item => {
        if (item.kind === "message" && item.message.id === event.messageId) {
          return {
            ...item,
            message: {
              ...item.message,
              timestamp: item.timestamp,
              content: (item.message.content || "") + delta
            }
          };
        }
        return item;
      });
      return { ...state, timeline: newTimeline };
    });

    this.registerHandler(EventType.TOOL_CALL_START, (event: any, state) => {
      this.toolNames.set(event.toolCallId, event.toolCallName);
      
      // Add a placeholder for the tool call
      const toolMessage: SDKMessage = {
        role: "tool",
        content: `Calling ${event.toolCallName}...`,
        id: `tool-${event.toolCallId}`,
        toolCallId: event.toolCallId,
        toolName: event.toolCallName,
        timestamp: this.normalizeTimestamp(event.timestamp)
      };
      return {
        ...state,
        timeline: [...state.timeline, this.createMessageItem("message", toolMessage, `tool-${event.toolCallId}`, event.timestamp)]
      };
    });

    this.registerHandler(EventType.TOOL_CALL_RESULT, (event: any, state) => {
      const toolName = this.toolNames.get(event.toolCallId);
      
      const newTimeline = state.timeline.map(item => {
        if (item.kind === "message" && item.message.toolCallId === event.toolCallId) {
          return {
            ...item,
            message: {
              ...item.message,
              role: "tool" as const,
              toolName: toolName || item.message.toolName,
              timestamp: item.timestamp,
              content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content, null, 2)
            }
          };
        }
        return item;
      });
      return { ...state, timeline: newTimeline };
    });

    this.registerHandler(EventType.CUSTOM, (event: any, state) => {
      const customItem = this.createCustomItem(event);

      return {
        ...state,
        timeline: this.dedupeTimeline([...state.timeline, customItem]),
      };
    });

    this.registerHandler(EventType.ACTIVITY_SNAPSHOT, (event: any, state) => {
      const activity: SDKMessage = {
        role: "activity",
        id: event.messageId,
        activityType: event.activityType,
        content: event.content,
        timestamp: this.normalizeTimestamp(event.timestamp)
      };
      
      const index = state.timeline.findIndex(i => i.kind === 'activity' && i.message.id === event.messageId);
      const newTimeline = [...state.timeline];
      if (index >= 0) {
        const existing = newTimeline[index] as Extract<TimelineItem, { kind: "activity" }>;
        newTimeline[index] = { ...existing, message: { ...activity, timestamp: existing.timestamp } };
      } else {
        newTimeline.push(this.createMessageItem("activity", activity, event.messageId, event.timestamp));
      }
      return { ...state, timeline: this.dedupeTimeline(newTimeline) };
    });
  }

  public registerHandler(type: string, handler: ChatEventHandler) {
    this.handlers.set(type, handler);
  }

  public getState(): ChatState {
    return { ...this.state };
  }

  public setThreadId(threadId: string | null) {
    this.state = { ...this.state, threadId };
    this.notify();
  }

  public resetThreadId() {
    this.setThreadId(null);
  }

  public clearCurrentThread() {
    this.state = { timeline: [], runStatus: "idle", lastError: null, threadId: null };
    this.toolNames.clear();
    this.notify();
  }

  public hydrateConversation(snapshot: Pick<ConversationSnapshot, "timeline" | "threadId">) {
    this.state = {
      ...this.state,
      timeline: this.normalizeTimelineItems([...snapshot.timeline]),
      threadId: snapshot.threadId,
      runStatus: "idle",
      lastError: null,
    };
    this.notify();
  }

  public subscribe(listener: ChatListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const currentState = { ...this.state };
    this.listeners.forEach((listener) => { listener(currentState); });
  }

  public applyEvent(event: BaseEvent) {
    const handler = this.handlers.get(event.type);
    if (handler) {
      this.state = handler(event, this.state);
      this.notify();
    }
  }

  public setTimeline(messages: SDKMessage[]) {
    const existingTimeline = [...this.state.timeline];
    const timeline = [...existingTimeline];
    const messageIndex = new Map<string, number>();

    timeline.forEach((item, index) => {
      if (item.kind === 'message' || item.kind === 'activity') {
        const message = item.message as any;
        if (message.id) messageIndex.set(`id:${message.id}`, index);
        if (message.role === 'tool' && message.toolCallId) messageIndex.set(`tool:${message.toolCallId}`, index);
      }
    });

    messages.forEach((m) => {
      const fallbackId = m.id || (m.role === 'tool' && m.toolCallId ? `tool-${m.toolCallId}` : `${m.role}-${Math.random().toString(36).slice(2, 8)}`);
      const keyById = m.id ? `id:${m.id}` : null;
      const keyByTool = m.role === 'tool' && m.toolCallId ? `tool:${m.toolCallId}` : null;
      const existingIndex = (keyById && messageIndex.has(keyById)) ? messageIndex.get(keyById)! : (keyByTool && messageIndex.has(keyByTool) ? messageIndex.get(keyByTool)! : -1);

      if (m.role === 'tool' && !m.toolName) {
        m.toolName = this.toolNames.get(m.toolCallId) || m.toolName;
      }

      if (existingIndex >= 0) {
        const existing = timeline[existingIndex] as Extract<TimelineItem, { kind: 'message' | 'activity' }>;
        const timestamp = existing.timestamp || this.normalizeTimestamp(m.timestamp);
        const mergedMessage = {
          ...existing.message,
          ...m,
          id: existing.id || m.id || fallbackId,
          timestamp,
        };
        timeline[existingIndex] = {
          ...existing,
          message: mergedMessage,
          id: mergedMessage.id,
          timestamp,
        } as TimelineItem;
        return;
      }

      const kind = m.role === 'activity' ? 'activity' : 'message';
      const newItem = this.createMessageItem(kind, { ...m }, fallbackId, m.timestamp) as Extract<TimelineItem, { kind: 'message' | 'activity' }>;
      timeline.push(newItem);
      messageIndex.set(`id:${newItem.id}`, timeline.length - 1);
      if ((newItem.message as any).role === 'tool' && (newItem.message as any).toolCallId) {
        messageIndex.set(`tool:${(newItem.message as any).toolCallId}`, timeline.length - 1);
      }
    });

    this.state = {
      ...this.state,
      timeline: this.pruneGhostMessages(this.dedupeTimeline(timeline).sort((a, b) => a.order - b.order))
    };
    this.notify();
  }
}
