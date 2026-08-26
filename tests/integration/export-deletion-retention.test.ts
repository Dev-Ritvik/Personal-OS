import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { exportAll } from "@/server/services/exportService";
import { deleteEverything, DELETE_CONFIRMATION } from "@/server/services/deletion";
import { persistSnapshots, pruneSyncOps } from "@/server/services/snapshot";
import { idempotent } from "@/server/api";
import { audit } from "@/server/api";
import { ensureTestDb, truncateAll, makeUser } from "./helpers";
import { uuidv7 } from "@/server/ids";

const ready = await ensureTestDb();

function d(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

async function seedRichLife(userId: string) {
  const cat = await prisma.category.create({
    data: { id: uuidv7(), userId, name: "Deep Work", valueClass: "productive" },
  });
  const goal = await prisma.goal.create({
    data: {
      id: uuidv7(),
      userId,
      title: "G",
      horizon: "life",
      kind: "objective",
      measureType: "quantity",
      targetValue: "10",
      currentValue: "2",
      status: "active",
    },
  });
  const behavior = await prisma.behavior.create({
    data: {
      id: uuidv7(),
      userId,
      goalId: goal.id,
      categoryId: cat.id,
      title: "B",
      schedule: { type: "daily" },
      target: { unit: "times", aggregation: "count", perDay: 1 },
    },
  });
  const task = await prisma.task.create({
    data: {
      id: uuidv7(),
      userId,
      goalId: goal.id,
      title: "T",
      dueDate: new Date("2026-06-01"),
      completedAt: new Date("2026-06-02T15:00:00Z"),
      completedLocalDate: d("2026-06-02"),
      status: "done",
    },
  });
  await prisma.timeEntry.create({
    data: {
      id: uuidv7(),
      userId,
      taskId: task.id,
      startedAt: new Date("2026-06-02T10:00:00Z"),
      endedAt: new Date("2026-06-02T11:00:00Z"),
      localDate: d("2026-06-02"),
      durationSec: 3600,
      source: "quick_log",
      categoryId: cat.id,
      voidedAt: new Date("2026-06-03T00:00:00Z"), // preserved history
    },
  });
  await prisma.timeEntry.create({
    data: {
      id: uuidv7(),
      userId,
      taskId: task.id,
      startedAt: new Date("2026-06-02T12:00:00Z"),
      endedAt: new Date("2026-06-02T13:00:00Z"),
      localDate: d("2026-06-02"),
      durationSec: 3600,
      source: "quick_log",
      categoryId: cat.id,
      amendedBy: null,
    },
  });
  await prisma.planInstance.create({
    data: {
      id: uuidv7(),
      userId,
      localDate: d("2026-06-02"),
      refType: "behavior",
      refId: behavior.id,
      origin: "schedule",
      met: true,
      doneAt: new Date(),
    },
  });
  await prisma.measurement.create({
    data: { id: uuidv7(), userId, key: "sleep_hours", takenOn: d("2026-06-02"), value: "7.5" },
  });
  await prisma.event.create({
    data: {
      id: uuidv7(),
      userId,
      type: "interruption",
      occurredAt: new Date("2026-06-02T12:30:00Z"),
      localDate: d("2026-06-02"),
      durationSec: 600,
    },
  });
  await prisma.reflection.create({
    data: { id: uuidv7(), userId, localDate: d("2026-06-02"), content: "ok day" },
  });
  await prisma.categoryHistory.create({
    data: {
      id: uuidv7(),
      categoryId: cat.id,
      field: "value_class",
      oldValue: "neutral",
      newValue: "productive",
    },
  });
  await audit(userId, "seed", "test", undefined, { note: "presence only" });
}

(ready ? describe : describe.skip)("C8 — export completeness & scoping", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  it("exports every entity incl. voided history, amendments context, snapshots, audit trail", async () => {
    await seedRichLife(userId);
    await persistSnapshots(
      { id: userId, timezone: "UTC", wakingStartMin: 420, wakingEndMin: 1380 },
      "2026-06-01",
      "2026-06-03",
    );
    // A goal_progress point so snapshot filtering by user goals is exercised.
    await prisma.metricSnapshot.create({
      data: {
        metricKey: `goal_progress:${(await prisma.goal.findFirstOrThrow()).id}`,
        localDate: d("2026-06-03"),
        value: 0.2,
      },
    });

    const ex = (await exportAll(userId)) as {
      counts: Record<string, number>;
      data: Record<string, unknown[]>;
    };

    for (const key of [
      "categories", "goals", "behaviors", "tasks", "planInstances",
      "timeEntries", "measurements", "events", "reflections",
      "metricSnapshots", "auditLog",
    ]) {
      expect(ex.counts[key], key).toBeGreaterThan(0);
    }
    expect(ex.counts.auditLog).toBeGreaterThanOrEqual(1);
    // Voided rows are part of history:
    const voided = (ex.data.timeEntries as Array<{ voidedAt: string | null }>).filter(
      (t) => t.voidedAt !== null,
    );
    expect(voided.length).toBe(1);
    // No credential material anywhere in the payload:
    const raw = JSON.stringify(ex);
    expect(raw).not.toMatch(/password_hash|passwordHash.*\$s[0-9]/i);
    expect(raw).not.toMatch(/totp_secret_enc|totpSecretEnc/);
    expect(raw).not.toMatch(/"tokenHash":"(?!\"\[redacted\])/);
  });
});

(ready ? describe : describe.skip)("sync_ops 90-day retention", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  it("prunes old COMPLETED ops; recent ops still replay afterwards", async () => {
    const oldOp = crypto.randomUUID();
    const recentOp = crypto.randomUUID();

    const { result } = await idempotent(userId, recentOp, "t", async () => ({ v: 1 }));
    await prisma.syncOp.update({
      where: { clientOpId: recentOp },
      data: { receivedAt: new Date(Date.now() - 89 * 86_400_000) },
    });

    await prisma.syncOp.create({
      data: {
        id: uuidv7(),
        userId,
        clientOpId: oldOp,
        op: {},
        response: { v: 0 },
        receivedAt: new Date(Date.now() - 91 * 86_400_000),
      },
    });

    const pruned = await pruneSyncOps();
    expect(pruned).toBe(1);
    expect(await prisma.syncOp.findUnique({ where: { clientOpId: oldOp } })).toBeNull();
    expect(await prisma.syncOp.findUnique({ where: { clientOpId: recentOp } })).not.toBeNull();

    // Recent idempotency guarantee intact post-prune:
    const replay = await idempotent(userId, recentOp, "t", async () => ({ v: 999 }));
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(result);
  });

  it("never prunes a response-less reservation even if ancient", async () => {
    const pendingOld = crypto.randomUUID();
    await prisma.syncOp.create({
      data: {
        id: uuidv7(),
        userId,
        clientOpId: pendingOld,
        op: {},
        receivedAt: new Date(Date.now() - 120 * 86_400_000),
      },
    });
    await pruneSyncOps();
    expect(await prisma.syncOp.findUnique({ where: { clientOpId: pendingOld } })).not.toBeNull();
  });
});

(ready ? describe : describe.skip)("P0 deletion flow", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const u = await makeUser();
    userId = u.id;
  });

  it("wrong phrase is a no-op", async () => {
    await seedRichLife(userId);
    await expect(deleteEverything(userId, "delete everything")).rejects.toMatchObject({
      code: "confirmation_required",
    });
    expect(await prisma.user.count()).toBe(1);
  });

  it("exact phrase deletes everything atomically, leaves one payload-free tombstone", async () => {
    await seedRichLife(userId);
    await deleteEverything(userId, DELETE_CONFIRMATION);

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.timeEntry.count()).toBe(0);
    expect(await prisma.metricSnapshot.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);

    const tombstones = await prisma.auditLog.findMany({
      where: { actor: userId, action: "delete_all" },
    });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]!.diff ?? null).toBeFalsy();
  });
});
