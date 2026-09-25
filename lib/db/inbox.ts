import type { ConversationAssignment } from "@/lib/db/conversations";
import { newConversationId } from "@/lib/db/conversations";
import type { StoredMessage } from "@/lib/db/messages";
import { getDb } from "@/lib/mongodb";
import { isValidPhoneNumber, normalizePhone } from "@/lib/phone";
import { isStopMessage } from "@/lib/stop";

const SUMMARY_VERSION = 2;

interface InboxMeta {
  _id: string;
  version: number;
  builtAt: Date;
}

async function assignMissingConversationIds(): Promise<void> {
  const db = await getDb();
  const col = db.collection<ConversationAssignment>("conversations");
  const missing = await col
    .find({ $or: [{ id: { $exists: false } }, { id: "" }] })
    .project({ _id: 1 })
    .toArray();

  if (missing.length === 0) return;

  const ops = missing.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { id: newConversationId() } },
    },
  }));

  for (let i = 0; i < ops.length; i += 500) {
    await col.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  }
}

async function readStoredInbox(): Promise<ConversationAssignment[]> {
  const db = await getDb();
  return db
    .collection<ConversationAssignment>("conversations")
    .find({ lastMessageAt: { $type: "date" } })
    .sort({ lastMessageAt: -1 })
    .toArray();
}

interface FastInboxRow {
  _id: string;
  lastMessageAt: Date;
  last?: { body?: string; direction?: string };
  hasInbound: number;
  hasOutbound: number;
  messageCount: number;
}

/** One collection pass. No global sort and no per-message regex. */
async function aggregateInboxFast(): Promise<FastInboxRow[]> {
  const db = await getDb();
  return db
    .collection("messages")
    .aggregate<FastInboxRow>(
      [
        {
          $group: {
            _id: {
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
            lastMessageAt: { $max: "$dateCreated" },
            last: {
              $top: {
                sortBy: { dateCreated: -1 },
                output: { body: "$body", direction: "$direction" },
              },
            },
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
            messageCount: { $sum: 1 },
          },
        },
      ],
      { maxTimeMS: 8000 }
    )
    .toArray();
}

function mergeFastRows(
  stats: FastInboxRow[],
  existing: ConversationAssignment[]
): ConversationAssignment[] {
  const byPhone = new Map(
    existing.map((row) => [normalizePhone(row.phone), row])
  );

  return stats.flatMap((row) => {
    const phone = normalizePhone(String(row._id ?? ""));
    if (!isValidPhoneNumber(phone) || !row.lastMessageAt) return [];
    const prev = byPhone.get(phone);
    const direction =
      row.last?.direction === "inbound" ? "inbound" : "outbound";
    return [
      {
        id: prev?.id,
        phone,
        contactName: prev?.contactName ?? null,
        assignedToUserId: prev?.assignedToUserId ?? null,
        assignedToName: prev?.assignedToName ?? null,
        assignedToEmail: prev?.assignedToEmail ?? null,
        assignedAt: prev?.assignedAt ?? null,
        closedAt: prev?.closedAt ?? null,
        closedByUserId: prev?.closedByUserId ?? null,
        closedByName: prev?.closedByName ?? null,
        hasStopInbound: prev?.hasStopInbound,
        hasNonStopInbound: prev?.hasNonStopInbound,
        updatedAt: prev?.updatedAt ?? new Date(),
        lastMessageAt: row.lastMessageAt,
        lastBody: row.last?.body ?? "",
        lastDirection: direction,
        hasInbound: row.hasInbound === 1 || Boolean(prev?.hasInbound),
        hasOutbound: row.hasOutbound === 1 || Boolean(prev?.hasOutbound),
        messageCount: row.messageCount,
      },
    ];
  });
}

async function persistInboxSummaries(
  rows: ConversationAssignment[]
): Promise<void> {
  const db = await getDb();
  const col = db.collection<ConversationAssignment>("conversations");
  const now = new Date();
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { phone: row.phone },
      update: {
        $set: {
          lastMessageAt: row.lastMessageAt,
          lastBody: row.lastBody ?? "",
          lastDirection: row.lastDirection,
          hasInbound: Boolean(row.hasInbound),
          hasOutbound: Boolean(row.hasOutbound),
          messageCount: row.messageCount ?? 0,
          updatedAt: now,
        },
        $setOnInsert: {
          id: row.id || newConversationId(),
          phone: row.phone,
          contactName: null,
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
  }));

  for (let i = 0; i < ops.length; i += 400) {
    await col.bulkWrite(ops.slice(i, i + 400), { ordered: false });
  }

  await assignMissingConversationIds();
  await db.collection<InboxMeta>("app_meta").updateOne(
    { _id: "inbox_summaries" },
    { $set: { version: SUMMARY_VERSION, builtAt: now } },
    { upsert: true }
  );
  cachedRows = null;
}

let cachedRows: ConversationAssignment[] | null = null;
let cachedLatestMessageAt = 0;
const cachedMessageSids = new Set<string>();

function stampOf(value: Date | undefined | null): number {
  return value instanceof Date ? value.getTime() : 0;
}

function rememberLatest(rows: ConversationAssignment[]): void {
  let latest = 0;
  for (const row of rows) {
    const at = stampOf(row.lastMessageAt);
    if (at > latest) latest = at;
  }
  cachedLatestMessageAt = latest;
}

/** Messages written by the Vercel webhook that this process has not listed yet. */
async function mongoHasUnlistedMessages(): Promise<boolean> {
  const db = await getDb();
  const since = new Date(Math.max(0, cachedLatestMessageAt - 10 * 60 * 1000));
  const recent = await db
    .collection<StoredMessage>("messages")
    .find({ dateCreated: { $gte: since } }, { projection: { sid: 1 } })
    .sort({ dateCreated: -1 })
    .limit(100)
    .toArray();

  if (recent.length === 0) return false;
  return recent.some((message) => message.sid && !cachedMessageSids.has(message.sid));
}

export function invalidateInboxCache(): void {
  cachedRows = null;
  cachedLatestMessageAt = 0;
  cachedMessageSids.clear();
}

export function noteCachedMessage(
  phone: string,
  message: {
    sid?: string;
    body?: string;
    direction: "inbound" | "outbound";
    dateCreated: Date;
  },
  inserted: boolean
): void {
  if (!cachedRows) return;
  const normalized = normalizePhone(phone);
  const inbound = message.direction === "inbound";
  const previous = cachedRows.find((row) => normalizePhone(row.phone) === normalized);
  const next: ConversationAssignment = {
    ...(previous ?? {
      phone: normalized,
      contactName: null,
      assignedToUserId: null,
      assignedToName: null,
      assignedToEmail: null,
      assignedAt: null,
      closedAt: inbound ? null : null,
      closedByUserId: null,
      closedByName: null,
      updatedAt: new Date(),
    }),
    lastMessageAt: message.dateCreated,
    lastBody: message.body || "",
    lastDirection: message.direction,
    hasInbound: Boolean(previous?.hasInbound) || inbound,
    hasOutbound: Boolean(previous?.hasOutbound) || !inbound,
    messageCount: (previous?.messageCount ?? 0) + (inserted ? 1 : 0),
    updatedAt: new Date(),
    ...(inbound ? { closedAt: null, closedByUserId: null, closedByName: null } : {}),
  };
  cachedRows = [
    next,
    ...cachedRows.filter((row) => normalizePhone(row.phone) !== normalized),
  ];
  const at = message.dateCreated.getTime();
  if (at > cachedLatestMessageAt) cachedLatestMessageAt = at;
  if (message.sid) cachedMessageSids.add(message.sid);
}

export function patchCachedConversation(
  phone: string,
  fields: Partial<ConversationAssignment>
): void {
  if (!cachedRows) return;
  const normalized = normalizePhone(phone);
  cachedRows = cachedRows.map((row) =>
    normalizePhone(row.phone) === normalized ? { ...row, ...fields } : row
  );
}

async function rememberRecentMessageSids(): Promise<void> {
  const db = await getDb();
  const since = new Date(Math.max(0, cachedLatestMessageAt - 10 * 60 * 1000));
  const recent = await db
    .collection<StoredMessage>("messages")
    .find({ dateCreated: { $gte: since } }, { projection: { sid: 1 } })
    .sort({ dateCreated: -1 })
    .limit(100)
    .toArray();
  cachedMessageSids.clear();
  for (const message of recent) {
    if (message.sid) cachedMessageSids.add(message.sid);
  }
}

export async function listStoredConversations(): Promise<
  ConversationAssignment[]
> {
  if (cachedRows && !(await mongoHasUnlistedMessages())) return cachedRows;
  const stored = await readStoredInbox();
  cachedRows = stored;
  rememberLatest(stored);
  await rememberRecentMessageSids();
  return stored;
}

export async function recordMessageOnConversation(
  message: Omit<StoredMessage, "createdAt">,
  options: { inserted: boolean; conversationId: string }
): Promise<void> {
  const contactPhone = normalizePhone(
    message.direction === "inbound" ? message.from : message.to
  );
  if (!isValidPhoneNumber(contactPhone)) return;

  const db = await getDb();
  const col = db.collection<ConversationAssignment>("conversations");
  const inbound = message.direction === "inbound";
  const stop = inbound && isStopMessage(message.body);
  const mediaCount = Number(message.numMedia ?? "0");
  const nonStop =
    inbound &&
    !stop &&
    (Boolean(message.body.trim()) ||
      (Number.isFinite(mediaCount) && mediaCount > 0));

  const flagSet: Record<string, boolean | Date> = {
    updatedAt: new Date(),
  };
  if (inbound) flagSet.hasInbound = true;
  else flagSet.hasOutbound = true;
  if (stop) flagSet.hasStopInbound = true;
  if (nonStop) flagSet.hasNonStopInbound = true;

  await col.updateOne(
    { phone: contactPhone },
    {
      $set: flagSet,
      ...(options.inserted ? { $inc: { messageCount: 1 } } : {}),
    }
  );

  await col.updateOne(
    {
      phone: contactPhone,
      $or: [
        { lastMessageAt: { $exists: false } },
        { lastMessageAt: { $lte: message.dateCreated } },
      ],
    },
    {
      $set: {
        id: options.conversationId,
        lastMessageAt: message.dateCreated,
        lastBody: message.body || "",
        lastDirection: message.direction,
      },
    }
  );
  noteCachedMessage(contactPhone, message, options.inserted);
}

export async function getConversationIdForPhone(
  phone: string
): Promise<string> {
  const normalized = normalizePhone(phone);
  const db = await getDb();
  const col = db.collection<ConversationAssignment>("conversations");
  const existing = await col.findOne(
    { phone: normalized },
    { projection: { id: 1 } }
  );
  if (existing?.id) return existing.id;
  const id = newConversationId();
  await col.updateOne(
    { phone: normalized },
    { $setOnInsert: { id, phone: normalized } },
    { upsert: true }
  );
  const again = await col.findOne(
    { phone: normalized },
    { projection: { id: 1 } }
  );
  return again?.id || id;
}
