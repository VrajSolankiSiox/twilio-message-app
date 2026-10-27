import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import {
  ORGANIZATION_BLUE_ID,
  ORGANIZATION_GREEN_ID,
} from "@/lib/organization-ids";
import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/phone";

export { ORGANIZATION_BLUE_ID, ORGANIZATION_GREEN_ID };

export const BLUE_ADMIN_EMAIL = "sash@revenelx.com";
const BLUE_ADMIN_PASSWORD = "Sash@123";

/** Revenelx Green team (all other users default to Green until assigned elsewhere). */
export const GREEN_TEAM_EMAILS = [
  "seth@revenelx.com",
  "prince@revenelx.com",
  "alex@revenelx.com",
  "ryan@revenelx.com",
  "admin@revenelx.com",
] as const;

const DATA_MIGRATION_ID = "org_data_migration_v1";

export interface Organization {
  _id: string;
  name: string;
  slug: "green" | "blue";
  twilioFromNumber: string | null;
  createdAt: Date;
}

let dataMigrationStarted = false;

function greenFromNumber(): string | null {
  const raw = process.env.TWILIO_FROM_NUMBER?.trim();
  return raw ? normalizePhone(raw) : null;
}

function blueFromNumber(): string | null {
  const raw = process.env.TWILIO_BLUE_FROM_NUMBER?.trim();
  return raw ? normalizePhone(raw) : null;
}

/** Shared Twilio account: Blue may use Green's line until TWILIO_BLUE_FROM_NUMBER is set. */
export function defaultTwilioFromNumberForOrganization(
  organizationId: string
): string | null {
  if (organizationId === ORGANIZATION_BLUE_ID) {
    return blueFromNumber() ?? greenFromNumber();
  }
  if (organizationId === ORGANIZATION_GREEN_ID) {
    return greenFromNumber();
  }
  return greenFromNumber();
}

async function upsertOrganizations(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const orgs = db.collection<Organization>("organizations");
  const now = new Date();

  await orgs.updateOne(
    { _id: ORGANIZATION_GREEN_ID },
    {
      $set: { name: "RevenelX Green", twilioFromNumber: greenFromNumber() },
      $setOnInsert: {
        slug: "green",
        createdAt: now,
      },
    },
    { upsert: true }
  );

  await orgs.updateOne(
    { _id: ORGANIZATION_BLUE_ID },
    {
      $set: {
        name: "RevenelX Blue",
        twilioFromNumber: blueFromNumber() ?? greenFromNumber(),
      },
      $setOnInsert: {
        slug: "blue",
        createdAt: now,
      },
    },
    { upsert: true }
  );
}

async function syncTeamOrganizations(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const users = db.collection("users");
  const now = new Date();

  await users.updateMany(
    { email: { $in: [...GREEN_TEAM_EMAILS] } },
    { $set: { organizationId: ORGANIZATION_GREEN_ID } }
  );

  await users.updateMany(
    { email: BLUE_ADMIN_EMAIL },
    { $set: { organizationId: ORGANIZATION_BLUE_ID, role: "admin" } }
  );

  const sash = await users.findOne({ email: BLUE_ADMIN_EMAIL });
  if (!sash) {
    const passwordHash = await bcrypt.hash(BLUE_ADMIN_PASSWORD, 12);
    await users.insertOne({
      _id: new ObjectId(),
      email: BLUE_ADMIN_EMAIL,
      fullName: "Sash",
      passwordHash,
      role: "admin",
      organizationId: ORGANIZATION_BLUE_ID,
      createdAt: now,
    });
  }

  await users.updateMany(
    {
      email: { $nin: [BLUE_ADMIN_EMAIL, ...GREEN_TEAM_EMAILS] },
      organizationId: { $exists: false },
    },
    { $set: { organizationId: ORGANIZATION_GREEN_ID } }
  );
}

async function isDataMigrationComplete(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<boolean> {
  const meta = await db
    .collection<{ _id: string; done?: boolean }>("app_meta")
    .findOne({ _id: DATA_MIGRATION_ID });
  return Boolean(meta?.done);
}

async function runHeavyDataMigration(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  if (await isDataMigrationComplete(db)) return;

  const collections = [
    "users",
    "conversations",
    "messages",
    "campaigns",
    "invoices",
    "calls",
  ] as const;

  for (const name of collections) {
    await db.collection(name).updateMany(
      { organizationId: { $exists: false } },
      { $set: { organizationId: ORGANIZATION_GREEN_ID } }
    );
  }

  const conversations = db.collection("conversations");
  try {
    await conversations.dropIndex("phone_1");
  } catch {
    // Index may not exist or already replaced.
  }

  await conversations.createIndex({ organizationId: 1, phone: 1 });
  await conversations.createIndex({ phone: 1 });
  await db
    .collection("messages")
    .createIndex({ organizationId: 1, contactPhone: 1, dateCreated: -1 });
  await db
    .collection("campaigns")
    .createIndex({ organizationId: 1, updatedAt: -1 });
  await db
    .collection("invoices")
    .createIndex({ organizationId: 1, updatedAt: -1 });

  await db.collection<{ _id: string; done?: boolean; completedAt?: Date }>(
    "app_meta"
  ).updateOne(
    { _id: DATA_MIGRATION_ID },
    { $set: { done: true, completedAt: new Date() } },
    { upsert: true }
  );
}

/** Fast path for login and request handlers — does not scan large collections. */
export async function ensureOrganizations(): Promise<void> {
  const db = await getDb();
  await upsertOrganizations(db);
  await syncTeamOrganizations(db);
}

/** Run once after API startup; safe to wait — do not call from login. */
export function scheduleHeavyDataMigration(): void {
  if (dataMigrationStarted) return;
  dataMigrationStarted = true;
  void (async () => {
    try {
      const db = await getDb();
      await runHeavyDataMigration(db);
      console.log("Organization data migration finished.");
    } catch (error) {
      console.error("Background org data migration failed:", error);
      dataMigrationStarted = false;
    }
  })();
}

/** @deprecated Prefer ensureOrganizations; kept for existing imports. */
export async function ensureOrganizationsAndMigrate(): Promise<void> {
  await ensureOrganizations();
}

export async function getOrganizationById(
  id: string
): Promise<Organization | null> {
  await ensureOrganizations();
  const db = await getDb();
  return db.collection<Organization>("organizations").findOne({ _id: id });
}

export async function resolveOrganizationByTwilioNumber(
  to: string
): Promise<Organization | null> {
  await ensureOrganizations();
  const normalized = normalizePhone(to);
  const db = await getDb();
  const org = await db.collection<Organization>("organizations").findOne({
    twilioFromNumber: normalized,
  });
  if (org) return org;

  const green = await db.collection<Organization>("organizations").findOne({
    _id: ORGANIZATION_GREEN_ID,
  });
  if (green?.twilioFromNumber && normalized === green.twilioFromNumber) {
    return green;
  }

  const blue = await db.collection<Organization>("organizations").findOne({
    _id: ORGANIZATION_BLUE_ID,
  });
  if (blue?.twilioFromNumber && normalized === blue.twilioFromNumber) {
    return blue;
  }

  return null;
}

export async function twilioFromNumberForOrganization(
  organizationId: string
): Promise<string | null> {
  const org = await getOrganizationById(organizationId);
  if (org?.twilioFromNumber) return org.twilioFromNumber;
  return defaultTwilioFromNumberForOrganization(organizationId);
}
