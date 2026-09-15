import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllAssignments } from "@/lib/db/conversations";
import { getAllMessages } from "@/lib/db/messages";
import { applyConversationFilters } from "@/lib/filters";
import {
  buildConversations,
  canUserViewConversation,
} from "@/lib/messages";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const showStop = request.nextUrl.searchParams.get("showStop") === "true";
    const showBlank = request.nextUrl.searchParams.get("showBlank") === "true";

    const [messages, assignments] = await Promise.all([
      getAllMessages(),
      getAllAssignments(),
    ]);

    const allConversations = buildConversations(messages, assignments);

    const accessible = allConversations.filter((conv) =>
      canUserViewConversation(conv, session.userId, session.role)
    );

    const filtered = applyConversationFilters(accessible, {
      showStop,
      showBlank,
    });

    return NextResponse.json({
      conversations: filtered,
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
