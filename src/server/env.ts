import { z } from "zod";

const hex32 = z.string().regex(/^[0-9a-f]{64}$/i);

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_SECRET: hex32,
    SETUP_TOKEN: z.string().min(16),
    CRON_SECRET: z.string().optional().default(""),
  })
  .safeParse(process.env);

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
  APP_SECRET: env.data.APP_SECRET,
  SETUP_TOKEN: env.data.SETUP_TOKEN,
  CRON_SECRET: env.data.CRON_SECRET,
};
