import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";
import { scheduledOn, type Schedule } from "@/lib/schedule";
import type { Behavior, PlanInstance } from "@prisma/client";

function parseSchedule(b: Behavior): Schedule {
  return b.schedule as unknown as Schedule;
}

function parseTarget(b: Behavior): {
  unit: string;
  aggregation: "count" | "minutes" | "sum";
  perDay?: number | null;
  weeklyMin?: number | null;
} {
  return b.target as unknown as {
    unit: string;
    aggregation: "count" | "minutes" | "sum";
    perDay?: number | null;
    weeklyMin?: number | null;
  };
}

/**
 * Idempotent plan generation for a local-date range (AC1).
 * Creates schedule-origin PlanInstances for active behaviors whose schedule
 * fires on that date, skipping dates before the behavior's start.
 */
export async function ensurePlanRange(
  userId: string,
  dates: string[],
): Promise<number> {
  if (dates.length === 0) return 0;
  const behaviors = await prisma.behavior.findMany({
    where: { userId, status: "active", deletedAt: null },
  });

  const toCreate: Array<{
    id: string;
    userId: string;
    localDate: Date;
    refType: "behavior";
    refId: string;
    origin: "schedule";
    plannedMinutes: number | null;
    plannedQty: number | null;
  }> = [];

  for (const b of behaviors) {
    const sched = parseSchedule(b);
    const target = parseTarget(b);
    if (sched.type === "times_per_week") continue; // no concrete-day fiction
    const startedOn = b.startedOn.toISOString().slice(0, 10);
    for (const date of dates) {
      if (date < startedOn) continue;
      if (!scheduledOn(sched, date)) continue;
      toCreate.push({
        id: uuidv7(),
        userId,
        localDate: new Date(`${date}T00:00:00Z`),
        refType: "behavior",
        refId: b.id,
        origin: "schedule",
        plannedMinutes:
          target.aggregation === "minutes" && target.perDay
            ? Math.round(target.perDay)
            : null,
        plannedQty:
          target.aggregation !== "minutes" && target.perDay
            ? target.perDay
            : null,
      });
    }
  }

  if (toCreate.length === 0) return 0;

  const existing = await prisma.planInstance.findMany({
    where: {
      userId,
      refType: "behavior",
      origin: "schedule",
      voidedAt: null,
      localDate: {
        gte: new Date(dates[0]!),
        lte: new Date(dates[dates.length - 1]!),
      },
    },
    select: { localDate: true, refId: true },
  });
  const have = new Set(existing.map((e) => `${e.localDate.toISOString().slice(0, 10)}|${e.refId}`));

  const fresh = toCreate.filter(
    (t) => !have.has(`${t.localDate.toISOString().slice(0, 10)}|${t.refId}`),
  );
  if (fresh.length === 0) return 0;

  const res = await prisma.planInstance.createMany({ data: fresh, skipDuplicates: true });
  return res.count;
}

function computeMet(
  target: ReturnType<typeof parseTarget>,
  actualQty: number | null,
  actualMinutes: number | null,
): boolean {
  if (target.perDay == null) return true; // presence of a check-in counts
  if (target.aggregation === "minutes") {
    return (actualMinutes ?? 0) >= target.perDay;
  }
  return (actualQty ?? 0) >= target.perDay;
}

function numOrNull(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function checkin(
  userId: string,
  instanceId: string,
  input: { actualQty?: number | null; actualMinutes?: number | null },
): Promise<PlanInstance> {
  const inst = await prisma.planInstance.findFirst({
    where: { id: instanceId, userId, voidedAt: null },
  });
  if (!inst) throw new ApiError(404, "not_found", "Plan instance not found");
  if (inst.refType !== "behavior") {
    throw new ApiError(400, "invalid_ref", "Not a behavior instance");
  }
  const behavior = await prisma.behavior.findUnique({ where: { id: inst.refId } });
  const target = behavior ? parseTarget(behavior) : null;

  const actualQty =
    input.actualQty ?? numOrNull(inst.actualQty) ?? (inst.doneAt ? 1 : null);
  const actualMinutes = input.actualMinutes ?? inst.actualMinutes;
  const met = target ? computeMet(target, actualQty, actualMinutes) : true;

  const updated = await prisma.planInstance.update({
    where: { id: instanceId },
    data: {
      actualQty,
      actualMinutes,
      met,
      doneAt: new Date(),
    },
  });

  // Phase 5: behavior completion → SkillEvidence (FACT) for linked skills
  if (met && behavior) {
    // Find skills linked via GoalSkillLink (behavior → goal → skills) and via direct? For now, look up skills for behavior's goal
    const skillIds = new Set<string>();
    if (behavior.goalId) {
      const glinks = await prisma.goalSkillLink.findMany({ where: { goalId: behavior.goalId, userId } });
      for (const l of glinks) skillIds.add(l.skillId);
    }
    // Also check if behavior title matches a skill name (e.g., "Gym" → "Exercise consistency")
    // We look up skills where name appears in behavior title (simple heuristic) — but for now just use goal links
    // Additionally, map lifestyle behaviors to independent_living / physical_routine skills via name
    const allSkills = await prisma.skill.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, name: true } });
    const behaviorTitleLower = behavior.title.toLowerCase();
    for (const s of allSkills) {
      const sFirst = s.name.toLowerCase().split(" ")[0] ?? "";
      const bFirst = behaviorTitleLower.split(" ")[0] ?? "";
      if (sFirst && bFirst && (behaviorTitleLower.includes(sFirst) || s.name.toLowerCase().includes(bFirst))) {
        // loose match for gym/cook/reading etc.
        if (["Gym", "Cook", "Reading", "Walk", "Sleep", "House"].some((k) => behavior.title.includes(k))) {
          skillIds.add(s.id);
        }
      }
    }
    for (const sid of skillIds) {
      const exists = await prisma.skillEvidence.findFirst({
        where: { skillId: sid, sourceType: "behavior", sourceId: behavior.id },
      });
      // Allow one evidence per behavior per skill per day (use instanceId as sourceId for uniqueness)
      const dailyExists = await prisma.skillEvidence.findFirst({
        where: { skillId: sid, sourceType: "behavior", sourceId: instanceId },
      });
      if (!dailyExists && !exists) {
        // Check if we already have evidence for this behavior today (avoid duplicate for same instance)
      }
      if (!dailyExists) {
        await prisma.skillEvidence.create({
          data: {
            id: uuidv7(),
            userId,
            skillId: sid,
            title: `Completed behavior: ${behavior.title}`,
            description: `Behavior "${behavior.title}" met target — ${actualQty ?? actualMinutes ?? 1} ${behavior.target ? JSON.stringify(behavior.target) : ""}`,
            epistemicClass: "FACT",
            sourceType: "behavior",
            sourceId: instanceId,
          },
        });
      }
    }
  }

  return updated;
}

export async function adHocCheckin(
  userId: string,
  behaviorId: string,
  date: string,
  input: { actualQty?: number | null; actualMinutes?: number | null },
): Promise<PlanInstance> {
  const behavior = await prisma.behavior.findFirst({
    where: { id: behaviorId, userId, deletedAt: null },
  });
  if (!behavior) throw new ApiError(404, "not_found", "Behavior not found");
  const target = parseTarget(behavior);
  const actualQty = input.actualQty ?? 1;
  const actualMinutes = input.actualMinutes ?? null;

  const created = await prisma.planInstance.create({
    data: {
      id: uuidv7(),
      userId,
      localDate: new Date(`${date}T00:00:00Z`),
      refType: "behavior",
      refId: behaviorId,
      origin: "ad_hoc",
      actualQty,
      actualMinutes,
      met: computeMet(target, actualQty, actualMinutes),
      doneAt: new Date(),
    },
  });

  // Phase 5: ad-hoc behavior completion → evidence
  if (created.met) {
    const glinks = behavior.goalId ? await prisma.goalSkillLink.findMany({ where: { goalId: behavior.goalId, userId } }) : [];
    for (const l of glinks) {
      const exists = await prisma.skillEvidence.findFirst({
        where: { skillId: l.skillId, sourceType: "behavior", sourceId: created.id },
      });
      if (!exists) {
        await prisma.skillEvidence.create({
          data: {
            id: uuidv7(),
            userId,
            skillId: l.skillId,
            title: `Ad-hoc behavior: ${behavior.title}`,
            description: `Ad-hoc completion of "${behavior.title}"`,
            epistemicClass: "FACT",
            sourceType: "behavior",
            sourceId: created.id,
          },
        });
      }
    }
  }

  return created;
}

export interface TodayPlanRow extends PlanInstance {
  label: string;
}

/** Plan instances for a local date with denormalized labels for UI lists. */
export async function listForDate(
  userId: string,
  date: string,
): Promise<TodayPlanRow[]> {
  const dayStart = new Date(`${date}T00:00:00Z`);
  const rows = await prisma.planInstance.findMany({
    where: { userId, voidedAt: null, localDate: dayStart },
    orderBy: [{ origin: "asc" }, { createdAt: "asc" }],
  });
  const behaviors = await prisma.behavior.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, title: true },
  });
  const tasks = await prisma.task.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, title: true },
  });
  const labels = new Map<string, string>();
  for (const b of behaviors) labels.set(`behavior:${b.id}`, b.title);
  for (const t of tasks) labels.set(`task:${t.id}`, t.title);

  return rows.map((r) => ({
    ...r,
    label: labels.get(`${r.refType}:${r.refId}`) ?? "(deleted)",
  }));
}
