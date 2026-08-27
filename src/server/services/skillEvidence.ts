import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function listEvidence(userId: string, skillId: string) {
  const skill = await prisma.skill.findFirst({ where: { id: skillId, userId } });
  if (!skill) throw new ApiError(404, "not_found", "Skill not found");
  return prisma.skillEvidence.findMany({ where: { skillId, userId }, orderBy: { createdAt: "desc" } });
}

export async function addEvidence(
  userId: string,
  skillId: string,
  input: { title: string; description?: string | null; epistemicClass: string; sourceType?: string | null; sourceId?: string | null; assessedLevel?: string | null },
) {
  const skill = await prisma.skill.findFirst({ where: { id: skillId, userId } });
  if (!skill) throw new ApiError(404, "not_found", "Skill not found");
  return prisma.skillEvidence.create({
    data: {
      id: uuidv7(),
      userId,
      skillId,
      title: input.title,
      description: input.description ?? null,
      epistemicClass: input.epistemicClass as never,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      assessedLevel: (input.assessedLevel as never) ?? null,
    },
  });
}
