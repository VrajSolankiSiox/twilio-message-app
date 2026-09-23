import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllAssignments, setConversationClosed } from "@/lib/db/conversations";
import { getAllMessages } from "@/lib/db/messages";
import {
  buildConversations,
  canUserViewConversation,
} from "@/lib/messages";
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

    const [messages, assignments] = await Promise.all([
      getAllMessages(),
      getAllAssignments(),
    ]);
    const conversations = buildConversations(messages, assignments);
    const conversation = conversations.find(
      (c) => normalizePhone(c.phone) === normalizePhone(phone)
    );

    if (
      !conversation ||
      !canUserViewConversation(conversation, session.userId, session.role)
    ) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const assignment = await setConversationClosed(
      phone,
      closed,
      closed
        ? { userId: session.userId, fullName: session.fullName }
        : undefined
    );

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
