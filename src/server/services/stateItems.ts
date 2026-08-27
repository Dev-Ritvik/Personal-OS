import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function listStateItems(userId: string, kind?: string) {
  return prisma.stateItem.findMany({
    where: { userId, ...(kind ? { kind: kind as never } : {}) },
    orderBy: { sort: "asc" },
  });
}

export async function createStateItem(
  userId: string,
  input: { kind: string; domain: string; label: string; value: string; sort?: number },
) {
  return prisma.stateItem.create({
    data: {
      id: uuidv7(),
      userId,
      kind: input.kind as never,
      domain: input.domain,
      label: input.label,
      value: input.value,
      sort: input.sort ?? 0,
    },
  });
}

export async function updateStateItem(userId: string, id: string, input: { label?: string; value?: string; domain?: string; sort?: number }) {
  const existing = await prisma.stateItem.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "State item not found");
  return prisma.stateItem.update({ where: { id }, data: input });
}

export async function deleteStateItem(userId: string, id: string) {
  const existing = await prisma.stateItem.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "State item not found");
  await prisma.stateItem.delete({ where: { id } });
}
