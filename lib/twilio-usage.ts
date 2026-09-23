import "server-only";

import { getTwilioClient } from "@/lib/twilio-client";
import type { UsagePeriod, UsageRecordView } from "@/lib/twilio-usage-shared";

export type { UsagePeriod, UsageRecordView } from "@/lib/twilio-usage-shared";
export { USAGE_CATEGORY_OPTIONS } from "@/lib/twilio-usage-shared";

type TwilioUsageListParams = {
  category?: string;
  startDate?: Date;
  endDate?: Date;
};

/** Fields we read from Twilio usage record instances (all period list APIs return the same shape). */
interface TwilioUsageRecordRow {
  category: string;
  description: string;
  count: string | null;
  countUnit: string | null;
  usage: string | null;
  usageUnit: string | null;
  price: string | number | null;
  priceUnit: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
}

function formatUsageDate(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

async function listUsageRecordsForPeriod(
  period: UsagePeriod,
  params: TwilioUsageListParams
): Promise<TwilioUsageRecordRow[]> {
  const client = getTwilioClient();
  const { usage } = client;

  switch (period) {
    case "today":
      return usage.records.today.list(params);
    case "yesterday":
      return usage.records.yesterday.list(params);
    case "thisMonth":
      return usage.records.thisMonth.list(params);
    case "lastMonth":
      return usage.records.lastMonth.list(params);
    case "daily":
      return usage.records.daily.list(params);
    case "monthly":
      return usage.records.monthly.list(params);
    case "yearly":
      return usage.records.yearly.list(params);
    case "allTime":
      return usage.records.allTime.list(params);
    case "custom":
      return usage.records.list(params);
    default:
      return usage.records.list(params);
  }
}

export async function fetchTwilioUsageRecords(options: {
  period: UsagePeriod;
  category?: string;
  startDate?: string;
  endDate?: string;
}): Promise<UsageRecordView[]> {
  const params: TwilioUsageListParams = {};

  if (options.category) {
    params.category = options.category;
  }

  if (
    options.period === "custom" ||
    options.period === "daily" ||
    options.period === "monthly"
  ) {
    if (options.startDate) params.startDate = new Date(options.startDate);
    if (options.endDate) params.endDate = new Date(options.endDate);
  }

  const records = await listUsageRecordsForPeriod(options.period, params);

  return records.map((record: TwilioUsageRecordRow) => ({
    category: record.category,
    description: record.description,
    count: record.count,
    countUnit: record.countUnit,
    usage: record.usage,
    usageUnit: record.usageUnit,
    price: Math.abs(Number.parseFloat(String(record.price ?? 0)) || 0),
    priceUnit: record.priceUnit ?? "USD",
    startDate: formatUsageDate(record.startDate),
    endDate: formatUsageDate(record.endDate),
  }));
}
