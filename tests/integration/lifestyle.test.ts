import { describe, it, expect } from "vitest";
import { getLifestyleGaps } from "@/server/services/lifestyle";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/ids";

describe("Loop 3 — Lifestyle observation", () => {
  it("zero observations → insufficient_data", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "physical_routine", requirement: "Gym 3/week", requiredSkills: [], requiredGoals: [] } });
    await prisma.behavior.create({ data: { id: uuidv7(), userId, title: "Gym", schedule: { type: "weekly", days: [1,3,5] }, target: { unit: "session", aggregation: "count", weeklyMin: 3 }, status: "active" } });
    const res = await getLifestyleGaps(userId, "2026-08-27");
    const g = res.gaps.find((x: any) => x.requirement.includes("Gym"));
    expect(g?.status).toBe("insufficient_data");
    expect(g?.observed).toContain("No scheduled");
  });

  it("gym 1/3 → at_risk", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Gym", schedule: { type: "weekly", days: [1,3,5] }, target: { unit: "session", aggregation: "count", weeklyMin: 3 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "physical_routine", requirement: "Gym 3/week", requiredSkills: [], requiredGoals: [] } });
    const today = "2026-08-27";
    const dates = ["2026-08-21","2026-08-23","2026-08-25"];
    for (let i=0;i<3;i++) {
      await prisma.planInstance.create({
        data: { id: uuidv7(), userId, localDate: new Date(dates[i] + "T00:00:00Z"), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 1, actualQty: i===0?1:0, met: i===0, doneAt: i===0? new Date(): null } as any,
      });
    }
    const res = await getLifestyleGaps(userId, today);
    const g = res.gaps.find((x: any) => x.requirement.includes("Gym"));
    expect(g?.observed).toBe("1/3");
    expect(g?.status).toBe("at_risk");
  });

  it("gym 3/3 → on_track", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Gym", schedule: { type: "weekly", days: [1,3,5] }, target: { unit: "session", aggregation: "count", weeklyMin: 3 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "physical_routine", requirement: "Gym 3/week", requiredSkills: [], requiredGoals: [] } });
    const dates = ["2026-08-21","2026-08-23","2026-08-25"];
    for (const d of dates) {
      await prisma.planInstance.create({
        data: { id: uuidv7(), userId, localDate: new Date(d + "T00:00:00Z"), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 1, actualQty: 1, met: true, doneAt: new Date() } as any,
      });
    }
    const res = await getLifestyleGaps(userId, "2026-08-27");
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.observed).toBe("3/3");
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.status).toBe("on_track");
  });
});
