"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CallPanel from "@/components/CallPanel";
import ChatApp from "@/components/ChatApp";
import MobileNav from "@/components/MobileNav";
import Sidebar, { type NavTab } from "@/components/Sidebar";
import TabPanel from "@/components/TabPanel";
import { VoiceCallProvider } from "@/components/VoiceCallProvider";
import InvoiceGenerator from "@/components/InvoiceGenerator";
import UserManagement from "@/components/UserManagement";
import { parsePhoneNumbersFromFile } from "@/lib/csv";
import {
  isAdminTab,
  pathnameToTab,
  TAB_ORDER,
  tabToPath,
} from "@/lib/navigation";
import { normalizePhone } from "@/lib/phone";

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "employee";
}

interface SendResult {
  to: string;
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

interface DashboardProps {
  initialUser: CurrentUser | null;
}

const inputClass =
  "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

export default function Dashboard({ initialUser }: DashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = initialUser;
  const activeTab = pathnameToTab(pathname) ?? "messages";
  const prevTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState(0);
  const [callPrefillPhone, setCallPrefillPhone] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResults(null);

    const numbers = await parsePhoneNumbersFromFile(file);

    if (numbers.length === 0) {
      setError("No phone numbers found in the second column.");
      setPhoneNumbers([]);
      setFileName(null);
      return;
    }

    setPhoneNumbers(numbers);
    setFileName(file.name);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setError("Please enter a message.");
      return;
    }
    if (phoneNumbers.length === 0) {
      setError("Please upload a CSV with phone numbers.");
      return;
    }

    setSending(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/send?bulk=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, phoneNumbers }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send messages.");
        return;
      }

      setResults(data.results);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleClear = () => {
    setPhoneNumbers([]);
    setFileName(null);
    setMessage("");
    setResults(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isAdmin = user?.role === "admin";
  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results ? results.length - successCount : 0;

  const pageTitles: Record<NavTab, string> = {
    messages: "Messages",
    calls: "Live Calls",
    bulk: "Bulk Send",
    team: isAdmin ? "Team Management" : "Teams",
    invoices: "Invoice Generator",
  };

  useEffect(() => {
    if (pathnameToTab(pathname) === null) {
      router.replace("/messages");
      return;
    }

    if (!isAdmin && isAdminTab(activeTab)) {
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
                tab="bulk"
                direction={tabDirection}
                className="overflow-y-auto p-4 sm:p-6"
              >
                <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
                  <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
                    <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand">
                      Step 1
                    </h2>
                    <p className="mb-4 text-base font-medium text-foreground">
                      Import phone numbers
                    </p>
                    <div
                      className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/30 bg-brand-muted/50 px-6 py-12 transition-colors hover:border-brand hover:bg-brand-light"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <p className="text-sm font-medium text-foreground">
                        {fileName ? fileName : "Click to upload CSV or Excel file"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Phone numbers in the second column (.csv, .xlsx, .xls)
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    {phoneNumbers.length > 0 && (
                      <div className="mt-4 rounded-xl bg-brand-muted p-4">
                        <p className="mb-2 text-sm font-medium text-brand">
                          {phoneNumbers.length} number
                          {phoneNumbers.length !== 1 && "s"} loaded
                        </p>
                        <ul className="max-h-36 space-y-1 overflow-y-auto text-sm font-mono text-zinc-600">
                          {phoneNumbers.map((num, i) => (
                            <li key={i}>{normalizePhone(num)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
                    <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand">
                      Step 2
                    </h2>
                    <p className="mb-4 text-base font-medium text-foreground">
                      Compose your message
                    </p>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your SMS message here..."
                      rows={5}
                      className={`${inputClass} resize-none`}
                    />
                    <p className="mt-2 text-xs text-zinc-400">
                      {message.length} characters
                    </p>
                  </section>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={handleSend}
                      disabled={
                        sending || phoneNumbers.length === 0 || !message.trim()
                      }
                      className="flex-1 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending
                        ? `Sending to ${phoneNumbers.length} numbers...`
                        : `Send to ${phoneNumbers.length || 0} numbers`}
                    </button>
                    <button
                      onClick={handleClear}
                      disabled={sending}
                      className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-brand-light"
                    >
                      Clear
                    </button>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {results && (
                    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                      <div className="mb-4 flex gap-4 text-sm font-medium">
                        <span className="text-green-600">{successCount} sent</span>
                        {failCount > 0 && (
                          <span className="text-red-600">{failCount} failed</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {results.map((result, i) => (
                          <div
                            key={i}
                            className={`rounded-xl px-4 py-3 text-sm ${
                              result.success ? "bg-green-50" : "bg-red-50"
                            }`}
                          >
                            <span className="font-mono text-foreground">
                              {result.to}
                            </span>
                            {!result.success && result.error && (
                              <p className="mt-0.5 text-xs text-red-600">
                                {result.error}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
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
