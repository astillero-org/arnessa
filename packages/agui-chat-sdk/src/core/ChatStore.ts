import { BaseEvent, EventType } from "@ag-ui/core";
import {
  TimelineItem,
  ChatState,
  ConversationSnapshot,
  ChatListener,
  ChatEventHandler,
  MessageItemMessage,
  ActivityItemMessage,
} from "./types";

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

  private createMessageItem(
    kind: "message",
    message: MessageItemMessage,
    fallbackId: string,
    timestamp?: number
  ): Extract<TimelineItem, { kind: "message" }>;
  private createMessageItem(
    kind: "activity",
    message: ActivityItemMessage,
    fallbackId: string,
    timestamp?: number
  ): Extract<TimelineItem, { kind: "activity" }>;
  private createMessageItem(
    kind: "message" | "activity",
    message: MessageItemMessage | ActivityItemMessage,
    fallbackId: string,
    timestamp?: number
  ): TimelineItem {
    const normalizedTimestamp = this.normalizeTimestamp(timestamp || message.timestamp);
    const id = message.id || fallbackId;

    return {
      kind,
      id,
      timestamp: normalizedTimestamp,
      order: this.getNextOrder(),
      message: { ...message, id, timestamp: normalizedTimestamp },
    } as TimelineItem;
  }

  private createCustomItem(event: { name: string; value: unknown; timestamp?: number; id?: string }): Extract<TimelineItem, { kind: "custom" }> {
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
    }) as TimelineItem[];

    this.syncNextOrderFromTimeline(normalized);
    return normalized.sort((a, b) => a.order - b.order);
  }

  private getItemSignature(item: TimelineItem): string {
    if (item.kind === "custom") {
      const value = item.value as Record<string, unknown>;
      return `custom:${item.name}:${String(value?.path || value?.data || this.normalizeContentSignature(item.value))}`;
    }

    if (item.kind === "activity") {
      const msg = item.message;
      return `activity:${msg.activityType}:${this.normalizeContentSignature(msg.content)}`;
    }

    const msg = item.message;
    const toolKey = msg.toolCallId || `${msg.toolName || ""}:${this.normalizeContentSignature(msg.content)}`;
    return `message:${msg.role}:${toolKey}:${this.normalizeContentSignature(msg.content)}`;
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
      return content.some((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const value = item as Record<string, unknown>;
        if (value.type === "text") return Boolean(String(value.text || "").trim());
        return Boolean(value.source || value.data || value.url || value.src);
      });
    }
    if (content && typeof content === "object") {
      const value = content as Record<string, unknown>;
      return Boolean(
        String(value.text || value.content || "").trim() ||
        value.data ||
        value.url ||
        value.src ||
        (value.source as Record<string, unknown> | undefined)?.value ||
        (Array.isArray(value.attachments) && value.attachments.length > 0) ||
        (Array.isArray(value.images) && value.images.length > 0)
      );
    }
    return false;
  }

  private pruneGhostMessages(items: TimelineItem[]): TimelineItem[] {
    return items.filter((item) => {
      if (item.kind !== "message") return true;
      if (item.message.role !== "assistant") return true;
      return this.hasRenderableContent(item.message.content);
    });
  }

  private registerDefaultHandlers() {
    this.registerHandler(EventType.RUN_STARTED, (event, state) => ({
      ...state,
      runStatus: "running" as const,
      lastError: null,
      threadId: state.threadId || (event as Record<string, unknown>).threadId as string | null || null,
    }));

    this.registerHandler(EventType.RUN_FINISHED, (_event, state) => ({
      ...state,
      runStatus: "idle" as const,
      timeline: this.pruneGhostMessages(state.timeline),
    }));

    this.registerHandler(EventType.RUN_ERROR, (event, state) => ({
      ...state,
      runStatus: "error" as const,
      lastError: new Error((event as Record<string, unknown>).error as string || "Run failed"),
      timeline: this.pruneGhostMessages(state.timeline),
    }));

    this.registerHandler(EventType.TEXT_MESSAGE_START, (event, state) => {
      const e = event as Record<string, unknown>;
      if (state.timeline.some(item => item.kind === "message" && item.message.id === e.messageId)) {
        return state;
      }
      const newMessage: MessageItemMessage = {
        role: (e.role as string) || "assistant",
        content: (e.content as string) || "",
        id: e.messageId as string,
        timestamp: this.normalizeTimestamp(e.timestamp as number | undefined),
      };
      return {
        ...state,
        threadId: state.threadId || (e.threadId as string) || (e.conversationId as string) || null,
        timeline: [...state.timeline, this.createMessageItem("message", newMessage, e.messageId as string, e.timestamp as number | undefined)],
      };
    });

    this.registerHandler(EventType.TEXT_MESSAGE_CONTENT, (event, state) => {
      const e = event as Record<string, unknown>;
      const exists = state.timeline.some(item => item.kind === "message" && item.message.id === e.messageId);
      const delta = (e.delta as string) || (e.content as string) || "";

      if (!exists) {
        if (!delta.trim()) return state;
        const newMessage: MessageItemMessage = {
          role: "assistant",
          content: delta,
          id: e.messageId as string,
          timestamp: this.normalizeTimestamp(e.timestamp as number | undefined),
        };
        return {
          ...state,
          threadId: state.threadId || (e.threadId as string) || (e.conversationId as string) || null,
          timeline: [...state.timeline, this.createMessageItem("message", newMessage, e.messageId as string, e.timestamp as number | undefined)],
        };
      }

      const newTimeline = state.timeline.map(item => {
        if (item.kind === "message" && item.message.id === e.messageId) {
          return {
            ...item,
            message: {
              ...item.message,
              content: (String(item.message.content || "")) + delta,
            },
          };
        }
        return item;
      });
      return { ...state, timeline: newTimeline };
    });

    this.registerHandler(EventType.TOOL_CALL_START, (event, state) => {
      const e = event as Record<string, unknown>;
      this.toolNames.set(e.toolCallId as string, e.toolCallName as string);
      const toolMessage: MessageItemMessage = {
        role: "tool",
        content: `Calling ${e.toolCallName as string}...`,
        id: `tool-${e.toolCallId as string}`,
        toolCallId: e.toolCallId as string,
        toolName: e.toolCallName as string,
        timestamp: this.normalizeTimestamp(e.timestamp as number | undefined),
      };
      return {
        ...state,
        timeline: [...state.timeline, this.createMessageItem("message", toolMessage, `tool-${e.toolCallId as string}`, e.timestamp as number | undefined)],
      };
    });

    this.registerHandler(EventType.TOOL_CALL_RESULT, (event, state) => {
      const e = event as Record<string, unknown>;
      const toolName = this.toolNames.get(e.toolCallId as string);
      const newTimeline = state.timeline.map(item => {
        if (item.kind === "message" && item.message.toolCallId === (e.toolCallId as string)) {
          return {
            ...item,
            message: {
              ...item.message,
              toolName: toolName || item.message.toolName,
              content: typeof e.content === "string" ? e.content : JSON.stringify(e.content, null, 2),
            },
          };
        }
        return item;
      });
      return { ...state, timeline: newTimeline };
    });

    this.registerHandler(EventType.CUSTOM, (event, state) => {
      const e = event as Record<string, unknown>;
      const customItem = this.createCustomItem({
        name: e.name as string,
        value: e.value,
        timestamp: e.timestamp as number | undefined,
        id: e.id as string | undefined,
      });
      return {
        ...state,
        timeline: this.dedupeTimeline([...state.timeline, customItem]),
      };
    });

    this.registerHandler(EventType.ACTIVITY_SNAPSHOT, (event, state) => {
      const e = event as Record<string, unknown>;
      const activity: ActivityItemMessage = {
        role: "activity",
        id: e.messageId as string,
        activityType: e.activityType as string | undefined,
        content: e.content,
        timestamp: this.normalizeTimestamp(e.timestamp as number | undefined),
      };

      const index = state.timeline.findIndex(i => i.kind === "activity" && i.message.id === (e.messageId as string));
      const newTimeline = [...state.timeline];
      if (index >= 0) {
        const existing = newTimeline[index] as Extract<TimelineItem, { kind: "activity" }>;
        newTimeline[index] = { ...existing, message: { ...activity, timestamp: existing.timestamp } };
      } else {
        newTimeline.push(this.createMessageItem("activity", activity, e.messageId as string, e.timestamp as number | undefined));
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

  public addUserMessage(message: { id: string; role: string; content: unknown; timestamp: number }) {
    const item = this.createMessageItem(
      "message",
      { id: message.id, role: message.role, content: message.content, timestamp: message.timestamp },
      message.id,
      message.timestamp
    );
    this.state = { ...this.state, timeline: [...this.state.timeline, item] };
    this.notify();
  }

  public hydrateConversation(snapshot: Pick<ConversationSnapshot, "timeline" | "threadId">) {
    const normalized = this.normalizeTimelineItems([...snapshot.timeline]);
    this.state = {
      ...this.state,
      timeline: normalized,
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
}

export type { TimelineItem, ChatState, ConversationSnapshot, ChatListener, ChatEventHandler };
