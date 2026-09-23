"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CampaignPageHeader, {
  CreateCampaignSteps,
} from "@/components/campaign/CampaignPageHeader";
import {
  CAMPAIGN_ROUTES,
  campaignDetailIdFromPath,
  campaignViewFromPath,
} from "@/lib/campaign-navigation";
import {
  CAMPAIGN_CONTACT_PREVIEW_PAGE_SIZE,
  CAMPAIGN_DELIVERY_PAGE_SIZE,
  CAMPAIGN_LIST_PAGE_SIZE,
  campaignProgress,
  canResumeCampaign,
  estimateSms,
  type CampaignCostSummary,
  type CampaignStatus,
  type CampaignSummary,
  type RecipientView,
  type TickStopReason,
} from "@/lib/campaigns";
import { parseContactsFromFile, type CsvContact } from "@/lib/csv";
import { formatMoney } from "@/lib/twilio-cost";
import { formatPhoneDisplay } from "@/lib/phone";

const inputClass =
  "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

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

function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
  disabled,
  noun = "items",
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  noun?: string;
}) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-zinc-500">
        {total} {noun} · Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
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

function SkipAlreadySentCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-opacity ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-brand/25"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-2 focus:ring-brand/20"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          Skip contacts who already received this message
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
          {checked
            ? "Only remaining contacts are messaged when you resume."
            : "Follow-up mode: contacts who were already sent will receive this message again."}
        </span>
      </span>
    </label>
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = campaignViewFromPath(pathname);
  const routeDetailId = campaignDetailIdFromPath(pathname);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const runTokenRef = useRef(0);
  const pauseRef = useRef(false);
  const runnerRef = useRef(false);
  const runningIdRef = useRef<string | null>(null);
  const detailIdRef = useRef<string | null>(null);
  const campaignRef = useRef<CampaignSummary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [deliveryItems, setDeliveryItems] = useState<RecipientView[]>([]);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryTotalPages, setDeliveryTotalPages] = useState(1);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [contactPage, setContactPage] = useState(1);
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
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [campaignCost, setCampaignCost] = useState<CampaignCostSummary | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costSyncing, setCostSyncing] = useState(false);
  const activityFilterRef = useRef<ActivityFilter>("all");

  const loadDelivery = useCallback(
    async (id: string, page: number, status: ActivityFilter) => {
      setDeliveryLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${id}/recipients?page=${page}&limit=${CAMPAIGN_DELIVERY_PAGE_SIZE}&status=${status}`
        );
        const data = await res.json();
        if (!res.ok || detailIdRef.current !== id) return;
        setDeliveryItems(data.items ?? []);
        setDeliveryPage(data.page ?? page);
        setDeliveryTotalPages(data.totalPages ?? 1);
        setDeliveryTotal(data.total ?? 0);
      } catch {
        // Delivery list refreshes on the next poll or page change.
      } finally {
        setDeliveryLoading(false);
      }
    },
    []
  );

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

      if (processed.length > 0 && detailIdRef.current === next.id) {
        void loadDelivery(next.id, 1, activityFilterRef.current);
      }
    },
    [loadDelivery]
  );

  const loadList = useCallback(async (page: number, silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const res = await fetch(
        `/api/campaigns?page=${page}&limit=${CAMPAIGN_LIST_PAGE_SIZE}`
      );
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || "Failed to load campaigns");
        return;
      }
      setCampaigns(data.items ?? []);
      setListPage(data.page ?? page);
      setListTotalPages(data.totalPages ?? 1);
      setListTotal(data.total ?? 0);
      setListError(null);
    } catch {
      setListError("Failed to load campaigns");
    } finally {
      if (!silent) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    activityFilterRef.current = activityFilter;
  }, [activityFilter]);

  useEffect(() => {
    if (view !== "list") return;
    void loadList(listPage, false);
  }, [view, listPage, loadList]);

  const hasLiveSend = campaigns.some((item) => item.status === "sending");

  useEffect(() => {
    if (view !== "list" || !hasLiveSend) return;
    const timer = setInterval(() => {
      void loadList(listPage, true);
    }, 3000);
    return () => clearInterval(timer);
  }, [view, hasLiveSend, listPage, loadList]);

  useEffect(() => {
    if (view !== "detail" || !campaign) return;
    void loadDelivery(campaign.id, deliveryPage, activityFilter);
  }, [view, campaign, deliveryPage, activityFilter, loadDelivery]);

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
        }
        applyUpdate(data.campaign);
      } catch {
        // The next poll or tick will refresh the counts.
      }
    },
    [applyUpdate]
  );

  const loadCampaignCost = useCallback(async (id: string, sync = false) => {
    if (sync) setCostSyncing(true);
    else setCostLoading(true);
    try {
      if (sync) {
        await fetch(`/api/campaigns/${id}/cost`, { method: "POST" });
      }
      const res = await fetch(`/api/campaigns/${id}/cost`);
      const data = await res.json();
      if (res.ok && data.cost) setCampaignCost(data.cost);
    } catch {
      // Cost is optional metadata on the detail view.
    } finally {
      setCostLoading(false);
      setCostSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "detail" || !routeDetailId) {
      setCampaignCost(null);
      return;
    }
    void loadCampaignCost(routeDetailId);
  }, [view, routeDetailId, loadCampaignCost]);

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
    async (
      id: string,
      resume: boolean,
      skipSent: boolean,
      enableFollowUp = false
    ) => {
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
      let firstTick = true;

      try {
        while (runTokenRef.current === token && !pauseRef.current) {
          setDispatching(true);
          let response: Response;
          try {
            response = await fetch(`/api/campaigns/${id}/tick`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                resume: allowResume,
                skipAlreadySent: skipSent,
                allowResendToSent:
                  enableFollowUp && !skipSent && firstTick,
              }),
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
          firstTick = false;
          const data = await response.json().catch(() => null);
          if (runTokenRef.current !== token) return;

          if (data?.campaign) {
            applyUpdate(data.campaign, data.processed ?? []);
            if (detailIdRef.current === id && (data.processed?.length ?? 0) > 0) {
              void loadCampaignCost(id);
            }
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
    [applyUpdate, loadCampaignCost, refreshDetail]
  );

  const goToCampaign = useCallback(
    (id: string, resume = false) => {
      const path = resume
        ? `${CAMPAIGN_ROUTES.detail(id)}?resume=1`
        : CAMPAIGN_ROUTES.detail(id);
      router.push(path);
    },
    [router]
  );

  const goToCreate = useCallback(() => {
    setFormError(null);
    router.push(CAMPAIGN_ROUTES.new);
  }, [router]);

  useEffect(() => {
    if (view !== "detail" || !routeDetailId) {
      if (view !== "detail") detailIdRef.current = null;
      return;
    }

    const id = routeDetailId;
    const resume = searchParams.get("resume") === "1";
    const alreadyLoaded = campaignRef.current?.id === id;

    detailIdRef.current = id;
    setActivityFilter("all");
    setDeliveryPage(1);
    setError(null);
    if (!resume) setNotice(null);

    if (!alreadyLoaded) {
      campaignRef.current = null;
      setCampaign(null);
      setDeliveryItems([]);
      setDetailLoading(true);
    }

    if (alreadyLoaded && !resume) {
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      if (!alreadyLoaded) {
        try {
          const res = await fetch(`/api/campaigns/${id}`);
          const data = await res.json();
          if (cancelled || detailIdRef.current !== id) return;
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
          }
          applyUpdate(data.campaign);
        } catch {
          if (!cancelled) setError("Network error. Please try again.");
          return;
        } finally {
          if (!cancelled) setDetailLoading(false);
        }
      }

      if (cancelled || !resume) return;

      router.replace(CAMPAIGN_ROUTES.detail(id));
      await runLoop(id, true, skipAlreadySent, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    view,
    routeDetailId,
    searchParams,
    applyUpdate,
    runLoop,
    skipAlreadySent,
    router,
  ]);

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
      setDeliveryPage(1);
      if (data.campaign) applyUpdate(data.campaign);
      setNotice(null);
      await runLoop(id, true, true, false);
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
    setContactPage(1);

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
      setDeliveryItems([]);
      setDeliveryPage(1);
      setActivityFilter("all");
      setNotice(null);
      setError(null);
      applyUpdate(data.campaign);
      handleClearForm();
      router.push(CAMPAIGN_ROUTES.detail(data.campaign.id));
      await runLoop(data.campaign.id, false, skipAlreadySent, false);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const sms = estimateSms(message);
  const contactPreviewPages = Math.max(
    1,
    Math.ceil(contacts.length / CAMPAIGN_CONTACT_PREVIEW_PAGE_SIZE)
  );
  const contactPreviewStart = (contactPage - 1) * CAMPAIGN_CONTACT_PREVIEW_PAGE_SIZE;
  const contactPreview = contacts.slice(
    contactPreviewStart,
    contactPreviewStart + CAMPAIGN_CONTACT_PREVIEW_PAGE_SIZE
  );

  const detailSending =
    campaign &&
    (campaign.status === "sending" || runningId === campaign.id);

  return (
    <div className="space-y-4 sm:space-y-6">
      <CampaignPageHeader
        view={view}
        listTotal={view === "list" ? listTotal : undefined}
        detailTitle={campaign?.name}
        detailLoading={view === "detail" && detailLoading && !campaign}
        detailAccessory={
          campaign ? (
            <StatusBadge
              status={
                detailSending && campaign.status !== "completed"
                  ? "sending"
                  : campaign.status
              }
            />
          ) : null
        }
        onNewCampaign={view === "list" ? goToCreate : undefined}
      />

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

          {listError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{listError}</p>
              <button
                type="button"
                onClick={() => void loadList(listPage)}
                className="mt-2 text-sm font-medium underline"
              >
                Try again
              </button>
            </div>
          )}

          {listLoading && (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="divide-y divide-border">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-24 animate-pulse bg-brand-muted/20" />
                ))}
              </div>
            </section>
          )}

          {!listLoading && listTotal === 0 && !listError && (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="px-6 py-16 text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand">
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
                <p className="mt-1 max-w-md text-sm text-zinc-500">
                  Create your first campaign to message a contact list and track delivery.
                </p>
                <button
                  type="button"
                  onClick={goToCreate}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  Create campaign
                </button>
              </div>
            </section>
          )}

          {!listLoading && listTotal > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="hidden grid-cols-[1fr_7rem_5.5rem_4.5rem_2rem] gap-3 border-b border-border bg-brand-muted/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 sm:grid">
                <span>Campaign</span>
                <span>Progress</span>
                <span className="text-right">Sent</span>
                <span className="text-right">Failed</span>
                <span aria-hidden />
              </div>
              <ul className="divide-y divide-border">
                {campaigns.map((item) => {
                  const progress = campaignProgress(item);
                  const resumable = canResumeCampaign(item, true);
                  const showActions = resumable || item.status === "sending";
                  return (
                    <li key={item.id} className="group">
                      <div className="flex flex-col sm:flex-row sm:items-stretch">
                        <button
                          type="button"
                          onClick={() => goToCampaign(item.id)}
                          className="grid min-w-0 flex-1 gap-3 px-4 py-4 text-left transition-colors hover:bg-brand-muted/25 sm:grid-cols-[1fr_7rem_5.5rem_4.5rem_2rem] sm:items-center sm:gap-3 sm:px-5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {item.name}
                              </span>
                              <StatusBadge status={item.status} />
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">
                              {item.message}
                            </p>
                            <p className="mt-1 text-xs text-zinc-400">
                              {formatWhen(item.createdAt)}
                              {item.createdByName ? ` · ${item.createdByName}` : ""}
                            </p>
                          </div>
                          <div className="hidden sm:block">
                            <div className="mb-1 flex justify-between text-[10px] tabular-nums text-zinc-500">
                              <span>{progress}%</span>
                              <span>
                                {item.sent + item.failed}/{item.total}
                              </span>
                            </div>
                            <ProgressBar value={progress} />
                          </div>
                          <p className="hidden text-right text-sm font-semibold tabular-nums text-emerald-600 sm:block">
                            {item.sent}
                          </p>
                          <p
                            className={`hidden text-right text-sm font-semibold tabular-nums sm:block ${
                              item.failed > 0 ? "text-red-600" : "text-zinc-400"
                            }`}
                          >
                            {item.failed}
                          </p>
                          <span
                            className="hidden items-center justify-end text-zinc-300 group-hover:text-brand sm:flex"
                            aria-hidden
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                          <div className="flex gap-4 border-t border-border pt-3 sm:hidden">
                            <Count label="Sent" value={item.sent} tone="good" />
                            <Count label="Failed" value={item.failed} tone={item.failed > 0 ? "bad" : "muted"} />
                            <Count label="Left" value={item.pending} tone={item.pending > 0 ? "wait" : "muted"} />
                          </div>
                          <div className="sm:hidden">
                            <ProgressBar value={progress} />
                          </div>
                        </button>
                        {showActions && (
                          <div className="flex shrink-0 gap-2 border-t border-border bg-brand-muted/20 px-4 py-3 sm:w-44 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:px-3">
                            {item.status === "sending" ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handlePause(item.id);
                                }}
                                disabled={actionBusy}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                              >
                                Pause
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  goToCampaign(item.id, true);
                                }}
                                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover"
                              >
                                Resume
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                goToCampaign(item.id);
                              }}
                              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
                            >
                              Open
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-border px-5">
                <PaginationBar
                  page={listPage}
                  totalPages={listTotalPages}
                  total={listTotal}
                  onPageChange={setListPage}
                  disabled={listLoading}
                  noun="campaigns"
                />
              </div>
            </section>
          )}
        </>
      )}

      {view === "create" && (
        <>
          <CreateCampaignSteps />

          <div className="space-y-6 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <section>
            <h2 className="text-sm font-semibold text-foreground">Campaign name</h2>
            <p className="mb-3 mt-0.5 text-xs text-zinc-500">
              A short label you will recognize in the list later.
            </p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="April follow-up"
              maxLength={80}
              autoFocus
              className={inputClass}
            />
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground">Audience</h2>
            <p className="mb-3 mt-0.5 text-xs text-zinc-500">
              Upload a spreadsheet with names (optional) and phone numbers.
            </p>
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
                  {contactPreview.map((contact, index) => (
                    <li key={`${contact.phone}-${contactPreviewStart + index}`}>
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
                <PaginationBar
                  page={contactPage}
                  totalPages={contactPreviewPages}
                  total={contacts.length}
                  onPageChange={setContactPage}
                  noun="contacts"
                />
              </div>
            )}
          </section>

          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground">Message</h2>
            <p className="mb-3 mt-0.5 text-xs text-zinc-500">
              This SMS is sent to every contact in the file.
            </p>
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

          <div className="border-t border-border pt-6">
            <SkipAlreadySentCheckbox
              checked={skipAlreadySent}
              onChange={setSkipAlreadySent}
              disabled={starting}
            />
          </div>
          </div>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => router.push(CAMPAIGN_ROUTES.list)}
              disabled={starting}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleClearForm}
                disabled={starting}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-brand-light disabled:opacity-50"
              >
                Clear form
              </button>
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={starting || !name.trim() || !message.trim() || contacts.length === 0}
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting
                  ? "Starting…"
                  : `Start · ${contacts.length || 0} contact${contacts.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            Invalid numbers are marked failed and the rest of the campaign keeps going. When
            the skip box is checked, resume only messages contacts who have not been sent yet.
            Uncheck it to send follow-ups to everyone who already received this campaign.
          </p>
        </>
      )}

      {view === "detail" && (
        <>
          {detailLoading && !campaign && (
            <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
          )}

          {campaign && (
            <CampaignDetail
              campaign={campaign}
              cost={campaignCost}
              costLoading={costLoading}
              costSyncing={costSyncing}
              onRefreshCost={() => void loadCampaignCost(campaign.id, true)}
              deliveryItems={deliveryItems}
              deliveryPage={deliveryPage}
              deliveryTotalPages={deliveryTotalPages}
              deliveryTotal={deliveryTotal}
              deliveryLoading={deliveryLoading}
              activityFilter={activityFilter}
              onFilter={(filter) => {
                setActivityFilter(filter);
                setDeliveryPage(1);
              }}
              onDeliveryPageChange={setDeliveryPage}
              dispatching={dispatching && runningId === campaign.id}
              sending={campaign.status === "sending" || runningId === campaign.id}
              actionBusy={actionBusy}
              notice={notice}
              error={error}
              onPause={() => void handlePause(campaign.id)}
              skipAlreadySent={skipAlreadySent}
              onSkipAlreadySentChange={setSkipAlreadySent}
              onResume={() => void runLoop(campaign.id, true, skipAlreadySent, true)}
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
  cost,
  costLoading,
  costSyncing,
  onRefreshCost,
  deliveryItems,
  deliveryPage,
  deliveryTotalPages,
  deliveryTotal,
  deliveryLoading,
  activityFilter,
  onFilter,
  onDeliveryPageChange,
  dispatching,
  sending,
  actionBusy,
  notice,
  error,
  onPause,
  onResume,
  onRetry,
  skipAlreadySent,
  onSkipAlreadySentChange,
}: {
  campaign: CampaignSummary;
  cost: CampaignCostSummary | null;
  costLoading: boolean;
  costSyncing: boolean;
  onRefreshCost: () => void;
  deliveryItems: RecipientView[];
  deliveryPage: number;
  deliveryTotalPages: number;
  deliveryTotal: number;
  deliveryLoading: boolean;
  activityFilter: ActivityFilter;
  onFilter: (filter: ActivityFilter) => void;
  onDeliveryPageChange: (page: number) => void;
  dispatching: boolean;
  sending: boolean;
  actionBusy: boolean;
  notice: string | null;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  skipAlreadySent: boolean;
  onSkipAlreadySentChange: (checked: boolean) => void;
}) {
  const progress = campaignProgress(campaign);
  const resumable = canResumeCampaign(campaign, skipAlreadySent) && !sending;
  const latest = deliveryItems[0];

  const displayCost =
    cost && cost.estimatedCostUsd != null && cost.unpricedSentCount > 0
      ? cost.estimatedCostUsd
      : cost?.totalCostUsd ?? 0;
  const costIsEstimate =
    Boolean(cost && cost.unpricedSentCount > 0 && cost.pricedSentCount > 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Campaign cost
            </p>
            {costLoading && !cost ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-brand-muted" />
            ) : (
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {cost && (cost.totalCostUsd > 0 || cost.sentCount > 0)
                  ? formatMoney(displayCost, cost.currency)
                  : "—"}
                {costIsEstimate && (
                  <span className="ml-2 text-xs font-normal text-zinc-500">est.</span>
                )}
              </p>
            )}
            {cost && (
              <p className="mt-1 text-xs text-zinc-500">
                {cost.pricedSentCount} priced
                {cost.unpricedSentCount > 0
                  ? ` · ${cost.unpricedSentCount} pending Twilio price`
                  : ""}
                {cost.totalSegments > 0 ? ` · ${cost.totalSegments} segments` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRefreshCost}
            disabled={costSyncing}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-brand-light disabled:opacity-50"
          >
            {costSyncing ? "Syncing…" : "Refresh from Twilio"}
          </button>
        </div>

        <p className="mt-4 text-xs text-zinc-400">
          {formatWhen(campaign.createdAt)}
          {campaign.createdByName ? ` · ${campaign.createdByName}` : ""}
          {campaign.sourceFileName ? ` · ${campaign.sourceFileName}` : ""}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
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

        {!sending && (resumable || campaign.status === "completed") && (
          <div className="mt-5">
            <SkipAlreadySentCheckbox
              checked={skipAlreadySent}
              onChange={onSkipAlreadySentChange}
              disabled={actionBusy}
            />
          </div>
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Delivery log</h3>
            <p className="mt-0.5 text-xs text-zinc-500">Per-contact send results</p>
          </div>
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

        {deliveryLoading && deliveryItems.length === 0 ? (
          <div className="h-24 animate-pulse rounded-xl bg-background" />
        ) : deliveryItems.length === 0 ? (
          <p className="rounded-xl bg-background px-4 py-8 text-center text-sm text-zinc-500">
            {campaign.status === "draft"
              ? "Start the campaign to see each number as it sends."
              : "No messages in this view yet."}
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {deliveryItems.map((item) => (
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
                  <div className="shrink-0 text-right">
                    <span
                      className={`text-xs font-medium ${
                        item.status === "failed" ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {item.status === "failed" ? "Failed" : "Sent"}
                    </span>
                    {item.priceUsd != null && item.priceUsd > 0 && (
                      <p className="text-[10px] tabular-nums text-zinc-500">
                        {formatMoney(item.priceUsd, "USD")}
                      </p>
                    )}
                  </div>
                </div>
                {item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
              </div>
            ))}
          </div>
        )}
        <PaginationBar
          page={deliveryPage}
          totalPages={deliveryTotalPages}
          total={deliveryTotal}
          onPageChange={onDeliveryPageChange}
          disabled={deliveryLoading}
          noun="messages"
        />
      </section>
    </div>
  );
}
