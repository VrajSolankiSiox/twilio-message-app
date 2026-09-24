import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversationReadsForUser } from "@/lib/db/conversation-reads";
import { listStoredConversations } from "@/lib/db/inbox";
import { applyConversationFilters } from "@/lib/filters";
import { CONVERSATION_LIST_PAGE_SIZE } from "@/lib/messaging";
import {
  buildConversationsFromStored,
  canUserViewConversation,
  sortConversations,
} from "@/lib/messages";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const showStop = request.nextUrl.searchParams.get("showStop") === "true";
    const showBlank = request.nextUrl.searchParams.get("showBlank") === "true";
    const showClosed = request.nextUrl.searchParams.get("showClosed") === "true";

    const page = Math.max(
      parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1,
      1
    );
    const limit = Math.min(
      Math.max(
        parseInt(
          request.nextUrl.searchParams.get("limit") ??
            String(CONVERSATION_LIST_PAGE_SIZE),
          10
        ) || CONVERSATION_LIST_PAGE_SIZE,
        1
      ),
      50
    );

    const [rows, readsByPhone] = await Promise.all([
      listStoredConversations(),
      getConversationReadsForUser(session.userId),
    ]);

    const allConversations = buildConversationsFromStored(rows, readsByPhone);

    const accessible = allConversations.filter((conv) =>
      canUserViewConversation(conv, session.userId, session.role)
    );

    const filtered = sortConversations(
      applyConversationFilters(accessible, {
        showStop,
        showBlank,
        showClosed,
      })
    );

    const total = filtered.length;
    const start = (page - 1) * limit;
    const conversations = filtered.slice(start, start + limit);
    const hasMore = start + conversations.length < total;

    return NextResponse.json({
      conversations,
      page,
      limit,
      total,
      hasMore,
      user: {
        id: session.userId,
        role: session.role,
        fullName: session.fullName,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch messages",
      },
      { status: 500 }
    );
  }
}
