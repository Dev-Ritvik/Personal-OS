/**
 * Seed demo data (idempotent-ish): requires a bootstrapped account.
 * Creates a sample goal tree + behavior + tasks so the UI is never empty
 * on first login. Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function id() {
  return crypto.randomUUID().replace(/^.{12}/, (m) => {
    // cheap uuidv7-ish prefix for sortability in seeds; not security-relevant
    const ts = Date.now().toString(16).padStart(12, "0");
    void m;
    return ts;
  });
}

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No user found. Complete /bootstrap first.");
    process.exit(1);
  }
  console.log("Seeding for", user.email);

  const cat = await prisma.category.findFirst({ where: { userId: user.id } });

  const lifeId = id();
  await prisma.goal.create({
    data: {
      id: lifeId,
      userId: user.id,
      title: "Build durable systems for work and health",
      horizon: "life",
      kind: "objective",
      measureType: "binary",
      status: "active",
      startDate: new Date(),
    },
  });
  const annualId = id();
  await prisma.goal.create({
    data: {
      id: annualId,
      userId: user.id,
      parentId: lifeId,
      title: "Ship POS v1 and train 3×/week consistently",
      horizon: "annual",
      kind: "objective",
      measureType: "binary",
      status: "active",
      startDate: new Date(),
      targetDate: new Date(Date.now() + 365 * 86_400_000),
    },
  });
  await prisma.goal.create({
    data: {
      id: id(),
      userId: user.id,
      parentId: annualId,
      title: "POS v1 production build",
      horizon: "quarterly",
      kind: "project",
      measureType: "deadline",
      unit: "milestones",
      targetValue: 5,
      status: "active",
      startDate: new Date(),
      targetDate: new Date(Date.now() + 90 * 86_400_000),
    },
  });

  await prisma.behavior.create({
    data: {
      id: id(),
      userId: user.id,
      goalId: annualId,
      categoryId: cat?.id ?? null,
      title: "Strength training",
      schedule: { type: "weekly", days: [1, 3, 5] },
      target: { unit: "minutes", aggregation: "minutes", perDay: 40 },
      status: "active",
      startedOn: new Date(),
    },
  });
  await prisma.behavior.create({
    data: {
      id: id(),
      userId: user.id,
      goalId: null,
      categoryId: null,
      title: "Evening review",
      schedule: { type: "daily" },
      target: { unit: "times", aggregation: "count", perDay: 1 },
      status: "active",
      startedOn: new Date(),
    },
  });

  await prisma.task.createMany({
    data: [
      { id: id(), userId: user.id, goalId: annualId, title: "Configure waking hours & categories in Settings", dueDate: new Date(), priority: 1 },
      { id: id(), userId: user.id, title: "Log one real timer session today", dueDate: new Date(), estimateMin: 25 },
      { id: id(), userId: user.id, title: "Define your real quarterly objective", dueDate: new Date(Date.now() + 2 * 86_400_000) },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
