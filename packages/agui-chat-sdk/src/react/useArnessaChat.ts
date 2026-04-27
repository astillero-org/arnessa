import { useCallback } from "react";
import type { ChatState } from "../core/types";
import type { AttachmentDraft } from "../core/attachment-utils";
import { useArnessa, useChatActions, useChatOverrides } from "./ArnessaProvider";

export interface UseArnessaChatResult {
  /** Ordered timeline of messages, activities, and custom events. */
  timeline: ChatState["timeline"];
  status: "idle" | "running" | "error";
  threadId: string | null;
  sendMessage: (input: string | { text: string; attachments?: AttachmentDraft[] }) => Promise<unknown>;
  abort: () => void;
  /** Clears the current thread and resets to a blank conversation. */
  reset: () => void;
  labels: Record<string, string>;
}

/**
 * Primary headless hook for building custom Arnessa chat UIs.
 *
 * Returns everything needed to drive a chat without imposing any layout.
 * Pair with <MessageList /> and <ChatComposer /> or your own components.
 *
 * @example
 * function MyChat() {
 *   const { timeline, status, sendMessage, abort, reset, labels } = useArnessaChat();
 *   return (
 *     <>
 *       <MessageList />
 *       <button onClick={abort} disabled={status !== 'running'}>Stop</button>
 *       <button onClick={reset}>New chat</button>
 *       <ChatComposer />
 *     </>
 *   );
 * }
 */
export function useArnessaChat(): UseArnessaChatResult {
  const { chatState, chatStore } = useArnessa();
  const { sendMessage, abort } = useChatActions();
  const { labels } = useChatOverrides();

  const reset = useCallback(() => {
    chatStore?.clearCurrentThread();
  }, [chatStore]);

  return {
    timeline: chatState?.timeline ?? [],
    status: chatState?.runStatus ?? "idle",
    threadId: chatState?.threadId ?? null,
    sendMessage,
    abort,
    reset,
    labels,
  };
}
