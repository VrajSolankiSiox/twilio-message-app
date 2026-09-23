export const CAMPAIGN_NAME_MAX = 80;
export const CAMPAIGN_MESSAGE_MAX = 1600;
export const CAMPAIGN_RECIPIENT_MAX = 5000;
export const CAMPAIGN_BATCH_SIZE = 5;
export const CAMPAIGN_LIST_PAGE_SIZE = 10;
export const CAMPAIGN_DELIVERY_PAGE_SIZE = 20;
export const CAMPAIGN_CONTACT_PREVIEW_PAGE_SIZE = 15;

export type CampaignStatus =
  | "draft"
  | "sending"
  | "paused"
  | "interrupted"
  | "completed";

export type RecipientStatus = "pending" | "sent" | "failed";

export interface CampaignSummary {
  id: string;
  name: string;
  message: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  skippedCount: number;
  sourceFileName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  active: boolean;
}

export interface RecipientView {
  phone: string;
  name: string | null;
  status: RecipientStatus;
  error: string | null;
  updatedAt: string;
  priceUsd?: number | null;
  numSegments?: number | null;
}

export interface CampaignCostSummary {
  campaignId: string;
  currency: string;
  totalCostUsd: number;
  pricedSentCount: number;
  unpricedSentCount: number;
  totalSegments: number;
  sentCount: number;
  failedCount: number;
  estimatedCostUsd: number | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CampaignContactInput {
  name?: string | null;
  phone?: string | null;
}

export type TickStopReason =
  | "paused"
  | "completed"
  | "interrupted"
  | "system_error"
  | "locked"
  | "not_found"
  | null;

const RECIPIENT_ERROR_CODES = new Set([
  21211, 21212, 21217, 21401, 21408, 21421, 21604, 21606, 21610, 21612, 21614,
  21635, 21268, 30005, 30006,
]);

export function campaignProgress(campaign: Pick<CampaignSummary, "sent" | "failed" | "total">): number {
  if (campaign.total <= 0) return 0;
  return Math.min(100, Math.round(((campaign.sent + campaign.failed) / campaign.total) * 100));
}

export function estimateSms(body: string): {
  segments: number;
  encoding: "GSM" | "Unicode";
} {
  if (!body) return { segments: 0, encoding: "GSM" };
  const unicode = [...body].some((char) => char.charCodeAt(0) > 127);
  if (unicode) {
    return {
      segments: body.length <= 70 ? 1 : Math.ceil(body.length / 67),
      encoding: "Unicode",
    };
  }
  return {
    segments: body.length <= 160 ? 1 : Math.ceil(body.length / 153),
    encoding: "GSM",
  };
}

export function cleanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Failed to send message";
  return raw.replace(/\s+/g, " ").trim().slice(0, 280);
}

export function classifySendError(err: unknown): {
  recipient: boolean;
  message: string;
} {
  const message = cleanErrorMessage(err);

  if (typeof err === "object" && err !== null) {
    const code = "code" in err ? Number(err.code) : NaN;
    const status = "status" in err ? Number(err.status) : NaN;

    if (Number.isFinite(code) && RECIPIENT_ERROR_CODES.has(code)) {
      return { recipient: true, message };
    }

    if (status === 429 || status === 401 || status === 403 || status >= 500) {
      return { recipient: false, message };
    }

    if (Number.isFinite(code) && code >= 20000 && code < 21000) {
      return { recipient: false, message };
    }

    if (Number.isFinite(code) && code >= 21200 && code < 21700) {
      return { recipient: true, message };
    }
  }

  return { recipient: false, message };
}

export function canResumeCampaign(
  campaign: Pick<CampaignSummary, "status" | "pending" | "sent">,
  skipAlreadySent = true
): boolean {
  const resumableStatus =
    campaign.status === "paused" ||
    campaign.status === "interrupted" ||
    campaign.status === "draft";

  if (resumableStatus && campaign.pending > 0) {
    return true;
  }

  if (!skipAlreadySent && campaign.sent > 0) {
    return (
      campaign.status === "completed" ||
      campaign.status === "paused" ||
      campaign.status === "interrupted"
    );
  }

  return false;
}
