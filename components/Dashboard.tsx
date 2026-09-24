"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import CallPanel from "@/components/CallPanel";
import ChatApp from "@/components/ChatApp";
import MobileNav from "@/components/MobileNav";
import Sidebar, { type NavTab } from "@/components/Sidebar";
import TabPanel from "@/components/TabPanel";
import { VoiceCallProvider } from "@/components/VoiceCallProvider";
import Campaigns from "@/components/Campaigns";
import CostDashboard from "@/components/CostDashboard";
import InvoiceGenerator from "@/components/InvoiceGenerator";
import AppPageFrame from "@/components/AppPageFrame";
import MessageNotificationControls from "@/components/messages/MessageNotificationControls";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import UserManagement from "@/components/UserManagement";
import { APP_TESTING_BADGE } from "@/lib/app-layout";
import { apiFetch, setAuthToken } from "@/lib/api-client";
import {
  isAdminTab,
  isCampaignAppPath,
  normalizeAppPathname,
  pathnameToTab,
  resolveTabFromPathname,
  tabToPath,
} from "@/lib/navigation";

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "employee";
}

interface DashboardProps {
  initialUser: CurrentUser | null;
}

export default function Dashboard({ initialUser }: DashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = initialUser;
  const routeTab = useMemo(() => resolveTabFromPathname(pathname), [pathname]);
  const [pendingTab, setPendingTab] = useState<NavTab | null>(null);
  const [, startTransition] = useTransition();
  const activeTab = pendingTab ?? routeTab;
  const [mountedTabs, setMountedTabs] = useState<Set<NavTab>>(
    () => new Set([routeTab])
  );
  const [callPrefillPhone, setCallPrefillPhone] = useState<string | null>(null);

  const markTabMounted = useCallback((tab: NavTab) => {
    setMountedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  useEffect(() => {
    markTabMounted(routeTab);
    if (pendingTab === routeTab) {
      setPendingTab(null);
    }
  }, [routeTab, pendingTab, markTabMounted]);

  const handleLogout = async () => {
    setAuthToken(null);
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isAdmin = user?.role === "admin";

  const pageTitles: Record<NavTab, string> = {
    messages: "Messages",
    calls: "Live Calls",
    campaign: "Campaigns",
    cost: "Cost & Usage",
    team: isAdmin ? "Team Management" : "Teams",
    invoices: "Invoice Generator",
  };

  useEffect(() => {
    const canonicalPath = normalizeAppPathname(pathname);
    if (canonicalPath !== pathname) {
      router.replace(canonicalPath);
      return;
    }

    if (isCampaignAppPath(pathname)) {
      if (!isAdmin) {
        router.replace("/messages");
        return;
      }
    } else if (pathnameToTab(pathname) === null) {
      router.replace("/messages");
      return;
    } else if (!isAdmin && isAdminTab(routeTab)) {
      router.replace("/messages");
      return;
    }
  }, [isAdmin, pathname, router, routeTab]);

  const handleTabChange = (tab: NavTab) => {
    if (tab === activeTab) return;
    markTabMounted(tab);
    setPendingTab(tab);
    startTransition(() => {
      router.push(tabToPath(tab));
    });
  };

  const isTabMounted = (tab: NavTab) => mountedTabs.has(tab);

  return (
    <VoiceCallProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          user={user}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <h1
                className="truncate text-base font-semibold text-foreground sm:text-lg"
              >
                {pageTitles[activeTab]}
              </h1>
              {activeTab === "cost" && (
                <span className={APP_TESTING_BADGE}>Testing only</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              {user && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600"
                aria-label="Logout"
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
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          </header>

          {user ? <MessageNotificationControls variant="banner" /> : null}

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <TabPanel
              activeTab={activeTab}
              tab="messages"
              mounted={isTabMounted("messages")}
              className="flex min-h-0 flex-col overflow-hidden"
            >
              <ChatApp />
            </TabPanel>

            <TabPanel
              activeTab={activeTab}
              tab="calls"
              mounted={isTabMounted("calls")}
              className="min-h-0 overflow-hidden"
            >
              <AppPageFrame fillHeight>
                <CallPanel
                  prefillPhone={callPrefillPhone}
                  currentUser={
                    user ? { id: user.id, fullName: user.fullName } : null
                  }
                />
              </AppPageFrame>
            </TabPanel>

            {isAdmin && (
              <TabPanel
                activeTab={activeTab}
                tab="campaign"
                mounted={isTabMounted("campaign")}
                className="min-h-0 overflow-hidden"
              >
                <AppPageFrame>
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Campaigns />
                  </Suspense>
                </AppPageFrame>
              </TabPanel>
            )}

            {isAdmin && (
              <TabPanel
                activeTab={activeTab}
                tab="cost"
                mounted={isTabMounted("cost")}
                className="min-h-0 overflow-hidden"
              >
                <AppPageFrame>
                  <CostDashboard />
                </AppPageFrame>
              </TabPanel>
            )}

            <TabPanel
              activeTab={activeTab}
              tab="team"
              mounted={isTabMounted("team")}
              className="min-h-0 overflow-hidden"
            >
              <AppPageFrame>
                <UserManagement canInvite={isAdmin} />
              </AppPageFrame>
            </TabPanel>

            {isAdmin && (
              <TabPanel
                activeTab={activeTab}
                tab="invoices"
                mounted={isTabMounted("invoices")}
                className="min-h-0 overflow-hidden"
              >
                <AppPageFrame>
                  <InvoiceGenerator />
                </AppPageFrame>
              </TabPanel>
            )}
          </div>
        </div>

        <MobileNav
          activeTab={activeTab}
          isAdmin={isAdmin}
          onTabChange={handleTabChange}
        />
      </div>
    </VoiceCallProvider>
  );
}
