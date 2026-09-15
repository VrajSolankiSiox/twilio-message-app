import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createVoiceAccessToken,
  getVoiceConfig,
} from "@/lib/twilio-voice";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getVoiceConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Twilio Voice is not configured. Set TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID.",
      },
      { status: 500 }
    );
  }

  try {
    const identity = `user_${session.userId}`;
    const token = createVoiceAccessToken(identity);

    return NextResponse.json({
      token,
      identity,
      fromNumber: config.fromNumber,
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
