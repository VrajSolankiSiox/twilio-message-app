import { getDb } from "@/lib/mongodb";
import type { ChatMessage } from "@/lib/messages";

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
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  await db
    .collection<StoredMessage>("messages")
    .createIndex({ sid: 1 }, { unique: true });
  await db
    .collection<StoredMessage>("messages")
    .createIndex({ dateCreated: 1 });
  indexesEnsured = true;
}

export async function saveMessage(
  message: Omit<StoredMessage, "createdAt">
): Promise<void> {
  await ensureIndexes();
  const { ensureConversationExists } = await import("@/lib/db/conversations");
  const contactPhone =
    message.direction === "inbound" ? message.from : message.to;
  await ensureConversationExists(contactPhone);

  const db = await getDb();

  await db.collection<StoredMessage>("messages").updateOne(
    { sid: message.sid },
    {
      $setOnInsert: {
        ...message,
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

  return messages.map((msg) => ({
    sid: msg.sid,
    from: msg.from,
    to: msg.to,
    body: msg.body,
    direction: msg.direction,
    status: msg.status,
    numMedia: msg.numMedia,
    dateCreated: msg.dateCreated.toISOString(),
  }));
}
