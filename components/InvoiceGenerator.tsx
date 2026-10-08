"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  calculateInvoiceTotal,
  defaultInvoiceData,
  formatCurrency,
} from "@/lib/invoice/defaults";
import {
  INVOICE_LOGO_FALLBACK,
  INVOICE_LOGO_PATH,
} from "@/lib/invoice/constants";
import type {
  InvoiceData,
  InvoiceLineItem,
  SavedInvoice,
} from "@/lib/invoice/types";
import { APP_INPUT, APP_LABEL, APP_SECTION_LG, APP_SECTION_TITLE } from "@/lib/app-layout";
import { apiFetch } from "@/lib/api-client";
import {
  INVOICE_ROUTES,
  invoiceDetailIdFromPath,
  invoiceViewFromPath,
} from "@/lib/invoice-navigation";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={APP_SECTION_LG}>
      <h2 className={`mb-4 ${APP_SECTION_TITLE}`}>{title}</h2>
      {children}
    </section>
  );
}

function cloneInvoiceData(data: InvoiceData): InvoiceData {
  return {
    ...data,
    lineItems: data.lineItems.map((item) => ({ ...item })),
  };
}

function defaultSavedName(data: InvoiceData): string {
  const customer = data.billToCompany.trim() || data.billToName.trim();
  return [customer, data.servicePeriod.trim()].filter(Boolean).join(" — ") ||
    "Untitled invoice";
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function InvoiceGenerator() {
  const pathname = usePathname();
  const router = useRouter();
  const view = invoiceViewFromPath(pathname);
  const detailId = invoiceDetailIdFromPath(pathname);
  const [form, setForm] = useState<InvoiceData>(() =>
    cloneInvoiceData(defaultInvoiceData)
  );
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<InvoiceData | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const initializedPath = useRef<string | null>(null);

  const total = calculateInvoiceTotal(form.lineItems);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/invoices")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Failed to load saved invoices");
        }
        if (!cancelled) setSavedInvoices(result.invoices ?? []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load saved invoices"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initializedPath.current === pathname) return;
    initializedPath.current = pathname;
    if (view !== "create") return;
    setSelectedInvoiceId(null);
    setSavedName("");
    setSavedSnapshot(null);
    setForm(cloneInvoiceData(defaultInvoiceData));
    setError(null);
    setSuccess(null);
  }, [pathname, view]);

  useEffect(() => {
    if (
      view === "detail" &&
      detailId &&
      !loadingSaved &&
      selectedInvoiceId !== detailId
    ) {
      const invoice = savedInvoices.find((item) => item.id === detailId);
      if (!invoice) return;
      const data = cloneInvoiceData(invoice.data);
      setSelectedInvoiceId(invoice.id);
      setSavedName(invoice.name);
      setSavedSnapshot(cloneInvoiceData(data));
      setForm(data);
      setError(null);
      setSuccess(null);
    }
  }, [
    detailId,
    loadingSaved,
    savedInvoices,
    selectedInvoiceId,
    view,
  ]);

  const updateField = <K extends keyof InvoiceData>(
    key: K,
    value: InvoiceData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateLineItem = (
    index: number,
    key: keyof InvoiceLineItem,
    value: string | number
  ) => {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addLineItem = () => {
    setForm((prev) => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        {
          description: "",
          subDescription: "",
          servicePeriod: prev.servicePeriod,
          qty: 1,
          rate: 0,
        },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    if (form.lineItems.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
  };

  const startNewInvoice = () => {
    setSelectedInvoiceId(null);
    setSavedName("");
    setSavedSnapshot(null);
    setForm(cloneInvoiceData(defaultInvoiceData));
    setError(null);
    setSuccess(null);
    router.push(INVOICE_ROUTES.new);
  };

  const handleReset = () => {
    setForm(
      cloneInvoiceData(selectedInvoiceId && savedSnapshot
        ? savedSnapshot
        : defaultInvoiceData)
    );
    setSuccess(null);
  };

  const handleSave = async () => {
    const name = savedName.trim() || defaultSavedName(form);
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(
        selectedInvoiceId
          ? `/api/invoices/${selectedInvoiceId}`
          : "/api/invoices",
        {
          method: selectedInvoiceId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, data: form }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save invoice");
      }

      const invoice = result.invoice as SavedInvoice;
      setSelectedInvoiceId(invoice.id);
      setSavedName(invoice.name);
      setSavedSnapshot(cloneInvoiceData(invoice.data));
      setSavedInvoices((current) => [
        invoice,
        ...current.filter((item) => item.id !== invoice.id),
      ]);
      setSuccess(
        selectedInvoiceId
          ? "Invoice changes saved."
          : "Invoice configuration saved."
      );
      router.push(INVOICE_ROUTES.list);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save invoice"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (invoice: SavedInvoice) => {
    if (
      !window.confirm(
        `Delete "${invoice.name}"? This saved invoice cannot be recovered.`
      )
    ) {
      return;
    }

    setDeletingId(invoice.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete invoice");
      }
      setSavedInvoices((current) =>
        current.filter((item) => item.id !== invoice.id)
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete invoice"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const [{ pdf }, { default: InvoiceDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/invoice/InvoiceDocument"),
      ]);

      const localLogo = `${window.location.origin}${INVOICE_LOGO_PATH}`;
      let logoSrc = localLogo;
      try {
        const res = await fetch(localLogo, { method: "HEAD" });
        if (!res.ok) logoSrc = INVOICE_LOGO_FALLBACK;
      } catch {
        logoSrc = INVOICE_LOGO_FALLBACK;
      }
      const blob = await pdf(
        <InvoiceDocument data={form} logoSrc={logoSrc} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `revenelx-invoice-${form.invoiceDate.replace(/\//g, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  if (view === "list") {
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="max-w-lg text-sm leading-relaxed text-zinc-500">
              Open a saved invoice to update its values, or add a new invoice for
              another billing period.
            </p>
            {!loadingSaved && savedInvoices.length > 0 && (
              <p className="mt-2 text-xs font-medium text-zinc-400">
                {savedInvoices.length} saved invoice
                {savedInvoices.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={startNewInvoice}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            <span className="text-lg leading-none" aria-hidden>+</span>
            Add invoice
          </button>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loadingSaved ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl border border-border bg-brand-muted/30"
              />
            ))}
          </div>
        ) : savedInvoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <h2 className="text-base font-semibold text-foreground">
              No saved invoices yet
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Add your first invoice and save it for future billing periods.
            </p>
            <button
              type="button"
              onClick={startNewInvoice}
              className="mt-5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Add invoice
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="divide-y divide-border">
              {savedInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {invoice.name}
                    </h2>
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {invoice.data.billToCompany ||
                        invoice.data.billToName ||
                        "No customer"}
                      {invoice.data.servicePeriod
                        ? ` · ${invoice.data.servicePeriod}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Updated {formatUpdatedAt(invoice.updatedAt)} ·{" "}
                      {formatCurrency(
                        calculateInvoiceTotal(invoice.data.lineItems)
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(invoice)}
                      disabled={deletingId === invoice.id}
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === invoice.id ? "Deleting..." : "Delete"}
                    </button>
                    <Link
                      href={INVOICE_ROUTES.detail(invoice.id)}
                      className="inline-flex items-center justify-center rounded-xl border border-brand px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-muted"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "detail" && loadingSaved) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-brand-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-brand-muted/40" />
      </div>
    );
  }

  if (
    view === "detail" &&
    !savedInvoices.some((invoice) => invoice.id === detailId)
  ) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">
          Invoice not found
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          This invoice may have been removed or belongs to another user.
        </p>
        <Link
          href={INVOICE_ROUTES.list}
          className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Back to saved invoices
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4 border-b border-border pb-6">
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <Link
            href={INVOICE_ROUTES.list}
            className="font-medium text-zinc-500 transition-colors hover:text-brand"
          >
            Saved invoices
          </Link>
          <span className="text-zinc-300" aria-hidden>/</span>
          <span className="truncate font-medium text-foreground">
            {view === "create" ? "Add invoice" : savedName || "Edit invoice"}
          </span>
        </nav>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {view === "create" ? "Add invoice" : "Edit invoice"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {view === "create"
              ? "Enter the invoice values, then save the configuration for future use."
              : "Update the saved values or generate a new PDF from this configuration."}
          </p>
        </div>
      </header>

      <Section title="Configuration">
        <div className="max-w-lg">
          <label className={APP_LABEL}>Invoice name</label>
          <input
            type="text"
            value={savedName}
            maxLength={120}
            onChange={(event) => setSavedName(event.target.value)}
            className={APP_INPUT}
            placeholder={defaultSavedName(form)}
          />
        </div>
      </Section>

      <Section title="Invoice Details">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={APP_LABEL}>Invoice Date</label>
            <input
              type="text"
              value={form.invoiceDate}
              onChange={(e) => updateField("invoiceDate", e.target.value)}
              className={APP_INPUT}
              placeholder="MM/DD/YYYY"
            />
          </div>
          <div>
            <label className={APP_LABEL}>Payment Terms</label>
            <input
              type="text"
              value={form.paymentTerms}
              onChange={(e) => updateField("paymentTerms", e.target.value)}
              className={APP_INPUT}
            />
          </div>
          <div>
            <label className={APP_LABEL}>Service Period</label>
            <input
              type="text"
              value={form.servicePeriod}
              onChange={(e) => updateField("servicePeriod", e.target.value)}
              className={APP_INPUT}
            />
          </div>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Bill To">
          <div className="space-y-4">
            <div>
              <label className={APP_LABEL}>Name</label>
              <input
                type="text"
                value={form.billToName}
                onChange={(e) => updateField("billToName", e.target.value)}
                className={APP_INPUT}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Company</label>
              <input
                type="text"
                value={form.billToCompany}
                onChange={(e) => updateField("billToCompany", e.target.value)}
                className={APP_INPUT}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Address</label>
              <textarea
                value={form.billToAddress}
                onChange={(e) => updateField("billToAddress", e.target.value)}
                rows={2}
                className={`${APP_INPUT} resize-none`}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Email</label>
              <input
                type="email"
                value={form.billToEmail}
                onChange={(e) => updateField("billToEmail", e.target.value)}
                className={APP_INPUT}
              />
            </div>
          </div>
        </Section>

        <Section title="Service Details">
          <div className="space-y-4">
            <div>
              <label className={APP_LABEL}>VA Package</label>
              <input
                type="text"
                value={form.vaPackage}
                onChange={(e) => updateField("vaPackage", e.target.value)}
                className={APP_INPUT}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Assigned Resource(s)</label>
              <input
                type="text"
                value={form.assignedResources}
                onChange={(e) => updateField("assignedResources", e.target.value)}
                className={APP_INPUT}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Service Type</label>
              <input
                type="text"
                value={form.serviceType}
                onChange={(e) => updateField("serviceType", e.target.value)}
                className={APP_INPUT}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Billing Frequency</label>
              <input
                type="text"
                value={form.billingFrequency}
                onChange={(e) => updateField("billingFrequency", e.target.value)}
                className={APP_INPUT}
              />
            </div>
          </div>
        </Section>
      </div>

      <Section title="Line Items">
        <div className="space-y-4">
          {form.lineItems.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-brand-muted/20 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Item {index + 1}
                </p>
                {form.lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="text-xs font-medium text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={APP_LABEL}>Description</label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) =>
                      updateLineItem(index, "description", e.target.value)
                    }
                    className={APP_INPUT}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={APP_LABEL}>Sub-description</label>
                  <input
                    type="text"
                    value={item.subDescription}
                    onChange={(e) =>
                      updateLineItem(index, "subDescription", e.target.value)
                    }
                    className={APP_INPUT}
                  />
                </div>
                <div>
                  <label className={APP_LABEL}>Service Period</label>
                  <input
                    type="text"
                    value={item.servicePeriod}
                    onChange={(e) =>
                      updateLineItem(index, "servicePeriod", e.target.value)
                    }
                    className={APP_INPUT}
                  />
                </div>
                <div>
                  <label className={APP_LABEL}>Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) =>
                      updateLineItem(index, "qty", Number(e.target.value) || 0)
                    }
                    className={APP_INPUT}
                  />
                </div>
                <div>
                  <label className={APP_LABEL}>Rate ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.rate}
                    onChange={(e) =>
                      updateLineItem(index, "rate", Number(e.target.value) || 0)
                    }
                    className={APP_INPUT}
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-sm text-zinc-500">
                    Amount:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.qty * item.rate)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addLineItem}
            className="text-sm font-medium text-brand hover:text-brand-hover"
          >
            + Add line item
          </button>
        </div>
      </Section>

      <Section title="Payment & Notes">
        <div className="space-y-4">
          <div>
            <label className={APP_LABEL}>Payment Terms Text</label>
            <textarea
              value={form.paymentTermsText}
              onChange={(e) => updateField("paymentTermsText", e.target.value)}
              rows={3}
              className={`${APP_INPUT} resize-none`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={APP_LABEL}>Payment Method</label>
              <input
                type="text"
                value={form.paymentMethod}
                onChange={(e) => updateField("paymentMethod", e.target.value)}
                className={APP_INPUT}
              />
            </div>
            <div>
              <label className={APP_LABEL}>Payment Instructions</label>
              <textarea
                value={form.paymentInstructions}
                onChange={(e) =>
                  updateField("paymentInstructions", e.target.value)
                }
                rows={2}
                className={`${APP_INPUT} resize-none`}
              />
            </div>
          </div>
          <div>
            <label className={APP_LABEL}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={2}
              className={`${APP_INPUT} resize-none`}
            />
          </div>
        </div>
      </Section>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm text-zinc-500">Total due</p>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(total)}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-brand-muted"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl border border-brand bg-white px-5 py-2.5 text-sm font-semibold text-brand transition-colors hover:bg-brand-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : selectedInvoiceId
                ? "Save changes"
                : "Save configuration"}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate PDF"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}
    </div>
  );
}
