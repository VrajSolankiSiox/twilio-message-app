import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  fetchAccountSpendForPeriod,
  fetchTwilioBalance,
  getMonthlyBudgetUsd,
} from "@/lib/twilio-billing";
import { twilioConfigured } from "@/lib/twilio-client";

function authError(err: unknown) {
  const message = err instanceof Error ? err.message : "Forbidden";
  const status = message === "Unauthorized" ? 401 : 403;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
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

  try {
    const [balance, monthSpend] = await Promise.all([
      fetchTwilioBalance(),
      fetchAccountSpendForPeriod("thisMonth"),
    ]);

    const budgetLimitUsd = getMonthlyBudgetUsd();
    const spentUsd = monthSpend.total;
    const budget =
      budgetLimitUsd != null
        ? {
            limitUsd: budgetLimitUsd,
            spentUsd,
            remainingUsd: Math.max(0, budgetLimitUsd - spentUsd),
            currency: monthSpend.currency,
          }
        : null;

    return NextResponse.json({
      balance,
      monthToDate: {
        total: spentUsd,
        currency: monthSpend.currency,
        label: "This month (totalprice)",
      },
      budget,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load billing summary";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
