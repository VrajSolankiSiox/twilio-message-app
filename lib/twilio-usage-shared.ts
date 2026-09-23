/** Client-safe types/constants for Cost UI (no Twilio SDK). */

export type UsagePeriod =
  | "today"
  | "yesterday"
  | "thisMonth"
  | "lastMonth"
  | "daily"
  | "monthly"
  | "yearly"
  | "allTime"
  | "custom";

export interface UsageRecordView {
  category: string;
  description: string;
  count: string | null;
  countUnit: string | null;
  usage: string | null;
  usageUnit: string | null;
  price: number;
  priceUnit: string;
  startDate: string;
  endDate: string;
}

export const USAGE_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All categories" },
  { value: "totalprice", label: "Total spend" },
  { value: "sms", label: "SMS (all)" },
  { value: "sms-outbound", label: "SMS outbound" },
  { value: "sms-inbound", label: "SMS inbound" },
  { value: "sms-messages-carrierfees", label: "SMS carrier fees" },
  { value: "mms", label: "MMS (all)" },
  { value: "mms-outbound", label: "MMS outbound" },
  { value: "calls", label: "Voice calls" },
  { value: "phonenumbers", label: "Phone numbers" },
  { value: "a2p-registration-fees", label: "A2P registration fees" },
];

/** Drop Twilio rows with no spend (avoids long $0 category lists). */
export function filterUsageRecordsWithSpend(
  records: UsageRecordView[]
): UsageRecordView[] {
  return records
    .filter((row) => row.price > 0.000001)
    .sort((a, b) => b.price - a.price);
}

export function formatUsagePeriodLabel(startDate: string, endDate: string): string {
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  if (!start) return "—";
  if (!end || end === start) return start;
  return `${start} → ${end}`;
}
