import { handle, json, requireSession } from "@/server/api";
import { recommend } from "@/lib/personal/recommendations";
import { prisma } from "@/server/db";
import { addDays, todayInTz } from "@/lib/metrics/dates";
import { buildDayFacts } from "@/lib/metrics/facts";
import { loadRawInputs } from "@/server/services/factsSource";
import { overplanningRatio } from "@/lib/metrics/variance";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const tz = new URL(req.url).searchParams.get("tz") ?? s.timezone;
  const today = todayInTz(tz);

  const [goals, tasks, behaviors, skills] = await Promise.all([
    prisma.goal.findMany({ where: { userId: s.id, deletedAt: null, status: "active" } }),
    prisma.task.findMany({ where: { userId: s.id, deletedAt: null, status: { in: ["todo", "doing"] } } }),
    prisma.behavior.findMany({ where: { userId: s.id, deletedAt: null, status: "active" } }),
    prisma.skill.findMany({ where: { userId: s.id, status: "ACTIVE" } }),
  ]);

  // Task buckets
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today).length;
  const todayTasks = tasks.filter((t) => t.dueDate?.toISOString().slice(0, 10) === today).length;
  const inbox = tasks.length - overdue - todayTasks;
  const deferredCount = tasks.filter((t) => t.deferredCount >= 3).length;

  // Metrics: overplanning + variance
  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  let overplanningStatus: { status: string; value?: number } = { status: "insufficient_data" };
  try {
    const raw = await loadRawInputs(s.id, dates, { timezone: s.timezone, wakingStartMin: s.wakingStartMin, wakingEndMin: s.wakingEndMin });
    const facts = buildDayFacts(dates, raw);
    const m8 = overplanningRatio(facts);
    overplanningStatus = m8 as never;
  } catch {}

  const skillsNeedingEvidence = skills.filter((sk) => sk.currentLevel === "UNKNOWN").length;

  // Financial summary (lightweight)
  const savingsGoals = await prisma.savingsGoal.findMany({ where: { userId: s.id, status: "active" } });
  const financialEntries = await prisma.financialEntry.findMany({ where: { userId: s.id } });
  const savingsProgress = {
    insufficient: financialEntries.length < 3,
    progress: (() => {
      if (financialEntries.length < 3 || savingsGoals.length === 0) return null;
      const income = financialEntries.filter((e) => e.kind === "INCOME").reduce((sum, e) => sum + Number(e.amount), 0);
      const expense = financialEntries.filter((e) => e.kind === "EXPENSE").reduce((sum, e) => sum + Number(e.amount), 0);
      const savings = income - expense;
      const target = Number(savingsGoals[0]!.targetAmount);
      return Math.min(1, savings / target);
    })(),
  };

  // Readiness blocked dimensions
  const readinessDims = await prisma.readinessDimension.findMany({ where: { userId: s.id }, include: { requirements: true } });
  const readinessBlocked: string[] = [];
  for (const dim of readinessDims) {
    const reqs = dim.requirements;
    if (reqs.length === 0) continue;
    // Simple: if any requirement lacks linked skill/goal evidence, consider blocked
    const blocked = reqs.some((r) => !r.skillId && !r.goalId);
    if (blocked) readinessBlocked.push(dim.label);
  }

  const recommendations = recommend({
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      progress01: g.currentValue && g.targetValue ? Math.min(1, Number(g.currentValue) / Number(g.targetValue)) : null,
    })),
    tasks: { overdue, today: todayTasks, inbox },
    deferredCount,
    metrics: {
      overplanningRatio: overplanningStatus as never,
      variance: { status: "insufficient_data" } as never,
      executionRateToday: { status: "insufficient_data" } as never,
    },
    skillsNeedingEvidence,
    savingsProgress,
    readinessBlocked,
    today,
  });

  return json({ data: recommendations });
});
