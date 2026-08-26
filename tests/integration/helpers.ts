import { execSync } from "node:child_process";
import { prisma } from "@/server/db";

let checked: Promise<boolean> | null = null;

/** Ensure the test DB exists + schema applied. Returns false when unavailable. */
export function ensureTestDb(): Promise<boolean> {
  checked ??= (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      try {
        // Create database, then push schema. Best-effort; skip suites on failure.
        execSync(
          `docker exec pos-db-dev psql -U postgres -c "CREATE DATABASE pos_test"`,
          { stdio: "ignore" },
        );
      } catch {
        /* may already exist */
      }
      try {
        execSync("npx prisma db push --skip-generate", {
          stdio: "ignore",
          env: { ...process.env },
        });
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    }
  })();
  return checked;
}

const TABLES = [
  "audit_log",
  "sync_ops",
  "sessions",
  "intervention_log",
  "metric_snapshots",
  "reflections",
  "events",
  "measurements",
  "time_entries",
  "plan_instances",
  "category_history",
  "tasks",
  "behaviors",
  "goals",
  "categories",
  "users",
] as const;

export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.join(", ")} CASCADE`);
}

export async function makeUser(overrides: Partial<{ timezone: string }> = {}) {
  const { uuidv7 } = await import("@/server/ids");
  return prisma.user.create({
    data: {
      id: uuidv7(),
      email: `it-${crypto.randomUUID().slice(0, 8)}@local.test`,
      passwordHash: "s1$x",
      timezone: overrides.timezone ?? "UTC",
    },
  });
}
