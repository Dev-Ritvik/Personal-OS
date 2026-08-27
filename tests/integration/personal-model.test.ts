import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ensureTestDb, truncateAll, makeUser } from "./helpers";
import { getProfile, updateProfile } from "@/server/services/personalProfile";
import { listStateItems, createStateItem } from "@/server/services/stateItems";
import { createSkill, listSkills, getSkill, updateSkill } from "@/server/services/skills";
import { addEvidence, listEvidence } from "@/server/services/skillEvidence";
import { linkGoalSkill, listByGoal } from "@/server/services/goalSkills";
import { createGoal } from "@/server/services/goals";

const ready = await ensureTestDb();

(ready ? describe : describe.skip)("Personal Model — State Separation (AC-PM1)", () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await makeUser()).id;
  });

  it("current and target state are structurally distinct", async () => {
    await createStateItem(userId, { kind: "CURRENT", domain: "academic", label: "CGPA", value: "7.5" });
    await createStateItem(userId, { kind: "TARGET", domain: "academic", label: "CGPA", value: "8.0+" });
    const current = await listStateItems(userId, "CURRENT");
    const target = await listStateItems(userId, "TARGET");
    expect(current).toHaveLength(1);
    expect(target).toHaveLength(1);
    expect(current[0]!.value).toBe("7.5");
    expect(target[0]!.value).toBe("8.0+");
  });
});

(ready ? describe : describe.skip)("Skills — CRUD & Levels (AC-PM3, PM4)", () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await makeUser()).id;
  });

  it("creates skills with UNKNOWN default and enum levels, not numeric scores", async () => {
    const skill = await createSkill(userId, { name: "Python", category: "TECHNICAL" });
    expect(skill.currentLevel).toBe("UNKNOWN");
    expect(skill.targetLevel).toBe("FUNCTIONAL");
    // No numeric score field exists
    expect(skill).not.toHaveProperty("score");
    expect(skill).not.toHaveProperty("percentage");
  });

  it("lists skills by category", async () => {
    await createSkill(userId, { name: "Python", category: "TECHNICAL" });
    await createSkill(userId, { name: "Sales", category: "BUSINESS" });
    const tech = await listSkills(userId, { category: "TECHNICAL" });
    expect(tech).toHaveLength(1);
    expect(tech[0]!.name).toBe("Python");
  });

  it("enforces unique skill names per user", async () => {
    await createSkill(userId, { name: "Python", category: "TECHNICAL" });
    await expect(createSkill(userId, { name: "Python", category: "TECHNICAL" })).rejects.toThrow();
  });

  it("preserves history on level updates (lastAssessedAt)", async () => {
    const skill = await createSkill(userId, { name: "Python", category: "TECHNICAL" });
    const updated = await updateSkill(userId, skill.id, { currentLevel: "DEVELOPING" } as never);
    expect(updated.currentLevel).toBe("DEVELOPING");
    expect(updated.lastAssessedAt).not.toBeNull();
  });
});

(ready ? describe : describe.skip)("Skill Evidence — History (AC-PM5)", () => {
  let userId: string;
  let skillId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await makeUser()).id;
    const skill = await createSkill(userId, { name: "Sales", category: "BUSINESS" });
    skillId = skill.id;
  });

  it("evidence preserves history and distinguishes epistemic class", async () => {
    await addEvidence(userId, skillId, { title: "Claim", epistemicClass: "SELF_REPORT" });
    await addEvidence(userId, skillId, { title: "Client call recorded", epistemicClass: "FACT" });
    const evidence = await listEvidence(userId, skillId);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]!.epistemicClass).toBe("FACT"); // newest first
    expect(evidence[1]!.epistemicClass).toBe("SELF_REPORT");
  });

  it("FACT vs SELF_REPORT are distinct in storage", async () => {
    const fact = await addEvidence(userId, skillId, { title: "Delivered QHR", epistemicClass: "FACT" });
    const report = await addEvidence(userId, skillId, { title: "I think I'm good", epistemicClass: "SELF_REPORT" });
    expect(fact.epistemicClass).not.toBe(report.epistemicClass);
  });
});

(ready ? describe : describe.skip)("Goal ↔ Skill Linking (AC-PM6)", () => {
  let userId: string;
  let goalId: string;
  let skillId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await makeUser()).id;
    const goal = await createGoal(userId, { title: "Test Goal", horizon: "life", kind: "objective", measureType: "binary" });
    goalId = goal.id;
    const skill = await createSkill(userId, { name: "Testing", category: "TECHNICAL" });
    skillId = skill.id;
  });

  it("links goal and skill", async () => {
    await linkGoalSkill(userId, goalId, { skillId });
    const links = await listByGoal(userId, goalId);
    expect(links).toHaveLength(1);
    expect(links[0]!.skillId).toBe(skillId);
  });
});

(ready ? describe : describe.skip)("Financial — Insufficient Data (AC-PM9, PM12)", () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await makeUser()).id;
  });

  it("savings goal exists without requiring income data", async () => {
    const { getOrCreateAccount } = await import("@/server/services/financials");
    const account = await getOrCreateAccount(userId);
    const goal = await prisma.savingsGoal.create({
      data: { id: crypto.randomUUID(), userId, accountId: account.id, title: "₹5L", targetAmount: 500000, targetDate: new Date("2027-09-01") },
    });
    expect(goal.targetAmount.toString()).toBe("500000");
  });

  it("summary with <3 entries is insufficient", async () => {
    const { getSummary } = await import("@/server/services/financials");
    const summary = await getSummary(userId);
    expect(summary.insufficient).toBe(true);
    expect(summary.savingsRate).toBeNull();
  });
});

(ready ? describe : describe.skip)("Readiness — Dimensions", () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await makeUser()).id;
    // Seed minimal readiness dimensions
    await prisma.readinessDimension.createMany({
      data: [
        { id: crypto.randomUUID(), userId, key: "academic", label: "Academic", sort: 0 },
        { id: crypto.randomUUID(), userId, key: "financial", label: "Financial", sort: 1 },
      ],
    });
  });

  it("computes readiness with missing requirements", async () => {
    const { computeReadiness } = await import("@/server/services/readiness");
    const result = await computeReadiness(userId);
    expect(result).toHaveLength(2);
    expect(result[0]!.status).toBe("UNKNOWN");
  });
});

(ready ? describe : describe.skip)("Authorization — Personal Model", () => {
  it("skills are user-scoped", async () => {
    await truncateAll();
    const userA = await makeUser();
    const userB = await makeUser();
    const skill = await createSkill(userA.id, { name: "Python", category: "TECHNICAL" });
    await expect(getSkill(userB.id, skill.id)).rejects.toThrow();
  });
});
