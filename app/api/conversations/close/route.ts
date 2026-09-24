import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setConversationClosed } from "@/lib/db/conversations";
import { invalidateInboxCache } from "@/lib/db/inbox";
import { normalizePhone } from "@/lib/phone";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const closed = body?.closed === true;

    if (!phone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }

    const assignment = await setConversationClosed(
      normalizePhone(phone),
      closed,
      closed
        ? { userId: session.userId, fullName: session.fullName }
        : undefined,
      { userId: session.userId, role: session.role }
    );
    if (!assignment) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    invalidateInboxCache();

    return NextResponse.json({
      assignment: {
        phone: assignment.phone,
        closedAt: assignment.closedAt?.toISOString() ?? null,
        closedByName: assignment.closedByName,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
