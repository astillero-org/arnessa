import { AbstractAgent, RunAgentParameters } from "@ag-ui/client";
import { Message } from "@ag-ui/core";
import { ChatStore, SDKMessage } from "./ChatStore";
import { CustomEventRegistry, ActivityRendererRegistry } from "./Registry";
import { AttachmentDraft, attachmentToInputContent } from "./attachment-utils";

export interface SendMessagePayload {
  text: string;
  attachments?: AttachmentDraft[];
}

export interface ChatControllerOptions {
  agent: AbstractAgent;
  store?: ChatStore;
  customEvents?: CustomEventRegistry;
  activities?: ActivityRendererRegistry;
}

export class ChatController {
  public agent: AbstractAgent;
  public store: ChatStore;
  public customEvents: CustomEventRegistry;
  public activities: ActivityRendererRegistry;

  constructor(options: ChatControllerOptions) {
    this.agent = options.agent;
    this.store = options.store || new ChatStore();
    this.customEvents = options.customEvents || new CustomEventRegistry();
    this.activities = options.activities || new ActivityRendererRegistry();

    // Subscribe to agent events using the subscriber API
    this.agent.subscribe({
      onEvent: (params) => {
        this.store.applyEvent(params.event);
      }
    });

    // Initial hydration
    if (this.agent.messages && this.agent.messages.length > 0) {
      this.store.setTimeline(this.agent.messages as SDKMessage[]);
    }
  }

  async sendUserMessage(content: string | SendMessagePayload) {
    const text = typeof content === "string" ? content : content.text;
    const attachments = typeof content === "string" ? [] : content.attachments || [];
    const threadId = this.store.getState().threadId || Math.random().toString(36).substring(2, 10);
    if (!this.store.getState().threadId) this.store.setThreadId(threadId);
    const message: SDKMessage = {
      role: "user",
      content: attachments.length > 0 ? [
        ...(text.trim() ? [{ type: "text", text }] : []),
        ...attachments.map(attachmentToInputContent),
      ] : text,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      threadId,
    };
    
    this.agent.addMessage(message);
    this.store.setTimeline((this.agent.messages || []) as SDKMessage[]);

    return this.run();
  }

  async run(parameters?: RunAgentParameters) {
    try {
      return await this.agent.runAgent(parameters);
    } catch (error) {
      console.error("Run agent failed:", error);
      throw error;
    }
  }

  abort() {
    this.agent.abortRun();
  }

  resetConversation() {
    this.store.clearCurrentThread();
    this.agent.messages = [] as any;
  }

  hydrateConversation(snapshot: { timeline: SDKMessage[]; threadId: string | null }) {
    this.store.hydrateConversation(snapshot);
    this.agent.messages = [...snapshot.timeline] as any;
  }
}
