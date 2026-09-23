/** Twilio reports charges as negative strings; store positive USD amounts. */
export function parseTwilioPrice(
  price: string | number | null | undefined
): number | null {
  if (price === null || price === undefined || price === "") return null;
  const value = typeof price === "number" ? price : Number.parseFloat(price);
  if (!Number.isFinite(value) || value === 0) return null;
  return Math.abs(value);
}

export function parseTwilioSegments(
  numSegments: string | number | null | undefined
): number | null {
  if (numSegments === null || numSegments === undefined || numSegments === "") {
    return null;
  }
  const value =
    typeof numSegments === "number"
      ? numSegments
      : Number.parseInt(String(numSegments), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function pricingFromTwilioMessage(msg: {
  price?: string | number | null;
  priceUnit?: string | null;
  numSegments?: string | number | null;
}): {
  priceUsd: number | null;
  numSegments: number | null;
  priceUnit: string | null;
} {
  return {
    priceUsd: parseTwilioPrice(msg.price ?? null),
    numSegments: parseTwilioSegments(msg.numSegments ?? null),
    priceUnit: msg.priceUnit ?? null,
  };
}

export function formatMoney(
  amount: number,
  currency = "USD",
  locale?: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
