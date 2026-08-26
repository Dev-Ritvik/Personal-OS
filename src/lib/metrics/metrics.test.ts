import { describe, expect, it } from "vitest";
import { executionRate, consistencyScore } from "./execution";
import {
  planActualVariance,
  overplanningRatio,
  underExecutionRatio,
} from "./variance";
import { unknownTimeShare, degradedConfidence } from "./unknownTime";
import { postponeSummary, overdueAccumulation } from "./postponement";
import { goalPace } from "./goalPace";
import { buildDayFacts, totalCategorized } from "./facts";
import {
  mkFacts,
  trailingDays,
  perfectMonth,
  lazyTail,
  chaoticWeek,
} from "./fixtures";
import type { DayFact, RawPlanInstance, RawTask, RawTimeEntry } from "./types";

const END = "2026-06-30";

describe("M1 executionRate", () => {
  it("full day → 1.0", () => {
    const f = mkFacts([{ date: END, behaviorScheduled: 3, behaviorMet: 3 }]);
    expect(executionRate(f[0]!)).toMatchObject({ status: "ok", value: 1 });
  });

  it("partial day → exact fraction (AC4 precision)", () => {
    const f = mkFacts([{ date: END, behaviorScheduled: 3, behaviorMet: 1 }]);
    expect(executionRate(f[0]!).value).toBeCloseTo(1 / 3, 10);
  });

  it("no obligations (null) → insufficient_data, never fabricated zero", () => {
    const f = mkFacts([{ date: END, behaviorScheduled: null }]);
    expect(executionRate(f[0]!).status).toBe("insufficient_data");
  });

  it("explicitly empty schedule (0) → insufficient (nothing to execute)", () => {
    const f = mkFacts([{ date: END, behaviorScheduled: 0, behaviorMet: 0 }]);
    expect(executionRate(f[0]!).status).toBe("insufficient_data");
  });
});

describe("M2 consistencyScore", () => {
  it("perfect month → 1.0 with n=30", () => {
    const r = consistencyScore(perfectMonth(END));
    expect(r.status).toBe("ok");
    expect(r.value).toBeCloseTo(1, 10);
    expect(r.gates[0]).toMatchObject({ observed: 30, required: 10, passed: true });
  });

  it("recency weighting dominates old failures (golden)", () => {
    // Old day (age 21) perfect, today (age 0) missed.
    const facts = mkFacts([
      { date: "2026-06-09", behaviorScheduled: 3, behaviorMet: 3 },
      { date: "2026-06-30", behaviorScheduled: 3, behaviorMet: 0 },
    ]);
    // weights: exp(0)=1 for today(rate 0), exp(-1) for old day(rate 1)
    const e = Math.exp(-1);
    const expected = e / (1 + e); // 0.268941421369...
    const r = consistencyScore(facts, { minDays: 2 });
    expect(r.value).toBeCloseTo(expected, 10);
  });

  it("gate: 9 obligation days of 10 required → insufficient with n exposed", () => {
    const facts: DayFact[] = [];
    const days = trailingDays(END, 20);
    days.forEach((date, i) => {
      facts.push(
        ...mkFacts([
          {
            date,
            behaviorScheduled: i >= 11 ? 3 : null, // exactly 9 obligation days
            behaviorMet: i >= 11 ? 3 : null,
          },
        ]),
      );
    });
    const r = consistencyScore(facts.slice(-20));
    expect(r.status).toBe("insufficient_data");
    expect(r.gates[0]).toMatchObject({
      name: "obligation_days",
      observed: 9,
      required: 10,
      passed: false,
    });
  });

  it("zero-obligation days are excluded from the denominator (missing ≠ zero)", () => {
    // 10 obligation days perfect + 20 empty days → still ok, n=10.
    const days = trailingDays(END, 30);
    const specs = days.map((date, i) => ({
      date,
      behaviorScheduled: i >= 20 ? 2 : null,
      behaviorMet: i >= 20 ? 2 : null,
    }));
    const r = consistencyScore(mkFacts(specs));
    expect(r.status).toBe("ok");
    expect(r.gates[0]?.observed).toBe(10);
  });
});

describe("M3 planActualVariance", () => {
  it("golden: 5 planned days variance −90min, −30%", () => {
    const days = trailingDays(END, 5);
    const exec = [60, 30, 0, 60, 60];
    const facts = mkFacts(
      days.map((date, i) => ({
        date,
        plannedMinutes: 60,
        executedPlannedMinutes: exec[i],
      })),
    );
    const r = planActualVariance(facts, 14);
    expect(r.status).toBe("ok");
    expect(r.value!.minutes).toBe(-90);
    expect(r.value!.pct).toBeCloseTo(-0.3, 10);
    expect(r.value!.plannedDays).toBe(5);
  });

  it("lazy tail month → strongly negative", () => {
    const r = planActualVariance(lazyTail(END), 14);
    // last 6 days: planned 240*6=1440? window 14 covers 8 perfect + 6 lazy
    // planned = 14*240=3360; exec = 8*240 + 6*60 = 2280; var = −1080
    expect(r.value!.minutes).toBe(-1080);
    expect(r.value!.pct).toBeCloseTo(2280 / 3360 - 1, 10);
  });

  it("gate: 4 planned days → insufficient", () => {
    const days = trailingDays(END, 4);
    const r = planActualVariance(mkFacts(days.map((date) => ({ date, plannedMinutes: 30 }))));
    expect(r.status).toBe("insufficient_data");
    expect(r.gates[0]?.observed).toBe(4);
  });

  it("days with no plan are missing data, not zero-variance", () => {
    const days = trailingDays(END, 10);
    const facts = mkFacts(
      days.map((date, i) => ({
        date,
        plannedMinutes: i < 4 ? 60 : null,
        executedPlannedMinutes: i < 4 ? 60 : null,
      })),
    );
    const r = planActualVariance(facts);
    expect(r.gates[0]?.observed).toBe(4);
    expect(r.status).toBe("insufficient_data");
  });
});

describe("M4 unknownTimeShare", () => {
  it("golden: waking 960, categorized 600 → 0.375", () => {
    const f = mkFacts([{ date: END, productiveMin: 600 }]);
    expect(unknownTimeShare(f[0]!).value).toBeCloseTo(0.375, 10);
  });

  it("no waking budget → insufficient", () => {
    const f = mkFacts([{ date: END, wakingMinutes: null }]);
    expect(unknownTimeShare(f[0]!).status).toBe("insufficient_data");
  });

  it("zero logging is real zero-share data, distinct from missing budget", () => {
    const f = mkFacts([{ date: END, productiveMin: 0 }]);
    expect(unknownTimeShare(f[0]!).status).toBe("ok");
    expect(unknownTimeShare(f[0]!).value).toBe(1);
  });

  it("degradedConfidence meta-gate at >60% across last 5 days", () => {
    expect(degradedConfidence([0.7, 0.65, 0.61])).toBe(true);
    expect(degradedConfidence([0.6, 0.6])).toBe(false); // strict >
    expect(degradedConfidence([])).toBe(true);
  });
});

describe("M5 postponeSummary", () => {
  it("counts chronic tasks at threshold 3", () => {
    const r = postponeSummary([
      { id: "t1", deferredCount: 3 },
      { id: "t2", deferredCount: 1 },
      { id: "t3", deferredCount: 5 },
    ]);
    expect(r.value).toEqual({
      maxDepth: 5,
      chronicCount: 2,
      worstTaskIds: ["t3", "t1"], // ordered by depth desc
    });
  });

  it("no open tasks → legitimate zero state", () => {
    expect(postponeSummary([]).value).toEqual({
      maxDepth: 0,
      chronicCount: 0,
      worstTaskIds: [],
    });
  });
});

describe("M6 overdueAccumulation", () => {
  it("growing backlog detected", () => {
    const r = overdueAccumulation([
      { weekStart: "2026-06-01", count: 5 },
      { weekStart: "2026-06-08", count: 7 },
      { weekStart: "2026-06-15", count: 9 },
    ]);
    expect(r.value).toMatchObject({ direction: "growing", delta: 4 });
  });

  it("shrinking and stable", () => {
    const shrink = overdueAccumulation([
      { weekStart: "2026-06-01", count: 9 },
      { weekStart: "2026-06-08", count: 7 },
      { weekStart: "2026-06-15", count: 2 },
    ]);
    expect(shrink.value?.direction).toBe("shrinking");
    const stable = overdueAccumulation([
      { weekStart: "2026-06-01", count: 4 },
      { weekStart: "2026-06-08", count: 4 },
      { weekStart: "2026-06-15", count: 4 },
    ]);
    expect(stable.value?.direction).toBe("stable");
  });

  it("gate: 2 weekly points → insufficient", () => {
    const r = overdueAccumulation([
      { weekStart: "2026-06-01", count: 5 },
      { weekStart: "2026-06-08", count: 7 },
    ]);
    expect(r.status).toBe("insufficient_data");
  });
});

describe("M8 overplanningRatio", () => {
  function monthWithBaseline(end: string, productive: number, plannedRecent: number | null) {
    const days = trailingDays(end, 28);
    return mkFacts(
      days.map((date, i) => ({
        date,
        productiveMin: productive,
        plannedMinutes: i >= 21 && plannedRecent !== null ? plannedRecent : null,
        executedPlannedMinutes: i >= 21 && plannedRecent !== null ? Math.round(plannedRecent / 2) : null,
      })),
    );
  }

  it("golden: 4h plans over 2h baseline → 2.0", () => {
    const r = overplanningRatio(monthWithBaseline(END, 120, 240));
    expect(r.status).toBe("ok");
    expect(r.value).toBeCloseTo(2.0, 10);
  });

  it("gate: short history → insufficient naming history_days", () => {
    const days = trailingDays(END, 20);
    const r = overplanningRatio(mkFacts(days.map((date) => ({ date, productiveMin: 100 }))));
    expect(r.status).toBe("insufficient_data");
    expect(r.gates[0]?.name).toBe("history_days");
  });

  it("gate: zero productive baseline (unlogged reality) → insufficient, honest blindness", () => {
    const r = overplanningRatio(monthWithBaseline(END, 0, 240));
    expect(r.status).toBe("insufficient_data");
    expect(r.gates.map((g) => g.name)).toContain("nonzero_baseline");
  });
});

describe("M9 underExecutionRatio", () => {
  it("golden: half execution over 8 planned days → 0.5", () => {
    const days = trailingDays(END, 8);
    const r = underExecutionRatio(
      mkFacts(days.map((date) => ({ date, plannedMinutes: 100, executedPlannedMinutes: 50 }))),
    );
    expect(r.value).toBeCloseTo(0.5, 10);
  });

  it("overshoot reports negative ratio truthfully", () => {
    const days = trailingDays(END, 8);
    // exec capped at planned by builder semantics; simulate via direct fact edit
    const facts = mkFacts(days.map((date) => ({ date, plannedMinutes: 50 })));
    const patched = facts.map((f) => ({ ...f, executedPlannedMinutes: 50 }));
    const r = underExecutionRatio(patched);
    expect(r.value).toBeCloseTo(0, 10);
  });

  it("gate: 6 planned days → insufficient", () => {
    const days = trailingDays(END, 6);
    const r = underExecutionRatio(
      mkFacts(days.map((date) => ({ date, plannedMinutes: 60 }))),
    );
    expect(r.status).toBe("insufficient_data");
  });
});

describe("M11 goalPace", () => {
  const obs = [
    { date: "2026-06-16", value: 0 },
    { date: "2026-06-20", value: 1 },
    { date: "2026-06-23", value: 2 },
    { date: "2026-06-27", value: 4 },
    { date: "2026-06-30", value: 6 },
  ];

  it("on pace → 1.0 with both raw velocities (AC6)", () => {
    const r = goalPace({
      remainingUnits: 12,
      remainingDays: 28,
      goalAgeDays: 30,
      observations: obs,
    });
    expect(r.status).toBe("ok");
    expect(r.value!.pace).toBeCloseTo(1, 10);
    expect(r.value!.requiredVelocityPerDay).toBeCloseTo(12 / 28, 10);
    expect(r.value!.observedVelocityPerDay).toBeCloseTo(6 / 14, 10);
  });

  it("behind pace → 1/3", () => {
    const r = goalPace({
      remainingUnits: 12,
      remainingDays: 28,
      goalAgeDays: 30,
      observations: obs.map((o, i) => ({ ...o, value: [0, 0, 1, 1, 2][i]! })),
    });
    expect(r.value!.pace).toBeCloseTo(1 / 3, 10);
  });

  it.each([
    {
      name: "young goal",
      input: { remainingUnits: 5, remainingDays: 20, goalAgeDays: 10 },
      observations: obs,
    },
    {
      name: "too few progress points",
      input: { remainingUnits: 5, remainingDays: 20, goalAgeDays: 40 },
      observations: obs.slice(0, 4),
    },
    {
      name: "expired deadline",
      input: { remainingUnits: 5, remainingDays: 0, goalAgeDays: 40 },
      observations: obs,
    },
  ])("gate: $name → insufficient", ({ input, observations }) => {
    const r = goalPace({ ...input, observations });
    expect(r.status).toBe("insufficient_data");
    expect(r.gates.some((g) => !g.passed)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* facts builder                                                       */
/* ------------------------------------------------------------------ */

describe("buildDayFacts", () => {
  const D1 = "2026-06-01";
  const D2 = "2026-06-02";

  it("groups entries by stored local_date and value class", () => {
    const entries: RawTimeEntry[] = [
      { localDate: D1, durationSec: 1800, valueClass: "productive" },
      { localDate: D1, durationSec: 900, valueClass: "productive" },
      { localDate: D2, durationSec: 3600, valueClass: "intentional_leisure" },
      { localDate: D1, durationSec: null, valueClass: "productive" }, // running timer
    ];
    const facts = buildDayFacts([D1, D2], { entries, planInstances: [], tasks: [] });
    expect(totalCategorized(facts[0]!)).toBeCloseTo(45, 6);
    expect(facts[0]!.categorizedByClass.productive).toBeCloseTo(45, 6);
    expect(totalCategorized(facts[1]!)).toBeCloseTo(60, 6);
  });

  it("running timer contributes nothing but does not corrupt totals", () => {
    const entries: RawTimeEntry[] = [
      { localDate: D1, durationSec: null, valueClass: undefined },
    ];
    const facts = buildDayFacts([D1], { entries, planInstances: [], tasks: [] });
    expect(totalCategorized(facts[0]!)).toBe(0);
  });

  it("executed-planned clamps overshoot at planned target", () => {
    const plans: RawPlanInstance[] = [
      {
        localDate: D1,
        refType: "behavior",
        origin: "schedule",
        plannedMinutes: 30,
        actualMinutes: 90,
        met: true,
      },
    ];
    const facts = buildDayFacts([D1], { entries: [], planInstances: plans, tasks: [] });
    expect(facts[0]!.plannedMinutes).toBe(30);
    expect(facts[0]!.executedPlannedMinutes).toBe(30);
    expect(facts[0]!.behaviorScheduled).toBe(1);
    expect(facts[0]!.behaviorMet).toBe(1);
  });

  it("ad_hoc executions never inflate planned figures", () => {
    const plans: RawPlanInstance[] = [
      { localDate: D1, refType: "behavior", origin: "ad_hoc", plannedMinutes: null, actualMinutes: 45, met: true },
    ];
    const facts = buildDayFacts([D1], { entries: [], planInstances: plans, tasks: [] });
    expect(facts[0]!.plannedMinutes).toBeNull();
    expect(facts[0]!.executedPlannedMinutes).toBeNull();
    expect(facts[0]!.behaviorScheduled).toBeNull(); // ad_hoc isn't an obligation
  });

  it("tasks: due counts open only; completion attributed by completedOn", () => {
    const tasks: RawTask[] = [
      { dueDate: D1, completedOn: null, status: "todo", deferredCount: 0 },
      { dueDate: D1, completedOn: null, status: "doing", deferredCount: 1 },
      { dueDate: D1, completedOn: D2, status: "done", deferredCount: 0 }, // closed: not due
      { dueDate: D2, completedOn: D2, status: "done", deferredCount: 0 },
      { dueDate: null, completedOn: null, status: "todo", deferredCount: 0 },
    ];
    const facts = buildDayFacts([D1, D2], { entries: [], planInstances: [], tasks });
    expect(facts[0]!.tasksDue).toBe(2);
    expect(facts[1]!.tasksDue).toBe(0);
    expect(facts[1]!.tasksDoneOn).toBe(2);
  });

  it("plan-free day stays null while logged work remains visible", () => {
    const entries: RawTimeEntry[] = [
      { localDate: D1, durationSec: 600, valueClass: "maintenance" },
    ];
    const facts = buildDayFacts([D1], { entries, planInstances: [], tasks: [] });
    expect(facts[0]!.plannedMinutes).toBeNull();
    expect(facts[0]!.executedPlannedMinutes).toBeNull();
    expect(facts[0]!.categorizedByClass.maintenance).toBeCloseTo(10, 6);
  });
});

/* ------------------------------------------------------------------ */
/* property: input order invariance                                    */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!]!;
  }
  return a;
}

describe("property: order invariance", () => {
  it("shuffling raw inputs never changes any DayFact (30 seeds)", () => {
    const dates = trailingDays(END, 30);
    const classes = ["productive", "maintenance", "intentional_leisure", "unproductive", "neutral"] as const;
    const entries: RawTimeEntry[] = [];
    const plans: RawPlanInstance[] = [];
    const tasks: RawTask[] = [];
    const rnd0 = mulberry32(42);
    for (const d of dates) {
      for (let k = 0; k < 3; k++) {
        entries.push({
          localDate: d,
          durationSec: Math.floor(rnd0() * 7200),
          valueClass: classes[Math.floor(rnd0() * classes.length)],
        });
      }
      if (rnd0() > 0.3) {
        plans.push({
          localDate: d,
          refType: rnd0() > 0.5 ? "behavior" : "task",
          origin: rnd0() > 0.3 ? "schedule" : "ad_hoc",
          plannedMinutes: rnd0() > 0.2 ? 30 + Math.floor(rnd0() * 120) : null,
          actualMinutes: rnd0() > 0.5 ? Math.floor(rnd0() * 120) : null,
          met: rnd0() > 0.5,
        });
      }
      if (rnd0() > 0.6) {
        tasks.push({
          dueDate: rnd0() > 0.5 ? d : null,
          completedOn: rnd0() > 0.7 ? d : null,
          status: rnd0() > 0.5 ? "done" : "todo",
          deferredCount: Math.floor(rnd0() * 4),
        });
      }
    }
    const base = JSON.stringify(
      buildDayFacts(dates, { entries, planInstances: plans, tasks }),
    );
    for (let s = 1; s <= 30; s++) {
      const rnd = mulberry32(s);
      const variant = JSON.stringify(
        buildDayFacts(dates, {
          entries: shuffled(entries, rnd),
          planInstances: shuffled(plans, rnd),
          tasks: shuffled(tasks, rnd),
        }),
      );
      expect(variant).toBe(base);
    }
  });
});

/* ------------------------------------------------------------------ */
/* fixture sanity                                                      */
/* ------------------------------------------------------------------ */

describe("fixtures", () => {
  it("chaotic week exercises missing-data branches without crashing", () => {
    const facts = chaoticWeek(END);
    expect(facts).toHaveLength(7);
    const m1s = facts.map((f) => executionRate(f).status);
    expect(m1s).toContain("insufficient_data");
    expect(unknownTimeShare(facts[2]!).status).toBe("insufficient_data"); // waking null
  });

  it("perfect month satisfies every P0 gate simultaneously", () => {
    const facts = perfectMonth(END);
    expect(consistencyScore(facts).status).toBe("ok");
    expect(planActualVariance(facts).status).toBe("ok");
    expect(underExecutionRatio(facts).status).toBe("ok");
  });
});
