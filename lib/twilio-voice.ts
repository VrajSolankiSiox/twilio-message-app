import twilio from "twilio";

export function getVoiceConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKey = process.env.TWILIO_API_KEY?.trim();
  const apiSecret = process.env.TWILIO_API_SECRET?.trim();
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid || !fromNumber) {
    return null;
  }

  return { accountSid, apiKey, apiSecret, twimlAppSid, fromNumber };
}

export function createVoiceAccessToken(identity: string): string {
  const config = getVoiceConfig();
  if (!config) {
    throw new Error("Twilio Voice is not configured");
  }

  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: config.twimlAppSid,
    incomingAllow: false,
  });

  const token = new AccessToken(
    config.accountSid,
    config.apiKey,
    config.apiSecret,
    { identity, ttl: 3600 }
  );

  token.addGrant(voiceGrant);
  return token.toJwt();
}

export function getStatusCallbackUrl(): string | undefined {
  const explicit = process.env.TWILIO_CALL_STATUS_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (!base) return undefined;

  try {
    const url = new URL(base);
    url.pathname = "/api/twilio/call-status";
    return url.toString();
  } catch {
    return undefined;
  }
}
