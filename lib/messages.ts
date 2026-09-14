import { normalizePhone } from "./phone";

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
  messages: ChatMessage[];
  lastMessage: string;
  lastMessageAt: string;
}

export function buildConversations(messages: ChatMessage[]): Conversation[] {
  const map = new Map<string, ChatMessage[]>();

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
      return {
        phone,
        messages: sorted,
        lastMessage: last.body || "(media)",
        lastMessageAt: last.dateCreated,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
}
