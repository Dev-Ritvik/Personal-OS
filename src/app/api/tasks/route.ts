import { handle, idempotent, json, requireSession } from "@/server/api";
import { taskCreate } from "@/server/validation";
import { createTask, listTasks } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

/** GET grouped lists (?date=YYYY-MM-DD for the 'today' bucket). */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const date =
    new URL(req.url).searchParams.get("date") ?? undefined;
  return json({ data: await listTasks(s.id, date) });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const input = taskCreate.parse(raw);
  const { result, replayed } = await idempotent(
    s.id,
    raw?.clientOpId as string | undefined,
    "task.create",
    () => createTask(s.id, input),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
