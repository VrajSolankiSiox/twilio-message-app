"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ChatApp from "@/components/ChatApp";
import { parsePhoneNumbersFromFile } from "@/lib/csv";
import { normalizePhone } from "@/lib/phone";

type Tab = "messages" | "bulk";

interface SendResult {
  to: string;
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("messages");
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
      const res = await fetch("/api/send", {
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

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results ? results.length - successCount : 0;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Twilio SMS
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Chat with contacts or send bulk messages from a CSV
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-zinc-200/60 p-1 dark:bg-zinc-800/60">
          <button
            onClick={() => setActiveTab("messages")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "messages"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab("bulk")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "bulk"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Bulk Send
          </button>
        </div>

        {activeTab === "messages" && <ChatApp />}

        {activeTab === "bulk" && (
          <div className="space-y-6">
            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                1. Import CSV
              </h2>
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 px-6 py-10 transition-colors hover:border-red-400 hover:bg-red-50/50 dark:border-zinc-700 dark:hover:border-red-500 dark:hover:bg-red-950/20"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  className="mb-3 h-10 w-10 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {phoneNumbers.length} number
                    {phoneNumbers.length !== 1 && "s"} loaded
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                    <ul className="space-y-1 text-sm font-mono text-zinc-600 dark:text-zinc-400">
                      {phoneNumbers.map((num, i) => (
                        <li key={i}>{normalizePhone(num)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                2. Compose Message
              </h2>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your SMS message here..."
                rows={5}
                className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-2 text-xs text-zinc-500">
                {message.length} character{message.length !== 1 && "s"}
              </p>
            </section>

            <div className="flex gap-3">
              <button
                onClick={handleSend}
                disabled={
                  sending || phoneNumbers.length === 0 || !message.trim()
                }
                className="flex-1 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending
                  ? `Sending to ${phoneNumbers.length} numbers...`
                  : `Send to ${phoneNumbers.length || 0} numbers`}
              </button>
              <button
                onClick={handleClear}
                disabled={sending}
                className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Clear
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </div>
            )}

            {results && (
              <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Results
                </h2>
                <div className="mb-4 flex gap-4 text-sm">
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {successCount} sent
                  </span>
                  {failCount > 0 && (
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {failCount} failed
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {results.map((result, i) => (
                    <div
                      key={i}
                      className={`flex items-start justify-between rounded-lg px-4 py-3 text-sm ${
                        result.success
                          ? "bg-green-50 dark:bg-green-950/30"
                          : "bg-red-50 dark:bg-red-950/30"
                      }`}
                    >
                      <div>
                        <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                          {result.to}
                        </span>
                        {result.success && result.sid && (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            SID: {result.sid} · Status: {result.status}
                          </p>
                        )}
                        {!result.success && result.error && (
                          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                            {result.error}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          result.success
                            ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300"
                            : "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300"
                        }`}
                      >
                        {result.success ? "Sent" : "Failed"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
