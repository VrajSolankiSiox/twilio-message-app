import { NextRequest, NextResponse } from "next/server";
import { saveMessage } from "@/lib/db/messages";
import {
  emptyTwimlResponse,
  parseIncomingMessage,
  validateTwilioRequest,
} from "@/lib/twilio-webhook";

async function handleIncoming(
  request: NextRequest,
  params: Record<string, string>
) {
  const signature = request.headers.get("x-twilio-signature");

  if (!validateTwilioRequest(request.url, params, signature)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const incoming = parseIncomingMessage(params);

  try {
    await saveMessage({
      sid: incoming.messageSid,
      from: incoming.from,
      to: incoming.to,
      body: incoming.body,
      direction: "inbound",
      status: "received",
      numMedia: String(incoming.numMedia),
      mediaUrls: incoming.mediaUrls,
      dateCreated: new Date(),
    });
  } catch (error) {
    console.error("Failed to save incoming message:", error);
  }

  return new NextResponse(emptyTwimlResponse(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};

    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    return handleIncoming(request, params);
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return new NextResponse(emptyTwimlResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const params: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return handleIncoming(request, params);
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return new NextResponse(emptyTwimlResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
