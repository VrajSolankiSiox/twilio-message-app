import twilio from "twilio";

export interface IncomingMessage {
  messageSid: string;
  accountSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  mediaUrls: string[];
}

export function parseIncomingMessage(
  params: Record<string, string>
): IncomingMessage {
  const numMedia = parseInt(params.NumMedia || "0", 10);
  const mediaUrls: string[] = [];

  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) mediaUrls.push(url);
  }

  return {
    messageSid: params.MessageSid || "",
    accountSid: params.AccountSid || "",
    from: params.From || "",
    to: params.To || "",
    body: params.Body || "",
    numMedia,
    mediaUrls,
  };
}

function candidateWebhookUrls(requestUrl: string): string[] {
  const urls = new Set<string>();
  if (requestUrl) urls.add(requestUrl);

  const configured = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (!configured) return [...urls];

  urls.add(configured);
  try {
    const request = new URL(requestUrl);
    const base = new URL(configured);
    urls.add(`${base.origin}${request.pathname}${request.search}`);
  } catch {
    // Keep the raw request URL when one of the values is not a URL.
  }
  return [...urls];
}

export function validateTwilioRequest(
  requestUrl: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;
  if (!signature) return false;

  return candidateWebhookUrls(requestUrl).some((url) =>
    twilio.validateRequest(authToken, signature, url, params)
  );
}

export function emptyTwimlResponse(): string {
  return new twilio.twiml.MessagingResponse().toString();
}
