import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";
import { localDateInTz } from "@/lib/metrics/dates";

interface EntryCtx {
  userId: string;
  /** Device timezone at logging moment; falls back to profile tz. */
  deviceTz?: string;
  profileTz: string;
}

function tzOf(ctx: EntryCtx): string {
  return ctx.deviceTz || ctx.profileTz;
}

/** The single running timer, with server-computed elapsed seconds. */
export async function runningTimer(ctx: EntryCtx) {
  const row = await prisma.timeEntry.findFirst({
    where: { userId: ctx.userId, endedAt: null, voidedAt: null },
    orderBy: { startedAt: "desc" },
    include: {
      category: { select: { name: true, valueClass: true } },
      task: { select: { title: true } },
      behavior: { select: { title: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    elapsedSec: Math.max(0, Math.floor((Date.now() - row.startedAt.getTime()) / 1000)),
  };
}

/**
 * Start a timer (server-authoritative instants, AC2).
 * Any previously-running entry is auto-closed at the new start instant —
 * reality is preserved with an explicit flag rather than silently discarded.
 */
export async function startTimer(
  ctx: EntryCtx,
  input: {
    categoryId?: string | null;
    taskId?: string | null;
    behaviorId?: string | null;
    note?: string | null;
    deviceId?: string | null;
  },
) {
  const now = new Date();
  const tz = tzOf(ctx);
  const localDate = localDateInTz(now, tz);

  const open = await prisma.timeEntry.findMany({
    where: { userId: ctx.userId, endedAt: null, voidedAt: null },
  });
  for (const o of open) {
    await prisma.timeEntry.update({
      where: { id: o.id },
      data: {
        endedAt: now,
        durationSec: Math.max(0, Math.floor((now.getTime() - o.startedAt.getTime()) / 1000)),
        autoClosed: true,
      },
    });
  }

  return prisma.timeEntry.create({
    data: {
      id: uuidv7(),
      userId: ctx.userId,
      startedAt: now,
      localDate: new Date(localDate),
      source: "timer",
      categoryId: input.categoryId ?? null,
      taskId: input.taskId ?? null,
      behaviorId: input.behaviorId ?? null,
      note: input.note ?? null,
      deviceId: input.deviceId ?? null,
    },
  });
}

/**
 * Stop the running timer.
 *
 * C6 remediation: the client transmits its intended stop instant. The server
 * validates it against skew bounds and remains authoritative:
 *   - omitted  -> server now (legacy/online path)
 *   - < start  -> rejected (400)
 *   - > now+5m -> rejected (400 clock_skew_future) — no arbitrary durations
 *   - > now+60s-> accepted, flagged via audit trail (anomalous skew)
 * local_date stays frozen from startedAt (diary attribution), never re-derived
 * from the stop instant.
 */
export async function stopTimer(
  ctx: EntryCtx,
  input: { stoppedAt?: string },
) {
  const row = await prisma.timeEntry.findFirst({
    where: { userId: ctx.userId, endedAt: null, voidedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!row) throw new ApiError(404, "no_running_timer", "No timer is running");

  const now = Date.now();
  let stopMs = now;
  if (input.stoppedAt !== undefined) {
    const parsed = Date.parse(input.stoppedAt);
    if (Number.isNaN(parsed)) {
      throw new ApiError(400, "bad_timestamp", "Invalid stoppedAt");
    }
    if (parsed < row.startedAt.getTime()) {
      throw new ApiError(400, "stop_before_start", "Stop instant precedes start");
    }
    const futureSkewMs = parsed - now;
    if (futureSkewMs > 5 * 60_000) {
      throw new ApiError(400, "clock_skew_future", "Stop instant too far in the future");
    }
    if (futureSkewMs > 60_000) {
      await auditSafe(ctx.userId, Math.round(futureSkewMs / 1000));
    }
    stopMs = parsed;
  }

  return prisma.timeEntry.update({
    where: { id: row.id },
    data: {
      endedAt: new Date(stopMs),
      durationSec: Math.max(0, Math.floor((stopMs - row.startedAt.getTime()) / 1000)),
    },
  });
}

async function auditSafe(userId: string, skewSec: number): Promise<void> {
  try {
    const { audit } = await import("../api");
    await audit(userId, "timer_clock_skew", "time_entry", undefined, { skewSec });
  } catch {
    // Auditing must never break the stop path.
  }
}

/** Quick-log: lowest-friction capture after the fact. */
export async function quickLog(
  ctx: EntryCtx,
  input: {
    durationMin: number;
    startedAt?: string;
    categoryId?: string | null;
    taskId?: string | null;
    behaviorId?: string | null;
    note?: string | null;
  },
) {
  const now = Date.now();
  const startedMs = input.startedAt ? Date.parse(input.startedAt) : now - input.durationMin * 60_000;
  if (Number.isNaN(startedMs)) throw new ApiError(400, "bad_timestamp", "Invalid startedAt");
  if (startedMs > now + 5 * 60_000) {
    throw new ApiError(400, "future_entry", "Entries cannot start in the future");
  }
  const startedAt = new Date(startedMs);
  const tz = tzOf(ctx);

  return prisma.timeEntry.create({
    data: {
      id: uuidv7(),
      userId: ctx.userId,
      startedAt,
      endedAt: new Date(startedMs + input.durationMin * 60_000),
      localDate: new Date(localDateInTz(startedAt, tz)),
      durationSec: input.durationMin * 60,
      source: "quick_log",
      categoryId: input.categoryId ?? null,
      taskId: input.taskId ?? null,
      behaviorId: input.behaviorId ?? null,
      note: input.note ?? null,
    },
  });
}

/**
 * Correction protocol (ARCHITECTURE.md §13): the original row is VOIDED and a
 * corrected sibling is inserted referencing it via amended_by. History stays
 * analytically reproducible forever (AC10).
 */
export async function amendEntry(
  ctx: EntryCtx,
  id: string,
  patch: {
    durationMin?: number;
    startedAt?: string;
    categoryId?: string | null;
    taskId?: string | null;
    behaviorId?: string | null;
    note?: string | null;
  },
) {
  const original = await prisma.timeEntry.findFirst({
    where: { id, userId: ctx.userId, voidedAt: null },
  });
  if (!original) throw new ApiError(404, "not_found", "Time entry not found");
  if (original.endedAt === null) {
    throw new ApiError(400, "running_timer", "Stop the timer before amending");
  }

  const startedMs = patch.startedAt ? Date.parse(patch.startedAt) : original.startedAt.getTime();
  if (Number.isNaN(startedMs)) throw new ApiError(400, "bad_timestamp", "Invalid startedAt");
  const durationSec = patch.durationMin
    ? patch.durationMin * 60
    : original.durationSec ?? 0;

  const amended = await prisma.$transaction(async (tx) => {
    const created = await tx.timeEntry.create({
      data: {
        id: uuidv7(),
        userId: ctx.userId,
        startedAt: new Date(startedMs),
        endedAt: new Date(startedMs + durationSec * 1000),
        localDate: new Date(localDateInTz(new Date(startedMs), tzOf(ctx))),
        durationSec,
        source: original.source,
        categoryId: patch.categoryId !== undefined ? patch.categoryId : original.categoryId,
        taskId: patch.taskId !== undefined ? patch.taskId : original.taskId,
        behaviorId: patch.behaviorId !== undefined ? patch.behaviorId : original.behaviorId,
        note: patch.note !== undefined ? patch.note : original.note,
        deviceId: original.deviceId,
      },
    });
    await tx.timeEntry.update({
      where: { id: original.id },
      data: { voidedAt: new Date(), amendedBy: created.id },
    });
    return created;
  });

  return amended;
}

/** Void without replacement (erroneous entry). */
export async function voidEntry(ctx: EntryCtx, id: string) {
  const res = await prisma.timeEntry.updateMany({
    where: { id, userId: ctx.userId, voidedAt: null },
    data: { voidedAt: new Date() },
  });
  if (res.count === 0) throw new ApiError(404, "not_found", "Time entry not found");
}

export async function entriesForDate(ctx: EntryCtx, date: string) {
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId: ctx.userId,
      localDate: new Date(date),
      OR: [{ voidedAt: null }, { voidedAt: { not: null } }],
    },
    orderBy: { startedAt: "asc" },
    include: {
      category: { select: { name: true, valueClass: true } },
      task: { select: { title: true } },
      behavior: { select: { title: true } },
    },
  });
  return rows;
}
