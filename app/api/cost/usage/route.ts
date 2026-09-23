import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchAccountSpendForPeriod } from "@/lib/twilio-billing";
import { filterUsageRecordsWithSpend } from "@/lib/twilio-usage-shared";
import {
  fetchTwilioUsageRecords,
  type UsagePeriod,
} from "@/lib/twilio-usage";
import { twilioConfigured } from "@/lib/twilio-client";

function authError(err: unknown) {
  const message = err instanceof Error ? err.message : "Forbidden";
  const status = message === "Unauthorized" ? 401 : 403;
  return NextResponse.json({ error: message }, { status });
}

const PERIODS = new Set<UsagePeriod>([
  "today",
  "yesterday",
  "thisMonth",
  "lastMonth",
  "daily",
  "monthly",
  "yearly",
  "allTime",
  "custom",
]);

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authError(err);
  }

  if (!twilioConfigured()) {
    return NextResponse.json(
      { error: "Twilio credentials are not configured" },
      { status: 503 }
    );
  }

  const params = request.nextUrl.searchParams;
  const period = (params.get("period") ?? "thisMonth") as UsagePeriod;
  if (!PERIODS.has(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const category = params.get("category")?.trim() || undefined;
  const startDate = params.get("startDate")?.trim() || undefined;
  const endDate = params.get("endDate")?.trim() || undefined;

  if (period === "custom" && (!startDate || !endDate)) {
    return NextResponse.json(
      { error: "Custom period requires startDate and endDate (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const [raw, accountTotal] = await Promise.all([
      fetchTwilioUsageRecords({
        period,
        category,
        startDate,
        endDate,
      }),
      fetchAccountSpendForPeriod(period, startDate, endDate),
    ]);

    const includeZero = params.get("includeZero") === "true";
    const records = includeZero ? raw : filterUsageRecordsWithSpend(raw);

    const currency = accountTotal.currency;

    return NextResponse.json({
      period,
      category: category ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      currency,
      accountTotal: accountTotal.total,
      records,
      hiddenZeroRows: includeZero ? 0 : raw.length - records.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load usage";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
