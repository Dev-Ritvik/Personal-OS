import { describe, it, expect } from "vitest";
import { estimateCapacity, overplanningSeverity } from "./capacity";
import type { DayFact } from "@/lib/metrics/types";

function fact(date: string, productive: number, planned: number | null): DayFact {
  return {
    date,
    wakingMinutes: 960,
    plannedMinutes: planned,
    executedPlannedMinutes: planned === null ? null : Math.min(planned, productive),
    behaviorScheduled: 1,
    behaviorMet: productive > 0 ? 1 : 0,
    tasksDue: 0,
    tasksDoneOn: 0,
    categorizedByClass: {
      productive,
      maintenance: 0,
      intentional_leisure: 0,
      unproductive: 0,
      neutral: 0,
    },
  };
}

function dates(n: number, start = "2026-08-01"): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const cur = new Date(d);
    cur.setUTCDate(d.getUTCDate() + i);
    out.push(cur.toISOString().slice(0, 10));
  }
  return out;
}

describe("estimateCapacity", () => {
  it("insufficient when <5 logged in 14d", () => {
    const f = dates(28).map((d, i) => fact(d, i < 2 ? 60 : 0, 60));
    const r = estimateCapacity(f);
    expect(r.status).toBe("insufficient_data");
  });

  it("ok when sufficient logged days with non-zero median", () => {
    const f = dates(28).map((d) => fact(d, 120, 120));
    const r = estimateCapacity(f);
    expect(r.status).toBe("ok");
    expect(r.value!.medianProductiveMin).toBe(120);
    expect(r.value!.meanProductiveMin).toBe(120);
  });

  it("median captures typical capacity, not mean spike", () => {
    const vals = [60, 60, 60, 60, 300, 300, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
    const f = dates(28).map((d, i) => fact(d, vals[i]!, 60));
    const r = estimateCapacity(f);
    expect(r.status).toBe("ok");
    // median 60, mean ~75
    expect(r.value!.medianProductiveMin).toBe(60);
    expect(r.value!.meanProductiveMin).toBeGreaterThan(60);
    expect(r.value!.p50Range.p25).toBe(60);
  });

  it("insufficient when median zero", () => {
    const f = dates(28).map((d) => fact(d, 0, 0));
    const r = estimateCapacity(f);
    expect(r.status).toBe("insufficient_data");
  });
});

describe("overplanningSeverity", () => {
  it("insufficient when capacity not ok", () => {
    const f = dates(28).map((d) => fact(d, 0, null));
    const cap = estimateCapacity(f);
    const r = overplanningSeverity(300, cap);
    expect(r.severity).toBe("insufficient");
    expect(r.ratio).toBe(null);
  });

  it("critical when >1.6x median", () => {
    const f = dates(28).map((d) => fact(d, 100, 100));
    const cap = estimateCapacity(f);
    const r = overplanningSeverity(170, cap);
    expect(r.severity).toBe("critical");
    expect(r.ratio).toBeCloseTo(1.7, 1);
  });

  it("warning when 1.2-1.6x", () => {
    const f = dates(28).map((d) => fact(d, 100, 100));
    const cap = estimateCapacity(f);
    expect(overplanningSeverity(130, cap).severity).toBe("warning");
  });

  it("ok when ≤1.2x", () => {
    const f = dates(28).map((d) => fact(d, 100, 100));
    const cap = estimateCapacity(f);
    expect(overplanningSeverity(110, cap).severity).toBe("ok");
  });
});
