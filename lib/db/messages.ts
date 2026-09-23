import { getDb } from "@/lib/mongodb";
import type {
  ChatMessage,
  ContactConversationStats,
} from "@/lib/messages";
import { normalizePhone } from "@/lib/phone";
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
}

export async function saveMessage(
  message: Omit<StoredMessage, "createdAt">
): Promise<void> {
  await ensureIndexes();
  const { ensureConversationExists } = await import("@/lib/db/conversations");
  const contactPhone = normalizePhone(
    message.direction === "inbound" ? message.from : message.to
  );
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

  if (Object.keys(convUpdates).length > 0) {
    await db.collection("conversations").updateOne(
      { phone: contactPhone },
      { $set: { ...convUpdates, updatedAt: new Date() } }
    );
  }

  await db.collection<StoredMessage>("messages").updateOne(
    { sid: message.sid },
    {
      $set: { contactPhone },
      $setOnInsert: {
        ...message,
        contactPhone,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
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
      hasInbound: number;
      hasOutbound: number;
      hasStopInbound: number;
    }>([
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
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    phone: normalizePhone(row._id),
    lastMessageAt: row.lastMessageAt,
    lastBody: row.lastBody ?? "",
    hasInbound: row.hasInbound === 1,
    hasOutbound: row.hasOutbound === 1,
    hasStopInbound: row.hasStopInbound === 1,
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
  await ensureIndexes();
  const db = await getDb();
  const contactPhone = normalizePhone(phone);
  const limit = Math.max(1, options.limit);

  const contactFilter = {
    $or: [
      { contactPhone },
      {
        contactPhone: { $exists: false },
        direction: "inbound" as const,
        from: contactPhone,
      },
      {
        contactPhone: { $exists: false },
        direction: "outbound" as const,
        to: contactPhone,
      },
    ],
  };

  const filter = options.before
    ? { ...contactFilter, dateCreated: { $lt: options.before } }
    : contactFilter;

  const totalCount = await db
    .collection<StoredMessage>("messages")
    .countDocuments(contactFilter);

  const fetched = await db
    .collection<StoredMessage>("messages")
    .find(filter)
    .sort({ dateCreated: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = fetched.length > limit;
  const slice = hasMore ? fetched.slice(0, limit) : fetched;
  const messages = slice.reverse().map(toChatMessage);

  return { messages, hasMore, totalCount };
}
