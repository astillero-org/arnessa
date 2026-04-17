import { AbstractAgent, RunAgentParameters } from "@ag-ui/client";
import { ChatStore } from "./ChatStore";
import { CustomEventRegistry, ActivityRendererRegistry } from "./Registry";
import { AttachmentDraft, attachmentToInputContent } from "./attachment-utils";
import { timelineItemsToMessages } from "./serialization";
import { SendMessagePayload, ConversationSnapshot } from "./types";

export type { SendMessagePayload };

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

  private agentSubscription: { unsubscribe: () => void };

  constructor(options: ChatControllerOptions) {
    this.agent = options.agent;
    this.store = options.store || new ChatStore();
    this.customEvents = options.customEvents || new CustomEventRegistry();
    this.activities = options.activities || new ActivityRendererRegistry();

    this.agentSubscription = this.agent.subscribe({
      onEvent: (params) => {
        this.store.applyEvent(params.event);
      },
    });
  }

  async sendUserMessage(content: string | SendMessagePayload) {
    const text = typeof content === "string" ? content : content.text;
    const attachments: AttachmentDraft[] = typeof content === "string" ? [] : content.attachments || [];
    const threadId = this.store.getState().threadId || Math.random().toString(36).substring(2, 10);
    if (!this.store.getState().threadId) this.store.setThreadId(threadId);

    const msgId = Math.random().toString(36).substring(7);
    const msgContent = attachments.length > 0
      ? [
          ...(text.trim() ? [{ type: "text" as const, text }] : []),
          ...attachments.map(attachmentToInputContent),
        ]
      : text;

    const userMessage = {
      role: "user" as const,
      content: msgContent,
      id: msgId,
      timestamp: Date.now(),
    };

    this.agent.addMessage({ ...userMessage, content: userMessage.content as any });
    this.store.addUserMessage(userMessage);

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

  hydrateConversation(snapshot: Pick<ConversationSnapshot, "timeline" | "threadId">) {
    this.store.hydrateConversation(snapshot);
    this.agent.messages = timelineItemsToMessages(snapshot.timeline) as any;
  }

  dispose() {
    this.agentSubscription.unsubscribe();
  }
}
