/** Client-safe copy for Twilio Voice setup (matches API token route). */
export const TWILIO_VOICE_NOT_CONFIGURED_MESSAGE =
  "Twilio Voice is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY (SK…), TWILIO_API_SECRET, TWILIO_TWIML_APP_SID (AP…), and TWILIO_FROM_NUMBER.";

export function formatVoiceNotConfiguredMessage(missingKeys?: string[]): string {
  if (!missingKeys?.length) return TWILIO_VOICE_NOT_CONFIGURED_MESSAGE;
  return `${TWILIO_VOICE_NOT_CONFIGURED_MESSAGE} Missing on this server: ${missingKeys.join(", ")}.`;
}

export function isTwilioVoiceNotConfiguredMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("twilio voice is not configured") ||
    lower.includes("twilio_api_key")
  );
}
