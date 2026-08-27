import { describe, it, expect } from "vitest";
import { buildEveningReview } from "./eveningReview";
import type { DayFact } from "@/lib/metrics/types";

function fact(date: string, waking: number | null, planned: number | null, executed: number | null, productive: number): DayFact {
  return {
    date,
    wakingMinutes: waking,
    plannedMinutes: planned,
    executedPlannedMinutes: executed,
    behaviorScheduled: planned !== null ? 2 : null,
    behaviorMet: planned !== null ? (executed !== null && executed >= (planned ?? 0) * 0.8 ? 2 : 1) : null,
    tasksDue: 0,
    tasksDoneOn: 0,
    categorizedByClass: { productive, maintenance: 0, intentional_leisure: 0, unproductive: 0, neutral: 0 },
  };
}

describe("buildEveningReview", () => {
  it("no plan → inference about missing plan, recommendation to define behaviors", () => {
    const r = buildEveningReview({
      today: "2026-08-27",
      facts: [fact("2026-08-27", 960, null, null, 60)],
      tasksDueToday: [],
      tasksOverdue: [],
      tasksCompletedToday: [],
      timeMinutesByClass: { productive: 60 },
      plannedMinutes: null,
      executedPlannedMinutes: null,
      behaviorScheduled: null,
      behaviorMet: null,
    });
    expect(r.facts.planned).toBe("No plan");
    expect(r.inference).toContain("No plan was recorded");
    expect(r.recommendation).toContain("scheduled behaviors");
  });

  it("execution ratio <0.6 with chronic deferral recommends decomposing", () => {
    const r = buildEveningReview({
      today: "2026-08-27",
      facts: [fact("2026-08-27", 960, 300, 100, 100)],
      tasksDueToday: [{ id: "1", title: "t", status: "todo", dueDate: "2026-08-27", deferredCount: 3, completedOn: null }],
      tasksOverdue: [],
      tasksCompletedToday: [],
      timeMinutesByClass: { productive: 100 },
      plannedMinutes: 300,
      executedPlannedMinutes: 100,
      behaviorScheduled: 2,
      behaviorMet: 1,
    });
    expect(r.metrics.executionRatio).toBeCloseTo(0.33, 1);
    expect(r.inference).toContain("execution ratio");
    expect(r.recommendation).toContain("chronically deferred");
    expect(r.facts.deferredChronic).toBe(1);
  });

  it("unknown time computed from waking - categorized", () => {
    const r = buildEveningReview({
      today: "2026-08-27",
      facts: [fact("2026-08-27", 960, 120, 120, 200)],
      tasksDueToday: [],
      tasksOverdue: [],
      tasksCompletedToday: [],
      timeMinutesByClass: { productive: 200 },
      plannedMinutes: 120,
      executedPlannedMinutes: 120,
      behaviorScheduled: 1,
      behaviorMet: 1,
    });
    // productive 200, waking 960 => unknown 760
    expect(r.facts.unknownMin).toBe(760);
    expect(r.facts.unknownShare).toBeCloseTo(760 / 960, 2);
  });

  it("missed commitments capped at 3, includes goal title", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      title: `task ${i}`,
      status: "todo",
      dueDate: "2026-08-27",
      deferredCount: 0,
      completedOn: null,
      goalTitle: "QHR",
    }));
    const r = buildEveningReview({
      today: "2026-08-27",
      facts: [fact("2026-08-27", 960, 120, 60, 60)],
      tasksDueToday: tasks,
      tasksOverdue: [],
      tasksCompletedToday: [],
      timeMinutesByClass: { productive: 60 },
      plannedMinutes: 120,
      executedPlannedMinutes: 60,
      behaviorScheduled: 1,
      behaviorMet: 0,
    });
    expect(r.missedCommitments.length).toBeLessThanOrEqual(3);
    expect(r.missedCommitments.some((m) => m.includes("QHR"))).toBe(true);
  });

  it("completionRate reflects due vs done", () => {
    const r = buildEveningReview({
      today: "2026-08-27",
      facts: [fact("2026-08-27", 960, 120, 120, 120)],
      tasksDueToday: [
        { id: "1", title: "a", status: "todo", dueDate: "2026-08-27", deferredCount: 0, completedOn: null },
        { id: "2", title: "b", status: "todo", dueDate: "2026-08-27", deferredCount: 0, completedOn: null },
      ],
      tasksOverdue: [],
      tasksCompletedToday: [{ id: "1", title: "a", status: "done", dueDate: "2026-08-27", deferredCount: 0, completedOn: "2026-08-27" }],
      timeMinutesByClass: { productive: 120 },
      plannedMinutes: 120,
      executedPlannedMinutes: 120,
      behaviorScheduled: 1,
      behaviorMet: 1,
    });
    expect(r.metrics.completionRate).toBe("1/2");
  });
});
