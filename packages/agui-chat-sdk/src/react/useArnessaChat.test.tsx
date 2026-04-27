import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ArnessaProvider } from './ArnessaProvider';
import { MessageList } from './MessageList';
import { useArnessaChat } from './useArnessaChat';

async function render(ui: React.ReactElement) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(ui); });
  return { el, root, unmount: () => act(() => root.unmount()) };
}

function makeStream(events: object[]) {
  return new ReadableStream({
    start(controller) {
      events.forEach((e) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
      });
      controller.close();
    },
  });
}

describe('useArnessaChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('returns idle status and empty timeline on mount', async () => {
    const results: ReturnType<typeof useArnessaChat>[] = [];

    function Probe() {
      results.push(useArnessaChat());
      return null;
    }

    const { unmount } = await render(
      <ArnessaProvider endpoint="http://api.test">
        <Probe />
      </ArnessaProvider>
    );

    const last = results[results.length - 1];
    expect(last.status).toBe('idle');
    expect(last.timeline).toEqual([]);
    expect(last.threadId).toBeNull();
    expect(typeof last.sendMessage).toBe('function');
    expect(typeof last.abort).toBe('function');
    expect(typeof last.reset).toBe('function');
    expect(typeof last.labels).toBe('object');
    unmount();
  });

  it('sendMessage happy path: messages appear in timeline', async () => {
    const mockEvents = [
      { type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: 1 },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello!', timestamp: 2 },
      { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: 3 },
      { type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1', timestamp: 4 },
    ];

    vi.mocked(fetch).mockResolvedValue({ ok: true, body: makeStream(mockEvents) } as any);

    let hookResult: ReturnType<typeof useArnessaChat> | null = null;

    function Probe() {
      hookResult = useArnessaChat();
      return null;
    }

    const { unmount } = await render(
      <ArnessaProvider endpoint="http://api.test">
        <Probe />
      </ArnessaProvider>
    );

    await act(async () => {
      await hookResult!.sendMessage('hi');
      await Promise.resolve();
      await Promise.resolve();
    });

    const messages = hookResult!.timeline.filter((item) => item.kind === 'message');
    expect(messages.length).toBeGreaterThanOrEqual(1);
    const assistantMsg = messages.find((m) => m.kind === 'message' && m.message.role === 'assistant');
    expect(assistantMsg).toBeTruthy();
    unmount();
  });

  it('reset clears the thread', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: makeStream([{ type: 'RUN_FINISHED', threadId: 'thread-1' }]),
    } as any);

    let hookResult: ReturnType<typeof useArnessaChat> | null = null;

    function Probe() {
      hookResult = useArnessaChat();
      return null;
    }

    const { unmount } = await render(
      <ArnessaProvider endpoint="http://api.test">
        <Probe />
      </ArnessaProvider>
    );

    await act(async () => {
      await hookResult!.sendMessage('hello');
      await Promise.resolve();
    });

    await act(async () => {
      hookResult!.reset();
    });

    expect(hookResult!.timeline).toEqual([]);
    expect(hookResult!.threadId).toBeNull();
    unmount();
  });

  it('abort while running is callable without throwing', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => { resolve = r; });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start() { return pending; } }),
    } as any);

    let hookResult: ReturnType<typeof useArnessaChat> | null = null;

    function Probe() {
      hookResult = useArnessaChat();
      return null;
    }

    const { unmount } = await render(
      <ArnessaProvider endpoint="http://api.test">
        <Probe />
      </ArnessaProvider>
    );

    act(() => { void hookResult!.sendMessage('ping'); });

    await act(async () => {
      expect(() => hookResult!.abort()).not.toThrow();
      resolve();
    });

    unmount();
  });

  it('integration: custom layout wired through useArnessaChat + MessageList renders messages', async () => {
    const mockEvents = [
      { type: 'RUN_STARTED', threadId: 'thread-2', runId: 'run-2' },
      { type: 'TEXT_MESSAGE_START', messageId: 'm2', role: 'assistant', timestamp: 1 },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm2', delta: 'Custom layout works', timestamp: 2 },
      { type: 'TEXT_MESSAGE_END', messageId: 'm2', timestamp: 3 },
      { type: 'RUN_FINISHED', threadId: 'thread-2', runId: 'run-2', timestamp: 4 },
    ];

    vi.mocked(fetch).mockResolvedValue({ ok: true, body: makeStream(mockEvents) } as any);

    function CustomLayout() {
      const { sendMessage } = useArnessaChat();
      return (
        <div>
          <MessageList />
          <button onClick={() => sendMessage('hello custom')}>Send</button>
        </div>
      );
    }

    const { el, unmount } = await render(
      <ArnessaProvider endpoint="http://api.test">
        <CustomLayout />
      </ArnessaProvider>
    );

    const btn = el.querySelector('button');
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(el.textContent).toContain('Custom layout works');
    unmount();
  });
});
