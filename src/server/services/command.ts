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
import { goalPace } from "@/lib/metrics/goalPace";
import { diffDays } from "@/lib/metrics/dates";
import { goalProgressObservations } from "./snapshot";
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
  const goalPaceById = new Map<string, { status: "ok" | "insufficient_data"; value?: { pace: number } }>();
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

    // M11 pace for trajectory epistemic correction (Phase 1) — only for dated goals
    if (g.targetDate && g.targetValue !== null) {
      try {
        const startDate = g.startDate?.toISOString().slice(0, 10) ?? null;
        const observations = await goalProgressObservations(g.id, today, startDate);
        const remainingUnits = Number(g.targetValue) * (1 - Math.min(1, p ?? 0));
        const remainingDays = Math.max(0, diffDays(g.targetDate.toISOString().slice(0, 10), today));
        const ageDays = startDate ? Math.max(0, diffDays(today, startDate)) : Math.max(0, diffDays(today, (g as any).createdAt?.toISOString().slice(0, 10) ?? today));
        const paceRes = goalPace({
          remainingUnits,
          remainingDays,
          goalAgeDays: ageDays,
          observations: observations.map((o) => ({ ...o, value: o.value * Number(g.targetValue!) })),
        });
        if (paceRes.status === "ok") {
          goalPaceById.set(g.id, { status: "ok", value: { pace: paceRes.value!.pace } });
        } else {
          goalPaceById.set(g.id, { status: "insufficient_data" });
        }
      } catch {
        goalPaceById.set(g.id, { status: "insufficient_data" });
      }
    } else {
      goalPaceById.set(g.id, { status: "insufficient_data" });
    }
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

  // Target-state relevance: tasks whose skills are needed for not-READY readiness dimensions
  const readinessForPriority = await computeReadiness(user.id);
  const neededSkillIds = new Set(
    readinessForPriority
      .filter((r: any) => r.status !== "READY" && r.status !== "UNKNOWN")
      .flatMap((r: any) => r.requirements?.filter((req: any) => req.skillId).map((req: any) => req.skillId) ?? []),
  );
  // Fetch all task/goal skill links for the 100 tasks to evaluate target-state relevance
  const allTaskSkillLinks = await prisma.taskSkillLink.findMany({
    where: { userId: user.id, taskId: { in: tasks.map((t) => t.id) } },
    select: { taskId: true, skillId: true },
  });
  const allGoalIds = [...new Set(tasks.map((t) => t.goalId).filter(Boolean) as string[])];
  const allGoalSkillLinks = allGoalIds.length
    ? await prisma.goalSkillLink.findMany({ where: { userId: user.id, goalId: { in: allGoalIds } }, select: { goalId: true, skillId: true } })
    : [];
  const targetStateTaskIds = new Set(
    prioritizable
      .filter((t) => {
        const taskSkills = allTaskSkillLinks.filter((l) => l.taskId === t.id).map((l) => l.skillId);
        const goalSkills = t.goalId ? allGoalSkillLinks.filter((l) => l.goalId === t.goalId).map((l) => l.skillId) : [];
        const allSkills = [...taskSkills, ...goalSkills];
        return allSkills.some((sid) => neededSkillIds.has(sid));
      })
      .map((t) => t.id),
  );

  const ranked = prioritizeTasks(prioritizable, goalsById, today, { targetStateTaskIds });
  const top3 = ranked.slice(0, 3);

  // Goal mapping for each prioritized task: also fetch required skills (reuse already fetched)
  const taskSkillLinks = allTaskSkillLinks.filter((l) => top3.some((t) => t.id === l.taskId));
  const goalSkillLinks = allGoalSkillLinks.filter((l) => top3.some((t) => t.goalId === l.goalId));
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

  // Readiness for trajectory (reuse already computed)
  const readiness = readinessForPriority;
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
      pace: goalPaceById.get(g.id) ?? null,
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

  // Phase 7: Cold-start mode — explicit assumption when no capacity
  const coldStart = capacity.status !== "ok";
  const assumedCapacity = 90; // conservative 90 min deep work, labeled ASSUMPTION
  const effectiveCapacity = capacity.status === "ok" ? capacity.value!.medianProductiveMin : assumedCapacity;

  // Phase 8: Task-load vs capacity (using estimateMin where available)
  const estimatedLoad = prioritizable.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0);
  const hasEstimates = prioritizable.some((t) => t.estimateMin !== null && t.estimateMin > 0);
  const unknownDurationCount = prioritizable.filter((t) => t.estimateMin == null).length;
  let loadVsCapacity: { ratio: number | null; severity: string; message: string } | null = null;
  if (hasEstimates && estimatedLoad > 0) {
    const ratio = estimatedLoad / effectiveCapacity;
    let severity = "ok";
    let message = "";
    if (ratio > 2) { severity = "critical"; message = `Task load ${estimatedLoad} min is ~${ratio.toFixed(1)}× ${coldStart ? "assumed" : "observed"} capacity ${effectiveCapacity} min — drop lowest-value task.`; }
    else if (ratio > 1.2) { severity = "warning"; message = `Task load ${estimatedLoad} min exceeds ${coldStart ? "assumed" : "observed"} capacity ${effectiveCapacity} min by ${Math.round((ratio - 1) * 100)}%.`; }
    else { severity = "ok"; message = `Task load ${estimatedLoad} min within ${coldStart ? "assumed" : "observed"} capacity ${effectiveCapacity} min.`; }
    if (unknownDurationCount > 0) message += ` (${unknownDurationCount} tasks have UNKNOWN_DURATION)`;
    loadVsCapacity = { ratio, severity, message };
    if (severity !== "ok") risks.push(message);
  } else if (prioritizable.length > 0) {
    loadVsCapacity = { ratio: null, severity: "insufficient", message: "Task load unknown — add estimates to compare against capacity." };
  }

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
      coldStart,
      assumedCapacity: coldStart ? assumedCapacity : null,
      effectiveCapacity,
      epistemic: coldStart ? "ASSUMPTION" : "STATISTICAL_INFERENCE",
    },
    prioritizedTasks: tasksWithContext,
    allRankedCount: ranked.length,
    loadVsCapacity,
    coldStart,
    trajectory: {
      next90Days: trajectory.next90Days.slice(0, 3),
      bottlenecks: trajectory.bottlenecks.slice(0, 2),
      milestonesCount: trajectory.milestones.length,
    },
    readiness: readiness.slice(0, 3).map((r: any) => ({ key: r.key, label: r.label, status: r.status, nextAction: r.nextAction })),
    risks: risks.slice(0, 3),
  };
}
