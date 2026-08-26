import { clamp01 } from "@/lib/metrics/gates";

/**
 * Goal progress computation — PURE, shared by UI and snapshot job.
 * ARCHITECTURE.md §6.2. P0 supports: binary/milestone, quantity/cumulative,
 * duration, deadline. frequency/rate/percentage return null (P1) honestly.
 */

export interface GoalMeasure {
  measureType:
    | "binary" | "quantity" | "duration" | "frequency"
    | "percentage" | "milestone" | "deadline" | "cumulative" | "rate";
  targetValue: number | null;
  direction: "at_least" | "at_most";
  status: string;
  closingValue: number | null;
  startDate: string | null;
  targetDate: string | null;
}

export interface ProgressContext {
  /** Current accumulated units for quantity/duration goals. */
  currentUnits?: number;
  /** Linked logged seconds for duration goals (alternative to currentUnits). */
  durationSeconds?: number;
  /** Today's local date 'YYYY-MM-DD' (for deadline time-elapsed fraction). */
  today: string;
}

export interface GoalProgress {
  /** 0..1 or null when the measure type lacks P0 support / data. */
  value01: number | null;
  currentLabel: string;
  basis: string;
  /** deadline-type only: calendar elapsed vs completion, shown side by side. */
  timeElapsed01?: number | null;
}

export function computeGoalProgress(
  goal: GoalMeasure,
  ctx: ProgressContext,
): GoalProgress {
  switch (goal.measureType) {
    case "binary":
    case "milestone": {
      const done = goal.status === "achieved" || (goal.closingValue ?? 0) > 0;
      return {
        value01: done ? 1 : 0,
        currentLabel: done ? "done" : "open",
        basis: "binary state",
      };
    }

    case "quantity":
    case "cumulative":
    case "percentage": {
      if (goal.targetValue === null || goal.targetValue <= 0) {
        return { value01: null, currentLabel: "—", basis: "no target set" };
      }
      const current = ctx.currentUnits ?? 0;
      // at_most quantity semantics = share of budget consumed.
      return {
        value01: clamp01(current / goal.targetValue),
        currentLabel: `${fmt(current)} / ${fmt(goal.targetValue)}`,
        basis:
          goal.direction === "at_most"
            ? "budget consumed (at_most)"
            : "current / target",
      };
    }

    case "duration": {
      if (goal.targetValue === null || goal.targetValue <= 0) {
        return { value01: null, currentLabel: "—", basis: "no target set" };
      }
      const seconds =
        ctx.durationSeconds ??
        (ctx.currentUnits !== undefined ? ctx.currentUnits * 3600 : 0);
      return {
        value01: clamp01(seconds / (goal.targetValue * 3600)),
        currentLabel: `${fmt(seconds / 3600, 1)}h / ${fmt(goal.targetValue)}h`,
        basis: "logged_seconds_linked / target",
      };
    }

    case "deadline": {
      const frac =
        goal.targetValue && goal.targetValue > 0
          ? clamp01((ctx.currentUnits ?? 0) / goal.targetValue)
          : null;
      let timeElapsed01: number | null = null;
      if (goal.startDate && goal.targetDate) {
        const s = Date.parse(`${goal.startDate}T00:00:00Z`);
        const e = Date.parse(`${goal.targetDate}T00:00:00Z`);
        const t = Date.parse(`${ctx.today}T00:00:00Z`);
        timeElapsed01 = e > s ? Math.min(1, Math.max(0, (t - s) / (e - s))) : null;
      }
      return {
        value01: frac,
        currentLabel: frac === null ? "—" : `${Math.round(frac * 100)}% complete`,
        basis: "current / target with calendar overlay",
        timeElapsed01,
      };
    }

    case "frequency":
    case "rate":
      // P1: rolling-window compliance. Honest absence now.
      return {
        value01: null,
        currentLabel: "P1 metric",
        basis: "rolling-window compliance ships in P1; not fabricated",
      };
  }
}

export function rollupProgress(children: Array<number | null>): number | null {
  const vals = children.filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function fmt(n: number, digits = 2): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r);
}
