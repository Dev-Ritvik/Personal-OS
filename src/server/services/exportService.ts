import { prisma } from "../db";

/**
 * Full-data JSON export (AC12, privacy principle P-9).
 * Every table, user-scoped, parseable and complete. Includes voided rows so
 * history remains externally reproducible.
 */
export async function exportAll(userId: string): Promise<object> {
  const [
    user,
    categories,
    categoryHistory,
    goals,
    behaviors,
    tasks,
    planInstances,
    timeEntries,
    measurements,
    events,
    reflections,
    metricSnapshots,
    interventionLog,
    sessions,
    syncOps,
    auditLog,
    personalProfile,
    stateItems,
    skills,
    skillEvidence,
    goalSkillLinks,
    taskSkillLinks,
    financialAccount,
    financialEntries,
    savingsGoals,
    readinessDimensions,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.categoryHistory.findMany({
      where: { category: { userId } },
      orderBy: { changedAt: "asc" },
    }),
    prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.behavior.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.planInstance.findMany({ where: { userId }, orderBy: [{ localDate: "asc" }] }),
    prisma.timeEntry.findMany({ where: { userId }, orderBy: [{ startedAt: "asc" }] }),
    prisma.measurement.findMany({ where: { userId }, orderBy: [{ takenOn: "asc" }] }),
    prisma.event.findMany({ where: { userId }, orderBy: [{ occurredAt: "asc" }] }),
    prisma.reflection.findMany({ where: { userId }, orderBy: [{ localDate: "asc" }] }),
    // Snapshots are instance-scoped (single principal); goal_progress rows are
    // filtered to this user's goals, day-fact rows belong to the instance.
    (async () => {
      const goalIds = (
        await prisma.goal.findMany({ where: { userId }, select: { id: true } })
      ).map((g: any) => `goal_progress:${g.id}`);
      const DAY_KEYS = [
        "waking_minutes", "planned_minutes", "executed_planned_minutes",
        "productive_minutes", "unknown_share", "behavior_scheduled",
        "behavior_met", "tasks_due", "tasks_done_on", "overdue_count",
      ];
      return prisma.metricSnapshot.findMany({
        where: { OR: [{ metricKey: { in: DAY_KEYS } }, { metricKey: { in: goalIds } }] },
        orderBy: [{ localDate: "asc" }],
      });
    })(),
    prisma.interventionLog.findMany({ where: { userId }, orderBy: { firedAt: "asc" } }),
    prisma.session.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.syncOp.findMany({ where: { userId }, orderBy: { receivedAt: "asc" } }),
    // C8: the audit trail is part of the user's history.
    prisma.auditLog.findMany({ where: { actor: userId }, orderBy: { at: "asc" } }),
    prisma.personalProfile.findUnique({ where: { userId } }),
    prisma.stateItem.findMany({ where: { userId }, orderBy: { kind: "asc" } }),
    prisma.skill.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.skillEvidence.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.goalSkillLink.findMany({ where: { userId } }),
    prisma.taskSkillLink.findMany({ where: { userId } }),
    prisma.financialAccount.findUnique({ where: { userId } }),
    prisma.financialEntry.findMany({ where: { userId }, orderBy: { occurredOn: "asc" } }),
    prisma.savingsGoal.findMany({ where: { userId } }),
    prisma.readinessDimension.findMany({ where: { userId } }),
  ]);

  return {
    format: "pos-export",
    version: 2,
    exportedAt: new Date().toISOString(),
    counts: {
      categories: categories.length,
      goals: goals.length,
      behaviors: behaviors.length,
      tasks: tasks.length,
      planInstances: planInstances.length,
      timeEntries: timeEntries.length,
      measurements: measurements.length,
      events: events.length,
      reflections: reflections.length,
      metricSnapshots: metricSnapshots.length,
      auditLog: auditLog.length,
    },
    data: {
      user: user
        ? {
            id: user.id,
            email: user.email,
            timezone: user.timezone,
            wakingStartMin: user.wakingStartMin,
            wakingEndMin: user.wakingEndMin,
            prefs: user.prefs,
            createdAt: user.createdAt,
          }
        : null,
      categories,
      categoryHistory,
      goals,
      behaviors,
      tasks,
      planInstances,
      timeEntries,
      measurements,
      events,
      reflections,
      metricSnapshots,
      interventionLog,
      sessions: sessions.map((s: any) => ({ ...s, tokenHash: "[redacted]" })),
      syncOps,
      auditLog,
      personalProfile,
      stateItems,
      skills,
      skillEvidence,
      goalSkillLinks,
      taskSkillLinks,
      financialAccount,
      financialEntries,
      savingsGoals,
      readinessDimensions,
    },
  };
}
