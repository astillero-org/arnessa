import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ArnessaProvider } from './ArnessaProvider';
import { FullScreenChat } from './FullScreenChat';

async function render(ui: React.ReactElement) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(ui); });
  return { el, root, unmount: () => act(() => root.unmount()) };
}

describe('ArnessaProvider framework DOM', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders user, custom, tool, and assistant DOM from AG-UI stream', async () => {
    const mockEvents = [
      { type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
      { type: 'CUSTOM', name: 'thinking', value: 'Searching for answers…', timestamp: 1 },
      { type: 'TOOL_CALL_START', toolCallId: 't1', toolCallName: 'search', timestamp: 2 },
      { type: 'TOOL_CALL_RESULT', toolCallId: 't1', content: 'result body', role: 'tool', messageId: 'tool-1', timestamp: 3 },
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: 4 },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: '**Assistant** final answer', timestamp: 5 },
      { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: 6 },
      { type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1', timestamp: 7 },
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockEvents.forEach((event) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        });
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({ ok: true, body: stream } as any);

    const { el, unmount } = await render(
      <ArnessaProvider endpoint="http://api.test">
        <FullScreenChat />
      </ArnessaProvider>
    );

    const textarea = el.querySelector('textarea');
    expect(textarea).toBeTruthy();

    await act(async () => {
      textarea!.dispatchEvent(new Event('focus', { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'hello framework');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = el.querySelector('form');
    expect(form).toBeTruthy();

    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const bubbles = Array.from(el.querySelectorAll('.arn-chat-message-bubble'));
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]?.textContent).toContain('hello framework');
    expect(bubbles[0]?.className).toContain('justify-start');
    expect(bubbles[1]?.textContent).toContain('Assistant final answer');
    expect(bubbles[1]?.className).toContain('justify-end');
    expect(el.querySelector('strong')?.textContent).toBe('Assistant');

    expect(el.textContent).toContain('thinking');
    expect(el.textContent).toContain('Searching for answers');

    const toolButton = Array.from(el.querySelectorAll('button')).find((button) => button.textContent?.toLowerCase().includes('search'));
    expect(toolButton).toBeTruthy();

    await act(async () => {
      toolButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(el.textContent).toContain('result body');
    unmount();
  });
});
