"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiFetch, getAuthToken, wsBase } from "@/lib/api-client";
import { usePathname, useRouter } from "next/navigation";
import ConversationList from "@/components/ConversationList";
import InboxFilters from "@/components/messages/InboxFilters";
import MessageNotificationControls from "@/components/messages/MessageNotificationControls";
import LiveCallBar from "@/components/LiveCallBar";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { highlightStopWithOtherReply } from "@/lib/filters";
import { formatOutboundMessageStatus } from "@/lib/message-status";
import { isStopMessage } from "@/lib/stop";
import type { ChatMessage, Conversation } from "@/lib/messages";
import { conversationLabel, sortConversations } from "@/lib/messages";
import {
  CONVERSATION_LIST_PAGE_SIZE,
  MESSAGE_THREAD_PAGE_SIZE,
} from "@/lib/messaging";
import {
  formatPhoneDisplay,
  isValidPhoneNumber,
  normalizePhone,
} from "@/lib/phone";
import {
  formatMessageTimestampFull,
  formatRelativeTime,
} from "@/lib/relative-time";
import {
  messageConversationPath,
  notifyInboundFromConversationUpdates,
  notifyInboundFromThreadMessages,
  setNotificationNavigateHandler,
} from "@/lib/browser-notifications";
import { normalizeAppPathname } from "@/lib/navigation";

interface CurrentUser {
  id: string;
  role: "admin" | "employee";
  fullName: string;
}

interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

function useRelativeTimeClock(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const INBOX_CACHE_KEY = "revenelx-inbox-cache-v2";

type ListSnapshot = {
  conversations: Conversation[];
  total: number;
  hasMore: boolean;
};

function readInboxStore(): Map<string, ListSnapshot> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(INBOX_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, ListSnapshot>;
    return new Map(
      Object.entries(parsed).map(([key, value]) => [
        key,
        {
          total: value.total ?? 0,
          hasMore: Boolean(value.hasMore),
          conversations: (value.conversations ?? []).map((conv) => ({
            ...conv,
            messages: [],
          })),
        },
      ])
    );
  } catch {
    return new Map();
  }
}

function writeInboxStore(lists: Map<string, ListSnapshot>): void {
  try {
    const slim: Record<string, ListSnapshot> = {};
    for (const [key, value] of lists) {
      slim[key] = {
        total: value.total,
        hasMore: value.hasMore,
        conversations: value.conversations.slice(0, 40).map((conv) => ({
          ...conv,
          messages: [],
        })),
      };
    }
    localStorage.setItem(INBOX_CACHE_KEY, JSON.stringify(slim));
  } catch {
    // Ignore quota errors. The server response is still shown.
  }
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

function conversationInitials(conv: Conversation): string {
  const label = conversationLabel(conv).trim();
  if (!label) return "?";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  const single = parts[0] ?? label;
  const digits = single.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  return single.slice(0, 2).toUpperCase();
}

function mergeConversationList(
  prev: Conversation[],
  incoming: Conversation[],
  activePhone?: string | null
): Conversation[] {
  const activeKey = activePhone ? normalizePhone(activePhone) : null;
  const map = new Map(prev.map((c) => [normalizePhone(c.phone), c]));
  for (const conv of incoming) {
    const key = normalizePhone(conv.phone);
    const existing = map.get(key);
    if (existing) {
      const merged: Conversation = {
        ...existing,
        ...conv,
        messages: existing.messages,
        hasOlderMessages: existing.hasOlderMessages,
        messageCount: existing.messageCount ?? conv.messageCount,
      };
      if (activeKey && key === activeKey) {
        merged.unread = false;
      }
      map.set(key, merged);
    } else {
      const next: Conversation =
        activeKey && key === activeKey ? { ...conv, unread: false } : conv;
      map.set(key, next);
    }
  }
  return sortConversations(Array.from(map.values()));
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

    return sortConversations(
      conversations.map((c) =>
        normalizePhone(c.phone) === normalizedContact
          ? {
              ...c,
              messages: [...c.messages, message],
              lastMessage: message.body || "(media)",
              lastMessageAt: message.dateCreated,
              lastMessageDirection: message.direction,
              unread:
                message.direction === "inbound" &&
                !isStopMessage(message.body) &&
                !c.isStop,
              isBlank: false,
              isStop:
                c.isStop ||
                (message.direction === "inbound" && isStopMessage(message.body)),
              isClosed:
                message.direction === "inbound" ? false : c.isClosed,
              closedAt:
                message.direction === "inbound" ? null : c.closedAt,
            }
          : c
      )
    );
  }

  return sortConversations([
    {
      phone: normalizedContact,
      contactName: null,
      messages: [message],
      lastMessage: message.body || "(media)",
      lastMessageAt: message.dateCreated,
      lastMessageDirection: message.direction,
      unread:
        message.direction === "inbound" && !isStopMessage(message.body),
      assignedToUserId: null,
      assignedToName: null,
      assignedToEmail: null,
      assignedAt: null,
      isStop:
        message.direction === "inbound" && isStopMessage(message.body),
      isBlank: false,
      isClosed: false,
      closedAt: null,
    },
    ...conversations,
  ]);
}

export default function ChatApp() {
  const router = useRouter();
  const pathname = usePathname();
  const relativeNow = useRelativeTimeClock();
  const voice = useVoiceCall();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showStop, setShowStop] = useState(false);
  const [showBlank, setShowBlank] = useState(false);
  const [closing, setClosing] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [loadingMoreList, setLoadingMoreList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const selectedPhoneRef = useRef<string | null>(null);
  selectedPhoneRef.current = selectedPhone;
  const inboxNotificationsReadyRef = useRef(false);
  const notifiedInboundKeysRef = useRef(new Set<string>());
  const threadCacheRef = useRef(
    new Map<
      string,
      { messages: ChatMessage[]; hasOlderMessages?: boolean; messageCount?: number }
    >()
  );
  const listCacheRef = useRef(
    new Map<
      string,
      { conversations: Conversation[]; total: number; hasMore: boolean }
    >()
  );
  const pendingClosedRef = useRef(new Map<string, Conversation>());
  const filterKeyRef = useRef("0:0:0");
  filterKeyRef.current = `${showClosed}:${showStop}:${showBlank}`;

  const getNotificationContext = useCallback(
    () => ({
      pathname,
      selectedPhone: selectedPhoneRef.current,
      documentHidden: document.hidden,
    }),
    [pathname]
  );

  useEffect(() => {
    setNotificationNavigateHandler((path) => {
      router.push(path);
      window.focus();
    });
    return () => setNotificationNavigateHandler(null);
  }, [router]);

  useEffect(() => {
    voice.initialize();
  }, [voice.initialize]);

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      setTeamMembers([]);
      return;
    }

    apiFetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.users)) {
          setTeamMembers(data.users);
        }
      })
      .catch(() => {
        // Assignment dropdown stays empty until the next refresh.
      });
  }, [currentUser?.role]);

  const selectedConversation = conversations.find(
    (c) => normalizePhone(c.phone) === normalizePhone(selectedPhone || "")
  );

  const canReply =
    selectedConversation &&
    !selectedConversation.isClosed &&
    currentUser &&
    (currentUser.role === "admin" ||
      !selectedConversation.assignedToUserId ||
      selectedConversation.assignedToUserId === currentUser.id);

  const selectedStopWithOtherReply =
    selectedConversation &&
    highlightStopWithOtherReply(selectedConversation, showStop);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  const markConversationAsRead = useCallback(
    async (phone: string, readAt?: string) => {
      const normalized = normalizePhone(phone);
      setConversations((prev) =>
        sortConversations(
          prev.map((c) =>
            normalizePhone(c.phone) === normalized ? { ...c, unread: false } : c
          )
        )
      );

      try {
        await apiFetch("/api/twilio/messages/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: normalized,
            ...(readAt ? { readAt } : {}),
          }),
        });
      } catch {
        // The next inbox poll will reconcile read state.
      }
    },
    []
  );

  const syncConversationUrl = useCallback(
    (phone: string) => {
      if (normalizeAppPathname(pathname) !== "/messages") return;
      router.replace(messageConversationPath(phone), { scroll: false });
    },
    [pathname, router]
  );

  useEffect(() => {
    if (normalizeAppPathname(pathname) !== "/messages") return;
    const raw = new URLSearchParams(window.location.search).get("phone");
    if (!raw) return;
    const phone = normalizePhone(raw);
    setSelectedPhone((prev) =>
      prev && normalizePhone(prev) === phone ? prev : phone
    );
    if (isMobile) setMobilePane("chat");
    void markConversationAsRead(phone);
  }, [pathname, isMobile, markConversationAsRead]);

  const loadThread = useCallback(
    async (
      phone: string,
      options?: {
        before?: string;
        prepend?: boolean;
        appendNew?: boolean;
        preserveScrollHeight?: number;
        silent?: boolean;
      }
    ) => {
      if (!options?.silent) setLoadingThread(true);
      try {
        const params = new URLSearchParams({
          phone: normalizePhone(phone),
          limit: String(MESSAGE_THREAD_PAGE_SIZE),
        });
        if (options?.before) params.set("before", options.before);

        const res = await apiFetch(`/api/twilio/messages/thread?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 403) {
            const denied = normalizePhone(phone);
            setConversations((prev) =>
              prev.filter((c) => normalizePhone(c.phone) !== denied)
            );
            setSelectedPhone((current) =>
              current && normalizePhone(current) === denied ? null : current
            );
            return;
          }
          setError(data.error || "Failed to load messages.");
          return;
        }

        setError(null);
        const normalized = normalizePhone(phone);
        let latestReadAt: string | undefined;
        let hadNewMessages = false;
        let threadNotifyConversation: Conversation | undefined;
        let threadNotifyIncoming: ChatMessage[] = [];
        setConversations((prev) =>
          prev.map((c) => {
            if (normalizePhone(c.phone) !== normalized) return c;
            const existingIds = new Set(c.messages.map((m) => m.sid));
            const incoming = (data.messages as ChatMessage[]).filter(
              (m) => !existingIds.has(m.sid)
            );
            if (incoming.length > 0 && options?.appendNew) {
              hadNewMessages = true;
              threadNotifyConversation = c;
              threadNotifyIncoming = incoming;
            }
            let messages: ChatMessage[];
            if (options?.prepend) {
              messages = [...incoming, ...c.messages];
            } else if (options?.appendNew) {
              messages = [...c.messages, ...incoming];
            } else {
              messages = data.messages as ChatMessage[];
            }
            const hasNonStopInbound =
              c.hasNonStopInbound ||
              messages.some((msg) => {
                if (msg.direction !== "inbound") return false;
                const body = msg.body.trim();
                if (body && !isStopMessage(body)) return true;
                const mediaCount = Number(msg.numMedia ?? "0");
                return Number.isFinite(mediaCount) && mediaCount > 0;
              });

            const latest = messages[messages.length - 1];
            if (latest && !options?.prepend) {
              latestReadAt = latest.dateCreated;
            }

            threadCacheRef.current.set(normalized, {
              messages,
              hasOlderMessages: data.hasMore,
              messageCount: data.totalCount,
            });
            return {
              ...c,
              messages,
              messageCount: data.totalCount,
              hasOlderMessages: data.hasMore,
              hasNonStopInbound,
              ...(latest && {
                lastMessage: latest.body || "(media)",
                lastMessageAt: latest.dateCreated,
                lastMessageDirection: latest.direction,
                unread: false,
              }),
            };
          })
        );

        if (
          options?.appendNew &&
          inboxNotificationsReadyRef.current &&
          threadNotifyIncoming.length > 0
        ) {
          notifyInboundFromThreadMessages(
            threadNotifyConversation,
            threadNotifyIncoming,
            getNotificationContext(),
            notifiedInboundKeysRef.current
          );
        }

        if (!options?.prepend && latestReadAt) {
          void markConversationAsRead(phone, latestReadAt);
        }

        if (
          options?.appendNew &&
          hadNewMessages &&
          shouldAutoScrollRef.current
        ) {
          requestAnimationFrame(() => scrollToBottom());
        }

        if (options?.preserveScrollHeight != null) {
          const el = messagesContainerRef.current;
          if (el) {
            requestAnimationFrame(() => {
              el.scrollTop = el.scrollHeight - options.preserveScrollHeight!;
            });
          }
        }
      } catch {
        setError("Network error while loading messages.");
      } finally {
        if (!options?.silent) setLoadingThread(false);
      }
    },
    [getNotificationContext, markConversationAsRead, scrollToBottom]
  );

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 100;

    if (
      el.scrollTop < 80 &&
      selectedPhone &&
      selectedConversation?.hasOlderMessages &&
      !loadingOlderRef.current &&
      !loadingThread
    ) {
      const oldest = selectedConversation.messages[0];
      if (oldest) {
        loadingOlderRef.current = true;
        const prevHeight = el.scrollHeight;
        void loadThread(selectedPhone, {
          before: oldest.dateCreated,
          prepend: true,
          preserveScrollHeight: prevHeight,
        }).finally(() => {
          loadingOlderRef.current = false;
        });
      }
    }
  };

  const applyPendingClosed = useCallback(
    (list: Conversation[], filterKey: string) => {
      const showingClosed = filterKey.startsWith("true:");
      if (showingClosed) {
        const seen = new Set(list.map((c) => normalizePhone(c.phone)));
        const extras = [...pendingClosedRef.current.values()].filter(
          (c) => !seen.has(normalizePhone(c.phone))
        );
        return extras.length > 0 ? sortConversations([...extras, ...list]) : list;
      }
      if (pendingClosedRef.current.size === 0) return list;
      return list.filter(
        (c) => !pendingClosedRef.current.has(normalizePhone(c.phone))
      );
    },
    []
  );

  const fetchConversations = useCallback(
    async (options?: { page?: number; append?: boolean; silent?: boolean }) => {
      const page = options?.page ?? 1;
      const append = options?.append ?? false;
      const silent = options?.silent ?? false;
      const requestKey = filterKeyRef.current;

      try {
        if (append) setLoadingMoreList(true);
        else if (!silent) setLoading(true);
        else setRefreshing(true);

        const params = new URLSearchParams({
          page: String(page),
          limit: String(CONVERSATION_LIST_PAGE_SIZE),
        });
        if (showClosed) params.set("showClosed", "true");
        else {
          if (showStop) params.set("showStop", "true");
          if (showBlank) params.set("showBlank", "true");
        }

        const res = await apiFetch(`/api/twilio/messages?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to load messages.");
          return;
        }

        setError(null);
        const serverList = applyPendingClosed(
          data.conversations as Conversation[],
          requestKey
        );
        for (const conv of serverList) {
          if (conv.isClosed) pendingClosedRef.current.delete(normalizePhone(conv.phone));
        }
        const visibleList = applyPendingClosed(serverList, requestKey);
        if (filterKeyRef.current === requestKey) {
          setHasMoreConversations(Boolean(data.hasMore));
          setConversationTotal(
            (data.total ?? data.conversations.length) +
              (visibleList.length - serverList.length)
          );
          setListPage(page);
        }

        if (append && filterKeyRef.current === requestKey) {
          setConversations((prev) => {
            const seen = new Set(prev.map((c) => normalizePhone(c.phone)));
            const next = [...prev];
            for (const conv of data.conversations as Conversation[]) {
              const key = normalizePhone(conv.phone);
              if (!seen.has(key)) {
                seen.add(key);
                next.push(conv);
              }
            }
            return next;
          });
        } else if (silent && filterKeyRef.current === requestKey) {
          setConversations((prev) => {
            const next = applyPendingClosed(
              mergeConversationList(
                prev,
                visibleList,
                selectedPhoneRef.current
              ),
              requestKey
            );
            if (inboxNotificationsReadyRef.current) {
              notifyInboundFromConversationUpdates(
                prev,
                next,
                getNotificationContext(),
                notifiedInboundKeysRef.current
              );
            }
            return next;
          });
        } else if (filterKeyRef.current === requestKey) {
          setConversations(
            visibleList.map((conv) => {
              const cached = threadCacheRef.current.get(normalizePhone(conv.phone));
              if (!cached) return conv;
              return {
                ...conv,
                messages: cached.messages,
                hasOlderMessages: cached.hasOlderMessages,
                messageCount: cached.messageCount ?? conv.messageCount,
              };
            })
          );
        }

        if (!append && page === 1) {
          listCacheRef.current.set(requestKey, {
            conversations: visibleList,
            total: visibleList.length,
            hasMore: Boolean(data.hasMore),
          });
          writeInboxStore(listCacheRef.current);
        }

        if (!append) {
          inboxNotificationsReadyRef.current = true;
        }

        if (data.user) setCurrentUser(data.user);

        if (!append && !silent) {
          setSelectedPhone((prev) => {
            if (
              prev &&
              (data.conversations as Conversation[]).some(
                (c) => normalizePhone(c.phone) === normalizePhone(prev)
              )
            ) {
              return prev;
            }
            const isMobileView = window.matchMedia("(max-width: 1023px)").matches;
            if (isMobileView) return null;
            return data.conversations[0]?.phone ?? null;
          });
        }
      } catch {
        setError("Network error while loading messages.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMoreList(false);
      }
    },
    [applyPendingClosed, getNotificationContext, showClosed, showStop, showBlank]
  );

  useLayoutEffect(() => {
    const stored = readInboxStore();
    if (stored.size === 0) return;
    listCacheRef.current = stored;
    const cached = stored.get(filterKeyRef.current);
    if (!cached) return;
    setConversations(cached.conversations);
    setConversationTotal(cached.total);
    setHasMoreConversations(cached.hasMore);
    setLoading(false);
  }, []);

  useEffect(() => {
    setListPage(1);
    const cached = listCacheRef.current.get(filterKeyRef.current);
    if (cached) {
      setConversations(
        cached.conversations.map((conv) => {
          const thread = threadCacheRef.current.get(normalizePhone(conv.phone));
          if (!thread) return conv;
          return {
            ...conv,
            messages: thread.messages,
            hasOlderMessages: thread.hasOlderMessages,
            messageCount: thread.messageCount ?? conv.messageCount,
          };
        })
      );
      setConversationTotal(cached.total);
      setHasMoreConversations(cached.hasMore);
      setLoading(false);
      void fetchConversations({ page: 1, silent: true });
      return;
    }
    setConversations([]);
    setLoading(true);
    void fetchConversations({ page: 1 });
  }, [fetchConversations]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | null = null;

    const connect = () => {
      if (stopped) return;
      const base = wsBase();
      const token = getAuthToken();
      if (!base || !token) {
        retryTimer = window.setTimeout(connect, 2000);
        return;
      }
      socket = new WebSocket(
        `${base}/ws?token=${encodeURIComponent(token)}`
      );
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as {
            type?: string;
            phone?: string;
            direction?: string;
            body?: string;
            at?: string;
          };
          if (data.type !== "message") return;
          const phone = data.phone ? normalizePhone(data.phone) : "";
          const direction = data.direction === "outbound" ? "outbound" : "inbound";
          const at = data.at || new Date().toISOString();
          const body = data.body || "";
          if (phone) {
            const stop = direction === "inbound" && isStopMessage(body);
            pendingClosedRef.current.delete(phone);
            const openKey = "false:false:false";
            setConversations((prev) => {
              const existing = prev.find((c) => normalizePhone(c.phone) === phone);
              const viewing =
                normalizePhone(selectedPhoneRef.current || "") === phone;
              const nextConv: Conversation = existing
                ? {
                    ...existing,
                    lastMessage: body || existing.lastMessage,
                    lastMessageAt: at,
                    lastMessageDirection: direction,
                    unread: direction === "inbound" && !stop && !viewing,
                    isClosed: direction === "inbound" ? false : existing.isClosed,
                    closedAt: direction === "inbound" ? null : existing.closedAt,
                    isStop: existing.isStop || stop,
                  }
                : {
                    phone,
                    contactName: null,
                    messages: [],
                    lastMessage: body,
                    lastMessageAt: at,
                    lastMessageDirection: direction,
                    unread: direction === "inbound" && !stop,
                    assignedToUserId: null,
                    assignedToName: null,
                    assignedToEmail: null,
                    assignedAt: null,
                    isStop: stop,
                    isBlank: direction === "outbound",
                    isClosed: false,
                    closedAt: null,
                  };
              const rest = prev.filter((c) => normalizePhone(c.phone) !== phone);
              const open = listCacheRef.current.get(openKey);
              const openRest = (open?.conversations ?? []).filter(
                (c) => normalizePhone(c.phone) !== phone
              );
              listCacheRef.current.set(openKey, {
                conversations: sortConversations([
                  { ...nextConv, messages: [] },
                  ...openRest,
                ]),
                total: openRest.length + 1,
                hasMore: open?.hasMore ?? false,
              });
              writeInboxStore(listCacheRef.current);
              if (filterKeyRef.current.startsWith("true:") && !nextConv.isClosed) {
                return rest;
              }
              return sortConversations([nextConv, ...rest]);
            });
          }
          void fetchConversations({ page: 1, silent: true });
          const openPhone = selectedPhoneRef.current;
          if (
            openPhone &&
            (!data.phone ||
              normalizePhone(data.phone) === normalizePhone(openPhone))
          ) {
            void loadThread(openPhone, { appendNew: true, silent: true });
          }
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        socket = null;
        if (stopped) return;
        attempt += 1;
        const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [fetchConversations, loadThread]);

  useEffect(() => {
    if (!selectedPhone) return;
    const conv = conversations.find(
      (c) => normalizePhone(c.phone) === normalizePhone(selectedPhone)
    );
    if (conv && conv.messages.length === 0) {
      void loadThread(selectedPhone);
    }
  }, [selectedPhone, conversations, loadThread]);

  useEffect(() => {
    if (!isMobile && conversations.length > 0 && !selectedPhone) {
      setSelectedPhone(conversations[0].phone);
    }
  }, [isMobile, conversations, selectedPhone]);

  const handleSelectConversation = (phone: string) => {
    setSelectedPhone(phone);
    void markConversationAsRead(phone);
    syncConversationUrl(phone);
    if (isMobile) setMobilePane("chat");
  };

  const handleBackToList = () => {
    setMobilePane("list");
  };

  const patchConversationAssignment = (
    phone: string,
    assignment: {
      assignedToUserId: string | null;
      assignedToName: string | null;
      assignedToEmail: string | null;
      assignedAt: string | null;
    }
  ) => {
    const normalized = normalizePhone(phone);
    setConversations((prev) =>
      prev.map((c) =>
        normalizePhone(c.phone) === normalized ? { ...c, ...assignment } : c
      )
    );
  };

  const patchConversationClosed = (
    phone: string,
    closed: boolean,
    closedAt: string | null
  ) => {
    const normalized = normalizePhone(phone);
    setConversations((prev) =>
      prev.map((c) =>
        normalizePhone(c.phone) === normalized
          ? { ...c, isClosed: closed, closedAt }
          : c
      )
    );
  };

  const handleSetClosed = async (closed: boolean) => {
    if (!selectedConversation || closing) return;

    const phone = selectedConversation.phone;
    const normalized = normalizePhone(phone);
    const previous = selectedConversation;
    setError(null);
    const closedConv: Conversation = {
      ...previous,
      isClosed: true,
      closedAt: new Date().toISOString(),
    };

    if (closed) {
      pendingClosedRef.current.set(normalized, closedConv);
      for (const [key, entry] of listCacheRef.current) {
        const without = entry.conversations.filter(
          (c) => normalizePhone(c.phone) !== normalized
        );
        listCacheRef.current.set(
          key,
          key.startsWith("true:")
            ? {
                conversations: sortConversations([closedConv, ...without]),
                total: without.length + 1,
                hasMore: entry.hasMore,
              }
            : {
                conversations: without,
                total: Math.max(0, entry.total - 1),
                hasMore: entry.hasMore,
              }
        );
      }
      const closedKey = "true:false:false";
      if (!listCacheRef.current.has(closedKey)) {
        listCacheRef.current.set(closedKey, {
          conversations: [closedConv],
          total: 1,
          hasMore: false,
        });
      }
      writeInboxStore(listCacheRef.current);
    } else {
      pendingClosedRef.current.delete(normalized);
      const openConv: Conversation = {
        ...previous,
        isClosed: false,
        closedAt: null,
      };
      for (const [key, entry] of listCacheRef.current) {
        const without = entry.conversations.filter(
          (c) => normalizePhone(c.phone) !== normalized
        );
        listCacheRef.current.set(
          key,
          key.startsWith("true:")
            ? {
                conversations: without,
                total: Math.max(0, entry.total - 1),
                hasMore: entry.hasMore,
              }
            : {
                conversations: sortConversations([openConv, ...without]),
                total: without.length + 1,
                hasMore: entry.hasMore,
              }
        );
      }
      writeInboxStore(listCacheRef.current);
    }

    if ((closed && !showClosed) || (!closed && showClosed)) {
      setConversations((prev) =>
        prev.filter((c) => normalizePhone(c.phone) !== normalized)
      );
      setConversationTotal((total) => Math.max(0, total - 1));
      setSelectedPhone(null);
      if (isMobile) setMobilePane("list");
    } else {
      patchConversationClosed(phone, closed, closed ? closedConv.closedAt : null);
    }

    setClosing(true);
    try {
      const res = await apiFetch("/api/conversations/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, closed }),
      });
      const data = await res.json();

      if (!res.ok || (closed && !data.assignment?.closedAt)) {
        setError(data.error || "Could not update conversation");
        pendingClosedRef.current.delete(normalized);
        listCacheRef.current.clear();
        setConversations((prev) => {
          if (prev.some((c) => normalizePhone(c.phone) === normalized)) {
            return prev.map((c) =>
              normalizePhone(c.phone) === normalized ? previous : c
            );
          }
          return sortConversations([previous, ...prev]);
        });
        setConversationTotal((total) => total + 1);
        setSelectedPhone(phone);
      }
    } catch {
      setError("Network error while updating conversation.");
      pendingClosedRef.current.delete(normalized);
      listCacheRef.current.clear();
      setConversations((prev) => {
        if (prev.some((c) => normalizePhone(c.phone) === normalized)) return prev;
        return sortConversations([previous, ...prev]);
      });
      setSelectedPhone(phone);
    } finally {
      setClosing(false);
    }
  };

  const handleAssignConversation = async (userId: string) => {
    if (!selectedConversation || currentUser?.role !== "admin") return;

    const member = userId ? teamMembers.find((m) => m.id === userId) : null;
    const previousAssignment = {
      assignedToUserId: selectedConversation.assignedToUserId,
      assignedToName: selectedConversation.assignedToName,
      assignedToEmail: selectedConversation.assignedToEmail,
      assignedAt: selectedConversation.assignedAt,
    };
    patchConversationAssignment(selectedConversation.phone, {
      assignedToUserId: member?.id ?? null,
      assignedToName: member?.fullName ?? null,
      assignedToEmail: member?.email ?? null,
      assignedAt: member ? new Date().toISOString() : null,
    });

    setAssigning(true);
    try {
      const res = await apiFetch("/api/conversations/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: selectedConversation.phone,
          userId: userId || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        patchConversationAssignment(selectedConversation.phone, previousAssignment);
        setError(data.error || "Could not update assignment");
        return;
      }

      patchConversationAssignment(selectedConversation.phone, {
        assignedToUserId: data.assignment.assignedToUserId,
        assignedToName: data.assignment.assignedToName,
        assignedToEmail: data.assignment.assignedToEmail,
        assignedAt: data.assignment.assignedAt,
      });
      setError(null);
    } catch {
      setError("Network error while assigning conversation.");
    } finally {
      setAssigning(false);
    }
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
    const tempSid = `local-${Date.now()}`;
    setSending(true);
    setError(null);
    setReplyText("");
    shouldAutoScrollRef.current = true;
    setConversations((prev) =>
      addMessageToConversations(
        prev,
        {
          sid: tempSid,
          from: "",
          to: selectedPhone,
          body: text,
          dateCreated: new Date().toISOString(),
          direction: "outbound",
          status: "sending",
        },
        selectedPhone
      )
    );
    requestAnimationFrame(() => scrollToBottom(true));

    try {
      const res = await apiFetch("/api/send", {
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
        setConversations((prev) =>
          prev.map((c) =>
            normalizePhone(c.phone) === normalizePhone(selectedPhone)
              ? { ...c, messages: c.messages.filter((m) => m.sid !== tempSid) }
              : c
          )
        );
        return;
      }

      const result = data.results?.[0];
      if (result && !result.success) {
        setReplyText(text);
        setError(result.error || "Failed to send message.");
        setConversations((prev) =>
          prev.map((c) =>
            normalizePhone(c.phone) === normalizePhone(selectedPhone)
              ? { ...c, messages: c.messages.filter((m) => m.sid !== tempSid) }
              : c
          )
        );
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
          addMessageToConversations(
            prev.map((c) =>
              normalizePhone(c.phone) === normalizePhone(result.to)
                ? { ...c, messages: c.messages.filter((m) => m.sid !== tempSid) }
                : c
            ),
            newMessage,
            result.to
          ).map((c) =>
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
      }
    } catch {
      setReplyText(text);
      setError("Network error. Please try again.");
      setConversations((prev) =>
        prev.map((c) =>
          normalizePhone(c.phone) === normalizePhone(selectedPhone)
            ? { ...c, messages: c.messages.filter((m) => m.sid !== tempSid) }
            : c
        )
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Inbox column — filters + list (no full-width toolbar) */}
        <div
          className={`flex w-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface lg:w-80 ${
            mobilePane === "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {showClosed ? "Closed" : "Inbox"}
              </h2>
              <p className="text-xs text-zinc-400">
                {conversationTotal > 0 ? conversationTotal : conversations.length}{" "}
                {showClosed ? "closed" : ""} conversation
                {(conversationTotal > 0 ? conversationTotal : conversations.length) ===
                1
                  ? ""
                  : "s"}
                {hasMoreConversations && conversations.length < conversationTotal
                  ? ` · showing ${conversations.length}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <InboxFilters
                showClosed={showClosed}
                showStop={showStop}
                showBlank={showBlank}
                onShowClosedChange={setShowClosed}
                onShowStopChange={setShowStop}
                onShowBlankChange={setShowBlank}
              />
              <MessageNotificationControls variant="chip" />
            </div>
          </div>

          <ConversationList
            conversations={conversations}
            selectedPhone={selectedPhone}
            loading={loading}
            refreshing={refreshing}
            loadingMore={loadingMoreList}
            hasMore={hasMoreConversations}
            showStopFilter={showStop && !showClosed}
            onSelect={handleSelectConversation}
            onLoadMore={() => {
              if (!hasMoreConversations || loadingMoreList) return;
              void fetchConversations({ page: listPage + 1, append: true });
            }}
            formatTime={(dateStr) =>
              formatRelativeTime(dateStr, relativeNow)
            }
            formatTimeTitle={formatMessageTimestampFull}
          />
        </div>

        {/* Chat — full column height from top of split */}
        <div
          className={`min-h-0 min-w-0 flex-1 flex-col ${
            mobilePane === "list" ? "hidden lg:flex" : "flex"
          }`}
        >
          {selectedConversation ? (
            <>
              <header className="shrink-0 border-b border-border bg-surface px-3 py-2 sm:px-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-brand-light lg:hidden"
                    aria-label="Back to inbox"
                  >
                    <svg
                      className="h-4 w-4"
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

                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      selectedStopWithOtherReply
                        ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                        : "bg-brand text-white"
                    }`}
                    aria-hidden
                  >
                    {conversationInitials(selectedConversation)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2
                      className={`truncate text-sm font-semibold leading-tight ${
                        selectedStopWithOtherReply
                          ? "text-emerald-900"
                          : "text-foreground"
                      }`}
                    >
                      {conversationLabel(selectedConversation)}
                      {selectedConversation.isClosed && (
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          · Closed
                        </span>
                      )}
                    </h2>
                    <p
                      className={`truncate text-[11px] leading-tight ${
                        selectedStopWithOtherReply
                          ? "text-emerald-800/75"
                          : "text-zinc-400"
                      }`}
                    >
                      {isValidPhoneNumber(selectedConversation.phone) ? (
                        <>
                          {formatPhoneDisplay(selectedConversation.phone)}
                          <span className="text-zinc-300"> · </span>
                        </>
                      ) : null}
                      {selectedConversation.messageCount ??
                        selectedConversation.messages.length}{" "}
                      msg
                      {currentUser?.role !== "admin" && (
                        <>
                          <span className="text-zinc-300"> · </span>
                          {selectedConversation.assignedToName
                            ? selectedConversation.assignedToName
                            : "Unassigned"}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {currentUser?.role === "admin" && (
                      <select
                        value={selectedConversation.assignedToUserId ?? ""}
                        disabled={assigning}
                        onChange={(event) =>
                          void handleAssignConversation(event.target.value)
                        }
                        aria-label="Assign conversation"
                        className="hidden max-w-[8.5rem] cursor-pointer truncate rounded-lg border border-border bg-white py-1 pl-1.5 pr-5 text-[11px] font-medium text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50 sm:block"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName}
                          </option>
                        ))}
                      </select>
                    )}

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
                        disabled={
                          voice.isInCall || Boolean(voice.voiceUnavailableHint)
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand/20 text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-50"
                        title={
                          voice.voiceUnavailableHint ?? "Call contact"
                        }
                        aria-label="Call contact"
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
                      </button>
                    )}

                    {selectedConversation.isClosed ? (
                      <button
                        type="button"
                        onClick={() => void handleSetClosed(false)}
                        disabled={closing}
                        className="rounded-lg bg-brand px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSetClosed(true)}
                        disabled={closing}
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>

                {currentUser?.role === "admin" && (
                  <div className="mt-1.5 flex sm:hidden">
                    <select
                      value={selectedConversation.assignedToUserId ?? ""}
                      disabled={assigning}
                      onChange={(event) =>
                        void handleAssignConversation(event.target.value)
                      }
                      aria-label="Assign conversation"
                      className="w-full cursor-pointer rounded-lg border border-border bg-white py-1 pl-2 pr-6 text-xs font-medium text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </header>

              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="min-h-0 flex-1 overflow-y-auto bg-[#f9f8fd] px-4 py-4 sm:px-6 sm:py-5"
              >
                <div className="w-full space-y-1">
                  {loadingThread && selectedConversation.messages.length === 0 && (
                    <div className="flex justify-center py-12">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    </div>
                  )}
                  {selectedConversation.hasOlderMessages && (
                    <div className="flex justify-center py-2">
                      {loadingThread ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                      ) : (
                        <span className="text-[11px] text-zinc-400">
                          Scroll up for older messages
                        </span>
                      )}
                    </div>
                  )}
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
                    const outboundStatus = isOutbound
                      ? formatOutboundMessageStatus(msg.status)
                      : null;

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
                              <time
                                dateTime={msg.dateCreated}
                                title={formatMessageTimestampFull(
                                  msg.dateCreated
                                )}
                                className="cursor-default"
                              >
                                {formatRelativeTime(
                                  msg.dateCreated,
                                  relativeNow
                                )}
                              </time>
                              {outboundStatus && ` · ${outboundStatus}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

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
              ) : selectedConversation.isClosed ? (
                <div className="shrink-0 border-t border-border bg-zinc-50 px-4 py-3 text-center text-sm text-zinc-600 sm:px-6 sm:py-4">
                  This conversation is closed. Reopen it to send messages.
                </div>
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
