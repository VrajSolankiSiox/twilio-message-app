import * as XLSX from "xlsx";

function isExcelFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isHeaderValue(value: string): boolean {
  return /phone|number|mobile|tel/i.test(value);
}

function extractSecondColumn(rows: string[][]): string[] {
  const numbers: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const phone = String(row[1] ?? "").trim();
    if (!phone) continue;

    if (i === 0 && isHeaderValue(phone)) continue;

    numbers.push(phone);
  }

  return numbers;
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

export async function parsePhoneNumbersFromFile(
  file: File
): Promise<string[]> {
  const buffer = await file.arrayBuffer();

  const rows = isExcelFile(buffer)
    ? parseExcelBuffer(buffer)
    : parseCSVText(new TextDecoder().decode(buffer));

  return extractSecondColumn(rows);
}
