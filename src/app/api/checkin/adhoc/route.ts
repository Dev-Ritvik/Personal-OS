import { handle, idempotent, json, requireSession } from "@/server/api";
import { adHocCheckin } from "@/server/validation";
import { adHocCheckin as adHoc } from "@/server/services/plans";

export const dynamic = "force-dynamic";

/** POST unscheduled execution (surplus counts, never punished). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const input = adHocCheckin.parse(raw);
  const { result, replayed } = await idempotent(
    s.id,
    raw?.clientOpId as string | undefined,
    `plan.adhoc:${input.behaviorId}:${input.date}`,
    () => adHoc(s.id, input.behaviorId, input.date, input),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
