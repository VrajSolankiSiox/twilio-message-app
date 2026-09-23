"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  campaignProgress,
  canResumeCampaign,
  estimateSms,
  type CampaignStatus,
  type CampaignSummary,
  type RecipientView,
  type TickStopReason,
} from "@/lib/campaigns";
import { parseContactsFromFile, type CsvContact } from "@/lib/csv";
import { formatPhoneDisplay } from "@/lib/phone";

const inputClass =
  "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

type View = "list" | "create" | "detail";
type ActivityFilter = "all" | "sent" | "failed";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function statusLabel(status: CampaignStatus): string {
  switch (status) {
    case "draft":
      return "Ready";
    case "sending":
      return "Sending";
    case "paused":
      return "Paused";
    case "interrupted":
      return "Stopped";
    case "completed":
      return "Completed";
  }
}

function statusClass(status: CampaignStatus): string {
  switch (status) {
    case "draft":
      return "bg-zinc-100 text-zinc-600";
    case "sending":
      return "bg-brand-light text-brand";
    case "paused":
      return "bg-amber-50 text-amber-700";
    case "interrupted":
      return "bg-red-50 text-red-700";
    case "completed":
      return "bg-emerald-50 text-emerald-700";
  }
}

function mergeRecipients(incoming: RecipientView[], existing: RecipientView[]) {
  const map = new Map(existing.map((item) => [item.phone, item]));
  for (const item of incoming) map.set(item.phone, item);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function CampaignsBackButton({
  onClick,
  label = "All campaigns",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to campaign list"
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm transition-colors hover:border-brand/25 hover:bg-brand-light hover:text-foreground"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand"
        aria-hidden
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </span>
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}
    >
      {status === "sending" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
        </span>
      )}
      {statusLabel(status)}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-brand-light"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-brand transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default function Campaigns() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runTokenRef = useRef(0);
  const pauseRef = useRef(false);
  const runnerRef = useRef(false);
  const runningIdRef = useRef<string | null>(null);
  const detailIdRef = useRef<string | null>(null);
  const campaignRef = useRef<CampaignSummary | null>(null);

  const [view, setView] = useState<View>("list");
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [failures, setFailures] = useState<RecipientView[]>([]);
  const [recentSends, setRecentSends] = useState<RecipientView[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<CsvContact[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const applyUpdate = useCallback(
    (next: CampaignSummary, processed: RecipientView[] = []) => {
      setCampaigns((prev) => {
        const index = prev.findIndex((item) => item.id === next.id);
        if (index === -1) return [next, ...prev];
        if (prev[index].updatedAt > next.updatedAt) return prev;
        const copy = prev.slice();
        copy[index] = next;
        return copy;
      });

      if (detailIdRef.current !== next.id) return;

      const current = campaignRef.current;
      if (
        current?.id === next.id &&
        current.updatedAt > next.updatedAt &&
        processed.length === 0
      ) {
        return;
      }

      campaignRef.current = next;
      setCampaign(next);

      if (processed.length === 0) return;

      const sent = processed.filter((item) => item.status === "sent");
      const failed = processed.filter((item) => item.status === "failed");
      if (sent.length > 0) {
        setRecentSends((prev) => mergeRecipients(sent, prev).slice(0, 40));
      }
      if (failed.length > 0 || sent.length > 0) {
        setFailures((prev) => {
          const sentPhones = new Set(sent.map((item) => item.phone));
          const kept = prev.filter((item) => !sentPhones.has(item.phone));
          return mergeRecipients(failed, kept).slice(0, 200);
        });
      }
    },
    []
  );

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || "Failed to load campaigns");
        return;
      }
      const incoming = (data.campaigns ?? []) as CampaignSummary[];
      setCampaigns((prev) => {
        const incomingIds = new Set(incoming.map((item) => item.id));
        const merged = incoming.map((item) => {
          const existing = prev.find((candidate) => candidate.id === item.id);
          if (existing && existing.updatedAt > item.updatedAt) return existing;
          return item;
        });
        const extras = prev.filter((item) => !incomingIds.has(item.id));
        return [...extras, ...merged].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        );
      });
      setListError(null);
    } catch {
      setListError("Failed to load campaigns");
    } finally {
      if (!silent) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const hasLiveSend = campaigns.some((item) => item.status === "sending");

  useEffect(() => {
    if (view !== "list" || !hasLiveSend) return;
    const timer = setInterval(() => {
      void loadList(true);
    }, 3000);
    return () => clearInterval(timer);
  }, [view, hasLiveSend, loadList]);

  const refreshDetail = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/campaigns/${id}`);
        const data = await res.json();
        if (!res.ok || !data.campaign) return;
        const current = campaignRef.current;
        if (current?.id === id && current.updatedAt > data.campaign.updatedAt) {
          return;
        }
        if (detailIdRef.current === id) {
          campaignRef.current = data.campaign;
          setCampaign(data.campaign);
          setFailures(data.failures ?? []);
          setRecentSends(data.recentSends ?? []);
        }
        applyUpdate(data.campaign);
      } catch {
        // The next poll or tick will refresh the counts.
      }
    },
    [applyUpdate]
  );

  useEffect(() => {
    if (view !== "detail" || !campaign || runningId === campaign.id) return;
    if (campaign.status !== "sending") return;
    const id = campaign.id;
    const timer = setInterval(() => {
      void refreshDetail(id);
    }, 2000);
    return () => clearInterval(timer);
  }, [view, campaign, runningId, refreshDetail]);

  const runLoop = useCallback(
    async (id: string, resume: boolean) => {
      if (runnerRef.current) {
        if (runningIdRef.current !== id) {
          setError("Another campaign is still sending. Pause it before starting this one.");
        }
        return;
      }

      const token = ++runTokenRef.current;
      pauseRef.current = false;
      runnerRef.current = true;
      runningIdRef.current = id;
      setRunningId(id);
      setError(null);
      setNotice(null);
      let allowResume = resume;

      try {
        while (runTokenRef.current === token && !pauseRef.current) {
          setDispatching(true);
          let response: Response;
          try {
            response = await fetch(`/api/campaigns/${id}/tick`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resume: allowResume }),
            });
          } catch {
            if (runTokenRef.current !== token) return;
            await fetch(`/api/campaigns/${id}/control`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "interrupt" }),
            }).catch(() => undefined);
            await refreshDetail(id);
            setNotice(
              "The connection dropped while sending. Resume to continue with the remaining contacts."
            );
            break;
          } finally {
            if (runTokenRef.current === token) setDispatching(false);
          }

          allowResume = false;
          const data = await response.json().catch(() => null);
          if (runTokenRef.current !== token) return;

          if (data?.campaign) {
            applyUpdate(data.campaign, data.processed ?? []);
          }

          if (pauseRef.current) {
            if (data?.campaign?.status === "sending") {
              const pauseResponse = await fetch(`/api/campaigns/${id}/control`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "pause" }),
              }).catch(() => null);
              const pauseData = pauseResponse
                ? await pauseResponse.json().catch(() => null)
                : null;
              if (pauseData?.campaign) applyUpdate(pauseData.campaign);
              setNotice(
                "Campaign paused. Messages already sent are kept. Resume to continue."
              );
            } else if (data?.campaign?.status === "interrupted") {
              setNotice(
                data.campaign.lastError ||
                  "Sending stopped before everyone was reached. Resume to continue the remaining contacts."
              );
            } else if (data?.campaign?.status !== "completed") {
              setNotice(
                "Campaign paused. Messages already sent are kept. Resume to continue."
              );
            }
            break;
          }

          if (!response.ok && !data?.campaign) {
            setError(data?.error || "Sending failed.");
            break;
          }

          const reason = (data?.stoppedReason ?? null) as TickStopReason;
          if (reason === "locked") {
            await sleep(800);
            if (pauseRef.current) break;
            continue;
          }

          if (reason === "system_error" || reason === "interrupted") {
            setNotice(
              data?.campaign?.lastError ||
                "Sending stopped before everyone was reached. Resume to continue the remaining contacts."
            );
            break;
          }

          if (reason === "paused") {
            setNotice("Campaign paused. Messages already sent are kept. Resume to continue.");
            break;
          }

          if (
            reason === "completed" ||
            !data?.campaign ||
            data.campaign.status !== "sending" ||
            data.campaign.pending === 0
          ) {
            if (reason === "completed" || data?.campaign?.status === "completed") {
              setNotice(null);
            }
            break;
          }
        }
      } finally {
        if (runTokenRef.current === token) {
          runnerRef.current = false;
          runningIdRef.current = null;
          setRunningId(null);
          setDispatching(false);
        }
      }
    },
    [applyUpdate, refreshDetail]
  );

  const openCampaign = useCallback(
    async (id: string, resume = false) => {
      setView("detail");
      detailIdRef.current = id;
      setActivityFilter("all");
      setDetailLoading(campaignRef.current?.id !== id);
      setError(null);
      setNotice(null);
      if (campaignRef.current?.id !== id) {
        campaignRef.current = null;
        setCampaign(null);
        setFailures([]);
        setRecentSends([]);
      }

      try {
        const res = await fetch(`/api/campaigns/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to open campaign");
          return;
        }

        const current = campaignRef.current;
        const stale = Boolean(
          current?.id === id && current.updatedAt > data.campaign.updatedAt
        );
        if (!stale) {
          campaignRef.current = data.campaign;
          setCampaign(data.campaign);
          setFailures(data.failures ?? []);
          setRecentSends(data.recentSends ?? []);
        }
        applyUpdate(data.campaign);

        if (resume) {
          await runLoop(id, true);
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setDetailLoading(false);
      }
    },
    [applyUpdate, runLoop]
  );

  const handleBack = () => {
    detailIdRef.current = null;
    campaignRef.current = null;
    setView("list");
    setNotice(null);
    setError(null);
    void loadList(true);
  };

  const handlePause = async (id: string) => {
    if (runningIdRef.current === id) pauseRef.current = true;
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not pause the campaign");
        return;
      }
      if (data.campaign) applyUpdate(data.campaign);
      setNotice("Campaign paused. Messages already sent are kept. Resume to continue.");
    } catch {
      setError("Network error while pausing.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleRetry = async (id: string) => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_failed" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not retry failed messages");
        return;
      }
      if (data.requeued === 0) {
        if (data.campaign) applyUpdate(data.campaign);
        setNotice("There are no failed messages to retry.");
        return;
      }
      setFailures([]);
      if (data.campaign) applyUpdate(data.campaign);
      setNotice(null);
      await runLoop(id, true);
    } catch {
      setError("Network error while retrying failed messages.");
    } finally {
      setActionBusy(false);
    }
  };

  const loadContacts = async (file: File) => {
    setFormError(null);
    const parsed = await parseContactsFromFile(file);
    if (parsed.length === 0) {
      setFormError("No phone numbers found. Put names in column A and numbers in column B.");
      setContacts([]);
      setFileName(null);
      return;
    }
    setContacts(parsed);
    setFileName(file.name);

    const namedContacts = parsed.filter((contact) => contact.name);
    if (namedContacts.length > 0) {
      try {
        await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: namedContacts }),
        });
      } catch {
        // Names are saved again as each message is sent.
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadContacts(file);
  };

  const handleClearForm = () => {
    setName("");
    setMessage("");
    setContacts([]);
    setFileName(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStart = async () => {
    if (runnerRef.current) {
      setFormError("Another campaign is still sending. Pause it before starting a new one.");
      return;
    }
    if (!name.trim()) {
      setFormError("Give this campaign a name.");
      return;
    }
    if (contacts.length === 0) {
      setFormError("Upload a contact file before starting.");
      return;
    }
    if (!message.trim()) {
      setFormError("Write the message you want to send.");
      return;
    }

    setStarting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          message,
          sourceFileName: fileName,
          contacts: contacts.map((contact) => ({
            name: contact.name,
            phone: contact.phone,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Could not create the campaign");
        return;
      }

      detailIdRef.current = data.campaign.id;
      campaignRef.current = data.campaign;
      setCampaign(data.campaign);
      setFailures([]);
      setRecentSends([]);
      setActivityFilter("all");
      setNotice(null);
      setError(null);
      setView("detail");
      applyUpdate(data.campaign);
      handleClearForm();
      await runLoop(data.campaign.id, false);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const sms = estimateSms(message);
  const activity =
    activityFilter === "failed"
      ? failures
      : activityFilter === "sent"
        ? recentSends
        : mergeRecipients(recentSends, failures);

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      {view === "list" && (
        <>
          {(error || notice) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {error || notice}
            </div>
          )}

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-500">
                Name a campaign, send it, and pick it back up if it stops early.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setView("create");
              }}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              New campaign
            </button>
          </div>

          {listError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{listError}</p>
              <button
                type="button"
                onClick={() => void loadList()}
                className="mt-2 text-sm font-medium underline"
              >
                Try again
              </button>
            </div>
          )}

          {listLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-36 animate-pulse rounded-2xl border border-border bg-surface"
                />
              ))}
            </div>
          )}

          {!listLoading && campaigns.length === 0 && !listError && (
            <section className="rounded-2xl border border-dashed border-brand/30 bg-surface px-6 py-16 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                  />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-foreground">No campaigns yet</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
                Create a campaign to send one message to a contact list and track how many
                were sent or failed.
              </p>
            </section>
          )}

          <div className="space-y-3">
            {campaigns.map((item) => {
              const progress = campaignProgress(item);
              const resumable = canResumeCampaign(item);
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-border bg-surface shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => void openCampaign(item.id)}
                    className="w-full px-4 py-4 text-left sm:px-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-foreground">
                          {item.name}
                        </h2>
                        <p className="mt-0.5 truncate text-sm text-zinc-500">{item.message}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">
                      {formatWhen(item.createdAt)}
                      {item.createdByName ? ` · ${item.createdByName}` : ""}
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <Count label="Sent" value={item.sent} tone="good" />
                      <Count label="Failed" value={item.failed} tone={item.failed > 0 ? "bad" : "muted"} />
                      <Count label="Remaining" value={item.pending} tone={item.pending > 0 ? "wait" : "muted"} />
                    </div>
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                        <span>
                          {item.sent + item.failed} of {item.total} processed
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <ProgressBar value={progress} />
                    </div>
                  </button>
                  {(resumable || item.status === "sending") && (
                    <div className="flex gap-2 border-t border-border px-4 py-3 sm:px-5">
                      {item.status === "sending" ? (
                        <button
                          type="button"
                          onClick={() => void handlePause(item.id)}
                          disabled={actionBusy}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openCampaign(item.id, true)}
                          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void openCampaign(item.id)}
                        className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-brand-light"
                      >
                        View
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {view === "create" && (
        <>
          <CampaignsBackButton onClick={() => setView("list")} />

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand">
              Step 1
            </h2>
            <p className="mb-4 text-base font-medium text-foreground">Name the campaign</p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="April follow-up"
              maxLength={80}
              autoFocus
              className={inputClass}
            />
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand">
              Step 2
            </h2>
            <p className="mb-4 text-base font-medium text-foreground">Import contacts</p>
            <div
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
                dragOver
                  ? "border-brand bg-brand-light"
                  : "border-brand/30 bg-brand-muted/50 hover:border-brand hover:bg-brand-light"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void loadContacts(file);
              }}
            >
              <p className="text-sm font-medium text-foreground">
                {fileName ? fileName : "Click or drop a CSV or Excel file"}
              </p>
              <p className="mt-1 text-center text-xs text-zinc-500">
                Names in the first column, phone numbers in the second (.csv, .xlsx, .xls)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {contacts.length > 0 && (
              <div className="mt-4 rounded-xl bg-brand-muted p-4">
                <p className="mb-2 text-sm font-medium text-brand">
                  {contacts.length} contact{contacts.length === 1 ? "" : "s"} loaded
                </p>
                <ul className="max-h-36 space-y-1 overflow-y-auto text-sm text-zinc-600">
                  {contacts.map((contact, index) => (
                    <li key={`${contact.phone}-${index}`}>
                      {contact.name ? (
                        <>
                          <span className="font-medium text-foreground">{contact.name}</span>
                          <span className="font-mono text-zinc-500">
                            {" "}
                            {formatPhoneDisplay(contact.phone)}
                          </span>
                        </>
                      ) : (
                        <span className="font-mono">{formatPhoneDisplay(contact.phone)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand">
              Step 3
            </h2>
            <p className="mb-4 text-base font-medium text-foreground">Write the message</p>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Type the SMS every contact in this campaign will receive..."
              rows={5}
              maxLength={1600}
              className={`${inputClass} resize-none`}
            />
            <p className="mt-2 text-xs text-zinc-400">
              {message.length} characters
              {message.length > 0 &&
                ` · about ${sms.segments} ${sms.encoding} segment${sms.segments === 1 ? "" : "s"}`}
            </p>
          </section>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={starting || !name.trim() || !message.trim() || contacts.length === 0}
              className="flex-1 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting
                ? "Starting campaign..."
                : `Start campaign · ${contacts.length || 0} contact${contacts.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={handleClearForm}
              disabled={starting}
              className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-brand-light"
            >
              Clear
            </button>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            Invalid numbers are marked failed and the rest of the campaign keeps going. If
            sending stops early, open the campaign and resume — contacts already sent are
            skipped.
          </p>
        </>
      )}

      {view === "detail" && (
        <>
          <CampaignsBackButton onClick={handleBack} />

          {detailLoading && !campaign && (
            <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
          )}

          {campaign && (
            <CampaignDetail
              campaign={campaign}
              failures={failures}
              activity={activity}
              activityFilter={activityFilter}
              onFilter={setActivityFilter}
              dispatching={dispatching && runningId === campaign.id}
              sending={campaign.status === "sending" || runningId === campaign.id}
              actionBusy={actionBusy}
              notice={notice}
              error={error}
              onPause={() => void handlePause(campaign.id)}
              onResume={() => void openCampaign(campaign.id, true)}
              onRetry={() => void handleRetry(campaign.id)}
            />
          )}

          {!detailLoading && !campaign && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "wait" | "muted";
}) {
  const toneClass = {
    good: "text-emerald-600",
    bad: "text-red-600",
    wait: "text-amber-700",
    muted: "text-foreground",
  }[tone];

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function CampaignDetail({
  campaign,
  failures,
  activity,
  activityFilter,
  onFilter,
  dispatching,
  sending,
  actionBusy,
  notice,
  error,
  onPause,
  onResume,
  onRetry,
}: {
  campaign: CampaignSummary;
  failures: RecipientView[];
  activity: RecipientView[];
  activityFilter: ActivityFilter;
  onFilter: (filter: ActivityFilter) => void;
  dispatching: boolean;
  sending: boolean;
  actionBusy: boolean;
  notice: string | null;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const progress = campaignProgress(campaign);
  const resumable = canResumeCampaign(campaign) && !sending;
  const latest = activity[0];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-foreground">{campaign.name}</h2>
            <p className="mt-1 text-xs text-zinc-400">
              {formatWhen(campaign.createdAt)}
              {campaign.createdByName ? ` · ${campaign.createdByName}` : ""}
              {campaign.sourceFileName ? ` · ${campaign.sourceFileName}` : ""}
            </p>
          </div>
          <StatusBadge status={sending && campaign.status !== "completed" ? "sending" : campaign.status} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Total</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{campaign.total}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Sent</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{campaign.sent}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Failed</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${campaign.failed > 0 ? "text-red-600" : "text-foreground"}`}>
              {campaign.failed}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Remaining</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${campaign.pending > 0 ? "text-amber-700" : "text-foreground"}`}>
              {campaign.pending}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{progress}% complete</span>
            <span className="text-zinc-500">
              {campaign.sent + campaign.failed} / {campaign.total}
            </span>
          </div>
          <ProgressBar value={progress} />
          <p className="mt-2 text-sm text-zinc-500">
            {dispatching
              ? "Sending the next batch…"
              : sending
                ? "Sending in progress"
                : campaign.status === "completed"
                  ? campaign.failed > 0
                    ? "Finished with some messages that did not send"
                    : "Every contact in this campaign was processed"
                  : campaign.pending > 0
                    ? `${campaign.pending} contact${campaign.pending === 1 ? "" : "s"} still waiting`
                    : "Waiting to start"}
            {latest && !dispatching && (
              <>
                {" "}
                · Last {latest.status === "sent" ? "sent" : "failed"}:{" "}
                {latest.name ? `${latest.name} · ` : ""}
                {formatPhoneDisplay(latest.phone)}
              </>
            )}
          </p>
        </div>

        {campaign.skippedCount > 0 && (
          <p className="mt-3 text-xs text-zinc-400">
            {campaign.skippedCount} row{campaign.skippedCount === 1 ? "" : "s"} skipped while
            importing (duplicates or invalid numbers).
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {sending && (
            <button
              type="button"
              onClick={onPause}
              disabled={actionBusy}
              className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              Pause campaign
            </button>
          )}
          {resumable && (
            <button
              type="button"
              onClick={onResume}
              disabled={actionBusy}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              Resume campaign
            </button>
          )}
          {campaign.failed > 0 && !sending && (
            <button
              type="button"
              onClick={onRetry}
              disabled={actionBusy}
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-brand-light disabled:opacity-50"
            >
              Retry {campaign.failed} failed
            </button>
          )}
        </div>
        {sending && (
          <p className="mt-2 text-xs text-zinc-400">
            Pause takes effect after the current batch, up to 5 messages.
          </p>
        )}
      </section>

      {(notice || error || (campaign.lastError && campaign.status === "interrupted")) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {error || notice || campaign.lastError}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold text-foreground">Message</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-brand-muted px-4 py-3 text-sm text-foreground">
          {campaign.message}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Delivery</h3>
          <div className="flex rounded-xl bg-brand-muted p-1 text-xs font-medium">
            {(
              [
                ["all", "All"],
                ["sent", `Sent ${campaign.sent}`],
                ["failed", `Failed ${campaign.failed}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onFilter(id)}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  activityFilter === id
                    ? "bg-white text-foreground shadow-sm"
                    : "text-zinc-500 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activity.length === 0 ? (
          <p className="rounded-xl bg-background px-4 py-8 text-center text-sm text-zinc-500">
            {campaign.status === "draft"
              ? "Start the campaign to see each number as it sends."
              : "No messages in this view yet."}
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {activity.map((item) => (
              <div
                key={`${item.phone}-${item.status}`}
                className={`rounded-xl px-4 py-3 text-sm ${
                  item.status === "failed" ? "bg-red-50" : "bg-emerald-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {item.name && (
                      <p className="truncate font-medium text-foreground">{item.name}</p>
                    )}
                    <p className="font-mono text-foreground">{formatPhoneDisplay(item.phone)}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      item.status === "failed" ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {item.status === "failed" ? "Failed" : "Sent"}
                  </span>
                </div>
                {item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
              </div>
            ))}
          </div>
        )}
        {activityFilter === "failed" && campaign.failed > failures.length && failures.length > 0 && (
          <p className="mt-3 text-xs text-zinc-400">
            Showing the latest {failures.length} of {campaign.failed} failed messages.
          </p>
        )}
        {activityFilter === "sent" && campaign.sent > activity.length && (
          <p className="mt-3 text-xs text-zinc-400">
            Showing the latest {activity.length} sent messages.
          </p>
        )}
      </section>
    </div>
  );
}
