"use client";

import { useState } from "react";

interface NewContactComposerProps {
  disabled?: boolean;
  children?: React.ReactNode;
  onCreate: (input: {
    name: string;
    phone: string;
    message: string;
  }) => Promise<string | null>;
}

export default function NewContactComposer({
  disabled = false,
  children,
  onCreate,
}: NewContactComposerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const failure = await onCreate({ name, phone, message });
      if (failure) {
        setError(failure);
        return;
      }
      setName("");
      setPhone("");
      setMessage("");
      setOpen(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">{children}</div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-brand px-2.5 text-xs font-medium text-white shadow-sm shadow-brand/20 transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 rounded-xl border border-border bg-brand-muted/40 p-3"
        >
          <p className="text-xs font-semibold text-foreground">New contact</p>
          <p className="mt-0.5 text-[11px] leading-4 text-zinc-400">
            Add a number and send the first message.
          </p>

          <label className="mt-3 block text-[11px] font-medium text-zinc-500">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground outline-none ring-brand/30 placeholder:text-zinc-300 focus:ring-2"
            />
          </label>

          <label className="mt-2 block text-[11px] font-medium text-zinc-500">
            Phone number
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              autoComplete="tel"
              required
              className="mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground outline-none ring-brand/30 placeholder:text-zinc-300 focus:ring-2"
            />
          </label>

          <label className="mt-2 block text-[11px] font-medium text-zinc-500">
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a message"
              required
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground outline-none ring-brand/30 placeholder:text-zinc-300 focus:ring-2"
            />
          </label>

          {error && (
            <p className="mt-2 text-[11px] leading-4 text-red-600">{error}</p>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-brand-light disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || disabled}
              className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
