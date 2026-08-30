import { prisma } from "../db";
import { todayInTz } from "@/lib/metrics/dates";

export async function getLifestyleGaps(userId: string, today: string) {
  const [requirements, behaviors, stateCurrent, stateTarget] = await Promise.all([
    prisma.targetStateRequirement.findMany({ where: { userId } }),
    prisma.behavior.findMany({ where: { userId, deletedAt: null, status: "active" }, select: { id: true, title: true, schedule: true, target: true } }),
    prisma.stateItem.findMany({ where: { userId, kind: "CURRENT" }, select: { label: true, value: true, domain: true } }),
    prisma.stateItem.findMany({ where: { userId, kind: "TARGET" }, select: { label: true, value: true, domain: true } }),
  ]);

  // For each behavior, compute observed vs target (simple: count PlanInstances last 28d)
  const gaps = [];
  for (const req of requirements) {
    const firstWord = req.requirement.toLowerCase().split(" ")[0] ?? "";
    const behavior = behaviors.find((b) => b.title.toLowerCase().includes(firstWord));
    let observed = "No data";
    let target = req.requirement;
    let status: "insufficient_data" | "at_risk" | "on_track" = "insufficient_data";
    let evidence = "No behavior scheduled";
    if (behavior) {
      const targetVal = (behavior.target as any)?.weeklyMin ?? (behavior.target as any)?.perDay ?? null;
      const schedule = behavior.schedule as any;
      // Simple: if behavior exists, we have a target, but no observation yet → insufficient
      target = `${behavior.title}: ${targetVal ? `${targetVal} ${ (behavior.target as any)?.unit ?? ""}` : JSON.stringify(behavior.target)}`;
      evidence = `Behavior "${behavior.title}" scheduled as ${JSON.stringify(schedule)}`;
      status = "insufficient_data";
    }
    gaps.push({
      requirement: req.requirement,
      dimension: req.dimension,
      target,
      observed,
      status,
      evidence,
      currentState: stateCurrent.find((s) => s.label.toLowerCase().includes(firstWord))?.value ?? null,
      targetState: stateTarget.find((s) => s.label.toLowerCase().includes(firstWord))?.value ?? null,
    });
  }

  // Also include StateItem gaps not covered by requirements
  const stateGaps = stateTarget.map((t) => {
    const c = stateCurrent.find((s) => s.label === t.label);
    return {
      requirement: t.label,
      dimension: t.domain,
      target: t.value,
      observed: c?.value ?? "No current data",
      status: c ? "on_track" as const : "insufficient_data" as const,
      evidence: c ? `Current: ${c.value}` : "No current StateItem",
      currentState: c?.value ?? null,
      targetState: t.value,
    };
  });

  return { gaps, stateGaps, behaviors: behaviors.map((b) => ({ id: b.id, title: b.title, schedule: b.schedule, target: b.target })) };
}
