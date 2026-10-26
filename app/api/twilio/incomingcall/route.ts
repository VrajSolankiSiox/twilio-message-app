import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { handleInboundVoiceRequest } from "@/lib/twilio-inbound-voice";
import { validateTwilioRequest } from "@/lib/twilio-webhook";

function formToRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });
  return params;
}

async function handle(
  request: NextRequest,
  params: Record<string, string>
): Promise<NextResponse> {
  const signature = request.headers.get("x-twilio-signature");
  if (!validateTwilioRequest(request.url, params, signature)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    return await handleInboundVoiceRequest(params);
  } catch (error) {
    console.error("Inbound voice (failover) error:", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say("We could not connect your call. Please try again later.");
    return new NextResponse(response.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    return handle(request, formToRecord(formData));
  } catch (error) {
    console.error("Inbound voice webhook error:", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say("We could not connect your call.");
    return new NextResponse(response.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function GET(request: NextRequest) {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return handle(request, params);
}
