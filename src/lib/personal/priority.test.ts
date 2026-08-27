import { describe, it, expect } from "vitest";
import { prioritizeTasks } from "./priority";

describe("prioritizeTasks", () => {
  const today = "2026-08-27";
  const goals = new Map([
    ["g1", { id: "g1", title: "QHR delivery", status: "active", targetDate: "2026-11-01", horizon: "quarterly", progress01: 0.2 }],
    ["g2", { id: "g2", title: "CGPA 8.0", status: "active", targetDate: "2027-05-01", horizon: "annual", progress01: 0.7 }],
    ["g3", { id: "g3", title: "Long term life", status: "active", targetDate: "2028-01-01", horizon: "life", progress01: null }],
  ]);

  it("overdue first, then today, then upcoming", () => {
    const tasks = [
      { id: "a", title: "upcoming", dueDate: "2026-09-10", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
      { id: "b", title: "overdue", dueDate: "2026-08-20", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
      { id: "c", title: "today", dueDate: "2026-08-27", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
    ];
    const r = prioritizeTasks(tasks, goals, today);
    expect(r[0]!.id).toBe("b");
    expect(r[1]!.id).toBe("c");
    expect(r[2]!.id).toBe("a");
  });

  it("chronic deferral surfaces within same urgency bucket", () => {
    const tasks = [
      { id: "a", title: "today normal", dueDate: "2026-08-27", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
      { id: "b", title: "today chronic", dueDate: "2026-08-27", deferredCount: 3, status: "todo", goalId: null, estimateMin: null },
    ];
    const r = prioritizeTasks(tasks, goals, today);
    expect(r[0]!.id).toBe("b");
    expect(r[0]!.isChronic).toBe(true);
  });

  it("goal deadline proximity boosts rank", () => {
    const tasks = [
      { id: "a", title: "QHR task", dueDate: "2026-08-28", deferredCount: 0, status: "todo", goalId: "g1", estimateMin: null },
      { id: "b", title: "CGPA task", dueDate: "2026-08-28", deferredCount: 0, status: "todo", goalId: "g2", estimateMin: null },
      { id: "c", title: "life task", dueDate: "2026-08-28", deferredCount: 0, status: "todo", goalId: "g3", estimateMin: null },
    ];
    const r = prioritizeTasks(tasks, goals, today);
    // g1 quarterly + near deadline + low progress should outrank
    expect(r[0]!.goal?.id).toBe("g1");
  });

  it("overdue goal boosts even if task due later", () => {
    const overdueGoal = new Map([
      ["gx", { id: "gx", title: "Overdue goal", status: "active", targetDate: "2026-08-10", horizon: "quarterly", progress01: 0.1 }],
    ]);
    const tasks = [
      { id: "a", title: "overdue goal task", dueDate: "2026-09-01", deferredCount: 0, status: "todo", goalId: "gx", estimateMin: null },
      { id: "b", title: "no goal upcoming", dueDate: "2026-08-28", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
    ];
    const r = prioritizeTasks(tasks, overdueGoal, today);
    expect(r[0]!.id).toBe("a");
  });

  it("no-date tasks rank lowest", () => {
    const tasks = [
      { id: "a", title: "no date", dueDate: null, deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
      { id: "b", title: "today", dueDate: "2026-08-27", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
    ];
    const r = prioritizeTasks(tasks, goals, today);
    expect(r[0]!.id).toBe("b");
    expect(r[1]!.id).toBe("a");
  });

  it("reason strings are present and not fabricated scores", () => {
    const tasks = [{ id: "a", title: "t", dueDate: "2026-08-20", deferredCount: 3, status: "todo", goalId: "g1", estimateMin: null }];
    const r = prioritizeTasks(tasks, goals, today);
    expect(r[0]!.reason).toContain("Overdue");
    expect(r[0]!.reason).toContain("repeatedly deferred");
    // no numeric 0-100 score exposed
    expect((r[0]! as any).score).toBeUndefined();
  });

  it("target-state relevance boosts rank when other factors equal", () => {
    const tasks = [
      { id: "a", title: "cook dinner", dueDate: "2026-08-28", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
      { id: "b", title: "random task", dueDate: "2026-08-28", deferredCount: 0, status: "todo", goalId: null, estimateMin: null },
    ];
    const opts = { targetStateTaskIds: new Set(["a"]) };
    const r = prioritizeTasks(tasks, goals, today, opts);
    expect(r[0]!.id).toBe("a");
    expect(r[0]!.reason).toContain("Poland target lifestyle");
    expect(r[1]!.id).toBe("b");
  });
});
