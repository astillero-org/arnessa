import type { Message } from "@ag-ui/core";
import type { TimelineItem } from "./types";

export function timelineItemsToMessages(timeline: TimelineItem[]): Message[] {
  return timeline
    .filter((item): item is Extract<TimelineItem, { kind: "message" }> => item.kind === "message")
    .map((item) => ({
      id: item.message.id,
      role: item.message.role,
      content: item.message.content,
    })) as unknown as Message[];
}
