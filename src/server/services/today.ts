import { prisma } from "../db";
import {
  buildDayFacts,
  totalCategorized,
} from "@/lib/metrics/facts";
import { executionRate } from "@/lib/metrics/execution";
import { unknownTimeShare, degradedConfidence } from "@/lib/metrics/unknownTime";
import {
  planActualVariance,
  overplanningRatio,
  underExecutionRatio,
} from "@/lib/metrics/variance";
import { consistencyScore } from "@/lib/metrics/execution";
import { postponeSummary } from "@/lib/metrics/postponement";
import { goalPace } from "@/lib/metrics/goalPace";
import { addDays, dateRange, diffDays, todayInTz } from "@/lib/metrics/dates";
import { ensurePlanRange, listForDate } from "./plans";
import { runningTimer } from "./timeEntries";
import { loadRawInputs } from "./factsSource";
import { goalProgressObservations } from "./snapshot";

/**
 * Assembles the Today dashboard payload.
 * Every number is either a raw count or a MetricResult carrying its own
 * formula/gates — the UI never invents values (AC15, AC7).
 */
export async function assembleToday(
  user: {
    id: string;
    timezone: string;
    wakingStartMin: number;
    wakingEndMin: number;
  },
  deviceTz?: string,
) {
  const tz = deviceTz || user.timezone;
  const today = todayInTz(tz);
  const tomorrow = addDays(today, 1);

  // AC1: scheduled behaviors materialize in today's + tomorrow's plan.
  await ensurePlanRange(user.id, [today, tomorrow]);

  const dates = dateRange(addDays(today, -29), today);
  const raw = await loadRawInputs(user.id, dates, {
    timezone: user.timezone,
    wakingStartMin: user.wakingStartMin,
    wakingEndMin: user.wakingEndMin,
  });
  const facts = buildDayFacts(dates, raw);
  const factToday = facts[facts.length - 1]!;

  const [planRows, timer, openTaskRows] = await Promise.all([
    listForDate(user.id, today),
    runningTimer({ userId: user.id, profileTz: user.timezone, deviceTz: tz }),
    prisma.task.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: { in: ["todo", "doing"] },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 200,
    }),
  ]);

  const dueToday = openTaskRows.filter(
    (t) => t.dueDate?.toISOString().slice(0, 10) === today,
  );
  const overdue = openTaskRows.filter(
    (t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today,
  );

  const shares5 = facts.slice(-5).map((f) =>
    unknownTimeShare(f).status === "ok"
      ? (unknownTimeShare(f).value as number)
      : -1,
  );

  // Goal pace for active measurable goals (worst first, max 3 shown).
  const goals = await prisma.goal.findMany({
    where: { userId: user.id, deletedAt: null, status: "active", targetValue: { not: null } },
  });
  const paceResults = [];
  for (const g of goals.slice(0, 12)) {
    const startDate = g.startDate?.toISOString().slice(0, 10) ?? null;
    const observations = await goalProgressObservations(g.id, today, startDate);
    let currentUnits: number | undefined;
    if (g.measureType === "duration") {
      currentUnits = latestObservationValue(observations);
    }
    const prog01 = latestObservationValue(observations);
    void currentUnits;
    const remainingUnits =
      Number(g.targetValue!) * (1 - Math.min(1, prog01));
    const remainingDays =
      g.targetDate !== null
        ? Math.max(0, diffDays(g.targetDate.toISOString().slice(0, 10), today))
        : null;
    if (remainingDays === null) continue;
    const ageDays = startDate
      ? Math.max(0, diffDays(today, startDate))
      : Math.max(0, diffDays(today, g.createdAt.toISOString().slice(0, 10)));
    const pace = goalPace({
      remainingUnits,
      remainingDays,
      goalAgeDays: ageDays,
      observations: observations.map((o) => ({ ...o, value: o.value * Number(g.targetValue!) })),
    });
    if (pace.status === "ok") {
      paceResults.push({
        goalId: g.id,
        title: g.title,
        unit: g.unit ?? "units",
        ...pace.value!,
      });
    }
  }
  paceResults.sort((a, b) => a.pace - b.pace);

  return {
    today,
    timezone: tz,
    focus: {
      behaviors: planRows
        .filter((r) => r.refType === "behavior" && r.origin === "schedule")
        .map((r) => ({
          instanceId: r.id,
          behaviorId: r.refId,
          label: r.label,
          met: r.met,
          doneAt: r.doneAt?.toISOString() ?? null,
          plannedQty: r.plannedQty !== null ? Number(r.plannedQty) : null,
          actualQty: r.actualQty !== null ? Number(r.actualQty) : null,
          actualMinutes: r.actualMinutes,
          adHocExtra: r.origin === "ad_hoc",
        })),
      tasksDueToday: dueToday.slice(0, 20).map(taskDto),
      overdue: overdue.slice(0, 20).map(taskDto),
    },
    capture: {
      timerRunning: timer
        ? {
            entryId: timer.id,
            startedAt: timer.startedAt.toISOString(),
            elapsedSec: timer.elapsedSec,
            label:
              timer.task?.title ??
              timer.behavior?.title ??
              timer.category?.name ??
              "Untitled session",
            note: timer.note,
          }
        : null,
    },
    timeBudget: {
      wakingMinutes: factToday.wakingMinutes,
      plannedMinutes: factToday.plannedMinutes,
      executedPlannedMinutes: factToday.executedPlannedMinutes,
      categorizedByClass: factToday.categorizedByClass,
      totalCategorizedMinutes: Math.round(totalCategorized(factToday)),
    },
    metrics: {
      executionRateToday: executionRate(factToday),
      consistency30d: consistencyScore(facts),
      variance14d: planActualVariance(facts),
      overplanningRatio: overplanningRatio(facts),
      underExecution14d: underExecutionRatio(facts),
      postponement: postponeSummary(
        openTaskRows.map((t) => ({ id: t.id, deferredCount: t.deferredCount })),
      ),
      unknownTimeShareToday: unknownTimeShare(factToday),
      degradedConfidence: degradedConfidence(shares5.map((s) => s)),
    },
    goalPace: paceResults.slice(0, 3),
    flags: buildFlags({
      unknownShare: unknownTimeShare(factToday),
      variance: planActualVariance(facts),
      postpone: postponeSummary(
        openTaskRows.map((t) => ({ id: t.id, deferredCount: t.deferredCount })),
      ),
      overdueCount: overdue.length,
      paceWorst: paceResults[0],
    }),
  };
}

function taskDto(t: {
  id: string;
  title: string;
  status: string;
  priority: number | null;
  estimateMin: number | null;
  dueDate: Date | null;
  deferredCount: number;
}) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority ?? 0,
    estimateMin: t.estimateMin,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    deferredCount: t.deferredCount,
  };
}

interface FlagInput {
  unknownShare: ReturnType<typeof unknownTimeShare>;
  variance: ReturnType<typeof planActualVariance>;
  postpone: ReturnType<typeof postponeSummary>;
  overdueCount: number;
  paceWorst?: { title: string; pace: number; requiredVelocityPerDay: number; observedVelocityPerDay: number };
}

/** Evidence-first flag row; neutral phrasing only (P-8, §9.2). */
function buildFlags(i: FlagInput): Array<{
  key: string;
  severity: "info" | "warning";
  message: string;
  evidence: Record<string, number | string | null>;
}> {
  const flags: FlagInput extends never ? never : Array<ReturnType<typeof mkFlag>> = [];
  function mkFlag(x: {
    key: string;
    severity: "info" | "warning";
    message: string;
    evidence: Record<string, number | string | null>;
  }) {
    return x;
  }

  if (i.postpone.status === "ok" && i.postpone.value!.chronicCount > 0) {
    flags.push(
      mkFlag({
        key: "chronic_deferral",
        severity: "warning",
        message: `${i.postpone.value!.chronicCount} task(s) deferred ≥3 times`,
        evidence: { chronic_count: i.postpone.value!.chronicCount, max_depth: i.postpone.value!.maxDepth },
      }),
    );
  }
  if (i.overdueCount > 0) {
    flags.push(
      mkFlag({
        key: "overdue_backlog",
        severity: i.overdueCount >= 5 ? "warning" : "info",
        message: `${i.overdueCount} overdue task(s)`,
        evidence: { overdue_count: i.overdueCount },
      }),
    );
  }
  if (
    i.variance.status === "ok" &&
    i.variance.value!.minutes <= -120 &&
    i.variance.value!.pct !== null &&
    i.variance.value!.pct <= -0.25
  ) {
    flags.push(
      mkFlag({
        key: "plan_shortfall",
        severity: "warning",
        message: `Executed ${Math.round(Math.abs(i.variance.value!.minutes) / 60 * 10) / 10}h less than planned over the trailing window`,
        evidence: {
          variance_minutes: i.variance.value!.minutes,
          pct: Math.round((i.variance.value!.pct ?? 0) * 100),
          n_days: i.variance.gates[0]?.observed ?? null,
        },
      }),
    );
  }
  if (i.unknownShare.status === "ok" && i.unknownShare.value! > 0.6) {
    flags.push(
      mkFlag({
        key: "observability_gap",
        severity: "info",
        message: `${Math.round(i.unknownShare.value! * 100)}% of today's waking time is unlogged`,
        evidence: { unknown_share: Math.round(i.unknownShare.value! * 100) },
      }),
    );
  }
  if (i.paceWorst && i.paceWorst.pace < 0.8) {
    flags.push(
      mkFlag({
        key: "goal_behind_pace",
        severity: "warning",
        message: `"${i.paceWorst.title}" behind pace`,
        evidence: {
          pace: Math.round(i.paceWorst.pace * 100) / 100,
          required_per_day: Math.round(i.paceWorst.requiredVelocityPerDay * 100) / 100,
          observed_per_day: Math.round(i.paceWorst.observedVelocityPerDay * 100) / 100,
        },
      }),
    );
  }
  return flags;
}

function latestObservationValue(
  obs: Array<{ date: string; value: number }>,
): number {
  return obs.length ? obs[obs.length - 1]!.value : 0;
}
