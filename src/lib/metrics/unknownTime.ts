import type { DayFact, MetricMeta, MetricResult } from "./types";
import { gate, insufficient, ok } from "./gates";
import { totalCategorized } from "./facts";

/**
 * M4 — Unknown-Time Share
 * formula: unknown_share = max(0, waking_minutes − categorized_minutes) / waking_minutes
 * The system's honesty mechanism about its own blindness.
 */
export const M4: MetricMeta = {
  key: "m4_unknown_time_share",
  label: "Unknown-time share",
  formula: "unknown = max(0, waking_min − categorized_min); share = unknown / waking_min",
  epistemic: "computed_metric",
  interpretation:
    "Fraction of your waking budget with no recorded activity. High shares make every other insight weaker — treat this as data quality, not guilt.",
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

/**
 * Explicit confidence-day contract (C3 remediation). No numeric sentinels:
 * an insufficient observation is a distinct state that can never be mistaken
 * for a low share.
 */
export type ConfidenceDay =
  | { kind: "observed"; share: number }
  | { kind: "insufficient" };

/**
 * Meta-gate (ARCHITECTURE.md §10 M4): insights degrade when any of the last
 * five days is unobserved OR observed above the unknown threshold.
 * FAILS CLOSED: absent/insufficient data always degrades confidence.
 */
export function degradedConfidence(
  days: ConfidenceDay[],
  threshold = 0.6,
): boolean {
  const window = days.slice(-5);
  if (window.length === 0) return true;
  return window.some((d) => d.kind === "insufficient" || d.share > threshold);
}
