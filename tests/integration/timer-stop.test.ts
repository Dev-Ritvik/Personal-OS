import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { startTimer, stopTimer, runningTimer, quickLog } from "@/server/services/timeEntries";
import { idempotent } from "@/server/api";
import { ensureTestDb, truncateAll, makeUser } from "./helpers";

const ready = await ensureTestDb();

function ctxOf(userId: string) {
  return { userId, profileTz: "UTC" };
}

(ready ? describe : describe.skip)("C6 — offline-safe timer stop protocol", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  async function startAt(iso: string) {
    // Insert with an exact historical start (service start uses server-now).
    return prisma.timeEntry.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        startedAt: new Date(iso),
        localDate: new Date(`${iso.slice(0, 10)}T00:00:00Z`),
        source: "timer",
      },
    });
  }

  it("Test A: start 10:00, client stop 10:30, reconnect at 18:00 → duration 30m", async () => {
    const e = await startAt("2026-06-15T10:00:00Z");
    // Server processes the queued stop many hours later; the carried instant wins.
    vi_setNow(new Date("2026-06-15T18:00:00Z").getTime());
    const stopped = await stopTimer(ctxOf(userId), {
      stoppedAt: "2026-06-15T10:30:00Z",
    });
    expect(stopped.durationSec).toBe(1800);
    expect(stopped.endedAt!.toISOString()).toBe("2026-06-15T10:30:00.000Z");
    expect(e.localDate.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("Test B: start 23:50 → stop 00:10 next day keeps diary attribution on the start day", async () => {
    await startAt("2026-06-15T23:50:00Z");
    const stopped = await stopTimer(ctxOf(userId), {
      stoppedAt: "2026-06-16T00:10:00Z",
    });
    expect(stopped.durationSec).toBe(1200);
    expect(stopped.localDate.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("Test C: stop timestamp three days in the future is rejected", async () => {
    await startAt(new Date(Date.now() - 3_600_000).toISOString());
    await expect(
      stopTimer(ctxOf(userId), {
        stoppedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "clock_skew_future" });
  });

  it("Test D: modest clock skew (45s future) is accepted", async () => {
    await startAt(new Date(Date.now() - 3_600_000).toISOString());
    const stopped = await stopTimer(ctxOf(userId), {
      stoppedAt: new Date(Date.now() + 45_000).toISOString(),
    });
    expect(stopped.endedAt).not.toBeNull();
    expect(stopped.durationSec).toBeGreaterThan(3500);
  });

  it("Test E: duplicate offline stop via same clientOpId replays once-stored result", async () => {
    const e = await startAt("2026-06-15T08:00:00Z");
    const op = crypto.randomUUID();
    const r1 = await idempotent(userId, op, "timer.stop", () =>
      stopTimer(ctxOf(userId), { stoppedAt: "2026-06-15T08:25:00Z" }),
    );
    const r2 = await idempotent(userId, op, "timer.stop", () =>
      stopTimer(ctxOf(userId), { stoppedAt: new Date().toISOString() }),
    );
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect((r2.result as { durationSec: number }).durationSec).toBe(1500);
    // Exactly one mutation of the row.
    const fresh = await prisma.timeEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(fresh.durationSec).toBe(1500);
  });

  it("stop before start is rejected", async () => {
    await startAt("2026-06-15T12:00:00Z");
    await expect(
      stopTimer(ctxOf(userId), { stoppedAt: "2026-06-15T11:00:00Z" }),
    ).rejects.toMatchObject({ code: "stop_before_start" });
  });

  it("running timer remains readable across a would-be reload", async () => {
    await startAt(new Date(Date.now() - 60_000).toISOString());
    const t = await runningTimer(ctxOf(userId));
    expect(t).not.toBeNull();
    expect(t!.elapsedSec).toBeGreaterThanOrEqual(0);
  });

  it("quick-log still pins its own instants (regression guard)", async () => {
    const e = await quickLog(ctxOf(userId), { durationMin: 20, note: null });
    expect(e.durationSec).toBe(1200);
  });
});

/** Minimal controllable clock for assertions that depend on server now. */
let fakeNow: number | null = null;
const realNow = Date.now;
function vi_setNow(ms: number) {
  fakeNow = ms;
  Date.now = () => ms;
}
afterEach(() => {
  if (fakeNow !== null) {
    Date.now = realNow;
    fakeNow = null;
  }
});
