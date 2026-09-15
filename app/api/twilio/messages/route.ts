import { NextResponse } from "next/server";
import { getAllMessages } from "@/lib/db/messages";
import { buildConversations } from "@/lib/messages";

export async function GET() {
  try {
    const messages = await getAllMessages();
    const conversations = buildConversations(messages);

    return NextResponse.json({ conversations });
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
