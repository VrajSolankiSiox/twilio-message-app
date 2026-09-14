import { NextResponse } from "next/server";
import twilio from "twilio";
import { buildConversations, ChatMessage } from "@/lib/messages";

export async function GET() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json(
      { error: "Twilio credentials are not configured" },
      { status: 500 }
    );
  }

  try {
    const client = twilio(accountSid, authToken);

    const [incoming, outgoing] = await Promise.all([
      client.messages.list({ to: fromNumber, limit: 100 }),
      client.messages.list({ from: fromNumber, limit: 100 }),
    ]);

    const allMessages: ChatMessage[] = [...incoming, ...outgoing].map(
      (msg) => ({
        sid: msg.sid,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        dateCreated: msg.dateCreated.toISOString(),
        direction: msg.direction.startsWith("inbound") ? "inbound" : "outbound",
        status: msg.status,
        numMedia: msg.numMedia,
      })
    );

    const conversations = buildConversations(allMessages);

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
