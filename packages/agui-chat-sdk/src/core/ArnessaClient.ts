import { BehaviorSubject, Observable, Subject } from "rxjs";

export interface ArnessaEvent {
  type?: string;
  kind?: string;
  name?: string;
  value?: any;
  session_id?: string;
  threadId?: string;
  seq?: number;
  timestamp?: number;
  payload?: any;
  [key: string]: any;
}

const isLegacyEvent = (event: ArnessaEvent): event is ArnessaEvent & { kind: string } => typeof event.kind === "string";
const isAgUiEvent = (event: ArnessaEvent): event is ArnessaEvent & { type: string } => typeof event.type === "string";

export class ArnessaClient {
  private eventSubject = new Subject<ArnessaEvent>();
  private statusSubject = new BehaviorSubject<"idle" | "running" | "error">("idle");
  private sessionId: string | null = null;

  constructor(private endpoint: string, initialSessionId?: string) {
    this.sessionId = initialSessionId || null;
    console.log(`[ArnessaClient] Initialized with endpoint: ${this.endpoint}`);
  }

  get events$(): Observable<ArnessaEvent> {
    return this.eventSubject.asObservable();
  }

  get status$(): Observable<"idle" | "running" | "error"> {
    return this.statusSubject.asObservable();
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  async send(message: string, deps?: any) {
    console.log(`[ArnessaClient] Sending message: "${message}"`);
    this.statusSubject.next("running");
    try {
        const response = await fetch(`${this.endpoint}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            session_id: this.sessionId || undefined,
            deps,
          }),
        });

        if (!response.ok) {
          console.error(`[ArnessaClient] Send failed with status: ${response.status}`);
          this.statusSubject.next("error");
          throw new Error("Failed to start run");
        }

        console.log(`[ArnessaClient] POST /run success, starting stream processing`);
        await this.processStream(response);
    } catch (e) {
        console.error(`[ArnessaClient] Send error:`, e);
        this.statusSubject.next("error");
        throw e;
    }
  }

  async resolve(callId: string, result: any) {
    if (!this.sessionId) throw new Error("No active session");
    
    console.log(`[ArnessaClient] Resolving call ${callId}`);
    this.statusSubject.next("running");
    const response = await fetch(`${this.endpoint}/run/${this.sessionId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: callId, result }),
    });

    if (!response.ok) {
      console.error(`[ArnessaClient] Resolve failed with status: ${response.status}`);
      this.statusSubject.next("error");
      throw new Error("Failed to resolve tool");
    }

    await this.processStream(response);
  }

  async patch(patch: any) {
    if (!this.sessionId) throw new Error("No active session");

    const response = await fetch(`${this.endpoint}/run/${this.sessionId}/patch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    });

    if (!response.ok) {
      throw new Error("Failed to patch state");
    }
  }

  async reconnect(sessionId: string) {
    this.sessionId = sessionId;
    const response = await fetch(`${this.endpoint}/run/${sessionId}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to reconnect");
    }

    await this.processStream(response);
  }

  private async processStream(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) {
        console.warn("[ArnessaClient] No reader available on response body");
        return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
            console.log("[ArnessaClient] Stream reader done");
            break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || "";
        
        for (const part of parts) {
          const lines = part.split(/\r?\n/);
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith("data: ")) {
              const data = trimmedLine.slice(6).trim();
              try {
                const event: ArnessaEvent = JSON.parse(data);
                console.log(`[ArnessaClient] Received event: ${event.kind || event.type}`);
                if (!this.sessionId) {
                    this.sessionId = event.session_id || event.threadId || null;
                    if (this.sessionId) {
                      console.log(`[ArnessaClient] Set session_id to: ${this.sessionId}`);
                    }
                }
                this.eventSubject.next(event);

                if (isLegacyEvent(event) && (event.kind === "run_complete" || event.kind === "run_error")) {
                  this.statusSubject.next(event.kind === "run_complete" ? "idle" : "error");
                }
                if (isAgUiEvent(event) && (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR")) {
                  this.statusSubject.next(event.type === "RUN_FINISHED" ? "idle" : "error");
                }
              } catch (e) {
                console.error("[ArnessaClient] Failed to parse event", e, "Data:", data);
              }
            }
          }
        }
      }
    } catch (e) {
        console.error("[ArnessaClient] Stream processing error:", e);
    } finally {
      if (this.statusSubject.value === "running") {
        this.statusSubject.next("idle");
      }
      reader.releaseLock();
    }
  }
}
