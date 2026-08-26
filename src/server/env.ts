import { z } from "zod";

const hex32 = z.string().regex(/^[0-9a-f]{64}$/i);

const isBuildPhase =
  process.env.SKIP_ENV_VALIDATION === "1" ||
  process.env.NEXT_PHASE === "phase-production-build";

const rawEnv = isBuildPhase
  ? {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres:pos@db:5432/pos",
      DIRECT_URL:
        process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:pos@db:5432/pos",
      APP_SECRET: process.env.APP_SECRET ?? "0".repeat(64),
      SETUP_TOKEN: process.env.SETUP_TOKEN ?? "build-placeholder-token-0123456789",
      CRON_SECRET: process.env.CRON_SECRET ?? "",
    }
  : process.env;

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    APP_SECRET: hex32,
    SETUP_TOKEN: z.string().min(16),
    CRON_SECRET: z.string().optional().default(""),
  })
  .safeParse(rawEnv);

if (!env.success) {
  const missing = env.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(
    `Invalid environment configuration -> ${missing}. See .env.example.`,
  );
}

export const ENV = {
  DATABASE_URL: env.data.DATABASE_URL,
  DIRECT_URL: env.data.DIRECT_URL,
  APP_SECRET: env.data.APP_SECRET,
  SETUP_TOKEN: env.data.SETUP_TOKEN,
  CRON_SECRET: env.data.CRON_SECRET,
};
