import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError, audit } from "../api";
import { taskCreate, taskUpdate, taskDefer } from "../validation";
import type { Prisma } from "@prisma/client";

export async function createTask(userId: string, body: unknown) {
  const input = taskCreate.parse(body);
  return prisma.task.create({
    data: {
      id: uuidv7(),
      userId,
      title: input.title,
      notes: input.notes ?? null,
      goalId: input.goalId ?? null,
      behaviorId: input.behaviorId ?? null,
      estimateMin: input.estimateMin ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      priority: input.priority ?? 0,
    },
  });
}

export async function updateTask(userId: string, id: string, body: unknown) {
  const input = taskUpdate.parse(body);
  const existing = await prisma.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new ApiError(404, "not_found", "Task not found");

  const data: Prisma.TaskUpdateInput = {};
  if (typeof input.title === "string") data.title = input.title;
  if ("notes" in input) data.notes = input.notes ?? null;
  if ("estimateMin" in input) data.estimateMin = input.estimateMin ?? null;
  if ("dueDate" in input) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if ("priority" in input) data.priority = (input.priority as number) ?? null;
  if (typeof input.status === "string") {
    data.status = input.status;
    data.completedAt =
      input.status === "done" ? (existing.completedAt ?? new Date()) : null;
  }

  const updated = await prisma.task.update({ where: { id }, data });
  await audit(userId, "update", "task", id, input);
  return updated;
}

/**
 * Deferral is MEASURED, never silent (AC3): increments deferred_count and
 * stamps last_deferred_at while moving the due date.
 */
export async function deferTask(userId: string, id: string, body: unknown) {
  const input = taskDefer.parse(body);
  const existing = await prisma.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new ApiError(404, "not_found", "Task not found");
  if (existing.status === "done" || existing.status === "cancelled") {
    throw new ApiError(400, "closed_task", "Cannot defer a closed task");
  }
  if (!input.newDueDate && !existing.dueDate) {
    throw new ApiError(400, "no_due_date", "Set a due date before deferring");
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      dueDate: input.newDueDate ? new Date(input.newDueDate) : existing.dueDate,
      deferredCount: { increment: 1 },
      lastDeferredAt: new Date(),
    },
  });
  await audit(
    userId,
    "defer",
    "task",
    id,
    { reason: input.reason ?? null, deferredCount: updated.deferredCount },
  );
  return updated;
}

export interface TaskLists {
  overdue: Awaited<ReturnType<typeof prisma.task.findMany>>;
  today: Awaited<ReturnType<typeof prisma.task.findMany>>;
  inbox: Awaited<ReturnType<typeof prisma.task.findMany>>;
  done: Awaited<ReturnType<typeof prisma.task.findMany>>;
}

const OPEN = ["todo", "doing"] as const;

export async function listTasks(userId: string, todayLocal?: string): Promise<TaskLists> {
  const base = { userId, deletedAt: null };
  const [overdue, done, all] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...base,
        status: { in: [...OPEN] },
        ...(todayLocal ? { dueDate: { lt: new Date(todayLocal) } } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    prisma.task.findMany({
      where: { ...base, status: "done" },
      orderBy: { completedAt: "desc" },
      take: 100,
    }),
    prisma.task.findMany({
      where: { ...base, status: { in: [...OPEN] } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    }),
  ]);

  const overdueIds = new Set(overdue.map((t) => t.id));
  const today = todayLocal
    ? all.filter((t) => !overdueIds.has(t.id) && t.dueDate?.toISOString().slice(0, 10) === todayLocal)
    : [];
  const todayAndOver = new Set([...overdue.map((t) => t.id), ...today.map((t) => t.id)]);
  const inbox = all.filter((t) => !todayAndOver.has(t.id));

  return { overdue, today, inbox, done };
}
