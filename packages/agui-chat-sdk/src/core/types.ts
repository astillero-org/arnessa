import type { BaseEvent } from "@ag-ui/core";
import type React from "react";
import type { AttachmentDraft } from "./attachment-utils";

export type MessageItemMessage = {
  id: string;
  role: string;
  content: unknown;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
};

export type ActivityItemMessage = {
  id: string;
  role: string;
  activityType?: string;
  content: unknown;
  timestamp: number;
};

export type TimelineItem =
  | { kind: "message"; id: string; timestamp: number; order: number; message: MessageItemMessage }
  | { kind: "activity"; id: string; timestamp: number; order: number; message: ActivityItemMessage }
  | { kind: "custom"; name: string; value: unknown; timestamp: number; id: string; order: number };

export interface ChatState {
  timeline: TimelineItem[];
  runStatus: "idle" | "running" | "error";
  lastError: Error | null;
  threadId: string | null;
}

export interface ConversationSnapshot {
  id: string;
  title: string;
  threadId: string | null;
  timeline: TimelineItem[];
  updatedAt: number;
}

export type ChatListener = (state: ChatState) => void;

export type ChatEventHandler<T extends BaseEvent = BaseEvent> = (
  event: T,
  state: ChatState
) => ChatState;

export interface SendMessagePayload {
  text: string;
  attachments?: AttachmentDraft[];
}

export interface ChatLabels {
  placeholder?: string;
  attachLabel?: string;
  sendLabel?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  dragHint?: string;
  closeImageLabel?: string;
  activityDefault?: string;
  toolResultDefault?: string;
}

export interface ChatComponentOverrides {
  EmptyState?: React.ComponentType;
  MessageBubble?: React.ComponentType<{ content: unknown; role: string; timestamp?: number; className?: string }>;
  ToolResultCard?: React.ComponentType<{ content: string; toolName?: string; timestamp?: number; className?: string }>;
  ActivityIndicator?: React.ComponentType<{ label: string; timestamp?: number; className?: string }>;
  Composer?: React.ComponentType<{ className?: string }>;
}

export interface ChatRendererOverrides {
  toolResult?: React.ComponentType<{ content: string; toolName?: string }>;
  activity?: React.ComponentType<{ activityType: string; content: unknown }>;
  customEvent?: React.ComponentType<{ name: string; value: unknown; timestamp?: number }>;
}
