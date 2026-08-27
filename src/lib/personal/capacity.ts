/**
 * Realistic capacity estimation — deterministic, no fabrication.
 *
 * Estimates sustainable productive capacity from observed DayFacts.
 * Uses median productive minutes over recent logged days.
 *
 * Gates:
 *  - Requires ≥5 logged days in last 14d, else insufficient.
 *  - Requires ≥14 logged days in last 28d for stable median, else insufficient if less.
 *  - Missing = insufficient, never zero.
 */

import type { DayFact } from "@/lib/metrics/types";
import { gate, median, mean } from "@/lib/metrics/gates";
import type { GateCheck, MetricResult, MetricMeta } from "@/lib/metrics/types";

export interface CapacityEstimate {
  medianProductiveMin: number;
  meanProductiveMin: number;
  loggedDays14: number;
  loggedDays28: number;
  p50Range: { p25: number; p75: number };
}

const META: MetricMeta = {
  key: "realistic_capacity",
  label: "Realistic capacity",
  formula: "median(productive minutes) over 28d logged days; gates: ≥5 logged in 14d, ≥14 logged in 28d, non-zero median",
  epistemic: "statistical_inference",
  interpretation: "Typical sustainable productive minutes, not a target.",
  limitation: "Assumes recent logged days represent typical capacity; excludes unlogged days.",
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base]! * (1 - rest) + sorted[base + 1]! * rest;
  }
  return sorted[base]!;
}

export function estimateCapacity(facts: DayFact[]): MetricResult<CapacityEstimate> {
  const last14 = facts.slice(-14);
  const last28 = facts.slice(-28);

  const logged14 = last14.filter((f) => f.categorizedByClass.productive > 0 || f.plannedMinutes !== null).length;
  // Logged = any day with >0 productive OR a plan existed (even if 0 executed)
  const productive14 = last14.filter((f) => f.categorizedByClass.productive > 0).length;
  const productive28Vals = last28
    .map((f) => f.categorizedByClass.productive)
    .filter((v) => v > 0);

  const gates: GateCheck[] = [
    gate("logged days in 14d (≥5)", logged14, 5),
    gate("logged days in 28d (≥14)", last28.filter((f) => f.categorizedByClass.productive > 0 || f.plannedMinutes !== null).length, 14),
    gate("productive observations 28d (≥5)", productive28Vals.length, 5),
  ];

  const nonZeroMedian = median(productive28Vals);
  gates.push(gate("non-zero median", nonZeroMedian > 0 ? 1 : 0, 1));

  const failed = gates.filter((g) => !g.passed);
  if (failed.length > 0) {
    return { status: "insufficient_data", gates, meta: META };
  }

  const sorted = [...productive28Vals].sort((a, b) => a - b);
  const med = median(productive28Vals);
  const mn = mean(productive28Vals);
  return {
    status: "ok",
    value: {
      medianProductiveMin: Math.round(med),
      meanProductiveMin: Math.round(mn),
      loggedDays14: productive14,
      loggedDays28: productive28Vals.length,
      p50Range: {
        p25: Math.round(quantile(sorted, 0.25)),
        p75: Math.round(quantile(sorted, 0.75)),
      },
    },
    gates,
    meta: META,
  };
}

export function todayPlannedMinutes(facts: DayFact[], today: string): number | null {
  const f = facts.find((x) => x.date === today);
  if (!f || f.plannedMinutes === null) return null;
  return f.plannedMinutes;
}

export function overplanningSeverity(
  plannedToday: number | null,
  capacity: MetricResult<CapacityEstimate>,
): { ratio: number | null; severity: "ok" | "warning" | "critical" | "insufficient" } {
  if (!plannedToday || capacity.status !== "ok" || !capacity.value) {
    return { ratio: null, severity: "insufficient" };
  }
  const med = capacity.value.medianProductiveMin;
  if (med === 0) return { ratio: null, severity: "insufficient" };
  const ratio = plannedToday / med;
  if (ratio > 1.6) return { ratio, severity: "critical" };
  if (ratio > 1.2) return { ratio, severity: "warning" };
  return { ratio, severity: "ok" };
}
