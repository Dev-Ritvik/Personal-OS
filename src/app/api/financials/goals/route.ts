import { handle, json, requireSession } from "@/server/api";
import { listSavingsGoals, createSavingsGoal } from "@/server/services/financials";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await listSavingsGoals(s.id) });
});

const createSchema = z.object({ title: z.string().min(1).max(200), targetAmount: z.number().positive(), targetDate: z.string().nullish() });

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const body = createSchema.parse(await req.json());
  return json({ data: await createSavingsGoal(s.id, body) });
});
