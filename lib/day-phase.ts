export type DayPhase = "morning" | "afternoon" | "evening" | "night";

export const GREETING: Record<DayPhase, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good night",
};

/** Local time-of-day bucket for dashboard greeting. */
export function dayPhaseForDate(date = new Date()): DayPhase {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export function greetingFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
