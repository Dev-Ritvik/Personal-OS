import { handle, json, requireSession } from "@/server/api";
import { updateStateItem, deleteStateItem } from "@/server/services/stateItems";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  value: z.string().min(1).max(500).optional(),
  domain: z.string().min(1).max(100).optional(),
  sort: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    const body = patchSchema.parse(await req.json());
    return json({ data: await updateStateItem(s.id, params.id, body) });
  })();
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const s = await requireSession();
    await deleteStateItem(s.id, params.id);
    return json({ ok: true });
  })();
}
