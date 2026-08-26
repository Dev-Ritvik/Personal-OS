import type {
  DayFact,
  RawPlanInstance,
  RawTask,
  RawTimeEntry,
  ValueClass,
  WakingWindow,
} from "./types";

const VALUE_CLASSES: ValueClass[] = [
  "productive",
  "maintenance",
  "intentional_leisure",
  "unproductive",
  "neutral",
];

function emptyClasses(): Record<ValueClass, number> {
  return {
    productive: 0,
    maintenance: 0,
    intentional_leisure: 0,
    unproductive: 0,
    neutral: 0,
  };
}

function minutesFromSeconds(sec: number | null): number {
  if (sec === null || !Number.isFinite(sec)) return 0;
  return Math.max(0, sec) / 60;
}

/**
 * Normalize raw records into one DayFact per date in `dates`.
 *
 * Semantics:
 *  - Entries are attributed by their STORED local_date (frozen at write).
 *  - Running timers (durationSec null) contribute nothing yet — honest absence,
 *    not zero.
 *  - plannedMinutes is null when no live schedule/manual plan existed that day
 *    ("nothing was planned"), distinct from 0 minutes planned.
 *  - ad_hoc executions never inflate planned figures (they are, by definition,
 *    unplanned).
 */
export function buildDayFacts(
  dates: string[],
  opts: {
    entries: RawTimeEntry[];
    planInstances: RawPlanInstance[];
    tasks: RawTask[];
    wakingByDate?: Record<string, WakingWindow>;
  },
): DayFact[] {
  const classesByDate = new Map<string, Record<ValueClass, number>>();
  const plannedByDate = new Map<string, number>();
  const hasPlanByDate = new Set<string>();
  const execPlannedByDate = new Map<string, number>();
  const schedByDate = new Map<string, number>();
  const metByDate = new Map<string, number>();

  for (const e of opts.entries) {
    if (!classesByDate.has(e.localDate)) {
      classesByDate.set(e.localDate, emptyClasses());
    }
    if (e.durationSec !== null && e.valueClass) {
      const cur = classesByDate.get(e.localDate)!;
      cur[e.valueClass] += minutesFromSeconds(e.durationSec);
    }
  }

  for (const p of opts.planInstances) {
    const countsAsPlan = p.origin === "schedule" || p.origin === "manual";
    if (countsAsPlan && p.plannedMinutes !== null && p.plannedMinutes > 0) {
      plannedByDate.set(
        p.localDate,
        (plannedByDate.get(p.localDate) ?? 0) + p.plannedMinutes,
      );
      hasPlanByDate.add(p.localDate);
    }
    if (hasExecAttribution(p)) {
      // C10 remediation: overshoot is now representable — executed planned
      // minutes equal actual minutes attributable to a real plan target.
      const eff = Math.max(0, p.actualMinutes!);
      execPlannedByDate.set(
        p.localDate,
        (execPlannedByDate.get(p.localDate) ?? 0) + eff,
      );
    }
    if (p.origin === "schedule" && p.refType === "behavior") {
      schedByDate.set(p.localDate, (schedByDate.get(p.localDate) ?? 0) + 1);
      if (p.met === true) {
        metByDate.set(p.localDate, (metByDate.get(p.localDate) ?? 0) + 1);
      }
    }
  }

  const dueByDate = new Map<string, number>();
  const doneByDate = new Map<string, number>();
  for (const t of opts.tasks) {
    if (
      t.dueDate &&
      (t.status === "todo" || t.status === "doing")
    ) {
      dueByDate.set(t.dueDate, (dueByDate.get(t.dueDate) ?? 0) + 1);
    }
    if (t.completedOn) {
      doneByDate.set(t.completedOn, (doneByDate.get(t.completedOn) ?? 0) + 1);
    }
  }

  return dates.map((date) => {
    const waking = opts.wakingByDate?.[date];
    const classes = classesByDate.get(date) ?? emptyClasses();
    const planned = hasPlanByDate.has(date)
      ? (plannedByDate.get(date) ?? 0)
      : null;
    const scheduled = schedByDate.has(date) ? (schedByDate.get(date) ?? 0) : null;

    return {
      date,
      wakingMinutes: waking
        ? Math.max(0, waking.endMin - waking.startMin)
        : null,
      plannedMinutes: planned,
      executedPlannedMinutes:
        planned === null
          ? null
          : Math.max(0, execPlannedByDate.get(date) ?? 0),
      behaviorScheduled: scheduled,
      behaviorMet: scheduled === null ? null : (metByDate.get(date) ?? 0),
      tasksDue: dueByDate.get(date) ?? 0,
      tasksDoneOn: doneByDate.get(date) ?? 0,
      categorizedByClass: classes,
    };
  });
}

/** Executed time counts toward plan execution when a real target existed. */
function hasExecAttribution(p: RawPlanInstance): boolean {
  if (p.actualMinutes === null) return false;
  if (p.plannedMinutes === null || p.plannedMinutes <= 0) return false;
  if (p.origin === "ad_hoc") return false;
  return true;
}

export function totalCategorized(f: DayFact): number {
  return VALUE_CLASSES.reduce((s, c) => s + f.categorizedByClass[c], 0);
}

export function productiveMinutes(f: DayFact): number {
  return f.categorizedByClass.productive;
}
