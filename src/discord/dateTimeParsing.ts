export type ParseResult = { ok: true; value: Date } | { ok: false; reason: string };

const DATE_RE = /^(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar year "now" falls on as seen from `timeZone`, e.g. so a date near a year boundary resolves to the right year for that zone. */
function currentYearInZone(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(now));
}

/** Offset (ms) such that `zoneWallClockMs = utcMs + offset` for the instant `utcMs`. */
function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    parts[part.type] = part.value;
  }
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - utcMs;
}

/**
 * Parses a "MM-DD" date (the current calendar year in `timeZone` is always assumed —
 * scheduling a movie night more than a year out isn't supported) and "HH:MM" (24h)
 * time, interpreted as wall-clock time in `timeZone` (an IANA name, default "UTC"),
 * into the UTC instant it refers to.
 *
 * The zone offset is derived from a single approximation pass, so a wall-clock time
 * that falls inside a DST transition (a nonexistent "spring forward" time, or an
 * ambiguous "fall back" one) can resolve up to one hour off. Acceptable for scheduling
 * a movie night; not suitable if exact instants across a DST boundary ever matter.
 */
export function parseEventDateTime(dateStr: string, timeStr: string, timeZone = "UTC", now: Date = new Date()): ParseResult {
  const dateMatch = DATE_RE.exec(dateStr.trim());
  if (!dateMatch) {
    return { ok: false, reason: "Date must be in MM-DD format, e.g. 02-01 — this year is always assumed." };
  }
  const timeMatch = TIME_RE.exec(timeStr.trim());
  if (!timeMatch) {
    return { ok: false, reason: "Time must be in 24-hour HH:MM format, e.g. 20:00." };
  }
  if (!isValidTimeZone(timeZone)) {
    return { ok: false, reason: `Unrecognized time zone "${timeZone}". Use an IANA name like "Europe/Athens".` };
  }

  const [, monthStr, dayStr] = dateMatch;
  const [, hourStr, minuteStr] = timeMatch;
  const year = currentYearInZone(now, timeZone);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (hour > 23 || minute > 59) {
    return { ok: false, reason: "Time must be a valid 24-hour clock time between 00:00 and 23:59." };
  }

  const asUtcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(asUtcGuess);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { ok: false, reason: `"${dateStr}" isn't a real calendar date.` };
  }

  const offset = getTimeZoneOffsetMs(asUtcGuess, timeZone);
  return { ok: true, value: new Date(asUtcGuess - offset) };
}
