import { NextRequest, NextResponse } from "next/server";
import { updateMessageStatus } from "@/lib/db/messages";
import { validateTwilioRequest } from "@/lib/twilio-webhook";

function formDataToRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });
  return params;
}

async function handleMessageStatus(
  request: NextRequest,
  params: Record<string, string>
) {
  const signature = request.headers.get("x-twilio-signature");
  if (!validateTwilioRequest(request.url, params, signature)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sid = params.MessageSid || params.SmsSid;
  const status = params.MessageStatus || params.SmsStatus;

  if (sid && status) {
    await updateMessageStatus(sid, status);
  }

  return new NextResponse("OK", { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    return handleMessageStatus(request, formDataToRecord(formData));
  } catch (error) {
    console.error("Message status webhook error:", error);
    return new NextResponse("OK", { status: 200 });
  }
}

export async function GET(request: NextRequest) {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return handleMessageStatus(request, params);
}
