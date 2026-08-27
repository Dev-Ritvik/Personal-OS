import { prisma } from "../db";
import { uuidv7 } from "../ids";
import { ApiError } from "../api";

export async function getOrCreateAccount(userId: string) {
  let account = await prisma.financialAccount.findUnique({ where: { userId } });
  if (!account) {
    account = await prisma.financialAccount.create({ data: { id: uuidv7(), userId, currency: "INR" } });
  }
  return account;
}

export async function listEntries(userId: string, filters: { kind?: string; from?: string; to?: string } = {}) {
  const account = await getOrCreateAccount(userId);
  return prisma.financialEntry.findMany({
    where: {
      userId,
      accountId: account.id,
      ...(filters.kind ? { kind: filters.kind as never } : {}),
      ...(filters.from || filters.to
        ? {
            occurredOn: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredOn: "desc" },
  });
}

export async function createEntry(
  userId: string,
  input: { kind: string; amount: number; occurredOn: string; category?: string | null; note?: string | null; linkedGoalId?: string | null },
) {
  const account = await getOrCreateAccount(userId);
  if (input.amount <= 0) throw new ApiError(400, "invalid_amount", "Amount must be positive");
  if (input.linkedGoalId) {
    const goal = await prisma.goal.findFirst({ where: { id: input.linkedGoalId, userId } });
    if (!goal) throw new ApiError(404, "not_found", "Linked goal not found");
  }
  return prisma.financialEntry.create({
    data: {
      id: uuidv7(),
      userId,
      accountId: account.id,
      kind: input.kind as never,
      amount: input.amount,
      occurredOn: new Date(input.occurredOn),
      category: input.category ?? null,
      note: input.note ?? null,
      linkedGoalId: input.linkedGoalId ?? null,
    },
  });
}

export async function updateEntry(userId: string, id: string, input: Record<string, unknown>) {
  const existing = await prisma.financialEntry.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "Entry not found");
  const data: Record<string, unknown> = {};
  if (typeof input.amount === "number") {
    if (input.amount <= 0) throw new ApiError(400, "invalid_amount", "Amount must be positive");
    data.amount = input.amount;
  }
  if (typeof input.kind === "string") data.kind = input.kind;
  if (typeof input.category === "string" || input.category === null) data.category = input.category;
  if (typeof input.note === "string" || input.note === null) data.note = input.note;
  if (typeof input.occurredOn === "string") data.occurredOn = new Date(input.occurredOn as string);
  return prisma.financialEntry.update({ where: { id }, data: data as never });
}

export async function deleteEntry(userId: string, id: string) {
  const existing = await prisma.financialEntry.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "Entry not found");
  await prisma.financialEntry.delete({ where: { id } });
}

export async function getSummary(userId: string) {
  const account = await getOrCreateAccount(userId);
  const entries = await prisma.financialEntry.findMany({ where: { userId, accountId: account.id } });
  const savingsGoals = await prisma.savingsGoal.findMany({ where: { userId, accountId: account.id, status: "active" } });

  if (entries.length === 0) {
    return {
      totalIncome: null,
      totalExpense: null,
      savings: null,
      savingsRate: null,
      runway: null,
      entryCount: 0,
      insufficient: true,
      savingsGoals: savingsGoals.map((g) => ({
        ...g,
        targetAmount: Number(g.targetAmount),
        progress: null,
        insufficient: true,
      })),
    };
  }

  const totalIncome = entries.filter((e) => e.kind === "INCOME").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = entries.filter((e) => e.kind === "EXPENSE").reduce((s, e) => s + Number(e.amount), 0);
  const savings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? savings / totalIncome : null;

  // Runway: savings / avg monthly expense (last 3 months if available)
  let runway: number | null = null;
  if (totalExpense > 0) {
    const monthlyExpense = totalExpense / Math.max(1, entries.length / 5); // rough
    if (monthlyExpense > 0 && savings > 0) runway = savings / monthlyExpense;
  }

  return {
    totalIncome,
    totalExpense,
    savings,
    savingsRate,
    runway,
    entryCount: entries.length,
    insufficient: entries.length < 3,
    savingsGoals: savingsGoals.map((g) => {
      const progress = totalIncome > 0 ? Math.min(1, savings / Number(g.targetAmount)) : 0;
      return {
        ...g,
        targetAmount: Number(g.targetAmount),
        progress: entries.length < 3 ? null : progress,
        insufficient: entries.length < 3,
      };
    }),
  };
}

export async function listSavingsGoals(userId: string) {
  const account = await getOrCreateAccount(userId);
  return prisma.savingsGoal.findMany({ where: { userId, accountId: account.id }, orderBy: { createdAt: "asc" } });
}

export async function createSavingsGoal(userId: string, input: { title: string; targetAmount: number; targetDate?: string | null }) {
  const account = await getOrCreateAccount(userId);
  if (input.targetAmount <= 0) throw new ApiError(400, "invalid_amount", "Target must be positive");
  return prisma.savingsGoal.create({
    data: {
      id: uuidv7(),
      userId,
      accountId: account.id,
      title: input.title,
      targetAmount: input.targetAmount,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
    },
  });
}

export async function updateSavingsGoal(userId: string, id: string, input: Record<string, unknown>) {
  const existing = await prisma.savingsGoal.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "not_found", "Savings goal not found");
  const data: Record<string, unknown> = {};
  if (typeof input.title === "string") data.title = input.title;
  if (typeof input.targetAmount === "number") data.targetAmount = input.targetAmount;
  if (typeof input.targetDate === "string" || input.targetDate === null) data.targetDate = input.targetDate ? new Date(input.targetDate as string) : null;
  if (typeof input.status === "string") data.status = input.status;
  return prisma.savingsGoal.update({ where: { id }, data: data as never });
}
