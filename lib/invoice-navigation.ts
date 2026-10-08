import { normalizeAppPathname } from "@/lib/navigation";

export const INVOICE_ROUTES = {
  list: "/invoices",
  new: "/invoices/new",
  detail: (id: string) => `/invoices/${id}`,
} as const;

export type InvoiceView = "list" | "create" | "detail";

export function invoiceViewFromPath(pathname: string): InvoiceView {
  const path = normalizeAppPathname(pathname);
  if (path === INVOICE_ROUTES.new) return "create";
  if (path.startsWith("/invoices/")) return "detail";
  return "list";
}

export function invoiceDetailIdFromPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  if (!path.startsWith("/invoices/") || path === INVOICE_ROUTES.new) {
    return null;
  }
  const id = path.slice("/invoices/".length).split("/")[0]?.trim();
  return id || null;
}
