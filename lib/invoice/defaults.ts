import type { InvoiceData } from "@/lib/invoice/types";

export const defaultInvoiceData: InvoiceData = {
  invoiceDate: "09/01/2026",
  paymentTerms: "Due Upon Receipt",
  servicePeriod: "September 2026",
  billToName: "Trey Hiesel",
  billToCompany: "1st Class Real Estate Flagship",
  billToAddress: "200 Golden Oak Court Suite 305, Virginia Beach, VA, 23452",
  billToEmail: "trey@treyhiesel.com",
  vaPackage: "Part Time Virtual Assistant",
  assignedResources: "Caroline",
  serviceType: "Virtual Assistant",
  billingFrequency: "Monthly, Paid Upfront",
  lineItems: [
    {
      description: "Part Time Virtual Assistant",
      subDescription: "Monthly virtual assistant / outsourced support services",
      servicePeriod: "September 2026",
      qty: 1,
      rate: 800,
    },
  ],
  paymentTermsText:
    "This invoice is billed in advance and covers the full service period stated above. Payment is due prior to the start of the applicable service month.",
  paymentMethod: "ACH / Wire / Credit Card / Other",
  paymentInstructions: "",
  notes:
    "Thank you for partnering with RevenelX. For billing questions, contact info@revenelx.com.",
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function calculateInvoiceTotal(lineItems: InvoiceData["lineItems"]): number {
  return lineItems.reduce((sum, item) => sum + item.qty * item.rate, 0);
}
