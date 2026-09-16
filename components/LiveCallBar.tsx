"use client";

import { formatPhoneDisplay } from "@/lib/phone";
import type { CallState } from "@/hooks/useTwilioVoice";

interface LiveCallBarProps {
  callState: CallState;
  activeNumber: string | null;
  isMuted: boolean;
  error: string | null;
  fromNumber: string | null;
  onHangUp: () => void;
  onToggleMute: () => void;
}

function statusLabel(state: CallState): string {
  switch (state) {
    case "initializing":
      return "Initializing microphone...";
    case "ready":
      return "Ready to call";
    case "connecting":
      return "Connecting...";
    case "ringing":
      return "Ringing...";
    case "connected":
      return "Connected — speak now";
    case "disconnecting":
      return "Ending call...";
    case "error":
      return "Call error";
    default:
      return "";
  }
}

export default function LiveCallBar({
  callState,
  activeNumber,
  isMuted,
  error,
  fromNumber,
  onHangUp,
  onToggleMute,
}: LiveCallBarProps) {
  const inCall =
    callState === "connecting" ||
    callState === "ringing" ||
    callState === "connected" ||
    callState === "disconnecting";

  if (!inCall && !error) return null;

  return (
    <div className="shrink-0 border-t border-brand/20 bg-brand-muted/40 px-4 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {activeNumber && (
            <p className="truncate text-sm font-semibold text-foreground">
              {formatPhoneDisplay(activeNumber)}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            {error || statusLabel(callState)}
            {fromNumber && !error && (
              <span className="ml-2 text-zinc-400">
                via {formatPhoneDisplay(fromNumber)}
              </span>
            )}
          </p>
        </div>

        {inCall && (
          <div className="flex shrink-0 items-center justify-end gap-2">
            {callState === "connected" && (
              <button
                type="button"
                onClick={onToggleMute}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  isMuted
                    ? "bg-zinc-200 text-zinc-700"
                    : "bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
            )}
            <button
              type="button"
              onClick={onHangUp}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              Hang up
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
