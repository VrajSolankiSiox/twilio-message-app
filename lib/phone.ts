export function phoneDigits(phone: string): string {
  return phone.trim().replace(/\D/g, "");
}

/** E.164-style numbers we can message and show (10–15 digits). */
export function isValidPhoneNumber(phone: string): boolean {
  const digits = phoneDigits(phone);
  return digits.length >= 10 && digits.length <= 15;
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = phoneDigits(trimmed);
  if (!digits) return "";

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function formatPhoneDisplay(phone: string): string {
  if (!isValidPhoneNumber(phone)) {
    const trimmed = phone.trim();
    return trimmed && trimmed !== "+" ? trimmed : "";
  }

  const normalized = normalizePhone(phone);
  const digits = phoneDigits(normalized);

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return `+${digits}`;
}
