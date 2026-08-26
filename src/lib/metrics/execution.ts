import type { DayFact, MetricMeta, MetricResult } from "./types";
import { gate, insufficient, ok } from "./gates";

/**
 * M1 â€” Execution Rate (day)
 * formula: met_scheduled / scheduled
 * Epistemic class: computed_metric (descriptive; no gate).
 * Limitation: gameable by under-planning â†’ always read next to M8/M9.
 */
export const M1: MetricMeta = {
  key: "m1_execution_rate",
  label: "Execution rate",
  formula: "execution_rate = met_scheduled / scheduled_behaviors  (undefined when nothing was scheduled)",
  epistemic: "computed_metric",
  interpretation: "Share of today's scheduled behaviors that met their target.",
  limitation:
    "Descriptive only. A high rate on a small plan is not productivity; pair with overplanning/under-execution.",
};

export function executionRate(fact: DayFact): MetricResult<number> {
  // null = no obligations existed (NOT zero). Zero obligations is honest absence.
  if (fact.behaviorScheduled === null || fact.behaviorScheduled === 0) {
    return insufficient(M1, [
      {
        name: "scheduled_obligations",
        observed: fact.behaviorScheduled ?? 0,
        required: 1,
        passed: false,
      },
    ]);
  }
  return ok(
    M1,
    fact.behaviorMet! / fact.behaviorScheduled,
    [
      {
        name: "scheduled_obligations",
        observed: fact.behaviorScheduled,
        required: 1,
        passed: true,
      },
    ],
  );
}

/**
 * M2 â€” Consistency Score
 * formula: Î£ w(d)Â·rate(d) / Î£ w(d),  w(d)=exp(âˆ’age_days/21), rate(d)=met/scheduled
 * over days that had obligations. Gate: n â‰¥ minDays.
 */
export const M2: MetricMeta = {
  key: "m2_consistency",
  label: "Consistency score",
  formula:
    "consistency = Î£ exp(âˆ’age_days/21) Â· (met/scheduled) / Î£ exp(âˆ’age_days/21),  over obligation days",
  epistemic: "computed_metric",
  interpretation:
    "Recency-weighted adherence to scheduled behaviors across the window. Recent days count more.",
  limitation:
    "Insensitive to overshoot and to magnitude of targets. Does not measure progress toward goals.",
};

export interface ConsistencyOptions {
  windowDays?: number;
  minDays?: number;
}

export function consistencyScore(
  facts: DayFact[],
  opts: ConsistencyOptions = {},
): MetricResult<number> {
  const windowDays = opts.windowDays ?? 30;
  const minDays = opts.minDays ?? 10;
  const window = facts.slice(-windowDays);
  const lastDate = window.length > 0 ? window[window.length - 1]!.date : "";

  const obligationDays = window.filter((f) => (f.behaviorScheduled ?? 0) > 0);
  const g = [gate("obligation_days", obligationDays.length, minDays)];
  if (obligationDays.length < minDays) return insufficient(M2, g);

  let wsum = 0;
  let wrate = 0;
  for (const f of obligationDays) {
    const age = Math.max(0, Math.round(
      (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${f.date}T00:00:00Z`)) / 86_400_000,
    ));
    const w = Math.exp(-age / 21);
    wsum += w;
    wrate += w * (f.behaviorMet! / f.behaviorScheduled!);
  }
  return ok(M2, wsum > 0 ? wrate / wsum : 0, g);
}

/** M10-lite â€” Schedule reliability is M2 with a 14-day window (kept explicit for UI). */
export function scheduleReliability(facts: DayFact[]): MetricResult<number> {
  return consistencyScore(facts, { windowDays: 14, minDays: 10 });
}
