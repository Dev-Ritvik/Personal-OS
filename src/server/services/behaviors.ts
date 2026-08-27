import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";
import type { Prisma } from "@prisma/client";

export async function createBehavior(
  userId: string,
  input: {
    title: string;
    goalId?: string | null;
    categoryId?: string | null;
    schedule: unknown;
    target: unknown;
    startedOn?: string;
  },
) {
  return prisma.behavior.create({
    data: {
      id: uuidv7(),
      userId,
      title: input.title,
      goalId: input.goalId ?? null,
      categoryId: input.categoryId ?? null,
      schedule: input.schedule as object,
      target: input.target as object,
      startedOn: input.startedOn ? new Date(input.startedOn) : new Date(),
    },
  });
}

export async function updateBehavior(
  userId: string,
  id: string,
  input: Record<string, unknown>,
  opts: { todayLocal: string },
) {
  const existing = await prisma.behavior.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new ApiError(404, "not_found", "Behavior not found");
  const data: Record<string, unknown> = {};
  if (typeof input.title === "string") data.title = input.title;
  if ("goalId" in input) data.goal = input.goalId ? { connect: { id: input.goalId as string } } : { disconnect: true };
  if ("categoryId" in input) data.category = input.categoryId ? { connect: { id: input.categoryId as string } } : { disconnect: true };
  if (input.schedule) data.schedule = input.schedule as object;
  if (input.target) data.target = input.target as object;
  if (typeof input.status === "string") data.status = input.status as never;

  const updated = await prisma.behavior.update({ where: { id }, data });

  // Schedule changes invalidate future generated plans; regenerate lazily.
  // "Future" is resolved in the caller's diary tz (C2) — never server-UTC.
  if (input.schedule) {
    await prisma.planInstance.updateMany({
      where: {
        refType: "behavior",
        refId: id,
        origin: "schedule",
        voidedAt: null,
        doneAt: null,
        localDate: { gt: new Date(`${opts.todayLocal}T00:00:00Z`) },
      },
      data: { voidedAt: new Date() },
    });
  }
  return updated;
}

export async function listBehaviors(userId: string) {
  return prisma.behavior.findMany({
    where: { userId, deletedAt: null },
    include: { category: { select: { name: true, valueClass: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getBehaviorOr404(userId: string, id: string) {
  const b = await prisma.behavior.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!b) throw new ApiError(404, "not_found", "Behavior not found");
  return b;
}

/**
 * Per-behavior history over a date range: scheduled vs met day flags.
 * Powers the heat-strip and consistency views without streak mythology.
 */
export async function behaviorHistory(userId: string, behaviorId: string, days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const rows = await prisma.planInstance.findMany({
    where: {
      userId,
      refType: "behavior",
      refId: behaviorId,
      origin: "schedule",
      voidedAt: null,
      localDate: { gte: from, lte: to },
    },
    orderBy: { localDate: "asc" },
    select: { localDate: true, met: true, actualQty: true, actualMinutes: true, doneAt: true },
  });
  const adHocCount = await prisma.planInstance.count({
    where: {
      userId,
      refType: "behavior",
      refId: behaviorId,
      origin: "ad_hoc",
      voidedAt: null,
      doneAt: { not: null },
      localDate: { gte: from, lte: to },
    },
  });
  return { days, rows: rows.map((r: any) => ({ ...r, localDate: r.localDate.toISOString().slice(0, 10) })), adHocCount };
}

export function nextId(): string {
  return uuidv7();
}
