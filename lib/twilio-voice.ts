import twilio from "twilio";

/**
 * Voice (browser + PSTN) environment:
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (webhook signature validation)
 * - TWILIO_FROM_NUMBER — caller ID for outbound and inbound PSTN leg
 * - TWILIO_API_KEY + TWILIO_API_SECRET — Voice access tokens (Console → API keys)
 * - TWILIO_TWIML_APP_SID — TwiML App with VOICE REQUEST URL → /api/twilio/voice (POST)
 * - TWILIO_WEBHOOK_URL — public app base (e.g. https://your-app.vercel.app/api/twilio/incoming)
 *   Used to derive call-status URL; set phone SMS webhook to same host /api/twilio/incoming
 * - Phone number VOICE: primary /api/twilio/incoming, failover /api/twilio/incomingcall
 * Optional: TWILIO_CALL_STATUS_WEBHOOK_URL — full URL for call status callbacks
 */

export function voiceClientIdentity(userId: string): string {
  return `user_${userId}`;
}

const VOICE_ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_TWIML_APP_SID",
  "TWILIO_FROM_NUMBER",
] as const;

/** Which voice env vars are missing or empty (safe to expose to logged-in clients). */
export function getMissingVoiceEnvKeys(): string[] {
  const missing: string[] = [];
  for (const key of VOICE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) missing.push(key);
  }
  return missing;
}

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
    incomingAllow: true,
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
