import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { twilioFromNumberForOrganization } from "@/lib/db/organizations";
import { formatVoiceNotConfiguredMessage } from "@/lib/voice-client";
import {
  createVoiceAccessToken,
  getMissingVoiceEnvKeys,
  getVoiceConfig,
} from "@/lib/twilio-voice";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getVoiceConfig();
  if (!config) {
    const missingKeys = getMissingVoiceEnvKeys();
    return NextResponse.json(
      {
        error: formatVoiceNotConfiguredMessage(missingKeys),
        missingEnvKeys: missingKeys,
      },
      { status: 500 }
    );
  }

  try {
    const identity = `user_${session.userId}`;
    const token = createVoiceAccessToken(identity);

    const fromNumber =
      (await twilioFromNumberForOrganization(session.organizationId)) ??
      config.fromNumber;

    return NextResponse.json({
      token,
      identity,
      fromNumber,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create voice token",
      },
      { status: 500 }
    );
  }
}
