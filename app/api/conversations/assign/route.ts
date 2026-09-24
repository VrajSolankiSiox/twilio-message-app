import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setConversationAssignee } from "@/lib/db/conversations";
import { invalidateInboxCache } from "@/lib/db/inbox";
import { findUserById } from "@/lib/db/users";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const body = await request.json();
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const userId =
      body?.userId === null || body?.userId === ""
        ? null
        : typeof body?.userId === "string"
          ? body.userId.trim()
          : undefined;

    if (!phone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }

    if (userId === undefined) {
      return NextResponse.json(
        { error: "userId must be a string or null" },
        { status: 400 }
      );
    }

    let assignee: { userId: string; fullName: string; email: string } | null =
      null;

    if (userId) {
      const user = await findUserById(userId);
      if (!user) {
        return NextResponse.json({ error: "Team member not found" }, { status: 404 });
      }
      assignee = {
        userId: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
      };
    }

    const assignment = await setConversationAssignee(phone, assignee);
    invalidateInboxCache();

    return NextResponse.json({
      assignment: {
        phone: assignment.phone,
        assignedToUserId: assignment.assignedToUserId,
        assignedToName: assignment.assignedToName,
        assignedToEmail: assignment.assignedToEmail,
        assignedAt: assignment.assignedAt?.toISOString() ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
