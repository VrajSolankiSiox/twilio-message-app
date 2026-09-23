import type { Conversation } from "@/lib/messages";
import { isStopMessage } from "@/lib/stop";

export { isStopMessage };

export interface ConversationFilters {
  showStop: boolean;
  showBlank: boolean;
  showClosed: boolean;
}

export function isClosedConversation(conversation: Conversation): boolean {
  return conversation.isClosed;
}

export function hasStopReply(conversation: Conversation): boolean {
  return conversation.messages.some(
    (msg) => msg.direction === "inbound" && isStopMessage(msg.body)
  );
}

export function hasNonStopInboundReply(conversation: Conversation): boolean {
  return conversation.messages.some((msg) => {
    if (msg.direction !== "inbound") return false;
    const body = msg.body.trim();
    if (body && !isStopMessage(body)) return true;
    const mediaCount = Number(msg.numMedia ?? "0");
    return Number.isFinite(mediaCount) && mediaCount > 0;
  });
}

/** STOP filter on + contact sent STOP but also messaged with something else */
export function highlightStopWithOtherReply(
  conversation: Conversation,
  showStopFilter: boolean
): boolean {
  if (!showStopFilter) return false;
  if (!hasStopReply(conversation)) return false;
  return hasNonStopInboundReply(conversation);
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
    if (filters.showClosed) {
      return isClosedConversation(conv);
    }

    if (isClosedConversation(conv)) return false;
    if (!filters.showStop && hasStopReply(conv)) return false;
    if (!filters.showBlank && isBlankChat(conv)) return false;
    return true;
  });
}
