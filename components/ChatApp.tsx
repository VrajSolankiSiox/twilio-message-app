"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList from "@/components/ConversationList";
import LiveCallBar from "@/components/LiveCallBar";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { ChatMessage, Conversation } from "@/lib/messages";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

interface CurrentUser {
  id: string;
  role: "admin" | "employee";
  fullName: string;
}

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

function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
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
              isBlank: false,
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
      assignedToUserId: null,
      assignedToName: null,
      assignedToEmail: null,
      assignedAt: null,
      isStop: false,
      isBlank: false,
    },
    ...conversations,
  ];
}

export default function ChatApp() {
  const voice = useVoiceCall();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStop, setShowStop] = useState(false);
  const [showBlank, setShowBlank] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    voice.initialize();
  }, [voice.initialize]);

  const selectedConversation = conversations.find(
    (c) => normalizePhone(c.phone) === normalizePhone(selectedPhone || "")
  );

  const canReply =
    selectedConversation &&
    currentUser &&
    (currentUser.role === "admin" ||
      !selectedConversation.assignedToUserId ||
      selectedConversation.assignedToUserId === currentUser.id);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 100;
  };

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (showStop) params.set("showStop", "true");
      if (showBlank) params.set("showBlank", "true");

      const res = await fetch(`/api/twilio/messages?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load messages.");
        return;
      }

      setError(null);
      setConversations(data.conversations);
      if (data.user) setCurrentUser(data.user);

      setSelectedPhone((prev) => {
        if (
          prev &&
          data.conversations.some(
            (c: Conversation) => normalizePhone(c.phone) === normalizePhone(prev)
          )
        ) {
          return prev;
        }
        const isMobileView = window.matchMedia("(max-width: 1023px)").matches;
        if (isMobileView) return null;
        return data.conversations[0]?.phone ?? null;
      });
    } catch {
      setError("Network error while loading messages.");
    } finally {
      setLoading(false);
    }
  }, [showStop, showBlank]);

  const syncAfterSend = useCallback(async () => {
    const delays = [1000, 2500, 5000];
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
    if (!isMobile && conversations.length > 0 && !selectedPhone) {
      setSelectedPhone(conversations[0].phone);
    }
  }, [isMobile, conversations, selectedPhone]);

  const handleSelectConversation = (phone: string) => {
    setSelectedPhone(phone);
    if (isMobile) setMobilePane("chat");
  };

  const handleBackToList = () => {
    setMobilePane("list");
  };

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    prevMessageCountRef.current = 0;
    requestAnimationFrame(() => scrollToBottom(false));
  }, [selectedPhone, scrollToBottom]);

  useEffect(() => {
    const count = selectedConversation?.messages.length ?? 0;
    if (count > prevMessageCountRef.current && shouldAutoScrollRef.current) {
      requestAnimationFrame(() => scrollToBottom(false));
    }
    prevMessageCountRef.current = count;
  }, [selectedConversation?.messages, scrollToBottom]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhone || !replyText.trim() || sending || !canReply) return;

    const text = replyText.trim();
    setSending(true);
    setError(null);
    setReplyText("");
    shouldAutoScrollRef.current = true;

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
          addMessageToConversations(prev, newMessage, result.to).map((c) =>
            normalizePhone(c.phone) === normalizePhone(result.to) && currentUser
              ? {
                  ...c,
                  assignedToUserId: c.assignedToUserId ?? currentUser.id,
                  assignedToName: c.assignedToName ?? currentUser.fullName,
                  assignedToEmail: c.assignedToEmail ?? null,
                }
              : c
          )
        );
        setSelectedPhone(normalizePhone(result.to));
        requestAnimationFrame(() => scrollToBottom(true));
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
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-brand-muted/30 px-4 py-2.5 sm:gap-4 sm:px-5 sm:py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand">
          Filters
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={showStop}
            onChange={(e) => setShowStop(e.target.checked)}
            className="rounded border-border text-brand focus:ring-brand/30"
          />
          STOP messages
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={showBlank}
            onChange={(e) => setShowBlank(e.target.checked)}
            className="rounded border-border text-brand focus:ring-brand/30"
          />
          No-reply chats
        </label>
      </div>

      {/* Main chat layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Conversation list */}
        <div
          className={`flex w-full shrink-0 flex-col overflow-hidden border-r border-border lg:w-80 ${
            mobilePane === "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
            <p className="text-xs text-zinc-400">
              {conversations.length} conversations
            </p>
          </div>

          <ConversationList
            conversations={conversations}
            selectedPhone={selectedPhone}
            loading={loading}
            onSelect={handleSelectConversation}
            formatTime={formatTime}
            getInitials={getInitials}
          />
        </div>

        {/* Chat panel */}
        <div
          className={`min-h-0 min-w-0 flex-1 flex-col ${
            mobilePane === "list" ? "hidden lg:flex" : "flex"
          }`}
        >
          {selectedConversation ? (
            <>
              {/* Chat header */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-brand-light lg:hidden"
                    aria-label="Back to inbox"
                  >
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
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                      {formatPhoneDisplay(selectedConversation.phone)}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {selectedConversation.assignedToName
                        ? `Assigned to ${selectedConversation.assignedToName}`
                        : "Unassigned — reply to claim"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  {currentUser && (
                    <button
                      type="button"
                      onClick={() =>
                        voice.startCall({
                          to: normalizePhone(selectedConversation.phone),
                          user: {
                            userId: currentUser.id,
                            fullName: currentUser.fullName,
                          },
                        })
                      }
                      disabled={voice.isInCall}
                      className="flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-muted px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-50"
                      title="Start live call"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      Call
                    </button>
                  )}
                  <span className="hidden rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand sm:inline">
                    {selectedConversation.messages.length} messages
                  </span>
                </div>
              </div>

              {/* Messages — scroll contained here only */}
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="min-h-0 flex-1 overflow-y-auto bg-[#f9f8fd] px-4 py-4 sm:px-6 sm:py-5"
              >
                <div className="w-full space-y-1">
                  {selectedConversation.messages.map((msg, idx) => {
                    const isOutbound = msg.direction === "outbound";
                    const dateLabel = formatDateDivider(msg.dateCreated);
                    const prevDateLabel =
                      idx > 0
                        ? formatDateDivider(
                            selectedConversation.messages[idx - 1].dateCreated
                          )
                        : null;
                    const showDivider = dateLabel !== prevDateLabel;

                    return (
                      <div key={msg.sid}>
                        {showDivider && (
                          <div className="my-5 flex items-center gap-3">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[11px] font-medium text-zinc-400">
                              {dateLabel}
                            </span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <div
                          className={`mb-3 flex ${isOutbound ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-2.5 ${
                              isOutbound
                                ? "rounded-2xl rounded-br-md bg-brand text-white shadow-sm"
                                : "rounded-2xl rounded-bl-md border border-border bg-white text-foreground shadow-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                              {msg.body ||
                                (parseInt(msg.numMedia || "0") > 0
                                  ? `[${msg.numMedia} media]`
                                  : "")}
                            </p>
                            <p
                              className={`mt-1.5 text-right text-[10px] ${
                                isOutbound ? "text-white/50" : "text-zinc-400"
                              }`}
                            >
                              {formatTime(msg.dateCreated)}
                              {isOutbound && msg.status && ` · ${msg.status}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Composer */}
              {canReply ? (
                <form
                  onSubmit={handleSendReply}
                  className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-6 sm:py-4"
                >
                  <div className="flex w-full items-end gap-2 sm:gap-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply(e);
                        }
                      }}
                      placeholder="Type a message…"
                      disabled={sending}
                      rows={1}
                      className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={sending || !replyText.trim()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sending ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
              ) : (
                <div className="shrink-0 border-t border-border bg-brand-muted/30 px-4 py-3 text-center text-sm text-zinc-500 sm:px-6 sm:py-4">
                  Assigned to {selectedConversation.assignedToName}
                </div>
              )}

              <LiveCallBar
                callState={voice.callState}
                activeNumber={voice.activeNumber}
                isMuted={voice.isMuted}
                error={voice.error}
                fromNumber={voice.fromNumber}
                onHangUp={voice.hangUp}
                onToggleMute={voice.toggleMute}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#f9f8fd] text-zinc-400">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light">
                <svg
                  className="h-8 w-8 text-brand"
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
              </div>
              <p className="text-sm font-medium text-zinc-500">
                Select a conversation
              </p>
              <p className="text-xs text-zinc-400">
                Choose a contact from the inbox to view messages
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
