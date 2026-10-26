import {
  getOrganizationById,
  resolveOrganizationByTwilioNumber,
  type Organization,
} from "@/lib/db/organizations";
import { getDb } from "@/lib/mongodb";
import { isValidPhoneNumber, normalizePhone } from "@/lib/phone";

export const CROSS_ORG_CUSTOMER_MESSAGE =
  "This number is already associated with the other Revenelx organization (Green or Blue). Messaging is not allowed.";

/** First org with a conversation or message history for this customer owns the number globally. */
export async function findOwningOrganizationForCustomerPhone(
  phone: string
): Promise<string | null> {
  const normalized = normalizePhone(phone);
  if (!isValidPhoneNumber(normalized)) return null;

  const db = await getDb();
  const message = await db
    .collection<{ contactPhone?: string; organizationId?: string; dateCreated?: Date }>(
      "messages"
    )
    .findOne(
      { contactPhone: normalized, organizationId: { $exists: true, $type: "string" } },
      { sort: { dateCreated: 1 }, projection: { organizationId: 1 } }
    );
  return message?.organizationId ?? null;
}

/**
 * Route inbound SMS to the org that most recently messaged this customer,
 * so replies stay in the same inbox (Green vs Blue) when sharing one Twilio number.
 */
export async function resolveOrganizationForInboundSms(
  from: string,
  to: string
): Promise<Organization | null> {
  const contact = normalizePhone(from);
  if (isValidPhoneNumber(contact)) {
    const db = await getDb();
    const latest = await db
      .collection<{ contactPhone?: string; organizationId?: string }>("messages")
      .findOne(
        { contactPhone: contact, organizationId: { $exists: true, $type: "string" } },
        { sort: { dateCreated: -1 }, projection: { organizationId: 1 } }
      );
    if (latest?.organizationId) {
      const org = await getOrganizationById(latest.organizationId);
      if (org) return org;
    }
  }
  return resolveOrganizationByTwilioNumber(to);
}

export async function isCustomerBlockedForOrganization(
  phone: string,
  organizationId: string
): Promise<boolean> {
  const owner = await findOwningOrganizationForCustomerPhone(phone);
  return Boolean(owner && owner !== organizationId);
}

export async function assertCanMessageCustomer(
  phone: string,
  organizationId: string
): Promise<void> {
  if (await isCustomerBlockedForOrganization(phone, organizationId)) {
    throw new Error(CROSS_ORG_CUSTOMER_MESSAGE);
  }
}

/** Numbers already contacted by any org (outbound), for campaign de-duplication. */
export async function phonesWithGlobalOutboundHistory(
  phones: string[]
): Promise<Set<string>> {
  const normalized = [
    ...new Set(phones.map((phone) => normalizePhone(phone)).filter(Boolean)),
  ];
  if (normalized.length === 0) return new Set();

  const db = await getDb();
  const rows = await db
    .collection<{ to?: string; contactPhone?: string }>("messages")
    .find(
      {
        direction: "outbound",
        $or: [{ to: { $in: normalized } }, { contactPhone: { $in: normalized } }],
      },
      { projection: { to: 1, contactPhone: 1 } }
    )
    .toArray();

  const found = new Set<string>();
  for (const row of rows) {
    if (row.to) found.add(normalizePhone(row.to));
    if (row.contactPhone) found.add(normalizePhone(row.contactPhone));
  }
  return found;
}
