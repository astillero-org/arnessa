import { describe, expect, it, vi, beforeEach } from "vitest";
import { ArnessaClient } from "./ArnessaClient";

describe("ArnessaClient", () => {
  const endpoint = "http://api.test";
  let client: ArnessaClient;

  beforeEach(() => {
    client = new ArnessaClient(endpoint);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends a message and processes SSE stream", async () => {
    const mockEvents = [
      { kind: "state_changed", session_id: "s1", seq: 1, payload: { state: { x: 1 } } },
      { kind: "run_complete", session_id: "s1", seq: 2, payload: { output: "done" } },
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockEvents.forEach(e => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
        });
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as any);

    const events: any[] = [];
    client.events$.subscribe(e => events.push(e));

    await client.send("hello");

    expect(fetch).toHaveBeenCalledWith(`${endpoint}/run`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ message: "hello", session_id: undefined, deps: undefined }),
    }));

    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("state_changed");
    expect(client.currentSessionId).toBe("s1");
  });

  it("handles tool resolution", async () => {
    const mockEvents = [{ kind: "run_complete", session_id: "s1", seq: 1, payload: {} }];
    const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(mockEvents[0])}\n\n`));
          controller.close();
        },
      });

    vi.mocked(fetch).mockResolvedValue({ ok: true, body: stream } as any);
    
    // Set internal session id
    (client as any).sessionId = "s1";

    await client.resolve("call-1", { result: "ok" });

    expect(fetch).toHaveBeenCalledWith(`${endpoint}/run/s1/resolve`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ call_id: "call-1", result: { result: "ok" } }),
    }));
  });
});
