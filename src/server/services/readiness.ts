import { prisma } from "../db";

export type ReadinessStatus = "UNKNOWN" | "FOUNDATIONAL" | "DEVELOPING" | "READY" | "BLOCKED";

const SKILL_LEVEL_ORDER = ["UNKNOWN", "BEGINNER", "DEVELOPING", "FUNCTIONAL", "STRONG", "ADVANCED"] as const;

const EPISTEMIC_WEIGHT: Record<string, number> = { FACT: 1.0, ASSESSMENT: 0.8, SELF_REPORT: 0.5, INFERENCE: 0.3 };

function levelToIndex(level: string): number { return SKILL_LEVEL_ORDER.indexOf(level as any); }

function computeSuggestedLevel(evidence: { epistemicClass: string; assessedLevel: string | null }[]): { level: string; evidenceCount: number; factCount: number } | null {
  if (evidence.length === 0) return null;
  let totalWeight = 0; let weightedSum = 0; let factCount = 0;
  for (const ev of evidence) {
    const w = (EPISTEMIC_WEIGHT as Record<string, number>)[ev.epistemicClass] ?? 0.1;
    if (ev.assessedLevel) { const idx = levelToIndex(ev.assessedLevel); if (idx >= 0) { weightedSum += idx * w; totalWeight += w; } }
    if (ev.epistemicClass === "FACT") factCount++;
  }
  if (totalWeight === 0) return null;
  const idx = Math.round(weightedSum / totalWeight);
  return { level: SKILL_LEVEL_ORDER[Math.max(0, Math.min(idx, 5))]!, evidenceCount: evidence.length, factCount };
}

function evaluateRequirement(req: { skillId: string | null; goalId: string | null }, lookup: { skillLevels: Map<string, string>; goalStatuses: Map<string, string>; suggestedLevels: Map<string, { level: string; evidenceCount: number; factCount: number } | null> }): { met: boolean; reason: string; suggestedLevel?: string; evidenceCount?: number; factCount?: number } {
  if (req.skillId) {
    const level = lookup.skillLevels.get(req.skillId);
    const suggested = lookup.suggestedLevels.get(req.skillId);
    if (!level || level === "UNKNOWN") {
      if (suggested && suggested.level !== "UNKNOWN" && levelToIndex(suggested.level) >= levelToIndex("DEVELOPING")) {
        return { met: true, reason: `Evidence suggests ${suggested.level} (${suggested.evidenceCount} evidence, ${suggested.factCount} FACT)`, suggestedLevel: suggested.level, evidenceCount: suggested.evidenceCount, factCount: suggested.factCount };
      }
      if (suggested && suggested.level !== "UNKNOWN") {
        return { met: false, reason: `Evidence suggests ${suggested.level} (${suggested.evidenceCount} evidence, ${suggested.factCount} FACT) — needs DEVELOPING+`, suggestedLevel: suggested.level, evidenceCount: suggested.evidenceCount, factCount: suggested.factCount };
      }
      return { met: false, reason: "Skill not assessed" };
    }
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
  const [dimensions, skills, goals, evidence] = await Promise.all([
    prisma.readinessDimension.findMany({ where: { userId }, orderBy: { sort: "asc" }, include: { requirements: true } }),
    prisma.skill.findMany({ where: { userId }, select: { id: true, currentLevel: true } }),
    prisma.goal.findMany({ where: { userId, deletedAt: null }, select: { id: true, status: true } }),
    prisma.skillEvidence.findMany({ where: { userId }, select: { skillId: true, epistemicClass: true, assessedLevel: true } }),
  ]);

  const skillLevels = new Map(skills.map((s) => [s.id, s.currentLevel as string]));
  const goalStatuses = new Map(goals.map((g) => [g.id, g.status as string]));
  const evidenceBySkill = new Map<string, { epistemicClass: string; assessedLevel: string | null }[]>();
  for (const ev of evidence) { if (!evidenceBySkill.has(ev.skillId)) evidenceBySkill.set(ev.skillId, []); evidenceBySkill.get(ev.skillId)!.push(ev); }
  const suggestedLevels = new Map<string, { level: string; evidenceCount: number; factCount: number } | null>();
  for (const s of skills) suggestedLevels.set(s.id, computeSuggestedLevel(evidenceBySkill.get(s.id) ?? []));

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
    const evaluated = reqs.map((r) => ({ req: r, ...evaluateRequirement(r, { skillLevels, goalStatuses, suggestedLevels }) }));
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
        suggestedLevel: (e as any).suggestedLevel,
        evidenceCount: (e as any).evidenceCount,
        factCount: (e as any).factCount,
        skillId: e.req.skillId,
        goalId: e.req.goalId,
      })),
    };
  });
}
