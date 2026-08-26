/**
 * Timezone-aware local-date helpers.
 *
 * Rule (ARCHITECTURE.md §13/§14): every analytical record stores its
 * `local_date`, frozen ONCE at write time using the device timezone.
 * Aggregation never re-derives it — so profile timezone changes and DST
 * transitions cannot silently rewrite history.
 *
 * These helpers use Intl (full ICU in Node >= 18 and all modern browsers);
 * no external tz database, no third-party dependency.
 */

/** 'YYYY-MM-DD' local date for an instant in tz. Deterministic, DST-safe. */
export function localDateInTz(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Offset of tz from UTC, in minutes, effective at `instant`. Positive east of UTC. */
export function tzOffsetMinutes(tz: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUTC - instant.getTime()) / 60_000);
}

/**
 * UTC instant of a wall-clock time (localDate + minutes-from-midnight) in tz.
 *
 * Ambiguity conventions (documented + tested):
 *  - Fold (clock repeated): returns the FIRST occurrence (earliest instant
 *    whose wall clock equals the request).
 *  - Gap (clock skipped):   no instant has that wall time; resolves FORWARD
 *    to the first valid wall time after the gap (same rule as moment-timezone).
 */
export function zonedWallTimeToUtc(
  localDate: string,
  minutesFromMidnight: number,
  tz: string,
): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;
  const wanted = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const guess = Date.UTC(y!, m! - 1, d!, hh, mm);

  // Two offset passes converge near transitions.
  let ts =
    guess - tzOffsetMinutes(tz, new Date(guess)) * 60_000;
  ts = guess - tzOffsetMinutes(tz, new Date(ts)) * 60_000;

  const wallOf = (t: number): number | null => {
    if (localDateInTz(new Date(t), tz) !== localDate) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(t));
    let total = -1;
    for (const p of parts) {
      if (p.type === "hour") total = Number(p.value) * 60;
      else if (p.type === "minute" && total >= 0) total += Number(p.value);
    }
    return total < 0 ? null : total % 1440;
  };

  // Candidate scan ±1h around the converged instant.
  //  - fold: two hits exist → earliest wins (first occurrence).
  //  - normal: single hit.
  for (const cand of [ts - 3_600_000, ts, ts + 3_600_000]) {
    if (wallOf(cand) === wanted) return new Date(cand);
  }
  // No hit at all ⇒ requested wall time was SKIPPED (spring-forward gap).
  // Convention: resolve forward one hour (moment-timezone behavior).
  return new Date(ts + 3_600_000);
}

export function isValidLocalDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Reject silent rollover (e.g. 2027-02-29 → 2027-03-01).
  return d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const ms =
    new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (diffDays(cur, to) <= 0) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function todayInTz(tz: string, now: Date = new Date()): string {
  return localDateInTz(now, tz);
}
