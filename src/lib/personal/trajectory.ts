/**
 * Target-state trajectory — deterministic, evidence-based.
 *
 * Builds a timeline NOW → Nov 2026 → Early 2027 → Sep 2027 POLAND → Nov 2027 lifestyle → Masters → Settlement
 * from actual goals, readiness gaps, and financial milestones.
 *
 * No forecast AI — only schedules and gaps.
 */

export interface TrajectoryGoal {
  id: string;
  title: string;
  horizon: string;
  status: string;
  targetDate: string | null;
  progress01: number | null;
  /** Optional M11 pace evidence: if present, trajectory uses it instead of duplicating formula. */
  pace?: { status: "ok" | "insufficient_data"; value?: { pace: number } } | null;
}

export interface TrajectoryReadiness {
  key: string;
  label: string;
  status: string; // UNKNOWN, FOUNDATIONAL, DEVELOPING, READY, BLOCKED
  missing: string[];
  nextAction: string | null;
}

export interface TrajectoryFinancial {
  targetAmount: number;
  targetDate: string | null;
  progress: number | null;
  insufficient: boolean;
}

export interface TrajectoryMilestone {
  date: string; // YYYY-MM-DD
  label: string;
  kind: "goal" | "readiness" | "financial" | "lifestyle";
  status: "on_track" | "at_risk" | "blocked" | "insufficient_data" | "done";
  evidence: string;
  goalId?: string;
}

export interface TrajectoryView {
  now: string;
  milestones: TrajectoryMilestone[];
  bottlenecks: string[];
  next90Days: TrajectoryMilestone[];
  byPhase: Record<string, TrajectoryMilestone[]>;
}

const PHASES: Array<{ key: string; label: string; until: string | null }> = [
  { key: "now_nov2026", label: "NOW → Nov 2026 (QHR delivery)", until: "2026-11-01" },
  { key: "nov2026_early2027", label: "Nov 2026 → Early 2027", until: "2027-03-01" },
  { key: "early2027_sep2027", label: "Early 2027 → Sep 2027 POLAND", until: "2027-09-01" },
  { key: "sep2027_nov2027", label: "Sep 2027 → Nov 2027 lifestyle", until: "2027-11-01" },
  { key: "post_btech", label: "POST-BTECH Master's (NL/DE/CH)", until: null },
];

export function buildTrajectory(args: {
  today: string;
  goals: TrajectoryGoal[];
  readiness: TrajectoryReadiness[];
  financial: TrajectoryFinancial | null;
  currentState: Array<{ label: string; value: string }>;
  targetState: Array<{ label: string; value: string }>;
}): TrajectoryView {
  const { today, goals, readiness, financial } = args;
  const milestones: TrajectoryMilestone[] = [];

  // Goals → milestones — epistemic correction (Phase 1)
  // Uses M11 pace where available; never defaults to on_track without evidence.
  for (const g of goals) {
    if (!g.targetDate) {
      milestones.push({
        date: "2099-12-31",
        label: g.title,
        kind: "goal",
        status: g.status === "achieved" ? "done" : "insufficient_data",
        evidence: `Goal ${g.status}, no target date`,
        goalId: g.id,
      });
      continue;
    }
    const daysLeft = Math.ceil((Date.parse(g.targetDate) - Date.parse(today)) / 86400000);
    let status: TrajectoryMilestone["status"] = "insufficient_data";
    let evidence = "";
    if (g.status === "achieved") { status = "done"; evidence = "Achieved"; }
    else if (g.status === "abandoned" || g.status === "archived") { status = "blocked"; evidence = `Status ${g.status}`; }
    else if (daysLeft < 0) { status = "blocked"; evidence = `Overdue by ${Math.abs(daysLeft)}d`; }
    else if (g.pace) {
      // Prefer M11 evidence — do not duplicate formula
      if (g.pace.status === "insufficient_data") {
        status = "insufficient_data";
        evidence = `${daysLeft}d left, insufficient observation window (need ≥14d age, ≥5 points)`;
      } else if (g.pace.value && g.pace.value.pace < 0.8) {
        status = "at_risk";
        evidence = `Pace ${g.pace.value.pace.toFixed(2)}× required — inadequate velocity, ${daysLeft}d left, ${g.progress01 !== null ? Math.round(g.progress01 * 100) + "%" : "no progress"}`;
      } else if (g.pace.value) {
        status = "on_track";
        evidence = `Pace ${g.pace.value.pace.toFixed(2)}× required — adequate, ${daysLeft}d left`;
      }
    } else if (g.progress01 !== null && g.progress01 < 0.3 && daysLeft < 90) {
      status = "at_risk";
      evidence = `Progress ${Math.round(g.progress01 * 100)}% with ${daysLeft}d left`;
    } else if (g.progress01 === null) {
      status = "insufficient_data";
      evidence = `${daysLeft}d left, no progress`;
    } else if (daysLeft > 180 && g.progress01 !== null && g.progress01 < 0.5) {
      // Distant deadline but low progress with no pace evidence → cannot claim on_track
      status = "insufficient_data";
      evidence = `${Math.round(g.progress01 * 100)}% with ${daysLeft}d left — no pace evidence, cannot verify trajectory`;
    } else {
      // Fallback: sufficient progress and no pace to contradict → on_track with explicit evidence
      status = "on_track";
      evidence = `${daysLeft}d left, ${g.progress01 !== null ? Math.round(g.progress01 * 100) + "%" : "no data"}`;
    }

    milestones.push({ date: g.targetDate, label: g.title, kind: "goal", status, evidence, goalId: g.id });
  }

  // Readiness gaps → milestones (use readiness status)
  for (const r of readiness) {
    if (r.status === "READY" || r.status === "UNKNOWN") continue;
    // Map readiness to an implied due window: Sep 2027 for Poland readiness
    const due = r.key === "international" || r.key === "independent_living" || r.key === "financial" ? "2027-09-01" : "2027-11-01";
    let status: TrajectoryMilestone["status"] = r.status === "BLOCKED" ? "blocked" : r.status === "FOUNDATIONAL" ? "at_risk" : "on_track";
    milestones.push({
      date: due,
      label: `Readiness: ${r.label}`,
      kind: "readiness",
      status,
      evidence: r.missing.slice(0, 2).join(" · ") || r.nextAction || r.status,
    });
  }

  // Financial
  if (financial) {
    if (financial.insufficient) {
      milestones.push({
        date: financial.targetDate ?? "2027-09-01",
        label: `₹${financial.targetAmount.toLocaleString("en-IN")} savings`,
        kind: "financial",
        status: "insufficient_data",
        evidence: "Insufficient financial data (<3 entries)",
      });
    } else if (financial.progress !== null) {
      const p = financial.progress;
      let s: TrajectoryMilestone["status"] = "on_track";
      if (p < 0.3) s = "at_risk";
      if (p >= 1) s = "done";
      milestones.push({
        date: financial.targetDate ?? "2027-09-01",
        label: `₹${financial.targetAmount.toLocaleString("en-IN")} savings`,
        kind: "financial",
        status: s,
        evidence: `${Math.round(p * 100)}% → ₹${financial.targetAmount.toLocaleString("en-IN")}`,
      });
    }
  }

  // Lifestyle target — measurable via TargetStateRequirement + Readiness (Phase 4)
  // If lifestyle requirements exist but readiness is blocked/at_risk, lifestyle is at_risk
  const lifestyleRelevantKeys = new Set(["physical_routine", "independent_living", "financial", "international"]);
  const lifestyleReadiness = readiness.filter((r) => lifestyleRelevantKeys.has(r.key));
  const hasLifestyleReqs = lifestyleReadiness.length > 0;
  const blockedLifestyle = lifestyleReadiness.filter((r) => r.status === "BLOCKED" || r.status === "FOUNDATIONAL");
  let lifestyleStatus: TrajectoryMilestone["status"] = "on_track";
  let lifestyleEvidence = "Target state defined; gap driven by readiness";
  if (!hasLifestyleReqs) {
    lifestyleStatus = "insufficient_data";
    lifestyleEvidence = "No lifestyle requirements defined";
  } else if (blockedLifestyle.length > 0) {
    lifestyleStatus = "at_risk";
    lifestyleEvidence = blockedLifestyle.map((r) => `${r.label}: ${r.missing.slice(0, 1).join("") || r.nextAction}`).join(" · ").slice(0, 120);
  } else if (lifestyleReadiness.some((r) => r.status === "DEVELOPING")) {
    lifestyleStatus = "on_track";
    lifestyleEvidence = "Readiness developing for lifestyle components";
  }
  milestones.push({
    date: "2027-11-01",
    label: "Target lifestyle: 07:00 gym/cook → WUST → remote work → chores → reading",
    kind: "lifestyle",
    status: lifestyleStatus,
    evidence: lifestyleEvidence,
  });

  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label.localeCompare(b.label)));

  // Bottlenecks: earliest blocked/at_risk with goal/readiness
  const bottlenecks = milestones
    .filter((m) => m.status === "blocked" || m.status === "at_risk")
    .slice(0, 3)
    .map((m) => `${m.label}: ${m.evidence}`);

  const next90Days = milestones.filter((m) => {
    const d = Math.ceil((Date.parse(m.date) - Date.parse(today)) / 86400000);
    return d >= 0 && d <= 90;
  });

  const byPhase: Record<string, TrajectoryMilestone[]> = {};
  for (const ph of PHASES) {
    byPhase[ph.key] = milestones.filter((m) => {
      if (ph.until === null) return m.date > "2027-11-01";
      // include milestones whose date ≤ phase until and > previous phase until
      return m.date <= ph.until;
    });
    // Trim to phased view: remove those already assigned to earlier phases
  }
  // Re-partition cleanly by phase boundaries
  const sortedPhases = PHASES.map((p) => p.until ?? "9999-12-31");
  const cleanByPhase: Record<string, TrajectoryMilestone[]> = {};
  for (let i = 0; i < PHASES.length; i++) {
    const ph = PHASES[i]!;
    const prevUntil = i === 0 ? "0000-01-01" : sortedPhases[i - 1]!;
    const currUntil = sortedPhases[i]!;
    cleanByPhase[ph.key] = milestones.filter((m) => m.date > prevUntil && m.date <= currUntil);
  }

  return { now: today, milestones, bottlenecks, next90Days, byPhase: cleanByPhase };
}
