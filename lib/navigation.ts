import type { NavTab } from "@/components/Sidebar";

export const TAB_ORDER: NavTab[] = [
  "messages",
  "calls",
  "campaign",
  "team",
  "invoices",
];

export const TAB_ROUTES: Record<NavTab, string> = {
  messages: "/messages",
  calls: "/calls",
  campaign: "/campaign",
  team: "/team",
  invoices: "/invoices",
};

const ADMIN_TABS = new Set<NavTab>(["campaign", "invoices"]);

/** @deprecated Old nav id from earlier builds — maps to campaign */
export type LegacyNavTab = "bulk";

export function normalizeNavTab(tab: NavTab | LegacyNavTab): NavTab {
  return tab === "bulk" ? "campaign" : tab;
}

export function tabToPath(tab: NavTab | LegacyNavTab): string {
  return TAB_ROUTES[normalizeNavTab(tab)];
}

export function pathnameToTab(pathname: string): NavTab | null {
  const canonicalPath = pathname === "/bulk" ? "/campaign" : pathname;
  const entry = Object.entries(TAB_ROUTES).find(([, path]) => path === canonicalPath);
  return entry ? (entry[0] as NavTab) : null;
}

export function isAdminTab(tab: NavTab | LegacyNavTab): boolean {
  return ADMIN_TABS.has(normalizeNavTab(tab));
}
