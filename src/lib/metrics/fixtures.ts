import type { DayFact } from "./types";

/**
 * Deterministic fixtures for metric golden tests.
 * All dates are ISO strings; all expectations hand-computed in the test file.
 */

type FactSpec = Partial<Omit<DayFact, "categorizedByClass">> & {
  date: string;
  productiveMin?: number;
};

export function mkFacts(specs: FactSpec[]): DayFact[] {
  return specs.map((s) => ({
    date: s.date,
    // Explicit null must survive: missing budget ≠ default budget.
    wakingMinutes:
      "wakingMinutes" in s ? (s.wakingMinutes ?? null) : 960,
    plannedMinutes: s.plannedMinutes ?? null,
    executedPlannedMinutes: s.executedPlannedMinutes ?? null,
    behaviorScheduled: s.behaviorScheduled ?? null,
    behaviorMet: s.behaviorMet ?? null,
    tasksDue: s.tasksDue ?? 0,
    tasksDoneOn: s.tasksDoneOn ?? 0,
    categorizedByClass: {
      productive: s.productiveMin ?? 0,
      maintenance: 0,
      intentional_leisure: 0,
      unproductive: 0,
      neutral: 0,
    },
  }));
}

/** 30 consecutive dates ending at `endDate` (inclusive). */
export function trailingDays(endDate: string, n: number): string[] {
  const out: string[] = [];
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * PERFECT MONTH: every day fully scheduled (3 behaviors), fully met,
 * plan 240/executed 240, productive 180min, waking budget covered.
 */
export function perfectMonth(endDate: string): DayFact[] {
  return mkFacts(
    trailingDays(endDate, 30).map((date) => ({
      date,
      plannedMinutes: 240,
      executedPlannedMinutes: 240,
      behaviorScheduled: 3,
      behaviorMet: 3,
      productiveMin: 180,
    })),
  );
}

/**
 * LAZY WEEK appended to a compliant base (for gate-satisfying windows):
 * base 24 days perfect, then 6 lazy days: scheduled 3, met 1, exec 60/plan 240.
 */
export function lazyTail(endDate: string): DayFact[] {
  const days = trailingDays(endDate, 30);
  const specs: FactSpec[] = days.map((date, i) =>
    i < 24
      ? {
          date,
          plannedMinutes: 240,
          executedPlannedMinutes: 240,
          behaviorScheduled: 3,
          behaviorMet: 3,
          productiveMin: 180,
        }
      : {
          date,
          plannedMinutes: 240,
          executedPlannedMinutes: 60,
          behaviorScheduled: 3,
          behaviorMet: 1,
          productiveMin: 45,
        },
  );
  return mkFacts(specs);
}

/**
 * CHAOTIC WEEK: alternating obligation/no-obligation, partial logging,
 * one day with zero categorized time (real observation, not missing).
 */
export function chaoticWeek(endDate: string): DayFact[] {
  const days = trailingDays(endDate, 7);
  const specs: FactSpec[] = [
    { date: days[0]!, behaviorScheduled: 2, behaviorMet: 2, productiveMin: 200, wakingMinutes: 900 },
    { date: days[1]!, behaviorScheduled: null }, // nothing scheduled
    { date: days[2]!, behaviorScheduled: 1, behaviorMet: 0, wakingMinutes: null }, // no waking budget
    { date: days[3]!, behaviorScheduled: 3, behaviorMet: 1, productiveMin: 0 }, // logged nothing
    { date: days[4]!, behaviorScheduled: null, plannedMinutes: 120, executedPlannedMinutes: 120 },
    { date: days[5]!, behaviorScheduled: 2, behaviorMet: 2, productiveMin: 90 },
    { date: days[6]!, behaviorScheduled: 1, behaviorMet: 1, productiveMin: 500 },
  ];
  return mkFacts(specs);
}
