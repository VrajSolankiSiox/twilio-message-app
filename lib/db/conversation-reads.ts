import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/phone";

interface ConversationReadDocument {
  userId: string;
  contactPhone: string;
  lastReadAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  await db
    .collection<ConversationReadDocument>("conversation_reads")
    .createIndex({ userId: 1, contactPhone: 1 }, { unique: true });
  indexesEnsured = true;
}

export async function markConversationRead(
  userId: string,
  phone: string,
  readAt: Date = new Date()
): Promise<void> {
  await ensureIndexes();
  const contactPhone = normalizePhone(phone);
  const db = await getDb();
  await db.collection<ConversationReadDocument>("conversation_reads").updateOne(
    { userId, contactPhone },
    { $set: { lastReadAt: readAt } },
    { upsert: true }
  );
}

export async function getConversationReadsForUser(
  userId: string
): Promise<Map<string, Date>> {
  await ensureIndexes();
  const db = await getDb();
  const rows = await db
    .collection<ConversationReadDocument>("conversation_reads")
    .find({ userId })
    .toArray();

  const map = new Map<string, Date>();
  for (const row of rows) {
    map.set(normalizePhone(row.contactPhone), row.lastReadAt);
  }
  return map;
}
