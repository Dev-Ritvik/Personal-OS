import { prisma } from "../db";

export type ReadinessStatus = "UNKNOWN" | "FOUNDATIONAL" | "DEVELOPING" | "READY" | "BLOCKED";

function evaluateRequirement(req: { skillId: string | null; goalId: string | null }, lookup: { skillLevels: Map<string, string>; goalStatuses: Map<string, string> }): { met: boolean; reason: string } {
  if (req.skillId) {
    const level = lookup.skillLevels.get(req.skillId);
    if (!level || level === "UNKNOWN") return { met: false, reason: "Skill not assessed" };
    if (level === "BEGINNER") return { met: false, reason: "Skill at BEGINNER — needs DEVELOPING+" };
    return { met: true, reason: `Skill ${level}` };
  }
  if (req.goalId) {
    const status = lookup.goalStatuses.get(req.goalId);
    if (!status) return { met: false, reason: "Goal not found" };
    if (status === "achieved") return { met: true, reason: "Goal achieved" };
    if (status === "active") return { met: false, reason: `Goal ${status}` };
    return { met: false, reason: `Goal ${status}` };
  }
  return { met: false, reason: "No linked skill or goal — manual check required" };
}

export async function computeReadiness(userId: string) {
  const [dimensions, skills, goals] = await Promise.all([
    prisma.readinessDimension.findMany({ where: { userId }, orderBy: { sort: "asc" }, include: { requirements: true } }),
    prisma.skill.findMany({ where: { userId }, select: { id: true, currentLevel: true } }),
    prisma.goal.findMany({ where: { userId, deletedAt: null }, select: { id: true, status: true } }),
  ]);

  const skillLevels = new Map(skills.map((s) => [s.id, s.currentLevel as string]));
  const goalStatuses = new Map(goals.map((g) => [g.id, g.status as string]));

  return dimensions.map((dim) => {
    const reqs = dim.requirements;
    if (reqs.length === 0) {
      return {
        key: dim.key,
        label: dim.label,
        description: dim.description,
        status: "UNKNOWN" as ReadinessStatus,
        missing: [] as string[],
        nextAction: "Define requirements for this dimension",
        total: 0,
        met: 0,
      };
    }
    const evaluated = reqs.map((r) => ({ req: r, ...evaluateRequirement(r, { skillLevels, goalStatuses }) }));
    const metCount = evaluated.filter((e) => e.met).length;
    const total = reqs.length;
    const ratio = metCount / total;

    let status: ReadinessStatus;
    if (metCount === 0) status = "BLOCKED";
    else if (ratio < 0.3) status = "FOUNDATIONAL";
    else if (ratio < 0.7) status = "DEVELOPING";
    else if (ratio < 1) status = "DEVELOPING";
    else status = "READY";

    // If any requirement has no skill/goal link, UNKNOWN trumps
    const hasUnlinked = reqs.some((r) => !r.skillId && !r.goalId);
    if (hasUnlinked && metCount === 0) status = "UNKNOWN";

    const missing = evaluated.filter((e) => !e.met).map((e) => `${e.req.label} — ${e.reason}`);
    const nextAction = missing[0] ?? "All requirements met";

    return {
      key: dim.key,
      label: dim.label,
      description: dim.description,
      status,
      missing,
      nextAction,
      total,
      met: metCount,
      requirements: evaluated.map((e) => ({
        id: e.req.id,
        label: e.req.label,
        met: e.met,
        reason: e.reason,
        skillId: e.req.skillId,
        goalId: e.req.goalId,
      })),
    };
  });
}
