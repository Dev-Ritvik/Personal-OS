import { handle, idempotent, json, requireSession } from "@/server/api";
import { z } from "zod";
import { behaviorUpdate, behaviorTargetSchema, scheduleSchema } from "@/server/validation";
import { behaviorHistory, updateBehavior } from "@/server/services/behaviors";
import { todayInTz } from "@/lib/metrics/dates";

export const dynamic = "force-dynamic";

const updateInput = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    goalId: z.string().uuid().nullish(),
    categoryId: z.string().uuid().nullish(),
    schedule: scheduleSchema.optional(),
    target: behaviorTargetSchema.optional(),
    status: z.enum(["draft", "active", "paused", "retired"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Empty update");

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = updateInput.parse(raw);
    const deviceTz = new URL(req.url).searchParams.get("deviceTz");
    const todayLocal = todayInTz(deviceTz ?? s.timezone);
    const { result, replayed } = await idempotent(
      s.id,
      raw?.clientOpId as string | undefined,
      `behavior.update:${params.id}`,
      () => updateBehavior(s.id, params.id, input, { todayLocal }),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}

/** GET history heat-strip data (?days=60). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const days = Math.min(
      180,
      Number(new URL(req.url).searchParams.get("days") ?? "60") || 60,
    );
    void (await requireSession());
    return json({ data: await behaviorHistory(s.id, params.id, days) });
  })();
}
