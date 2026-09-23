/** Client-safe copy for Twilio Voice setup (matches API token route). */
export const TWILIO_VOICE_NOT_CONFIGURED_MESSAGE =
  "Twilio Voice is not configured. Set TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID.";

export function isTwilioVoiceNotConfiguredMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("twilio voice is not configured") ||
    lower.includes("twilio_api_key")
  );
}
