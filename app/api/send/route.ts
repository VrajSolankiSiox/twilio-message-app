import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getSession } from "@/lib/auth";
import {
  assignConversation,
  ensureConversationExists,
  getAllAssignments,
  getAssignment,
  upsertContactNames,
} from "@/lib/db/conversations";
import { getAllMessages, saveMessage } from "@/lib/db/messages";
import { buildConversations, canUserReplyToConversation } from "@/lib/messages";
import { normalizePhone } from "@/lib/phone";

interface SendResult {
  to: string;
  success: boolean;
  sid?: string;
  status?: string;
  body?: string;
  from?: string;
  dateCreated?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, phoneNumbers, contactNames } = await request.json();

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

    const isBulk = phoneNumbers.length > 1 || request.nextUrl.searchParams.get("bulk") === "true";

    if (isBulk && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can send bulk messages" },
        { status: 403 }
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

    if (!isBulk && phoneNumbers.length === 1) {
      const phone = normalizePhone(phoneNumbers[0]);
      const [messages, assignments] = await Promise.all([
        getAllMessages(),
        getAllAssignments(),
      ]);
      const conversations = buildConversations(messages, assignments);
      const conversation = conversations.find(
        (c) => normalizePhone(c.phone) === phone
      );

      if (
        conversation &&
        !canUserReplyToConversation(conversation, session.userId, session.role)
      ) {
        return NextResponse.json(
          { error: "This conversation is assigned to another team member" },
          { status: 403 }
        );
      }
    }

    const nameByPhone = new Map<string, string>();
    if (contactNames && typeof contactNames === "object" && !Array.isArray(contactNames)) {
      for (const [rawPhone, rawName] of Object.entries(
        contactNames as Record<string, unknown>
      )) {
        if (typeof rawName !== "string" || !rawName.trim()) continue;
        nameByPhone.set(normalizePhone(rawPhone), rawName.trim());
      }
    }

    if (nameByPhone.size > 0) {
      await upsertContactNames(
        Array.from(nameByPhone.entries()).map(([phone, name]) => ({
          phone,
          name,
        }))
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

        const dateCreated = msg.dateCreated.toISOString();

        await saveMessage({
          sid: msg.sid,
          from: fromNumber,
          to,
          body: message,
          direction: "outbound",
          status: msg.status,
          dateCreated: msg.dateCreated,
        });

        await ensureConversationExists(to);

        if (!isBulk) {
          const assignment = await getAssignment(to);
          if (!assignment?.assignedToUserId) {
            await assignConversation(
              to,
              session.userId,
              session.fullName,
              session.email
            );
          }
        }

        results.push({
          to,
          success: true,
          sid: msg.sid,
          status: msg.status,
          body: message,
          from: fromNumber,
          dateCreated,
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
