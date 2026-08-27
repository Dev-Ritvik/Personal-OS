/**
 * Deterministic personalization engine — rules, not LLM.
 * Every output carries reason/evidence/confidence/recommendedAction.
 * Insufficient data never fabricates certainty.
 */

export type Recommendation = {
  kind: string;
  title: string;
  reason: string;
  evidence: Record<string, string | number | null>;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  recommendedAction: string;
  epistemic: "FACT" | "INFERENCE" | "RECOMMENDATION";
};

export interface EngineInput {
  goals: Array<{ id: string; title: string; status: string; targetDate: string | null; progress01: number | null }>;
  tasks: { overdue: number; today: number; inbox: number };
  deferredCount: number;
  metrics: {
    overplanningRatio: { status: string; value?: number };
    variance: { status: string; value?: { minutes: number } };
    executionRateToday: { status: string; value?: number };
  };
  skillsNeedingEvidence: number;
  savingsProgress: { insufficient: boolean; progress: number | null };
  readinessBlocked: string[];
  today: string;
}

export function recommend(input: EngineInput): Recommendation[] {
  const out: Recommendation[] = [];

  // 1. Deadline risk
  for (const g of input.goals.filter((g) => g.status === "active" && g.targetDate)) {
    const daysLeft = Math.ceil((Date.parse(g.targetDate!) - Date.parse(input.today)) / 86400000);
    if (daysLeft <= 30 && daysLeft >= 0) {
      const progress = g.progress01 ?? 0;
      const required = (1 - progress) / Math.max(1, daysLeft);
      // If less than 50% done with <30d left, warn
      if (progress < 0.5) {
        out.push({
          kind: "deadline_risk",
          title: `Deadline risk: ${g.title}`,
          reason: `Due in ${daysLeft} days with ${Math.round(progress * 100)}% progress`,
          evidence: { goal: g.title, daysLeft, progress: Math.round(progress * 100) },
          confidence: daysLeft <= 7 ? "HIGH" : "MEDIUM",
          recommendedAction: "Focus one deep-work block on this goal today",
          epistemic: "INFERENCE",
        });
      }
    }
  }

  // 2. Overplanning
  if (input.metrics.overplanningRatio.status === "ok" && (input.metrics.overplanningRatio.value ?? 0) > 1.4) {
    out.push({
      kind: "overplanning",
      title: "Plan exceeds demonstrated capacity",
      reason: `Overplanning ratio ${(input.metrics.overplanningRatio.value as number).toFixed(2)}× baseline`,
      evidence: { ratio: Number((input.metrics.overplanningRatio.value as number).toFixed(2)) },
      confidence: "MEDIUM",
      recommendedAction: "Remove one low-priority task from today's plan",
      epistemic: "INFERENCE",
    });
  } else if (input.metrics.overplanningRatio.status !== "ok") {
    out.push({
      kind: "overplanning",
      title: "Insufficient data for capacity check",
      reason: "Not enough logged days to assess planning vs capacity",
      evidence: { insufficient: 1 },
      confidence: "INSUFFICIENT",
      recommendedAction: "Keep logging time consistently for 14 days",
      epistemic: "RECOMMENDATION",
    });
  }

  // 3. Deferral pattern
  if (input.deferredCount > 0) {
    out.push({
      kind: "deferral_pattern",
      title: `${input.deferredCount} task(s) repeatedly deferred`,
      reason: "High deferral frequency indicates planning/execution divergence",
      evidence: { deferredCount: input.deferredCount },
      confidence: "HIGH",
      recommendedAction: "Decompose or explicitly drop the most-deferred task",
      epistemic: "FACT",
    });
  }

  // 4. Stale skill evidence
  if (input.skillsNeedingEvidence > 0) {
    out.push({
      kind: "skill_evidence_gap",
      title: `${input.skillsNeedingEvidence} skill(s) need evidence`,
      reason: "Skills backing active goals have UNKNOWN level with no evidence",
      evidence: { skillsNeedingEvidence: input.skillsNeedingEvidence },
      confidence: "LOW",
      recommendedAction: "Add one evidence entry for the highest-importance UNKNOWN skill",
      epistemic: "INFERENCE",
    });
  }

  // 5. Readiness blockers
  for (const dim of input.readinessBlocked.slice(0, 2)) {
    out.push({
      kind: "readiness_blocker",
      title: `Readiness blocked: ${dim}`,
      reason: "Required skills/goals for Poland readiness not yet met",
      evidence: { dimension: dim },
      confidence: "MEDIUM",
      recommendedAction: `Open Readiness → ${dim} for next action`,
      epistemic: "INFERENCE",
    });
  }

  // 6. Financial trajectory
  if (input.savingsProgress.insufficient) {
    out.push({
      kind: "financial_insufficient",
      title: "Insufficient financial data",
      reason: "Fewer than 3 income/expense entries — cannot project trajectory",
      evidence: { insufficient: 1 },
      confidence: "INSUFFICIENT",
      recommendedAction: "Log income and expenses for one month",
      epistemic: "RECOMMENDATION",
    });
  } else if (input.savingsProgress.progress !== null && input.savingsProgress.progress < 0.3) {
    out.push({
      kind: "financial_behind",
      title: "Savings trajectory behind target",
      reason: `Progress ${(input.savingsProgress.progress * 100).toFixed(0)}% toward ₹5L`,
      evidence: { progress: Math.round((input.savingsProgress.progress ?? 0) * 100) },
      confidence: "MEDIUM",
      recommendedAction: "Review /financials for savings rate and runway",
      epistemic: "INFERENCE",
    });
  }

  // Cap at 5, insufficient cards last
  const sorted = [...out].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2, INSUFFICIENT: 3 };
    return order[a.confidence] - order[b.confidence];
  });
  return sorted.slice(0, 5);
}
