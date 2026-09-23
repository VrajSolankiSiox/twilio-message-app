"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { APP_INPUT, APP_LABEL, APP_SECTION_LG, APP_SECTION_TITLE } from "@/lib/app-layout";

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  createdAt: string;
}

interface UserManagementProps {
  canInvite?: boolean;
}

export default function UserManagement({ canInvite = false }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load users");
        return;
      }
      setUsers(data.users);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to invite user");
        return;
      }

      setSuccess(`${fullName} has been invited successfully`);
      setFullName("");
      setEmail("");
      setPassword("");
      fetchUsers();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {canInvite && (
        <section className={APP_SECTION_LG}>
          <h2 className={`mb-1 ${APP_SECTION_TITLE}`}>Invite</h2>
          <p className="mb-5 text-base font-medium text-foreground">
            Add a new team member
          </p>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={APP_LABEL}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="John Doe"
                  className={APP_INPUT}
                />
              </div>
              <div>
                <label className={APP_LABEL}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="john@revenelx.com"
                  className={APP_INPUT}
                />
              </div>
              <div>
                <label className={APP_LABEL}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className={APP_INPUT}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {submitting ? "Inviting..." : "Invite User"}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}
        </section>
      )}

      {error && !canInvite && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={APP_SECTION_LG}>
        <h2 className={`mb-4 ${APP_SECTION_TITLE}`}>
          Team Members ({users.length})
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand">
                    {user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user.fullName}
                    </p>
                    <p className="truncate text-xs text-zinc-400">{user.email}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    user.role === "admin"
                      ? "bg-brand text-white"
                      : "bg-brand-light text-brand"
                  }`}
                >
                  {user.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
