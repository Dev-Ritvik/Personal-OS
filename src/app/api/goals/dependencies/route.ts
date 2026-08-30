import { handle, json, requireSession } from "@/server/api";
import { listGoalDependencies, addGoalDependency, removeGoalDependency } from "@/server/services/goalDependencies";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireSession();
  return json({ data: await listGoalDependencies(s.id) });
});

const postSchema = z.object({ goalId: z.string(), dependsOnGoalId: z.string() });

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const body = postSchema.parse(await req.json());
  const data = await addGoalDependency(s.id, body.goalId, body.dependsOnGoalId);
  return json({ data }, { status: 201 });
});

export const DELETE = handle(async (req: Request) => {
  const s = await requireSession();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new Error("Missing id");
  await removeGoalDependency(s.id, id);
  return json({ ok: true });
});
