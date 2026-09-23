"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import CallPanel from "@/components/CallPanel";
import ChatApp from "@/components/ChatApp";
import MobileNav from "@/components/MobileNav";
import Sidebar, { type NavTab } from "@/components/Sidebar";
import TabPanel from "@/components/TabPanel";
import { VoiceCallProvider } from "@/components/VoiceCallProvider";
import Campaigns from "@/components/Campaigns";
import InvoiceGenerator from "@/components/InvoiceGenerator";
import UserManagement from "@/components/UserManagement";
import {
  isAdminTab,
  isCampaignAppPath,
  normalizeAppPathname,
  pathnameToTab,
  TAB_ORDER,
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
  const activeTab =
    pathnameToTab(pathname) ??
    (isCampaignAppPath(pathname) ? "campaign" : "messages");
  const prevTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState(0);
  const [callPrefillPhone, setCallPrefillPhone] = useState<string | null>(null);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isAdmin = user?.role === "admin";

  const pageTitles: Record<NavTab, string> = {
    messages: "Messages",
    calls: "Live Calls",
    campaign: "Campaigns",
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
    } else if (!isAdmin && isAdminTab(activeTab)) {
      router.replace("/messages");
      return;
    }

    const prevIndex = TAB_ORDER.indexOf(prevTabRef.current);
    const nextIndex = TAB_ORDER.indexOf(activeTab);
    if (prevTabRef.current !== activeTab) {
      setTabDirection(nextIndex >= prevIndex ? 1 : -1);
      prevTabRef.current = activeTab;
    }
  }, [activeTab, isAdmin, pathname, router]);

  const handleTabChange = (tab: NavTab) => {
    if (tab === activeTab) return;
    router.push(tabToPath(tab));
  };

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
            <h1
              key={activeTab}
              className="header-title-enter truncate text-base font-semibold text-foreground sm:text-lg"
            >
              {pageTitles[activeTab]}
            </h1>
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

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <TabPanel
              activeTab={activeTab}
              tab="messages"
              direction={tabDirection}
              className="flex min-h-0 flex-col overflow-hidden"
            >
              <ChatApp />
            </TabPanel>

            <TabPanel
              activeTab={activeTab}
              tab="calls"
              direction={tabDirection}
              className="overflow-hidden p-3 sm:p-4"
            >
              <CallPanel
                prefillPhone={callPrefillPhone}
                currentUser={
                  user ? { id: user.id, fullName: user.fullName } : null
                }
              />
            </TabPanel>

            {isAdmin && (
              <TabPanel
                activeTab={activeTab}
                tab="campaign"
                direction={tabDirection}
                className="overflow-y-auto p-4 sm:p-6"
              >
                <Suspense fallback={null}>
                  <Campaigns />
                </Suspense>
              </TabPanel>
            )}

            <TabPanel
              activeTab={activeTab}
              tab="team"
              direction={tabDirection}
              className="overflow-y-auto p-4 sm:p-6"
            >
              <div className="mx-auto max-w-3xl">
                <UserManagement canInvite={isAdmin} />
              </div>
            </TabPanel>

            {isAdmin && (
              <TabPanel
                activeTab={activeTab}
                tab="invoices"
                direction={tabDirection}
                className="overflow-y-auto p-4 sm:p-6"
              >
                <InvoiceGenerator />
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
