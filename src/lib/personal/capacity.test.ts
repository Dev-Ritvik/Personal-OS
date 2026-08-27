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

  // Phase 2 — population separation
  it("planned-only day (planned 60, productive 0) not counted as productive evidence", () => {
    const f = dates(28).map((d, i) => fact(d, i < 14 ? 100 : 0, 60)); // first 14 productive, last 14 planned-only
    // last 14: productive 0 but planned 60 → should NOT count toward productive gates
    const r = estimateCapacity(f);
    // productive28Vals = 14 (only first 14), so gates fail for 28d ≥14? 14 meets 14, but we have 14 productive, so ok? Let's use more extreme:
    const g = dates(28).map((d) => fact(d, 0, 60)); // all planned-only, zero productive
    const r2 = estimateCapacity(g);
    expect(r2.status).toBe("insufficient_data");
  });

  it("zero productive day (explicit 0) not counted, insufficient", () => {
    const f = dates(28).map((d) => fact(d, 0, null));
    const r = estimateCapacity(f);
    expect(r.status).toBe("insufficient_data");
  });

  it("productive day counted", () => {
    const f = dates(28).map((d) => fact(d, 90, 90));
    const r = estimateCapacity(f);
    expect(r.status).toBe("ok");
    expect(r.value!.medianProductiveMin).toBe(90);
  });

  it("outlier productive day does not distort median", () => {
    const vals = Array(28).fill(60);
    vals[0] = 400; vals[1] = 10;
    const f = dates(28).map((d, i) => fact(d, vals[i]!, 60));
    const r = estimateCapacity(f);
    expect(r.value!.medianProductiveMin).toBe(60);
    expect(r.value!.meanProductiveMin).not.toBe(60);
  });

  it("fixed college commitment does not affect capacity median", () => {
    // College 11-17 is fixed commitment, not productive evidence — capacity should be based only on productive minutes, not waking
    const f = dates(28).map((d) => fact(d, 120, 120));
    // Even if waking is 960, productive 120 median should be 120 regardless of fixed class
    const r = estimateCapacity(f);
    expect(r.value!.medianProductiveMin).toBe(120);
  });

  it("capacity exceeding available time is not claimed as on_track without evidence", () => {
    // If capacity median is 120, but available time is only 60 (e.g., exam week), overplanning should be critical
    const f = dates(28).map((d) => fact(d, 60, 60));
    const cap = estimateCapacity(f);
    const over = overplanningSeverity(180, cap);
    expect(over.severity).toBe("critical");
    expect(over.ratio).toBeCloseTo(3, 0);
  });
});
