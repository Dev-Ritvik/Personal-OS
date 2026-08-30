import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function listGoalDependencies(userId: string) {
  return prisma.goalDependency.findMany({
    where: { userId },
    include: { goal: { select: { id: true, title: true, status: true, targetDate: true } }, dependsOnGoal: { select: { id: true, title: true, status: true, targetDate: true } } },
  });
}

export async function addGoalDependency(userId: string, goalId: string, dependsOnGoalId: string) {
  if (goalId === dependsOnGoalId) throw new ApiError(400, "self_dependency", "A goal cannot depend on itself");
  const [goal, dependsOn] = await Promise.all([
    prisma.goal.findFirst({ where: { id: goalId, userId } }),
    prisma.goal.findFirst({ where: { id: dependsOnGoalId, userId } }),
  ]);
  if (!goal || !dependsOn) throw new ApiError(404, "not_found", "Goal not found");
  // Cycle check: DFS from dependsOnGoalId, ensure we don't reach goalId
  const visited = new Set<string>();
  const stack = [dependsOnGoalId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === goalId) throw new ApiError(400, "cycle", "Dependency would create a cycle");
    if (visited.has(cur)) continue;
    visited.add(cur);
    const deps = await prisma.goalDependency.findMany({ where: { goalId: cur }, select: { dependsOnGoalId: true } });
    for (const d of deps) stack.push(d.dependsOnGoalId);
  }
  return prisma.goalDependency.create({
    data: { id: uuidv7(), userId, goalId, dependsOnGoalId },
  });
}

export async function removeGoalDependency(userId: string, id: string) {
  const dep = await prisma.goalDependency.findFirst({ where: { id, userId } });
  if (!dep) throw new ApiError(404, "not_found", "Dependency not found");
  await prisma.goalDependency.delete({ where: { id } });
}

export async function findBottleneckChain(userId: string, today: string): Promise<string[]> {
  const [deps, goals] = await Promise.all([
    prisma.goalDependency.findMany({ where: { userId }, select: { goalId: true, dependsOnGoalId: true } }),
    prisma.goal.findMany({ where: { userId, deletedAt: null, status: { in: ["active", "paused", "draft"] } }, select: { id: true, title: true, status: true, targetDate: true } }),
  ]);
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  // Build adjacency: dependsOn -> dependents
  const dependents = new Map<string, string[]>();
  for (const d of deps) {
    if (!dependents.has(d.dependsOnGoalId)) dependents.set(d.dependsOnGoalId, []);
    dependents.get(d.dependsOnGoalId)!.push(d.goalId);
  }
  // Find blocked goals: those with dependsOn that is not achieved and is at risk ( overdue or draft)
  const blocked: string[] = [];
  for (const g of goals) {
    const dep = deps.find((d) => d.goalId === g.id);
    if (!dep) continue;
    const parent = goalMap.get(dep.dependsOnGoalId);
    if (!parent) continue;
    if (parent.status !== "achieved") {
      // If parent is overdue or has no progress, it's bottleneck
      blocked.push(`${g.title} bottlenecked by ${parent.title} (${parent.status})`);
    }
  }
  return blocked.slice(0, 3);
}
