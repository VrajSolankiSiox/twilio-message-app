import { getDb } from "@/lib/mongodb";
import type {
  ChatMessage,
  ContactConversationStats,
} from "@/lib/messages";
import { isValidPhoneNumber, normalizePhone } from "@/lib/phone";
import { isStopMessage } from "@/lib/stop";

export interface StoredMessage {
  sid: string;
  from: string;
  to: string;
  body: string;
  direction: "inbound" | "outbound";
  status?: string;
  numMedia?: string;
  mediaUrls?: string[];
  dateCreated: Date;
  createdAt: Date;
  contactPhone?: string;
  conversationId?: string;
}

let indexesEnsured = false;

function toChatMessage(msg: StoredMessage): ChatMessage {
  return {
    sid: msg.sid,
    from: msg.from,
    to: msg.to,
    body: msg.body,
    direction: msg.direction,
    status: msg.status,
    numMedia: msg.numMedia,
    dateCreated: msg.dateCreated.toISOString(),
  };
}

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  const col = db.collection<StoredMessage>("messages");
  await col.createIndex({ sid: 1 }, { unique: true });
  await col.createIndex({ dateCreated: -1 });
  await col.createIndex({ contactPhone: 1, dateCreated: -1 });
  await col.createIndex({ contactPhone: 1, dateCreated: 1 });
  indexesEnsured = true;
}

export async function updateMessageStatus(
  sid: string,
  status: string
): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  await db.collection<StoredMessage>("messages").updateOne(
    { sid },
    { $set: { status } }
  );

  const saved = await db.collection<StoredMessage>("messages").findOne(
    { sid },
    { projection: { contactPhone: 1, direction: 1 } }
  );
  if (!saved?.contactPhone) return;

  const { publishRealtime } = await import("@/lib/realtime");
  publishRealtime({
    type: "message",
    phone: saved.contactPhone,
    direction: saved.direction,
  });
}

export async function saveMessage(
  message: Omit<StoredMessage, "createdAt">
): Promise<void> {
  await ensureIndexes();
  const { ensureConversationExists } = await import("@/lib/db/conversations");
  const contactPhone = normalizePhone(
    message.direction === "inbound" ? message.from : message.to
  );
  if (!isValidPhoneNumber(contactPhone)) {
    throw new Error(
      `Invalid contact phone for message ${message.sid}: ${message.from} → ${message.to}`
    );
  }
  await ensureConversationExists(contactPhone);

  if (message.direction === "inbound") {
    const { reopenConversationIfClosed } = await import("@/lib/db/conversations");
    await reopenConversationIfClosed(contactPhone);
  }

  const db = await getDb();
  const convUpdates: Record<string, boolean> = {};
  if (message.direction === "inbound") {
    if (isStopMessage(message.body)) {
      convUpdates.hasStopInbound = true;
    } else {
      const mediaCount = Number(message.numMedia ?? "0");
      if (message.body.trim() || (Number.isFinite(mediaCount) && mediaCount > 0)) {
        convUpdates.hasNonStopInbound = true;
      }
    }
  }

  const { getConversationIdForPhone, recordMessageOnConversation } =
    await import("@/lib/db/inbox");
  const conversationId = await getConversationIdForPhone(contactPhone);

  if (Object.keys(convUpdates).length > 0) {
    await db.collection("conversations").updateOne(
      { phone: contactPhone },
      { $set: { ...convUpdates, updatedAt: new Date() } }
    );
  }

  const { contactPhone: _ignored, ...messageForInsert } = message;

  const write = await db.collection<StoredMessage>("messages").updateOne(
    { sid: message.sid },
    {
      $set: { contactPhone, conversationId },
      $setOnInsert: {
        ...messageForInsert,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  await recordMessageOnConversation(message, {
    inserted: write.upsertedCount > 0,
    conversationId,
  });

  const { publishRealtime } = await import("@/lib/realtime");
  publishRealtime({
    type: "message",
    phone: contactPhone,
    direction: message.direction,
    body: message.body,
    at: message.dateCreated.toISOString(),
  });
}

export async function getAllMessages(): Promise<ChatMessage[]> {
  await ensureIndexes();
  const db = await getDb();

  const messages = await db
    .collection<StoredMessage>("messages")
    .find({})
    .sort({ dateCreated: 1 })
    .toArray();

  return messages.map(toChatMessage);
}

export async function aggregateContactConversationStats(): Promise<
  ContactConversationStats[]
> {
  await ensureIndexes();
  const db = await getDb();

  const rows = await db
    .collection<StoredMessage>("messages")
    .aggregate<{
      _id: string;
      lastMessageAt: Date;
      lastBody: string;
      lastDirection: string;
      hasInbound: number;
      hasOutbound: number;
      hasStopInbound: number;
      messageCount: number;
    }>(
      [
      {
        $addFields: {
          contactPhone: {
            $ifNull: [
              "$contactPhone",
              {
                $cond: [
                  { $eq: ["$direction", "inbound"] },
                  "$from",
                  "$to",
                ],
              },
            ],
          },
        },
      },
      { $sort: { dateCreated: -1 } },
      {
        $group: {
          _id: "$contactPhone",
          lastMessageAt: { $first: "$dateCreated" },
          lastBody: { $first: "$body" },
          lastDirection: { $first: "$direction" },
          hasInbound: {
            $max: {
              $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0],
            },
          },
          hasOutbound: {
            $max: {
              $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0],
            },
          },
          hasStopInbound: {
            $max: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$direction", "inbound"] },
                    {
                      $regexMatch: {
                        input: {
                          $toLower: { $trim: { input: { $ifNull: ["$body", ""] } } },
                        },
                        regex:
                          "^(stop|stopall|unsubscribe|cancel|end|quit)([.!?,;:]+)?$|\\bstop\\b|\\bunsubscribe\\b|\\bcancel\\b|\\bend\\b|\\bquit\\b",
                      },
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          messageCount: { $sum: 1 },
        },
      },
    ],
    { allowDiskUse: true }
    )
    .toArray();

  return rows
    .filter((row) => isValidPhoneNumber(String(row._id ?? "")))
    .map((row) => ({
      phone: normalizePhone(row._id),
      lastMessageAt: row.lastMessageAt,
      lastBody: row.lastBody ?? "",
      lastMessageDirection:
        row.lastDirection === "inbound" || row.lastDirection === "outbound"
          ? row.lastDirection
          : "outbound",
      hasInbound: row.hasInbound === 1,
      hasOutbound: row.hasOutbound === 1,
      hasStopInbound: row.hasStopInbound === 1,
      messageCount: row.messageCount ?? 0,
    }));
}

export async function getMessagesForContact(
  phone: string,
  options: { before?: Date; limit: number }
): Promise<{
  messages: ChatMessage[];
  hasMore: boolean;
  totalCount: number;
}> {
  void ensureIndexes().catch(() => undefined);
  const db = await getDb();
  const contactPhone = normalizePhone(phone);
  const limit = Math.max(1, options.limit);

  const filter: Record<string, unknown> = { contactPhone };
  if (options.before) {
    filter.dateCreated = { $lt: options.before };
  }

  const col = db.collection<StoredMessage>("messages");
  const fetched = await col
    .find(filter)
    .sort({ dateCreated: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = fetched.length > limit;
  const slice = hasMore ? fetched.slice(0, limit) : fetched;
  const messages = slice.reverse().map(toChatMessage);

  let totalCount = messages.length;
  if (hasMore || options.before) {
    const summary = await db
      .collection<{ messageCount?: number }>("conversations")
      .findOne({ phone: contactPhone }, { projection: { messageCount: 1 } });
    totalCount = summary?.messageCount ?? messages.length;
  }

  return { messages, hasMore, totalCount };
}
