/**
 * Adaptive task prioritization — deterministic, no fake scores.
 *
 * Ranks tasks by:
 *  - goal deadline proximity
 *  - target-state relevance (via Goal → Skill → Task graph)
 *  - deferral history (chronic ≥3)
 *  - goal status/bonus for deadline-critical
 *
 * Every output is ordered, not scored 0-100. No composite productivity score.
 */

export interface PrioritizableTask {
  id: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  deferredCount: number;
  status: string;
  goalId: string | null;
  estimateMin: number | null;
}

export interface GoalContext {
  id: string;
  title: string;
  status: string;
  targetDate: string | null; // YYYY-MM-DD
  horizon: string; // life|annual|quarterly
  progress01: number | null;
}

export interface RankedTask extends PrioritizableTask {
  rank: number;
  reason: string;
  goal: GoalContext | null;
  urgency: "overdue" | "today" | "upcoming" | "no-date";
  isChronic: boolean;
}

function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null;
  return Math.ceil((Date.parse(due) - Date.parse(today)) / 86400000);
}

function urgencyFor(task: PrioritizableTask, today: string): RankedTask["urgency"] {
  if (!task.dueDate) return "no-date";
  const d = daysUntil(task.dueDate, today);
  if (d === null) return "no-date";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  return "upcoming";
}

function goalUrgencyScore(goal: GoalContext | null, today: string): number {
  if (!goal || !goal.targetDate || goal.status !== "active") return 0;
  const days = daysUntil(goal.targetDate, today);
  if (days === null) return 0;
  if (days < 0) return 100; // overdue goal
  if (days <= 7) return 80;
  if (days <= 30) return 60;
  if (days <= 90) return 40;
  if (days <= 180) return 20;
  return 5;
}

function progressDeficitScore(progress01: number | null): number {
  if (progress01 === null) return 10; // unknown → moderate
  if (progress01 < 0.3) return 30;
  if (progress01 < 0.5) return 20;
  if (progress01 < 0.8) return 10;
  return 0;
}

export function prioritizeTasks(
  tasks: PrioritizableTask[],
  goalsById: Map<string, GoalContext>,
  today: string,
): RankedTask[] {
  const scored = tasks.map((t) => {
    const goal = t.goalId ? (goalsById.get(t.goalId) ?? null) : null;
    const urg = urgencyFor(t, today);
    const isChronic = t.deferredCount >= 3;
    let score = 0;
    let reason = "";

    // 1. Urgency bucket (overdue highest)
    if (urg === "overdue") { score += 100; reason = "Overdue"; }
    else if (urg === "today") { score += 70; reason = "Due today"; }
    else if (urg === "upcoming") {
      const d = daysUntil(t.dueDate, today)!;
      if (d <= 3) { score += 50; reason = `Due in ${d}d`; }
      else if (d <= 7) { score += 30; reason = `Due in ${d}d`; }
      else { score += 10; reason = `Due in ${d}d`; }
    } else { score += 5; reason = "No date"; }

    // 2. Goal deadline proximity
    const gScore = goalUrgencyScore(goal, today);
    score += gScore;
    if (gScore > 0 && goal) reason += ` · goal ${goal.title.slice(0, 24)} due ${goal.targetDate}`;

    // 3. Chronic deferral penalty/bonus for attention (high value to surface)
    if (isChronic) {
      score += 25;
      reason += " · repeatedly deferred (needs decision)";
    } else if (t.deferredCount > 0) {
      score += 5;
    }

    // 4. Progress deficit
    const deficit = progressDeficitScore(goal?.progress01 ?? null);
    score += deficit;

    // 5. Horizon weight — quarterly > annual > life for today's execution
    if (goal) {
      if (goal.horizon === "quarterly") score += 8;
      else if (goal.horizon === "annual") score += 5;
      else if (goal.horizon === "life") score += 2;
    }

    // Small tie-breaker: lower estimate first (quick wins) is NOT assumed — we prefer explicit estimate neutrality
    // Use deferredCount as secondary (higher deferred first within same urgency)

    return { task: t, score, reason: reason.trim(), goal, urgency: urg, isChronic };
  });

  // Sort: score desc, then chronic desc, then dueDate asc, then title
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.task.deferredCount >= 3 ? 1 : 0) !== (a.task.deferredCount >= 3 ? 1 : 0)) {
      return (b.task.deferredCount >= 3 ? 1 : 0) - (a.task.deferredCount >= 3 ? 1 : 0);
    }
    const da = a.task.dueDate ?? "9999-12-31";
    const db = b.task.dueDate ?? "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return a.task.title.localeCompare(b.task.title);
  });

  return scored.map((s, idx) => ({
    ...s.task,
    rank: idx + 1,
    reason: s.reason,
    goal: s.goal,
    urgency: s.urgency,
    isChronic: s.isChronic,
  }));
}

export function partitionByUrgency(ranked: RankedTask[]): {
  overdue: RankedTask[];
  today: RankedTask[];
  upcoming: RankedTask[];
  backlog: RankedTask[];
} {
  return {
    overdue: ranked.filter((r) => r.urgency === "overdue"),
    today: ranked.filter((r) => r.urgency === "today"),
    upcoming: ranked.filter((r) => r.urgency === "upcoming"),
    backlog: ranked.filter((r) => r.urgency === "no-date"),
  };
}
