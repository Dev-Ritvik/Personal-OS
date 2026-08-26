import type { DayFact, MetricMeta, MetricResult } from "./types";
import { gate, insufficient, ok } from "./gates";
import { totalCategorized } from "./facts";

/**
 * M4 â€” Unknown-Time Share
 * formula: unknown_share = max(0, waking_minutes âˆ’ categorized_minutes) / waking_minutes
 * The system's honesty mechanism about its own blindness.
 */
export const M4: MetricMeta = {
  key: "m4_unknown_time_share",
  label: "Unknown-time share",
  formula: "unknown = max(0, waking_min âˆ’ categorized_min); share = unknown / waking_min",
  epistemic: "computed_metric",
  interpretation:
    "Fraction of your waking budget with no recorded activity. High shares make every other insight weaker â€” treat this as data quality, not guilt.",
  limitation:
    "Waking budget comes from Settings; multi-day entries spanning midnight are attributed to their start date.",
};

export function unknownTimeShare(fact: DayFact): MetricResult<number> {
  const g = [
    gate("waking_budget_configured", fact.wakingMinutes === null ? 0 : 1, 1),
  ];
  if (fact.wakingMinutes === null || fact.wakingMinutes <= 0) {
    return insufficient(M4, g);
  }
  const unknown = Math.max(0, fact.wakingMinutes - totalCategorized(fact));
  return ok(M4, unknown / fact.wakingMinutes, g);
}

/** Meta-gate helper (ARCHITECTURE.md Â§10 M4): insights degrade above 60% unknown. */
export function degradedConfidence(dayShares: number[], threshold = 0.6): boolean {
  if (dayShares.length === 0) return true;
  const recent = dayShares.slice(-5);
  return recent.every((s) => s > threshold);
}
