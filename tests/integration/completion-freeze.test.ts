import { beforeEach, describe, expect, it } from "vitest";
import { loadRawInputs } from "@/server/services/factsSource";
import { buildDayFacts } from "@/lib/metrics/facts";
import { prisma } from "@/server/db";
import { ensureTestDb, truncateAll, makeUser } from "./helpers";
import { uuidv7 } from "@/server/ids";

const ready = await ensureTestDb();

(ready ? describe : describe.skip)("C9 — frozen completion day under timezone change", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  it("changing the profile timezone does NOT move completed tasks between days", async () => {
    await prisma.task.create({
      data: {
        id: uuidv7(),
        userId,
        title: "frozen completion",
        status: "done",
        completedAt: new Date("2026-06-02T20:30:00Z"), // 03-06 in Tokyo, 06-02 16:30 in NY
        completedLocalDate: new Date("2026-06-02T00:00:00Z"),
      },
    });

    const dates = ["2026-06-01", "2026-06-02", "2026-06-03"];

    const asTokyo = buildDayFacts(
      dates,
      await loadRawInputs(userId, dates, { timezone: "Asia/Tokyo", wakingStartMin: 420, wakingEndMin: 1380 }),
    );
    const asNY = buildDayFacts(
      dates,
      await loadRawInputs(userId, dates, { timezone: "America/New_York", wakingStartMin: 420, wakingEndMin: 1380 }),
    );

    expect(asTokyo.map((f) => f.tasksDoneOn)).toEqual([0, 1, 0]);
    expect(asNY.map((f) => f.tasksDoneOn)).toEqual([0, 1, 0]);
  });

  it("legacy rows without a frozen date still derive (documented fallback), flagged by absence", async () => {
    await prisma.task.create({
      data: {
        id: uuidv7(),
        userId,
        title: "legacy",
        status: "done",
        completedAt: new Date("2026-06-02T20:30:00Z"),
        // completedLocalDate intentionally null (pre-remediation row)
      },
    });
    const dates = ["2026-06-02", "2026-06-03"];
    const tokyo = buildDayFacts(
      dates,
      await loadRawInputs(userId, dates, { timezone: "Asia/Tokyo", wakingStartMin: 420, wakingEndMin: 1380 }),
    );
    const ny = buildDayFacts(
      dates,
      await loadRawInputs(userId, dates, { timezone: "America/New_York", wakingStartMin: 420, wakingEndMin: 1380 }),
    );
    // Legacy fallback derives from CURRENT profile tz — Tokyo lands 06-03,
    // NY lands 06-02. This is exactly the drift the frozen field eliminates.
    expect(tokyo.map((f) => f.tasksDoneOn)).toEqual([0, 1]);
    expect(ny.map((f) => f.tasksDoneOn)).toEqual([1, 0]);
  });
});
