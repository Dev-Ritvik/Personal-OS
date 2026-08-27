/**
 * Evening review — deterministic, facts vs inference.
 *
 * Answers: WHAT WAS PLANNED, WHAT WAS COMPLETED, WHAT WAS DEFERRED, WHAT WAS ABANDONED,
 * TIME SPENT, UNKNOWN TIME, PLAN VS ACTUAL, GOAL PROGRESS, SKILL EVIDENCE, MISSED COMMITMENTS
 * plus pattern detection (overplanning, repeated deferral) — no moralizing.
 */

import type { DayFact } from "@/lib/metrics/types";

export interface ReviewTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  deferredCount: number;
  completedOn: string | null;
  goalTitle?: string | null;
}

export interface ReviewInput {
  today: string;
  facts: DayFact[]; // last ~30d ending today
  tasksDueToday: ReviewTask[];
  tasksOverdue: ReviewTask[];
  tasksCompletedToday: ReviewTask[];
  timeMinutesByClass: Record<string, number>;
  plannedMinutes: number | null;
  executedPlannedMinutes: number | null;
  behaviorScheduled: number | null;
  behaviorMet: number | null;
}

export interface EveningReview {
  facts: {
    planned: string;
    completed: string;
    deferredChronic: number;
    overdueRemaining: number;
    productiveMin: number;
    unknownMin: number | null;
    unknownShare: number | null;
  };
  metrics: {
    executionRatio: number | null; // executed/planned
    completionRate: string; // e.g. "2/5"
    varianceMin: number | null; // executed - planned
  };
  inference: string | null; // nullable, epistemic INFERENCE
  recommendation: string | null;
  missedCommitments: string[];
}

export function buildEveningReview(input: ReviewInput): EveningReview {
  const { today, facts, tasksDueToday, tasksOverdue, tasksCompletedToday, timeMinutesByClass, plannedMinutes, executedPlannedMinutes, behaviorScheduled, behaviorMet } = input;
  const todayFact = facts.find((f) => f.date === today);
  const productiveMin = timeMinutesByClass.productive ?? 0;
  const waking = todayFact?.wakingMinutes ?? null;
  const categorized = todayFact ? Object.values(todayFact.categorizedByClass).reduce((a, b) => a + b, 0) : 0;
  const unknownMin = waking !== null ? Math.max(0, waking - categorized) : null;
  const unknownShare = waking !== null && waking > 0 && unknownMin !== null ? unknownMin / waking : null;

  const planned = plannedMinutes;
  const executed = executedPlannedMinutes;
  const executionRatio = planned !== null && planned > 0 && executed !== null ? executed / planned : null;
  const varianceMin = planned !== null && executed !== null ? executed - planned : null;

  const totalDue = tasksDueToday.length + tasksOverdue.length;
  // Completed today: those whose completedOn === today
  const completedToday = tasksCompletedToday.filter((t) => t.completedOn === today).length;
  const chronic = [...tasksDueToday, ...tasksOverdue].filter((t) => t.deferredCount >= 3).length;

  let inference: string | null = null;
  let recommendation: string | null = null;

  if (planned !== null && executed !== null && planned > 0) {
    if (executionRatio !== null && executionRatio < 0.6) {
      inference = `Planned ${planned} min but executed ${executed} min — execution ratio ${Math.round(executionRatio * 100)}%.`;
      if (chronic > 0) {
        recommendation = `You have ${chronic} chronically deferred task(s). Decompose or explicitly drop the oldest before planning tomorrow.`;
      } else if (planned > productiveMin + 60) {
        recommendation = `Planned workload exceeds today's recorded productive time by ${planned - productiveMin} min. Reduce tomorrow's planned deep work.`;
      } else {
        recommendation = `Protect the highest-value milestone tomorrow and timebox it first.`;
      }
    } else if (executionRatio !== null && executionRatio > 1.2) {
      inference = `Executed ${executed} min vs planned ${planned} min — over-executed by ${Math.round((executionRatio - 1) * 100)}%.`;
      recommendation = `Your plan may be under-estimating; review estimates for recurring tasks.`;
    }
  } else if (planned === null) {
    inference = `No plan was recorded for today — nothing to compare against actual.`;
    recommendation = `Define 1-3 scheduled behaviors to make tomorrow's plan vs actual measurable.`;
  }

  const missedCommitments: string[] = [];
  if (behaviorScheduled !== null && behaviorMet !== null && behaviorScheduled > 0 && behaviorMet < behaviorScheduled) {
    missedCommitments.push(`${behaviorScheduled - behaviorMet} scheduled behavior(s) not met`);
  }
  for (const t of [...tasksDueToday, ...tasksOverdue]) {
    if (t.status === "todo" || t.status === "doing") {
      // still open at end of day → missed if due today or overdue
      missedCommitments.push(`Missed: ${t.title}${t.goalTitle ? ` → ${t.goalTitle}` : ""}`);
      if (missedCommitments.length >= 5) break;
    }
  }

  return {
    facts: {
      planned: planned !== null ? `${planned} min planned` : "No plan",
      completed: `${completedToday} completed today` + (totalDue > 0 ? ` of ${totalDue} due` : ""),
      deferredChronic: chronic,
      overdueRemaining: tasksOverdue.filter((t) => t.status !== "done" && t.status !== "cancelled").length,
      productiveMin,
      unknownMin,
      unknownShare,
    },
    metrics: {
      executionRatio,
      completionRate: `${completedToday}/${totalDue || 0}`,
      varianceMin,
    },
    inference,
    recommendation,
    missedCommitments: missedCommitments.slice(0, 3),
  };
}
