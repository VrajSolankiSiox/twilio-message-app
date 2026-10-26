"use client";

import { useEffect, useMemo, useState } from "react";
import DayMood from "@/components/DayMood";
import { apiFetch } from "@/lib/api-client";
import { dayPhaseForDate, greetingFirstName } from "@/lib/day-phase";
import type { OverviewMetrics } from "@/lib/db/overview";

interface OverviewDashboardProps {
  userName?: string;
}

function formatCount(value: number | undefined | null): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US").format(n);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function share(part: number | undefined | null, total: number | undefined | null): number {
  const p = typeof part === "number" && Number.isFinite(part) ? part : 0;
  const t = typeof total === "number" && Number.isFinite(total) ? total : 0;
  if (t <= 0) return 0;
  return Math.round((p / t) * 100);
}

export default function OverviewDashboard({ userName }: OverviewDashboardProps) {
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = useMemo(() => dayPhaseForDate(), []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/overview", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load dashboard");
        if (!cancelled) setData(body as OverviewMetrics);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data) {
    return (
      <div className="flex min-h-[min(420px,55vh)] flex-col items-center justify-center gap-3 py-16">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent"
          role="status"
          aria-label="Loading dashboard"
        />
        <p className="text-sm text-zinc-500">Loading dashboard…</p>
      </div>
    );
  }

  const maxDay = Math.max(1, ...data.daily.map((day) => day.inbound + day.outbound));
  const openShare = share(data.conversations.open, data.conversations.total);
  const closedShare = share(data.conversations.closed, data.conversations.total);

  const highlights = [
    { label: "Messages today", value: formatCount(data.messages.today), detail: `${formatCount(data.messages.last7Days)} in 7 days` },
    { label: "All messages", value: formatCount(data.messages.total), detail: `${formatCount(data.messages.outbound)} sent · ${formatCount(data.messages.inbound)} received` },
    { label: "Calls", value: formatCount(data.calls.total), detail: `${formatCount(data.calls.last7Days)} this week` },
    { label: "Invoices", value: formatCount(data.invoices.total), detail: `${formatMoney(data.invoices.outstandingUsd)} billed` },
  ];

  const conversationRows = [
    { label: "Open", value: data.conversations.open, bar: "bg-emerald-500", width: openShare },
    { label: "Closed", value: data.conversations.closed, bar: "bg-zinc-400", width: closedShare },
    { label: "Stop replies", value: data.conversations.stopped, bar: "bg-amber-500", width: share(data.conversations.stopped, data.conversations.total) },
  ];

  const campaigns = data.campaigns ?? {
    total: 0,
    sending: 0,
    paused: 0,
    draft: 0,
    completed: 0,
    interrupted: 0,
  };

  const campaignRows = [
    { label: "Sending", value: campaigns.sending },
    { label: "Paused", value: campaigns.paused },
    { label: "Draft", value: campaigns.draft },
    { label: "Completed", value: campaigns.completed },
    { label: "Interrupted", value: campaigns.interrupted },
  ];

  const firstName = userName ? greetingFirstName(userName) : "";

  return (
    <div className="space-y-6 pb-8">
      <DayMood
        phase={phase}
        name={firstName}
        scope={data.organizationName ? `${data.organizationName} · Dashboard` : "Dashboard"}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {highlights.map((card) => (
          <article key={card.label} className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-1 text-sm text-zinc-500">{card.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:col-span-3">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Message volume</h3>
              <p className="text-sm text-zinc-500">Inbound and outbound over the last 7 days</p>
            </div>
            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Received
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Sent
              </span>
            </div>
          </div>
          <div className="flex h-52 items-end gap-3">
            {data.daily.map((day) => {
              const total = day.inbound + day.outbound;
              const height = total === 0 ? 6 : Math.max(12, Math.round((total / maxDay) * 100));
              const inboundShare = total === 0 ? 0 : (day.inbound / total) * 100;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] tabular-nums text-zinc-400">{total || ""}</span>
                  <div className="flex h-40 w-full items-end">
                    <div
                      className="flex w-full flex-col justify-end overflow-hidden rounded-xl bg-zinc-100"
                      style={{ height: `${height}%` }}
                      title={`${day.inbound} received, ${day.outbound} sent`}
                    >
                      <div className="bg-emerald-500" style={{ height: `${inboundShare}%` }} />
                      <div className="min-h-0 flex-1 bg-brand" />
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-zinc-500">{dayLabel(day.date)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <h3 className="text-base font-semibold text-foreground">Conversations</h3>
          <p className="text-sm text-zinc-500">{formatCount(data.conversations.total)} total</p>
          <div className="mt-5 space-y-4">
            {conversationRows.map((row) => (
              <div key={row.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="tabular-nums text-zinc-500">
                    {formatCount(row.value)} · {row.width}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${row.width}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {conversationRows.map((row) => (
              <div key={`${row.label}-tile`} className="rounded-xl bg-zinc-50 px-3 py-3 text-center">
                <p className="text-lg font-semibold tabular-nums">{formatCount(row.value)}</p>
                <p className="text-[11px] text-zinc-500">{row.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-base font-semibold">Campaigns</h3>
          <p className="text-sm text-zinc-500">{formatCount(campaigns.total)} total</p>
          <ul className="mt-4 divide-y divide-border">
            {campaignRows.map((row) => (
              <li key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-zinc-600">{row.label}</span>
                <span className="font-semibold tabular-nums">{formatCount(row.value)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-base font-semibold">Messages</h3>
          <p className="text-sm text-zinc-500">Lifetime totals for this organization</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Received</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-950">
                {formatCount(data.messages.inbound)}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sent</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatCount(data.messages.outbound)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="text-base font-semibold">Calls and billing</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-zinc-600">Calls recorded</span>
              <span className="font-semibold tabular-nums">{formatCount(data.calls.total)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-zinc-600">Calls this week</span>
              <span className="font-semibold tabular-nums">{formatCount(data.calls.last7Days)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-zinc-600">Saved invoices</span>
              <span className="font-semibold tabular-nums">{formatCount(data.invoices.total)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-zinc-600">Invoice line total</span>
              <span className="font-semibold tabular-nums">{formatMoney(data.invoices.outstandingUsd)}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
