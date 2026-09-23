"use client";

import { useState } from "react";
import {
  calculateInvoiceTotal,
  defaultInvoiceData,
  formatCurrency,
} from "@/lib/invoice/defaults";
import {
  INVOICE_LOGO_FALLBACK,
  INVOICE_LOGO_PATH,
} from "@/lib/invoice/constants";
import type { InvoiceData, InvoiceLineItem } from "@/lib/invoice/types";
import { APP_INPUT, APP_LABEL, APP_SECTION_LG, APP_SECTION_TITLE } from "@/lib/app-layout";

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

export default function InvoiceGenerator() {
  const [form, setForm] = useState<InvoiceData>(defaultInvoiceData);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = calculateInvoiceTotal(form.lineItems);

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

  return (
    <div className="space-y-6">
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
            onClick={() => setForm(defaultInvoiceData)}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-brand-muted"
          >
            Reset
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
    </div>
  );
}
