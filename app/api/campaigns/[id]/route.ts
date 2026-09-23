import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCampaignDetail } from "@/lib/db/campaigns";

export async function GET(
  _request: Request,
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
  try {
    const campaign = await getCampaignDetail(id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
