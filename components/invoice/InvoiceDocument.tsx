import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { calculateInvoiceTotal, formatCurrency } from "@/lib/invoice/defaults";
import type { InvoiceData } from "@/lib/invoice/types";

const BLUE = "#2563EB";
const TABLE_HEADER = "#6B9FD4";
const BORDER = "#D1D5DB";
const BG_GRAY = "#F3F4F6";
const TEXT_GRAY = "#6B7280";
const TEXT_DARK = "#1F2937";

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: TEXT_DARK,
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  pageContent: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 2,
  },
  logoWrap: {
    flexShrink: 0,
    justifyContent: "center",
  },
  logo: {
    width: 188,
    height: 54,
    objectFit: "contain",
    objectPosition: "left center",
  },
  companyInfoWrap: {
    alignItems: "flex-end",
    maxWidth: 230,
  },
  companyInfo: {
    textAlign: "right",
    fontSize: 8,
    color: TEXT_GRAY,
    lineHeight: 1.5,
  },
  divider: {
    height: 4,
    backgroundColor: BLUE,
    marginBottom: 18,
    borderRadius: 2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  metaBlock: {
    gap: 4,
  },
  metaLine: {
    flexDirection: "row",
    gap: 6,
  },
  metaLabel: {
    color: TEXT_GRAY,
    fontSize: 9,
    width: 88,
  },
  metaValue: {
    color: TEXT_DARK,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  invoiceTitle: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    letterSpacing: 1,
  },
  splitBox: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  splitCol: {
    flex: 1,
  },
  splitColLeft: {
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  sectionHeader: {
    backgroundColor: BG_GRAY,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: TEXT_GRAY,
    letterSpacing: 0.6,
  },
  sectionBody: {
    padding: 10,
    minHeight: 72,
    gap: 3,
  },
  billToName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 2,
  },
  bodyText: {
    fontSize: 9,
    color: TEXT_DARK,
    lineHeight: 1.4,
  },
  detailLine: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 2,
  },
  detailLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
  },
  tableHeaderCell: {
    backgroundColor: TABLE_HEADER,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    justifyContent: "center",
  },
  tableHeaderText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    minHeight: 52,
  },
  tableCell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    justifyContent: "flex-start",
  },
  tableCellLast: {
    borderRightWidth: 0,
  },
  colDesc: { width: "40%" },
  colPeriod: { width: "18%" },
  colQty: { width: "10%" },
  colRate: { width: "16%" },
  colAmount: { width: "16%" },
  cellCenter: { textAlign: "center" },
  cellRight: { textAlign: "right" },
  descTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 3,
  },
  descSub: {
    fontSize: 8,
    color: TEXT_GRAY,
    lineHeight: 1.35,
  },
  cellText: {
    fontSize: 9,
  },
  amountBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  totalsSection: {
    marginBottom: 14,
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  subtotalLabel: {
    fontSize: 9,
    color: TEXT_DARK,
  },
  subtotalValue: {
    fontSize: 9,
    color: TEXT_DARK,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 2,
    borderTopColor: TEXT_DARK,
  },
  totalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    letterSpacing: 0.4,
    color: TEXT_DARK,
  },
  totalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: BLUE,
  },
  paymentTermsBox: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG_GRAY,
    marginBottom: 10,
    padding: 10,
  },
  paymentTermsTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: TEXT_GRAY,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  paymentTermsBody: {
    fontSize: 8.5,
    color: TEXT_DARK,
    lineHeight: 1.45,
  },
  bottomBox: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },
  bottomCol: {
    flex: 1,
    padding: 10,
  },
  bottomColLeft: {
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  bottomTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: TEXT_GRAY,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bottomText: {
    fontSize: 8.5,
    color: TEXT_DARK,
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: TEXT_GRAY,
  },
});

interface InvoiceDocumentProps {
  data: InvoiceData;
  logoSrc: string;
}

export default function InvoiceDocument({
  data,
  logoSrc,
}: InvoiceDocumentProps) {
  const total = calculateInvoiceTotal(data.lineItems);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.pageContent}>
        <View style={styles.headerRow}>
          <View style={styles.logoWrap}>
            <Image src={logoSrc} style={styles.logo} />
          </View>
          <View style={styles.companyInfoWrap}>
            <Text style={styles.companyInfo}>
              4080 McGinnis Ferry Rd., Bldg. 200, Ste 204
            </Text>
            <Text style={styles.companyInfo}>Alpharetta, GA 30005</Text>
            <Text style={styles.companyInfo}>
              +1 (470) 440-3579 | info@revenelx.com
            </Text>
            <Text style={styles.companyInfo}>revenelx.com</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Invoice Date:</Text>
              <Text style={styles.metaValue}>{data.invoiceDate}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Payment Terms:</Text>
              <Text style={styles.metaValue}>{data.paymentTerms}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Service Period:</Text>
              <Text style={styles.metaValue}>{data.servicePeriod}</Text>
            </View>
          </View>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
        </View>

        <View style={styles.splitBox}>
          <View style={[styles.splitCol, styles.splitColLeft]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>BILL TO</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.billToName}>{data.billToName}</Text>
              <Text style={styles.bodyText}>{data.billToCompany}</Text>
              <Text style={styles.bodyText}>{data.billToAddress}</Text>
              <Text style={styles.bodyText}>{data.billToEmail}</Text>
            </View>
          </View>
          <View style={styles.splitCol}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>SERVICE DETAILS</Text>
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.detailLine}>
                <Text style={styles.detailLabel}>VA Package:</Text>
                <Text style={styles.bodyText}>{data.vaPackage}</Text>
              </View>
              <View style={styles.detailLine}>
                <Text style={styles.detailLabel}>Assigned Resource(s):</Text>
                <Text style={styles.bodyText}>{data.assignedResources}</Text>
              </View>
              <View style={styles.detailLine}>
                <Text style={styles.detailLabel}>Service Type:</Text>
                <Text style={styles.bodyText}>{data.serviceType}</Text>
              </View>
              <View style={styles.detailLine}>
                <Text style={styles.detailLabel}>Billing Frequency:</Text>
                <Text style={styles.bodyText}>{data.billingFrequency}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={[styles.tableHeaderCell, styles.colDesc]}>
              <Text style={styles.tableHeaderText}>DESCRIPTION</Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.colPeriod]}>
              <Text style={[styles.tableHeaderText, styles.cellCenter]}>
                SERVICE PERIOD
              </Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.colQty]}>
              <Text style={[styles.tableHeaderText, styles.cellCenter]}>QTY</Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.colRate]}>
              <Text style={[styles.tableHeaderText, styles.cellRight]}>RATE</Text>
            </View>
            <View
              style={[
                styles.tableHeaderCell,
                styles.colAmount,
                styles.tableCellLast,
              ]}
            >
              <Text style={[styles.tableHeaderText, styles.cellRight]}>
                AMOUNT
              </Text>
            </View>
          </View>
          {data.lineItems.map((item, index) => {
            const amount = item.qty * item.rate;
            return (
              <View key={index} style={styles.tableRow}>
                <View style={[styles.tableCell, styles.colDesc]}>
                  <Text style={styles.descTitle}>{item.description}</Text>
                  <Text style={styles.descSub}>{item.subDescription}</Text>
                </View>
                <View style={[styles.tableCell, styles.colPeriod]}>
                  <Text style={[styles.cellText, styles.cellCenter]}>
                    {item.servicePeriod}
                  </Text>
                </View>
                <View style={[styles.tableCell, styles.colQty]}>
                  <Text style={[styles.cellText, styles.cellCenter]}>
                    {item.qty}
                  </Text>
                </View>
                <View style={[styles.tableCell, styles.colRate]}>
                  <Text style={[styles.cellText, styles.cellRight]}>
                    {formatCurrency(item.rate)}
                  </Text>
                </View>
                <View
                  style={[styles.tableCell, styles.colAmount, styles.tableCellLast]}
                >
                  <Text style={[styles.amountBold, styles.cellRight]}>
                    {formatCurrency(amount)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsSection}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalValue}>{formatCurrency(total)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL DUE</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        <View style={styles.paymentTermsBox}>
          <Text style={styles.paymentTermsTitle}>PAYMENT TERMS</Text>
          <Text style={styles.paymentTermsBody}>{data.paymentTermsText}</Text>
        </View>

        <View style={styles.bottomBox}>
          <View style={[styles.bottomCol, styles.bottomColLeft]}>
            <Text style={styles.bottomTitle}>PAYMENT INFORMATION</Text>
            <Text style={styles.bottomText}>
              Payment Method: {data.paymentMethod}
            </Text>
            <Text style={styles.bottomText}>
              Payment Instructions: {data.paymentInstructions || " "}
            </Text>
          </View>
          <View style={styles.bottomCol}>
            <Text style={styles.bottomTitle}>NOTES</Text>
            <Text style={styles.bottomText}>{data.notes}</Text>
          </View>
        </View>
        </View>

        <Text style={styles.footer} fixed>
          REVENELX | Built on Trust. Powered by People.
        </Text>
      </Page>
    </Document>
  );
}
