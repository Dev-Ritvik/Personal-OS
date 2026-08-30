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
    expect(g?.observed).toBe("1/3 session");
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
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.observed).toBe("3/3 session");
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.status).toBe("on_track");
  });

  it("Walk quantitative full 140/140 → on_track", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Walk outside", schedule: { type: "daily" }, target: { unit: "minutes", aggregation: "minutes", perDay: 20 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "independent_living", requirement: "Walk outside daily", requiredSkills: [], requiredGoals: [] } });
    const dates = ["2026-08-21","2026-08-22","2026-08-23","2026-08-24","2026-08-25","2026-08-26","2026-08-27"];
    for (const d of dates) {
      await prisma.planInstance.create({ data: { id: uuidv7(), userId, localDate: new Date(d + "T00:00:00Z"), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 20, actualQty: 20, met: true, doneAt: new Date() } as any });
    }
    const res = await getLifestyleGaps(userId, "2026-08-27");
    const g = res.gaps.find((x: any) => x.requirement.includes("Walk"));
    expect(g?.observed).toBe("140/140 minutes");
    expect(g?.status).toBe("on_track");
  });

  it("Walk quantitative partial 60/140 → at_risk", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Walk outside", schedule: { type: "daily" }, target: { unit: "minutes", aggregation: "minutes", perDay: 20 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "independent_living", requirement: "Walk outside daily", requiredSkills: [], requiredGoals: [] } });
    const dates = ["2026-08-21","2026-08-22","2026-08-23","2026-08-24","2026-08-25","2026-08-26","2026-08-27"];
    const qtys = [10,10,10,10,10,10,0];
    for (let i=0;i<7;i++) {
      const qty = (qtys as any)[i] as number;
      await prisma.planInstance.create({ data: { id: uuidv7(), userId, localDate: new Date(dates[i]! + "T00:00:00Z"), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 20, actualQty: qty, met: qty >= 20, doneAt: qty >= 20 ? new Date() : null } as any });
    }
    const res = await getLifestyleGaps(userId, "2026-08-27");
    const g = res.gaps.find((x: any) => x.requirement.includes("Walk"));
    expect(g?.observed).toBe("60/140 minutes");
    expect(g?.status).toBe("at_risk");
  });

  it("quantitative mixed 5+10+15 = 30 not 3", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Read 10 pages", schedule: { type: "daily" }, target: { unit: "pages", aggregation: "count", perDay: 10 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "career", requirement: "Read 10 pages/night", requiredSkills: [], requiredGoals: [] } });
    const data = [{ qty:5, met:false }, { qty:10, met:true }, { qty:15, met:true }];
    for (let i=0;i<3;i++) {
      await prisma.planInstance.create({ data: { id: uuidv7(), userId, localDate: new Date(`2026-08-2${5+i}T00:00:00Z`), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 10, actualQty: data[i]!.qty, met: data[i]!.met, doneAt: data[i]!.met ? new Date() : null } as any });
    }
    // Add 4 more days to have 7d window for quantitative sum
    const extraDates = ["2026-08-28","2026-08-29","2026-08-30","2026-08-31"];
    for (const d of extraDates) {
      await prisma.planInstance.create({ data: { id: uuidv7(), userId, localDate: new Date(d + "T00:00:00Z"), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 10, actualQty: 10, met: true, doneAt: new Date() } as any });
    }
    const res = await getLifestyleGaps(userId, "2026-08-31");
    const g = res.gaps.find((x: any) => x.requirement.includes("Read"));
    // total actualQty = 5+10+15+10+10+10+10 = 70, target 70 → on_track, not 3 (window 25-31)
    expect(g?.observed).toBe("70/70 pages");
  });

  it("met=false does not count as successful for binary", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Gym", schedule: { type: "weekly", days: [1,3,5] }, target: { unit: "session", aggregation: "count", weeklyMin: 3 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "physical_routine", requirement: "Gym 3/week", requiredSkills: [], requiredGoals: [] } });
    for (let i=0;i<3;i++) {
      await prisma.planInstance.create({ data: { id: uuidv7(), userId, localDate: new Date(`2026-08-2${1+i}T00:00:00Z`), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 1, actualQty: 0, met: false, doneAt: null } as any });
    }
    const res = await getLifestyleGaps(userId, "2026-08-27");
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.observed).toBe("0/3 session");
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.status).toBe("at_risk");
  });

  it("evidence string reflects actual observations", async () => {
    const userId = uuidv7();
    await prisma.user.create({ data: { id: userId, email: `l-${crypto.randomUUID()}@test.local`, passwordHash: "x", timezone: "UTC" } });
    const bId = uuidv7();
    await prisma.behavior.create({ data: { id: bId, userId, title: "Gym", schedule: { type: "weekly", days: [1,3,5] }, target: { unit: "session", aggregation: "count", weeklyMin: 3 }, status: "active" } });
    await prisma.targetStateRequirement.create({ data: { id: uuidv7(), userId, dimension: "physical_routine", requirement: "Gym 3/week", requiredSkills: [], requiredGoals: [] } });
    await prisma.planInstance.create({ data: { id: uuidv7(), userId, localDate: new Date("2026-08-25T00:00:00Z"), refType: "behavior", refId: bId, origin: "schedule", plannedQty: 1, actualQty: 1, met: true, doneAt: new Date() } as any });
    const res = await getLifestyleGaps(userId, "2026-08-27");
    expect(res.gaps.find((x: any) => x.requirement.includes("Gym"))?.evidence).toContain("1 met PlanInstances");
  });
});
