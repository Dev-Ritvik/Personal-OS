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

/**
 * C1 remediation: `todayLocal` is REQUIRED. An overdue/today classification
 * can never execute without a resolved user-local calendar date — the
 * structural guard against the "overdue = everything" defect.
 *
 * Completion policy (C9): transitioning to done freezes `completed_local_date`
 * using the caller-resolved diary date. Reopening (done → open) annuls the
 * completion record (clears both stamps); re-completing stamps afresh.
 */
export async function updateTask(
  userId: string,
  id: string,
  body: unknown,
  opts: { todayLocal: string },
) {
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
    if (input.status === "done") {
      data.completedAt = existing.completedAt ?? new Date();
      // Freeze the completion day exactly once (first completion wins).
      data.completedLocalDate =
        existing.completedLocalDate ?? new Date(`${opts.todayLocal}T00:00:00Z`);
    } else {
      // Reopen/cancel annuls the completion record.
      if (existing.status === "done") {
        data.completedAt = null;
        data.completedLocalDate = null;
      }
    }
  }

  const updated = await prisma.task.update({ where: { id }, data });
  await audit(userId, "update", "task", id, input);

  // Phase 5: task completion → SkillEvidence (FACT, not auto-promotion)
  if (existing.status !== "done" && input.status === "done") {
    const links = await prisma.taskSkillLink.findMany({ where: { taskId: id, userId } });
    for (const link of links) {
      // Duplicate protection: one evidence per task per skill
      const existingEv = await prisma.skillEvidence.findFirst({
        where: { skillId: link.skillId, sourceType: "task", sourceId: id },
      });
      if (!existingEv) {
        await prisma.skillEvidence.create({
          data: {
            id: uuidv7(),
            userId,
            skillId: link.skillId,
            title: `Completed task: ${existing.title}`,
            description: `Task "${existing.title}" completed — evidence for skill via TaskSkillLink`,
            epistemicClass: "FACT",
            sourceType: "task",
            sourceId: id,
            assessedLevel: null,
          },
        });
      }
    }
    // Also via GoalSkillLink if task has goal
    if (existing.goalId) {
      const goalLinks = await prisma.goalSkillLink.findMany({ where: { goalId: existing.goalId, userId } });
      for (const gl of goalLinks) {
        const exists = await prisma.skillEvidence.findFirst({
          where: { skillId: gl.skillId, sourceType: "task", sourceId: id },
        });
        if (!exists) {
          await prisma.skillEvidence.create({
            data: {
              id: uuidv7(),
              userId,
              skillId: gl.skillId,
              title: `Completed task for goal: ${existing.title}`,
              description: `Task completed advancing goal "${gl.goalId}"`,
              epistemicClass: "FACT",
              sourceType: "task",
              sourceId: id,
            },
          });
        }
      }
    }
  }

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

/**
 * Bucket semantics (C1):
 *   overdue = status ∈ {todo,doing} AND dueDate < todayLocal
 *   today   = status ∈ {todo,doing} AND dueDate = todayLocal
 * Tasks without due dates are never overdue. Future tasks are never overdue.
 * The date predicate is UNCONDITIONAL — this function cannot be misused by
 * omitting a date.
 */
export async function listTasks(userId: string, todayLocal: string): Promise<TaskLists> {
  const base = { userId, deletedAt: null };
  const todayStart = new Date(`${todayLocal}T00:00:00Z`);

  const [overdue, done, all] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...base,
        status: { in: [...OPEN] },
        dueDate: { lt: todayStart, not: null },
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
  const today = all.filter(
    (t) => !overdueIds.has(t.id) && t.dueDate?.getTime() === todayStart.getTime(),
  );
  const excluded = new Set([...overdueIds, ...today.map((t) => t.id)]);
  const inbox = all.filter((t) => !excluded.has(t.id));

  return { overdue, today, inbox, done };
}
