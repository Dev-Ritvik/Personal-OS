import { handle, json, requireSession } from "@/server/api";
import { prisma } from "@/server/db";
import { todayInTz, diffDays } from "@/lib/metrics/dates";
import { buildTrajectory } from "@/lib/personal/trajectory";
import { computeReadiness } from "@/server/services/readiness";
import { getSummary as getFinancialSummary } from "@/server/services/financials";
import { computeGoalProgress } from "@/lib/goals/progress";
import { goalPace } from "@/lib/metrics/goalPace";
import { goalProgressObservations } from "@/server/services/snapshot";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const today = url.searchParams.get("today") ?? todayInTz(s.timezone);

  const goals = await prisma.goal.findMany({
    where: { userId: s.id, deletedAt: null, status: { in: ["active", "achieved", "paused", "draft"] } },
    select: { id: true, title: true, horizon: true, status: true, targetDate: true, targetValue: true, currentValue: true, startDate: true },
  });

  const progressById = new Map<string, number | null>();
  const paceById = new Map<string, { status: "ok" | "insufficient_data"; value?: { pace: number } }>();
  for (const g of goals) {
    const v = computeGoalProgress(
      {
        measureType: (g as any).measureType ?? "binary",
        targetValue: g.targetValue !== null ? Number(g.targetValue) : null,
        direction: (g as any).direction ?? "at_least",
        status: g.status as any,
        closingValue: null,
        startDate: g.startDate?.toISOString().slice(0, 10) ?? null,
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      },
      { currentUnits: g.currentValue !== null ? Number(g.currentValue) : undefined, today },
    ).value01;
    progressById.set(g.id, v);
    if ((g as any).targetDate && (g as any).targetValue !== null) {
      try {
        const startDate = (g as any).startDate?.toISOString().slice(0, 10) ?? null;
        const observations = await goalProgressObservations(g.id, today, startDate);
        const remainingUnits = Number((g as any).targetValue) * (1 - Math.min(1, v ?? 0));
        const remainingDays = Math.max(0, diffDays((g as any).targetDate.toISOString().slice(0, 10), today));
        const ageDays = startDate ? Math.max(0, diffDays(today, startDate)) : 0;
        const paceRes = goalPace({
          remainingUnits,
          remainingDays,
          goalAgeDays: ageDays,
          observations: observations.map((o) => ({ ...o, value: o.value * Number((g as any).targetValue!) })),
        });
        paceById.set(g.id, paceRes.status === "ok" ? { status: "ok", value: { pace: paceRes.value!.pace } } : { status: "insufficient_data" });
      } catch {
        paceById.set(g.id, { status: "insufficient_data" });
      }
    } else {
      paceById.set(g.id, { status: "insufficient_data" });
    }
  }

  const readiness = await computeReadiness(s.id);
  const financial = await getFinancialSummary(s.id);
  const currentState = (await prisma.stateItem.findMany({ where: { userId: s.id, kind: "CURRENT" }, select: { label: true, value: true } })) as any;
  const targetState = (await prisma.stateItem.findMany({ where: { userId: s.id, kind: "TARGET" }, select: { label: true, value: true } })) as any;

  const goalDeps = await prisma.goalDependency.findMany({ where: { userId: s.id }, select: { goalId: true, dependsOnGoalId: true } });
  const view = buildTrajectory({
    today,
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      horizon: g.horizon,
      status: g.status,
      targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      progress01: progressById.get(g.id) ?? null,
      pace: paceById.get(g.id) ?? null,
    })),
    goalDeps,
    readiness: readiness.map((r: any) => ({
      key: r.key,
      label: r.label,
      status: r.status,
      missing: r.missing ?? [],
      nextAction: r.nextAction ?? null,
    })),
    financial: financial.insufficient
      ? { targetAmount: 500000, targetDate: "2027-09-01", progress: null, insufficient: true }
      : {
          targetAmount: Number(financial.savingsGoals[0]?.targetAmount ?? 500000),
          targetDate: financial.savingsGoals[0]?.targetDate?.toISOString().slice(0, 10) ?? "2027-09-01",
          progress: financial.savingsGoals[0]?.progress ?? null,
          insufficient: false,
        },
    currentState,
    targetState,
  });

  return json({ data: view });
});
