import { describe, it, expect } from "vitest";
import { buildTrajectory } from "./trajectory";

describe("buildTrajectory", () => {
  const today = "2026-08-27";

  it("insufficient financial data produces insufficient_data milestone, not fake progress", () => {
    const view = buildTrajectory({
      today,
      goals: [],
      readiness: [],
      financial: { targetAmount: 500000, targetDate: "2027-09-01", progress: null, insufficient: true },
      currentState: [],
      targetState: [],
    });
    const f = view.milestones.find((m) => m.kind === "financial");
    expect(f?.status).toBe("insufficient_data");
    expect(f?.evidence).toContain("Insufficient");
  });

  it("overdue goal is blocked", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "QHR", horizon: "quarterly", status: "active", targetDate: "2026-08-10", progress01: 0.5 }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones[0]!.status).toBe("blocked");
    expect(view.bottlenecks[0]!).toContain("QHR");
  });

  it("at-risk when progress <0.3 with <90d left", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "Paper", horizon: "annual", status: "active", targetDate: "2026-09-20", progress01: 0.2 }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "Paper")?.status).toBe("at_risk");
  });

  it("readiness BLOCKED maps to blocked milestone", () => {
    const view = buildTrajectory({
      today,
      goals: [],
      readiness: [{ key: "financial", label: "Financial", status: "BLOCKED", missing: ["Budgeting"], nextAction: "Do budgeting" }],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.some((m) => m.kind === "readiness" && m.status === "blocked")).toBe(true);
  });

  it("next90Days filters correctly", () => {
    const view = buildTrajectory({
      today,
      goals: [
        { id: "g1", title: "Near", horizon: "quarterly", status: "active", targetDate: "2026-09-10", progress01: 0.5 },
        { id: "g2", title: "Far", horizon: "life", status: "active", targetDate: "2028-01-01", progress01: 0.5 },
      ],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.next90Days.some((m) => m.label === "Near")).toBe(true);
    expect(view.next90Days.some((m) => m.label === "Far")).toBe(false);
  });

  it("byPhase partitions without gaps", () => {
    const view = buildTrajectory({
      today,
      goals: [
        { id: "g1", title: "QHR", horizon: "quarterly", status: "active", targetDate: "2026-11-01", progress01: 0.5 },
        { id: "g2", title: "Poland", horizon: "annual", status: "active", targetDate: "2027-09-01", progress01: null },
      ],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.byPhase["now_nov2026"]!.some((m) => m.label === "QHR")).toBe(true);
    expect(view.byPhase["early2027_sep2027"]!.some((m) => m.label === "Poland")).toBe(true);
  });

  it("lifestyle milestone always present for Nov 2027", () => {
    const view = buildTrajectory({ today, goals: [], readiness: [], financial: null, currentState: [], targetState: [] });
    expect(view.milestones.some((m) => m.kind === "lifestyle" && m.date === "2027-11-01")).toBe(true);
  });

  // Phase 1 — M11 pace-aware epistemic correction (7 required cases)
  it("1. distant deadline + zero observed velocity → at_risk (M11 pace 0)", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "DistantZero", horizon: "annual", status: "active", targetDate: "2027-08-27", progress01: 0.31, pace: { status: "ok", value: { pace: 0 } } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "DistantZero")?.status).toBe("at_risk");
  });

  it("2. 31% progress + zero recent progress (pace 0) → at_risk", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "ThirtyOne", horizon: "annual", status: "active", targetDate: "2027-02-27", progress01: 0.31, pace: { status: "ok", value: { pace: 0 } } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "ThirtyOne")?.status).toBe("at_risk");
  });

  it("3. near deadline + insufficient observation window → insufficient_data", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "NearInsufficient", horizon: "quarterly", status: "active", targetDate: "2026-09-10", progress01: 0.2, pace: { status: "insufficient_data" } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "NearInsufficient")?.status).toBe("insufficient_data");
  });

  it("4. healthy velocity (pace 1.2) → on_track", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "Healthy", horizon: "quarterly", status: "active", targetDate: "2026-11-01", progress01: 0.6, pace: { status: "ok", value: { pace: 1.2 } } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "Healthy")?.status).toBe("on_track");
  });

  it("5. overdue goal → blocked", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "OverduePace", horizon: "annual", status: "active", targetDate: "2026-08-20", progress01: 0.9, pace: { status: "ok", value: { pace: 0.9 } } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "OverduePace")?.status).toBe("blocked");
  });

  it("6. achieved goal → done regardless of pace", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "DoneGoal", horizon: "annual", status: "achieved", targetDate: "2026-09-10", progress01: 1, pace: { status: "ok", value: { pace: 0 } } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "DoneGoal")?.status).toBe("done");
  });

  it("7. insufficient observation window → insufficient_data (not on_track)", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "NoWindow", horizon: "annual", status: "active", targetDate: "2027-08-27", progress01: 0.6, pace: { status: "insufficient_data" } }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    expect(view.milestones.find((m) => m.label === "NoWindow")?.status).toBe("insufficient_data");
  });

  it("distant low progress without pace → insufficient_data not on_track (no fabrication)", () => {
    const view = buildTrajectory({
      today,
      goals: [{ id: "g1", title: "DistantLowNoPace", horizon: "annual", status: "active", targetDate: "2027-08-27", progress01: 0.2, pace: null }],
      readiness: [],
      financial: null,
      currentState: [],
      targetState: [],
    });
    // 400d left, 20% progress, no pace evidence → must not claim on_track
    const m = view.milestones.find((mm) => mm.label === "DistantLowNoPace");
    expect(["at_risk", "insufficient_data"].includes(m!.status)).toBe(true);
    expect(m!.status).not.toBe("on_track");
  });
});
