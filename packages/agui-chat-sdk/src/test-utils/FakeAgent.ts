import { AbstractAgent, AgentSubscriber, RunAgentResult } from '@ag-ui/client';
import { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { Observable, of } from 'rxjs';

export class FakeAgent extends AbstractAgent {
  private subscriber?: AgentSubscriber;

  constructor() {
    super({ description: 'Fake Agent' } as any);
    this.messages = [];
  }

  subscribe(subscriber: AgentSubscriber) {
    this.subscriber = subscriber;
    return { unsubscribe: () => { this.subscriber = undefined; } };
  }

  emit(event: BaseEvent) {
    this.subscriber?.onEvent?.({ event, messages: this.messages, state: this.state, agent: this, input: {} as RunAgentInput } as any);
  }

  run(_input: RunAgentInput): Observable<BaseEvent> { return of({ type: 'noop' } as any); }
  async runAgent(): Promise<RunAgentResult> { return { result: 'ok', newMessages: [] }; }
  addMessage(message: any) { this.messages.push(message); }
  abortRun() {}
}
