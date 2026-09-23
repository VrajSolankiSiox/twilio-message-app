import { formatPhoneDisplay, normalizePhone } from "./phone";
import { isStopMessage } from "./stop";

export interface ContactConversationStats {
  phone: string;
  lastMessageAt: Date;
  lastBody: string;
  hasInbound: boolean;
  hasOutbound: boolean;
  hasStopInbound: boolean;
}

export interface ChatMessage {
  sid: string;
  from: string;
  to: string;
  body: string;
  dateCreated: string;
  direction: "inbound" | "outbound";
  status?: string;
  numMedia?: string;
}

export interface Conversation {
  phone: string;
  contactName: string | null;
  messages: ChatMessage[];
  lastMessage: string;
  lastMessageAt: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  assignedAt: string | null;
  isStop: boolean;
  isBlank: boolean;
  hasNonStopInbound?: boolean;
  isClosed: boolean;
  closedAt: string | null;
  messageCount?: number;
  hasOlderMessages?: boolean;
}

export function conversationLabel(conversation: Conversation): string {
  const name = conversation.contactName?.trim();
  return name || formatPhoneDisplay(conversation.phone);
}

export function conversationInitials(conversation: Conversation): string {
  const name = conversation.contactName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return conversation.phone.replace(/\D/g, "").slice(-2);
}

type AssignmentRow = {
  phone: string;
  contactName?: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  assignedAt: Date | null;
  closedAt?: Date | null;
  hasStopInbound?: boolean;
  hasNonStopInbound?: boolean;
};

export function buildConversationsFromStats(
  stats: ContactConversationStats[],
  assignments: AssignmentRow[]
): Conversation[] {
  const assignmentMap = new Map(
    assignments.map((a) => [normalizePhone(a.phone), a])
  );

  return stats
    .map((row) => {
      const phone = normalizePhone(row.phone);
      const assignment = assignmentMap.get(phone);
      const isStop = Boolean(
        assignment?.hasStopInbound || row.hasStopInbound
      );
      const hasNonStopInbound = Boolean(assignment?.hasNonStopInbound);
      const isBlank = row.hasOutbound && !row.hasInbound;

      return {
        phone,
        contactName: assignment?.contactName?.trim() || null,
        messages: [],
        lastMessage: row.lastBody || "(media)",
        lastMessageAt: row.lastMessageAt.toISOString(),
        assignedToUserId: assignment?.assignedToUserId ?? null,
        assignedToName: assignment?.assignedToName ?? null,
        assignedToEmail: assignment?.assignedToEmail ?? null,
        assignedAt: assignment?.assignedAt?.toISOString() ?? null,
        isStop,
        isBlank,
        hasNonStopInbound,
        isClosed: Boolean(assignment?.closedAt),
        closedAt: assignment?.closedAt?.toISOString() ?? null,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
}

export function buildConversations(
  messages: ChatMessage[],
  assignments: AssignmentRow[]
): Conversation[] {
  const map = new Map<string, ChatMessage[]>();
  const assignmentMap = new Map(
    assignments.map((a) => [normalizePhone(a.phone), a])
  );

  for (const msg of messages) {
    const contact = normalizePhone(
      msg.direction === "inbound" ? msg.from : msg.to
    );
    const existing = map.get(contact) ?? [];
    existing.push(msg);
    map.set(contact, existing);
  }

  return Array.from(map.entries())
    .map(([phone, msgs]) => {
      const sorted = msgs.sort(
        (a, b) =>
          new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()
      );
      const last = sorted[sorted.length - 1];
      const assignment = assignmentMap.get(phone);

      const conv: Conversation = {
        phone,
        contactName: assignment?.contactName?.trim() || null,
        messages: sorted,
        lastMessage: last.body || "(media)",
        lastMessageAt: last.dateCreated,
        assignedToUserId: assignment?.assignedToUserId ?? null,
        assignedToName: assignment?.assignedToName ?? null,
        assignedToEmail: assignment?.assignedToEmail ?? null,
        assignedAt: assignment?.assignedAt?.toISOString() ?? null,
        isStop:
          Boolean(assignment?.hasStopInbound) ||
          sorted.some(
            (m) => m.direction === "inbound" && isStopMessage(m.body)
          ),
        isBlank:
          sorted.some((m) => m.direction === "outbound") &&
          !sorted.some((m) => m.direction === "inbound"),
        hasNonStopInbound: Boolean(assignment?.hasNonStopInbound),
        isClosed: Boolean(assignment?.closedAt),
        closedAt: assignment?.closedAt?.toISOString() ?? null,
      };

      return conv;
    })
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
}

export function canUserViewConversation(
  conversation: Conversation,
  userId: string,
  role: "admin" | "employee"
): boolean {
  if (role === "admin") return true;
  if (!conversation.assignedToUserId) return true;
  return conversation.assignedToUserId === userId;
}

export function canUserReplyToConversation(
  conversation: Conversation,
  userId: string,
  role: "admin" | "employee"
): boolean {
  if (role === "admin") return true;
  if (!conversation.assignedToUserId) return true;
  return conversation.assignedToUserId === userId;
}
