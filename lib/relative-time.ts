const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

function toDate(dateInput: string | Date): Date {
  return typeof dateInput === "string" ? new Date(dateInput) : dateInput;
}

export function formatRelativeTime(
  dateInput: string | Date,
  now: Date = new Date()
): string {
  const date = toDate(dateInput);
  const diff = now.getTime() - date.getTime();

  if (Number.isNaN(diff) || diff < MS_MINUTE) {
    return "just now";
  }

  const minutes = Math.floor(diff / MS_MINUTE);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }

  const hours = Math.floor(diff / MS_HOUR);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(diff / MS_DAY);
  if (days < 7) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return months === 1 ? "a month ago" : `${months} months ago`;
  }

  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

export function formatMessageTimestampFull(dateInput: string | Date): string {
  const date = toDate(dateInput);
  return date.toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
