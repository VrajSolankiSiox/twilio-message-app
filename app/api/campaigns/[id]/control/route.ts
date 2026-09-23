import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  interruptCampaign,
  pauseCampaign,
  requeueFailedRecipients,
} from "@/lib/db/campaigns";

const INTERRUPT_MESSAGE =
  "Sending stopped before the campaign finished. Resume to continue with the remaining contacts.";

export async function POST(
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

  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "pause") {
      const campaign = await pauseCampaign(id);
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ campaign });
    }

    if (action === "interrupt") {
      const campaign = await interruptCampaign(id, INTERRUPT_MESSAGE);
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ campaign });
    }

    if (action === "retry_failed") {
      const result = await requeueFailedRecipients(id);
      if (!result) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    const status = /pause the campaign/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
