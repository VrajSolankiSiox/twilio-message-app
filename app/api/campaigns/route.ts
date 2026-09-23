import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createCampaign, listCampaigns } from "@/lib/db/campaigns";

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

  try {
    const campaigns = await listCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load campaigns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch (err) {
    return authError(err);
  }

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name : "";
    const message = typeof body?.message === "string" ? body.message : "";
    const sourceFileName =
      typeof body?.sourceFileName === "string" && body.sourceFileName.trim()
        ? body.sourceFileName.trim().slice(0, 200)
        : null;
    const contacts = Array.isArray(body?.contacts) ? body.contacts : [];

    const result = await createCampaign({
      name,
      message,
      contacts,
      sourceFileName,
      createdByUserId: session.userId,
      createdByName: session.fullName,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    const status = /must be|no valid|up to/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
