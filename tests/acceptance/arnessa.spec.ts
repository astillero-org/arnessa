import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { ArnessaClient, ArnessaEvent } from "@arnessa/react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function waitForEvent(events: ArnessaEvent[], kind: string, timeout: number = 25000): Promise<ArnessaEvent | undefined> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const found = events.find(e => e.kind === kind);
        if (found) return found;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return undefined;
}

describe("Arnessa Acceptance Protocol Suite", () => {
  let backend: ChildProcess;
  const endpoint = "http://127.0.0.1:8002";

  beforeAll(async () => {
    const rootPath = path.resolve(__dirname, "../../");
    
    console.log("Starting Acceptance Server...");

    backend = spawn("uv", ["run", "python3", "tests/acceptance/server.py"], {
      cwd: rootPath,
      env: { ...process.env, PYTHONPATH: "apps/backend/src", PORT: "8002" }
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
          backend.kill();
          reject(new Error("Acceptance Server failed to start in 60s"));
      }, 60000);
      
      const checkData = (data: any) => {
        const out = data.toString();
        if (out.includes("Uvicorn running on")) {
          console.log("Acceptance Server Ready.");
          clearTimeout(timeout);
          resolve(null);
        }
      };

      backend.stdout?.on("data", checkData);
      backend.stderr?.on("data", checkData);
    });
  }, 70000);

  afterAll(() => {
    if (backend) backend.kill();
  });

  const setupClient = () => {
    const client = new ArnessaClient(endpoint);
    const events: ArnessaEvent[] = [];
    client.events$.subscribe(e => {
        if (e.kind === "run_error") {
            console.error("RUN ERROR:", JSON.stringify(e.payload, null, 2));
        }
        events.push(e);
    });
    return { client, events };
  };

  it("Level 1: Simple Communication", async () => {
    const { client, events } = setupClient();

    await client.send("Say 'Arnessa is alive' and finish the test.");

    const runComplete = await waitForEvent(events, "run_complete");
    expect(runComplete).toBeDefined();
  }, 35000);

  it("Level 2: State Synchronization", async () => {
    const { client, events } = setupClient();

    await client.send("Set the count to 99 using the patch_state tool, then finish the test.");

    const stateEvent = await waitForEvent(events, "state_changed");
    expect(stateEvent).toBeDefined();
    const state = stateEvent?.payload.state;
    expect(state).toBeDefined();
    expect(state.count).toBe(99);
  }, 35000);

  it("Level 3: Dynamic UI mounting", async () => {
    const { client, events } = setupClient();

    await client.send("Mount a 'WeatherCard' in the 'sidebar' slot with temp 25, then finish.");

    const uiEvent = await waitForEvent(events, "ui_mount");
    expect(uiEvent).toBeDefined();
    expect(uiEvent?.payload.slot).toBe("sidebar");
    expect(uiEvent?.payload.component).toBe("WeatherCard");
    expect(uiEvent?.payload.props.temp).toBe(25);
  }, 35000);

  it("Level 4: Deferred Tool Call Lifecycle", async () => {
    const { client, events } = setupClient();

    await client.send("Ask me 'What is your favorite color?' using the wait_for_human tool.");

    const deferredEvent = await waitForEvent(events, "tool_deferred");
    expect(deferredEvent).toBeDefined();
    expect(deferredEvent?.payload.tool_name).toBe("wait_for_human");
    const callId = deferredEvent?.payload.call_id;

    const resumeEvents: ArnessaEvent[] = [];
    client.events$.subscribe(e => {
        resumeEvents.push(e);
    });
    
    await client.resolve(callId, "Blue is my favorite color.");

    const ack = await waitForEvent(resumeEvents, "tool_resolution_ack");
    expect(ack).toBeDefined();
    expect(ack?.payload.status).toBe("accepted");

    const runComplete = await waitForEvent(resumeEvents, "run_complete");
    expect(runComplete).toBeDefined();
  }, 70000);
});
