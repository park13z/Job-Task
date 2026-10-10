import type { Job } from "./contracts";

export const TORONTO_TIME_ZONE = "America/Toronto";
const DAY_MS = 86_400_000;

export function businessDate(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(now));
}

export function addDays(date: string, days: number): string {
  const next = new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

export function mondayWeekRange(date: string): { from: string; to: string } {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const from = addDays(date, -(weekday + 6) % 7);
  return { from, to: addDays(from, 6) };
}

// Native <input type="week"> uses ISO Monday-based weeks, including 53-week years.
export function isoWeekValue(date: string): string {
  const monday = mondayWeekRange(date).from;
  const year = addDays(monday, 3).slice(0, 4);
  const firstMonday = mondayWeekRange(`${year}-01-04`).from;
  const week = 1 + (Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${firstMonday}T00:00:00Z`)) / (7 * DAY_MS);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function isoWeekStart(value: string): string | null {
  if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(value)) return null;
  const year = value.slice(0, 4);
  const monday = addDays(mondayWeekRange(`${year}-01-04`).from, (Number(value.slice(6)) - 1) * 7);
  return isoWeekValue(monday) === value ? monday : null;
}

/** UTC instant of local midnight in Toronto; handles the 23/25-hour DST days. */
export function torontoMidnightUtc(date: string): number {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    if (local === target) return instant;
    instant += target - local;
  }
  return instant;
}

export function torontoDayRange(date: string): { start: number; end: number } {
  return { start: torontoMidnightUtc(date), end: torontoMidnightUtc(addDays(date, 1)) };
}

export function formatInstant(instant: number, locale = "en-CA"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).format(new Date(instant));
}

export function formatBusinessDate(date: string, locale = "en-CA"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC", year: "numeric", month: "short", day: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function formatDuration(activeMs: Job["activeMs"]): string {
  const totalMinutes = Math.floor(activeMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
