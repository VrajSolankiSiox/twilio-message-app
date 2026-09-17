import * as XLSX from "xlsx";

export interface CsvContact {
  name: string;
  phone: string;
}

function isExcelFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPhoneHeader(value: string): boolean {
  return /phone|number|mobile|tel/i.test(value);
}

function isNameHeader(value: string): boolean {
  return /^(name|full.?name|contact|customer)/i.test(value);
}

function extractContacts(rows: string[][]): CsvContact[] {
  const contacts: CsvContact[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const name = String(row[0] ?? "").trim();
    const phone = String(row[1] ?? "").trim();
    if (!phone) continue;

    if (i === 0 && (isPhoneHeader(phone) || isNameHeader(name))) continue;

    contacts.push({ name, phone });
  }

  return contacts;
}

function parseCSVText(content: string): string[][] {
  const lines = content.trim().split(/\r?\n/);
  const rows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const delimiter = trimmed.includes("\t")
      ? "\t"
      : trimmed.includes(";") && !trimmed.includes(",")
        ? ";"
        : ",";

    const columns = trimmed.split(delimiter).map((col) =>
      col.trim().replace(/^"|"$/g, "")
    );
    rows.push(columns);
  }

  return rows;
}

function parseExcelBuffer(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
}

export async function parseContactsFromFile(
  file: File
): Promise<CsvContact[]> {
  const buffer = await file.arrayBuffer();

  const rows = isExcelFile(buffer)
    ? parseExcelBuffer(buffer)
    : parseCSVText(new TextDecoder().decode(buffer));

  return extractContacts(rows);
}

export async function parsePhoneNumbersFromFile(
  file: File
): Promise<string[]> {
  const contacts = await parseContactsFromFile(file);
  return contacts.map((contact) => contact.phone);
}
