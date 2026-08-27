import { prisma } from "../db";
import { ApiError, audit } from "../api";

export const DELETE_CONFIRMATION = "DELETE EVERYTHING";

/**
 * P0 deletion flow (§15). Destructive, atomic, audited.
 *
 * - Requires exact confirmation phrase.
 * - Deletes every row owned by the principal across all tables (FK-safe order;
 *   goal self-references are severed first).
 * - metric_snapshots: day-fact rows are instance-scoped (single principal by
 *   design), so they are wiped with the account to prevent ghost history for
 *   any future re-bootstrap. Documented deviation from naive per-user scoping.
 * - Leaves ONE tombstone audit row with no payload.
 * - Sessions die with the user; the caller must also clear the cookie.
 */
export async function deleteEverything(
  userId: string,
  confirmation: string,
): Promise<{ deleted: true }> {
  if (confirmation !== DELETE_CONFIRMATION) {
    throw new ApiError(400, "confirmation_required", `Type "${DELETE_CONFIRMATION}" to confirm`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "not_found", "Account not found");

  await prisma.$transaction(async (tx) => {
    await tx.financialEntry.deleteMany({ where: { userId } });
    await tx.savingsGoal.deleteMany({ where: { userId } });
    await tx.financialAccount.deleteMany({ where: { userId } });
    await tx.readinessRequirement.deleteMany({ where: { userId } });
    await tx.readinessDimension.deleteMany({ where: { userId } });
    await tx.targetStateRequirement.deleteMany({ where: { userId } });
    await tx.taskSkillLink.deleteMany({ where: { userId } });
    await tx.goalSkillLink.deleteMany({ where: { userId } });
    await tx.skillEvidence.deleteMany({ where: { userId } });
    await tx.skillDependency.deleteMany({ where: { userId } });
    await tx.skill.deleteMany({ where: { userId } });
    await tx.stateItem.deleteMany({ where: { userId } });
    await tx.personalProfile.deleteMany({ where: { userId } });
    await tx.categoryHistory.deleteMany({ where: { category: { userId } } });
    await tx.timeEntry.deleteMany({ where: { userId } });
    await tx.planInstance.deleteMany({ where: { userId } });
    await tx.event.deleteMany({ where: { userId } });
    await tx.reflection.deleteMany({ where: { userId } });
    await tx.measurement.deleteMany({ where: { userId } });
    await tx.interventionLog.deleteMany({ where: { userId } });
    await tx.syncOp.deleteMany({ where: { userId } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.behavior.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    // Goal tree self-reference: sever parents, then delete.
    await tx.goal.updateMany({ where: { userId }, data: { parentId: null } });
    await tx.goal.deleteMany({ where: { userId } });
    await tx.metricSnapshot.deleteMany({});
    await tx.user.delete({ where: { id: userId } });
  });

  // Tombstone after the fact: audit_log has no FK to users.
  await audit(userId, "delete_all", "user", userId);

  return { deleted: true };
}
