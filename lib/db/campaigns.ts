import { ObjectId, type OptionalId } from "mongodb";
import {
  CAMPAIGN_MESSAGE_MAX,
  CAMPAIGN_NAME_MAX,
  CAMPAIGN_RECIPIENT_MAX,
  type CampaignStatus,
  type CampaignSummary,
  type RecipientStatus,
  type RecipientView,
} from "@/lib/campaigns";
import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/phone";

const STALE_SEND_MS = 20_000;
const LOCK_MS = 60_000;

export interface CampaignDocument {
  _id: ObjectId;
  name: string;
  message: string;
  status: CampaignStatus;
  createdByUserId: string;
  createdByName: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  skippedCount: number;
  sourceFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  pausedAt: Date | null;
  lastError: string | null;
  lockUntil: Date | null;
  lockToken: string | null;
}

interface CampaignRecipientDocument {
  _id: ObjectId;
  campaignId: ObjectId;
  index: number;
  phone: string;
  name: string | null;
  status: RecipientStatus;
  sid: string | null;
  error: string | null;
  attempts: number;
  updatedAt: Date;
}

export interface PreparedContact {
  phone: string;
  name: string | null;
}

export type ClaimResult =
  | { ok: true; campaign: CampaignDocument; lockToken: string }
  | {
      ok: false;
      reason: "not_found" | "paused" | "completed" | "locked";
      campaign: CampaignDocument | null;
    };

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  const campaigns = db.collection<CampaignDocument>("campaigns");
  const recipients = db.collection<CampaignRecipientDocument>("campaign_recipients");
  await campaigns.createIndex({ updatedAt: -1 });
  await campaigns.createIndex({ status: 1, lockUntil: 1 });
  await recipients.createIndex({ campaignId: 1, status: 1, index: 1 });
  await recipients.createIndex({ campaignId: 1, index: 1 }, { unique: true });
  indexesEnsured = true;
}

function campaigns() {
  return getDb().then((db) => db.collection<CampaignDocument>("campaigns"));
}

function recipients() {
  return getDb().then((db) =>
    db.collection<CampaignRecipientDocument>("campaign_recipients")
  );
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function serializeCampaign(
  campaign: CampaignDocument,
  now = new Date()
): CampaignSummary {
  return {
    id: campaign._id.toString(),
    name: campaign.name,
    message: campaign.message,
    status: campaign.status,
    total: campaign.total,
    sent: campaign.sent,
    failed: campaign.failed,
    pending: campaign.pending,
    skippedCount: campaign.skippedCount,
    sourceFileName: campaign.sourceFileName,
    createdByName: campaign.createdByName,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    startedAt: toIso(campaign.startedAt),
    completedAt: toIso(campaign.completedAt),
    lastError: campaign.lastError,
    active: Boolean(campaign.lockUntil && campaign.lockUntil > now),
  };
}

function serializeRecipient(recipient: CampaignRecipientDocument): RecipientView {
  return {
    phone: recipient.phone,
    name: recipient.name,
    status: recipient.status,
    error: recipient.error,
    updatedAt: recipient.updatedAt.toISOString(),
  };
}

function parseId(id: string): ObjectId | null {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

export function prepareContacts(
  contacts: Array<{ name?: string | null; phone?: string | null }>
): { recipients: PreparedContact[]; skipped: number } {
  const seen = new Set<string>();
  const recipients: PreparedContact[] = [];
  let skipped = 0;

  for (const contact of contacts) {
    const rawPhone = typeof contact.phone === "string" ? contact.phone.trim() : "";
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      skipped += 1;
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (seen.has(phone)) {
      skipped += 1;
      continue;
    }

    seen.add(phone);
    const name = typeof contact.name === "string" ? contact.name.trim() : "";
    recipients.push({ phone, name: name || null });
  }

  return { recipients, skipped };
}

async function countsFor(campaignId: ObjectId) {
  const col = await recipients();
  const [sent, failed, pending] = await Promise.all([
    col.countDocuments({ campaignId, status: "sent" }),
    col.countDocuments({ campaignId, status: "failed" }),
    col.countDocuments({ campaignId, status: "pending" }),
  ]);
  return { sent, failed, pending, total: sent + failed + pending };
}

export async function reconcileStaleCampaigns(): Promise<void> {
  await ensureIndexes();
  const col = await campaigns();
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_SEND_MS);
  const stale = await col
    .find({
      status: "sending",
      updatedAt: { $lt: cutoff },
      $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }],
    })
    .toArray();

  for (const campaign of stale) {
    const counts = await countsFor(campaign._id);
    if (counts.pending === 0) {
      await col.updateOne(
        { _id: campaign._id, status: "sending" },
        {
          $set: {
            ...counts,
            status: "completed",
            completedAt: now,
            updatedAt: now,
            lastError: null,
            lockUntil: null,
            lockToken: null,
          },
        }
      );
      continue;
    }

    await col.updateOne(
      { _id: campaign._id, status: "sending" },
      {
        $set: {
          ...counts,
          status: "interrupted",
          updatedAt: now,
          lockUntil: null,
          lockToken: null,
          lastError:
            campaign.lastError ||
            "Sending stopped before the campaign finished. Resume to continue with the remaining contacts.",
        },
      }
    );
  }
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  await reconcileStaleCampaigns();
  const col = await campaigns();
  const docs = await col.find({}).sort({ updatedAt: -1 }).limit(100).toArray();
  const now = new Date();
  return docs.map((doc) => serializeCampaign(doc, now));
}

export async function getCampaignDetail(id: string): Promise<{
  campaign: CampaignSummary;
  failures: RecipientView[];
  recentSends: RecipientView[];
} | null> {
  const _id = parseId(id);
  if (!_id) return null;
  await reconcileStaleCampaigns();
  const col = await campaigns();
  const doc = await col.findOne({ _id });
  if (!doc) return null;

  const recipientCol = await recipients();
  const [failedDocs, sentDocs] = await Promise.all([
    recipientCol
      .find({ campaignId: _id, status: "failed" })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray(),
    recipientCol
      .find({ campaignId: _id, status: "sent" })
      .sort({ updatedAt: -1 })
      .limit(40)
      .toArray(),
  ]);

  return {
    campaign: serializeCampaign(doc),
    failures: failedDocs.map(serializeRecipient),
    recentSends: sentDocs.map(serializeRecipient),
  };
}

export async function createCampaign(input: {
  name: string;
  message: string;
  contacts: Array<{ name?: string | null; phone?: string | null }>;
  sourceFileName: string | null;
  createdByUserId: string;
  createdByName: string;
}): Promise<{ campaign: CampaignSummary; skipped: number }> {
  const name = input.name.trim();
  const message = input.message.trim();

  if (!name || name.length > CAMPAIGN_NAME_MAX) {
    throw new Error(`Campaign name must be 1–${CAMPAIGN_NAME_MAX} characters`);
  }
  if (!message || message.length > CAMPAIGN_MESSAGE_MAX) {
    throw new Error(`Message must be 1–${CAMPAIGN_MESSAGE_MAX} characters`);
  }

  const { recipients: prepared, skipped } = prepareContacts(input.contacts);
  if (prepared.length === 0) {
    throw new Error("No valid phone numbers found. Use numbers with 10–15 digits.");
  }
  if (prepared.length > CAMPAIGN_RECIPIENT_MAX) {
    throw new Error(`A campaign can include up to ${CAMPAIGN_RECIPIENT_MAX} contacts`);
  }

  await ensureIndexes();
  const now = new Date();
  const campaignId = new ObjectId();
  const recipientCol = await recipients();
  const docs: CampaignRecipientDocument[] = prepared.map((contact, index) => ({
    _id: new ObjectId(),
    campaignId,
    index,
    phone: contact.phone,
    name: contact.name,
    status: "pending",
    sid: null,
    error: null,
    attempts: 0,
    updatedAt: now,
  }));

  const chunkSize = 1000;
  try {
    for (let i = 0; i < docs.length; i += chunkSize) {
      await recipientCol.insertMany(
        docs.slice(i, i + chunkSize) as OptionalId<CampaignRecipientDocument>[]
      );
    }
  } catch (error) {
    await recipientCol.deleteMany({ campaignId });
    throw error;
  }

  const campaign: CampaignDocument = {
    _id: campaignId,
    name,
    message,
    status: "draft",
    createdByUserId: input.createdByUserId,
    createdByName: input.createdByName,
    total: prepared.length,
    sent: 0,
    failed: 0,
    pending: prepared.length,
    skippedCount: skipped,
    sourceFileName: input.sourceFileName,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    lastError: null,
    lockUntil: null,
    lockToken: null,
  };

  try {
    const col = await campaigns();
    await col.insertOne(campaign as OptionalId<CampaignDocument>);
  } catch (error) {
    await recipientCol.deleteMany({ campaignId });
    throw error;
  }

  return { campaign: serializeCampaign(campaign), skipped };
}

export async function claimCampaignForSend(
  id: string,
  resume: boolean
): Promise<ClaimResult> {
  const _id = parseId(id);
  if (!_id) return { ok: false, reason: "not_found", campaign: null };

  await ensureIndexes();
  const col = await campaigns();
  const now = new Date();
  const statuses: CampaignStatus[] = ["draft", "sending", "interrupted"];
  if (resume) statuses.push("paused");

  const lockToken = crypto.randomUUID();
  const updated = await col.findOneAndUpdate(
    {
      _id,
      status: { $in: statuses },
      $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }],
    },
    {
      $set: {
        status: "sending",
        lockToken,
        lockUntil: new Date(now.getTime() + LOCK_MS),
        updatedAt: now,
        pausedAt: null,
        lastError: null,
      },
    },
    { returnDocument: "after" }
  );

  if (updated) {
    if (!updated.startedAt) {
      updated.startedAt = now;
      await col.updateOne({ _id }, { $set: { startedAt: now } });
    }
    return { ok: true, campaign: updated, lockToken };
  }

  const existing = await col.findOne({ _id });
  if (!existing) return { ok: false, reason: "not_found", campaign: null };
  if (existing.status === "completed") {
    return { ok: false, reason: "completed", campaign: existing };
  }
  if (existing.status === "paused") {
    return { ok: false, reason: "paused", campaign: existing };
  }
  return { ok: false, reason: "locked", campaign: existing };
}

export async function heartbeatSendLock(
  id: string,
  lockToken: string
): Promise<boolean> {
  const _id = parseId(id);
  if (!_id) return false;
  const col = await campaigns();
  const now = new Date();
  const updated = await col.findOneAndUpdate(
    { _id, lockToken, status: "sending" },
    {
      $set: {
        lockUntil: new Date(now.getTime() + LOCK_MS),
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  return Boolean(updated);
}

export async function nextPendingRecipients(
  id: string,
  limit: number
): Promise<CampaignRecipientDocument[]> {
  const _id = parseId(id);
  if (!_id) return [];
  const col = await recipients();
  return col
    .find({ campaignId: _id, status: "pending" })
    .sort({ index: 1 })
    .limit(limit)
    .toArray();
}

export async function markRecipientSent(
  recipientId: ObjectId,
  sid: string
): Promise<void> {
  const col = await recipients();
  await col.updateOne(
    { _id: recipientId },
    {
      $set: {
        status: "sent",
        sid,
        error: null,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );
}

export async function markRecipientFailed(
  recipientId: ObjectId,
  error: string
): Promise<void> {
  const col = await recipients();
  await col.updateOne(
    { _id: recipientId },
    {
      $set: {
        status: "failed",
        error,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );
}

export async function finishSendTick(
  id: string,
  lockToken: string,
  systemError: string | null
): Promise<CampaignSummary | null> {
  const _id = parseId(id);
  if (!_id) return null;
  const col = await campaigns();
  const current = await col.findOne({ _id, lockToken });
  if (!current) {
    const existing = await col.findOne({ _id });
    return existing ? serializeCampaign(existing) : null;
  }

  const counts = await countsFor(_id);
  const now = new Date();
  const releaseLock = {
    ...counts,
    updatedAt: now,
    lockUntil: null,
    lockToken: null,
  };

  if (counts.pending === 0) {
    const updated = await col.findOneAndUpdate(
      { _id, lockToken },
      {
        $set: {
          ...releaseLock,
          status: "completed",
          lastError: null,
          completedAt: now,
        },
      },
      { returnDocument: "after" }
    );
    return updated ? serializeCampaign(updated) : null;
  }

  if (systemError) {
    const interrupted = await col.findOneAndUpdate(
      { _id, lockToken, status: "sending" },
      {
        $set: {
          ...releaseLock,
          status: "interrupted",
          lastError: systemError,
        },
      },
      { returnDocument: "after" }
    );
    if (interrupted) return serializeCampaign(interrupted);
  } else {
    const continued = await col.findOneAndUpdate(
      { _id, lockToken, status: "sending" },
      {
        $set: {
          ...releaseLock,
          status: "sending",
          lastError: null,
        },
      },
      { returnDocument: "after" }
    );
    if (continued) return serializeCampaign(continued);
  }

  const kept = await col.findOneAndUpdate(
    { _id, lockToken },
    { $set: releaseLock },
    { returnDocument: "after" }
  );
  return kept ? serializeCampaign(kept) : null;
}

export async function pauseCampaign(id: string): Promise<CampaignSummary | null> {
  const _id = parseId(id);
  if (!_id) return null;
  await ensureIndexes();
  const col = await campaigns();
  const now = new Date();
  const updated = await col.findOneAndUpdate(
    { _id, status: "sending" },
    { $set: { status: "paused", pausedAt: now, updatedAt: now } },
    { returnDocument: "after" }
  );
  if (updated) return serializeCampaign(updated);
  const existing = await col.findOne({ _id });
  return existing ? serializeCampaign(existing) : null;
}

export async function interruptCampaign(
  id: string,
  lastError: string
): Promise<CampaignSummary | null> {
  const _id = parseId(id);
  if (!_id) return null;
  const col = await campaigns();
  const now = new Date();
  const updated = await col.findOneAndUpdate(
    { _id, status: "sending" },
    {
      $set: {
        status: "interrupted",
        lastError,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  if (updated) return serializeCampaign(updated);
  const existing = await col.findOne({ _id });
  return existing ? serializeCampaign(existing) : null;
}

export async function requeueFailedRecipients(id: string): Promise<{
  campaign: CampaignSummary;
  requeued: number;
} | null> {
  const _id = parseId(id);
  if (!_id) return null;
  await ensureIndexes();
  const col = await campaigns();
  const current = await col.findOne({ _id });
  if (!current) return null;
  if (current.status === "sending") {
    throw new Error("Pause the campaign before retrying failed messages");
  }

  const recipientCol = await recipients();
  const now = new Date();
  const result = await recipientCol.updateMany(
    { campaignId: _id, status: "failed" },
    {
      $set: {
        status: "pending",
        error: null,
        sid: null,
        updatedAt: now,
      },
    }
  );

  const counts = await countsFor(_id);
  const status: CampaignStatus =
    counts.pending === 0 ? "completed" : "interrupted";
  const updated = await col.findOneAndUpdate(
    { _id },
    {
      $set: {
        ...counts,
        status,
        updatedAt: now,
        lastError:
          result.modifiedCount > 0
            ? null
            : current.lastError,
        completedAt: status === "completed" ? current.completedAt ?? now : null,
      },
    },
    { returnDocument: "after" }
  );

  if (!updated) return null;
  return { campaign: serializeCampaign(updated), requeued: result.modifiedCount };
}
