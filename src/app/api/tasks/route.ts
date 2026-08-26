import { handle, idempotent, json, requireSession } from "@/server/api";
import { taskCreate } from "@/server/validation";
import { createTask, listTasks } from "@/server/services/tasks";
import { todayInTz } from "@/lib/metrics/dates";

export const dynamic = "force-dynamic";

/** GET grouped lists (?date=YYYY-MM-DD optional; defaults to caller's diary day). */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const date =
    url.searchParams.get("date") ??
    todayInTz(url.searchParams.get("deviceTz") ?? s.timezone);
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
