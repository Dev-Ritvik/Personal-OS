import type { DayFact, MetricMeta, MetricResult } from "./types";
import { gate, insufficient, median, ok } from "./gates";
import { productiveMinutes } from "./facts";
import { diffDays } from "./dates";

/**
 * M3 â€” Planâ€“Actual Variance
 * formula: variance_minutes = Î£(executed_planned âˆ’ planned); pct = executed/planned âˆ’ 1
 * Gate: â‰¥5 planned days in window.
 */
export const M3: MetricMeta = {
  key: "m3_plan_actual_variance",
  label: "Planâ€“actual variance",
  formula:
    "variance = Î£_days (executed_planned_minutes âˆ’ planned_minutes);  pct = executed/planned âˆ’ 1",
  epistemic: "computed_metric",
  interpretation:
    "Negative â‡’ you did less than planned. Chronic negativity means plans are optimistic or execution is weak â€” disambiguate with M8 vs M9.",
  limitation: "Depends on honest categorization and on plan data existing at all.",
};

export interface Variance {
  minutes: number;
  pct: number | null;
  plannedDays: number;
}

export function planActualVariance(
  facts: DayFact[],
  windowDays = 14,
): MetricResult<Variance> {
  const window = facts.slice(-windowDays).filter((f) => f.plannedMinutes !== null);
  const g = [gate("planned_days", window.length, 5)];
  if (window.length < 5) return insufficient(M3, g);

  let planned = 0;
  let exec = 0;
  for (const f of window) {
    planned += f.plannedMinutes!;
    exec += f.executedPlannedMinutes!;
  }
  return ok(
    M3,
    {
      minutes: exec - planned,
      pct: planned > 0 ? exec / planned - 1 : null,
      plannedDays: window.length,
    },
    g,
  );
}

/**
 * M8 â€” Overplanning Ratio
 * formula: ratio = mean(planned_hours, last 7d with a plan) / median(productive_executed_hours, trailing 28d)
 * Sustained > 1.4 â‡’ systematic optimism.
 */
export const M8: MetricMeta = {
  key: "m8_overplanning_ratio",
  label: "Overplanning ratio",
  formula:
    "overplanning = mean(planned_h, last_7d) / median(productive_executed_h, trailing_28d)",
  epistemic: "statistical_inference",
  interpretation:
    ">1.4 sustained: your plans exceed your demonstrated productive capacity by 40%+.",
  limitation:
    "Baseline assumes logged productive time approximates real capacity; low logging inflates the ratio.",
};

export function overplanningRatio(facts: DayFact[]): MetricResult<number> {
  if (facts.length < 28) {
    return insufficient(M8, [gate("history_days", facts.length, 28)]);
  }
  // C10 remediation: capacity baseline is the median over LOGGED days only.
  // Days with no recorded activity are missing observations of capacity, not
  // evidence of zero capacity; including them drags the median toward zero
  // and fabricates overplanning signals for patchy loggers.
  const window = facts.slice(-28);
  const loggedDays = window.filter(
    (f) => f.categorizedByClass.productive > 0,
  );
  const baselineMedianMin = median(loggedDays.map((f) => f.categorizedByClass.productive));

  const recent = facts.slice(-7).filter((f) => f.plannedMinutes !== null);
  const gates = [
    gate("logged_baseline_days", loggedDays.length, 14),
    gate("recent_planned_days", recent.length, 5),
    gate("nonzero_baseline", baselineMedianMin > 0 ? 1 : 0, 1),
  ];
  if (gates.some((x) => !x.passed)) return insufficient(M8, gates);

  const meanPlanned =
    recent.reduce((s, f) => s + (f.plannedMinutes ?? 0), 0) / recent.length;
  return ok(M8, meanPlanned / baselineMedianMin!, gates);
}

/**
 * M9 â€” Under-execution Ratio
 * formula: 1 âˆ’ Î£executed_planned / Î£planned   (trailing 14d, planned>0)
 * Negative values indicate overshoot (you did more than planned).
 */
export const M9: MetricMeta = {
  key: "m9_under_execution",
  label: "Under-execution ratio",
  formula: "under_execution = 1 âˆ’ Î£ executed_planned / Î£ planned   (trailing 14d)",
  epistemic: "computed_metric",
  interpretation:
    "High (>0.30): planned work is not getting done. With high M8 the plans are too big; with low M8 execution itself is weak.",
  limitation: "Only covers time attached to planned items.",
};

export function underExecutionRatio(
  facts: DayFact[],
  windowDays = 14,
): MetricResult<number> {
  const window = facts
    .slice(-windowDays)
    .filter((f) => f.plannedMinutes !== null && f.plannedMinutes > 0);
  const g = [gate("planned_days", window.length, 7)];
  if (window.length < 7) return insufficient(M9, g);

  const planned = window.reduce((s, f) => s + f.plannedMinutes!, 0);
  const exec = window.reduce((s, f) => s + f.executedPlannedMinutes!, 0);
  return ok(M9, 1 - exec / planned, g);
}

/** Days since the earliest fact â€” used as an age proxy where needed. */
export function historySpanDays(facts: DayFact[]): number {
  if (facts.length < 2) return facts.length;
  return diffDays(facts[facts.length - 1]!.date, facts[0]!.date) + 1;
}
