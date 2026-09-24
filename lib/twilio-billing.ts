import { getTwilioClient } from "@/lib/twilio-client";
import type { UsagePeriod } from "@/lib/twilio-usage-shared";
import { fetchTwilioUsageRecords } from "@/lib/twilio-usage";

export interface TwilioBalanceView {
  amount: number;
  currency: string;
}

export function getMonthlyBudgetUsd(): number | null {
  const raw = process.env.TWILIO_MONTHLY_BUDGET_USD?.trim();
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function fetchTwilioBalance(): Promise<TwilioBalanceView | null> {
  try {
    const client = getTwilioClient();
    const record = await client.balance.fetch();
    const amount = Number.parseFloat(String(record.balance ?? ""));
    if (!Number.isFinite(amount)) return null;
    return {
      amount,
      currency: record.currency ?? "USD",
    };
  } catch {
    return null;
  }
}

/** Account spend for a period via Twilio `totalprice` (do not sum breakdown rows). */
export async function fetchAccountSpendForPeriod(
  period: UsagePeriod,
  startDate?: string,
  endDate?: string
): Promise<{ total: number; currency: string }> {
  const records = await fetchTwilioUsageRecords({
    period,
    category: "totalprice",
    startDate,
    endDate,
  });
  const row = records.find((r) => r.category === "totalprice") ?? records[0];
  return {
    total: row?.price ?? 0,
    currency: row?.priceUnit ?? "USD",
  };
}
