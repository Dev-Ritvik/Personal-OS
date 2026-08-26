import type { MetricMeta } from "./types";
import { M1, M2 } from "./execution";
import { M3, M8, M9 } from "./variance";
import { M4 } from "./unknownTime";
import { M5, M6 } from "./postponement";
import { M11 } from "./goalPace";

/**
 * Registry of every P0 metric. The UI renders formula/interpretation/limitation
 * from here so no number can appear on screen without its definition (AC15).
 */
export const METRIC_REGISTRY: Record<string, MetricMeta> = Object.fromEntries(
  [M1, M2, M3, M4, M5, M6, M8, M9, M11].map((m) => [m.key, m]),
);

export const METRIC_LABELS_BY_KEY: Record<string, string> = {
  m1_execution_rate: "Execution rate (day)",
  m2_consistency: "Consistency score (30d)",
  m10_schedule_reliability: "Schedule reliability (14d)",
  m3_plan_actual_variance: "Plan–actual variance (14d)",
  m4_unknown_time_share: "Unknown-time share",
  m5_postponement_depth: "Postponement depth",
  m6_overdue_accumulation: "Overdue accumulation",
  m8_overplanning_ratio: "Overplanning ratio",
  m9_under_execution: "Under-execution ratio (14d)",
  m11_goal_pace: "Goal pace index",
};
