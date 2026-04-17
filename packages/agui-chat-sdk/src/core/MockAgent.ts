import { AbstractAgent, AgentSubscriber, RunAgentResult } from "@ag-ui/client";
import { BaseEvent, EventType, RunAgentInput } from "@ag-ui/core";
import { Observable, of } from "rxjs";

export class MockAgent extends AbstractAgent {
  constructor() {
    super({ description: "Mock Agent" } as any);
    this.messages = [];
  }

  run(_input: RunAgentInput): Observable<BaseEvent> {
    return of({ type: EventType.RUN_STARTED, timestamp: Date.now() } as BaseEvent);
  }

  async runAgent(_params?: unknown, subscriber?: AgentSubscriber): Promise<RunAgentResult> {
    if (subscriber) this.subscribe(subscriber);

    const lastMessage = this.messages[this.messages.length - 1];

    this.notifySubscribers(EventType.RUN_STARTED, { type: EventType.RUN_STARTED, timestamp: Date.now() });

    await new Promise(r => setTimeout(r, 500));

    this.notifySubscribers(EventType.CUSTOM, {
      type: EventType.CUSTOM,
      name: "thinking",
      value: "Searching for answers...",
      timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 1000));

    const msgId = Math.random().toString(36).substring(7);
    const contentText = typeof lastMessage?.content === "string"
      ? lastMessage.content
      : "Hello!";

    this.notifySubscribers(EventType.TEXT_MESSAGE_START, {
      type: EventType.TEXT_MESSAGE_START,
      messageId: msgId,
      role: "assistant",
      timestamp: Date.now(),
    });

    this.notifySubscribers(EventType.TEXT_MESSAGE_CONTENT, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: msgId,
      delta: `Echo: ${contentText}`,
      timestamp: Date.now(),
    });

    this.notifySubscribers(EventType.TEXT_MESSAGE_END, {
      type: EventType.TEXT_MESSAGE_END,
      messageId: msgId,
      timestamp: Date.now(),
    });

    this.messages.push({
      role: "assistant" as const,
      id: msgId,
      content: `Echo: ${contentText}`,
    } as any);

    this.notifySubscribers(EventType.RUN_FINISHED, {
      type: EventType.RUN_FINISHED,
      timestamp: Date.now(),
    });

    return { result: "ok", newMessages: [] };
  }

  private notifySubscribers(type: EventType, event: BaseEvent) {
    const params = {
      event,
      messages: this.messages,
      state: this.state,
      agent: this,
      input: {} as any,
    };

    this.subscribers.forEach(s => {
      s.onEvent?.(params);
      if (type === EventType.RUN_STARTED) s.onRunStartedEvent?.(params as any);
      if (type === EventType.RUN_FINISHED) s.onRunFinishedEvent?.(params as any);
      if (type === EventType.CUSTOM) s.onCustomEvent?.(params as any);
    });
  }

  abortRun(): void {
    // no-op for mock
  }
}
