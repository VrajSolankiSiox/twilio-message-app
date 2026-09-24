"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import LiveCallBar from "@/components/LiveCallBar";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { APP_INPUT, APP_LABEL, APP_SECTION } from "@/lib/app-layout";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

interface CallRecord {
  sid: string;
  from: string;
  to: string;
  status: string;
  message: string;
  duration?: string;
  initiatedByName?: string;
  dateCreated: string;
}

interface CallPanelProps {
  prefillPhone?: string | null;
  currentUser: { id: string; fullName: string } | null;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "busy":
    case "failed":
    case "no-answer":
    case "canceled":
      return "bg-red-100 text-red-700";
    case "ringing":
    case "in-progress":
    case "answered":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-brand-light text-brand";
  }
}

export default function CallPanel({ prefillPhone, currentUser }: CallPanelProps) {
  const voice = useVoiceCall();
  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (prefillPhone) setPhone(prefillPhone);
  }, [prefillPhone]);

  useEffect(() => {
    voice.initialize();
  }, [voice.initialize]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/call", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setCalls(data.calls);
    } catch {
      /* ignore */
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 8000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const handleCall = async () => {
    if (!phone.trim()) {
      voice.setError("Enter a phone number.");
      return;
    }
    if (!currentUser) {
      voice.setError("You must be logged in to place calls.");
      return;
    }

    voice.setError(null);
    await voice.startCall({
      to: normalizePhone(phone.trim()),
      user: { userId: currentUser.id, fullName: currentUser.fullName },
    });
    fetchHistory();
  };

  const isBusy = voice.isInCall || voice.callState === "initializing";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:gap-4">
        <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-[420px] lg:pr-1">
          <section className={APP_SECTION}>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand">
              Live Call
            </h2>
            <p className="mb-4 text-xs text-zinc-500">
              Talk to the customer in real time through your browser microphone
            </p>

            <div className="space-y-3">
              <div>
                <label className={APP_LABEL}>Phone number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (470) 627-5656"
                  disabled={voice.isInCall}
                  className={APP_INPUT}
                />
              </div>

              <button
                onClick={handleCall}
                disabled={
                  isBusy ||
                  !phone.trim() ||
                  !currentUser ||
                  Boolean(voice.voiceUnavailableHint)
                }
                title={
                  voice.voiceUnavailableHint ??
                  "Place a live call from your browser"
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                {voice.callState === "initializing"
                  ? "Setting up..."
                  : voice.isInCall
                    ? "Call in progress"
                    : "Start Call"}
              </button>

              <p className="text-xs text-zinc-400">
                Your browser will ask for microphone permission on the first call.
              </p>
            </div>
          </section>
        </div>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand">
              Call History
            </h2>
            <p className="mt-1 text-xs text-zinc-500">Recent live outbound calls</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingHistory && (
              <div className="flex justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            )}

            {!loadingHistory && calls.length === 0 && (
              <p className="px-4 py-16 text-left text-sm text-zinc-400 sm:px-5">
                No calls placed yet
              </p>
            )}

            {calls.map((call) => (
              <div
                key={call.sid}
                className="flex items-start gap-3 border-b border-border/60 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {formatPhoneDisplay(call.to)}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusColor(call.status)}`}
                    >
                      {call.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                    <span>{new Date(call.dateCreated).toLocaleString()}</span>
                    {call.duration && <span>{call.duration}s</span>}
                    {call.initiatedByName && <span>by {call.initiatedByName}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <LiveCallBar
        callState={voice.callState}
        activeNumber={voice.activeNumber}
        isMuted={voice.isMuted}
        error={voice.error}
        fromNumber={voice.fromNumber}
        onHangUp={voice.hangUp}
        onToggleMute={voice.toggleMute}
      />
    </div>
  );
}
