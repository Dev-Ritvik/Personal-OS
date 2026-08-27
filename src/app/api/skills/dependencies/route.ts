import { handle, json, requireSession } from "@/server/api";
import { addDependency } from "@/server/services/skills";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ skillId: z.string().uuid(), dependsOnSkillId: z.string().uuid() });

export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const body = bodySchema.parse(await req.json());
  return json({ data: await addDependency(s.id, body.skillId, body.dependsOnSkillId) });
});
