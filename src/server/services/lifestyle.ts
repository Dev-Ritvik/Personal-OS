import { prisma } from "../db";
import { todayInTz } from "@/lib/metrics/dates";

export async function getLifestyleGaps(userId: string, today: string) {
  const [requirements, behaviors, stateCurrent, stateTarget] = await Promise.all([
    prisma.targetStateRequirement.findMany({ where: { userId } }),
    prisma.behavior.findMany({ where: { userId, deletedAt: null, status: "active" }, select: { id: true, title: true, schedule: true, target: true } }),
    prisma.stateItem.findMany({ where: { userId, kind: "CURRENT" }, select: { label: true, value: true, domain: true } }),
    prisma.stateItem.findMany({ where: { userId, kind: "TARGET" }, select: { label: true, value: true, domain: true } }),
  ]);

  // For each behavior, aggregate PlanInstances in last 7d vs target
  const todayDate = new Date(today + "T00:00:00Z");
  const weekAgo = new Date(todayDate); weekAgo.setUTCDate(todayDate.getUTCDate() - 6);
  const gaps = [];
  for (const req of requirements) {
    const firstWord = req.requirement.toLowerCase().split(" ")[0] ?? "";
    const behavior = behaviors.find((b) => b.title.toLowerCase().includes(firstWord));
    let observed = "No data";
    let target = req.requirement;
    let status: "insufficient_data" | "at_risk" | "on_track" = "insufficient_data";
    let evidence = "No behavior scheduled";
    if (behavior) {
      const targetVal = (behavior.target as any)?.weeklyMin ?? null;
      const perDay = (behavior.target as any)?.perDay ?? null;
      const isWeekly = targetVal !== null;
      const expected = isWeekly ? targetVal : (perDay !== null ? perDay * 7 : 7);
      const unit = (behavior.target as any)?.unit ?? "sessions";
      target = `${behavior.title}: ${isWeekly ? `${targetVal}/${unit} per week` : perDay ? `${perDay}/${unit} per day` : JSON.stringify(behavior.target)}`;
      // Count PlanInstances in last 7d where behavior met
      const instances = await prisma.planInstance.findMany({
        where: {
          userId,
          refType: "behavior",
          refId: behavior.id,
          localDate: { gte: weekAgo, lte: todayDate },
          voidedAt: null,
        },
        select: { met: true, actualQty: true },
      });
      if (instances.length === 0) {
        observed = "No scheduled instances in last 7d";
        evidence = `0 PlanInstances in last 7d for "${behavior.title}"`;
        status = "insufficient_data";
      } else {
        const metCount = instances.filter((p) => p.met === true).length;
        const totalScheduled = instances.length;
        const aggregation = (behavior.target as any)?.aggregation;
        const unit = (behavior.target as any)?.unit ?? "sessions";
        let observedStr = "";
        let evidenceStr = "";
        let isOnTrack = false;
        let isInsufficient = false;

        if (isWeekly) {
          // Weekly session count: Gym 3/week, Chores 4/week
          observedStr = `${metCount}/${targetVal} ${unit}`;
          evidenceStr = `${metCount} met PlanInstances in last 7d of ${totalScheduled} scheduled`;
          isOnTrack = metCount >= (targetVal ?? 0);
          isInsufficient = totalScheduled < 3;
        } else if (perDay !== null) {
          // Quantitative daily: Walk 20 min/day → 140 min/week, Read 10 pages/day → 70 pages/week
          // For any perDay with actualQty, sum actualQty (not just met count) to handle partial completions like 5 pages
          const targetTotal = perDay * 7;
          const actualTotal = instances.reduce((sum, p) => sum + (Number(p.actualQty ?? 0) || 0), 0);
          observedStr = `${actualTotal}/${targetTotal} ${unit}`;
          evidenceStr = `${actualTotal} ${unit} in last 7d of ${targetTotal} target (${metCount} met of ${totalScheduled} scheduled)`;
          isOnTrack = actualTotal >= targetTotal;
          isInsufficient = totalScheduled < 3;
        } else {
          const targetCount = 7;
          observedStr = `${metCount}/${targetCount} days`;
          evidenceStr = `${metCount} met PlanInstances in last 7d of ${totalScheduled} scheduled`;
          isOnTrack = metCount >= targetCount;
          isInsufficient = totalScheduled < 3;
        }

        observed = observedStr;
        evidence = evidenceStr;
        if (isOnTrack) status = "on_track";
        else if (isInsufficient) status = "insufficient_data";
        else status = "at_risk";
      }
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
