import { handle, idempotent, json, requireSession } from "@/server/api";
import { goalCreate } from "@/server/validation";
import { createGoal, listGoalsFlat } from "@/server/services/goals";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await listGoalsFlat(s.id) });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const input = goalCreate.parse(raw);
  const { result, replayed } = await idempotent(
    s.id,
    raw?.clientOpId as string | undefined,
    "goal.create",
    () => createGoal(s.id, input),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
