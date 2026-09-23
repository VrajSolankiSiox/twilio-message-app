"use client";

import Link from "next/link";
import type { CampaignView } from "@/lib/campaign-navigation";
import { CAMPAIGN_ROUTES } from "@/lib/campaign-navigation";

function ChevronRight() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-zinc-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface CampaignPageHeaderProps {
  view: CampaignView;
  listTotal?: number;
  detailTitle?: string | null;
  detailAccessory?: React.ReactNode;
  detailLoading?: boolean;
  onNewCampaign?: () => void;
}

export default function CampaignPageHeader({
  view,
  listTotal,
  detailTitle,
  detailAccessory,
  detailLoading,
  onNewCampaign,
}: CampaignPageHeaderProps) {
  if (view === "list") {
    return (
      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="max-w-lg text-sm leading-relaxed text-zinc-500">
            Send SMS to contact lists, monitor delivery, and resume campaigns if sending
            stops before everyone is reached.
          </p>
          {typeof listTotal === "number" && listTotal > 0 && (
            <p className="mt-2 text-xs font-medium tabular-nums text-zinc-400">
              {listTotal} campaign{listTotal === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {onNewCampaign && (
          <button
            type="button"
            onClick={onNewCampaign}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New campaign
          </button>
        )}
      </header>
    );
  }

  const breadcrumbCurrent =
    view === "create" ? "New campaign" : detailTitle?.trim() || "Campaign";

  return (
    <header className="mb-6 space-y-4 border-b border-border pb-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          href={CAMPAIGN_ROUTES.list}
          className="shrink-0 font-medium text-zinc-500 transition-colors hover:text-brand"
        >
          Campaigns
        </Link>
        <ChevronRight />
        <span
          className="truncate font-medium text-foreground"
          title={breadcrumbCurrent}
        >
          {view === "create" ? "New campaign" : detailLoading ? "Loading…" : breadcrumbCurrent}
        </span>
      </nav>

      {view === "create" && (
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Create campaign
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Name your campaign, import contacts, and compose the message to send.
          </p>
        </div>
      )}

      {view === "detail" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {detailLoading ? (
            <div className="h-8 w-48 animate-pulse rounded-lg bg-brand-muted" />
          ) : (
            <>
              <h1
                className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                title={detailTitle ?? undefined}
              >
                {detailTitle ?? "Campaign"}
              </h1>
              {detailAccessory}
            </>
          )}
        </div>
      )}
    </header>
  );
}

export function CreateCampaignSteps() {
  const steps = [
    { id: 1, label: "Details", hint: "Campaign name" },
    { id: 2, label: "Audience", hint: "Import contacts" },
    { id: 3, label: "Message", hint: "SMS content" },
  ];

  return (
    <ol className="mb-6 grid gap-3 sm:grid-cols-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white"
            aria-hidden
          >
            {step.id}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{step.label}</span>
            <span className="block text-xs text-zinc-500">{step.hint}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
