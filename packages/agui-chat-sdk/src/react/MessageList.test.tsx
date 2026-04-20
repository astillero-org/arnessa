import { describe, expect, it, vi } from 'vitest';
import { EventType } from '@ag-ui/core';
import { ChatController } from '../core/ChatController';
import { ChatProvider } from './ChatProvider';
import { MessageList } from './MessageList';
import { FakeAgent } from '../test-utils/FakeAgent';
import React from 'react';
import { CustomEventRegistry } from '../core/Registry';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

async function render(ui: React.ReactElement) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(ui); });
  return { el, root, unmount: () => act(() => root.unmount()) };
}

function text(el: HTMLElement, value: string) {
  return Array.from(el.querySelectorAll('*')).some(n => n.textContent === value || n.textContent?.includes(value));
}

it('renders empty state initially', async () => {
  const controller = new ChatController({ agent: new FakeAgent() as any });
  const { el, unmount } = await render(<ChatProvider controller={controller}><MessageList /></ChatProvider>);
  expect(text(el, 'Start a conversation')).toBe(true);
  unmount();
});

describe('MessageList DOM', () => {
  it('renders streamed assistant text', async () => {
    const agent = new FakeAgent();
    const controller = new ChatController({ agent: agent as any });
    const { el, unmount } = await render(<ChatProvider controller={controller}><MessageList /></ChatProvider>);
    await act(async () => {
      agent.emit({ type: EventType.RUN_STARTED, timestamp: 1 } as any);
      agent.emit({ type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant', timestamp: 2 } as any);
      agent.emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'Hello streamed', timestamp: 3 } as any);
    });
    expect(text(el, 'Hello streamed')).toBe(true);
    unmount();
  });

  it('renders registered custom event output', async () => {
    const agent = new FakeAgent();
    const customEvents = new CustomEventRegistry();
    customEvents.register({ name: 'thinking', render: ({ value }) => <div>custom:{String(value)}</div> });
    const controller = new ChatController({ agent: agent as any, customEvents });
    const { el, unmount } = await render(<ChatProvider controller={controller}><MessageList /></ChatProvider>);
    await act(async () => { agent.emit({ type: EventType.CUSTOM, name: 'thinking', value: 'Searching', timestamp: 1 } as any); });
    expect(text(el, 'custom:Searching')).toBe(true);
    unmount();
  });

  it('renders tool cards and expanded result', async () => {
    const agent = new FakeAgent();
    const controller = new ChatController({ agent: agent as any });
    const { el, unmount } = await render(<ChatProvider controller={controller}><MessageList /></ChatProvider>);
    await act(async () => {
      agent.emit({ type: EventType.TOOL_CALL_START, toolCallId: 't1', toolCallName: 'search', timestamp: 1 } as any);
      agent.emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: 't1', content: 'result body', timestamp: 2 } as any);
    });
    const button = el.querySelector('button');
    expect(button?.textContent?.toLowerCase().includes('search')).toBe(true);
    await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(text(el, 'result body')).toBe(true);
    unmount();
  });
});
