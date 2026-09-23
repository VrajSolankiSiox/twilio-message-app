"use client";

import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { NAV_ITEMS } from "@/lib/nav-items";
import { tabToPath } from "@/lib/navigation";

export type NavTab =
  | "messages"
  | "calls"
  | "campaign"
  | "cost"
  | "team"
  | "invoices";

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  user: { fullName: string; email: string; role: string } | null;
  isAdmin: boolean;
  onLogout: () => void;
}

interface IndicatorStyle {
  top: number;
  height: number;
  opacity: number;
}

const DRAG_THRESHOLD = 4;

export default function Sidebar({
  activeTab,
  onTabChange,
  user,
  isAdmin,
  onLogout,
}: SidebarProps) {
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Partial<Record<NavTab, HTMLButtonElement>>>({});
  const prevTabRef = useRef<NavTab | null>(null);
  const travelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const skipLiftRef = useRef(false);
  const pointerRef = useRef<{ id: number; startY: number; armed: boolean } | null>(
    null
  );

  const [indicator, setIndicator] = useState<IndicatorStyle>({
    top: 0,
    height: 0,
    opacity: 0,
  });
  const [isLifted, setIsLifted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTab, setPreviewTab] = useState<NavTab | null>(null);

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const indicatorReady = indicator.opacity > 0 && indicator.height > 0;

  const measureTab = useCallback((tab: NavTab) => {
    const nav = navRef.current;
    const el = itemRefs.current[tab];
    if (!nav || !el) return null;

    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    return {
      top: elRect.top - navRect.top,
      height: elRect.height,
      opacity: 1,
    };
  }, []);

  const updateIndicator = useCallback(
    (tab: NavTab = activeTab) => {
      const next = measureTab(tab);
      if (next) setIndicator(next);
    },
    [activeTab, measureTab]
  );

  const findNearestTab = useCallback(
    (clientY: number): NavTab => {
      let nearest = visibleItems[0].id;
      let minDistance = Infinity;

      for (const item of visibleItems) {
        const el = itemRefs.current[item.id];
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(clientY - center);

        if (distance < minDistance) {
          minDistance = distance;
          nearest = item.id;
        }
      }

      return nearest;
    },
    [visibleItems]
  );

  const moveIndicatorToTab = useCallback(
    (tab: NavTab) => {
      const next = measureTab(tab);
      if (next) setIndicator(next);
      setPreviewTab(tab);
    },
    [measureTab]
  );

  const endDrag = useCallback(
    (clientY: number) => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      setIsDragging(false);
      setIsLifted(false);

      const targetTab = previewTab ?? findNearestTab(clientY);
      setPreviewTab(null);

      if (targetTab !== activeTab) {
        skipLiftRef.current = true;
        onTabChange(targetTab);
      } else {
        updateIndicator(activeTab);
      }
    },
    [activeTab, findNearestTab, onTabChange, previewTab, updateIndicator]
  );

  const handleNavPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-nav-item]")) return;

    const tabAtPointer = findNearestTab(event.clientY);
    if (tabAtPointer !== activeTab) return;

    pointerRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      armed: true,
    };
  };

  const handleNavPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (!pointer?.armed || event.pointerId !== pointer.id) return;

    const delta = Math.abs(event.clientY - pointer.startY);

    if (!isDraggingRef.current && delta < DRAG_THRESHOLD) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
      setIsLifted(true);
      setPreviewTab(activeTab);
      navRef.current?.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    moveIndicatorToTab(findNearestTab(event.clientY));
  };

  const handleNavPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || event.pointerId !== pointer.id) return;

    pointerRef.current = null;

    if (isDraggingRef.current) {
      navRef.current?.releasePointerCapture(event.pointerId);
      endDrag(event.clientY);
    }
  };

  const handleIndicatorTransitionEnd = (
    event: React.TransitionEvent<HTMLDivElement>
  ) => {
    if (event.propertyName !== "transform" || isDraggingRef.current) return;
    setIsLifted(false);
  };

  useLayoutEffect(() => {
    if (isDraggingRef.current) return;

    const isFirstPaint = prevTabRef.current === null;

    if (skipLiftRef.current) {
      skipLiftRef.current = false;
      updateIndicator(activeTab);
      prevTabRef.current = activeTab;
      return;
    }

    const isTabChange =
      prevTabRef.current !== null && prevTabRef.current !== activeTab;

    if (isFirstPaint) {
      updateIndicator(activeTab);
      prevTabRef.current = activeTab;
      return;
    }

    if (isTabChange) {
      setIsLifted(true);

      if (travelTimerRef.current) clearTimeout(travelTimerRef.current);
      travelTimerRef.current = setTimeout(() => {
        updateIndicator(activeTab);
      }, 60);
    } else {
      updateIndicator(activeTab);
    }

    prevTabRef.current = activeTab;
  }, [updateIndicator, visibleItems.length, activeTab]);

  useLayoutEffect(() => {
    return () => {
      if (travelTimerRef.current) clearTimeout(travelTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleResize = () => {
      if (!isDraggingRef.current) updateIndicator();
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(nav);
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [updateIndicator]);

  const highlightedTab =
    isDragging && previewTab
      ? previewTab
      : indicatorReady
        ? activeTab
        : null;

  return (
    <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="border-b border-border px-5 py-5">
        <Logo size="sm" showText layout="stacked" />
      </div>

      <nav
        ref={navRef}
        className="relative min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3 py-4 touch-none"
        onPointerDown={handleNavPointerDown}
        onPointerMove={handleNavPointerMove}
        onPointerUp={handleNavPointerUp}
        onPointerCancel={handleNavPointerUp}
      >
        <div
          aria-hidden
          className="nav-track pointer-events-none absolute inset-x-3 inset-y-4 rounded-2xl"
        />

        <div
          aria-hidden
          onTransitionEnd={handleIndicatorTransitionEnd}
          className={`nav-indicator pointer-events-none absolute right-3 left-3 z-[1] ${
            isLifted ? "nav-indicator--lifted" : ""
          } ${isDragging ? "nav-indicator--dragging" : ""}`}
          style={
            {
              "--indicator-y": `${indicator.top}px`,
              "--indicator-h": `${indicator.height}px`,
              opacity: indicator.opacity,
            } as React.CSSProperties
          }
        />

        {visibleItems.map((item) => {
          const highlighted = highlightedTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              data-nav-item
              ref={(el) => {
                if (el) itemRefs.current[item.id] = el;
              }}
              onMouseEnter={() => router.prefetch(tabToPath(item.id))}
              onFocus={() => router.prefetch(tabToPath(item.id))}
              onClick={() => {
                if (!isDraggingRef.current) onTabChange(item.id);
              }}
              className={`relative z-10 flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                highlighted ? "text-white nav-item-active" : "text-zinc-600"
              }`}
            >
              <span
                className={`relative z-10 ${
                  highlighted ? "text-white" : "text-zinc-500"
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`relative z-10 ${
                  highlighted && !isDragging ? "nav-item-label-active" : ""
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        {user && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-brand-muted/60 px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {user.fullName}
              </p>
              <p className="truncate text-xs capitalize text-zinc-400">
                {user.role}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
