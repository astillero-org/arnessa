import { describe, expect, it } from 'vitest';
import { EventType } from '@ag-ui/core';
import { ChatStore } from './ChatStore';

describe('ChatStore', () => {
  it('tracks run status', () => {
    const store = new ChatStore();
    store.applyEvent({ type: EventType.RUN_STARTED, timestamp: 1 } as any);
    expect(store.getState().runStatus).toBe('running');
  });

  it('streams assistant text into one message', () => {
    const store = new ChatStore();
    store.applyEvent({ type: EventType.RUN_STARTED, timestamp: 1 } as any);
    store.applyEvent({ type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant', timestamp: 2 } as any);
    store.applyEvent({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'Hel', timestamp: 3 } as any);
    store.applyEvent({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'lo', timestamp: 4 } as any);
    store.applyEvent({ type: EventType.RUN_FINISHED, timestamp: 5 } as any);

    const state = store.getState();
    expect(state.runStatus).toBe('idle');
    expect(state.timeline).toHaveLength(1);
    expect((state.timeline[0] as any).message.content).toBe('Hello');
  });

  it('dedupes repeated custom events', () => {
    const store = new ChatStore();
    const e = { type: EventType.CUSTOM, name: 'thinking', value: 'Searching', timestamp: 10 };
    store.applyEvent(e as any);
    store.applyEvent(e as any);
    expect(store.getState().timeline).toHaveLength(1);
  });

  it('updates tool result in the same item', () => {
    const store = new ChatStore();
    store.applyEvent({ type: EventType.TOOL_CALL_START, toolCallId: 't1', toolCallName: 'search', timestamp: 1 } as any);
    store.applyEvent({ type: EventType.TOOL_CALL_RESULT, toolCallId: 't1', content: { ok: true }, timestamp: 2 } as any);

    const item = store.getState().timeline[0] as any;
    expect(item.message.toolName).toBe('search');
    expect(item.message.content).toContain('ok');
  });
});
