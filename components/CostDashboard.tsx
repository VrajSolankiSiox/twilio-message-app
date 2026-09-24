"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CAMPAIGN_ROUTES } from "@/lib/campaign-navigation";
import { formatMoney } from "@/lib/twilio-cost";
import {
  APP_INPUT,
  APP_SECTION,
  APP_SECTION_TITLE,
} from "@/lib/app-layout";
import {
  USAGE_CATEGORY_OPTIONS,
  formatUsagePeriodLabel,
  type UsagePeriod,
  type UsageRecordView,
} from "@/lib/twilio-usage-shared";

interface CampaignCostRow {
  campaignId: string;
  name: string;
  status: string;
  sent: number;
  failed: number;
  totalCostUsd: number;
  totalSegments: number;
  pricedSentCount: number;
  createdAt: string;
}

const PERIOD_OPTIONS: Array<{ value: UsagePeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "daily", label: "Daily (range)" },
  { value: "monthly", label: "Monthly (range)" },
  { value: "custom", label: "Custom range" },
  { value: "allTime", label: "All time" },
];

export default function CostDashboard() {
  const [period, setPeriod] = useState<UsagePeriod>("thisMonth");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [records, setRecords] = useState<UsageRecordView[]>([]);
  const [accountTotal, setAccountTotal] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [monthTotal, setMonthTotal] = useState(0);
  const [balance, setBalance] = useState<{
    amount: number;
    currency: string;
  } | null>(null);
  const [budget, setBudget] = useState<{
    limitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    currency: string;
  } | null>(null);

  const [campaignRows, setCampaignRows] = useState<CampaignCostRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  const needsRange =
    period === "custom" || period === "daily" || period === "monthly";

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (category) params.set("category", category);
      if (needsRange && startDate) params.set("startDate", startDate);
      if (needsRange && endDate) params.set("endDate", endDate);

      const res = await apiFetch(`/api/cost/usage?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load Twilio usage");
        setRecords([]);
        setAccountTotal(0);
        return;
      }
      setRecords(data.records ?? []);
      setAccountTotal(data.accountTotal ?? 0);
      setCurrency(data.currency ?? "USD");
    } catch {
      setError("Network error while loading usage");
    } finally {
      setLoading(false);
    }
  }, [period, category, startDate, endDate, needsRange]);

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const res = await apiFetch("/api/cost/campaigns?limit=40");
      const data = await res.json();
      if (res.ok) {
        setCampaignRows(data.campaigns ?? []);
      }
    } catch {
      // Campaign costs are supplementary to account usage.
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    void (async () => {
      setSummaryLoading(true);
      try {
        const res = await apiFetch("/api/cost/summary");
        const data = await res.json();
        if (res.ok) {
          setMonthTotal(data.monthToDate?.total ?? 0);
          setBalance(data.balance ?? null);
          setBudget(data.budget ?? null);
          if (data.monthToDate?.currency) {
            setCurrency(data.monthToDate.currency);
          }
        }
      } catch {
        // Summary cards are optional.
      } finally {
        setSummaryLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <section className={APP_SECTION}>
        <h2 className={APP_SECTION_TITLE}>Filters</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Period
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as UsagePeriod)}
              className={`${APP_INPUT} w-full`}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${APP_INPUT} w-full`}
            >
              {USAGE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {needsRange && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Start date
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`${APP_INPUT} w-full`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  End date
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${APP_INPUT} w-full`}
                />
              </label>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={loading}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? "Loading…" : "Apply filters"}
        </button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Period total (Twilio)
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {loading ? "…" : formatMoney(accountTotal, currency)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Matches totalprice for filters above
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            This month
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {summaryLoading ? "…" : formatMoney(monthTotal, currency)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Calendar month to date</p>
        </div>
        {/* <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Budget remaining
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {summaryLoading
              ? "…"
              : budget
                ? formatMoney(budget.remainingUsd, budget.currency)
                : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {budget
              ? `${formatMoney(budget.spentUsd, budget.currency)} of ${formatMoney(budget.limitUsd, budget.currency)} used`
              : "Set TWILIO_MONTHLY_BUDGET_USD in .env.local"}
          </p>
        </div> */}
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Prepaid balance
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {summaryLoading
              ? "…"
              : balance
                ? formatMoney(balance.amount, balance.currency)
                : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {balance
              ? "Twilio account credit (if prepaid)"
              : "Not available on all account types"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
        Breakdown rows are for detail only —{" "}
        <span className="font-medium">sms</span>,{" "}
        <span className="font-medium">channels</span>, and{" "}
        <span className="font-medium">carrier fees</span> overlap. Do not add
        them together.
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">
            Usage breakdown
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            One category per row — costs overlap across categories.
          </p>
        </div>
        {loading ? (
          <div className="h-40 animate-pulse bg-brand-muted/30" />
        ) : records.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            No billable usage for this filter. Try &quot;Total spend&quot;, a
            wider period, or SMS / carrier fee categories.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-brand-muted/40 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5 text-right">Count</th>
                  <th className="px-4 py-2.5 text-right">Usage</th>
                  <th className="px-4 py-2.5 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((row, index) => (
                  <tr
                    key={`${row.category}-${row.startDate}-${index}`}
                    className="hover:bg-brand-muted/20"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {row.category}
                      </p>
                      <p className="text-xs text-zinc-500 line-clamp-2">
                        {row.description}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                      {formatUsagePeriodLabel(row.startDate, row.endDate)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                      {row.count ?? "—"}
                      {row.countUnit ? ` ${row.countUnit}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                      {row.usage ?? "—"}
                      {row.usageUnit ? ` ${row.usageUnit}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                      {formatMoney(row.price, row.priceUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">
            Campaign spend
          </h2>
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            disabled={campaignsLoading}
            className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {campaignsLoading ? (
          <div className="h-32 animate-pulse bg-brand-muted/30" />
        ) : campaignRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            No campaign sends with pricing yet. Open a campaign and refresh
            costs after messages finish sending.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {campaignRows.map((row) => (
              <li key={row.campaignId}>
                <Link
                  href={CAMPAIGN_ROUTES.detail(row.campaignId)}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-brand-muted/25 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {row.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {row.sent} sent · {row.pricedSentCount} priced
                      {row.totalSegments > 0
                        ? ` · ${row.totalSegments} segments`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {row.totalCostUsd > 0
                      ? formatMoney(row.totalCostUsd, "USD")
                      : "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
