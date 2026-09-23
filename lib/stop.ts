const OPT_OUT_WORDS = [
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
] as const;

function normalizeInboundText(body: string): string {
  return body.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Detects SMS opt-out / STOP intent (exact keyword or STOP in a longer message). */
export function isStopMessage(body: string): boolean {
  const text = normalizeInboundText(body);
  if (!text) return false;

  const singleToken = text.replace(/[.!?,;:]+$/g, "");
  if (
    OPT_OUT_WORDS.some(
      (word) => singleToken === word || singleToken === `${word}.`
    )
  ) {
    return true;
  }

  if (/\bstop\b/.test(text)) return true;

  for (const word of OPT_OUT_WORDS) {
    if (word === "stop") continue;
    if (new RegExp(`\\b${word}\\b`).test(text)) return true;
  }

  return false;
}
