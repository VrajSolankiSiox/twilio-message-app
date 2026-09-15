import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { saveCall } from "@/lib/db/calls";
import { normalizePhone } from "@/lib/phone";
import { getStatusCallbackUrl, getVoiceConfig } from "@/lib/twilio-voice";

export async function POST(request: NextRequest) {
  const config = getVoiceConfig();
  if (!config) {
    return new NextResponse("Voice not configured", { status: 500 });
  }

  try {
    const formData = await request.formData();
    const rawTo = formData.get("To")?.toString();
    const callSid = formData.get("CallSid")?.toString();
    const initiatedByUserId =
      formData.get("InitiatedByUserId")?.toString() || undefined;
    const initiatedByName =
      formData.get("InitiatedByName")?.toString() || undefined;

    const response = new twilio.twiml.VoiceResponse();

    if (!rawTo) {
      response.say("No destination number was provided.");
      return twimlResponse(response);
    }

    const to = normalizePhone(rawTo);
    const statusCallback = getStatusCallbackUrl();

    const dial = response.dial({
      callerId: config.fromNumber,
      answerOnBridge: true,
    });

    dial.number(
      {
        ...(statusCallback && {
          statusCallback,
          statusCallbackEvent: [
            "initiated",
            "ringing",
            "answered",
            "completed",
          ],
          statusCallbackMethod: "POST",
        }),
      },
      to
    );

    if (callSid) {
      await saveCall({
        sid: callSid,
        from: config.fromNumber,
        to,
        status: "initiated",
        direction: "outbound",
        message: "Live call",
        initiatedByUserId,
        initiatedByName,
        dateCreated: new Date(),
      });
    }

    return twimlResponse(response);
  } catch (error) {
    console.error("Voice webhook error:", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say("We could not connect your call. Please try again.");
    return twimlResponse(response);
  }
}

function twimlResponse(response: twilio.twiml.VoiceResponse) {
  return new NextResponse(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
