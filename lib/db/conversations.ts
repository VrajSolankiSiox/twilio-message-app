import { randomUUID } from "crypto";
import { getDb } from "@/lib/mongodb";
import { organizationQuery, requireOrganizationId } from "@/lib/org-context";
import { isValidPhoneNumber, normalizePhone } from "@/lib/phone";

export interface ConversationAssignment {
  organizationId?: string;
  /** Stable chat id (not the phone number). */
  id?: string;
  phone: string;
  contactName: string | null;
  lastMessageAt?: Date;
  lastBody?: string;
  lastDirection?: "inbound" | "outbound";
  hasInbound?: boolean;
  hasOutbound?: boolean;
  messageCount?: number;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  assignedAt: Date | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  closedByName: string | null;
  hasStopInbound?: boolean;
  hasNonStopInbound?: boolean;
  originatingCampaignId?: string | null;
  originatingCampaignName?: string | null;
  updatedAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  const col = db.collection<ConversationAssignment>("conversations");
  await col.createIndex({ organizationId: 1, phone: 1 });
  await col.createIndex({ phone: 1 });
  await col.createIndex({ id: 1 }, { unique: true, sparse: true });
  await col.createIndex({ organizationId: 1, lastMessageAt: -1 });
  indexesEnsured = true;
}

function conversationFilter(phone: string) {
  return { ...organizationQuery(), phone: normalizePhone(phone) };
}

export async function ensureConversationIndexes(): Promise<void> {
  await ensureIndexes();
}

export function newConversationId(): string {
  return randomUUID();
}

export async function getAssignment(
  phone: string
): Promise<ConversationAssignment | null> {
  const db = await getDb();
  return db
    .collection<ConversationAssignment>("conversations")
    .findOne(conversationFilter(phone));
}

export async function getAllAssignments(): Promise<ConversationAssignment[]> {
  await ensureIndexes();
  const db = await getDb();
  return db
    .collection<ConversationAssignment>("conversations")
    .find(organizationQuery())
    .toArray();
}

export async function ensureConversationExists(phone: string): Promise<void> {
  await ensureIndexes();
  const normalized = normalizePhone(phone);
  if (!isValidPhoneNumber(normalized)) return;

  const db = await getDb();

  const organizationId = requireOrganizationId();
  await db.collection<ConversationAssignment>("conversations").updateOne(
    { organizationId, phone: normalized },
    {
      $setOnInsert: {
        organizationId,
        id: newConversationId(),
        phone: normalized,
        contactName: null,
        assignedToUserId: null,
        assignedToName: null,
        assignedToEmail: null,
        assignedAt: null,
        closedAt: null,
        closedByUserId: null,
        closedByName: null,
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
    { ...conversationFilter(normalized), assignedToUserId: null },
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

export async function setConversationAssignee(
  phone: string,
  assignee: { userId: string; fullName: string; email: string } | null
): Promise<ConversationAssignment> {
  await ensureIndexes();
  const normalized = normalizePhone(phone);
  const now = new Date();

  await ensureConversationExists(normalized);
  const db = await getDb();

  const assignmentFields = assignee
    ? {
        assignedToUserId: assignee.userId,
        assignedToName: assignee.fullName,
        assignedToEmail: assignee.email,
        assignedAt: now,
        updatedAt: now,
      }
    : {
        assignedToUserId: null,
        assignedToName: null,
        assignedToEmail: null,
        assignedAt: null,
        updatedAt: now,
      };

  await db
    .collection<ConversationAssignment>("conversations")
    .updateOne(conversationFilter(normalized), { $set: assignmentFields });

  const updated = await getAssignment(normalized);
  if (!updated) {
    throw new Error("Failed to update assignment");
  }
  return updated;
}

export async function setConversationClosed(
  phone: string,
  closed: boolean,
  closedBy?: { userId: string; fullName: string },
  viewer?: { userId: string; role: string }
): Promise<ConversationAssignment | null> {
  const normalized = normalizePhone(phone);
  const now = new Date();
  const db = await getDb();

  const fields = closed
    ? {
        closedAt: now,
        closedByUserId: closedBy?.userId ?? null,
        closedByName: closedBy?.fullName ?? null,
        updatedAt: now,
      }
    : {
        closedAt: null,
        closedByUserId: null,
        closedByName: null,
        updatedAt: now,
      };

  const col = db.collection<ConversationAssignment>("conversations");
  const existing = await col.findOne(conversationFilter(normalized));
  if (!existing) return null;

  if (viewer && viewer.role !== "admin") {
    const owner = existing.assignedToUserId;
    if (owner && owner !== viewer.userId) return null;
  }

  const result = await col.updateOne({ _id: existing._id }, { $set: fields });
  if (result.matchedCount !== 1) return null;
  return { ...existing, ...fields };
}

export async function stampOriginatingCampaign(
  phone: string,
  campaignId: string,
  campaignName: string
): Promise<void> {
  await ensureIndexes();
  const normalized = normalizePhone(phone);
  if (!isValidPhoneNumber(normalized)) return;
  const id = campaignId.trim();
  const name = campaignName.trim();
  if (!id || !name) return;

  await ensureConversationExists(normalized);
  const db = await getDb();
  await db.collection<ConversationAssignment>("conversations").updateOne(
    {
      ...conversationFilter(normalized),
      $or: [
        { originatingCampaignId: { $exists: false } },
        { originatingCampaignId: null },
        { originatingCampaignId: "" },
      ],
    },
    {
      $set: {
        originatingCampaignId: id,
        originatingCampaignName: name,
        updatedAt: new Date(),
      },
    }
  );
}

export async function reopenConversationIfClosed(phone: string): Promise<void> {
  await ensureIndexes();
  const normalized = normalizePhone(phone);
  const db = await getDb();
  const now = new Date();

  await db.collection<ConversationAssignment>("conversations").updateOne(
    { ...conversationFilter(normalized), closedAt: { $ne: null } },
    {
      $set: {
        closedAt: null,
        closedByUserId: null,
        closedByName: null,
        updatedAt: now,
      },
    }
  );
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
      if (!isValidPhoneNumber(phone)) return null;

      const now = new Date();

      const organizationId = requireOrganizationId();
      return {
        updateOne: {
          filter: { organizationId, phone },
          update: {
            $set: { contactName: name, updatedAt: now },
            $setOnInsert: {
              organizationId,
              id: newConversationId(),
              phone,
              assignedToUserId: null,
              assignedToName: null,
              assignedToEmail: null,
              assignedAt: null,
              closedAt: null,
              closedByUserId: null,
              closedByName: null,
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
