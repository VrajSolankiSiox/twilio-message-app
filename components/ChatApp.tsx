"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Conversation } from "@/lib/messages";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(phone: string): string {
  return phone.replace(/\D/g, "").slice(-2);
}

function addMessageToConversations(
  conversations: Conversation[],
  message: ChatMessage,
  contactPhone: string
): Conversation[] {
  const normalizedContact = normalizePhone(contactPhone);
  const existing = conversations.find(
    (c) => normalizePhone(c.phone) === normalizedContact
  );

  if (existing) {
    const alreadyExists = existing.messages.some((m) => m.sid === message.sid);
    if (alreadyExists) return conversations;

    return conversations
      .map((c) =>
        normalizePhone(c.phone) === normalizedContact
          ? {
              ...c,
              messages: [...c.messages, message],
              lastMessage: message.body || "(media)",
              lastMessageAt: message.dateCreated,
            }
          : c
      )
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime()
      );
  }

  return [
    {
      phone: normalizedContact,
      messages: [message],
      lastMessage: message.body || "(media)",
      lastMessageAt: message.dateCreated,
    },
    ...conversations,
  ];
}

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find(
    (c) => normalizePhone(c.phone) === normalizePhone(selectedPhone || "")
  );

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/twilio/messages", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load messages.");
        return;
      }

      setError(null);
      setConversations(data.conversations);

      setSelectedPhone((prev) =>
        prev ?? data.conversations[0]?.phone ?? null
      );
    } catch {
      setError("Network error while loading messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncAfterSend = useCallback(async () => {
    const delays = [1500, 3000, 5000];
    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));
      await fetchConversations();
    }
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhone || !replyText.trim() || sending) return;

    const text = replyText.trim();
    setSending(true);
    setError(null);
    setReplyText("");

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          phoneNumbers: [selectedPhone],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setReplyText(text);
        setError(data.error || "Failed to send message.");
        return;
      }

      const result = data.results?.[0];
      if (result && !result.success) {
        setReplyText(text);
        setError(result.error || "Failed to send message.");
        return;
      }

      if (result?.success) {
        const newMessage: ChatMessage = {
          sid: result.sid,
          from: result.from,
          to: result.to,
          body: result.body,
          dateCreated: result.dateCreated,
          direction: "outbound",
          status: result.status,
        };

        setConversations((prev) =>
          addMessageToConversations(prev, newMessage, result.to)
        );
        setSelectedPhone(normalizePhone(result.to));

        syncAfterSend();
      }
    } catch {
      setReplyText(text);
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-[36rem] flex-col md:h-[32rem] md:flex-row">
        {/* Conversation list */}
        <div className="flex w-full flex-col border-b border-zinc-200 md:w-72 md:border-b-0 md:border-r dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Conversations
            </h2>
            <p className="text-xs text-zinc-500">Auto-refreshes every 5s</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && conversations.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                Loading...
              </p>
            )}

            {!loading && conversations.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                No conversations yet
              </p>
            )}

            {conversations.map((conv) => (
              <button
                key={conv.phone}
                onClick={() => setSelectedPhone(conv.phone)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                  normalizePhone(selectedPhone || "") ===
                  normalizePhone(conv.phone)
                    ? "bg-red-50 dark:bg-red-950/30"
                    : ""
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                  {getInitials(conv.phone)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatPhoneDisplay(conv.phone)}
                    </p>
                    <time className="shrink-0 text-[10px] text-zinc-500">
                      {formatTime(conv.lastMessageAt)}
                    </time>
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    {conv.lastMessage}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat thread */}
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedConversation ? (
            <>
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatPhoneDisplay(selectedConversation.phone)}
                </p>
                <p className="text-xs text-zinc-500">
                  {selectedConversation.messages.length} message
                  {selectedConversation.messages.length !== 1 && "s"}
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {selectedConversation.messages.map((msg) => {
                  const isOutbound = msg.direction === "outbound";

                  return (
                    <div
                      key={msg.sid}
                      className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          isOutbound
                            ? "rounded-br-md bg-red-600 text-white"
                            : "rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        }`}
                      >
                        {!isOutbound && (
                          <p className="mb-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                            {formatPhoneDisplay(msg.from)}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {msg.body ||
                            (parseInt(msg.numMedia || "0") > 0
                              ? `[${msg.numMedia} media]`
                              : "")}
                        </p>
                        <p
                          className={`mt-1 text-[10px] ${
                            isOutbound
                              ? "text-red-200"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {formatTime(msg.dateCreated)}
                          {isOutbound && msg.status && ` · ${msg.status}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSendReply}
                className="border-t border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Message ${formatPhoneDisplay(selectedConversation.phone)}...`}
                    disabled={sending}
                    className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? (
                      <svg
                        className="h-5 w-5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-zinc-500">
              <svg
                className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-600"
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
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}
    </section>
  );
}
