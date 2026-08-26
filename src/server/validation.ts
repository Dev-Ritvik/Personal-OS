import { z } from "zod";
import { isValidLocalDate } from "@/lib/metrics/dates";

/** Shared request schemas — one source of truth for client & server. */

const localDate = z
  .string()
  .refine(isValidLocalDate, "Expected 'YYYY-MM-DD' calendar date");

export const ianaTz = z
  .string()
  .max(64)
  .refine((s) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA timezone");

export const valueClassSchema = z.enum([
  "productive",
  "maintenance",
  "intentional_leisure",
  "unproductive",
  "neutral",
]);

// ---- bootstrap / auth -------------------------------------------------

export const bootstrapInput = z.object({
  setupToken: z.string().min(1),
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  timezone: ianaTz,
});

export const loginInput = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export const totpInput = z.object({ code: z.string().regex(/^\d{6}$/) });

export const challengeInput = z.object({ challengeId: z.string().uuid() });

export const settingsUpdate = z.object({
  timezone: ianaTz.optional(),
  wakingStartMin: z.number().int().min(0).max(1439).optional(),
  wakingEndMin: z.number().int().min(1).max(1440).optional(),
  prefs: z.record(z.unknown()).optional(),
}).refine((v) => {
  if (v.wakingStartMin !== undefined && v.wakingEndMin !== undefined) {
    return v.wakingEndMin > v.wakingStartMin;
  }
  return true;
}, "waking_end_min must exceed waking_start_min");

// ---- categories --------------------------------------------------------

export const categoryCreate = z.object({
  name: z.string().trim().min(1).max(80),
  valueClass: valueClassSchema,
  sort: z.number().int().optional(),
});

export const categoryUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  valueClass: valueClassSchema.optional(),
  sort: z.number().int().optional(),
  archived: z.boolean().optional(),
});

// ---- goals --------------------------------------------------------------

export const goalCreate = z.object({
  parentId: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(4000).nullish(),
  horizon: z.enum(["life", "annual", "quarterly"]),
  kind: z.enum(["objective", "project", "milestone"]),
  measureType: z.enum([
    "binary", "quantity", "duration", "frequency",
    "percentage", "milestone", "deadline", "cumulative", "rate",
  ]),
  unit: z.string().max(40).nullish(),
  targetValue: z.number().finite().positive().max(1e9).nullish(),
  direction: z.enum(["at_least", "at_most"]).default("at_least"),
  startDate: localDate.nullish(),
  targetDate: localDate.nullish(),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
});

export const goalUpdate = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(4000).nullish(),
  unit: z.string().max(40).nullish(),
  targetValue: z.number().finite().positive().max(1e9).nullish(),
  direction: z.enum(["at_least", "at_most"]).optional(),
  startDate: localDate.nullish(),
  targetDate: localDate.nullish(),
  status: z
    .enum(["draft", "active", "paused", "achieved", "abandoned", "archived"])
    .optional(),
  closingValue: z.number().finite().max(1e9).nullish(),
  sort: z.number().int().optional(),
});

// ---- behaviors ----------------------------------------------------------

export const scheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("weekly"),
    /** ISO weekdays 1=Mon … 7=Sun */
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  }),
  z.object({
    type: z.literal("times_per_week"),
    n: z.number().int().min(1).max(7),
  }),
]);

export const behaviorTargetSchema = z.object({
  unit: z.string().max(40).default("times"),
  aggregation: z.enum(["count", "minutes", "sum"]).default("count"),
  perDay: z.number().positive().max(10000).nullish(),
  weeklyMin: z.number().positive().max(10000).nullish(),
});

export const behaviorCreate = z.object({
  title: z.string().trim().min(1).max(160),
  goalId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  schedule: scheduleSchema,
  target: behaviorTargetSchema,
  startedOn: localDate.optional(),
});

export const behaviorUpdate = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  goalId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  schedule: scheduleSchema.optional(),
  target: behaviorTargetSchema.optional(),
  status: z.enum(["draft", "active", "paused", "retired"]).optional(),
});

// ---- tasks ---------------------------------------------------------------

export const taskCreate = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(4000).nullish(),
  goalId: z.string().uuid().nullish(),
  behaviorId: z.string().uuid().nullish(),
  estimateMin: z.number().int().min(1).max(24 * 60).nullish(),
  dueDate: localDate.nullish(),
  priority: z.number().int().min(-2).max(2).optional(),
});

export const taskUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(4000).nullish(),
  estimateMin: z.number().int().min(1).max(24 * 60).nullish(),
  dueDate: localDate.nullish(),
  priority: z.number().int().min(-2).max(2).nullish(),
  status: z.enum(["todo", "doing", "done", "cancelled"]).optional(),
});

export const taskDefer = z.object({
  newDueDate: localDate,
  reason: z.string().max(400).optional(),
});

// ---- plan instances (check-in) -------------------------------------------

export const checkinInput = z.object({
  actualQty: z.number().finite().min(0).max(100000).nullish(),
  actualMinutes: z.number().int().min(0).max(24 * 60).nullish(),
});

export const adHocCheckin = z.object({
  behaviorId: z.string().uuid(),
  date: localDate,
  deviceTz: ianaTz.optional(),
  actualQty: z.number().finite().min(0).max(100000).nullish(),
  actualMinutes: z.number().int().min(0).max(24 * 60).nullish(),
});

// ---- time entries ---------------------------------------------------------

export const timerStart = z.object({
  categoryId: z.string().uuid().nullish(),
  taskId: z.string().uuid().nullish(),
  behaviorId: z.string().uuid().nullish(),
  note: z.string().max(500).nullish(),
  deviceId: z.string().max(80).nullish(),
  deviceTz: ianaTz.optional(),
});

export const quickLog = z.object({
  durationMin: z.number().int().min(1).max(24 * 60),
  startedAt: z.string().datetime().optional(), // defaults to now − duration
  categoryId: z.string().uuid().nullish(),
  taskId: z.string().uuid().nullish(),
  behaviorId: z.string().uuid().nullish(),
  note: z.string().max(500).nullish(),
  deviceTz: ianaTz.optional(),
});

export const entryAmend = z.object({
  durationMin: z.number().int().min(1).max(24 * 60).optional(),
  startedAt: z.string().datetime().optional(),
  categoryId: z.string().uuid().nullish(),
  taskId: z.string().uuid().nullish(),
  behaviorId: z.string().uuid().nullish(),
  note: z.string().max(500).nullish(),
  deviceTz: ianaTz.optional(),
});

// ---- misc ------------------------------------------------------------------

export const snapshotRange = z.object({
  from: localDate,
  to: localDate,
});

export type CategoryCreateInput = z.infer<typeof categoryCreate>;
export type GoalCreateInput = z.infer<typeof goalCreate>;
export type BehaviorCreateInput = z.infer<typeof behaviorCreate>;
export type TaskCreateInput = z.infer<typeof taskCreate>;
