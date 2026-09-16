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

export default function MobileNav({
  activeTab,
  isAdmin,
  onTabChange,
}: MobileNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Partial<Record<NavTab, HTMLButtonElement>>>({});

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

  useLayoutEffect(() => {
    updateTarget(activeTab);
  }, [activeTab, updateTarget, visibleItems]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleResize = () => updateTarget(activeTab);

    const observer = new ResizeObserver(handleResize);
    observer.observe(nav);
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [activeTab, updateTarget]);

  const highlightedTab = indicatorReady ? activeTab : null;

  return (
    <nav
      className="mobile-nav-shell fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Main navigation"
    >
      <div
        ref={navRef}
        className="relative flex h-14 items-stretch px-1.5"
        style={{ height: NAV_HEIGHT }}
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
        />

        {visibleItems.map((item) => {
          const highlighted = highlightedTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              ref={(el) => {
                if (el) itemRefs.current[item.id] = el;
              }}
              onClick={() => onTabChange(item.id)}
              className={`relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors duration-300 ${
                highlighted
                  ? "text-brand mobile-nav-item-active"
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
