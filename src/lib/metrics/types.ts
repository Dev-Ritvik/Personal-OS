/**
 * Metric core shared types.
 *
 * PRINCIPLES (ARCHITECTURE.md §2):
 *  - Zero IO. Pure functions over explicit inputs.
 *  - Missing data is NOT zero: optional numeric inputs are `number | null`.
 *    `null` means "no observation / not applicable"; `0` is a real measurement.
 *  - Every result carries its epistemic class and its exact formula string,
 *    so any rendered number can explain itself (AC15).
 */

export type ValueClass =
  | "productive"
  | "maintenance"
  | "intentional_leisure"
  | "unproductive"
  | "neutral";

/** One normalized calendar day of behavioral telemetry. */
export interface DayFact {
  /** Frozen local date, 'YYYY-MM-DD'. */
  date: string;
  /** Waking budget for the day in minutes. null = no configured budget. */
  wakingMinutes: number | null;
  /** Minutes explicitly planned (schedule + manual origins). null = nothing was planned. */
  plannedMinutes: number | null;
  /** Actual minutes attributable to planned items. null iff plannedMinutes is null. */
  executedPlannedMinutes: number | null;
  /** Scheduled recurring-behavior obligations. null = none scheduled. */
  behaviorScheduled: number | null;
  /** Scheduled behaviors meeting their target. null iff behaviorScheduled is null. */
  behaviorMet: number | null;
  /** Open tasks due this day (status todo/doing). null-safe: always a number >= 0. */
  tasksDue: number;
  /** Tasks completed on this local date. Always a number >= 0. */
  tasksDoneOn: number;
  /** Logged, categorized minutes by value class. Zeros are real observations. */
  categorizedByClass: Record<ValueClass, number>;
}

export interface RawTimeEntry {
  /** Stored (frozen at write time) local date 'YYYY-MM-DD'. */
  localDate: string;
  /** Duration seconds; null while a timer is still running. */
  durationSec: number | null;
  /** Resolved value class of the entry's category (or inherited). undefined => uncategorized. */
  valueClass: ValueClass | undefined;
}

export interface RawPlanInstance {
  localDate: string;
  refType: "behavior" | "task";
  origin: "schedule" | "manual" | "ad_hoc";
  plannedMinutes: number | null;
  actualMinutes: number | null;
  met: boolean | null;
}

export interface RawTask {
  dueDate: string | null;
  completedOn: string | null; // local date of completion
  status: "todo" | "doing" | "done" | "cancelled";
  deferredCount: number;
}

export interface WakingWindow {
  /** minutes from local midnight, e.g. 420 for 07:00 */
  startMin: number;
  endMin: number;
}

export type EpistemicClass =
  | "observed_fact"
  | "computed_metric"
  | "statistical_inference"
  | "correlation"
  | "prediction"
  | "recommendation";

export interface GateCheck {
  name: string;
  required: number;
  observed: number;
  passed: boolean;
}

/**
 * Uniform metric envelope. A metric below its minimum-data gate returns
 * status 'insufficient_data' with the failed gates enumerated — never a
 * fabricated value (AC7).
 */
export interface MetricResult<T> {
  status: "ok" | "insufficient_data";
  value?: T;
  gates: GateCheck[];
  meta: MetricMeta;
}

export interface MetricMeta {
  key: string;
  label: string;
  formula: string;
  epistemic: EpistemicClass;
  interpretation: string;
  limitation: string;
}
