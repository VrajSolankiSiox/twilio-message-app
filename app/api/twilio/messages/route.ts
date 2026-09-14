import { NextResponse } from "next/server";
import twilio from "twilio";

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
    const messages = await client.messages.list({
      to: fromNumber,
      limit: 50,
    });

    const incoming = messages
      .filter((msg) => msg.direction.startsWith("inbound"))
      .map((msg) => ({
        sid: msg.sid,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        dateCreated: msg.dateCreated,
        status: msg.status,
        numMedia: msg.numMedia,
      }))
      .sort(
        (a, b) =>
          new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
      );

    return NextResponse.json({ messages: incoming });
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
