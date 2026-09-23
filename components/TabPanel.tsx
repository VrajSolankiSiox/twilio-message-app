"use client";

import type { NavTab } from "@/components/Sidebar";

interface TabPanelProps {
  activeTab: NavTab;
  tab: NavTab;
  /** When false, tab content is not mounted (lazy). */
  mounted: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function TabPanel({
  activeTab,
  tab,
  mounted,
  className = "",
  children,
}: TabPanelProps) {
  if (!mounted) return null;

  const isActive = activeTab === tab;

  return (
    <div
      className={`absolute inset-0 ${className} ${
        isActive ? "z-[1]" : "z-0 hidden"
      }`}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}
