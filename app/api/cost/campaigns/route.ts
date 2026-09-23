import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listCampaignCostRows } from "@/lib/db/campaigns";

function authError(err: unknown) {
  const message = err instanceof Error ? err.message : "Forbidden";
  const status = message === "Unauthorized" ? 401 : 403;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return authError(err);
  }

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "30", 10) || 30)
  );

  const campaigns = await listCampaignCostRows(limit);
  const totalCampaignSpend = campaigns.reduce((sum, row) => sum + row.totalCostUsd, 0);

  return NextResponse.json({
    currency: "USD",
    totalCampaignSpend,
    campaigns,
  });
}
