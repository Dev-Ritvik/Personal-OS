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
});
