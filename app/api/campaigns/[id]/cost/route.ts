import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getCampaignCostSummary,
  syncCampaignMessagePrices,
} from "@/lib/db/campaigns";
import { twilioConfigured } from "@/lib/twilio-client";

function authError(err: unknown) {
  const message = err instanceof Error ? err.message : "Forbidden";
  const status = message === "Unauthorized" ? 401 : 403;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (err) {
    return authError(err);
  }

  const { id } = await context.params;
  const cost = await getCampaignCostSummary(id);
  if (!cost) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ cost });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const existing = await getCampaignCostSummary(id);
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const sync = await syncCampaignMessagePrices(id);
    const cost = await getCampaignCostSummary(id);
    return NextResponse.json({ cost, sync });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
