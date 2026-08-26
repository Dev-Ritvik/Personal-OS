import type { MetricMeta, MetricResult } from "./types";
import { gate, insufficient, ok } from "./gates";

/**
 * M11 â€” Goal Pace Index
 * required_velocity = remaining_units / remaining_days
 * observed_velocity = units gained over the trailing observation span (per day)
 * pace = observed / required   (<1 â‡’ behind pace)
 *
 * Rendered WITH both raw velocities (AC6). Gate: goal â‰¥14d old AND â‰¥5 progress
 * observations. Epistemic class: statistical_inference â€” it extrapolates a trend.
 */
export const M11: MetricMeta = {
  key: "m11_goal_pace",
  label: "Goal pace index",
  formula:
    "pace = observed_velocity / required_velocity;  required = remaining/remaining_days;  observed = Î”progress(trailing obs)/Î”days",
  epistemic: "statistical_inference",
  interpretation:
    "<1 means current trajectory misses the target date. Shown with both raw numbers so you can judge, not just obey.",
  limitation:
    "Extrapolation assumes recent velocity continues. Early-goal noise and deadline changes distort it.",
};

export interface GoalPaceInput {
  remainingUnits: number;
  remainingDays: number;
  goalAgeDays: number;
  /** Chronological progress observations (date, cumulative units completed). */
  observations: Array<{ date: string; value: number }>;
  /** Observation window length in days for velocity (default 14). */
  windowDays?: number;
}

export interface GoalPace {
  pace: number;
  requiredVelocityPerDay: number;
  observedVelocityPerDay: number;
  observationPoints: number;
}

export function goalPace(input: GoalPaceInput): MetricResult<GoalPace> {
  const windowDays = input.windowDays ?? 14;

  const gates = [
    gate("goal_age_days", input.goalAgeDays, 14),
    gate("progress_points", input.observations.length, 5),
    gate("remaining_days_positive", input.remainingDays > 0 ? 1 : 0, 1),
  ];
  if (gates.some((g) => !g.passed)) return insufficient(M11, gates);

  const reqVel = input.remainingUnits / input.remainingDays;

  const cutoff = input.observations.length - windowDays;
  const win = cutoff > 0 ? input.observations.slice(cutoff) : input.observations;
  const first = win[0]!;
  const last = win[win.length - 1]!;
  const spanDays = Math.max(
    1,
    Math.round(
      (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) /
        86_400_000,
    ),
  );
  const gained = Math.max(0, last.value - first.value);
  const obsVel = gained / spanDays;

  return ok(
    M11,
    {
      pace: reqVel > 0 ? obsVel / reqVel : 1,
      requiredVelocityPerDay: reqVel,
      observedVelocityPerDay: obsVel,
      observationPoints: input.observations.length,
    },
    gates,
  );
}
