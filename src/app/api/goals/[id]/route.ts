import { prisma } from "@/server/db";
import { ApiError, handle, idempotent, json, requireSession } from "@/server/api";
import { goalUpdate } from "@/server/validation";
import { updateGoal } from "@/server/services/goals";
import { computeGoalProgress } from "@/lib/goals/progress";
import { todayInTz } from "@/lib/metrics/dates";

export const dynamic = "force-dynamic";

/** GET goal detail: measure, computed progress, linked work counts. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const g = await prisma.goal.findFirst({
      where: { id: params.id, userId: s.id, deletedAt: null },
    });
    if (!g) throw new ApiError(404, "not_found", "Goal not found");

    const [children, tasks, behaviors] = await Promise.all([
      prisma.goal.findMany({
        where: { parentId: g.id, deletedAt: null },
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      }),
      prisma.task.findMany({
        where: { userId: s.id, goalId: g.id, deletedAt: null },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      }),
      prisma.behavior.findMany({ where: { userId: s.id, goalId: g.id, deletedAt: null } }),
    ]);

    // Duration goals derive current units from linked logged seconds.
    let durationSeconds = 0;
    if (g.measureType === "duration") {
      const agg = await prisma.timeEntry.aggregate({
        where: {
          userId: s.id,
          voidedAt: null,
          OR: [
            { task: { goalId: g.id } },
            { behavior: { goalId: g.id } },
          ],
        },
        _sum: { durationSec: true },
      });
      durationSeconds = agg._sum.durationSec ?? 0;
    }

    const today = todayInTz(s.timezone);
    const progress = computeGoalProgress(
      {
        measureType: g.measureType,
        targetValue: g.targetValue !== null ? Number(g.targetValue) : null,
        direction: g.direction,
        status: g.status,
        closingValue: g.closingValue !== null ? Number(g.closingValue) : null,
        startDate: g.startDate?.toISOString().slice(0, 10) ?? null,
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      },
      {
        currentUnits: g.currentValue !== null ? Number(g.currentValue) : undefined,
        durationSeconds,
        today,
      },
    );

    const childProgress = children.map((c: any) =>
      computeGoalProgress(
        {
          measureType: c.measureType,
          targetValue: c.targetValue !== null ? Number(c.targetValue) : null,
          direction: c.direction,
          status: c.status,
          closingValue: c.closingValue !== null ? Number(c.closingValue) : null,
          startDate: c.startDate?.toISOString().slice(0, 10) ?? null,
          targetDate: c.targetDate?.toISOString().slice(0, 10) ?? null,
        },
        { currentUnits: c.currentValue !== null ? Number(c.currentValue) : undefined, today },
      ).value01,
    );
    const childVals = childProgress.filter((v: number | null): v is number => v !== null);
    const rolled =
      childVals.length > 0
        ? childVals.reduce((a: number, b: number) => a + b, 0) / childVals.length
        : null;

    return json({
      data: {
        ...g,
        targetValue: g.targetValue !== null ? Number(g.targetValue) : null,
        currentValue: g.currentValue !== null ? Number(g.currentValue) : null,
        startDate: g.startDate?.toISOString().slice(0, 10) ?? null,
        targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
        closedAt: g.closedAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        progress,
        rollupFromChildren: rolled,
        children: children.map((c: any) => ({
          id: c.id,
          title: c.title,
          kind: c.kind,
          horizon: c.horizon,
          status: c.status,
          measureType: c.measureType,
          targetDate: c.targetDate?.toISOString().slice(0, 10) ?? null,
        })),
        tasks: tasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
        })),
        behaviorIds: behaviors.map((b: any) => ({ id: b.id, title: b.title })),
      },
    });
  })();
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = goalUpdate.parse(raw);
    const { result, replayed } = await idempotent(
      s.id,
      raw?.clientOpId as string | undefined,
      `goal.update:${params.id}`,
      () => updateGoal(s.id, params.id, input),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}
