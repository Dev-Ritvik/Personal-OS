import { handle, json, requireSession } from "@/server/api";
import { listEntries, createEntry } from "@/server/services/financials";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  return json({
    data: await listEntries(s.id, {
      kind: url.searchParams.get("kind") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    }),
  });
});

const createSchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  amount: z.number().positive(),
  occurredOn: z.string(),
  category: z.string().max(100).nullish(),
  note: z.string().max(500).nullish(),
  linkedGoalId: z.string().uuid().nullish(),
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const body = createSchema.parse(await req.json());
  return json({ data: await createEntry(s.id, body) });
});
