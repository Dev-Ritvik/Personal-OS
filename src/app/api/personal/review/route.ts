import { handle, json, requireSession } from "@/server/api";
import { prisma } from "@/server/db";
import { todayInTz, addDays, dateRange } from "@/lib/metrics/dates";
import { buildDayFacts } from "@/lib/metrics/facts";
import { loadRawInputs } from "@/server/services/factsSource";
import { buildEveningReview } from "@/lib/personal/eveningReview";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const today = url.searchParams.get("today") ?? todayInTz(s.timezone);
  const dates = dateRange(addDays(today, -29), today);
  const raw = await loadRawInputs(s.id, dates, {
    timezone: s.timezone,
    wakingStartMin: s.wakingStartMin,
    wakingEndMin: s.wakingEndMin,
  });
  const facts = buildDayFacts(dates, raw);
  const factToday = facts.find((f) => f.date === today);
  if (!factToday) return json({ data: null });

  const openTasks = await prisma.task.findMany({
    where: { userId: s.id, deletedAt: null, status: { in: ["todo", "doing"] } },
    select: { id: true, title: true, status: true, dueDate: true, deferredCount: true, goalId: true },
  });
  const doneToday = await prisma.task.findMany({
    where: { userId: s.id, deletedAt: null, status: "done", completedLocalDate: new Date(today) },
    select: { id: true, title: true, status: true, dueDate: true, deferredCount: true, completedLocalDate: true, goalId: true },
  });

  const tasksDueToday = openTasks.filter((t) => t.dueDate?.toISOString().slice(0, 10) === today).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    deferredCount: t.deferredCount,
    completedOn: null,
    goalTitle: null,
  }));

  const tasksOverdue = openTasks.filter((t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    deferredCount: t.deferredCount,
    completedOn: null,
    goalTitle: null,
  }));

  const tasksCompletedToday = doneToday.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    deferredCount: t.deferredCount,
    completedOn: t.completedLocalDate?.toISOString().slice(0, 10) ?? null,
    goalTitle: null,
  }));

  // Enrich goal titles
  const goalIds = [...new Set([...openTasks, ...doneToday].map((t) => t.goalId).filter(Boolean) as string[])];
  const goals = goalIds.length ? await prisma.goal.findMany({ where: { id: { in: goalIds } }, select: { id: true, title: true } }) : [];
  const goalMap = new Map(goals.map((g) => [g.id, g.title]));
  for (const t of [...tasksDueToday, ...tasksOverdue, ...tasksCompletedToday]) {
    const src = [...openTasks, ...doneToday].find((x) => x.id === t.id);
    if (src?.goalId) (t as any).goalTitle = goalMap.get(src.goalId) ?? null;
  }

  const timeByClass = factToday.categorizedByClass as Record<string, number>;

  const review = buildEveningReview({
    today,
    facts,
    tasksDueToday,
    tasksOverdue,
    tasksCompletedToday,
    timeMinutesByClass: timeByClass,
    plannedMinutes: factToday.plannedMinutes,
    executedPlannedMinutes: factToday.executedPlannedMinutes,
    behaviorScheduled: factToday.behaviorScheduled,
    behaviorMet: factToday.behaviorMet,
  });

  return json({ data: review });
});
