export interface InvoiceLineItem {
  description: string;
  subDescription: string;
  servicePeriod: string;
  qty: number;
  rate: number;
}

export interface InvoiceData {
  invoiceDate: string;
  paymentTerms: string;
  servicePeriod: string;
  billToName: string;
  billToCompany: string;
  billToAddress: string;
  billToEmail: string;
  vaPackage: string;
  assignedResources: string;
  serviceType: string;
  billingFrequency: string;
  lineItems: InvoiceLineItem[];
  paymentTermsText: string;
  paymentMethod: string;
  paymentInstructions: string;
  notes: string;
}
