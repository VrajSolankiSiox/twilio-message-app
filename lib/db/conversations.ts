import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/phone";

export interface ConversationAssignment {
  phone: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  assignedAt: Date | null;
  updatedAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  await db
    .collection<ConversationAssignment>("conversations")
    .createIndex({ phone: 1 }, { unique: true });
  indexesEnsured = true;
}

export async function getAssignment(
  phone: string
): Promise<ConversationAssignment | null> {
  await ensureIndexes();
  const db = await getDb();
  return db
    .collection<ConversationAssignment>("conversations")
    .findOne({ phone: normalizePhone(phone) });
}

export async function getAllAssignments(): Promise<ConversationAssignment[]> {
  await ensureIndexes();
  const db = await getDb();
  return db.collection<ConversationAssignment>("conversations").find({}).toArray();
}

export async function ensureConversationExists(phone: string): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  const normalized = normalizePhone(phone);

  await db.collection<ConversationAssignment>("conversations").updateOne(
    { phone: normalized },
    {
      $setOnInsert: {
        phone: normalized,
        assignedToUserId: null,
        assignedToName: null,
        assignedToEmail: null,
        assignedAt: null,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function assignConversation(
  phone: string,
  userId: string,
  userName: string,
  userEmail: string
): Promise<ConversationAssignment> {
  await ensureIndexes();
  const db = await getDb();
  const normalized = normalizePhone(phone);
  const now = new Date();

  await ensureConversationExists(normalized);

  const existing = await getAssignment(normalized);
  if (existing?.assignedToUserId) {
    return existing;
  }

  await db.collection<ConversationAssignment>("conversations").updateOne(
    { phone: normalized, assignedToUserId: null },
    {
      $set: {
        assignedToUserId: userId,
        assignedToName: userName,
        assignedToEmail: userEmail,
        assignedAt: now,
        updatedAt: now,
      },
    }
  );

  const updated = await getAssignment(normalized);
  if (!updated) {
    throw new Error("Failed to assign conversation");
  }
  return updated;
}
