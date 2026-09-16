import type { NavTab } from "@/components/Sidebar";

export const TAB_ORDER: NavTab[] = [
  "messages",
  "calls",
  "bulk",
  "team",
  "invoices",
];

export const TAB_ROUTES: Record<NavTab, string> = {
  messages: "/messages",
  calls: "/calls",
  bulk: "/bulk",
  team: "/team",
  invoices: "/invoices",
};

const ADMIN_TABS = new Set<NavTab>(["bulk", "invoices"]);

export function tabToPath(tab: NavTab): string {
  return TAB_ROUTES[tab];
}

export function pathnameToTab(pathname: string): NavTab | null {
  const entry = Object.entries(TAB_ROUTES).find(([, path]) => path === pathname);
  return entry ? (entry[0] as NavTab) : null;
}

export function isAdminTab(tab: NavTab): boolean {
  return ADMIN_TABS.has(tab);
}
