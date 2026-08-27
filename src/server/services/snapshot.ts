import { prisma } from "../db";
import { Prisma } from "@prisma/client";
import { buildDayFacts, totalCategorized } from "@/lib/metrics/facts";
import { unknownTimeShare } from "@/lib/metrics/unknownTime";
import { computeGoalProgress } from "@/lib/goals/progress";
import { dateRange, diffDays, todayInTz } from "@/lib/metrics/dates";
import { loadRawInputs } from "./factsSource";
import type { DayFact } from "@/lib/metrics/types";

/**
 * Snapshot job (ARCHITECTURE.md §8.3): normalizes raw rows into immutable
 * day-level metric_snapshots. Downstream analytics may read ONLY this layer;
 * recomputation is always explicit.
 */

const DAY_FACT_KEYS = [
  "waking_minutes",
  "planned_minutes",
  "executed_planned_minutes",
  "productive_minutes",
  "unknown_share",
  "behavior_scheduled",
  "behavior_met",
  "tasks_due",
  "tasks_done_on",
] as const;

function factValue(fact: DayFact, key: (typeof DAY_FACT_KEYS)[number]): number | null {
  switch (key) {
    case "waking_minutes": return fact.wakingMinutes;
    case "planned_minutes": return fact.plannedMinutes;
    case "executed_planned_minutes": return fact.executedPlannedMinutes;
    case "productive_minutes": return fact.categorizedByClass.productive;
    case "unknown_share":
      return unknownTimeShare(fact).status === "ok"
        ? unknownTimeShare(fact).value!
        : null;
    case "behavior_scheduled": return fact.behaviorScheduled;
    case "behavior_met": return fact.behaviorMet;
    case "tasks_due": return fact.tasksDue;
    case "tasks_done_on": return fact.tasksDoneOn;
  }
}

export async function persistSnapshots(
  user: { id: string; timezone: string; wakingStartMin: number; wakingEndMin: number },
  fromDate: string,
  toDate: string,
): Promise<{ daysWritten: number; goalSeriesWritten: number }> {
  const dates = dateRange(fromDate, toDate);
  const raw = await loadRawInputs(user.id, dates, {
    timezone: user.timezone,
    wakingStartMin: user.wakingStartMin,
    wakingEndMin: user.wakingEndMin,
  });
  const facts = buildDayFacts(dates, raw);

  let daysWritten = 0;

  // Overdue-as-of-date. Bounded (perf remediation): only tasks whose
  // completion could fall inside the window are loaded.
  const fromD = new Date(`${fromDate}T00:00:00Z`);
  const toD = new Date(`${toDate}T00:00:00Z`);
  const [openAll, doneInRange] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, deletedAt: null, status: { in: ["todo", "doing"] } },
      select: { dueDate: true },
    }),
    prisma.task.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: { in: ["done", "cancelled"] },
        completedAt: {
          gte: new Date(fromD.getTime() - 36 * 3600_000),
          lte: new Date(toD.getTime() + 12 * 3600_000),
        },
      },
      select: { dueDate: true, completedAt: true },
    }),
  ]);
  const overdueCountByDate = new Map<string, number>();
  for (const date of dates) {
    const d = new Date(`${date}T00:00:00Z`);
    let n = openAll.filter((t) => t.dueDate && t.dueDate < d).length;
    // Tasks completed after `date` were still open then (if due before it).
    for (const t of doneInRange) {
      if (
        t.dueDate &&
        t.dueDate < d &&
        t.completedAt &&
        t.completedAt >= new Date(d.getTime() + 86_400_000)
      ) {
        n++;
      }
    }
    overdueCountByDate.set(date, n);
  }

  // Batched recompute (perf remediation): one delete + one create per chunk
  // replaces ~10 sequential upserts per day. Recompute semantics preserved —
  // the range is fully rewritten each run.
  const rows: Array<{
    metricKey: string;
    localDate: Date;
    value: number;
    payload?: object;
    computedAt: Date;
  }> = [];
  for (const fact of facts) {
    for (const key of DAY_FACT_KEYS) {
      const v = factValue(fact, key);
      // Convention: value −1 with payload.missing=true means "no observation"
      // (schema requires non-null Float). Analytics treat <0 as missing.
      rows.push({
        metricKey: key,
        localDate: new Date(`${fact.date}T00:00:00Z`),
        value: v === null ? -1 : v,
        payload:
          v === null
            ? { missing: true }
            : key === "productive_minutes" || key === "unknown_share"
              ? { totalCategorized: Math.round(totalCategorized(fact)) }
              : undefined,
        computedAt: new Date(),
      });
    }
    rows.push({
      metricKey: "overdue_count",
      localDate: new Date(`${fact.date}T00:00:00Z`),
      value: overdueCountByDate.get(fact.date) ?? 0,
      computedAt: new Date(),
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction([
      prisma.metricSnapshot.deleteMany({
        where: {
          localDate: { gte: fromD, lte: toD },
          metricKey: { in: chunk.map((r) => r.metricKey) },
          // Only rewrite day-fact/overdue keys here; goal_progress series
          // is owned by the goal loop below.
          NOT: { metricKey: { startsWith: "goal_progress:" } },
        },
      }),
      prisma.metricSnapshot.createMany({ data: chunk }),
    ]);
    daysWritten += new Set(chunk.map((r) => r.localDate.toISOString())).size;
  }

  // Goal-progress series feeding M11 gates.
  const goals = await prisma.goal.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: "active",
      measureType: { in: ["quantity", "cumulative", "duration", "deadline"] },
      targetValue: { not: null },
    },
  });
  const today = todayInTz(user.timezone);
  let goalSeriesWritten = 0;

  for (const g of goals) {
    let currentUnits: number | undefined;
    if (g.measureType === "duration") {
      const agg = await prisma.timeEntry.aggregate({
        where: {
          userId: user.id,
          voidedAt: null,
          OR: [
            { task: { goalId: g.id } },
            { behavior: { goalId: g.id } },
            ...(g.parentId ? [] : []),
          ],
        },
        _sum: { durationSec: true },
      });
      currentUnits = (agg._sum.durationSec ?? 0) / 3600;
    } else {
      currentUnits = g.currentValue !== null ? Number(g.currentValue) : undefined;
    }

    const prog = computeGoalProgress(
      {
        measureType: g.measureType,
        targetValue: g.targetValue !== null ? Number(g.targetValue) : null,
        direction: g.direction,
        status: g.status,
        closingValue: g.closingValue !== null ? Number(g.closingValue) : null,
        startDate: g.startDate?.toISOString().slice(0, 10) ?? null,
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      },
      { currentUnits, today },
    );
    if (prog.value01 === null) continue;

    const key = `goal_progress:${g.id}`;
    const localDate = new Date(`${today}T00:00:00Z`);
    await prisma.metricSnapshot.upsert({
      where: { metricKey_localDate: { metricKey: key, localDate } },
      create: {
        metricKey: key,
        localDate,
        value: prog.value01,
        payload: { currentLabel: prog.currentLabel },
        computedAt: new Date(),
      },
      update: {
        value: prog.value01,
        payload: { currentLabel: prog.currentLabel },
        computedAt: new Date(),
      },
    });
    goalSeriesWritten++;
  }

  // §14 retention: sync_ops older than 90 days are pruned on the nightly run.
  await pruneSyncOps();

  return { daysWritten, goalSeriesWritten };
}

/** 90-day sync_ops retention (§14). Recent ops — the only ones clients may
 *  still replay — are untouched, so idempotency guarantees hold. */
export async function pruneSyncOps(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 3600_000);
  const res = await prisma.syncOp.deleteMany({
    where: {
      receivedAt: { lt: cutoff },
      // Never delete an op that has not produced its response yet: it may
      // still be pending on a client queue.
      NOT: { response: { equals: Prisma.JsonNull } },
    },
  });
  return res.count;
}

/** Progress observations for M11 from the snapshot series (+ today's live point). */
export async function goalProgressObservations(
  goalId: string,
  today: string,
  startDate: string | null,
): Promise<Array<{ date: string; value: number }>> {
  const rows = await prisma.metricSnapshot.findMany({
    where: { metricKey: `goal_progress:${goalId}` },
    orderBy: { localDate: "asc" },
    select: { localDate: true, value: true },
  });
  const obs = rows.map((r) => ({
    date: r.localDate.toISOString().slice(0, 10),
    value: r.value,
  }));
  const have = new Set(obs.map((o) => o.date));
  if (!have.has(today)) obs.push({ date: today, value: latestValue(obs) });
  void startDate;
  return obs.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function latestValue(obs: Array<{ date: string; value: number }>): number {
  return obs.length ? obs[obs.length - 1]!.value : 0;
}

export async function goalAgeDays(goalId: string, today: string): Promise<number> {
  const g = await prisma.goal.findUnique({ where: { id: goalId }, select: { startDate: true, createdAt: true } });
  if (!g) return 0;
  const start = (g.startDate ?? g.createdAt).toISOString().slice(0, 10);
  return Math.max(0, diffDays(today, start));
}
