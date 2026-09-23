import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { requireAdmin } from "@/lib/auth";
import { CAMPAIGN_BATCH_SIZE, classifySendError, cleanErrorMessage, type RecipientView, type TickStopReason } from "@/lib/campaigns";
import { upsertContactNames } from "@/lib/db/conversations";
import {
  claimCampaignForSend,
  finishSendTick,
  heartbeatSendLock,
  markRecipientFailed,
  markRecipientSent,
  nextPendingRecipients,
  serializeCampaign,
} from "@/lib/db/campaigns";
import { saveMessage } from "@/lib/db/messages";

export const maxDuration = 60;

function authError(err: unknown) {
  const message = err instanceof Error ? err.message : "Forbidden";
  const status = message === "Unauthorized" ? 401 : 403;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (err) {
    return authError(err);
  }

  const { id } = await context.params;
  let resume = false;
  try {
    const body = await request.json();
    resume = body?.resume === true;
  } catch {
    resume = false;
  }

  const claim = await claimCampaignForSend(id, resume);
  if (!claim.ok) {
    if (claim.reason === "not_found") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({
      campaign: claim.campaign ? serializeCampaign(claim.campaign) : null,
      processed: [],
      stoppedReason: claim.reason,
    });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const campaign = await finishSendTick(
      id,
      claim.lockToken,
      "Twilio credentials are not configured"
    );
    return NextResponse.json({
      campaign,
      processed: [],
      stoppedReason: "system_error" satisfies TickStopReason,
    });
  }

  const client = twilio(accountSid, authToken);
  const processed: RecipientView[] = [];
  const namesToSave: Array<{ phone: string; name: string }> = [];
  let systemError: string | null = null;

  try {
    const batch = await nextPendingRecipients(id, CAMPAIGN_BATCH_SIZE);

    for (const recipient of batch) {
      const stillSending = await heartbeatSendLock(id, claim.lockToken);
      if (!stillSending) break;

      try {
        const msg = await client.messages.create({
          from: fromNumber,
          to: recipient.phone,
          body: claim.campaign.message,
        });

        await saveMessage({
          sid: msg.sid,
          from: fromNumber,
          to: recipient.phone,
          body: claim.campaign.message,
          direction: "outbound",
          status: msg.status,
          dateCreated: msg.dateCreated ?? new Date(),
        });
        await markRecipientSent(recipient._id, msg.sid);

        if (recipient.name) {
          namesToSave.push({ phone: recipient.phone, name: recipient.name });
        }

        processed.push({
          phone: recipient.phone,
          name: recipient.name,
          status: "sent",
          error: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        const classified = classifySendError(err);
        if (!classified.recipient) {
          systemError = classified.message;
          break;
        }

        await markRecipientFailed(recipient._id, classified.message);
        processed.push({
          phone: recipient.phone,
          name: recipient.name,
          status: "failed",
          error: classified.message,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    systemError = cleanErrorMessage(err);
  }

  if (namesToSave.length > 0) {
    try {
      await upsertContactNames(namesToSave);
    } catch {
      // Contact names are still stored on the campaign recipients.
    }
  }

  const campaign = await finishSendTick(id, claim.lockToken, systemError);
  const stoppedReason: TickStopReason = systemError
    ? "system_error"
    : campaign?.status === "completed"
      ? "completed"
      : campaign?.status === "paused"
        ? "paused"
        : campaign?.status === "interrupted"
          ? "interrupted"
          : null;

  return NextResponse.json({ campaign, processed, stoppedReason });
}
