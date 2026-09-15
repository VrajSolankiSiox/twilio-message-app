import { getDb } from "@/lib/mongodb";

export interface StoredCall {
  sid: string;
  from: string;
  to: string;
  status: string;
  direction: string;
  message: string;
  duration?: string;
  initiatedByUserId?: string;
  initiatedByName?: string;
  dateCreated: Date;
  dateUpdated: Date;
  createdAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  await db
    .collection<StoredCall>("calls")
    .createIndex({ sid: 1 }, { unique: true });
  await db.collection<StoredCall>("calls").createIndex({ dateCreated: -1 });
  indexesEnsured = true;
}

export async function saveCall(
  call: Omit<StoredCall, "createdAt" | "dateUpdated"> & {
    dateUpdated?: Date;
  }
): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  const now = new Date();

  await db.collection<StoredCall>("calls").updateOne(
    { sid: call.sid },
    {
      $set: {
        ...call,
        dateUpdated: call.dateUpdated ?? now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );
}

export async function updateCallStatus(
  sid: string,
  status: string,
  duration?: string
): Promise<void> {
  await ensureIndexes();
  const db = await getDb();

  await db.collection<StoredCall>("calls").updateOne(
    { sid },
    {
      $set: {
        status,
        duration,
        dateUpdated: new Date(),
      },
    }
  );
}

export async function getAllCalls(): Promise<
  Array<{
    sid: string;
    from: string;
    to: string;
    status: string;
    direction: string;
    message: string;
    duration?: string;
    initiatedByName?: string;
    dateCreated: string;
  }>
> {
  await ensureIndexes();
  const db = await getDb();

  const calls = await db
    .collection<StoredCall>("calls")
    .find({})
    .sort({ dateCreated: -1 })
    .limit(100)
    .toArray();

  return calls.map((c) => ({
    sid: c.sid,
    from: c.from,
    to: c.to,
    status: c.status,
    direction: c.direction,
    message: c.message,
    duration: c.duration,
    initiatedByName: c.initiatedByName,
    dateCreated: c.dateCreated.toISOString(),
  }));
}
