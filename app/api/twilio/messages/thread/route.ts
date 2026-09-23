import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAssignment } from "@/lib/db/conversations";
import { getMessagesForContact } from "@/lib/db/messages";
import { MESSAGE_THREAD_PAGE_SIZE } from "@/lib/messaging";
import { canUserViewConversation, type Conversation } from "@/lib/messages";
import { normalizePhone } from "@/lib/phone";

function conversationFromAssignment(
  phone: string,
  assignment: Awaited<ReturnType<typeof getAssignment>>
): Conversation {
  return {
    phone,
    contactName: assignment?.contactName?.trim() || null,
    messages: [],
    lastMessage: "",
    lastMessageAt: new Date(0).toISOString(),
    assignedToUserId: assignment?.assignedToUserId ?? null,
    assignedToName: assignment?.assignedToName ?? null,
    assignedToEmail: assignment?.assignedToEmail ?? null,
    assignedAt: assignment?.assignedAt?.toISOString() ?? null,
    isStop: Boolean(assignment?.hasStopInbound),
    isBlank: false,
    hasNonStopInbound: Boolean(assignment?.hasNonStopInbound),
    isClosed: Boolean(assignment?.closedAt),
    closedAt: assignment?.closedAt?.toISOString() ?? null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phone = request.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const beforeParam = request.nextUrl.searchParams.get("before");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(
      parseInt(limitParam ?? String(MESSAGE_THREAD_PAGE_SIZE), 10) ||
        MESSAGE_THREAD_PAGE_SIZE,
      1
    ),
    100
  );

  let before: Date | undefined;
  if (beforeParam) {
    const parsed = new Date(beforeParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid before date" }, { status: 400 });
    }
    before = parsed;
  }

  try {
    const normalized = normalizePhone(phone);
    const assignment = await getAssignment(normalized);
    const conversation = conversationFromAssignment(normalized, assignment);

    if (
      !canUserViewConversation(conversation, session.userId, session.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { messages, hasMore, totalCount } = await getMessagesForContact(
      normalized,
      { before, limit }
    );

    return NextResponse.json({ messages, hasMore, totalCount });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch message thread",
      },
      { status: 500 }
    );
  }
}
