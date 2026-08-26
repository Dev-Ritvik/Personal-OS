import { handle, idempotent, json, requireSession } from "@/server/api";
import { z } from "zod";
import { taskUpdate } from "@/server/validation";
import { updateTask } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = taskUpdate.parse(raw);
    const { result, replayed } = await idempotent(
      s.id,
      raw?.clientOpId as string | undefined,
      `task.update:${params.id}`,
      () => updateTask(s.id, params.id, input),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}

/** POST defer — measured postponement (AC3). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = z
      .object({
        newDueDate: z.string(),
        reason: z.string().max(400).optional(),
        clientOpId: z.string().uuid().optional(),
      })
      .parse(raw);
    const { deferTask } = await import("@/server/services/tasks");
    const { result, replayed } = await idempotent(
      s.id,
      input.clientOpId,
      `task.defer:${params.id}`,
      () =>
        deferTask(s.id, params.id, {
          newDueDate: input.newDueDate,
          reason: input.reason,
        }),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}
