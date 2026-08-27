import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError, audit } from "../api";
import type { Prisma } from "@prisma/client";

const HORIZON_BY_DEPTH = ["life", "annual", "quarterly"] as const;

async function depthOf(
  all: Map<string, { id: string; parentId: string | null }>,
  id: string,
): Promise<number> {
  let d = 1;
  let cur = all.get(id)?.parentId ?? null;
  while (cur) {
    d++;
    if (d > 8) throw new ApiError(400, "cycle", "Goal tree cycle detected");
    cur = all.get(cur)?.parentId ?? null;
  }
  return d;
}

export async function createGoal(
  userId: string,
  input: {
    parentId?: string | null;
    title: string;
    description?: string | null;
    horizon: string;
    kind: string;
    measureType: string;
    unit?: string | null;
    targetValue?: number | null;
    direction?: string;
    startDate?: string | null;
    targetDate?: string | null;
    status?: string;
  },
) {
  if (input.parentId) {
    const parent = await prisma.goal.findFirst({
      where: { id: input.parentId, userId, deletedAt: null },
    });
    if (!parent) throw new ApiError(404, "not_found", "Parent goal not found");

    // Depth ≤ 4 (ARCHITECTURE.md §6.1). Horizon must match tree level:
    // depth1 life → depth2 annual → depth3 quarterly → depth4 leaf.
    const all = new Map<string, { id: string; parentId: string | null }>(
      (
        await prisma.goal.findMany({
          where: { userId, deletedAt: null },
          select: { id: true, parentId: true },
        })
      ).map((g: any) => [g.id, g]),
    );
    const parentDepth = await depthOf(all, parent.id);
    if (parentDepth >= 4) {
      throw new ApiError(400, "max_depth", "Goal tree limited to 4 levels");
    }
    const requiredHorizon = HORIZON_BY_DEPTH[parentDepth];
    if (input.horizon !== requiredHorizon) {
      throw new ApiError(
        400,
        "horizon_mismatch",
        `A level-${parentDepth + 1} goal must use horizon '${requiredHorizon}'`,
      );
    }
  } else if (input.horizon !== "life") {
    throw new ApiError(400, "horizon_mismatch", "Root goals use horizon 'life'");
  }

  return prisma.goal.create({
    data: {
      id: uuidv7(),
      userId,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? null,
      horizon: input.horizon as never,
      kind: input.kind as never,
      measureType: input.measureType as never,
      unit: input.unit ?? null,
      targetValue: input.targetValue ?? null,
      direction: (input.direction ?? "at_least") as never,
      startDate: input.startDate ? new Date(input.startDate) : null,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      status: (input.status ?? "draft") as never,
    },
  });
}

export async function updateGoal(
  userId: string,
  id: string,
  input: Record<string, unknown>,
) {
  const existing = await prisma.goal.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw new ApiError(404, "not_found", "Goal not found");

  const data: Record<string, unknown> = {};
  if (typeof input.title === "string") data.title = input.title;
  if ("description" in input) data.description = (input.description as string) ?? null;
  if ("unit" in input) data.unit = (input.unit as string) ?? null;
  if ("targetValue" in input) {
    data.targetValue = input.targetValue === null || input.targetValue === undefined
      ? null
      : String(input.targetValue);
  }
  if (typeof input.direction === "string") data.direction = input.direction as never;
  if ("startDate" in input) {
    data.startDate = input.startDate ? new Date(input.startDate as string) : null;
  }
  if ("targetDate" in input) {
    data.targetDate = input.targetDate ? new Date(input.targetDate as string) : null;
  }
  if (typeof input.sort === "number") data.sort = input.sort;

  const terminalStatuses = new Set(["achieved", "abandoned", "archived"]);
  if (typeof input.status === "string" && input.status !== existing.status) {
    data.status = input.status as never;
    if (terminalStatuses.has(input.status)) {
      data.closedAt = new Date();
      if (input.closingValue !== undefined && input.closingValue !== null) {
        data.closingValue = String(input.closingValue);
      }
    } else {
      data.closedAt = null;
    }
  }
  if ("closingValue" in input && input.closingValue != null) {
    data.closingValue = String(input.closingValue);
  }

  const updated = await prisma.goal.update({ where: { id }, data });
  await audit(userId, "update", "goal", id, input);
  return updated;
}

/** Full non-deleted goal set as an adjacency map (small N=1 dataset). */
export async function listGoalsFlat(userId: string) {
  return prisma.goal.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
}
