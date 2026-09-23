/** Twilio outbound statuses that are in-flight; hide in the chat UI. */
const HIDDEN_OUTBOUND_STATUSES = new Set([
  "queued",
  "sending",
  "accepted",
  "scheduled",
  "receiving",
]);

export function formatOutboundMessageStatus(
  status?: string | null
): string | null {
  if (!status?.trim()) return null;
  const normalized = status.trim().toLowerCase();
  if (HIDDEN_OUTBOUND_STATUSES.has(normalized)) return null;
  return normalized;
}

export function getMessageStatusCallbackUrl(): string | undefined {
  const explicit = process.env.TWILIO_MESSAGE_STATUS_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (!base) return undefined;

  try {
    const url = new URL(base);
    url.pathname = "/api/twilio/message-status";
    return url.toString();
  } catch {
    return undefined;
  }
}
