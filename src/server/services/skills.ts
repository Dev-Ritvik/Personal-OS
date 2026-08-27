import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function listSkills(userId: string, filters: { category?: string; status?: string; search?: string } = {}) {
  return prisma.skill.findMany({
    where: {
      userId,
      ...(filters.category ? { category: filters.category as never } : {}),
      ...(filters.status ? { status: filters.status as never } : { status: "ACTIVE" }),
      ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
}

export async function getSkill(userId: string, id: string) {
  const skill = await prisma.skill.findFirst({
    where: { id, userId },
    include: {
      evidence: { orderBy: { createdAt: "desc" } },
      dependencies: { include: { dependsOnSkill: true } },
      dependents: { include: { skill: true } },
      goalLinks: { include: { goal: { select: { id: true, title: true, status: true } } } },
    },
  });
  if (!skill) throw new ApiError(404, "not_found", "Skill not found");
  return skill;
}

export async function createSkill(
  userId: string,
  input: { name: string; category: string; description?: string | null; currentLevel?: string; targetLevel?: string; importance?: number },
) {
  const existing = await prisma.skill.findFirst({ where: { userId, name: input.name } });
  if (existing) throw new ApiError(409, "duplicate", "Skill with this name already exists");
  return prisma.skill.create({
    data: {
      id: uuidv7(),
      userId,
      name: input.name,
      category: input.category as never,
      description: input.description ?? null,
      currentLevel: (input.currentLevel ?? "UNKNOWN") as never,
      targetLevel: (input.targetLevel ?? "FUNCTIONAL") as never,
      importance: input.importance ?? 2,
    },
  });
}

export async function updateSkill(userId: string, id: string, input: Record<string, unknown>) {
  const existing = await prisma.skill.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "Skill not found");
  const data: Record<string, unknown> = {};
  if (typeof input.name === "string") data.name = input.name;
  if (typeof input.description === "string" || input.description === null) data.description = input.description;
  if (typeof input.category === "string") data.category = input.category;
  if (typeof input.currentLevel === "string") {
    data.currentLevel = input.currentLevel;
    (data as Record<string, unknown>).lastAssessedAt = new Date();
  }
  if (typeof input.targetLevel === "string") data.targetLevel = input.targetLevel;
  if (typeof input.importance === "number") data.importance = input.importance;
  if (typeof input.status === "string") {
    data.status = input.status;
    if (input.status === "ARCHIVED") (data as Record<string, unknown>).archivedAt = new Date();
  }
  if (input.nextReviewAt) data.nextReviewAt = new Date(input.nextReviewAt as string);
  return prisma.skill.update({ where: { id }, data: data as never });
}

export async function addDependency(userId: string, skillId: string, dependsOnSkillId: string) {
  if (skillId === dependsOnSkillId) throw new ApiError(400, "self_dependency", "A skill cannot depend on itself");
  const [skill, dependsOn] = await Promise.all([
    prisma.skill.findFirst({ where: { id: skillId, userId } }),
    prisma.skill.findFirst({ where: { id: dependsOnSkillId, userId } }),
  ]);
  if (!skill || !dependsOn) throw new ApiError(404, "not_found", "Skill not found");
  // Cycle check: ensure dependsOn does not already depend (transitively) on skill
  const visited = new Set<string>();
  const stack = [dependsOnSkillId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === skillId) throw new ApiError(400, "cycle", "Dependency would create a cycle");
    if (visited.has(cur)) continue;
    visited.add(cur);
    const deps = await prisma.skillDependency.findMany({ where: { skillId: cur }, select: { dependsOnSkillId: true } });
    for (const d of deps) stack.push(d.dependsOnSkillId);
  }
  return prisma.skillDependency.create({
    data: { id: uuidv7(), userId, skillId, dependsOnSkillId },
  });
}

export async function removeDependency(userId: string, id: string) {
  const dep = await prisma.skillDependency.findFirst({ where: { id, userId } });
  if (!dep) throw new ApiError(404, "not_found", "Dependency not found");
  await prisma.skillDependency.delete({ where: { id } });
}
