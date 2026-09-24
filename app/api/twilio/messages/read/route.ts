import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markConversationRead } from "@/lib/db/conversation-reads";
import { normalizePhone } from "@/lib/phone";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const readAt =
      typeof body?.readAt === "string" && body.readAt
        ? new Date(body.readAt)
        : new Date();

    if (Number.isNaN(readAt.getTime())) {
      return NextResponse.json({ error: "Invalid readAt" }, { status: 400 });
    }

    await markConversationRead(session.userId, normalizePhone(phone), readAt);

    return NextResponse.json({
      ok: true,
      lastReadAt: readAt.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to mark conversation read",
      },
      { status: 500 }
    );
  }
}
