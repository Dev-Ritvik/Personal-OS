import type { MetricMeta, MetricResult } from "./types";
import { ok } from "./gates";

/**
 * M5 â€” Postponement Depth
 * Per-task consecutive deferral counter; portfolio view reports how many tasks
 * crossed the chronic threshold (default â‰¥3).
 *
 * No minimum-sample gate: this is a descriptive inventory of open tasks.
 * Zero open tasks â‡’ zero postponement, which is a real observation.
 */
export const M5: MetricMeta = {
  key: "m5_postponement_depth",
  label: "Postponement depth",
  formula: "depth(task) = deferred_count;  portfolio_flag = count(depth â‰¥ 3)",
  epistemic: "observed_fact",
  interpretation:
    "Tasks repeatedly pushed forward without completion. Depth â‰¥3 is the chronic-postponement signal.",
  limitation:
    "Counts deferrals only; a task re-scoped into smaller work should be decomposed or closed instead.",
};

export interface PostponementSummary {
  maxDepth: number;
  chronicCount: number;
  worstTaskIds: string[];
}

export function postponeSummary(
  tasks: Array<{ id: string; deferredCount: number }>,
  threshold = 3,
): MetricResult<PostponementSummary> {
  const sorted = [...tasks].sort((a, b) => b.deferredCount - a.deferredCount);
  const chronic = sorted.filter((t) => t.deferredCount >= threshold);
  return ok(
    M5,
    {
      maxDepth: sorted[0]?.deferredCount ?? 0,
      chronicCount: chronic.length,
      worstTaskIds: chronic.map((t) => t.id),
    },
    [],
  );
}

/**
 * M6 â€” Overdue Accumulation
 * Weekly overdue-count slope. Growing backlog â‡’ capacity mismatch.
 * Gate: â‰¥3 weekly observations.
 */
export const M6: MetricMeta = {
  key: "m6_overdue_accumulation",
  label: "Overdue accumulation",
  formula:
    "direction = sign(count(last_week) âˆ’ count(first_week)) over weekly overdue counts",
  epistemic: "computed_metric",
  interpretation:
    "Growing slope: more work is becoming overdue each week than is being cleared.",
  limitation:
    "Insensitive to churn inside weeks; a stable-but-large backlog still reads 'stable'.",
};

export interface OverdueTrend {
  direction: "growing" | "shrinking" | "stable";
  firstWeekCount: number;
  lastWeekCount: number;
  delta: number;
}

export function overdueAccumulation(
  weeklyCounts: Array<{ weekStart: string; count: number }>,
): MetricResult<OverdueTrend> {
  const pts = [...weeklyCounts].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const g = [
    {
      name: "weekly_points",
      observed: pts.length,
      required: 3,
      passed: pts.length >= 3,
    },
  ];
  if (pts.length < 3) return { status: "insufficient_data", gates: g, meta: M6 };

  const first = pts[0]!.count;
  const last = pts[pts.length - 1]!.count;
  const delta = last - first;
  return ok(
    M6,
    {
      direction: delta > 0 ? "growing" : delta < 0 ? "shrinking" : "stable",
      firstWeekCount: first,
      lastWeekCount: last,
      delta,
    },
    g,
  );
}
