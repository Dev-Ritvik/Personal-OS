import { handle, idempotent, json, requireSession } from "@/server/api";
import { behaviorCreate } from "@/server/validation";
import { createBehavior, listBehaviors } from "@/server/services/behaviors";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await listBehaviors(s.id) });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const input = behaviorCreate.parse(raw);
  const { result, replayed } = await idempotent(
    s.id,
    raw?.clientOpId as string | undefined,
    "behavior.create",
    () => createBehavior(s.id, input),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
