import { buildDayFacts } from "@/lib/metrics/facts";
import { addDays, dateRange, todayInTz } from "@/lib/metrics/dates";
import { loadRawInputs } from "@/server/services/factsSource";
import {
  consistencyScore,
  executionRate,
  scheduleReliability,
} from "@/lib/metrics/execution";
import { overplanningRatio, planActualVariance, underExecutionRatio } from "@/lib/metrics/variance";
import { unknownTimeShare } from "@/lib/metrics/unknownTime";
import { METRIC_REGISTRY } from "@/lib/metrics/registry";
import { prisma } from "@/server/db";
import { handle, json, requireSession } from "@/server/api";
import type { DayFact } from "@/lib/metrics/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics?days=30
 * Returns per-day series + windowed metrics with gates/formulas attached.
 * This is a gated-table-first view (buffer policy §18): charts enhance it,
 * never replace it.
 */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days") ?? "30") || 30));
  // C2: the diary day resolves in the caller's timezone, never server-UTC.
  const deviceTz = url.searchParams.get("deviceTz");
  const today = todayInTz(deviceTz ?? s.timezone);
  const dates = dateRange(addDays(today, -(days - 1)), today);

  const raw = await loadRawInputs(s.id, dates, {
    timezone: s.timezone,
    wakingStartMin: s.wakingStartMin,
    wakingEndMin: s.wakingEndMin,
  });
  const facts = buildDayFacts(dates, raw);

  const series = facts.map((f) => ({
    date: f.date,
    plannedMinutes: f.plannedMinutes,
    executedPlannedMinutes: f.executedPlannedMinutes,
    productiveMinutes: f.categorizedByClass.productive,
    maintenanceMinutes: f.categorizedByClass.maintenance,
    leisureMinutes:
      f.categorizedByClass.intentional_leisure + f.categorizedByClass.unproductive,
    unknownShare:
      unknownTimeShare(f).status === "ok" ? unknownTimeShare(f).value : null,
    executionRate:
      executionRate(f).status === "ok" ? executionRate(f).value : null,
    tasksDue: f.tasksDue,
    behaviorScheduled: f.behaviorScheduled,
  }));

  // Weekly overdue counts from persisted snapshots (honest history only).
  const overdueRows = await prisma.metricSnapshot.findMany({
    where: { metricKey: "overdue_count" },
    orderBy: { localDate: "asc" },
    select: { localDate: true, value: true },
  });
  const weekly = new Map<string, number>();
  for (const r of overdueRows) {
    const d = r.localDate.toISOString().slice(0, 10);
    const weekStart = d.slice(0, 10); // daily points suffice as weekly proxy
    weekly.set(weekStart, r.value);
  }
  const weeklyOverdue = [...weekly.entries()].map(([weekStart, count]) => ({ weekStart, count }));

  return json({
    data: {
      range: { from: dates[0], to: dates[dates.length - 1] },
      metrics: {
        m1_execution_rate: lastDay(facts),
        m2_consistency: consistencyScore(facts),
        m10_schedule_reliability: scheduleReliability(facts),
        m3_plan_actual_variance: planActualVariance(facts),
        m8_overplanning_ratio: overplanningRatio(facts),
        m9_under_execution: underExecutionRatio(facts),
        registry: METRIC_REGISTRY,
      },
      weeklyOverdue: weeklyOverdue.slice(-8),
      series,
    },
  });
});

function lastDay(facts: DayFact[]) {
  const f = facts[facts.length - 1];
  return f ? executionRate(f) : undefined;
}
