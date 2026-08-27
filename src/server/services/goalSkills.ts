import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function listByGoal(userId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) throw new ApiError(404, "not_found", "Goal not found");
  return prisma.goalSkillLink.findMany({ where: { goalId, userId }, include: { skill: true } });
}

export async function linkGoalSkill(userId: string, goalId: string, input: { skillId: string; requiredLevel?: string | null; notes?: string | null }) {
  const [goal, skill] = await Promise.all([
    prisma.goal.findFirst({ where: { id: goalId, userId } }),
    prisma.skill.findFirst({ where: { id: input.skillId, userId } }),
  ]);
  if (!goal || !skill) throw new ApiError(404, "not_found", "Goal or skill not found");
  return prisma.goalSkillLink.create({
    data: {
      id: uuidv7(),
      userId,
      goalId,
      skillId: input.skillId,
      requiredLevel: (input.requiredLevel as never) ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function unlinkGoalSkill(userId: string, goalId: string, skillId: string) {
  const link = await prisma.goalSkillLink.findFirst({ where: { goalId, skillId, userId } });
  if (!link) throw new ApiError(404, "not_found", "Link not found");
  await prisma.goalSkillLink.delete({ where: { id: link.id } });
}

export async function listBySkill(userId: string, skillId: string) {
  const skill = await prisma.skill.findFirst({ where: { id: skillId, userId } });
  if (!skill) throw new ApiError(404, "not_found", "Skill not found");
  return prisma.goalSkillLink.findMany({ where: { skillId, userId }, include: { goal: { select: { id: true, title: true, status: true } } } });
}

export async function setTaskSkills(userId: string, taskId: string, skillIds: string[]) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new ApiError(404, "not_found", "Task not found");
  await prisma.taskSkillLink.deleteMany({ where: { taskId, userId } });
  if (skillIds.length === 0) return [];
  const skills = await prisma.skill.findMany({ where: { id: { in: skillIds }, userId } });
  if (skills.length !== skillIds.length) throw new ApiError(404, "not_found", "One or more skills not found");
  await prisma.taskSkillLink.createMany({
    data: skillIds.map((skillId) => ({ id: uuidv7(), userId, taskId, skillId })),
  });
  return prisma.taskSkillLink.findMany({ where: { taskId, userId }, include: { skill: true } });
}

export async function getTaskSkills(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new ApiError(404, "not_found", "Task not found");
  return prisma.taskSkillLink.findMany({ where: { taskId, userId }, include: { skill: true } });
}
