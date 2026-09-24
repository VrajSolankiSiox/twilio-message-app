import { conversationLabel, type Conversation } from "@/lib/messages";
import { normalizeAppPathname } from "@/lib/navigation";
import { normalizePhone } from "@/lib/phone";

export const MESSAGE_NOTIFICATIONS_PREF_KEY = "revenelx-message-notifications";

const NOTIFICATION_TITLE = "RevenelX SMS";
const NOTIFICATION_ICON = "/revenelx-logo.png";

export type NotificationNavigate = (path: string) => void;

let navigateHandler: NotificationNavigate | null = null;

export function setNotificationNavigateHandler(
  handler: NotificationNavigate | null
): void {
  navigateHandler = handler;
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getMessageNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export function areMessageNotificationsEnabled(): boolean {
  if (!isBrowserNotificationSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const stored = localStorage.getItem(MESSAGE_NOTIFICATIONS_PREF_KEY);
    if (stored === "off") return false;
  } catch {
    // localStorage unavailable
  }
  return true;
}

export function setMessageNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(
      MESSAGE_NOTIFICATIONS_PREF_KEY,
      enabled ? "on" : "off"
    );
  } catch {
    // ignore
  }
}

/** Prefer calling from a click handler via direct Notification.requestPermission(). */
export async function requestMessageNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isBrowserNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") {
    setMessageNotificationsEnabled(true);
    return "granted";
  }
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  if (result === "granted") {
    setMessageNotificationsEnabled(true);
  }
  return result;
}

export function shouldShowNotificationPermissionBanner(): boolean {
  if (!isBrowserNotificationSupported()) return false;
  if (Notification.permission === "denied") return false;
  if (areMessageNotificationsEnabled()) return false;
  try {
    if (sessionStorage.getItem("revenelx-notification-banner-dismissed") === "1") {
      return false;
    }
  } catch {
    // ignore
  }
  return Notification.permission === "default";
}

export function messageConversationPath(phone: string): string {
  const normalized = normalizePhone(phone);
  return `/messages?phone=${encodeURIComponent(normalized)}`;
}

export function shouldSuppressInboundNotification(
  phone: string,
  context: {
    pathname: string;
    selectedPhone: string | null;
    documentHidden: boolean;
  }
): boolean {
  if (context.documentHidden) return false;
  if (normalizeAppPathname(context.pathname) !== "/messages") return false;
  if (
    normalizePhone(context.selectedPhone ?? "") !== normalizePhone(phone)
  ) {
    return false;
  }
  return typeof document.hasFocus === "function" ? document.hasFocus() : true;
}

function truncateBody(text: string, max = 160): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function navigateToConversation(phone: string): void {
  const path = messageConversationPath(phone);
  if (navigateHandler) {
    navigateHandler(path);
    return;
  }
  if (typeof window === "undefined") return;
  window.focus();
  const target = `${window.location.origin}${path}`;
  if (window.location.href !== target) {
    window.location.assign(path);
  }
}

function attachNotificationClick(notification: Notification, phone: string): void {
  notification.onclick = (event) => {
    event.preventDefault();
    notification.close();
    navigateToConversation(phone);
  };
}

export function showInboundMessageNotification(input: {
  phone: string;
  title: string;
  body: string;
}): void {
  if (!areMessageNotificationsEnabled()) return;

  const phone = normalizePhone(input.phone);
  const title = input.title.trim() || formatPhoneFallback(phone);
  const body = truncateBody(input.body || "New message");

  try {
    const notification = new Notification(title, {
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: `inbound-sms-${phone}`,
      renotify: true,
      data: { phone, path: messageConversationPath(phone) },
    });
    attachNotificationClick(notification, phone);
  } catch {
    // Some browsers block notifications outside secure context or without gesture.
  }
}

function formatPhoneFallback(phone: string): string {
  return phone || "New message";
}

export function notifyInboundFromConversationUpdates(
  previous: Conversation[],
  next: Conversation[],
  context: {
    pathname: string;
    selectedPhone: string | null;
    documentHidden: boolean;
  },
  notifiedKeys: Set<string>
): void {
  if (!areMessageNotificationsEnabled()) return;

  const prevByPhone = new Map(
    previous.map((c) => [normalizePhone(c.phone), c])
  );

  for (const conv of next) {
    if (conv.lastMessageDirection !== "inbound") continue;

    const phone = normalizePhone(conv.phone);
    const prev = prevByPhone.get(phone);
    const prevAt = prev?.lastMessageAt
      ? new Date(prev.lastMessageAt).getTime()
      : 0;
    const nextAt = new Date(conv.lastMessageAt).getTime();
    if (!nextAt || nextAt <= prevAt) continue;

    const dedupeKey = `${phone}:${conv.lastMessageAt}`;
    if (notifiedKeys.has(dedupeKey)) continue;
    notifiedKeys.add(dedupeKey);

    if (shouldSuppressInboundNotification(phone, context)) continue;

    showInboundMessageNotification({
      phone,
      title: conversationLabel(conv),
      body: conv.lastMessage || "New message",
    });
  }
}

export function notifyInboundFromThreadMessages(
  conversation: Conversation | undefined,
  newMessages: { direction: string; body: string; dateCreated: string }[],
  context: {
    pathname: string;
    selectedPhone: string | null;
    documentHidden: boolean;
  },
  notifiedKeys: Set<string>
): void {
  if (!areMessageNotificationsEnabled()) return;

  const inbound = newMessages.filter((m) => m.direction === "inbound");
  if (inbound.length === 0) return;

  const phone = conversation
    ? normalizePhone(conversation.phone)
    : normalizePhone(context.selectedPhone ?? "");
  if (!phone) return;

  const latest = inbound[inbound.length - 1];
  const dedupeKey = `${phone}:${latest.dateCreated}`;
  if (notifiedKeys.has(dedupeKey)) return;
  notifiedKeys.add(dedupeKey);

  if (shouldSuppressInboundNotification(phone, context)) return;

  showInboundMessageNotification({
    phone,
    title: conversation ? conversationLabel(conversation) : phone,
    body: latest.body || "New message",
  });
}
