import { describe, it, expect } from "vitest";
import { prisma } from "@/server/db";
import { computeReadiness } from "@/server/services/readiness";
import { uuidv7 } from "@/server/ids";

// Helper to create a user and skill for testing
async function setupUserWithSkill(currentLevel: string) {
  const userId = uuidv7();
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `test-${crypto.randomUUID()}@local.test`,
      passwordHash: "x",
      timezone: "UTC",
    },
  });
  const skill = await prisma.skill.create({
    data: {
      id: uuidv7(),
      userId,
      name: `TestSkill-${userId.slice(0, 4)}`,
      category: "TECHNICAL",
      currentLevel: currentLevel as any,
    },
  });
  const dim = await prisma.readinessDimension.create({
    data: { id: uuidv7(), userId, key: `dim-${userId.slice(0, 4)}`, label: "Test Dim", sort: 0 },
  });
  await prisma.readinessRequirement.create({
    data: { id: uuidv7(), userId, dimensionId: dim.id, label: "Test Req", skillId: skill.id },
  });
  return { user, skill, dim };
}

describe("Loop 1 — SkillEvidence → readiness", () => {
  it("1. no evidence → suggestedLevel null, not met", async () => {
    const { user } = await setupUserWithSkill("UNKNOWN");
    const res = await computeReadiness(user.id);
    const dim = res.find((d) => d.key.startsWith("dim-"));
    expect(dim).toBeDefined();
    expect(((dim as any).requirements[0] as any).suggestedLevel).toBeUndefined();
    expect(((dim as any).requirements[0] as any).evidenceCount).toBeUndefined();
    expect(dim!.status).toBe("BLOCKED");
  });

  it("2. one FACT DEVELOPING → suggested DEVELOPING", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "t", epistemicClass: "FACT", assessedLevel: "DEVELOPING" },
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.suggestedLevel).toBe("DEVELOPING");
    expect(req?.evidenceCount).toBe(1);
    expect(req?.factCount).toBe(1);
    expect(req?.met).toBe(true);
  });

  it("3. FACT outweighs SELF_REPORT", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.createMany({
      data: [
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "fact", epistemicClass: "FACT", assessedLevel: "STRONG" },
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "self", epistemicClass: "SELF_REPORT", assessedLevel: "BEGINNER" },
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "self2", epistemicClass: "SELF_REPORT", assessedLevel: "BEGINNER" },
      ],
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    // FACT STRONG (4) weight 1.0 vs 2× BEGINNER (1) weight 0.5 each → weighted sum should lean to STRONG/DEVELOPING, not BEGINNER
    expect(req?.suggestedLevel).not.toBe("BEGINNER");
    expect(req?.factCount).toBe(1);
  });

  it("4. ASSESSMENT weighting", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "assess", epistemicClass: "ASSESSMENT", assessedLevel: "FUNCTIONAL" },
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.suggestedLevel).toBe("FUNCTIONAL");
  });

  it("5. INFERENCE weighting", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "inf", epistemicClass: "INFERENCE", assessedLevel: "STRONG" },
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.suggestedLevel).toBe("STRONG");
  });

  it("6. mixed evidence deterministic", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    const data = [
      { id: uuidv7(), userId: user.id, skillId: skill.id, title: "a", epistemicClass: "FACT", assessedLevel: "DEVELOPING" },
      { id: uuidv7(), userId: user.id, skillId: skill.id, title: "b", epistemicClass: "FACT", assessedLevel: "DEVELOPING" },
      { id: uuidv7(), userId: user.id, skillId: skill.id, title: "c", epistemicClass: "SELF_REPORT", assessedLevel: "STRONG" },
    ];
    await prisma.skillEvidence.createMany({ data: data as any });
    const r1 = await computeReadiness(user.id);
    const r2 = await computeReadiness(user.id);
    expect(r1.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id)?.suggestedLevel)
      .toBe(r2.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id)?.suggestedLevel);
  });

  it("7. evidenceCount correct", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.createMany({
      data: [
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "a", epistemicClass: "FACT", assessedLevel: "DEVELOPING" },
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "b", epistemicClass: "FACT", assessedLevel: "FUNCTIONAL" },
      ],
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.evidenceCount).toBe(2);
  });

  it("8. factCount correct", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.createMany({
      data: [
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "a", epistemicClass: "FACT", assessedLevel: "DEVELOPING" },
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "b", epistemicClass: "SELF_REPORT", assessedLevel: "DEVELOPING" },
        { id: uuidv7(), userId: user.id, skillId: skill.id, title: "c", epistemicClass: "INFERENCE", assessedLevel: "DEVELOPING" },
      ],
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.factCount).toBe(1);
  });

  it("9. currentLevel UNKNOWN does NOT mutate Skill.currentLevel", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "t", epistemicClass: "FACT", assessedLevel: "STRONG" },
    });
    await computeReadiness(user.id);
    const fresh = await prisma.skill.findUnique({ where: { id: skill.id } });
    expect(fresh?.currentLevel).toBe("UNKNOWN");
  });

  it("10. currentLevel BEGINNER remains authoritative (not met)", async () => {
    const { user, skill } = await setupUserWithSkill("BEGINNER");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "t", epistemicClass: "FACT", assessedLevel: "STRONG" },
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.met).toBe(false);
    expect(req?.reason).toContain("BEGINNER");
  });

  it("11. currentLevel DEVELOPING remains authoritative (met)", async () => {
    const { user, skill } = await setupUserWithSkill("DEVELOPING");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "t", epistemicClass: "FACT", assessedLevel: "UNKNOWN" },
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.met).toBe(true);
  });

  it("12. insufficient/invalid assessedLevel remains null", async () => {
    const { user, skill } = await setupUserWithSkill("UNKNOWN");
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "t", epistemicClass: "FACT", assessedLevel: null },
    });
    await prisma.skillEvidence.create({
      data: { id: uuidv7(), userId: user.id, skillId: skill.id, title: "t2", epistemicClass: "SELF_REPORT", assessedLevel: null },
    });
    const res = await computeReadiness(user.id);
    const req = res.flatMap((d) => d.requirements).find((r: any) => r.skillId === skill.id);
    expect(req?.suggestedLevel).toBeUndefined();
    expect(req?.met).toBe(false);
  });
});

