/**
 * Integration-DB bootstrap: creates pos_test in the dev Docker Postgres and
 * applies the schema. Run automatically before `test:integration`.
 *
 *   node scripts/setup-integration-db.mjs
 */
import { execSync } from "node:child_process";

const TEST_URL = "postgresql://postgres:pos@localhost:5433/pos_test";

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: opts.quiet ? "ignore" : "inherit", ...opts });
}

try {
  sh(`docker exec pos-db-dev psql -U postgres -c "CREATE DATABASE pos_test"`, { quiet: true });
  console.log("[it-db] created pos_test");
} catch {
  /* already exists */
}

console.log("[it-db] pushing schema…");
sh("npx prisma db push --skip-generate", {
  env: { ...process.env, DATABASE_URL: TEST_URL },
});
console.log("[it-db] ready:", TEST_URL);
