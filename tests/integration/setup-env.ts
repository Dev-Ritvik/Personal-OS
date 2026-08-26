/**
 * Integration-suite environment. Runs BEFORE any test module import so that
 * `src/server/env.ts` validation and the Prisma datasource resolve against
 * the ISOLATED test database, never the dev database.
 *
 * If the test database is unreachable the suites self-skip (reported honestly
 * rather than failing the whole run).
 */
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:pos@localhost:5433/pos_test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_SECRET =
  process.env.APP_SECRET ?? "3a1f".repeat(16); // 64 hex chars
process.env.SETUP_TOKEN =
  process.env.SETUP_TOKEN ?? "integration-setup-token-0123456789";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL!;
export const SETUP_TOKEN = process.env.SETUP_TOKEN!;
