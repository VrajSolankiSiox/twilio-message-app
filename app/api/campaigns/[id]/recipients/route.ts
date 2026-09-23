import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CAMPAIGN_DELIVERY_PAGE_SIZE } from "@/lib/campaigns";
import { listCampaignRecipients } from "@/lib/db/campaigns";
import type { RecipientStatus } from "@/lib/campaigns";

const DELIVERY_STATUSES = new Set<RecipientStatus | "all">([
  "all",
  "sent",
  "failed",
  "pending",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  const { id } = await context.params;
  const rawStatus = request.nextUrl.searchParams.get("status") ?? "all";
  const status = DELIVERY_STATUSES.has(rawStatus as RecipientStatus | "all")
    ? (rawStatus as RecipientStatus | "all")
    : "all";
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = Number(
    request.nextUrl.searchParams.get("limit") ?? String(CAMPAIGN_DELIVERY_PAGE_SIZE)
  );

  try {
    const result = await listCampaignRecipients(id, { page, limit, status });
    if (!result) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load campaign recipients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
