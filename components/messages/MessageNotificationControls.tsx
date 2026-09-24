"use client";

import { useCallback, useEffect, useState } from "react";
import {
  areMessageNotificationsEnabled,
  getMessageNotificationPermission,
  isBrowserNotificationSupported,
  setMessageNotificationsEnabled,
} from "@/lib/browser-notifications";

const BANNER_DISMISSED_SESSION_KEY = "revenelx-notification-banner-dismissed";

function readBannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(BANNER_DISMISSED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setBannerDismissed(): void {
  try {
    sessionStorage.setItem(BANNER_DISMISSED_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

/** Call Notification.requestPermission from a click handler (must stay synchronous). */
function requestPermissionFromClick(): Promise<NotificationPermission | "unsupported"> {
  if (!isBrowserNotificationSupported()) return Promise.resolve("unsupported");
  if (Notification.permission === "granted") {
    setMessageNotificationsEnabled(true);
    return Promise.resolve("granted");
  }
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return Notification.requestPermission();
}

interface MessageNotificationControlsProps {
  variant?: "banner" | "chip";
}

export default function MessageNotificationControls({
  variant = "banner",
}: MessageNotificationControlsProps) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [enabled, setEnabled] = useState(false);
  const [bannerDismissed, setBannerDismissedState] = useState(true);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    const ok = isBrowserNotificationSupported();
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    setEnabled(areMessageNotificationsEnabled());
    setBannerDismissedState(readBannerDismissed());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onVisibility = () => refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  const applyPermissionResult = useCallback((result: NotificationPermission) => {
    if (result === "granted") {
      setMessageNotificationsEnabled(true);
    }
    setPermission(result);
    setEnabled(areMessageNotificationsEnabled());
  }, []);

  const handleAllow = () => {
    void requestPermissionFromClick().then((result) => {
      if (result === "unsupported") return;
      applyPermissionResult(result);
      if (result === "granted") {
        setBannerDismissedState(true);
      }
    });
  };

  const handleToggle = () => {
    if (permission !== "granted") {
      handleAllow();
      return;
    }
    const next = !enabled;
    setMessageNotificationsEnabled(next);
    setEnabled(next);
  };

  const handleDismissBanner = () => {
    setBannerDismissed();
    setBannerDismissedState(true);
  };

  if (!ready) return null;

  if (!supported) {
    if (variant === "chip") return null;
    return (
      <p className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-5">
        Desktop notifications are not available in this browser.
      </p>
    );
  }

  if (permission === "denied") {
    if (variant === "chip") {
      return (
        <p className="text-[11px] leading-snug text-zinc-500">
          Notifications blocked — allow them in browser site settings.
        </p>
      );
    }
    return (
      <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5">
        <p className="text-sm font-medium text-foreground">
          Notifications are blocked
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Open your browser&apos;s site settings for this app and allow
          notifications, then refresh the page.
        </p>
      </div>
    );
  }

  if (enabled) {
    if (variant === "chip") {
      return (
        <button
          type="button"
          onClick={handleToggle}
          className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80 transition-colors hover:bg-emerald-100"
        >
          Alerts on
        </button>
      );
    }
    return null;
  }

  const showBanner =
    variant === "banner" && !bannerDismissed && permission === "default";

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={handleAllow}
        className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-brand/25 transition-colors hover:bg-brand/90"
      >
        Enable alerts
      </button>
    );
  }

  if (!showBanner && permission === "granted") {
    return (
      <div className="shrink-0 border-b border-brand/20 bg-brand-light/50 px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-foreground">
            Permission granted — turn on desktop alerts for new SMS.
          </p>
          <button
            type="button"
            onClick={handleToggle}
            className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
          >
            Turn on alerts
          </button>
        </div>
      </div>
    );
  }

  if (!showBanner) return null;

  return (
    <div
      className="shrink-0 border-b border-brand/25 bg-gradient-to-r from-brand-light/90 to-brand-muted/40 px-4 py-3 sm:px-5"
      role="region"
      aria-label="Enable message notifications"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Get notified when a new text arrives
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            Your browser will ask to allow notifications — click Allow so you
            don&apos;t miss inbound SMS while you&apos;re in another tab.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleDismissBanner}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white/60"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleAllow}
            className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-md shadow-brand/30 transition-colors hover:bg-brand/90"
          >
            Allow notifications
          </button>
        </div>
      </div>
    </div>
  );
}
