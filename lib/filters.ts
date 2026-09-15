import type { Conversation } from "@/lib/messages";

export interface ConversationFilters {
  showStop: boolean;
  showBlank: boolean;
}

export function isStopMessage(body: string): boolean {
  return body.trim().toLowerCase() === "stop";
}

export function hasStopReply(conversation: Conversation): boolean {
  return conversation.messages.some(
    (msg) => msg.direction === "inbound" && isStopMessage(msg.body)
  );
}

export function isBlankChat(conversation: Conversation): boolean {
  const hasInbound = conversation.messages.some(
    (msg) => msg.direction === "inbound"
  );
  const hasOutbound = conversation.messages.some(
    (msg) => msg.direction === "outbound"
  );
  return hasOutbound && !hasInbound;
}

export function applyConversationFilters(
  conversations: Conversation[],
  filters: ConversationFilters
): Conversation[] {
  return conversations.filter((conv) => {
    if (!filters.showStop && hasStopReply(conv)) return false;
    if (!filters.showBlank && isBlankChat(conv)) return false;
    return true;
  });
}
