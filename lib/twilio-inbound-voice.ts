import { NextResponse } from "next/server";
import twilio from "twilio";
import { saveCall } from "@/lib/db/calls";
import {
  resolveOrganizationByTwilioNumber,
  twilioFromNumberForOrganization,
} from "@/lib/db/organizations";
import { listUsers } from "@/lib/db/users";
import { runWithOrganizationId } from "@/lib/org-context";
import {
  getStatusCallbackUrl,
  getVoiceConfig,
  voiceClientIdentity,
} from "@/lib/twilio-voice";

export function isTwilioVoiceWebhook(params: Record<string, string>): boolean {
  const callSid = params.CallSid?.trim();
  const messageSid = params.MessageSid?.trim();
  return Boolean(callSid && !messageSid);
}

export async function handleInboundVoiceRequest(
  params: Record<string, string>
): Promise<NextResponse> {
  const config = getVoiceConfig();
  const response = new twilio.twiml.VoiceResponse();

  if (!config) {
    response.say(
      { voice: "alice" },
      "Calling is not available right now. Please try again later."
    );
    return twimlResponse(response);
  }

  const from = params.From?.trim() || "";
  const to = params.To?.trim() || "";
  const callSid = params.CallSid?.trim();
  const org = await resolveOrganizationByTwilioNumber(to);
  if (!org) {
    response.say(
      { voice: "alice" },
      "Calling is not available right now. Please try again later."
    );
    return twimlResponse(response);
  }

  const orgFrom =
    (await twilioFromNumberForOrganization(org._id)) ?? config.fromNumber;

  if (callSid) {
    try {
      await runWithOrganizationId(org._id, () =>
        saveCall({
          sid: callSid,
          from,
          to,
          status: params.CallStatus?.trim() || "ringing",
          direction: "inbound",
          message: "Inbound call",
          dateCreated: new Date(),
        })
      );
    } catch (error) {
      console.error("Failed to save inbound call:", error);
    }
  }

  const team = await runWithOrganizationId(org._id, () =>
    listUsers(org._id)
  );
  const identities = team.map((member) => voiceClientIdentity(member.id));

  if (identities.length === 0) {
    response.say({ voice: "alice" }, "No agents are available. Goodbye.");
    return twimlResponse(response);
  }

  response.say(
    { voice: "alice" },
    "Thanks for calling. Please wait while we connect you to an agent."
  );

  const statusCallback = getStatusCallbackUrl();
  const dial = response.dial({
    answerOnBridge: true,
    timeout: 30,
    callerId: orgFrom,
    ...(statusCallback && {
      statusCallback,
      statusCallbackEvent: "initiated ringing answered completed",
      statusCallbackMethod: "POST",
    }),
  });

  for (const identity of identities.slice(0, 12)) {
    dial.client(identity);
  }

  return twimlResponse(response);
}

function twimlResponse(response: twilio.twiml.VoiceResponse) {
  return new NextResponse(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
