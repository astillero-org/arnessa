'use client';

import React, { useEffect, useMemo } from 'react';
import { AgentSubscriber, RunAgentResult } from '@ag-ui/client';
import { BaseEvent, EventType, RunAgentInput } from '@ag-ui/core';
import { ChatController } from '@arnessa/react';
import { ChatProvider, FullScreenChat } from '@arnessa/react/react';

class FrameworkDomAgent {
  private subscriber?: AgentSubscriber;
  public messages: any[] = [];
  public state: any = {};

  subscribe(subscriber: AgentSubscriber) {
    this.subscriber = subscriber;
    return { unsubscribe: () => { this.subscriber = undefined; } };
  }

  async runAgent(): Promise<RunAgentResult> {
    const lastMessage = this.messages[this.messages.length - 1];
    const contentText = typeof lastMessage?.content === 'string' ? lastMessage.content : 'framework hello';

    this.emit({ type: EventType.RUN_STARTED, timestamp: Date.now() } as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    this.emit({ type: EventType.CUSTOM, name: 'thinking', value: 'Searching for answers...', timestamp: Date.now() } as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    this.emit({ type: EventType.TOOL_CALL_START, toolCallId: 'tool-1', toolCallName: 'search', timestamp: Date.now() } as any);
    this.emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: 'tool-1', content: 'result body', role: 'tool', messageId: 'tool-msg', timestamp: Date.now() } as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    this.emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'assistant-1', role: 'assistant', timestamp: Date.now() } as any);
    this.emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-1', delta: `Echo: ${contentText}`, timestamp: Date.now() } as any);
    this.emit({ type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-1', timestamp: Date.now() } as any);
    this.messages.push({ role: 'assistant', id: 'assistant-1', content: `Echo: ${contentText}` } as any);

    this.emit({ type: EventType.RUN_FINISHED, timestamp: Date.now() } as any);
    return { result: 'ok', newMessages: [] };
  }

  addMessage(message: any) {
    this.messages.push(message);
  }

  abortRun() {}

  private emit(event: BaseEvent) {
    this.subscriber?.onEvent?.({ event, messages: this.messages, state: this.state, agent: this, input: {} as RunAgentInput } as any);
  }
}

function AutoRun({ controller }: { controller: ChatController }) {
  useEffect(() => {
    void controller.sendUserMessage('framework hello');
  }, [controller]);

  return null;
}

export default function FrameworkDomPage() {
  const controller = useMemo(() => new ChatController({ agent: new FrameworkDomAgent() as any }), []);

  return (
    <ChatProvider controller={controller}>
      <AutoRun controller={controller} />
      <div className="p-8">
        <div data-testid="framework-dom-root" className="mx-auto h-[700px] max-w-4xl">
          <FullScreenChat />
        </div>
      </div>
    </ChatProvider>
  );
}
