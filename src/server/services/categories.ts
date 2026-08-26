import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function listCategories(userId: string, includeArchived = false) {
  return prisma.category.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(
  userId: string,
  input: { name: string; valueClass: string; sort?: number },
) {
  const maxSort = await prisma.category.aggregate({
    where: { userId },
    _max: { sort: true },
  });
  return prisma.category.create({
    data: {
      id: uuidv7(),
      userId,
      name: input.name,
      valueClass: input.valueClass as never,
      sort: input.sort ?? (maxSort._max.sort ?? -1) + 1,
    },
  });
}

export async function updateCategory(
  userId: string,
  id: string,
  input: {
    name?: string;
    valueClass?: string;
    sort?: number;
    archived?: boolean;
  },
) {
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "Category not found");

  // Value-class changes are versioned: they change historical analytics meaning.
  if (input.valueClass && input.valueClass !== existing.valueClass) {
    await prisma.categoryHistory.create({
      data: {
        id: uuidv7(),
        categoryId: id,
        field: "value_class",
        oldValue: existing.valueClass,
        newValue: input.valueClass,
      },
    });
  }

  return prisma.category.update({
    where: { id },
    data: {
      name: input.name,
      valueClass: input.valueClass as never,
      sort: input.sort,
      archivedAt:
        input.archived === true ? new Date() : input.archived === false ? null : undefined,
    },
  });
}
