"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import LiquidGlassIndicator from "@/components/LiquidGlassIndicator";
import type { NavTab } from "@/components/Sidebar";
import { NAV_ITEMS } from "@/lib/nav-items";

interface MobileNavProps {
  activeTab: NavTab;
  isAdmin: boolean;
  onTabChange: (tab: NavTab) => void;
}

interface IndicatorTarget {
  left: number;
  width: number;
  opacity: number;
}

const INDICATOR_INSET_X = 6;
const INDICATOR_INSET_Y = 5;
const NAV_HEIGHT = 56;
const DRAG_THRESHOLD = 4;

export default function MobileNav({
  activeTab,
  isAdmin,
  onTabChange,
}: MobileNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Partial<Record<NavTab, HTMLButtonElement>>>({});
  const optimisticTabRef = useRef<NavTab | null>(null);
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const pointerRef = useRef<{ id: number; startX: number; armed: boolean } | null>(
    null
  );

  const [indicatorTab, setIndicatorTab] = useState(activeTab);
  const [motionKey, setMotionKey] = useState(0);
  const [travelDirection, setTravelDirection] = useState<"left" | "right" | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [previewTab, setPreviewTab] = useState<NavTab | null>(null);

  const [target, setTarget] = useState<IndicatorTarget>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );
  const indicatorReady = target.opacity > 0 && target.width > 0;
  const blobHeight = NAV_HEIGHT - INDICATOR_INSET_Y * 2;

  const measureTab = useCallback((tab: NavTab) => {
    const nav = navRef.current;
    const el = itemRefs.current[tab];
    if (!nav || !el) return null;

    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const left = elRect.left - navRect.left + INDICATOR_INSET_X / 2;
    const width = Math.max(0, elRect.width - INDICATOR_INSET_X);

    return { left, width, opacity: 1 };
  }, []);

  const updateTarget = useCallback(
    (tab: NavTab) => {
      const next = measureTab(tab);
      if (!next) return;

      setTarget((prev) => {
        if (
          prev.left === next.left &&
          prev.width === next.width &&
          prev.opacity === next.opacity
        ) {
          return prev;
        }
        return next;
      });
    },
    [measureTab]
  );

  const findNearestTab = useCallback(
    (clientX: number): NavTab => {
      let nearest = visibleItems[0].id;
      let minDistance = Infinity;

      for (const item of visibleItems) {
        const el = itemRefs.current[item.id];
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const distance = Math.abs(clientX - center);

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
    (tab: NavTab, fromTab?: NavTab) => {
      const originTab = fromTab ?? previewTab ?? indicatorTab;
      const prevIndex = visibleItems.findIndex((item) => item.id === originTab);
      const nextIndex = visibleItems.findIndex((item) => item.id === tab);

      if (prevIndex !== -1 && nextIndex !== -1 && prevIndex !== nextIndex) {
        setTravelDirection(nextIndex >= prevIndex ? "right" : "left");
      }

      const next = measureTab(tab);
      if (next) setTarget(next);
      setPreviewTab(tab);
      setIndicatorTab(tab);
    },
    [indicatorTab, measureTab, previewTab, visibleItems]
  );

  const beginIndicatorMove = useCallback(
    (fromTab: NavTab, toTab: NavTab) => {
      const prevIndex = visibleItems.findIndex((item) => item.id === fromTab);
      const nextIndex = visibleItems.findIndex((item) => item.id === toTab);

      setTravelDirection(nextIndex >= prevIndex ? "right" : "left");
      setMotionKey((key) => key + 1);
      setIndicatorTab(toTab);

      const next = measureTab(toTab);
      if (next) {
        setTarget((prev) => {
          if (
            prev.left === next.left &&
            prev.width === next.width &&
            prev.opacity === next.opacity
          ) {
            return prev;
          }
          return next;
        });
      }
    },
    [measureTab, visibleItems]
  );

  const endDrag = useCallback(
    (clientX: number) => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      setIsDragging(false);
      didDragRef.current = true;

      const targetTab = previewTab ?? findNearestTab(clientX);
      setPreviewTab(null);

      if (targetTab !== activeTab) {
        optimisticTabRef.current = targetTab;
        setIndicatorTab(targetTab);
        updateTarget(targetTab);
        onTabChange(targetTab);
      } else {
        setIndicatorTab(activeTab);
        updateTarget(activeTab);
      }
    },
    [activeTab, findNearestTab, onTabChange, previewTab, updateTarget]
  );

  const handleTabClick = useCallback(
    (tab: NavTab) => {
      if (isDraggingRef.current || didDragRef.current) {
        didDragRef.current = false;
        return;
      }

      if (tab !== indicatorTab) {
        optimisticTabRef.current = tab;
        beginIndicatorMove(indicatorTab, tab);
      }
      onTabChange(tab);
    },
    [beginIndicatorMove, indicatorTab, onTabChange]
  );

  const handleNavPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const targetEl = event.target as HTMLElement;
    if (!targetEl.closest("[data-nav-item]")) return;

    const tabAtPointer = findNearestTab(event.clientX);
    if (tabAtPointer !== indicatorTab) return;

    didDragRef.current = false;
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      armed: true,
    };
  };

  const handleNavPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer?.armed || event.pointerId !== pointer.id) return;

    const delta = Math.abs(event.clientX - pointer.startX);

    if (!isDraggingRef.current && delta < DRAG_THRESHOLD) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
      setPreviewTab(indicatorTab);
      navRef.current?.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    moveIndicatorToTab(findNearestTab(event.clientX));
  };

  const handleNavPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || event.pointerId !== pointer.id) return;

    pointerRef.current = null;

    if (isDraggingRef.current) {
      navRef.current?.releasePointerCapture(event.pointerId);
      endDrag(event.clientX);
    }
  };

  useLayoutEffect(() => {
    if (isDraggingRef.current) return;

    updateTarget(indicatorTab);

    if (optimisticTabRef.current !== null) {
      if (activeTab === optimisticTabRef.current) {
        optimisticTabRef.current = null;
      }
      return;
    }

    if (activeTab !== indicatorTab) {
      beginIndicatorMove(indicatorTab, activeTab);
    }
  }, [activeTab, beginIndicatorMove, indicatorTab, updateTarget]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleResize = () => {
      if (!isDraggingRef.current) updateTarget(indicatorTab);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(nav);
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [indicatorTab, updateTarget]);

  const highlightedTab = indicatorReady
    ? isDragging && previewTab
      ? previewTab
      : indicatorTab
    : null;

  return (
    <nav
      className="mobile-nav-shell fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Main navigation"
    >
      <div
        ref={navRef}
        className="relative flex h-14 touch-none items-stretch px-1.5"
        style={{ height: NAV_HEIGHT }}
        onPointerDown={handleNavPointerDown}
        onPointerMove={handleNavPointerMove}
        onPointerUp={handleNavPointerUp}
        onPointerCancel={handleNavPointerUp}
      >
        <div
          aria-hidden
          className="mobile-nav-track pointer-events-none absolute inset-x-2 inset-y-1.5 rounded-2xl"
        />

        <LiquidGlassIndicator
          x={target.left}
          width={target.width}
          height={blobHeight}
          top={INDICATOR_INSET_Y}
          visible={indicatorReady}
          motionKey={motionKey}
          direction={travelDirection}
          isDragging={isDragging}
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
              onClick={() => handleTabClick(item.id)}
              className={`relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors duration-300 ${
                highlighted
                  ? `text-brand mobile-nav-item-active ${
                      !isDragging ? "cursor-grab active:cursor-grabbing" : ""
                    }`
                  : "text-zinc-500"
              }`}
            >
              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center transition-colors duration-300 ${
                  highlighted ? "text-brand" : "text-zinc-500"
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`relative z-10 max-w-full truncate text-[10px] font-medium leading-none transition-opacity duration-300 ${
                  highlighted ? "mobile-nav-label-active opacity-100" : "opacity-80"
                }`}
              >
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
