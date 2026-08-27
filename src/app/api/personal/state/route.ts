import { handle, json, requireSession } from "@/server/api";
import { listStateItems, createStateItem } from "@/server/services/stateItems";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const kind = new URL(req.url).searchParams.get("kind") ?? undefined;
  return json({ data: await listStateItems(s.id, kind) });
});

const createSchema = z.object({
  kind: z.enum(["CURRENT", "TARGET"]),
  domain: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  value: z.string().min(1).max(500),
  sort: z.number().int().optional(),
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const body = createSchema.parse(await req.json());
  return json({ data: await createStateItem(s.id, body) });
});
