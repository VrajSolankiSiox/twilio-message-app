import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/phone";

export interface ConversationAssignment {
  phone: string;
  contactName: string | null;
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
        contactName: null,
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

export async function upsertContactNames(
  contacts: Array<{ phone: string; name: string }>
): Promise<void> {
  await ensureIndexes();

  const ops = contacts
    .map((contact) => {
      const name = contact.name.trim();
      if (!name) return null;

      const phone = normalizePhone(contact.phone);
      const now = new Date();

      return {
        updateOne: {
          filter: { phone },
          update: {
            $set: { contactName: name, updatedAt: now },
            $setOnInsert: {
              phone,
              assignedToUserId: null,
              assignedToName: null,
              assignedToEmail: null,
              assignedAt: null,
            },
          },
          upsert: true,
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  if (ops.length === 0) return;

  const db = await getDb();
  await db.collection<ConversationAssignment>("conversations").bulkWrite(ops);
}
