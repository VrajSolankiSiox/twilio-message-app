"use client";

import { useLayoutEffect, useRef } from "react";
import type { NavTab } from "@/components/Sidebar";

interface TabPanelProps {
  activeTab: NavTab;
  tab: NavTab;
  direction: number;
  className?: string;
  children: React.ReactNode;
}

export default function TabPanel({
  activeTab,
  tab,
  direction,
  className = "",
  children,
}: TabPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isActive = activeTab === tab;
  const animClass =
    direction >= 0 ? "tab-panel-enter-forward" : "tab-panel-enter-back";

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !isActive) return;

    panel.classList.remove("tab-panel-enter-forward", "tab-panel-enter-back");
    void panel.offsetWidth;
    panel.classList.add(animClass);
  }, [isActive, animClass]);

  return (
    <div
      ref={panelRef}
      className={`absolute inset-0 ${className} ${
        isActive ? animClass : "hidden"
      }`}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}
