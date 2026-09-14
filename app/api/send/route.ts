import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { normalizePhone } from "@/lib/phone";

interface SendResult {
  to: string;
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { message, phoneNumbers } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return NextResponse.json(
        { error: "At least one phone number is required" },
        { status: 400 }
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        { error: "Twilio credentials are not configured" },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);
    const results: SendResult[] = [];

    for (const rawNumber of phoneNumbers) {
      const to = normalizePhone(rawNumber);

      try {
        const msg = await client.messages.create({
          from: fromNumber,
          to,
          body: message,
        });

        results.push({
          to,
          success: true,
          sid: msg.sid,
          status: msg.status,
        });
      } catch (err) {
        results.push({
          to,
          success: false,
          error: err instanceof Error ? err.message : "Failed to send message",
        });
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.length - sent;

    return NextResponse.json({ results, sent, failed, total: results.length });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
