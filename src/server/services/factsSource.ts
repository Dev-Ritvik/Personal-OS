import { prisma } from "../db";
import { localDateInTz } from "@/lib/metrics/dates";
import type {
  RawPlanInstance,
  RawTask,
  RawTimeEntry,
  ValueClass,
  WakingWindow,
} from "@/lib/metrics/types";

/**
 * Bridge layer: loads exactly the raw records the PURE metric core consumes.
 * All timezone/day-attribution decisions were already frozen at WRITE time;
 * this module never re-derives dates (except task completion, which stores
 * only an instant — derived here with the profile tz and documented as such).
 */
export interface RawInputs {
  dates: string[];
  entries: RawTimeEntry[];
  planInstances: RawPlanInstance[];
  tasks: RawTask[];
  wakingByDate: Record<string, WakingWindow>;
}

export async function loadRawInputs(
  userId: string,
  dates: string[],
  opts: { timezone: string; wakingStartMin: number; wakingEndMin: number },
): Promise<RawInputs> {
  const from = new Date(`${dates[0]}T00:00:00Z`);
  const to = new Date(`${dates[dates.length - 1]}T00:00:00Z`);

  const [entries, plans, openTasks, doneTasks] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId, voidedAt: null, localDate: { gte: from, lte: to } },
      select: {
        localDate: true,
        durationSec: true,
        categoryId: true,
        behaviorId: true,
        category: { select: { valueClass: true } },
        behavior: { select: { category: { select: { valueClass: true } } } },
      },
    }),
    prisma.planInstance.findMany({
      where: { userId, voidedAt: null, localDate: { gte: from, lte: to } },
      select: {
        localDate: true,
        refType: true,
        origin: true,
        plannedMinutes: true,
        actualMinutes: true,
        met: true,
      },
    }),
    prisma.task.findMany({
      where: { userId, deletedAt: null, status: { in: ["todo", "doing"] }, dueDate: { not: null } },
      select: { dueDate: true, status: true, deferredCount: true, id: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        status: "done",
        completedAt: {
          gte: new Date(from.getTime() - 36 * 3600_000),
          lte: new Date(to.getTime() + 12 * 3600_000),
        },
      },
      select: { completedAt: true, completedLocalDate: true, status: true, deferredCount: true, id: true },
    }),
  ]);

  // Value-class resolution: explicit entry category > linked behavior's
  // category > uncategorized (undefined → excluded from categorized sums).
  const entriesRaw: RawTimeEntry[] = entries.map((e) => ({
    localDate: e.localDate.toISOString().slice(0, 10),
    durationSec: e.durationSec,
    valueClass:
      e.category?.valueClass ??
      e.behavior?.category?.valueClass ??
      undefined,
  }));

  const plansRaw: RawPlanInstance[] = plans.map((p) => ({
    localDate: p.localDate.toISOString().slice(0, 10),
    refType: p.refType as "behavior" | "task",
    origin: p.origin as RawPlanInstance["origin"],
    plannedMinutes: p.plannedMinutes,
    actualMinutes: p.actualMinutes,
    met: p.met,
  }));

  const tasksRaw: RawTask[] = [
    ...openTasks.map((t) => ({
      dueDate: t.dueDate!.toISOString().slice(0, 10),
      completedOn: null,
      status: t.status as RawTask["status"],
      deferredCount: t.deferredCount,
    })),
    ...doneTasks.map((t) => ({
      dueDate: null,
      // C9: frozen completion day preferred. Legacy rows (field null) fall
      // back to read-time derivation with the current profile tz — documented,
      // bounded to pre-remediation data only.
      completedOn:
        t.completedLocalDate?.toISOString().slice(0, 10) ??
        (t.completedAt ? localDateInTz(t.completedAt, opts.timezone) : null),
      status: t.status as RawTask["status"],
      deferredCount: t.deferredCount,
    })),
  ];

  const wakingByDate: Record<string, WakingWindow> = {};
  for (const d of dates) {
    wakingByDate[d] = { startMin: opts.wakingStartMin, endMin: opts.wakingEndMin };
  }

  return { dates, entries: entriesRaw, planInstances: plansRaw, tasks: tasksRaw, wakingByDate };
}

export type { ValueClass };
