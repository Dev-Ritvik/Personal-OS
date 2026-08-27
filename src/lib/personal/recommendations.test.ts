import { describe, expect, it } from "vitest";
import { recommend } from "./recommendations";

describe("recommend()", () => {
  it("emits deadline risk for <30d active goals with low progress", () => {
    const recs = recommend({
      goals: [{ id: "g1", title: "QHR", status: "active", targetDate: "2026-11-01", progress01: 0.2 }],
      tasks: { overdue: 0, today: 1, inbox: 0 },
      deferredCount: 0,
      metrics: { overplanningRatio: { status: "insufficient_data" }, variance: { status: "insufficient_data" }, executionRateToday: { status: "insufficient_data" } },
      skillsNeedingEvidence: 0,
      savingsProgress: { insufficient: true, progress: null },
      readinessBlocked: [],
      today: "2026-10-15",
    });
    expect(recs.some((r) => r.kind === "deadline_risk")).toBe(true);
    expect(recs.find((r) => r.kind === "deadline_risk")!.confidence).toBe("MEDIUM");
  });

  it("overplanning insufficient emits insufficient card, not false certainty", () => {
    const recs = recommend({
      goals: [],
      tasks: { overdue: 0, today: 0, inbox: 0 },
      deferredCount: 0,
      metrics: { overplanningRatio: { status: "insufficient_data" }, variance: { status: "insufficient_data" }, executionRateToday: { status: "insufficient_data" } },
      skillsNeedingEvidence: 0,
      savingsProgress: { insufficient: true, progress: null },
      readinessBlocked: [],
      today: "2026-08-26",
    });
    const card = recs.find((r) => r.kind === "overplanning");
    expect(card).toBeDefined();
    expect(card!.confidence).toBe("INSUFFICIENT");
    expect(card!.evidence.insufficient).toBe(1);
  });

  it("does not fabricate financial trajectory with <3 entries", () => {
    const recs = recommend({
      goals: [],
      tasks: { overdue: 0, today: 0, inbox: 0 },
      deferredCount: 0,
      metrics: { overplanningRatio: { status: "insufficient_data" }, variance: { status: "insufficient_data" }, executionRateToday: { status: "insufficient_data" } },
      skillsNeedingEvidence: 0,
      savingsProgress: { insufficient: true, progress: null },
      readinessBlocked: [],
      today: "2026-08-26",
    });
    const fin = recs.find((r) => r.kind === "financial_insufficient");
    expect(fin).toBeDefined();
    expect(fin!.confidence).toBe("INSUFFICIENT");
  });

  it("caps at 5 and sorts HIGH first", () => {
    const recs = recommend({
      goals: [
        { id: "g1", title: "G1", status: "active", targetDate: "2026-11-01", progress01: 0.1 },
        { id: "g2", title: "G2", status: "active", targetDate: "2026-11-02", progress01: 0.1 },
      ],
      tasks: { overdue: 5, today: 2, inbox: 10 },
      deferredCount: 3,
      metrics: { overplanningRatio: { status: "ok", value: 1.8 }, variance: { status: "insufficient_data" }, executionRateToday: { status: "insufficient_data" } },
      skillsNeedingEvidence: 5,
      savingsProgress: { insufficient: false, progress: 0.2 },
      readinessBlocked: ["academic", "financial"],
      today: "2026-10-26",
    });
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs[0]!.confidence).toBe("HIGH");
  });
});
