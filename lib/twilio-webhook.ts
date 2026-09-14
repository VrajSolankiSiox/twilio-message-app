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

export function validateTwilioRequest(
  requestUrl: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;

  if (!signature) return false;

  const webhookUrl = process.env.TWILIO_WEBHOOK_URL || requestUrl;

  return twilio.validateRequest(authToken, signature, webhookUrl, params);
}

export function emptyTwimlResponse(): string {
  return new twilio.twiml.MessagingResponse().toString();
}

export function replyTwimlResponse(message: string): string {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return twiml.toString();
}
