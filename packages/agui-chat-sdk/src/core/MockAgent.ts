import { AbstractAgent, AgentSubscriber, RunAgentResult } from "@ag-ui/client";
import { BaseEvent, EventType, RunAgentInput, Message } from "@ag-ui/core";
import { Observable, of } from "rxjs";
import { SDKMessage } from "./ChatStore";

export class MockAgent extends AbstractAgent {
  constructor() {
    super({ description: "Mock Agent" } as any);
    this.messages = [];
  }

  // Abstract method implementation
  run(input: RunAgentInput): Observable<BaseEvent> {
    return of({ type: EventType.RUN_STARTED } as any);
  }

  async runAgent(params: any, subscriber?: AgentSubscriber): Promise<RunAgentResult> {
    if (subscriber) this.subscribe(subscriber);

    const lastMessage = this.messages[this.messages.length - 1];
    
    this.notifySubscribers(EventType.RUN_STARTED, { type: EventType.RUN_STARTED });

    // Simulate thinking
    await new Promise(r => setTimeout(r, 500));

    this.notifySubscribers(EventType.CUSTOM, {
      type: EventType.CUSTOM,
      name: "thinking",
      value: "Searching for answers...",
      timestamp: Date.now()
    });

    await new Promise(r => setTimeout(r, 1000));

    const response: SDKMessage = {
      role: "assistant" as const,
      id: Math.random().toString(36).substring(7),
      content: `Echo: ${lastMessage?.content || "Hello!"}`,
      timestamp: Date.now()
    };

    this.messages.push(response);
    
    this.notifySubscribers(EventType.RUN_FINISHED, {
      type: EventType.RUN_FINISHED,
      timestamp: Date.now()
    });

    this.subscribers.forEach(s => s.onMessagesChanged?.({
      messages: this.messages,
      state: this.state,
      agent: this as any,
    } as any));

    return { result: "ok", newMessages: [response] };
  }

  private notifySubscribers(type: EventType, event: any) {
    const params = {
      event,
      messages: this.messages,
      state: this.state,
      agent: this,
      input: {} as any
    };

    this.subscribers.forEach(s => {
      s.onEvent?.(params);
      if (type === EventType.RUN_STARTED) s.onRunStartedEvent?.(params as any);
      if (type === EventType.RUN_FINISHED) s.onRunFinishedEvent?.(params as any);
      if (type === EventType.CUSTOM) s.onCustomEvent?.(params as any);
    });
  }

  abortRun(): void {
    console.log("Mock run aborted");
  }
}
