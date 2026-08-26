import { handle, idempotent, json, requireSession } from "@/server/api";
import { categoryUpdate } from "@/server/validation";
import { updateCategory } from "@/server/services/categories";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  return handle(async () => {
    const s = await requireSession();
    const raw = await req.json();
    const input = categoryUpdate.parse(raw);
    const { result, replayed } = await idempotent(
      s.id,
      raw?.clientOpId as string | undefined,
      `category.update:${params.id}`,
      () => updateCategory(s.id, params.id, input),
    );
    return json(
      { data: result },
      { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
    );
  })();
}
