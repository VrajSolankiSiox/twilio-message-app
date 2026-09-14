"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhoneDisplay } from "@/lib/phone";

interface IncomingMessage {
  sid: string;
  from: string;
  to: string;
  body: string;
  dateCreated: string;
  status: string;
  numMedia: string;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${time}`;

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReceivedMessages() {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/twilio/messages");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load messages.");
        return;
      }

      setError(null);
      setMessages(data.messages);
    } catch {
      setError("Network error while loading messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Received Messages
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Incoming SMS to your Twilio number
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchMessages();
          }}
          disabled={loading}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 py-12 dark:border-zinc-700">
          <svg
            className="mb-3 h-8 w-8 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-sm text-zinc-500">No messages received yet</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.sid}
              className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                    {formatPhoneDisplay(msg.from).replace(/\D/g, "").slice(-2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatPhoneDisplay(msg.from)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      To {formatPhoneDisplay(msg.to)}
                    </p>
                  </div>
                </div>
                <time className="shrink-0 text-xs text-zinc-500">
                  {formatTimestamp(msg.dateCreated)}
                </time>
              </div>
              <p className="whitespace-pre-wrap pl-11 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {msg.body || (
                  <span className="italic text-zinc-400">
                    {parseInt(msg.numMedia) > 0
                      ? `[${msg.numMedia} media attachment${parseInt(msg.numMedia) > 1 ? "s" : ""}]`
                      : "(empty message)"}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
