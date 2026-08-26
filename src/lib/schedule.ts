/**
 * Behavior schedule expansion — PURE.
 * ISO weekdays: 1=Mon … 7=Sun.
 *
 * `times_per_week` intentionally generates NO concrete day plans: without a
 * fixed anchor day any generated plan would be fiction. Executions are logged
 * as ad-hoc check-ins and compliance is measured against weeklyMin (P1 view).
 */
export type Schedule =
  | { type: "daily" }
  | { type: "weekly"; days: number[] }
  | { type: "times_per_week"; n: number };

export function scheduledOn(schedule: Schedule, date: string): boolean {
  switch (schedule.type) {
    case "daily":
      return true;
    case "weekly": {
      // Weekday of a pure date string computed in UTC (date has no zone).
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
      const iso = dow === 0 ? 7 : dow;
      return schedule.days.includes(iso);
    }
    case "times_per_week":
      return false;
  }
}
