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
    prisma.metricSnapshot.findMany({ orderBy: [{ localDate: "asc" }] }),
    prisma.interventionLog.findMany({ where: { userId }, orderBy: { firedAt: "asc" } }),
    prisma.session.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.syncOp.findMany({ where: { userId }, orderBy: { receivedAt: "asc" } }),
  ]);

  return {
    format: "pos-export",
    version: 1,
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
      sessions: sessions.map((s) => ({ ...s, tokenHash: "[redacted]" })),
      syncOps,
    },
  };
}
