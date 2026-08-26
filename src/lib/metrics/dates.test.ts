import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  diffDays,
  isValidLocalDate,
  localDateInTz,
  todayInTz,
  tzOffsetMinutes,
  zonedWallTimeToUtc,
} from "./dates";

const NY = "America/New_York";
const BERLIN = "Europe/Berlin";
const KTM = "Asia/Kathmandu";

describe("localDateInTz", () => {
  it("normal conversion", () => {
    expect(localDateInTz(new Date("2026-06-15T12:00:00Z"), NY)).toBe("2026-06-15");
    expect(localDateInTz(new Date("2026-06-15T12:00:00Z"), KTM)).toBe("2026-06-15");
    expect(localDateInTz(new Date("2026-06-15T20:00:00Z"), KTM)).toBe("2026-06-16"); // +05:45
  });

  it("US spring forward 2026-03-08 (02:00 EST → 03:00 EDT)", () => {
    // 06:59Z is still EST (01:59 local) — same calendar day.
    expect(localDateInTz(new Date("2026-03-08T06:59:00Z"), NY)).toBe("2026-03-08");
    // 07:00Z becomes EDT (03:00 local).
    expect(localDateInTz(new Date("2026-03-08T07:00:00Z"), NY)).toBe("2026-03-08");
    // UTC date differs from frozen local date before the offset change.
    expect(localDateInTz(new Date("2026-03-08T04:00:00Z"), NY)).toBe("2026-03-07");
  });

  it("US fall back 2026-11-01 — ambiguous hour maps to one date", () => {
    expect(localDateInTz(new Date("2026-11-01T05:30:00Z"), NY)).toBe("2026-11-01"); // EDT 01:30
    expect(localDateInTz(new Date("2026-11-01T06:30:00Z"), NY)).toBe("2026-11-01"); // EST 01:30 (repeat)
  });

  it("EU fall back Europe/Berlin 2026-10-25", () => {
    expect(localDateInTz(new Date("2026-10-25T00:30:00Z"), BERLIN)).toBe("2026-10-25"); // CEST 02:30
    expect(localDateInTz(new Date("2026-10-25T01:30:00Z"), BERLIN)).toBe("2026-10-25"); // CET 02:30 (repeat)
  });
});

describe("tzOffsetMinutes", () => {
  it("standard vs daylight", () => {
    expect(tzOffsetMinutes(NY, new Date("2026-01-15T12:00:00Z"))).toBe(-300);
    expect(tzOffsetMinutes(NY, new Date("2026-07-15T12:00:00Z"))).toBe(-240);
  });

  it("quarter-hour zone", () => {
    expect(tzOffsetMinutes(KTM, new Date("2026-01-15T12:00:00Z"))).toBe(345);
  });
});

describe("zonedWallTimeToUtc", () => {
  it("roundtrip summer (EDT −240)", () => {
    expect(zonedWallTimeToUtc("2026-07-01", 720, NY).toISOString()).toBe(
      "2026-07-01T16:00:00.000Z",
    );
  });

  it("roundtrip winter (EST −300)", () => {
    expect(zonedWallTimeToUtc("2026-01-01", 720, NY).toISOString()).toBe(
      "2026-01-01T17:00:00.000Z",
    );
  });

  it("fold resolves to FIRST occurrence (earlier instant)", () => {
    // Berlin wall 02:30 exists twice (CEST 00:30Z, CET 01:30Z); picks CEST.
    expect(zonedWallTimeToUtc("2026-10-25", 150, BERLIN).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("gap resolves FORWARD past the skipped hour (moment-timezone convention)", () => {
    // NY wall 02:30 does not exist on 2026-03-08 → first valid wall after gap.
    expect(zonedWallTimeToUtc("2026-03-08", 150, NY).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z", // displays 03:30 EDT
    );
  });

  it("waking-window boundaries survive roundtrip across DST day", () => {
    const start = zonedWallTimeToUtc("2026-03-08", 420, NY); // 07:00 local
    const end = zonedWallTimeToUtc("2026-03-08", 1380, NY); // 23:00 local
    expect(start.toISOString()).toBe("2026-03-08T11:00:00.000Z"); // EDT
    expect(end.toISOString()).toBe("2026-03-09T03:00:00.000Z");   // EDT
    expect(localDateInTz(end, NY)).toBe("2026-03-08");
  });
});

describe("todayInTz (C2 — authoritative local today)", () => {
  it("UTC+ user is on the next day while UTC still shows yesterday", () => {
    const instant = new Date("2026-06-15T17:30:00Z"); // 23:00 Tokyo, 13:30 NY
    expect(todayInTz("Asia/Tokyo", instant)).toBe("2026-06-16");
    expect(todayInTz("America/New_York", instant)).toBe("2026-06-15");
    expect(todayInTz("UTC", instant)).toBe("2026-06-15");
  });

  it("UTC− user is on the previous day late in the UTC day", () => {
    const instant = new Date("2026-06-15T03:00:00Z"); // 23:00 NY (06-14? No: 03:00Z=23:00 EDT 06-14? EDT−4 → 06-14 23:00)
    expect(todayInTz("America/New_York", instant)).toBe("2026-06-14");
    expect(todayInTz("UTC", instant)).toBe("2026-06-15");
    // UTC+14 (Kiritimati) already tomorrow.
    expect(todayInTz("Pacific/Kiritimati", instant)).toBe("2026-06-15"); // 17:00 same day
  });

  it("midnight crossing both directions", () => {
    expect(todayInTz("UTC", new Date("2026-06-15T23:59:59Z"))).toBe("2026-06-15");
    expect(todayInTz("UTC", new Date("2026-06-16T00:00:00Z"))).toBe("2026-06-16");
  });
});

describe("date arithmetic", () => {
  it("addDays / diffDays", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-07-01", "2026-06-30")).toBe(1);
    expect(diffDays("2026-06-30", "2026-07-01")).toBe(-1);
  });

  it("leap-day handling", () => {
    expect(isValidLocalDate("2028-02-29")).toBe(true);
    expect(isValidLocalDate("2027-02-29")).toBe(false);
    expect(dateRange("2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("rejects malformed input", () => {
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalDate("junk")).toBe(false);
  });
});
