import { handle, idempotent, json, requireSession } from "@/server/api";
import { categoryCreate } from "@/server/validation";
import { createCategory, listCategories } from "@/server/services/categories";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  return json({ data: await listCategories(s.id, includeArchived) });
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const raw = await req.json();
  const input = categoryCreate.parse(raw);
  const { result, replayed } = await idempotent(
    s.id,
    raw?.clientOpId as string | undefined,
    "category.create",
    () => createCategory(s.id, input),
  );
  return json(
    { data: result },
    { headers: replayed ? { "x-idempotent-replay": "true" } : undefined },
  );
});
