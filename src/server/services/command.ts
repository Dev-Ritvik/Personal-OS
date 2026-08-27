/**
 * Command Brief assembler — deterministic, evidence-first.
 *
 * Aggregates: trajectory, fixed commitments, prioritized tasks with goal/skill mapping,
 * capacity vs planned, risks, and 1-3 strict recommendations.
 * No LLM, no fabricated scores.
 */

import { prisma } from "../db";
import { todayInTz, addDays, dateRange } from "@/lib/metrics/dates";
import { buildDayFacts } from "@/lib/metrics/facts";
import { loadRawInputs } from "./factsSource";
import { estimateCapacity, todayPlannedMinutes, overplanningSeverity } from "@/lib/personal/capacity";
import { prioritizeTasks } from "@/lib/personal/priority";
import { buildTrajectory } from "@/lib/personal/trajectory";
import { computeGoalProgress } from "@/lib/goals/progress";
import { computeReadiness } from "./readiness";
import { getSummary as getFinancialSummary } from "./financials";

export async function assembleCommandBrief(
  user: { id: string; timezone: string; wakingStartMin: number; wakingEndMin: number },
  todayOverride?: string,
) {
  const today = todayOverride ?? todayInTz(user.timezone);
  const dates = dateRange(addDays(today, -29), today);
  const raw = await loadRawInputs(user.id, dates, {
    timezone: user.timezone,
    wakingStartMin: user.wakingStartMin,
    wakingEndMin: user.wakingEndMin,
  });
  const facts = buildDayFacts(dates, raw);
  const capacity = estimateCapacity(facts);
  const plannedToday = todayPlannedMinutes(facts, today);
  const overplan = overplanningSeverity(plannedToday, capacity);

  // Fixed commitments from PersonalProfile.classSchedule
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } });
  const dayOfWeek = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: user.timezone });
  const classSchedule = (profile?.classSchedule as Record<string, string> | null) ?? null;
  const todayCommitment = classSchedule ? (classSchedule[dayOfWeek] ?? classSchedule[dayOfWeek.slice(0, 3)] ?? null) : null;

  // Tasks with goal linkage
  const tasks = (await prisma.task.findMany({
    where: { userId: user.id, deletedAt: null, status: { in: ["todo", "doing"] } },
    select: { id: true, title: true, dueDate: true, deferredCount: true, status: true, goalId: true, estimateMin: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  })) as any[];

  const goals = (await prisma.goal.findMany({
    where: { userId: user.id, deletedAt: null, status: "active" },
    select: { id: true, title: true, status: true, horizon: true, targetDate: true, targetValue: true, currentValue: true, startDate: true, measureType: true } as any,
  })) as any[];

  const goalProgressById = new Map<string, number | null>();
  for (const g of goals) {
    const p = computeGoalProgress(
      {
        measureType: g.measureType as any,
        targetValue: g.targetValue !== null ? Number(g.targetValue) : null,
        direction: (g as any).direction ?? "at_least",
        status: g.status as any,
        closingValue: (g as any).closingValue !== null ? Number((g as any).closingValue) : null,
        startDate: g.startDate?.toISOString().slice(0, 10) ?? null,
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      },
      { currentUnits: g.currentValue !== null ? Number(g.currentValue) : undefined, today },
    ).value01;
    goalProgressById.set(g.id, p);
  }

  const goalsById = new Map(
    goals.map((g) => [
      g.id,
      {
        id: g.id,
        title: g.title,
        status: g.status,
        horizon: g.horizon,
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
        progress01: goalProgressById.get(g.id) ?? null,
      },
    ]),
  );

  const prioritizable = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    deferredCount: t.deferredCount,
    status: t.status,
    goalId: t.goalId,
    estimateMin: t.estimateMin,
  }));

  const ranked = prioritizeTasks(prioritizable, goalsById, today);
  const top3 = ranked.slice(0, 3);

  // Goal mapping for each prioritized task: also fetch required skills
  const taskSkillLinks = await prisma.taskSkillLink.findMany({
    where: { userId: user.id, taskId: { in: top3.map((t) => t.id) } },
    select: { taskId: true, skillId: true },
  });
  const goalSkillLinks = await prisma.goalSkillLink.findMany({
    where: { userId: user.id, goalId: { in: top3.map((t) => t.goalId).filter(Boolean) as string[] } },
    select: { goalId: true, skillId: true },
  });
  const skillIds = [...new Set([...taskSkillLinks.map((l) => l.skillId), ...goalSkillLinks.map((l) => l.skillId)])];
  const skills = skillIds.length
    ? await prisma.skill.findMany({ where: { id: { in: skillIds }, userId: user.id }, select: { id: true, name: true, currentLevel: true } })
    : [];

  const skillsById = new Map(skills.map((s) => [s.id, s]));

  const tasksWithContext = top3.map((t) => {
    const goal = t.goalId ? goalsById.get(t.goalId) ?? null : null;
    const skillIdsForTask = [
      ...taskSkillLinks.filter((l) => l.taskId === t.id).map((l) => l.skillId),
      ...(goal ? goalSkillLinks.filter((l) => l.goalId === goal.id).map((l) => l.skillId) : []),
    ];
    const uniq = [...new Set(skillIdsForTask)];
    const taskSkills = uniq.map((id) => skillsById.get(id)).filter(Boolean) as typeof skills;
    return { ...t, goal, skills: taskSkills };
  });

  // Readiness for trajectory
  const readiness = await computeReadiness(user.id);
  const financial = await getFinancialSummary(user.id);

  const trajectory = buildTrajectory({
    today,
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      horizon: g.horizon,
      status: g.status,
      targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      progress01: goalProgressById.get(g.id) ?? null,
    })),
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
    currentState: (await prisma.stateItem.findMany({ where: { userId: user.id, kind: "CURRENT" }, select: { label: true, value: true } })) as any,
    targetState: (await prisma.stateItem.findMany({ where: { userId: user.id, kind: "TARGET" }, select: { label: true, value: true } })) as any,
  });

  // Risks: from facts and trajectory bottlenecks
  const risks: string[] = [];
  if (overplan.severity === "critical") risks.push(`Planned ${plannedToday} min exceeds median capacity ${capacity.status === "ok" ? capacity.value!.medianProductiveMin : "?"} min by ${Math.round((overplan.ratio! - 1) * 100)}% — overplanning.`);
  else if (overplan.severity === "warning") risks.push(`Planned ${plannedToday} min is ${Math.round((overplan.ratio! - 1) * 100)}% above recent median capacity.`);
  if (ranked.filter((t) => t.isChronic).length > 0) risks.push(`${ranked.filter((t) => t.isChronic).length} chronically deferred task(s) need decomposition or explicit drop.`);
  if (trajectory.bottlenecks.length > 0) risks.push(`Bottleneck: ${trajectory.bottlenecks[0]}`);
  if (capacity.status !== "ok") risks.push(`Insufficient data for capacity — log consistently for 14 days.`);

  return {
    today,
    timezone: user.timezone,
    fixedCommitment: todayCommitment ? { label: "College", window: todayCommitment } : null,
    capacity: {
      status: capacity.status,
      median: capacity.status === "ok" ? capacity.value!.medianProductiveMin : null,
      p25: capacity.status === "ok" ? capacity.value!.p50Range.p25 : null,
      p75: capacity.status === "ok" ? capacity.value!.p50Range.p75 : null,
      plannedToday,
      overplan,
      gates: capacity.gates,
      meta: capacity.meta,
    },
    prioritizedTasks: tasksWithContext,
    allRankedCount: ranked.length,
    trajectory: {
      next90Days: trajectory.next90Days.slice(0, 3),
      bottlenecks: trajectory.bottlenecks.slice(0, 2),
      milestonesCount: trajectory.milestones.length,
    },
    readiness: readiness.slice(0, 3).map((r: any) => ({ key: r.key, label: r.label, status: r.status, nextAction: r.nextAction })),
    risks: risks.slice(0, 3),
  };
}
