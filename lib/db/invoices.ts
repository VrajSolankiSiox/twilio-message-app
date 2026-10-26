import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { organizationQuery, requireOrganizationId } from "@/lib/org-context";
import type {
  InvoiceData,
  InvoiceLineItem,
  SavedInvoice,
} from "@/lib/invoice/types";

interface InvoiceDocument {
  _id: ObjectId;
  organizationId: string;
  name: string;
  data: InvoiceData;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

const TEXT_FIELDS: Array<keyof Omit<InvoiceData, "lineItems">> = [
  "invoiceDate",
  "paymentTerms",
  "servicePeriod",
  "billToName",
  "billToCompany",
  "billToAddress",
  "billToEmail",
  "vaPackage",
  "assignedResources",
  "serviceType",
  "billingFrequency",
  "paymentTermsText",
  "paymentMethod",
  "paymentInstructions",
  "notes",
];

let indexesEnsured = false;

async function invoices() {
  const db = await getDb();
  const collection = db.collection<InvoiceDocument>("invoices");
  if (!indexesEnsured) {
    await collection.createIndex({ createdByUserId: 1, updatedAt: -1 });
    indexesEnsured = true;
  }
  return collection;
}

function cleanText(value: unknown, maxLength = 2_000): string {
  if (typeof value !== "string") {
    throw new Error("Invoice contains an invalid text value");
  }
  return value.slice(0, maxLength);
}

function cleanLineItem(value: unknown): InvoiceLineItem {
  if (!value || typeof value !== "object") {
    throw new Error("Invoice contains an invalid line item");
  }
  const item = value as Record<string, unknown>;
  const qty = Number(item.qty);
  const rate = Number(item.rate);
  if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(rate) || rate < 0) {
    throw new Error("Line item quantity and rate must be valid positive numbers");
  }
  return {
    description: cleanText(item.description, 500),
    subDescription: cleanText(item.subDescription, 500),
    servicePeriod: cleanText(item.servicePeriod, 200),
    qty,
    rate,
  };
}

export function validateInvoiceData(value: unknown): InvoiceData {
  if (!value || typeof value !== "object") {
    throw new Error("Invoice data is required");
  }
  const input = value as Record<string, unknown>;
  const lineItems = Array.isArray(input.lineItems)
    ? input.lineItems.map(cleanLineItem)
    : [];
  if (lineItems.length === 0 || lineItems.length > 50) {
    throw new Error("Invoice must contain between 1 and 50 line items");
  }

  const data = {} as InvoiceData;
  for (const field of TEXT_FIELDS) {
    data[field] = cleanText(input[field]);
  }
  data.lineItems = lineItems;
  return data;
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) {
    throw new Error("Invoice name must be between 1 and 120 characters");
  }
  return name;
}

function serializeInvoice(invoice: InvoiceDocument): SavedInvoice {
  return {
    id: invoice._id.toString(),
    name: invoice.name,
    data: invoice.data,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

export async function listInvoices(): Promise<SavedInvoice[]> {
  const collection = await invoices();
  const rows = await collection
    .find(organizationQuery())
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  return rows.map(serializeInvoice);
}

export async function createInvoice(
  userId: string,
  name: unknown,
  data: unknown
): Promise<SavedInvoice> {
  const now = new Date();
  const invoice: InvoiceDocument = {
    _id: new ObjectId(),
    organizationId: requireOrganizationId(),
    name: cleanName(name),
    data: validateInvoiceData(data),
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
  const collection = await invoices();
  await collection.insertOne(invoice);
  return serializeInvoice(invoice);
}

export async function updateInvoice(
  id: string,
  userId: string,
  name: unknown,
  data: unknown
): Promise<SavedInvoice | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await invoices();
  const updated = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), ...organizationQuery() },
    {
      $set: {
        name: cleanName(name),
        data: validateInvoiceData(data),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  return updated ? serializeInvoice(updated) : null;
}

export async function deleteInvoice(
  id: string,
  userId: string
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await invoices();
  void userId;
  const result = await collection.deleteOne({
    _id: new ObjectId(id),
    ...organizationQuery(),
  });
  return result.deletedCount === 1;
}
